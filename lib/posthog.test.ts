import { beforeEach, expect, test, vi } from "vitest";
import { CONSENT_COOKIE, CONSENT_VERSION, serializeConsent } from "./consent";

// The request's cookies, what `after` was handed, and what posthog-node sent.
let consentCookie: string | undefined;
let afterCallbacks: (() => Promise<void>)[];
const captured: unknown[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === CONSENT_COOKIE && consentCookie !== undefined
        ? { name, value: consentCookie }
        : undefined,
  }),
}));
vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => afterCallbacks.push(callback),
}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    capture(message: unknown) {
      captured.push(message);
    }
    async shutdown() {}
  },
}));
vi.mock("@/app/env", () => ({ env: { NEXT_PUBLIC_POSTHOG_KEY: "phc_test" } }));

const { captureAfterResponse } = await import("./posthog");

const gameJoin = {
  distinctId: "user_1",
  event: "game_join",
  properties: { joinCode: "ABC123" },
};

function choice(analytics: boolean) {
  return serializeConsent({
    v: CONSENT_VERSION,
    analytics,
    functional: false,
    at: 0,
  });
}

beforeEach(() => {
  consentCookie = undefined;
  afterCallbacks = [];
  captured.length = 0;
});

test("sends game_join after the response when analytics is allowed", async () => {
  consentCookie = choice(true);
  await captureAfterResponse(gameJoin);

  expect(captured).toEqual([]);
  await Promise.all(afterCallbacks.map((callback) => callback()));
  expect(captured).toEqual([gameJoin]);
});

test("sends nothing without an analytics yes", async () => {
  for (const cookie of [undefined, choice(false), "not json"]) {
    consentCookie = cookie;
    await captureAfterResponse(gameJoin);
  }
  expect(afterCallbacks).toEqual([]);
  expect(captured).toEqual([]);
});
