"use client";

import {LogOut} from "lucide-react";
import {useClerk, useUser} from "@clerk/nextjs";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";

/**
 * A frosted-glass identity bar shown above the game card: greeting + avatar on
 * the left, sign out on the right. The container styling mirrors Clerk's own
 * floating header (semi-transparent fill, hairline ring, layered soft shadow);
 * the contents are shadcn primitives. Pass `className` to control how it layers
 * against the card below it (e.g. a negative bottom margin so it emerges from
 * behind the card's top edge).
 */
export function UserTray({ className }: { className?: string }) {
  const {user, isLoaded} = useUser();
  const {signOut} = useClerk();

  const firstName = user?.firstName?.trim();
  const email = user?.primaryEmailAddress?.emailAddress;
  const initial = (firstName?.[0] ?? email?.[0] ?? "?").toUpperCase();
  const greeting = firstName ? `Hey ${firstName} 👋` : "Welcome 👋";

  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-t-2xl px-3 py-2 backdrop-blur-sm bg-[rgba(248,248,248,0.9)] dark:bg-[rgba(19,19,22,0.9)] shadow-[0_0_0_0.5px_rgba(255,255,255,0.9)_inset,0_0_0_0.5px_rgba(19,19,22,0.15),0_2px_3px_0_rgba(0,0,0,0.04),0_4px_6px_0_rgba(34,42,53,0.04),0_1px_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_0_0_0.5px_rgba(247,247,248,0.15)_inset,0_0_0_0.5px_rgba(19,19,22,0.8),0_2px_3px_0_rgba(0,0,0,0.16),0_4px_6px_0_rgba(34,42,53,0.16),0_1px_1px_0_rgba(0,0,0,0.16)]", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar className="size-7">
          {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt={firstName ?? "You"}/> : null}
          <AvatarFallback className="text-xs font-medium">{isLoaded ? initial : ""}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{isLoaded ? greeting : " "}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0 text-muted-foreground"
        onClick={() => signOut({redirectUrl: "/sign-in"})}
      >
        <LogOut/>
        Sign out
      </Button>
    </div>
  );
}
