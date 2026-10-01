'use client'

// app/dashboard/forced-labour/[id]/[country]/check/page.tsx
// The UK statement's check page (Stage D2, 1 Oct 2026): what blocks export, answers started from another country's
// report still to confirm, what looks like personal information or cannot be drawn, then where the statement must be
// published, quoted from the constants, and the download. UK-specific copy, so British spelling.
//
// The gate runs on what is STORED (withoutOffered), as the export does, so the two cannot disagree.

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { flApi, flDownload } from '../../../../../../lib/forcedLabour/client'
import { UK_SECTIONS, type UkSectionKey } from '../../../../../../lib/forcedLabour/uk/builderContent'
import { ukExportGate, ukScanPersonalInformation, ukScanUndrawable, UK_PERSONAL_INFO_NOTE, UK_PERSONAL_INFO_KIND_LABEL, type UkSectionState } from '../../../../../../lib/forcedLabour/uk/exportCheck'
import { savedDrafts, clearDraft, withoutOffered } from '../../../../../../lib/forcedLabour/drafts'
import { describeChars } from '../../../../../../lib/s211/exportCheck'
import { letteredLines, type SectionContent } from '../../../../../../lib/s211/builderContent'
import { UK_MSA_S54_7, UK_MSA_S54_8, UK_GUIDANCE_REGISTRY, UK_GUIDANCE_LANGUAGE, UK_GUIDANCE_WHEN } from '../../../../../../lib/forcedLabour/uk/requirements'
import { canWrite, BUILDER_ROOT } from '../../../../../../lib/s211/builderAccess'
import { BuilderFrame, ReadOnlyBanner, S, StatusPill, NotFound404, QuoteBlock, useBuilderState } from '../../../_components/ui'
import { CountryTabs } from '../../../_components/CountryTabs'
import { DraftsToConfirm } from '../../../_components/DraftsToConfirm'
import type { CountryRecord } from '../../../_components/countryTypes'

const ACT = 'Modern Slavery Act 2015'
const GUIDANCE = 'Home Office, Transparency in supply chains: a practical guide'

function Check({ id, country }: { id: string; country: string }) {
  const writable = canWrite(useBuilderState())
  const [rec, setRec] = useState<CountryRecord | null>(null)
  const [status, setStatus] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = () => flApi<CountryRecord>(`/reports/${id}/countries/${country}`).then(r => { setStatus(r.status); setRec(r.data) })
  useEffect(() => { void load() }, [id, country]) // eslint-disable-line react-hooks/exhaustive-deps

  if (country !== 'uk' || status === 404) return <NotFound404 />
  if (status !== null && !rec) return <p style={S.error}>The statement could not be loaded. Check your connection and reload the page.</p>
  if (!rec) return <p style={S.muted}>Loading</p>

  const base = `${BUILDER_ROOT}/${id}/${country}`
  // What is stored, as the export sees it.
  const stored = Object.fromEntries(rec.sections.map(s => [s.section_key, { status: s.status, content: withoutOffered(s.content) }])) as Record<UkSectionKey, UkSectionState>
  const contents = Object.fromEntries(Object.entries(stored).map(([k, v]) => [k, v.content])) as Record<UkSectionKey, SectionContent>
  const gate = ukExportGate(stored, { giving: rec.entities.giving, covered: rec.entities.covered })
  const pi = ukScanPersonalInformation(contents)
  const undrawable = ukScanUndrawable(contents)
  const drafts = savedDrafts(contents).map(d => {
    const def = UK_SECTIONS.find(s => s.key === d.section)!
    return { ...d, sectionTitle: `${def.number}. ${def.title}`, href: `${base}/${d.section}`, label: def.fields.find(f => f.key === d.field)?.label ?? d.field }
  })
  const confirmDraft = async (section: string, field: string) => {
    const r = await flApi(`/reports/${id}/countries/${country}/sections/${section}`, { method: 'PUT', body: { content: clearDraft(contents[section as UkSectionKey], field) } })
    if (r.data) void load()
  }
  const download = async () => {
    setMsg('Preparing the PDF')
    const r = await flDownload(`/reports/${id}/countries/${country}/export`)
    setMsg(r.ok ? (r.substituted ? `Downloaded ${r.fileName}. ${r.substituted} character${r.substituted === 1 ? '' : 's'} could not be drawn and were replaced; see below.` : `Downloaded ${r.fileName}.`) : r.error)
  }
  const card = { ...S.card, padding: '12px 16px' }

  return (
    <>
      <p style={{ ...S.muted, margin: 0 }}><Link href={base}>Back to the United Kingdom statement</Link></p>
      <CountryTabs id={id} current={country} />
      <h1 style={S.h1}>Check the statement</h1>
      {!writable && <ReadOnlyBanner />}
      <p style={S.muted}>{rec.entities.giving ?? rec.report.organizationName}. A last look before the statement is exported for approval and signing.</p>

      <h2 style={S.h2}>Before it can be exported</h2>
      {gate.ready ? <p style={S.body}>Nothing is holding up export.</p> : gate.blockers.map((b, i) => (
        <div key={i} style={card}>
          <p style={{ ...S.body, margin: 0 }}>{b.section ? <Link href={`${base}/${b.section}`}>{b.message}</Link> : b.message}</p>
          {b.missing.length > 0 && <ul style={{ ...S.hint, margin: '6px 0 0', paddingLeft: 18 }}>{b.missing.map(m => <li key={m}>{m}</li>)}</ul>}
        </div>
      ))}

      <DraftsToConfirm items={drafts} to="uk" writable={writable} onConfirm={confirmDraft} />

      <h2 style={S.h2}>Sections</h2>
      {UK_SECTIONS.map(d => (
        <div key={d.key} style={{ ...card, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <Link href={`${base}/${d.key}`} style={{ fontSize: 14, color: 'var(--color-ink)' }}>{d.number}. {d.title}</Link>
          <StatusPill status={stored[d.key]?.status ?? 'not_started'} />
        </div>
      ))}
      <p style={S.hint}>The six topics are optional: the Act lists them as what a statement may include, and only those answered are printed.</p>

      <h2 style={S.h2}>Personal information</h2>
      {pi.length === 0 ? <p style={S.body}>Nothing found.</p> : pi.map((h, i) => (
        <p key={i} style={S.warn}><Link href={`${base}/${h.section}`}>{h.title}</Link>, {h.field}: &ldquo;{h.match}&rdquo; looks like {UK_PERSONAL_INFO_KIND_LABEL[h.kind]}.</p>
      ))}
      <p style={S.hint}>{UK_PERSONAL_INFO_NOTE}</p>

      {undrawable.length > 0 && (
        <>
          <h2 style={S.h2}>Characters the PDF cannot draw</h2>
          {undrawable.map((h, i) => (
            <p key={i} style={S.warn}><Link href={`${base}/${h.section}`}>{h.title}</Link>, {h.field}: {describeChars(h.chars)}. It would print as &ldquo;{h.printedAs}&rdquo;.</p>
          ))}
        </>
      )}

      <h2 style={S.h2}>Publishing the statement</h2>
      <p style={S.label}>The Act requires</p>
      <QuoteBlock q={{ lines: letteredLines(UK_MSA_S54_7), ref: `${ACT}, s.54(7)` }} />
      <QuoteBlock q={{ lines: [UK_MSA_S54_8], ref: `${ACT}, s.54(8)` }} />
      <p style={S.label}>The statutory guidance recommends</p>
      <QuoteBlock q={{ lines: [UK_GUIDANCE_REGISTRY], ref: GUIDANCE }} />
      <QuoteBlock q={{ lines: [UK_GUIDANCE_LANGUAGE], ref: GUIDANCE }} />
      <QuoteBlock q={{ lines: [UK_GUIDANCE_WHEN], ref: GUIDANCE }} />
      <p style={S.muted}>The registry is encouraged, not required. The six months is the guidance&rsquo;s recommendation: the Act sets no deadline.</p>

      <h2 style={S.h2}>Download</h2>
      {gate.ready
        ? <button type="button" style={S.button} onClick={download}>Download the statement (PDF)</button>
        : <p style={S.muted}>The download is available once nothing above is holding up export.</p>}
      {msg && <p style={S.muted}>{msg}</p>}
    </>
  )
}

export default function CountryCheckPage({ params }: { params: Promise<{ id: string; country: string }> }) {
  const { id, country } = use(params)
  return <BuilderFrame report><Check id={id} country={country} /></BuilderFrame>
}
