import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("adoptGuestPlayers moves a guest's seats onto the account", async () => {
  const t = convexTest(schema, modules);
  const { first, second, otherPlayer } = await t.run(async (ctx) => {
    const first = await ctx.db.insert("games", {
      joinCode: "GST001",
      totalRounds: 3,
      isOpen: true,
      createdBy: "host",
    });
    const second = await ctx.db.insert("games", {
      joinCode: "GST002",
      totalRounds: 3,
      isOpen: false,
      createdBy: "host",
    });
    for (const gameId of [first, second]) {
      await ctx.db.insert("players", {
        userId: "guest",
        gameId,
        displayName: "Ada",
        lastAlive: 0,
      });
    }
    const otherPlayer = await ctx.db.insert("players", {
      userId: "host",
      gameId: first,
      displayName: "Host",
      lastAlive: 0,
    });
    return { first, second, otherPlayer };
  });

  const result = await t.mutation(internal.guests.adoptGuestPlayers, {
    guestUserId: "guest",
    userId: "account",
    displayName: "Ada Lovelace",
  });
  expect(result).toEqual({ moved: 2, duplicates: 0 });

  const rows = await t.run(async (ctx) => ({
    guest: await ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", "guest"))
      .collect(),
    account: await ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", "account"))
      .collect(),
    other: await ctx.db.get(otherPlayer),
  }));
  expect(rows.guest).toEqual([]);
  expect(rows.account.map((p) => p.gameId).sort()).toEqual(
    [first, second].sort(),
  );
  expect(rows.account.map((p) => p.displayName)).toEqual([
    "Ada Lovelace",
    "Ada Lovelace",
  ]);
  // Somebody else's seat in the same game is untouched.
  expect(rows.other?.userId).toBe("host");
  expect(rows.other?.displayName).toBe("Host");
});

test("adoptGuestPlayers keeps the guest's name when the account has none", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "GST003",
      totalRounds: 3,
      isOpen: true,
      createdBy: "host",
    });
    await ctx.db.insert("players", {
      userId: "guest",
      gameId,
      displayName: "Ada",
      lastAlive: 0,
    });
  });

  await t.mutation(internal.guests.adoptGuestPlayers, {
    guestUserId: "guest",
    userId: "account",
  });

  const row = await t.run((ctx) =>
    ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", "account"))
      .unique(),
  );
  expect(row?.displayName).toBe("Ada");
});

test("adoptGuestPlayers retires the guest seat when the account already has one", async () => {
  const t = convexTest(schema, modules);
  const { guestSeat, accountSeat } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "GST004",
      totalRounds: 3,
      isOpen: false,
      createdBy: "host",
    });
    const accountSeat = await ctx.db.insert("players", {
      userId: "account",
      gameId,
      displayName: "Ada",
      lastAlive: 0,
    });
    const guestSeat = await ctx.db.insert("players", {
      userId: "guest",
      gameId,
      displayName: "Ada (phone)",
      lastAlive: 0,
    });
    return { guestSeat, accountSeat };
  });

  const result = await t.mutation(internal.guests.adoptGuestPlayers, {
    guestUserId: "guest",
    userId: "account",
    displayName: "Ada",
  });
  expect(result).toEqual({ moved: 0, duplicates: 1 });

  const seats = await t.run(async (ctx) => ({
    guest: await ctx.db.get(guestSeat),
    account: await ctx.db.get(accountSeat),
  }));
  expect(seats.guest?.active).toBe(false);
  expect(seats.guest?.userId).toBe("guest");
  expect(seats.account?.active).toBeUndefined();
});
