"use client";

import { motion, useReducedMotion } from "motion/react";

export interface GuessTallyRow {
  scenarioId: string;
  description: string;
  count: number;
}

/**
 * Live per-scenario guess counts. Only rendered when the server chose to send a
 * tally at all — it withholds one from anyone still to guess, so this component
 * never has to reason about who is allowed to see what.
 *
 * Rows arrive in draw order and are rendered in that order: the bars move, the
 * rows don't, which is far easier to follow than a list resorting itself on
 * every vote.
 */
export default function GuessTally({ rows }: { rows: GuessTallyRow[] }) {
  const reduceMotion = useReducedMotion();

  if (rows.length === 0) return null;

  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <div className="mb-4 flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        Guesses so far
        <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
          {total}
        </span>
      </h3>
      {rows.map((row) => {
        const share = total > 0 ? row.count / total : 0;
        return (
          <div key={row.scenarioId} className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">{row.description}</span>
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
                className="h-full rounded-full bg-primary"
                initial={false}
                animate={{ width: `${share * 100}%` }}
                transition={{
                  duration: reduceMotion ? 0 : 0.3,
                  ease: "easeOut",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
