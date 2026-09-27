// Remembers that someone has signed in with a real account on this device, so
// an invite link opened after they've signed out can offer "sign in" before
// "join as a guest" — otherwise a returning player would end up as a guest
// with none of their account's games.
//
// Local-only on purpose, like the passkey nudge: it is a hint for this
// browser, not account state. Signing out leaves it in place, because "has an
// account here" is exactly what the invite page wants to know. Only a first
// name is kept, for the greeting; never the email.

const STORAGE_KEY = "id-game:remembered-account";

export type RememberedAccount = {
  /** First name for the "Welcome back" greeting, or null if they had none. */
  name: string | null;
};

/**
 * Reads a stored value back. Anything unreadable is treated as "no account
 * remembered" — the cost is showing the guest form first, which still links
 * to sign-in. Pure, so it is unit-testable without a DOM.
 */
export function parseRememberedAccount(
  raw: string | null,
): RememberedAccount | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const name = (value as { name?: unknown }).name;
    return { name: typeof name === "string" && name.trim() ? name : null };
  } catch {
    return null;
  }
}

/** The first word of a display name, or null for a blank one. */
export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

// localStorage throws in some privacy modes and does not exist during SSR, so
// every access is guarded.

/**
 * The raw stored value. A string rather than the parsed object so it can be a
 * `useSyncExternalStore` snapshot, which must compare equal between reads.
 */
export function rememberedAccountSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberAccount(name: string | null | undefined): void {
  if (typeof window === "undefined") return;
  const value = JSON.stringify({ name: firstName(name) });
  try {
    // Runs on every session change; skip the write when nothing changed.
    if (window.localStorage.getItem(STORAGE_KEY) === value) return;
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Nothing to do — the invite page just leads with the guest form.
  }
}
