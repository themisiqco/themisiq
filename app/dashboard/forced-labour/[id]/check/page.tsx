'use client'

// app/dashboard/forced-labour/[id]/check/page.tsx
// The check page before export: what is not complete, where a "nothing to report" sentence stands in,
// the personal-information rule and scan, and the export. What is listed comes from
// lib/s211/checkReport.ts; what blocks export and what looks like personal information, from
// lib/s211/exportCheck.ts. The download itself is built and gated on the server
// (app/api/s211/reports/[id]/export/route.ts), which applies the same gate again.

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { s211Api, s211Download, type DownloadResult } from '../../../../../lib/s211/client'
import { exportGate, scanPersonalInformation, scanUndrawable, describeChars, PERSONAL_INFO_KIND_LABEL, PERSONAL_INFO_NAMES_NOTE } from '../../../../../lib/s211/exportCheck'
import { checkReport, NOTHING_MISSING_LINE, type CheckRow, type SectionState } from '../../../../../lib/s211/checkReport'
import { asList, labelsEndingSentence } from '../../../../../lib/s211/sectionStatus'
import type { SectionContent, SectionKey } from '../../../../../lib/s211/builderContent'
import { BuilderFrame, ReadOnlyBanner, S, StatusPill, NotFound404, PersonalInformation, useBuilderState } from '../../_components/ui'
import { canWrite, ORDER_HREF, RENEW_LABEL } from '../../../../../lib/s211/builderAccess'
import type { ReportRecord, SectionRow } from '../../_components/types'

function SectionLink({ id, r }: { id: string; r: CheckRow }) {
  return <Link href={`/dashboard/forced-labour/${id}/${r.key}`} style={{ fontSize: 14, color: 'var(--color-ink)' }}>{r.number}. {r.title}</Link>
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
  const writable = canWrite(useBuilderState())
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
  const gate = exportGate(sections)
  const contents = Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v!.content])) as Partial<Record<SectionKey, SectionContent>>
  const pi = scanPersonalInformation(contents)
  const undrawable = scanUndrawable(contents)
  const card = { ...S.card, padding: '12px 16px' }

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href={`/dashboard/forced-labour/${id}`}>Back to report overview</Link></p>
      <h1 style={S.h1}>Check the report</h1>
      {!writable && <ReadOnlyBanner />}
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

      <h2 style={S.h2}>Possible personal information</h2>
      {pi.length === 0
        ? <p style={S.body}>No e-mail addresses, telephone numbers, street addresses or Social Insurance Number patterns were found.</p>
        : <>
            <p style={S.muted}>These are warnings, not blocks. Check each one and remove it unless it is not personal information.</p>
            <ul style={{ ...S.body, paddingLeft: 18 }}>
              {pi.map((h, i) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  <Link href={`/dashboard/forced-labour/${id}/${h.section}`}>{h.number}. {h.title}</Link>, {h.field}: &ldquo;{h.match}&rdquo; looks like {PERSONAL_INFO_KIND_LABEL[h.kind]}.
                </li>
              ))}
            </ul>
          </>}
      <p style={S.hint}>{PERSONAL_INFO_NAMES_NOTE}</p>

      {undrawable.length > 0 && (
        <>
          <h2 style={S.h2}>Characters the PDF cannot print</h2>
          <p style={S.warn}>The report&rsquo;s typeface covers English and Western European letters. These answers contain characters outside it, which the PDF prints without their accents, or as &ldquo;?&rdquo;. Check each one, especially names, before the report is signed.</p>
          <ul style={{ ...S.body, paddingLeft: 18 }}>
            {undrawable.map((h, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <Link href={`/dashboard/forced-labour/${id}/${h.section}`}>{h.number}. {h.title}</Link>, {h.field}: {describeChars(h.chars)}.
                <span style={S.muted}> Printed as: &ldquo;{h.printedAs}&rdquo;</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 style={S.h2}>Export</h2>
      <ExportArea id={id} gate={gate} />
    </>
  )
}

/** The download when nothing blocks it; otherwise exactly what does, each linked to its section. */
function ExportArea({ id, gate }: { id: string; gate: ReturnType<typeof exportGate> }) {
  const writable = canWrite(useBuilderState())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DownloadResult | null>(null)
  const blockers = result && !result.ok && result.blockers ? result.blockers : gate.blockers
  const download = async () => {
    setBusy(true)
    setResult(await s211Download(`/reports/${id}/export`))
    setBusy(false)
  }
  if (blockers.length > 0) return (
    <>
      <p style={S.body}>The PDF cannot be downloaded yet. {blockers.length === 1 ? 'One thing blocks it:' : `${blockers.length} things block it:`}</p>
      <ul style={{ ...S.body, paddingLeft: 18 }}>
        {blockers.map((b, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            {b.section ? <Link href={`/dashboard/forced-labour/${id}/${b.section}`}>{b.message}</Link> : b.message}
            {b.missing.length > 0 && <span style={S.muted}> Still to fill in: {labelsEndingSentence(b.missing)}</span>}
          </li>
        ))}
      </ul>
      <p style={S.hint}>Optional section 10 never blocks the export.</p>
      {!writable && <p style={S.body}>This report cannot be changed while your access has expired. <a href={ORDER_HREF}>{RENEW_LABEL}</a> to finish it.</p>}
    </>
  )
  return (
    <>
      <p style={S.body}>The report is ready. The PDF is in English, on Letter paper, with the signature lines left blank for the signer. Only the signer&rsquo;s name and title are printed as personal information.</p>
      <button type="button" style={S.button} disabled={busy} onClick={download}>{busy ? 'Preparing the PDF' : 'Download PDF'}</button>
      {result?.ok && <p style={{ ...S.muted, marginTop: 10 }}>Saved as {result.fileName}.{result.substituted > 0 ? ` ${result.substituted} character${result.substituted === 1 ? ' is' : 's are'} outside the report’s typeface and printed without accents, or as "?". Check names in the PDF.` : ''}</p>}
      {result && !result.ok && !result.blockers && <p style={S.error}>The PDF was not produced: {result.error}</p>}
    </>
  )
}

export default function S211CheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BuilderFrame report><Check id={id} /></BuilderFrame>
}
