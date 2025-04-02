"use client";

import {Button} from "@/components/ui/button";
import {ArrowRight, Loader2, Share} from "lucide-react";
import {InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot} from "@/components/ui/input-otp";
import { toast } from "sonner";
import {useCallback} from "react";
import PlayerCard from "@/components/game/lobby/player-card";

interface LobbyGamePhaseProps {
  joinCode: string;
  players: { id: string, name: string, userId: string }[];
  isHost: boolean;
  advanceGame: () => void;
}

export default function LobbyGamePhase({ joinCode, players, isHost, advanceGame }: LobbyGamePhaseProps) {
  const copyUrl = useCallback(async () => {
    const url = `${window.location.origin}/game/${joinCode}`;

    try {
      await navigator.clipboard.writeText(url);
      toast("Join URL copied to clipboard", { description: `Or share join code: ${joinCode}` });
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
            onClick={() => { copyUrl(); }}
          >
            <Share />
          </Button>
        </div>
      </div>
      <div className={"mt-4"}>
        <h2 className={"mb-2 font-semibold text-sm flex flex-row gap-2 items-center"}>
          Players
          <Loader2 className={"h-3 w-3 animate-spin"} />
        </h2>
        <div className={"flex flex-col gap-4"}>
          <div className={"grid grid-cols-1 lg:grid-cols-2 gap-4"}>
            {players.map(({ id, name, userId }) => {
              return <PlayerCard key={id} playerId={id} playerUserId={userId} playerName={name}/>
            })}
          </div>
          {isHost && players.length > 1 && (
            <Button onClick={() => { advanceGame() }}>
              Start Game
              <ArrowRight />
            </Button>
          )}
        </div>
      </div>
    </>
  )
}