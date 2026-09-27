// lib/assessmentSubmitGuard.ts
// ─────────────────────────────────────────────────────────────────────────────
// The abuse guard for /api/assessment/submit, as PURE DECISIONS so they can be tested.
//
// ⚠️ WHY THIS EXISTS. That route sent TWO Resend emails per call — one to whatever address the
// caller supplied, one to the monitor inbox — with no session, no rate limit and no bot check. It is
// the only unauthenticated email sender in the app. Anyone could have used it to mail arbitrary
// recipients from the ThemisIQ domain, at any rate, which is a deliverability and reputation problem
// before it is a cost one: a domain that sends unsolicited mail gets its sending reputation burned
// and then the real transactional mail stops arriving.
//
// ⚠️ THE ROUTE HANDLER IS NOT DIRECTLY TESTABLE IN THIS REPO — no jsdom, no request harness, and it
// imports a module that builds a Resend client at module scope. So the shape lib/useEntitlement.ts
// already uses is followed here: the part that DECIDES lives in its own module with no imports, and
// the route is a thin composition over it. Every rule below is checked by a test rather than
// described in a comment nobody runs.

/**
 * ⚠️ A GENUINE VISITOR NEVER REACHES EITHER LIMIT, AND THAT IS THE CALIBRATION. /assess is a
 * three-question form that produces one obligation map; a person runs it once, or twice if they
 * mistyped their address. For comparison, the two routes that already limit:
 *   ghg-bot            120 per IP and 30 per user, per 10 minutes  (a chat box, many calls per visit)
 *   order-quote-request  8 per IP and  3 per email, per hour       (a form, like this one)
 *
 * TWO WINDOWS, AND THEY NEED TWO CALLS. checkAndRecordRateLimit takes ONE windowMs for both axes, so
 * an hourly IP limit and a daily per-recipient limit cannot be expressed in a single call. Hence two
 * buckets. Passing `email: null` on the first and `ip: null` on the second is what makes each call
 * evaluate one axis: the function skips an axis whose value is null.
 */
export const ASSESSMENT_IP_BUCKET = 'assessment-submit-ip'
export const ASSESSMENT_IP_LIMIT = 5
export const ASSESSMENT_IP_WINDOW_MS = 60 * 60 * 1000              // 1 hour

export const ASSESSMENT_EMAIL_BUCKET = 'assessment-submit-email'
export const ASSESSMENT_EMAIL_LIMIT = 3
export const ASSESSMENT_EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000      // 1 day

/**
 * The honeypot field's name, shared by the form and the route so the two cannot drift.
 *
 * ⚠️ 'website' IS CHOSEN TO BE FILLED, NOT TO BE IGNORED. A bot that autofills a form looks for
 * plausible names, and a URL field is among the first it completes; a human never sees this one. The
 * name must stay boring for that reason — renaming it to `honeypot` or `do_not_fill` would tell a
 * bot exactly which field to leave alone.
 */
export const ASSESSMENT_HONEYPOT_FIELD = 'website'

/**
 * TRUE ⇒ drop the submission. Trimmed, so a field a browser filled with whitespace is not treated as
 * a bot: an empty string, whitespace, undefined and null are all "a human left it alone".
 *
 * Takes `unknown` because it reads a parsed request body. A non-string value (a number, an object, an
 * array) is treated as TRIPPED: nothing legitimate puts one there, and the field is not rendered as
 * anything a person could type into.
 */
export function isHoneypotTripped(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value !== 'string') return true
  return value.trim().length > 0
}

/**
 * The key the per-recipient limit counts on.
 *
 * ⚠️ LOWERCASED AND TRIMMED, OR THE LIMIT IS TRIVIAL TO SIDESTEP. 'Foo@x.com', 'foo@x.com' and
 * ' foo@x.com ' are one mailbox and would otherwise be three buckets, so three sends become nine.
 * This does NOT canonicalise further — no dot-stripping, no plus-address folding — because those are
 * provider-specific and folding them would merge addresses that really are different at some hosts.
 */
export function recipientKey(email: string): string {
  return email.trim().toLowerCase()
}
