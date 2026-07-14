import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Generate candidate scenarios via xAI Grok (OpenAI-compatible chat endpoint).
 * Runs in Convex's default action runtime — `fetch` is available, so no SDK or
 * Node runtime is needed. Returns candidates for the admin to review + insert;
 * it does NOT write to the database.
 *
 * Requires deployment env vars:
 *   XAI_API_KEY   (required)
 *   XAI_MODEL     (optional, defaults to "grok-4")
 */
export const generateScenarios = action({
  args: {
    instructions: v.string(),
    category: v.string(),
    count: v.number(),
  },
  handler: async (
    ctx,
    { instructions, category, count },
  ): Promise<{ description: string }[]> => {
    const user = await ctx.runQuery(api.auth.getCurrentUser, {});
    if (!user || user.role !== "admin") {
      throw new Error("Admin access required.");
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "XAI_API_KEY is not set on the Convex deployment. Set it with `npx convex env set XAI_API_KEY <key>`.",
      );
    }
    const model = process.env.XAI_MODEL ?? "grok-4";
    const n = Math.max(1, Math.min(25, Math.floor(count)));

    const system =
      `You write short "Most likely to..." prompts for an adult (18+) party game called The ID Game, played by consenting adults who are calling out their friends. ` +
      `Each item is a single sentence that completes the phrase "Most likely to...". They can be cheeky, risqué, crude, and lewd — this is an adult game — but must NEVER involve minors, non-consent, illegal acts, real named individuals, or hateful/harassing content toward protected groups. ` +
      `Target category: "${category}".`;
    const userMsg =
      `Generate exactly ${n} distinct, punchy scenarios for the "${category}" category. ` +
      `Admin guidance: ${instructions.trim() || "(none)"}. ` +
      `Respond ONLY as JSON in the form {"scenarios": [{"description": "..."}]} with no extra commentary.`;

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
        response_format: { type: "json_object" },
        temperature: 0.9,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `xAI request failed (${res.status}): ${text.slice(0, 300)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";

    let parsed: { scenarios?: { description?: string }[] };
    try {
      parsed = JSON.parse(content) as { scenarios?: { description?: string }[] };
    } catch {
      throw new Error("xAI returned output that was not valid JSON.");
    }

    return (parsed.scenarios ?? [])
      .map((s) => ({ description: (s.description ?? "").trim() }))
      .filter((s) => s.description.length > 0)
      .slice(0, n);
  },
});
