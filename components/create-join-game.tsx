"use client";

import {Card, CardContent, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import JoinGame from "@/components/join-game";
import {Separator} from "@/components/ui/separator";
import {Button} from "@/components/ui/button";
import {ArrowLeft, Plus} from "lucide-react";
import {useState} from "react";
import CreateGame from "@/components/create-game";

export default function CreateJoinGame({ joinCode }: { joinCode?: string }) {
  const [view, setView] = useState<"join" | "create">("join");

  if (view === "join") {
    return (
      <Card className="w-full md:w-[50%]">
        <CardHeader>
          <CardTitle>
            Join Game
          </CardTitle>
          <CardDescription>
            Enter a join code or start a new game.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <JoinGame defaultJoinCode={joinCode} />
          <Separator className={"my-3"}/>
          <Button
            className={"w-full"}
            variant={"secondary"}
            onClick={() => { setView("create") }}
          >
            Create New Game
            <Plus/>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (view === "create") {
    return (
      <div className="w-full md:w-[50%] flex flex-col gap-4">
        <Button
          variant={"outline"}
          className={"w-fit"}
          onClick={() => { setView("join")}}
        >
          <ArrowLeft />
          Join Game
        </Button>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>
              Create New Game
            </CardTitle>
            <CardDescription>
              Enter the number of rounds you&apos;d like to play.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateGame />
          </CardContent>
        </Card>
      </div>
    )
  }
}