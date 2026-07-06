import { auth } from "@clerk/nextjs/server";

export async function getAuthToken() {
  try {
    return (await (await auth()).getToken({ template: "convex" })) ?? undefined;
  } catch {
    // Clerk 7 (Core 3) getToken() throws ClerkOfflineError when offline instead
    // of returning null. Degrade gracefully so callers still receive undefined.
    return undefined;
  }
}
