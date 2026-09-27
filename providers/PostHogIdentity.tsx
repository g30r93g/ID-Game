"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { nextIdentityAction } from "@/lib/posthog-identity";
import { posthog } from "@/providers/posthog-client";

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

  useEffect(() => {
    const action = nextIdentityAction({
      isPending,
      userId,
      identifiedAs: posthog._isIdentified() ? posthog.get_distinct_id() : null,
    });

    if (action === "none") return;
    if (action === "reset" || action === "reidentify") posthog.reset();
    // `userId` is always set for these two actions; the re-check is what lets
    // TypeScript see it, since the narrowing happens inside nextIdentityAction.
    if ((action === "identify" || action === "reidentify") && userId) {
      // This ID must match the server-side `game_join` capture, which uses the
      // Better Auth user document ID from api.auth.getCurrentUser.
      posthog.identify(userId, {
        ...(email ? { email } : {}),
        name,
        is_guest: isGuest,
      });
    }
  }, [isPending, userId, email, name, isGuest]);

  return null;
}
