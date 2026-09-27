import { NOT_PROVIDED } from '../notProvided'

// ─────────────────────────────────────────────────────────────────────────────
// ONE RENDERER FOR THE WORKINGS TABLE'S ACTIVITY CELL, READ BY BOTH SURFACES.
//
// The operator's workings table (app/dashboard/ghg/page.tsx) and the verifier page
// (app/verify/[token]/page.tsx) show the same engine rows to two different readers, and
// declarationStates.test.ts exists because they have twice ended up saying different things about the
// same row. This is the same rule one level down: the activity cell is now ONE function, so the two
// cannot diverge on what an absent quantity looks like.
//
// ⚠️ WHY THE UNIT IS NOT ALWAYS PRINTED. Both surfaces rendered `${activity_data} ${activity_unit}`
// unconditionally. The declaration and exclusion rows carry activity_data: 0 as a placeholder — the
// engine's own comment at buildWorkings says they "carry 0 because no figure exists" — and their unit
// was the empty-value glyph, so the cell read "0 —". With the glyph replaced by words that became
// "0 Not provided", which is worse: it reads as a quantity of zero in an unnamed unit. A row that
// quantified nothing has no quantity to print, so the cell says only that.
//
// ⚠️ attested_absent IS THE EXCEPTION AND MUST STAY ONE. Its result is 0, not null, because a named
// party attested at a stated time that the stream is absent. That 0 IS the claim, so the cell prints
// it. The test asserts this row and a declared-but-unquantified row render differently.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Location cell on a coverage-resolution row. These rows record a decision about the inventory,
 * not a measurement at one site, so the column needs a value that is true of every location rather
 * than a glyph. 'Not provided' would be false here: nothing failed to provide a location name.
 *
 * ⚠️ IT IS NOT A LOCATION NAME, and the operator's table groups by
 * `r.location === (loc.name || 'Location')`, so a site actually called "All locations" would pull
 * these rows into its group. The same was true of the glyph it replaces.
 */
export const ALL_LOCATIONS = 'All locations'

export interface WorkingsActivityCellRow {
  activity_data?: number | null
  activity_unit?: string | null
  result_tco2e?: number | null
}

/**
 * What the Activity data column shows for one workings row.
 *
 * ⚠️ THE NULL CASE STILL RETURNS AN EM DASH, DELIBERATELY AND PENDING ONE DECISION. A null
 * activity_data is a coverage-resolution row: not a missing quantity but an inapplicable one, so
 * 'Not provided' would name the wrong absence. The same open question governs the Factor vintage,
 * Scope 2 method and Result cells, which both surfaces still render with `|| '—'` and
 * `== null ? '—'`. They want ONE vocabulary decided together ('Not applicable', 'Not quantified'),
 * not four guesses; until then the glyph is identical on both surfaces, which is what this module
 * guarantees.
 */
export function workingsActivityCell(r: WorkingsActivityCellRow): string {
  const data = r.activity_data ?? null
  if (data === null) return '—'
  // No unit, or the words that say the unit is absent: there is no quantity to qualify.
  if (!r.activity_unit || r.activity_unit === NOT_PROVIDED) {
    return r.result_tco2e == null ? NOT_PROVIDED : data.toLocaleString()
  }
  return `${data.toLocaleString()} ${r.activity_unit}`
}
