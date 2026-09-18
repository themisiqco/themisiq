// ── WHICH FIELD HOLDS A SPEND-PRICED CATEGORY'S EXIOBASE CODE ───────────────────────────────────
//
// One function, pure, over the stored category data. It exists so that the rule it enforces is a TESTED
// SIGNATURE rather than a comment: this function cannot read the company sector, because it is not given
// the company sector.
//
// ⚠️ WHY IT WAS EXTRACTED. Until 17 Sep 2026 the same logic sat in a closure inside
// app/dashboard/scope3/page.tsx and read `catData.cat1?.supplier_sector || sector`, where `sector` was the
// company's own primary sector from Step 1. An untouched Category 1 therefore produced a priced figure from
// a row the customer had never chosen — and the company sector describes what a business SELLS, not what it
// buys, so a haulier's Category 1 priced off freight services and a utility's off electricity generation,
// the one row that double-counts Scope 2. Nothing on screen distinguished the default from an answer.
//
// That is the same defect as the CSV import that turned a missing sector into 'Professional Services': a
// plausible stand-in yields a confident figure, and a confident wrong figure reaches a verifier while a
// blank one gets filled in. The fix is not a better default. It is that an unchosen sector prices nothing
// and says which input is missing.
//
// A closure could be given the company sector again by anyone editing the file. This cannot.

import type { SpendCategoryId } from './categoryScope'

/**
 * Where each spend-priced category keeps its code in cat_data.
 *
 * ⚠️ TWO FIELDS, NOT ONE, AND THEY ARE NOT INTERCHANGEABLE. Category 1 has always stored
 * `supplier_sector` — the sector of the suppliers a company buys from — and saved records hold it under
 * that name, so it cannot be renamed without rewriting stored data. Categories 2 and 4 share
 * `spend_sector`, which is safe only because no category reads another's row.
 */
export const SPEND_SECTOR_FIELD: Readonly<Record<SpendCategoryId, 'supplier_sector' | 'spend_sector'>> = {
  cat1: 'supplier_sector',
  cat2: 'spend_sector',
  cat4: 'spend_sector',
}

/** The shape this function needs of one category's stored data, and nothing more. */
export interface SpendSectorFields {
  supplier_sector?: string
  spend_sector?: string
}

/**
 * The EXIOBASE code a spend-priced category is priced with. '' means the customer has not chosen one, and
 * nothing is priced — never a stand-in, never another category's answer, never the company sector.
 *
 * ⚠️ '' FOR A CATEGORY THAT IS NOT SPEND-PRICED, rather than a throw. Callers ask this for a category id
 * that arrives from a list of all fifteen; the answer for Category 5 is that it has no spend sector, which
 * is what '' says. A throw would make a display helper a source of failure.
 */
export function spendSector(
  catData: Readonly<Record<string, SpendSectorFields | undefined>>,
  catId: string,
): string {
  if (!Object.hasOwn(SPEND_SECTOR_FIELD, catId)) return ''
  const field = SPEND_SECTOR_FIELD[catId as SpendCategoryId]
  return catData[catId]?.[field] ?? ''
}
