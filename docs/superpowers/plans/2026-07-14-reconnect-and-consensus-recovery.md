# Reconnect & Consensus Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rediscover and resume games they dropped out of, and let the remaining connected players recover a stuck round (host disconnect or a non-host who stops responding) via a simple-majority consensus vote.

**Architecture:** Add the missing *read* side to the existing `lastAlive` heartbeat (a `lib/presence.ts` liveness helper). Build a `getMyActiveGames` query + "Jump back in" UI on that. Add a `presenceVotes` table and a single `castPresenceVote` mutation that, once a majority of connected players agree AND the target is server-confirmed stale, either reassigns `gameRounds.hostPlayerId` (host case) or soft-flags the player `active: false` (non-host case). Round-completion gating counts only `active` players so removal unblocks the round.

**Tech Stack:** Convex (`convex/`), Next.js App Router client (`components/`), vitest + convex-test for backend/unit tests. No React test harness exists — client tasks are verified by `npx tsc --noEmit`, `npm run lint`, and a manual dev check.

## Global Constraints

- Heartbeat interval is `15_000` ms (existing client `setInterval`). Do not change it.
- Presence timeout is `45_000` ms (three missed heartbeats) — the single source of truth lives in `lib/presence.ts`.
- Consensus threshold is **strict simple majority of currently-connected players excluding the target**: `agreeingVotes > denominator / 2`.
- Removal execution is **recovery-only**: `castPresenceVote` never mutates state against a target whose heartbeat is currently fresh (server-checked with `Date.now()`).
- Round-completion gating (e.g. "all players guessed") counts only players with `active !== false`. It does **not** exclude merely-disconnected-but-active players — that is what forces the consensus vote rather than silently auto-skipping. (Refines the spec's "active+connected" wording to "active".)
- Removed players are soft-flagged `active: false`, never hard-deleted.
- Lobby-host (game creator) reassignment before round 1 is **out of scope** — there is no `gameRounds` row yet; a dropped creator is recoverable by starting a new game.
- Follow existing code style: no semicolon-free files, 2-space indent, existing import ordering. Convex functions use `v` validators.

---

### Task 1: Presence liveness helper (`lib/presence.ts`)

**Files:**
- Create: `lib/presence.ts`
- Test: `lib/presence.test.ts`

**Interfaces:**
- Produces:
  - `HEARTBEAT_INTERVAL_MS: number` (= 15000)
  - `PRESENCE_TIMEOUT_MS: number` (= 45000)
  - `isConnected(lastAlive: number, now: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/presence.test.ts`:

```ts
import { expect, test } from "vitest";
import { PRESENCE_TIMEOUT_MS, isConnected } from "./presence";

test("isConnected is true when the last heartbeat is within the timeout", () => {
  const now = 1_000_000;
  expect(isConnected(now - 1000, now)).toBe(true);
  expect(isConnected(now, now)).toBe(true);
});

test("isConnected is false once the timeout has elapsed", () => {
  const now = 1_000_000;
  expect(isConnected(now - PRESENCE_TIMEOUT_MS, now)).toBe(false);
  expect(isConnected(now - PRESENCE_TIMEOUT_MS - 1, now)).toBe(false);
  expect(isConnected(0, now)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/presence.test.ts`
Expected: FAIL — `Cannot find module './presence'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/presence.ts`:

```ts
// Presence/liveness constants and helper, shared by the Convex backend and the
// game client. The heartbeat is written by `sendHeartbeat` every
// HEARTBEAT_INTERVAL_MS; a player is considered connected while their most
// recent heartbeat is newer than PRESENCE_TIMEOUT_MS.
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const PRESENCE_TIMEOUT_MS = 45_000;

export function isConnected(lastAlive: number, now: number): boolean {
  return now - lastAlive < PRESENCE_TIMEOUT_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/presence.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/presence.ts lib/presence.test.ts
git commit -m "feat: add presence liveness helper"
```

---

### Task 2: Schema — `presenceVotes` table and `players.active`

**Files:**
- Modify: `convex/schema.ts`
- Test: `convex/presence.test.ts` (new file, grows across later tasks)

**Interfaces:**
- Produces:
  - `players` docs gain `active?: boolean`.
  - New table `presenceVotes` with fields `gameId: Id<"games">`, `roundNumber: number`, `targetPlayerId: Id<"players">`, `voterPlayerId: Id<"players">`, `kind: "reassign-host" | "remove-player"`, `createdAt: number`; indexes `byGameTarget: [gameId, targetPlayerId]`, `byGameRound: [gameId, roundNumber]`.

- [ ] **Step 1: Write the failing test**

Create `convex/presence.test.ts`:

```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("presenceVotes rows and players.active persist", async () => {
  const t = convexTest(schema, modules);
  const read = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "VOTE01",
      totalRounds: 3,
      currentRound: 1,
      isOpen: false,
      createdBy: "host",
    });
    const target = await ctx.db.insert("players", {
      userId: "target",
      gameId,
      displayName: "Target",
      lastAlive: 0,
      active: false,
    });
    const voter = await ctx.db.insert("players", {
      userId: "voter",
      gameId,
      displayName: "Voter",
      lastAlive: 0,
    });
    await ctx.db.insert("presenceVotes", {
      gameId,
      roundNumber: 1,
      targetPlayerId: target,
      voterPlayerId: voter,
      kind: "remove-player",
      createdAt: 123,
    });
    const votes = await ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", gameId).eq("targetPlayerId", target),
      )
      .collect();
    const targetDoc = await ctx.db.get(target);
    return { voteCount: votes.length, active: targetDoc?.active };
  });

  expect(read.voteCount).toBe(1);
  expect(read.active).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/presence.test.ts`
Expected: FAIL — validator rejects the `active` field / `presenceVotes` table is not in the schema.

- [ ] **Step 3: Add the schema changes**

In `convex/schema.ts`, add `active` to the `players` table definition:

```ts
  players: defineTable({
    userId: v.string(),
    gameId: v.id("games"),
    displayName: v.string(),
    lastAlive: v.number(),
    // Set to false when the player is removed from the game by consensus while
    // disconnected. Absent/true = participating. Reset to true on reconnect.
    active: v.optional(v.boolean()),
  })
    .index("byGame", ["gameId"])
    .index("byUser", ["userId"]),
```

And add the new table (place it after the `players` table block, before `games`):

```ts
  // One row per (target, voter) while a disconnect-recovery vote is open. Rows
  // are deleted when the vote resolves or the target reconnects.
  presenceVotes: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    targetPlayerId: v.id("players"),
    voterPlayerId: v.id("players"),
    kind: v.union(v.literal("reassign-host"), v.literal("remove-player")),
    createdAt: v.number(),
  })
    .index("byGameTarget", ["gameId", "targetPlayerId"])
    .index("byGameRound", ["gameId", "roundNumber"]),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/presence.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Regenerate Convex types and typecheck**

Run: `npx convex codegen && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/presence.test.ts convex/_generated
git commit -m "feat: add presenceVotes table and players.active field"
```

---

### Task 3: Heartbeat targets the right game and clears removal

**Files:**
- Modify: `convex/game.ts:18-41` (`sendHeartbeat`)
- Modify: `components/game/index.tsx:77-85` (call site)
- Test: `convex/presence.test.ts`

**Interfaces:**
- Consumes: `players.active` (Task 2).
- Produces: `sendHeartbeat({ gameId: Id<"games"> })` — updates the caller's player row **for that game** with `lastAlive = Date.now()` and `active: true`.

- [ ] **Step 1: Write the failing test**

Append to `convex/presence.test.ts`:

```ts
import { api } from "./_generated/api";

test("sendHeartbeat updates only the specified game's player row and reactivates", async () => {
  const t = convexTest(schema, modules);
  const { g1, g2 } = await t.run(async (ctx) => {
    const g1 = await ctx.db.insert("games", {
      joinCode: "HB0001",
      totalRounds: 3,
      isOpen: true,
      createdBy: "u1",
    });
    const g2 = await ctx.db.insert("games", {
      joinCode: "HB0002",
      totalRounds: 3,
      isOpen: true,
      createdBy: "u1",
    });
    await ctx.db.insert("players", {
      userId: "u1",
      gameId: g1,
      displayName: "P",
      lastAlive: 0,
      active: false,
    });
    await ctx.db.insert("players", {
      userId: "u1",
      gameId: g2,
      displayName: "P",
      lastAlive: 0,
    });
    return { g1, g2 };
  });

  await t.withIdentity({ subject: "u1" }).mutation(api.game.sendHeartbeat, {
    gameId: g1,
  });

  const rows = await t.run(async (ctx) => {
    const p1 = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", g1))
      .first();
    const p2 = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", g2))
      .first();
    return { p1, p2 };
  });

  expect(rows.p1!.lastAlive).toBeGreaterThan(0);
  expect(rows.p1!.active).toBe(true);
  expect(rows.p2!.lastAlive).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/presence.test.ts -t "sendHeartbeat updates only"`
Expected: FAIL — `sendHeartbeat` takes no args / updates the wrong row.

- [ ] **Step 3: Update `sendHeartbeat`**

Replace `convex/game.ts:18-41` with:

```ts
export const sendHeartbeat = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    // Ensure user is authenticated
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to send a heartbeat.");
    }

    // Get the player associated with the user *in this game* (a user may be in
    // several games at once, so byUser().first() is not safe here).
    const player = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", args.gameId))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();

    if (!player) {
      throw new Error("No player found for authed user");
    }

    // A live heartbeat means the player is present: refresh lastAlive and undo
    // any consensus removal (they have reconnected).
    await ctx.db.patch(player._id, { lastAlive: Date.now(), active: true });
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/presence.test.ts -t "sendHeartbeat updates only"`
Expected: PASS.

- [ ] **Step 5: Update the client call site**

In `components/game/index.tsx`, replace the heartbeat effect (lines 77-85) with:

```tsx
  useEffect(() => {
    if (!game) return;
    const intervalId = setInterval(() => {
      sendHeartbeat({ gameId: game._id })
        .then(() => console.log("Heartbeat sent"))
        .catch((error) => console.error("Error sending heartbeat:", error));
    }, 15000);

    return () => clearInterval(intervalId);
  }, [sendHeartbeat, game]);
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add convex/game.ts components/game/index.tsx convex/presence.test.ts
git commit -m "fix: scope heartbeat to its game and clear removal on reconnect"
```

---

### Task 4: `getMyActiveGames` query + client "Jump back in" list

**Files:**
- Modify: `convex/game.ts` (add query near the other queries, e.g. after `getPlayersForGame`)
- Create: `components/active-games.tsx`
- Modify: `components/create-join-game.tsx`
- Test: `convex/presence.test.ts`

**Interfaces:**
- Consumes: `lib/presence.ts` `isConnected`; `players.active` (Task 2).
- Produces: `getMyActiveGames()` → `Array<{ gameId: Id<"games">; joinCode: string; isOpen: boolean; currentRound: number; totalRounds: number; connectedPlayerCount: number }>`.

- [ ] **Step 1: Write the failing test**

Append to `convex/presence.test.ts`:

```ts
test("getMyActiveGames returns only unfinished games the user still belongs to", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    // active game the user is in
    const active = await ctx.db.insert("games", {
      joinCode: "ACT001",
      totalRounds: 5,
      currentRound: 2,
      isOpen: false,
      createdBy: "me",
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: active,
      displayName: "Me",
      lastAlive: Date.now(),
    });
    // finished game (completedAt set) — must be excluded
    const finished = await ctx.db.insert("games", {
      joinCode: "FIN002",
      totalRounds: 5,
      currentRound: 5,
      isOpen: false,
      createdBy: "me",
      completedAt: Date.now(),
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: finished,
      displayName: "Me",
      lastAlive: Date.now(),
    });
    // game the user was removed from (active:false) — must be excluded
    const removed = await ctx.db.insert("games", {
      joinCode: "RMV003",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "other",
    });
    await ctx.db.insert("players", {
      userId: "me",
      gameId: removed,
      displayName: "Me",
      lastAlive: 0,
      active: false,
    });
  });

  const result = await t
    .withIdentity({ subject: "me" })
    .query(api.game.getMyActiveGames, {});

  expect(result.map((g) => g.joinCode)).toEqual(["ACT001"]);
  expect(result[0].currentRound).toBe(2);
  expect(result[0].connectedPlayerCount).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/presence.test.ts -t "getMyActiveGames"`
Expected: FAIL — `getMyActiveGames` is not a function on `api.game`.

- [ ] **Step 3: Implement the query**

Add to `convex/game.ts` (import `isConnected` at the top: `import { isConnected } from "../lib/presence";`):

```ts
export const getMyActiveGames = query({
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated.");
    }

    const now = Date.now();

    const myPlayerRows = await ctx.db
      .query("players")
      .withIndex("byUser", (q) => q.eq("userId", userId))
      .collect();

    const results = [];
    for (const myPlayer of myPlayerRows) {
      // Skip games this user was removed from.
      if (myPlayer.active === false) continue;

      const game = await ctx.db.get(myPlayer.gameId);
      // Skip missing or finished games.
      if (!game || game.completedAt !== undefined) continue;

      const players = await ctx.db
        .query("players")
        .withIndex("byGame", (q) => q.eq("gameId", game._id))
        .collect();
      const connectedPlayerCount = players.filter(
        (p) => p.active !== false && isConnected(p.lastAlive, now),
      ).length;

      results.push({
        gameId: game._id,
        joinCode: game.joinCode,
        isOpen: game.isOpen,
        currentRound: game.currentRound ?? 0,
        totalRounds: game.totalRounds,
        connectedPlayerCount,
      });
    }

    return results;
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/presence.test.ts -t "getMyActiveGames"`
Expected: PASS.

- [ ] **Step 5: Build the client list component**

Create `components/active-games.tsx`:

```tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ActiveGames() {
  const games = useQuery(api.game.getMyActiveGames) ?? [];
  const { replace } = useRouter();

  if (games.length === 0) return null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Jump back in</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {games.map((game) => (
          <Button
            key={game.gameId}
            variant="secondary"
            className="w-full justify-between"
            onClick={() => replace(`/game/${game.joinCode}`)}
          >
            <span className="font-mono">{game.joinCode}</span>
            <span className="text-xs text-muted-foreground">
              {game.isOpen
                ? "In lobby"
                : `Round ${game.currentRound} of ${game.totalRounds}`}
              {" · "}
              {game.connectedPlayerCount} online
            </span>
            <ArrowRight />
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Render it on the `/game` page**

In `components/create-join-game.tsx`, add the import:

```tsx
import ActiveGames from "@/components/active-games";
```

Then render it inside the join view, immediately after `<JoinGame defaultJoinCode={joinCode} />` and before the `<Separator .../>` (around line 50):

```tsx
                <JoinGame defaultJoinCode={joinCode} />
                <ActiveGames />
                <Separator className={"my-3"} />
```

- [ ] **Step 7: Typecheck, lint, commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

```bash
git add convex/game.ts components/active-games.tsx components/create-join-game.tsx convex/presence.test.ts
git commit -m "feat: surface resumable games via getMyActiveGames"
```

---

### Task 5: Extract `pickHost` helper

**Files:**
- Modify: `convex/game.ts` (add `pickHost`, refactor `startNewGameRound:341-382`)
- Test: `convex/presence.test.ts`

**Interfaces:**
- Consumes: `MutationCtx` from `./_generated/server`, `Doc`/`Id` from `./_generated/dataModel`.
- Produces: `pickHost(ctx: MutationCtx, gameId: Id<"games">, candidates: Doc<"players">[]): Promise<Id<"players">>` — returns a least-hosted candidate (random tie-break); throws `"No players available."` if `candidates` is empty.

- [ ] **Step 1: Write the failing test**

Append to `convex/presence.test.ts` (add `import { pickHost } from "./game";` at the top of the file):

```ts
test("pickHost returns the least-hosted candidate", async () => {
  const t = convexTest(schema, modules);
  const chosen = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "HOST01",
      totalRounds: 5,
      currentRound: 1,
      isOpen: false,
      createdBy: "p1",
    });
    const p1 = await ctx.db.insert("players", {
      userId: "p1",
      gameId,
      displayName: "P1",
      lastAlive: 0,
    });
    const p2 = await ctx.db.insert("players", {
      userId: "p2",
      gameId,
      displayName: "P2",
      lastAlive: 0,
    });
    // p1 has hosted round 1 already; p2 has hosted nothing.
    await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId: p1,
      phase: "display-results",
    });
    const p1Doc = (await ctx.db.get(p1))!;
    const p2Doc = (await ctx.db.get(p2))!;
    return { chosen: await pickHost(ctx, gameId, [p1Doc, p2Doc]), p2 };
  });

  expect(chosen.chosen).toBe(chosen.p2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/presence.test.ts -t "pickHost"`
Expected: FAIL — `pickHost` is not exported from `./game`.

- [ ] **Step 3: Add the helper and refactor `startNewGameRound`**

At the top of `convex/game.ts`, ensure these imports exist:

```ts
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
```

Add the helper (near `generateOTP`, after line 16):

```ts
// Pick the least-hosted player from `candidates`, breaking ties at random.
// Host counts are tallied from all of the game's rounds so hosting stays even.
export async function pickHost(
  ctx: MutationCtx,
  gameId: Id<"games">,
  candidates: Doc<"players">[],
): Promise<Id<"players">> {
  if (candidates.length === 0) throw new Error("No players available.");

  const hostCounts = new Map<string, number>();
  const rounds = await ctx.db
    .query("gameRounds")
    .withIndex("byGame", (q) => q.eq("gameId", gameId))
    .collect();
  rounds.forEach((round) => {
    hostCounts.set(
      round.hostPlayerId,
      (hostCounts.get(round.hostPlayerId) || 0) + 1,
    );
  });

  const minHostingCount = Math.min(
    ...candidates.map((p) => hostCounts.get(p._id) || 0),
  );
  const leastHosted = candidates.filter(
    (p) => (hostCounts.get(p._id) || 0) === minHostingCount,
  );

  return leastHosted[Math.floor(Math.random() * leastHosted.length)]._id;
}
```

Then replace the random-selection branch in `startNewGameRound` (lines 340-382, the `if (!player) { ... }` block) with:

```ts
    // if the player is still undefined, we pick the least-hosted player
    if (!player) {
      const players = await ctx.db
        .query("players")
        .withIndex("byGame", (q) => q.eq("gameId", args.game))
        .collect();
      player = await pickHost(ctx, args.game, players);
    }
```

- [ ] **Step 4: Run tests to verify pass (new + existing host logic)**

Run: `npx vitest run convex/presence.test.ts -t "pickHost" && npx vitest run convex/game.test.ts`
Expected: PASS — the new pickHost test passes and all existing `game.test.ts` tests still pass.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add convex/game.ts convex/presence.test.ts
git commit -m "refactor: extract pickHost helper from startNewGameRound"
```

---

### Task 6: Gating counts only active players

**Files:**
- Modify: `convex/game.ts:781-825` (`getGuessesStatusForRound`)
- Test: `convex/presence.test.ts`

**Interfaces:**
- Consumes: `players.active` (Task 2).
- Produces: `getGuessesStatusForRound` treats `active === false` players as not participating, so they neither appear in `playerGuesses` nor block `guessingCompleteByAllUsers`.

- [ ] **Step 1: Write the failing test**

Append to `convex/presence.test.ts`:

```ts
test("getGuessesStatusForRound ignores removed (inactive) non-host players", async () => {
  const t = convexTest(schema, modules);
  const { roundId } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "GST001",
      totalRounds: 1,
      currentRound: 1,
      isOpen: false,
      createdBy: "host",
    });
    const host = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "Host",
      lastAlive: Date.now(),
    });
    const a = await ctx.db.insert("players", {
      userId: "a",
      gameId,
      displayName: "A",
      lastAlive: Date.now(),
    });
    // B was removed by consensus.
    await ctx.db.insert("players", {
      userId: "b",
      gameId,
      displayName: "B",
      lastAlive: 0,
      active: false,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId: host,
      phase: "guess-scenario",
    });
    const grs = await ctx.db.insert("gameRoundScenarios", {
      gameId,
      roundId,
      scenarioId: await ctx.db.insert("scenarios", {
        description: "x",
        category: "General",
      }),
      selected: true,
    });
    // Only A guesses; B is inactive and must not block completion.
    await ctx.db.insert("gameRoundGuesses", {
      gameId,
      roundId,
      scenarioId: grs,
      playerId: a,
    });
    return { roundId };
  });

  const status = await t.query(api.game.getGuessesStatusForRound, { roundId });
  expect(status.guessingCompleteByAllUsers).toBe(true);
  expect(status.playerGuesses.map((p) => p.displayName)).toEqual(["A"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run convex/presence.test.ts -t "ignores removed"`
Expected: FAIL — `guessingCompleteByAllUsers` is `false` because inactive B still counts.

- [ ] **Step 3: Filter inactive players out of the gate**

In `getGuessesStatusForRound`, change the non-host filter (currently `convex/game.ts:796-798`) to also drop inactive players:

```ts
    const nonHostPlayers = players.filter(
      (p) => p._id !== gameRound.hostPlayerId && p.active !== false,
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run convex/presence.test.ts -t "ignores removed"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/game.ts convex/presence.test.ts
git commit -m "feat: exclude removed players from guess-completion gating"
```

---

### Task 7: `castPresenceVote` consensus mutation

**Files:**
- Modify: `convex/game.ts` (add mutation near the end, after `makeGuessForRound`)
- Test: `convex/presence.test.ts`

**Interfaces:**
- Consumes: `isConnected` (Task 1); `pickHost` (Task 5); `presenceVotes` + `players.active` (Task 2).
- Produces: `castPresenceVote({ joinCode: string; targetPlayerId: Id<"players"> })` → `{ resolved: boolean; action?: "reassign-host" | "remove-player" }`. On resolution it patches `gameRounds.hostPlayerId` (host case) or `players.active = false` (non-host case) and deletes the target's votes. Never mutates against a currently-connected target.

- [ ] **Step 1: Write the failing tests**

Append to `convex/presence.test.ts`:

```ts
async function seedRoundGame(
  t: ReturnType<typeof convexTest>,
  players: { userId: string; connected: boolean; host?: boolean }[],
  phase: "guess-scenario" | "create-scenarios" = "guess-scenario",
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const gameId = await ctx.db.insert("games", {
      joinCode: "CPV001",
      totalRounds: 3,
      currentRound: 1,
      isOpen: false,
      createdBy: players[0].userId,
    });
    const ids: Record<string, string> = {};
    for (const p of players) {
      ids[p.userId] = await ctx.db.insert("players", {
        userId: p.userId,
        gameId,
        displayName: p.userId.toUpperCase(),
        lastAlive: p.connected ? now : 0,
      });
    }
    const host = players.find((p) => p.host) ?? players[0];
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId: ids[host.userId] as any,
      phase,
    });
    return { gameId, roundId, ids };
  });
}

test("castPresenceVote reassigns the host when the host is stale and majority agrees", async () => {
  const t = convexTest(schema, modules);
  const { roundId, ids } = await seedRoundGame(t, [
    { userId: "host", connected: false, host: true },
    { userId: "alice", connected: true },
  ]);

  const res = await t
    .withIdentity({ subject: "alice" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["host"] as any,
    });

  expect(res).toEqual({ resolved: true, action: "reassign-host" });
  const round = await t.run((ctx) => ctx.db.get(roundId));
  expect(round!.hostPlayerId).toBe(ids["alice"]);
});

test("castPresenceVote refuses to act on a connected target", async () => {
  const t = convexTest(schema, modules);
  const { roundId, ids } = await seedRoundGame(t, [
    { userId: "host", connected: true, host: true },
    { userId: "alice", connected: true },
  ]);

  const res = await t
    .withIdentity({ subject: "alice" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["host"] as any,
    });

  expect(res.resolved).toBe(false);
  const round = await t.run((ctx) => ctx.db.get(roundId));
  expect(round!.hostPlayerId).toBe(ids["host"]);
});

test("castPresenceVote needs a majority to remove a non-host", async () => {
  const t = convexTest(schema, modules);
  const { ids } = await seedRoundGame(t, [
    { userId: "host", connected: true, host: true },
    { userId: "alice", connected: true },
    { userId: "bob", connected: false },
  ]);

  // Denominator = connected non-target players = {host, alice} = 2, needs > 1.
  const first = await t
    .withIdentity({ subject: "alice" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["bob"] as any,
    });
  expect(first.resolved).toBe(false);

  const second = await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.castPresenceVote, {
      joinCode: "CPV001",
      targetPlayerId: ids["bob"] as any,
    });
  expect(second).toEqual({ resolved: true, action: "remove-player" });

  const bob = await t.run((ctx) => ctx.db.get(ids["bob"] as any));
  expect((bob as any).active).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run convex/presence.test.ts -t "castPresenceVote"`
Expected: FAIL — `castPresenceVote` is not a function on `api.game`.

- [ ] **Step 3: Implement the mutation**

Add to `convex/game.ts`:

```ts
export const castPresenceVote = mutation({
  args: { joinCode: v.string(), targetPlayerId: v.id("players") },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("User must be authenticated to vote.");
    }

    const game = await ctx.db
      .query("games")
      .withIndex("byJoinCode", (q) => q.eq("joinCode", args.joinCode))
      .first();
    if (!game) throw new Error("Game does not exist.");

    const caller = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("userId"), userId))
      .first();
    if (!caller || caller.active === false) {
      throw new Error("Only active players in the game can vote.");
    }

    const target = await ctx.db.get(args.targetPlayerId);
    if (!target || target.gameId !== game._id) {
      throw new Error("Target is not a player in this game.");
    }
    if (target._id === caller._id) {
      throw new Error("You cannot vote about yourself.");
    }

    // Consensus recovery only applies within an active round.
    const currentRoundNumber = game.currentRound;
    if (!currentRoundNumber) {
      return { resolved: false as const };
    }
    const round = await ctx.db
      .query("gameRounds")
      .withIndex("byGameRound", (q) =>
        q.eq("gameId", game._id).eq("roundNumber", currentRoundNumber),
      )
      .unique();
    if (!round) {
      return { resolved: false as const };
    }

    const now = Date.now();

    const existingVotes = await ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", game._id).eq("targetPlayerId", target._id),
      )
      .collect();

    // If the target is back online, cancel any open vote and do nothing.
    if (isConnected(target.lastAlive, now)) {
      await Promise.all(existingVotes.map((voteRow) => ctx.db.delete(voteRow._id)));
      return { resolved: false as const };
    }

    const kind =
      round.hostPlayerId === target._id ? "reassign-host" : "remove-player";

    // Record the caller's vote (once).
    if (!existingVotes.some((voteRow) => voteRow.voterPlayerId === caller._id)) {
      await ctx.db.insert("presenceVotes", {
        gameId: game._id,
        roundNumber: currentRoundNumber,
        targetPlayerId: target._id,
        voterPlayerId: caller._id,
        kind,
        createdAt: now,
      });
    }

    // Tally against currently-connected, active, non-target players.
    const players = await ctx.db
      .query("players")
      .withIndex("byGame", (q) => q.eq("gameId", game._id))
      .collect();
    const connectedNonTarget = players.filter(
      (p) =>
        p._id !== target._id &&
        p.active !== false &&
        isConnected(p.lastAlive, now),
    );
    const eligibleVoterIds = new Set(connectedNonTarget.map((p) => p._id));

    const votes = await ctx.db
      .query("presenceVotes")
      .withIndex("byGameTarget", (q) =>
        q.eq("gameId", game._id).eq("targetPlayerId", target._id),
      )
      .collect();
    const agreeing = new Set(
      votes
        .filter((voteRow) => eligibleVoterIds.has(voteRow.voterPlayerId))
        .map((voteRow) => voteRow.voterPlayerId),
    ).size;

    const denominator = connectedNonTarget.length;
    if (denominator === 0 || agreeing <= denominator / 2) {
      return { resolved: false as const };
    }

    // Majority reached and target confirmed stale — execute.
    if (kind === "reassign-host") {
      const newHostId = await pickHost(ctx, game._id, connectedNonTarget);
      await ctx.db.patch(round._id, { hostPlayerId: newHostId });
    } else {
      await ctx.db.patch(target._id, { active: false });
    }

    await Promise.all(votes.map((voteRow) => ctx.db.delete(voteRow._id)));
    return { resolved: true as const, action: kind };
  },
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run convex/presence.test.ts -t "castPresenceVote"`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add convex/game.ts convex/presence.test.ts
git commit -m "feat: add castPresenceVote consensus recovery mutation"
```

---

### Task 8: Presence dot + roster liveness in the lobby

**Files:**
- Create: `components/game/presence/presence-dot.tsx`
- Modify: `components/game/lobby/index.tsx`
- Modify: `components/game/lobby/player-card.tsx`
- Modify: `components/game/index.tsx` (thread `lastAlive`/`active` into the lobby `players` prop)

**Interfaces:**
- Consumes: `PRESENCE_TIMEOUT_MS` from `lib/presence.ts`.
- Produces: `PresenceDot({ lastAlive, active }: { lastAlive: number; active?: boolean })` — a green/grey dot; grey when disconnected or inactive. `LobbyGamePhase` now accepts `players: { id; name; userId; lastAlive; active? }[]`.

- [ ] **Step 1: Create the presence dot**

Create `components/game/presence/presence-dot.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { PRESENCE_TIMEOUT_MS } from "@/lib/presence";
import { cn } from "@/lib/utils";

// A green dot while the player's heartbeat is fresh, grey once it goes stale or
// the player has been removed. Re-evaluates on a local 5s tick so it updates
// even when no Convex write happens.
export default function PresenceDot({
  lastAlive,
  active,
}: {
  lastAlive: number;
  active?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const connected = active !== false && now - lastAlive < PRESENCE_TIMEOUT_MS;

  return (
    <span
      aria-label={connected ? "Online" : "Offline"}
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        connected ? "bg-green-500" : "bg-muted-foreground/40",
      )}
    />
  );
}
```

- [ ] **Step 2: Thread liveness into the lobby prop type + render the dot**

In `components/game/lobby/index.tsx`, widen the prop type:

```tsx
interface LobbyGamePhaseProps {
  joinCode: string;
  players: {
    id: string;
    name: string;
    userId: string;
    lastAlive: number;
    active?: boolean;
  }[];
  isHost: boolean;
  advanceGame: () => void;
}
```

Update the destructure of `.map` and pass the values through to `PlayerCard` (replace the `players.map(...)` block at lines 81-90):

```tsx
            {players.map(({ id, name, userId, lastAlive, active }) => {
              return (
                <PlayerCard
                  key={id}
                  playerId={id}
                  playerUserId={userId}
                  playerName={name}
                  lastAlive={lastAlive}
                  active={active}
                />
              );
            })}
```

- [ ] **Step 3: Render the dot inside `PlayerCard`**

In `components/game/lobby/player-card.tsx`, add the import (after the existing imports):

```tsx
import PresenceDot from "@/components/game/presence/presence-dot";
```

Replace the props interface + destructure (lines 7-17) with:

```tsx
interface PlayerCardProps {
  playerId: string;
  playerUserId: string;
  playerName: string;
  lastAlive: number;
  active?: boolean;
}

export default function PlayerCard({
  playerId,
  playerUserId,
  playerName,
  lastAlive,
  active,
}: PlayerCardProps) {
```

Replace the `<CardTitle>...</CardTitle>` block (lines 34-55) so a dot sits before the name:

```tsx
        <CardTitle className="flex flex-row items-center gap-2">
          <PresenceDot lastAlive={lastAlive} active={active} />
          {currentUserIsHostPlayer() ? (
            <Editable.Root
              key={playerId}
              defaultValue={playerName}
              // onSubmit={(value) => updatePlayerDisplayName(value)}
              className="flex flex-1 flex-row items-center gap-1.5"
            >
              <Editable.Area className="flex-1">
                <Editable.Preview className={"w-full rounded-md px-1.5 py-1"} />
                <Editable.Input className="px-1.5 py-1" />
              </Editable.Area>
              <Editable.Trigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <Edit />
                </Button>
              </Editable.Trigger>
            </Editable.Root>
          ) : (
            playerName
          )}
        </CardTitle>
```

- [ ] **Step 4: Pass the fields from the game shell**

In `components/game/index.tsx`, update the lobby `players` mapping (lines 254-260) to include the liveness fields:

```tsx
          players={players.map((p) => {
            return {
              id: p._id,
              name: p.displayName,
              userId: p.userId,
              lastAlive: p.lastAlive,
              active: p.active,
            };
          })}
```

- [ ] **Step 5: Typecheck, lint, manual check**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

Manual: run `npm run dev` and `npx convex dev` in a second shell, open a game lobby in two browser profiles, confirm both players show a green dot; close one tab and confirm its dot goes grey within ~45s in the other.

- [ ] **Step 6: Commit**

```bash
git add components/game/presence/presence-dot.tsx components/game/lobby/index.tsx components/game/lobby/player-card.tsx components/game/index.tsx
git commit -m "feat: show per-player online/offline dots in the lobby"
```

---

### Task 9: Disconnect prompt + voting UI in the game shell

**Files:**
- Create: `components/game/presence/disconnect-prompt.tsx`
- Modify: `components/game/index.tsx` (mount the prompt; add the `castPresenceVote` mutation hook)

**Interfaces:**
- Consumes: `getPlayersForGame`, `getCurrentGameRound`, `getPlayerForCurrentUserForGame` (already queried in the shell); `api.game.castPresenceVote` (Task 7); `PRESENCE_TIMEOUT_MS` (Task 1).
- Produces: `DisconnectPrompt` — renders a card for each currently-stale player (other than the viewer) offering to reassign host / remove them, with an Agree button and a live "N agreed" count.

- [ ] **Step 1: Build the prompt component**

Create `components/game/presence/disconnect-prompt.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { PRESENCE_TIMEOUT_MS } from "@/lib/presence";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Shows a recovery prompt for each player who has gone stale. Any connected
// player can Agree; the backend resolves once a majority agree (and the target
// is still stale). Manual "flag" is implicit here — the prompt appears as soon
// as a player crosses the staleness threshold client-side, and pressing Agree
// pre-collects votes even if the 45s server threshold was only just reached.
export default function DisconnectPrompt({
  joinCode,
  players,
  hostPlayerId,
  viewerPlayerId,
}: {
  joinCode: string;
  players: Doc<"players">[];
  hostPlayerId: string | undefined;
  viewerPlayerId: string | undefined;
}) {
  const castPresenceVote = useMutation(api.game.castPresenceVote);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const stale = players.filter(
    (p) =>
      p._id !== viewerPlayerId &&
      p.active !== false &&
      now - p.lastAlive >= PRESENCE_TIMEOUT_MS,
  );

  if (stale.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {stale.map((p) => (
        <StaleCard
          key={p._id}
          player={p}
          isHost={p._id === hostPlayerId}
          onAgree={async () => {
            try {
              const res = await castPresenceVote({
                joinCode,
                targetPlayerId: p._id,
              });
              if (res.resolved) {
                toast(
                  res.action === "reassign-host"
                    ? "Host reassigned"
                    : `${p.displayName} was removed`,
                );
              } else {
                toast("Vote recorded", {
                  description: "Waiting for the other players to agree.",
                });
              }
            } catch (error) {
              toast("Couldn't record your vote", {
                description: (error as Error).message,
              });
            }
          }}
        />
      ))}
    </div>
  );
}

function StaleCard({
  player,
  isHost,
  onAgree,
}: {
  player: Doc<"players">;
  isHost: boolean;
  onAgree: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10">
      <span>
        <strong>{player.displayName}</strong> seems disconnected.{" "}
        {isHost ? "Reassign the host?" : "Skip them so the round can continue?"}
      </span>
      <Button size="sm" variant="secondary" onClick={onAgree}>
        Agree
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Mount it in the game shell**

In `components/game/index.tsx`:

Add the import:

```tsx
import DisconnectPrompt from "@/components/game/presence/disconnect-prompt";
```

Render it at the top of the toolbar row (inside the `<div className={"shrink-0 w-full flex flex-row gap-2"}>` block at line 332 — place the prompt just above that row so it spans full width). Concretely, wrap the existing toolbar and the prompt:

```tsx
      {game && !game.isOpen && currentRound && (
        <DisconnectPrompt
          joinCode={game.joinCode}
          players={players}
          hostPlayerId={currentRound.hostPlayerId}
          viewerPlayerId={userPlayer?._id}
        />
      )}
      <div className={"shrink-0 w-full flex flex-row gap-2"}>
```

(`players` here is the full `Doc<"players">[]` from `getPlayersForGame`, which already carries `lastAlive` and `active`.)

- [ ] **Step 3: Typecheck, lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual end-to-end check**

With `npm run dev` + `npx convex dev`:
1. Start a game with 3 browser profiles; advance into a round so a host exists.
2. Close the host tab. Within ~45s the other two see "…seems disconnected. Reassign the host?".
3. Both press Agree → toast "Host reassigned"; one of the remaining players now has the host UI and can advance the round.
4. In a fresh game, close a non-host guesser's tab during guess-scenario → remaining players see "Skip them?"; majority Agree → round advances without the dropped player.
5. Reopen the removed player's tab → their heartbeat resumes, dot goes green, and they participate in the next round.

- [ ] **Step 5: Commit**

```bash
git add components/game/presence/disconnect-prompt.tsx components/game/index.tsx
git commit -m "feat: consensus disconnect prompt and voting in game shell"
```

---

### Task 10: Final verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Full backend suite**

Run: `npx vitest run`
Expected: all tests pass (28 pre-existing + the new presence tests).

- [ ] **Step 2: Types + lint + production build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean typecheck, no lint errors, successful Next.js build.

- [ ] **Step 3: Confirm the earlier duplicate-game fix is intact**

Verify `components/create-game.tsx` still guards on `form.formState.isSubmitting` and `convex/game.ts` `createGame` still returns the existing open game (these shipped separately but live on this branch). If they were reverted by a rebase, re-apply before opening the PR.

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin feat/reconnect-and-consensus-recovery
gh pr create --fill
```
