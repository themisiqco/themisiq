import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildWorkings, emptyLocation, type Location } from './engine'
import { workingsActivityCell, ALL_LOCATIONS } from './workingsCells'
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
 * ⚠️ THE ONLY EM DASHES A WORKINGS CELL MAY STILL RENDER, and they are a to-do, not a settled choice.
 * Each means "inapplicable" or "not quantified" rather than "absent", which is a vocabulary decision
 * nobody has taken. They are listed rather than banned so that the choice stays visible, and they
 * must appear IDENTICALLY on both surfaces — which is what the last test checks.
 */
const ALLOWED_GLYPH_CELLS = [
  "{r.factor_vintage || '—'}",
  "{r.scope2_method || '—'}",
  "{r.result_tco2e == null ? '—' : r.result_tco2e.toFixed(4)}",
]

/**
 * The table's TOTAL footer, which is not a row cell: one is prose and one is the same null-result
 * glyph. They belong to the dashboard's own em-dash sweep group, not to the cell vocabulary above, and
 * they are listed here so that this test does not have to pretend they are absent.
 */
const PENDING_DASHBOARD_SWEEP = [
  "TOTAL — {loc.name} {c ? '(Scope 1 + Scope 2 location-based)' : '— excluded from all totals'}",
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
      .toBe('1,000 gj')
    // ⚠️ NULL STILL RETURNS THE GLYPH. A coverage-resolution row has no quantity to report, which is
    // not the same absence as a missing one. Change this only with the vocabulary decision above.
    expect(workingsActivityCell({ activity_data: null, activity_unit: 'gap', result_tco2e: null }))
      .toBe('—')
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

  it('both surfaces render the activity cell through the one function', () => {
    for (const rel of [OPERATOR, VERIFIER]) {
      expect(src(rel), rel).toMatch(/import \{ workingsActivityCell \} from '[^']*lib\/ghg\/workingsCells'/)
      expect(src(rel), rel).toMatch(/workingsActivityCell\([rw]\)/)
    }
    // And neither still builds the cell by hand.
    for (const rel of [OPERATOR, VERIFIER]) {
      expect(src(rel), `${rel} still concatenates a unit onto a figure`)
        .not.toMatch(/activity_data\.toLocaleString\(\)\} \$\{[rw]\.activity_unit/)
    }
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
    // The same three expressions, and only those, on the verifier page.
    const verifier = src(VERIFIER)
    for (const shape of ["factor_vintage || '—'", "scope2_method || '—'"]) {
      expect(verifier, `${VERIFIER} must render ${shape} exactly as the operator page does`).toContain(shape)
    }
  })
})
