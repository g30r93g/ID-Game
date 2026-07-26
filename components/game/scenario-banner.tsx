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
}: {
  scenario: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-2 px-4 border border-muted-foreground/50 font-semibold bg-secondary/75",
        className,
      )}
    >
      {scenario}
    </div>
  );
}
