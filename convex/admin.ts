import { v } from "convex/values";
import {
  paginationOptsValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { authComponent, createAuthOptions } from "./auth";
import { requireAdmin } from "./adminAuth";
import {
  FOURTEEN_DAYS_MS,
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

export async function createScenarioCore(
  ctx: MutationCtx,
  rawDescription: string,
  rawCategory: string,
) {
  const description = rawDescription.trim();
  const category = rawCategory.trim();
  if (!description) throw new Error("Scenario text is required.");
  if (!category) throw new Error("Category is required.");
  const id = await ctx.db.insert("scenarios", {
    description,
    category,
    timesSelected: 0,
  });
  // Keep the managed category list in sync: any category a scenario uses
  // should exist in scenarioCategories, with its count.
  await bumpCategoryCount(ctx, category, 1);
  return id;
}

export const createScenario = mutation({
  args: { description: v.string(), category: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return createScenarioCore(ctx, args.description, args.category);
  },
});

/**
 * Counts distinct users with a `players` row created in the last 14 days.
 * Pure enough to unit test: reads our own `players` table only (no
 * Better Auth component dependency), delegating the dedupe/window logic to
 * the pure `activePlayerCount` helper.
 *
 * The built-in `by_creation_time` index bounds the read to the window, so the
 * cost tracks recent players rather than every player row ever written.
 */
export async function activePlayers14dCore(ctx: QueryCtx, now: number) {
  const players = await ctx.db
    .query("players")
    .withIndex("by_creation_time", (q) =>
      q.gte("_creationTime", now - FOURTEEN_DAYS_MS),
    )
    .collect();
  return activePlayerCount(players, now);
}

/** Rows per `findMany` call while counting users. */
const COUNT_PAGE_SIZE = 500;

/**
 * Counts user rows by paging through the Better Auth component's `findMany`,
 * reading ids only. Still O(users), but without building Better Auth or
 * re-running its admin middleware, which `auth.api.listUsers` did per call.
 */
async function countUsers(
  ctx: QueryCtx,
  where?: { field: string; value: boolean }[],
) {
  let count = 0;
  let cursor: string | null = null;
  for (;;) {
    const result: PaginationResult<unknown> = await ctx.runQuery(
      components.betterAuth.adapter.findMany,
      {
        model: "user",
        where,
        select: ["_id"],
        paginationOpts: { cursor, numItems: COUNT_PAGE_SIZE },
      },
    );
    count += result.page.length;
    if (result.isDone) return count;
    cursor = result.continueCursor;
  }
}

export const userStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const [all, guests] = await Promise.all([
      countUsers(ctx),
      // Counted on the user table's `isAnonymous` index. `deleteExpiredGuests`
      // removes guests nobody can use any more, so this stays small.
      countUsers(ctx, [{ field: "isAnonymous", value: true }]),
    ]);
    return {
      // Guests share the user table but aren't sign-ups; count them apart.
      totalUsers: all - guests,
      guests,
      activePlayers14d: await activePlayers14dCore(ctx, Date.now()),
    };
  },
});

type AuthUserRow = {
  _id: string;
  name?: string | null;
  email: string;
  createdAt: number;
  isAnonymous?: boolean | null;
};

/**
 * One page of users, newest first. Reads the component's user table directly:
 * `auth.api.listUsers` built Better Auth, re-checked the admin session and
 * counted the whole table on every call. The component maps a `createdAt`
 * sort onto the built-in `by_creation_time` index, so a page reads only its
 * own rows.
 */
export const listUsers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user",
      sortBy: { field: "createdAt", direction: "desc" },
      paginationOpts,
    });
    return {
      page: (result.page as AuthUserRow[]).map((u) => ({
        id: u._id,
        name: u.name ?? "",
        email: u.email,
        createdAt: Number(u.createdAt),
        isGuest: u.isAnonymous === true,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * Reads only the games each stat can count, one index range per stat, instead
 * of every game ever. The three sets overlap (a live game can also have started
 * this fortnight), so they are merged by id before `computeGameStats` applies
 * the same rules as before.
 */
export async function gameStatsCore(ctx: QueryCtx, now: number) {
  const since = now - FOURTEEN_DAYS_MS;
  const sets = await Promise.all([
    ctx.db
      .query("games")
      .withIndex("byIsOpenAbandonedAt", (q) =>
        q.eq("isOpen", true).eq("abandonedAt", undefined),
      )
      .collect(),
    // A `gte` range skips games whose timestamp is still unset.
    ctx.db
      .query("games")
      .withIndex("byStartedAt", (q) => q.gte("startedAt", since))
      .collect(),
    ctx.db
      .query("games")
      .withIndex("byCompletedAt", (q) => q.gte("completedAt", since))
      .collect(),
  ]);
  const games = new Map(sets.flat().map((g) => [g._id, g]));
  return computeGameStats([...games.values()], now);
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
        const creator = players.find((p) => p.userId === game.createdBy);
        return {
          _id: game._id,
          _creationTime: game._creationTime,
          joinCode: game.joinCode,
          createdBy: game.createdBy,
          createdByName: creator?.displayName ?? null,
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
 * or the system creation-time index. Every table has the built-in
 * "by_creation_time" index and `.withIndex` accepts it, but a query with no
 * index already reads through it in creation order, so for the creation-time
 * sorts the default query plus `.order()` is the same read.
 */
export async function listScenariosPage(
  ctx: QueryCtx,
  sort: ScenarioSort,
  paginationOpts: PaginationOptions,
  category?: string,
) {
  const { index, order } = scenarioSortToQuery(sort);
  // Pick an index that already encodes the category equality so we never fall
  // back to a post-index `.filter` (a full-table scan). `byCategory` and
  // `byCategoryTimesSelected` both start with `category`; Convex appends
  // `_creationTime` as the final tiebreak, so `byCategory` also serves the
  // creation-time sorts.
  const ordered =
    category === undefined
      ? index === "by_creation_time"
        ? ctx.db.query("scenarios").order(order)
        : ctx.db.query("scenarios").withIndex("byTimesSelected").order(order)
      : index === "by_creation_time"
        ? ctx.db
            .query("scenarios")
            .withIndex("byCategory", (q) => q.eq("category", category))
            .order(order)
        : ctx.db
            .query("scenarios")
            .withIndex("byCategoryTimesSelected", (q) =>
              q.eq("category", category),
            )
            .order(order);
  const result = await ordered.paginate(paginationOpts);
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

/**
 * Sorted names from the managed category list. Every scenario insert path
 * (`createScenario`, `createScenarios`) and rename keeps that list in sync, so
 * there's no need to read `scenarios`, which every round's lock-in writes to.
 */
export async function scenarioCategoriesForAdminCore(ctx: QueryCtx) {
  const managed = await ctx.db.query("scenarioCategories").collect();
  return managed.map((c) => c.name).sort();
}

export const scenarioCategoriesForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return scenarioCategoriesForAdminCore(ctx);
  },
});

// ---- Managed category vocabulary ----

async function categoryByName(ctx: QueryCtx, name: string) {
  return ctx.db
    .query("scenarioCategories")
    .withIndex("byName", (q) => q.eq("name", name))
    .unique();
}

/**
 * Adjust a category's stored scenario count by `delta`, clamping at 0. Inserts
 * the category row if it's missing, so this also keeps the managed list in
 * sync with the categories scenarios use. A row whose count is still unknown
 * (not yet backfilled) is left unknown: seedScenarioCategories sets it exactly.
 * Call it in the same mutation as the scenario write so the two stay in step.
 */
export async function bumpCategoryCount(
  ctx: MutationCtx,
  name: string,
  delta: number,
) {
  const row = await categoryByName(ctx, name);
  if (!row) {
    if (delta > 0) {
      await ctx.db.insert("scenarioCategories", { name, scenarioCount: delta });
    }
  } else if (row.scenarioCount !== undefined) {
    await ctx.db.patch(row._id, {
      scenarioCount: Math.max(0, row.scenarioCount + delta),
    });
  }
}

export async function createCategoryCore(ctx: MutationCtx, rawName: string) {
  const name = rawName.trim();
  if (!name) throw new Error("Category name is required.");
  if (await categoryByName(ctx, name)) {
    throw new Error(`Category "${name}" already exists.`);
  }
  return ctx.db.insert("scenarioCategories", { name, scenarioCount: 0 });
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
  // The stored scenarioCount stays on this row, so it moves with the name.
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
  // One index read decides whether it's in use; the stored count only feeds
  // the message, so a drifted or unknown count can't let a delete through.
  const inUse = await ctx.db
    .query("scenarios")
    .withIndex("byCategory", (q) => q.eq("category", name))
    .first();
  if (inUse) {
    const count = row.scenarioCount ?? "some";
    throw new Error(
      `Category "${name}" is used by ${count} scenario(s) — reassign them first.`,
    );
  }
  await ctx.db.delete(row._id);
}

/**
 * The managed categories with their stored scenario counts, sorted by name.
 * Reads only scenarioCategories (O(categories)); an unknown count shows as 0
 * until seedScenarioCategories backfills it.
 */
export async function listCategoriesWithCountsCore(ctx: QueryCtx) {
  const managed = await ctx.db.query("scenarioCategories").collect();
  return managed
    .map((c) => ({
      name: c.name,
      count: c.scenarioCount ?? 0,
      brief: c.brief ?? "",
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export const listCategoriesWithCounts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return listCategoriesWithCountsCore(ctx);
  },
});

/** The style brief for a single category (used by the generation route). */
export const getCategoryBrief = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requireAdmin(ctx);
    const row = await categoryByName(ctx, name.trim());
    return { brief: row?.brief ?? "" };
  },
});

/** Upsert the style brief on a category (creates the category if missing). */
export async function setCategoryBriefCore(
  ctx: MutationCtx,
  rawName: string,
  rawBrief: string,
) {
  const name = rawName.trim();
  if (!name) throw new Error("Category name is required.");
  const brief = rawBrief.trim();
  const row = await categoryByName(ctx, name);
  if (row) {
    await ctx.db.patch(row._id, { brief: brief || undefined });
  } else {
    await ctx.db.insert("scenarioCategories", {
      name,
      scenarioCount: 0,
      ...(brief ? { brief } : {}),
    });
  }
}

export const setCategoryBrief = mutation({
  args: { name: v.string(), brief: v.string() },
  handler: async (ctx, { name, brief }) => {
    await requireAdmin(ctx);
    await setCategoryBriefCore(ctx, name, brief);
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

export async function createScenariosCore(
  ctx: MutationCtx,
  scenarios: Array<{ description: string; category: string }>,
) {
  const added = new Map<string, number>();
  for (const s of scenarios) {
    const description = s.description.trim();
    const category = s.category.trim();
    if (!description || !category) continue;
    await ctx.db.insert("scenarios", {
      description,
      category,
      timesSelected: 0,
    });
    added.set(category, (added.get(category) ?? 0) + 1);
  }
  // One count update per category rather than per row.
  let created = 0;
  for (const [category, n] of added) {
    await bumpCategoryCount(ctx, category, n);
    created += n;
  }
  return { created };
}

/** Bulk-insert reviewed scenarios (e.g. AI-generated candidates). */
export const createScenarios = mutation({
  args: {
    scenarios: v.array(
      v.object({ description: v.string(), category: v.string() }),
    ),
  },
  handler: async (ctx, { scenarios }) => {
    await requireAdmin(ctx);
    return createScenariosCore(ctx, scenarios);
  },
});

/**
 * Seed scenarioCategories from the categories present on scenarios, and set
 * every row's scenarioCount to the exact number of scenarios using it. Sets
 * values rather than incrementing, so it's safe to re-run: do so to repair
 * counts after scenarios are written outside the admin mutations (the Convex
 * dashboard, `convex import`, the CLI). Run at rollout:
 *   pnpm exec convex run admin:seedScenarioCategories '{}'
 */
export const seedScenarioCategories = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scenarios = await ctx.db.query("scenarios").collect();
    const counts = new Map<string, number>();
    for (const s of scenarios) {
      counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    }
    let created = 0;
    let updated = 0;
    for (const row of await ctx.db.query("scenarioCategories").collect()) {
      const count = counts.get(row.name) ?? 0;
      if (row.scenarioCount !== count) {
        await ctx.db.patch(row._id, { scenarioCount: count });
        updated++;
      }
      counts.delete(row.name);
    }
    // Whatever is left is used by scenarios but has no row yet.
    for (const [name, count] of counts) {
      await ctx.db.insert("scenarioCategories", { name, scenarioCount: count });
      created++;
    }
    return { created, updated };
  },
});
