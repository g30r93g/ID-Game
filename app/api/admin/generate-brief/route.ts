import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";

// Meta-prompt: draft a reusable STYLE BRIEF for a category. The admin reviews /
// edits it, then saves it (admin.setCategoryBrief); later generations use the
// brief. Admin-guarded. Uses the same AI Gateway config as generate-scenarios.

const bodySchema = z.object({
  category: z.string().trim().min(1),
  hint: z.string().default(""),
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
  const { category, hint } = parsed.data;

  const system =
    `You are a prompt engineer for an adult (18+) party game called The ID Game, whose items complete the phrase "Most likely to...". ` +
    `Write a concise STYLE BRIEF (3–6 sentences) that will steer future generation of scenarios for one category: describe the tone, spice level, style, typical length, and include 2–3 example lines. ` +
    `The game is crude/lewd by design, but the brief must keep the hard limits: never minors, non-consent, illegal acts, real named individuals, or hateful/harassing content. ` +
    `Output only the brief as plain prose — no headings, preamble, or quotes.`;
  const prompt =
    `Category: "${category}". ` +
    `Optional direction from the admin: ${hint.trim() || "(none)"}. ` +
    `Write the style brief.`;

  try {
    const { text } = await generateText({
      model: process.env.AI_SCENARIO_MODEL ?? "xai/grok-4",
      system,
      prompt,
      temperature: 0.8,
    });
    return NextResponse.json({ brief: text.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed." },
      { status: 502 },
    );
  }
}
