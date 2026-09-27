import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import betterAuthSchema from "./betterAuth/schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.*s");

function setup() {
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret");
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  return t;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

type Jwk = { id: string; alg: string; publicKey: string; privateKey: string };

test("getLatestJwks returns the current key rather than rotating it", async () => {
  const t = setup();

  const first = (await t.action(internal.auth.getLatestJwks, {})) as Jwk[];
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({ alg: "RS256" });
  expect(first[0].privateKey).toBeTruthy();

  // Running it again (e.g. for another deploy) hands back the same key, so
  // tokens signed before JWKS was set keep verifying after.
  const again = (await t.action(internal.auth.getLatestJwks, {})) as Jwk[];
  expect(again.map((key) => key.id)).toEqual([first[0].id]);
});

test("JWKS set from getLatestJwks reaches both the auth config and the plugin", async () => {
  const t = setup();
  const jwks = await t.action(internal.auth.getLatestJwks, {});

  vi.stubEnv("JWKS", JSON.stringify(jwks));
  vi.resetModules(); // auth.config.ts reads JWKS when it is first imported
  const { default: authConfig } = await import("./auth.config");
  const { createAuth } = await import("./auth");

  // The config inlines only the public half, under the same key id.
  const [provider] = authConfig.providers;
  const inlined = JSON.parse(
    atob(provider.jwks.replace(/^data:text\/plain;charset=utf-8;base64,/, "")),
  );
  expect(inlined.keys).toEqual([
    expect.objectContaining({ kid: (jwks as Jwk[])[0].id, alg: "RS256" }),
  ]);
  expect(inlined.keys[0]).not.toHaveProperty("d");

  // The plugin throws on construction if the config has static keys and it
  // doesn't, so building the auth instance proves the two agree.
  await t.run(async (ctx) => {
    expect(() => createAuth(ctx)).not.toThrow();
  });
});

test("without JWKS the auth config still points at the JWKS endpoint", async () => {
  vi.stubEnv("CONVEX_SITE_URL", "https://test.convex.site");
  vi.resetModules();
  const { default: authConfig } = await import("./auth.config");
  expect(authConfig.providers[0].jwks).toBe(
    "https://test.convex.site/api/auth/convex/jwks",
  );
});
