// Guest (anonymous) accounts: invitees who join a game without signing up.
// Shared by the Better Auth config in convex/auth.ts and the client, so it
// stays free of server and Convex imports.

/**
 * The domain on a guest's generated email address. `.invalid` is reserved
 * (RFC 2606), so no mail can ever be delivered to a guest, and an admin can
 * tell a guest row apart at a glance.
 */
export const GUEST_EMAIL_DOMAIN = "guests.invalid";

const PLACEHOLDER = /^Guest \d{4}$/;

/**
 * The name a guest account is created with, e.g. "Guest 4821". The join form
 * replaces it straight away with the name they typed; this is what's left if
 * that save fails, which still beats a lobby of identical "Anonymous" cards.
 */
export function guestPlaceholderName(random: () => number = Math.random) {
  const digits = Math.floor(random() * 10_000)
    .toString()
    .padStart(4, "0");
  return `Guest ${digits}`;
}

/** Whether `name` is still the generated placeholder rather than a real name. */
export function isGuestPlaceholderName(name: string): boolean {
  return PLACEHOLDER.test(name.trim());
}

/**
 * The sign-up page for a guest who wants an account, returning to `next`.
 * Signing up from a guest session carries their game seats across.
 */
export function upgradePath(next: string): string {
  return `/sign-in?tab=sign-up&next=${encodeURIComponent(next)}`;
}

/**
 * How long a guest account is kept before the cleanup may delete it. Long
 * enough that nobody loses a guest mid-game; the live-session check in
 * `canDeleteGuest` covers anyone still playing past it.
 */
export const GUEST_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Whether a guest account can be deleted: past the grace period, with no
 * session that could still sign it in. Once every session has expired the
 * account is unreachable — guests have no credential to sign back in with.
 */
export function canDeleteGuest(
  createdAt: number,
  sessionExpiresAt: readonly number[],
  now: number,
): boolean {
  if (now - createdAt < GUEST_GRACE_PERIOD_MS) return false;
  return sessionExpiresAt.every((expiresAt) => expiresAt <= now);
}
