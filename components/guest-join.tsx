"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  firstName,
  parseRememberedAccount,
  rememberedAccountSnapshot,
} from "@/lib/remembered-account";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Icons } from "@/components/ui/icons";

// Only a visitor with a remembered account and no session can ever see this
// modal, and the remembered account is read from localStorage after hydration,
// so it is loaded on demand and never server-rendered: the invite page's
// first load doesn't carry the dialog code for everyone else.
const WelcomeBackDialog = dynamic(
  () => import("@/components/welcome-back-dialog"),
  { ssr: false },
);

// Signing in anonymously from a session that is already a guest's is refused
// by the plugin. It means this browser is already set up to play, so it is
// treated as success rather than shown as an error.
const ALREADY_GUEST = "ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY";

// Only this page's own visit matters, so there is nothing to subscribe to.
const noSubscription = () => () => {};

/**
 * The invite page's way in: join as a guest in one click, or sign in to an
 * account. Guests can join games but not create them (see `createGame`), which
 * keeps accounts as the bot gate for the thing bots actually abuse.
 *
 * Guests arrive in the lobby as "Guest 1234" and are asked for a name there by
 * `DisplayNamePrompt`, the same prompt a nameless account gets, so nothing
 * stands between the invite link and the game.
 *
 * Someone who has signed in with an account on this device before is asked
 * first, in a modal, whether they'd rather sign in: joining as a guest would
 * put them in the game under a separate identity their account doesn't know.
 *
 * Renders a card's content and footer, to sit inside the invite card.
 */
export function GuestJoin({
  joinCode,
  signInHref,
}: {
  joinCode: string;
  signInHref: string;
}) {
  const { data: session, isPending } = authClient.useSession();
  // The invite page sends anyone with a working session straight to the game,
  // so this only shows when that server-side check failed. Signing in
  // anonymously from an account session would swap the account out for a
  // guest, so such a visitor is just sent on to the game instead.
  const signedInAs = session?.user?.name;
  const hasSession = !isPending && !!session?.user;

  // localStorage, read after hydration: the server snapshot is "nothing".
  const stored = React.useSyncExternalStore(
    noSubscription,
    rememberedAccountSnapshot,
    () => null,
  );
  const remembered = React.useMemo(
    () => parseRememberedAccount(stored),
    [stored],
  );
  const [promptDismissed, setPromptDismissed] = React.useState(false);
  const promptOpen = remembered !== null && !promptDismissed && !hasSession;

  const joinButton = React.useRef<HTMLButtonElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);

  // A full document load, like the sign-in page: it re-runs the signed-in
  // layout, which seeds the Convex client with a token for the new session.
  const goToGame = () => window.location.assign(`/game/${joinCode}`);

  const joinAsGuest = async () => {
    setError(null);
    setJoining(true);
    let leaving = false;
    try {
      const { error: signInError } = await authClient.signIn.anonymous();
      if (signInError && signInError.code !== ALREADY_GUEST) {
        setError(
          signInError.status === 429
            ? "Lots of people just joined from this network. Try again in a minute."
            : (signInError.message ?? "Couldn't join the game. Try again."),
        );
        return;
      }

      leaving = true;
      goToGame();
    } finally {
      // Stay busy while the next page loads, so the button can't fire twice.
      if (!leaving) setJoining(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (hasSession) {
      setJoining(true);
      goToGame();
      return;
    }
    void joinAsGuest();
  };

  const greetingName = firstName(remembered?.name);

  return (
    <>
      <form className="contents" onSubmit={handleSubmit}>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {hasSession
              ? signedInAs
                ? `You're signed in as ${signedInAs}.`
                : "You're already signed in."
              : "No account needed — you'll pick the name everyone sees once you're in."}
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button
            ref={joinButton}
            type="submit"
            className="w-full"
            disabled={joining}
          >
            {joining ? (
              <Icons.spinner className="size-4 animate-spin" />
            ) : (
              <>
                {hasSession ? "Continue to game" : "Join as a guest"}
                <ArrowRight />
              </>
            )}
          </Button>
          {!hasSession && (
            <Button asChild variant="link" size="sm">
              <Link href={signInHref}>Have an account? Sign in</Link>
            </Button>
          )}
        </CardFooter>
      </form>

      {/* Mounted for as long as it could show, not just while open, so
          dismissing it still plays the close animation and hands focus back
          to the join button. */}
      {remembered !== null && !hasSession && (
        <WelcomeBackDialog
          open={promptOpen}
          onOpenChange={(open) => setPromptDismissed(!open)}
          greetingName={greetingName}
          joining={joining}
          onJoinAsGuest={() => {
            setPromptDismissed(true);
            void joinAsGuest();
          }}
          signInHref={signInHref}
          returnFocusRef={joinButton}
        />
      )}
    </>
  );
}
