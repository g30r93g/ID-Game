# Game Refinements — PR Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan PR-by-PR. Steps use checkbox (`- [ ]`) syntax for tracking. Unlike the single-feature plans in this directory, this document covers **five independently shippable PRs** — finish and merge one before starting the next unless the dependency notes say otherwise.

**Goal:** Land seven identified refinements — auth feedback, category back-navigation, live guess tallies, a host scenario peek, a How To Play slideshow, disconnection re-inclusion, and a native share sheet — as five reviewable PRs that can be merged independently.

**Architecture:** Four of the five PRs are additive on the existing Convex + Next.js shape; none needs a schema migration. The two client-only PRs (auth feedback, chrome polish) carry no backend risk and go first. The three game-logic PRs split along the `convex/game.ts` function clusters they touch — round mutations (PR 3), presence/lifecycle (PR 4), guesses (PR 5) — so they can be reviewed in isolation and, for PR 3 and PR 4, developed in parallel.

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
| 4 | `feat/presence-reinclusion` | Include auto-disconnected players | Yes (presence) | — |
| 5 | `feat/live-guess-tallies` | Live voting/tallies of scenario guesses | Yes (guesses) | PR 3 |

**Ordering:** PR 1 and PR 2 can land immediately, in either order. PR 3 and PR 4 touch disjoint clusters of `convex/game.ts` and can be developed in parallel. PR 5 rebases onto PR 3 — both edit `components/game/await-guesses.tsx`, and PR 5 relies on the query gating introduced in PR 3.

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

# PR 4 — Include auto-disconnected players

**Branch:** `feat/presence-reinclusion`

**Goal:** A player removed by consensus while disconnected can get back into the game *and the round in progress*, rather than being locked out until it ends.

**Observed incident (game `CGHZ18`):** a two-player game, both players idle long enough for their heartbeats to lapse, after which one player was missing from the round despite still being in the game.

**Root cause, and the decision taken:** with two players the vote denominator is always 1 — `connectedNonTarget` (`convex/game.ts:1099-1104`) excludes the target, leaving only the voter — so one Agree tap removes the other player. **This is accepted behaviour and is not being changed:** with two players there is no larger consensus to reach, and requiring one would leave a genuinely-stuck round unrecoverable. The fix is therefore entirely on the recovery side — removal stays cheap, but coming back must be complete and immediate.

**What already works:** `sendHeartbeat` (`convex/game.ts:73`) sets `active: true` and clears open votes against a reconnecting player, so re-inclusion is automatic on any heartbeat (#45).

**What doesn't:**

1. *Re-inclusion is slow.* The heartbeat is `setInterval(…, 15000)` with no leading call (`components/game/index.tsx:79-88`), so a returning player is re-included up to 15s after their tab wakes — and mobile browsers freeze background timers, so a player who merely switched apps returns already flagged stale.
2. *The game is unfindable.* `getMyActiveGames` skips rows where `active === false` (`convex/game.ts:283`), so the game vanishes from "Jump back in"; `joinGame` throws `Game is not open to new players` (`convex/game.ts:199-201`) for any closed game. The direct URL `/game/<code>` does still work — `isUserPlayer` ignores `active` — but nothing points there.
3. *The round has moved on.* `rank-players.tsx:45-47` seeds its list once and deliberately never resyncs, so a player returning mid-rank never appears. Worse, if the host already submitted, `gameRoundPlayerRankings` has no row for them at all, `getGuessesStatusForRound` had already reported the round complete, and `await-guesses.tsx:43-51` may have auto-advanced.

**Design for (3):** re-inclusion is automatic, and the host is then *prompted* to redo the part of the round that excluded the player. The prompt rewinds to `rank-players`, keeping the selected scenario — a player rejoining doesn't invalidate the scenario, and unselecting it would need the `scenarios.timesSelected` increment from `selectGameRoundScenario` unwound. The rewind is a dedicated mutation rather than a relaxation of `transitionRoundPhase`, so the strict linear guard from #49 stays intact and the dependent rows are cleared in the same transaction.

**Files:**
- Modify: `convex/game.ts` (`getMyActiveGames`, `joinGame`, `makeGuessForRound`, `leaveGame`, new `rewindRoundForRejoin`)
- Modify: `components/game/index.tsx`
- Modify: `components/active-games.tsx`
- Modify: `components/game/presence/disconnect-prompt.tsx`
- Modify: `components/game/rank-players.tsx`
- Create: `components/game/presence/rejoin-prompt.tsx`
- Test: `convex/presence.test.ts`

### Task 4.1: Publish presence immediately on wake

**Interfaces:**
- Produces: the game shell heartbeats on mount and whenever the tab becomes visible, not only on the 15s interval.

Re-inclusion already happens on any heartbeat, so this alone shortens the window in which a returning player is still shown as gone — and shortens the window in which they can be voted out despite being back.

- [ ] **Step 1:** In `components/game/index.tsx:79-88`, send one heartbeat immediately before starting the interval. `setInterval` has no leading edge, so today the first beat lands 15s after mount.
- [ ] **Step 2:** Add a `visibilitychange` listener that heartbeats when `document.visibilityState === "visible"`. Mobile browsers freeze timers in background tabs, so a player who switched apps returns already stale and stays stale until the next tick.
- [ ] **Step 3:** Keep the interval itself at `HEARTBEAT_INTERVAL_MS` from `lib/presence.ts` — do not re-declare the constant, and do not change it or `PRESENCE_TIMEOUT_MS`.
- [ ] **Step 4:** Note the effect depends on `game`, whose reference changes whenever the games document updates, which restarts the interval and resets its countdown. With a leading beat this is no longer able to starve the heartbeat. Leave the dependency array as-is.
- [ ] **Step 5:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — background the tab for a minute, return, and confirm the other player's client shows them online within a second or two rather than up to 15.
- [ ] **Step 6: Commit** — `fix(presence): heartbeat on mount and on tab focus`.

### Task 4.2: Surface removed games as rejoinable

**Interfaces:**
- Produces: `getMyActiveGames` returns rows for games the caller was removed from, flagged `removed: true`.

- [ ] **Step 1: Write the failing test.** Extend the existing `getMyActiveGames` test in `convex/presence.test.ts` — the removed game (`RMV003`) is currently asserted absent; assert instead that it is present with `removed: true` while the finished game stays excluded.
- [ ] **Step 2: Run to verify it fails.** `pnpm test convex/presence.test.ts -t "getMyActiveGames"`.
- [ ] **Step 3: Implement.** Replace the `if (myPlayer.active === false) continue` skip with a `removed: myPlayer.active === false` field on the pushed row.
- [ ] **Step 4:** Update `components/active-games.tsx` to render removed games with a "Rejoin" affordance and distinct styling, rather than the plain resume button.
- [ ] **Step 5: Run to verify it passes**, then `pnpm exec tsc --noEmit && pnpm lint`.
- [ ] **Step 6: Commit** — `feat(presence): show games you were dropped from as rejoinable`.

### Task 4.3: Let a removed player re-enter a closed game

**Interfaces:**
- Produces: `joinGame` reactivates an existing `active: false` player row for a closed game instead of throwing.

- [ ] **Step 1: Write the failing test.** A player with `active: false` in a closed game calls `joinGame` with its code; assert it succeeds and their row is `active: true` with a fresh `lastAlive`. Assert a *new* user still gets `Game is not open to new players`.
- [ ] **Step 2: Run to verify it fails.** The `isOpen` check at `convex/game.ts:199-201` runs before the existing-player lookup, so it throws first.
- [ ] **Step 3: Implement.** Reorder the handler: look the caller's player row up first. If a row exists, patch `{ active: true, lastAlive: Date.now() }` and return. Only then apply the `isOpen` gate, which now only governs genuinely new players.
- [ ] **Step 4: Run to verify it passes.** `pnpm test convex/presence.test.ts`.
- [ ] **Step 5: Commit** — `feat(presence): let a dropped player rejoin a closed game`.

### Task 4.4: Absorb a return that lands before the host submits

**Interfaces:**
- Produces: `RankPlayersGamePhase` absorbs players who become active after its initial seed; `makeGuessForRound` rejects guesses from inactive players and from rounds past `guess-scenario`.

A return during `rank-players` needs no prompt — the host has not committed anything yet, so the player can simply reappear in the list.

- [ ] **Step 1: Write the failing tests.** Assert `makeGuessForRound` throws for a player with `active === false`, and throws when the round has already moved to `display-results`.
- [ ] **Step 2: Run to verify they fail.** The mutation (`convex/game.ts:902-955`) checks only that the caller is not the host.
- [ ] **Step 3: Implement** both guards in `makeGuessForRound`. An `active` player who returns is unaffected — `sendHeartbeat` has already flipped them back — so this rejects only genuinely-removed callers and late arrivals after the reveal.
- [ ] **Step 4:** In `rank-players.tsx`, keep the deliberate no-resync behaviour for reordering but merge in players who become active after the initial seed — append any `active !== false` player missing from local state to the end of the list, without disturbing the host's existing drag order. Document why the merge is append-only.
- [ ] **Step 5: Run to verify they pass**, then `pnpm exec tsc --noEmit && pnpm lint`.
- [ ] **Step 6: Commit** — `fix(presence): absorb players who return before ranking is submitted`.

### Task 4.5: `rewindRoundForRejoin` mutation

**Interfaces:**
- Produces: `rewindRoundForRejoin({ gameRoundId: Id<"gameRounds"> })` — host-only. Deletes the round's `gameRoundPlayerRankings` and `gameRoundGuesses`, patches the round back to `phase: "rank-players"`, and leaves `gameRoundScenarios` untouched so the selected scenario survives.

- [ ] **Step 1: Write the failing tests.** Seed a round in `guess-scenario` with submitted rankings, one guess, and a selected scenario. Assert that after the mutation: phase is `rank-players`, zero ranking rows, zero guess rows, and the `gameRoundScenarios` row is still `selected: true`. Assert a non-host caller throws, and that a round not in `guess-scenario` throws.
- [ ] **Step 2: Run to verify they fail.** `pnpm test convex/presence.test.ts` — the mutation does not exist.
- [ ] **Step 3: Implement.** Authorise host-only exactly as `transitionRoundPhase` does (`convex/game.ts:567-576`), then gate on `gameRound.phase === "guess-scenario"` — this is a recovery path, not a general rewind. Collect and delete both dependent tables via their `byRound` indexes before patching the phase, so no client ever observes `rank-players` with stale rankings still attached.
- [ ] **Step 4:** Patch the phase directly here rather than calling `transitionRoundPhase`. The linear `NEXT_PHASE` guard added in #49 stays untouched and keeps rejecting every ad-hoc rewind; this mutation is the single sanctioned exception because it clears the dependent rows in the same transaction.
- [ ] **Step 5: Run to verify they pass.** `pnpm test convex/presence.test.ts`.
- [ ] **Step 6: Commit** — `feat(presence): add rewindRoundForRejoin recovery mutation`.

### Task 4.6: Prompt the host to re-rank

**Interfaces:**
- Consumes: Task 4.5; `getPlayerRankingsForRound`, `getPlayersForGame` (both already subscribed in the shell).
- Produces: `components/game/presence/rejoin-prompt.tsx` — host-only banner offering to re-rank when an active player is missing from the round's submitted rankings.

- [ ] **Step 1:** Derive the condition client-side; no new query is needed. Prompt when the viewer is the host, `currentRound.phase === "guess-scenario"`, and some player has `active !== false`, is not the host, and has no row in `getPlayerRankingsForRound`.
- [ ] **Step 2:** Render the banner naming the returning player, with **Re-rank** (calls `rewindRoundForRejoin`) and **Continue without them**. Show non-hosts a passive "waiting for the host" note so a returning player understands why the round looks wrong from their side.
- [ ] **Step 3:** Persist a decline in `localStorage`, keyed by round id + player id, so dismissing doesn't re-prompt on every reactive update. A declined player stays `active` and simply sits out the round — they are picked up normally by `startNewGameRound` next round, which filters on `active !== false` (`convex/game.ts:434`).
- [ ] **Step 4:** On re-rank, the returning player's client moves back to the waiting view automatically — `index.tsx` renders phases off `currentRound.phase`, so no extra handling is needed. Confirm the host's `RankPlayersGamePhase` remounts with a fresh seed (its `players === null` guard runs once per mount, so a key on the round phase may be required).
- [ ] **Step 5:** Verify: `pnpm exec tsc --noEmit && pnpm lint`. Manual — with two profiles, vote one player out mid-round, let the host reach `guess-scenario`, then bring the player back and confirm the host is prompted, re-ranks, and both players complete the round.
- [ ] **Step 6: Commit** — `feat(presence): prompt the host to re-rank when a player returns`.

### Task 4.7: Tell the removed player what happened

**Interfaces:**
- Produces: a banner in the game shell when the viewer's own player row is `active: false`.

- [ ] **Step 1:** `DisconnectPrompt` currently only renders cards about *other* players (`disconnect-prompt.tsx:34-39` filters out the viewer). Add a branch: when the viewer's own row is inactive, render an explanatory banner with a "Rejoin" button calling `sendHeartbeat`, which already reactivates them and clears votes.
- [ ] **Step 2:** Suppress the "other players" cards while the viewer is themselves removed — someone who isn't in the game shouldn't be voting others out.
- [ ] **Step 3:** Verify: `pnpm exec tsc --noEmit && pnpm lint`.
- [ ] **Step 4: Commit** — `feat(presence): explain removal and offer a rejoin`.

### Task 4.8: Make leaving consistent with removal

**Interfaces:**
- Produces: `leaveGame` soft-flags `active: false` instead of deleting the player row.

- [ ] **Step 1: Write the failing test.** After `leaveGame`, assert the row still exists with `active === false`.
- [ ] **Step 2: Run to verify it fails.** `leaveGame` (`convex/game.ts:225-247`) hard-deletes.
- [ ] **Step 3: Implement** the patch. This makes the two exit paths identical, so everything built in Tasks 4.1–4.7 gives a voluntary leaver the same route back, and stops deleted rows orphaning `gameRoundGuesses` / `gameRoundPlayerRankings` that reference them.
- [ ] **Step 4:** Audit callers that assume a deleted row. `index.tsx:90-103` redirects when `players.filter(p => p.active !== false).length <= 1`, which already reads the flag rather than the row count — confirm and leave alone.
- [ ] **Step 5: Run to verify it passes.** `pnpm test`.
- [ ] **Step 6: Commit** — `refactor(presence): soft-flag players who leave`.

### Task 4.9: PR 4 verification sweep

- [ ] `pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build` — all clean.
- [ ] **Reproduce `CGHZ18` and confirm it recovers.** Two profiles only. Let both go idle past the 45s threshold, wake one, tap Agree until the other is removed, then close the removed player's tab entirely. Reopen `/game`, rejoin from "Jump back in", and confirm: they are re-included immediately (not after 15s), the host is prompted to re-rank, and both players finish the round together.
- [ ] Repeat with three profiles, dropping a non-host mid-round, to confirm the multi-player majority path is unchanged.
- [ ] Repeat for the host case — confirm host reassignment still holds after the original host rejoins as a normal player.
- [ ] Confirm the decline path: dismiss the re-rank prompt and check the returning player sits out the round cleanly and is included in the next one.

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
2. **PR 3** and **PR 4** — parallel; both need a Convex deploy. PR 3 changes query *responses* (`selected` is blanked for non-hosts), so deploy the backend and the client together.
3. **PR 5** — after PR 3 is merged and deployed.

No migration is required at any step: every change is to function behaviour, not to stored documents.
