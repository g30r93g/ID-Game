import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { authComponent, createAuthOptions, createAuth } from "./auth";
import { requireAdmin } from "./adminAuth";
import {
  activePlayerCount,
  computeGameStats,
  gameDurationMs,
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
    return await ctx.db.insert("scenarios", {
      description,
      category,
      timesSelected: 0,
    });
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
