"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FREE_GENERATIONS_PER_MONTH,
  GenerateScenariosPanel,
  GenerationQuota,
  GenerationStatus,
  MakeYourOwnTile,
  SCENARIOS_PER_ROUND,
} from "@/components/game/generate-scenarios";

const CATEGORIES = ["Classic", "Spicy", "Wholesome", "Chaotic", "Work", "Couples"];

const MOCK_SCENARIOS = [
  "still have the house group chat muted since 2019",
  "turn up to Lisbon having forgotten their passport",
  "cry during the best man's speech, at someone else's wedding",
  "claim they're 'basically fluent' in Portuguese after one Duolingo lesson",
  "have kept a deposit dispute going for five years",
  "book the cheapest flight and arrive a day late",
  "get adopted by a table of locals and vanish for the night",
  "still owe someone £12.50 for a 2018 Domino's",
  "start a 30th birthday speech and forget whose birthday it is",
  "end the trip engaged to someone they met on day two",
];

// Midnight UTC on the 1st of next month: the same rule the backend would use.
function nextReset() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
}

type Screen = "categories" | "generate" | "picked";

export function GenerateScenariosPreview() {
  const [isGuest, setIsGuest] = useState(false);
  const [quota, setQuota] = useState<GenerationQuota>({
    used: 2,
    allowance: FREE_GENERATIONS_PER_MONTH,
    resetsAt: nextReset(),
  });
  const [failNext, setFailNext] = useState(false);
  const [screen, setScreen] = useState<Screen>("categories");
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [scenarios, setScenarios] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  // Stands in for the generation action: the credit is reserved up front, the
  // scenarios arrive one by one as the model finishes each, and a failure
  // gives the credit back.
  function generate() {
    clearInterval(timer.current);
    setQuota((q) => ({ ...q, used: q.used + 1 }));
    setScenarios([]);
    setStatus("generating");
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      if (failNext && n === 4) {
        clearInterval(timer.current);
        setQuota((q) => ({ ...q, used: q.used - 1 }));
        setStatus("error");
        return;
      }
      setScenarios(MOCK_SCENARIOS.slice(0, n));
      if (n >= SCENARIOS_PER_ROUND) {
        clearInterval(timer.current);
        setStatus("review");
      }
    }, 350);
  }

  const title =
    screen === "categories"
      ? "Pick Scenario Category"
      : screen === "generate"
        ? "Make Your Own"
        : "Pick Scenario";
  const description =
    screen === "categories"
      ? "Select the category of your scenarios."
      : screen === "generate"
        ? "Describe your group and we'll write this round's 10 scenarios."
        : "Choose the scenario you're going to rank everyone on.";

  return (
    <div className={"flex w-full flex-col gap-4 py-4 md:w-[75%] md:mx-auto"}>
      <div
        className={
          "flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-xs"
        }
      >
        <span className={"font-semibold"}>Prototype controls</span>
        <Button size={"sm"} variant={"outline"} onClick={() => setIsGuest((g) => !g)}>
          {isGuest ? "Viewer: guest" : "Viewer: account"}
        </Button>
        <Button
          size={"sm"}
          variant={"outline"}
          onClick={() => setQuota((q) => ({ ...q, used: (q.used + 1) % (q.allowance + 1) }))}
        >
          Used: {quota.used}/{quota.allowance}
        </Button>
        <Button size={"sm"} variant={"outline"} onClick={() => setFailNext((f) => !f)}>
          {failNext ? "Next run: fails" : "Next run: succeeds"}
        </Button>
        <Button
          size={"sm"}
          variant={"ghost"}
          onClick={() => {
            clearInterval(timer.current);
            setScreen("categories");
            setStatus("idle");
            setScenarios([]);
          }}
        >
          Reset
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {screen === "categories" && (
            <div className={"flex flex-col gap-8"}>
              <MakeYourOwnTile
                quota={quota}
                isGuest={isGuest}
                onOpen={() => {
                  if (isGuest) {
                    alert("→ /sign-in?tab=sign-up&next=/game/CODE");
                    return;
                  }
                  setStatus("idle");
                  setScreen("generate");
                }}
              />
              <div className={"grid grid-cols-1 gap-2 lg:grid-cols-2"}>
                {CATEGORIES.map((c) => (
                  <Button key={c} variant={"outline"} className={"py-4"}>
                    {c}
                  </Button>
                ))}
              </div>
              <Button disabled>
                Pick Category
                <ArrowRight />
              </Button>
            </div>
          )}
          {screen === "generate" && (
            <GenerateScenariosPanel
              quota={quota}
              tones={CATEGORIES}
              status={status}
              scenarios={scenarios}
              error={"The model timed out."}
              onGenerate={generate}
              onUse={() => setScreen("picked")}
              onBack={() => {
                clearInterval(timer.current);
                setScreen("categories");
              }}
            />
          )}
          {screen === "picked" && (
            <div className={"grid grid-cols-1 gap-2"}>
              {scenarios.map((s) => (
                <Button key={s} variant={"outline"} className={"h-fit whitespace-normal py-2"}>
                  {s}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
