// ── NZ MfE 2025 v3: TRANSPORT FUEL ───────────────────────────────────────────────────────────────────────
//
// T3d (reporting year 2025). Transcribed from ~/themisiq-sources/mfe/EmissionFactors_2025_v3.xlsx, the Transport Fuel rows, the same rows as
// mfe2026.ts (same UUIDs), kg CO2-e per litre by gas as MfE prints them. Totals as printed: diesel 2.680680605
// (O1463), regular petrol 2.383126924 (O1483); the gases sum to them.
// The workbook prints no GWP set for its fuel rows (AR5 is printed only on refrigerant rows); `co2e_ar5` is carried
// from mfe2026.ts, as for every MfE fuel row. Classification of vehicle types is MfE's guide, as in mfe2026.ts.

import type { FleetType, MobileGasRow, MobilePublisher } from './types'

const GUIDE = 'MfE, Measuring emissions: A guide for organisations: 2024 detailed guide (ME1829)'
const BASIS: Readonly<Record<FleetType, string>> = {
  light: `${GUIDE}, section 3.3, p. 29: "Transport fuels are used in an engine to move a vehicle." Table 4 (p. 29) is by fuel, with no vehicle split.`,
  heavy: `${GUIDE}, section 3.3, p. 29: "Transport fuels are used in an engine to move a vehicle." Table 4 (p. 29) is by fuel, with no vehicle split.`,
  non_road: `${GUIDE}, section 3, p. 26: "Fuel can be categorised by its end-use, that is, either stationary combustion or transport"; ` +
    `section 3.2, p. 26: "Stationary combustion fuels are burnt in a fixed unit or asset, such as a boiler"; section 3.3, p. 29: ` +
    `"Transport fuels are used in an engine to move a vehicle." Equipment that moves under its own engine is transport.`,
}

export const MFE_MOBILE_2025: MobilePublisher = {
  publisher: 'NZ Ministry for the Environment',
  edition: '2025 v3',
  document: 'MfE Measuring Emissions emission factors 2025 v3 (EmissionFactors_2025_v3.xlsx, release 2025.3)',
  co2: [
    {fuel: "diesel",value: 2.639279658,unit: "kg CO2-e/litre",cite: {table: "Fuel / Transport Fuel",row: "Diesel (litre)",column: "O (EmissionFactor) (GHG_CO2_KGCO2_e)",cell: "data!O1464"}},
    {fuel: "petrol",value: 2.283122022,unit: "kg CO2-e/litre",cite: {table: "Fuel / Transport Fuel",row: "Regular Petrol (litre)",column: "O (EmissionFactor) (GHG_CO2_KGCO2_e)",cell: "data!O1484"}},
  ],
  rows: ([
    {fuel: "diesel",type: "light",vehicle: "Transport Fuel (no vehicle split)",detail: null,ch4: 0.0039564045,n2o: 0.0374445425,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport Fuel",row: "Diesel (litre)",column: "O EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)",cell: "data!O1465, data!O1466",basis: `Classification: ${BASIS.light} Factor: the 2025 v3 workbook.`}},
    {fuel: "diesel",type: "heavy",vehicle: "Transport Fuel (no vehicle split)",detail: null,ch4: 0.0039564045,n2o: 0.0374445425,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport Fuel",row: "Diesel (litre)",column: "O EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)",cell: "data!O1465, data!O1466",basis: `Classification: ${BASIS.heavy} Factor: the 2025 v3 workbook.`}},
    {fuel: "petrol",type: "light",vehicle: "Transport Fuel (no vehicle split)",detail: null,ch4: 0.0303562842,n2o: 0.0696486174,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport Fuel",row: "Regular Petrol (litre)",column: "O EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)",cell: "data!O1485, data!O1486",basis: `Classification: ${BASIS.light} Factor: the 2025 v3 workbook.`}},
    {fuel: "petrol",type: "heavy",vehicle: "Transport Fuel (no vehicle split)",detail: null,ch4: 0.0303562842,n2o: 0.0696486174,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport Fuel",row: "Regular Petrol (litre)",column: "O EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)",cell: "data!O1485, data!O1486",basis: `Classification: ${BASIS.heavy} Factor: the 2025 v3 workbook.`}},
    {fuel: "diesel",type: "non_road",vehicle: "Transport Fuel (no vehicle split)",detail: null,ch4: 0.0039564045,n2o: 0.0374445425,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport Fuel",row: "Diesel (litre)",column: "O EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)",cell: "data!O1465, data!O1466",basis: `Classification: ${BASIS.non_road} Factor: the 2025 v3 workbook.`}},
    {fuel: "petrol",type: "non_road",vehicle: "Transport Fuel (no vehicle split)",detail: null,ch4: 0.0303562842,n2o: 0.0696486174,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport Fuel",row: "Regular Petrol (litre)",column: "O EmissionFactor (GHG_CH4_KGCO2_e; GHG_N2O_KGCO2_e)",cell: "data!O1485, data!O1486",basis: `Classification: ${BASIS.non_road} Factor: the 2025 v3 workbook.`}},
  ] as MobileGasRow[]),
  absent: [],
  // One row per fuel: nothing to split by.
  splitBy: {},
}
