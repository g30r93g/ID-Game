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
