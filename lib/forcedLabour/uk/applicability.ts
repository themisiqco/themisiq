// lib/forcedLabour/uk/applicability.ts
// Whether section 54 of the Modern Slavery Act 2015 requires a statement, from the answers to the UK check.
// Pure. Stage D1 (1 Oct 2026). UK-specific copy, so British spelling; quotations are the constants'.
//
// THE TEST, from the verified constants (lib/forcedLabour/uk/requirements.ts):
//   a "commercial organisation" (s.54(12)): a body corporate or a partnership, carrying on a business, or
//   part of a business, in any part of the United Kingdom;
//   that supplies goods or services (s.54(2)(a));
//   with a total turnover of NOT LESS THAN £36 million (s.54(2)(b), SI 2015/1833 reg. 2), counting the
//   turnover of its subsidiary undertakings, net of trade discounts, VAT and other taxes (reg. 3).
// Exactly £36,000,000 is in scope (lib/forcedLabour/assessSummary.ts ukTurnoverInScope, the one comparison).
//
// THE FIGURE. The check asks for turnover in GBP as regulation 3 defines it. It may start as an ESTIMATE,
// converted from the organisation's shared revenue figure at the dated ECB rate (lib/fx.ts); neither the
// Act nor the regulations say how a figure in another currency is converted. Once the user confirms or
// replaces it the basis is 'confirmed' and the verdict is definite; while it is still the estimate, a
// verdict that turns on it says so.

import {
  UK_MSA_S54_2, UK_MSA_S54_12_COMMERCIAL_ORGANISATION, UK_REGS_2, UK_REGS_3_1, UK_REGS_3_2, UK_GUIDANCE_DETERMINE,
} from './requirements'
import { ukTurnoverInScope, UK_TURNOVER_THRESHOLD_GBP } from '../assessSummary'
import { convertFx, isFxCurrency, FX_AS_OF } from '../../fx'

export type UkApplicabilityForm = {
  /** 'body_corporate' | 'partnership' | 'other' | '' */
  org_form?: string
  /** 'yes' | 'no' | '' : carries on a business, or part of a business, in any part of the UK */
  uk_business?: string
  /** 'yes' | 'no' | '' : supplies goods or services */
  supplies?: string
  /** Turnover in GBP as regulation 3 defines it, as plain digits. */
  turnover_gbp?: string
  /** 'estimate' (pre-filled from a conversion, untouched) | 'confirmed' (confirmed or replaced by the user) */
  turnover_basis?: string
  /** Where an estimate came from, for the sentence that labels it. */
  estimate_from_amount?: string
  estimate_from_currency?: string
  estimate_rate_date?: string
}

export type UkOutcome = 'required' | 'not-required' | 'undetermined'
export const UK_OUTCOME_LABEL: Record<UkOutcome, string> = {
  required: 'A statement is required',
  'not-required': 'A statement is not required',
  undetermined: 'Not yet determined',
}

export const UK_ORG_FORMS = [
  { value: 'body_corporate', label: 'A body corporate (for example a company or an LLP)' },
  { value: 'partnership', label: 'A partnership' },
  { value: 'other', label: 'Neither (for example a trust or a sole trader)' },
] as const

/** A statutory list item as running text: its trailing ", and", ", or", dash or stop removed. */
const strip = (s: string) => s.replace(/[,;]?\s+(and|or)$/, '').replace(/[—,;.:]+$/, '').trim()
/** "a, b and c": the statute's list as running text, its own "and" kept before the last item. */
const andList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
/** The Act's words for each condition, quoted with the result. */
export const UK_QUOTED = {
  commercialOrganisation: `${strip(UK_MSA_S54_12_COMMERCIAL_ORGANISATION.leadIn)} ${UK_MSA_S54_12_COMMERCIAL_ORGANISATION.items.map(strip).join(', or ')}`,
  supplies: strip(UK_MSA_S54_2.paragraphs[0].text),
  turnover: strip(UK_MSA_S54_2.paragraphs[1].text),
  threshold: UK_REGS_2,
  turnoverIncludes: `${strip(UK_REGS_3_1.leadIn)} ${UK_REGS_3_1.paragraphs.map(p => strip(p.text)).join(' and ')}`,
  turnoverMeans: `${strip(UK_REGS_3_2.leadIn)} ${andList(UK_REGS_3_2.paragraphs.map(p => strip(p.text)))}`,
} as const
export const UK_SCREENING_NOTE = `This is a screening result from your answers. It is not legal advice. The statutory guidance says: “${UK_GUIDANCE_DETERMINE}”`

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const yn = (s: string | undefined): boolean | null => (s === 'yes' ? true : s === 'no' ? false : null)

export type UkApplicability = {
  outcome: UkOutcome
  reasons: string[]
  /** True when the outcome turns on turnover and the figure is still the unconfirmed estimate. */
  restsOnEstimate: boolean
  unanswered: string[]
}

export function evaluateUkApplicability(f: UkApplicabilityForm): UkApplicability {
  const reasons: string[] = []
  const unanswered: string[] = []
  const form = f.org_form ?? ''
  const business = yn(f.uk_business)
  const supplies = yn(f.supplies)
  const turnover = num(f.turnover_gbp)
  const estimate = turnover !== null && f.turnover_basis !== 'confirmed'

  // A condition that is plainly not met settles it, whatever else is unanswered.
  const notMet: string[] = []
  if (form === 'other') notMet.push('It is neither a body corporate nor a partnership, so it is not a commercial organisation under section 54(12).')
  if (business === false) notMet.push('It does not carry on a business, or part of a business, in any part of the United Kingdom.')
  if (supplies === false) notMet.push('It does not supply goods or services (section 54(2)(a)).')
  const turnoverBelow = turnover !== null && !ukTurnoverInScope(turnover)
  if (notMet.length > 0) return { outcome: 'not-required', reasons: notMet, restsOnEstimate: false, unanswered }

  if (form === '') unanswered.push('Whether it is a body corporate or a partnership')
  if (business === null) unanswered.push('Whether it carries on a business, or part of a business, in the United Kingdom')
  if (supplies === null) unanswered.push('Whether it supplies goods or services')
  if (turnover === null) unanswered.push('Total turnover in GBP')

  if (turnoverBelow) {
    return {
      outcome: 'not-required',
      reasons: [`Total turnover of ${gbp(turnover!)} is less than the ${gbp(UK_TURNOVER_THRESHOLD_GBP)} in regulation 2.`],
      restsOnEstimate: estimate, unanswered,
    }
  }
  if (unanswered.length > 0) return { outcome: 'undetermined', reasons: [], restsOnEstimate: false, unanswered }

  reasons.push(form === 'body_corporate' ? 'It is a body corporate carrying on a business in the United Kingdom.' : 'It is a partnership carrying on a business in the United Kingdom.')
  reasons.push('It supplies goods or services.')
  reasons.push(`Total turnover of ${gbp(turnover!)} is not less than the ${gbp(UK_TURNOVER_THRESHOLD_GBP)} in regulation 2.`)
  return { outcome: 'required', reasons, restsOnEstimate: estimate, unanswered }
}

export const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`

/** The sentence a verdict that turns on the estimate carries. */
export const ESTIMATE_CAVEAT =
  'This result rests on an estimated turnover, converted from another currency. Confirm the figure, or replace it with turnover as regulation 3 defines it, for a definite result.'

/**
 * The starting estimate: the organisation's revenue converted to GBP at the dated ECB rate. Null when there is
 * no figure or no rate for its currency (never a guess).
 */
export function turnoverEstimate(amount: number | null, currency: string | null | undefined):
  { turnover_gbp: string; turnover_basis: 'estimate'; estimate_from_amount: string; estimate_from_currency: string; estimate_rate_date: string } | null {
  if (amount === null || !Number.isFinite(amount) || amount < 0 || !isFxCurrency(currency)) return null
  return {
    turnover_gbp: String(Math.round(convertFx(amount, currency, 'GBP'))),
    turnover_basis: 'estimate',
    estimate_from_amount: String(amount), estimate_from_currency: currency, estimate_rate_date: FX_AS_OF,
  }
}

/** The label under an estimated figure. */
export const estimateLabel = (f: UkApplicabilityForm, longDate: (iso: string) => string): string | null =>
  f.turnover_basis === 'estimate' && f.estimate_from_amount && f.estimate_from_currency && f.estimate_rate_date
    ? `Estimate: ${Number(f.estimate_from_amount).toLocaleString('en-GB')} ${f.estimate_from_currency} converted to GBP at the ECB reference rate of ${longDate(f.estimate_rate_date)}. Neither the Act nor the regulations say how a figure in another currency is converted. Confirm it, or replace it with turnover as regulation 3 defines it.`
    : null

/** The form keys a stored applicability record may hold, as strings only. */
export const UK_APPLICABILITY_KEYS = [
  'org_form', 'uk_business', 'supplies', 'turnover_gbp', 'turnover_basis', 'estimate_from_amount', 'estimate_from_currency', 'estimate_rate_date',
] as const
export function cleanUkApplicability(u: unknown): UkApplicabilityForm | null {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null
  const out: Record<string, string> = {}
  for (const k of UK_APPLICABILITY_KEYS) {
    const v = (u as Record<string, unknown>)[k]
    if (v === undefined) continue
    if (typeof v !== 'string' || v.length > 40) return null
    out[k] = v
  }
  if (out.org_form && !['body_corporate', 'partnership', 'other'].includes(out.org_form)) return null
  for (const k of ['uk_business', 'supplies']) if (out[k] && !['yes', 'no'].includes(out[k])) return null
  if (out.turnover_basis && !['estimate', 'confirmed'].includes(out.turnover_basis)) return null
  if (out.turnover_gbp && !/^\d+(\.\d+)?$/.test(out.turnover_gbp)) return null
  return out
}
