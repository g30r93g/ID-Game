import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { PostHogProvider } from "@/providers/Posthog";
import { env } from "@/app/env";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/metadata";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Resolves the relative URLs below and those of the generated share images.
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  // No `url`: a page that doesn't set its own Open Graph tags would otherwise
  // claim to be the home page.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_GB",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  // X reads the Open Graph tags for everything else; this asks it for the
  // large image rather than a thumbnail.
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-title" content="ID Game" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <main className={"container mx-auto px-4 md:px-0"}>
            {env.NODE_ENV !== "production" ? (
              children
            ) : (
              <PostHogProvider>{children}</PostHogProvider>
            )}
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
