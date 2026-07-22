// DisclosureQuestion — a THREE-STATE disclosure control for the CBAM module.
//
// Why three states (Yes / No / unanswered) instead of a two-state checkbox
// like the GHG module's QuestionCard:
//
// The `cbam_installation_disclosures` columns are deliberately NULLABLE
// booleans. Per the CBAM spec's engine invariant 8:
//     false = declared negative (the operator affirmatively answered "No")
//     null  = unanswered        (the operator has not answered at all)
// A `not null default false` column "would fabricate a declaration the
// operator never made." A two-state checkbox has the same defect in the UI
// layer: it would write `false` for every untouched question — eleven
// fabricated declarations on a verifier-facing artifact. The report route
// already reports null as `missing`, correctly; this control must not undo
// that by collapsing "unanswered" into "No".
//
// Hence: value === null renders with NEITHER Yes nor No selected, and that
// unanswered state is visually distinct from a selected "No". Clicking the
// already-selected option retracts back to null.

import React from 'react'

export default function DisclosureQuestion({
  question,
  hint,
  value,
  onChange,
  children,
  disabled = false,
}: {
  question: string
  hint: string
  value: boolean | null // null = unanswered
  onChange: (v: boolean | null) => void
  children?: React.ReactNode // conditional follow-up, shown only when value === true
  disabled?: boolean
}) {
  const answered = value !== null

  // Clicking the already-selected option retracts to null (unanswered);
  // clicking the other option (or an unanswered pair) sets that value.
  const pick = (target: boolean) => {
    if (disabled) return
    onChange(value === target ? null : target)
  }

  const btn = (selected: boolean): React.CSSProperties => ({
    fontSize: 12,
    padding: '6px 14px',
    borderRadius: 8,
    background: selected ? '#7425e3' : '#f8f7f5',
    color: selected ? '#fff' : '#555553',
    border: `0.5px solid ${selected ? '#7425e3' : '#e8e7e4'}`,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  })

  return (
    <div style={{ background: '#fff', border: `0.5px solid ${answered ? '#7425e3' : '#e8e7e4'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{question}</div>
          <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.5 }}>{hint}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 1 }}>
          <button
            type="button"
            onClick={() => pick(true)}
            disabled={disabled}
            style={btn(value === true)}
            title={value === true ? 'Click again to clear this answer (back to unanswered)' : 'Answer Yes'}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => pick(false)}
            disabled={disabled}
            style={btn(value === false)}
            title={value === false ? 'Click again to clear this answer (back to unanswered)' : 'Answer No'}
          >
            No
          </button>
        </div>
      </div>
      {value === null && (
        <div style={{ padding: '0 1.25rem 0.85rem', fontSize: 11, color: '#888784', fontWeight: 300 }}>Not yet answered</div>
      )}
      {value === true && children && (
        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}>
          <div style={{ paddingTop: '1rem' }}>{children}</div>
        </div>
      )}
    </div>
  )
}

// cbamInputStyle / CbamField are copied VERBATIM from app/dashboard/ghg/page.tsx
// (`inputStyle` and `Field`) so the CBAM surface is visually identical to GHG.
// They are duplicated here rather than shared because the GHG originals are
// private to a 2,171-line live page; extracting them into a shared module is a
// separate refactor and out of scope for this component.
export const cbamInputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }

export function CbamField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: hint ? 4 : 6 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: '#888784', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}
