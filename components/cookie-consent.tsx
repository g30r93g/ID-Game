"use client";

import * as React from "react";
import {
  consentSnapshot,
  cookieSettingsOpen,
  parseConsent,
  subscribeConsent,
} from "@/lib/consent";

// The banner is only needed on a first visit, after a policy change, or when
// someone opens "Cookie settings", so its code (and the switches) loads on
// demand rather than riding along in every page's entry chunks. It is never
// server-rendered: the choice is read from the cookie in the browser, which
// keeps the root layout free of `cookies()` and the public pages static.
// React.lazy rather than next/dynamic, whose loader would add about 2 KB gz
// to every page. `ssr: false` isn't needed: nothing below renders on the
// server.
const CookieBanner = React.lazy(() => import("@/components/cookie-banner"));

// Before hydration there is no cookie to read, so the server snapshot is
// "unknown" and nothing renders until the browser has checked.
const unknown = () => null;
const closed = () => false;

/** Shows the cookie banner when there is no current choice, or on request. */
export function CookieConsent() {
  const raw = React.useSyncExternalStore<string | null>(
    subscribeConsent,
    consentSnapshot,
    unknown,
  );
  const settingsOpen = React.useSyncExternalStore(
    subscribeConsent,
    cookieSettingsOpen,
    closed,
  );

  if (raw === null) return null;
  const consent = parseConsent(raw);
  if (consent && !settingsOpen) return null;

  return (
    <React.Suspense fallback={null}>
      <CookieBanner
        // A fresh banner, starting at the preferences panel, when "Cookie
        // settings" is used while the first-visit banner is already up.
        key={settingsOpen ? "settings" : "banner"}
        current={consent}
        fromSettings={settingsOpen}
      />
    </React.Suspense>
  );
}
