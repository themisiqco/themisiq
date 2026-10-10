// lib/billReview/br4.test.ts
//
// BR4: a specialist's reading merged as a proposal; a bill's state after each T18 action; Q12's override beside a
// waiting bill. Pure: the engine, the merge and the document actions are real.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { emptyLocation, deriveLocations, documentsBacking, type Location, type SourceDoc } from '../ghg/engine'
import { documentActionsFor, withdrawDocument, restoreDocument, deleteDocument, locationDeleteRecord } from '../ghg/documentActions'
import { confirmProposal, rejectProposal } from '../ghg/proposalEdits'
import { addOverride } from '../ghg/overrides'
import { mergeReadings, readingToProposal, type ReadingRow } from './mergeReadings'
import { isWaiting, withTeamFor, customerBillState, type BillReviewRow } from './billState'
import { withTeamLine, correctionNotice, unreadableNote } from './waitingWords'
import { FigureInput } from '../../app/dashboard/ghg/_components/FigureInput'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const AT = '2026-10-22T10:00:00.000Z'
const doc = (id = 'd1', o: Partial<SourceDoc> = {}): SourceDoc => ({
  id, file_name: `${id}.pdf`, document_type: 'utility_electricity', uploaded_at: '2026-10-19T14:00:00Z', file_path: `u/inv/2026/Leeds/1_${id}.pdf`,
  read_outcome: 'not_read', read_note: 'Kept for a ThemisIQ specialist to read. It is not sent to the AI.', bill_review: { reading: 'human' }, ...o,
})
const loc = (docs: SourceDoc[]): Location => ({ ...emptyLocation('L1', 'Leeds'), country: 'GB', has_electricity: true, source_docs: docs } as Location)
const row = (o: Partial<BillReviewRow> = {}): BillReviewRow => ({ id: 'r-d1', source_doc_id: 'd1', file_path: 'u/inv/2026/Leeds/1_d1.pdf', location_id: 'L1',
  status: 'read', expected_by: '2026-10-21', expected_by_refusal: null, unreadable_note: null, read_at: AT, ...o })
const reading = (o: Partial<ReadingRow> = {}): ReadingRow => ({ id: 'rd-1', bill_review_document_id: 'r-d1', fuel_type: 'electricity', raw_value: '4210', raw_unit: 'kWh',
  period_start: '2026-01-01', period_end: '2026-01-31', delivery_date: null, source_quote: 'Total usage 4,210 kWh', notes: null, supersedes: null, read_at: AT, ...o })
const docOf = (ls: Location[]) => ls[0].source_docs[0]

describe('BR4 merge: a specialist’s reading becomes a proposal of the same shape as an AI one', () => {
  it('the same keys as the AI reading’s proposal in the upload handler, plus readBy, and no staff user id', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    const block = page.slice(page.indexOf('.map((f: any): ExtractedProposal => {'), page.indexOf("status: needsReview ? 'needs_manual_review' : 'extracted',"))
    const aiKeys = [...block.matchAll(/^\s+([a-zA-Z]+):/gm)].map(m => m[1]).concat('status').sort()
    const p = readingToProposal(reading())
    expect(Object.keys(p).filter(k => k !== 'readBy').sort()).toEqual(aiKeys)
    expect(p.readBy).toEqual({ method: 'human', readingId: 'rd-1', at: AT })
    expect(JSON.stringify(p)).not.toMatch(/read_by|userId/)
  })
  it('the value goes through convertToCanonical, and the status is the AI rule’s', () => {
    expect(readingToProposal(reading())).toMatchObject({ rawValue: 4210, rawUnit: 'kWh', value: 4210, unit: 'kwh', status: 'extracted', periodOrigin: 'printed', confidence: 'high' })
    expect(readingToProposal(reading({ raw_value: '12', raw_unit: 'MWh' }))).toMatchObject({ value: 12000, unit: 'kwh' })
    expect(readingToProposal(reading({ raw_unit: 'furlongs' })).status).toBe('needs_manual_review')
    expect(readingToProposal(reading({ period_start: null, period_end: null, delivery_date: '2026-02-03' }))).toMatchObject({ deliveryDate: '2026-02-03', periodOrigin: 'delivery' })
  })
  it('merged into the bill, which is no longer "with our team"', () => {
    const m = mergeReadings([loc([doc()])], [row()], [reading()])
    expect(m.changed).toBe(true)
    const d = docOf(m.locations)
    expect(d.extracted).toHaveLength(1)
    expect(d.read_note).toBeUndefined()
    expect(d.read_outcome).toBeUndefined()
    expect(isWaiting(d, row())).toBe(false)
  })
  it('a second merge adds nothing', () => {
    const once = mergeReadings([loc([doc()])], [row()], [reading()])
    const twice = mergeReadings(once.locations, [row()], [reading()])
    expect(twice.changed).toBe(false)
    expect(twice.locations).toBe(once.locations)
  })
  it('a waiting bill, or a reading of a bill not yet marked read, merges nothing', () => {
    expect(mergeReadings([loc([doc()])], [row({ status: 'waiting', read_at: null })], [reading()]).changed).toBe(false)
  })
  it('a correction replaces a proposal the customer has not acted on', () => {
    const once = mergeReadings([loc([doc()])], [row()], [reading()])
    const fixed = mergeReadings(once.locations, [row()], [reading(), reading({ id: 'rd-2', raw_value: '4120', supersedes: 'rd-1' })])
    expect(docOf(fixed.locations).extracted!.map(p => [p.readBy?.readingId, p.rawValue])).toEqual([['rd-2', 4120]])
  })
  it('a confirmed proposal is not overwritten: the correction is held, with the notice', () => {
    const once = mergeReadings([loc([doc()])], [row()], [reading()])
    const d0 = docOf(once.locations)
    const confirmed = { ...d0, extracted: [{ ...d0.extracted![0], ...confirmProposal(d0.extracted![0], { by: BY, at: AT }) }] }
    const m = mergeReadings([loc([confirmed])], [row()], [reading(), reading({ id: 'rd-2', raw_value: '4120', supersedes: 'rd-1' })])
    const d = docOf(m.locations)
    expect(d.extracted!.map(p => [p.readBy?.readingId, p.status, p.rawValue])).toEqual([['rd-1', 'confirmed', 4210]])
    expect(d.bill_review?.correctionsPending).toEqual([{ readingId: 'rd-2', supersedes: 'rd-1', fuelType: 'electricity', rawValue: 4120, rawUnit: 'kWh', at: AT }])
    expect(correctionNotice(d.bill_review!.correctionsPending![0], 'confirmed')).toBe('Our team corrected this reading after you confirmed it: 4120 kWh. Review it.')
    expect(mergeReadings(m.locations, [row()], [reading(), reading({ id: 'rd-2', raw_value: '4120', supersedes: 'rd-1' })]).changed).toBe(false)
  })
  it('a rejected proposal is not overwritten either', () => {
    const once = mergeReadings([loc([doc()])], [row()], [reading()])
    const d0 = docOf(once.locations)
    const rejected = { ...d0, extracted: [{ ...d0.extracted![0], ...rejectProposal(d0.extracted![0], { by: BY, at: AT }) }] }
    const d = docOf(mergeReadings([loc([rejected])], [row()], [reading(), reading({ id: 'rd-2', supersedes: 'rd-1' })]).locations)
    expect(d.extracted![0].status).toBe('rejected')
    expect(d.bill_review?.correctionsPending).toHaveLength(1)
  })
  it('a bill the team could not read says so, in plain words', () => {
    const d = docOf(mergeReadings([loc([doc()])], [row({ status: 'unreadable', unreadable_note: 'The meter section is torn off.' })], []).locations)
    expect(d.read_outcome).toBe('abstained')
    expect(d.read_note).toBe('Our team could not read a figure from this bill: The meter section is torn off. Type it into the box above.')
    expect(unreadableNote(null)).toBe('Our team could not read a figure from this bill. Type it into the box above.')
  })
})

describe('BR4: each T18 action on a waiting bill, and what BR8 reads from the saved inventory', () => {
  const waiting = loc([doc()])
  it('a waiting bill offers Delete (unused) and Delete permanently, never Withdraw', () => {
    expect(documentActionsFor(waiting.source_docs[0])).toEqual(['delete_unused', 'delete_permanently'])
    expect(customerBillState([waiting], [], 'd1')).toBe('on_inventory')
  })
  it('delete unused: off the inventory, a tombstone; the state is deleted; nothing of it merges', () => {
    const after = { ...waiting, ...deleteDocument(waiting, 'd1', { by: BY, at: AT, mode: 'unused' }) } as Location
    expect(customerBillState([after], [], 'd1')).toBe('deleted')
    expect(mergeReadings([after], [row()], [reading()]).changed).toBe(false)
  })
  it('delete permanently: the same, with its reason', () => {
    const after = { ...waiting, ...deleteDocument(waiting, 'd1', { by: BY, at: AT, mode: 'permanently', reason: 'Wrong site' }) } as Location
    expect(customerBillState([after], [], 'd1')).toBe('deleted')
  })
  it('withdraw and restore, once a reading has arrived and been confirmed', () => {
    const read = mergeReadings([waiting], [row()], [reading()]).locations[0]
    const d0 = read.source_docs[0]
    const confirmedLoc = { ...read, source_docs: [{ ...d0, extracted: [{ ...d0.extracted![0], ...confirmProposal(d0.extracted![0], { by: BY, at: AT }) }] }] } as Location
    expect(documentActionsFor(confirmedLoc.source_docs[0])).toEqual(['withdraw', 'delete_permanently'])
    const withdrawn = { ...confirmedLoc, ...withdrawDocument(confirmedLoc, 'd1', { by: BY, at: AT, reason: 'Duplicate upload' }) } as Location
    expect(customerBillState([withdrawn], [], 'd1')).toBe('withdrawn')
    // A correction while withdrawn is not merged; restore brings the bill back on the inventory.
    expect(mergeReadings([withdrawn], [row()], [reading(), reading({ id: 'rd-2', supersedes: 'rd-1' })]).changed).toBe(false)
    const restored = { ...withdrawn, ...restoreDocument(withdrawn, 'd1', { by: BY, at: AT, reason: 'Not a duplicate' }) } as Location
    expect(customerBillState([restored], [], 'd1')).toBe('on_inventory')
  })
  it('the bill’s location deleted: the tombstone is in location_log', () => {
    const record = locationDeleteRecord(waiting, { by: BY, at: AT, reason: 'Site closed' })
    expect(customerBillState([], [record], 'd1')).toBe('deleted')
  })
  it('a bill never saved to the inventory', () => {
    expect(customerBillState([loc([])], [], 'd1')).toBe('not_on_inventory')
  })
})

describe('Q12: a figure waiting on the team, entered by the customer as a T10 override', () => {
  const by = { userId: 'u-1', email: 'jo@acme.example' }
  const render = (l: Location, rows: Record<string, BillReviewRow>) => renderToStaticMarkup(createElement(FigureInput, {
    loc: l, field: 'electricity_kwh', onChange: () => {}, style: {}, by, onOverride: () => {}, onUseBills: () => {}, withTeam: withTeamFor(l, 'electricity_kwh', rows) }))
  const waitingRow = row({ status: 'waiting', read_at: null })
  it('the field says it is with the team, with the date, and offers to enter it instead', () => {
    const html = render(loc([doc()]), { [waitingRow.file_path]: waitingRow })
    expect(html).toContain('With our team, expected by 21 October 2026.')
    expect(html).toContain('Enter the figure myself instead')
    expect(html).toContain('readOnly')
  })
  it('with no expected date, it says the date is not set, never a guess', () => {
    const r = row({ status: 'waiting', read_at: null, expected_by: null, expected_by_refusal: 'no_holiday_list:2029' })
    expect(render(loc([doc()]), { [r.file_path]: r })).toContain('With our team. The expected date is not set yet.')
    expect(withTeamLine(null)).toBe('With our team. The expected date is not set yet.')
  })
  it('a typed override survives a later merge, and the merged reading stays visible beside it', () => {
    const waitingLoc = loc([doc()])
    const overridden = { ...waitingLoc, ...addOverride(waitingLoc, { field: 'electricity_kwh', reason: 'Bill is late; using the meter reading', by, at: AT, startFrom: 0 }), electricity_kwh: 3900 } as Location
    const merged = mergeReadings([overridden], [row()], [reading()]).locations
    expect(merged[0].source_docs[0].extracted).toHaveLength(1)
    const derived = deriveLocations({ locations: merged, reporting_year: 2026 })[0]
    expect(derived.electricity_kwh).toBe(3900)
    expect(documentsBacking(derived, 'electricity_kwh')).toBe(1)
    const html = render(derived, {})
    expect(html).toContain('Entered manually by jo@acme.example')
    expect(html).toContain('instead of from 1 document. Reason: Bill is late; using the meter reading')
  })
  it('before the reading arrives, the override reads as waiting for the team', () => {
    const waitingLoc = loc([doc()])
    const overridden = { ...waitingLoc, ...addOverride(waitingLoc, { field: 'electricity_kwh', reason: 'Late bill', by, at: AT, startFrom: 0 }), electricity_kwh: 3900 } as Location
    const html = render(overridden, { [waitingRow.file_path]: waitingRow })
    expect(html).toContain('instead of waiting for our team. Reason: Late bill')
    expect(html).toContain('Wait for our team instead')
  })
})
