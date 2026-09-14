// ── SPEND-BASED EMISSION FACTORS — STRUCTURE ONLY, NO VALUES ─────────────────────────────────────
//
// This module defines the SHAPE a spend-based factor must have and the rules for resolving one. It
// deliberately contains no factor values and no factor table. Nothing imports it yet.
//
// It exists because the two spend tables in the codebase today carry a number and nothing else:
// EMISSION_FACTORS.spend (lib/emissionFactors.ts) and SECTOR_RISK[].ef
// (app/dashboard/supply-chain/page.tsx). Neither records which country the factor prices, which
// currency the denominator is in, which year that currency is denominated in, which price basis it
// is quoted on, which published dataset it came from, or which of that dataset's sector codes it
// was read off. A verifier asking "which row of which table is this?" cannot be answered from
// either. Both remain in place and unmodified until this module has data; see the note at the foot.
//
// ⚠️ EVERY FIELD IS REQUIRED, AND THAT IS THE POINT. An optional `currency` is how a USD factor
// gets applied to EUR spend; an optional `price_year` is how a factor built on one year's prices
// gets applied to another without anyone noticing; an optional `price_basis` is how a basic-price
// multiplier gets applied to an invoice total. A partially-known factor is not a factor this module
// will hold. If a value cannot be accompanied by all ten fields, it does not go in.

import { EPA_USEEIO_URL } from '../sources'

// ── THE RECORD ───────────────────────────────────────────────────────────────────────────────────

/** The only unit this module accepts. A second unit would need a conversion, and conversions belong
 *  in lib/unitConversions.ts as audited steps, not implied by a field name. */
export type SpendFactorUnit = 'kgCO2e_per_currency_unit'

/**
 * Which of EXIOBASE's two tables a factor was read from. Required, no default.
 *
 * EXIOBASE publishes both, and they answer different questions:
 *   'industry' — the intensity of an INDUSTRY AS A WHOLE (the 163-industry ixi table). It prices
 *                "a euro spent with a company of this kind", averaging everything that industry
 *                makes. Correct for SUPPLIER-LEVEL SCREENING, where we know who the supplier is and
 *                not what was bought: a supplier risk register is exactly this case.
 *   'product'  — the intensity of a PRODUCT CATEGORY across every industry producing it (the
 *                200-product pxp table). It prices "a euro spent on this thing". Correct for
 *                CATEGORY 1 WHERE THE PURCHASE IS KNOWN — a line on an AP ledger naming what was
 *                bought should be priced by what it is, not by who sold it.
 *
 * ⚠️ THEY ARE NOT INTERCHANGEABLE AND THE ERROR IS NOT SYMMETRIC. Pricing a known purchase with an
 * industry factor attributes to it the average of everything that industry sells, which is wrong by
 * however diversified the industry is. Pricing an unknown purchase with a product factor is worse:
 * it requires picking a product nobody has established was bought. Where the purchase is not known,
 * 'industry' is the honest answer; where it is, 'product' is the more accurate one.
 */
export type SpendFactorType = 'industry' | 'product'

/**
 * The valuation the DENOMINATOR is quoted in. Required, no default.
 *
 * ⚠️ THE THREE SOURCES IN THIS MODULE PUBLISH ON THREE DIFFERENT BASES, AND THE DIFFERENCE BETWEEN
 * THEM IS NOT ROUNDING. Moving from basic to purchaser prices adds trade margins, transport margins
 * and taxes less subsidies on products. Those margins are a large share of the delivered price in
 * retail-heavy and import-heavy sectors, and they carry their own emissions, attributed to the
 * transport and trade industries rather than to the producing one.
 *
 * What that means in practice: the number a customer types into our wizard is what they PAID — a
 * purchaser-price figure off an invoice or an AP ledger. EXIOBASE publishes in current BASIC
 * prices. Multiplying an invoice total by a basic-price multiplier prices the wrong quantity, in a
 * direction and magnitude that vary by sector, and nothing in the arithmetic reveals it. This field
 * exists so the mismatch is visible in the record rather than discovered by a verifier.
 *
 * This module does NOT convert between bases. A basis conversion needs the publisher's own margin
 * and tax matrices and is a documented derivation, not a coefficient.
 */
export type PriceBasis = 'basic' | 'producer' | 'purchaser'

export interface SpendFactor {
  /** ISO 3166-1 alpha-2 ('US', 'GB', 'CA'), or a documented multi-country region code. */
  region: string
  /**
   * AN EXIOBASE CODE. NOT one of our internal sector names.
   *
   * This changed deliberately. The codebase held three disagreeing internal vocabularies —
   * SECTOR_RISK (14 keys), the scope3 SECTORS array (13) and EMISSION_FACTORS.spend (13), sharing
   * only 8 keys between them — none of which corresponds to anything a publisher tabulates, so no
   * factor could ever be traced to a published row. The vocabulary is now EXIOBASE's own, and our
   * former keys become a DISPLAY GROUPING over it rather than the thing factors are keyed on.
   *
   * The value is the ExioCode for the factor_type:
   *   factor_type 'industry' -> the ixi ExioCode, e.g. 'i01.a'   (163 of them)
   *   factor_type 'product'  -> the pxp ExioCode, e.g. 'p01.a'   (200 of them)
   * The two code spaces are parallel but NOT identical — 163 industries against 200 products — so a
   * code is meaningless without the factor_type beside it. Never store one and infer the other.
   */
  sector_key: string
  /** Which EXIOBASE table this came from. See SpendFactorType — it changes what the number means. */
  factor_type: SpendFactorType
  value: number
  unit: SpendFactorUnit
  /** ISO 4217 of the DENOMINATOR: the currency the spend must be expressed in for this factor. */
  currency: string
  /** The year that currency is denominated in. A multiplier built on one year's prices applied to
   *  another year's spend is wrong by the intervening price change. This module does not deflate;
   *  it records the year so a caller cannot pretend the question does not arise. */
  price_year: number
  /** Basic, producer or purchaser. See PriceBasis above — this is not a formality. */
  price_basis: PriceBasis
  /** Key into the source catalogue below. */
  source_id: SpendSourceId
  /** Edition/version of that source as the publisher labels it. */
  source_version: string
  /**
   * The source's own sector code, as the publisher labels it.
   *
   * For EXIOBASE this now DUPLICATES sector_key, and that is correct rather than redundant: the
   * other two sources in this module do not use EXIOBASE codes, so a USEEIO factor carries a BEA
   * code here and a StatCan factor a NAICS code, while sector_key still has to hold whatever key
   * the resolver is indexed on. Keeping the field means a verifier can always find the published
   * row without knowing which source a given factor came from.
   */
  source_classification: string
}

// ── SOURCE CATALOGUE ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️ THIS DIVERGES FROM EF_SOURCES IN lib/ghg/engine.ts, DELIBERATELY. EF_SOURCES is
// `Record<string, string>` — one free-text citation per key, e.g. 'US EPA eGRID2023'. A string
// cannot carry a URL as a separate field, cannot carry a publication date a test could check,
// cannot carry a licence, and above all cannot express "publisher known, publication date NOT
// verified" — it can only omit the date silently, which reads identically to a date that was
// checked. Every field below is therefore nullable, and null means NOT VERIFIED AGAINST A PRIMARY
// SOURCE. It never means "not applicable" and never means "none".
//
// EF_SOURCES is not changed by this module and is not read by it.

export type SpendSourceId = 'useeio_us' | 'statcan_ca' | 'exiobase_38'

export interface SpendFactorSource {
  publisher: string | null
  dataset: string | null
  version: string | null
  /** ISO 8601 date. */
  published: string | null
  url: string | null
  doi: string | null
  /** ⚠️ REQUIRED FOR ATTRIBUTION COMPLIANCE, NOT BOOKKEEPING. EXIOBASE is CC BY-SA 4.0: the
   *  ShareAlike term attaches obligations to anything we publish that is an adaptation of it, and
   *  the BY term requires attribution wherever a derived figure is shown. A figure whose licence we
   *  cannot state is a figure we cannot safely put in front of a customer or a verifier. */
  licence: string | null
  /** The classification system the publisher tabulates against, in the publisher's own words. */
  classification: string | null
  /** Anything a reader must know before treating this source as a spend-based factor set. */
  note: string | null
}

export const SPEND_EF_SOURCES: Record<SpendSourceId, SpendFactorSource> = {
  useeio_us: {
    publisher: 'US Environmental Protection Agency',
    dataset: 'USEEIO — US Environmentally-Extended Input-Output model',
    version: null,
    published: null,
    url: EPA_USEEIO_URL,
    doi: null,
    licence: null,
    classification: null,
    note:
      'The EPA landing page states the model "melds data on economic transactions between 389 ' +
      'industry sectors" but names no current version, no release date and no classification. ' +
      'Secondary sources describe v2.0 as 411 commodities built on BEA 2012 Detail IO tables in ' +
      '2012 USD; none of that is transcribed into the fields above because it was not read off an ' +
      'EPA primary page. The 2012 price basis, if confirmed, is what price_year exists to record.',
  },

  statcan_ca: {
    publisher: 'Statistics Canada',
    dataset: null,
    version: null,
    published: null,
    url: null,
    doi: null,
    licence: null,
    classification: null,
    note:
      'The multiplier series to use is the DIRECT PLUS INDIRECT greenhouse gas emissions intensity ' +
      'published in catalogue 16-509-X, in tonnes per thousand current dollars of production. ' +
      'That is a multiplier; table 38-10-0097 (Physical flow account for greenhouse gas emissions) ' +
      'is one of its INPUTS and must not be used in its place — a physical flow account has no ' +
      'monetary denominator, and deriving one from it by pairing with the supply and use tables ' +
      'would make the derivation ours rather than the publisher\'s. Every field above except ' +
      'publisher is null: no statcan.gc.ca page was fetched, so the catalogue edition, its release ' +
      'date, its URL, its licence and its exact NAICS aggregation level are all unverified. Note ' +
      'the published unit is per THOUSAND dollars, not per dollar; converting it to this module\'s ' +
      'unit is a conversion to be recorded, not assumed.',
  },

  exiobase_38: {
    publisher: 'EXIOBASE consortium',
    dataset: 'EXIOBASE 3',
    version: '3.8.2',
    published: '2021-10-21',
    url: 'https://zenodo.org/records/5589597',
    doi: '10.5281/zenodo.5589597',
    licence: 'CC BY-SA 4.0',
    classification: null,
    note:
      'Multipliers are in M.txt inside the IOT_YYYY_*.zip archives; they are not a separate ' +
      'download. Resolution is 163 industries by 200 products, covering 44 countries (28 EU ' +
      'member states plus 16 major economies) and 5 rest-of-world regions. Values are in current ' +
      'BASIC prices in EUR, which is why price_basis exists on SpendFactor: customer spend is a ' +
      'purchaser-price figure and the two are not interchangeable. ' +
      'TIME SERIES CAVEAT, IN THE PUBLISHER\'S OWN TERMS: the original series ends at 2011, with ' +
      'later years estimated from trade and macro data, and the record states "A lot of care must ' +
      'be taken in use of this data. It is only partially suitable for analyzing trends over ' +
      'time!" The last real GHG data point is 2019. A factor drawn from an estimated year must ' +
      'carry that year in price_year and must not be presented as measured. ' +
      'The ShareAlike term is why licence is a required field: see SpendFactorSource.licence.',
  },
}

// ── RESOLUTION ───────────────────────────────────────────────────────────────────────────────────

export interface SpendFactorQuery {
  /** ISO 3166-1 alpha-2, or a documented region code. */
  region: string
  /** An EXIOBASE ExioCode matching factor_type below. See SpendFactor.sector_key. */
  sector_key: string
  /** Industry or product. Required: the same query with the other value is a different question,
   *  and the two code spaces do not overlap. See SpendFactorType. */
  factor_type: SpendFactorType
  /** ISO 4217 the caller's spend is denominated in. */
  reporting_currency: string
  /** The inventory year the caller is pricing. */
  reporting_year: number
  /** The basis the caller's spend figure is on. Required for the same reason price_basis is
   *  required on the factor: without it the mismatch cannot be detected, only assumed away. */
  spend_price_basis: PriceBasis
}

/** Why a factor other than the exact requested one was returned. One member per reason, so a new
 *  fallback route cannot be added without every caller seeing a new discriminant. */
export type SpendFallbackReason = 'no_factor_for_region'

/** Conditions that do NOT block resolution but that a caller must not apply blind. Returned on both
 *  exact and fallback results, because an exact region match on the wrong price basis is just as
 *  wrong as a substituted region. */
export interface SpendFactorCaveats {
  /** factor.currency !== query.reporting_currency. This module performs NO FX conversion. */
  currency_mismatch: boolean
  /** factor.price_year !== query.reporting_year. This module performs NO DEFLATION. */
  price_year_mismatch: boolean
  /** factor.price_basis !== query.spend_price_basis. This module performs NO BASIS CONVERSION. */
  price_basis_mismatch: boolean
}

export type SpendFactorResult =
  | {
      kind: 'exact'
      factor: SpendFactor
      source: SpendFactorSource
      requested_region: string
      /** Equal to requested_region on an exact result, by construction. */
      used_region: string
      caveats: SpendFactorCaveats
    }
  | {
      kind: 'fallback'
      factor: SpendFactor
      source: SpendFactorSource
      requested_region: string
      /** The region actually priced. NEVER equal to requested_region on a fallback result. */
      used_region: string
      reason: SpendFallbackReason
      /** A sentence naming the substitution, for the workings row and for the customer. The caller
       *  must render it; it is not optional prose. */
      disclosure: string
      caveats: SpendFactorCaveats
    }

/**
 * Resolve one spend-based factor, with its provenance.
 *
 * ⚠️ RETURNS null WHEN THERE IS NO FACTOR, AND THERE IS NO DEFAULT IN THIS MODULE. That is the
 * single most important line in the file. lib/emissionFactors.ts has DEFAULT_SPEND_EF, and
 * app/dashboard/scope3/page.tsx has a literal fallback inside calcGenericSpend; both turn "we do
 * not know" into a number that renders identically to one we do know. A null forces the caller to
 * decide what to show, and "we cannot price this" is a legitimate thing to show.
 *
 * The contract:
 *   - exact region match is preferred and returns kind 'exact'
 *   - a factor from another region returns kind 'fallback', naming used_region and carrying a
 *     disclosure sentence; the discriminated union means TypeScript will not let a caller reach
 *     .factor without narrowing on .kind, so a substitution cannot pass silently
 *   - the full provenance record and its source entry are returned alongside the value; a caller
 *     that wants only the number still receives the rest
 *   - currency, price-year and price-basis mismatches are REPORTED, never corrected here. FX
 *     belongs to a conversion step the customer can see; deflation belongs to a documented index;
 *     a basis conversion belongs to the publisher's own margin and tax matrices. None of the three
 *     is a coefficient this resolver may apply on its own authority
 *   - no factor at all returns null
 */
export declare function resolveSpendFactor(query: SpendFactorQuery): SpendFactorResult | null

// ── NOT YET WIRED ────────────────────────────────────────────────────────────────────────────────
//
// Nothing imports this module. lib/emissionFactors.ts, DEFAULT_SPEND_EF and SECTOR_RISK are all
// unchanged and still in use by app/dashboard/scope3/page.tsx,
// app/dashboard/supply-chain/page.tsx and app/api/campaigns/[id]/scope3-cat1/route.ts. They stay
// until this module holds verified data for the regions those callers serve, because a resolver
// that returns null for every query would take the product from a wrong number to no number.
