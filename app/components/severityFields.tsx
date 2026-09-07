/**
 * The severity question widget — the four points and the fourth answer.
 *
 * ⚠️ ONE WIDGET, because there are two instruments asking the same question. The contributor form
 * (/impact/[token]) and the preparer's own determination form (/worksheet/[id]/determine) put the
 * SAME question to different people; a second copy of these controls would let the two drift in
 * exactly the place drift is invisible — a scale point styled differently, or the fourth answer
 * demoted on one screen and not the other.
 *
 * ⚠️ THE COPY IS NOT HERE. Every string comes from lib/materiality/severityScale.ts, transcribed
 * verbatim from spec v11 §5.3.1. This file holds the control; that file holds the words; the spec
 * holds the authority. Nothing in this file may state a scale point.
 *
 * ⚠️ "Not enough visibility to assess" RENDERS IDENTICALLY TO THE FOUR POINTS — same size, padding,
 * border, badge and selected state, in the same list. §6.1: it is a recorded answer, never a zero
 * and never a low. Greying it, shrinking it or putting it below a rule would make it read as "give
 * up here", and the answers this assessment most needs are the honest ones. Same rule the survey
 * page follows for its own fourth option.
 */

'use client'

import { NO_VISIBILITY_LABEL, type ScaleDefinition } from '../../lib/materiality/severityScale'

const BRAND = 'var(--color-brand)'
const INK = '#0d0d0d'
const MID = '#555553'
const MUTE = 'var(--color-ink-muted)'
const LINE = '#e8e7e4'
const PAPER = '#f8f7f5'

/**
 * One scale: the four points, then the fourth answer.
 *
 * ⚠️ "Not enough visibility to assess" RENDERS IDENTICALLY TO THE FOUR — same size, padding, border,
 * badge and selected state, in the same list. §6.1: it is a recorded answer, never a zero and never
 * a low. Greying it, shrinking it or putting it below a rule would make it read as "give up here",
 * and the answers this assessment most needs are the honest ones. Same rule the survey page follows.
 */
export function ScaleField({ def, value, abstained, onPick, heading }: {
  def: ScaleDefinition; value: number | null; abstained: boolean
  onPick: (v: number | null) => void; heading?: string
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Question text={heading || def.heading} />
      <Options>
        {def.points.map(p => (
          <Option key={p.value} selected={value === p.value} onClick={() => onPick(p.value)}
                  badge={String(p.value)} label={p.label} body={p.body} />
        ))}
        {/* ⚠️ SELECTED LIKE ANY OTHER ANSWER, because since 20260841 it IS one — recorded in
            abstained_dimensions rather than left as a bare null, so it survives a reload. */}
        <Option selected={abstained} onClick={() => onPick(null)}
                badge="—" label="" body={NO_VISIBILITY_LABEL} />
      </Options>
    </div>
  )
}


export function Question({ text, hint }: { text: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 13, color: INK, fontWeight: 600 }}>{text}</div>
      {hint && <div style={{ fontSize: 11.5, color: MUTE, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}


export const Options = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'grid', gap: 6, marginBottom: 4 }}>{children}</div>
)

export function Option({ selected, onClick, badge, label, body }: {
  selected: boolean; onClick: () => void; badge: string; label: string; body: string
}) {
  return (
    <button type="button" onClick={onClick}
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', textAlign: 'left',
                     width: '100%', padding: '11px 14px', borderRadius: 10,
                     border: `1px solid ${selected ? BRAND : LINE}`,
                     background: selected ? 'var(--color-brand-wash)' : '#fff', cursor: 'pointer' }}>
      <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, fontSize: 11.5,
                     fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                     background: selected ? BRAND : PAPER, color: selected ? '#fff' : MID,
                     border: `1px solid ${selected ? BRAND : LINE}` }}>{badge}</span>
      <span style={{ fontSize: 12.5, color: INK, lineHeight: 1.7 }}>
        {label && <strong>{label}. </strong>}{body}
      </span>
    </button>
  )
}

