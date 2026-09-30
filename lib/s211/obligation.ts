// lib/s211/obligation.ts
// Whether an entity has to report under Part 2 of the Fighting Against Forced Labour and Child Labour
// in Supply Chains Act. Pure: it takes the entity test's result (lib/s211/entity.ts) and five answers
// about what the organisation does with goods.
//
// ⚠️ THE ACT AND THE GUIDANCE DIFFER, AND THIS FOLLOWS THE ACT AND QUOTES THE GUIDANCE. Section 9(a)
// applies Part 2 to an entity "producing, selling or distributing goods". Public Safety Canada's
// guidance lists producing, importing and controlling only, and says "Entities solely involved in
// distributing and selling are not expected to report under the Act."
//   An organisation that only sells and distributes therefore gets its OWN outcome,
// 'within_act_not_expected': inside the Act, and not expected to report under the current guidance. It
// is neither 'must-report' (the regulator says it does not expect a report) nor 'does-not-have-to-
// report' (the statute reaches it, and a reader told that stops looking). The result carries s.9(a)
// and the guidance sentence verbatim, and says that the earlier commitment not to enforce has been
// withdrawn, so filing voluntarily is a judgement for the entity. Decision of 30 Sep 2026.
//
// ⚠️ "VERY MINOR DEALINGS" IS QUOTED, NOT APPLIED. The guidance reads producing and importing as
// excluding them, and says to judge by scale, frequency and relevance. No answer here can establish
// that, so a 'yes' to producing or importing is a 'yes', and the guidance text travels with the result.

import type { S211EntityResult } from './entity'
import {
  S211_ACT_SECTION_9, S211_GUIDANCE_REPORTING_OBLIGATION, S211_GUIDANCE_SELL_DISTRIBUTE_ONLY, S211_GUIDANCE_VERY_MINOR_DEALINGS,
  S211_GUIDANCE_PRIOR_NO_ENFORCEMENT, S211_GUIDANCE_PAGE_MODIFIED,
} from './requirements'

export type S211Answer = 'yes' | 'no' | 'not-sure'

/** What the organisation does with goods. One answer each; the first three are s.9(a). */
export type S211Activities = {
  /** s.9(a): producing goods in Canada or elsewhere. */
  producesGoods: S211Answer
  /** s.9(a): selling goods in Canada or elsewhere. */
  sellsGoods: S211Answer
  /** s.9(a): distributing goods in Canada or elsewhere. */
  distributesGoods: S211Answer
  /** s.9(b): importing into Canada goods produced outside Canada. */
  importsGoods: S211Answer
  /** s.9(c): controlling an entity engaged in any activity in s.9(a) or (b). */
  controlsEntityWithGoodsActivity: S211Answer
}

export type S211ObligationOutcome = 'must-report' | 'within_act_not_expected' | 'does-not-have-to-report' | 'undetermined'
export const S211_OUTCOME_LABEL: Record<S211ObligationOutcome, string> = {
  'must-report': 'Must report',
  within_act_not_expected: 'Within the Act (s.9(a) covers selling and distributing goods), but not expected to report under current Public Safety Canada guidance.',
  'does-not-have-to-report': 'Does not have to report',
  undetermined: 'Undetermined',
}

export type S211ObligationResult = {
  outcome: S211ObligationOutcome
  /** The paragraphs of s.9 a 'yes' answer falls under, in order. */
  actParagraphs: ('a' | 'b' | 'c')[]
  /** Set for 'within_act_not_expected' only: the guidance sentence, verbatim. null in every other case. */
  guidanceCaveat: string | null
  /** Set for 'within_act_not_expected' only: s.9(a) of the Act, verbatim, with its lead-in. */
  actQuoted: string | null
  /** Plain sentences, in order: what decided the outcome, then what qualifies it. */
  reasons: string[]
  /** Guidance text a reader of this result should see, verbatim. */
  guidanceQuoted: string[]
}

const ACTIVITY_NAME: Record<keyof S211Activities, string> = {
  producesGoods: 'produces goods',
  sellsGoods: 'sells goods',
  distributesGoods: 'distributes goods',
  importsGoods: 'imports into Canada goods produced outside Canada',
  controlsEntityWithGoodsActivity: 'controls an entity that produces, sells, distributes or imports goods',
}
const KEYS = Object.keys(ACTIVITY_NAME) as (keyof S211Activities)[]
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export const S211_SELL_DISTRIBUTE_REASON =
  'Section 9(a) of the Act applies to an entity selling or distributing goods, so the Act reaches it. Public Safety Canada’s guidance takes a narrower position, quoted here; it is guidance and not the statute.'
/** s.9(a) as one sentence: the Act's lead-in and paragraph (a), both verbatim. */
export const S211_ACT_9A_QUOTED = `${S211_ACT_SECTION_9.leadIn} ${S211_ACT_SECTION_9.paragraphs[0].text}`
// The guidance page is dated 18 December 2025. The sentence it dropped is quoted from its earlier
// versions; see S211_GUIDANCE_PRIOR_NO_ENFORCEMENT in lib/s211/requirements.ts for where that was read.
export const S211_ENFORCEMENT_COMMITMENT_WITHDRAWN =
  `Earlier versions of the guidance added: "${S211_GUIDANCE_PRIOR_NO_ENFORCEMENT}" The current version, dated ${S211_GUIDANCE_PAGE_MODIFIED}, no longer says so. Whether to file voluntarily is therefore a judgement for the entity.`
export const S211_NOT_AN_ENTITY_REASON = 'It is not an entity under section 2, so Part 2 of the Act does not apply to it.'
export const S211_NO_ACTIVITY_REASON = 'It does none of the things section 9 of the Act lists: producing, selling, distributing or importing goods, or controlling an entity that does.'
export const S211_ENTITY_UNSETTLED_REASON = 'Whether it is an entity under section 2 is not settled, so the reporting obligation cannot be settled either.'

export function evaluateS211Obligation(entity: Pick<S211EntityResult, 'outcome'>, a: S211Activities): S211ObligationResult {
  const yes = KEYS.filter(k => a[k] === 'yes')
  const notSure = KEYS.filter(k => a[k] === 'not-sure')
  const paragraphs = [
    ...(a.producesGoods === 'yes' || a.sellsGoods === 'yes' || a.distributesGoods === 'yes' ? ['a' as const] : []),
    ...(a.importsGoods === 'yes' ? ['b' as const] : []),
    ...(a.controlsEntityWithGoodsActivity === 'yes' ? ['c' as const] : []),
  ]
  const result = (outcome: S211ObligationOutcome, reasons: string[], extra: Partial<S211ObligationResult> = {}): S211ObligationResult =>
    ({ outcome, actParagraphs: paragraphs, guidanceCaveat: null, actQuoted: null, reasons, guidanceQuoted: [], ...extra })

  // Not an entity: Part 2 does not apply, whatever it does with goods.
  if (entity.outcome === 'not-entity') return result('does-not-have-to-report', [S211_NOT_AN_ENTITY_REASON])

  // Every activity answered "no": section 9 is not met, entity or not.
  if (yes.length === 0 && notSure.length === 0)
    return result('does-not-have-to-report', [S211_NO_ACTIVITY_REASON], { guidanceQuoted: [S211_GUIDANCE_REPORTING_OBLIGATION.after] })

  const unsure = notSure.length ? [`Not sure whether it ${list(notSure.map(k => ACTIVITY_NAME[k]))}.`] : []

  if (yes.length === 0)
    return result('undetermined', [
      ...unsure,
      'No activity in section 9 of the Act was confirmed and not all were ruled out, so whether Part 2 applies is not settled.',
      ...(entity.outcome === 'undetermined' ? [S211_ENTITY_UNSETTLED_REASON] : []),
    ])

  const does = `It ${list(yes.map(k => ACTIVITY_NAME[k]))}, which section 9(${paragraphs.join(') and 9(')}) of the Act covers.`

  if (entity.outcome === 'undetermined') return result('undetermined', [does, S211_ENTITY_UNSETTLED_REASON, ...unsure])

  // An entity, with at least one section 9 activity.
  const beyondSelling = a.producesGoods === 'yes' || a.importsGoods === 'yes' || a.controlsEntityWithGoodsActivity === 'yes'
  if (beyondSelling) {
    const producesOrImports = a.producesGoods === 'yes' || a.importsGoods === 'yes'
    return result('must-report', ['It is an entity under section 2.', does, ...unsure],
      { guidanceQuoted: producesOrImports ? [...S211_GUIDANCE_VERY_MINOR_DEALINGS] : [] })
  }

  // Only selling or distributing is confirmed. Within the Act; not expected to report under the
  // current guidance; and the earlier commitment not to enforce is gone.
  // If another activity is "not sure", "solely" is itself unsettled, and that is said.
  return result('within_act_not_expected', [
    'It is an entity under section 2.', does, S211_SELL_DISTRIBUTE_REASON, S211_ENFORCEMENT_COMMITMENT_WITHDRAWN,
    ...(notSure.length ? [`${unsure[0]} The guidance’s position covers an entity that ONLY sells and distributes, which is not settled here.`] : []),
  ], { guidanceCaveat: S211_GUIDANCE_SELL_DISTRIBUTE_ONLY, actQuoted: S211_ACT_9A_QUOTED, guidanceQuoted: [S211_GUIDANCE_SELL_DISTRIBUTE_ONLY] })
}
