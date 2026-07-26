"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { ArrowLeft, ArrowRight, CircleHelp, Lightbulb } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";

type Slide = {
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
  const reduceMotion = useReducedMotion();

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

  const slide = SLIDES[index];
  const offset = reduceMotion ? 0 : 24;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={"secondary"}>
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
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0, x: direction * offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -offset }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex flex-col gap-2"
            >
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {`Step ${index + 1} of ${SLIDES.length}`}
              </span>
              <h3 className="text-lg font-semibold">{slide.title}</h3>
              <p className="text-sm text-muted-foreground">{slide.body}</p>
              {slide.tip ? (
                <Alert variant="warning" className="mt-2">
                  <Lightbulb />
                  <AlertTitle>{slide.tip.title}</AlertTitle>
                  <AlertDescription>{slide.tip.body}</AlertDescription>
                </Alert>
              ) : null}
            </motion.div>
          </AnimatePresence>
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
