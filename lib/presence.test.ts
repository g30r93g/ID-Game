import { expect, test } from "vitest";
import { PRESENCE_TIMEOUT_MS, isConnected } from "./presence";

test("isConnected is true when the last heartbeat is within the timeout", () => {
  const now = 1_000_000;
  expect(isConnected(now - 1000, now)).toBe(true);
  expect(isConnected(now, now)).toBe(true);
});

test("isConnected is false once the timeout has elapsed", () => {
  const now = 1_000_000;
  expect(isConnected(now - PRESENCE_TIMEOUT_MS, now)).toBe(false);
  expect(isConnected(now - PRESENCE_TIMEOUT_MS - 1, now)).toBe(false);
  expect(isConnected(0, now)).toBe(false);
});
