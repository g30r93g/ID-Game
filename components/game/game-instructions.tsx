"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, CircleHelp } from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";

// The slide body carries motion; the trigger is on screen for the whole game,
// so it is loaded on demand. The container below holds the dialog's height, so
// the moment before it arrives is an empty box, not a jump.
const loadSlide = () => import("@/components/game/game-instructions-slide");
const GameInstructionsSlide = dynamic(
  () => import("@/components/game/game-instructions-slide"),
);

export type Slide = {
  title: string;
  body: string;
  tip?: { title: string; body: string };
};

// One idea per slide. The tip used to be a <Card> sitting directly inside the
// <ol>, which is invalid markup — it now rides along with the step it applies
// to rather than interrupting the sequence as a slide of its own.
const SLIDES: Slide[] = [
  {
    title: "Share the code",
    body: "Share the join code and wait for your friends to join.",
  },
  {
    title: "A host each round",
    body: "One player hosts each round, and the role moves on afterwards.",
  },
  {
    title: "Pick a category",
    body: "The host chooses the category the round's scenarios come from.",
  },
  {
    title: "Pick a scenario",
    body: "The game generates 10 scenarios. The host picks one to secretly judge everyone on.",
  },
  {
    title: "Rank everyone",
    body: "The host ranks the players from most to least likely to match the chosen scenario.",
  },
  {
    title: "Everyone guesses",
    body: "Once the ranking is in, everyone else guesses which scenario the host picked, going on what they know about the group.",
    tip: {
      title: "Raise the stakes",
      body: "Add a forfeit for everyone that guesses incorrectly!",
    },
  },
  {
    title: "The reveal",
    body: "The correct scenario is revealed along with the host's ranking and each player's guess.",
  },
  {
    title: "Play on",
    body: "The game continues, with a new host each round.",
  },
];

export default function GameInstructions() {
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  // +1 forward, -1 back — drives which side the slide enters and leaves from.
  const [direction, setDirection] = React.useState(1);

  const isFirst = index === 0;
  const isLast = index === SLIDES.length - 1;

  const go = React.useCallback((delta: number) => {
    setDirection(delta);
    setIndex((current) =>
      Math.min(SLIDES.length - 1, Math.max(0, current + delta)),
    );
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    // Always reopen at the beginning rather than wherever they left off.
    if (next) {
      setIndex(0);
      setDirection(1);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={"secondary"}
          // Fetch the slides on the way to a tap, so they're usually there by
          // the time the dialog opens.
          onPointerEnter={() => void loadSlide()}
          onPointerDown={() => void loadSlide()}
          onFocus={() => void loadSlide()}
        >
          <CircleHelp />
          How To Play
        </Button>
      </DialogTrigger>
      <DialogContent
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !isLast) go(1);
          if (event.key === "ArrowLeft" && !isFirst) go(-1);
        }}
      >
        <DialogHeader>
          <DialogTitle>How to play</DialogTitle>
        </DialogHeader>

        {/* Sized to the tallest slide — the one carrying the tip — so the
            dialog holds its height as slides swap in. */}
        <div className="min-h-56">
          <GameInstructionsSlide
            slide={SLIDES[index]}
            index={index}
            total={SLIDES.length}
            direction={direction}
          />
        </div>

        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {SLIDES.map((_, dot) => (
            <span
              key={dot}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                dot === index ? "bg-foreground" : "bg-muted-foreground/30",
              )}
            />
          ))}
        </div>

        <DialogFooter className="gap-2 sm:justify-between grid grid-cols-2">
          <Button
            type="button"
            variant="outline"
            disabled={isFirst}
            onClick={() => go(-1)}
          >
            <ArrowLeft />
            Back
          </Button>
          <Button
            type="button"
            onClick={() => (isLast ? setOpen(false) : go(1))}
          >
            {isLast ? (
              "Got it"
            ) : (
              <>
                Next
                <ArrowRight />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
