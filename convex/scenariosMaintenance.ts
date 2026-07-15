import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Bulk-delete scenarios by id. Internal so it can be driven from trusted tooling
 * (the Convex MCP / CLI) without a logged-in admin identity. Skips ids that no
 * longer exist and reports how many rows were actually removed.
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
    for (const id of ids) {
      if (await ctx.db.get(id)) {
        await ctx.db.delete(id);
        deleted++;
      } else {
        missing.push(id);
      }
    }
    return { deleted, missing };
  },
});
