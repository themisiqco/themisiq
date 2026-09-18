import { describe, it, expect } from 'vitest'
import { cat15Figure, assessableEmissions, CAT15_NO_BASIS, type Cat15Data } from './cat15'
import type { PcafPortfolioAsset } from '../pcaf/types'

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
      emissions: { revenue: 100_000_000, sector: 'i66' },
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

  it('C15-7 a zero-emissions investee is a figure of 0, not a missing one', () => {
    const f = cat15Figure({ pcafAssets: [reported('a', 1_000_000, 10_000_000, 0)] })
    expect(f.mt).toBe(0)
    expect(f.basis).toBe('decomposed')
  })
})
