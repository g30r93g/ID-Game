import { ConvexError } from "convex/values";

// Thrown by convex/adminAuth.ts `requireAdmin`, for signed-out callers as well
// as signed-in non-admins. It is a ConvexError so that the message reaches
// the caller: Convex redacts a plain Error's message to "Server Error" in
// production, which would leave the admin API routes unable to tell a refused
// caller from a failure.
export const ADMIN_ACCESS_REQUIRED = "Admin access required.";

/** Whether a failed Convex call was refused by `requireAdmin`. */
export function isAdminAccessError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error instanceof ConvexError || error.name === "ConvexError") &&
    (error as ConvexError<string>).data === ADMIN_ACCESS_REQUIRED
  );
}
