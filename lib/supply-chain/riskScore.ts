// lib/supply-chain/riskScore.ts
// The supplier risk score: pure, no React, no I/O. The Supply Chain page renders what this returns.
//
// REBUILT 30 SEP 2026. The score used to add a country term and a sector term of up to 10 points
// each, against bands set for a 10-point scale and a screen that prints "/10". The sector table was
// keyed on a retired sector list, so every lookup missed and every supplier took a default worth 5
// points: a supplier in the lowest-rated country, with an assessment on file, scored 7.5 and read
// CRITICAL. The sector term is gone until a sourced rating exists, and the score is now four listed
// factors that sum to at most 10.

import { FX_AS_OF, isFxCurrency, toUsd } from '../fx'

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'
export type CountryRating = 1 | 2 | 3 | 4

// ⚠️ THIS TABLE IS UNSOURCED. The ratings were written by hand and cite no index or list. They are kept
// for now because the score needs a country input, and they are TO BE REPLACED by the sourced country
// list from the Canada S-211 module work. Until then nothing printed may say WHY a country is rated as
// it is: the labels that did ("forced labour", "Xinjiang", "garment sector") were allegations about
// named countries with no source behind them, and they reached the CSV export. A rating of 3 or 4 now
// prints only that this module's internal list rates the country high or very high.
export const COUNTRY_RATING: Readonly<Record<string, CountryRating>> = {
  'Bangladesh': 4, 'Myanmar': 4, 'North Korea': 4, 'Eritrea': 4,
  'Uzbekistan': 3, 'China': 3, 'Pakistan': 3, 'Cambodia': 3,
  'Vietnam': 2, 'India': 2, 'Brazil': 2, 'Mexico': 2, 'Turkey': 2, 'Indonesia': 2, 'Thailand': 2,
  'Germany': 1, 'France': 1, 'UK': 1, 'Netherlands': 1, 'Sweden': 1, 'Denmark': 1, 'USA': 1, 'Canada': 1,
  'Australia': 1, 'Japan': 1, 'South Korea': 1,
}
/** The countries the form offers, in the order it lists them. */
export const COUNTRIES = Object.keys(COUNTRY_RATING).sort()
/** A country the table does not hold ("Other", or anything a CSV carries) is rated 2, as before. */
export const UNLISTED_COUNTRY_RATING: CountryRating = 2

export const COUNTRY_FACTOR_HIGH = 'Country risk: rated high in this module’s internal list'
export const COUNTRY_FACTOR_VERY_HIGH = 'Country risk: rated very high in this module’s internal list'

// ── THE WEIGHTS (approved 30 Sep 2026). Every factor the score uses, and nothing else. ─────────────
// They sum to exactly 10 at their maxima: 6 + 1.5 + 1.5 + 1. The cap below is belt and braces.
export const SCORE_WEIGHTS = {
  /** Country rating 1 to 4. 60% of the scale. */
  country: { 1: 0, 2: 2, 3: 4, 4: 6 } as Record<CountryRating, number>,
  /** No sustainability assessment on file. 15%. */
  noAssessment: 1.5,
  /** Annual spend above USD 1m, and above USD 5m (the larger replaces the smaller). 15%. */
  spendOver1m: 0.5,
  spendOver5m: 1.5,
  /** Tier 1, 2, 3. 10%. */
  tier: { '1': 0, '2': 0.5, '3': 1 } as Record<'1' | '2' | '3', number>,
} as const
export const SCORE_MAX = 10
export const SPEND_THRESHOLD_1M_USD = 1_000_000
export const SPEND_THRESHOLD_5M_USD = 5_000_000

/** Bands: LOW below 2.5, MEDIUM from 2.5, HIGH from 5, CRITICAL from 7.5. */
export const bandFor = (score: number): RiskLevel =>
  score >= 7.5 ? 'critical' : score >= 5 ? 'high' : score >= 2.5 ? 'medium' : 'low'

// ── Currency ───────────────────────────────────────────────────────────────────────────────────────
// Spend is compared in ONE currency: converted to USD at the dated ECB reference rates in lib/fx.ts
// before the 1m and 5m thresholds. A currency with no rate there is NOT compared, and the supplier's
// factors say so; it is never treated as USD and never guessed.
const SYMBOLS: Record<string, string> = { '€': 'EUR', '£': 'GBP', 'US$': 'USD' }
/**
 * A currency as typed in a CSV, as an ISO 4217 code: trimmed and upper-cased, with the three
 * unambiguous symbols mapped. Blank takes `fallback` (the register's currency). Anything else is
 * returned upper-cased AS TYPED, so an unrecognised code is shown back, not replaced.
 * '$' and '¥' are deliberately not mapped: each names more than one currency.
 */
export const normalizeCurrency = (raw: unknown, fallback: string): string => {
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (!t) return fallback
  const upper = t.toUpperCase()
  return SYMBOLS[upper] ?? upper
}
export const spendNotComparedFactor = (currency: string): string =>
  `Spend not compared: no reference rate for ${currency || 'a blank currency'}`
export const SPEND_FACTOR_OVER_1M = `Annual spend above USD 1m (converted at the ECB reference rate of ${FX_AS_OF})`
export const SPEND_FACTOR_OVER_5M = `Annual spend above USD 5m (converted at the ECB reference rate of ${FX_AS_OF})`
export const TIER_2_FACTOR = 'Tier 2 supplier (limited visibility)'
export const TIER_3_FACTOR = 'Tier 3 supplier (very limited visibility)'
export const NO_ASSESSMENT_FACTOR = 'No sustainability assessment on file'

/** One line stating how the score is built, carried in the CSV export so it travels with the figures. */
export const SCORE_BASIS_NOTE =
  'Score 0 to 10. Country rating: 0, 2, 4 or 6. No assessment on file: 1.5. Annual spend above USD 1m: 0.5, above USD 5m: 1.5 '
  + `(converted at the ECB reference rates of ${FX_AS_OF}; a currency with no rate is not compared). Tier 2: 0.5, tier 3: 1. `
  + 'LOW below 2.5, MEDIUM from 2.5, HIGH from 5, CRITICAL from 7.5. Country ratings are this module’s internal list and cite no published source.'

export type ScoredInput = {
  country: string
  tier: '1' | '2' | '3'
  has_assessment: boolean
  annual_spend: number
  currency: string
}

export const scoreSupplierRisk = (s: ScoredInput): { risk: RiskLevel; score: number; factors: string[] } => {
  const factors: string[] = []
  let score = 0

  const rating = COUNTRY_RATING[s.country] ?? UNLISTED_COUNTRY_RATING
  score += SCORE_WEIGHTS.country[rating]
  if (rating === 3) factors.push(COUNTRY_FACTOR_HIGH)
  if (rating === 4) factors.push(COUNTRY_FACTOR_VERY_HIGH)

  if (!s.has_assessment) { score += SCORE_WEIGHTS.noAssessment; factors.push(NO_ASSESSMENT_FACTOR) }

  // Zero spend has nothing to compare, in any currency.
  if (s.annual_spend > 0) {
    const usd = isFxCurrency(s.currency) ? toUsd(s.annual_spend, s.currency) : null
    if (usd === null) factors.push(spendNotComparedFactor(s.currency))
    else if (usd > SPEND_THRESHOLD_5M_USD) { score += SCORE_WEIGHTS.spendOver5m; factors.push(SPEND_FACTOR_OVER_5M) }
    else if (usd > SPEND_THRESHOLD_1M_USD) { score += SCORE_WEIGHTS.spendOver1m; factors.push(SPEND_FACTOR_OVER_1M) }
  }

  const tier = SCORE_WEIGHTS.tier[s.tier] ?? 0
  score += tier
  if (s.tier === '2') factors.push(TIER_2_FACTOR)
  if (s.tier === '3') factors.push(TIER_3_FACTOR)

  const capped = Math.min(SCORE_MAX, Math.max(0, score))
  return { risk: bandFor(capped), score: Math.round(capped * 10) / 10, factors }
}
