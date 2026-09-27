import { Game } from "@/components/game";
import { api } from "@/convex/_generated/api";
import { redirect } from "next/navigation";
import { after } from "next/server";
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

  // The game the screen keeps live, and whether the caller is in it yet, asked
  // together. Membership is asked once rather than kept live: only this page
  // needs it, to decide whether to join the caller first.
  //
  // A failure is caught so a rejection can't take the page down with it: a
  // token that got past `getToken` but is rejected by Convex ends in a
  // redirect. It is logged, not swallowed.
  const loaded = await Promise.all([
    preloadAuthQuery(api.game.getGameForViewer, { joinCode }),
    fetchAuthQuery(api.game.isPlayerInGame, { joinCode }),
  ]).catch((error) => {
    console.error("Failed to load game", joinCode, error);
    return null;
  });
  if (!loaded) {
    redirect("/game");
  }
  const [preloadedGame, isPlayer] = loaded;

  const { game } = preloadedQueryResult(preloadedGame);
  if (!game) {
    console.error(`No game found with join code: ${joinCode}`);
    redirect("/game");
  }

  // Ensure the current user is a player, otherwise join them. Whoever created
  // the game is already one, so this whole branch is skipped on the create path.
  if (!isPlayer) {
    // Only needed here, for the analytics id, so everyone else skips it.
    const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
    if (!user) {
      console.error("No user is found");
      redirect("/game");
    }

    try {
      await fetchAuthMutation(api.game.joinGame, { joinCode });
    } catch {
      redirect("/game");
    }

    // Recorded once the join has gone through, and flushed after the response
    // is sent: `after` keeps the invocation alive until the flush finishes, so
    // the event isn't lost to a frozen function, and a slow PostHog no longer
    // holds up the page. `distinctId` is the Better Auth user ID, which is what
    // the browser identifies as too (see providers/Posthog.tsx), so this lands
    // on the same person as the rest of the session. A failure is logged, never
    // thrown.
    after(async () => {
      const posthog = PostHogClient();
      posthog.capture({
        distinctId: user.id,
        event: "game_join",
        properties: {
          joinCode,
        },
      });
      await posthog.shutdown().catch((error) => {
        console.error("Could not record game_join in PostHog", error);
      });
    });
  }

  // Everything the screen needs for its first paint, so it renders the real
  // phase instead of a skeleton and waits on no client-side round trips. Read
  // after any join above, so a new player is already in the list.
  const screen = await Promise.all([
    preloadAuthQuery(api.game.getPlayersForGame, { game: game._id }),
    preloadAuthQuery(api.game.getCurrentGameRound, { game: game._id }),
  ]).catch((error) => {
    console.error("Failed to load game", joinCode, error);
    return null;
  });
  if (!screen) {
    redirect("/game");
  }
  const [preloadedPlayers, preloadedRound] = screen;

  return (
    <Game
      preloadedGame={preloadedGame}
      preloadedPlayers={preloadedPlayers}
      preloadedRound={preloadedRound}
    />
  );
}
