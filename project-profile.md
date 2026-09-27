# id-game — verified project profile

2026-08-04. Every claim carries a reproducible pointer. Repo `/Users/g30r93g/Projects/id-game`; remote `github.com/g30r93g/id-game` (public).

## 1. Identity card

**What it actually does.** A real-time, room-based party game. A host is drawn per round, dealt 10 "Most likely to…" scenarios, picks one secretly and ranks every player against it; the others see the same 10 plus the ranking and guess which was chosen. The server holds a six-phase round state machine (`convex/schema.ts:76-92`), players heartbeat every 15s, and a disconnected player is removed / the host reassigned by majority vote of the still-connected players. An admin console (users/games/scenarios) generates scenarios via an LLM. Verified by reading `convex/game.ts` (1,341 lines), not the README.

**README/code gap.** `README.md` is accurate on stack and auth but says *nothing* about the admin console, the LLM scenario pipeline, the AI Gateway, the cron cleanup job or the presence/consensus system — it **understates** the project. Conversely `components/game/lobby/player-card.tsx:25,45` ships an editable display-name field whose submit handler is commented out: a live UI affordance with no backend (his own open issue #38).

**Status: SHIPPED (low traffic, unproven audience).**
- `curl -sI -L https://www.id-game.com` → `HTTP/2 200`, `server: Vercel`. `/game` → `307` to `/sign-in?next=%2Fgame`; `/admin` → `404` for anonymous callers (`app/admin/layout.tsx:8` `notFound()`).
- 18 production deploys in week one; first prod deploy `dpl_2bHoRN6Vp5DSrUCqTEo1QjWgxYuD` at `1743456700922` = **2025-03-31T21:31:40Z** (Vercel API).
- Real telemetry: PostHog client+server, 8 `capture()` call sites, reverse-proxied via `/ingest`.
- A stranger can verify the site serves the game and the repo is public with 56 PRs. A stranger **cannot** verify anyone but George has played. No tags, no releases, 1 star, 0 forks.

**Timeline** (`git log --format='%ad' --date=iso --reverse`, all branches):

| 2025-03 | 2025-04 | 2025-08 | 2026-03 | 2026-07 | Total |
|---|---|---|---|---|---|
| 9 | 77 | 3 | 2 | 125 | **216** (168 on `main`) |

First commit 2025-03-29 16:17Z; last 2026-07-27 00:08+01. Only **19 distinct active days** in 16 months. Gaps > 2 months: 2025-04-20 → 2025-08-26 (4.2mo), 2025-08-26 → 2026-03-01 (6.2mo), 2026-03-02 → 2026-07-06 (4.1mo).

**Authorship caveat an interviewer will see.** `git shortlog -sne --all`: 176 commits George, **40 authored by `Claude <noreply@anthropic.com>`** (all July 2026), plus `Co-Authored-By: Claude` trailers and 5,104 lines of agent-written plan/spec markdown in `docs/superpowers/`. Live guess tallies, host round controls and the passkey fixes were largely agent-implemented against his specs. This is public. For the July 2026 work claim spec/review/architecture ownership, not solo hand-authorship.

## 2. Honest scale

**cloc, generated & vendored excluded:**

`cloc --fullpath --not-match-d='(node_modules|\.next|\.git|_generated|docs|components/ui|convex/betterAuth)' .` → TypeScript 83 files / **8,211**; CSS 123; JavaScript 21; **SUM 86 files / 8,355**.

**Excluded, and why:** `convex/_generated/` 98 (Convex codegen); `convex/betterAuth/` 1,548 (Better Auth component + generated schema; he hand-added 3 index lines at `schema.ts:22`); `components/ui/` 2,847 over 24 files (shadcn/Dice UI copy-ins, incl. `sortable.tsx` 565); `docs/` 5,104 md (agent plans); `pnpm-lock.yaml` 7,883.

**⚠️ PROMINENT: raw tree is 24,736 lines; hand-written is 8,355 = 34%. Two-thirds of the repo is generated, vendored, lockfile or agent-written docs.** Within TypeScript alone, 4,456 of 12,667 lines (35%) are generated/vendored. Never quote a five-figure LOC number here.

Hand-written split: `convex/` 3,126 · `components/` (minus ui) 3,150 · `app/` 1,444 · `lib/` 459 · `providers/` 73. Largest file: `convex/game.ts` (1,341 lines).

**Test surface — real, not decorative.** 8 files, **79 cases**, all passing (`pnpm test` → `Tests 79 passed (79)`, 783ms), 1,631 lines of test TS: `convex/game.test.ts` 24, `presence.test.ts` 12, `admin.test.ts` 8, `cleanup.test.ts` 4, `lib/admin/metrics.test.ts` 19, `continuable.test.ts` 6, `passkey-nudge.test.ts` 4, `presence.test.ts` 2. The Convex tests use `convex-test` and drive real mutations against an in-memory backend — genuine integration coverage of phase transitions, consensus voting and abandonment rules. **Caveat: zero tests existed until 2026-07-10** (`dbbd6c6`), 15 months after launch; the original build had none. No component/E2E tests, no coverage gate, no CI (`.github/` absent).

**Dependency weight — be honest.** A thin-ish application layer over very heavy libraries. Five heaviest lifters, and what he added on top:
1. **Convex** — websocket reactivity, transactional mutations, indexes, free. His: schema/index design, authorisation + phase-legality logic *inside* the functions.
2. **Better Auth (+ `@convex-dev/better-auth`)** — passkeys, OTP, sessions, rate-limit primitive. His: config, DB-backed rate-limit rules, registrable-domain rpID.
3. **shadcn/ui + Radix + Dice UI** — 2,847 lines of UI he did not write.
4. **Vercel AI SDK + AI Gateway** — provider routing, structured-output coercion. His: ~70 lines of route + the style-brief mechanism.
5. **PostHog / Next.js / Vercel** — analytics and hosting, config-level.

Realistic: **~6,700 lines of non-test application code**, of which the genuinely hard, non-library part is ~1,200 lines of Convex game logic (phase machine, presence consensus, continuity rules) plus its tests.

## 3. The five best technically defensible claims

**1. Consensus recovery for dropped players**
> "Designed a majority-vote recovery protocol for dropped players: connected peers vote, host is reassigned or the player deactivated, any heartbeat cancels the vote."

Evidence: `convex/game.ts:1207-1332` (`castPresenceVote`), `:51-95` (`sendHeartbeat` clears open votes), `lib/presence.ts` (15s beat / 45s timeout), `convex/presence.test.ts` (12 cases), spec `docs/superpowers/specs/2026-07-14-reconnect-and-consensus-recovery-design.md`.
*Hostile Q:* "Convex gives you realtime free — what's actually yours?" *Honest A:* Convex gives the subscription, not the protocol. Mine is the decision that liveness is a group judgement, not a server timeout: the denominator is recomputed from *currently connected, active, non-target* players on every call, votes are round-scoped so they expire naturally, and a returning heartbeat unilaterally cancels an in-flight vote. Ties resolve to no action (`agreeing <= denominator/2`); I have not stress-tested concurrent votes against Convex's OCC retries.

**2. Server-enforced phase state machine with one sanctioned rewind**
> "Enforced legal round-phase transitions server-side with host authorisation, idempotent no-ops for retries, and a single audited rewind gated on nothing being locked in."

Evidence: `convex/game.ts:650-742` — `NEXT_PHASE` map; same-phase no-op allowed so a mutation retry doesn't throw; the `pick-scenario → create-scenarios` rewind is legal only if no `gameRoundScenarios` row has `selected: true` (lazily read, `:701-712`). Commit `d5249cf` (PR #49); tests in `convex/game.test.ts`.
*Hostile Q:* "Enforced from day one, or bolted on?" *Honest A:* Bolted on. The 2025 build trusted the client; the guard landed 2026-07-15 once host controls made illegal jumps reachable.

**3. Read-side information leak closed by gating queries on phase and viewer role**
> "Closed three answer-leak paths by gating Convex queries on round phase and viewer identity rather than hiding data in the UI."

Evidence: `canSeeSelectedScenario` (`convex/game.ts:515-528`) blanks `selected` for non-hosts pre-reveal; `getCorrectAnswer` (`:1142-1152`) returns `null` outside `display-results`/`finished`; `getGuessesStatusForRound` (`:1032-1053`) returns `tally: null` unless the viewer is host or has already guessed. Commits `750b797` (#54), `1ce7c03` (#55).
*Hostile Q:* "So the answer was readable by any player for 15 months?" *Honest A:* Yes — anyone reading the Convex subscription in devtools saw it. I found it while adding host controls and fixed it at the query layer, not the UI.

**4. Schema-constrained LLM generation behind an admin guard with per-category style briefs**
> "Built a schema-constrained generation pipeline — Vercel AI SDK `generateObject` + Zod through AI Gateway to Grok — steered by admin-editable, LLM-drafted per-category style briefs."

Evidence: `app/api/admin/generate-scenarios/route.ts` — `generateObject`, `schema: outputSchema` (Zod), model `process.env.AI_SCENARIO_MODEL ?? "xai/grok-4.1-fast-non-reasoning"` (a bare Gateway model id, so routing is AI Gateway); brief fetched from Convex at `:38-40`; a meta-prompt that *drafts* the brief in `generate-brief/route.ts`; briefs stored on `scenarioCategories.brief` (`convex/schema.ts:73`). Live guard proof: `curl -X POST https://www.id-game.com/api/admin/generate-scenarios` → `403 {"error":"Admin access required."}`.
*Hostile Q:* "What happens when the model returns garbage or the call fails?" *Honest A:* Not much, and I'd fix that first. **No retry, no backoff, no repair loop, no dedupe against existing scenarios, no moderation pass, no observability beyond a 502 carrying the raw error.** Validation is Zod shape + trim + drop-empties + `slice(count)` (`:60-63`); the safety rails are prompt-level only. The mitigation is that a human admin reviews every candidate before `admin.createScenarios` writes it.

**5. Migrated live auth twice, ending on passkey-first with DB-backed rate limiting**
> "Migrated live auth twice (Convex Auth → Clerk → Better Auth-on-Convex), landing passkey-first sign-in with DB-backed OTP rate limits and subdomain-portable rpID."

Evidence: `f9a4569` (2025-04-02), PR #41 `325473d` (2026-07-10, 21 commits, net −493 on the sign-in surface); `convex/auth.ts:44-58` replaces Better Auth's in-memory rate limiter with `storage: "database"` because Convex's ephemeral isolates make in-memory meaningless, plus a 6/60s rule on OTP send; `:36-40` derives WebAuthn `rpID` from the registrable domain so passkeys survive `www` → apex.
*Hostile Q:* "Isn't this just reading three quickstarts?" *Honest A:* Largely yes — Better Auth ships the plugins. Mine was the failure-mode reasoning: the isolate/rate-limit mismatch, and an rpID choice that would otherwise have invalidated every passkey on a domain change.

**Rejected as library achievements:** "realtime multiplayer" (Convex websockets), "passkeys/WebAuthn" (Better Auth), "admin console UI" (shadcn tables), "deployed on Vercel".

## 4. Interview stories

**HARDEST BUG — the sign-in state machine.** `app/(auth-routes)/sign-in/[[...sign-in]]/page.tsx` is the second-most-churned file (20 touches). Symptom: users tapped "Sign in with passkey", the OS sheet appeared, they dismissed it — and got a red error toast; separately four actions shared one `busy` boolean so every button showed the same spinner, and a conditional-passkey promise resolving after unmount set state on a dead component. Five commits in PR #52 (`f5595d3`, `1edf6f2`, `b35f39f`, `ddd9af5`, `72360b2`). Root cause: one boolean modelling a four-state async machine, plus treating a user *cancellation* as an *error*. Fix: a discriminated `action` state (`busy` becomes derived so every `disabled=` prop keeps its meaning), swallow dismissals, guard late resolutions, re-arm the passkey nudge on a 14-day cooldown instead of permanently (`lib/passkey-nudge.ts`, 4 tests). *Caveat: those five commits are authored by `Claude`; framing and review are his.*

**BEST DECISION — put liveness in the database and derive everything from it.** One field, `players.lastAlive`, written by a 15s heartbeat. Later features leaned on it without new plumbing: consensus recovery, "Jump back in" continuity (`lib/continuable.ts` measures idle against *newest heartbeat*, never creation time), the hourly abandonment cron (`convex/cleanup.ts`), the admin `activeNow` stat, the `createGame` dead-lobby dedupe. Evidence it paid off: PRs #45, #46, #50, #56 all consumed it; none changed it.

**THE REMOVAL — Clerk.** `c64f356` (2026-07-09), the largest negative-delta commit: **+238 / −731**, deleting `sign-up/[[...sign-up]]/page.tsx`, `sso-callback/page.tsx`, `lib/auth.ts`, `providers/ConvexClerkClientProvider.tsx`, and at `04f6ca8` the Clerk dependency and env vars. Why: collapse identity and data into one deployment so auth tables sit beside game tables and `identity.subject` *is* the user id. Cost: a deliberate clean slate — the spec (`e6a02ee`) records the decision to wipe game tables at cut-over rather than migrate users. Saved: one vendor, one JWT hop, the password/SSO surface. Second removal: `convex/scenarioAI.ts` deleted at `15b8896` when generation moved from a Convex action to a Next route to reach the AI Gateway.

**SCOPE CUT — plainly.**
- Lobby display-name editing: `Editable` rendered, `onSubmit` **commented out** (`components/game/lobby/player-card.tsx:25,45`); no `displayName` patch mutation exists. Open issue #38.
- The user-tray rename (`authClient.updateUser`) affects only *future* joins — `players.displayName` is snapshotted at join, so a rename never reaches a game you're already in.
- Full per-phase disconnection semantics deferred to open issue #51 (`baecf90`, −121 net).
- Eight remote branches; `fix/auth-feedback-and-passkey-promotion` (10 ahead), `claude/id-game-refinements-5hzseo` (22) and `chore/prune-duplicate-scenarios` (1) are stale duplicates of squashed work.
- No CI, tags or releases. Zero `TODO`/`FIXME` markers — debt lives in issues and dead branches.

## 5. Externally verifiable numbers

**Anyone can check right now:**
- `https://www.id-game.com` → HTTP 200, renders the landing page; `/game` 307s to sign-in; `/api/admin/generate-scenarios` → 403 without an admin session.
- `github.com/g30r93g/ID-Game`: public, created 2025-03-31T21:03:19Z, **56 PRs (all his)**, 2 open issues (both his), **1 star, 0 forks, 0 releases, 0 tags**, last push 2026-07-26.
- `git shortlog -sne --all` shows the 176/40 George/Claude split — assume interviewers see it. `pnpm test` → 79/79.

**Verifiable only with George's accounts — screenshot these:**
- Vercel deployment list with timestamps (proves the 2025-03-31T21:31Z first deploy and the cadence).
- PostHog: unique users and `new_game` / `join_game` counts — the *only* way to show players other than himself.
- Convex prod dashboard (`hushed-panda-756`): row counts for `games` (started/completed), distinct `players.userId`, `gameRating`. Prod is MCP-flagged read-only/PII-gated, so these were **not** verified here.
- AI Gateway usage/spend for the Grok calls.

**State no user number until one of the above is in hand. There is currently zero in-repo evidence that anyone but George has played.**

## 6. Claims I must NOT make

- ❌ **"Under 50 hours"** as stated — see verdict: 53.2h to first prod deploy, 66.6h to working auth.
- ❌ Any LOC figure above ~8,400. 66% of the tree is generated/vendored/lockfile/agent docs.
- ❌ "Users", "players", "adoption", any traffic number. Unevidenced.
- ❌ Solo authorship of the July 2026 features — 40 commits are authored by Claude in public history.
- ❌ "Test-driven" — the first test landed 2026-07-10, 15 months post-launch.
- ❌ Display-name editing as a feature (UI-only, handler commented out).
- ❌ "Rate-limited AI endpoint" — the LLM routes have **no** rate limit or cost cap, only the admin role check. A stolen admin session can burn Gateway spend at 25 scenarios/request, uncapped.

**Security weaknesses an interviewer *will* find in the public code — fix before applying:**
- **`startNewGameRound` (`convex/game.ts:425`) has no auth check at all** — no `getUserIdentity()`, no host check. Convex functions are public endpoints, and the deployment URL is in the client bundle (confirmed `https://hushed-panda-756.convex.cloud`, grepped from `/_next/static/chunks/*.js`). Anyone with a `games` id can force-advance any live game.
- **`closeGameToNewPlayers` (`convex/game.ts:265`) has no auth check** — a bare `ctx.db.patch(args.game, { isOpen: false })`. Anyone can lock any lobby.
- **Seven unauthenticated read queries leak game state**: `fetchGameByJoinCode`, `getPlayersForGame`, `getGameRoundsForGame`, `getCurrentGameRound`, `getCurrentGameRoundHostPlayer`, `getPlayerRankingsForRound`, `getGuessesForRound`. **Demonstrated live against production** (read-only): `curl -X POST https://hushed-panda-756.convex.cloud/api/query -d '{"path":"game:fetchGameByJoinCode","args":{"joinCode":"AAAAAA"},"format":"json"}'` → `HTTP 200 {"status":"success","value":null}`, whereas `game:getMyActiveGames` errors on auth. One valid join code (6 chars, 31-char alphabet, `convex/game.ts:10`) yields the `games` id, which unlocks the rest — display names, rankings, guesses.
- **Good news, say it:** API keys are server-side only (`AI_GATEWAY_API_KEY` read in a route handler; auth secrets on the Convex deployment). All 16 admin functions are guarded by `requireAdmin` (`convex/adminAuth.ts`); `/admin` 404s rather than 403s.

## 7. One-line verdict

**Earns a CV slot.** Strongest bullet:

> **The ID Game** (id-game.com) — shipped a real-time party game to production **53 hours after `create-next-app`**, then designed the hard parts: a server-enforced round phase machine, a majority-vote recovery protocol for dropped players, and a Zod-schema-constrained Grok pipeline through Vercel AI Gateway steered by per-category style briefs. Next.js · Convex · Better Auth · AI SDK. 79 passing tests.

**On "under 50 hours" — blunt. Not supportable as written.** Initial commit `ee3a4f6` 2025-03-29T16:17:48Z → first production deploy `dpl_2bHoRN6…` 2025-03-31T21:31:40Z = **53h 14m elapsed**. The `Game v1` commit (`df7c99c`, +9,588 lines, the whole playable game in one drop) landed 2025-03-31T21:01Z = 52h 43m. Auth was broken at that deploy and fixed 2025-04-01T10:51Z (PR #4) = **66h 34m** to a genuinely usable launch. If "50 hours" means *hours worked* it is plausible but unfalsifiable — no artifact measures effort. Say **"live in production 53 hours from an empty repo"**: provable from the Vercel log, impossible to pick apart. Do not imply continuous work after — three gaps of 4+ months, 19 active days in 16 months. Honest frame: *built fast in a weekend, then iterated in three concentrated bursts*.
