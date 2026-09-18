import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the game page resolves its data on the server.
 *
 * Without a loading boundary the App Router has nothing to swap to, so it holds
 * the previous page on screen until the whole payload lands — which is what made
 * "Create New Game" look like it had hung. The layout below mirrors the real
 * game shell (header row, then a filling card) so the swap doesn't jump.
 */
export default function GameLoading() {
  return (
    <div
      className={"flex flex-col w-full md:w-[75%] h-full max-h-svh gap-4 py-4"}
    >
      <div className={"shrink-0 w-full flex flex-row gap-2"}>
        <Skeleton className={"h-9 w-32"} />
        <Skeleton className={"h-9 w-28"} />
      </div>
      <Card className={"grow flex flex-col overflow-y-hidden"}>
        <CardHeader className={"shrink-0"}>
          <CardTitle>
            <Skeleton className={"h-6 w-40"} />
          </CardTitle>
          <CardDescription>
            <Skeleton className={"h-4 w-56"} />
          </CardDescription>
        </CardHeader>
        <CardContent className={"grow overflow-y-auto min-h-0"}>
          <div className={"flex flex-col gap-3"}>
            <Skeleton className={"h-12 w-full"} />
            <Skeleton className={"h-12 w-full"} />
            <Skeleton className={"h-12 w-full"} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
