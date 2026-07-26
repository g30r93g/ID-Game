"use client";

import { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Card, CardTitle } from "@/components/ui/card";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import ScenarioBanner from "@/components/game/scenario-banner";
import GuessTally from "@/components/game/guess-tally";

interface AwaitGuessesGamePhaseProps {
  gameRoundId: Id<"gameRounds">;
  isHost: boolean;
  advanceGame?: () => void;
  /**
   * The scenario the host picked, so they can re-check it while waiting rather
   * than having to remember it. Passed only on the host branch; a non-host
   * client could not resolve it anyway, because `gameRoundScenarios` withholds
   * the `selected` flag from them until results.
   */
  scenario?: string;
}

export default function AwaitGuessesGamePhase({
  gameRoundId,
  isHost,
  advanceGame,
  scenario,
}: AwaitGuessesGamePhaseProps) {
  if (isHost && !advanceGame) {
    throw new Error("advanceGame must be defined if player is host");
  }

  const guessStatus = useQuery(api.game.getGuessesStatusForRound, {
    roundId: gameRoundId,
  });

  // Keep the latest `advanceGame` in a ref so the scheduling effect below can
  // call it without re-running (and re-scheduling) whenever the parent passes a
  // new function identity on every render.
  const advanceGameRef = useRef(advanceGame);
  useEffect(() => {
    advanceGameRef.current = advanceGame;
  }, [advanceGame]);

  // When every player has guessed and we're the host, advance the game once,
  // ~500ms later. Keyed only on the completion/host signals so it fires a single
  // time per transition; the cleanup cancels the pending advance if the signal
  // flips back before it runs.
  useEffect(() => {
    if (!(guessStatus?.guessingCompleteByAllUsers && isHost)) return;

    const timeoutId = setTimeout(() => {
      advanceGameRef.current?.();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [guessStatus?.guessingCompleteByAllUsers, isHost]);

  // Collapsed by default: a host holding their phone up to show the guessers
  // shouldn't reveal the answer by accident.
  const [scenarioVisible, setScenarioVisible] = useState<boolean>(false);

  if (!guessStatus) {
    return <p className="text-center text-gray-500">Loading...</p>;
  }

  // `tally` is null for anyone still to guess — the server decides, so there is
  // nothing to gate here.
  const { playerGuesses, tally } = guessStatus;

  return (
    <>
      {scenario && (
        <div className="mb-3 flex flex-col items-start gap-2">
          {scenarioVisible && (
            <ScenarioBanner scenario={scenario} className="w-full" />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setScenarioVisible((visible) => !visible)}
          >
            {scenarioVisible ? <EyeOff /> : <Eye />}
            {scenarioVisible ? "Hide scenario" : "Show scenario"}
          </Button>
        </div>
      )}
      {tally && <GuessTally rows={tally} />}
      <ScrollArea className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="grid grid-cols-1 gap-2">
          {playerGuesses.map((playerGuess) => (
            <Card
              key={playerGuess.player}
              className={clsx(
                "p-4 flex flex-row items-center justify-between transition-opacity",
                {
                  "opacity-50": !!playerGuess.hasGuessed,
                },
              )}
            >
              <CardTitle>{playerGuess.displayName}</CardTitle>
              {playerGuess.hasGuessed ? (
                <Check className="text-green-500" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
              )}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </>
  );
}
