// app/dashboard/ghg/_components/FigureInput.tsx
//
// ONE FIGURE ON STEP 2, AND WHERE IT COMES FROM (T7, T10).
//   - No backing documents: the customer's typed figure, editable, as always.
//   - Backed by documents (confirmed or pending bills): worked out from them and shown read-only, "From N
//     documents" (section 3.3, T7 ruling), with "Enter this figure manually instead", which asks for a reason.
//   - Overridden (T10): editable again, saying who switched it, when and why, with "Use the bills instead".
// Moved out of page.tsx in T10 so each state can be rendered in a test.
//
// All text here is shown to the customer: plain language, no em dash.

import { useState } from 'react'
import { documentsBacking, activeOverride, type Location } from '../../../../lib/ghg/engine'
import { plainDate } from '../../../../lib/ghg/coverageActions'

export type FigureInputProps = {
  loc: Location                       // the DERIVED location (its figure is what the totals use)
  field: keyof Location
  onChange: (v: number) => void
  style: React.CSSProperties
  by: { userId: string; email: string } | null   // who switches; both switches are disabled without one
  onOverride: (reason: string) => void
  onUseBills: () => void
}

const link = { fontSize: 11, padding: 0, marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-brand)', textDecoration: 'underline', cursor: 'pointer' } as const
const small = { fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' } as const
const note = { fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4, lineHeight: 1.5 } as const

export function FigureInput({ loc, field, onChange, style, by, onOverride, onUseBills }: FigureInputProps) {
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const n = documentsBacking(loc, field)
  const override = activeOverride(loc, field)
  const value = (loc as unknown as Record<string, number>)[String(field)]
  const { flex, ...inputOwn } = style
  const docs = `${n} document${n === 1 ? '' : 's'}`
  // The id lets the coverage strip's "Enter the figure manually" put the cursor here (T8).
  const editable = (s: React.CSSProperties) =>
    <input id={`figure-${loc.id}-${String(field)}`} type="number" value={value || ''} onChange={e => onChange(Number(e.target.value))} placeholder="0" style={s} />
  if (n === 0) return editable(style)
  if (override) {
    return (
      <div style={flex != null ? { flex } : undefined}>
        {editable(inputOwn)}
        <div style={note}>
          Entered manually by {override.by.email} on {plainDate(override.at)} instead of from {docs}. Reason: {override.reason}
          <button disabled={!by} onClick={onUseBills} style={{ ...link, opacity: by ? 1 : 0.5 }}>Use the bills instead</button>
        </div>
      </div>
    )
  }
  return (
    <div style={flex != null ? { flex } : undefined}>
      <input type="number" value={value} readOnly aria-readonly="true" style={{ ...inputOwn, background: '#f8f7f5', color: 'var(--color-ink-2)' }} />
      <div style={note}>
        From {docs}
        {!asking && <button disabled={!by} onClick={() => setAsking(true)} style={{ ...link, opacity: by ? 1 : 0.5 }}>Enter this figure manually instead</button>}
      </div>
      {asking && (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input aria-label="Reason for entering this figure manually" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Why are you entering this figure instead of using the bills?"
            style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid #e8e7e4', borderRadius: 6, minWidth: 260, flex: 1 }} />
          <button disabled={!reason.trim() || !by} onClick={() => { onOverride(reason.trim()); setAsking(false); setReason('') }}
            style={{ ...small, fontWeight: 600, opacity: reason.trim() && by ? 1 : 0.5 }}>Switch to manual</button>
          <button onClick={() => { setAsking(false); setReason('') }} style={small}>Cancel</button>
        </div>
      )}
    </div>
  )
}
