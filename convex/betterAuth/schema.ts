import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

/**
 * Composes the generated Better Auth tables with custom indexes.
 * To regenerate the tables, from your project root:
 *
 *   cd convex/betterAuth
 *   npx auth generate --output generatedSchema.ts
 *
 * (Custom indexes below survive regeneration because they live here,
 * not in the generated file.)
 */
const schema = defineSchema({
  ...tables,
  // Passkey sign-in looks the credential up by credentialID; without this
  // index the component logs a missing-index warning and falls back to a
  // full table scan.
  passkey: tables.passkey.index("credentialID", ["credentialID"]),
  // The rate limiter prunes expired windows by lastRequest (the generated
  // schema already indexes key for the per-request lookups).
  rateLimit: tables.rateLimit.index("lastRequest", ["lastRequest"]),
  // The guest cleanup (convex/cleanup.ts) lists guests oldest first. Guests
  // and accounts share the user table, so without this it would scan every
  // account to find them; the adapter orders an index by _creationTime after
  // its fields, which gives the oldest-first order for free.
  user: tables.user.index("isAnonymous", ["isAnonymous"]),
});

export default schema;
