"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, Suspense } from "react";
import { usePostHog } from "posthog-js/react";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { env } from "@/app/env";
import { authClient } from "@/lib/auth-client";
import { nextIdentityAction } from "@/lib/posthog-identity";

// Initialised as the module loads rather than from an effect. Effects run
// children-first, so PostHogIdentity would otherwise reach a client that does
// not exist yet. The `window` guard is for SSR, where this module is still
// evaluated; `__loaded` keeps a fast refresh from re-initialising.
if (typeof window !== "undefined" && !posthog.__loaded) {
  posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY as string, {
    api_host: env.NEXT_PUBLIC_POSTHOG_API_HOST || "https://eu.i.posthog.com",
    ui_host: env.NEXT_PUBLIC_POSTHOG_UI_HOST,
    person_profiles: "identified_only", // or 'always' to create profiles for anonymous users as well
    capture_pageview: false, // Disable automatic pageview capture, as we capture manually
    capture_pageleave: true,
    // Client-side failures used to end at a console.error on someone else's
    // device: a mutation that never reaches Convex leaves no server log at
    // all, so there was nothing to look at afterwards. Autocapture covers
    // unhandled errors and rejections; deliberate reports go through
    // posthog.captureException (see lib/use-display-name.ts).
    capture_exceptions: true,
  });
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <PHProvider client={posthog}>
      <SuspendedPostHogPageView />
      <PostHogIdentity />
      {children}
    </PHProvider>
  );
}

/**
 * Ties captured events to the signed-in account.
 *
 * Without this every browser event goes out under PostHog's anonymous device
 * ID, and because `person_profiles` is "identified_only" no person profile is
 * created at all — which left the server-side `game_join` capture (it uses the
 * Better Auth user ID) on a person of its own that nothing else ever touched.
 * Identifying aliases the anonymous ID onto the user ID, so the pageviews from
 * before sign-in land on the same person as everything after it.
 */
function PostHogIdentity() {
  const { data: session, isPending } = authClient.useSession();
  // Destructured so the effect re-runs when the name changes in the user tray,
  // rather than on every new session object.
  const userId = session?.user?.id;
  const email = session?.user?.email;
  const name = session?.user?.name;

  useEffect(() => {
    const action = nextIdentityAction({
      isPending,
      userId,
      identifiedAs: posthog._isIdentified() ? posthog.get_distinct_id() : null,
    });

    if (action === "none") return;
    if (action === "reset" || action === "reidentify") posthog.reset();
    if (action === "identify" || action === "reidentify") {
      // This ID must match the server-side `game_join` capture, which uses the
      // Better Auth user document ID from api.auth.getCurrentUser.
      posthog.identify(userId, { email, name });
    }
  }, [isPending, userId, email, name]);

  return null;
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  // Track pageviews
  useEffect(() => {
    if (pathname && posthog) {
      let url = window.origin + pathname;
      if (searchParams.toString()) {
        url = url + "?" + searchParams.toString();
      }

      posthog.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, posthog]);

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
