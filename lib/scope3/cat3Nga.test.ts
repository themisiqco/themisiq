import { describe, it, expect } from 'vitest'
import { priceCat3, NGA_TAS_NT_GAS_INSTRUCTION, type Cat3InputRow, type Cat3Result } from './cat3Energy'
import { cat3InputsFrom } from './cat3Inputs'
import { cat3UnpricedText, cat3GhgFixes, cat3MethodSentences, CAT3_NGA_SENTENCE, cat3LineText } from './cat3Copy'
import { buildWorkings, emptyLocation, type Location } from '../ghg/engine'
import { CAT3_EDS } from '../testing/heldSelection'

// ── FI6 DIFF 2 (ruling R15): AUSTRALIAN CATEGORY 3 GAS AND ELECTRICITY FROM NGA 2025 SCOPE 3, BY STATE ──
//
// Expected figures are typed out from NGA 2025 (national-greenhouse-account-factors-2025.pdf), not read from
// lib/emissionFactors/ngaScope3_2025.ts, so the module and the test cannot agree by reading one table:
//   Table 1 Scope 3 (kg CO2-e/kWh, p. 8 to 9): NSW and ACT 0.03, VIC 0.09, QLD 0.09, SA 0.04, WA SWIS 0.06,
//     TAS 0.03, NT DKIS 0.09
//   Table 6 (kg CO2-e/GJ, p. 19), Metro / Non-metro: NSW and ACT 13.1 / 14.0, VIC 4.0 / 4.0, QLD 8.8 / 7.9,
//     SA 10.7 / 10.6, WA 4.1 / 4.0, TAS and NT "C"
//   Table 5 (p. 18): natural gas distributed in a pipeline, 0.0393 GJ/m3

const AREA_MESSAGE = (site: string) =>
  `The upstream natural gas figure for ${site} depends on whether the site is in a metro gas area, so it is not ` +
  'counted yet. Choose Metro or Non-metro for this site.'

const row = (over: Partial<Cat3InputRow> & Pick<Cat3InputRow, 'id' | 'stream' | 'activity' | 'unit'>): Cat3InputRow => ({
  location: 'Site', country: 'AU', country_resolved: true, entry_method: 'manual', ...over,
})
const price = (rows: Cat3InputRow[]): Cat3Result => priceCat3({ rows, declaration: { undeclared: [] } }, CAT3_EDS)

// Every stream answered, so nothing withholds the category for being unanswered.
const STREAMS = ['natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
  'mobile', 'refrigerants', 'electricity', 'purchased_steam'] as const
const site = (over: Partial<Location>, used: readonly string[]): Location => ({
  ...emptyLocation('l1', String(over.name ?? 'Site')), country: 'AU', ...over,
  stream_attestations: STREAMS.filter(s => !used.includes(s))
    .map(stream => ({ stream, attested_at: '2026-01-01T00:00:00Z' })) as Location['stream_attestations'],
})
const throughInventory = (locations: Location[]) => {
  // T3c: 2025, the activity year NGA 2025 (held) covers; calendar 2026 needs NGA 2026, not loaded until T3d.
  const workings = buildWorkings(locations, 'AR6', 2025, [], 12)
  const inputs = cat3InputsFrom(workings, locations)
  return { workings, inputs, result: priceCat3(inputs.inputs!, CAT3_EDS) }
}

describe('FI6: Australian electricity, NGA Table 1 Scope 3', () => {
  it('VIC 10,000 kWh: one line, 900 kg CO2-e, cites NGA Table 1, no T&D line, no stand-in', () => {
    const { result } = throughInventory([site({ state: 'VIC', grid_region: 'AU_VIC', electricity_kwh: 10_000 }, ['electricity'])])
    const elec = result.lines.filter(l => l.stream === 'electricity')
    expect(elec).toHaveLength(1)
    const l = elec[0]
    expect(l.line).toBe('electricity_nga_scope3')
    expect(l.kg_co2e).toBeCloseTo(900, 9)
    expect(l.factor).toMatchObject({ kg_co2e: 0.09, unit: 'kWh', sheet: 'NGA 2025 Table 1', cell: 'C5' })
    expect(l.note).toBe('NGA 2025, Table 1, Scope 3, Victoria: 0.09 kg CO2-e/kWh. This factor includes electricity lost ' +
      'in the grid, so there is no separate transmission and distribution line.')
    expect(result.lines.some(x => x.line === 'electricity_td_loss' || x.line === 'electricity_td_wtt')).toBe(false)
    expect(l.flags).toEqual([])
  })

  it('each state uses its own row: WA is SWIS, the NT is DKIS, the ACT is NSW and ACT', () => {
    const cases: [string, number, string][] = [
      ['NSW', 0.03, 'New South Wales and Australian Capital Territory'], ['ACT', 0.03, 'New South Wales and Australian Capital Territory'],
      ['VIC', 0.09, 'Victoria'], ['QLD', 0.09, 'Queensland'], ['SA', 0.04, 'South Australia'],
      ['WA', 0.06, 'Western Australia - South West Interconnected System (SWIS)'], ['TAS', 0.03, 'Tasmania'],
      ['NT', 0.09, 'Northern territory - Darwin Katherine Interconnected System (DKIS)'],
    ]
    for (const [state, f, rowName] of cases) {
      const r = price([row({ id: state, stream: 'electricity', activity: 1_000, unit: 'kWh', au_state: state, scope2_method: 'location-based' })])
      expect(r.lines, state).toHaveLength(1)
      expect(r.lines[0].factor!.kg_co2e, state).toBe(f)
      expect(r.lines[0].note, state).toContain(`Table 1, Scope 3, ${rowName}:`)
    }
    const wa = price([row({ id: 'wa', stream: 'electricity', activity: 1, unit: 'kWh', au_state: 'WA' })]).lines[0].note!
    expect(wa).toContain('Western Australia uses the South West Interconnected System (SWIS) row, the grid the Scope 2 factor for this site uses.')
    const nt = price([row({ id: 'nt', stream: 'electricity', activity: 1, unit: 'kWh', au_state: 'NT' })]).lines[0].note!
    expect(nt).toContain('The Northern Territory uses the Darwin Katherine Interconnected System (DKIS) row, the grid the Scope 2 factor for this site uses.')
  })
})

describe('FI6: Australian natural gas, NGA Table 6 by state and area (R15)', () => {
  it('NSW 1,000 GJ: metro 13,100 kg, non-metro 14,000 kg', () => {
    const metro = price([row({ id: 'm', stream: 'natural_gas', activity: 1_000, unit: 'GJ', au_state: 'NSW', au_gas_area: 'metro' })])
    const non = price([row({ id: 'n', stream: 'natural_gas', activity: 1_000, unit: 'GJ', au_state: 'NSW', au_gas_area: 'non_metro' })])
    expect(metro.lines[0].kg_co2e).toBeCloseTo(13_100, 9)
    expect(non.lines[0].kg_co2e).toBeCloseTo(14_000, 9)
    expect(metro.lines[0].note).toBe("NGA 2025, Table 6, New South Wales and ACT, Metro: 13.1 kg CO2-e/GJ. NGA's Scope 3 gas " +
      'factors exclude leakage from low-pressure distribution pipelines (p. 20).')
    expect(non.lines[0].note).toMatch(/^NGA 2025, Table 6, New South Wales and ACT, Non-metro: 14\.0 kg CO2-e\/GJ\./)
    expect(metro.lines[0].note).toContain("NGA's Scope 3 gas factors exclude leakage from low-pressure distribution pipelines (p. 20).")
    expect(metro.lines[0].flags).toEqual([])
  })

  it('QLD non-metro 10,000 m3 through the inventory: 393 GJ x 7.9 = 3,104.7 kg, conversion stated', () => {
    const { result } = throughInventory([site({ state: 'QLD', grid_region: 'AU_QLD', au_gas_area: 'non_metro',
      has_natural_gas: true, natural_gas_amount: 10_000, natural_gas_unit: 'm3' }, ['natural_gas'])])
    const l = result.lines.find(x => x.stream === 'natural_gas')!
    expect(l.activity_priced).toBeCloseTo(393, 9)
    expect(l.unit_priced).toBe('GJ')
    expect(l.kg_co2e).toBeCloseTo(3_104.7, 9)
    expect(l.conversion).toMatchObject({ factor: 0.0393, from: 'm3', to: 'GJ', source: 'nga' })
    // The conversion is stated once, by the line's own arithmetic, not again in the NGA note.
    expect(l.note).toBe("NGA 2025, Table 6, Queensland, Non-metro: 7.9 kg CO2-e/GJ. NGA's Scope 3 gas factors exclude " +
      'leakage from low-pressure distribution pipelines (p. 20).')
    const text = cat3LineText(l)
    expect(text).toContain('converted to GJ at 0.0393 (NGA 2025 Table 5, natural gas distributed in a pipeline, 0.0393 GJ/m3')
    expect(text).toContain('= 393 GJ')
    expect(text.split('converted to GJ').length - 1, 'the conversion appears once on the row').toBe(1)
    expect(l.flags).toEqual([])
    expect(text).toContain('3,104.70 kg CO2e')
  })

  it('TAS uses Victoria non-metro and the NT Western Australia non-metro, 100 GJ = 400 kg, quoting NGA; neither is asked', () => {
    for (const [state, name] of [['TAS', 'Victoria'], ['NT', 'Western Australia']] as const) {
      const r = price([row({ id: state, stream: 'natural_gas', activity: 100, unit: 'GJ', au_state: state })])
      expect(r.unpriced, state).toEqual([])
      expect(r.lines[0].kg_co2e, state).toBeCloseTo(400, 9)
      expect(r.lines[0].note, state).toContain(`Table 6, ${name}, Non-metro: 4.0 kg CO2-e/GJ.`)
      expect(r.lines[0].note, state).toContain(`"${NGA_TAS_NT_GAS_INSTRUCTION}" (Table 6 notes, p. 20)`)
    }
    expect(NGA_TAS_NT_GAS_INSTRUCTION).toBe('It is suggested that for Tasmania the use of the Victorian emission factors ' +
      'is appropriate, while for Northern Territory the use of the Western Australian emission factors is appropriate.')
  })

  it('VIC is never asked; NSW, ACT, QLD, SA and WA with no area withhold the gas line with the exact message', () => {
    const vic = price([row({ id: 'v', stream: 'natural_gas', activity: 100, unit: 'GJ', au_state: 'VIC' })])
    expect(vic.unpriced).toEqual([])
    expect(vic.lines[0].kg_co2e).toBeCloseTo(400, 9)
    for (const state of ['NSW', 'ACT', 'QLD', 'SA', 'WA']) {
      const r = price([row({ id: state, stream: 'natural_gas', activity: 100, unit: 'GJ', au_state: state, location: `Plant ${state}` })])
      expect(r.lines, state).toEqual([])
      expect(r.unpriced[0].reason, state).toEqual({ code: 'au_gas_area_missing', location: `Plant ${state}` })
      expect(cat3UnpricedText(r.unpriced[0]), state).toBe(AREA_MESSAGE(`Plant ${state}`))
      expect(cat3GhgFixes(r, { inputs: null, reason: null, skipped: [], unresolved_locations: [], undeclared_detail: [] }), state).toEqual(['auGasArea'])
    }
  })

  it('Scope 1 gas is still priced when the area is not chosen', () => {
    const { workings, result } = throughInventory([site({ name: 'Brisbane', state: 'QLD', grid_region: 'AU_QLD',
      has_natural_gas: true, natural_gas_amount: 10_000, natural_gas_unit: 'm3' }, ['natural_gas'])])
    const s1 = workings.filter(w => w.scope === 1 && w.stream === 'natural_gas' && w.declaration === undefined)
    expect(s1).toHaveLength(1)
    expect(s1[0].result_tco2e).toBeGreaterThan(0)
    expect(result.unpriced.map(u => u.reason.code)).toEqual(['au_gas_area_missing'])
    expect(cat3UnpricedText(result.unpriced[0])).toBe(AREA_MESSAGE('Brisbane'))
  })
})

describe('FI6: no state, and the streams NGA does not price here', () => {
  it('no state: gas and electricity withheld with the state reason, never priced at the National row', () => {
    const r = price([
      row({ id: 'e', stream: 'electricity', activity: 1_000, unit: 'kWh', au_state: null }),
      row({ id: 'g', stream: 'natural_gas', activity: 100, unit: 'GJ', au_state: null, au_gas_area: 'metro' }),
    ])
    expect(r.lines).toEqual([])
    expect(r.unpriced.map(u => u.reason)).toEqual([
      { code: 'au_state_missing', location: 'Site' }, { code: 'au_state_missing', location: 'Site' }])
    expect(cat3UnpricedText(r.unpriced[0])).toBe('The upstream electricity figure for Site depends on which Australian ' +
      'state the site is in, and none is recorded, so it is not counted yet. It is not priced at NGA\'s national figure. ' +
      'Choose the state for this site.')
    expect(r.lines.some(l => l.factor?.kg_co2e === 0.07)).toBe(false)
  })

  it('no state through the inventory: Scope 1 gas priced, the Category 3 gas line withheld', () => {
    const { workings, result } = throughInventory([site({ name: 'Depot', has_natural_gas: true, natural_gas_amount: 1_000,
      natural_gas_unit: 'm3' }, ['natural_gas'])])
    expect(workings.some(w => w.scope === 1 && w.stream === 'natural_gas' && w.declaration === undefined)).toBe(true)
    expect(result.unpriced.map(u => u.reason)).toEqual([{ code: 'au_state_missing', location: 'Depot' }])
  })

  it('AU diesel keeps the DEFRA stand-in and its flag; the NGA sentence appears only with an NGA line', () => {
    const r = price([row({ id: 'd', stream: 'mobile_diesel', activity: 100, unit: 'litres', au_state: 'VIC' })])
    expect(r.lines[0].factor!.sheet).not.toMatch(/^NGA/)
    expect(r.lines[0].flags.map(f => f.code)).toEqual(['uk_stand_in'])
    expect(cat3MethodSentences(r, 'GWP')).not.toContain(CAT3_NGA_SENTENCE)
    const e = price([row({ id: 'e', stream: 'electricity', activity: 1, unit: 'kWh', au_state: 'VIC' })])
    expect(cat3MethodSentences(e, 'GWP')).toContain(CAT3_NGA_SENTENCE)
  })
})
