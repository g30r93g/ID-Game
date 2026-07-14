"use client";

import { useEffect, useState } from "react";
import { PRESENCE_TIMEOUT_MS } from "@/lib/presence";
import { cn } from "@/lib/utils";

// A green dot while the player's heartbeat is fresh, grey once it goes stale or
// the player has been removed. Re-evaluates on a local 5s tick so it updates
// even when no Convex write happens.
export default function PresenceDot({
  lastAlive,
  active,
}: {
  lastAlive: number;
  active?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const connected = active !== false && now - lastAlive < PRESENCE_TIMEOUT_MS;

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
