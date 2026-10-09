// lib/ghg/typedEntries.test.ts
//
// T18 diff 3: who typed each figure and when. One entry per change per save; the workings row for a typed figure
// carries the latest entry and the history; the free-calculator claim attributes figures typed before sign-in.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withTypedEntries, typedBaseline, TYPED_FIGURE_FIELDS, ENTERED_BEFORE_SIGN_IN } from './typedEntries'
import { figuresForSave, typedEntriesBaseline, typedEntriesProblem, documentLogBaseline, documentLogProblem } from './savePayload'
import { inventoryRow } from './freeCalc'
import { addOverride } from './overrides'
import { emptyLocation, UNIT_FIELDS, type Location, type Inventory, type SourceDoc, type ExtractedProposal, type TypedEntry } from './engine'
import { TEST_PREPARED_ON } from '../testing/heldSelection'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const BY2 = { userId: 'u-2', email: 'sam@acme.example' }
const T1 = '2026-10-02T09:00:00.000Z', T2 = '2026-10-03T09:00:00.000Z', T3 = '2026-10-04T09:00:00.000Z'
const gasSite = (o: Partial<Location> = {}): Location =>
  ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf', natural_gas_amount: 420, source_docs: [], ...o })
const inv = (l: Location): Inventory =>
  ({ company_name: 'Acme', reporting_year: 2025, revenue_millions: 0, fiscal_year_end_month: 12, locations: [l], coverage_resolutions: [] } as unknown as Inventory)
const save = (l: Location, by = BY, at = T1, baseline?: ReturnType<typeof typedBaseline>) =>
  figuresForSave(inv(l), 'AR6', { preparedOn: TEST_PREPARED_ON }, { by, at, ...(baseline ? { baseline } : {}) })
const savedLoc = (s: ReturnType<typeof save>) => (s.locations_data as Location[])[0]
type Row = { stream?: string; entered_by?: typeof BY; entered_at?: string; typed_entries?: TypedEntry[]; manual_override?: unknown; contributions?: unknown[] }
const gasRow = (s: ReturnType<typeof save>) => (s.workings as Row[]).find(r => r.stream === 'natural_gas')!

describe('one entry per change per save', () => {
  it('a new typed figure gets one entry: field, value, unit, who and when', () => {
    expect(savedLoc(save(gasSite())).typed_entries).toEqual([{ field: 'natural_gas_amount', value: 420, unit: 'mcf', at: T1, by: BY }])
  })
  it('saving unchanged appends none; changing it appends one, by whoever saved the change', () => {
    const once = savedLoc(save(gasSite()))
    expect(savedLoc(save(once, BY2, T2)).typed_entries).toHaveLength(1)
    const changed = savedLoc(save({ ...once, natural_gas_amount: 455 }, BY2, T2))
    expect(changed.typed_entries?.map(e => [e.value, e.by.email, e.at])).toEqual([[420, 'jo@acme.example', T1], [455, 'sam@acme.example', T2]])
  })
  it('a change of unit alone is a change; a zero with no entry is not', () => {
    const once = savedLoc(save(gasSite()))
    expect(savedLoc(save({ ...once, natural_gas_unit: 'therms' }, BY, T2)).typed_entries?.at(-1)).toMatchObject({ value: 420, unit: 'therms' })
    expect(savedLoc(save(gasSite({ natural_gas_amount: 0 }))).typed_entries).toBeUndefined()
  })
  it('clearing a figure to zero is recorded', () => {
    const once = savedLoc(save(gasSite()))
    expect(savedLoc(save({ ...once, natural_gas_amount: 0 }, BY2, T3)).typed_entries?.at(-1)).toMatchObject({ value: 0, by: BY2, at: T3 })
  })
  it('a figure saved before T18 and left unchanged is not attributed to the next person to save', () => {
    const legacy = gasSite()
    const baseline = typedBaseline([legacy])
    expect(savedLoc(save(legacy, BY2, T2, baseline)).typed_entries, 'unchanged since loaded').toBeUndefined()
    expect(savedLoc(save({ ...legacy, natural_gas_amount: 500 }, BY2, T2, baseline)).typed_entries).toEqual([{ field: 'natural_gas_amount', value: 500, unit: 'mcf', at: T2, by: BY2 }])
  })
  it('a save that names nobody records nobody', () => {
    expect((figuresForSave(inv(gasSite()), 'AR6', { preparedOn: TEST_PREPARED_ON }).locations_data as Location[])[0].typed_entries).toBeUndefined()
  })
})

describe('which figures are typed', () => {
  const prop = (o: Partial<ExtractedProposal> = {}): ExtractedProposal => ({ fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf',
    periodStart: '2025-01-01', periodEnd: '2025-12-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed', ...o })
  const gdoc: SourceDoc = { id: 'g', file_name: 'g.pdf', document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: '/g.pdf', extracted: [prop()] }
  it('a field read from documents gets no entry; under a manual override it does, with the reason', () => {
    const backed = gasSite({ natural_gas_amount: 0, source_docs: [gdoc] })
    expect(savedLoc(save(backed)).typed_entries).toBeUndefined()
    const overridden = { ...backed, ...addOverride(backed, { field: 'natural_gas_amount', reason: 'Bills were estimated', by: BY, at: T1, startFrom: 100 }), natural_gas_amount: 96 } as Location
    const s = save(overridden, BY, T2)
    expect(savedLoc(s).typed_entries).toEqual([{ field: 'natural_gas_amount', value: 96, unit: 'mcf', at: T2, by: BY, overrideReason: 'Bills were estimated' }])
    expect(gasRow(s)).toMatchObject({ manual_override: { reason: 'Bills were estimated' }, entered_by: BY, entered_at: T2 })
  })
  it('every unit field is covered, and each typed field is a real Location field', () => {
    const fields = TYPED_FIGURE_FIELDS.map(f => String(f.field))
    for (const f of UNIT_FIELDS) expect(fields).toContain(f.amount)
    const loc = emptyLocation('L1', 'x') as unknown as Record<string, unknown>
    for (const f of ['electricity_kwh', 'renewable_electricity_kwh', 'refrigerant_purchased_kg', 'biogenic_co2_mt']) expect(f in loc, f).toBe(true)
  })
})

describe('the workings row for a typed figure', () => {
  it('carries the latest entry as entered_by and entered_at, with the history', () => {
    const once = savedLoc(save(gasSite()))
    const s = save({ ...once, natural_gas_amount: 455 }, BY2, T2)
    expect(gasRow(s)).toMatchObject({ entered_by: BY2, entered_at: T2 })
    expect(gasRow(s).typed_entries?.map(e => e.value)).toEqual([420, 455])
  })
  it('a row read from documents carries no typed entries, even when the field was typed before', () => {
    const prop: ExtractedProposal = { fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf', periodStart: '2025-01-01',
      periodEnd: '2025-12-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed' }
    const typedThenBills = { ...savedLoc(save(gasSite())), source_docs: [{ id: 'g', file_name: 'g.pdf', document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: '/g.pdf', extracted: [prop] }] }
    const row = gasRow(save(typedThenBills, BY, T2))
    expect(row.contributions).toHaveLength(1)
    expect(row.entered_by).toBeUndefined()
  })
  it('refrigerant and electricity rows carry theirs too', () => {
    const l = { ...emptyLocation('L1', 'Site A'), country: 'US', state: 'CA', grid_region: 'US_CA', electricity_kwh: 12000,
      has_hfc_refrigerants: true, refrigerant_type: 'r410a', refrigerant_purchased_kg: 3, source_docs: [] } as Location
    const rows = save(l).workings as (Row & { source: string; result_tco2e: number | null })[]
    expect(rows.filter(r => r.stream === 'electricity' && r.entered_by).length, 'location- and market-based').toBeGreaterThanOrEqual(2)
    expect(rows.find(r => r.stream === 'refrigerants')).toMatchObject({ entered_by: BY, entered_at: T1, typed_entries: [{ field: 'refrigerant_purchased_kg', value: 3, unit: 'kg' }] })
    expect(rows.find(r => r.stream === 'refrigerants')?.result_tco2e, 'priced').toBeGreaterThan(0)
    // A type with no GWP held is an unpriced row, and it carries the typed entry too.
    const unknown = (save({ ...l, refrigerant_type: 'R-410A' }).workings as (Row & { declaration?: string })[]).find(r => r.stream === 'refrigerants')
    expect(unknown).toMatchObject({ declaration: 'unpriced', entered_by: BY, entered_at: T1 })
  })
})

describe('a free calculation claimed after sign-in', () => {
  it('each typed figure gets one entry, by the claiming person, dated the claim day, entered before sign-in', () => {
    const claimDay = new Date('2026-10-05T14:30:00.000Z')
    const row = inventoryRow(inv(gasSite()), BY.userId, 'co-1', true, claimDay, BY)
    expect((row.locations_data as Location[])[0].typed_entries).toEqual([{ field: 'natural_gas_amount', value: 420, unit: 'mcf', at: '2026-10-05T14:30:00.000Z', by: BY, note: ENTERED_BEFORE_SIGN_IN }])
    expect(ENTERED_BEFORE_SIGN_IN).toBe('entered before sign-in')
    expect((row.workings as Row[]).find(r => r.stream === 'natural_gas')?.entered_by).toEqual(BY)
  })
  it('the claim service passes the claiming person', () => {
    const src = readFileSync(join(process.cwd(), 'lib/ghg/freeCalcService.ts'), 'utf8')
    expect(src).toContain('inventoryRow(inv, deps.user.id, co.id, !active, deps.now, { userId: deps.user.id, email: deps.user.email })')
  })
})

describe('the page', () => {
  const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
  it('saves with who and when, compared with the figures as loaded for this inventory', () => {
    expect(page).toContain('by: { userId: session.user.id, email: session.user.email }, at: savedAt,')
    expect(page).toContain('baseline: inventoryId && loadedTypedFigures.current.inventoryId === inventoryId ? loadedTypedFigures.current.typed : undefined,')
    expect(page).toContain('loadedTypedFigures.current = { inventoryId: data.id, typed: typedBaseline(data.locations_data), entries: typedEntriesBaseline(data.locations_data) }')
  })
  it('keeps the entries a save appended, so the next save does not drop them', () => {
    expect(page).toContain('const entries = saved.locations_data.find(x => x.id === l.id)?.typed_entries')
    expect(page).toContain('return { ...i, locations, factor_selection: saved.factor_selection, factor_edition_comparison: savedEditionComparison }')
  })
})

describe('withTypedEntries on its own', () => {
  it('returns the same location when nothing changed', () => {
    const l = gasSite({ natural_gas_amount: 0 })
    expect(withTypedEntries(l, { by: BY, at: T1 })).toBe(l)
  })
})

describe('typed entries are append-only on save', () => {
  const MSG = 'This save would remove or change the record of who entered a figure at Site A, and when. That record is kept permanently, so nothing was saved. Reload the inventory and try again.'
  const loaded = savedLoc(save({ ...savedLoc(save(gasSite())), natural_gas_amount: 455 }, BY2, T2))
  const baseline = typedEntriesBaseline([loaded])
  const entries = loaded.typed_entries!

  it('a save that drops an entry is refused', () => {
    expect(typedEntriesProblem(baseline, [{ ...loaded, typed_entries: entries.slice(1) }])).toBe(MSG)
    expect(typedEntriesProblem(baseline, [{ ...loaded, typed_entries: undefined }])).toBe(MSG)
  })
  it('a save that edits an entry\'s value, who or when is refused', () => {
    for (const edit of [{ value: 421 }, { by: BY2 }, { at: T3 }]) {
      expect(typedEntriesProblem(baseline, [{ ...loaded, typed_entries: [{ ...entries[0], ...edit }, entries[1]] }]), JSON.stringify(edit)).toBe(MSG)
    }
  })
  it('a save that only adds passes; so does the real next save, which appends', () => {
    expect(typedEntriesProblem(baseline, [loaded])).toBeNull()
    const next = savedLoc(save({ ...loaded, natural_gas_amount: 470 }, BY, T3))
    expect(next.typed_entries).toHaveLength(3)
    expect(typedEntriesProblem(baseline, [next])).toBeNull()
  })
  it('the same entry with its keys in another order (as jsonb stores it) is the same entry', () => {
    const reordered = entries.map(e => Object.fromEntries(Object.entries(e).reverse()) as unknown as TypedEntry)
    expect(typedEntriesProblem(baseline, [{ ...loaded, typed_entries: reordered }])).toBeNull()
    expect(documentLogProblem(documentLogBaseline([loaded]), [loaded])).toBeNull()
  })
  it('a location no longer in the payload is not checked (location deletion is T18 section D)', () => {
    expect(typedEntriesProblem(baseline, [])).toBeNull()
  })
  it('the page refuses before anything is written, after the document-log check', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain('typedEntriesProblem(loadedTypedFigures.current.entries, saved.locations_data)')
    expect(page).toContain('if (entriesProblem) { lastSaveError.current = entriesProblem; alert(entriesProblem); return }')
    expect(page.indexOf('if (entriesProblem)')).toBeLessThan(page.indexOf(".from('ghg_inventories').update(payload)"))
    expect(page.indexOf('if (entriesProblem)')).toBeGreaterThan(page.indexOf('if (logProblem)'))
    for (const s of ['loadedTypedFigures.current = { inventoryId, typed: typedBaseline(saved.locations_data), entries: typedEntriesBaseline(saved.locations_data) }',
      'loadedTypedFigures.current = { inventoryId: data.id, typed: typedBaseline(saved.locations_data), entries: typedEntriesBaseline(saved.locations_data) }']) expect(page).toContain(s)
  })
})

// ── T18 diff 4: the evidence list's sentence for each typed entry ──────────────────────────────────────────────────
import { typedEntrySentence, typedFieldName } from './typedEntries'
describe('a typed entry in words', () => {
  it('names the figure, the value and unit as the customer reads them, who and when, and any note or override reason', () => {
    expect(typedEntrySentence({ field: 'natural_gas_amount', value: 4200, unit: 'mcf', at: T1, by: BY })).toBe('Natural gas entered as 4,200 Mcf by jo@acme.example on 2 October 2026.')
    expect(typedEntrySentence({ field: 'electricity_kwh', value: 12000, unit: 'kWh', at: T1, by: BY, note: ENTERED_BEFORE_SIGN_IN }))
      .toBe('Electricity entered as 12,000 kWh by jo@acme.example on 2 October 2026 (entered before sign-in).')
    expect(typedEntrySentence({ field: 'natural_gas_amount', value: 96, unit: 'gj', at: T2, by: BY2, overrideReason: 'Bills were estimated' }))
      .toBe('Natural gas entered as 96 GJ by sam@acme.example on 3 October 2026, by hand instead of from the bills: Bills were estimated.')
    expect(typedEntrySentence({ field: 'light_model_year', value: 2019, unit: null, at: T1, by: BY })).toBe('Light vehicle model year entered as 2019 by jo@acme.example on 2 October 2026.')
  })
  it('every typed field has a name, not its key', () => {
    for (const f of TYPED_FIGURE_FIELDS) expect(typedFieldName(String(f.field)), String(f.field)).not.toContain('_')
  })
})
