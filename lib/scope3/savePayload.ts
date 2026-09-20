// ── WHAT GOES INTO THE SAVED cat_data, AND WHAT MUST NOT ─────────────────────────────────────────
//
// ⚠️ A BLANK SELECT WRITES '', AND '' IS NOT "NOT CHOSEN" TO A DATABASE. The Scope 3 page's selects
// store e.target.value, and their first option's value is ''. For most fields nothing minds. For a
// sector held inside cat_data it is a save-breaking value: public.assert_sector_codes_exist()
// (supabase/migrations/20260914_exiobase_sectors.sql) tests `v is not null`, so '' reaches the
// membership test, fails it, and the whole upsert is refused with SQLSTATE PT422 — and the message it
// raises lists the offending codes, which for '' is an empty list.
//
// The same shape as `sector: sector || null` in the page's upsert, for the paths that live in jsonb.

/**
 * ⚠️ TYPED AS "any map of objects", ON PURPOSE. The page's CategoryData is an interface with named
 * fields and no index signature, so a parameter of Record<string, Record<string, unknown>> would reject
 * the very value this exists to clean. The generic keeps the caller's own type on the way out, and the
 * two fields this reads are named below rather than inferred.
 */
const VALIDATED_SECTOR_PATHS: readonly [string, string][] = [
  ['cat1', 'supplier_sector'],
  ['cat15', 'portfolio_sector'],
]

/**
 * cat_data as it should be written: every sector path the database validates is dropped when it is
 * blank, rather than saved as ''.
 *
 * ⚠️ THE KEY IS REMOVED, NOT SET TO null. `supplier_sector` is `string | undefined` in CategoryData and
 * the page reads it back with `|| ''`; a null would be a third state for every reader to handle. The two
 * paths are named ONE BY ONE, exactly as the trigger names them: a new sector-bearing path has to be
 * added here consciously rather than swept up by a pattern that might also strip a field the database is
 * happy with.
 *
 * ⚠️ THE INPUT IS NOT MUTATED. It is the page's live state, still being rendered from.
 */
export function catDataForSave<T extends Record<string, unknown>>(catData: T): T {
  let out: Record<string, unknown> = catData
  for (const [cat, field] of VALIDATED_SECTOR_PATHS) {
    const entry = out[cat]
    if (!entry || typeof entry !== 'object') continue
    const value = (entry as Record<string, unknown>)[field]
    if (typeof value !== 'string' || value.trim() !== '') continue
    const copy: Record<string, unknown> = { ...(entry as Record<string, unknown>) }
    delete copy[field]
    out = { ...out, [cat]: copy }
  }
  return out as T
}
