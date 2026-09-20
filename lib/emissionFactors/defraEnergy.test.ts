import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { inflateRawSync } from 'node:zlib'
import {
  DEFRA_ENERGY_META, DEFRA_ENERGY_FUELS, DEFRA_ENERGY_ELECTRICITY, DEFRA_ENERGY_HEAT_AND_STEAM,
  DEFRA_ENERGY_CONVERSIONS, DEFRA_ENERGY_RECORDS, energyFactor, energyConversion,
} from './defraEnergy'

// ── THE DEFRA ENERGY ARTEFACT, CHECKED AGAINST THE WORKBOOK ITSELF ───────────────────────────────
//
// Every figure in lib/emissionFactors/defraEnergy2026.json is read back out of
// data/reference/defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx HERE, by the cell the record
// cites, with a reader written for this test and not shared with the generator. A generator that
// mis-read a cell would otherwise agree with itself.
//
// Three of these checks come from OUTSIDE the workbook's own arithmetic, because a table can be
// internally consistent and still have been transcribed wrong:
//   E3  the sheets' own prose: each sheet says it is upstream or grid losses, and declares Scope 3
//   E4  cross-sheet ratios against Fuel properties, a sheet this artefact does not read
//   E5  definitional unit values (therm, cubic foot, US gallon), which no sheet can move
//
// ⚠️ A MISMATCH IS A FINDING, NOT A THING TO ADJUST. Nothing here rounds, fits or tolerates its way to
// a pass beyond the stated tolerances, and each tolerance says what it is for.

const ROOT = join(__dirname, '..', '..')
const XLSX = join(ROOT, 'data/reference/defra-desnz-ghg-conversion-factors-2026-full-set-v1.xlsx')

// ── A SECOND, INDEPENDENT XLSX READER ────────────────────────────────────────────────────────────
// Minimal and deliberately not the generator's: enough to pull one cell by its A1 reference.

function zipEntries(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>()
  // Walk the central directory from the end-of-central-directory record.
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error('not a zip file')
  let p = buf.readUInt32LE(eocd + 16)
  const count = buf.readUInt16LE(eocd + 10)
  for (let i = 0; i < count; i++) {
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const method = buf.readUInt16LE(p + 10)
    const compSize = buf.readUInt32LE(p + 20)
    const localOff = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const lnameLen = buf.readUInt16LE(localOff + 26)
    const lextraLen = buf.readUInt16LE(localOff + 28)
    const dataStart = localOff + 30 + lnameLen + lextraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    // Zip entries are raw deflate: no zlib or gzip header, so inflateRawSync, not unzipSync.
    out.set(name, method === 0 ? raw.toString('utf8') : inflateRawSync(raw).toString('utf8'))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

const entries = zipEntries(readFileSync(XLSX))
const sharedStrings: string[] = [...(entries.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join(''))
  .map(s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))

const sheetPaths = (() => {
  const wb = entries.get('xl/workbook.xml') ?? ''
  const rels = entries.get('xl/_rels/workbook.xml.rels') ?? ''
  const targets = new Map<string, string>()
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) targets.set(m[1], m[2])
  const out = new Map<string, string>()
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const t = (targets.get(m[2]) ?? '').replace(/^\//, '')
    out.set(m[1].replace(/&amp;/g, '&'), t.startsWith('xl/') ? t : `xl/${t}`)
  }
  return out
})()

const sheetCache = new Map<string, Map<string, string>>()
function sheetCells(name: string): Map<string, string> {
  const held = sheetCache.get(name)
  if (held) return held
  const path = sheetPaths.get(name)
  if (!path) throw new Error(`sheet ${name} not found; sheets are ${[...sheetPaths.keys()].join(', ')}`)
  const xml = entries.get(path) ?? ''
  const cells = new Map<string, string>()
  // ⚠️ SELF-CLOSING CELLS MUST BE MATCHED TOO. `<c r="A1" s="5"/>` carries no value, and a pattern that
  // only knows `<c …>…</c>` runs past it to the next closing tag, swallowing every cell in between: the
  // first version of this reader found 312 of this sheet's cells and silently lost the rest.
  for (const m of xml.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, attrs, body = ''] = m
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
    const inline = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')
    let text = ''
    if (/t="s"/.test(attrs) && v !== undefined) text = sharedStrings[Number(v)] ?? ''
    else if (inline) text = inline
    else if (v !== undefined) text = v
    cells.set(ref, text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
  }
  sheetCache.set(name, cells)
  return cells
}
const cellText = (sheet: string, ref: string): string => sheetCells(sheet).get(ref) ?? ''
const cellNumber = (sheet: string, ref: string): number => {
  const raw = cellText(sheet, ref)
  expect(raw, `${sheet}!${ref} is empty; an empty cell is an absence, never a zero`).not.toBe('')
  return Number(raw)
}

describe('DEFRA/DESNZ 2026 upstream energy artefact', () => {
  it('E1 every record carries the value the cell it cites carries', () => {
    expect(DEFRA_ENERGY_RECORDS).toHaveLength(18)
    for (const r of DEFRA_ENERGY_FUELS) {
      expect(cellText(r.sheet, r.cells.fuel), `${r.key} fuel label`).toBe(r.fuel)
      expect(cellText(r.sheet, r.cells.unit), `${r.key} unit`).toBe(r.unit)
      expect(cellNumber(r.sheet, r.cells.kg_co2e), `${r.key} kg CO2e`).toBe(r.kg_co2e)
    }
    for (const r of [...DEFRA_ENERGY_ELECTRICITY, ...DEFRA_ENERGY_HEAT_AND_STEAM]) {
      expect(cellText(r.sheet, r.cells.activity), `${r.key} activity`).toBe(r.activity)
      expect(cellText(r.sheet, r.cells.unit), `${r.key} unit`).toBe(r.unit)
      expect(Number(cellText(r.sheet, r.cells.year)), `${r.key} year`).toBe(r.year)
      expect(cellNumber(r.sheet, r.cells.kg_co2e), `${r.key} kg CO2e`).toBe(r.kg_co2e)
      const second = r.country ?? r.type ?? ''
      expect(cellText(r.sheet, r.cells.country ?? r.cells.type), `${r.key} country/type`).toBe(second)
      if (r.gases) {
        for (const g of ['co2', 'ch4', 'n2o'] as const) {
          expect(cellNumber(r.sheet, r.cells[`gases_${g}`]), `${r.key} ${g}`).toBe(r.gases[g])
        }
      }
    }
    for (const c of DEFRA_ENERGY_CONVERSIONS) {
      expect(cellText(c.sheet, c.cells.from), `${c.key} row label`).toBe(c.from)
      expect(cellText(c.sheet, c.cells.to), `${c.key} column header`).toBe(c.to)
      expect(cellNumber(c.sheet, c.cells.factor), `${c.key} factor`).toBe(c.factor)
    }
  })

  it('E2 the gas split is recorded where DEFRA publishes one, and is null where it does not', () => {
    // ⚠️ RECORDED, NEVER DERIVED. Only the Transmission and distribution sheet publishes the CO2, CH4
    // and N2O columns for these rows; the WTT sheets publish one combined CO2e figure. A split invented
    // for the others would be a number with no publisher.
    const withSplit = DEFRA_ENERGY_RECORDS.filter(r => 'gases' in r && r.gases)
    expect(withSplit.map(r => r.key).sort())
      .toEqual(['district_heat_steam_distribution_loss', 'electricity_td_loss'])
    for (const r of withSplit) {
      expect(r.sheet, `${r.key} carries a split, so it must come from the sheet that publishes one`)
        .toBe('Transmission and distribution')
    }
    for (const r of [...DEFRA_ENERGY_FUELS, ...DEFRA_ENERGY_ELECTRICITY, ...DEFRA_ENERGY_HEAT_AND_STEAM]) {
      if (r.sheet !== 'Transmission and distribution') expect(r.gases, `${r.key}`).toBeNull()
    }
  })

  it('E3 the sheets still say what the artefact says they say: upstream, or grid losses, and Scope 3', () => {
    // ⚠️ THE ARTEFACT IS ONLY USABLE FOR CATEGORY 3 WHILE THESE SENTENCES HOLD. The Scope 3 Standard
    // (p. 70) requires factors that exclude combustion; these four sheets are the evidence that these
    // rows do. A sheet that stops saying it fails here rather than being read on yesterday's word.
    const EXPECTED: Record<string, string> = {
      'WTT- fuels': 'upstream Scope 3 emissions associated with extraction, refining and transportation',
      'WTT- UK electricity': 'Scope 3 emissions of extraction, refining and transportation of primary fuels',
      'Transmission and distribution': 'Scope 3 emissions associated with grid losses',
      'WTT- heat and steam': 'extraction, refinement and transportation of primary fuels',
    }
    for (const [sheet, phrase] of Object.entries(EXPECTED)) {
      const described = DEFRA_ENERGY_META.sheet_descriptions[sheet]
      expect(described, `${sheet} description`).toBeTruthy()
      expect(described.cell, `${sheet} description cell`).toBe('A8')
      expect(described.text, `${sheet} description`).toContain(phrase)
      // .trim(): the workbook pads several of these paragraphs with trailing spaces, and the artefact
      // records the text stripped. The wording is what is being guarded, not the padding.
      expect(cellText(sheet, 'A8').trim(), `${sheet}!A8 as published`).toBe(described.text)
      expect(cellText(sheet, 'B6').trim(), `${sheet}!B6`).toBe('Scope 3')
      expect(DEFRA_ENERGY_META.scope_cells[sheet].text, `${sheet} recorded scope`).toBe('Scope 3')
    }
    // And the AR5 statement, from the Introduction, quoted with its cell.
    expect(DEFRA_ENERGY_META.gwp_basis).toBe('AR5')
    expect(DEFRA_ENERGY_META.guidance.gwp_basis.cell).toBe('A35')
    expect(cellText('Introduction', 'A35').trim()).toBe(DEFRA_ENERGY_META.guidance.gwp_basis.text)
    expect(DEFRA_ENERGY_META.guidance.gwp_basis.text).toContain('Fifth Assessment Report (AR5)')
  })

  it('E4 the mass and volume rows reconcile with Fuel properties, a sheet this artefact does not read', () => {
    // ⚠️ FROM OUTSIDE THE ARTEFACT. Dividing a per-tonne factor by a per-litre factor implies a
    // litres-per-tonne figure, which the workbook publishes independently on 'Fuel properties'. The
    // generator never reads that sheet, so agreement is evidence the rows were transcribed correctly.
    //
    // TOLERANCE 0.2%: DEFRA rounds each published factor to five decimal places and each fuel property
    // to three, so the implied ratio cannot be exact. Propane lands at 0.05% and diesel at 0.09%; 0.2%
    // is loose enough for the rounding and far tighter than a transcription slip, which moves a digit.
    const propaneTonnes = DEFRA_ENERGY_FUELS.find(f => f.key === 'propane_tonnes')!
    const propaneLitres = DEFRA_ENERGY_FUELS.find(f => f.key === 'propane_litres')!
    const impliedPropane = propaneTonnes.kg_co2e / propaneLitres.kg_co2e
    const publishedPropane = cellNumber('Fuel properties', 'G37')
    expect(Math.abs(impliedPropane - publishedPropane) / publishedPropane,
      `propane: ${impliedPropane.toFixed(2)} litres/tonne implied by ${propaneTonnes.cells.kg_co2e} over ` +
      `${propaneLitres.cells.kg_co2e}, against Fuel properties!G37 ${publishedPropane}`).toBeLessThan(0.002)

    // Diesel publishes no per-tonne row in this artefact, so the check reads the workbook's own tonnes
    // cell directly: still outside the artefact, and the ratio is still the workbook's own.
    const dieselLitres = DEFRA_ENERGY_FUELS.find(f => f.key === 'diesel_average_biofuel_blend_litres')!
    const dieselTonnes = cellNumber('WTT- fuels', 'D70')
    const impliedDiesel = dieselTonnes / dieselLitres.kg_co2e
    const publishedDiesel = cellNumber('Fuel properties', 'G25')
    expect(Math.abs(impliedDiesel - publishedDiesel) / publishedDiesel,
      `diesel: ${impliedDiesel.toFixed(2)} litres/tonne implied by WTT- fuels!D70 over ` +
      `${dieselLitres.cells.kg_co2e}, against Fuel properties!G25 ${publishedDiesel}`).toBeLessThan(0.002)
  })

  it('E5a 1 therm is 100,000 Btu(IT), which is 29.307107 kWh', () => {
    // Definitional, from outside every sheet: 1 therm = 100,000 Btu(IT) and 1 kWh = 3,412.141633 Btu(IT).
    // TOLERANCE 1e-6 relative: the workbook carries the value to 15 digits and derives it from its own
    // kWh-to-therm reciprocal, which lands 4.5e-8 away. Anything looser would accept a different unit.
    const published = DEFRA_ENERGY_CONVERSIONS.find(c => c.key === 'therm_to_kwh')!.factor
    const definitional = 100_000 / 3412.141633
    expect(Math.abs(published - definitional) / definitional,
      `Conversions!D30 ${published} against the definitional ${definitional}`).toBeLessThan(1e-6)
  })

  it('E5b 1 mcf is 1,000 cubic feet, and 1 ft is 0.3048 m exactly', () => {
    // TOLERANCE 1e-6 relative: the workbook derives cubic feet from its own m3-to-cu-ft reciprocal
    // (35.314667), which lands 7.9e-9 below the exact 0.3048^3. Recorded, not corrected.
    const published = DEFRA_ENERGY_CONVERSIONS.find(c => c.key === 'cubic_foot_to_cubic_metre')!.factor
    const exact = 0.3048 ** 3
    expect(Math.abs(published - exact) / exact,
      `Conversions!D38 ${published} against the exact ${exact}`).toBeLessThan(1e-6)
    // The mcf a US inventory stores is a THOUSAND cubic feet: the artefact holds the cubic foot, and
    // the thousand is definitional, so this is the figure a Category 3 row would multiply.
    expect(published * 1000).toBeCloseTo(28.316846592, 6)
  })

  it('E5c 1 US gallon is 3.785411784 litres exactly', () => {
    // TOLERANCE 1e-6 relative: the workbook's value differs from the exact definition by 5.1e-9.
    const published = DEFRA_ENERGY_CONVERSIONS.find(c => c.key === 'us_gallon_to_litre')!.factor
    expect(Math.abs(published - 3.785411784) / 3.785411784,
      `Conversions!C40 ${published} against the exact 3.785411784`).toBeLessThan(1e-6)
    // And the mass conversion, which is exact and needs no tolerance.
    expect(DEFRA_ENERGY_CONVERSIONS.find(c => c.key === 'kilogram_to_tonne')!.factor).toBe(0.001)
  })

  it('E6 the fingerprint covers the records, and is its own', () => {
    const digest = createHash('sha256').update(JSON.stringify(sortDeep({
      fuels: DEFRA_ENERGY_FUELS, electricity: DEFRA_ENERGY_ELECTRICITY,
      heat_and_steam: DEFRA_ENERGY_HEAT_AND_STEAM, conversions: DEFRA_ENERGY_CONVERSIONS,
    }))).digest('hex')
    expect(digest,
      'the fingerprint no longer matches the records: regenerate with scripts/generate-defra-energy.py')
      .toBe(DEFRA_ENERGY_META.energy_fingerprint_sha256)
    // Separate from the travel and commuting artefacts' fingerprints, so none moves when another is
    // regenerated.
    const travel = JSON.parse(readFileSync(join(ROOT, 'lib/emissionFactors/defraTravel2026.json'), 'utf8'))
    expect([travel.metadata.fingerprint_sha256, travel.metadata.commuting_fingerprint_sha256])
      .not.toContain(DEFRA_ENERGY_META.energy_fingerprint_sha256)
  })

  it('E7 the artefact holds the rows Category 3 needs, and nothing else', () => {
    expect(DEFRA_ENERGY_FUELS.map(f => f.key)).toEqual([
      'natural_gas_kwh_gross_cv', 'natural_gas_cubic_metres', 'propane_tonnes', 'propane_litres',
      'diesel_average_biofuel_blend_litres', 'petrol_average_biofuel_blend_litres',
      'fuel_oil_distillate_litres', 'fuel_oil_residual_litres',
    ])
    expect(DEFRA_ENERGY_ELECTRICITY.map(e => e.key))
      .toEqual(['electricity_generation_wtt', 'electricity_td_loss', 'electricity_td_wtt'])
    expect(DEFRA_ENERGY_HEAT_AND_STEAM.map(h => h.key)).toEqual([
      'district_heat_steam_wtt', 'district_heat_steam_distribution_loss',
      'district_heat_steam_distribution_wtt',
    ])
    // ⚠️ THE GAS ROW IS THE GROSS CV ONE. The Scope 1 side of a therms or mmBtu figure is EPA's higher
    // heating value factor, and the sheet asks for the same basis on both sides.
    expect(energyFactor('natural_gas_kwh_gross_cv')!.unit).toBe('kWh (Gross CV)')
    expect(DEFRA_ENERGY_FUELS.some(f => f.unit.includes('Net CV'))).toBe(false)
    // Every electricity and heat row is per kWh, which is what the design multiplies.
    for (const r of [...DEFRA_ENERGY_ELECTRICITY, ...DEFRA_ENERGY_HEAT_AND_STEAM]) expect(r.unit).toBe('kWh')
    // An absent key is null, never 0.
    expect(energyFactor('natural_gas_therms')).toBeNull()
    expect(energyConversion('mmbtu_to_kwh')).toBeNull()
  })

  it('E8 the natural gas per-tonne anomaly is recorded as a finding, and the row is not held', () => {
    // ⚠️ RECORDED, NOT FITTED. The per-tonne row does not reconcile with the volume and energy rows
    // through Fuel properties (+1.59% and +1.83%). The artefact does not hold it, the note says so, and
    // nothing here is adjusted to close the gap. The figures Category 3 uses agree to 0.24%.
    expect(DEFRA_ENERGY_META.natural_gas_mass_note).toContain('+1.59%')
    expect(DEFRA_ENERGY_META.natural_gas_mass_note).toContain('+1.83%')
    expect(DEFRA_ENERGY_FUELS.some(f => f.fuel === 'Natural gas' && f.unit === 'tonnes')).toBe(false)
    // The finding, re-derived here from the workbook so the note cannot drift from the sheet.
    const tonnes = cellNumber('WTT- fuels', 'D38')
    const m3 = DEFRA_ENERGY_FUELS.find(f => f.key === 'natural_gas_cubic_metres')!.kg_co2e
    const gross = DEFRA_ENERGY_FUELS.find(f => f.key === 'natural_gas_kwh_gross_cv')!.kg_co2e
    const impliedM3PerTonne = tonnes / m3
    const publishedM3PerTonne = cellNumber('Fuel properties', 'G31') / 1000
    expect((impliedM3PerTonne - publishedM3PerTonne) / publishedM3PerTonne).toBeGreaterThan(0.015)
    expect((impliedM3PerTonne - publishedM3PerTonne) / publishedM3PerTonne).toBeLessThan(0.017)
    // While the two rows the artefact does hold agree with Fuel properties to well under a percent.
    const impliedKwhPerM3 = m3 / gross
    const publishedKwhPerM3 = cellNumber('Fuel properties', 'E31') / publishedM3PerTonne / 0.0036
    expect(Math.abs(impliedKwhPerM3 - publishedKwhPerM3) / publishedKwhPerM3).toBeLessThan(0.005)
  })

  it('E10 the published TOTAL is what the reader exposes, and no total is derived from a gas split', () => {
    // ⚠️ ROUNDED PARTS DO NOT ADD TO A ROUNDED WHOLE, AND THE WHOLE IS THE ONE DEFRA PUBLISHES. On both
    // rows that carry a split, CO2 + CH4 + N2O comes to one hundred-thousandth more than the kg CO2e
    // column beside it, because every column is published to five decimal places. A reader that summed
    // the split to get a total would overstate the electricity T&D line by 0.077% and the heat and steam
    // distribution line by 0.106% on every inventory, invisibly.
    const recorded = DEFRA_ENERGY_META.gas_split_rounding
    const split = [...DEFRA_ENERGY_ELECTRICITY, ...DEFRA_ENERGY_HEAT_AND_STEAM].filter(r => r.gases)
    expect(split.map(r => r.key).sort())
      .toEqual(['district_heat_steam_distribution_loss', 'electricity_td_loss'])
    expect(Object.keys(recorded).sort()).toEqual(split.map(r => r.key).sort())

    for (const r of split) {
      const note = recorded[r.key]
      // The value the reader exposes IS the published total cell, not the sum of the parts.
      expect(r.kg_co2e, `${r.key} must price from the published total`).toBe(cellNumber(r.sheet, r.cells.kg_co2e))
      expect(r.kg_co2e, `${r.key} recorded total`).toBe(note.published_total)
      expect(r.cells.kg_co2e, `${r.key} total cell`).toBe(note.cells.total)
      // The parts, summed here for the check only, differ from it by the amount the artefact records.
      const sum = Number((r.gases!.co2 + r.gases!.ch4 + r.gases!.n2o).toFixed(5))
      expect(sum, `${r.key} split sum`).toBe(note.split_sum)
      expect(Number((sum - r.kg_co2e).toFixed(5)), `${r.key} difference`).toBe(note.difference)
      expect(sum, `${r.key}: the split must NOT be what the reader prices with`).not.toBe(r.kg_co2e)
      expect(note.difference_pct, `${r.key} difference in percent`)
        .toBeCloseTo((sum / r.kg_co2e - 1) * 100, 3)
    }
    // Recorded as a finding, with both rows named, and not corrected anywhere.
    expect(DEFRA_ENERGY_META.gas_split_rounding_note).toContain('0.01300 against 0.01299')
    expect(DEFRA_ENERGY_META.gas_split_rounding_note).toContain('0.00946 against 0.00945')

    // ⚠️ AND THE READER DOES NO ARITHMETIC ON A SPLIT. Read from its source, because a future helper
    // that "completed" a missing total from the parts would pass every other test in this file.
    const reader = readFileSync(join(__dirname, 'defraEnergy.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(reader, 'the reader adds gas components together').not.toMatch(/gases[^\n]*[+]/)
    expect(reader, 'the reader reduces or sums a split').not.toMatch(/\b(reduce|sum)\b/)
    expect(reader, 'the reader assigns kg_co2e from something').not.toMatch(/kg_co2e\s*[:=]\s*[^;\n]*[+*]/)
  })

  it('E9 the licence attribution is carried verbatim, as the other DEFRA artefacts carry it', () => {
    const waste = JSON.parse(readFileSync(join(ROOT, 'lib/emissionFactors/defraWaste2026.json'), 'utf8'))
    expect(DEFRA_ENERGY_META.attribution_required).toBe(waste.metadata.attribution_required)
    expect(DEFRA_ENERGY_META.licence).toBe(waste.metadata.licence)
    expect(DEFRA_ENERGY_META.source).toBe(waste.metadata.source)
  })
})

/** Key order does not change a record's meaning; the generator hashes with sorted keys, so do this. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort()
      .map(k => [k, sortDeep((value as Record<string, unknown>)[k])]))
  }
  return value
}
