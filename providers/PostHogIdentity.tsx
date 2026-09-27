"use client";

import { useEffect, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { nextIdentityAction } from "@/lib/posthog-identity";
import { whenLoaded } from "@/lib/analytics";
import { readConsent, subscribeConsent } from "@/lib/consent";

const analyticsAllowed = () => readConsent()?.analytics === true;

/**
 * Ties captured events to the signed-in account.
 *
 * Without this every browser event goes out under PostHog's anonymous device
 * ID, and because `person_profiles` is "identified_only" no person profile is
 * created at all — which left the server-side `game_join` capture (it uses the
 * Better Auth user ID) on a person of its own that nothing else ever touched.
 * Identifying aliases the anonymous ID onto the user ID, so the pageviews from
 * before sign-in land on the same person as everything after it.
 *
 * It lives in its own module, rendered only by the layouts where a session
 * matters (the signed-in routes, /admin and the invite page), so that public
 * pages don't ship the Better Auth client or call get-session. Like
 * PostHogProvider, render it in production only.
 *
 * Nothing happens without analytics consent. It is read here as well as in
 * lib/analytics.ts so that a yes given mid-session, in the banner or in
 * "Cookie settings", runs the effect again: whatever it queued before was
 * dropped with a no, or never queued while there was no answer.
 */
export function PostHogIdentity() {
  const { data: session, isPending } = authClient.useSession();
  // Destructured so the effect re-runs when the name changes in the user tray,
  // rather than on every new session object.
  const userId = session?.user?.id;
  const isGuest = !!session?.user?.isAnonymous;
  // A guest's email is a generated placeholder; don't put it on the person.
  const email = isGuest ? undefined : session?.user?.email;
  const name = session?.user?.name;
  const allowed = useSyncExternalStore(
    subscribeConsent,
    analyticsAllowed,
    () => false,
  );

  useEffect(() => {
    if (!allowed) return;
    // The decision reads the live client, so the whole of it waits for
    // posthog-js to load rather than queueing plain identify/reset calls.
    // Each render's decision runs in turn, against the state the previous one
    // left behind.
    whenLoaded((posthog) => {
      const action = nextIdentityAction({
        isPending,
        userId,
        identifiedAs: posthog._isIdentified() ? posthog.get_distinct_id() : null,
      });

      if (action === "none") return;
      if (action === "reset" || action === "reidentify") posthog.reset();
      // `userId` is always set for these two actions; the re-check is what
      // lets TypeScript see it, since the narrowing happens inside
      // nextIdentityAction.
      if ((action === "identify" || action === "reidentify") && userId) {
        // This ID must match the server-side `game_join` capture, which uses
        // the Better Auth user document ID from api.auth.getCurrentUser.
        posthog.identify(userId, {
          ...(email ? { email } : {}),
          name,
          is_guest: isGuest,
        });
      }
    });
  }, [allowed, isPending, userId, email, name, isGuest]);

  return null;
}
