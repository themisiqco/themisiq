import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { entitlementTerm, termLengthDays, ENTITLEMENT_TERM_DAYS } from './entitlementTerm'

// `entitlements.term_start` / `term_end` are NOT NULL, so a provisioning path that omits either
// does not degrade — it 500s and the paid customer gets nothing. Two things are tested here:
//
//   1. THE DERIVATION, for real. entitlementTerm is pure and takes `now`, so every rule below is
//      exercised against pinned clocks rather than described in a comment.
//   2. THE WRITER CONTRACT, textually — that the one writer still emits both columns, and that
//      both Stripe events still route to it. Textual because grantFromMetadata is module-private
//      and calls Stripe + the Supabase admin client, exactly as lib/entitlementMetadata.test.ts
//      documents for the sibling `ghg_location_allowance` defect. Weaker than invoking the code;
//      it catches the defect class that matters, a column going missing from the writer.

const T0 = new Date('2026-08-11T12:00:00.000Z')
const DAY_MS = 86_400_000
const at = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS)

describe('entitlementTerm — the derivation', () => {
  it('a first purchase runs from now for the full term', () => {
    const t = entitlementTerm(T0)
    expect(t.term_start).toBe(T0.toISOString())
    expect(t.term_end).toBe(at(T0, ENTITLEMENT_TERM_DAYS).toISOString())
    expect(termLengthDays(t)).toBe(365)
  })

  it('both columns are present and are ISO strings, never undefined', () => {
    const t = entitlementTerm(T0)
    // The NOT NULL constraint is the thing being guarded; an absent key fails it identically to null.
    expect(Object.keys(t).sort()).toEqual(['term_end', 'term_start'])
    for (const v of Object.values(t)) {
      expect(typeof v).toBe('string')
      expect(Number.isNaN(new Date(v).getTime())).toBe(false)
    }
  })

  it('a repurchase keeps the ORIGINAL start — a licence begins once', () => {
    const prior = { term_start: at(T0, -100).toISOString(), term_end: at(T0, 265).toISOString() }
    const t = entitlementTerm(T0, prior)
    expect(t.term_start).toBe(prior.term_start)
    expect(t.term_start).not.toBe(T0.toISOString())
  })

  it('a repurchase mid-term does NOT add the remainder — documented limit, pinned', () => {
    // 100 days in, 265 remaining. Extension would give 265 + 365 = 630. It gives 365.
    const prior = { term_start: at(T0, -100).toISOString(), term_end: at(T0, 265).toISOString() }
    const t = entitlementTerm(T0, prior)
    expect(t.term_end).toBe(at(T0, 365).toISOString())
    expect(t.term_end).not.toBe(at(T0, 630).toISOString())
  })

  it('NEVER SHORTENS: a prior end beyond a fresh term survives untouched', () => {
    const prior = { term_start: at(T0, -10).toISOString(), term_end: at(T0, 500).toISOString() }
    const t = entitlementTerm(T0, prior)
    expect(t.term_end).toBe(prior.term_end)
    // The regression this rule exists for: a blind overwrite would have cut 135 days off.
    expect(new Date(t.term_end).getTime()).toBeGreaterThan(at(T0, 365).getTime())
  })

  it('an expired prior term restarts from now rather than resurrecting an old window', () => {
    const prior = { term_start: at(T0, -800).toISOString(), term_end: at(T0, -435).toISOString() }
    const t = entitlementTerm(T0, prior)
    expect(t.term_end).toBe(at(T0, 365).toISOString())
    expect(new Date(t.term_end).getTime()).toBeGreaterThan(T0.getTime())
  })

  it('a prior start in the FUTURE does not win — now is the earlier of the two', () => {
    const prior = { term_start: at(T0, 5).toISOString(), term_end: at(T0, 370).toISOString() }
    expect(entitlementTerm(T0, prior).term_start).toBe(T0.toISOString())
  })

  it('null, undefined and unparseable priors all fall back to a fresh term, never to NaN', () => {
    const fresh = entitlementTerm(T0)
    for (const prior of [
      undefined, null,
      {}, { term_start: null, term_end: null },
      { term_start: 'not-a-date', term_end: 'not-a-date' },
    ]) {
      expect(entitlementTerm(T0, prior)).toEqual(fresh)
    }
  })

  // IDEMPOTENCY. Stripe delivers at least once; the max() shape is what makes redelivery safe.
  it('redelivery does not compound — a second run adds no second year', () => {
    const first = entitlementTerm(T0)
    const redelivered = entitlementTerm(at(T0, 0.01), first)   // ~15 minutes later
    expect(termLengthDays(redelivered)).toBeCloseTo(365, 1)
    expect(termLengthDays(redelivered)).not.toBeCloseTo(730, 1)
    expect(redelivered.term_start).toBe(first.term_start)      // start pinned by the prior row
  })
})

describe('card and invoice cannot disagree about the term', () => {
  const ROOT = process.cwd()
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
  // CODE ONLY. These files carry long comments explaining the term rules, and those comments name
  // the very strings asserted below — "no second +365" was failing on a comment SAYING there must
  // not be a second +365. Stripping first makes each assertion mean what it says.
  const code = (rel: string) => read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const WEBHOOK_CODE = code('app/api/webhooks/stripe/route.ts')
  const PROVISION_CODE = code('lib/order/provision.ts')

  it('both produce an identical term for identical inputs — same function, same clock', () => {
    // Not two code paths in this test because there are not two in the product: both Stripe events
    // call grantFromMetadata, asserted structurally below. This pins the property that matters —
    // the term depends on the clock and the prior row, and on nothing about HOW the customer paid.
    const card = entitlementTerm(T0)
    const invoice = entitlementTerm(T0)
    expect(card).toEqual(invoice)
    expect(termLengthDays(card)).toBe(termLengthDays(invoice))
  })

  it('the single writer emits BOTH columns', () => {
    expect(WEBHOOK_CODE).toContain('entitlementTerm(now, priorByKey.get(module_key))')
    expect(WEBHOOK_CODE).toContain("from '../../../../lib/entitlementTerm'")
  })

  it('both Stripe events still route to the one writer', () => {
    expect(WEBHOOK_CODE).toContain("case 'checkout.session.completed'")
    expect(WEBHOOK_CODE).toContain("case 'invoice.paid'")
    expect(WEBHOOK_CODE).toContain("grantFromMetadata(session.metadata, 'stripe:checkout'")
    expect(WEBHOOK_CODE).toContain("grantFromMetadata(invoice.metadata, 'stripe:invoice')")
  })

  it('the writer reads prior terms before writing — the never-shorten rule needs them', () => {
    expect(WEBHOOK_CODE).toContain("select('module_key, term_start, term_end')")
  })

  it('NO SECOND +365 EXISTS. One definition, or the two paths will drift', () => {
    // The drift shape this codebase keeps hitting: a second, independent term calculation that
    // agrees on the day it is written and silently stops agreeing later.
    for (const [name, src] of [['webhook', WEBHOOK_CODE], ['provision', PROVISION_CODE]] as const) {
      expect(`${name}: ${src.includes('365')}`).toBe(`${name}: false`)
    }
    // …and it does live in exactly one place.
    expect(code('lib/entitlementTerm.ts')).toContain('ENTITLEMENT_TERM_DAYS = 365')
  })

  it('the invoice pricing module still writes no term of its own', () => {
    expect(PROVISION_CODE).not.toContain('term_start')
    expect(PROVISION_CODE.includes("from('entitlements')")).toBe(false)
  })
})
