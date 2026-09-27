import { describe, expect, test } from "vitest";
import { inviteRedirectFor, normaliseJoinCode } from "./join-code";

describe("normaliseJoinCode", () => {
  test("accepts a six-character code", () => {
    expect(normaliseJoinCode("ABC123")).toBe("ABC123");
  });

  test("upper-cases and trims", () => {
    expect(normaliseJoinCode(" abc123 ")).toBe("ABC123");
    expect(normaliseJoinCode("abc123%20")).toBe("ABC123");
  });

  test("rejects anything else", () => {
    expect(normaliseJoinCode(undefined)).toBeNull();
    expect(normaliseJoinCode("")).toBeNull();
    expect(normaliseJoinCode("ABC12")).toBeNull();
    expect(normaliseJoinCode("ABC1234")).toBeNull();
    expect(normaliseJoinCode("ABC-12")).toBeNull();
    expect(normaliseJoinCode("ABC%E0")).toBeNull();
  });
});

describe("inviteRedirectFor", () => {
  test("sends a game page to its invite page", () => {
    expect(inviteRedirectFor("/game/ABC123")).toBe("/join/ABC123");
    expect(inviteRedirectFor("/game/abc123/")).toBe("/join/ABC123");
  });

  test("leaves every other game path alone", () => {
    expect(inviteRedirectFor("/game")).toBeNull();
    expect(inviteRedirectFor("/game/")).toBeNull();
    expect(inviteRedirectFor("/game/ABC123/rate")).toBeNull();
    expect(inviteRedirectFor("/game/nope")).toBeNull();
    expect(inviteRedirectFor("/join/ABC123")).toBeNull();
  });
});
