import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("startNewGameRound sets startedAt on round 1", async () => {
  const t = convexTest(schema, modules);
  const gameId = await t.run(async (ctx) => {
    const gid = await ctx.db.insert("games", {
      joinCode: "ABC123",
      totalRounds: 3,
      isOpen: true,
      createdBy: "user1",
    });
    await ctx.db.insert("players", {
      userId: "user1",
      gameId: gid,
      displayName: "P1",
      lastAlive: 0,
    });
    return gid;
  });

  await t.mutation(api.game.startNewGameRound, { game: gameId });

  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(typeof game?.startedAt).toBe("number");
});

async function seedGameWithRound(
  t: ReturnType<typeof convexTest>,
  opts: { totalRounds: number; roundNumber: number },
) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "FIN123",
      totalRounds: opts.totalRounds,
      currentRound: opts.roundNumber,
      isOpen: false,
      createdBy: "host",
      startedAt: 1000,
    });
    const hostPlayerId = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "Host",
      lastAlive: 0,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: opts.roundNumber,
      hostPlayerId,
      phase: "display-results",
    });
    return { gameId, roundId };
  });
}

test("transitionRoundPhase sets completedAt on the final round finishing", async () => {
  const t = convexTest(schema, modules);
  const { gameId, roundId } = await seedGameWithRound(t, { totalRounds: 3, roundNumber: 3 });

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, { gameRoundId: roundId, toPhase: "finished" });

  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(typeof game?.completedAt).toBe("number");
});

test("transitionRoundPhase does NOT set completedAt on a non-final round", async () => {
  const t = convexTest(schema, modules);
  const { gameId, roundId } = await seedGameWithRound(t, { totalRounds: 3, roundNumber: 2 });

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, { gameRoundId: roundId, toPhase: "finished" });

  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(game?.completedAt).toBeUndefined();
});

test("selectGameRoundScenario increments the scenario's timesSelected", async () => {
  const t = convexTest(schema, modules);
  const { gameRoundScenarioId, roundId, scenarioId } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "SEL123",
      totalRounds: 1,
      currentRound: 1,
      isOpen: false,
      createdBy: "host",
    });
    const hostPlayerId = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "Host",
      lastAlive: 0,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId,
      phase: "pick-scenario",
    });
    const scenarioId = await ctx.db.insert("scenarios", {
      description: "Most likely to be late",
      category: "General",
      timesSelected: 0,
    });
    const gameRoundScenarioId = await ctx.db.insert("gameRoundScenarios", {
      gameId,
      roundId,
      scenarioId,
      selected: false,
    });
    return { gameRoundScenarioId, roundId, scenarioId };
  });

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.selectGameRoundScenario, {
      gameRoundId: roundId,
      gameRoundScenarioId,
    });

  const scenario = await t.run((ctx) => ctx.db.get(scenarioId));
  expect(scenario?.timesSelected).toBe(1);
});
