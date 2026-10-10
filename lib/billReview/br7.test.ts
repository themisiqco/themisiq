// lib/billReview/br7.test.ts
//
// BR7: running late in Toronto time; the export block for a bill with the team; the unreadable bill's box; the number
// in the correction notice; the two emails' words. The engine, the merge and the components are real.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { emptyLocation, findUnresolvedCoverage, type Location, type SourceDoc } from '../ghg/engine'
import { addOverride } from '../ghg/overrides'
import { confirmProposal } from '../ghg/proposalEdits'
import { deleteDocument } from '../ghg/documentActions'
import { yearLabel } from '../ghg/reportingYear'
import { mergeReadings, type ReadingRow } from './mergeReadings'
import { isWaiting, withTeamFor, type BillReviewRow } from './billState'
import { withTeamLine, correctionNotice } from './waitingWords'
import { buildReadyEmail, buildOverdueEmail } from './noticeEmails'
import { FigureInput } from '../../app/dashboard/ghg/_components/FigureInput'
import { BillReviewContext, BillReviewDocNotes } from '../../app/dashboard/ghg/_components/BillReviewNote'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const AT = '2026-10-22T10:00:00.000Z'
const doc = (o: Partial<SourceDoc> = {}): SourceDoc => ({ id: 'd1', file_name: 'jan.pdf', document_type: 'utility_electricity', uploaded_at: '2026-10-19T14:00:00Z',
  file_path: 'u/inv/2026/Leeds/1_jan.pdf', read_outcome: 'not_read', read_note: 'Kept for a ThemisIQ specialist to read. It is not sent to the AI.',
  bill_review: { reading: 'human', expectedBy: '2026-10-21' }, ...o })
const loc = (docs: SourceDoc[], o: Partial<Location> = {}): Location => ({ ...emptyLocation('L1', 'Leeds'), country: 'GB', has_electricity: true, source_docs: docs, ...o } as Location)
const row = (o: Partial<BillReviewRow> = {}): BillReviewRow => ({ id: 'r-d1', source_doc_id: 'd1', file_path: 'u/inv/2026/Leeds/1_jan.pdf', location_id: 'L1',
  status: 'read', expected_by: '2026-10-21', expected_by_refusal: null, unreadable_note: null, read_at: AT, ...o })
const reading: ReadingRow = { id: 'rd-1', bill_review_document_id: 'r-d1', fuel_type: 'electricity', raw_value: 4210, raw_unit: 'kWh',
  period_start: '2026-01-01', period_end: '2026-01-31', delivery_date: null, source_quote: 'Total 4,210 kWh', notes: null, supersedes: null, read_at: AT }
const teamIssues = (l: Location) => findUnresolvedCoverage([l], 2026, 12, []).filter(i => i.status === 'awaiting_reading' || i.status === 'reading_unreadable')

describe('Q7: running late, in Toronto time', () => {
  it('on time through the expected day in Toronto; late from the next Toronto day', () => {
    expect(withTeamLine('2026-10-21', new Date('2026-10-22T03:30:00Z'))).toBe('With our team, expected by 21 October 2026.')   // 23:30 Toronto, 21 Oct
    expect(withTeamLine('2026-10-21', new Date('2026-10-22T04:30:00Z'))).toBe('Running late. We expected this by 21 October 2026 and are still reading it.')   // 00:30, 22 Oct
    expect(withTeamLine(null, new Date('2030-01-01T00:00:00Z'))).toBe('With our team. The expected date is not set yet.')
  })
  it('the document list and the figure both say so', () => {
    const late = new Date('2026-10-23T15:00:00Z')
    const html = renderToStaticMarkup(createElement(BillReviewContext.Provider, { value: { rows: { [row().file_path]: row({ status: 'waiting', read_at: null }) }, submitFailed: {} } },
      createElement(BillReviewDocNotes, { doc: doc() })))
    expect(html).toContain(late > new Date() ? 'With our team' : 'Running late. We expected this by 21 October 2026 and are still reading it.')
    expect(readFileSync(join(process.cwd(), 'lib/billReview/waitingWords.ts'), 'utf8')).toContain('if (isLate(expectedBy, now)) return `Running late.')
  })
  it('a late bill is never sent to the AI: no code path from the page to extract depends on the date', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    const upload = page.slice(page.indexOf('const handleFileUpload'), page.indexOf('* Detach a source document'))
    expect([...page.matchAll(/fetch\('\/api\/concierge\/extract'/g)]).toHaveLength(1)
    // The only branch that reaches extract tests the reading alone; nothing in the upload reads lateness.
    expect(upload).toContain("} else if (CONCIERGE_DEV && reading === 'ai' && !CONCIERGE_UNREAD_DOC_TYPES.has(docType)) {")
    expect(upload).not.toMatch(/isLate|withTeamLine/)
  })
})

describe('BR7: the export block for a bill with the team', () => {
  it('a waiting bill blocks, with the ruled words, even when its field holds a typed figure', () => {
    const issues = teamIssues(loc([doc()], { electricity_kwh: 5000 }))
    expect(issues.map(i => [i.status, i.message])).toEqual([['awaiting_reading', 'jan.pdf is with our team, expected by 21 October 2026. Export is blocked until it is read and you confirm it.']])
  })
  it('without a date, it says so without one', () => {
    expect(teamIssues(loc([doc({ bill_review: { reading: 'human', expectedBy: null } })]))[0].message).toBe('jan.pdf is with our team. Export is blocked until it is read and you confirm it.')
  })
  it('it clears once read: the proposal arrives (and blocks as a pending proposal does) and, confirmed, nothing is left', () => {
    const merged = mergeReadings([loc([doc()])], [row()], [reading]).locations[0]
    expect(teamIssues(merged)).toEqual([])
    const d = merged.source_docs[0]
    const confirmed = { ...merged, source_docs: [{ ...d, extracted: [{ ...d.extracted![0], ...confirmProposal(d.extracted![0], { by: BY, at: AT }) }] }] } as Location
    expect(teamIssues(confirmed)).toEqual([])
    expect(confirmed.source_docs[0].extracted![0].status).toBe('confirmed')
  })
  it('it clears when every field the bill backs has a Q12 override', () => {
    const l = loc([doc()])
    const overridden = { ...l, ...addOverride(l, { field: 'electricity_kwh', reason: 'Late bill', by: BY, at: AT, startFrom: 0 }), electricity_kwh: 3900 } as Location
    expect(teamIssues(overridden)).toEqual([])
  })
  it('an unreadable bill: the ruled words; it clears once the field has a figure, or the bill is deleted', () => {
    const unreadable = mergeReadings([loc([doc()])], [row({ status: 'unreadable', unreadable_note: 'The meter section is torn off.' })], []).locations[0]
    expect(teamIssues(unreadable).map(i => [i.status, i.message])).toEqual([['reading_unreadable',
      'Our team could not read a figure from jan.pdf: The meter section is torn off. Enter the figure from the bill yourself, or delete the bill if it was uploaded by mistake.']])
    expect(teamIssues({ ...unreadable, electricity_kwh: 4200 } as Location)).toEqual([])
    const deleted = { ...unreadable, ...deleteDocument(unreadable, 'd1', { by: BY, at: AT, mode: 'unused' }) } as Location
    expect(teamIssues(deleted)).toEqual([])
  })
  it('the coverage strip shows both, with Enter the figure manually for the unreadable one only', () => {
    const strip = readFileSync(join(process.cwd(), 'app/dashboard/ghg/_components/CoverageStrip.tsx'), 'utf8')
    expect(strip).toContain("(i.status === 'awaiting_reading' || i.status === 'reading_unreadable') && i.message")
    expect(strip).toContain("{i.status === 'reading_unreadable' && (")
  })
})

describe('BR4 follow-ups', () => {
  it('the correction notice formats its number as the rest of the page does', () => {
    expect(correctionNotice({ rawValue: 4120, rawUnit: 'kWh' }, 'confirmed')).toBe('Our team corrected this reading after you confirmed it: 4,120 kWh. Review it.')
  })
  it('an unreadable bill’s box is editable, even before the team’s records load', () => {
    const unreadable = mergeReadings([loc([doc()])], [row({ status: 'unreadable', unreadable_note: 'Torn' })], []).locations[0]
    const d = unreadable.source_docs[0]
    expect(isWaiting(d, undefined)).toBe(false)
    expect(withTeamFor(unreadable, 'electricity_kwh', {})).toBeNull()
    const html = renderToStaticMarkup(createElement(FigureInput, { loc: unreadable, field: 'electricity_kwh', onChange: () => {}, style: {}, by: BY,
      onOverride: () => {}, onUseBills: () => {}, withTeam: withTeamFor(unreadable, 'electricity_kwh', {}) }))
    expect(html).toContain('id="figure-L1-electricity_kwh"')
    expect(html).not.toContain('readOnly')
  })
})

describe('BR7: the two emails, as they read', () => {
  it('ready: "1 bill" or "{n} bills", the year by reportingYearLabel, the link', () => {
    const yearText = yearLabel(2025, 9).inText
    expect(yearText).toBe('the year ending 30 September 2025')
    const one = buildReadyEmail({ companyName: 'Acme Ltd', yearText, count: 1, link: 'https://www.themisiq.co/dashboard/ghg?id=inv-1' })
    expect(one.subject).toBe('Your bills are ready to confirm')
    expect(one.text).toContain('Our team has finished reading 1 bill for Acme Ltd, the year ending 30 September 2025.')
    expect(one.text).toContain('Open the inventory to confirm each figure. Export stays locked until you do.')
    expect(one.text).toContain('Open the inventory: https://www.themisiq.co/dashboard/ghg?id=inv-1')
    expect(buildReadyEmail({ companyName: 'Acme Ltd', yearText: yearLabel(2026, 12).inText, count: 3, link: 'x' }).text).toContain('finished reading 3 bills for Acme Ltd, reporting year 2026.')
    expect(one.text + one.html).not.toContain('bill(s)')
  })
  it('overdue: the file, the company and site, the date in words, not sent to the AI', () => {
    const e = buildOverdueEmail({ fileName: 'jan.pdf', companyName: 'Acme Ltd', site: 'Leeds', expectedBy: '2026-10-21', link: 'x' })
    expect(e.subject).toBe('A bill is running late')
    expect(e.text).toContain('We expected to finish reading jan.pdf for Acme Ltd, Leeds, by 21 October 2026, and we are still reading it.')
    expect(e.text).toContain('It has not been sent to the AI. You will hear from us when it is ready to confirm.')
  })
  it('no em dash, no "chase", no unsubscribe header (service emails)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/billReview/noticeEmails.ts'), 'utf8') + readFileSync(join(process.cwd(), 'lib/billReview/notices.ts'), 'utf8')
    expect(src).not.toContain(String.fromCharCode(0x2014))
    expect(src).not.toMatch(/\bchase\b/i)
    expect(src).not.toContain('List-Unsubscribe')
  })
})
