import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { countUser, userCounts } from "./userCounts";
import { groupTimesSelected } from "../lib/admin/metrics";

export const migrations = new Migrations<DataModel>(components.migrations);

/**
 * Exact backfill: count selected gameRoundScenarios per scenario and store it.
 * `selectGameRoundScenario` keeps the count current, so this only matters for
 * scenarios picked before the counter existed; it is safe to re-run.
 *
 * One pass over each table in a single transaction, rather than a migration
 * over scenarios that scanned every round scenario once per scenario. Being
 * one transaction, it can't race a selection made while it runs. It is not a
 * `migrations.define` migration, so `runAll` no longer includes it: run it
 * directly with `npx convex run migrations:backfillTimesSelected`.
 */
export const backfillTimesSelected = internalMutation({
  args: {},
  returns: v.object({ scenarios: v.number(), updated: v.number() }),
  handler: async (ctx) => {
    // No index leads with `selected`, so this reads the whole table once.
    const roundScenarios = await ctx.db.query("gameRoundScenarios").collect();
    const counts = groupTimesSelected(
      roundScenarios.filter((row) => row.selected),
    );

    const scenarios = await ctx.db.query("scenarios").collect();
    let updated = 0;
    for (const scenario of scenarios) {
      const timesSelected = counts.get(scenario._id) ?? 0;
      if (scenario.timesSelected === timesSelected) continue;
      await ctx.db.patch(scenario._id, { timesSelected });
      updated += 1;
    }

    return { scenarios: scenarios.length, updated };
  },
});

/**
 * Approximate backfill for historical games: startedAt ~= creation time;
 * completedAt ~= latest round creation time, but only if the game reached its
 * final round. New games are stamped exactly by the mutations.
 */
export const backfillGameTimestamps = migrations.define({
  table: "games",
  migrateOne: async (ctx, game) => {
    const patch: { startedAt?: number; completedAt?: number } = {};
    if (game.startedAt === undefined) patch.startedAt = game._creationTime;

    if (game.completedAt === undefined && game.totalRounds > 0) {
      const rounds = await ctx.db
        .query("gameRounds")
        .withIndex("byGameRound", (q) => q.eq("gameId", game._id))
        .collect();
      const reachedFinal = rounds.some((r) => r.roundNumber === game.totalRounds);
      if (reachedFinal) {
        patch.completedAt = Math.max(...rounds.map((r) => r._creationTime));
      }
    }
    return patch;
  },
});

/**
 * Clears `players.lastAlive`, which nothing reads or writes any more: every
 * heartbeat lives in `playerPresence`. Idempotent: a player without the field
 * is left alone. Once it has finished in every deployment, the field can be
 * dropped from the schema. Run it after deploying with:
 *   pnpm exec convex run migrations:clearPlayersLastAlive
 */
export const clearPlayersLastAlive = migrations.define({
  table: "players",
  migrateOne: (_ctx, player) => {
    if (player.lastAlive !== undefined) return { lastAlive: undefined };
  },
});

// Deviation from brief: `Migrations#runner` types its argument as
// `MigrationFunctionReference | MigrationFunctionReference[]` (actual function
// references), not migration name strings — passing string literals like
// "migrations:backfillGameTimestamps" fails `tsc`. Use the real function
// references from `internal.migrations` instead; behavior is identical (see
// the installed @convex-dev/migrations@0.3.5 type at
// node_modules/@convex-dev/migrations/dist/client/index.d.ts:137).
export const runAll = migrations.runner([
  internal.migrations.backfillGameTimestamps,
  internal.migrations.clearPlayersLastAlive,
]);

/** Users counted per backfill run. */
const USER_COUNT_BATCH_SIZE = 200;

/**
 * Seeds the admin user counts (convex/userCounts.ts) with the users that
 * existed before the Better Auth triggers started maintaining them.
 *
 * `migrations.define` only walks app tables, and `user` lives in the Better
 * Auth component, so this pages through the component's adapter the way
 * `cleanup.deleteExpiredGuests` does, scheduling itself until it reaches the
 * end. Deploy the triggers first, then run:
 *   pnpm exec convex run migrations:backfillUserCounts '{}'
 * Counting is idempotent, so users created while it runs (already counted by
 * the trigger) aren't counted twice, and a second run changes nothing.
 *
 * To repair drift, run it with `{"reset": true}`: the counts are cleared, then
 * rebuilt. They read low until the run finishes.
 */
export const backfillUserCounts = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    reset: v.optional(v.boolean()),
  },
  returns: v.object({ counted: v.number(), continued: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.reset && args.cursor === undefined) {
      await userCounts.clear(ctx, { namespace: "account" });
      await userCounts.clear(ctx, { namespace: "guest" });
    }

    const users = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      select: ["_id", "isAnonymous"],
      paginationOpts: {
        cursor: args.cursor ?? null,
        numItems: USER_COUNT_BATCH_SIZE,
      },
    });
    for (const user of users.page as {
      _id: string;
      isAnonymous?: boolean | null;
    }[]) {
      await countUser(ctx, user);
    }

    const continued = !users.isDone;
    if (continued) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillUserCounts, {
        cursor: users.continueCursor,
      });
    }
    return { counted: users.page.length, continued };
  },
});
