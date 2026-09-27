"use client";

import { useSyncExternalStore } from "react";

// A shared wall clock for components that compare timestamps against "now",
// like the presence dots. Every component reading the same period shares one
// interval rather than each running its own, and the clock stops while the tab
// is hidden: nobody is looking, and it catches up the moment the tab returns.

type Clock = {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | undefined;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
};

const clocks = new Map<number, Clock>();

function createClock(intervalMs: number): Clock {
  const tick = () => {
    clock.now = Date.now();
    clock.listeners.forEach((listener) => listener());
  };
  const start = () => {
    if (clock.timer === undefined && !document.hidden) {
      clock.timer = setInterval(tick, intervalMs);
    }
  };
  const stop = () => {
    clearInterval(clock.timer);
    clock.timer = undefined;
  };
  const onVisibilityChange = () => {
    if (document.hidden) {
      stop();
    } else {
      tick();
      start();
    }
  };

  const clock: Clock = {
    now: Date.now(),
    listeners: new Set(),
    timer: undefined,
    subscribe: (listener) => {
      clock.listeners.add(listener);
      if (clock.listeners.size === 1) {
        // Idle since the last reader left, so the stored time may be old.
        clock.now = Date.now();
        document.addEventListener("visibilitychange", onVisibilityChange);
        start();
      }
      return () => {
        clock.listeners.delete(listener);
        if (clock.listeners.size === 0) {
          stop();
          document.removeEventListener("visibilitychange", onVisibilityChange);
        }
      };
    },
    getSnapshot: () => clock.now,
  };
  return clock;
}

// Nothing rendered on the server shows liveness, and hydration reads this same
// value before switching to the live clock, so any constant will do.
const getServerSnapshot = () => 0;

/** The current time in ms, updated every `intervalMs` while the tab is visible. */
export function useNow(intervalMs: number): number {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = createClock(intervalMs);
    clocks.set(intervalMs, clock);
  }
  return useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    getServerSnapshot,
  );
}
