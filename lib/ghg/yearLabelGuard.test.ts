// lib/ghg/yearLabelGuard.test.ts
//
// T3b diff a: THE SOURCE GUARD. Every reporting-year label on the GHG surfaces comes from reportingYearLabel
// (lib/ghg/engine.ts), so a year ending in March is never printed as a bare year or "FY". In each file below:
// no `FY${`, no "YE ", no `reporting year ${` outside the helper, and no reporting year rendered straight into
// text or a template. Code uses (filters, keys, comparisons, props, storage paths) are allowlisted by the line
// they are on, so a new one has to be added here on purpose. Diff b extends FILES to Scope 3 and the SB 253 banner.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from '../testing/stripComments'

const FILES = [
  'app/dashboard/ghg/page.tsx',
  'app/dashboard/ghg/_components/CoverageStrip.tsx',
  'app/dashboard/ghg/trends/page.tsx',
  'lib/ghg/series.ts',
  'lib/ghg/loadSeries.ts',
  'lib/ghg/loadMonthly.ts',
  'app/verify/[token]/page.tsx',
  'lib/assurancePdf.ts',
  'lib/ghg/engine.ts',
]

// Code uses, not labels: each is a key, a path or a comparison, never shown to a reader.
const ALLOWED = [
  'const key = `${companyId}:${inventory.reporting_year}`',                                        // prior-year lookup key
  'const priorYearKey = inventory.company_id ? `${inventory.company_id}:${inventory.reporting_year}` : null',
  'const path = `${session.user.id}/${inventory.reporting_year}/',                                   // storage path
  "gwp: 'AR6', deadline: 'FY2024 (large EU companies)',",                                           // EU deadline, not a label
]

const RULES: [string, RegExp][] = [
  ['FY${', /FY\s?\$\{/],
  ['"YE "', /\bYE\s/],
  ['reporting year ${', /reporting year \$\{/i],
  ['a reporting year interpolated into a template', /\$\{[\w.]*reporting_year(\s*-\s*1)?\}/],
  ['a reporting year rendered as JSX text', /(?<![=\w])\{[\w.]*(reporting_year|selectedYear|baselineYear)(\s*-\s*1)?\}/],
  ['a series year rendered as JSX text or a template', /(?<![=\w])\$?\{[\w]*\.year\}/],
]

const helperRange = (src: string) => {
  const start = src.indexOf('export function reportingYearLabel(')
  return start < 0 ? null : [start, src.indexOf('\n}\n', start)] as const
}

describe('T3b source guard: reporting-year labels come from the helper', () => {
  for (const file of FILES) {
    it(file, () => {
      let src = stripTsComments(readFileSync(join(process.cwd(), file), 'utf8'))
      const h = helperRange(src)
      if (h) src = src.slice(0, h[0]) + src.slice(h[1])
      const hits: string[] = []
      src.split('\n').forEach((line, i) => {
        if (ALLOWED.some(a => line.includes(a))) return
        for (const [name, re] of RULES) if (re.test(line)) hits.push(`${i + 1} (${name}): ${line.trim().slice(0, 140)}`)
      })
      expect(hits, `\n${file}:\n  ${hits.join('\n  ')}\n`).toEqual([])
    })
  }

  it('the stripped source still holds the code the guard reads (not vacuous)', () => {
    const page = stripTsComments(readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8'))
    expect(page).toContain('const priorYearKey = inventory.company_id ? `${inventory.company_id}:${inventory.reporting_year}` : null')
    expect(page).toContain('_${yl.fileTag}.csv`')
  })

  it('the guard bites: each rule catches the form it names', () => {
    const bad = ['`FY${yr}`', 'YE Mar 2025', '`reporting year ${y}`', '`_${inventory.reporting_year}.csv`',
      '<div>Reporting year {inv.reporting_year}</div>', '<b>{y.year}</b>']
    for (const b of bad) expect(RULES.some(([, re]) => re.test(b)), b).toBe(true)
    for (const ok of ['key={y.year}', 'value={inventory.reporting_year}', 'reportingYear={inventory.reporting_year}'])
      expect(RULES.some(([, re]) => re.test(ok)), ok).toBe(false)
  })
})
