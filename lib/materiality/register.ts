/**
 * The DIVERGENCE register — the stakeholder signal from a survey round, beside the preparer's own
 * determinations for an assessment.
 *
 * PURE. No React, no Supabase, no I/O, no dates. The lib/ghg/engine.ts and lib/materiality/severity.ts
 * pattern: the methodology lives here and callers render its output. A second derivation in a
 * component is the regression this shape exists to prevent.
 *
 * ⚠️ THIS IS NOT THE DISAGREEMENT REGISTER, AND THE TWO ARE ROUTINELY CONFUSED.
 *   disagreement register (survey_aggregate, §6.2.6)  respondents disagree with EACH OTHER
 *   divergence register   (this module)               respondents differ from the PREPARER
 * A sub-topic can appear on both. survey_aggregate's own `what_this_is` says the divergence register
 * "is not built" — that sentence is now stale, and it lives in 20260837's payload, not here.
 *
 * The payload mirrors survey_aggregate's disagreement_register — what_this_is, triggers_active,
 * triggers_inactive, entries — so the two sections read alike to a customer who meets them on the
 * same page. Two additions, both deliberate:
 *   `omitted`             every sub-topic that could not be judged, with its reason. §6.1's rule
 *                         that absence is not a low, applied at the register level.
 *   triggers_inactive     objects with a `reason`, not bare strings. The string[] form forced the
 *                         results page to hard-code "see the method below" beside it, which is the
 *                         disclosure living somewhere other than the payload that owns it.
 *
 *
 * =====================================================================
 * ⚠️ computeSeverity IS THE ONLY AUTHORITY ON MATERIALITY
 * =====================================================================
 * This module never compares a severity against a threshold, never re-derives the mean, never
 * reimplements the max rule for social topics and never reads MEAN_THRESHOLD. It asks
 * computeSeverity and reads `.material`. Every reason severity.ts gives for that — the top-band
 * override, the social max that subsumes it, the two-dimension positive case that lands exactly on
 * the threshold — is a reason a second comparison here would eventually disagree with the engine.
 * The register would then print a materiality conclusion the worksheet does not hold.
 *
 * ⚠️ CATEGORY IS PASSED IN, PER SUB-TOPIC, FROM mr_esrs_topics.category. It is NEVER derived from
 * the sub-topic code. See severity.ts line 49: `topic_code LIKE 'S%'` is "correct for a one-off
 * check against a seed you can read, and a latent defect the moment it becomes the routing rule for
 * a live response". Category decides mean-versus-max, so getting it from the string would change
 * the number.
 *
 *
 * =====================================================================
 * ⚠️ DRAFTS ARE ABSENT, NOT LOW — AND THE FILTER LIVES HERE
 * =====================================================================
 * Only determinations with status = 'submitted' are read. A draft is somebody's work in progress;
 * treating it as a determination would publish an opinion nobody has stood behind, and treating it
 * as "not material" would be §6.1's forbidden move of scoring an absence as a low.
 *
 * The filter is applied INSIDE this module rather than in the caller's query, so that it is visible
 * to a reader of the methodology and reachable by a test. A filter in a `.eq('status','submitted')`
 * somewhere in a route is invisible to both, and silently changes the register's meaning if anyone
 * relaxes it.
 *
 *
 * =====================================================================
 * ⚠️ S1.x AND S2.x ARE NEVER MERGED
 * =====================================================================
 * 20260826's header: S1.3 and S2.3 are separate questions put to separate populations about
 * separate workplaces, so a difference between them is not disagreement — it is two populations
 * reporting different conditions, which is a finding about the company. The same holds here. Each
 * sub-topic is judged against its OWN determinations and appears as its own entry; there is
 * deliberately no shape in this module that can hold a pair, which is what makes the rule
 * structural rather than a comment. WHAT_THIS_IS_NOT says so in words as well, because
 * 20260826 records that a consumer will otherwise merge them.
 *
 *
 * =====================================================================
 * ⚠️ NO VERDICT, NO ADJECTIVE
 * =====================================================================
 * An entry states two facts side by side and stops. It never says a divergence is concerning,
 * significant, a gap, a problem or a risk, and it never says which side is right. The customer is
 * the one who decides what a divergence means; the register's job is to make sure they see it
 * before they publish. The words 'material' and 'not material' are the standard's own.
 */

import {
  computeSeverity,
  type Direction,
  type Dimension,
  type Nature,
  type SeverityResult,
  type SeverityRule,
  type TopicCategory,
} from './severity'

// ── shapes, mirroring the survey payload the results page already reads ──────────────────────────
// Structural mirrors of app/components/surveyEvidence.tsx rather than imports: that module is a
// .tsx carrying React components, and importing it would put React inside a pure module. A real
// Overall is assignable to this one.

export type Dist = { '1': number; '2': number; '3': number }

/** ⚠️ An OBJECT, not a bare number. The denominator travels with the share and is printed beside it. */
export type TopBox = { share: number | null; numerator: number; denominator: number }

export type Overall = {
  n_asked: number; n_answered: number; n_abstained: number; n_skipped: number; n_not_asked?: number
  distribution: Dist; top_box: TopBox
  median_low: number | null; median_high: number | null
  modal_share: number | null; polarised: boolean
}

/** One row of the preparer's worksheet. Mirrors materiality_impact_determinations. */
export type Determination = {
  direction: Direction
  nature: Nature
  /** Only 'submitted' is read. See the header. */
  status: string
  scale: number | null
  scope: number | null
  /** Ignored by computeSeverity when direction is 'positive' (¶41). */
  irremediability?: number | null
  likelihood?: number | null
}

/** Mirrors the results page's SubTopic, plus the category and the determinations. */
export type RegisterSubTopic = {
  subtopic_code: string
  topic_code: string
  topic_label: string
  /** Resolved by lib/materiality/subtopicName.ts before it gets here. null when no name is known. */
  short_name: string | null
  /** ⚠️ mr_esrs_topics.category. Never derived from subtopic_code. */
  category: TopicCategory
  /** Scope status. Anything other than 'included' is out of scope for this assessment. */
  status: string
  exclusion_reason: string | null
  overall: Overall | null
  determinations: Determination[]
}

export type RegisterInput = {
  /** Entry order is preserved, so the caller's sort_order survives into the register. */
  subtopics: RegisterSubTopic[]
  /**
   * The round's SNAPSHOTTED materiality_survey_rounds.top_box_high_min_share (20260843), not the
   * current mr_survey_thresholds row. A round already run must keep producing the figures it
   * produced.
   */
  topBoxHighMinShare: number
}

export type DivergenceKind = 'stakeholder_high' | 'assessment_high'

export type OmissionReason =
  | 'excluded_at_scope'
  | 'no_substantive_answers'
  | 'no_submitted_determination'
  | 'direction_never_scored'
  | 'determination_incomplete'

/**
 * One direction's determination, carried so the register can show its working without re-deriving.
 *
 * ⚠️ EVERY SUBMITTED DIRECTION APPEARS HERE, INCLUDING AN INCOMPLETE ONE. Under the asymmetric rule
 * below a sub-topic can be judged material on one direction while the other is unscored, and a
 * reader has to be able to see that. `material` is therefore `null` — never `false` — when the
 * determination is incomplete: an unscored direction has no conclusion, and `false` would assert
 * one. §6.1, one level up from the dimension it was written about.
 */
export type DirectionOutcome = {
  direction: Direction
  nature: Nature
  /** null when `complete` is false. Never read as "not material". */
  material: boolean | null
  complete: boolean
  severity: number | null
  rule: SeverityRule | null
  basis: Dimension[]
  /** Dimensions not scored. Empty when complete. */
  missing: Dimension[]
}

export type RegisterEntry = {
  subtopic_code: string
  topic_code: string
  topic_label: string
  short_name: string | null
  kind: DivergenceKind
  stakeholder: {
    /** ⚠️ Substantive responses only — asked and rated. Abstentions and skips are not in the denominator. */
    share: number
    numerator: number
    denominator: number
    n_answered: number
    statement: string
  }
  assessment: {
    material: boolean
    /**
     * Which direction(s) carried materiality. An ARRAY because both can, and naming one would
     * misreport the other. Empty on a stakeholder_high entry, where nothing carried it.
     * ⚠️ Never netted — ¶44. Two directions material is two findings, not a bigger one.
     */
    carried_by: Direction[]
    directions: DirectionOutcome[]
    statement: string
  }
}

export type OmittedSubTopic = {
  subtopic_code: string
  short_name: string | null
  topic_label: string
  reason: OmissionReason
  /** What was actually observed — the exclusion_reason, the missing direction, the missing dimensions. */
  detail: string | null
}

export type DivergenceRegister = {
  heading: string
  what_this_is: string
  what_this_is_not: string
  threshold: { top_box_high_min_share: number; note: string }
  triggers_active: DivergenceKind[]
  triggers_inactive: { name: string; reason: string }[]
  entries: RegisterEntry[]
  /** ⚠️ Never folded into entries. A sub-topic nobody could judge is not a sub-topic that agrees. */
  omitted: OmittedSubTopic[]
}

/**
 * Thrown for input that cannot be interpreted — a share outside 0-1, or two submitted
 * determinations for the same direction. NOT used for absence: absence is an `omitted` row with a
 * reason. Silently picking one of two contradictory determinations would put an arbitrary row's
 * conclusion into a compliance figure.
 */
export class RegisterInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegisterInputError'
  }
}

// ── customer-facing prose. ONE copy, exported as data. ───────────────────────────────────────────

export const HEADING = 'Where stakeholder views and your assessment differ'

export const WHAT_THIS_IS =
  'These are topics where what respondents told you and what your assessment concluded point in ' +
  'different directions. Both are normal outcomes of the process. They are listed here so you can ' +
  'consider each one before you publish.'

export const WHAT_THIS_IS_NOT =
  'NOT the disagreement register, which reports sub-topics where respondents disagree with each ' +
  'other; a sub-topic can appear on both. And never a comparison between S1 and S2 sub-topics: ' +
  'those are different questions put to different populations about different workplaces, so a ' +
  'difference between them is a finding about the company rather than a divergence from your ' +
  'assessment. Each sub-topic here is compared only against its own determinations.'

export const TRIGGERS_ACTIVE: DivergenceKind[] = ['stakeholder_high', 'assessment_high']

export const TRIGGERS_INACTIVE: { name: string; reason: string }[] = [
  {
    name: 'respondent_group_breakdown',
    reason:
      'The register reports at sub-topic level only. Splitting a divergence by respondent group ' +
      'would require a suppression design across the group dimension — small groups can be ' +
      're-identified, and a register may not name a cell it cannot show — and that design has not ' +
      'been made. The S1/S2 contrast already carries the internal-against-external comparison, ' +
      'which is the split customers ask for most.',
  },
]

export const THRESHOLD_NOTE =
  'A sub-topic counts as high on the stakeholder side when the share choosing "needs significant ' +
  'strategic focus" is strictly greater than this value, so an even split is not high. The ' +
  'denominator is substantive responses only — respondents who were asked and gave a rating — and ' +
  'it is printed beside every figure. This is the value snapshotted by the survey round, so a ' +
  'later change to the threshold does not alter a round already run.'

/**
 * The one status that counts as a determination. EXPORTED because a second consumer applies the
 * same filter: lib/materiality/boardReport.ts reports the register and the assessment's own
 * conclusions in one document, and a private copy of this string there could drift into a report
 * that contradicts itself page to page.
 */
export const SUBMITTED_STATUS = 'submitted'
const INCLUDED_STATUS = 'included'
const DIRECTIONS: Direction[] = ['negative', 'positive']

/** The band's own words, per BANDS['3'] in surveyEvidence. Never paraphrased as "high priority". */
const BAND_3_WORDS = 'needs significant strategic focus'

const stakeholderStatement = (numerator: number, denominator: number): string =>
  `${numerator} of the ${denominator} respondents who gave a rating said this ${BAND_3_WORDS}.`

const assessmentStatement = (material: boolean, carriedBy: Direction[]): string => {
  if (!material) return 'Your assessment determined this not material.'
  const which = carriedBy.length === 2
    ? 'on its negative and its positive impacts'
    : `on its ${carriedBy[0]} impacts`
  return `Your assessment determined this material ${which}.`
}

/** The single submitted determination for a direction, or null. Two is an error, not a choice. */
function submittedFor(st: RegisterSubTopic, direction: Direction): Determination | null {
  const rows = st.determinations.filter(
    d => d.status === SUBMITTED_STATUS && d.direction === direction,
  )
  if (rows.length > 1) {
    throw new RegisterInputError(
      `${st.subtopic_code} has ${rows.length} submitted ${direction} determinations. One sub-topic ` +
      `and one direction is one determination; picking one of several would put an arbitrary row's ` +
      `conclusion into the register.`,
    )
  }
  return rows[0] ?? null
}

/**
 * Build the divergence register.
 *
 * Every sub-topic lands in exactly one of `entries` (both sides present and differing),
 * `omitted` (could not be judged, with the reason), or neither (judged, and the two sides agree).
 *
 * ⚠️ The preparer's side is judged ASYMMETRICALLY — see the comment at the gate. Material needs one
 * material determination; not material needs both directions. A missing direction therefore blocks
 * a stakeholder_high entry but not an assessment_high one.
 */
export function buildRegister(input: RegisterInput): DivergenceRegister {
  const { subtopics, topBoxHighMinShare } = input

  if (!Number.isFinite(topBoxHighMinShare) || topBoxHighMinShare < 0 || topBoxHighMinShare > 1) {
    throw new RegisterInputError(
      `topBoxHighMinShare must be a share between 0 and 1, matching ` +
      `materiality_survey_rounds_top_box_high_min_share_range. Received ` +
      `${JSON.stringify(topBoxHighMinShare)}.`,
    )
  }

  const entries: RegisterEntry[] = []
  const omitted: OmittedSubTopic[] = []

  for (const st of subtopics) {
    const omit = (reason: OmissionReason, detail: string | null): void => {
      omitted.push({
        subtopic_code: st.subtopic_code,
        short_name: st.short_name,
        topic_label: st.topic_label,
        reason,
        detail,
      })
    }

    // 1 ── out of scope. The exclusion_reason is carried through verbatim, not restated.
    if (st.status !== INCLUDED_STATUS) {
      omit('excluded_at_scope', st.exclusion_reason)
      continue
    }

    // 2 ── the stakeholder side. No substantive answers is not a low and not a zero share.
    const overall = st.overall
    const tb = overall === null ? null : overall.top_box
    const share = tb === null ? null : tb.share
    if (overall === null || tb === null || share === null || tb.denominator === 0) {
      omit(
        'no_substantive_answers',
        overall === null
          ? 'No survey result for this sub-topic.'
          : 'Nobody who was asked gave a rating; abstentions and skips are not a rating.',
      )
      continue
    }

    // 3 ── the preparer's side. Drafts are absent, per the header.
    const submitted = DIRECTIONS.map(d => ({ direction: d, row: submittedFor(st, d) }))
    const present = submitted.filter(s => s.row !== null)

    // 4 ── severity for whatever WAS submitted. computeSeverity alone decides materiality.
    const results = present.map(s => {
      const row = s.row as Determination
      const result: SeverityResult = computeSeverity({
        direction: row.direction,
        nature: row.nature,
        category: st.category,
        scale: row.scale,
        scope: row.scope,
        irremediability: row.irremediability ?? null,
        likelihood: row.likelihood ?? null,
      })
      return { row, result }
    })

    const directions: DirectionOutcome[] = results.map(r => ({
      direction: r.row.direction,
      nature: r.row.nature,
      material: r.result.complete ? r.result.material : null,
      complete: r.result.complete,
      severity: r.result.severity,
      rule: r.result.rule,
      basis: r.result.basis,
      missing: r.result.missing,
    }))

    // ⚠️ material === true, not a truthiness test: `material` is null on an incomplete direction.
    const carriedBy = directions.filter(d => d.material === true).map(d => d.direction)
    const assessmentMaterial = carriedBy.length > 0

    // ── 5 ── THE GATE IS ASYMMETRIC, AND THAT IS DELIBERATE. DO NOT MAKE IT SYMMETRIC. ───────────
    // Materiality is a FLOOR, not a balance: one submitted direction that computeSeverity reports
    // as material carries the sub-topic into the report, and a direction nobody scored cannot
    // unmake that. "Not material" is the opposite case — reaching it without assessing one half of
    // the topic rests on a question nobody asked — so it alone requires both directions submitted
    // and complete. Every check below is therefore inside the not-material branch.
    if (!assessmentMaterial) {
      if (present.length === 0) {
        omit('no_submitted_determination', 'No determination has been submitted for this sub-topic.')
        continue
      }

      if (present.length < DIRECTIONS.length) {
        const missingDirections = submitted.filter(s => s.row === null).map(s => s.direction)
        omit(
          'direction_never_scored',
          `No submitted determination for ${missingDirections.join(' or ')} impacts, and nothing ` +
          `submitted was material, so "not material" cannot be concluded for this sub-topic.`,
        )
        continue
      }

      const incomplete = results.filter(r => !r.result.complete)
      if (incomplete.length > 0) {
        omit(
          'determination_incomplete',
          incomplete
            .map(r => `${r.row.direction}: ${r.result.missing.join(', ')} not scored`)
            .join('; '),
        )
        continue
      }
    }

    // 6 ── both sides now carry a conclusion. Do they differ?
    // ⚠️ STRICTLY greater. An even split is not high — 20260842's definition, and the reason the
    // constant is a minimum rather than a maximum.
    const stakeholderHigh = share > topBoxHighMinShare

    if (stakeholderHigh === assessmentMaterial) continue // the two sides agree

    const kind: DivergenceKind = stakeholderHigh ? 'stakeholder_high' : 'assessment_high'

    entries.push({
      subtopic_code: st.subtopic_code,
      topic_code: st.topic_code,
      topic_label: st.topic_label,
      short_name: st.short_name,
      kind,
      stakeholder: {
        share,
        numerator: tb.numerator,
        denominator: tb.denominator,
        n_answered: overall.n_answered,
        statement: stakeholderStatement(tb.numerator, tb.denominator),
      },
      assessment: {
        material: assessmentMaterial,
        carried_by: carriedBy,
        directions,
        statement: assessmentStatement(assessmentMaterial, carriedBy),
      },
    })
  }

  return {
    heading: HEADING,
    what_this_is: WHAT_THIS_IS,
    what_this_is_not: WHAT_THIS_IS_NOT,
    threshold: { top_box_high_min_share: topBoxHighMinShare, note: THRESHOLD_NOTE },
    triggers_active: TRIGGERS_ACTIVE,
    triggers_inactive: TRIGGERS_INACTIVE,
    entries,
    omitted,
  }
}
