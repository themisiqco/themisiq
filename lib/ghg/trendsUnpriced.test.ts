// lib/ghg/trendsUnpriced.test.ts
//
// FI1 diff 2: the trends wording for a year that is only PARTLY unpriced. Since FI1 a missing factor leaves out one
// line, not the location, so a year must never read as a location that "can no longer be worked out" when only
// some of its lines are not priced. Built from real buildWorkings rows, so the marker is the one a save writes.

import { describe, it, expect, vi } from 'vitest'

// loadSeries creates the Supabase client at import; nothing here queries, so the client is a stub.
vi.mock('../supabase', () => ({ supabase: {} }))

import { assessCompleteness } from './loadSeries'
import { describeYearStatus, type SeriesYear } from './series'
import { buildWorkings, emptyLocation, type Location } from './engine'

const mill = (): Location => ({ ...emptyLocation('m1', 'Mill'), country: 'US', grid_region: 'US_CA', electricity_kwh: 50_000,
  has_natural_gas: true, natural_gas_amount: 1200, natural_gas_unit: 'm3' })
const osaka = (): Location => ({ ...emptyLocation('j1', 'Osaka'), country: 'JP', electricity_kwh: 1000 })
const year = (c: ReturnType<typeof assessCompleteness>): SeriesYear =>
  ({ year: 2025, dataStatus: c.dataStatus, exclusions: c.exclusions, unverifiableReason: c.unverifiableReason }) as unknown as SeriesYear

describe('a partly unpriced year on the trends surface (FI1)', () => {
  it('a saved year with an unpriced line names the line and says the totals exclude it', () => {
    const c = assessCompleteness(buildWorkings([mill()], 'AR6', 2025), [mill()], 2025)
    expect(c.dataStatus).toBe('excluded')
    expect(c.exclusions).toEqual([{ kind: 'line', locationName: 'Mill', source: 'Natural gas', unit: 'm3', reason: 'factor_missing' }])
    const text = describeYearStatus(year(c))!
    expect(text).toBe("2025 isn't shown: 1 line is not priced, and that year's totals exclude it (Mill: natural gas in cubic metres is not priced). The rest of that year was measured normally, but a total missing a line can't be compared with one that isn't.")
    expect(text).not.toContain('can no longer be worked out')
    expect(text).not.toContain('left out of that year')
  })

  it('a refused location and an unpriced line are each worded as what they are', () => {
    const c = assessCompleteness(buildWorkings([mill(), osaka()], 'AR6', 2025), [mill(), osaka()], 2025)
    const text = describeYearStatus(year(c))!
    expect(text).toContain('1 location was left out of that year')
    expect(text).toContain("and 1 line is not priced, and that year's totals exclude it (Mill: natural gas in cubic metres is not priced)")
  })

  it('a year saved with no marker names the lines that can no longer be priced, not the location', () => {
    const c = assessCompleteness([], [mill()], 2025)
    expect(c.dataStatus).toBe('unverifiable')
    expect(c.unverifiableReason).toBe("1 line in this year's inventory can't be priced (Mill: natural gas in cubic metres), and this year was saved before we started recording that, so we can't tell whether its totals include them")
    expect(c.unverifiableReason).not.toContain('can no longer be worked out')
  })

  it('no em dash in any of the new wording', () => {
    const texts = [
      describeYearStatus(year(assessCompleteness(buildWorkings([mill()], 'AR6', 2025), [mill()], 2025)))!,
      describeYearStatus(year(assessCompleteness(buildWorkings([mill(), osaka()], 'AR6', 2025), [mill(), osaka()], 2025)))!,
      assessCompleteness([], [mill()], 2025).unverifiableReason!,
    ]
    for (const t of texts) expect(t).not.toContain('\u2014')
  })
})
