// ── THE DEFRA/DESNZ 2026 UPSTREAM ENERGY FACTORS ─────────────────────────────────────────────────
//
// The typed reader for lib/emissionFactors/defraEnergy2026.json, which
// scripts/generate-defra-energy.py extracts from the committed workbook by A1 cell reference. Task 1
// of the Category 3 build (~/themisiq-sources/findings/cat3-design.md): NOTHING PRICES FROM IT YET.
// The only importer today is defraEnergy.test.ts, which checks every record against the cell it cites.
//
// ⚠️ EVERY ROW IS UPSTREAM ONLY, EXCLUDING COMBUSTION. That is what Category 3 may use (Scope 3
// Standard, p. 70) and what these four sheets say they are; DEFRA_ENERGY_META.sheet_descriptions holds
// each sheet's own words with its cell, and the test fails if a sheet stops saying so.
//
// ⚠️ THE FACTORS ARE UK FIGURES, ON AN AR5 BASIS. DEFRA publishes no overseas electricity, T&D or WTT
// factor (DEFRA_ENERGY_META.guidance.overseas_*), so a non-UK row priced from these is a UK stand-in
// and must say so; and the CO2e figures are IPCC AR5 100-year (guidance.gwp_basis), which a Category 3
// line discloses because the inventory it derives from may be on another basis.

import raw from './defraEnergy2026.json'

/**
 * The CO2, CH4 and N2O split, where DEFRA publishes one. null where the sheet publishes only CO2e.
 *
 * ⚠️ FOR DISCLOSURE, NOT FOR PRICING, AND IT DOES NOT SUM TO kg_co2e. Each column is published rounded
 * to five decimal places, so the parts come to slightly more than the whole: the electricity T&D row's
 * split sums to 0.01300 against a published 0.01299 (+0.077%), and the district heat and steam
 * distribution row's to 0.00946 against 0.00945 (+0.106%). See
 * DEFRA_ENERGY_META.gas_split_rounding_note. Price with kg_co2e, the figure DEFRA publishes as the
 * total; deriving a total by adding the split would silently overstate both rows.
 */
export interface EnergyGases {
  co2: number
  ch4: number
  n2o: number
}

interface RecordBase {
  /** The stable key this module is read by. Not DEFRA's: DEFRA's own label is in `activity` / `fuel`. */
  key: string
  kg_co2e: number
  unit: string
  sheet: string
  row: number
  cells: Record<string, string>
  gases: EnergyGases | null
}

/** One WTT- fuels row: DEFRA's activity block, fuel label and unit, exactly as published. */
export interface EnergyFuelFactor extends RecordBase {
  activity: string
  fuel: string
}

/** One electricity or heat row: DEFRA's activity label, and the country or type beside it. */
export interface EnergyLineFactor extends RecordBase {
  activity: string
  country?: string
  type?: string
  year: number
}

/** A unit conversion the workbook publishes, with the cell where its row meets its column. */
export interface EnergyConversion {
  key: string
  description: string
  from: string
  to: string
  factor: number
  sheet: string
  row: number
  cells: Record<string, string>
}

interface EnergyArtefact {
  metadata: Record<string, unknown>
  fuels: EnergyFuelFactor[]
  electricity: EnergyLineFactor[]
  heat_and_steam: EnergyLineFactor[]
  conversions: EnergyConversion[]
}

const artefact = raw as unknown as EnergyArtefact

export const DEFRA_ENERGY_META = artefact.metadata as {
  source: string
  title_as_published: string
  edition: string
  factor_set: string
  file_version: string
  year: number
  sheets: string[]
  scope: string
  scope_cells: Record<string, { cell: string; text: string }>
  sheet_descriptions: Record<string, { sheet: string; cell: string; text: string }>
  gwp_basis: string
  gwp_basis_note: string
  upstream_only_note: string
  cv_basis_note: string
  overseas_note: string
  separate_lines_note: string
  natural_gas_mass_note: string
  empty_cell_note: string
  licence: string
  licence_url: string
  attribution_required: string
  gas_split_rounding: Record<string, {
    published_total: number; split_sum: number; difference: number; difference_pct: number
    cells: { total: string; split: string }; sheet: string
  }>
  gas_split_rounding_note: string
  guidance: Record<string, { sheet: string; cell: string; text: string }>
  counts: Record<string, number>
  generated_on: string
  generated_from: string
  generated_from_sha256: string
  generated_by: string
  energy_fingerprint_sha256: string
}

export const DEFRA_ENERGY_FUELS: readonly EnergyFuelFactor[] = artefact.fuels
export const DEFRA_ENERGY_ELECTRICITY: readonly EnergyLineFactor[] = artefact.electricity
export const DEFRA_ENERGY_HEAT_AND_STEAM: readonly EnergyLineFactor[] = artefact.heat_and_steam
export const DEFRA_ENERGY_CONVERSIONS: readonly EnergyConversion[] = artefact.conversions

/** Every record, in one list, for a caller that wants to cite or check them all. */
export const DEFRA_ENERGY_RECORDS: readonly (EnergyFuelFactor | EnergyLineFactor | EnergyConversion)[] = [
  ...artefact.fuels, ...artefact.electricity, ...artefact.heat_and_steam, ...artefact.conversions,
]

/**
 * A factor by its key, or null where the artefact holds none.
 *
 * ⚠️ null IS AN ABSENCE, NEVER A ZERO. A caller that cannot find its factor must say so and withhold
 * the figure, the way the GHG engine refuses a fuel whose unit no table publishes.
 */
export function energyFactor(key: string): EnergyFuelFactor | EnergyLineFactor | null {
  const hit = [...artefact.fuels, ...artefact.electricity, ...artefact.heat_and_steam]
    .find(r => r.key === key)
  return hit ?? null
}

/** A published conversion by its key, or null. Same rule: null is an absence. */
export function energyConversion(key: string): EnergyConversion | null {
  return artefact.conversions.find(c => c.key === key) ?? null
}
