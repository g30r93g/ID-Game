// Decides what PostHog should do about identity on any given render, kept
// separate from the effect that performs it so the awkward cases (a session
// that has not loaded yet, a sign-out that only lands on the next page load,
// two accounts sharing one browser) are unit-testable without a DOM.

export type IdentityAction =
  /** Leave PostHog alone. */
  | "none"
  /** Attach the anonymous device to this user. */
  | "identify"
  /** Drop the identified user and go back to an anonymous device. */
  | "reset"
  /** A different account is signing in here: reset, then identify. */
  | "reidentify";

export function nextIdentityAction({
  isPending,
  userId,
  identifiedAs,
}: {
  /** The session is still loading, so "no user" does not yet mean "signed out". */
  isPending: boolean;
  /** The signed-in account, or null/undefined when signed out. */
  userId: string | null | undefined;
  /** Who PostHog currently thinks this device is, or null while anonymous. */
  identifiedAs: string | null;
}): IdentityAction {
  // On first paint there is no session yet. Resetting here would throw away
  // the anonymous ID we are about to stitch onto the account.
  if (isPending) return "none";

  if (!userId) {
    // Signing out navigates with a full page load, so this lands on the next
    // visit rather than at the click. It still matters: the identified ID
    // lives in a cookie and would otherwise follow whoever uses the browser
    // next.
    return identifiedAs ? "reset" : "none";
  }

  // PostHog refuses to move an already-identified device onto a second ID, so
  // an account switch has to clear the first one before it can claim the
  // device.
  if (identifiedAs && identifiedAs !== userId) return "reidentify";

  // Safe to repeat: posthog-js no-ops an identify that changes neither the ID
  // nor the person properties, which is what makes this cheap to run on every
  // session change.
  return "identify";
}
