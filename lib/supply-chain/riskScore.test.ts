import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  scoreSupplierRisk, bandFor, normalizeCurrency, COUNTRY_RATING, COUNTRIES, SCORE_WEIGHTS, SCORE_MAX, SCORE_BASIS_NOTE,
  COUNTRY_FACTOR_HIGH, COUNTRY_FACTOR_VERY_HIGH, SPEND_FACTOR_OVER_1M, SPEND_FACTOR_OVER_5M, NO_ASSESSMENT_FACTOR,
  TIER_2_FACTOR, TIER_3_FACTOR, spendNotComparedFactor,
} from './riskScore'
import { FX_CURRENCIES, toUsd } from '../fx'

// The supplier risk score as approved on 30 Sep 2026. The table below is the one that was reviewed,
// with spend in USD, written out independently of the weights so a changed weight or band fails here.

type Row = [country: string, rating: number, tier: '1' | '2' | '3', assessment: boolean, spendUsd: number, score: number, band: string]
const APPROVED: Row[] = [
  ['Germany',    1, '1', true,    200_000, 0,   'low'],
  ['Germany',    1, '1', false,   200_000, 1.5, 'low'],
  ['USA',        1, '3', false, 8_000_000, 4,   'medium'],
  ['India',      2, '1', true,    200_000, 2,   'low'],
  ['Other',      2, '1', false,   200_000, 3.5, 'medium'],
  ['Vietnam',    2, '2', false, 2_000_000, 4.5, 'medium'],
  ['Brazil',     2, '3', false, 8_000_000, 6,   'high'],
  ['China',      3, '1', true,    200_000, 4,   'medium'],
  ['China',      3, '1', false,   200_000, 5.5, 'high'],
  ['Pakistan',   3, '2', false, 2_000_000, 6.5, 'high'],
  ['Cambodia',   3, '3', false, 8_000_000, 8,   'critical'],
  ['Bangladesh', 4, '1', true,    200_000, 6,   'high'],
  ['Myanmar',    4, '1', false,   200_000, 7.5, 'critical'],
  ['Eritrea',    4, '3', false, 8_000_000, 10,  'critical'],
]

describe('the approved 14-row table', () => {
  it.each(APPROVED)('%s (rating %i), tier %s, assessment %s, USD %i: %d %s', (country, rating, tier, has_assessment, annual_spend, score, band) => {
    expect(COUNTRY_RATING[country] ?? 2).toBe(rating)
    const r = scoreSupplierRisk({ country, tier, has_assessment, annual_spend, currency: 'USD' })
    expect(r.score).toBe(score)
    expect(r.risk).toBe(band)
  })
})

describe('the scale', () => {
  const every = () => [...COUNTRIES, 'Other', ''].flatMap(country => (['1', '2', '3'] as const).flatMap(tier =>
    [true, false].flatMap(has_assessment => [0, 999_999, 1_000_001, 5_000_001, 1e12].map(annual_spend =>
      scoreSupplierRisk({ country, tier, has_assessment, annual_spend, currency: 'USD' })))))

  it('is always between 0 and 10, and every band is reachable', () => {
    const all = every()
    for (const r of all) { expect(r.score).toBeGreaterThanOrEqual(0); expect(r.score).toBeLessThanOrEqual(SCORE_MAX) }
    expect(new Set(all.map(r => r.risk))).toEqual(new Set(['low', 'medium', 'high', 'critical']))
    expect(Math.max(...all.map(r => r.score))).toBe(10)
    expect(Math.min(...all.map(r => r.score))).toBe(0)
  })

  it('the weights sum to exactly 10 at their maxima', () => {
    expect(SCORE_WEIGHTS.country[4] + SCORE_WEIGHTS.noAssessment + SCORE_WEIGHTS.spendOver5m + SCORE_WEIGHTS.tier['3']).toBe(10)
    expect(SCORE_WEIGHTS).toEqual({ country: { 1: 0, 2: 2, 3: 4, 4: 6 }, noAssessment: 1.5, spendOver1m: 0.5, spendOver5m: 1.5, tier: { '1': 0, '2': 0.5, '3': 1 } })
  })

  it('the bands: LOW below 2.5, MEDIUM from 2.5, HIGH from 5, CRITICAL from 7.5', () => {
    expect([0, 2.4, 2.5, 4.9, 5, 7.4, 7.5, 10].map(bandFor)).toEqual(['low', 'low', 'medium', 'medium', 'high', 'high', 'critical', 'critical'])
  })

  it('a lowest-rated country with an assessment on file is LOW, with no factor raised', () => {
    expect(scoreSupplierRisk({ country: 'Germany', tier: '1', has_assessment: true, annual_spend: 0, currency: 'EUR' })).toEqual({ risk: 'low', score: 0, factors: [] })
  })

  it('the spend thresholds are strict: exactly USD 1m and exactly USD 5m are not above them', () => {
    const at = (annual_spend: number) => scoreSupplierRisk({ country: 'Germany', tier: '1', has_assessment: true, annual_spend, currency: 'USD' }).score
    expect([1_000_000, 1_000_001, 5_000_000, 5_000_001].map(at)).toEqual([0, 0.5, 0.5, 1.5])
  })
})

describe('factor wording', () => {
  it('country: neutral for rating 3 and 4, silent below, and never a reason', () => {
    const f = (country: string) => scoreSupplierRisk({ country, tier: '1', has_assessment: true, annual_spend: 0, currency: 'USD' }).factors
    for (const c of ['Uzbekistan', 'China', 'Pakistan', 'Cambodia']) expect(f(c), c).toEqual([COUNTRY_FACTOR_HIGH])
    for (const c of ['Bangladesh', 'Myanmar', 'North Korea', 'Eritrea']) expect(f(c), c).toEqual([COUNTRY_FACTOR_VERY_HIGH])
    for (const c of ['Germany', 'India', 'Other']) expect(f(c), c).toEqual([])
    expect(COUNTRY_FACTOR_HIGH).toBe('Country risk: rated high in this module’s internal list')
    expect(COUNTRY_FACTOR_VERY_HIGH).toBe('Country risk: rated very high in this module’s internal list')
  })

  it('no country-specific reason survives anywhere in the score module or the page', () => {
    for (const file of ['lib/supply-chain/riskScore.ts', 'app/dashboard/supply-chain/page.tsx']) {
      const code = readFileSync(join(process.cwd(), file), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
      for (const banned of ['Xinjiang', 'garment sector', 'cotton forced', 'Critical (forced labour)', 'Sector risk not rated', 'SECTOR_RISK[', 'strong regulatory framework'])
        expect(code, `${file}: ${banned}`).not.toContain(banned)
    }
  })

  it('every factor in one supplier, in order', () => {
    expect(scoreSupplierRisk({ country: 'Eritrea', tier: '3', has_assessment: false, annual_spend: 8_000_000, currency: 'USD' }).factors)
      .toEqual([COUNTRY_FACTOR_VERY_HIGH, NO_ASSESSMENT_FACTOR, SPEND_FACTOR_OVER_5M, TIER_3_FACTOR])
    expect(scoreSupplierRisk({ country: 'Vietnam', tier: '2', has_assessment: false, annual_spend: 2_000_000, currency: 'USD' }).factors)
      .toEqual([NO_ASSESSMENT_FACTOR, SPEND_FACTOR_OVER_1M, TIER_2_FACTOR])
    expect(SPEND_FACTOR_OVER_5M).toBe('Annual spend above USD 5m (converted at the ECB reference rate of 2026-07-01)')
  })

  it('the CSV basis note states every weight, the bands and that the country list is unsourced', () => {
    for (const part of ['0, 2, 4 or 6', '1.5', 'above USD 1m: 0.5', 'above USD 5m: 1.5', 'Tier 2: 0.5, tier 3: 1', 'LOW below 2.5', 'CRITICAL from 7.5', 'cite no published source', '2026-07-01'])
      expect(SCORE_BASIS_NOTE).toContain(part)
  })
})

describe('spend is compared in USD', () => {
  const spend = (annual_spend: number, currency: string) =>
    scoreSupplierRisk({ country: 'Germany', tier: '1', has_assessment: true, annual_spend, currency })

  it('100m JPY is about USD 0.6m: below the USD 1m threshold, no spend points', () => {
    const usd = toUsd(100_000_000, 'JPY')!
    expect(usd).toBeCloseTo(100_000_000 * 1.1383 / 185.21, 6)
    expect(usd).toBeGreaterThan(600_000); expect(usd).toBeLessThan(620_000)
    expect(spend(100_000_000, 'JPY')).toEqual({ risk: 'low', score: 0, factors: [] })
    // The same figure read as USD, which is what comparing unconverted would do, takes the full 1.5.
    expect(spend(100_000_000, 'USD').score).toBe(1.5)
  })

  it('JPY above the thresholds takes the points: 200m JPY is over USD 1m, 1bn JPY is over USD 5m', () => {
    expect(spend(200_000_000, 'JPY')).toEqual({ risk: 'low', score: 0.5, factors: [SPEND_FACTOR_OVER_1M] })
    expect(spend(1_000_000_000, 'JPY')).toEqual({ risk: 'low', score: 1.5, factors: [SPEND_FACTOR_OVER_5M] })
  })

  it('EUR and GBP convert upward: EUR 900k is over USD 1m', () => {
    expect(spend(900_000, 'EUR').score).toBe(0.5)
    expect(spend(800_000, 'EUR').score).toBe(0)
    expect(spend(4_000_000, 'GBP').score).toBe(1.5)
  })

  it('a currency with no rate: no spend points, and the factor names the code', () => {
    const r = spend(900_000_000, 'VND')
    expect(r.score).toBe(0)
    expect(r.factors).toEqual(['Spend not compared: no reference rate for VND'])
    expect(spendNotComparedFactor('XYZ')).toBe('Spend not compared: no reference rate for XYZ')
    // The rest of the score still applies.
    expect(scoreSupplierRisk({ country: 'Myanmar', tier: '3', has_assessment: false, annual_spend: 9e9, currency: 'VND' }))
      .toEqual({ risk: 'critical', score: 8.5, factors: [COUNTRY_FACTOR_VERY_HIGH, NO_ASSESSMENT_FACTOR, 'Spend not compared: no reference rate for VND', TIER_3_FACTOR] })
  })

  it('THB has a rate (added 30 Sep 2026): THB 900m is about USD 27m, above USD 5m', () => {
    expect(spend(900_000_000, 'THB')).toEqual({ risk: 'low', score: 1.5, factors: [SPEND_FACTOR_OVER_5M] })
    expect(spend(30_000_000, 'THB')).toEqual({ risk: 'low', score: 0, factors: [] })
  })

  it('zero spend raises nothing, whatever the currency', () => {
    expect(spend(0, 'VND').factors).toEqual([])
  })

  it('every currency with a rate is compared, never reported as not compared', () => {
    for (const c of FX_CURRENCIES) expect(spend(1, c).factors, c).toEqual([])
  })
})

describe('CSV currency normalisation', () => {
  it('trims and upper-cases to an ISO code, maps the three unambiguous symbols, and blank takes the register currency', () => {
    expect(normalizeCurrency(' jpy ', 'EUR')).toBe('JPY')
    expect(normalizeCurrency('Eur', 'USD')).toBe('EUR')
    expect(normalizeCurrency('€', 'USD')).toBe('EUR')
    expect(normalizeCurrency('£', 'USD')).toBe('GBP')
    expect(normalizeCurrency('us$', 'EUR')).toBe('USD')
    expect(normalizeCurrency('', 'EUR')).toBe('EUR')
    expect(normalizeCurrency(undefined, 'CAD')).toBe('CAD')
  })

  it('an unrecognised code is kept as typed, upper-cased, and is then not compared', () => {
    expect(normalizeCurrency('vnd', 'USD')).toBe('VND')
    expect(normalizeCurrency('$', 'USD')).toBe('$')
    expect(normalizeCurrency('yen', 'USD')).toBe('YEN')
    const r = scoreSupplierRisk({ country: 'Germany', tier: '1', has_assessment: true, annual_spend: 5e8, currency: normalizeCurrency('yen', 'USD') })
    expect(r.factors).toEqual(['Spend not compared: no reference rate for YEN'])
  })
})

describe('the page is wired to it', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/supply-chain/page.tsx'), 'utf8')

  it('a manually added supplier takes the register currency: EUR register, EUR supplier', () => {
    expect(src).toContain('const newSupplier = (currency: string): Supplier => ({')
    expect(src).toContain('const s = newSupplier(inventory.currency)')
    expect(src).not.toMatch(/annual_spend: 0, currency: 'USD'/)
    // And that supplier, EUR 900k, is compared as USD 1.02m.
    expect(scoreSupplierRisk({ country: 'Germany', tier: '1', has_assessment: true, annual_spend: 900_000, currency: 'EUR' }).factors).toEqual([SPEND_FACTOR_OVER_1M])
  })

  it('scores through riskScore.ts, labels spend in the supplier currency, normalises the CSV currency, and exports the basis', () => {
    expect(src).toContain('({ ...scoreSupplierRisk(supplier), scope3: null })')
    expect(src).toContain('Annual spend ({inventory.suppliers[activeSupplier].currency})')
    expect(src).toContain("normalizeCurrency(row['Currency'] ?? row['currency'], inventory.currency)")
    expect(src).toContain("['Risk score basis', SCORE_BASIS_NOTE],")
    expect(src).not.toContain('const SECTOR_RISK')
    expect(src).not.toContain('const SECTORS')
    expect(src).not.toContain('const COUNTRY_RISK')
  })

  it('does not import the Deals engine', () => {
    expect(src).not.toContain('deals/assessment')
    expect(readFileSync(join(process.cwd(), 'lib/supply-chain/riskScore.ts'), 'utf8')).not.toContain('deals/')
    expect(readFileSync(join(process.cwd(), 'lib/fx.ts'), 'utf8')).not.toMatch(/^import /m)
  })
})
