import type { PostHog, Properties } from "posthog-js";
import { publicEnv } from "@/lib/public-env";

// The browser's way into PostHog, for client code only.
//
// posthog-js is about 94 KB gz. Imported statically (including through
// posthog-js/react, which imports it too), it lands in the entry chunks of
// every route, and its init competes with hydration: it fires the flags and
// remote-config requests and loads the exception extension straight away.
// So nothing imports it but load below, which fetches it once the page has
// loaded and the main thread is idle. Until then, calls queue here and are
// replayed in order.
//
// It also waits for consent. PostHog sets cookies and localStorage and
// records what people do, which UK law (PECR) only allows once the visitor
// has said yes to analytics in the cookie banner (see lib/consent.ts).
// PostHogProvider passes their choice in through setAnalyticsConsent:
//
// - Until they choose, posthog-js isn't fetched and calls wait in memory.
//   Nothing is stored or sent. The queue is capped, for anyone who ignores the
//   banner through a long session.
// - Yes: posthog-js loads, straight away or mid-session, and the queue is
//   replayed.
// - No: the queue is dropped, later calls are ignored, and anything PostHog
//   left on the device is deleted. Withdrawing mid-session also opts the
//   loaded client out.
//
// Production only, like PostHogProvider, which is what calls this. Everywhere
// else (development, and the server, where this module's state would be
// shared across requests) every call is a no-op.

type Task = (posthog: PostHog) => void;

const enabled =
  process.env.NODE_ENV === "production" && typeof window !== "undefined";

// Well beyond the few pageviews and events anyone makes before answering.
const MAX_PENDING = 100;

let client: PostHog | undefined;
let pending: Task[] = [];
let status: "idle" | "loading" | "loaded" | "failed" = "idle";
/** The visitor's analytics choice, or null until they have made one. */
let consent: boolean | null = null;

/**
 * Runs `task` against the live client: now if it has loaded, otherwise once
 * it does. For anything that has to read the client's state first, which a
 * queued plain call can't (see PostHogIdentity). Dropped once the visitor
 * has said no.
 */
export function whenLoaded(task: Task) {
  if (!enabled || consent === false || status === "failed") return;
  if (client && consent) task(client);
  else if (pending.length < MAX_PENDING) pending.push(task);
}

export function capture(event: string, properties?: Properties) {
  if (client && consent) {
    client.capture(event, properties);
    return;
  }
  // Stamped now, or a queued event would carry the time it was flushed.
  const timestamp = new Date();
  whenLoaded((posthog) => posthog.capture(event, properties, { timestamp }));
}

export function captureException(error: unknown, properties?: Properties) {
  whenLoaded((posthog) => posthog.captureException(error, properties));
}

// Exception autocapture only starts at init, so an error thrown before then
// (during hydration, most likely) would go unreported. Hold on to those and
// report them once the client is up. Errors without an Error object are the
// cross-origin "Script error." kind, which carry nothing worth reporting.
function onEarlyError(event: ErrorEvent) {
  if (event.error) captureException(event.error);
}
function onEarlyRejection(event: PromiseRejectionEvent) {
  captureException(event.reason);
}
function stopBufferingErrors() {
  window.removeEventListener("error", onEarlyError);
  window.removeEventListener("unhandledrejection", onEarlyRejection);
}
if (enabled) {
  window.addEventListener("error", onEarlyError);
  window.addEventListener("unhandledrejection", onEarlyRejection);
}

/**
 * Passes in the visitor's analytics choice: true to load PostHog, false to
 * refuse or withdraw, null while they haven't chosen. Safe to call again
 * with the same value.
 */
export function setAnalyticsConsent(granted: boolean | null) {
  if (!enabled || granted === consent) return;
  consent = granted;

  if (granted) {
    if (!client) {
      load();
      return;
    }
    // Given again after being withdrawn on this page, where the client is
    // still loaded but opted out.
    client.opt_in_capturing({ captureEventName: false });
    flush(client);
    return;
  }

  if (granted === false) {
    pending = [];
    stopBufferingErrors();
  }
  // Stops everything the client does on its own (pageleave, exceptions,
  // replay) and, with `opt_out_persistence_by_default`, deletes its storage.
  client?.opt_out_capturing();
  // The opt-out is itself stored, and has to stay while the client is alive:
  // PostHog reads it back on every capture. The next page, which never loads
  // posthog-js, deletes it.
  if (granted === false) clearPostHogStorage({ keepOptOut: !!client });
}

/**
 * Fetches and initialises posthog-js after the `load` event, when the browser
 * is next idle, then flushes the queue.
 */
function load() {
  if (status !== "idle") return;
  status = "loading";

  const start = () => {
    void init();
  };
  const whenIdle = () => {
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(start, { timeout: 5000 });
    } else {
      setTimeout(start, 1);
    }
  };
  if (document.readyState === "complete") whenIdle();
  else window.addEventListener("load", whenIdle, { once: true });
}

async function init() {
  // Withdrawn while this waited for the page to load: fetch nothing. A later
  // yes starts over.
  if (!consent) {
    status = "idle";
    return;
  }

  let posthog: PostHog;
  try {
    ({ default: posthog } = await import("posthog-js"));
  } catch (error) {
    // Blocked or offline. Nothing will ever flush the queue, so stop filling it.
    console.error("Could not load analytics", error);
    status = "failed";
    pending = [];
    stopBufferingErrors();
    return;
  }
  // Or while it downloaded.
  if (!consent) {
    status = "idle";
    return;
  }

  posthog.init(publicEnv.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: publicEnv.NEXT_PUBLIC_POSTHOG_API_HOST || "https://eu.i.posthog.com",
    ui_host: publicEnv.NEXT_PUBLIC_POSTHOG_UI_HOST,
    person_profiles: "identified_only", // or 'always' to create profiles for anonymous users as well
    // PostHogPageView captures pageviews itself, on every client-side
    // navigation. Automatic capture would also double-count the first one,
    // which is already in the queue.
    capture_pageview: false,
    capture_pageleave: true,
    // Client-side failures used to end at a console.error on someone else's
    // device: a mutation that never reaches Convex leaves no server log at
    // all, so there was nothing to look at afterwards. Autocapture covers
    // unhandled errors and rejections; deliberate reports go through
    // captureException above (see lib/use-display-name.ts).
    capture_exceptions: true,
    // Makes opting out (consent withdrawn mid-session) delete the cookie and
    // localStorage entry PostHog keeps, rather than leave them behind.
    opt_out_persistence_by_default: true,
  });
  // Only reached with consent, so an opt-out left behind by an earlier
  // withdrawal no longer stands.
  if (posthog.has_opted_out_capturing()) {
    posthog.opt_in_capturing({ captureEventName: false });
  }
  stopBufferingErrors();

  client = posthog;
  status = "loaded";
  flush(posthog);
}

function flush(posthog: PostHog) {
  const queued = pending;
  pending = [];
  for (const task of queued) {
    // One bad call shouldn't cost the events queued behind it.
    try {
      task(posthog);
    } catch (error) {
      console.error("Could not replay an analytics call", error);
    }
  }
}

// PostHog's cookie and localStorage entry (`ph_<project key>_posthog`), its
// sessionStorage entries (`ph_<project key>_window_id` and the like), and its
// opt-out record (`__ph_opt_in_out_<project key>`).
const POSTHOG_STORAGE = /^(ph_|__ph_opt_in_out_)/;
const POSTHOG_OPT_OUT = /^__ph_opt_in_out_/;

/**
 * Deletes whatever PostHog has stored on this device. `keepOptOut` spares
 * the opt-out record, for a client that is still loaded. Exported for tests.
 */
export function clearPostHogStorage({ keepOptOut = false } = {}) {
  const matches = (key: string) =>
    POSTHOG_STORAGE.test(key) && !(keepOptOut && POSTHOG_OPT_OUT.test(key));

  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[name];
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null && matches(key)) keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
    } catch {
      // Storage throws in some privacy modes, where nothing was stored anyway.
    }
  }

  try {
    // PostHog sets its cookie on the widest domain it can (id-game.com from
    // www.id-game.com), and a cookie is only deleted by naming the domain it
    // was set on, so expire it on none, the host, and each parent domain.
    const labels = window.location.hostname.split(".");
    const domains = [""];
    for (let i = 0; i < labels.length - 1; i++) {
      domains.push(`; Domain=${labels.slice(i).join(".")}`);
    }
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0].trim();
      if (!name || !matches(name)) continue;
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
      }
    }
  } catch {
    // As above.
  }
}
