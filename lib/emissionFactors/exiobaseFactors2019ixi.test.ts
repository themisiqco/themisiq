import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import data from './exiobaseFactors2019ixi.json'

// 7,987 NUMBERS NOBODY CAN CHECK BY EYE, EXTRACTED FROM ONE ROW OF A 764 MB ARCHIVE.
//
// Produced by scripts/generate-exiobase-factors.py from EXIOBASE 3 v3.8.2. Same contract as
// exiobaseSectors.test.ts: the file is a build artefact, the fingerprint is what stops a hand-edit,
// and the shape assertions below would all pass on a file where someone changed a value.
//
// ⚠️ THE GWP AND UNIT PINS ARE NOT BOOKKEEPING. impacts/M.txt holds SEVEN GWP100-family aggregates.
// Rows 4 and 46 are both labelled 'GHG emissions (GWP100)' and are characterised on IPCC 2007 -
// that is AR4, two generations behind the AR6 our engine applies by default. Row 103 is the only
// AR5 aggregate. Swapping rows would change every figure in this file while leaving its structure,
// its counts and its field names identical, so T5 pins the row number, the row label and the GWP
// string, and T6 pins the unit. A silent swap to an AR4 row fails the build.
//
// ⚠️ THE UNIT PIN GUARDS A SECOND CONFUSION. Rows 38-45 of the same source file are in Gg - three
// orders of magnitude from the kg rows - and only unit.txt distinguishes them.
//
// TO CHANGE THE DATA: run the generator, not an editor. It prints the digest.
//   python3 scripts/generate-exiobase-factors.py /path/to/IOT_2019_ixi.zip

const ROWS_SHA256 = '8747704c24bb045e87b3c02bc9b952cb69c37ffd2e5e07c5cb2241320f206fdb'

const FACTOR_FIELDS = ['region', 'exio_code', 'value', 'unit'] as const
const METADATA_FIELDS = [
  'source', 'version', 'publisher', 'doi', 'url', 'licence', 'archive', 'data_year',
  'factor_type', 'price_basis', 'currency', 'price_year', 'gwp_set', 'source_member',
  'source_row_number', 'source_row_label', 'source_row_index_name', 'unit', 'unit_source',
  'regions', 'industries', 'generated_on', 'generated_by', 'reliability_bounds',
  'gwp_note', 'price_basis_note', 'denominator_note', 'margin_note', 'version_note',
] as const

type Row = Record<string, unknown>
const factors = data.factors as Row[]
const meta = data.metadata as Row

describe('exiobaseFactors2019ixi.json is generated, not maintained', () => {
  it('T1 the fingerprint matches the generator output', () => {
    // Mirrors the generator exactly: pipe-joined fields, value as a 12-digit exponential. NOT
    // JSON.stringify — Python writes a float zero as '0.0' and JavaScript as '0', and this file
    // holds 1,108 zeros, so a JSON-text digest would disagree across the two languages for reasons
    // unrelated to the data.
    // Python pads the exponent to two digits ('e+06'); JavaScript does not ('e+6'). Normalise.
    const expo = (n: number) =>
      n.toExponential(12).replace(/e([+-])(\d)$/, 'e$10$2')
    const canonical = factors
      .map(f => `${f.region}|${f.exio_code}|${f.unit}|${expo(f.value as number)}`)
      .join('\n')
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
    expect(
      digest,
      'exiobaseFactors2019ixi.json does not match its pinned fingerprint. If you ran the generator, ' +
      'paste the digest it printed into ROWS_SHA256. If you did not, the file was edited by hand - ' +
      'revert it and regenerate.',
    ).toBe(ROWS_SHA256)
  })

  it('T2 7,987 factors = 49 regions x 163 industries', () => {
    expect(factors).toHaveLength(7987)
    expect(new Set(factors.map(f => f.region)).size, '49 regions').toBe(49)
    expect(new Set(factors.map(f => f.exio_code)).size, '163 industries').toBe(163)
    expect(meta.regions).toBe(49)
    expect(meta.industries).toBe(163)
  })

  it('T3 no duplicate (region, exio_code) pair', () => {
    // A duplicate would make a resolver lookup ambiguous with nothing to disambiguate on.
    const keys = factors.map(f => `${f.region}|${f.exio_code}`)
    expect(new Set(keys).size, 'every region-industry pair appears once').toBe(factors.length)
  })

  it('T4 no nulls, every value finite, every code an industry code', () => {
    const bad: string[] = []
    factors.forEach((f, i) => {
      expect(Object.keys(f).sort(), `factors[${i}] field set`).toEqual([...FACTOR_FIELDS].sort())
      for (const k of FACTOR_FIELDS) {
        const v = f[k]
        if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) bad.push(`factors[${i}].${k}`)
      }
      if (typeof f.value !== 'number' || !Number.isFinite(f.value)) bad.push(`factors[${i}].value not finite`)
      if (!String(f.exio_code).startsWith('i')) bad.push(`factors[${i}].exio_code ${f.exio_code} is not an industry code`)
    })
    expect(bad).toEqual([])
  })

  it('T5 the GWP set and the source row are pinned — an AR4 swap fails here', () => {
    // Rows 4 and 46 of impacts/M.txt are GWP100 on IPCC 2007 (AR4) and would pass every other
    // assertion in this file. These three pins are the only thing that distinguishes them.
    expect(meta.source_row_number, 'row 103 is the only AR5 aggregate in v3.8.2').toBe(103)
    expect(meta.source_row_label).toBe('GHG emissions AR5 (GWP100) | GWP100 (IPCC, 2010)')
    expect(String(meta.gwp_set), 'must name AR5 and IPCC 2010').toMatch(/AR5.*IPCC 2010/)
    expect(String(meta.gwp_set), 'IPCC 2007 is AR4 — wrong row').not.toMatch(/2007/)
    expect(String(meta.gwp_note), 'the AR5-vs-AR6 gap must stay disclosed').toMatch(/AR6/)
  })

  it('T6 the unit is a kg CO2 equivalent, not Gg', () => {
    // Rows 38-45 of the same source file are in Gg. Only unit.txt separates them, and the
    // generator reads it by position.
    expect(String(meta.unit)).toMatch(/^kg\s*CO2[\s-]*(eq\.?|Equivalents?)$/i)
    expect(String(meta.unit), 'Gg is three orders of magnitude out').not.toMatch(/\bGg\b/)
    expect(String(meta.unit_source), 'the unit must be read by position, not by label').toMatch(/by position/)
    const units = new Set(factors.map(f => f.unit))
    expect(units.size, 'one unit across every factor').toBe(1)
    expect([...units][0]).toBe(meta.unit)
  })

  it('T7 the basis, currency and year are what a consumer must not assume', () => {
    expect(meta.factor_type, 'the ixi archive is industries').toBe('industry')
    expect(meta.price_basis, 'EXIOBASE publishes in basic prices; customer spend is purchaser').toBe('basic')
    expect(meta.currency).toBe('EUR')
    expect(meta.data_year).toBe(2019)
    expect(meta.price_year).toBe(2019)
    expect(String(meta.denominator_note), 'the denominator is M.EUR, not EUR').toMatch(/M\.EUR/)
    expect(String(meta.margin_note), 'no basic-to-purchaser conversion is possible from this archive').toMatch(/no trade/i)
  })

  it('T8 the reliability bounds are pinned, and no value moved to produce them', () => {
    // ⚠️ THE POINT OF THIS TEST IS THAT T1 STILL PASSES. The bounds are DESCRIPTIVE: they are
    // computed FROM the factors and stored beside them, and not one value is clipped, winsorised
    // or replaced. Other users of EXIOBASE do clip - Ignite Procurement publishes a p3/p97
    // truncation with zero-filling - and this file's source note says the values are stored exactly
    // as published, so clipping here would make that note false. If a future change starts
    // modifying values, T1's digest moves and this suite fails before anything ships.
    const b = meta.reliability_bounds as Record<string, any>
    expect(b, 'reliability_bounds missing').toBeTruthy()
    expect(b.values_modified, 'bounds must never modify a value').toBe(false)
    expect(b.zeros_excluded, 'a zero is an absent factor, not a factor of zero').toBe(true)
    expect(String(b.zeros_excluded_reason)).toMatch(/absent factor/i)

    expect(b.global.percentiles).toEqual([3, 97])
    expect(b.global.lower).toBeCloseTo(60429.90211793, 6)
    expect(b.global.upper).toBeCloseTo(43080559.231829956, 4)
    expect(b.global.n_nonzero).toBe(6879)
    expect(b.global.n_below).toBe(207)
    expect(b.global.n_above).toBe(207)

    expect(b.per_industry.percentiles).toEqual([5, 95])
    expect(b.per_industry.min_nonzero_regions, 'the threshold is a judgement and is pinned').toBe(20)
    expect(b.per_industry.industries_with_bound).toBe(153)
    // Named, not counted: an industry silently gaining or losing a bound changes what a resolver
    // can say about it, and 'unbounded' must never be mistaken for 'in range'.
    expect(b.per_industry.industries_without_local_bound).toEqual(
      ['i27.41.w', 'i27.45.w', 'i37.w.1', 'i40.11.i', 'i40.11.j', 'i40.11.k', 'i45.w'])
    expect(b.per_industry.industries_zero_in_every_region).toEqual(['i01.w.1', 'i01.w.2', 'i99'])
    expect(Object.keys(b.per_industry.bounds)).toHaveLength(153)
    for (const [code, v] of Object.entries(b.per_industry.bounds as Record<string, any>)) {
      expect(String(code).startsWith('i'), `${code} is not an industry code`).toBe(true)
      expect(v.p5, `${code}: p5 must not exceed p95`).toBeLessThanOrEqual(v.p95)
      expect(v.n_nonzero_regions, `${code}: below the stated threshold`).toBeGreaterThanOrEqual(20)
    }
    expect(String(b.disagreement_note), 'the global and local bounds are not substitutes').toMatch(/disagree/i)
  })

  it('T9 the metadata block is complete, licence included', () => {
    for (const f of METADATA_FIELDS) expect(meta[f], `metadata.${f} is missing`).toBeTruthy()
    expect(meta.source).toBe('EXIOBASE 3')
    expect(meta.version).toBe('3.8.2')
    expect(meta.doi).toBe('10.5281/zenodo.5589597')
    expect(meta.licence, 'ShareAlike attaches obligations to anything published from this').toBe('CC BY-SA 4.0')
    expect(String(meta.version_note), 'the v3.81 discrepancy is the publisher\'s and stays recorded').toMatch(/v3\.81/)
    expect(String(meta.generated_by)).toContain('scripts/generate-exiobase-factors.py')
  })
})
