import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(fileURLToPath(import.meta.url));

jiti("./app/env");

const nextConfig: NextConfig = {
  /* config options here */
  async redirects() {
    return [
      {
        // Sign-up and sign-in are one page; deep-link to its sign-up tab.
        // A config redirect answers from the edge, where a page would cost
        // a server render just to send a 307. Next carries any
        // incoming query (e.g. ?next=) over to the destination. Not
        // permanent, in case sign-up becomes its own page again.
        source: "/sign-up",
        destination: "/sign-in?tab=sign-up",
        permanent: false,
      },
      {
        // /sign-in used to be an optional catch-all (a Clerk leftover), so
        // any subpath rendered the sign-in page. Keep old links working.
        source: "/sign-in/:path+",
        destination: "/sign-in",
        permanent: false,
      },
    ];
  },
  // Required for PostHog, whose endpoints end in a slash. The `/ingest` proxy
  // itself is in proxy.ts, which strips our cookies before forwarding.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
