import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Hands a guest's seats to the account they have just signed in or signed up
 * with, so upgrading mid-game doesn't drop them out of it.
 *
 * Called from the anonymous plugin's `onLinkAccount` hook (convex/auth.ts),
 * which runs before the guest user is deleted. Only `players` rows move:
 * guests can't create games, so no `games.createdBy` points at one.
 *
 * `displayName` is the account's name, when it has one. Like
 * `syncDisplayName`, the moved rows take it so the cards match the account.
 */
export const adoptGuestPlayers = internalMutation({
  args: {
    guestUserId: v.string(),
    userId: v.string(),
    displayName: v.optional(v.string()),
  },
  returns: v.object({ moved: v.number(), duplicates: v.number() }),
  handler: async (ctx, { guestUserId, userId, displayName }) => {
    const guestRows = await ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", guestUserId))
      .collect();

    let moved = 0;
    let duplicates = 0;
    for (const row of guestRows) {
      const existing = await ctx.db
        .query("players")
        .withIndex("byGameUser", (q) =>
          q.eq("gameId", row.gameId).eq("userId", userId),
        )
        .first();

      if (existing) {
        // The account already has its own seat in this game, and two rows for
        // one user would make every "me in this game" lookup ambiguous. The
        // account's seat wins; the guest's is retired the way consensus
        // removal retires a player, so nobody waits on it. It keeps its user
        // id because rounds, rankings and guesses may still point at it.
        await ctx.db.patch(row._id, { active: false });
        duplicates++;
        continue;
      }

      await ctx.db.patch(row._id, {
        userId,
        ...(displayName ? { displayName } : {}),
      });
      moved++;
    }

    return { moved, duplicates };
  },
});
