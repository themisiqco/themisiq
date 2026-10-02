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

import { deriveLocations, calcInventory, buildWorkings, pctEstimated, type Inventory, type GwpVersion } from './engine'
import { factorEditionsForSave } from './factorEditions'

export const DERIVATION_VERSION = 2

export function figuresForSave(inventory: Inventory, gwpVersion: GwpVersion = 'AR6') {
  const derived = deriveLocations(inventory)
  const resolutions = inventory.coverage_resolutions ?? []
  const totals = calcInventory(derived, gwpVersion, inventory.reporting_year)
  return {
    locations_data: inventory.locations,
    totals,
    workings: buildWorkings(derived, gwpVersion, inventory.reporting_year, resolutions, inventory.fiscal_year_end_month),
    pct_estimated: pctEstimated(inventory, gwpVersion),
    factor_editions: factorEditionsForSave(derived, inventory.reporting_year, inventory.factor_editions),
    derivation_version: DERIVATION_VERSION,
  }
}
