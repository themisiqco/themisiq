'use client'

// app/dashboard/forced-labour/[id]/[country]/page.tsx
// A country's tab on a report, for every country but Canada (whose tab is ../canada, a static route that takes
// precedence). The UK since Stage D1 (1 Oct 2026): whether section 54 applies, then its sections. A country
// this account may not see answers 404 from the API, and this page then shows the same 404 as for a country
// that does not exist.

import { use, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { flApi } from '../../../../../lib/forcedLabour/client'
import { builderFor } from '../../../../../lib/forcedLabour/countryBuilders'
import { evaluateUkApplicability, turnoverEstimate, type UkApplicabilityForm } from '../../../../../lib/forcedLabour/uk/applicability'
import { sharedFieldsIn } from '../../../../../lib/forcedLabour/countryAdapter'
import { BuilderFrame, ReadOnlyBanner, S, StatusPill, NotFound404, useBuilderState } from '../../_components/ui'
import { canWrite, BUILDER_ROOT } from '../../../../../lib/s211/builderAccess'
import { CountryTabs, SharedBadge } from '../../_components/CountryTabs'
import { UkApplicabilityQuestions, UkApplicabilityResult } from '../../_components/UkApplicability'
import type { CountryRecord } from '../../_components/countryTypes'

function CountryHome({ id, country }: { id: string; country: string }) {
  const writable = canWrite(useBuilderState())
  const builder = builderFor(country)
  const [rec, setRec] = useState<CountryRecord | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [form, setForm] = useState<UkApplicabilityForm>({})
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  useEffect(() => {
    void flApi<CountryRecord>(`/reports/${id}/countries/${country}`).then(r => {
      setStatus(r.status)
      if (!r.data) return
      setRec(r.data)
      // Pre-filled, not saved: with no turnover yet, start from an estimate converted from the organisation's
      // revenue (or Canada's own figure), labelled as an estimate until the user confirms or replaces it.
      const saved = r.data.country.applicability as UkApplicabilityForm
      const src = r.data.figures.organization ?? r.data.figures.canada
      const est = !saved.turnover_gbp && src ? turnoverEstimate(src.amount, src.currency) : null
      setForm(est ? { ...saved, ...est } : saved)
    })
  }, [id, country])

  const saved = useMemo(() => (rec ? evaluateUkApplicability(rec.country.applicability as UkApplicabilityForm) : null), [rec])

  if (!builder || status === 404) return <NotFound404 />
  if (status !== null && !rec) return <p style={S.error}>This part of the report could not be loaded. Check your connection and reload the page.</p>
  if (!rec || !saved) return <p style={S.muted}>Loading</p>

  const save = async () => {
    setSaveMsg('Saving')
    const r = await flApi<{ applicability: Record<string, string> }>(`/reports/${id}/countries/${country}/applicability`, { method: 'PUT', body: { applicability: form } })
    if (!r.data) { setSaveMsg(r.error ?? 'Not saved: check your connection'); return }
    setRec({ ...rec, country: { ...rec.country, applicability: r.data.applicability } })
    const at = new Date()
    setSaveMsg(`Saved at ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`)
  }
  const statuses = Object.fromEntries(rec.sections.map(s => [s.section_key, s.status]))
  const done = rec.sections.filter(s => s.status === 'complete').length

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href="/dashboard/forced-labour">Your reports</Link></p>
      <h1 style={S.h1}>{rec.report.organizationName ?? 'Report'}</h1>
      <CountryTabs id={id} current={country} />
      <p style={S.muted}>Modern Slavery Act 2015, section 54. {done} of {builder.sections.length} sections complete.</p>
      {!writable && <ReadOnlyBanner />}

      <h2 style={S.h2}>Does section 54 apply?</h2>
      <UkApplicabilityResult result={saved} />
      <details style={{ ...S.card, padding: '10px 16px' }} open={saved.outcome === 'undetermined'}>
        <summary style={{ fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{writable ? 'Answer or change the applicability questions' : 'The applicability answers'}</summary>
        <fieldset disabled={!writable} style={{ border: 0, padding: 0, margin: '12px 0 0', minWidth: 0 }}>
          <UkApplicabilityQuestions form={form} onChange={p => setForm(f => ({ ...f, ...p }))} sources={rec.figures} />
          {writable && <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 10 }}>
            <button type="button" style={S.button} onClick={save}>Save these answers</button>
            {saveMsg && <span style={S.muted}>{saveMsg}</span>}
          </div>}
        </fieldset>
      </details>

      <h2 style={S.h2}>Sections</h2>
      {builder.sections.map(d => (
        <Link key={d.key} href={`${BUILDER_ROOT}/${id}/${country}/${d.key}`} style={{ ...S.card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, textDecoration: 'none', padding: '12px 16px' }}>
          <span style={{ fontSize: 14, color: 'var(--color-ink)' }}>{d.number}. {d.title}</span>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {sharedFieldsIn(d).length > 0 && <SharedBadge text="Shared" />}
            <StatusPill status={statuses[d.key] ?? 'not_started'} />
          </span>
        </Link>
      ))}
      <p style={{ marginTop: 18 }}><Link href={`${BUILDER_ROOT}/${id}/${country}/check`} style={{ ...S.buttonQuiet, textDecoration: 'none', display: 'inline-block' }}>Check the statement before export</Link></p>
    </>
  )
}

export default function CountryTab({ params }: { params: Promise<{ id: string; country: string }> }) {
  const { id, country } = use(params)
  return <BuilderFrame report><CountryHome id={id} country={country} /></BuilderFrame>
}
