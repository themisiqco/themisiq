// lib/s211/entity.ts
// Whether an organization is an "entity" under the Fighting Against Forced Labour and Child Labour in
// Supply Chains Act, s.2. Pure: no React, no I/O, and no import from the Deals engine.
//
// EXTRACTED FROM lib/deals/assessment.ts ON 30 SEP 2026. The three thresholds and the citation used to
// live only inside the Deals threshold table. They live here now and the Deals engine imports them, so
// the Deals size test and this one cannot disagree about a figure. The Deals engine keeps its own
// evaluation (one year of figures, its own near-threshold wording), which is why its output did not
// move; this file adds what a deal cannot supply: a second year, and the three Canada questions.
//
// ⚠️ STEP 1 ONLY. Being an entity is not the same as having to report: Part 2 applies to an entity by
// what it does with goods (s.9). lib/s211/obligation.ts answers that, from this file's result.
//
// ⚠️ THE THIRD ROUTE IS NOT MODELLED. s.2 also reaches an organization "prescribed by regulations".
// No input here can establish or exclude that, and S211_NOT_MODELLED says so on every result.

import { FX_AS_OF, isFxCurrency, convertFx } from '../fx'

export const S211_ENTITY_CITATION = 'Fighting Against Forced Labour and Child Labour in Supply Chains Act (S-211), s.2 "entity"'

/** The size conditions in s.2, in CAD. "At least": a figure equal to the threshold meets it. */
export const S211_THRESHOLDS = {
  assetsCad: 20_000_000,
  revenueCad: 40_000_000,
  averageEmployees: 250,
  /** How many of the three must be met, in the same financial year. */
  requires: 2,
} as const

export const S211_NOT_MODELLED = 'An organization prescribed by regulations is also an entity. That route is not assessed here.'

/** One financial year's figures, from consolidated financial statements. null = not provided. */
export type S211YearFigures = {
  assets: number | null
  revenue: number | null
  /** The AVERAGE number of employees over the year, which is what the Act measures. */
  averageEmployees: number | null
  /** ISO code the money figures are in. */
  currency: string
}

export type S211EntityInput = {
  /** Listed on a stock exchange in Canada. null = not answered. */
  listedInCanada: boolean | null
  placeOfBusinessInCanada: boolean | null
  doesBusinessInCanada: boolean | null
  hasAssetsInCanada: boolean | null
  mostRecentYear: S211YearFigures | null
  priorYear: S211YearFigures | null
}

/** true = met, false = not met, null = cannot be told from what was provided. */
export type Tri = boolean | null
export type S211Limb = {
  measure: 'assets' | 'revenue' | 'employees'
  /** In CAD for the money limbs, a head count for employees. null when not provided or not convertible. */
  value: number | null
  threshold: number
  met: Tri
  /** Why `met` is null, or that the figure was converted. */
  note: string | null
}
export type S211YearResult = { year: 'most-recent' | 'prior'; limbs: S211Limb[]; metCount: number; unknownCount: number; met: Tri }

export type S211EntityResult = {
  /** 'entity' and 'not-entity' are settled on the inputs given. 'undetermined' names what is missing. */
  outcome: 'entity' | 'not-entity' | 'undetermined'
  /** Which route made it an entity. */
  route: 'listed' | 'size' | null
  /** Place of business, doing business, or assets in Canada: any one suffices. */
  canadaNexus: Tri
  years: S211YearResult[]
  /** True only when figures for BOTH of the two most recent financial years were tested. */
  lookbackRun: boolean
  /** Plain sentences, in order: what decided the outcome, then what qualifies it. */
  reasons: string[]
  citation: string
}

const any3 = (a: Tri, b: Tri, c: Tri): Tri =>
  a === true || b === true || c === true ? true : a === false && b === false && c === false ? false : null

const moneyLimb = (measure: 'assets' | 'revenue', raw: number | null, currency: string, threshold: number): S211Limb => {
  if (raw === null || !Number.isFinite(raw)) return { measure, value: null, threshold, met: null, note: 'Not provided.' }
  if (currency === 'CAD') return { measure, value: raw, threshold, met: raw >= threshold, note: null }
  if (!isFxCurrency(currency)) return { measure, value: null, threshold, met: null, note: `Not compared: no reference rate for ${currency || 'a blank currency'}.` }
  const value = convertFx(raw, currency, 'CAD')
  return { measure, value, threshold, met: value >= threshold, note: `Converted from ${currency} at the ECB reference rate of ${FX_AS_OF}.` }
}

const testYear = (year: S211YearResult['year'], f: S211YearFigures): S211YearResult => {
  const employees: S211Limb = f.averageEmployees === null || !Number.isFinite(f.averageEmployees)
    ? { measure: 'employees', value: null, threshold: S211_THRESHOLDS.averageEmployees, met: null, note: 'Not provided.' }
    : { measure: 'employees', value: f.averageEmployees, threshold: S211_THRESHOLDS.averageEmployees, met: f.averageEmployees >= S211_THRESHOLDS.averageEmployees, note: null }
  const limbs = [
    moneyLimb('assets', f.assets, f.currency, S211_THRESHOLDS.assetsCad),
    moneyLimb('revenue', f.revenue, f.currency, S211_THRESHOLDS.revenueCad),
    employees,
  ]
  const metCount = limbs.filter(l => l.met === true).length
  const unknownCount = limbs.filter(l => l.met === null).length
  // Met once two are met, whatever the third is. Not met once two CANNOT be met. Otherwise unknown.
  const met: Tri = metCount >= S211_THRESHOLDS.requires ? true : metCount + unknownCount < S211_THRESHOLDS.requires ? false : null
  return { year, limbs, metCount, unknownCount, met }
}

const YEAR_NAME = { 'most-recent': 'the most recent financial year', prior: 'the prior financial year' } as const
export const S211_LOOKBACK_NOT_RUN =
  'The Act tests either of the two most recent financial years. Figures for one year only were provided, so the lookback was not run.'

export function evaluateS211Entity(input: S211EntityInput): S211EntityResult {
  const years: S211YearResult[] = [
    ...(input.mostRecentYear ? [testYear('most-recent', input.mostRecentYear)] : []),
    ...(input.priorYear ? [testYear('prior', input.priorYear)] : []),
  ]
  const lookbackRun = years.length === 2
  const canadaNexus = any3(input.placeOfBusinessInCanada, input.doesBusinessInCanada, input.hasAssetsInCanada)
  const base = { canadaNexus, years, lookbackRun, citation: S211_ENTITY_CITATION }
  const done = (outcome: S211EntityResult['outcome'], route: S211EntityResult['route'], reasons: string[]): S211EntityResult =>
    ({ ...base, outcome, route, reasons: [...reasons, S211_NOT_MODELLED] })

  // Route 1. Listed on a stock exchange in Canada: an entity at any size, with or without a Canadian
  // place of business. Checked first because it depends on nothing else.
  if (input.listedInCanada === true)
    return done('entity', 'listed', ['Listed on a stock exchange in Canada, which makes it an entity at any size.'])

  // Route 2. A Canada nexus AND two of the three size conditions in EITHER of the two years.
  const metYear = years.find(y => y.met === true)
  // The size conditions are settled as NOT met only when both years were tested and both failed.
  const sizeMet: Tri = metYear ? true : lookbackRun && years.every(y => y.met === false) ? false : null

  const sizeSentence = (): string => {
    if (metYear) return `Meets ${metYear.metCount} of the 3 size conditions in ${YEAR_NAME[metYear.year]}.`
    if (years.length === 0) return 'No financial-year figures were provided, so the size conditions were not tested.'
    return years.map(y => y.met === false
      ? `Meets ${y.metCount} of the 3 size conditions in ${YEAR_NAME[y.year]}, fewer than the 2 required.`
      : `Meets ${y.metCount} of the 3 size conditions in ${YEAR_NAME[y.year]}, with ${y.unknownCount} not provided or not comparable, so that year is not settled.`).join(' ')
  }
  const nexusSentence = canadaNexus === true ? 'Has a place of business in Canada, does business in Canada or has assets in Canada.'
    : canadaNexus === false ? 'Has no place of business in Canada, does not do business in Canada and has no assets in Canada.'
    : 'Whether it has a place of business in Canada, does business in Canada or has assets in Canada was not fully answered.'
  const lookback = years.length === 1 ? [S211_LOOKBACK_NOT_RUN] : []

  if (canadaNexus === true && sizeMet === true)
    return done('entity', 'size', [nexusSentence, sizeSentence(), ...(lookbackRun || !metYear ? [] : lookback)])

  // Either half failing settles route 2 as not met, but only a settled "not listed" settles the whole.
  const sizeRouteFails = canadaNexus === false || sizeMet === false
  if (sizeRouteFails && input.listedInCanada === false)
    return done('not-entity', null, ['Not listed on a stock exchange in Canada.', nexusSentence, sizeSentence()])

  const missing: string[] = []
  if (input.listedInCanada === null) missing.push('Whether it is listed on a stock exchange in Canada was not answered.')
  return done('undetermined', null, [...missing, nexusSentence, sizeSentence(), ...lookback])
}
