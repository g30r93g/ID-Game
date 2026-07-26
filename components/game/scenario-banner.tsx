import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The round's chosen scenario. Only ever rendered for someone entitled to see
 * it — the host while they rank and wait, or everyone once results are shown.
 * `gameRoundScenarios` withholds the `selected` flag from non-hosts until the
 * reveal, so a guesser's client cannot resolve the text to pass in here.
 */
export default function ScenarioBanner({
  scenario,
  className,
  contentClassName,
  contentStyle,
}: {
  scenario: string;
  className?: string;
  /**
   * Applied to the text alone. Lets a caller blur the scenario without also
   * softening the banner's border and background.
   */
  contentClassName?: string;
  /**
   * Inline styles for the text alone. `filter` is set this way rather than with
   * Tailwind's `blur-*` utilities because those compose the shorthand out of a
   * `--tw-blur` custom property, which did not apply in Safari.
   */
  contentStyle?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-2 px-4 border border-muted-foreground/50 font-semibold bg-secondary/75",
        className,
      )}
    >
      <span className={cn("block", contentClassName)} style={contentStyle}>
        {scenario}
      </span>
    </div>
  );
}
