import { describe, it, expect } from 'vitest'
import { deriveFinancialYear } from './financialYear'

describe('the financial year a report covers: the most recent one ending before May 31 of the reporting year', () => {
  it('the guidance example: a March 31 year end, reporting in 2026, covers the year ending March 31, 2026', () => {
    expect(deriveFinancialYear(3, 31, 2026)).toEqual({ start: '2025-04-01', end: '2026-03-31', askUser: false })
  })
  it('a December 31 year end, reporting in 2026: calendar 2025', () => {
    expect(deriveFinancialYear(12, 31, 2026)).toEqual({ start: '2025-01-01', end: '2025-12-31', askUser: false })
  })
  it('a year end after May 31 falls back a year: June 30, reporting in 2026, is the year ending June 30, 2025', () => {
    expect(deriveFinancialYear(6, 30, 2026)).toEqual({ start: '2024-07-01', end: '2025-06-30', askUser: false })
  })
  it('May 30 is before May 31: that year', () => {
    expect(deriveFinancialYear(5, 30, 2026)).toEqual({ start: '2025-05-31', end: '2026-05-30', askUser: false })
  })
  it('THE MAY 31 CASE: the rule gives the year before, and the builder asks rather than assumes', () => {
    expect(deriveFinancialYear(5, 31, 2026)).toEqual({ start: '2024-06-01', end: '2025-05-31', askUser: true })
  })
  it('February 29 in a common year is read as February 28', () => {
    expect(deriveFinancialYear(2, 29, 2026)).toEqual({ start: '2025-03-01', end: '2026-02-28', askUser: false })
    expect(deriveFinancialYear(2, 29, 2025)!.end).toBe('2025-02-28')
    expect(deriveFinancialYear(2, 29, 2024)!.end).toBe('2024-02-29')
  })
  it('input that is not a date gives nothing', () => {
    for (const [m, d, y] of [[0, 1, 2026], [13, 1, 2026], [3, 0, 2026], [3, 32, 2026], [3.5, 1, 2026], [3, 31, NaN]])
      expect(deriveFinancialYear(m, d, y), `${m}/${d}/${y}`).toBeNull()
  })
})
