import { convexTest, type TestConvex } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import { expect, test, vi } from "vitest";
import schema from "./schema";
import { api, components, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";

import betterAuthSchema from "./betterAuth/schema";

const modules = import.meta.glob("./**/*.*s");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.*s");

// A players row with a heartbeat on record: its presence row says when.
async function insertPlayerWithHeartbeat(
  ctx: MutationCtx,
  player: {
    userId: string;
    gameId: Id<"games">;
    displayName: string;
    active?: boolean;
  },
  lastAlive: number,
) {
  const playerId = await ctx.db.insert("players", player);
  await ctx.db.insert("playerPresence", {
    gameId: player.gameId,
    playerId,
    lastAlive,
  });
  return playerId;
}

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
    await insertPlayerWithHeartbeat(
      ctx,
      { userId: "me", gameId: stale, displayName: "Me" },
      now - 4 * 60 * 60_000,
    );

    // Lobby untouched for an hour — abandoned.
    const idleLobby = await ctx.db.insert("games", {
      joinCode: "IDL002",
      totalRounds: 5,
      isOpen: true,
      createdBy: "me",
    });
    await insertPlayerWithHeartbeat(
      ctx,
      { userId: "me", gameId: idleLobby, displayName: "Me" },
      now - 60 * 60_000,
    );

    // Left 20 minutes ago — still continuable, must be left alone.
    const recent = await ctx.db.insert("games", {
      joinCode: "REC003",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 40 * 60_000,
    });
    await insertPlayerWithHeartbeat(
      ctx,
      { userId: "me", gameId: recent, displayName: "Me" },
      now - 20 * 60_000,
    );

    // Started minutes ago, but its only player has no heartbeat on record:
    // no presence row is no activity, so abandoned.
    const noRow = await ctx.db.insert("games", {
      joinCode: "NOR005",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "me",
      startedAt: now - 10 * 60_000,
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: noRow,
      displayName: "Me",
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
    await insertPlayerWithHeartbeat(
      ctx,
      { userId: "me", gameId: finished, displayName: "Me" },
      now - 8 * 60 * 60_000,
    );
  });

  const result = await t.mutation(internal.cleanup.markAbandonedGames, {});
  expect(result.marked).toBe(3);
  // The finished game is excluded by the index, never inspected.
  expect(result.inspected).toBe(4);

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
    NOR005: true,
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
    await insertPlayerWithHeartbeat(
      ctx,
      { userId: "me", gameId, displayName: "Me" },
      now - 4 * 60 * 60_000,
    );
  });

  const result = await t.mutation(internal.cleanup.markAbandonedGames, {});
  expect(result).toEqual({ inspected: 0, marked: 0, continued: false });
});

test("markAbandonedGames reaches an abandoned game behind a batch of live ones", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      // More than one batch of live games, all older than the abandoned one,
      // so they fill the front of the candidate range.
      for (let i = 0; i < 30; i++) {
        const live = await ctx.db.insert("games", {
          joinCode: `LIV${String(i).padStart(3, "0")}`,
          totalRounds: 5,
          currentRound: 1,
          isOpen: false,
          createdBy: "me",
          startedAt: now - 60 * 60_000,
        });
        await insertPlayerWithHeartbeat(
          ctx,
          { userId: `player${i}`, gameId: live, displayName: "Player" },
          now - 60_000,
        );
      }

      const stale = await ctx.db.insert("games", {
        joinCode: "STL001",
        totalRounds: 5,
        currentRound: 2,
        isOpen: false,
        createdBy: "me",
        startedAt: now - 5 * 60 * 60_000,
      });
      await insertPlayerWithHeartbeat(
        ctx,
        { userId: "me", gameId: stale, displayName: "Me" },
        now - 4 * 60 * 60_000,
      );
    });

    const first = await t.mutation(internal.cleanup.markAbandonedGames, {});
    expect(first).toEqual({ inspected: 25, marked: 0, continued: true });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const marked = await t.run(async (ctx) => {
      const games = await ctx.db.query("games").collect();
      return games
        .filter((g) => g.abandonedAt !== undefined)
        .map((g) => g.joinCode);
    });
    expect(marked).toEqual(["STL001"]);
  } finally {
    vi.useRealTimers();
  }
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
    await insertPlayerWithHeartbeat(
      ctx,
      { userId: "me", gameId, displayName: "Me" },
      now - 4 * 60 * 60_000,
    );
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

test("createGame does not hand back an abandoned lobby", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  const now = Date.now();

  await t.run(async (ctx) => {
    const dead = await ctx.db.insert("games", {
      joinCode: "DED001",
      totalRounds: 5,
      isOpen: true,
      createdBy: "me",
      abandonedAt: now - 60 * 60_000,
    });
    await insertPlayerWithHeartbeat(
      ctx,
      { userId: "me", gameId: dead, displayName: "Me" },
      now - 2 * 60 * 60_000,
    );
  });

  // createGame resolves a display name through the betterAuth component, which
  // looks the caller's session up by `identity.sessionId` — omit it and the
  // component call fails its own arg validation before the dedupe is reached.
  // No session row exists here, so the lookup simply finds nothing and
  // createGame falls back to its default name.
  const created = await t
    .withIdentity({ subject: "me", sessionId: "session" })
    .mutation(api.game.createGame, { numberOfRounds: 5 });

  expect(created!.joinCode).not.toBe("DED001");
  expect(created!.abandonedAt).toBeUndefined();
});

const DAY = 24 * 60 * 60_000;

/**
 * Seeds a Better Auth user through the component's own adapter, with one
 * session per entry in `sessionExpiresAt` (offsets from now). Guests are
 * seeded oldest first, matching the creation order the cleanup relies on.
 */
async function seedUser(
  t: TestConvex<typeof schema>,
  opts: {
    email: string;
    isAnonymous: boolean;
    ageDays: number;
    sessionExpiresIn?: number[];
  },
) {
  const now = Date.now();
  const createdAt = now - opts.ageDays * DAY;
  return t.run(async (ctx) => {
    const user = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: opts.email,
          email: opts.email,
          emailVerified: !opts.isAnonymous,
          isAnonymous: opts.isAnonymous,
          createdAt,
          updatedAt: createdAt,
        },
      },
    });
    for (const [i, expiresIn] of (opts.sessionExpiresIn ?? []).entries()) {
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "session",
          data: {
            userId: user._id,
            token: `token-${user._id}-${i}`,
            expiresAt: now + expiresIn,
            createdAt,
            updatedAt: createdAt,
          },
        },
      });
    }
    return user._id as string;
  });
}

async function authRows(
  t: TestConvex<typeof schema>,
  model: "user" | "session",
) {
  return t.run(async (ctx) => {
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model,
      paginationOpts: { cursor: null, numItems: 1000 },
    });
    return result.page as { _id: string; userId?: string }[];
  });
}

test("deleteExpiredGuests removes only old guests with no live session", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  // Deleting a guest updates the user counts.
  aggregateTest.register(t, "userCounts");

  // Oldest first, as real sign-ups would be.
  const expiredNoSession = await seedUser(t, {
    email: "a@guests.invalid",
    isAnonymous: true,
    ageDays: 60,
  });
  const expiredSessions = await seedUser(t, {
    email: "b@guests.invalid",
    isAnonymous: true,
    ageDays: 45,
    sessionExpiresIn: [-20 * DAY, -1],
  });
  const stillPlaying = await seedUser(t, {
    email: "c@guests.invalid",
    isAnonymous: true,
    ageDays: 40,
    sessionExpiresIn: [-10 * DAY, 3 * DAY],
  });
  const oldAccount = await seedUser(t, {
    email: "d@example.com",
    isAnonymous: false,
    ageDays: 90,
  });
  const recentGuest = await seedUser(t, {
    email: "e@guests.invalid",
    isAnonymous: true,
    ageDays: 2,
    sessionExpiresIn: [-1],
  });

  // A seat in a game must survive its guest being deleted.
  await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "GST900",
      totalRounds: 3,
      isOpen: false,
      createdBy: oldAccount,
      completedAt: Date.now() - 50 * DAY,
    });
    await ctx.db.insert("players", {
      userId: expiredNoSession,
      gameId,
      displayName: "Ada",
    });
  });

  const result = await t.mutation(internal.cleanup.deleteExpiredGuests, {});
  expect(result).toEqual({ inspected: 3, deleted: 2, continued: false });

  const users = (await authRows(t, "user")).map((u) => u._id).sort();
  expect(users).toEqual([stillPlaying, oldAccount, recentGuest].sort());

  // The deleted guest's expired sessions went with it; everyone else's stay.
  const sessionOwners = new Set(
    (await authRows(t, "session")).map((s) => s.userId),
  );
  expect(sessionOwners.has(expiredSessions)).toBe(false);
  expect(sessionOwners.has(stillPlaying)).toBe(true);
  expect(sessionOwners.has(recentGuest)).toBe(true);

  const seat = await t.run((ctx) =>
    ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", expiredNoSession))
      .unique(),
  );
  expect(seat?.displayName).toBe("Ada");

  // Nothing left to do the second time around.
  expect(await t.mutation(internal.cleanup.deleteExpiredGuests, {})).toEqual({
    inspected: 1,
    deleted: 0,
    continued: false,
  });
});

test("deleteExpiredGuests carries a backlog on in follow-up runs", async () => {
  vi.useFakeTimers();
  try {
    const t = convexTest(schema, modules);
    t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
    aggregateTest.register(t, "userCounts");

    // More than one batch of expired guests.
    for (let i = 0; i < 130; i++) {
      await seedUser(t, {
        email: `g${i}@guests.invalid`,
        isAnonymous: true,
        ageDays: 60,
      });
    }
    await seedUser(t, {
      email: "kept@example.com",
      isAnonymous: false,
      ageDays: 60,
    });

    const first = await t.mutation(internal.cleanup.deleteExpiredGuests, {});
    expect(first).toEqual({ inspected: 100, deleted: 100, continued: true });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const users = await authRows(t, "user");
    expect(users).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
