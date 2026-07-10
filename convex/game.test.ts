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
