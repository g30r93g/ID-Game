import { ConvexError } from "convex/values";

// The `jwtCache.isAuthError` predicate for lib/auth-server.ts.
//
// With the cache on, server-side Convex calls first use the `convex_jwt`
// cookie instead of fetching a token. When such a call fails, the library
// (`callWithToken` in @convex-dev/better-auth/nextjs) does this:
//
//   isAuthError(error) true  -> rethrow the error as it is
//   isAuthError(error) false -> fetch a fresh token and run the call again
//
// Despite the option's name, what the predicate really decides is whether a
// fresh token could change the outcome. The answer depends on where the call
// failed:
//
// - Convex refused the request before any function ran. It answers with a
//   non-2xx JSON body such as {"code":"Unauthenticated","message":...}, which
//   the HTTP client throws as the error message. A stale, expired or
//   unverifiable cached JWT fails this way, and a fresh token is the fix.
//   So this returns false.
// - The function ran and threw. The token was accepted, so a fresh one would
//   change nothing. This includes a revoked session, which getAuthUser checks
//   against the database. The retry would just cost another token fetch and
//   run the call a second time. That is safe but wasteful: a query has no
//   effects, and a mutation that throws is rolled back. The app makes no
//   server-side action calls. So this returns true.
//
// Anything unrecognised is treated as retryable. A needless retry is only
// slower, but rethrowing a stale-token failure would put an error in front of
// someone whose session is fine.
export function isAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // Thrown on purpose by the function, with data for the caller.
  if (error instanceof ConvexError || error.name === "ConvexError") return true;
  if (isRequestRejection(error.message)) return false;
  // A function failure's message is the server's errorMessage, which always
  // carries the request ID; production redacts the rest to "Server Error".
  return /\[Request ID: [^\]]+\] Server Error/.test(error.message);
}

/** A non-2xx Convex response body: `{"code": ..., "message": ...}`. */
function isRequestRejection(message: string): boolean {
  try {
    const body: unknown = JSON.parse(message);
    return (
      typeof body === "object" &&
      body !== null &&
      typeof (body as { code?: unknown }).code === "string"
    );
  } catch {
    return false;
  }
}
