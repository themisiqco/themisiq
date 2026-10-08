// ── NZ MfE 2023: TRANSPORT FUEL ───────────────────────────────────────────────────────────────────────
//
// T3d (reporting year 2024). Transcribed from ~/themisiq-sources/mfe/Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx, the Transport Fuel rows, the same rows as
// mfe2026.ts (matched by labels; the 2023 file has no ID column), kg CO2-e per litre by gas as MfE prints them. Totals as printed: diesel 2.714872238
// (J106), regular petrol 2.45517095 (J98); the gases sum to them.
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

export const MFE_MOBILE_2023: MobilePublisher = {
  publisher: 'NZ Ministry for the Environment',
  edition: '2023',
  document: 'MfE Measuring Emissions Guidance emission factors flat file, August 2023 (Measuring-Emissions-Guidance_EmissionFactors_FlatFile-Aug2023.xlsx)',
  co2: [
    {fuel: "diesel",value: 2.67308657,unit: "kg CO2-e/litre",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J (EmissionFactor) (CO2)",cell: "'in'!J107"}},
    {fuel: "petrol",value: 2.353256688,unit: "kg CO2-e/litre",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J (EmissionFactor) (CO2)",cell: "'in'!J99"}},
  ],
  rows: ([
    {fuel: "diesel",type: "light",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.00399317,n2o: 0.037792498,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'in'!J108, 'in'!J109",basis: `Classification: ${BASIS.light} Factor: the 2023 workbook.`}},
    {fuel: "diesel",type: "heavy",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.00399317,n2o: 0.037792498,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'in'!J108, 'in'!J109",basis: `Classification: ${BASIS.heavy} Factor: the 2023 workbook.`}},
    {fuel: "petrol",type: "light",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.030935867,n2o: 0.070978395,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'in'!J100, 'in'!J101",basis: `Classification: ${BASIS.light} Factor: the 2023 workbook.`}},
    {fuel: "petrol",type: "heavy",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.030935867,n2o: 0.070978395,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'in'!J100, 'in'!J101",basis: `Classification: ${BASIS.heavy} Factor: the 2023 workbook.`}},
    {fuel: "diesel",type: "non_road",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.00399317,n2o: 0.037792498,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'in'!J108, 'in'!J109",basis: `Classification: ${BASIS.non_road} Factor: the 2023 workbook.`}},
    {fuel: "petrol",type: "non_road",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.030935867,n2o: 0.070978395,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'in'!J100, 'in'!J101",basis: `Classification: ${BASIS.non_road} Factor: the 2023 workbook.`}},
  ] as MobileGasRow[]),
  absent: [],
  // One row per fuel: nothing to split by.
  splitBy: {},
}
