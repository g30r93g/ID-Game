"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { capture, setAnalyticsConsent } from "@/lib/analytics";
import { readConsent, subscribeConsent } from "@/lib/consent";

// Loading and pageviews only. Identity is PostHogIdentity's job, rendered by
// the layouts that have a session, so that this provider (on every page)
// doesn't pull in the Better Auth client.
//
// There is no React context any more: components call lib/analytics.ts
// directly, which is what keeps posthog-js out of every page's entry chunks.
// This only hands it the visitor's cookie choice, now and whenever the banner
// changes it. With a yes, that starts the lazy load, which waits for the page
// to finish loading; with no answer yet, it loads nothing.
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const sync = () => setAnalyticsConsent(readConsent()?.analytics ?? null);
    sync();
    return subscribeConsent(sync);
  }, []);

  return (
    <>
      <SuspendedPostHogPageView />
      {children}
    </>
  );
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track pageviews
  useEffect(() => {
    if (pathname) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + "?" + searchParams.toString();
      }

      // Both set here rather than left to posthog-js, which reads them off
      // `location` when the event is sent: the first pageview waits in a queue
      // until the library loads, and the visitor may have moved on by then.
      capture("$pageview", { $current_url: url, $pathname: pathname });
    }
  }, [pathname, searchParams]);

  return null;
}

// Wrap PostHogPageView in Suspense to avoid the useSearchParams usage above
// from de-opting the whole app into client-side rendering
// See: https://nextjs.org/docs/messages/deopted-into-client-rendering
function SuspendedPostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  );
}
