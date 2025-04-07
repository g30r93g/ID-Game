import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { CircleHelp } from "lucide-react";
import {Button} from "@/components/ui/button";
import {Card, CardDescription, CardHeader, CardTitle} from "@/components/ui/card";
import {ScrollArea} from "@/components/ui/scroll-area";

export default function GameInstructions() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={"secondary"}>
          <CircleHelp />
          How To Play
        </Button>
      </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How to play</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-96 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] p-3">
            <div className={"px-6 pb-3"}>
              <ol className={"list-decimal space-y-1.5"}>
                <li>Share the join code and wait for your friends to join.</li>
                <li>A host is selected for each round you play.</li>
                <li>The host selects a scenario category.</li>
                <li>The game then generates 10 scenarios. The host picks one to secretly judge everyone on.</li>
                <li>The host ranks the players from most to least likely to match the chosen scenario.</li>
                <li>Once the host submits their ranking, everyone else guesses which scenario they think the host picked based on their knowledge of the group.</li>
                <Card>
                  <CardHeader>
                    <CardTitle>Tip</CardTitle>
                    <CardDescription>Add a forfeit for everyone that guesses incorrectly!</CardDescription>
                  </CardHeader>
                </Card>
                <li>The correct scenario is revealed along with the host’s ranking and each player’s guess.</li>
                <li>The game continues, with a new host each round.</li>
              </ol>
            </div>
          </ScrollArea>
          <DialogFooter className="justify-end">
            <DialogClose asChild>
              <Button type="button" className={"w-full"}>
                Okay
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
    </Dialog>
  )
}