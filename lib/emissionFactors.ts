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
  waste_landfill: 0.467,  // kg CO2e per tonne
  waste_recycled: 0.021,  // kg CO2e per tonne
  electricity: 0.000233,  // kg CO2e per kWh (UK average)
}

// Default spend factor when a sector is unmatched (mirrors the calculator's
// `|| 0.5` fallback at the Cat 1 calculation site).
export const DEFAULT_SPEND_EF = 0.5
