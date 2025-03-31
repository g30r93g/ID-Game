"use client";

import {Button} from "@/components/ui/button";
import {ArrowRight, Check, X} from "lucide-react";
import {useMutation, useQuery} from "convex/react";
import {api} from "@/convex/_generated/api";
import {useCallback, useEffect} from "react";
import {Id} from "@/convex/_generated/dataModel";
import {Card, CardTitle} from "@/components/ui/card";

interface DisplayResultsGamePhaseProps {
  roundId: Id<'gameRounds'>;
  isHost: boolean;
  advanceGame: () => void;
}

export default function DisplayResultsGamePhase({ roundId, isHost, advanceGame }: DisplayResultsGamePhaseProps) {
  const markGuessesForRound = useMutation(api.game.markGuessesForRound);
  const results = useQuery(api.game.getGuessesForRound, { roundId: roundId }) ?? [];

  const performGuessMarking = useCallback(async () => {
    await markGuessesForRound({ roundId: roundId });
  }, [markGuessesForRound, roundId]);

  useEffect(() => {
    if (isHost) {
      performGuessMarking();
    }
  }, [isHost, performGuessMarking])

  return (
    <div className={"flex flex-col gap-4"}>
      {results?.map((r) => (
        <Card key={r._id} className={"p-4 items-center grid grid-cols-[1fr_auto] gap-2"}>
            <CardTitle>{r.playerDisplayName}</CardTitle>
            {r.isCorrect ? <Check className={"fill-green"} /> : <X className={"fill-red"} />}
        </Card>
      ))}
      {isHost && results.length && (
        <Button onClick={() => { advanceGame() }}>
          Next Round
          <ArrowRight />
        </Button>
      )}
    </div>
  )
}
