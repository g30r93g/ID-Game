import {Game} from "@/components/game";
import { api } from "@/convex/_generated/api";
import {fetchMutation, fetchQuery, preloadQuery} from "convex/nextjs";
import {redirect} from "next/navigation";
import {getAuthToken} from "@/lib/auth";

export default async function GamePage({ params }: { params?: Promise<{ code: string }> }) {
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

  // Get current user's ID
  const token = await getAuthToken();
  if (!token) {
    console.error("No JWT for user")
    redirect('/game');
  }

  // Ensure the current user is a player, otherwise join them
  const isUserPlayer = await fetchQuery(api.game.isUserPlayer, { joinCode }, { token });
  if (!isUserPlayer) {
    try {
      // todo: add posthog capture
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