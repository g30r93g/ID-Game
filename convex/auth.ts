import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { Resend } from "@convex-dev/resend";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { admin, emailOTP } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

export const resend = new Resend(components.resend, { testMode: false });

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
  },
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  // The localhost fallback exists ONLY for env-less static analysis /
  // schema introspection (Convex module analysis eagerly evaluates
  // `createApi(schema, createAuthOptions)` in betterAuth/adapter.ts, and
  // `npx auth generate` constructs the auth instance, both without env
  // vars). Real usage goes through `createAuth`, which fails fast if
  // SITE_URL is missing.
  const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
  // WebAuthn rpID: use the registrable domain (id-game.com) rather than the
  // full hostname (www.id-game.com) so passkeys stay valid across subdomains
  // and a future canonical-domain change. Assumes a single-label public
  // suffix (.com); localhost and other dotless hosts pass through unchanged.
  const hostname = new URL(siteUrl).hostname;
  const rpID = hostname.includes(".")
    ? hostname.split(".").slice(-2).join(".")
    : hostname;
  return {
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    // Better Auth's default rate limiting uses in-memory storage, which is
    // meaningless across Convex's ephemeral isolates — store windows in the
    // database instead. The OTP send endpoint triggers real Resend emails
    // from an unauthenticated route, so it gets a tight per-IP rule.
    rateLimit: {
      enabled: true,
      storage: "database",
      // Global window also bounds expired-row pruning; keep it >= the longest
      // custom rule below so those windows aren't pruned early.
      window: 60,
      max: 100,
      customRules: {
        "/email-otp/send-verification-otp": { window: 60, max: 6 },
        "/sign-in/email-otp": { window: 60, max: 10 },
      },
    },
    plugins: [
      admin(),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        // The Resend component enqueues the send durably — this await is a fast enqueue, not a blocking SMTP round-trip, so it leaks no account-existence timing signal.
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
        rpID,
        rpName: "The ID Game",
        origin: siteUrl,
      }),
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  if (!process.env.SITE_URL) {
    throw new Error(
      "SITE_URL is not set on this Convex deployment — run: npx convex env set SITE_URL <app-url>",
    );
  }
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
      role: (user as { role?: string }).role ?? "user",
    };
  },
});
