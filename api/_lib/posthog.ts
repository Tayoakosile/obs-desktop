import { PostHog } from 'posthog-node'

// Singleton client for use across serverless functions.
// flushAt=1 and flushInterval=0 ensure events are sent before the
// function exits; always call shutdown() at the end of each request.
let _client: PostHog | null = null

export function getPostHogClient(): PostHog {
  if (!_client) {
    _client = new PostHog(process.env.POSTHOG_KEY ?? '', {
      host: process.env.POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return _client
}
