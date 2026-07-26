"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingButton } from "@/components/ui/loading-button";
import { usePostHog } from "posthog-js/react";

interface PickScenarioGamePhaseProps {
  gameRound: Id<"gameRounds">;
  advanceGame: () => void;
  /** Rewind to category selection. Only offered before a scenario is chosen. */
  goBack: () => void;
}

export default function PickScenarioGamePhase({
  gameRound,
  advanceGame,
  goBack,
}: PickScenarioGamePhaseProps) {
  const roundScenarios = useQuery(api.game.gameRoundScenarios, { gameRound });
  const performRoundScenarioSelection = useMutation(
    api.game.selectGameRoundScenario,
  );

  const posthog = usePostHog();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedScenario, setSelectedScenario] = useState<
    Id<"gameRoundScenarios"> | undefined
  >(undefined);

  useEffect(() => {
    if (!selectedScenario) return;
    if (!posthog) return;

    posthog.capture("game_scenario_select", { scenario: selectedScenario });
  }, [selectedScenario, posthog]);

  async function handleScenarioSelection() {
    try {
      setIsLoading(true);

      if (!selectedScenario) {
        throw new Error("No selected scenario selected");
      }

      await performRoundScenarioSelection({
        gameRoundId: gameRound,
        gameRoundScenarioId: selectedScenario,
      });

      advanceGame();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={"flex flex-col gap-8"}>
      <ScrollArea className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className={"grid grid-cols-1 gap-2"}>
          {roundScenarios?.map((roundScenario) => {
            // early return if no scenario was mapped
            if (!roundScenario.scenarioDetails) return;

            return (
              <Button
                key={roundScenario._id}
                variant={
                  selectedScenario === roundScenario._id ? "default" : "outline"
                }
                className={"py-2 whitespace-normal h-fit"}
                onClick={() => {
                  setSelectedScenario(roundScenario._id);
                }}
              >
                {roundScenario.scenarioDetails?.description}
              </Button>
            );
          })}
        </div>
      </ScrollArea>
      <div className={"flex flex-col gap-2"}>
        <LoadingButton
          loading={isLoading}
          disabled={!selectedScenario || isLoading}
          onClick={() => {
            handleScenarioSelection();
          }}
        >
          {!isLoading && (
            <>
              Pick Scenario
              <ArrowRight />
            </>
          )}
        </LoadingButton>
        <Button
          variant={"ghost"}
          disabled={isLoading}
          onClick={() => {
            goBack();
          }}
        >
          <ArrowLeft />
          Change category
        </Button>
      </div>
    </div>
  );
}
