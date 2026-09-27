// The NEXT_PUBLIC_* values for client code, without app/env.ts.
//
// app/env.ts validates with t3-env and zod, and importing it from a client
// module ships both to the browser (about 67 KB gz on every page) just to
// re-check values that were already checked at build time: next.config.ts
// loads app/env.ts, so a missing or malformed variable fails the build before
// anything here is inlined. Server code should keep using app/env.ts.
//
// Each value must be read as a literal `process.env.NEXT_PUBLIC_X`: Next only
// inlines those, not destructured or dynamically keyed reads.
export const publicEnv = {
  NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL as string,
  NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL as string,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL as string,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY as string,
  NEXT_PUBLIC_POSTHOG_API_HOST: process.env.NEXT_PUBLIC_POSTHOG_API_HOST as string,
  NEXT_PUBLIC_POSTHOG_UI_HOST: process.env.NEXT_PUBLIC_POSTHOG_UI_HOST as string,
};
