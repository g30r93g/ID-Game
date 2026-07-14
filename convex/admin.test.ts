import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { activePlayers14dCore, gameStatsCore } from "./admin";
import { FOURTEEN_DAYS_MS } from "../lib/admin/metrics";

const modules = import.meta.glob("./**/*.*s");
const NOW = 1_000_000_000_000;

test("activePlayers14dCore dedupes users across recent player rows", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "P", totalRounds: 1, isOpen: true, createdBy: "a",
    });
    // two rows for user a (recent), one for b (recent), one for c (recent)
    await ctx.db.insert("players", { userId: "a", gameId, displayName: "A", lastAlive: 0 });
    await ctx.db.insert("players", { userId: "a", gameId, displayName: "A", lastAlive: 0 });
    await ctx.db.insert("players", { userId: "b", gameId, displayName: "B", lastAlive: 0 });
    await ctx.db.insert("players", { userId: "c", gameId, displayName: "C", lastAlive: 0 });
  });
  // convex-test stamps `_creationTime` from the real system clock (it cannot
  // be backdated), so `now` must be the real current time for the rows above
  // to fall inside the window — a hardcoded distant epoch would place all of
  // them outside it and always yield 0.
  const count = await t.run((ctx) => activePlayers14dCore(ctx, Date.now()));
  // all four rows were just created (recent) -> distinct users a, b, c = 3
  expect(count).toBe(3);
  // sanity on the window constant
  expect(FOURTEEN_DAYS_MS).toBe(14 * 24 * 60 * 60 * 1000);
});

test("gameStatsCore computes counts and average duration", async () => {
  const t = convexTest(schema, modules);
  const now = NOW;
  await t.run(async (ctx) => {
    await ctx.db.insert("games", { joinCode: "1", totalRounds: 1, isOpen: true, createdBy: "x", startedAt: now - 1000 });
    await ctx.db.insert("games", { joinCode: "2", totalRounds: 1, isOpen: false, createdBy: "x", startedAt: now - 3000, completedAt: now - 1000 });
    await ctx.db.insert("games", { joinCode: "3", totalRounds: 1, isOpen: false, createdBy: "x", startedAt: now - 9000, completedAt: now - 1000 });
  });
  const stats = await t.run((ctx) => gameStatsCore(ctx, now));
  expect(stats.activeNow).toBe(1);
  expect(stats.started14d).toBe(3);
  expect(stats.completed14d).toBe(2);
  expect(stats.avgLengthMs).toBe(5000); // (2000 + 8000) / 2
});
