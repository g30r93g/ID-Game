import type { Metadata } from "next";

export const SITE_NAME = "The ID Game";

export const SITE_DESCRIPTION =
  "Call out friends, guess the answers, and survive the chaos — a party game for a night out.";

/** Alt text for the brand image, app/opengraph-image.tsx. */
export const BRAND_ALT =
  "The ID Game — call out friends, guess the answers, and survive the chaos. Select, rank, guess.";

// The brand image by URL. A page that sets its own `openGraph` stops inheriting
// app/opengraph-image.tsx, so it has to be named again.
const BRAND_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: BRAND_ALT,
};

/**
 * Open Graph tags for one page. Next.js replaces a parent's `openGraph` object
 * wholesale rather than merging it, so every page that sets its own goes
 * through here to keep the site-wide tags and the brand image.
 *
 * A page with an opengraph-image file of its own passes `brandImage: false`:
 * an image named here would win over the file.
 */
export function pageOpenGraph({
  path,
  title,
  description = SITE_DESCRIPTION,
  brandImage = true,
}: {
  path: string;
  title: string;
  description?: string;
  brandImage?: boolean;
}): Metadata["openGraph"] {
  return {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_GB",
    url: path,
    title,
    description,
    ...(brandImage && { images: [BRAND_IMAGE] }),
  };
}
