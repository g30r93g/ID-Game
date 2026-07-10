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
});

export default schema;
