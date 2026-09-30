'use client'

// app/dashboard/s211/_components/ui.tsx
// Shared pieces for the S-211 report builder: the access gate, the 404 view, the page frame, and the
// field renderer. The builder is unpriced and allow-listed (lib/s211/access.ts); nothing here is linked
// from the navigation, the dashboard or the sitemap.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import Nav from '../../../components/Nav'
import { s211Api } from '../../../../lib/s211/client'
import { SOURCE_LABEL, PERSONAL_INFORMATION_WARNING, type Field, type Quote } from '../../../../lib/s211/builderContent'
import type { SectionStatus } from '../../../../lib/s211/sectionStatus'

// ── Styles ──────────────────────────────────────────────────────────────────────────────────────────
export const S = {
  page: { maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem 4rem' } as CSSProperties,
  h1: { fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--color-ink)', margin: '0 0 8px' } as CSSProperties,
  h2: { fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: 'var(--color-ink)', margin: '28px 0 10px' } as CSSProperties,
  muted: { fontSize: 13, color: 'var(--color-ink-muted)', lineHeight: 1.6 } as CSSProperties,
  body: { fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.65 } as CSSProperties,
  card: { border: '1px solid #e8e7e4', borderRadius: 12, padding: '16px 18px', background: '#fff', marginBottom: 14 } as CSSProperties,
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 } as CSSProperties,
  hint: { fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.55, margin: '0 0 6px' } as CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 14, border: '1px solid #d6d4cf', borderRadius: 8, background: '#fff', color: 'var(--color-ink)', fontFamily: 'inherit' } as CSSProperties,
  button: { fontSize: 13, fontWeight: 600, padding: '9px 16px', borderRadius: 8, border: '1px solid var(--color-brand)', background: 'var(--color-brand)', color: '#fff', cursor: 'pointer' } as CSSProperties,
  buttonQuiet: { fontSize: 13, fontWeight: 500, padding: '9px 16px', borderRadius: 8, border: '1px solid #d6d4cf', background: '#fff', color: 'var(--color-ink)', cursor: 'pointer' } as CSSProperties,
  warn: { border: '1px solid color-mix(in srgb, var(--color-state-warn) 35%, transparent)', background: '#FEF7EC', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--color-ink)', marginBottom: 14 } as CSSProperties,
  error: { border: '1px solid rgba(185,28,28,0.3)', background: '#FCEBEB', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#7F1D1D', margin: '10px 0' } as CSSProperties,
}

// ── Access ──────────────────────────────────────────────────────────────────────────────────────────
type Access = 'loading' | 'allowed' | 'denied' | 'unreachable'
export function useS211Access(): Access {
  const [a, setA] = useState<Access>('loading')
  useEffect(() => {
    let live = true
    void s211Api<{ allowed: boolean }>('/access').then(r => {
      if (!live) return
      setA(r.status === 200 ? 'allowed' : r.status === 0 ? 'unreachable' : 'denied')
    })
    return () => { live = false }
  }, [])
  return a
}

/** What anyone not on the allow-list sees: the standard 404, and nothing about the builder. */
export function NotFound404() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ display: 'inline-block', margin: '0 20px 0 0', paddingRight: 23, fontSize: 24, fontWeight: 500, borderRight: '1px solid rgba(0,0,0,.3)' }}>404</h1>
      <h2 style={{ display: 'inline-block', fontSize: 14, fontWeight: 400, margin: 0 }}>This page could not be found.</h2>
    </div>
  )
}

/** The frame every builder page uses. Renders its children only for an allowed user. */
export function BuilderFrame({ children }: { children: ReactNode }) {
  const access = useS211Access()
  if (access === 'denied') return <NotFound404 />
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-paper, #f8f7f5)' }}>
      <Nav />
      <div style={S.page}>
        {access === 'loading' && <p style={S.muted}>Loading</p>}
        {access === 'unreachable' && <p style={S.error}>The server could not be reached. Check your connection and reload the page.</p>}
        {access === 'allowed' && children}
      </div>
    </div>
  )
}

// ── Small pieces ────────────────────────────────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<SectionStatus, string> = { not_started: 'Not started', in_progress: 'In progress', complete: 'Complete' }
export function StatusPill({ status }: { status: SectionStatus }) {
  const c = status === 'complete' ? { bg: '#E1F5EE', fg: '#0F6E56' } : status === 'in_progress' ? { bg: '#FEF3E2', fg: '#8A5A0B' } : { bg: '#F1F0EE', fg: '#555553' }
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>{STATUS_LABEL[status]}</span>
}

export function QuoteBlock({ q }: { q: Quote }) {
  return (
    <figure style={{ margin: '0 0 12px', padding: '10px 14px', borderLeft: '3px solid var(--color-brand)', background: '#fff' }}>
      <blockquote style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--color-ink)' }}>
        {q.lines.map((l, i) => l === '' ? <div key={i} style={{ height: 8 }} /> : <div key={i} style={{ paddingLeft: /^\((i|ii|iii)\)/.test(l) ? 36 : /^\([a-z]\)/.test(l) ? 18 : 0 }}>{l}</div>)}
      </blockquote>
      <figcaption style={{ fontSize: 11.5, color: 'var(--color-ink-muted)', marginTop: 6 }}>{q.ref}</figcaption>
    </figure>
  )
}

export function Disclosure({ title, open, onToggle, children }: { title: string; open?: boolean; onToggle?: (open: boolean) => void; children: ReactNode }) {
  return (
    <details open={open} onToggle={e => onToggle?.((e.currentTarget as HTMLDetailsElement).open)} style={{ ...S.card, padding: '10px 16px' }}>
      <summary style={{ fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: 'var(--color-ink)' }}>{title}</summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  )
}

// ── The field renderer ──────────────────────────────────────────────────────────────────────────────
type Row = Record<string, string>
export function FieldInput({ field, value, onChange, onBlur, options }: {
  field: Field; value: unknown; onChange: (v: unknown) => void; onBlur: () => void
  /** Overrides field.options, with labels: section 11's approval basis. */
  options?: { value: string; label: string }[]
}) {
  const id = `f-${field.key}`
  const str = typeof value === 'string' ? value : ''
  const opts = options ?? (field.options ?? []).map(o => ({ value: o, label: o }))
  const len = str.length
  const head = (
    <>
      <label htmlFor={id} style={S.label}>
        {field.label}
        {field.source !== 'act' && <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--color-ink-muted)' }}> [{SOURCE_LABEL[field.source]}]</span>}
      </label>
      {field.hint && <p style={S.hint}>{field.hint}</p>}
    </>
  )
  let control: ReactNode
  switch (field.type) {
    case 'text':
      control = <input id={id} style={S.input} value={str} maxLength={field.maxChars ?? 300} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      break
    case 'textarea':
      control = <>
        <textarea id={id} style={{ ...S.input, minHeight: 110, resize: 'vertical' }} value={str} maxLength={field.maxChars} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
        {field.maxChars && <div style={{ ...S.hint, textAlign: 'right', margin: '2px 0 0' }}>{len} of up to {field.maxChars.toLocaleString('en-CA')} characters</div>}
      </>
      break
    case 'number':
      control = <input id={id} style={{ ...S.input, maxWidth: 220 }} type="number" min={0} value={typeof value === 'number' ? value : ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} onBlur={onBlur} />
      break
    case 'date':
      control = <input id={id} style={{ ...S.input, maxWidth: 220 }} type="date" value={str} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
      break
    case 'confirm':
      control = <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input id={id} type="checkbox" checked={value === true} onChange={e => { onChange(e.target.checked); setTimeout(onBlur, 0) }} /> Yes
      </label>
      break
    case 'yn': case 'ynp': case 'choice': {
      const list = field.type === 'yn' ? [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]
        : field.type === 'ynp' ? ['Yes', 'No', 'In progress'].map(v => ({ value: v, label: v })) : opts
      control = <div role="radiogroup" aria-labelledby={id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {list.map(o => (
          <label key={o.value} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, padding: '6px 10px', border: '1px solid #d6d4cf', borderRadius: 8, background: str === o.value ? '#EEF6F7' : '#fff', cursor: 'pointer' }}>
            <input type="radio" name={id} checked={str === o.value} onChange={() => { onChange(o.value); setTimeout(onBlur, 0) }} /> {o.label}
          </label>
        ))}
        {list.length === 0 && <span style={S.hint}>No choices available yet.</span>}
      </div>
      break
    }
    case 'checklist': {
      const picked = Array.isArray(value) ? (value as string[]) : []
      control = <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {opts.map(o => (
          <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5 }}>
            <input type="checkbox" style={{ marginTop: 3 }} checked={picked.includes(o.value)}
              onChange={e => { onChange(e.target.checked ? [...picked, o.value] : picked.filter(p => p !== o.value)); setTimeout(onBlur, 0) }} /> {o.label}
          </label>
        ))}
      </div>
      break
    }
    case 'list': {
      control = <>
        <textarea id={id} style={{ ...S.input, minHeight: 80 }} value={Array.isArray(value) ? (value as string[]).join('\n') : ''}
          onChange={e => onChange(e.target.value.split('\n'))} onBlur={() => { onChange((Array.isArray(value) ? value as string[] : []).map(s => s.trim()).filter(Boolean)); setTimeout(onBlur, 0) }} />
        <div style={{ ...S.hint, margin: '2px 0 0' }}>One per line.</div>
      </>
      break
    }
    case 'rows': {
      const rows: Row[] = Array.isArray(value) ? (value as Row[]) : []
      const cols = field.columns ?? []
      const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
      control = <div>
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr)) auto`, gap: 8, marginBottom: 8, alignItems: 'end' }}>
            {cols.map(c => (
              <label key={c.key} style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{c.label}
                <input style={{ ...S.input, marginTop: 3 }} value={r[c.key] ?? ''} onChange={e => set(i, c.key, e.target.value)} onBlur={onBlur} />
              </label>
            ))}
            <button type="button" style={{ ...S.buttonQuiet, padding: '8px 10px' }} onClick={() => { onChange(rows.filter((_, j) => j !== i)); setTimeout(onBlur, 0) }}>Remove</button>
          </div>
        ))}
        <button type="button" style={S.buttonQuiet} onClick={() => onChange([...rows, Object.fromEntries(cols.map(c => [c.key, '']))])}>Add a row</button>
      </div>
      break
    }
  }
  return <div style={{ marginBottom: 18 }}>{head}{control}</div>
}

/** Section 3's six OECD steps: fixed rows, a status for each. */
export function StepStatusRows({ steps, value, onChange, onBlur }: { steps: readonly string[]; value: unknown; onChange: (v: unknown) => void; onBlur: () => void }) {
  const rows = Array.isArray(value) ? (value as Row[]) : []
  const statusOf = (step: string) => rows.find(r => r.step === step)?.status ?? ''
  const set = (step: string, status: string) => {
    onChange(steps.map(s => ({ step: s, status: s === step ? status : statusOf(s) })))
    setTimeout(onBlur, 0)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {steps.map(step => (
        <div key={step} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>&ldquo;{step}&rdquo;</span>
          <select style={{ ...S.input, width: 150 }} value={statusOf(step)} onChange={e => set(step, e.target.value)}>
            <option value="">Not answered</option><option>Yes</option><option>No</option><option>In progress</option>
          </select>
        </div>
      ))}
    </div>
  )
}

/** The personal-information warning: on section 1 and on the check page. */
export function PersonalInformation() {
  return (
    <div style={S.warn}>
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>No personal information</p>
      {PERSONAL_INFORMATION_WARNING.quotes.map((q, i) => <p key={i} style={{ margin: '0 0 6px' }}>Public Safety Canada guidance: &ldquo;{q}&rdquo;</p>)}
      <p style={{ margin: 0 }}>{PERSONAL_INFORMATION_WARNING.ours}</p>
    </div>
  )
}
