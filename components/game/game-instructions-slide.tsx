"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Lightbulb } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Slide } from "@/components/game/game-instructions";

/**
 * The animated body of the "How to play" dialog. Split out of
 * `GameInstructions` so motion loads when the dialog opens rather than with the
 * game screen, which mounts the dialog's trigger on every visit.
 */
export default function GameInstructionsSlide({
  slide,
  index,
  total,
  direction,
}: {
  slide: Slide;
  index: number;
  total: number;
  /** +1 forward, -1 back — which side the slide enters and leaves from. */
  direction: number;
}) {
  const reduceMotion = useReducedMotion();
  const offset = reduceMotion ? 0 : 24;

  return (
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
          {`Step ${index + 1} of ${total}`}
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
  );
}
