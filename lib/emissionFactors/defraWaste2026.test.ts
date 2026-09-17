import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import data from './defraWaste2026.json'
import { defraCitation, DEFRA_DESNZ_PUBLICATION } from '../ghg/engine'

// defraWaste2026.json IS GENERATED FROM A COMMITTED WORKBOOK, NOT MAINTAINED. These tests pin that
// the rows are the generator's output, that the file cites the publication exactly as the GHG engine
// does, and that the unit the current Cat 5 error turns on is what the rows say it is.
//
// TO CHANGE THE DATA: run the generator, not an editor.
//   python3 scripts/generate-defra-waste.py

const ROWS_SHA256 = '5b3b7ee79e404acc6652ba0ebea5841160d6b2358aaa3095732d676a6e422473'

type Row = Record<string, unknown>
const factors = data.factors as Row[]
const meta = data.metadata as Row

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

describe('defraWaste2026.json', () => {
  it('W1 the rows match their pinned fingerprint', () => {
    const canonical = JSON.stringify(sortDeep({ factors }))
    const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
    expect(digest, 'defraWaste2026.json does not match its fingerprint. Regenerate it; do not edit it.').toBe(ROWS_SHA256)
    expect(meta.fingerprint_sha256).toBe(ROWS_SHA256)
  })

  it('W2 it cites the publication exactly as lib/ghg/engine.ts does, with the same edition label', () => {
    expect(meta.source).toBe(defraCitation(2026))
    expect(meta.title_as_published).toBe(DEFRA_DESNZ_PUBLICATION.title_as_published)
    expect(meta.edition).toBe('DEFRA 2026')
    for (const token of String(meta.edition).split(/\s+/)) expect(String(meta.source)).toContain(token)
    expect(meta).toMatchObject({ factor_set: 'Full set', file_version: '1', year: '2026', sheet: 'Waste disposal', gwp_basis: 'AR5' })
  })

  it('W6 the licence is recorded, and the attribution is the exact wording OGL v3.0 prescribes', () => {
    expect(meta.licence).toBe('Open Government Licence v3.0 (OGL v3.0)')
    expect(meta.licence_url).toBe('http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/')
    // Typed out here ON PURPOSE, once: this test is what pins the required string. Surfaces read the field.
    expect(meta.attribution_required).toBe('Contains public sector information licensed under the Open Government Licence v3.0.')
    expect(String(meta.licence_basis)).toMatch(/verified 17 Sep 2026/)
  })

  it('W3 every record is kg CO2e per tonne, and no empty cell became a zero', () => {
    expect(factors).toHaveLength(139)
    for (const f of factors) {
      expect(f.unit).toBe('kg CO2e per tonne')
      expect(typeof f.value).toBe('number')
      expect(f.value as number, `${f.waste_type} / ${f.route}`).toBeGreaterThan(0)
    }
    expect(factors.filter(f => f.route === 'Re-use'), 'Re-use publishes no values').toEqual([])
  })

  it('W4 the landfill factor for commercial and industrial waste is 520.58023 kg CO2e per tonne', () => {
    const cai = factors.filter(f => f.waste_type === 'Commercial and industrial waste' && f.route === 'Landfill')
    expect(cai).toEqual([{ activity: 'Refuse', waste_type: 'Commercial and industrial waste', route: 'Landfill', unit: 'kg CO2e per tonne', value: 520.58023 }])
    // The calculator's former EMISSION_FACTORS.waste_landfill was 0.467 "kg CO2e per tonne", about 1,115
    // times smaller than this figure. Pinned here as the published figure, not as a fix.
  })

  it('W5 seven blocks, one Activity per block, carried down to every row', () => {
    const blocks = meta.blocks as { activity: string; materials: number }[]
    expect(blocks.map(b => b.activity)).toEqual(['Construction', 'Other', 'Refuse', 'Electrical items', 'Metal', 'Plastic', 'Paper'])
    for (const f of factors) expect(blocks.map(b => b.activity)).toContain(f.activity)
    expect(meta.materials_with_no_routes).toEqual([])
  })
})
