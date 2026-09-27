import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("backfillTimesSelected stores each scenario's exact selection count", async () => {
  const t = convexTest(schema, modules);

  await t.run(async (ctx) => {
    const picked = await ctx.db.insert("scenarios", {
      description: "picked twice",
      category: "c",
    });
    const drawn = await ctx.db.insert("scenarios", {
      description: "drawn, never picked",
      category: "c",
      timesSelected: 4,
    });
    await ctx.db.insert("scenarios", {
      description: "already right",
      category: "c",
      timesSelected: 0,
    });

    const gameId = await ctx.db.insert("games", {
      joinCode: "MIG001",
      totalRounds: 2,
      isOpen: false,
      createdBy: "me",
    });
    const hostPlayerId = await ctx.db.insert("players", {
      userId: "me",
      gameId,
      displayName: "Me",
    });
    for (const roundNumber of [1, 2]) {
      const roundId = await ctx.db.insert("gameRounds", {
        gameId,
        roundNumber,
        hostPlayerId,
        phase: "finished",
      });
      await ctx.db.insert("gameRoundScenarios", {
        gameId,
        roundId,
        scenarioId: picked,
        selected: true,
      });
      await ctx.db.insert("gameRoundScenarios", {
        gameId,
        roundId,
        scenarioId: drawn,
        selected: false,
      });
    }
  });

  const result = await t.mutation(
    internal.migrations.backfillTimesSelected,
    {},
  );
  expect(result).toEqual({ scenarios: 3, updated: 2 });

  const counts = await t.run(async (ctx) => {
    const scenarios = await ctx.db.query("scenarios").collect();
    return Object.fromEntries(
      scenarios.map((s) => [s.description, s.timesSelected]),
    );
  });
  expect(counts).toEqual({
    "picked twice": 2,
    "drawn, never picked": 0,
    "already right": 0,
  });

  // Nothing left to change the second time around.
  expect(
    await t.mutation(internal.migrations.backfillTimesSelected, {}),
  ).toEqual({ scenarios: 3, updated: 0 });
});
