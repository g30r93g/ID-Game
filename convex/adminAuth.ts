import { ConvexError } from "convex/values";
import { authComponent } from "./auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "./_generated/dataModel";
import { ADMIN_ACCESS_REQUIRED } from "../lib/admin/access";

/**
 * Throws unless the current user has the admin role. Every admin query and
 * mutation must call this before reading data.
 */
export async function requireAdmin(ctx: GenericCtx<DataModel>) {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user || (user as { role?: string }).role !== "admin") {
    // A ConvexError so the admin API routes can recognise it; see
    // lib/admin/access.ts.
    throw new ConvexError(ADMIN_ACCESS_REQUIRED);
  }
  return user;
}
