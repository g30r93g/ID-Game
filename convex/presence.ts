import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { isConnected } from "../lib/presence";

// Reads and writes of `playerPresence`, the table heartbeats land in. Kept
// here, not in game.ts, because the cleanup cron reads presence too.

/** Newest heartbeat per player id, for every player in a game with a row. */
export type PresenceByPlayer = ReadonlyMap<Id<"players">, number>;

export async function loadPresence(
  ctx: Pick<QueryCtx, "db">,
  gameId: Id<"games">,
): Promise<PresenceByPlayer> {
  const rows = await ctx.db
    .query("playerPresence")
    .withIndex("byGame", (q) => q.eq("gameId", gameId))
    .collect();
  return new Map(rows.map((row) => [row.playerId, row.lastAlive]));
}

/**
 * Whether a player's newest heartbeat is recent enough to count as connected.
 * A player with no presence row has no heartbeat on record, so is not.
 */
export function isPlayerConnected(
  playerId: Id<"players">,
  presence: PresenceByPlayer,
  now: number,
): boolean {
  const lastAlive = presence.get(playerId);
  return lastAlive !== undefined && isConnected(lastAlive, now);
}

/**
 * The newest heartbeat among `players`, or 0 if none of them has a presence
 * row: a player with no row adds no activity.
 */
export function newestHeartbeat(
  players: Pick<Doc<"players">, "_id">[],
  presence: PresenceByPlayer,
): number {
  return players.reduce(
    (newest, p) => Math.max(newest, presence.get(p._id) ?? 0),
    0,
  );
}

/** Stamps a heartbeat, creating the player's row on the first one. */
export async function recordHeartbeat(
  ctx: Pick<MutationCtx, "db">,
  player: Pick<Doc<"players">, "_id" | "gameId">,
  now: number,
) {
  const row = await ctx.db
    .query("playerPresence")
    .withIndex("byPlayer", (q) => q.eq("playerId", player._id))
    .unique();
  if (row) {
    await ctx.db.patch(row._id, { lastAlive: now });
  } else {
    await ctx.db.insert("playerPresence", {
      gameId: player.gameId,
      playerId: player._id,
      lastAlive: now,
    });
  }
}

export async function deletePresence(
  ctx: Pick<MutationCtx, "db">,
  playerId: Id<"players">,
) {
  const row = await ctx.db
    .query("playerPresence")
    .withIndex("byPlayer", (q) => q.eq("playerId", playerId))
    .unique();
  if (row) await ctx.db.delete(row._id);
}
