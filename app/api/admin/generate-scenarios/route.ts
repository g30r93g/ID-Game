import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { z } from "zod";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";

// Generate candidate scenarios via the Vercel AI Gateway (xAI Grok by default).
// Admin-guarded; returns candidates only — the client reviews them and inserts
// via the existing Convex `admin.createScenarios` mutation.
//
// Requires `AI_GATEWAY_API_KEY` in the environment (auto-provided on Vercel;
// set it in `.env.local` for local dev). Override the model with
// `AI_SCENARIO_MODEL` (defaults to "xai/grok-4").

const bodySchema = z.object({
  instructions: z.string().default(""),
  category: z.string().trim().min(1),
  count: z.number().int().min(1).max(25),
});

const outputSchema = z.object({
  scenarios: z.array(z.object({ description: z.string() })),
});

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

  try {
    const { object } = await generateObject({
      model: process.env.AI_SCENARIO_MODEL ?? "xai/grok-4",
      schema: outputSchema,
      system,
      prompt,
      temperature: 0.9,
    });
    const scenarios = object.scenarios
      .map((s) => ({ description: s.description.trim() }))
      .filter((s) => s.description.length > 0)
      .slice(0, count);
    return NextResponse.json({ scenarios });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed." },
      { status: 502 },
    );
  }
}
