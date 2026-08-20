/**
 * The board information paper — the content of it, assembled from work already done.
 *
 * PURE. No React, no Supabase, no I/O, no dates generated here. The lib/materiality/register.ts and
 * lib/materiality/severity.ts pattern: the module assembles, the caller fetches and renders.
 *
 * ⚠️ THIS MODULE DECIDES NOTHING. computeSeverity is the only authority on whether a topic is
 * material, and buildRegister is the only authority on where the two sides differ. Nothing here
 * compares a severity against a threshold, re-derives a mean, or re-implements the social max rule.
 * Every figure below is either passed through from the caller's fetch or read off one of those two.
 *
 * ⚠️ AN INFORMATION PAPER, NOT A DECISION PAPER. It opens with findings and asks the board to
 * approve nothing. There is deliberately no recommendation field, no options list and no
 * approve/reject shape anywhere in this module: a paper that asks a board to ratify a materiality
 * determination invites the board to change one, and the determination is the preparer's, made
 * under a method that is disclosed. The board is being INFORMED of a duty that has already arisen.
 *
 * ⚠️ NO MEAN. ANYWHERE. app/components/surveyEvidence.tsx carries this rule for the screens and it
 * holds here: spec v10/v11 §6.2.5, the screening scale is ORDINAL. StakeholderRow has no field a
 * mean could occupy — the distribution is three bands with printed counts and the top box is a
 * share with its denominator beside it. Making it unrepresentable beats documenting it.
 *
 * ⚠️ THE AUDIENCE IS A BOARD, NOT A SUSTAINABILITY TEAM. Directors carry the disclosure duty and
 * are not specialists. Every section is written so that a reader of section 2 alone can describe
 * what was done, and no section requires the reader to already know what a sub-topic is.
 */

import {
  computeSeverity,
  OVERRIDE_BAND,
  type Dimension,
  type Direction,
  type Nature,
  type SeverityRule,
} from './severity'
import {
  buildRegister,
  /**
   * ⚠️ IMPORTED, NEVER RE-DECLARED. Sections 6 and 7 answer the same question about the same rows —
   * which determinations count as the assessment's conclusions — and they answer it in ONE
   * document. A private copy of this filter here would let section 6 report a topic as material
   * while section 7 treats it as absent, in a paper a board reads front to back. That contradiction
   * would raise no error and appear in no test: it is a difference between two pages, and the only
   * reader positioned to catch it is a director who has no way to know which page is right.
   */
  SUBMITTED_STATUS,
  type Determination,
  type Dist,
  type DivergenceRegister,
  type RegisterSubTopic,
  type TopBox,
} from './register'

/**
 * ⚠️ A THIRD COPY, AND THE ONE THAT SHOULD SURVIVE. app/dashboard/materiality/report/page.tsx and
 * app/dashboard/materiality/worksheet/[id]/page.tsx each hold this map locally, and three copies of
 * a reference table drift. This module is already in lib/, so it is the right home: the two page
 * copies should later import from here and be deleted. That is a separate change and this comment
 * is here so the next person does not add a fourth.
 *
 * ⚠️ AN UNKNOWN KEY AND A NULL BOTH YIELD null, never the raw code and never a guess. The code is a
 * system value; a wrong label names the law the assessment was prepared under.
 */
export const STANDARD_VERSION_LABEL: Record<string, string> = {
  esrs_2023: 'ESRS (2023), as last amended by Del. Reg. (EU) 2025/1416',
  esrs_2023_reliefs: 'ESRS (2023) with the reliefs permitted by Del. Reg. C(2026) 5010',
  esrs_2026: 'ESRS (2026) — Del. Reg. C(2026) 5010, applied in full',
}

export const standardVersionLabel = (v: string | null | undefined): string | null =>
  (v && STANDARD_VERSION_LABEL[v]) || null

// ── input ────────────────────────────────────────────────────────────────────────────────────────

/** A row of mr_survey_thresholds, carried through VERBATIM. Its prose was written for this page. */
export type ThresholdRow = {
  key: string
  value: number
  definition: string
  source: string
}

/**
 * ⚠️ invited / opened / answered ARE THE CALLER'S MAPPING, not this module's guess. survey_aggregate
 * reports `reached` and `completed`; which of those counts as "opened" and "answered" is a reading
 * of the instrument, and it is made once at the fetch rather than differently here.
 */
export type ParticipationCounts = {
  invited: number
  opened: number
  answered: number
}

export type CategoryParticipation = ParticipationCounts & {
  /** The stakeholder category as it should be printed. Resolved by the caller, never a raw code. */
  category: string
}

export type BoardReportInput = {
  company_name: string | null
  assessment_name: string | null
  /** The stored code. Rendered only through standardVersionLabel — never printed as given. */
  standard_version: string | null
  /** e.g. "1 January – 31 December 2026". Null when the assessment does not record one. */
  reporting_period: string | null
  round_name: string | null
  /** ISO string from the round. Formatted by the caller; this module generates no dates. */
  round_closed_at: string | null

  participation: ParticipationCounts
  by_category: CategoryParticipation[]

  /** The same shape buildRegister consumes, so the two sections cannot describe different scope. */
  subtopics: RegisterSubTopic[]
  /** The round's SNAPSHOTTED top_box_high_min_share. Not the current reference row. */
  topBoxHighMinShare: number
  thresholds: ThresholdRow[]
}

// ── sections ─────────────────────────────────────────────────────────────────────────────────────

export type CoverSection = {
  company_name: string | null
  assessment_name: string | null
  standard_version_label: string | null
  /** False when the assessment states no version — Article 2(2). Never rendered as a default. */
  standard_version_stated: boolean
  reporting_period: string | null
  round_name: string | null
  round_closed_at: string | null
  title: string
  kind: string
}

export type WhatThisIsSection = { heading: string; paragraphs: string[] }

export type MaterialTopic = {
  subtopic_code: string
  name: string
  topic_label: string
  /** Which direction(s) carried it. Both is two findings, never netted into one (¶44). */
  carried_by: Direction[]
}

export type FindingsSection = {
  heading: string
  topics_assessed: number
  topics_material: number
  topics_differing: number
  material_topics: MaterialTopic[]
  /** What each figure counts. A number a director remembers must be a number they can define. */
  definitions: { assessed: string; material: string; differing: string }
}

export type ParticipationSection = {
  heading: string
  totals: ParticipationCounts
  by_category: CategoryParticipation[]
  note: string
}

export type StakeholderRow = {
  subtopic_code: string
  name: string
  topic_label: string
  /** Three bands with printed counts. ⚠️ There is no field here a mean could occupy. */
  distribution: Dist
  top_box: TopBox
  counts: { asked: number; answered: number; abstained: number; skipped: number }
  /** Present only where the room was split; null otherwise. */
  split_note: string | null
}

export type StakeholderViewSection = {
  heading: string
  rows: StakeholderRow[]
  scale_note: string
  no_mean_note: string
}

export type AssessmentDirectionRow = {
  direction: Direction
  nature: Nature
  /** null when the determination is incomplete. Never false, never zero. */
  material: boolean | null
  complete: boolean
  severity: number | null
  rule: SeverityRule | null
  basis: Dimension[]
  values: number[] | null
  /** ⚠️ ABSTENTIONS, SHOWN AS ABSTENTIONS. Dimensions nobody could judge — never a low score. */
  abstained: Dimension[]
  /** Which dimensions carried the result, read off the engine's own rule. Empty when incomplete. */
  drivers: Dimension[]
}

export type AssessmentRow = {
  subtopic_code: string
  name: string
  topic_label: string
  material: boolean
  carried_by: Direction[]
  directions: AssessmentDirectionRow[]
}

export type AssessmentViewSection = {
  heading: string
  rows: AssessmentRow[]
  abstention_note: string
}

export type DifferencesSection = { heading: string; register: DivergenceRegister }

export type Provision = {
  reference: string
  requirement: string
  how_applied: string
}

export type MethodologySection = {
  heading: string
  provisions: Provision[]
  /** ⚠️ definition and source printed as written. This module never paraphrases a threshold. */
  thresholds: ThresholdRow[]
  thresholds_note: string
}

export type LimitationsSection = { heading: string; items: string[]; not_claimed: string[] }

export type WhyThisMattersSection = {
  heading: string
  items: { title: string; body: string }[]
}

export type BoardReport = {
  cover: CoverSection
  whatThisIs: WhatThisIsSection
  findings: FindingsSection
  participation: ParticipationSection
  stakeholderView: StakeholderViewSection
  assessmentView: AssessmentViewSection
  differences: DifferencesSection
  methodology: MethodologySection
  limitations: LimitationsSection
  whyThisMatters: WhyThisMattersSection
}

// ── prose. ONE copy, exported as data, as register.ts does. ──────────────────────────────────────

export const TITLE = 'Impact materiality — information paper'
export const KIND =
  'For information. This paper reports what was found. It asks the board to approve nothing.'

export const WHAT_THIS_IS_HEADING = 'What this exercise was'

export const WHAT_THIS_IS_PARAGRAPHS: string[] = [
  'We asked the people affected by this organisation — and the people who work in it and with it — '
  + 'which sustainability topics they think need significant strategic focus. They answered on a '
  + 'three-point scale, one topic at a time, in their own words where they wanted to.',

  'Separately, and without seeing those answers first, our own people assessed each topic against '
  + 'the rules the standard sets: how large an impact is, how widely it reaches, how hard it would '
  + 'be to put right, and whether it is already happening or might happen. Those judgements '
  + 'produce a severity for each topic, and the standard sets the level at which a topic becomes '
  + 'material.',

  'This paper sets the two side by side. Where they point the same way, that is a topic on which '
  + 'the organisation and the people it affects agree. Where they point differently, that is worth '
  + 'the board seeing before anything is published — not because either side is wrong, but because '
  + 'a difference between them is exactly what an assurance provider will ask about.',

  'A topic assessed as material becomes a disclosure obligation. That is the link between this '
  + 'exercise and the report the organisation will publish.',
]

export const FINDINGS_HEADING = 'What we found'

export const FINDINGS_DEFINITIONS = {
  assessed:
    'Topics carried through to a judgement — in scope, and our own assessment concluded: either '
    + 'material on at least one direction, or complete in both directions with neither material. '
    + 'Whether stakeholders were surveyed on a topic is a separate fact, reported in section 4.',
  material:
    'Topics the assessment determined material under the standard’s own rule. Each becomes a '
    + 'disclosure obligation.',
  differing:
    'Topics where what respondents said and what the assessment concluded point in different '
    + 'directions. Both are normal outcomes; they are listed so they can be considered before '
    + 'anything is published.',
} as const

export const PARTICIPATION_HEADING = 'Who took part'

export const PARTICIPATION_NOTE =
  'ESRS 2 requires an undertaking to disclose how it engaged stakeholders and who those '
  + 'stakeholders were. This is that disclosure, and it is also the page on which the rest of the '
  + 'paper rests: a finding drawn from four people in one department is a different thing from the '
  + 'same finding drawn from sixty across five. The counts are given as they are, including where '
  + 'they are low.'

export const STAKEHOLDER_HEADING = 'What stakeholders told us'

export const STAKEHOLDER_SCALE_NOTE =
  'Respondents chose one of three answers for each topic: that existing programmes are sufficient; '
  + 'that they are sufficient but improvements would strengthen performance or reduce risk; or that '
  + 'they need significant strategic focus to close gaps, reduce risk or capture opportunity. The '
  + 'share below is the third answer — the strongest of the three — with the number of people who '
  + 'gave a rating printed beside it.'

export const NO_MEAN_NOTE =
  'No average is shown, and none was calculated. The three answers are ordered but not spaced: the '
  + 'distance between the first and the second is not the same quantity as the distance between the '
  + 'second and the third, so an average of them would be a number with no meaning that nonetheless '
  + 'looks precise. The full distribution is given instead, with counts.'

export const SPLIT_NOTE =
  'Respondents are at both ends of the scale on this topic and few are in the middle. There is no '
  + 'single figure that would describe this room, which is why the distribution is shown rather '
  + 'than summarised.'

export const ASSESSMENT_HEADING = 'What our own assessment concluded'

export const ABSTENTION_NOTE =
  'Where an assessor recorded that they did not have enough visibility to judge a dimension, it is '
  + 'shown here as exactly that. It is never counted as a low score. A topic missing any dimension '
  + 'produces no severity and no materiality conclusion at all — it is reported as unfinished, '
  + 'naming what is absent. What cannot be seen is a finding in its own right, and section 10 '
  + 'returns to it.'

export const DIFFERENCES_HEADING = 'Where the two views differ'

export const METHODOLOGY_HEADING = 'How this was done'

/**
 * The provisions applied, NAMED. A board paper that says "in line with the standard" gives a
 * director nothing to hold; a named paragraph can be looked up, and an assurance provider will.
 */
export const PROVISIONS: Provision[] = [
  {
    reference: 'ESRS 1 ¶40',
    requirement:
      'For social topics, severity takes precedence over likelihood. A severe potential impact on '
      + 'people is material even where it is unlikely.',
    how_applied:
      'Severity for social topics is the highest of the dimensions rather than their average, and '
      + 'the likelihood weighting is suppressed. A severe potential human rights impact is never '
      + 'scored down for being improbable.',
  },
  {
    reference: 'ESRS 1 ¶41',
    requirement:
      'Impacts are assessed on scale, scope and irremediable character. A positive impact has no '
      + 'irremediable character and is assessed on scale and scope alone.',
    how_applied:
      'Each topic is determined twice, once for harm and once for benefit. Positive impacts are '
      + 'scored on two dimensions; any irremediability recorded against one is not part of the '
      + 'basis and does not enter the figure.',
  },
  {
    reference: 'ESRS 1 AR 22',
    requirement:
      'Any one of scale, scope or irremediable character can on its own make a negative impact '
      + 'severe.',
    how_applied:
      'A single dimension at the top of its scale makes a negative impact material regardless of '
      + 'the average, so that a grave permanent harm affecting few people is not averaged away.',
  },
  {
    reference: 'ESRS 1 ¶44',
    requirement:
      'Positive impacts are assessed on their own and are never netted against negative impacts.',
    how_applied:
      'Harm and benefit are held as two separate determinations throughout. Nothing in this paper '
      + 'sums, offsets or reconciles one against the other, and where both are material both are '
      + 'named.',
  },
  {
    reference: 'ESRS 2 IRO-1',
    requirement:
      'The undertaking discloses the process by which it identified impacts, including the scope '
      + 'it examined.',
    how_applied:
      'Topics left out of scope are recorded with the reason given at the time, and are listed as '
      + 'part of the disclosure rather than dropped from it. What was not examined is stated.',
  },
  {
    reference: 'Article 2(2), Del. Reg. C(2026) 5010',
    requirement:
      'The undertaking must state which version of the standard it applied.',
    how_applied:
      'The version is printed on the cover of this paper. Where an assessment does not state one, '
      + 'that is shown as not stated and never filled in with an assumed value: an assumed version '
      + 'would be a false statement about which law was applied.',
  },
]

export const THRESHOLDS_NOTE =
  'Every threshold used is listed below with its definition and the reasoning recorded when it was '
  + 'set, exactly as written at the time. The values were fixed onto the survey round when it was '
  + 'created, so a later change to any of them cannot restate what this round found.'

export const LIMITATIONS_HEADING = 'What this does not cover'

export const LIMITATIONS: string[] = [
  'This is the impact half of double materiality. It asks what effect the organisation has on '
  + 'people and the environment. It does not assess the financial axis — how sustainability '
  + 'matters affect the organisation’s own cash flows, access to finance or cost of capital — '
  + 'and a complete double materiality assessment requires both.',

  'Figures are drawn from one survey round. Answers from separate rounds are not combined: two '
  + 'rounds asked different people at different times, and adding them together would produce a '
  + 'total that describes no group who was ever asked. Where more than one round exists, this '
  + 'paper reports against one of them and says which.',

  'Where respondents did not answer, and where an assessor recorded that they could not judge a '
  + 'dimension, that absence is reported as an absence. It is not a low score and must not be read '
  + 'as one. It means the organisation cannot currently see the topic well enough to judge it.',

  'The severity judgements are the preparer’s own, made under the disclosed method. They are '
  + 'not an independent opinion, and they have not been assured.',

  'Topic names, thresholds and scope come from the standard version stated on the cover. A '
  + 'different version orders and names topics differently, and figures here should not be compared '
  + 'against an assessment prepared under another one.',
]

/** ⚠️ STATED AS PLAINLY AS THE FINDINGS. A board that mistakes this for a risk register will act on it. */
export const NOT_CLAIMED: string[] = [
  'This paper does not quantify financial effect. No figure in it is an amount of money, an '
  + 'expected loss or a probability-weighted exposure.',
  'This paper is not a risk register. It does not list controls, owners, mitigations or residual '
  + 'positions.',
  'This paper does not rank topics by business impact. The topics are listed in the order the '
  + 'standard sets them out, and nothing here orders them by importance to the organisation.',
]

export const WHY_HEADING = 'What this tells the board, beyond compliance'

export const WHY_THIS_MATTERS: { title: string; body: string }[] = [
  {
    title: 'Where attention is, and where it is not',
    body:
      'The survey shows what the people around this organisation think needs significant focus. '
      + 'Set beside our own assessment, it shows where those two things are not the same. A topic '
      + 'respondents raised strongly and the assessment did not is worth understanding before it '
      + 'is raised somewhere less comfortable.',
  },
  {
    title: 'What the organisation cannot yet see',
    body:
      'Every dimension recorded as "not enough visibility" is a topic the organisation does not '
      + 'currently have the information to judge. That is a finding about the organisation, not a '
      + 'gap in the survey, and it points directly at where data collection is missing.',
  },
  {
    title: 'Where the inside and the outside disagree',
    body:
      'Our own workforce and the workers in our value chain answer separate questions about '
      + 'separate workplaces. A difference between those two answers is not disagreement — it is '
      + 'two populations reporting different conditions, and it is one of the few early signals a '
      + 'board gets about conditions in its supply chain.',
  },
  {
    title: 'What follows from a material topic',
    body:
      'A topic determined material becomes a disclosure obligation. Each obligation becomes data '
      + 'that has to be collected, at a quality that can be assured, by people whose time is '
      + 'budgeted. The list of material topics in section 3 is therefore also the earliest view '
      + 'the board has of next year’s reporting workload.',
  },
]

// ── assembly ─────────────────────────────────────────────────────────────────────────────────────

const DIRECTIONS: Direction[] = ['negative', 'positive']

const nameOf = (s: RegisterSubTopic) => s.short_name ?? s.subtopic_code

/**
 * Which dimensions carried the result — read off the engine's own rule and values, never re-decided.
 *
 * 'override'          the dimension(s) at the top band; the average alone did not reach the line
 * 'max' / 'subsumed'  the dimension(s) holding the maximum, which IS the severity for social topics
 * 'mean'              all of the basis, because the average is of all of them
 */
const driversFor = (rule: SeverityRule, basis: Dimension[], values: number[]): Dimension[] => {
  if (rule === 'override') {
    return basis.filter((_, i) => values[i] === OVERRIDE_BAND)
  }
  if (rule === 'max' || rule === 'subsumed_override') {
    const top = Math.max(...values)
    return basis.filter((_, i) => values[i] === top)
  }
  return basis
}

type Judged = {
  subtopic: RegisterSubTopic
  directions: AssessmentDirectionRow[]
  material: boolean
  carried_by: Direction[]
  /** True when both directions were submitted and complete — the same bar section 3 counts on. */
  fully_judged: boolean
}

/**
 * ⚠️ computeSeverity IS CALLED DIRECTLY HERE, AND THAT IS NOT A SECOND DERIVATION.
 * buildRegister surfaces per-direction outcomes only for the sub-topics that DIVERGE, because that
 * is all its register needs. Section 6 has to report every material topic, divergent or not, so the
 * severity for those comes from the same authority by the same call with the same inputs. What is
 * forbidden is re-implementing the rule, and nothing here does: `material` is read, never computed.
 */
function judge(subtopics: RegisterSubTopic[]): Judged[] {
  return subtopics.map(s => {
    const rows: AssessmentDirectionRow[] = []
    let submittedCount = 0

    for (const direction of DIRECTIONS) {
      const det: Determination | undefined = s.determinations.find(
        d => d.status === SUBMITTED_STATUS && d.direction === direction)
      if (!det) continue
      submittedCount += 1

      const r = computeSeverity({
        direction: det.direction,
        nature: det.nature,
        category: s.category,
        scale: det.scale,
        scope: det.scope,
        irremediability: det.irremediability ?? null,
        likelihood: det.likelihood ?? null,
      })

      rows.push({
        direction: det.direction,
        nature: det.nature,
        material: r.complete ? r.material : null,
        complete: r.complete,
        severity: r.severity,
        rule: r.rule,
        basis: r.basis,
        values: r.complete ? r.values : null,
        // ⚠️ The dimensions nobody could judge, named. Never folded into the figure, never a zero.
        abstained: r.missing,
        drivers: r.complete ? driversFor(r.rule, r.basis, r.values) : [],
      })
    }

    const carried_by = rows.filter(d => d.material === true).map(d => d.direction)
    return {
      subtopic: s,
      directions: rows,
      material: carried_by.length > 0,
      carried_by,
      fully_judged: submittedCount === DIRECTIONS.length && rows.every(d => d.complete),
    }
  })
}

export function buildBoardReport(input: BoardReportInput): BoardReport {
  const register = buildRegister({
    subtopics: input.subtopics,
    topBoxHighMinShare: input.topBoxHighMinShare,
  })

  const judged = judge(input.subtopics)

  // ⚠️ "Assessed" means carried through to a judgement, not merely in scope. Counting every row in
  // scope would report work as done that has not been done.
  //
  // ⚠️ AND THE BAR IS ASYMMETRIC, MATCHING register.ts's GATE ON PURPOSE. Materiality is a FLOOR,
  // not a balance: ONE direction determined material carries the topic to a conclusion whether or
  // not the other was scored, and a direction nobody scored cannot unmake it. Only a NOT-material
  // conclusion needs both directions, because reaching that with one unscored rests on a question
  // nobody asked. The same reasoning register.ts carries at its own gate, and the two must agree.
  //
  // ⚠️ AND SURVEY COVERAGE IS NOT A CONDITION. "Assessed" means WE REACHED A JUDGEMENT about this
  // topic, and a judgement can be reached about a topic nobody was surveyed on: the preparer may
  // know of an exposure staff never raised, which is the reverse-direction case the register in
  // section 7 exists to surface. Requiring coverage would conflate "we assessed it" with "we asked
  // about it" — two different facts, and section 4 already reports the second. A topic with no
  // survey answers still appears in the register's `omitted`, said as what it is.
  //
  // ⚠️ THE FAILURE THIS PREVENTS, WHICH IS WHY THE ASYMMETRY IS NOT AN OVERSIGHT.
  // While `assessed` demanded both directions and `material` and `differing` were counted under the
  // asymmetric rule, a topic material on its negative alone was counted material AND counted
  // differing while not being counted assessed — so section 3 could print "0 topics assessed,
  // 1 material". Three figures, on the page a board remembers, contradicting each other, with
  // nothing raised and nothing that looks wrong. The only reader positioned to notice holds the
  // underlying rows, and that is precisely the reader this paper exists so nobody has to be.
  //
  // With both conditions as they now stand the invariant is STRUCTURAL rather than incidental:
  // every material topic is judged, so every material topic in scope is counted assessed, and
  // `material` cannot exceed `assessed` for any input whose determinations are in scope.
  const assessed = judged.filter(j =>
    j.subtopic.status === 'included'
    && (j.material || j.fully_judged))

  const materialTopics = judged.filter(j => j.material)

  const stakeholderRows: StakeholderRow[] = input.subtopics
    .filter(s => s.status === 'included' && s.overall !== null)
    .map(s => {
      const o = s.overall as NonNullable<RegisterSubTopic['overall']>
      return {
        subtopic_code: s.subtopic_code,
        name: nameOf(s),
        topic_label: s.topic_label,
        distribution: o.distribution,
        top_box: o.top_box,
        counts: {
          asked: o.n_asked,
          answered: o.n_answered,
          abstained: o.n_abstained,
          skipped: o.n_skipped,
        },
        split_note: o.polarised ? SPLIT_NOTE : null,
      }
    })

  return {
    cover: {
      company_name: input.company_name,
      assessment_name: input.assessment_name,
      standard_version_label: standardVersionLabel(input.standard_version),
      standard_version_stated: standardVersionLabel(input.standard_version) !== null,
      reporting_period: input.reporting_period,
      round_name: input.round_name,
      round_closed_at: input.round_closed_at,
      title: TITLE,
      kind: KIND,
    },

    whatThisIs: {
      heading: WHAT_THIS_IS_HEADING,
      paragraphs: WHAT_THIS_IS_PARAGRAPHS,
    },

    findings: {
      heading: FINDINGS_HEADING,
      topics_assessed: assessed.length,
      topics_material: materialTopics.length,
      topics_differing: register.entries.length,
      material_topics: materialTopics.map(j => ({
        subtopic_code: j.subtopic.subtopic_code,
        name: nameOf(j.subtopic),
        topic_label: j.subtopic.topic_label,
        carried_by: j.carried_by,
      })),
      definitions: {
        assessed: FINDINGS_DEFINITIONS.assessed,
        material: FINDINGS_DEFINITIONS.material,
        differing: FINDINGS_DEFINITIONS.differing,
      },
    },

    participation: {
      heading: PARTICIPATION_HEADING,
      totals: input.participation,
      by_category: input.by_category,
      note: PARTICIPATION_NOTE,
    },

    stakeholderView: {
      heading: STAKEHOLDER_HEADING,
      rows: stakeholderRows,
      scale_note: STAKEHOLDER_SCALE_NOTE,
      no_mean_note: NO_MEAN_NOTE,
    },

    assessmentView: {
      heading: ASSESSMENT_HEADING,
      rows: materialTopics.map(j => ({
        subtopic_code: j.subtopic.subtopic_code,
        name: nameOf(j.subtopic),
        topic_label: j.subtopic.topic_label,
        material: j.material,
        carried_by: j.carried_by,
        directions: j.directions,
      })),
      abstention_note: ABSTENTION_NOTE,
    },

    differences: { heading: DIFFERENCES_HEADING, register },

    methodology: {
      heading: METHODOLOGY_HEADING,
      provisions: PROVISIONS,
      // ⚠️ AS GIVEN. definition and source are printed unchanged; this module never rewords one.
      thresholds: input.thresholds,
      thresholds_note: THRESHOLDS_NOTE,
    },

    limitations: {
      heading: LIMITATIONS_HEADING,
      items: LIMITATIONS,
      not_claimed: NOT_CLAIMED,
    },

    whyThisMatters: { heading: WHY_HEADING, items: WHY_THIS_MATTERS },
  }
}
