/**
 * The impact materiality report — the content of it, assembled from work already done.
 *
 * PURE. No React, no Supabase, no I/O, no dates generated here. The lib/materiality/register.ts and
 * lib/materiality/severity.ts pattern: the module assembles, the caller fetches and renders.
 *
 * ⚠️ THIS MODULE DECIDES NOTHING. computeSeverity is the only authority on whether a topic is
 * material, and buildRegister is the only authority on where the two sides differ. Nothing here
 * compares a severity against a threshold, re-derives a mean, or re-implements the social max rule.
 * Every figure below is either passed through from the caller's fetch or read off one of those two.
 *
 * ⚠️ AN INFORMATION PAPER, NOT A DECISION PAPER. It opens with findings and asks the reader to
 * approve nothing. There is deliberately no recommendation field, no options list and no
 * approve/reject shape anywhere in this module: a report that asks its reader to ratify a
 * materiality determination invites them to change one, and the determination is the preparer's,
 * made under a method that is disclosed. The reader is being INFORMED of a duty that has already
 * arisen.
 *
 * ⚠️ AND IT IS TITLED FOR WHAT IT IS, NOT FOR WHO RECEIVES IT. The same document goes to a board,
 * an audit committee, an executive team and an assurance provider. A title naming one of them has
 * to be changed for the others, and a document that gets re-titled in transit is a document nobody
 * can cite. "Impact materiality report" is what it is to all four.
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

/** One side of a labour pair. distribution is null where that side was never asked. */
export type ContrastSide = {
  n_answered: number
  top_box: number | null
  distribution: Dist | null
}

/** survey_aggregate's s1_s2_contrast entries, carried through unchanged. */
export type ContrastEntry = {
  s1_subtopic_code: string
  s2_subtopic_code: string
  short_name: string
  s1: ContrastSide
  s2: ContrastSide
  comparable: boolean
  not_comparable_reason: string | null
  gap: number | null
  flagged: boolean
}

export type ContrastInput = {
  what_this_is: string
  what_this_is_not: string
  entries: ContrastEntry[]
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

  /**
   * The round's SNAPSHOTTED polarisation levels, so section 5b can say what a split room is in the
   * reader's own terms.
   *
   * ⚠️ NUMBERS, NOT THE AGGREGATE'S SENTENCE. survey_aggregate's method.dispersion.definition names
   * its own columns — "at least polarised_extreme_min_n answers at BOTH 1 and 3, and fewer than
   * polarised_middle_max_share of answers at 2" — which is written for a developer reading the
   * payload and puts three identifiers and a system value in front of a board. The definition is
   * not lost: the same thresholds are printed in full, with the reasoning recorded when they were
   * set, in section 8, which is where a verifier looks for exactly that.
   *
   * OPTIONAL: absent means the section describes the split without quoting levels.
   */
  polarisation_levels?: { extreme_min_n: number; middle_max_share: number } | null

  /**
   * survey_aggregate's s1_s2_contrast. OPTIONAL for the same reason — a report built without it is
   * missing a section, and saying that is better than printing an empty one that reads as "no
   * pairs exist".
   */
  contrast?: ContrastInput | null

  /**
   * The ESRS disclosure requirements for the assessment's standard version.
   *
   * ⚠️ AN INPUT, NOT A LOOKUP. This module resolves nothing, exactly as it generates no dates: the
   * caller decides whether these were read at generation or taken from a frozen record. See the
   * note above section 6b in boardReportPdf.ts for why no caller supplies them yet.
   *
   * OPTIONAL, and unsupplied today because NOTHING FREEZES THEM. Absent means every material topic
   * prints the no-requirements line, which is honest; the roadmap section is built either way and
   * is not currently rendered.
   */
  /**
   * The finalisation status line, already formatted by lib/materiality/finalisation.ts
   * finalisationStamp. Null or absent means never finalised, and the cover then carries
   * NOT_FINALISED_NOTE instead. This module formats nothing, exactly as it generates no dates.
   */
  finalised_stamp?: string | null

  disclosure_requirements?: readonly RoadmapRequirementRow[]

  /**
   * What to say on the document about where the requirements came from. Null when nothing needs
   * saying - which is what a frozen source looks like.
   *
   * ⚠️ NO CALLER SETS THIS, AND AS OF 22 AUG 2026 NONE CAN TRUTHFULLY. It was kept when the roadmap
   * was built, on the grounds that it would become correct the moment a caller resolved at read.
   * Finalisation removed that possibility in BOTH directions: a finalised paper's rows come frozen
   * from materiality_finalisation_requirements, so the note would be false; an unfinalised paper's
   * caller passes NO rows and resolves nothing at read, so it would be false there too — the
   * roadmap is simply empty and NOT_FINALISED_NOTE on the cover is what explains it.
   * The field survives for a caller that genuinely resolves at read. There is none today.
   */
  requirements_resolved_note?: string | null
}

// ── sections ─────────────────────────────────────────────────────────────────────────────────────

export type CoverSection = {
  company_name: string | null
  assessment_name: string | null
  standard_version_label: string | null
  /** False when the assessment states no version — Article 2(2). Never rendered as a default. */
  standard_version_stated: boolean
  reporting_period: string | null
  /** Formatted by the caller via finalisationStamp. Null when the paper was never finalised. */
  finalised_stamp: string | null
  /** ⚠️ Printed only when the paper is NOT finalised — see NOT_FINALISED_NOTE. */
  cover_note: string | null
  round_name: string | null
  round_closed_at: string | null
  title: string
  kind: string
}

export type WhatThisIsSection = { heading: string; paragraphs: string[] }

export type MaterialTopic = {
  subtopic_code: string
  /** From the row, NEVER parsed from subtopic_code. See the note at the projection. */
  topic_code: string
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
  /** ⚠️ COVERAGE, ON THE SAME PAGE AS THE FIGURES. See COVERAGE_HEADLINE. */
  topics_asked: number
  topics_with_ratings: number
  material_topics: MaterialTopic[]
  /** What each figure counts. A number a director remembers must be a number they can define. */
  definitions: { assessed: string; material: string; differing: string; coverage: string }
}

export type ParticipationSection = {
  heading: string
  totals: ParticipationCounts
  by_category: CategoryParticipation[]
  note: string
  /** Printed directly beneath the table. See PARTICIPATION_COMPLETION_NOTE. */
  completion_note: string
}

export type StakeholderRow = {
  subtopic_code: string
  /**
   * ⚠️ READ FROM THE ROW, NEVER PARSED FROM subtopic_code. RegisterSubTopic carries it, and the
   * field beside it there states the rule for its neighbour: "mr_esrs_topics.category. Never
   * derived from subtopic_code." Present so the renderer can apply the S1/S2 worksheet framing —
   * topic_label cannot disambiguate, because S1 and S2 share a merged label by design.
   */
  topic_code: string
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

/**
 * ⚠️ THREE STATES PER DIRECTION, AND ALL THREE ARE EMITTED. `determined` false means no submitted
 * determination exists for that direction at all; true with complete false is a §6.1 abstention
 * naming its dimensions; true and complete is a severity. Until 22 Aug 2026 the first state was
 * dropped by a `continue` in judge(), so `directions` silently meant "submitted directions" — a
 * filter no field name carried, and the reason section 9 could render a topic as a bold name with
 * nothing under it.
 */
export type AssessmentDirectionRow = {
  direction: Direction
  /** False when nothing was submitted for this direction. The other fields are then null/empty. */
  determined: boolean
  /** ⚠️ NULL EXACTLY WHEN determined IS FALSE. A submitted determination always states its nature —
   *  materiality_impact_determinations_submitted_is_complete guarantees it — so a null here is the
   *  absence of a determination, never an unanswered question within one. */
  nature: Nature | null
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

export type PolarisationSection = {
  heading: string
  what_this_is: string
  /** survey_aggregate's own definition of spread. null when the caller did not supply it. */
  method_note: string | null
  /** Sub-topics the aggregate marked polarised, with their distributions. */
  rows: StakeholderRow[]
  /** Printed when there are none — a result, not an empty state. */
  none_note: string
}

export type ContrastSection = {
  heading: string
  /** The aggregate's own framing. null when the contrast was not supplied. */
  what_this_is: string | null
  /** ⚠️ FULL WEIGHT, NEVER A FOOTNOTE. See the constant below. */
  what_this_is_not: string | null
  /** Flagged first, then widest gap first — the order the results screen uses. */
  entries: ContrastEntry[]
  none_note: string
  /** Printed instead of everything else when the caller passed no contrast at all. */
  unavailable_note: string | null
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

// ── the disclosure roadmap ───────────────────────────────────────────────────────────────────────

/** One row as the caller supplies it. Mirrors mr_esrs_disclosure_requirements' shape. */
export type RoadmapRequirementRow = {
  dr_code: string
  topic_code: string
  title: string
  datapoints: string | null
}

export type RoadmapRequirement = {
  dr_code: string
  title: string
  /** NULL = not yet written. NEVER rendered as blank - the renderer says so in words. */
  datapoints: string | null
}

export type RoadmapTopic = {
  topic_code: string
  topic_label: string
  /**
   * ⚠️ THE SUB-TOPICS THAT MADE THIS TOPIC MATERIAL, AND THEY ARE NOT DECORATION.
   * ESRS 1 ¶30 lets an undertaking report the material sub-topic's information rather than all of
   * the topic's. A preparer handed "E1 - here are eleven requirements" cannot tell which of them
   * ¶30 lets them scope down; a preparer handed "E1, material through Climate change adaptation
   * and Energy" can. Several material sub-topics roll up to one topic, so the topic's requirements
   * appear ONCE and this names what drove it.
   */
  driven_by: { subtopic_code: string; name: string }[]
  requirements: RoadmapRequirement[]
}

export type RoadmapSection = {
  heading: string
  what_this_is: string
  /** ⚠️ THE CLAIM THIS ROADMAP MAKES, AND THE ONE IT DOES NOT. See ROADMAP_WHAT_THIS_IS_NOT. */
  what_this_is_not: string
  /** Where the requirements came from, when that needs saying. Null when it does not. */
  resolved_note: string | null
  topics: RoadmapTopic[]
  /** Printed when there are none: a result, not an empty state. */
  none_note: string
}

export type BoardReport = {
  cover: CoverSection
  whatThisIs: WhatThisIsSection
  findings: FindingsSection
  participation: ParticipationSection
  stakeholderView: StakeholderViewSection
  polarisation: PolarisationSection
  contrast: ContrastSection
  assessmentView: AssessmentViewSection
  /** Built always; NOT RENDERED YET - see the block above section 6b in boardReportPdf.ts. */
  roadmap: RoadmapSection
  differences: DifferencesSection
  methodology: MethodologySection
  limitations: LimitationsSection
  whyThisMatters: WhyThisMattersSection
}

// ── prose. ONE copy, exported as data, as register.ts does. ──────────────────────────────────────

/**
 * ⚠️ PRINTED ONLY WHEN THERE IS NO FINALISATION, and it is the honest counterpart to the frozen
 * roadmap. An unfinalised paper's requirements are read from nothing at all — the caller passes no
 * frozen rows — so every material topic prints ROADMAP_NO_REQUIREMENTS_NOTE, and what the paper
 * reports can still move as determinations are edited. Saying so is not a warning about a defect;
 * it is the difference between this document and a finalised one.
 */
export const NOT_FINALISED_NOTE =
  'This paper has not been finalised. What it reports may change as determinations are edited, and '
  + 'the disclosure requirements it lists are read from the current reference set rather than a '
  + 'fixed copy.'

export const ROADMAP_HEADING = 'What becomes disclosable'

export const ROADMAP_WHAT_THIS_IS =
  'A topic assessed as material carries disclosure requirements. These are the requirements that '
  + 'attach to the topics this assessment found material, grouped by topic, with the sub-topics '
  + 'that made each one material named beneath it.'

/**
 * ⚠️ TWO ROADMAPS EXIST IN THIS PLATFORM AND THEY MAKE DIFFERENT CLAIMS. This sentence is what
 * keeps them apart on the page, so a reader holding both does not take them for one document
 * disagreeing with itself.
 *
 *   The CLIMATE RISK screening roadmap (app/dashboard/materiality/report/page.tsx DisclosureRoadmap)
 *   is driven by ten topics scored against industry baselines with no stakeholder input, filtered
 *   at max(financial, impact) >= 5. That report's own prose calls itself "a structured first pass
 *   to scope a formal assessment, not a disclosure". Its roadmap says: what you would owe IF those
 *   screening scores hold.
 *
 *   THIS roadmap is driven by determinations - 37 sub-topics, four ESRS 1 §6.2 dimensions per
 *   direction, a stakeholder survey behind it, each judgement attributable to a named contributor.
 *   It says: what you owe on what was actually assessed.
 *
 * The two can legitimately disagree, and merging them would have one document assert the other's
 * conclusions. Neither supersedes the other; they answer different questions.
 */
export const ROADMAP_WHAT_THIS_IS_NOT =
  'This is not the screening roadmap in the Climate Risk report. That one is built from ten topics '
  + 'scored against industry baselines, and states what would be disclosable if those scores hold. '
  + 'This one is built from the determinations made in this assessment. The two are different '
  + 'questions and may not list the same topics.'

export const ROADMAP_NONE_NOTE =
  'No topic was assessed as material, so no disclosure requirements attach. That is a result of the '
  + 'assessment, not an absence of one.'

/**
 * Printed for a material topic with no stored requirements.
 *
 * ⚠️ THE TOPIC STILL APPEARS. Dropping it would silently shorten the roadmap and read as "nothing
 * attaches to this topic" - the same absence-rendered-as-a-finding failure the datapoints column
 * guards against.
 *
 * ⚠️ THE COMMON CAUSE IS A NULL standard_version, AND THAT IS DELIBERATE. There is no fallback to
 * DR_FALLBACK_VERSION here, unlike api/materiality/route.ts. That path can fall back because
 * drResolutionNote discloses it on the face of the report; this section has no equivalent
 * disclosure, and an undisclosed fallback would print one standard's requirements under another
 * standard's name. ESRS (2026) renumbered the DRs and 49 codes exist under both versions with
 * different titles, so that is not a stale-label problem. Printing nothing, and saying so, is the
 * weaker claim and the true one.
 */
export const ROADMAP_NO_REQUIREMENTS_NOTE =
  'No disclosure requirements are held for this topic in the standard version stated for this '
  + 'assessment. That is an absence of stored requirements, not a finding that none apply.'

export const TITLE = 'Impact materiality report'
export const KIND =
  'For information. This paper reports what was found. It asks the reader to approve nothing.'

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
  + 'seeing before anything is published — not because either side is wrong, but because a '
  + 'difference between them is exactly what an assurance provider will ask about.',

  'A topic assessed as material becomes a disclosure obligation. That is the link between this '
  + 'exercise and the report the organisation will publish.',
]

/**
 * ⚠️ COVERAGE BELONGS ON THE FINDINGS PAGE, NOT ON A LATER ONE. "32 of 37 sub-topics received no
 * rating" changes how every other figure on this page should be read, and a reader who meets it
 * eight pages later has already formed a view. It is not a caveat; on a thin response it is the
 * single most important sentence in the document.
 */
export const COVERAGE_HEADLINE = 'Coverage'

export const COVERAGE_DEFINITION =
  'Sub-topics put to respondents, and how many of those came back with at least one rating. A '
  + 'sub-topic nobody rated carries no stakeholder view at all, so the comparison in this report '
  + 'cannot be drawn for it. That is a finding about what can currently be seen, not a low score.'

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
  coverage: COVERAGE_DEFINITION,
} as const

export const POLARISATION_HEADING = 'Where your own people disagree'

export const POLARISATION_WHAT_THIS_IS =
  'On these sub-topics respondents are at BOTH ends of the scale and few are in the middle. There '
  + 'is no single figure that would describe the room, which is exactly why they are listed '
  + 'separately rather than summarised. A split is not a low score and not a high one: it is two '
  + 'groups of people who see the same topic differently, and finding out why is usually more '
  + 'useful than any average of them would have been.'

/**
 * What a split room is, in the reader's terms, with this round's own numbers substituted.
 *
 * ⚠️ THE NUMBERS ARE THE ROUND'S, NOT TODAY'S. They were fixed onto the survey round when it was
 * created, so a later change to the reference values cannot restate what this round found — the
 * same guarantee section 8's threshold note makes.
 */
export const polarisationLevels = (
  levels: { extreme_min_n: number; middle_max_share: number } | null | undefined,
): string | null => {
  if (!levels) return null
  const people = levels.extreme_min_n === 1 ? 'person' : 'people'
  const middle = Math.round(levels.middle_max_share * 100)
  return `A sub-topic is listed here when at least ${levels.extreme_min_n} ${people} chose the `
       + `lowest answer AND at least ${levels.extreme_min_n} chose the highest, while fewer than `
       + `${middle}% of answers landed in the middle. Those levels were fixed onto this survey `
       + `round when it was created, and are printed with the reasoning behind them in the `
       + `methodology section.`
}

export const POLARISATION_NONE =
  'No sub-topic came back split. That is a result rather than a blank page: on every topic with '
  + 'enough answers to judge, respondents landed in the same part of the scale as each other.'

export const CONTRAST_HEADING = 'Inside and outside'

export const CONTRAST_NONE =
  'No labour pairs could be drawn. Both sides of a pair have to be in scope for the same survey '
  + 'round before the two can be set beside each other.'

export const CONTRAST_UNAVAILABLE =
  'The paired labour comparison was not available when this report was produced, so this section '
  + 'is empty for a reason that is about the report and not about your organisation. It is not a '
  + 'finding that no difference exists — the comparison was not drawn.'

export const PARTICIPATION_HEADING = 'Who took part'

export const PARTICIPATION_NOTE =
  'ESRS 2 requires an undertaking to disclose how it engaged stakeholders and who those '
  + 'stakeholders were. This is that disclosure, and it is also the page on which the rest of the '
  + 'paper rests: a finding drawn from four people in one department is a different thing from the '
  + 'same finding drawn from sixty across five. The counts are given as they are, including where '
  + 'they are low.'

/**
 * ⚠️ WITHOUT THIS SENTENCE THE TABLE READS AS A CONTRADICTION. "Completed: 0" sits in the same
 * document as fifty-odd ratings, and a reader reconciles the two by deciding one of them is wrong.
 * Both are true: a respondent who rated some sub-topics and never pressed submit is counted as
 * having opened the survey and not as having completed it, and every rating they gave is in the
 * figures. Submitting is not what makes an answer count.
 */
export const PARTICIPATION_COMPLETION_NOTE =
  'A respondent who answered some questions and did not finish is counted here as having opened '
  + 'the survey, not as having completed it. Their ratings are still included in every figure in '
  + 'this report: submitting is what closes a response, not what makes an answer count. A '
  + 'completion figure of zero beside ratings elsewhere in this document is those two facts, not a '
  + 'contradiction between them.'

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
 * The provisions applied, NAMED. A report that says "in line with the standard" gives a
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

export const WHY_HEADING = 'What this tells you, beyond compliance'

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
      + 'two populations reporting different conditions, and it is one of the few early signals '
      + 'you get about conditions in your supply chain.',
  },
  {
    title: 'What follows from a material topic',
    body:
      'A topic determined material becomes a disclosure obligation. Each obligation becomes data '
      + 'that has to be collected, at a quality that can be assured, by people whose time is '
      + 'budgeted. The list of material topics in section 3 is therefore also the earliest view '
      + 'you have of next year’s reporting workload.',
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
      if (!det) {
        // ⚠️ EMITTED, NOT SKIPPED. "Nothing was determined here" is a finding this section promises
        // to report — ABSTENTION_NOTE says a topic missing any dimension "is reported as
        // unfinished, naming what is absent" — and dropping the row made it unrepresentable.
        rows.push({
          direction, determined: false, nature: null, material: null, complete: false,
          severity: null, rule: null, basis: [], values: null, abstained: [], drivers: [],
        })
        continue
      }
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
        determined: true,
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

/**
 * Group the requirements under the topics this assessment found material.
 *
 * ⚠️ REQUIREMENTS ARE AN INPUT, NOT A LOOKUP. This module resolves nothing, exactly as it generates
 * no dates. The caller decides whether they were resolved at generation or read from a frozen
 * record, and `resolved_note` is where that is stated on the document. When a freeze point exists,
 * the caller passes frozen rows and nothing here changes.
 */
function buildRoadmap(
  materialTopics: Judged[],
  requirements: readonly RoadmapRequirementRow[],
  resolvedNote: string | null,
): RoadmapSection {
  // Grouped by topic, preserving the caller's order - sort_order is per topic and was applied by
  // whoever fetched them.
  const byTopic = new Map<string, RoadmapRequirement[]>()
  for (const r of requirements) {
    if (!r || typeof r.topic_code !== 'string') continue
    const list = byTopic.get(r.topic_code) ?? []
    list.push({ dr_code: r.dr_code, title: r.title, datapoints: r.datapoints ?? null })
    byTopic.set(r.topic_code, list)
  }

  // ⚠️ ONE ENTRY PER TOPIC, FIRST-APPEARANCE ORDER. E1.2 and E1.3 both material is ONE E1 section
  // with two names under it, not E1's eleven requirements printed twice.
  const topics: RoadmapTopic[] = []
  const seen = new Map<string, RoadmapTopic>()
  for (const j of materialTopics) {
    const code = j.subtopic.topic_code
    let entry = seen.get(code)
    if (!entry) {
      entry = {
        topic_code: code,
        topic_label: j.subtopic.topic_label,
        driven_by: [],
        requirements: byTopic.get(code) ?? [],
      }
      seen.set(code, entry)
      topics.push(entry)
    }
    entry.driven_by.push({ subtopic_code: j.subtopic.subtopic_code, name: nameOf(j.subtopic) })
  }

  return {
    heading: ROADMAP_HEADING,
    what_this_is: ROADMAP_WHAT_THIS_IS,
    what_this_is_not: ROADMAP_WHAT_THIS_IS_NOT,
    resolved_note: resolvedNote,
    topics,
    none_note: ROADMAP_NONE_NOTE,
  }
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

  // ⚠️ ASKED means the sub-topic reached respondents at all — it is in scope and the aggregate has
  // a result row for it. RATED means at least one person gave it a rating. The gap between the two
  // is the coverage finding, and it is computed from the same rows every other figure comes from.
  const inScope = input.subtopics.filter(s => s.status === 'included')
  const asked = inScope.filter(s => s.overall !== null)
  const withRatings = asked.filter(s => (s.overall as NonNullable<typeof s.overall>).top_box.denominator > 0)

  // ⚠️ THE AGGREGATE'S OWN FLAG, never re-derived here. Whether a room is split is survey_aggregate's
  // determination under its own disclosed thresholds; recomputing it from three band counts would be
  // a second definition of "polarised" free to disagree with the one the survey screen shows.
  const polarised = new Set(
    input.subtopics.filter(s => s.overall?.polarised === true).map(s => s.subtopic_code))

  const stakeholderRows: StakeholderRow[] = input.subtopics
    .filter(s => s.status === 'included' && s.overall !== null)
    .map(s => {
      const o = s.overall as NonNullable<RegisterSubTopic['overall']>
      return {
        subtopic_code: s.subtopic_code,
        topic_code: s.topic_code,
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
      finalised_stamp: input.finalised_stamp ?? null,
      // ⚠️ THE NOTE IS THE ABSENCE OF THE STAMP, and the two are mutually exclusive by construction
      // rather than by a caller remembering. A paper cannot be both finalised and warning that it
      // is not.
      cover_note: input.finalised_stamp ? null : NOT_FINALISED_NOTE,
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
      topics_asked: asked.length,
      topics_with_ratings: withRatings.length,
      material_topics: materialTopics.map(j => ({
        subtopic_code: j.subtopic.subtopic_code,
        // ⚠️ READ FROM THE ROW, NEVER PARSED OUT OF subtopic_code. RegisterSubTopic carries
        // topic_code (register.ts:119) and the field directly below it already states the rule for
        // its neighbour: "mr_esrs_topics.category. Never derived from subtopic_code." Splitting
        // "E1.2" on the dot is what 20260820's header rejects by name - correct for a one-off check
        // against a seed you can read, and a latent defect the moment it becomes a routing rule.
        topic_code: j.subtopic.topic_code,
        name: nameOf(j.subtopic),
        topic_label: j.subtopic.topic_label,
        carried_by: j.carried_by,
      })),
      definitions: {
        assessed: FINDINGS_DEFINITIONS.assessed,
        material: FINDINGS_DEFINITIONS.material,
        differing: FINDINGS_DEFINITIONS.differing,
        coverage: FINDINGS_DEFINITIONS.coverage,
      },
    },

    participation: {
      heading: PARTICIPATION_HEADING,
      totals: input.participation,
      by_category: input.by_category,
      note: PARTICIPATION_NOTE,
      completion_note: PARTICIPATION_COMPLETION_NOTE,
    },

    stakeholderView: {
      heading: STAKEHOLDER_HEADING,
      rows: stakeholderRows,
      scale_note: STAKEHOLDER_SCALE_NOTE,
      no_mean_note: NO_MEAN_NOTE,
    },

    /**
     * ⚠️ BUILT ALWAYS, RENDERED NEVER (yet). generateBoardReportPDF does not read this section -
     * see the block above section 6b there for why, and for what turning it on requires.
     */
    roadmap: buildRoadmap(
      materialTopics,
      input.disclosure_requirements ?? [],
      input.requirements_resolved_note ?? null,
    ),

    assessmentView: {
      heading: ASSESSMENT_HEADING,
      // ⚠️ EVERY SUB-TOPIC IN SCOPE, NOT THE MATERIAL ONES. Until 22 Aug 2026 this rendered
      // materialTopics while section 3 counted `assessed` — in scope AND (material or fully
      // judged) — so a topic judged complete in both directions and material in NEITHER counted
      // toward "topics assessed" and appeared nowhere. On the fixture that was Air pollution, the
      // subject of the register's only entry: page 3 said three assessed, section 9 showed two.
      //
      // ⚠️ AND THE SECTION'S OWN PROSE ALREADY PROMISED THIS. ABSTENTION_NOTE says a topic missing
      // any dimension "is reported as unfinished, naming what is absent". That described behaviour
      // the section did not have. Rendering all of scope is what makes the sentence true.
      rows: judged.filter(j => j.subtopic.status === 'included').map(j => ({
        subtopic_code: j.subtopic.subtopic_code,
        name: nameOf(j.subtopic),
        topic_label: j.subtopic.topic_label,
        material: j.material,
        carried_by: j.carried_by,
        directions: j.directions,
      })),
      abstention_note: ABSTENTION_NOTE,
    },

    /**
     * ⚠️ A SPLIT ROOM IS A FINDING, NOT A FOOTNOTE. The aggregate already marks these; until now
     * they appeared only as a sentence under a chart, where a reader scanning for findings scrolls
     * past them. They are the rows where an average would have been most misleading and where the
     * organisation most likely does not yet know why two groups see a topic differently.
     */
    polarisation: {
      heading: POLARISATION_HEADING,
      what_this_is: POLARISATION_WHAT_THIS_IS,
      method_note: polarisationLevels(input.polarisation_levels),
      // Reuses the rows section 5 built, so the two cannot describe the same sub-topic differently.
      rows: stakeholderRows.filter(r => polarised.has(r.subtopic_code)),
      none_note: POLARISATION_NONE,
    },

    /**
     * ⚠️ ORDERED HERE, NOT IN THE RENDERER. Flagged first, then widest gap first — the order the
     * results screen uses, so a reader who has seen both meets the same pairs in the same sequence.
     * Which findings come first is a claim about what matters, and that is content.
     */
    contrast: {
      heading: CONTRAST_HEADING,
      what_this_is: input.contrast?.what_this_is ?? null,
      what_this_is_not: input.contrast?.what_this_is_not ?? null,
      entries: [...(input.contrast?.entries ?? [])].sort((a, b) =>
        (b.flagged ? 1 : 0) - (a.flagged ? 1 : 0) || (b.gap ?? -1) - (a.gap ?? -1)),
      none_note: CONTRAST_NONE,
      unavailable_note: input.contrast ? null : CONTRAST_UNAVAILABLE,
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
