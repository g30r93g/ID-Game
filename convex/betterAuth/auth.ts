import { createAuth } from "../auth";

// Export a static instance for Better Auth schema generation.
// This file must contain ONLY this export — importing it at runtime
// errors due to missing environment variables.
export const auth = createAuth({} as any);
