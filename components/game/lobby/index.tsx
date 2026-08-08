"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Share } from "lucide-react";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { toast } from "sonner";
import { useCallback } from "react";
import PlayerCard from "@/components/game/lobby/player-card";

interface LobbyGamePhaseProps {
  joinCode: string;
  players: {
    id: string;
    name: string;
    userId: string;
    lastAlive: number;
    active?: boolean;
  }[];
  isHost: boolean;
  advanceGame: () => void;
}

export default function LobbyGamePhase({
  joinCode,
  players,
  isHost,
  advanceGame,
}: LobbyGamePhaseProps) {
  const shareGame = useCallback(async () => {
    const url = `${window.location.origin}/game/${joinCode}`;

    // Prefer the OS share sheet. Both of its preconditions already hold here:
    // this runs from a click handler (a user gesture) and the app is served
    // over HTTPS.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "The ID Game",
          text: `Join my game — code ${joinCode}`,
          url,
        });
        return;
      } catch (error) {
        // Dismissing the sheet rejects with AbortError. That is a choice, not a
        // failure, so it must not fall through to the clipboard path and toast
        // at someone who just changed their mind. Anything else does fall
        // through — no share target, permission denied, and so on.
        if ((error as Error)?.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast("Join URL copied to clipboard", {
        description: `Or share join code: ${joinCode}`,
      });
    } catch (err) {
      console.error("Failed to copy:", err);
      toast("Failed to copy URL", { description: url });
    }
  }, [joinCode]);

  return (
    <>
      <div className={"mb-4"}>
        <h2 className={"mb-2 font-semibold text-sm"}>Join Code</h2>
        <div className={"flex flex-row gap-4"}>
          <InputOTP maxLength={6} value={joinCode} disabled={true}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <Button
            variant={"ghost"}
            aria-label="Share this game"
            title="Share this game"
            onClick={() => {
              shareGame();
            }}
          >
            <Share />
          </Button>
        </div>
      </div>
      <div className={"mt-4"}>
        <h2
          className={
            "mb-2 font-semibold text-sm flex flex-row gap-2 items-center"
          }
        >
          Players
          <Loader2 className={"h-3 w-3 animate-spin"} />
        </h2>
        <div className={"flex flex-col gap-4"}>
          <div className={"grid grid-cols-1 lg:grid-cols-2 gap-4"}>
            {players.map(({ id, name, userId, lastAlive, active }) => {
              return (
                <PlayerCard
                  key={id}
                  playerUserId={userId}
                  playerName={name}
                  lastAlive={lastAlive}
                  active={active}
                />
              );
            })}
          </div>
          {isHost && players.length > 1 && (
            <Button
              onClick={() => {
                advanceGame();
              }}
            >
              Start Game
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
