// lib/serviceUnavailable.ts
//
// CLIENT-SAFE (ENF-RL1, Oct 2026). The sentence the two routes that email a typed address answer with, as a 503, when
// their rate limiter cannot run (lib/rateLimit.ts failClosed), and how /assess and /order read that answer. Kept out
// of lib/rateLimit.ts, which imports the service-role client and must never reach a browser bundle.

export const SERVICE_UNAVAILABLE_MESSAGE = 'Something went wrong on our side. Please try again in a moment, or email hello@themisiq.co.'

/**
 * /assess after "Show my map". A 503 keeps the visitor on the form with the sentence. Every other answer, including
 * the silent success the route gives when a limit is reached, and a request that never got an answer (null), shows
 * the results exactly as before.
 */
export function assessSubmitOutcome(status: number | null): 'show_results' | 'unavailable' {
  return status === 503 ? 'unavailable' : 'show_results'
}

/** /order's quote request: done, the 503 sentence, or the existing generic error for anything else (429 included). */
export function quoteSubmitOutcome(status: number | null): 'done' | 'unavailable' | 'error' {
  if (status !== null && status >= 200 && status < 300) return 'done'
  return status === 503 ? 'unavailable' : 'error'
}
