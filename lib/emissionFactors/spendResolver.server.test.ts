import { describe, it, expect } from 'vitest'
import { resolveSpendFactor, type SpendFactorAbsent } from './spendResolver.server'
import type { SpendFactorQuery, SpendFactorResult } from './spend'

// THE RESOLVER'S JOB IS TO REFUSE WELL, NOT ONLY TO ANSWER.
//
// Most of this file is about the cases where there is no number: a zero that must not become 0.0, a
// region EXIOBASE does not cover, a sector whose reliability could not be checked, a secondary
// material the model never prices. lib/emissionFactors.ts answers every one of those with
// DEFAULT_SPEND_EF = 0.5, which is why this module exists.
//
// Fixtures are real rows, chosen from the extract and named here so a data change fails visibly
// rather than silently re-pointing a test at a different row.
//   AT / i01.b   1,813,850.91108   in bounds, globally and locally  -> 1.81385091108 per EUR
//   AT / i15.d      42,141.9141288 below the global p3 of 60,429.90
//   AT / i37.w.1   293,558.201759   sector has NO local bound (3 of 49 regions non-zero elsewhere)
//   AT / i01.a               0      Austria grows no rice
//   p01.w.1                  0      Manure (conventional treatment), product_type 'Waste'

const BASE: SpendFactorQuery = {
  region: 'AT',
  sector_key: 'i01.b',
  factor_type: 'industry',
  reporting_currency: 'EUR',
  reporting_year: 2019,
  spend_price_basis: 'basic',
}
const q = (over: Partial<SpendFactorQuery> = {}): SpendFactorQuery => ({ ...BASE, ...over })

/** Narrow or fail loudly — a test that silently skips its assertions proves nothing. */
function asResult(r: ReturnType<typeof resolveSpendFactor>): SpendFactorResult {
  expect(r, 'expected a factor, got null').not.toBeNull()
  expect((r as any).kind, 'expected exact or fallback').not.toBe('absent')
  return r as SpendFactorResult
}

describe('resolveSpendFactor', () => {
  it('R1 exact region hit returns kind exact with full provenance', () => {
    const r = asResult(resolveSpendFactor(q()))
    expect(r.kind).toBe('exact')
    expect(r.requested_region).toBe('AT')
    expect(r.used_region, 'equal to requested on an exact result, by construction').toBe('AT')
    // The 1e6. The file holds kg CO2 eq. per MILLION EUR; a SpendFactor is per ONE currency unit.
    expect(r.factor.value).toBeCloseTo(1.81385091108, 9)
    expect(r.factor.unit).toBe('kgCO2e_per_currency_unit')
    expect(r.factor.sector_key).toBe('i01.b')
    expect(r.factor.factor_type).toBe('industry')
    expect(r.factor.currency).toBe('EUR')
    expect(r.factor.price_year).toBe(2019)
    expect(r.factor.price_basis).toBe('basic')
    expect(r.factor.source_id).toBe('exiobase_38')
    expect(r.factor.source_version).toBe('3.8.2')
    expect(r.factor.source_classification, 'the publisher\'s own code, findable in the file').toBe('i01.b')
    // Never just a number: the source travels with it, licence included.
    expect(r.source.licence).toBe('CC BY-SA 4.0')
    expect(r.source.doi).toBe('10.5281/zenodo.5589597')
    expect(String(r.source.unit_conversion), 'the 1e6 must be visible, not implied').toMatch(/1e6/)
  })

  it('R2 a clean hit reports no caveats at all', () => {
    const r = asResult(resolveSpendFactor(q()))
    expect(r.caveats).toEqual({
      currency_mismatch: false,
      price_year_mismatch: false,
      price_basis_mismatch: false,
      outside_reliability_bounds: false,
      reliability_bounds_incomplete: false,
    })
  })

  it('R3 currency mismatch is reported and nothing is converted', () => {
    const r = asResult(resolveSpendFactor(q({ reporting_currency: 'USD' })))
    expect(r.caveats.currency_mismatch).toBe(true)
    expect(r.caveats.price_year_mismatch).toBe(false)
    expect(r.caveats.price_basis_mismatch).toBe(false)
    // The value is untouched: no FX has been applied, which is the whole point of reporting it.
    expect(r.factor.value).toBeCloseTo(1.81385091108, 9)
    expect(r.factor.currency, 'still the factor\'s own currency').toBe('EUR')
  })

  it('R4 price-year mismatch is reported and nothing is deflated', () => {
    const r = asResult(resolveSpendFactor(q({ reporting_year: 2026 })))
    expect(r.caveats.price_year_mismatch).toBe(true)
    expect(r.caveats.currency_mismatch).toBe(false)
    expect(r.factor.value).toBeCloseTo(1.81385091108, 9)
    expect(r.factor.price_year).toBe(2019)
  })

  it('R5 price-basis mismatch is reported and nothing is converted', () => {
    // The live case: a customer types what they PAID, which is a purchaser-price figure, and
    // EXIOBASE publishes in basic prices.
    const r = asResult(resolveSpendFactor(q({ spend_price_basis: 'purchaser' })))
    expect(r.caveats.price_basis_mismatch).toBe(true)
    expect(r.caveats.currency_mismatch).toBe(false)
    expect(r.factor.value).toBeCloseTo(1.81385091108, 9)
    expect(r.factor.price_basis).toBe('basic')
  })

  it('R6 a value outside the bounds is flagged, not clipped', () => {
    const r = asResult(resolveSpendFactor(q({ sector_key: 'i15.d' })))
    expect(r.caveats.outside_reliability_bounds).toBe(true)
    expect(r.caveats.reliability_bounds_incomplete, 'this sector does have a local bound').toBe(false)
    // As published, divided only by 1e6.
    expect(r.factor.value).toBeCloseTo(42141.9141288 / 1e6, 12)
  })

  it('R7 a sector with no local bound is never reported as in range', () => {
    // i37.w.1 has too few non-zero regions for a p5/p95. outside===false here would mean "in
    // range", which nobody established; incomplete===true is what stops it being read that way.
    const r = asResult(resolveSpendFactor(q({ sector_key: 'i37.w.1' })))
    expect(r.caveats.reliability_bounds_incomplete, 'the local check could not be made').toBe(true)
    expect(
      r.caveats.outside_reliability_bounds === false && r.caveats.reliability_bounds_incomplete === false,
      'an unbounded sector must never present as fully checked',
    ).toBe(false)
  })

  it('R8 a zero resolves to null, not to a factor of zero', () => {
    // Austria grows no rice. 0.0 would report a purchase of Austrian rice as emissions-free.
    expect(resolveSpendFactor(q({ sector_key: 'i01.a' }))).toBeNull()
  })

  it('R9 a secondary material resolves to an absence CARRYING ITS REASON', () => {
    const r = resolveSpendFactor(q({ factor_type: 'product', sector_key: 'p01.w.1' }))
    expect(r).not.toBeNull()
    const a = r as SpendFactorAbsent
    expect(a.kind).toBe('absent')
    expect(a.reason).toBe('secondary_material_not_priced')
    expect(a.sector_key).toBe('p01.w.1')
    expect(a.requested_region).toBe('AT')
    expect(a.explanation).toMatch(/waste treatment flows/)
    expect(a.explanation, 'the caller must be told where to go instead').toMatch(/[Ss]upplier-specific/)
    // A reason must never become a value.
    expect('factor' in a, 'an absent result has no factor field').toBe(false)
  })

  it('R10 p45.w and p99 return a plain null, WITHOUT the recycled-content reason', () => {
    // Both are zero in all 49 regions like the fourteen Waste products, and both are excluded on
    // purpose. p45.w is typed TransportMargin, so the waste-treatment explanation is not true of
    // how EXIOBASE models it; p99 (Extra-territorial organizations and bodies) is a Commodity and
    // not a secondary material at all. A plausible reason that does not describe the actual
    // modelling is worse than no reason.
    for (const code of ['p45.w', 'p99']) {
      const r = resolveSpendFactor(q({ factor_type: 'product', sector_key: code }))
      expect(r, `${code} must resolve to a plain null`).toBeNull()
    }
  })

  it('R11 an unknown code resolves to null', () => {
    expect(resolveSpendFactor(q({ sector_key: 'i99.made.up' }))).toBeNull()
    expect(resolveSpendFactor(q({ factor_type: 'product', sector_key: 'i01.b' })),
      'an industry code queried as a product must not resolve').toBeNull()
  })

  it('R12 an uncovered region with NO fallback_regions returns null, not a substitution', () => {
    // EXIOBASE covers 44 countries plus 5 rest-of-world regions. New Zealand is not one of them.
    expect(resolveSpendFactor(q({ region: 'NZ' })), 'no fallback was asked for').toBeNull()
    expect(resolveSpendFactor(q({ region: 'NZ', fallback_regions: [] }))).toBeNull()
  })

  it('R13 an uncovered region WITH fallback_regions returns kind fallback and a disclosure', () => {
    const r = asResult(resolveSpendFactor(q({ region: 'NZ', fallback_regions: ['WA', 'AT'] })))
    expect(r.kind).toBe('fallback')
    if (r.kind !== 'fallback') throw new Error('unreachable')
    expect(r.requested_region).toBe('NZ')
    expect(r.used_region, 'the first fallback that carries a factor').toBe('WA')
    expect(r.used_region, 'never equal to the requested region').not.toBe(r.requested_region)
    expect(r.reason).toBe('no_factor_for_region')
    expect(r.disclosure).toContain('NZ')
    expect(r.disclosure).toContain('WA')
    expect(r.disclosure, 'the customer must be told it is a substitution').toMatch(/substitution/)
  })

  it('R14 fallback order is honoured and the requested region is skipped', () => {
    const r = asResult(resolveSpendFactor(q({ region: 'NZ', fallback_regions: ['AT', 'WA'] })))
    if (r.kind !== 'fallback') throw new Error('expected fallback')
    expect(r.used_region).toBe('AT')
    // A fallback list that names the requested region must not produce used_region === requested.
    const self = resolveSpendFactor(q({ region: 'NZ', fallback_regions: ['NZ'] }))
    expect(self, 'NZ has no factor; naming it as its own fallback changes nothing').toBeNull()
  })

  it('R15 a fallback that is ALSO outside the bounds says both things', () => {
    const r = resolveSpendFactor(q({ region: 'NZ', sector_key: 'i15.d', fallback_regions: ['AT'] }))
    const f = asResult(r)
    if (f.kind !== 'fallback') throw new Error('expected fallback')
    expect(f.caveats.outside_reliability_bounds).toBe(true)
    expect(f.disclosure, 'the substitution').toMatch(/NZ/)
    expect(f.disclosure, 'and the tail, named separately').toMatch(/outside the reliability bounds/)
  })

  it('R16 product factors resolve on their own code space', () => {
    const r = asResult(resolveSpendFactor(q({ factor_type: 'product', sector_key: 'p01.b' })))
    expect(r.factor.factor_type).toBe('product')
    expect(r.factor.sector_key).toBe('p01.b')
    expect(r.factor.currency).toBe('EUR')
    expect(r.factor.price_basis).toBe('basic')
  })
})
