"use client";

import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Lock,
  RefreshCw,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingButton } from "@/components/ui/loading-button";
import { cn } from "@/lib/utils";
import {
  MAX_PROMPT_LENGTH,
  MIN_PROMPT_LENGTH,
  SCENARIOS_PER_ROUND,
} from "@/lib/generation";

// The "Make your own" UI: a round host describes their group and the model
// writes the round's 10 scenarios, metered per account per month. Purely
// presentational; create-scenarios.tsx feeds it from convex/generation.ts.

export interface GenerationQuota {
  used: number;
  allowance: number;
  /** Epoch ms of the next reset: midnight UTC on the 1st of next month. */
  resetsAt: number;
}

export type GenerationStatus = "idle" | "generating" | "review" | "error";

const PROMPT_IDEAS = [
  "Our uni house, 2019",
  "The Ibiza trip",
  "Work Christmas party",
  "Wedding weekend",
  "Five-a-side lads",
];

function remaining(quota: GenerationQuota) {
  return Math.max(0, quota.allowance - quota.used);
}

function formatReset(resetsAt: number) {
  return new Date(resetsAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

/**
 * "5 of 5 left": the dots fill from the left as credits are spent, so the
 * allowance reads at a glance without a number to parse.
 */
export function GenerationQuotaMeter({
  quota,
  className,
}: {
  quota: GenerationQuota;
  className?: string;
}) {
  const left = remaining(quota);
  return (
    <div
      className={cn("flex items-center gap-2 text-xs", className)}
      aria-label={`${left} of ${quota.allowance} free generations left this month`}
    >
      <div className={"flex gap-1"} aria-hidden>
        {Array.from({ length: quota.allowance }, (_, i) => (
          <span
            key={i}
            className={cn(
              "size-2 rounded-full",
              i < left ? "bg-warning" : "bg-muted-foreground/25",
            )}
          />
        ))}
      </div>
      <span className={"text-muted-foreground tabular-nums"}>
        {left} of {quota.allowance} left · resets {formatReset(quota.resetsAt)}
      </span>
    </div>
  );
}

/**
 * The entry point, sat above the category grid on the host's
 * create-scenarios screen. Guests see it too, locked, since it is a reason to
 * make an account.
 */
export function MakeYourOwnTile({
  quota,
  isGuest,
  onOpen,
}: {
  quota: GenerationQuota | undefined;
  isGuest: boolean;
  onOpen: () => void;
}) {
  const left = quota ? remaining(quota) : 0;
  const exhausted = !isGuest && quota !== undefined && left === 0;

  return (
    // The padding is room for the glow. The tile is the first thing in the
    // card's scrolling content, which clips anything above its top edge.
    <div className={"pt-3"}>
      <button
        type={"button"}
        onClick={onOpen}
        className={cn(
          "group relative isolate flex h-11 w-full items-center gap-2 rounded-md border px-4 text-sm font-medium",
          "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        )}
      >
        {/* The glow: a blurred rainbow behind the tile rather than a border, so
            it reads as light spilling out. Dimmed once there's nothing to
            spend, and held still for reduced motion. It sits low, so it
            spills mostly downwards and needs little room above. */}
        <span
          aria-hidden
          className={cn(
            "absolute -inset-x-1 top-1.5 -bottom-2 -z-10 rounded-lg blur-md transition-opacity",
            "animate-[rainbow-glow_6s_linear_infinite] motion-reduce:animate-none",
            isGuest || exhausted
              ? "opacity-25"
              : "opacity-60 group-hover:opacity-90",
          )}
          style={{
            backgroundImage:
              "linear-gradient(90deg, #ff4d4d, #ffa64d, #ffe14d, #4dff88, #4dc3ff, #9b4dff, #ff4dd2, #ff4d4d)",
            backgroundSize: "200% 100%",
          }}
        />
        {/* The tile's own fill. It can't sit on the button: inside the isolated
            stacking context a -z child paints over its parent's background, so
            the glow would show through the face of the tile. */}
        <span aria-hidden className={"bg-card absolute inset-0 -z-10 rounded-md"} />
        {isGuest ? (
          <Lock className={"size-4"} />
        ) : (
          <WandSparkles className={"size-4"} />
        )}
        <span className={"grow text-left"}>Make your own</span>
        <span className={"text-muted-foreground text-xs font-normal tabular-nums"}>
          {isGuest
            ? "Create an account"
            : quota &&
              (exhausted ? `Resets ${formatReset(quota.resetsAt)}` : `${left} left`)}
        </span>
        <ArrowRight
          className={
            "text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
          }
        />
      </button>
    </div>
  );
}

interface GenerateScenariosPanelProps {
  quota: GenerationQuota;
  /** Existing categories, offered as the tone; their admin briefs steer the model. */
  tones: string[];
  status: GenerationStatus;
  /** Streams in during "generating", complete in "review". */
  scenarios: string[];
  /**
   * What the scenarios were written from, as the server has it. Shown while
   * generating and in review; falls back to what was typed here, which is
   * gone after a reload.
   */
  theme?: { prompt: string; tone?: string };
  error?: string;
  onGenerate: (input: { prompt: string; tone: string | undefined }) => void;
  /** Lock the generated set in as this round's draw and move to pick-scenario. */
  onUse: () => void;
  onBack: () => void;
}

/**
 * The whole flow in one card body: write a theme, pick a tone, generate,
 * watch the 10 arrive, then use them or spend another credit on a re-roll.
 */
export function GenerateScenariosPanel({
  quota,
  tones,
  status,
  scenarios,
  theme,
  error,
  onGenerate,
  onUse,
  onBack,
}: GenerateScenariosPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState<string | undefined>(undefined);
  const [confirmingReroll, setConfirmingReroll] = useState(false);

  const left = remaining(quota);
  const busy = status === "generating";
  const canGenerate =
    left > 0 && prompt.trim().length >= MIN_PROMPT_LENGTH && !busy;
  const shownPrompt = theme?.prompt ?? prompt;
  const shownTone = theme ? theme.tone : tone;

  if (left === 0 && status === "idle") {
    return (
      <div className={"flex flex-col gap-6"}>
        <Alert>
          <Sparkles />
          <AlertTitle>You&apos;ve used all {quota.allowance} this month</AlertTitle>
          <AlertDescription>
            Your free generations come back on {formatReset(quota.resetsAt)}.
            Until then, pick one of the ready-made categories.
          </AlertDescription>
        </Alert>
        <GenerationQuotaMeter quota={quota} />
        <Button variant={"outline"} onClick={onBack}>
          <ArrowLeft />
          Back to categories
        </Button>
      </div>
    );
  }

  if (status === "generating" || status === "review") {
    return (
      <div className={"flex flex-col gap-6"}>
        <div className={"flex flex-col gap-1"}>
          <span className={"text-muted-foreground text-xs uppercase tracking-wide"}>
            Your theme
          </span>
          <p className={"font-medium"}>
            {shownPrompt}
            {shownTone && (
              <Badge variant={"outline"} className={"ml-2 align-middle"}>
                {shownTone}
              </Badge>
            )}
          </p>
        </div>

        <ol className={"flex flex-col gap-2"} aria-label={"Most likely to…"} aria-live={"polite"} aria-busy={busy}>
          {Array.from({ length: SCENARIOS_PER_ROUND }, (_, i) => {
            const text = scenarios[i];
            return (
              <li
                key={i}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm",
                  text && "animate-in fade-in slide-in-from-bottom-1 duration-300",
                )}
              >
                <span className={"text-muted-foreground w-5 shrink-0 text-right tabular-nums"}>
                  {i + 1}
                </span>
                {text ? (
                  <span>{text}</span>
                ) : (
                  <Skeleton className={"h-4 grow"} />
                )}
              </li>
            );
          })}
        </ol>

        {status === "review" && confirmingReroll ? (
          <Alert variant={"warning"}>
            <RefreshCw />
            <AlertTitle>Re-roll uses another generation</AlertTitle>
            <AlertDescription className={"gap-3"}>
              You&apos;ll have {Math.max(0, left - 1)} of {quota.allowance} left
              this month.
              <div className={"flex gap-2"}>
                <Button
                  size={"sm"}
                  onClick={() => {
                    setConfirmingReroll(false);
                    onGenerate({ prompt: shownPrompt, tone: shownTone });
                  }}
                >
                  Re-roll
                </Button>
                <Button
                  size={"sm"}
                  variant={"ghost"}
                  onClick={() => setConfirmingReroll(false)}
                >
                  Keep these
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className={"flex flex-col gap-2"}>
          <LoadingButton loading={busy} disabled={busy} onClick={onUse}>
            {busy ? (
              `Writing ${scenarios.length} of ${SCENARIOS_PER_ROUND}…`
            ) : (
              <>
                Use these scenarios
                <ArrowRight />
              </>
            )}
          </LoadingButton>
          <div className={"flex gap-2"}>
            <Button
              variant={"ghost"}
              className={"grow"}
              disabled={busy}
              onClick={onBack}
            >
              <ArrowLeft />
              Categories
            </Button>
            <Button
              variant={"ghost"}
              className={"grow"}
              disabled={busy || left === 0 || confirmingReroll}
              onClick={() => setConfirmingReroll(true)}
            >
              <RefreshCw />
              Re-roll
            </Button>
          </div>
          <GenerationQuotaMeter quota={quota} className={"justify-center"} />
        </div>
      </div>
    );
  }

  return (
    <div className={"flex flex-col gap-6"}>
      <div className={"flex flex-col gap-2"}>
        <label htmlFor={"generate-prompt"} className={"text-sm font-medium"}>
          What&apos;s this round about?
        </label>
        <textarea
          id={"generate-prompt"}
          value={prompt}
          maxLength={MAX_PROMPT_LENGTH}
          rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={"e.g. Six of us who met at uni, now all turning 30 in Lisbon"}
          className={cn(
            "placeholder:text-muted-foreground dark:bg-input/30 border-input w-full resize-none rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none md:text-sm",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          )}
        />
        <div className={"flex items-start justify-between gap-2"}>
          <div className={"flex flex-wrap gap-1.5"}>
            {PROMPT_IDEAS.map((idea) => (
              <button
                key={idea}
                type={"button"}
                onClick={() => setPrompt(idea)}
                className={
                  "hover:bg-accent rounded-full border px-2.5 py-0.5 text-xs transition-colors"
                }
              >
                {idea}
              </button>
            ))}
          </div>
          <span className={"text-muted-foreground shrink-0 text-xs tabular-nums"}>
            {prompt.length}/{MAX_PROMPT_LENGTH}
          </span>
        </div>
      </div>

      <div className={"flex flex-col gap-2"}>
        <span className={"text-sm font-medium"}>
          Tone <span className={"text-muted-foreground font-normal"}>(optional)</span>
        </span>
        <div className={"grid grid-cols-2 gap-2 lg:grid-cols-4"}>
          {tones.map((t) => (
            <Button
              key={t}
              size={"sm"}
              variant={tone === t ? "default" : "outline"}
              onClick={() => setTone(tone === t ? undefined : t)}
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      {status === "error" && (
        <Alert variant={"destructive"}>
          <AlertTitle>That didn&apos;t work</AlertTitle>
          <AlertDescription>
            {error ?? "We couldn't write your scenarios."} It hasn&apos;t
            counted towards your {quota.allowance}.
          </AlertDescription>
        </Alert>
      )}

      <div className={"flex flex-col gap-2"}>
        <Button disabled={!canGenerate} onClick={() => onGenerate({ prompt, tone })}>
          <Sparkles />
          Generate {SCENARIOS_PER_ROUND} scenarios
        </Button>
        <GenerationQuotaMeter quota={quota} className={"justify-center"} />
        <Button variant={"ghost"} onClick={onBack}>
          <ArrowLeft />
          Back to categories
        </Button>
      </div>
    </div>
  );
}
