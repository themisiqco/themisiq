'use client'

// app/dashboard/forced-labour/page.tsx
// Forced Labour Reporting: the user's reports and a form to start one (full access); their reports with
// no form (expired: read-only); or the module explained with an order link and a read-through of the
// sections (never bought: preview). States: lib/s211/builderAccess.ts.
//
// Since Stage D1b (1 Oct 2026) a report can start from any country this account may use (Canada, or the UK for an
// account on the preview list), and the list shows every report whatever country it started from, linked by the
// report's own id. The countries offered come from /api/forced-labour/countries, which leaves out any country this
// account may not use: no "not yet available" line, no disabled option.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../lib/s211/client'
import { defaultReportingYear } from '../../../lib/s211/defaults'
import { SECTIONS } from '../../../lib/s211/builderContent'
import { CANADA_CHECK, COUNTRIES, type CountryKey } from '../../../lib/forcedLabour/countries'
import { flApi, type ReportListRow } from '../../../lib/forcedLabour/client'
import { BUILDER_ROOT, PREVIEW_ID, ORDER_HREF, ORDER_LABEL, READ_ONLY_EXPORT_NOTE, canWrite } from '../../../lib/s211/builderAccess'
import { BuilderFrame, ReadOnlyBanner, S, useBuilderState } from './_components/ui'
import { DRAFT_KEYS, readDraft, clearDraft } from '../../../lib/drafts'
import { parseApplicabilityDraft, formToReportPatch, formToActivities } from '../../../lib/s211/applicability'

type ReportRow = { id: string; company_name: string; reporting_year: number; status: string; updated_at: string }
const countryName = (k: string) => COUNTRIES.find(c => c.key === k)?.name ?? k

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
        <a href={CANADA_CHECK} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Check if Canada&rsquo;s Act applies (free)</a>
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
  const [reports, setReports] = useState<ReportListRow[] | null>(null)
  // Canada until the account's countries arrive: every account may start a Canada report.
  const [countries, setCountries] = useState<{ key: CountryKey; name: string; law: string }[]>(() => COUNTRIES.filter(c => c.key === 'canada'))
  const [country, setCountry] = useState<CountryKey>('canada')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [company, setCompany] = useState('')
  const [year, setYear] = useState(() => String(defaultReportingYear(new Date())))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    void flApi<{ reports: ReportListRow[] }>('/reports').then(r => {
      if (r.data) setReports(r.data.reports)
      else setLoadError(r.error ?? 'The reports could not be loaded.')
    })
    void flApi<{ countries: { key: CountryKey; name: string; law: string }[] }>('/countries').then(r => { if (r.data?.countries.length) setCountries(r.data.countries) })
  }, [])

  // Answers from the free check (/forced-labour/canada/check), if this browser holds them: written into the
  // report once it exists, then cleared, so the first report starts pre-filled. Read once, on mount.
  const [checkDraft] = useState(() => readDraft(DRAFT_KEYS.forcedLabourCheck, parseApplicabilityDraft))

  const create = async () => {
    setCreating(true); setCreateError(null)
    if (country !== 'canada') {
      // Any other country: the report and its first country row together (public.fl_create_report).
      const r = await flApi<{ report: { id: string } }>('/reports', { method: 'POST', body: { organization_name: company, country } })
      if (!r.data) { setCreating(false); setCreateError(r.error); return }
      window.location.href = `${BUILDER_ROOT}/${r.data.report.id}`
      return
    }
    const r = await s211Api<{ report: ReportRow }>('/reports', { method: 'POST', body: { company_name: company, reporting_year: Number(year) } })
    if (!r.data) { setCreating(false); setCreateError(r.error); return }
    const id = r.data.report.id
    if (checkDraft) {
      // The report exists whatever happens next; a failure here only means the answers are entered by hand.
      const p = await s211Api(`/reports/${id}`, { method: 'PATCH', body: formToReportPatch(checkDraft) })
      const a = await s211Api(`/reports/${id}/sections/report_details`, { method: 'PUT', body: { content: { _applicability: formToActivities(checkDraft) } } })
      if (p.data && a.data) clearDraft(DRAFT_KEYS.forcedLabourCheck)
    }
    window.location.href = `${BUILDER_ROOT}/${id}`
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
          <span>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>{r.name}</span>
            <span style={S.muted}>{r.countries.map(countryName).join(', ')}</span>
          </span>
          {r.canadaReportingYear !== null && <span style={S.muted}>Reporting year {r.canadaReportingYear}</span>}
        </Link>
      ))}

      {writable && <>
      <h2 style={S.h2}>Start a report</h2>
      <div style={S.card}>
        {/* Only the countries this account may use (/api/forced-labour/countries). Other countries are added to
            a report from its overview. */}
        <label htmlFor="country" style={S.label}>Country</label>
        <select id="country" style={{ ...S.input, maxWidth: 360, marginBottom: 14 }} value={country} onChange={e => setCountry(e.target.value as CountryKey)}>
          {countries.map(c => <option key={c.key} value={c.key}>{c.name}: {c.law}</option>)}
        </select>
        <label htmlFor="company" style={S.label}>Company name</label>
        <p style={S.hint}>{country === 'canada' ? 'You will give the full legal name in section 1.' : 'You will choose the organisation giving the statement in Statement details.'}</p>
        <input id="company" style={{ ...S.input, marginBottom: 14 }} value={company} maxLength={300} onChange={e => setCompany(e.target.value)} />
        {country === 'canada' && <>
          <label htmlFor="year" style={S.label}>Reporting year</label>
          <p style={S.hint}>The year the report is due, by May 31. A report due in 2026 covers the financial year before it.</p>
          <input id="year" style={{ ...S.input, maxWidth: 140, marginBottom: 14 }} type="number" min={2024} value={year} onChange={e => setYear(e.target.value)} />
          {checkDraft && <p style={S.hint}>Your answers from the free applicability check will be added to this report.</p>}
        </>}
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
