import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

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
 * A player's newest heartbeat. Players from before the presence table have no
 * row until their next beat; their `players.lastAlive` is the last one they
 * sent, so old games need no migration.
 */
export function lastAliveFor(
  player: Doc<"players">,
  presence: PresenceByPlayer,
): number {
  return presence.get(player._id) ?? player.lastAlive;
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
