// ── NZ MfE MEASURING EMISSIONS 2026 (v2): TRANSPORT FUEL ─────────────────────────────────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/mfe/NZ_emission_factors_2026_v2.xlsx (release 2026.2, published
// 2026-05-29), sheet "data", Section "Fuel", SubSection "Transport Fuel" (rows 1422 to 1461). Units: kg CO2-e per
// litre, by gas, as MfE prints them (column J "EmissionFactor", GHG in column I) (R5). Nothing reads this yet.
//
// MfE prints ONE transport row per fuel, with no split by vehicle type, so Light and Heavy take the same row and
// R16's "highest row" never applies. Regular Petrol is the row EF_NZ already uses for petrol; Premium Petrol
// (rows 1454 to 1457: CH4 0.0306602, N2O 0.0703459) is a fuel grade, not a vehicle split, and is not transcribed.
//
// NON-ROAD IS NOT FOUND IN THE LOCAL SOURCE. The workbook names no off-road or machinery row and does not say
// whether "Transport Fuel" covers it. MfE's guide, "Measuring emissions: a guide for organisations" (2026), would
// say; it is not in ~/themisiq-sources.

import type { MobileGasRow, MobilePublisher } from './types'

const r = (fuel: 'diesel' | 'petrol', type: 'light' | 'heavy', label: string, ch4: number, n2o: number,
  ch4Row: number, n2oRow: number): MobileGasRow => ({
  fuel, type, vehicle: 'Transport Fuel (no vehicle split)', detail: null, ch4, n2o, unit: 'kg CO2-e/litre', gas: 'co2e_ar5',
  cite: { table: 'Fuel / Transport Fuel', row: `${label} (litre)`, column: 'EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)',
    cell: `data!J${ch4Row}, data!J${n2oRow}` },
})

export const MFE_MOBILE_2026: MobilePublisher = {
  publisher: 'NZ Ministry for the Environment',
  edition: '2026 v2',
  document: 'MfE Measuring Emissions emission factors 2026 v2 (release 2026.2)',
  co2: [
    { fuel: 'diesel', value: 2.63045, unit: 'kg CO2-e/litre',
      cite: { table: 'Fuel / Transport Fuel', row: 'Diesel (litre)', column: 'EmissionFactor (GHG_CO2_KGCO2_e)', cell: 'data!J1439' } },
    { fuel: 'petrol', value: 2.2619, unit: 'kg CO2-e/litre',
      cite: { table: 'Fuel / Transport Fuel', row: 'Regular Petrol (litre)', column: 'EmissionFactor (GHG_CO2_KGCO2_e)', cell: 'data!J1459' } },
  ],
  rows: [
    // Totals as printed: Diesel 2.67177 (data!J1441), Regular Petrol 2.36143 (data!J1461).
    r('diesel', 'light', 'Diesel', 0.00394905, 0.0373749, 1438, 1440),
    r('diesel', 'heavy', 'Diesel', 0.00394905, 0.0373749, 1438, 1440),
    r('petrol', 'light', 'Regular Petrol', 0.0302118, 0.0693172, 1458, 1460),
    r('petrol', 'heavy', 'Regular Petrol', 0.0302118, 0.0693172, 1458, 1460),
  ],
  absent: [
    { type: 'non_road', fuel: 'diesel', said: null },
    { type: 'non_road', fuel: 'petrol', said: null },
  ],
}
