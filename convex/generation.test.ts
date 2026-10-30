import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  FREE_GENERATIONS_PER_MONTH,
  generationPeriod,
  STALE_PENDING_MS,
} from "../lib/generation";

const modules = import.meta.glob("./**/*.*s");

// Swap the gateway model id for a scripted one; everything else about the
// generateText call is the action's own.
const model = vi.hoisted(() => ({
  current: undefined as unknown,
  calls: [] as { prompt: unknown }[],
}));
vi.mock("ai", async (importOriginal) => {
  const ai = await importOriginal<typeof import("ai")>();
  return {
    ...ai,
    generateText: ((options) =>
      ai.generateText({
        ...options,
        model: model.current as typeof options.model,
      })) as typeof ai.generateText,
  };
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/**
 * A model that answers with these descriptions, or that fails the way the
 * gateway does for an unknown model: the call itself rejects.
 */
function scriptModel(descriptions: string[], opts: { fail?: boolean } = {}) {
  const text = JSON.stringify({
    elements: descriptions.map((description) => ({ description })),
  });
  model.current = new MockLanguageModelV4({
    doGenerate: async (options) => {
      model.calls.push({ prompt: options.prompt });
      if (opts.fail) throw new Error("Model not found");
      return {
        content: [{ type: "text", text }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      };
    },
  });
}

const TEN = Array.from({ length: 10 }, (_, i) => `do thing ${i}`);

beforeEach(() => {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  model.calls = [];
  scriptModel(TEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

// A started game in round 1's create-scenarios phase, hosted by "host", with
// a category draw already in place.
async function seedRound(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "GEN001",
      totalRounds: 3,
      currentRound: 1,
      isOpen: false,
      createdBy: "host",
      startedAt: 1000,
    });
    const hostPlayerId = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "Ada",
    });
    await ctx.db.insert("players", {
      userId: "guesser",
      gameId,
      displayName: "Ben",
    });
    await ctx.db.insert("players", {
      userId: "gone",
      gameId,
      displayName: "Cal",
      active: false,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId,
      phase: "create-scenarios",
    });
    await ctx.db.insert("scenarioCategories", {
      name: "Spicy",
      brief: "Turn the heat up.",
    });
    for (let i = 0; i < 10; i++) {
      const scenarioId = await ctx.db.insert("scenarios", {
        description: `spicy ${i}`,
        category: "Spicy",
      });
      await ctx.db.insert("gameRoundScenarios", {
        gameId,
        roundId,
        scenarioId,
        selected: false,
      });
    }
    return { gameId, roundId, hostPlayerId };
  });
}

/** Ledger rows for "host" this month, to burn through the allowance. */
async function spend(
  t: ReturnType<typeof convexTest>,
  gameId: Id<"games">,
  roundId: Id<"gameRounds">,
  count: number,
  overrides: { status?: "succeeded" | "failed"; period?: string } = {},
) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      await ctx.db.insert("scenarioGenerations", {
        userId: "host",
        period: overrides.period ?? generationPeriod(Date.now()),
        gameId,
        roundId,
        prompt: "earlier",
        status: overrides.status ?? "succeeded",
        createdAt: Date.now(),
      });
    }
  });
}

// Typed with the schema, unlike the helpers above: it reads through byRound.
async function drawDescriptions(
  t: TestConvex<typeof schema>,
  roundId: Id<"gameRounds">,
) {
  return t.run(async (ctx) => {
    const rows = await ctx.db
      .query("gameRoundScenarios")
      .withIndex("byRound", (q) => q.eq("roundId", roundId))
      .collect();
    const docs = await Promise.all(rows.map((row) => ctx.db.get(row.scenarioId)));
    return docs.map((doc) => doc?.description).sort();
  });
}

describe("getGenerationQuota", () => {
  test("counts this month's generations, not failed ones or last month's", async () => {
    const t = convexTest(schema, modules);
    const { gameId, roundId } = await seedRound(t);
    await spend(t, gameId, roundId, 2);
    await spend(t, gameId, roundId, 1, { status: "failed" });
    await spend(t, gameId, roundId, 3, { period: "2000-01" });

    const quota = await t
      .withIdentity({ subject: "host" })
      .query(api.generation.getGenerationQuota, {});
    expect(quota).toMatchObject({
      isGuest: false,
      used: 2,
      allowance: FREE_GENERATIONS_PER_MONTH,
    });
    expect(quota!.resetsAt).toBeGreaterThan(Date.now());
  });

  test("marks guests, and is null when the feature is off", async () => {
    const t = convexTest(schema, modules);
    expect(
      await t
        .withIdentity({ subject: "guest", isAnonymous: true })
        .query(api.generation.getGenerationQuota, {}),
    ).toMatchObject({ isGuest: true, used: 0 });

    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect(
      await t
        .withIdentity({ subject: "host" })
        .query(api.generation.getGenerationQuota, {}),
    ).toBeNull();
  });
});

describe("generateRoundScenarios", () => {
  test("writes 10 scenarios, makes them the draw and spends one credit", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await seedRound(t);
    const asHost = t.withIdentity({ subject: "host" });

    const result = await asHost.action(api.generation.generateRoundScenarios, {
      roundId,
      prompt: "  Uni friends in Lisbon  ",
      tone: "Spicy",
    });

    expect(result).toEqual({ succeeded: true });
    expect(await drawDescriptions(t, roundId)).toEqual([...TEN].sort());
    expect(
      await asHost.query(api.generation.roundGeneration, { roundId }),
    ).toMatchObject({
      status: "succeeded",
      prompt: "Uni friends in Lisbon",
      tone: "Spicy",
      scenarios: TEN,
    });
    expect(
      (await asHost.query(api.generation.getGenerationQuota, {}))!.used,
    ).toBe(1);

    // The tone's brief and the active players' names reach the model; the
    // player who left doesn't.
    const sent = JSON.stringify(model.calls[0].prompt);
    expect(sent).toContain("Turn the heat up.");
    expect(sent).toContain("Ada, Ben");
    expect(sent).not.toContain("Cal");
  });

  test("the host's batch stays hidden from other players", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await seedRound(t);
    await t
      .withIdentity({ subject: "host" })
      .action(api.generation.generateRoundScenarios, {
        roundId,
        prompt: "Uni friends",
      });

    expect(
      await t
        .withIdentity({ subject: "guesser" })
        .query(api.generation.roundGeneration, { roundId }),
    ).toBeNull();
  });

  test("a model failure refunds the credit and leaves the draw alone", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await seedRound(t);
    const asHost = t.withIdentity({ subject: "host" });
    const before = await drawDescriptions(t, roundId);
    scriptModel(TEN, { fail: true });

    const result = await asHost.action(api.generation.generateRoundScenarios, {
      roundId,
      prompt: "Uni friends",
    });

    expect(result).toEqual({ succeeded: false });
    expect(await drawDescriptions(t, roundId)).toEqual(before);
    expect(
      await asHost.query(api.generation.roundGeneration, { roundId }),
    ).toMatchObject({
      status: "failed",
      error: "We couldn't write your scenarios just now.",
      scenarios: [],
    });
    expect(
      (await asHost.query(api.generation.getGenerationQuota, {}))!.used,
    ).toBe(0);
  });

  test("a short batch is treated as the model declining, and refunded", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await seedRound(t);
    const asHost = t.withIdentity({ subject: "host" });
    scriptModel([]);

    await asHost.action(api.generation.generateRoundScenarios, {
      roundId,
      prompt: "something not allowed",
    });

    const generation = await asHost.query(api.generation.roundGeneration, {
      roundId,
    });
    expect(generation?.status).toBe("failed");
    expect(generation?.error).toMatch(/describing your group differently/);
    expect(
      (await asHost.query(api.generation.getGenerationQuota, {}))!.used,
    ).toBe(0);
  });

  test("refuses once the month's allowance is spent", async () => {
    const t = convexTest(schema, modules);
    const { gameId, roundId } = await seedRound(t);
    await spend(t, gameId, roundId, FREE_GENERATIONS_PER_MONTH);

    await expect(
      t
        .withIdentity({ subject: "host" })
        .action(api.generation.generateRoundScenarios, {
          roundId,
          prompt: "Uni friends",
        }),
    ).rejects.toThrow(/used all 5/);
    expect(model.calls).toHaveLength(0);
  });

  test("refuses guests, non-hosts and bad prompts or tones", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await seedRound(t);
    const generate = (
      identity: { subject: string; isAnonymous?: boolean },
      prompt: string,
      tone?: string,
    ) =>
      t
        .withIdentity(identity)
        .action(api.generation.generateRoundScenarios, { roundId, prompt, tone });

    await expect(
      generate({ subject: "host", isAnonymous: true }, "Uni friends"),
    ).rejects.toThrow(/Create an account/);
    await expect(generate({ subject: "guesser" }, "Uni friends")).rejects.toThrow(
      /Only the round's host/,
    );
    await expect(generate({ subject: "host" }, "  a ")).rejects.toThrow(
      /a bit more/,
    );
    await expect(generate({ subject: "host" }, "x".repeat(201))).rejects.toThrow(
      /under 200/,
    );
    await expect(
      generate({ subject: "host" }, "Uni friends", "Nonexistent"),
    ).rejects.toThrow(/isn't one of the categories/);
    expect(model.calls).toHaveLength(0);
  });

  test("refuses once a scenario is locked in", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await seedRound(t);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("gameRoundScenarios")
        .withIndex("byRound", (q) => q.eq("roundId", roundId))
        .first();
      await ctx.db.patch(row!._id, { selected: true });
    });

    await expect(
      t
        .withIdentity({ subject: "host" })
        .action(api.generation.generateRoundScenarios, {
          roundId,
          prompt: "Uni friends",
        }),
    ).rejects.toThrow(/already been selected/);
  });

  test("a custom scenario can be picked without touching the shared pool", async () => {
    const t = convexTest(schema, modules);
    const { roundId } = await seedRound(t);
    const asHost = t.withIdentity({ subject: "host" });
    await asHost.action(api.generation.generateRoundScenarios, {
      roundId,
      prompt: "Uni friends",
    });
    const [first] = await asHost.query(api.game.gameRoundScenarios, {
      gameRound: roundId,
    });
    expect(first.scenarioDetails).not.toHaveProperty("category");

    await asHost.mutation(api.game.selectGameRoundScenario, {
      gameRoundId: roundId,
      gameRoundScenarioId: first._id,
    });
    expect(
      await asHost.query(api.game.gameRoundScenarios, { gameRound: roundId }),
    ).toContainEqual(expect.objectContaining({ _id: first._id, selected: true }));
  });
});

describe("commitGeneration", () => {
  test("refunds if the round moved on while the model was writing", async () => {
    const t = convexTest(schema, modules);
    const { gameId, roundId } = await seedRound(t);
    const generationId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("scenarioGenerations", {
        userId: "host",
        period: generationPeriod(Date.now()),
        gameId,
        roundId,
        prompt: "Uni friends",
        status: "pending",
        createdAt: Date.now(),
      });
      await ctx.db.patch(roundId, { phase: "pick-scenario" });
      return id;
    });

    expect(
      await t.mutation(internal.generation.commitGeneration, {
        generationId,
        descriptions: TEN,
      }),
    ).toBe(false);
    const generation = await t.run((ctx) => ctx.db.get(generationId));
    expect(generation).toMatchObject({ status: "failed" });
    expect(await drawDescriptions(t, roundId)).not.toContain(TEN[0]);
  });
});

describe("a generation left pending by a dead action", () => {
  test("blocks a second attempt only while it could still be running", async () => {
    const t = convexTest(schema, modules);
    const { gameId, roundId } = await seedRound(t);
    const asHost = t.withIdentity({ subject: "host" });
    const pending = (createdAt: number) =>
      t.run((ctx) =>
        ctx.db.insert("scenarioGenerations", {
          userId: "host",
          period: generationPeriod(Date.now()),
          gameId,
          roundId,
          prompt: "Uni friends",
          status: "pending",
          createdAt,
        }),
      );

    const live = await pending(Date.now());
    await expect(
      asHost.action(api.generation.generateRoundScenarios, {
        roundId,
        prompt: "Uni friends",
      }),
    ).rejects.toThrow(/already being written/);

    // Once it's stale, the next attempt refunds it and goes ahead.
    await t.run((ctx) =>
      ctx.db.patch(live, { createdAt: Date.now() - STALE_PENDING_MS - 1000 }),
    );
    expect(
      await asHost.action(api.generation.generateRoundScenarios, {
        roundId,
        prompt: "Uni friends",
      }),
    ).toEqual({ succeeded: true });
    expect(await t.run((ctx) => ctx.db.get(live))).toMatchObject({
      status: "failed",
    });
    expect(
      (await asHost.query(api.generation.getGenerationQuota, {}))!.used,
    ).toBe(1);
  });
});

describe("sweepStaleGenerations", () => {
  test("refunds generations left pending by a dead action", async () => {
    const t = convexTest(schema, modules);
    const { gameId, roundId } = await seedRound(t);
    const insert = (createdAt: number) =>
      t.run((ctx) =>
        ctx.db.insert("scenarioGenerations", {
          userId: "host",
          period: generationPeriod(Date.now()),
          gameId,
          roundId,
          prompt: "Uni friends",
          status: "pending",
          createdAt,
        }),
      );
    const stale = await insert(Date.now() - STALE_PENDING_MS - 1000);
    const live = await insert(Date.now());

    expect(await t.mutation(internal.generation.sweepStaleGenerations, {})).toBe(
      1,
    );
    expect(await t.run((ctx) => ctx.db.get(stale))).toMatchObject({
      status: "failed",
    });
    expect(await t.run((ctx) => ctx.db.get(live))).toMatchObject({
      status: "pending",
    });
  });
});
