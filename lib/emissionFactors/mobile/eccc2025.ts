// ── ECCC NATIONAL INVENTORY REPORT 2025, PART 2: MOBILE COMBUSTION (TABLE A6.1–15) ────────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/eccc/2025NIR%20-%20Part%202.pdf: Environment and Climate Change
// Canada (2025), National Inventory Report 1990–2023: Greenhouse Gas Sources and Sinks in Canada, Part 2, Annex 6,
// Table A6.1–15 "Emission Factors for Energy Mobile Combustion Sources", p. 253. Units: g/L fuel, as printed (R5).
// Nothing reads this yet.
//
// The same values are in lib/ghg/mobile.ts (MOBILE_CA), which cites "NIR 2026 (1990-2024)", p. 541. That edition is
// not in the local sources; every value there matches the 2025 edition here (docs/review/mobile-factors.md, section
// "lib/ghg/mobile.ts checked").
//
// ECCC's other document, Emission factors and reference values v3.0 (En84-294-2025), has no mobile table: its Tables
// 4.1 to 4.3 are refined petroleum products by stationary sector, and are what EF_CA already prices.
//
// Mapping to R16's types: Light-duty Gasoline Vehicles and Trucks, and Light-duty Diesel Vehicles and Trucks, are
// Light; Heavy-duty Gasoline and Diesel Vehicles are Heavy; the Off-road gasoline and diesel rows are Non-road.
// Motorcycles, Natural Gas and Propane Vehicles, Off-road Lubricating Oil, Off-road Natural Gas and Propane, Railways,
// Marine and Aviation are not diesel or petrol in an R16 type and are not transcribed.

import type { MobileGasRow, MobilePublisher, YearRange } from './types'

// ── MODEL YEARS: ONLY WHERE THE NIR TIES A ROW TO THEM (R16 as refined, 7 Oct 2026) ──────────────────
// NIR 2025 Part 2, Annex 3.1, "Technology Penetration", p. 25: "Most on-road vehicles in use in 2023 are subject to
// Tier 2 and Tier 3 regulatory standards, approximately representing model years 2004 and onwards. ... Similarly,
// heavy-duty gasoline vehicles, heavy-duty diesel vehicles and motorcycles have advanced emission controls starting with
// the 1996 model year. Emission factors for vehicles without emission controls and/or moderate controls are used for
// 1995 and older model years." And Table A6.1–15's note: "* Advanced control diesel emission factors are used for Tier
// 2 diesel vehicle populations."
// So, by the rows' own labels: light Tier 2 and Tier 3, and light diesel Advanced Control, from 2004; heavy diesel
// Advanced Control from 1996; light and heavy diesel Uncontrolled and Moderate Control to 1995. Every other row (light
// gasoline Tier 1, Tier 0, Oxidation Catalyst, Non-catalytic Controlled; every heavy gasoline row, whose labels the
// passage does not use) is tied to no year, and a year that reaches no tied row takes the highest row.
const FROM_2004: YearRange = { from: 2004, to: null }
const FROM_1996: YearRange = { from: 1996, to: null }
const TO_1995: YearRange = { from: null, to: 1995 }

const TABLE = 'Table A6.1–15 Emission Factors for Energy Mobile Combustion Sources'
const COLUMN = 'Emission Factors (g/L fuel): CH4, N2O'
const r = (fuel: 'diesel' | 'petrol', type: 'light' | 'heavy' | 'non_road', vehicle: string, detail: string | null,
  ch4: number, n2o: number, years?: YearRange): MobileGasRow => ({
  fuel, type, vehicle, detail, ch4, n2o, unit: 'g/L', gas: 'mass',
  cite: { table: TABLE, row: detail ? `${vehicle}, ${detail}` : vehicle, column: COLUMN, page: '253' },
  ...(years ? { years } : {}),
})

const LDGV = 'Light-duty Gasoline Vehicles (LDGVs)'
const LDGT = 'Light-duty Gasoline Trucks (LDGTs)'
const HDGV = 'Heavy-duty Gasoline Vehicles (HDGVs)'
const LDDV = 'Light-duty Diesel Vehicles (LDDVs)'
const LDDT = 'Light-duty Diesel Trucks (LDDTs)'
const HDDV = 'Heavy-duty Diesel Vehicles (HDDVs)'

export const ECCC_MOBILE_2025: MobilePublisher = {
  publisher: 'Environment and Climate Change Canada',
  edition: 'NIR 2025 (1990-2023)',
  document: 'ECCC (2025) National Inventory Report 1990–2023, Part 2, Annex 6',
  co2: [
    // CO2 is the same on every row of a fuel: 2 680.50 (diesel) and 2 307.3 (gasoline), both footnote a, ECCC (2017b).
    { fuel: 'diesel', value: 2680.50, unit: 'g/L', cite: { table: TABLE, row: 'Diesel Vehicles (every row)', column: 'CO2', page: '253' } },
    { fuel: 'petrol', value: 2307.3, unit: 'g/L', cite: { table: TABLE, row: 'Gasoline Vehicles (every row)', column: 'CO2', page: '253' } },
  ],
  rows: [
    r('petrol', 'light', LDGV, 'Tier 3', 0.111, 0.007, FROM_2004),
    r('petrol', 'light', LDGV, 'Tier 2', 0.14, 0.022, FROM_2004),
    r('petrol', 'light', LDGV, 'Tier 1', 0.23, 0.47),
    r('petrol', 'light', LDGV, 'Tier 0', 0.32, 0.66),
    r('petrol', 'light', LDGV, 'Oxidation Catalyst', 0.52, 0.20),
    r('petrol', 'light', LDGV, 'Non-catalytic Controlled', 0.46, 0.028),
    r('petrol', 'light', LDGT, 'Tier 3', 0.111, 0.007, FROM_2004),
    r('petrol', 'light', LDGT, 'Tier 2', 0.14, 0.022, FROM_2004),
    r('petrol', 'light', LDGT, 'Tier 1', 0.24, 0.58),
    r('petrol', 'light', LDGT, 'Tier 0', 0.21, 0.66),
    r('petrol', 'light', LDGT, 'Oxidation Catalyst', 0.43, 0.20),
    r('petrol', 'light', LDGT, 'Non-catalytic Controlled', 0.56, 0.028),
    r('petrol', 'heavy', HDGV, 'Three-way Catalyst', 0.068, 0.20),
    r('petrol', 'heavy', HDGV, 'Non-catalytic Controlled', 0.29, 0.047),
    r('petrol', 'heavy', HDGV, 'Uncontrolled', 0.49, 0.084),
    r('diesel', 'light', LDDV, 'Advanced Control', 0.051, 0.22, FROM_2004),
    r('diesel', 'light', LDDV, 'Moderate Control', 0.068, 0.21, TO_1995),
    r('diesel', 'light', LDDV, 'Uncontrolled', 0.10, 0.16, TO_1995),
    r('diesel', 'light', LDDT, 'Advanced Control', 0.068, 0.22, FROM_2004),
    r('diesel', 'light', LDDT, 'Moderate Control', 0.068, 0.21, TO_1995),
    r('diesel', 'light', LDDT, 'Uncontrolled', 0.085, 0.16, TO_1995),
    r('diesel', 'heavy', HDDV, 'Advanced Control', 0.11, 0.151, FROM_1996),
    r('diesel', 'heavy', HDDV, 'Moderate Control', 0.14, 0.082, TO_1995),
    r('diesel', 'heavy', HDDV, 'Uncontrolled', 0.15, 0.075, TO_1995),
    r('petrol', 'non_road', 'Off-road Gasoline', '2-stroke', 10.56, 0.013),
    r('petrol', 'non_road', 'Off-road Gasoline', '4-stroke', 5.08, 0.064),
    r('diesel', 'non_road', 'Off-road Diesel', '< 19kW', 0.073, 0.022),
    r('diesel', 'non_road', 'Off-road Diesel', '≥ 19kW, Tier 1 - 3', 0.073, 0.022),
    r('diesel', 'non_road', 'Off-road Diesel', '≥ 19kW, Tier 4', 0.073, 0.227),
  ],
  absent: [],
  // ECCC's off-road rows have no sector split: every R16 equipment type uses them.
  splitBy: {
    'light:petrol': 'Emission-control technology (or a model year the NIR ties to one)',
    'light:diesel': 'Emission-control technology (or a model year the NIR ties to one)',
    'heavy:petrol': 'Emission-control technology',
    'heavy:diesel': 'Emission-control technology (or a model year the NIR ties to one)',
    'non_road:petrol': 'Engine type (2-stroke or 4-stroke)',
    'non_road:diesel': 'Engine power and emission tier',
  },
}
