import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EPA_2023 } from './epa-2023'
import { NGA_2023 } from './nga-2023'
import { MFE_2023 } from './mfe-2023'
import { MFE_TD_2026V2 } from './mfe-2026v2-td'
import { MFE_GRID_2026V2 } from './mfe-2026v2-grid'
import { AIB_2023 } from './aib-2023'
import { EEA_2023_REVISED } from './eea-2023'
import type { CitedValue, FactorCite } from './types'
import { EPA_MOBILE_2023 } from '../../emissionFactors/mobile/epa2023'
import { NGA_MOBILE_2023, NGA_MOBILE_ENERGY_CONTENT_2023 } from '../../emissionFactors/mobile/nga2023'
import { MFE_MOBILE_2023 } from '../../emissionFactors/mobile/mfe2023'
import { ngaScope3 } from '../../emissionFactors/ngaScope3_2025'
import { FACTOR_EDITION_REGISTRY } from '../factorEditionRegistry'
import {
  buildWorkings, calcInventory, emptyLocation, findUnresolvedCoverage, getGridFactor, getResidualFactor, gridRegionWords,
  GRID_EF, MissingEditionError, selectionFor, unpricedLines, type Location,
} from '../engine'
import { priceCat3 } from '../../scope3/cat3Energy'
import { cat3EditionsFor } from '../../scope3/cat3Editions'

// T3d (reporting year 2024), everything but DESNZ: US EPA Hub 2023, DCCEEW NGA 2023, MfE 2023, the MfE T&D 2023 row, AIB
// 2023, and Lisa's back-year rulings (8 Oct 2026): EEA data year 2023 revised and the MfE grid rows as printed. ECCC data
// year 2023 stays Table 5.3 as v4.0 prints it (ruling 3 reversed the same day). The build machine has no copy of ~/themisiq-sources; every spot value below was
// read from the cited cell or page when transcribed, and is pinned here.

const PREP = { preparedOn: new Date(2026, 9, 8) }
const L = (o: Partial<Location>) => ({ ...emptyLocation(String(o.id), String(o.name)), ...o }) as Location
const SITES: Location[] = [
  L({ id: 'uk', name: 'Leeds', country: 'GB', grid_region: 'UK', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh', has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' }),
  L({ id: 'ca1', name: 'Toronto GJ', country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'gj', has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' }),
  L({ id: 'ca2', name: 'Toronto m3', country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'm3' }),
  L({ id: 'us', name: 'Austin', country: 'US', state: 'TX', grid_region: 'US_TX', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf', has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'gallons' }),
  L({ id: 'au', name: 'Melbourne', country: 'AU', state: 'VIC', grid_region: 'AU_VIC', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'gj', has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' }),
  L({ id: 'nz', name: 'Auckland', country: 'NZ', grid_region: 'NZ', electricity_kwh: 10000, nz_td_losses: true, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh', has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' }),
  L({ id: 'de', name: 'Berlin', country: 'DE', grid_region: 'EU_DE', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 1000, natural_gas_unit: 'kwh', has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' }),
]
type Row = { location?: string; stream?: string; source?: string; scope?: number; scope2_method?: string; declaration?: string; result_tco2e: number | null;
  factor_edition?: string; selection_rule?: string; unpriced?: { reason: string }; ef_source?: string; note?: string }
const citeComplete = (c: FactorCite, label: string) => {
  for (const f of ['document', 'table', 'row', 'column', 'correction'] as const) expect(c[f], `${label}.${f}`).toBeTruthy()
  expect(c.cell || c.page, `${label}: a cell or a page`).toBeTruthy()
}

describe('T3d 2024: every value carries its citation', () => {
  it('the edition files: document, table, row, column, cell or page, and the correction it reflects', () => {
    const all: [string, CitedValue][] = [
      ...Object.entries(EPA_2023.combustion).flatMap(([k, g]) => [[`EPA ${k} co2`, g.co2], [`EPA ${k} ch4`, g.ch4], [`EPA ${k} n2o`, g.n2o]] as [string, CitedValue][]),
      ['EPA steam co2', EPA_2023.steam_mmbtu.co2],
      ...Object.entries(NGA_2023.grid).map(([k, v]) => [`NGA grid ${k}`, v] as [string, CitedValue]),
      ['NGA residual', NGA_2023.residual],
      ...Object.entries(NGA_2023.combustion).map(([k, v]) => [`NGA ${k}`, v] as [string, CitedValue]),
      ...(['commercial', 'industrial'] as const).flatMap(uc => Object.entries(MFE_2023.combustion[uc]).map(([k, v]) => [`MfE 2023 ${uc} ${k}`, v] as [string, CitedValue])),
      ...Object.entries(MFE_GRID_2026V2).map(([k, v]) => [`MfE grid ${k}`, v] as [string, CitedValue]),
      ['MfE T&D 2023', MFE_TD_2026V2[2023]],
      ...Object.entries(EEA_2023_REVISED).map(([k, v]) => [`EEA 2023 ${k}`, v] as [string, CitedValue]),
    ]
    for (const [label, v] of all) { citeComplete(v.cite, label); expect(Number.isFinite(v.value), label).toBe(true) }
    for (const [k, v] of Object.entries(AIB_2023)) citeComplete(v.cite, `AIB ${k}`)
    for (const m of [EPA_MOBILE_2023, NGA_MOBILE_2023, MFE_MOBILE_2023])
      for (const r of [...m.co2, ...m.rows]) expect(r.cite.cell || r.cite.page, `${m.publisher} ${m.edition}`).toBeTruthy()
    for (const c of Object.values(ngaScope3('2023')!.electricity)) expect(c.page, c.row).toBeGreaterThan(0)
    expect(all.length).toBeGreaterThan(70)
  })

  it('every revised back-year value names the value it supersedes and where that came from (rulings 1 and 2)', () => {
    for (const [k, v] of Object.entries(EEA_2023_REVISED)) expect(v.cite.correction, k).toMatch(/supersedes \d+ g CO2e\/kWh .* EEA-ghg-intensity-electricity-generation-country-level\.csv line \d+/)
    for (const y of [2023, 2024, 2025]) expect(MFE_GRID_2026V2[y].cite.correction, String(y)).toMatch(/held rounded as 0\.0\d+ until T3d 2024/)
  })
})

describe('T3d 2024: spot values, at least one per table per edition, as printed', () => {
  it('US EPA Hub 2023: Tables 1, 2, 3, 4, 5 and 7', () => {
    expect(EPA_2023.combustion.fuel_oil_distillate_gallon.co2.value).toBe(10.21)   // Table 1, H55
    expect([EPA_2023.steam_mmbtu.co2.value, EPA_2023.steam_mmbtu.ch4.value]).toEqual([66.33, 0.00125])   // Table 7
    expect(EPA_MOBILE_2023.co2.map(c => c.value)).toEqual([10.21, 8.78])   // Table 2
    expect(EPA_MOBILE_2023.rows.find(r => r.fuel === 'diesel' && r.vehicle === 'Passenger Cars' && r.detail === 'Model year 2007-2020')).toMatchObject({ ch4: 0.0302 })   // Table 4, F237
    expect(EPA_MOBILE_2023.rows.find(r => r.vehicle === 'Recreational Equipment' && r.detail === 'Gasoline (2 stroke)')).toMatchObject({ ch4: 17.61, n2o: 0.11 })   // Table 5, E312 (2024: 9.8)
    expect(EPA_MOBILE_2023.rows.filter(r => r.fuel === 'petrol' && r.type === 'light').every(r => (r.years?.to ?? 0) <= 2020)).toBe(true)   // Table 3 ends at 2020
  })

  it('DCCEEW NGA 2023: Tables 1, 2a, 5, 6, 8 and 9 (printed pages, one less than the PDF)', () => {
    expect([NGA_2023.grid.AU_NSW.value, NGA_2023.grid.AU_NSW.cite.page]).toEqual([0.68, '7'])
    expect([NGA_2023.residual.value, ngaScope3('2023')!.electricityResidualMix.value]).toEqual([0.81, 0.1])
    expect(NGA_2023.combustion.natural_gas_m3.value).toBe(2.025129)
    expect(NGA_MOBILE_ENERGY_CONTENT_2023.diesel.value).toBe(38.6)
    expect(NGA_MOBILE_2023.rows.find(r => r.type === 'heavy' && r.detail === 'Euro iv or higher')).toMatchObject({ ch4: 0.07, n2o: 0.4 })
    expect(ngaScope3('2023')!.naturalGas.TAS.metro.value).toBeNull()
  })

  it('MfE 2023 and the 2026 v2 series rows (T&D 2023; the grid rows as printed, ruling 2)', () => {
    expect(MFE_2023.combustion.commercial.diesel_litre).toMatchObject({ value: 2.689139697, cite: { cell: 'in!J34' } })
    expect(MFE_2023.combustion.industrial.fuel_oil_residual_litre.value).toBe(2.996972838)
    expect(MFE_MOBILE_2023.co2.find(c => c.fuel === 'diesel')!.value).toBe(2.67308657)
    expect([MFE_TD_2026V2[2023].value, MFE_TD_2026V2[2023].cite.cell]).toEqual([0.00573639, 'data!J1704'])
    expect([2023, 2024, 2025].map(y => [MFE_GRID_2026V2[y].value, MFE_GRID_2026V2[y].cite.cell])).toEqual([
      [0.0765687, 'data!J1600'], [0.0993596, 'data!J1604'], [0.0786625, 'data!J1608']])
    expect([2023, 2024, 2025].map(y => GRID_EF.NZ[y])).toEqual([0.0765687, 0.0993596, 0.0786625])
  })

  it('AIB 2023: Table 2 governs; Austria "N/A" is null (the sheet stores 0); the Netherlands is printed', () => {
    expect([AIB_2023.EU_DE.value, AIB_2023.EU_FR.value, AIB_2023.EU_EL.value, AIB_2023.EU_NL.value]).toEqual([719.9, 40.74, 491.78, 379.89])
    expect(AIB_2023.EU_AT).toMatchObject({ value: null, printed: 'N/A' })
    expect(getResidualFactor('EU_AT', selectionFor(2023, 12, PREP), 'AR6').applicable).toBe(false)
  })

  it('EEA data year 2023 revised (ruling 1): every member state replaced, each citing the value it supersedes', () => {
    expect([EEA_2023_REVISED.EU_DE.value, EEA_2023_REVISED.EU_EE.value, EEA_2023_REVISED.EU_EL.value]).toEqual([0.316, 0.543, 0.343])
    expect(EEA_2023_REVISED.EU_DE.cite.correction).toContain('supersedes 329 g CO2e/kWh')
    expect(Object.keys(EEA_2023_REVISED)).toHaveLength(27)
    for (const [k, v] of Object.entries(EEA_2023_REVISED)) expect(GRID_EF[k][2023], k).toBe(v.value)
    const e = FACTOR_EDITION_REGISTRY.find(x => x.dataset === 'eea_grid' && x.label === 'EEA 2023')!
    expect([e.heldCorrection, e.corrections[0].date, e.sourceFile]).toEqual(['2025-11-06', '2025-11-06', 'eea/EEA-ghg-intensity-electricity-generation-country-level-2024.csv'])
  })

  it('ECCC data year 2023 stays Table 5.3 as v4.0 prints it (ruling 3 reversed); the Annex 7 differences are a registry note only', () => {
    // v4.0 (9 Sep 2026, after NIR 2026) still prints Table 5.3 unchanged, PEI with footnote 41 (New Brunswick's value).
    expect([GRID_EF.AB[2023], GRID_EF.SK[2023], GRID_EF.NS[2023], GRID_EF.PE[2023], GRID_EF.ON[2023]]).toEqual([0.438, 0.631, 0.581, 0.234, 0.059])
    const e = FACTOR_EDITION_REGISTRY.find(x => x.dataset === 'eccc_grid' && x.label === 'ECCC Table 5.3 (NIR 1990-2023)')!
    expect([e.corrections, e.heldCorrection]).toEqual([[], undefined])
    for (const t of ['AB 434', 'SK 632', 'NS 614', "PEI 176 as PEI's own generation", 'did not adopt them', 'footnote 41', 'Preliminary data.'])
      expect(e.note, t).toContain(t)
    const basis = (buildWorkings([L({ id: 'pe', name: 'Charlottetown', country: 'CA', province: 'PE', grid_region: 'PE', electricity_kwh: 1000 })], 'AR6', 2023, [], 12, PREP) as Row[])
      .find(r => r.scope2_method === 'location-based')!
    expect([basis.factor_edition, basis.result_tco2e]).toEqual(['ECCC Table 5.3 (NIR 1990-2023)', 0.234])
  })
})

describe('T3d 2024: every reporting year 2024 case prices on the required edition', () => {
  const GRID: Record<number, Record<string, string>> = {
    12: { Leeds: 'DEFRA 2024', 'Toronto GJ': 'ECCC Table 5.4 (NIR 1990-2024)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2026 v2 (2024 row)', Berlin: 'EEA 2024' },
    3: { Leeds: 'DEFRA 2023', 'Toronto GJ': 'ECCC Table 5.3 (NIR 1990-2023)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2023', Auckland: 'MfE 2026 v2 (2023 row)', Berlin: 'EEA 2023' },
    6: { Leeds: 'DEFRA 2023', 'Toronto GJ': 'ECCC Table 5.3 (NIR 1990-2023)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2023', Auckland: 'MfE 2026 v2 (2023 row)', Berlin: 'EEA 2023' },
    9: { Leeds: 'DEFRA 2024', 'Toronto GJ': 'ECCC Table 5.4 (NIR 1990-2024)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2023', Auckland: 'MfE 2026 v2 (2024 row)', Berlin: 'EEA 2024' },
  }
  const GAS: Record<number, Record<string, string>> = {
    12: { Austin: 'US EPA 2024', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2024' },
    3: { Austin: 'US EPA 2023', Melbourne: 'DCCEEW NGA 2023', Auckland: 'MfE 2023' },
    6: { Austin: 'US EPA 2023', Melbourne: 'DCCEEW NGA 2023', Auckland: 'MfE 2023' },
    9: { Austin: 'US EPA 2024', Melbourne: 'DCCEEW NGA 2023', Auckland: 'MfE 2024' },
  }
  for (const m of [12, 3, 6, 9]) it(`year ending ${m === 12 ? 'December' : m === 3 ? 'March' : m === 6 ? 'June' : 'September'} 2024: every line priced, no edition_missing`, () => {
    const rows = buildWorkings(SITES, 'AR6', 2024, [], m, PREP) as Row[]
    expect(rows.filter(r => r.unpriced).map(r => `${r.location} ${r.source}`)).toEqual([])
    expect(findUnresolvedCoverage(SITES, 2024, m, [], PREP).filter(i => i.status === 'edition_missing' || i.status === 'factor_missing')).toEqual([])
    for (const [site, ed] of Object.entries(GRID[m]))
      expect(rows.find(r => r.location === site && r.scope2_method === 'location-based')!.factor_edition, `${site} grid`).toBe(ed)
    for (const [site, ed] of Object.entries(GAS[m]))
      expect(rows.find(r => r.location === site && r.stream === 'natural_gas' && !r.declaration)!.factor_edition, `${site} gas`).toBe(ed)
    for (const r of rows.filter(x => !x.declaration && ['US EPA 2023', 'DCCEEW NGA 2023', 'MfE 2023'].includes(x.factor_edition ?? '')))
      expect(r.ef_source, `${r.location} ${r.source}`).toMatch(/2023/)
  })

  it('golden Ontario 2024, prepared today: Table 5.4 and NIR 2026 (December), Table 5.3 and NIR 2025 (March)', () => {
    const golden = L({ id: 'g', name: 'Test Site', country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 120_000, natural_gas_unit: 'm3',
      has_mobile: true, fleet_light: true, light_diesel_amount: 5_000, light_diesel_unit: 'litres', has_hfc_refrigerants: true, refrigerant_type: 'r410a', refrigerant_purchased_kg: 12, electricity_kwh: 850_000 })
    const dec = calcInventory([golden], 'AR6', 2024, selectionFor(2024, 12, PREP))
    expect([dec.s1_total, dec.s2_location].map(v => Number(v.toFixed(6)))).toEqual([272.583844, 62.05])
    const mar = calcInventory([golden], 'AR6', 2024, selectionFor(2024, 3, PREP))
    expect([mar.s1_total, mar.s2_location].map(v => Number(v.toFixed(6)))).toEqual([272.583844, 50.15])
  })

  it('Category 3 for Australia, a year ending March 2024, prices on NGA 2023 Scope 3', () => {
    const inputs = { declaration: { undeclared: [] }, rows: [
      { id: 'r1', location: 'Sydney', country: 'AU', country_resolved: true, au_state: 'NSW', stream: 'electricity', activity: 1000, unit: 'kwh', scope2_method: 'location-based' },
    ] } as never
    const line = priceCat3(inputs, cat3EditionsFor(selectionFor(2024, 3, PREP))).lines[0]
    expect([line.factor!.kg_co2e, line.edition!.label, line.factor!.cell]).toEqual([0.05, 'DCCEEW NGA 2023', 'p. 7'])
  })
})

describe('T3d 2024: EU_AVG and plain-language region names', () => {
  it('EU_AVG holds no data year 2023 value (ruling 1): a window that takes it is an unpriced line, never zero', () => {
    expect(GRID_EF.EU_AVG).toEqual({})
    const l = L({ id: 'a', name: 'Brussels office', country: 'BE', grid_region: 'EU_AVG', electricity_kwh: 10000 })
    const sel = selectionFor(2023, 12, PREP)
    expect(() => getGridFactor('EU_AVG', sel)).toThrow(MissingEditionError)
    const u = unpricedLines(l, 'AR6', sel).filter(x => x.field === 'electricity_kwh')
    expect(u.map(x => x.message)).toContain('EEA 2023 grid electricity factors for the EU-27 average are needed for reporting year 2023 and are not loaded, so this line at Brussels office is not counted. Export is blocked until they are loaded.')
  })

  it('no edition_missing message prints a raw region key: every GRID_EF region has a name a person reads', () => {
    for (const k of Object.keys(GRID_EF)) {
      const w = gridRegionWords(k)
      expect(w, k).not.toBe('this grid region')
      expect(w.includes(k) || /\b[A-Z]{2,3}_[A-Z]+\b/.test(w), `${k}: "${w}"`).toBe(false)
    }
    // And the message itself, for every region whose window has no value.
    const msg = (() => { try { getGridFactor('EU_AVG', selectionFor(2025, 12, PREP)) } catch (e) { return (e as Error).message } return '' })()
    expect(msg).toContain('for the EU-27 average')
    expect(msg).not.toMatch(/EU_AVG|grid region [A-Z_]+/)
  })
})

describe('T3d 2024: the values CSV for review', () => {
  it('docs/review/t3d-2024-values.csv lists every 2024b value', () => {
    const csv = readFileSync(join(process.cwd(), 'docs/review/t3d-2024-values.csv'), 'utf8')
    const has = (ds: string, ed: string, key: string, v: unknown) => expect(csv, `${ds} ${ed} ${key}`).toContain(`${ds},${ed},${key},${v},`)
    for (const [k, g] of Object.entries(EPA_2023.combustion)) has('epa_hub_combustion', 'US EPA 2023', `${k}:co2`, g.co2.value)
    for (const [k, v] of Object.entries(NGA_2023.grid)) has('nga_grid', 'DCCEEW NGA 2023', k, v.value)
    for (const [k, v] of Object.entries(MFE_2023.combustion.commercial)) has('mfe_combustion', 'MfE 2023', `commercial:${k}`, v.value)
    for (const [k, v] of Object.entries(AIB_2023)) if (v.value !== null) has('aib', 'AIB 2023', k, v.value)
    for (const [k, v] of Object.entries(EEA_2023_REVISED)) has('eea_grid', 'EEA 2023 (revised)', k, v.value)
    for (const y of [2023, 2024, 2025]) has('mfe_grid', `MfE 2026 v2 (${y} row)`, `GRID_EF.NZ:${y}`, MFE_GRID_2026V2[y].value)
    has('mfe_td', 'MfE 2026 v2 (2023 row)', 'NZ_TD_LOSS:2023', 0.00573639)
  })
})
