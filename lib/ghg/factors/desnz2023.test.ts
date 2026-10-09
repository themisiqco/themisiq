import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DESNZ_2023 } from './desnz-2023'
import { DEFRA_MOBILE_2023 } from '../../emissionFactors/mobile/defra2023'
import { DEFRA_ENERGY_BY_EDITION, energyFactor } from '../../emissionFactors/defraEnergy'
import { FACTOR_EDITION_REGISTRY } from '../factorEditionRegistry'
import { buildWorkings, emptyLocation, findUnresolvedCoverage, selectionFor, type Location } from '../engine'
import { priceCat3 } from '../../scope3/cat3Energy'
import { cat3EditionsFor } from '../../scope3/cat3Editions'
import type { CitedValue } from './types'

// T3d (reporting year 2024), DESNZ: the 2023 edition, transcribed cell by cell from the v1.1 full set the registry names.
// ⚠️ The 2023 workbook stores its totals unrounded (desnz-2023.ts header); these pins are the stored cell values.

const PREP = { preparedOn: new Date(2026, 9, 8) }
const values: [string, CitedValue][] = [...Object.entries(DESNZ_2023.combustion), ['steam_kwh', DESNZ_2023.steam_kwh], ['grid_uk', DESNZ_2023.grid_uk]]

describe('T3d DESNZ 2023', () => {
  it('every value carries its citation, and reflects the 28 Jun 2023 update (v1.1)', () => {
    for (const [k, v] of values) {
      for (const f of ['document', 'table', 'row', 'column', 'cell', 'correction'] as const) expect(v.cite[f], `${k}.${f}`).toBeTruthy()
      expect(v.cite.correction, k).toContain('28 Jun 2023')
    }
    for (const r of [...DEFRA_MOBILE_2023.co2, ...DEFRA_MOBILE_2023.rows]) expect(r.cite.cell).toMatch(/^Fuels!/)
    for (const r of [...DEFRA_ENERGY_BY_EDITION[2023].fuels, ...DEFRA_ENERGY_BY_EDITION[2023].electricity]) expect(r.cells.kg_co2e, r.key).toBeTruthy()
    expect(DEFRA_ENERGY_BY_EDITION[2023].metadata.file_version).toBe('1.1')
    for (const e of FACTOR_EDITION_REGISTRY.filter(x => x.label === 'DEFRA 2023' && x.held)) expect(e.heldCorrection, e.dataset).toBe('2023-06-28')
    expect(FACTOR_EDITION_REGISTRY.filter(x => x.label === 'DEFRA 2023' && x.held).map(x => x.dataset).sort())
      .toEqual(['desnz_combustion', 'desnz_grid', 'desnz_mobile', 'desnz_scope3_energy', 'desnz_steam', 'desnz_travel', 'desnz_waste'])
  })

  it('spot values, one or more per table, as stored in the 2023 workbook', () => {
    expect([DESNZ_2023.combustion.natural_gas_kwh.value, DESNZ_2023.combustion.natural_gas_kwh.cite.cell]).toEqual([0.18292892617449666, 'Fuels!D42'])
    expect(DESNZ_2023.combustion.diesel_litre.value).toBe(2.5120638845637586)
    expect(DESNZ_2023.combustion.propane_kg.value).toBe(2.99763233422819)   // Fuels!D51 per tonne / 1,000, at 15 significant figures
    expect([DESNZ_2023.grid_uk.value, DESNZ_2023.grid_uk.cite.cell]).toEqual([0.20707428859060403, 'UK electricity!E24'])
    expect([DESNZ_2023.steam_kwh.value, DESNZ_2023.steam_kwh.cite.cell]).toEqual([0.17964657181208055, 'Heat and steam!E22'])
    expect(DEFRA_MOBILE_2023.co2.map(c => c.value)).toEqual([2.47887, 2.08354])
    expect([energyFactor('electricity_td_loss', 2023)!.kg_co2e, energyFactor('natural_gas_kwh_gross_cv', 2023)!.kg_co2e]).toEqual([0.017915111409395973, 0.03021])
  })

  it('a UK reporting year 2024 prices at every year end on the edition the DESNZ rule requires, with no edition_missing', () => {
    const site = { ...emptyLocation('uk', 'Leeds'), country: 'GB', grid_region: 'UK', electricity_kwh: 10_000,
      has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh',
      has_purchased_steam: true, purchased_steam_mmbtu: 500, purchased_steam_unit: 'kwh',
      has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' } as Location
    for (const [m, want] of [[12, 'DEFRA 2024'], [3, 'DEFRA 2023'], [6, 'DEFRA 2023'], [9, 'DEFRA 2024']] as const) {
      const rows = buildWorkings([site], 'AR6', 2024, [], m, PREP) as { declaration?: string; factor_edition?: string; unpriced?: unknown; stream?: string; ef_source?: string }[]
      const priced = rows.filter(r => !r.declaration && r.factor_edition)
      expect(priced.map(r => r.factor_edition), `year end ${m}`).toEqual(priced.map(() => want))
      expect(rows.filter(r => r.unpriced), `year end ${m}`).toEqual([])
      expect(findUnresolvedCoverage([site], 2024, m, [], PREP).filter(i => i.status === 'edition_missing'), `year end ${m}`).toEqual([])
      const eds = cat3EditionsFor(selectionFor(2024, m, PREP))
      expect('held' in eds.defra && eds.defra.held.label, `year end ${m}`).toBe(want)
      if (want === 'DEFRA 2023') for (const r of priced.filter(x => x.stream !== 'electricity')) expect(r.ef_source, `${r.stream} ${m}`).toContain('(2023)')
    }
  })

  it('Category 3 for a UK year ending March 2024 prices on the DEFRA 2023 T&D factor', () => {
    const inputs = { declaration: { undeclared: [] }, rows: [
      { id: 'r1', location: 'Leeds', country: 'GB', country_resolved: true, stream: 'electricity', activity: 1000, unit: 'kwh', scope2_method: 'location-based' },
    ] } as never
    const r = priceCat3(inputs, cat3EditionsFor(selectionFor(2024, 3, PREP)))
    const td = r.lines.find(l => l.line === 'electricity_td_loss')!
    expect([td.factor!.kg_co2e, td.edition!.label, r.meta.edition]).toEqual([0.017915111409395973, 'DEFRA 2023', 'DEFRA 2023'])
  })

  it('the 2024 values CSV lists every DESNZ 2023 value with its cell', () => {
    const csv = readFileSync(join(process.cwd(), 'docs/review/t3d-2024-values.csv'), 'utf8')
    for (const [k, v] of values) expect(csv, k).toContain(`DEFRA 2023,${k},${v.value},`)
  })
})
