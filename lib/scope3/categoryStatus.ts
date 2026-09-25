// ── WHAT A SCOPE 3 CATEGORY'S STATUS IS, COMPOSED FROM TWO FACTS ────────────────────────────────
//
// ONE place that turns (relevant, calculated) into a status, its label and what follows from it. Read by
// the Scope 3 calculator, its CSV, and — when Scope 3 reaches the trend series — by whatever describes a
// stored total. It replaced a single boolean, `included`, which had to mean four different things at once.
//
// ⚠️ TWO COMPONENTS, NOT ONE, BECAUSE CDP ASKS TWO QUESTIONS. Its Scope 3 evaluation status is a pair:
// whether the category is RELEVANT to the company, and whether it has been CALCULATED. A boolean forced
// them together, so a category the customer had not reached yet, one they judged irrelevant, and one they
// meant to calculate but had not, were all a single `false` — and the export said "not material" about
// all three.
//
// ⚠️ relevant IS THREE-VALUED. null is NOT YET ANSWERED, and it is not the same as "no". A fresh inventory
// has fifteen unanswered categories, and reporting them as "not relevant" would put a judgement in the
// customer's mouth that they have not made. Only an answered `false` carries an exclusion, and only an
// exclusion needs a reason.
//
// ⚠️ NOT RELEVANT + CALCULATED IS A REAL STATE, AND THE INTERESTING ONE. A customer who calculated a
// category, found it immaterial, and excludes it on that basis has BOTH a figure and an exclusion. The
// figure is what justifies the exclusion, so it is reported; it is NOT in the total, because the total is
// what the company claims as its inventory. inTotal and reportFigure are separate for exactly this case.
//
// CALCULATED IS DERIVED, NEVER STORED. It is a property of the data and the pricing, and storing it would
// let a record say "calculated" about inputs that had since been emptied. The calculator derives it per
// category (see cat5Priced, cat1SpendPriced and the input tests in app/dashboard/scope3/page.tsx) and
// passes it in.

export type Relevance = boolean | null

export type Scope3StatusKey =
  | 'relevant_calculated'
  | 'relevant_not_calculated'
  | 'not_relevant_calculated'
  | 'not_relevant_not_calculated'
  | 'not_evaluated'

export interface Scope3Status {
  key: Scope3StatusKey
  /** For a customer and for the export. CDP's own phrasing where it has one. */
  label: string
  relevant: Relevance
  calculated: boolean
  /** Only a relevant, calculated category is part of the inventory total. */
  inTotal: boolean
  /** A figure exists and is reported — including for an excluded category, where it is the evidence. */
  reportFigure: boolean
  /** An answered exclusion has to say why. Nothing else does. */
  requiresExplanation: boolean
}

const LABELS: Record<Scope3StatusKey, string> = {
  relevant_calculated: 'Relevant, calculated',
  relevant_not_calculated: 'Relevant, not yet calculated',
  not_relevant_calculated: 'Not relevant, calculated',
  not_relevant_not_calculated: 'Not relevant, not calculated',
  not_evaluated: 'Not evaluated',
}

/**
 * The status of one category.
 *
 * ⚠️ AN UNANSWERED CATEGORY IS "NOT EVALUATED" EVEN WITH A FIGURE. Data entered before the relevance
 * question is answered does not answer it, and calling that pair "relevant, calculated" would infer a
 * judgement from an input. `calculated` is still carried, so a surface can show the figure and still say
 * the question is open.
 */
export function scope3Status(relevant: Relevance, calculated: boolean): Scope3Status {
  const key: Scope3StatusKey =
    relevant === null ? 'not_evaluated'
      : relevant ? (calculated ? 'relevant_calculated' : 'relevant_not_calculated')
      : (calculated ? 'not_relevant_calculated' : 'not_relevant_not_calculated')
  return {
    key,
    label: LABELS[key],
    relevant,
    calculated,
    inTotal: key === 'relevant_calculated',
    reportFigure: calculated,
    requiresExplanation: relevant === false,
  }
}

/** The label alone, for a surface that holds no status object. */
export const scope3StatusLabel = (relevant: Relevance, calculated: boolean): string =>
  scope3Status(relevant, calculated).label

/**
 * The relevance a stored category record carries.
 *
 * ⚠️ READS THE RETIRED `included` BOOLEAN. Every cat_data saved before 17 Sep 2026 has `included` and no
 * `relevant`. `included: true` was an answered yes, so it maps to true. `included: false` maps to FALSE
 * rather than null, because the pre-existing record cannot tell a deselected category from one the
 * customer never reached — and the page's own excluded box has always reported that state as an
 * exclusion. It is therefore migrated as the exclusion it was displayed as, and the missing reason is
 * what the customer is asked for. A record with neither field is `null`: not evaluated.
 */
export function relevanceFromStored(stored: { relevant?: Relevance; included?: boolean } | undefined): Relevance {
  if (!stored) return null
  if (stored.relevant !== undefined) return stored.relevant
  if (typeof stored.included === 'boolean') return stored.included
  return null
}

// ── THE STORED COVERAGE ENTRY ───────────────────────────────────────────────────────────────────
//
// One per category in scope3_inventories.scope3_coverage, written at save time and read by whatever
// describes a stored total (lib/ghg/series.ts next).
//
// ⚠️ "UNPRICED" IS A PROPERTY OF THE ENTRY, NOT A SIXTH STATUS. CDP asks two questions — is it relevant,
// was it calculated — and a category the platform could not price answers the second one "no", exactly as
// a category nobody has filled in does. It is still "Relevant, not yet calculated" to CDP, and making it a
// status key would mean every export had to map it back to that label, which is a vocabulary that has to
// be translated at its only boundary — the sign that it was the wrong vocabulary. The CAUSE of the "no"
// belongs on the entry, where a consumer can branch on it without the label changing.
//
// WHY BOTH A BOOLEAN AND A SENTENCE. series.ts needs something it can branch on across years without
// parsing prose; a person reading the record needs the observed reason, which differs per cause (no active
// factor edition, no factor for the sector, a failed request). `reason` is the wizard's own sentence for
// that category, verbatim, never a rewording.

export interface Scope3CoverageEntry {
  status: Scope3StatusKey
  /** null where nothing was calculated — never 0, which would claim the category emits nothing. */
  mt: number | null
  in_total: boolean
  /**
   * The customer supplied what the method needs and the platform still produced no figure. FALSE for a
   * category simply not filled in yet: that is the customer's turn, not a failure to price.
   */
  unpriced: boolean
  /** Verbatim, and only when unpriced — otherwise the absence of a figure explains itself. */
  reason: string | null
  /**
   * The method's own data-quality score for this figure, where the method has one. PCAF's 1-to-5 scale for
   * Category 15 today: 1 is an investee's verified reported emissions, 5 a spend proxy. Fractional, because
   * a portfolio's score is weighted by each holding's emissions.
   *
   * ⚠️ PRESENT ONLY WHERE A METHOD PRODUCES ONE, rather than null on the other fourteen categories. A
   * scale is not shared across methods: a 2 on PCAF's scale says "reported to us, not assured", and there
   * is no sense in which an EXIOBASE spend estimate or a DEFRA waste factor is a 2 or a 5 on it. A key
   * that appears only beside a figure it describes cannot be read as a comparable number across
   * categories, which a column of nulls and PCAF scores invites. The omission is the type's way of saying
   * the question does not apply.
   *
   * ⚠️ AND IT IS NOT A CONFIDENCE LABEL. The page's own high/medium/low pill is ThemisIQ's, and it is
   * derived. This is the score the METHOD defines, carried verbatim into the record so a CDP or verifier
   * submission quotes PCAF's number rather than ours.
   */
  dq?: number
  /**
   * The customer's own justification for an answered exclusion, verbatim.
   *
   * ⚠️ THEIR WORDS, NOT OURS, AND THAT IS WHY IT IS NOT `reason`. `reason` is the PLATFORM's sentence for
   * why it produced no figure. This is the CUSTOMER's sentence for why they judged a category irrelevant.
   * Putting both in one field would make it mean two or three different things depending on `status` and
   * `unpriced`, and would mix our prose with theirs in a string a verifier reads as the company's own. The
   * platform already did that once: data_quality on a Category 1 line substitutes 'Supplier-reported
   * (basis unspecified)' into the field that otherwise holds the supplier's own words, and that ambiguity
   * is now frozen into every snapshot. The assurance work split it the other way and this follows that:
   * supplier_assurance_raw is theirs and null when absent, `assurance` is ours and a closed set.
   *
   * ⚠️ NULL WHEN BLANK. NEVER A FALLBACK STRING. 'No justification recorded' is OUR sentence; it belongs
   * at the render, which is where the CSV already puts it. A field that holds either the customer's words
   * or ours, with nothing to tell them apart, is the defect above.
   *
   * ⚠️ PRESENT ONLY FOR AN ANSWERED EXCLUSION, following `dq`'s precedent rather than emitting null on the
   * other fourteen. The three states are then readable from the entry alone:
   *   key absent          the category is not an exclusion, so the question does not apply
   *   key present, null   an exclusion with no justification recorded
   *   key present, prose  the justification, as the customer wrote it
   *
   * ⚠️ REQUIRED BY GHG PROTOCOL CHAPTER 11.1, which obliges a report to list the categories excluded WITH
   * justification of their exclusion. Until 25 Sep 2026 get_verifier_scope3 disclosed the exclusions and
   * the COUNT of unjustified ones (scope3_exclusions_unjustified) and not one justification, justified or
   * not: a verifier could see that two exclusions lacked a reason and could not read the reasons that
   * existed, nor tell which two the count meant.
   *
   * NULLABLE AT WRITE, NAMED AT THE REPORT. Nothing validates this at capture and nothing should: a
   * NOT NULL on customer prose produces a full stop, and a justification written because a form refused
   * without one looks like a justification and is read as one. unjustifiedExclusions names the gap on the
   * export step, the CSV prints 'No justification recorded', and the count is stored.
   */
  excluded_reason?: string | null
}

/**
 * Build a coverage entry, with the invariants enforced rather than trusted:
 *   1. a CALCULATED category cannot be unpriced, because it has a figure;
 *   2. `reason` belongs only to an unpriced entry;
 *   3. `dq` describes a figure, so it cannot outlive one;
 *   4. an exclusion justification cannot ride on a category that is not an answered exclusion.
 */
export function coverageEntry(
  status: Scope3Status,
  opts: {
    mt: number | null; unpriced: boolean; reason: string | null; dq?: number | null
    /** The customer's `excluded_reason` as stored, however blank. Trimmed and nulled here, once. */
    excludedReason?: string | null
  },
): Scope3CoverageEntry {
  const unpriced = opts.unpriced && !status.calculated
  const entry: Scope3CoverageEntry = {
    status: status.key,
    mt: status.calculated ? opts.mt : null,
    in_total: status.inTotal && !unpriced,
    unpriced,
    reason: unpriced ? opts.reason : null,
  }
  // ⚠️ A THIRD INVARIANT: a data-quality score describes a figure, so it cannot outlive one. A dq on an
  // entry with mt null would claim a quality for something that was never calculated.
  if (entry.mt !== null && opts.dq != null) entry.dq = opts.dq
  // ⚠️ THE FOURTH INVARIANT. requiresExplanation is `relevant === false`, so the key appears for an
  // ANSWERED exclusion and for nothing else. A justification on a relevant category, or on one nobody has
  // answered, would attribute a judgement to the customer that they have not made — the same error
  // scope3Status exists to prevent by refusing to read a figure as a relevance answer.
  //   Trimmed to null here rather than at the call site, so every writer of a coverage entry gets the same
  // answer about what counts as blank. Whitespace is not a justification.
  if (status.requiresExplanation) {
    const written = (opts.excludedReason ?? '').trim()
    entry.excluded_reason = written === '' ? null : written
  }
  return entry
}
