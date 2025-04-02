"use client";

import {Button} from "@/components/ui/button";
import {ArrowRight, Check, LogOut, X} from "lucide-react";
import {useMutation, useQuery} from "convex/react";
import {api} from "@/convex/_generated/api";
import {useCallback, useEffect, useState} from "react";
import {Id} from "@/convex/_generated/dataModel";
import {Card, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {FaFlagCheckered} from "react-icons/fa6";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {LoadingButton} from "@/components/ui/loading-button";

interface DisplayResultsGamePhaseProps {
  gameId: Id<'games'>;
  roundId: Id<'gameRounds'>;
  isHost: boolean;
  isGameFinished: () => boolean;
  advanceGame: () => void;
}

export default function DisplayResultsGamePhase({ gameId, roundId, isHost, isGameFinished, advanceGame }: DisplayResultsGamePhaseProps) {
  const markGuessesForRound = useMutation(api.game.markGuessesForRound);
  const leaveGameFn = useMutation(api.game.leaveGame);
  const results = useQuery(api.game.getGuessesForRound, { roundId: roundId }) ?? [];
  const correctAnswer = useQuery(api.game.getCorrectAnswer, { roundId: roundId });

  const { replace } = useRouter();

  const [isAdvancingGame, setIsAdvancingGame] = useState<boolean>(false);
  const [isLeavingInProgress, setIsLeavingInProgress] = useState<boolean>(false);

  const performGuessMarking = useCallback(async () => {
    await markGuessesForRound({ roundId: roundId });
  }, [markGuessesForRound, roundId]);

  const leaveGame = useCallback(async () => {
    try {
      setIsLeavingInProgress(true);

      await leaveGameFn({ gameId });
      replace('/game')
    } catch {
      toast('Failed to leave game.')
    } finally {
      setIsLeavingInProgress(false);
    }
  }, [])

  useEffect(() => {
    if (isHost) {
      performGuessMarking();
    }
  }, [isHost, performGuessMarking])

  return (
    <div className={"flex flex-col gap-4"}>
      {correctAnswer && (
        <div className={"rounded-lg px-2 py-1 border border-muted-foreground/50 font-semibold bg-green-200/25 dark:bg-green-800/25"}>
          {correctAnswer}
        </div>
      )}
      {results?.map((r) => (
        <Card key={r._id} className={"p-4 items-center grid grid-cols-[1fr_auto] gap-2"}>
          <CardHeader>
            <CardTitle>{r.playerDisplayName}</CardTitle>
            <CardDescription>{r.guessedScenarioDescription}</CardDescription>
          </CardHeader>
            {r.isCorrect ? <Check className={"text-green-500"} /> : <X className={"text-red-500"} />}
        </Card>
      ))}
      {!isGameFinished() && !isHost && (
        <LoadingButton className={"bg-red-200 text-black hover:text-white"} variant={"destructive"} loading={isLeavingInProgress} disabled={isLeavingInProgress} onClick={() => { leaveGame() }}>
          {!isLeavingInProgress && (
            <>
              Leave Game
              <LogOut />
            </>
          )}
        </LoadingButton>
      )}
      {isGameFinished() && (
        <Button onClick={() => { replace('/game') }}>
          Finish Game
          <FaFlagCheckered />
        </Button>
      )}
      {isHost && results.length && !isGameFinished() && (
        <LoadingButton loading={isAdvancingGame} disabled={isAdvancingGame} onClick={() => { setIsAdvancingGame(true); advanceGame() }}>
          {!isAdvancingGame && (
            <>
              Next Round
              <ArrowRight />
            </>
          )}
        </LoadingButton>
      )}
    </div>
  )
}
