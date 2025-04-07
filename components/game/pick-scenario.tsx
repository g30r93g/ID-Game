"use client";

import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {ArrowRight} from "lucide-react";
import {Id} from "@/convex/_generated/dataModel";
import {useMutation, useQuery} from "convex/react";
import {api} from "@/convex/_generated/api";
import {ScrollArea} from "@/components/ui/scroll-area";
import {usePostHog} from "posthog-js/react";

interface PickScenarioGamePhaseProps {
  gameRound: Id<"gameRounds">;
  advanceGame: () => void;
}

export default function PickScenarioGamePhase({ gameRound, advanceGame }: PickScenarioGamePhaseProps) {
  const roundScenarios = useQuery(api.game.gameRoundScenarios, { gameRound })
  const performRoundScenarioSelection = useMutation(api.game.selectGameRoundScenario)

  const { capture } = usePostHog();
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [selectedScenario, setSelectedScenario] = useState<Id<"gameRoundScenarios"> | undefined>(undefined);

  useEffect(() => {
    if (!selectedScenario) return;
    
    capture('game_scenario_select', { scenario: selectedScenario });
  }, [selectedScenario]);

  async function handleScenarioSelection() {
    try {
      setIsLoading(true);

      if (!selectedScenario) {
        throw new Error("No selected scenario selected");
      }

      await performRoundScenarioSelection({ gameRoundId: gameRound, gameRoundScenarioId: selectedScenario });

      advanceGame()
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
                variant={selectedScenario === roundScenario._id ? "default" : "outline"}
                className={"py-2 whitespace-normal h-fit"}
                onClick={() => { setSelectedScenario(roundScenario._id) }}
              >
                {roundScenario.scenarioDetails?.description}
              </Button>
            )
          })}
        </div>
      </ScrollArea>
      <Button disabled={!selectedScenario} onClick={() => { handleScenarioSelection() }}>
        {!isLoading && (
          <>
            Pick Scenario
            <ArrowRight />
          </>
        )}
      </Button>
    </div>
  )
}