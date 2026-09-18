"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/display-name";
import { useSaveDisplayName } from "@/lib/use-display-name";
import { Button } from "@/components/ui/button";
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

/**
 * Catches accounts that reached the app without a display name and asks for one.
 *
 * Signing in with an email that has never been used creates the account there
 * and then, and the OTP flow carries no name on that path — only the sign-up
 * tab collects one. Those accounts show up to everyone else as
 * "Unknown Player", so this asks before they get any further.
 *
 * Deliberately not dismissable: there is no useful state behind it (a nameless
 * player is what the fix is for) and the only way past it is to answer or sign
 * out. It is mounted once for the whole signed-in area rather than per page,
 * because /game/[code] joins the game server-side on first paint — the row is
 * already written by the time anything renders, which is why saving also
 * back-fills existing games.
 */
export function DisplayNamePrompt() {
  const pathname = usePathname();
  const { data: session, isPending } = authClient.useSession();
  const saveDisplayName = useSaveDisplayName();

  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Closes the dialog on the click rather than a beat later when the refreshed
  // session lands, so saving doesn't leave the form sitting there looking stuck.
  const [saved, setSaved] = React.useState(false);

  // The auth pages run under this layout too. A brand-new account has no name
  // for the moments between the code being accepted and the redirect landing,
  // and popping this over the passkey offer would be answering a question the
  // user is not on yet — /game asks instead.
  const onAuthRoute = pathname?.startsWith("/sign-") ?? false;

  const user = session?.user;
  const open =
    !onAuthRoute && !isPending && !!user && !user.name?.trim() && !saved;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name so other players know who you are.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const message = await saveDisplayName(trimmed);
      if (message) {
        setError(message);
        return;
      }
      setSaved(true);
      toast.success(`You're playing as ${trimmed}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-sm"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>What should we call you?</DialogTitle>
            <DialogDescription>
              Your account doesn&apos;t have a name yet, so everyone else sees
              you as &quot;Unknown Player&quot;. Pick the name you want on your
              card.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="prompt-display-name">Display name</Label>
            <Input
              id="prompt-display-name"
              type="text"
              autoComplete="name"
              autoFocus
              required
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              placeholder="e.g. Alex"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? (
                <Icons.spinner className="size-4 animate-spin" />
              ) : (
                "Save and play"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
