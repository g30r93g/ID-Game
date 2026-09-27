import { afterEach, beforeEach, expect, test, vi } from "vitest";

// A stand-in for the posthog-js singleton that records every call in order.
const calls: unknown[][] = [];
const fakePosthog = {
  init: vi.fn((...args: unknown[]) => calls.push(["init", ...args])),
  capture: vi.fn((...args: unknown[]) => calls.push(["capture", ...args])),
  captureException: vi.fn((...args: unknown[]) =>
    calls.push(["captureException", ...args]),
  ),
  identify: vi.fn((...args: unknown[]) => calls.push(["identify", ...args])),
  opt_in_capturing: vi.fn((...args: unknown[]) =>
    calls.push(["opt_in_capturing", ...args]),
  ),
  opt_out_capturing: vi.fn((...args: unknown[]) =>
    calls.push(["opt_out_capturing", ...args]),
  ),
  has_opted_out_capturing: vi.fn(() => false),
};
let failImport = false;
// Whether the module under test has asked for posthog-js at all.
let imported = false;

// Just enough of a browser for the loader: window events and idle callbacks
// are collected so each test decides when the page "loads".
let listeners: Record<string, ((event: unknown) => void)[]>;
let idleCallbacks: (() => void)[];
let readyState: string;

// Storage and cookies, seeded with what PostHog leaves behind alongside
// entries of the app's own.
const KEY = "phc_test";
function fakeStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}
let localStorage: ReturnType<typeof fakeStorage>;
let sessionStorage: ReturnType<typeof fakeStorage>;
let cookieJar: Map<string, string>;
let cookieWrites: string[];

function fire(type: string, event: unknown = {}) {
  for (const listener of [...(listeners[type] ?? [])]) listener(event);
}

async function runIdle() {
  const pending = idleCallbacks;
  idleCallbacks = [];
  for (const callback of pending) callback();
  // Let the dynamic import and init settle.
  await vi.dynamicImportSettled();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// A fresh copy of the module each time, since its state is module-level and
// whether it is enabled is decided as it loads.
async function loadModule(nodeEnv = "production") {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.resetModules();
  vi.doMock("posthog-js", () => {
    imported = true;
    if (failImport) throw new Error("blocked");
    return { default: fakePosthog };
  });
  return import("./analytics");
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  failImport = false;
  imported = false;
  fakePosthog.has_opted_out_capturing.mockReturnValue(false);
  listeners = {};
  idleCallbacks = [];
  readyState = "loading";
  localStorage = fakeStorage({
    [`ph_${KEY}_posthog`]: "{}",
    [`__ph_opt_in_out_${KEY}`]: "1",
    "id-game:remembered-account": "{}",
  });
  sessionStorage = fakeStorage({ [`ph_${KEY}_window_id`]: "w1" });
  cookieJar = new Map([
    [`ph_${KEY}_posthog`, "%7B%7D"],
    ["cookie_consent", "%7B%7D"],
  ]);
  cookieWrites = [];
  vi.stubGlobal("window", {
    localStorage,
    sessionStorage,
    location: { hostname: "www.id-game.com" },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== listener);
    },
    requestIdleCallback: (callback: () => void) => {
      idleCallbacks.push(callback);
    },
  });
  vi.stubGlobal("document", {
    get readyState() {
      return readyState;
    },
    get cookie() {
      return [...cookieJar]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
    set cookie(assignment: string) {
      cookieWrites.push(assignment);
      const [pair] = assignment.split(";");
      const name = pair.split("=")[0];
      if (/Max-Age=0/.test(assignment)) cookieJar.delete(name);
      else cookieJar.set(name, pair.slice(name.length + 1));
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("queues calls until the page has loaded, then replays them in order", async () => {
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(true);
  analytics.capture("$pageview", { $current_url: "https://example.com/" });
  analytics.whenLoaded((posthog) => posthog.identify("user_1"));
  analytics.capture("join_game", { joinCode: "ABC123" });

  // Nothing is fetched before the load event, even when the browser is idle.
  await runIdle();
  expect(calls).toEqual([]);

  fire("load");
  await runIdle();

  expect(calls.map(([name, event]) => [name, name === "init" ? "…" : event])).toEqual([
    ["init", "…"],
    ["capture", "$pageview"],
    ["identify", "user_1"],
    ["capture", "join_game"],
  ]);
});

test("stamps a queued event with the time it was captured, not flushed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const analytics = await loadModule();
  analytics.capture("new_game");

  vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
  readyState = "complete";
  analytics.setAnalyticsConsent(true);
  await runIdle();
  vi.useRealTimers();

  expect(calls[1]).toEqual([
    "capture",
    "new_game",
    undefined,
    { timestamp: new Date("2026-01-01T00:00:00Z") },
  ]);
});

test("calls go straight through once loaded", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(true);
  await runIdle();
  calls.length = 0;

  analytics.capture("game_advance", { phase: "pick-scenario" });
  expect(calls).toEqual([["capture", "game_advance", { phase: "pick-scenario" }]]);
});

test("reports errors thrown before the library loaded, then leaves them to autocapture", async () => {
  const analytics = await loadModule();
  const early = new Error("during hydration");
  fire("error", { error: early });
  fire("error", { message: "Script error." }); // cross-origin, nothing to report
  fire("unhandledrejection", { reason: "rejected" });

  readyState = "complete";
  analytics.setAnalyticsConsent(true);
  await runIdle();
  expect(calls.filter(([name]) => name === "captureException")).toEqual([
    ["captureException", early, undefined],
    ["captureException", "rejected", undefined],
  ]);

  // posthog-js's own exception autocapture owns these from here.
  expect(listeners.error).toEqual([]);
  expect(listeners.unhandledrejection).toEqual([]);
});

test("loads only once, however often consent is passed in", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(true);
  analytics.setAnalyticsConsent(true);
  await runIdle();
  expect(fakePosthog.init).toHaveBeenCalledTimes(1);
});

test("drops the queue and stops queueing when the library can't load", async () => {
  failImport = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  readyState = "complete";
  const analytics = await loadModule();
  analytics.capture("new_game");
  analytics.setAnalyticsConsent(true);
  await runIdle();

  const task = vi.fn();
  analytics.whenLoaded(task);
  expect(task).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
});

test("does nothing outside production", async () => {
  readyState = "complete";
  const analytics = await loadModule("development");
  const task = vi.fn();
  analytics.whenLoaded(task);
  analytics.capture("new_game");
  analytics.setAnalyticsConsent(true);
  await runIdle();

  expect(task).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
  expect(imported).toBe(false);
  expect(listeners.error).toBeUndefined();
});

// Consent (see lib/consent.ts).

test("never fetches posthog-js before the visitor has chosen", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(null);
  analytics.capture("$pageview");
  analytics.whenLoaded((posthog) => posthog.identify("user_1"));
  fire("load");
  await runIdle();

  expect(imported).toBe(false);
  expect(calls).toEqual([]);
  // Nor touches what is already stored.
  expect(localStorage.map.size).toBe(3);
  expect(cookieWrites).toEqual([]);
});

test("loads when consent is given mid-session, and replays what waited", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.capture("$pageview", { $pathname: "/" });
  await runIdle();
  expect(imported).toBe(false);

  analytics.setAnalyticsConsent(true);
  await runIdle();

  expect(imported).toBe(true);
  expect(calls.map(([name, event]) => [name, name === "init" ? "…" : event])).toEqual([
    ["init", "…"],
    ["capture", "$pageview"],
  ]);
  // Configured so that opting out later also deletes PostHog's storage.
  expect(fakePosthog.init.mock.calls[0][1]).toMatchObject({
    opt_out_persistence_by_default: true,
  });
});

test("keeps at most 100 calls in memory while waiting for an answer", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  for (let i = 0; i < 150; i++) analytics.capture(`event_${i}`);

  analytics.setAnalyticsConsent(true);
  await runIdle();

  const captured = calls.filter(([name]) => name === "capture");
  expect(captured).toHaveLength(100);
  expect(captured[0][1]).toBe("event_0");
});

test("drops everything queued, and everything after, when consent is refused", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.capture("$pageview");
  analytics.whenLoaded((posthog) => posthog.identify("user_1"));

  analytics.setAnalyticsConsent(false);
  analytics.capture("new_game");
  const task = vi.fn();
  analytics.whenLoaded(task);
  await runIdle();

  expect(imported).toBe(false);
  expect(task).not.toHaveBeenCalled();
  // Buffered early errors go too.
  expect(listeners.error).toEqual([]);

  // A later yes starts from nothing: the refused calls are gone for good.
  analytics.setAnalyticsConsent(true);
  await runIdle();
  expect(calls.map(([name]) => name)).toEqual(["init"]);
});

test("refusing deletes whatever PostHog left on the device, and nothing else", async () => {
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(false);

  expect([...localStorage.map.keys()]).toEqual(["id-game:remembered-account"]);
  expect([...sessionStorage.map.keys()]).toEqual([]);
  expect([...cookieJar.keys()]).toEqual(["cookie_consent"]);
  // On the host, its parent domain and with no domain, as PostHog may have
  // set it on any of them.
  expect(cookieWrites).toEqual([
    `ph_${KEY}_posthog=; Max-Age=0; Path=/`,
    `ph_${KEY}_posthog=; Max-Age=0; Path=/; Domain=www.id-game.com`,
    `ph_${KEY}_posthog=; Max-Age=0; Path=/; Domain=id-game.com`,
  ]);
});

test("withdrawing mid-session opts the loaded client out and deletes its storage", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(true);
  await runIdle();
  calls.length = 0;

  analytics.setAnalyticsConsent(false);
  analytics.capture("new_game");

  expect(calls).toEqual([["opt_out_capturing"]]);
  // The opt-out record stays while this client lives, since posthog-js reads
  // it back on every capture; everything else is gone.
  expect([...localStorage.map.keys()]).toEqual([
    `__ph_opt_in_out_${KEY}`,
    "id-game:remembered-account",
  ]);
  expect([...sessionStorage.map.keys()]).toEqual([]);
  expect([...cookieJar.keys()]).toEqual(["cookie_consent"]);
});

test("consent given again after withdrawing opts the same client back in", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(true);
  await runIdle();
  analytics.setAnalyticsConsent(false);
  calls.length = 0;

  analytics.setAnalyticsConsent(true);
  analytics.capture("new_game");
  await runIdle();

  expect(fakePosthog.init).toHaveBeenCalledTimes(1);
  expect(calls).toEqual([
    ["opt_in_capturing", { captureEventName: false }],
    ["capture", "new_game", undefined],
  ]);
});

test("loads nothing if consent is withdrawn before the page finishes loading", async () => {
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(true);
  analytics.setAnalyticsConsent(false);
  fire("load");
  await runIdle();

  expect(imported).toBe(false);
  expect(calls).toEqual([]);
});

test("clears an opt-out left behind by an earlier withdrawal", async () => {
  fakePosthog.has_opted_out_capturing.mockReturnValue(true);
  readyState = "complete";
  const analytics = await loadModule();
  analytics.setAnalyticsConsent(true);
  await runIdle();

  expect(calls.map(([name]) => name)).toEqual(["init", "opt_in_capturing"]);
  expect(fakePosthog.opt_in_capturing).toHaveBeenCalledWith({
    captureEventName: false,
  });
});
