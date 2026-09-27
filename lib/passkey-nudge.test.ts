import { afterEach, expect, test, vi } from "vitest";
import {
  PASSKEY_NUDGE_COOLDOWN_MS,
  clearPasskeyNudge,
  dismissPasskeyNudge,
  isNudgeDue,
  isPasskeyNudgeDue,
} from "./passkey-nudge";
import { CONSENT_VERSION, serializeConsent } from "./consent";

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

// The dismissal is "functional" storage: kept only with that consent.
function stubBrowser(functional: boolean | null) {
  const stored = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
  });
  const consent =
    functional === null
      ? ""
      : `cookie_consent=${serializeConsent({ v: CONSENT_VERSION, analytics: false, functional, at: 0 })}`;
  vi.stubGlobal("document", { cookie: consent });
  return stored;
}

afterEach(() => {
  clearPasskeyNudge();
  vi.unstubAllGlobals();
});

test("without functional consent a dismissal is kept in memory only", () => {
  for (const functional of [null, false]) {
    const stored = stubBrowser(functional);
    dismissPasskeyNudge(NOW);
    expect(stored.size).toBe(0);
    expect(isPasskeyNudgeDue(NOW + 1)).toBe(false);
    clearPasskeyNudge();
    expect(isPasskeyNudgeDue(NOW + 1)).toBe(true);
  }
});

test("without functional consent a stored dismissal isn't read", () => {
  const stored = stubBrowser(false);
  stored.set("id-game:passkey-nudge-dismissed-at", String(NOW));
  expect(isPasskeyNudgeDue(NOW + 1)).toBe(true);
});

test("with functional consent a dismissal is stored", () => {
  const stored = stubBrowser(true);
  dismissPasskeyNudge(NOW);
  expect(stored.get("id-game:passkey-nudge-dismissed-at")).toBe(String(NOW));
  expect(isPasskeyNudgeDue(NOW + 1)).toBe(false);
  clearPasskeyNudge();
  expect(stored.size).toBe(0);
});
