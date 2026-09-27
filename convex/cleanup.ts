import { v } from "convex/values";
import { createFunctionHandle } from "convex/server";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { evaluateContinuity } from "../lib/continuable";
import { canDeleteGuest, GUEST_GRACE_PERIOD_MS } from "../lib/guest";
import { loadPresence, newestHeartbeat } from "./presence";

/**
 * Games inspected per transaction. Each costs a read of its players and their
 * presence rows, and a heartbeat in any of them conflicts with the sweep, so
 * batches stay small; a longer candidate list carries on in follow-up runs.
 */
const BATCH_SIZE = 25;

/**
 * Marks games that have been abandoned rather than merely left, applying the
 * same rules the join screen applies live (lib/continuable.ts). Marking is not
 * required for correct display — `getMyActiveGames` evaluates the rules on
 * every read — it exists so that state derived from "is this game live",
 * namely the admin `activeNow` stat and the `createGame` dedupe, stops
 * counting games nobody is coming back to.
 *
 * Candidates are games neither finished nor already marked, oldest first.
 * Continuable games stay in that range, so a full page continues in a
 * follow-up run from where this one stopped: however many games are live,
 * every candidate is reached in each sweep. Marking a game moves it out of the range, behind the
 * cursor, so it is not read twice.
 *
 * Nothing is deleted. `sendHeartbeat` clears the mark if a player returns.
 */
export const markAbandonedGames = internalMutation({
  args: {
    // Set only on a continuation, which keeps the first run's clock so the
    // whole sweep judges games against the same moment.
    cursor: v.optional(v.string()),
    now: v.optional(v.number()),
  },
  returns: v.object({
    inspected: v.number(),
    marked: v.number(),
    continued: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();

    const candidates = await ctx.db
      .query("games")
      .withIndex("byAbandonedAtCompletedAt", (q) =>
        q.eq("abandonedAt", undefined).eq("completedAt", undefined),
      )
      .order("asc")
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });

    let marked = 0;
    for (const game of candidates.page) {
      const [players, presence] = await Promise.all([
        ctx.db
          .query("players")
          .withIndex("byGame", (q) => q.eq("gameId", game._id))
          .collect(),
        loadPresence(ctx, game._id),
      ]);
      const activePlayers = players.filter((p) => p.active !== false);
      const lastActivityAt = newestHeartbeat(activePlayers, presence);

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

    const continued = !candidates.isDone;
    if (continued) {
      await ctx.scheduler.runAfter(0, internal.cleanup.markAbandonedGames, {
        cursor: candidates.continueCursor,
        now,
      });
    }

    return { inspected: candidates.page.length, marked, continued };
  },
});

/**
 * Guests inspected per transaction. Each costs a session lookup plus, when
 * deleted, a couple of writes, so this stays well inside Convex's limits; a
 * backlog carries on in a follow-up run rather than one oversized mutation.
 */
const GUEST_BATCH_SIZE = 100;

/**
 * Deletes guest (anonymous) accounts nobody can use any more: older than the
 * grace period and with every session expired. A guest has no credential to
 * sign back in with, so once its sessions lapse it is unreachable for good.
 * Guests who sign up are already deleted by the anonymous plugin when their
 * seats move to the new account (see `onLinkAccount` in convex/auth.ts).
 *
 * Reads and writes the Better Auth component's tables through its adapter
 * functions, the same ones Better Auth itself uses. Guests are listed on the
 * user table's `isAnonymous` index, oldest first, so a run stops at the first
 * guest still inside the grace period: everything after it is newer. A full
 * page continues in a follow-up run from where this one stopped, so a guest
 * kept for a live session is never read twice in one sweep.
 *
 * `players` rows are left alone: game history refers to them by user id, and
 * nothing requires that user to still exist.
 */
export const deleteExpiredGuests = internalMutation({
  args: {
    // Set only on a continuation, which keeps the first run's cutoff so the
    // sweep stays one consistent query.
    cursor: v.optional(v.string()),
    cutoff: v.optional(v.number()),
  },
  returns: v.object({
    inspected: v.number(),
    deleted: v.number(),
    continued: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const cutoff = args.cutoff ?? now - GUEST_GRACE_PERIOD_MS;

    const guests = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      where: [{ field: "isAnonymous", value: true }],
      paginationOpts: {
        cursor: args.cursor ?? null,
        numItems: GUEST_BATCH_SIZE,
      },
    });

    // A direct adapter call runs no triggers unless handed one, and the guest
    // count (convex/userCounts.ts) would drift without it.
    const onDeleteHandle = await createFunctionHandle(internal.auth.onDelete);

    let inspected = 0;
    let deleted = 0;
    let reachedGracePeriod = false;
    for (const guest of guests.page as { _id: string; createdAt: number }[]) {
      if (guest.createdAt >= cutoff) {
        reachedGracePeriod = true;
        break;
      }
      inspected += 1;

      const sessions = await ctx.runQuery(
        components.betterAuth.adapter.findMany,
        {
          model: "session",
          where: [{ field: "userId", value: guest._id }],
          paginationOpts: { cursor: null, numItems: 100 },
        },
      );
      const expiries = (sessions.page as { expiresAt: number }[]).map(
        (session) => session.expiresAt,
      );
      // Kept for a session that is still live: whoever holds it can play on.
      if (!canDeleteGuest(guest.createdAt, expiries, now)) continue;
      // A session can't be live here, but expired rows still belong to the
      // guest, and the anonymous plugin removes them the same way.
      if (sessions.page.length > 0) {
        await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
          input: {
            model: "session",
            where: [{ field: "userId", value: guest._id }],
          },
          paginationOpts: { cursor: null, numItems: 100 },
        });
      }
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "user",
          where: [{ field: "_id", value: guest._id }],
        },
        onDeleteHandle,
      });
      deleted += 1;
    }

    const continued = !reachedGracePeriod && !guests.isDone;
    if (continued) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deleteExpiredGuests, {
        cursor: guests.continueCursor,
        cutoff,
      });
    }

    return { inspected, deleted, continued };
  },
});
