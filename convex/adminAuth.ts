import { authComponent } from "./auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";

/**
 * Throws unless the current user has the admin role. Every admin query and
 * mutation must call this before reading data.
 */
export async function requireAdmin(ctx: GenericCtx<DataModel>) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user || (user as { role?: string }).role !== "admin") {
    throw new Error("Admin access required.");
  }
  return user;
}
