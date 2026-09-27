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

  test("skips analytics, Better Auth and static assets", () => {
    expect(matches("/ingest/e/")).toBe(false);
    expect(matches("/ingest/e/?ver=1.2.3")).toBe(false);
    expect(matches("/ingest/flags/")).toBe(false);
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
