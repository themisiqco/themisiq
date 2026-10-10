// lib/billReview/spotCheck.test.ts
//
// BR8b (Q4): the sample, the merge onto the customer's reading, and the export block, with each way it clears.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { emptyLocation, deriveLocations, findUnresolvedCoverage, spotCheckOpen, type Location, type SourceDoc, type ExtractedProposal } from '../ghg/engine'
import { confirmProposal, editFigure } from '../ghg/proposalEdits'
import { withdrawDocument, deleteDocument } from '../ghg/documentActions'
import { spotCheckSample, sampleKey, inSample, type SampleInventory } from './spotCheckSample'
import { mergeSpotChecks, type SpotCheckRow } from './spotCheckMerge'

const BY = { userId: 'cust-1', email: 'jo@acme.example' }
const confirmed = (o: Partial<ExtractedProposal> = {}): ExtractedProposal => ({ fuelType: 'electricity', rawValue: 4210, rawUnit: 'kWh', value: 4210, unit: 'kwh',
  periodStart: '2026-01-01', periodEnd: '2026-01-31', periodOrigin: 'printed', confidence: 'high', sourceQuote: 'Total 4,210 kWh', notes: null, status: 'confirmed',
  confirmations: [{ at: '2026-10-01T09:00:00.000Z', by: BY, reading: {} as never }], ...o } as ExtractedProposal)
const doc = (id: string, o: Partial<SourceDoc> = {}): SourceDoc => ({ id, file_name: `${id}.pdf`, document_type: 'utility_electricity', uploaded_at: '', file_path: `cust-1/inv-1/2026/Leeds/${id}.pdf`, extracted: [confirmed()], ...o })
const loc = (docs: SourceDoc[]): Location => ({ ...emptyLocation('L1', 'Leeds'), country: 'GB', has_electricity: true, source_docs: docs } as Location)
const inv = (id: string, docs: SourceDoc[]): SampleInventory => ({ id, user_id: 'cust-1', company_name: 'Acme Ltd', reporting_year: 2026, fiscal_year_end_month: 12, locations_data: [loc(docs)] })
/** The first document ids whose reading is in (or out of) the sample. */
const ids = (want: boolean, n: number, inventoryId = 'inv-1') => { const out: string[] = []; for (let i = 0; out.length < n; i++) if (inSample(sampleKey(inventoryId, `d${i}`, 'electricity', 0)) === want) out.push(`d${i}`); return out }

describe('BR8b sample: 10%, random, stable', () => {
  it('about 1 in 10 readings, by md5 of the reading’s identity', () => {
    let n = 0
    for (let i = 0; i < 5000; i++) if (inSample(sampleKey(`inv-${i % 37}`, `doc-${i}`, 'electricity', i % 3))) n++
    expect(n / 5000).toBeGreaterThan(0.08)
    expect(n / 5000).toBeLessThan(0.12)
  })
  it('stable: the same reading is in or out every time, whatever else is in the inventory', () => {
    const [a] = ids(true, 1), [b] = ids(false, 1)
    for (let k = 0; k < 3; k++) {
      expect(spotCheckSample([inv('inv-1', [doc(a), doc(b)])], new Set()).map(s => s.doc.id)).toEqual([a])
      expect(spotCheckSample([inv('inv-1', [doc(b), doc(a), doc('zz', { extracted: [] })])], new Set()).map(s => s.doc.id)).toEqual([a])
    }
  })
  it('never a human-read bill, a reading the team made, an unconfirmed or withdrawn one, or one already checked', () => {
    const [a, b, c, d, e] = ids(true, 5)
    const items = spotCheckSample([inv('inv-1', [
      doc(a, { bill_review: { reading: 'human' } }),
      doc(b, { extracted: [confirmed({ readBy: { method: 'human', readingId: 'r', at: '' } })] }),
      doc(c, { extracted: [confirmed({ status: 'extracted', confirmations: [] })] }),
      doc(d, { withdrawn: { at: '', by: BY, reason: 'x' } }),
      doc(e),
    ])], new Set([sampleKey('inv-1', e, 'electricity', 0)]))
    expect(items).toEqual([])
  })
  it('oldest confirmed first', () => {
    const [a, b] = ids(true, 2)
    const items = spotCheckSample([inv('inv-1', [
      doc(a, { extracted: [confirmed({ confirmations: [{ at: '2026-10-05T00:00:00Z', by: BY, reading: {} as never }] })] }),
      doc(b, { extracted: [confirmed({ confirmations: [{ at: '2026-10-02T00:00:00Z', by: BY, reading: {} as never }] })] }),
    ])], new Set())
    expect(items.map(s => s.doc.id)).toEqual([b, a])
  })
})

describe('BR8b: the difference on the customer’s bill, and the export block', () => {
  const check: SpotCheckRow = { id: 'sc-1', source_doc_id: 'd1', fuel_type: 'electricity', proposal_index: 0, result: 'disagrees', note: 'The bill shows 4,120 kWh, not 4,210.', checked_at: '2026-10-22T10:00:00.123456+00:00' }
  const merged = () => mergeSpotChecks([loc([doc('d1')])], [check]).locations[0]
  const issues = (l: Location) => findUnresolvedCoverage([l], 2026, 12, []).filter(i => i.status === 'spot_check_difference')
  it('lands on the reading it is about, without a staff id; again adds nothing; an agreement adds nothing', () => {
    const l = merged()
    expect(l.source_docs[0].extracted![0].spotCheck).toEqual({ checkId: 'sc-1', note: 'The bill shows 4,120 kWh, not 4,210.', checkedAt: '2026-10-22T10:00:00.123Z' })
    expect(JSON.stringify(l)).not.toMatch(/checked_by|staff/)
    expect(mergeSpotChecks([l], [check]).changed).toBe(false)
    expect(mergeSpotChecks([loc([doc('d1')])], [{ ...check, result: 'agrees', note: null }]).changed).toBe(false)
  })
  it('blocks export, with the ruled words', () => {
    expect(issues(merged()).map(i => i.message)).toEqual(['Our team checked this reading and found a difference: The bill shows 4,120 kWh, not 4,210. Review it, then confirm the figure again or correct it.'])
  })
  it('the confirmed figure is never changed', () => {
    const before = deriveLocations({ locations: [loc([doc('d1')])], reporting_year: 2026 })[0].electricity_kwh
    const l = merged()
    expect(l.source_docs[0].extracted![0]).toMatchObject({ value: 4210, rawValue: 4210, status: 'confirmed' })
    expect(deriveLocations({ locations: [l], reporting_year: 2026 })[0].electricity_kwh).toBe(before)
  })
  it('clears when the customer confirms that reading again, after the check, with who and when', () => {
    const l = merged(); const p = l.source_docs[0].extracted![0]
    const again = { ...p, ...confirmProposal(p, { by: BY, at: '2026-10-23T09:00:00.000Z' }) }
    expect(again.confirmations!.at(-1)).toMatchObject({ at: '2026-10-23T09:00:00.000Z', by: BY })
    expect(spotCheckOpen(again)).toBe(false)
    expect(issues({ ...l, source_docs: [{ ...l.source_docs[0], extracted: [again] }] })).toEqual([])
    // A confirmation from before the check does not clear it.
    expect(spotCheckOpen({ ...p, ...confirmProposal(p, { by: BY, at: '2026-10-22T09:00:00.000Z' }) })).toBe(true)
  })
  it('clears when the customer corrects the reading', () => {
    const l = merged(); const p = l.source_docs[0].extracted![0]
    const corrected = { ...p, ...editFigure(p, { value: 4120, by: BY, at: '2026-10-23T09:00:00.000Z' }) }
    expect(spotCheckOpen(corrected)).toBe(false)
  })
  it('clears when the customer withdraws or deletes the bill', () => {
    const l = merged()
    expect(issues({ ...l, ...withdrawDocument(l, 'd1', { by: BY, at: '2026-10-23T09:00:00Z', reason: 'Duplicate' }) } as Location)).toEqual([])
    expect(issues({ ...l, ...deleteDocument(l, 'd1', { by: BY, at: '2026-10-23T09:00:00Z', mode: 'permanently', reason: 'Wrong site' }) } as Location)).toEqual([])
  })
  it('the wizard reads the checks without checked_by, offers "Confirm again" through confirmProposal, and shows the block in the strip', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain(".select('id, source_doc_id, fuel_type, proposal_index, result, note, checked_at').eq('inventory_id', invId).eq('result', 'disagrees')")
    const selects = [...page.matchAll(/from\('bill_review_spot_checks'\)\s*\.select\('([^']*)'\)/g)].map(m => m[1])
    expect(selects).toHaveLength(1)
    expect(selects[0]).not.toContain('checked_by')
    expect(page).toContain("spotCheckOpen(p) ? (\n                          <button disabled={!currentUser} onClick={() => currentUser && onUpdateProposal(locIdx, doc.id, pi, confirmProposal(p, { by: currentUser, at: new Date().toISOString() }))}")
    expect(readFileSync(join(process.cwd(), 'app/dashboard/ghg/_components/CoverageStrip.tsx'), 'utf8')).toContain("i.status === 'spot_check_difference'")
  })
})
