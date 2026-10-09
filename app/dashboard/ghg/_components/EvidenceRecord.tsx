// app/dashboard/ghg/_components/EvidenceRecord.tsx
//
// T18 diff 4: THE EVIDENCE LIST ON EACH LOCATION. Every document event (withdrawn, restored, deleted, deleted unused)
// and every typed-figure entry (who entered it, and when), in plain language, oldest first; and, for the inventory,
// every location deleted from it. The lines come from lib/ghg/evidenceRecord.ts, the same sentences the saved
// workings, the verifier page and the PDF carry.
//
// All text here is shown to the customer: plain language, no em dash.

import { useState } from 'react'
import { locationEvidenceLines, locationLogLines, type EvidenceLine } from '../../../../lib/ghg/evidenceRecord'
import type { DocumentEvent, LocationEvent, TypedEntry } from '../../../../lib/ghg/engine'

const box = { marginTop: 12, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '8px 12px' } as const
const toggle = { fontSize: 12, fontWeight: 600, color: '#555553', background: 'none', border: 'none', padding: 0, cursor: 'pointer' } as const
const line = { fontSize: 11, color: '#555553', lineHeight: 1.5, marginTop: 4 } as const

function Lines({ title, lines, empty }: { title: string; lines: EvidenceLine[]; empty: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={box}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={toggle}>
        {open ? '▲' : '▼'} {title} ({lines.length})
      </button>
      {open && (lines.length === 0
        ? <div style={line}>{empty}</div>
        : <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{lines.map((l, i) => <li key={i} style={line}>{l.sentence}</li>)}</ul>)}
    </div>
  )
}

/** The record for one location: its document events and its typed-figure entries. */
export function LocationEvidenceRecord({ location }: { location: { name?: string; document_log?: DocumentEvent[]; typed_entries?: TypedEntry[] } }) {
  return <Lines title={`Record for ${location.name || 'this location'}`} lines={locationEvidenceLines(location)}
    empty="Nothing recorded yet. Withdrawn and deleted documents, and who entered each figure and when, appear here once saved." />
}

/** Every location deleted from this inventory. Shown only when there is one. */
export function DeletedLocationsRecord({ log }: { log: readonly LocationEvent[] | null | undefined }) {
  const lines = locationLogLines(log)
  if (lines.length === 0) return null
  return <Lines title="Locations deleted from this inventory" lines={lines} empty="" />
}
