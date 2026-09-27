// Join codes are six upper-case letters or digits (see `generateOTP` in
// convex/game.ts). Kept free of server and Convex imports so the proxy can use
// it on every request.

const JOIN_CODE = /^[A-Z0-9]{6}$/;

/**
 * The canonical form of a join code taken from a URL, or `null` if it can't be
 * one. Case is forgiven because people retype codes from a screen.
 */
export function normaliseJoinCode(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null; // a malformed escape like "%E0"
  }
  const code = decoded.trim().toUpperCase();
  return JOIN_CODE.test(code) ? code : null;
}

/** The public invite page for a game — the URL people share. */
export function invitePath(joinCode: string): string {
  return `/join/${joinCode}`;
}

/**
 * The invite page a signed-out visitor to `pathname` should see instead of
 * being sent to sign in, or `null` if the path isn't a game's own page.
 *
 * Only `/game/<code>` itself, not its sub-pages: that is the link people have
 * shared, and the invite page is what makes it preview in chat apps.
 */
export function inviteRedirectFor(pathname: string): string | null {
  const match = /^\/game\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  const code = normaliseJoinCode(match[1]);
  return code ? invitePath(code) : null;
}
