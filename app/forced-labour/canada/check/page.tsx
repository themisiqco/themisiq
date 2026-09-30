'use client'

// app/forced-labour/canada/check/page.tsx (was /forced-labour/check until Stage 5c; next.config.ts redirects it)
// The free applicability check: signed out or in, nothing sent to a server. It runs the builder's own
// engines (lib/s211/entity.ts, lib/s211/obligation.ts) in the browser through lib/s211/applicability.ts,
// with the same questions, results and quotations a report's home shows.
//
// THE ANSWERS TRAVEL. Each change is saved in this browser under DRAFT_KEYS.forcedLabourCheck (lib/drafts.ts),
// and read back if the visitor returns. The builder writes them into the first report it creates and clears
// them, so a buyer does not answer twice. A draft saved while signed out lasts two hours.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import Nav from '@/app/components/Nav'
import Footer from '@/app/components/Footer'
import { supabase } from '@/lib/supabase'
import { DRAFT_KEYS, readDraft, saveDraft } from '@/lib/drafts'
import { evaluateApplicability, parseApplicabilityDraft, type ApplicabilityForm } from '@/lib/s211/applicability'
import { ORDER_HREF, ORDER_LABEL, BUILDER_ROOT } from '@/lib/s211/builderAccess'
import { COUNTRIES, CANADA_PAGE } from '@/lib/forcedLabour/countries'

const CANADA = COUNTRIES.find(c => c.key === 'canada')!
import { ApplicabilityQuestions, ApplicabilityResult } from '@/app/dashboard/forced-labour/_components/Applicability'
import { S } from '@/app/dashboard/forced-labour/_components/ui'

const subscribe = () => () => {}

function Check() {
  const [form, setForm] = useState<ApplicabilityForm>(() => readDraft(DRAFT_KEYS.forcedLabourCheck, parseApplicabilityDraft) ?? {})
  const anon = useRef(true)   // until the session is read, a save is stamped as signed out: the shorter life
  useEffect(() => {
    let live = true
    supabase.auth.getSession().then(({ data: { session } }) => { if (live) anon.current = !session }).catch(() => {})
    return () => { live = false }
  }, [])
  const set = (k: string, v: string) => setForm(f => {
    const next = { ...f, [k]: v }
    saveDraft(DRAFT_KEYS.forcedLabourCheck, next, { anon: anon.current })
    return next
  })
  const result = useMemo(() => evaluateApplicability(form), [form])
  const reports = result.obligation.outcome === 'must-report' || result.obligation.outcome === 'undetermined'

  return (
    // Steps on the left, the live result beside them on a wide screen (sticky), after them on a phone.
    // The grid's classes come with ApplicabilityQuestions (APPLICABILITY_CSS).
    <div className="fl-check">
      <ApplicabilityQuestions form={form} onChange={set} />
      <aside className="fl-side" aria-label="The result">
      <h2 style={{ ...S.h2, marginTop: 0 }}>The result</h2>
      <ApplicabilityResult result={result} />
      <div style={{ ...S.card, background: 'var(--color-module-labour-wash)' }}>
        <p style={{ ...S.body, margin: '0 0 12px' }}>
          {reports
            ? 'Forced Labour Reporting prepares the report section by section and produces the PDF. Your answers here are kept in this browser and added to your first report.'
            : 'If your answers change, come back to this page: they are kept in this browser for a while.'}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={ORDER_HREF} style={{ ...S.button, textDecoration: 'none' }}>{ORDER_LABEL}</a>
          <a href={CANADA_PAGE} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>About the Canada report</a>
          <a href={BUILDER_ROOT} style={{ ...S.buttonQuiet, textDecoration: 'none' }}>Open your reports</a>
        </div>
      </div>
      </aside>
    </div>
  )
}

export default function ForcedLabourCheckPage() {
  // The form restores a saved draft from this browser, which the server cannot see, so it renders on the
  // client only. Rendering it on the server too would draw an empty form the browser then contradicts.
  const onClient = useSyncExternalStore(subscribe, () => true, () => false)
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)', minHeight: '100vh' }}>
      <Nav />
      <main style={{ ...S.page, maxWidth: 1140 }}>
        <p style={{ ...S.muted, margin: 0 }}><a href="/forced-labour">Forced Labour Reporting</a> / <a href={CANADA_PAGE}>Canada</a></p>
        <h1 style={S.h1}>Does Canada&rsquo;s forced labour reporting law apply to you?</h1>
        {/* The same clear space before the form as the module pages leave under their intro. */}
        <p style={{ ...S.body, maxWidth: '72ch', margin: '0 0 2rem' }}>
          A free check against the {CANADA.law} ({CANADA.shortName}). Answer the questions that decide whether it
          applies. The result updates as you answer, with the Act and Public Safety Canada&rsquo;s guidance
          quoted. Nothing you enter here is sent anywhere: it stays in this browser.
        </p>
        {onClient ? <Check /> : <p style={S.muted}>Loading</p>}
      </main>
      <Footer />
    </div>
  )
}
