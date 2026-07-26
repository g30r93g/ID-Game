# Game Refinements — PR Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan PR-by-PR. Steps use checkbox (`- [ ]`) syntax for tracking. Unlike the single-feature plans in this directory, this document covers **five independently shippable PRs** — finish and merge one before starting the next unless the dependency notes say otherwise.

**Goal:** Land seven identified refinements — auth feedback, category back-navigation, live guess tallies, a host scenario peek, a How To Play slideshow, disconnection re-inclusion, and a native share sheet — as five reviewable PRs that can be merged independently. Four are specified here; the fifth (disconnection recovery) is deferred to [#51](https://github.com/g30r93g/ID-Game/issues/51).

**Architecture:** Every PR is additive on the existing Convex + Next.js shape; none needs a schema migration. The two client-only PRs (auth feedback, chrome polish) carry no backend risk and go first. The game-logic PRs split along the `convex/game.ts` function clusters they touch — round mutations (PR 3), presence/lifecycle (PR 4), guesses (PR 5) — so they can be reviewed in isolation.

**Tech Stack:** Next.js 16 (App Router) · Convex · Better Auth (`@convex-dev/better-auth` + passkey/emailOTP plugins) · shadcn/ui + Tailwind v4 · `motion` (already a dependency) · vitest + convex-test. There is no React test harness — client tasks are verified by `pnpm exec tsc --noEmit`, `pnpm lint`, and a manual dev check.

## Global Constraints

- Package manager: **pnpm**. Node `>=20.19`.
- No schema migrations in this roadmap. If a task appears to need a new table, stop and re-scope — every refinement here is expressible against the existing schema.
- Convex functions keep the house shape: `v` validators, `ctx.auth.getUserIdentity()` for identity, `requireAdmin` for admin-only paths, relative imports into `lib/` (`../lib/...`) because `convex/tsconfig.json` does not define the `@/` alias.
- Presence constants stay in `lib/presence.ts` — do not re-declare `PRESENCE_TIMEOUT_MS` or `HEARTBEAT_INTERVAL_MS` anywhere else.
- Backend behaviour changes need a convex-test case in the matching test file (`convex/game.test.ts` for round logic, `convex/presence.test.ts` for presence).
- Commit after every task. One branch per PR, all branched from the latest default branch.
- Do NOT open a PR unless the user asks.

---

## PR grouping at a glance

| # | Branch | Refinements | Backend? | Depends on |
|---|--------|-------------|----------|-----------|
| 1 | `fix/auth-feedback-and-passkey-promotion` | Auth acknowledgement/loading; passkey promotion | No | — |
| 2 | `feat/instructions-slideshow-and-share-sheet` | How To Play slideshow; share sheet | No | — |
| 3 | `feat/host-round-controls` | Change category; peek scenario (+ answer-leak fix) | Yes (round) | — |
| 4 | *deferred* | Disconnection recovery | — | [#51](https://github.com/g30r93g/ID-Game/issues/51) |
| 5 | `feat/live-guess-tallies` | Live voting/tallies of scenario guesses | Yes (guesses) | PR 3 |

**Ordering:** PR 1 and PR 2 can land immediately, in either order. PR 3 follows. PR 5 rebases onto PR 3 — both edit `components/game/await-guesses.tsx`, and PR 5 relies on the query gating introduced in PR 3. PR 4 is deferred to [#51](https://github.com/g30r93g/ID-Game/issues/51) pending a product decision on host reassignment, and blocks nothing else here.

---

# PR 1 — Auth acknowledgement and passkey promotion

**Branch:** `fix/auth-feedback-and-passkey-promotion`

**Goal:** Make sign-in legible. Every auth action acknowledges itself, a cancelled passkey prompt is not an error, and users who signed in with a code are steered towards a passkey more than once.

**Why it's brittle today:** a single `busy` boolean (`app/(auth-routes)/sign-in/[[...sign-in]]/page.tsx:50`) gates four different actions, so the UI cannot distinguish "waiting on the OS passkey sheet" from "verifying your code". The WebAuthn prompt can sit open for many seconds showing only a spinner inside a button, a user-cancelled prompt surfaces as a hard error, and success navigates with no interstitial while the session cookie → Convex JWT handoff is still in flight.

**Files:**
- Modify: `app/(auth-routes)/sign-in/[[...sign-in]]/page.tsx`
- Modify: `components/user-tray.tsx`
- Modify: `app/(auth-routes)/layout.tsx`

### Task 1.1: Replace the single `busy` flag with a discriminated action state

**Interfaces:**
- Produces: `type AuthAction = null | "passkey" | "send-code" | "verify" | "add-passkey"`; a single `action` state replaces `busy`.
- Consumes: nothing new.

- [ ] **Step 1:** Replace `const [busy, setBusy] = React.useState(false)` with `const [action, setAction] = React.useState<AuthAction>(null)`. Derive `const busy = action !== null` so the existing `disabled={busy}` props keep working unchanged.
- [ ] **Step 2:** Set the specific action in each handler (`handlePasskey` → `"passkey"`, `sendCode` → `"send-code"`, `verifyCode` → `"verify"`, `handleAddPasskey` → `"add-passkey"`), clearing to `null` in each `finally`.
- [ ] **Step 3:** Give each button its own in-flight label rather than a bare spinner, e.g. the passkey button renders `Waiting for your device…` while `action === "passkey"`, the OTP submit renders `Verifying…`, the resend renders `Sending…`.
- [ ] **Step 4:** Verify `pnpm exec tsc --noEmit && pnpm lint`.
- [ ] **Step 5:** Commit — `fix(auth): track which auth action is in flight`.

### Task 1.2: Treat a cancelled passkey prompt as a non-error

**Interfaces:**
- Produces: `handlePasskey` distinguishes user-cancellation (`NotAllowedError`, or an aborted request) from a genuine failure.

- [ ] **Step 1:** In `handlePasskey`, inspect the returned error before calling `setError`. A `NotAllowedError` / `AbortError` means the user dismissed the OS sheet — clear the action and return silently rather than rendering "Passkey sign-in failed. Try emailing yourself a code instead."
- [ ] **Step 2:** Keep the existing fallback copy for every other error, and surface the "Email me a code" button more prominently once a real passkey failure has occurred.
- [ ] **Step 3:** Verify: `pnpm exec tsc --noEmit`. Manual — click "Continue with passkey" and dismiss the OS sheet; no error text should appear.
- [ ] **Step 4:** Commit — `fix(auth): don't surface a dismissed passkey prompt as an error`.

### Task 1.3: Abort the conditional-UI autofill request properly

**Interfaces:**
- Produces: the conditional-mediation effect (`page.tsx:63-84`) owns an `AbortController` and aborts on unmount or when a manual passkey sign-in starts.

- [ ] **Step 1:** The current effect sets a `cancelled` boolean in its cleanup, which prevents the `.then` from firing but leaves the browser's conditional WebAuthn request live. Create an `AbortController` in the effect, pass its signal into the `signIn.passkey({ autoFill: true })` options, and call `abort()` in the cleanup.
- [ ] **Step 2:** Hold the controller in a ref so `handlePasskey` can abort the autofill request before opening a modal passkey prompt — two concurrent WebAuthn requests are what makes the manual button feel dead on some browsers.
- [ ] **Step 3:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — on a browser with conditional mediation, focus the email field (autofill offers the passkey), then click "Continue with passkey"; the modal prompt should open.
- [ ] **Step 4:** Commit — `fix(auth): abort conditional passkey autofill on unmount and manual sign-in`.

### Task 1.4: Add a post-auth interstitial

**Interfaces:**
- Produces: a "Signing you in…" state rendered between a successful credential exchange and `router.push(nextPath)`.

- [ ] **Step 1:** Add a `"redirecting"` step to the existing `Step` union. Enter it on success in `handlePasskey`, `verifyCode` (when a passkey already exists), and `handleAddPasskey`, then push.
- [ ] **Step 2:** Render a minimal centred card for that step so the gap between credential success and the `/game` first paint is acknowledged. `proxy.ts:46-53` gates `/game` on cookie presence only, so this window is real: the cookie is set before the Convex client has a token.
- [ ] **Step 3:** Verify: `pnpm exec tsc --noEmit && pnpm lint`.
- [ ] **Step 4:** Commit — `feat(auth): acknowledge sign-in before redirecting`.

### Task 1.5: Promote passkeys beyond the one-shot prompt

**Interfaces:**
- Consumes: `authClient.passkey.listUserPasskeys()`, `authClient.passkey.addPasskey()`.
- Produces: a recurring nudge, plus passkey management in `UserTray`.

- [ ] **Step 1:** Today the nudge only fires inside `verifyCode` when the account has zero passkeys, and "Maybe later" (`page.tsx:425-432`) is terminal — the user is never asked again. Persist a dismissal timestamp in `localStorage` and re-offer after it ages out, so declining once isn't permanent.
- [ ] **Step 2:** Strengthen the `add-passkey` card copy to state the concrete benefit (no more waiting on emailed codes) rather than describing the mechanism.
- [ ] **Step 3:** In `components/user-tray.tsx`, add a passkey section to the existing dialog: list registered passkeys via `listUserPasskeys()`, offer "Add a passkey" when the list is empty, and show a small prompt in the tray itself for passkey-less accounts.
- [ ] **Step 4:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — sign in with a code on an account with no passkey, decline the prompt, and confirm the tray still offers to add one.
- [ ] **Step 5:** Commit — `feat(auth): keep promoting passkeys after the first decline`.

### Task 1.6: PR 1 verification sweep

- [ ] `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build` — all clean.
- [ ] Manual matrix: passkey sign-in; passkey dismissed; passkey on a device with none enrolled; email code happy path; wrong code; resend; sign-up with display name; `?next=` deep link preserved through each.

---

# PR 2 — How To Play slideshow and native share sheet

**Branch:** `feat/instructions-slideshow-and-share-sheet`

**Goal:** Two self-contained presentation changes with no backend surface. Grouped because each is a single component and neither touches a file any other PR in this roadmap edits.

**Files:**
- Modify: `components/game/game-instructions.tsx`
- Modify: `components/game/lobby/index.tsx`

### Task 2.1: Turn How To Play into a slideshow

**Interfaces:**
- Consumes: `motion` (already in `package.json`), existing `Dialog` primitives.
- Produces: `GameInstructions` renders one step at a time with next/back controls and a progress indicator.

- [ ] **Step 1:** Extract the eight `<li>` items plus the "Tip" card (`game-instructions.tsx:35-65`) into a module-level `SLIDES` array of `{ title, body }`. The tip becomes its own slide rather than an `<li>`-sibling `<Card>` — note the current markup nests a `<Card>` directly inside an `<ol>`, which is invalid HTML; the slideshow removes that.
- [ ] **Step 2:** Render the active slide with a `motion` enter/exit transition, keyed on the slide index so direction reads correctly.
- [ ] **Step 3:** Replace the single "Okay" footer button with Back / Next, where Next becomes "Got it" (closing the dialog) on the final slide. Add dot indicators.
- [ ] **Step 4:** Support keyboard arrows and reset to slide 0 whenever the dialog reopens.
- [ ] **Step 5:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — open How To Play, page through, close and reopen (should start at slide 1).
- [ ] **Step 6:** Commit — `feat(game): make How To Play a slideshow`.

### Task 2.2: Open the native share sheet for the join code

**Interfaces:**
- Produces: `LobbyGamePhase`'s share button calls `navigator.share` when available and falls back to the existing clipboard path.

- [ ] **Step 1:** Rename `copyUrl` (`lobby/index.tsx:34-46`) to `shareGame` and branch on `typeof navigator !== "undefined" && !!navigator.share`.
- [ ] **Step 2:** Share a payload of `title` ("The ID Game"), `text` (an invite naming the join code) and the existing `url`. Both prerequisites for the share sheet are already met: it is invoked from a click handler (user gesture) and the app is HTTPS in production.
- [ ] **Step 3:** Swallow `AbortError` — the user dismissing the share sheet is not a failure and must not fire the "Failed to copy URL" toast. Any other rejection falls through to the clipboard path so the existing behaviour is preserved.
- [ ] **Step 4:** Keep the clipboard branch exactly as-is for desktop browsers without `navigator.share`, including its toast copy.
- [ ] **Step 5:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — on a mobile browser the OS share sheet opens; on desktop Firefox the clipboard toast still appears.
- [ ] **Step 6:** Commit — `feat(game): open the native share sheet for the join code`.

### Task 2.3: PR 2 verification sweep

- [ ] `pnpm exec tsc --noEmit && pnpm lint && pnpm build` — all clean.
- [ ] Confirm no Convex function or schema file appears in `git diff --name-only main...`.

---

# PR 3 — Host round controls: change category, peek scenario

**Branch:** `feat/host-round-controls`

**Goal:** Give the round host two controls they currently lack — backing out of a category choice, and re-checking the scenario they picked — and close the two queries that leak the round's answer to non-hosts.

**Why these ship together:** both are host-only round affordances, both edit the round mutations in `convex/game.ts`, and both change the phase branches in `components/game/index.tsx` and `components/game/await-guesses.tsx`. Split apart, the second PR would spend its whole diff rebasing onto the first.

**Files:**
- Modify: `convex/game.ts` (`transitionRoundPhase`, `selectScenariosForGameRound`, `gameRoundScenarios`, `getCorrectAnswer`)
- Modify: `components/game/index.tsx`
- Modify: `components/game/create-scenarios.tsx`
- Modify: `components/game/pick-scenario.tsx`
- Modify: `components/game/rank-players.tsx`
- Modify: `components/game/await-guesses.tsx`
- Create: `components/game/scenario-banner.tsx`
- Test: `convex/game.test.ts`

### Task 3.1: Stop leaking the round's answer to non-hosts

**Interfaces:**
- Produces: `gameRoundScenarios` omits `selected` for callers who are not the round host until the round reaches `display-results`; `getCorrectAnswer` returns `null` before `display-results`.

This task comes first because PR 5's live tallies make the leak trivially exploitable, and because both later tasks in this PR touch the same query.

- [ ] **Step 1: Write the failing tests.** In `convex/game.test.ts`, seed a round in `guess-scenario` with one selected scenario, then assert:
  - `gameRoundScenarios` called as a non-host returns every scenario with `selected === false`;
  - the same call as the host returns the true `selected` flag;
  - `getCorrectAnswer` returns `null` for a round in `guess-scenario` and the description once the round is in `display-results`.
- [ ] **Step 2: Run to verify they fail.** `pnpm test convex/game.test.ts` — the non-host currently sees `selected: true`, and `getCorrectAnswer` returns the description in every phase.
- [ ] **Step 3: Implement.** In `gameRoundScenarios` (`convex/game.ts:470-498`), resolve the round and its host, compare against `ctx.auth.getUserIdentity()`, and blank the flag when the caller is neither the host nor viewing a finished round:

```ts
const revealSelected =
  isRoundHost || round.phase === "display-results" || round.phase === "finished";

return scenarios.map((scenario) => ({
  ...scenario,
  selected: revealSelected ? scenario.selected : false,
  scenarioDetails: scenarioMap.get(scenario.scenarioId) ?? null,
}));
```

  Apply the same phase guard in `getCorrectAnswer` (`convex/game.ts:957-981`).
- [ ] **Step 4: Confirm no caller regresses.** `components/game/display-results.tsx:37` reads `getCorrectAnswer` only in the `display-results` phase, and `index.tsx:300-303` reads `selected` only on the host branch — both stay correct. `guess-scenario.tsx:31` keeps working because it never reads `selected`.
- [ ] **Step 5: Run to verify they pass.** `pnpm test convex/game.test.ts`.
- [ ] **Step 6: Commit** — `fix(game): hide the selected scenario from non-hosts until results`.

### Task 3.2: Make category selection re-runnable

**Interfaces:**
- Produces: `selectScenariosForGameRound` replaces any scenarios already drawn for the round instead of appending.

- [ ] **Step 1: Write the failing test.** Call `selectScenariosForGameRound` twice for the same round and assert exactly 10 `gameRoundScenarios` rows exist, all from the second category.
- [ ] **Step 2: Run to verify it fails.** Currently 20 rows exist — the mutation (`convex/game.ts:500-540`) only inserts.
- [ ] **Step 3: Implement.** Before inserting, collect the round's existing `gameRoundScenarios` via the `byRound` index. If any is `selected`, throw — a category cannot be changed once the scenario is locked in (`selectGameRoundScenario` has already incremented `scenarios.timesSelected`, and unwinding that is out of scope). Otherwise delete them all, then insert the new draw.
- [ ] **Step 4: Run to verify it passes.** `pnpm test convex/game.test.ts`.
- [ ] **Step 5: Commit** — `feat(game): re-drawing scenarios replaces the previous category`.

### Task 3.3: Allow the one legal backward phase transition

**Interfaces:**
- Produces: `transitionRoundPhase` accepts `pick-scenario → create-scenarios` when no scenario is selected; every other rewind stays rejected.

- [ ] **Step 1: Write the failing tests.** Assert the backward transition succeeds for a round with no selected scenario, and still throws `Illegal phase transition` when a scenario is selected, and for every other backward pair (e.g. `rank-players → pick-scenario`).
- [ ] **Step 2: Run to verify they fail.** The `NEXT_PHASE` map (`convex/game.ts:580-596`) rejects all backward moves; this behaviour was deliberate (#49), so the exception must be narrow and tested.
- [ ] **Step 3: Implement.** Add an explicit allowance next to the `NEXT_PHASE` check rather than loosening the map:

```ts
const isCategoryRewind =
  gameRound.phase === "pick-scenario" && args.toPhase === "create-scenarios";
```

  Gate `isCategoryRewind` on there being no selected `gameRoundScenarios` row for the round, and keep the existing host-only authorisation ahead of it.
- [ ] **Step 4: Run to verify they pass.** `pnpm test convex/game.test.ts`.
- [ ] **Step 5: Commit** — `feat(game): allow the host to rewind to category selection`.

### Task 3.4: "Change category" control in the pick-scenario UI

**Interfaces:**
- Consumes: Tasks 3.2 and 3.3.
- Produces: `PickScenarioGamePhase` takes a `goBack: () => void` prop and renders a secondary control beside "Pick Scenario".

- [ ] **Step 1:** Add a `goBack` handler in `components/game/index.tsx` alongside `advanceGame`, calling `transitionRoundPhase({ gameRoundId, toPhase: "create-scenarios" })`.
- [ ] **Step 2:** Thread it into `PickScenarioGamePhase` and render a "Change category" button. Disable it while a selection mutation is in flight.
- [ ] **Step 3:** In `components/game/create-scenarios.tsx`, seed `selectedCategory` from the round's existing draw so returning to the picker shows which category was chosen rather than resetting to nothing.
- [ ] **Step 4:** Fix the pre-existing bug at `pick-scenario.tsx:85-97` while here — that submit button is a plain `Button` gated on `{!isLoading && ...}`, so its label vanishes mid-submit and leaves an empty button. Use `LoadingButton` as the other phases do.
- [ ] **Step 5:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — as host, pick a category, go back, pick a different one, and confirm 10 scenarios from the new category appear.
- [ ] **Step 6: Commit** — `feat(game): let the host change category before picking`.

### Task 3.5: Host scenario peek

**Interfaces:**
- Produces: `components/game/scenario-banner.tsx` exporting a shared banner; rendered in `rank-players` and, for the host, in `await-guesses`.

- [ ] **Step 1:** Extract the banner markup from `rank-players.tsx:78-84` into `components/game/scenario-banner.tsx` taking `{ scenario: string }`, and have `RankPlayersGamePhase` use it. Pure refactor, no visual change.
- [ ] **Step 2:** Pass the selected scenario description into `AwaitGuessesGamePhase` from `index.tsx` — the shell already resolves it at `index.tsx:300-303` for the rank-players branch; reuse the same expression for the `guess-scenario` host branch.
- [ ] **Step 3:** Render the banner above the guesser list in `await-guesses.tsx`, collapsed behind a "Show scenario" toggle so a host holding their phone up doesn't reveal it by accident. Default collapsed.
- [ ] **Step 4:** Guard the prop as optional so the non-host render path (`guess-scenario.tsx:44` renders `AwaitGuessesGamePhase` with `isHost={false}` after guessing) never receives it. Task 3.1 means a non-host client cannot resolve the scenario even if the prop were threaded by mistake.
- [ ] **Step 5:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — as host, advance to the guess phase, toggle the scenario open, confirm it matches what was picked; as a player, confirm nothing is shown.
- [ ] **Step 6: Commit** — `feat(game): let the host re-check their scenario during guessing`.

### Task 3.6: PR 3 verification sweep

- [ ] `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build` — all clean.
- [ ] Manual full round with three profiles: category → change category → pick → rank → guess (host peeks) → results.
- [ ] Confirm in the browser devtools network panel that a non-host's `gameRoundScenarios` subscription contains no `selected: true` row before results.

---

# PR 4 — Disconnection recovery  *(deferred)*

**Deferred to [#51](https://github.com/g30r93g/ID-Game/issues/51).** Not blocked on effort — blocked on a product decision.

Scoping this against the `CGHZ18` report turned up that a disconnected **host** is never flagged inactive; `castPresenceVote` reassigns `hostPlayerId` instead (`convex/game.ts:1073-1074`). So "the player went missing" is structurally a non-host problem, and the host case is a separate failure: the round's in-flight state was owned by someone who is no longer the host. Four of those handover states are broken today, one of them terminally — a host reassigned during `pick-scenario` after a selection leaves the round permanently unadvanceable.

The issue carries the full per-phase case matrix for both branches, the five concrete defects, and four open questions. Pick it up from there.

Two cross-references worth keeping in mind while the rest of this roadmap lands:

- **PR 3 incidentally fixes defect B3.** Making `selectScenariosForGameRound` replace rather than append (Task 3.2) also stops a reassigned host drawing a second set of 10 scenarios.
- **PR 5 is unaffected.** It depends on PR 3, not on this.

---

# PR 5 — Live guess tallies

**Branch:** `feat/live-guess-tallies`
**Depends on:** PR 3 (query gating in Task 3.1; both PRs edit `await-guesses.tsx`)

**Goal:** During the guess phase, show votes landing in real time — a per-scenario tally that fills in as players commit — instead of the current row of anonymous spinners.

**Visibility rule (the whole design decision):** the tally is returned only to callers who can no longer act on it — the round host, and non-host players who have already submitted their guess. A player who has not yet guessed receives `tally: null`, so no one can copy the room. Enforced server-side, since the query is the only thing feeding the client.

**Files:**
- Modify: `convex/game.ts` (`getGuessesStatusForRound`)
- Modify: `components/game/await-guesses.tsx`
- Modify: `components/game/guess-scenario.tsx`
- Test: `convex/game.test.ts`

### Task 5.1: Return a gated tally from `getGuessesStatusForRound`

**Interfaces:**
- Produces:

```ts
{
  guessingCompleteByAllUsers: boolean;
  playerGuesses: { player: Id<"players">; displayName: string; hasGuessed: boolean }[];
  viewerHasGuessed: boolean;
  tally: null | { scenarioId: Id<"gameRoundScenarios">; description: string; count: number }[];
}
```

- [ ] **Step 1: Write the failing tests.** Seed a round in `guess-scenario` with three non-host players, two of whom have guessed. Assert: the host receives a `tally` summing to 2; a player who has guessed receives the same tally; a player who has not receives `tally: null` but still receives the `playerGuesses` list; and an unauthenticated caller receives `tally: null`.
- [ ] **Step 2: Run to verify they fail.** `pnpm test convex/game.test.ts` — the query (`convex/game.ts:856-900`) returns no tally and never reads identity.
- [ ] **Step 3: Implement.** Resolve the caller's player row from `ctx.auth.getUserIdentity()`; the query is currently unauthenticated, so treat a missing identity as "not allowed to see the tally" rather than throwing — `display-results` and the host both keep working. Group the round's guesses by `scenarioId`, join through `gameRoundScenarios` to `scenarios` for descriptions, and include every scenario at count 0 so the list is stable as votes land. Return `tally: null` unless the caller is the host or has guessed.
- [ ] **Step 4:** Deliberately exclude voter identities from the tally — counts only. Who guessed what is revealed at `display-results` by `getGuessesForRound`, and moving that reveal earlier changes the game, not just the UI. If per-voter attribution is wanted later it belongs in its own change.
- [ ] **Step 5: Run to verify they pass.** `pnpm test convex/game.test.ts`.
- [ ] **Step 6: Commit** — `feat(game): return a gated live guess tally`.

### Task 5.2: Render the live tally

**Interfaces:**
- Consumes: Task 5.1.
- Produces: `AwaitGuessesGamePhase` renders the tally when present, keeping the existing per-player checklist.

- [ ] **Step 1:** Add a tally section above the existing player list in `await-guesses.tsx`, one row per scenario with a count and a proportional bar. Sort by count descending, tie-broken stably by scenario id so rows don't jump as votes arrive.
- [ ] **Step 2:** Animate count changes with `motion` — the point of the feature is watching votes land. Keep it to the bar width and the number.
- [ ] **Step 3:** Render nothing where `tally === null`, so the pre-guess view is unchanged.
- [ ] **Step 4:** Do not let the tally interfere with the auto-advance effect (`await-guesses.tsx:43-51`) — it stays keyed on `guessingCompleteByAllUsers` and `isHost` only.
- [ ] **Step 5:** Verify: `pnpm exec tsc --noEmit && pnpm lint`.
- [ ] **Step 6: Commit** — `feat(game): show live guess tallies as votes land`.

### Task 5.3: Derive `hasGuessed` from the server

**Interfaces:**
- Produces: `GuessScenarioGamePhase` reads `viewerHasGuessed` from the query instead of local state.

- [ ] **Step 1:** `guess-scenario.tsx:41` holds `hasGuessed` in component state, so a refresh mid-phase returns the player to the guessing UI even though their guess is recorded — and with Task 5.1 in place it would also hide the tally they had earned. Subscribe to `getGuessesStatusForRound` and use `viewerHasGuessed`.
- [ ] **Step 2:** Keep the local flag as an optimistic overlay so the switch to the waiting view stays instant, OR-ing it with the server value.
- [ ] **Step 3:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — guess, hard-refresh, confirm the waiting view with the tally is restored rather than the guessing UI.
- [ ] **Step 4: Commit** — `fix(game): derive guess submission state from the server`.

### Task 5.4: PR 5 verification sweep

- [ ] `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build` — all clean.
- [ ] Manual with four profiles: as each player guesses, confirm the tally appears only for players who have already guessed and for the host, and that a player who has not guessed sees no counts anywhere in their network traffic.

---

## Rollout order

1. **PR 1** and **PR 2** — client-only, no deployment coupling; merge as soon as they're reviewed.
2. **PR 3** — needs a Convex deploy. It changes query *responses* (`selected` is blanked for non-hosts), so deploy the backend and the client together.
3. **PR 5** — after PR 3 is merged and deployed.
4. **PR 4** — deferred to [#51](https://github.com/g30r93g/ID-Game/issues/51); slots in whenever the host-reassignment questions are answered.

No migration is required at any step: every change is to function behaviour, not to stored documents.
