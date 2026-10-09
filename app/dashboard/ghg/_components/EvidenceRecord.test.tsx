// app/dashboard/ghg/_components/EvidenceRecord.test.tsx
//
// T18 diff 4: the evidence list on each location, and the record of deleted locations.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { LocationEvidenceRecord, DeletedLocationsRecord } from './EvidenceRecord'
import { locationEvidenceLines, locationLogLines, evidenceRecordRows } from '@/lib/ghg/evidenceRecord'
import { eventRowsOf } from '@/lib/ghg/workingsCells'
import type { DocumentEvent, LocationEvent, TypedEntry } from '@/lib/ghg/engine'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const T1 = '2026-10-02T09:00:00.000Z', T2 = '2026-10-03T09:00:00.000Z'
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const withdrawn: DocumentEvent = { kind: 'withdrawn', docId: 'd1', file: 'gas-jan.pdf', at: T2, by: BY, reason: 'Duplicate upload' }
const typed: TypedEntry = { field: 'natural_gas_amount', value: 420, unit: 'mcf', at: T1, by: BY }
const leeds: LocationEvent = { kind: 'location_deleted', locationId: 'L2', name: 'Leeds', country: 'GB', at: T2, by: BY, documents: [] }

describe('the lines', () => {
  it('one location: document events and typed entries together, oldest first', () => {
    expect(locationEvidenceLines({ document_log: [withdrawn], typed_entries: [typed] }).map(l => [l.kind, l.sentence])).toEqual([
      ['typed', 'Natural gas entered as 420 Mcf by jo@acme.example on 2 October 2026.'],
      ['document', 'gas-jan.pdf was withdrawn by jo@acme.example on 3 October 2026: Duplicate upload. It is kept as evidence and not counted.'],
    ])
  })
  it('deleted locations, and the PDF rows (events only, no typed entries)', () => {
    expect(locationLogLines([leeds]).map(l => l.sentence)).toEqual(['Leeds (United Kingdom) was deleted by jo@acme.example on 3 October 2026. It held no documents.'])
    expect(evidenceRecordRows({ locations: [{ name: 'Site A', document_log: [withdrawn], typed_entries: [typed] } as never], location_log: [leeds] }).map(r => r[0]))
      .toEqual(['Site A', 'Leeds (deleted)'])
  })
  it('the verifier reads event rows from the saved workings, in order, and nothing else', () => {
    const rows = [{ gwp_basis: 'AR6' }, { gwp_basis: 'document_event', note: 'a' }, { gwp_basis: 'coverage_resolution' }, { gwp_basis: 'location_event', note: 'b' }]
    expect(eventRowsOf(rows).map(r => r.note)).toEqual(['a', 'b'])
    expect(eventRowsOf(undefined)).toEqual([])
  })
})

describe('the evidence list', () => {
  it('shows a count, closed by default; empty says what will appear', () => {
    const html = renderToStaticMarkup(<LocationEvidenceRecord location={{ name: 'Site A', document_log: [withdrawn], typed_entries: [typed] }} />)
    expect(text(html)).toContain('Record for Site A (2)')
    expect(html).toContain('aria-expanded="false"')
    expect(text(renderToStaticMarkup(<LocationEvidenceRecord location={{ name: 'Site A' }} />))).toContain('Record for Site A (0)')
  })
  it('deleted locations show only when there is one', () => {
    expect(renderToStaticMarkup(<DeletedLocationsRecord log={[]} />)).toBe('')
    expect(text(renderToStaticMarkup(<DeletedLocationsRecord log={[leeds]} />))).toContain('Locations deleted from this inventory (1)')
  })
  it('no em dash in what it says', () => {
    const all = [...locationEvidenceLines({ document_log: [withdrawn], typed_entries: [typed] }), ...locationLogLines([leeds])].map(l => l.sentence)
    for (const s of all) expect(s).not.toContain('—')
  })
})
