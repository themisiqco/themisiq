'use client'

// app/dashboard/forced-labour/_components/CountrySectionPage.tsx
// One section of a country other than Canada (the UK since Stage D1, 1 Oct 2026). The layout follows
// Canada's SectionPage: the law's words, the plain explanation, what readers look for, key terms, the
// guidance, the prompts, then Previous / Next / Mark as complete. Canada's own page is unchanged and separate.
//
// ⚠️ SHARED FIELDS ARE MARKED. A field shared with another country carries a badge, and when its answer came
// from that country, says so (lib/forcedLabour/countryAdapter.ts sharedProvenance). Editing it here changes it
// there too: the save writes the shared store and this country's record in one transaction
// (public.fl_save_country_section).

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { flApi } from '../../../../lib/forcedLabour/client'
import { builderFor } from '../../../../lib/forcedLabour/countryBuilders'
import { UK_SOURCE_LABEL, UK_KEY_TERMS, UK_KEY_TERMS_EXPLANATION_LABEL, ukFinancialYear, ukDate, ukSectionDef, type UkSectionDef } from '../../../../lib/forcedLabour/uk/builderContent'
import { sharedFieldsIn, countryMissingRequired } from '../../../../lib/forcedLabour/countryAdapter'
import { OECD_STEPS, type SectionContent } from '../../../../lib/s211/builderContent'
import { asList, type SectionStatus } from '../../../../lib/s211/sectionStatus'
import { createAutosaver, autosaveLabel, type AutosaveState } from '../../../../lib/s211/autosave'
import { isFirstVisit, recordVisit, browserStore } from '../../../../lib/s211/visits'
import { BUILDER_ROOT, canWrite } from '../../../../lib/s211/builderAccess'
import { S, StatusPill, QuoteBlock, Disclosure, FieldInput, StepStatusRows, NotFound404, ReadOnlyBanner, STATUS_LABEL, useBuilderState } from './ui'
import { SharedBadge, DraftNotice, countryName } from './CountryTabs'
import { draftNotes, clearDraft, draftBadge, draftConfirmLabel } from '../../../../lib/forcedLabour/drafts'
import type { CountryKey } from '../../../../lib/forcedLabour/countries'
import type { CountryRecord, CountryEntities, Provenance } from './countryTypes'
import { EntitiesPanel } from './EntitiesPanel'

const ACT_LABEL: Record<UkSectionDef['actStatus'], string> = {
  requires: 'What the Act requires',
  'may-include': 'What the Act says a statement may include',
  identifies: 'Who the Act applies to',
}
const FY_OVERRIDE_LINK = 'The financial year is not twelve months ending on that date'

export function CountrySectionPage({ id, country, sectionKey }: { id: string; country: string; sectionKey: string }) {
  const builder = builderFor(country)
  const def = builder?.sections.find(s => s.key === sectionKey)
  const writable = canWrite(useBuilderState())
  const base = `${BUILDER_ROOT}/${id}/${country}`
  const [firstVisit] = useState(() => isFirstVisit(browserStore(), id, `${country}:${sectionKey}`))
  useEffect(() => { recordVisit(browserStore(), id, `${country}:${sectionKey}`) }, [id, country, sectionKey])

  const [loaded, setLoaded] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')
  const [content, setContent] = useState<SectionContent>({})
  const [status, setStatus] = useState<SectionStatus>('not_started')
  const [statuses, setStatuses] = useState<Record<string, SectionStatus>>({})
  const [provenance, setProvenance] = useState<Provenance>({})
  const [entities, setEntities] = useState<CountryEntities | null>(null)
  const [save, setSave] = useState<AutosaveState>({ kind: 'idle' })
  const [refusal, setRefusal] = useState<{ message: string; missing: string[] } | null>(null)
  const [showTerms, setShowTerms] = useState(false)
  const [showFyOverride, setShowFyOverride] = useState(false)
  const contentRef = useRef<SectionContent>({})
  const autosaverRef = useRef<ReturnType<typeof createAutosaver<SectionContent>> | null>(null)

  const saveNow = useCallback(async (c: SectionContent, action: 'save' | 'complete' | 'reopen' = 'save') => {
    const r = await flApi<{ section: { status: SectionStatus } }>(`/reports/${id}/countries/${country}/sections/${sectionKey}`, { method: 'PUT', body: { content: c, action } })
    if (r.data) { const st = r.data.section.status; setStatus(st); setStatuses(s => ({ ...s, [sectionKey]: st })) }
    return r
  }, [id, country, sectionKey])

  useEffect(() => {
    const a = createAutosaver<SectionContent>({ save: async c => !!(await saveNow(c)).data, onState: setSave })
    autosaverRef.current = a
    return () => { a.dispose(); autosaverRef.current = null }
  }, [saveNow])

  useEffect(() => {
    if (!def) return
    void flApi<CountryRecord>(`/reports/${id}/countries/${country}`).then(r => {
      if (r.status === 404) { setLoaded('missing'); return }
      if (!r.data) { setLoaded('error'); return }
      const mine = r.data.sections.find(s => s.section_key === sectionKey)
      let c = mine?.content ?? {}
      // Approval of a group statement: one row per other organisation it covers, started from Statement details.
      const ents = r.data.entities
      if (sectionKey === 'approval' && ents && ents.covered.length > 1 && !(Array.isArray(c.group_approvals) && c.group_approvals.length)) {
        c = { ...c, group_approvals: ents.covered.filter(n => n !== ents.giving).map(organisation => ({ organisation, approved_by: '', approval_date: '', signer_name: '', signer_title: '' })) }
      }
      contentRef.current = c
      setContent(c)
      setStatus(mine?.status ?? 'not_started')
      setStatuses(Object.fromEntries(r.data.sections.map(s => [s.section_key, s.status])))
      setProvenance(mine?.provenance ?? {})
      setEntities(r.data.entities ?? null)
      setShowFyOverride(!!(c.financial_year_start || c.financial_year_end))
      setLoaded('ok')
    })
  }, [id, country, sectionKey, def])

  if (!builder || !def || loaded === 'missing') return <NotFound404 />
  if (loaded === 'error') return <p style={S.error}>This section could not be loaded. Check your connection and reload the page.</p>
  if (loaded === 'loading') return <p style={S.muted}>Loading</p>

  const apply = (c: SectionContent) => {
    if (!writable) return
    contentRef.current = c
    setContent(c)
    setRefusal(null)
    autosaverRef.current?.schedule(c)
  }
  // Editing a field started from another country's answer makes it this country's own (lib/forcedLabour/drafts.ts).
  const change = (key: string, value: unknown) => apply(clearDraft({ ...contentRef.current, [key]: value }, key))
  const blur = () => { void autosaverRef.current?.flush(contentRef.current) }
  const complete = async () => {
    await autosaverRef.current?.flush(contentRef.current)
    const r = await saveNow(contentRef.current, 'complete')
    if (r.status === 422) setRefusal({ message: r.error ?? 'This section cannot be marked complete yet.', missing: countryMissingRequired(def, contentRef.current) })
    else if (!r.data) setRefusal({ message: 'Not saved: check your connection', missing: [] })
  }
  const reopen = async () => { const r = await saveNow(contentRef.current, 'reopen'); if (!r.data) setRefusal({ message: 'Not saved: check your connection', missing: [] }) }

  const idx = builder.sections.findIndex(s => s.key === sectionKey)
  const prev = builder.sections[idx - 1], next = builder.sections[idx + 1]
  const shared = new Set(sharedFieldsIn(def).map(f => f.key))
  const visibleFields = def.fields.filter(f => (!f.showWhen || f.showWhen(content)) && (f.revealedBy !== 'fy_override' || showFyOverride)
    && !(sectionKey === 'approval' && f.key === 'group_approvals' && !isGroup))
  const fy = sectionKey === 'statement_details' ? ukFinancialYear(content) : null
  const isGroup = !!entities && entities.covered.length > 1
  const groupQuestion = ukSectionDef('statement_details').openQuestion!

  return (
    <div className="s211-layout">
      <nav aria-label="Sections of this statement">
        <div className="s211-nav-side">
          <p style={{ ...S.label, marginBottom: 8 }}>Sections</p>
          <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {builder.sections.map(d => {
              const current = d.key === sectionKey
              return (
                <li key={d.key} style={{ marginBottom: 4 }}>
                  <Link href={`${base}/${d.key}`} aria-current={current ? 'page' : undefined}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: '6px 8px', borderRadius: 8, textDecoration: 'none',
                      fontSize: 12.5, lineHeight: 1.35, color: 'var(--color-ink)', background: current ? '#E6F1F3' : 'transparent', fontWeight: current ? 600 : 400,
                      borderLeft: current ? '3px solid var(--color-brand)' : '3px solid transparent' }}>
                    <span>{d.number}. {d.title}</span>
                    <StatusPill status={statuses[d.key] ?? 'not_started'} />
                  </Link>
                </li>
              )
            })}
          </ol>
        </div>
        <div className="s211-nav-jump">
          <label htmlFor="jump" style={S.label}>Jump to section</label>
          <select id="jump" style={S.input} value={sectionKey} onChange={e => { window.location.href = `${base}/${e.target.value}` }}>
            {builder.sections.map(d => <option key={d.key} value={d.key}>{d.number}. {d.title} ({STATUS_LABEL[statuses[d.key] ?? 'not_started']})</option>)}
          </select>
        </div>
      </nav>
      <main>
        <p style={{ ...S.muted, margin: '0 0 6px' }}><Link href={base}>Back to the {countryName(country)} statement</Link></p>
        {!writable && <ReadOnlyBanner />}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h1 style={S.h1}>{def.number}. {def.title}</h1>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>{shared.size > 0 && <SharedBadge text="Shared" />}<StatusPill status={status} /></div>
        </div>
        <p style={{ ...S.muted, margin: '0 0 20px' }}>{def.mapsTo}</p>

        <p style={{ ...S.label, marginTop: 0 }}>{ACT_LABEL[def.actStatus]}</p>
        <QuoteBlock q={def.actQuote} />

        <Disclosure title="In plain terms" open={firstVisit}><p style={{ ...S.body, margin: 0 }}>{def.plainTerms}</p></Disclosure>
        <Disclosure title="What readers look for" open={firstVisit}><p style={{ ...S.body, margin: 0 }}>{def.readersLookFor}</p></Disclosure>
        <p style={{ margin: '0 0 14px' }}>
          <button type="button" style={{ ...S.buttonQuiet, padding: '6px 12px' }} onClick={() => setShowTerms(v => !v)}>{showTerms ? 'Hide key terms' : 'Key terms'}</button>
        </p>
        {showTerms && (
          <div style={{ ...S.card }}>
            {UK_KEY_TERMS.map(t => (
              <div key={t.term} style={{ marginBottom: 14 }}>
                <p style={{ ...S.label, marginBottom: 6 }}>{t.term}</p>
                <QuoteBlock q={t.quote} />
                <p style={{ ...S.muted, margin: 0 }}><em>{UK_KEY_TERMS_EXPLANATION_LABEL}:</em> {t.explanation}</p>
              </div>
            ))}
          </div>
        )}
        {def.context.length > 0 && (
          <Disclosure title="What the statutory guidance says">{def.context.map((q, i) => <QuoteBlock key={i} q={q} />)}</Disclosure>
        )}
        {sectionKey === 'approval' && isGroup && (
          <div style={S.warn}>
            <p style={{ margin: '0 0 8px' }}><strong>An open question, not advice.</strong> {groupQuestion.text}</p>
            {groupQuestion.quotes.map((q, i) => <QuoteBlock key={i} q={q} />)}
          </div>
        )}
        {def.openQuestion && def.openQuestion.when(content) && (
          <div style={S.warn}>
            <p style={{ margin: '0 0 8px' }}><strong>An open question, not advice.</strong> {def.openQuestion.text}</p>
            {def.openQuestion.quotes.map((q, i) => <QuoteBlock key={i} q={q} />)}
          </div>
        )}

        {sectionKey === 'statement_details' && entities && (
          <EntitiesPanel id={id} country={country} entities={entities} group={content.is_group_statement === 'Yes'} writable={writable} onSaved={setEntities} />
        )}

        <div style={{ ...S.card, marginTop: 6 }}>
          <fieldset disabled={!writable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {visibleFields.map(f => {
              const p = provenance[f.key]
              const badge = shared.has(f.key)
                ? p && p.from === 'elsewhere' && p.countries.length > 0 ? `Shared: answered for ${p.countries.map(countryName).join(' or ')}` : 'Shared'
                : null
              return (
                <div key={f.key}>
                  {badge && <p style={{ margin: '0 0 4px' }}><SharedBadge text={badge} /></p>}
                  {draftNotes(content)[f.key] && <DraftNotice text={draftBadge(draftNotes(content)[f.key], country as CountryKey)} confirmLabel={draftConfirmLabel(country as CountryKey)}
                    disabled={!writable} onConfirm={() => apply(clearDraft(contentRef.current, f.key))} />}
                  {f.key === 'due_diligence_steps' ? (
                    <div style={{ marginBottom: 18 }}>
                      <label style={S.label}>{f.label} <span style={{ fontWeight: 400, fontSize: 11.5, color: 'var(--color-ink-muted)' }}>[{UK_SOURCE_LABEL[f.ukSource]}]</span></label>
                      <p style={S.hint}>{f.hint}</p>
                      <StepStatusRows steps={OECD_STEPS} value={content[f.key]} onChange={v => change(f.key, v)} onBlur={blur} />
                    </div>
                  ) : (
                    <FieldInput field={f} value={content[f.key]} content={content} onChange={v => change(f.key, v)} onBlur={blur}
                      tag={f.ukSource === 'act' ? null : UK_SOURCE_LABEL[f.ukSource]} />
                  )}
                  {shared.has(f.key) && f.sharedNote && <p style={{ ...S.hint, marginTop: -10, marginBottom: 14 }}>{f.sharedNote}</p>}
                  {sectionKey === 'statement_details' && f.key === 'financial_year_ending' && (
                    <>
                      <p style={fy ? { ...S.card, background: '#F7FBFB', fontSize: 14 } : S.hint}>
                        {fy ? <>This statement covers the financial year <strong>{ukDate(fy.start)} to {ukDate(fy.end)}</strong>.</> : 'Enter the month, day and year to see the financial year this statement covers.'}
                      </p>
                      {!showFyOverride && (
                        <p style={{ margin: '-8px 0 18px' }}>
                          <button type="button" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-brand)', textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}
                            onClick={() => setShowFyOverride(true)}>{FY_OVERRIDE_LINK}</button>
                        </p>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </fieldset>
        </div>

        {refusal && (
          <div style={S.error}>
            <p style={{ margin: 0 }}>{refusal.message}</p>
            {asList(refusal.missing) && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{refusal.missing.map(m => <li key={m}>{m}</li>)}</ul>}
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 10 }}>
          {prev ? <Link href={`${base}/${prev.key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Previous</Link> : <span />}
          {next ? <Link href={`${base}/${next.key}`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Next</Link>
            : <Link href={`${base}/check`} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Check the statement</Link>}
          {writable && (status === 'complete'
            ? <button type="button" style={S.buttonQuiet} onClick={reopen}>Reopen this section</button>
            : <button type="button" style={S.button} onClick={complete}>Mark as complete</button>)}
          {writable && <span aria-live="polite" style={{ ...S.muted, color: save.kind === 'error' ? '#B91C1C' : 'var(--color-ink-muted)' }}>{autosaveLabel(save)}</span>}
        </div>
      </main>
    </div>
  )
}
