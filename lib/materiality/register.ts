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
  /**
   * materiality_impact_determinations.abstained_dimensions, as stored. Passed to computeSeverity,
   * which narrows it against the basis.
   * ⚠️ THIS TYPE CLAIMS TO MIRROR THE TABLE AND DID NOT. The column has existed since 20260841 and
   * was absent here, so the abstention was dropped before severity ever saw it — which is what let
   * the board report claim an abstention nobody had recorded. Added 27 Aug 2026.
   */
  abstained_dimensions?: readonly string[] | null
}

/** Mirrors the results page's SubTopic, plus the category and the determinations. */
/**
 * =====================================================================
 * ⚠️ ONE ENTRY PER DETERMINATION UNIT — (subtopic_code, iro_key) — NOT PER SUB-TOPIC.
 * =====================================================================
 * THE SHAPE OF THIS TYPE IS WHAT CARRIES THE DISJUNCTION ROLL-UP, so read this before changing it.
 *
 * SEVERAL ENTRIES MAY SHARE A subtopic_code: the sub-topic taken as a whole (iro_key '') and one
 * per company-defined IRO under it. Nothing collapses them before they arrive — the caller maps
 * materiality_impact_determinations in row for row, and the grouping happens HERE, in
 * rollUpDeterminations below, which keys on subtopic_code alone.
 *
 * ⚠️ WHAT THAT MEANS FOR ANYONE COUNTING. An array of these is NOT a list of sub-topics. Counting
 * it, or counting anything derived one-for-one from it, DOUBLE-COUNTS every sub-topic that has a
 * named IRO under it. That is not hypothetical: the first version of boardReport.ts's counts did
 * exactly this, and the fix is the `units` array there, built from the roll-up map rather than by
 * filtering rows. Anything that needs "per sub-topic" must go through rollUpDeterminations.
 *
 * ⚠️ WHAT BREAKS IF THIS TYPE IS EVER KEYED PER SUB-TOPIC INSTEAD — that is, if iro_key is removed
 * and callers are asked to hand in one pre-collapsed entry per code. It would look like a
 * simplification and every test would still pass, because the OUTPUT would be identical. What
 * changes is WHERE THE DISJUNCTION LIVES: it moves out of rollUpDeterminations and into whatever
 * the caller does to collapse its rows — a mapping in a route or a page, with no test binding it,
 * in a place nobody reviewing "the roll-up" would think to look. The rule would still be applied
 * and would no longer be anywhere it can be checked. Same failure in the other direction as
 * lead_submit's scope: the logic survives the move and its verification does not.
 *
 * WHERE THE DISJUNCTION IS TESTED: lib/materiality/boardReport.test.ts,
 * describe('the disjunction roll-up') — 13 tests, mutation-checked. They assert through the BOARD
 * REPORT's outputs (topics_material, material_only_via_iro, assessmentView rows and carriers, the
 * roadmap's driven_by, and the two notes) rather than on rollUpDeterminations' Map directly, which
 * is deliberate: asserting on the Map would prove the function works while leaving every consumer
 * free to re-derive. Note the cost, so it is not a surprise — register.test.ts asserts NOTHING
 * about the roll-up, so buildRegister's adoption of the rolled-up verdict rests on one test in the
 * other file ('section 7 and section 9 state the SAME verdict for the same sub-topic').
 *
 * ⚠️ judge() IN boardReport.ts ALREADY SEES IRO ROWS — it is handed this array whole. It judges
 * each row on its own determinations, which is correct and is why its `material` is per-row and
 * NOT the rolled-up verdict. Do not "fix" judge() to do the roll-up: buildRegister needs the same
 * answer, judge() is private to boardReport.ts, and two implementations is the thing this shape
 * exists to prevent.
 */
export type RegisterSubTopic = {
  subtopic_code: string
  /**
   * Which IRO under the sub-topic this row is. '' — the default, and what every pre-20260855 row
   * holds — is the sub-topic taken as a whole. A non-empty value names a company-defined IRO.
   *
   * ⚠️ OPTIONAL, AND ABSENT MEANS '' RATHER THAN "UNKNOWN". The two possible mistakes are not
   * symmetrical. Treating a custom IRO as a sub-topic prints today's sentence, which is already
   * what this code does; treating a sub-topic as a custom IRO would print "never put to anyone"
   * about a topic real people really answered, discounting stakeholder input that exists. The
   * default is chosen to fail in the first direction, never the second.
   */
  iro_key?: string
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
  /**
   * ⚠️ NOT THE SAME FACT AS no_substantive_answers, AND THE DIFFERENCE IS THE WHOLE REASON THIS
   * MEMBER EXISTS. "Nobody who was asked gave a rating" is a statement about the respondents: they
   * were asked, and they abstained or skipped. Said about a unit nobody was ever asked about, it is
   * FALSE — and it is false in a board paper, about the customer's own people.
   *
   * A custom IRO is never in survey scope, and that is structural rather than circumstantial:
   * materiality_survey_questions references mr_esrs_subtopics and has no iro_key column, so no
   * survey question can name an IRO the company added. There is no timing under which one could.
   */
  | 'never_in_survey_scope'
  | 'no_submitted_determination'
  | 'direction_never_scored'
  | 'determination_incomplete'

/**
 * =====================================================================
 * THE DISJUNCTION ROLL-UP
 * =====================================================================
 * A sub-topic is material if its OWN row (iro_key = '') is material OR any company-defined IRO
 * under it is. One place, read by buildRegister below and by boardReport.ts's judge(), assessed
 * count, material count, section 6 rows and roadmap — none of which re-derives it.
 *
 * ⚠️ A DISJUNCTION OVER FLAGS, NEVER A MAXIMUM OVER SEVERITIES. max(severity) would invent a
 * number nobody determined and stand as a second authority beside computeSeverity. This publishes
 * no severity at all: it reads `.material`, ORs, and stops. Every reason the header gives for
 * asking computeSeverity rather than comparing against a threshold is a reason not to aggregate
 * severities here.
 *
 * ⚠️ MONOTONE, AND THAT IS THE PROPERTY TO PRESERVE. Adding an IRO can only ADD materiality, never
 * remove it — the floor-not-balance stance register.ts takes at its own gate and boardReport.ts
 * restates at :963. Nothing in here may AND, subtract, or require agreement between carriers.
 * fully_judged is deliberately NOT rolled up; see its field comment.
 *
 * ⚠️ `=== true`, NOT TRUTHINESS. DirectionOutcome.material is null on an incomplete direction, and
 * null must count as "did not carry" rather than as either verdict. `!== false` would let an
 * unfinished IRO carry a topic on no evidence at all.
 *
 * ⚠️ SUBMITTED ONLY, inherited from submittedFor and not bypassed. A draft is somebody's work in
 * progress; a draft IRO must not carry a topic to a conclusion nobody has stood behind.
 */
export type Carrier = {
  /** '' is the sub-topic taken as a whole. A non-empty value names a company-defined IRO. */
  iro_key: string
  /** The IRO's name where there is one; null for the sub-topic's own row. */
  name: string | null
  /** Which direction(s) this carrier was material on. Never netted — ¶44. */
  carried_by: Direction[]
}

export type RolledUp = {
  subtopic_code: string
  /** The disjunction: own row OR any IRO. */
  material: boolean
  /** UNION of every carrier's directions. Two directions material is two findings, not a bigger one. */
  carried_by: Direction[]
  /** Every carrier, own row first then IROs by name. Empty when nothing carried it. */
  carriers: Carrier[]
  /**
   * True only when the sub-topic's OWN row is material. Exists so a consumer can say "material
   * ONLY via <IRO>" without inferring it from carriers, which is the sentence that stops a bare
   * material sub-topic reading as a judgement nobody made.
   */
  material_on_own_row: boolean
  /**
   * ⚠️ THE OWN ROW'S, DELIBERATELY NOT ROLLED UP.
   *
   * `assessed` is `in scope && (material || fully_judged)`. The `material ||`short-circuits, so a
   * MATERIAL sub-topic is assessed whatever fully_judged says — this is NOT the "0 topics assessed,
   * 1 material" contradiction of boardReport.ts:963-974, and saying it was would be naming a cause
   * that cannot occur. The real regression is narrower and still real:
   *
   *   A sub-topic that is NOT material and IS fully judged counts as assessed today. Roll
   *   fully_judged up — require every named IRO complete too — and adding one unfinished IRO under
   *   it REMOVES it from `topics_assessed`. Non-monotone: work went up, the count went down, and
   *   nothing on the page says why. That is the floor-not-balance stance broken from the other end.
   *
   * Verified by mutation, not by argument: rolling fully_judged up is caught by "an unfinished IRO
   * does not remove a not-material sub-topic from topics_assessed".
   *
   * The consequence is accepted, not overlooked: an unfinished IRO is invisible to section 3. It is
   * surfaced instead by the divergence register's `omitted`, and both SQL gates —
   * materiality_lead_submit and materiality_finalise — refuse while it is unscored, so it cannot
   * reach a finalised paper.
   */
  fully_judged: boolean
}

/** Own row first, then IROs by NAME. See the note on carrierOrder below. */
const OWN_ROW_FIRST = ''

/**
 * ⚠️ NAME ORDER, NOT SLUG ORDER, AND THE TIE-BREAK IS WHAT MAKES IT TOTAL.
 * (subtopic_code, iro_key) is stable and cheap, and it orders "Water scarcity at Valencia" against
 * "Air quality at Seville" by their slugs — invisible strings the reader never sees. In a printed
 * paper that reads as an accident, and a reader who cannot see the ordering principle assumes there
 * isn't one. Name order is self-evidently intentional on the page.
 *
 * The cost is that renaming an IRO reorders the list. That is the right trade here: the paper is
 * regenerated from current data every time, so there is no stored ordering for a rename to
 * contradict, and a name is what the reader is scanning for.
 *
 * iro_key breaks ties, so the sort is TOTAL and the tests are deterministic. In practice a tie
 * cannot arise from the database — 20260855 §3 carries a unique index on
 * (assessment_id, subtopic_code, lower(btrim(name))) — but this function is pure and can be handed
 * anything, and a comparator that returns 0 for distinct rows leaves their order to the engine.
 *
 * localeCompare is pinned to 'en' rather than left to the host: an unpinned locale makes accented
 * names sort differently on a developer's machine and in production, which is a test that passes
 * everywhere except where it matters.
 */
const carrierOrder = (a: Carrier, b: Carrier): number => {
  // ⚠️ THIS PIN IS CURRENTLY REDUNDANT AND IS NOT DEAD CODE. The own row's `name` is null, so the
  // `?? a.iro_key` fallback below compares '' — which localeCompare sorts first anyway. Removing
  // these two lines therefore changes nothing TODAY and is caught by no test, which is exactly why
  // this note exists. Give the own row a display name ("The sub-topic as a whole") and the pin
  // becomes the only thing keeping the parent above its children. Verified as an equivalent mutant
  // on 24 Aug 2026, deliberately kept.
  if (a.iro_key === OWN_ROW_FIRST) return b.iro_key === OWN_ROW_FIRST ? 0 : -1
  if (b.iro_key === OWN_ROW_FIRST) return 1
  const byName = (a.name ?? a.iro_key).localeCompare(b.name ?? b.iro_key, 'en')
  return byName !== 0 ? byName : a.iro_key.localeCompare(b.iro_key, 'en')
}

/**
 * One RolledUp per distinct subtopic_code in `subtopics`.
 *
 * ⚠️ KEYED ON subtopic_code, WHICH IS WHY THE ROADMAP CANNOT DOUBLE-PRINT A TOPIC. Three material
 * IROs under E1.3 collapse into one entry here, so every downstream count and list is per
 * sub-topic by construction rather than by a dedupe step someone can later remove.
 *
 * ⚠️ EMITS AN ENTRY EVEN WHERE THE OWN ROW IS ABSENT. 20260855 makes the iro_key = '' row
 * mandatory, but this module is pure and its caller supplies the rows. A sub-topic present only as
 * a named IRO still gets an entry, material on its children, rather than vanishing from every
 * count — an absent parent must not be able to hide a material IRO.
 */
export function rollUpDeterminations(subtopics: RegisterSubTopic[]): Map<string, RolledUp> {
  const out = new Map<string, RolledUp>()

  for (const st of subtopics) {
    /**
     * =================================================================
     * ⚠️ THE KEY IS subtopic_code ALONE. THAT IS THE DISJUNCTION.
     * =================================================================
     * Every IRO under a code collapses into ONE entry here, BEFORE materiality is decided. The
     * collapse is not a preliminary step to the roll-up — it IS the roll-up. `carriers` accumulates
     * one item per unit that was material, from every row sharing this key, and the entry's verdict
     * is `carriers.length > 0`: any material IRO makes the sub-topic material.
     *
     * ⚠️ NO SEVERITY IS INVENTED, AND NOTHING IS COMPARED AGAINST A THRESHOLD. Each unit's
     * materiality comes from computeSeverity and is READ; this loop ORs flags. There is no max, no
     * mean and no number of its own — which is what keeps computeSeverity the sole authority on
     * severity rather than one of two.
     *
     * ⚠️ A KEY IS NOT A TYPE ANNOTATION. Nothing here fails to compile if this line is widened, and
     * no signature changes. It is enforced by this expression and by the tests below and by nothing
     * else, which is why it is written down at the line itself rather than at the declaration.
     *
     * WHAT BREAKS IF THIS IS EVER WIDENED — say to `st.subtopic_code + '|' + iroKey`:
     *   1. Each IRO becomes its own entry and is judged on its own determinations alone. The
     *      sub-topic's entry reverts to its OWN row's verdict, so a sub-topic material ONLY through
     *      a named IRO is reported NOT material — in the counts, in section 6 and in section 7.
     *      The rows would all still be present and every number would look plausible.
     *   2. The per-sub-topic collapse disappears, so anything counting these entries counts one per
     *      IRO again. "Topics material" can then exceed the number of sub-topics in scope.
     *   3. buildRoadmap in boardReport.ts groups by topic and lists `driven_by` per entry, so one
     *      sub-topic's disclosure requirements would be attributed once per IRO instead of once.
     *      (That is the determination-driven roadmap, which is built on every run and not yet
     *      rendered. The screening roadmap a customer sees today is a different one, built from the
     *      scoring matrix, and is not connected to these rows at all — do not expect a change here
     *      to show up there.)
     *
     * PINNED BY, in lib/materiality/boardReport.test.ts, describe('the disjunction roll-up'):
     *   'an IRO carries a sub-topic its own row did NOT carry'
     *       — the disjunction itself. Its fixture's own row is judged IMMATERIAL in both
     *         directions, so it fails the moment the collapse stops happening.
     *   'counts SUB-TOPICS, not rows — three IROs under one sub-topic is one material topic'
     *       — the key's arity, asserted through the counts, the section 6 rows AND the roadmap's
     *         driven_by, which is (3) above.
     *   'publishes no severity of its own — the roll-up is over flags, never a max'
     *   'says WHY, on page 3 and in section 9 and at the end — never a bare material'
     *       — a collapse that decides materiality must also carry WHAT decided it.
     */
    const key = st.subtopic_code
    const iroKey = st.iro_key ?? ''
    const isOwnRow = iroKey === ''

    const carriedHere: Direction[] = []
    for (const direction of DIRECTIONS) {
      const row = submittedFor(st, direction)
      if (row === null) continue
      const result = computeSeverity({
        direction: row.direction,
        nature: row.nature,
        category: st.category,
        scale: row.scale,
        scope: row.scope,
        irremediability: row.irremediability ?? null,
        likelihood: row.likelihood ?? null,
        abstained: row.abstained_dimensions ?? null,
      })
      // ⚠️ `result.complete &&` IS THE LOAD-BEARING HALF; `=== true` IS BELT AND BRACES.
      // severity.ts returns { complete: false, material: null } together, so the guard already
      // excludes every null. Mutating `=== true` to `!== false` changes nothing and no test catches
      // it — an equivalent mutant, verified 24 Aug 2026. DELETING `result.complete &&` is caught
      // immediately, by five tests. Kept in this form because it matches the idiom at the register's
      // own gate below and states the intent where the guard only implies it.
      if (result.complete && result.material === true) carriedHere.push(direction)
    }

    const prior = out.get(key)
    const carriers = prior ? [...prior.carriers] : []
    if (carriedHere.length > 0) {
      carriers.push({ iro_key: iroKey, name: isOwnRow ? null : st.short_name, carried_by: carriedHere })
    }

    // The own row's completeness, and only the own row's. See the field comment.
    const ownFullyJudged = isOwnRow
      ? DIRECTIONS.every(d => {
        const row = submittedFor(st, d)
        if (row === null) return false
        return computeSeverity({
          direction: row.direction, nature: row.nature, category: st.category,
          scale: row.scale, scope: row.scope,
          irremediability: row.irremediability ?? null, likelihood: row.likelihood ?? null,
        }).complete
      })
      : (prior?.fully_judged ?? false)

    carriers.sort(carrierOrder)

    // Union, not concatenation: both a sub-topic and an IRO under it can carry the same direction.
    const carriedBy = DIRECTIONS.filter(d => carriers.some(c => c.carried_by.includes(d)))

    out.set(key, {
      subtopic_code: key,
      material: carriers.length > 0,
      carried_by: carriedBy,
      carriers,
      material_on_own_row: carriers.some(c => c.iro_key === OWN_ROW_FIRST),
      fully_judged: ownFullyJudged,
    })
  }

  return out
}


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
  /** Dimensions the determiner DECLINED to judge (§6.1). Empty when complete. */
  abstained: Dimension[]
  /** Dimensions nobody reached — no value, no abstention. Empty when complete. */
  unscored: Dimension[]
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
    /**
     * ⚠️ WHAT CARRIED IT, AND WHY `material` CAN BE TRUE WHILE `directions` SHOWS NEITHER.
     * `material` is the ROLLED-UP verdict — this sub-topic's own row OR any named IRO under it —
     * so section 7 and section 9 of the board report cannot state different conclusions about the
     * same sub-topic. `directions` remains this row's OWN working. A consumer that renders
     * `material` without rendering this turns a real finding into a judgement nobody made.
     */
    carriers: Carrier[]
    /** True only when this sub-topic's own determinations carried it. */
    material_on_own_row: boolean
    directions: DirectionOutcome[]
    statement: string
  }
}

export type OmittedSubTopic = {
  subtopic_code: string
  /**
   * ⚠️ CARRIED SO TWO OMITTED ROWS UNDER ONE SUB-TOPIC ARE DISTINGUISHABLE. Without it a consumer
   * keying on subtopic_code alone silently collapses a sub-topic and every IRO named under it into
   * one row — the React-key form of the same duplicate-label problem materiality_finalise_outstanding
   * solves in SQL by composing a label.
   */
  iro_key: string
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

/**
 * ⚠️ TERSE AND FACTUAL, because this is a `detail` and details are grouped verbatim by the PDF
 * (boardReportPdf.ts:793-818 keys its grouping on the sentence itself, so every custom IRO on an
 * assessment collapses into one line rather than repeating). The reader-facing PARAGRAPH is
 * NEVER_ASKED_NOTE in boardReport.ts, beside CONTRAST_UNAVAILABLE, which is where prose written for
 * a board lives. Two registers of language for two places, as the existing code already does.
 *
 * States what is true of the mechanism, not what probably happened: "added after the survey closed"
 * would be a guess about timing this module cannot check, and no timing would change the answer.
 */
export const NEVER_IN_SURVEY_SCOPE_DETAIL =
  'This was never put to anyone. A survey question names an ESRS sub-topic, so an IRO the company '
  + 'defined cannot appear in one — there is no stakeholder view to set beside the determination, '
  + 'and none was withheld.'

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

  // ⚠️ ONCE, OUTSIDE THE LOOP. Per-iteration it would be O(n²) and, worse, would tempt a future
  // edit into passing only the current row — which would silently turn the roll-up back into the
  // own-row verdict while still looking like a roll-up.
  const rolled = rollUpDeterminations(subtopics)

  for (const st of subtopics) {
    const omit = (reason: OmissionReason, detail: string | null): void => {
      omitted.push({
        subtopic_code: st.subtopic_code,
        iro_key: st.iro_key ?? '',
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
      /**
       * ⚠️ WHICH ABSENCE IT IS, NOT MERELY THAT THERE WAS ONE. Both branches produce an omission;
       * they make different statements about the customer's respondents, and only one of them can
       * be true of a given row. §6.1's rule is that absence is not a low — this is the same rule
       * one level down: an absence must be reported as the absence it actually is.
       *
       * ⚠️ THE CUSTOM-IRO TEST IS INSIDE THIS BLOCK, NOT IN FRONT OF IT, AND THAT IS DELIBERATE.
       * A custom IRO that somehow arrives WITH a usable stakeholder side falls straight through to
       * ordinary handling and is compared like anything else. Nothing can produce that today, and
       * the day something can, this code needs no edit — it will already be using the answers
       * rather than asserting there are none.
       */
      if ((st.iro_key ?? '') !== '') {
        omit('never_in_survey_scope', NEVER_IN_SURVEY_SCOPE_DETAIL)
      } else {
        omit(
          'no_substantive_answers',
          overall === null
            ? 'No survey result for this sub-topic.'
            : 'Nobody who was asked gave a rating; abstentions and skips are not a rating.',
        )
      }
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
        abstained: row.abstained_dimensions ?? null,
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
      abstained: r.result.abstained,
      unscored: r.result.unscored,
    }))

    // ⚠️ material === true, not a truthiness test: `material` is null on an incomplete direction.
    // ownCarriedBy is THIS ROW's, and is what the asymmetric gate below reasons about.
    const ownCarriedBy = directions.filter(d => d.material === true).map(d => d.direction)

    /**
     * ⚠️ THE ROLLED-UP VERDICT, READ AND NOT RECOMPUTED. rollUpDeterminations is the one authority
     * on whether a sub-topic is material once named IROs are counted, and boardReport.ts reads the
     * same map for its counts, its section 6 rows and its roadmap. If this line went back to
     * ownCarriedBy, section 7 would call a sub-topic not material while section 9 called it
     * material — one paper, two verdicts, on the same rows.
     *
     * The fallback exists for the sub-topic's own absence from the map, which cannot happen for a
     * row that is IN the map's input; it keeps the expression total rather than asserting.
     */
    const rolledHere = rolled.get(st.subtopic_code)
    const carriedBy = rolledHere?.carried_by ?? ownCarriedBy
    const assessmentMaterial = rolledHere?.material ?? ownCarriedBy.length > 0

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
            // ⚠️ THE TWO CAUSES READ DIFFERENTLY BECAUSE THEY ARE DIFFERENT FINDINGS. This said
            // "not scored" for both — accurate for a dimension nobody reached, false for one the
            // determiner declined, because an abstention IS a recorded answer under §6.1. Same
            // error the board report made, in the other document; the two move together or they
            // describe one determination two ways.
            .map(r => {
              const parts: string[] = []
              if (r.result.abstained.length > 0) {
                parts.push(`${r.result.abstained.join(', ')} recorded as not enough visibility`)
              }
              if (r.result.unscored.length > 0) {
                parts.push(`${r.result.unscored.join(', ')} not scored`)
              }
              return `${r.row.direction}: ${parts.join('; ')}`
            })
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
        carriers: rolledHere?.carriers ?? [],
        material_on_own_row: rolledHere?.material_on_own_row ?? assessmentMaterial,
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
