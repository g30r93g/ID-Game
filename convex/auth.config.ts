import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    // With JWKS set (see `getLatestJwks` in auth.ts), Convex verifies tokens
    // against keys inlined here instead of fetching them from this
    // deployment's own /api/auth/convex/jwks whenever its key cache is cold.
    // Unset, it falls back to that URL. This file is read at push time, so a
    // change to JWKS only takes effect on the next deploy. The same variable
    // must reach the `convex()` plugin in auth.ts, which throws if only this
    // side has static keys.
    getAuthConfigProvider({ jwks: process.env.JWKS }),
  ],
} satisfies AuthConfig;
