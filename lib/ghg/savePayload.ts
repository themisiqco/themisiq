// lib/ghg/savePayload.ts
//
// THE FIGURES A SAVE WRITES, FROM ONE DERIVATION (T7). Pure: no React, no Supabase, no clock.
//
// Totals, workings, pct_estimated and factor_editions are all built from deriveLocations output, so the
// saved totals equal the sum of the saved workings rows by construction. locations_data is the RAW
// locations, as edited (T7 ruling): a document-backed field keeps whatever was typed (usually 0), never
// the derived figure. Every reader re-derives on load, so a stored figure is only ever a typed one, which
// is what deriveLocations' rule for all-rejected fields relies on (T4 ruling).
//
// derivation_version 2 marks figures derived from accepted documents at every save. The column is added
// by docs/review/patches/T7.sql (supabase/migrations/20261002_ghg_derivation_version.sql), which must
// exist in the database before this code saves, or the save is refused for an unknown column.
//
// factor_selection (T3c diff 3) is the frozen class (b) edition choices: read from the inventory, passed to every
// figure below as `frozen`, and written back with any choice this save made (lib/ghg/factorSelection.ts). The
// column is added by supabase/migrations/20261008_ghg_factor_selection.sql, which must likewise exist first.

import { deriveLocations, calcInventory, buildWorkings, pctEstimated, selectionFor, type Inventory, type GwpVersion, type SelectionContext } from './engine'
import { factorEditionsForSave } from './factorEditions'
import { factorSelectionForSave, selectionContextFor } from './factorSelection'
import type { DatasetId } from './factorEditionRegistry'
import type { EditionUse } from './engine'

export const DERIVATION_VERSION = 2

export function figuresForSave(inventory: Inventory, gwpVersion: GwpVersion = 'AR6', ctx: SelectionContext = {}) {
  const derived = deriveLocations(inventory)
  const resolutions = inventory.coverage_resolutions ?? []
  // T3c: ONE selection context for every figure in the payload. calcInventory was called without the year end until
  // T3c, so a non-December inventory's totals were priced on December's editions while its workings used its own.
  // Diff 3: the inventory's frozen class (b) choices for its current window, and a record of every edition used.
  const used = new Map<DatasetId, EditionUse>()
  const c = { ...selectionContextFor(inventory, ctx.preparedOn ?? new Date()), record: used }
  const sel = selectionFor(inventory.reporting_year, inventory.fiscal_year_end_month, c)
  const totals = calcInventory(derived, gwpVersion, inventory.reporting_year, sel)
  const workings = buildWorkings(derived, gwpVersion, inventory.reporting_year, resolutions, inventory.fiscal_year_end_month, c)
  return {
    locations_data: inventory.locations,
    totals,
    workings,
    pct_estimated: pctEstimated(inventory, gwpVersion, c),
    factor_editions: factorEditionsForSave(derived, inventory.reporting_year, inventory.factor_editions, inventory.fiscal_year_end_month, c),
    factor_selection: factorSelectionForSave(inventory.factor_selection, used, sel),
    derivation_version: DERIVATION_VERSION,
  }
}
