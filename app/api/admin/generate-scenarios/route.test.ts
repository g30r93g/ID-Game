// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { ConvexError } from "convex/values";
import { ADMIN_ACCESS_REQUIRED } from "@/lib/admin/access";
import { readNdjson } from "@/lib/ndjson";

// The provider package isn't a direct dependency, so take its stream part type
// from the mock model.
type StreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type LanguageModelV4StreamPart =
  StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;

const auth = vi.hoisted(() => ({
  user: { role: "admin" } as { role: string } | null,
  // Set to make getCategoryBrief fail for a reason other than access.
  failure: undefined as Error | undefined,
}));
// The route's only Convex call is getCategoryBrief, whose requireAdmin is
// also the admin check; this mimics its refusal (see convex/adminAuth.ts).
vi.mock("@/lib/auth-server", () => ({
  fetchAuthQuery: vi.fn(async () => {
    if (auth.failure) throw auth.failure;
    if (auth.user?.role !== "admin") {
      throw new ConvexError(ADMIN_ACCESS_REQUIRED);
    }
    return { brief: "" };
  }),
}));

// Swap the gateway model id for a scripted one; everything else about the
// streamText call is the route's own.
const model = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("ai", async (importOriginal) => {
  const ai = await importOriginal<typeof import("ai")>();
  return {
    ...ai,
    streamText: ((options) =>
      ai.streamText({
        ...options,
        model: model.current as typeof options.model,
      })) as typeof ai.streamText,
  };
});

const { POST } = await import("./route");

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

/** A model that streams `text` in the given pieces, then optional extra parts. */
function scriptModel(pieces: string[], tail: LanguageModelV4StreamPart[] = []) {
  model.current = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t" },
        ...pieces.map(
          (delta): LanguageModelV4StreamPart => ({
            type: "text-delta",
            id: "t",
            delta,
          }),
        ),
        ...tail,
        ...(tail.some((part) => part.type === "error")
          ? []
          : ([
              { type: "text-end", id: "t" },
              {
                type: "finish",
                usage,
                finishReason: { unified: "stop", raw: "stop" },
              },
            ] satisfies LanguageModelV4StreamPart[])),
      ]),
    }),
  });
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/generate-scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function lines(res: Response) {
  const values: unknown[] = [];
  for await (const value of readNdjson(res.body!)) values.push(value);
  return values;
}

beforeEach(() => {
  auth.user = { role: "admin" };
  auth.failure = undefined;
});

describe("POST /api/admin/generate-scenarios", () => {
  test("streams trimmed, non-empty scenarios, one NDJSON line each", async () => {
    scriptModel([
      '{"elements":[{"description":"  Most likely to ',
      'nap "},{"description":"   "},',
      '{"description":"Most likely to sing"}]}',
    ]);
    const res = await post({ category: "Silly", count: 5 });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson");
    expect(await lines(res)).toEqual([
      { description: "Most likely to nap" },
      { description: "Most likely to sing" },
    ]);
  });

  test("stops at `count`", async () => {
    scriptModel([
      '{"elements":[{"description":"a"},',
      '{"description":"b"},{"description":"c"}]}',
    ]);
    const res = await post({ category: "Silly", count: 2 });
    expect(await lines(res)).toEqual([
      { description: "a" },
      { description: "b" },
    ]);
  });

  test("ends with an error line when the model fails mid-stream", async () => {
    scriptModel(
      ['{"elements":[{"description":"a"},{"description":"b'],
      [{ type: "error", error: new Error("Gateway fell over") }],
    );
    const res = await post({ category: "Silly", count: 5 });

    expect(res.status).toBe(200);
    expect(await lines(res)).toEqual([
      { description: "a" },
      { error: "Gateway fell over" },
    ]);
  });

  test("rejects a non-admin with 403 JSON before generating", async () => {
    auth.user = { role: "user" };
    scriptModel([]);
    const res = await post({ category: "Silly", count: 5 });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access required." });
  });

  test("rejects a signed-out caller with 403 JSON", async () => {
    auth.user = null;
    scriptModel([]);
    const res = await post({ category: "Silly", count: 5 });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access required." });
  });

  test("doesn't turn other brief failures into a 403", async () => {
    auth.failure = new Error("[Request ID: abc] Server Error");
    scriptModel([]);

    await expect(post({ category: "Silly", count: 5 })).rejects.toThrow(
      "Server Error",
    );
  });

  test("rejects a bad body with 400 JSON", async () => {
    const res = await post({ category: "", count: 99 });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid request." });
  });
});
