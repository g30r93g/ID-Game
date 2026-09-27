import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import schema from "./schema";
import betterAuthSchema from "./betterAuth/schema";
import aggregateTest from "@convex-dev/aggregate/test";
import { api, components, internal } from "./_generated/api";
import {
  activePlayers14dCore,
  createCategoryCore,
  createScenarioCore,
  createScenariosCore,
  deleteCategoryCore,
  gameStatsCore,
  listCategoriesWithCountsCore,
  listScenariosPage,
  renameCategoryCore,
  scenarioCategoriesForAdminCore,
  setCategoryBriefCore,
} from "./admin";
import { FOURTEEN_DAYS_MS } from "../lib/admin/metrics";

const modules = import.meta.glob("./**/*.*s");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.*s");
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

test("activePlayers14dCore leaves out players who joined before the window", async () => {
  // `_creationTime` follows the system clock, so an old row is written with
  // the clock wound back and the recent ones after moving it forward.
  vi.useFakeTimers({ now: NOW - FOURTEEN_DAYS_MS - 60_000 });
  try {
    const t = convexTest(schema, modules);
    const gameId = await t.run(async (ctx) => {
      const gameId = await ctx.db.insert("games", {
        joinCode: "P", totalRounds: 1, isOpen: true, createdBy: "a",
      });
      await ctx.db.insert("players", { userId: "old", gameId, displayName: "O", lastAlive: 0 });
      return gameId;
    });
    vi.setSystemTime(NOW - 60_000);
    await t.run(async (ctx) => {
      await ctx.db.insert("players", { userId: "a", gameId, displayName: "A", lastAlive: 0 });
      await ctx.db.insert("players", { userId: "b", gameId, displayName: "B", lastAlive: 0 });
    });
    const count = await t.run((ctx) => activePlayers14dCore(ctx, NOW));
    expect(count).toBe(2);
  } finally {
    vi.useRealTimers();
  }
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

test("gameStatsCore leaves out old games and abandoned lobbies", async () => {
  const t = convexTest(schema, modules);
  const now = NOW;
  const old = now - FOURTEEN_DAYS_MS - 60_000;
  await t.run(async (ctx) => {
    // Counts: live, started and completed inside the window.
    await ctx.db.insert("games", { joinCode: "1", totalRounds: 1, isOpen: true, createdBy: "x", startedAt: now - 1000 });
    await ctx.db.insert("games", { joinCode: "2", totalRounds: 1, isOpen: false, createdBy: "x", startedAt: now - 5000, completedAt: now - 1000 });
    // Started before the window, finished inside it: completed only.
    await ctx.db.insert("games", { joinCode: "3", totalRounds: 1, isOpen: false, createdBy: "x", startedAt: old, completedAt: now - 60_000 });
    // Started and completed before the window.
    await ctx.db.insert("games", { joinCode: "4", totalRounds: 1, isOpen: false, createdBy: "x", startedAt: old - 5000, completedAt: old });
    // An abandoned lobby stays open forever but isn't live.
    await ctx.db.insert("games", { joinCode: "5", totalRounds: 1, isOpen: true, createdBy: "x", abandonedAt: now - 1000 });
    // A lobby that never started: live, but in neither window.
    await ctx.db.insert("games", { joinCode: "6", totalRounds: 1, isOpen: true, createdBy: "x" });
  });
  const stats = await t.run((ctx) => gameStatsCore(ctx, now));
  expect(stats.activeNow).toBe(2);
  expect(stats.started14d).toBe(2);
  expect(stats.completed14d).toBe(2);
  // (4000 + (now - 60_000 - old)) / 2
  expect(stats.avgLengthMs).toBe(Math.round((4000 + (now - 60_000 - old)) / 2));
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
  expect(rows[0].scenarioCount).toBe(0);
  await expect(t.run((ctx) => createCategoryCore(ctx, "Work"))).rejects.toThrow(/already exists/);
  await expect(t.run((ctx) => createCategoryCore(ctx, "   "))).rejects.toThrow(/required/);
});

test("renameCategoryCore cascades to scenarios and blocks name clashes", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Old", scenarioCount: 2 });
    await ctx.db.insert("scenarioCategories", { name: "Taken" });
    await ctx.db.insert("scenarios", { description: "s1", category: "Old", timesSelected: 0 });
    await ctx.db.insert("scenarios", { description: "s2", category: "Old", timesSelected: 0 });
    await ctx.db.insert("scenarios", { description: "s3", category: "Other", timesSelected: 0 });
  });
  const moved = await t.run((ctx) => renameCategoryCore(ctx, "Old", "New"));
  expect(moved).toBe(2);
  const cats = await t.run((ctx) => ctx.db.query("scenarioCategories").collect());
  expect(cats.map((c) => c.name).sort()).toEqual(["New", "Taken"]);
  expect(cats.find((c) => c.name === "New")?.scenarioCount).toBe(2);
  const scenarios = await t.run((ctx) => ctx.db.query("scenarios").collect());
  expect(scenarios.filter((s) => s.category === "New")).toHaveLength(2);
  expect(scenarios.filter((s) => s.category === "Old")).toHaveLength(0);
  await expect(t.run((ctx) => renameCategoryCore(ctx, "New", "Taken"))).rejects.toThrow(/already exists/);
});

test("deleteCategoryCore blocks deletion while in use", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Used", scenarioCount: 1 });
    await ctx.db.insert("scenarioCategories", { name: "Empty", scenarioCount: 0 });
    // Count not yet backfilled: the delete is still blocked by the index read.
    await ctx.db.insert("scenarioCategories", { name: "Unknown" });
    await ctx.db.insert("scenarios", { description: "s", category: "Used", timesSelected: 0 });
    await ctx.db.insert("scenarios", { description: "u", category: "Unknown", timesSelected: 0 });
  });
  await expect(t.run((ctx) => deleteCategoryCore(ctx, "Used"))).rejects.toThrow(/used by 1 scenario/);
  await expect(t.run((ctx) => deleteCategoryCore(ctx, "Unknown"))).rejects.toThrow(/used by some scenario/);
  await t.run((ctx) => deleteCategoryCore(ctx, "Empty"));
  const cats = await t.run((ctx) => ctx.db.query("scenarioCategories").collect());
  expect(cats.map((c) => c.name).sort()).toEqual(["Unknown", "Used"]);
});

async function categoryCounts(t: ReturnType<typeof convexTest>) {
  const rows = await t.run((ctx) =>
    ctx.db.query("scenarioCategories").collect(),
  );
  return Object.fromEntries(rows.map((r) => [r.name, r.scenarioCount]));
}

test("createScenarioCore creates the category row and increments its count", async () => {
  const t = convexTest(schema, modules);
  await t.run((ctx) => createScenarioCore(ctx, "one", " Work "));
  expect(await categoryCounts(t)).toEqual({ Work: 1 });
  await t.run((ctx) => createScenarioCore(ctx, "two", "Work"));
  expect(await categoryCounts(t)).toEqual({ Work: 2 });
});

test("createScenariosCore increments each category by its inserted rows", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Work", scenarioCount: 3 });
  });
  const { created } = await t.run((ctx) =>
    createScenariosCore(ctx, [
      { description: "w1", category: "Work" },
      { description: "f1", category: "Family" },
      { description: "w2", category: "Work" },
      { description: "  ", category: "Work" }, // skipped: no text
      { description: "f2", category: "Family" },
    ]),
  );
  expect(created).toBe(4);
  expect(await categoryCounts(t)).toEqual({ Work: 5, Family: 2 });
});

test("createScenarioCore leaves an unknown count for the backfill", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Work" });
  });
  await t.run((ctx) => createScenarioCore(ctx, "one", "Work"));
  expect(await categoryCounts(t)).toEqual({ Work: undefined });
});

test("deleteScenarios decrements each category's count", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Work", scenarioCount: 3 });
    // Drifted low: the decrement clamps at 0.
    await ctx.db.insert("scenarioCategories", { name: "Family", scenarioCount: 0 });
    return Promise.all([
      ctx.db.insert("scenarios", { description: "w1", category: "Work" }),
      ctx.db.insert("scenarios", { description: "w2", category: "Work" }),
      ctx.db.insert("scenarios", { description: "w3", category: "Work" }),
      ctx.db.insert("scenarios", { description: "f1", category: "Family" }),
    ]);
  });
  const result = await t.mutation(
    internal.scenariosMaintenance.deleteScenarios,
    { ids: [ids[0], ids[1], ids[3]] },
  );
  expect(result.deleted).toBe(3);
  expect(await categoryCounts(t)).toEqual({ Work: 1, Family: 0 });
});

test("seedScenarioCategories sets exact counts and is idempotent", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Work", scenarioCount: 7 }); // drifted
    await ctx.db.insert("scenarioCategories", { name: "Family" }); // unknown
    await ctx.db.insert("scenarioCategories", { name: "Empty" });
    for (const [description, category] of [
      ["w1", "Work"],
      ["w2", "Work"],
      ["f1", "Family"],
      ["o1", "Orphan"], // used by a scenario, no row yet
    ]) {
      await ctx.db.insert("scenarios", { description, category });
    }
  });
  const expected = { Work: 2, Family: 1, Empty: 0, Orphan: 1 };
  const first = await t.mutation(internal.admin.seedScenarioCategories, {});
  expect(first).toEqual({ created: 1, updated: 3 });
  expect(await categoryCounts(t)).toEqual(expected);
  const second = await t.mutation(internal.admin.seedScenarioCategories, {});
  expect(second).toEqual({ created: 0, updated: 0 });
  expect(await categoryCounts(t)).toEqual(expected);
});

test("listCategoriesWithCountsCore reads stored counts, not scenarios", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Work", scenarioCount: 5, brief: "office" });
    await ctx.db.insert("scenarioCategories", { name: "Family" });
    // Neither of these shows up in the result: no scenarios rows are read.
    await ctx.db.insert("scenarios", { description: "w1", category: "Work" });
    await ctx.db.insert("scenarios", { description: "s1", category: "Stray" });
  });
  const rows = await t.run((ctx) => listCategoriesWithCountsCore(ctx));
  expect(rows).toEqual([
    { name: "Family", count: 0, brief: "" },
    { name: "Work", count: 5, brief: "office" },
  ]);
});

test("scenarioCategoriesForAdminCore returns the managed names sorted", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarioCategories", { name: "Work" });
    await ctx.db.insert("scenarioCategories", { name: "Family" });
    await ctx.db.insert("scenarioCategories", { name: "Nightlife" });
    // A category that only exists on a scenario. It's absent from the result,
    // which shows the query reads the managed table and not `scenarios`.
    await ctx.db.insert("scenarios", { description: "s", category: "Stray", timesSelected: 0 });
  });
  const names = await t.run((ctx) => scenarioCategoriesForAdminCore(ctx));
  expect(names).toEqual(["Family", "Nightlife", "Work"]);
});

test("setCategoryBriefCore upserts a trimmed brief", async () => {
  const t = convexTest(schema, modules);
  // upsert onto a non-existent category creates it with the brief
  await t.run((ctx) =>
    setCategoryBriefCore(ctx, "Nightlife", "  filthy club one-liners  "),
  );
  let rows = await t.run((ctx) => ctx.db.query("scenarioCategories").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("Nightlife");
  expect(rows[0].brief).toBe("filthy club one-liners");
  // updating an existing category patches the brief; empty clears it
  await t.run((ctx) => setCategoryBriefCore(ctx, "Nightlife", "   "));
  rows = await t.run((ctx) => ctx.db.query("scenarioCategories").collect());
  expect(rows[0].brief).toBeUndefined();
});

// Guests (anonymous users) share the user table with accounts; the users page
// reports them apart, from the counts in convex/userCounts.ts.
test("userStats counts guests apart from accounts", async () => {
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret");
  try {
    const t = convexTest(schema, modules);
    t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
    aggregateTest.register(t, "userCounts");
    const now = Date.now();

    const admin = await t.run(async (ctx) => {
      const create = (data: Record<string, unknown>) =>
        ctx.runMutation(components.betterAuth.adapter.create, {
          input: { model: "user", data: data as never },
        });
      const base = { emailVerified: true, createdAt: now, updatedAt: now };
      const adminUser = await create({
        ...base,
        name: "Admin",
        email: "admin@example.com",
        role: "admin",
      });
      await create({ ...base, name: "Ada", email: "ada@example.com" });
      for (const i of [1, 2, 3]) {
        await create({
          ...base,
          emailVerified: false,
          name: `Guest ${i}`,
          email: `g${i}@guests.invalid`,
          isAnonymous: true,
        });
      }
      const session = await ctx.runMutation(
        components.betterAuth.adapter.create,
        {
          input: {
            model: "session",
            data: {
              userId: adminUser._id,
              token: "admin-token",
              // A fresh session's lifetime. One close to expiry would make
              // Better Auth refresh it, which a query can't write.
              expiresAt: now + 7 * 24 * 60 * 60_000,
              createdAt: now,
              updatedAt: now,
            },
          },
        },
      );
      return { subject: adminUser._id, sessionId: session._id };
    });
    // Seeded straight through the component, which runs no triggers, so the
    // counts come from the backfill.
    await t.mutation(internal.migrations.backfillUserCounts, {});

    const stats = await t.withIdentity(admin).query(api.admin.userStats, {});
    expect(stats.totalUsers).toBe(2);
    expect(stats.guests).toBe(3);
  } finally {
    vi.unstubAllEnvs();
  }
});

/**
 * Creates `users` in order through the component's adapter and signs in as
 * the first one. Returns that identity and every user id, oldest first.
 */
async function seedUsersSignedInAsFirst(
  t: ReturnType<typeof convexTest>,
  users: Record<string, unknown>[],
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const ids: string[] = [];
    for (const data of users) {
      const user = await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: { emailVerified: true, createdAt: now, updatedAt: now, ...data } as never,
        },
      });
      ids.push(user._id);
    }
    const session = await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: {
          userId: ids[0],
          token: "first-user-token",
          expiresAt: now + 7 * 24 * 60 * 60_000,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
    return { identity: { subject: ids[0], sessionId: session._id }, ids };
  });
}

type UsersPage = FunctionReturnType<typeof api.admin.listUsers>;

test("listUsers pages newest first with no gaps or repeats", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  const users = [
    { name: "Admin", email: "admin@example.com", role: "admin" },
    { name: "Ada", email: "ada@example.com" },
    { name: "Guest 1", email: "g1@guests.invalid", isAnonymous: true },
    { name: "Bea", email: "bea@example.com" },
    { name: "Guest 2", email: "g2@guests.invalid", isAnonymous: true },
    { name: "Cy", email: "cy@example.com" },
    { name: "Guest 3", email: "g3@guests.invalid", isAnonymous: true },
  ];
  const { identity, ids } = await seedUsersSignedInAsFirst(t, users);
  const asAdmin = t.withIdentity(identity);

  // Seven users in pages of three: 3, 3, then the last 1.
  const pages: UsersPage[] = [];
  let cursor: string | null = null;
  for (;;) {
    const result: UsersPage = await asAdmin.query(api.admin.listUsers, {
      paginationOpts: { numItems: 3, cursor },
    });
    pages.push(result);
    if (result.isDone) break;
    cursor = result.continueCursor;
    expect(pages.length).toBeLessThan(5);
  }
  expect(pages.map((p) => p.page.length)).toEqual([3, 3, 1]);
  expect(pages.map((p) => p.isDone)).toEqual([false, false, true]);

  const listed = pages.flatMap((p) => p.page);
  expect(listed.map((u) => u.id)).toEqual([...ids].reverse());
  expect(listed.map((u) => u.isGuest)).toEqual(
    [...users].reverse().map((u) => u.isAnonymous === true),
  );
  expect(listed.at(-1)).toMatchObject({ name: "Admin", email: "admin@example.com" });
});

test("the user queries reject non-admins", async () => {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  const { identity } = await seedUsersSignedInAsFirst(t, [
    { name: "Ada", email: "ada@example.com" },
  ]);
  const asUser = t.withIdentity(identity);
  await expect(asUser.query(api.admin.userStats, {})).rejects.toThrow(/Admin access required/);
  await expect(
    asUser.query(api.admin.listUsers, { paginationOpts: { numItems: 10, cursor: null } }),
  ).rejects.toThrow(/Admin access required/);
});
