import { convexTest } from "convex-test";
import aggregateTest from "@convex-dev/aggregate/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import betterAuthSchema from "./betterAuth/schema";
import { components, internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import { createAuth } from "./auth";
import { readUserCounts } from "./userCounts";

const modules = import.meta.glob("./**/*.*s");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.*s");
const DAY = 24 * 60 * 60_000;

beforeEach(() => {
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  aggregateTest.register(t, "userCounts");
  return t;
}

/**
 * Better Auth's internal adapter: what sign-up, anonymous sign-in and the
 * anonymous plugin's account linking all write users through.
 */
async function internalAdapter(ctx: MutationCtx) {
  return (await createAuth(ctx).$context).internalAdapter;
}

const guest = (n: number) => ({
  name: `Guest ${n}`,
  email: `g${n}@guests.invalid`,
  emailVerified: false,
  isAnonymous: true,
});
const account = (email: string) => ({
  name: email,
  email,
  emailVerified: true,
});

/** Creates a user straight through the component, as if before the triggers. */
function createUntracked(ctx: MutationCtx, data: Record<string, unknown>) {
  const now = Date.now();
  return ctx.runMutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: { createdAt: now, updatedAt: now, ...data } as never,
    },
  });
}

test("creating an account or a guest counts it", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    const adapter = await internalAdapter(ctx);
    await adapter.createUser(account("ada@example.com"));
    await adapter.createUser(guest(1));
    await adapter.createUser(guest(2));
  });
  expect(await t.run(readUserCounts)).toEqual({ accounts: 1, guests: 2 });
});

test("deleteExpiredGuests takes deleted guests off the count", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    // Created through the trigger-aware path, long enough ago to be expired.
    const now = Date.now();
    vi.setSystemTime(now - 60 * DAY);
    await t.run(async (ctx) => {
      const adapter = await internalAdapter(ctx);
      await adapter.createUser(account("ada@example.com"));
      await adapter.createUser(guest(1));
      await adapter.createUser(guest(2));
    });
    vi.setSystemTime(now);
    expect(await t.run(readUserCounts)).toEqual({ accounts: 1, guests: 2 });

    const result = await t.mutation(internal.cleanup.deleteExpiredGuests, {});
    expect(result.deleted).toBe(2);
    expect(await t.run(readUserCounts)).toEqual({ accounts: 1, guests: 0 });
  } finally {
    vi.useRealTimers();
  }
});

// The anonymous plugin's link flow: sign-up creates the account, then the
// plugin deletes the guest's sessions and the guest, all through the internal
// adapter (better-auth/dist/plugins/anonymous).
test("linking a guest to a new account moves one from guests to accounts", async () => {
  const t = setup();
  const guestId = await t.run(async (ctx) => {
    const adapter = await internalAdapter(ctx);
    await adapter.createUser(account("ada@example.com"));
    return (await adapter.createUser(guest(1))).id;
  });
  expect(await t.run(readUserCounts)).toEqual({ accounts: 1, guests: 1 });

  await t.run(async (ctx) => {
    const adapter = await internalAdapter(ctx);
    await adapter.createUser(account("bea@example.com"));
    await adapter.deleteUserSessions(guestId);
    await adapter.deleteUser(guestId);
  });
  expect(await t.run(readUserCounts)).toEqual({ accounts: 2, guests: 0 });
});

test("an update that flips isAnonymous moves the user between counts", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    const adapter = await internalAdapter(ctx);
    const { id } = await adapter.createUser(guest(1));
    await adapter.updateUser(id, { name: "Renamed" });
    expect(await readUserCounts(ctx)).toEqual({ accounts: 0, guests: 1 });
    await adapter.updateUser(id, { isAnonymous: false });
  });
  expect(await t.run(readUserCounts)).toEqual({ accounts: 1, guests: 0 });
});

test("the backfill counts existing users once, however often it runs", async () => {
  vi.useFakeTimers();
  try {
    const t = setup();
    // More users than one backfill batch, all created before the triggers.
    await t.run(async (ctx) => {
      for (let i = 0; i < 230; i++) await createUntracked(ctx, guest(i));
      for (let i = 0; i < 20; i++) {
        await createUntracked(ctx, account(`a${i}@example.com`));
      }
    });
    expect(await t.run(readUserCounts)).toEqual({ accounts: 0, guests: 0 });

    // One user the trigger already counted before the backfill reached it.
    await t.run(async (ctx) => {
      await (await internalAdapter(ctx)).createUser(account("new@example.com"));
    });

    const first = await t.mutation(internal.migrations.backfillUserCounts, {});
    expect(first).toEqual({ counted: 200, continued: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(readUserCounts)).toEqual({ accounts: 21, guests: 230 });

    await t.mutation(internal.migrations.backfillUserCounts, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.run(readUserCounts)).toEqual({ accounts: 21, guests: 230 });
  } finally {
    vi.useRealTimers();
  }
});

test("a reset backfill repairs counts that drifted", async () => {
  const t = setup();
  await t.run(async (ctx) => {
    const adapter = await internalAdapter(ctx);
    await adapter.createUser(account("ada@example.com"));
    const { id } = await adapter.createUser(guest(1));
    // Deleted behind the triggers' back: the guest stays counted.
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "user", where: [{ field: "_id", value: id }] },
    });
  });
  expect(await t.run(readUserCounts)).toEqual({ accounts: 1, guests: 1 });

  await t.mutation(internal.migrations.backfillUserCounts, { reset: true });
  expect(await t.run(readUserCounts)).toEqual({ accounts: 1, guests: 0 });
});
