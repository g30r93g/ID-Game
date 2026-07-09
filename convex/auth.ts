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
import authSchema from "./betterAuth/schema";

// Falls back to a placeholder so plugin construction (e.g. passkey's
// `new URL(siteUrl)`) doesn't throw when this module is evaluated without
// environment variable access — which happens during Convex's local module
// analysis step (schema generation, `createApi` in betterAuth/adapter.ts).
// At actual runtime, the real deployed SITE_URL is always set.
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

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
