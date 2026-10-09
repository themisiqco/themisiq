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
import { withTypedEntries, type TypedBaseline } from './typedEntries'
import type { DatasetId } from './factorEditionRegistry'
import type { EditionUse } from './engine'

export const DERIVATION_VERSION = 2

/**
 * T18: `typed`, when given, is who is saving and when. Each typed figure that changed since the last saved record
 * gets an entry (lib/ghg/typedEntries.ts) in the locations_data written, and the workings rows carry it. Omitted, no
 * entry is added: a caller that is not a save (a preview, a test of the figures) records nobody.
 */
export function figuresForSave(inventory0: Inventory, gwpVersion: GwpVersion = 'AR6', ctx: SelectionContext = {},
  typed?: { by: { userId: string; email: string }; at: string; baseline?: TypedBaseline; note?: string }) {
  const inventory = typed ? { ...inventory0, locations: inventory0.locations.map(l => withTypedEntries(l, typed)) } : inventory0
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

// ── T18: THE DOCUMENT LOG AND THE TYPED ENTRIES CANNOT BE REWRITTEN BY A SAVE ─────────────────────────────────
// Each location's document_log (withdrawals, restorations, deletions; lib/ghg/documentActions.ts) and typed_entries
// (who entered each typed figure, and when; lib/ghg/typedEntries.ts) are append-only. The page keeps both as loaded
// (documentLogBaseline, typedEntriesBaseline) and refuses a save whose locations_data lacks an entry that record had
// (documentLogProblem, typedEntriesProblem), so no edit, stale draft or bug can drop a tombstone or rewrite who
// entered a figure. New entries may only be added. Entries are compared whole, so an entry edited in place (its
// value, who or when) counts as missing. They are compared with their keys in sorted order, because a jsonb column
// does not keep the order an entry was written in.
//
// ⚠️ A LOCATION NO LONGER IN THE PAYLOAD IS NOT CHECKED. Deleting a location removes its documents, its log and its
// typed entries together, and refusing that here would refuse every location delete. Location deletion's own record
// is T18 section D (diff 4).

/** An append-only list as loaded: per location id, each entry as canonical JSON text. */
export type AppendOnlyBaseline = Record<string, string[]>
export type DocumentLogBaseline = AppendOnlyBaseline

/** JSON with object keys sorted at every level, so two copies of one entry compare equal however they were stored. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

type AppendOnlyKey = 'document_log' | 'typed_entries'
function appendOnlyBaseline(locations: readonly Pick<Location, 'id' | AppendOnlyKey>[] | null | undefined, key: AppendOnlyKey): AppendOnlyBaseline {
  const out: AppendOnlyBaseline = {}
  for (const l of locations ?? []) { const list = l[key] ?? []; if (list.length) out[l.id] = list.map(canonical) }
  return out
}
/** The first location, still in the payload, whose list lacks an entry the loaded record had. */
function appendOnlyBreach(baseline: AppendOnlyBaseline, locations: readonly Pick<Location, 'id' | 'name' | AppendOnlyKey>[], key: AppendOnlyKey) {
  for (const l of locations) {
    const had = baseline[l.id]
    if (!had?.length) continue
    const now = new Set((l[key] ?? []).map(canonical))
    if (had.some(e => !now.has(e))) return l
  }
  return null
}

export const documentLogBaseline = (locations: readonly Pick<Location, 'id' | 'document_log'>[] | null | undefined): DocumentLogBaseline =>
  appendOnlyBaseline(locations as readonly Pick<Location, 'id' | AppendOnlyKey>[], 'document_log')

/** Why a save would drop a document-log entry the loaded record had, or null. Plain, no em dash. */
export function documentLogProblem(baseline: DocumentLogBaseline, locations: readonly Pick<Location, 'id' | 'name' | 'document_log'>[]): string | null {
  const l = appendOnlyBreach(baseline, locations as readonly Pick<Location, 'id' | 'name' | AppendOnlyKey>[], 'document_log')
  return l ? `This save would remove the record of a document withdrawn, restored or deleted at ${l.name || 'a location'}. That record is kept permanently, so nothing was saved. Reload the inventory and try again.` : null
}

export const typedEntriesBaseline = (locations: readonly Pick<Location, 'id' | 'typed_entries'>[] | null | undefined): AppendOnlyBaseline =>
  appendOnlyBaseline(locations as readonly Pick<Location, 'id' | AppendOnlyKey>[], 'typed_entries')

/** Why a save would drop or change a typed-figure entry the loaded record had, or null. Plain, no em dash. */
export function typedEntriesProblem(baseline: AppendOnlyBaseline, locations: readonly Pick<Location, 'id' | 'name' | 'typed_entries'>[]): string | null {
  const l = appendOnlyBreach(baseline, locations as readonly Pick<Location, 'id' | 'name' | AppendOnlyKey>[], 'typed_entries')
  return l ? `This save would remove or change the record of who entered a figure at ${l.name || 'a location'}, and when. That record is kept permanently, so nothing was saved. Reload the inventory and try again.` : null
}
