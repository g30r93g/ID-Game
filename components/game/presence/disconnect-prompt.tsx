"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { PRESENCE_TIMEOUT_MS } from "@/lib/presence";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Shows a recovery prompt for each player who has gone stale. Any connected
// player can Agree; the backend resolves once a majority agree (and the target
// is still stale). Manual "flag" is implicit here — the prompt appears as soon
// as a player crosses the staleness threshold client-side, and pressing Agree
// pre-collects votes even if the 45s server threshold was only just reached.
export default function DisconnectPrompt({
  joinCode,
  players,
  hostPlayerId,
  viewerPlayerId,
}: {
  joinCode: string;
  players: Doc<"players">[];
  hostPlayerId: string | undefined;
  viewerPlayerId: string | undefined;
}) {
  const castPresenceVote = useMutation(api.game.castPresenceVote);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const stale = players.filter(
    (p) =>
      p._id !== viewerPlayerId &&
      p.active !== false &&
      now - p.lastAlive >= PRESENCE_TIMEOUT_MS,
  );

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
  player: Doc<"players">;
  isHost: boolean;
  onAgree: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
      <span>
        <strong>{player.displayName}</strong> seems disconnected.{" "}
        {isHost ? "Reassign the host?" : "Skip them so the round can continue?"}
      </span>
      <Button size="sm" variant="secondary" onClick={onAgree}>
        Agree
      </Button>
    </div>
  );
}
