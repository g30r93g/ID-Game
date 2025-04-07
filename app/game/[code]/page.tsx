import {Game} from "@/components/game";
import { api } from "@/convex/_generated/api";
import {fetchMutation, fetchQuery, preloadQuery} from "convex/nextjs";
import {redirect} from "next/navigation";
import {getAuthToken} from "@/lib/auth";
import PostHogClient from "@/lib/posthog";
import {currentUser} from "@clerk/nextjs/server";

export default async function GamePage({ params }: { params?: Promise<{ code: string }> }) {
  // Get current user's ID
  const [token, user] = await Promise.all([
    getAuthToken(),
    currentUser(),
  ]);
  if (!user) {
    console.error("No user is found")
    redirect('/game');
  }
  if (!token) {
    console.error("No authentication token found")
    redirect('/game');
  }

  // get join code
  const joinCode = (await params)?.code;

  if (joinCode === null || joinCode === undefined) {
    console.log("joinCode", joinCode)
    return <p>No Join Code Supplied</p>
  }
  if (joinCode.length !== 6) {
    console.error("The join code was invalid");
    redirect('/game')
  }

  const { capture } = PostHogClient();

  // Ensure the current user is a player, otherwise join them
  const isUserPlayer = await fetchQuery(api.game.isUserPlayer, { joinCode }, { token });
  if (!isUserPlayer) {
    try {
      capture({
        distinctId: user.id,
        event: "game_join",
        properties: {
          joinCode
        }
      });

      await fetchMutation(api.game.joinGame, {joinCode}, {token})
    } catch {
      redirect('/game');
    }
  }

  // get game data
  const preloadedGame = await preloadQuery(api.game.fetchGameByJoinCode, {
    joinCode
  });

  return <Game preloadedGame={preloadedGame} />
}