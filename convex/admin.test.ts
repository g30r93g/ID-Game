import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import {
  activePlayers14dCore,
  createCategoryCore,
  deleteCategoryCore,
  gameStatsCore,
  listScenariosPage,
  renameCategoryCore,
} from "./admin";
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

test("listScenariosPage orders by popularity", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarios", { description: "low", category: "c", timesSelected: 1 });
    await ctx.db.insert("scenarios", { description: "high", category: "c", timesSelected: 9 });
    await ctx.db.insert("scenarios", { description: "mid", category: "c", timesSelected: 5 });
  });
  const page = await t.run((ctx) =>
    listScenariosPage(ctx, "popular-desc", { numItems: 10, cursor: null }),
  );
  expect(page.page.map((s) => s.description)).toEqual(["high", "mid", "low"]);
});

test("listScenariosPage filters by category when provided", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarios", { description: "a1", category: "Alpha", timesSelected: 3 });
    await ctx.db.insert("scenarios", { description: "b1", category: "Beta", timesSelected: 2 });
    await ctx.db.insert("scenarios", { description: "a2", category: "Alpha", timesSelected: 1 });
  });
  const page = await t.run((ctx) =>
    listScenariosPage(ctx, "popular-desc", { numItems: 10, cursor: null }, "Alpha"),
  );
  expect(page.page.map((s) => s.description)).toEqual(["a1", "a2"]);
  expect(page.page.every((s) => s.category === "Alpha")).toBe(true);
});

test("createCategoryCore inserts and rejects duplicates/empty", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => createCategoryCore(ctx, "  Work  "));
  const rows = await t.run((ctx) => ctx.db.query("scenarioCategories").collect());
  expect(rows.map((r) => r.name)).toEqual(["Work"]); // trimmed
  await expect(t.run((ctx) => createCategoryCore(ctx, "Work"))).rejects.toThrow(/already exists/);
  await expect(t.run((ctx) => createCategoryCore(ctx, "   "))).rejects.toThrow(/required/);
});

test("renameCategoryCore cascades to scenarios and blocks name clashes", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Old" });
    await ctx.db.insert("scenarioCategories", { name: "Taken" });
    await ctx.db.insert("scenarios", { description: "s1", category: "Old", timesSelected: 0 });
    await ctx.db.insert("scenarios", { description: "s2", category: "Old", timesSelected: 0 });
    await ctx.db.insert("scenarios", { description: "s3", category: "Other", timesSelected: 0 });
  });
  const moved = await t.run((ctx) => renameCategoryCore(ctx, "Old", "New"));
  expect(moved).toBe(2);
  const cats = await t.run((ctx) => ctx.db.query("scenarioCategories").collect());
  expect(cats.map((c) => c.name).sort()).toEqual(["New", "Taken"]);
  const scenarios = await t.run((ctx) => ctx.db.query("scenarios").collect());
  expect(scenarios.filter((s) => s.category === "New")).toHaveLength(2);
  expect(scenarios.filter((s) => s.category === "Old")).toHaveLength(0);
  await expect(t.run((ctx) => renameCategoryCore(ctx, "New", "Taken"))).rejects.toThrow(/already exists/);
});

test("deleteCategoryCore blocks deletion while in use", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Used" });
    await ctx.db.insert("scenarioCategories", { name: "Empty" });
    await ctx.db.insert("scenarios", { description: "s", category: "Used", timesSelected: 0 });
  });
  await expect(t.run((ctx) => deleteCategoryCore(ctx, "Used"))).rejects.toThrow(/used by 1 scenario/);
  await t.run((ctx) => deleteCategoryCore(ctx, "Empty"));
  const cats = await t.run((ctx) => ctx.db.query("scenarioCategories").collect());
  expect(cats.map((c) => c.name)).toEqual(["Used"]);
});
