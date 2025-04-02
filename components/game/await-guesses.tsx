"use client";

import { Id } from "@/convex/_generated/dataModel";
import {api} from "@/convex/_generated/api";
import {useQuery} from "convex/react";
import {Card, CardTitle} from "@/components/ui/card";
import {Check, Loader2} from "lucide-react";
import {clsx} from "clsx";
import {useEffect, useState} from "react";
import {ScrollArea} from "@/components/ui/scroll-area";

interface AwaitGuessesGamePhaseProps {
  gameRoundId: Id<'gameRounds'>;
  isHost: boolean;
  advanceGame?: () => void;
}

export default function AwaitGuessesGamePhase({ gameRoundId, isHost, advanceGame }: AwaitGuessesGamePhaseProps) {
  if (isHost && !advanceGame) {
    throw new Error("advanceGame must be defined if player is host")
  }

  const guessStatus = useQuery(api.game.getGuessesStatusForRound, { roundId: gameRoundId });
  const [shouldAdvance, setShouldAdvance] = useState<boolean>(false);

  useEffect(() => {
    if (guessStatus?.guessingCompleteByAllUsers && isHost) {
      setShouldAdvance(true);
    }
  }, [guessStatus?.guessingCompleteByAllUsers, isHost]);

  useEffect(() => {
    if (shouldAdvance && advanceGame) {
      setTimeout(() => {
        advanceGame();
        setShouldAdvance(false); // Reset to prevent unwanted re-triggers
      }, 500);
    }
  }, [shouldAdvance, advanceGame]);

  if (!guessStatus) {
    return <p className="text-center text-gray-500">Loading...</p>;
  }

  const { playerGuesses } = guessStatus;

  return (
    <>
      <ScrollArea className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="grid grid-cols-1 gap-2">
          {playerGuesses.map((playerGuess) => (
            <Card
              key={playerGuess.player}
              className={clsx("p-4 flex flex-row items-center justify-between transition-opacity", {
                "opacity-50": !!playerGuess.hasGuessed,
              })}
            >
              <CardTitle>{playerGuess.displayName}</CardTitle>
              {playerGuess.hasGuessed ? <Check className="text-green-500" /> : <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
            </Card>
          ))}
        </div>
      </ScrollArea>
    </>
  )
}