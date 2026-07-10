"use client";

import * as React from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icons } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/**
 * A frosted-glass identity bar shown above the game card: greeting + avatar on
 * the left, sign out on the right. Clicking the greeting opens a dialog to
 * change the display name. The container styling is a floating header
 * (semi-transparent fill, hairline ring, layered soft shadow); the contents
 * are shadcn primitives. Pass `className` to control how it layers against the
 * card below it (e.g. a negative bottom margin so it emerges from behind the
 * card's top edge).
 */
export function UserTray({ className }: { className?: string }) {
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user;

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const email = user?.email;
  const initial = (firstName?.[0] ?? email?.[0] ?? "?").toUpperCase();
  const greeting = firstName ? `Hey ${firstName} 👋` : "Welcome 👋";

  const openDialog = (open: boolean) => {
    if (open) {
      setName(user?.name ?? "");
      setError(null);
    }
    setDialogOpen(open);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === user?.name) {
      setDialogOpen(false);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        setError(error.message ?? "Could not update your name. Try again.");
        return;
      }
      setDialogOpen(false);
      toast.success("Display name updated");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-t-2xl px-3 py-2 backdrop-blur-sm bg-[rgba(248,248,248,0.9)] dark:bg-[rgba(19,19,22,0.9)] shadow-[0_0_0_0.5px_rgba(255,255,255,0.9)_inset,0_0_0_0.5px_rgba(19,19,22,0.15),0_2px_3px_0_rgba(0,0,0,0.04),0_4px_6px_0_rgba(34,42,53,0.04),0_1px_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_0_0_0.5px_rgba(247,247,248,0.15)_inset,0_0_0_0.5px_rgba(19,19,22,0.8),0_2px_3px_0_rgba(0,0,0,0.16),0_4px_6px_0_rgba(34,42,53,0.16),0_1px_1px_0_rgba(0,0,0,0.16)]",
        className,
      )}
    >
      <Dialog open={dialogOpen} onOpenChange={openDialog}>
        <DialogTrigger asChild>
          <button
            type="button"
            disabled={isPending || !user}
            className="flex min-w-0 items-center gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Change your display name"
          >
            <Avatar className="size-7">
              {user?.image ? (
                <AvatarImage src={user.image} alt={firstName ?? "You"} />
              ) : null}
              <AvatarFallback className="text-xs font-medium">
                {isPending ? "" : initial}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-sm font-medium decoration-muted-foreground/50 underline-offset-4 hover:underline">
              {isPending ? " " : greeting}
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <form onSubmit={handleSave} className="contents">
            <DialogHeader>
              <DialogTitle>Change your display name</DialogTitle>
              <DialogDescription>
                This is the name other players see. It applies to games you
                create or join from now on.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                type="text"
                autoComplete="name"
                autoFocus
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Icons.spinner className="size-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-muted-foreground"
        onClick={() => {
          void authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                window.location.href = "/sign-in";
              },
            },
          });
        }}
      >
        <LogOut />
        Sign out
      </Button>
    </div>
  );
}
