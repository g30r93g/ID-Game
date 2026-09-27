import type { PostHog, Properties } from "posthog-js";
import { publicEnv } from "@/lib/public-env";

// The browser's way into PostHog, for client code only.
//
// posthog-js is about 94 KB gz. Imported statically (including through
// posthog-js/react, which imports it too), it lands in the entry chunks of
// every route, and its init competes with hydration: it fires the flags and
// remote-config requests and loads the exception extension straight away.
// So nothing imports it but loadAnalytics below, which fetches it once the
// page has loaded and the main thread is idle. Until then, calls queue here
// and are replayed in order.
//
// Production only, like PostHogProvider, which is what calls loadAnalytics.
// Everywhere else (development, and the server, where this module's state
// would be shared across requests) every call is a no-op.

type Task = (posthog: PostHog) => void;

const enabled =
  process.env.NODE_ENV === "production" && typeof window !== "undefined";

let client: PostHog | undefined;
let pending: Task[] = [];
let status: "idle" | "loading" | "loaded" | "failed" = "idle";

/**
 * Runs `task` against the live client: now if it has loaded, otherwise once
 * it does. For anything that has to read the client's state first, which a
 * queued plain call can't (see PostHogIdentity).
 */
export function whenLoaded(task: Task) {
  if (client) task(client);
  else if (enabled && status !== "failed") pending.push(task);
}

export function capture(event: string, properties?: Properties) {
  if (client) {
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
 * Fetches and initialises posthog-js after the `load` event, when the browser
 * is next idle, then flushes the queue. Safe to call more than once.
 */
export function loadAnalytics() {
  if (!enabled || status !== "idle") return;
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
  });
  stopBufferingErrors();

  client = posthog;
  status = "loaded";
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
