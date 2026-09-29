'use client'

// app/dashboard/deals/report/page.tsx
// ThemisIQ — ESG Deal Due Diligence Report, the printed document form of the Deals assessment.
//
// Conventions copied from app/dashboard/climate-risk/report/page.tsx: Suspense-wrapped
// useSearchParams, ?id= query param, entitlement gate, sticky no-print bar, the same @media print
// block and A4 @page rule, maxWidth 780 body, `.page` sections, Report-ID footer. That page's own
// header flags its duplication as interim pending a shared shell; this follows the same convention
// rather than pre-empting that extraction.
//
// TWO DEVIATIONS, both forced by the data model:
//
// 1. DERIVED, NOT SNAPSHOT. climate-risk and materiality read a STORED result row — the report
//    renders what was computed when the assessment ran. Deals has no such row: `public.deals`
//    stores the INPUTS, and every finding here is derived at render through the same engine the
//    the wizard uses. So this document is a view of the deal AS IT STANDS NOW, not a record of a past
//    assessment, and it says so on the cover and in the footer. Re-generating after the deal
//    record changes produces different findings, by design.
//
// 2. DIRECT TABLE READ. Those pages fetch an authed API route (/api/materiality/{id}) because
//    materiality rows are served through one. Deals has no such route; the dashboard reads
//    `public.deals` directly under the user's session, with owner-scoped RLS doing the access
//    control (20260701_deals_table.sql). This follows the deals-native path rather than inventing
//    an API route for one reader.
//
// Every figure comes from lib/deals/assessment.ts (what is true) rendered through
// lib/deals/reportModel.ts (how it is said). Nothing is re-derived here — the wizard screens and this
// document read the same rows, so they cannot state different figures or cite different regimes.

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
// useEntitlementAccess, NOT useEntitlementState — the state form's `isPaid` is TRUE for an expired
// customer by contract, and this page needs to tell 'expired' from
// 'never purchased' to choose which upsell to show (and 'unknown' to show neither).
import { useEntitlementAccess } from '../../../../lib/useEntitlement'
// Decided in lib/deals/gates.ts; this page renders the outcome and holds no second copy of the rule.
import { resolveReportGate, type SessionState, type ReportUpsell } from '../../../../lib/deals/gates'
import { useReportTitle, reportTitle } from '../../../../lib/useReportTitle'
import { filenameDate } from '../../../../lib/filename'
import PaywallCard from '../../../components/PaywallCard'
import { FLAT_MODULE_PRICES } from '../../../../lib/pricing'
import {
  buildDealReportModel, CHIP_LABELS, type DealReportModel, type ReportPanel, type Rich,
} from '../../../../lib/deals/reportModel'

// ─── The deal row ─────────────────────────────────────────────────────────────
// `employee_count` and `total_assets` are OPTIONAL because 20260730_deals_size_limbs.sql may not be
// applied yet — until it is, the columns are absent and every multi-limb size test correctly
// reports NOT ASSESSED rather than guessing.
type DealRow = {
  id: string
  target_name: string | null
  sector: string | null
  jurisdiction: string | null
  deal_type: string | null
  revenue: number | null
  currency: string | null
  deal_value: number | null
  location_count: number | null
  employee_count?: number | null
  total_assets?: number | null
  // Optional and tri-state, exactly as the wizard stores it: a report of a deal saved before the field
  // existed reads `undefined`, which must behave as "not answered" and never as "not listed".
  listed_ca_exchange?: boolean | null
  has_ghg_data: boolean | null
  has_esg_report: boolean | null
  created_at: string
}

// ─── Styled bits (print-friendly) ─────────────────────────────────────────────
const GRAD = 'var(--color-brand)'
const SEV = {
  critical: { label: CHIP_LABELS.critical, color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  high:     { label: CHIP_LABELS.high, color: 'var(--color-state-warn)', bg: '#FEF3E2', border: 'var(--color-state-warn)' },
  medium:   { label: CHIP_LABELS.medium, color: '#0C447C', bg: '#E6F1FB', border: '#0C447C' },
} as const

// Status colours carry a TEXT label too, never colour alone — the three-state distinction
// (applies / not applicable / not assessed) is the point of this module and must survive a
// greyscale print.
const STATE = {
  applies:      { label: CHIP_LABELS.applies, color: '#0F6E56', bg: '#E1F5EE', border: 'rgba(15,110,86,0.35)' },
  verify:       { label: CHIP_LABELS.verify, color: 'var(--color-state-warn)', bg: '#FEF3E2', border: 'color-mix(in srgb, var(--color-state-warn) 35%, transparent)' },
  nearBelow:    { label: CHIP_LABELS.nearBelow, color: 'var(--color-state-warn)', bg: '#FEF3E2', border: 'color-mix(in srgb, var(--color-state-warn) 35%, transparent)' },
  notAssessed:  { label: 'NOT ASSESSED', color: 'var(--color-state-warn)', bg: '#FEF3E2', border: 'color-mix(in srgb, var(--color-state-warn) 35%, transparent)' },
} as const

// ─── Page wrapper ─────────────────────────────────────────────────────────────
export default function DealsReportPage() {
  // useSearchParams must be inside a Suspense boundary for Next.js to prerender this page.
  return (
    <Suspense fallback={<Centered>Loading report…</Centered>}>
      <DealsReportInner />
    </Suspense>
  )
}

// Which of this user's deals a free-tier reader may open, as a union rather than a nullable id.
// `null` inside the resolved arm means "asked, and they have saved nothing" — distinct from not yet
// having asked, which is the 'loading' arm. Collapsing the two would let an unresolved lookup read
// as "this is not your free deal" and paywall a report the reader is entitled to.
type FreeTierScope =
  | { state: 'loading' }
  | { state: 'resolved'; newestOwnDealId: string | null }

function DealsReportInner() {
  const params = useSearchParams()
  // Five states, not a boolean: the paywall must not flash at a paying customer before the read
  // resolves ('loading'), and the upsell at the foot must be able to tell a lapsed customer from
  // one who never purchased — and to say nothing at all when the read failed.
  const access = useEntitlementAccess('deals')
  // Separate from `access`, which resolves a signed-out reader to 'none' through the same derivation
  // as a signed-in customer with no row. Only one of the two should be asked to sign in.
  const [sessionState, setSessionState] = useState<SessionState>('loading')
  const id = params.get('id')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deal, setDeal] = useState<DealRow | null>(null)
  const [freeTier, setFreeTier] = useState<FreeTierScope>({ state: 'loading' })

  useEffect(() => {
    // A missing `id` is a render-time fact about the URL, not fetched state, so it is reported by
    // the guard below rather than pushed through setState here. Setting state synchronously in an
    // effect body is what react-hooks/set-state-in-effect flags on the two older report pages.
    if (!id) return
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        // Signed out: no row is readable and no free-tier scope exists. Resolve the scope anyway —
        // leaving it on 'loading' would hold the loading state up forever instead of showing the
        // sign-in message.
        if (!session?.access_token) {
          setError('Please sign in to view the report.'); setLoading(false)
          setFreeTier({ state: 'resolved', newestOwnDealId: null })
          // RESOLVED 'anon' rather than left on 'loading', for the same reason the free-tier scope
          // beside it is resolved: an unresolved fact holds the loading state up forever, and the
          // sign-in message below would never render.
          setSessionState('anon')
          return
        }
        setSessionState('authed')

        // TWO QUERIES, CONCURRENT AND UNCONDITIONAL.
        //
        // The first is the report's own row and is unchanged. Owner-scoped RLS on public.deals
        // means a deal belonging to another user resolves to no row, not to a forbidden error —
        // surfaced as "not found" rather than leaking existence.
        //
        // The second establishes which deal a FREE reader may open. It is not branched on `isPaid`
        // because the entitlement resolves asynchronously: branching would make this fetch wait on
        // it and delay the report for every paying customer to gate a case that is not theirs. Two
        // columns, one row — an entitled reader pays for a lookup whose answer is never consumed.
        //
        // NEWEST BY updated_at, matching app/dashboard/deals/page.tsx exactly. Its wall renders
        // "Open your saved deal — {name} →" from that same ordering and sends the reader into the
        // wizard, from which they click through to this report. Choosing the oldest here would hand
        // them a deal this page then refuses.
        const [rowRes, newestRes] = await Promise.all([
          supabase.from('deals').select('*').eq('id', id).maybeSingle(),
          supabase.from('deals').select('id')
            .eq('user_id', session.user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        // Resolved BEFORE the row result is inspected, and independently of it: the two questions
        // are separate, and a row that failed to load must not leave the scope unresolved.
        //
        // ⚠️ A FAILED LOOKUP RESOLVES TO "NO FREE DEAL", WHICH IS THE OPPOSITE POLARITY TO THE
        // WIZARD. There, a failed count resolves to "do not wall" — a network error must not lock
        // someone out of their own work, and the DB trigger is the real enforcement anyway. Here
        // there is no second enforcement: if this cannot confirm the deal is their free one, the
        // safe direction is the paywall, because the thing at risk is the paid artefact itself.
        if (newestRes.error) {
          console.error('Free-tier scope lookup failed:', newestRes.error)
          setFreeTier({ state: 'resolved', newestOwnDealId: null })
        } else {
          setFreeTier({ state: 'resolved', newestOwnDealId: newestRes.data?.id ?? null })
        }

        const { data, error: err } = rowRes
        if (err) { setError(err.message || 'Failed to load deal.'); setLoading(false); return }
        if (!data) { setError('Deal not found, or you do not have access to it.'); setLoading(false); return }
        setDeal(data as DealRow); setLoading(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong.'); setLoading(false)
        setFreeTier({ state: 'resolved', newestOwnDealId: null })
        // Same reason as the two lines above: a thrown read must still resolve every fact the gate
        // waits on, or the page hangs on "Loading report…" instead of showing the error it caught.
        setSessionState(prev => (prev === 'loading' ? 'anon' : prev))
      }
    })()
  }, [id])

  // ONE generation instant, fixed at mount. The document is derived rather than stored, so the date
  // it carries is the date it was generated — and it says on the cover and in the footer that a
  // report generated on another date may differ. The filename therefore has to carry that date too,
  // or it contradicts the document it names.
  //
  // Held in state, not recomputed per render: two `new Date()` calls are two instants, and the whole
  // point is that the footer and the filename cannot disagree. The page title below and the report
  // model (its footer date and reference) both derive from this.
  const [generatedAt] = useState(() => new Date())

  // Names the saved PDF, both the generated one (DealReport's Save as PDF) and a browser print, which
  // takes the page title. One string for both. Null until the deal has loaded, so no title is built
  // from an absent name.
  const fileTitle = deal
    ? reportTitle(deal.target_name, `ESG Diligence Report - ${filenameDate(generatedAt)}`)
    : null
  useReportTitle(fileTitle)

  // FIRST, because it is knowable without any fetch. It also has to precede the loading guard
  // below: the effect returns early on a missing id, so the free-tier scope never resolves in that
  // case and the page would wait forever on a fact it was never going to be told.
  if (!id) return <Centered>No deal id provided.</Centered>

  // ── DECIDED IN lib/deals/gates.ts. THIS PAGE ONLY RENDERS THE OUTCOME. ─────────────────────
  // The reasoning behind each arm — why the free deal opens its own report, why identity rather than
  // count settles the lapsed case, why a foreign id can never satisfy it — travelled to the resolver
  // with the rule. Nothing here re-derives it.
  const gate = resolveReportGate({
    access,
    session: sessionState,
    freeTierDealId: freeTier.state === 'resolved' ? freeTier.newestOwnDealId : null,
    freeTierResolved: freeTier.state === 'resolved',
    requestedId: id,
  })

  // BEFORE the paywall. An unresolved entitlement is not a refusal, and nor is an unresolved
  // free-tier scope. This page is printed, so a paywall flashing into a print preview is worse than
  // on screen. Reuses the page's own waiting state so no new one appears.
  if (gate.kind === 'loading') return <Centered>Loading report…</Centered>

  // The effect has already set `error` for this case; the gate arm exists so the paywall below
  // cannot fire at someone whose only problem is that they are signed out.
  if (gate.kind === 'signed-out') return <Centered>{error ?? 'Please sign in to view the report.'}</Centered>

  // ONLY REACHABLE BY SOMEONE WHO HAS OPENED A REPORT BEFORE. The gate lets the newest own deal
  // through, so this wall fires on the SECOND one — the reader is demonstrably in the Deals module,
  // and the question they actually have is why this report is locked when the last one was not. The
  // first sentence answers that; a generic "unlock this module" does not.
  //
  // Wording is the neighbouring Deals surfaces', not a new register: the title is deals/list's
  // verbatim, and the deliverables are the free-deal wall's own list in deals/page.tsx.
  if (gate.kind === 'paywalled') return (
    <PaywallCard
      title="Unlock the Deals module"
      body="Screening one target is free. This report belongs to another one. Unlock Deals to open it, keep a pipeline of targets, and take away the diligence report, the Excel export and the shareable assessment."
      href="/pricing?modules=deals"
    />
  )

  if (loading) return <Centered>Loading report…</Centered>
  if (error) return <Centered>{error}</Centered>
  if (!deal) return <Centered>No deal data.</Centered>

  // Built from the same instant as the page title, so the footer date, the reference and the
  // saved file's name all agree. The reference's own reasoning is in buildDealReportModel.
  const model = buildDealReportModel(deal, generatedAt)
  // `upsell` is 'none' for an entitled reader AND for one whose entitlement could not be read — see
  // resolveReportGate. Passed down rather than re-derived in DealReport, which would be a second
  // copy of the rule one component along.
  return <DealReport dealId={deal.id} model={model} upsell={gate.upsell} fileTitle={fileTitle ?? 'ESG Diligence Report'} />
}

// ─── Small shared components & styles ─────────────────────────────────────────
const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: '#333', margin: '0 0 12px' }
const note: React.CSSProperties = { fontSize: 12, lineHeight: 1.7, color: '#555553', margin: '0 0 10px' }
const cite: React.CSSProperties = { fontSize: 11, lineHeight: 1.6, color: '#555553', fontStyle: 'italic', margin: '4px 0 0' }
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12, margin: '8px 0 16px' }
const trh: React.CSSProperties = { background: '#f8f7f5' }
const tr: React.CSSProperties = { borderBottom: '0.5px solid #e8e7e4' }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#555553', borderBottom: '1px solid #e8e7e4' }
const td: React.CSSProperties = { padding: '8px 10px', color: '#0d0d0d', verticalAlign: 'top' }

function H({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, color: '#0d0d0d', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #e8e7e4' }}>{children}</h2>
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '5px 0', fontSize: 13 }}>
      <div style={{ minWidth: 190, color: 'var(--color-ink-muted)' }}>{k}</div>
      <div style={{ color: '#0d0d0d', fontWeight: 500 }}>{v}</div>
    </div>
  )
}
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: 14, color: '#555553', padding: '2rem', textAlign: 'center' }}>
      {children}
    </div>
  )
}
function Chip({ s }: { s: { label: string; color: string; bg: string; border: string } }) {
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>{s.label}</span>
}
// An amber panel for every "we did not evaluate this" statement. Absence of a finding is never
// rendered as a finding — on the wizard screens or here.
function NotAssessed({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="page" style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 25%, transparent)', borderRadius: 8, padding: '12px 14px', margin: '0 0 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-state-warn)', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.7, color: '#555553' }}>{children}</div>
    </div>
  )
}
// A model panel through the one amber panel.
function PanelBox({ panel }: { panel: ReportPanel }) {
  return <NotAssessed title={panel.title}><RichText parts={panel.body} /></NotAssessed>
}
// The header row the three obligation tables share: a wide label column and two priced columns.
function ObligationHead({ columns }: { columns: [string, string, string] }) {
  return (
    <thead>
      <tr style={trh}>
        <th style={th}>{columns[0]}</th>
        <th style={{ ...th, width: 190 }}>{columns[1]}</th>
        <th style={{ ...th, width: 140 }}>{columns[2]}</th>
      </tr>
    </thead>
  )
}

// ─── The report ───────────────────────────────────────────────────────────────
// Sets a model sentence: plain runs as text, { strong } runs in the report's one bold weight.
function RichText({ parts }: { parts: Rich }) {
  return <>{parts.map((r, i) => typeof r === 'string' ? r : <strong key={i} style={{ fontWeight: 600 }}>{r.strong}</strong>)}</>
}

// ⚠️ RENDERS THE MODEL, DERIVES NOTHING. Every figure, sentence, heading and column label comes from
// buildDealReportModel in lib/deals/reportModel.ts, which the PDF generator draws from too. A value
// computed here is one the PDF cannot show, and the two documents would then disagree.
function DealReport({ dealId, model: m, upsell, fileTitle }: { dealId: string; model: DealReportModel; upsell: ReportUpsell; fileTitle: string }) {
  // THE PDF IS GENERATED IN CODE, NOT PRINTED (29 Sep 2026). Safari saved window.print() output as
  // blank pages even when its preview rendered, so the button builds the document with jsPDF from the
  // same model this page renders. Browser print (Cmd+P) and the print CSS below still work as a
  // second route. The generator is imported on click: it carries the embedded fonts and the
  // wordmark, and a reader who never saves should not download them.
  //
  // ⚠️ THIS BUTTON IS INSIDE DealReport ON PURPOSE. DealReport mounts only once resolveReportGate has
  // returned 'open', so the button cannot exist for a deal the reader may not open. See the header of
  // lib/deals/reportPdf.ts before calling the generator from anywhere else.
  const [pdf, setPdf] = useState<'idle' | 'building' | 'failed'>('idle')
  const savePdf = async () => {
    if (pdf === 'building') return
    setPdf('building')
    try {
      const { generateDealReportPDF } = await import('../../../../lib/deals/reportPdf')
      // Generation is synchronous and holds the main thread. Wait for one painted frame first, or a
      // cached import resolves at once and "Preparing PDF..." never reaches the screen.
      await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
      generateDealReportPDF(m).save(`${fileTitle}.pdf`)
      setPdf('idle')
    } catch (e) {
      // Logged in full for us, stated plainly for the reader, with the route that still works.
      console.error('Deals report PDF could not be created:', e)
      setPdf('failed')
    }
  }

  return (
    <div className="report-root" style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#0d0d0d' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, background: 'var(--color-ink)', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        {/* In the .no-print bar deliberately — the print rule below hides this whole bar, so the
            link never reaches the saved PDF. White on black, not the usual purple, which would be
            unreadable here. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <a href="/dashboard/deals/list" style={{ fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>← Your targets</a>
          {/* Back to the deal this report was built from — the likely next step after reading it is
              correcting a figure, not browsing the whole list. No arrow: this is a move sideways to
              the same target, not up to the collection. Same weight as its neighbour so neither
              competes with Save as PDF, which is still the main control on this bar.
              Uses dealId, the row this report was actually built from, rather than the URL
              param, which is not in scope in this component. */}
          <a href={`/dashboard/deals?id=${dealId}`} style={{ fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>Edit this deal</a>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>ThemisIQ · ESG deal due diligence report</div>
        </div>
        <button onClick={savePdf} disabled={pdf === 'building'} aria-busy={pdf === 'building'} style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: pdf === 'building' ? 'wait' : 'pointer', opacity: pdf === 'building' ? 0.75 : 1 }}>
          {pdf === 'building' ? 'Preparing PDF...' : '⬇ Save as PDF'}
        </button>
      </div>
      {pdf === 'failed' && (
        <div className="no-print" role="alert" style={{ background: '#FCEBEB', color: '#B91C1C', fontSize: 13, padding: '10px 24px', borderBottom: '0.5px solid rgba(185,28,28,0.2)' }}>
          The PDF could not be created. Please try again, or use your browser&rsquo;s print.
        </div>
      )}

      <div className="report-body" style={{ maxWidth: 780, margin: '0 auto', padding: '3rem 3rem 4rem' }}>

        {/* 1 ── COVER */}
        <section className="page">
          <div style={{ height: 6, background: GRAD, marginBottom: 32, borderRadius: 2 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-brand)', marginBottom: 12 }}>{m.cover.eyebrow}</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px' }}>{m.cover.title}</h1>
          <p style={{ fontSize: 15, color: '#555553', marginBottom: 36, lineHeight: 1.6 }}>{m.cover.intro}</p>
          <div style={{ borderTop: '1px solid #e8e7e4', borderBottom: '1px solid #e8e7e4', padding: '20px 0', marginBottom: 16 }}>
            {m.cover.rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}
          </div>
          <div style={{ ...note, background: '#f8f7f5', borderRadius: 8, padding: '10px 12px' }}>
            <RichText parts={m.cover.derivedNote} />
          </div>
        </section>

        {/* 2 ── APPLICABLE FRAMEWORKS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>{m.applicable.title}</H>
          {/* ⚠️ STANDALONE, AND NOT ATTACHED TO A FINDING. CS3D's note rides on sector-risk findings whose
              own `framework` string cites CS3D. NOTHING IN SECTOR_RISKS CITES 'Canada S-211' (checked
              26 Sep 2026), so the same per-finding gate would have been dead code. Placed at the head of
              the frameworks section because that is where a reader looks for what was and was not
              determined, and because a withheld regime that appears nowhere is the failure this whole
              vocabulary exists to prevent. */}
          {m.applicable.s211Panel && <PanelBox panel={m.applicable.s211Panel} />}
          {m.applicable.kind === 'not-evaluated' ? (
            <PanelBox panel={m.applicable.notEvaluatedPanel} />
          ) : m.applicable.kind === 'none' ? (
            <p style={p}>{m.applicable.noneSentence}</p>
          ) : (
            <>
              <p style={note}>{m.applicable.intro}</p>
              <table style={tbl}>
                <thead>
                  <tr style={trh}>
                    <th style={th}>{m.applicable.columns[0]}</th>
                    <th style={{ ...th, width: 170 }}>{m.applicable.columns[1]}</th>
                  </tr>
                </thead>
                <tbody>
                  {m.applicable.rows.map(r => (
                    <tr key={r.framework} style={tr}>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{r.framework}</div>
                        {r.citation && <p style={cite}>{r.citation}</p>}
                        {r.near && <p style={{ ...cite, fontStyle: 'normal', color: 'var(--color-state-warn)' }}>{r.near}</p>}
                        {r.verify && <p style={{ ...cite, fontStyle: 'normal', color: 'var(--color-state-warn)' }}>{r.verify}</p>}
                      </td>
                      <td style={td}><Chip s={STATE[r.chip]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {m.applicable.partialPanel && <PanelBox panel={m.applicable.partialPanel} />}
            </>
          )}
        </section>

        {/* 3 ── NEAR-THRESHOLD FRAMEWORKS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>{m.nearThreshold.title}</H>
          <p style={note}><RichText parts={m.nearThreshold.intro} /></p>
          {m.nearThreshold.kind === 'not-assessed' ? (
            <PanelBox panel={m.nearThreshold.notAssessedPanel} />
          ) : m.nearThreshold.kind === 'none' ? (
            <p style={p}>{m.nearThreshold.noneSentence}</p>
          ) : (
            <table style={tbl}>
              <thead>
                <tr style={trh}>
                  {m.nearThreshold.columns.map((c, i) => <th key={c} style={i === 5 ? { ...th, width: 74 } : th}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {m.nearThreshold.rows.map(r => (
                  <tr key={r.framework} style={tr}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{r.framework}</div>
                      <div style={{ marginTop: 4 }}><Chip s={STATE[r.chip]} /></div>
                    </td>
                    <td style={td}>{r.testsMet}</td>
                    <td style={td}>{r.decidingFigure}</td>
                    <td style={td}>{r.valueApplied}</td>
                    <td style={td}>{r.threshold}</td>
                    <td style={td}>{r.side}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {m.nearThreshold.belowNotes.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {m.nearThreshold.belowNotes.map(n => (
                <p key={n.framework} style={{ ...note, color: 'var(--color-state-warn)' }}>
                  <strong style={{ fontWeight: 600 }}>{n.framework}:</strong> {n.sentence}
                </p>
              ))}
            </div>
          )}
        </section>

        {/* 4 ── THRESHOLD LIMBS APPLIED */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>{m.sizeTests.title}</H>
          {m.sizeTests.kind === 'none' ? (
            <p style={p}>{m.sizeTests.noneSentence}</p>
          ) : (
            <>
              <p style={note}><RichText parts={m.sizeTests.intro} /></p>
              <table style={tbl}>
                <thead>
                  <tr style={trh}>
                    {m.sizeTests.columns.map((c, i) => <th key={c} style={i === 5 ? { ...th, width: 96 } : th}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {m.sizeTests.rows.map((r, i) => (
                    <tr key={i} style={tr}>
                      <td style={td}>{r.framework}</td>
                      <td style={td}>{r.measure}</td>
                      <td style={td}>
                        {r.basis}
                        <p style={cite}>{r.basisOfValue}</p>
                      </td>
                      <td style={td}>{r.valueApplied}</td>
                      <td style={td}>{r.threshold}</td>
                      <td style={{ ...td, fontWeight: 600, color: r.state === 'met' ? '#0F6E56' : r.state === 'not-assessed' ? 'var(--color-state-warn)' : '#555553' }}>{r.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {m.sizeTests.panels.map(panel => <PanelBox key={panel.title} panel={panel} />)}
            </>
          )}
        </section>

        {/* 5 ── ESG RISK FINDINGS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>{m.risks.title}</H>
          {m.risks.kind === 'none' ? (
            <p style={p}>{m.risks.noneSentence}</p>
          ) : (
            <>
              <p style={note}>{m.risks.intro}</p>
              {m.risks.unresolvedPanel && <PanelBox panel={m.risks.unresolvedPanel} />}
              <table style={tbl}>
                <thead>
                  <tr style={trh}>
                    <th style={{ ...th, width: 84 }}>{m.risks.columns[0]}</th>
                    <th style={th}>{m.risks.columns[1]}</th>
                    <th style={{ ...th, width: 150 }}>{m.risks.columns[2]}</th>
                  </tr>
                </thead>
                <tbody>
                  {m.risks.rows.map((r, i) => (
                    <tr key={i} style={tr}>
                      <td style={td}><Chip s={SEV[r.severity]} /></td>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{r.risk}</div>
                        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginTop: 3 }}>{r.detail}</div>
                        {/* Printed in the same amber-cite style as the CS3D qualification below,
                            so a conditioned finding survives a greyscale print as text rather
                            than as a colour a reader has to interpret. */}
                        {r.condition !== null && (
                          <p style={{ ...cite, fontStyle: 'normal', color: 'var(--color-state-warn)' }}>{r.condition}</p>
                        )}
                        {r.cs3dLine && (
                          <p style={{ ...cite, fontStyle: 'normal', color: 'var(--color-state-warn)' }}><RichText parts={r.cs3dLine} /></p>
                        )}
                      </td>
                      <td style={td}>{r.framework}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>

        {/* 6 ── COMPLIANCE COST ESTIMATE */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>{m.cost.title}</H>
          <p style={note}>{m.cost.intro}</p>
          <div className="print-stack" style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div className="print-keep" style={{ flex: '1.6 1 300px', border: '1px solid #0d0d0d', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 6 }}>{m.cost.consultant.label}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.85rem', fontWeight: 400, lineHeight: 1.15 }}>{m.cost.consultant.figure}</div>
              <div style={{ fontSize: 11, color: '#555553', marginTop: 6, lineHeight: 1.6 }}>{m.cost.consultant.note}</div>
            </div>
            <div className="print-keep" style={{ flex: '1 1 220px', border: '1px solid #e8e7e4', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 6 }}>{m.cost.themisIq.label}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, lineHeight: 1.15, color: '#555553' }}>{m.cost.themisIq.figure}</div>
              <div style={{ fontSize: 11, color: '#555553', marginTop: 6, lineHeight: 1.6 }}>{m.cost.themisIq.note}</div>
            </div>
          </div>
          <p style={{ ...note, fontSize: 11, color: 'var(--color-ink-muted)' }}><RichText parts={m.cost.disclosure} /></p>

          <table style={tbl}>
            <ObligationHead columns={m.cost.included.columns} />
            <tbody>
              {m.cost.included.rows.map((o, i) => (
                <tr key={i} style={tr}>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{o.label}</div>
                    {o.scopeNote && <p style={cite}>{o.scopeNote}</p>}
                  </td>
                  <td style={td}>{o.themisIq}</td>
                  <td style={td}>{o.consultant}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={tbl}>
            <ObligationHead columns={m.cost.recommended.columns} />
            <tbody>
              {m.cost.recommended.rows.map((o, i) => (
                <tr key={i} style={tr}>
                  <td style={td}>{o.label}</td>
                  <td style={td}>{o.themisIq}</td>
                  <td style={td}>{o.consultant}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {m.cost.flagged.rows.length > 0 && (
            <table style={tbl}>
              <ObligationHead columns={m.cost.flagged.columns} />
              <tbody>
                {m.cost.flagged.rows.map((o, i) => (
                  <tr key={i} style={tr}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{o.label}</div>
                      {o.scopeNote && <p style={cite}>{o.scopeNote}</p>}
                    </td>
                    <td style={td}>{o.themisIq}</td>
                    <td style={td}>{o.consultant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={note}>{m.cost.scopeNote}</p>

          {m.cost.exposure && <p style={note}><RichText parts={m.cost.exposure} /></p>}
        </section>

        {/* 7 ── DATA-ROOM GAPS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>{m.dataRoom.title}</H>
          <table style={tbl}>
            <thead>
              <tr style={trh}>
                <th style={th}>{m.dataRoom.columns[0]}</th>
                <th style={{ ...th, width: 250 }}>{m.dataRoom.columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {m.dataRoom.rows.map(r => (
                <tr key={r.item} style={tr}>
                  <td style={td}>{r.item}</td>
                  <td style={{ ...td, fontWeight: 500, color: r.available ? '#0F6E56' : '#B91C1C' }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* 8 ── FX BASIS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>{m.fx.title}</H>
          {m.fx.paras.map((para, i) => <p key={i} style={note}><RichText parts={para} /></p>)}
          <table style={tbl}>
            <tbody>
              {m.fx.rows.map(([k, v], i) => (
                <tr key={i} style={tr}>
                  <td style={i === 0 ? { ...td, width: 210, color: 'var(--color-ink-muted)' } : { ...td, color: 'var(--color-ink-muted)' }}>{k}</td>
                  <td style={td}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {m.fx.sameCurrencyNote && <p style={note}>{m.fx.sameCurrencyNote}</p>}
        </section>

        {/* 9 ── IMPORTANT NOTICE */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>{m.notice.title}</H>
          {m.notice.paras.map((para, i) => (
            <p key={'disc' + i} style={{ ...p, fontSize: 11, color: 'var(--color-ink-muted)' }}>{para}</p>
          ))}
        </section>
        {/* ── UPSELL — SCREEN ONLY, AND ONLY WHERE THERE IS SOMETHING TO SELL ────────────────────
            `.no-print`, deliberately. This document is printed and sent to counterparties, deal
            teams and investment committees; a "buy ThemisIQ" panel inside a saved PDF would travel
            with it into rooms it was never meant for, and would sit under the Important Notice it
            has nothing to do with. On screen it is the last thing the reader passes.

            IT DOES NOT WEAKEN THE REPORT. Everything above is unchanged and complete for a free
            reader — that is what the free tier exists to demonstrate. This is appended after the
            document ends, not carved out of it.

            RENDERS FOR NOBODY WHO IS ENTITLED, and for nobody whose entitlement could not be read:
            resolveReportGate collapses both to 'none'. The two remaining branches are the same
            populations enforce_deals_free_tier_cap() distinguishes in its two RAISE EXCEPTION
            messages — telling a lapsed customer to "unlock" invites them to buy what they own.
            Link target matches the existing PaywallCard rather than /order, so the two commercial
            routes out of this module agree. */}
        {upsell !== 'none' && (
          <div className="no-print" style={{ marginTop: 40, background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>Deals &amp; Investment</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', fontWeight: 400, color: '#fff', marginBottom: 10 }}>
              {upsell === 'expired'
                ? 'Your Deals access has expired.'
                : 'That was your free target.'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6, maxWidth: 520, margin: '0 auto 20px' }}>
              {/* ⚠️ THE PRICE IS INTERPOLATED, NOT WRITTEN. lib/pricing.ts is the single source of
                  truth and cartQuote() charges from the same table, so a hardcoded '$4,900' here
                  would go stale silently the day Deals is repriced — quoting a customer one figure
                  in the upsell and charging another at checkout. Formatted with
                  toLocaleString('en-US') to match app/deals/page.tsx, so every surface renders the
                  number identically. Reads $4,900 today, which is what the approved copy says. */}
              {upsell === 'expired'
                ? 'Your saved targets and their reports are still here, and you can still work on them. Renewing lets you screen new ones again.'
                : `This report stays available. Screening further targets is $${FLAT_MODULE_PRICES['deals'].toLocaleString('en-US')} USD a year: unlimited targets, saved to one pipeline you can export as a single spreadsheet, plus the link you hand a target to make disclosure a condition of proceeding.`}
            </div>
            <a href="/pricing?modules=deals" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              See Deals pricing →
            </a>
          </div>
        )}

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '0.5px solid #e8e7e4', fontSize: 11, color: 'var(--color-ink-muted)', textAlign: 'center', lineHeight: 1.7 }}>
          {m.footer.line}
          <br />
          {m.footer.note}
        </div>
      </div>

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .report-body { padding: 0 !important; max-width: none !important; }
          body { background: white !important; }
          /* BREAK PROTECTION ONLY ON THINGS A FEW LINES TALL. An unbreakable box that cannot fit
             the space left on a page is pushed whole, and one taller than a page is clipped.
             Safari (29 Sep 2026) rendered pages 1 to 3, ending on the amber two-year panels, then
             blank pages; its saved PDF was blank throughout. The rule that kept every direct child
             of a section whole was removed for that: it froze paragraphs and wrappers of any height,
             and needed an exemption list to stop it freezing tables. Everything now flows by
             default, and avoid is named per element: rows, headings, the amber callouts. */
          .page { page-break-inside: auto; break-inside: auto; }
          h2 { page-break-inside: avoid; break-inside: avoid; page-break-after: avoid; break-after: avoid; }
          .page tr { page-break-inside: avoid; break-inside: avoid; }
          .page thead { display: table-header-group; }   /* repeat the header on each page */
          /* NotAssessed panels carry className "page", so inside a section they are .page .page. */
          .page .page { page-break-inside: avoid; break-inside: avoid; }
          section.page { margin-top: 24px !important; }
          /* STACKED IN PRINT, BY CLASS. Fragmenting a flex row is where print engines diverge most,
             so a container marked print-stack prints as a block and its children stack; a child
             marked print-keep stays whole. Today that is the cost row (:691) and its two cards.
             The cover's Row is NOT marked: a label and a short value side by side cannot outgrow a
             page. Classes, not a match on inline style text: that match also caught the .no-print
             toolbar and, being more specific than .no-print, printed it. */
          .print-stack { display: block !important; }
          .print-keep { page-break-inside: avoid; break-inside: avoid; margin-bottom: 12px; }
        }
        /* No size: the paper chosen in the print dialog applies (US Letter or A4). */
        @page { margin: 1.6cm 1.6cm 2cm; }
      `}</style>
    </div>
  )
}
