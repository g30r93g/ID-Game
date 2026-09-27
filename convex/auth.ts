import { dash } from "@better-auth/infra";
import { passkey } from "@better-auth/passkey";
import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { Resend } from "@convex-dev/resend";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { admin, anonymous, emailOTP } from "better-auth/plugins";
import {
  GUEST_EMAIL_DOMAIN,
  guestPlaceholderName,
  isGuestPlaceholderName,
} from "../lib/guest";
import { components, internal } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { internalAction, query } from "./_generated/server";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { countUser, recountUser, uncountUser } from "./userCounts";

export const resend = new Resend(components.resend, { testMode: false });

// Annotated to break the type cycle: `internal.auth` includes the trigger
// functions exported below, which are built from `authComponent`.
const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: {
      schema: authSchema,
    },
    authFunctions,
    // Keeps the admin user counts (convex/userCounts.ts) in step with every
    // user write that goes through the Better Auth adapter. A direct call to
    // `components.betterAuth.adapter.*` skips these unless it passes the
    // matching handle, as `cleanup.deleteExpiredGuests` does.
    triggers: {
      user: {
        onCreate: async (ctx, user) => {
          await countUser(ctx, user);
        },
        onUpdate: async (ctx, newUser, oldUser) => {
          await recountUser(ctx, newUser, oldUser);
        },
        onDelete: async (ctx, user) => {
          await uncountUser(ctx, user);
        },
      },
    },
  },
);

export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

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
    appName: "The ID Game",
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
        // Guest accounts need nothing but a request, so this is the bot gate
        // for them. Loose enough for a group joining from one venue's Wi-Fi.
        "/sign-in/anonymous": { window: 60, max: 10 },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
      }
    },
    plugins: [
      admin(),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        storeOTP: "hashed",
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
      // Guests: invitees join a game with just a display name. They can join
      // but never create games (enforced in `createGame`, which reads the
      // `isAnonymous` claim the Convex JWT carries over from the user row).
      anonymous({
        // A reserved TLD, so nothing can ever be delivered to a guest address.
        emailDomainName: GUEST_EMAIL_DOMAIN,
        generateName: () => guestPlaceholderName(),
        // Runs when a guest signs in or signs up for real, on the request that
        // creates the account session and before the plugin deletes the guest
        // user. Deliberately not caught: if the seats can't be moved, failing
        // the sign-in keeps the guest (and its seats) around to retry with,
        // where swallowing the error would delete them.
        onLinkAccount: async ({ anonymousUser, newUser, ctx: endpoint }) => {
          const guestName = anonymousUser.user.name?.trim();
          let name: string | undefined = newUser.user.name?.trim();
          // A brand-new account from the sign-in tab arrives nameless; the
          // name they were playing under is the one they'd pick anyway.
          if (!name && guestName && !isGuestPlaceholderName(guestName)) {
            await endpoint.context.internalAdapter.updateUser(newUser.user.id, {
              name: guestName,
            });
            name = guestName;
          }
          await requireActionCtx(ctx).runMutation(
            internal.guests.adoptGuestPlayers,
            {
              guestUserId: anonymousUser.user.id,
              userId: newUser.user.id,
              ...(name ? { displayName: name } : {}),
            },
          );
        },
      }),
      passkey({
        rpID,
        rpName: "The ID Game",
        origin: siteUrl,
      }),
      // Better Auth Dash. Reads its credential from BETTER_AUTH_API_KEY on
      // the Convex deployment (npx convex env set BETTER_AUTH_API_KEY <key>);
      // a missing key resolves to "" rather than throwing, which is what
      // keeps env-less module analysis and `npx auth generate` working.
      // Left unconfigured deliberately: `activityTracking` and
      // `managedDirectorySync` both default to false, and both are the only
      // options that contribute plugin schema — so enabling either one means
      // regenerating convex/betterAuth/generatedSchema.ts.
      dash(),
      // With JWKS set, tokens are signed with that key rather than one read
      // from the jwks table on every mint. Must match auth.config.ts, which
      // reads the same variable; unset, both go back to the table (the config
      // through the /api/auth/convex/jwks endpoint).
      convex({ authConfig, jwks: process.env.JWKS }),
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

/**
 * The newest signing key in the jwks table (creating one if there is none),
 * shaped for the JWKS env var. It reuses the existing key rather than rotating,
 * so tokens already issued keep verifying once the static keys go live:
 *
 *   npx convex run auth:getLatestJwks --prod | npx convex env set JWKS --prod
 *
 * then redeploy so auth.config.ts picks it up. The output includes the
 * PRIVATE key: pipe it straight into `env set`, never log or commit it.
 * Internal, so only someone with deploy access can run it.
 */
export const getLatestJwks = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = createAuth(ctx);
    return await auth.api.getLatestJwks();
  },
});

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
      isAnonymous: user.isAnonymous === true,
    };
  },
});
