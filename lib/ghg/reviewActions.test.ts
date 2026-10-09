// lib/ghg/reviewActions.test.ts
//
// T18: WHO AND WHEN ON EVERY REVIEW ACTION, AS SAVED. For each action, the customer takes it through the same
// builder the page calls, the inventory is saved through figuresForSave, and the saved workings must hold an
// entry naming that person beside that moment. Each action is taken by its own person at its own time, so a
// match cannot come from another action's record.
//
// Diff 1 covers the proposal actions; diff 2 the document lifecycle (withdraw, restore, delete permanently, delete
// unused); diff 3 typed entries (at a save, and at a free-calculator claim) and every coverage resolution; diff 4
// location deletion, with documents and without (T18 section D).

import { describe, it, expect } from 'vitest'
import { figuresForSave, typedEntriesBaseline, typedEntriesProblem, documentLogBaseline, documentLogProblem } from './savePayload'
import {
  confirmProposal, editFigure, flagProposal, editPeriod, editUnit, rejectProposal, undoRejection, chooseFleetType, guardConfirm,
} from './proposalEdits'
import { addOverride, removeOverride } from './overrides'
import { withdrawDocument, restoreDocument, deleteDocument, locationDeleteRecord } from './documentActions'
import {
  sameBillResolution, differentMetersResolution, estimateResolution, usedNoneResolution, deliveriesCompleteResolution,
  exactDuplicateCountOnce, exactDuplicateNotSame,
} from './coverageActions'
import { inventoryRow } from './freeCalc'
import { emptyLocation, deriveLocations, withFleetTypeTicked, type Location, type Inventory, type SourceDoc, type ExtractedProposal, type CoverageResolution } from './engine'
import { TEST_PREPARED_ON } from '../testing/heldSelection'

type Who = { userId: string; email: string }
const OTHER: Who = { userId: 'u-other', email: 'other@acme.example' }
const OTHER_AT = '2026-09-30T08:00:00.000Z'

const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'Gas used 100 MCF', notes: null, status: 'confirmed', ...o,
})
const gdoc = (id: string, p: ExtractedProposal, document_type = 'utility_bill_gas'): SourceDoc =>
  ({ id, file_name: `${id}.pdf`, document_type, uploaded_at: '2025-06-01', file_path: `/${id}.pdf`, extracted: [p] })
// A counted January bill beside the bill the action is taken on, so the row exists whatever the action does to it.
const gasSite = (target: ExtractedProposal): Location => ({
  ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf',
  source_docs: [gdoc('jan', prop({})), gdoc('feb', target)],
})
const FEB = { periodStart: '2025-02-01', periodEnd: '2025-02-28' }
const inv = (l: Location, reporting_year = 2025): Inventory =>
  ({ company_name: 'Acme', reporting_year, revenue_millions: 0, fiscal_year_end_month: 12, locations: [l], coverage_resolutions: [] } as unknown as Inventory)

// The page's updateProposal: the patch passes guardConfirm and touches only its own proposal.
const onTarget = (l: Location, patchFor: (p: ExtractedProposal) => Partial<ExtractedProposal>): Location => ({
  ...l,
  source_docs: l.source_docs.map(d => d.id !== 'feb' ? d
    : { ...d, extracted: d.extracted!.map(p => ({ ...p, ...guardConfirm(p, patchFor(p), d.document_type) })) }),
})
const typedFigure = (l: Location) => deriveLocations(inv(l))[0].natural_gas_amount

// `save`, when given, is how the action reaches the record: a save that names who is saving (typed entries), or the
// free-calculator claim. Otherwise the inventory is saved as figuresForSave alone.
type Saved = { workings: unknown; locations_data: unknown }
type Action = { name: string; act: (by: Who, at: string) => Inventory; save?: (i: Inventory, by: Who, at: string) => Saved }
// T18 diff 3: an inventory whose coverage resolutions include `r`, and the fixtures each kind validates against.
const withResolution = (l: Location, r: CoverageResolution, year = 2025): Inventory => ({ ...inv(l, year), coverage_resolutions: [r] } as Inventory)
const doc = (id: string, document_type: string, p: ExtractedProposal, o: Partial<SourceDoc> = {}): SourceDoc => ({ ...gdoc(id, p, document_type), ...o })
const dieselTwins = (): Location => ({ ...emptyLocation('L1', 'Depot'), has_diesel_stationary: true, has_mobile: true, source_docs: [
  doc('tank', 'fuel_diesel', prop({ fuelType: 'diesel', rawUnit: 'gallons', unit: 'gallons', ...FEB })),
  doc('fleet', 'fleet_fuel', prop({ fuelType: 'diesel', rawUnit: 'gallons', unit: 'gallons', ...FEB }))] })
const TANK = { id: 'tank', file: 'tank.pdf', documentType: 'fuel_diesel' }, FLEET = { id: 'fleet', file: 'fleet.pdf', documentType: 'fleet_fuel' }
const typedGas = (): Location => ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf', natural_gas_amount: 420, source_docs: [] })
const ACTIONS: Action[] = [
  { name: 'confirm', act: (by, at) => inv(onTarget(gasSite(prop({ ...FEB, status: 'extracted' })), p => confirmProposal(p, { by, at }))) },
  { name: 'edit figure', act: (by, at) => inv(onTarget(gasSite(prop({ ...FEB, status: 'extracted' })), p => editFigure(p, { value: 90, by, at }))) },
  { name: 'flag', act: (by, at) => inv(onTarget(gasSite(prop({ ...FEB, status: 'extracted' })), p => flagProposal(p, { by, at }))) },
  { name: 'edit dates', act: (by, at) => inv(onTarget(gasSite(prop({ ...FEB })), p => editPeriod(p, { start: '2025-02-02', end: '2025-02-28', by, at }))) },
  { name: 'confirm dates', act: (by, at) => inv(onTarget(gasSite(prop({ ...FEB, periodConfidence: 'medium', status: 'extracted' })),
    p => editPeriod(p, { start: FEB.periodStart, end: FEB.periodEnd, by, at }))) },
  { name: 'edit unit', act: (by, at) => inv(onTarget(gasSite(prop({ ...FEB, rawUnit: 'therms', unit: 'therms' })), p => editUnit(p, { unit: 'mcf', by, at }))) },
  // T18: the unit changed on a reading whose figure was typed. The figure is cleared; the change is recorded on the
  // reading's own unpriced row, since a reading with no figure has no contribution.
  { name: 'edit unit after edit figure', act: (by, at) => {
    const typed = onTarget(gasSite(prop({ ...FEB, rawUnit: 'therms', unit: 'therms', rawValue: 120, value: 120, status: 'extracted' })),
      p => editFigure(p, { value: 112, by: OTHER, at: OTHER_AT }))
    return inv(onTarget(typed, p => editUnit(p, { unit: 'mcf', by, at })))
  } },
  { name: 'reject', act: (by, at) => inv(onTarget(gasSite(prop({ ...FEB })), p => rejectProposal(p, { by, at }))) },
  { name: 'undo', act: (by, at) => {
    const rejected = onTarget(gasSite(prop({ ...FEB })), p => rejectProposal(p, { by: OTHER, at: OTHER_AT }))
    return inv(onTarget(rejected, p => undoRejection(p, { by, at })))
  } },
  { name: 'override', act: (by, at) => {
    const l = gasSite(prop({ ...FEB }))
    return inv({ ...l, ...addOverride(l, { field: 'natural_gas_amount', reason: 'Bills were estimated', by, at, startFrom: typedFigure(l) }) })
  } },
  { name: 'remove override', act: (by, at) => {
    const l0 = gasSite(prop({ ...FEB }))
    const l = { ...l0, ...addOverride(l0, { field: 'natural_gas_amount', reason: 'Bills were estimated', by: OTHER, at: OTHER_AT, startFrom: typedFigure(l0) }) }
    return inv({ ...l, ...removeOverride(l, { field: 'natural_gas_amount', by, at }) })
  } },
  // T18 diff 2: the document lifecycle. Each acts on the February document; the location's patch is applied whole.
  { name: 'withdraw', act: (by, at) => {
    const l = gasSite(prop({ ...FEB }))
    return inv({ ...l, ...withdrawDocument(l, 'feb', { by, at, reason: 'Duplicate upload' }) })
  } },
  { name: 'restore', act: (by, at) => {
    const l0 = gasSite(prop({ ...FEB }))
    const l = { ...l0, ...withdrawDocument(l0, 'feb', { by: OTHER, at: OTHER_AT, reason: 'Checking it' }) }
    return inv({ ...l, ...restoreDocument(l, 'feb', { by, at, reason: 'Checked' }) })
  } },
  { name: 'delete permanently', act: (by, at) => {
    const l = gasSite(prop({ ...FEB }))
    return inv({ ...l, ...deleteDocument(l, 'feb', { by, at, mode: 'permanently', reason: 'Wrong customer' }) })
  } },
  { name: 'delete unused', act: (by, at) => {
    const l = gasSite(prop({ ...FEB, status: 'extracted' }))
    return inv({ ...l, ...deleteDocument(l, 'feb', { by, at, mode: 'unused' }) })
  } },
  // T18 diff 3: a typed figure, saved by the person saving; and one typed before sign-in, claimed.
  { name: 'typed entry', act: () => inv(typedGas()), save: (i, by, at) => figuresForSave(i, 'AR6', { preparedOn: TEST_PREPARED_ON }, { by, at }) },
  { name: 'typed entry at claim', act: () => inv(typedGas()), save: (i, by, at) => inventoryRow(i, by.userId, 'co-1', true, new Date(at), by) },
  // T18 diff 3: every coverage resolution, as the strip builds it.
  { name: 'same bill', act: (by, at) => withResolution(gasSite(prop({ ...FEB })),
    sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: { id: 'jan', file: 'jan.pdf' }, excluded: { id: 'feb', file: 'feb.pdf' }, by, at })) },
  { name: 'different meters', act: (by, at) => {
    const l = gasSite(prop({ ...FEB }))
    const labelled = { ...l, source_docs: l.source_docs.map(d => d.id === 'feb' ? { ...d, meter_label: 'Meter 2' } : d) }
    return withResolution(labelled, differentMetersResolution({ locId: 'L1', fuelType: 'natural_gas', doc: { id: 'feb', file: 'feb.pdf' }, meterLabel: 'Meter 2', by, at }))
  } },
  { name: 'estimate', act: (by, at) => withResolution(gasSite(prop({ ...FEB })),
    estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: null, monthsCovered: 2, pctEstimated: 83.3, by, at })) },
  { name: 'used none', act: (by, at) => withResolution(gasSite(prop({ ...FEB })),
    usedNoneResolution({ locId: 'L1', fuelType: 'natural_gas', field: 'natural_gas_amount', fuelName: 'natural gas', by, at })) },
  { name: 'deliveries complete', act: (by, at) => {
    const lpg = (id: string, date: string) => doc(id, 'fuel_propane', prop({ fuelType: 'propane', rawUnit: 'gallons', unit: 'gallons', periodStart: date, periodEnd: date }))
    const l: Location = { ...emptyLocation('L1', 'Site A'), has_propane: true, propane_unit: 'gallons', source_docs: [lpg('d1', '2025-03-04'), lpg('d2', '2025-09-10')] }
    return withResolution(l, deliveriesCompleteResolution({ locId: 'L1', fuelType: 'propane', documentType: 'fuel_propane', docIds: ['d1', 'd2'], statement: 'All deliveries.', by, at }))
  } },
  { name: 'exact duplicate, count once', act: (by, at) => withResolution(dieselTwins(),
    exactDuplicateCountOnce({ locId: 'L1', fuelType: 'diesel', counted: TANK, excluded: FLEET, by, at })) },
  { name: 'exact duplicate, not the same', act: (by, at) => withResolution(dieselTwins(),
    exactDuplicateNotSame({ locId: 'L1', fuelType: 'diesel', docs: [TANK, FLEET], by, at })) },
  // T18 diff 4 (section D): a second location is deleted. Its record is the inventory's location_log; the location
  // itself is gone from locations_data.
  { name: 'delete location with documents', act: (by, at) => {
    const keep = gasSite(prop({ ...FEB }))
    const gone: Location = { ...gasSite(prop({ ...FEB })), id: 'L2', name: 'Leeds', country: 'GB' }
    return { ...inv(keep), location_log: [locationDeleteRecord(gone, { by, at, reason: 'Site closed in 2024' })] } as Inventory
  } },
  { name: 'delete location without documents', act: (by, at) => {
    const keep = gasSite(prop({ ...FEB }))
    const gone: Location = { ...emptyLocation('L3', 'Annex'), country: 'US', source_docs: [] }
    return { ...inv(keep), location_log: [locationDeleteRecord(gone, { by, at })] } as Inventory
  } },
  { name: 'fleet type', act: (by, at) => {
    const diesel = (o: Partial<ExtractedProposal>) => prop({ fuelType: 'diesel', rawValue: 500, rawUnit: 'litres', value: 500, unit: 'litres', sourceQuote: '500 litres', ...o })
    // A confirmed heavy-vehicle bill for January to June, so the row exists; the choice is made on July to December's.
    const l: Location = { ...emptyLocation('L1', 'Depot'), country: 'GB', grid_region: 'UK', has_mobile: true, source_docs: [
      gdoc('jan', diesel({ fleetType: 'heavy', periodStart: '2026-01-01', periodEnd: '2026-06-30' }), 'fleet_fuel'),
      gdoc('feb', diesel({ status: 'extracted', periodStart: '2026-07-01', periodEnd: '2026-12-31' }), 'fleet_fuel')] }
    const chosen = onTarget(l, p => chooseFleetType(p, 'heavy', { by, at }))
    return inv(withFleetTypeTicked(chosen, 'heavy'), 2026)
  } },
]

// Every action diff 1 builds or closes, and those recorded before T18. Diffs 2 and 3 extend this list.
const EXPECTED = [
  'confirm', 'edit figure', 'flag', 'edit dates', 'confirm dates', 'edit unit', 'edit unit after edit figure', 'reject', 'undo', 'override', 'remove override',
  'withdraw', 'restore', 'delete permanently', 'delete unused',
  'typed entry', 'typed entry at claim', 'same bill', 'different meters', 'estimate', 'used none', 'deliveries complete',
  'exact duplicate, count once', 'exact duplicate, not the same', 'delete location with documents', 'delete location without documents', 'fleet type',
]

/** True when some object in `node` holds `at` as one value and a person with `email` as another. */
function holdsWhoAndWhen(node: unknown, email: string, at: string): boolean {
  if (Array.isArray(node)) return node.some(n => holdsWhoAndWhen(n, email, at))
  if (!node || typeof node !== 'object') return false
  const values = Object.values(node)
  if (values.includes(at) && values.some(v => !!v && typeof v === 'object' && (v as { email?: unknown }).email === email)) return true
  return values.some(v => holdsWhoAndWhen(v, email, at))
}

const saved = (i: Inventory) => figuresForSave(i, 'AR6', { preparedOn: TEST_PREPARED_ON })

describe('T18: every review action leaves who and when in the saved workings', () => {
  it('the list covers every action built so far', () => {
    expect(ACTIONS.map(a => a.name)).toEqual(EXPECTED)
  })

  ACTIONS.forEach((a, i) => {
    it(a.name, () => {
      const by: Who = { userId: `u-${i}`, email: `${a.name.replace(/ /g, '-')}@acme.example` }
      const at = `2026-10-0${1 + (i % 9)}T${String(i % 24).padStart(2, '0')}:${String(i).padStart(2, '0')}:00.000Z`
      const i0 = a.act(by, at)
      const { workings, locations_data } = a.save ? a.save(i0, by, at) : saved(i0)
      expect(holdsWhoAndWhen(workings, by.email, at), `${a.name}: who and when in the saved workings`).toBe(true)
      // The raw locations are saved too; the record is there as well as in the workings. A coverage resolution is
      // saved in its own column, not in locations_data, so it is checked there instead.
      // A deleted location's record is saved in its own column (location_log), so it is checked there too.
      const elsewhere = a.save ? locations_data : [locations_data, i0.coverage_resolutions, i0.location_log]
      expect(holdsWhoAndWhen(elsewhere, by.email, at), `${a.name}: who and when in what is saved beside the workings`).toBe(true)
    })
  })

  it('edit unit after edit figure: the saved workings hold the reading as an unpriced line, and the other bill still counts', () => {
    const by: Who = { userId: 'u-x', email: 'unit@acme.example' }
    const { workings, totals } = saved(ACTIONS.find(a => a.name === 'edit unit after edit figure')!.act(by, '2026-10-05T10:00:00.000Z'))
    const rows = workings as { stream?: string; result_tco2e: number | null; unpriced?: { reason: string }; reading_cleared?: { docId: string; figureCleared: unknown; by: Who } }[]
    const line = rows.filter(r => r.reading_cleared)
    expect(line.map(r => [r.unpriced?.reason, r.result_tco2e, r.reading_cleared?.docId, r.reading_cleared?.by.email])).toEqual([['figure_cleared', null, 'feb', 'unit@acme.example']])
    expect(line[0].reading_cleared?.figureCleared).toEqual({ value: 112, unit: 'therms', toUnit: 'mcf' })
    expect(rows.some(r => r.stream === 'natural_gas' && (r.result_tco2e ?? 0) > 0), 'January is priced').toBe(true)
    expect(totals.s1_total).toBeGreaterThan(0)
  })

  // T18: the save only ever appends. For every action, the saved record keeps every typed entry and document-log
  // entry the inventory held going into the save, so the page's append-only guard never refuses a real action.
  it('no action\'s save drops or changes an earlier typed entry or document-log entry', () => {
    ACTIONS.forEach((a, i) => {
      const by: Who = { userId: `u-${i}`, email: 'later@acme.example' }
      const i0 = a.act(by, OTHER_AT)
      const once = (a.save ? a.save(i0, by, OTHER_AT) : saved(i0)).locations_data as Location[]
      const again = saved({ ...i0, locations: once }).locations_data as Location[]
      const after = figuresForSave({ ...i0, locations: once.map(l => ({ ...l, natural_gas_amount: 999 })) }, 'AR6', { preparedOn: TEST_PREPARED_ON },
        { by, at: '2026-10-08T00:00:00.000Z' }).locations_data as Location[]
      for (const out of [again, after]) {
        expect(typedEntriesProblem(typedEntriesBaseline(once), out), a.name).toBeNull()
        expect(documentLogProblem(documentLogBaseline(once), out), a.name).toBeNull()
      }
    })
  })

  it('the matcher finds nothing where nothing was recorded', () => {
    const { workings } = saved(inv(gasSite(prop({ ...FEB, status: 'extracted' }))))
    expect(holdsWhoAndWhen(workings, 'confirm@acme.example', '2026-10-01T10:00:00.000Z')).toBe(false)
  })
})
