// app/dashboard/ghg/_components/ProposalEdits.tsx
//
// THE BILLING-PERIOD AND UNIT CONTROLS ON A PROPOSAL IN REVIEW (T9). They answer the undated, invalid-period
// and mixed-units messages on the proposal itself, and carry the month-only confirmation step (rule R5).
// Every write is a patch from lib/ghg/proposalEdits.ts, so the original reading and who changed what, and
// when, are always recorded.
//
// All text here is shown to the customer: plain language, no em dash.

import { useState } from 'react'
import { periodOriginOf, type ExtractedProposal } from '../../../../lib/ghg/engine'
import { editPeriod, editUnit, type Editor } from '../../../../lib/ghg/proposalEdits'
import { convertibleUnits, normalizeUnit, type FuelType } from '../../../../lib/unitConversions'
import { plainDate } from '../../../../lib/ghg/coverageActions'
import { unitLabel } from '../../../../lib/ghg/unitLabels'
import { isoDateInWords } from '../../../../lib/ghg/dateWords'

// How each unit is written for the customer: one map, shared with every other surface (T10c).
export { UNIT_LABEL } from '../../../../lib/ghg/unitLabels'

const smallButton = { fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' } as const
const primaryButton = { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' } as const
const field = { fontSize: 12, padding: '4px 8px', border: '0.5px solid #e8e7e4', borderRadius: 6 } as const
const note = { fontSize: 11, color: '#555553', marginTop: 4, lineHeight: 1.5 } as const

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/**
 * The dates editor. `confirm` is the month-only step at acceptance: it explains why, and its button both
 * records the dates and confirms the proposal. Otherwise it enters or corrects the dates only.
 */
export function PeriodEditor({ p, confirm, message, by, onSave, onCancel }: {
  p: ExtractedProposal; confirm: boolean; message: string | null; by: Editor | null
  onSave: (patch: Partial<ExtractedProposal>) => void; onCancel: () => void
}) {
  const [start, setStart] = useState(p.periodStart && isIsoDate(p.periodStart) ? p.periodStart : '')
  const [end, setEnd] = useState(p.periodEnd && isIsoDate(p.periodEnd) ? p.periodEnd : '')
  const valid = isIsoDate(start) && isIsoDate(end) && start <= end
  return (
    <div style={{ marginTop: 6 }}>
      {message && <div style={{ ...note, color: '#7c5a16' }}>{message}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Billing period from</span>
        <input type="date" aria-label="Billing period start" value={start} onChange={e => setStart(e.target.value)} style={field} />
        <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>to</span>
        <input type="date" aria-label="Billing period end" value={end} onChange={e => setEnd(e.target.value)} style={field} />
        <button disabled={!valid || !by} style={{ ...primaryButton, opacity: valid && by ? 1 : 0.5 }}
          onClick={() => by && valid && onSave(editPeriod(p, { start, end, by, at: new Date().toISOString(), confirm }))}>
          {confirm ? 'Confirm these dates' : 'Save dates'}
        </button>
        <button onClick={onCancel} style={smallButton}>Cancel</button>
      </div>
      {start && end && start > end && <div style={{ ...note, color: 'var(--color-state-warn)' }}>The end date is before the start date.</div>}
    </div>
  )
}

/** The unit editor: what unit the bill is really in. Offers only units the conversion can handle. */
export function UnitEditor({ p, by, onSave, onCancel }: {
  p: ExtractedProposal; by: Editor | null; onSave: (patch: Partial<ExtractedProposal>) => void; onCancel: () => void
}) {
  const options = convertibleUnits(p.fuelType as FuelType)
  // The bill's own unit as read, normalised ("MJ" reads as mj), when the conversion can handle it.
  const read = normalizeUnit(p.rawUnit)
  const [unit, setUnit] = useState(read && options.includes(read) ? read : options[0])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Unit on the bill</span>
      <select aria-label="Unit on the bill" value={unit} onChange={e => setUnit(e.target.value)} style={field}>
        {options.map(u => <option key={u} value={u}>{unitLabel(u)}</option>)}
      </select>
      <button disabled={!by} style={{ ...primaryButton, opacity: by ? 1 : 0.5 }}
        onClick={() => by && onSave(editUnit(p, { unit, by, at: new Date().toISOString() }))}>Save unit</button>
      <button onClick={onCancel} style={smallButton}>Cancel</button>
    </div>
  )
}

/** True when the fuel can be read in more than one unit, so a unit control is worth offering. */
export const unitEditable = (p: ExtractedProposal) => convertibleUnits(p.fuelType as FuelType).length > 1

/**
 * What the review says about where a proposal's dates and unit came from: a confirmed month-only bill whose
 * days were never confirmed (R5), and every change the customer made, with the original reading.
 */
export function ProposalNotes({ p }: { p: ExtractedProposal }) {
  const lines: string[] = []
  const lastLog = (p.statusLog ?? [])[(p.statusLog ?? []).length - 1]
  if (p.status === 'rejected' && lastLog?.action === 'rejected') lines.push(`Rejected by ${lastLog.by.email} on ${plainDate(lastLog.at)}.`)
  if (p.status !== 'rejected' && lastLog?.action === 'undone') lines.push(`Rejection undone by ${lastLog.by.email} on ${plainDate(lastLog.at)}.`)
  if (p.status === 'confirmed' && periodOriginOf(p) === 'billing_month') lines.push('Dates estimated from the billing month')
  for (const c of p.corrections ?? []) {
    const what = c.fields.includes('period') && c.fields.includes('unit') ? 'billing dates and unit'
      : c.fields.includes('period') ? 'billing dates' : 'unit'
    lines.push(`Changed by ${c.by.email} on ${plainDate(c.at)}: ${what}.`)
  }
  if (p.asRead && (p.corrections ?? []).length > 0) {
    const r = p.asRead
    lines.push(`Read from the bill: ${r.periodStart ? isoDateInWords(r.periodStart) : 'no start date'} to ${r.periodEnd ? isoDateInWords(r.periodEnd) : 'no end date'}, ${unitLabel(r.unit)}.`)
  }
  if (p.periodOrigin === 'customer_confirmed' && p.periodConfirmedBy && p.periodConfirmedAt && !(p.corrections ?? []).some(c => c.fields.includes('period'))) {
    lines.push(`Dates confirmed by ${p.periodConfirmedBy.email} on ${plainDate(p.periodConfirmedAt)}.`)
  }
  if (lines.length === 0) return null
  return <>{lines.map((l, i) => <div key={i} style={note}>{l}</div>)}</>
}
