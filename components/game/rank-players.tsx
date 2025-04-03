"use client";

import {useState} from "react";
import {
  Sortable,
  SortableContent,
  SortableItem,
} from "@/components/ui/sortable";
import {ArrowRight} from "lucide-react";
import {Card, CardHeader, CardTitle} from "@/components/ui/card";
import {useMutation, useQuery} from "convex/react";
import {api} from "@/convex/_generated/api";
import {Id} from "@/convex/_generated/dataModel";
import {LoadingButton} from "@/components/ui/loading-button";

interface RankPlayersGamePhaseProps {
  gameId: Id<'games'>;
  roundId: Id<'gameRounds'>;
  scenario: string;
  advanceGame: () => void;
}

export default function RankPlayersGamePhase({ gameId, roundId, scenario, advanceGame }: RankPlayersGamePhaseProps) {
  const playersForGame = useQuery(api.game.getPlayersForGame, { game: gameId });
  const mutatePlayerRankings = useMutation(api.game.submitPlayerRankingsForGameRound);

  const [loading, setLoading] = useState<boolean>(false);
  const [players, setPlayers] = useState(playersForGame ?? []);

  async function submitPlayerRankings() {
    try {
      setLoading(true);

      const rankings = players.map((p, idx) => { return { ranking: idx + 1, playerId: p._id } });
      await mutatePlayerRankings({ gameId, roundId, rankings });

      advanceGame();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={"flex flex-col gap-8"}>
      <div className={"rounded-lg p-2 px-4 border border-muted-foreground/50 font-semibold bg-secondary/75"}>
        {scenario}
      </div>
      <div className={"grid grid-cols-1 gap-2"}>
        <span className={"pl-3 text-muted-foreground text-sm"}>Most likely</span>
        <Sortable
          value={players}
          onValueChange={setPlayers}
          getItemValue={(item) => item._id}
          orientation="vertical"
        >
          <SortableContent className="grid auto-rows-fr gap-2.5">
            {players.map((player) => (
              <SortableItem key={player._id} value={player._id} asChild asHandle>
                <Card>
                  <CardHeader>
                    <CardTitle>{player.displayName}</CardTitle>
                  </CardHeader>
                </Card>
              </SortableItem>
            ))}
          </SortableContent>
        </Sortable>
        <span className={"pl-3 text-muted-foreground text-sm"}>Least likely</span>
      </div>
      <LoadingButton
        loading={loading}
        disabled={loading}
        onClick={() => { submitPlayerRankings() }}
      >
        {!loading && (
          <>
            Done
            <ArrowRight />
          </>
        )}
      </LoadingButton>
    </div>
  )
}
