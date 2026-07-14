// ─────────────────────────────────────────────────────────────────────────────
// lib/ghg/engine.ts — the GHG calculation engine.
//
// Extracted VERBATIM from app/dashboard/ghg/page.tsx (Phase 1). Pure computation:
// no React, no DB, no side effects. This is the single source of truth for GHG
// factor tables, GWP routing, coverage analysis, and per-location / per-inventory
// calculation. page.tsx and lib/ghg/monthlyEmissions.ts import from here.
//
// The one non-verbatim change: analyzeCoverage's inner `exclusiveEnd` is lifted to
// a module-level exported function (behaviour identical) so monthlyEmissions can
// share it instead of re-declaring a diverged copy.
// ─────────────────────────────────────────────────────────────────────────────

// AR4/AR5 do not distinguish fossil vs biogenic methane — both keys carry the single published GWP100.
// AR6 is the first IPCC set to split them (fossil 29.8 incl. oxidation; biogenic/non-fossil 27.0). N2O AR6 = 273.
const GWP = {
  AR4: { CO2: 1, CH4_fossil: 25,   CH4_biogenic: 25,   N2O: 298 },
  AR5: { CO2: 1, CH4_fossil: 28,   CH4_biogenic: 28,   N2O: 265 },
  AR6: { CO2: 1, CH4_fossil: 29.8, CH4_biogenic: 27.0, N2O: 273 },
}

// Refrigerant GWP-100 by IPCC set, so fugitive emissions follow the same GWP routing as
   // combustion gases. AR4 column preserves the platform's prior hardcoded values (no SB 253
   // regression). Blends (R-404A/410A/507A) are composition-derived — CONFIRM before assurance.
   const REFRIGERANT_GWP: Record<string, Record<GwpVersion, number>> = {
     r22:   { AR4: 1810, AR5: 1760, AR6: 1960 },
     r134a: { AR4: 1430, AR5: 1300, AR6: 1530 },
     r404a: { AR4: 3922, AR5: 3943, AR6: 4728 },
     r410a: { AR4: 2088, AR5: 1924, AR6: 2256 },
     r507:  { AR4: 3985, AR5: 3985, AR6: 4775 },
   }

   const EF = {
  natural_gas_mcf: { co2: 54.43956, ch4: 0.001026, n2o: 0.0001026 },
  natural_gas_therms: { co2: 5.306, ch4: 0.0001, n2o: 0.00001 },
  natural_gas_mmbtu: { co2: 53.06, ch4: 0.001, n2o: 0.0001 },
  propane_gallon: { co2: 5.61561, ch4: 0.000273, n2o: 0.0000546 },
  propane_litre: { co2: 1.48349, ch4: 0.0000721, n2o: 0.0000144 },
  diesel_gallon: { co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 },
  diesel_litre: { co2: 2.69627, ch4: 0.0001094, n2o: 0.0000219 },
  fuel_oil_gallon: { co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 },
  gasoline_gallon: { co2: 8.7775, ch4: 0.000375, n2o: 0.000075 },
  gasoline_litre: { co2: 2.31877, ch4: 0.0000991, n2o: 0.0000198 },
  diesel_mobile_gallon: { co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 },
  diesel_mobile_litre: { co2: 2.69627, ch4: 0.0001094, n2o: 0.0000219 },
  ammonia: 0,
  steam_mmbtu: 66.33,
}

// Canadian combustion factors — ECCC "Emission factors and reference values" v3.0 (Oct 2025).
// Stored as kg per activity unit (raw gas amounts; calcGas applies GWP). Source values are g/unit.
// Mirrors the US EF key structure so factor selection is a clean country swap, with two exceptions:
//   - natural_gas CO2 is per-province (see EF_CA_NG_CO2); the value below is a fallback only.
//   - therms/mmbtu have no ECCC energy-basis factor — CA natural gas uses mcf/m3 only (handled in UI).
// CH4/N2O use the Commercial/Industrial sector rows (Tables 2.x: ~0.037 CH4; 4.x Industrial for oils).
// Combustion factors are year-stable across ECCC 2023/24, 2025, 2026, so no year dimension is needed.
const EF_CA = {
  // Natural gas: per m3 in source (1921 g CO2/m3 Ontario fallback; per-province override via EF_CA_NG_CO2).
  // mcf conversion: 1 mcf = 28.3168 m3. CH4 0.037 g/m3, N2O 0.035 g/m3 (Res/Comm/Institutional).
  natural_gas_mcf: { co2: 54.396611, ch4: 0.001048, n2o: 0.000991 },
  natural_gas_m3: { co2: 1.921, ch4: 0.000037, n2o: 0.000035 },
  // Propane "All Other Uses" (Table 3.x): 1515 / 0.024 / 0.108 g/L. gallon = litre × 3.78541.
  propane_litre: { co2: 1.515, ch4: 0.000024, n2o: 0.000108 },
  propane_gallon: { co2: 5.734896, ch4: 0.000091, n2o: 0.000409 },
  // Diesel "Refineries and Others" (Table 4.x): 2681 / 0.078 / 0.022 g/L.
  diesel_litre: { co2: 2.681, ch4: 0.000078, n2o: 0.000022 },
  diesel_gallon: { co2: 10.148684, ch4: 0.000295, n2o: 0.000083 },
  // Light fuel oil "Industrial" (Table 4.x): 2753 / 0.006 / 0.031 g/L.
  fuel_oil_gallon: { co2: 10.421234, ch4: 0.000023, n2o: 0.000117 },
  // Motor gasoline (Table 4.x): 2307 / 0.100 / 0.02 g/L.
  gasoline_litre: { co2: 2.307, ch4: 0.0001, n2o: 0.00002 },
  gasoline_gallon: { co2: 8.732941, ch4: 0.000379, n2o: 0.000076 },
  diesel_mobile_litre: { co2: 2.681, ch4: 0.000078, n2o: 0.000022 },
  diesel_mobile_gallon: { co2: 10.148684, ch4: 0.000295, n2o: 0.000083 },
}

// Per-province natural gas CO2 (kg/m3) — ECCC Tables 1.1–1.3, "Marketable" column, year-stable.
// Used to override EF_CA.natural_gas_*.co2 for the location's province. CH4/N2O stay sector-based.
const EF_CA_NG_CO2_M3: Record<string, number> = {
  BC: 1.966, AB: 1.962, SK: 1.920, MB: 1.915, ON: 1.921, QC: 1.926,
  NB: 1.919, NS: 1.919, PE: 1.919, NL: 1.919, YT: 1.966, NT: 1.966, NU: 1.966,
}
const M3_PER_MCF = 1000 / 35.3147 // 28.3168

// UK combustion factors — DEFRA/DESNZ 2025 "Greenhouse gas reporting: conversion factors"
// (condensed set, Fuels tab). The mandatory basis for UK SECR reporting.
// STORAGE NOTE: stored as combined kg CO2e in the `co2` field with ch4:0, n2o:0, so calcGas
// reproduces DEFRA's PUBLISHED figure exactly (Option 2 — exact match for verifier reconciliation).
// DEFRA bakes in its own GWP basis, so UK fuels intentionally do NOT respond to the AR4/AR5 toggle.
// Per DEFRA guidance: natural gas uses the "Natural gas" row (kWh, gross CV — billing basis);
// diesel/petrol use the "average biofuel blend" rows (forecourt fuel). gallon values are a
// non-breaking fallback only (US gallon × litre value); UK wizard defaults to kWh/litres.
const EF_UK = {
  // Natural gas, kWh (Gross CV): 0.18296 kgCO2e/kWh (DEFRA Fuels row "Natural gas").
  natural_gas_kwh: { co2: 0.18296, ch4: 0, n2o: 0 },
  // Propane, litres: 1.54358 kgCO2e/L.
  propane_litre: { co2: 1.54358, ch4: 0, n2o: 0 },
  propane_gallon: { co2: 5.843083, ch4: 0, n2o: 0 },
  // Diesel (average biofuel blend), litres: 2.57082 kgCO2e/L.
  diesel_litre: { co2: 2.57082, ch4: 0, n2o: 0 },
  diesel_gallon: { co2: 9.731608, ch4: 0, n2o: 0 },
  diesel_mobile_litre: { co2: 2.57082, ch4: 0, n2o: 0 },
  diesel_mobile_gallon: { co2: 9.731608, ch4: 0, n2o: 0 },
  // Fuel oil (residual), litres 3.17492 → per US-gallon fallback.
  fuel_oil_gallon: { co2: 12.018374, ch4: 0, n2o: 0 },
  // Petrol (average biofuel blend), litres: 2.06916 kgCO2e/L.
  gasoline_litre: { co2: 2.06916, ch4: 0, n2o: 0 },
  gasoline_gallon: { co2: 7.832619, ch4: 0, n2o: 0 },
}

// EU combustion factors — IPCC 2006 Guidelines Vol.2 Tier-1 defaults (fossil, full oxidation),
// converted to per-unit via standard net calorific values and densities. CO2 from Ch.1 Table 1.4;
// CH4/N2O stationary defaults from Ch.2. Gas split is stored (calcGas applies AR4/AR5).
// BASIS NOTE: these are 100% fossil Tier-1 defaults — they reconcile with ECCC (±1%) and run
// ~5–11% above DEFRA's blended figures purely because DEFRA excludes biofuel content. This is the
// agreed verifier-defensible EU baseline (proceeding on internal recommendation, not verifier sign-off).
// Metric units are the EU norm: natural gas m3, liquids litres. gallon/mcf are non-breaking fallbacks.
const EF_EU = {
  // Natural gas, per m3 (CO2 56100 kg/TJ × ~36 MJ/m3 net): 2.0196 kg CO2/m3.
  natural_gas_m3: { co2: 2.0196, ch4: 0.000036, n2o: 0.0000036 },
  natural_gas_mcf: { co2: 57.188649, ch4: 0.001019406, n2o: 0.000101941 },
  // Propane/LPG (CO2 63100 kg/TJ, NCV 47.3, dens 0.510): 1.52216 kg CO2/L.
  propane_litre: { co2: 1.52216, ch4: 0.0000241, n2o: 0.0000024 },
  propane_gallon: { co2: 5.762, ch4: 0.000091228, n2o: 0.000009085 },
  // Diesel/gas oil (CO2 74100 kg/TJ, NCV 43.0, dens 0.844): 2.68924 kg CO2/L.
  diesel_litre: { co2: 2.68924, ch4: 0.0001089, n2o: 0.0000218 },
  diesel_gallon: { co2: 10.179876, ch4: 0.000412231, n2o: 0.000082522 },
  diesel_mobile_litre: { co2: 2.68924, ch4: 0.0001089, n2o: 0.0000218 },
  diesel_mobile_gallon: { co2: 10.179876, ch4: 0.000412231, n2o: 0.000082522 },
  // Residual fuel oil (CO2 77400 kg/TJ, NCV 40.4, dens 0.990): 3.09569 kg CO2/L → per US-gallon fallback.
  fuel_oil_gallon: { co2: 11.718456, ch4: 0.000454249, n2o: 0.00009085 },
  // Motor gasoline (CO2 69300 kg/TJ, NCV 44.3, dens 0.745): 2.28714 kg CO2/L.
  gasoline_litre: { co2: 2.28714, ch4: 0.000099, n2o: 0.0000198 },
  gasoline_gallon: { co2: 8.657763, ch4: 0.000374756, n2o: 0.000074951 },
}

// Australia combustion factors — DCCEEW National Greenhouse Accounts (NGA) Factors 2025 (AR5 basis).
// NGA publishes an energy-content factor (GJ/unit) and a combined Scope 1 EF per GJ; effective per-unit
// values are PRE-COMPUTED here (energy_content × combined-EF/GJ) and stored AS-IS in `co2` with ch4:0,
// n2o:0 — so calcGas reproduces the NGA-derived figure exactly and AU intentionally does NOT respond to
// the AR4/AR5/AR6 toggle (AR5 is already baked into the published combined EF). Metric units (m³, litres).
const EF_AU = {
  // Natural gas (NGA Table 4, ex-Table 39 energy content): 0.0393 GJ/m³ × 51.53 kgCO2e/GJ = 2.0251 → 2.025 kg/m³.
  natural_gas_m3: { co2: 2.025, ch4: 0, n2o: 0 },
  // Diesel oil (NGA Table 4/Table 1): 38.6 GJ/kL × 70.2 kgCO2e/GJ ÷ 1000 = 2.70972 → 2.710 kg/L.
  diesel_litre: { co2: 2.710, ch4: 0, n2o: 0 },
  diesel_mobile_litre: { co2: 2.710, ch4: 0, n2o: 0 },
  // Petrol / gasoline (NGA Table 4): 34.2 GJ/kL × 67.8 kgCO2e/GJ ÷ 1000 = 2.31876 → 2.319 kg/L.
  gasoline_litre: { co2: 2.319, ch4: 0, n2o: 0 },
  // LPG (NGA Table 4): 25.7 GJ/kL × 60.6 kgCO2e/GJ ÷ 1000 = 1.55742 → 1.557 kg/L (per-litre, matches engine input).
  propane_litre: { co2: 1.557, ch4: 0, n2o: 0 },
}

// New Zealand combustion factors — MfE "Measuring Emissions" 2026 (v2). Published per-unit directly, so
// stored AS-IS in `co2` with ch4:0, n2o:0 (like EF_UK/EF_AU) — reproduces the MfE figure exactly and does
// NOT respond to the AR toggle. Use-class selectable: Commercial (default) / Industrial only — the MfE
// stationary-combustion workbook has NO Residential row for these fuels (only coal), so Residential is
// intentionally absent (we do not invent factors). NG is per kWh; LPG is per kg (MfE publishes kg, engine
// gains a kg input path); liquids per litre. Petrol has NO stationary factor in MfE — it exists only as a
// Transport fuel, so gasoline_litre maps to Transport Regular Petrol (2.36143); Industrial has no petrol
// row and falls back to that same Regular transport value.
const EF_NZ = {
  commercial: {
    natural_gas_kwh: { co2: 0.19543, ch4: 0, n2o: 0 },   // MfE Stationary Combustion, Commercial
    diesel_litre: { co2: 2.6759, ch4: 0, n2o: 0 },
    diesel_mobile_litre: { co2: 2.6759, ch4: 0, n2o: 0 }, // stationary value reused for mobile (deliberate, for consistency)
    propane_kg: { co2: 2.97164, ch4: 0, n2o: 0 },        // LPG per kg (MfE)
    gasoline_litre: { co2: 2.36143, ch4: 0, n2o: 0 },    // Transport Regular Petrol (no stationary petrol row)
  },
  industrial: {
    natural_gas_kwh: { co2: 0.195067, ch4: 0, n2o: 0 },  // MfE Stationary Combustion, Industrial
    diesel_litre: { co2: 2.66873, ch4: 0, n2o: 0 },
    diesel_mobile_litre: { co2: 2.66873, ch4: 0, n2o: 0 },
    propane_kg: { co2: 2.96632, ch4: 0, n2o: 0 },
    gasoline_litre: { co2: 2.36143, ch4: 0, n2o: 0 },    // no Industrial petrol → Regular transport fallback
  },
}

const EF_SOURCES = {
  combustion: 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
  combustion_ca: 'ECCC (2025) Emission factors and reference values v3.0',
  combustion_uk: 'UK DEFRA/DESNZ (2025) GHG Conversion Factors for Company Reporting',
  combustion_eu: 'IPCC (2006) Guidelines Vol.2 — Tier 1 default combustion factors',
  combustion_au: 'DCCEEW NGA Factors 2025 (AR5)',
  combustion_nz: 'NZ MfE Measuring Emissions 2026 v2 (as-published basis — factors stored verbatim, no AR re-basing)',
  electricity: 'US EPA eGRID2023 (US) / ECCC v3.0 (CA) / DEFRA 2025 (UK) / EEA 2023 (EU) / DCCEEW NGA 2025 (AU) / NZ MfE 2026 (NZ)',
  residual_us: 'Green-e Residual Mix 2025 (2023 data, publ. 2026-01-29, CRS) — residual CO₂; eGRID2023 Rev2 (publ. 2025-06-12) CH₄/N₂O. Green-e factors out Green-e-certified voluntary sales (the only published US residual source per CRS).',
  residual_eu: 'AIB European Residual Mixes 2024 (publ. 2025-05-30, Grexel/AIB; Ecoinvent CO₂ inputs) — combined CO₂e, gCO₂/kWh.',
  gwp_ar4: 'IPCC AR4 (2007) — selectable alternate; aligns with CARB AB 32 / Mandatory Reporting Regulation, but not the default for any current framework',
  gwp_ar5: 'IPCC AR5 (2014) — GHG Protocol baseline; selectable alternate, not the default for any current framework',
  gwp_ar6: 'IPCC AR6 (2021) — applied by default across all frameworks (SB 253, CDP, ESRS E1, GRI 305, EcoVadis, IFRS S2)',
}

const GRID_EF: Record<string, Record<number, number>> = {
  // Canadian provinces / territories — ECCC "Emission factors and reference values" v3.0 (Oct 2025), NIR 1990-2023 consumption intensities
  ON: { 2024: 0.030, 2025: 0.038, 2026: 0.059 },
  QC: { 2024: 0.0017, 2025: 0.0017, 2026: 0.0019 },
  BC: { 2024: 0.015, 2025: 0.015, 2026: 0.018 },
  AB: { 2024: 0.540, 2025: 0.490, 2026: 0.438 },
  SK: { 2024: 0.730, 2025: 0.670, 2026: 0.631 },
  MB: { 2024: 0.0020, 2025: 0.0014, 2026: 0.0025 },
  NB: { 2024: 0.300, 2025: 0.350, 2026: 0.234 },
  NS: { 2024: 0.690, 2025: 0.700, 2026: 0.581 },
  PE: { 2024: 0.300, 2025: 0.350, 2026: 0.234 },
  NL: { 2024: 0.017, 2025: 0.018, 2026: 0.017 },
  YT: { 2024: 0.080, 2025: 0.070, 2026: 0.074 },
  NT: { 2024: 0.170, 2025: 0.190, 2026: 0.420 },
  NU: { 2024: 0.840, 2025: 0.820, 2026: 0.800 },
  // US states — EPA eGRID2023 state output rates (lb/MWh x 0.4536 / 1000)
  US_AK: { 2023: 0.3695 }, US_AL: { 2023: 0.3239 }, US_AR: { 2023: 0.4529 }, US_AZ: { 2023: 0.3126 },
  US_CA: { 2023: 0.1791 }, US_CO: { 2023: 0.4949 }, US_CT: { 2023: 0.2453 }, US_DC: { 2023: 0.1792 },
  US_DE: { 2023: 0.3194 }, US_FL: { 2023: 0.3579 }, US_GA: { 2023: 0.3254 }, US_HI: { 2023: 0.6326 },
  US_IA: { 2023: 0.2877 }, US_ID: { 2023: 0.1424 }, US_IL: { 2023: 0.2152 }, US_IN: { 2023: 0.6648 },
  US_KS: { 2023: 0.3326 }, US_KY: { 2023: 0.7924 }, US_LA: { 2023: 0.3461 }, US_MA: { 2023: 0.3765 },
  US_MD: { 2023: 0.2369 }, US_ME: { 2023: 0.1437 }, US_MI: { 2023: 0.3617 }, US_MN: { 2023: 0.3412 },
  US_MO: { 2023: 0.6598 }, US_MS: { 2023: 0.3757 }, US_MT: { 2023: 0.4826 }, US_NC: { 2023: 0.2841 },
  US_ND: { 2023: 0.5887 }, US_NE: { 2023: 0.4653 }, US_NH: { 2023: 0.1253 }, US_NJ: { 2023: 0.2133 },
  US_NM: { 2023: 0.3509 }, US_NV: { 2023: 0.2921 }, US_NY: { 2023: 0.2116 }, US_OH: { 2023: 0.4846 },
  US_OK: { 2023: 0.2943 }, US_OR: { 2023: 0.1656 }, US_PA: { 2023: 0.2939 }, US_RI: { 2023: 0.3810 },
  US_SC: { 2023: 0.2542 }, US_SD: { 2023: 0.1522 }, US_TN: { 2023: 0.2999 }, US_TX: { 2023: 0.3498 },
  US_UT: { 2023: 0.6447 }, US_VA: { 2023: 0.2448 }, US_VT: { 2023: 0.0237 }, US_WA: { 2023: 0.1209 },
  US_WI: { 2023: 0.5278 }, US_WV: { 2023: 0.8931 }, US_WY: { 2023: 0.8316 },
  US_AVG: { 2023: 0.3497 },
  // United Kingdom — DEFRA/DESNZ 2025, "UK electricity" generation factor (location-based, excl. T&D)
  UK: { 2025: 0.177 },
  // EU member states — EEA "GHG emission intensity of electricity generation, country level" (2023),
  // gCO2e/kWh ÷ 1000. Generation-based, location-based Scope 2. EU_AVG = EEA EU-27 aggregate.
  EU_AT: { 2023: 0.085 }, EU_BE: { 2023: 0.145 }, EU_BG: { 2023: 0.281 }, EU_HR: { 2023: 0.134 },
  EU_CY: { 2023: 0.585 }, EU_CZ: { 2023: 0.440 }, EU_DK: { 2023: 0.094 }, EU_EE: { 2023: 0.690 },
  EU_FI: { 2023: 0.040 }, EU_FR: { 2023: 0.050 }, EU_DE: { 2023: 0.329 }, EU_EL: { 2023: 0.258 },
  EU_HU: { 2023: 0.154 }, EU_IE: { 2023: 0.260 }, EU_IT: { 2023: 0.225 }, EU_LV: { 2023: 0.067 },
  EU_LT: { 2023: 0.124 }, EU_LU: { 2023: 0.056 }, EU_MT: { 2023: 0.342 }, EU_NL: { 2023: 0.263 },
  EU_PL: { 2023: 0.614 }, EU_PT: { 2023: 0.119 }, EU_RO: { 2023: 0.234 }, EU_SK: { 2023: 0.084 },
  EU_SI: { 2023: 0.176 }, EU_ES: { 2023: 0.158 }, EU_SE: { 2023: 0.008 },
  EU_AVG: { 2023: 0.210 },
  // Australia — DCCEEW National Greenhouse Accounts (NGA) Factors 2025, Table 1 Scope 2
  // (kg CO2e/kWh, AR5 basis). Single vintage. State grids; two auto-map decisions:
  //   ACT has no separate grid → shares NSW (mapping done in detectGridRegion).
  //   WA → SWIS (South West Interconnected System, the main WA grid); NT → DKIS
  //   (Darwin-Katherine Interconnected System, the main NT grid). Both mapped in detectGridRegion.
  AU_NSW: { 2025: 0.64 }, AU_VIC: { 2025: 0.78 }, AU_QLD: { 2025: 0.67 },
  AU_SA: { 2025: 0.22 }, AU_WA: { 2025: 0.50 }, AU_TAS: { 2025: 0.20 }, AU_NT: { 2025: 0.56 },
  AU_AVG: { 2025: 0.62 },
  // New Zealand — MfE "Measuring Emissions" 2026 (v2), national electricity (kg CO2e/kWh).
  // National grid (no sub-national split); year-keyed like the Canadian provinces.
  NZ: { 2023: 0.0766, 2024: 0.0994, 2025: 0.0787 },
}

// New Zealand electricity transmission & distribution (T&D) losses — MfE 2026 (v2), kg CO2e/kWh.
// This is a Scope 3 Category 3 factor, NOT Scope 2; year-keyed for nearest-year lookup like GRID_EF.
// Added as an optional, separately-labelled line only when a NZ location opts in (nz_td_losses).
const NZ_TD_LOSS: Record<number, number> = { 2025: 0.00596 }
// Nearest-year (≤ requested, else earliest) NZ T&D loss factor, kg CO2e/kWh. Scope 3 Cat 3.
// Shared by calcLocation and buildWorkings so the calc term and the workings row never diverge.
function nzTdLoss(year: number): number {
  const years = Object.keys(NZ_TD_LOSS).map(Number).sort((a, b) => a - b)
  let ty = years[0]; for (const y of years) { if (y <= year) ty = y }
  return NZ_TD_LOSS[ty]
}
// ── DEFERRED: Scope 3 Category 3 (upstream / T&D) ELECTRICITY factors — AU + NZ ──────────────
// NOT WIRED. The engine has no Scope 3 Category 3 electricity line today; only the NZ T&D losses
// above (nz_td_losses opt-in) are surfaced. These primary-source values are captured here so they
// aren't lost — transcribe into a real Cat 3 electricity line in a future step before using them.
//   Australia — DCCEEW NGA Factors 2025, Scope 3 (kg CO2e/kWh, AR5):
//     NSW+ACT 0.03, VIC 0.09, QLD 0.09, SA 0.04, WA (SWIS) 0.06, TAS 0.03, NT 0.09, National 0.07
//   New Zealand — MfE "Measuring Emissions" 2026 Scope 3 electricity table: transcribe the exact
//     value(s) from the workbook when wiring (deliberately not reproduced here to avoid inventing figures).
// ── RESIDUAL MIX (market-based Scope 2) ──────────────────────────────────────
// Market-based Scope 2 applies a RESIDUAL-MIX factor to UNCOVERED load (electricity
// not backed by a contractual instrument) — NOT the location-based grid average.
// Both sources are primary and dated:
//   EU — AIB "European Residual Mixes" 2024 (publ. 2025-05-30; Grexel/AIB; Ecoinvent CO2 inputs).
//        Published as COMBINED CO2e in gCO2/kWh (no separate CH4/N2O); helper divides by 1000 -> kg/kWh.
//        Austria (AT) runs a full-disclosure regime -> NO residual mix calculated -> null (NOT zero).
//   US — Green-e "2025 Residual Mix" (2023 data, publ. 2026-01-29, CRS) supplies residual CO2
//        ("Adjusted System Mix", lb/MWh); eGRID2023 Rev2 (publ. 2025-06-12) supplies CH4/N2O (lb/MWh).
//        Green-e strips ONLY Green-e-certified voluntary sales (the only published US residual source).
//        Stored with the gas split so CO2e recomputes via the selected GWP set (AR6/AR5/AR4).
// Year keys = DATA year (EU 2024, US 2023). Helper falls back to nearest available and stamps the vintage.

const RESIDUAL_EU: Record<string, Record<number, number | null>> = {
  EU_AT: { 2024: null },   // full-disclosure regime — residual mix not applicable (do NOT treat as 0)
  EU_BE: { 2024: 131.73 }, EU_BG: { 2024: 379.53 }, EU_HR: { 2024: 573.17 },
  EU_CY: { 2024: 613.08 }, EU_CZ: { 2024: 584.07 }, EU_DK: { 2024: 421.89 },
  EU_EE: { 2024: 611.96 }, EU_FI: { 2024: 405.59 }, EU_FR: { 2024: 23.52 },
  EU_DE: { 2024: 724.56 }, EU_EL: { 2024: 367.07 }, EU_HU: { 2024: 318.64 },
  EU_IE: { 2024: 365.61 }, EU_IT: { 2024: 441.20 }, EU_LV: { 2024: 504.22 },
  EU_LT: { 2024: 567.91 }, EU_LU: { 2024: 213.07 }, EU_MT: { 2024: 398.45 },
  EU_NL: { 2024: 382.47 }, EU_PL: { 2024: 808.30 }, EU_PT: { 2024: 501.76 },
  EU_RO: { 2024: 233.02 }, EU_SK: { 2024: 334.33 }, EU_SI: { 2024: 429.45 },
  EU_ES: { 2024: 292.20 }, EU_SE: { 2024: 85.52 },
}

// US residual: lb/MWh with gas split. co2 = Green-e Adjusted System Mix (residual);
// ch4/n2o = eGRID2023 Rev2 grid values (Green-e publishes no residual CH4/N2O — grid is the
// accepted composite input; its contribution is <0.3% of total). Keyed by eGRID SUBREGION.
type ResidualGas = { co2: number; ch4: number; n2o: number }
const RESIDUAL_US: Record<string, Record<number, ResidualGas>> = {
  AKGD: { 2023: { co2: 914.64,  ch4: 0.086, n2o: 0.012 } },
  AKMS: { 2023: { co2: 532.73,  ch4: 0.026, n2o: 0.004 } },
  AZNM: { 2023: { co2: 707.73,  ch4: 0.039, n2o: 0.005 } },
  CAMX: { 2023: { co2: 434.22,  ch4: 0.025, n2o: 0.003 } },
  ERCT: { 2023: { co2: 823.81,  ch4: 0.043, n2o: 0.006 } },
  FRCC: { 2023: { co2: 801.24,  ch4: 0.041, n2o: 0.005 } },
  HIMS: { 2023: { co2: 1133.29, ch4: 0.146, n2o: 0.022 } },
  HIOA: { 2023: { co2: 1498.95, ch4: 0.134, n2o: 0.021 } },
  MROE: { 2023: { co2: 1405.43, ch4: 0.116, n2o: 0.017 } },
  MROW: { 2023: { co2: 977.88,  ch4: 0.097, n2o: 0.014 } },
  NEWE: { 2023: { co2: 543.23,  ch4: 0.063, n2o: 0.008 } },
  NWPP: { 2023: { co2: 656.53,  ch4: 0.054, n2o: 0.008 } },
  NYCW: { 2023: { co2: 865.74,  ch4: 0.022, n2o: 0.002 } },
  NYLI: { 2023: { co2: 1189.33, ch4: 0.140, n2o: 0.018 } },
  NYUP: { 2023: { co2: 242.80,  ch4: 0.011, n2o: 0.001 } },
  PRMS: { 2023: { co2: 1548.53, ch4: 0.077, n2o: 0.012 } },
  RFCE: { 2023: { co2: 599.24,  ch4: 0.036, n2o: 0.005 } },
  RFCM: { 2023: { co2: 988.66,  ch4: 0.082, n2o: 0.012 } },
  RFCW: { 2023: { co2: 917.78,  ch4: 0.071, n2o: 0.010 } },
  RMPA: { 2023: { co2: 1065.86, ch4: 0.090, n2o: 0.013 } },
  SPNO: { 2023: { co2: 1016.82, ch4: 0.087, n2o: 0.012 } },
  SPSO: { 2023: { co2: 1020.77, ch4: 0.054, n2o: 0.008 } },
  SRMV: { 2023: { co2: 744.96,  ch4: 0.032, n2o: 0.004 } },
  SRMW: { 2023: { co2: 1287.87, ch4: 0.132, n2o: 0.019 } },
  SRSO: { 2023: { co2: 855.10,  ch4: 0.056, n2o: 0.008 } },
  SRTV: { 2023: { co2: 903.72,  ch4: 0.079, n2o: 0.011 } },
  SRVC: { 2023: { co2: 601.89,  ch4: 0.045, n2o: 0.006 } },
}

// A grid_region is "resolved" iff it's a real GRID_EF key. 'us_average' (the init default), '' and any
// unmapped string are UNRESOLVED; the deliberate US_AVG/EU_AVG/AU_AVG fallback keys and every AU_/NZ
// key ARE keys → resolved. Single source of truth for the grid-region gate (does not read the factor).
function isResolvedGridRegion(region: string): boolean {
  return Object.prototype.hasOwnProperty.call(GRID_EF, region)
}
function getGridFactor(region: string, year: number): { ef: number; usedRegion: string; usedYear: number } {
  const table = GRID_EF[region]
  if (!table) return { ef: GRID_EF.US_AVG[2023], usedRegion: 'US_AVG', usedYear: 2023 }
  const years = Object.keys(table).map(Number).sort((a, b) => a - b)
  if (table[year] !== undefined) return { ef: table[year], usedRegion: region, usedYear: year }
  let best = years[0]
  for (const y of years) { if (y <= year) best = y }
  return { ef: table[best], usedRegion: region, usedYear: best }
}
// Returns the market-based residual factor for a region, in kg CO2e/kWh, with provenance.
// applicable=false means no residual mix exists for this region (e.g. full-disclosure AT, or a
// region we don't cover) — caller MUST fall back to the location-based factor and stamp the note.
// US factors carry a gas split so CO2e responds to the GWP set; EU factors are published CO2e (GWP-fixed).
function getResidualFactor(
  region: string,
  year: number,
  gwpVersion: GwpVersion
): { ef: number; applicable: boolean; source: string; vintage: string; usedRegion: string; note: string } {
  // EU: published combined CO2e in gCO2/kWh. region is the EU_XX grid key.
  if (region.startsWith('EU_')) {
    const table = RESIDUAL_EU[region]
    if (table) {
      const years = Object.keys(table).map(Number).sort((a, b) => a - b)
      let y = years[0]; for (const yy of years) { if (yy <= year) y = yy }
      const val = table[y]
      if (val === null) {
        return { ef: 0, applicable: false, source: EF_SOURCES.residual_eu, vintage: `AIB ${y}`, usedRegion: region,
          note: 'Full-disclosure regime — no residual mix published; market-based falls back to location factor.' }
      }
      return { ef: val / 1000, applicable: true, source: EF_SOURCES.residual_eu, vintage: `AIB ${y}`, usedRegion: region,
        note: year !== y ? `AIB ${y} residual mix applied to ${year} inventory (latest available).` : '' }
    }
    return { ef: 0, applicable: false, source: EF_SOURCES.residual_eu, vintage: 'n/a', usedRegion: region,
      note: 'No published residual mix for this region; market-based falls back to location factor.' }
  }
  // US: Green-e residual CO2 + eGRID CH4/N2O, lb/MWh -> kg/kWh CO2e via selected GWP. region is the eGRID subregion.
  const table = RESIDUAL_US[region]
  if (table) {
    const years = Object.keys(table).map(Number).sort((a, b) => a - b)
    let y = years[0]; for (const yy of years) { if (yy <= year) y = yy }
    const g = table[y]
    const gwp = GWP[gwpVersion]
    const lbPerMwh = g.co2 + g.ch4 * gwp.CH4_fossil + g.n2o * gwp.N2O
    const ef = lbPerMwh * 0.453592 / 1000 // lb/MWh -> kg/kWh
    return { ef, applicable: true, source: EF_SOURCES.residual_us, vintage: `Green-e ${y + 2} [${y} data] + eGRID2023 Rev2`, usedRegion: region,
      note: year !== y ? `Green-e ${y} residual mix applied to ${year} inventory (latest available).` : '' }
  }
  return { ef: 0, applicable: false, source: EF_SOURCES.residual_us, vintage: 'n/a', usedRegion: region,
    note: 'No published residual mix for this subregion; market-based falls back to location factor.' }
}

const CA_PROVINCES = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU']
// eGRID subregions for the US market-based residual-mix picker (item 5). Code -> readable label.
// Users select their exact subregion via EPA Power Profiler (ZIP lookup) rather than inferring from state,
// because several states span multiple subregions (e.g. TX = ERCT + SPP; NY = NYCW/NYLI/NYUP).
const US_SUBREGIONS: Array<[string, string]> = [
  ['AKGD', 'AKGD — ASCC Alaska Grid'], ['AKMS', 'AKMS — ASCC Miscellaneous'],
  ['AZNM', 'AZNM — WECC Southwest'], ['CAMX', 'CAMX — WECC California'],
  ['ERCT', 'ERCT — ERCOT All'], ['FRCC', 'FRCC — FRCC All'],
  ['HIMS', 'HIMS — HICC Miscellaneous'], ['HIOA', 'HIOA — HICC Oahu'],
  ['MROE', 'MROE — MRO East'], ['MROW', 'MROW — MRO West'],
  ['NEWE', 'NEWE — NPCC New England'], ['NWPP', 'NWPP — WECC Northwest'],
  ['NYCW', 'NYCW — NPCC NYC/Westchester'], ['NYLI', 'NYLI — NPCC Long Island'],
  ['NYUP', 'NYUP — NPCC Upstate NY'], ['PRMS', 'PRMS — Puerto Rico Miscellaneous'],
  ['RFCE', 'RFCE — RFC East'], ['RFCM', 'RFCM — RFC Michigan'],
  ['RFCW', 'RFCW — RFC West'], ['RMPA', 'RMPA — WECC Rockies'],
  ['SPNO', 'SPNO — SPP North'], ['SPSO', 'SPSO — SPP South'],
  ['SRMV', 'SRMV — SERC Mississippi Valley'], ['SRMW', 'SRMW — SERC Midwest'],
  ['SRSO', 'SRSO — SERC South'], ['SRTV', 'SRTV — SERC Tennessee Valley'],
  ['SRVC', 'SRVC — SERC Virginia/Carolina'],
]
const US_STATES = ['AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY']
// Australian states/territories offered for grid selection. ACT shares the NSW grid factor, and
// WA/NT auto-map to their main interconnected grids (SWIS/DKIS) — both handled in detectGridRegion.
const AU_STATES = ['NSW','ACT','VIC','QLD','SA','WA','TAS','NT']
// EU-27 ISO codes (EL = Greece per EEA/EU convention). Maps country -> EU_XX grid key.
const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','EL','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']
// EU-27 dropdown options: [ISO, label with flag], alphabetical by country name.
const EU_COUNTRY_OPTIONS: Array<[string, string]> = [
  ['AT','🇦🇹 Austria'],['BE','🇧🇪 Belgium'],['BG','🇧🇬 Bulgaria'],['HR','🇭🇷 Croatia'],
  ['CY','🇨🇾 Cyprus'],['CZ','🇨🇿 Czechia'],['DK','🇩🇰 Denmark'],['EE','🇪🇪 Estonia'],
  ['FI','🇫🇮 Finland'],['FR','🇫🇷 France'],['DE','🇩🇪 Germany'],['EL','🇬🇷 Greece'],
  ['HU','🇭🇺 Hungary'],['IE','🇮🇪 Ireland'],['IT','🇮🇹 Italy'],['LV','🇱🇻 Latvia'],
  ['LT','🇱🇹 Lithuania'],['LU','🇱🇺 Luxembourg'],['MT','🇲🇹 Malta'],['NL','🇳🇱 Netherlands'],
  ['PL','🇵🇱 Poland'],['PT','🇵🇹 Portugal'],['RO','🇷🇴 Romania'],['SK','🇸🇰 Slovakia'],
  ['SI','🇸🇮 Slovenia'],['ES','🇪🇸 Spain'],['SE','🇸🇪 Sweden'],
]
function detectGridRegion(code: string, country?: string): string {
  const c = (code || '').toUpperCase().trim()
  const ctry = (country || '').toUpperCase().trim()
  // Australia first — its NT/WA codes collide with a CA province / US state, so gate on country.
  // ACT shares the NSW grid; WA→AU_WA (SWIS main); NT→AU_NT (DKIS main); else AU_<state>.
  if (ctry === 'AU' || ctry === 'AUSTRALIA') {
    if (c === 'ACT' || c === 'NSW') return 'AU_NSW'
    if (AU_STATES.includes(c)) return 'AU_' + c
    // Blank / unknown AU state → UNRESOLVED (''), NOT 'AU_AVG' — same rationale as the US fallback
    // below: a real AU_AVG key would read as resolved and slip past the gate. AU_AVG stays a
    // deliberate/calc-only key, never a silent blank-state result.
    return ''
  }
  if ((ctry === 'CA' || ctry === 'CANADA') && CA_PROVINCES.includes(c)) return c
  if (CA_PROVINCES.includes(c) && !US_STATES.includes(c)) return c
  if (US_STATES.includes(c)) return 'US_' + c
  // Blank / unknown state → UNRESOLVED ('' ), NOT 'US_AVG'. A real US_AVG key would read as resolved
  // and slip past the gate; '' lets the gate catch a US location with no state (like CA-no-province).
  // US_AVG remains a deliberate calc-time fallback inside getGridFactor; no UI offers it as a choice.
  return ''
}
// Country-level grid region for countries whose grid factor is national (UK, EU members).
// Returns the GRID_EF key, or '' if the country isn't one we map at country level.
function gridRegionForCountry(country: string): string {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'GB' || ctry === 'UK') return 'UK'
  if (ctry === 'NZ' || ctry === 'NEW ZEALAND') return 'NZ'
  if (EU_COUNTRIES.includes(ctry)) return 'EU_' + ctry
  return ''
}
const GRID_REGIONS_CA = CA_PROVINCES.map(p => { const y = GRID_EF[p]; const latest = Math.max(...Object.keys(y).map(Number)); return { value: p, label: p, ef: y[latest] } })
const GRID_REGIONS_US = US_STATES.map(s => { const y = GRID_EF['US_' + s]; const latest = Math.max(...Object.keys(y).map(Number)); return { value: 'US_' + s, label: s, ef: y[latest] } })

const FRAMEWORKS = [
  {
    id: 'sb253', name: 'SB 253', full: 'California SB 253 — CARB', color: '#B91C1C', bg: '#FCEBEB',
    gwp: 'AR6', deadline: 'November 10, 2026',
    desc: 'Scope 1 + 2 disclosure for California-nexus companies with $1B+ global revenue',
    requires: ['revenue_millions', 'california_nexus'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'cdp', name: 'CDP', full: 'CDP Climate — C6/C7/C11', color: '#0C447C', bg: '#E6F1FB',
    gwp: 'AR6', deadline: 'Annual — July',
    desc: 'Full CDP Climate questionnaire Scope 1 + 2 disclosure with prior year comparison',
    requires: ['prior_year_s1', 'prior_year_s2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'esrs', name: 'ESRS E1', full: 'ESRS E1 — EU CSRD (Scope 3 mandatory)', color: '#7425e3', bg: '#EDE9FE',
    gwp: 'AR6', deadline: 'FY2024 (large EU companies)',
    desc: 'Full ESRS E1 disclosure — location AND market-based Scope 2, biogenic, by gas',
    requires: ['market_based_s2', 'renewable_energy_kwh', 'biogenic_co2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'gri', name: 'GRI 305', full: 'GRI 305 — Emissions', color: '#0F6E56', bg: '#E1F5EE',
    gwp: 'AR6', deadline: 'Annual',
    desc: 'GRI 305-1, 305-2, 305-3 disclosure — by gas (CO₂, CH₄, N₂O, HFCs separately)',
    requires: ['biogenic_co2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'ecovadis', name: 'EcoVadis', full: 'EcoVadis — E1 Module', color: '#ba7517', bg: '#FEF3E2',
    gwp: 'AR6', deadline: 'Annual — assessment cycle',
    desc: 'Simplified Scope 1 + 2 total with revenue and employee intensity ratios',
    requires: ['employee_count'],
    intensity_denominator: 'both',
  },
  {
    id: 'ifrs', name: 'IFRS S2', full: 'IFRS S2 — Climate Disclosures', color: '#555553', bg: '#f8f7f5',
    gwp: 'AR6', deadline: 'Jurisdiction dependent',
    desc: 'GHG inventory component of IFRS S2 — feeds into physical and transition risk disclosure',
    requires: ['revenue_millions'],
    intensity_denominator: 'revenue',
  },
]

type ConciergeStatus = 'extracted' | 'confirmed' | 'rejected' | 'needs_manual_review'

interface ExtractedProposal {
  fuelType: string
  rawValue: number | null
  rawUnit: string | null
  value: number | null            // canonical value, after lib conversion
  unit: string | null             // canonical unit
  conversionNote?: string
  periodStart: string | null      // ISO yyyy-mm-dd
  periodEnd: string | null
  periodConfidence?: 'high' | 'medium' | 'low' | null
  confidence: 'high' | 'medium' | 'low'
  sourceQuote: string | null
  notes: string | null
  status: ConciergeStatus
}

interface SourceDoc {
  id: string
  file_name: string
  document_type: string
  uploaded_at: string
  file_path: string
  extracted?: ExtractedProposal[]   // concierge proposals (one per fuel read from this doc)
}

interface Location {
 id: string; name: string; country: string; state?: string; province?: string; region?: string
  has_natural_gas: boolean; natural_gas_amount: number; natural_gas_unit: 'mcf' | 'therms' | 'mmbtu' | 'm3' | 'kwh'
  has_propane: boolean; propane_amount: number; propane_unit: 'gallons' | 'litres' | 'kg'
  has_diesel_stationary: boolean; diesel_stationary_amount: number; diesel_stationary_unit: 'gallons' | 'litres'
  has_fuel_oil: boolean; fuel_oil_gallons: number
  has_mobile: boolean; gasoline_amount: number; gasoline_unit: 'gallons' | 'litres'; diesel_mobile_amount: number; diesel_mobile_unit: 'gallons' | 'litres'
  uses_ammonia: boolean; has_hfc_refrigerants: boolean; refrigerant_type: string; refrigerant_purchased_kg: number
  electricity_kwh: number; grid_region: string; renewable_electricity_kwh: number; residual_region: string
  has_purchased_steam: boolean; purchased_steam_mmbtu: number
  biogenic_co2_mt: number
  // New Zealand-only (optional, default-safe): use-class picks the EF_NZ variant (Commercial default /
  // Industrial — no Residential in MfE data); nz_td_losses toggles the optional Scope 3 Cat 3 T&D line.
  nz_use_class?: 'commercial' | 'industrial'
  nz_td_losses?: boolean
  source_docs: SourceDoc[]
  // Per-stream "this site has no such supply" attestations. Absent (undefined/missing entry) means
  // NOBODY has answered → the stream is UNDECLARED and blocks export. See findUndeclaredStreams.
  stream_attestations?: StreamAttestation[]
}

// Derive the reporting period from a reporting year + fiscal year-end MONTH (1-12).
// 12 (December) -> Jan 1 – Dec 31 of the reporting year (calendar year, the default).
// Any other month -> the 12 months ENDING on the last day of that month in the reporting year.
// The last day is computed leap-year-aware (e.g. a February end resolves to 28 or 29 correctly).
const parseLocalDate = (s: string): Date => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }
function periodFromYearAndEnd(reportingYear: number, fiscalYearEndMonth: number = 12): { start: Date; end: Date; label: string } {
  const m = (fiscalYearEndMonth >= 1 && fiscalYearEndMonth <= 12) ? fiscalYearEndMonth : 12
  const end = new Date(reportingYear, m, 0) // day 0 of the next month = last day of month m (leap-aware)
  const start = new Date(end)
  start.setDate(start.getDate() + 1)
  start.setFullYear(start.getFullYear() - 1)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}
// ── Concierge coverage analysis (spec: docs/pricing-and-concierge-spec-v4.md addendum) ──
// Pure function. Given a fuel's CONFIRMED proposals (each carrying a billing period)
// and the reporting-year window, classifies data completeness so the wizard can
// surface gaps/overlaps/straddles and never silently produce an incomplete annual total.
//
// METHOD (documented for verifiers): coverage, gaps, and overlaps are assessed at DAY
// level. Each bill period is normalized to a half-open [start, end) interval — utility
// bills arrive in two end-date conventions (last-day-of-month and first-of-next-month);
// both are canonicalized so coverage is convention-independent. A month is reported as
// covered only if every in-window day of it is covered (a partial month is a gap, never
// silently claimed). Straddle proration is computed at day level. The basis is recorded
// in buildWorkings so every estimate is traceable.
interface CoveragePeriod { docId: string; pi: number; start: Date; end: Date }
interface CoverageResult {
  status: 'full' | 'gap' | 'overlap' | 'straddle' | 'none'
  // EVERY condition that holds, not just the one the scalar `status` collapsed to. `status` is a scalar
  // and the conditions are NOT mutually exclusive — a fuel with BOTH a gap and an overlap used to report
  // only 'overlap', so acknowledging the duplicate slipped the gap past the gate (the D1 masking bug).
  // The gate iterates `issues` and requires a resolution for EACH. `status` is kept for display/callsites.
  issues: Array<'gap' | 'overlap' | 'straddle'>
  monthsCovered: number
  coverageRatio: number               // monthsCovered / 12
  pctEstimated: number                // (12 - monthsCovered)/12, for disclosure
  gaps: { label: string }[]           // uncovered months, human-readable
  overlaps: { a: CoveragePeriod; b: CoveragePeriod }[]
  straddles: { p: CoveragePeriod; daysInYear: number; totalDays: number; pctInYear: number }[]
  outOfWindow: { label: string }[]    // bills fully outside the reporting year (not counted)
  summary: string
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(y: number, m0: number): string {
  return new Date(y, m0, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1 // inclusive
}

// Canonicalize a bill's printed end date to a half-open exclusive boundary (the first
// UNCOVERED day). Bills print their end one of two ways:
//   "Dec 20 – Jan 19"  → Jan 19 is the last COVERED day (inclusive; the common meter-read cycle)
//   "Dec 01 – Jan 01"  → Jan 01 is the first UNCOVERED day (exclusive; first-of-next-month)
// The 1st of a month is the ONLY date that reads as exclusive; every other end date is the
// last covered day and must be pushed +1 to get the exclusive boundary. (The old heuristic
// keyed on "last day of month", which silently dropped a day at every mid-month boundary.)
// Shared by analyzeCoverage AND lib/ghg/monthlyEmissions — one definition, no diverged copy.
function exclusiveEnd(end: Date): Date {
  return end.getDate() === 1
    ? new Date(end.getFullYear(), end.getMonth(), 1)
    : new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
}

function analyzeCoverage(periods: CoveragePeriod[], winStart: Date, winEnd: Date): CoverageResult {
  if (periods.length === 0) {
    return { status: 'none', issues: [], monthsCovered: 0, coverageRatio: 0, pctEstimated: 0, gaps: [], overlaps: [], straddles: [], outOfWindow: [], summary: 'No dated bills yet.' }
  }
  const DAY = 86400000
  // exclusiveEnd (canonicalizes both bill-end conventions to a half-open boundary)
  // is now a module-level function — the documented basis for the day-continuity check.

  // Reporting-year months (month-shaped reporting the strip/export expect).
  const reqMonths: string[] = []
  {
    const d = new Date(winStart.getFullYear(), winStart.getMonth(), 1)
    const last = new Date(winEnd.getFullYear(), winEnd.getMonth(), 1)
    while (d <= last) { reqMonths.push(monthKey(d)); d.setMonth(d.getMonth() + 1) }
  }

  // Canonical half-open reporting window: winEnd is inclusive, so the exclusive boundary is winEnd + 1
  // day. This is the SAME boundary the day-map below uses — straddle detection and coverage can never
  // disagree (that disagreement, via the raw-end test, was the phantom-straddle bug).
  const winS = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate())
  const winEexcl = new Date(winEnd.getFullYear(), winEnd.getMonth(), winEnd.getDate() + 1)
  const dayCount = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / DAY) // half-open, NOT the inclusive daysBetween

  // Straddles: a bill whose CANONICAL [start, exclusiveEnd(end)) interval has days BOTH inside and
  // outside the window. Out-of-window: no in-window days. Using exclusiveEnd (which handles both
  // bill-end conventions) means a first-of-next-month end like 2024-12-01→2025-01-01 is seen as
  // covering December ONLY — no phantom straddle. daysInYear/totalDays are half-open, consistent
  // with the day-map. No materiality threshold: once the convention is right, every straddle is real.
  const straddles: CoverageResult['straddles'] = []
  const outOfWindow: CoverageResult['outOfWindow'] = []
  const fmtPeriod = (p: CoveragePeriod) =>
    `${p.start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  periods.forEach(p => {
    const pStart = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate())
    const pEndExcl = exclusiveEnd(p.end)
    const totalDays = dayCount(pStart, pEndExcl)
    const ovStart = pStart > winS ? pStart : winS
    const ovEndExcl = pEndExcl < winEexcl ? pEndExcl : winEexcl
    const daysInYear = Math.max(0, dayCount(ovStart, ovEndExcl))
    if (daysInYear <= 0) {
      // No in-window days → fully outside the reporting year.
      outOfWindow.push({ label: fmtPeriod(p) })
    } else if (daysInYear < totalDays) {
      // Part in, part out → a real straddle.
      straddles.push({ p, daysInYear, totalDays, pctInYear: Math.round((daysInYear / totalDays) * 1000) / 10 })
    }
    // daysInYear === totalDays → fully in-window → neither straddle nor out-of-window.
  })

  // ── DAY-LEVEL CONTINUITY (verifier-defensible primitive) ──
  // Build a per-day coverage count across the window; a day is covered when ≥1 bill's
  // canonical [start, exclusiveEnd) spans it. Gaps = uncovered days; overlaps = days
  // covered by ≥2 bills. Month-level results below are derived from this day map, so
  // the calendar-vs-billing-cycle artifact never produces false gaps or false overlaps.
  // (winS / winEexcl are defined above, shared with straddle detection.)
  const totalDaysInWin = Math.round((winEexcl.getTime() - winS.getTime()) / DAY)
  const idxOf = (d: Date): number =>
    Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - winS.getTime()) / DAY)
  const coverCount: number[] = new Array(Math.max(0, totalDaysInWin)).fill(0)
  periods.forEach(p => {
    let i = Math.max(0, idxOf(p.start))
    const jExcl = Math.min(totalDaysInWin, idxOf(exclusiveEnd(p.end)))
    for (; i < jExcl; i++) coverCount[i]++
  })

  // Overlap pairs: any two bills sharing ≥1 in-window day.
  const overlapPairs: CoverageResult['overlaps'] = []
  for (let a = 0; a < periods.length; a++) {
    for (let b = a + 1; b < periods.length; b++) {
      const aS = Math.max(0, idxOf(periods[a].start)), aE = Math.min(totalDaysInWin, idxOf(exclusiveEnd(periods[a].end)))
      const bS = Math.max(0, idxOf(periods[b].start)), bE = Math.min(totalDaysInWin, idxOf(exclusiveEnd(periods[b].end)))
      if (Math.max(aS, bS) < Math.min(aE, bE)) overlapPairs.push({ a: periods[a], b: periods[b] })
    }
  }

  // Month is COVERED iff every in-window day of it is covered (conservative: a partial
  // month is a gap, never silently claimed — fails toward honest gaps, not false coverage).
  const covered: string[] = []
  const gaps: CoverageResult['gaps'] = []
  reqMonths.forEach(mk => {
    const [y, m] = mk.split('-').map(Number)
    const lo = Math.max(0, idxOf(new Date(y, m - 1, 1)))
    const hi = Math.min(totalDaysInWin, idxOf(new Date(y, m, 1)))
    let allCovered = hi > lo
    for (let i = lo; i < hi; i++) if (coverCount[i] === 0) { allCovered = false; break }
    if (allCovered) covered.push(mk)
    else gaps.push({ label: monthLabel(y, m - 1) })
  })

  const monthsCovered = covered.length
  const total = reqMonths.length || 12
  // issues: ALL conditions present (a bill can straddle AND leave a gap AND overlap another). status
  // is the scalar display value, kept for existing callsites; the gate reads `issues`, not `status`.
  const issues: CoverageResult['issues'] = []
  if (gaps.length > 0) issues.push('gap')
  if (overlapPairs.length > 0) issues.push('overlap')
  if (straddles.length > 0) issues.push('straddle')
  let status: CoverageResult['status'] = 'full'
  if (gaps.length > 0) status = 'gap'
  if (overlapPairs.length > 0) status = 'overlap'
  if (straddles.length > 0 && gaps.length === 0 && overlapPairs.length === 0) status = 'straddle'
  // Summary lists EVERY issue present, so the display never advertises just one of several problems.
  const summaryParts: string[] = []
  if (issues.includes('gap')) summaryParts.push(`missing ${gaps.map(g => g.label).join(', ')}`)
  if (issues.includes('overlap')) summaryParts.push(`${overlapPairs.length} month(s) covered by more than one bill`)
  if (issues.includes('straddle')) summaryParts.push(`${straddles.length} bill(s) cross the reporting-year boundary`)
  return {
    status,
    issues,
    monthsCovered,
    coverageRatio: monthsCovered / total,
    pctEstimated: Math.round(((total - monthsCovered) / total) * 1000) / 10,
    gaps,
    overlaps: overlapPairs,
    straddles,
    outOfWindow,
    summary: status === 'full'
      ? `Full year covered (${monthsCovered}/${total} months).`
      : `${monthsCovered}/${total} months covered — ${summaryParts.join('; ')}.`,
  }
}

// A documented coverage resolution (gap/overlap/straddle), stored on the inventory.
// Raw confirmed proposals stay untouched; this is the transparent, additive layer
// the verifier sees (workings records method + basis). Spec: coverage-check addendum.
interface CoverageResolution {
  locId: string
  fuelType: string
  kind: 'extrapolate' | 'duplicate' | 'straddle'
  // extrapolate: gross up partial-year data by coverage ratio
  monthsCovered?: number          // for extrapolate: e.g. 11
  pctEstimated?: number           // for extrapolate: e.g. 8.3
  // straddle: day-level proration choice
  straddleChoice?: 'this_year' | 'next_year' | 'prorate'
  daysInYear?: number
  totalDays?: number
  // duplicate: which doc/proposal was dropped
  droppedDocId?: string
  note: string                    // human-readable, flows into workings
  acknowledgedAt: string          // ISO timestamp
}
interface Inventory {
  company_name: string; company_id?: string | null; reporting_year: number; revenue_millions: number
  employee_count: number; boundary_approach: string
  california_nexus: boolean
  fiscal_year_end_month: number
  prior_year_s1: number; prior_year_s2: number
  selected_frameworks: string[]
locations: Location[]
  coverage_resolutions?: CoverageResolution[]
}

const emptyLocation = (id: string, name: string, state = ''): Location => ({
  id, name, country: 'US', state: '', province: '', region: '',
  has_natural_gas: false, natural_gas_amount: 0, natural_gas_unit: 'mcf',
  has_propane: false, propane_amount: 0, propane_unit: 'gallons',
  has_diesel_stationary: false, diesel_stationary_amount: 0, diesel_stationary_unit: 'gallons',
  has_fuel_oil: false, fuel_oil_gallons: 0,
  has_mobile: false, gasoline_amount: 0, gasoline_unit: 'gallons', diesel_mobile_amount: 0, diesel_mobile_unit: 'gallons',
  uses_ammonia: false, has_hfc_refrigerants: false, refrigerant_type: 'r410a', refrigerant_purchased_kg: 0,
  electricity_kwh: 0, grid_region: 'us_average', renewable_electricity_kwh: 0, residual_region: '',
  has_purchased_steam: false, purchased_steam_mmbtu: 0,
  biogenic_co2_mt: 0,
  nz_use_class: 'commercial', nz_td_losses: false,
  source_docs: [],
})

// Natural gas units offered per country. CA uses mcf/m3 only (ECCC has no energy-basis
// factor for therms/mmbtu). UK uses kWh only (DEFRA's billing basis — how UK gas bills read).
// US keeps all three. Returned as [value, label] pairs.
function ngUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'CA') return [['m3', 'm³'], ['mcf', 'Mcf']]
  if (ctry === 'GB' || ctry === 'UK') return [['kwh', 'kWh']]
  if (ctry === 'NZ') return [['kwh', 'kWh']]
  if (ctry === 'AU') return [['m3', 'm³']]
  if (EU_COUNTRIES.includes(ctry)) return [['m3', 'm³']]
  return [['mcf', 'Mcf'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']]
}
// Snap a natural gas unit to a valid one for the given country (used when country changes).
function normalizeNgUnit(country: string, unit: string): string {
  const valid = ngUnitOptions(country).map(([v]) => v)
  return valid.includes(unit) ? unit : valid[0]
}
// Liquid-fuel units offered per country. Metric countries (CA, UK, EU) get litres only —
// gallons is never offered, so a verifier can't find US units on a metric inventory.
function liquidUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  const metric = ctry === 'CA' || ctry === 'GB' || ctry === 'UK' || ctry === 'AU' || ctry === 'NZ' || EU_COUNTRIES.includes(ctry)
  return metric ? [['litres', 'Litres']] : [['gallons', 'US gallons'], ['litres', 'Litres']]
}
// Propane/LPG units are separate from other liquids: NZ publishes LPG per kg (MfE), so NZ offers kg
// only; other metric countries (CA/UK/EU/AU) use litres; US/other keep gallons+litres.
function propaneUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'NZ') return [['kg', 'kg']]
  const metric = ctry === 'CA' || ctry === 'GB' || ctry === 'UK' || ctry === 'AU' || EU_COUNTRIES.includes(ctry)
  return metric ? [['litres', 'Litres']] : [['gallons', 'US gallons'], ['litres', 'Litres']]
}


function validateElectricity(kwh: number): string | null {
  if (kwh > 0 && kwh < 1000) return "⚠ This seems low for a commercial location — please confirm this is the annual total, not a single month."
  if (kwh > 50000000) return "⚠ This is unusually high — please confirm the unit is kWh, not MWh."
  return null
}
function validateNaturalGas(amount: number, unit: string): string | null {
  if (amount > 0 && unit === "mcf" && amount < 10) return "⚠ This seems low — please confirm this is the annual total."
  if (unit === "mcf" && amount > 500000) return "⚠ This seems high — please double-check your bills."
  return null
}
function validateCompleteness(loc: Location): string[] {
  const warnings: string[] = []
  if (loc.electricity_kwh === 0) warnings.push("No electricity entered — most commercial locations use grid electricity.")
  return warnings
}

// Country-aware combustion factor selection.
// US -> EPA EF[key] (unchanged). CA -> ECCC EF_CA[key], with per-province NG CO2 override.
// GB/UK -> DEFRA EF_UK[key] (national). EU member -> IPCC EF_EU[key] (national Tier-1 defaults).
// Falls back to EF[key] if a country key is missing, so a location can never silently zero out.
// Build the propane/LPG EF key from the stored unit. NZ adds a per-kg path (propane_kg); all other
// jurisdictions use gallon/litre. Kept in one place so calc + workings + review stay in lock-step.
function propaneEfKey(unit: string): 'propane_gallon' | 'propane_litre' | 'propane_kg' {
  return unit === 'gallons' ? 'propane_gallon' : unit === 'kg' ? 'propane_kg' : 'propane_litre'
}
function pickEF(loc: Location, key: keyof typeof EF | keyof typeof EF_CA | keyof typeof EF_UK | keyof typeof EF_EU | keyof typeof EF_AU | keyof (typeof EF_NZ)['commercial']): { co2: number; ch4: number; n2o: number } {
  const ctry = (loc.country || '').toUpperCase().trim()
  if (ctry === 'GB' || ctry === 'UK') {
    const ukBase = (EF_UK as any)[key] as { co2: number; ch4: number; n2o: number } | undefined
    return ukBase ? { ...ukBase } : ({ ...((EF as any)[key] as { co2: number; ch4: number; n2o: number }) })
  }
  if (EU_COUNTRIES.includes(ctry)) {
    const euBase = (EF_EU as any)[key] as { co2: number; ch4: number; n2o: number } | undefined
    return euBase ? { ...euBase } : ({ ...((EF as any)[key] as { co2: number; ch4: number; n2o: number }) })
  }
  // Australia: EF_AU per-unit table; missing keys (e.g. fuel oil) fall back to US EF (UK/EU parity).
  if (ctry === 'AU') {
    const auBase = (EF_AU as any)[key] as { co2: number; ch4: number; n2o: number } | undefined
    return auBase ? { ...auBase } : ({ ...((EF as any)[key] as { co2: number; ch4: number; n2o: number }) })
  }
  // New Zealand: EF_NZ is use-class keyed (commercial default / industrial); missing keys fall back to US EF.
  if (ctry === 'NZ') {
    const nzTable = (EF_NZ as any)[loc.nz_use_class ?? 'commercial']
    const nzBase = nzTable?.[key] as { co2: number; ch4: number; n2o: number } | undefined
    return nzBase ? { ...nzBase } : ({ ...((EF as any)[key] as { co2: number; ch4: number; n2o: number }) })
  }
  if (ctry !== 'CA') return (EF as any)[key] as { co2: number; ch4: number; n2o: number }
  const caBase = (EF_CA as any)[key] as { co2: number; ch4: number; n2o: number } | undefined
  const ef = caBase ? { ...caBase } : ({ ...((EF as any)[key] as { co2: number; ch4: number; n2o: number }) })
  // Per-province natural gas CO2 override (CH4/N2O remain sector-based).
  if (key === 'natural_gas_mcf' || key === 'natural_gas_m3') {
    const prov = (loc.grid_region || loc.province || '').toUpperCase().trim()
    const provCo2M3 = EF_CA_NG_CO2_M3[prov]
    if (provCo2M3 !== undefined) {
      ef.co2 = key === 'natural_gas_mcf' ? provCo2M3 * M3_PER_MCF : provCo2M3
    }
  }
  return ef
}

// Source citation for a combustion row, country-aware (ECCC for CA, DEFRA for GB/UK, IPCC for EU, EPA otherwise).
function combustionSource(loc: Location): string {
  const ctry = (loc.country || '').toUpperCase().trim()
  if (ctry === 'CA') return EF_SOURCES.combustion_ca
  if (ctry === 'GB' || ctry === 'UK') return EF_SOURCES.combustion_uk
  if (ctry === 'AU') return EF_SOURCES.combustion_au
  if (ctry === 'NZ') return EF_SOURCES.combustion_nz
  if (EU_COUNTRIES.includes(ctry)) return EF_SOURCES.combustion_eu
  return EF_SOURCES.combustion
}

type GwpVersion = 'AR4' | 'AR5' | 'AR6'

function calcGas(ef: { co2: number; ch4: number; n2o: number }, amount: number, gwpVersion: GwpVersion, biogenic = false) {
  const gwp = GWP[gwpVersion]
  const ch4Gwp = biogenic ? gwp.CH4_biogenic : gwp.CH4_fossil
  return {
    co2: amount * ef.co2 / 1000,
    ch4: amount * ef.ch4 * ch4Gwp / 1000,
    n2o: amount * ef.n2o * gwp.N2O / 1000,
    total: amount * (ef.co2 + ef.ch4 * ch4Gwp + ef.n2o * gwp.N2O) / 1000,
  }
}

function calcLocation(loc: Location, gwpVersion: GwpVersion = 'AR6', year: number = 2024) {
  let s1_stationary = 0, s1_mobile = 0
  const gases = { co2: 0, ch4: 0, n2o: 0 }
  if (loc.has_natural_gas && loc.natural_gas_amount > 0) {
    const ef = pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF)
    const g = calcGas(ef, loc.natural_gas_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_propane && loc.propane_amount > 0) {
    const ef = pickEF(loc, propaneEfKey(loc.propane_unit) as keyof typeof EF)
    const g = calcGas(ef, loc.propane_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0) {
    const ef = pickEF(loc, `diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
    const g = calcGas(ef, loc.diesel_stationary_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_fuel_oil && loc.fuel_oil_gallons > 0) {
    const g = calcGas(pickEF(loc, 'fuel_oil_gallon'), loc.fuel_oil_gallons, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_mobile) {
    if (loc.gasoline_amount > 0) {
      const ef = pickEF(loc, `gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
      const g = calcGas(ef, loc.gasoline_amount, gwpVersion)
      s1_mobile += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
    }
    if (loc.diesel_mobile_amount > 0) {
      const ef = pickEF(loc, `diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
      const g = calcGas(ef, loc.diesel_mobile_amount, gwpVersion)
      s1_mobile += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
    }
  }
  const ref_gwp = REFRIGERANT_GWP[loc.refrigerant_type]?.[gwpVersion] ?? 0
  const s1_fugitive = (!loc.uses_ammonia && loc.has_hfc_refrigerants) ? loc.refrigerant_purchased_kg * ref_gwp / 1000 : 0
  const s1_total = s1_stationary + s1_mobile + s1_fugitive
  // Grid-region gate: when the location's grid_region isn't a real GRID_EF key (us_average default,
  // '', unmapped country), OMIT the electricity Scope 2 entirely — no getGridFactor call, no electricity
  // contribution — exactly like an absent Scope 1 fuel. Steam (grid-independent) is unaffected.
  const gridResolved = isResolvedGridRegion(loc.grid_region)
  const grid_ef = gridResolved ? getGridFactor(loc.grid_region, year).ef : 0
  const steam_kg = loc.has_purchased_steam ? loc.purchased_steam_mmbtu * EF.steam_mmbtu : 0
  const s2_location = ((gridResolved ? loc.electricity_kwh * grid_ef : 0) + steam_kg) / 1000
  // Market-based: covered (contractual) kWh @ 0 (RECs/PPAs/green tariffs assumed zero-emission — documented);
  // uncovered kWh @ residual-mix factor. If no residual mix applies (full-disclosure region, or US subregion
  // not yet selected), fall back to the location grid factor for uncovered load and flag it.
  const uncovered_kwh = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
  const resRegion = loc.residual_region || (loc.grid_region.startsWith('EU_') ? loc.grid_region : '')
  const res = getResidualFactor(resRegion, year, gwpVersion)
  const market_elec_ef = res.applicable ? res.ef : grid_ef
  const s2_market = ((gridResolved ? uncovered_kwh * market_elec_ef : 0) + steam_kg) / 1000
  // NZ transmission & distribution losses — Scope 3 Category 3, NOT Scope 2. Kept as a DISTINCT
  // term (s3_td) and deliberately never added into s2_location/s2_market. Opt-in per NZ location.
  const s3_td = (loc.country === 'NZ' && loc.nz_td_losses && loc.electricity_kwh > 0)
    ? loc.electricity_kwh * nzTdLoss(year) / 1000
    : 0
  return { s1_stationary, s1_mobile, s1_fugitive, s1_total, s2_location, s2_market, s3_td, gases, biogenic: loc.biogenic_co2_mt }
}

function calcInventory(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024) {
  return locations.reduce((acc, loc) => {
    const c = calcLocation(loc, gwpVersion, year)
    return {
      s1_total: acc.s1_total + c.s1_total,
      s2_location: acc.s2_location + c.s2_location,
      s2_market: acc.s2_market + c.s2_market,
      // s3_td is a DISTINCT Scope 3 (Cat 3) total — NZ electricity T&D losses. Accumulated here so the
      // line that renders in the workings/CSV is totalled SOMEWHERE. NEVER added into s1/s2 (E2 guards).
      s3_td: acc.s3_td + c.s3_td,
      co2: acc.co2 + c.gases.co2,
      ch4: acc.ch4 + c.gases.ch4,
      n2o: acc.n2o + c.gases.n2o,
      biogenic: acc.biogenic + c.biogenic,
    }
  }, { s1_total: 0, s2_location: 0, s2_market: 0, s3_td: 0, co2: 0, ch4: 0, n2o: 0, biogenic: 0 })
}

// Map a concierge (docType, fuelType) pair to its inventory field(s). Module-scoped so both the
// confirm path (updateProposal / addCoverageResolution) and buildWorkings share one join key.
function fieldFor(docType: string, fuelType: string): { amount: keyof Location; unit?: keyof Location } | null {
  if (docType === 'utility_electricity' && fuelType === 'electricity') return { amount: 'electricity_kwh' }
  if (docType === 'renewable_cert' && fuelType === 'electricity') return { amount: 'renewable_electricity_kwh' }
  if (docType === 'utility_bill_gas' && fuelType === 'natural_gas') return { amount: 'natural_gas_amount', unit: 'natural_gas_unit' }
  if (docType === 'fuel_propane' && fuelType === 'propane') return { amount: 'propane_amount', unit: 'propane_unit' }
  if (docType === 'fuel_diesel' && fuelType === 'diesel') return { amount: 'diesel_stationary_amount', unit: 'diesel_stationary_unit' }
  if (docType === 'fleet_fuel' && fuelType === 'diesel') return { amount: 'diesel_mobile_amount', unit: 'diesel_mobile_unit' }
  if (docType === 'fleet_fuel' && fuelType === 'gasoline') return { amount: 'gasoline_amount', unit: 'gasoline_unit' }
  return null
}

// Reverse of fieldFor at the docType level: the fuelType a document_type carries, when we cannot read
// it off a dated proposal (e.g. a 'none'-status strip with no usable dates). fleet_fuel carries TWO
// fuels → null here (3c gives it proper per-fuel handling); non-concierge docs → null.
function fuelTypeForDocType(docType: string): string | null {
  switch (docType) {
    case 'utility_electricity': return 'electricity'
    case 'renewable_cert': return 'electricity'
    case 'utility_bill_gas': return 'natural_gas'
    case 'fuel_propane': return 'propane'
    case 'fuel_diesel': return 'diesel'
    default: return null // fleet_fuel (two fuels — 3c), service_record, fuel_oil, purchased_steam
  }
}

// ── Resolution application — single source of truth for what a figure IS ──────
// The human-readable method/basis strings are composed HERE, once. Both the per-field
// adjustment (applyResolutions) and the coverage-resolution audit rows in buildWorkings
// read from these, so the claim on the figure and the claim in the audit trail cannot
// drift apart — the divergence they used to have IS the SEV 0 bug.
function resolutionMethod(r: CoverageResolution): string {
  return r.kind === 'extrapolate' ? `Extrapolation (×12/${r.monthsCovered}, ${r.pctEstimated}% estimated)`
    : r.kind === 'duplicate' ? 'Overlap confirmed (no double-count adjustment)'
    : r.kind === 'straddle' ? `Straddle — ${r.straddleChoice}${r.daysInYear != null && r.totalDays != null ? ` (${r.daysInYear}/${r.totalDays} days in year)` : ''}`
    : r.kind
}
function resolutionBasis(r: CoverageResolution): string {
  if (r.kind === 'extrapolate' && r.monthsCovered) {
    const mult = 12 / r.monthsCovered
    const multStr = Number.isInteger(mult) ? String(mult) : mult.toFixed(2)
    return `${r.monthsCovered} of 12 months from bills; grossed ×${multStr} for acknowledged coverage gap`
  }
  if (r.kind === 'straddle') {
    return r.daysInYear != null && r.totalDays != null
      ? `${r.daysInYear} of ${r.totalDays} days fall in the reporting year`
      : `boundary-straddling bill resolved by ${r.straddleChoice}`
  }
  if (r.kind === 'duplicate') return 'overlapping bills accepted as-is; no double-count adjustment applied'
  return r.note
}

/**
 * Single source of truth for what a location's activity figures ARE, given its
 * confirmed proposals and any coverage resolutions on file.
 * Pure. Called by the component's write path AND by buildWorkings — so the
 * figure in the total and the figure in the audit trail cannot diverge.
 */
export interface AppliedField {
  field: keyof Location
  unitField?: keyof Location
  rawSum: number          // sum of confirmed proposals, before any adjustment
  value: number           // the figure actually used
  unit?: string
  adjustment: null | {
    kind: 'extrapolate' | 'straddle' | 'duplicate'
    method: string        // human-readable, flows verbatim into workings
    basis: string         // e.g. "9 of 12 months; ×12/9" | "12 of 31 days in FY"
    factor: number        // multiplier applied to rawSum (1 = unchanged)
  }
  mixedUnits: boolean     // true → do not write; caller flags for manual review
  fuelTypes: string[]
  quotes: string[]
  docIds: string[]
  filePaths: string[]
  refs: { docId: string; pi: number }[]   // (docId, proposal index) feeding this field — for the write path's mixed-unit flip
}

export function applyResolutions(loc: Location, resolutions: CoverageResolution[], winStart: Date, winEnd: Date): Record<string, AppliedField> {
  const DAY = 86400000
  const winEexcl = new Date(winEnd.getFullYear(), winEnd.getMonth(), winEnd.getDate() + 1)
  const year = winEnd.getFullYear()
  // Does THIS proposal's canonical [start, exclusiveEnd(end)) interval straddle the window? Same
  // convention as analyzeCoverage's detector, so the strip, the figure and the audit trail agree.
  const proposalStraddles = (periodStart: string | null, periodEnd: string | null): boolean => {
    if (!periodStart || !periodEnd) return false
    const s = parseLocalDate(periodStart)
    const e = exclusiveEnd(parseLocalDate(periodEnd))
    const total = Math.round((e.getTime() - s.getTime()) / DAY)
    const ovS = s > winStart ? s : winStart
    const ovE = e < winEexcl ? e : winEexcl
    const inWin = Math.max(0, Math.round((ovE.getTime() - ovS.getTime()) / DAY))
    return inWin > 0 && inWin < total
  }

  // 1. Gather confirmed proposals per target field (via the shared fieldFor join key).
  type Acc = { field: keyof Location; unitField?: keyof Location; rawSum: number; units: Set<string>; fuelType: string; fuelTypes: Set<string>; quotes: string[]; docIds: string[]; filePaths: string[]; refs: { docId: string; pi: number }[]; props: { value: number; periodStart: string | null; periodEnd: string | null }[] }
  const acc: Record<string, Acc> = {}
  loc.source_docs.forEach(d => {
    d.extracted?.forEach((p, pi) => {
      if (p.status !== 'confirmed' || p.value == null) return
      const map = fieldFor(d.document_type, p.fuelType)
      if (!map) return
      const key = String(map.amount)
      if (!acc[key]) acc[key] = { field: map.amount, unitField: map.unit, rawSum: 0, units: new Set(), fuelType: p.fuelType, fuelTypes: new Set(), quotes: [], docIds: [], filePaths: [], refs: [], props: [] }
      acc[key].rawSum += p.value
      acc[key].props.push({ value: p.value, periodStart: p.periodStart, periodEnd: p.periodEnd })
      if (p.unit) acc[key].units.add(p.unit)
      acc[key].fuelTypes.add(p.fuelType)
      acc[key].refs.push({ docId: d.id, pi })
      // paths[] index-aligned with quotes[] (quote[i] ↔ source_file_paths[i] on the verifier row).
      if (p.sourceQuote) { acc[key].quotes.push(p.sourceQuote); acc[key].filePaths.push(d.file_path) }
      if (!acc[key].docIds.includes(d.id)) acc[key].docIds.push(d.id)
    })
  })
  // 2. Compute each field's figure + adjustment.
  const out: Record<string, AppliedField> = {}
  for (const [key, a] of Object.entries(acc)) {
    const mixedUnits = a.units.size > 1
    const unit = a.units.size === 1 ? [...a.units][0] : undefined
    const extr = resolutions.find(r => r.kind === 'extrapolate' && r.locId === loc.id && r.fuelType === a.fuelType && !!r.monthsCovered && r.monthsCovered > 0)
    const strad = resolutions.find(r => r.kind === 'straddle' && r.locId === loc.id && r.fuelType === a.fuelType)
    const dup = resolutions.find(r => r.kind === 'duplicate' && r.locId === loc.id && r.fuelType === a.fuelType)

    // STRADDLE scaling is PER-PROPOSAL — only the straddling bill(s) are scaled; the other bills for
    // this field are left untouched (scaling the whole sum would corrupt eleven correct bills).
    const straddleFactor =
      strad?.straddleChoice === 'next_year' ? 0
      : strad?.straddleChoice === 'this_year' ? 1
      : strad?.straddleChoice === 'prorate' ? (strad.totalDays ? (strad.daysInYear ?? 0) / strad.totalDays : 1)
      : 1
    const straddledSum = strad
      ? a.props.reduce((s, pr) => s + pr.value * (proposalStraddles(pr.periodStart, pr.periodEnd) ? straddleFactor : 1), 0)
      : a.rawSum
    // EXTRAPOLATION gross-up applies AFTER the per-proposal straddle scaling. ORDER MATTERS.
    const extrFactor = (extr && extr.monthsCovered) ? 12 / extr.monthsCovered : 1
    const value = mixedUnits ? a.rawSum : straddledSum * extrFactor

    let adjustment: AppliedField['adjustment'] = null
    if (extr || strad || dup) {
      // basis states the REAL arithmetic, in application order (straddle per-proposal, THEN extrapolate).
      const parts: string[] = []
      if (strad) {
        const tot = strad.totalDays ?? 0, din = strad.daysInYear ?? 0
        parts.push(
          strad.straddleChoice === 'next_year' ? `next_year: straddling bill excluded (0 of ${tot} days counted)`
          : strad.straddleChoice === 'this_year' ? `this_year: straddling bill counted in full (${tot} of ${tot} days)`
          : `prorate: ${din} of ${tot} days in FY${year}; straddling bill scaled ×${(tot ? din / tot : 1).toFixed(3)}`
        )
      }
      if (extr) parts.push(resolutionBasis(extr))
      if (dup && !strad && !extr) parts.push(resolutionBasis(dup))
      // primary drives kind + method: extrapolate (the gross-up) if present, else the straddle/duplicate.
      const primary = extr ?? strad ?? dup!
      adjustment = { kind: primary.kind, method: resolutionMethod(primary), basis: parts.join('; then '), factor: a.rawSum > 0 ? value / a.rawSum : 1 }
    }

    out[key] = { field: a.field, unitField: a.unitField, rawSum: a.rawSum, value, unit, adjustment, mixedUnits, fuelTypes: [...a.fuelTypes], quotes: a.quotes, docIds: a.docIds, filePaths: a.filePaths, refs: a.refs }
  }
  return out
}

// Provenance stamp attached to a workings row so the verifier can trace a figure back to its bills.
// concierge = read verbatim off confirmed bills; concierge-extrapolated = grossed up for a coverage
// gap (number is estimated, quotes are the underlying bills); manual = not concierge-read.
interface Provenance {
  source_quotes?: string[]
  source_doc_ids?: string[]
  source_file_paths?: string[]
  entry_method: 'manual' | 'concierge' | 'concierge-extrapolated'
  extrapolation_note?: string
}

function buildWorkings(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024, resolutions: CoverageResolution[] = [], fiscalYearEndMonth: number = 12) {
  const rows: any[] = []
  const win = periodFromYearAndEnd(year, fiscalYearEndMonth)
  // Screen abbreviations for the combined-factor display, matching what renderStep4 showed (gal / L);
  // every other unit (mcf, kg, therms, mmbtu…) passes through unchanged. emission_factor (the gas split)
  // is UNTOUCHED — the CSV / verifier path depends on it. emission_factor_display is display-only.
  const abbrevUnit = (u: string) => u === 'gallons' ? 'gal' : (u === 'litres' || u === 'liters') ? 'L' : u
  const pushFuel = (loc: Location, source: string, scope: number, activity: number, unit: string, ef: { co2: number; ch4: number; n2o: number }, prov?: Provenance) => {
    const g = calcGas(ef, activity, gwpVersion)
    const gwp = GWP[gwpVersion]
    const efCo2e = ef.co2 + ef.ch4 * gwp.CH4_fossil + ef.n2o * gwp.N2O
    rows.push({ location: loc.name || 'Location', source, scope, activity_data: activity, activity_unit: unit,
      emission_factor: `CO2 ${ef.co2}, CH4 ${ef.ch4}, N2O ${ef.n2o} kg/${unit}`, emission_factor_display: `${efCo2e.toFixed(3)} kg CO₂e/${abbrevUnit(unit)}`, ef_source: combustionSource(loc), gwp_basis: gwpVersion, result_tco2e: g.total, ...(prov ?? {}) })
  }
  for (const loc of locations) {
    // applyResolutions is the single source of the figure AND its provenance/method, so the number
    // in the row and the claim in the audit trail cannot diverge (that divergence was the SEV 0 bug).
    const applied = applyResolutions(loc, resolutions, win.start, win.end)
    // Figure for a field: the resolution-applied value when the field is concierge-derived; otherwise
    // the location's own value (manual entry, or a mixed-unit field the write path deliberately skipped).
    const figure = (field: keyof Location): number => {
      const a = applied[String(field)]
      return a && !a.mixedUnits ? a.value : (loc as any)[field] as number
    }
    // Provenance stamp from the applied field. No quotes → honest 'manual'. An adjustment on file
    // (extrapolate/straddle/duplicate) with quotes → 'concierge-extrapolated' + the method/basis note.
    const provOf = (field: keyof Location): Provenance => {
      const a = applied[String(field)]
      const quotes = a?.quotes ?? []
      if (!quotes.length) return { entry_method: 'manual' }
      if (a && a.adjustment) {
        return { source_quotes: quotes, source_doc_ids: a.docIds, source_file_paths: a.filePaths,
          entry_method: 'concierge-extrapolated', extrapolation_note: `${a.adjustment.method} — ${a.adjustment.basis}` }
      }
      return { source_quotes: quotes, source_doc_ids: a!.docIds, source_file_paths: a!.filePaths, entry_method: 'concierge' }
    }
    if (loc.has_natural_gas && loc.natural_gas_amount > 0) pushFuel(loc, 'Natural gas', 1, figure('natural_gas_amount'), loc.natural_gas_unit, pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF), provOf('natural_gas_amount'))
    if (loc.has_propane && loc.propane_amount > 0) pushFuel(loc, 'Propane', 1, figure('propane_amount'), loc.propane_unit, pickEF(loc, propaneEfKey(loc.propane_unit) as keyof typeof EF), provOf('propane_amount'))
    if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0) pushFuel(loc, 'Diesel (stationary)', 1, figure('diesel_stationary_amount'), loc.diesel_stationary_unit, pickEF(loc, `diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), provOf('diesel_stationary_amount'))
    if (loc.has_fuel_oil && loc.fuel_oil_gallons > 0) pushFuel(loc, 'Fuel oil', 1, figure('fuel_oil_gallons'), 'gallons', pickEF(loc, 'fuel_oil_gallon'), provOf('fuel_oil_gallons'))
    if (loc.has_mobile && loc.gasoline_amount > 0) pushFuel(loc, 'Gasoline (mobile)', 1, figure('gasoline_amount'), loc.gasoline_unit, pickEF(loc, `gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), provOf('gasoline_amount'))
    if (loc.has_mobile && loc.diesel_mobile_amount > 0) pushFuel(loc, 'Diesel (mobile)', 1, figure('diesel_mobile_amount'), loc.diesel_mobile_unit, pickEF(loc, `diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), provOf('diesel_mobile_amount'))
    if (!loc.uses_ammonia && loc.has_hfc_refrigerants && loc.refrigerant_purchased_kg > 0) {
      const ref_gwp = REFRIGERANT_GWP[loc.refrigerant_type]?.[gwpVersion] ?? 0
      rows.push({ location: loc.name || 'Location', source: `Refrigerant (${loc.refrigerant_type})`, scope: 1, activity_data: loc.refrigerant_purchased_kg, activity_unit: 'kg', emission_factor: `GWP ${ref_gwp}`, ef_source: 'IPCC GWP', gwp_basis: gwpVersion, result_tco2e: loc.refrigerant_purchased_kg * ref_gwp / 1000, entry_method: 'manual' })
    }
    // Grid-region gate: unresolved grid_region → OMIT the electricity Scope 2 rows entirely (no
    // getGridFactor call, no US_AVG row). NZ (T&D row below) is always resolved, so no real T&D is lost.
    if (loc.electricity_kwh > 0 && isResolvedGridRegion(loc.grid_region)) {
      const gf = getGridFactor(loc.grid_region, year)
      rows.push({ location: loc.name || 'Location', source: `Electricity (${gf.usedRegion}, ${gf.usedYear})`, scope: 2, activity_data: loc.electricity_kwh, activity_unit: 'kWh', emission_factor: `${gf.ef} kg/kWh`, ef_source: EF_SOURCES.electricity, gwp_basis: 'location-based', result_tco2e: loc.electricity_kwh * gf.ef / 1000, ...provOf('electricity_kwh') })
      // Market-based Scope 2: residual-mix factor on uncovered load, with provenance stamped for the verifier.
      const resRegion = loc.residual_region || (loc.grid_region.startsWith('EU_') ? loc.grid_region : '')
      const res = getResidualFactor(resRegion, year, gwpVersion)
      const uncovered = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
      const mktEf = res.applicable ? res.ef : gf.ef
      // Market-based row is a derived (uncovered = grid − renewable) figure, not a verbatim bill read → manual.
      rows.push({ location: loc.name || 'Location', source: `Electricity (S2 market-based${res.applicable ? `, residual mix ${res.usedRegion}` : ', location-factor fallback'})`, scope: 2, activity_data: uncovered, activity_unit: 'kWh uncovered', emission_factor: `${mktEf.toFixed(4)} kg/kWh`, ef_source: `${res.source}${res.vintage && res.vintage !== 'n/a' ? ` · vintage: ${res.vintage}` : ''}${res.note ? ` · ${res.note}` : ''}`, gwp_basis: res.applicable ? gwpVersion : 'location-based', result_tco2e: uncovered * mktEf / 1000, entry_method: 'manual' })
      // NZ T&D losses — Scope 3 Category 3, NOT Scope 2. Distinct row (scope 3) so it never reads as
      // part of the S2 figure; opt-in per NZ location. Kept in lock-step with calcLocation via nzTdLoss.
      if (loc.country === 'NZ' && loc.nz_td_losses) {
        const td = nzTdLoss(year)
        rows.push({ location: loc.name || 'Location', source: 'Electricity T&D losses (NZ) — Scope 3 Cat 3', scope: 3, activity_data: loc.electricity_kwh, activity_unit: 'kWh', emission_factor: `${td} kg/kWh`, ef_source: `${EF_SOURCES.electricity} · T&D losses (Scope 3 Cat 3)`, gwp_basis: 'scope3-cat3', result_tco2e: loc.electricity_kwh * td / 1000, entry_method: 'manual' })
      }
    }
    if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0) {
      rows.push({ location: loc.name || 'Location', source: 'Purchased steam', scope: 2, activity_data: loc.purchased_steam_mmbtu, activity_unit: 'mmbtu', emission_factor: `${EF.steam_mmbtu} kg/mmbtu`, ef_source: EF_SOURCES.combustion, gwp_basis: 'location-based', result_tco2e: loc.purchased_steam_mmbtu * EF.steam_mmbtu / 1000, entry_method: 'manual' })
    }
    // ── Declaration rows: a row for EVERY stream that has no data, so absence is never silent ──
    // Streams WITH data are already emitted above. For the rest: attested_absent (result 0 = a claim of
    // zero) vs undeclared (result null = an ABSENCE, not a claim — must not look like 0 in a verifier CSV).
    const attestedAt = new Map((loc.stream_attestations ?? []).map(a => [a.stream, a.attested_at]))
    for (const s of DECLARABLE_STREAMS) {
      if (streamHasData(loc, s)) continue
      const meta = STREAM_META[s]
      const at = attestedAt.get(s)
      rows.push(at
        ? { location: loc.name || 'Location', source: meta.name, scope: meta.scope, activity_data: 0, activity_unit: '—', emission_factor: '—', emission_factor_display: '—', ef_source: '—', gwp_basis: 'declaration', result_tco2e: 0, declaration: 'attested_absent', entry_method: 'attestation', note: `No ${meta.name} at this location. Attested ${at}.` }
        : { location: loc.name || 'Location', source: meta.name, scope: meta.scope, activity_data: 0, activity_unit: '—', emission_factor: '—', emission_factor_display: '—', ef_source: '—', gwp_basis: 'declaration', result_tco2e: null, declaration: 'undeclared', entry_method: 'undeclared', note: 'NOT DECLARED — completeness cannot be asserted for this stream.' })
    }
  }
  // ── Coverage-resolution audit trail ──────────────────────────────────────
  // Every gap/overlap/straddle the user resolved is recorded here so a verifier
  // sees the method and basis behind any estimated or adjusted figure. Spec: line 462.
  for (const r of resolutions) {
    // Method string comes from the SAME resolutionMethod() that fills AppliedField.adjustment.method,
    // so the audit row and the figure's provenance stamp can never claim different things.
    rows.push({
      location: '—',
      source: `Coverage resolution: ${r.fuelType || 'fuel'}`,
      scope: 0,
      activity_data: null,
      activity_unit: r.kind,
      emission_factor: resolutionMethod(r),
      ef_source: r.note,
      gwp_basis: 'coverage_resolution',
      result_tco2e: null,
      resolved_at: r.acknowledgedAt,
    })
  }
  // Rows with no gas split (electricity, refrigerant, steam, market-based, T&D, coverage resolutions)
  // have no combined-factor form — their emission_factor IS already the display string. Declaration
  // rows set their own '—'. Fill the rest so every row carries a display field for the workings table.
  for (const r of rows) if (r.emission_factor_display === undefined) r.emission_factor_display = r.emission_factor
  return rows
}

// Coverage gate (step 9b). Per location × (document_type, fuelType), run analyzeCoverage and flag any
// gap/overlap/straddle lacking a matching resolution, AND any 'none' (docs uploaded but no dated
// confirmed bills). Pure.
// Phase 3c: keyed on (docType, FUELTYPE), not docType. A fleet_fuel doc carries BOTH gasoline and diesel
// from the SAME bills; the old per-docType grouping picked ONE fuel as the strip and let a resolution on
// it clear the gate for the other — silent partial extrapolation (the C1 bug). Each fuel is now its own
// group, requiring its own resolution. And the gate iterates cov.ISSUES (all conditions), not the scalar
// status, so a gap masked by an overlap can't slip through (the D1 bug).
export function findUnresolvedCoverage(
  locations: Location[],
  reportingYear: number,
  fiscalYearEndMonth: number,
  resolutions: CoverageResolution[]
): { locId: string; fuelType: string; status: string }[] {
  const coverageWin = periodFromYearAndEnd(reportingYear, fiscalYearEndMonth)
  const KIND_FOR: Record<'gap' | 'overlap' | 'straddle', CoverageResolution['kind']> =
    { gap: 'extrapolate', overlap: 'duplicate', straddle: 'straddle' }
  return locations.flatMap(loc => {
    // Group confirmed DATED proposals by (docType, fuelType). Each group is its own coverage unit.
    const groups = new Map<string, { fuelType: string; periods: CoveragePeriod[] }>()
    // A doc whose confirmed proposals carry NO usable dates yields a 'none' (must date the bills — no
    // resolution can clear it). Label with the doc's known fuel if any, else the docType's canonical fuel;
    // fleet_fuel (two fuels) can't be labelled from nothing → fuelType '' (one 'none' row per such doc).
    const noneFuels: string[] = []
    loc.source_docs.forEach(d => {
      const confirmed = (d.extracted ?? []).filter(p => p.status === 'confirmed')
      const dated = confirmed.filter(p => p.periodStart && p.periodEnd)
      dated.forEach(p => {
        const key = `${d.document_type}|${p.fuelType}`
        const g = groups.get(key) ?? { fuelType: p.fuelType, periods: [] }
        g.periods.push({ docId: d.id, pi: 0, start: parseLocalDate(p.periodStart as string), end: parseLocalDate(p.periodEnd as string) })
        groups.set(key, g)
      })
      if (dated.length === 0 && confirmed.length > 0) {
        // Confirmed but undated → 'none'. Label from the confirmed proposal's fuel, else the docType's.
        noneFuels.push(confirmed.find(p => p.fuelType)?.fuelType ?? fuelTypeForDocType(d.document_type) ?? '')
      } else if ((d.extracted?.length ?? 0) === 0) {
        // No extracted proposals at all — can't read a fuel. One 'none' row; fleet_fuel → '' (don't invent).
        noneFuels.push(fuelTypeForDocType(d.document_type) ?? '')
      }
    })

    const out: { locId: string; fuelType: string; status: string }[] = []
    noneFuels.forEach(fuelType => out.push({ locId: loc.id, fuelType, status: 'none' }))
    for (const [, g] of groups) {
      const cov = analyzeCoverage(g.periods, coverageWin.start, coverageWin.end)
      const hasRes = (kind: CoverageResolution['kind']) =>
        resolutions.some(r => r.kind === kind && r.locId === loc.id && r.fuelType === g.fuelType)
      // Require a resolution for EVERY issue present. Any unresolved issue blocks; report them together.
      const unresolvedIssues = cov.issues.filter(iss => !hasRes(KIND_FOR[iss]))
      if (unresolvedIssues.length > 0) out.push({ locId: loc.id, fuelType: g.fuelType, status: unresolvedIssues.join('+') })
    }
    return out
  })
}

// ── Undeclared streams (completeness gate) ────────────────────────────────────
// Same pattern as the grid-region gate (isResolvedGridRegion / gridReady): a `has_*` flag of false is
// BOTH the init default AND "no such supply" — one field, two meanings. A stream is DECLARED only when
// it has data OR carries an explicit attestation; otherwise it is UNDECLARED and blocks export.
export const DECLARABLE_STREAMS = [
  'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil',
  'mobile', 'refrigerants', 'electricity', 'purchased_steam',
] as const
export type DeclarableStream = typeof DECLARABLE_STREAMS[number]

export interface StreamAttestation {
  stream: DeclarableStream
  attested_at: string      // ISO
}

// ONE canonical name per stream — the single source the QuestionCard question, the absence
// attestation, and the workings declaration row all derive from, so the thing a user is ASKED and the
// thing they ATTEST (a timestamped legal assertion in the assurance package) are word-for-word the same.
// `verb` selects "use" vs "have" for the question. Same pattern as applyResolutions: define once,
// consume in three places, they cannot drift.
export const STREAM_META: Record<DeclarableStream, { name: string; verb: 'use' | 'have'; scope: number }> = {
  natural_gas:       { name: 'natural gas',                          verb: 'use',  scope: 1 },
  propane:           { name: 'propane / LPG',                        verb: 'use',  scope: 1 },
  diesel_stationary: { name: 'diesel in stationary equipment',       verb: 'use',  scope: 1 },
  fuel_oil:          { name: 'fuel oil',                             verb: 'use',  scope: 1 },
  mobile:            { name: 'company vehicles or mobile equipment', verb: 'have', scope: 1 },
  refrigerants:      { name: 'refrigeration or cooling',             verb: 'have', scope: 1 },
  electricity:       { name: 'purchased electricity',               verb: 'use',  scope: 2 },
  purchased_steam:   { name: 'purchased steam or district heating',  verb: 'use',  scope: 2 },
}

// True iff a location has DATA for a stream (the `has_*` flag or a positive amount). Shared by
// findUndeclaredStreams and buildWorkings so the gate and the workings agree on what counts as declared.
function streamHasData(loc: Location, s: DeclarableStream): boolean {
  switch (s) {
    case 'natural_gas': return loc.has_natural_gas
    case 'propane': return loc.has_propane
    case 'diesel_stationary': return loc.has_diesel_stationary
    case 'fuel_oil': return loc.has_fuel_oil
    case 'mobile': return loc.has_mobile
    case 'refrigerants': return loc.has_hfc_refrigerants || loc.uses_ammonia
    case 'electricity': return loc.electricity_kwh > 0
    case 'purchased_steam': return loc.purchased_steam_mmbtu > 0
  }
}

export function findUndeclaredStreams(
  locations: Location[]
): { locId: string; locName: string; stream: DeclarableStream }[] {
  return locations.flatMap(loc => {
    const attested = new Set((loc.stream_attestations ?? []).map(a => a.stream))
    return DECLARABLE_STREAMS
      .filter(s => !streamHasData(loc, s) && !attested.has(s))
      .map(stream => ({ locId: loc.id, locName: loc.name || 'Location', stream }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API. Declarations above are kept in their original (verbatim) order;
// exports are collected here so the move stays byte-for-byte auditable.
// ─────────────────────────────────────────────────────────────────────────────
export {
  // Constants / tables
  GWP, REFRIGERANT_GWP, EF, EF_CA, EF_CA_NG_CO2_M3, M3_PER_MCF,
  EF_UK, EF_EU, EF_AU, EF_NZ, EF_SOURCES, GRID_EF, NZ_TD_LOSS,
  RESIDUAL_EU, RESIDUAL_US,
  CA_PROVINCES, US_STATES, US_SUBREGIONS, AU_STATES,
  EU_COUNTRIES, EU_COUNTRY_OPTIONS,
  GRID_REGIONS_CA, GRID_REGIONS_US, FRAMEWORKS,
  // Functions
  nzTdLoss, isResolvedGridRegion, getGridFactor, getResidualFactor,
  detectGridRegion, gridRegionForCountry, propaneEfKey, pickEF,
  combustionSource, calcGas, calcLocation, calcInventory, fieldFor,
  buildWorkings, emptyLocation,
  ngUnitOptions, normalizeNgUnit, liquidUnitOptions, propaneUnitOptions,
  validateElectricity, validateNaturalGas, validateCompleteness,
  parseLocalDate, periodFromYearAndEnd, monthKey, monthLabel,
  daysBetween, exclusiveEnd, analyzeCoverage,
}
export type {
  GwpVersion, ResidualGas, Location, Inventory, SourceDoc,
  ExtractedProposal, ConciergeStatus, CoveragePeriod, CoverageResult,
  CoverageResolution, Provenance,
}
