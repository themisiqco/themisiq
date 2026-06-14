'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { supabase } from '../../../lib/supabase'
import { useEntitlement, useHasConcierge } from '../../../lib/useEntitlement'
import { generateAssurancePDF } from '../../../lib/assurancePdf'
import { useSearchParams } from 'next/navigation'

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

const EF_SOURCES = {
  combustion: 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
  combustion_ca: 'ECCC (2025) Emission factors and reference values v3.0',
  combustion_uk: 'UK DEFRA/DESNZ (2025) GHG Conversion Factors for Company Reporting',
  combustion_eu: 'IPCC (2006) Guidelines Vol.2 — Tier 1 default combustion factors',
  electricity: 'US EPA eGRID2023 (US) / ECCC v3.0 (CA) / DEFRA 2025 (UK) / EEA 2023 (EU)',
  residual_us: 'Green-e Residual Mix 2025 (2023 data, publ. 2026-01-29, CRS) — residual CO₂; eGRID2023 Rev2 (publ. 2025-06-12) CH₄/N₂O. Green-e factors out Green-e-certified voluntary sales (the only published US residual source per CRS).',
  residual_eu: 'AIB European Residual Mixes 2024 (publ. 2025-05-30, Grexel/AIB; Ecoinvent CO₂ inputs) — combined CO₂e, gCO₂/kWh.',
  gwp_ar4: 'IPCC AR4 (2007) — required by CARB SB 253 and CDP default',
  gwp_ar5: 'IPCC AR5 (2014) — required by ESRS E1 and GRI 305',
  gwp_ar6: 'IPCC AR6 (2021) — used by ESRS E1, GRI 305, CDP, EcoVadis, IFRS S2',
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
}
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
  if ((ctry === 'CA' || ctry === 'CANADA') && CA_PROVINCES.includes(c)) return c
  if (CA_PROVINCES.includes(c) && !US_STATES.includes(c)) return c
  if (US_STATES.includes(c)) return 'US_' + c
  return 'US_AVG'
}
// Country-level grid region for countries whose grid factor is national (UK, EU members).
// Returns the GRID_EF key, or '' if the country isn't one we map at country level.
function gridRegionForCountry(country: string): string {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'GB' || ctry === 'UK') return 'UK'
  if (EU_COUNTRIES.includes(ctry)) return 'EU_' + ctry
  return ''
}
const GRID_REGIONS_CA = CA_PROVINCES.map(p => { const y = GRID_EF[p]; const latest = Math.max(...Object.keys(y).map(Number)); return { value: p, label: p, ef: y[latest] } })
const GRID_REGIONS_US = US_STATES.map(s => { const y = GRID_EF['US_' + s]; const latest = Math.max(...Object.keys(y).map(Number)); return { value: 'US_' + s, label: s, ef: y[latest] } })

const FRAMEWORKS = [
  {
    id: 'sb253', name: 'SB 253', full: 'California SB 253 — CARB', color: '#B91C1C', bg: '#FCEBEB',
    gwp: 'AR4', deadline: 'August 10, 2026',
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
  has_propane: boolean; propane_amount: number; propane_unit: 'gallons' | 'litres'
  has_diesel_stationary: boolean; diesel_stationary_amount: number; diesel_stationary_unit: 'gallons' | 'litres'
  has_fuel_oil: boolean; fuel_oil_gallons: number
  has_mobile: boolean; gasoline_amount: number; gasoline_unit: 'gallons' | 'litres'; diesel_mobile_amount: number; diesel_mobile_unit: 'gallons' | 'litres'
  uses_ammonia: boolean; has_hfc_refrigerants: boolean; refrigerant_type: string; refrigerant_purchased_kg: number
  electricity_kwh: number; grid_region: string; renewable_electricity_kwh: number; residual_region: string
  has_purchased_steam: boolean; purchased_steam_mmbtu: number
  biogenic_co2_mt: number
  source_docs: SourceDoc[]
}

// Derive the reporting period from a reporting year + fiscal year-end MONTH (1-12).
// 12 (December) -> Jan 1 – Dec 31 of the reporting year (calendar year, the default).
// Any other month -> the 12 months ENDING on the last day of that month in the reporting year.
// The last day is computed leap-year-aware (e.g. a February end resolves to 28 or 29 correctly).
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
// METHOD (documented for verifiers): coverage and gaps are assessed at MONTH level
// against the reporting period; straddle proration is computed at DAY level. The
// hybrid is recorded in buildWorkings so the basis of every estimate is traceable.
interface CoveragePeriod { docId: string; pi: number; start: Date; end: Date }
interface CoverageResult {
  status: 'full' | 'gap' | 'overlap' | 'straddle' | 'none'
  monthsCovered: number
  coverageRatio: number               // monthsCovered / 12
  pctEstimated: number                // (12 - monthsCovered)/12, for disclosure
  gaps: { label: string }[]           // uncovered months, human-readable
  overlaps: { a: CoveragePeriod; b: CoveragePeriod }[]
  straddles: { p: CoveragePeriod; daysInYear: number; totalDays: number; pctInYear: number }[]
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

function analyzeCoverage(periods: CoveragePeriod[], winStart: Date, winEnd: Date): CoverageResult {
  if (periods.length === 0) {
    return { status: 'none', monthsCovered: 0, coverageRatio: 0, pctEstimated: 0, gaps: [], overlaps: [], straddles: [], summary: 'No dated bills yet.' }
  }

  // Build the set of reporting-year months (month-level coverage).
  const reqMonths: string[] = []
  {
    const d = new Date(winStart.getFullYear(), winStart.getMonth(), 1)
    const last = new Date(winEnd.getFullYear(), winEnd.getMonth(), 1)
    while (d <= last) { reqMonths.push(monthKey(d)); d.setMonth(d.getMonth() + 1) }
  }

  // Map each required month -> how many bills cover it (for gaps + overlaps).
  const monthCount: Record<string, CoveragePeriod[]> = {}
  reqMonths.forEach(mk => { monthCount[mk] = [] })

  const straddles: CoverageResult['straddles'] = []
  periods.forEach(p => {
    // Straddle: period crosses the reporting-year boundary.
    if (p.start < winStart || p.end > winEnd) {
      const overlapStart = p.start < winStart ? winStart : p.start
      const overlapEnd = p.end > winEnd ? winEnd : p.end
      if (overlapEnd >= overlapStart) {
        const daysInYear = daysBetween(overlapStart, overlapEnd)
        const totalDays = daysBetween(p.start, p.end)
        straddles.push({ p, daysInYear, totalDays, pctInYear: Math.round((daysInYear / totalDays) * 1000) / 10 })
      }
    }
    // Month-level coverage tally (only for months inside the window).
    const d = new Date(Math.max(p.start.getTime(), winStart.getTime()))
    d.setDate(1)
    const endCap = new Date(Math.min(p.end.getTime(), winEnd.getTime()))
    while (d <= endCap) {
      const mk = monthKey(d)
      if (mk in monthCount) monthCount[mk].push(p)
      d.setMonth(d.getMonth() + 1)
    }
  })

  const covered = reqMonths.filter(mk => monthCount[mk].length >= 1)
  const gaps = reqMonths.filter(mk => monthCount[mk].length === 0)
    .map(mk => { const [y, m] = mk.split('-').map(Number); return { label: monthLabel(y, m - 1) } })
  const overlapPairs: CoverageResult['overlaps'] = []
  reqMonths.forEach(mk => {
    const ps = monthCount[mk]
    if (ps.length >= 2) overlapPairs.push({ a: ps[0], b: ps[1] })
  })

  const monthsCovered = covered.length
  const total = reqMonths.length || 12
  let status: CoverageResult['status'] = 'full'
  if (gaps.length > 0) status = 'gap'
  if (overlapPairs.length > 0) status = 'overlap'
  if (straddles.length > 0 && gaps.length === 0 && overlapPairs.length === 0) status = 'straddle'

  return {
    status,
    monthsCovered,
    coverageRatio: monthsCovered / total,
    pctEstimated: Math.round(((total - monthsCovered) / total) * 1000) / 10,
    gaps,
    overlaps: overlapPairs,
    straddles,
    summary:
      status === 'full' ? `Full year covered (${monthsCovered}/${total} months).`
      : status === 'gap' ? `${monthsCovered}/${total} months covered — missing: ${gaps.map(g => g.label).join(', ')}.`
      : status === 'overlap' ? `Possible duplicate: ${overlapPairs.length} month(s) covered by more than one bill.`
      : status === 'straddle' ? `${straddles.length} bill(s) cross the reporting-year boundary.`
      : `${monthsCovered}/${total} months covered.`,
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
  company_name: string; reporting_year: number; revenue_millions: number
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
  source_docs: [],
})

// Natural gas units offered per country. CA uses mcf/m3 only (ECCC has no energy-basis
// factor for therms/mmbtu). UK uses kWh only (DEFRA's billing basis — how UK gas bills read).
// US keeps all three. Returned as [value, label] pairs.
function ngUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'CA') return [['m3', 'm³'], ['mcf', 'Mcf']]
  if (ctry === 'GB' || ctry === 'UK') return [['kwh', 'kWh']]
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
  const metric = ctry === 'CA' || ctry === 'GB' || ctry === 'UK' || EU_COUNTRIES.includes(ctry)
  return metric ? [['litres', 'Litres']] : [['gallons', 'US gallons'], ['litres', 'Litres']]
}


function validateElectricity(kwh: number): string | null {
  if (kwh > 0 && kwh < 1000) return "u26a0 This seems low for a commercial location u2014 please confirm this is the annual total, not a single month."
  if (kwh > 50000000) return "u26a0 This is unusually high u2014 please confirm the unit is kWh, not MWh."
  return null
}
function validateNaturalGas(amount: number, unit: string): string | null {
  if (amount > 0 && unit === "mcf" && amount < 10) return "u26a0 This seems low u2014 please confirm this is the annual total."
  if (unit === "mcf" && amount > 500000) return "u26a0 This seems high u2014 please double-check your bills."
  return null
}
function validateCompleteness(loc: Location): string[] {
  const warnings: string[] = []
  if (loc.electricity_kwh === 0) warnings.push("No electricity entered u2014 most commercial locations use grid electricity.")
  if (!loc.has_natural_gas && !loc.has_propane && !loc.has_diesel_stationary && !loc.has_mobile) warnings.push("No Scope 1 sources selected u2014 if this location has no on-site fuel use, that is fine.")
  return warnings
}

// Country-aware combustion factor selection.
// US -> EPA EF[key] (unchanged). CA -> ECCC EF_CA[key], with per-province NG CO2 override.
// GB/UK -> DEFRA EF_UK[key] (national). EU member -> IPCC EF_EU[key] (national Tier-1 defaults).
// Falls back to EF[key] if a country key is missing, so a location can never silently zero out.
function pickEF(loc: Location, key: keyof typeof EF | keyof typeof EF_CA | keyof typeof EF_UK | keyof typeof EF_EU): { co2: number; ch4: number; n2o: number } {
  const ctry = (loc.country || '').toUpperCase().trim()
  if (ctry === 'GB' || ctry === 'UK') {
    const ukBase = (EF_UK as any)[key] as { co2: number; ch4: number; n2o: number } | undefined
    return ukBase ? { ...ukBase } : ({ ...((EF as any)[key] as { co2: number; ch4: number; n2o: number }) })
  }
  if (EU_COUNTRIES.includes(ctry)) {
    const euBase = (EF_EU as any)[key] as { co2: number; ch4: number; n2o: number } | undefined
    return euBase ? { ...euBase } : ({ ...((EF as any)[key] as { co2: number; ch4: number; n2o: number }) })
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

function calcLocation(loc: Location, gwpVersion: GwpVersion = 'AR4', year: number = 2024) {
  let s1_stationary = 0, s1_mobile = 0
  const gases = { co2: 0, ch4: 0, n2o: 0 }
  if (loc.has_natural_gas && loc.natural_gas_amount > 0) {
    const ef = pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF)
    const g = calcGas(ef, loc.natural_gas_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_propane && loc.propane_amount > 0) {
    const ef = pickEF(loc, `propane_${loc.propane_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
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
  const grid_ef = getGridFactor(loc.grid_region, year).ef
  const steam_kg = loc.has_purchased_steam ? loc.purchased_steam_mmbtu * EF.steam_mmbtu : 0
  const s2_location = (loc.electricity_kwh * grid_ef + steam_kg) / 1000
  // Market-based: covered (contractual) kWh @ 0 (RECs/PPAs/green tariffs assumed zero-emission — documented);
  // uncovered kWh @ residual-mix factor. If no residual mix applies (full-disclosure region, or US subregion
  // not yet selected), fall back to the location grid factor for uncovered load and flag it.
  const uncovered_kwh = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
  const resRegion = loc.residual_region || (loc.grid_region.startsWith('EU_') ? loc.grid_region : '')
  const res = getResidualFactor(resRegion, year, gwpVersion)
  const market_elec_ef = res.applicable ? res.ef : grid_ef
  const s2_market = (uncovered_kwh * market_elec_ef + steam_kg) / 1000
  return { s1_stationary, s1_mobile, s1_fugitive, s1_total, s2_location, s2_market, gases, biogenic: loc.biogenic_co2_mt }
}

function calcInventory(locations: Location[], gwpVersion: GwpVersion = 'AR4', year: number = 2024) {
  return locations.reduce((acc, loc) => {
    const c = calcLocation(loc, gwpVersion, year)
    return {
      s1_total: acc.s1_total + c.s1_total,
      s2_location: acc.s2_location + c.s2_location,
      s2_market: acc.s2_market + c.s2_market,
      co2: acc.co2 + c.gases.co2,
      ch4: acc.ch4 + c.gases.ch4,
      n2o: acc.n2o + c.gases.n2o,
      biogenic: acc.biogenic + c.biogenic,
    }
  }, { s1_total: 0, s2_location: 0, s2_market: 0, co2: 0, ch4: 0, n2o: 0, biogenic: 0 })
}

function buildWorkings(locations: Location[], gwpVersion: GwpVersion = 'AR4', year: number = 2024) {
  const rows: any[] = []
  const pushFuel = (loc: Location, source: string, scope: number, activity: number, unit: string, ef: { co2: number; ch4: number; n2o: number }) => {
    const g = calcGas(ef, activity, gwpVersion)
    rows.push({ location: loc.name || 'Location', source, scope, activity_data: activity, activity_unit: unit,
      emission_factor: `CO2 ${ef.co2}, CH4 ${ef.ch4}, N2O ${ef.n2o} kg/${unit}`, ef_source: combustionSource(loc), gwp_basis: gwpVersion, result_tco2e: g.total })
  }
  for (const loc of locations) {
    if (loc.has_natural_gas && loc.natural_gas_amount > 0) pushFuel(loc, 'Natural gas', 1, loc.natural_gas_amount, loc.natural_gas_unit, pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF))
    if (loc.has_propane && loc.propane_amount > 0) pushFuel(loc, 'Propane', 1, loc.propane_amount, loc.propane_unit, pickEF(loc, `propane_${loc.propane_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF))
    if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0) pushFuel(loc, 'Diesel (stationary)', 1, loc.diesel_stationary_amount, loc.diesel_stationary_unit, pickEF(loc, `diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF))
    if (loc.has_fuel_oil && loc.fuel_oil_gallons > 0) pushFuel(loc, 'Fuel oil', 1, loc.fuel_oil_gallons, 'gallons', pickEF(loc, 'fuel_oil_gallon'))
    if (loc.has_mobile && loc.gasoline_amount > 0) pushFuel(loc, 'Gasoline (mobile)', 1, loc.gasoline_amount, loc.gasoline_unit, pickEF(loc, `gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF))
    if (loc.has_mobile && loc.diesel_mobile_amount > 0) pushFuel(loc, 'Diesel (mobile)', 1, loc.diesel_mobile_amount, loc.diesel_mobile_unit, pickEF(loc, `diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF))
    if (!loc.uses_ammonia && loc.has_hfc_refrigerants && loc.refrigerant_purchased_kg > 0) {
      const ref_gwp = REFRIGERANT_GWP[loc.refrigerant_type]?.[gwpVersion] ?? 0
      rows.push({ location: loc.name || 'Location', source: `Refrigerant (${loc.refrigerant_type})`, scope: 1, activity_data: loc.refrigerant_purchased_kg, activity_unit: 'kg', emission_factor: `GWP ${ref_gwp}`, ef_source: 'IPCC GWP', gwp_basis: gwpVersion, result_tco2e: loc.refrigerant_purchased_kg * ref_gwp / 1000 })
    }
    if (loc.electricity_kwh > 0) {
      const gf = getGridFactor(loc.grid_region, year)
      rows.push({ location: loc.name || 'Location', source: `Electricity (${gf.usedRegion}, ${gf.usedYear})`, scope: 2, activity_data: loc.electricity_kwh, activity_unit: 'kWh', emission_factor: `${gf.ef} kg/kWh`, ef_source: EF_SOURCES.electricity, gwp_basis: 'location-based', result_tco2e: loc.electricity_kwh * gf.ef / 1000 })
      // Market-based Scope 2: residual-mix factor on uncovered load, with provenance stamped for the verifier.
      const resRegion = loc.residual_region || (loc.grid_region.startsWith('EU_') ? loc.grid_region : '')
      const res = getResidualFactor(resRegion, year, gwpVersion)
      const uncovered = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
      const mktEf = res.applicable ? res.ef : gf.ef
      rows.push({ location: loc.name || 'Location', source: `Electricity (S2 market-based${res.applicable ? `, residual mix ${res.usedRegion}` : ', location-factor fallback'})`, scope: 2, activity_data: uncovered, activity_unit: 'kWh uncovered', emission_factor: `${mktEf.toFixed(4)} kg/kWh`, ef_source: `${res.source}${res.vintage && res.vintage !== 'n/a' ? ` · vintage: ${res.vintage}` : ''}${res.note ? ` · ${res.note}` : ''}`, gwp_basis: res.applicable ? gwpVersion : 'location-based', result_tco2e: uncovered * mktEf / 1000 })
    }
    if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0) {
      rows.push({ location: loc.name || 'Location', source: 'Purchased steam', scope: 2, activity_data: loc.purchased_steam_mmbtu, activity_unit: 'mmbtu', emission_factor: `${EF.steam_mmbtu} kg/mmbtu`, ef_source: EF_SOURCES.combustion, gwp_basis: 'location-based', result_tco2e: loc.purchased_steam_mmbtu * EF.steam_mmbtu / 1000 })
    }
  }
  return rows
}


interface BotMessage { role: 'user' | 'assistant'; content: string }

function GHGBot({ currentStep }: { currentStep: number }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<BotMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const stepNames = ['framework selection', 'company setup', 'energy & fuel data', 'additional data', 'review & workings', 'export']

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: `Hi! I'm your GHG inventory guide. You're on step ${currentStep + 1}: ${stepNames[currentStep]}. Ask me anything — "What is an Mcf?", "Where do I find my kWh?", "What's Scope 2?"` }])
    }
  }, [open])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('/api/ghg-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a friendly, expert GHG inventory guide built into the ThemisIQ platform. The user is on step ${currentStep + 1} of 6: ${stepNames[currentStep]}. Your job is to help them complete their GHG inventory with confidence, answer questions clearly, and guide them toward completing the assessment if they haven't already.

ABOUT THEMISIQ: ThemisIQ is a compliance platform that helps companies complete GHG inventories for multiple frameworks at once — enter data once, get all reports automatically. The assessment at www.themisiq.co/assess helps companies determine which frameworks apply to them.

FRAMEWORK GUIDANCE:
- SB 253 (CARB): Required for companies with $1B+ global annual revenue AND California nexus (operations, employees, or sales in California). Deadline: August 10, 2026. If unsure whether they qualify, direct them to www.themisiq.co/assess.
- CDP: Voluntary but widely requested by investors and large customers. If a customer or investor has asked them to complete CDP, they need this. Direct undecided users to www.themisiq.co/assess.
- ESRS E1: Mandatory for large EU-incorporated companies under EU CSRD. Deadline was FY2024 for the largest companies. If they have EU operations or are incorporated in the EU, they likely need this.
- GRI 305: Most widely used voluntary emissions standard globally. Used for sustainability reports, supply chain questionnaires, and stakeholder communications. Not mandatory but widely expected by customers and ESG raters.
- EcoVadis: Required when a corporate customer has requested an EcoVadis supplier assessment. If a customer asked them to complete EcoVadis, they need this module.
- IFRS S2: Emerging global standard for climate financial disclosures. Being adopted in Canada, UK, Australia, Singapore, and others. If they file financial statements in these jurisdictions, IFRS S2 may apply.
- Not sure which frameworks apply? Always direct them to: www.themisiq.co/assess — the free 2-minute eligibility assessment.

KEY TECHNICAL FACTS:
- Scope 1 = direct emissions from owned/controlled sources (natural gas, propane, diesel, gasoline, refrigerants)
- Scope 2 = indirect emissions from purchased electricity and steam
- Scope 3 = all other indirect emissions (supply chain, business travel, employee commuting) — not covered in this tool
- Mcf = thousand cubic feet of natural gas (common US utility billing unit)
- Therms = unit of natural gas energy (1 therm = 100,000 BTU)
- MMBtu = million British thermal units of natural gas
- kWh = kilowatt hours of electricity (always shown on utility bills)
- eGRID = US EPA electricity grid regions with different emission factors
- AR4 GWP = IPCC 4th Assessment Report global warming potentials (used by CARB SB 253 and CDP)
- AR5 GWP = IPCC 5th Assessment Report (used by ESRS E1 and GRI 305, slightly different values)
- Location-based Scope 2 = uses grid average emission factors
- Market-based Scope 2 = accounts for renewable energy certificates (RECs) and PPAs
- PPA = Power Purchase Agreement (contract for renewable electricity)
- REC = Renewable Energy Certificate (proves renewable electricity was generated)
- Organizational boundary = which entities/facilities are included (operational control is most common)

COMMON QUESTIONS AND ANSWERS:
- "What's California nexus?" = Having operations, employees, customers, or sales in California. Even one employee working remotely in California can create nexus.
- "Our revenue is just under $1B" = SB 253 threshold is $1B+ global revenue. If under, you likely don't need to file but should monitor as thresholds may change.
- "What if I miss the August 10 deadline?" = CARB can impose penalties. ThemisIQ can help you file on time — the wizard takes about 20 minutes with bills in hand.
- "Operational vs financial control?" = Operational control means you include facilities where you control operations. Financial control means you include entities where you have financial control. Most companies use operational control.
- "Do I include subsidiaries?" = Under operational control, yes — include any facility your company operates. Under equity share, include proportional to ownership.
- "What if our landlord pays electricity?" = If you don't pay the utility bill directly, you may not have access to the data. Request consumption data from your landlord or property manager — this is increasingly common and often required.
- "Do leased vehicles count?" = Yes, if your company pays for the fuel and controls the vehicle operations, include them in Scope 1 mobile combustion.
- "What about employee personal vehicles?" = Personal vehicles used for business travel are Scope 3, not covered in this tool.
- "We have rooftop solar — how do I handle it?" = Electricity you generate and consume on-site is not Scope 2 (it's not purchased). Only purchased grid electricity goes in Scope 2.
- "What if I don't have 12 months of bills?" = Use what you have and annualize (e.g. 9 months of data × 12/9). Note this in your workings.
- "Multiple meters at one location?" = Add them all together for that location's total.
- "What's the difference between stationary and mobile diesel?" = Stationary = diesel in generators, boilers, heating equipment that doesn't move. Mobile = diesel in vehicles and mobile equipment.
- "Why are AR4 and AR5 numbers different?" = The IPCC updated global warming potential values between reports. CH4 (methane) increased from 25x to 28x CO2e. For most companies the difference is small.
- "What's an intensity ratio?" = Emissions per unit of economic output (e.g. mtCO2e per $million revenue). Allows comparison across companies of different sizes.
- "Do I need a third-party verifier?" = SB 253 requires limited assurance from an accredited verifier. ThemisIQ's assurance-ready export is designed to make that process faster and cheaper.
- "Can I submit the CSV directly to CARB?" = The CSV is your working document. CARB will have a specific submission portal — ThemisIQ's export gives you all the data you need to complete that submission.
- "What does assurance-ready mean?" = Your inventory includes cited emission factors, documented calculation workings, and source document uploads — everything a third-party verifier needs to review your numbers.

Always be encouraging, concise, and jargon-free. If someone seems confused about which frameworks they need, always suggest www.themisiq.co/assess. Never make up regulatory deadlines or requirements you're not sure about.
`,
          messages: [...messages, { role: 'user', content: userMsg }].map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      const reply = data.content?.map((c: any) => c.text || '').join('') || 'Sorry, try again.'
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#7425e3,#1fb1ff)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(116,37,227,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
        {open ? '✕' : '💬'}
      </button>
      {open && (
        <div style={{ position: 'fixed', bottom: 92, right: 24, zIndex: 1000, width: 360, height: 480, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', border: '0.5px solid #e8e7e4', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '0.5px solid #e8e7e4', background: 'linear-gradient(135deg,#7425e3,#1fb1ff)', borderRadius: '16px 16px 0 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>ThemisIQ Guide</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Step {currentStep + 1}: {stepNames[currentStep]}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: msg.role === 'user' ? '#7425e3' : '#f8f7f5', color: msg.role === 'user' ? '#fff' : '#0d0d0d', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
                {msg.content}
              </div>
            ))}
            {loading && <div style={{ alignSelf: 'flex-start', background: '#f8f7f5', borderRadius: '12px 12px 12px 2px', padding: '8px 12px', fontSize: 12, color: '#888784' }}>Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ padding: '0.75rem', borderTop: '0.5px solid #e8e7e4', display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask anything about your GHG inventory..." style={{ flex: 1, fontSize: 12, padding: '8px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none' }} />
            <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, background: '#7425e3', color: '#fff', border: 'none', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}>→</button>
          </div>
        </div>
      )}
    </>
  )
}

function PaywallOverlay({ frameworks }: { frameworks: string[] }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, backdropFilter: 'blur(8px)', background: 'rgba(248,247,245,0.85)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2.5rem', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid #e8e7e4', maxWidth: 480, textAlign: 'center' as const }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>Your GHG inventory is complete.</div>
        <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 300 }}>Your Scope 1 and Scope 2 emissions have been calculated to {frameworks.join(', ')} standards, with full calculation workings ready for third-party assurance. Unlock your submission-ready reports with one click.</div>
        <div style={{ background: '#f8f7f5', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' as const }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>What you unlock</div>
          {[
            'Submission-ready reports for all selected frameworks',
            'Assurance-ready evidence uploads per emission source',
            'Full calculation workings export (ISO 14064-3)',
            'Unlimited updates throughout your reporting year',
            'Priority support through your filing deadline',
          ].map(text => (
            <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#7425e3', flexShrink: 0, marginTop: 6 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.href = '/signup?upgrade=true'} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 10, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d' }}>
          Unlock My Reports →
        </button>
        <div style={{ fontSize: 11, color: '#888784', marginBottom: 12 }}>Secure payment · Instant access · Cancel anytime</div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as const, borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
          {['Your data is encrypted', 'Never sold or shared', 'PIPEDA compliant', 'Not used to train AI'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#64fe3e', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#888784' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 

function LockedDocUpload({ label }: { label: string }) {
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px dashed #e8e7e4', borderRadius: 8, padding: '10px 14px', opacity: 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>📎 {label}</span>
        <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', color: '#888784' }}>🔒 Paid plan</span>
      </div>
      <div style={{ fontSize: 11, color: '#888784', marginTop: 6, fontWeight: 300 }}>Evidence uploads are available on paid plans — keeping your inventory assurance-ready for third-party verification.</div>
    </div>
  )
}
function GHGPage() {
  const [step, setStep] = useState(0)
const searchParams = useSearchParams()
  const pack = searchParams.get('pack')
  const packFrameworks: Record<string, string[]> = {
    supplier: ['gri', 'ecovadis'],
    climate: ['ifrs', 'cdp'],
    foundation: ['gri', 'esrs'],
    investor: ['cdp', 'ifrs'],
  }
  const packNames: Record<string, string> = {
    supplier: 'Supplier Readiness',
    climate: 'Climate Readiness',
    foundation: 'ESG Foundation',
    investor: 'Investor ESG',
  }
  const defaultFrameworks = pack && packFrameworks[pack] ? packFrameworks[pack] : ['sb253']
  const [inventory, setInventory] = useState<Inventory>({
    company_name: '', reporting_year: 2024, revenue_millions: 0, employee_count: 0,
    boundary_approach: 'operational_control', california_nexus: false,
    fiscal_year_end_month: 12,
    coverage_resolutions: [],
    prior_year_s1: 0, prior_year_s2: 0,
    selected_frameworks: defaultFrameworks,
    locations: [emptyLocation('1', 'Location 1')],
  })
  const [activeLocation, setActiveLocation] = useState(0)
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const skipSavedReset = useRef(true)
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showWorkings, setShowWorkings] = useState<Record<string, boolean>>({})
  const [activeExport, setActiveExport] = useState('sb253')
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [mode, setMode] = useState<'loading' | 'list' | 'wizard'>('loading')
  const [inventoryList, setInventoryList] = useState<Array<{ id: string; company_name: string; reporting_year: number; updated_at: string }>>([])
  const isPaid = useEntitlement('ghg')
  const CONCIERGE_DEV = useHasConcierge()   // concierge gate: true when the customer holds any concierge tier entitlement

  // Decide initial view: ?id -> wizard (loads that one); else if user has inventories -> list; else -> blank wizard
  useEffect(() => {
    const loadId = searchParams.get('id')
    if (loadId) { setMode('wizard'); return }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setMode('wizard'); return }
      const { data } = await supabase
        .from('ghg_inventories')
        .select('id, company_name, reporting_year, updated_at')
        .order('updated_at', { ascending: false })
      if (data && data.length > 0) {
        setInventoryList(data)
        setMode('list')
      } else {
        setMode('wizard')
      }
    })
  }, [searchParams])

  const startNewInventory = () => {
    setInventoryId(null)
    setSaved(false)
    setStep(0)
    setInventory({
      company_name: '', reporting_year: 2024, revenue_millions: 0, employee_count: 0,
      boundary_approach: 'operational_control', california_nexus: false,
      fiscal_year_end_month: 12,
      coverage_resolutions: [],
      prior_year_s1: 0, prior_year_s2: 0,
      selected_frameworks: defaultFrameworks,
      locations: [emptyLocation('1', 'Location 1')],
    })
    setMode('wizard')
  }

  useEffect(() => {
    if (skipSavedReset.current) { skipSavedReset.current = false; return }
    setSaved(false)
  }, [inventory])
  useEffect(() => {
    if (saved) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saved])
  useEffect(() => {
    const loadId = searchParams.get('id')
    if (!loadId) return  // no id -> start clean (no auto-load of a random inventory)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { return }
      const { data, error } = await supabase
        .from('ghg_inventories')
        .select('*')
        .eq('id', loadId)
        .maybeSingle()
      if (error) { console.error('Load failed:', error); return }
      if (data) {
       skipSavedReset.current = true 
        setInventoryId(data.id)
        setInventory(inv => ({
          ...inv,
          company_name: data.company_name || '',
          reporting_year: data.reporting_year || inv.reporting_year,
          fiscal_year_end_month: data.fiscal_year_end_month || 12,
          coverage_resolutions: data.coverage_resolutions || [],
          revenue_millions: data.revenue_millions || 0,
          employee_count: data.employee_count || 0,
          boundary_approach: data.boundary_approach || 'operational_control',
          california_nexus: data.california_nexus || false,
          prior_year_s1: data.prior_year_s1 || 0,
          prior_year_s2: data.prior_year_s2 || 0,
          selected_frameworks: data.selected_frameworks || ['sb253'],
          locations: data.locations_data || inv.locations,
        }))
        setSaved(true)
      }
    })
  }, [searchParams])

  const updateLocation = (idx: number, field: keyof Location, value: any) => {
    setInventory(inv => {
      const locs = [...inv.locations]
      locs[idx] = { ...locs[idx], [field]: value }
     if (field === 'state') locs[idx].grid_region = detectGridRegion(value, 'US')
if (field === 'province') locs[idx].grid_region = value // Canadian provinces map directly
      if (field === 'country') {
        locs[idx].natural_gas_unit = normalizeNgUnit(value, locs[idx].natural_gas_unit) as any
        // UK and EU grids are national — set grid_region directly from the country.
        const gr = gridRegionForCountry(value)
        if (gr) locs[idx].grid_region = gr
        // Metric countries (CA, UK, EU) default liquid fuels to litres; US/other keep gallons.
        const ctryUp = (value || '').toUpperCase().trim()
        const metric = ctryUp === 'CA' || ctryUp === 'GB' || ctryUp === 'UK' || EU_COUNTRIES.includes(ctryUp)
        if (metric) {
          locs[idx].propane_unit = 'litres'
          locs[idx].diesel_stationary_unit = 'litres'
          locs[idx].gasoline_unit = 'litres'
          locs[idx].diesel_mobile_unit = 'litres'
        }
      }
      return { ...inv, locations: locs }
    })
  }

  const addLocation = () => {
    const id = String(inventory.locations.length + 1)
    setInventory(inv => ({ ...inv, locations: [...inv.locations, emptyLocation(id, `Location ${id}`)] }))
    setActiveLocation(inventory.locations.length)
  }

  const toggleFramework = (id: string) => {
    setInventory(inv => ({
      ...inv,
      selected_frameworks: inv.selected_frameworks.includes(id)
        ? inv.selected_frameworks.filter(f => f !== id)
        : [...inv.selected_frameworks, id]
    }))
  }

  const handleFileUpload = async (files: FileList, locIdx: number, docType: string) => {
    if (!files.length) return
    setUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUploading(false); return }
    for (const file of Array.from(files)) {
      const path = `${session.user.id}/${inventory.reporting_year}/${inventory.locations[locIdx].name.replace(/\s+/g, '_')}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('source-documents').upload(path, file)
      if (!error) {
        const doc: SourceDoc = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, file_name: file.name, document_type: docType, uploaded_at: new Date().toISOString(), file_path: path }

        // ── Concierge step 5: read bill, convert via lib (single source of truth), attach proposals to the doc. No field write yet. ──
        // Refrigerant service records are deliberately NOT concierge-read (judgment, Tier-2/3).
        if (CONCIERGE_DEV && docType !== 'service_record') {
          try {
  const res = await fetch('/api/concierge/extract', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ filePath: doc.file_path, mediaType: file.type, locationName: inventory.locations[locIdx].name }),
            })
            const json = await res.json()
            if (json?.success && Array.isArray(json.fields)) {
              const { convertToCanonical } = await import('../../../lib/unitConversions')
              const knownFuels = ['electricity', 'natural_gas', 'propane', 'diesel', 'gasoline']
              doc.extracted = json.fields
                .filter((f: any) => f && f.value != null && knownFuels.includes(f.fuelType))
                .map((f: any): ExtractedProposal => {
                  const conv = convertToCanonical(f.fuelType, f.value, f.unit)
                  const needsReview = conv.tier === 3 || f.confidence === 'low'
                  return {
                    fuelType: f.fuelType,
                    rawValue: f.value,
                    rawUnit: f.unit ?? null,
                    value: conv.value,
                    unit: conv.unit,
                    conversionNote: conv.conversionNote,
                    periodStart: f.periodStart ?? null,
                    periodEnd: f.periodEnd ?? null,
                    periodConfidence: f.periodConfidence ?? null,
                    confidence: f.confidence,
                    sourceQuote: f.sourceQuote ?? null,
                    notes: f.notes ?? null,
                    status: needsReview ? 'needs_manual_review' : 'extracted',
                  }
                })
              console.log('[concierge step5] proposals on doc:', doc.extracted)
            }
          } catch (e) {
            console.error('[concierge extract] failed', e)
          }
        }

        // Store the doc (with any proposals) in one functional update — avoids stale-closure append bug on multi-file upload.
        setInventory(inv => {
          const locs = [...inv.locations]
          locs[locIdx] = { ...locs[locIdx], source_docs: [...locs[locIdx].source_docs, doc] }
          return { ...inv, locations: locs }
        })
      }
    }
    setUploading(false)
  }

  const removeDoc = async (locIdx: number, docId: string, filePath: string) => {
    await supabase.storage.from('source-documents').remove([filePath])
    updateLocation(locIdx, 'source_docs', inventory.locations[locIdx].source_docs.filter(d => d.id !== docId))
  }

  // Concierge: update one proposal, then recompute mapped inventory fields from ALL confirmed proposals at this location.
  // fuelType + docType -> field(s). Write = SUM of confirmed proposals mapping to that field.
  // Mixed units for one field are NOT summed (would be wrong) -> those proposals flip to needs_manual_review.
  const updateProposal = (locIdx: number, docId: string, propIdx: number, patch: Partial<ExtractedProposal>) => {
    setInventory(inv => {
      const locs = [...inv.locations]

      // 1. Apply the patch to the target proposal.
      let docs = locs[locIdx].source_docs.map(d => {
        if (d.id !== docId || !d.extracted) return d
        return { ...d, extracted: d.extracted.map((p, i) => i === propIdx ? { ...p, ...patch } : p) }
      })

      // 2. Map a (docType, fuelType) pair to its inventory field(s).
      const fieldFor = (docType: string, fuelType: string): { amount: keyof Location; unit?: keyof Location } | null => {
        if (docType === 'utility_electricity' && fuelType === 'electricity') return { amount: 'electricity_kwh' }
        if (docType === 'renewable_cert' && fuelType === 'electricity') return { amount: 'renewable_electricity_kwh' }
        if (docType === 'utility_bill_gas' && fuelType === 'natural_gas') return { amount: 'natural_gas_amount', unit: 'natural_gas_unit' }
        if (docType === 'fuel_propane' && fuelType === 'propane') return { amount: 'propane_amount', unit: 'propane_unit' }
        if (docType === 'fuel_diesel' && fuelType === 'diesel') return { amount: 'diesel_stationary_amount', unit: 'diesel_stationary_unit' }
        if (docType === 'fleet_fuel' && fuelType === 'diesel') return { amount: 'diesel_mobile_amount', unit: 'diesel_mobile_unit' }
        if (docType === 'fleet_fuel' && fuelType === 'gasoline') return { amount: 'gasoline_amount', unit: 'gasoline_unit' }
        return null
      }

      // 3. Gather confirmed proposals per target field.
      const byField: Record<string, { sum: number; units: Set<string>; unitField?: keyof Location; refs: { docId: string; pi: number }[] }> = {}
      docs.forEach(d => {
        d.extracted?.forEach((p, pi) => {
          if (p.status !== 'confirmed' || p.value == null) return
          const map = fieldFor(d.document_type, p.fuelType)
          if (!map) return
          const key = String(map.amount)
          if (!byField[key]) byField[key] = { sum: 0, units: new Set(), unitField: map.unit, refs: [] }
          byField[key].sum += p.value
          if (p.unit) byField[key].units.add(p.unit)
          byField[key].refs.push({ docId: d.id, pi })
        })
      })

      // 4. Write each field. Mixed units -> don't write; flag those proposals for review.
      const loc: any = { ...locs[locIdx] }
      const flagged: { docId: string; pi: number }[] = []
      Object.entries(byField).forEach(([amountField, info]) => {
        if (info.units.size > 1) {
          flagged.push(...info.refs)
          return
        }
        loc[amountField] = info.sum
        if (info.unitField && info.units.size === 1) loc[info.unitField] = [...info.units][0]
      })

      // 5. If any field had mixed units, flip those proposals to needs_manual_review.
      if (flagged.length) {
        docs = docs.map(d => {
          if (!d.extracted) return d
          return { ...d, extracted: d.extracted.map((p, pi) => flagged.some(f => f.docId === d.id && f.pi === pi) ? { ...p, status: 'needs_manual_review' as ConciergeStatus } : p) }
        })
      }

      loc.source_docs = docs
      locs[locIdx] = loc
      return { ...inv, locations: locs }
    })
  }

  const needsMarketBased = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')
  // Concierge export gate: block export while any proposal is unconfirmed ('extracted') or flagged ('needs_manual_review').
  // No proposals (manual-entry users) -> trivially ready. Coverage-completeness is a separate check (step 9b).
  const conciergePending = inventory.locations.flatMap(l => l.source_docs).flatMap(d => d.extracted ?? []).filter(p => p.status === 'extracted' || p.status === 'needs_manual_review')
  const conciergeReady = conciergePending.length === 0
  const needsPriorYear = inventory.selected_frameworks.includes('cdp')
  const needsEmployees = inventory.selected_frameworks.includes('ecovadis')
  const needsBiogenic = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')

  const totals_ar4 = calcInventory(inventory.locations, 'AR4', inventory.reporting_year)
  const totals_ar5 = calcInventory(inventory.locations, 'AR5', inventory.reporting_year)
  const totals_ar6 = calcInventory(inventory.locations, 'AR6', inventory.reporting_year)
  const totalsByGwp: Record<GwpVersion, typeof totals_ar4> = { AR4: totals_ar4, AR5: totals_ar5, AR6: totals_ar6 }

  const STEPS = ['Reporting frameworks', 'Company setup', 'Energy & fuel data', 'Additional data', 'Review & workings', 'Export reports', 'Audit trail']
  const activeFrameworks = FRAMEWORKS.filter(f => inventory.selected_frameworks.includes(f.id))

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const payload = {
      user_id: session.user.id,
      reporting_year: inventory.reporting_year,
      fiscal_year_end_month: inventory.fiscal_year_end_month,
      company_name: inventory.company_name,
      revenue_millions: inventory.revenue_millions,
      employee_count: inventory.employee_count,
      boundary_approach: inventory.boundary_approach,
      california_nexus: inventory.california_nexus,
      prior_year_s1: inventory.prior_year_s1,
      prior_year_s2: inventory.prior_year_s2,
      selected_frameworks: inventory.selected_frameworks,
      locations_data: inventory.locations,
      scope1_total: totals_ar4.s1_total,
      scope2_location_total: totals_ar4.s2_location,
      scope2_market_total: totals_ar4.s2_market,
      scope1_intensity: inventory.revenue_millions > 0 ? totals_ar4.s1_total / inventory.revenue_millions : 0,
      scope2_intensity: inventory.revenue_millions > 0 ? totals_ar4.s2_location / inventory.revenue_millions : 0,
      status: 'draft',
      workings: buildWorkings(inventory.locations, 'AR4', inventory.reporting_year),
      updated_at: new Date().toISOString(),
    }
    if (inventoryId) {
      const { error } = await supabase.from('ghg_inventories').update(payload).eq('id', inventoryId); if (error) { alert('Save failed: ' + error.message); console.error(error); return }
    } else {
      const { data: dup } = await supabase.from('ghg_inventories').select('id').eq('company_name', inventory.company_name).eq('reporting_year', inventory.reporting_year).maybeSingle()
      if (dup) { alert(`You already have a ${inventory.reporting_year} inventory for "${inventory.company_name}". Open it from "Your inventories" instead of creating a duplicate.`); return }
      const { data, error } = await supabase.from('ghg_inventories').insert(payload).select().single(); if (error) { alert('Save failed: ' + error.message); console.error(error); return }
      if (data) setInventoryId(data.id)
    }
    setSaved(true)
    } finally { setIsSaving(false) }
  }

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Which reporting frameworks do you need?</h2>
      {pack && packNames[pack] ? (
        <p style={sectionSub}>Based on your <strong style={{ color: '#0F6E56', fontWeight: 600 }}>{packNames[pack]}</strong> selection, these are the reports you need — the highlighted frameworks below are included in your package. You can add others any time.</p>
      ) : (
        <p style={sectionSub}>Select all that apply. ThemisIQ collects your data once and generates each report automatically — no duplicate entry required.</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: '2rem' }}>
        {FRAMEWORKS.map(fw => {
          const selected = inventory.selected_frameworks.includes(fw.id)
          return (
            <div key={fw.id} onClick={() => toggleFramework(fw.id)} style={{ background: selected ? fw.bg : '#fff', border: selected ? '3px solid #0F6E56' : '1.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', cursor: 'pointer', transition: 'all 0.15s', opacity: selected ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: fw.color, background: fw.bg, border: `0.5px solid ${fw.color}33`, borderRadius: 6, padding: '2px 8px', marginBottom: 6 }}>{fw.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{fw.full}</div>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${selected ? '#0F6E56' : '#e8e7e4'}`, background: selected ? '#0F6E56' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5, fontWeight: 300, marginBottom: 8 }}>{fw.desc}</div>
              <div style={{ fontSize: 11, color: fw.color, fontWeight: 500 }}>Deadline: {fw.deadline} · GWP: {fw.gwp}</div>
            </div>
          )
        })}
      </div>
      {inventory.selected_frameworks.length > 0 && (
        <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Selected: {activeFrameworks.map(f => f.name).join(' · ')}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 300, lineHeight: 1.6 }}>
            ThemisIQ will collect your data once and produce {inventory.selected_frameworks.length} report{inventory.selected_frameworks.length > 1 ? 's' : ''}.
            {needsMarketBased && ' ESRS/GRI requires market-based Scope 2 — we\'ll ask about renewable energy contracts.'}
            {needsPriorYear && ' CDP requires prior year comparison figures.'}
            {needsBiogenic && ' ESRS/GRI requires biogenic CO₂ to be reported separately.'}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Company & inventory setup</h2>
      <p style={sectionSub}>This information appears across all your selected reports. Enter it once here.</p>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 560 }}>
        <Field label="Company legal name" hint="Appears on all report submissions">
          <input value={inventory.company_name} onChange={e => setInventory(i => ({...i, company_name: e.target.value}))} placeholder="e.g. Acme Industries Inc." style={inputStyle} />
        </Field>
        <Field label="Reporting year">
          <select value={inventory.reporting_year} onChange={e => setInventory(i => ({...i, reporting_year: Number(e.target.value)}))} style={inputStyle}>
            {[2023, 2024, 2025].map(yr => (
              <option key={yr} value={yr}>{`FY${yr} · ${periodFromYearAndEnd(yr, inventory.fiscal_year_end_month).label}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Fiscal year-end" hint="Most organizations report on the calendar year. Change this only if your reporting year ends in a month other than December.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555553', cursor: 'pointer' }}>
              <input type="checkbox" checked={inventory.fiscal_year_end_month === 12} onChange={e => setInventory(i => ({...i, fiscal_year_end_month: e.target.checked ? 12 : 3}))} />
              Calendar year (Jan–Dec)
            </label>
            {inventory.fiscal_year_end_month !== 12 && (
              <select value={inventory.fiscal_year_end_month} onChange={e => setInventory(i => ({...i, fiscal_year_end_month: Number(e.target.value)}))} style={{ ...inputStyle, maxWidth: 260 }}>
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((mn, idx) => (
                  <option key={idx + 1} value={idx + 1}>{`Fiscal year ends in ${mn}`}</option>
                ))}
              </select>
            )}
          </div>
        </Field>
        <Field label="Global annual revenue (USD millions)" hint="Required by CARB SB 253, CDP, ESRS E1, EcoVadis, and IFRS S2 for emission intensity calculations">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#555553' }}>$</span>
            <input type="number" value={inventory.revenue_millions || ''} onChange={e => setInventory(i => ({...i, revenue_millions: Number(e.target.value)}))} placeholder="1000" style={{ ...inputStyle, flex: 1 }} />
            <span style={{ fontSize: 13, color: '#555553', whiteSpace: 'nowrap' }}>million USD</span>
          </div>
        </Field>
        {needsEmployees && (
          <Field label="Total number of employees (FTE)" hint="Required by EcoVadis for per-employee intensity calculation">
            <input type="number" value={inventory.employee_count || ''} onChange={e => setInventory(i => ({...i, employee_count: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
          </Field>
        )}
        <Field label="Organizational boundary approach">
          <select value={inventory.boundary_approach} onChange={e => setInventory(i => ({...i, boundary_approach: e.target.value}))} style={inputStyle}>
            <option value="operational_control">Operational Control (most common)</option>
            <option value="financial_control">Financial Control</option>
            <option value="equity_share">Equity Share</option>
          </select>
        </Field>
        {inventory.selected_frameworks.includes('sb253') && (
          <Field label="Does your company have California nexus?" hint="California operations, employees, or sales — determines SB 253 applicability">
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setInventory(i => ({...i, california_nexus: true}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: inventory.california_nexus ? '#B91C1C' : '#f8f7f5', color: inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${inventory.california_nexus ? '#B91C1C' : '#e8e7e4'}`, }}>Yes</button>
              <button onClick={() => setInventory(i => ({...i, california_nexus: false}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: !inventory.california_nexus ? '#0d0d0d' : '#f8f7f5', color: !inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${!inventory.california_nexus ? '#0d0d0d' : '#e8e7e4'}`, }}>No</button>
            </div>
          </Field>
        )}
        {needsPriorYear && (
          <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0C447C', marginBottom: 10 }}>CDP requires prior year comparison figures</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label={`Prior year Scope 1 (${inventory.reporting_year - 1}) mtCO₂e`}>
                <input type="number" value={inventory.prior_year_s1 || ''} onChange={e => setInventory(i => ({...i, prior_year_s1: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
              </Field>
              <Field label={`Prior year Scope 2 (${inventory.reporting_year - 1}) mtCO₂e`}>
                <input type="number" value={inventory.prior_year_s2 || ''} onChange={e => setInventory(i => ({...i, prior_year_s2: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
              </Field>
            </div>
          </div>
        )}
        <Field label="List your facilities" hint="Enter name and state — we'll collect energy data for each one">
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {inventory.locations.map((loc, i) => (
              <div key={loc.id} style={{ display: 'flex', gap: 8 }}>
               <input value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} placeholder="e.g. Chicago Warehouse" style={{ ...inputStyle, flex: 1 }} />
<select value={loc.country} onChange={e => updateLocation(i, 'country', e.target.value)} style={{ ...inputStyle, width: 110 }}>
  <option value="">Country…</option>
  <option value="US">🇺🇸 USA</option>
  <option value="CA">🇨🇦 Canada</option>
  <option value="GB">🇬🇧 UK</option>
  <optgroup label="European Union">
    {EU_COUNTRY_OPTIONS.map(([code, label]) => (
      <option key={code} value={code}>{label}</option>
    ))}
  </optgroup>
  <option value="AU">🇦🇺 Australia</option>
  <option value="OTHER">Other…</option>
</select>
{loc.country === 'US' && (
  <select value={loc.state || ''} onChange={e => updateLocation(i, 'state', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">State…</option>
    {US_STATES.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
)}
{loc.country === 'CA' && (
  <select value={loc.province || ''} onChange={e => updateLocation(i, 'province', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">Province…</option>
    {['ON','BC','AB','QC','MB','SK','NS','NB','NL','PE','NT','NU','YT'].map(p => (
      <option key={p} value={p}>{p}</option>
    ))}
  </select>
)}
{loc.country && loc.country !== 'US' && loc.country !== 'CA' && gridRegionForCountry(loc.country) && (
  <span style={{ fontSize: 12, color: '#0F6E56', alignSelf: 'center', whiteSpace: 'nowrap' }}>
    Grid: {gridRegionForCountry(loc.country)} ({getGridFactor(gridRegionForCountry(loc.country), inventory.reporting_year).ef} kg/kWh)
  </span>
)}
{loc.country && loc.country !== 'US' && loc.country !== 'CA' && !gridRegionForCountry(loc.country) && (
  <input value={loc.region || ''} onChange={e => updateLocation(i, 'region', e.target.value)} placeholder="State/Region" style={{ ...inputStyle, width: 120 }} />
)}
              </div>
            ))}
            <button onClick={addLocation} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add location</button>
          </div>
        </Field>
      </div>
    </div>
  )

  const renderStep2 = () => {
    const loc = inventory.locations[activeLocation]
    const calc = calcLocation(loc, 'AR4', inventory.reporting_year)
    const detectedRegion = [...GRID_REGIONS_CA, ...GRID_REGIONS_US].find(r => r.value === loc.grid_region)
    return (
      <div>
        <h2 style={sectionHead}>Energy & fuel data</h2>
        <p style={sectionSub}>Enter what appears on your utility bills and fuel records. All calculations happen automatically — you never need to look up emission factors.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
          {inventory.locations.map((l, i) => (
            <button key={l.id} onClick={() => setActiveLocation(i)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeLocation === i ? '#0d0d0d' : '#f8f7f5', color: activeLocation === i ? '#fff' : '#555553', border: `0.5px solid ${activeLocation === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeLocation === i ? 500 : 400 }}>
              {l.name || `Location ${i+1}`}
            </button>
          ))}
          <button onClick={addLocation} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', }}>+ Add location</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>
            <QuestionCard question="Does this location use natural gas?" hint="For heating, boilers, furnaces — check your gas utility bills" checked={loc.has_natural_gas} onToggle={v => updateLocation(activeLocation, 'has_natural_gas', v)}>
              {loc.has_natural_gas && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <p style={qHint}>What unit does your gas supplier show on bills?</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {ngUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'natural_gas_unit', val)} style={unitBtn(loc.natural_gas_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total natural gas — ${inventory.reporting_year} (${loc.natural_gas_unit})`} hint="Sum of all 12 monthly bills for this location">
                    <input type="number" value={loc.natural_gas_amount || ''} onChange={e => updateLocation(activeLocation, 'natural_gas_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                    {validateNaturalGas(loc.natural_gas_amount, loc.natural_gas_unit) && (
                      <div style={{ background: "#FEF3E2", border: "0.5px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginTop: 6 }}>
                        {validateNaturalGas(loc.natural_gas_amount, loc.natural_gas_unit)}
                      </div>
                    )}
                  </Field>
                  {isPaid ? <DocUpload label="Upload gas bills" locIdx={activeLocation} docType="utility_bill_gas" docs={loc.source_docs.filter(d => d.document_type === 'utility_bill_gas')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} /> : <LockedDocUpload label="Upload gas bills" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question="Does this location use propane or LPG?" hint="For forklifts and heating — check delivery records" checked={loc.has_propane} onToggle={v => updateLocation(activeLocation, 'has_propane', v)}>
              {loc.has_propane && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {liquidUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'propane_unit', val as any)} style={unitBtn(loc.propane_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total propane purchased — ${inventory.reporting_year} (${loc.propane_unit})`}>
                    <input type="number" value={loc.propane_amount || ''} onChange={e => updateLocation(activeLocation, 'propane_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload propane delivery records" locIdx={activeLocation} docType="fuel_propane" docs={loc.source_docs.filter(d => d.document_type === 'fuel_propane')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} /> : <LockedDocUpload label="Upload propane delivery records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question="Does this location use diesel in stationary equipment?" hint="Backup generators, boilers — not vehicles" checked={loc.has_diesel_stationary} onToggle={v => updateLocation(activeLocation, 'has_diesel_stationary', v)}>
              {loc.has_diesel_stationary && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {liquidUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'diesel_stationary_unit', val as any)} style={unitBtn(loc.diesel_stationary_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total diesel in stationary equipment — ${inventory.reporting_year}`}>
                    <input type="number" value={loc.diesel_stationary_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_stationary_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload diesel purchase records" locIdx={activeLocation} docType="fuel_diesel" docs={loc.source_docs.filter(d => d.document_type === 'fuel_diesel')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} /> : <LockedDocUpload label="Upload diesel purchase records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question="Does this location have company-owned vehicles or mobile equipment?" hint="Delivery trucks, forklifts, company cars — check fleet fuel cards" checked={loc.has_mobile} onToggle={v => updateLocation(activeLocation, 'has_mobile', v)}>
              {loc.has_mobile && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <Field label={`Gasoline for company vehicles — ${inventory.reporting_year}`} hint="Cars, light trucks, vans">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.gasoline_amount || ''} onChange={e => updateLocation(activeLocation, 'gasoline_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.gasoline_unit} onChange={e => updateLocation(activeLocation, 'gasoline_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        {liquidUnitOptions(loc.country).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  <Field label={`Diesel for company vehicles — ${inventory.reporting_year}`} hint="Trucks, heavy equipment, forklifts">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.diesel_mobile_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_mobile_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.diesel_mobile_unit} onChange={e => updateLocation(activeLocation, 'diesel_mobile_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        {liquidUnitOptions(loc.country).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  {isPaid ? <DocUpload label="Upload fleet fuel records" locIdx={activeLocation} docType="fleet_fuel" docs={loc.source_docs.filter(d => d.document_type === 'fleet_fuel')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} /> : <LockedDocUpload label="Upload fleet fuel records" />}
                </div>
              )}
            </QuestionCard>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Does this location have refrigeration or cooling?</div>
              <p style={qHint}>Large commercial refrigeration systems are common emission sources.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', true); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.uses_ammonia ? '#0F6E56' : '#f8f7f5', color: loc.uses_ammonia ? '#fff' : '#555553', border: `0.5px solid ${loc.uses_ammonia ? '#0F6E56' : '#e8e7e4'}`, }}>Ammonia (NH₃)</button>
                <button onClick={() => { updateLocation(activeLocation, 'has_hfc_refrigerants', true); updateLocation(activeLocation, 'uses_ammonia', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.has_hfc_refrigerants ? '#7425e3' : '#f8f7f5', color: loc.has_hfc_refrigerants ? '#fff' : '#555553', border: `0.5px solid ${loc.has_hfc_refrigerants ? '#7425e3' : '#e8e7e4'}`, }}>HFC refrigerants</button>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', false); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#555553' : '#f8f7f5', color: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#fff' : '#555553', border: '0.5px solid #e8e7e4', }}>None</button>
              </div>
              {loc.uses_ammonia && <div style={{ background: '#E1F5EE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0F6E56', fontWeight: 500 }}>✓ Ammonia has zero global warming potential — no further data needed</div>}
              {loc.has_hfc_refrigerants && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ background: '#FEF3E2', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#633806' }}>Check refrigeration service records — refrigerant purchased for top-up = refrigerant leaked (GHG Protocol methodology)</div>
                  <Field label="Refrigerant type"><select value={loc.refrigerant_type} onChange={e => updateLocation(activeLocation, 'refrigerant_type', e.target.value)} style={inputStyle}><option value="r410a">R-410A</option><option value="r22">R-22</option><option value="r134a">R-134a</option><option value="r404a">R-404A</option><option value="r507">R-507</option></select></Field>
                  <Field label="Refrigerant purchased for top-up this year (kg)" hint="From service records or supplier invoices">
                    <input type="number" value={loc.refrigerant_purchased_kg || ''} onChange={e => updateLocation(activeLocation, 'refrigerant_purchased_kg', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload service records" locIdx={activeLocation} docType="service_record" docs={loc.source_docs.filter(d => d.document_type === 'service_record')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} /> : <LockedDocUpload label="Upload service records" />}
                </div>
              )}
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Purchased electricity</div>
              <p style={qHint}>Check your electricity utility bills — kWh is always shown.</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <Field label={`Total electricity — ${inventory.reporting_year} (kWh)`} hint="Sum of all 12 monthly bills for this location">
                  <input type="number" value={loc.electricity_kwh || ''} onChange={e => updateLocation(activeLocation, 'electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                {validateElectricity(loc.electricity_kwh) && (
                  <div style={{ background: "#FEF3E2", border: "0.5px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginTop: 6 }}>
                    {validateElectricity(loc.electricity_kwh)}
                  </div>
                )}
                {loc.state
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region auto-detected: <strong>{detectedRegion?.label}</strong> — {detectedRegion?.ef} kg CO₂e/kWh (eGRID 2023)</div>
                  : (loc.grid_region.startsWith('EU_') || loc.grid_region === 'UK')
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region: <strong>{loc.grid_region}</strong> — {getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg CO₂e/kWh ({loc.grid_region === 'UK' ? 'DEFRA 2025' : 'EEA 2023'})</div>
                  : <Field label="Grid region"><select value={loc.grid_region} onChange={e => updateLocation(activeLocation, 'grid_region', e.target.value)} style={inputStyle}><optgroup label="Canada">{GRID_REGIONS_CA.map(r => <option key={r.value} value={r.value}>{r.label} — {r.ef} kg CO₂e/kWh</option>)}</optgroup><optgroup label="United States">{GRID_REGIONS_US.map(r => <option key={r.value} value={r.value}>{r.label} — {r.ef} kg CO₂e/kWh</option>)}</optgroup></select></Field>
                }
                {loc.country === 'US' && (
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '12px 14px' }}>
                    <Field label="eGRID subregion (for market-based Scope 2)" hint="Required only for ESRS E1 / GRI 305 market-based reporting. Leave blank if not reporting those — market-based will use the grid-average factor as a conservative fallback.">
                      <select value={loc.residual_region || ''} onChange={e => updateLocation(activeLocation, 'residual_region', e.target.value)} style={inputStyle}>
                        <option value="">Select your eGRID subregion…</option>
                        {US_SUBREGIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </Field>
                    <a href="https://www.epa.gov/egrid/power-profiler" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0C447C', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>🔎 Find your subregion with EPA Power Profiler (enter your ZIP) →</a>
                  </div>
                )}
                {isPaid ? <DocUpload label="Upload electricity bills" locIdx={activeLocation} docType="utility_electricity" docs={loc.source_docs.filter(d => d.document_type === 'utility_electricity')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} /> : <LockedDocUpload label="Upload electricity bills" />}
              </div>
            </div>
          </div>
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{loc.name} — live results</div>
              {[
                { label: 'Heating & fuel', val: calc.s1_stationary, color: '#7425e3' },
                { label: 'Vehicles', val: calc.s1_mobile, color: '#1fb1ff' },
                { label: 'Refrigerants', val: calc.s1_fugitive, color: '#ba7517' },
                { label: 'Scope 1 total', val: calc.s1_total, color: '#fff', bold: true },
                { label: 'Scope 2 (electricity)', val: calc.s2_location, color: '#64fe3e', bold: true },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 12, color: bold ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: bold ? 600 : 300 }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: bold ? 700 : 400 }}>{val.toFixed(2)} mt</span>
                </div>
              ))}
              <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>EPA 2024 (US) · ECCC v3.0 (CA) · DEFRA 2025 (UK) · IPCC AR4 GWP · eGRID 2023</div>
              {validateCompleteness(loc).map((w, i) => (
                <div key={i} style={{ marginTop: 8, background: "rgba(254,243,226,0.1)", border: "0.5px solid rgba(253,230,138,0.3)", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "#fde68a", lineHeight: 1.5 }}>{w}</div>
              ))}
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>All locations</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#7425e3' }}>{totals_ar4.s1_total.toFixed(2)} mt Scope 1</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginTop: 4 }}>{totals_ar4.s2_location.toFixed(2)} mt Scope 2</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStep3 = () => {
    const needsExtra = needsMarketBased || needsBiogenic
    if (!needsExtra) return (
      <div>
        <h2 style={sectionHead}>Additional data</h2>
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '1.5rem' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0F6E56', marginBottom: 4 }}>✓ No additional data required for your selected frameworks</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 300 }}>CARB SB 253, CDP, EcoVadis, and IFRS S2 only require the energy data you've already entered. Click Continue to review your results.</div>
        </div>
      </div>
    )
    return (
      <div>
        <h2 style={sectionHead}>Additional data</h2>
        <p style={sectionSub}>Your selected frameworks require some additional information beyond standard energy data.</p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 700 }}>
          {needsMarketBased && (
            <div style={{ background: '#fff', border: '0.5px solid #7425e3', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7425e3', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ESRS E1 / GRI 305 — Market-based Scope 2</div>
              <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>ESRS E1 and GRI 305 require you to report Scope 2 on both a location-based AND market-based basis. Market-based Scope 2 subtracts electricity from renewable energy contracts (PPAs, RECs, green tariffs).</p>
              {inventory.locations.map((loc, i) => (
                <div key={loc.id} style={{ marginBottom: 14 }}>
                  <Field label={`${loc.name} — Renewable electricity (kWh)`} hint="Enter kWh covered by PPAs, RECs, or green tariffs. Leave 0 if none.">
                    <input type="number" value={loc.renewable_electricity_kwh || ''} onChange={e => updateLocation(i, 'renewable_electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                </div>
              ))}
              {isPaid ? <DocUpload label="Upload renewable energy certificates or PPA contracts" locIdx={0} docType="renewable_cert" docs={inventory.locations[0].source_docs.filter(d => d.document_type === 'renewable_cert')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} /> : <LockedDocUpload label="Upload renewable energy certificates or PPA contracts" />}
            </div>
          )}
          {needsBiogenic && (
            <div style={{ background: '#fff', border: '0.5px solid #0F6E56', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ESRS E1 / GRI 305 — Biogenic CO₂</div>
              <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>ESRS E1 and GRI 305 require biogenic CO₂ emissions to be reported separately from fossil fuel emissions. Biogenic CO₂ comes from burning biomass, wood waste, or agricultural residues.</p>
              {inventory.locations.map((loc, i) => (
                <div key={loc.id} style={{ marginBottom: 14 }}>
                  <Field label={`${loc.name} — Biogenic CO₂ (mtCO₂)`} hint="From burning biomass, wood waste, or agricultural residues — 0 if none">
                    <input type="number" value={loc.biogenic_co2_mt || ''} onChange={e => updateLocation(i, 'biogenic_co2_mt', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

    const renderStep4 = () => {
    const ar5 = totals_ar5
    const rev = inventory.revenue_millions
    const emp = inventory.employee_count
    return (
      <div>
        <h2 style={sectionHead}>Review, results & calculation workings</h2>
        <p style={sectionSub}>{inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri') ? `Your Scope 1 & 2 inventory for ${inventory.company_name || 'your company'}, ${inventory.reporting_year}. Scope 3 required — complete it after export.` : `Your complete GHG inventory for ${inventory.company_name || 'your company'}, ${inventory.reporting_year}.`}</p>
        <div style={{ position: 'relative' }}>
          {!isPaid && <PaywallOverlay frameworks={activeFrameworks.map(f => f.name)} />}
          <div style={{ filter: isPaid ? 'none' : 'blur(4px)', pointerEvents: isPaid ? 'auto' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: '2rem' }}>
              {activeFrameworks.map(fw => {
                const totals = totalsByGwp[fw.gwp as GwpVersion]
                return (
                  <div key={fw.id} style={{ background: fw.bg, border: `0.5px solid ${fw.color}33`, borderRadius: 10, padding: '1.25rem' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: fw.color, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>{fw.name} — GWP {fw.gwp}</div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: '#888784' }}>Scope 1</div>
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.s1_total.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: '#888784' }}>Scope 2 (location)</div>
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.s2_location.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                    </div>
                    {(fw.id === 'esrs' || fw.id === 'gri') && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#888784' }}>Scope 2 (market)</div>
                        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.s2_market.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                      </div>
                    )}
                    {rev > 0 && <div style={{ fontSize: 11, color: '#888784', marginTop: 4 }}>Intensity: {(totals.s1_total / rev).toFixed(4)} mt/$M</div>}
                    {emp > 0 && fw.id === 'ecovadis' && <div style={{ fontSize: 11, color: '#888784' }}>Per employee: {(totals.s1_total / emp * 1000).toFixed(2)} kgCO₂e</div>}
                  </div>
                )
              })}
            </div>
            {inventory.locations.map((loc, i) => {
              const wGwp: GwpVersion = (FRAMEWORKS.find(f => f.id === activeExport)?.gwp as GwpVersion) || (activeFrameworks[0]?.gwp as GwpVersion) || 'AR6'
              const c = calcLocation(loc, wGwp, inventory.reporting_year)
              const key = `loc_${i}`
              return (
                <div key={loc.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                  <div onClick={() => setShowWorkings(w => ({...w, [key]: !w[key]}))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{loc.name}{loc.state && ` — ${loc.state}`}</div>
                      <div style={{ fontSize: 12, color: '#888784', marginTop: 2 }}>S1: {c.s1_total.toFixed(2)} mt · S2: {c.s2_location.toFixed(2)} mt · Total: {(c.s1_total + c.s2_location).toFixed(2)} mt</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#888784' }}>{showWorkings[key] ? '▲ Hide' : '▼ Show workings'}</span>
                  </div>
                  {showWorkings[key] && (
                    <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', margin: '1rem 0 0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>Calculation workings — ISO 14064-3 / ISAE 3410 transparency</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr>{['Source', 'Activity data', 'Emission factor', 'Factor source', 'GWP basis', 'Result (mtCO₂e)'].map(h => <th key={h} style={{ background: '#f8f7f5', padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#888784', borderBottom: '0.5px solid #e8e7e4' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {loc.has_natural_gas && loc.natural_gas_amount > 0 && (() => {
                            const ef = pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF)
                            const g = GWP[wGwp]
                            const efCo2e = ef.co2 + ef.ch4 * g.CH4_fossil + ef.n2o * g.N2O
                            const total = efCo2e * loc.natural_gas_amount / 1000
                            return <tr><td style={wTd}>Natural gas</td><td style={wTd}>{loc.natural_gas_amount} {loc.natural_gas_unit}</td><td style={wTd}>{efCo2e.toFixed(3)} kg CO₂e/{loc.natural_gas_unit}</td><td style={wTd}>{combustionSource(loc)}</td><td style={wTd}>{wGwp}</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.has_propane && loc.propane_amount > 0 && (() => {
                            const ef = pickEF(loc, `propane_${loc.propane_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
                            const g = GWP[wGwp]
                            const efCo2e = ef.co2 + ef.ch4 * g.CH4_fossil + ef.n2o * g.N2O
                            const total = efCo2e * loc.propane_amount / 1000
                            return <tr><td style={wTd}>Propane</td><td style={wTd}>{loc.propane_amount} {loc.propane_unit}</td><td style={wTd}>{efCo2e.toFixed(3)} kg CO₂e/{loc.propane_unit === 'gallons' ? 'gal' : 'L'}</td><td style={wTd}>{combustionSource(loc)}</td><td style={wTd}>{wGwp}</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.has_diesel_stationary && loc.diesel_stationary_amount > 0 && (() => {
                            const ef = pickEF(loc, `diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
                            const g = GWP[wGwp]
                            const efCo2e = ef.co2 + ef.ch4 * g.CH4_fossil + ef.n2o * g.N2O
                            const total = efCo2e * loc.diesel_stationary_amount / 1000
                            return <tr><td style={wTd}>Diesel (stationary)</td><td style={wTd}>{loc.diesel_stationary_amount} {loc.diesel_stationary_unit}</td><td style={wTd}>{efCo2e.toFixed(3)} kg CO₂e/{loc.diesel_stationary_unit === 'gallons' ? 'gal' : 'L'}</td><td style={wTd}>{combustionSource(loc)}</td><td style={wTd}>{wGwp}</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.has_fuel_oil && loc.fuel_oil_gallons > 0 && (() => {
                            const ef = pickEF(loc, 'fuel_oil_gallon')
                            const g = GWP[wGwp]
                            const efCo2e = ef.co2 + ef.ch4 * g.CH4_fossil + ef.n2o * g.N2O
                            const total = efCo2e * loc.fuel_oil_gallons / 1000
                            return <tr><td style={wTd}>Fuel oil</td><td style={wTd}>{loc.fuel_oil_gallons} gallons</td><td style={wTd}>{efCo2e.toFixed(3)} kg CO₂e/gal</td><td style={wTd}>{combustionSource(loc)}</td><td style={wTd}>{wGwp}</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.has_mobile && loc.gasoline_amount > 0 && (() => {
                            const ef = pickEF(loc, `gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
                            const g = GWP[wGwp]
                            const efCo2e = ef.co2 + ef.ch4 * g.CH4_fossil + ef.n2o * g.N2O
                            const total = efCo2e * loc.gasoline_amount / 1000
                            return <tr><td style={wTd}>Gasoline (mobile)</td><td style={wTd}>{loc.gasoline_amount} {loc.gasoline_unit}</td><td style={wTd}>{efCo2e.toFixed(3)} kg CO₂e/{loc.gasoline_unit === 'gallons' ? 'gal' : 'L'}</td><td style={wTd}>{combustionSource(loc)}</td><td style={wTd}>{wGwp}</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.has_mobile && loc.diesel_mobile_amount > 0 && (() => {
                            const ef = pickEF(loc, `diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
                            const g = GWP[wGwp]
                            const efCo2e = ef.co2 + ef.ch4 * g.CH4_fossil + ef.n2o * g.N2O
                            const total = efCo2e * loc.diesel_mobile_amount / 1000
                            return <tr><td style={wTd}>Diesel (mobile)</td><td style={wTd}>{loc.diesel_mobile_amount} {loc.diesel_mobile_unit}</td><td style={wTd}>{efCo2e.toFixed(3)} kg CO₂e/{loc.diesel_mobile_unit === 'gallons' ? 'gal' : 'L'}</td><td style={wTd}>{combustionSource(loc)}</td><td style={wTd}>{wGwp}</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {!loc.uses_ammonia && loc.has_hfc_refrigerants && loc.refrigerant_purchased_kg > 0 && (() => {
                            const ref_gwp = REFRIGERANT_GWP[loc.refrigerant_type]?.[wGwp] ?? 0
                            const total = loc.refrigerant_purchased_kg * ref_gwp / 1000
                            return <tr><td style={wTd}>Refrigerant ({loc.refrigerant_type})</td><td style={wTd}>{loc.refrigerant_purchased_kg} kg</td><td style={wTd}>GWP {ref_gwp}</td><td style={wTd}>IPCC {wGwp} / GHG Protocol</td><td style={wTd}>{wGwp}</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.electricity_kwh > 0 && (() => {
                            const ef = getGridFactor(loc.grid_region, inventory.reporting_year).ef
                            return <tr style={{ background: '#f8f7f5' }}><td style={wTd}>Electricity (S2 location)</td><td style={wTd}>{loc.electricity_kwh.toLocaleString()} kWh</td><td style={wTd}>{ef.toFixed(4)} kg CO₂e/kWh</td><td style={wTd}>{EF_SOURCES.electricity} — {loc.grid_region}</td><td style={wTd}>N/A</td><td style={{ ...wTd, fontWeight: 600, color: '#0F6E56' }}>{(loc.electricity_kwh * ef / 1000).toFixed(4)}</td></tr>
                          })()}
                          {loc.electricity_kwh > 0 && needsMarketBased && (() => {
                            const mGwp: GwpVersion = (FRAMEWORKS.find(f => (f.id === 'esrs' || f.id === 'gri') && inventory.selected_frameworks.includes(f.id))?.gwp as GwpVersion) || 'AR6'
                            const resRegion = loc.residual_region || (loc.grid_region.startsWith('EU_') ? loc.grid_region : '')
                            const res = getResidualFactor(resRegion, inventory.reporting_year, mGwp)
                            const gf = getGridFactor(loc.grid_region, inventory.reporting_year)
                            const uncovered = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
                            const mktEf = res.applicable ? res.ef : gf.ef
                            const total = uncovered * mktEf / 1000
                            const factorLabel = res.applicable ? `${mktEf.toFixed(4)} kg CO₂e/kWh (residual mix · ${res.usedRegion})` : `${mktEf.toFixed(4)} kg CO₂e/kWh (location-factor fallback)`
                            const sourceLabel = `${res.source}${res.vintage && res.vintage !== 'n/a' ? ` · vintage: ${res.vintage}` : ''}${res.note ? ` · ${res.note}` : ''}`
                            return <tr style={{ background: '#f8f7f5' }}><td style={wTd}>Electricity (S2 market-based)</td><td style={wTd}>{uncovered.toLocaleString()} kWh uncovered</td><td style={wTd}>{factorLabel}</td><td style={wTd}>{sourceLabel}</td><td style={wTd}>{res.applicable ? mGwp : 'location-based'}</td><td style={{ ...wTd, fontWeight: 600, color: '#0F6E56' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0 && (() => {
                            const total = loc.purchased_steam_mmbtu * EF.steam_mmbtu / 1000
                            return <tr style={{ background: '#f8f7f5' }}><td style={wTd}>Purchased steam (S2 location)</td><td style={wTd}>{loc.purchased_steam_mmbtu} mmbtu</td><td style={wTd}>{EF.steam_mmbtu} kg CO₂e/mmbtu</td><td style={wTd}>{EF_SOURCES.combustion}</td><td style={wTd}>N/A</td><td style={{ ...wTd, fontWeight: 600, color: '#0F6E56' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          <tr style={{ background: '#0d0d0d' }}><td colSpan={5} style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>TOTAL — {loc.name}</td><td style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>{(c.s1_total + c.s2_location).toFixed(4)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Assurance readiness — ISO 14064-3 / ISAE 3410</div>
              {[
                { label: 'Emission factors cited with source and year', done: true, note: 'EPA 2024 (US) · ECCC v3.0 (CA) · DEFRA 2025 (UK) · eGRID 2023 · IPCC AR6 GWP' },
                { label: 'Calculation workings documented per source', done: true, note: 'Full formula shown for every emission source' },
                { label: 'Organizational boundary documented', done: !!inventory.boundary_approach, note: inventory.boundary_approach.replace(/_/g, ' ') },
                { label: 'Source documents uploaded', done: isPaid && inventory.locations.some(l => l.source_docs.length > 0), note: isPaid ? `${inventory.locations.reduce((a, l) => a + l.source_docs.length, 0)} documents` : 'Available on paid plan' },
                { label: 'All locations included in boundary', done: inventory.locations.length > 0, note: `${inventory.locations.length} location(s)` },
              ].map(({ label, done, note }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{done ? '✅' : '⬜'}</span>
                  <div>
                    <div style={{ fontSize: 12, color: done ? '#fff' : 'rgba(255,255,255,0.4)', fontWeight: done ? 500 : 300 }}>{label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
 const renderStep5 = () => {
    return (
      <div>
        <h2 style={sectionHead}>Export your reports</h2>
        {(() => {
          const fw = inventory.selected_frameworks
          const year = inventory.reporting_year
          const needsScope3Now = fw.includes('esrs') || fw.includes('csrd') || fw.includes('gri')
          const scope3Encouraged = fw.includes('cdp') || fw.includes('ecovadis')
          const sb253Only = fw.includes('sb253') && fw.length === 1
          const sb253FirstYear = sb253Only && year <= 2024

          if (needsScope3Now) return (
            <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ Scope 3 required for your selected frameworks</div>
                <div style={{ fontSize: 12, color: '#555553' }}>CSRD ESRS E1-6 and GRI 305-3 require Scope 3 disclosure. Complete your Scope 3 inventory before finalising your report.</div>
              </div>
              <a href="/dashboard/scope3" style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#B91C1C', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Complete Scope 3 →</a>
            </div>
          )

          if (sb253FirstYear) return (
            <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 4 }}>SB 253 — Scope 3 not required for your first reporting year</div>
                <div style={{ fontSize: 12, color: '#555553' }}>Scope 3 becomes mandatory from FY2025 data (due 2026). Start your inventory now to get ahead of the deadline.</div>
              </div>
              <a href="/dashboard/scope3" style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#0C447C', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Start Scope 3 inventory →</a>
            </div>
          )

          if (scope3Encouraged) return (
            <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>Scope 3 will improve your CDP/EcoVadis score</div>
                <div style={{ fontSize: 12, color: '#555553' }}>CDP and EcoVadis score Scope 3 disclosure. Cat.1 (purchased goods) and Cat.6 (business travel) are the highest-impact categories to start with.</div>
              </div>
              <a href="/dashboard/scope3" style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#ba7517', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Calculate Scope 3 →</a>
            </div>
          )

          return (
            <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E56', marginBottom: 4 }}>Ready to calculate your Scope 3 emissions?</div>
                <div style={{ fontSize: 12, color: '#555553' }}>This wizard covers Scope 1 & 2. Use the Scope 3 Complete Calculator for all 15 categories — GHG Protocol aligned.</div>
              </div>
              <a href="/dashboard/scope3" style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#0F6E56', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Calculate Scope 3 →</a>
            </div>
          )
        })()}
        <p style={sectionSub}>One inventory — {activeFrameworks.length} report{activeFrameworks.length > 1 ? 's' : ''}. Unlock your paid plan to download.</p>
        <div style={{ position: 'relative' }}>
          {!isPaid && <PaywallOverlay frameworks={activeFrameworks.map(f => f.name)} />}
          <div style={{ filter: isPaid ? 'none' : 'blur(4px)', pointerEvents: isPaid ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
              {activeFrameworks.map(fw => (
                <button key={fw.id} onClick={() => setActiveExport(fw.id)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeExport === fw.id ? fw.color : '#f8f7f5', color: activeExport === fw.id ? '#fff' : '#555553', border: `0.5px solid ${activeExport === fw.id ? fw.color : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeExport === fw.id ? 500 : 400 }}>
                  {fw.name}
                </button>
              ))}
            </div>
            {activeFrameworks.map(fw => {
              if (fw.id !== activeExport) return null
              const totals = totalsByGwp[fw.gwp as GwpVersion]
              const rev = inventory.revenue_millions
              const emp = inventory.employee_count
              return (
                <div key={fw.id}>
                  <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '2rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: fw.color, background: fw.bg, borderRadius: 6, padding: '3px 10px', marginBottom: 12 }}>{fw.name} — {fw.full}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1.5rem' }}>
                      {[
                        ['Company', inventory.company_name || '—'],
                        ['Reporting year', String(inventory.reporting_year)],
                        ['GWP basis', `IPCC ${fw.gwp}`],
                        ['Scope 1 total', `${totals.s1_total.toFixed(4)} mtCO₂e`],
                        ['Scope 2 (location)', `${totals.s2_location.toFixed(4)} mtCO₂e`],
                        ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Scope 2 (market)', `${totals.s2_market.toFixed(4)} mtCO₂e`]] : []),
                        ...(rev > 0 ? [['S1 intensity', `${(totals.s1_total/rev).toFixed(6)} mtCO₂e/$M`]] : []),
                        ...(emp > 0 && fw.id === 'ecovadis' ? [['S1 per employee', `${(totals.s1_total/emp*1000).toFixed(2)} kgCO₂e`]] : []),
                        ['Deadline', fw.deadline],
                      ].map(([label, val]) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {!conciergeReady && (
                      <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 2 }}>⚠ {conciergePending.length} uploaded figure{conciergePending.length > 1 ? 's' : ''} still need{conciergePending.length > 1 ? '' : 's'} your confirmation</div>
                        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>Export is locked until every figure read from your bills is confirmed (or any flagged item is resolved). Check the Energy &amp; fuel data step.</div>
                      </div>
                    )}
                    <button onClick={() => dataConfirmed && conciergeReady && generateExport(fw.id)} style={{ fontSize: 14, fontWeight: 500, opacity: (dataConfirmed && conciergeReady) ? 1 : 0.4, cursor: (dataConfirmed && conciergeReady) ? "pointer" : "not-allowed", padding: '12px 28px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', }}>
                    <div style={{ background: "#fff", border: "1px solid #e8e7e4", borderRadius: 8, padding: "14px 16px", marginTop: 16, marginBottom: 16 }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#555553", lineHeight: 1.6 }}>I confirm that the data entered is accurate to the best of my knowledge and has been sourced from actual utility bills and operational records. I understand that ThemisIQ applies the correct methodology to the data I provide, and that accuracy of the underlying data is my responsibility.</span>
                      </label>
                    </div>
                      ⬇ Download {fw.name} Report (CSV)
                    </button>
                    <button onClick={() => dataConfirmed && conciergeReady && generateAssurance()} style={{ fontSize: 14, fontWeight: 500, opacity: (dataConfirmed && conciergeReady) ? 1 : 0.4, cursor: (dataConfirmed && conciergeReady) ? 'pointer' : 'not-allowed', padding: '12px 28px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', marginLeft: 10 }}>Download Full Assurance Package (PDF)</button>
                  </div>
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
                    <strong>Disclaimer:</strong> This report was generated by the ThemisIQ platform and is provided for informational and planning purposes only. It does not constitute legal advice, regulatory assurance, or a professional opinion. All emissions data requires third-party verification before formal submission.
                  </div>
                </div>
              )
            })}
          </div>
          <VerifierInvite inventoryId={inventoryId} />
        </div>
      </div>
    )
  }

  const generateAssurance = async () => {
    const { data: auditRows } = await supabase.from('audit_log').select('*').eq('table_name', 'ghg_inventories').eq('record_id', inventoryId).order('created_at', { ascending: false })
    // Per-location residual-mix citation for the PDF (only when a market-based framework is in scope).
    const needsMkt = activeFrameworks.some(f => f.id === 'esrs' || f.id === 'gri')
    const residualRows: string[][] = needsMkt
      ? inventory.locations.filter(l => l.electricity_kwh > 0).map(l => {
          const resRegion = l.residual_region || (l.grid_region.startsWith('EU_') ? l.grid_region : '')
          const res = getResidualFactor(resRegion, inventory.reporting_year, 'AR6')
          return [
            l.name || 'Location',
            res.applicable ? res.source : 'Location-factor fallback',
            res.applicable ? `${res.vintage}${res.note ? ` — ${res.note}` : ''}` : (res.note || '—'),
          ]
        })
      : []
    generateAssurancePDF(inventory as any, totals_ar4 as any, totals_ar5 as any, totals_ar6 as any, activeFrameworks as any, (auditRows as any) || [], EF_SOURCES, residualRows)
  }

  const generateExport = async (frameworkId: string) => {
    const fw = FRAMEWORKS.find(f => f.id === frameworkId)!
    const totals = totalsByGwp[fw.gwp as GwpVersion]
    const rev = inventory.revenue_millions
    const emp = inventory.employee_count
    const header = [
      [`${fw.full} — GHG Emissions Report`],
      [`Generated by ThemisIQ · www.themisiq.co · ${new Date().toLocaleDateString()}`],
      ['GWP basis', `IPCC ${fw.gwp}`],
      [''],
      ['ORGANIZATION'],
      ['Company', inventory.company_name],
      ['Reporting year', inventory.reporting_year],
      ['Revenue (USD millions)', rev],
      ...(emp > 0 ? [['Employees (FTE)', emp]] : []),
      ['Boundary', inventory.boundary_approach.replace(/_/g, ' ')],
      ['Locations', inventory.locations.length],
      [''],
      ['RESULTS'],
      ['Scope 1 total (mtCO₂e)', totals.s1_total.toFixed(4)],
      ['Scope 2 location-based (mtCO₂e)', totals.s2_location.toFixed(4)],
      ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Scope 2 market-based (mtCO₂e)', totals.s2_market.toFixed(4)]] : []),
      ...(rev > 0 ? [['S1 intensity (mtCO₂e/$M revenue)', (totals.s1_total / rev).toFixed(6)]] : []),
      [''],
      ['METHODS'],
      ['Combustion factors', EF_SOURCES.combustion],
      ['Electricity factors', EF_SOURCES.electricity],
      ['GWP values', fw.gwp === 'AR4' ? EF_SOURCES.gwp_ar4 : fw.gwp === 'AR5' ? EF_SOURCES.gwp_ar5 : EF_SOURCES.gwp_ar6],
      ...((fw.id === 'esrs' || fw.id === 'gri')
        ? [
            ['Market-based Scope 2', 'Residual-mix factor applied to uncovered load; covered (contractual) kWh counted at zero'],
            ...inventory.locations.filter(l => l.electricity_kwh > 0).map(l => {
              const resRegion = l.residual_region || (l.grid_region.startsWith('EU_') ? l.grid_region : '')
              const res = getResidualFactor(resRegion, inventory.reporting_year, fw.gwp as GwpVersion)
              return [`Residual factor — ${l.name}`, res.applicable ? `${res.source} · vintage: ${res.vintage}${res.note ? ` · ${res.note}` : ''}` : `Location-factor fallback${res.note ? ` · ${res.note}` : ''}`]
            }),
          ]
        : []),
      [''],
      ['LOCATION BREAKDOWN'],
      ['Location', 'State', 'S1 Total', 'S2 Location'],
      ...inventory.locations.map(loc => {
        const c = calcLocation(loc, fw.gwp as 'AR4' | 'AR5', inventory.reporting_year)
        return [loc.name, loc.state, c.s1_total.toFixed(4), c.s2_location.toFixed(4)]
      }),
      [''],
      ['DISCLAIMER'],
      ['This report was generated by the ThemisIQ platform for informational purposes only.'],
      ['All emissions require third-party verification before formal submission.'],
    ]
    const csv = header.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ThemisIQ_${fw.id.toUpperCase()}_${inventory.company_name.replace(/\s+/g,'_')}_${inventory.reporting_year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (mode === 'loading') {
    return <div style={{ background: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888784', fontSize: 14 }}>Loading…</div>
  }
  if (mode === 'list') {
    return (
      <div style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a href="/dashboard" style={{ textDecoration: 'none' }}><img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} /></a>
            <span style={{ fontSize: 12, color: '#888784' }}>/ GHG Inventory</span>
          </div>
        </nav>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color: '#0d0d0d', margin: 0 }}>Your inventories</h1>
            <button onClick={startNewInventory} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New inventory</button>
          </div>
          {inventoryList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#888784', fontSize: 14 }}>No inventories yet. Click &ldquo;New inventory&rdquo; to begin.</div>
          ) : (
            inventoryList.map(inv => (
              <a key={inv.id} href={`/dashboard/ghg?id=${inv.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '16px 20px', marginBottom: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d' }}>{inv.company_name || 'Untitled inventory'}</div>
                    <div style={{ fontSize: 12, color: '#888784', marginTop: 3 }}>Reporting year {inv.reporting_year} · Updated {new Date(inv.updated_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#7425e3' }}>Open →</span>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/dashboard" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
          </a>
          <span style={{ fontSize: 12, color: '#888784' }}>/ GHG Inventory</span>
          {activeFrameworks.length > 0 && <span style={{ fontSize: 11, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 99, padding: '2px 10px', color: '#555553' }}>{activeFrameworks.map(f => f.name).join(' · ')}</span>}
        </div>
        <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, background: saved ? '#E1F5EE' : 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', border: saved ? '1px solid #0F6E56' : 'none', cursor: 'pointer', color: saved ? '#0F6E56' : '#0d0d0d', fontWeight: saved ? 500 : 700 }}>
          {isSaving ? 'Saving…' : saved ? '✓ Saved' : 'Save draft'}
        </button>
      </nav>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', display: 'flex', overflowX: 'auto' as const }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ fontSize: 12, padding: '14px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : '#888784', cursor: 'pointer', fontWeight: step === i ? 500 : 400, whiteSpace: 'nowrap' as const }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem 120px' }}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && <><AuditTrail inventoryId={inventoryId} step={step} /><VerifierInvite inventoryId={inventoryId} /></>}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
          <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0} style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', cursor: step === 0 ? 'not-allowed' : 'pointer', color: '#555553', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
          {step < STEPS.length - 1 && (
            <button onClick={() => setStep(s => s+1)} style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', }}>Continue →</button>
          )}
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: '#fff', borderTop: '0.5px solid #e8e7e4', boxShadow: '0 -2px 12px rgba(0,0,0,0.06)', padding: '14px 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: saved ? '#0F6E56' : '#0d0d0d' }}>
          {saved ? '✓ All changes saved' : 'You have unsaved changes'}
        </div>
        <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 16, fontWeight: saved ? 500 : 700, padding: '14px 40px', borderRadius: 8, background: saved ? '#E1F5EE' : 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', border: saved ? '1px solid #0F6E56' : 'none', cursor: 'pointer', color: saved ? '#0F6E56' : '#0d0d0d' }}>
          {isSaving ? 'Saving…' : saved ? '✓ Saved' : 'Save draft'}
        </button>
      </div>
      <GHGBot currentStep={step} />
    </div>
  )
}

function DocUpload({ label, locIdx, docType, docs, onUpload, onRemove, onUpdateProposal, uploading, reportingYear, fiscalYearEndMonth }: { label: string; locIdx: number; docType: string; docs: SourceDoc[]; onUpload: (f: FileList, i: number, t: string) => void; onRemove: (i: number, id: string, path: string) => void; onUpdateProposal: (locIdx: number, docId: string, propIdx: number, patch: Partial<ExtractedProposal>) => void; uploading: boolean; reportingYear: number; fiscalYearEndMonth: number }) {
  const ref = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)   // `${docId}:${propIdx}` being edited
  const [editVal, setEditVal] = useState<string>('')
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px dashed #e8e7e4', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: docs.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>📎 {label}</span>
        <button onClick={() => ref.current?.click()} disabled={uploading} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>{uploading ? 'Uploading...' : '+ Upload'}</button>
        <input ref={ref} type="file" multiple accept=".pdf,.xlsx,.csv,.jpg,.png" style={{ display: 'none' }} onChange={e => e.target.files && onUpload(e.target.files, locIdx, docType)} />
      </div>
      <div style={{ fontSize: 10, color: '#888784', fontWeight: 300, marginTop: 4 }}>Accepted: PDF, Excel, CSV, JPG, PNG · max 50 MB</div>
      {(() => {
        // Coverage strip: aggregate this fuel's CONFIRMED proposals at this location, classify completeness.
        const win = periodFromYearAndEnd(reportingYear, fiscalYearEndMonth)
        const periods: CoveragePeriod[] = docs.flatMap(d =>
          (d.extracted ?? []).map((p, pi) => ({ p, pi, docId: d.id }))
            .filter(x => x.p.status === 'confirmed' && x.p.periodStart && x.p.periodEnd)
            .map(x => ({ docId: x.docId, pi: x.pi, start: new Date(x.p.periodStart as string), end: new Date(x.p.periodEnd as string) }))
        )
        if (periods.length === 0) return null
        const cov = analyzeCoverage(periods, win.start, win.end)
        const tone =
          cov.status === 'full' ? { bg: '#E1F5EE', fg: '#0F6E56', icon: '✓' }
          : { bg: '#FEF3E2', fg: '#ba7517', icon: '⚠' }
        return (
          <div style={{ marginTop: 8, background: tone.bg, borderRadius: 6, padding: '6px 10px', fontSize: 11, color: tone.fg, fontWeight: 600 }}>
            {tone.icon} {cov.summary}
          </div>
        )
      })()}
      {docs.map(doc => (
        <div key={doc.id} style={{ padding: '3px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#0d0d0d' }}>✓ {doc.file_name}</span>
            <button onClick={() => onRemove(locIdx, doc.id, doc.file_path)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none' }}>Remove</button>
          </div>
          {doc.extracted && doc.extracted.length > 0 && (
            <div style={{ marginTop: 4, marginLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {doc.extracted.map((p, pi) => (
                <div key={pi} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7425e3' }}>ThemisIQ read</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{p.value != null ? `${p.value.toLocaleString()} ${p.unit ?? ''}` : '—'}</span>
                    <span style={{ fontSize: 11, color: '#888784' }}>{p.fuelType.replace('_', ' ')}</span>
                    {(p.periodStart || p.periodEnd) && <span style={{ fontSize: 11, color: '#888784' }}>· {p.periodStart ?? '?'} → {p.periodEnd ?? '?'}</span>}
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: p.status === 'needs_manual_review' ? '#FEF3E2' : '#E1F5EE', color: p.status === 'needs_manual_review' ? '#ba7517' : '#0F6E56' }}>
                      {p.status === 'needs_manual_review' ? 'NEEDS REVIEW' : p.confidence.toUpperCase()}
                    </span>
                  </div>
                  {p.sourceQuote && <div style={{ fontSize: 11, color: '#888784', fontStyle: 'italic', marginTop: 2 }}>“{p.sourceQuote}”</div>}
                  {p.conversionNote && <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{p.conversionNote}</div>}
                  {editing === `${doc.id}:${pi}` ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <input type="number" value={editVal} onChange={e => setEditVal(e.target.value)} placeholder="corrected value" style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid #e8e7e4', borderRadius: 6, width: 130 }} />
                      <span style={{ fontSize: 11, color: '#888784' }}>{p.unit ?? ''}</span>
                      <button onClick={() => { const v = Number(editVal); if (Number.isFinite(v)) { onUpdateProposal(locIdx, doc.id, pi, { value: v, status: 'confirmed' }); setEditing(null) } }} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditing(null)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#f8f7f5', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      {p.status === 'confirmed' ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56' }}>✓ Confirmed</span>
                      ) : (
                        <button onClick={() => onUpdateProposal(locIdx, doc.id, pi, { status: 'confirmed' })} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
                      )}
                      <button onClick={() => { setEditing(`${doc.id}:${pi}`); setEditVal(p.value != null ? String(p.value) : '') }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => onUpdateProposal(locIdx, doc.id, pi, { status: 'needs_manual_review' })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#ba7517', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Flag for review</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function QuestionCard({ question, hint, checked, onToggle, children }: { question: string; hint: string; checked: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${checked ? '#7425e3' : '#e8e7e4'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }} onClick={() => onToggle(!checked)}>
        <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${checked ? '#7425e3' : '#e8e7e4'}`, background: checked ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{question}</div>
          <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.5 }}>{hint}</div>
        </div>
      </div>
      {checked && children && <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}><div style={{ paddingTop: '1rem' }}>{children}</div></div>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: hint ? 4 : 6 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: '#888784', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}

const unitBtn = (active: boolean): React.CSSProperties => ({ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: active ? '#7425e3' : '#f8f7f5', color: active ? '#fff' : '#555553', border: `0.5px solid ${active ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' })
const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '2rem' }
const wTd: React.CSSProperties = { padding: '6px 10px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', fontSize: 11, verticalAlign: 'top' }
const qHint: React.CSSProperties = { fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '0.75rem' }
export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: '#888784' }}>Loading…</div>}>
      <GHGPage />
    </Suspense>
  )
}

interface AuditRow {
  id: string
  action: string
  old_values: any
  new_values: any
  user_email: string | null
  created_at: string
}

// Fields worth surfacing in the diff (skip noisy/internal ones)
const TRACKED_FIELDS: Record<string, string> = {
  company_name: 'Company name',
  reporting_year: 'Reporting year',
  scope1_total: 'Scope 1 total (mtCO₂e)',
  scope2_location_total: 'Scope 2 location-based (mtCO₂e)',
  scope2_market_total: 'Scope 2 market-based (mtCO₂e)',
  revenue_millions: 'Revenue (USD M)',
  employee_count: 'Employees',
  boundary_approach: 'Boundary approach',
  selected_frameworks: 'Frameworks',
  status: 'Status',
}

function fmt(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ') || '—'
  if (typeof v === 'number') return String(v)
  return String(v)
}

function diffRow(oldV: any, newV: any): { label: string; from: string; to: string }[] {
  const changes: { label: string; from: string; to: string }[] = []
  const o = oldV || {}
  const n = newV || {}
  for (const key of Object.keys(TRACKED_FIELDS)) {
    const before = fmt(o[key])
    const after = fmt(n[key])
    if (before !== after) changes.push({ label: TRACKED_FIELDS[key], from: before, to: after })
  }
  return changes
}

function AuditTrail({ inventoryId, step }: { inventoryId: string | null; step: number }) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!inventoryId) return
    setLoading(true)
    supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', 'ghg_inventories')
      .eq('record_id', inventoryId)
      .order('created_at', { ascending: false })
      .then((res: { data: AuditRow[] | null }) => {
        setRows(res.data || [])
        setLoading(false)
      })
  }, [inventoryId, step])

  if (!inventoryId) {
    return (
      <div>
        <h2 style={auditSectionHead}>Audit trail</h2>
        <p style={auditSectionSub}>Every change to this inventory is recorded automatically — who, what, and when — in a tamper-evident log. This is the record your verifier reviews.</p>
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>No history yet</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6 }}>Your audit trail will appear here once you save your inventory. Use the &ldquo;Save draft&rdquo; button at the top right to create the first entry.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={auditSectionHead}>Audit trail</h2>
      <p style={auditSectionSub}>Every change to this inventory is recorded automatically — who, what, and when — in a tamper-evident log. This is the record your verifier reviews.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Append-only record</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 300 }}>{rows.length} change{rows.length !== 1 ? 's' : ''} logged · entries cannot be edited or deleted</div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>ISO 14064-3 / ISAE 3410 traceability</div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#888784', fontSize: 13 }}>Loading history…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center', fontSize: 13, color: '#555553' }}>No entries recorded yet.</div>
      )}

      {!loading && rows.map((row, i) => {
        const isCreate = row.action === 'INSERT'
        const isDelete = row.action === 'DELETE'
        const changes = row.action === 'UPDATE' ? diffRow(row.old_values, row.new_values) : []
        const color = isCreate ? '#0F6E56' : isDelete ? '#B91C1C' : '#7425e3'
        const bg = isCreate ? '#E1F5EE' : isDelete ? '#FCEBEB' : '#EDE9FE'
        const actionLabel = isCreate ? 'Created' : isDelete ? 'Deleted' : 'Updated'
        return (
          <div key={row.id} style={{ position: 'relative', paddingLeft: 28, paddingBottom: i < rows.length - 1 ? 18 : 0 }}>
            {i < rows.length - 1 && <div style={{ position: 'absolute', left: 7, top: 18, bottom: 0, width: 2, background: '#e8e7e4' }} />}
            <div style={{ position: 'absolute', left: 0, top: 4, width: 16, height: 16, borderRadius: '50%', background: color, border: '3px solid #fff', boxShadow: '0 0 0 1px #e8e7e4' }} />
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: changes.length ? 10 : 0, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color, background: bg, padding: '3px 10px', borderRadius: 99 }}>{actionLabel}</span>
                  <span style={{ fontSize: 12, color: '#555553' }}>{row.user_email || 'System'}</span>
                </div>
                <span style={{ fontSize: 11, color: '#888784' }}>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              {changes.length > 0 && (
                <div style={{ borderTop: '0.5px solid #f0efed', paddingTop: 10 }}>
                  {changes.map((c, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: '#555553' }}>{c.label}</span>
                      <span style={{ color: '#888784', textDecoration: 'line-through' }}>{c.from}</span>
                      <span style={{ color: '#888784' }}>→</span>
                      <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{c.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const auditSectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const auditSectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '2rem' }


interface VerifierGrant {
  id: string
  token: string
  verifier_name: string | null
  verifier_email: string | null
  status: string
  expires_at: string
  created_at: string
}

function VerifierInvite({ inventoryId }: { inventoryId: string | null }) {
  const [grants, setGrants] = useState<VerifierGrant[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = () => {
    if (!inventoryId) return
    supabase
      .from('verifier_access')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('created_at', { ascending: false })
      .then((res: { data: VerifierGrant[] | null }) => setGrants(res.data || []))
  }

  useEffect(() => { load() }, [inventoryId])

  const createInvite = async () => {
    if (!inventoryId) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { alert('Please sign in to invite a verifier.'); setCreating(false); return }
    const { error } = await supabase.from('verifier_access').insert({
      inventory_id: inventoryId,
      customer_user_id: session.user.id,
      verifier_name: name || null,
      verifier_email: email || null,
    })
    setCreating(false)
    if (error) { alert('Could not create invitation: ' + error.message); return }
    setName(''); setEmail(''); load()
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.from('verifier_access')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('Could not revoke: ' + error.message); return }
    load()
  }

  const linkFor = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://www.themisiq.co'}/verify/${token}`

  const copy = (token: string, id: string) => {
    navigator.clipboard.writeText(linkFor(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!inventoryId) return null

  const active = grants.filter(g => g.status === 'active')

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '0.5px solid #e8e7e4', paddingTop: '2rem' }}>
      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Invite a verifier</h3>
      <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.25rem' }}>
        Generate a secure, read-only link for your independent assurance provider. They&apos;ll see this inventory&apos;s summary, methodology, and full audit trail &mdash; with no ability to edit. Links expire in 90 days, and you can revoke access at any time.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Verifier name (optional)" style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4' }} />
        <input value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="Verifier email (optional)" style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4' }} />
        <button onClick={createInvite} disabled={creating} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: creating ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{creating ? 'Generating…' : 'Generate verifier link'}</button>
      </div>

      {active.length === 0 && (
        <div style={{ fontSize: 12, color: '#888784', fontStyle: 'italic' }}>No active verifier links yet.</div>
      )}

      {active.map(g => (
        <div key={g.id} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{g.verifier_name || 'Verifier'}{g.verifier_email ? ` · ${g.verifier_email}` : ''}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>Expires {new Date(g.expires_at).toLocaleDateString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => copy(g.token, g.id)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>{copiedId === g.id ? '✓ Copied' : 'Copy link'}</button>
              <button onClick={() => revoke(g.id)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'none', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#B91C1C' }}>Revoke</button>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#888784', wordBreak: 'break-all', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 6, padding: '6px 10px' }}>{linkFor(g.token)}</div>
        </div>
      ))}
    </div>
  )
}
