import {mutation} from "./_generated/server";
import {v} from "convex/values";
import {getAuthUserId} from "@convex-dev/auth/server";

export const updateUserName = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    // Obtain authed user ID
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("User must be authenticated to join a game.");
    }

    // Obtain user
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("No such user exists in the database!")
    }

    // Update name field
    await ctx.db.patch(user._id, { name: args.name })
  }
})