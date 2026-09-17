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
  // Activity-based
  flight_short: 0.255,    // kg CO2e per km per passenger (< 3hrs)
  flight_long: 0.195,     // kg CO2e per km per passenger (> 3hrs)
  hotel: 31.0,            // kg CO2e per night
  rail: 0.041,            // kg CO2e per km
  car_petrol: 0.170,      // kg CO2e per km
  car_electric: 0.053,    // kg CO2e per km
  bus: 0.089,             // kg CO2e per km
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
 * The flat factor the Scope 3 calculator applies to every category priced by calcGenericSpend: one
 * number for every sector, in whatever currency the inventory is in.
 *
 * Named here, with its provenance, so a description of those figures is derived from the factor
 * rather than typed beside it. Same value as DEFAULT_SPEND_EF but a different role: that is a
 * fallback for an unmatched sector; this is applied to every sector unconditionally.
 */
export const GENERIC_SPEND_FACTOR: {
  kg_co2e_per_currency_unit: number
  source: string | null
  year: number | null
  region: string | null
} = {
  kg_co2e_per_currency_unit: 0.5,
  source: null,
  year: null,
  region: null,
}
