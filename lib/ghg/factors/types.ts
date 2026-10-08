// lib/ghg/factors/types.ts
//
// T3d: the shape every edition file in this folder uses. One file per publisher edition, transcribed from the file in
// ~/themisiq-sources that lib/ghg/factorEditionRegistry.ts names for it, and nothing else. EVERY VALUE CARRIES ITS
// CITATION: the document, the table or sheet, the row and column as printed, the cell or page, and the correction the
// value reflects. A value that could not be located is absent, and the edition file's `leftOut` says which and why;
// nothing is estimated or borrowed from a neighbouring edition. docs/review/t3d-2025-values.csv lists every value for
// checking against the source.

/** Where one printed value is. `cell` for a workbook, `page` (printed page number) for a PDF. */
export interface FactorCite {
  document: string
  /** The sheet (workbook) or table (PDF) as the publisher names it. */
  table: string
  /** The row as the publisher labels it. */
  row: string
  /** The column as the publisher labels it. */
  column: string
  cell?: string
  page?: string
  /** The correction or version the value reflects: "Version 1.1 (correction of 30 Oct 2024)", "original publication". */
  correction: string
}

/** One value, in the unit the engine stores, with where it is printed and, if any, the exact step from print to store. */
export interface CitedValue {
  value: number
  unit: string
  cite: FactorCite
  /** An exact step the engine applies to the printed figure (per tonne / 1,000 = per kg; g/kWh / 1,000 = kg/kWh). */
  derivation?: string
}

/** A value the edition prints that the engine stores split by gas, each part cited. */
export interface CitedGases { co2: CitedValue; ch4: CitedValue; n2o: CitedValue }

/** A value the transcription did not record, with the reason. Never a zero. */
export interface LeftOut { key: string; reason: string }
