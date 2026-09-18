import { PostHog } from "posthog-node";
import { env } from "@/app/env";

// NEXT_PUBLIC_POSTHOG_API_HOST is a relative path ("/ingest") proxied by the
// rewrites in next.config.ts, which a server-side client cannot post to, and
// NEXT_PUBLIC_POSTHOG_UI_HOST is the dashboard rather than the ingestion
// endpoint. So the server talks to the same EU ingestion host those rewrites
// point at.
const INGESTION_HOST = "https://eu.i.posthog.com";

/**
 * A short-lived PostHog client for server components. Every event is flushed
 * as it is captured, because a serverless invocation can be frozen the moment
 * the response is sent — call `shutdown()` before returning to be sure the
 * request went out.
 */
export default function PostHogClient() {
  const posthogClient = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: INGESTION_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
  return posthogClient;
}
