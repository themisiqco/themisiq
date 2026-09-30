'use client'

// app/dashboard/s211/[id]/check/page.tsx
// The check page before export: what is not complete, where a "nothing to report" sentence stands in,
// and the personal-information rule. What is listed, and what would block export, comes from
// lib/s211/checkReport.ts. Export itself is not built yet; the page says so.

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../../../lib/s211/client'
import { checkReport, NOTHING_MISSING_LINE, type CheckRow, type SectionState } from '../../../../../lib/s211/checkReport'
import { asList, labelsEndingSentence } from '../../../../../lib/s211/sectionStatus'
import type { SectionKey } from '../../../../../lib/s211/builderContent'
import { BuilderFrame, S, StatusPill, NotFound404, PersonalInformation } from '../../_components/ui'
import type { ReportRecord, SectionRow } from '../../_components/types'

function SectionLink({ id, r }: { id: string; r: CheckRow }) {
  return <Link href={`/dashboard/s211/${id}/${r.key}`} style={{ fontSize: 14, color: 'var(--color-ink)' }}>{r.number}. {r.title}</Link>
}

function StillToFill({ r }: { r: CheckRow }) {
  if (r.missing.length === 0 && r.invalid.length === 0) return <p style={{ ...S.hint, margin: '6px 0 0' }}>{NOTHING_MISSING_LINE}</p>
  return (
    <>
      {r.missing.length > 0 && (asList(r.missing)
        ? <div style={{ ...S.hint, margin: '6px 0 0' }}>Still to fill in:<ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.missing.map(m => <li key={m}>{m}</li>)}</ul></div>
        : <p style={{ ...S.hint, margin: '6px 0 0' }}>Still to fill in: {labelsEndingSentence(r.missing)}</p>)}
      {r.invalid.map(m => <p key={m} style={{ ...S.hint, margin: '6px 0 0' }}>{m}</p>)}
    </>
  )
}

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

  const sections = Object.fromEntries(data.sections.map(s => [s.section_key, { status: s.status, content: s.content ?? {} }])) as Partial<Record<SectionKey, SectionState>>
  const c = checkReport(sections)
  const card = { ...S.card, padding: '12px 16px' }

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href={`/dashboard/s211/${id}`}>Back to report overview</Link></p>
      <h1 style={S.h1}>Check the report</h1>
      <p style={S.muted}>{data.report.company_name}, reporting year {data.report.reporting_year}. A last look before the report is exported for approval and signing.</p>

      {c.warnings.map(w => <p key={w} style={S.warn}>{w}</p>)}

      <h2 style={S.h2}>Sections not yet complete</h2>
      {c.incomplete.length === 0 && c.optionalUsedIncomplete.length === 0
        ? <p style={S.body}>All required sections are complete.</p>
        : [...c.incomplete, ...c.optionalUsedIncomplete].map(r => (
          <div key={r.key} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <SectionLink id={id} r={r} />
              <StatusPill status={r.status} />
            </div>
            <StillToFill r={r} />
          </div>
        ))}

      {c.optionalNotUsed.length > 0 && (
        <>
          <h2 style={S.h2}>Optional sections not used</h2>
          <p style={S.muted}>The Act does not ask for these, so leaving them out does not hold up export.</p>
          <ul style={{ ...S.body, paddingLeft: 18 }}>{c.optionalNotUsed.map(r => <li key={r.key}><SectionLink id={id} r={r} /></li>)}</ul>
        </>
      )}

      <h2 style={S.h2}>Sections that say there is nothing to report</h2>
      {c.nothingToReport.length === 0 ? <p style={S.body}>None.</p> : (
        <>
          <p style={S.muted}>These sections use a plain sentence in place of an answer. Check that each one is true for this financial year.</p>
          <ul style={{ ...S.body, paddingLeft: 18 }}>{c.nothingToReport.map(r => <li key={r.key}><SectionLink id={id} r={r} /></li>)}</ul>
        </>
      )}

      <h2 style={S.h2}>Personal information</h2>
      <PersonalInformation />

      <h2 style={S.h2}>Export</h2>
      <p style={S.body}>Export to PDF is not built yet. When it is, it will be blocked only by a required section that is not complete. Optional section 10 never blocks it.</p>
    </>
  )
}

export default function S211CheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BuilderFrame><Check id={id} /></BuilderFrame>
}
