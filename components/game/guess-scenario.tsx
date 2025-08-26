import { Button } from "@/components/ui/button";
import { AlignJustify, ArrowUpDown, Check } from "lucide-react";
import { useState } from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoadingButton } from "@/components/ui/loading-button";
import AwaitGuessesGamePhase from "@/components/game/await-guesses";

interface GuessScenarioGamePhaseProps {
  gameId: Id<"games">;
  roundId: Id<"gameRounds">;
}

export default function GuessScenarioGamePhase({
                                                 gameId,
                                                 roundId,
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

  const toggleView = () => {
    setView((prev) => (prev === "scenarios" ? "rankings" : "scenarios"));
  };

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

  return (
    <div className="flex flex-col h-svh">
      {/* Scrollable list area */}
      <div className="grow overflow-y-auto flex flex-col gap-2 [-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden">
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

        {view === "rankings" && (
          <>
            <span className="pl-3 text-muted-foreground text-sm">Most likely</span>
            {playerRankings?.map((ranking) => (
              <Card key={ranking._id} className="p-4">
                <CardTitle>{ranking.playerDisplayName}</CardTitle>
              </Card>
            ))}
            <span className="pl-3 text-muted-foreground text-sm">Least likely</span>
          </>
        )}
      </div>

      {/* Sticky bottom button group */}
      <div className="sticky bottom-0 z-10 bg-card flex flex-col sm:flex-row gap-2 pt-4">
        <Button className="w-full" variant="outline" onClick={toggleView}>
          {view === "scenarios" ? (
            <>
              <ArrowUpDown />
              View Rankings
            </>
          ) : (
            <>
              <AlignJustify />
              View Scenarios
            </>
          )}
        </Button>
        <LoadingButton
          className="w-full"
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
      </div>
    </div>
  );
}