import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
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
// "migrations:backfillGameTimestamps" fails `tsc`. Use the real function
// references from `internal.migrations` instead; behavior is identical (see
// the installed @convex-dev/migrations@0.3.5 type at
// node_modules/@convex-dev/migrations/dist/client/index.d.ts:137).
export const runAll = migrations.runner([
  internal.migrations.backfillGameTimestamps,
]);
