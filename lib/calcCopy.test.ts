import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GHG_FREE_USE_SENTENCE } from './pricingCopy'
import { calcInventory, emptyLocation, type Location } from './ghg/engine'

// /calculate-emissions copy (calc-copy, Oct 2026): the GHG Protocol's "Scope 1, Scope 2 and Scope 3" form in
// prose, the five steps held to what the product does, and the emailed-results wording that LEAD1 makes true.
const PAGE = readFileSync(join(__dirname, '..', 'app/calculate-emissions/page.tsx'), 'utf8')

describe('/calculate-emissions copy', () => {
  it('CC1: prose uses the GHG Protocol form; only the calculator chip keeps "Scope 1 + 2"', () => {
    expect(PAGE).not.toMatch(/Scope 1 (&amp;|&|and) 2\b|Scope 1, 2 (&amp;|&|and) 3/)
    expect(PAGE.match(/Scope 1 \+ 2/g) ?? []).toHaveLength(1)
    expect(PAGE).toContain('a defensible Scope 1, Scope 2 and Scope 3')
  })

  it('CC2: the five steps make no claim the product does not keep', () => {
    for (const retired of ['no sales call', 'submittable', 'ready to <strong>submit', 'Missing any documents', '~535']) {
      expect(PAGE, retired).not.toContain(retired)
    }
    expect(PAGE).toContain('we&rsquo;ll send your results to you directly')
  })

  it('CC3: the example figure is the engine figure for the stated inputs', () => {
    const site = { ...emptyLocation('example', 'Example site'), country: 'US', grid_region: 'US_AVG', electricity_kwh: 1_200_000, has_natural_gas: true, natural_gas_amount: 8_500, natural_gas_unit: 'therms' } as Location
    const t = calcInventory([site], 'AR6')
    expect(Math.round(t.s1_total + t.s2_location)).toBe(465)
    expect(PAGE).toContain('~{EXAMPLE_T.toLocaleString')
    expect(PAGE).toContain('one site on the US average grid')
  })

  it('CC4: free use says the results are emailed, in the form the ruling gave', () => {
    expect(GHG_FREE_USE_SENTENCE).toBe('Scope 1 and Scope 2 can be calculated free, in your browser, without an account, with your results emailed to you directly.')
    expect(PAGE).toContain('your results will be emailed to you directly. Nothing is saved in ThemisIQ until you have a GHG plan.')
  })
})
