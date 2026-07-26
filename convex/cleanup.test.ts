import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("markAbandonedGames marks only games that break the rules", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  await t.run(async (ctx) => {
    // Started, nobody has heartbeat for hours — abandoned.
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

    // Lobby untouched for an hour — abandoned.
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

    // Left 20 minutes ago — still continuable, must be left alone.
    const recent = await ctx.db.insert("games", {
      joinCode: "REC003",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 40 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: recent,
      displayName: "Me",
      lastAlive: now - 20 * 60_000,
    });

    // Finished long ago — not a candidate, must keep abandonedAt unset.
    const finished = await ctx.db.insert("games", {
      joinCode: "FIN004",
      totalRounds: 5,
      currentRound: 5,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 9 * 60 * 60_000,
      completedAt: now - 8 * 60 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: finished,
      displayName: "Me",
      lastAlive: now - 8 * 60 * 60_000,
    });
  });

  const result = await t.mutation(internal.cleanup.markAbandonedGames, {});
  expect(result.marked).toBe(2);
  // The finished game is excluded by the index, never inspected.
  expect(result.inspected).toBe(3);

  const marked = await t.run(async (ctx) => {
    const games = await ctx.db.query("games").collect();
    return Object.fromEntries(
      games.map((g) => [g.joinCode, g.abandonedAt !== undefined]),
    );
  });

  expect(marked).toEqual({
    STL001: true,
    IDL002: true,
    REC003: false,
    FIN004: false,
  });
});

test("markAbandonedGames skips games it has already marked", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "MRK001",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 5 * 60 * 60_000,
      abandonedAt: now - 60 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId,
      displayName: "Me",
      lastAlive: now - 4 * 60 * 60_000,
    });
  });

  const result = await t.mutation(internal.cleanup.markAbandonedGames, {});
  expect(result).toEqual({ inspected: 0, marked: 0 });
});

test("a heartbeat clears the abandoned mark and restores the game", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  const gameId = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "RES001",
      totalRounds: 5,
      currentRound: 2,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 5 * 60 * 60_000,
      abandonedAt: now - 60 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId,
      displayName: "Me",
      lastAlive: now - 4 * 60 * 60_000,
    });
    return gameId;
  });

  const asMe = t.withIdentity({ subject: "me" });

  // Marked and stale: hidden from the join screen.
  expect(await asMe.query(api.game.getMyActiveGames, {})).toEqual([]);

  await asMe.mutation(api.game.sendHeartbeat, { gameId });

  // Asserted as a boolean inside t.run: its return value is serialized, so an
  // absent field would surface here as null rather than undefined.
  const stillMarked = await t.run(
    async (ctx) => (await ctx.db.get(gameId))?.abandonedAt !== undefined,
  );
  expect(stillMarked).toBe(false);

  const result = await asMe.query(api.game.getMyActiveGames, {});
  expect(result.map((g) => g.joinCode)).toEqual(["RES001"]);
});

// createGame's reuse decision is covered by findReusableLobby's unit tests in
// lib/continuable.test.ts. Driving createGame itself here would mean seeding a
// better-auth user record for the component it reads the display name from.
