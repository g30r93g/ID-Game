import {Button} from "@/components/ui/button";
import {AlignJustify, ArrowUpDown, Check} from "lucide-react";
import {useState} from "react";
import {Card, CardTitle} from "@/components/ui/card";
import {Id} from "@/convex/_generated/dataModel";
import {useMutation, useQuery} from "convex/react";
import {api} from "@/convex/_generated/api";
import {LoadingButton} from "@/components/ui/loading-button";
import AwaitGuessesGamePhase from "@/components/game/await-guesses";

interface GuessScenarioGamePhaseProps {
  gameId: Id<'games'>;
  roundId: Id<'gameRounds'>;
}

export default function GuessScenarioGamePhase({ gameId, roundId }: GuessScenarioGamePhaseProps) {
  const playerRankings = useQuery(api.game.getPlayerRankingsForRound, { roundId })
  const scenarios = useQuery(api.game.gameRoundScenarios, { gameRound: roundId })
  const makeGuess = useMutation(api.game.makeGuessForRound)

  const [view, setView] = useState<"scenarios" | "rankings">("rankings");
  const [selectedScenario, setSelectedScenario] = useState<Id<'gameRoundScenarios'> | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasGuessed, setHasGuessed] = useState<boolean>(false);

  if (hasGuessed) {
    return <AwaitGuessesGamePhase gameRoundId={roundId} isHost={false}  />;
  }

  const toggleView = () => {
    if (view === "scenarios") {
      setView("rankings");
    } else if (view === "rankings") {
      setView("scenarios");
    }
  }

  async function performGuess() {
    if (!selectedScenario) {
      console.error("Scenario is not selected")
      return;
    }

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
    <div className={"flex flex-col gap-8"}>
      <Button className={"w-full"} variant={"ghost"} onClick={() => { toggleView() }}>
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
      {view === "scenarios" && (
        <div className={"grid grid-cols-1 gap-2"}>
          {scenarios?.map((scenario) => (
            <Button
              key={scenario._id}
              variant={selectedScenario === scenario._id ? "default" : "outline"}
              className={"py-4"}
              onClick={() => { setSelectedScenario(scenario._id) }}
            >
              {scenario.scenarioDetails?.description}
            </Button>
          ))}
        </div>
      )}
      {view === "rankings" && (
        <div className={"grid grid-cols-1 gap-2"}>
          {playerRankings?.map((ranking) => (
            <Card
              key={ranking._id}
              className={"p-4"}
            >
              <CardTitle>{ranking.playerDisplayName}</CardTitle>
            </Card>
          ))}
        </div>
      )}
      <LoadingButton
        disabled={!selectedScenario}
        loading={isLoading}
        onClick={() => { performGuess() }}
      >
        {!isLoading && (
          <>
            Submit Guess
            <Check />
          </>
        )}
      </LoadingButton>
    </div>
  )
}
