# Admin Dashboard — Design

Date: 2026-07-10
Status: Approved for planning

## Overview

An internal admin dashboard at `/admin` for viewing users, games, and scenarios.
Access is restricted to admin users (initially `georgegorzynski@me.com`). Built with
Next.js App Router + Convex + shadcn/ui, leaning on shadcn components (data table,
cards, form, select, badge, dialog, sidebar/tabs) throughout.

### Goals
- Users: total count, count active in last 14 days, paginated table with display names.
- Games: active-now / started-14d / completed-14d counts, average game length, and a
  paginated table (party size, rounds, finished, per-game duration, created).
- Scenarios: paginated table (text, category, times selected, introduced), sort by
  popularity and by age, and a form to add scenarios.

### Non-goals
- No editing/deleting of users, games, or scenarios (read-only except adding scenarios).
- No admin management UI for granting other admins (done via a one-off script for now).
- No charts/visualisations beyond stat cards and tables.
- No bans/impersonation (though the Better Auth admin plugin makes these possible later).

## Definitions (metrics semantics)

- **Active player (14d):** a user with at least one `players` row whose `_creationTime`
  is within the last 14 days (i.e. joined a game recently). Deduplicated by `userId`.
- **Game active now:** `isOpen === true`.
- **Game started (14d):** `startedAt` within the last 14 days (round 1 has begun).
- **Game completed (14d):** `completedAt` within the last 14 days.
- **Average length:** mean of `completedAt - startedAt` over games completed in the last
  14 days (same window, so the number stays meaningful and bounded).
- **Per-game duration (table column):** that game's `completedAt - startedAt`, or `—` if
  not finished.
- **Display name (users table):** Better Auth `user.name`.

## Data model changes (all additive)

### `games`
```ts
games: defineTable({
  // ...existing...
  startedAt: v.optional(v.number()),   // set when round 1 begins
  completedAt: v.optional(v.number()), // set when the final round finishes
})
  .index("byJoinCode", ["joinCode"])
  .index("byIsOpen", ["isOpen"])       // "active now" count
  .index("byStartedAt", ["startedAt"]) // "started 14d"
  .index("byCompletedAt", ["completedAt"]) // "completed 14d" + avg length
```

### `scenarios`
```ts
scenarios: defineTable({
  description: v.string(),
  category: v.string(),
  timesSelected: v.number(), // denormalised popularity counter
})
  .index("byCategory", ["category"])
  .index("byTimesSelected", ["timesSelected"]) // sortable popularity
// default by_creation_time index gives age sorting
```

### Better Auth `user`
Enable the Better Auth `admin` plugin, which adds a `role` field (default `"user"`).
Regenerate `convex/betterAuth/generatedSchema.ts` with
`cd convex/betterAuth && npx auth generate --output generatedSchema.ts`.

## Write-point changes (existing mutations in `convex/game.ts`)

1. **`startNewGameRound`** — when `newRoundNumber === 1`, also
   `patch(game._id, { startedAt: Date.now() })`.
2. **`transitionRoundPhase`** — when `toPhase === "finished"` and the round is the final
   round (`gameRound.roundNumber === game.totalRounds`, `totalRounds > 0`), set
   `completedAt: Date.now()` on the game. Infinite games (`totalRounds === 0`) never set
   `completedAt` and are treated as never-completed (documented edge case).
3. **`selectGameRoundScenario`** — where it patches `selected: true`, load the underlying
   `gameRoundScenario.scenarioId` and increment that scenario's `timesSelected` by 1.

## Backfill (via `@convex-dev/migrations`, already a dependency)

New file `convex/migrations.ts`:
- **`backfillTimesSelected`** — for each scenario, count `gameRoundScenarios` with
  `selected === true` referencing it; set `timesSelected`. Exact.
- **`backfillGameTimestamps`** — set `startedAt ≈ game._creationTime`; set
  `completedAt ≈` the latest `gameRounds._creationTime` **only if** the game reached its
  final round (else leave unset). Historical durations are approximate; new games are
  exact. Old, never-finished games simply don't appear in completed counts.

Migrations are run explicitly after deploy via `npx convex run migrations:...`.

## Admin role + access gating (defense in depth)

1. **Grant admin (one-off):** `convex/admin.ts` exposes an `internalMutation`
   `grantAdmin({ email })` that finds the Better Auth user by email and patches
   `role: "admin"`. Run once: `npx convex run admin:grantAdmin '{"email":"georgegorzynski@me.com"}'`.
2. **Server route guard:** `app/admin/layout.tsx` is a server component that reads the
   session (via `lib/auth-server`) and calls `notFound()` for non-admins.
3. **Query-level guard:** every admin Convex query/mutation re-checks
   `role === "admin"` (via `authComponent.safeGetAuthUser`) and throws otherwise. The UI
   guard is never trusted alone. A shared `requireAdmin(ctx)` helper enforces this.
4. `getCurrentUser` (or a new `isCurrentUserAdmin` query) is extended to expose `role`
   so the client can render/redirect appropriately.

## Convex admin API (new file `convex/admin.ts`)

Queries (all admin-guarded):
- `userStats` → `{ totalUsers, activePlayers14d }`.
- `listUsers({ paginationOpts })` → paginated `user` rows (name, email, createdAt).
- `gameStats` → `{ activeNow, started14d, completed14d, avgLengthMs }`.
- `listGames({ paginationOpts })` → paginated games; each row augmented with
  `partySize` (count of `players` byGame) and derived `finished`/`durationMs`.
- `scenarioStats` (optional) and `listScenarios({ paginationOpts, sort })` where `sort` is
  one of `popular-desc | popular-asc | newest | oldest`, mapping to `byTimesSelected`
  (asc/desc) or `by_creation_time` (asc/desc).
- `scenarioCategories` (reuse existing) for the add-scenario combobox.

Mutations (admin-guarded):
- `createScenario({ description, category })` → inserts with `timesSelected: 0`.

Counting note: user/game counts use `.collect().length` over the relevant index range,
which is fine at this app's scale. If volume grows, swap to `@convex-dev/aggregate`.

## Frontend

Route group under `app/admin/`:
- `app/admin/layout.tsx` — server guard + shared shell (sidebar/tabs nav: Users · Games ·
  Scenarios, using shadcn `sidebar` or `tabs`).
- `app/admin/page.tsx` — redirect to `/admin/users`.
- `app/admin/users/page.tsx`, `app/admin/games/page.tsx`, `app/admin/scenarios/page.tsx`.

Shared components (`components/admin/`):
- `stat-card.tsx` — shadcn `card` wrapper for a labelled metric.
- `data-table.tsx` — shadcn/TanStack data table configured for **manual (server-driven)
  pagination**. Prev / Next / first-page controls, "Page N" indicator, page-size `select`.
  Backed by a cursor stack over Convex `usePaginatedQuery`/`paginate()`. Sequential paging
  + jump-to-visited-page; arbitrary far-page jumps not supported (forward-only cursors).
- Per-section column definitions + the add-scenario `form` (shadcn `form` +
  react-hook-form + zod, already in deps) rendered in a `dialog`; `category` is a combobox
  seeded from existing categories, free text allowed. `badge` for category / finished
  state; `skeleton` for loading.

shadcn components to add via CLI (not yet installed): `table`, `select`, `badge`,
`skeleton`, `dropdown-menu`, and `sidebar` (or reuse existing `tabs`). Installed via the
shadcn skill/CLI during implementation.

Auth client: add `adminClient()` to `lib/auth-client.ts` and `admin()` to the server auth
plugins in `convex/auth.ts`.

## Testing

- Convex mutation unit tests: `startedAt`/`completedAt` written at the right transitions;
  `timesSelected` increments on selection; `createScenario` defaults `timesSelected` to 0;
  admin guard rejects non-admins.
- Migration tests: `timesSelected` backfill matches counts; timestamp backfill only sets
  `completedAt` for finished games.
- A manual end-to-end check: grant admin, load each section, page/sort, add a scenario.

## Rollout steps

1. Add Better Auth `admin` plugin (server + client) and regenerate the schema.
2. Add schema fields/indexes; deploy.
3. Add write-point changes + `createScenario` + admin queries + `requireAdmin` helper.
4. Add migrations; deploy; run `backfillTimesSelected` and `backfillGameTimestamps`.
5. Run `grantAdmin` for `georgegorzynski@me.com`.
6. Build the `/admin` UI (shadcn components).
7. Verify end-to-end.

## Open edge cases / assumptions

- Infinite games (`totalRounds === 0`) never record `completedAt`.
- Historical `startedAt`/`completedAt` are approximate; new games exact.
- Counts via `collect().length` are acceptable at current scale.
- Numbered pagination is sequential (forward cursors), not random-access.
