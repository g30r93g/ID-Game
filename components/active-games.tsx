"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ActiveGames() {
  const games = useQuery(api.game.getMyActiveGames) ?? [];
  const { replace } = useRouter();

  if (games.length === 0) return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Jump back in</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {games.map((game) => (
          <Button
            key={game.gameId}
            variant="secondary"
            className="w-full justify-between"
            onClick={() => replace(`/game/${game.joinCode}`)}
          >
            <span className="font-mono">{game.joinCode}</span>
            <span className="text-xs text-muted-foreground">
              {game.isOpen
                ? "In lobby"
                : `Round ${game.currentRound} of ${game.totalRounds}`}
              {" · "}
              {game.connectedPlayerCount} online
            </span>
            <ArrowRight />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
