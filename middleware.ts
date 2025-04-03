import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import {env} from "@/app/env";

const isPublicRoute = createRouteMatcher(['/', '/auth', '/tos', '/privacy', '/ingest']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  await auth.protect();
}, {
  debug: env.NODE_ENV === 'development',
})

export const config = {
  // The following matcher runs middleware on all routes except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
