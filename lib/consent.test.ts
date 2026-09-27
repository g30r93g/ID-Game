import { afterEach, describe, expect, test, vi } from "vitest";
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  CONSENT_VERSION,
  consentCookie,
  cookieSettingsOpen,
  closeCookieSettings,
  hasAnalyticsConsent,
  hasFunctionalConsent,
  openCookieSettings,
  parseConsent,
  readConsent,
  readConsentCookie,
  saveConsent,
  serializeConsent,
  subscribeConsent,
  type Consent,
} from "./consent";

const consent: Consent = {
  v: CONSENT_VERSION,
  analytics: true,
  functional: false,
  at: 1_767_225_600_000,
};

describe("parseConsent", () => {
  test("reads back what serializeConsent wrote", () => {
    expect(parseConsent(serializeConsent(consent))).toEqual(consent);
  });

  test("reads a value the server has already decoded", () => {
    expect(parseConsent(JSON.stringify(consent))).toEqual(consent);
  });

  test("is null when nothing is stored", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("")).toBeNull();
  });

  test("treats a malformed value as no choice", () => {
    for (const raw of [
      "not json",
      "%E0%A4%A", // a broken escape, which decodeURIComponent throws on
      "{",
      "null",
      "42",
      '"yes"',
      "[]",
      JSON.stringify({ ...consent, analytics: "true" }),
      JSON.stringify({ ...consent, functional: 1 }),
      JSON.stringify({ ...consent, at: "yesterday" }),
      JSON.stringify({ v: CONSENT_VERSION, analytics: true, at: 1 }),
      JSON.stringify({ v: CONSENT_VERSION, analytics: true, functional: true }),
    ]) {
      expect(parseConsent(raw), raw).toBeNull();
    }
  });

  test("asks again after the policy version changes", () => {
    const old = serializeConsent({ ...consent, v: CONSENT_VERSION - 1 });
    expect(parseConsent(old)).toBeNull();
    // And a choice made under the current version is stale under the next.
    expect(parseConsent(serializeConsent(consent), CONSENT_VERSION + 1)).toBeNull();
  });

  test("keeps only the fields it knows", () => {
    const raw = JSON.stringify({ ...consent, marketing: true });
    expect(parseConsent(raw)).toEqual(consent);
  });
});

describe("serializeConsent", () => {
  test("is a valid cookie value: no quotes, commas, semicolons or spaces", () => {
    expect(serializeConsent(consent)).toMatch(/^[^",; ]+$/);
  });
});

describe("consentCookie", () => {
  test("is first-party, site-wide, Lax and about six months long", () => {
    const cookie = consentCookie(consent, { secure: false });
    expect(cookie).toBe(
      `${CONSENT_COOKIE}=${serializeConsent(consent)}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`,
    );
    expect(CONSENT_MAX_AGE_SECONDS / 86_400).toBeGreaterThanOrEqual(180);
    expect(CONSENT_MAX_AGE_SECONDS / 86_400).toBeLessThanOrEqual(184);
  });

  test("is Secure over HTTPS", () => {
    expect(consentCookie(consent, { secure: true })).toMatch(/; Secure$/);
  });
});

describe("readConsentCookie", () => {
  test("finds the consent cookie among others", () => {
    const header = `a=1; ${CONSENT_COOKIE}=abc%7B; b=2`;
    expect(readConsentCookie(header)).toBe("abc%7B");
  });

  test("ignores cookies whose names only contain it", () => {
    expect(readConsentCookie(`x_${CONSENT_COOKIE}=1; ${CONSENT_COOKIE}x=2`)).toBeNull();
    expect(readConsentCookie("")).toBeNull();
  });
});

describe("hasAnalyticsConsent", () => {
  test("only a current, well-formed yes counts", () => {
    expect(hasAnalyticsConsent(serializeConsent(consent))).toBe(true);
    expect(
      hasAnalyticsConsent(serializeConsent({ ...consent, analytics: false })),
    ).toBe(false);
    expect(
      hasAnalyticsConsent(serializeConsent({ ...consent, v: CONSENT_VERSION - 1 })),
    ).toBe(false);
    expect(hasAnalyticsConsent("garbage")).toBe(false);
    expect(hasAnalyticsConsent(undefined)).toBe(false);
  });
});

describe("in the browser", () => {
  afterEach(() => {
    closeCookieSettings();
    vi.unstubAllGlobals();
  });

  function stubBrowser(protocol = "https:") {
    let jar = "other=1";
    const writes: string[] = [];
    vi.stubGlobal("window", { location: { protocol } });
    vi.stubGlobal("document", {
      get cookie() {
        return jar;
      },
      set cookie(value: string) {
        writes.push(value);
        jar = `other=1; ${value.split(";")[0]}`;
      },
    });
    return writes;
  }

  test("reads nothing on the server", () => {
    expect(readConsent()).toBeNull();
    expect(hasFunctionalConsent()).toBe(false);
  });

  test("saves a choice, reads it back, and tells subscribers", () => {
    const writes = stubBrowser();
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);

    expect(readConsent()).toBeNull();
    const saved = saveConsent({ analytics: false, functional: true }, 123);
    unsubscribe();

    expect(saved).toEqual({
      v: CONSENT_VERSION,
      analytics: false,
      functional: true,
      at: 123,
    });
    expect(writes).toEqual([consentCookie(saved, { secure: true })]);
    expect(readConsent()).toEqual(saved);
    expect(hasFunctionalConsent()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("leaves the cookie off Secure over plain HTTP (local builds)", () => {
    const writes = stubBrowser("http:");
    saveConsent({ analytics: true, functional: true });
    expect(writes[0]).not.toMatch(/Secure/);
  });

  test("opens and closes the settings panel on request", () => {
    stubBrowser();
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);

    openCookieSettings();
    expect(cookieSettingsOpen()).toBe(true);
    // Saving closes it.
    saveConsent({ analytics: false, functional: false });
    expect(cookieSettingsOpen()).toBe(false);
    openCookieSettings();
    closeCookieSettings();
    expect(cookieSettingsOpen()).toBe(false);
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(4);
  });
});
