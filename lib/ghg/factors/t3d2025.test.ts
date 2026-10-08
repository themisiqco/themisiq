import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EPA_2024 } from './epa-2024'
import { NGA_2024 } from './nga-2024'
import { MFE_2024 } from './mfe-2024'
import { MFE_2025 } from './mfe-2025'
import { MFE_TD_2026V2 } from './mfe-2026v2-td'
import { ECCC_TABLE_5_4, ECCC_NIR_2026_NG_HEAT } from './eccc-2026'
import { AIB_2025 } from './aib-2025'
import { EEA_2024 } from './eea-2024'
import type { CitedValue, FactorCite } from './types'
import { EPA_MOBILE_2024 } from '../../emissionFactors/mobile/epa2024'
import { NGA_MOBILE_2024, NGA_MOBILE_ENERGY_CONTENT_2024 } from '../../emissionFactors/mobile/nga2024'
import { MFE_MOBILE_2024 } from '../../emissionFactors/mobile/mfe2024'
import { MFE_MOBILE_2025 } from '../../emissionFactors/mobile/mfe2025'
import { ECCC_MOBILE_2026 } from '../../emissionFactors/mobile/eccc2026'
import { ECCC_MOBILE_2025 } from '../../emissionFactors/mobile/eccc2025'
import { ngaScope3 } from '../../emissionFactors/ngaScope3_2025'
import { buildWorkings, calcLocation, emptyLocation, findUnresolvedCoverage, getGridFactor, getResidualFactor, MissingEditionError, selectionFor, unpricedLines, type Location } from '../engine'
import { AIB_2024_NL } from './aib-2024'
import { inventoryFromDraft, inventoryRow } from '../freeCalc'
import { priceCat3 } from '../../scope3/cat3Energy'
import { cat3EditionsFor } from '../../scope3/cat3Editions'

// T3d (reporting year 2025), everything but DESNZ: US EPA Hub 2024, DCCEEW NGA 2024, MfE 2024 and 2025 v3 (and the MfE
// T&D 2024 row), ECCC v4.0 Table 5.4 and NIR 2026, AIB 2025 and EEA 2024. The build machine has no copy of
// ~/themisiq-sources; every spot value below was read from the cited cell or page when transcribed, and is pinned here.

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
  factor_edition?: string; unpriced?: { reason: string }; ef_source?: string; note?: string }

const citeComplete = (c: FactorCite, label: string) => {
  for (const f of ['document', 'table', 'row', 'column', 'correction'] as const) expect(c[f], `${label}.${f}`).toBeTruthy()
  expect(c.cell || c.page, `${label}: a cell or a page`).toBeTruthy()
}

describe('T3d 2025: every value carries its citation', () => {
  it('the edition files: document, table, row, column, cell or page, and the correction it reflects', () => {
    const all: [string, CitedValue][] = [
      ...Object.entries(EPA_2024.combustion).flatMap(([k, g]) => [[`EPA ${k} co2`, g.co2], [`EPA ${k} ch4`, g.ch4], [`EPA ${k} n2o`, g.n2o]] as [string, CitedValue][]),
      ['EPA steam co2', EPA_2024.steam_mmbtu.co2], ['EPA steam ch4', EPA_2024.steam_mmbtu.ch4], ['EPA steam n2o', EPA_2024.steam_mmbtu.n2o],
      ...Object.entries(NGA_2024.grid).map(([k, v]) => [`NGA grid ${k}`, v] as [string, CitedValue]),
      ['NGA residual', NGA_2024.residual],
      ...Object.entries(NGA_2024.combustion).map(([k, v]) => [`NGA ${k}`, v] as [string, CitedValue]),
      ...(['commercial', 'industrial'] as const).flatMap(uc => [
        ...Object.entries(MFE_2024.combustion[uc]).map(([k, v]) => [`MfE 2024 ${uc} ${k}`, v] as [string, CitedValue]),
        ...Object.entries(MFE_2025.combustion[uc]).map(([k, v]) => [`MfE 2025 ${uc} ${k}`, v] as [string, CitedValue])]),
      ...Object.entries(MFE_TD_2026V2).map(([k, v]) => [`MfE T&D ${k}`, v] as [string, CitedValue]),
      ...Object.entries(ECCC_TABLE_5_4).map(([k, v]) => [`ECCC ${k}`, v] as [string, CitedValue]),
      ['ECCC heat', ECCC_NIR_2026_NG_HEAT],
      ...Object.entries(EEA_2024).map(([k, v]) => [`EEA ${k}`, v] as [string, CitedValue]),
    ]
    for (const [label, v] of all) {
      citeComplete(v.cite, label)
      expect(Number.isFinite(v.value), label).toBe(true)
    }
    for (const [k, v] of Object.entries(AIB_2025)) citeComplete(v.cite, `AIB ${k}`)
    for (const m of [EPA_MOBILE_2024, NGA_MOBILE_2024, MFE_MOBILE_2024, MFE_MOBILE_2025, ECCC_MOBILE_2026])
      for (const r of [...m.co2, ...m.rows]) expect(r.cite.cell || r.cite.page, `${m.publisher} ${m.edition}`).toBeTruthy()
    for (const t of [ngaScope3('2024')!.electricity, ...Object.values(ngaScope3('2024')!.naturalGas)])
      for (const c of Object.values(t)) expect(typeof c.page === 'number' && c.table.length > 0, c.row).toBe(true)
    expect(all.length).toBeGreaterThan(100)
  })
})

describe('T3d 2025: spot values, at least one per table per edition, as printed', () => {
  it('US EPA Hub 2024: Tables 1, 2, 3, 4, 5 and 7', () => {
    expect(EPA_2024.combustion.propane_gallon.co2).toMatchObject({ value: 5.72, cite: { cell: 'Emission Factors Hub!H74' } })   // Table 1
    expect(EPA_2024.combustion.natural_gas_mcf.co2.value).toBe(54.44)   // 0.05444 per scf (H40) x 1,000
    expect([EPA_2024.steam_mmbtu.co2.value, EPA_2024.steam_mmbtu.ch4.value, EPA_2024.steam_mmbtu.ch4.cite.cell]).toEqual([66.33, 0.00125, 'Emission Factors Hub!E402'])   // Table 7
    expect(EPA_MOBILE_2024.co2.find(c => c.fuel === 'diesel')!.value).toBe(10.21)   // Table 2, D107
    // Table 3: the PDF prints 0.0051 (the cell holds 0.005049999...); the printed figure is the value.
    expect(EPA_MOBILE_2024.rows.find(r => r.vehicle === 'Gasoline Passenger Cars' && r.detail === 'Model year 2021')).toMatchObject({ ch4: 0.0051, n2o: 0.0014 })
    expect(EPA_MOBILE_2024.rows.find(r => r.fuel === 'diesel' && r.type === 'heavy' && r.detail === 'Model year 2007-2021')).toMatchObject({ ch4: 0.0095, n2o: 0.0431 })   // Table 4
    expect(EPA_MOBILE_2024.rows.find(r => r.vehicle === 'Agricultural Equipment' && r.detail === 'Gasoline (2 stroke)')).toMatchObject({ ch4: 6.92, n2o: 0.47 })   // Table 5 (2025: 6.90)
  })

  it('DCCEEW NGA 2024: Tables 1, 2, 5, 6, 8 and 9', () => {
    expect([NGA_2024.grid.AU_NSW.value, NGA_2024.grid.AU_TAS.value, NGA_2024.grid.AU_QLD.value]).toEqual([0.66, 0.15, 0.71])   // Table 1, pp. 8 to 9
    expect([NGA_2024.residual.value, NGA_2024.residual.cite.page]).toEqual([0.81, '9'])   // Table 2
    expect(NGA_2024.combustion.natural_gas_m3.value).toBe(2.025129)   // Table 5: 0.0393 GJ/m3 x 51.53
    expect(NGA_2024.combustion.diesel_litre).toMatchObject({ value: 2.70972, cite: { page: '21' } })   // Table 8: 38.6 x 70.20
    expect(NGA_MOBILE_ENERGY_CONTENT_2024.petrol.value).toBe(34.2)   // Table 9
    expect(NGA_MOBILE_2024.rows.find(r => r.type === 'heavy' && r.detail === 'Euro iv or higher')).toMatchObject({ ch4: 0.07, n2o: 0.4 })
    expect([ngaScope3('2024')!.electricity.NSW_ACT.value, ngaScope3('2024')!.naturalGas.NSW_ACT.non_metro.printed]).toEqual([0.04, '14.0'])   // Tables 1 and 6
  })

  it('MfE 2024, 2025 v3 and the 2026 v2 T&D series', () => {
    expect(MFE_2024.combustion.commercial.natural_gas_kwh).toMatchObject({ value: 0.19488931, cite: { cell: 'Emission Factors!J50' } })
    expect(MFE_2024.combustion.industrial.diesel_litre.value).toBe(2.671326212)
    expect(MFE_MOBILE_2024.co2.find(c => c.fuel === 'diesel')!.value).toBe(2.636169937)
    expect(MFE_2025.combustion.commercial.natural_gas_kwh).toMatchObject({ value: 0.1951479317, cite: { cell: 'data!O1379' } })
    expect(MFE_2025.combustion.commercial.fuel_oil_residual_litre.value).toBe(3.053591727)
    expect(MFE_MOBILE_2025.rows.find(r => r.fuel === 'petrol' && r.type === 'light')!.ch4).toBe(0.0303562842)
    // Lisa's rulings: the 2024 T&D row as an NZ_TD_LOSS key, and the 2025 row as printed, not the rounded 0.00596.
    expect([MFE_TD_2026V2[2024].value, MFE_TD_2026V2[2024].cite.cell]).toEqual([0.00752331, 'data!J1708'])
    expect([MFE_TD_2026V2[2025].value, MFE_TD_2026V2[2025].cite.cell]).toEqual([0.00595616, 'data!J1712'])
  })

  it('ECCC v4.0 Table 5.4 and NIR 2026 (Tables A6.1-15 and A4-2)', () => {
    expect([ECCC_TABLE_5_4.ON.value, ECCC_TABLE_5_4.PE.value, ECCC_TABLE_5_4.NB.value, ECCC_TABLE_5_4.QC.value]).toEqual([0.073, 0.265, 0.375, 0.0026])
    expect(ECCC_TABLE_5_4.ON.cite.page).toBe('17 (PDF page 21)')
    expect([ECCC_NIR_2026_NG_HEAT.value, ECCC_NIR_2026_NG_HEAT.cite.page]).toEqual([0.03852, '521 (PDF page 543)'])
    const hddv = ECCC_MOBILE_2026.rows.find(r => r.type === 'heavy' && r.fuel === 'diesel' && r.detail === 'Advanced Control')!
    expect([hddv.ch4, hddv.n2o, hddv.cite.page]).toEqual([0.11, 0.151, '541'])
    // Every NIR 2026 value equals NIR 2025's; only the edition and page differ.
    expect(ECCC_MOBILE_2026.rows.map(r => [r.fuel, r.type, r.detail, r.ch4, r.n2o])).toEqual(ECCC_MOBILE_2025.rows.map(r => [r.fuel, r.type, r.detail, r.ch4, r.n2o]))
  })

  it('AIB 2025: Residual Mixes column Q; Austria and the Netherlands print NA; Italy is the Table 2 figure', () => {
    expect([AIB_2025.EU_DE.value, AIB_2025.EU_FR.value, AIB_2025.EU_SE.value]).toEqual([701.47, 17.11, 208.56])
    expect(AIB_2025.EU_DE.cite.cell).toBe('Residual Mixes!Q9')
    expect([AIB_2025.EU_AT.value, AIB_2025.EU_NL.value]).toEqual([null, null])
    expect(AIB_2025.EU_IT.value).toBe(420.2)
    expect(AIB_2025.EU_IT.note).toContain('427.78')
  })

  it('EEA 2024: Romania 188, France 36 and Germany 291 (checked against the live chart by Lisa, 8 Oct 2026); no EU-27 value', () => {
    expect([EEA_2024.EU_RO.value, EEA_2024.EU_FR.value, EEA_2024.EU_DE.value]).toEqual([0.188, 0.036, 0.291])
    expect(Object.keys(EEA_2024)).toHaveLength(27)
    expect(EEA_2024.EU_AVG, 'the "#N/A" row is EU-27 and is not loaded').toBeUndefined()
    const src = readFileSync(join(__dirname, 'eea-2024.ts'), 'utf8')
    expect(src).toContain('1 - 183/501 = 63.5%, 1 - 183/206 = 11.2%')
  })
})

describe('T3d 2025: every reporting year 2025 case prices on the required edition', () => {
  const EDITIONS: Record<number, Record<string, string>> = {
    12: { Leeds: 'DEFRA 2025', 'Toronto GJ': 'ECCC Table 5.4 (NIR 1990-2024)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2025', Auckland: 'MfE 2026 v2 (2025 row)', Berlin: 'EEA 2024' },
    3: { Leeds: 'DEFRA 2024', 'Toronto GJ': 'ECCC Table 5.4 (NIR 1990-2024)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2026 v2 (2024 row)', Berlin: 'EEA 2024' },
    6: { Leeds: 'DEFRA 2025', 'Toronto GJ': 'ECCC Table 5.4 (NIR 1990-2024)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2026 v2 (2024 row)', Berlin: 'EEA 2024' },
    9: { Leeds: 'DEFRA 2025', 'Toronto GJ': 'ECCC Table 5.4 (NIR 1990-2024)', Austin: 'eGRID2023', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2026 v2 (2025 row)', Berlin: 'EEA 2024' },
  }
  const GAS: Record<number, Record<string, string>> = {
    12: { Austin: 'US EPA 2025', Melbourne: 'DCCEEW NGA 2025', Auckland: 'MfE 2025 v3' },
    3: { Austin: 'US EPA 2024', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2024' },
    6: { Austin: 'US EPA 2024', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2024' },
    9: { Austin: 'US EPA 2025', Melbourne: 'DCCEEW NGA 2024', Auckland: 'MfE 2025 v3' },
  }
  for (const m of [12, 3, 6, 9]) it(`year ending ${m === 12 ? 'December' : m === 3 ? 'March' : m === 6 ? 'June' : 'September'} 2025: every line priced, no edition_missing`, () => {
    const rows = buildWorkings(SITES, 'AR6', 2025, [], m, PREP) as Row[]
    expect(rows.filter(r => r.unpriced).map(r => `${r.location} ${r.source}`)).toEqual([])
    expect(findUnresolvedCoverage(SITES, 2025, m, [], PREP).filter(i => i.status === 'edition_missing' || i.status === 'factor_missing')).toEqual([])
    for (const [site, ed] of Object.entries(EDITIONS[m]))
      expect(rows.find(r => r.location === site && r.scope2_method === 'location-based')!.factor_edition, `${site} grid`).toBe(ed)
    for (const [site, ed] of Object.entries(GAS[m]))
      expect(rows.find(r => r.location === site && r.stream === 'natural_gas' && !r.declaration)!.factor_edition, `${site} gas`).toBe(ed)
    // Every priced row cites the edition that priced it, never a newer document beside it.
    for (const r of rows.filter(x => !x.declaration && x.factor_edition === 'US EPA 2024')) expect(r.ef_source, `${r.location} ${r.source}`).toMatch(/2024/)
    for (const r of rows.filter(x => !x.declaration && x.factor_edition === 'DCCEEW NGA 2024')) expect(r.ef_source, `${r.location} ${r.source}`).toMatch(/NGA 2024/)
  })

  it('the free calculator at its default year (2025) blocks no line in any of these countries', () => {
    const inv = inventoryFromDraft({ company_name: 'T3d', locations: SITES } as never, 'x', PREP.preparedOn)
    expect(inv.reporting_year).toBe(2025)
    const row = inventoryRow(inv, 'u', 'c', true, PREP.preparedOn) as { workings: Row[] }
    expect(row.workings.filter(r => r.unpriced)).toEqual([])
  })

  it('Category 3 for Australia prices on NGA 2024 Scope 3 for a year ending March 2025', () => {
    const inputs = { declaration: { undeclared: [] }, rows: [
      { id: 'r1', location: 'Sydney', country: 'AU', country_resolved: true, au_state: 'NSW', stream: 'electricity', activity: 1000, unit: 'kwh', scope2_method: 'location-based' },
    ] } as never
    const line = priceCat3(inputs, cat3EditionsFor(selectionFor(2025, 3, PREP))).lines[0]
    expect([line.factor!.kg_co2e, line.edition!.label, line.factor!.cell]).toEqual([0.04, 'DCCEEW NGA 2024', 'p. 8'])
    expect(line.note).toContain('NGA 2024, Table 1, Scope 3')
  })
})

describe('T3d 2025: the values CSV for review', () => {
  it('docs/review/t3d-2025-values.csv lists every value in the 2025b edition files', () => {
    const csv = readFileSync(join(process.cwd(), 'docs/review/t3d-2025-values.csv'), 'utf8')
    const has = (ds: string, ed: string, key: string, v: unknown) => expect(csv, `${ds} ${ed} ${key}`).toContain(`${ds},${ed},${key},${v},`)
    for (const [k, g] of Object.entries(EPA_2024.combustion)) has('epa_hub_combustion', 'US EPA 2024', `${k}:co2`, g.co2.value)
    for (const [k, v] of Object.entries(NGA_2024.grid)) has('nga_grid', 'DCCEEW NGA 2024', k, v.value)
    for (const [k, v] of Object.entries(MFE_2025.combustion.industrial)) has('mfe_combustion', 'MfE 2025 v3', `industrial:${k}`, v.value)
    for (const [k, v] of Object.entries(ECCC_TABLE_5_4)) has('eccc_grid', 'ECCC Table 5.4 (NIR 1990-2024)', k, v.value)
    for (const [k, v] of Object.entries(EEA_2024)) has('eea_grid', 'EEA 2024', k, v.value)
    for (const [k, v] of Object.entries(AIB_2025)) if (v.value !== null) has('aib', 'AIB 2025', k, v.value)
    has('mfe_td', 'MfE 2026 v2 (2024 row)', 'NZ_TD_LOSS:2024', 0.00752331)
  })
})

describe('T3d 2025: what still does not price, and why', () => {
  it('an Australian heavy petrol line on NGA 2024 has no NGA row: R16\'s IPCC 2006 fallback prices CH4 and N2O, and the row says so', () => {
    const au = L({ id: 'au', name: 'Perth depot', country: 'AU', state: 'WA', grid_region: 'AU_WA', has_mobile: true, fleet_heavy: true, heavy_petrol_amount: 100, heavy_petrol_unit: 'litres' })
    expect(unpricedLines(au, 'AR6', selectionFor(2025, 3, PREP))).toEqual([])
    const row = (buildWorkings([au], 'AR6', 2025, [], 3, PREP) as Row[]).find(r => r.source === 'Petrol (heavy vehicles)' && !r.declaration)!
    expect(row.factor_edition).toBe('DCCEEW NGA 2024')
    expect(row.note).toContain('IPCC 2006 default for CH4 and N2O; DCCEEW National Greenhouse Accounts Factors publishes no road factor for petrol.')
    // On NGA 2025 (a December 2025 window) the Determination's row prices it, as before T3d.
    const r25 = (buildWorkings([au], 'AR6', 2025, [], 12, PREP) as Row[]).find(r => r.source === 'Petrol (heavy vehicles)' && !r.declaration)!
    expect(r25.note).not.toContain('IPCC 2006 default')
  })

  it('a stored EU_AVG grid region with no edition for the window follows the unpriced-line rule, never an uncaught error', () => {
    // EU_AVG holds EEA 2023 only: the EU-27 row of EEA 2024 is not loaded (ruling, 8 Oct 2026). No screen offers EU_AVG; a
    // stored one must still be excluded from the totals, never zero, with an export-blocking edition_missing issue.
    const l = L({ id: 'a', name: 'Brussels office', country: 'BE', grid_region: 'EU_AVG', electricity_kwh: 10000 })
    const sel = selectionFor(2025, 12, PREP)
    expect(() => getGridFactor('EU_AVG', sel)).toThrow(MissingEditionError)
    const msg = 'EEA 2024 grid electricity factors for grid region EU_AVG are needed for reporting year 2025 and are not loaded, so this line at Brussels office is not counted. Export is blocked until they are loaded.'
    const rows = (buildWorkings([l], 'AR6', 2025, [], 12, PREP) as Row[]).filter(r => r.stream === 'electricity')
    expect(rows.map(r => [r.scope2_method, r.declaration, r.result_tco2e, r.unpriced?.reason, r.note])).toEqual([
      ['location-based', 'unpriced', null, 'edition_missing', `NOT PRICED: ${msg}`],
      ['market-based', 'unpriced', null, 'edition_missing', `NOT PRICED: ${msg}`]])
    const c = calcLocation(l, 'AR6', 2025, sel)
    expect([c.s2_location, c.s2_market]).toEqual([0, 0])
    expect(findUnresolvedCoverage([l], 2025, 12, [], PREP).map(i => [i.status, i.field, i.message])).toEqual([['edition_missing', 'electricity_kwh', msg]])
    // On EEA 2023 (a 2023 window), EU_AVG still prices on its EU-27 value, as before.
    expect(getGridFactor('EU_AVG', selectionFor(2023, 12, PREP)).ef).toBe(0.21)
  })

  it('AIB 2024 Netherlands is null (Table 2 and Residual Mixes!Q27 print NA; full disclosure), not the CO2 sheet\'s 382.47', () => {
    expect(AIB_2024_NL).toMatchObject({ value: null, printed: 'NA', cite: { cell: 'Residual Mixes!Q27', page: 'PDF Table 2, p. 8; full disclosure, p. 1' } })
    const r = getResidualFactor('EU_NL', selectionFor(2024, 12, PREP), 'AR6')
    expect([r.applicable, r.ef, r.vintage]).toEqual([false, 0, 'AIB 2024'])
    expect(r.note).toContain('Full-disclosure regime')
    // The market-based row falls back to the location-based factor (EEA 2024 for the Netherlands, 0.245), and says so.
    const nl = L({ id: 'nl', name: 'Rotterdam', country: 'NL', grid_region: 'EU_NL', electricity_kwh: 10000 })
    const c = calcLocation(nl, 'AR6', 2024, selectionFor(2024, 12, PREP))
    expect(c.s2_market).toBeCloseTo(c.s2_location, 12)
    expect(c.s2_location).toBeCloseTo(10000 * 0.245 / 1000, 12)
  })

  it('EEA_2024 is joined to GRID_EF for every member state, and the EU-27 average has no 2024 value', () => {
    for (const k of Object.keys(EEA_2024)) expect(getGridFactor(k, selectionFor(2025, 12, PREP)).ef, k).toBe(EEA_2024[k].value)
  })
})
