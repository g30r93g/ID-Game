import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { evaluateContinuity } from "../lib/continuable";

/**
 * Games inspected per run. The candidate set is only games that are neither
 * finished nor already marked, so in practice a run sees a handful. The bound
 * keeps a single mutation inside Convex's transaction limits if that set ever
 * grows; the next hourly run picks up the remainder.
 */
const BATCH_SIZE = 200;

/**
 * Marks games that have been abandoned rather than merely left, applying the
 * same rules the join screen applies live (lib/continuable.ts). Marking is not
 * required for correct display — `getMyActiveGames` evaluates the rules on
 * every read — it exists so that state derived from "is this game live",
 * namely the admin `activeNow` stat and the `createGame` dedupe, stops
 * counting games nobody is coming back to.
 *
 * Nothing is deleted. `sendHeartbeat` clears the mark if a player returns.
 */
export const markAbandonedGames = internalMutation({
  args: {},
  returns: v.object({ inspected: v.number(), marked: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();

    const candidates = await ctx.db
      .query("games")
      .withIndex("byAbandonedAtCompletedAt", (q) =>
        q.eq("abandonedAt", undefined).eq("completedAt", undefined),
      )
      .order("asc")
      .take(BATCH_SIZE);

    let marked = 0;
    for (const game of candidates) {
      const players = await ctx.db
        .query("players")
        .withIndex("byGame", (q) => q.eq("gameId", game._id))
        .collect();
      const activePlayers = players.filter((p) => p.active !== false);
      const lastActivityAt = activePlayers.reduce(
        (newest, p) => Math.max(newest, p.lastAlive),
        0,
      );

      const continuity = evaluateContinuity(
        {
          startedAt: game.startedAt,
          lastActivityAt,
          activePlayerCount: activePlayers.length,
        },
        now,
      );
      if (continuity.continuable) continue;

      await ctx.db.patch(game._id, { abandonedAt: now });
      marked += 1;
    }

    return { inspected: candidates.length, marked };
  },
});
