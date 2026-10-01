// lib/forcedLabour/assessSummary.ts
// The UK and Australian thresholds and the short per-country sentences /assess shows for the Modern Slavery
// entry. Pure, so the boundary can be tested directly: the /assess revenue answer is a USD band, and no
// band lands on £36 million or AUD 100 million exactly.
//
// ⚠️ THE FIGURES AND COMPARISONS ARE THE LAW'S, AND assessSummary.test.ts TIES THEM TO THE VERBATIM
// CONSTANTS. UK: s.54(2)(b) "not less than" the amount in SI 2015/1833 reg. 2, "£36 million", so exactly
// £36 million is in scope. Australia: s.5(1)(a) "at least $100 million". Both are >=. The UK rule was `>`
// until 1 Oct 2026, which left an organization at exactly £36 million out.
//
// The sentences are rebuilt from the constants' own pieces (the statute's trailing dashes and list
// punctuation removed so they read as one sentence), not retyped, so a correction to a constant reaches
// /assess. They are our copy around the law's words: no em-dashes, Canadian spelling.

import { UK_MSA_S54_4 } from './uk/requirements'
import { AU_MSA_S16_1 } from './au/requirements'

export const UK_TURNOVER_THRESHOLD_GBP = 36_000_000
export const AU_REVENUE_THRESHOLD_AUD = 100_000_000

/** s.54(2)(b) with SI 2015/1833 reg. 2: total turnover of not less than £36 million. */
export const ukTurnoverInScope = (turnoverGbp: number): boolean => turnoverGbp >= UK_TURNOVER_THRESHOLD_GBP
/** s.5(1)(a): consolidated revenue of at least $100 million. */
export const auRevenueInScope = (revenueAud: number): boolean => revenueAud >= AU_REVENUE_THRESHOLD_AUD

/** One statutory list item as running text: trailing list punctuation off, a mid-item dash read as a comma. */
const clean = (s: string) => s.replace(/[—:]$/, '').replace(/[;,.]( and| or)?$/, '').replace(/—/g, ', ').trim()

/** s.54(4) as one sentence: the steps taken, or that none were taken. */
const ukStatement = (() => {
  const [a, b] = UK_MSA_S54_4.paragraphs
  const where = a.sub!.map(s => clean(s.text)).join(' and ')
  return `${clean(a.text)} ${where}, or ${clean(b.text)}`
})()

/** The s.16(1) criteria, (a) to (g), each as the Act words it. */
const auCriteria = AU_MSA_S16_1.paragraphs
  .map(p => `(${p.letter}) ${clean(p.text)}${'sub' in p && p.sub ? ' ' + p.sub.map(s => `(${s.numeral}) ${clean(s.text)}`).join(', ') : ''}`)
  .join('; ')

export const UK_ASSESS_WHO =
  'UK Modern Slavery Act 2015 s.54: a body corporate or partnership, wherever incorporated or formed, that carries on a business in any part of the UK and supplies goods or services, with total turnover (its own and its subsidiaries’) of not less than GBP 36,000,000.'
export const UK_ASSESS_CONTENT =
  `The Act requires, for each financial year, ${ukStatement}. The six areas in s.54(5) are recommended, not required.`

export const AU_ASSESS_WHO =
  'Australian Modern Slavery Act 2018 s.5: an Australian entity, or an entity carrying on business in Australia, with consolidated revenue of at least AUD 100,000,000 for the reporting period (including entities it controls).'
export const AU_ASSESS_CONTENT =
  `The Act requires a statement, approved by the principal governing body and signed by a responsible member, that addresses the ${AU_MSA_S16_1.paragraphs.length} mandatory criteria in s.16(1): ${auCriteria}.`

export const UK_ASSESS_TIMING = 'UK: the guidance recommends publishing within six months of the financial year end; the Act sets no deadline'
export const AU_ASSESS_TIMING = 'Australia: within 6 months after the end of the reporting period, under the Act'

/** The timing line for whichever of the two apply. */
export const assessTiming = (uk: boolean, au: boolean): string =>
  [uk && UK_ASSESS_TIMING, au && AU_ASSESS_TIMING].filter(Boolean).join(' · ')
