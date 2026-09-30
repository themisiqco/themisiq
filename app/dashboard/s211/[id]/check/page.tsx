'use client'

// app/dashboard/s211/[id]/check/page.tsx
// The check page before export: what is not complete, where a "nothing to report" sentence stands in,
// and the personal-information rule. Export itself is not built yet; the page says so.

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../../../lib/s211/client'
import { SECTIONS } from '../../../../../lib/s211/builderContent'
import { missingRequired, hasNothingToReport } from '../../../../../lib/s211/sectionStatus'
import { BuilderFrame, S, StatusPill, NotFound404, PersonalInformation } from '../../_components/ui'
import type { ReportRecord, SectionRow } from '../../_components/types'

function Check({ id }: { id: string }) {
  const [data, setData] = useState<{ report: ReportRecord; sections: SectionRow[] } | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  useEffect(() => {
    void s211Api<{ report: ReportRecord; sections: SectionRow[] }>(`/reports/${id}`).then(r => {
      if (r.status === 404) setState('missing')
      else if (!r.data) setState('error')
      else { setData(r.data); setState('ok') }
    })
  }, [id])
  if (state === 'missing') return <NotFound404 />
  if (state === 'error') return <p style={S.error}>The report could not be loaded. Check your connection and reload the page.</p>
  if (!data) return <p style={S.muted}>Loading</p>

  const byKey = Object.fromEntries(data.sections.map(s => [s.section_key, s]))
  const rows = SECTIONS.map(d => {
    const row = byKey[d.key]
    return { d, status: row?.status ?? 'not_started', missing: missingRequired(d.key, row?.content ?? {}), nothing: hasNothingToReport(row?.content ?? {}) }
  })
  const incomplete = rows.filter(r => r.status !== 'complete')
  const nothing = rows.filter(r => r.nothing)

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href={`/dashboard/s211/${id}`}>{data.report.company_name}, reporting year {data.report.reporting_year}</Link></p>
      <h1 style={S.h1}>Check the report</h1>
      <p style={S.muted}>A last look before the report is exported for approval and signing.</p>

      <h2 style={S.h2}>Sections not yet complete</h2>
      {incomplete.length === 0 ? <p style={S.body}>All 11 sections are complete.</p> : incomplete.map(r => (
        <div key={r.d.key} style={{ ...S.card, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Link href={`/dashboard/s211/${id}/${r.d.key}`} style={{ fontSize: 14, color: 'var(--color-ink)' }}>{r.d.number}. {r.d.title}</Link>
            <StatusPill status={r.status} />
          </div>
          {r.missing.length > 0 && <p style={{ ...S.hint, margin: '6px 0 0' }}>Still to fill in: {r.missing.join('; ')}.</p>}
        </div>
      ))}

      <h2 style={S.h2}>Sections that say there is nothing to report</h2>
      {nothing.length === 0 ? <p style={S.body}>None.</p> : (
        <>
          <p style={S.muted}>These sections use a plain sentence in place of an answer. Check that each one is true for this financial year.</p>
          <ul style={{ ...S.body, paddingLeft: 18 }}>{nothing.map(r => <li key={r.d.key}><Link href={`/dashboard/s211/${id}/${r.d.key}`}>{r.d.number}. {r.d.title}</Link></li>)}</ul>
        </>
      )}

      <h2 style={S.h2}>Personal information</h2>
      <PersonalInformation />

      <h2 style={S.h2}>Export</h2>
      <p style={S.body}>Export to PDF is not built yet. When it is, it will be blocked only by an incomplete required section or a missing attestation field.</p>
    </>
  )
}

export default function S211CheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BuilderFrame><Check id={id} /></BuilderFrame>
}
