import { v } from "convex/values";
import { paginationOptsValidator, type PaginationOptions } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { authComponent, createAuthOptions, createAuth } from "./auth";
import { requireAdmin } from "./adminAuth";
import {
  activePlayerCount,
  computeGameStats,
  gameDurationMs,
  scenarioSortToQuery,
  type ScenarioSort,
} from "../lib/admin/metrics";

/**
 * One-off bootstrap: promote a user to admin by email. Uses the Better Auth
 * Convex adapter directly (the role-setting HTTP endpoint requires an existing
 * admin caller, which does not yet exist during bootstrap).
 *
 * Run once:
 *   pnpm exec convex run admin:grantAdmin '{"email":"georgegorzynski@me.com"}'
 */
export const grantAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const user = await adapter.findOne({
      model: "user",
      where: [{ field: "email", value: email }],
    });
    if (!user) throw new Error(`No user found with email ${email}`);
    await adapter.update({
      model: "user",
      where: [{ field: "id", value: (user as { id: string }).id }],
      update: { role: "admin" },
    });
    return { ok: true };
  },
});

export const createScenario = mutation({
  args: { description: v.string(), category: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const description = args.description.trim();
    const category = args.category.trim();
    if (!description) throw new Error("Scenario text is required.");
    if (!category) throw new Error("Category is required.");
    const id = await ctx.db.insert("scenarios", {
      description,
      category,
      timesSelected: 0,
    });
    // Keep the managed category list in sync: any category a scenario uses
    // should exist in scenarioCategories.
    await ensureCategory(ctx, category);
    return id;
  },
});

/**
 * Counts distinct users with a `players` row created in the last 14 days.
 * Pure enough to unit test: reads our own `players` table only (no
 * Better Auth component dependency), delegating the dedupe/window logic to
 * the pure `activePlayerCount` helper.
 */
export async function activePlayers14dCore(ctx: QueryCtx, now: number) {
  const players = await ctx.db.query("players").collect();
  return activePlayerCount(players, now);
}

export const userStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const listed = await auth.api.listUsers({ headers, query: { limit: 1 } });
    return {
      totalUsers: listed.total,
      activePlayers14d: await activePlayers14dCore(ctx, Date.now()),
    };
  },
});

export const listUsers = query({
  args: { limit: v.number(), offset: v.number() },
  handler: async (ctx, { limit, offset }) => {
    await requireAdmin(ctx);
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    // The Convex Better Auth adapter's findMany throws on any nonzero offset,
    // and better-auth's listUsers route swallows that into an empty result.
    // So we fetch a bounded window (capped at 1000 users - a known limitation
    // of this admin view) with offset 0, then sort/page in memory instead of
    // passing the requested offset through to the adapter.
    const listed = await auth.api.listUsers({
      headers,
      query: { limit: 1000 },
    });
    const sorted = [...listed.users].sort(
      (a, b) => Number(b.createdAt) - Number(a.createdAt),
    );
    const page = sorted.slice(offset, offset + limit);
    return {
      total: listed.total,
      users: page.map((u) => ({
        id: u.id,
        name: u.name ?? "",
        email: u.email,
        createdAt: Number(u.createdAt),
      })),
    };
  },
});

export async function gameStatsCore(ctx: QueryCtx, now: number) {
  const games = await ctx.db.query("games").collect();
  return computeGameStats(games, now);
}

export const gameStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return gameStatsCore(ctx, Date.now());
  },
});

export const listGames = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("games")
      .order("desc")
      .paginate(paginationOpts);

    const page = await Promise.all(
      result.page.map(async (game) => {
        const players = await ctx.db
          .query("players")
          .withIndex("byGame", (q) => q.eq("gameId", game._id))
          .collect();
        return {
          _id: game._id,
          _creationTime: game._creationTime,
          partySize: players.length,
          totalRounds: game.totalRounds,
          finished: game.completedAt !== undefined,
          durationMs: gameDurationMs(game),
        };
      }),
    );
    return { ...result, page };
  },
});

const SCENARIO_SORTS = ["popular-desc", "popular-asc", "newest", "oldest"] as const;

/**
 * `scenarioSortToQuery` reports the target index as either "byTimesSelected"
 * or the system creation-time index. The `scenarios` table only defines a
 * "byTimesSelected" index (see convex/schema.ts) - there is no
 * "by_creation_time" index to pass to `.withIndex`, and Convex's generated
 * types reject that string there. So for the creation-time sorts we fall
 * back to the default (unindexed) query, which is already ordered by
 * creation time, and just apply `.order()`.
 */
export async function listScenariosPage(
  ctx: QueryCtx,
  sort: ScenarioSort,
  paginationOpts: PaginationOptions,
  category?: string,
) {
  const { index, order } = scenarioSortToQuery(sort);
  const ordered =
    index === "by_creation_time"
      ? ctx.db.query("scenarios").order(order)
      : ctx.db.query("scenarios").withIndex("byTimesSelected").order(order);
  const filtered = category
    ? ordered.filter((q) => q.eq(q.field("category"), category))
    : ordered;
  const result = await filtered.paginate(paginationOpts);
  return {
    ...result,
    page: result.page.map((s) => ({
      _id: s._id,
      _creationTime: s._creationTime,
      description: s.description,
      category: s.category,
      timesSelected: s.timesSelected ?? 0,
    })),
  };
}

export const listScenarios = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sort: v.union(...SCENARIO_SORTS.map((s) => v.literal(s))),
    category: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, sort, category }) => {
    await requireAdmin(ctx);
    return listScenariosPage(ctx, sort, paginationOpts, category);
  },
});

export const scenarioCategoriesForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [managed, scenarios] = await Promise.all([
      ctx.db.query("scenarioCategories").collect(),
      ctx.db.query("scenarios").collect(),
    ]);
    // Union of the managed list and any category strings already on scenarios,
    // so nothing disappears from the Select/filter before the seed runs.
    const names = new Set<string>([
      ...managed.map((c) => c.name),
      ...scenarios.map((s) => s.category),
    ]);
    return [...names].sort();
  },
});

// ---- Managed category vocabulary ----

async function categoryByName(ctx: QueryCtx, name: string) {
  return ctx.db
    .query("scenarioCategories")
    .withIndex("byName", (q) => q.eq("name", name))
    .unique();
}

async function countScenariosInCategory(ctx: QueryCtx, name: string) {
  const rows = await ctx.db
    .query("scenarios")
    .withIndex("byCategory", (q) => q.eq("category", name))
    .collect();
  return rows.length;
}

/** Insert a category row if one with this name doesn't already exist. */
async function ensureCategory(ctx: MutationCtx, name: string) {
  if (!(await categoryByName(ctx, name))) {
    await ctx.db.insert("scenarioCategories", { name });
  }
}

export async function createCategoryCore(ctx: MutationCtx, rawName: string) {
  const name = rawName.trim();
  if (!name) throw new Error("Category name is required.");
  if (await categoryByName(ctx, name)) {
    throw new Error(`Category "${name}" already exists.`);
  }
  return ctx.db.insert("scenarioCategories", { name });
}

export async function renameCategoryCore(
  ctx: MutationCtx,
  rawFrom: string,
  rawTo: string,
) {
  const from = rawFrom.trim();
  const to = rawTo.trim();
  if (!to) throw new Error("New category name is required.");
  if (from === to) return 0;
  const row = await categoryByName(ctx, from);
  if (!row) throw new Error(`Category "${from}" does not exist.`);
  if (await categoryByName(ctx, to)) {
    throw new Error(`A category named "${to}" already exists.`);
  }
  await ctx.db.patch(row._id, { name: to });
  // Cascade the rename to every scenario using the old name.
  const scenarios = await ctx.db
    .query("scenarios")
    .withIndex("byCategory", (q) => q.eq("category", from))
    .collect();
  await Promise.all(scenarios.map((s) => ctx.db.patch(s._id, { category: to })));
  return scenarios.length;
}

export async function deleteCategoryCore(ctx: MutationCtx, rawName: string) {
  const name = rawName.trim();
  const row = await categoryByName(ctx, name);
  if (!row) throw new Error(`Category "${name}" does not exist.`);
  const count = await countScenariosInCategory(ctx, name);
  if (count > 0) {
    throw new Error(
      `Category "${name}" is used by ${count} scenario(s) — reassign them first.`,
    );
  }
  await ctx.db.delete(row._id);
}

export const listCategoriesWithCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [managed, scenarios] = await Promise.all([
      ctx.db.query("scenarioCategories").collect(),
      ctx.db.query("scenarios").collect(),
    ]);
    const counts = new Map<string, number>();
    for (const s of scenarios) {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    const names = new Set<string>([
      ...managed.map((c) => c.name),
      ...counts.keys(),
    ]);
    return [...names]
      .sort()
      .map((name) => ({ name, count: counts.get(name) ?? 0 }));
  },
});

export const createCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireAdmin(ctx);
    return createCategoryCore(ctx, name);
  },
});

export const renameCategory = mutation({
  args: { from: v.string(), to: v.string() },
  handler: async (ctx, { from, to }) => {
    await requireAdmin(ctx);
    return renameCategoryCore(ctx, from, to);
  },
});

export const deleteCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireAdmin(ctx);
    await deleteCategoryCore(ctx, name);
  },
});

/** Bulk-insert reviewed scenarios (e.g. AI-generated candidates). */
export const createScenarios = mutation({
  args: {
    scenarios: v.array(
      v.object({ description: v.string(), category: v.string() }),
    ),
  },
  handler: async (ctx, { scenarios }) => {
    await requireAdmin(ctx);
    let created = 0;
    for (const s of scenarios) {
      const description = s.description.trim();
      const category = s.category.trim();
      if (!description || !category) continue;
      await ctx.db.insert("scenarios", {
        description,
        category,
        timesSelected: 0,
      });
      await ensureCategory(ctx, category);
      created++;
    }
    return { created };
  },
});

/**
 * One-off: seed scenarioCategories from the distinct categories already present
 * on scenarios. Run once at rollout:
 *   pnpm exec convex run admin:seedScenarioCategories '{}'
 */
export const seedScenarioCategories = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scenarios = await ctx.db.query("scenarios").collect();
    const distinct = [...new Set(scenarios.map((s) => s.category))];
    let created = 0;
    for (const name of distinct) {
      if (!(await categoryByName(ctx, name))) {
        await ctx.db.insert("scenarioCategories", { name });
        created++;
      }
    }
    return { created };
  },
});
