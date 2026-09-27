import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { env } from "@/app/env";
import { isAuthError } from "@/lib/convex-token-error";

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
  convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  // Without the cache every getToken() is a round trip to Convex (a session
  // lookup and a JWT sign), even for a visitor with no session. With it, the
  // `convex_jwt` cookie the Better Auth plugin sets on sign-in and
  // get-session (15 minutes) is used while it is still valid.
  jwtCache: {
    enabled: true,
    // Negative: a cached token is only used while at least 30s remain. The
    // library default (+60) would accept one up to a minute after it
    // expires. The margin also covers the token being handed to the client
    // as its initial token, and some clock skew with Convex.
    expirationToleranceSeconds: -30,
    // Decides whether a failed call is retried with a fresh token; see
    // lib/convex-token-error.ts for why it is shaped the way it is.
    isAuthError,
  },
});

/**
 * getToken(), skipping the call when the request has no Better Auth session
 * cookie. Without a session there is no token to get. When the cached JWT
 * is missing or near expiry, getToken() would still ask Convex, and that
 * round trip is the slowest part of a signed-out page load.
 */
export async function getSessionToken(): Promise<string | undefined> {
  if (!getSessionCookie(await headers())) return undefined;
  return getToken();
}
