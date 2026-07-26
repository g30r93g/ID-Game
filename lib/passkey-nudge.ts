// Remembers that someone declined the passkey prompt, so the nudge can come back
// later instead of never. Declining used to be permanent: the prompt was only
// ever shown once, immediately after an email-code sign-in, and "Maybe later"
// closed the door for good.
//
// The dismissal is deliberately local-only. It is a UI preference, not account
// state — losing it on a new device just means being offered a passkey there,
// which is exactly what we want.

const STORAGE_KEY = "id-game:passkey-nudge-dismissed-at";

export const PASSKEY_NUDGE_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Whether the nudge is due again. `dismissedAt` is null when it has never been
 * dismissed, and non-finite when the stored value was corrupted — both mean
 * "ask". Pure, so the cooldown boundary is unit-testable without a DOM.
 */
export function isNudgeDue(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null || !Number.isFinite(dismissedAt)) return true;
  return now - dismissedAt >= PASSKEY_NUDGE_COOLDOWN_MS;
}

// localStorage throws in some privacy modes and does not exist during SSR, so
// every access is guarded. A storage failure resolves to "ask" rather than
// silently suppressing the prompt forever.

export function isPasskeyNudgeDue(now: number = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isNudgeDue(raw === null ? null : Number(raw), now);
  } catch {
    return true;
  }
}

export function dismissPasskeyNudge(now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // Nothing to do — the prompt simply reappears next time.
  }
}

/** Called once a passkey exists, so a later removal re-arms the prompt. */
export function clearPasskeyNudge(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignored, as above.
  }
}
