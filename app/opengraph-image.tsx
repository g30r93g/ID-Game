import { ImageResponse } from "next/og";
import { BrandImage, OG_FONTS } from "@/lib/og";
import { BRAND_ALT } from "@/lib/metadata";

// The default share image for every page that doesn't draw its own.
export const alt = BRAND_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<BrandImage />, { ...size, fonts: OG_FONTS });
}
