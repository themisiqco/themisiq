import { describe, it, expect } from 'vitest'
import {
  getApplicableFrameworks, getFrameworkApplicability, convertCurrency, isDealCurrency,
  DEAL_CURRENCIES, USD_PER_UNIT, UNITS_PER_EUR, THRESHOLD_TESTS, isTestActive, evaluateTest,
  NEAR_THRESHOLD_BAND, NEAR_BAND_PCT, FX_AS_OF, FX_SOURCE,
  isRevenueDeclared, assessmentView, notAssessedRevenueNote, partiallyAssessedNote,
  nearThresholdNoneNote, resolveFieldsPrompt, FIELD_LABELS, FIELD_FORM_LABELS,
  getObligations, obligationPriceLabel, SECTOR_RISKS,
  type DealCurrency, type FrameworkApplicability, type DealSize, type ThresholdLimb,
} from './assessment'
import { REGIME_COLUMNS } from './exportPipelineXlsx'

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
  it('CSRD and CS3D are declared pending with no constants', () => {
    for (const k of ['CSRD', 'CS3D']) {
      expect(THRESHOLD_TESTS[k].pending).toBe(true)
      expect(THRESHOLD_TESTS[k].limbs).toEqual([])
      expect(isTestActive(THRESHOLD_TESTS[k])).toBe(false)
    }
  })

  it('a pending test cannot change applicability — CSRD/CS3D keep jurisdiction-only behaviour', () => {
    // A 2-of-0 test would resolve "not-applicable" and silently under-call if it were ever routed.
    for (const rev of [0, 1, 1e12]) {
      const fws = getApplicableFrameworks('European Union', rev, 'Technology', 'ma', 'USD')
      expect(fws).toContain('CSRD')
      expect(fws).toContain('CS3D')
    }
  })

  it('isTestActive rejects pending and empty-limbed tests', () => {
    expect(isTestActive(undefined)).toBe(false)
    expect(isTestActive(SECR)).toBe(true)
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
    expect(assessmentView(false, [])).toEqual({ evaluated: false, notAssessed: [], fieldsToResolve: [], frameworks: 'not-assessed', nearThreshold: 'not-assessed' })
  })

  it('blank revenue + USA: frameworks resolve, only SB 253 is withheld', () => {
    const v = viewFor('USA', 0)
    expect(v.frameworks).toBe('assessed-findings')
    expect(v.notAssessed).toEqual(['SB 253'])
    expect(v.fieldsToResolve).toEqual(['revenue'])
    expect(v.nearThreshold).toBe('not-assessed')
  })

  it('blank revenue + EU/Global/Australia: nothing is withheld at all', () => {
    for (const j of ['European Union', 'Global', 'Australia', 'Other']) {
      const v = viewFor(j, 0)
      expect(v.notAssessed).toEqual([])
      expect(v.frameworks).toBe('assessed-findings')
      expect(v.nearThreshold).toBe('assessed-none')
    }
  })

  it('names only the triggers in scope — a USA deal never cites SECR', () => {
    expect(viewFor('USA', 0).notAssessed).not.toContain('SECR')
    expect(viewFor('UK', 0).notAssessed).not.toContain('SB 253')
  })

  it('a fully-declared UK deal withholds nothing', () => {
    expect(viewFor('UK', 50_000_000, 'Technology', 'GBP', { employee_count: 300, total_assets: 20_000_000 }).notAssessed).toEqual([])
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
    expect(notAssessedRevenueNote(v.notAssessed, v.fieldsToResolve)).toContain('Enter headcount to assess SECR.')
    expect(partiallyAssessedNote(v.notAssessed, v.fieldsToResolve)).toContain('Enter headcount to assess SECR.')
    expect(partiallyAssessedNote(v.notAssessed, v.fieldsToResolve)).toContain('not a finding that it does not apply')
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
    expect(nearThresholdNoneNote()).not.toBe(notAssessedRevenueNote())
    expect(nearThresholdNoneNote()).toContain(NEAR_BAND_PCT)
    expect(notAssessedRevenueNote()).toContain('NOT ASSESSED')
  })
})

// ── Pricing ───────────────────────────────────────────────────────────────────────────────────

describe('blank revenue resolves everything that does not need revenue', () => {
  it('EU resolves CS3D/CSRD and prices supply chain at $2,900', () => {
    const fws = getApplicableFrameworks('European Union', 0, 'Technology', 'ma', 'USD')
    expect(fws).toEqual(['CSRD', 'EU Taxonomy', 'CS3D', 'IFRS S2', 'TCFD'])
    const o = getObligations(1, fws, 'Technology')
    expect(o.included.find(x => x.short === 'supply chain')!.pricing).toEqual({ kind: 'priced', priceUSD: 2900 })
    expect(o.themisIqTotal).toBe(4900 + 2900)
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
          const euish = ['European Union', 'Global'].includes(j)
          const sfdr = j === 'European Union' && s === 'Financial Services'
          const ghg = loc <= 3 ? 4900 : loc <= 15 ? 11900 : null
          const supply = (euish || sfdr) ? 2900 : 0
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
        .toEqual(['CSRD', 'SFDR', 'EU Taxonomy', 'CS3D', 'IFRS S2', 'TCFD', 'PCAF'])
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
