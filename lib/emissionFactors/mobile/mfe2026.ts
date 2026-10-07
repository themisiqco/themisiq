// ── NZ MfE MEASURING EMISSIONS 2026 (v2): TRANSPORT FUEL ─────────────────────────────────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/mfe/NZ_emission_factors_2026_v2.xlsx (release 2026.2, published
// 2026-05-29), sheet "data", Section "Fuel", SubSection "Transport Fuel" (rows 1422 to 1461). Units: kg CO2-e per
// litre, by gas, as MfE prints them (column J "EmissionFactor", GHG in column I) (R5). Priced by engine pickFleet (FI9 2b).
//
// MfE prints ONE transport row per fuel, with no split by vehicle type, so Light and Heavy take the same row and
// R16's "highest row" never applies. Regular Petrol is the row EF_NZ already uses for petrol; Premium Petrol
// (rows 1454 to 1457: CH4 0.0306602, N2O 0.0703459) is a fuel grade, not a vehicle split, and is not transcribed.
//
// CLASSIFICATION FROM THE 2024 GUIDE, FACTORS FROM THE 2026 v2 WORKBOOK (FI9 diff 1b). The workbook names no off-road
// row. MfE's "Measuring emissions: A guide for organisations: 2024 detailed guide" (ME1829,
// ~/themisiq-sources/mfe/Measuring-emissions_Detailed-guide_2024_ME1829.pdf) divides fuel by end use, section 3, p. 26:
// "Fuel can be categorised by its end-use, that is, either stationary combustion or transport." Section 3.2, p. 26:
// "Stationary combustion fuels are burnt in a fixed unit or asset, such as a boiler." Section 3.3, p. 29: "Transport
// fuels are used in an engine to move a vehicle." Non-road equipment that moves under its own engine (forklifts,
// plant, machinery) is in the second, so it takes the Transport Fuel rows. The guide names no machinery class and
// prints Table 4 (p. 29) by fuel alone, with no vehicle column.

import type { FleetType, MobileGasRow, MobilePublisher } from './types'

const GUIDE = 'MfE, Measuring emissions: A guide for organisations: 2024 detailed guide (ME1829)'
const BASIS: Readonly<Record<FleetType, string>> = {
  light: `${GUIDE}, section 3.3, p. 29: "Transport fuels are used in an engine to move a vehicle." Table 4 (p. 29) is by fuel, with no vehicle split.`,
  heavy: `${GUIDE}, section 3.3, p. 29: "Transport fuels are used in an engine to move a vehicle." Table 4 (p. 29) is by fuel, with no vehicle split.`,
  non_road: `${GUIDE}, section 3, p. 26: "Fuel can be categorised by its end-use, that is, either stationary combustion or transport"; ` +
    `section 3.2, p. 26: "Stationary combustion fuels are burnt in a fixed unit or asset, such as a boiler"; section 3.3, p. 29: ` +
    `"Transport fuels are used in an engine to move a vehicle." Equipment that moves under its own engine is transport.`,
}

const r = (fuel: 'diesel' | 'petrol', type: FleetType, label: string, ch4: number, n2o: number,
  ch4Row: number, n2oRow: number): MobileGasRow => ({
  fuel, type, vehicle: 'Transport Fuel (no vehicle split)', detail: null, ch4, n2o, unit: 'kg CO2-e/litre', gas: 'co2e_ar5',
  cite: { table: 'Fuel / Transport Fuel', row: `${label} (litre)`, column: 'EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)',
    cell: `data!J${ch4Row}, data!J${n2oRow}`, basis: `Classification: ${BASIS[type]} Factor: the 2026 v2 workbook.` },
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
    r('diesel', 'non_road', 'Diesel', 0.00394905, 0.0373749, 1438, 1440),
    r('petrol', 'non_road', 'Regular Petrol', 0.0302118, 0.0693172, 1458, 1460),
  ],
  absent: [],
  // One row per fuel: nothing to split by.
  splitBy: {},
}
