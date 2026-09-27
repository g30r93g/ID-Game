"use client";

import * as React from "react";
import { useConvex } from "convex/react";
import {
  getFunctionName,
  makeFunctionReference,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
} from "convex/server";
import { convexToJson, jsonToConvex, type Value } from "convex/values";

type Settled<T> = {
  key: string;
  nonce: number;
  data?: T;
  error?: unknown;
  fetchedAt: number;
};

export type OneShotQuery<T> = {
  /** The result for the current args, kept while a refresh is in flight. */
  data: T | undefined;
  error: unknown;
  /** When `data` (or `error`) arrived, so the page can label it a snapshot. */
  fetchedAt: number | undefined;
  loading: boolean;
  refresh: () => void;
};

/**
 * Runs a query once, instead of subscribing to it the way `useQuery` does.
 *
 * The admin stats read whole windows of busy tables (`players` is patched on
 * every heartbeat), so a live subscription re-ran them for every connected
 * player every few seconds while an admin tab sat open. Admins don't need live
 * counts: this fetches on mount, again when the args change (a new page or
 * cursor), and whenever `refresh` is called.
 *
 * `useConvex().query` subscribes just long enough for the first result and then
 * drops the subscription, so later writes don't re-run the query.
 */
export function useOneShotQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: FunctionArgs<Query>,
): OneShotQuery<FunctionReturnType<Query>> {
  const convex = useConvex();
  // `api.*` references and args objects are new on every render, so the effect
  // keys on their serialised forms instead.
  const name = getFunctionName(query);
  const argsJson = JSON.stringify(convexToJson(args as Value));
  const key = `${name}:${argsJson}`;
  const [nonce, setNonce] = React.useState(0);
  const [settled, setSettled] = React.useState<Settled<
    FunctionReturnType<Query>
  > | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const settle = (result: { data?: FunctionReturnType<Query>; error?: unknown }) => {
      if (!cancelled) {
        setSettled({ key: `${name}:${argsJson}`, nonce, fetchedAt: Date.now(), ...result });
      }
    };
    convex
      .query(
        makeFunctionReference<"query">(name),
        jsonToConvex(JSON.parse(argsJson)) as Record<string, Value>,
      )
      .then(
        (data: FunctionReturnType<Query>) => settle({ data }),
        (error: unknown) => settle({ error }),
      );
    return () => {
      cancelled = true;
    };
  }, [convex, name, argsJson, nonce]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  // A result for other args (the previous page) is never shown as this one's.
  const current = settled?.key === key ? settled : undefined;
  return {
    data: current?.data,
    error: current?.error,
    fetchedAt: current?.fetchedAt,
    loading: current === undefined || current.nonce !== nonce,
    refresh,
  };
}
