import { describe, it, expect } from 'vitest'
import { resolveSpendFactor, type SpendFactorAbsent } from './spendResolver.server'
import { intensityPositionSentences, ordinal, type SpendFactorQuery, type SpendFactorResult } from './spend'
import ixiFile from './exiobaseFactors2019ixi.json'
import pxpFile from './exiobaseFactors2019pxp.json'

// THE RESOLVER'S JOB IS TO REFUSE WELL, NOT ONLY TO ANSWER.
//
// Most of this file is about the cases where there is no number: a zero that must not become 0.0, a
// region EXIOBASE does not cover, a sector too thinly populated to rank a region within, a secondary
// material the model never prices. lib/emissionFactors.ts answers every one of those with
// DEFAULT_SPEND_EF = 0.5, which is why this module exists.
//
// Fixtures are real rows, chosen from the extract and named here so a data change fails visibly
// rather than silently re-pointing a test at a different row.
//   AT / i01.b   1,813,850.91108   within both: 28th lowest of the 48 non-zero regions -> 1.81385091108 per EUR
//   AT / i15.d      42,141.9141288 below the global p3 of 60,429.90 AND 3rd lowest of 49 in its sector
//   AT / i37.w.1   293,558.201759   sector NOT ASSESSED: 19 of 49 regions non-zero, under the 20 needed
//   DE / i28       243,209.898938   3rd lowest of 49 for its sector, 0.12% under p5; globally within
//   CH / i28       243,956.368618   4th lowest of 49, inside p5 — 0.3% above Germany
//   IN / i28     2,348,330.26945    the highest of 49 for its sector; globally within
//   JP / i11.b  43,190,680.0283     above the global p97 of 43,080,559; 5th highest of 41, within its sector
//   AT / i01.m     103,221.176496   2nd lowest of the 47 regions with a non-zero factor
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
      intensity_among_all_factors: { position: 'within', lower_percentile: 3, upper_percentile: 97 },
      intensity_within_sector: {
        assessed: true, position: 'within', lower_percentile: 5, upper_percentile: 95,
        rank_from_lowest: 28, rank_from_highest: 21, regions_ranked: 48, regions_in_dataset: 49,
      },
    })
    expect(intensityPositionSentences(r.caveats, 'industry'), 'a middle position says nothing').toEqual([])
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

  it('R6 a value at a global extreme is reported with its position, not clipped', () => {
    const r = asResult(resolveSpendFactor(q({ sector_key: 'i15.d' })))
    expect(r.caveats.intensity_among_all_factors.position).toBe('below')
    expect(r.caveats.intensity_within_sector).toMatchObject({ assessed: true, position: 'below', rank_from_lowest: 3, regions_ranked: 49 })
    // As published, divided only by 1e6.
    expect(r.factor.value).toBeCloseTo(42141.9141288 / 1e6, 12)
  })

  it('R7 a sector too thin to rank within is NOT ASSESSED, never "within"', () => {
    // i37.w.1 has 19 non-zero regions, under the 20 a p5/p95 needs. A 'within' here would claim a
    // middle position nobody established; assessed:false is what stops it being read that way.
    const r = asResult(resolveSpendFactor(q({ sector_key: 'i37.w.1' })))
    expect(r.caveats.intensity_within_sector).toEqual({
      assessed: false, regions_with_factor: 19, minimum_regions: 20, regions_in_dataset: 49,
    })
    expect(r.caveats.intensity_among_all_factors.position, 'the global test still applies').toBe('within')
    expect(intensityPositionSentences(r.caveats, 'industry')).toEqual([
      'Only 19 of 49 regions have a non-zero emission factor for this sector, fewer than the 20 needed to ' +
      'place one region within it, so this factor\'s position within the sector was not assessed.',
    ])
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
    expect(f.caveats.intensity_among_all_factors.position).toBe('below')
    expect(f.disclosure, 'the substitution').toMatch(/NZ/)
    expect(f.disclosure, 'and the global extreme, named separately').toContain(
      'This emission factor is in the lowest 3% of all industry factors in the source data.')
    expect(f.disclosure, 'and the rank within the sector').toContain(
      'This region has the 3rd lowest emission factor of 49 regions for this sector.')
    expect(f.disclosure).not.toMatch(/reliab/i)
  })

  it('R16 product factors resolve on their own code space', () => {
    const r = asResult(resolveSpendFactor(q({ factor_type: 'product', sector_key: 'p01.b' })))
    expect(r.factor.factor_type).toBe('product')
    expect(r.factor.sector_key).toBe('p01.b')
    expect(r.factor.currency).toBe('EUR')
    expect(r.factor.price_basis).toBe('basic')
  })
})

// ── POSITION, NOT RELIABILITY ────────────────────────────────────────────────────────────────────
//
// The per-sector test is a RANK test: with 49 regions it puts the lowest three and highest three of
// every fully populated sector outside p5/p95 whatever their values. These tests pin that a
// within-sector position is stated as a rank, a global extreme as a caution, and that nothing is
// called reliability, confidence or quality.

describe('intensity position', () => {
  const industry = (region: string, sector_key: string) =>
    asResult(resolveSpendFactor(q({ region, sector_key })))

  it('P1 Germany i28 is the 3rd lowest of 49 for its sector — a FACT, not a caution', () => {
    const r = industry('DE', 'i28')
    expect(r.caveats.intensity_among_all_factors.position).toBe('within')
    expect(r.caveats.intensity_within_sector).toEqual({
      assessed: true, position: 'below', lower_percentile: 5, upper_percentile: 95,
      rank_from_lowest: 3, rank_from_highest: 47, regions_ranked: 49, regions_in_dataset: 49,
    })
    expect(intensityPositionSentences(r.caveats, 'industry')).toEqual([
      'This region has the 3rd lowest emission factor of 49 regions for this sector.',
    ])
  })

  it('P2 Switzerland i28, 0.3% above Germany, is 4th lowest and inside — so says nothing', () => {
    const r = industry('CH', 'i28')
    expect(r.caveats.intensity_within_sector).toMatchObject({ position: 'within', rank_from_lowest: 4 })
    expect(intensityPositionSentences(r.caveats, 'industry')).toEqual([])
  })

  it('P3 the top of a sector is a fact with the count below it', () => {
    const r = industry('IN', 'i28')
    expect(r.caveats.intensity_within_sector).toMatchObject({ position: 'above', rank_from_highest: 1, rank_from_lowest: 49 })
    expect(intensityPositionSentences(r.caveats, 'industry')).toEqual([
      'This region has the highest emission factor of 49 regions for this sector: 48 regions have a lower one.',
    ])
  })

  it('P4 a global extreme is a caution, and can sit inside its own sector', () => {
    const r = industry('JP', 'i11.b')
    expect(r.caveats.intensity_among_all_factors.position).toBe('above')
    expect(r.caveats.intensity_within_sector).toMatchObject({ assessed: true, position: 'within', rank_from_highest: 5, regions_ranked: 41 })
    expect(intensityPositionSentences(r.caveats, 'industry')).toEqual([
      'This emission factor is in the highest 3% of all industry factors in the source data. It was used ' +
      'as published; a value at either extreme of the source data should be checked against what is ' +
      'known about the supplier before it is relied on.',
    ])
  })

  it('P5 a global low extreme that is also at the bottom of its sector says both', () => {
    expect(intensityPositionSentences(industry('AT', 'i15.d').caveats, 'industry')).toEqual([
      'This emission factor is in the lowest 3% of all industry factors in the source data. It was used ' +
      'as published; a value at either extreme of the source data should be checked against what is ' +
      'known about the supplier before it is relied on.',
      'This region has the 3rd lowest emission factor of 49 regions for this sector.',
    ])
  })

  it('P6 a rank over fewer than every region names the population it was taken over', () => {
    expect(intensityPositionSentences(industry('AT', 'i01.m').caveats, 'industry')).toEqual([
      'This region has the 2nd lowest emission factor of the 47 regions with a non-zero factor for this sector.',
    ])
  })

  it('P7 the rank is computed from the data, independently of the percentile', () => {
    // Recount i28 directly from the file and compare with what the resolver reports for every region.
    const i28 = (ixiFile.factors as { region: string; exio_code: string; value: number }[])
      .filter(f => f.exio_code === 'i28' && f.value !== 0)
    for (const f of i28) {
      const r = industry(f.region, 'i28')
      const s = r.caveats.intensity_within_sector
      if (!s.assessed) throw new Error('i28 is assessed')
      expect(s.rank_from_lowest, f.region).toBe(i28.filter(g => g.value < f.value).length + 1)
      expect(s.rank_from_highest, f.region).toBe(i28.filter(g => g.value > f.value).length + 1)
    }
    // And the rank test itself: exactly three below p5 and three above p95 in a fully populated sector.
    const positions = i28.map(f => (industry(f.region, 'i28').caveats.intensity_within_sector as { position: string }).position)
    expect(positions.filter(p => p === 'below')).toHaveLength(3)
    expect(positions.filter(p => p === 'above')).toHaveLength(3)
  })

  it('P8 ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112].map(ordinal))
      .toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '112th'])
  })

  it('P9 no caveat or metadata KEY names reliability, confidence or quality', () => {
    // Keys only. The prose that explains the rename necessarily uses the word.
    const banned = /reliab|confiden|quality/i
    const keys = (o: unknown, path = ''): string[] =>
      o && typeof o === 'object' && !Array.isArray(o)
        ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
            k === 'bounds' ? [`${path}.${k}`] : [`${path}.${k}`, ...keys(v, `${path}.${k}`)])
        : []
    const found = [
      ...keys(asResult(resolveSpendFactor(q())).caveats, 'caveats'),
      ...keys(ixiFile.metadata, 'ixi.metadata'),
      ...keys(pxpFile.metadata, 'pxp.metadata'),
    ].filter(k => banned.test(k))
    expect(found).toEqual([])
  })
})
