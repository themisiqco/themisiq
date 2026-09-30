import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerTotalSpend, excludedNote, TOTAL_SPEND_LABEL } from './totalSpend'
import { ECB_UNITS_PER_EUR } from '../fx'

// A register's total spend is each supplier's spend converted to the register's currency at the dated
// ECB rates, then added. Expected figures are worked from the published rates, units per 1 EUR.
const { GBP, JPY, USD } = ECB_UNITS_PER_EUR

describe('mixed EUR, JPY and USD suppliers in a GBP register', () => {
  const suppliers = [
    { annual_spend: 1_000_000, currency: 'EUR' },
    { annual_spend: 100_000_000, currency: 'JPY' },
    { annual_spend: 2_000_000, currency: 'USD' },
    { annual_spend: 500_000, currency: 'GBP' },
  ]

  it('converts each to GBP before adding', () => {
    const expected = 1_000_000 * GBP + (100_000_000 * GBP) / JPY + (2_000_000 * GBP) / USD + 500_000
    const t = registerTotalSpend(suppliers, 'GBP')
    expect(t.total).toBeCloseTo(expected, 2)
    // Written out from the rates: 859,730.00 + 464,192.00 + 1,510,550.82 + 500,000.00.
    expect(t.total).toBe(3_334_472.82)
    expect(t).toMatchObject({ excludedCount: 0, excludedCodes: [] })
    expect(excludedNote(t)).toBeNull()
  })

  it('is not the raw sum, which added yen to euros', () => {
    expect(registerTotalSpend(suppliers, 'GBP').total).not.toBe(103_500_000)
  })

  it('a supplier already in the register currency is added as entered, with no round trip', () => {
    expect(registerTotalSpend([{ annual_spend: 123_456.78, currency: 'GBP' }], 'GBP').total).toBe(123_456.78)
  })
})

describe('a supplier with an unknown currency code', () => {
  it('is left out of the total and named in the note', () => {
    const t = registerTotalSpend([
      { annual_spend: 1_000_000, currency: 'EUR' },
      { annual_spend: 9_000_000, currency: 'XYZ' },
    ], 'GBP')
    expect(t.total).toBeCloseTo(1_000_000 * GBP, 2)
    expect(t.excludedCount).toBe(1)
    expect(excludedNote(t)).toBe('Excludes 1 supplier with no reference rate: XYZ')
  })

  it('several: the count is suppliers, the codes are listed once each', () => {
    const t = registerTotalSpend([
      { annual_spend: 5, currency: 'XYZ' }, { annual_spend: 5, currency: 'VND' }, { annual_spend: 5, currency: 'XYZ' }, { annual_spend: 5, currency: '' },
    ], 'USD')
    expect(t.total).toBe(0)
    expect(excludedNote(t)).toBe('Excludes 4 suppliers with no reference rate: XYZ, VND, (blank)')
  })

  it('zero spend in an unknown currency is not reported: it adds nothing either way', () => {
    expect(registerTotalSpend([{ annual_spend: 0, currency: 'XYZ' }], 'USD')).toEqual({ total: 0, excludedCount: 0, excludedCodes: [] })
  })

  it('a register currency with no rate still adds the suppliers entered in it, and leaves out the rest', () => {
    const t = registerTotalSpend([{ annual_spend: 100, currency: 'XYZ' }, { annual_spend: 100, currency: 'USD' }], 'XYZ')
    expect(t).toEqual({ total: 100, excludedCount: 1, excludedCodes: ['USD'] })
  })
})

describe('the label and the page', () => {
  it('the label names the dated rate', () => {
    expect(TOTAL_SPEND_LABEL).toBe('Total spend (converted at the ECB reference rate of 2026-07-01)')
  })

  it('the screen and the CSV export both use the converted total, the label and the note', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/supply-chain/page.tsx'), 'utf8')
    expect(src).toContain('const spendTotal = registerTotalSpend(inventory.suppliers, inventory.currency)')
    expect(src).toContain('[TOTAL_SPEND_LABEL, `${inventory.currency} ${Math.round(totalSpend).toLocaleString()}`],')
    expect(src).toContain("...(spendExcluded ? [['', spendExcluded]] : []),")
    expect(src).toContain('{ label: TOTAL_SPEND_LABEL,')
    expect(src).toContain('{spendExcluded && (')
    expect(src).not.toContain('reduce((sum, s) => sum + s.annual_spend, 0)')
  })
})
