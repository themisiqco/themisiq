'use client'

// app/dashboard/forced-labour/page.tsx
// Forced Labour Reporting: the user's reports and a form to start one (full access); their reports with
// no form (expired: read-only); or the module explained with an order link and a read-through of the
// sections (never bought: preview). States: lib/s211/builderAccess.ts.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../lib/s211/client'
import { defaultReportingYear } from '../../../lib/s211/defaults'
import { SECTIONS } from '../../../lib/s211/builderContent'
import { BUILDER_ROOT, PREVIEW_ID, ORDER_HREF, ORDER_LABEL, READ_ONLY_EXPORT_NOTE, canWrite } from '../../../lib/s211/builderAccess'
import { BuilderFrame, ReadOnlyBanner, S, useBuilderState } from './_components/ui'

type ReportRow = { id: string; company_name: string; reporting_year: number; status: string; updated_at: string }

/** Never bought: what the module does, and the way in. Nothing is fetched and nothing can be stored. */
function Preview() {
  return (
    <>
      <h1 style={S.h1}>Forced Labour Reporting</h1>
      <p style={S.body}>
        Prepare the annual report Canada&rsquo;s Fighting Against Forced Labour and Child Labour in Supply Chains Act requires, one
        section at a time. Each section shows the Act&rsquo;s words, what they mean in plain terms, what readers look for and
        Public Safety Canada&rsquo;s guidance. The finished report is checked for missing answers and personal information, and
        downloads as a PDF ready for your governing body to approve and sign.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0 8px' }}>
        <a href={ORDER_HREF} style={{ ...S.button, textDecoration: 'none' }}>{ORDER_LABEL}</a>
        <a href={`${BUILDER_ROOT}/${PREVIEW_ID}/${SECTIONS[0].key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Read through the sections</a>
      </div>
      <p style={S.muted}>One flat annual price. The read-through shows every section with its questions; answering them, saving a report and downloading it come with the module.</p>
      <h2 style={S.h2}>The sections</h2>
      <ol style={{ ...S.body, paddingLeft: 20 }}>
        {SECTIONS.map(d => <li key={d.key}><Link href={`${BUILDER_ROOT}/${PREVIEW_ID}/${d.key}`}>{d.title}</Link>{d.optional ? ' (optional)' : ''}</li>)}
      </ol>
    </>
  )
}

function ReportsList() {
  const state = useBuilderState()
  const writable = canWrite(state)
  const [reports, setReports] = useState<ReportRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [company, setCompany] = useState('')
  const [year, setYear] = useState(() => String(defaultReportingYear(new Date())))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    void s211Api<{ reports: ReportRow[] }>('/reports').then(r => {
      if (r.data) setReports(r.data.reports)
      else setLoadError(r.error ?? 'The reports could not be loaded.')
    })
  }, [])

  const create = async () => {
    setCreating(true); setCreateError(null)
    const r = await s211Api<{ report: ReportRow }>('/reports', { method: 'POST', body: { company_name: company, reporting_year: Number(year) } })
    setCreating(false)
    if (r.data) window.location.href = `${BUILDER_ROOT}/${r.data.report.id}`
    else setCreateError(r.error)
  }

  return (
    <>
      <h1 style={S.h1}>Forced labour and child labour reports</h1>
      <p style={S.muted}>
        Prepare the annual report required by the Fighting Against Forced Labour and Child Labour in Supply Chains Act, one section at a time.
      </p>
      {!writable && <ReadOnlyBanner extra={READ_ONLY_EXPORT_NOTE} />}

      <h2 style={S.h2}>Your reports</h2>
      {loadError && <p style={S.error}>{loadError}</p>}
      {reports === null && !loadError && <p style={S.muted}>Loading</p>}
      {reports?.length === 0 && <p style={S.muted}>You have not started a report yet.</p>}
      {reports?.map(r => (
        <Link key={r.id} href={`/dashboard/forced-labour/${r.id}`} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>{r.company_name}</span>
          <span style={S.muted}>Reporting year {r.reporting_year}</span>
        </Link>
      ))}

      {writable && <>
      <h2 style={S.h2}>Start a report</h2>
      <div style={S.card}>
        <label htmlFor="company" style={S.label}>Company name</label>
        <p style={S.hint}>You will give the full legal name in section 1.</p>
        <input id="company" style={{ ...S.input, marginBottom: 14 }} value={company} maxLength={300} onChange={e => setCompany(e.target.value)} />
        <label htmlFor="year" style={S.label}>Reporting year</label>
        <p style={S.hint}>The year the report is due, by May 31. A report due in 2026 covers the financial year before it.</p>
        <input id="year" style={{ ...S.input, maxWidth: 140, marginBottom: 14 }} type="number" min={2024} value={year} onChange={e => setYear(e.target.value)} />
        {createError && <p style={S.error}>{createError}</p>}
        <div><button type="button" style={S.button} disabled={creating} onClick={create}>{creating ? 'Starting' : 'Start the report'}</button></div>
      </div>
      </>}
    </>
  )
}

function ListOrPreview() {
  return useBuilderState() === 'preview' ? <Preview /> : <ReportsList />
}

export default function ForcedLabourReportsPage() {
  return <BuilderFrame><ListOrPreview /></BuilderFrame>
}
