import { describe, expect, test } from "vitest";
import { needsDisplayName } from "./display-name";

describe("needsDisplayName", () => {
  test("is false with nobody signed in", () => {
    expect(needsDisplayName(null)).toBe(false);
    expect(needsDisplayName(undefined)).toBe(false);
  });

  test("asks nameless accounts", () => {
    expect(needsDisplayName({ name: "" })).toBe(true);
    expect(needsDisplayName({ name: "   " })).toBe(true);
    expect(needsDisplayName({ name: null })).toBe(true);
  });

  test("leaves named accounts alone", () => {
    expect(needsDisplayName({ name: "Ada", isAnonymous: false })).toBe(false);
  });

  test("asks guests still on their generated name", () => {
    expect(needsDisplayName({ name: "Guest 4821", isAnonymous: true })).toBe(
      true,
    );
  });

  test("leaves guests who have picked a name alone", () => {
    expect(needsDisplayName({ name: "Ada", isAnonymous: true })).toBe(false);
  });

  test("doesn't mistake an account called 'Guest 1234' for a guest", () => {
    expect(needsDisplayName({ name: "Guest 1234", isAnonymous: false })).toBe(
      false,
    );
  });
});
