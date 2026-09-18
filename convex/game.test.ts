import { convexTest, type TestConvex } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, components } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import betterAuthSchema from "./betterAuth/schema";

const modules = import.meta.glob("./**/*.*s");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.*s");

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

test("transitionRoundPhase allows rewinding to category selection", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithPhase(t, "pick-scenario");

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, {
      gameRoundId: roundId,
      toPhase: "create-scenarios",
    });

  const round = await t.run((ctx) => ctx.db.get(roundId));
  expect(round?.phase).toBe("create-scenarios");
});

test("transitionRoundPhase refuses the rewind once a scenario is selected", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedRoundWithSelectedScenario(t, "pick-scenario");

  await expect(
    t.withIdentity({ subject: "host" }).mutation(api.game.transitionRoundPhase, {
      gameRoundId: roundId,
      toPhase: "create-scenarios",
    }),
  ).rejects.toThrow(/Illegal phase transition/);
});

test("transitionRoundPhase still rejects every other rewind", async () => {
  const t = convexTest(schema, modules);

  const ranking = await seedRoundWithPhase(t, "rank-players");
  await expect(
    t.withIdentity({ subject: "host" }).mutation(api.game.transitionRoundPhase, {
      gameRoundId: ranking.roundId,
      toPhase: "pick-scenario",
    }),
  ).rejects.toThrow(/Illegal phase transition/);

  const guessing = await seedRoundWithPhase(t, "guess-scenario");
  await expect(
    t.withIdentity({ subject: "host" }).mutation(api.game.transitionRoundPhase, {
      gameRoundId: guessing.roundId,
      toPhase: "rank-players",
    }),
  ).rejects.toThrow(/Illegal phase transition/);
});

// A round mid-guessing: three non-host players, three scenarios, two guesses
// already cast (one on the answer, one on a decoy) and one scenario untouched.
async function seedGuessingRound(t: TestConvex<typeof schema>) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "TAL001",
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
    const alice = await ctx.db.insert("players", {
      userId: "alice",
      gameId,
      displayName: "Alice",
      lastAlive: 0,
    });
    const bob = await ctx.db.insert("players", {
      userId: "bob",
      gameId,
      displayName: "Bob",
      lastAlive: 0,
    });
    await ctx.db.insert("players", {
      userId: "cara",
      gameId,
      displayName: "Cara",
      lastAlive: 0,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId,
      phase: "guess-scenario",
    });

    const scenarioIds = await Promise.all(
      ["Answer", "Decoy", "Untouched"].map((description) =>
        ctx.db.insert("scenarios", { description, category: "General" }),
      ),
    );
    const [answer, decoy] = await Promise.all(
      scenarioIds.map((scenarioId, index) =>
        ctx.db.insert("gameRoundScenarios", {
          gameId,
          roundId,
          scenarioId,
          selected: index === 0,
        }),
      ),
    );

    await ctx.db.insert("gameRoundGuesses", {
      gameId,
      roundId,
      scenarioId: answer,
      playerId: alice,
    });
    await ctx.db.insert("gameRoundGuesses", {
      gameId,
      roundId,
      scenarioId: decoy,
      playerId: bob,
    });

    return { gameId, roundId };
  });
}

function tallyByDescription(
  tally: { description: string; count: number }[] | null,
) {
  return Object.fromEntries((tally ?? []).map((row) => [row.description, row.count]));
}

test("getGuessesStatusForRound gives the host a full tally", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedGuessingRound(t);

  const status = await t
    .withIdentity({ subject: "host" })
    .query(api.game.getGuessesStatusForRound, { roundId });

  expect(status.tally).not.toBeNull();
  expect(tallyByDescription(status.tally)).toEqual({
    Answer: 1,
    Decoy: 1,
    Untouched: 0,
  });
});

test("getGuessesStatusForRound gives the tally to a player who already guessed", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedGuessingRound(t);

  const status = await t
    .withIdentity({ subject: "alice" })
    .query(api.game.getGuessesStatusForRound, { roundId });

  expect(status.viewerHasGuessed).toBe(true);
  expect(
    (status.tally ?? []).reduce((sum, row) => sum + row.count, 0),
  ).toBe(2);
});

test("getGuessesStatusForRound withholds the tally from a player still to guess", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedGuessingRound(t);

  const status = await t
    .withIdentity({ subject: "cara" })
    .query(api.game.getGuessesStatusForRound, { roundId });

  expect(status.viewerHasGuessed).toBe(false);
  expect(status.tally).toBeNull();
  // The per-player checklist is still returned — only the counts are withheld.
  expect(status.playerGuesses).toHaveLength(3);
});

test("getGuessesStatusForRound withholds the tally from an unauthenticated caller", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedGuessingRound(t);

  const status = await t.query(api.game.getGuessesStatusForRound, { roundId });

  expect(status.tally).toBeNull();
  expect(status.viewerHasGuessed).toBe(false);
});

test("getGuessesStatusForRound keeps the tally in draw order", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await seedGuessingRound(t);

  const status = await t
    .withIdentity({ subject: "host" })
    .query(api.game.getGuessesStatusForRound, { roundId });

  // Draw order, not vote order — rows must not jump around as votes land.
  expect((status.tally ?? []).map((row) => row.description)).toEqual([
    "Answer",
    "Decoy",
    "Untouched",
  ]);
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

// Stands up a Better Auth user and an unexpired session for them inside the
// registered component, and hands back the identity fields
// `authComponent.safeGetAuthUser` looks the pair up by: the session's document
// id as `sessionId`, the user's as `subject`.
async function seedAuthUser(
  t: TestConvex<typeof schema>,
  name: string,
): Promise<{ subject: string; sessionId: string }> {
  const now = Date.now();
  return t.run(async (ctx) => {
    const user = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name,
          email: `${name || "nameless"}@example.com`,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
    const session = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: {
          userId: user._id,
          token: `token-${user._id}`,
          expiresAt: now + 60 * 60_000,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
    return { subject: user._id, sessionId: session._id };
  });
}

test("syncDisplayName renames the caller's players rows across their games", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);

  const identity = await seedAuthUser(t, "Ada");
  const otherPlayerId = await t.run(async (ctx) => {
    const first = await ctx.db.insert("games", {
      joinCode: "SYN001",
      totalRounds: 3,
      isOpen: true,
      createdBy: identity.subject,
    });
    const second = await ctx.db.insert("games", {
      joinCode: "SYN002",
      totalRounds: 3,
      isOpen: false,
      createdBy: "someone-else",
    });
    for (const gameId of [first, second]) {
      await ctx.db.insert("players", {
        userId: identity.subject,
        gameId,
        displayName: "Unknown Player",
        lastAlive: 0,
      });
    }
    // Another player in one of the same games must be left alone.
    return ctx.db.insert("players", {
      userId: "someone-else",
      gameId: second,
      displayName: "Unknown Player",
      lastAlive: 0,
    });
  });

  const updated = await t
    .withIdentity(identity)
    .mutation(api.game.syncDisplayName, {});
  expect(updated).toBe(2);

  const names = await t.run(async (ctx) => {
    const mine = await ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", identity.subject))
      .collect();
    const other = await ctx.db.get(otherPlayerId);
    return { mine: mine.map((p) => p.displayName), other: other?.displayName };
  });
  expect(names.mine).toEqual(["Ada", "Ada"]);
  expect(names.other).toBe("Unknown Player");

  // Nothing left to do the second time around.
  expect(
    await t.withIdentity(identity).mutation(api.game.syncDisplayName, {}),
  ).toBe(0);
});

test("syncDisplayName leaves rows alone when the account has no name", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);

  const identity = await seedAuthUser(t, "");
  await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "SYN003",
      totalRounds: 3,
      isOpen: true,
      createdBy: identity.subject,
    });
    await ctx.db.insert("players", {
      userId: identity.subject,
      gameId,
      displayName: "Unknown Player",
      lastAlive: 0,
    });
  });

  expect(
    await t.withIdentity(identity).mutation(api.game.syncDisplayName, {}),
  ).toBe(0);
});

test("syncDisplayName requires an authenticated caller", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);

  await expect(t.mutation(api.game.syncDisplayName, {})).rejects.toThrow(
    /must be authenticated/,
  );
});
