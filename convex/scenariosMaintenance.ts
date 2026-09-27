import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { bumpCategoryCount } from "./admin";

/**
 * Bulk-delete scenarios by id. Internal so it can be driven from trusted tooling
 * (the Convex MCP / CLI) without a logged-in admin identity. Skips ids that no
 * longer exist and reports how many rows were actually removed. Decrements each
 * affected category's stored scenarioCount in the same transaction.
 *   pnpm exec convex run scenariosMaintenance:deleteScenarios '{"ids":["<id>", ...]}'
 */
export const deleteScenarios = internalMutation({
  args: { ids: v.array(v.id("scenarios")) },
  returns: v.object({
    deleted: v.number(),
    missing: v.array(v.id("scenarios")),
  }),
  handler: async (ctx, { ids }) => {
    let deleted = 0;
    const missing: Array<(typeof ids)[number]> = [];
    const removed = new Map<string, number>();
    for (const id of ids) {
      const scenario = await ctx.db.get(id);
      if (scenario) {
        await ctx.db.delete(id);
        removed.set(scenario.category, (removed.get(scenario.category) ?? 0) + 1);
        deleted++;
      } else {
        missing.push(id);
      }
    }
    for (const [category, n] of removed) {
      await bumpCategoryCount(ctx, category, -n);
    }
    return { deleted, missing };
  },
});
