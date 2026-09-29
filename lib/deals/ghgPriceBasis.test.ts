import { describe, it, expect } from 'vitest'
import { getObligations, ghgPriceBasis, ghgPriceBasisNote, ghgOrderTier } from './assessment'
import { GHG_TIERS } from '../pricing'
import { buildDealReportModel } from './reportModel'
import { NEAR_THRESHOLD_DEAL, FIXTURE_GENERATED_AT } from './reportModel.fixtures'

// The GHG band on a deal: headcount first, through ghgTierForEmployees, and the site-count rule only
// when there is no usable headcount. Asserted against GHG_TIERS rather than literal prices, so a
// reprice moves these tests with it; the bands themselves are what is pinned.

const ghg = (employees: number | null, sites: number) =>
  getObligations(sites, [], 'Technology', employees).included.find(o => o.short === 'GHG')!

describe('GHG band from headcount', () => {
  it.each([
    [15, 'starter', 'Essentials'],
    [20, 'professional', 'Professional'],
    [150, 'business', 'Business'],
  ] as const)('%i employees prices the %s band', (employees, tier, label) => {
    const o = ghg(employees, 2)
    expect(o.pricing).toEqual({ kind: 'priced', priceUSD: GHG_TIERS[tier].priceUSD })
    expect(o.scopeNote).toBe(`Priced on ${employees} employees (${label} band).`)
  })

  it('600 employees is Enterprise, which is a quote, not a figure', () => {
    const o = getObligations(2, [], 'Technology', 600)
    expect(o.included[0].pricing).toEqual({ kind: 'quote' })
    expect(o.themisIqTotal).toBeNull()
    expect(o.themisIqHasCustom).toBe(true)
    expect(o.included[0].scopeNote).toBe('Priced on 600 employees (Enterprise band).')
  })

  it('headcount wins over sites: 150 employees on 2 sites is Business, not the 2-site Essentials', () => {
    expect(ghg(150, 2).pricing).toEqual({ kind: 'priced', priceUSD: GHG_TIERS.business.priceUSD })
  })

  it('a headcount with no location count is still priced, and does not prompt for one', () => {
    const o = getObligations(0, [], 'Technology', 20)
    expect(o.locationUnset).toBe(false)
    expect(o.themisIqTotal).toBe(GHG_TIERS.professional.priceUSD)
  })
})

describe('GHG band falls back to sites when headcount is blank', () => {
  it('blank headcount on 2 sites prices Essentials and says why', () => {
    const o = ghg(null, 2)
    expect(o.pricing).toEqual({ kind: 'priced', priceUSD: GHG_TIERS.starter.priceUSD })
    expect(o.scopeNote).toBe('Priced on 2 sites; headcount not provided.')
  })

  it('blank headcount keeps the old site thresholds: 10 sites Professional, 20 sites a quote', () => {
    expect(ghg(null, 10).pricing).toEqual({ kind: 'priced', priceUSD: GHG_TIERS.professional.priceUSD })
    expect(ghg(null, 20).pricing).toEqual({ kind: 'quote' })
    expect(ghg(null, 1).scopeNote).toBe('Priced on 1 site; headcount not provided.')
  })

  it('a declared headcount of 0 cannot set a band, so sites decide, and the note says so', () => {
    const o = ghg(0, 2)
    expect(o.pricing).toEqual({ kind: 'priced', priceUSD: GHG_TIERS.starter.priceUSD })
    expect(o.scopeNote).toBe('Priced on 2 sites; a headcount of 0 cannot set a plan band.')
  })

  it('with neither, nothing is priced and the figure is withheld', () => {
    const o = getObligations(0, [], 'Technology', null)
    expect(o.locationUnset).toBe(true)
    expect(o.included[0].pricing).toEqual({ kind: 'quote' })
    expect(o.included[0].scopeNote).toBe('Not priced: neither headcount nor location count was provided.')
  })
})

describe('the /order tier agrees with the priced band', () => {
  it.each([
    [15, 2, 'starter'],
    [150, 2, 'business'],
    [600, 2, 'enterprise'],     // quote on the report, quote plan on /order
    [null, 2, 'starter'],
    [null, 10, 'professional'],
    [null, 20, 'enterprise'],   // was 'advisory' at $4,550 on the share page while the card said quote
    [null, 0, 'starter'],       // no basis: /order's own default, unchanged
  ] as const)('%s employees, %i sites -> %s', (employees, sites, tier) => {
    expect(ghgOrderTier(ghgPriceBasis(employees, sites))).toBe(tier)
  })
})

describe('the report says which basis priced it', () => {
  it('the near-threshold fixture, 240 employees on 8 sites, is priced on its headcount', () => {
    const m = buildDealReportModel(NEAR_THRESHOLD_DEAL, FIXTURE_GENERATED_AT)
    const row = m.cost.included.rows.find(r => r.label === 'GHG inventory & Scope 3')!
    expect(row.scopeNote).toBe('Priced on 240 employees (Business band).')
    expect(row.themisIq).toContain(GHG_TIERS.business.priceUSD!.toLocaleString())
  })

  it('the note is the same sentence ghgPriceBasisNote gives, not a second wording', () => {
    expect(ghgPriceBasisNote(ghgPriceBasis(240, 8))).toBe('Priced on 240 employees (Business band).')
  })
})
