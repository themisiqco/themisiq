// lib/ghg/comparability.ts
// Year-over-year comparability disclosure.
//
// STANDARDS BASIS — ISO 14064-3:2019 clause 6.3.1.5. The verifier must determine whether changes
// from prior periods that make the periods incomparable have been disclosed by the reporting
// organisation. The obligation sits on the VERIFIER; the platform's job is to make that
// determination possible — so the disclosure has to exist, travel with the figures, and carry
// enough context for the verifier to weigh it. Scoped in docs/item-3-comparability-disclosure.md.
//
// Pure module: no React, no Supabase, no I/O. It takes figures and summaries in and returns words
// and a basis out. The only import is the shared word maps in ./series, so the same country and the
// same fuel are never named two different ways on two different surfaces.
//
// ── The two tiers, and why they are independent ─────────────────────────────────────────────────
//
// The question is ALWAYS asked in the same shape. What varies is the strength of the observation
// placed in front of it — recorded in `basis`, so a verifier can tell "the customer confirmed
// nothing changed" from "nobody put an observation in front of them".
//
//   Tier A — MAGNITUDE. Prior-year Scope 1 / Scope 2 totals against this year's. Available whenever
//            prior totals exist at all, including a customer who did last year in a spreadsheet and
//            typed the numbers in. SUPPRESSED on 'unverifiable': a percentage measured against a
//            total of unknown composition is a confident-looking number that means nothing, which
//            is the same reason SBTi refuses an unknown year as a baseline.
//
//   Tier B — STRUCTURAL. Location count, fuels present, jurisdictions, organisational boundary.
//            Requires a STORED prior inventory, so it is UNAVAILABLE on 'not_stored'.
//
// THE TIERS DO NOT GATE EACH OTHER. An unverifiable prior total makes the magnitude comparison
// meaningless; it does not make locations uncountable. Gating the whole question on year validity —
// or letting one suppression cascade into the other — is the regression this file is written to
// prevent, and comparability.test.ts asserts it directly.
//
// ── Copy ────────────────────────────────────────────────────────────────────────────────────────
//
// The magnitude and location sentences are the doc's own wording. Two deliberate departures, both
// forced by structure rather than taste:
//
//   • The doc writes Tier B as "...and your inventory went from 4 locations to 6", a continuation
//     of the Tier A sentence. It cannot be one here: on 'unverifiable', Tier B renders with no
//     Tier A in front of it, and a line opening with "and" would be broken. Each observation is a
//     standalone sentence; the caller joins them and asks `question` once at the end.
//   • `question` is returned separately rather than tacked onto the Scope 1 line, so it is asked
//     once no matter how many observations precede it.
//
// `question` is the QUESTION — "Has anything changed that would make these two years hard to
// compare?" — and not the free-text field's label. It carried "What changed?" for a while, which
// presupposed a change and left the first option answering a premise the question had already
// asserted. The label lives at the render site, on the field the second option reveals.
//
// Plain language throughout — no table names, no column names, no enum values. And per the doc, do
// NOT ask whether the base year needs recalculating: the platform cannot act on that answer today,
// and asking a question you cannot act on is worse than not asking. Ask what changed.

import { COUNTRY_WORDS, FUEL_WORDS } from './series'

/**
 * The prior year's state, as the series layer already classifies it (see YearDataStatus in
 * ./series, plus the case that has no stored inventory at all).
 *
 * 'clean'        — a stored prior inventory whose totals are complete.
 * 'excluded'     — a stored prior inventory whose workings RECORD what was left out. The total is
 *                  real but partial, and Tier A must say so.
 * 'unverifiable' — a stored prior inventory whose composition cannot be established. We do not know
 *                  whether anything is missing. Tier A is suppressed; Tier B is not.
 * 'not_stored'   — no prior inventory on the platform; the totals were typed in by the customer.
 *                  Tier B is unavailable; Tier A runs, with its limits stated.
 */
export type PriorYearState = 'clean' | 'excluded' | 'unverifiable' | 'not_stored'

/** The structural facts Tier B compares. Absent for the prior year when it is 'not_stored'. */
export interface InventorySummary {
  locationCount: number
  /** Engine fuel tokens (e.g. 'natural_gas'); turned into words before they reach copy. */
  fuelTypes: readonly string[]
  /** ISO country codes (e.g. 'US', 'GB'); turned into words before they reach copy. */
  jurisdictions: readonly string[]
  /**
   * The stored consolidation approach — `ghg_inventories.boundary_approach`.
   *
   * Typed to match what is actually held: a free string, nullable. NOTHING constrains this column
   * to the three GHG Protocol values — the engine types it `string`, the verifier page and the
   * assurance PDF type it `string`, and the wizard's `<select>` is the only gate on what gets
   * written. So an unrecognised value is reachable, and `boundaryWord` below refuses it rather
   * than passing it through.
   */
  boundaryApproach: string | null
}

export interface ComparabilityInput {
  /** Prior-year totals, tCO₂e. Either may be absent — a customer may hold one scope and not the other. */
  priorScope1: number | null
  priorScope2: number | null
  /** This year's totals, tCO₂e. */
  thisScope1: number
  thisScope2: number
  priorYearState: PriorYearState
  /** The prior year's structure. Null when 'not_stored' — there is no stored inventory to describe. */
  priorSummary: InventorySummary | null
  thisSummary: InventorySummary
}

export type ObservationKind =
  | 'magnitude_scope1'
  | 'magnitude_scope2'
  | 'exclusion'
  | 'locations'
  | 'fuels'
  | 'jurisdictions'
  | 'boundary'
  | 'structure_unchanged'

export interface ComparabilityObservation {
  kind: ObservationKind
  tier: 'A' | 'B'
  /** One complete sentence, as stated to the customer. */
  text: string
}

/**
 * Which tier applied, and why the weaker one applied if it did.
 *
 * `statement` is the sentence the workings row carries so the comparison's own limits travel with
 * it. That is a disclosure of the limits of the disclosure — and on a typed-in prior year it is the
 * whole point: the verifier has to be able to see that the prior period is not held on the platform
 * and the comparison rests on figures the customer supplied.
 */
export interface ComparabilityBasis {
  priorYearState: PriorYearState
  tierA: boolean
  tierB: boolean
  /** Why the magnitude comparison was withheld. Null when it ran. */
  tierAWithheldBecause: string | null
  /** Why the structural comparison was withheld. Null when it ran. */
  tierBWithheldBecause: string | null
  /**
   * Why the organisational boundary could not be compared. Null when it WAS compared — whether or
   * not it moved.
   *
   * Separate from the observation list because a boundary that could not be read produces no line,
   * and so does a boundary that matched. On screen those look identical; to a verifier they are
   * opposite facts. One says the frame the figures sit inside was checked against last year's; the
   * other says nobody could tell. Without this field the verifier cannot distinguish them, which is
   * the same failure the tier basis exists to prevent one level up.
   *
   * Never carries the unreadable value itself. A boundary token we do not recognise is exactly the
   * thing that must not reach a verifier as though it were a boundary.
   */
  boundaryWithheldBecause: string | null
  statement: string
}

export interface ComparabilityDisclosure {
  /** In display order: magnitude, then any exclusion caveat, then structural. */
  observations: ComparabilityObservation[]
  /** Asked once, after every observation. */
  question: string
  basis: ComparabilityBasis
}

// ── Words ───────────────────────────────────────────────────────────────────────────────────────

/** Matches the doc's "1,240" / "2,910". One decimal is kept so a real 0.4 tCO₂e is not printed "0". */
const fmtTonnes = (v: number): string => v.toLocaleString('en-US', { maximumFractionDigits: 1 })

/**
 * The movement clause, or null when a percentage would be a fiction.
 *
 * Three branches near zero, deliberately distinct — collapsing any two of them makes the sentence
 * say something the figures do not support:
 *
 *   IDENTICAL   — "the same figure both years". A statement about the two NUMBERS, not about the
 *                 business. "No change" would answer the question this disclosure is about to ask:
 *                 an acquisition offset by a closure, a boundary redraw, a methodology change and
 *                 an unremarkable year all produce the same total, and only the customer knows
 *                 which one happened. The observation reports the arithmetic; `question` still
 *                 asks what changed.
 *   ROUNDS TO 0 — "an increase of less than 1%". The figures DIFFER. Reporting that as identical,
 *                 or as "0%", is false however small the gap. Direction is carried through, so a
 *                 small fall reads "a decrease of less than 1%".
 *   PRIOR ZERO  — null. There is no percentage from nothing — not 100%, not 1000%, not any
 *                 number — so the sentence states both figures and stops.
 */
const movementClause = (prior: number, current: number): string | null => {
  if (prior === current) return 'the same figure both years'
  if (!(prior > 0)) return null
  const pct = ((current - prior) / prior) * 100
  const direction = pct > 0 ? 'an increase' : 'a decrease'
  const rounded = Math.round(Math.abs(pct))
  return rounded === 0 ? `${direction} of less than 1%` : `${direction} of ${rounded}%`
}

// Both figures carry the unit. A bare second number invites reading it as something other than
// tonnes — a percentage, an index — next to a first that is explicitly labelled.
const magnitudeText = (scope: 1 | 2, prior: number, current: number): string => {
  const head = `You reported ${fmtTonnes(prior)} tCO₂e in Scope ${scope} last year and ${fmtTonnes(current)} tCO₂e this year`
  const clause = movementClause(prior, current)
  return clause ? `${head} — ${clause}.` : `${head}.`
}

const fuelWord = (f: string): string => FUEL_WORDS[f] ?? f.replace(/_/g, ' ')
const countryWord = (c: string): string =>
  COUNTRY_WORDS[c.toUpperCase()] ?? (c === '(unset)' ? 'no country' : c)

/**
 * The three consolidation approaches, in the words a customer would say them.
 *
 * Lower case because these appear mid-sentence; the wizard's `<select>`, the verifier page and the
 * assurance PDF each title-case them for their own headings, and those maps are deliberately left
 * alone here.
 *
 * NO RAW FALLBACK, and no case or whitespace normalising. Every other word map in this file falls
 * back to a tidied version of the token, because a fuel or a country outside the map is still a
 * real thing with a name. A boundary value outside these three is not: the column is an
 * unconstrained string, so an unexpected value means we do not know what the customer chose — and
 * a boundary is the frame every figure in the inventory is measured inside. `boundaryWord` returns
 * null for anything it does not recognise, and the caller then emits NOTHING rather than showing a
 * verifier a boundary change it cannot describe.
 */
const BOUNDARY_WORDS: Record<string, string> = {
  operational_control: 'operational control',
  financial_control: 'financial control',
  equity_share: 'equity share',
}

const boundaryWord = (b: string | null | undefined): string | null =>
  (b && BOUNDARY_WORDS[b]) || null

const listWords = (xs: string[]): string =>
  xs.length <= 1 ? xs[0] ?? ''
  : xs.length === 2 ? `${xs[0]} and ${xs[1]}`
  : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

/** Set difference in words, sorted so the same inputs always read the same way. */
const diffWords = (
  prior: readonly string[],
  current: readonly string[],
  toWord: (s: string) => string,
): { added: string[]; removed: string[] } => {
  const p = new Set(prior.map(toWord))
  const c = new Set(current.map(toWord))
  return {
    added: [...c].filter(w => !p.has(w)).sort(),
    removed: [...p].filter(w => !c.has(w)).sort(),
  }
}

// ── Withheld reasons ────────────────────────────────────────────────────────────────────────────

const NO_PRIOR_FIGURES =
  'No Scope 1 or Scope 2 total was recorded for last year, so there is nothing to measure ' +
  "this year's figures against."

const UNVERIFIABLE_PRIOR =
  "Last year's total could not be shown to be complete, so a movement measured against it would " +
  'not mean anything.'

const NOT_STORED_PRIOR =
  "Last year's inventory isn't held on the platform, so its locations, fuels and jurisdictions " +
  "could not be compared with this year's."

const BOUNDARY_NOT_STORED =
  "Last year's organisational boundary could not be compared: last year's inventory isn't held on " +
  'the platform, so there is no boundary on record to compare this year against.'

const BOUNDARY_UNRECOGNISED =
  'The organisational boundary could not be compared: at least one of the two years holds a ' +
  'boundary that is not operational control, financial control or equity share, so there is no ' +
  'basis for saying whether it moved.'

// ── The disclosure ──────────────────────────────────────────────────────────────────────────────

/**
 * Build the comparability observation and its basis, or null when there is no prior year at all.
 *
 * Null means exactly one thing: no prior year exists — no totals were supplied AND no prior
 * inventory is stored. On a first inventory the question is noise. Null is NOT how a weak or
 * suppressed observation is reported; that is what `basis` is for. A disclosure with an empty
 * `observations` array is a real and meaningful return — it says the question was asked with
 * nothing placed in front of it, and records why.
 */
export function buildComparabilityDisclosure(
  input: ComparabilityInput,
): ComparabilityDisclosure | null {
  const { priorScope1, priorScope2, thisScope1, thisScope2, priorYearState, priorSummary, thisSummary } = input

  const hasPriorFigure = priorScope1 !== null || priorScope2 !== null
  const hasPriorInventory = priorSummary !== null
  if (!hasPriorFigure && !hasPriorInventory) return null

  // ── Tier A — magnitude ────────────────────────────────────────────────────────────────────────
  const tierASuppressed = priorYearState === 'unverifiable'
  const tierA = !tierASuppressed && hasPriorFigure
  const tierAWithheldBecause = tierA ? null : tierASuppressed ? UNVERIFIABLE_PRIOR : NO_PRIOR_FIGURES

  const observations: ComparabilityObservation[] = []

  if (tierA) {
    if (priorScope1 !== null) {
      observations.push({
        kind: 'magnitude_scope1',
        tier: 'A',
        text: magnitudeText(1, priorScope1, thisScope1),
      })
    }
    // A Scope 2 line ONLY when a prior Scope 2 figure exists. Never inferred, never defaulted to
    // zero: "you reported 0 tCO₂e in Scope 2 last year" is a claim about the prior year, and a
    // customer who supplied only a Scope 1 total made no such claim.
    if (priorScope2 !== null) {
      observations.push({
        kind: 'magnitude_scope2',
        tier: 'A',
        text: magnitudeText(2, priorScope2, thisScope2),
      })
    }
    // The exclusion is stated NEXT TO the movement it qualifies, not filed away in the basis. A
    // percentage against a partial total, printed without this sentence, overstates the movement
    // and reads as clean.
    if (priorYearState === 'excluded' && observations.length > 0) {
      observations.push({
        kind: 'exclusion',
        tier: 'A',
        text:
          "Last year's total is recorded as leaving out one or more locations, so that movement " +
          'is measured against a partial figure.',
      })
    }
  }

  // ── Tier B — structural ───────────────────────────────────────────────────────────────────────
  const tierB = hasPriorInventory
  const tierBWithheldBecause = tierB ? null : NOT_STORED_PRIOR

  // Defaults to withheld and is cleared only where the comparison actually happened. The other
  // direction — assume compared, set on failure — would report an unreached branch as a completed
  // check, which is the one answer this field must never give.
  let boundaryWithheldBecause: string | null = BOUNDARY_NOT_STORED

  if (priorSummary) {
    const before = observations.length

    // TENSE SPLIT IS DELIBERATE: last year is settled, this year is current. "Went from 4 to 6"
    // reads as a change narrative — it asserts a movement and, in doing so, pre-answers the very
    // question about to be asked. Stating each year in its own tense reports two counts and leaves
    // the question open, which is the whole point of putting an observation in front of it.
    if (priorSummary.locationCount !== thisSummary.locationCount) {
      const n = priorSummary.locationCount
      observations.push({
        kind: 'locations',
        tier: 'B',
        text: `Your inventory covered ${n} location${n === 1 ? '' : 's'} last year and covers ${thisSummary.locationCount} this year.`,
      })
    }

    const fuels = diffWords(priorSummary.fuelTypes, thisSummary.fuelTypes, fuelWord)
    if (fuels.added.length || fuels.removed.length) {
      observations.push({
        kind: 'fuels',
        tier: 'B',
        text:
          fuels.added.length && fuels.removed.length
            ? `Your inventory now includes ${listWords(fuels.added)}, and no longer includes ${listWords(fuels.removed)}.`
            : fuels.added.length
              ? `Your inventory now includes ${listWords(fuels.added)}, which wasn't in last year's.`
              : `Last year's inventory included ${listWords(fuels.removed)}; this year's doesn't.`,
      })
    }

    const places = diffWords(priorSummary.jurisdictions, thisSummary.jurisdictions, countryWord)
    if (places.added.length || places.removed.length) {
      observations.push({
        kind: 'jurisdictions',
        tier: 'B',
        text:
          places.added.length && places.removed.length
            ? `Your inventory now covers ${listWords(places.added)}, and no longer covers ${listWords(places.removed)}.`
            : places.added.length
              ? `Your inventory now covers ${listWords(places.added)}, which wasn't in last year's.`
              : `Last year's inventory covered ${listWords(places.removed)}; this year's doesn't.`,
      })
    }

    // "We looked and nothing moved" is an observation. Silence is not — it is indistinguishable
    // from never having compared, which is precisely the distinction this disclosure exists to give
    // the verifier.
    //
    // It names ONLY the three things it compared, and boundary is deliberately outside the count
    // above so it cannot be swept into this sentence. A boundary change alone still leaves this
    // line true, and the boundary line below states the change in its own words.
    if (observations.length === before) {
      observations.push({
        kind: 'structure_unchanged',
        tier: 'B',
        text: "Your locations, fuels and jurisdictions are the same as last year's.",
      })
    }

    // ── Boundary ──────────────────────────────────────────────────────────────────────────────
    // Emitted ONLY when both years hold a recognised value AND those values differ.
    //
    // No "boundary unchanged" line, on purpose, and it is not the same judgement as the line above.
    // The field defaults to operational control and is never required, so two matching values may
    // mean the customer chose the same approach twice — or may mean nobody touched the selector in
    // either year. Those are not the same fact, and this module cannot tell them apart. Silence
    // claims neither; a "your boundary is unchanged" line would claim the first.
    // Whether it could be compared is recorded on the basis EITHER WAY. Emitting no line covers two
    // opposite facts — the boundaries matched, or one of them could not be read — and only the
    // basis can tell a verifier which one happened.
    const priorBoundary = boundaryWord(priorSummary.boundaryApproach)
    const thisBoundary = boundaryWord(thisSummary.boundaryApproach)
    boundaryWithheldBecause = priorBoundary && thisBoundary ? null : BOUNDARY_UNRECOGNISED

    if (priorBoundary && thisBoundary && priorBoundary !== thisBoundary) {
      observations.push({
        kind: 'boundary',
        tier: 'B',
        text: `Your organisational boundary went from ${priorBoundary} to ${thisBoundary}.`,
      })
    }
  }

  return {
    observations,
    // THE QUESTION, not the free-text field's label. "What changed?" presupposes a change, which
    // makes "Nothing changed" read as an answer denying the premise of the question it answers —
    // and a forced choice whose first option contradicts the question is not a forced choice.
    // "What changed?" belongs where the doc puts it: on the field revealed by "Something changed".
    question: 'Has anything changed that would make these two years hard to compare?',
    basis: {
      priorYearState,
      tierA,
      tierB,
      tierAWithheldBecause,
      tierBWithheldBecause,
      boundaryWithheldBecause,
      statement: basisStatement(priorYearState, tierA, tierB, tierAWithheldBecause, tierBWithheldBecause),
    },
  }
}

/**
 * One plain-language sentence (or two) for the workings row, saying what the comparison rests on.
 *
 * The 'not_stored' wording is the requirement the doc is most explicit about: the row must say that
 * the prior period isn't held on the platform and the comparison rests on figures the customer
 * supplied. It is stated ONLY when it is true — asserting it on a stored prior year would be a
 * false limitation, and a false statement to a verifier is not made safe by being conservative.
 */
function basisStatement(
  state: PriorYearState,
  tierA: boolean,
  tierB: boolean,
  aWithheld: string | null,
  bWithheld: string | null,
): string {
  const stored = "Last year's figures and inventory are both held on the platform, and the " +
    'comparison was made against them.'
  const typedIn =
    "Last year's inventory isn't held on the platform. This comparison rests on the totals you " +
    'supplied for last year, and no comparison of locations, fuels or jurisdictions was possible.'

  if (tierA && tierB) {
    return state === 'excluded'
      ? stored + " Last year's total is recorded as leaving out one or more locations, so the " +
        'movement is measured against a partial figure.'
      : stored
  }
  if (tierA && !tierB) return typedIn
  if (!tierA && tierB) {
    return (
      `${aWithheld} No movement is stated. The comparison of locations, fuels and jurisdictions ` +
      'does not depend on that total and was made in full.'
    )
  }
  return `No observation could be put in front of this question. ${aWithheld ?? ''} ${bWithheld ?? ''}`.trim()
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PERSISTENCE — what gets stored in ghg_inventories.comparability_disclosure
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// CAPTURE AT ANSWER TIME, DETECT DRIFT AT SAVE. The two are separate moments and the record keeps
// them separate.
//
// The customer answers a question put in front of them at a particular moment, against a particular
// observation. Then they keep working — add a location, correct a figure, change the boundary — and
// by save time the observation the module would produce is not the one they answered. Recomputing
// and storing THAT would attribute to the customer an answer to a question nobody asked them.
//
// So the answered observation is captured verbatim when they answer and is never rewritten. At save
// the disclosure is recomputed and compared; a difference is recorded as a fact, alongside the
// original, not in place of it. A verifier can then see both what was asked and that the ground
// moved afterwards — which is more informative than either alone, and is not something the customer
// has to be re-interrogated about.

export type ComparabilityAnswer = 'nothing_changed' | 'something_changed'

/**
 * Taken the moment the customer picks an option — the immutable part of the record.
 *
 * The free text is NOT here: it is typed after the radio is chosen and keeps changing until save,
 * so it is collected at save time. Everything in this interface is fixed at the instant of the
 * answer and must never be recomputed.
 */
export interface ComparabilityCapture {
  /** The lines exactly as rendered to the customer, in the order shown. */
  observations: string[]
  question: string
  answer: ComparabilityAnswer
  /** The basis as it stood when they answered — the tier evidence behind what they were shown. */
  basis: ComparabilityBasis
  /** ISO timestamp of the answer. */
  answeredAt: string
}

/** The stored object. jsonb in `ghg_inventories.comparability_disclosure`. */
export interface ComparabilityRecord {
  /** WHAT THE CUSTOMER SAW. Never overwritten, never recomputed. */
  observations: string[]
  question: string
  answer: ComparabilityAnswer
  /**
   * The free text as typed, verbatim and untrimmed. THREE DISTINCT VALUES, all meaningful:
   *   null — the answer was 'nothing_changed'; the field was never shown, so there is nothing to
   *          have left blank.
   *   ''   — the field WAS shown and the customer left it empty. A real answer, and stored as one.
   *   text — detail was given.
   */
  note: string | null
  /**
   * Whether the free text carries actual detail (non-whitespace). Stated as a fact rather than left
   * to be re-derived, because `note ?? ''` downstream would silently merge the null and empty cases
   * — the exact distinction the export gates will need. NOT a gate itself.
   */
  detailProvided: boolean
  basis: ComparabilityBasis
  answeredAt: string
  /** ISO timestamp of the save at which drift was checked. Always present: the check always runs. */
  checkedAt: string
  /**
   * Whether the recomputed observation differs from the one answered. ALWAYS present, so that
   * absence never has to be read as "unchanged" — an inference this whole feature exists to remove.
   */
  observationsChanged: boolean
  /**
   * The recomputed lines, present ONLY when they differ. Alongside the originals, never replacing
   * them. Absent when `observationsChanged` is false, which says so explicitly.
   */
  observationsAtSave?: string[]
}

/** The rendered lines of a disclosure, in order — what a customer actually read. */
export const observationLines = (d: ComparabilityDisclosure): string[] =>
  d.observations.map(o => o.text)

const sameLines = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((line, i) => line === b[i])

/**
 * Build the record to store, or null to write nothing.
 *
 * TWO REFUSALS, both returning null so the column stays as it is:
 *
 *   priorYearLookupFailed — the prior-year query errored, so whether a prior year exists is
 *     unknown. The disclosure nonetheless carries 'not_stored', because PriorYearState has no
 *     value for "we could not look" — making a basis built on a failed lookup BYTE-IDENTICAL to
 *     one built on a genuine absence. Persisting it would put a claim on the record that no one
 *     could later tell apart from a true one. Refused before anything else is considered.
 *
 *   no capture — the question was never answered. NULL is the column's way of saying exactly that,
 *     and an empty shell with a timestamp would say instead that someone answered and had nothing
 *     to add. Those are the two states this disclosure exists to separate.
 *
 * Note the asymmetry with 'something_changed' and an empty note: that IS an answer — the customer
 * was shown the field and left it blank — and it is stored.
 */
export function buildComparabilityRecord(input: {
  capture: ComparabilityCapture | null
  /** The free text as it stands at save. Ignored when the answer is 'nothing_changed'. */
  note: string
  priorYearLookupFailed: boolean
  /** The disclosure recomputed from current state at save. Null when there is no longer one. */
  current: ComparabilityDisclosure | null
  /** ISO timestamp of this save. */
  checkedAt: string
}): ComparabilityRecord | null {
  const { capture, note, priorYearLookupFailed, current, checkedAt } = input

  if (priorYearLookupFailed) return null
  if (!capture) return null

  // A disclosure that has become null since the answer is a REAL difference, not a missing check:
  // the customer answered an observation that no longer stands. Recorded as drift to an empty set.
  const observationsAtSave = current ? observationLines(current) : []
  const observationsChanged = !sameLines(capture.observations, observationsAtSave)

  return {
    observations: capture.observations,
    question: capture.question,
    answer: capture.answer,
    note: capture.answer === 'something_changed' ? note : null,
    detailProvided: capture.answer === 'something_changed' && note.trim().length > 0,
    basis: capture.basis,
    answeredAt: capture.answeredAt,
    checkedAt,
    observationsChanged,
    ...(observationsChanged ? { observationsAtSave } : {}),
  }
}
