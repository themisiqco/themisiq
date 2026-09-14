// ── ADJUSTING THE SPEND, NOT THE FACTOR ──────────────────────────────────────────────────────────
//
// A spend-based factor is denominated in one year's prices and one currency. A customer's spend is
// usually in neither. Two transformations close that gap, and both of them act on the SPEND:
//
//   deflation            2026 nominal EUR  ->  2019 real EUR      (built here)
//   currency conversion  USD               ->  EUR                (declared here, NOT built)
//
// ⚠️ THE FACTOR IS NEVER TOUCHED, AND THE DIRECTION IS THE CONVENTION RATHER THAN A PREFERENCE.
// Deflating the spend and inflating the factor are arithmetically equivalent and evidentially are
// not: the published value stays the published value, so a verifier can open EXIOBASE and find the
// number we used. Every other decision in this module family protects that property — the factor
// files are stored exactly as published, the reliability bounds describe rather than clip — and
// this one is the same decision in a new place.
//
// Method, as Climatiq publishes it:
//     real expenditure = nominal expenditure x (index at base year / index at current year)
// where the base year is the FACTOR's price_year and the current year is the customer's.
//
// ⚠️ THIS MODULE SHIPS NO INDEX DATA AND FETCHES NOTHING. The index values and their provenance are
// CALLER-SUPPLIED, exactly like SpendFactorQuery.fallback_regions. There is no default series, no
// default source, and no lookup. Absent an index there is no deflation and the resolver's
// price_year_mismatch caveat stands unaddressed, which is a truthful state to be in.
//
// WHY CALLER-SUPPLIED IS THE WHOLE DESIGN. A price index is a CHOICE, not a constant: GDP deflator,
// CPI, HICP and a sector-specific PPI are all defensible and give different answers, indices are
// revised after publication so the vintage matters, and the right series depends on the country and
// on what was bought. A module that picked one would be making a methodological decision on a
// customer's behalf and recording it nowhere. See the note on authority in the A1 finding: the line
// this module draws is not between kinds of arithmetic, it is between transformations the resolver
// performs on its own authority and transformations someone else has authorised.

// ── PROVENANCE ───────────────────────────────────────────────────────────────────────────────────

/**
 * Where an index came from, so a deflated figure can name its index the way a factor names EXIOBASE.
 *
 * Every field nullable, and null means NOT SUPPLIED — never "not applicable". Same convention as
 * SpendFactorSource in spend.ts and for the same reason: a string cannot express the difference
 * between a field that was checked and a field that was skipped, so the shape has to.
 */
export interface PriceIndexProvenance {
  /** The publisher, e.g. 'Eurostat', 'ONS', 'BLS'. */
  source: string | null
  /** The exact series, e.g. 'HICP - all items, euro area (EA19)'. A publisher alone is not a cite. */
  series: string | null
  /** When the series was read, ISO 8601. Indices are REVISED; two vintages disagree. */
  vintage: string | null
  /** The geography the series describes, if it is geography-specific. */
  region: string | null
  /** Anything a reader must know before trusting this index for this purpose. */
  note: string | null
}

// ── ADJUSTMENTS ──────────────────────────────────────────────────────────────────────────────────

/**
 * The two transformations that act on spend.
 *
 * 'currency_conversion' IS DECLARED AND NOT IMPLEMENTED, deliberately. It is the same shape as
 * deflation — caller-supplied external number, recorded provenance, multiplicative, applied to the
 * spend and never to the factor — and naming it here is what stops it being bolted on later in a
 * different shape. Building it needs a rate convention (spot on what date? period average?) that
 * nobody has settled, and inventing one is exactly what this file exists not to do.
 */
export type SpendAdjustmentKind = 'deflation' | 'currency_conversion'

/**
 * One applied transformation, recorded so a workings row can show THREE NUMBERS: what went in, what
 * it was multiplied by, and what came out. A verifier who cannot see all three cannot check the
 * step, and a figure a verifier cannot check is the thing this whole module family exists to avoid.
 */
export interface SpendAdjustment {
  kind: SpendAdjustmentKind
  /** The spend before this step. */
  input_amount: number
  /** What input_amount was multiplied by. Exactly 1 for a no-op, which is still recorded. */
  multiplier: number
  /** input_amount x multiplier. Stored rather than re-derived so the row cannot disagree with itself. */
  output_amount: number
  /** The year the input is denominated in — the customer's reporting year. */
  from_year: number
  /** The year the output is denominated in — the factor's price_year. */
  to_year: number
  /** Index value at from_year, as supplied. */
  index_from: number
  /** Index value at to_year, as supplied. */
  index_to: number
  provenance: PriceIndexProvenance
  /**
   * Always false, and it is a stored field rather than an assumption a reader has to make.
   * The adjustment moved the SPEND. The factor is the published value and stays the published
   * value; see the header.
   */
  factor_value_modified: false
  /** Renderable prose naming the index and the direction. The caller must show it. */
  disclosure: string
}

/** What a caller supplies to deflate. Both index values are required: a ratio needs two numbers,
 *  and a module that defaulted one to 100 would be inventing a base year. */
export interface DeflationInput {
  /** Nominal spend, in from_year prices. */
  amount: number
  /** The year `amount` is denominated in — the customer's reporting year. */
  from_year: number
  /** The year to express it in — the FACTOR's price_year. */
  to_year: number
  index_from: number
  index_to: number
  provenance: PriceIndexProvenance
}

// ── DEFLATION ────────────────────────────────────────────────────────────────────────────────────

/**
 * Express `amount` in `to_year` prices.
 *
 *     real = nominal x (index at to_year / index at from_year)
 *
 * from_year === to_year is a NO-OP AND IS STILL RECORDED, with multiplier exactly 1. An adjustment
 * that leaves the number alone is not an adjustment that did not happen: the workings row should
 * show that the question was asked and the answer was one, rather than going silent.
 *
 * ⚠️ THROWS ON AN UNUSABLE INDEX RATHER THAN RETURNING THE NOMINAL AMOUNT. A zero, negative,
 * non-finite or missing index value is a programming error at the call site, not a data condition
 * the customer can act on, and quietly returning the undeflated figure would produce a number that
 * looks deflated and is not — the precise failure this module family was built to stop. The caller
 * that has no index must simply not call this; absent an adjustment, the resolver's
 * price_year_mismatch caveat stands and says so.
 */
export function deflateSpend(input: DeflationInput): SpendAdjustment {
  const { amount, from_year, to_year, index_from, index_to, provenance } = input

  for (const [name, v] of [['amount', amount], ['index_from', index_from], ['index_to', index_to]] as const) {
    if (!Number.isFinite(v)) throw new Error(`deflateSpend: ${name} must be a finite number, got ${v}`)
  }
  for (const [name, v] of [['index_from', index_from], ['index_to', index_to]] as const) {
    if (v <= 0) throw new Error(`deflateSpend: ${name} must be greater than zero, got ${v}. An index of zero has no ratio.`)
  }
  for (const [name, v] of [['from_year', from_year], ['to_year', to_year]] as const) {
    if (!Number.isInteger(v)) throw new Error(`deflateSpend: ${name} must be an integer year, got ${v}`)
  }

  const multiplier = from_year === to_year ? 1 : index_to / index_from
  const output_amount = amount * multiplier

  const where = provenance.series ?? provenance.source ?? 'an unnamed index'
  const disclosure = from_year === to_year
    ? `Spend is already in ${to_year} prices, the year the emission factor is denominated in, so no ` +
      `deflation was applied.`
    : `Spend was recorded in ${from_year} and the emission factor is denominated in ${to_year} ` +
      `prices, so the spend was restated to ${to_year} prices using ${where} ` +
      `(${to_year} = ${index_to}, ${from_year} = ${index_from}; multiplier ` +
      `${multiplier.toPrecision(6)}). The emission factor is unchanged from its published value.`

  return {
    kind: 'deflation',
    input_amount: amount,
    multiplier,
    output_amount,
    from_year,
    to_year,
    index_from,
    index_to,
    provenance,
    factor_value_modified: false,
    disclosure,
  }
}

// ── COMPOSING WITH THE RESOLVER ──────────────────────────────────────────────────────────────────
//
// resolveSpendFactor NEVER SEES A SPEND AMOUNT — its query carries a region, a sector and the
// caller's currency, year and basis, and nothing else. That is why deflation is not a parameter of
// it: you cannot deflate a number a function is not given. The order is:
//
//   1. resolve the factor; read factor.price_year and the caveats
//   2. if caveats.price_year_mismatch and an index is available, deflateSpend(... to_year:
//      factor.price_year ...)
//   3. multiply the adjusted spend by factor.value
//   4. render the factor's provenance, every caveat, and every adjustment's disclosure
//
// ⚠️ AN ADJUSTMENT DOES NOT CLEAR A CAVEAT, AND NOTHING HERE PRETENDS IT DOES. The caveats describe
// the FACTOR against the QUERY and are computed before any adjustment exists. price_year_mismatch
// stays true on a deflated figure; the adjustment record beside it is the evidence that the
// mismatch was addressed and how. A caller that hides the caveat once it has deflated has removed
// the reader's ability to check the step.
