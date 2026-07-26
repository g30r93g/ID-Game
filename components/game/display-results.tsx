"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCallback, useEffect, useState } from "react";
import { Id } from "@/convex/_generated/dataModel";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FaFlagCheckered } from "react-icons/fa6";
import { LoadingButton } from "@/components/ui/loading-button";
import Link from "next/link";
import GuessTally, { GuessTallyRow } from "@/components/game/guess-tally";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DisplayResultsGamePhaseProps {
  joinCode: string;
  roundId: Id<"gameRounds">;
  isHost: boolean;
  /** Undefined until the host player query resolves; falls back to "the host". */
  hostDisplayName?: string;
  isGameFinished: () => boolean;
  advanceGame: () => void;
}

export default function DisplayResultsGamePhase({
  joinCode,
  roundId,
  isHost,
  hostDisplayName,
  isGameFinished,
  advanceGame,
}: DisplayResultsGamePhaseProps) {
  const markGuessesForRound = useMutation(api.game.markGuessesForRound);
  const results =
    useQuery(api.game.getGuessesForRound, { roundId: roundId }) ?? [];
  const correctAnswer = useQuery(api.game.getCorrectAnswer, {
    roundId: roundId,
  });

  const [isAdvancingGame, setIsAdvancingGame] = useState<boolean>(false);

  const performGuessMarking = useCallback(async () => {
    await markGuessesForRound({ roundId: roundId });
  }, [markGuessesForRound, roundId]);

  useEffect(() => {
    if (isHost) {
      performGuessMarking();
    }
  }, [isHost, performGuessMarking]);

  // Folded out of the per-player results rather than fetched separately:
  // `getGuessesForRound` already hands every caller at this phase the full
  // breakdown, so a second query would only restate it. Scenarios nobody picked
  // are absent by construction — during guessing the tally keeps them so rows
  // never shift as votes land, but nothing moves here and an empty bar says
  // little at the reveal.
  const tallyRows: GuessTallyRow[] = [];
  for (const result of results) {
    const existing = tallyRows.find(
      (row) => row.scenarioId === result.scenarioId,
    );
    if (existing) {
      existing.count += 1;
    } else {
      tallyRows.push({
        scenarioId: result.scenarioId,
        description: result.guessedScenarioDescription,
        count: 1,
        correct: result.isCorrect === true,
      });
    }
  }

  const playerBreakdown = (
    <ScrollArea className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
      <div className={"flex flex-col gap-2"}>
        {results?.map((r) => (
          <Card
            key={r._id}
            className={"p-4 items-center grid grid-cols-[1fr_auto] gap-2"}
          >
            <CardHeader>
              <CardTitle>{r.playerDisplayName}</CardTitle>
              <CardDescription>{r.guessedScenarioDescription}</CardDescription>
            </CardHeader>
            {r.isCorrect ? (
              <Check className={"text-green-500"} />
            ) : (
              <X className={"text-red-500"} />
            )}
          </Card>
        ))}
      </div>
    </ScrollArea>
  );

  return (
    <div className={"flex flex-col gap-4"}>
      {correctAnswer && (
        <div
          className={
            "rounded-lg p-2 px-4 border border-muted-foreground/50 font-semibold bg-green-200/25 dark:bg-green-800/25"
          }
        >
          {correctAnswer}
        </div>
      )}
      {/* Same split as the guessing phase: who voted what, and how the votes
          stacked up. Nobody has guessed on a round with no results yet, so
          there is nothing to tab between. */}
      {results.length > 0 ? (
        <Tabs defaultValue="players" className="gap-3">
          <TabsList className="w-full">
            <TabsTrigger value="players">Players</TabsTrigger>
            <TabsTrigger value="tally">Guesses</TabsTrigger>
          </TabsList>
          <TabsContent value="players">{playerBreakdown}</TabsContent>
          <TabsContent value="tally">
            <GuessTally rows={tallyRows} heading="How the room guessed" />
          </TabsContent>
        </Tabs>
      ) : (
        playerBreakdown
      )}
      {isGameFinished() && (
        <Link href={`/game/${joinCode}/rate`} replace={true}>
          <Button className={"w-full"}>
            Finish Game
            <FaFlagCheckered />
          </Button>
        </Link>
      )}
      {isHost && results.length && !isGameFinished() && (
        <LoadingButton
          loading={isAdvancingGame}
          disabled={isAdvancingGame}
          onClick={() => {
            setIsAdvancingGame(true);
            advanceGame();
          }}
        >
          {!isAdvancingGame && (
            <>
              Next Round
              <ArrowRight />
            </>
          )}
        </LoadingButton>
      )}
      {!isGameFinished() && !isHost && (
        <span className={"inline-flex gap-2 items-center justify-center"}>
          <Loader2 className={"animate-spin"} />
          Waiting for {hostDisplayName ?? "the host"} to complete round
        </span>
      )}
    </div>
  );
}
