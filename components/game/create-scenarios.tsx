"use client";

import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, X } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LoadingButton } from "@/components/ui/loading-button";
import { Id } from "@/convex/_generated/dataModel";
import { ConvexError } from "convex/values";
import { capture } from "@/lib/analytics";
import {
  GenerateScenariosPanel,
  GenerationStatus,
  MakeYourOwnTile,
} from "@/components/game/generate-scenarios";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { SignInCard } from "@/components/sign-in-card";
import { usePathname } from "next/navigation";

interface CreateScenarioGamePhaseProps {
  gameId: Id<"games">;
  gameRoundId: Id<"gameRounds">;
  advanceGame: () => void;
}

function CreateScenariosGamePhase({
  gameId,
  gameRoundId,
  advanceGame,
}: CreateScenarioGamePhaseProps) {
  const scenarioCategories = useQuery(api.game.scenarioCategories);
  const roundScenarios = useQuery(api.game.gameRoundScenarios, {
    gameRound: gameRoundId,
  });
  const generateScenarios = useMutation(api.game.selectScenariosForGameRound);

  const quota = useQuery(api.generation.getGenerationQuota);
  const generation = useQuery(api.generation.roundGeneration, {
    roundId: gameRoundId,
  });
  const generateOwnScenarios = useAction(
    api.generation.generateRoundScenarios,
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    undefined,
  );

  // "Make your own": the categories, or the generation panel in their place.
  const [makingOwn, setMakingOwn] = useState<boolean>(false);
  // A guest who opened it: the sign-up dialog.
  const [signingUp, setSigningUp] = useState<boolean>(false);
  const pathname = usePathname();
  // While this tab's generation action is in flight, and how it ended. The
  // server's record catches up on its own, but not always before the action
  // returns, so these keep the panel from flashing the previous batch.
  const [running, setRunning] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<
    { succeeded: true } | { succeeded: false; error?: string } | undefined
  >(undefined);

  // Whether the round's current draw is the host's own batch: generated
  // scenarios have no category.
  const drawIsOwn =
    !!roundScenarios?.length &&
    roundScenarios.every(
      (roundScenario) =>
        roundScenario.scenarioDetails &&
        roundScenario.scenarioDetails.category === undefined,
    );

  // A host arriving here from "Change category" already has a draw. Show which
  // category it came from instead of resetting to nothing. Seeded exactly once
  // (guarded, set during render — the same pattern as rank-players) so it never
  // overrides the host's own subsequent choice.
  // Likewise a host whose draw is their own batch, or who reloaded while one
  // was being written, lands back on it.
  const [seededFromDraw, setSeededFromDraw] = useState<boolean>(false);
  if (
    !seededFromDraw &&
    roundScenarios !== undefined &&
    generation !== undefined
  ) {
    setSeededFromDraw(true);
    if (
      generation?.status === "pending" ||
      (generation?.status === "succeeded" && drawIsOwn)
    ) {
      setMakingOwn(true);
    }
    const drawnCategory = roundScenarios.find((roundScenario) =>
      roundScenario.scenarioDetails,
    )?.scenarioDetails?.category;
    if (drawnCategory) setSelectedCategory(drawnCategory);
  }

  async function handleCategorySelection() {
    if (!selectedCategory) return;

    setIsLoading(true);
    try {
      // capture analytics event
      capture("game_scenario_category_select", {
        scenario: selectedCategory,
      });

      // perform and await mutation
      await generateScenarios({
        game: gameId,
        gameRound: gameRoundId,
        category: selectedCategory,
      });

      // advance
      advanceGame();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerate(input: {
    prompt: string;
    tone: string | undefined;
  }) {
    capture("scenario_generation_start", { hasTone: !!input.tone });
    setOutcome(undefined);
    setRunning(true);
    try {
      const result = await generateOwnScenarios({
        roundId: gameRoundId,
        prompt: input.prompt,
        tone: input.tone,
      });
      capture(
        result.succeeded
          ? "scenario_generation_succeed"
          : "scenario_generation_fail",
      );
      setOutcome(result);
    } catch (e) {
      // Refusals (allowance spent, round moved on) carry a message to show.
      const error =
        e instanceof ConvexError && typeof e.data === "string"
          ? e.data
          : undefined;
      capture("scenario_generation_fail", { refused: !!error });
      setOutcome({ succeeded: false, error });
    } finally {
      setRunning(false);
    }
  }

  // The panel's state: this tab's own run when there is one, otherwise the
  // server's record, which covers a reload mid-run.
  let status: GenerationStatus = "idle";
  let error: string | undefined;
  if (running) {
    status = "generating";
  } else if (outcome?.succeeded) {
    status = "review";
  } else if (outcome) {
    status = "error";
    error =
      outcome.error ??
      (generation?.status === "failed" ? generation.error : undefined);
  } else if (generation?.status === "pending") {
    status = "generating";
  } else if (generation?.status === "succeeded" && drawIsOwn) {
    status = "review";
  }
  // A run's scenarios as they arrive; nothing from an earlier batch while a
  // new one is starting.
  const generatedScenarios =
    generation &&
    (generation.status === "pending" ||
      (generation.status === "succeeded" && status === "review"))
      ? generation.scenarios
      : [];

  if (makingOwn && quota) {
    return (
      <GenerateScenariosPanel
        quota={quota}
        tones={scenarioCategories ?? []}
        status={status}
        scenarios={generatedScenarios}
        theme={
          status !== "idle" && status !== "error" && generation
            ? { prompt: generation.prompt, tone: generation.tone }
            : undefined
        }
        error={error}
        onGenerate={handleGenerate}
        onUse={() => {
          capture("scenario_generation_use");
          advanceGame();
        }}
        onBack={() => {
          setOutcome(undefined);
          setMakingOwn(false);
        }}
      />
    );
  }

  return (
    <div className={"flex flex-col gap-8"}>
      {quota && (
        <MakeYourOwnTile
          quota={quota}
          isGuest={quota.isGuest}
          onOpen={() => {
            capture("scenario_generation_open", { isGuest: quota.isGuest });
            if (quota.isGuest) {
              setSigningUp(true);
              return;
            }
            setMakingOwn(true);
          }}
        />
      )}
      {/* A guest makes their account here rather than on /sign-in, so they
          never leave the game. Success reloads this page, by then with their
          seat moved onto the new account. */}
      <Dialog open={signingUp} onOpenChange={setSigningUp}>
        <DialogContent
          className={"border-0 bg-transparent p-0 shadow-none sm:max-w-sm"}
          showCloseButton={false}
        >
          <DialogTitle className={"sr-only"}>
            Create an account to make your own scenarios
          </DialogTitle>
          {signingUp && (
            <SignInCard
              next={pathname}
              initialMode={"sign-up"}
              className={"px-0"}
            />
          )}
          {/* Above the card rather than in its corner, where the dialog's own
              button lands on the sign-in tabs. After the card, so opening the
              dialog focuses the form rather than this. */}
          <DialogClose
            className={
              "bg-card text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute -top-12 right-0 flex size-9 items-center justify-center rounded-full border outline-none focus-visible:ring-[3px]"
            }
          >
            <X className={"size-4"} />
            <span className={"sr-only"}>Close</span>
          </DialogClose>
        </DialogContent>
      </Dialog>
      <div className={"grid grid-cols-1 lg:grid-cols-2 gap-2"}>
        {scenarioCategories?.map((category) => {
          return (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              className={"py-4"}
              onClick={() => {
                setSelectedCategory(category);
              }}
            >
              {category}
            </Button>
          );
        })}
      </div>
      <LoadingButton
        loading={isLoading}
        disabled={!selectedCategory || isLoading}
        onClick={() => {
          handleCategorySelection();
        }}
      >
        {!isLoading && (
          <>
            Pick Category
            <ArrowRight />
          </>
        )}
      </LoadingButton>
    </div>
  );
}

export default memo(CreateScenariosGamePhase);
