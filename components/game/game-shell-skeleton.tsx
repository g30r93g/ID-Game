import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Placeholder for the game shell: the header row of buttons, then a filling
 * card. It mirrors the real layout in `Game` so swapping either way doesn't
 * jump.
 *
 * Rendered by the route's `loading.tsx` while the server resolves the page, and
 * by `Game` itself until it knows whether the viewer is the host. Rendering the
 * real shell before then showed the wrong controls for a frame, and a blank
 * card where the phase had no content yet.
 */
export default function GameShellSkeleton() {
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
