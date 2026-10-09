// lib/ghg/storedWorkings.test.ts
//
// T17: what the assurance PDF prints, read from the stored row, and the region wording both surfaces share. The rows
// here are built by the engine, as a save would build them; the helpers under test never call it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  storedRows, workingsPageRows, savedAtLine, excludedFromRows, citationsFromRows, derivationsFromRows, editionRowsFromRows,
  residualRowsFromRows, documentIndexRows, WORKINGS_NOT_KEPT, STATUS_NOT_KEPT, type StoredRow,
} from './storedWorkings'
import { displaySourceLabel, workingsGwpBasisCell, workingsSourceParts, sourcePartsLines } from './workingsCells'
import { docTypeLabel } from './conciergeDocTypes'
import { t17Fixture, BY } from '../testing/t17Fixture'

const Y = 'reporting year 2025'
const fx = t17Fixture()
const rows = storedRows(fx.workings)
const docs = Object.fromEntries(fx.location.source_docs.map(x => [x.id, x]))
const fileOf = (id: string) => docs[id]?.file_name ?? 'A document no longer on this inventory'
const quoteOf = (id: string, pi: number | undefined) => (pi == null ? null : docs[id]?.extracted?.[pi]?.sourceQuote ?? null)

describe('region codes are named in words for display; the stored label is not changed', () => {
  it('a grid code, a residual-mix code, the NZ T&D row and an old coverage fuel key', () => {
    expect(displaySourceLabel({ source: 'Electricity (US_CA)' })).toBe('Electricity (California)')
    expect(displaySourceLabel({ source: 'Electricity (ON)' })).toBe('Electricity (Ontario)')
    expect(displaySourceLabel({ source: 'Electricity (S2 market-based, residual mix CAMX)' })).toBe('Electricity (S2 market-based, residual mix WECC California)')
    expect(displaySourceLabel({ source: 'Electricity (S2 market-based, residual mix EU_DE)' })).toBe('Electricity (S2 market-based, residual mix Germany)')
    expect(displaySourceLabel({ source: `Electricity T&D losses (NZ) ${String.fromCharCode(0x2014)} Scope 3 Cat 3` }))
      .toBe('Electricity transmission and distribution losses (New Zealand), Scope 3 Category 3')
    expect(displaySourceLabel({ source: 'Coverage resolution: natural_gas', gwp_basis: 'coverage_resolution' })).toBe('Coverage resolution: natural gas')
    expect(displaySourceLabel({ source: 'Electricity (XX_ZZ)' }), 'an unknown code is left as stored, never guessed').toBe('Electricity (XX_ZZ)')
    expect(rows.find(r => r.scope2_method === 'location-based')?.source, 'the stored label keeps the code').toBe('Electricity (US_CA)')
  })
  it('the region names load nothing from the engine', () => {
    for (const f of ['lib/ghg/gridRegionNames.ts', 'lib/ghg/gridRegionWords.ts', 'lib/ghg/workingsCells.ts', 'lib/ghg/storedWorkings.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).not.toMatch(/from '\.\/(engine|series)'/)
    }
  })
  it('the old GWP basis token reads the current wording', () => {
    expect(workingsGwpBasisCell({ gwp_basis: `as-published ${String.fromCharCode(0x2014)} see factor source` })).toBe('as published: see factor source')
  })
})

describe('the source cell as the PDF prints it', () => {
  it('the gas row: every bill, counted first, then not counted and why, with quotes; the hand entry on the electricity row', () => {
    const gas = rows.find(r => r.stream === 'natural_gas')!
    expect(sourcePartsLines(workingsSourceParts(gas, fileOf, quoteOf, Y))).toEqual([
      'Natural gas · Bill-sourced',
      'Bills behind this figure',
      'gas-jan.pdf: counted. Confirmed by jo@acme.example on 2 October 2026. Read: "January: 100 MCF"',
      'gas-feb.pdf: counted. Dates estimated from the billing month. Confirmed; who and when were not recorded at the time. Read: "February: 80 MCF"',
      'gas-dec24.pdf: not counted. Billed outside reporting year 2025. Confirmed; who and when were not recorded at the time. Read: "December 2024: 90 MCF"',
      'gas-feb-copy.pdf: not counted. The same bill as gas-feb.pdf, which is counted. Dates estimated from the billing month. Confirmed; who and when were not recorded at the time. Read: "February copy: 80 MCF"',
      'gas-mar.pdf: not counted. Withdrawn by jo@acme.example on 5 October 2026. Reason: Uploaded to the wrong site. Read: "March: 70 MCF"',
    ])
    const elec = rows.find(r => r.stream === 'electricity' && r.scope2_method === 'location-based')!
    expect(sourcePartsLines(workingsSourceParts(elec, fileOf, quoteOf, Y))).toEqual([
      'Electricity (California) · Entered by hand',
      'Bills behind this figure',
      'elec-q1.pdf: not counted. The figure was entered by hand instead. Confirmed; who and when were not recorded at the time. Read: "Q1: 5,000 kWh"',
      'Entered by hand by jo@acme.example on 3 October 2026, instead of from the bills. Reason: Bill covers two tenants; our share is 40%.',
    ])
  })
  it('a row saved before per-bill contributions prints "From source"', () => {
    expect(sourcePartsLines(workingsSourceParts({ source: 'Natural gas', entry_method: 'concierge', source_quotes: ['Total 120 therms'] }, fileOf, quoteOf, Y)))
      .toEqual(['Natural gas · Bill-sourced', 'From source: "Total 120 therms"'])
  })
})

describe('the document index status', () => {
  const index = documentIndexRows([fx.location], rows, [], Y, docTypeLabel)
  const status = (file: string) => index.find(r => r[2] === file)?.[4]
  it('each document by its stored contribution; a withdrawal and a tombstone with who, when and why', () => {
    expect(status('gas-jan.pdf')).toBe('Counted. Confirmed by jo@acme.example on 2 October 2026.')
    expect(status('gas-dec24.pdf')).toBe('Not counted. Billed outside reporting year 2025. Confirmed; who and when were not recorded at the time.')
    expect(status('gas-feb-copy.pdf')).toBe('Not counted. The same bill as gas-feb.pdf, which is counted. Dates estimated from the billing month. Confirmed; who and when were not recorded at the time.')
    expect(status('elec-q1.pdf')).toBe('Not counted. The figure was entered by hand instead. Confirmed; who and when were not recorded at the time.')
    expect(status('gas-mar.pdf')).toBe('Withdrawn by jo@acme.example on 5 October 2026. Reason: Uploaded to the wrong site. Kept as evidence and not counted.')
    expect(status('gas-apr.pdf')).toBe('Deleted by jo@acme.example on 6 October 2026. Reason: Holds another tenant\'s account number. SHA-256 af3d25816e311a34a769d51ed0dc1f59b091d135040628b5ecb5cf13a12bccbc. Earlier saved versions of this inventory still contain what was read from it.')
  })
  it('a document with no stored status says so; one with nothing read, and a deleted location\'s documents', () => {
    const legacy = { name: 'Old site', source_docs: [{ id: 'x', file_name: 'x.pdf', document_type: 'utility_bill_gas', extracted: [{ status: 'confirmed', value: 10 }] },
      { id: 'y', file_name: 'y.pdf', document_type: 'utility_bill_gas', extracted: [] }] }
    const tomb = { kind: 'deleted', docId: 'z', file: 'z.pdf', documentType: 'utility_bill_gas', sha256: null, at: '2026-10-07T09:00:00.000Z', by: BY, reason: 'Site closed' }
    const out = documentIndexRows([legacy], [], [{ name: 'Leeds', documents: [tomb] }], Y, docTypeLabel)
    expect(out.map(r => [r[0], r[2], r[4]])).toEqual([
      ['Old site', 'x.pdf', STATUS_NOT_KEPT],
      ['Old site', 'y.pdf', 'No figure was read from it.'],
      ['Leeds (deleted)', 'z.pdf', 'Deleted by jo@acme.example on 7 October 2026. Reason: Site closed. Earlier saved versions of this inventory still contain what was read from it.'],
    ])
  })
})

describe('the other pages, from the stored rows', () => {
  it('residual rows are the stored market-based rows, not a recompute', () => {
    const mkt = rows.filter(r => r.scope2_method === 'market-based')
    expect(residualRowsFromRows(rows)).toEqual(mkt.map(r => [r.location, r.factor_variant ? `${r.ef_source}, ${r.factor_variant}` : r.ef_source, r.factor_vintage]))
  })
  it('derivations are the distinct stored conversion notes and factors, grouped by source', () => {
    const rs: StoredRow[] = [
      { source: 'Diesel (stationary)', conversion_note: '100 US gallons converted to 378.54 litres (1 US gallon = 3.785411784 litres, exact).', conversion_factor: 3.785411784, factor_key: 'diesel_litre', activity_unit: 'gallons' },
      { source: 'Diesel (stationary)', conversion_note: '100 US gallons converted to 378.54 litres (1 US gallon = 3.785411784 litres, exact).', conversion_factor: 3.785411784, factor_key: 'diesel_litre', activity_unit: 'gallons' },
      { source: 'Natural gas' },
    ]
    expect(derivationsFromRows(rs)).toEqual([
      ['Diesel (stationary)', '100 US gallons converted to 378.54 litres (1 US gallon = 3.785411784 litres, exact).'],
      ['Diesel (stationary)', 'Conversion factor: 1 US gallon = 3.785411784 litres'],
    ])
  })
  it('citations, editions and exclusions come from the stored rows', () => {
    const c = citationsFromRows(rows)
    expect(c.combustion.length).toBeGreaterThan(0)
    expect(c.electricity.length).toBeGreaterThan(0)
    expect(editionRowsFromRows(rows).length).toBeGreaterThan(0)
    expect(excludedFromRows([{ source: 'Site X', location: 'Site X', declaration: 'country_not_set', country_refusal: { state: 'country_not_set' } }]))
      .toEqual([{ location: 'Site X', refusal: { state: 'country_not_set' } }])
  })
  it('the Workings page leaves the document and location records to their own table', () => {
    expect(workingsPageRows([{ source: 'a', gwp_basis: 'document_event' }, { source: 'b', gwp_basis: 'AR6' }]).map(r => r.source)).toEqual(['b'])
  })
  it('the cover\'s saved time is the stored row\'s, in UTC; no time, no line; no workings, the agreed line', () => {
    expect(savedAtLine('2026-10-09T14:32:05.123Z')).toBe('Prints this inventory as saved on 9 October 2026 at 14:32 UTC.')
    expect(savedAtLine(null)).toBeNull()
    expect(storedRows(null)).toEqual([])
    expect(WORKINGS_NOT_KEPT).toBe('The calculation workings for this inventory were saved before they were kept with it. Saving the inventory again adds them.')
  })
})

describe('copy that describes the package', () => {
  it('the ghg-bot names an index of the documents, not the documents; the wizard ticks workings only when saved', () => {
    expect(readFileSync(join(process.cwd(), 'app/api/ghg-bot/route.ts'), 'utf8')).toContain('an index of the source documents you uploaded (the verifier view links to the documents themselves)')
    expect(readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8'))
      .toContain("{ label: 'Calculation workings documented per source', done: !!inventoryId && !dirty,")
  })
})

// ── T17 review: every kind of derivation the stored rows carry reaches the Methodology page ────────────────────────
import { buildWorkings, emptyLocation, unitsForCountryChange, applyUnitOutcomes, type Location } from './engine'
import { TEST_PREPARED_ON } from '../testing/heldSelection'
describe('derivationsFromRows gathers every kind, from the stored rows alone', () => {
  const L = (o: Record<string, unknown>) => ({ ...emptyLocation(String(o.id), String(o.name)), ...o }) as unknown as Location
  const rowsFor = (l: Location) => storedRows(JSON.parse(JSON.stringify(buildWorkings([l], 'AR6', 2025, [], 12, { preparedOn: TEST_PREPARED_ON }))))
  const denver = L({ id: 'm', name: 'Denver', country: 'US', state: 'CO', grid_region: 'US_CO', has_natural_gas: true, natural_gas_amount: 10, natural_gas_unit: 'mcf' })
  const KINDS: [string, Location, string][] = [
    ['exact unit conversion (FI2)', L({ id: 'e', name: 'Austin', country: 'US', state: 'TX', grid_region: 'US_TX', has_diesel_stationary: true, diesel_stationary_amount: 100, diesel_stationary_unit: 'litres' }), '100 litres converted to 26.42 US gallons'],
    ['conversion factor value (T11)', L({ id: 'e', name: 'Austin', country: 'US', state: 'TX', grid_region: 'US_TX', has_diesel_stationary: true, diesel_stationary_amount: 100, diesel_stationary_unit: 'litres' }), 'Conversion factor: 1 litre = 0.2641720524 US gallons'],
    ['US EPA published column (FI2 diff 3)', L({ id: 'e', name: 'Austin', country: 'US', state: 'TX', grid_region: 'US_TX', has_diesel_stationary: true, diesel_stationary_amount: 100, diesel_stationary_unit: 'litres' }), 'US EPA GHG Emission Factors Hub, Table 1, Distillate Fuel Oil No. 2'],
    ['unit change (FI5)', { ...applyUnitOutcomes({ ...denver, country: 'GB' }, unitsForCountryChange('GB', denver as never), '2026-10-02T09:00:00.000Z', { userId: 'u', email: 'jo@acme.example' }), grid_region: 'UK' } as Location, 'Unit changed by jo@acme.example on 2 October 2026'],
    ['UK DEFRA per-tonne value (FI4)', L({ id: 'k', name: 'Leeds', country: 'GB', grid_region: 'UK', has_propane: true, propane_amount: 100, propane_unit: 'kg' }), 'per tonne / 1,000, exact'],
    ['Canadian heat content (T3c)', L({ id: 'b', name: 'Toronto', country: 'CA', province: 'ON', grid_region: 'ON', has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'gj' }), "Canada's national gross heat content for natural gas"],
    ['EU density and energy content (FI3)', L({ id: 'h', name: 'Munich', country: 'DE', grid_region: 'EU_DE', has_diesel_stationary: true, diesel_stationary_amount: 100, diesel_stationary_unit: 'litres' }), 'JEC Well-to-Tank report v5'],
    ['EU fleet NCV and density (FI9)', L({ id: 'd', name: 'Hamburg', country: 'DE', grid_region: 'EU_DE', has_mobile: true, fleet_heavy: true, heavy_diesel_amount: 500, heavy_diesel_unit: 'litres' }), 'IPCC prints one row for heavy vehicles'],
    ['Australian published value (FI2 diff 3, T10a)', L({ id: 'j', name: 'Perth', country: 'AU', state: 'WA', grid_region: 'AU_WA', has_diesel_stationary: true, diesel_stationary_amount: 100, diesel_stationary_unit: 'litres' }), 'per litre is per kL'],
    ['steam unit basis', L({ id: 'f', name: 'Boston', country: 'US', state: 'MA', grid_region: 'US_MA', has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'gj' }), 'the published factor is per MMBtu'],
    ['steam estimated from natural gas (R14)', L({ id: 'g', name: 'Calgary', country: 'CA', province: 'AB', grid_region: 'AB', has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'gj' }), 'Calculated as if generated from natural gas at 80% efficiency'],
  ]
  for (const [kind, loc, words] of KINDS) {
    it(kind, () => {
      const lines = derivationsFromRows(rowsFor(loc)).map(([, t]) => t)
      expect(lines.some(t => t.includes(words)), `${kind}: ${lines.join(' | ')}`).toBe(true)
    })
  }
  it('an edition basis is not a derivation, and no derivation carries a dash', () => {
    for (const [, loc] of KINDS) {
      const rs = rowsFor(loc)
      const lines = derivationsFromRows(rs).map(([, t]) => t)
      for (const r of rs) if (r.selection_basis) expect(lines, r.source).not.toContain(r.selection_basis)
      for (const t of lines) expect(t).not.toContain(String.fromCharCode(0x2014))
    }
  })
})
