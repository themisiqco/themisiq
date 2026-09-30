import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ECB_UNITS_PER_EUR, FX_CURRENCIES, FX_AS_OF, FX_SOURCE, isFxCurrency, convertFx, toUsd } from './fx'
import { UNITS_PER_EUR, DEAL_CURRENCIES, convertCurrency, FX_AS_OF as DEALS_AS_OF, FX_SOURCE as DEALS_SOURCE } from './deals/assessment'

// The rate table moved from lib/deals/assessment.ts to lib/fx.ts on 30 Sep 2026 and gained 25
// currencies. Every figure was compared as text with the ECB document FX_SOURCE names. The strings
// below are that document's own spellings, so a digit changed or a trailing zero trimmed in the
// source file fails here even though the number would still compare equal.
const AS_PRINTED: Record<string, string> = {
  USD: '1.1383', JPY: '185.21', CZK: '24.254', DKK: '7.4745', GBP: '0.85973', HUF: '355.83', PLN: '4.2958',
  RON: '5.2367', SEK: '11.0955', CHF: '0.9234', ISK: '143.80', NOK: '11.3125', TRY: '53.1266', AUD: '1.6518',
  BRL: '5.9048', CAD: '1.6191', CNY: '7.7342', HKD: '8.9287', IDR: '20444.89', ILS: '3.3900', INR: '108.4215',
  KRW: '1773.57', MXN: '19.9591', MYR: '4.6602', NZD: '2.0069', PHP: '70.170', SGD: '1.4762', THB: '38.002',
  ZAR: '18.7064',
}

describe('lib/fx.ts holds the ECB table as printed', () => {
  const src = readFileSync(join(process.cwd(), 'lib/fx.ts'), 'utf8')

  it('29 published rates plus the EUR base, every currency the ECB document lists, and no others', () => {
    expect([...FX_CURRENCIES].sort()).toEqual(['EUR', ...Object.keys(AS_PRINTED)].sort())
    expect(ECB_UNITS_PER_EUR.EUR).toBe(1)
    expect(FX_CURRENCIES).toHaveLength(30)
    expect(isFxCurrency('THB')).toBe(true)
    expect(isFxCurrency('VND')).toBe(false)   // not in the ECB document
  })

  it.each(Object.entries(AS_PRINTED))('%s is written exactly as printed: %s', (code, printed) => {
    expect(src).toMatch(new RegExp(`^  ${code}: ${printed.replace('.', '\\.')},`, 'm'))
    expect(ECB_UNITS_PER_EUR[code as keyof typeof ECB_UNITS_PER_EUR]).toBe(Number(printed))
  })

  it('the source names the dated document', () => {
    expect(FX_AS_OF).toBe('2026-07-01')
    expect(FX_SOURCE).toContain('20260701.pdf')
  })

  it('isFxCurrency is an own-key test, not `in`', () => {
    for (const c of ['constructor', 'toString', '', 'usd', null, undefined, 1]) expect(isFxCurrency(c), String(c)).toBe(false)
    expect(isFxCurrency('USD')).toBe(true)
  })

  it('toUsd converts through EUR, is exact for USD, and returns null with no rate', () => {
    expect(toUsd(123.45, 'USD')).toBe(123.45)
    expect(toUsd(185.21, 'JPY')).toBeCloseTo(1.1383, 10)
    expect(toUsd(1, 'EUR')).toBe(1.1383)
    expect(toUsd(38.002, 'THB')).toBeCloseTo(1.1383, 10)
    expect(toUsd(1000, 'VND')).toBeNull()
    expect(convertFx(100, 'GBP', 'GBP')).toBe(100)
  })
})

describe('the Deals engine reads the same table and is unchanged', () => {
  it('re-exports the date and source, and keeps exactly its five currencies', () => {
    expect(DEALS_AS_OF).toBe(FX_AS_OF)
    expect(DEALS_SOURCE).toBe(FX_SOURCE)
    expect(DEAL_CURRENCIES).toEqual(['USD', 'EUR', 'GBP', 'CAD', 'AUD'])
    expect(UNITS_PER_EUR).toEqual({ EUR: 1, USD: 1.1383, GBP: 0.85973, CAD: 1.6191, AUD: 1.6518 })
    expect(Object.keys(UNITS_PER_EUR)).toEqual(['EUR', 'USD', 'GBP', 'CAD', 'AUD'])
  })

  it('convertCurrency and convertFx agree on every Deals pair', () => {
    for (const f of DEAL_CURRENCIES) for (const t of DEAL_CURRENCIES)
      expect(convertCurrency(123_456_789.12, f, t)).toBe(convertFx(123_456_789.12, f, t))
  })
})
