"use client";

import * as React from "react";
import { authClient } from "@/lib/auth-client";
import { rememberAccount } from "@/lib/remembered-account";

/**
 * Notes on this device that a real (non-guest) account has been signed in
 * here, for the invite page's "Welcome back" prompt. See
 * lib/remembered-account.ts.
 *
 * Mounted in the signed-in layout rather than on the sign-in page's success
 * path, so players who were already signed in before this existed — most of
 * them, given long-lived sessions — are remembered too.
 */
export function RememberAccount() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const isAccount = !!user && !user.isAnonymous;
  const name = user?.name;

  React.useEffect(() => {
    if (isAccount) rememberAccount(name);
  }, [isAccount, name]);

  return null;
}
