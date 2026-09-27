"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  closeCookieSettings,
  saveConsent,
  type Consent,
  type ConsentChoice,
} from "@/lib/consent";
import { clearPasskeyNudge } from "@/lib/passkey-nudge";
import { forgetRememberedAccount } from "@/lib/remembered-account";
import Link from "next/link";
import * as React from "react";

const POLICY_HREF = "/privacy#cookies";

const OPTIONAL: {
  key: keyof ConsentChoice;
  title: string;
  description: string;
}[] = [
  {
    key: "functional",
    title: "Functional",
    description:
      "Remember your first name on this device, so an invite link can offer to sign you back in, and hold off the passkey reminder for two weeks after “Maybe later”.",
  },
  {
    key: "analytics",
    title: "Analytics",
    description:
      "Allow PostHog to record page views, clicks and errors, so we can see what to fix and improve. Its cookies last up to a year.",
  },
];

/**
 * The cookie banner, loaded on demand by CookieConsent.
 *
 * Non-modal and pinned to the bottom of the viewport, so the page stays
 * usable behind it: there is no cookie wall. Following the ICO's guidance,
 * "Accept all" and "Reject all" are equally prominent (same component,
 * variant and size), every optional category starts switched off, and
 * withdrawing is as easy as agreeing: "Cookie settings" reopens this at the
 * preferences panel, where "Reject all" is one click.
 */
export default function CookieBanner({
  current,
  fromSettings,
}: {
  /** The stored choice, or null when there isn't a current one. */
  current: Consent | null;
  /** Opened from a "Cookie settings" link rather than shown on arrival. */
  fromSettings: boolean;
}) {
  const [view, setView] = React.useState<"summary" | "preferences">(
    fromSettings ? "preferences" : "summary",
  );
  const [choice, setChoice] = React.useState<ConsentChoice>({
    functional: current?.functional ?? false,
    analytics: current?.analytics ?? false,
  });
  const region = React.useRef<HTMLDivElement>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  // Where focus goes back to when a panel opened from a link closes.
  const opener = React.useRef<HTMLElement | null>(null);

  // Being non-modal, the banner sits over the bottom of the page. Pad the
  // page by its height so everything, footer included, can still be scrolled
  // into view above it, and so an element reached with Tab is scrolled clear
  // of it rather than focused out of sight.
  React.useLayoutEffect(() => {
    const element = region.current;
    if (!element) return;
    const { body, documentElement: html } = document;
    const pad = () => {
      const height = `${element.offsetHeight}px`;
      body.style.paddingBottom = height;
      html.style.scrollPaddingBottom = height;
    };
    pad();
    const observer = new ResizeObserver(pad);
    observer.observe(element);
    return () => {
      observer.disconnect();
      body.style.paddingBottom = "";
      html.style.scrollPaddingBottom = "";
    };
  }, []);

  // Opened on request, or switched to the preferences: take focus there, as
  // the control that was used is gone. Shown on arrival, it leaves focus
  // alone, as a non-modal banner should.
  React.useEffect(() => {
    if (view === "summary") return;
    if (fromSettings && !opener.current) {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        opener.current = active;
      }
    }
    heading.current?.focus();
  }, [view, fromSettings]);

  const restoreFocus = () => {
    const target = opener.current;
    if (target?.isConnected) target.focus();
  };

  const decide = (next: ConsentChoice) => {
    if (!next.functional) {
      // Refused or withdrawn: delete what the category had stored.
      forgetRememberedAccount();
      clearPasskeyNudge();
    }
    // Analytics storage is cleaned up by PostHogProvider, which hears this.
    saveConsent(next);
    restoreFocus();
  };

  const acceptAll = () => decide({ functional: true, analytics: true });
  const rejectAll = () => decide({ functional: false, analytics: false });

  const close = () => {
    closeCookieSettings();
    restoreFocus();
  };

  return (
    <div
      ref={region}
      role="region"
      aria-label="Cookie consent"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
      onKeyDown={(event) => {
        if (fromSettings && event.key === "Escape") close();
      }}
    >
      <div className="pointer-events-auto mx-auto max-h-[calc(100svh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-xl border bg-background p-4 text-foreground shadow-lg animate-in fade-in slide-in-from-bottom-4 motion-reduce:animate-none sm:p-5">
        <h2
          ref={heading}
          tabIndex={-1}
          className="font-mono text-base font-semibold outline-none"
        >
          {view === "summary" ? "Cookies on The ID Game" : "Cookie settings"}
        </h2>

        {view === "summary" ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              We use cookies the game needs to work, like the one that keeps
              you signed in. With your permission we&apos;d also use analytics
              cookies to see how the game is played, and remember a couple of
              things on this device.{" "}
              <Link href={POLICY_HREF} className="font-medium text-foreground underline underline-offset-4">
                How we use cookies
              </Link>
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                variant="link"
                className="order-last h-auto self-center px-0 sm:order-first sm:mr-auto"
                onClick={() => setView("preferences")}
              >
                Manage preferences
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={rejectAll}>Reject all</Button>
                <Button onClick={acceptAll}>Accept all</Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose which cookies we can use. You can change your mind at any
              time from &ldquo;Cookie settings&rdquo;.{" "}
              <Link href={POLICY_HREF} className="font-medium text-foreground underline underline-offset-4">
                How we use cookies
              </Link>
            </p>
            <ul className="mt-3 divide-y border-y">
              <li className="flex items-start justify-between gap-4 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium" id="cookie-necessary">
                    Strictly necessary
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Keep you signed in and secure, and remember these choices.
                    The game can&apos;t work without them, so they are always
                    on.
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  Always on
                  <Switch checked disabled aria-labelledby="cookie-necessary" />
                </span>
              </li>
              {OPTIONAL.map(({ key, title, description }) => (
                <li key={key} className="flex items-start justify-between gap-4 py-3">
                  <div className="space-y-1">
                    <Label htmlFor={`cookie-${key}`}>{title}</Label>
                    <p
                      id={`cookie-${key}-description`}
                      className="text-xs text-muted-foreground"
                    >
                      {description}
                    </p>
                  </div>
                  <Switch
                    id={`cookie-${key}`}
                    className="mt-0.5"
                    checked={choice[key]}
                    onCheckedChange={(checked) =>
                      setChoice((prev) => ({ ...prev, [key]: checked }))
                    }
                    aria-describedby={`cookie-${key}-description`}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              {fromSettings && (
                <Button
                  variant="ghost"
                  className="order-last sm:order-first sm:mr-auto"
                  onClick={close}
                >
                  Cancel
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2 sm:ml-auto">
                <Button variant="outline" onClick={rejectAll}>
                  Reject all
                </Button>
                <Button variant="outline" onClick={acceptAll}>
                  Accept all
                </Button>
              </div>
              <Button onClick={() => decide(choice)}>Save preferences</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
