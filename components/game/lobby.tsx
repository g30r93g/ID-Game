"use client";

import {Card, CardHeader, CardTitle} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {ArrowRight, Share} from "lucide-react";
import {InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot} from "@/components/ui/input-otp";
import { toast } from "sonner";
import {useCallback} from "react";

interface LobbyGamePhaseProps {
  joinCode: string;
  players: string[];
  isHost: boolean;
  advanceGame: () => void;
}

export default function LobbyGamePhase({ joinCode, players, isHost, advanceGame }: LobbyGamePhaseProps) {
  const copyUrl = useCallback(async () => {
    const url = `${window.location.origin}/game?joinCode=${joinCode}`;

    try {
      await navigator.clipboard.writeText(url);
      toast("Join URL copied to clipboard", { description: `Use join code: ${joinCode}` });
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
        <h2 className={"mb-2 font-semibold text-sm"}>Players</h2>
        <div className={"flex flex-col gap-4"}>
          <div className={"grid grid-cols-1 lg:grid-cols-2 gap-4"}>
            {players.map((player) => (
              <Card key={player}>
                <CardHeader>
                  <CardTitle>{player}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
          {isHost && (
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