"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The tally animates with motion, which nothing else on the game screen needs
// until a round reaches guessing, so it is split out of the page chunk. The
// game warms it a phase ahead (see `preloadGuessTally`), so the skeleton only
// shows on a cold load straight into guessing or the reveal.
const GuessTally = dynamic(() => import("@/components/game/guess-tally"), {
  loading: () => <Skeleton className={"h-40 w-full"} />,
});

export function preloadGuessTally() {
  void import("@/components/game/guess-tally");
}

export default GuessTally;
