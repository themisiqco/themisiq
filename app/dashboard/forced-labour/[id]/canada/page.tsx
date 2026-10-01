'use client'

// app/dashboard/forced-labour/[id]/canada/page.tsx
// The Canada tab of a report: whether the Act applies (lib/s211/entity.ts, lib/s211/obligation.ts), with
// the reasons, then the eleven sections with their status. Gated; see ../../_components/ui.tsx.
// It was the report's home (/dashboard/forced-labour/[id]) until Stage D1 (1 Oct 2026), when that became the
// overview of every country on the report; this page is otherwise unchanged.

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../../../lib/s211/client'
import { SECTIONS, type SectionKey } from '../../../../../lib/s211/builderContent'
import { completeCount, type SectionStatus } from '../../../../../lib/s211/sectionStatus'
import { evaluateApplicability, formToReportPatch, formToActivities } from '../../../../../lib/s211/applicability'
import { ApplicabilityQuestions, ApplicabilityResult } from '../../_components/Applicability'
import { BuilderFrame, ReadOnlyBanner, S, StatusPill, useBuilderState } from '../../_components/ui'
import { canWrite, READ_ONLY_EXPORT_NOTE } from '../../../../../lib/s211/builderAccess'
import type { ReportRecord, SectionRow } from '../../_components/types'
import { CountryTabs } from '../../_components/CountryTabs'
import { formOf, actsOf } from '../../_components/canadaForm'


function Home({ id }: { id: string }) {
  const writable = canWrite(useBuilderState())
  const [report, setReport] = useState<ReportRecord | null>(null)
  const [sections, setSections] = useState<SectionRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    void s211Api<{ report: ReportRecord; sections: SectionRow[] }>(`/reports/${id}`).then(r => {
      if (r.status === 404) { setMissing(true); return }
      if (!r.data) { setError(r.error); return }
      setReport(r.data.report); setSections(r.data.sections)
      setForm(formOf(r.data.report, actsOf(r.data.sections)))
    })
  }, [id])

  const statuses = useMemo(() => Object.fromEntries(sections.map(s => [s.section_key, s.status])) as Partial<Record<SectionKey, SectionStatus>>, [sections])

  // The result is of the SAVED answers, so it never shows a finding for edits not yet saved.
  const result = useMemo(() => (report ? evaluateApplicability(formOf(report, actsOf(sections))) : null), [report, sections])

  const saveApplicability = async () => {
    if (!report) return
    setSaveMsg('Saving')
    const r1 = await s211Api<{ report: ReportRecord }>(`/reports/${id}`, { method: 'PATCH', body: formToReportPatch(form) })
    if (!r1.data) { setSaveMsg(r1.error ?? 'Not saved: check your connection'); return }
    const details = sections.find(s => s.section_key === 'report_details')?.content ?? {}
    const _applicability = formToActivities(form)
    const r2 = await s211Api<{ section: SectionRow }>(`/reports/${id}/sections/report_details`, { method: 'PUT', body: { content: { ...details, _applicability } } })
    if (!r2.data) { setSaveMsg(r2.error ?? 'Not saved: check your connection'); return }
    setReport(r1.data.report)
    setSections(prev => [...prev.filter(s => s.section_key !== 'report_details'), r2.data!.section])
    const at = new Date()
    setSaveMsg(`Saved at ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`)
  }

  if (missing) return <p style={S.muted}>This report was not found. <Link href="/dashboard/forced-labour">Back to your reports</Link></p>
  if (error) return <p style={S.error}>{error}</p>
  if (!report || !result) return <p style={S.muted}>Loading</p>

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const done = completeCount(statuses)

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href="/dashboard/forced-labour">Your reports</Link></p>
      <CountryTabs id={id} current="canada" />
      <h1 style={S.h1}>{report.company_name}</h1>
      <p style={S.muted}>Reporting year {report.reporting_year}. {done} of 11 sections complete.</p>
      {!writable && <ReadOnlyBanner extra={READ_ONLY_EXPORT_NOTE} />}

      <h2 style={S.h2}>Does the Act apply?</h2>
      <ApplicabilityResult result={result} />

      <details style={{ ...S.card, padding: '10px 16px' }}>
        <summary style={{ fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{writable ? 'Answer or change the applicability questions' : 'The applicability answers'}</summary>
        {/* Read-only: every control disabled at once. The database refuses a write anyway. */}
        <fieldset disabled={!writable} style={{ border: 0, padding: 0, margin: '12px 0 0', minWidth: 0 }}>
          <ApplicabilityQuestions form={form} onChange={set} />
          {writable && <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
            <button type="button" style={S.button} onClick={saveApplicability}>Save these answers</button>
            {saveMsg && <span style={S.muted}>{saveMsg}</span>}
          </div>}
        </fieldset>
      </details>

      <h2 style={S.h2}>Sections</h2>
      {SECTIONS.map(d => (
        <Link key={d.key} href={`/dashboard/forced-labour/${id}/canada/${d.key}`} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none', padding: '12px 16px' }}>
          <span style={{ fontSize: 14, color: 'var(--color-ink)' }}>{d.number}. {d.title}{d.optional ? ' (optional)' : ''}</span>
          <StatusPill status={statuses[d.key] ?? 'not_started'} />
        </Link>
      ))}
      <p style={{ marginTop: 18 }}><Link href={`/dashboard/forced-labour/${id}/canada/check`} style={{ ...S.buttonQuiet, textDecoration: 'none', display: 'inline-block' }}>Check the report before export</Link></p>
    </>
  )
}

export default function CanadaReportHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BuilderFrame report><Home id={id} /></BuilderFrame>
}
