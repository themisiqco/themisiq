import { NOT_PROVIDED } from '../notProvided'
import { unitLabel } from './unitLabels'
import { isoDateInWords } from './dateWords'
import { fuelName } from './fuelNames'

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

/**
 * A column that does not apply to this row. NOT the same absence as NOT_PROVIDED, and the distinction
 * is the one lib/ghg/factorVintage.test.ts was written about: in a column headed by an edition, an
 * empty cell reads as "no published edition applies to this line", which is TRUE of a supplier-specific
 * steam figure and would be FALSE of a propane row priced from EPA's workbook. 'Not provided' would
 * instead say someone failed to supply it.
 */
export const NOT_APPLICABLE = 'Not applicable'

/**
 * A row whose emissions were not calculated. result_tco2e null is an ABSENCE OF A FIGURE, never a
 * figure of zero — the engine is explicit that 0 is a claim and null is not one — so the cell must say
 * which of the two it is holding. 'Not provided' would be wrong twice over: the data may well have been
 * provided, and what is missing is our own calculation, not the customer's input.
 */
export const NOT_QUANTIFIED = 'Not quantified'

/**
 * Decimals for a tCO₂e figure in the workings table: 0.001 t is 1 kg, which is finer than any emission
 * factor in the tables justifies. The verifier page already used this for its headline totals, so this
 * is the operator's table adopting the verifier's precision rather than a new choice.
 */
export const RESULT_DP = 3
/**
 * T10d: ACTIVITY QUANTITIES ON SCREEN (kWh, m³, litres, the figures on step 2, the review line and the workings
 * activity cell): at most ACTIVITY_DP decimal places, with thousands separators, in the reader's locale. This is
 * what `toLocaleString()` already did on the review line and the workings activity cell; it is named here so
 * every surface follows one rule. Display only: stored and calculated values are never rounded.
 */
export const ACTIVITY_DP = 3
export function formatActivity(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: ACTIVITY_DP })
}

/**
 * Decimals for an intensity figure ON SCREEN: tCO₂e per $M of revenue, which for a small company can
 * sit below 1, so RESULT_DP would round a real figure to 0.000. Named rather than inline because it is a
 * DIFFERENT precision from RESULT_DP on purpose and someone will otherwise "align" the two.
 *
 * ⚠️ NOT THE ASSURANCE PDF'S. That document prints intensity at 4 decimals beside its totals at 3, which
 * is a deliberate and separate decision recorded at lib/assurancePdf.ts. And NOT AN EXPORT'S: a CSV
 * writes the unrounded quotient, because a verifier recomputes it.
 */
export const INTENSITY_DP = 6

/**
 * Decimals for a tCO₂e figure written to a CSV: six, which is one gram.
 *
 * ⚠️ NOT A RAW FLOAT, AND NOT FOR READABILITY. Writing the number itself puts IEEE-754 artefacts into a
 * verifier's file — 1.6215995 computes and prints as 1.6215995000000001, and a cell like that invites the
 * reader to ask what the platform is doing rather than what the figure is. Six decimals is finer than any
 * emission factor in the tables justifies, so nothing meaningful is lost, and every cell is then a fixed
 * decimal string a spreadsheet parses identically.
 *
 * ⚠️ IT IS STILL ROUNDING, so the reconciliation has a tolerance rather than an equality: summing n rows
 * each rounded to six decimals can differ from the rounded total by up to (n + 1) × 0.5e-6. That bound is
 * asserted in lib/ghg/exportPrecision.test.ts and in the Scope 3 harness's S3, which reads the real file.
 */
export const CSV_DP = 6

/**
 * Decimals for an INTENSITY written to a CSV: nine.
 *
 * ⚠️ AN INTENSITY IS A QUOTIENT, so its magnitude ranges far wider than a tonnage. tCO₂e per $M of revenue
 * for a small emitter with material revenue can sit below 1e-6 — 0.001 t against $1,000M is exactly 1e-6 —
 * where CSV_DP would leave a single significant digit or none at all. Nine decimals keeps three
 * significant figures at that magnitude while still writing a fixed decimal string.
 */
export const CSV_INTENSITY_DP = 9

export interface WorkingsActivityCellRow {
  activity_data?: number | null
  activity_unit?: string | null
  result_tco2e?: number | null
}

/**
 * What the Activity data column shows for one workings row.
 *
 * ⚠️ A NULL activity_data IS 'Not applicable', NOT 'Not provided'. It means a coverage-resolution row,
 * which records a decision rather than a measurement: there is no quantity to be missing. This was the
 * fourth of the four glyphs held on 27 Sep 2026 pending one vocabulary, decided 27 Sep 2026 with the
 * Factor vintage, Scope 2 method and Result cells below.
 */
export function workingsActivityCell(r: WorkingsActivityCellRow): string {
  const data = r.activity_data ?? null
  if (data === null) return NOT_APPLICABLE
  // No unit, or the words that say the unit is absent: there is no quantity to qualify.
  if (!r.activity_unit || r.activity_unit === NOT_PROVIDED) {
    return r.result_tco2e == null ? NOT_PROVIDED : formatActivity(data)
  }
  // T10c: the unit as the customer reads it (kWh, Mcf, MMBtu), from the one shared map.
  return `${formatActivity(data)} ${unitLabel(r.activity_unit)}`
}

export interface WorkingsFactorCellRow {
  factor_vintage?: string | null
  scope2_method?: string | null
}

/**
 * The Factor vintage column: the edition the row's factor comes from, or that none applies.
 *
 * ⚠️ NOT EVERY EMPTY VINTAGE IS HONEST, which is why this says "not applicable" and not "unknown". A
 * refrigerant row is priced from a GWP set with no published edition year and a supplier-specific steam
 * figure cites no publisher at all — both genuinely inapplicable. A combustion row with no vintage is a
 * DEFECT, and factorVintage.test.ts is what catches it; this cell must not be the thing that hides it.
 */
export function workingsVintageCell(r: WorkingsFactorCellRow): string {
  return r.factor_vintage || NOT_APPLICABLE
}

/** The Scope 2 method column. Every Scope 1 and Scope 3 row is inapplicable here, not incomplete. */
export function workingsScope2MethodCell(r: WorkingsFactorCellRow): string {
  return r.scope2_method || NOT_APPLICABLE
}

// ─────────────────────────────────────────────────────────────────────────────
// THE EDITION A ROW WAS PRICED WITH, AND WHY (T3c diff 3). One renderer for the verifier page and the assurance
// PDF, so the two cannot describe one selection differently. The engine writes the fields (editionCells); this
// only words them. A row with no factor_edition (a declaration, an unpriced line) has nothing to say here.
// ─────────────────────────────────────────────────────────────────────────────

/** The selection rule, as a person reads it. Keyed by the registry's SelectionRule; an unknown key prints as given. */
export const SELECTION_RULE_WORDS: Readonly<Record<string, string>> = {
  desnz_calendar: 'DESNZ guidance, calendar year',
  desnz_april_march: 'DESNZ guidance, April to March year',
  desnz_july_june: 'DESNZ guidance, July to June year',
  desnz_majority_fallback: 'Edition for the year holding most of the reporting year (no DESNZ guidance for this year end)',
  majority: 'Edition for the year holding most of the reporting year',
  nga_activity_year: 'NGA activity year (1 July to 30 June)',
  data_year_match: 'Data year matches the reporting year',
  data_year_newest: 'Newest edition when the inventory was first prepared',
  frozen: 'Kept as selected when the inventory was first prepared',
  exempt: 'Fixed default, not year-keyed',
}

export interface WorkingsEditionRow {
  factor_edition?: string; selection_rule?: string; selection_basis?: string
  edition_published?: string; edition_corrected?: string; selected_on?: string; provisional?: boolean
}

/**
 * The edition lines under a row's vintage: provisional first (it changes how the figure is read), then the rule,
 * the basis the selector wrote, and the dates. Empty for a row that names no edition.
 */
export function workingsEditionLines(r: WorkingsEditionRow): string[] {
  if (!r.factor_edition) return []
  const out: string[] = []
  if (r.provisional) out.push('Provisional: the edition this year needs has not been published yet')
  if (r.selection_rule) out.push(`Rule: ${SELECTION_RULE_WORDS[r.selection_rule] ?? r.selection_rule}`)
  if (r.selection_basis) out.push(r.selection_basis)
  if (r.edition_published) out.push(`Published ${r.edition_published}`)
  if (r.edition_corrected) out.push(`Values as corrected on ${r.edition_corrected}`)
  if (r.selected_on) out.push(`Selected on ${isoDateInWords(r.selected_on)}`)
  return out
}

/**
 * The Result column.
 *
 * ⚠️ 0 AND null MUST NOT RENDER ALIKE. 0 is an attested claim of no emissions; null is no calculation at
 * all, on a row the totals omit. Both surfaces printed the same glyph for null as they printed for an
 * inapplicable vintage, so a verifier could not tell an unquantified row from an inapplicable column.
 *
 * ⚠️ THREE DECIMALS, ON BOTH SURFACES, AND NOT A PARAMETER. The operator's workings table printed four
 * and the verifier page three — there and in its headline Scope 1 and Scope 2 figures — so one row read
 * 1.2345 to the operator and 1.235 to the verifier. Consistent rounding, but not the same string, and a
 * verifier cross-checking a figure against the operator's screen had to reason about which was which.
 * Three is now the ONLY precision: a `dp` argument would let the next caller reintroduce the divergence
 * silently, which is exactly how it arose. Decided 27 Sep 2026.
 *
 * ⚠️ DISPLAY ONLY. The stored and computed value keeps full precision; nothing derives a total from this
 * string. Exports must write the unrounded number — see the export survey in the same commit.
 */
export function workingsResultCell(r: { result_tco2e?: number | null }): string {
  return r.result_tco2e == null ? NOT_QUANTIFIED : r.result_tco2e.toFixed(RESULT_DP)
}

/**
 * The `gwp_basis` a coverage-resolution row carries. Written as a literal by buildWorkings, named here
 * because two display decisions turn on it: the Factor source cell below, and the verifier page's
 * rowNoteOf, which moves that row's explanation to the activity cell.
 */
export const COVERAGE_ROW_BASIS = 'coverage_resolution'

/** T18: the `gwp_basis` of a document-event row (withdrawn, restored, deleted, deleted unused). No factor applies;
 * the event's sentence is the row's note. */
export const DOCUMENT_EVENT_ROW_BASIS = 'document_event'
/** T18 section D: the `gwp_basis` of a deleted-location row. No factor applies; the record's sentence is the note. */
export const LOCATION_EVENT_ROW_BASIS = 'location_event'

/**
 * The Factor source column: the row's citation.
 *
 * ⚠️ A COVERAGE-RESOLUTION ROW CITES NO FACTOR, and its ef_source holds the operator's explanation of an
 * adjustment instead. Rendering that under a heading reading "Factor source" would tell a verifier an
 * estimation note is a published factor, so the verifier page moves the text to the activity cell and
 * this column says the heading does not apply to the row.
 *
 * ⚠️ AN EMPTY ef_source IS 'Not provided', NOT 'Not applicable'. Every priced row has a citation and the
 * declaration rows are given NOT_PROVIDED by the engine, so reaching this fallback means a stored row
 * whose citation was never written — a missing value, which is a different thing from one that does not
 * apply, and the words must not flatten the two.
 */
export function workingsFactorSourceCell(r: { gwp_basis?: string; ef_source?: string | null; factor_variant?: string | null }): string {
  if (r.gwp_basis === COVERAGE_ROW_BASIS) return NOT_APPLICABLE
  // FI10: the variant of the table that priced the row (an MfE use class), so a verifier can see which table it was.
  if (r.ef_source && r.factor_variant) return `${r.ef_source}, ${r.factor_variant}`
  return r.ef_source || NOT_PROVIDED
}

/**
 * The share cell for one bill on a document-backed workings row (T5 ruling). It reads as T2's proration
 * note does, so the two never describe a bill differently:
 *   - prorated:                "12 of 31 days, ×0.387"
 *   - counted, wholly in year: "31 of 31 days"
 *   - a delivery inside the year (T10b): "Delivered 14 March 2025, counted in full"
 *   - undated or invalid period (no days to count): NOT_APPLICABLE
 *   - any other bill not counted: "Not counted"; the reason, not this cell, says why.
 * Structural type rather than the engine's BillContribution, because the engine imports this file.
 */
export type ShareCellContribution = {
  reason: string
  inWindowDays: number | null
  totalDays: number | null
  share: number | null
  deliveryDate?: string
}
export const NOT_COUNTED = 'Not counted'
export function contributionShareCell(c: ShareCellContribution): string {
  if (c.reason === 'undated' || c.reason === 'invalid_period') return NOT_APPLICABLE
  if (c.reason === 'delivered') return `Delivered ${isoDateInWords(c.deliveryDate)}, counted in full`
  if (c.reason !== 'counted' && c.reason !== 'prorated') return NOT_COUNTED
  const days = `${c.inWindowDays} of ${c.totalDays} days`
  return c.reason === 'prorated' ? `${days}, ×${(c.share ?? 0).toFixed(3)}` : days
}

// ── T18 diff 4: WHO DID WHAT TO A ROW, AND WHEN, IN WORDS ──────────────────────────────────────────────────────────
// One reader for every who-and-when record a workings row carries, so the page's workings table, the verifier page
// (T11) and the PDF (T17) word the same record the same way. Each line is a plain sentence with no em dash. Shapes are
// declared loosely here (this file imports nothing from the engine), and a field a row does not carry adds nothing.
type WhoRec = { email: string }
type WhoWhenRow = {
  entered_by?: WhoRec; entered_at?: string
  typed_entries?: { field: string; value: number; unit: string | null; at: string; by: WhoRec; overrideReason?: string; note?: string }[]
  manual_override?: { reason: string; at: string; by: WhoRec }
  manual_overrides_removed?: { reason: string; removedAt: string; removedBy: WhoRec }[]
  resolved_by_text?: string; resolved_at?: string; resolved_by?: WhoRec | null
  reading_cleared?: { file: string; at: string; by: WhoRec }
  contributions?: {
    docId: string
    confirmations?: { at: string; by: WhoRec }[]
    corrections?: { fields: string[]; at: string; by: WhoRec }[]
    statusLog?: { action: string; at: string; by: WhoRec }[]
    periodConfirmedAt?: string; periodConfirmedBy?: WhoRec
    fleetTypeLog?: { to: string; at: string; by: WhoRec }[]
    withdrawal?: { at: string; by: WhoRec; reason: string }
  }[]
}
const on = (at: string) => isoDateInWords(at.slice(0, 10))
// Lower case: each follows "{file}: ".
const STATUS_WORDS: Record<string, string> = { rejected: 'rejected', undone: 'rejection undone', flagged: 'flagged for review', withdrawn: 'withdrawn', restored: 'restored' }
const FIELD_WORDS: Record<string, string> = { period: 'billing dates', unit: 'unit', value: 'figure' }

/**
 * Every who-and-when on a workings row, oldest first within each kind, as plain sentences. Empty when it has none.
 * T11: one pattern for every line: the action, by whom, on what date, then "Reason: ..." where there is one.
 * `billLines`: the caller already shows each bill's confirmation on that bill's own line (workingsDocumentLines, the
 * verifier page), so the confirmations are not repeated here.
 */
export function workingsWhoWhenLines(r: WhoWhenRow, fileOf: (docId: string) => string = id => id, opts: { billLines?: boolean } = {}): string[] {
  const out: string[] = []
  for (const e of r.typed_entries ?? []) {
    const figure = `${e.value.toLocaleString('en-US', { maximumFractionDigits: 6, useGrouping: !e.field.endsWith('_model_year') })}${e.unit ? ` ${unitLabel(e.unit)}` : ''}`
    out.push(`Entered as ${figure} by ${e.by.email} on ${on(e.at)}${e.note ? `, ${e.note}` : ''}${e.overrideReason ? `, by hand instead of from the bills. Reason: ${e.overrideReason}` : ''}.`)
  }
  if (r.manual_override) out.push(`Entered by hand by ${r.manual_override.by.email} on ${on(r.manual_override.at)}, instead of from the bills. Reason: ${r.manual_override.reason}.`)
  for (const o of r.manual_overrides_removed ?? []) out.push(`Hand entry removed by ${o.removedBy.email} on ${on(o.removedAt)}, so the bills count again. Reason it had been entered by hand: ${o.reason}.`)
  for (const c of r.contributions ?? []) {
    const file = fileOf(c.docId)
    if (!opts.billLines) for (const k of c.confirmations ?? []) out.push(`${file}: confirmed by ${k.by.email} on ${on(k.at)}.`)
    for (const k of c.corrections ?? []) out.push(`${file}: ${k.fields.map(f => FIELD_WORDS[f] ?? f).join(' and ')} changed by ${k.by.email} on ${on(k.at)}.`)
    if (c.periodConfirmedAt && c.periodConfirmedBy) out.push(`${file}: billing dates confirmed by ${c.periodConfirmedBy.email} on ${on(c.periodConfirmedAt)}.`)
    for (const k of c.fleetTypeLog ?? []) out.push(`${file}: vehicle type set to ${k.to.replace('_', '-')} by ${k.by.email} on ${on(k.at)}.`)
    // A withdrawal is said once, with its reason, from the document's record below; not again from each reading's log.
    for (const k of c.statusLog ?? []) if (!(k.action === 'withdrawn' && c.withdrawal)) out.push(`${file}: ${STATUS_WORDS[k.action] ?? k.action} by ${k.by.email} on ${on(k.at)}.`)
    if (c.withdrawal) out.push(`${file}: withdrawn by ${c.withdrawal.by.email} on ${on(c.withdrawal.at)}. Reason: ${c.withdrawal.reason}.`)
  }
  if (r.reading_cleared) out.push(`${r.reading_cleared.file}: unit changed by ${r.reading_cleared.by.email} on ${on(r.reading_cleared.at)}, so the figure typed for it was cleared.`)
  if (r.resolved_at) {
    out.push(r.resolved_by?.email ? `Recorded by ${r.resolved_by.email} on ${on(r.resolved_at)}.`
      : r.resolved_by_text?.startsWith('Who: ') && r.resolved_by_text !== 'Who: not recorded' ? `Recorded by ${r.resolved_by_text.slice(5)} on ${on(r.resolved_at)}.`
      : `Recorded on ${on(r.resolved_at)}; who made this choice was not recorded at the time.`)
  }
  return out
}

/** T18 diff 4: the saved workings rows that record a document event or a deleted location, in the order saved. */
export function eventRowsOf<R extends { gwp_basis?: string }>(rows: readonly R[] | null | undefined): R[] {
  return (rows ?? []).filter(r => r.gwp_basis === DOCUMENT_EVENT_ROW_BASIS || r.gwp_basis === LOCATION_EVENT_ROW_BASIS)
}

// ── T11: PER FIGURE, WHICH BILLS COUNTED, WHICH DID NOT, AND WHY ────────────────────────────────────────────────────
// Read by the verifier page from the stored workings row's `contributions` (T5), and by the PDF in T17, so the two say
// the same thing about the same bill. Plain words a verifier reads: never a reason key, a fuel key or a factor key. No
// em dash. Shapes are declared loosely, as above: this file imports nothing from the engine.
type ContributionRow = {
  docId: string; proposalIndex?: number; fuelType?: string; counted: boolean; reason: string; reasonRef?: string
  periodProblem?: string; periodOrigin?: string | null; totalDays?: number | null; inWindowDays?: number | null; share?: number | null
  value?: number; unit?: string | null; deliveryDate?: string
  asRead?: { unit?: string | null; value?: number | null; rawValue?: number | null } | null
  corrections?: { fields: string[] }[]
  confirmations?: { at: string; by: { email: string } }[]
}
export type DocumentLine = { docId: string; counted: boolean; text: string }

// Each reason is a full sentence after "not counted." (T11 review: the file name, then sentences, no second colon).
const NOT_COUNTED_BECAUSE: Record<string, (c: ContributionRow, fileOf: (id: string) => string, yearText: string) => string> = {
  outside_year: (c, _f, y) => `${c.deliveryDate ? 'Delivered' : 'Billed'} outside ${y}`,
  same_bill_as: (c, f) => `The same bill as ${c.reasonRef ? f(c.reasonRef) : 'another bill'}, which is counted`,
  exact_duplicate_of: (c, f) => `The same document as ${c.reasonRef ? f(c.reasonRef) : 'another document'}, counted once`,
  manual_override: () => 'The figure was entered by hand instead',
  withdrawn: () => 'The document was withdrawn',
  mixed_units: () => 'The bills for this figure are in different units',
  invalid_period: c => c.periodProblem === 'reversed' ? 'Its billing period ends before it starts' : 'Its billing period could not be read as dates',
  undated: () => 'It has no billing period',
  not_confirmed: () => 'It was not confirmed',
}

/**
 * One line per bill behind a figure: the bills that counted first, then those that did not, each with its reason and
 * how its dates were set. `fileOf` names a document from its id; `yearText` is the reporting year in words
 * (reportingYearLabel(...).inText, "reporting year 2025" or "the year ending 31 March 2026").
 */
export function workingsDocumentLines(r: { contributions?: ContributionRow[] }, fileOf: (docId: string) => string, yearText: string): DocumentLine[] {
  const lines = (r.contributions ?? []).map((c): DocumentLine => {
    const file = fileOf(c.docId)
    const parts: string[] = []
    if (c.counted) {
      if (c.reason === 'delivered' && c.deliveryDate) parts.push('counted', `Delivered on ${on(c.deliveryDate)}`)
      else if (c.reason === 'prorated' && c.inWindowDays != null && c.totalDays) {
        parts.push('counted in part', `${c.inWindowDays} of its ${c.totalDays} days are in ${yearText}, so ${((c.share ?? 0) * 100).toFixed(1)}% of the bill is counted`)
      } else parts.push('counted')
    } else {
      const why = NOT_COUNTED_BECAUSE[c.reason]
      parts.push('not counted', why ? why(c, fileOf, yearText) : 'No reason was recorded')
    }
    if (c.periodOrigin === 'billing_month') parts.push('dates estimated from the billing month')
    if (c.periodOrigin === 'customer_confirmed') parts.push('dates confirmed by the customer')
    // The figure as read, beside an edited figure (T18): the reading as printed on the bill.
    if ((c.corrections ?? []).some(k => k.fields.includes('value')) && c.asRead?.rawValue != null) {
      parts.push(`read from the bill as ${formatActivity(c.asRead.rawValue)} ${unitLabel(c.asRead.unit)}; the figure used is ${c.value != null ? formatActivity(c.value) : 'not set'} ${unitLabel(c.unit)}`)
    }
    // The bill's confirmation, always on its own line (T11 review): who and when, or, for a reading confirmed before
    // who and when were recorded (T18 diff 1), that they were not. Never blank, never guessed.
    const confirmed = c.reason !== 'not_confirmed' && c.reason !== 'withdrawn'
    const confs = c.confirmations ?? []
    if (confs.length > 0) parts.push(`Confirmed by ${confs.map((k, i) => `${i > 0 ? 'again by ' : ''}${k.by.email} on ${on(k.at)}`).join(', and ')}`)
    else if (confirmed) parts.push('Confirmed; who and when were not recorded at the time')
    // Each part after the first is its own sentence, so it starts with a capital.
    return { docId: c.docId, counted: c.counted, text: `${file}: ${parts.map((x, i) => (i === 0 ? x : x.charAt(0).toUpperCase() + x.slice(1))).join('. ')}.` }
  })
  return [...lines.filter(l => l.counted), ...lines.filter(l => !l.counted)]
}

/** A stored row's Source cell: a coverage row saved before T11 named its fuel by key ("natural_gas"); said in words. */
export function workingsSourceCell(r: { source: string; gwp_basis?: string }): string {
  if (r.gwp_basis !== COVERAGE_ROW_BASIS) return r.source
  return r.source.replace(/^Coverage resolution: ([a-z_]+)$/, (_m, k: string) => `Coverage resolution: ${fuelName(k)}`)
}

// The words for every gwp_basis the engine writes that is not a GWP set. A GWP set (AR4, AR5, AR6) and "as published:
// see factor source" read as stored.
const GWP_BASIS_WORDS: Record<string, string> = {
  coverage_resolution: 'Not applicable: a coverage decision',
  document_event: 'Not applicable: a document record',
  location_event: 'Not applicable: a location record',
  unpriced: 'Not applicable: not priced',
  declaration: 'Not applicable: no figure',
  excluded: 'Not applicable: location excluded',
  all_bills_excluded: 'Not applicable: no bill counted',
  'scope3-cat3': 'As published: see factor source',
}
/** The GWP basis column, in words. Never an engine token. */
export const workingsGwpBasisCell = (r: { gwp_basis?: string | null }): string =>
  !r.gwp_basis ? NOT_PROVIDED : GWP_BASIS_WORDS[r.gwp_basis] ?? r.gwp_basis

// The unit a factor is published in, named from the last part of its key. Only the unit's label is ever printed.
const KEY_UNIT_WORDS: Record<string, string> = {
  litre: 'litres', litres: 'litres', gallon: 'US gallons', gallons: 'US gallons', kg: 'kg', tonne: 'tonnes', tonnes: 'tonnes',
  m3: 'm³', mcf: 'Mcf', ccf: 'Ccf', kwh: 'kWh', gj: 'GJ', mj: 'MJ', mmbtu: 'MMBtu', therm: 'therms', therms: 'therms', scf: 'scf',
}
/**
 * FI2: the conversion factor a row applied, in words: "Conversion factor: 1 US gallon = 3.785411784 litres". From
 * conversion_factor (units the factor is published in, per unit entered). Null for a row with none. Never the key.
 */
export function workingsConversionFactorLine(r: { conversion_factor?: number | null; factor_key?: string | null; activity_unit?: string | null }): string | null {
  if (r.conversion_factor == null || !Number.isFinite(r.conversion_factor)) return null
  const n = String(Number(r.conversion_factor.toPrecision(10)))
  const to = KEY_UNIT_WORDS[(r.factor_key ?? '').split(/[_:]/).pop()?.toLowerCase() ?? '']
  const from = unitLabel(r.activity_unit)
  return to ? `Conversion factor: 1 ${from.replace(/s$/, '')} = ${n} ${to}` : `Conversion factor: each ${from.replace(/s$/, '')} is ${n} of the unit the factor is published in`
}
