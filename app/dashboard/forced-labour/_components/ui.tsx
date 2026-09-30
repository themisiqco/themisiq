'use client'

// app/dashboard/forced-labour/_components/ui.tsx
// Shared pieces for the Forced Labour Reporting builder (the Canadian S-211 report): the access states,
// the 404 view, the page frame, and the field renderer. Access: lib/s211/builderAccess.ts.

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import Nav from '../../../components/Nav'
import { SECTIONS, SOURCE_LABEL, PERSONAL_INFORMATION_WARNING, MONTHS, type Field, type Quote, type SectionContent } from '../../../../lib/s211/builderContent'
import { toggleChecklist } from '../../../../lib/s211/defaults'
import { useS211Access } from './useS211Access'
import {
  signInHref, BUILDER_ROOT, PREVIEW_ID, MODULE_NAME, ORDER_HREF, ORDER_LABEL, RENEW_LABEL,
  SIGNED_OUT_MESSAGE, UNKNOWN_MESSAGE, PREVIEW_MESSAGE, READ_ONLY_MESSAGE, type BuilderState,
} from '../../../../lib/s211/builderAccess'
import { isIsoDate } from '../../../../lib/s211/sectionStatus'
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
// One read of /api/s211/access per page, shared through context. The state is the database's
// (lib/s211/builderAccess.ts says why it is not the client entitlement hook).
const AccessContext = createContext<BuilderState>('loading')
/** The builder state for the page being drawn: 'preview', 'read-only' or 'full' inside BuilderFrame. */
export const useBuilderState = () => useContext(AccessContext)


/** A report that does not exist, or is not this user's: the standard 404. */
export function NotFound404() {
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ display: 'inline-block', margin: '0 20px 0 0', paddingRight: 23, fontSize: 24, fontWeight: 500, borderRight: '1px solid rgba(0,0,0,.3)' }}>404</h1>
      <h2 style={{ display: 'inline-block', fontSize: 14, fontWeight: 400, margin: 0 }}>This page could not be found.</h2>
    </div>
  )
}

function SignInPrompt() {
  const path = typeof window === 'undefined' ? BUILDER_ROOT : window.location.pathname
  return (
    <div style={{ ...S.card, maxWidth: 560 }}>
      <h1 style={S.h1}>{MODULE_NAME}</h1>
      <p style={S.body}>{SIGNED_OUT_MESSAGE}</p>
      <a href={signInHref(path)} style={{ ...S.button, display: 'inline-block', textDecoration: 'none' }}>Sign in</a>
    </div>
  )
}

/** Shown on a report's own pages to an account that has not bought the module. */
export function PreviewNotice() {
  return (
    <div style={{ ...S.card, maxWidth: 640 }}>
      <h1 style={S.h1}>{MODULE_NAME}</h1>
      <p style={S.body}>{PREVIEW_MESSAGE}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href={ORDER_HREF} style={{ ...S.button, textDecoration: 'none' }}>{ORDER_LABEL}</a>
        <a href={`${BUILDER_ROOT}/${PREVIEW_ID}/${SECTIONS[0].key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Read through the sections</a>
      </div>
    </div>
  )
}

/** The banner on every page for an expired term. */
export function ReadOnlyBanner({ extra }: { extra?: string }) {
  return (
    <div role="status" style={S.warn}>
      <p style={{ margin: 0 }}>{READ_ONLY_MESSAGE}{extra ? ` ${extra}` : ''}</p>
      <a href={ORDER_HREF} style={{ display: 'inline-block', marginTop: 8, fontWeight: 600 }}>{RENEW_LABEL}</a>
    </div>
  )
}

/**
 * The frame every builder page uses. Signed out: a sign-in prompt. Access not checkable: says so.
 * Otherwise the page, told its state through useBuilderState(). `report` pages (a report's home, its
 * sections, its check page) show PreviewNotice to an account that has not bought the module, because
 * there is no report of theirs to open.
 */
export function BuilderFrame({ children, wide, report }: { children: ReactNode; wide?: boolean; report?: boolean }) {
  const access = useS211Access()
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-paper, #f8f7f5)' }}>
      <Nav />
      <style>{BUILDER_CSS}</style>
      <div style={wide ? { ...S.page, maxWidth: 1140 } : S.page}>
        {access === 'loading' && <p style={S.muted}>Loading</p>}
        {access === 'unreachable' && <p style={S.error}>The server could not be reached. Check your connection and reload the page.</p>}
        {access === 'unknown' && <p style={S.error}>{UNKNOWN_MESSAGE}</p>}
        {access === 'signed-out' && <SignInPrompt />}
        {access === 'preview' && report && <PreviewNotice />}
        {(access === 'full' || access === 'read-only' || (access === 'preview' && !report)) &&
          <AccessContext.Provider value={access}>{children}</AccessContext.Provider>}
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
export function FieldInput({ field, value, onChange, onBlur, options, content }: {
  field: Field; value: unknown; onChange: (v: unknown) => void; onBlur: () => void
  /** Overrides field.options, with labels: section 11's approval basis. */
  options?: { value: string; label: string }[]
  /** The section's answers, for a label or check that depends on them. */
  content?: SectionContent
}) {
  const id = `f-${field.key}`
  const str = typeof value === 'string' ? value : ''
  const opts = options ?? (field.options ?? []).map(o => ({ value: o, label: field.optionLabels?.[o] ?? o }))
  const len = str.length
  const label = field.labelWhen && content ? field.labelWhen(content) : field.label
  const invalid = field.validate && content ? field.validate(content) : null
  const head = (
    <>
      <label htmlFor={id} style={S.label}>
        {label}
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
    case 'month':
      control = <select id={id} style={{ ...S.input, maxWidth: 220 }} value={typeof value === 'number' ? String(value) : ''}
        onChange={e => { onChange(e.target.value === '' ? null : Number(e.target.value)); setTimeout(onBlur, 0) }}>
        <option value="">Choose a month</option>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      break
    case 'date':
      // A text box, not a date picker: Safari paints an empty date picker with today's date in grey,
      // which reads as an answer. Empty stays visibly empty; the format is in the placeholder.
      control = <>
        <input id={id} style={{ ...S.input, maxWidth: 220 }} inputMode="numeric" placeholder="YYYY-MM-DD" value={str} maxLength={10}
          onChange={e => onChange(e.target.value.trim())} onBlur={onBlur} />
        {str !== '' && !isIsoDate(str) && <div style={{ ...S.hint, color: '#B91C1C', margin: '4px 0 0' }}>Enter the date as YYYY-MM-DD, for example 2026-04-14.</div>}
      </>
      break
    case 'confirm':
      // A checkbox, which can be ticked and unticked. Never a radio button, which cannot be cleared.
      control = <label htmlFor={id} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 14, cursor: 'pointer' }}>
        <input id={id} type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--color-brand)' }} checked={value === true}
          onChange={e => { onChange(e.target.checked); setTimeout(onBlur, 0) }} /> Tick to confirm
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
              onChange={e => { onChange(toggleChecklist(picked, o.value, e.target.checked, field.exclusiveOption)); setTimeout(onBlur, 0) }} /> {o.label}
          </label>
        ))}
      </div>
      break
    }
    case 'list': {
      control = <>
        <textarea id={id} style={{ ...S.input, minHeight: 80 }} value={Array.isArray(value) ? (value as string[]).join('\n') : ''}
          onChange={e => onChange(e.target.value.split('\n'))} onBlur={() => { onChange((Array.isArray(value) ? value as string[] : []).map(s => s.trim()).filter(Boolean)); setTimeout(onBlur, 0) }} />
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
  return <div style={{ marginBottom: 18 }}>{head}{control}{invalid && <div style={{ ...S.hint, color: '#B91C1C', margin: '4px 0 0' }}>{invalid}</div>}</div>
}

/**
 * The choice offered when a new draft would replace text the user has edited (section 9's summary,
 * section 11's attestation): both versions side by side, so parts can be copied across, and two
 * buttons. Never a browser confirm() box.
 */
export function ReplaceDraftPanel({ intro, mine, next, keepLabel, replaceLabel, onKeep, onReplace }: {
  intro: string; mine: string; next: string; keepLabel: string; replaceLabel: string; onKeep: () => void; onReplace: () => void
}) {
  const box: CSSProperties = { ...S.input, minHeight: 160, fontSize: 13, lineHeight: 1.55, background: '#fff' }
  return (
    <div role="dialog" aria-label="Choose which version to keep" style={{ ...S.warn, padding: 16 }}>
      <p style={{ margin: '0 0 10px' }}>{intro}</p>
      <div className="s211-replace-grid">
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>Your version<textarea readOnly style={{ ...box, marginTop: 4 }} value={mine} /></label>
        <label style={{ fontSize: 12.5, fontWeight: 600 }}>New draft<textarea readOnly style={{ ...box, marginTop: 4 }} value={next} /></label>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" style={S.buttonQuiet} onClick={onKeep}>{keepLabel}</button>
        <button type="button" style={S.button} onClick={onReplace}>{replaceLabel}</button>
      </div>
    </div>
  )
}

/** Layout rules inline styles cannot express: the section menu's two forms, and the side-by-side panel. */
export const BUILDER_CSS = `
.s211-layout { display: grid; grid-template-columns: 1fr; gap: 24px; }
.s211-nav-side { display: none; }
.s211-nav-jump { display: block; margin-bottom: 14px; }
.s211-replace-grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
@media (min-width: 1000px) {
  .s211-layout { grid-template-columns: 230px minmax(0, 1fr); }
  .s211-nav-side { display: block; position: sticky; top: 16px; align-self: start; }
  .s211-nav-jump { display: none; }
}
@media (min-width: 720px) { .s211-replace-grid { grid-template-columns: 1fr 1fr; } }
`

/** Section 3's six OECD steps: fixed rows, a status for each. Plain text, one source note above (the page). */
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
          <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{step}</span>
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
