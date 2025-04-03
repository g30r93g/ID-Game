import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher(['/', '/auth', '/tos', '/privacy', '/ingest']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  await auth.protect();
}, {
  debug: process.env.NODE_ENV === 'development',
})

export const config = {
  // The following matcher runs middleware on all routes except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
