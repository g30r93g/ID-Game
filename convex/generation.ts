import { ConvexError, v } from "convex/values";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  action,
  internalMutation,
  MutationCtx,
  query,
  QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import {
  DEFAULT_SCENARIO_MODEL,
  FREE_GENERATIONS_PER_MONTH,
  GENERATION_TIMEOUT_MS,
  generationPeriod,
  groupScenarioPrompts,
  MAX_PROMPT_LENGTH,
  MIN_PROMPT_LENGTH,
  nextResetAt,
  SCENARIOS_PER_ROUND,
  STALE_PENDING_MS,
} from "../lib/generation";

// Player-generated scenarios ("Make your own"). A round host describes their
// group and the model writes the round's 10 scenarios, metered at
// FREE_GENERATIONS_PER_MONTH per account per UTC month.
//
// A generation is reserved, then written, then committed:
//   reserveGeneration  checks everything and inserts a `pending` row, which
//                      is what takes the credit. One transaction, so two tabs
//                      can't both spend the last one.
//   commitGeneration   stores the batch, makes it the round's draw and marks
//                      it `succeeded`.
//   failGeneration     marks it `failed`, which is the refund.
// The model runs in an action, between the mutations, so a host closing their
// tab mid-run changes nothing. An action that dies outright leaves a pending
// row, which sweepStaleGenerations refunds, as does the host's next attempt.
//
// The model is called with generateText rather than streamText. On a failed
// call streamText rejects promises nobody awaits, which Convex treats as an
// uncaught error: it ended the action before the refund was written, leaving
// the generation stuck pending.
//
// Needs AI_GATEWAY_API_KEY in the Convex environment (and optionally
// AI_SCENARIO_MODEL). Without the key the feature is off: the quota query
// returns null, which hides it in the UI, and reserving refuses.

function isEnabled(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY;
}

// Messages the host is meant to read are ConvexErrors: Convex replaces a plain
// Error's message with "Server Error" in production.
function refuse(message: string): never {
  throw new ConvexError(message);
}

/** Generations that count against `userId`'s allowance for `period`. */
async function countUsed(
  ctx: QueryCtx,
  userId: string,
  period: string,
): Promise<number> {
  const rows = await ctx.db
    .query("scenarioGenerations")
    .withIndex("byUserPeriod", (q) =>
      q.eq("userId", userId).eq("period", period),
    )
    .collect();
  return rows.filter((row) => row.status !== "failed").length;
}

/** The round's newest generation, or null. */
async function latestForRound(ctx: QueryCtx, roundId: Id<"gameRounds">) {
  return await ctx.db
    .query("scenarioGenerations")
    .withIndex("byRound", (q) => q.eq("roundId", roundId))
    .order("desc")
    .first();
}

async function scenariosFor(
  ctx: QueryCtx,
  generationId: Id<"scenarioGenerations">,
): Promise<Doc<"customScenarios">[]> {
  return await ctx.db
    .query("customScenarios")
    .withIndex("byGeneration", (q) => q.eq("generationId", generationId))
    .collect();
}

/**
 * The caller's allowance this month, or null when the feature is off or they
 * are signed out, which hides it. Guests get `isGuest` and nothing used: they
 * see the feature, locked, as a reason to make an account. Reactive, so the
 * tile and meter update the moment a generation is reserved or refunded.
 */
export const getGenerationQuota = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || !isEnabled()) return null;
    const isGuest = identity.isAnonymous === true;
    const now = Date.now();
    return {
      isGuest,
      used: isGuest
        ? 0
        : await countUsed(ctx, identity.subject, generationPeriod(now)),
      allowance: FREE_GENERATIONS_PER_MONTH,
      resetsAt: nextResetAt(now),
    };
  },
});

/**
 * The round's newest generation, for the host who asked for it: its status and
 * the scenarios written so far, which arrive one by one while it's pending.
 * Null for anyone else, so other players never see a batch before the host
 * has picked from it.
 */
export const roundGeneration = query({
  args: { roundId: v.id("gameRounds") },
  handler: async (ctx, { roundId }) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) return null;

    const generation = await latestForRound(ctx, roundId);
    if (!generation || generation.userId !== userId) return null;

    return {
      _id: generation._id,
      status: generation.status,
      prompt: generation.prompt,
      tone: generation.tone,
      error: generation.error,
      scenarios: (await scenariosFor(ctx, generation._id)).map(
        (scenario) => scenario.description,
      ),
    };
  },
});

export const reserveGeneration = internalMutation({
  args: {
    roundId: v.id("gameRounds"),
    prompt: v.string(),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) refuse("Sign in to make your own scenarios.");
    // Guests can end up hosting a round, since the host rotates, but the
    // allowance belongs to an account.
    if (identity.isAnonymous === true) {
      refuse("Create an account to make your own scenarios.");
    }
    if (!isEnabled()) refuse("Making your own scenarios isn't available.");
    const userId = identity.subject;

    const prompt = args.prompt.trim();
    if (prompt.length < MIN_PROMPT_LENGTH) {
      refuse("Tell us a bit more about your group.");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      refuse(`Keep it under ${MAX_PROMPT_LENGTH} characters.`);
    }

    const round = await ctx.db.get(args.roundId);
    if (!round) refuse("This round no longer exists.");
    const host = await ctx.db.get(round.hostPlayerId);
    if (host?.userId !== userId) {
      refuse("Only the round's host can make its scenarios.");
    }
    if (round.phase !== "create-scenarios") {
      refuse("This round has already moved on.");
    }
    const lockedIn = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRoundSelected", (q) =>
        q.eq("roundId", round._id).eq("selected", true),
      )
      .first();
    if (lockedIn) refuse("A scenario has already been selected.");

    // One at a time per round: a second would race the first for the draw.
    // A pending generation past STALE_PENDING_MS belongs to an action that
    // died, so it is refunded here rather than blocking the host until the
    // sweep gets to it.
    const now = Date.now();
    const latest = await latestForRound(ctx, round._id);
    if (latest?.status === "pending") {
      if (latest.createdAt > now - STALE_PENDING_MS) {
        refuse("Your scenarios are already being written.");
      }
      await markFailed(ctx, latest, STALE_ERROR);
    }

    const period = generationPeriod(now);
    if ((await countUsed(ctx, userId, period)) >= FREE_GENERATIONS_PER_MONTH) {
      refuse(
        `You've used all ${FREE_GENERATIONS_PER_MONTH} of this month's generations.`,
      );
    }

    // The tone is one of the categories, so its admin-written brief can steer
    // the batch. Named either in the managed list or by scenarios using it,
    // the same two places the category picker and admin UI read.
    let tone: { category: string; brief: string } | undefined;
    if (args.tone !== undefined) {
      const category = args.tone.trim();
      const row = await ctx.db
        .query("scenarioCategories")
        .withIndex("byName", (q) => q.eq("name", category))
        .unique();
      const inUse =
        row ??
        (await ctx.db
          .query("scenarios")
          .withIndex("byCategory", (q) => q.eq("category", category))
          .first());
      if (!inUse) refuse("That tone isn't one of the categories.");
      tone = { category, brief: row?.brief ?? "" };
    }

    // The model may use the names of the people actually playing.
    const players = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", round.gameId))
      .collect();
    const playerNames = players
      .filter((player) => player.active !== false)
      .map((player) => player.displayName);

    const generationId = await ctx.db.insert("scenarioGenerations", {
      userId,
      period,
      gameId: round.gameId,
      roundId: round._id,
      prompt,
      ...(tone ? { tone: tone.category } : {}),
      status: "pending",
      createdAt: now,
    });

    return {
      generationId,
      ...groupScenarioPrompts({ description: prompt, tone, playerNames }),
    };
  },
});

const STALE_ERROR = "We couldn't write your scenarios just now.";

async function markFailed(
  ctx: MutationCtx,
  generation: Doc<"scenarioGenerations">,
  error: string,
) {
  await ctx.db.patch(generation._id, { status: "failed", error });
}

export const failGeneration = internalMutation({
  args: { generationId: v.id("scenarioGenerations"), error: v.string() },
  handler: async (ctx, { generationId, error }) => {
    const generation = await ctx.db.get(generationId);
    if (generation?.status !== "pending") return;
    await markFailed(ctx, generation, error);
  },
});

/**
 * Make a finished batch the round's draw. Refunds instead if the round has
 * moved on, or changed hands, while the model was writing: the host got
 * nothing for the credit.
 */
export const commitGeneration = internalMutation({
  args: {
    generationId: v.id("scenarioGenerations"),
    descriptions: v.array(v.string()),
  },
  handler: async (ctx, { generationId, descriptions }) => {
    const generation = await ctx.db.get(generationId);
    if (generation?.status !== "pending") return false;

    const round = await ctx.db.get(generation.roundId);
    const host = round ? await ctx.db.get(round.hostPlayerId) : null;
    const draw = round
      ? await ctx.db
          .query("gameRoundScenarios")
          .withIndex("byRound", (q) => q.eq("roundId", round._id))
          .collect()
      : [];
    if (
      !round ||
      round.phase !== "create-scenarios" ||
      host?.userId !== generation.userId ||
      draw.some((row) => row.selected)
    ) {
      await markFailed(
        ctx,
        generation,
        "The round moved on before your scenarios were ready.",
      );
      return false;
    }

    if (descriptions.length < SCENARIOS_PER_ROUND) {
      await markFailed(ctx, generation, "Not enough scenarios were written.");
      return false;
    }

    // Replaces whatever the round had, a category draw or an earlier batch,
    // the same way a category re-draw does. Inserted in order, so the host
    // sees them as the model wrote them.
    await Promise.all(draw.map((row) => ctx.db.delete(row._id)));
    for (const description of descriptions.slice(0, SCENARIOS_PER_ROUND)) {
      const scenarioId = await ctx.db.insert("customScenarios", {
        generationId,
        description,
      });
      await ctx.db.insert("gameRoundScenarios", {
        gameId: round.gameId,
        roundId: round._id,
        scenarioId,
        selected: false,
      });
    }
    await ctx.db.patch(generationId, { status: "succeeded" });
    return true;
  },
});

const scenarioSchema = z.object({ description: z.string() });

/**
 * Write the round's scenarios from the host's description. Spends one of the
 * month's generations, refunded if it fails. The host's screen follows along
 * through roundGeneration rather than this result, which only says how it
 * ended.
 */
export const generateRoundScenarios = action({
  args: {
    roundId: v.id("gameRounds"),
    prompt: v.string(),
    tone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ succeeded: boolean }> => {
    const { generationId, system, prompt } = await ctx.runMutation(
      internal.generation.reserveGeneration,
      args,
    );

    // Well inside STALE_PENDING_MS, so the sweep never refunds a run that is
    // still going.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), GENERATION_TIMEOUT_MS);
    let descriptions: string[] = [];
    let failure: unknown;
    try {
      const { output } = await generateText({
        model: process.env.AI_SCENARIO_MODEL ?? DEFAULT_SCENARIO_MODEL,
        output: Output.array({ element: scenarioSchema }),
        instructions: system,
        prompt,
        temperature: 0.9,
        abortSignal: abort.signal,
      });
      descriptions = output
        .map(({ description }) => description.trim())
        .filter(Boolean)
        .slice(0, SCENARIOS_PER_ROUND);
    } catch (e) {
      failure = e;
    } finally {
      clearTimeout(timeout);
    }

    if (descriptions.length < SCENARIOS_PER_ROUND) {
      if (failure !== undefined) console.error("Generation failed:", failure);
      await ctx.runMutation(internal.generation.failGeneration, {
        generationId,
        // A short batch with no error is the model declining the description.
        error:
          failure !== undefined
            ? STALE_ERROR
            : "We couldn't write scenarios for that description. Try describing your group differently.",
      });
      return { succeeded: false };
    }

    const succeeded: boolean = await ctx.runMutation(
      internal.generation.commitGeneration,
      { generationId, descriptions },
    );
    return { succeeded };
  },
});

/**
 * Refund generations whose action died without finishing. Run by a cron job;
 * anything pending past STALE_PENDING_MS is well beyond the action's own
 * timeout, so it can't still be running.
 */
export const sweepStaleGenerations = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stale = await ctx.db
      .query("scenarioGenerations")
      .withIndex("byStatusCreatedAt", (q) =>
        q.eq("status", "pending").lt("createdAt", Date.now() - STALE_PENDING_MS),
      )
      .take(100);
    for (const generation of stale) {
      await markFailed(ctx, generation, STALE_ERROR);
    }
    return stale.length;
  },
});
