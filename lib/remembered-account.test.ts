import { afterEach, describe, expect, test, vi } from "vitest";
import {
  firstName,
  forgetRememberedAccount,
  parseRememberedAccount,
  rememberAccount,
  rememberedAccountSnapshot,
} from "./remembered-account";
import { CONSENT_VERSION, serializeConsent } from "./consent";

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

// The remembered account is "functional" storage: kept only with that consent.
describe("consent", () => {
  const KEY = "id-game:remembered-account";

  function stubBrowser(functional: boolean | null) {
    const stored = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => void stored.set(key, value),
        removeItem: (key: string) => void stored.delete(key),
      },
    });
    const consent =
      functional === null
        ? ""
        : `cookie_consent=${serializeConsent({ v: CONSENT_VERSION, analytics: false, functional, at: 0 })}`;
    vi.stubGlobal("document", { cookie: consent });
    return stored;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("nothing is written or read without functional consent", () => {
    for (const functional of [null, false]) {
      const stored = stubBrowser(functional);
      rememberAccount("Ada Lovelace");
      expect(stored.size).toBe(0);

      stored.set(KEY, '{"name":"Ada"}');
      expect(rememberedAccountSnapshot()).toBeNull();
    }
  });

  test("with functional consent the first name is kept", () => {
    const stored = stubBrowser(true);
    rememberAccount("Ada Lovelace");
    expect(stored.get(KEY)).toBe('{"name":"Ada"}');
    expect(rememberedAccountSnapshot()).toBe('{"name":"Ada"}');
  });

  test("forgetRememberedAccount deletes it", () => {
    const stored = stubBrowser(true);
    rememberAccount("Ada");
    forgetRememberedAccount();
    expect(stored.size).toBe(0);
  });
});
