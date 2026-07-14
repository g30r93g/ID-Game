# Reconnect & Consensus Recovery — Design

**Date:** 2026-07-14
**Status:** Approved (pending spec review)
**Area:** Convex backend (`convex/game.ts`, `convex/schema.ts`) + game client (`components/game/`, `components/create-join-game.tsx`)

## Problem

Two related gaps in the multiplayer flow:

1. **No way to rediscover a game you dropped out of.** Visiting `/game/{code}` already
   re-attaches a user to their existing `players` row (both `isUserPlayer` and `joinGame`
   are idempotent), so *rejoining* works — but there is no way to find the join code again.
   Users who close the tab or lose connection have no path back in.

2. **The per-round host is a single point of failure.** `gameRounds.hostPlayerId` is the
   only player permitted to call `transitionRoundPhase` and every phase action
   (`selectScenariosForGameRound`, `selectGameRoundScenario`,
   `submitPlayerRankingsForGameRound`, `markGuessesForRound`). If the host disconnects
   mid-round, the round **freezes permanently** — no timeout, no fallback. Non-host players
   who drop during `guess-scenario` also stall the round, because the host's auto-advance
   waits for all players to guess.

The `lastAlive` heartbeat is written every 15s (`sendHeartbeat`, called from
`components/game/index.tsx`) but is **never read anywhere** — there is no liveness detection
today. Both features are built on adding that missing read side.

## Goals

- Let a signed-in user see and resume the games they are currently part of.
- Let the remaining connected players recover a stuck round when a player goes quiet,
  via a simple-majority vote that either **reassigns the host** or **skips/removes** a
  non-host — without a server cron or admin intervention.

## Non-goals

- General "kick any player" moderation. Removal is gated on genuine disconnection
  (staleness), not on social preference. (See Decision D1.)
- Reconnecting a *specific websocket*; we treat "not sending heartbeats" as the disconnect
  signal, which also covers a user who navigated away from the game page.
- Spectator mode, invites, or any lobby changes beyond the active-games list.

## Shared primitive: liveness

A player is **connected** when their heartbeat is recent.

- New module `lib/presence.ts`:
  - `HEARTBEAT_INTERVAL_MS = 15_000` (matches the existing client interval).
  - `PRESENCE_TIMEOUT_MS = 45_000` — three missed heartbeats.
  - `isConnected(lastAlive: number, now: number): boolean` → `now - lastAlive < PRESENCE_TIMEOUT_MS`.
- **Client** derives staleness from the `lastAlive` values it already subscribes to, re-evaluating
  on a local `setInterval` tick (5s) so the UI (prompts + per-player online/offline dots) updates
  even when no Convex write occurs. The tick only forces re-render of derived state; it makes no
  network calls.
- **Server** re-validates staleness with `Date.now()` at the moment any consensus action
  executes. The client's opinion of who is offline is never authoritative.

### Heartbeat bug fix (folded in)

`sendHeartbeat` currently resolves the player with
`ctx.db.query("players").withIndex("byUser", ...).first()`, which returns an **arbitrary** one
of the user's player rows. Once users can be in multiple games at once (which the active-games
list encourages), this can patch the wrong game's row. Fix:

- `sendHeartbeat` takes `{ gameId }` (or `{ joinCode }`) and updates the player row scoped to
  that game (`byGame` index + `userId` filter, matching `getPlayerForCurrentUserForGame`).
- The client passes the current game's id.

## Feature 1 — Active games list

**Query `getMyActiveGames`** (`convex/game.ts`):

- Authenticated. Enumerate the caller's player rows via `players.byUser` (userId = auth subject).
- For each, load the `games` row; include it only when `completedAt` is `null` (not finished).
- Return per game: `joinCode`, `isOpen` (lobby vs in-progress), `currentRound`, `totalRounds`,
  and connected player count (players whose `lastAlive` is fresh).
- Exclude games where the caller's own player row is `active === false` (they were removed).

**UI** — `components/create-join-game.tsx`:

- Add a "Jump back in" section above (or beside) the existing Join / Create actions, rendering
  the `getMyActiveGames` results. Empty result → section hidden.
- Each row shows join code + progress (e.g. "Round 3 of 10" or "In lobby") and a **Resume**
  button that does `replace('/game/${joinCode}')` — the same navigation the join flow uses.

## Feature 2 — Consensus recovery protocol

### Schema additions (`convex/schema.ts`)

- New table `presenceVotes`:
  ```ts
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
- New field on `players`: `active: v.optional(v.boolean())`. Absent/`true` = active; `false` =
  removed by consensus. Soft flag, **not** a hard delete — preserves per-round rows
  (`gameRoundGuesses`, `gameRoundPlayerRankings`) that reference `playerId`, and lets the player
  cleanly rejoin. (See Decision D2.)

### Trigger (Hybrid)

- **Automatic:** when a player's `lastAlive` crosses `PRESENCE_TIMEOUT_MS`, every *other*
  connected player's client surfaces a prompt.
- **Manual:** any connected player can flag another from the roster to open the prompt early
  (e.g. "my wifi just died" out-of-band). Manual flagging surfaces the prompt and lets votes
  pre-collect, but **cannot execute against a player who is still connected** — see Decision D1.

### Voting mutation `castPresenceVote({ joinCode, targetPlayerId })`

One mutation performs *vote → maybe-resolve*:

1. **Auth/validity:** caller must be an `active`, connected player in the game; target must be a
   player in the game and not the caller.
2. **Record vote:** determine `kind` from whether the target is the current round's
   `hostPlayerId` (`reassign-host`) or not (`remove-player`). Insert a `presenceVotes` row for
   `(gameId, roundNumber, targetPlayerId, voterPlayerId, kind)`, deduped so each voter counts once
   per target.
3. **Clear stale votes:** if the target is currently *connected* (heartbeat fresh), delete any
   existing votes for that target and stop — nothing to resolve; a reconnected player is never
   removed. (This is also the auto-cancel path.)
4. **Tally:** denominator = number of currently-connected `active` players **excluding the
   target**. Count distinct voter rows for this target from voters who are still connected.
   Resolve when `agreeingVotes > denominator / 2` (strict simple majority).
   - 2-player game, host drops → denominator 1 → one Agree resolves immediately.
   - 3-player game, host drops → denominator 2 → both remaining must agree.
5. **Execute (only if resolved AND target is server-confirmed stale):**
   - **`reassign-host`:** patch `gameRounds.hostPlayerId` on the *current* round to the
     least-hosted connected `active` player via the shared `pickHost` helper (below). The new
     host's client then drives `advanceGame` as normal — no cron needed.
   - **`remove-player`:** patch the target `players` row to `active: false`. Round-completion
     gating counts only **active** players (`active !== false`), so the round unblocks once the
     vote lands.
   - Delete the resolved target's `presenceVotes` rows after executing.

### `pickHost` helper

Extract the existing "least-hosted, random tie-break" selection from `startNewGameRound`
(`game.ts:341-382`) into `pickHost(ctx, gameId, { among })` where `among` is the candidate player
set. `startNewGameRound` calls it with all players; host reassignment calls it with the connected,
active players excluding the stale host. Round 1's "creator is host" rule stays in
`startNewGameRound` and is unaffected.

### Gating updates

Any "have all players done X" check for the current round must count only **active** players
(`active !== false`). It deliberately does **not** exclude merely-disconnected-but-active players —
that is what forces the consensus vote rather than silently auto-skipping a dropped player. The
concrete case today is the `guess-scenario` completion check that the host's client auto-advance
depends on (`await-guesses.tsx`); update its underlying query (`getGuessesStatusForRound`) so a
*removed* non-host no longer blocks completion. Audit `game.ts` for other "expected == actual
player count" gates and apply the same rule.

### UI

- **Prompt:** when a player is stale, other connected players see a card — *"{name} seems
  disconnected — reassign host?"* (host) or *"…— skip them?"* (non-host) — with an **Agree**
  button and a live "2 of 3 agreed" count sourced from `presenceVotes`.
- **Roster:** per-player online/offline dot (derived from `lastAlive` client-side) and a manual
  "flag as disconnected" affordance.
- Lives in a new `components/game/presence/` component, wired into `components/game/index.tsx`.
  The lobby roster (`components/game/lobby/index.tsx`) also shows the online/offline dots.

## Decisions

- **D1 — Removal is recovery-only, never a general kick.** `castPresenceVote` execution always
  requires the target to be server-confirmed stale (≥ `PRESENCE_TIMEOUT_MS`). Manual flagging only
  surfaces the prompt and pre-collects votes; it can never eject a currently-connected player.
- **D2 — Removed non-hosts are soft-flagged `active: false`, not deleted.** Preserves round data
  integrity (foreign keys from guess/ranking rows) and enables clean reconnection: when their
  heartbeat resumes they are treated as connected again and cleared back to active for the next
  round. (Contrast with the existing `leaveGame`, which hard-deletes on an *intentional* leave.)

## Edge cases

- **Reassigned host reconnects** → they return as an ordinary player; they simply are no longer
  `hostPlayerId`. No special handling.
- **Removed non-host reconnects** → heartbeat resumes → `isConnected` true → treated as active;
  re-cleared to `active: true` so they participate in the next round. They do not retroactively
  rejoin the round they were skipped in.
- **A voter drops mid-vote** → denominator recomputes against currently-connected players on each
  `castPresenceVote`, so a shrinking group can still reach majority.
- **Everyone stale / nobody left to vote** → out of scope; with no connected players there is no
  client to drive recovery. The game simply remains resumable via the active-games list.
- **`sendHeartbeat` for a player who was removed** → resumes heartbeats and flips `active` back to
  true (they are reconnecting).

## Testing (vitest, existing convex-test setup)

- `lib/presence.ts`: `isConnected` at, below, and above the threshold.
- `getMyActiveGames`: returns non-completed games for the user; excludes finished games and games
  where the caller is `active: false`; handles a user in multiple games.
- `sendHeartbeat`: updates the correct game's player row when the user is in multiple games.
- `pickHost`: chooses a least-hosted candidate from the provided set; respects tie-break.
- `castPresenceVote`:
  - reassigns host to a least-hosted connected player when majority + staleness hold;
  - refuses to execute when the target is still connected (D1);
  - soft-removes a non-host and thereby unblocks guess-phase completion;
  - majority math at 2 players (denominator 1) and 3 players (denominator 2);
  - clears votes when the target reconnects.

## Files touched

- `convex/schema.ts` — add `presenceVotes` table, add `players.active`.
- `convex/game.ts` — heartbeat `gameId` fix, extract `pickHost`, add `getMyActiveGames`, add
  `castPresenceVote`, update completion gating to count only active players.
- `lib/presence.ts` — **new**: constants + `isConnected`.
- `components/create-join-game.tsx` — active games ("Jump back in") section.
- `components/game/index.tsx` — heartbeat call passes `gameId`; mount presence prompt/roster.
- `components/game/presence/` — **new**: disconnect prompt + roster online/offline dots + manual
  flag control.
- `components/game/lobby/index.tsx` — online/offline dots on the lobby roster.
- Tests alongside the existing convex test suite.
