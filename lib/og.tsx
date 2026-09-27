// Shared pieces of the Open Graph images (app/**/opengraph-image.tsx).
//
// These render through `next/og`, which lays out a subset of CSS: flexbox only,
// every element with more than one child needs `display: flex`, and colours
// must be ones it can parse — hence hex here rather than the app's oklch tokens.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import type { ImageResponse } from "next/og";
import { env } from "@/app/env";

type ImageResponseOptions = NonNullable<
  ConstructorParameters<typeof ImageResponse>[1]
>;

export const OG_SIZE = { width: 1200, height: 630 };

// The app's dark theme (app/globals.css), converted from oklch.
export const OG_COLOURS = {
  background: "#0a0a0a", // --background
  card: "#171717", // --card
  border: "#262626", // --muted, used as a solid border
  foreground: "#fafafa", // --foreground
  muted: "#a1a1a1", // --muted-foreground
  accent: "#ffb900", // --warning, the theme's one chromatic colour
};

// Read once per server instance: none of this depends on the request. The
// fonts are TTF because `next/og` can't read next/font's woff2 files. Each path
// is spelled out in full so the build traces just these files into the
// server bundle, not the whole project.
const [geistRegular, geistSemiBold, geistMonoSemiBold, logoSvg] =
  await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Geist-Regular.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Geist-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/GeistMono-SemiBold.ttf")),
    readFile(join(process.cwd(), "public/logo.svg"), "utf8"),
  ]);

export const OG_FONTS: ImageResponseOptions["fonts"] = [
  { name: "Geist", data: geistRegular, weight: 400, style: "normal" },
  { name: "Geist", data: geistSemiBold, weight: 600, style: "normal" },
  { name: "Geist Mono", data: geistMonoSemiBold, weight: 600, style: "normal" },
];

// public/logo.svg strokes in `currentColor`, which means nothing inside an
// <img>, so it's pinned to the foreground before being inlined.
const logoSrc = `data:image/svg+xml;base64,${Buffer.from(
  logoSvg.replaceAll("currentColor", OG_COLOURS.foreground),
).toString("base64")}`;

/** The site's host, e.g. "id-game.com", for the footer of every image. */
export const SITE_HOST = new URL(env.NEXT_PUBLIC_SITE_URL).host;

/** Logo and wordmark, as they sit at the top of every image. */
function Masthead({ badge }: { badge?: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders <img>, not next/image */}
        <img src={logoSrc} width={88} height={88} alt="" />
        <span
          style={{
            fontFamily: "Geist Mono",
            fontWeight: 600,
            fontSize: 40,
            letterSpacing: -1,
          }}
        >
          The ID Game
        </span>
      </div>
      {badge}
    </div>
  );
}

/** A rounded label for the top-right corner, amber when it's good news. */
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "accent" | "muted";
}) {
  const colour = tone === "accent" ? OG_COLOURS.accent : OG_COLOURS.muted;
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 24px",
        borderRadius: 999,
        border: `2px solid ${colour}`,
        color: colour,
        fontSize: 28,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The canvas every image is drawn on: masthead at the top, `children` filling
 * the middle, and a footer line at the bottom.
 */
export function OgFrame({
  badge,
  footer,
  children,
}: {
  badge?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: OG_COLOURS.background,
        color: OG_COLOURS.foreground,
        fontFamily: "Geist",
      }}
    >
      <Masthead badge={badge} />
      {children}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          color: OG_COLOURS.muted,
          fontSize: 28,
        }}
      >
        {footer}
      </div>
    </div>
  );
}

const STEPS = ["Select", "Rank", "Guess"];

/**
 * The site's own card: tagline and the three steps of a round. The landing
 * page's image, and what an invite falls back to when its game is gone.
 */
export function BrandImage() {
  return (
    <OgFrame footer={`Play free at ${SITE_HOST}`}>
      <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
        <div
          style={{
            display: "flex",
            fontSize: 60,
            fontWeight: 600,
            lineHeight: 1.1,
            letterSpacing: -2,
          }}
        >
          Call out friends, guess the answers, and survive the chaos.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {STEPS.map((step, i) => (
            <div
              key={step}
              style={{ display: "flex", alignItems: "center", gap: 20 }}
            >
              {i > 0 && (
                <span style={{ color: OG_COLOURS.muted, fontSize: 36 }}>→</span>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 28px",
                  borderRadius: 20,
                  background: OG_COLOURS.card,
                  border: `2px solid ${OG_COLOURS.border}`,
                  fontSize: 36,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{ fontFamily: "Geist Mono", color: OG_COLOURS.accent }}
                >
                  {i + 1}
                </span>
                {step}
              </div>
            </div>
          ))}
        </div>
      </div>
    </OgFrame>
  );
}
