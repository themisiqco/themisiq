// ── UK DEFRA/DESNZ 2026: FUEL FACTORS, WHICH DEFRA STATES APPLY TO VEHICLES ──────────────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/defra/ghg-conversion-factors-2026-full-set.xlsx (full set v1),
// sheet "Fuels". Units: kg CO2e per litre, split into the CO2, CH4 and N2O parts, as DEFRA prints them (R5). Nothing
// reads this yet.
//
// ONE FACTOR FOR BOTH USES, AND DEFRA SAYS SO (R16's exception). DEFRA publishes no fuel-based vehicle table: its
// "Passenger vehicles" and "Delivery vehicles" sheets are per km or mile, and both direct an organisation with fuel
// quantities to the Fuels sheet:
//   Passenger vehicles!A11: "For vehicles where an organisation has data in litres of fuel or kWh electricity
//     consumed, the 'fuels' or 'electricity' conversion factors should be applied, which provide more accurate
//     emissions results."
//   Delivery vehicles!A11: "For delivery vehicles where an organisation has data in litres of fuel or kWh electricity
//     used, the 'fuels' or 'electricity' conversion factors should be applied, which provide more accurate emissions
//     results."
// and Fuels!A8: "Fuels conversion factors should be used for primary fuel sources combusted at a site or in an asset
// owned or controlled by the reporting organisation." So the same rows serve Light, Heavy and Non-road. Non-road is
// covered by "an asset owned or controlled" (Fuels!A8); DEFRA names no non-road machinery class.
//
// The rows are the "average biofuel blend" ones, which is what EF_UK prices (Fuels!A12 and A17: forecourt fuel).

import type { FleetType, MobileGasRow, MobilePublisher } from './types'

const TYPES: FleetType[] = ['light', 'heavy', 'non_road']
const row = (fuel: 'diesel' | 'petrol', label: string, ch4: number, n2o: number, r: number): MobileGasRow[] =>
  TYPES.map(type => ({
    fuel, type, vehicle: 'Any vehicle or asset (Fuels sheet)', detail: null, ch4, n2o,
    unit: 'kg CO2e/litre', gas: 'co2e_ar5' as const,
    cite: { table: 'Fuels', row: `${label}, litres`, column: 'kg CO2e of CH4 per unit; kg CO2e of N2O per unit',
      cell: `Fuels!F${r}, Fuels!G${r}`,
      basis: type === 'non_road'
        ? 'Fuels!A8: "Fuels conversion factors should be used for primary fuel sources combusted at a site or in an asset owned or controlled by the reporting organisation."'
        : 'Passenger vehicles!A11 and Delivery vehicles!A11: where an organisation has data in litres of fuel, "the \'fuels\' ... conversion factors should be applied".' },
  }))

export const DEFRA_MOBILE_2026: MobilePublisher = {
  publisher: 'UK DEFRA/DESNZ',
  edition: '2026',
  document: 'UK Government GHG Conversion Factors for Company Reporting 2026, full set v1',
  co2: [
    { fuel: 'diesel', value: 2.55035, unit: 'kg CO2e of CO2/litre',
      cite: { table: 'Fuels', row: 'Diesel (average biofuel blend), litres', column: 'kg CO2e of CO2 per unit', cell: 'Fuels!E72' } },
    { fuel: 'petrol', value: 2.06107, unit: 'kg CO2e of CO2/litre',
      cite: { table: 'Fuels', row: 'Petrol (average biofuel blend), litres', column: 'kg CO2e of CO2 per unit', cell: 'Fuels!E96' } },
  ],
  rows: [
    // Totals as printed: diesel 2.58354 (Fuels!D72), petrol 2.075 (Fuels!D96), which EF_UK carries.
    ...row('diesel', 'Diesel (average biofuel blend)', 0.00029, 0.0329, 72),
    ...row('petrol', 'Petrol (average biofuel blend)', 0.00806, 0.00587, 96),
  ],
  absent: [],
  // One row per fuel: nothing to split by.
  splitBy: {},
}
