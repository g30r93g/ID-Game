import { Game } from "@/components/game";
import { api } from "@/convex/_generated/api";
import { redirect } from "next/navigation";
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

  const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
  if (!user) {
    console.error("No user is found");
    redirect("/game");
  }

  // get join code
  const joinCode = (await params)?.code;

  if (joinCode === null || joinCode === undefined) {
    console.log("joinCode", joinCode);
    return <p>No Join Code Supplied</p>;
  }
  if (joinCode.length !== 6) {
    console.error("The join code was invalid");
    redirect("/game");
  }

  const posthog = PostHogClient();

  // Ensure the current user is a player, otherwise join them
  const isUserPlayer = await fetchAuthQuery(api.game.isUserPlayer, {
    joinCode,
  });
  if (!isUserPlayer) {
    try {
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

  // get game data
  const preloadedGame = await preloadAuthQuery(api.game.fetchGameByJoinCode, {
    joinCode,
  });

  return <Game preloadedGame={preloadedGame} />;
}
