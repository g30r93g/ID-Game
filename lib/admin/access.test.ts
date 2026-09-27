import { expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { ADMIN_ACCESS_REQUIRED, isAdminAccessError } from "./access";

test("isAdminAccessError recognises requireAdmin's refusal", () => {
  expect(isAdminAccessError(new ConvexError(ADMIN_ACCESS_REQUIRED))).toBe(true);
});

test("isAdminAccessError leaves every other failure alone", () => {
  // Other ConvexErrors, including ones that mention the phrase.
  expect(isAdminAccessError(new ConvexError("Category not found."))).toBe(false);
  expect(isAdminAccessError(new ConvexError({ message: ADMIN_ACCESS_REQUIRED }))).toBe(false);
  // A plain error with the same text is not requireAdmin's: in production
  // Convex would have redacted it, so matching on text would be a guess.
  expect(isAdminAccessError(new Error(ADMIN_ACCESS_REQUIRED))).toBe(false);
  // Network and server failures.
  expect(isAdminAccessError(new TypeError("fetch failed"))).toBe(false);
  expect(isAdminAccessError(new Error("[Request ID: abc] Server Error"))).toBe(false);
  expect(isAdminAccessError(undefined)).toBe(false);
});
