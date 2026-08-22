// lib/materiality.ts
// ThemisIQ — Materiality & Scenario Analysis scoring engine.
//
// PURE LOGIC. No Supabase, no auth, no I/O. The API route fetches the reference
// tables and passes them in; this module only computes. Keeping it pure means the
// scoring logic can be tested and audited in isolation — which matters for the
// methodology doc's defensibility story.
//
// Model: physical risk  = industry sensitivity x regional hazard x scenario x horizon
//        transition risk = industry carbon    x jurisdiction policy x scenario x horizon
//        opportunities   = industry relevance x scenario link (TCFD five categories)
//        CSRD matrix     = per-ESRS-topic financial score (vertical) x impact score (horizontal)
// E1 (climate) financial score is overridden by the live physical/transition engine.

// ---------- Reference-data shapes (rows from the mr_* tables) ----------
// Provenance of a single reference value — mirrors the mr_* CHECK constraint (migration
// 20260715_mr_provenance_columns). 'starter' = seeded sector/region default pending calibration;
// 'primary_source' = transcribed from a named source (carried in source_ref); 'expert_judgment' =
// a disclosed expert-set value. Optional on the row types below: rows loaded from the DB always
// carry provenance (NOT NULL default 'starter'), but synthetic/legacy rows may omit it — in which
// case the summary treats them as the LEAST-firm category ('starter'), never over-stating firmness.
import { parseIsoDateUTC } from './reportDates'

export type Provenance = 'starter' | 'primary_source' | 'expert_judgment'
type ProvenanceFields = { provenance?: Provenance; source_ref?: string | null }

export type ModelConfig = {
  model_version: string
  phys_high: number; phys_med: number
  topic_high: number; topic_med: number
  horizon_short: number; horizon_medium: number; horizon_long: number
  // Transition-driver band thresholds. LOAD-BEARING METHODOLOGY under the normalised financial
  // score (climateFinancial): they set each driver's high/med boundary AND its normalisation
  // denominator, so they determine the E1 number — not just a display band. They live in
  // mr_model_config (not a hardcoded const) so model_version covers them. Policy carries an extra
  // jurisdiction factor (range ~0-26); the other three do not (range ~0-9), hence two scales.
  trans_policy_high: number; trans_policy_med: number
  trans_driver_high: number; trans_driver_med: number
} & ProvenanceFields
export type Industry = { code: string; label: string; carbon_exposure: number } & ProvenanceFields
// The geography of the model — the IPCC AR6 reference regions offered in the UI. Sourced from
// mr_regions (the single source of truth). `continent` groups the dropdown; `sort_order` orders it.
export type Region = { code: string; label: string; continent: string; sort_order: number }
export type RegionHazard = { region_code: string; hazard: string; intensity: number } & ProvenanceFields
export type IndustryHazard = { industry_code: string; hazard: string; sensitivity: number } & ProvenanceFields
export type Jurisdiction = { code: string; label: string; policy_intensity: number } & ProvenanceFields
export type EsrsTopic = { code: string; label: string; category: string; sort_order: number }

// ── ESRS standard versions and per-version topic labels ──────────────────────────────────────
// The ten topical-standard CODES are stable across both standards; only the display NAMES move
// (E3 'Water and marine resources' -> 'Water', E5 -> 'Circular Economy and Resource Use', and
// S1/S2 take Appendix A's joint title). So mr_esrs_topics keeps ten rows and a single-column PK,
// and mr_esrs_topic_labels carries the name per (topic, standard_version). See
// supabase/migrations/20260815_mr_esrs_topic_labels.sql.
//
// Article 2(1) of the 2026 delegated act allows all three to coexist for FY2026; Article 2(2)
// requires the undertaking to STATE which it applied. That is why this is a disclosure rather
// than a preference, and why an unrecognised value is a 400 at the route rather than a coerced
// default: absent is an honest "not stated", wrong means the client believes it stated something.
export type StandardVersion = 'esrs_2023' | 'esrs_2023_reliefs' | 'esrs_2026'
export const STANDARD_VERSIONS = ['esrs_2023', 'esrs_2023_reliefs', 'esrs_2026'] as const
export function isStandardVersion(v: unknown): v is StandardVersion {
  return typeof v === 'string' && (STANDARD_VERSIONS as readonly string[]).includes(v)
}
// ── REPORTING PERIOD vs STANDARD VERSION — A WARNING THAT NEVER BLOCKS ───────────────────────────
//
// A test report read "Reporting period FY2025" beside "ESRS standard version: ESRS (2026)". That
// combination cannot occur. Article 3 of Commission Delegated Regulation C(2026) 5010 applies the
// revised standards to financial years beginning on or after 1 January 2027, with a transitional
// option under Article 2 for a financial year beginning in calendar 2026.
//
// ⚠️ THE INSTRUMENT IS NOW IN THE REPO — docs/reference/source/main-act.txt, added by commit
// 6dc9740. Every rule below cites it by line. UNTIL THAT COMMIT THIS FILE CITED ARTICLES 2 AND 3
// WITHOUT EITHER BEING PRESENT: the only source on disk was the ANNEX (the standards text), which
// contains neither, and the only corroboration was ThemisIQ's own prose in
// docs/materiality-questionnaire-spec-v5..v12 — six copies of one uncited sentence. The rules
// turned out to be right. That was not knowable at the time, and a verifier could not have checked
// it. Regenerate the extraction with scripts/extract-sources.sh; docs/reference/README.md records
// what each source document is and what is still missing.
//
// ⚠️ WHY THIS WARNS AND NEVER 400s.
// Article 2(2) requires the UNDERTAKING to state which version it applied — "shall clearly state in
// their sustainability statement which version they apply" (main-act.txt:480-483). A statement we
// refuse to record is a statement we have made on their behalf. Their disclosure is theirs to get
// wrong; our job is to show them the disagreement on the page a verifier reads. That is the whole
// reason, and it is unaffected by everything below.
//
// ⚠️ THIS TOOK A DATE ONLY FROM 21 AUG 2026. Until then the input was a free-text label — "FY2026" —
// and two further arguments stood here, BOTH ABOUT THE LABEL BEING THE WRONG SHAPE: that Article 2
// keys on the day the financial year BEGINS and a label cannot express it, and that enforcement
// could only ever fire on a confident parse. Both are now spent. They are recorded as spent rather
// than deleted, because the defect they describe is the one that motivated the change and is worth
// being able to find again:
//
//     A UK undertaking whose financial year runs 1 April 2026 to 31 March 2027 calls that year
//     "FY2027", by the commonest UK convention. The label parse read 2027, and the Article 2(1)
//     transitional option — offered for years BEGINNING in calendar 2026 — was reported as
//     CONFLICTING when it in fact applied. A wrong verdict, on the report's face, with nothing
//     erroring anywhere. 2026-04-01 is not ambiguous about which calendar year the year begins in.
//     A label is.
//
// ⚠️ ALL THREE RULES FALL ON 1 JANUARY, so the CALENDAR YEAR of periodStart decides every one of
// them and no month/day arithmetic appears below. That is a property of these three rules, NOT a
// licence to go back to storing a year: the year is DERIVED from a date here, and the derivation is
// the part that was broken. A future rule keying on any other day has the date to key on.
//
// ⚠️ periodEnd IS CARRIED, NOT CONSULTED. No rule in Articles 2 or 3 reads it. It is in the record
// so the frozen check states the period it was checking, and so a rule needing the year's length
// does not need a new signature. It is deliberately NOT validated against periodStart: the
// both-or-neither and end > start CHECK constraints on materiality_assessments (migration
// 20260846) are the authority, and a second, weaker opinion inside a function that must never block
// would only be able to disagree with them.
//
// ⚠️ UNPARSEABLE IS REPORTED AS UNPARSEABLE — NEVER FOLDED INTO 'ok', AND NEVER INTO 'conflict'.
// "We could not read the period" and "the period disagrees with the version" are different facts,
// and a function reporting the second while knowing only the first would assert a finding it cannot
// support. An empty result is a result. Note what this does NOT cover: a date that is merely
// IMPLAUSIBLE is not unreadable. 1989-04-01 is a real day, so the rule decides it and it conflicts.
// The old parser refused it via a 1990..2100 plausibility window and reported the weaker finding;
// that window is gone.
//
// The record this produces is FROZEN INTO workings.disclosure AT WRITE, alongside labelResolution
// and drResolution and for the same reason: a report must reprint the conflict as it stood when the
// assessment ran, not re-derive it against a rule that has since moved. Historical rows are never
// rewritten — an assessment that stated an impossible combination stated it. That INCLUDES the rows
// written before this took a date: they hold `reportingPeriod` and `fiscalYear` where this now
// writes `periodStart`/`periodEnd`/`startYear`, and they are not migrated. They stated what they
// stated, and the report reads only status/message/certainty, which are unchanged.

export type PeriodVersionStatus =
  | 'ok'           // the financial year begins inside the stated version's window
  | 'conflict'     // it begins outside it
  | 'unparseable'  // both stated, but periodStart is not a calendar date
  | 'not_stated'   // version or start absent — nothing to compare, and no claim is made

export type PeriodVersionCheck = {
  standardVersion: StandardVersion | null
  /** VERBATIM as supplied — never trimmed, never reformatted. A verifier may cross-check it. */
  periodStart: string | null
  /** VERBATIM as supplied. Carried for the record; no rule below reads it. */
  periodEnd: string | null
  /** The calendar year periodStart falls in; null when it is absent or not a date. */
  startYear: number | null
  status: PeriodVersionStatus
  // ── THE REGISTER OF THE CONFLICT, AND WHY THE THREE RULES ARE NOT EQUALLY FIRM ────────────────
  // The copy printed on the report's face distinguishes these, so the distinction has to be real.
  //
  //   'explicit' — the act states the limit IN TERMS, about the instrument itself:
  //                "It shall apply to the financial years beginning on or after 1 January 2027."
  //                (Article 3, main-act.txt:489.) Both the esrs_2026 and esrs_2023 branches rest
  //                on that sentence, which is why both are 'explicit'.
  //
  //   'inferred' — Article 2(1) does something different. It CONFERS A PERMISSION over a stated
  //                range — "For the financial years starting between 1 January 2026 and
  //                31 December 2026, undertakings ... may apply either of the following"
  //                (main-act.txt:444-446) — and says NOTHING AT ALL about a year outside it. The
  //                exclusion follows from the grant not reaching that year, not from a prohibition.
  //                That is a weaker kind of finding than Article 3's, and the report says so.
  //
  // null unless status === 'conflict'.
  certainty: 'explicit' | 'inferred' | null
  /** What was OBSERVED. Never a cause, never advice — each surface adds its own framing. */
  message: string | null
}

/**
 * The calendar year in which the financial year BEGINS, or null when `v` is not a calendar date.
 *
 * ⚠️ THE PARSE LIVES IN lib/reportDates.ts, NOT HERE. It carried its own copy until 21 Aug 2026;
 * the two had the same contract — one strict ISO form, a Date.UTC round-trip that REFUSES an
 * impossible day rather than rolling it forward, no timezone ever consulted — and CLAUDE.md's rule
 * for exclusiveEnd() applies: same contract, one definition. `new Date(v)` is still not used
 * anywhere in that chain, because it accepts "2026-02-30" as 2 March and reads a local timezone
 * into a bare date, which would turn a year beginning 1 January into one beginning 31 December
 * west of UTC.
 *
 * No plausibility window. A date validates itself; the old 1990..2100 clamp reported an implausible
 * but real day as unreadable, which is a weaker finding than the rule can actually make.
 */
export function periodStartYear(v: string | null | undefined): number | null {
  return parseIsoDateUTC(v)?.y ?? null
}

export function checkReportingPeriod(
  periodStart: string | null,
  periodEnd: string | null,
  standardVersion: StandardVersion | null,
): PeriodVersionCheck {
  // Whatever the verdict, the record echoes what was supplied, verbatim.
  const base = { standardVersion, periodStart, periodEnd, startYear: null as number | null }

  // ⚠️ ONE BLANK, ONE MEANING. The old guard was bare truthiness, so "" exited here as not_stated
  // while "  " passed, reached the parser and came back unparseable — two visually identical blanks
  // reported as two different facts, one of them a finding on the report. Normalising BEFORE the
  // guard closes that seam. Callers should still pass an explicit null; this is the floor, not the
  // contract, and it is what stops a half-filled date form reading as a deliberate abstention.
  const startGiven = typeof periodStart === 'string' && periodStart.trim() !== ''

  // No claim is possible without both. A null standardVersion is a legitimate "not stated"
  // (Art. 2(2) permits the statement to be absent; an assumed one would be false), and a null
  // start is simply a field the user left alone. Neither is a finding.
  if (!standardVersion || !startGiven) {
    return { ...base, status: 'not_stated', certainty: null, message: null }
  }

  const startYear = periodStartYear(periodStart)
  if (startYear == null) {
    return {
      ...base,
      status: 'unparseable',
      certainty: null,
      message: `The reporting period start "${periodStart}" is not a calendar date, `
        + 'so it could not be checked against the ESRS version stated.',
    }
  }

  const stated = { ...base, startYear }

  // ESRS (2026) applies to financial years beginning on or after 1 January 2027 (Article 3,
  // main-act.txt:489), and Article 2(1)(a) offers it for a year beginning in calendar 2026
  // (main-act.txt:444-449). So a year beginning before 1 January 2026 conflicts, and the limit
  // is stated in terms — hence 'explicit'.
  if (standardVersion === 'esrs_2026' && startYear < 2026) {
    return {
      ...stated, status: 'conflict', certainty: 'explicit',
      message: `ESRS (2026) applies to financial years beginning on or after 1 January 2027, with `
        + `early adoption permitted for a financial year beginning in 2026. The financial year `
        + `stated begins ${periodStart}.`,
    }
  }

  // The reliefs are Article 2(1)(b) — one limb of a PERMISSION granted "For the financial years
  // starting between 1 January 2026 and 31 December 2026" (main-act.txt:444-446, and the article's
  // own title at main-act.txt:442-443). Outside that range the act says nothing; the option simply
  // does not reach the year. An exclusion that follows from the grant's scope rather than from a
  // prohibition in terms is the weaker finding, hence 'inferred' — contrast Article 3 above, which
  // states its limit about the instrument directly.
  if (standardVersion === 'esrs_2023_reliefs' && startYear !== 2026) {
    return {
      ...stated, status: 'conflict', certainty: 'inferred',
      message: `The reliefs in Article 2(1) are offered for financial years beginning between `
        + `1 January and 31 December 2026. The financial year stated begins ${periodStart}.`,
    }
  }

  // From 1 January 2027 only the revised standards apply: Article 1 replaces Annex I of
  // Del. Reg. (EU) 2023/2772 outright, and Article 3 applies that replacement to financial years
  // beginning on or after that date (main-act.txt:489). Stated in terms — 'explicit'.
  //
  // ⚠️ NO LOWER BOUND, AND THAT IS NOT THE SAME AS THERE BEING NONE IN LAW. This instrument does
  // not address when the 2023 standards FIRST applied; it amends 2023/2772 and never states that
  // regulation's own application date. See test L3 and docs/reference/README.md.
  if (standardVersion === 'esrs_2023' && startYear > 2026) {
    return {
      ...stated, status: 'conflict', certainty: 'explicit',
      message: `ESRS (2023) applies to financial years beginning before 1 January 2027. `
        + `The financial year stated begins ${periodStart}.`,
    }
  }

  return { ...stated, status: 'ok', certainty: null, message: null }
}

export type TopicLabelRow = { topic_code: string; standard_version: string; label: string }

// ── THE FIVE SOURCE STATES, DECLARED ONCE AND SHARED ────────────────────────────────────────────
// Both resolvers answer the same five-way question about their own lookup, so the VOCABULARY is
// shared. The RECORDS are not — see the note on DrResolution for why extending LabelResolution
// with disclosure-requirement fields would have been the wrong move.
export type ResolutionSource =
  | 'versioned'              // every item resolved — no fallback anywhere
  | 'versioned_partial'      // SOME resolved, some fell back: one artefact, two standards' content
  | 'default_none_resolved'  // lookup ran, matched nothing
  | 'default_no_version'     // no standardVersion stated, so no lookup was attempted
  | 'default_fetch_error'    // the lookup itself failed

// How the topic names in a saved assessment were arrived at. Persisted to
// workings.labelResolution and rendered by the report, because a fallback that is invisible is
// indistinguishable from a correct resolve — and the report states a standard version on its
// face, so an unannounced default would read as that standard's wording.
export type LabelResolution = {
  standardVersion: StandardVersion | null
  // How many of the topics got a name from mr_esrs_topic_labels for this version.
  resolved: number
  source: ResolutionSource
  // Topic codes that were LOOKED UP AND NOT FOUND. Empty when no lookup was attempted
  // ('default_no_version') or when the lookup failed wholesale ('default_fetch_error') — in both
  // of those, `source` is the fact, and listing every code would imply a per-topic determination
  // that never happened.
  fallbackTopics: string[]
}

// ── DISCLOSURE REQUIREMENTS — A SIBLING RECORD, NOT AN EXTENSION OF LabelResolution ─────────────
//
// The two were nearly merged. They should not be, and the reason is the one thing that matters
// about this whole layer: THE TWO FALLBACKS ARE NOT THE SAME KIND OF EVENT.
//
//   A LABEL fallback serves mr_esrs_topics.label — the pre-versioning name the module has always
//   displayed. The reader sees a familiar name that is not attributed to any standard. Harmless,
//   and the existing disclosure says so in exactly those terms.
//
//   A REQUIREMENT fallback serves THE 2023 ROWS — a DIFFERENT STANDARD'S REQUIREMENTS. That is not
//   a default, it is a SUBSTITUTION, and under a stated version of ESRS (2026) it is the precise
//   defect this table was built to end. One shared `source` enum whose 'default_none_resolved'
//   meant "a familiar name" on one record and "another standard's requirements" on the other would
//   be a category error encoded in a type.
//
// Three further reasons, so the decision survives someone tidying it later:
//
//   · DIFFERENT CARDINALITY, SO `resolved` WOULD LIE. LabelResolution.resolved counts topics, out
//     of ten. A requirement resolve spans up to 64 rows across those ten. A single `resolved: 7`
//     on a merged record would be unreadable without knowing which question it answered.
//
//   · PARTIAL IS WORSE HERE, AND DIFFERENTLY. A partial label resolve is one table carrying two
//     spellings. A partial REQUIREMENT resolve is a roadmap in which some topics list 2026
//     requirements and others list 2023 ones, all under one stated version — and because the codes
//     collide (49 of them exist in both versions with different titles), the reader cannot tell
//     which is which by looking. It needs its own per-topic partition, which LabelResolution's
//     single `fallbackTopics` array cannot carry.
//
//   · EXTENDING WOULD RETRO-CHANGE EVERY SAVED RECORD. workings.labelResolution is persisted on
//     every existing assessment. Adding fields to it means an old record is a partially-populated
//     new record, and labelResolutionNote would have to tell "saved before requirements were
//     versioned" from "the requirement lookup failed" — reintroducing exactly the
//     absent-versus-failed collapse that type was written to prevent. A separate key is simply
//     ABSENT on an old record, which is an observation the note can state plainly.
//
// What IS shared is ResolutionSource above: the same five-way question about a lookup, declared
// once. That is the reuse that is safe — the vocabulary, not the record.

/** A row of mr_esrs_disclosure_requirements, as fetched and as frozen into workings. */
export type DisclosureRequirementRow = {
  dr_code: string
  standard_version: string
  topic_code: string
  title: string
  /** NULL = not yet written. NEVER render as an empty cell — see DrResolution.datapointsMissing. */
  datapoints: string | null
  sort_order: number
}

// How the disclosure requirements in a saved assessment were arrived at.
//
// resolvedTopics / fallbackTopics / unservedTopics PARTITION the topic codes: every topic is in
// exactly one, and together they account for all of them. A count alone could not express the
// state that matters — WHICH topics are showing another standard's requirements — and that is the
// only thing a preparer can act on.
export type DrResolution = {
  standardVersion: StandardVersion | null
  source: ResolutionSource
  /** Topics whose requirements came from the STATED version. */
  resolvedTopics: string[]
  /** Topics served from the fallback version instead. THESE ARE THE DANGEROUS ONES. */
  fallbackTopics: string[]
  /** Topics with no requirements in either version — printed as nothing, disclosed as nothing. */
  unservedTopics: string[]
  /** Which version the fallback rows came from. Null when no fallback was used. */
  fallbackVersion: StandardVersion | null
  /** Total requirement rows frozen into this assessment, across every topic. */
  requirementCount: number
  /**
   * Rows whose `datapoints` is null — 'not yet written', which is NOT 'nothing to collect'.
   * Counted at write so the report can state the gap rather than render an empty column that
   * reads as a finding. Every esrs_2026 row is null today.
   */
  datapointsMissing: number
}

/** The version served when a stated version has no rows of its own. */
export const DR_FALLBACK_VERSION: StandardVersion = 'esrs_2023'

/**
 * Resolve the disclosure requirements for one assessment, per topic, and report exactly what
 * happened.
 *
 * PURE, and called at WRITE alongside resolveTopicLabels — the rows are then frozen into the
 * record for its life. Same argument as the labels, one level down and with more consequence: a
 * report must reprint the requirements as they stood when the assessment ran, never today's
 * bundle. If this resolved at READ time, re-seeding the table would silently re-point every
 * historical roadmap at requirements the preparer was never shown.
 *
 * FALLBACK IS PER TOPIC, NOT PER ASSESSMENT. A version that has rows for some topics and not
 * others produces a mixed roadmap, and the mix is recorded topic by topic. Resolving all-or-
 * nothing would have been simpler and would have hidden the case that matters.
 *
 * `rows === null` means the fetch FAILED — distinct from "returned no rows", which is also what a
 * dropped RLS policy looks like. The two are never collapsed.
 */
export function resolveDisclosureRequirements(
  topicCodes: string[],
  rows: DisclosureRequirementRow[] | null,
  fallbackRows: DisclosureRequirementRow[] | null,
  standardVersion: StandardVersion | null,
): { requirements: DisclosureRequirementRow[]; resolution: DrResolution } {
  // Defensive filtering on BOTH sets, for the reason resolveTopicLabels gives: the routes filter by
  // version in SQL, but this function must be safe to call with an unfiltered set. Serving another
  // version's requirements silently is the one outcome forbidden.
  const byTopic = new Map<string, DisclosureRequirementRow[]>()
  for (const r of rows ?? []) {
    if (standardVersion && r.standard_version !== standardVersion) continue
    const list = byTopic.get(r.topic_code) ?? []
    list.push(r)
    byTopic.set(r.topic_code, list)
  }
  const fallbackByTopic = new Map<string, DisclosureRequirementRow[]>()
  for (const r of fallbackRows ?? []) {
    if (r.standard_version !== DR_FALLBACK_VERSION) continue
    const list = fallbackByTopic.get(r.topic_code) ?? []
    list.push(r)
    fallbackByTopic.set(r.topic_code, list)
  }

  const resolvedTopics: string[] = []
  const fallbackTopics: string[] = []
  const unservedTopics: string[] = []
  const requirements: DisclosureRequirementRow[] = []

  for (const code of topicCodes) {
    const own = byTopic.get(code)
    if (own && own.length) {
      resolvedTopics.push(code)
      requirements.push(...own)
      continue
    }
    const fb = fallbackByTopic.get(code)
    if (fb && fb.length) {
      fallbackTopics.push(code)
      requirements.push(...fb)
      continue
    }
    // No rows in either version. Printed as nothing AND disclosed as nothing — an empty roadmap
    // section with no explanation is the absence-as-finding failure in its purest form.
    unservedTopics.push(code)
  }

  requirements.sort((a, b) =>
    a.topic_code === b.topic_code ? a.sort_order - b.sort_order
      : topicCodes.indexOf(a.topic_code) - topicCodes.indexOf(b.topic_code))

  // ⚠️ THE SOURCE STATE IS ABOUT THE STATED VERSION'S LOOKUP, NOT ABOUT WHAT WAS SERVED. A record
  // can be 'default_no_version' and still carry 61 requirements — those two facts are independent
  // and the note has to say both. Collapsing them would let "we printed something" read as "the
  // version resolved".
  const source: ResolutionSource =
    !standardVersion ? 'default_no_version'
      : rows === null ? 'default_fetch_error'
        : resolvedTopics.length === 0 ? 'default_none_resolved'
          : fallbackTopics.length > 0 || unservedTopics.length > 0 ? 'versioned_partial'
            : 'versioned'

  return {
    requirements,
    resolution: {
      standardVersion,
      source,
      resolvedTopics,
      fallbackTopics,
      unservedTopics,
      fallbackVersion: fallbackTopics.length > 0 ? DR_FALLBACK_VERSION : null,
      requirementCount: requirements.length,
      datapointsMissing: requirements.filter(r => r.datapoints == null || r.datapoints.trim() === '').length,
    },
  }
}

// Overlay per-version topic names onto the reference topics, and report exactly what happened.
//
// PURE. Called by the routes BEFORE runAssessment, so the labels are resolved once, at write, and
// then frozen into results for the life of the record — which is correct: a report should reprint
// the name as it stood when the assessment ran, not whatever the table says years later.
//
// TWO INVARIANTS, both load-bearing:
//   1. It only ever replaces `label`. code, category and sort_order pass through untouched, so
//      nothing downstream — least of all computeMatrix's assessed/no_baseline branch — can change
//      behaviour because of a label. A missing label is a LABEL problem, never an assessment one.
//   2. It never substitutes a name it did not find. Every topic either gets its own version's
//      label or keeps mr_esrs_topics.label, and the latter is counted and reported. The default
//      is the PRE-VERSIONING label the module has always displayed — not a transcription, and not
//      a claim about what any particular standard calls that topic.
//
// `labelRows === null` means the fetch FAILED, which is a different fact from "returned no rows"
// and is reported as such. The two must not be collapsed: [] with no error is also what a dropped
// RLS policy looks like, so naming a cause we cannot observe would hide a grants regression.
export function resolveTopicLabels(
  topics: EsrsTopic[],
  labelRows: TopicLabelRow[] | null,
  standardVersion: StandardVersion | null,
): { topics: EsrsTopic[]; resolution: LabelResolution } {
  if (!standardVersion) {
    return {
      topics,
      resolution: { standardVersion: null, resolved: 0, source: 'default_no_version', fallbackTopics: [] },
    }
  }
  if (labelRows === null) {
    return {
      topics,
      resolution: { standardVersion, resolved: 0, source: 'default_fetch_error', fallbackTopics: [] },
    }
  }

  const byCode = new Map<string, string>()
  for (const r of labelRows) {
    // Defensive: the route filters by version in SQL, but this function must be safe to call with
    // an unfiltered set — silently applying another version's name is the one outcome forbidden.
    if (r.standard_version === standardVersion && r.label) byCode.set(r.topic_code, r.label)
  }

  const fallbackTopics: string[] = []
  const out = topics.map(t => {
    const versioned = byCode.get(t.code)
    if (versioned) return { ...t, label: versioned }
    fallbackTopics.push(t.code)
    return t
  })

  const resolved = out.length - fallbackTopics.length
  const source: LabelResolution['source'] =
    resolved === out.length && out.length > 0 ? 'versioned'
      : resolved === 0 ? 'default_none_resolved'
        : 'versioned_partial'

  return {
    topics: out,
    // On a full resolve there is nothing to list; on none-resolved the codes WERE looked up, so
    // listing them is accurate and useful.
    resolution: { standardVersion, resolved, source, fallbackTopics },
  }
}
export type TopicBaseline = { industry_code: string; topic_code: string; financial_base: number; impact_base: number } & ProvenanceFields
export type IndustryOpportunity = { industry_code: string; opportunity_category: string; relevance: number; sort_order: number } & ProvenanceFields
export type IndustryTransitionDriver = { industry_code: string; transition_driver: string; weight: number; sort_order: number } & ProvenanceFields
export type Scenario = {
  code: string; label: string; framework: string; descriptor: string | null
  physical_mult: number; transition_mult: number
} & ProvenanceFields

export type ReferenceData = {
  config: ModelConfig
  industries: Industry[]
  // The regions offered in the UI (mr_regions). Load-bearing for the guard below: it is the set the
  // dropdown can offer, checked against regionHazards so an offered-but-unmodelled region is visible.
  regions: Region[]
  regionHazards: RegionHazard[]
  industryHazards: IndustryHazard[]
  jurisdictions: Jurisdiction[]
  esrsTopics: EsrsTopic[]
  topicBaselines: TopicBaseline[]
  scenarios: Scenario[]
  industryOpportunities: IndustryOpportunity[]
  industryTransitionDrivers: IndustryTransitionDriver[]
  // Asset-profile hazard modifiers, keyed profile → hazard → multiplier. Optional during the
  // migration to mr_asset_modifiers: when absent the engine falls back to the ASSET_MOD const
  // (see note below). Supply from the DB to bring these coefficients under model_version.
  assetModifiers?: Record<string, Record<string, number>>
}

// ---------- User input ----------
export type AssessmentInput = {
  mode: 's2' | 'csrd'
  industryCode: string
  regionCodes: string[]
  jurisdictionCodes: string[]
  assetProfile: 'coastal' | 'inland' | 'water' | 'distributed'
  scenarioCode: string
  horizon: 'short' | 'medium' | 'long'
  impactOverrides?: Record<string, number>   // topic_code -> 0..10
  // Which ESRS version the assessment is prepared under. NULL means NOT STATED, which is a real
  // and honest state — not a default. It affects DISPLAY NAMES only (see resolveTopicLabels);
  // no score, band, quadrant or dataStatus reads it, so a label problem can never change whether
  // a topic is assessed. Carried on AssessmentInput so it lands in workings.input beside the
  // other engine inputs, mirroring model_version, which is both a column and a jsonb key.
  standardVersion?: StandardVersion | null
}

// ---------- Output ----------
export type Band = 'high' | 'med' | 'low'
// A hazard's data state. 'assessed' = a mr_region_hazards row exists (any intensity, incl. 0 — a
// real finding of no exposure). 'no_reference_data' = NO row for (region, hazard): we never looked,
// so score is NULL (an absence, NOT 0) and band is 'unknown'. The two MUST render distinctly.
export type PhysicalRisk = {
  hazard: string
  band: Band | 'unknown'
  score: number | null            // null when unknown — never 0 (0 is a measured claim of no exposure)
  drivingRegion: string
  dataStatus: 'assessed' | 'no_reference_data'
}
// highThreshold: the driver's 'high' band boundary (from config). Carried so the normalised
// financial score (score / highThreshold) is auditable and so the two driver scales are explicit.
export type TransitionRisk = { driver: string; band: Band; score: number; highThreshold: number }
export type Opportunity = { category: string; label: string; band: Band; relevance: number }
export type MatrixTopic = {
  code: string; label: string; category: string
  financial: number | null; impact: number | null   // null when no baseline — NOT a default 2
  financialBand: Band | 'unknown'; impactBand: Band | 'unknown'
  quadrant: 'both' | 'financial' | 'impact' | 'low' | 'unknown'
  dataStatus: 'assessed' | 'no_baseline'
}
// Provenance roll-up over the reference values THIS assessment actually used (the rows that fed the
// result — not the whole reference tables). Disclosed, never gated (same posture as pct_estimated):
// it tells a reader how firm the inputs are, it does not block the report.
export type ProvenanceSummary = {
  nTotal: number                 // reference values that fed this result
  nPrimarySource: number         // transcribed from a named primary source
  nExpertJudgment: number        // disclosed ThemisIQ expert-judgment determinations
  nStarter: number               // seeded starter defaults pending calibration
  primarySources: string[]       // distinct source_refs where provenance === 'primary_source'
}

export type AssessmentResult = {
  mode: 's2' | 'csrd'
  modelVersion: string
  provenance: ProvenanceSummary
  physical: PhysicalRisk[]
  transition: TransitionRisk[]
  opportunities: Opportunity[]
  matrix: MatrixTopic[]            // empty in s2 mode
  climateFinancialScore: number    // 0..10, the E1 financial number from the engine
  // The asset-modifier set actually applied (asset_profile → hazard → multiplier), surfaced so a
  // verifier can reproduce the physical scores from the artefact. See ASSET_MOD note below.
  assetModifiers: Record<string, number>
  summary: { physicalHigh: number; transitionHigh: number; topicsBothAxes: number; opportunitiesStrong: number }
}

const HAZARD_LABELS: Record<string, string> = {
  drought: 'Drought', water: 'Water stress', heat: 'Extreme heat',
  flood: 'Inland flooding', coastal: 'Coastal flooding', wildfire: 'Wildfire',
  // 'Cold / permafrost' RETIRED — see methodology §3.2a. The two readings pull opposite ways under
  // warming: cold extremes diminish, permafrost degradation increases, and scenario.physical_mult
  // scales every hazard UPWARD with warming. A diminishing hazard cannot be scored on this scale, so
  // the category is permafrost and ground instability, and cold extremes are out of scope.
  cyclone: 'Storms / cyclones', cold: 'Permafrost and ground instability',
}

const OPPORTUNITY_LABELS: Record<string, string> = {
  resource_efficiency: 'Resource efficiency',
  energy_source: 'Energy source',
  products_services: 'Products & services',
  markets: 'Markets',
  resilience: 'Resilience',
}

const OPP_SCENARIO_LINK: Record<string, 'transition' | 'physical' | 'neutral'> = {
  resource_efficiency: 'neutral',
  energy_source: 'transition',
  products_services: 'transition',
  markets: 'transition',
  resilience: 'physical',
}

// ⚠️ METHODOLOGY-COVERAGE GAP — these coefficients are OUTSIDE model_version.
// Every other coefficient (sensitivity, intensity, policy_intensity, carbon_exposure, weight,
// physical_mult) is a mr_* DB row covered by config.model_version. These asset modifiers are a
// hardcoded const with no cited source: edit them, redeploy, and every report still stamps the old
// model_version while its numbers have moved. They MUST move to mr_asset_modifiers (migration
// 20260714_climate_risk_methodology.sql adds the table + seeds these exact values). Until the API
// route supplies ref.assetModifiers from that table, this const is the FALLBACK only; the set
// actually applied is surfaced on AssessmentResult.assetModifiers so the artefact stays reproducible.
const ASSET_MOD: Record<string, Record<string, number>> = {
  coastal:    { coastal: 1.5, cyclone: 1.3, flood: 1.2 },
  inland:     { heat: 1.2, drought: 1.2, wildfire: 1.2, coastal: 0.3 },
  water:      { water: 1.5, drought: 1.4 },
  distributed:{ coastal: 0.6, flood: 0.8, heat: 0.8, drought: 0.8, water: 0.8, wildfire: 0.8, cyclone: 0.8, cold: 0.8 },
}
// Resolve the asset-modifier set for a profile: DB (ref.assetModifiers) when present, else the
// const fallback. One seam so the migration can flip the source without touching computePhysical.
function assetModifiersFor(ref: ReferenceData, profile: string): Record<string, number> {
  return (ref.assetModifiers ?? ASSET_MOD)[profile] ?? {}
}

function horizonMult(cfg: ModelConfig, h: AssessmentInput['horizon']): number {
  return h === 'short' ? cfg.horizon_short : h === 'long' ? cfg.horizon_long : cfg.horizon_medium
}

function computePhysical(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): PhysicalRisk[] {
  const sens = ref.industryHazards.filter(h => h.industry_code === input.industryCode)
  const hzn = horizonMult(ref.config, input.horizon)
  const assetMod = assetModifiersFor(ref, input.assetProfile)
  const out: PhysicalRisk[] = []
  for (const s of sens) {
    if (s.sensitivity <= 0) continue
    // Distinguish "a row exists" (assessed) from "no row at all" (no reference data). A row with
    // intensity 0 is a REAL finding of no exposure; a missing row is an ABSENCE. They are not equal.
    let regionExp = 0, driver = '', found = false
    for (const rc of input.regionCodes) {
      const rh = ref.regionHazards.find(r => r.region_code === rc && r.hazard === s.hazard)
      if (rh) {
        found = true
        if (!driver) driver = rc                 // attribute even an all-zero finding to a region
        if (rh.intensity > regionExp) { regionExp = rh.intensity; driver = rc }
      }
    }
    if (!found) {
      // NEVER omit and NEVER score 0: emit the hazard as unknown so the gap is visible in the report.
      out.push({
        hazard: HAZARD_LABELS[s.hazard] ?? s.hazard,
        band: 'unknown', score: null, drivingRegion: '', dataStatus: 'no_reference_data',
      })
      continue
    }
    // Assessed (intensity 0 → score 0, band 'low' — a real, disclosed finding of no exposure).
    const score = regionExp * s.sensitivity * (assetMod[s.hazard] ?? 1) * scenario.physical_mult * hzn
    out.push({
      hazard: HAZARD_LABELS[s.hazard] ?? s.hazard,
      band: score >= ref.config.phys_high ? 'high' : score >= ref.config.phys_med ? 'med' : 'low',
      score: Math.round(score * 10) / 10,
      drivingRegion: driver,
      dataStatus: 'assessed',
    })
  }
  // Unknown (data-gap) rows FIRST so they are prominent — they must not sort as low-risk and sink
  // to the bottom of the list where a reader would miss them; assessed rows follow by score desc.
  return out.sort((a, b) => {
    const au = a.dataStatus === 'no_reference_data', bu = b.dataStatus === 'no_reference_data'
    if (au !== bu) return au ? -1 : 1
    return (b.score ?? 0) - (a.score ?? 0)
  })
}

// New computeTransition — all four drivers real, sector-weighted, scenario-varying.
// Reads per-sector weights from mr_industry_transition_drivers (0-3 ordinal,
// mapped to multiplier weight/2). Policy keeps jurisdiction scaling; the other
// three are carbon x weight x scenario x horizon. TCFD/IFRS S2 do not prescribe
// weights; these are disclosed sector-level defaults (see assumptions register).
// Band thresholds differ by driver because policy carries an extra jurisdiction
// factor (range ~0-26) while the other three do not (range ~0-9).
function computeTransition(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): TransitionRisk[] {
  const ind = ref.industries.find(i => i.code === input.industryCode)
  const carbon = ind?.carbon_exposure ?? 1
  const hzn = horizonMult(ref.config, input.horizon)

  let jurMax = 0
  for (const jc of input.jurisdictionCodes) {
    const j = ref.jurisdictions.find(x => x.code === jc)
    if (j && j.policy_intensity > jurMax) jurMax = j.policy_intensity
  }

  // per-sector driver weights (0-3 ordinal -> weight/2 multiplier).
  // Fallback to neutral (ordinal 2 -> 1.0) if a sector row is missing.
  const weights = (ref.industryTransitionDrivers ?? []).filter(d => d.industry_code === input.industryCode)
  const wOf = (driver: string): number => {
    const row = weights.find(d => d.transition_driver === driver)
    return (row ? row.weight : 2) / 2
  }

  const round1 = (v: number) => Math.round(v * 10) / 10
  // Band thresholds now come from config (mr_model_config) — they are load-bearing methodology
  // under the normalised financial score, so they must be covered by model_version. Policy is
  // jurisdiction-scaled (larger range); the other three are not.
  const cfg = ref.config
  const policyBand = (v: number): Band => v >= cfg.trans_policy_high ? 'high' : v >= cfg.trans_policy_med ? 'med' : 'low'
  const driverBand = (v: number): Band => v >= cfg.trans_driver_high ? 'high' : v >= cfg.trans_driver_med ? 'med' : 'low'

  // Policy / legal: carbon x weight x jurisdiction intensity x scenario x horizon
  const policyScore = carbon * wOf('policy') * jurMax * scenario.transition_mult * hzn
  // Other three: carbon x weight x scenario x horizon
  const techScore   = carbon * wOf('technology') * scenario.transition_mult * hzn
  const marketScore = carbon * wOf('market')     * scenario.transition_mult * hzn
  const repScore    = carbon * wOf('reputation') * scenario.transition_mult * hzn

  return [
    { driver: 'Carbon pricing / policy', band: policyBand(policyScore), score: round1(policyScore), highThreshold: cfg.trans_policy_high },
    { driver: 'Market & demand shift',   band: driverBand(marketScore), score: round1(marketScore), highThreshold: cfg.trans_driver_high },
    { driver: 'Technology displacement', band: driverBand(techScore),   score: round1(techScore),   highThreshold: cfg.trans_driver_high },
    { driver: 'Reputation',              band: driverBand(repScore),    score: round1(repScore),    highThreshold: cfg.trans_driver_high },
  ]
}

function computeOpportunities(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): Opportunity[] {
  const rows = (ref.industryOpportunities ?? [])
    .filter(o => o.industry_code === input.industryCode)
    .sort((a, b) => a.sort_order - b.sort_order)
  const out: Opportunity[] = []
  for (const o of rows) {
    if (o.relevance <= 0) continue
    const link = OPP_SCENARIO_LINK[o.opportunity_category] ?? 'neutral'
    const mult = link === 'transition' ? scenario.transition_mult
               : link === 'physical'   ? scenario.physical_mult
               : 1
    const score = o.relevance * mult
    out.push({
      category: o.opportunity_category,
      label: OPPORTUNITY_LABELS[o.opportunity_category] ?? o.opportunity_category,
      band: score >= 3.5 ? 'high' : score >= 2 ? 'med' : 'low',
      relevance: Math.round(score * 10) / 10,
    })
  }
  return out
}

// ESRS financial materiality is a THRESHOLD test ("is climate financially material?"), so the
// operator is a MAX, not a sum: if ANY driver is material, the answer is yes. But the four
// transition drivers live on incommensurable raw scales (policy carries a jurisdiction factor,
// range ~0-26; the other three ~0-9), so a raw max was effectively max(policy) — market,
// technology and reputation could never drive the score. We NORMALISE each driver to its OWN high
// threshold first (score / highThreshold; 1.0 = at the high-materiality boundary), then take the
// max across drivers AND physical. Normalised 1.0 maps to the financial high threshold (topic_high).
// (A weighted SUM would answer a magnitude question ESRS never asks, using weights TCFD declines
// to prescribe — hence max, and hence NO tuning of the old 1.1/0.8 coefficients.)
function climateFinancial(physical: PhysicalRisk[], transition: TransitionRisk[], config: ModelConfig): number {
  // Unknown physical hazards (no reference data → score null) carry no assessed magnitude, so they
  // do not contribute to the financial number — we cannot claim a materiality we did not assess.
  const physMax = physical.reduce((m, p) => (p.score != null && p.score > m ? p.score : m), 0)
  const physNorm = config.phys_high > 0 ? physMax / config.phys_high : 0
  const transNorm = transition.reduce((m, t) => (t.highThreshold > 0 ? Math.max(m, t.score / t.highThreshold) : m), 0)
  const combinedNorm = Math.max(physNorm, transNorm)
  const raw = combinedNorm * config.topic_high
  return Math.max(2, Math.min(10, Math.round(raw * 10) / 10))
}

function computeMatrix(input: AssessmentInput, ref: ReferenceData, climateFin: number): MatrixTopic[] {
  const baselines = ref.topicBaselines.filter(b => b.industry_code === input.industryCode)
  const topicBand = (v: number): Band =>
    v >= ref.config.topic_high ? 'high' : v >= ref.config.topic_med ? 'med' : 'low'
  const round1 = (v: number) => Math.round(v * 10) / 10
  return ref.esrsTopics.slice().sort((a, b) => a.sort_order - b.sort_order).map(topic => {
    const base = baselines.find(b => b.topic_code === topic.code)
    // E1's financial is the engine number (always assessed). Any OTHER topic with no baseline row
    // for this industry is NOT assessed — it must read 'unknown', NEVER a default 2/'low' that
    // renders as a positive finding of immateriality on the double-materiality matrix.
    const isE1 = topic.code === 'E1'
    const assessed = isE1 || !!base
    if (!assessed) {
      return {
        code: topic.code, label: topic.label, category: topic.category,
        financial: null, impact: null, financialBand: 'unknown', impactBand: 'unknown',
        quadrant: 'unknown', dataStatus: 'no_baseline',
      }
    }
    // Reachable only when assessed: E1 (financial = engine number) OR a non-E1 topic WITH a baseline
    // (so base is non-null here). E1 may still lack a baseline row → its impact falls back to the
    // neutral default; the ?? 2 therefore only ever applies to E1, never to a data-gap topic (those
    // returned 'unknown' above).
    const financial = isE1 ? climateFin : base!.financial_base
    const impact = input.impactOverrides?.[topic.code] ?? base?.impact_base ?? 2
    const fMat = financial >= ref.config.topic_med
    const iMat = impact >= ref.config.topic_med
    const quadrant: MatrixTopic['quadrant'] = fMat && iMat ? 'both' : fMat ? 'financial' : iMat ? 'impact' : 'low'
    return {
      code: topic.code, label: topic.label, category: topic.category,
      financial: round1(financial), impact: round1(impact),
      financialBand: topicBand(financial), impactBand: topicBand(impact), quadrant,
      dataStatus: 'assessed',
    }
  })
}

// Every reference value (row) the assessment actually USED — the rows that fed THIS result, not the
// whole reference tables. Deliberately mirrors the row selection each compute* does, kept adjacent
// so the two cannot silently drift. Only the nine provenance-bearing tables are counted; the
// dimension/label tables (mr_regions, mr_esrs_topics) carry no calibratable value.
function usedReferenceRows(input: AssessmentInput, ref: ReferenceData): ProvenanceFields[] {
  const rows: ProvenanceFields[] = []
  rows.push(ref.config)                                                    // model config — always used (horizon, bands)
  const industry = ref.industries.find(i => i.code === input.industryCode)
  if (industry) rows.push(industry)                                        // carbon exposure (transition)
  const scenario = ref.scenarios.find(s => s.code === input.scenarioCode)
  if (scenario) rows.push(scenario)                                        // scenario multipliers
  // industry hazards computePhysical actually iterates (sensitivity > 0)
  const usedHazards = ref.industryHazards.filter(h => h.industry_code === input.industryCode && h.sensitivity > 0)
  rows.push(...usedHazards)
  // region hazards consulted for those hazards across the selected regions
  const hazardSet = new Set(usedHazards.map(h => h.hazard))
  rows.push(...ref.regionHazards.filter(r => input.regionCodes.includes(r.region_code) && hazardSet.has(r.hazard)))
  // selected jurisdictions that exist (computeTransition scans them for the max policy intensity)
  rows.push(...ref.jurisdictions.filter(j => input.jurisdictionCodes.includes(j.code)))
  // per-sector transition-driver weights
  rows.push(...ref.industryTransitionDrivers.filter(d => d.industry_code === input.industryCode))
  // opportunities scored for this industry (relevance > 0)
  rows.push(...ref.industryOpportunities.filter(o => o.industry_code === input.industryCode && o.relevance > 0))
  // topic baselines feed the CSRD matrix only
  if (input.mode === 'csrd') rows.push(...ref.topicBaselines.filter(b => b.industry_code === input.industryCode))
  return rows
}

function summariseProvenance(rows: ProvenanceFields[]): ProvenanceSummary {
  let nStarter = 0, nPrimarySource = 0, nExpertJudgment = 0
  const primarySources = new Set<string>()
  for (const r of rows) {
    const p = r.provenance ?? 'starter'   // untagged → least-firm category; never over-states firmness
    if (p === 'primary_source') { nPrimarySource++; if (r.source_ref) primarySources.add(r.source_ref) }
    else if (p === 'expert_judgment') nExpertJudgment++
    else nStarter++
  }
  return { nTotal: rows.length, nPrimarySource, nExpertJudgment, nStarter, primarySources: [...primarySources] }
}

// Public: the provenance roll-up for a single assessment. Exported so the resilience path (and tests)
// can reuse the exact same accounting.
export function computeProvenance(input: AssessmentInput, ref: ReferenceData): ProvenanceSummary {
  return summariseProvenance(usedReferenceRows(input, ref))
}

export function runAssessment(input: AssessmentInput, ref: ReferenceData): AssessmentResult {
  const scenario = ref.scenarios.find(s => s.code === input.scenarioCode)
  if (!scenario) throw new Error(`Unknown scenario: ${input.scenarioCode}`)
  if (!ref.industries.find(i => i.code === input.industryCode)) {
    throw new Error(`Unknown industry: ${input.industryCode}`)
  }
  const physical = computePhysical(input, ref, scenario)
  const transition = computeTransition(input, ref, scenario)
  const opportunities = computeOpportunities(input, ref, scenario)
  const climateFin = climateFinancial(physical, transition, ref.config)
  const matrix = input.mode === 'csrd' ? computeMatrix(input, ref, climateFin) : []
  return {
    mode: input.mode, modelVersion: ref.config.model_version,
    provenance: computeProvenance(input, ref),
    physical, transition, opportunities, matrix, climateFinancialScore: climateFin,
    // Surface the exact asset modifiers applied so the physical scores are reproducible from the
    // artefact (these coefficients are not yet under model_version — see the ASSET_MOD note).
    assetModifiers: assetModifiersFor(ref, input.assetProfile),
    summary: {
      physicalHigh: physical.filter(p => p.band === 'high').length,
      transitionHigh: transition.filter(t => t.band === 'high').length,
      topicsBothAxes: matrix.filter(m => m.quadrant === 'both').length,
      opportunitiesStrong: opportunities.filter(o => o.band === 'high').length,
    },
  }
}

/**
 * Regions offered in the UI that have NO hazard data at all.
 * A region in the dropdown with zero mr_region_hazards rows will produce a
 * report where every hazard reads "not assessed" — technically honest, but
 * useless. This surfaces it so it is a known gap, not a surprise.
 *
 * Returns the offending region CODES (in ref.regions order). Empty = every
 * offered region has at least one hazard row.
 */
export function regionsWithNoHazardData(ref: ReferenceData): string[] {
  const covered = new Set(ref.regionHazards.map(h => h.region_code))
  return ref.regions.filter(r => !covered.has(r.code)).map(r => r.code)
}

// ===========================================================================
// MULTI-SCENARIO RESILIENCE ANALYSIS  (Stage 1 — engine)
// ---------------------------------------------------------------------------
// IFRS S2 / TCFD require scenario analysis across a DIVERSE range of scenarios
// (including a Paris-aligned one) AND a resilience CONCLUSION — not just running
// scenarios. This module runs the fixed diverse trio, compares the per-item
// profile across them, classifies each item, checks horizon sensitivity, and
// produces a transparent rules-based resilience synthesis.
//
// All logic here is rules-based and traces to the underlying scores — nothing
// is free-text generated — so every statement is auditable.
// ===========================================================================

// The fixed diverse trio (all-SSP for a clean monotonic warming range; each SSP
// carries both physical_mult and transition_mult so the engine treats them
// uniformly). Paris-aligned scenario is included by construction (ssp126),
// satisfying IFRS S2's explicit "latest international agreement" requirement.
export const RESILIENCE_TRIO = [
  { code: 'ssp126', role: 'paris',  label: 'Paris-aligned',     warming: '~1.8°C', source: 'IPCC AR6 (SSP1-2.6)' },
  { code: 'ssp245', role: 'middle', label: 'Current trajectory', warming: '~2.7°C', source: 'IPCC AR6 (SSP2-4.5)' },
  { code: 'ssp585', role: 'high',   label: 'High warming',       warming: '~4.4°C', source: 'IPCC AR6 (SSP5-8.5)' },
] as const

export type ResilienceRole = 'paris' | 'middle' | 'high'
export type ItemKind = 'physical' | 'transition' | 'opportunity'
export type Classification = 'persistent' | 'warming-contingent' | 'policy-path-contingent' | 'low-across-futures'

// One cell of the comparison grid: an item's band+score under one scenario.
export type ScenarioCell = { role: ResilienceRole; scenarioCode: string; band: Band; score: number }

// A row across all three scenarios for a single item, plus its classification,
// driver, time-horizon read, and the templated interpretation sentence.
export type ResilienceItem = {
  kind: ItemKind
  key: string                 // hazard / driver / opportunity category — stable identity
  label: string
  driver: string              // what produces it: region (physical) / 'policy intensity' (transition) / scenario link (opp)
  cells: ScenarioCell[]       // one per trio member, in trio order
  classification: Classification
  horizonTrend: 'rises' | 'stable'   // does it worsen toward 2050 (long vs short on middle scenario)
  interpretation: string      // templated, rules-derived
}

export type ResilienceSynthesis = {
  robustExposures: string[]              // material under ALL scenarios — priorities
  warmingContingent: string[]            // worse under high-warming
  policyContingent: string[]             // worse under Paris-aligned (rapid policy)
  twoChannel: 'both' | 'transition-led' | 'physical-led' | 'limited'
  inverts: boolean                       // do the two channels move in opposite directions across the range?
  profileSwing: { parisRiskCount: number; highRiskCount: number; swing: number; magnitude: 'limited' | 'moderate' | 'large' }
  horizonNote: 'worsens' | 'stable'
  statement: string                      // assembled qualitative resilience read
}

export type ResilienceResult = {
  modelVersion: string
  // Provenance roll-up for the analysis. The trio's per-scenario runs use the same reference rows
  // (each differs only by its one scenario row), so a single representative summary is accurate.
  provenance: ProvenanceSummary
  trio: { role: ResilienceRole; scenarioCode: string; label: string; warming: string; source: string }[]
  perScenario: { role: ResilienceRole; scenarioCode: string; result: AssessmentResult }[]
  items: ResilienceItem[]
  synthesis: ResilienceSynthesis
}

// Band → ordinal for comparisons. 'unknown' (a data gap, not an assessed low) ranks 0 here; such
// items are excluded upstream in collectItems, so this only guards the type.
function bandRank(b: Band | 'unknown'): number { return b === 'high' ? 2 : b === 'med' ? 1 : 0 }

// Collect the per-item cells for a given kind across the three scenario results.
function collectItems(
  kind: ItemKind,
  perScenario: { role: ResilienceRole; scenarioCode: string; result: AssessmentResult }[],
): Map<string, { label: string; driver: string; cells: ScenarioCell[] }> {
  const map = new Map<string, { label: string; driver: string; cells: ScenarioCell[] }>()
  for (const ps of perScenario) {
    let rows: { key: string; label: string; driver: string; band: Band; score: number }[] = []
    if (kind === 'physical') {
      // Unknown hazards are a reference-data gap (scenario-independent), not a scenario-contingent
      // finding — exclude them from the cross-scenario comparison. After this filter every band is
      // a real Band and every score a number.
      rows = ps.result.physical
        .filter(p => p.dataStatus === 'assessed')
        .map(p => ({ key: p.hazard, label: p.hazard, driver: p.drivingRegion, band: p.band as Band, score: p.score ?? 0 }))
    } else if (kind === 'transition') {
      rows = ps.result.transition.map(t => ({ key: t.driver, label: t.driver, driver: 'policy intensity', band: t.band, score: t.score }))
    } else {
      rows = ps.result.opportunities.map(o => ({ key: o.category, label: o.label, driver: OPP_SCENARIO_LINK[o.category] ?? 'neutral', band: o.band, score: o.relevance }))
    }
    for (const r of rows) {
      if (!map.has(r.key)) map.set(r.key, { label: r.label, driver: r.driver, cells: [] })
      map.get(r.key)!.cells.push({ role: ps.role, scenarioCode: ps.scenarioCode, band: r.band, score: r.score })
    }
  }
  return map
}

// Classify an item from its cells (paris vs high comparison + persistence).
function classify(kind: ItemKind, cells: ScenarioCell[]): Classification {
  const get = (role: ResilienceRole) => cells.find(c => c.role === role)
  const paris = get('paris'), mid = get('middle'), high = get('high')
  const ranks = [paris, mid, high].map(c => c ? bandRank(c.band) : 0)
  const materialEverywhere = ranks.every(r => r >= 1)   // med+ under all
  const materialAnywhere = ranks.some(r => r >= 1)
  if (!materialAnywhere) return 'low-across-futures'
  if (materialEverywhere) return 'persistent'
  const pr = paris ? bandRank(paris.band) : 0
  const hr = high ? bandRank(high.band) : 0
  // worse under high-warming → warming-contingent (physical pressure)
  // worse under paris-aligned → policy-path-contingent (rapid transition pressure)
  if (hr > pr) return 'warming-contingent'
  if (pr > hr) return 'policy-path-contingent'
  // equal but not everywhere material — treat by kind's dominant channel
  return kind === 'physical' ? 'warming-contingent' : 'policy-path-contingent'
}

// Templated, rules-derived interpretation sentence for one item.
function interpret(kind: ItemKind, label: string, cls: Classification, cells: ScenarioCell[]): string {
  const get = (role: ResilienceRole) => cells.find(c => c.role === role)
  const bandWord = (b?: Band) => b === 'high' ? 'high' : b === 'med' ? 'moderate' : 'low'
  const paris = get('paris'), high = get('high')
  const upside = kind === 'opportunity'
  switch (cls) {
    case 'persistent': {
      if (upside) return `${label}: relevant across all three futures — a robust opportunity that does not depend on the policy path.`
      const pB = bandWord(paris?.band), hB = bandWord(high?.band)
      const bandPhrase = pB === hB ? `${pB} under every pathway` : `${pB} under the Paris-aligned pathway and ${hB} under high warming`
      const rising = (high?.score ?? 0) > (paris?.score ?? 0)
      return kind === 'physical'
        ? `${label}: material across all three futures (${bandPhrase}) — a persistent physical exposure that ${rising ? 'intensifies as warming increases' : 'stays broadly level across the range'}.`
        : `${label}: material across all three futures (${bandPhrase}) — a persistent transition exposure, most acute under the Paris-aligned, rapid-policy pathway and ${rising ? 'rising with warming' : 'easing as policy ambition weakens'}.`
    }
    case 'warming-contingent':
      return upside
        ? `${label}: strengthens under higher-warming futures (${bandWord(high?.band)} at ~4.4°C vs ${bandWord(paris?.band)} at ~1.8°C).`
        : `${label}: rises with warming — ${bandWord(high?.band)} under the high-warming pathway vs ${bandWord(paris?.band)} under the Paris-aligned one. Exposure is driven by physical climate change.`
    case 'policy-path-contingent':
      return upside
        ? `${label}: strengthens under faster-transition futures (${bandWord(paris?.band)} under the Paris-aligned pathway), i.e. it is unlocked by rapid decarbonisation.`
        : `${label}: ${bandWord(paris?.band)} under the Paris-aligned pathway vs ${bandWord(high?.band)} under high warming. Exposure is to the speed of decarbonisation policy, not to warming itself.`
    default:
      return `${label}: low across all three futures.`
  }
}

// ---------------------------------------------------------------------------
// computeResilience — the four-rule synthesis over the trio's per-item rows.
// ---------------------------------------------------------------------------
function computeResilience(
  perScenario: { role: ResilienceRole; scenarioCode: string; result: AssessmentResult }[],
  horizonTrend: 'rises' | 'stable',
): { items: ResilienceItem[]; synthesis: ResilienceSynthesis } {
  const items: ResilienceItem[] = []

  for (const kind of ['physical', 'transition', 'opportunity'] as ItemKind[]) {
    const collected = collectItems(kind, perScenario)
    for (const [key, v] of collected) {
      const cls = classify(kind, v.cells)
      items.push({
        kind, key, label: v.label, driver: v.driver, cells: v.cells,
        classification: cls,
        horizonTrend,
        interpretation: interpret(kind, v.label, cls, v.cells),
      })
    }
  }

  // Rule 1 — robust (persistent) RISK exposures are the priorities.
  const robustExposures = items
    .filter(i => i.kind !== 'opportunity' && i.classification === 'persistent')
    .map(i => i.label)

  // Rule 2 — scenario-contingent risk exposures, grouped by driving future.
  const warmingContingent = items
    .filter(i => i.kind !== 'opportunity' && i.classification === 'warming-contingent')
    .map(i => i.label)
  const policyContingent = items
    .filter(i => i.kind !== 'opportunity' && i.classification === 'policy-path-contingent')
    .map(i => i.label)

  // Rule 4 — two-channel check, SEVERITY-aware. The earlier version counted
  // material risks at each end; that is blind to severity, so an entity whose
  // physical risks are already all material at the low-warming end (a sign of
  // HIGH exposure) could never register as physical-led, because its count
  // cannot grow. We now sum band ranks (low/med/high = 0/1/2) per channel —
  // bands are calibrated per driver and so are comparable across channels,
  // whereas raw scores are not. Transition bites hardest under the rapid-policy
  // (Paris) end; physical bites hardest under the high-warming end.
  const riskAt = (role: ResilienceRole) => perScenario.find(p => p.role === role)?.result
  const physSev = (role: ResilienceRole) => { const r = riskAt(role); return r ? r.physical.reduce((s, p) => s + bandRank(p.band), 0) : 0 }
  const transSev = (role: ResilienceRole) => { const r = riskAt(role); return r ? r.transition.reduce((s, t) => s + bandRank(t.band), 0) : 0 }
  const physParis = physSev('paris'), physHigh = physSev('high')
  const transParis = transSev('paris'), transHigh = transSev('high')

  // Material-risk counts retained for disclosure (shown in the report).
  const matCount = (r?: AssessmentResult) =>
    r ? r.physical.filter(p => bandRank(p.band) >= 1).length + r.transition.filter(t => bandRank(t.band) >= 1).length : 0
  const parisRiskCount = matCount(riskAt('paris'))
  const highRiskCount = matCount(riskAt('high'))

  // A channel is "active" if its band severity at its worst-case end is
  // meaningful (>=2: at least one High, or two Moderates).
  const transitionActive = transParis >= 2
  const physicalActive = physHigh >= 2
  const twoChannel: ResilienceSynthesis['twoChannel'] =
    transitionActive && physicalActive ? 'both'
      : physicalActive ? 'physical-led'
      : transitionActive ? 'transition-led'
      : 'limited'

  // Inversion — do the two channels move in OPPOSITE directions across the range
  // (physical worsening toward high warming while transition eases, or the
  // reverse)? This is the headline resilience finding and the count-based swing
  // cannot see it, so it is detected explicitly on band-rank severity.
  const physRises = physHigh > physParis, physEases = physHigh < physParis
  const transRises = transHigh > transParis, transEases = transHigh < transParis
  const inverts = (physRises && transEases) || (physEases && transRises)

  // Rule 3 — profile movement. Magnitude is taken from the larger single-channel
  // severity shift, so a composition inversion (which leaves the material-risk
  // COUNT almost unchanged) is no longer mis-read as a "limited" swing.
  const swing = Math.max(Math.abs(physHigh - physParis), Math.abs(transHigh - transParis))
  const magnitude: ResilienceSynthesis['profileSwing']['magnitude'] =
    swing <= 1 ? 'limited' : swing <= 3 ? 'moderate' : 'large'

  // Assemble the qualitative statement from the rule outputs.
  const parts: string[] = []
  if (robustExposures.length) {
    parts.push(`Across all three futures, ${joinList(robustExposures)} ${robustExposures.length === 1 ? 'remains a material risk — a robust exposure that warrants' : 'remain material risks — robust exposures that warrant'} attention regardless of the policy path.`)
  } else {
    parts.push(`No single risk is material across all three futures, indicating exposures are scenario-dependent rather than structural.`)
  }
  // Inversion sentence — rules-derived from the per-channel severity directions.
  if (inverts) {
    const physLabels = items.filter(i => i.kind === 'physical' && i.classification !== 'low-across-futures').map(i => i.label)
    const transLabels = items.filter(i => i.kind === 'transition' && i.classification !== 'low-across-futures').map(i => i.label)
    parts.push(physRises && transEases
      ? `The balance of risk inverts across the range: transition exposures${transLabels.length ? ` (${joinList(transLabels)})` : ''} are most severe under the Paris-aligned, rapid-policy pathway and ease as policy ambition weakens, while physical exposures${physLabels.length ? ` (${joinList(physLabels)})` : ''} intensify toward the high-warming pathway.`
      : `The balance of risk inverts across the range: physical exposures${physLabels.length ? ` (${joinList(physLabels)})` : ''} are most severe under the lower-warming pathway while transition exposures${transLabels.length ? ` (${joinList(transLabels)})` : ''} intensify under faster decarbonisation.`)
  }
  if (warmingContingent.length) parts.push(`${joinList(warmingContingent)} ${warmingContingent.length === 1 ? 'rises' : 'rise'} with warming, biting hardest under the high-warming pathway (physical-risk driven).`)
  if (policyContingent.length) parts.push(`${joinList(policyContingent)} ${policyContingent.length === 1 ? 'is' : 'are'} most material under the Paris-aligned pathway, indicating sensitivity to the speed of decarbonisation policy rather than to warming itself.`)
  parts.push(
    twoChannel === 'both' ? `The business faces meaningful stress under both transition-led and physical-led futures — resilience requires preparing for either rather than betting on a single pathway.`
    : twoChannel === 'physical-led' ? `Stress is concentrated in higher-warming (physical-risk) futures.`
    : twoChannel === 'transition-led' ? `Stress is concentrated in rapid-policy (transition-risk) futures.`
    : `Risk exposure is limited across the range tested.`
  )
  parts.push(`Measured on band severity, the risk profile shows a ${magnitude} shift across scenarios${inverts ? ' — driven by the inversion above rather than by any change in the number of material risks' : ''} (${parisRiskCount} material risk${parisRiskCount === 1 ? '' : 's'} under the Paris-aligned pathway, ${highRiskCount} under high warming)${!inverts && magnitude === 'limited' ? ', suggesting a relatively stable profile at screening level' : magnitude === 'large' ? ', so outcomes are materially scenario-dependent' : ''}.`)
  if (horizonTrend === 'rises') parts.push(`Exposure also tends to increase over the longer time horizon (toward 2050).`)
  parts.push(`This is a screening-level resilience read; the final determination of strategic resilience is a matter for management judgement, informed by entity-specific data.`)

  return {
    items,
    synthesis: {
      robustExposures, warmingContingent, policyContingent, twoChannel,
      inverts,
      profileSwing: { parisRiskCount, highRiskCount, swing, magnitude },
      horizonNote: horizonTrend === 'rises' ? 'worsens' : 'stable',
      statement: parts.join(' '),
    },
  }
}

// small helper: join a string list as "a, b and c"
function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

// Provenance for a resilience analysis. Unlike a single assessment (one scenario), the trio RUNS ALL
// THREE SSPs — so all three scenario rows are genuinely used and must be counted. Union the
// per-scenario used-row sets by object identity: the non-scenario rows are shared references and
// dedupe to once; the three distinct scenario rows are each counted. Hence an all-SSP-primary_source
// scenario table yields n_primary_source ≥ 3, not 1.
export function computeResilienceProvenance(input: AssessmentInput, ref: ReferenceData): ProvenanceSummary {
  const seen = new Set<ProvenanceFields>()
  const rows: ProvenanceFields[] = []
  for (const t of RESILIENCE_TRIO) {
    for (const r of usedReferenceRows({ ...input, scenarioCode: t.code }, ref)) {
      if (!seen.has(r)) { seen.add(r); rows.push(r) }
    }
  }
  return summariseProvenance(rows)
}

// ---------------------------------------------------------------------------
// runResilience — public entry point. Runs the diverse trio at the chosen
// horizon, checks horizon sensitivity on the middle scenario, synthesises.
// ---------------------------------------------------------------------------
export function runResilience(input: AssessmentInput, ref: ReferenceData): ResilienceResult {
  // Run each trio member at the user's chosen horizon.
  const perScenario = RESILIENCE_TRIO.map(t => ({
    role: t.role as ResilienceRole,
    scenarioCode: t.code,
    result: runAssessment({ ...input, scenarioCode: t.code }, ref),
  }))

  // Horizon sensitivity: compare the middle scenario at short vs long horizon. SEVERITY-aware, not
  // count-based — mirrors profileSwing. A count of material risks is blind to a severity shift: a
  // profile whose risks worsen (med→high) toward 2050 WITHOUT becoming more numerous would read
  // 'stable' under a count, dropping the long-horizon worsening sentence from the synthesis. Sum
  // band ranks (low/med/high = 0/1/2) instead, so a severity rise is seen.
  const midShort = runAssessment({ ...input, scenarioCode: 'ssp245', horizon: 'short' }, ref)
  const midLong  = runAssessment({ ...input, scenarioCode: 'ssp245', horizon: 'long' }, ref)
  const severity = (r: AssessmentResult) =>
    r.physical.reduce((s, p) => s + bandRank(p.band), 0) + r.transition.reduce((s, t) => s + bandRank(t.band), 0)
  const horizonTrend: 'rises' | 'stable' = severity(midLong) > severity(midShort) ? 'rises' : 'stable'

  const { items, synthesis } = computeResilience(perScenario, horizonTrend)

  return {
    modelVersion: ref.config.model_version,
    provenance: computeResilienceProvenance(input, ref),
    trio: RESILIENCE_TRIO.map(t => ({ role: t.role as ResilienceRole, scenarioCode: t.code, label: t.label, warming: t.warming, source: t.source })),
    perScenario,
    items,
    synthesis,
  }
}
