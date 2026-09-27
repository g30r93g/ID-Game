import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { env } from "@/app/env";
import { inviteRedirectFor } from "@/lib/join-code";

const BYPASS_COOKIE = "maintenance-bypass";

const INGEST = "/ingest";
const POSTHOG_HOST = "eu.i.posthog.com";
const POSTHOG_ASSETS_HOST = "eu-assets.i.posthog.com";

/**
 * Forwards `/ingest/*` to PostHog's EU hosts, the first-party address the
 * browser sends analytics to. Returns null for any other path.
 *
 * This used to be a `rewrites()` entry in next.config.ts, but an external
 * rewrite passes the request on untouched, cookies included: every capture
 * sent PostHog the Better Auth session token, the Convex JWT and anything
 * else set on this domain. Here the request headers are rebuilt without
 * `Cookie` and `Authorization`, which PostHog never needs; the event itself
 * travels in the body. A header left out of the override is deleted before
 * the request goes on (proxy.test.ts pins this down).
 */
export function ingestRewrite(req: NextRequest): NextResponse | null {
  const { pathname, search } = req.nextUrl;
  if (pathname !== INGEST && !pathname.startsWith(`${INGEST}/`)) return null;

  const path = pathname.slice(INGEST.length);
  const host = path.startsWith("/static/") ? POSTHOG_ASSETS_HOST : POSTHOG_HOST;

  const headers = new Headers(req.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  // PostHog routes on Host and answers 401 to ours.
  headers.set("host", host);

  return NextResponse.rewrite(new URL(`https://${host}${path}${search}`), {
    request: { headers },
  });
}

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
  // Before the maintenance gate: analytics doesn't touch the game.
  const ingest = ingestRewrite(req);
  if (ingest) return ingest;

  const maintenance = maintenanceResponse(req);
  if (maintenance) return maintenance;

  // Optimistic gate: cookie presence only. Authoritative auth checks live in
  // the Convex functions via ctx.auth.getUserIdentity().
  if (req.nextUrl.pathname.startsWith("/game")) {
    const sessionCookie = getSessionCookie(req);
    if (!sessionCookie) {
      // A shared game link goes to its public invite page, which link-preview
      // crawlers can read and where people join as a guest or sign in.
      const invite = inviteRedirectFor(req.nextUrl.pathname);
      if (invite) return NextResponse.redirect(new URL(invite, req.url));

      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set("next", req.nextUrl.pathname);
      return NextResponse.redirect(signIn);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Every page and API route except:
    // - `_next/` and anything with a file extension (static assets);
    // - `ingest/`, which the second entry covers in full;
    // - `api/auth/`, Better Auth's own routes, which authenticate themselves.
    // Better Auth skips the maintenance gate, which is harmless: session
    // checks don't touch the game. `api/admin/` and every page, `/` included,
    // still go through it.
    "/((?!_next/|ingest/|api/auth/|.*\\..*).*)",
    // The PostHog proxy, extensions and all (`/ingest/static/array.js` would
    // fall to the rule above), so no request reaches PostHog with our
    // cookies. That costs a proxy run per capture, flag and replay request,
    // which a rewrite in next.config.ts didn't, but the proxy only rewrites
    // and the upload itself still streams through Vercel's edge.
    // proxy.test.ts pins both entries down.
    "/ingest/:path*",
  ],
};
