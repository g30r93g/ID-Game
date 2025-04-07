import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {ThemeProvider} from "next-themes";
import {Toaster} from "@/components/ui/sonner";
import {PostHogProvider} from "@/providers/Posthog";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "The ID Game",
  description: "A fun game to play on a night out!",
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
        >
          <main className={"container mx-auto px-4 md:px-0"}>
            <PostHogProvider>
              {children}
            </PostHogProvider>
          </main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
