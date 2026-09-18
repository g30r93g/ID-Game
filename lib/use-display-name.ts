"use client";

import * as React from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

/**
 * Saves a display name to the signed-in account and propagates it to the
 * games the user is already in.
 *
 * The two steps are separate on purpose: `updateUser` owns the account, while
 * players rows hold a snapshot taken when the game was created or joined, so a
 * rename that stopped at the account would leave an "Unknown Player" card on
 * screen for everyone else in the lobby.
 *
 * Resolves to an error message to show the user, or `null` on success.
 */
export function useSaveDisplayName() {
  const syncDisplayName = useMutation(api.game.syncDisplayName);

  return React.useCallback(
    async (name: string): Promise<string | null> => {
      const trimmed = name.trim();
      if (!trimmed) return "Enter a name so other players know who you are.";

      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        return error.message ?? "Could not save your name. Try again.";
      }

      // The account is the source of truth and it is already updated, so a
      // failure here is not worth blocking on — the rows catch up the next
      // time the name is saved, and new games pick it up regardless.
      try {
        await syncDisplayName({});
      } catch (syncError) {
        console.error("Could not refresh display name on games", syncError);
      }

      return null;
    },
    [syncDisplayName],
  );
}
