// lib/ghg/loadSeriesYear.test.ts
//
// T7 revision: assessCompleteness checks a stored year against THAT year's factor tables, not 2024's.
//
// ⚠️ WHY THIS SPIES ON THE CALL RATHER THAN COMPARING TWO VERDICTS. Today no pricing refusal depends on
// the year: MissingEmissionFactorError comes only from pickEF, whose combustion tables have no year
// dimension, and the year-keyed grid lookup never refuses. So a location unpriceable in one year is
// unpriceable in every year, and no fixture can show the verdict moving. What can be shown is that the
// row's own year is the one the check is run with, which is what decides the answer the day a
// year-keyed table can refuse (factor-years branch, T3c).

import { describe, it, expect, vi } from 'vitest'

const calls: unknown[][] = []
vi.mock('./engine', async (importOriginal) => {
  const m = await importOriginal<typeof import('./engine')>()
  return {
    ...m,
    findUnpriceableLocations: (...args: Parameters<typeof m.findUnpriceableLocations>) => {
      calls.push(args)
      return m.findUnpriceableLocations(...args)
    },
  }
})

// loadSeries creates the Supabase client at import; this test never queries, so the client is a stub.
vi.mock('../supabase', () => ({ supabase: {} }))

import { assessCompleteness } from './loadSeries'
import { emptyLocation } from './engine'

describe('assessCompleteness uses the row\'s own reporting year', () => {
  it('re-checks an unmarked row with that year, not the 2024 default', () => {
    const locs = [{ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf' }]
    for (const year of [2023, 2025, 2026]) {
      calls.length = 0
      expect(assessCompleteness([], locs, year).dataStatus, `${year}`).toBe('ok')
      expect(calls).toHaveLength(1)
      expect(calls[0][2], `${year}: the year the tables are looked up by`).toBe(year)
    }
  })

  it('an unpriceable location is still caught, with the year passed through', () => {
    const locs = [{ ...emptyLocation('L1', 'Site A'), country: 'GB', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'm3' }]
    calls.length = 0
    expect(assessCompleteness([], locs, 2025).dataStatus).toBe('unverifiable')
    expect(calls[0][2]).toBe(2025)
  })
})
