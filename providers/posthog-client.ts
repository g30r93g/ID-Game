import posthog from "posthog-js";
import { publicEnv } from "@/lib/public-env";

// Initialised as the module loads rather than from an effect. Effects run
// children-first, so PostHogIdentity would otherwise reach a client that does
// not exist yet. The `window` guard is for SSR, where this module is still
// evaluated; `__loaded` keeps a fast refresh from re-initialising.
//
// Both PostHogProvider and PostHogIdentity import the client from here, so
// whichever of them loads first, init has already run.
if (typeof window !== "undefined" && !posthog.__loaded) {
  posthog.init(publicEnv.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: publicEnv.NEXT_PUBLIC_POSTHOG_API_HOST || "https://eu.i.posthog.com",
    ui_host: publicEnv.NEXT_PUBLIC_POSTHOG_UI_HOST,
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

export { posthog };
