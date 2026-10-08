// ── UK DEFRA/DESNZ 2024: FUEL FACTORS, WHICH DEFRA STATES APPLY TO VEHICLES ──────────────────────────
//
// T3d (reporting year 2025). Transcribed cell by cell from ~/themisiq-sources/defra/ghg-conversion-factors-2024-full_set__for_advanced_users__v1_1.xlsx
// (v1.1), sheet "Fuels", the same rows as defra2026.ts. Version 1.1, the correction of 30 Oct 2024 (rounding error that reduced some diesel factors to zero corrected).
// The basis for using the Fuels rows for vehicles is the same text in this edition (Passenger vehicles!A11, Delivery
// vehicles!A11 and Fuels!A8 read as quoted in defra2026.ts, checked in this workbook).

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

export const DEFRA_MOBILE_2024: MobilePublisher = {
  publisher: 'UK DEFRA/DESNZ',
  edition: '2024',
  document: 'UK Government GHG Conversion Factors for Company Reporting 2024, full set v1.1',
  co2: [
    { fuel: 'diesel', value: 2.4796, unit: 'kg CO2e of CO2/litre',
      cite: { table: 'Fuels', row: 'Diesel (average biofuel blend), litres', column: 'kg CO2e of CO2 per unit', cell: 'Fuels!E72' } },
    { fuel: 'petrol', value: 2.07047, unit: 'kg CO2e of CO2/litre',
      cite: { table: 'Fuels', row: 'Petrol (average biofuel blend), litres', column: 'kg CO2e of CO2 per unit', cell: 'Fuels!E96' } },
  ],
  rows: [
    // Totals as printed: diesel 2.51279 (Fuels!D72), petrol 2.0844 (Fuels!D96).
    ...row('diesel', 'Diesel (average biofuel blend)', 0.00029, 0.0329, 72),
    ...row('petrol', 'Petrol (average biofuel blend)', 0.00806, 0.00587, 96),
  ],
  absent: [],
  // One row per fuel: nothing to split by.
  splitBy: {},
}
