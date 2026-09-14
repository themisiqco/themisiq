import { describe, it, expect } from 'vitest'
import { deflateSpend, type DeflationInput, type PriceIndexProvenance } from './spendAdjustment'
import { resolveSpendFactor } from './spendResolver.server'
import type { SpendFactorQuery } from './spend'

// DEFLATION IS THE FIRST TRANSFORMATION THIS MODULE FAMILY PERFORMS RATHER THAN REPORTS.
//
// Everything else — FX, basis conversion, the reliability tail — is flagged and handed back. This
// one is applied, and it is applied only because the CALLER supplies the index: the authority is
// theirs, the numbers are recorded, and the factor is untouched. These tests are mostly about that
// last clause. A deflation that quietly moved the factor, or that returned the nominal amount when
// the index was unusable, would produce a figure that looks adjusted and is not.
//
// Indices below are illustrative values chosen to make the arithmetic checkable by hand. They are
// NOT a real series and this module ships none.

const PROV: PriceIndexProvenance = {
  source: 'Example Statistical Office',
  series: 'Illustrative all-items index',
  vintage: '2026-01-15',
  region: 'EA19',
  note: 'Test fixture. Not a real series.',
}

const base = (over: Partial<DeflationInput> = {}): DeflationInput => ({
  amount: 100_000,
  from_year: 2026,
  to_year: 2019,
  index_from: 120,
  index_to: 100,
  provenance: PROV,
  ...over,
})

describe('deflateSpend', () => {
  it('D1 spend AFTER the factor year deflates downward', () => {
    // 2026 money buys less than 2019 money, so 100,000 of 2026 euros is fewer 2019 euros.
    const a = deflateSpend(base())
    expect(a.multiplier).toBeCloseTo(100 / 120, 12)
    expect(a.output_amount).toBeCloseTo(83_333.3333333, 6)
    expect(a.output_amount, 'seven years of inflation must not read as emissions growth')
      .toBeLessThan(a.input_amount)
  })

  it('D2 spend BEFORE the factor year inflates upward', () => {
    const a = deflateSpend(base({ from_year: 2015, index_from: 95, index_to: 100 }))
    expect(a.multiplier).toBeCloseTo(100 / 95, 12)
    expect(a.output_amount).toBeCloseTo(105_263.157895, 5)
    expect(a.output_amount).toBeGreaterThan(a.input_amount)
  })

  it('D3 three numbers a verifier can check, and they agree with each other', () => {
    const a = deflateSpend(base())
    expect(a.input_amount).toBe(100_000)
    expect(a.output_amount, 'output must equal input x multiplier, not a re-derivation')
      .toBeCloseTo(a.input_amount * a.multiplier, 9)
    expect(a.index_from).toBe(120)
    expect(a.index_to).toBe(100)
    expect(a.from_year).toBe(2026)
    expect(a.to_year).toBe(2019)
    expect(a.kind).toBe('deflation')
  })

  it('D4 the factor value is never modified, and the record says so', () => {
    const q: SpendFactorQuery = {
      region: 'AT', sector_key: 'i01.b', factor_type: 'industry',
      reporting_currency: 'EUR', reporting_year: 2026, spend_price_basis: 'basic',
    }
    const before = resolveSpendFactor(q)
    if (!before || before.kind === 'absent') throw new Error('expected a factor')
    const value = before.factor.value

    deflateSpend(base({ to_year: before.factor.price_year }))

    const after = resolveSpendFactor(q)
    if (!after || after.kind === 'absent') throw new Error('expected a factor')
    expect(after.factor.value, 'deflation moved the spend, not the factor').toBe(value)
    expect(after.factor.value).toBeCloseTo(1.81385091108, 9)
    expect(deflateSpend(base()).factor_value_modified).toBe(false)
  })

  it('D5 a same-year adjustment is a no-op AND IS STILL RECORDED', () => {
    // Recorded rather than skipped: the workings row should show the question was asked.
    const a = deflateSpend(base({ from_year: 2019, index_from: 100, index_to: 100 }))
    expect(a.multiplier).toBe(1)
    expect(a.output_amount).toBe(a.input_amount)
    expect(a.disclosure).toMatch(/already in 2019 prices/)
    expect(a.disclosure).toMatch(/no\s+deflation was applied/)
    // Even with differing index values supplied, same-year is 1: the years decide, not the numbers.
    const b = deflateSpend(base({ from_year: 2019, index_from: 117, index_to: 100 }))
    expect(b.multiplier).toBe(1)
  })

  it('D6 the index provenance travels, and the disclosure names the series', () => {
    const a = deflateSpend(base())
    expect(a.provenance).toEqual(PROV)
    expect(a.disclosure).toContain('Illustrative all-items index')
    expect(a.disclosure).toContain('2019 = 100')
    expect(a.disclosure).toContain('2026 = 120')
    expect(a.disclosure, 'the reader must be told the factor was left alone')
      .toMatch(/factor is unchanged from its published value/)
  })

  it('D7 an unusable index THROWS rather than returning the nominal amount', () => {
    // Returning the undeflated figure would produce a number that looks deflated and is not.
    expect(() => deflateSpend(base({ index_from: 0 }))).toThrow(/greater than zero/)
    expect(() => deflateSpend(base({ index_to: -3 }))).toThrow(/greater than zero/)
    expect(() => deflateSpend(base({ index_from: NaN }))).toThrow(/finite/)
    expect(() => deflateSpend(base({ amount: Infinity }))).toThrow(/finite/)
    expect(() => deflateSpend(base({ from_year: 2026.5 }))).toThrow(/integer year/)
  })

  it('D8 absent an index there is no deflation, and the mismatch still stands', () => {
    // The caller with no index simply does not call deflateSpend. The resolver's caveat is what
    // reports the situation, and it is unaffected by anything in this module.
    const r = resolveSpendFactor({
      region: 'AT', sector_key: 'i01.b', factor_type: 'industry',
      reporting_currency: 'EUR', reporting_year: 2026, spend_price_basis: 'basic',
    })
    if (!r || r.kind === 'absent') throw new Error('expected a factor')
    expect(r.caveats.price_year_mismatch, 'factor is 2019, query is 2026').toBe(true)
    expect(r.factor.price_year).toBe(2019)
    expect(r.factor.value).toBeCloseTo(1.81385091108, 9)
  })

  it('D9 an adjustment does NOT clear the caveat it addresses', () => {
    // The caveats describe the factor against the query and are computed before any adjustment
    // exists. A caller that hides the caveat once it has deflated removes the reader's ability to
    // check the step; the adjustment record sits BESIDE the caveat, not instead of it.
    const q: SpendFactorQuery = {
      region: 'AT', sector_key: 'i01.b', factor_type: 'industry',
      reporting_currency: 'EUR', reporting_year: 2026, spend_price_basis: 'basic',
    }
    const r = resolveSpendFactor(q)
    if (!r || r.kind === 'absent') throw new Error('expected a factor')
    const a = deflateSpend(base({ to_year: r.factor.price_year }))
    expect(a.output_amount).toBeLessThan(a.input_amount)
    expect(resolveSpendFactor(q)!.kind !== 'absent' &&
      (resolveSpendFactor(q) as any).caveats.price_year_mismatch).toBe(true)
  })

  it('D10 the whole chain gives a figure whose three steps are all visible', () => {
    // spend -> deflate -> x factor. Every number in the row is inspectable.
    const q: SpendFactorQuery = {
      region: 'AT', sector_key: 'i01.b', factor_type: 'industry',
      reporting_currency: 'EUR', reporting_year: 2026, spend_price_basis: 'basic',
    }
    const r = resolveSpendFactor(q)
    if (!r || r.kind === 'absent') throw new Error('expected a factor')
    const adj = deflateSpend(base({ amount: 250_000, to_year: r.factor.price_year }))
    const kgCO2e = adj.output_amount * r.factor.value
    expect(adj.input_amount).toBe(250_000)
    expect(adj.output_amount).toBeCloseTo(250_000 * (100 / 120), 6)
    expect(kgCO2e).toBeCloseTo(250_000 * (100 / 120) * 1.81385091108, 4)
    // and the sources for both halves are nameable
    expect(r.source.doi).toBe('10.5281/zenodo.5589597')
    expect(adj.provenance.series).toBe('Illustrative all-items index')
  })
})
