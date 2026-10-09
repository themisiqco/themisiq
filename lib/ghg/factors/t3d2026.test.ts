import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NGA_2026 } from './nga-2026'
import type { FactorCite } from './types'
import { NGA_MOBILE_2026, NGA_MOBILE_ENERGY_CONTENT_2026 } from '../../emissionFactors/mobile/nga2026'
import { ngaScope3 } from '../../emissionFactors/ngaScope3_2025'
import { DATASETS, FACTOR_EDITION_REGISTRY, NOT_YET_PUBLISHED } from '../factorEditionRegistry'
import { buildWorkings, calcInventory, emptyLocation, findUnresolvedCoverage, selectionFor, type Location } from '../engine'
import { priceCat3 } from '../../scope3/cat3Energy'
import { cat3EditionsFor } from '../../scope3/cat3Editions'
import { defaultReportingYear } from '../../reportingYears'

// T3d (reporting year 2026): DCCEEW NGA 2026, the editions not yet published (EPA Hub 2026, eGRID2024, Green-e 2026,
// checked 8 Oct 2026), and the T3d Done check across reporting years 2024 to 2026. Lisa's rulings (8 Oct 2026): DESNZ
// travel and waste stay unloaded until T3e; a provisional steam row carries the R19 sentence in its note. The build
// machine has no copy of ~/themisiq-sources; every spot value below was read from the cited cell when transcribed.

const PREP = { preparedOn: new Date(2026, 9, 8) }
const L = (o: Partial<Location>) => ({ ...emptyLocation(String(o.id), String(o.name)), ...o }) as Location
const STEAM: Partial<Location> = { has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'gj' }
const FLEET: Partial<Location> = { has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' }
const SITES: Location[] = [
  L({ id: 'uk', name: 'Leeds', country: 'GB', grid_region: 'UK', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh', ...FLEET, ...STEAM }),
  L({ id: 'ca', name: 'Toronto', country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3', ...FLEET, ...STEAM }),
  L({ id: 'us', name: 'Austin', country: 'US', state: 'TX', grid_region: 'US_TX', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf', ...FLEET, light_diesel_unit: 'gallons', ...STEAM }),
  L({ id: 'au', name: 'Melbourne', country: 'AU', state: 'VIC', grid_region: 'AU_VIC', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'gj', ...FLEET, ...STEAM }),
  L({ id: 'nz', name: 'Auckland', country: 'NZ', grid_region: 'NZ', electricity_kwh: 10000, nz_td_losses: true, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh', ...FLEET, ...STEAM }),
  L({ id: 'de', name: 'Berlin', country: 'DE', grid_region: 'EU_DE', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh', ...FLEET, ...STEAM }),
]
type Row = { location?: string; stream?: string; source?: string; scope2_method?: string; declaration?: string; result_tco2e: number | null; provisional?: boolean
  factor_edition?: string; selection_rule?: string; selection_basis?: string; unpriced?: { reason: string }; note?: string }
const R19 = 'have not been published yet'
const ENDS = [12, 3, 6, 9] as const
const blocked = (y: number, m: number) => [
  ...(buildWorkings(SITES, 'AR6', y, [], m, PREP) as Row[]).filter(r => r.unpriced).map(r => `${r.location} ${r.source} ${r.unpriced!.reason}`),
  ...findUnresolvedCoverage(SITES, y, m, [], PREP).filter(i => i.status === 'edition_missing' || i.status === 'factor_missing').map(i => i.status),
]
const citeComplete = (c: FactorCite, label: string) => {
  for (const f of ['document', 'table', 'row', 'column', 'correction'] as const) expect(c[f], `${label}.${f}`).toBeTruthy()
  expect(c.cell || c.page, `${label}: a cell or a page`).toBeTruthy()
}

describe('T3d 2026: DCCEEW NGA 2026, every value cited', () => {
  it('the edition files: document, table, row, column, cell or page, and the correction it reflects', () => {
    for (const [k, v] of Object.entries(NGA_2026.grid)) citeComplete(v.cite, `grid.${k}`)
    citeComplete(NGA_2026.residual.cite, 'residual')
    for (const [k, v] of Object.entries(NGA_2026.combustion)) citeComplete(v.cite, `combustion.${k}`)
    for (const [k, v] of Object.entries(NGA_MOBILE_ENERGY_CONTENT_2026)) expect(v.cite.cell, `energy content ${k}`).toBeTruthy()
    // The pre-2004 rows are printed in the PDF only (p. 29), so they cite a page and no cell.
    for (const r of NGA_MOBILE_2026.rows) expect(r.cite.cell || r.cite.page, `${r.type} ${r.fuel} ${r.detail}`).toBeTruthy()
  })

  it('spot values, at least one per table, as printed (no workbook and PDF disagreement)', () => {
    expect([NGA_2026.grid.AU_NSW.value, NGA_2026.grid.AU_NSW.cite.cell, NGA_2026.grid.AU_NSW.cite.page]).toEqual([0.6, "'Table 1'!B4", '10'])
    expect([NGA_2026.grid.AU_VIC.value, NGA_2026.grid.AU_TAS.value]).toEqual([0.74, 0.21])
    expect([NGA_2026.residual.value, NGA_2026.residual.cite.cell, NGA_2026.residual.cite.page]).toEqual([0.79, "'Table 2'!B4", '11'])
    expect([NGA_2026.combustion.natural_gas_gj.value, NGA_2026.combustion.natural_gas_m3.value]).toEqual([51.53, 2.025129])
    expect([NGA_2026.combustion.diesel_litre.value, NGA_2026.combustion.diesel_litre.cite.cell]).toEqual([2.70972, "'Energy - Scope 1 '!I48"])
    expect([NGA_MOBILE_ENERGY_CONTENT_2026.petrol.value, NGA_MOBILE_ENERGY_CONTENT_2026.diesel.value]).toEqual([34.2, 38.6])
    expect(NGA_MOBILE_2026.rows.find(r => r.type === 'light' && r.fuel === 'diesel' && r.detail === 'manufactured 2004 or later')).toMatchObject({ ch4: 0.01, n2o: 0.5 })
    const s3 = ngaScope3('2026')!
    expect([s3.electricity.NSW_ACT.value, s3.electricityResidualMix.value, s3.naturalGas.VIC.metro.value]).toEqual([0.07, 0.11, 4])
  })

  it('prints no heavy-duty petrol row: recorded absent, so heavy petrol falls back under R16, never to another edition', () => {
    expect(NGA_MOBILE_2026.absent).toEqual([{ type: 'heavy', fuel: 'petrol', said: null }])
    expect(NGA_MOBILE_2026.rows.filter(r => r.type === 'heavy' && r.fuel === 'petrol')).toEqual([])
  })

  it('Category 3 for Australia, calendar 2026, prices on NGA 2026 Scope 3 with the 2026 note pages', () => {
    const inputs = { declaration: { undeclared: [] }, rows: [
      { id: 'r1', location: 'Sydney', country: 'AU', country_resolved: true, au_state: 'NSW', stream: 'electricity', activity: 1000, unit: 'kwh', scope2_method: 'location-based' },
    ] } as never
    const line = priceCat3(inputs, cat3EditionsFor(selectionFor(2026, 12, PREP))).lines[0]
    expect([line.factor!.kg_co2e, line.edition!.label]).toEqual([0.07, 'DCCEEW NGA 2026'])
  })
})

describe('T3d 2026: the registry', () => {
  it('every held edition selection reads by date records its publication date', () => {
    // A printed date, or R20's earliest proven date with its evidence; never neither.
    for (const e of FACTOR_EDITION_REGISTRY.filter(x => x.held && x.class !== 'exempt'))
      expect(e.published.date ?? e.published.onOrBefore?.date, `${e.dataset} ${e.label}`).toMatch(/^\d{4}-\d{2}(-\d{2})?$/)
    // The exempt editions are fixed references, never selected by date; they record where they are printed, and no date
    // is written for them that the record does not hold.
    const undated = FACTOR_EDITION_REGISTRY.filter(x => x.held && !(x.published.date ?? x.published.onOrBefore?.date))
    expect(undated.map(e => [e.label, e.class])).toEqual([['IPCC 2006', 'exempt'], ['JEC Well-to-Tank v5', 'exempt'], ['EXIOBASE 3.8.2 (2019 prices)', 'exempt']])
    for (const e of undated) expect(e.published.source, e.label).toBeTruthy()
    for (const ds of ['nga_grid', 'nga_residual', 'nga_combustion', 'nga_mobile', 'nga_scope3'])
      expect(FACTOR_EDITION_REGISTRY.find(x => x.dataset === ds && x.label === 'DCCEEW NGA 2026'), ds).toMatchObject({ held: true, published: { date: '2026-08' } })
  })

  it('every edition a 2026 year end needs and that is not yet published is recorded, with the page checked and the date', () => {
    expect(NOT_YET_PUBLISHED.map(n => n.edition)).toEqual(['US EPA 2026', 'eGRID2024', 'Green-e 2026'])
    for (const n of NOT_YET_PUBLISHED) {
      expect(n.checked.date, n.edition).toBe('2026-10-08')
      expect(n.checked.source, n.edition).toMatch(/^https:\/\//)
      for (const ds of n.dataset) expect(DATASETS, `${n.edition} ${ds}`).toHaveProperty(ds)
      for (const ds of n.dataset) expect(FACTOR_EDITION_REGISTRY.some(x => x.dataset === ds && x.label === n.edition), `${n.edition} is not registered`).toBe(false)
    }
  })

  it('desnz_travel and desnz_waste: the T3e requirement is met (DEFRA 2023, 2024 and 2025 held) and its note removed', () => {
    for (const ds of ['desnz_travel', 'desnz_waste'] as const) {
      expect(DATASETS[ds].note, ds).not.toContain('T3e MUST LOAD')
      expect(FACTOR_EDITION_REGISTRY.filter(e => e.dataset === ds && e.held).map(e => e.label), ds).toEqual(['DEFRA 2023', 'DEFRA 2024', 'DEFRA 2025', 'DEFRA 2026'])
    }
  })
})

describe('T3d 2026: every reporting year 2026 case prices or is provisional', () => {
  const PROVISIONAL: Record<number, string[]> = {
    12: ['Austin|Natural gas|US EPA 2025', 'Austin|Diesel (light vehicles)|US EPA 2025', 'Austin|Purchased steam|US EPA 2025 Table 7'],
    3: [], 6: [],
    9: ['Austin|Natural gas|US EPA 2025', 'Austin|Diesel (light vehicles)|US EPA 2025', 'Austin|Purchased steam|US EPA 2025 Table 7'],
  }
  const WANT: Record<number, Record<string, [string, string]>> = {
    12: { GB: ['DEFRA 2026', 'DEFRA 2026'], CA: ['ECCC 2025 v3.0', 'ECCC Table 5.4 (NIR 1990-2024)'], US: ['US EPA 2025', 'eGRID2023'], AU: ['DCCEEW NGA 2026', 'DCCEEW NGA 2026'], NZ: ['MfE 2026 v2', 'MfE 2026 v2 (2025 row)'], DE: ['IPCC 2006', 'EEA 2024'] },
    3: { GB: ['DEFRA 2025', 'DEFRA 2025'], CA: ['ECCC 2025 v3.0', 'ECCC Table 5.4 (NIR 1990-2024)'], US: ['US EPA 2025', 'eGRID2023'], AU: ['DCCEEW NGA 2025', 'DCCEEW NGA 2025'], NZ: ['MfE 2025 v3', 'MfE 2026 v2 (2025 row)'], DE: ['IPCC 2006', 'EEA 2024'] },
    6: { GB: ['DEFRA 2026', 'DEFRA 2026'], CA: ['ECCC 2025 v3.0', 'ECCC Table 5.4 (NIR 1990-2024)'], US: ['US EPA 2025', 'eGRID2023'], AU: ['DCCEEW NGA 2025', 'DCCEEW NGA 2025'], NZ: ['MfE 2025 v3', 'MfE 2026 v2 (2025 row)'], DE: ['IPCC 2006', 'EEA 2024'] },
    9: { GB: ['DEFRA 2026', 'DEFRA 2026'], CA: ['ECCC 2025 v3.0', 'ECCC Table 5.4 (NIR 1990-2024)'], US: ['US EPA 2025', 'eGRID2023'], AU: ['DCCEEW NGA 2025', 'DCCEEW NGA 2025'], NZ: ['MfE 2026 v2', 'MfE 2026 v2 (2025 row)'], DE: ['IPCC 2006', 'EEA 2024'] },
  }
  for (const m of ENDS) it(`year ending month ${m}, 2026: no edition_missing; gas and grid on the required edition; only the listed lines provisional`, () => {
    expect(blocked(2026, m)).toEqual([])
    const rows = buildWorkings(SITES, 'AR6', 2026, [], m, PREP) as Row[]
    expect(rows.filter(r => !r.declaration && r.provisional).map(r => `${r.location}|${r.source}|${r.factor_edition}`)).toEqual(PROVISIONAL[m])
    for (const s of SITES) {
      const gas = rows.find(r => r.location === s.name && r.stream === 'natural_gas' && !r.declaration)!
      const grid = rows.find(r => r.location === s.name && r.scope2_method === 'location-based')!
      expect([gas.factor_edition, grid.factor_edition], `${s.country} ${m}`).toEqual(WANT[m][s.country!])
    }
  })

  it('the T3d Done check: reporting years 2024, 2025 and 2026 at every year end have no edition_missing line', () => {
    for (const y of [2024, 2025, 2026]) for (const m of ENDS) expect(blocked(y, m), `${y} month ${m}`).toEqual([])
    for (const y of [2024, 2025]) for (const m of ENDS)
      expect((buildWorkings(SITES, 'AR6', y, [], m, PREP) as Row[]).filter(r => r.provisional).map(r => r.source), `${y} month ${m}`).toEqual([])
  })

  it('R19 on every family: every provisional row carries the R19 sentence in its note, as in its selection basis (2024 to 2027)', () => {
    const families = new Set<string>()
    for (const y of [2024, 2025, 2026, 2027]) for (const m of ENDS) for (const r of buildWorkings(SITES, 'AR6', y, [], m, PREP) as Row[]) {
      if (!r.provisional) continue
      families.add(`${r.stream}${r.scope2_method ? ` ${r.scope2_method}` : ''}`)
      expect(r.selection_basis, `${y}-${m} ${r.location} ${r.source}`).toContain(R19)
      expect(r.note, `${y}-${m} ${r.location} ${r.source}`).toContain(r.selection_basis)
    }
    // The property is only worth something if every family reaches it: 2027 makes UK, US, AU and NZ provisional.
    expect([...families].sort()).toEqual(['electricity location-based', 'electricity market-based', 'mobile', 'natural_gas', 'purchased_steam location-based'])
  })

  it('golden Ontario 2026, prepared today: the same at every year end (ECCC 2025 v3.0, Table 5.4)', () => {
    const golden = L({ id: 'g', name: 'Test Site', country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 120_000, natural_gas_unit: 'm3',
      has_mobile: true, fleet_light: true, light_diesel_amount: 5_000, light_diesel_unit: 'litres', has_hfc_refrigerants: true, refrigerant_type: 'r410a', refrigerant_purchased_kg: 12, electricity_kwh: 850_000 })
    for (const m of ENDS) {
      const t = calcInventory([golden], 'AR6', 2026, selectionFor(2026, m, PREP))
      expect([t.s1_total, t.s2_location, t.s1_total + t.s2_location].map(v => Number(v.toFixed(6))), `month ${m}`).toEqual([272.583844, 62.05, 334.633844])
    }
  })

  it('the free calculator: its default year (2025) has no blocked line; at 2026 only US lines are provisional', () => {
    const year = defaultReportingYear(PREP.preparedOn)
    expect(year).toBe(2025)
    expect(blocked(year, 12)).toEqual([])
    expect((buildWorkings(SITES, 'AR6', year, [], 12, PREP) as Row[]).filter(r => r.provisional)).toEqual([])
    const prov = (buildWorkings(SITES, 'AR6', 2026, [], 12, PREP) as Row[]).filter(r => r.provisional)
    expect(prov.length).toBeGreaterThan(0)
    expect([...new Set(prov.map(r => r.location))]).toEqual(['Austin'])
  })
})

describe('T3d 2026: the values CSV for review', () => {
  it('docs/review/t3d-2026-values.csv lists every NGA 2026 value', () => {
    const csv = readFileSync(join(process.cwd(), 'docs/review/t3d-2026-values.csv'), 'utf8')
    const has = (ds: string, key: string, v: unknown) => expect(csv, `${ds} ${key}`).toContain(`${ds},DCCEEW NGA 2026,${key},${v},`)
    for (const [k, v] of Object.entries(NGA_2026.grid)) has('nga_grid', k, v.value)
    has('nga_residual', 'RESIDUAL_AU', NGA_2026.residual.value)
    for (const [k, v] of Object.entries(NGA_2026.combustion)) has('nga_combustion', k, v.value)
    for (const [k, v] of Object.entries(NGA_MOBILE_ENERGY_CONTENT_2026)) has('nga_mobile', `${k}:energy_content`, v.value)
    for (const [k, v] of Object.entries(ngaScope3('2026')!.electricity)) has('nga_scope3', `electricity:${k}`, v.value)
  })
})
