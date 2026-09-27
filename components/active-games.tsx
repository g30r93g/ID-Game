"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link, { useLinkStatus } from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ActiveGames() {
  const games = useQuery(api.game.getMyActiveGames) ?? [];

  if (games.length === 0) return null;

  return (
    <Card className="mt-4 w-full gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Jump back in</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4">
        {/*
          Real links rather than buttons calling `replace`: the router prefetches
          each game as its row enters the viewport (once per join code, not on
          every heartbeat re-render), and each row can show its own pending
          navigation. The default prefetch stops at the game page's loading
          boundary, so the page's server work still only runs on the tap.
        */}
        {games.map((game) => (
          <Button
            key={game.gameId}
            asChild
            variant="secondary"
            className="h-auto w-full justify-between gap-3 px-4 py-3 text-left"
          >
            <Link href={`/game/${game.joinCode}`} replace>
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
              <PendingArrow />
            </Link>
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * The row's trailing icon, swapped for a spinner while its link is navigating.
 * `useLinkStatus` only reads the nearest parent `<Link>`, so it has to live in
 * a child of the link rather than in the list above.
 */
function PendingArrow() {
  const { pending } = useLinkStatus();

  return pending ? (
    <Loader2 className="shrink-0 animate-spin" aria-label="Opening game" />
  ) : (
    <ArrowRight className="shrink-0" />
  );
}
