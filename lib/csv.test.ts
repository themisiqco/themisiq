import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { csvCell, toCsv } from './csv'
import { stripTsComments } from './testing/stripComments'

// ─────────────────────────────────────────────────────────────────────────────
// A CUSTOMER'S CSV MUST PARSE BACK INTO THE CELLS IT WAS BUILT FROM.
//
// Four of the eight exports joined cells with a bare comma. The round-trip below is asserted with
// PAPAPARSE, not a parser written in this file: papaparse is already a dependency, it is an
// independent RFC 4180 implementation, and a hand-rolled parser here would only agree with the same
// assumptions the writer makes.
//
// The last test is the ratchet. It reads every page that produces a CSV and fails if one assembles the
// body itself instead of calling toCsv, because that is exactly how four exports ended up wrong while
// the other four were right.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..')
const parse = (csv: string): string[][] => {
  // delimiter is stated rather than auto-detected: a one-row fixture gives papaparse too little to
  // sniff, and this is a test of the writer, not of detection.
  const out = Papa.parse<string[]>(csv, { header: false, delimiter: ',' })
  expect(out.errors, `papaparse rejected the output: ${JSON.stringify(out.errors)}`).toEqual([])
  return out.data
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(e.name)) out.push(rel)
  }
  return out
}

describe('CSV writer', () => {
  it('quotes exactly the cells RFC 4180 requires', () => {
    expect(csvCell('plain'), 'nothing to escape, nothing added').toBe('plain')
    expect(csvCell('Acme, Inc.')).toBe('"Acme, Inc."')
    expect(csvCell('the "best" supplier')).toBe('"the ""best"" supplier"')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell(42)).toBe('42')
    expect(csvCell(null), 'an empty cell, never the string null').toBe('')
    expect(csvCell(undefined)).toBe('')
    // ⚠️ A SPACER ROW STAYS EMPTY. The Scope 3 surface snapshot records these lines, and quoting them
    // into `""` would change a committed verifier-facing file for no reader's benefit.
    expect(toCsv([[''], []])).toBe('\n')
  })

  it('a supplier name with a comma AND a quote survives the round trip', () => {
    // The risk register's header and one supplier row, in the shape app/dashboard/supply-chain builds.
    const name = 'Acme, Inc. "Global" Ltd, SA'
    const rows = [
      ['ThemisIQ — Supply Chain Risk & Scope 3 Assessment'],
      ['Company', 'Northwind, Ltd.'],
      [''],
      ['SUPPLIER RISK REGISTER'],
      ['Supplier', 'Country', 'Sector', 'Tier', 'Annual Spend', 'Risk Level', 'Risk Score',
       'Scope 3 (mt CO2e)', 'Risk Factors', 'Assessment Required'],
      [name, 'DE', 'Chemicals (chem)', '1', 'EUR 1,250,000', 'High', 6.5, '12.40',
       'High spend concentration — strategic dependency | Tier 2 supplier — limited visibility', 'YES'],
    ]
    const back = parse(toCsv(rows))
    const header = back[4]
    const row = back[5]
    // ⚠️ THE COLUMN COUNT IS THE ASSERTION THAT WOULD HAVE CAUGHT THE BUG. Unquoted, this row split
    // into 14 cells against a 10-column header and every value after the name moved left.
    expect(row).toHaveLength(header.length)
    expect(row[0]).toBe(name)
    expect(row[4]).toBe('EUR 1,250,000')
    expect(row[6]).toBe('6.5')
    expect(row[9]).toBe('YES')
    expect(back[1][1]).toBe('Northwind, Ltd.')
  })

  it('a cell holding a newline stays one cell', () => {
    const back = parse(toCsv([['a', 'line one\nline two', 'b']]))
    expect(back[0]).toEqual(['a', 'line one\nline two', 'b'])
  })

  it('ragged spacer rows are preserved', () => {
    const back = parse(toCsv([['A', 'B'], [], [''], ['C']]))
    expect(back[0]).toEqual(['A', 'B'])
    expect(back[3]).toEqual(['C'])
  })

  it('every page that downloads a CSV builds it with toCsv', () => {
    const offenders: string[] = []
    for (const rel of walk('app')) {
      const src = stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))
      if (!/type: 'text\/csv/.test(src)) continue
      if (!/\btoCsv\(/.test(src)) offenders.push(`${rel}: downloads a CSV without toCsv`)
      // The two shapes that were wrong, and the hand-rolled quoting that was right but duplicated.
      if (/\.join\(','\)\)\.join\('\\n'\)/.test(src)) offenders.push(`${rel}: assembles the CSV body itself`)
    }
    expect(offenders).toEqual([])
    // Guard against the guard passing vacuously.
    const producers = walk('app').filter(rel =>
      /type: 'text\/csv/.test(stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))))
    expect(producers.length, 'the CSV producers moved or were renamed').toBe(8)
  })
})
