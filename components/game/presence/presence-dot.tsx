"use client";

import { Id } from "@/convex/_generated/dataModel";
import { isConnected } from "@/lib/presence";
import { useNow } from "@/lib/use-now";
import { usePresence } from "@/lib/use-presence";
import { cn } from "@/lib/utils";

// A green dot while the player's heartbeat is fresh, grey once it goes stale or
// the player has been removed. Reads presence itself, so a heartbeat re-renders
// only the dot, and re-evaluates on the shared 5s clock so it goes grey even
// when no Convex write happens.
export default function PresenceDot({
  gameId,
  playerId,
  active,
}: {
  gameId: Id<"games">;
  playerId: Id<"players">;
  active?: boolean;
}) {
  const presence = usePresence(gameId);
  const now = useNow(5000);

  const lastAlive = presence?.get(playerId);
  const connected =
    active !== false && lastAlive !== undefined && isConnected(lastAlive, now);

  return (
    <span
      aria-label={connected ? "Online" : "Offline"}
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        connected ? "bg-green-500" : "bg-muted-foreground/40",
      )}
    />
  );
}
