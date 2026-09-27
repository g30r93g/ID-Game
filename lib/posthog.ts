import { PostHog } from "posthog-node";
import { cookies } from "next/headers";
import { after } from "next/server";
import { env } from "@/app/env";
import { CONSENT_COOKIE, hasAnalyticsConsent } from "@/lib/consent";

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

/**
 * Sends one event from a server component once the response has gone out,
 * if the visitor has agreed to analytics in the cookie banner. Without that
 * yes nothing is sent, as in the browser (see lib/analytics.ts).
 *
 * The consent cookie is read here, before the response, since `cookies()`
 * can't be called inside `after` in a server component. That makes the
 * calling page dynamic, so use it only from pages that already are.
 *
 * `after` keeps the invocation alive until the flush finishes, so the event
 * isn't lost to a frozen function. A failure is logged, never thrown.
 */
export async function captureAfterResponse(
  message: Parameters<PostHog["capture"]>[0],
) {
  const consent = (await cookies()).get(CONSENT_COOKIE)?.value;
  if (!hasAnalyticsConsent(consent)) return;

  after(async () => {
    const posthog = PostHogClient();
    posthog.capture(message);
    await posthog.shutdown().catch((error) => {
      console.error(`Could not record ${message.event} in PostHog`, error);
    });
  });
}
