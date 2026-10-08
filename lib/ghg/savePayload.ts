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

import { deriveLocations, calcInventory, buildWorkings, pctEstimated, selectionFor, type Inventory, type GwpVersion, type SelectionContext } from './engine'
import { factorEditionsForSave } from './factorEditions'

export const DERIVATION_VERSION = 2

export function figuresForSave(inventory: Inventory, gwpVersion: GwpVersion = 'AR6', ctx: SelectionContext = {}) {
  const derived = deriveLocations(inventory)
  const resolutions = inventory.coverage_resolutions ?? []
  // T3c: ONE selection context for every figure in the payload. calcInventory was called without the year end until
  // T3c, so a non-December inventory's totals were priced on December's editions while its workings used its own.
  const sel = selectionFor(inventory.reporting_year, inventory.fiscal_year_end_month, ctx)
  const totals = calcInventory(derived, gwpVersion, inventory.reporting_year, sel)
  return {
    locations_data: inventory.locations,
    totals,
    workings: buildWorkings(derived, gwpVersion, inventory.reporting_year, resolutions, inventory.fiscal_year_end_month, ctx),
    pct_estimated: pctEstimated(inventory, gwpVersion, ctx),
    factor_editions: factorEditionsForSave(derived, inventory.reporting_year, inventory.factor_editions, inventory.fiscal_year_end_month, ctx),
    derivation_version: DERIVATION_VERSION,
  }
}
