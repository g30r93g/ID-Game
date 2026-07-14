import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

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
