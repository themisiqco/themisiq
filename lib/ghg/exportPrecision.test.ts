import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { calcLocation, calcInventory, emptyLocation, type Location } from './engine'
import { NOT_QUANTIFIED, RESULT_DP, INTENSITY_DP, CSV_DP, CSV_INTENSITY_DP } from './workingsCells'
import { stripTsComments } from '../testing/stripComments'

// ─────────────────────────────────────────────────────────────────────────────
// AN EXPORT CARRIES THE NUMBER; A SCREEN CARRIES A READING OF IT.
//
// Five exports rounded a tCO₂e figure on its way into the file. The framework CSV was the clearest
// case: each LOCATION BREAKDOWN row was written at four decimals and the RESULTS total was computed from
// unrounded values, so a verifier adding the locations up did not reach the stated total. Nothing
// errored, both numbers looked authoritative, and only the addition disagreed.
//
// The rule now: a FILE gets CSV_DP (six decimals, one gram) or CSV_INTENSITY_DP for a quotient, a SCREEN
// gets RESULT_DP or INTENSITY_DP, and the one typeset document a human reads — the assurance PDF — keeps
// its own precision with the reason recorded beside the calls.
//
// ⚠️ CSV_DP RATHER THAN THE RAW VALUE, which this commit briefly wrote. A raw float puts IEEE-754
// artefacts in a verifier's file: 1.6215995 prints as 1.6215995000000001. Six decimals is below every
// factor's own resolution, so the figure is unchanged in any sense a verifier can act on, and the
// reconciliation keeps a bound instead of an equality — see the tolerance below.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..', '..')
const src = (rel: string) => stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))

const GHG = 'app/dashboard/ghg/page.tsx'
const SCOPE3 = 'app/dashboard/scope3/page.tsx'
const REGISTER = 'app/dashboard/supply-chain/page.tsx'
const PDF = 'lib/assurancePdf.ts'

/**
 * ⚠️ THE EXACT EXPRESSIONS THAT LOST DIGITS, KEPT AS STRINGS. Not "no .toFixed here" — every one of these
 * files rounds legitimately on screen, and the export cells themselves now round to CSV_DP. What is
 * forbidden is the COARSE precision each cell used to carry: 4 decimals on a total, 2 on a category, 6 on
 * an intensity that can sit below 1e-6. A cell added at one of those precisions belongs in this list.
 */
const LOSSY_EXPORT_CELLS: [string, string][] = [
  [GHG, 'totals.s1_total.toFixed(4)'],
  [GHG, 'totals.s2_location.toFixed(4)'],
  [GHG, 'totals.s2_market.toFixed(4)'],
  [GHG, 'totals.biogenic.toFixed(4)'],
  [GHG, 'totals.s3_td.toFixed(4)'],
  [GHG, '(totals.s1_total / rev).toFixed(6)'],
  [GHG, 'c.s1_total.toFixed(4)'],
  [GHG, 'c.s2_location.toFixed(4)'],
  // ⚠️ THE EXPORT CELL, NOT THE BARE EXPRESSION. Both pages round the SAME quantities on screen, which is
  // correct, so these carry enough of the surrounding cell to name the file and not the card:
  // scope3/page.tsx:4300 and supply-chain/page.tsx:878 are legitimate and must keep their .toFixed(2).
  [SCOPE3, "['Total Scope 3', `${totalScope3.toFixed(2)} mt CO2e`]"],
  [SCOPE3, 'priced ? getCatEmissions(c.id).toFixed(2)'],
  [SCOPE3, 'h.financedEmissions.toFixed(2)'],
  [SCOPE3, '(h.attributionFactor * 100).toFixed(2)'],
  [REGISTER, '`${totalScope3.toFixed(2)} mt CO2e`]'],
  [REGISTER, "'not available' : s.scope3_emissions.toFixed(2),"],
]

const loc = (over: Partial<Location> = {}): Location =>
  ({ ...emptyLocation('l1', 'Site'), country: 'US', grid_region: 'CAMX', ...over })

describe('export precision', () => {
  it('the framework CSV writes the computed figure, not a rounded one', () => {
    const s = src(GHG)
    for (const [, expr] of LOSSY_EXPORT_CELLS.filter(([f]) => f === GHG)) {
      expect(s, `${GHG} rounds an exported figure again: ${expr}`).not.toContain(expr)
    }
    // Positively: every figure cell is written at CSV_DP, and the intensity at its own precision.
    expect(s).toContain("['Scope 1 total (tCO₂e)', totals.s1_total.toFixed(CSV_DP)]")
    expect(s).toContain("['Scope 2 location-based (tCO₂e)', totals.s2_location.toFixed(CSV_DP)]")
    expect(s).toContain("[['S1 intensity (tCO₂e/$M revenue)', (totals.s1_total / rev).toFixed(CSV_INTENSITY_DP)]]")
    expect(s).toContain("return [loc.name, loc.grid_region, c.s1_total.toFixed(CSV_DP), c.s2_location.toFixed(CSV_DP), '']")
  })

  it('LOCATION BREAKDOWN sums to RESULTS, within what CSV_DP rounding can introduce', () => {
    // ⚠️ THE ENGINE-LEVEL FORM OF THE RECONCILIATION. The CSV is assembled inside the page component and
    // is not exported, so the arithmetic is asserted where it happens, at the precision the file writes:
    // the total IS the sum of the per-location figures the breakdown prints.
    const locations = [
      loc({ id: 'a', name: 'A', natural_gas_amount: 1234.567, natural_gas_unit: 'mcf', electricity_kwh: 987_654 }),
      loc({ id: 'b', name: 'B', country: 'GB', grid_region: 'UK', electricity_kwh: 123_456, diesel_stationary_amount: 77.7 }),
      loc({ id: 'c', name: 'C', gasoline_amount: 3333.33, electricity_kwh: 1 }),
    ]
    const inv = calcInventory(locations, 'AR6', 2025)
    const per = locations.map(l => calcLocation(l, 'AR6', 2025))

    // ⚠️ THE BOUND, AND WHY IT IS (n + 1) AND NOT n. Each of the n row cells can move by up to half a
    // unit in the last place, and so can the total cell, which is rounded independently — so the worst
    // case is one half-unit per row plus one for the total. Anything beyond that is not rounding: it is
    // the totals and the breakdown having been computed from different numbers, which is the defect this
    // reconciliation exists to catch.
    const half = 0.5 * 10 ** -CSV_DP
    const bound = (per.length + 1) * half
    for (const field of ['s1_total', 's2_location'] as const) {
      const summed = per.reduce((t, c) => t + Number(c[field].toFixed(CSV_DP)), 0)
      const stated = Number(inv[field].toFixed(CSV_DP))
      expect(Math.abs(summed - stated), `${field}: breakdown minus total exceeds ${bound}`)
        .toBeLessThanOrEqual(bound)
    }
    // And the underlying arithmetic is exact addition, floating point aside: the tolerance above is for
    // the writing, not for the engine.
    expect(per.reduce((t, c) => t + c.s1_total, 0)).toBeCloseTo(inv.s1_total, 9)
    expect(per.reduce((t, c) => t + c.s2_location, 0)).toBeCloseTo(inv.s2_location, 9)

    // Why a raw float was not the answer either: the artefact CSV_DP exists to keep out of the file.
    expect(String(1.6215995 * 1)).toBe('1.6215995')
    expect(String(0.1 + 0.2), 'a sum of two clean decimals is not a clean decimal').toBe('0.30000000000000004')
    expect((0.1 + 0.2).toFixed(CSV_DP)).toBe('0.300000')
  })

  it('an excluded location says Not quantified, in both figure columns', () => {
    const s = src(GHG)
    expect(s).toContain("return [loc.name, loc.grid_region, NOT_QUANTIFIED, NOT_QUANTIFIED,")
    expect(NOT_QUANTIFIED, 'the same words the workings table gives the same location').toBe('Not quantified')
  })

  it('the Scope 3 and register CSVs write the computed figure too', () => {
    for (const file of [SCOPE3, REGISTER]) {
      const s = src(file)
      for (const [, expr] of LOSSY_EXPORT_CELLS.filter(([f]) => f === file)) {
        expect(s, `${file} rounds an exported figure again: ${expr}`).not.toContain(expr)
      }
    }
  })

  it('the screens keep their named precisions, and the assurance PDF keeps its own', () => {
    expect(RESULT_DP).toBe(3)
    expect(INTENSITY_DP, 'an intensity below 1 would round to 0.000 at RESULT_DP').toBe(6)
    expect(CSV_DP, 'one gram').toBe(6)
    expect(CSV_INTENSITY_DP, 'a quotient can sit below 1e-6; keep three significant figures there')
      .toBe(9)
    expect(CSV_INTENSITY_DP).toBeGreaterThan(CSV_DP)
    const ghg = src(GHG)
    expect(ghg, 'the export preview rounds for reading').toContain('totals.s1_total.toFixed(RESULT_DP)')
    expect(ghg).toContain('(totals.s1_total/rev).toFixed(INTENSITY_DP)')
    // ⚠️ THE PDF IS THE ONE DOCUMENT THAT ROUNDS, DELIBERATELY. Pinned so that a future sweep of the
    // CSVs does not take it along: 3 for a total, 4 for an intensity, decided 27 Sep 2026.
    const pdf = src(PDF)
    expect(pdf).toContain('t.s1_total.toFixed(3)')
    expect(pdf).toContain('t.s2_location.toFixed(3)')
    expect(pdf).toContain('(t.s1_total / rev).toFixed(4)')
  })
})
