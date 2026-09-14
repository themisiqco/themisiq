import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import data from './exiobaseSectors.json'

// THE FILE IS A BUILD ARTEFACT, AND NOTHING ELSE ENFORCES THAT.
//
// lib/emissionFactors/exiobaseSectors.json is 363 rows of codes nobody here can check by eye. It is
// produced by scripts/generate-exiobase-sectors.py from pymrio's bundled EXIOBASE 3 classification,
// and it must stay byte-faithful to that source: a hand-edit — a "tidied" name, a removed row, a
// sector someone thought looked wrong — would put a code in a dropdown that no published table can
// price, and the failure would surface as a missing factor for a sector a customer had already
// selected and saved.
//
// ⚠️ THE FINGERPRINT IS THE POINT OF THIS FILE. The shape assertions below (163, 200, no duplicates,
// no nulls) would all pass on a file where someone rewrote an ExioName. Only ROWS_SHA256 catches
// that, because it is computed over the rows exactly as the generator serialises them.
//
// TO CHANGE THE DATA: run the generator, not an editor. It prints the new digest; paste it here.
//   python3 -m venv /tmp/exio-venv
//   /tmp/exio-venv/bin/pip install 'pymrio==0.6.3'
//   /tmp/exio-venv/bin/python scripts/generate-exiobase-sectors.py
// A digest change with no generator run and no pymrio version change means the file was edited by
// hand. That is the case this test exists to stop.

const ROWS_SHA256 = 'b393d1ad7d4966cd0ddd7c29379c98b362ab9bed01be7e98afd53226647e3341'

const INDUSTRY_FIELDS = [
  'exio_number', 'exio_name', 'exio_code', 'exio_label',
  'isic_code', 'isic_name', 'consumption_category', 'display_group',
] as const
const GROUP_FIELDS = ['id', 'heading', 'member_count'] as const
const PRODUCT_FIELDS = [
  'exio_number', 'exio_name', 'exio_code', 'exio_label',
  'consumption_category', 'type',
] as const
const METADATA_FIELDS = [
  'source', 'version', 'publisher', 'published', 'doi', 'url', 'licence',
  'generated_on', 'generated_from', 'generated_by', 'isic_note', 'display_group_note', 'scope_note',
] as const

type Row = Record<string, unknown>
const industries = data.industries as Row[]
const groups = data.groups as Row[]
const products = data.products as Row[]
const metadata = data.metadata as Row

describe('exiobaseSectors.json is generated, not maintained', () => {
  it('E1 the fingerprint matches the generator output', () => {
    // Must mirror the generator's serialisation exactly: sort_keys, no spaces, metadata excluded
    // because generated_on moves on every run and the rows must not.
    const canonical = JSON.stringify(sortDeep({ groups, industries, products }))
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
    expect(
      digest,
      'exiobaseSectors.json does not match its pinned fingerprint. If you ran the generator, paste ' +
      'the digest it printed into ROWS_SHA256 above. If you did not, the file was edited by hand — ' +
      'revert it and regenerate. See the header of this file.',
    ).toBe(ROWS_SHA256)
  })

  it('E2 163 industries and 200 products', () => {
    // The published resolution of EXIOBASE 3. A different count is a different dataset.
    expect(industries, '163 industries in the ixi table').toHaveLength(163)
    expect(products, '200 products in the pxp table').toHaveLength(200)
  })

  it('E3 no duplicate codes, in either table', () => {
    // exio_code is what SpendFactor.sector_key holds, so a duplicate would make a factor lookup
    // ambiguous in a way no type could catch.
    for (const [label, rows] of [['industries', industries], ['products', products]] as const) {
      for (const field of ['exio_code', 'exio_number', 'exio_name'] as const) {
        const seen = rows.map(r => r[field])
        expect(new Set(seen).size, `${label}: duplicate ${field}`).toBe(rows.length)
      }
    }
  })

  it('E4 no nulls and no empty strings, on any field of any row', () => {
    const bad: string[] = []
    const check = (label: string, rows: Row[], fields: readonly string[]) => {
      rows.forEach((row, i) => {
        expect(Object.keys(row).sort(), `${label}[${i}] field set`).toEqual([...fields].sort())
        for (const f of fields) {
          const v = row[f]
          if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
            bad.push(`${label}[${i}].${f}`)
          }
        }
      })
    }
    check('industries', industries, INDUSTRY_FIELDS)
    check('products', products, PRODUCT_FIELDS)
    expect(bad, 'the generator refuses to emit nulls; a null here means the file was edited').toEqual([])
  })

  it('E5 display groups: 20 headings, every industry in exactly one, no product in any', () => {
    // ⚠️ THE HEADINGS AND THE ASSIGNMENT ARE ALSO SEEDED BY
    // supabase/migrations/20260914_exiobase_sectors.sql, AND THE GENERATOR READS THEM FROM THERE
    // RATHER THAN RE-DERIVING THEM. That is what stops the file and the database grouping an
    // industry differently while each stays internally consistent - a drift with no failing test on
    // either side. This test guards the file's half: the counts have to agree with the membership,
    // so renaming a heading in one place and not the other breaks it here.
    expect(groups, '20 headings').toHaveLength(20)
    expect(groups.map(g => g.id), 'ids 1..20 in seed order — this is the optgroup order')
      .toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    for (const g of groups) {
      expect(Object.keys(g).sort()).toEqual([...GROUP_FIELDS].sort())
      expect(String(g.heading).trim(), 'a blank heading would render as an unnamed optgroup').not.toBe('')
    }
    const headings = new Set(groups.map(g => g.heading))
    expect(headings.size, 'headings must be distinct').toBe(20)

    // Every industry in exactly one group, and that group must exist.
    const orphans = industries.filter(r => !headings.has(r.display_group))
    expect(orphans.map(r => `${r.exio_code} -> ${String(r.display_group)}`),
      'an industry assigned to a heading no group declares').toEqual([])

    // Counts: each declared member_count equals actual membership, and they sum to 163.
    const actual = new Map<unknown, number>()
    for (const r of industries) actual.set(r.display_group, (actual.get(r.display_group) ?? 0) + 1)
    const mismatched = groups
      .filter(g => (actual.get(g.heading) ?? 0) !== g.member_count)
      .map(g => `${String(g.heading)}: declares ${String(g.member_count)}, has ${actual.get(g.heading) ?? 0}`)
    expect(mismatched, 'a renamed heading shows up here as a group with zero members').toEqual([])
    expect(groups.reduce((n, g) => n + Number(g.member_count), 0), 'the 20 counts sum to 163').toBe(163)

    // Products carry none. The database column is null on all 200, and an empty string here would
    // make "no group" indistinguishable from "a group whose name happens to be blank".
    expect(products.filter(r => 'display_group' in r).map(r => r.exio_code),
      'no product may carry a display_group').toEqual([])
  })

  it('E6 the metadata block is present and complete', () => {
    // Provenance is not decoration. The licence in particular is load-bearing: CC BY-SA 4.0 attaches
    // attribution and ShareAlike obligations to anything we publish from this. See spend.ts.
    for (const f of METADATA_FIELDS) {
      expect(metadata[f], `metadata.${f} is missing`).toBeTruthy()
    }
    expect(metadata.source).toBe('EXIOBASE 3')
    expect(metadata.version).toBe('3.8.2')
    expect(metadata.doi).toBe('10.5281/zenodo.5589597')
    expect(metadata.licence, 'the ShareAlike term is why this field exists').toBe('CC BY-SA 4.0')
    expect(String(metadata.generated_by)).toContain('scripts/generate-exiobase-sectors.py')
    expect(String(metadata.generated_from), 'name the pymrio version the rows came from').toMatch(/pymrio \d+\.\d+\.\d+/)
    expect(String(metadata.isic_note), 'the Rev. 3.1 caveat must survive a regeneration').toMatch(/Rev\. 3\.1/)
    expect(String(metadata.display_group_note), 'the groups are ours, not EXIOBASE\'s')
      .toMatch(/[Pp]resentation only/)
    expect(String(metadata.display_group_note), 'and they are read from the migration, not re-derived')
      .toMatch(/20260914_exiobase_sectors\.sql/)
  })

  it('E7 codes are in the shape each table uses', () => {
    // i-prefixed for industries, p-prefixed for products. The two spaces are parallel and must not
    // be confused; see SpendFactorType in spend.ts.
    expect(industries.every(r => String(r.exio_code).startsWith('i')), 'industry codes start with i').toBe(true)
    expect(products.every(r => String(r.exio_code).startsWith('p')), 'product codes start with p').toBe(true)
  })

  it('E8 the generator is in the repo', async () => {
    // A generated file whose generator is absent is a hand-maintained file with a misleading header.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('scripts/generate-exiobase-sectors.py', 'utf8')
    expect(src.length, 'scripts/generate-exiobase-sectors.py looks empty').toBeGreaterThan(2_000)
    expect(src, 'the generator must pin the pymrio version it was written against').toContain('REQUIRED_PYMRIO')
    expect(src, 'the display groups must be read from the migration, never re-derived here')
      .toContain('20260914_exiobase_sectors.sql')
  })
})

/** Key-sorted deep copy, matching python json.dumps(sort_keys=True, separators=(',', ':')). */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Row).sort()) out[k] = sortDeep((value as Row)[k])
    return out
  }
  return value
}
