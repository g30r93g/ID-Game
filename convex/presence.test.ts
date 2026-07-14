import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { pickHost } from "./game";

const modules = import.meta.glob("./**/*.*s");

test("presenceVotes rows and players.active persist", async () => {
  const t = convexTest(schema, modules);
  const read = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "VOTE01",
      totalRounds: 3,
      currentRound: 1,
      isOpen: false,
      createdBy: "host",
    });
    const target = await ctx.db.insert("players", {
      userId: "target",
      gameId,
      displayName: "Target",
      lastAlive: 0,
      active: false,
    });
    const voter = await ctx.db.insert("players", {
      userId: "voter",
      gameId,
      displayName: "Voter",
      lastAlive: 0,
    });
    await ctx.db.insert("presenceVotes", {
      gameId,
      roundNumber: 1,
      targetPlayerId: target,
      voterPlayerId: voter,
      kind: "remove-player",
      createdAt: 123,
    });
    const votes = await ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", gameId).eq("targetPlayerId", target),
      )
      .collect();
    const targetDoc = await ctx.db.get(target);
    return { voteCount: votes.length, active: targetDoc?.active };
  });

  expect(read.voteCount).toBe(1);
  expect(read.active).toBe(false);
});

test("sendHeartbeat updates only the specified game's player row and reactivates", async () => {
  const t = convexTest(schema, modules);
  const { g1, g2 } = await t.run(async (ctx) => {
    const g1 = await ctx.db.insert("games", {
      joinCode: "HB0001",
      totalRounds: 3,
      isOpen: true,
      createdBy: "u1",
    });
    const g2 = await ctx.db.insert("games", {
      joinCode: "HB0002",
      totalRounds: 3,
      isOpen: true,
      createdBy: "u1",
    });
    await ctx.db.insert("players", {
      userId: "u1",
      gameId: g1,
      displayName: "P",
      lastAlive: 0,
    });
    await ctx.db.insert("players", {
      userId: "u1",
      gameId: g2,
      displayName: "P",
      lastAlive: 0,
      active: false,
    });
    return { g1, g2 };
  });

  await t.withIdentity({ subject: "u1" }).mutation(api.game.sendHeartbeat, {
    gameId: g2,
  });

  const rows = await t.run(async (ctx) => {
    const p1 = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", g1))
      .first();
    const p2 = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", g2))
      .first();
    return { p1, p2 };
  });

  expect(rows.p2!.lastAlive).toBeGreaterThan(0);
  expect(rows.p2!.active).toBe(true);
  expect(rows.p1!.lastAlive).toBe(0);
});

test("getMyActiveGames returns only unfinished games the user still belongs to", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    // active game the user is in
    const active = await ctx.db.insert("games", {
      joinCode: "ACT001",
      totalRounds: 5,
      currentRound: 2,
      isOpen: false,
      createdBy: "me",
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: active,
      displayName: "Me",
      lastAlive: Date.now(),
    });
    // finished game (completedAt set) — must be excluded
    const finished = await ctx.db.insert("games", {
      joinCode: "FIN002",
      totalRounds: 5,
      currentRound: 5,
      isOpen: false,
      createdBy: "me",
      completedAt: Date.now(),
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: finished,
      displayName: "Me",
      lastAlive: Date.now(),
    });
    // game the user was removed from (active:false) — must be excluded
    const removed = await ctx.db.insert("games", {
      joinCode: "RMV003",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "other",
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: removed,
      displayName: "Me",
      lastAlive: 0,
      active: false,
    });
  });

  const result = await t
    .withIdentity({ subject: "me" })
    .query(api.game.getMyActiveGames, {});

  expect(result.map((g) => g.joinCode)).toEqual(["ACT001"]);
  expect(result[0].currentRound).toBe(2);
  expect(result[0].connectedPlayerCount).toBe(1);
});

test("pickHost returns the least-hosted candidate", async () => {
  const t = convexTest(schema, modules);
  const chosen = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "HOST01",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "p1",
    });
    const p1 = await ctx.db.insert("players", {
      userId: "p1",
      gameId,
      displayName: "P1",
      lastAlive: 0,
    });
    const p2 = await ctx.db.insert("players", {
      userId: "p2",
      gameId,
      displayName: "P2",
      lastAlive: 0,
    });
    // p1 has hosted round 1 already; p2 has hosted nothing.
    await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId: p1,
      phase: "display-results",
    });
    const p1Doc = (await ctx.db.get(p1))!;
    const p2Doc = (await ctx.db.get(p2))!;
    return { chosen: await pickHost(ctx, gameId, [p1Doc, p2Doc]), p2 };
  });

  expect(chosen.chosen).toBe(chosen.p2);
});

test("getGuessesStatusForRound ignores removed (inactive) non-host players", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "GST001",
      totalRounds: 1,
      currentRound: 1,
      isOpen: false,
      createdBy: "host",
    });
    const host = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "Host",
      lastAlive: Date.now(),
    });
    const a = await ctx.db.insert("players", {
      userId: "a",
      gameId,
      displayName: "A",
      lastAlive: Date.now(),
    });
    // B was removed by consensus.
    await ctx.db.insert("players", {
      userId: "b",
      gameId,
      displayName: "B",
      lastAlive: 0,
      active: false,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId: host,
      phase: "guess-scenario",
    });
    const grs = await ctx.db.insert("gameRoundScenarios", {
      gameId,
      roundId,
      scenarioId: await ctx.db.insert("scenarios", {
        description: "x",
        category: "General",
      }),
      selected: true,
    });
    // Only A guesses; B is inactive and must not block completion.
    await ctx.db.insert("gameRoundGuesses", {
      gameId,
      roundId,
      scenarioId: grs,
      playerId: a,
    });
    return { roundId };
  });

  const status = await t.query(api.game.getGuessesStatusForRound, { roundId });
  expect(status.guessingCompleteByAllUsers).toBe(true);
  expect(status.playerGuesses.map((p) => p.displayName)).toEqual(["A"]);
});
