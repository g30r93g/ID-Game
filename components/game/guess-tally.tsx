"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";

export interface GuessTallyRow {
  scenarioId: string;
  description: string;
  count: number;
  /**
   * Marks the row as the round's answer. Only ever set after the reveal — during
   * guessing the tally goes to players who have already committed, and flagging
   * the answer there would hand it to them early.
   */
  correct?: boolean;
}

/**
 * Per-scenario guess counts, live during guessing and as a breakdown at results.
 *
 * During guessing this is only rendered when the server chose to send a tally at
 * all — it withholds one from anyone still to guess, so this component never has
 * to reason about who is allowed to see what.
 *
 * Rows are ordered by count, most-guessed first, so the leaders stay at the top
 * of the scroll where they can be seen without scrolling. Reordering is animated
 * with a shared layout so rows slide past each other rather than teleporting.
 */
export default function GuessTally({
  rows,
  heading = "Guesses so far",
}: {
  rows: GuessTallyRow[];
  heading?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (rows.length === 0) return null;

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  // `rows` arrives in draw order and `sort` is stable, so scenarios level on
  // count keep the order the guessers were shown rather than swapping about.
  const ranked = [...rows].sort((a, b) => b.count - a.count);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        {heading}
        <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
          {total}
        </span>
      </h3>
      <ScrollArea className="max-h-72 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
        <div className="flex flex-col gap-2 pr-1">
          {ranked.map((row) => {
            const share = total > 0 ? row.count / total : 0;
            return (
              <motion.div
                key={row.scenarioId}
                layout={reduceMotion ? false : "position"}
                transition={{
                  duration: reduceMotion ? 0 : 0.3,
                  ease: "easeOut",
                }}
                className="flex flex-col gap-1"
              >
                <div className="flex items-start justify-between gap-3 text-sm">
                  <span
                    className={cn("min-w-0", {
                      "font-semibold text-green-600 dark:text-green-500":
                        row.correct,
                    })}
                  >
                    {row.description}
                  </span>
                  <motion.span
                    // Remounting on each change gives the number a small pop as
                    // votes land.
                    key={row.count}
                    initial={{ scale: reduceMotion ? 1 : 1.35 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: reduceMotion ? 0 : 0.2 }}
                    className="shrink-0 font-semibold tabular-nums"
                  >
                    {row.count}
                  </motion.span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      row.correct ? "bg-green-500" : "bg-primary",
                    )}
                    initial={false}
                    animate={{ width: `${share * 100}%` }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.3,
                      ease: "easeOut",
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
