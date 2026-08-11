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
import { useEntitlementState } from '../../../../lib/useEntitlement'
import { useReportTitle, reportTitle } from '../../../../lib/useReportTitle'
import { filenameDate } from '../../../../lib/filename'
import PaywallCard from '../../../components/PaywallCard'
import { DISCLAIMER_PARAS } from '../../../../lib/disclaimer'
import {
  getFrameworkApplicability, getObligations, getComplianceCost, SECTOR_RISKS,
  assessmentView, isRevenueDeclared, notAssessedNote as notAssessedNoteOf, partiallyAssessedNote,
  routeNotMetNote, partialHeadingPhrase,
  nearThresholdNoneNote, obligationPriceLabel, resolveFieldsPrompt,
  FX_SOURCE, FX_AS_OF, THRESHOLD_TESTS, isTestActive,
  type FrameworkApplicability, type SectorRisk,
} from '../../../../lib/deals/assessment'
import {
  dealTypeLabel, spellMagnitude, NEAR_PCT, nearSentence,
  buildLimbRows, buildFxBasisRows, limbValueDisplay, limbThresholdDisplay,
  resolveCs3d, makeMapFramework, regimeLabel, themisIqFigure,
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
  has_ghg_data: boolean | null
  has_esg_report: boolean | null
  created_at: string
}

// ─── Styled bits (print-friendly) ─────────────────────────────────────────────
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const SEV = {
  critical: { label: 'CRITICAL', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  high:     { label: 'HIGH', color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  medium:   { label: 'MEDIUM', color: '#0C447C', bg: '#E6F1FB', border: '#0C447C' },
} as const

// Status colours carry a TEXT label too, never colour alone — the three-state distinction
// (applies / not applicable / not assessed) is the point of this module and must survive a
// greyscale print.
const STATE = {
  applies:      { label: 'APPLIES', color: '#0F6E56', bg: '#E1F5EE', border: 'rgba(15,110,86,0.35)' },
  verify:       { label: 'APPLIES — VERIFY', color: '#ba7517', bg: '#FEF3E2', border: 'rgba(186,117,23,0.35)' },
  nearBelow:    { label: 'NEAR THRESHOLD — VERIFY', color: '#ba7517', bg: '#FEF3E2', border: 'rgba(186,117,23,0.35)' },
  notAssessed:  { label: 'NOT ASSESSED', color: '#ba7517', bg: '#FEF3E2', border: 'rgba(186,117,23,0.35)' },
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
  // State form, not the bare boolean: `isPaid` starts false, so the paywall below rendered for
  // every paying customer before the entitlement resolved. Ordering matters too — see the guard.
  const { isPaid, loading: entLoading } = useEntitlementState('deals')
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
          return
        }

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
      }
    })()
  }, [id])

  // ONE generation instant, fixed at mount. The document is derived rather than stored, so the date
  // it carries is the date it was generated — and it says on the cover and in the footer that a
  // report generated on another date may differ. The filename therefore has to carry that date too,
  // or it contradicts the document it names.
  //
  // Held in state, not recomputed per render: two `new Date()` calls are two instants, and the whole
  // point is that the footer and the filename cannot disagree. Both strings below derive from this.
  const [generatedAt] = useState(() => new Date())
  const reportDate = generatedAt.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  // Names the saved PDF. Null until the deal has loaded, so no title is built from an absent name.
  useReportTitle(deal
    ? reportTitle(deal.target_name, `ESG Diligence Report - ${filenameDate(generatedAt)}`)
    : null)

  // FIRST, because it is knowable without any fetch. It also has to precede the loading guard
  // below: the effect returns early on a missing id, so the free-tier scope never resolves in that
  // case and the page would wait forever on a fact it was never going to be told.
  if (!id) return <Centered>No deal id provided.</Centered>

  // BEFORE the paywall, and covering BOTH facts. An unresolved entitlement is not a refusal, and
  // nor is an unresolved free-tier scope. This page is printed, so a paywall flashing into a print
  // preview is worse than on screen. Reuses the page's own waiting state so no new one appears.
  if (entLoading || freeTier.state === 'loading') return <Centered>Loading report…</Centered>

  // THE FREE DEAL OPENS ITS REPORT. Gating the whole report on `isPaid` meant a free deal could be
  // screened end to end and then produced nothing to take away, which is the thing the free tier
  // exists to demonstrate.
  //
  // Identity, not count: the reader may open THIS deal because it is the one their free tier
  // covers, not because they happen to have exactly one. That also settles the lapsed case — an
  // entitled user who saved several and then lapsed keeps the most recently worked on.
  //
  // A deal that is not theirs cannot satisfy this, because `newestOwnDealId` is selected under the
  // owner filter AND under RLS, so a foreign id can never equal it — the unentitled reader gets the
  // paywall, and the row itself was never readable in the first place.
  const freeDealAllowed = freeTier.state === 'resolved' && freeTier.newestOwnDealId !== null && freeTier.newestOwnDealId === id
  if (!isPaid && !freeDealAllowed) return <PaywallCard />

  if (loading) return <Centered>Loading report…</Centered>
  if (error) return <Centered>{error}</Centered>
  if (!deal) return <Centered>No deal data.</Centered>

  // A reference for THIS DOCUMENT, not for the deal record. The deal id alone names a row that
  // outlives any one report: because this report is derived at generation, the same id names a
  // different document tomorrow. Pairing the id prefix with the generation date makes the reference
  // identify what the reader is holding. Eight characters matches the climate-risk and materiality
  // reports; the date comes from the same instant as the footer date and the PDF filename.
  const reference = `${String(deal.id).slice(0, 8)}-${filenameDate(generatedAt)}`
  return <DealReport deal={deal} reportDate={reportDate} reference={reference} />
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
      <div style={{ minWidth: 190, color: '#888784' }}>{k}</div>
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
    <div className="page" style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.25)', borderRadius: 8, padding: '12px 14px', margin: '0 0 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#ba7517', marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12, lineHeight: 1.7, color: '#555553' }}>{children}</div>
    </div>
  )
}

// ─── The report ───────────────────────────────────────────────────────────────
function DealReport({ deal, reportDate, reference }: { deal: DealRow; reportDate: string; reference: string }) {
  const sector = deal.sector ?? ''
  const jurisdiction = deal.jurisdiction ?? ''
  const currency = deal.currency ?? 'USD'
  const revenue = Number(deal.revenue) || 0
  const dealValue = Number(deal.deal_value) || 0
  const locationCount = Number(deal.location_count) || 0

  // The same gate the wizard uses: revenue is NOT part of it. Only two frameworks consult
  // revenue; the rest resolve from jurisdiction and sector alone, and withholding them because
  // revenue is blank would render an undeclared field as "no frameworks apply".
  const evaluated = !!(sector && jurisdiction)
  const applicability: FrameworkApplicability[] = evaluated
    ? getFrameworkApplicability(jurisdiction, revenue, sector, deal.deal_type ?? 'ma', currency,
        { total_assets: deal.total_assets ?? null, employee_count: deal.employee_count ?? null })
    : []

  // The flat legal in/out. Derived from `applicability` rather than by a second engine call — a
  // test in assessment.test.ts pins these two as equal, so this cannot drift from the wizard.
  const frameworks = applicability.filter(f => f.applies).map(f => f.framework)

  const view = assessmentView(evaluated, applicability)
  const revenueDeclared = isRevenueDeclared(revenue)
  const nearThreshold = applicability.filter(f => f.status === 'near-threshold')
  const nearByFramework = new Map(nearThreshold.map(f => [f.framework, f]))
  const nearBelow = nearThreshold.filter(f => !f.applies)
  // The UNEVALUATED population, not the union: this note says "size test incomplete", which is false
  // of a routeNotMet row (its test completed). Its render gate — view.nearThreshold — already means
  // "a limb went unevaluated", so passing the union let the names and the claim describe different rows.
  const notAssessedNote = notAssessedNoteOf(
    view.unevaluated.length ? view.unevaluated : undefined,
    view.fieldsToResolve,
  )

  const limbRows = buildLimbRows(applicability)
  const fxBasisRows = buildFxBasisRows(currency, applicability)
  // `cs3d` supplies the REASON printed beneath a finding; the ROW supplies the token's text and
  // caveat flag, which the three-state summary cannot express (it has no 'near-threshold').
  const cs3d = resolveCs3d(frameworks, applicability)
  // Narrowed HERE, not in the render gate: only the 'conditional' variant carries a reason, and the
  // gate is now `qualified` on the token. Reading `.reason` at the render site would put the state
  // check back in the gate and imply it decides whether the line prints, which it does not.
  const cs3dReason = cs3d.state === 'conditional' ? cs3d.reason : null
  const cs3dRow = applicability.find(f => f.framework === 'CS3D')
  const mapFramework = makeMapFramework(frameworks, cs3dRow)

  const risks: SectorRisk[] = SECTOR_RISKS[sector] || []
  const obligations = getObligations(locationCount, frameworks, sector)
  const complianceCost = dealValue > 0 ? getComplianceCost(dealValue, sector, frameworks) : null
  // In a printed document "Enter locations →" would instruct a reader who has nothing to click.
  const themisIq = themisIqFigure(obligations, 'Custom quote — location count not provided')

  const consultantRange = `USD ${Math.round(obligations.consultantLow / 1000)}k–${Math.round(obligations.consultantHigh / 1000)}k`
  const activeTests = Object.values(THRESHOLD_TESTS).filter(isTestActive)
  // A statutory citation belongs with the framework it justifies, not in a footnote pile.
  const citationFor = (fw: string) => (isTestActive(THRESHOLD_TESTS[fw]) ? THRESHOLD_TESTS[fw].citation : null)

  return (
    <div className="report-root" style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#0d0d0d' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, background: '#0d0d0d', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        {/* In the .no-print bar deliberately — the print rule below hides this whole bar, so the
            link never reaches the saved PDF. White on black, not the usual purple, which would be
            unreadable here. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <a href="/dashboard/deals/list" style={{ fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>← Your targets</a>
          {/* Back to the deal this report was built from — the likely next step after reading it is
              correcting a figure, not browsing the whole list. No arrow: this is a move sideways to
              the same target, not up to the collection. Same weight as its neighbour so neither
              competes with Save as PDF, which is still the main control on this bar.
              Uses deal.id — the row this report was actually built from — rather than the URL
              param, which is not in scope in this component. */}
          <a href={`/dashboard/deals?id=${deal.id}`} style={{ fontSize: 13, fontWeight: 600, color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' }}>Edit this deal</a>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>ThemisIQ · ESG deal due diligence report</div>
        </div>
        <button onClick={() => window.print()} style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>⬇ Save as PDF (Cmd+P)</button>
      </div>

      <div className="report-body" style={{ maxWidth: 780, margin: '0 auto', padding: '3rem 3rem 4rem' }}>

        {/* 1 ── COVER */}
        <section className="page">
          <div style={{ height: 6, background: GRAD, marginBottom: 32, borderRadius: 2 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 12 }}>Prepared by ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px' }}>ESG Deal Due Diligence Report</h1>
          <p style={{ fontSize: 15, color: '#555553', marginBottom: 36, lineHeight: 1.6 }}>
            Sustainability-regulation screening of {deal.target_name || 'the target company'} for deal, investment-committee and LP reporting: which disclosure regimes reach the target, which statutory size tests were applied, and what compliance is estimated to cost.
          </p>
          <div style={{ borderTop: '1px solid #e8e7e4', borderBottom: '1px solid #e8e7e4', padding: '20px 0', marginBottom: 16 }}>
            <Row k="Target company" v={deal.target_name || 'Not specified'} />
            <Row k="Sector" v={sector || 'Not specified'} />
            <Row k="Jurisdiction" v={jurisdiction || 'Not specified'} />
            <Row k="Deal type" v={dealTypeLabel(deal.deal_type ?? '')} />
            {/* "USD 0" would assert a revenue figure we were never given. Say what is true instead.
                The magnitude is spelled out so a 1000x entry error is legible in the document. */}
            <Row k="Target annual revenue" v={revenueDeclared ? `${currency} ${revenue.toLocaleString()} (${spellMagnitude(revenue)})` : 'Not provided'} />
            {/* Spelled out for the same reason as revenue: it is typically the larger figure and
                carries the same 1000x entry risk, which is otherwise invisible in a bare numeral. */}
            <Row k="Deal / investment value" v={dealValue > 0 ? `${currency} ${dealValue.toLocaleString()} (${spellMagnitude(dealValue)})` : 'Not provided'} />
            <Row k="Locations / sites" v={locationCount > 0 ? String(locationCount) : 'Not provided'} />
            <Row k="Report generated" v={reportDate} />
          </div>
          <div style={{ ...note, background: '#f8f7f5', borderRadius: 8, padding: '10px 12px' }}>
            <strong style={{ fontWeight: 600 }}>This report is derived, not stored.</strong> Every finding below is computed at the moment of generation from the deal record as it stood on {reportDate}. It is not a snapshot of a past assessment: if the deal record changes, a report generated afterwards will differ.
          </div>
        </section>

        {/* 2 ── APPLICABLE FRAMEWORKS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>Applicable frameworks</H>
          {!evaluated ? (
            <NotAssessed title="NOT ASSESSED">
              Sector and jurisdiction are not both set on this deal, so nothing has been evaluated. An empty list here is <strong style={{ fontWeight: 600 }}>not</strong> a finding that no framework applies.
            </NotAssessed>
          ) : view.frameworks === 'assessed-none' ? (
            <p style={p}>None — no framework was triggered for this jurisdiction, sector and size.</p>
          ) : (
            <>
              <p style={note}>Determined from the target&rsquo;s jurisdiction, sector and — where a statute imposes one — its statutory size test. A framework listed here applies on the figures provided.</p>
              <table style={tbl}>
                <thead>
                  <tr style={trh}>
                    <th style={th}>Framework</th>
                    <th style={{ ...th, width: 170 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {frameworks.map(fw => {
                    const near = nearByFramework.get(fw)
                    const citation = citationFor(fw)
                    return (
                      <tr key={fw} style={tr}>
                        <td style={td}>
                          <div style={{ fontWeight: 500 }}>{fw}</div>
                          {citation && <p style={cite}>{citation}</p>}
                          {near && <p style={{ ...cite, fontStyle: 'normal', color: '#ba7517' }}>{nearSentence(near)}</p>}
                        </td>
                        <td style={td}><Chip s={near ? STATE.verify : STATE.applies} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* Partial assessment: the list above stands, but naming what was withheld stops a
                  reader inferring that the missing statutes were considered and excluded. */}
              {view.notAssessed.length > 0 && (
                <NotAssessed title={`PARTIAL — ${view.notAssessed.join(', ')} ${partialHeadingPhrase(view)}`}>
                  {/* Title keeps the UNION — "was anything withheld" is the only claim it makes, and
                      it must name everything. The BODY explains WHY, which differs per population and
                      cannot be said of both: one had a limb it could not settle, the other was fully
                      evaluated and fell outside the modelled route. Only one is non-empty today. */}
                  {view.unevaluated.length > 0 && partiallyAssessedNote(view.unevaluated, view.fieldsToResolve)}
                  {view.routeNotMet.length > 0 && routeNotMetNote(view.routeNotMet)}
                </NotAssessed>
              )}
            </>
          )}
        </section>

        {/* 3 ── NEAR-THRESHOLD FRAMEWORKS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>Near-threshold frameworks</H>
          <p style={note}>
            Raised only where a <strong style={{ fontWeight: 600 }}>marginal limb is decisive</strong> for the outcome — a limb within {NEAR_PCT} of its figure that, if it moved, would change whether the test is met. The legal answer is unchanged: a framework that applies still applies, and one that does not still does not.
          </p>
          {view.nearThreshold === 'not-assessed' ? (
            <NotAssessed title="NEAR-THRESHOLD — NOT ASSESSED">{notAssessedNote}</NotAssessed>
          ) : view.nearThreshold === 'assessed-none' ? (
            <p style={p}>{nearThresholdNoneNote()}</p>
          ) : (
            <table style={tbl}>
              <thead>
                <tr style={trh}>
                  <th style={th}>Framework</th>
                  <th style={th}>Limbs met</th>
                  <th style={th}>Decisive limb</th>
                  <th style={th}>Value applied</th>
                  <th style={th}>Threshold</th>
                  <th style={{ ...th, width: 74 }}>Side</th>
                </tr>
              </thead>
              <tbody>
                {nearThreshold.map(f => {
                  const dec = f.test?.limbs.filter(l => l.near && l.state !== 'not-assessed') ?? []
                  return (
                    <tr key={f.framework} style={tr}>
                      <td style={td}>
                        <div style={{ fontWeight: 500 }}>{f.framework}</div>
                        <div style={{ marginTop: 4 }}><Chip s={f.applies ? STATE.verify : STATE.nearBelow} /></div>
                      </td>
                      <td style={td}>{f.test ? `${f.test.metCount} of ${f.test.requires}` : '—'}</td>
                      <td style={td}>{dec.map(l => l.limb.measure.replace(/_/g, ' ')).join('; ')}</td>
                      <td style={td}>{dec.map(limbValueDisplay).join('; ')}</td>
                      <td style={td}>{dec.map(limbThresholdDisplay).join('; ')}</td>
                      <td style={td}>{f.side === 'above' ? 'Above' : 'Below'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {/* Near-but-below never reaches the applicable list (it does not apply), so it is stated
              here or the reader never learns the target sits just under a trigger. */}
          {nearBelow.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {nearBelow.map(f => (
                <p key={f.framework} style={{ ...note, color: '#ba7517' }}>
                  <strong style={{ fontWeight: 600 }}>{f.framework}:</strong> {nearSentence(f)}
                </p>
              ))}
            </div>
          )}
        </section>

        {/* 4 ── THRESHOLD LIMBS APPLIED */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>Threshold limbs applied</H>
          {limbRows.length === 0 ? (
            <p style={p}>No size-gated framework is in scope for this jurisdiction.</p>
          ) : (
            <>
              <p style={note}>
                Every limb of every statutory size test that was run, with the measure it applied. A result without its measure asserts nothing a reviewer can check. Where the figure collected stands in for a differently-defined statutory measure it is marked <strong style={{ fontWeight: 600 }}>PROXY</strong>.
              </p>
              <table style={tbl}>
                <thead>
                  <tr style={trh}>
                    <th style={th}>Framework</th>
                    <th style={th}>Limb</th>
                    <th style={th}>Measure required</th>
                    <th style={th}>Value applied</th>
                    <th style={th}>Threshold</th>
                    <th style={{ ...th, width: 96 }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {limbRows.map((r, i) => (
                    <tr key={i} style={tr}>
                      <td style={td}>{r.framework}</td>
                      <td style={td}>{r.measure}</td>
                      <td style={td}>
                        {r.basis}
                        <p style={cite}>{r.basisOfValue}</p>
                      </td>
                      <td style={td}>{r.valueApplied}</td>
                      <td style={td}>{r.threshold}</td>
                      <td style={{ ...td, fontWeight: 600, color: r.state === 'met' ? '#0F6E56' : r.state === 'not-assessed' ? '#ba7517' : '#555553' }}>{r.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {activeTests.filter(t => !t.lookbackModelled).map(t => (
                <NotAssessed key={t.framework} title={`LOOKBACK NOT MODELLED — ${t.framework}`}>
                  The statute measures over {t.lookback === 'either-of-two-most-recent-fy' ? 'either of the two most recent financial years' : 'the most recent financial year'}; only the most recent year is held. A target that met a limb in the prior year and has since dipped is <strong style={{ fontWeight: 600 }}>under-called</strong> — such a target surfaces above as a marginal below-side limb.
                </NotAssessed>
              ))}
            </>
          )}
        </section>

        {/* 5 ── ESG RISK FINDINGS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>ESG risk findings</H>
          {risks.length === 0 ? (
            <p style={p}>{sector ? 'No sector-specific ESG risk template is held for this sector.' : 'No sector is set on this deal, so no sector risk findings were produced.'}</p>
          ) : (
            <>
              <p style={note}>Sector-specific risks for {sector}. The framework named on each finding resolves against the frameworks actually detected above, so a finding can never cite a statute this report withheld.</p>
              {/* UNEVALUATED only. A routeNotMet framework was fully evaluated AND still appears in the
                  labels below (its token is emitted, qualified), so both of this banner's claims would
                  be false of it. Silence on a routeNotMet-only deal is correct: nothing vanished from
                  the Framework column, and the PARTIAL panel above still names what is unresolved. */}
              {view.unevaluated.length > 0 && (
                <NotAssessed title="FRAMEWORK COLUMN PARTIALLY RESOLVED">
                  The {view.unevaluated.join(' / ')} size test could not be completed, so {view.unevaluated.length === 1 ? 'it does' : 'they do'} not appear in any label below. {resolveFieldsPrompt(view.fieldsToResolve, view.unevaluated)}
                </NotAssessed>
              )}
              <table style={tbl}>
                <thead>
                  <tr style={trh}>
                    <th style={{ ...th, width: 84 }}>Severity</th>
                    <th style={th}>Risk</th>
                    <th style={{ ...th, width: 150 }}>Framework</th>
                  </tr>
                </thead>
                <tbody>
                  {risks.map((r, i) => {
                    const tokens = mapFramework(r.framework)
                    const cfg = SEV[r.severity]
                    return (
                      <tr key={i} style={tr}>
                        <td style={td}><Chip s={cfg} /></td>
                        <td style={td}>
                          <div style={{ fontWeight: 500 }}>{r.risk}</div>
                          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginTop: 3 }}>{r.detail}</div>
                          {tokens.some(t => t.framework === 'CS3D' && t.qualified) && (
                            <p style={{ ...cite, fontStyle: 'normal', color: '#ba7517' }}><strong style={{ fontWeight: 600 }}>CS3D not assessed:</strong> {cs3dReason}.</p>
                          )}
                        </td>
                        <td style={td}>{regimeLabel(tokens)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </>
          )}
        </section>

        {/* 6 ── COMPLIANCE COST ESTIMATE */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>Compliance cost estimate</H>
          {/* The analyst's question is what remediation costs and whether it moves the model — a
              diligence finding. Leading with ThemisIQ's own price made a finding read as a quote,
              so the market reference comes first and larger, and the ThemisIQ figure follows as one
              route rather than the headline. */}
          <p style={note}>
            An estimate of what it would cost to bring {deal.target_name || 'the target'} into compliance with the regimes identified above, given as a market reference range with one priced alternative. Both figures are first-year, in USD, and neither is a quotation.
          </p>
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div style={{ flex: '1.6 1 300px', border: '1px solid #0d0d0d', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 6 }}>Traditional consultant — first year</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.85rem', fontWeight: 400, lineHeight: 1.15 }}>{consultantRange}</div>
              <div style={{ fontSize: 11, color: '#555553', marginTop: 6, lineHeight: 1.6 }}>Indicative market range, scaled per obligation for this target&rsquo;s sector and site count.</div>
            </div>
            <div style={{ flex: '1 1 220px', border: '1px solid #e8e7e4', borderRadius: 10, padding: '16px 18px' }}>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 6 }}>ThemisIQ — scope-matched modules</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, lineHeight: 1.15, color: '#555553' }}>{themisIq}</div>
              <div style={{ fontSize: 11, color: '#555553', marginTop: 6, lineHeight: 1.6 }}>One available route, priced for the modules this scope requires.</div>
            </div>
          </div>
          {/* Inferable from the cover, but stating it where the price appears makes the report
              harder to fault. The consultant figures are benchmarks, NOT citations — the source
              note on CONSULTANT_RANGES says "Indicative benchmarks, not quotes", so this must not
              claim they were cited or obtained. */}
          <p style={{ ...note, fontSize: 11, color: '#888784' }}>
            <strong style={{ fontWeight: 600 }}>Disclosure:</strong> ThemisIQ Compliance Inc. prepared this report and also supplies the software priced in the second figure. The consultant range is an indicative benchmark drawn from market analysis, not a quotation obtained from any firm.
          </p>

          <table style={tbl}>
            <thead>
              <tr style={trh}>
                <th style={th}>Included obligation</th>
                <th style={{ ...th, width: 190 }}>ThemisIQ</th>
                <th style={{ ...th, width: 140 }}>Consultant (reference)</th>
              </tr>
            </thead>
            <tbody>
              {obligations.included.map((o, i) => (
                <tr key={i} style={tr}>
                  <td style={td}>
                    <div style={{ fontWeight: 500 }}>{o.label}</div>
                    {o.scopeNote && <p style={cite}>{o.scopeNote}</p>}
                  </td>
                  <td style={td}>{obligationPriceLabel(o.pricing)}</td>
                  <td style={td}>USD {Math.round(o.consultantLow / 1000)}k–{Math.round(o.consultantHigh / 1000)}k</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={tbl}>
            <thead>
              <tr style={trh}>
                <th style={th}>Also recommended — not in the ThemisIQ total</th>
                <th style={{ ...th, width: 190 }}>ThemisIQ</th>
                <th style={{ ...th, width: 140 }}>Consultant (reference)</th>
              </tr>
            </thead>
            <tbody>
              {obligations.recommended.map((o, i) => (
                <tr key={i} style={tr}>
                  <td style={td}>{o.label}</td>
                  <td style={td}>{obligationPriceLabel(o.pricing)}</td>
                  <td style={td}>USD {Math.round(o.consultantLow / 1000)}k–{Math.round(o.consultantHigh / 1000)}k</td>
                </tr>
              ))}
            </tbody>
          </table>

          {obligations.flagged.length > 0 && (
            <table style={tbl}>
              <thead>
                <tr style={trh}>
                  <th style={th}>Flagged — separate specialist, in neither total</th>
                  <th style={{ ...th, width: 190 }}>ThemisIQ</th>
                  <th style={{ ...th, width: 140 }}>Consultant (reference)</th>
                </tr>
              </thead>
              <tbody>
                {obligations.flagged.map((o, i) => (
                  <tr key={i} style={tr}>
                    <td style={td}>
                      <div style={{ fontWeight: 500 }}>{o.label}</div>
                      {o.scopeNote && <p style={cite}>{o.scopeNote}</p>}
                    </td>
                    <td style={td}>{obligationPriceLabel(o.pricing)}</td>
                    <td style={td}>Not included</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* The cost table is driven by the APPLIES-filtered framework list, so a regime that
              abstains prices nothing. Stated here because the omission is otherwise invisible: the
              reader sees a total, not the module that is missing from it. */}
          <p style={note}>
            This estimate covers only the regimes established as applying above. Where a framework is shown as not assessed, no module is priced for it.
          </p>

          {complianceCost && (
            <p style={note}>
              <strong style={{ fontWeight: 600 }}>ESG value-at-risk exposure:</strong> approximately {(complianceCost.pctLow * 100).toFixed(2)}%–{(complianceCost.pctHigh * 100).toFixed(2)}% of deal value ({currency} {Math.round(complianceCost.low).toLocaleString()}–{Math.round(complianceCost.high).toLocaleString()}) carries ESG-related risk to assess. This is an indicative exposure, not a cost, and requires specialist confirmation.
            </p>
          )}
        </section>

        {/* 7 ── DATA-ROOM GAPS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>Data-room gaps</H>
          <table style={tbl}>
            <thead>
              <tr style={trh}>
                <th style={th}>Item</th>
                <th style={{ ...th, width: 250 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr style={tr}>
                <td style={td}>GHG inventory / emissions data</td>
                <td style={{ ...td, fontWeight: 500, color: deal.has_ghg_data ? '#0F6E56' : '#B91C1C' }}>{deal.has_ghg_data ? 'Available' : 'MISSING — request from target'}</td>
              </tr>
              <tr style={tr}>
                <td style={td}>ESG report or sustainability disclosure</td>
                <td style={{ ...td, fontWeight: 500, color: deal.has_esg_report ? '#0F6E56' : '#B91C1C' }}>{deal.has_esg_report ? 'Available' : 'MISSING — request from target'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 8 ── FX BASIS */}
        <section className="page" style={{ marginTop: 40 }}>
          <H>FX basis for threshold tests</H>
          <p style={note}>
            Revenue and balance-sheet figures are converted into each threshold&rsquo;s statutory currency for comparison. <strong style={{ fontWeight: 600 }}>The statutory figure itself is never converted</strong>, so every citation above can be checked against the legislation verbatim.
          </p>
          <p style={note}>
            Rates marked <strong style={{ fontWeight: 600 }}>transcribed</strong> are copied verbatim from the source document and can be checked against it digit for digit. Rates marked <strong style={{ fontWeight: 600 }}>DERIVED</strong> are computed by ThemisIQ from those figures and appear nowhere in the source.
          </p>
          <table style={tbl}>
            <tbody>
              <tr style={tr}>
                <td style={{ ...td, width: 210, color: '#888784' }}>Rate source</td>
                <td style={td}>{FX_SOURCE}</td>
              </tr>
              <tr style={tr}>
                <td style={{ ...td, color: '#888784' }}>Rates as of</td>
                <td style={td}>{FX_AS_OF}</td>
              </tr>
              <tr style={tr}>
                <td style={{ ...td, color: '#888784' }}>Deal currency</td>
                <td style={td}>{currency}</td>
              </tr>
              {fxBasisRows.map((r, i) => (
                <tr key={i} style={tr}>
                  <td style={{ ...td, color: '#888784' }}>{r[0]}</td>
                  <td style={td}>{r[1]}</td>
                </tr>
              ))}
              <tr style={tr}>
                <td style={{ ...td, color: '#888784' }}>Size tests available</td>
                <td style={td}>{activeTests.map(t => `${t.framework} (${t.requires} of ${t.limbs.length})`).join(' · ') || 'None'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 9 ── IMPORTANT NOTICE */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Important Notice</H>
          {DISCLAIMER_PARAS.map((para, i) => (
            <p key={'disc' + i} style={{ ...p, fontSize: 11, color: '#888784' }}>{para}</p>
          ))}
        </section>

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '0.5px solid #e8e7e4', fontSize: 11, color: '#888784', textAlign: 'center', lineHeight: 1.7 }}>
          ThemisIQ Compliance Inc. · www.themisiq.co · Reference {reference} · Generated {reportDate}
          <br />
          This assessment reflects the figures held for this deal on {reportDate}. It is derived at generation, not stored — a report generated on another date may differ.
        </div>
      </div>

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .report-body { padding: 0 !important; max-width: none !important; }
          body { background: white !important; }
          /* Avoid breaking short sections across pages. Sections that cannot fit on one
             page must be allowed to split: an unbreakable box taller than the page box
             gets pushed whole and clipped, which silently drops content. */
          .page { page-break-inside: auto; break-inside: auto; }
          .page > h2 { page-break-after: avoid; break-after: avoid; }
          .page > *  { page-break-inside: avoid; break-inside: avoid; }
          /* ...except anything that can ITSELF exceed a page box. The rule above would make a
             long table — or the wrapper div some of them sit in, or a nested .page section —
             unbreakable, reintroducing the same defect one level down. Those stay breakable
             and the protection moves to the row. */
          .page .page, .page table, .page tbody, .page div:has(table) {
            page-break-inside: auto; break-inside: auto;
          }
          .page tr { page-break-inside: avoid; break-inside: avoid; }
          .page thead { display: table-header-group; }   /* repeat the header on each page */
          section.page { margin-top: 24px !important; }
          h2 { page-break-after: avoid; }
        }
        @page { size: A4; margin: 1.6cm 1.6cm 2cm; }
      `}</style>
    </div>
  )
}
