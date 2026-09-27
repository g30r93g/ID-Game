"use client";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users } from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { isConnected } from "@/lib/presence";
import { useNow } from "@/lib/use-now";
import { RosterPlayer, usePresence } from "@/lib/use-presence";
import { cn } from "@/lib/utils";

// A modal listing every player with their live connection status. Connection is
// derived from the shared `isConnected` helper and re-evaluated on the shared
// 5s clock so the dot + label update even when no Convex write happens.
export default function PlayersDialog({
  gameId,
  players,
  hostPlayerId,
  viewerPlayerId,
}: {
  gameId: Id<"games">;
  players: RosterPlayer[];
  hostPlayerId?: string;
  viewerPlayerId?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={"secondary"}>
          <Users />
          Players
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Players</DialogTitle>
        </DialogHeader>
        {/* Mounted only while the dialog is open, so a closed dialog neither
            ticks nor re-renders on heartbeats. */}
        <PlayerList
          gameId={gameId}
          players={players}
          hostPlayerId={hostPlayerId}
          viewerPlayerId={viewerPlayerId}
        />
        <DialogFooter className="justify-end">
          <DialogClose asChild>
            <Button type="button" className={"w-full"}>
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlayerList({
  gameId,
  players,
  hostPlayerId,
  viewerPlayerId,
}: {
  gameId: Id<"games">;
  players: RosterPlayer[];
  hostPlayerId?: string;
  viewerPlayerId?: string;
}) {
  const presence = usePresence(gameId);
  const now = useNow(5000);

  return (
    <ScrollArea className="max-h-96 overflow-y-auto p-1">
      <div className={"flex flex-col gap-2"}>
        {players.map((player) => {
          const lastAlive = presence?.get(player._id);
          const connected =
            player.active !== false &&
            lastAlive !== undefined &&
            isConnected(lastAlive, now);
          return (
            <div
              key={player._id}
              className={
                "flex flex-row items-center gap-2 rounded-md border p-3"
              }
            >
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block h-2 w-2 shrink-0 rounded-full",
                  connected ? "bg-green-500" : "bg-muted-foreground/40",
                )}
              />
              <span className={"font-medium"}>{player.displayName}</span>
              {player._id === hostPlayerId && (
                <span
                  className={
                    "rounded bg-secondary px-1.5 py-0.5 text-xs font-semibold text-secondary-foreground"
                  }
                >
                  Host
                </span>
              )}
              {player._id === viewerPlayerId && (
                <span className={"text-xs text-muted-foreground"}>You</span>
              )}
              {/* No label until presence has loaded, rather than a flash of
                  everyone "Offline". */}
              {presence && (
                <span
                  className={cn(
                    "ml-auto text-xs",
                    connected
                      ? "text-green-600 dark:text-green-500"
                      : "text-muted-foreground",
                  )}
                >
                  {connected ? "Online" : "Offline"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
