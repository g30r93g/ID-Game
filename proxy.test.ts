// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

// The real env module validates every deployment variable at import time.
// Maintenance mode is off here, so the proxy only ever reads this flag.
vi.mock("@/app/env", () => ({ env: { MAINTENANCE_MODE: "false" } }));

const { default: proxy, config } = await import("./proxy");

const matches = (path: string) =>
  unstable_doesMiddlewareMatch({ config, url: path });

describe("proxy matcher", () => {
  test("runs on the game routes", () => {
    expect(matches("/game")).toBe(true);
    expect(matches("/game/ABC123")).toBe(true);
  });

  test("runs on pages and the admin API", () => {
    expect(matches("/")).toBe(true);
    expect(matches("/sign-in")).toBe(true);
    expect(matches("/api/admin/generate-scenarios")).toBe(true);
  });

  test("runs on every PostHog proxy path, assets included", () => {
    expect(matches("/ingest/e/")).toBe(true);
    expect(matches("/ingest/e/?ver=1.2.3")).toBe(true);
    expect(matches("/ingest/flags/")).toBe(true);
    expect(matches("/ingest/static/array.js")).toBe(true);
  });

  test("skips Better Auth and static assets", () => {
    expect(matches("/api/auth/get-session")).toBe(false);
    expect(matches("/_next/static/x.js")).toBe(false);
    expect(matches("/icon0.svg")).toBe(false);
  });
});

describe("signed-out /game gate", () => {
  test("sends a game link to its invite page", () => {
    const res = proxy(new NextRequest("https://example.com/game/ABC123"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(
      "/join/ABC123",
    );
  });

  test("sends the hub to sign-in", () => {
    const res = proxy(new NextRequest("https://example.com/game"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/game");
  });
});

describe("PostHog proxy", () => {
  const cookie =
    "better-auth.session_token=secret; better-auth.convex_jwt=jwt; maintenance-bypass=bypass";

  const forward = (path: string, method = "GET") =>
    proxy(
      new NextRequest(`https://example.com${path}`, {
        method,
        headers: {
          cookie,
          authorization: "Bearer secret",
          "content-type": "text/plain",
          "user-agent": "test",
        },
      }),
    );

  // What Next does with the proxy's answer: the listed headers are the whole
  // set the request goes on with, and anything left out is deleted.
  const forwardedHeaders = (res: Response) =>
    res.headers.get("x-middleware-override-headers")!.split(",");

  test("rewrites captures to the EU ingestion host, path and query intact", () => {
    const res = forward("/ingest/e/?ver=1.2.3&compression=gzip-js", "POST");
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://eu.i.posthog.com/e/?ver=1.2.3&compression=gzip-js",
    );
    expect(res.headers.get("x-middleware-request-host")).toBe(
      "eu.i.posthog.com",
    );
  });

  test("rewrites static assets to the EU assets host", () => {
    const res = forward("/ingest/static/array.js");
    expect(res.headers.get("x-middleware-rewrite")).toBe(
      "https://eu-assets.i.posthog.com/static/array.js",
    );
    expect(res.headers.get("x-middleware-request-host")).toBe(
      "eu-assets.i.posthog.com",
    );
  });

  test("forwards no cookies or credentials", () => {
    const headers = forwardedHeaders(forward("/ingest/e/"));
    expect(headers).not.toContain("cookie");
    expect(headers).not.toContain("authorization");
    expect(headers).toEqual(
      expect.arrayContaining(["host", "content-type", "user-agent"]),
    );
  });

  test("leaves paths that only start with the same letters alone", () => {
    const res = forward("/ingestion");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});
