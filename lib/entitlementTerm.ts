// lib/entitlementTerm.ts
// ─────────────────────────────────────────────────────────────────────────────
// THE licence term. `entitlements.term_start` / `term_end` are NOT NULL, so every
// provisioning path must supply both, and every path must supply the SAME ones: a customer
// must not receive a different term because they paid by card rather than by invoice.
//
// Pure and framework-free on purpose — no Supabase, no Stripe, no Date.now() reached for
// internally. `now` is passed in, so a test can pin it and two paths can be shown to agree.
//
// Terms §4 is the contract this implements, verbatim: "The license term begins when access is
// first provisioned and continues for twelve (12) months."
// ─────────────────────────────────────────────────────────────────────────────

// Twelve months as a FIXED 365 days, not a calendar month arithmetic. Calendar addition has to
// answer what 29 Feb + 12 months means and every language answers it differently; a fixed day
// count has one answer, is what the customer can check with a calculator, and cannot drift
// between two call sites. The cost is that a leap year is one day short, which is a day the
// customer keeps rather than loses (the term is granted, not billed against).
export const ENTITLEMENT_TERM_DAYS = 365

const DAY_MS = 86_400_000

export type EntitlementTerm = { term_start: string; term_end: string }

export type PriorTerm = { term_start?: string | null; term_end?: string | null } | null | undefined

const parse = (iso: string | null | undefined): Date | null => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

// Both columns for one entitlement row, given the row's prior term where one exists.
//
// TWO RULES, AND NEITHER IS "OVERWRITE":
//   term_start — the EARLIER of the prior start and now. A licence begins once; a repurchase
//                does not restart it, and Terms §4 says so in as many words.
//   term_end   — the LATER of the prior end and now + 365 days. NEVER SHORTENS. A customer who
//                already holds a term further out than a fresh one keeps it.
//
// ⚠️ THIS IS "NEVER SHORTEN", NOT "EXTEND". A repurchase 100 days into a term yields
// now + 365, not now + 465 — the 100 remaining days are absorbed, not added. That is a
// deliberate limit, not an oversight: additive extension cannot be made safe against Stripe's
// at-least-once delivery without per-event idempotency, which this table does not have. A
// redelivered `checkout.session.completed` would add a second year to a single payment. See the
// note in app/api/webhooks/stripe/route.ts above the grant, and the README of this decision in
// the commit message. Max() is idempotent under redelivery; addition is not.
export function entitlementTerm(now: Date, prior?: PriorTerm): EntitlementTerm {
  const fresh = new Date(now.getTime() + ENTITLEMENT_TERM_DAYS * DAY_MS)
  const priorStart = parse(prior?.term_start)
  const priorEnd = parse(prior?.term_end)

  const start = priorStart && priorStart.getTime() < now.getTime() ? priorStart : now
  const end = priorEnd && priorEnd.getTime() > fresh.getTime() ? priorEnd : fresh

  return { term_start: start.toISOString(), term_end: end.toISOString() }
}

// Term length in whole days, for assertions and for anything that needs to state the figure.
// Derived from the two timestamps rather than from the constant, so a test that calls it is
// checking the produced row and not restating ENTITLEMENT_TERM_DAYS back to itself.
export function termLengthDays(term: EntitlementTerm): number {
  return (new Date(term.term_end).getTime() - new Date(term.term_start).getTime()) / DAY_MS
}
