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
};
let failImport = false;

// Just enough of a browser for the loader: window events and idle callbacks
// are collected so each test decides when the page "loads".
let listeners: Record<string, ((event: unknown) => void)[]>;
let idleCallbacks: (() => void)[];
let readyState: string;

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
    if (failImport) throw new Error("blocked");
    return { default: fakePosthog };
  });
  return import("./analytics");
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  failImport = false;
  listeners = {};
  idleCallbacks = [];
  readyState = "loading";
  vi.stubGlobal("window", {
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
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("queues calls until the page has loaded, then replays them in order", async () => {
  const analytics = await loadModule();
  analytics.loadAnalytics();
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
  analytics.loadAnalytics();
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
  analytics.loadAnalytics();
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
  analytics.loadAnalytics();
  await runIdle();
  expect(calls.filter(([name]) => name === "captureException")).toEqual([
    ["captureException", early, undefined],
    ["captureException", "rejected", undefined],
  ]);

  // posthog-js's own exception autocapture owns these from here.
  expect(listeners.error).toEqual([]);
  expect(listeners.unhandledrejection).toEqual([]);
});

test("loads only once", async () => {
  readyState = "complete";
  const analytics = await loadModule();
  analytics.loadAnalytics();
  analytics.loadAnalytics();
  await runIdle();
  expect(fakePosthog.init).toHaveBeenCalledTimes(1);
});

test("drops the queue and stops queueing when the library can't load", async () => {
  failImport = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
  readyState = "complete";
  const analytics = await loadModule();
  analytics.capture("new_game");
  analytics.loadAnalytics();
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
  analytics.loadAnalytics();
  await runIdle();

  expect(task).not.toHaveBeenCalled();
  expect(calls).toEqual([]);
  expect(listeners.error).toBeUndefined();
});
