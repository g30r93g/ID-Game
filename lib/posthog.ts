// app/posthog.js
import { PostHog } from 'posthog-node'
import { env } from "@/app/env";

export default function PostHogClient() {
  const posthogClient = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
    host: env.NEXT_PUBLIC_POSTHOG_UI_HOST,
    flushAt: 1,
    flushInterval: 0
  })
  return posthogClient
}