// ── NZ MfE 2024: TRANSPORT FUEL ───────────────────────────────────────────────────────────────────────
//
// T3d (reporting year 2025). Transcribed from ~/themisiq-sources/mfe/Measuring_Emissions_Flat_EmissionFactors_2024.xlsx, the Transport Fuel rows, the same rows as
// mfe2026.ts (same UUIDs), kg CO2-e per litre by gas as MfE prints them. Totals as printed: diesel 2.677543305
// (J106), regular petrol 2.372606596 (J98); the gases sum to them.
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

export const MFE_MOBILE_2024: MobilePublisher = {
  publisher: 'NZ Ministry for the Environment',
  edition: '2024',
  document: 'MfE Measuring Emissions flat emission factors 2024 (Measuring_Emissions_Flat_EmissionFactors_2024.xlsx)',
  co2: [
    {fuel: "diesel",value: 2.636169937,unit: "kg CO2-e/litre",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J (EmissionFactor) (CO2)",cell: "'Emission Factors'!J107"}},
    {fuel: "petrol",value: 2.272882538,unit: "kg CO2-e/litre",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J (EmissionFactor) (CO2)",cell: "'Emission Factors'!J99"}},
  ],
  rows: ([
    {fuel: "diesel",type: "light",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.0039537689,n2o: 0.0374195987,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'Emission Factors'!J108, 'Emission Factors'!J109",basis: `Classification: ${BASIS.light} Factor: the 2024 workbook.`}},
    {fuel: "diesel",type: "heavy",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.0039537689,n2o: 0.0374195987,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'Emission Factors'!J108, 'Emission Factors'!J109",basis: `Classification: ${BASIS.heavy} Factor: the 2024 workbook.`}},
    {fuel: "petrol",type: "light",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.0302710346,n2o: 0.0694530231,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'Emission Factors'!J100, 'Emission Factors'!J101",basis: `Classification: ${BASIS.light} Factor: the 2024 workbook.`}},
    {fuel: "petrol",type: "heavy",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.0302710346,n2o: 0.0694530231,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'Emission Factors'!J100, 'Emission Factors'!J101",basis: `Classification: ${BASIS.heavy} Factor: the 2024 workbook.`}},
    {fuel: "diesel",type: "non_road",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.0039537689,n2o: 0.0374195987,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Diesel (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'Emission Factors'!J108, 'Emission Factors'!J109",basis: `Classification: ${BASIS.non_road} Factor: the 2024 workbook.`}},
    {fuel: "petrol",type: "non_road",vehicle: "Transport fuels (no vehicle split)",detail: null,ch4: 0.0302710346,n2o: 0.0694530231,unit: "kg CO2-e/litre",gas: "co2e_ar5",cite: {table: "Fuel / Transport fuel emission factors / Transport fuels",row: "Regular Petrol (litre)",column: "J EmissionFactor (CH4; N2O)",cell: "'Emission Factors'!J100, 'Emission Factors'!J101",basis: `Classification: ${BASIS.non_road} Factor: the 2024 workbook.`}},
  ] as MobileGasRow[]),
  absent: [],
  // One row per fuel: nothing to split by.
  splitBy: {},
}
