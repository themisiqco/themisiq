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
  /**
   * Any unit normalisation applied between the published file and a SpendFactor, stated in full.
   * Null means none was needed.
   *
   * WARNING: THE TEST FOR BELONGING HERE IS NO EXTERNAL INPUT AND NO CHOICE - not "changes the unit
   * rather than the quantity", which is the wrong test and lets FX through, since converting USD to
   * EUR also leaves the purchase it describes unchanged. A unit normalisation needs no data beyond
   * the number itself and admits one correct answer; FX needs a rate, deflation needs a price index
   * and basis conversion needs margin matrices, and each of those is a choice that changes the
   * figure, so none may be applied on this module's own authority. Deflation IS performed, by
   * lib/emissionFactors/spendAdjustment.ts, on a caller-supplied index and against the SPEND rather
   * than the factor - the authority is the caller's, which is the same arrangement as
   * SpendFactorQuery.fallback_regions. Recorded here rather than left implicit because a reader
   * comparing a resolved value against the published file must be able to see why they differ.
   */
  unit_conversion: string | null
  /** Anything a reader must know before treating this source as a spend-based factor set. */
  note: string | null
  /**
   * Whether the source publishes uncertainty values (ranges, standard deviations, pedigree scores)
   * for these factors. false = established that it does not; null = not established either way.
   *
   * ⚠️ false IS A DISCLOSURE, NOT A DEFECT. Publishing no uncertainty is the norm for spend-based
   * factor sets, but a figure shown without one must say so, or the absence reads as a precision
   * nobody claimed. The spend-factor route states it once per response whenever this is false.
   */
  publishes_uncertainty: boolean | null
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
    unit_conversion: null,
    publishes_uncertainty: null,
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
    unit_conversion: null,
    publishes_uncertainty: null,
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
    unit_conversion:
      'Divided by 1e6. The published files record kg CO2 eq. per MILLION EUR - impacts/unit.txt ' +
      'gives the numerator only, and the archive root unit.txt reports M.EUR for every ' +
      'region-sector pair - while SpendFactorUnit is per ONE currency unit. The stored files are ' +
      'unchanged; the division happens in the resolver at the point a raw row becomes a ' +
      'SpendFactor, which is the first point at which the type asserts a unit.',
    // false, on this basis: the factors are point values from one row of impacts/M.txt with no
    // uncertainty column beside them in the extract, and the 17 Sep 2026 brief for this field states
    // that EXIOBASE 3.8.2 publishes none for these multipliers (Climatiq report that, of their
    // sources, only ADEME provides uncertainty across its database). The full archive was not
    // re-opened to confirm it when the field was added; re-check it if the source is re-extracted.
    publishes_uncertainty: false,
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
  /**
   * Regions to try, in order, when `region` itself has no factor. OMIT FOR NO FALLBACK.
   *
   * WARNING: THE RESOLVER INVENTS NO GEOGRAPHY, AND THE OMISSION IS DELIBERATE. EXIOBASE carries
   * five rest-of-world regions - WA, WL, WE, WF, WM - and mapping a country to one of them is a
   * methodological choice with no published basis in this module. Building that table here would
   * make every fallback the resolver's decision rather than someone's, which is the silent
   * substitution the discriminated return type exists to prevent. Absent this field a missing
   * region returns null, and null is a legitimate answer.
   */
  fallback_regions?: readonly string[]
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
  /**
   * Where the factor's value sits among ALL non-zero factors of its type in the file.
   *
   * 'below' / 'above' = in the bottom `lower_percentile`% or top (100 - `upper_percentile`)%. With
   * the published 3/97 that is a genuine extreme across hundreds of sectors and 49 regions, and a
   * caller should say so as a caution.
   */
  intensity_among_all_factors: {
    position: IntensityPosition
    lower_percentile: number
    upper_percentile: number
  }
  /**
   * Where the factor's value sits among its OWN SECTOR's regions, with its rank.
   *
   * ⚠️ THE PER-SECTOR TEST IS A RANK TEST, NOT AN OUTLIER TEST, AND position MUST BE PRESENTED AS A
   * FACT, NEVER AS A CAUTION. With 49 regions the 5th percentile falls between the 3rd and 4th
   * lowest values and the 95th between the 3rd and 4th highest, so every fully populated sector
   * places its lowest three and highest three regions outside, whatever their values. Measured 17 Sep
   * 2026: that fires on 15.4% of priceable industry factors and 11.9% of the G7-plus-Australia ones,
   * and about 70% of those are for being BELOW - lower emissions per unit of spend than most regions,
   * which is what a low-carbon economy produces. Germany i28 sits 0.12% under p5 as the 3rd lowest of
   * 49, with Switzerland 0.3% higher and inside. So the rank is carried with the position, and a
   * caller states the rank ("3rd lowest of 49 regions for this sector") rather than a warning.
   *
   * `assessed: false` is the case formerly called reliability_bounds_incomplete: the sector has
   * fewer than `minimum_regions` regions with a non-zero factor, so no per-sector percentile exists
   * and no position within the sector was established. It is NOT in range; it is not assessed.
   */
  intensity_within_sector: SectorIntensityPosition
}

/**
 * 'below' / 'within' / 'above' a pair of percentiles. NOT a verdict on the value.
 *
 * ⚠️ WHY NONE OF THESE NAMES SAYS RELIABILITY, CONFIDENCE OR QUALITY. Until 17 Sep 2026 this was
 * `outside_reliability_bounds`. All three words are defined terms elsewhere — in the GHG Protocol's
 * data quality indicators "reliability" describes how data was acquired and verified, and customers
 * report under that meaning — and a percentile position measures none of them. It measures where a
 * number sits among other numbers.
 */
export type IntensityPosition = 'below' | 'within' | 'above'

export type SectorIntensityPosition =
  | {
      assessed: true
      position: IntensityPosition
      lower_percentile: number
      upper_percentile: number
      /** 1 = the lowest non-zero factor for this sector. Ties share the better rank. */
      rank_from_lowest: number
      /** 1 = the highest non-zero factor for this sector. */
      rank_from_highest: number
      /** Regions with a non-zero factor for this sector: the population the rank is taken over. */
      regions_ranked: number
      /** Regions in the dataset, so a caller can say "of 49" only when every region was ranked. */
      regions_in_dataset: number
    }
  | {
      assessed: false
      /** Regions with a non-zero factor for this sector — fewer than minimum_regions. */
      regions_with_factor: number
      minimum_regions: number
      regions_in_dataset: number
    }

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/**
 * The sentences describing where a factor sits, from its caveats. ONE place for these words, read by
 * the resolver's fallback disclosure and by the spend-factor route, so no two surfaces describe the
 * same position differently.
 *
 * Four cases, and they are NOT written alike, on purpose:
 *   among all factors, below or above  -> a CAUTION. A bottom- or top-3% value across every sector
 *                                         and region is a genuine extreme.
 *   within the sector, below           -> a FACT, stated as a rank. Among the lowest-intensity
 *                                         regions for the sector; no warning, because being low is
 *                                         what a low-carbon economy does, and the test is a rank
 *                                         test that flags three regions at each end of every sector.
 *   within the sector, above           -> a FACT, stated as a rank, with the count of regions below
 *                                         it, because a high position moves an estimate up and is
 *                                         worth the reader's attention even though it is not an error.
 * Plus the not-assessed case, which says why no within-sector position exists.
 *
 * Every number is taken from the caveats, which the resolver computed from the data; nothing here is
 * asserted.
 */
export function intensityPositionSentences(caveats: SpendFactorCaveats, factorType: SpendFactorType): string[] {
  const out: string[] = []
  const all = caveats.intensity_among_all_factors
  if (all.position === 'below') {
    out.push(
      `This emission factor is in the lowest ${all.lower_percentile}% of all ${factorType} factors in the ` +
      `source data. It was used as published; a value at either extreme of the source data should be ` +
      `checked against what is known about the supplier before it is relied on.`,
    )
  } else if (all.position === 'above') {
    out.push(
      `This emission factor is in the highest ${100 - all.upper_percentile}% of all ${factorType} factors ` +
      `in the source data. It was used as published; a value at either extreme of the source data should ` +
      `be checked against what is known about the supplier before it is relied on.`,
    )
  }

  const sector = caveats.intensity_within_sector
  if (sector.assessed) {
    const population = sector.regions_ranked === sector.regions_in_dataset
      ? `${sector.regions_ranked} regions`
      : `the ${sector.regions_ranked} regions with a non-zero factor`
    const place = (rank: number, end: 'lowest' | 'highest') => rank === 1 ? `the ${end}` : `the ${ordinal(rank)} ${end}`
    if (sector.position === 'below') {
      out.push(`This region has ${place(sector.rank_from_lowest, 'lowest')} emission factor of ${population} for this sector.`)
    } else if (sector.position === 'above') {
      const lower = sector.rank_from_lowest - 1
      out.push(
        `This region has ${place(sector.rank_from_highest, 'highest')} emission factor of ${population} for ` +
        `this sector: ${lower} ${lower === 1 ? 'region has' : 'regions have'} a lower one.`,
      )
    }
  } else {
    out.push(
      `Only ${sector.regions_with_factor} of ${sector.regions_in_dataset} regions have a non-zero emission ` +
      `factor for this sector, fewer than the ${sector.minimum_regions} needed to place one region within ` +
      `it, so this factor's position within the sector was not assessed.`,
    )
  }
  return out
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
       *  must render it; it is not optional prose. When the substituted value is also at an
       *  extreme or an end of its sector (caveats.intensity_*), this sentence MUST name that as well
       *  as the region substitution - see the resolver contract below. */
      disclosure: string
      caveats: SpendFactorCaveats
    }

// ── THE RESOLVER LIVES IN spendResolver.server.ts ────────────────────────────────────────────────
//
// Its full contract - every rule the implementation must follow - is the doc comment on
// resolveSpendFactor in lib/emissionFactors/spendResolver.server.ts. It is stated there rather than
// here so it sits against the code that has to honour it.
//
// WARNING: THIS FILE HELD `export declare function resolveSpendFactor(...)` UNTIL THE
// IMPLEMENTATION EXISTED, AND THAT WAS A LANDMINE. A `declare`d function with no implementation
// type-checks at every call site and throws at runtime, so the compiler actively hid the fact that
// nothing backed it. The declaration is gone; the types above are the contract, and the
// implementation imports them.
//
// WARNING: THE SPLIT IS NOT TIDINESS. This file is client-safe - types, a small source catalogue,
// no data. The resolver imports 2.17 MB of factor JSON and must never reach a browser bundle, so
// it lives in a file named .server.ts and is imported only from server code.

// ── NOT YET WIRED ────────────────────────────────────────────────────────────────────────────────
//
// Nothing imports this module. lib/emissionFactors.ts, DEFAULT_SPEND_EF and SECTOR_RISK are all
// unchanged and still in use by app/dashboard/scope3/page.tsx,
// app/dashboard/supply-chain/page.tsx and app/api/campaigns/[id]/scope3-cat1/route.ts. They stay
// until this module holds verified data for the regions those callers serve, because a resolver
// that returns null for every query would take the product from a wrong number to no number.
