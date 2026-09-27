import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import {
  adminClient,
  anonymousClient,
  emailOTPClient,
} from "better-auth/client/plugins";
import { dashClient } from "@better-auth/infra/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  sessionOptions: {
    // Better Auth refetches the session on every window focus by default. On a
    // phone that is every app switch or unlock, and each one costs a proxy run,
    // a Next function, a Convex HTTP action and a JWT re-sign. Convex rejects
    // expired tokens on its own and other tabs still sync over
    // BroadcastChannel, so focus isn't worth the round trip.
    refetchOnWindowFocus: false,
  },
  plugins: [
    convexClient(),
    emailOTPClient(),
    passkeyClient(),
    adminClient(),
    // Guests: authClient.signIn.anonymous(), and `user.isAnonymous` on the
    // session. Pairs with `anonymous()` in convex/auth.ts.
    anonymousClient(),
    // Pairs with `dash()` in convex/auth.ts; exposes authClient.dash.*
    // (audit-log reads). dashClient() takes no credential — it calls the
    // app's own Better Auth routes, which hold the API key server-side.
    dashClient(),
  ],
});
