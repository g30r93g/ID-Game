"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import posthog from "posthog-js";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

/**
 * The outcome of saving a display name.
 *
 * `propagated` separates a clean save from one where the account took the new
 * name but the players rows did not. Callers have to say which happened rather
 * than claim an unqualified success: the cards other players see are the point
 * of the rename, so "saved" with stale cards is not the same as "done".
 */
export type SaveDisplayNameResult =
  | { ok: false; message: string }
  | { ok: true; propagated: boolean };

/**
 * Reports a display-name failure to PostHog.
 *
 * Both halves of the save can fail without the user ever reaching a server log
 * — a rejected `updateUser` never gets past the browser, and a `syncDisplayName`
 * that is never dispatched leaves no trace in Convex at all. Without this the
 * only record is a `console.error` on someone else's device.
 *
 * Guarded on `__loaded` because the PostHog provider is mounted in production
 * only, so in development the client here is an uninitialised stub.
 */
const reportFailure = (error: unknown, stage: "account" | "propagate") => {
  if (!posthog.__loaded) return;
  posthog.captureException(error, { feature: "display-name", stage });
};

/**
 * Saves a display name to the signed-in account and propagates it to the
 * games the user is already in.
 *
 * The two steps are separate on purpose: `updateUser` owns the account, while
 * players rows hold a snapshot taken when the game was created or joined, so a
 * rename that stopped at the account would leave an "Unknown Player" card on
 * screen for everyone else in the lobby.
 */
export function useSaveDisplayName() {
  const syncDisplayName = useMutation(api.game.syncDisplayName);

  return React.useCallback(
    async (name: string): Promise<SaveDisplayNameResult> => {
      const trimmed = name.trim();
      if (!trimmed) {
        return {
          ok: false,
          message: "Enter a name so other players know who you are.",
        };
      }

      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        reportFailure(error, "account");
        return {
          ok: false,
          message: error.message ?? "Could not save your name. Try again.",
        };
      }

      // The account is the source of truth and it is already updated, so a
      // failure here doesn't lose the name and isn't worth blocking on — the
      // rows catch up the next time the name is saved, and new games pick it up
      // regardless. It is still a partial save, so it is reported as one.
      try {
        await syncDisplayName({});
      } catch (syncError) {
        console.error("Could not refresh display name on games", syncError);
        reportFailure(syncError, "propagate");
        return { ok: true, propagated: false };
      }

      return { ok: true, propagated: true };
    },
    [syncDisplayName],
  );
}
