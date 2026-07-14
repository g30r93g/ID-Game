"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import JoinGame from "@/components/join-game";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Plus } from "lucide-react";
import { useState } from "react";
import CreateGame from "@/components/create-game";
import { UserTray } from "@/components/user-tray";
import ActiveGames from "@/components/active-games";

export default function CreateJoinGame({ joinCode }: { joinCode?: string }) {
  const [view, setView] = useState<"join" | "create">("join");

  return (
    <div className="w-full md:w-[50%] flex flex-col gap-4">
      {view === "create" && (
        <Button
          variant={"outline"}
          className={"w-fit"}
          onClick={() => {
            setView("join");
          }}
        >
          <ArrowLeft />
          Join Game
        </Button>
      )}

      {/* The identity tray sits behind the card and emerges from its top edge. */}
      <div className="relative flex flex-col">
        <UserTray className="relative z-0 -mb-4 pb-6" />

        <Card className="relative z-10 w-full">
          {view === "join" ? (
            <>
              <CardHeader>
                <CardTitle>Join Game</CardTitle>
                <CardDescription>
                  Enter a join code or start a new game.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <JoinGame defaultJoinCode={joinCode} />
                <ActiveGames />
                <Separator className={"my-3"} />
                <Button
                  className={"w-full"}
                  variant={"secondary"}
                  onClick={() => {
                    setView("create");
                  }}
                >
                  Create New Game
                  <Plus />
                </Button>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Create New Game</CardTitle>
                <CardDescription>
                  Enter the number of rounds you&apos;d like to play.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CreateGame />
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
