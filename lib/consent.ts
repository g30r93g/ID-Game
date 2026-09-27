// The visitor's cookie choices, and the one place that reads or writes them.
//
// UK law (PECR, as the ICO applies it) lets a site store or read something on
// a visitor's device without asking only when it is strictly necessary for a
// service they asked for: the sign-in session, say. Everything else, here
// PostHog analytics and a couple of conveniences, waits for a yes. The full
// list, and why each item sits where it does, is the cookie table on
// /privacy.
//
// The choice lives in a first-party cookie rather than localStorage so the
// server can read it too: the game page checks it before sending `game_join`
// to PostHog. Storing it needs no consent of its own, since remembering the
// answer is what stops the banner asking on every page.
//
// Only the banner and the "Cookie settings" links write it; they go through
// saveConsent here, which also tells anything subscribed (the analytics
// loader, the banner itself) straight away.

export const CONSENT_COOKIE = "cookie_consent";

/**
 * Bump when the cookie policy changes in a way people should be asked about
 * again (a new category, a new analytics tool). A stored choice made under an
 * older version reads as no choice at all, so the banner comes back.
 */
export const CONSENT_VERSION = 1;

/**
 * About six months. A choice isn't meant to last forever, so after this the
 * cookie expires and the banner asks again.
 */
export const CONSENT_MAX_AGE_SECONDS = 182 * 24 * 60 * 60;

export type ConsentChoice = {
  /** PostHog: pageviews, events, errors and anything else it records. */
  analytics: boolean;
  /** Conveniences stored on this device: the remembered account, the passkey nudge. */
  functional: boolean;
};

export type Consent = ConsentChoice & {
  /** The CONSENT_VERSION it was given under. */
  v: number;
  /** When it was given, in ms since the epoch, as a record of the choice. */
  at: number;
};

/**
 * Reads a stored choice back. Returns null, which means "ask", for anything
 * that isn't a well-formed choice under the current policy version: nothing
 * stored, a hand-edited or truncated value, or one from an older policy.
 *
 * Takes the value either still URI-encoded (straight from `document.cookie`)
 * or already decoded (from `cookies()` on the server). Decoding a second time
 * is harmless because the JSON written here never contains a `%`.
 */
export function parseConsent(
  raw: string | null | undefined,
  version: number = CONSENT_VERSION,
): Consent | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const { v, analytics, functional, at } = value as Record<string, unknown>;
  if (v !== version) return null;
  if (typeof analytics !== "boolean" || typeof functional !== "boolean") {
    return null;
  }
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  return { v, analytics, functional, at };
}

/** The cookie value for a choice, URI-encoded so it is a valid cookie value. */
export function serializeConsent(consent: Consent): string {
  const { v, analytics, functional, at } = consent;
  return encodeURIComponent(JSON.stringify({ v, analytics, functional, at }));
}

/** A whole `document.cookie` assignment that stores `consent`. */
export function consentCookie(
  consent: Consent,
  { secure }: { secure: boolean },
): string {
  return [
    `${CONSENT_COOKIE}=${serializeConsent(consent)}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** This site's consent cookie out of a `Cookie` header or `document.cookie`. */
export function readConsentCookie(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === CONSENT_COOKIE) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}

/**
 * Whether a request may be reported to PostHog, from the value of its consent
 * cookie. For server code, which reads the cookie with `cookies()`.
 */
export function hasAnalyticsConsent(raw: string | null | undefined): boolean {
  return parseConsent(raw)?.analytics === true;
}

// Everything below is for the browser. On the server there is no
// `document`, so each read resolves to "no choice made" and nothing is written.

const listeners = new Set<() => void>();
let settingsOpen = false;

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Calls `listener` whenever the choice is saved or the settings panel is
 * opened or closed. Shaped for `useSyncExternalStore`.
 */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The raw stored value, or "" when there is none. A string so it can be a
 * `useSyncExternalStore` snapshot, which must compare equal between reads.
 */
export function consentSnapshot(): string {
  if (typeof document === "undefined") return "";
  return readConsentCookie(document.cookie) ?? "";
}

/** The visitor's current choice, or null if they haven't made one yet. */
export function readConsent(): Consent | null {
  return parseConsent(consentSnapshot());
}

/** Whether the conveniences in the "functional" category may use storage. */
export function hasFunctionalConsent(): boolean {
  return readConsent()?.functional === true;
}

/** Stores a choice and tells every subscriber. */
export function saveConsent(
  choice: ConsentChoice,
  now: number = Date.now(),
): Consent {
  const consent: Consent = {
    v: CONSENT_VERSION,
    analytics: choice.analytics,
    functional: choice.functional,
    at: now,
  };
  if (typeof document !== "undefined") {
    document.cookie = consentCookie(consent, {
      // Secure wherever the site is served over HTTPS, which is everywhere
      // but `next dev` and `next start` on localhost.
      secure: window.location.protocol === "https:",
    });
  }
  settingsOpen = false;
  notify();
  return consent;
}

/** Opens the banner at its preferences panel: the "Cookie settings" links. */
export function openCookieSettings() {
  settingsOpen = true;
  notify();
}

/** Closes a panel opened by openCookieSettings without changing anything. */
export function closeCookieSettings() {
  settingsOpen = false;
  notify();
}

/** Whether a "Cookie settings" link has the panel open. */
export function cookieSettingsOpen(): boolean {
  return settingsOpen;
}
