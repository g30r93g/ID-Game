"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { isConnected } from "@/lib/presence";
import { useNow } from "@/lib/use-now";
import { RosterPlayer, usePresence } from "@/lib/use-presence";
import { LoadingButton } from "@/components/ui/loading-button";
import { toast } from "sonner";

// Shows a recovery prompt for each player who has gone stale. Any connected
// player can Agree; the backend resolves once a majority agree (and the target
// is still stale). Manual "flag" is implicit here — the prompt appears as soon
// as a player crosses the staleness threshold client-side, and pressing Agree
// pre-collects votes even if the 45s server threshold was only just reached.
export default function DisconnectPrompt({
  gameId,
  joinCode,
  players,
  hostPlayerId,
  viewerPlayerId,
}: {
  gameId: Id<"games">;
  joinCode: string;
  players: RosterPlayer[];
  hostPlayerId: string | undefined;
  viewerPlayerId: string | undefined;
}) {
  const castPresenceVote = useMutation(api.game.castPresenceVote);
  const presence = usePresence(gameId);
  const now = useNow(5000);

  // Nobody is stale until presence has loaded: an unknown heartbeat is not an
  // old one.
  const stale = players.filter((p) => {
    const lastAlive = presence?.get(p._id);
    return (
      p._id !== viewerPlayerId &&
      p.active !== false &&
      lastAlive !== undefined &&
      !isConnected(lastAlive, now)
    );
  });

  if (stale.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {stale.map((p) => (
        <StaleCard
          key={p._id}
          player={p}
          isHost={p._id === hostPlayerId}
          onAgree={async () => {
            try {
              const res = await castPresenceVote({
                joinCode,
                targetPlayerId: p._id,
              });
              if (res.resolved) {
                toast(
                  res.action === "reassign-host"
                    ? "Host reassigned"
                    : `${p.displayName} was removed`,
                );
              } else {
                toast("Vote recorded", {
                  description: "Waiting for the other players to agree.",
                });
              }
            } catch (error) {
              toast("Couldn't record your vote", {
                description: (error as Error).message,
              });
            }
          }}
        />
      ))}
    </div>
  );
}

function StaleCard({
  player,
  isHost,
  onAgree,
}: {
  player: RosterPlayer;
  isHost: boolean;
  onAgree: () => Promise<void>;
}) {
  // Held while the vote is in flight, so a double tap sends one vote and shows
  // one toast.
  const [pending, setPending] = useState(false);

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
      <span>
        <strong>{player.displayName}</strong> seems disconnected.{" "}
        {isHost ? "Reassign the host?" : "Skip them so the round can continue?"}
      </span>
      <LoadingButton
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={async () => {
          setPending(true);
          try {
            await onAgree();
          } finally {
            setPending(false);
          }
        }}
      >
        Agree
      </LoadingButton>
    </div>
  );
}
