import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { authComponent, createAuthOptions } from "./auth";
import { requireAdmin } from "./adminAuth";

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
