import type { AssuranceState } from './supplierAssurance'

// ── WHAT A CATEGORY FIGURE IS A TOTAL OF, BUILT ONCE AT ACCEPTANCE ───────────────────────────────
//
// The Cat 1 route computes a line per supplier, the suppliers it could not cover, and any non-USD
// spend it refused to convert. useCatOneFigure kept the total and discarded the rest, so the workings
// behind a reported figure lived in React state until the page closed.
//
// ⚠️ PURE, AND OUT OF THE PAGE, SO THE SHAPE CAN BE TESTED WITHOUT RENDERING ANYTHING. The location
// delete work learned this the hard way one task ago: a facts probe that was a closure over component
// state could only be exercised by hand-building its own parameter object, and a hand-built object
// described a shape the product does not produce. The defect that reached the preview was invisible
// for exactly that reason. Everything here takes plain data and returns plain data.
//
// ⚠️ NOTHING IS PERSISTED AT ACCEPTANCE. accepted_at is fixed at the click, and the row is written by
// the save that follows. A snapshot is a record of what was REPORTED, and an acceptance that is never
// saved was never reported: persisting one would create evidence for a figure nobody filed, and would
// mean creating a scope3_inventories row as a side effect of a button that is not Save.

/** One supplier's contribution, exactly as /api/campaigns/[id]/scope3-cat1 returns it. */
export interface SnapshotLine {
  supplier_id: string
  supplier_name: string
  method: 'supplier-specific' | 'spend-based'
  data_quality: string
  value_mt: number
  /** The sentence DISPLAYED at acceptance. A rendering, never the authority: see the column comment. */
  basis: string
  allocation_method?: string

  // ── WHETHER THE SUPPLIER'S OWN REPORTING IS THIRD-PARTY ASSURED ──
  //
  // ⚠️ `assurance` DESCRIBES THIS LINE'S FIGURE; `supplier_assurance_raw` DESCRIBES THE SUPPLIER. They
  // are not two spellings of one thing. A spend-based line is always 'not_applicable' however the
  // supplier answered, because its figure is the buyer's spend times a factor and the supplier's
  // assurance status does not bear on it. ⚠️ SO DO NOT ROLL UP "ASSURED SUPPLIERS" ACROSS LINES: filter
  // on the state through carriesThirdPartyAssurance(), which returns false for 'not_applicable', and
  // never on the raw answer. Rolling up the raw answer reports a spend-based estimate as assured.
  //   Neither field says a figure is assured, and no string in supplierAssurance.ts does either. The
  // question asks whether the SUPPLIER'S emissions figures are assured, which does not establish that
  // the slice they attributed to this buyer falls inside that scope.
  //
  // ⚠️ REQUIRED, NOT OPTIONAL, AND THAT IS LOAD-BEARING. Every line written from now on carries
  // `assurance`, so a line with the key ABSENT can only be a snapshot accepted before the field
  // existed. That is how those rows stay readable as "not recorded" rather than as "not assured".
  // Snapshots are immutable and are NOT backfilled: a snapshot records what was known at acceptance,
  // and this was not known. Make either field optional and that inference silently collapses.
  supplier_assurance_raw: string | null
  assurance: AssuranceState
}

export interface SnapshotUncovered { supplier_id: string; supplier_name: string; reason: string }
export interface SnapshotCurrencyFlag {
  supplier_id: string; supplier_name: string; spend: number; currency: string; note: string
}

/** What the route returned, narrowed to the parts a snapshot keeps. */
export interface AcceptedResult {
  total_mt: number
  lines: readonly SnapshotLine[]
  uncovered: readonly SnapshotUncovered[]
  currency_flags: readonly SnapshotCurrencyFlag[]
}

/**
 * A snapshot held in state between acceptance and the save that writes it.
 *
 * `scope3_inventory_id`, `user_id` and `accepted_by` are NOT here: they belong to the save, which is
 * the only place that knows the record's id and the session. Putting them here would invite a caller
 * to believe this object is insertable on its own.
 */
export interface PendingCategorySnapshot {
  category: string
  accepted_at: string
  figure_as_used: number
  unit: string
  method: 'supplier-specific' | 'spend-based' | 'mixed'
  lines: readonly SnapshotLine[]
  uncovered: readonly SnapshotUncovered[]
  currency_flags: readonly SnapshotCurrencyFlag[]
  supersedes_id: string | null
  restatement_reason: string | null
}

/**
 * ⚠️ 'mixed' IS DERIVED FROM THE LINES, NOT ASSUMED FROM THE CATEGORY. A Cat 1 total is routinely
 * both: a supplier who reported an allocated figure is priced supplier-specific, and one who did not
 * is gap-filled from spend, in the same total. Recording either single method would describe the
 * figure wrongly for most inventories, which is the claim a verifier checks first.
 *   With no lines at all there is no method to name, so it is 'spend-based' only if a line says so.
 */
export function snapshotMethod(lines: readonly SnapshotLine[]): PendingCategorySnapshot['method'] {
  const kinds = new Set(lines.map(l => l.method))
  if (kinds.size > 1) return 'mixed'
  return kinds.has('spend-based') ? 'spend-based' : 'supplier-specific'
}

/**
 * Build the snapshot for an acceptance.
 *
 * `previousId` is whatever cat_snapshot_ids already held for this category: a second acceptance
 * supersedes the first rather than replacing it. `reason` is the buyer's words, or null, and null is
 * allowed here because the report gates it rather than the insert.
 *
 * ⚠️ figure_as_used IS THE FIGURE THE PAGE WILL USE, PASSED IN, not r.total_mt. useCatOneFigure
 * rounds to three decimals before writing cat_data.cat1.supplier_emissions, so taking the route's
 * raw total here would record a snapshot of a figure that never went into any total. One number.
 */
export function buildCategorySnapshot(opts: {
  category: string
  figureAsUsed: number
  unit: string
  result: AcceptedResult
  acceptedAt: string
  previousId?: string | null
  reason?: string | null
}): PendingCategorySnapshot {
  return {
    category: opts.category,
    accepted_at: opts.acceptedAt,
    figure_as_used: opts.figureAsUsed,
    unit: opts.unit,
    method: snapshotMethod(opts.result.lines),
    lines: opts.result.lines,
    uncovered: opts.result.uncovered,
    currency_flags: opts.result.currency_flags,
    supersedes_id: opts.previousId ?? null,
    // A reason without something to supersede would fail the table's CHECK, so it is dropped here
    // rather than sent and refused.
    restatement_reason: opts.previousId ? (opts.reason?.trim() || null) : null,
  }
}

/**
 * Is this snapshot a restatement with nothing said about why?
 *
 * Read by the report gate, beside unjustifiedExclusions. Kept here so the rule lives with the shape
 * rather than being re-derived on a surface.
 */
export function isUnreasonedRestatement(s: PendingCategorySnapshot): boolean {
  return s.supersedes_id !== null && !(s.restatement_reason ?? '').trim()
}

/**
 * The two PostgREST failures that mean "the migration has not run yet", and nothing else.
 *
 * ⚠️ NARROW ON PURPOSE. Tolerating every error here would swallow a real write failure and leave the
 * customer believing their workings were recorded. These three codes are the absent table, the absent
 * column, and PostgREST's own schema-cache miss for a column it has never seen. Anything else is a
 * genuine failure and is reported by the caller.
 */
export function isMissingSnapshotSchema(err: { code?: string | null } | null | undefined): boolean {
  return err?.code === '42P01' || err?.code === '42703' || err?.code === 'PGRST204'
}
