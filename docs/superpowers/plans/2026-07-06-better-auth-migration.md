# Clerk → Better Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clerk with Better Auth (passkey primary + email OTP fallback via Resend) running on Convex via `@convex-dev/better-auth`, as a **clean slate** — no accounts or game data migrated; old game tables are wiped at cut-over — with an env-var maintenance mode covering the window.

**Architecture:** Better Auth runs on the Convex deployment (local-install component pattern — required for the passkey plugin); Next.js proxies auth requests through `app/api/auth/[...all]`. Convex functions keep using `ctx.auth.getUserIdentity()` but switch from `.tokenIdentifier` to `.subject`. **No user import and no id remapping** (decision revised 2026-07-06: accounts exist only as bot friction, so everyone re-registers). Game tables are cleared during the maintenance window; **`scenarios` is kept** — seed content, not user data.

**Tech Stack:** Next.js 16.2 (App Router, `proxy.ts`), Convex ^1.42, `@convex-dev/better-auth@0.12.x` (local install), `better-auth@1.6.23`, `@better-auth/passkey@1.6.23`, `@convex-dev/resend`, Resend, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-06-better-auth-migration-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm add`, not npm install).
- Pin `better-auth@1.6.23` exactly: the Convex component peers `better-auth >=1.6.11 <1.7.0`, and `@better-auth/passkey@1.6.23` peers `^1.6.23` — 1.6.23 is the only version satisfying both. Do NOT upgrade to 1.7.x.
- Follow the **labs.convex.dev/better-auth** file layout (component docs for released 0.12.x), NOT the layout on better-auth.com/docs/integrations/convex (which tracks an unreleased API). Do not mix the two.
- The Better Auth CLI is the npm package **`auth`** (`npx auth generate`), not `@better-auth/cli`.
- **This repo has no automated test infrastructure** (no jest/vitest/playwright). Do not add one. Per-task verification is: `pnpm lint`, `pnpm build`, `npx convex dev --once` (deploy + typecheck Convex functions), and the exact `curl`/browser checks given in each task.
- The repo must build (`pnpm build`) at the end of every task — tasks are ordered so Clerk and Better Auth coexist until the final swap tasks.
- Two PRs: Tasks 1–2 are PR 1 (`feat/maintenance-mode`, branched from `main`); Tasks 3–12 are PR 2 (`feat/better-auth`, branched from PR 1's branch or from `main` after PR 1 merges).
- **Clean slate:** do NOT build any Clerk-user import or data-remap machinery (no `userIdMap`, no import scripts, no `@convex-dev/migrations` usage). Old game data is deleted at cut-over (Task 12); the `scenarios` table must NEVER be cleared.
- Convex-side env vars are set with `npx convex env set NAME value` (add `--prod` for production) — they live on the Convex deployment, NOT in Vercel.
- Path alias `@/*` maps to the repo root (e.g. `@/app/env`, `@/lib/auth-client`).
- Copy style: user-facing text is friendly and brief (see existing pages); UK English in prose ("we're working away…").

---

### Task 1: Maintenance page

**Files:**

- Create: `app/maintenance/page.tsx`

**Interfaces:**

- Produces: route `/maintenance` rendering a standalone branded message page. Task 2's proxy rewrites to this path.

- [ ] **Step 1: Create the page**

```tsx
// app/maintenance/page.tsx
import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Back soon — The ID Game",
};

export default function MaintenancePage() {
  return (
    <div className="min-h-svh flex items-center justify-center px-4">
      <Card className="w-full sm:w-96 text-center">
        <CardHeader>
          <CardTitle className="text-2xl">We&apos;ll be back soon 🔧</CardTitle>
          <CardDescription>
            We&apos;re working away on a new version of The ID Game.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Check back in a little while and start a fresh game.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders**

Run: `pnpm dev` then `curl -s http://localhost:3000/maintenance | grep -o "be back soon"`
Expected: `be back soon` (and no console errors). Stop the dev server.

- [ ] **Step 3: Lint and commit**

```bash
pnpm lint
git checkout -b feat/maintenance-mode
git add app/maintenance/page.tsx
git commit -m "feat: add maintenance page"
```

---

### Task 2: Maintenance gate in proxy + env vars

**Files:**

- Modify: `proxy.ts`
- Modify: `app/env.ts`
- Modify: `README.md:9-23` (env var docs)

**Interfaces:**

- Consumes: `/maintenance` route from Task 1.
- Produces: env vars `MAINTENANCE_MODE` (`"true"`/`"false"`, optional) and `MAINTENANCE_BYPASS_SECRET` (optional string) in `env`; a `maintenanceResponse(req)` gate that Task 8 re-uses verbatim when the proxy is rewritten for Better Auth. Bypass cookie name: `maintenance-bypass`.

- [ ] **Step 1: Add env vars to `app/env.ts`**

In the `server:` block add:

```ts
    MAINTENANCE_MODE: z.enum(["true", "false"]).optional(),
    MAINTENANCE_BYPASS_SECRET: z.string().min(16).optional(),
```

In `runtimeEnv:` add:

```ts
    MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
    MAINTENANCE_BYPASS_SECRET: process.env.MAINTENANCE_BYPASS_SECRET,
```

- [ ] **Step 2: Add the gate to `proxy.ts`**

Replace the whole file with:

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/app/env";

const isPrivateRoute = createRouteMatcher(["/game"]);

const BYPASS_COOKIE = "maintenance-bypass";

/**
 * Returns a response if the request should be intercepted by maintenance
 * mode, or null to continue as normal. Visiting any URL with
 * ?bypass=<MAINTENANCE_BYPASS_SECRET> sets a cookie that skips the gate.
 */
export function maintenanceResponse(req: NextRequest): NextResponse | null {
  if (env.MAINTENANCE_MODE !== "true") return null;

  const url = req.nextUrl;
  const secret = env.MAINTENANCE_BYPASS_SECRET;

  if (secret && url.searchParams.get("bypass") === secret) {
    const clean = new URL(url.pathname, req.url);
    const response = NextResponse.redirect(clean);
    response.cookies.set(BYPASS_COOKIE, secret, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    return response;
  }

  const hasBypass =
    secret !== undefined && req.cookies.get(BYPASS_COOKIE)?.value === secret;
  if (hasBypass || url.pathname === "/maintenance") return null;

  return NextResponse.rewrite(new URL("/maintenance", req.url), {
    status: 503,
    headers: { "Retry-After": "3600" },
  });
}

export default clerkMiddleware(
  async (auth, req) => {
    const maintenance = maintenanceResponse(req);
    if (maintenance) return maintenance;

    if (isPrivateRoute(req)) {
      await auth.protect();
    }
  },
  {
    debug: env.NODE_ENV === "development",
  },
);

export const config = {
  // The following matcher runs middleware on all routes except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

- [ ] **Step 3: Verify the gate off, on, and bypassed**

```bash
# Gate off (default): home page works
pnpm dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/          # expect 200
kill %1

# Gate on
MAINTENANCE_MODE=true MAINTENANCE_BYPASS_SECRET=local-test-secret-123 pnpm dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/          # expect 503
curl -s http://localhost:3000/ | grep -o "be back soon"                # expect: be back soon
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/maintenance  # expect 200 (direct)
# Bypass: query param redirects and sets cookie; cookie then passes the gate
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/?bypass=local-test-secret-123"  # expect 307
curl -s -o /dev/null -w "%{http_code}" -H "Cookie: maintenance-bypass=local-test-secret-123" http://localhost:3000/  # expect 200
kill %1
```

Expected codes as annotated. (If the rewrite returns 200 instead of 503, the Next version has dropped ResponseInit support on rewrite — report this rather than shipping a 200.)

- [ ] **Step 4: Build, update README, commit, open PR**

Add to the env block in `README.md` (after the Convex lines):

```
    # Maintenance mode (optional)
    MAINTENANCE_MODE=false
    MAINTENANCE_BYPASS_SECRET=<random-string-16+-chars>
```

```bash
pnpm lint && pnpm build
git add proxy.ts app/env.ts README.md
git commit -m "feat: add maintenance mode gate with bypass cookie"
git push -u origin feat/maintenance-mode
gh pr create --title "Maintenance mode" --body "Env-var maintenance gate (MAINTENANCE_MODE=true + redeploy) rewriting all routes to /maintenance with 503, with a secret bypass cookie for smoke-testing. Precursor to the Better Auth cut-over."
```

Also add both vars to Vercel now (dormant): `MAINTENANCE_MODE=false`, `MAINTENANCE_BYPASS_SECRET=<generate with openssl rand -hex 24>`.

---

### Task 3: Install deps and scaffold the Better Auth Convex component (local install)

**Files:**

- Modify: `package.json` (via pnpm)
- Create: `convex/convex.config.ts`
- Create: `convex/betterAuth/convex.config.ts`
- Create: `convex/betterAuth/auth.ts`
- Create: `convex/betterAuth/schema.ts` (generated)
- Create: `convex/betterAuth/adapter.ts`
- Create: `convex/auth.ts`

**Interfaces:**

- Produces: `authComponent` (component client), `createAuthOptions(ctx)`, `createAuth(ctx)`, and query `api.auth.getCurrentUser` (returns `{ id: string, name: string | null, email: string, image: string | null } | null`) — all from `convex/auth.ts`. Every later task that touches Convex auth imports from here.
- Consumes: nothing from earlier tasks (independent of Tasks 1–2).

- [ ] **Step 1: Branch and install packages**

```bash
git checkout -b feat/better-auth   # from feat/maintenance-mode (or main once PR 1 merges)
pnpm add better-auth@1.6.23 @better-auth/passkey@1.6.23 @convex-dev/better-auth @convex-dev/resend
```

Expected: `package.json` gains the four deps; `better-auth` is exactly `1.6.23`.

- [ ] **Step 2: Register components — `convex/convex.config.ts`**

```ts
import { defineApp } from "convex/server";
import resend from "@convex-dev/resend/convex.config";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(resend);

export default app;
```

(`@convex-dev/migrations` remains in `package.json` as a pre-existing dependency, but its component is not registered — this migration doesn't use it.)

- [ ] **Step 3: Component definition — `convex/betterAuth/convex.config.ts`**

```ts
import { defineComponent } from "convex/server";

const component = defineComponent("betterAuth");

export default component;
```

- [ ] **Step 4: Write `convex/auth.ts` (first pass, WITHOUT the local schema — schema doesn't exist yet)**

```ts
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { Resend } from "@convex-dev/resend";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;

export const resend = new Resend(components.resend, { testMode: false });

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        // Recommended by Better Auth docs: don't await the send, to avoid
        // timing side-channels on whether an account exists.
        sendVerificationOTP: async ({ email, otp }) => {
          await resend.sendEmail(requireActionCtx(ctx), {
            from:
              process.env.AUTH_EMAIL_FROM ??
              "The ID Game <onboarding@resend.dev>",
            to: email,
            subject: `${otp} is your ID Game sign-in code`,
            html: `<p>Your sign-in code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
          });
        },
      }),
      passkey({
        rpID: new URL(siteUrl).hostname,
        rpName: "The ID Game",
        origin: siteUrl,
      }),
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;
    // The auth user document is a Convex doc; normalise to a stable shape.
    // If TypeScript reports `_id` does not exist on the type, the installed
    // component version already maps it — use `user.id` instead.
    return {
      id: user._id as string,
      name: user.name ?? null,
      email: user.email,
      image: user.image ?? null,
    };
  },
});
```

Note: this imports `./auth.config`, which is rewritten in Task 4 — write Task 4's `convex/auth.config.ts` **now** (it's 6 lines, see Task 4 Step 1) so this file compiles.

- [ ] **Step 5: Schema-gen shim — `convex/betterAuth/auth.ts`**

```ts
import { createAuth } from "../auth";

// Export a static instance for Better Auth schema generation.
// This file must contain ONLY this export — importing it at runtime
// errors due to missing environment variables.
export const auth = createAuth({} as any);
```

- [ ] **Step 6: Generate the schema**

```bash
cd convex/betterAuth
SITE_URL=http://localhost:3000 npx auth generate
cd ../..
```

Expected: `convex/betterAuth/schema.ts` created, containing `defineSchema` with tables `user`, `session`, `account`, `verification`, `jwks`, and `passkey` (passkey table present because the plugin is in `createAuthOptions`). If the CLI cannot resolve the config automatically, pass `--config ./auth.ts --output ./schema.ts`.

- [ ] **Step 7: Adapter API — `convex/betterAuth/adapter.ts`**

```ts
import { createApi } from "@convex-dev/better-auth";
import schema from "./schema";
import { createAuthOptions } from "../auth";

export const {
  create,
  findOne,
  findMany,
  updateOne,
  updateMany,
  deleteOne,
  deleteMany,
} = createApi(schema, createAuthOptions);
```

- [ ] **Step 8: Switch `convex/auth.ts` to the local schema**

Replace the `authComponent` declaration with:

```ts
import authSchema from "./betterAuth/schema";

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  },
);
```

(Keep the import at the top of the file with the others.)

- [ ] **Step 9: Set dev Convex env vars and deploy**

```bash
npx convex env set BETTER_AUTH_SECRET $(openssl rand -base64 32)
npx convex env set SITE_URL http://localhost:3000
npx convex env set RESEND_API_KEY <your-resend-api-key>   # from resend.com dashboard
npx convex env set AUTH_EMAIL_FROM "The ID Game <onboarding@resend.dev>"
npx convex dev --once
```

Expected: `npx convex dev --once` completes with "Convex functions ready" and no type errors — the betterAuth and resend components deploy.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml convex/
git commit -m "feat: add Better Auth Convex component (local install) with passkey + emailOTP plugins"
```

---

### Task 4: Convex auth config + HTTP routes

**Files:**

- Modify: `convex/auth.config.ts` (replace contents)
- Create: `convex/http.ts`

**Interfaces:**

- Consumes: `authComponent`, `createAuth` from `convex/auth.ts` (Task 3).
- Produces: Convex deployment trusts Better Auth JWTs; Better Auth HTTP endpoints served on the Convex site URL.

- [ ] **Step 1: Replace `convex/auth.config.ts`**

Old contents (Clerk issuer) are fully replaced with:

```ts
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
```

**Important:** deploying this to production instantly breaks Clerk-token auth — which is why the prod deploy only happens inside the maintenance window (Task 12). Deploying to the dev deployment now is fine.

- [ ] **Step 2: Create `convex/http.ts`**

```ts
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

export default http;
```

- [ ] **Step 3: Deploy and verify**

```bash
npx convex dev --once
```

Expected: success. Then verify the auth endpoint responds (use the `NEXT_PUBLIC_CONVEX_SITE_URL` value from `.env.local`):

```bash
curl -s -o /dev/null -w "%{http_code}" "$(grep NEXT_PUBLIC_CONVEX_SITE_URL .env.local | cut -d= -f2)/api/auth/ok"
```

Expected: `200` (Better Auth's health endpoint).

- [ ] **Step 4: Commit**

```bash
git add convex/auth.config.ts convex/http.ts
git commit -m "feat: switch Convex auth config to Better Auth and register auth HTTP routes"
```

---

### Task 5: Next.js auth wiring (client, server helpers, route handler, provider)

**Files:**

- Create: `lib/auth-client.ts`
- Create: `lib/auth-server.ts`
- Create: `app/api/auth/[...all]/route.ts`
- Create: `providers/ConvexClientProvider.tsx`
- Modify: `app/env.ts` (add `NEXT_PUBLIC_CONVEX_SITE_URL`, `NEXT_PUBLIC_SITE_URL`)

**Interfaces:**

- Consumes: nothing app-side yet (Clerk still wired up — both stacks coexist after this task).
- Produces: `authClient` (with `authClient.useSession()`, `authClient.signIn.passkey()`, `authClient.signIn.emailOtp()`, `authClient.emailOtp.sendVerificationOtp()`, `authClient.passkey.addPasskey()`, `authClient.passkey.listUserPasskeys()`, `authClient.signOut()`) from `@/lib/auth-client`; `getToken()`, `isAuthenticated()`, `fetchAuthQuery(fn, args)`, `fetchAuthMutation(fn, args)`, `preloadAuthQuery(fn, args)`, `handler` from `@/lib/auth-server`; `<ConvexClientProvider initialToken?>` from `@/providers/ConvexClientProvider`.

- [ ] **Step 1: Env vars in `app/env.ts`**

Add to `client:`:

```ts
    NEXT_PUBLIC_CONVEX_SITE_URL: z.string().url(),
    NEXT_PUBLIC_SITE_URL: z.string().url(),
```

Add to `runtimeEnv:`:

```ts
    NEXT_PUBLIC_CONVEX_SITE_URL: process.env.NEXT_PUBLIC_CONVEX_SITE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
```

Add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to `.env.local` (`NEXT_PUBLIC_CONVEX_SITE_URL` is already there). Add both to Vercel with production values (`NEXT_PUBLIC_SITE_URL` = the production app URL).

- [ ] **Step 2: `lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { emailOTPClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
  plugins: [convexClient(), emailOTPClient(), passkeyClient()],
});
```

- [ ] **Step 3: `lib/auth-server.ts`**

```ts
import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { env } from "@/app/env";

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
  convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
});
```

- [ ] **Step 4: `app/api/auth/[...all]/route.ts`**

```ts
import { handler } from "@/lib/auth-server";

export const { GET, POST } = handler;
```

- [ ] **Step 5: `providers/ConvexClientProvider.tsx`**

```tsx
"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "@/lib/auth-client";
import { env } from "@/app/env";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
```

(Do NOT delete `providers/ConvexClerkClientProvider.tsx` yet — the game layout still uses it until Task 7.)

- [ ] **Step 6: Verify build and the auth proxy end-to-end**

```bash
pnpm lint && pnpm build
pnpm dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/ok   # expect 200 — Next proxies to Convex
kill %1
```

- [ ] **Step 7: Commit**

```bash
git add lib/auth-client.ts lib/auth-server.ts app/api providers/ConvexClientProvider.tsx app/env.ts README.md
git commit -m "feat: wire Better Auth client, server helpers, route handler, and Convex provider"
```

---

### Task 6: New sign-in page (passkey + email OTP); retire sign-up and sso-callback

**Files:**

- Rewrite: `app/(auth-routes)/sign-in/[[...sign-in]]/page.tsx`
- Delete: `app/(auth-routes)/sign-up/[[...sign-up]]/page.tsx` (directory)
- Create: `app/(auth-routes)/sign-up/page.tsx` (redirect stub — external links/bookmarks)
- Delete: `app/(auth-routes)/sso-callback/page.tsx` (directory)

**Interfaces:**

- Consumes: `authClient` from `@/lib/auth-client` (Task 5).
- Produces: `/sign-in` — the single auth page. `/sign-up` 307s to `/sign-in`. Redirects to `/game` on success.

- [ ] **Step 1: Rewrite the sign-in page**

Replace the entire contents of `app/(auth-routes)/sign-in/[[...sign-in]]/page.tsx` with:

```tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Fingerprint } from "lucide-react";

type Step = "start" | "otp" | "add-passkey";

const RESEND_SECONDS = 30;

export default function SignInPage() {
  const router = useRouter();

  const [step, setStep] = React.useState<Step>("start");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [resendCountdown, setResendCountdown] = React.useState(0);

  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  // Conditional-UI passkey autofill: offer stored passkeys from the email
  // field's autocomplete dropdown on supporting browsers.
  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      !window.PublicKeyCredential?.isConditionalMediationAvailable
    )
      return;
    let cancelled = false;
    void PublicKeyCredential.isConditionalMediationAvailable().then(
      (available) => {
        if (!available || cancelled) return;
        void authClient.signIn.passkey({
          autoFill: true,
          fetchOptions: {
            onSuccess: () => router.push("/game"),
          },
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handlePasskey = async () => {
    setError(null);
    setBusy(true);
    const { error } = await authClient.signIn.passkey();
    setBusy(false);
    if (error) {
      setError(
        error.message ??
          "Passkey sign-in failed. Try emailing yourself a code instead.",
      );
      return;
    }
    router.push("/game");
  };

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: email.trim().toLowerCase(),
      type: "sign-in",
    });
    setBusy(false);
    if (error) {
      setError(
        error.message ??
          "Could not send the code. Check the email address and try again.",
      );
      return;
    }
    setCode("");
    setResendCountdown(RESEND_SECONDS);
    setStep("otp");
  };

  const handleStart = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendCode();
  };

  const verifyCode = async (value: string) => {
    setError(null);
    setBusy(true);
    const trimmedName = name.trim();
    const { error } = await authClient.signIn.emailOtp({
      email: email.trim().toLowerCase(),
      otp: value,
      // Only used when this OTP registers a brand-new account.
      ...(trimmedName ? { name: trimmedName } : {}),
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? "That code didn’t work. Try again or resend.");
      return;
    }
    // Signed in — nudge towards a passkey if they don't have one yet.
    const { data: passkeys } = await authClient.passkey.listUserPasskeys();
    if (!passkeys || passkeys.length === 0) {
      setStep("add-passkey");
    } else {
      router.push("/game");
    }
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await verifyCode(code);
  };

  const handleAddPasskey = async () => {
    setError(null);
    setBusy(true);
    const result = await authClient.passkey.addPasskey();
    setBusy(false);
    if (result?.error) {
      setError(
        result.error.message ?? "Could not create a passkey on this device.",
      );
      return;
    }
    router.push("/game");
  };

  return (
    <div className="grid w-full grow items-center px-4 sm:justify-center">
      {step === "start" && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleStart}>
            <CardHeader>
              <CardTitle>Sign in</CardTitle>
              <CardDescription>Let&apos;s get you playing</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <Button
                size="sm"
                variant="outline"
                type="button"
                disabled={busy}
                onClick={handlePasskey}
              >
                <Fingerprint className="mr-2 size-4" />
                Continue with passkey
              </Button>
              <p className="flex items-center gap-x-3 text-sm text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                or
              </p>
              <div className="space-y-2">
                <Label htmlFor="identifier">Email address</Label>
                <Input
                  id="identifier"
                  type="email"
                  autoComplete="username webauthn"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">
                  Display name{" "}
                  <span className="text-muted-foreground font-normal">
                    (first time playing?)
                  </span>
                </Label>
                <Input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              {error && (
                <p className="block text-sm text-destructive">{error}</p>
              )}
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Icons.spinner className="size-4 animate-spin" />
                  ) : (
                    "Email me a code"
                  )}
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "otp" && (
        <Card className="w-full sm:w-96">
          <form onSubmit={handleCodeSubmit}>
            <CardHeader>
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                Enter the sign-in code sent to your email
              </CardDescription>
              <p className="text-sm text-muted-foreground">{email}</p>
            </CardHeader>
            <CardContent className="grid gap-y-4">
              <div className="grid items-center justify-center gap-y-2">
                <div className="flex justify-center text-center">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={(value) => {
                      setCode(value);
                      if (value.length === 6) void verifyCode(value);
                    }}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error && (
                  <p className="block text-center text-sm text-destructive">
                    {error}
                  </p>
                )}
                {resendCountdown > 0 ? (
                  <Button variant="link" size="sm" type="button" disabled>
                    Didn&apos;t receive a code? Resend (
                    <span className="tabular-nums">{resendCountdown}</span>)
                  </Button>
                ) : (
                  <Button
                    variant="link"
                    size="sm"
                    type="button"
                    disabled={busy}
                    onClick={sendCode}
                  >
                    Didn&apos;t receive a code? Resend
                  </Button>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <div className="grid w-full gap-y-4">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Icons.spinner className="size-4 animate-spin" />
                  ) : (
                    "Continue"
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="link"
                  onClick={() => {
                    setStep("start");
                    setError(null);
                  }}
                >
                  Use a different email
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>
      )}

      {step === "add-passkey" && (
        <Card className="w-full sm:w-96">
          <CardHeader>
            <CardTitle>Add a passkey</CardTitle>
            <CardDescription>
              Sign in next time with your fingerprint, face, or device PIN — no
              codes needed.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-y-4">
            {error && <p className="block text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <div className="grid w-full gap-y-4">
              <Button type="button" disabled={busy} onClick={handleAddPasskey}>
                {busy ? (
                  <Icons.spinner className="size-4 animate-spin" />
                ) : (
                  <>
                    <Fingerprint className="mr-2 size-4" />
                    Create passkey
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="link"
                onClick={() => router.push("/game")}
              >
                Maybe later
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete retired pages, add sign-up redirect**

```bash
git rm -r "app/(auth-routes)/sign-up/[[...sign-up]]" "app/(auth-routes)/sso-callback"
```

Create `app/(auth-routes)/sign-up/page.tsx`:

```tsx
import { redirect } from "next/navigation";

// Sign-up and sign-in are one flow now; keep old links working.
export default function SignUpPage() {
  redirect("/sign-in");
}
```

- [ ] **Step 3: Verify build and manual flow**

```bash
pnpm lint && pnpm build
```

Expected: clean build (nothing imports the deleted pages). Then manually with `pnpm dev` + `npx convex dev` running:

1. Visit `http://localhost:3000/sign-in` — page renders, no console errors.
2. Enter your real email + a display name → "Email me a code" → receive OTP (Resend dev: check the Resend dashboard logs) → enter code → lands on "Add a passkey" step.
3. "Create passkey" with the browser's virtual authenticator (Chrome DevTools → WebAuthn) or "Maybe later" → lands on `/game`.
4. Sign out isn't wired yet (Task 7) — clear cookies, revisit `/sign-in`, "Continue with passkey" signs back in.
5. `http://localhost:3000/sign-up` redirects to `/sign-in`.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth-routes)"
git commit -m "feat: passkey + email OTP sign-in page; retire sign-up and sso-callback pages"
```

---

### Task 7: Swap app components and server pages off Clerk

**Files:**

- Modify: `components/user-tray.tsx`
- Modify: `components/game/lobby/player-card.tsx`
- Modify: `app/(auth-routes)/layout.tsx`
- Modify: `app/(auth-routes)/game/[code]/page.tsx`
- Delete: `lib/auth.ts`
- Delete: `providers/ConvexClerkClientProvider.tsx`

**Interfaces:**

- Consumes: `authClient` (Task 5), `getToken`/`fetchAuthQuery`/`fetchAuthMutation`/`preloadAuthQuery` from `@/lib/auth-server` (Task 5), `ConvexClientProvider` (Task 5), `api.auth.getCurrentUser` (Task 3).
- Produces: no Clerk imports remain outside `proxy.ts` (Task 8) and `app/env.ts`/`package.json` (Task 10).

- [ ] **Step 1: `components/user-tray.tsx` — swap hooks**

Replace the imports and hook usage (full new file):

```tsx
"use client";

import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A frosted-glass identity bar shown above the game card: greeting + avatar on
 * the left, sign out on the right. The container styling is a floating header
 * (semi-transparent fill, hairline ring, layered soft shadow); the contents
 * are shadcn primitives. Pass `className` to control how it layers against the
 * card below it (e.g. a negative bottom margin so it emerges from behind the
 * card's top edge).
 */
export function UserTray({ className }: { className?: string }) {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const email = user?.email;
  const initial = (firstName?.[0] ?? email?.[0] ?? "?").toUpperCase();
  const greeting = firstName ? `Hey ${firstName} 👋` : "Welcome 👋";

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-t-2xl px-3 py-2 backdrop-blur-sm bg-[rgba(248,248,248,0.9)] dark:bg-[rgba(19,19,22,0.9)] shadow-[0_0_0_0.5px_rgba(255,255,255,0.9)_inset,0_0_0_0.5px_rgba(19,19,22,0.15),0_2px_3px_0_rgba(0,0,0,0.04),0_4px_6px_0_rgba(34,42,53,0.04),0_1px_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_0_0_0.5px_rgba(247,247,248,0.15)_inset,0_0_0_0.5px_rgba(19,19,22,0.8),0_2px_3px_0_rgba(0,0,0,0.16),0_4px_6px_0_rgba(34,42,53,0.16),0_1px_1px_0_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="size-7">
          {user?.image ? (
            <AvatarImage src={user.image} alt={firstName ?? "You"} />
          ) : null}
          <AvatarFallback className="text-xs font-medium">
            {isPending ? "" : initial}
          </AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">
          {isPending ? " " : greeting}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-muted-foreground"
        onClick={() => {
          void authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                window.location.href = "/sign-in";
              },
            },
          });
        }}
      >
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: `components/game/lobby/player-card.tsx` — swap `useAuth`**

Replace line 5 (`import { useAuth } from "@clerk/nextjs"`) with:

```ts
import { authClient } from "@/lib/auth-client";
```

Replace lines 14–25 (the `useAuth` call and `currentUserIsHostPlayer`) with:

```ts
const { data: session } = authClient.useSession();

// const updatePlayerDisplayName = useCallback(async (value: string) => {
// }, [])

const currentUserIsHostPlayer = () => {
  const userId = session?.user.id;

  if (!userId) return false;

  return playerUserId === userId;
};
```

- [ ] **Step 3: `app/(auth-routes)/layout.tsx` — swap providers**

Full new file:

```tsx
import { getToken } from "@/lib/auth-server";
import { ConvexClientProvider } from "@/providers/ConvexClientProvider";

export default async function GameLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const token = await getToken();

  return (
    <div className={"min-h-svh max-h-svh flex items-center justify-center"}>
      <ConvexClientProvider initialToken={token}>
        {children}
      </ConvexClientProvider>
    </div>
  );
}
```

- [ ] **Step 4: `app/(auth-routes)/game/[code]/page.tsx` — swap server auth**

Full new file:

```tsx
import { Game } from "@/components/game";
import { api } from "@/convex/_generated/api";
import { redirect } from "next/navigation";
import {
  fetchAuthMutation,
  fetchAuthQuery,
  getToken,
  preloadAuthQuery,
} from "@/lib/auth-server";
import PostHogClient from "@/lib/posthog";

export default async function GamePage({
  params,
}: {
  params?: Promise<{ code: string }>;
}) {
  const token = await getToken();
  if (!token) {
    console.error("No authentication token found");
    redirect("/game");
  }

  const user = await fetchAuthQuery(api.auth.getCurrentUser, {});
  if (!user) {
    console.error("No user is found");
    redirect("/game");
  }

  // get join code
  const joinCode = (await params)?.code;

  if (joinCode === null || joinCode === undefined) {
    console.log("joinCode", joinCode);
    return <p>No Join Code Supplied</p>;
  }
  if (joinCode.length !== 6) {
    console.error("The join code was invalid");
    redirect("/game");
  }

  const posthog = PostHogClient();

  // Ensure the current user is a player, otherwise join them
  const isUserPlayer = await fetchAuthQuery(api.game.isUserPlayer, {
    joinCode,
  });
  if (!isUserPlayer) {
    try {
      if (posthog) {
        posthog.capture({
          distinctId: user.id,
          event: "game_join",
          properties: {
            joinCode,
          },
        });
      }

      await fetchAuthMutation(api.game.joinGame, { joinCode });
    } catch {
      redirect("/game");
    }
  }

  // get game data
  const preloadedGame = await preloadAuthQuery(api.game.fetchGameByJoinCode, {
    joinCode,
  });

  return <Game preloadedGame={preloadedGame} />;
}
```

- [ ] **Step 5: Delete the Clerk provider and token helper**

```bash
git rm lib/auth.ts providers/ConvexClerkClientProvider.tsx
```

- [ ] **Step 6: Verify**

```bash
grep -rn "@clerk" app components providers lib --include="*.ts" --include="*.tsx"
```

Expected: no matches (only `proxy.ts` and `app/env.ts` still reference Clerk config).

```bash
pnpm lint && pnpm build
```

Expected: clean. Manual check with dev servers running: sign in at `/sign-in`, land on `/game`, user tray shows greeting + working sign-out; create a game — lobby shows your display name editable (host check works).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: swap user tray, player card, game layout and page to Better Auth"
```

---

### Task 8: Rewrite `proxy.ts` for Better Auth

**Files:**

- Modify: `proxy.ts`

**Interfaces:**

- Consumes: `maintenanceResponse` logic from Task 2 (kept verbatim); `getSessionCookie` from `better-auth/cookies`.
- Produces: `/game*` gated by session-cookie presence (optimistic — authoritative checks stay in Convex functions), everything else public.

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { env } from "@/app/env";

const BYPASS_COOKIE = "maintenance-bypass";

/**
 * Returns a response if the request should be intercepted by maintenance
 * mode, or null to continue as normal. Visiting any URL with
 * ?bypass=<MAINTENANCE_BYPASS_SECRET> sets a cookie that skips the gate.
 */
export function maintenanceResponse(req: NextRequest): NextResponse | null {
  if (env.MAINTENANCE_MODE !== "true") return null;

  const url = req.nextUrl;
  const secret = env.MAINTENANCE_BYPASS_SECRET;

  if (secret && url.searchParams.get("bypass") === secret) {
    const clean = new URL(url.pathname, req.url);
    const response = NextResponse.redirect(clean);
    response.cookies.set(BYPASS_COOKIE, secret, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    return response;
  }

  const hasBypass =
    secret !== undefined && req.cookies.get(BYPASS_COOKIE)?.value === secret;
  if (hasBypass || url.pathname === "/maintenance") return null;

  return NextResponse.rewrite(new URL("/maintenance", req.url), {
    status: 503,
    headers: { "Retry-After": "3600" },
  });
}

export default function proxy(req: NextRequest) {
  const maintenance = maintenanceResponse(req);
  if (maintenance) return maintenance;

  // Optimistic gate: cookie presence only. Authoritative auth checks live in
  // the Convex functions via ctx.auth.getUserIdentity().
  if (req.nextUrl.pathname.startsWith("/game")) {
    const sessionCookie = getSessionCookie(req);
    if (!sessionCookie) {
      return NextResponse.redirect(new URL("/sign-in", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // The following matcher runs middleware on all routes except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

- [ ] **Step 2: Verify**

```bash
pnpm lint && pnpm build
pnpm dev &
sleep 5
# Signed out: /game redirects to /sign-in
curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3000/game   # expect 307 …/sign-in
kill %1
```

Manual: sign in in the browser, then visit `/game` — no redirect.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat: replace Clerk middleware with Better Auth session gate in proxy"
```

---

### Task 9: Switch Convex game functions from `tokenIdentifier` to `subject`

**Files:**

- Modify: `convex/game.ts`

**Interfaces:**

- Consumes: `authComponent` from `convex/auth.ts` (Task 3).
- Produces: all stored/compared user ids are Better Auth user ids (`identity.subject`); `displayName` sourced from the Better Auth user record.

- [ ] **Step 1: Mechanical `.tokenIdentifier` → `.subject` swaps**

There are 12 straight swaps. Eight are this exact pattern (lines 19, 189, 447, 477, 524, 582, 718, 792):

```ts
// old
const userId = (await ctx.auth.getUserIdentity())?.tokenIdentifier;
// new
const userId = (await ctx.auth.getUserIdentity())?.subject;
```

Four are field accesses on an already-fetched identity (lines 63, 134, 148-context line 157):

```ts
// old (e.g. line 63)
.filter((q) => q.eq(q.field("userId"), user.tokenIdentifier))
// new
.filter((q) => q.eq(q.field("userId"), user.subject))
```

After editing, verify none remain:

```bash
grep -n "tokenIdentifier" convex/game.ts
```

Expected: no output.

- [ ] **Step 2: Source `displayName` from the Better Auth user**

Add to the imports at the top of `convex/game.ts`:

```ts
import { authComponent } from "./auth";
```

In `createGame` (around lines 91–100), the insert block currently reads:

```ts
const gameId = await ctx.db.insert("games", {
  joinCode: generateOTP(),
  totalRounds: args.numberOfRounds,
  isOpen: true,
  createdBy: user.subject,
});
await ctx.db.insert("players", {
  userId: user.subject,
  gameId: gameId,
  lastAlive: Date.now(),
  displayName: user.name ?? `Unknown Player`,
});
```

The JWT no longer carries a `name` claim reliably — fetch the auth user instead. Above the `games` insert add:

```ts
const authUser = await authComponent.safeGetAuthUser(ctx);
const displayName = authUser?.name?.trim() || "Unknown Player";
```

and change the players insert to use it:

```ts
await ctx.db.insert("players", {
  userId: user.subject,
  gameId: gameId,
  lastAlive: Date.now(),
  displayName,
});
```

In `joinGame` (around lines 134–139) apply the same change: add the same two `authUser`/`displayName` lines before the players insert and replace `displayName: user.name ?? `Unknown Player``with`displayName`.

- [ ] **Step 3: Verify**

```bash
npx convex dev --once   # deploys, typechecks
grep -n "user.name\|tokenIdentifier" convex/game.ts
```

Expected: deploy succeeds; grep returns no output. Manual: with both dev servers running and a signed-in browser, create a game — lobby shows your display name (not "Unknown Player"); join from a second browser/profile with a second account and confirm both players render.

- [ ] **Step 4: Commit**

```bash
git add convex/game.ts
git commit -m "feat: key game data on Better Auth user id (identity.subject)"
```

---

### Task 10: Remove Clerk dependency, env vars, and update copy

**Files:**

- Modify: `app/env.ts` (remove Clerk entries)
- Modify: `package.json` (remove `@clerk/nextjs`)
- Modify: `app/privacy/page.tsx:13,15,20,34,39`
- Modify: `app/tos/page.tsx:22`
- Modify: `README.md:14-17,31`

**Interfaces:**

- Consumes: nothing new.
- Produces: a Clerk-free build. (The Clerk _dashboard_ instance stays alive until post-cut-over as a fallback; nothing in the repo reads Clerk any more.)

- [ ] **Step 1: `app/env.ts` — delete Clerk entries**

Remove these lines from `server:`/`client:`/`runtimeEnv:` respectively:

```ts
    CLERK_JWT_ISSUER_DOMAIN: z.string().url(),
    CLERK_SECRET_KEY: z.string().min(1),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    CLERK_JWT_ISSUER_DOMAIN: process.env.CLERK_JWT_ISSUER_DOMAIN,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
```

- [ ] **Step 2: Remove the package**

```bash
pnpm remove @clerk/nextjs
```

- [ ] **Step 3: Legal copy — `app/privacy/page.tsx`**

Line 13: replace `Authentication is managed by Clerk, which may collect additional personal data as per their policies.` with `Authentication is managed by Better Auth running on our Convex backend; sign-in codes are delivered by Resend.`

Line 15: replace `Clerk may also use cookies to manage authentication sessions.` with `We also use cookies to manage authentication sessions.`

Line 20: replace `To authenticate users and manage sessions through Clerk.` with `To authenticate users and manage sessions.`

Line 34: replace `Clerk and Convex provide measures within their softwares to address data security.` with `Convex and Resend provide measures within their software to address data security.`

Line 39: replace `Requests related to authentication data should be directed to Clerk,` with `Requests related to authentication data can be made directly to us,` (keep the rest of the sentence).

- [ ] **Step 4: Legal copy — `app/tos/page.tsx`**

Line 22: replace `<li>Authentication is handled by Clerk, and access to your account is subject to Clerk’s authentication policies.</li>` with `<li>Authentication uses passkeys and emailed sign-in codes; keep access to your email account secure.</li>`

- [ ] **Step 5: README**

Replace lines 14–17 (the Clerk env block) with:

```
    # Better Auth (Convex deployment env — set with `npx convex env set`)
    # BETTER_AUTH_SECRET, SITE_URL, RESEND_API_KEY, AUTH_EMAIL_FROM
    NEXT_PUBLIC_SITE_URL=<app-url>
```

Replace line 31 (`- [Clerk](https://clerk.com): User Identity and Access Management`) with:

```
- [Better Auth](https://better-auth.com): User Identity and Access Management (passkeys + email codes via [Resend](https://resend.com))
```

- [ ] **Step 6: Verify no Clerk anywhere, full build**

```bash
grep -rni "clerk" app components lib providers convex proxy.ts package.json --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules
pnpm lint && pnpm build
```

Expected: grep shows nothing; build is clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove Clerk dependency, env vars, and update legal/README copy"
```

---

### Task 11: Dev rehearsal (full end-to-end)

**Files:** none (verification only; fixes discovered here get their own commits).

This is the gate before cut-over. With `npx convex dev` + `pnpm dev` running against the **dev** deployment:

- [ ] **Step 1: Rehearse the data wipe** — clear the dev game tables exactly as the cut-over will (keeps `scenarios`, never touches the betterAuth component tables):

```bash
: > /tmp/empty.jsonl
for t in games players gameRounds gameRoundScenarios gameRoundPlayerRankings gameRoundGuesses gameRating; do
  npx convex import --table "$t" --replace --format jsonLines /tmp/empty.jsonl -y
done
npx convex data games --limit 1        # expect: no rows
npx convex data scenarios --limit 1    # expect: a row — scenarios MUST survive
```

(If `convex import --replace` rejects the empty file, clear each table via the Convex dashboard → Data → table → "Clear Table" instead — same table list, and report the CLI behaviour.)

- [ ] **Step 2: New-user flow** — sign in with a fresh email + display name → OTP → account created → create a game → display name appears in lobby (not "Unknown Player").
- [ ] **Step 3: Passkey lifecycle** — "Add a passkey" step after first OTP sign-in, sign out, sign back in via "Continue with passkey", and via conditional-UI autofill (click into the email field).
- [ ] **Step 4: Two-player game** — second browser profile, second account, join via code, play a round through to `display-results`. Confirms `ctx.auth` works end-to-end in queries/mutations and real-time updates flow.
- [ ] **Step 5: OTP failure paths** — wrong code (error shown, retry works), 4th wrong attempt (`TOO_MANY_ATTEMPTS` — resend gives a fresh code), resend countdown.
- [ ] **Step 6: Maintenance interplay** — `MAINTENANCE_MODE=true pnpm dev`: every route 503s to the curtain incl. `/api/auth/*`; bypass cookie restores full sign-in + game flow.
- [ ] **Step 7: Build gate** — `pnpm lint && pnpm build && npx convex dev --once` all clean. Push the branch and open PR 2:

```bash
git push -u origin feat/better-auth
gh pr create --title "Migrate auth from Clerk to Better Auth (passkeys + email OTP)" --body "See docs/superpowers/specs/2026-07-06-better-auth-migration-design.md. Passkey-first sign-in with email OTP fallback via Resend; Better Auth runs on Convex (local-install component). Clean slate: no user/data migration — old game tables are wiped during the cut-over window (scenarios kept). Deploy per the cut-over runbook (Task 12 in the plan) — deploying Convex prod outside the maintenance window breaks live auth."
```

---

### Task 12: Production cut-over runbook

**Files:** none (operational).

Execute in order, in one sitting. Prerequisites: PR 1 merged & deployed (dormant); PR 2 approved; Resend domain verified + prod API key; `AUTH_EMAIL_FROM` uses the verified domain.

- [ ] **Step 1: Prod env vars.** Convex prod: `npx convex env set --prod BETTER_AUTH_SECRET $(openssl rand -base64 32)`, `npx convex env set --prod SITE_URL https://<production-app-url>`, `npx convex env set --prod RESEND_API_KEY <prod-key>`, `npx convex env set --prod AUTH_EMAIL_FROM "The ID Game <auth@your-verified-domain>"`. Vercel: confirm `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`, `MAINTENANCE_BYPASS_SECRET` are set.
- [ ] **Step 2: Maintenance ON.** Set `MAINTENANCE_MODE=true` in Vercel → redeploy current production → verify the curtain is up (503) and the bypass cookie works.
- [ ] **Step 3: Merge PR 2** to `main`. Vercel auto-deploys the new frontend (still behind the curtain).
- [ ] **Step 4: Deploy Convex prod:** `npx convex deploy`. From this moment Clerk tokens are rejected — the curtain is covering this.
- [ ] **Step 5: Wipe old game data** (clean slate — same commands rehearsed in Task 11 Step 1, now with `--prod`):

```bash
: > /tmp/empty.jsonl
for t in games players gameRounds gameRoundScenarios gameRoundPlayerRankings gameRoundGuesses gameRating; do
  npx convex import --prod --table "$t" --replace --format jsonLines /tmp/empty.jsonl -y
done
npx convex data --prod games --limit 1       # expect: no rows
npx convex data --prod scenarios --limit 1   # expect: a row — scenarios kept
```

- [ ] **Step 6: Smoke-test via bypass** (`https://<app>/?bypass=<secret>`): OTP sign-up with your own email + display name → add passkey → sign out → passkey sign-in → create a game → join it from a second device/profile.
- [ ] **Step 7: Maintenance OFF.** `MAINTENANCE_MODE=false` in Vercel → redeploy → public smoke test.
- [ ] **Step 8: Post-cut-over.** Watch PostHog + Convex logs for auth errors for a few days. Keep the Clerk instance (free tier) untouched for 2 weeks as a fallback, then delete it and remove any lingering `CLERK_*` values from Vercel/local env files.

---

## Self-Review Notes

- **Spec coverage:** maintenance mode (Tasks 1–2), component + plugins architecture (Tasks 3–4), Next wiring (Task 5), auth flows/UI incl. dropped username + passkey nudge (Task 6), component swaps + server bridge (Task 7), proxy gate (Task 8), `subject` switch + displayName sourcing (Task 9), Clerk removal + legal copy (Task 10), rehearsal incl. wipe rehearsal (Task 11), cut-over sequence with data wipe + post steps (Task 12). Clean slate per revised spec: no import/remap machinery anywhere. PostHog distinct-id change is accepted per spec.
- **Known uncertainty, called out inline:** the shape of the auth user object (`_id` vs `id`) in `getCurrentUser` (Task 3) — the step says exactly what to do in each case; 503-on-rewrite support (Task 2) — verification asserts it; `convex import --replace` with an empty file (Task 11 Step 1) — dashboard fallback given.
- The `fetchAuthAction` export in Task 5 is unused but harmless (part of the destructured helper set).
