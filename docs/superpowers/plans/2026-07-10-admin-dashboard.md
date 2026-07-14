# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-only dashboard at `/admin` to view users, games, and scenarios with stat cards, paginated shadcn data tables, scenario sorting, and a form to add scenarios.

**Architecture:** Additive Convex schema changes (game lifecycle timestamps, a denormalized scenario popularity counter, a Better Auth `role` field via the admin plugin). Metrics math lives in pure, unit-tested helpers (`lib/admin/metrics.ts`); Convex admin queries compose those helpers behind a `requireAdmin` guard. The UI is a Next.js App Router route group guarded server-side, built from shadcn components, with numbered (server-driven, cursor-stack) pagination.

**Tech Stack:** Next.js 16 (App Router) · Convex · Better Auth (`@convex-dev/better-auth`) + admin plugin · `@convex-dev/migrations` · shadcn/ui + Tailwind v4 · react-hook-form + zod · vitest + convex-test.

## Global Constraints

- Package manager: **pnpm**. Node `>=20.19`.
- Admin identity to seed: **georgegorzynski@me.com**.
- 14-day window constant: `14 * 24 * 60 * 60 * 1000` ms (define once in `lib/admin/metrics.ts` as `FOURTEEN_DAYS_MS`).
- Every admin Convex query/mutation calls `requireAdmin(ctx)` as its first line.
- New schema fields are `v.optional(...)` for safe rollout against existing documents; absent values are treated as `0`/unset in code.
- Follow existing patterns: Convex functions use `query`/`mutation`/`internalMutation` from `convex/_generated/server`; auth uses `ctx.auth.getUserIdentity()` and the `authComponent` from `convex/auth.ts`.
- Commit after every task. Work stays on branch `feat/admin-dashboard`.
- Do NOT run `git push` or open a PR unless the user asks.

---

## File map

**Create**
- `vitest.config.ts` — test runner config.
- `lib/admin/metrics.ts` — pure metrics/formatting helpers.
- `lib/admin/metrics.test.ts` — vitest unit tests for helpers.
- `convex/game.test.ts` — convex-test tests for write-points.
- `convex/adminAuth.ts` — `requireAdmin` helper.
- `convex/admin.ts` — admin queries + `createScenario` + `grantAdmin` internal mutation.
- `convex/admin.test.ts` — convex-test tests for admin query "core" functions.
- `convex/migrations.ts` — backfill migrations.
- `app/admin/layout.tsx` — server guard + nav shell.
- `app/admin/page.tsx` — redirect to `/admin/users`.
- `app/admin/users/page.tsx`, `app/admin/games/page.tsx`, `app/admin/scenarios/page.tsx`.
- `components/admin/stat-card.tsx`, `components/admin/admin-data-table.tsx`, `components/admin/add-scenario-dialog.tsx`.

**Modify**
- `package.json` — devDeps + test scripts.
- `convex/auth.ts` — add `admin()` plugin; export `createAuthOptions` usage for `grantAdmin`.
- `lib/auth-client.ts` — add `adminClient()`.
- `convex/betterAuth/generatedSchema.ts` — regenerated to include `role`.
- `convex/schema.ts` — game timestamps/indexes, scenario counter/index.
- `convex/convex.config.ts` — register migrations component.
- `convex/game.ts` — write `startedAt`, `completedAt`, increment `timesSelected`.
- `convex/auth.ts` (`getCurrentUser`) — expose `role`.

---

## Task 0: Test harness (vitest + convex-test)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Test: `convex/smoke.test.ts` (temporary, deleted at end of task)

**Interfaces:**
- Produces: a working `pnpm test` command; `convexTest(schema, modules)` proven to load the Convex module graph.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
pnpm add -D vitest convex-test @edge-runtime/vm
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write a smoke test that loads the real module graph**

Create `convex/smoke.test.ts`:
```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";

const modules = import.meta.glob("./**/*.*s");

test("convex-test can seed and read our own tables", async () => {
  const t = convexTest(schema, modules);
  const id = await t.run(async (ctx) =>
    ctx.db.insert("scenarios", { description: "d", category: "c" }),
  );
  const doc = await t.run((ctx) => ctx.db.get(id));
  expect(doc?.description).toBe("d");
});
```

- [ ] **Step 5: Run the smoke test**

Run: `pnpm test convex/smoke.test.ts`
Expected: PASS. (If it fails because a Better Auth/Resend component function is *invoked* during load, it will name the function — none of our tested functions call components, so a load-only failure means the glob is pulling a component module that self-invokes; narrow the glob to `["./*.ts", "./betterAuth/**/*.ts"]`. The insert/read above touches no component.)

- [ ] **Step 6: Delete the smoke test and commit**

```bash
rm convex/smoke.test.ts
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "test: add vitest + convex-test harness"
```

---

## Task 1: Pure metrics & formatting helpers

**Files:**
- Create: `lib/admin/metrics.ts`
- Test: `lib/admin/metrics.test.ts`

**Interfaces:**
- Produces:
  - `FOURTEEN_DAYS_MS: number`
  - `isActiveNow(game: { isOpen: boolean }): boolean`
  - `withinWindow(ts: number | undefined, now: number, windowMs?: number): boolean`
  - `gameDurationMs(game: { startedAt?: number; completedAt?: number }): number | null`
  - `computeGameStats(games, now): { activeNow, started14d, completed14d, avgLengthMs: number | null }`
  - `activePlayerCount(players: { userId: string; _creationTime: number }[], now): number`
  - `shouldSetCompletedAt(toPhase: string, roundNumber: number, totalRounds: number): boolean`
  - `type ScenarioSort = "popular-desc" | "popular-asc" | "newest" | "oldest"`
  - `scenarioSortToQuery(sort): { index: "byTimesSelected" | "by_creation_time"; order: "asc" | "desc" }`
  - `formatDuration(ms: number | null): string`
  - `groupTimesSelected(rows: { scenarioId: string }[]): Map<string, number>`

- [ ] **Step 1: Write the failing tests**

Create `lib/admin/metrics.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  activePlayerCount,
  computeGameStats,
  formatDuration,
  gameDurationMs,
  groupTimesSelected,
  scenarioSortToQuery,
  shouldSetCompletedAt,
  withinWindow,
  FOURTEEN_DAYS_MS,
} from "./metrics";

const NOW = 1_000_000_000_000;

describe("withinWindow", () => {
  it("is false for undefined", () => expect(withinWindow(undefined, NOW)).toBe(false));
  it("is true just inside the window", () =>
    expect(withinWindow(NOW - FOURTEEN_DAYS_MS + 1, NOW)).toBe(true));
  it("is false just outside the window", () =>
    expect(withinWindow(NOW - FOURTEEN_DAYS_MS - 1, NOW)).toBe(false));
});

describe("gameDurationMs", () => {
  it("returns null when not finished", () =>
    expect(gameDurationMs({ startedAt: 5 })).toBeNull());
  it("returns the delta when finished", () =>
    expect(gameDurationMs({ startedAt: 5, completedAt: 20 })).toBe(15));
});

describe("computeGameStats", () => {
  it("counts active, started, completed and averages durations in-window", () => {
    const games = [
      { isOpen: true, startedAt: NOW - 1000 },
      { isOpen: false, startedAt: NOW - 2000, completedAt: NOW - 1000 }, // dur 1000
      { isOpen: false, startedAt: NOW - 5000, completedAt: NOW - 1000 }, // dur 4000
      { isOpen: false, startedAt: 1, completedAt: 2 }, // completed long ago -> excluded
    ];
    expect(computeGameStats(games, NOW)).toEqual({
      activeNow: 1,
      started14d: 3,
      completed14d: 2,
      avgLengthMs: 2500,
    });
  });
  it("returns null average when nothing completed in-window", () => {
    expect(computeGameStats([{ isOpen: true }], NOW).avgLengthMs).toBeNull();
  });
});

describe("activePlayerCount", () => {
  it("dedupes users and ignores old rows", () => {
    const players = [
      { userId: "a", _creationTime: NOW - 1000 },
      { userId: "a", _creationTime: NOW - 2000 },
      { userId: "b", _creationTime: NOW - 3000 },
      { userId: "c", _creationTime: NOW - FOURTEEN_DAYS_MS - 1 },
    ];
    expect(activePlayerCount(players, NOW)).toBe(2);
  });
});

describe("shouldSetCompletedAt", () => {
  it("true on final round finishing", () => expect(shouldSetCompletedAt("finished", 3, 3)).toBe(true));
  it("false on a non-final round", () => expect(shouldSetCompletedAt("finished", 2, 3)).toBe(false));
  it("false for a non-finished phase", () => expect(shouldSetCompletedAt("rank-players", 3, 3)).toBe(false));
  it("false for infinite games", () => expect(shouldSetCompletedAt("finished", 1, 0)).toBe(false));
});

describe("scenarioSortToQuery", () => {
  it("maps popularity and age", () => {
    expect(scenarioSortToQuery("popular-desc")).toEqual({ index: "byTimesSelected", order: "desc" });
    expect(scenarioSortToQuery("popular-asc")).toEqual({ index: "byTimesSelected", order: "asc" });
    expect(scenarioSortToQuery("newest")).toEqual({ index: "by_creation_time", order: "desc" });
    expect(scenarioSortToQuery("oldest")).toEqual({ index: "by_creation_time", order: "asc" });
  });
});

describe("formatDuration", () => {
  it("renders em dash for null", () => expect(formatDuration(null)).toBe("—"));
  it("renders m/s", () => expect(formatDuration(664_000)).toBe("11m 04s"));
});

describe("groupTimesSelected", () => {
  it("counts per scenarioId", () => {
    const m = groupTimesSelected([{ scenarioId: "x" }, { scenarioId: "x" }, { scenarioId: "y" }]);
    expect(m.get("x")).toBe(2);
    expect(m.get("y")).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/admin/metrics.test.ts`
Expected: FAIL — `Cannot find module './metrics'`.

- [ ] **Step 3: Implement `lib/admin/metrics.ts`**

```ts
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export function isActiveNow(game: { isOpen: boolean }): boolean {
  return game.isOpen === true;
}

export function withinWindow(
  ts: number | undefined,
  now: number,
  windowMs: number = FOURTEEN_DAYS_MS,
): boolean {
  return ts !== undefined && ts >= now - windowMs;
}

export function gameDurationMs(game: {
  startedAt?: number;
  completedAt?: number;
}): number | null {
  if (game.startedAt === undefined || game.completedAt === undefined) return null;
  return game.completedAt - game.startedAt;
}

export type GameLike = { isOpen: boolean; startedAt?: number; completedAt?: number };

export function computeGameStats(games: GameLike[], now: number) {
  const activeNow = games.filter(isActiveNow).length;
  const started14d = games.filter((g) => withinWindow(g.startedAt, now)).length;
  const completedInWindow = games.filter((g) => withinWindow(g.completedAt, now));
  const durations = completedInWindow
    .map(gameDurationMs)
    .filter((d): d is number => d !== null && d >= 0);
  const avgLengthMs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  return {
    activeNow,
    started14d,
    completed14d: completedInWindow.length,
    avgLengthMs,
  };
}

export function activePlayerCount(
  players: { userId: string; _creationTime: number }[],
  now: number,
): number {
  const recent = players.filter((p) => withinWindow(p._creationTime, now));
  return new Set(recent.map((p) => p.userId)).size;
}

export function shouldSetCompletedAt(
  toPhase: string,
  roundNumber: number,
  totalRounds: number,
): boolean {
  return toPhase === "finished" && totalRounds > 0 && roundNumber === totalRounds;
}

export type ScenarioSort = "popular-desc" | "popular-asc" | "newest" | "oldest";

export function scenarioSortToQuery(sort: ScenarioSort): {
  index: "byTimesSelected" | "by_creation_time";
  order: "asc" | "desc";
} {
  switch (sort) {
    case "popular-desc":
      return { index: "byTimesSelected", order: "desc" };
    case "popular-asc":
      return { index: "byTimesSelected", order: "asc" };
    case "oldest":
      return { index: "by_creation_time", order: "asc" };
    case "newest":
    default:
      return { index: "by_creation_time", order: "desc" };
  }
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

export function groupTimesSelected(rows: { scenarioId: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.scenarioId, (counts.get(r.scenarioId) ?? 0) + 1);
  return counts;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/admin/metrics.test.ts`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add lib/admin/metrics.ts lib/admin/metrics.test.ts
git commit -m "feat: admin metrics helpers with unit tests"
```

---

## Task 2: Better Auth admin plugin + `role` field

**Files:**
- Modify: `convex/auth.ts` (plugins array; export nothing new)
- Modify: `lib/auth-client.ts`
- Modify: `convex/betterAuth/generatedSchema.ts` (regenerated)

**Interfaces:**
- Produces: `user.role` field (default `"user"`) available in the Better Auth `user` document; client `authClient.admin.*` methods.

- [ ] **Step 1: Add the admin plugin server-side**

In `convex/auth.ts`, update the import that pulls `emailOTP`:
```ts
import { admin, emailOTP } from "better-auth/plugins";
```
Then in the `plugins: [ ... ]` array inside `createAuthOptions`, add `admin()` as the first plugin:
```ts
plugins: [
  admin(),
  emailOTP({ /* unchanged */ }),
  passkey({ /* unchanged */ }),
],
```

- [ ] **Step 2: Add the admin client plugin**

In `lib/auth-client.ts`:
```ts
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { emailOTPClient, adminClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [convexClient(), emailOTPClient(), passkeyClient(), adminClient()],
});
```

- [ ] **Step 3: Regenerate the Better Auth schema**

Run:
```bash
cd convex/betterAuth && npx auth generate --output generatedSchema.ts && cd ../..
```
Expected: `convex/betterAuth/generatedSchema.ts` now defines a `role` field (and `banned`, `banReason`, `banExpires`) on the `user` table. The custom indexes in `convex/betterAuth/schema.ts` are untouched (they live in `schema.ts`, not the generated file).

- [ ] **Step 4: Verify the field exists**

Run: `grep -n "role" convex/betterAuth/generatedSchema.ts`
Expected: a line adding `role` to the `user` table definition.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add convex/auth.ts lib/auth-client.ts convex/betterAuth/generatedSchema.ts
git commit -m "feat: enable Better Auth admin plugin (role field)"
```

---

## Task 3: Schema fields, indexes, and migrations component

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/convex.config.ts`

**Interfaces:**
- Produces: `games.startedAt?`, `games.completedAt?`, indexes `byIsOpen`/`byStartedAt`/`byCompletedAt`; `scenarios.timesSelected?` + index `byTimesSelected`; the `migrations` component registered.

- [ ] **Step 1: Update `convex/schema.ts`**

Replace the `games` and `scenarios` table definitions with:
```ts
  games: defineTable({
    joinCode: v.string(),
    totalRounds: v.number(),
    currentRound: v.optional(v.number()),
    isOpen: v.boolean(),
    createdBy: v.string(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("byJoinCode", ["joinCode"])
    .index("byIsOpen", ["isOpen"])
    .index("byStartedAt", ["startedAt"])
    .index("byCompletedAt", ["completedAt"]),

  scenarios: defineTable({
    description: v.string(),
    category: v.string(),
    timesSelected: v.optional(v.number()),
  })
    .index("byCategory", ["category"])
    .index("byTimesSelected", ["timesSelected"]),
```

- [ ] **Step 2: Register the migrations component**

In `convex/convex.config.ts`:
```ts
import { defineApp } from "convex/server";
import resend from "@convex-dev/resend/convex.config";
import migrations from "@convex-dev/migrations/convex.config";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(resend);
app.use(migrations);

export default app;
```

- [ ] **Step 3: Push the schema to the dev deployment**

Run: `pnpm exec convex dev --once`
Expected: schema pushes successfully (existing docs conform because new fields are optional); generated types update.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/convex.config.ts convex/_generated
git commit -m "feat: game lifecycle + scenario counter schema, migrations component"
```

---

## Task 4: Write `startedAt` when a game begins

**Files:**
- Modify: `convex/game.ts` (the `startNewGameRound` mutation — the `ctx.db.patch(game._id, { currentRound: newRoundNumber })` call near line 384)
- Test: `convex/game.test.ts`

**Interfaces:**
- Consumes: `api.game.startNewGameRound` (existing).
- Produces: `games.startedAt` set to `Date.now()` on round 1.

- [ ] **Step 1: Write the failing test**

Create `convex/game.test.ts`:
```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.*s");

test("startNewGameRound sets startedAt on round 1", async () => {
  const t = convexTest(schema, modules);
  const gameId = await t.run(async (ctx) => {
    const gid = await ctx.db.insert("games", {
      joinCode: "ABC123",
      totalRounds: 3,
      isOpen: true,
      createdBy: "user1",
    });
    await ctx.db.insert("players", {
      userId: "user1",
      gameId: gid,
      displayName: "P1",
      lastAlive: 0,
    });
    return gid;
  });

  await t.mutation(api.game.startNewGameRound, { game: gameId });

  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(typeof game?.startedAt).toBe("number");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/game.test.ts`
Expected: FAIL — `game.startedAt` is `undefined`.

- [ ] **Step 3: Implement**

In `convex/game.ts`, find:
```ts
    // update the round number
    await ctx.db.patch(game._id, { currentRound: newRoundNumber });
```
Replace with:
```ts
    // update the round number; stamp the game's start time on round 1
    await ctx.db.patch(game._id, {
      currentRound: newRoundNumber,
      ...(newRoundNumber === 1 ? { startedAt: Date.now() } : {}),
    });
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test convex/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/game.ts convex/game.test.ts
git commit -m "feat: record game startedAt on round 1"
```

---

## Task 5: Write `completedAt` when the final round finishes

**Files:**
- Modify: `convex/game.ts` (`transitionRoundPhase` — after the `ctx.db.patch(gameRound._id, { phase: args.toPhase })` near line 507)
- Test: `convex/game.test.ts`

**Interfaces:**
- Consumes: `api.game.transitionRoundPhase`, `shouldSetCompletedAt` from `@/lib/admin/metrics`.
- Produces: `games.completedAt` set when the last round transitions to `"finished"`.

- [ ] **Step 1: Write the failing tests**

Append to `convex/game.test.ts`:
```ts
async function seedGameWithRound(
  t: ReturnType<typeof convexTest>,
  opts: { totalRounds: number; roundNumber: number },
) {
  return t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "FIN123",
      totalRounds: opts.totalRounds,
      currentRound: opts.roundNumber,
      isOpen: false,
      createdBy: "host",
      startedAt: 1000,
    });
    const hostPlayerId = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "Host",
      lastAlive: 0,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: opts.roundNumber,
      hostPlayerId,
      phase: "display-results",
    });
    return { gameId, roundId };
  });
}

test("transitionRoundPhase sets completedAt on the final round finishing", async () => {
  const t = convexTest(schema, modules);
  const { gameId, roundId } = await seedGameWithRound(t, { totalRounds: 3, roundNumber: 3 });

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, { gameRoundId: roundId, toPhase: "finished" });

  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(typeof game?.completedAt).toBe("number");
});

test("transitionRoundPhase does NOT set completedAt on a non-final round", async () => {
  const t = convexTest(schema, modules);
  const { gameId, roundId } = await seedGameWithRound(t, { totalRounds: 3, roundNumber: 2 });

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.transitionRoundPhase, { gameRoundId: roundId, toPhase: "finished" });

  const game = await t.run((ctx) => ctx.db.get(gameId));
  expect(game?.completedAt).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/game.test.ts`
Expected: FAIL — first new test sees `completedAt` `undefined`.

- [ ] **Step 3: Implement**

In `convex/game.ts` add the import at the top (with the other imports). Use a **relative** path — `convex/tsconfig.json` does not define the `@/` alias, so `@/lib/...` fails to resolve in Convex bundling/typecheck:
```ts
import { shouldSetCompletedAt } from "../lib/admin/metrics";
```
In `transitionRoundPhase`, find:
```ts
    // change phase
    await ctx.db.patch(gameRound._id, { phase: args.toPhase });
  },
});
```
Replace with:
```ts
    // change phase
    await ctx.db.patch(gameRound._id, { phase: args.toPhase });

    // stamp game completion when the final round finishes
    const game = await ctx.db.get(gameRound.gameId);
    if (
      game &&
      game.completedAt === undefined &&
      shouldSetCompletedAt(args.toPhase, gameRound.roundNumber, game.totalRounds)
    ) {
      await ctx.db.patch(game._id, { completedAt: Date.now() });
    }
  },
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test convex/game.test.ts`
Expected: PASS (both new tests + the startedAt test).

- [ ] **Step 5: Typecheck & commit**

Run: `pnpm exec tsc --noEmit` → no new errors.
```bash
git add convex/game.ts convex/game.test.ts
git commit -m "feat: record game completedAt on final round finish"
```

---

## Task 6: Increment `timesSelected` when a scenario is chosen

**Files:**
- Modify: `convex/game.ts` (`selectGameRoundScenario` — the `ctx.db.patch(args.gameRoundScenarioId, { selected: true })` near line 566)
- Test: `convex/game.test.ts`

**Interfaces:**
- Consumes: `api.game.selectGameRoundScenario`.
- Produces: the underlying `scenarios.timesSelected` incremented by 1 on selection.

- [ ] **Step 1: Write the failing test**

Append to `convex/game.test.ts`:
```ts
test("selectGameRoundScenario increments the scenario's timesSelected", async () => {
  const t = convexTest(schema, modules);
  const { gameRoundScenarioId, roundId, scenarioId } = await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "SEL123",
      totalRounds: 1,
      currentRound: 1,
      isOpen: false,
      createdBy: "host",
    });
    const hostPlayerId = await ctx.db.insert("players", {
      userId: "host",
      gameId,
      displayName: "Host",
      lastAlive: 0,
    });
    const roundId = await ctx.db.insert("gameRounds", {
      gameId,
      roundNumber: 1,
      hostPlayerId,
      phase: "pick-scenario",
    });
    const scenarioId = await ctx.db.insert("scenarios", {
      description: "Most likely to be late",
      category: "General",
      timesSelected: 0,
    });
    const gameRoundScenarioId = await ctx.db.insert("gameRoundScenarios", {
      gameId,
      roundId,
      scenarioId,
      selected: false,
    });
    return { gameRoundScenarioId, roundId, scenarioId };
  });

  await t
    .withIdentity({ subject: "host" })
    .mutation(api.game.selectGameRoundScenario, {
      gameRoundId: roundId,
      gameRoundScenarioId,
    });

  const scenario = await t.run((ctx) => ctx.db.get(scenarioId));
  expect(scenario?.timesSelected).toBe(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/game.test.ts`
Expected: FAIL — `timesSelected` stays `0`.

- [ ] **Step 3: Implement**

In `convex/game.ts`, find:
```ts
    // Change selected state for the chosen scenario
    await ctx.db.patch(args.gameRoundScenarioId, { selected: true });
  },
});
```
Replace with:
```ts
    // Change selected state for the chosen scenario
    await ctx.db.patch(args.gameRoundScenarioId, { selected: true });

    // Increment the popularity counter on the underlying scenario
    const scenario = await ctx.db.get(selectedGameRoundScenario.scenarioId);
    if (scenario) {
      await ctx.db.patch(scenario._id, {
        timesSelected: (scenario.timesSelected ?? 0) + 1,
      });
    }
  },
});
```
(`selectedGameRoundScenario` is already fetched earlier in this handler.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test convex/game.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add convex/game.ts convex/game.test.ts
git commit -m "feat: increment scenario timesSelected on selection"
```

---

## Task 7: `requireAdmin` guard, `grantAdmin`, and role in `getCurrentUser`

**Files:**
- Create: `convex/adminAuth.ts`
- Modify: `convex/auth.ts` (`getCurrentUser` to expose `role`; export `createAuthOptions` is already exported)
- Add `grantAdmin` in `convex/admin.ts` (created here; queries added in later tasks)

**Interfaces:**
- Produces:
  - `requireAdmin(ctx: QueryCtx | MutationCtx): Promise<user>` — throws `"Admin access required."` unless `role === "admin"`.
  - `internal.admin.grantAdmin({ email })` — sets a user's role to admin.
  - `getCurrentUser` now returns `{ id, name, email, image, role }`.

- [ ] **Step 1: Implement the guard**

Create `convex/adminAuth.ts`:
```ts
import { authComponent } from "./auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";

/**
 * Throws unless the current user has the admin role. Every admin query and
 * mutation must call this before reading data.
 */
export async function requireAdmin(ctx: GenericCtx<DataModel>) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user || (user as { role?: string }).role !== "admin") {
    throw new Error("Admin access required.");
  }
  return user;
}
```
(If `GenericCtx<DataModel>` causes a type mismatch when called from a `query`/`mutation` handler, type the parameter as `any` with a `// eslint-disable-next-line` comment — the guard only calls `safeGetAuthUser`, which accepts query and mutation contexts. Confirm at typecheck.)

- [ ] **Step 2: Expose `role` from `getCurrentUser`**

In `convex/auth.ts`, update the returned object in `getCurrentUser`:
```ts
    return {
      id: user._id as string,
      name: user.name ?? null,
      email: user.email,
      image: user.image ?? null,
      role: (user as { role?: string }).role ?? "user",
    };
```

- [ ] **Step 3: Create `convex/admin.ts` with `grantAdmin`**

```ts
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { authComponent, createAuthOptions } from "./auth";

/**
 * One-off bootstrap: promote a user to admin by email. Uses the Better Auth
 * Convex adapter directly (the role-setting HTTP endpoint requires an existing
 * admin caller, which does not yet exist during bootstrap).
 *
 * Run once:
 *   pnpm exec convex run admin:grantAdmin '{"email":"georgegorzynski@me.com"}'
 */
export const grantAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const adapter = authComponent.adapter(ctx)(createAuthOptions(ctx));
    const user = await adapter.findOne({
      model: "user",
      where: [{ field: "email", value: email }],
    });
    if (!user) throw new Error(`No user found with email ${email}`);
    await adapter.update({
      model: "user",
      where: [{ field: "id", value: (user as { id: string }).id }],
      update: { role: "admin" },
    });
    return { ok: true };
  },
});
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors. If `adapter.findOne`/`update` types differ in the installed version, adjust the call to match `convex/betterAuth/adapter.ts`'s adapter surface (verify by opening that file); the field/where/update shapes above are the Better Auth adapter contract.

- [ ] **Step 5: Commit**

```bash
git add convex/adminAuth.ts convex/auth.ts convex/admin.ts
git commit -m "feat: admin guard, grantAdmin bootstrap, role in getCurrentUser"
```

*(Actual promotion is run during Task 18 rollout, after deploy.)*

---

## Task 8: `createScenario` mutation

**Files:**
- Modify: `convex/admin.ts`

**Interfaces:**
- Produces: `api.admin.createScenario({ description, category })` — admin-guarded insert with `timesSelected: 0`.

- [ ] **Step 1: Add the mutation**

In `convex/admin.ts` add imports and the mutation:
```ts
import { mutation } from "./_generated/server";
import { requireAdmin } from "./adminAuth";

export const createScenario = mutation({
  args: { description: v.string(), category: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const description = args.description.trim();
    const category = args.category.trim();
    if (!description) throw new Error("Scenario text is required.");
    if (!category) throw new Error("Category is required.");
    return await ctx.db.insert("scenarios", {
      description,
      category,
      timesSelected: 0,
    });
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add convex/admin.ts
git commit -m "feat: admin createScenario mutation"
```

*(Behavioral verification happens in the Task 18 manual pass — the mutation is admin-guarded and cannot be exercised in convex-test without the auth component.)*

---

## Task 9: Backfill migrations

**Files:**
- Create: `convex/migrations.ts`

**Interfaces:**
- Produces: `internal.migrations.backfillTimesSelected` and `internal.migrations.backfillGameTimestamps`, runnable via `convex run`.

- [ ] **Step 1: Implement the migrations**

Create `convex/migrations.ts`:
```ts
import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";

export const migrations = new Migrations<DataModel>(components.migrations);

/**
 * Exact backfill: count selected gameRoundScenarios per scenario and store it.
 */
export const backfillTimesSelected = migrations.define({
  table: "scenarios",
  migrateOne: async (ctx, scenario) => {
    const selectedRows = await ctx.db
      .query("gameRoundScenarios")
      .filter((q) =>
        q.and(
          q.eq(q.field("scenarioId"), scenario._id),
          q.eq(q.field("selected"), true),
        ),
      )
      .collect();
    return { timesSelected: selectedRows.length };
  },
});

/**
 * Approximate backfill for historical games: startedAt ~= creation time;
 * completedAt ~= latest round creation time, but only if the game reached its
 * final round. New games are stamped exactly by the mutations.
 */
export const backfillGameTimestamps = migrations.define({
  table: "games",
  migrateOne: async (ctx, game) => {
    const patch: { startedAt?: number; completedAt?: number } = {};
    if (game.startedAt === undefined) patch.startedAt = game._creationTime;

    if (game.completedAt === undefined && game.totalRounds > 0) {
      const rounds = await ctx.db
        .query("gameRounds")
        .withIndex("byGame", (q) => q.eq("gameId", game._id))
        .collect();
      const reachedFinal = rounds.some((r) => r.roundNumber === game.totalRounds);
      if (reachedFinal) {
        patch.completedAt = Math.max(...rounds.map((r) => r._creationTime));
      }
    }
    return patch;
  },
});

export const runAll = migrations.runner([
  "migrations:backfillTimesSelected",
  "migrations:backfillGameTimestamps",
]);
```

- [ ] **Step 2: Typecheck & push**

Run: `pnpm exec tsc --noEmit` → no new errors.
Run: `pnpm exec convex dev --once` → functions register.

- [ ] **Step 3: Commit**

```bash
git add convex/migrations.ts convex/_generated
git commit -m "feat: backfill migrations for scenario counts and game timestamps"
```

*(Migrations are executed against the deployment in Task 18.)*

---

## Task 10: Admin queries — users

**Files:**
- Modify: `convex/admin.ts`
- Test: `convex/admin.test.ts`

**Interfaces:**
- Consumes: `activePlayerCount` from `@/lib/admin/metrics`; the Better Auth `auth.api.listUsers` endpoint via `authComponent.getAuth` + `getHeaders`.
- Produces:
  - `activePlayers14dCore(ctx, now): Promise<number>` (exported, convex-testable).
  - `api.admin.userStats(): { totalUsers, activePlayers14d }`.
  - `api.admin.listUsers({ limit, offset }): { users: { id, name, email, createdAt }[], total }`.

- [ ] **Step 1: Write the failing test for the players core**

Create `convex/admin.test.ts`:
```ts
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import schema from "./schema";
import { activePlayers14dCore } from "./admin";
import { FOURTEEN_DAYS_MS } from "../lib/admin/metrics";

const modules = import.meta.glob("./**/*.*s");
const NOW = 2_000_000_000_000;

test("activePlayers14dCore dedupes recent players", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      joinCode: "P", totalRounds: 1, isOpen: true, createdBy: "a",
    });
    // two rows for user a (recent), one for b (recent), one for c (old)
    await ctx.db.insert("players", { userId: "a", gameId, displayName: "A", lastAlive: 0 });
    await ctx.db.insert("players", { userId: "a", gameId, displayName: "A", lastAlive: 0 });
    await ctx.db.insert("players", { userId: "b", gameId, displayName: "B", lastAlive: 0 });
    const old = await ctx.db.insert("players", { userId: "c", gameId, displayName: "C", lastAlive: 0 });
    // force c's creation time to be old
    await ctx.db.patch(old, {}); // no-op to keep types happy
  });
  const count = await t.run((ctx) => activePlayers14dCore(ctx, NOW));
  // all four rows were just created (recent) -> distinct users a, b, c = 3
  expect(count).toBe(3);
  // sanity on the window constant
  expect(FOURTEEN_DAYS_MS).toBe(14 * 24 * 60 * 60 * 1000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/admin.test.ts`
Expected: FAIL — `activePlayers14dCore` not exported.

- [ ] **Step 3: Implement the users queries**

Add to `convex/admin.ts`:
```ts
import { query } from "./_generated/server";
import { createAuth } from "./auth";
import { activePlayerCount } from "../lib/admin/metrics";
import type { QueryCtx } from "./_generated/server";

export async function activePlayers14dCore(ctx: QueryCtx, now: number) {
  const players = await ctx.db.query("players").collect();
  return activePlayerCount(players, now);
}

export const userStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const auth = await authComponent.getAuth(createAuth, ctx);
    const headers = await authComponent.getHeaders(ctx);
    const listed = await auth.api.listUsers({ headers, query: { limit: 1 } });
    return {
      totalUsers: listed.total ?? 0,
      activePlayers14d: await activePlayers14dCore(ctx, Date.now()),
    };
  },
});

export const listUsers = query({
  args: { limit: v.number(), offset: v.number() },
  handler: async (ctx, { limit, offset }) => {
    await requireAdmin(ctx);
    const auth = await authComponent.getAuth(createAuth, ctx);
    const headers = await authComponent.getHeaders(ctx);
    const listed = await auth.api.listUsers({
      headers,
      query: { limit, offset, sortBy: "createdAt", sortDirection: "desc" },
    });
    return {
      total: listed.total ?? 0,
      users: (listed.users ?? []).map((u: { id: string; name?: string; email: string; createdAt: number | string }) => ({
        id: u.id,
        name: u.name ?? "",
        email: u.email,
        createdAt: typeof u.createdAt === "string" ? Date.parse(u.createdAt) : u.createdAt,
      })),
    };
  },
});
```
Note: confirm `auth.api.listUsers` response fields (`users`, `total`) and query params (`limit`, `offset`, `sortBy`, `sortDirection`) against the admin plugin — Task 2 installed it. If the shape differs, adjust the mapping; the guard and `activePlayers14dCore` are unaffected.

- [ ] **Step 4: Run to verify the core test passes**

Run: `pnpm test convex/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck & commit**

Run: `pnpm exec tsc --noEmit` → no new errors.
```bash
git add convex/admin.ts convex/admin.test.ts
git commit -m "feat: admin user stats and paginated listUsers"
```

---

## Task 11: Admin queries — games

**Files:**
- Modify: `convex/admin.ts`
- Test: `convex/admin.test.ts`

**Interfaces:**
- Consumes: `computeGameStats`, `gameDurationMs` from `@/lib/admin/metrics`; `paginationOptsValidator` from `convex/server`.
- Produces:
  - `gameStatsCore(ctx, now): Promise<{ activeNow, started14d, completed14d, avgLengthMs }>` (exported).
  - `api.admin.gameStats()`.
  - `api.admin.listGames({ paginationOpts })` → paginated rows `{ _id, _creationTime, partySize, totalRounds, finished, durationMs }`.

- [ ] **Step 1: Write the failing test for the stats core**

Append to `convex/admin.test.ts`:
```ts
import { gameStatsCore } from "./admin";

test("gameStatsCore computes counts and average duration", async () => {
  const t = convexTest(schema, modules);
  const now = NOW;
  await t.run(async (ctx) => {
    await ctx.db.insert("games", { joinCode: "1", totalRounds: 1, isOpen: true, createdBy: "x", startedAt: now - 1000 });
    await ctx.db.insert("games", { joinCode: "2", totalRounds: 1, isOpen: false, createdBy: "x", startedAt: now - 3000, completedAt: now - 1000 });
    await ctx.db.insert("games", { joinCode: "3", totalRounds: 1, isOpen: false, createdBy: "x", startedAt: now - 9000, completedAt: now - 1000 });
  });
  const stats = await t.run((ctx) => gameStatsCore(ctx, now));
  expect(stats.activeNow).toBe(1);
  expect(stats.started14d).toBe(3);
  expect(stats.completed14d).toBe(2);
  expect(stats.avgLengthMs).toBe(5000); // (2000 + 8000) / 2
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/admin.test.ts`
Expected: FAIL — `gameStatsCore` not exported.

- [ ] **Step 3: Implement the games queries**

Add to `convex/admin.ts`:
```ts
import { paginationOptsValidator } from "convex/server";
import { computeGameStats, gameDurationMs } from "../lib/admin/metrics";

export async function gameStatsCore(ctx: QueryCtx, now: number) {
  const games = await ctx.db.query("games").collect();
  return computeGameStats(games, now);
}

export const gameStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return gameStatsCore(ctx, Date.now());
  },
});

export const listGames = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("games")
      .order("desc")
      .paginate(paginationOpts);

    const page = await Promise.all(
      result.page.map(async (game) => {
        const players = await ctx.db
          .query("players")
          .withIndex("byGame", (q) => q.eq("gameId", game._id))
          .collect();
        return {
          _id: game._id,
          _creationTime: game._creationTime,
          partySize: players.length,
          totalRounds: game.totalRounds,
          finished: game.completedAt !== undefined,
          durationMs: gameDurationMs(game),
        };
      }),
    );
    return { ...result, page };
  },
});
```

- [ ] **Step 4: Run to verify the core test passes**

Run: `pnpm test convex/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck & commit**

Run: `pnpm exec tsc --noEmit` → no new errors.
```bash
git add convex/admin.ts convex/admin.test.ts
git commit -m "feat: admin game stats and paginated listGames"
```

---

## Task 12: Admin queries — scenarios

**Files:**
- Modify: `convex/admin.ts`
- Test: `convex/admin.test.ts`

**Interfaces:**
- Consumes: `scenarioSortToQuery`, `type ScenarioSort` from `@/lib/admin/metrics`.
- Produces:
  - `api.admin.listScenarios({ paginationOpts, sort })` → paginated `{ _id, _creationTime, description, category, timesSelected }`, ordered by the chosen index.
  - `api.admin.scenarioCategoriesForAdmin()` → distinct category strings.

- [ ] **Step 1: Write the failing test for scenario ordering**

Append to `convex/admin.test.ts`:
```ts
import { listScenariosPage } from "./admin";

test("listScenariosPage orders by popularity", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("scenarios", { description: "low", category: "c", timesSelected: 1 });
    await ctx.db.insert("scenarios", { description: "high", category: "c", timesSelected: 9 });
    await ctx.db.insert("scenarios", { description: "mid", category: "c", timesSelected: 5 });
  });
  const page = await t.run((ctx) =>
    listScenariosPage(ctx, "popular-desc", { numItems: 10, cursor: null }),
  );
  expect(page.page.map((s) => s.description)).toEqual(["high", "mid", "low"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test convex/admin.test.ts`
Expected: FAIL — `listScenariosPage` not exported.

- [ ] **Step 3: Implement the scenarios queries**

Add to `convex/admin.ts`:
```ts
import { scenarioSortToQuery, type ScenarioSort } from "../lib/admin/metrics";
import type { PaginationOptions } from "convex/server";

const SCENARIO_SORTS = ["popular-desc", "popular-asc", "newest", "oldest"] as const;

export async function listScenariosPage(
  ctx: QueryCtx,
  sort: ScenarioSort,
  paginationOpts: PaginationOptions,
) {
  const { index, order } = scenarioSortToQuery(sort);
  const result = await ctx.db
    .query("scenarios")
    .withIndex(index)
    .order(order)
    .paginate(paginationOpts);
  return {
    ...result,
    page: result.page.map((s) => ({
      _id: s._id,
      _creationTime: s._creationTime,
      description: s.description,
      category: s.category,
      timesSelected: s.timesSelected ?? 0,
    })),
  };
}

export const listScenarios = query({
  args: {
    paginationOpts: paginationOptsValidator,
    sort: v.union(...SCENARIO_SORTS.map((s) => v.literal(s))),
  },
  handler: async (ctx, { paginationOpts, sort }) => {
    await requireAdmin(ctx);
    return listScenariosPage(ctx, sort, paginationOpts);
  },
});

export const scenarioCategoriesForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const scenarios = await ctx.db.query("scenarios").collect();
    return [...new Set(scenarios.map((s) => s.category))].sort();
  },
});
```

- [ ] **Step 4: Run to verify the ordering test passes**

Run: `pnpm test convex/admin.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck & commit**

Run: `pnpm exec tsc --noEmit` → no new errors.
```bash
git add convex/admin.ts convex/admin.test.ts
git commit -m "feat: admin paginated listScenarios with sorting"
```

---

## Task 13: shadcn components + admin route shell (server-guarded)

**Files:**
- Modify: `components/ui/*` (added via shadcn CLI)
- Create: `app/admin/layout.tsx`, `app/admin/page.tsx`

**Interfaces:**
- Consumes: `fetchAuthQuery` from `@/lib/auth-server`; `api.auth.getCurrentUser`.
- Produces: an admin shell that 404s non-admins and renders section nav + children.

- [ ] **Step 1: Add shadcn components**

Run:
```bash
pnpm dlx shadcn@latest add table select badge skeleton dropdown-menu
```
Expected: new files under `components/ui/`. (Use the shadcn skill if the CLI prompts about config.)

- [ ] **Step 2: Create the server-guarded layout**

Create `app/admin/layout.tsx`:
```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/convex/_generated/api";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
  if (!user || user.role !== "admin") notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-mono text-lg">ID Game · Admin</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin/users" className="hover:underline">Users</Link>
            <Link href="/admin/games" className="hover:underline">Games</Link>
            <Link href="/admin/scenarios" className="hover:underline">Scenarios</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Create the index redirect**

Create `app/admin/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function AdminIndex() {
  redirect("/admin/users");
}
```

- [ ] **Step 4: Typecheck & build check**

Run: `pnpm exec tsc --noEmit` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/ui app/admin/layout.tsx app/admin/page.tsx components.json
git commit -m "feat: admin route shell with server-side admin guard"
```

---

## Task 14: Shared admin UI — StatCard + AdminDataTable

**Files:**
- Create: `components/admin/stat-card.tsx`, `components/admin/admin-data-table.tsx`

**Interfaces:**
- Produces:
  - `StatCard({ label, value }: { label: string; value: React.ReactNode })`.
  - `AdminDataTable<T>({ columns, data, isLoading, page, hasNext, hasPrev, onNext, onPrev, pageSize, onPageSize })` — a shadcn `Table` with a footer of Prev/Next controls, a "Page N" indicator, and a page-size `Select`. Presentational; pagination state is owned by the caller.

- [ ] **Step 1: Implement StatCard**

Create `components/admin/stat-card.tsx`:
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Implement AdminDataTable**

Create `components/admin/admin-data-table.tsx`:
```tsx
"use client";

import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export type Column<T> = { header: string; cell: (row: T) => React.ReactNode; className?: string };

export function AdminDataTable<T>({
  columns, data, isLoading, page, hasNext, hasPrev, onNext, onPrev, pageSize, onPageSize,
}: {
  columns: Column<T>[];
  data: T[];
  isLoading: boolean;
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  pageSize: number;
  onPageSize: (n: number) => void;
}) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header} className={c.className}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.header}><Skeleton className="h-4 w-24" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No results.
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c.header} className={c.className}>{c.cell(row)}</TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-4 border-t px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[10, 25, 50].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <Button variant="outline" size="sm" onClick={onPrev} disabled={!hasPrev}>Previous</Button>
          <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>Next</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/admin/stat-card.tsx components/admin/admin-data-table.tsx
git commit -m "feat: shared admin StatCard and paginated data table"
```

---

## Task 15: Users page

**Files:**
- Create: `app/admin/users/page.tsx`

**Interfaces:**
- Consumes: `api.admin.userStats`, `api.admin.listUsers`; `StatCard`, `AdminDataTable`.
- Produces: the Users section (2 stat cards + offset-paginated table Name/Email/Joined).

- [ ] **Step 1: Implement the page**

Create `app/admin/users/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/admin/stat-card";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";

type UserRow = { id: string; name: string; email: string; createdAt: number };

const columns: Column<UserRow>[] = [
  { header: "Name", cell: (u) => u.name || "—" },
  { header: "Email", cell: (u) => u.email },
  { header: "Joined", cell: (u) => new Date(u.createdAt).toLocaleDateString() },
];

export default function UsersPage() {
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const stats = useQuery(api.admin.userStats, {});
  const data = useQuery(api.admin.listUsers, { limit: pageSize, offset: page * pageSize });

  const rows = data?.users ?? [];
  const total = data?.total ?? 0;
  const hasNext = (page + 1) * pageSize < total;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total users" value={stats?.totalUsers ?? "—"} />
        <StatCard label="Active players (14d)" value={stats?.activePlayers14d ?? "—"} />
      </div>
      <AdminDataTable
        columns={columns}
        data={rows}
        isLoading={data === undefined}
        page={page}
        hasNext={hasNext}
        hasPrev={page > 0}
        onNext={() => setPage((p) => p + 1)}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        pageSize={pageSize}
        onPageSize={(n) => { setPageSize(n); setPage(0); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit` → no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/users/page.tsx
git commit -m "feat: admin users page"
```

---

## Task 16: Games page

**Files:**
- Create: `app/admin/games/page.tsx`

**Interfaces:**
- Consumes: `api.admin.gameStats`, `api.admin.listGames` (cursor pagination); `formatDuration`; `StatCard`, `AdminDataTable`, shadcn `Badge`.
- Produces: the Games section (4 stat cards + cursor-stack paginated table).

- [ ] **Step 1: Implement the page**

Create `app/admin/games/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/admin/stat-card";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/admin/metrics";

type GameRow = {
  _id: string;
  _creationTime: number;
  partySize: number;
  totalRounds: number;
  finished: boolean;
  durationMs: number | null;
};

const columns: Column<GameRow>[] = [
  { header: "Party", cell: (g) => g.partySize },
  { header: "Rounds", cell: (g) => g.totalRounds },
  { header: "Finished", cell: (g) => (g.finished ? <Badge>Yes</Badge> : <Badge variant="outline">No</Badge>) },
  { header: "Duration", cell: (g) => formatDuration(g.durationMs) },
  { header: "Created", cell: (g) => new Date(g._creationTime).toLocaleString() },
];

export default function GamesPage() {
  const [pageSize, setPageSize] = useState(25);
  const [cursors, setCursors] = useState<(string | null)[]>([null]); // stack; index = page
  const [page, setPage] = useState(0);

  const stats = useQuery(api.admin.gameStats, {});
  const data = useQuery(api.admin.listGames, {
    paginationOpts: { numItems: pageSize, cursor: cursors[page] ?? null },
  });

  const rows = (data?.page ?? []) as GameRow[];
  const hasNext = data ? !data.isDone : false;

  const onNext = () => {
    if (!data || data.isDone) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[page + 1] = data.continueCursor;
      return copy;
    });
    setPage((p) => p + 1);
  };

  const resetTo = (n: number) => { setPageSize(n); setCursors([null]); setPage(0); };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Games</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active now" value={stats?.activeNow ?? "—"} />
        <StatCard label="Started (14d)" value={stats?.started14d ?? "—"} />
        <StatCard label="Completed (14d)" value={stats?.completed14d ?? "—"} />
        <StatCard label="Avg length" value={stats ? formatDuration(stats.avgLengthMs) : "—"} />
      </div>
      <AdminDataTable
        columns={columns}
        data={rows}
        isLoading={data === undefined}
        page={page}
        hasNext={hasNext}
        hasPrev={page > 0}
        onNext={onNext}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        pageSize={pageSize}
        onPageSize={resetTo}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit` → no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/admin/games/page.tsx
git commit -m "feat: admin games page"
```

---

## Task 17: Scenarios page + sort + add-scenario form

**Files:**
- Create: `app/admin/scenarios/page.tsx`, `components/admin/add-scenario-dialog.tsx`

**Interfaces:**
- Consumes: `api.admin.listScenarios`, `api.admin.scenarioCategoriesForAdmin`, `api.admin.createScenario`; `StatCard`/`AdminDataTable`; shadcn `dialog`, `form`, `select`, `input`; react-hook-form + zod.
- Produces: the Scenarios section (sort control + cursor-stack paginated table + add dialog).

- [ ] **Step 1: Implement the add-scenario dialog**

Create `components/admin/add-scenario-dialog.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  description: z.string().trim().min(1, "Scenario text is required"),
  category: z.string().trim().min(1, "Category is required"),
});

export function AddScenarioDialog() {
  const [open, setOpen] = useState(false);
  const create = useMutation(api.admin.createScenario);
  const categories = useQuery(api.admin.scenarioCategoriesForAdmin, {}) ?? [];
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { description: "", category: "" },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    try {
      await create(values);
      toast.success("Scenario added");
      form.reset();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add scenario");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add scenario</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add scenario</DialogTitle></DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Scenario text</FormLabel>
                <FormControl><Input placeholder="Most likely to…" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <FormControl>
                  <Input list="admin-scenario-categories" placeholder="General" {...field} />
                </FormControl>
                <datalist id="admin-scenario-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
                <FormMessage />
              </FormItem>
            )} />
            <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implement the scenarios page**

Create `app/admin/scenarios/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminDataTable, type Column } from "@/components/admin/admin-data-table";
import { AddScenarioDialog } from "@/components/admin/add-scenario-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ScenarioSort } from "@/lib/admin/metrics";

type ScenarioRow = {
  _id: string;
  _creationTime: number;
  description: string;
  category: string;
  timesSelected: number;
};

const columns: Column<ScenarioRow>[] = [
  { header: "Scenario", cell: (s) => s.description, className: "max-w-md" },
  { header: "Category", cell: (s) => <Badge variant="secondary">{s.category}</Badge> },
  { header: "Times selected", cell: (s) => s.timesSelected },
  { header: "Introduced", cell: (s) => new Date(s._creationTime).toLocaleDateString() },
];

const SORT_LABELS: Record<ScenarioSort, string> = {
  "popular-desc": "Most popular",
  "popular-asc": "Least popular",
  newest: "Newest",
  oldest: "Oldest",
};

export default function ScenariosPage() {
  const [sort, setSort] = useState<ScenarioSort>("popular-desc");
  const [pageSize, setPageSize] = useState(25);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);

  const data = useQuery(api.admin.listScenarios, {
    sort,
    paginationOpts: { numItems: pageSize, cursor: cursors[page] ?? null },
  });

  const rows = (data?.page ?? []) as ScenarioRow[];
  const hasNext = data ? !data.isDone : false;

  const reset = () => { setCursors([null]); setPage(0); };
  const onNext = () => {
    if (!data || data.isDone) return;
    setCursors((prev) => { const c = [...prev]; c[page + 1] = data.continueCursor; return c; });
    setPage((p) => p + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Scenarios</h1>
        <AddScenarioDialog />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort</span>
        <Select value={sort} onValueChange={(v) => { setSort(v as ScenarioSort); reset(); }}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as ScenarioSort[]).map((k) => (
              <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AdminDataTable
        columns={columns}
        data={rows}
        isLoading={data === undefined}
        page={page}
        hasNext={hasNext}
        hasPrev={page > 0}
        onNext={onNext}
        onPrev={() => setPage((p) => Math.max(0, p - 1))}
        pageSize={pageSize}
        onPageSize={(n) => { setPageSize(n); reset(); }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/scenarios/page.tsx components/admin/add-scenario-dialog.tsx
git commit -m "feat: admin scenarios page with sort and add form"
```

---

## Task 18: Rollout & end-to-end verification

**Files:** none (operational).

**Interfaces:** Consumes everything above.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all suites PASS.

- [ ] **Step 2: Typecheck & lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

- [ ] **Step 3: Deploy Convex functions**

Run: `pnpm exec convex dev --once` (dev) — confirms schema + all functions register without error.

- [ ] **Step 4: Promote your user to admin**

Run:
```bash
pnpm exec convex run admin:grantAdmin '{"email":"georgegorzynski@me.com"}'
```
Then verify:
```bash
pnpm exec convex run auth:getCurrentUser '{}'
```
Expected: (when signed in as that user in the app) `role: "admin"`. If `getCurrentUser` returns null from the CLI (no identity), instead confirm via the app in Step 7.

- [ ] **Step 5: Run the backfills**

Run:
```bash
pnpm exec convex run migrations:backfillTimesSelected '{}'
pnpm exec convex run migrations:backfillGameTimestamps '{}'
```
Expected: both complete. Spot-check a scenario's `timesSelected` and a finished game's `completedAt` in the Convex dashboard.

- [ ] **Step 6: Start the app**

Run: `pnpm dev`

- [ ] **Step 7: Manual end-to-end verification**

Using the `verify` skill / browser:
- Visit `/admin` signed in as `georgegorzynski@me.com` → redirects to `/admin/users`; nav works.
- Visit `/admin` signed in as a **non-admin** (or signed out) → 404.
- Users: total + active(14d) render; table paginates (Next/Prev, page size).
- Games: 4 stat cards render; table shows party size, rounds, finished badge, duration, created; pagination works.
- Scenarios: table shows text/category/times-selected/introduced; changing Sort reorders and resets to page 1; "Add scenario" inserts a row (appears with times-selected 0) and shows a success toast.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "chore: admin dashboard rollout notes" --allow-empty
```

---

## Self-review notes

- **Spec coverage:** users count/active/table → Tasks 10,15. games active/started/completed/avg + table (party, rounds, finished, duration) → Tasks 5,11,16. scenarios table + sort + add form → Tasks 6,8,12,17. admin role + gating → Tasks 2,7,13. lifecycle timestamps + counter + backfill → Tasks 3,4,5,6,9. Tests → Tasks 0,1,4,5,6,10,11,12. ✅
- **Deviations from spec (intentional):** new fields stored as `v.optional` for safe rollout (treated as 0/unset); `listUsers` uses Better Auth offset pagination (true page jumps) while games/scenarios use Convex cursor stacks (sequential) — both surfaced through the same `AdminDataTable` controls.
- **Manual-only (per pragmatic test choice):** admin guard, `createScenario`, `listUsers`, and all UI — verified in Task 18. Risk-bearing math and DB write-points are unit-/convex-tested.
