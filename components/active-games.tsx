"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActiveGames() {
  const games = useQuery(api.game.getMyActiveGames) ?? [];
  const { replace } = useRouter();

  if (games.length === 0) return null;

  return (
    <Card className="mt-4 w-full gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Jump back in</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {games.map((game) => (
          <Button
            key={game.gameId}
            variant="secondary"
            className="h-auto w-full justify-between gap-3 px-4 py-3 text-left"
            onClick={() => replace(`/game/${game.joinCode}`)}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-base">{game.joinCode}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {game.isOpen
                  ? "In lobby"
                  : `Round ${game.currentRound} of ${game.totalRounds}`}
                {" · "}
                {game.othersOnline === 0
                  ? "Nobody here right now"
                  : `${game.othersOnline} ${
                      game.othersOnline === 1 ? "other" : "others"
                    } online`}
              </span>
            </span>
            <ArrowRight className="shrink-0" />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
