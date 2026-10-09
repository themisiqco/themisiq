import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// lib/drafts.ts (imported by the free-calculator draft parser) loads the browser Supabase client; nothing here needs it.
vi.mock('../supabase', () => ({ supabase: {} }))

import { buildWorkings, calcGas, calcInventory, deriveLocations, emptyLocation, getGridFactor, isResolvedGridRegion, pickEF, selectionFor,
  type Inventory, type Location, type StoredFactorSelection } from './engine'
import { figuresForSave } from './savePayload'
import { factorSelectionForSave, frozenFor, selectionContextFor, windowKey } from './factorSelection'
import { DATASETS, FACTOR_YEAR_NO_SUBSTITUTION, FACTOR_YEAR_RULE_CLASS_B } from './factorEditionRegistry'
import { inventoryFromDraft, inventoryRow } from './freeCalc'
import { buildMonthlyEmissions } from './monthlyEmissions'
import { SELECTION_RULE_WORDS, workingsEditionLines } from './workingsCells'

// T3c diff 3: ghg_inventories.factor_selection, the frozen class (b) edition choices, and Lisa's rulings of
// 8 Oct 2026 (A: window per entry; B: merge, never replace; C: the free-calculator claim is a first save;
// D: only data_year_match and data_year_newest are frozen).
//
// "A newer class (b) edition is registered" is driven by the preparation date. The registry is code, so for a saved
// inventory a newer edition arrives as a later save falling after its publication: ECCC Table 5.4 (NIR 1990-2024)
// was published on 9 September 2026, so an inventory first saved on 1 June 2026 selected Table 5.3, and a save on
// 8 October 2026 would select 5.4 if nothing were frozen.

const JUNE = new Date(2026, 5, 1)
const OCT = new Date(2026, 9, 8)
const L = (o: Partial<Location>) => ({ ...emptyLocation(String(o.id), String(o.name)), ...o }) as Location
const FLEET: Partial<Location> = { has_mobile: true, fleet_light: true, light_diesel_amount: 100, light_diesel_unit: 'litres' }
const ON = L({ id: 'on', name: 'Toronto', country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'gj', ...FLEET })
const US = L({ id: 'us', name: 'San Diego', country: 'US', state: 'CA', grid_region: 'US_CA', residual_region: 'CAMX', electricity_kwh: 10000, has_natural_gas: true, natural_gas_amount: 100, natural_gas_unit: 'mcf' })
const NZ = L({ id: 'nz', name: 'Auckland', country: 'NZ', grid_region: 'NZ', electricity_kwh: 10000, nz_td_losses: true })
const DE = L({ id: 'de', name: 'Berlin', country: 'DE', grid_region: 'EU_DE', electricity_kwh: 10000 })
const inv = (locations: Location[], o: Partial<Inventory> = {}) => ({
  company_name: 'Acme', company_id: null, reporting_year: 2026, fiscal_year_end_month: 12, revenue_millions: 0, employee_count: 0,
  boundary_approach: 'operational_control', california_nexus: false, coverage_resolutions: [], prior_year_s1: 0, prior_year_s2: 0,
  selected_frameworks: ['sb253'], locations, ...o,
}) as unknown as Inventory
type Row = { location?: string; stream?: string; scope2_method?: string; declaration?: string; result_tco2e: number | null
  factor_edition?: string; selection_rule?: string; selected_on?: string; unpriced?: { reason: string } }
const torontoGrid = (rows: unknown[]) => (rows as Row[]).find(r => r.location === 'Toronto' && r.scope2_method === 'location-based')!
const CAL_2026 = '2026-01-01/2026-12-31'

describe('T3c diff 3: a save writes the class (b) selection', () => {
  it('every class (b) dataset the inventory uses, with edition, data year, rule, the day and the window; nothing else', () => {
    const fs = figuresForSave(inv([ON, US, NZ, DE]), 'AR6', { preparedOn: JUNE }).factor_selection
    expect(Object.keys(fs).sort()).toEqual(['aib', 'eccc_grid', 'eccc_mobile', 'eccc_ng_heat', 'eea_grid', 'egrid', 'greene', 'mfe_grid', 'mfe_td'])
    for (const [ds, e] of Object.entries(fs)) {
      expect(DATASETS[ds as keyof typeof DATASETS].class, ds).toBe('b')
      expect([e!.selected_on, e!.window], ds).toEqual(['2026-06-01', CAL_2026])
      expect(['data_year_match', 'data_year_newest'], ds).toContain(e!.rule)
    }
    expect(fs.eccc_grid).toEqual({ edition: 'ECCC Table 5.3 (NIR 1990-2023)', data_year: 2023, rule: 'data_year_newest', selected_on: '2026-06-01', window: CAL_2026 })
    expect(fs.greene).toMatchObject({ edition: 'Green-e 2025 (2023 data)', data_year: 2023 })
  })

  it('a data-year match is frozen too (calendar 2025: AIB 2025, MfE 2025 row)', () => {
    const fs = figuresForSave(inv([NZ, DE], { reporting_year: 2025 }), 'AR6', { preparedOn: OCT }).factor_selection
    expect([fs.aib?.rule, fs.mfe_grid?.rule, fs.mfe_td?.rule, fs.eea_grid?.rule]).toEqual(['data_year_match', 'data_year_match', 'data_year_match', 'data_year_newest'])
  })

  it('ruling D: a provisional (R19) or class (a) selection is never written', () => {
    // US calendar 2026: the EPA Hub lines are provisional on EPA 2025 (class (a)); eGRID and Green-e are class (b).
    const f = figuresForSave(inv([US]), 'AR6', { preparedOn: OCT })
    expect((f.workings as { provisional?: boolean }[]).some(r => r.provisional)).toBe(true)
    expect(Object.keys(f.factor_selection).sort()).toEqual(['egrid', 'greene'])
  })

  it('workings rows show selected_on for class (b), the day of the save that chose it', () => {
    const f = figuresForSave(inv([ON]), 'AR6', { preparedOn: JUNE })
    expect([torontoGrid(f.workings).factor_edition, torontoGrid(f.workings).selection_rule, torontoGrid(f.workings).selected_on])
      .toEqual(['ECCC Table 5.3 (NIR 1990-2023)', 'data_year_newest', '2026-06-01'])
  })
})

describe('T3c diff 3: a frozen selection is read back on every later save', () => {
  const first = figuresForSave(inv([ON, US, NZ, DE]), 'AR6', { preparedOn: JUNE })
  const saved = inv([ON, US, NZ, DE], { factor_selection: first.factor_selection })

  it('a re-save after a newer class (b) edition is published keeps the frozen one, with its first date', () => {
    const again = figuresForSave(saved, 'AR6', { preparedOn: OCT })
    expect(again.factor_selection).toEqual(first.factor_selection)
    const row = torontoGrid(again.workings)
    expect([row.factor_edition, row.selection_rule, row.selected_on]).toEqual(['ECCC Table 5.3 (NIR 1990-2023)', 'frozen', '2026-06-01'])
    // The figures are the first save's, not re-priced on Table 5.4.
    expect(again.totals.s2_location).toBe(first.totals.s2_location)
    expect(again.totals.s1_total).toBe(first.totals.s1_total)
  })

  it('a new inventory saved after that publication gets the newer edition, dated that day', () => {
    const fresh = figuresForSave(inv([ON]), 'AR6', { preparedOn: OCT })
    expect(fresh.factor_selection.eccc_grid).toEqual({ edition: 'ECCC Table 5.4 (NIR 1990-2024)', data_year: 2024, rule: 'data_year_newest', selected_on: '2026-10-08', window: CAL_2026 })
    expect(fresh.totals.s2_location).not.toBe(figuresForSave(inv([ON]), 'AR6', { preparedOn: JUNE }).totals.s2_location)
  })

  it("an inventory whose column is '{}' (saved before this change) gets its selection on its next save, dated that day", () => {
    for (const stored of [{}, undefined, null]) {
      const fs = figuresForSave(inv([ON, NZ], { factor_selection: stored as never }), 'AR6', { preparedOn: OCT }).factor_selection
      expect(Object.keys(fs).sort(), String(stored)).toEqual(['eccc_grid', 'eccc_mobile', 'eccc_ng_heat', 'mfe_grid', 'mfe_td'])
      for (const e of Object.values(fs)) expect(e!.selected_on).toBe('2026-10-08')
    }
  })

  it('ruling A: a changed year end discards the entries and selects again for the new window, dated that save', () => {
    const march = figuresForSave({ ...saved, fiscal_year_end_month: 3 }, 'AR6', { preparedOn: OCT }).factor_selection
    for (const e of Object.values(march)) expect([e!.window, e!.selected_on]).toEqual(['2025-04-01/2026-03-31', '2026-10-08'])
    expect(march.eccc_grid?.edition).toBe('ECCC Table 5.4 (NIR 1990-2024)')
    // And a changed reporting year likewise.
    const y25 = figuresForSave({ ...saved, reporting_year: 2025 }, 'AR6', { preparedOn: OCT }).factor_selection
    expect(Object.values(y25).every(e => e!.window === '2025-01-01/2025-12-31' && e!.selected_on === '2026-10-08')).toBe(true)
  })

  it('ruling B: a dataset first used on a later save is selected then and merged in; earlier entries are never replaced', () => {
    const onlyOn = figuresForSave(inv([ON]), 'AR6', { preparedOn: JUNE }).factor_selection
    const later = figuresForSave(inv([ON, NZ], { factor_selection: onlyOn }), 'AR6', { preparedOn: OCT }).factor_selection
    for (const ds of ['eccc_grid', 'eccc_mobile', 'eccc_ng_heat'] as const) expect(later[ds], ds).toEqual(onlyOn[ds])
    expect([later.mfe_grid?.selected_on, later.mfe_td?.selected_on]).toEqual(['2026-10-08', '2026-10-08'])
    // A site removed later does not drop its dataset's entry: the choice stands if the site comes back.
    const removed = figuresForSave(inv([NZ], { factor_selection: later }), 'AR6', { preparedOn: OCT }).factor_selection
    expect(removed.eccc_grid).toEqual(onlyOn.eccc_grid)
  })

  it('a frozen edition that is no longer held is an unpriced line, never another edition', () => {
    const stale: StoredFactorSelection = { egrid: { edition: 'eGRID2022', data_year: 2022, rule: 'data_year_newest', selected_on: '2024-03-01', window: CAL_2026 } }
    const rows = buildWorkings([US], 'AR6', 2026, [], 12, selectionContextFor(inv([US], { factor_selection: stale }), OCT)) as Row[]
    const grid = rows.find(r => r.stream === 'electricity' && (r.scope2_method === 'location-based' || r.unpriced))!
    expect([grid.result_tco2e, grid.unpriced?.reason]).toEqual([null, 'edition_missing'])
  })

  it('the monthly series prices on the same frozen edition as the annual figure', () => {
    const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion }
    const ctx = selectionContextFor(saved, OCT)
    // Monthly is evidenced only, so the electricity comes from a confirmed bill for the year.
    const bill = { id: 'b1', file_name: 'hydro.pdf', document_type: 'utility_electricity', uploaded_at: '2026-06-01', file_path: '/b1.pdf',
      extracted: [{ fuelType: 'electricity', rawValue: null, rawUnit: null, value: 12_000, unit: 'kwh', periodStart: '2026-01-01', periodEnd: '2026-12-31',
        confidence: 'high', sourceQuote: 'Total: 12,000 kWh', notes: null, status: 'confirmed' }] }
    const one = inv([L({ id: 'on', name: 'Toronto', country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 0, source_docs: [bill] as never })],
      { factor_selection: first.factor_selection })
    const monthly = buildMonthlyEmissions(one, deps, 'AR6', ctx).slices.reduce((a, s) => a + s.tco2e, 0)
    const annual = calcInventory(deriveLocations(one), 'AR6', 2026, selectionFor(2026, 12, ctx)).s2_location
    expect(monthly).toBeGreaterThan(0)
    // To 4 dp: each month's slice is rounded (6 dp), so twelve slices differ from the annual figure in the 6th place.
    expect(monthly).toBeCloseTo(annual, 4)
    // Both on the frozen Table 5.3, not the Table 5.4 a fresh selection on this day would take.
    const fresh = calcInventory(deriveLocations(one), 'AR6', 2026, selectionFor(2026, 12, { preparedOn: OCT })).s2_location
    expect(annual).not.toBeCloseTo(fresh, 9)
  })
})

describe('T3c diff 3: the column reader', () => {
  const sel = selectionFor(2026, 12, { preparedOn: OCT })

  it('windowKey is the first and last day of the reporting window', () => {
    expect([windowKey(sel), windowKey(selectionFor(2026, 3))]).toEqual([CAL_2026, '2025-04-01/2026-03-31'])
  })

  it('frozenFor keeps only well-formed class (b) entries for the current window', () => {
    const ok = { edition: 'eGRID2023', data_year: 2023, rule: 'data_year_newest', selected_on: '2026-06-01', window: CAL_2026 } as const
    const stored = {
      egrid: ok,
      eea_grid: { ...ok, edition: 'EEA 2024', window: '2025-01-01/2025-12-31' },     // another window
      desnz_grid: { ...ok, edition: 'DEFRA 2026' },                                  // class (a): never frozen
      aib: { ...ok, rule: 'frozen' },                                                // not a stored rule
      mfe_grid: { ...ok, selected_on: '1 June 2026' },                               // not a day
      nonsense: ok,                                                                  // not a dataset
    } as unknown as StoredFactorSelection
    expect(frozenFor(stored, sel)).toEqual({ egrid: { dataset: 'egrid', label: 'eGRID2023', data_year: 2023, rule: 'data_year_newest', selected_on: '2026-06-01' } })
    expect(frozenFor(null, sel)).toEqual({})
    expect(selectionContextFor({ reporting_year: 2026, factor_selection: {} }, OCT)).toEqual({ preparedOn: OCT })
  })

  it('factorSelectionForSave writes nothing for an empty calculation and keeps what is stored', () => {
    const stored: StoredFactorSelection = { egrid: { edition: 'eGRID2023', data_year: 2023, rule: 'data_year_newest', selected_on: '2026-06-01', window: CAL_2026 } }
    expect(factorSelectionForSave({}, new Map(), sel)).toEqual({})
    expect(factorSelectionForSave(stored, new Map(), sel)).toEqual(stored)
  })
})

describe('T3c diff 3, ruling C: the free-calculator claim is the first save', () => {
  it('the claimed row writes factor_selection dated the claim day', () => {
    const draft = { company_name: 'Acme', reporting_year: 2026, locations: [{ ...ON }] }
    const row = inventoryRow(inventoryFromDraft(draft as never, 'Acme', OCT), 'user-1', 'co-1', true, OCT)
    expect(row.factor_selection.eccc_grid).toEqual({ edition: 'ECCC Table 5.4 (NIR 1990-2024)', data_year: 2024, rule: 'data_year_newest', selected_on: '2026-10-08', window: CAL_2026 })
  })

  it('the in-browser calculation freezes nothing: an inventory with no column selects on today', () => {
    expect(selectionContextFor(inv([ON]), OCT)).toEqual({ preparedOn: OCT })
  })
})

describe('T3c diff 3: the surfaces word the selection', () => {
  const ROOT = join(__dirname, '..', '..')
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

  it('every selection rule has words, and the edition lines say provisional, the rule, the basis and the dates', () => {
    for (const r of ['desnz_calendar', 'desnz_april_march', 'desnz_july_june', 'desnz_majority_fallback', 'majority', 'nga_activity_year',
      'data_year_match', 'data_year_newest', 'frozen', 'exempt']) expect(SELECTION_RULE_WORDS[r], r).toBeTruthy()
    expect(workingsEditionLines({ factor_edition: 'eGRID2023', selection_rule: 'frozen', selection_basis: 'eGRID2023: selected on 1 June 2026.',
      edition_published: '15 January 2025', edition_corrected: '12 June 2025', selected_on: '2026-06-01' })).toEqual([
      'Rule: Kept as selected when the inventory was first prepared', 'eGRID2023: selected on 1 June 2026.', 'Published 15 January 2025',
      'Values as corrected on 12 June 2025', 'Selected on 1 June 2026'])
    expect(workingsEditionLines({ factor_edition: 'US EPA 2025', provisional: true })[0]).toMatch(/^Provisional/)
    expect(workingsEditionLines({})).toEqual([])
  })

  it('the verifier page renders the edition lines under each row\'s vintage', () => {
    const src = read('app/verify/[token]/page.tsx')
    expect(src).toContain('workingsEditionLines(w).map(')
    for (const f of ['selection_rule', 'selection_basis', 'edition_published', 'edition_corrected', 'selected_on', 'provisional']) expect(src, f).toContain(`${f}?:`)
  })

  it('the methodology page states the class (b) rule and no substitution, in the words the PDF prints', () => {
    const page = read('app/methodology/page.tsx').replace(/\\'/g, "'")
    expect(page).toContain(FACTOR_YEAR_RULE_CLASS_B)
    expect(page).toContain(FACTOR_YEAR_NO_SUBSTITUTION)
    for (const s of [FACTOR_YEAR_RULE_CLASS_B, FACTOR_YEAR_NO_SUBSTITUTION]) expect(s).not.toContain('\u2014')
  })

  it('the wizard saves the column, reads it back on load, and prices every figure on one context', () => {
    const page = read('app/dashboard/ghg/page.tsx')
    expect(page).toContain('factor_selection: data.factor_selection ?? {}')
    expect(page).toContain('factor_selection: saved.factor_selection,')
    expect(page).toContain('const factorCtx = { ...selectionContextFor(inventory), ...(inventoryId ? {} : { unsaved: true as const }) }')
    expect(page).toContain('coverageResolutions, factorCtx)')
    expect(page).toContain("findUnpriceableLocations(derivedLocations, 'AR6', inventory.reporting_year, inventory.fiscal_year_end_month, factorCtx)")
    expect(page).toContain('inventory.fiscal_year_end_month, factorCtx)\n')
    expect(page).toContain('selectionContextFor({ ...inventory, factor_selection: saved.factor_selection })')
    // Row 7b: no fixed edition name beside a grid value.
    for (const s of ["'ECCC v3.0'", "'US EPA eGRID2023'", "(DCCEEW NGA 2025)", "'EEA 2023'", "'NZ MfE 2026'", '(eGRID 2023)']) expect(page, s).not.toContain(s)
    expect(read('lib/assurancePdf.ts')).toContain('const factorCtx = selectionContextFor(inventory)')
  })

  it('the migration is the file as run: the column, the column-scoped grants, the departure, the pre-check and its result', () => {
    const sql = read('supabase/migrations/20261008_ghg_factor_selection.sql')
    // T3c diff 4: Lisa ran it on 8 Oct 2026 with the two column-scoped grants, as 20260813 grants factor_editions.
    expect(sql.split('\n')[0]).toBe('-- RUN 8 Oct 2026 in the Supabase SQL editor, with the column-scoped grants; grants verified.')
    expect(sql).toContain("add column if not exists factor_selection jsonb not null default '{}'::jsonb")
    expect(sql).toContain('DEPARTURE FROM THE DESIGN')
    expect(sql).toContain('information_schema.column_privileges')
    expect(sql).toContain('except service_role, which holds\n--   UPDATE on free_tier only')
    expect(sql).toContain('authenticated holds INSERT, SELECT, UPDATE; service_role holds SELECT and REFERENCES; anon holds nothing.')
    const statements = sql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    expect(statements).toContain('grant select (factor_selection), insert (factor_selection), update (factor_selection)\n  on public.ghg_inventories to authenticated;')
    expect(statements).toContain('grant select (factor_selection)\n  on public.ghg_inventories to service_role;')
    // Never anon, never a table-level grant, and no RLS change.
    expect(statements).not.toMatch(/\banon\b/)
    expect(statements).not.toMatch(/grant\s+(select|insert|update)\s+on\b/i)
    expect(statements).not.toMatch(/\b(revoke|create policy|alter policy|drop policy)\b/i)
  })
})
