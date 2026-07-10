import { betterAuth } from "better-auth/minimal";
import { createAuthOptions } from "../auth";

// Export a static instance for Better Auth schema generation.
// This file must contain ONLY this export — it exists solely for
// `npx auth generate` schema generation and must never be imported at
// runtime. It deliberately bypasses `createAuth` (which fails fast when
// SITE_URL is unset) because this module is also evaluated during Convex's
// env-less module analysis, where the guard must not fire.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- schema-gen-only shim; never receives a real ctx
export const auth = betterAuth(createAuthOptions({} as any));
