"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";

/** What the presence components need to know about a player, liveness aside. */
export type RosterPlayer = Pick<
  Doc<"players">,
  "_id" | "displayName" | "active"
>;

/**
 * Each player's newest heartbeat, by player id; undefined while loading.
 *
 * Heartbeats land every 15s per player, so only the components that show
 * liveness should call this: every caller re-renders on every beat. Convex
 * shares one subscription between all callers with the same game.
 */
export function usePresence(
  gameId: Id<"games">,
): ReadonlyMap<Id<"players">, number> | undefined {
  const rows = useQuery(api.game.getPresenceForGame, { gameId });
  return useMemo(
    () => rows && new Map(rows.map((row) => [row.playerId, row.lastAlive])),
    [rows],
  );
}
