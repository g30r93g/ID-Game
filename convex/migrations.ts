import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { countUser, userCounts } from "./userCounts";

export const migrations = new Migrations<DataModel>(components.migrations);

/**
 * Exact backfill: count selected gameRoundScenarios per scenario and store it.
 */
export const backfillTimesSelected = migrations.define({
  table: "scenarios",
  migrateOne: async (ctx, scenario) => {
    const selectedRows = await ctx.db
      .query("gameRoundScenarios")
      .filter((q) =>
        q.and(
          q.eq(q.field("scenarioId"), scenario._id),
          q.eq(q.field("selected"), true),
        ),
      )
      .collect();
    return { timesSelected: selectedRows.length };
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
        .withIndex("byGame", (q) => q.eq("gameId", game._id))
        .collect();
      const reachedFinal = rounds.some((r) => r.roundNumber === game.totalRounds);
      if (reachedFinal) {
        patch.completedAt = Math.max(...rounds.map((r) => r._creationTime));
      }
    }
    return patch;
  },
});

// Deviation from brief: `Migrations#runner` types its argument as
// `MigrationFunctionReference | MigrationFunctionReference[]` (actual function
// references), not migration name strings — passing string literals like
// "migrations:backfillTimesSelected" fails `tsc`. Use the real function
// references from `internal.migrations` instead; behavior is identical (see
// the installed @convex-dev/migrations@0.3.5 type at
// node_modules/@convex-dev/migrations/dist/client/index.d.ts:137).
export const runAll = migrations.runner([
  internal.migrations.backfillTimesSelected,
  internal.migrations.backfillGameTimestamps,
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
