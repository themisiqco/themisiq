'use client'

// app/dashboard/s211/[id]/page.tsx
// One S-211 report's home: whether the Act applies (lib/s211/entity.ts, lib/s211/obligation.ts), with
// the reasons, then the eleven sections with their status. Gated; see ../_components/ui.tsx.

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../../lib/s211/client'
import { SECTIONS, type SectionKey } from '../../../../lib/s211/builderContent'
import { completeCount, type SectionStatus } from '../../../../lib/s211/sectionStatus'
import { evaluateS211Entity, type S211EntityInput, type S211YearFigures } from '../../../../lib/s211/entity'
import { evaluateS211Obligation, S211_OUTCOME_LABEL, type S211Activities, type S211Answer } from '../../../../lib/s211/obligation'
import { BuilderFrame, S, StatusPill } from '../_components/ui'
import type { ReportRecord, SectionRow } from '../_components/types'


const ACTIVITY_QUESTIONS: [keyof S211Activities, string][] = [
  ['producesGoods', 'Does it produce goods, in Canada or elsewhere?'],
  ['sellsGoods', 'Does it sell goods, in Canada or elsewhere?'],
  ['distributesGoods', 'Does it distribute goods, in Canada or elsewhere?'],
  ['importsGoods', 'Does it import into Canada goods produced outside Canada?'],
  ['controlsEntityWithGoodsActivity', 'Does it control an entity that does any of these?'],
]
// Only s.9(a) is ever quoted on this page (lib/s211/obligation.ts, S211_ACT_9A_QUOTED).
const ACT_9A_LABEL = 'The Act, s.9(a)'
const ENTITY_LABEL = { entity: 'An entity under the Act', 'not-entity': 'Not an entity under the Act', undetermined: 'Not yet determined' } as const

const tri = (v: boolean | null) => (v === true ? 'yes' : v === false ? 'no' : '')
const fromTri = (s: string) => (s === 'yes' ? true : s === 'no' ? false : null)
const year = (r: ReportRecord, p: 'recent' | 'prior'): S211YearFigures | null => {
  const a = r[`${p}_fy_assets`], v = r[`${p}_fy_revenue`], e = r[`${p}_fy_avg_employees`]
  return a === null && v === null && e === null ? null : { assets: a, revenue: v, averageEmployees: e, currency: r[`${p}_fy_currency`] ?? 'CAD' }
}

function Home({ id }: { id: string }) {
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
      const rep = r.data.report
      const acts = (r.data.sections.find(s => s.section_key === 'report_details')?.content?._applicability ?? {}) as Record<string, string>
      setForm({
        listed_in_canada: tri(rep.listed_in_canada), place_of_business_in_canada: tri(rep.place_of_business_in_canada),
        does_business_in_canada: tri(rep.does_business_in_canada), has_assets_in_canada: tri(rep.has_assets_in_canada),
        ...Object.fromEntries((['recent', 'prior'] as const).flatMap(p => [
          [`${p}_fy_assets`, rep[`${p}_fy_assets`]?.toString() ?? ''], [`${p}_fy_revenue`, rep[`${p}_fy_revenue`]?.toString() ?? ''],
          [`${p}_fy_avg_employees`, rep[`${p}_fy_avg_employees`]?.toString() ?? ''], [`${p}_fy_currency`, rep[`${p}_fy_currency`] ?? 'CAD'],
        ])),
        ...Object.fromEntries(ACTIVITY_QUESTIONS.map(([k]) => [k, acts[k] ?? ''])),
      })
    })
  }, [id])

  const statuses = useMemo(() => Object.fromEntries(sections.map(s => [s.section_key, s.status])) as Partial<Record<SectionKey, SectionStatus>>, [sections])

  const result = useMemo(() => {
    if (!report) return null
    const input: S211EntityInput = {
      listedInCanada: report.listed_in_canada, placeOfBusinessInCanada: report.place_of_business_in_canada,
      doesBusinessInCanada: report.does_business_in_canada, hasAssetsInCanada: report.has_assets_in_canada,
      mostRecentYear: year(report, 'recent'), priorYear: year(report, 'prior'),
    }
    const entity = evaluateS211Entity(input)
    const acts = (sections.find(s => s.section_key === 'report_details')?.content?._applicability ?? {}) as Record<string, string>
    const answers = Object.fromEntries(ACTIVITY_QUESTIONS.map(([k]) => [k, (acts[k] || 'not-sure') as S211Answer])) as S211Activities
    const unanswered = ACTIVITY_QUESTIONS.filter(([k]) => !acts[k]).length
    return { entity, obligation: evaluateS211Obligation(entity, answers), unanswered }
  }, [report, sections])

  const saveApplicability = async () => {
    if (!report) return
    setSaveMsg('Saving')
    const num = (k: string) => (form[k] === '' ? null : Number(form[k]))
    const patch = {
      listed_in_canada: fromTri(form.listed_in_canada), place_of_business_in_canada: fromTri(form.place_of_business_in_canada),
      does_business_in_canada: fromTri(form.does_business_in_canada), has_assets_in_canada: fromTri(form.has_assets_in_canada),
      ...Object.fromEntries((['recent', 'prior'] as const).flatMap(p => [
        [`${p}_fy_assets`, num(`${p}_fy_assets`)], [`${p}_fy_revenue`, num(`${p}_fy_revenue`)],
        [`${p}_fy_avg_employees`, num(`${p}_fy_avg_employees`)], [`${p}_fy_currency`, form[`${p}_fy_currency`] || null],
      ])),
    }
    const r1 = await s211Api<{ report: ReportRecord }>(`/reports/${id}`, { method: 'PATCH', body: patch })
    if (!r1.data) { setSaveMsg(r1.error ?? 'Not saved: check your connection'); return }
    const details = sections.find(s => s.section_key === 'report_details')?.content ?? {}
    const _applicability = Object.fromEntries(ACTIVITY_QUESTIONS.map(([k]) => [k, form[k] ?? '']))
    const r2 = await s211Api<{ section: SectionRow }>(`/reports/${id}/sections/report_details`, { method: 'PUT', body: { content: { ...details, _applicability } } })
    if (!r2.data) { setSaveMsg(r2.error ?? 'Not saved: check your connection'); return }
    setReport(r1.data.report)
    setSections(prev => [...prev.filter(s => s.section_key !== 'report_details'), r2.data!.section])
    const at = new Date()
    setSaveMsg(`Saved at ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`)
  }

  if (missing) return <p style={S.muted}>This report was not found. <Link href="/dashboard/s211">Back to your reports</Link></p>
  if (error) return <p style={S.error}>{error}</p>
  if (!report || !result) return <p style={S.muted}>Loading</p>

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const triSelect = (k: string, label: string) => (
    <label key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 160px', gap: 10, alignItems: 'center', fontSize: 13.5, marginBottom: 8 }}>
      {label}
      <select style={S.input} value={form[k] ?? ''} onChange={e => set(k, e.target.value)}>
        <option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    </label>
  )
  const done = completeCount(statuses)

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href="/dashboard/s211">Your reports</Link></p>
      <h1 style={S.h1}>{report.company_name}</h1>
      <p style={S.muted}>Reporting year {report.reporting_year}. {done} of 11 sections complete.</p>

      <h2 style={S.h2}>Does the Act apply?</h2>
      <div style={S.card}>
        <p style={{ ...S.body, margin: '0 0 4px' }}><strong>Entity test:</strong> {ENTITY_LABEL[result.entity.outcome]}</p>
        <ul style={{ ...S.muted, margin: '0 0 10px', paddingLeft: 18 }}>{result.entity.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        <p style={{ ...S.body, margin: '0 0 4px' }}><strong>Reporting obligation:</strong> {S211_OUTCOME_LABEL[result.obligation.outcome]}</p>
        <ul style={{ ...S.muted, margin: 0, paddingLeft: 18 }}>{result.obligation.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {/* The Act's words and the current guidance first; notes about earlier versions of the guidance after. */}
        {result.obligation.actQuoted && <p style={{ ...S.muted, margin: '8px 0 0' }}>{ACT_9A_LABEL}: &ldquo;{result.obligation.actQuoted}&rdquo;</p>}
        {result.obligation.guidanceQuoted.map((q, i) => <p key={i} style={{ ...S.muted, margin: '8px 0 0' }}>Public Safety Canada guidance: &ldquo;{q}&rdquo;</p>)}
        {result.obligation.notes.map((n, i) => <p key={i} style={{ ...S.muted, margin: '8px 0 0' }}>{n}</p>)}
        {result.unanswered > 0 && <p style={{ ...S.hint, marginTop: 10 }}>{result.unanswered} of the questions about goods are not answered yet. Until they are, they are treated as &ldquo;not sure&rdquo;.</p>}
        <p style={{ ...S.hint, marginTop: 10 }}>This is a screening result from your answers below. It is not legal advice. The guidance encourages entities that are unsure to seek advice from their legal counsel.</p>
      </div>

      <details style={{ ...S.card, padding: '10px 16px' }}>
        <summary style={{ fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Answer or change the applicability questions</summary>
        <div style={{ marginTop: 12 }}>
          <p style={S.label}>Listing and presence in Canada</p>
          {triSelect('listed_in_canada', 'Listed on a stock exchange in Canada')}
          {triSelect('place_of_business_in_canada', 'Has a place of business in Canada')}
          {triSelect('does_business_in_canada', 'Does business in Canada')}
          {triSelect('has_assets_in_canada', 'Has assets in Canada')}
          {(['recent', 'prior'] as const).map(p => (
            <div key={p} style={{ marginTop: 12 }}>
              <p style={S.label}>{p === 'recent' ? 'Most recent financial year' : 'The financial year before it'}</p>
              <p style={S.hint}>From consolidated financial statements. Leave blank if you do not have the figure.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
                {[['assets', 'Assets'], ['revenue', 'Revenue'], ['avg_employees', 'Average employees']].map(([k, l]) => (
                  <label key={k} style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{l}
                    <input style={{ ...S.input, marginTop: 3 }} type="number" min={0} value={form[`${p}_fy_${k}`] ?? ''} onChange={e => set(`${p}_fy_${k}`, e.target.value)} />
                  </label>
                ))}
                <label style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Currency
                  <input style={{ ...S.input, marginTop: 3 }} maxLength={3} value={form[`${p}_fy_currency`] ?? ''} onChange={e => set(`${p}_fy_currency`, e.target.value.toUpperCase())} />
                </label>
              </div>
            </div>
          ))}
          <p style={{ ...S.label, marginTop: 14 }}>What the entity does with goods</p>
          {ACTIVITY_QUESTIONS.map(([k, q]) => (
            <label key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 160px', gap: 10, alignItems: 'center', fontSize: 13.5, marginBottom: 8 }}>
              {q}
              <select style={S.input} value={form[k] ?? ''} onChange={e => set(k, e.target.value)}>
                <option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option><option value="not-sure">Not sure</option>
              </select>
            </label>
          ))}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
            <button type="button" style={S.button} onClick={saveApplicability}>Save these answers</button>
            {saveMsg && <span style={S.muted}>{saveMsg}</span>}
          </div>
        </div>
      </details>

      <h2 style={S.h2}>Sections</h2>
      {SECTIONS.map(d => (
        <Link key={d.key} href={`/dashboard/s211/${id}/${d.key}`} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none', padding: '12px 16px' }}>
          <span style={{ fontSize: 14, color: 'var(--color-ink)' }}>{d.number}. {d.title}{d.optional ? ' (optional)' : ''}</span>
          <StatusPill status={statuses[d.key] ?? 'not_started'} />
        </Link>
      ))}
      <p style={{ marginTop: 18 }}><Link href={`/dashboard/s211/${id}/check`} style={{ ...S.buttonQuiet, textDecoration: 'none', display: 'inline-block' }}>Check the report before export</Link></p>
    </>
  )
}

export default function S211ReportHome({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BuilderFrame><Home id={id} /></BuilderFrame>
}
