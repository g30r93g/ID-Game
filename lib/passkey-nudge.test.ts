import { expect, test } from "vitest";
import { PASSKEY_NUDGE_COOLDOWN_MS, isNudgeDue } from "./passkey-nudge";

const NOW = 1_000_000_000_000;

test("isNudgeDue is true when the prompt has never been dismissed", () => {
  expect(isNudgeDue(null, NOW)).toBe(true);
});

test("isNudgeDue is false inside the cooldown", () => {
  expect(isNudgeDue(NOW, NOW)).toBe(false);
  expect(isNudgeDue(NOW - PASSKEY_NUDGE_COOLDOWN_MS + 1, NOW)).toBe(false);
});

test("isNudgeDue is true once the cooldown has elapsed", () => {
  expect(isNudgeDue(NOW - PASSKEY_NUDGE_COOLDOWN_MS, NOW)).toBe(true);
  expect(isNudgeDue(NOW - PASSKEY_NUDGE_COOLDOWN_MS - 1, NOW)).toBe(true);
});

test("isNudgeDue treats a corrupted stored value as never dismissed", () => {
  expect(isNudgeDue(Number.NaN, NOW)).toBe(true);
  expect(isNudgeDue(Number.POSITIVE_INFINITY, NOW)).toBe(true);
});
