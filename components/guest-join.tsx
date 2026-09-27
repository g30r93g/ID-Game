"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";
import {
  firstName,
  parseRememberedAccount,
  rememberedAccountSnapshot,
} from "@/lib/remembered-account";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";

// Signing in anonymously from a session that is already a guest's is refused
// by the plugin. It means this browser is already set up to play, so it is
// treated as success rather than shown as an error.
const ALREADY_GUEST = "ANONYMOUS_USERS_CANNOT_SIGN_IN_AGAIN_ANONYMOUSLY";

// Only this page's own visit matters, so there is nothing to subscribe to.
const noSubscription = () => () => {};

/**
 * The invite page's way in: join as a guest with just a display name, or sign
 * in to an account. Guests can join games but not create them (see
 * `createGame`), which keeps accounts as the bot gate for the thing bots
 * actually abuse.
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

  const nameInput = React.useRef<HTMLInputElement>(null);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);

  // A full document load, like the sign-in page: it re-runs the signed-in
  // layout, which seeds the Convex client with a token for the new session.
  const goToGame = () => window.location.assign(`/game/${joinCode}`);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (hasSession) {
      setJoining(true);
      goToGame();
      return;
    }

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter the name you want other players to see.");
      return;
    }

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

      // The guest was created as "Guest 1234". Failing to rename isn't worth
      // stopping for: they can still play, and change it from the user tray.
      const { error: nameError } = await authClient.updateUser({
        name: trimmed,
      });
      if (nameError) {
        console.error("Could not set the guest's display name", nameError);
      }

      leaving = true;
      goToGame();
    } finally {
      // Stay busy while the next page loads, so the button can't fire twice.
      if (!leaving) setJoining(false);
    }
  };

  const greetingName = firstName(remembered?.name);

  return (
    <>
      <form className="contents" onSubmit={handleSubmit}>
        <CardContent className="space-y-2">
          {hasSession ? (
            <p className="text-sm text-muted-foreground">
              {signedInAs
                ? `You're signed in as ${signedInAs}.`
                : "You're already signed in."}
            </p>
          ) : (
            <>
              <Label htmlFor="guest-name">Your name</Label>
              <Input
                id="guest-name"
                ref={nameInput}
                type="text"
                autoComplete="nickname"
                required
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                placeholder="What should everyone call you?"
                value={name}
                disabled={joining}
                onChange={(event) => setName(event.target.value)}
              />
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <Button type="submit" className="w-full" disabled={joining}>
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

      <Dialog
        open={promptOpen}
        onOpenChange={(open) => setPromptDismissed(!open)}
      >
        <DialogContent
          className="sm:max-w-sm"
          // Closing lands on the guest form; put the cursor where it's needed.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            nameInput.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {greetingName ? `Welcome back, ${greetingName}` : "Welcome back"}
            </DialogTitle>
            <DialogDescription>
              You&apos;ve played with an account on this device. Sign in to join
              with it, so this game sits alongside your others — or join as a
              guest just this once.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPromptDismissed(true)}>
              Join as a guest
            </Button>
            <Button asChild>
              <Link href={signInHref}>
                <LogIn />
                Sign in
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
