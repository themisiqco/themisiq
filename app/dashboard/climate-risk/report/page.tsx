'use client'

// app/dashboard/climate-risk/report/page.tsx
// ThemisIQ — Climate resilience report, served under the climate-risk module.
//
// LAYER 1 RELOCATION (interim): this is a standalone copy of the ResilienceReport
// renderer from app/dashboard/materiality/report/page.tsx, mounted at a
// climate-risk URL so the report can *live* under climate-risk without touching
// the live materiality path or the data model. It reads the same authed
// GET endpoint (/api/materiality/{id}); resilience is a result *shape* on an
// ordinary assessment row (results.analysisType === 'resilience'), not a
// separate data source — so no storage change is required to serve it here.
//
// This route is resilience-specific: if the id resolves to a non-resilience
// record it says so rather than rendering an empty report.
//
// NOTE: the shared helpers below are duplicated from the materiality report on
// purpose, to keep this change isolated and reversible. When the real
// extraction happens (shared component used by both routes), delete this copy.

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import { useReportTitle, reportTitle } from '../../../../lib/useReportTitle'
import PaywallCard from '../../../components/PaywallCard'
import { REGION_LABEL } from '../../../../lib/climate/regions'
import { DISCLAIMER_PARAS } from '../../../../lib/disclaimer'

// ─── Lookup helpers (labels we don't store on the assessment row) ─────────────

const SECTOR_LABEL: Record<string, string> = {
  energy: 'Energy & Utilities', finance: 'Financial Services', realestate: 'Real Estate',
  tech: 'Technology', health: 'Healthcare & Pharma', manuf: 'Industrials & Manufacturing',
  retail: 'Consumer & Retail', agri: 'Agriculture & Food', transport: 'Transport & Logistics',
  extract: 'Mining & Metals', construction: 'Construction & Materials',
  profservices: 'Professional Services', other: 'Other',
}
// REGION_LABEL is imported from lib/climate/regions (the ONE shared region-label map). It used to be
// duplicated inline here; do not re-inline it.
const JURISDICTION_LABEL: Record<string, string> = {
  eu_ets: 'EU (EU ETS)', cbam: 'EU CBAM exposure', uk_ets: 'UK (UK ETS)',
  ca: 'Canada (federal pricing)', us_fed: 'US (federal)', us_ca: 'US — California cap-and-trade',
  cn: 'China (national ETS)', kr: 'South Korea (K-ETS)', jp: 'Japan',
  au: 'Australia (Safeguard)', nz: 'New Zealand (NZ ETS)', ch: 'Switzerland (CH ETS)',
}

// ─── Styled bits (print-friendly) ─────────────────────────────────────────────
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const SEV = {
  high: { color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  med:  { color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  low:  { color: '#888784', bg: '#f8f7f5', border: '#e8e7e4' },
} as const

// ─── Page wrapper ─────────────────────────────────────────────────────────────
export default function ClimateRiskResilienceReportPage() {
  // useSearchParams must be inside a Suspense boundary for Next.js to prerender this page.
  return (
    <Suspense fallback={<Centered>Loading report…</Centered>}>
      <ResilienceReportInner />
    </Suspense>
  )
}

function ResilienceReportInner() {
  const params = useSearchParams()
  const isPaid = useEntitlement('climate-risk')
  const id = params.get('id')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [a, setA] = useState<any>(null)   // assessment row

  useEffect(() => {
    if (!id) { setError('No assessment id provided.'); setLoading(false); return }
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) { setError('Please sign in to view the report.'); setLoading(false); return }
        const res = await fetch(`/api/materiality/${id}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error || 'Failed to load assessment.'); setLoading(false); return }
        setA(json.assessment); setLoading(false)
      } catch (e: any) {
        setError(e?.message || 'Something went wrong.'); setLoading(false)
      }
    })()
  }, [id])


  // Names the saved PDF. Null until the assessment has loaded, and withheld for a record this
  // route rejects below — an error page must not be titled as the report it declined to render.
  const isResilience = !!a && (a.results || {}).analysisType === 'resilience'
  useReportTitle(isResilience
    ? reportTitle(a.workings?.disclosure?.legalEntity || a.company_name, 'Climate Resilience Report')
    : null)

  if (!isPaid) return <PaywallCard />
  if (loading) return <Centered>Loading report…</Centered>
  if (error) return <Centered>{error}</Centered>
  if (!a) return <Centered>No assessment data.</Centered>

  // This route renders resilience reports only.
  if ((a.results || {}).analysisType !== 'resilience') {
    return <Centered>This report isn’t a resilience analysis. Open it from its own module, or run a resilience analysis to generate one.</Centered>
  }

  const reportDate = new Date(a.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  return <ResilienceReport a={a} reportDate={reportDate} />
}

// ─── Small shared components & styles ─────────────────────────────────────────

const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: '#333', margin: '0 0 12px' }
const h3: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 400, color: '#0d0d0d', margin: '18px 0 8px' }
const ul: React.CSSProperties = { paddingLeft: 22, margin: '0 0 12px' }
const li: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: '#333', marginBottom: 4 }
const tbl: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12, margin: '8px 0 16px' }
const trh: React.CSSProperties = { background: '#f8f7f5' }
const tr: React.CSSProperties = { borderBottom: '0.5px solid #e8e7e4' }
const th: React.CSSProperties = { textAlign: 'left', padding: '8px 10px', fontSize: 11, fontWeight: 600, color: '#555553', borderBottom: '1px solid #e8e7e4' }
const td: React.CSSProperties = { padding: '8px 10px', color: '#0d0d0d', verticalAlign: 'top' }

function H({ children }: { children: any }) {
  return <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d', margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #e8e7e4' }}>{children}</h2>
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, padding: '6px 0', fontSize: 13 }}>
      <span style={{ color: '#888784' }}>{k}</span>
      <span style={{ color: '#0d0d0d' }}>{v}</span>
    </div>
  )
}
function Pill({ band }: { band: 'high' | 'med' | 'low' | 'unknown' }) {
  // Resilience cells are always assessed (collectItems filters out unknown physical upstream), so
  // 'unknown' shouldn't reach here — but the band union now includes it, so guard defensively rather
  // than crash on a future invariant change. Amber "Not assessed", never a silent LOW.
  if (band === 'unknown') {
    return <span style={{ background: '#FDF6EC', color: '#8A5A12', border: '0.5px solid #EAD9BE', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>NOT ASSESSED</span>
  }
  const c = SEV[band]
  return <span style={{ background: c.bg, color: c.color, border: `0.5px solid ${c.border}`, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{band.toUpperCase()}</span>
}
function Centered({ children }: { children: any }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', color: '#555', padding: '2rem', textAlign: 'center', lineHeight: 1.6 }}>{children}</div>
}

// small text-valued stat tile for the resilience conclusion
function TextStat({ label, v }: { label: string; v: string }) {
  return (
    <div style={{ background: '#f8f7f5', borderRadius: 10, padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#888784', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13, color: '#0d0d0d', marginTop: 4 }}>{v}</div>
    </div>
  )
}

// join helper for the report's channel summaries
function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

// Scenario-response scatter: each risk positioned by its band under the Paris-aligned (x) vs
// high-warming (y) future. Ported here so this is the ONE renderer of the resilience artefact
// (the near-copy in materiality/report was deleted). Self-contained SVG.
function ResilienceMap({ items }: { items: any[] }) {
  const risks = (items || []).filter((i: any) => i.kind !== 'opportunity')
  const W = 620, H = 470, padL = 92, padT = 50, plotW = 340, plotH = 350
  const px = (f: number) => padL + f * plotW
  const py = (f: number) => padT + (1 - f) * plotH
  const frac = (b: string) => b === 'high' ? 0.82 : b === 'med' ? 0.5 : 0.18
  const bandAt = (it: any, role: string) => it.cells?.find((c: any) => c.role === role)?.band ?? 'low'

  // Group by (paris-band, high-band) cell; stack collisions vertically so labels stay legible.
  const groups = new Map<string, any[]>()
  for (const it of risks) {
    const key = bandAt(it, 'paris') + '|' + bandAt(it, 'high')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(it)
  }
  type P = { it: any; cx: number; cy: number; color: string }
  const placed: P[] = []
  for (const [key, arr] of groups) {
    const [xb, yb] = key.split('|')
    const baseX = px(frac(xb)), baseY = py(frac(yb))
    const n = arr.length
    arr.forEach((it: any, i: number) => {
      placed.push({ it, cx: baseX, cy: baseY + (i - (n - 1) / 2) * 24, color: it.kind === 'physical' ? '#C2410C' : '#7425e3' })
    })
  }

  const axis = '#888784', grid = '#e8e7e4', muted = '#555553', ink = '#0d0d0d', hint = '#a8a6a1'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10 }} role="img" aria-label="Resilience scenario-response map: risks plotted by exposure under a rapid-policy future versus a high-warming future">
      <line x1={px(0.5)} y1={padT} x2={px(0.5)} y2={padT + plotH} stroke={grid} strokeDasharray="3 4" />
      <line x1={padL} y1={py(0.5)} x2={padL + plotW} y2={py(0.5)} stroke={grid} strokeDasharray="3 4" />
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={axis} />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke={axis} />
      <line x1={px(0.18)} y1={py(0.18)} x2={px(0.82)} y2={py(0.82)} stroke="#b8b6b1" strokeDasharray="2 5" />
      <text x={px(0.82)} y={padT + 4} textAnchor="middle" fontSize="11" fill={hint}>persistent / robust</text>
      <text x={px(0.2)} y={padT + 4} textAnchor="middle" fontSize="11" fill={hint}>warming-driven</text>
      <text x={px(0.82)} y={padT + plotH - 8} textAnchor="middle" fontSize="11" fill={hint}>policy-driven</text>
      <text x={padL - 10} y={py(0.82) + 4} textAnchor="end" fontSize="11" fill={muted}>High</text>
      <text x={padL - 10} y={py(0.5) + 4} textAnchor="end" fontSize="11" fill={muted}>Mod</text>
      <text x={padL - 10} y={py(0.18) + 4} textAnchor="end" fontSize="11" fill={muted}>Low</text>
      <text x={px(0.18)} y={padT + plotH + 18} textAnchor="middle" fontSize="11" fill={muted}>Low</text>
      <text x={px(0.5)} y={padT + plotH + 18} textAnchor="middle" fontSize="11" fill={muted}>Mod</text>
      <text x={px(0.82)} y={padT + plotH + 18} textAnchor="middle" fontSize="11" fill={muted}>High</text>
      <text x={padL + plotW / 2} y={padT + plotH + 42} textAnchor="middle" fontSize="12" fill={muted}>Exposure under a rapid-policy (Paris-aligned) future →</text>
      <text x={34} y={padT + plotH / 2} textAnchor="middle" fontSize="12" fill={muted} transform={`rotate(-90 34 ${padT + plotH / 2})`}>Exposure under a high-warming future →</text>
      {placed.map((d, i) => {
        const left = d.cx <= px(0.5)
        return (
          <g key={i}>
            <circle cx={d.cx} cy={d.cy} r={7} fill={d.color} opacity={0.9} />
            <text x={left ? d.cx - 12 : d.cx + 12} y={d.cy + 4} textAnchor={left ? 'end' : 'start'} fontSize="12" fill={ink}>{d.it.label}</text>
          </g>
        )
      })}
      <circle cx={padL + 8} cy={H - 12} r={6} fill="#C2410C" />
      <text x={padL + 20} y={H - 8} fontSize="12" fill={muted}>Physical risk</text>
      <circle cx={padL + 142} cy={H - 12} r={6} fill="#7425e3" />
      <text x={padL + 154} y={H - 8} fontSize="12" fill={muted}>Transition risk</text>
    </svg>
  )
}

// ─── Resilience report (multi-scenario) ───────────────────────────────────────
// Rendered when the saved record has results.analysisType === 'resilience'.
function ResilienceReport({ a, reportDate }: { a: any; reportDate: string }) {
  const res = (a.results || {}).resilience || {}
  const prov = res.provenance   // provenance roll-up; absent on records saved before provenance shipped
  const trio: any[] = res.trio || []
  const items: any[] = res.items || []
  const syn = res.synthesis || {}
  const isCsrd = a.mode === 'csrd'

  const physical = items.filter(i => i.kind === 'physical')
  const transition = items.filter(i => i.kind === 'transition')
  const opportunity = items.filter(i => i.kind === 'opportunity')

  const roleLabel: Record<string, string> = { paris: 'Paris-aligned', middle: 'Current trajectory', high: 'High warming' }
  const clsLabel: Record<string, string> = {
    'persistent': 'Persistent', 'warming-contingent': 'Warming-driven',
    'policy-path-contingent': 'Policy-driven', 'low-across-futures': 'Low across futures',
  }

  // one templated summary sentence per channel, rules-derived (not free text)
  const channelSummary = (kind: string, list: any[]): string => {
    const persistent = list.filter(i => i.classification === 'persistent').map(i => i.label)
    const warming = list.filter(i => i.classification === 'warming-contingent').map(i => i.label)
    const policy = list.filter(i => i.classification === 'policy-path-contingent').map(i => i.label)
    const noun = kind === 'opportunity' ? 'opportunities' : 'risks'
    const parts: string[] = []
    if (persistent.length) parts.push(`${joinList(persistent)} ${persistent.length === 1 ? 'is' : 'are'} material across all three futures`)
    if (warming.length) parts.push(`${joinList(warming)} ${warming.length === 1 ? 'strengthens' : 'strengthen'} as warming rises`)
    if (policy.length) parts.push(`${joinList(policy)} ${policy.length === 1 ? 'is' : 'are'} most pronounced under faster decarbonisation`)
    if (!parts.length) return `No material ${noun} were identified across the scenarios tested.`
    return parts.join('; ') + '.'
  }

  const trendCell = (it: any) => (
    <span style={{ fontSize: 11, color: '#888784' }}>{it.horizonTrend === 'rises' ? 'rises toward 2050' : 'stable over time'}</span>
  )

  const channelTable = (list: any[], kind: string) => (
    <table style={tbl}>
      <thead>
        <tr style={trh}>
          <th style={th}>{kind === 'opportunity' ? 'Opportunity' : 'Risk'}</th>
          {trio.map((t: any) => <th key={t.role} style={th}>{roleLabel[t.role]} <span style={{ fontWeight: 400, color: '#aaa' }}>{t.warming}</span></th>)}
          <th style={th}>Pattern</th>
          <th style={th}>Over time</th>
        </tr>
      </thead>
      <tbody>
        {list.map((it: any, i: number) => {
          const byRole = (role: string) => it.cells.find((c: any) => c.role === role)
          return (
            <tr key={kind + i} style={tr}>
              <td style={td}>
                <div>{it.label}</div>
                <div style={{ fontSize: 10, color: '#aaa' }}>{kind === 'physical' ? 'in ' + it.driver : kind === 'transition' ? it.driver : ''}</div>
              </td>
              {trio.map((t: any) => {
                const c = byRole(t.role)
                return <td key={t.role} style={td}>{c ? <span><Pill band={c.band} /> <span style={{ fontSize: 11, color: '#888784' }}>{c.score}</span></span> : '—'}</td>
              })}
              <td style={td}>{clsLabel[it.classification] || it.classification}</td>
              <td style={td}>{trendCell(it)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  const channelNarrative = (list: any[]) => (
    <ul style={ul}>
      {list.map((it: any, i: number) => <li key={'n'+i} style={li}>{it.interpretation}</li>)}
    </ul>
  )

  return (
    <div className="report-root" style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#0d0d0d' }}>
      <div className="no-print" style={{ position: 'sticky', top: 0, background: '#0d0d0d', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>ThemisIQ · Climate resilience analysis report</div>
        <button onClick={() => window.print()} style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>⬇ Save as PDF (Cmd+P)</button>
      </div>

      <div className="report-body" style={{ maxWidth: 780, margin: '0 auto', padding: '3rem 3rem 4rem' }}>

        {/* COVER */}
        <section className="page">
          <div style={{ height: 6, background: GRAD, marginBottom: 32, borderRadius: 2 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 12 }}>Prepared by ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px' }}>Climate Resilience Analysis Report</h1>
          <p style={{ fontSize: 15, color: '#555553', marginBottom: 36, lineHeight: 1.6 }}>
            Multi-scenario resilience assessment of climate-related risks and opportunities across a diverse range of climate futures, as required for {isCsrd ? 'CSRD / ESRS E1' : 'IFRS S2'} resilience disclosure.
          </p>
          <div style={{ borderTop: '1px solid #e8e7e4', borderBottom: '1px solid #e8e7e4', padding: '20px 0', marginBottom: 24 }}>
            <Row k="Legal entity" v={a.workings?.disclosure?.legalEntity || 'Not specified'} />
            <Row k="Reporting period" v={a.workings?.disclosure?.reportingPeriod || 'Not specified'} />
            <Row k="Primary sector" v={SECTOR_LABEL[a.industry_code] || a.industry_code} />
            <Row k="Operating regions (IPCC AR6)" v={(a.region_codes || []).map((c: string) => `${REGION_LABEL[c] || c} (${c})`).join(', ') || '—'} />
            <Row k="Policy jurisdictions" v={(a.jurisdiction_codes || []).map((c: string) => JURISDICTION_LABEL[c] || c).join(', ') || '—'} />
            <Row k="Scenarios tested" v={trio.map((t: any) => `${roleLabel[t.role]} (${t.warming})`).join(', ') || 'Diverse trio'} />
            <Row k="Time horizon" v={`${a.horizon} term`} />
            <Row k="Asset profile" v={a.asset_profile} />
            <Row k="Model version" v={a.model_version || res.modelVersion || '—'} />
            <Row k="Assessment date" v={reportDate} />
          </div>
        </section>

        {/* RESILIENCE CONCLUSION */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Resilience conclusion</H>
          <p style={p}>{syn.statement}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '0 0 8px' }}>
            <TextStat label="Two-channel exposure" v={syn.twoChannel === 'both' ? 'Both transition & physical' : syn.twoChannel === 'transition-led' ? 'Transition-led' : syn.twoChannel === 'physical-led' ? 'Physical-led' : 'Limited'} />
           <TextStat label="Scenario profile" v={syn.inverts ? 'Channels invert' : `${syn.profileSwing?.magnitude ?? '—'} shift`} />
            <TextStat label="Horizon trend" v={syn.horizonNote === 'worsens' ? 'Worsens toward 2050' : 'Stable over time'} />
          </div>
        </section>

        {/* RESILIENCE MAP — scenario-response scatter (ported from the deleted materiality/report copy) */}
        {(physical.length > 0 || transition.length > 0) && (
          <section className="page" style={{ marginTop: 48 }}>
            <H>Resilience map</H>
            <p style={p}>Each risk is positioned by its exposure under a rapid-policy (Paris-aligned) future and under a high-warming future. Risks toward the top-right are material whichever way the future unfolds; the spread between the physical group (toward the top) and the transition group (toward the right) is the two-channel exposure. Axes use the calibrated bands (Low / Moderate / High), the measure that is comparable across drivers.</p>
            <ResilienceMap items={items} />
          </section>
        )}

        {/* SCENARIO SELECTION & RATIONALE — credibility register 1 */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Scenario selection and rationale</H>
          <p style={p}>Resilience is assessed across a fixed diverse trio of scenarios. The set is chosen to span a low-warming Paris-aligned future, a current-trajectory middle case, and a high-warming case — deliberately stressing both the transition channel (most acute under rapid decarbonisation) and the physical channel (most acute under high warming).</p>
          <table style={tbl}>
            <thead><tr style={trh}><th style={th}>Role</th><th style={th}>Scenario</th><th style={th}>Warming</th><th style={th}>Source</th></tr></thead>
            <tbody>
              {trio.map((t: any) => (
                <tr key={t.role} style={tr}>
                  <td style={td}>{roleLabel[t.role]}</td>
                  <td style={td}>{t.scenarioCode}</td>
                  <td style={td}>{t.warming}</td>
                  <td style={td}>{t.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={p}>This satisfies the explicit requirements of both frameworks: IFRS S2 paragraph 22(b)(i) requires disclosure of whether the scenario analysis used a diverse range of scenarios and one aligned with the latest international agreement on climate change (the Paris-aligned pathway above); CSRD/ESRS E1 requires consideration of at least a high-emissions scenario (the high-warming pathway above). Under both, the choice of scenarios and the rationale for that choice are themselves disclosable; this section documents that judgment.</p>
          <p style={p}>This screening uses a standard diverse trio spanning the IPCC AR6 range, including a Paris-aligned scenario. It is NOT TAILORED TO YOUR ENTITY. IFRS S2 22(b)(i) requires an entity to explain why its chosen scenarios are relevant to it. A formal assessment should select scenarios that stress the specific hazards and jurisdictions identified in this screening, and state that reasoning. Scenario selection is a matter for management.</p>
        </section>

        {/* PER-CHANNEL DETAIL */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Physical risks across scenarios</H>
          {physical.length ? (<>{channelTable(physical, 'physical')}<p style={{ ...p, fontStyle: 'italic' }}>{channelSummary('physical', physical)}</p>{channelNarrative(physical)}</>) : <p style={{ ...p, color: '#888784' }}>No material physical risks at this intersection.</p>}
        </section>
        <section className="page" style={{ marginTop: 48 }}>
          <H>Transition risks across scenarios</H>
          {transition.length ? (<>{channelTable(transition, 'transition')}<p style={{ ...p, fontStyle: 'italic' }}>{channelSummary('transition', transition)}</p>{channelNarrative(transition)}</>) : <p style={{ ...p, color: '#888784' }}>None flagged.</p>}
        </section>
        <section className="page" style={{ marginTop: 48 }}>
          <H>Opportunities across scenarios</H>
          {opportunity.length ? (<>{channelTable(opportunity, 'opportunity')}<p style={{ ...p, fontStyle: 'italic' }}>{channelSummary('opportunity', opportunity)}</p>{channelNarrative(opportunity)}</>) : <p style={{ ...p, color: '#888784' }}>No opportunity profile available for this industry yet.</p>}
        </section>

        {/* METHODOLOGY — credibility register 2 (provenance) */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Methodology and basis</H>
          <p style={p}>This resilience analysis runs the underlying climate-risk engine across each scenario in the diverse trio, then derives a resilience conclusion using a transparent, rules-based synthesis. Every classification and statement traces to the underlying scores; no narrative is free-generated.</p>
          <h3 style={h3}>Timing of the analysis</h3>
          <p style={p}><strong>Scenario analysis carried out:</strong> {reportDate}.<br /><strong>Reporting period covered:</strong> {a.workings?.disclosure?.reportingPeriod || 'Not specified'}.</p>
          <p style={p}>IFRS S2 permits climate-related scenario analysis to be refreshed on the entity&rsquo;s strategic planning cycle rather than annually. The resilience conclusion drawn from it must be reassessed and disclosed in every annual reporting period.</p>
          <h3 style={h3}>Frameworks</h3>
          <ul style={ul}>
            <li style={li}><strong>IPCC AR6 WGI reference regions</strong> and <strong>climatic impact-drivers</strong> — the basis for physical-hazard exposure.</li>
            <li style={li}><strong>TCFD transition risk categories</strong> — policy and legal, technology, market, and reputation.</li>
            <li style={li}><strong>IPCC Shared Socioeconomic Pathways</strong> — SSP1-2.6, SSP2-4.5, SSP5-8.5 form the diverse trio.</li>
            {isCsrd && <li style={li}><strong>ESRS E1</strong> — the resilience-of-business-model and anticipated-financial-effects requirements this analysis informs.</li>}
          </ul>
          <h3 style={h3}>Rules-based resilience synthesis</h3>
          <p style={p}>Each risk and opportunity is classified by how it behaves across the trio: <strong>Persistent</strong> (material under all three futures — a robust exposure independent of the policy path); <strong>Warming-driven</strong> (most acute under high warming — a physical-risk-led exposure); <strong>Policy-driven</strong> (most acute under the Paris-aligned pathway — sensitivity to the speed of decarbonisation rather than to warming); or <strong>Low across futures</strong>. The overall profile swing measures how much the count of material risks changes between the low- and high-warming ends, and the two-channel check states whether stress is concentrated in transition-led futures, physical-led futures, or both.</p>
        </section>

        {/* ASSUMPTIONS REGISTER — credibility register 3 */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Assumptions register</H>
          <ul style={ul}>
            <li style={li}>All scoring inputs are ordinal sector-level starter defaults (0–3 scales), derived from the public frameworks above. They are not empirically calibrated to the entity and require validation against entity-specific data.</li>
            <li style={li}><strong>Transition-driver weights</strong> are applied per sector across the four TCFD transition categories. Neither TCFD nor IFRS S2 prescribes relative weights among these categories — the standards state only that magnitude varies by sector — so these weights are a disclosed methodological choice, set per sector rather than universally. They range 1–3 across sectors; the scale permits 0 (not material), but on review every sector was judged to face at least limited exposure on every transition channel.</li>
            <li style={li}><strong>Band thresholds.</strong> Policy-driver scores carry an additional jurisdiction factor and use higher band cut-offs than the other three transition drivers, which are scaled to their narrower range. Physical and opportunity bands follow the model configuration.</li>
            <li style={li}><strong>Scenario multipliers.</strong> Each SSP carries a physical and a transition multiplier; physical and transition risk therefore move in opposite directions across the trio.</li>
          </ul>
        </section>

        {/* DATA LINEAGE — credibility register 4 */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Data lineage</H>
          <p style={p}>The following inputs were provided by the user for this analysis: primary sector, operating regions, policy jurisdictions, asset profile, and time horizon. All scoring values — hazard sensitivities, regional hazard intensities, carbon-exposure, jurisdictional policy intensities, transition-driver weights, opportunity relevances, and scenario multipliers — are platform reference defaults, not entity-supplied. The boundary matters for assurance: user inputs scope the analysis; platform defaults must be validated against the entity's own operations before any disclosure.</p>
        </section>

        {/* DATA PROVENANCE — how firm the reference values are. Disclosed, never gated. */}
        {prov && prov.nTotal > 0 && (
          <section className="page" style={{ marginTop: 48 }}>
            <H>Data provenance</H>
            <p style={p}>This analysis draws on {prov.nTotal} reference {prov.nTotal === 1 ? 'value' : 'values'}.</p>
            <ul style={ul}>
              <li style={li}><strong>{prov.nPrimarySource}</strong> transcribed from named primary sources{prov.nPrimarySource > 0 ? ' (listed below)' : ''}</li>
              <li style={li}><strong>{prov.nExpertJudgment}</strong> disclosed ThemisIQ expert-judgment determinations</li>
              <li style={li}><strong>{prov.nStarter}</strong> starter values pending calibration</li>
            </ul>
            <p style={p}>Starter values are reasonable sector- and region-level defaults derived from public frameworks (IPCC AR6, TCFD, ESRS, EU Taxonomy). They have not yet been individually validated against a primary source and should be reviewed against entity-specific data before disclosure.</p>
            {Array.isArray(prov.primarySources) && prov.primarySources.length > 0 && (
              <>
                <h3 style={h3}>Primary sources</h3>
                <ul style={ul}>
                  {prov.primarySources.map((s: string, i: number) => <li key={'ps' + i} style={li}>{s}</li>)}
                </ul>
              </>
            )}
          </section>
        )}

        {/* LIMITATIONS REGISTER — credibility register 5 */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Limitations</H>
          <ul style={ul}>
            <li style={li}>This is a <strong>qualitative</strong> resilience screening. It does not quantify per-scenario financial effects in monetary terms; both IFRS S2 and ESRS permit qualitative resilience assessment, particularly in early reporting years, but a full disclosure may require quantified anticipated financial effects.</li>
            <li style={li}>Scores are <strong>ordinal and relative</strong>, not absolute measures of probability or loss.</li>
            <li style={li}>Transition drivers are scored on different scales — policy carries a jurisdiction factor the other three do not. To compare them, each driver is expressed relative to its own high-materiality threshold before the most material is carried to the financial axis. This means 'high' has the same meaning across all four drivers. The score reflects the most material driver, not cumulative exposure across drivers.</li>
            <li style={li}>The financial-materiality score is bounded at 10. Companies whose transition exposure exceeds the high-materiality threshold by a wide margin will all score at or near the ceiling. This is intentional: the score answers a threshold question (is climate financially material?), not a magnitude-ranking question. The four underlying transition driver scores are disclosed separately and are unbounded.</li>
            <li style={li}>For <strong>financial institutions</strong>, this entity-level transition screen reflects the firm's own operations and understates portfolio (financed-emissions) exposure, which requires a separate financed-emissions assessment.</li>
            <li style={li}>The diverse trio is a fixed screening set. A formal assessment may test additional or entity-specific scenarios.</li>
            <li style={li}>Final determination of strategic resilience is a matter for management judgement, informed by entity-specific data and, where required, independent professional review.</li>
          </ul>
        </section>

        {/* IMPORTANT NOTICE */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Important Notice</H>
          {DISCLAIMER_PARAS.map((para, i) => (
            <p key={'disc' + i} style={{ ...p, fontSize: 11, color: '#888784' }}>{para}</p>
          ))}
        </section>

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '0.5px solid #e8e7e4', fontSize: 11, color: '#888784', textAlign: 'center' }}>
          ThemisIQ Compliance Inc. · www.themisiq.co · Report ID {String(a.id).slice(0, 8)}… · Assessment date {reportDate}
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
