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
