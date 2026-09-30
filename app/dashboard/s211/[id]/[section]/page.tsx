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
  SECTIONS, sectionDef, isSectionKey, KEY_TERMS, KEY_TERMS_EXPLANATION_LABEL, OECD_STEPS, OECD_STEPS_SOURCE_NOTE,
  ATTESTATION_EXAMPLE_NOTE, BUILDER_NOTE_ON_SIGNING, EXAMPLES_LABEL, MONTHS, quotedExample,
  type SectionContent, type SectionKey,
} from '../../../../../lib/s211/builderContent'
import { NOTHING_TO_REPORT_KEY, asList, missingRequired, type SectionStatus } from '../../../../../lib/s211/sectionStatus'
import { createAutosaver, autosaveLabel, type AutosaveState } from '../../../../../lib/s211/autosave'
import { deriveFinancialYear, MAY_31_QUESTION } from '../../../../../lib/s211/financialYear'
import { approvalBasisOptions, APPROVAL_BASIS_LABEL, APPROVAL_BASIS_NEEDS_REPORT_TYPE } from '../../../../../lib/s211/approval'
import {
  assembleSteps, buildStepsContent, stepsDraftState, summaryEdited, describeStepsChanges, STEP_ITEM_LABEL, STALE_NOTICE, DRAFT_NOTICE,
  REBUILD_PANEL_INTRO, KEEP_MINE, REPLACE_WITH_NEW, type StepItem,
} from '../../../../../lib/s211/stepsSummary'
import { refreshAttestation, signatureLines, attestationEdited } from '../../../../../lib/s211/attestation'
import { isFirstVisit, recordVisit, browserStore } from '../../../../../lib/s211/visits'
import {
  BuilderFrame, S, StatusPill, QuoteBlock, Disclosure, FieldInput, StepStatusRows, NotFound404, PersonalInformation,
  ReplaceDraftPanel, STATUS_LABEL,
} from '../../_components/ui'
import type { ReportRecord, SectionRow } from '../../_components/types'

type Autosaver = ReturnType<typeof createAutosaver<SectionContent>>
type Pending = { kind: 'steps' | 'attestation'; mine: string; next: SectionContent } | null

const FY_OVERRIDE_LINK = 'My financial year is different (for example a 52 to 53 week year, or a changed year end)'
const MAY_31_EXAMPLE = 'For example, an entity with a May 31 year end, reporting in 2026, covers June 1, 2024 to May 31, 2025, unless it confirms otherwise.'
const ATTESTATION_PANEL_INTRO = 'You have edited the attestation. A version with your latest answers filled in is shown beside yours. Copy anything you want to keep before you choose.'

function SectionPage({ id, sectionKey }: { id: string; sectionKey: SectionKey }) {
  const def = sectionDef(sectionKey)
  const idx = SECTIONS.findIndex(s => s.key === sectionKey)
  const prev = SECTIONS[idx - 1], next = SECTIONS[idx + 1]

  // FIRST VISIT: read once, when this section mounts, and recorded afterwards (lib/s211/visits.ts). The
  // page is keyed by section, so each section mounts afresh and reads its own state.
  const [firstVisit] = useState(() => isFirstVisit(browserStore(), id, sectionKey))
  useEffect(() => { recordVisit(browserStore(), id, sectionKey) }, [id, sectionKey])

  const [report, setReport] = useState<ReportRecord | null>(null)
  const [others, setOthers] = useState<Partial<Record<SectionKey, SectionContent>>>({})
  const [statuses, setStatuses] = useState<Partial<Record<SectionKey, SectionStatus>>>({})
  const [content, setContent] = useState<SectionContent>({})
  const [status, setStatus] = useState<SectionStatus>('not_started')
  const [loaded, setLoaded] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  const [save, setSave] = useState<AutosaveState>({ kind: 'idle' })
  const [refusal, setRefusal] = useState<{ message: string; missing: string[] } | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [showFyOverride, setShowFyOverride] = useState(false)
  const [pending, setPending] = useState<Pending>(null)
  const contentRef = useRef<SectionContent>({})
  const reportRef = useRef<ReportRecord | null>(null)
  const autosaverRef = useRef<Autosaver | null>(null)

  // ── Saving ────────────────────────────────────────────────────────────────────────────────────────
  const saveNow = useCallback(async (c: SectionContent, action: 'save' | 'complete' | 'reopen' = 'save') => {
    const r = await s211Api<{ section: SectionRow }>(`/reports/${id}/sections/${sectionKey}`, { method: 'PUT', body: { content: c, action } })
    if (r.data) { const st = r.data.section.status; setStatus(st); setStatuses(s => ({ ...s, [sectionKey]: st })) }
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

  const apply = (c: SectionContent) => {
    contentRef.current = c
    setContent(c)
    setRefusal(null)
    autosaverRef.current?.schedule(c)
  }
  const change = (key: string, value: unknown) => {
    let c = { ...contentRef.current, [key]: value }
    // Section 11: the attestation follows the signer's title while it is unedited (lib/s211/attestation.ts).
    if (sectionKey === 'approval_attestation' && key === 'signatory_title') {
      const r = refreshAttestation(c, { title: c.signatory_title, reportType: others.report_details?.report_type, legalName: others.report_details?.legal_name })
      c = r.content
      if (r.offer) setPending({ kind: 'attestation', mine: String(c.attestation_text ?? ''), next: { ...c, attestation_text: r.offer, _attestation_built: r.offer } })
    }
    apply(c)
  }
  const blur = () => { void autosaverRef.current?.flush(contentRef.current) }

  // ── Loading ───────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    void s211Api<{ report: ReportRecord; sections: SectionRow[] }>(`/reports/${id}`).then(r => {
      if (r.status === 404) { setLoaded('missing'); return }
      if (!r.data) { setLoaded('error'); return }
      setReport(r.data.report)
      reportRef.current = r.data.report
      const map = Object.fromEntries(r.data.sections.map(s => [s.section_key, s.content])) as Partial<Record<SectionKey, SectionContent>>
      setOthers(map)
      setStatuses(Object.fromEntries(r.data.sections.map(s => [s.section_key, s.status])))
      const mine = r.data.sections.find(s => s.section_key === sectionKey)
      let c: SectionContent = mine?.content ?? {}
      // Section 11: the attestation starts as Public Safety Canada's example with its placeholders filled
      // from the answers. Shown, not saved, until the user changes something.
      if (sectionKey === 'approval_attestation') {
        const res = refreshAttestation(c, { title: c.signatory_title, reportType: map.report_details?.report_type, legalName: map.report_details?.legal_name })
        c = res.content
        if (res.offer) setPending({ kind: 'attestation', mine: String(c.attestation_text ?? ''), next: { ...c, attestation_text: res.offer, _attestation_built: res.offer } })
      }
      // Section 9: a first draft from sections 3 to 8, built once when nothing is there yet. Nothing to overwrite.
      if (sectionKey === 'steps_taken' && typeof c._built_from !== 'string' && !(typeof c.steps_summary === 'string' && c.steps_summary.trim())) {
        c = buildStepsContent(c, map)
      }
      if (sectionKey === 'report_details') setShowFyOverride(!!(c.financial_year_start || c.financial_year_end))
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
    if (r.status === 422) setRefusal({ message: r.error ?? 'This section cannot be marked complete yet.', missing: missingRequired(sectionKey, contentRef.current) })
    else if (!r.data) setRefusal({ message: 'Not saved: check your connection', missing: [] })
    else setRefusal(null)
  }
  const reopen = async () => {
    const r = await saveNow(contentRef.current, 'reopen')
    if (!r.data) setRefusal({ message: 'Not saved: check your connection', missing: [] })
  }

  if (loaded === 'missing') return <NotFound404 />
  if (loaded === 'error') return <p style={S.error}>This section could not be loaded. Check your connection and reload the page.</p>
  if (loaded === 'loading' || !report) return <p style={S.muted}>Loading</p>

  // ── Section 1: the derived financial year ─────────────────────────────────────────────────────────
  const fy = sectionKey === 'report_details' && typeof content.year_end_month === 'number' && typeof content.year_end_day === 'number'
    ? deriveFinancialYear(content.year_end_month, content.year_end_day, report.reporting_year) : null

  // ── Section 9 ─────────────────────────────────────────────────────────────────────────────────────
  const steps = sectionKey === 'steps_taken' ? assembleSteps(others) : null
  const stepsState = sectionKey === 'steps_taken' ? stepsDraftState(content, others) : null
  const stepsChanges = sectionKey === 'steps_taken' && stepsState === 'stale' ? describeStepsChanges(content, others) : []
  const rebuild = (ticked?: StepItem[]) => {
    const nextContent = buildStepsContent(content, others, ticked)
    if (summaryEdited(content)) setPending({ kind: 'steps', mine: String(content.steps_summary ?? ''), next: nextContent })
    else apply(nextContent)
  }

  // ── Section 11 ────────────────────────────────────────────────────────────────────────────────────
  const basisOptions = approvalBasisOptions(others.report_details?.report_type)

  const visibleFields = def.fields.filter(f => (!f.showWhen || f.showWhen(content)) && (f.revealedBy !== 'fy_override' || showFyOverride))
  const nothing = typeof content[NOTHING_TO_REPORT_KEY] === 'string' ? content[NOTHING_TO_REPORT_KEY] as string : ''

  const nav = (
    <nav aria-label="Sections of this report">
      <div className="s211-nav-side">
        <p style={{ ...S.label, marginBottom: 8 }}>Sections</p>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {SECTIONS.map(d => {
            const current = d.key === sectionKey
            return (
              <li key={d.key} style={{ marginBottom: 4 }}>
                <Link href={`/dashboard/s211/${id}/${d.key}`} aria-current={current ? 'page' : undefined}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 8, textDecoration: 'none',
                    fontSize: 12.5, lineHeight: 1.35, color: 'var(--color-ink)', background: current ? '#E6F1F3' : 'transparent', fontWeight: current ? 600 : 400,
                    borderLeft: current ? '3px solid var(--color-brand)' : '3px solid transparent' }}>
                  <span>{d.number}. {d.title}</span>
                  <StatusPill status={statuses[d.key] ?? 'not_started'} />
                </Link>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="s211-nav-jump">
        <label htmlFor="jump" style={S.label}>Jump to section</label>
        <select id="jump" style={S.input} value={sectionKey} onChange={e => { window.location.href = `/dashboard/s211/${id}/${e.target.value}` }}>
          {SECTIONS.map(d => <option key={d.key} value={d.key}>{d.number}. {d.title} ({STATUS_LABEL[statuses[d.key] ?? 'not_started']})</option>)}
        </select>
      </div>
    </nav>
  )

  return (
    <div className="s211-layout">
      {nav}
      <main>
        <p style={{ ...S.muted, margin: '0 0 6px' }}><Link href={`/dashboard/s211/${id}`}>Back to report overview</Link></p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h1 style={S.h1}>{def.number}. {def.title}</h1>
          <div style={{ marginTop: 8 }}><StatusPill status={status} /></div>
        </div>
        {/* The same spacing on every section between this line and "What the Act asks". */}
        <p style={{ ...S.muted, margin: '0 0 20px' }}>{def.mapsTo}</p>

        {sectionKey === 'report_details' && <div style={{ marginBottom: 20 }}><PersonalInformation /></div>}

        {def.actQuote ? <><p style={{ ...S.label, marginTop: 0 }}>What the Act asks</p><QuoteBlock q={def.actQuote} /></>
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

        {pending && (
          <ReplaceDraftPanel
            intro={pending.kind === 'steps' ? REBUILD_PANEL_INTRO : ATTESTATION_PANEL_INTRO}
            mine={pending.mine} next={String(pending.kind === 'steps' ? pending.next.steps_summary ?? '' : pending.next.attestation_text ?? '')}
            keepLabel={KEEP_MINE} replaceLabel={REPLACE_WITH_NEW}
            onKeep={() => {
              // Keep the user's text, and record that this draft was offered, so the same offer does not return.
              if (pending.kind === 'steps') apply({ ...content, _built_from: pending.next._built_from, _built_texts: pending.next._built_texts, _built_summary: content.steps_summary })
              else apply({ ...content, _attestation_built: content.attestation_text })
              setPending(null)
            }}
            onReplace={() => { apply(pending.next); setPending(null) }} />
        )}

        <div style={{ ...S.card, marginTop: 6 }}>
          {sectionKey === 'steps_taken' && steps && (
            <StepsPanel steps={steps} changes={stepsChanges} content={content} onRebuild={rebuild}
              onAppend={text => change('steps_summary', `${(content.steps_summary as string ?? '').trim()} ${text}`.trim())} />
          )}

          {visibleFields.map(f => {
            if (sectionKey === 'policies_due_diligence' && f.key === 'due_diligence_steps') return (
              <div key={f.key} style={{ marginBottom: 18 }}>
                <label style={S.label}>{f.label}</label>
                <p style={S.hint}>{OECD_STEPS_SOURCE_NOTE} {f.hint}</p>
                <StepStatusRows steps={OECD_STEPS} value={content[f.key]} onChange={v => change(f.key, v)} onBlur={blur} />
              </div>
            )
            return (
              <div key={f.key}>
                {sectionKey === 'report_details' && f.key === 'financial_year_confirmed' && <FinancialYear fy={fy} />}
                {sectionKey === 'approval_attestation' && f.key === 'approval_basis' && basisOptions.length === 0 && <p style={S.warn}>{APPROVAL_BASIS_NEEDS_REPORT_TYPE}</p>}
                {sectionKey === 'approval_attestation' && f.key === 'approval_basis' && typeof content.approval_basis === 'string' && content.approval_basis && basisOptions.length > 0
                  && !basisOptions.includes(content.approval_basis as (typeof basisOptions)[number])
                  && <p style={S.warn}>The basis saved here does not match the report type chosen in section 1. Choose again.</p>}
                {f.key === 'controlled_entities' && def.controlledEntities && <p style={S.hint}>Public Safety Canada guidance: &ldquo;{def.controlledEntities}&rdquo;</p>}
                <FieldInput field={f} value={content[f.key]} content={content} onChange={v => change(f.key, v)} onBlur={blur}
                  options={sectionKey === 'approval_attestation' && f.key === 'approval_basis' ? basisOptions.map(b => ({ value: b, label: APPROVAL_BASIS_LABEL[b] })) : undefined} />
                {sectionKey === 'report_details' && f.key === 'financial_year_confirmed' && !showFyOverride && (
                  <p style={{ margin: '-8px 0 18px' }}>
                    <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-brand)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
                      onClick={() => setShowFyOverride(true)}>{FY_OVERRIDE_LINK}</button>
                  </p>
                )}
                {sectionKey === 'approval_attestation' && f.key === 'attestation_text' && (
                  <div style={{ ...S.warn, marginTop: -8 }}>
                    <p style={{ margin: '0 0 8px' }}>{ATTESTATION_EXAMPLE_NOTE}</p>
                    {attestationEdited(content) && <p style={{ margin: '0 0 8px' }}>You have edited this text, so later changes to your answers will not change it without asking you.</p>}
                    <p style={{ margin: '0 0 4px' }}>The signature block printed under it, as the guidance lists it, with your entity&rsquo;s name:</p>
                    <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{signatureLines(others.report_details?.legal_name).map(l => <li key={l}>{l}</li>)}</ul>
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
          <p style={S.label}>A common weak answer</p><p style={S.body}>{quotedExample(def.weakExample)}</p>
          <p style={S.muted}>Why it is weak: {def.weakWhy}</p>
        </details>

        {refusal && (
          <div style={S.error}>
            <p style={{ margin: 0 }}>{refusal.message}</p>
            {asList(refusal.missing) && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{refusal.missing.map(m => <li key={m}>{m}</li>)}</ul>}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
          {prev ? <Link href={`/dashboard/s211/${id}/${prev.key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Previous</Link> : <span />}
          {next ? <Link href={`/dashboard/s211/${id}/${next.key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Next</Link>
            : <Link href={`/dashboard/s211/${id}/check`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Check the report</Link>}
          {status === 'complete'
            ? <button type="button" style={S.buttonQuiet} onClick={reopen}>Reopen this section</button>
            : <button type="button" style={S.button} onClick={complete}>Mark as complete</button>}
          <span aria-live="polite" style={{ ...S.muted, color: save.kind === 'error' ? '#B91C1C' : 'var(--color-ink-muted)' }}>{autosaveLabel(save)}</span>
        </div>
      </main>
    </div>
  )
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
  if (!fy) return <p style={S.hint}>Choose the month and enter the day of the financial year end to see the financial year this report covers.</p>
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number)
    return `${MONTHS[m - 1]} ${d}, ${y}`
  }
  return (
    <div style={fy.askUser ? S.warn : { ...S.card, background: '#F7FBFB' }}>
      <p style={{ margin: 0, fontSize: 14 }}>Based on the guidance, this report covers: <strong>{fmt(fy.start)} to {fmt(fy.end)}</strong>.</p>
      {fy.askUser && <>
        <p style={{ margin: '8px 0 0' }}>{MAY_31_QUESTION}</p>
        <p style={{ ...S.hint, margin: '8px 0 0' }}>{MAY_31_EXAMPLE}</p>
      </>}
    </div>
  )
}

function StepsPanel({ steps, changes, content, onRebuild, onAppend }: {
  steps: ReturnType<typeof assembleSteps>; changes: string[]; content: SectionContent
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
      {changes.length > 0 && (
        <div style={{ ...S.warn, marginTop: 10 }}>
          <p style={{ margin: '0 0 6px' }}>{STALE_NOTICE}</p>
          <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{changes.map(c => <li key={c}>{c}</li>)}</ul>
          <button type="button" style={{ ...S.buttonQuiet, padding: '5px 10px' }} onClick={() => onRebuild()}>Rebuild the summary</button>
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
  // Keyed by section: moving between sections mounts a fresh page, so each reads its own first visit.
  return <BuilderFrame wide><SectionPage key={section} id={id} sectionKey={section} /></BuilderFrame>
}
