'use client'

// app/dashboard/s211/page.tsx
// S-211 report builder: the user's reports, and a form to start one. Gated by public.s211_access;
// see app/dashboard/s211/_components/ui.tsx and lib/s211/access.ts.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../lib/s211/client'
import { defaultReportingYear } from '../../../lib/s211/defaults'
import { BuilderFrame, S } from './_components/ui'

type ReportRow = { id: string; company_name: string; reporting_year: number; status: string; updated_at: string }

function ReportsList() {
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
    if (r.data) window.location.href = `/dashboard/s211/${r.data.report.id}`
    else setCreateError(r.error)
  }

  return (
    <>
      <h1 style={S.h1}>Forced labour and child labour reports</h1>
      <p style={S.muted}>
        Prepare the annual report required by the Fighting Against Forced Labour and Child Labour in Supply Chains Act, one section at a time.
        This builder is a preview and is only available to your account.
      </p>

      <h2 style={S.h2}>Your reports</h2>
      {loadError && <p style={S.error}>{loadError}</p>}
      {reports === null && !loadError && <p style={S.muted}>Loading</p>}
      {reports?.length === 0 && <p style={S.muted}>You have not started a report yet.</p>}
      {reports?.map(r => (
        <Link key={r.id} href={`/dashboard/s211/${r.id}`} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>{r.company_name}</span>
          <span style={S.muted}>Reporting year {r.reporting_year}</span>
        </Link>
      ))}

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
    </>
  )
}

export default function S211ReportsPage() {
  return <BuilderFrame><ReportsList /></BuilderFrame>
}
