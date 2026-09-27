import { isGuestPlaceholderName } from "./guest";

// Long enough for a real name, short enough that a player card still fits it.
// Lives apart from `use-display-name.ts` so the auth pages — which render
// outside the Convex provider — can bound the field without pulling in the
// Convex client.
export const MAX_DISPLAY_NAME_LENGTH = 32;

/**
 * Whether the display-name prompt should ask this user for a name: an account
 * with none (the email-code sign-in tab creates accounts nameless), or a guest
 * still on the generated "Guest 1234" they were created with. Guests join a
 * lobby in one click and name themselves there, so everyone else sees a real
 * name before the first round.
 */
export function needsDisplayName(
  user:
    | { name?: string | null; isAnonymous?: boolean | null }
    | null
    | undefined,
): boolean {
  if (!user) return false;
  const name = user.name?.trim();
  if (!name) return true;
  return user.isAnonymous === true && isGuestPlaceholderName(name);
}
