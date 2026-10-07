// ── 2006 IPCC GUIDELINES, VOL. 2 CH. 3 (MOBILE COMBUSTION): THE EU'S MOBILE FACTORS ──────────────────
//
// FI9 diff 1. Transcribed from ~/themisiq-sources/ipcc/V2_3_Ch3_Mobile_Combustion.pdf: Table 3.2.1 (road CO2, p. 3.16),
// Table 3.2.2 (road CH4 and N2O, p. 3.21) and Table 3.3.1 (off-road CO2, CH4 and N2O, p. 3.36). Units: kg per TJ of
// fuel, net calorific basis, as IPCC prints them (R5). Nothing reads this yet.
//
// A litre reaches a TJ the way FI3 does it for the EU's stationary rows (R10): EU MRR (Reg. (EU) 2018/2066) Annex VI
// Table 1 NCV and the JEC Well-to-Tank report v5 density (docs/review/eu-fuel-properties.md). The derivation belongs
// to the wiring diff; this file holds IPCC's figures only.
//
// TABLE 3.2.2 IS BY FUEL, WITH A REPRESENTATIVE VEHICLE, NOT BY R16 TYPE. p. 3.17: "default fuel-based emission
// factors that do not specify vehicle technology are highly uncertain." The gasoline rows are based on a USA light
// duty gasoline car (notes b to d); the diesel row "is based on the EEA (2005a) value for a European heavy duty diesel
// truck" (note e). IPCC gives no separate heavy gasoline or light diesel row, so each road row is mapped to both Light
// and Heavy here, and the record says so; the one row that names light duty vehicles is Light only.
//
// Table 3.3.1's 4-stroke gasoline Forestry cell is blank in the source and is not filled.

import type { EquipmentType, FleetType, MobileGasRow, MobilePublisher, YearRange } from './types'

// R16 equipment types to Table 3.3.1's sectors. "Industry" serves both industrial and commercial, and construction and
// mining: Table 3.3.1 has no separate construction sector. "Household" is lawn and garden.
const SECTOR: Readonly<Record<string, EquipmentType[]>> = {
  Agriculture: ['agriculture'], Forestry: ['forestry'], Industry: ['industrial_commercial', 'construction_mining'],
  Household: ['lawn_garden'],
}

const T322 = 'Table 3.2.2 Road transport N2O and CH4 default emission factors and uncertainty ranges'
const T331 = 'Table 3.3.1 Default emission factors for off-road mobile sources and machinery'
const ROAD: FleetType[] = ['light', 'heavy']
const road = (fuel: 'diesel' | 'petrol', category: string, ch4: number, n2o: number, years?: YearRange,
  types: FleetType[] = ROAD): MobileGasRow[] =>
  types.map(type => ({
    fuel, type, vehicle: category, detail: null, ch4, n2o, unit: 'kg/TJ', gas: 'mass' as const,
    cite: { table: T322, row: category, column: 'CH4 Default (kg/TJ); N2O Default (kg/TJ)', page: '3.21' },
    ...(years ? { years } : {}),
  }))
const offRoad = (fuel: 'diesel' | 'petrol', engine: string, sector: string, ch4: number, n2o: number): MobileGasRow => ({
  fuel, type: 'non_road', vehicle: engine, detail: sector, ch4, n2o, unit: 'kg/TJ', gas: 'mass', equipment: SECTOR[sector],
  cite: { table: T331, row: `${engine}, ${sector}`, column: 'CH4 Default (kg/TJ); N2O Default (kg/TJ)', page: '3.36' },
})

export const IPCC_MOBILE_2006: MobilePublisher = {
  publisher: 'IPCC',
  edition: '2006',
  document: '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Vol. 2 (Energy), Ch. 3 (Mobile Combustion)',
  co2: [
    // Table 3.2.1 (road) and the CO2 column of Table 3.3.1 (off-road) print the same defaults, from Ch. 1 Table 1.4.
    { fuel: 'diesel', value: 74100, unit: 'kg/TJ', cite: { table: 'Table 3.2.1 Road transport default CO2 emission factors and uncertainty ranges', row: 'Gas/ Diesel Oil', column: 'Default (kg/TJ)', page: '3.16' } },
    { fuel: 'petrol', value: 69300, unit: 'kg/TJ', cite: { table: 'Table 3.2.1 Road transport default CO2 emission factors and uncertainty ranges', row: 'Motor Gasoline', column: 'Default (kg/TJ)', page: '3.16' } },
  ],
  rows: [
    ...road('petrol', 'Motor Gasoline - Uncontrolled', 33, 3.2),
    ...road('petrol', 'Motor Gasoline - Oxidation Catalyst', 25, 8.0),
    // The one road row IPCC labels with a vintage: model years from 1995. The other two carry no year. It names light
    // duty vehicles, so it is Light only (FI9 diff 1b); Heavy petrol has the Uncontrolled and Oxidation Catalyst rows.
    ...road('petrol', 'Motor Gasoline - Low Mileage Light Duty Vehicle Vintage 1995 or Later', 3.8, 5.7, { from: 1995, to: null }, ['light']),
    ...road('diesel', 'Gas / Diesel Oil', 3.9, 3.9),
    offRoad('diesel', 'Diesel', 'Agriculture', 4.15, 28.6),
    offRoad('diesel', 'Diesel', 'Forestry', 4.15, 28.6),
    offRoad('diesel', 'Diesel', 'Industry', 4.15, 28.6),
    offRoad('diesel', 'Diesel', 'Household', 4.15, 28.6),
    offRoad('petrol', 'Motor Gasoline 4-stroke', 'Agriculture', 80, 2),
    offRoad('petrol', 'Motor Gasoline 4-stroke', 'Industry', 50, 2),
    offRoad('petrol', 'Motor Gasoline 4-stroke', 'Household', 120, 2),
    offRoad('petrol', 'Motor Gasoline 2-Stroke', 'Agriculture', 140, 0.4),
    offRoad('petrol', 'Motor Gasoline 2-Stroke', 'Forestry', 170, 0.4),
    offRoad('petrol', 'Motor Gasoline 2-Stroke', 'Industry', 130, 0.4),
    offRoad('petrol', 'Motor Gasoline 2-Stroke', 'Household', 180, 0.4),
  ],
  absent: [],
  splitBy: {
    'light:petrol': 'Emission-control technology (or a 1995 or later model year)',
    'heavy:petrol': 'Emission-control technology',
    'non_road:petrol': 'Engine type (2-stroke or 4-stroke)',
  },
}
