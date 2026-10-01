'use client'

// app/dashboard/forced-labour/[id]/page.tsx
// A report's overview (Stage D1, 1 Oct 2026): each country on the report with whether its law applies and
// how far its sections have got, "Add a country", the organization's revenue figure, and every shared answer
// with the countries that use it. Each country's own work is under its tab (../_components/CountryTabs.tsx).
// Until Stage D1 this route was Canada's home, which is now /dashboard/forced-labour/[id]/canada, unchanged.
//
// A country in preview appears only for an account on the preview list: the overview, the country list and
// every country route come from /api/forced-labour, which leaves it out for anyone else.

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { s211Api } from '../../../../lib/s211/client'
import { flApi } from '../../../../lib/forcedLabour/client'
import { SECTIONS } from '../../../../lib/s211/builderContent'
import { completeCount, type SectionStatus } from '../../../../lib/s211/sectionStatus'
import { evaluateApplicability } from '../../../../lib/s211/applicability'
import { S211_OUTCOME_LABEL } from '../../../../lib/s211/obligation'
import { evaluateUkApplicability, UK_OUTCOME_LABEL } from '../../../../lib/forcedLabour/uk/applicability'
import { UK_SECTIONS } from '../../../../lib/forcedLabour/uk/builderContent'
import { COUNTRY_BUILDERS } from '../../../../lib/forcedLabour/countryBuilders'
import { COUNTRIES } from '../../../../lib/forcedLabour/countries'
import { FX_CURRENCIES, FX_AS_OF } from '../../../../lib/fx'
import { longDate } from '../../../../lib/s211/reportModel'
import { parseAmountInput, formatAmount } from '../../../../lib/s211/applicability'
import { BuilderFrame, ReadOnlyBanner, S, NotFound404, useBuilderState } from '../_components/ui'
import { canWrite, READ_ONLY_EXPORT_NOTE, BUILDER_ROOT } from '../../../../lib/s211/builderAccess'
import { CountryTabs, useOverview, countryName } from '../_components/CountryTabs'
import { formOf, actsOf } from '../_components/canadaForm'
import type { ReportRecord, SectionRow } from '../_components/types'

type Visible = { key: string; name: string; law: string }

/** A shared answer as one short line. */
function shortValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'Left blank'
  if (typeof v === 'string') return v.length > 90 ? `${v.slice(0, 90)}…` : v
  if (typeof v === 'number') return v.toLocaleString('en-CA')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return `${v.length} ${v.length === 1 ? 'entry' : 'entries'}`
  return 'Answered'
}

function Overview({ id }: { id: string }) {
  const writable = canWrite(useBuilderState())
  const { overview, status, reload } = useOverview(id)
  const [canada, setCanada] = useState<{ report: ReportRecord; sections: SectionRow[] } | null>(null)
  const [visible, setVisible] = useState<Visible[]>([])
  const [adding, setAdding] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  // The saved figure, until the user edits it here.
  const [edited, setFigure] = useState<{ amount: string; currency: string } | null>(null)
  const [figureMsg, setFigureMsg] = useState<string | null>(null)

  useEffect(() => { void flApi<{ countries: Visible[] }>('/countries').then(r => { if (r.data) setVisible(r.data.countries) }) }, [])
  useEffect(() => {
    if (!overview?.report.canadaReportId) return
    void s211Api<{ report: ReportRecord; sections: SectionRow[] }>(`/reports/${overview.report.canadaReportId}`).then(r => { if (r.data) setCanada(r.data) })
  }, [overview?.report.canadaReportId])
  const savedFigure = useMemo(() => {
    const amount = overview?.shared.find(s => s.field_key === 'organization.revenue_amount')?.value
    const currency = overview?.shared.find(s => s.field_key === 'organization.revenue_currency')?.value
    return { amount: amount === undefined || amount === null ? '' : String(amount), currency: typeof currency === 'string' ? currency : 'CAD' }
  }, [overview])
  const figure = edited ?? savedFigure

  const canadaResult = useMemo(() => (canada ? evaluateApplicability(formOf(canada.report, actsOf(canada.sections))) : null), [canada])

  if (status === 404) return <NotFound404 />
  if (status !== null && !overview) return <p style={S.error}>This report could not be loaded. Check your connection and reload the page.</p>
  if (!overview) return <p style={S.muted}>Loading</p>

  const onReport = new Set(overview.countries.map(c => c.country))
  const addable = visible.filter(v => !onReport.has(v.key) && v.key !== 'canada' && COUNTRY_BUILDERS[v.key as keyof typeof COUNTRY_BUILDERS])
  const add = async () => {
    if (!adding) return
    setMsg('Adding')
    const r = await flApi<{ country: string }>(`/reports/${id}/countries`, { method: 'POST', body: { country: adding } })
    if (!r.data) { setMsg(r.error ?? 'Not added: check your connection'); return }
    window.location.href = `${BUILDER_ROOT}/${id}/${adding}`
  }
  const saveFigure = async () => {
    setFigureMsg('Saving')
    const r = await flApi(`/reports/${id}/shared`, { method: 'PUT', body: { revenue_amount: figure.amount, revenue_currency: figure.currency } })
    setFigureMsg(r.data ? 'Saved' : (r.error ?? 'Not saved: check your connection'))
    if (r.data) { setFigure(null); reload() }
  }
  const currencies = ['CAD', ...FX_CURRENCIES.filter(c => c !== 'CAD').sort()]
  // Shared means used by at least two countries on this report; until then an answer is just that country's.
  const shared = overview.shared.filter(s => !s.field_key.startsWith('organization.') && s.usedBy.length > 1)

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href="/dashboard/forced-labour">Your reports</Link></p>
      <h1 style={S.h1}>{overview.report.organizationName ?? 'Report'}</h1>
      <CountryTabs id={id} current="overview" overview={overview} />
      {!writable && <ReadOnlyBanner extra={READ_ONLY_EXPORT_NOTE} />}

      <h2 style={S.h2}>Countries on this report</h2>
      {overview.countries.map(c => {
        const law = COUNTRIES.find(x => x.key === c.country)?.law
        let verdict: string | null = null
        let progress: string | null = null
        if (c.country === 'canada') {
          verdict = canadaResult ? S211_OUTCOME_LABEL[canadaResult.obligation.outcome] : null
          if (canada) progress = `${completeCount(Object.fromEntries(canada.sections.map(s => [s.section_key, s.status])) as Partial<Record<string, SectionStatus>>)} of ${SECTIONS.length} sections complete`
        } else if (c.country === 'uk') {
          const r = evaluateUkApplicability(c.applicability as Record<string, string>)
          verdict = `${UK_OUTCOME_LABEL[r.outcome]}${r.restsOnEstimate ? ' (on an estimated turnover)' : ''}`
          progress = `${Object.values(c.sectionStatus).filter(s => s === 'complete').length} of ${UK_SECTIONS.length} sections complete`
        }
        return (
          <Link key={c.country} href={`${BUILDER_ROOT}/${id}/${c.country}`} style={{ ...S.card, display: 'block', textDecoration: 'none', color: 'var(--color-ink)' }}>
            <p style={{ ...S.body, margin: 0, fontWeight: 600 }}>{countryName(c.country)}</p>
            {law && <p style={{ ...S.muted, margin: '0 0 6px' }}>{law}</p>}
            <p style={{ ...S.body, margin: 0 }}>Whether it applies: {verdict ?? 'Loading'}</p>
            {progress && <p style={{ ...S.muted, margin: 0 }}>{progress}</p>}
          </Link>
        )
      })}

      {writable && addable.length > 0 && (
        <div style={{ ...S.card }}>
          <label htmlFor="fl-add" style={S.label}>Add a country</label>
          <p style={S.hint}>Answers this report already holds that the country also asks for appear in its sections straight away, marked as shared.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select id="fl-add" style={{ ...S.input, maxWidth: 360 }} value={adding} onChange={e => setAdding(e.target.value)}>
              <option value="">Choose a country</option>
              {addable.map(v => <option key={v.key} value={v.key}>{v.name}: {v.law}</option>)}
            </select>
            <button type="button" style={S.button} disabled={!adding} onClick={add}>Add</button>
            {msg && <span style={S.muted}>{msg}</span>}
          </div>
        </div>
      )}

      {overview.countries.some(c => c.country !== 'canada') && (
        <div style={{ ...S.card }}>
          <p style={S.label}>Organization revenue, most recent financial year</p>
          <p style={S.hint}>
            One figure for the report as a whole, in the currency of your financial statements. It is not any law&rsquo;s measure: each country&rsquo;s check asks for its own figure, and this only starts an estimate, converted at the ECB reference rates of {longDate(FX_AS_OF)}.
          </p>
          <fieldset disabled={!writable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label htmlFor="fl-rev" style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Revenue
              <input id="fl-rev" type="text" inputMode="decimal" autoComplete="off" style={{ ...S.input, marginTop: 3, maxWidth: 220 }}
                value={formatAmount(figure.amount)} onChange={e => setFigure({ ...figure, amount: parseAmountInput(e.target.value) })} />
            </label>
            <label htmlFor="fl-rev-cur" style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Currency
              <select id="fl-rev-cur" style={{ ...S.input, marginTop: 3 }} value={figure.currency} onChange={e => setFigure({ ...figure, currency: e.target.value })}>
                {currencies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {writable && <button type="button" style={S.button} onClick={saveFigure}>Save</button>}
            {figureMsg && <span style={S.muted}>{figureMsg}</span>}
          </fieldset>
        </div>
      )}

      <h2 style={S.h2}>Shared answers</h2>
      {shared.length === 0
        ? <p style={S.muted}>No answer is shared yet. An answer given in one country&rsquo;s sections that another country on this report also asks for appears here.</p>
        : (
          <div style={{ ...S.card, padding: 0 }}>
            {shared.map(s => (
              <div key={s.field_key} style={{ padding: '10px 16px', borderTop: '1px solid #f0efec' }}>
                <p style={{ ...S.body, margin: 0, fontWeight: 600 }}>{s.label}</p>
                <p style={{ ...S.muted, margin: 0 }}>{shortValue(s.value)}</p>
                <p style={{ ...S.hint, margin: '2px 0 0' }}>Used by: {s.usedBy.map(countryName).join(', ')}</p>
              </div>
            ))}
          </div>
        )}
    </>
  )
}

export default function ReportOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <BuilderFrame report><Overview id={id} /></BuilderFrame>
}
