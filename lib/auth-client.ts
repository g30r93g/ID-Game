import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { emailOTPClient, adminClient } from "better-auth/client/plugins";
import { dashClient } from "@better-auth/infra/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [
    convexClient(),
    emailOTPClient(),
    passkeyClient(),
    adminClient(),
    // Pairs with `dash()` in convex/auth.ts; exposes authClient.dash.*
    // (audit-log reads). dashClient() takes no credential — it calls the
    // app's own Better Auth routes, which hold the API key server-side.
    dashClient(),
  ],
});
