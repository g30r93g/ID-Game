"use client";

import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardTitle } from "@/components/ui/card";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoadingButton } from "@/components/ui/loading-button";
import AwaitGuessesGamePhase from "@/components/game/await-guesses";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface GuessScenarioGamePhaseProps {
  gameId: Id<"games">;
  roundId: Id<"gameRounds">;
  /** Header element to render the "Submit Guess" button into, so it sits in line
   *  with the card header rather than at the bottom of the list. */
  submitSlot?: HTMLElement | null;
}

export default function GuessScenarioGamePhase({
                                                 gameId,
                                                 roundId,
                                                 submitSlot,
                                               }: GuessScenarioGamePhaseProps) {
  const playerRankings = useQuery(api.game.getPlayerRankingsForRound, { roundId });
  const scenarios = useQuery(api.game.gameRoundScenarios, { gameRound: roundId });
  const makeGuess = useMutation(api.game.makeGuessForRound);

  const [view, setView] = useState<"scenarios" | "rankings">("rankings");
  const [selectedScenario, setSelectedScenario] = useState<Id<"gameRoundScenarios"> | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasGuessed, setHasGuessed] = useState<boolean>(false);

  if (hasGuessed) {
    return <AwaitGuessesGamePhase gameRoundId={roundId} isHost={false} />;
  }

  async function performGuess() {
    if (!selectedScenario) return;

    try {
      setIsLoading(true);
      await makeGuess({ game: gameId, gameRound: roundId, scenario: selectedScenario });
      setHasGuessed(true);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  const submitButton = (
    <LoadingButton
      disabled={!selectedScenario}
      loading={isLoading}
      onClick={performGuess}
    >
      {!isLoading && (
        <>
          Submit Guess
          <Check />
        </>
      )}
    </LoadingButton>
  );

  return (
    <div className="flex h-svh flex-col gap-3">
      {submitSlot ? createPortal(submitButton, submitSlot) : null}

      {/* Switcher only — the list below is a single stable scroll area so
          swapping views never changes the container height (no layout shift). */}
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as "scenarios" | "rankings")}
        className="shrink-0"
      >
        <TabsList className="w-full">
          <TabsTrigger value="rankings" className="flex-1">Rankings</TabsTrigger>
          <TabsTrigger value="scenarios" className="flex-1">Scenarios</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grow min-h-0 overflow-y-auto flex flex-col gap-2 [-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden">
        {view === "rankings" && (
          <>
            <span className="pl-3 text-sm text-muted-foreground">Most likely</span>
            {playerRankings?.map((ranking) => (
              <Card key={ranking._id} className="p-4">
                <CardTitle>{ranking.playerDisplayName}</CardTitle>
              </Card>
            ))}
            <span className="pl-3 text-sm text-muted-foreground">Least likely</span>
          </>
        )}

        {view === "scenarios" &&
          scenarios?.map((scenario) => (
            <Button
              key={scenario._id}
              variant={selectedScenario === scenario._id ? "default" : "outline"}
              className="py-2 whitespace-normal h-fit"
              onClick={() => setSelectedScenario(scenario._id)}
            >
              {scenario.scenarioDetails?.description}
            </Button>
          ))}
      </div>
    </div>
  );
}
