import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

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
