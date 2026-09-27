import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { env } from "@/app/env";

/**
 * The public summary of the game behind an invite link, or `null` when there is
 * no such game or it can't be reached.
 *
 * Memoised per request: the invite page's metadata and its body both ask for
 * it while rendering the same response. Fetched without a token on purpose —
 * link-preview crawlers have none.
 */
export const getInvite = cache(async (joinCode: string) => {
  try {
    return await fetchQuery(
      api.game.getInvite,
      { joinCode },
      { url: env.NEXT_PUBLIC_CONVEX_URL },
    );
  } catch (error) {
    unstable_rethrow(error); // Next's own control flow, not a failure
    // A preview with the brand card beats a failed page or a broken image.
    console.error("Failed to load invite", joinCode, error);
    return null;
  }
});

export type Invite = NonNullable<Awaited<ReturnType<typeof getInvite>>>;

/** "George's game", or "the game" when the host has no name to show. */
function gameName(invite: Invite): string {
  return invite.hostName ? `${invite.hostName}’s game` : "the game";
}

/** The headline for an invite, shared by its page, tags and image. */
export function inviteTitle(invite: Invite | null): string {
  if (invite?.status === "open") return `Join ${gameName(invite)}`;
  if (invite?.status === "started") {
    const name = gameName(invite);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} has started`;
  }
  return "Play The ID Game";
}

export function roundsLabel(totalRounds: number): string {
  return `${totalRounds} ${totalRounds === 1 ? "round" : "rounds"}`;
}
