// ── DCCEEW NGA 2025: TRANSPORT FUELS (TABLE 9) ───────────────────────────────────────────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/nga/national-greenhouse-account-factors-2025.pdf (Table 9, pp. 26 to
// 27; the pre-2004 note on p. 28) and the matching .xlsx (sheet "Table 9"). Units: kg CO2-e per GJ, with the energy
// content in GJ per kL, as NGA prints them (R5). Nothing reads this yet.
//
// NGA p. 26: "Fuels used for transport purposes produce different methane and nitrous oxide emissions than if the
// same fuels were used for stationary energy purposes. While CO2 emissions are only dependant on the fuel type, CH4
// and N2O emissions are dependent on the type of engine technology used as well as the fuel type. Therefore, separate
// emission factors are provided in Table 9 to apply where fuels are used for general transport purposes as well as
// specific transport types."
//
// THE PRE-2004 ROWS ARE NGA'S, FROM A NOTE, NOT A TABLE ROW. Table 9, notes, p. 28: "* For vehicles manufactured prior
// to 2004, the following scope 1 emission factors (in kg CO2-e/GJ) should be used instead of those presented in Table
// 9: Gasoline CH4 =0.6, N2O = 1.6, Diesel oil CH4 =0.1, N2O = 0.4, ..." The note is in the PDF only; the workbook
// carries the asterisks on the Table 9 cells and not the note.
//
// Mapping to R16's types: "Cars and light commercial vehicles" is Light; "Heavy duty vehicles" is Heavy. NGA prints no
// heavy-duty gasoline row and no non-road row of any kind (see `absent`).

import type { MobileGasRow, MobilePublisher } from './types'

const T9 = 'Table 9 Direct (scope 1) and indirect (scope 3) emission factors for the consumption of transport fuels in different transport equipment'
const COL = 'Scope 1 Emission Factor (kg CO2-e/GJ): CH4, N2O'
const r = (fuel: 'diesel' | 'petrol', type: 'light' | 'heavy', vehicle: string, fuelLabel: string, detail: string | null,
  ch4: number, n2o: number, page: string, cell: string | undefined): MobileGasRow => ({
  fuel, type, vehicle, detail, ch4, n2o, unit: 'kg CO2-e/GJ', gas: 'co2e_ar5',
  cite: { table: cell ? T9 : `${T9}, notes`, row: `${vehicle}, ${fuelLabel}${detail ? `, ${detail}` : ''}`, column: COL, page, cell },
})

const CARS = 'Cars and light commercial vehicles'
const HDV = 'Heavy duty vehicles'

/** Energy content, GJ per kL, as Table 9 prints it (column "Energy Content factor"). */
export const NGA_MOBILE_ENERGY_CONTENT_2025 = {
  petrol: { value: 34.2, unit: 'GJ/kL', cite: { table: T9, row: `${CARS}, Gasoline`, page: '26', cell: "'Table 9'!C5" } },
  diesel: { value: 38.6, unit: 'GJ/kL', cite: { table: T9, row: `${CARS}, Diesel oil (and every Heavy duty diesel row)`, page: '26', cell: "'Table 9'!C6" } },
}

export const NGA_MOBILE_2025: MobilePublisher = {
  publisher: 'DCCEEW National Greenhouse Accounts Factors',
  edition: '2025',
  document: 'DCCEEW (2025) National Greenhouse Accounts Factors 2025',
  co2: [
    { fuel: 'petrol', value: 67.4, unit: 'kg CO2-e/GJ', cite: { table: T9, row: `${CARS}, Gasoline`, column: 'Scope 1 Emission Factor CO2', page: '26', cell: "'Table 9'!D5" } },
    { fuel: 'diesel', value: 69.9, unit: 'kg CO2-e/GJ', cite: { table: T9, row: `${CARS}, Diesel oil (and every Heavy duty diesel row)`, column: 'Scope 1 Emission Factor CO2', page: '26', cell: "'Table 9'!D6" } },
  ],
  rows: [
    r('petrol', 'light', CARS, 'Gasoline', 'manufactured 2004 or later', 0.02, 0.2, '26', "'Table 9'!E5, F5"),
    r('petrol', 'light', CARS, 'Gasoline', 'manufactured prior to 2004', 0.6, 1.6, '28', undefined),
    r('diesel', 'light', CARS, 'Diesel oil', 'manufactured 2004 or later', 0.01, 0.5, '26', "'Table 9'!E6, F6"),
    r('diesel', 'light', CARS, 'Diesel oil', 'manufactured prior to 2004', 0.1, 0.4, '28', undefined),
    r('diesel', 'heavy', HDV, 'Diesel oil', 'Euro iv or higher', 0.07, 0.4, '27', "'Table 9'!E17, F17"),
    r('diesel', 'heavy', HDV, 'Diesel oil', 'Euro iii', 0.1, 0.4, '27', "'Table 9'!E18, F18"),
    r('diesel', 'heavy', HDV, 'Diesel oil', 'Euro i', 0.2, 0.4, '27', "'Table 9'!E19, F19"),
  ],
  absent: [
    { type: 'heavy', fuel: 'petrol', said: null },
    { type: 'non_road', fuel: 'petrol', said: null },
    { type: 'non_road', fuel: 'diesel', said: null },
  ],
}
