'use client'

// app/dashboard/s211/[id]/[section]/page.tsx
// One section of an S-211 report per page. The layout is the same for all eleven: the Act's words, the
// plain explanation, the prompts, "Nothing to report this year?", the examples, and Previous / Next /
// Mark as complete. Sections 1, 9 and 11 add what only they need. Content: lib/s211/builderContent.ts.
//
// Autosave (lib/s211/autosave.ts): after a pause in typing and on leaving a field. The status is set by
// the server (app/api/s211/reports/[id]/sections/[key]/route.ts), never here.

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../../../lib/s211/client'
import {
  SECTIONS, sectionDef, isSectionKey, KEY_TERMS, KEY_TERMS_EXPLANATION_LABEL, OECD_STEPS,
  ATTESTATION_DEFAULT, ATTESTATION_EXAMPLE_NOTE, ATTESTATION_SIGNATURE_LINES, BUILDER_NOTE_ON_SIGNING, EXAMPLES_LABEL,
  type SectionContent, type SectionKey,
} from '../../../../../lib/s211/builderContent'
import { NOTHING_TO_REPORT_KEY, type SectionStatus } from '../../../../../lib/s211/sectionStatus'
import { createAutosaver, autosaveLabel, type AutosaveState } from '../../../../../lib/s211/autosave'

type Autosaver = ReturnType<typeof createAutosaver<SectionContent>>
import { deriveFinancialYear, MAY_31_QUESTION } from '../../../../../lib/s211/financialYear'
import { approvalBasisOptions, APPROVAL_BASIS_LABEL, APPROVAL_BASIS_NEEDS_REPORT_TYPE } from '../../../../../lib/s211/approval'
import {
  assembleSteps, buildStepsContent, stepsDraftState, summaryEdited, STEP_ITEM_LABEL, STALE_NOTICE, REBUILD_CONFIRM, DRAFT_NOTICE,
  type StepItem,
} from '../../../../../lib/s211/stepsSummary'
import { BuilderFrame, S, StatusPill, QuoteBlock, Disclosure, FieldInput, StepStatusRows, NotFound404, PersonalInformation } from '../../_components/ui'
import type { ReportRecord, SectionRow } from '../../_components/types'

// "In plain terms" and "What readers look for" open on a first visit and stay closed after. A per-viewer
// convenience, kept in the browser; if storage is unavailable they simply open every time.
const visitedKey = (id: string, key: string) => `themisiq:s211:visited:${id}:${key}`
const wasVisited = (id: string, key: string) => { try { return localStorage.getItem(visitedKey(id, key)) === '1' } catch { return false } }
const markVisited = (id: string, key: string) => { try { localStorage.setItem(visitedKey(id, key), '1') } catch { /* storage unavailable */ } }

function SectionPage({ id, sectionKey }: { id: string; sectionKey: SectionKey }) {
  const def = sectionDef(sectionKey)
  const idx = SECTIONS.findIndex(s => s.key === sectionKey)
  const prev = SECTIONS[idx - 1], next = SECTIONS[idx + 1]

  const [report, setReport] = useState<ReportRecord | null>(null)
  const [others, setOthers] = useState<Partial<Record<SectionKey, SectionContent>>>({})
  const [content, setContent] = useState<SectionContent>({})
  const [status, setStatus] = useState<SectionStatus>('not_started')
  const [loaded, setLoaded] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  const [save, setSave] = useState<AutosaveState>({ kind: 'idle' })
  const [message, setMessage] = useState<string | null>(null)
  const [firstVisit, setFirstVisit] = useState(true)
  const [showTerms, setShowTerms] = useState(false)
  const contentRef = useRef<SectionContent>({})
  const reportRef = useRef<ReportRecord | null>(null)
  const autosaverRef = useRef<Autosaver | null>(null)

  // ── Saving ────────────────────────────────────────────────────────────────────────────────────────
  const saveNow = useCallback(async (c: SectionContent, action: 'save' | 'complete' | 'reopen' = 'save') => {
    const r = await s211Api<{ section: SectionRow }>(`/reports/${id}/sections/${sectionKey}`, { method: 'PUT', body: { content: c, action } })
    if (r.data) setStatus(r.data.section.status)
    return r
  }, [id, sectionKey])

  // Created once per section, outside render. It reads the report from a ref when it saves.
  useEffect(() => {
    const a = createAutosaver<SectionContent>({
      save: async c => {
        const r = await saveNow(c)
        // Section 1: keep the report's own financial year end in step with the confirmed dates.
        const rep = reportRef.current
        if (r.data && rep && sectionKey === 'report_details' && c.financial_year_confirmed === true) {
          const derived = typeof c.year_end_month === 'number' && typeof c.year_end_day === 'number'
            ? deriveFinancialYear(c.year_end_month, c.year_end_day, rep.reporting_year) : null
          const end = typeof c.financial_year_end === 'string' && c.financial_year_end ? c.financial_year_end : derived?.end
          if (end) await s211Api(`/reports/${id}`, { method: 'PATCH', body: { financial_year_end: end } })
        }
        return !!r.data
      },
      onState: setSave,
    })
    autosaverRef.current = a
    return () => { a.dispose(); autosaverRef.current = null }
  }, [saveNow, sectionKey, id])

  const change = (key: string, value: unknown) => {
    const c = { ...contentRef.current, [key]: value }
    contentRef.current = c
    setContent(c)
    setMessage(null)
    autosaverRef.current?.schedule(c)
  }
  const blur = () => { void autosaverRef.current?.flush(contentRef.current) }
  const replace = (c: SectionContent) => { contentRef.current = c; setContent(c); autosaverRef.current?.schedule(c) }

  // ── Loading ───────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    void s211Api<{ report: ReportRecord; sections: SectionRow[] }>(`/reports/${id}`).then(r => {
      if (r.status === 404) { setLoaded('missing'); return }
      if (!r.data) { setLoaded('error'); return }
      setReport(r.data.report)
      reportRef.current = r.data.report
      // First visit: open the two explanations. Recorded as visited from now on.
      setFirstVisit(!wasVisited(id, sectionKey))
      markVisited(id, sectionKey)
      const map = Object.fromEntries(r.data.sections.map(s => [s.section_key, s.content])) as Partial<Record<SectionKey, SectionContent>>
      setOthers(map)
      const mine = r.data.sections.find(s => s.section_key === sectionKey)
      let c: SectionContent = mine?.content ?? {}
      // Section 11: the attestation starts as Public Safety Canada's example. Shown, not saved, until edited.
      if (sectionKey === 'approval_attestation' && typeof c.attestation_text !== 'string') c = { ...c, attestation_text: ATTESTATION_DEFAULT }
      // Section 9: a first draft from sections 3 to 8, built once when nothing is there yet. Nothing to overwrite.
      if (sectionKey === 'steps_taken' && typeof c._built_from !== 'string' && !(typeof c.steps_summary === 'string' && c.steps_summary.trim())) {
        c = buildStepsContent(c, map)
      }
      contentRef.current = c
      setContent(c)
      setStatus(mine?.status ?? 'not_started')
      setLoaded('ok')
    })
  }, [id, sectionKey])

  // ── Complete / reopen ─────────────────────────────────────────────────────────────────────────────
  const complete = async () => {
    await autosaverRef.current?.flush(contentRef.current)
    const r = await saveNow(contentRef.current, 'complete')
    if (r.status === 422) setMessage(r.error)
    else if (!r.data) setMessage('Not saved: check your connection')
    else setMessage(null)
  }
  const reopen = async () => {
    const r = await saveNow(contentRef.current, 'reopen')
    if (!r.data) setMessage('Not saved: check your connection')
  }

  if (loaded === 'missing') return <NotFoundInReport />
  if (loaded === 'error') return <p style={S.error}>This section could not be loaded. Check your connection and reload the page.</p>
  if (loaded === 'loading' || !report) return <p style={S.muted}>Loading</p>

  // ── Section 1: the derived financial year ─────────────────────────────────────────────────────────
  const fy = sectionKey === 'report_details' && typeof content.year_end_month === 'number' && typeof content.year_end_day === 'number'
    ? deriveFinancialYear(content.year_end_month, content.year_end_day, report.reporting_year) : null

  // ── Section 9 ─────────────────────────────────────────────────────────────────────────────────────
  const steps = sectionKey === 'steps_taken' ? assembleSteps(others) : null
  const stepsState = sectionKey === 'steps_taken' ? stepsDraftState(content, others) : null
  const rebuild = (ticked?: StepItem[]) => {
    if (summaryEdited(content) && !window.confirm(REBUILD_CONFIRM)) return
    replace(buildStepsContent(content, others, ticked))
  }

  // ── Section 11: approval basis limited by the report type ─────────────────────────────────────────
  const basisOptions = approvalBasisOptions(others.report_details?.report_type)

  const visibleFields = def.fields.filter(f => !f.showWhen || f.showWhen(content))
  const nothing = typeof content[NOTHING_TO_REPORT_KEY] === 'string' ? content[NOTHING_TO_REPORT_KEY] as string : ''

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href={`/dashboard/s211/${id}`}>{report.company_name}, reporting year {report.reporting_year}</Link></p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <h1 style={S.h1}>{def.number}. {def.title}</h1>
        <div style={{ marginTop: 8 }}><StatusPill status={status} /></div>
      </div>
      <p style={S.muted}>{def.mapsTo}</p>

      {(sectionKey === 'report_details') && <PersonalInformation />}

      {def.actQuote ? <><p style={S.label}>What the Act asks</p><QuoteBlock q={def.actQuote} /></>
        : <p style={S.warn}>The Canadian Act does not ask for this section. It is optional.</p>}

      <Disclosure title="In plain terms" open={firstVisit}><p style={{ ...S.body, margin: 0 }}>{def.plainTerms}</p></Disclosure>
      <Disclosure title="What readers look for" open={firstVisit}><p style={{ ...S.body, margin: 0 }}>{def.readersLookFor}</p></Disclosure>
      <p style={{ margin: '0 0 14px' }}>
        <button type="button" style={{ ...S.buttonQuiet, padding: '6px 12px' }} onClick={() => setShowTerms(v => !v)}>{showTerms ? 'Hide key terms' : 'Key terms'}</button>
      </p>
      {showTerms && <KeyTerms />}

      {def.context.length > 0 && (
        <Disclosure title="What Public Safety Canada's guidance says">
          {def.context.map((q, i) => <QuoteBlock key={i} q={q} />)}
        </Disclosure>
      )}

      <div style={{ ...S.card, marginTop: 6 }}>
        {sectionKey === 'steps_taken' && steps && (
          <StepsPanel steps={steps} state={stepsState} content={content} onRebuild={rebuild} onAppend={text => change('steps_summary', `${(content.steps_summary as string ?? '').trim()} ${text}`.trim())} />
        )}

        {visibleFields.map(f => {
          if (sectionKey === 'policies_due_diligence' && f.key === 'due_diligence_steps') return (
            <div key={f.key} style={{ marginBottom: 18 }}>
              <label style={S.label}>{f.label}</label><p style={S.hint}>{f.hint}</p>
              <StepStatusRows steps={OECD_STEPS} value={content[f.key]} onChange={v => change(f.key, v)} onBlur={blur} />
            </div>
          )
          const input = (
            <FieldInput key={f.key} field={f} value={content[f.key]} onChange={v => change(f.key, v)} onBlur={blur}
              options={sectionKey === 'approval_attestation' && f.key === 'approval_basis' ? basisOptions.map(b => ({ value: b, label: APPROVAL_BASIS_LABEL[b] })) : undefined} />
          )
          return (
            <div key={f.key}>
              {sectionKey === 'report_details' && f.key === 'financial_year_confirmed' && <FinancialYear fy={fy} />}
              {sectionKey === 'approval_attestation' && f.key === 'approval_basis' && basisOptions.length === 0 && <p style={S.warn}>{APPROVAL_BASIS_NEEDS_REPORT_TYPE}</p>}
              {sectionKey === 'approval_attestation' && f.key === 'approval_basis' && typeof content.approval_basis === 'string' && content.approval_basis && basisOptions.length > 0
                && !basisOptions.includes(content.approval_basis as (typeof basisOptions)[number])
                && <p style={S.warn}>The basis saved here does not match the report type chosen in section 1. Choose again.</p>}
              {f.key === 'controlled_entities' && def.controlledEntities && <p style={S.hint}>Public Safety Canada guidance: &ldquo;{def.controlledEntities}&rdquo;</p>}
              {input}
              {sectionKey === 'approval_attestation' && f.key === 'attestation_text' && (
                <div style={{ ...S.warn, marginTop: -8 }}>
                  <p style={{ margin: '0 0 8px' }}>{ATTESTATION_EXAMPLE_NOTE}</p>
                  <p style={{ margin: '0 0 4px' }}>The signature block printed under it, as the guidance lists it:</p>
                  <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{ATTESTATION_SIGNATURE_LINES.map(l => <li key={l}>{l}</li>)}</ul>
                  <p style={{ margin: 0 }}>{BUILDER_NOTE_ON_SIGNING}</p>
                </div>
              )}
            </div>
          )
        })}

        {def.nothingToReport && (
          <div style={{ borderTop: '1px solid #e8e7e4', paddingTop: 14, marginTop: 6 }}>
            <p style={S.label}>Nothing to report this year?</p>
            <p style={S.hint}>The report must say so plainly rather than leave the section out.{def.nothingToReportNote ? ` ${def.nothingToReportNote}` : ''}</p>
            {nothing
              ? <>
                  <textarea style={{ ...S.input, minHeight: 70 }} value={nothing} onChange={e => change(NOTHING_TO_REPORT_KEY, e.target.value)} onBlur={blur} />
                  <button type="button" style={{ ...S.buttonQuiet, marginTop: 8 }} onClick={() => { change(NOTHING_TO_REPORT_KEY, ''); blur() }}>Remove this sentence</button>
                </>
              : <button type="button" style={S.buttonQuiet} onClick={() => { change(NOTHING_TO_REPORT_KEY, def.nothingToReport); blur() }}>Use the plain sentence</button>}
          </div>
        )}
        {!def.nothingToReport && def.nothingToReportNote && <p style={{ ...S.hint, borderTop: '1px solid #e8e7e4', paddingTop: 12 }}>{def.nothingToReportNote}</p>}

        <p style={{ ...S.hint, marginTop: 12 }}>Suggested length: {def.characterGuidance} This is our suggestion. The guidance sets no level of detail.</p>
      </div>

      <details style={{ ...S.card, padding: '10px 16px' }}>
        <summary style={{ fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Examples of a strong and a weak answer</summary>
        <p style={{ ...S.hint, marginTop: 10 }}>{EXAMPLES_LABEL}</p>
        <p style={S.label}>A strong answer</p><p style={S.body}>{def.strongExample}</p>
        <p style={S.label}>A common weak answer</p><p style={S.body}>&ldquo;{def.weakExample}&rdquo;</p>
        <p style={S.muted}>Why it is weak: {def.weakWhy}</p>
      </details>

      {message && <p style={S.error}>{message}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
        {prev ? <Link href={`/dashboard/s211/${id}/${prev.key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Previous</Link> : <span />}
        {next ? <Link href={`/dashboard/s211/${id}/${next.key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Next</Link>
          : <Link href={`/dashboard/s211/${id}/check`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Check the report</Link>}
        {status === 'complete'
          ? <button type="button" style={S.buttonQuiet} onClick={reopen}>Reopen this section</button>
          : <button type="button" style={S.button} onClick={complete}>Mark as complete</button>}
        <span aria-live="polite" style={{ ...S.muted, color: save.kind === 'error' ? '#B91C1C' : 'var(--color-ink-muted)' }}>{autosaveLabel(save)}</span>
      </div>
    </>
  )
}

function NotFoundInReport() {
  return <NotFound404 />
}

function KeyTerms() {
  return (
    <div style={{ ...S.card }}>
      {KEY_TERMS.map(t => (
        <div key={t.term} style={{ marginBottom: 14 }}>
          <p style={{ ...S.label, marginBottom: 6 }}>{t.term}</p>
          <QuoteBlock q={t.quote} />
          <p style={{ ...S.muted, margin: 0 }}><em>{KEY_TERMS_EXPLANATION_LABEL}:</em> {t.explanation}</p>
        </div>
      ))}
    </div>
  )
}

function FinancialYear({ fy }: { fy: ReturnType<typeof deriveFinancialYear> }) {
  if (!fy) return <p style={S.hint}>Enter the month and day of the financial year end to see the financial year this report covers.</p>
  const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return (
    <div style={fy.askUser ? S.warn : { ...S.card, background: '#F7FBFB' }}>
      <p style={{ margin: 0, fontSize: 14 }}>
        {fy.askUser ? 'The rule gives: ' : 'This report covers the financial year '}<strong>{fmt(fy.start)} to {fmt(fy.end)}</strong>{fy.askUser ? '.' : '.'}
      </p>
      {fy.askUser && <p style={{ margin: '8px 0 0' }}>{MAY_31_QUESTION}</p>}
      <p style={{ ...S.hint, margin: '8px 0 0' }}>For example, an entity with a March 31 year end, reporting in 2026, covers the financial year ending March 31, 2026.</p>
    </div>
  )
}

function StepsPanel({ steps, state, content, onRebuild, onAppend }: {
  steps: ReturnType<typeof assembleSteps>; state: ReturnType<typeof stepsDraftState> | null; content: SectionContent
  onRebuild: (ticked?: StepItem[]) => void; onAppend: (text: string) => void
}) {
  const ticked = Array.isArray(content.steps_checklist) ? content.steps_checklist as StepItem[] : steps.checklist
  const toggle = (item: StepItem) => onRebuild(ticked.includes(item) ? ticked.filter(t => t !== item) : [...ticked, item])
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={S.label}>Steps taken in the financial year, from your answers in sections 3 to 8</p>
      <p style={S.hint}>{DRAFT_NOTICE} Untick anything that did not happen in this financial year; the summary is rebuilt from what stays ticked.</p>
      {steps.sentences.length === 0 && <p style={S.hint}>Your answers in sections 3 to 8 do not yet record any step taken. If none was taken, use the plain sentence below.</p>}
      {steps.checklist.map(item => (
        <label key={item} style={{ display: 'flex', gap: 8, fontSize: 13.5, marginBottom: 4 }}>
          <input type="checkbox" checked={ticked.includes(item)} onChange={() => toggle(item)} /> {STEP_ITEM_LABEL[item]}
        </label>
      ))}
      {state === 'stale' && (
        <div style={{ ...S.warn, marginTop: 10 }}>
          {STALE_NOTICE} <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px', marginLeft: 6 }} onClick={() => onRebuild()}>Rebuild the summary</button>
        </div>
      )}
      {steps.inProgress.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={S.label}>Work under way, kept out of the summary</p>
          <p style={S.hint}>These were answered &ldquo;In progress&rdquo;, so they are not steps taken in the year. Add one only as a separate, clearly marked sentence.</p>
          {steps.inProgress.map(w => (
            <div key={w.item} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, marginBottom: 6 }}>
              <span style={{ flex: 1 }}>{w.text}</span>
              <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px' }} onClick={() => onAppend(w.text)}>Add to the end</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function S211SectionPage({ params }: { params: Promise<{ id: string; section: string }> }) {
  const { id, section } = use(params)
  if (!isSectionKey(section)) return <NotFound404 />
  return <BuilderFrame><SectionPage id={id} sectionKey={section} /></BuilderFrame>
}
