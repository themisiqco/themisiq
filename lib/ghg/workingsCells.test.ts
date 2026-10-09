import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildWorkings, emptyLocation, type Location } from './engine'
import {
  workingsActivityCell, workingsVintageCell, workingsScope2MethodCell, workingsResultCell,
  workingsFactorSourceCell,
  ALL_LOCATIONS, NOT_APPLICABLE, NOT_QUANTIFIED, COVERAGE_ROW_BASIS, RESULT_DP, contributionShareCell,
} from './workingsCells'
import { NOT_PROVIDED } from '../notProvided'
import { stripTsComments } from '../testing/stripComments'

// ─────────────────────────────────────────────────────────────────────────────
// THE TWO SURFACES MUST SHOW THE SAME VALUE IN THE SAME COLUMN.
//
// declarationStates.test.ts asserts each surface NAMES every state the engine emits. It does not
// assert they agree on what the row's cells say, and they did not: the operator's table hard-coded an
// em dash in six cells of every declaration row while the verifier page rendered the engine's fields
// in the same columns. Both were "correct" in isolation; the moment the engine's empty-value words
// changed, only one surface moved and nothing failed.
//
// So this pins the cells to the ENGINE'S OWN FIELDS on both pages, and the remaining glyphs to one
// allow-list. Positional, because the columns are positional:
//
//   1 Source · 2 Activity data · 3 Emission factor · 4 Factor source · 5 Factor vintage
//   · 6 Scope 2 method · 7 GWP basis · 8 Result (tCO₂e)
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const OPERATOR = 'app/dashboard/ghg/page.tsx'
const VERIFIER = 'app/verify/[token]/page.tsx'
const src = (rel: string) => stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))

/**
 * ⚠️ EMPTY, AND IT MUST STAY EMPTY. It held three entries until 27 Sep 2026: the Factor vintage and
 * Scope 2 method cells (`|| '—'`) and the Result cell (`== null ? '—'`). Each was a glyph standing for a
 * DIFFERENT fact — inapplicable, and not quantified — which is why they could not be swept as one word
 * and were held here until the vocabulary was decided. No workings cell renders a glyph now; a new entry
 * in this list is a claim that some cell should, and needs the reason written beside it.
 */
const ALLOWED_GLYPH_CELLS: string[] = []

/**
 * The table's TOTAL footer, which is not a row cell: one is prose and one is the same null-result
 * glyph. They belong to the dashboard's own em-dash sweep group, not to the cell vocabulary above, and
 * they are listed here so that this test does not have to pretend they are absent.
 *
 * ⚠️ THE DASHBOARD SWEEP RAN ON 28 Sep 2026 AND THESE TWO SURVIVED IT, for the reason this file
 * exists: neither is sentence punctuation. "TOTAL — {loc.name}" itself became a colon, which is why
 * the first prefix has moved; what is left inside it is '— excluded from all totals', a glyph carrying
 * a label. Both want the Not provided / Not applicable vocabulary above, and the operator cell has to
 * go on agreeing with the verifier cell beside it, so they are a vocabulary change and not a
 * punctuation one. lib/emDashCopy.test.ts budgets them under app/dashboard/ghg/page.tsx: 2.
 */
const PENDING_DASHBOARD_SWEEP = [
  "TOTAL: {loc.name} {c ? '(Scope 1 + Scope 2 location-based)' : '— excluded from all totals'}",
  "{c ? (c.s1_total + c.s2_location).toFixed(4) : '—'}",
]

const loc = (over: Partial<Location> = {}): Location =>
  ({ ...emptyLocation('l1', 'Site A'), country: 'US', grid_region: 'CAMX', ...over })

const rowsFor = (over: Partial<Location> = {}) => buildWorkings([loc(over)], 'AR6', 2025)

describe('workings cell rendering', () => {
  it('prints the unit only where there is a quantity to qualify', () => {
    // A declaration row: activity_data 0 is a placeholder, not a measurement.
    expect(workingsActivityCell({ activity_data: 0, activity_unit: NOT_PROVIDED, result_tco2e: null }))
      .toBe(NOT_PROVIDED)
    // attested_absent: result 0 IS the claim, so the figure prints.
    expect(workingsActivityCell({ activity_data: 0, activity_unit: NOT_PROVIDED, result_tco2e: 0 }))
      .toBe('0')
    // A priced row is untouched.
    expect(workingsActivityCell({ activity_data: 12345.6, activity_unit: 'kWh', result_tco2e: 4.2 }))
      .toBe('12,345.6 kWh')
    // A row that reports a quantity nothing could price keeps both.
    expect(workingsActivityCell({ activity_data: 1000, activity_unit: 'gj', result_tco2e: null }))
      .toBe('1,000 GJ')
    // A coverage-resolution row has no quantity to report, which is not the same absence as a missing
    // one: it records a decision, so the column does not apply to it.
    expect(workingsActivityCell({ activity_data: null, activity_unit: 'gap', result_tco2e: null }))
      .toBe(NOT_APPLICABLE)
  })

  it('the engine fills every cell a declaration row renders', () => {
    const rows = rowsFor({ natural_gas_amount: 0 })
    const declared = rows.filter(r => r.declaration === 'undeclared')
    expect(declared.length).toBeGreaterThan(0)
    for (const r of declared) {
      expect(r.activity_unit).toBe(NOT_PROVIDED)
      expect(r.emission_factor).toBe(NOT_PROVIDED)
      expect(r.emission_factor_display).toBe(NOT_PROVIDED)
      expect(r.ef_source).toBe(NOT_PROVIDED)
      expect(workingsActivityCell(r)).toBe(NOT_PROVIDED)
    }
  })

  it('a coverage-resolution row names every location rather than none', () => {
    // The resolution shape is engine-internal (CoverageResolution is not exported), so it is built
    // positionally here and cast; the fields are locId / fuelType / kind / note / acknowledgedAt.
    const rows = buildWorkings([loc({ electricity_kwh: 1000 })], 'AR6', 2025, [
      { locId: 'l1', fuelType: 'electricity', kind: 'extrapolate', monthsCovered: 11, pctEstimated: 8.3,
        note: 'Estimated from 11 months of bills', acknowledgedAt: '2026-01-01T00:00:00Z' },
    ] as Parameters<typeof buildWorkings>[3])
    const cov = rows.filter(r => r.gwp_basis === 'coverage_resolution')
    expect(cov.length).toBe(1)
    expect(cov[0].location).toBe(ALL_LOCATIONS)
    expect(cov[0].location).not.toContain('—')
  })

  it('an inapplicable column says so, and is not confused with an absent value', () => {
    expect(workingsVintageCell({ factor_vintage: 'US EPA 2025' })).toBe('US EPA 2025')
    expect(workingsVintageCell({})).toBe(NOT_APPLICABLE)
    expect(workingsVintageCell({ factor_vintage: null })).toBe(NOT_APPLICABLE)
    expect(workingsScope2MethodCell({ scope2_method: 'market-based' })).toBe('market-based')
    expect(workingsScope2MethodCell({}), 'every Scope 1 and Scope 3 row').toBe(NOT_APPLICABLE)
    // ⚠️ THE THREE WORDS ARE THREE DIFFERENT FACTS. A cell that reads the same for all of them is the
    // defect this vocabulary replaced.
    expect(new Set([NOT_APPLICABLE, NOT_QUANTIFIED, 'Not provided']).size).toBe(3)
  })

  it('an unquantified result never reads like a figure, and zero still does', () => {
    expect(workingsResultCell({ result_tco2e: null }), 'no calculation, on a row the totals omit')
      .toBe(NOT_QUANTIFIED)
    expect(workingsResultCell({}), 'an absent field is the same absence').toBe(NOT_QUANTIFIED)
    expect(workingsResultCell({ result_tco2e: 0 }), 'an attested zero IS a claim and prints as one')
      .toBe('0.000')
    expect(workingsResultCell({ result_tco2e: 1.23456 })).toBe('1.235')
    expect(RESULT_DP, 'three decimals, the verifier page\'s precision, on both surfaces').toBe(3)
    // ⚠️ NO PER-CALL PRECISION. The two surfaces printed 4 and 3 until 27 Sep 2026; an argument here is
    // how that happened, so the helper takes one parameter and neither page may pass a second.
    expect(workingsResultCell.length, 'workingsResultCell must take the row and nothing else').toBe(1)
    for (const rel of [OPERATOR, VERIFIER]) {
      expect(src(rel), `${rel} passes its own precision`).not.toMatch(/workingsResultCell\([rw],/)
    }
  })

  it('the Factor source column tells a missing citation from an inapplicable one', () => {
    expect(workingsFactorSourceCell({ gwp_basis: 'AR6', ef_source: 'US EPA (2025) Hub, Table 1' }))
      .toBe('US EPA (2025) Hub, Table 1')
    // A coverage row's ef_source holds the adjustment explanation, which the verifier page renders
    // beside the figure instead. This column does not apply to it.
    expect(workingsFactorSourceCell({ gwp_basis: COVERAGE_ROW_BASIS, ef_source: 'Estimated by scaling ×12/2' }))
      .toBe(NOT_APPLICABLE)
    expect(workingsFactorSourceCell({ gwp_basis: 'declaration', ef_source: '' }), 'a citation nobody wrote')
      .toBe(NOT_PROVIDED)
  })

  it('both surfaces render the activity cell through the one function', () => {
    for (const rel of [OPERATOR, VERIFIER]) {
      expect(src(rel), `${rel} must import the cell helpers`)
        .toMatch(/from '[^']*lib\/ghg\/workingsCells'/)
      for (const fn of ['workingsActivityCell', 'workingsVintageCell', 'workingsScope2MethodCell',
                        'workingsResultCell', 'workingsFactorSourceCell']) {
        expect(src(rel), `${rel} does not render its cells through ${fn}`)
          .toMatch(new RegExp(`${fn}\\([rw]`))
      }
    }
    // And neither still builds the cell by hand.
    for (const rel of [OPERATOR, VERIFIER]) {
      expect(src(rel), `${rel} still concatenates a unit onto a figure`)
        .not.toMatch(/activity_data\.toLocaleString\(\)\} \$\{[rw]\.activity_unit/)
    }
  })

  it('the declaration-state note renders with the figure, not under Factor source', () => {
    // ⚠️ POSITIONAL, BECAUSE THE COLUMNS ARE. The note occupied cell 4 in all six row shapes until
    // 27 Sep 2026, and cell 4's heading reads 'Factor source' — so a sentence saying a stream was never
    // quantified sat where a verifier looks for a citation. The verifier page has always put row notes
    // beside the activity figure (rowNoteOf), which is what these six now do.
    const operator = src(OPERATOR)
    const shapes = [...operator.matchAll(/if \(r\.declaration === '(\w+)'\) \{/g)].map(m => m[1])
    // All eight branches: five with their own row shape, and the three country states that share
    // excludedRow. The same list declarationStates.test.ts holds, from the other direction.
    expect(shapes.sort(), 'the declaration branches on the operator page').toEqual([
      'attested_absent', 'country_not_listed', 'country_not_set', 'country_not_supported',
      'declared_unquantified', 'no_published_factor', 'undeclared', 'unpriced',
    ])

    const rowShapes = [...operator.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1])
      .filter(b => b.includes('workingsActivityCell(r)'))
    // Six declaration shapes (excludedRow plus the five branches) and the priced row.
    expect(rowShapes.length, 'every workings row shape').toBe(7)
    for (const block of rowShapes) {
      const tds = [...block.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1])
      expect(tds.length).toBe(8)
      expect(tds[1], 'cell 2, Activity data, must carry the note').toContain('r.note')
      expect(tds[3], 'cell 4, Factor source, must carry the citation').toContain('workingsFactorSourceCell(r)')
      expect(tds[3], 'cell 4 must not carry the note').not.toContain('r.note')
      expect(tds[6], 'cell 7, GWP basis, carries quantification_method where a row has one')
        .not.toContain('r.note')
    }
    // The verifier page's activity cell does the same thing, through its own helper.
    const verifier = src(VERIFIER)
    const activityCell = [...verifier.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1]).find(c => c.includes('workingsActivityCell(w)'))
    expect(activityCell, 'the verifier activity cell').toBeDefined()
    expect(activityCell, 'rowNoteOf renders beside the figure').toContain('rowNoteOf(w)')
  })

  it('no workings cell hard-codes an em dash outside the allow-list', () => {
    // Every <td> in the operator table's declaration branches and in excludedRow.
    const operator = src(OPERATOR)
    const cells = [...operator.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1].trim())
    const dashed = cells.filter(c => c.includes('—'))
    // ⚠️ MATCHED BY PREFIX, NOT EQUALITY: the priced row's Result cell appends a scope label after the
    // expression. The allow-list is about which EXPRESSION produces the glyph, not the whole cell.
    const allowed = [...ALLOWED_GLYPH_CELLS, ...PENDING_DASHBOARD_SWEEP]
    const unexpected = dashed.filter(c => !allowed.some(a => c.startsWith(a)))
    expect(unexpected, 'a workings cell renders a glyph that is not in ALLOWED_GLYPH_CELLS').toEqual([])
    // And each allowed shape is still in use, so a deleted cell does not quietly widen the list.
    for (const a of ALLOWED_GLYPH_CELLS) {
      expect(dashed.some(c => c.startsWith(a)), `${a} is no longer rendered: remove it from the list`).toBe(true)
    }
    // The verifier page too, but by SHAPE rather than by cell: its Source cell carries the badge
    // sentences, which are prose and contain em dashes legitimately. What must not come back are the
    // three empty-value forms the helpers replaced.
    const verifier = src(VERIFIER)
    for (const shape of ["|| '—'", "? '—'", '>—<']) {
      expect(verifier.includes(shape), `${VERIFIER} renders ${shape} in a cell again`).toBe(false)
    }

  })
})

describe('the share cell for a delivery (T10b)', () => {
  it('reads as delivered and counted in full', () => {
    expect(contributionShareCell({ reason: 'delivered', inWindowDays: null, totalDays: null, share: 1, deliveryDate: '2025-03-14' }))
      .toBe('Delivered 14 March 2025, counted in full')
  })
})

// ── T18 diff 4: every who-and-when on a row, in words ─────────────────────────────────────────────────────────────
import { workingsWhoWhenLines } from './workingsCells'
describe('workingsWhoWhenLines', () => {
  const jo = { email: 'jo@acme.example' }, sam = { email: 'sam@acme.example' }
  const AT = '2026-10-02T09:00:00.000Z', LATER = '2026-10-03T09:00:00.000Z'
  it('a typed row: each entry, with any note and override reason, and an override removed', () => {
    expect(workingsWhoWhenLines({
      typed_entries: [{ field: 'natural_gas_amount', value: 420, unit: 'mcf', at: AT, by: jo, note: 'entered before sign-in' },
        { field: 'natural_gas_amount', value: 96, unit: 'mcf', at: LATER, by: sam, overrideReason: 'Bills estimated' }],
      manual_override: { reason: 'Bills estimated', at: LATER, by: sam },
      manual_overrides_removed: [{ reason: 'Wrong meter', removedAt: AT, removedBy: jo }],
    })).toEqual([
      'Entered as 420 Mcf by jo@acme.example on 2 October 2026 (entered before sign-in).',
      'Entered as 96 Mcf by sam@acme.example on 3 October 2026, by hand instead of from the bills: Bills estimated.',
      'Entered by hand instead of from the bills by sam@acme.example on 3 October 2026: Bills estimated.',
      'Hand-entered figure removed by jo@acme.example on 2 October 2026 (it had been entered because: Wrong meter).',
    ])
  })
  it('a row from bills: each bill\'s confirmations, corrections, date confirmation, vehicle type, status changes and withdrawal', () => {
    const lines = workingsWhoWhenLines({ contributions: [{ docId: 'd1',
      confirmations: [{ at: LATER, by: jo }], corrections: [{ fields: ['value', 'unit'], at: AT, by: sam }],
      periodConfirmedAt: AT, periodConfirmedBy: jo, fleetTypeLog: [{ to: 'non_road', at: AT, by: jo }],
      statusLog: [{ action: 'flagged', at: AT, by: sam }], withdrawal: { at: LATER, by: sam, reason: 'Duplicate' } }] }, id => `${id}.pdf`)
    expect(lines).toEqual([
      'd1.pdf: confirmed by jo@acme.example on 3 October 2026.',
      'd1.pdf: figure and unit changed by sam@acme.example on 2 October 2026.',
      'd1.pdf: billing dates confirmed by jo@acme.example on 2 October 2026.',
      'd1.pdf: vehicle type set to non-road by jo@acme.example on 2 October 2026.',
      'd1.pdf: Flagged for review by sam@acme.example on 2 October 2026.',
      'd1.pdf: withdrawn by sam@acme.example on 3 October 2026: Duplicate.',
    ])
    for (const l of lines) expect(l).not.toContain('—')
  })
  it('a coverage resolution says who, or that nobody was recorded; a row with no record says nothing', () => {
    expect(workingsWhoWhenLines({ resolved_by_text: 'Who: not recorded', resolved_at: AT })).toEqual(['Who: not recorded, on 2 October 2026.'])
    expect(workingsWhoWhenLines({})).toEqual([])
  })
})
