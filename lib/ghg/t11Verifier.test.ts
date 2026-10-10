// lib/ghg/t11Verifier.test.ts
//
// T11: the verifier page renders stored workings only (source checks), and the location_log migration records its
// run. The rendering itself is tested on the design's fixture in app/verify/[token]/_components/WorkingsSourceCell.test.tsx.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from '../testing/stripComments'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const PAGE = stripTsComments(read('app/verify/[token]/page.tsx'))
const CELL = stripTsComments(read('app/verify/[token]/_components/WorkingsSourceCell.tsx'))

// The engine's calculations: none may be imported or called by the page an assurance provider opens.
const CALCULATIONS = ['buildWorkings', 'calcLocation', 'calcInventory', 'deriveLocations', 'applyResolutions', 'billContributions',
  'selectionFor', 'editionFor', 'pickEF', 'getGridFactor', 'getResidualFactor', 'figuresForSave', 'unpricedLines', 'findUnresolvedCoverage']

describe('the verifier page renders stored workings and calculates nothing', () => {
  it('no engine calculation is imported or called, by the page or its Source cell', () => {
    for (const src of [PAGE, CELL]) for (const name of CALCULATIONS) expect(src, name).not.toMatch(new RegExp(`\\b${name}\\b`))
  })
  it('no value is imported from the engine module itself; only types (VER-01 records the two indirect imports left)', () => {
    for (const src of [PAGE, CELL]) {
      const fromEngine = src.match(/import\s+(type\s+)?\{[^}]*\}\s+from\s+'[./]*lib\/ghg\/engine'/g) ?? []
      for (const m of fromEngine) expect(m, m).toMatch(/^import\s+type\s/)
    }
    expect(PAGE).toContain("from '../../../lib/ghg/reportingYear'")
  })
  it('each row\'s Source cell, GWP basis and conversion factor go through the shared helpers', () => {
    expect(PAGE).toContain('<WorkingsSourceCell w={w as unknown as SourceCellRow} fileOf={fileOfDoc} quoteOf={quoteOfDoc} yearText={yearText}')
    expect(PAGE).toContain('{workingsGwpBasisCell(w)}')
    expect(PAGE).not.toContain('>{w.gwp_basis}<')
    expect(PAGE).toContain('{workingsConversionFactorLine(w)}')
    expect(PAGE).toContain('const yearText = reportingYearLabel(periodFromYearAndEnd(inv.reporting_year, inv.fiscal_year_end_month ?? 12)).inText')
  })
  it('the estimate line has no em dash, and nothing claims who read a bill (BR9)', () => {
    expect(read('app/verify/[token]/page.tsx')).not.toContain('Estimated — {w.extrapolation_note}')
    for (const src of [PAGE, CELL]) expect(src).not.toMatch(/Read by AI|Read by \{/)
  })
})

describe('the location_log migration records its run (CLAUDE.md: the header is the record)', () => {
  const sql = read('supabase/migrations/20261009_ghg_location_log.sql')
  it('opens with the run, and records the pre-check and the result', () => {
    expect(sql.split('\n')[0]).toBe('-- RUN 9 Oct 2026 (evening, Ontario) in the Supabase SQL editor, then the API schema cache reloaded; grants verified.')
    expect(sql).not.toContain('NOT YET RUN')
    expect(sql).toContain('every role held its privileges on all 34 columns alike, except service_role, which holds')
    // hk2: the 35-column line was a pre-check misread as the after-run check. The record now names the column.
    expect(sql).toContain('-- CORRECTION, 9 Oct 2026 (evening, Ontario). This file was NOT run on the morning of 9 Oct.')
    expect(sql).toContain("with the query above filtered to column_name = 'location_log':")
    expect(sql).toContain("notify pgrst, 'reload schema'; was run, and saves worked.")
  })
})
