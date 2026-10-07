// ── DCCEEW NGA 2025: TRANSPORT FUELS (TABLE 9) ───────────────────────────────────────────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/nga/national-greenhouse-account-factors-2025.pdf (Table 9, pp. 26 to
// 27; the pre-2004 note on p. 28) and the matching .xlsx (sheet "Table 9"). Units: kg CO2-e per GJ, with the energy
// content in GJ per kL, as NGA prints them (R5). Priced by engine pickFleet (FI9 2b).
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
// heavy-duty gasoline row and no non-road row; FI9 diff 1b settles both from the NGER (Measurement) Determination 2008,
// the law NGA's factors implement (~/themisiq-sources/nga/F2026C00720.pdf, Compilation No. 21, compilation date
// 1 July 2026):
//
// NON-ROAD IS STATIONARY ENERGY, BY DEFINITION. Determination s 2.41(2), p. 78 (the same words in s 2.20(2), p. 58, for
// gaseous fuels): "stationary energy purposes means purposes for which fuel is combusted that do not involve transport
// energy purposes. transport energy purposes includes purposes for which fuel is combusted that consist of any of the
// following: (a) transport by vehicles registered for road use; (b) rail transport; (c) waterborne transport; (d) air
// transport." Equipment not registered for road use is in none of (a) to (d), so its fuel takes Part 3 of Schedule 1,
// which NGA prints as Table 8 "... for stationary energy purposes". R16's exception: the publisher states which factor
// applies. A site vehicle that IS registered for road use is Light or Heavy, not Non-road.
//
// HEAVY PETROL IS SCHEDULE 1, PART 4. Division 4.1 (p. 407) gives the transport factor for any vehicle, item 53
// "Gasoline (other than for use as fuel in an aircraft)"; Division 4.2 (p. 409) applies "for combustion of fuel by
// vehicles manufactured after 2004" (s 2.48(2)(a), p. 87), item 64. Division 4.3 (certain trucks, pp. 409 to 410) is
// diesel only. NGA's Table 9 prints item 64's values under "Cars and light commercial vehicles" and item 53's in its
// pre-2004 note; the Determination does not limit either to light vehicles.

import type { MobileGasRow, MobilePublisher, YearRange } from './types'

const T9 = 'Table 9 Direct (scope 1) and indirect (scope 3) emission factors for the consumption of transport fuels in different transport equipment'
const COL = 'Scope 1 Emission Factor (kg CO2-e/GJ): CH4, N2O'
const r = (fuel: 'diesel' | 'petrol', type: 'light' | 'heavy', vehicle: string, fuelLabel: string, detail: string | null,
  ch4: number, n2o: number, page: string, cell: string | undefined, years?: YearRange): MobileGasRow => ({
  fuel, type, vehicle, detail, ch4, n2o, unit: 'kg CO2-e/GJ', gas: 'co2e_ar5',
  cite: { table: cell ? T9 : `${T9}, notes`, row: `${vehicle}, ${fuelLabel}${detail ? `, ${detail}` : ''}`, column: COL, page, cell },
  ...(years ? { years } : {}),
})

const DETERMINATION = 'National Greenhouse and Energy Reporting (Measurement) Determination 2008, Compilation No. 21 (compilation date 1 July 2026)'
const NON_ROAD_BASIS =
  'Determination s 2.41(2), p. 78: "transport energy purposes includes purposes for which fuel is combusted that consist ' +
  'of any of the following: (a) transport by vehicles registered for road use; (b) rail transport; (c) waterborne ' +
  'transport; (d) air transport", and "stationary energy purposes means purposes for which fuel is combusted that do not ' +
  'involve transport energy purposes"; so equipment not registered for road use takes Schedule 1 Part 3, NGA Table 8.'
const T8 = 'Table 8 Direct (Scope 1) and indirect (scope 3) emission factors for the consumption of liquid fuels, including certain petroleum based products for stationary energy purposes'
const nonRoad = (fuel: 'diesel' | 'petrol', row: string, ch4: number, n2o: number, cells: string, item: string): MobileGasRow => ({
  fuel, type: 'non_road', vehicle: 'Equipment not registered for road use (stationary energy purposes)', detail: null, ch4, n2o,
  unit: 'kg CO2-e/GJ', gas: 'co2e_ar5',
  cite: { table: T8, row, column: 'Scope 1 Emission Factor (kg CO2-e/GJ): CH4, N2O', page: '23', cell: cells,
    basis: `${NON_ROAD_BASIS} Determination Schedule 1 Part 3, ${item}, p. 405, prints the same values.` },
})
const heavyPetrol = (detail: string, ch4: number, n2o: number, table: string, item: string, page: string, years: YearRange,
  basis: string): MobileGasRow => ({
  fuel: 'petrol', type: 'heavy', vehicle: 'Heavy duty vehicles (Determination Schedule 1 Part 4)', detail, ch4, n2o,
  unit: 'kg CO2-e/GJ', gas: 'co2e_ar5', years,
  cite: { document: DETERMINATION, table, row: `${item} Gasoline (other than for use as fuel in an aircraft)`,
    column: 'Emission factor kg CO2-e/GJ: CH4, N2O', page, basis },
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
    // Model years from the p. 28 note, "For vehicles manufactured prior to 2004": before 2004 the note's row, from 2004
    // Table 9's. (The Determination's s 2.48(2)(a) says "manufactured after 2004"; the two differ for 2004 itself. This
    // file follows NGA for the rows NGA prints; see docs/review/mobile-factors.md.)
    r('petrol', 'light', CARS, 'Gasoline', 'manufactured 2004 or later', 0.02, 0.2, '26', "'Table 9'!E5, F5", { from: 2004, to: null }),
    r('petrol', 'light', CARS, 'Gasoline', 'manufactured prior to 2004', 0.6, 1.6, '28', undefined, { from: null, to: 2003 }),
    r('diesel', 'light', CARS, 'Diesel oil', 'manufactured 2004 or later', 0.01, 0.5, '26', "'Table 9'!E6, F6", { from: 2004, to: null }),
    r('diesel', 'light', CARS, 'Diesel oil', 'manufactured prior to 2004', 0.1, 0.4, '28', undefined, { from: null, to: 2003 }),
    r('diesel', 'heavy', HDV, 'Diesel oil', 'Euro iv or higher', 0.07, 0.4, '27', "'Table 9'!E17, F17"),
    r('diesel', 'heavy', HDV, 'Diesel oil', 'Euro iii', 0.1, 0.4, '27', "'Table 9'!E18, F18"),
    r('diesel', 'heavy', HDV, 'Diesel oil', 'Euro i', 0.2, 0.4, '27', "'Table 9'!E19, F19"),
    // Heavy petrol (FI9 diff 1b): the Determination, Schedule 1 Part 4. Years from s 2.48(2)(a): Division 4.2 "for
    // combustion of fuel by vehicles manufactured after 2004"; Division 4.1 otherwise.
    heavyPetrol('Division 4.1 (any vehicle; manufactured 2004 or earlier)', 0.6, 1.6,
      'Schedule 1 Part 4 Division 4.1 Fuel combustion, fuels for transport energy purposes', 'Item 53', '407',
      { from: null, to: 2004 },
      'Division 4.1 is the transport factor for any vehicle; NGA Table 9 prints no heavy-duty gasoline row.'),
    heavyPetrol('Division 4.2 (manufactured after 2004)', 0.02, 0.2,
      'Schedule 1 Part 4 Division 4.2 Fuel combustion, liquid fuels for transport energy purposes for post-2004 vehicles',
      'Item 64', '409', { from: 2005, to: null },
      's 2.48(2)(a), p. 87: Division 4.2 applies "for combustion of fuel by vehicles manufactured after 2004".'),
    // Non-road (FI9 diff 1b): stationary energy purposes under s 2.41(2), so NGA Table 8 (Schedule 1 Part 3). No sector split.
    nonRoad('petrol', 'Automotive gasoline/petrol (other than for use as fuel in an aircraft)', 0.2, 0.2, "'Table 8'!D9, E9", 'item 35'),
    nonRoad('diesel', 'Diesel oil', 0.1, 0.2, "'Table 8'!D14, E14", 'item 40'),
  ],
  absent: [],
  splitBy: {
    'light:petrol': 'Model year', 'light:diesel': 'Model year',
    'heavy:petrol': 'Model year', 'heavy:diesel': 'Euro standard',
  },
}
