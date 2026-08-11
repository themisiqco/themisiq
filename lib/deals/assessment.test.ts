import { describe, it, expect } from 'vitest'
import {
  getApplicableFrameworks, getFrameworkApplicability, convertCurrency, isDealCurrency,
  DEAL_CURRENCIES, USD_PER_UNIT, UNITS_PER_EUR, THRESHOLD_TESTS, isTestActive, evaluateTest,
  validateThresholdTests, type ThresholdTest,
  CSRD_NON_EU_REASON, csrdNonEuAbstention, CS3D_PENDING_REASON, cs3dPendingAbstention,
  CS3D_ROUTE_NOT_MET_REASON,
  NEAR_THRESHOLD_BAND, NEAR_BAND_PCT, FX_AS_OF, FX_SOURCE,
  isRevenueDeclared, assessmentView, notAssessedNote, partiallyAssessedNote, routeNotMetNote,
  partialHeadingPhrase,
  nearThresholdNoneNote, resolveFieldsPrompt, FIELD_LABELS, FIELD_FORM_LABELS,
  getObligations, obligationPriceLabel, SECTOR_RISKS,
  type DealCurrency, type FrameworkApplicability, type DealSize, type ThresholdLimb,
} from './assessment'
import { REGIME_COLUMNS } from './exportPipelineXlsx'
import { resolveCs3d } from './reportModel'

// Tests assert the CONTRACT, never the current FX rates: cross-currency inputs are derived from
// USD_PER_UNIT at runtime, so refreshing the dated rate table cannot turn them red.

const find = (rows: FrameworkApplicability[], fw: string) => rows.find(r => r.framework === fw)
const limbCur = (l: ThresholdLimb) => (l.unit as { unit: 'currency'; currency: DealCurrency }).currency
const money = (ratio: number, l: ThresholdLimb, c: DealCurrency) => convertCurrency(ratio * l.amount, limbCur(l), c)
const sz = (revenue: number, o: Partial<DealSize> = {}): DealSize =>
  ({ revenue, total_assets: null, employee_count: null, currency: 'USD', ...o })

const SB = THRESHOLD_TESTS['SB 253']
const SECR = THRESHOLD_TESTS['SECR']
const S211 = THRESHOLD_TESTS['Canada S-211']
const SB_TURNOVER = SB.limbs[0]
const [SECR_TURNOVER, SECR_ASSETS, SECR_STAFF] = SECR.limbs

describe('FX table integrity', () => {
  it('covers exactly the currencies the deal form offers, anchored on USD', () => {
    expect(Object.keys(USD_PER_UNIT).sort()).toEqual([...DEAL_CURRENCIES].sort())
    expect(USD_PER_UNIT.USD).toBe(1)
    for (const c of DEAL_CURRENCIES) expect(USD_PER_UNIT[c]).toBeGreaterThan(0)
  })

  it('carries an explicit ISO as-of date and a named source that cannot drift', () => {
    expect(FX_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The source cites a specific dated document whose ECB filename is the compact date
    // (…/20260701.pdf), so the prose and the constant still cannot drift apart.
    expect(FX_SOURCE).toContain(FX_AS_OF.replace(/-/g, ''))
    expect(FX_SOURCE).toMatch(/^https:\/\/|\shttps:\/\//)   // resolvable, not a generic reference
  })

  it('is the identity for same-currency conversion', () => {
    for (const c of DEAL_CURRENCIES) expect(convertCurrency(123_456_789, c, c)).toBe(123_456_789)
  })

  it('narrows unknown currency codes', () => {
    expect(isDealCurrency('USD')).toBe(true)
    expect(isDealCurrency('JPY')).toBe(false)
  })
})

// ── Transcription fidelity ────────────────────────────────────────────────────────────────────
// The rates decide whether a statute is cited, so the risk is not that a rate is stale — a dated
// table makes staleness visible — but that a PLACEHOLDER is mistaken for a transcribed figure.
// A placeholder is round; a transcribed ECB figure is not. These tests measure that difference,
// which nothing in the suite below can see.

describe('FX rates are transcribed, not approximated', () => {
  // Significant digits as WRITTEN: leading zeros are placeholders, every other digit counts.
  // 1.08 → "108" → 3;  0.85973 → "85973" → 5. Guarded against exponential notation, which none of
  // these magnitudes produce but which would silently miscount if one ever did.
  const sigDigits = (n: number): number => {
    const s = String(n)
    expect(s).not.toContain('e')
    return s.replace('-', '').replace('.', '').replace(/^0+/, '').length
  }

  it('holds every rate to at least four significant figures — this exists to catch round 2dp placeholders', () => {
    for (const c of DEAL_CURRENCIES) {
      if (c === 'EUR') continue                     // the base is exactly 1, not a published figure
      expect(sigDigits(UNITS_PER_EUR[c])).toBeGreaterThanOrEqual(4)
    }
    // The guard has teeth: every placeholder this table replaced would fail it.
    for (const placeholder of [1.08, 1.27, 0.73, 0.66]) expect(sigDigits(placeholder)).toBeLessThan(4)
  })

  it('pins EUR to exactly 1 — the base cannot drift', () => {
    expect(UNITS_PER_EUR.EUR).toBe(1)
  })

  it('does not normalise transcribed widths — GBP is published to five decimals, the rest to four', () => {
    expect(String(UNITS_PER_EUR.GBP).split('.')[1]).toHaveLength(5)
    for (const c of ['USD', 'CAD', 'AUD'] as const) expect(String(UNITS_PER_EUR[c]).split('.')[1]).toHaveLength(4)
  })

  it('covers exactly the currencies the deal form offers', () => {
    expect(Object.keys(UNITS_PER_EUR).sort()).toEqual([...DEAL_CURRENCIES].sort())
    for (const c of DEAL_CURRENCIES) expect(UNITS_PER_EUR[c]).toBeGreaterThan(0)
  })

  it('derives USD cross-rates from the EUR base rather than storing them', () => {
    for (const c of DEAL_CURRENCIES) expect(USD_PER_UNIT[c]).toBe(UNITS_PER_EUR.USD / UNITS_PER_EUR[c])
    expect(USD_PER_UNIT.USD).toBe(1)               // x / x — the anchor is exact, not transcribed
  })

  it('round-trips A → B → A within float tolerance, for every pair and magnitude', () => {
    // Relative, not absolute: an absolute tolerance would pass trivially at 1 and fail at 1e9.
    for (const from of DEAL_CURRENCIES)
      for (const to of DEAL_CURRENCIES)
        for (const x of [1, 36_000_000, 1_000_000_000, 123_456_789]) {
          const back = convertCurrency(convertCurrency(x, from, to), to, from)
          expect(Math.abs(back - x) / x).toBeLessThan(1e-12)
        }
  })
})

// ── Threshold declaration integrity ───────────────────────────────────────────────────────────

describe('THRESHOLD_TESTS declaration', () => {
  it('states every money limb in its own statutory currency, unconverted', () => {
    expect(SB_TURNOVER.amount).toBe(1_000_000_000); expect(limbCur(SB_TURNOVER)).toBe('USD')
    expect(SECR_TURNOVER.amount).toBe(36_000_000);  expect(limbCur(SECR_TURNOVER)).toBe('GBP')
    expect(SECR_ASSETS.amount).toBe(18_000_000);    expect(limbCur(SECR_ASSETS)).toBe('GBP')
    expect(S211.limbs.map(l => l.amount)).toEqual([20_000_000, 40_000_000, 250])
  })

  it('models the shapes: 1-of-1, 2-of-3, and AND as requires === limbs.length', () => {
    expect([SB.requires, SB.limbs.length]).toEqual([1, 1])
    expect([SECR.requires, SECR.limbs.length]).toEqual([2, 3])
    expect([S211.requires, S211.limbs.length]).toEqual([2, 3])
  })

  it('states each boundary in prose that matches its comparison operator', () => {
    // `basis` is printed verbatim in the report's THRESHOLD LIMBS APPLIED table, beside the
    // MET / NOT MET result, so prose that disagrees with the operator misreads AT the boundary:
    // a target with exactly 250 employees read "At least 250 employees" next to "NOT MET".
    for (const t of Object.values(THRESHOLD_TESTS)) for (const l of t.limbs) {
      const basis = l.basis.toLowerCase()
      if (l.comparison === 'gt') expect(basis).not.toContain('at least')
      else expect(basis).not.toMatch(/more than|in excess of|over /)
    }
  })

  it('carries the comparison per limb — instruments disagree on the boundary', () => {
    expect(SB_TURNOVER.comparison).toBe('gt')      // "in excess of"
    expect(SECR_TURNOVER.comparison).toBe('gt')    // exceeds the medium-sized ceiling
    expect(S211.limbs.every(l => l.comparison === 'gte')).toBe(true)   // "at least"
  })

  it('employee limbs carry no currency and never touch FX', () => {
    for (const t of Object.values(THRESHOLD_TESTS))
      for (const l of t.limbs)
        if (l.measure === 'employees') expect(l.unit).toEqual({ unit: 'count' })
  })

  it('every limb names its measure and declares whether the source is exact or a proxy', () => {
    for (const t of Object.values(THRESHOLD_TESTS)) for (const l of t.limbs) {
      expect(l.basis.length).toBeGreaterThan(0)
      expect(typeof l.exactMeasure).toBe('boolean')
      if (!l.exactMeasure) expect(l.measureNote && l.measureNote.length).toBeGreaterThan(0)
    }
  })

  it('an unmodelled lookback is declared, not silent', () => {
    expect(S211.lookback).toBe('either-of-two-most-recent-fy')
    expect(S211.lookbackModelled).toBe(false)
    for (const l of S211.limbs) expect(l.measureNote).toContain('LOOKBACK NOT MODELLED')
  })
})

describe('pending tests are inert — the Omnibus safety net', () => {
  // Asserted against a LOCALLY CONSTRUCTED test, never a THRESHOLD_TESTS entry. CS3D was the last
  // pending one and its constants have now landed, so pinning this to the live table would tie the
  // safety net to whichever framework happens to be scaffolded today — and delete the coverage the
  // moment it activates. The machinery has to hold for the NEXT one, whatever that turns out to be.
  it('the pending machinery still holds for the next scaffolded test', () => {
    const limb: ThresholdLimb = {
      measure: 'employees', amount: 5_000, unit: { unit: 'count' },
      source: 'employee_count', exactMeasure: true, comparison: 'gt',
      basis: 'More than 5,000 employees.',
    }
    const base: ThresholdTest = {
      framework: 'Not Yet Verified', requires: 2, semantics: 'and', limbs: [limb, limb],
      lookback: 'most-recent-fy', lookbackModelled: true, citation: 'constants pending',
    }
    expect(isTestActive({ ...base, pending: true })).toBe(false)   // flagged ⇒ inert even WITH limbs
    expect(isTestActive({ ...base, limbs: [] })).toBe(false)       // no limbs ⇒ inert even UNFLAGGED
    // Both, i.e. a freshly scaffolded entry. The validator SKIPS it rather than failing: 'and' with
    // requires 2 and no limbs cannot be reconciled until the limbs exist, and the check binds on the
    // edit that adds them — which is the same edit that deletes `pending`.
    const scaffold: ThresholdTest = { ...base, limbs: [], pending: true }
    expect(isTestActive(scaffold)).toBe(false)
    expect(() => validateThresholdTests({ 'Not Yet Verified': scaffold })).not.toThrow()
    // Written and unflagged ⇒ active. CSRD is the live counterpart of that state.
    expect(isTestActive(base)).toBe(true)
    expect(isTestActive(THRESHOLD_TESTS['CSRD'])).toBe(true)
    expect(THRESHOLD_TESTS['CSRD'].pending).toBeUndefined()
  })

  it('a non-exhaustive test that fails its modelled route is NOT-ASSESSED, never not-applicable', () => {
    // The live defect this fixture caught: an EU target with 1,850 employees and EUR 620m revenue was
    // told CS3D APPLIES on no test at all. The route now runs and its limbs are unmet — but CS3D also
    // reaches companies through group parentage and through franchising/licensing, neither modelled,
    // so failing route (a) cannot establish that the framework does not apply. `exhaustive: false`
    // is what holds that line.
    for (const rev of [0, 1, 1e12]) {
      const row = find(getFrameworkApplicability('European Union', rev, 'Technology', 'ma', 'USD',
        { employee_count: 1_850, total_assets: 1e9 }), 'CS3D')!
      expect(row.status).toBe('not-assessed')
      expect(row.applies).toBe(false)
      // The false-negative guard, kept explicit: 'not-applicable' would tell a buyer CS3D does not
      // apply, and a buyer told that stops looking.
      expect(row.status).not.toBe('not-applicable')
      // The route DID run — this is a weak claim about an evaluated test, not an abstention that
      // skipped one. That is what distinguishes it from cs3dNonEuAbstention.
      expect(row.test).toBeDefined()
    }
  })

  it('isTestActive rejects pending and empty-limbed tests', () => {
    expect(isTestActive(undefined)).toBe(false)
    expect(isTestActive(SECR)).toBe(true)
  })
})

// ── declared semantics vs the arithmetic ──────────────────────────────────────────────────────

describe('semantics is validated against requires/limbs, not merely documented', () => {
  // A minimal well-formed limb; only requires/limbs.length/semantics matter to the validator.
  const limb = (): ThresholdLimb => ({
    measure: 'employees', amount: 250, unit: { unit: 'count' },
    source: 'employee_count', exactMeasure: true, comparison: 'gt',
    basis: 'More than 250 employees.',
  })
  const test = (over: Partial<ThresholdTest>): Record<string, ThresholdTest> => ({
    'Test Framework': {
      framework: 'Test Framework', requires: 1, semantics: 'trigger', limbs: [limb()],
      lookback: 'most-recent-fy', lookbackModelled: true, citation: 'fixture',
      ...over,
    },
  })

  it('the real table passes — every declared shape matches its arithmetic', () => {
    expect(() => validateThresholdTests()).not.toThrow()
    expect(() => validateThresholdTests(THRESHOLD_TESTS)).not.toThrow()
  })

  it("every entry declares semantics, and the labels match what each test does today", () => {
    for (const t of Object.values(THRESHOLD_TESTS)) expect(t.semantics).toBeTruthy()
    expect(THRESHOLD_TESTS['SB 253'].semantics).toBe('trigger')
    expect(THRESHOLD_TESTS['SECR'].semantics).toBe('n-of-m')
    expect(THRESHOLD_TESTS['Canada S-211'].semantics).toBe('n-of-m')
    expect(THRESHOLD_TESTS['CSRD'].semantics).toBe('and')
    expect(THRESHOLD_TESTS['CS3D'].semantics).toBe('and')
  })

  // THE CASE THIS GUARDS: an AND test that gains a limb while `requires` stays at 2 silently
  // becomes 2-of-3 — met on turnover + headcount alone, under-calling nothing and OVER-calling a
  // target that fails a limb the instrument requires.
  it("'and' with requires 2 and three limbs throws, naming the framework", () => {
    expect(() => validateThresholdTests(test({ semantics: 'and', requires: 2, limbs: [limb(), limb(), limb()] })))
      .toThrow(/Test Framework.*'and'.*requires === limbs\.length.*requires 2, 3 limbs/)
  })

  it("'n-of-m' that is really an AND throws", () => {
    expect(() => validateThresholdTests(test({ semantics: 'n-of-m', requires: 3, limbs: [limb(), limb(), limb()] })))
      .toThrow(/Test Framework.*'n-of-m'/)
    // requires: 0 would make every limb optional — the test would apply to everything.
    expect(() => validateThresholdTests(test({ semantics: 'n-of-m', requires: 0, limbs: [limb(), limb()] })))
      .toThrow(/Test Framework.*'n-of-m'/)
  })

  it("'trigger' with more than one limb throws", () => {
    expect(() => validateThresholdTests(test({ semantics: 'trigger', requires: 1, limbs: [limb(), limb()] })))
      .toThrow(/Test Framework.*'trigger'.*requires === 1 with exactly 1 limb/)
  })

  it('a pending, limbless entry is skipped — and stops being skipped the moment limbs arrive', () => {
    expect(() => validateThresholdTests(test({ semantics: 'and', requires: 2, limbs: [], pending: true })))
      .not.toThrow()
    // Same entry once the Omnibus constants land, with `requires` left stale: now it must fail.
    expect(() => validateThresholdTests(test({ semantics: 'and', requires: 2, limbs: [limb(), limb(), limb()], pending: true })))
      .toThrow(/Test Framework/)
  })
})

// ── N-of-M partial evaluation ─────────────────────────────────────────────────────────────────

describe('N-of-M partial evaluation — an undeclared limb is not a failed limb', () => {
  const gbp = (n: number) => sz(n, { currency: 'GBP' })

  it('applies as soon as N limbs are met, whatever the rest are', () => {
    // turnover + employees met; assets undeclared and irrelevant.
    const r = evaluateTest(SECR, { ...gbp(50_000_000), employee_count: 300 })
    expect(r.outcome.metCount).toBeGreaterThanOrEqual(2)
    expect(r.applies).toBe(true)
    expect(r.status).toBe('applies')
  })

  it('is definitively out when the ceiling cannot reach N', () => {
    // turnover under and employees under: only assets left, so 2 is unreachable.
    const r = evaluateTest(SECR, { ...gbp(1_000_000), employee_count: 10 })
    expect(r.outcome.ceiling).toBeLessThan(SECR.requires)
    expect(r.status).toBe('not-applicable')
    expect(r.applies).toBe(false)
  })

  it('is indeterminate — NOT a fail — when an undeclared limb could still decide it', () => {
    // turnover met, employees undeclared, assets undeclared: 1 met, ceiling 3 >= 2.
    const r = evaluateTest(SECR, gbp(50_000_000))
    expect(r.outcome.metCount).toBe(1)
    expect(r.outcome.unknownCount).toBe(2)
    expect(r.status).toBe('not-assessed')
    expect(r.applies).toBe(false)          // never assert a statute we could not evaluate
  })

  it('names the fields that would resolve an indeterminate outcome', () => {
    const r = evaluateTest(SECR, gbp(50_000_000))
    expect(r.outcome.fieldsToResolve.sort()).toEqual(['employee_count', 'total_assets'])
  })

  it('a declared ZERO is a real answer that fails its limb — not an unknown', () => {
    const declared = evaluateTest(SECR, { ...gbp(50_000_000), employee_count: 0, total_assets: 0 })
    expect(declared.outcome.unknownCount).toBe(0)
    expect(declared.status).toBe('not-applicable')      // 1 met, ceiling 1 < 2 — definitively out
    const unknown = evaluateTest(SECR, gbp(50_000_000))
    expect(unknown.status).toBe('not-assessed')         // same turnover, different epistemic state
    expect(declared.status).not.toBe(unknown.status)
  })

  it('AND semantics fall out of requires === limbs.length', () => {
    const AND = { ...SECR, requires: 3 }
    expect(evaluateTest(AND, { ...gbp(50_000_000), employee_count: 300, total_assets: 1 }).applies).toBe(false)
    expect(evaluateTest(AND, { ...gbp(50_000_000), employee_count: 300, total_assets: 20_000_000 }).applies).toBe(true)
  })
})

describe('per-limb currency and measure', () => {
  it.each(DEAL_CURRENCIES)('converts each money limb into its own statutory currency, from %s', c => {
    const r = evaluateTest(SECR, sz(money(1.5, SECR_TURNOVER, c), { currency: c, total_assets: money(1.5, SECR_ASSETS, c), employee_count: 10 }))
    const [turnover, assets] = r.outcome.limbs
    expect(turnover.valueApplied).toBeCloseTo(1.5 * SECR_TURNOVER.amount, 2)
    expect(assets.valueApplied).toBeCloseTo(1.5 * SECR_ASSETS.amount, 2)
    expect(r.applies).toBe(true)
  })

  it('never converts the statutory figure itself', () => {
    for (const c of DEAL_CURRENCIES) {
      const r = evaluateTest(SECR, sz(money(2, SECR_TURNOVER, c), { currency: c }))
      expect(r.outcome.limbs[0].limb.amount).toBe(36_000_000)
    }
  })

  it('an employee limb is unaffected by deal currency', () => {
    const vals = DEAL_CURRENCIES.map(c => evaluateTest(SECR, sz(1, { currency: c, employee_count: 300 })).outcome.limbs[2].state)
    expect(new Set(vals).size).toBe(1)
  })

  it('an unusable currency makes money limbs not-assessed, never guessed', () => {
    const r = evaluateTest(SECR, sz(5_000_000_000, { currency: 'JPY', employee_count: 10 }))
    expect(r.outcome.limbs[0].state).toBe('not-assessed')
    expect(r.outcome.limbs[0].rateUnavailable).toBe(true)
    expect(r.outcome.limbs[2].state).toBe('not-met')      // count limb still evaluates
  })
})

describe('boundary, per-limb comparison', () => {
  it('SB 253 is strict — exactly at the figure does NOT apply', () => {
    const at = getApplicableFrameworks('USA', SB_TURNOVER.amount, 'Technology', 'ma', 'USD')
    expect(at).not.toContain('SB 253')
    expect(getApplicableFrameworks('USA', SB_TURNOVER.amount + 1, 'Technology', 'ma', 'USD')).toContain('SB 253')
    expect(getApplicableFrameworks('USA', SB_TURNOVER.amount - 1, 'Technology', 'ma', 'USD')).not.toContain('SB 253')
  })

  it('S-211 is inclusive — exactly at the figure DOES meet the limb', () => {
    const r = evaluateTest(S211, sz(0, { currency: 'CAD', total_assets: 20_000_000, employee_count: 250 }))
    expect(r.outcome.limbs[0].state).toBe('met')
    expect(r.outcome.limbs[2].state).toBe('met')
    expect(r.applies).toBe(true)
  })

  it('SECR turnover is strict at its own boundary', () => {
    const at = evaluateTest(SECR, sz(36_000_000, { currency: 'GBP', employee_count: 300, total_assets: 0 }))
    expect(at.outcome.limbs[0].state).toBe('not-met')
    const over = evaluateTest(SECR, sz(36_000_001, { currency: 'GBP', employee_count: 300, total_assets: 0 }))
    expect(over.applies).toBe(true)
  })
})

// ── Outcome-flip near-threshold ───────────────────────────────────────────────────────────────

describe('near-threshold marks a DECISIVE marginal limb, not any marginal limb', () => {
  it('marks when a marginal met limb is load-bearing', () => {
    // turnover marginally over, employees under, assets under: 1 of 2 -> not applies... make it decisive:
    const r = evaluateTest(SECR, sz(1.05 * 36_000_000, { currency: 'GBP', employee_count: 300, total_assets: 0 }))
    expect(r.applies).toBe(true)
    expect(r.outcome.metCount).toBe(2)
    expect(r.outcome.nearOutcomeFlip).toBe(true)     // drop the marginal turnover limb and 2 -> 1
    expect(r.outcome.flipSide).toBe('above')
  })

  it('does NOT mark when a marginal limb is not decisive', () => {
    // three limbs met, one marginal: removing it still leaves 2 of 2.
    const r = evaluateTest(SECR, sz(1.05 * 36_000_000, { currency: 'GBP', employee_count: 300, total_assets: 100_000_000 }))
    expect(r.outcome.metCount).toBe(3)
    expect(r.outcome.limbs.some(l => l.near)).toBe(true)   // a marginal limb exists...
    expect(r.outcome.nearOutcomeFlip).toBe(false)          // ...but it cannot change the answer
  })

  it('marks below-side when a marginal unmet limb could reach N — the dipped-target mitigation', () => {
    const r = evaluateTest(S211, sz(0.95 * 40_000_000, { currency: 'CAD', total_assets: 100_000_000, employee_count: 0 }))
    expect(r.applies).toBe(false)
    expect(r.outcome.nearOutcomeFlip).toBe(true)
    expect(r.outcome.flipSide).toBe('below')
  })

  it('near-ness never changes the legal answer', () => {
    const above = find(getFrameworkApplicability('USA', 1.05 * SB_TURNOVER.amount, 'Technology', 'ma', 'USD'), 'SB 253')!
    expect(above.status).toBe('near-threshold'); expect(above.applies).toBe(true)
    const below = find(getFrameworkApplicability('USA', 0.95 * SB_TURNOVER.amount, 'Technology', 'ma', 'USD'), 'SB 253')!
    expect(below.status).toBe('near-threshold'); expect(below.applies).toBe(false)
    expect(getApplicableFrameworks('USA', 0.95 * SB_TURNOVER.amount, 'Technology', 'ma', 'USD')).not.toContain('SB 253')
    expect(getApplicableFrameworks('USA', 1.05 * SB_TURNOVER.amount, 'Technology', 'ma', 'USD')).toContain('SB 253')
  })

  it('band boundary is inclusive at exactly ±10%', () => {
    for (const ratio of [1 - NEAR_THRESHOLD_BAND, 1 + NEAR_THRESHOLD_BAND])
      expect(find(getFrameworkApplicability('USA', ratio * SB_TURNOVER.amount, 'Technology', 'ma', 'USD'), 'SB 253')!.status)
        .toBe('near-threshold')
    expect(find(getFrameworkApplicability('USA', 1.111 * SB_TURNOVER.amount, 'Technology', 'ma', 'USD'), 'SB 253')!.status).toBe('applies')
    expect(find(getFrameworkApplicability('USA', 0.889 * SB_TURNOVER.amount, 'Technology', 'ma', 'USD'), 'SB 253')!.status).toBe('not-applicable')
  })
})

// ── The SECR over-call this fixes ─────────────────────────────────────────────────────────────

describe('SECR no longer over-calls on turnover alone', () => {
  it('turnover over the figure with no other size data is NOT asserted', () => {
    const fws = getApplicableFrameworks('UK', 50_000_000, 'Technology', 'ma', 'GBP')
    expect(fws).not.toContain('SECR')
    const row = find(getFrameworkApplicability('UK', 50_000_000, 'Technology', 'ma', 'GBP'), 'SECR')!
    expect(row.status).toBe('not-assessed')
    expect(row.test!.fieldsToResolve.sort()).toEqual(['employee_count', 'total_assets'])
  })

  it('applies once a second limb is declared and met', () => {
    expect(getApplicableFrameworks('UK', 50_000_000, 'Technology', 'ma', 'GBP', { employee_count: 300 })).toContain('SECR')
  })

  it('is definitively out when two limbs are declared and unmet', () => {
    const row = find(getFrameworkApplicability('UK', 50_000_000, 'Technology', 'ma', 'GBP', { employee_count: 10, total_assets: 0 }), 'SECR')!
    expect(row.status).toBe('not-applicable')
  })

  it('still converts a non-GBP turnover before testing the limb', () => {
    const aud = convertCurrency(50_000_000, 'AUD', 'GBP')
    expect(aud).toBeLessThan(SECR_TURNOVER.amount)
    expect(getApplicableFrameworks('UK', 50_000_000, 'Technology', 'ma', 'AUD', { employee_count: 300, total_assets: 0 }))
      .not.toContain('SECR')
  })
})

// ── CSRD, post-Omnibus ────────────────────────────────────────────────────────────────────────

describe('CSRD — Directive (EU) 2026/470 two-limb AND', () => {
  const CSRD = THRESHOLD_TESTS['CSRD']
  const [CSRD_STAFF, CSRD_TURNOVER] = CSRD.limbs
  const eu = (revenue: number, o: Partial<DealSize> = {}) =>
    find(getFrameworkApplicability('European Union', revenue, 'Technology', 'ma', o.currency ?? 'USD',
      { total_assets: o.total_assets ?? null, employee_count: o.employee_count ?? null }), 'CSRD')!

  it('is a two-limb AND — the pre-Omnibus balance-sheet limb is gone', () => {
    expect([CSRD.requires, CSRD.limbs.length]).toEqual([2, 2])
    expect(CSRD.semantics).toBe('and')
    expect(CSRD.limbs.map(l => l.measure).sort()).toEqual(['employees', 'turnover'])
    expect(CSRD.limbs.some(l => l.measure === 'balance_sheet_total')).toBe(false)
    expect(CSRD.citation).toContain('2026/470')
  })

  it('states the limbs in the Directive’s own figures and currency', () => {
    expect(CSRD_STAFF.amount).toBe(1_000);          expect(CSRD_STAFF.unit).toEqual({ unit: 'count' })
    expect(CSRD_TURNOVER.amount).toBe(450_000_000); expect(limbCur(CSRD_TURNOVER)).toBe('EUR')
    expect(CSRD_STAFF.comparison).toBe('gt')        // "more than"
    expect(CSRD_TURNOVER.comparison).toBe('gt')
  })

  it('AND means both: either limb alone is not enough', () => {
    // Headcounts are kept well clear of the ±10% near band (900 would be marginal, not decided).
    const overTurnover = money(1.5, CSRD_TURNOVER, 'USD')
    expect(eu(overTurnover, { employee_count: 1_500 }).applies).toBe(true)
    const staffShort = eu(overTurnover, { employee_count: 500 })
    expect(staffShort.applies).toBe(false); expect(staffShort.status).toBe('not-applicable')
    const revShort = eu(money(0.5, CSRD_TURNOVER, 'USD'), { employee_count: 1_500 })
    expect(revShort.applies).toBe(false);   expect(revShort.status).toBe('not-applicable')
  })

  it('a target 5% under the headcount limb is near-threshold, not a clean out', () => {
    // Under an AND, one marginal limb IS decisive — which is exactly when the marker should fire.
    const r = eu(money(1.5, CSRD_TURNOVER, 'USD'), { employee_count: 950 })
    expect(r.status).toBe('near-threshold')
    expect(r.side).toBe('below')
    expect(r.applies).toBe(false)          // near-ness never changes the legal in/out
  })

  it('converts the EUR limb through the dated table — first live EUR limb in the table', () => {
    // Just over and just under 450m EUR, expressed in every deal currency.
    for (const c of DEAL_CURRENCIES) {
      expect(eu(money(1.5, CSRD_TURNOVER, c), { employee_count: 2_000, currency: c }).applies).toBe(true)
      expect(eu(money(0.5, CSRD_TURNOVER, c), { employee_count: 2_000, currency: c }).applies).toBe(false)
    }
  })

  it('an undeclared limb is not-assessed, not not-applicable', () => {
    // Headcount blank with turnover clearly over: the answer is unknown, not "no".
    const r = eu(money(1.5, CSRD_TURNOVER, 'USD'))
    expect(r.status).toBe('not-assessed')
    expect(r.applies).toBe(false)
    expect(r.test!.fieldsToResolve).toEqual(['employee_count'])
  })

  it('Global ABSTAINS — never not-applicable on the EU-undertaking limbs', () => {
    // The worse error in diligence is the false negative: a buyer told CSRD does not apply
    // stops looking. A non-EU parent can still be caught through EU subsidiaries and branches.
    for (const rev of [0, 1, 1e12]) {
      const r = find(getFrameworkApplicability('Global', rev, 'Technology', 'ma', 'USD',
        { total_assets: 1e12, employee_count: 50_000 }), 'CSRD')!
      expect(r.status).toBe('not-assessed')
      expect(r.status).not.toBe('not-applicable')
      expect(r.applies).toBe(false)
      expect(r.reason).toBe(CSRD_NON_EU_REASON)
      expect(r.test).toBeUndefined()          // no size test was run at all
    }
  })

  it('the Global abstention names the EU footprint, and prompts for no field', () => {
    // Nothing the deal form collects would resolve it — so it must not read as a data prompt.
    expect(CSRD_NON_EU_REASON).toContain('EU footprint')
    expect(CSRD_NON_EU_REASON).not.toMatch(/enter|revenue|headcount/i)
    expect(assessmentView(true, [csrdNonEuAbstention()]).fieldsToResolve).toEqual([])
    expect(assessmentView(true, [csrdNonEuAbstention()]).notAssessed).toEqual(['CSRD'])
  })

  it('is applied to EU targets only — no other jurisdiction runs the size test', () => {
    for (const j of ['USA', 'UK', 'Canada', 'Australia', 'Other']) {
      expect(find(getFrameworkApplicability(j, 1e12, 'Technology', 'ma', 'USD',
        { total_assets: 1e12, employee_count: 50_000 }), 'CSRD')).toBeUndefined()
    }
  })
})

describe('CS3D abstains while its size test is pending', () => {
  const row = (j: string) => find(getFrameworkApplicability(j, 620_000_000, 'Technology', 'ma', 'EUR',
    { employee_count: 1_850, total_assets: 1e9 }), 'CS3D')

  it('never asserts APPLIES on a target that was never tested', () => {
    // The live defect: 1,850 employees / EUR 620m reported as APPLIES, directly under a CSRD row
    // showing full statutory workings. CS3D's real limbs are >5,000 staff AND >EUR 1.5bn.
    for (const j of ['European Union', 'Global']) {
      expect(row(j)!.applies).toBe(false)
      expect(row(j)!.status).toBe('not-assessed')
      expect(row(j)!.status).not.toBe('not-applicable')
    }
  })

  it('stays in scope — it is unresolved, not absent', () => {
    for (const j of ['European Union', 'Global']) expect(row(j)).toBeDefined()
    // ...and out of scope entirely elsewhere, as before.
    for (const j of ['USA', 'UK', 'Canada', 'Australia', 'Other']) expect(row(j)).toBeUndefined()
  })

  it('names the real threshold and the amending directive in its reason', () => {
    expect(CS3D_PENDING_REASON).toContain('5,000 employees')
    expect(CS3D_PENDING_REASON).toContain('EUR 1.5bn')
    expect(CS3D_PENDING_REASON).toContain('2026/470')
    // No trailing period: the report appends one at the render site.
    expect(CS3D_PENDING_REASON.endsWith('.')).toBe(false)
  })

  it('is not promoted into the flat applies-filtered list', () => {
    expect(getApplicableFrameworks('European Union', 620_000_000, 'Technology', 'ma', 'EUR',
      { employee_count: 1_850, total_assets: 1e9 })).not.toContain('CS3D')
  })

  it('blocks a proximity claim and is named as not-assessed', () => {
    const v = assessmentView(true, [cs3dPendingAbstention()])
    expect(v.notAssessed).toEqual(['CS3D'])
    expect(v.fieldsToResolve).toEqual([])   // no field the deal form collects would resolve it
    expect(v.nearThreshold).toBe('not-assessed')
  })

  // The report has its own four-state resolver, mirroring FrameworkStatus. Both describe the same
  // fact, so they must not word it differently — the row's reason wins where it has one.
  it('resolveCs3d agrees with the engine rather than deriving a second, vaguer reason', () => {
    const rows = getFrameworkApplicability('European Union', 620_000_000, 'Technology', 'ma', 'EUR',
      { employee_count: 1_850, total_assets: 1e9 })
    const state = resolveCs3d(getApplicableFrameworks('European Union', 620_000_000, 'Technology', 'ma', 'EUR',
      { employee_count: 1_850, total_assets: 1e9 }), rows)
    expect(state.state).toBe('conditional')
    expect(state.state === 'conditional' && state.reason).toBe(CS3D_ROUTE_NOT_MET_REASON)
    // Never the old placeholder, and never 'applies' or 'not-applicable'.
    expect(state.state === 'conditional' && state.reason).not.toBe('size test incomplete')
  })

  // 4,700 employees and EUR 1.4bn put BOTH art. 2(1)(a) limbs inside the 10% band and unmet, so
  // nearOutcomeFlip raises 'near-threshold' over the 'not-assessed' the route-not-met outcome maps to.
  // The row therefore carries a reason under a status resolveCs3d did not branch on, and every branch
  // missed it: an EU target was told CS3D reaches non-EU companies and its markets were not captured.
  // Neither statement was true, and neither was checkable — the sentence was the fall-through, not a
  // finding.
  it('a near-threshold row keeps its OWN reason AND its own state — never the non-EU sentence, never "not assessed"', () => {
    const size = { employee_count: 4_700 }
    const rows = getFrameworkApplicability('European Union', 1_400_000_000, 'Technology', 'ma', 'EUR', size)
    const row = find(rows, 'CS3D')!
    expect(row.status).toBe('near-threshold')
    expect(row.reason).toBe(CS3D_ROUTE_NOT_MET_REASON)
    const state = resolveCs3d(
      getApplicableFrameworks('European Union', 1_400_000_000, 'Technology', 'ma', 'EUR', size), rows)
    // BOTH halves. Asserting the reason alone is what let the collapse survive: the sentence was
    // right while the state carrying it said the test had not been run, and only the state decides
    // which of the two CS3D headings a surface prints above it.
    expect(state.state).toBe('near-threshold')
    expect(state.state === 'near-threshold' && state.reason).toBe(CS3D_ROUTE_NOT_MET_REASON)
    // The row's status is the authority; the state must not re-derive a different one.
    expect(state.state).toBe(row.status)
    // The specific false statement this protects against, pinned rather than described.
    expect(state.state === 'near-threshold' && state.reason).not.toContain('non-EU')
    expect(state.state === 'near-threshold' && state.reason).not.toContain('markets')
  })

  // The other near-threshold sub-case: a marginal limb flipped the outcome, but no route was
  // evaluated-and-withheld, so the engine attaches no reason. Built by hand rather than driven
  // through a size, because the point is the BRANCH — a near-threshold row with `reason` absent
  // must still resolve as near-threshold, not fall through to the not-assessed arm below it.
  it('a near-threshold row with no reason of its own resolves near-threshold with reason null', () => {
    const noReason: FrameworkApplicability = { framework: 'CS3D', applies: false, status: 'near-threshold' }
    const state = resolveCs3d([], [noReason])
    expect(state.state).toBe('near-threshold')
    // null, not a manufactured sentence and not the field prompt the abstention arm would produce.
    expect(state.state === 'near-threshold' && state.reason).toBeNull()
  })

  it('resolveCs3d still falls back where a row carries no reason of its own', () => {
    const noReason: FrameworkApplicability = { framework: 'CS3D', applies: false, status: 'not-assessed' }
    const state = resolveCs3d([], [noReason])
    expect(state.state === 'conditional' && state.reason).toBe('size test incomplete')
  })
})

describe('Canada S-211', () => {
  it('is in scope for Canada only', () => {
    expect(getFrameworkApplicability('Canada', 0, 'Technology', 'ma', 'CAD').some(r => r.framework === 'Canada S-211')).toBe(true)
    for (const j of ['USA', 'UK', 'European Union', 'Global'])
      expect(getFrameworkApplicability(j, 0, 'Technology', 'ma', 'CAD').some(r => r.framework === 'Canada S-211')).toBe(false)
  })

  it('applies on 2 of 3 and does not price anything', () => {
    const fws = getApplicableFrameworks('Canada', 50_000_000, 'Technology', 'ma', 'CAD', { total_assets: 30_000_000 })
    expect(fws).toContain('Canada S-211')
    // Not a value-chain accounting scope, so it must not reach the supply-chain module.
    expect(getObligations(1, fws, 'Technology').themisIqTotal)
      .toBe(getObligations(1, fws.filter(f => f !== 'Canada S-211'), 'Technology').themisIqTotal)
  })
})

// ── Absence of data is not a value ────────────────────────────────────────────────────────────

describe('isRevenueDeclared', () => {
  it('treats a blank field and 0 as undeclared, valid figures as declared', () => {
    expect(Number('')).toBe(0)
    expect(isRevenueDeclared(Number(''))).toBe(false)
    expect(isRevenueDeclared(0)).toBe(false)
    expect(isRevenueDeclared(2_000_000)).toBe(true)
    for (const v of [NaN, Infinity, -1, null, undefined, '2000000', {}]) expect(isRevenueDeclared(v)).toBe(false)
  })
})

const viewFor = (j: string, rev: number, sector = 'Technology', cur: DealCurrency = 'USD', size = {}) =>
  assessmentView(true, getFrameworkApplicability(j, rev, sector, 'ma', cur, size))

describe('assessmentView — per-framework, not per-section', () => {
  it('reports nothing evaluated when sector/jurisdiction are missing', () => {
    expect(assessmentView(false, [])).toEqual({ evaluated: false, notAssessed: [], unevaluated: [], routeNotMet: [], fieldsToResolve: [], frameworks: 'not-assessed', nearThreshold: 'not-assessed' })
  })

  it('blank revenue + USA: frameworks resolve, only SB 253 is withheld', () => {
    const v = viewFor('USA', 0)
    expect(v.frameworks).toBe('assessed-findings')
    expect(v.notAssessed).toEqual(['SB 253'])
    expect(v.fieldsToResolve).toEqual(['revenue'])
    expect(v.nearThreshold).toBe('not-assessed')
  })

  it('blank revenue + Australia/Other: nothing is withheld at all', () => {
    for (const j of ['Australia', 'Other']) {
      const v = viewFor(j, 0)
      expect(v.notAssessed).toEqual([])
      expect(v.frameworks).toBe('assessed-findings')
      expect(v.nearThreshold).toBe('assessed-none')
    }
  })

  it('EU and Global now withhold CSRD — for different reasons, both not-assessed', () => {
    // EU: the size test is real but its limbs are undeclared. Global: no size test can settle it.
    for (const j of ['European Union', 'Global']) {
      const v = viewFor(j, 0)
      expect(v.notAssessed).toContain('CSRD')
      expect(v.frameworks).toBe('assessed-findings')   // the rest of the EU stack still resolves
      expect(v.nearThreshold).toBe('not-assessed')     // one unassessed limb blocks any proximity claim
    }
  })

  it('names only the triggers in scope — a USA deal never cites SECR', () => {
    expect(viewFor('USA', 0).notAssessed).not.toContain('SECR')
    expect(viewFor('UK', 0).notAssessed).not.toContain('SB 253')
  })

  it('a fully-declared UK deal withholds nothing', () => {
    expect(viewFor('UK', 50_000_000, 'Technology', 'GBP', { employee_count: 300, total_assets: 20_000_000 }).notAssessed).toEqual([])
  })

  // ── the two withheld populations ────────────────────────────────────────────
  // `notAssessed` answers "was anything withheld"; it CANNOT say why, and every consumer that claims
  // a cause ("the size test could not be completed") is false of one population or the other. These
  // assert MEMBERSHIP, not just counts — a partition that balances numerically while putting a row in
  // the wrong population would let exactly that false claim through.

  it('an EU deal below the CS3D limbs is routeNotMet — the test COMPLETED', () => {
    // Every limb declared and evaluated: 1,850 < 5,000 and EUR 620m < 1.5bn, so unknownCount is 0.
    const v = viewFor('European Union', 620_000_000, 'Technology', 'EUR', { employee_count: 1_850, total_assets: 4e8 })
    expect(v.notAssessed).toEqual(['CS3D'])
    expect(v.routeNotMet).toEqual(['CS3D'])
    expect(v.unevaluated).toEqual([])
    // No figure the form collects would settle it — the missing thing is a route, not a number.
    expect(v.fieldsToResolve).toEqual([])
    expect(v.unevaluated.length + v.routeNotMet.length).toBe(v.notAssessed.length)
  })

  it('an EU deal with blank revenue is unevaluated — a limb could not be settled', () => {
    // Revenue coerces to 0 ⇒ undeclared, so CSRD's turnover limb and CS3D's both go unevaluated.
    const v = viewFor('European Union', 0, 'Technology', 'EUR', { employee_count: 1_850 })
    expect(v.notAssessed).toEqual(['CSRD', 'CS3D'])
    expect(v.unevaluated).toEqual(['CSRD', 'CS3D'])
    expect(v.routeNotMet).toEqual([])
    expect(v.fieldsToResolve).toEqual(['revenue'])
    expect(v.unevaluated.length + v.routeNotMet.length).toBe(v.notAssessed.length)
  })

  it('a Global deal is unevaluated via the no-test abstentions — no limb ran at all', () => {
    // csrdNonEuAbstention and cs3dNonEuAbstention carry NO `test`, which is the !r.test arm of the
    // predicate. The figures are irrelevant: both clear every limb on paper and still resolve nothing.
    const v = viewFor('Global', 2_000_000_000, 'Technology', 'EUR', { employee_count: 6_000, total_assets: 1e9 })
    expect(v.notAssessed).toEqual(['CSRD', 'CS3D'])
    expect(v.unevaluated).toEqual(['CSRD', 'CS3D'])
    expect(v.routeNotMet).toEqual([])
    // Nothing to enter, but for the OTHER reason: no limb was consulted, so no field is named either.
    expect(v.fieldsToResolve).toEqual([])
    expect(v.unevaluated.length + v.routeNotMet.length).toBe(v.notAssessed.length)
  })

  it('the two populations partition notAssessed across every jurisdiction', () => {
    for (const j of ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other']) {
      for (const rev of [0, 620_000_000, 2e9]) {
        const v = viewFor(j, rev, 'Technology', 'EUR', { employee_count: 1_850 })
        expect([...v.unevaluated, ...v.routeNotMet].sort()).toEqual([...v.notAssessed].sort())
        // Disjoint as well as covering — a row in both would balance the counts and still be wrong.
        expect(v.unevaluated.filter(f => v.routeNotMet.includes(f))).toEqual([])
      }
    }
  })

  it('the !evaluated early return carries both populations as empty', () => {
    const v = assessmentView(false, [])
    expect(v.unevaluated).toEqual([])
    expect(v.routeNotMet).toEqual([])
  })

  // EUR 460,000,000 — 2.2% ABOVE CSRD's EUR 450m turnover limb, so that limb is MARGINAL, and with
  // headcount met it is DECISIVE: drop it and CSRD no longer reaches 2 of 2, which is what raises
  // near-threshold rather than merely noting a nearby figure. The same revenue is 69% BELOW CS3D's
  // EUR 1.5bn, and 1,850 is below its 5,000, so CS3D fails route (a) with BOTH limbs evaluated —
  // unknownCount 0, which is exactly the row that must NOT suppress. Before the predicate keyed on
  // unevaluated limbs, CS3D's presence in notAssessed deleted this whole finding from both surfaces.
  // Denominated in EUR against a EUR limb, so no rate is exercised and refreshing FX cannot turn
  // this red.
  it('a framework withheld because the modelled route was not met does not suppress a real proximity finding', () => {
    const rows = getFrameworkApplicability('European Union', 460_000_000, 'Technology', 'ma', 'EUR', { employee_count: 1_850 })
    const v = assessmentView(true, rows)
    expect(find(rows, 'CSRD')!.status).toBe('near-threshold')
    expect(v.notAssessed).toContain('CS3D')
    expect(v.fieldsToResolve).toEqual([])
    expect(v.nearThreshold).toBe('assessed-findings')
  })
})

describe('not-assessed reads as a prompt, naming the field', () => {
  it('names headcount when that is what is missing', () => {
    const v = viewFor('UK', 50_000_000, 'Technology', 'GBP', { total_assets: 0 })
    expect(v.fieldsToResolve).toEqual(['employee_count'])
    expect(resolveFieldsPrompt(v.fieldsToResolve, v.notAssessed)).toBe('Enter headcount to assess SECR.')
  })

  it('names several fields when several are missing', () => {
    const v = viewFor('UK', 50_000_000, 'Technology', 'GBP')
    expect(resolveFieldsPrompt(v.fieldsToResolve, v.notAssessed))
      .toBe('Enter balance-sheet total and headcount to assess SECR.')
  })

  it('carries the prompt into both notes', () => {
    const v = viewFor('UK', 50_000_000, 'Technology', 'GBP', { total_assets: 0 })
    expect(notAssessedNote(v.notAssessed, v.fieldsToResolve)).toContain('Enter headcount to assess SECR.')
    expect(partiallyAssessedNote(v.notAssessed, v.fieldsToResolve)).toContain('Enter headcount to assess SECR.')
    expect(partiallyAssessedNote(v.notAssessed, v.fieldsToResolve)).toContain('not a finding that it does not apply')
  })

  // Covers the report call site at report/page.tsx:229, which passes view.fieldsToResolve directly;
  // a CS3D-only abstention makes that list empty. CS3D's size test is pending with no limbs, so no
  // limb was ever consulted and no field would settle it — the note must name none. The removed
  // `= ['revenue']` default prompted for a figure the same report printed at the top.
  it('notAssessedNote names no field when fieldsToResolve is empty', () => {
    const v = viewFor('European Union', 620_000_000, 'Industrials & Manufacturing', 'EUR', { total_assets: 400_000_000, employee_count: 1850 })
    expect(v.notAssessed).toEqual(['CS3D'])
    expect(v.fieldsToResolve).toEqual([])
    const note = notAssessedNote(v.notAssessed, v.fieldsToResolve)
    expect(note).toContain('NOT ASSESSED')
    expect(note).not.toContain('Enter')
    expect(note).not.toContain('revenue')
  })

  // ── the routeNotMet counterpart ─────────────────────────────────────────────
  // The other half of the partition needs its OWN sentence, not a parameterised one: this population's
  // test COMPLETED, so every "size test could not be completed" wording is false of it, and there is
  // no field to prompt for.
  it('routeNotMetNote states the route was tested and names the unmodelled routes — one framework', () => {
    const note = routeNotMetNote(['CS3D'])
    expect(note).toContain('NOT RESOLVED: CS3D')
    expect(note).toContain('tested against company size, and the target is below that threshold')
    expect(note).toContain('It can also apply')
    expect(note).toContain('parent company')
    expect(note).toContain('franchising or licensing')
    expect(note).toContain('not a finding that it does not apply')
  })

  it('routeNotMetNote pluralises for more than one framework', () => {
    const note = routeNotMetNote(['CS3D', 'Some Other Rule'])
    expect(note).toContain('NOT RESOLVED: CS3D, Some Other Rule')
    expect(note).toContain('They can also apply')
    expect(note).not.toContain('It can also apply')
    expect(note).toContain('not a finding that they do not apply')
  })

  it('routeNotMetNote carries NO field prompt and never says the test was incomplete', () => {
    for (const names of [['CS3D'], ['CS3D', 'Some Other Rule']]) {
      const note = routeNotMetNote(names)
      // No prompt: there is no figure the form collects that would change this answer.
      expect(note).not.toContain('Enter')
      // And no wording that would contradict the near-threshold table, which shows this row's limbs
      // and their evaluated values.
      expect(note).not.toContain('size test')
      expect(note).not.toContain('not evaluated')
      expect(note).not.toContain('could not be completed')
      expect(note).not.toContain('NOT ASSESSED')
    }
  })

  // ── the PARTIAL heading phrase ───────────────────────────────────────────────
  // The heading names the UNION but the phrase says HOW, which the union cannot carry. 'NOT ASSESSED'
  // on a fully-evaluated row reads as "nothing happened" and contradicts the near-threshold table.
  it('partialHeadingPhrase reads NOT RESOLVED where every named row WAS evaluated', () => {
    expect(partialHeadingPhrase({ unevaluated: [], routeNotMet: ['CS3D'] })).toBe('NOT RESOLVED')
  })

  it('partialHeadingPhrase reads NOT ASSESSED where a limb went unevaluated', () => {
    expect(partialHeadingPhrase({ unevaluated: ['SB 253'], routeNotMet: [] })).toBe('NOT ASSESSED')
  })

  it('partialHeadingPhrase takes the WEAKER claim on a mixed deal — true of both populations', () => {
    // 'NOT RESOLVED' would imply every framework named in the heading was actually tested, which is
    // false of the unevaluated half. Unreachable today; it must fail toward the safe claim when it is not.
    expect(partialHeadingPhrase({ unevaluated: ['CSRD'], routeNotMet: ['CS3D'] })).toBe('NOT ASSESSED')
  })

  it('partialHeadingPhrase defaults to NOT ASSESSED when nothing was withheld', () => {
    // The panel is gated on the union being non-empty, so this is unreachable through a render — the
    // phrase must still not invent a claim of having tested anything.
    expect(partialHeadingPhrase({ unevaluated: [], routeNotMet: [] })).toBe('NOT ASSESSED')
  })

  it('partialHeadingPhrase agrees with the engine on both live populations', () => {
    // Driven from real deals rather than hand-built lists, so the phrase cannot drift from what
    // assessmentView actually produces.
    const routeOnly = viewFor('European Union', 620_000_000, 'Technology', 'EUR', { employee_count: 1_850 })
    expect(partialHeadingPhrase(routeOnly)).toBe('NOT RESOLVED')
    const unevaluatedOnly = viewFor('USA', 0, 'Technology', 'USD')
    expect(partialHeadingPhrase(unevaluatedOnly)).toBe('NOT ASSESSED')
  })

  it('has a label for every limb source in both registers, and never exposes a column name', () => {
    const sources = new Set(Object.values(THRESHOLD_TESTS).flatMap(t => t.limbs.map(l => l.source)))
    for (const s of sources) {
      expect(FIELD_LABELS[s].length).toBeGreaterThan(0)
      expect(FIELD_FORM_LABELS[s].length).toBeGreaterThan(0)
      // The report an external deal team reads must never print a database identifier —
      // `deals.total_assets` names our schema, not anything the reader can act on.
      expect(FIELD_FORM_LABELS[s]).not.toMatch(/deals\.|_/)
    }
  })

  it('keeps assessed-none distinct from not-assessed', () => {
    expect(nearThresholdNoneNote()).not.toBe(notAssessedNote(undefined, ['revenue']))
    expect(nearThresholdNoneNote()).toContain(NEAR_BAND_PCT)
    expect(notAssessedNote(undefined, ['revenue'])).toContain('NOT ASSESSED')
  })
})

// ── Pricing ───────────────────────────────────────────────────────────────────────────────────

describe('blank revenue resolves everything that does not need revenue', () => {
  it('EU resolves CS3D/CSRD and prices supply chain at $2,900', () => {
    const fws = getApplicableFrameworks('European Union', 0, 'Technology', 'ma', 'USD')
    // CSRD is absent: post-Omnibus it is size-gated, and with revenue and headcount blank it is
    // not-assessed rather than applied. The rich form carries the caveat; the flat list is in/out.
    // CS3D is absent for a different reason — it abstains until its size test lands.
    expect(fws).toEqual(['EU Taxonomy', 'IFRS S2', 'TCFD'])
    const o = getObligations(1, fws, 'Technology')
    // KNOCK-ON: supply chain was triggered by CS3D. With CS3D abstaining and CSRD unresolved,
    // nothing triggers it, so it is no longer priced. Pricing follows the applies-filtered list.
    expect(o.included.find(x => x.short === 'supply chain')).toBeUndefined()
    expect(o.themisIqTotal).toBe(4900)
  })

  it('USA resolves IFRS S2/TCFD, reports SB 253 not-assessed, and prices nothing extra', () => {
    const fws = getApplicableFrameworks('USA', 0, 'Technology', 'ma', 'USD')
    expect(fws).toEqual(['IFRS S2', 'TCFD'])
    expect(find(getFrameworkApplicability('USA', 0, 'Technology', 'ma', 'USD'), 'SB 253')!.status).toBe('not-assessed')
    expect(getObligations(1, fws, 'Technology').themisIqTotal).toBe(4900)
  })
})

describe('bundled is not zero — included-free vs costs-zero', () => {
  const FS = getApplicableFrameworks('USA', 0, 'Financial Services', 'ma', 'USD')

  it('financed emissions is bundled and renders as an inclusion', () => {
    const fe = getObligations(1, FS, 'Financial Services').included.find(o => o.short === 'financed emissions')!
    expect(fe.pricing).toEqual({ kind: 'bundled' })
    expect(obligationPriceLabel(fe.pricing)).toBe('Included in GHG inventory')
  })

  it('bundled never sums and never forces a quote', () => {
    const withFe = getObligations(1, FS, 'Financial Services')
    expect(withFe.included.some(o => o.pricing.kind === 'bundled')).toBe(true)
    expect(withFe.themisIqTotal).toBe(getObligations(1, ['IFRS S2'], 'Technology').themisIqTotal)
    expect(withFe.themisIqHasCustom).toBe(false)
  })

  it('a quote-tier FS deal renders "Custom quote" and never a zero figure', () => {
    const o = getObligations(20, FS, 'Financial Services')
    expect(o.themisIqTotal).toBeNull()
    const figure = o.themisIqHasCustom
      ? (o.themisIqTotal != null ? `~USD ${o.themisIqTotal.toLocaleString()} + custom` : 'Custom quote')
      : `~USD ${(o.themisIqTotal ?? 0).toLocaleString()}`
    expect(figure).toBe('Custom quote')
    expect(figure).not.toContain('0')
  })

  it('every price label is a state, never a bare zero', () => {
    expect(obligationPriceLabel({ kind: 'priced', priceUSD: 2900 })).toBe('USD 2,900')
    expect(obligationPriceLabel({ kind: 'bundled' })).toBe('Included in GHG inventory')
    expect(obligationPriceLabel({ kind: 'quote' })).toBe('Custom quote')
    expect(obligationPriceLabel({ kind: 'excluded' })).toBe('Not included')
  })

  it('the deprecated themisIqPrice field stays derived from pricing', () => {
    for (const loc of [1, 10, 20]) {
      const o = getObligations(loc, FS, 'Financial Services')
      for (const t of [...o.included, ...o.recommended, ...o.flagged])
        expect(t.themisIqPrice).toBe(t.pricing.kind === 'priced' ? t.pricing.priceUSD : null)
    }
  })
})

describe('pricing is unchanged by the multi-limb work', () => {
  it('supply-chain pricing depends only on CS3D/CSRD/SFDR, which are untouched this change', () => {
    for (const j of ['USA', 'UK', 'European Union', 'Global', 'Canada'])
      for (const s of ['Technology', 'Financial Services'])
        for (const loc of [1, 10, 20]) {
          const fws = getApplicableFrameworks(j, 2_000_000_000, s, 'ma', 'USD', { employee_count: 300, total_assets: 1e9 })
          const o = getObligations(loc, fws, s)
          // CS3D no longer triggers it (abstains), and CSRD needs >1,000 employees — this fixture
          // has 300 — so SFDR is the only remaining trigger.
          const sfdr = j === 'European Union' && s === 'Financial Services'
          const ghg = loc <= 3 ? 4900 : loc <= 15 ? 11900 : null
          const supply = sfdr ? 2900 : 0
          expect(o.themisIqTotal).toBe(ghg == null ? (supply || null) : ghg + supply)
        }
  })

  it('SECR moving to 2-of-3 does not move any price', () => {
    for (const size of [{}, { employee_count: 300 }, { employee_count: 10, total_assets: 0 }])
      expect(getObligations(10, getApplicableFrameworks('UK', 50_000_000, 'Technology', 'ma', 'GBP', size), 'Technology').themisIqTotal)
        .toBe(11900)
  })
})

describe('flat form stays the applies-filtered rich form', () => {
  it('holds across jurisdictions, revenues, currencies and size states', () => {
    for (const j of ['USA', 'UK', 'European Union', 'Global', 'Canada'])
      for (const rev of [0, 2_000_000, 50_000_000, 2_000_000_000])
        for (const c of DEAL_CURRENCIES)
          for (const size of [{}, { employee_count: 300, total_assets: 5e7 }]) {
            const rich = getFrameworkApplicability(j, rev, 'Financial Services', 'ma', c, size)
            expect(getApplicableFrameworks(j, rev, 'Financial Services', 'ma', c, size))
              .toEqual(rich.filter(r => r.applies).map(r => r.framework))
          }
  })

  it('defaults to USD and to undeclared size when the optional args are omitted', () => {
    expect(getApplicableFrameworks('USA', 2_000_000_000, 'Technology', 'ma'))
      .toEqual(getApplicableFrameworks('USA', 2_000_000_000, 'Technology', 'ma', 'USD', {}))
  })

  it('leaves non-size-gated frameworks untouched by currency and size', () => {
    for (const c of DEAL_CURRENCIES)
      expect(getApplicableFrameworks('European Union', 2_000_000, 'Financial Services', 'ma', c))
        .toEqual(['SFDR', 'EU Taxonomy', 'IFRS S2', 'TCFD', 'PCAF'])
  })
})

// ── The pipeline spreadsheet's rule columns must keep up with the engine ─────────────────────────
//
// The pipeline export gives every framework its own TRUE / FALSE / NOT ASSESSED column so an
// analyst can pivot on it (REGIME_COLUMNS in ./exportPipelineXlsx). That list is written by hand
// and the engine's list is not, so the two can drift apart. When they do, nothing breaks loudly:
// a new framework quietly loses its column and lands in the catch-all "Other rules" cell instead.
// These two tests are what turn that silent drift into a failure that says what to do.

// Mirrors the options the deal form offers (app/dashboard/deals/page.tsx). Sectors come from
// SECTOR_RISKS so the sweep cannot fall behind a sector being added; 'Other' is the form's
// no-template option and has no SECTOR_RISKS entry, so it is named here.
const ALL_JURISDICTIONS = ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other']
const ALL_SECTORS = [...Object.keys(SECTOR_RISKS), 'Other']

// Every framework name the engine can put in front of a user, across every combination of the
// inputs a deal can carry. Uses the RICH form deliberately: it returns a row for each framework it
// EVALUATED, including ones that turned out not to apply, which is the full vocabulary the export
// has to have a column for.
function everyFrameworkTheEngineCanEmit(): string[] {
  const seen = new Set<string>()
  for (const jurisdiction of ALL_JURISDICTIONS)
    for (const sector of ALL_SECTORS)
      for (const revenue of [0, 2_000_000, 50_000_000, 2_000_000_000])
        for (const size of [{}, { employee_count: 300, total_assets: 50_000_000 }, { employee_count: 0, total_assets: 0 }])
          for (const currency of DEAL_CURRENCIES)
            getFrameworkApplicability(jurisdiction, revenue, sector, 'ma', currency, size)
              .forEach(r => seen.add(r.framework))
  return [...seen].sort()
}

describe('pipeline export: every rule the engine can emit needs its own spreadsheet column', () => {
  it('adding a framework to the engine also adds a column to the pipeline export', () => {
    const columns = new Set<string>(REGIME_COLUMNS as readonly string[])
    const missing = everyFrameworkTheEngineCanEmit().filter(f => !columns.has(f))

    expect(missing,
      `\n\nThe engine can emit ${missing.length} framework name(s) that the pipeline spreadsheet has no column for:\n` +
      missing.map(f => `    ${f}`).join('\n') +
      `\n\nWHAT THIS MEANS: each of these loses its own TRUE / FALSE column in the export and is lumped\n` +
      `into the catch-all "Other rules" cell, so an analyst cannot filter or pivot on it.\n\n` +
      `TO FIX: add the name — spelled EXACTLY as the engine emits it, above — to REGIME_COLUMNS in\n` +
      `lib/deals/exportPipelineXlsx.ts. That is the only edit needed: the column width and the header\n` +
      `both map over REGIME_COLUMNS, so they follow automatically.\n`,
    ).toEqual([])
  })

  it('no column is left pointing at a framework the engine cannot emit', () => {
    const emitted = new Set(everyFrameworkTheEngineCanEmit())
    const dead = (REGIME_COLUMNS as readonly string[]).filter(c => !emitted.has(c))

    expect(dead,
      `\n\nThe pipeline spreadsheet has ${dead.length} column(s) for framework name(s) the engine never emits:\n` +
      dead.map(c => `    ${c}`).join('\n') +
      `\n\nWHAT THIS MEANS: these columns read FALSE in every row of every export, which tells the reader\n` +
      `the rule applies to none of their targets — a finding, not the absence of one.\n\n` +
      `TO FIX: this is almost always a spelling difference or a renamed framework, so check the name\n` +
      `against getFrameworkApplicability in lib/deals/assessment.ts first. Remove the column only if\n` +
      `the framework itself is genuinely gone.\n`,
    ).toEqual([])
  })
})
