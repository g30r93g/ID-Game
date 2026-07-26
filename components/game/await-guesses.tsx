"use client";

import GuessTally from "@/components/game/guess-tally";
import ScenarioBanner from "@/components/game/scenario-banner";
import { Card, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { clsx } from "clsx";
import { useQuery } from "convex/react";
import { Check, Eye, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

  // Hidden by default: a host holding their phone up to show the guessers
  // shouldn't reveal the answer by accident. The text stays mounted and is
  // blurred rather than unmounted, so the banner keeps its size and the whole
  // thing stays a large tap target instead of a small toggle button.
  const [scenarioHidden, setScenarioHidden] = useState<boolean>(true);

  if (!guessStatus) {
    return <p className="text-center text-gray-500">Loading...</p>;
  }

  // `tally` is null for anyone still to guess — the server decides, so there is
  // nothing to gate here.
  const { playerGuesses, tally } = guessStatus;

  return (
    <>
      {scenario && (
        <button
          type="button"
          onClick={() => setScenarioHidden((hidden) => !hidden)}
          aria-pressed={!scenarioHidden}
          aria-label={scenarioHidden ? "Show scenario" : "Hide scenario"}
          className="relative mb-6! w-full cursor-pointer text-left rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ScenarioBanner
            scenario={scenario}
            className="w-full"
            contentClassName={scenarioHidden ? "select-none" : undefined}
            contentStyle={{
              filter: scenarioHidden ? "blur(6px)" : "blur(0px)",
              WebkitFilter: scenarioHidden ? "blur(6px)" : "blur(0px)",
              opacity: scenarioHidden ? 0.7 : 1,
              transition:
                "filter 300ms ease-out, -webkit-filter 300ms ease-out, opacity 300ms ease-out",
            }}
          />
          {/* Sits over the blurred text as the affordance, and fades out with
              it. Never intercepts the tap — the whole banner is the target. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground"
            style={{
              opacity: scenarioHidden ? 1 : 0,
              transition: "opacity 300ms ease-out",
            }}
          >
            <Eye className="size-4 shrink-0" />
            Peek at selected scenario
          </span>
        </button>
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
