// lib/ghg/factorSelection.ts
//
// T3c diff 3: the frozen class (b) edition choices, `ghg_inventories.factor_selection`.
//
// A class (b) dataset (eGRID, Green-e, AIB, EEA, the ECCC grid and NIR tables, the MfE grid and T&D series) takes
// the edition whose data year is the reporting year, else the newest published on or before the day the inventory
// was first prepared. That second choice depends on the day, so it is saved with the inventory and read back on
// every later save and every calculation; a newer edition registered afterwards never replaces it.
//
// It is a separate column from factor_editions because factor_editions is recomputed on every save: a frozen
// choice cannot live in a value that is rewritten.
//
// Rulings of 8 Oct 2026 (Lisa):
//   A. Each entry records the reporting window it was chosen for. An entry whose window differs from the
//      inventory's current window (the year or the year end changed) is discarded and selected again, dated that
//      save. This departs from the design's column shape, which had no window.
//   B. A dataset first used on a later save is selected on that save, dated that day, and merged in; earlier
//      entries are never replaced.
//   C. The free-calculator claim is the inventory's first save and writes the column dated the claim day.
//   D. Only data_year_match and data_year_newest selections are stored. A provisional (R19) or class (a)
//      selection is never frozen.
import { selectionFor, type EditionUse, type FactorSelection, type Sel, type SelectionContext, type StoredFactorSelection, type StoredSelectionEntry } from './engine'
import { DATASETS, type DatasetId } from './factorEditionRegistry'

const FROZEN_RULES: readonly StoredSelectionEntry['rule'][] = ['data_year_match', 'data_year_newest']
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The reporting window as the column records it: "yyyy-mm-dd/yyyy-mm-dd", first and last day. */
export function windowKey(sel: Pick<Sel, 'win'>): string {
  return `${isoDay(sel.win.start)}/${isoDay(sel.win.end)}`
}

/** A stored entry the reader can trust: a known class (b) dataset, a frozen rule, a day, and a window. */
function wellFormed(ds: string, e: unknown): e is StoredSelectionEntry {
  if (!(ds in DATASETS) || DATASETS[ds as DatasetId].class !== 'b' || !e || typeof e !== 'object') return false
  const x = e as Record<string, unknown>
  return typeof x.edition === 'string' && x.edition !== '' && FROZEN_RULES.includes(x.rule as StoredSelectionEntry['rule'])
    && typeof x.selected_on === 'string' && ISO_DAY.test(x.selected_on) && typeof x.window === 'string'
    && (x.data_year === null || typeof x.data_year === 'number')
}

/** The stored entries that still apply: well formed, and chosen for this window (ruling A). */
function kept(stored: StoredFactorSelection | null | undefined, window: string): StoredFactorSelection {
  const out: StoredFactorSelection = {}
  for (const [ds, e] of Object.entries(stored ?? {})) if (wellFormed(ds, e) && e.window === window) out[ds as DatasetId] = e
  return out
}

/** The frozen selections selectEdition takes, from the stored column, for the window `sel` covers. */
export function frozenFor(stored: StoredFactorSelection | null | undefined, sel: Pick<Sel, 'win'>): FactorSelection {
  const out: FactorSelection = {}
  for (const [ds, e] of Object.entries(kept(stored, windowKey(sel))) as [DatasetId, StoredSelectionEntry][])
    out[ds] = { dataset: ds, label: e.edition, ...(e.data_year != null ? { data_year: e.data_year } : {}), rule: e.rule, selected_on: e.selected_on }
  return out
}

/**
 * The selection context for a saved inventory: prepared on `preparedOn` (today when not given), with its frozen
 * class (b) choices for its current window. Every surface that prices a saved inventory takes this, so the page,
 * the save, the monthly series, the trends page and the assurance PDF price on one selection. The free calculator
 * (nothing saved) passes an inventory with no factor_selection and so freezes nothing.
 */
export function selectionContextFor(
  inventory: { reporting_year: number; fiscal_year_end_month?: number | null; factor_selection?: StoredFactorSelection | null },
  preparedOn: Date = new Date(),
): SelectionContext {
  const sel = selectionFor(inventory.reporting_year, inventory.fiscal_year_end_month ?? 12, { preparedOn })
  const frozen = frozenFor(inventory.factor_selection, sel)
  return { preparedOn, ...(Object.keys(frozen).length > 0 ? { frozen } : {}) }
}

/**
 * The column a save writes: the stored entries that still apply (never replaced, ruling B), plus every class (b)
 * edition this calculation selected fresh by data_year_match or data_year_newest (ruling D), dated the day it was
 * selected. `used` is the map the calculation recorded (SelectionContext.record).
 */
export function factorSelectionForSave(stored: StoredFactorSelection | null | undefined, used: ReadonlyMap<DatasetId, EditionUse>, sel: Pick<Sel, 'win' | 'preparedOn'>): StoredFactorSelection {
  const window = windowKey(sel)
  const out = kept(stored, window)
  for (const [ds, u] of used) {
    if (out[ds] || DATASETS[ds].class !== 'b' || u.provisional) continue
    if (!FROZEN_RULES.includes(u.rule as StoredSelectionEntry['rule'])) continue
    out[ds] = { edition: u.label, data_year: u.key, rule: u.rule as StoredSelectionEntry['rule'], selected_on: u.selected_on ?? sel.preparedOn, window }
  }
  return out
}
