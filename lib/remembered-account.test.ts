import { describe, expect, test } from "vitest";
import { firstName, parseRememberedAccount } from "./remembered-account";

describe("parseRememberedAccount", () => {
  test("is null when nothing is stored", () => {
    expect(parseRememberedAccount(null)).toBeNull();
  });

  test("reads back a stored name", () => {
    expect(parseRememberedAccount('{"name":"Ada"}')).toEqual({ name: "Ada" });
  });

  test("remembers an account that had no name", () => {
    expect(parseRememberedAccount('{"name":null}')).toEqual({ name: null });
    expect(parseRememberedAccount('{"name":"  "}')).toEqual({ name: null });
    expect(parseRememberedAccount("{}")).toEqual({ name: null });
  });

  test("treats corrupted values as nothing remembered", () => {
    expect(parseRememberedAccount("not json")).toBeNull();
    expect(parseRememberedAccount("null")).toBeNull();
    expect(parseRememberedAccount("42")).toBeNull();
  });

  test("ignores a name that isn't a string", () => {
    expect(parseRememberedAccount('{"name":7}')).toEqual({ name: null });
  });
});

describe("firstName", () => {
  test("takes the first word", () => {
    expect(firstName("  Ada   Lovelace ")).toBe("Ada");
  });

  test("is null for blank or missing names", () => {
    expect(firstName("")).toBeNull();
    expect(firstName("   ")).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName(undefined)).toBeNull();
  });
});
