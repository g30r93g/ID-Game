import { expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { isAuthError } from "./convex-token-error";

// true: rethrow as it is. false: fetch a fresh token and run the call again.

test("isAuthError retries when Convex refuses the cached token", () => {
  // Non-2xx bodies, thrown by the HTTP client as the error message.
  expect(
    isAuthError(
      new Error(
        JSON.stringify({
          code: "Unauthenticated",
          message:
            "Could not verify OIDC token claim. Check that the token signature is valid and the token hasn't expired.",
        }),
      ),
    ),
  ).toBe(false);
  expect(
    isAuthError(
      new Error('{"code":"InvalidAuthHeader","message":"Could not parse as a JWT"}'),
    ),
  ).toBe(false);
});

test("isAuthError rethrows a ConvexError the function threw", () => {
  expect(isAuthError(new ConvexError("Admin access required."))).toBe(true);
  expect(isAuthError(new ConvexError({ code: "GAME_CLOSED" }))).toBe(true);
});

test("isAuthError rethrows a plain error the function threw", () => {
  // Development: the message and stack come through.
  expect(
    isAuthError(
      new Error(
        "[Request ID: 3f2a9c0d1b7e4a56] Server Error\nUncaught Error: This game has already started\n    at handler (../convex/game.ts:120:11)",
      ),
    ),
  ).toBe(true);
  // Production: the message is redacted.
  expect(isAuthError(new Error("[Request ID: 3f2a9c0d1b7e4a56] Server Error"))).toBe(true);
  // The same message from the WebSocket client carries a function prefix.
  expect(
    isAuthError(
      new Error("[CONVEX M(game:joinGame)] [Request ID: 3f2a9c0d1b7e4a56] Server Error"),
    ),
  ).toBe(true);
});

test("isAuthError retries anything it can't place", () => {
  // A needless retry costs time; a wrongly rethrown stale token breaks the page.
  expect(isAuthError(new TypeError("fetch failed"))).toBe(false);
  expect(isAuthError(new Error("<html>502 Bad Gateway</html>"))).toBe(false);
  expect(isAuthError("not an error")).toBe(false);
  expect(isAuthError(undefined)).toBe(false);
  // JSON that isn't a Convex error body.
  expect(isAuthError(new Error('"just a string"'))).toBe(false);
  expect(isAuthError(new Error("null"))).toBe(false);
});
