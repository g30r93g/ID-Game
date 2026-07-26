import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

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

test("transitionRoundPhase sets completedAt when the final round shows results", async () => {
  const t = convexTest(schema, modules);
  // Normal play ends the final round at display-results (then the rate flow),
  // never reaching "finished" — so this transition is where completion is
  // recorded server-side.
  const { gameId, roundId } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "RES123",
      totalRounds: 3,
      currentRound: 3,
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
      roundNumber: 3,
      hostPlayerId,
      phase: "guess-scenario",
    });
    return { gameId, roundId };
  });

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, {
      gameRoundId: roundId,
      toPhase: "display-results",
    });

  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(typeof game?.completedAt).toBe("number");
});

async function seedRoundWithPhase(
  t: ReturnType<typeof convexTest>,
  phase:
    | "create-scenarios"
    | "pick-scenario"
    | "rank-players"
    | "guess-scenario"
    | "display-results"
    | "finished",
) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "PHS123",
      totalRounds: 3,
      currentRound: 1,
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
      roundNumber: 1,
      hostPlayerId,
      phase,
    });
    return { gameId, roundId };
  });
}

test("transitionRoundPhase rejects an illegal phase skip", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithPhase(t, "pick-scenario");

  await expect(
    t.withIdentity({ subject: "host" }).mutation(api.game.transitionRoundPhase, {
      gameRoundId: roundId,
      toPhase: "finished",
    }),
  ).rejects.toThrow(/Illegal phase transition/);
});

test("transitionRoundPhase allows the legal next phase", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithPhase(t, "pick-scenario");

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, {
      gameRoundId: roundId,
      toPhase: "rank-players",
    });

  const round = await t.run((ctx) => ctx.db.get(roundId));
  expect(round?.phase).toBe("rank-players");
});

test("transitionRoundPhase tolerates a no-op transition to the same phase", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithPhase(t, "guess-scenario");

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, {
      gameRoundId: roundId,
      toPhase: "guess-scenario",
    });

  const round = await t.run((ctx) => ctx.db.get(roundId));
  expect(round?.phase).toBe("guess-scenario");
});

// A round with the answer already chosen, plus a non-host player, so the
// "can a guesser see the answer" question can be asked in any phase.
async function seedRoundWithSelectedScenario(
  t: ReturnType<typeof convexTest>,
  phase: "pick-scenario" | "rank-players" | "guess-scenario" | "display-results",
) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "LEAK01",
      totalRounds: 3,
      currentRound: 1,
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
    await ctx.db.insert("players", {
      userId: "guesser",
      gameId,
      displayName: "Guesser",
      lastAlive: 0,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId,
      phase,
    });
    const answerId = await ctx.db.insert("scenarios", {
      description: "Most likely to lose their phone",
      category: "General",
    });
    const decoyId = await ctx.db.insert("scenarios", {
      description: "Most likely to cry at a film",
      category: "General",
    });
    await ctx.db.insert("gameRoundScenarios", {
      gameId,
      roundId,
      scenarioId: answerId,
      selected: true,
    });
    await ctx.db.insert("gameRoundScenarios", {
      gameId,
      roundId,
      scenarioId: decoyId,
      selected: false,
    });
    return { gameId, roundId };
  });
}

test("gameRoundScenarios hides the selected flag from non-hosts mid-round", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithSelectedScenario(t, "guess-scenario");

  const asGuesser = await t
    .withIdentity({ subject: "guesser" })
    .query(api.game.gameRoundScenarios, { gameRound: roundId });

  expect(asGuesser).toHaveLength(2);
  expect(asGuesser.filter((scenario) => scenario.selected)).toHaveLength(0);
});

test("gameRoundScenarios still reveals the selected flag to the round host", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithSelectedScenario(t, "guess-scenario");

  const asHost = await t
    .withIdentity({ subject: "host" })
    .query(api.game.gameRoundScenarios, { gameRound: roundId });

  expect(asHost.filter((scenario) => scenario.selected)).toHaveLength(1);
});

test("gameRoundScenarios reveals the selected flag to everyone at display-results", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithSelectedScenario(t, "display-results");

  const asGuesser = await t
    .withIdentity({ subject: "guesser" })
    .query(api.game.gameRoundScenarios, { gameRound: roundId });

  expect(asGuesser.filter((scenario) => scenario.selected)).toHaveLength(1);
});

test("getCorrectAnswer withholds the answer before results", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithSelectedScenario(t, "guess-scenario");

  const answer = await t
    .withIdentity({ subject: "guesser" })
    .query(api.game.getCorrectAnswer, { roundId });

  expect(answer).toBeNull();
});

test("getCorrectAnswer returns the answer once results are shown", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithSelectedScenario(t, "display-results");

  const answer = await t
    .withIdentity({ subject: "guesser" })
    .query(api.game.getCorrectAnswer, { roundId });

  expect(answer).toBe("Most likely to lose their phone");
});

// Two categories with enough scenarios each that a 10-scenario draw succeeds
// from either, so a re-draw can be told apart by category.
async function seedCategoryRound(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "CAT001",
      totalRounds: 3,
      currentRound: 1,
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
    await ctx.db.insert("players", {
      userId: "guesser",
      gameId,
      displayName: "Guesser",
      lastAlive: 0,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId,
      phase: "create-scenarios",
    });
    for (let i = 0; i < 12; i++) {
      await ctx.db.insert("scenarios", {
        description: `spicy ${i}`,
        category: "Spicy",
      });
      await ctx.db.insert("scenarios", {
        description: `mild ${i}`,
        category: "Mild",
      });
    }
    return { gameId, roundId };
  });
}

// `ReturnType<typeof convexTest>` drops the schema generic, leaving ctx.db aware
// of system indexes only — fine for the insert-only helpers above, but this one
// reads through byRound.
async function drawnCategories(
  t: TestConvex<typeof schema>,
  roundId: Id<"gameRounds">,
) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", roundId))
      .collect();
    const scenarios = await Promise.all(
      rows.map((row) => ctx.db.get(row.scenarioId)),
    );
    return scenarios.map((scenario) => scenario?.category);
  });
}

test("selectScenariosForGameRound replaces a previous category's draw", async () => {
  const t = convexTest(schema, modules);
  const { gameId, roundId } = await seedCategoryRound(t);
  const asHost = t.withIdentity({ subject: "host" });

  await asHost.mutation(api.game.selectScenariosForGameRound, {
    game: gameId,
    gameRound: roundId,
    category: "Spicy",
  });
  await asHost.mutation(api.game.selectScenariosForGameRound, {
    game: gameId,
    gameRound: roundId,
    category: "Mild",
  });

  const categories = await drawnCategories(t, roundId);
  expect(categories).toHaveLength(10);
  expect(new Set(categories)).toEqual(new Set(["Mild"]));
});

test("selectScenariosForGameRound refuses to redraw once a scenario is selected", async () => {
  const t = convexTest(schema, modules);
  const { gameId, roundId } = await seedCategoryRound(t);
  const asHost = t.withIdentity({ subject: "host" });

  await asHost.mutation(api.game.selectScenariosForGameRound, {
    game: gameId,
    gameRound: roundId,
    category: "Spicy",
  });
  await t.run(async (ctx) => {
    const first = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", roundId))
      .first();
    await ctx.db.patch(first!._id, { selected: true });
  });

  await expect(
    asHost.mutation(api.game.selectScenariosForGameRound, {
      game: gameId,
      gameRound: roundId,
      category: "Mild",
    }),
  ).rejects.toThrow(/already been selected/);

  // The locked-in draw is untouched.
  expect(new Set(await drawnCategories(t, roundId))).toEqual(
    new Set(["Spicy"]),
  );
});

test("selectScenariosForGameRound is host-only", async () => {
  const t = convexTest(schema, modules);
  const { gameId, roundId } = await seedCategoryRound(t);

  await expect(
    t.withIdentity({ subject: "guesser" }).mutation(
      api.game.selectScenariosForGameRound,
      { game: gameId, gameRound: roundId, category: "Spicy" },
    ),
  ).rejects.toThrow(/host/);
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
