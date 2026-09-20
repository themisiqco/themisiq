import { describe, it, expect } from 'vitest'
import {
  cat15Figure, assessableEmissions, CAT15_NO_BASIS, CAT15_SENTENCES, CAT15_HOLDING_FIELDS, holdingComputes, holdingMissing,
  holdingUnusable, cat15HoldingIncomplete, assessHolding, cat15OverrideEntered, type Cat15Data, type StoredHolding,
} from './cat15'
import type { PcafPortfolioAsset, EmissionInputs } from '../pcaf/types'

const reported = (id: string, over = 1_000_000, denom = 10_000_000, mt = 50_000): PcafPortfolioAsset => ({
  id,
  assetClass: 'listed_equity_corp_bonds',
  outstandingAmount: over,
  denominator: denom,
  emissions: { reportedEmissions: mt, verified: true },
})

describe('Category 15: what produces a figure', () => {
  it('C15-1 ⚠️ a portfolio value and a sector produce NOTHING, and say why', () => {
    // The withdrawn proxy. A balance at a date times an intensity per year of activity is not a quantity,
    // and no factor repairs it — which is why the EXIOBASE route was designed for this and then dropped.
    const d: Cat15Data = { portfolio_value: 10_000_000, portfolio_sector: 'i66' }
    const f = cat15Figure(d)
    expect(f.mt).toBeNull()
    expect(f.basis).toBeNull()
    expect(f.reason).toBe(CAT15_NO_BASIS)
    // The shared long sentence (CAT15_SENTENCES.noPortfolioProxyLong): the reason, not only the refusal.
    expect(f.reason).toContain('does not measure emissions')
    expect(f.reason).toContain('a position at a date')
    expect(cat15Figure(undefined).mt).toBeNull()
  })

  it('C15-2 ⚠️ an entered zero is an answer; blank is not', () => {
    // A customer with no portfolio must be able to say so. Truthiness could not tell 0 from unset and
    // silently substituted the proxy for both.
    expect(cat15Figure({ emissions_override: 0 })).toMatchObject({ mt: 0, basis: 'override', dqScore: 2 })
    expect(cat15Figure({ emissions_override: 8_500 })).toMatchObject({ mt: 8_500, basis: 'override', dqScore: 2 })
    expect(cat15Figure({}).mt).toBeNull()
    // A negative is neither: it is refused with a sentence that names the zero case.
    const neg = cat15Figure({ emissions_override: -1 })
    expect(neg.mt).toBeNull()
    expect(neg.reason).toContain('Enter 0')
  })

  it('C15-3 an entered figure wins over an assessment, and is scored PCAF 2', () => {
    const f = cat15Figure({ emissions_override: 100, pcafAssets: [reported('a')] })
    expect(f).toMatchObject({ mt: 100, basis: 'override', dqScore: 2, assessment: null })
  })

  it('C15-4 a complete per-asset assessment is the figure, attributed by share', () => {
    // 1m of 10m = 10% of 50,000 = 5,000. Two holdings sum, and the score is emissions-weighted.
    const f = cat15Figure({ pcafAssets: [reported('a'), reported('b', 2_000_000, 20_000_000, 50_000)] })
    expect(f.basis).toBe('decomposed')
    expect(f.mt).toBe(10_000)
    expect(f.dqScore).toBe(1)
    expect(f.assessment?.mode).toBe('decomposed')
    expect(f.assessment?.perAsset).toHaveLength(2)
    expect(f.reason).toBe('')
  })

  it('C15-5 ⚠️ the revenue tier is closed in the CALCULATION, not the display', () => {
    // A holding with revenue and an EXIOBASE sector used to be estimated at the 0.12 fallback and included
    // in the portfolio total, while the panel hid the row's own figure. It is now incomplete, which is what
    // it is. 1,200 tCO2e is the number that used to appear; it must not come back.
    const revenueOnly: PcafPortfolioAsset = {
      id: 'r', assetClass: 'business_loans_unlisted_equity', outstandingAmount: 1_000_000, denominator: 10_000_000,
      // A row saved before 17 Sep 2026: EmissionInputs no longer has these fields (19 Sep 2026), so the cast.
      emissions: { revenue: 100_000_000, sector: 'i66' } as unknown as EmissionInputs,
    }
    const f = cat15Figure({ pcafAssets: [revenueOnly] })
    expect(f.mt).toBeNull()
    expect(f.incomplete).toEqual([1])
    // Even alongside a good holding: no partial total.
    const mixed = cat15Figure({ pcafAssets: [reported('a'), revenueOnly] })
    expect(mixed.mt).toBeNull()
    expect(mixed.mt).not.toBe(6_200)
    expect(mixed.incomplete).toEqual([2])
    expect(assessableEmissions(revenueOnly.emissions)).toEqual({
      reportedEmissions: undefined, verified: undefined, physicalActivity: undefined, physicalEmissionFactor: undefined,
    })
  })

  it('C15-6 ⚠️ one incomplete holding withholds the whole figure and names the holding', () => {
    // resolvePcafResult substituted the lumped proxy for the entire portfolio in this case.
    const bad = { ...reported('b'), denominator: 0 }
    const f = cat15Figure({ pcafAssets: [reported('a'), bad, { ...reported('c'), emissions: {} }] })
    expect(f.mt).toBeNull()
    expect(f.incomplete).toEqual([2, 3])
    expect(f.reason).toContain('Holdings 2 and 3')
    expect(f.reason).toContain('no figure')
    // Numbered as the panel numbers them, so a lone bad row is Holding 1 and the singular reads right.
    expect(cat15Figure({ pcafAssets: [bad] }).reason).toContain('Holding 1 cannot')
  })

  it('C15-6b ⚠️ a blank outstanding amount withholds the figure and is named; an entered 0 is an answer', () => {
    // Until 19 Sep 2026 a blank amount was stored as 0 and computed to zero financed emissions, so the
    // category figure went out without the holding. The input now stores undefined for blank.
    const blank: StoredHolding = { ...reported('b'), outstandingAmount: undefined }
    const f = cat15Figure({ pcafAssets: [reported('a'), blank] })
    expect(f.mt).toBeNull()
    expect(f.incomplete).toEqual([2])
    expect(f.reason).toContain(CAT15_SENTENCES.withholdsShort)
    expect(holdingMissing(blank)).toEqual([CAT15_HOLDING_FIELDS.outstanding])
    expect(cat15HoldingIncomplete(blank)).toBe('Complete this holding to compute: it needs the outstanding amount.')
    // NaN (a stray non-number) is missing too, never a figure.
    expect(holdingComputes({ ...reported('n'), outstandingAmount: NaN })).toBe(false)
    // An entered 0 is a closed position: it computes, at 0, and the figure stands.
    const zero = cat15Figure({ pcafAssets: [reported('a'), reported('z', 0)] })
    expect(zero).toMatchObject({ mt: 5_000, basis: 'decomposed', incomplete: [] })
    expect(assessHolding(reported('z', 0))?.financedEmissions).toBe(0)
  })

  it('C15-6c the per-holding line names exactly what the calculation lacks, over a grid', () => {
    const emissionsCases: EmissionInputs[] = [
      { reportedEmissions: 10 }, { reportedEmissions: 0 }, { reportedEmissions: -1 }, {},
      { physicalActivity: 10, physicalEmissionFactor: 0.5 }, { physicalActivity: 10 }, { physicalActivity: -1, physicalEmissionFactor: 1 },
      { reportedEmissions: -1, physicalActivity: 10, physicalEmissionFactor: 0.5 },
    ]
    const amounts = [undefined, NaN, -1, 0, 5]
    const denominators = [NaN, -1, 0, 10]
    let n = 0
    for (const emissions of emissionsCases) for (const outstandingAmount of amounts) for (const denominator of denominators) {
      const h: StoredHolding = { id: 'g', assetClass: 'mortgages', outstandingAmount, denominator, emissions }
      const label = JSON.stringify({ emissions, outstandingAmount, denominator })
      expect(holdingMissing(h).length + holdingUnusable(h).length === 0, label).toBe(holdingComputes(h))
      // A field is either absent or unusable, never both: "it needs" is said only of a blank field.
      expect(holdingMissing(h).filter(f => holdingUnusable(h).some(u => u.startsWith(f))), label).toEqual([])
      n++
    }
    expect(n).toBe(160)
    // All three missing read as a list.
    const none: StoredHolding = { id: 't', assetClass: 'mortgages', denominator: 0, emissions: {} }
    expect(cat15HoldingIncomplete(none)).toBe(
      "Complete this holding to compute: it needs the investee's emissions, the outstanding amount and the attribution value.")
  })

  it('C15-6d ⚠️ a negative amount is not a blank: the line says it cannot be negative, and names the field', () => {
    // "It needs the outstanding amount" of a holding that HAS one, entered as -1, sends the customer looking
    // for something already on screen. The known-total refusal names its field the same way.
    const neg: StoredHolding = { ...reported('n'), outstandingAmount: -1 }
    expect(holdingComputes(neg)).toBe(false)
    expect(holdingMissing(neg)).toEqual([])
    expect(holdingUnusable(neg)).toEqual(['the outstanding amount cannot be negative'])
    expect(cat15HoldingIncomplete(neg)).toBe('This holding cannot be computed: the outstanding amount cannot be negative.')
    // The other two fields, and a negative alongside a blank: both are said, and neither is said twice.
    expect(cat15HoldingIncomplete({ ...reported('e'), emissions: { reportedEmissions: -5 } }))
      .toBe("This holding cannot be computed: the investee's emissions cannot be negative.")
    expect(cat15HoldingIncomplete({ ...reported('d'), denominator: -10 }))
      .toBe('This holding cannot be computed: the attribution value cannot be negative.')
    expect(cat15HoldingIncomplete({ ...reported('b'), outstandingAmount: -1, emissions: {} }))
      .toBe("This holding cannot be computed: the outstanding amount cannot be negative. It also needs the investee's emissions.")
    // A physical-activity holding, the other estimation tier.
    expect(holdingUnusable({ ...reported('p'), emissions: { physicalActivity: -1, physicalEmissionFactor: 1 } }))
      .toEqual(["the investee's emissions cannot be negative"])
    // The whole category still withholds, and the figure-level reason is unchanged.
    expect(cat15Figure({ pcafAssets: [reported('a'), neg] })).toMatchObject({ mt: null, incomplete: [2] })
  })

  it('C15-3b the panel\'s superseded note asks the question the figure asks', () => {
    for (const v of [0, 100, -1, undefined, NaN]) {
      const d: Cat15Data = { emissions_override: v, pcafAssets: [reported('a')] }
      // Any finite entry means the holdings are not the figure: the override, or its refusal when negative.
      expect(cat15OverrideEntered(d), String(v)).toBe(cat15Figure(d).basis !== 'decomposed')
    }
  })

  it('C15-7 a zero-emissions investee is a figure of 0, not a missing one', () => {
    const f = cat15Figure({ pcafAssets: [reported('a', 1_000_000, 10_000_000, 0)] })
    expect(f.mt).toBe(0)
    expect(f.basis).toBe('decomposed')
  })
})
