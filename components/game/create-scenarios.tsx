"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoadingButton } from "@/components/ui/loading-button";
import { Id } from "@/convex/_generated/dataModel";
import { usePostHog } from "posthog-js/react";

interface CreateScenarioGamePhaseProps {
  gameId: Id<"games">;
  gameRoundId: Id<"gameRounds">;
  advanceGame: () => void;
}

export default function CreateScenariosGamePhase({
  gameId,
  gameRoundId,
  advanceGame,
}: CreateScenarioGamePhaseProps) {
  const scenarioCategories = useQuery(api.game.scenarioCategories);
  const roundScenarios = useQuery(api.game.gameRoundScenarios, {
    gameRound: gameRoundId,
  });
  const generateScenarios = useMutation(api.game.selectScenariosForGameRound);

  const posthog = usePostHog();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    undefined,
  );

  // A host arriving here from "Change category" already has a draw. Show which
  // category it came from instead of resetting to nothing. Seeded exactly once
  // (guarded, set during render — the same pattern as rank-players) so it never
  // overrides the host's own subsequent choice.
  const [seededFromDraw, setSeededFromDraw] = useState<boolean>(false);
  if (!seededFromDraw && roundScenarios !== undefined) {
    setSeededFromDraw(true);
    const drawnCategory = roundScenarios.find((roundScenario) =>
      roundScenario.scenarioDetails,
    )?.scenarioDetails?.category;
    if (drawnCategory) setSelectedCategory(drawnCategory);
  }

  async function handleCategorySelection() {
    if (!selectedCategory) return;

    setIsLoading(true);
    try {
      // capture analytics event
      if (posthog) {
        posthog.capture("game_scenario_category_select", {
          scenario: selectedCategory,
        });
      }

      // perform and await mutation
      await generateScenarios({
        game: gameId,
        gameRound: gameRoundId,
        category: selectedCategory,
      });

      // advance
      advanceGame();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={"flex flex-col gap-8"}>
      <div className={"grid grid-cols-1 lg:grid-cols-2 gap-2"}>
        {scenarioCategories?.map((category) => {
          return (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              className={"py-4"}
              onClick={() => {
                setSelectedCategory(category);
              }}
            >
              {category}
            </Button>
          );
        })}
      </div>
      <LoadingButton
        loading={isLoading}
        disabled={!selectedCategory || isLoading}
        onClick={() => {
          handleCategorySelection();
        }}
      >
        {!isLoading && (
          <>
            Pick Category
            <ArrowRight />
          </>
        )}
      </LoadingButton>
    </div>
  );
}
