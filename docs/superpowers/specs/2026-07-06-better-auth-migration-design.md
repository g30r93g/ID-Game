# Clerk → Better Auth Migration — Design

**Date:** 2026-07-06
**Status:** Approved

## Goal

Replace Clerk with Better Auth so users sign in with **passkeys** (primary) and **email OTP** (fallback/recovery). Clean slate: no accounts or game data are migrated — existing game tables are wiped at cut-over (except `scenarios` seed content). Ship a maintenance-mode kill switch to cover the cut-over window.

## Context & motivation

- Accounts exist primarily as bot friction — to stop spurious bots creating and abandoning games. Passkeys and inbox-verified OTP are both stronger bot gates than the current password/OAuth mix.
- Current Clerk footprint is shallow: middleware gate on `/game`, a Convex JWT bridge, custom auth UI (~840 lines), and identity strings embedded in Convex data. No webhooks, no orgs, no billing, no Clerk-hosted assets.
- Deployed on Vercel, Next.js 16 (App Router, `proxy.ts`), Convex `^1.42`, `@convex-dev/migrations` already installed.

## Decisions (settled with user)

| Decision                   | Choice                                                                       |
| -------------------------- | ---------------------------------------------------------------------------- |
| Account/history continuity | **None — clean slate** (revised 2026-07-06: accounts exist only as bot friction; game data has no analysis value worth the migration risk). Old game tables wiped at cut-over, `scenarios` kept. |
| Auth DB                    | **Convex** via `@convex-dev/better-auth` (local-install component). No Neon. |
| Sign-in methods            | **Passkey primary + email OTP fallback.** No passwords, no Google OAuth.     |
| Email provider             | **Resend**                                                                   |
| Maintenance flag           | **Env var + redeploy** (`MAINTENANCE_MODE`), gated in `proxy.ts`             |
| Username requirement       | Dropped — single display-name field at sign-up feeds `displayName`           |

Email OTP is kept not for migration continuity but as the passkey fallback for incapable devices, the sign-up bot gate (inbox verification), and ongoing account recovery (lost/new device). Returning users simply re-register: email + OTP, ~20 seconds.

## Target architecture

- **Better Auth runs on Convex** via the `@convex-dev/better-auth` component, local-install pattern: auth code and generated schema under `convex/betterAuth/`, component registered in `convex/convex.config.ts`. Auth tables (`user`, `session`, `passkey`, `verification`) live in Convex.
- **Plugins:** `@better-auth/passkey` (conditional-UI autofill enabled) and `emailOTP` (delivery via Resend).
- **Next.js side:**
  - Catch-all route `app/api/auth/[...all]/route.ts` proxies auth requests to Convex.
  - `providers/ConvexClerkClientProvider.tsx` → Better Auth Convex client provider.
  - `lib/auth.ts` (Clerk `getToken({template:"convex"})`) → the component's Next.js server helpers (token getter / `fetchAuthQuery`), keeping `app/(auth-routes)/game/[code]/page.tsx` server-side Convex calls working.
  - `proxy.ts`: replace `clerkMiddleware` with (a) maintenance-mode gate, (b) Better Auth session-cookie check protecting `/game`. The cookie check is an optimistic gate; authoritative enforcement remains `ctx.auth.getUserIdentity()` in Convex functions (as today).
- **`convex/auth.config.ts`:** Clerk issuer → component issuer (Convex site URL).
- **Identity key change:** all 16 Convex functions in `convex/game.ts` switch from `identity.tokenIdentifier` to `identity.subject`, permanently decoupling stored data from any issuer domain.
- **Removed:** `@clerk/nextjs`, Google OAuth, passwords, Clerk CAPTCHA, `app/(auth-routes)/sso-callback/` (deleted entirely), `CLERK_*` env vars.
- **Env changes:** add `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, site-URL vars; declare the already-present `NEXT_PUBLIC_CONVEX_SITE_URL` in `app/env.ts`. Convex-side vars set via Convex dashboard/CLI (not only Vercel).

## Auth flows

**Sign-in (returning user):** single email input with `autocomplete="username webauthn"` so passkey autofill offers stored credentials automatically. Actions: "Continue with passkey" / "Email me a code". OTP path: 6-digit code → signed in.

**Sign-up (new user):** same page — email + display name → OTP verifies inbox (the bot gate) → account created → immediately prompted to add a passkey (skippable).

**User tray (`components/create-join-game.tsx`):** swap Clerk `useUser`/`useClerk` for Better Auth client session (`user.name`, `user.email`, `signOut`). `components/game/lobby/player-card.tsx` host check swaps `auth.userId` for the Better Auth user id.

**PostHog:** distinct id remains the user id. All users get new ids at cut-over (clean slate) — accepted.

## Data migration

**None — clean slate** (decision revised 2026-07-06; supersedes the earlier "preserve accounts + history" choice). No Clerk user export/import, no id remapping, no `userIdMap` table. During the maintenance window the game tables (`games`, `players`, `gameRounds`, `gameRoundScenarios`, `gameRoundPlayerRankings`, `gameRoundGuesses`, `gameRating`) are cleared; **`scenarios` is kept** — it is seed content, not user data. All users re-register via OTP (or passkey) on first visit.

Historical note from planning research: preserving Clerk user ids would have been impossible anyway — with the Convex component, the Better Auth user id is the Convex document `_id`, which cannot be chosen at insert. Clean slate removes that entire problem class.

## Maintenance mode

- `MAINTENANCE_MODE=true` (server-side env var, no `NEXT_PUBLIC_`) checked in `proxy.ts`: all requests rewrite to `/maintenance` with **503 + `Retry-After`** (crawler-correct). Excluded: `/maintenance` itself, static assets.
- `/maintenance` page: branded "We're working away on a new version — we'll be back soon."
- Flip = set var in Vercel + redeploy (~1 min).
- **Bypass:** `MAINTENANCE_BYPASS_SECRET` env var; visiting `/?bypass=<secret>` sets a cookie that skips the gate, enabling live smoke-testing during the window.
- Ships as its own small PR **before** the auth work.

## Cut-over sequence

1. **Pre-work:** maintenance-mode PR merged (dormant). Auth migration built on a branch; full rehearsal (auth flows incl. passkey register/sign-in and OTP) against dev Convex.
2. **Cut-over day:** maintenance ON → merge + deploy Vercel → deploy Convex → clear game tables (keep `scenarios`) → smoke-test via bypass → maintenance OFF.
3. **Post:** keep Clerk instance alive ~2 weeks as a fallback, then delete. Privacy/ToS copy (`app/privacy/page.tsx`, `app/tos/page.tsx`) updated in the same release — both currently name Clerk.

## Risks

| Risk                                                                                               | Mitigation                                                                                    |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| OTP lands in spam → user can't sign up / recover                                                   | Verified sending domain in Resend, sensible from-address; passkeys make it first-sign-in-only |
| Passkey UX variance across devices/browsers                                                        | OTP always one click away — worst case equals today's email-code flow                         |
| Component maturity vs Clerk                                                                        | Officially recommended path, Convex-maintained; usage (sessions + 2 plugins) is mainstream    |
| Maintenance flip requires redeploy                                                                 | Acceptable (~1 min) for a planned window; bypass cookie for testing                           |

## Out of scope

- Rate limiting / BotID on game creation (orthogonal bot defence; possible follow-up)
- Any org/role/billing features (none exist)
- Migrating Clerk sessions (impossible/unnecessary)

## Effort estimate

2–3 focused days: component setup ½d, auth UI rebuild ~1d, proxy/providers/server-bridge ½d, rehearsal ¼d, maintenance mode ¼d, cut-over + buffer ¼–½d. (Down from 3–4: clean slate removed the user import and data-remap work.)
