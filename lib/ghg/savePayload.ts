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

import { deriveLocations, calcInventory, buildWorkings, pctEstimated, selectionFor, type Inventory, type GwpVersion, type SelectionContext, type Location } from './engine'
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

// ── T18: THE DOCUMENT LOG CANNOT BE REWRITTEN BY A SAVE ──────────────────────────────────────────────────────────
// Each location's document_log (withdrawals, restorations, deletions; lib/ghg/documentActions.ts) is append-only.
// The page keeps the log as loaded (documentLogBaseline) and refuses a save whose locations_data lacks an entry
// that record had (documentLogProblem), so no edit, stale draft or bug can drop a tombstone. Entries are compared
// whole, so an entry edited in place counts as missing.
//
// ⚠️ A LOCATION NO LONGER IN THE PAYLOAD IS NOT CHECKED. Deleting a location removes its documents and its log
// together, and refusing that here would refuse every location delete once a document had been withdrawn. That
// path leaves no record of the documents it removes; it is reported as a gap, not solved here.

/** The log as loaded: per location id, each entry as its JSON text. */
export type DocumentLogBaseline = Record<string, string[]>

export function documentLogBaseline(locations: readonly Pick<Location, 'id' | 'document_log'>[] | null | undefined): DocumentLogBaseline {
  const out: DocumentLogBaseline = {}
  for (const l of locations ?? []) if (l.document_log?.length) out[l.id] = l.document_log.map(e => JSON.stringify(e))
  return out
}

/** Why a save would drop a document-log entry the loaded record had, or null. Plain, no em dash. */
export function documentLogProblem(baseline: DocumentLogBaseline, locations: readonly Pick<Location, 'id' | 'name' | 'document_log'>[]): string | null {
  for (const l of locations) {
    const had = baseline[l.id]
    if (!had?.length) continue
    const now = new Set((l.document_log ?? []).map(e => JSON.stringify(e)))
    if (had.some(e => !now.has(e))) {
      return `This save would remove the record of a document withdrawn, restored or deleted at ${l.name || 'a location'}. That record is kept permanently, so nothing was saved. Reload the inventory and try again.`
    }
  }
  return null
}
