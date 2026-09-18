import { Game } from "@/components/game";
import { api } from "@/convex/_generated/api";
import { redirect } from "next/navigation";
import { preloadedQueryResult } from "convex/nextjs";
import {
  fetchAuthMutation,
  fetchAuthQuery,
  getToken,
  preloadAuthQuery,
} from "@/lib/auth-server";
import PostHogClient from "@/lib/posthog";

export default async function GamePage({
  params,
}: {
  params?: Promise<{ code: string }>;
}) {
  const token = await getToken();
  if (!token) {
    console.error("No authentication token found");
    redirect("/game");
  }

  // Settle the join code before any network work. Rejecting a malformed code
  // here costs nothing, where doing it after the reads spent round trips the
  // page was always going to throw away.
  const joinCode = (await params)?.code;

  if (joinCode === null || joinCode === undefined) {
    console.log("joinCode", joinCode);
    return <p>No Join Code Supplied</p>;
  }
  if (joinCode.length !== 6) {
    console.error("The join code was invalid");
    redirect("/game");
  }

  // Neither read depends on the other, so they go out together. Run in series
  // this was the bulk of the delay after "Create New Game": nothing renders
  // until both land, so the page paid for them one after the other.
  //
  // The game read catches its own failure so a rejection can't take the batch
  // down with it — a token that got past `getToken` but is rejected by Convex
  // ended in a redirect before, and still should. It is logged, not swallowed.
  const [user, preloadedGame] = await Promise.all([
    fetchAuthQuery(api.auth.getCurrentUser, {}),
    preloadAuthQuery(api.game.fetchGameAndMembership, { joinCode }).catch(
      (error) => {
        console.error("Failed to load game", joinCode, error);
        return null;
      },
    ),
  ]);

  if (!user) {
    console.error("No user is found");
    redirect("/game");
  }
  if (!preloadedGame) {
    redirect("/game");
  }

  const { game, isPlayer } = preloadedQueryResult(preloadedGame);
  if (!game) {
    console.error(`No game found with join code: ${joinCode}`);
    redirect("/game");
  }

  // Ensure the current user is a player, otherwise join them. Whoever created
  // the game is already one, so this whole branch is skipped on the create path.
  if (!isPlayer) {
    try {
      const posthog = PostHogClient();
      if (posthog) {
        posthog.capture({
          distinctId: user.id,
          event: "game_join",
          properties: {
            joinCode,
          },
        });
      }

      await fetchAuthMutation(api.game.joinGame, { joinCode });
    } catch {
      redirect("/game");
    }
  }

  return <Game preloadedGame={preloadedGame} />;
}
