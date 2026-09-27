import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import { csvCell, toCsv, csvBlob, CSV_BOM } from './csv'
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

  it('the downloaded file starts with the UTF-8 BOM, so Excel on Windows decodes it as UTF-8', async () => {
    const blob = csvBlob([['Supplier', 'Country'], ['Société Générale, SA', 'FR']])
    expect(blob.type).toBe('text/csv;charset=utf-8')
    // ⚠️ THE BYTES, NOT blob.text(). Blob.text() runs UTF-8 decode, which strips a leading BOM — so
    // reading it back as text would assert nothing about what lands on disk for Excel to read.
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect([...bytes.slice(0, 3)], 'EF BB BF').toEqual([0xef, 0xbb, 0xbf])
  })

  it('papaparse still reads the header cleanly, and the accented name survives', async () => {
    const name = 'Société Générale, SA'
    const blob = csvBlob([['Supplier', 'Country'], [name, 'FR']])
    // Blob.text() decodes UTF-8 and drops the BOM, which is what a browser or a parser reading the
    // file does. The literal prefix is stripped here too, so the assertion holds either way.
    const text = (await blob.text()).replace(CSV_BOM, '')
    const back = parse(text)
    expect(back[0], 'no BOM on the first header cell').toEqual(['Supplier', 'Country'])
    expect(back[1][0]).toBe(name)
  })

  it('papaparse strips a BOM from string input by itself', () => {
    // papaparse.js:238, string input only. The four CSV IMPORTERS pass a File instead, where the File
    // API's decode step removes it before papaparse is reached — which is why adding the BOM to the
    // exports cannot break a customer who re-uploads one of our own files.
    const withBom = CSV_BOM + toCsv([['Supplier', 'Country'], ['Acme, Inc.', 'DE']])
    const back = parse(withBom)
    expect(back[0]).toEqual(['Supplier', 'Country'])
  })

  it('every page that downloads a CSV builds it with csvBlob', () => {
    const producers: string[] = []
    const offenders: string[] = []
    for (const rel of walk('app')) {
      const src = stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))
      const usesHelper = /\bcsvBlob\(/.test(src)
      if (usesHelper) producers.push(rel)
      // ⚠️ THE THREE SHAPES THAT WENT WRONG, EACH CHECKED SEPARATELY. Naming the media type means the
      // page built its own Blob and so has no BOM; assembling the body means no quoting; and a Blob
      // built from a `csv` variable is how the GHG export came to be the only one with a BOM.
      if (/type: 'text\/csv/.test(src) && !usesHelper) offenders.push(`${rel}: names the CSV media type itself`)
      if (/\.join\(','\)\)\.join\('\\n'\)/.test(src)) offenders.push(`${rel}: assembles the CSV body itself`)
      if (/new Blob\(\[[^\]]*csv/i.test(src)) offenders.push(`${rel}: builds the Blob itself`)
    }
    expect(offenders).toEqual([])
    // Guard against the guard passing vacuously: eight exports, and the count is the thing that
    // notices when a ninth is added without the helper.
    expect(producers.length, `the CSV exports moved or were renamed: ${producers.join(', ')}`).toBe(8)
  })
})
