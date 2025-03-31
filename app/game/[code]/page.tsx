import {Game} from "@/components/game";
import { api } from "@/convex/_generated/api";
import {preloadQuery} from "convex/nextjs";

export default async function GamePage({ params }: { params?: Promise<{ code: string }> }) {
  // get join code
  const joinCode = (await params)?.code;

  if (joinCode === null || joinCode === undefined) {
    console.log("joinCode", joinCode)
    return <p>No Join Code Supplied</p>
  }
  if (joinCode.length !== 6) {
    return <p>Join Code Invalid</p>
  }

  // get game data
  const preloadedGame = await preloadQuery(api.game.fetchGameByJoinCode, {
    joinCode
  });

  return <Game preloadedGame={preloadedGame} />
}