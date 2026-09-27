"use client";

import * as React from "react";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asks someone who has used an account on this device whether they'd rather
 * sign in than join as a guest. Its own module so the invite page only loads
 * the dialog code for the few visitors who can ever see it (see `GuestJoin`).
 */
export default function WelcomeBackDialog({
  open,
  onOpenChange,
  greetingName,
  joining,
  onJoinAsGuest,
  signInHref,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  greetingName: string | null;
  joining: boolean;
  onJoinAsGuest: () => void;
  signInHref: string;
  /** Focused when the dialog closes: the invite card's main action. */
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-sm"
        // Dismissing lands on the invite card; focus its main action.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
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
          <Button variant="outline" disabled={joining} onClick={onJoinAsGuest}>
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
  );
}
