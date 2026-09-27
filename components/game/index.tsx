"use client";

import {
  Preloaded,
  useMutation,
  usePreloadedQuery,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api";
import PickScenarioGamePhase from "@/components/game/pick-scenario";
import RankPlayersGamePhase from "@/components/game/rank-players";
import GuessScenarioGamePhase from "@/components/game/guess-scenario";
import DisplayResultsGamePhase from "@/components/game/display-results";
import LobbyGamePhase from "@/components/game/lobby";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import CreateScenariosGamePhase from "@/components/game/create-scenarios";
import { useCallback, useEffect, useState } from "react";
import WaitGamePhase from "@/components/game/wait";
import AwaitGuessesGamePhase from "@/components/game/await-guesses";
import { useRouter } from "next/navigation";
import { LoadingButton } from "@/components/ui/loading-button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import GameInstructions from "@/components/game/game-instructions";
import PlayersDialog from "@/components/game/players-dialog";
import { usePostHog } from "posthog-js/react";
import DisconnectPrompt from "@/components/game/presence/disconnect-prompt";
import GameShellSkeleton from "@/components/game/game-shell-skeleton";
import { HEARTBEAT_INTERVAL_MS } from "@/lib/presence";
import { Doc } from "@/convex/_generated/dataModel";

type RoundPhase = Doc<"gameRounds">["phase"];

// The phase steps the host sees straight away, before the server confirms
// them. Only plain forward steps within a round; the server's own rules
// (transitionRoundPhase) still decide, and a rejected step rolls back.
// Leaving guessing for the results is not one of them: the server marks the
// guesses in that transition, so showing the results early would show them
// unmarked, and a rollback would re-arm the host's auto-advance. A new round
// is never faked either, since only the server knows its id.
const OPTIMISTIC_NEXT_PHASE: Partial<Record<RoundPhase, RoundPhase>> = {
  "create-scenarios": "pick-scenario",
  "pick-scenario": "rank-players",
  "rank-players": "guess-scenario",
};

interface GameProps {
  preloadedGame: Preloaded<typeof api.game.fetchGameAndMembership>;
}

export function Game({ preloadedGame }: GameProps) {
  // The page preloads the game and the caller's membership in one query; only
  // the game is needed here, but the subscription stays live for both.
  const { game } = usePreloadedQuery(preloadedGame);
  const players =
    useQuery(api.game.getPlayersForGame, game ? { game: game._id } : "skip") ??
    [];
  const userPlayer = useQuery(
    api.game.getPlayerForCurrentUserForGame,
    game ? { game: game._id } : "skip",
  );
  const currentRound = useQuery(
    api.game.getCurrentGameRound,
    game ? { game: game._id } : "skip",
  );

  // Undefined until everything needed to answer has loaded, so no control is
  // drawn for the wrong person in the meantime: the lobby is the creator's, a
  // round is its host's. A closed game with no round yet is the gap between
  // closing the lobby and round 1 existing, so it stays undefined there too.
  let isHost: boolean | undefined;
  if (game && userPlayer !== undefined) {
    if (game.isOpen) {
      isHost = game.createdBy === userPlayer?.userId;
    } else if (currentRound) {
      isHost = currentRound.hostPlayerId === userPlayer?._id;
    }
  }

  // Only for the host's display name, so it comes out of the player list this
  // screen already holds rather than a subscription of its own. The list keeps
  // inactive players, so a host who was voted out still resolves.
  const currentRoundHost = players.find(
    (p) => p._id === currentRound?.hostPlayerId,
  );

  // Read here only where the parent itself uses the draw: the host's rank and
  // await-guesses screens, and the reveal. The phase components that need it
  // otherwise subscribe themselves with identical args. Skipping it elsewhere
  // matters because it re-runs on every host heartbeat.
  const needsRoundScenarios =
    currentRound?.phase === "display-results" ||
    (isHost === true &&
      (currentRound?.phase === "rank-players" ||
        currentRound?.phase === "guess-scenario"));
  const currentRoundScenarios =
    useQuery(
      api.game.gameRoundScenarios,
      currentRound && needsRoundScenarios
        ? { gameRound: currentRound._id }
        : "skip",
    ) ?? [];
  const selectedScenarioDescription = currentRoundScenarios.find(
    (x) => x.selected,
  )?.scenarioDetails?.description;

  const startGame = useMutation(api.game.startGame);
  const finishRoundAndStartNext = useMutation(api.game.finishRoundAndStartNext);
  const transitionRoundPhase = useMutation(
    api.game.transitionRoundPhase,
  ).withOptimisticUpdate((localStore, { gameRoundId, toPhase }) => {
    // Phase only, on the cached current round this step is about.
    for (const { args, value } of localStore.getAllQueries(
      api.game.getCurrentGameRound,
    )) {
      if (
        value?._id === gameRoundId &&
        OPTIMISTIC_NEXT_PHASE[value.phase] === toPhase
      ) {
        localStore.setQuery(api.game.getCurrentGameRound, args, {
          ...value,
          phase: toPhase,
        });
      }
    }
  });
  const sendHeartbeat = useMutation(api.game.sendHeartbeat);
  const leaveGameFn = useMutation(api.game.leaveGame);

  const { replace } = useRouter();
  const posthog = usePostHog();
  const [isLeavingInProgress, setIsLeavingInProgress] =
    useState<boolean>(false);
  // Header slot the non-host guess phase portals its "Submit Guess" button into,
  // so the action sits in line with the card header (see guess-scenario.tsx).
  const [guessSubmitSlot, setGuessSubmitSlot] = useState<HTMLElement | null>(
    null,
  );

  // Keyed on the id, not the document: `game` is re-pushed on every change to
  // it, and each push used to reset the timer. Beats straight away on mount, on
  // returning to the tab and on reconnecting, since otherwise a returning
  // player looks stale to everyone else until the next tick. It keeps beating
  // while the tab is hidden, because players switch apps mid-game.
  const gameId = game?._id;
  useEffect(() => {
    if (!gameId) return;

    const beat = () => {
      sendHeartbeat({ gameId }).catch((error) =>
        console.error("Error sending heartbeat:", error),
      );
    };
    const beatWhenVisible = () => {
      if (document.visibilityState === "visible") beat();
    };

    beat();
    const intervalId = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", beatWhenVisible);
    window.addEventListener("online", beat);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", beatWhenVisible);
      window.removeEventListener("online", beat);
    };
  }, [sendHeartbeat, gameId]);

  useEffect(() => {
    if (
      players.filter((p) => p.active !== false).length <= 1 &&
      currentRound?.phase === "display-results"
    ) {
      replace("/game");
    }
    // Intentionally only re-run when the player list changes: this redirect is a
    // reaction to players leaving, not to phase transitions. Adding
    // `currentRound?.phase` would additionally fire on phase changes (e.g. a
    // lone host reaching "display-results"), changing observable behavior.
    // `replace` from `useRouter` is stable, so omitting it is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  const isGameFinished = useCallback(() => {
    const currentRound = game?.currentRound ?? 0;
    const maxRounds = game?.totalRounds ?? 0;

    return currentRound >= maxRounds;
  }, [game]);

  const leaveGame = useCallback(async () => {
    try {
      setIsLeavingInProgress(true);

      if (posthog) {
        posthog.capture("game_leave", {
          phase: currentRound?.phase,
          isFinished: isGameFinished(),
        });
      }

      await leaveGameFn({ gameId: game!._id });
      replace("/game");
    } catch {
      toast("Failed to leave game.");
    } finally {
      setIsLeavingInProgress(false);
    }
  }, [currentRound, game, isGameFinished, leaveGameFn, posthog, replace]);

  if (isHost === undefined) {
    return <GameShellSkeleton />;
  }

  const advanceGame = () => {
    if (!game) {
      throw new Error("No game loaded");
    }

    if (game.isOpen) {
      startGame({ game: game._id });
      return;
    }

    if (!isHost) {
      throw new Error(
        "User is not host. Cannot advance the game if user is not the host.",
      );
    }

    if (posthog) {
      posthog.capture("game_advance", { phase: currentRound?.phase });
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        transitionRoundPhase({
          gameRoundId: currentRound._id,
          toPhase: "pick-scenario",
        });
        return;
      case "pick-scenario":
        transitionRoundPhase({
          gameRoundId: currentRound._id,
          toPhase: "rank-players",
        });
        return;
      case "rank-players":
        transitionRoundPhase({
          gameRoundId: currentRound._id,
          toPhase: "guess-scenario",
        });
        return;
      case "guess-scenario":
        transitionRoundPhase({
          gameRoundId: currentRound._id,
          toPhase: "display-results",
        });
        return;
      case "display-results":
        // Only offered while rounds remain: the final round ends through
        // "Finish Game" and the rating screen instead.
        finishRoundAndStartNext({ round: currentRound._id });
        return;
    }
  };

  // The one backward step the round allows: the host reconsidering the category
  // they picked. `transitionRoundPhase` rejects it once a scenario is locked in.
  const goBack = () => {
    if (!currentRound) return;

    if (posthog) {
      posthog.capture("game_phase_rewind", { phase: currentRound.phase });
    }

    transitionRoundPhase({
      gameRoundId: currentRound._id,
      toPhase: "create-scenarios",
    }).catch(() => toast("Couldn't go back to the categories."));
  };

  const gamePhaseTitle = () => {
    if (game?.isOpen) {
      return "Lobby";
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        return isHost ? "Pick Scenario Category" : "Wait For Scenarios";
      case "pick-scenario":
        return isHost ? "Pick Scenario" : "Wait For Scenarios";
      case "rank-players":
        return isHost ? "Rank Players" : "Wait For Scenarios";
      case "guess-scenario":
        return isHost ? "Wait For Guesses" : "Guess Scenario";
      case "display-results":
        return "Results";
      case "finished":
        return "Starting Next Round";
    }
  };

  const gamePhaseDescription = () => {
    if (game?.isOpen) {
      return "Waiting for players to join";
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        return isHost
          ? "Select the category of your scenarios."
          : `${currentRoundHost?.displayName ?? "Your host"} is selecting a scenario category.`;
      case "pick-scenario":
        return isHost
          ? "Choose the scenario you're going to rank everyone on."
          : `${currentRoundHost?.displayName ?? "Your host"} is picking the scenario.`;
      case "rank-players":
        return isHost
          ? "Rank the players from most to least likely by dragging their names."
          : `${currentRoundHost?.displayName ?? "Your host"} is ranking everyone based on their selected scenario.`;
      case "guess-scenario":
        return isHost
          ? "Wait for the players to guess the scenario you've picked"
          : `See how ${currentRoundHost?.displayName ?? "the host"} ranked the scenario. Then guess which one they picked in the Scenarios tab.`;
      case "display-results":
      case "finished":
        return undefined;
    }
  };

  const gamePhaseContent = () => {
    if (game?.isOpen) {
      return (
        <LobbyGamePhase
          joinCode={game.joinCode}
          players={players.map((p) => {
            return {
              id: p._id,
              name: p.displayName,
              userId: p.userId,
              lastAlive: p.lastAlive,
              active: p.active,
            };
          })}
          isHost={isHost}
          advanceGame={advanceGame}
        />
      );
    }

    switch (currentRound?.phase) {
      case "create-scenarios":
        return isHost ? (
          <CreateScenariosGamePhase
            gameId={game!._id}
            gameRoundId={currentRound._id}
            advanceGame={advanceGame}
          />
        ) : (
          <WaitGamePhase />
        );
      case "pick-scenario":
        return isHost ? (
          <PickScenarioGamePhase
            gameRound={currentRound._id}
            advanceGame={advanceGame}
            goBack={goBack}
          />
        ) : (
          <WaitGamePhase />
        );
      case "rank-players":
        return isHost ? (
          <RankPlayersGamePhase
            gameId={game!._id}
            roundId={currentRound._id}
            scenario={selectedScenarioDescription ?? ""}
            advanceGame={advanceGame}
          />
        ) : (
          <WaitGamePhase />
        );
      case "guess-scenario":
        return isHost ? (
          <AwaitGuessesGamePhase
            gameRoundId={currentRound._id}
            isHost={isHost}
            advanceGame={advanceGame}
            scenario={selectedScenarioDescription}
          />
        ) : (
          <GuessScenarioGamePhase
            gameId={game!._id}
            roundId={currentRound._id}
            submitSlot={guessSubmitSlot}
          />
        );
      case "display-results":
        return (
          <DisplayResultsGamePhase
            joinCode={game!.joinCode}
            roundId={currentRound._id}
            isHost={isHost}
            hostDisplayName={currentRoundHost?.displayName}
            correctAnswer={selectedScenarioDescription}
            isGameFinished={isGameFinished}
            advanceGame={advanceGame}
          />
        );
      case "finished":
        // The moment between this round finishing and the next one existing.
        return <WaitGamePhase />;
    }
  };

  return (
    <div
      className={"flex flex-col w-full md:w-[75%] h-full max-h-svh gap-4 py-4"}
    >
      {game && !game.isOpen && currentRound && (
        <DisconnectPrompt
          joinCode={game.joinCode}
          players={players}
          hostPlayerId={currentRound.hostPlayerId}
          viewerPlayerId={userPlayer?._id}
        />
      )}
      <div className={"shrink-0 w-full flex flex-row gap-2"}>
        <GameInstructions />
        <PlayersDialog
          players={players}
          hostPlayerId={currentRound?.hostPlayerId}
          viewerPlayerId={userPlayer?._id}
        />
        {!isGameFinished() && !isHost && (
          <LoadingButton
            className={"bg-red-200 hover:bg-red-500 text-white w-fit"}
            variant={"destructive"}
            loading={isLeavingInProgress}
            disabled={isLeavingInProgress}
            onClick={() => {
              leaveGame();
            }}
          >
            {!isLeavingInProgress && (
              <>
                Leave Game
                <LogOut />
              </>
            )}
          </LoadingButton>
        )}
      </div>
      <Card className={"grow flex flex-col overflow-y-hidden"}>
        <CardHeader className={"shrink-0"}>
          <CardTitle>{gamePhaseTitle()}</CardTitle>
          <CardDescription>{gamePhaseDescription()}</CardDescription>
          {!game?.isOpen &&
            currentRound?.phase === "guess-scenario" &&
            !isHost && (
              <CardAction>
                <div ref={setGuessSubmitSlot} />
              </CardAction>
            )}
        </CardHeader>
        <CardContent className={"grow overflow-y-auto min-h-0"}>
          <div className={"flex flex-col h-full"}>{gamePhaseContent()}</div>
        </CardContent>
      </Card>
    </div>
  );
}
