import { ImageResponse } from "next/og";
import { getInvite, inviteTitle, roundsLabel, type Invite } from "@/lib/invite";
import { normaliseJoinCode } from "@/lib/join-code";
import { BRAND_ALT } from "@/lib/metadata";
import {
  Badge,
  BrandImage,
  OG_COLOURS,
  OG_FONTS,
  OG_SIZE,
  OgFrame,
  SITE_HOST,
} from "@/lib/og";

// One image per invite, rendered on request since it reads the game. Chat apps
// keep whatever they first fetched, so it only needs to be right at the moment
// a link is shared — in practice, from the lobby.
export const dynamic = "force-dynamic";

// Through generateImageMetadata rather than a static `alt`, so the alt text
// can spell out the code for screen readers. It is built from the URL alone:
// React `cache` doesn't carry over from here to the image below, so reading
// the invite here cost a second Convex query on every crawler hit, just to
// put the host's name in the alt.
export function generateImageMetadata({
  params,
}: {
  params: { code: string };
}) {
  const code = normaliseJoinCode(params.code);
  return [
    {
      id: "invite",
      size: OG_SIZE,
      contentType: "image/png",
      alt: code ? inviteAlt(code) : BRAND_ALT,
    },
  ];
}

function inviteAlt(joinCode: string) {
  // Spaced out so screen readers spell the code rather than read it as a word.
  const code = joinCode.split("").join(" ");
  return `An invite to The ID Game. Join code ${code}.`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const code = normaliseJoinCode((await params).code);
  const invite = code ? await getInvite(code) : null;

  const body =
    invite && invite.status !== "ended" ? (
      <InviteImage invite={invite} />
    ) : (
      <BrandImage />
    );

  return new ImageResponse(body, {
    ...OG_SIZE,
    fonts: OG_FONTS,
    // `next/og` would otherwise mark this immutable for a year. The game
    // behind it changes, so let caches check back.
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}

function InviteImage({ invite }: { invite: Invite }) {
  const open = invite.status === "open";
  const headline = inviteTitle(invite);

  return (
    <OgFrame
      badge={
        open ? (
          <Badge tone="accent">You’re invited</Badge>
        ) : (
          <Badge tone="muted">In progress</Badge>
        )
      }
      footer={
        open
          ? `${roundsLabel(invite.totalRounds)} · Tap to join, or enter the code at ${SITE_HOST}`
          : `Already playing? Jump back in at ${SITE_HOST}`
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <div
          style={{
            display: "flex",
            // Display names run to 32 characters; the long ones wrap onto a
            // second line at a smaller size rather than a third.
            fontSize: headline.length > 26 ? 56 : 72,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: -2,
          }}
        >
          {headline}
        </div>
        <JoinCode code={invite.joinCode} />
      </div>
    </OgFrame>
  );
}

/** The code in two groups of three slots, as the lobby shows it. */
function JoinCode({ code }: { code: string }) {
  const groups = [code.slice(0, 3), code.slice(3)];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {groups.map((group, g) => (
        <div key={g} style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {g > 0 && (
            <div
              style={{
                width: 32,
                height: 6,
                borderRadius: 3,
                background: OG_COLOURS.muted,
              }}
            />
          )}
          <div
            style={{
              display: "flex",
              borderRadius: 20,
              border: `2px solid ${OG_COLOURS.border}`,
              background: OG_COLOURS.card,
            }}
          >
            {group.split("").map((char, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 96,
                  height: 116,
                  // A divider between slots. Spread in, not set to undefined:
                  // next/og's style parser trips over undefined values.
                  ...(i > 0 && {
                    borderLeft: `2px solid ${OG_COLOURS.border}`,
                  }),
                  fontFamily: "Geist Mono",
                  fontWeight: 600,
                  fontSize: 68,
                }}
              >
                {char}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
