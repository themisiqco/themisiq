import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESNZ_2024 } from './desnz-2024'
import { DESNZ_2025 } from './desnz-2025'
import { DEFRA_MOBILE_2024 } from '../../emissionFactors/mobile/defra2024'
import { DEFRA_MOBILE_2025 } from '../../emissionFactors/mobile/defra2025'
import { DEFRA_ENERGY_BY_EDITION, energyFactor } from '../../emissionFactors/defraEnergy'
import { FACTOR_EDITION_REGISTRY } from '../factorEditionRegistry'
import { buildWorkings, emptyLocation, findUnresolvedCoverage, type Location } from '../engine'
import { buildFactorEditions } from '../factorEditions'
import { priceCat3 } from '../../scope3/cat3Energy'
import { cat3EditionsFor } from '../../scope3/cat3Editions'
import { cat3MethodSentences, cat3WorkingsSummary, cat3Basis } from '../../scope3/cat3Copy'
import { selectionFor } from '../engine'
import type { CitedValue } from './types'

// T3d (reporting year 2025), DESNZ: the 2024 and 2025 editions, transcribed cell by cell from the full sets the registry
// names. The build machine has no copy of ~/themisiq-sources, so the spot values below were checked against the
// workbooks when transcribed and are pinned here; docs/review/t3d-2025-values.csv lists every value for review.

const EDITIONS = [DESNZ_2024, DESNZ_2025] as const
const values = (f: typeof EDITIONS[number]): [string, CitedValue][] =>
  [...Object.entries(f.combustion), ['steam_kwh', f.steam_kwh], ['grid_uk', f.grid_uk]]

describe('T3d DESNZ 2024 and 2025', () => {
  it('every value carries its citation: document, sheet, row, column, cell and the correction it reflects', () => {
    let n = 0
    for (const f of EDITIONS) for (const [k, v] of values(f)) {
      const c = v.cite
      for (const field of ['document', 'table', 'row', 'column', 'cell', 'correction'] as const)
        expect(c[field], `${f.edition} ${k}.${field}`).toBeTruthy()
      expect(c.cell, `${f.edition} ${k}`).toMatch(/^[A-Za-z ]+![A-Z]+\d+$/)
      expect(Number.isFinite(v.value) && v.value > 0, `${f.edition} ${k}`).toBe(true)
      n++
    }
    for (const m of [DEFRA_MOBILE_2024, DEFRA_MOBILE_2025]) {
      for (const c of m.co2) expect(c.cite.cell, `${m.edition} ${c.fuel}`).toMatch(/^Fuels!E\d+$/)
      for (const r of m.rows) expect(r.cite.cell, `${m.edition} ${r.fuel} ${r.type}`).toMatch(/^Fuels!F\d+, Fuels!G\d+$/)
      n += m.co2.length + m.rows.length
    }
    for (const y of [2024, 2025]) {
      const a = DEFRA_ENERGY_BY_EDITION[y]
      for (const r of [...a.fuels, ...a.electricity, ...a.heat_and_steam]) {
        expect(r.sheet && r.cells.kg_co2e, `DEFRA ${y} ${r.key}`).toBeTruthy()
        n++
      }
    }
    expect(n).toBeGreaterThan(50)
  })

  it('spot values, one or more per table per edition, as printed in each workbook', () => {
    // Fuels sheet.
    expect([DESNZ_2024.combustion.natural_gas_kwh.value, DESNZ_2024.combustion.natural_gas_kwh.cite.cell]).toEqual([0.1829, 'Fuels!D42'])
    expect([DESNZ_2025.combustion.natural_gas_kwh.value, DESNZ_2025.combustion.natural_gas_kwh.cite.cell]).toEqual([0.18296, 'Fuels!D42'])
    expect([DESNZ_2024.combustion.diesel_litre.value, DESNZ_2025.combustion.diesel_litre.value]).toEqual([2.51279, 2.57082])
    expect(DESNZ_2024.combustion.fuel_oil_residual_litre.value, '2024 prints 3.17493; 2025 and 2026 print 3.17492').toBe(3.17493)
    expect(DESNZ_2024.combustion.propane_kg).toMatchObject({ value: 2.99763233, cite: { cell: 'Fuels!D51' } })
    // UK electricity sheet: the 2024 row is 25, the 2025 row 26.
    expect([DESNZ_2024.grid_uk.value, DESNZ_2024.grid_uk.cite.cell]).toEqual([0.20705, 'UK electricity!E25'])
    expect([DESNZ_2025.grid_uk.value, DESNZ_2025.grid_uk.cite.cell]).toEqual([0.177, 'UK electricity!E26'])
    // Heat and steam sheet.
    expect([DESNZ_2024.steam_kwh.value, DESNZ_2025.steam_kwh.value]).toEqual([0.17965, 0.17529])
    // Fuels rows as the mobile files split them.
    expect(DEFRA_MOBILE_2024.co2.map(c => c.value)).toEqual([2.4796, 2.07047])
    expect(DEFRA_MOBILE_2025.co2.map(c => c.value)).toEqual([2.53763, 2.05523])
    expect(DEFRA_MOBILE_2024.rows.find(r => r.fuel === 'diesel')).toMatchObject({ ch4: 0.00029, n2o: 0.0329 })
    // Upstream energy: WTT- UK electricity and Transmission and distribution.
    expect([energyFactor('electricity_td_loss', 2024)!.kg_co2e, energyFactor('electricity_td_loss', 2025)!.kg_co2e]).toEqual([0.0183, 0.01853])
    expect([energyFactor('electricity_generation_wtt', 2024)!.kg_co2e, energyFactor('electricity_generation_wtt', 2025)!.kg_co2e]).toEqual([0.0459, 0.0459])
    // DEFRA prints the same WTT fuel factors in 2024, 2025 and 2026 (checked in each workbook, WTT- fuels!D41 and D71).
    for (const y of [2024, 2025, 2026]) expect(energyFactor('natural_gas_kwh_gross_cv', y)!.kg_co2e, String(y)).toBe(0.03021)
  })

  it('the 2024 values are the 30 Oct 2024 correction (v1.1), recorded in the registry and on every value', () => {
    for (const [k, v] of values(DESNZ_2024)) expect(v.cite.correction, k).toContain('30 Oct 2024')
    expect(DESNZ_2024.sourceFile).toContain('v1_1')
    expect(DEFRA_ENERGY_BY_EDITION[2024].metadata.file_version).toBe('1.1')
    for (const e of FACTOR_EDITION_REGISTRY.filter(x => x.label === 'DEFRA 2024' && x.held))
      expect(e.heldCorrection, e.dataset).toBe('2024-10-30')
  })

  it('every edition marked held has a recorded publication date', () => {
    for (const e of FACTOR_EDITION_REGISTRY.filter(x => x.held && x.class !== 'exempt'))
      expect(e.published.date ?? e.published.onOrBefore?.date, `${e.dataset} ${e.label}`).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
  })

  it('a UK reporting year 2025 prices at every year end, on the edition the DESNZ rule requires, with no edition_missing', () => {
    const PREP = { preparedOn: new Date(2026, 9, 8) }
    const site = {
      ...emptyLocation('uk', 'Leeds'), country: 'GB', grid_region: 'UK', electricity_kwh: 10_000,
      has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh',
      has_purchased_steam: true, purchased_steam_mmbtu: 500, purchased_steam_unit: 'kwh',
      has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres',
    } as Location
    for (const [m, want] of [[12, 'DEFRA 2025'], [3, 'DEFRA 2024'], [6, 'DEFRA 2025'], [9, 'DEFRA 2025']] as const) {
      const rows = buildWorkings([site], 'AR6', 2025, [], m, PREP) as { stream?: string; source?: string; declaration?: string; result_tco2e: number | null; factor_edition?: string; unpriced?: unknown }[]
      const priced = rows.filter(r => !r.declaration && r.factor_edition)
      expect(priced.map(r => r.factor_edition), `year end ${m}`).toEqual(priced.map(() => want))
      expect(priced.map(r => r.stream).sort(), `year end ${m}`).toEqual(['electricity', 'electricity', 'mobile', 'natural_gas', 'purchased_steam'])
      expect(rows.filter(r => r.unpriced), `year end ${m}`).toEqual([])
      expect(findUnresolvedCoverage([site], 2025, m, [], PREP).filter(i => i.status === 'edition_missing'), `year end ${m}`).toEqual([])
      // Category 3 takes the same DESNZ edition.
      const eds = cat3EditionsFor(selectionFor(2025, m, PREP))
      expect('held' in eds.defra && eds.defra.held.label, `year end ${m}`).toBe(want)
    }
  })

  it('a row priced on DEFRA 2024 or 2025 cites that edition, never the 2026 document', () => {
    const PREP = { preparedOn: new Date(2026, 9, 8) }
    const site = { ...emptyLocation('uk', 'Leeds'), country: 'GB', grid_region: 'UK', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh',
      has_purchased_steam: true, purchased_steam_mmbtu: 500, purchased_steam_unit: 'kwh' } as Location
    for (const [m, y] of [[3, 2024], [12, 2025]] as const) {
      const rows = buildWorkings([site], 'AR6', 2025, [], m, PREP) as { stream?: string; declaration?: string; ef_source?: string; result_tco2e: number | null }[]
      for (const r of rows.filter(x => !x.declaration && (x.stream === 'natural_gas' || x.stream === 'purchased_steam'))) {
        expect(r.ef_source, `${r.stream} ${m}`).toContain(`(${y})`)
        expect(r.ef_source, `${r.stream} ${m}`).not.toContain('(2026)')
      }
      const gas = rows.find(x => x.stream === 'natural_gas' && !x.declaration)!
      expect(gas.result_tco2e).toBeCloseTo(1000 * (y === 2024 ? 0.1829 : 0.18296) / 1000, 12)
    }
  })

  it('the row note says where the selected edition prints the value, never the 2026 cell', () => {
    const PREP = { preparedOn: new Date(2026, 9, 8) }
    const site = { ...emptyLocation('uk', 'Leeds'), country: 'GB', grid_region: 'UK', has_propane: true, propane_amount: 100, propane_unit: 'kg' } as Location
    const note = (m: number) => (buildWorkings([site], 'AR6', 2025, [], m, PREP) as { stream?: string; declaration?: string; note?: string }[])
      .find(r => r.stream === 'propane' && !r.declaration)!.note!
    expect(note(3)).toContain('DEFRA 2024, Fuels sheet, Propane, tonnes (Fuels!D51): 2.99763233 kg CO2e/kg; per tonne / 1,000, exact: 2997.63233 kg CO2e per tonne')
    expect(note(3)).not.toContain('1_100_1007_15_1')
    expect(note(12)).toContain('DEFRA 2025, Fuels sheet, Propane, tonnes (Fuels!D51)')
  })

  it('factor_editions names the selected DEFRA edition and its own citation for steam', () => {
    const PREP = { preparedOn: new Date(2026, 9, 8) }
    const site = { ...emptyLocation('uk', 'Leeds'), country: 'GB', grid_region: 'UK', has_purchased_steam: true, purchased_steam_mmbtu: 500, purchased_steam_unit: 'kwh' } as Location
    const e = buildFactorEditions([site], 2025, 3, PREP).UK!.steam!
    expect(e.edition).toBe('DEFRA 2024')
    expect(e.source).toContain('(2024)')
  })

  it('Category 3 prices on the selected DEFRA edition: the 2024 T&D factor for a year ending March 2025', () => {
    const PREP = { preparedOn: new Date(2026, 9, 8) }
    const inputs = { declaration: { undeclared: [] }, rows: [
      { id: 'r1', location: 'Leeds', country: 'GB', country_resolved: true, stream: 'electricity', activity: 1000, unit: 'kwh', scope2_method: 'location-based' },
    ] } as never
    const td = (m: number) => priceCat3(inputs, cat3EditionsFor(selectionFor(2025, m, PREP))).lines.find(l => l.line === 'electricity_td_loss')!
    expect([td(3).factor!.kg_co2e, td(3).edition!.label]).toEqual([0.0183, 'DEFRA 2024'])
    expect([td(12).factor!.kg_co2e, td(12).edition!.label]).toEqual([0.01853, 'DEFRA 2025'])
    // The sentences beside the lines name the same edition, never the newest one.
    const r = priceCat3(inputs, cat3EditionsFor(selectionFor(2025, 3, PREP)))
    expect(r.meta.edition).toBe('DEFRA 2024')
    expect(cat3MethodSentences(r, '')[0]).toContain('factor edition DEFRA 2024')
    expect(cat3WorkingsSummary(r)).toContain('DEFRA/DESNZ 2024 upstream energy factors')
    expect(cat3Basis(r, { inputs: null, skipped: [] } as never, null).basis).toContain('(2024)')
  })

  it('the values CSV lists every DESNZ value with its cell', () => {
    const csv = readFileSync(join(process.cwd(), 'docs/review/t3d-2025-values.csv'), 'utf8')
    for (const f of EDITIONS) for (const [k, v] of values(f))
      expect(csv, `${f.edition} ${k}`).toContain(`${f.edition},${k},${v.value},`)
  })
})
