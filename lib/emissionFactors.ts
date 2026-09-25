// ─────────────────────────────────────────────────────────────────────────────
// Shared Scope 3 emission factors — single source of truth.
//
// Extracted verbatim from app/dashboard/scope3/page.tsx so that BOTH the Scope 3
// calculator and the supplier-data → Cat 1 aggregate endpoint
// (/api/campaigns/[id]/scope3-cat1) compute from identical factors. Do not keep a
// second copy anywhere; import from here.
//
// Values unchanged from the original inline definition.
// ─────────────────────────────────────────────────────────────────────────────

export const EMISSION_FACTORS = {
  // Spend-based (kg CO2e per USD spent) by sector
  spend: {
    'Energy & Utilities': 0.85,
    'Financial Services': 0.12,
    'Real Estate': 0.45,
    'Technology': 0.18,
    'Healthcare & Pharma': 0.32,
    'Industrials & Manufacturing': 1.10,
    'Consumer & Retail': 0.42,
    'Agriculture & Food': 2.80,
    'Transport & Logistics': 0.90,
    'Mining & Metals': 4.20,
    'Construction & Materials': 3.10,
    'Professional Services': 0.10,
    'Other': 0.50,
  } as Record<string, number>,
  // flight_short, flight_long, hotel, rail, car_petrol, car_electric and bus, activity factors with no
  // recorded source, were removed on 19 Sep 2026 once nothing read them. Cats 6 and 7 price from
  // lib/emissionFactors/defraTravel2026.json, generated from the DEFRA/DESNZ 2026 workbook; hotel stays are
  // not priced at all.
  // waste_landfill (0.467) and waste_recycled (0.021), "kg CO2e per tonne", were removed on 17 Sep 2026.
  // They were about 1,000 times too small for that unit and had no recorded source. Cat 5 now prices
  // from lib/emissionFactors/defraWaste2026.json, generated from the DEFRA/DESNZ 2026 workbook.
  electricity: 0.000233,  // kg CO2e per kWh (UK average)
}

// Default spend factor when a sector is unmatched (mirrors the calculator's
// `|| 0.5` fallback at the Cat 1 calculation site).
export const DEFAULT_SPEND_EF = 0.5

/**
 * What is recorded about where the values in EMISSION_FACTORS came from: nothing.
 *
 * ⚠️ NULL IS THE TRUTH, NOT A PLACEHOLDER. No value in this table carries a publisher, a year or a
 * region. Until 17 Sep 2026 five places described Scope 3 factors as DEFRA and Exiobase, which was false: no
 * value in this table came from DEFRA. (Cat 5's waste factors are now DEFRA/DESNZ's, and they live in
 * lib/emissionFactors/defraWaste2026.json with their citation, not here.) Anything that describes the basis
 * of a figure computed from this table reads these fields, so the description changes the moment a
 * real source is recorded here, and says "no published source" until then.
 */
export const EMISSION_FACTORS_PROVENANCE: { source: string | null; year: number | null; region: string | null } = {
  source: null,
  year: null,
  region: null,
}

/**
 * ⚠️ GENERIC_SPEND_FACTOR WAS DELETED ON 25 SEP 2026, AND THIS NOTE IS WHY IT IS NOT COMING BACK.
 *
 * It held 0.5 kg CO2e per unit of the inventory's currency, with source, year and region all null, and the
 * Scope 3 calculator applied it to Categories 8, 9, 10, 11, 13 and 14 through calcGenericSpend. The figure
 * went into total_scope3_tco2e and, through get_verifier_scope3, to a verifier.
 *
 * GHG Protocol Scope 3 chapter 11.1 requires, per category, a description of the methodology and the
 * source of the emission factors. Estimation is expected; an estimate with nothing citable behind it
 * cannot meet that, because there is no source to report. Five of the six categories also price what a
 * CUSTOMER, TENANT or FRANCHISEE did, so there was no spend of the company's for the factor to multiply:
 * the number was not merely unsourced, its input was the wrong quantity.
 *
 * Those six now carry `no_method` in lib/scope3/categoryMethods.ts, produce no figure, and are named as
 * missing from the total rather than being silently summed into it.
 *
 * ⚠️ DEFAULT_SPEND_EF ABOVE IS NOT THIS AND STAYS. It is the unmatched-sector fallback in
 * app/api/campaigns/[id]/scope3-cat1, which prices a real purchase from a real supplier against
 * EMISSION_FACTORS.spend and needs an answer when the sector is not in the table. Same number, different
 * question: that one is "this sector is unknown", this one was "every sector is the same".
 */
