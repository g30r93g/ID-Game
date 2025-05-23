"use client";

import {Preloaded, useMutation, usePreloadedQuery, useQuery} from "convex/react";
import {api} from "@/convex/_generated/api";
import PickScenarioGamePhase from "@/components/game/pick-scenario";
import RankPlayersGamePhase from "@/components/game/rank-players";
import GuessScenarioGamePhase from "@/components/game/guess-scenario";
import DisplayResultsGamePhase from "@/components/game/display-results";
import LobbyGamePhase from "@/components/game/lobby";
import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import CreateScenariosGamePhase from "@/components/game/create-scenarios";
import {useCallback, useEffect, useState} from "react";
import WaitGamePhase from "@/components/game/wait";
import AwaitGuessesGamePhase from "@/components/game/await-guesses";
import {useRouter} from "next/navigation";
import {LoadingButton} from "@/components/ui/loading-button";
import {LogOut} from "lucide-react";
import {toast} from "sonner";
import GameInstructions from "@/components/game/game-instructions";
import {usePostHog} from "posthog-js/react";

interface GameProps {
  preloadedGame: Preloaded<typeof api.game.fetchGameByJoinCode>;
}

export function Game({ preloadedGame }: GameProps) {
  const game = usePreloadedQuery(preloadedGame);
  const players = useQuery(api.game.getPlayersForGame, game ? { game: game._id } : "skip") ?? [];
  const userPlayer = useQuery(api.game.getPlayerForCurrentUserForGame, game ? { game: game._id } : "skip");
  const currentRound = useQuery(api.game.getCurrentGameRound, game ? { game: game._id } : "skip");
  const currentRoundHost = useQuery(api.game.getCurrentGameRoundHostPlayer, game ? { game: game._id } : "skip");
  const currentRoundScenarios = useQuery(api.game.gameRoundScenarios, currentRound ? { gameRound: currentRound._id  } : "skip") ?? [];

  const closeGameToNewPlayers = useMutation(api.game.closeGameToNewPlayers);
  const startNewGameRound = useMutation(api.game.startNewGameRound);
  const transitionRoundPhase = useMutation(api.game.transitionRoundPhase);
  const sendHeartbeat = useMutation(api.game.sendHeartbeat);
  const leaveGameFn = useMutation(api.game.leaveGame);

  const { replace } = useRouter();
  const posthog = usePostHog();
  const [isLeavingInProgress, setIsLeavingInProgress] = useState<boolean>(false);

  useEffect(() => {
    const intervalId = setInterval(() => {
      sendHeartbeat()
        .then(() => console.log("Heartbeat sent"))
        .catch((error) => console.error("Error sending heartbeat:", error));
    }, 15000);

    return () => clearInterval(intervalId);
  }, [sendHeartbeat]);

  useEffect(() => {
    if (players.length <= 1 && currentRound?.phase === "display-results") {
      replace('/game')
    }
  }, [players])

  const userIsHost = () => {
    if (game?.isOpen) {
      // check that the person who created the game is the current user
      console.log("game created by", game.createdBy, "player user id", userPlayer?.userId, "isHost?", game.createdBy === userPlayer?.userId);
      return game.createdBy === userPlayer?.userId;
    }

    return currentRound?.hostPlayerId === userPlayer?._id;
  }

  const isGameFinished = useCallback(() => {
    const currentRound = game?.currentRound ?? 0;
    const maxRounds = game?.totalRounds ?? 0;

    return currentRound >= maxRounds;
  }, [game?.currentRound, game?.totalRounds, game]);

  const leaveGame = useCallback(async () => {
    try {
      setIsLeavingInProgress(true);

      if (posthog) {
        posthog.capture('game_leave', {phase: currentRound?.phase, isFinished: isGameFinished});
      }

      await leaveGameFn({ gameId: game!._id });
      replace('/game')
    } catch {
      toast('Failed to leave game.')
    } finally {
      setIsLeavingInProgress(false);
    }
  }, [])

  const advanceGame = () => {
    if (!game) {
      throw new Error("No game loaded");
    }

    if (game.isOpen) {
      closeGameToNewPlayers({ game: game._id }).then(() => {
        console.log("Starting new round. Game is now closed to new players")
        startNewGameRound({ game: game._id });
      })
      return;
    }

    if (!userIsHost()) {
      throw new Error("User is not host. Cannot advance the game if user is not the host.");
    }

    if (posthog) {
      posthog.capture('game_advance', { phase: currentRound?.phase });
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        transitionRoundPhase({ gameRoundId: currentRound._id, toPhase: "pick-scenario" })
        return;
      case "pick-scenario":
        transitionRoundPhase({ gameRoundId: currentRound._id, toPhase: "rank-players" })
        return;
      case "rank-players":
        transitionRoundPhase({ gameRoundId: currentRound._id, toPhase: "guess-scenario" })
        return;
      case "guess-scenario":
        transitionRoundPhase({ gameRoundId: currentRound._id, toPhase: "display-results" })
        return;
      case "display-results":
        transitionRoundPhase({ gameRoundId: currentRound._id, toPhase: "finished" }).then(() => {
          startNewGameRound({ game: game._id });
        })
        return;
    }
  }

  const gamePhaseTitle = () => {
    if (game?.isOpen) {
      return "Lobby";
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        return userIsHost() ? "Pick Scenario Category" : "Wait For Scenarios";
      case "pick-scenario":
        return userIsHost() ? "Pick Scenario" : "Wait For Scenarios";
      case "rank-players":
        return userIsHost() ? "Rank Players" : "Wait For Scenarios";
      case "guess-scenario":
        return userIsHost() ? "Wait For Guesses" : "Guess Scenario";
      case "display-results":
        return "Results";
    }
  }

  const gamePhaseDescription = () => {
    if (game?.isOpen) {
      return "Waiting for players to join"
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        return userIsHost() ? "Select the category of your scenarios." : `${currentRoundHost?.displayName ?? 'Your host'} is selecting a scenario category.`
      case "pick-scenario":
        return userIsHost() ? "Choose the scenario you're going to rank everyone on." : `${currentRoundHost?.displayName ?? 'Your host'} is picking the scenario.`
      case "rank-players":
        return userIsHost() ? "Rank the players from most to least likely by dragging their names." : `${currentRoundHost?.displayName ?? 'Your host'} is ranking everyone based on their selected scenario.`
      case "guess-scenario":
        return userIsHost() ? "Wait for the players to guess the scenario you've picked" : "Guess which scenario you think was picked."
      case "display-results":
      case "finished":
        return undefined;
    }
  }

  const gamePhaseContent = () => {
    if (game?.isOpen) {
      return <LobbyGamePhase joinCode={game.joinCode} players={players.map((p) => {
        return {
          id: p._id,
          name: p.displayName,
          userId: p.userId
        }
      })} isHost={userIsHost()} advanceGame={advanceGame} />
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        return userIsHost() ? <CreateScenariosGamePhase
          gameId={game!._id}
          gameRoundId={currentRound._id}
          advanceGame={advanceGame}
        /> : <WaitGamePhase />
      case "pick-scenario":
        return userIsHost() ? <PickScenarioGamePhase
          gameRound={currentRound._id}
          advanceGame={advanceGame}
        /> : <WaitGamePhase />
      case "rank-players":
        return userIsHost() ? <RankPlayersGamePhase
          gameId={game!._id}
          roundId={currentRound._id}
          scenario={currentRoundScenarios.find((x) => x.selected)?.scenarioDetails?.description ?? ""}
          advanceGame={advanceGame}
        /> : <WaitGamePhase />
      case "guess-scenario":
        return userIsHost() ?
          <AwaitGuessesGamePhase
            gameRoundId={currentRound._id}
            isHost={userIsHost()}
            advanceGame={userIsHost() ? advanceGame : undefined}
          />
          : <GuessScenarioGamePhase
            gameId={game!._id}
            roundId={currentRound._id}
          />
      case "display-results":
        return <DisplayResultsGamePhase
          joinCode={game!.joinCode}
          roundId={currentRound._id}
          isHost={userIsHost()}
          isGameFinished={isGameFinished}
          advanceGame={advanceGame}
        />
    }
  }

  return (
    <div className="w-full md:w-[75%] items-center flex flex-col gap-4">
      <div className={"w-full flex flex-row gap-2"}>
        <GameInstructions />
        {!isGameFinished() && !userIsHost() && (
          <LoadingButton className={"bg-red-200 hover:bg-red-500 text-white w-fit"} variant={"destructive"} loading={isLeavingInProgress} disabled={isLeavingInProgress} onClick={() => { leaveGame() }}>
            {!isLeavingInProgress && (
              <>
                Leave Game
                <LogOut />
              </>
            )}
          </LoadingButton>
        )}
      </div>
      <Card className={"w-full"}>
        <CardHeader>
          <CardTitle>{gamePhaseTitle()}</CardTitle>
          <CardDescription>{gamePhaseDescription()}</CardDescription>
        </CardHeader>
        <CardContent>{gamePhaseContent()}</CardContent>
      </Card>
    </div>
  )
}