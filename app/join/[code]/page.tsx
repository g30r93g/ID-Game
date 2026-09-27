import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GuestJoin } from "@/components/guest-join";
import { SiteFooter } from "@/components/site-footer";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { env } from "@/app/env";
import { getSessionToken } from "@/lib/auth-server";
import { getInvite, inviteTitle, roundsLabel, type Invite } from "@/lib/invite";
import { invitePath, normaliseJoinCode } from "@/lib/join-code";
import { pageOpenGraph, SITE_DESCRIPTION } from "@/lib/metadata";
import { PostHogIdentity } from "@/providers/PostHogIdentity";

// The link the lobby shares. It lives outside the signed-in routes so that
// link-preview crawlers, which never have a session, can read its tags and
// image; people who are signed in (as a guest or with an account) go straight
// through to the game. Everyone else can join an open game as a guest, or
// sign in.

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const code = normaliseJoinCode((await params).code);
  if (!code) return {};
  const invite = await getInvite(code);

  const { title, description } = describe(invite);
  return {
    title,
    description,
    alternates: { canonical: invitePath(code) },
    openGraph: pageOpenGraph({
      path: invitePath(code),
      title,
      description,
      brandImage: false, // ./opengraph-image.tsx draws the invite
    }),
    // Invites are short-lived; previews are wanted, search results are not.
    robots: { index: false },
  };
}

function describe(invite: Invite | null) {
  const title = inviteTitle(invite);
  if (invite?.status === "open") {
    return {
      title,
      description: `You're invited to The ID Game. Join code ${invite.joinCode} · ${roundsLabel(invite.totalRounds)}.`,
    };
  }
  if (invite?.status === "started") {
    return {
      title,
      description: `This game is closed to new players. Join code ${invite.joinCode}.`,
    };
  }
  return { title, description: SITE_DESCRIPTION };
}

export default async function JoinPage({ params }: Props) {
  const code = normaliseJoinCode((await params).code);
  if (!code) notFound();

  // Signed in, guest or account: the game page joins whoever arrives, so go
  // straight there. Crawlers, and most people opening an invite, have no
  // session and skip the check. If the check fails, the invite still renders
  // and sign-in sorts it out.
  const token = await getSessionToken().catch((error) => {
    console.error("Could not check the session on an invite", error);
    return undefined;
  });
  if (token) redirect(`/game/${code}`);

  const invite = await getInvite(code);
  const title = inviteTitle(invite);
  const signIn = `/sign-in?next=${encodeURIComponent(`/game/${code}`)}`;

  return (
    <div className="min-h-svh flex flex-col">
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full sm:w-96">
          <CardHeader>
            {invite?.status === "open" && (
              <p className="text-sm font-medium text-warning-foreground dark:text-warning">
                You’re invited
              </p>
            )}
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>
              {invite?.status === "open"
                ? `${roundsLabel(invite.totalRounds)} of calling out friends and guessing the answers.`
                : invite?.status === "started"
                  ? "It's closed to new players. Already in it? Sign in to jump back in."
                  : "This game has finished, or the code is wrong. Start one of your own instead."}
            </CardDescription>
          </CardHeader>
          {invite && invite.status !== "ended" && (
            <CardContent>
              <JoinCode code={invite.joinCode} />
            </CardContent>
          )}
          {invite?.status === "open" ? (
            <>
              <GuestJoin joinCode={invite.joinCode} signInHref={signIn} />
              {/* Identifies the guest this page signs in, as the signed-in
                  layouts do. Production only, like PostHogProvider. */}
              {env.NODE_ENV === "production" && <PostHogIdentity />}
            </>
          ) : (
            <CardFooter className="flex flex-col gap-2">
              {invite?.status === "started" ? (
                <Button asChild className="w-full">
                  <Link href={signIn}>
                    Sign in
                    <ArrowRight />
                  </Link>
                </Button>
              ) : (
                <Button asChild className="w-full">
                  <Link href="/game">
                    Start a new game
                    <ArrowRight />
                  </Link>
                </Button>
              )}
            </CardFooter>
          )}
        </Card>
      </div>
      <SiteFooter />
    </div>
  );
}

/** The code in two groups of three, drawn like the lobby's code field. */
function JoinCode({ code }: { code: string }) {
  return (
    <div
      className="flex items-center gap-2"
      aria-label={`Join code ${code.split("").join(" ")}`}
      role="img"
    >
      {[code.slice(0, 3), code.slice(3)].map((group, g) => (
        <div key={g} className="flex items-center gap-2">
          {g > 0 && <span className="text-muted-foreground">–</span>}
          <div className="flex">
            {group.split("").map((char, i) => (
              <span
                key={i}
                className="flex h-12 w-10 items-center justify-center border-y border-r border-input font-mono text-xl first:rounded-l-md first:border-l last:rounded-r-md dark:bg-input/30"
              >
                {char}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
