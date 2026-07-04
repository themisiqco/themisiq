// lib/deals/assessment.test.ts
// getObligations — per-obligation consultant scaling (location × sector), PCAF→financed
// promotion, and the not-summed FLAG caveat. Exact rounded numbers (Math.round(x/1000)*1000).
import { describe, it, expect } from 'vitest'
import { getObligations, CONSULTANT_RANGES, SUPPLY_CHAIN_TRIGGERS } from './assessment'
import { GHG_TIERS } from '../pricing'

const labels = (arr: { label: string }[]) => arr.map(o => o.label)
const STARTER = GHG_TIERS.starter.priceUSD // 4900

describe('getObligations — consultant scaling', () => {
  it('base: 3 locations, non-heavy sector, GHG only → unscaled 15k–30k', () => {
    const o = getObligations(3, [], 'Technology')
    expect(o.included).toHaveLength(1)
    expect(o.consultantLow).toBe(15000)
    expect(o.consultantHigh).toBe(30000)
  })

  it('location scaling: 10 locations (×1.5), non-heavy → low 22500→23000, high 45000', () => {
    const o = getObligations(10, [], 'Technology')
    // 15000×1.5=22500 → Math.round(22.5)=23 → 23000 ; 30000×1.5=45000 → 45000
    expect(o.consultantLow).toBe(23000)
    expect(o.consultantHigh).toBe(45000)
  })

  it('sector scaling hits GHG only: 3 loc, Mining & Metals (×1.25) → 18750→19000, 37500→38000', () => {
    const o = getObligations(3, [], 'Mining & Metals')
    expect(o.consultantLow).toBe(19000)  // Math.round(18.75)=19
    expect(o.consultantHigh).toBe(38000) // Math.round(37.5)=38
  })

  it('combined: 16 loc (×2.0) + heavy (×1.25) on GHG → 37500→38000, 75000', () => {
    const o = getObligations(16, [], 'Mining & Metals')
    // 15000×2.5=37500 → 38000 ; 30000×2.5=75000 → 75000
    expect(o.consultantLow).toBe(38000)
    expect(o.consultantHigh).toBe(75000)
  })
})

describe('getObligations — PCAF → financed emissions (Option C)', () => {
  it('financed line is UNSCALED while GHG scales (per-obligation ordering)', () => {
    // 16 loc → GHG ×2.0 (FS not heavy → sector ×1.0); financed ignores both.
    const o = getObligations(16, ['IFRS S2', 'TCFD', 'PCAF'], 'Financial Services')
    const ghg = o.included.find(x => x.short === 'GHG')!
    const fin = o.included.find(x => x.short === 'financed emissions')!
    expect(ghg.consultantLow).toBe(30000)   // 15000×2.0
    expect(ghg.consultantHigh).toBe(60000)  // 30000×2.0
    expect(fin.consultantLow).toBe(12000)   // unscaled
    expect(fin.consultantHigh).toBe(20000)  // unscaled
    expect(fin.themisIqPrice).toBe(0)
    expect(fin.scopeNote).toMatch(/GHG module/)
  })

  it('FS deal: included has financed line, NOT supply chain (unless a real value-chain fw present)', () => {
    const o = getObligations(3, ['IFRS S2', 'TCFD', 'PCAF'], 'Financial Services')
    expect(labels(o.included)).toContain('Financed emissions (PCAF, Scope 3 Cat.15)')
    expect(labels(o.included)).not.toContain('Supply chain / Scope 3')
  })

  it('PCAF alone no longer triggers supply chain (removed from SUPPLY_CHAIN_TRIGGERS)', () => {
    expect(SUPPLY_CHAIN_TRIGGERS).not.toContain('PCAF')
    const o = getObligations(3, ['PCAF'], 'Financial Services')
    expect(labels(o.included)).not.toContain('Supply chain / Scope 3')
  })

  it('a genuine value-chain framework (CSRD) still adds the supply-chain line alongside financed', () => {
    const o = getObligations(3, ['CSRD', 'PCAF'], 'Financial Services')
    expect(labels(o.included)).toContain('Supply chain / Scope 3')
    expect(labels(o.included)).toContain('Financed emissions (PCAF, Scope 3 Cat.15)')
  })

  it('themisIqTotal is UNCHANGED by the 0-priced financed line; consultant GAINS its range', () => {
    const withPcaf = getObligations(3, ['IFRS S2', 'TCFD', 'PCAF'], 'Financial Services')
    const noPcaf = getObligations(3, ['IFRS S2', 'TCFD'], 'Financial Services')
    // 0 is a real (free) price: kept by the filter, adds nothing, does not set hasCustom.
    expect(withPcaf.themisIqTotal).toBe(STARTER)
    expect(noPcaf.themisIqTotal).toBe(STARTER)
    expect(withPcaf.themisIqHasCustom).toBe(false)
    // consultant total gains exactly the financedEmissions low (12000) on top of GHG (15000).
    expect(noPcaf.consultantLow).toBe(15000)
    expect(withPcaf.consultantLow).toBe(15000 + CONSULTANT_RANGES.financedEmissions.low) // 27000
  })
})

describe('getObligations — Agriculture FLAG caveat (summed into neither figure)', () => {
  it('Agriculture & Food → flagged caveat present, not in consultant or ThemisIQ totals', () => {
    const o = getObligations(3, [], 'Agriculture & Food')
    expect(o.flagged).toHaveLength(1)
    expect(o.flagged[0].label).toBe('Land-sector (FLAG) emissions')
    expect(o.flagged[0].themisIqPrice).toBeNull()
    expect(o.flagged[0].scopeNote).toMatch(/separate specialist/)
    // GHG scales by sector (Agriculture is heavy, ×1.25) → 19000; FLAG adds nothing.
    expect(o.consultantLow).toBe(19000)
    expect(o.consultantHigh).toBe(38000)
    expect(o.themisIqTotal).toBe(STARTER) // FLAG's null price is not in `included`, so no effect
  })

  it('non-Agriculture sector → no flagged caveat', () => {
    expect(getObligations(3, [], 'Technology').flagged).toHaveLength(0)
  })
})
