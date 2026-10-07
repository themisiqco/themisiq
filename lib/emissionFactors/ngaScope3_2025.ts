// ── DCCEEW NATIONAL GREENHOUSE ACCOUNTS FACTORS 2025: SCOPE 3 FOR ELECTRICITY AND NATURAL GAS ──────
//
// FI6 diff 1. Transcribed from national-greenhouse-account-factors-2025.pdf and the matching .xlsx
// (~/themisiq-sources/nga/), and from nothing else. Read by lib/scope3/cat3Energy.ts (FI6 diff 2), which prices
// Australian Category 3 gas and electricity from Tables 1 and 6. Table 2's figure is held and not read.
//
// R5: every value is in NGA's own unit, exactly as printed. Nothing here is converted, rounded, summed
// or filled in. Each record carries its table, row (as printed), column, page and workbook cell, so a
// verifier can find it, and ngaScope3_2025.test.ts checks every one against the same citation.
//
// WHAT THE ELECTRICITY FIGURE COVERS. NGA prints ONE Scope 3 figure per state or grid (Table 1), not a
// split. Section 2.2 (p.8): "The scope 3 emission factors found in Table 1 below, include electricity
// lost through the grid network in their derivation." Appendix 4 (p.54) says the losses "form a
// component of the scope 3 emission factor". Table 25 (p.56) is NOT a split of it: it is the factor for
// network operators, which "exclude emissions from electricity losses in the grid" and "include only
// emissions tied to the extraction, production and transport of fuels that power the grid". So a
// consumer's line is one Table 1 figure, labelled as including grid losses; Table 25 is not transcribed.
//
// ⚠️ TASMANIA AND THE NORTHERN TERRITORY HAVE NO GAS FACTOR. Table 6 prints "C" (confidential) for both,
// in both columns. They are held as `value: null`, never as a number. NGA's note suggests the Victorian
// factors for Tasmania and the Western Australian ones for the Northern Territory (p.20); whether to
// apply that suggestion is ruling R15 (a), and cat3Energy.ts applies it with the note quoted on the row; this table
// still records what NGA prints.
//
// Keyed by edition ('2025') so T3c can add editions beside it.

export type NgaScope3Edition = '2025'

/** Table 1 rows, in NGA's order. NSW and the ACT are one row; WA and the NT are listed by grid. */
export type NgaElectricityRow = 'NSW_ACT' | 'VIC' | 'QLD' | 'SA' | 'WA_SWIS' | 'WA_NWIS' | 'TAS' | 'NT_DKIS' | 'NATIONAL'
/** Table 6 rows, in NGA's order. NSW and the ACT are one row; WA and the NT are not split by grid here. */
export type NgaGasRow = 'NSW_ACT' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT'
/** Table 6 columns. "Metro is defined as located on or east of the dividing range in NSW, including
 *  Canberra and Queanbeyan, Melbourne, Brisbane, Adelaide or Perth. Otherwise, the non-metro factor
 *  should be used." (Table 6 notes, p.20) */
export type NgaGasArea = 'metro' | 'non_metro'

export interface NgaCited {
  /** The figure as NGA prints it, in `unit`; null where NGA prints no figure ("C", confidential). */
  value: number | null
  /** The cell text as the PDF prints it ("14.0", "C"), so a test can show nothing was derived. */
  printed: string
  unit: 'kg CO2-e/kWh' | 'kg CO2-e/GJ'
  table: string
  /** The row label as printed in the PDF. */
  row: string
  column: string
  /** PDF page (the PDF's page numbers and the printed ones agree). */
  page: number
  /** Cell in the .xlsx sheet named `table`. */
  cell: string
}

const T1 = 'Table 1 Indirect (scope 2 and scope 3) location-based emission factors associated with the consumption and losses of purchased or acquired electricity'
const T1_COL = 'Scope 3 Emission Factors (kg CO2-e/kWh)'
const T2 = 'Table 2 Indirect (scope 2 and scope 3) market-based emission factors associated with the consumption and losses of purchased or acquired electricity'
const T6 = 'Table 6 Indirect (Scope 3) emission factors for the consumption of natural gas'
const T6_METRO = 'Scope 3 Emission Factors for Natural Gas (kg CO2-e/GJ), Metro'
const T6_NON_METRO = 'Scope 3 Emission Factors for Natural Gas (kg CO2-e/GJ), Non-Metro'

const elec = (row: string, printed: string, page: number, cell: string): NgaCited =>
  ({ value: Number(printed), printed, unit: 'kg CO2-e/kWh', table: T1, row, column: T1_COL, page, cell })
const gas = (row: string, column: string, printed: string, cell: string): NgaCited =>
  ({ value: printed === 'C' ? null : Number(printed), printed, unit: 'kg CO2-e/GJ', table: T6, row, column, page: 19, cell })

export interface NgaScope3Tables {
  /** Location-based Scope 3, one figure per state or grid, including grid losses (Table 1). */
  electricity: Record<NgaElectricityRow, NgaCited>
  /** Market-based Scope 3 for the national Residual Mix Factor (Table 2). National only, as published. */
  electricityResidualMix: NgaCited
  /** Natural gas distributed in a pipeline, per GJ, by state and metro or non-metro (Table 6). */
  naturalGas: Record<NgaGasRow, Record<NgaGasArea, NgaCited>>
}

const NGA_SCOPE3: Record<NgaScope3Edition, NgaScope3Tables> = {
  '2025': {
    electricity: {
      // Table 1, Scope 3 column (kg CO2-e/kWh), p.8 to 9. Workbook sheet "Table 1", column C.
      NSW_ACT: elec('New South Wales and Australian Capital Territory', '0.03', 8, 'C4'),
      VIC: elec('Victoria', '0.09', 8, 'C5'),
      QLD: elec('Queensland', '0.09', 8, 'C6'),
      SA: elec('South Australia', '0.04', 8, 'C7'),
      WA_SWIS: elec('Western Australia - South West Interconnected System (SWIS)', '0.06', 8, 'C8'),
      WA_NWIS: elec('Western Australia - North Western Interconnected System (NWIS)', '0.09', 8, 'C10'),
      TAS: elec('Tasmania', '0.03', 8, 'C11'),
      NT_DKIS: elec('Northern territory - Darwin Katherine Interconnected System (DKIS)', '0.09', 9, 'C12'),
      NATIONAL: elec('National', '0.07', 9, 'C14'),
    },
    // Table 2, Scope 3 column (kg CO2-e/kWh), p.9, row "National". Workbook sheet "Table 2", C4.
    electricityResidualMix: { value: 0.11, printed: '0.11', unit: 'kg CO2-e/kWh', table: T2,
      row: 'National', column: 'Scope 3 Emission Factors (kg CO2-e/kWh)', page: 9, cell: 'C4' },
    naturalGas: {
      // Table 6, p.19 (notes on p.20). Workbook sheet "Table 6": Metro column B, Non-Metro column C.
      NSW_ACT: { metro: gas('New South Wales and ACT', T6_METRO, '13.1', 'B4'), non_metro: gas('New South Wales and ACT', T6_NON_METRO, '14.0', 'C4') },
      VIC: { metro: gas('Victoria', T6_METRO, '4.0', 'B5'), non_metro: gas('Victoria', T6_NON_METRO, '4.0', 'C5') },
      QLD: { metro: gas('Queensland', T6_METRO, '8.8', 'B6'), non_metro: gas('Queensland', T6_NON_METRO, '7.9', 'C6') },
      SA: { metro: gas('South Australia', T6_METRO, '10.7', 'B7'), non_metro: gas('South Australia', T6_NON_METRO, '10.6', 'C7') },
      WA: { metro: gas('Western Australia', T6_METRO, '4.1', 'B8'), non_metro: gas('Western Australia', T6_NON_METRO, '4.0', 'C8') },
      TAS: { metro: gas('Tasmania', T6_METRO, 'C', 'B9'), non_metro: gas('Tasmania', T6_NON_METRO, 'C', 'C9') },
      NT: { metro: gas('Northern Territory', T6_METRO, 'C', 'B10'), non_metro: gas('Northern Territory', T6_NON_METRO, 'C', 'C10') },
    },
  },
}

/** The NGA Scope 3 tables for an edition, or null for an edition not held. */
export function ngaScope3(edition: string): NgaScope3Tables | null {
  return Object.prototype.hasOwnProperty.call(NGA_SCOPE3, edition) ? NGA_SCOPE3[edition as NgaScope3Edition] : null
}

/** Editions held, oldest first. */
export const NGA_SCOPE3_EDITIONS = Object.keys(NGA_SCOPE3).sort() as NgaScope3Edition[]

/**
 * FI6 (ruling R15 b): the Australian states where NGA's metro and non-metro gas factors differ, so the GHG wizard asks
 * the site's area. Victoria prints 4.0 in both columns, and Tasmania and the Northern Territory have no area NGA names
 * as metro (their factors come from Victoria and Western Australia, non-metro), so none of the three is asked.
 */
export const AU_GAS_AREA_STATES: readonly string[] = ['NSW', 'ACT', 'QLD', 'SA', 'WA']
