// ── ADJUSTING THE SPEND, NOT THE FACTOR ──────────────────────────────────────────────────────────
//
// A spend-based factor is denominated in one year's prices and one currency. A customer's spend is
// usually in neither. One transformation closes that gap, and it acts on the SPEND:
//
//   edition conversion   2024 GBP  ->  2019 EUR      (built here)
//
// ⚠️ THE FACTOR IS NEVER TOUCHED, AND THE DIRECTION IS THE CONVENTION RATHER THAN A PREFERENCE.
// Converting the spend and rebasing the factor are arithmetically equivalent and evidentially are
// not: the published value stays the published value, so a verifier can open EXIOBASE and find the
// number we used. Every other decision in this module family protects that property — the factor
// files are stored exactly as published, the intensity percentiles describe rather than clip — and
// this one is the same decision in a new place.
//
// ═══ THE CALLER-SUPPLIED DEFLATION PATH HAS BEEN REMOVED ═════════════════════════════════════════
//
// This module previously exported deflateSpend(), which took a price index and its two values from
// the CALLER and applied them. That is gone, along with DeflationInput and PriceIndexProvenance.
// There is no deprecated path and no shim; a caller that wants a price-year adjustment gets it from
// the edition.
//
// WHY, AND WHY THIS IS NOT A RETREAT FROM THE MODULE'S PRINCIPLE. Inflation and exchange rates are
// now supplied by the EDITION — a fingerprinted set of artefacts recorded in public.factor_editions
// — rather than by a caller argument. The module still performs no transformation on its own
// authority. The authority simply moved from "whatever the caller passed in" to "a recorded,
// fingerprinted edition that can be named in a disclosure and checked afterwards", which is the
// stronger of the two: a caller argument is authority nobody can audit once the call returns.
//
// IT ALSO FOLLOWS THE MARKET CONVENTION. Climatiq's Procurement endpoint takes user-supplied
// MARGINS but does NOT expose inflation or FX as caller inputs. The reason is double-counting: if
// two parties each apply a price-year adjustment to the same figure, the CPI ratio goes in twice.
// For Germany that is 1.195 applied twice — 1.43 instead of 1.195, a ~20% overstatement sitting
// entirely inside the plausible range, where nothing in the arithmetic reveals it. Exposing
// inflation as a caller input is an invitation to exactly that. See
// assertSingleFactorBasisConversion below, which is the runtime half of the same defence.
//
// ⚠️ A CALLER-SUPPLIED MARGIN IS A DIFFERENT THING FROM A CALLER-SUPPLIED PRICE INDEX, AND THE
// DISTINCTION IS WHY 'basis_conversion' WILL BE LEGITIMATE CALLER INPUT WHEN IT ARRIVES. A price
// index describes the world and has one right answer for a given country and period, so two
// parties choosing independently is two parties disagreeing about a fact. A margin describes THIS
// customer's purchase — what share of the invoice was trade and transport margin and tax rather
// than the producer's price — and only the customer can know it. Climatiq exposes the second and
// not the first for that reason, and this module will do the same.

import { regionLabel } from './regionNames'

// ── KINDS ────────────────────────────────────────────────────────────────────────────────────────

/**
 * The transformations that act on spend. ONE MEMBER TODAY, and still a union rather than a string
 * literal, because the second member is already foreseeable and the shape should not change when it
 * arrives.
 *
 * It gains 'basis_conversion' WHEN MARGIN DATA EXISTS. EXIOBASE 3.8.2 publishes in basic prices and
 * a customer's spend is a purchaser-price figure; the difference is trade margins, transport
 * margins and taxes less subsidies on products. The 3.8.2 archive carries no margin matrices of any
 * kind, so the conversion cannot be derived from it at any level of effort — which is why
 * price_basis_mismatch is reported and never corrected. When margins do become available they will
 * arrive as CALLER INPUT, legitimately: see the note above on why a margin is the customer's fact
 * to state and a price index is not.
 */
export type SpendAdjustmentKind = 'edition_conversion'

/** Which kinds move a figure between price years. The double-conversion guard keys on this set. */
const PRICE_YEAR_TRANSFORMING: ReadonlySet<SpendAdjustmentKind> = new Set(['edition_conversion'])

/** How the underlying scalar was arrived at — mirrors region_spend_conversions.basis. */
export type SpendConversionBasis = 'published' | 'row_composite'

// ── THE RECORD ───────────────────────────────────────────────────────────────────────────────────

/**
 * What every adjustment carries, whatever its kind.
 *
 * The three numbers are the point: what went in, what it was multiplied by, and what came out. A
 * verifier who cannot see all three cannot check the step, and a figure a verifier cannot check is
 * the thing this whole module family exists to avoid.
 */
interface SpendAdjustmentHead {
  /** The spend before this step. */
  input_amount: number
  /** What input_amount was multiplied by. Exactly 1 for a no-op, which is still recorded. */
  multiplier: number
  /** input_amount x multiplier. Stored rather than re-derived so the row cannot disagree with itself. */
  output_amount: number
  /**
   * Always false, and it is a stored field rather than an assumption a reader has to make.
   * The adjustment moved the SPEND. The factor is the published value and stays the published
   * value; see the header.
   */
  factor_value_modified: false
  /** Renderable prose naming the edition and the direction. The caller must show it. */
  disclosure: string
}

/**
 * The spend was brought onto the basis the published factors are denominated in, using the scalars
 * of a named edition.
 */
export interface EditionConversionAdjustment extends SpendAdjustmentHead {
  kind: 'edition_conversion'
  /** The public.factor_editions id whose scalars were used. This is the provenance: everything
   *  about the conversion — which price series, which FX legs, which vintage — is recoverable from
   *  this one string, because the edition fingerprints the artefacts it was built from. */
  edition_id: string
  /** The EXIOBASE region the scalar is for — one of the 44 named regions or a RoW composite. */
  region_code: string
  /** ISO 4217 the input_amount is denominated in. */
  currency: string
  /** The stored scalar from region_spend_conversions. Equal to multiplier, by construction, and
   *  recorded separately so the row names the source value as well as the arithmetic. */
  to_eur2019_per_unit: number
  basis: SpendConversionBasis
  /** For a row_composite scalar: the share of the bucket's MEASURABLE GDP behind the average.
   *  NULL for a published scalar, where the concept does not apply — never "unknown" or "100". */
  gdp_coverage_pct: number | null
}

/** One applied transformation. A discriminated union on `kind`; one arm today. */
export type SpendAdjustment = EditionConversionAdjustment

// ── INPUT ────────────────────────────────────────────────────────────────────────────────────────

/** One row of region_spend_conversions, as the caller read it. */
export interface SpendConversionRow {
  edition_id: string
  to_eur2019_per_unit: number
  basis: SpendConversionBasis
  gdp_coverage_pct: number | null
}

/** What a caller supplies to convert. */
export interface EditionConversionInput {
  /** The customer's spend, in `currency`, at the edition's price vintage year. */
  amount: number
  /** ISO 4217 of `amount`. */
  currency: string
  /** The EXIOBASE region the spend is being priced against. */
  region_code: string
  /**
   * The conversion row itself.
   *
   * ⚠️ THIS MODULE PERFORMS NO LOOKUP. The row is passed in, exactly as the index values used to
   * be. Reading region_spend_conversions is the caller's job, and keeping it there is what lets
   * this module stay client-safe and free of data files while the row travels with its edition_id
   * attached. A module that fetched its own row would also have to decide what to do when there
   * isn't one, and that decision belongs to whoever is pricing the figure.
   */
  conversion: SpendConversionRow
}

// ── CONVERSION ───────────────────────────────────────────────────────────────────────────────────

/**
 * Bring `amount` onto the basis the published EXIOBASE factors are denominated in: 2019 EUR.
 *
 *     output_amount = amount x to_eur2019_per_unit
 *
 * ⚠️ THE 1e6 IS NOT APPLIED HERE, AND ON THE NORMAL PATH IT IS NOT APPLIED BY THE CALLER EITHER.
 * output_amount is a plain amount of 2019 EUR, not millions of them. Whether a divisor is still
 * owed depends entirely on where the factor value came from, and the two cases differ by a factor
 * of a million:
 *
 *   resolveSpendFactor()  — SpendFactor.value is ALREADY per ONE unit of currency. The resolver is
 *                           itself a consumer of the factor files and applies the denominator
 *                           conversion at spendResolver.server.ts, recording it in
 *                           SpendFactorSource.unit_conversion. NOTHING FURTHER IS OWED:
 *
 *                               kg CO2e = adjustment.output_amount * factor.value
 *
 *   a raw value read straight out of exiobaseFactors2019ixi.json / ...pxp.json — per MILLION EUR,
 *                           because that is how EXIOBASE publishes it. Whoever reads the file that
 *                           way applies the divisor and says so:
 *
 *                               kg CO2e = adjustment.output_amount / 1e6 * rawValue
 *
 * ⚠️ APPLYING THE DIVISOR ON THE RESOLVER PATH IS A MILLIONFOLD ERROR, the single largest mistake
 * available in this module family — and unlike most errors here it does not hide in a plausible
 * range, it produces a figure six orders of magnitude out. Resolved value: multiply directly. Raw
 * artefact value: divide first.
 *
 * The SCALAR in region_spend_conversions still excludes the 1e6, deliberately, so that the
 * denominator stays a separate named quantity in the artefact rather than vanishing into a
 * conversion factor. That is a statement about the artefact, not an instruction to a caller.
 *
 * ⚠️ THROWS ON AN UNUSABLE SCALAR RATHER THAN RETURNING THE UNCONVERTED AMOUNT. A zero, negative,
 * non-finite or missing scalar is a programming error at the call site, not a data condition the
 * customer can act on, and quietly returning the unconverted figure would produce a number that
 * looks converted and is not — the precise failure this module family was built to stop. The caller
 * with no conversion row must simply not call this; absent an adjustment, the resolver's
 * price_year_mismatch and currency_mismatch caveats stand and say so.
 */
export function convertSpendToFactorBasis(input: EditionConversionInput): SpendAdjustment {
  const { amount, currency, region_code, conversion } = input
  const { edition_id, to_eur2019_per_unit, basis, gdp_coverage_pct } = conversion

  if (!Number.isFinite(amount)) {
    throw new Error(`convertSpendToFactorBasis: amount must be a finite number, got ${amount}`)
  }
  if (!Number.isFinite(to_eur2019_per_unit)) {
    throw new Error(
      `convertSpendToFactorBasis: to_eur2019_per_unit must be a finite number, got ${to_eur2019_per_unit}`,
    )
  }
  if (to_eur2019_per_unit <= 0) {
    throw new Error(
      `convertSpendToFactorBasis: to_eur2019_per_unit must be greater than zero, got ` +
      `${to_eur2019_per_unit}. A zero or negative scalar prices a purchase at nothing or below it.`,
    )
  }
  if (!edition_id) {
    throw new Error('convertSpendToFactorBasis: edition_id is required; a scalar with no edition cannot be disclosed')
  }

  const multiplier = to_eur2019_per_unit
  const output_amount = amount * multiplier

  const composite = basis === 'row_composite'
  const coverage = composite && gdp_coverage_pct !== null
    ? ` That scalar is a GDP-weighted average across the region's member countries, covering ` +
      `${gdp_coverage_pct}% of the members' measurable GDP, so it describes a regional average and ` +
      `not any one country.`
    : composite
      ? ` That scalar is a GDP-weighted average across the region's member countries, so it ` +
        `describes a regional average and not any one country.`
      : ''

  const disclosure =
    `Spend of ${amount} ${currency} was restated to ${output_amount} EUR at 2019 prices, the basis ` +
    `the emission factor is denominated in, using edition ${edition_id} at ${to_eur2019_per_unit} ` +
    // The region by NAME, code in brackets: "(WA/USD = …)" was internal vocabulary in a sentence a
    // customer reads. regionNames.ts is the one place a region code becomes a name.
    `EUR at 2019 prices per ${currency} for ${regionLabel(region_code)}.${coverage} ` +
    `The emission factor is unchanged from its published value.`

  return {
    kind: 'edition_conversion',
    input_amount: amount,
    multiplier,
    output_amount,
    factor_value_modified: false,
    disclosure,
    edition_id,
    region_code,
    currency,
    to_eur2019_per_unit,
    basis,
    gdp_coverage_pct,
  }
}

// ── THE DOUBLE-CONVERSION GUARD ──────────────────────────────────────────────────────────────────

/**
 * Throw if `adjustments` contains more than one adjustment that transforms the price year.
 *
 * ⚠️ THE HAZARD IS CONCRETE AND IT HIDES IN THE PLAUSIBLE RANGE. Every price-year transformation
 * carries a CPI ratio. Apply two to the same figure and the ratio goes in TWICE. For Germany
 * between 2019 and 2024 the ratio is 1.195062, so two conversions give 1.428174 instead — a ~20%
 * overstatement. Nothing about 1.43 looks wrong next to 1.195: both are ordinary-looking numbers,
 * the units are unchanged, no constraint is violated and no total goes negative. It is exactly the
 * class of error that ships.
 *
 * This is the runtime half of the reasoning in the header: the caller-supplied deflation path was
 * removed because two parties each applying an adjustment double-counts it, and this guard catches
 * the same mistake made twice on one side.
 *
 * A caller building a workings row should call this before summing, not after rendering.
 */
export function assertSingleFactorBasisConversion(adjustments: readonly SpendAdjustment[]): void {
  const priceYear = adjustments.filter(a => PRICE_YEAR_TRANSFORMING.has(a.kind))
  if (priceYear.length > 1) {
    const named = priceYear
      .map(a => `${a.kind} (${a.region_code}/${a.currency}, edition ${a.edition_id}, x${a.multiplier})`)
      .join('; ')
    throw new Error(
      `assertSingleFactorBasisConversion: ${priceYear.length} price-year transformations on one ` +
      `figure. Each carries a CPI ratio and applying two multiplies it in twice — for Germany ` +
      `2019-2024 that is 1.43 rather than 1.195, a ~20% overstatement that looks entirely ` +
      `plausible. Apply exactly one. Found: ${named}`,
    )
  }
}

// ── COMPOSING WITH THE RESOLVER ──────────────────────────────────────────────────────────────────
//
// resolveSpendFactor NEVER SEES A SPEND AMOUNT — its query carries a region, a sector and the
// caller's currency, year and basis, and nothing else. That is why conversion is not a parameter of
// it: you cannot convert a number a function is not given. The order is:
//
//   1. resolve the factor; read factor.price_year, factor.currency and the caveats
//   2. read the region_spend_conversions row for (edition, region_code, currency)
//   3. convertSpendToFactorBasis(... that row ...) — the spend is now in 2019 EUR
//   4. assertSingleFactorBasisConversion(adjustments) before anything is summed
//   5. multiply by factor.value — DIRECTLY, with no divisor. resolveSpendFactor has already applied
//      the 1e6; it is a consumer of the factor files and performs that conversion itself, recording
//      it in SpendFactorSource.unit_conversion. There is NO caller-side 1e6 step on this path, and
//      adding one is a millionfold error.
//   6. render the factor's provenance, every caveat, and every adjustment's disclosure
//
// A caller that bypasses the resolver and reads exiobaseFactors2019*.json directly is in the other
// case: those values are per MILLION EUR and that reader owes the divisor. It is the same rule seen
// from the other side — the 1e6 is applied exactly once, by whoever turns a published row into a
// per-currency-unit number.
//
// ⚠️ AN ADJUSTMENT DOES NOT CLEAR A CAVEAT, AND NOTHING HERE PRETENDS IT DOES. The caveats describe
// the FACTOR against the QUERY and are computed before any adjustment exists. price_year_mismatch
// and currency_mismatch stay true on a converted figure; the adjustment record beside them is the
// evidence that the mismatch was addressed and how. A caller that hides the caveat once it has
// converted has removed the reader's ability to check the step.
//
// ⚠️ price_basis_mismatch IS NOT ADDRESSED BY ANY OF THIS AND STAYS TRUE REGARDLESS. The conversion
// closes the currency and price-year gaps only. EXIOBASE publishes in basic prices, the customer's
// invoice is a purchaser-price figure, and the 3.8.2 archive carries no margin data from which the
// difference could be derived. That caveat is reported, never corrected — see SpendAdjustmentKind
// on what would change when margin data exists.
