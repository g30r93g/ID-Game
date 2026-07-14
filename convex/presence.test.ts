import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

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
