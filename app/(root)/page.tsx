import {Button} from "@/components/ui/button";
import {ArrowRight} from "lucide-react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className={"h-screen flex flex-col items-center justify-center gap-y-6"}>
      <h1 className={"text-2xl font-mono"}>The ID Game</h1>
      <h2 className={"text-xl"}>Call out friends, guess the answers, and survive the chaos. Are you ready?</h2>
      <div className={"flex flex-row items-center justify-center gap-x-6"}>
        <Link href={"/game"}>
          <Button
            variant={"default"}
            className={"rounded-full"}
            size={"xl"}
          >
            Play
            <ArrowRight />
          </Button>
        </Link>
      </div>
      <div className={"w-full grid grid-cols-1 gap-3 md:grid-cols-3"}>
        <Card>
          <CardHeader>
            <CardTitle>Select</CardTitle>
          </CardHeader>
          <CardContent>
            Choose a &quot;Most Likely&quot; question to kick off the round.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rank</CardTitle>
          </CardHeader>
          <CardContent>
            Rank the players based on who best fits the question.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Guess</CardTitle>
          </CardHeader>
          <CardContent>
            Everyone guesses the ranking—who knows the group best?
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
