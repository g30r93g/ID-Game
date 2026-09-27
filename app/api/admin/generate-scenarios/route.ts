import { NextResponse } from "next/server";
import { Output, streamText } from "ai";
import { z } from "zod";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";
import { NDJSON_CONTENT_TYPE, ndjsonLine } from "@/lib/ndjson";

// Generate candidate scenarios via the Vercel AI Gateway (xAI Grok by default).
// Admin-guarded; returns candidates only — the client reviews them and inserts
// via the existing Convex `admin.createScenarios` mutation.
//
// Streams NDJSON so the dialog can show each candidate as soon as the model
// finishes it: one `{ "description": … }` line per scenario, then, only if
// generation failed part-way, a final `{ "error": … }` line (the status is
// already 200 by then). Auth and body errors happen before the stream starts
// and are still plain JSON with a 403/400 status.
//
// Requires `AI_GATEWAY_API_KEY` in the environment (auto-provided on Vercel;
// set it in `.env.local` for local dev). Override the model with
// `AI_SCENARIO_MODEL` (defaults to "xai/grok-4.1-fast-non-reasoning").

const bodySchema = z.object({
  instructions: z.string().default(""),
  category: z.string().trim().min(1),
  count: z.number().int().min(1).max(25),
});

const scenarioSchema = z.object({ description: z.string() });

export async function POST(req: Request) {
  const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { instructions, category, count } = parsed.data;

  // Per-category style brief (set/edited in the admin "Manage categories" UI).
  const { brief } = await fetchAuthQuery(api.admin.getCategoryBrief, {
    name: category,
  });

  const system =
    `You write short "Most likely to..." prompts for an adult (18+) party game called The ID Game, played by consenting adults who are calling out their friends. ` +
    `Each item is a single sentence that completes the phrase "Most likely to...". They can be cheeky, risqué, crude, and lewd — this is an adult game — but must NEVER involve minors, non-consent, illegal acts, real named individuals, or hateful/harassing content toward protected groups. ` +
    `Target category: "${category}". ` +
    (brief.trim()
      ? `Style brief for this category (follow it closely): ${brief.trim()}`
      : `No specific brief is set for this category — infer an appropriate style from the category name.`);
  const prompt =
    `Generate exactly ${count} distinct, punchy scenarios for the "${category}" category. ` +
    `Extra steer for this batch: ${instructions.trim() || "(none)"}.`;

  // Stops the model once `count` scenarios are out, or if the admin's browser
  // goes away mid-stream.
  const abort = new AbortController();
  const abortSignal = AbortSignal.any([req.signal, abort.signal]);
  let failure: unknown;

  const result = streamText({
    model: process.env.AI_SCENARIO_MODEL ?? "xai/grok-4.1-fast-non-reasoning",
    output: Output.array({ element: scenarioSchema }),
    instructions: system,
    prompt,
    temperature: 0.9,
    abortSignal,
    // Model errors arrive in the stream rather than being thrown, and the
    // element stream skips them, so keep the error to report at the end.
    onError: ({ error }) => {
      failure = error;
    },
  });

  async function* lines() {
    try {
      // Same result as the buffered version had: trimmed, no empties, at most
      // `count` — applied per element as each one completes.
      let sent = 0;
      for await (const { description } of result.elementStream) {
        const trimmed = description.trim();
        if (!trimmed) continue;
        yield ndjsonLine({ description: trimmed });
        if (++sent >= count) return;
      }
    } catch (e) {
      failure ??= e;
    } finally {
      // A no-op once the model has finished; otherwise it stops generating
      // what would be thrown away.
      abort.abort();
    }
    if (failure !== undefined) {
      yield ndjsonLine({
        error: failure instanceof Error ? failure.message : "Generation failed.",
      });
    }
  }

  const iterator = lines();
  const body = new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });

  return new Response(body.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": NDJSON_CONTENT_TYPE,
      "cache-control": "no-store",
    },
  });
}
