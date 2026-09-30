// lib/s211/applicability.ts
// The applicability questions, as one form both surfaces share: the free check at /forced-labour/canada/check
// (signed out, in the browser, nothing stored on a server) and a report's home in the builder. Pure.
//
// The answers are strings, as the form holds them: 'yes' / 'no' / '' for the presence questions,
// 'yes' / 'no' / 'not-sure' / '' for the goods questions, and numbers as typed. The engines they feed
// (lib/s211/entity.ts, lib/s211/obligation.ts) are the builder's, unchanged, so the check and the builder
// give the same result, the same reasons and the same quotations for the same answers.
//
// CARRIED THROUGH SIGN-UP AND PURCHASE. The check saves its form under DRAFT_KEYS.forcedLabourCheck
// (lib/drafts.ts); the builder, when it creates a report, writes the draft into that report and clears
// it. A draft written while signed out expires two hours after it was saved (lib/drafts.ts ANON_TTL_MS).

import { evaluateS211Entity, type S211EntityInput, type S211YearFigures } from './entity'
import { evaluateS211Obligation, type S211Activities, type S211Answer } from './obligation'

export type ApplicabilityForm = Record<string, string>

export const PRESENCE_QUESTIONS: [string, string][] = [
  ['listed_in_canada', 'Listed on a stock exchange in Canada'],
  ['place_of_business_in_canada', 'Has a place of business in Canada'],
  ['does_business_in_canada', 'Does business in Canada'],
  ['has_assets_in_canada', 'Has assets in Canada'],
]
export const ACTIVITY_QUESTIONS: [keyof S211Activities, string][] = [
  ['producesGoods', 'Does it produce goods, in Canada or elsewhere?'],
  ['sellsGoods', 'Does it sell goods, in Canada or elsewhere?'],
  ['distributesGoods', 'Does it distribute goods, in Canada or elsewhere?'],
  ['importsGoods', 'Does it import into Canada goods produced outside Canada?'],
  ['controlsEntityWithGoodsActivity', 'Does it control an entity that does any of these?'],
]
export const YEARS = ['recent', 'prior'] as const
export const FIGURES: [string, string][] = [['assets', 'Assets'], ['revenue', 'Revenue'], ['avg_employees', 'Average employees']]
export const ENTITY_LABEL = { entity: 'An entity under the Act', 'not-entity': 'Not an entity under the Act', undetermined: 'Not yet determined' } as const
/** Only s.9(a) is ever quoted with the result (lib/s211/obligation.ts, S211_ACT_9A_QUOTED). */
export const ACT_9A_LABEL = 'The Act, s.9(a)'
export const SCREENING_NOTE = 'This is a screening result from your answers. It is not legal advice. The guidance encourages entities that are unsure to seek advice from their legal counsel.'

export const fromTri = (s: string | undefined): boolean | null => (s === 'yes' ? true : s === 'no' ? false : null)
export const toTri = (v: boolean | null | undefined): string => (v === true ? 'yes' : v === false ? 'no' : '')
const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** The year's figures, or null when none was given (the lookback then says it was not run). */
function year(f: ApplicabilityForm, p: (typeof YEARS)[number]): S211YearFigures | null {
  const assets = num(f[`${p}_fy_assets`]), revenue = num(f[`${p}_fy_revenue`]), averageEmployees = num(f[`${p}_fy_avg_employees`])
  if (assets === null && revenue === null && averageEmployees === null) return null
  const c = (f[`${p}_fy_currency`] ?? '').trim().toUpperCase()
  return { assets, revenue, averageEmployees, currency: /^[A-Z]{3}$/.test(c) ? c : 'CAD' }
}

/** The result for a form, from the builder's own engines. Unanswered goods questions count as "not sure". */
export function evaluateApplicability(f: ApplicabilityForm) {
  const input: S211EntityInput = {
    listedInCanada: fromTri(f.listed_in_canada), placeOfBusinessInCanada: fromTri(f.place_of_business_in_canada),
    doesBusinessInCanada: fromTri(f.does_business_in_canada), hasAssetsInCanada: fromTri(f.has_assets_in_canada),
    mostRecentYear: year(f, 'recent'), priorYear: year(f, 'prior'),
  }
  const entity = evaluateS211Entity(input)
  const answers = Object.fromEntries(ACTIVITY_QUESTIONS.map(([k]) => [k, (f[k] || 'not-sure') as S211Answer])) as S211Activities
  const unanswered = ACTIVITY_QUESTIONS.filter(([k]) => !f[k]).length
  return { entity, obligation: evaluateS211Obligation(entity, answers), unanswered }
}

/** The report columns a form sets (app/api/s211/reports/[id] PATCH; lib/s211/reportPatch.ts checks them). */
export function formToReportPatch(f: ApplicabilityForm): Record<string, boolean | number | string | null> {
  return {
    ...Object.fromEntries(PRESENCE_QUESTIONS.map(([k]) => [k, fromTri(f[k])])),
    ...Object.fromEntries(YEARS.flatMap(p => [
      [`${p}_fy_assets`, num(f[`${p}_fy_assets`])], [`${p}_fy_revenue`, num(f[`${p}_fy_revenue`])],
      [`${p}_fy_avg_employees`, num(f[`${p}_fy_avg_employees`])],
      [`${p}_fy_currency`, /^[A-Z]{3}$/.test((f[`${p}_fy_currency`] ?? '').trim().toUpperCase()) ? f[`${p}_fy_currency`].trim().toUpperCase() : null],
    ])),
  }
}

/** The goods answers as section 1 keeps them (report_details._applicability). */
export const formToActivities = (f: ApplicabilityForm): Record<string, string> =>
  Object.fromEntries(ACTIVITY_QUESTIONS.map(([k]) => [k, f[k] ?? '']))

/** A stored draft, trusted only for the keys the form has and only as strings. */
export function parseApplicabilityDraft(u: unknown): ApplicabilityForm | null {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null
  const keys = new Set([
    ...PRESENCE_QUESTIONS.map(([k]) => k), ...ACTIVITY_QUESTIONS.map(([k]) => k as string),
    ...YEARS.flatMap(p => [...FIGURES.map(([k]) => `${p}_fy_${k}`), `${p}_fy_currency`]),
  ])
  const out: ApplicabilityForm = {}
  for (const [k, v] of Object.entries(u as Record<string, unknown>)) if (keys.has(k) && typeof v === 'string' && v.length <= 40) out[k] = v
  return Object.values(out).some(v => v !== '') ? out : null
}

// ── Input helpers for the form's layout (30 Sep 2026). They change how answers are typed and shown,
// never what the engines receive: amounts are stored as plain digit strings, and one currency is
// stored against both years, the same keys the form always had.

/** What a user typed into an amount field, as the form stores it: digits and one decimal point only. */
export function parseAmountInput(typed: string): string {
  const cleaned = typed.replace(/[^\d.]/g, '')
  const dot = cleaned.indexOf('.')
  return dot < 0 ? cleaned : `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '')}`
}

/** A stored amount as shown while typing: thousands separators, the decimal part left as typed. */
export function formatAmount(stored: string | undefined): string {
  if (!stored) return ''
  const [whole, frac] = stored.split('.')
  const grouped = whole.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return frac !== undefined ? `${grouped}.${frac}` : grouped
}

/** The one currency the form shows: the most recent year's, then the prior year's, else CAD. */
export const formCurrency = (f: ApplicabilityForm): string =>
  (f.recent_fy_currency || f.prior_fy_currency || 'CAD').toUpperCase()

/** True when two saved years disagree on currency, so choosing one changes a saved figure's basis. */
export const currenciesDiffer = (f: ApplicabilityForm): boolean =>
  !!f.recent_fy_currency && !!f.prior_fy_currency && f.recent_fy_currency.toUpperCase() !== f.prior_fy_currency.toUpperCase()

/** Choosing the currency sets it for both years: the keys the engine reads are unchanged. */
export const withCurrency = (f: ApplicabilityForm, c: string): ApplicabilityForm =>
  ({ ...f, recent_fy_currency: c, prior_fy_currency: c })

export const PRESENCE_KEYS = PRESENCE_QUESTIONS.map(([k]) => k)
/** Listed in Canada: an entity at any size, so the size step can be folded away (its figures are kept). */
export const isListed = (f: ApplicabilityForm) => f.listed_in_canada === 'yes'
/** All four connection questions answered No: the size test cannot make it an entity. */
export const noCanadaConnection = (f: ApplicabilityForm) => PRESENCE_KEYS.every(k => f[k] === 'no')
