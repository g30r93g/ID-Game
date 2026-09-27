import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { MAX_ACTIVE_SEATS, pickHost } from "./game";
import { Id } from "./_generated/dataModel";
import betterAuthSchema from "./betterAuth/schema";

const modules = import.meta.glob("./**/*.*s");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.*s");

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

test("sendHeartbeat records presence only for the specified game and reactivates", async () => {
  const t = convexTest(schema, modules);
  const { g2 } = await t.run(async (ctx) => {
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
    return { g2 };
  });

  await t.withIdentity({ subject: "u1" }).mutation(api.game.sendHeartbeat, {
    gameId: g2,
  });

  const rows = await t.run(async (ctx) => {
    const p2 = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", g2))
      .first();
    const presence = await ctx.db.query("playerPresence").collect();
    return { p2, presence };
  });

  // One presence row, for the game the beat was about.
  expect(rows.presence).toHaveLength(1);
  expect(rows.presence[0].gameId).toBe(g2);
  expect(rows.presence[0].playerId).toBe(rows.p2!._id);
  expect(rows.presence[0].lastAlive).toBeGreaterThan(0);
  // The removal is undone on the players row; the beat itself is not there.
  expect(rows.p2!.active).toBe(true);
  expect(rows.p2!.lastAlive).toBe(0);
});

test("sendHeartbeat leaves an active player's row untouched", async () => {
  const t = convexTest(schema, modules);
  const { gameId, before } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "HB0004",
      totalRounds: 3,
      isOpen: true,
      createdBy: "u1",
    });
    const playerId = await ctx.db.insert("players", {
      userId: "u1",
      gameId,
      displayName: "P",
      lastAlive: 0,
    });
    // Already has a presence row, so the beat takes the update path.
    await ctx.db.insert("playerPresence", { gameId, playerId, lastAlive: 1 });
    return { gameId, before: await ctx.db.get(playerId) };
  });

  const asU1 = t.withIdentity({ subject: "u1" });
  await asU1.mutation(api.game.sendHeartbeat, { gameId });
  await asU1.mutation(api.game.sendHeartbeat, { gameId });

  const after = await t.run(async (ctx) => ({
    player: await ctx.db.get(before!._id),
    presence: await ctx.db.query("playerPresence").collect(),
  }));
  // Byte-identical: no write at all, so nothing reading `players` re-runs.
  expect(after.player).toEqual(before);
  expect(after.presence).toHaveLength(1);
  expect(after.presence[0].lastAlive).toBeGreaterThan(1);
});

test("getPresenceForGame returns one row per player, falling back to players.lastAlive", async () => {
  const t = convexTest(schema, modules);
  const { gameId, withRow, withoutRow } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "PRS001",
      totalRounds: 3,
      isOpen: true,
      createdBy: "a",
    });
    const withRow = await ctx.db.insert("players", {
      userId: "a",
      gameId,
      displayName: "A",
      lastAlive: 100,
    });
    await ctx.db.insert("playerPresence", {
      gameId,
      playerId: withRow,
      lastAlive: 500,
    });
    // From before the presence table: no row yet.
    const withoutRow = await ctx.db.insert("players", {
      userId: "b",
      gameId,
      displayName: "B",
      lastAlive: 200,
    });
    // Another game's presence must not leak in.
    const otherGame = await ctx.db.insert("games", {
      joinCode: "PRS002",
      totalRounds: 3,
      isOpen: true,
      createdBy: "a",
    });
    const other = await ctx.db.insert("players", {
      userId: "a",
      gameId: otherGame,
      displayName: "A",
      lastAlive: 0,
    });
    await ctx.db.insert("playerPresence", {
      gameId: otherGame,
      playerId: other,
      lastAlive: 900,
    });
    return { gameId, withRow, withoutRow };
  });

  const presence = await t.query(api.game.getPresenceForGame, { gameId });
  expect(presence).toHaveLength(2);
  expect(presence).toEqual(
    expect.arrayContaining([
      { playerId: withRow, lastAlive: 500 },
      { playerId: withoutRow, lastAlive: 200 },
    ]),
  );
});

test("createGame and joinGame record presence, leaveGame removes it", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);

  // createGame and joinGame look the caller's name up by session; no session
  // row exists, so both fall back to the default name.
  const game = await t
    .withIdentity({ subject: "host", sessionId: "session" })
    .mutation(api.game.createGame, { numberOfRounds: 3 });
  const asGuest = t.withIdentity({ subject: "guest", sessionId: "session" });
  await asGuest.mutation(api.game.joinGame, { joinCode: game!.joinCode });

  const rows = await t.run((ctx) => ctx.db.query("playerPresence").collect());
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => row.gameId === game!._id)).toBe(true);

  await asGuest.mutation(api.game.leaveGame, { gameId: game!._id });

  const left = await t.run((ctx) => ctx.db.query("playerPresence").collect());
  expect(left).toHaveLength(1);
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
  // The caller is not counted among the others.
  expect(result[0].othersOnline).toBe(0);
});

test("getMyActiveGames hides abandoned games but keeps empty fresh ones", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  await t.run(async (ctx) => {
    // Started hours ago, nobody has heartbeat since — abandoned.
    const stale = await ctx.db.insert("games", {
      joinCode: "STL001",
      totalRounds: 5,
      currentRound: 2,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 5 * 60 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: stale,
      displayName: "Me",
      lastAlive: now - 4 * 60 * 60_000,
    });

    // Lobby nobody has touched for an hour — abandoned.
    const idleLobby = await ctx.db.insert("games", {
      joinCode: "IDL002",
      totalRounds: 5,
      isOpen: true,
      createdBy: "me",
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: idleLobby,
      displayName: "Me",
      lastAlive: now - 60 * 60_000,
    });

    // Left minutes ago and everyone is offline — still continuable.
    const empty = await ctx.db.insert("games", {
      joinCode: "EMP003",
      totalRounds: 5,
      currentRound: 3,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 20 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: empty,
      displayName: "Me",
      lastAlive: now - 5 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "friend",
      gameId: empty,
      displayName: "Friend",
      lastAlive: now - 6 * 60_000,
    });

    // Someone is in there right now.
    const live = await ctx.db.insert("games", {
      joinCode: "LIV004",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: live,
      displayName: "Me",
      lastAlive: now - 30 * 60_000,
    });
    // Online through presence alone: the players row only says when they
    // joined. Everyone else here predates the table and falls back to it.
    const friend = await ctx.db.insert("players", {
      userId: "friend",
      gameId: live,
      displayName: "Friend",
      lastAlive: now - 3 * 60 * 60_000,
    });
    await ctx.db.insert("playerPresence", {
      gameId: live,
      playerId: friend,
      lastAlive: now,
    });
  });

  const result = await t
    .withIdentity({ subject: "me" })
    .query(api.game.getMyActiveGames, {});

  // Newest seat first: the live game was joined last.
  expect(result.map((g) => g.joinCode)).toEqual(["LIV004", "EMP003"]);
  expect(result[0].othersOnline).toBe(1);
  expect(result[1].othersOnline).toBe(0);
});

test("getMyActiveGames finds a live game behind a long history of finished ones", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  await t.run(async (ctx) => {
    // More finished seats than the query looks at, all older than the live one.
    for (let i = 0; i <= MAX_ACTIVE_SEATS; i++) {
      const finished = await ctx.db.insert("games", {
        joinCode: `FIN${String(i).padStart(3, "0")}`,
        totalRounds: 3,
        currentRound: 3,
        isOpen: false,
        createdBy: "me",
        startedAt: now - 60 * 60_000,
        completedAt: now - 30 * 60_000,
      });
      await ctx.db.insert("players", {
        userId: "me",
        gameId: finished,
        displayName: "Me",
        lastAlive: now - 30 * 60_000,
      });
    }

    const live = await ctx.db.insert("games", {
      joinCode: "LIV001",
      totalRounds: 3,
      currentRound: 1,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: live,
      displayName: "Me",
      lastAlive: now,
    });
  });

  const result = await t
    .withIdentity({ subject: "me" })
    .query(api.game.getMyActiveGames, {});

  expect(result.map((g) => g.joinCode)).toEqual(["LIV001"]);
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

/**
 * Seeds a game in round 1. Liveness goes in presence rows, with each players
 * row claiming the opposite so a reader that ignored presence would get every
 * answer wrong. `withPresence: false` seeds a game from before the presence
 * table instead, where the players row is all there is.
 */
async function seedRoundGame(
  t: ReturnType<typeof convexTest>,
  players: { userId: string; connected: boolean; host?: boolean }[],
  { withPresence = true }: { withPresence?: boolean } = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const stale = now - 10 * 60_000;
    const gameId = await ctx.db.insert("games", {
      joinCode: "CPV001",
      totalRounds: 3,
      currentRound: 1,
      isOpen: false,
      createdBy: players[0].userId,
    });
    const ids: Record<string, Id<"players">> = {};
    for (const p of players) {
      const lastAlive = p.connected ? now : stale;
      ids[p.userId] = await ctx.db.insert("players", {
        userId: p.userId,
        gameId,
        displayName: p.userId.toUpperCase(),
        lastAlive: withPresence ? (p.connected ? stale : now) : lastAlive,
      });
      if (withPresence) {
        await ctx.db.insert("playerPresence", {
          gameId,
          playerId: ids[p.userId],
          lastAlive,
        });
      }
    }
    const host = players.find((p) => p.host) ?? players[0];
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId: ids[host.userId],
      phase: "guess-scenario",
    });
    return { gameId, roundId, ids };
  });
}

test("castPresenceVote reassigns the host when the host is stale and majority agrees", async () => {
  const t = convexTest(schema, modules);
  const { roundId, ids } = await seedRoundGame(t, [
    { userId: "host", connected: false, host: true },
    { userId: "alice", connected: true },
  ]);

  const res = await t
    .withIdentity({ subject: "alice" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["host"],
    });

  expect(res).toEqual({ resolved: true, action: "reassign-host" });
  const round = await t.run((ctx) => ctx.db.get(roundId));
  expect(round!.hostPlayerId).toBe(ids["alice"]);
});

test("castPresenceVote falls back to players.lastAlive without presence rows", async () => {
  const t = convexTest(schema, modules);
  const { ids } = await seedRoundGame(
    t,
    [
      { userId: "host", connected: true, host: true },
      { userId: "alice", connected: true },
      { userId: "bob", connected: false },
    ],
    { withPresence: false },
  );

  // Denominator = connected non-target players = {host, alice} = 2, needs > 1.
  await t
    .withIdentity({ subject: "alice" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["bob"],
    });
  const second = await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["bob"],
    });
  expect(second).toEqual({ resolved: true, action: "remove-player" });
});

test("castPresenceVote refuses to act on a connected target", async () => {
  const t = convexTest(schema, modules);
  const { roundId, ids } = await seedRoundGame(t, [
    { userId: "host", connected: true, host: true },
    { userId: "alice", connected: true },
  ]);

  const res = await t
    .withIdentity({ subject: "alice" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["host"],
    });

  expect(res.resolved).toBe(false);
  const round = await t.run((ctx) => ctx.db.get(roundId));
  expect(round!.hostPlayerId).toBe(ids["host"]);
});

test("castPresenceVote needs a majority to remove a non-host", async () => {
  const t = convexTest(schema, modules);
  const { ids } = await seedRoundGame(t, [
    { userId: "host", connected: true, host: true },
    { userId: "alice", connected: true },
    { userId: "bob", connected: false },
  ]);

  // Denominator = connected non-target players = {host, alice} = 2, needs > 1.
  const first = await t
    .withIdentity({ subject: "alice" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["bob"],
    });
  expect(first.resolved).toBe(false);

  const second = await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["bob"],
    });
  expect(second).toEqual({ resolved: true, action: "remove-player" });

  const bob = await t.run((ctx) => ctx.db.get(ids["bob"]));
  expect(bob!.active).toBe(false);
});

test("castPresenceVote ignores votes from a previous round", async () => {
  const t = convexTest(schema, modules);
  const { ids } = await t.run(async (ctx) => {
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      joinCode: "CPV002",
      totalRounds: 3,
      currentRound: 2,
      isOpen: false,
      createdBy: "host",
    });
    const ids: Record<string, Id<"players">> = {};
    ids["host"] = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "HOST",
      lastAlive: now,
    });
    ids["a"] = await ctx.db.insert("players", {
      userId: "a",
      gameId,
      displayName: "A",
      lastAlive: now,
    });
    ids["b"] = await ctx.db.insert("players", {
      userId: "b",
      gameId,
      displayName: "B",
      lastAlive: 0,
    });
    await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 2,
      hostPlayerId: ids["host"],
      phase: "guess-scenario",
    });
    // A leaked vote from round 1 targeting B, cast by A.
    await ctx.db.insert("presenceVotes", {
      gameId,
      roundNumber: 1,
      targetPlayerId: ids["b"],
      voterPlayerId: ids["a"],
      kind: "remove-player",
      createdAt: 1,
    });
    return { ids };
  });

  const res = await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV002",
      targetPlayerId: ids["b"],
    });

  expect(res.resolved).toBe(false);
  const b = await t.run((ctx) => ctx.db.get(ids["b"]));
  expect(b!.active).not.toBe(false);
});

test("sendHeartbeat cancels votes targeting the reconnecting player", async () => {
  const t = convexTest(schema, modules);
  const { gameId, xId } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "HB0003",
      totalRounds: 3,
      currentRound: 1,
      isOpen: false,
      createdBy: "x",
    });
    const xId = await ctx.db.insert("players", {
      userId: "x",
      gameId,
      displayName: "X",
      lastAlive: 0,
    });
    const voter = await ctx.db.insert("players", {
      userId: "voter",
      gameId,
      displayName: "Voter",
      lastAlive: Date.now(),
    });
    await ctx.db.insert("presenceVotes", {
      gameId,
      roundNumber: 1,
      targetPlayerId: xId,
      voterPlayerId: voter,
      kind: "remove-player",
      createdAt: Date.now(),
    });
    return { gameId, xId };
  });

  await t.withIdentity({ subject: "x" }).mutation(api.game.sendHeartbeat, {
    gameId,
  });

  const votes = await t.run((ctx) =>
    ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", gameId).eq("targetPlayerId", xId),
      )
      .collect(),
  );
  expect(votes.length).toBe(0);

  const presence = await t.run((ctx) =>
    ctx.db
      .query("playerPresence")
      .withIndex("byPlayer", (q) => q.eq("playerId", xId))
      .unique(),
  );
  expect(presence?.lastAlive).toBeGreaterThan(0);
});

test("startNewGameRound skips removed players when choosing a host", async () => {
  const t = convexTest(schema, modules);
  const { gameId, p1 } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "SNR001",
      totalRounds: 3,
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
    // P2 (removed) has hosted nothing, so it would normally be picked as the
    // least-hosted candidate — but it must be skipped because it's inactive.
    await ctx.db.insert("players", {
      userId: "p2",
      gameId,
      displayName: "P2",
      lastAlive: 0,
      active: false,
    });
    // P1 has hosted round 1 already.
    await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId: p1,
      phase: "finished",
    });
    return { gameId, p1 };
  });

  await t
    .withIdentity({ subject: "p1" })
    .mutation(api.game.startNewGameRound, { game: gameId });

  const newRound = await t.run((ctx) =>
    ctx.db
      .query("gameRounds")
      .withIndex("byGameRound", (q) =>
        q.eq("gameId", gameId).eq("roundNumber", 2),
      )
      .unique(),
  );
  expect(newRound!.hostPlayerId).toBe(p1);
});
