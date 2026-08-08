// Long enough for a real name, short enough that a player card still fits it.
// Lives apart from `use-display-name.ts` so the auth pages — which render
// outside the Convex provider — can bound the field without pulling in the
// Convex client.
export const MAX_DISPLAY_NAME_LENGTH = 32;
