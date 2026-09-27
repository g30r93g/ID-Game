import { DirectAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** Guests share the user table with accounts, but are counted apart. */
export type UserKind = "account" | "guest";

type CountedUser = { _id: string; isAnonymous?: boolean | null };

/**
 * One entry per user, in a namespace for each kind, so the admin stats read
 * two counts instead of the whole user table.
 *
 * Kept up to date by the Better Auth triggers in convex/auth.ts, and seeded
 * for users that predate them by `migrations.backfillUserCounts`. An aggregate
 * rather than a counter document, because concurrent guest sign-ups would all
 * conflict on a single document. Each namespace is its own tree, so guest
 * writes never contend with account writes either.
 *
 * Every write here is the idempotent "if exists / if missing" form. A
 * user the backfill already counted, or one deleted before it got there, is
 * then neither counted twice nor an error that fails the auth write.
 */
export const userCounts = new DirectAggregate<{
  Namespace: UserKind;
  Key: null;
  Id: string;
}>(components.userCounts);

export const userKind = (user: { isAnonymous?: boolean | null }): UserKind =>
  user.isAnonymous === true ? "guest" : "account";

export async function countUser(ctx: MutationCtx, user: CountedUser) {
  await userCounts.insertIfDoesNotExist(ctx, {
    namespace: userKind(user),
    key: null,
    id: user._id,
  });
}

export async function uncountUser(ctx: MutationCtx, user: CountedUser) {
  await userCounts.deleteIfExists(ctx, {
    namespace: userKind(user),
    key: null,
    id: user._id,
  });
}

/** Moves a user between counts when an update flips `isAnonymous`. */
export async function recountUser(
  ctx: MutationCtx,
  newUser: CountedUser,
  oldUser: CountedUser,
) {
  const from = userKind(oldUser);
  const to = userKind(newUser);
  if (from === to) return;
  await userCounts.replaceOrInsert(
    ctx,
    { namespace: from, key: null, id: oldUser._id },
    { namespace: to, key: null },
  );
}

export async function readUserCounts(ctx: QueryCtx) {
  const [accounts, guests] = await userCounts.countBatch(ctx, [
    { namespace: "account" },
    { namespace: "guest" },
  ]);
  return { accounts, guests };
}
