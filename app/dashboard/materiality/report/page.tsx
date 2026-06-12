'use client'

// app/dashboard/materiality/report/page.tsx
// ThemisIQ — Printable CSRD double materiality report.
//
// Reads ?id=<uuid> from the URL, fetches the assessment from the authed GET API,
// renders the full report (cover, exec summary, methodology, scenario rationale,
// matrix, materiality table, risk register, limitations, disclaimer).
//
// Print-optimized via @media print CSS: page breaks, white background, no nav.

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import PaywallCard from '../../../components/PaywallCard'

// ─── Lookup helpers (labels we don't store on the assessment row) ─────────────

const SECTOR_LABEL: Record<string, string> = {
  energy: 'Energy & Utilities', finance: 'Financial Services', realestate: 'Real Estate',
  tech: 'Technology', health: 'Healthcare & Pharma', manuf: 'Industrials & Manufacturing',
  retail: 'Consumer & Retail', agri: 'Agriculture & Food', transport: 'Transport & Logistics',
  extract: 'Mining & Metals', construction: 'Construction & Materials',
  profservices: 'Professional Services', other: 'Other',
}
const REGION_LABEL: Record<string, string> = {
  NWN: 'North-Western North America', NEN: 'North-Eastern North America',
  WNA: 'Western North America', CNA: 'Central North America', ENA: 'Eastern North America',
  CAR: 'Caribbean', NEU: 'Northern Europe', WCE: 'Western & Central Europe',
  MED: 'Mediterranean', EEU: 'Eastern Europe', SAS: 'South Asia', SEA: 'South-East Asia',
  EAS: 'East Asia', ARP: 'Arabian Peninsula', WCA: 'West Central Asia',
  WAF: 'Western Africa', ESAF: 'East Southern Africa', EAU: 'Eastern Australia',
  NAU: 'Northern Australia', PAC: 'Pacific Small Islands',
}
const JURISDICTION_LABEL: Record<string, string> = {
  eu_ets: 'EU (EU ETS)', cbam: 'EU CBAM exposure', uk_ets: 'UK (UK ETS)',
  ca: 'Canada (federal pricing)', us_fed: 'US (federal)', us_ca: 'US — California cap-and-trade',
  cn: 'China (national ETS)', kr: 'South Korea (K-ETS)', jp: 'Japan',
  au: 'Australia (Safeguard)', nz: 'New Zealand (NZ ETS)', ch: 'Switzerland (CH ETS)',
}
const SCENARIO_LABEL: Record<string, { l: string; d: string }> = {
  ssp245: { l: 'IPCC SSP2-4.5', d: '~2.7°C' }, ssp126: { l: 'IPCC SSP1-2.6', d: '~1.8°C' },
  ssp585: { l: 'IPCC SSP5-8.5', d: '~4.4°C' },
  ngfs_orderly: { l: 'NGFS Orderly', d: 'Early policy' },
  ngfs_disorderly: { l: 'NGFS Disorderly', d: 'Late, abrupt' },
  ngfs_hothouse: { l: 'NGFS Hot House', d: 'Limited action' },
}

// Formal Important Notice — five paragraphs, rendered as a final section in both
// the CSRD/IFRS S2 report and the resilience report.
const DISCLAIMER_PARAS: string[] = [
  "This report has been generated automatically by the ThemisIQ platform using information provided by the user and publicly available regulatory guidance. The report is provided solely for informational, planning, and compliance-support purposes and does not constitute legal advice, accounting advice, investment advice, assurance services, engineering advice, or any other professional opinion.",
  "ThemisIQ Compliance Inc. makes no representation or warranty, express or implied, regarding the completeness, accuracy, suitability, or regulatory sufficiency of the information contained in this report. Regulatory requirements may change and may vary by jurisdiction.",
  "Users remain solely responsible for reviewing, validating, and approving all information prior to submission to regulators, investors, customers, lenders, assurance providers, or other third parties.",
  "ThemisIQ Compliance Inc. is not an accredited assurance provider and does not provide verification, validation, certification, attestation, or assurance services under the GHG Protocol, ISO 14064, CARB regulations, CDP, ESRS, IFRS Sustainability Disclosure Standards, or any other reporting framework unless explicitly engaged under a separate written agreement.",
  "To the fullest extent permitted by law, ThemisIQ Compliance Inc. disclaims liability for any loss, damage, penalty, claim, enforcement action, regulatory finding, or other consequence arising from the use of or reliance upon this report.",
]

// ─── Styled bits (print-friendly) ─────────────────────────────────────────────
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const SEV = {
  high: { color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  med:  { color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  low:  { color: '#888784', bg: '#f8f7f5', border: '#e8e7e4' },
} as const

export default function CsrdReportPage() {
  // useSearchParams must be inside a Suspense boundary for Next.js to prerender this page.
  return (
    <Suspense fallback={<Centered>Loading report…</Centered>}>
      <ReportInner />
    </Suspense>
  )
}

function ReportInner() {
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

  if (!isPaid) return <PaywallCard />
  if (loading) return <Centered>Loading report…</Centered>
  if (error) return <Centered>{error}</Centered>
  if (!a) return <Centered>No assessment data.</Centered>

  const result = a.results || {}
  const physical: any[] = result.physical || []
  const transition: any[] = result.transition || []
  const matrix: any[] = result.matrix || []
  const isCsrd = a.mode === 'csrd'

  const rationale = a.workings?.input ? null : null  // placeholder; we read from saved workings below
  const savedRationale = (a as any).workings?.rationale  // not always present, set in stage-two wizard

  const reportDate = new Date(a.created_at).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })

  // Resilience records carry a different shape; render the dedicated report.
  if ((a.results || {}).analysisType === 'resilience') {
    return <ResilienceReport a={a} reportDate={reportDate} />
  }

  return (
    <div className="report-root" style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#0d0d0d' }}>
      {/* Print button (hidden when printing) */}
      <div className="no-print" style={{ position: 'sticky', top: 0, background: '#0d0d0d', color: '#fff', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>ThemisIQ · {isCsrd ? 'CSRD double materiality report' : 'IFRS S2 single materiality report'}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => window.print()} style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
            ⬇ Save as PDF (Cmd+P)
          </button>
        </div>
      </div>

      <div className="report-body" style={{ maxWidth: 780, margin: '0 auto', padding: '3rem 3rem 4rem' }}>

        {/* ── COVER ───────────────────────────────────────────────────────── */}
        <section className="page">
          <div style={{ height: 6, background: GRAD, marginBottom: 32, borderRadius: 2 }} />
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 12 }}>
            Prepared by ThemisIQ Compliance Inc.
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, lineHeight: 1.2, margin: '0 0 16px', color: '#0d0d0d' }}>
            {isCsrd ? 'Double Materiality Screening Report' : 'Climate Risk & Scenario Analysis Report'}
          </h1>
          <p style={{ fontSize: 15, color: '#555553', marginBottom: 36, lineHeight: 1.6 }}>
            {isCsrd
              ? 'CSRD / ESRS — financial and impact materiality screening across the ten ESRS topical standards.'
              : 'IFRS S2 — single (financial) materiality screening for climate-related risks and opportunities.'}
          </p>
          <div style={{ borderTop: '1px solid #e8e7e4', borderBottom: '1px solid #e8e7e4', padding: '20px 0', marginBottom: 24 }}>
            <Row k="Legal entity" v={a.workings?.input?.legalEntity || (a as any).legal_entity || a.company_name || '—'} />
            <Row k="Reporting period" v={a.workings?.input?.reportingPeriod || 'FY2025'} />
            <Row k="Primary sector" v={SECTOR_LABEL[a.industry_code] || a.industry_code} />
            <Row k="Operating regions (IPCC AR6)" v={(a.region_codes || []).map((c: string) => `${REGION_LABEL[c] || c} (${c})`).join(', ') || '—'} />
            <Row k="Policy jurisdictions" v={(a.jurisdiction_codes || []).map((c: string) => JURISDICTION_LABEL[c] || c).join(', ') || '—'} />
            <Row k="Scenario tested" v={`${SCENARIO_LABEL[a.scenario_code]?.l || a.scenario_code} (${SCENARIO_LABEL[a.scenario_code]?.d || ''})`} />
            <Row k="Time horizon" v={`${a.horizon} term`} />
            <Row k="Asset profile" v={a.asset_profile} />
            <Row k="Model version" v={a.model_version || result.modelVersion || '—'} />
            <Row k="Report date" v={reportDate} />
          </div>
        </section>

        {/* ── EXECUTIVE SUMMARY ─────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Executive summary</H>
          <p style={p}>
            This {isCsrd ? 'double materiality' : 'single materiality'} screening identifies climate-related risks and {isCsrd ? 'sustainability topics' : 'transition exposures'} that are likely to be material for{' '}
            <strong>{a.company_name || SECTOR_LABEL[a.industry_code] || 'the entity'}</strong>{' '}
            under the {SCENARIO_LABEL[a.scenario_code]?.l} pathway over the {a.horizon} term.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isCsrd ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 12, margin: '18px 0' }}>
            <Stat label="High physical risks" val={result.summary?.physicalHigh ?? 0} color="#B91C1C" bg="#FCEBEB" />
            <Stat label="High transition risks" val={result.summary?.transitionHigh ?? 0} color="#ba7517" bg="#FEF3E2" />
            {isCsrd && <Stat label="Topics material on both axes" val={result.summary?.topicsBothAxes ?? 0} color="#7425e3" bg="#EDE9FE" />}
          </div>
          <h3 style={h3}>Key findings</h3>
          <ul style={ul}>
            {physical.filter(p => p.band === 'high').slice(0, 3).map((p, i) => (
              <li key={'phf'+i} style={li}>Physical risk: <strong>{p.hazard}</strong> is material (high band, score {p.score}) — driven by exposure in <strong>{p.drivingRegion}</strong>.</li>
            ))}
            {transition.filter(t => t.band === 'high').slice(0, 2).map((t, i) => (
              <li key={'trf'+i} style={li}>Transition risk: <strong>{t.driver}</strong> is material (high band) under the chosen scenario and jurisdictions.</li>
            ))}
            {isCsrd && matrix.filter(m => m.quadrant === 'both').slice(0, 4).map((m, i) => (
              <li key={'mf'+i} style={li}>{m.code} <strong>{m.label}</strong> is material on <strong>both axes</strong> (financial {m.financial.toFixed(1)} / impact {m.impact.toFixed(1)}).</li>
            ))}
            {physical.filter(p => p.band === 'high').length === 0 && transition.filter(t => t.band === 'high').length === 0 && (
              <li style={li}>No <em>high-band</em> risks were flagged at this combination of industry, geography and scenario. Medium-band items below still warrant review.</li>
            )}
          </ul>
        </section>

        {/* ── METHODOLOGY ───────────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Methodology and basis</H>
          <p style={p}>
            This screening combines four public, independently-sourced frameworks. No proprietary or licensed third-party classification is reproduced.
          </p>
          <h3 style={h3}>Frameworks</h3>
          <ul style={ul}>
            <li style={li}><strong>IPCC AR6 WGI reference regions</strong> — the 20 land regions used here are drawn from the Sixth Assessment Report Working Group I reference-region set (Iturbide et al., 2020), each with its characteristic profile of climatic impact-drivers.</li>
            <li style={li}><strong>IPCC climatic impact-drivers</strong> — the physical hazards (extreme heat, drought, water stress, inland flooding, coastal flooding, wildfire, storms/cyclones, cold/permafrost) follow the AR6 climatic-impact-driver categories.</li>
            <li style={li}><strong>TCFD transition risk categories</strong> — transition risks follow the Task Force on Climate-related Financial Disclosures classification: policy and legal, technology, market, and reputation.</li>
            {isCsrd && <li style={li}><strong>ESRS topical standards</strong> — the impact-materiality axis assesses the ten ESRS topical standards (E1–E5 environment, S1–S4 social, G1 governance).</li>}
            <li style={li}><strong>Scenario pathways</strong> — both IPCC Shared Socioeconomic Pathways (SSP1-2.6, SSP2-4.5, SSP5-8.5) and NGFS scenarios (Orderly, Disorderly, Hot House) are available; this screening uses {SCENARIO_LABEL[a.scenario_code]?.l}.</li>
          </ul>
          <h3 style={h3}>Risk model</h3>
          <p style={p}>
            <strong>Physical risk</strong> is computed as industry sensitivity × regional hazard exposure × scenario severity × time-horizon multiplier. A risk is flagged only where industry sensitivity and regional hazard exposure intersect — preventing the common error of flagging, for example, drought for any agricultural entity regardless of where it operates.
          </p>
          <p style={p}>
            <strong>Transition risk</strong> is computed as industry carbon exposure × jurisdictional policy intensity × scenario policy-speed × time-horizon multiplier. Transition geography (policy jurisdictions) is deliberately distinct from physical geography (IPCC regions): physical exposure depends on where assets and hazards are; transition exposure depends on which policy regimes apply.
          </p>
          {isCsrd && (
            <p style={p}>
              <strong>Double materiality</strong> is operationalised as the combination of single (financial) materiality and impact materiality: <em>double materiality = financial + impact</em>. The financial axis uses the engine above; climate (E1) financial score is taken directly from the physical + transition computation. The impact axis uses industry baselines for the ten ESRS topics, refined by the user's self-assessment.
            </p>
          )}
          <h3 style={h3}>Scenario inversion</h3>
          <p style={p}>
            Physical and transition risk move in opposite directions across scenarios: high-warming pathways raise physical risk and lower transition pressure; rapid- or abrupt-policy pathways raise transition risk and lower physical pressure. A resilient strategy must hold up across both ends, which is why both frameworks require testing resilience across a range rather than against a single forecast.
          </p>
        </section>

        {/* ── SCENARIO RATIONALE ─────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Scenario selection and rationale</H>
          <p style={p}>
            <strong>Pathway used:</strong> {SCENARIO_LABEL[a.scenario_code]?.l} ({SCENARIO_LABEL[a.scenario_code]?.d}).
          </p>
          <p style={p}>
            {savedRationale?.scenario || 'A middle pathway (SSP2-4.5, ~2.7°C) was selected as a reasonable central case for first-pass screening. Higher- or lower-warming pathways can be tested to assess resilience across a range.'}
          </p>
          <p style={p}>
            <strong>Time horizon used:</strong> {a.horizon} term.
          </p>
          <p style={p}>
            {savedRationale?.horizon || 'A medium-term horizon (to 2040) was selected as the default screening lens. Companies with long-lived physical assets may prefer the long-term view; near-term commitments may benefit from the short-term view.'}
          </p>
          <p style={p}>
            Under both IFRS S2 and CSRD/ESRS, the choice of scenarios used and the rationale for that choice are themselves disclosable. This section documents that judgment.
          </p>
        </section>

        {/* ── MATRIX (CSRD only) ─────────────────────────────────────────── */}
        {isCsrd && matrix.length > 0 && (
          <section className="page" style={{ marginTop: 48 }}>
            <H>Double materiality matrix</H>
            <p style={p}>
              Each ESRS topic is plotted on the two axes — financial materiality (vertical) and impact materiality (horizontal). Topics in the top-right quadrant are material on both axes and represent the highest reporting and management priority.
            </p>
            <Matrix topics={matrix} />
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#555553' }}>
              {[['#A32D2D', 'Material on both'], ['#ba7517', 'Material on one axis'], ['#888784', 'Lower priority']].map(([c, l]) => (
                <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}</span>
              ))}
            </div>
          </section>
        )}

        {/* ── MATERIALITY TABLE (CSRD) ───────────────────────────────────── */}
        {isCsrd && matrix.length > 0 && (
          <section className="page" style={{ marginTop: 48 }}>
            <H>Materiality determination — all topics</H>
            <p style={p}>
              All ten ESRS topical standards, with their financial and impact materiality scores (0–10) and band. Sorted by maximum of the two axes.
            </p>
            <MatrixTable topics={matrix} />
          </section>
        )}

        {/* ── RISK REGISTER ──────────────────────────────────────────────── */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Risk register</H>
          <h3 style={h3}>Physical risks</h3>
          <p style={p}><em>Industry sensitivity × regional hazard exposure × scenario × horizon. Flagged only where industry sensitivity meets real regional hazard exposure.</em></p>
          {physical.length > 0 ? (
            <table style={tbl}>
              <thead><tr style={trh}><th style={th}>Hazard</th><th style={th}>Severity</th><th style={th}>Driving region</th><th style={th}>Score</th></tr></thead>
              <tbody>
                {physical.map((p, i) => (
                  <tr key={'pr'+i} style={tr}>
                    <td style={td}>{p.hazard}</td>
                    <td style={td}><Pill band={p.band} /></td>
                    <td style={td}>{REGION_LABEL[p.drivingRegion] || p.drivingRegion} ({p.drivingRegion})</td>
                    <td style={td}>{p.score?.toFixed?.(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ ...p, color: '#888784' }}>No material physical risks flagged at this intersection of industry, region and scenario.</p>
          )}
          <h3 style={{ ...h3, marginTop: 28 }}>Transition risks</h3>
          <p style={p}><em>Industry carbon exposure × jurisdictional policy intensity × scenario policy-speed × horizon.</em></p>
          <table style={tbl}>
            <thead><tr style={trh}><th style={th}>Driver</th><th style={th}>Severity</th></tr></thead>
            <tbody>
              {transition.map((t, i) => (
                <tr key={'tr'+i} style={tr}>
                  <td style={td}>{t.driver}</td>
                  <td style={td}><Pill band={t.band} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── IMPORTANT NOTICE ───────────────────────────────────────────────
            Now rendered in the printed report itself. Previously the disclaimer
            was only shown on-screen as a pre-generation acknowledgment; once a
            saved PDF circulates to a third party that on-screen gate isn't
            attached to it, so the document carries its own notice. */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Important Notice</H>
          {DISCLAIMER_PARAS.map((para, i) => (
            <p key={'disc' + i} style={{ ...p, fontSize: 11, color: '#888784' }}>{para}</p>
          ))}
        </section>

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '0.5px solid #e8e7e4', fontSize: 11, color: '#888784', textAlign: 'center' }}>
          ThemisIQ Compliance Inc. · www.themisiq.co · Report ID {String(a.id).slice(0, 8)}… · Generated {reportDate}
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .report-body { padding: 0 !important; max-width: none !important; }
          body { background: white !important; }
          .page { page-break-inside: avoid; break-inside: avoid; }
          section.page { margin-top: 24px !important; }
          h2 { page-break-after: avoid; }
        }
        @page { size: A4; margin: 1.6cm 1.6cm 2cm; }
      `}</style>
    </div>
  )
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
function Stat({ label, val, color, bg }: { label: string; val: number; color: string; bg: string }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', color, lineHeight: 1 }}>{val}</div>
      <div style={{ fontSize: 11, color: '#555553', marginTop: 4 }}>{label}</div>
    </div>
  )
}
function Pill({ band }: { band: 'high' | 'med' | 'low' }) {
  const c = SEV[band]
  return <span style={{ background: c.bg, color: c.color, border: `0.5px solid ${c.border}`, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{band.toUpperCase()}</span>
}
function Centered({ children }: { children: any }) {
  return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui', color: '#555' }}>{children}</div>
}

function Matrix({ topics }: { topics: any[] }) {
  const W = 600, H = 400, padL = 56, padR = 20, padT = 20, padB = 48
  const midX = padL + 0.5 * (W - padL - padR)
  const midY = padT + 0.5 * (H - padT - padB)
  const color = (q: string) => q === 'both' ? '#A32D2D' : (q === 'financial' || q === 'impact') ? '#ba7517' : '#888784'

  // Offset dots that would land on top of an earlier-placed dot so labels stay readable.
  // 8 directions in a small circle; first collision -> right, second -> left, etc.
  const OFFSET = 16
  const OFFSETS: [number, number][] = [
    [0, 0], [OFFSET, 0], [-OFFSET, 0], [0, OFFSET], [0, -OFFSET],
    [OFFSET, OFFSET], [-OFFSET, -OFFSET], [OFFSET, -OFFSET], [-OFFSET, OFFSET],
  ]
  type Placed = { code: string; cx: number; cy: number; q: string }
  const placed: Placed[] = []
  for (const t of topics) {
    const bx = Math.round(padL + (t.impact / 10) * (W - padL - padR))
    const by = Math.round(padT + (1 - t.financial / 10) * (H - padT - padB))
    let collisions = 0
    for (const pp of placed) {
      const dx = bx - pp.cx, dy = by - pp.cy
      if (dx * dx + dy * dy < 20 * 20) collisions++
    }
    const [ox, oy] = OFFSETS[Math.min(collisions, OFFSETS.length - 1)]
    placed.push({ code: t.code, cx: bx + ox, cy: by + oy, q: t.quadrant })
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10 }} role="img" aria-label="Double materiality matrix">
      <line x1={padL} y1={midY} x2={W - padR} y2={midY} stroke="#e8e7e4" strokeDasharray="4 4" />
      <line x1={midX} y1={padT} x2={midX} y2={H - padB} stroke="#e8e7e4" strokeDasharray="4 4" />
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#888784" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#888784" />
      <text x={padL - 8} y={padT + 10} textAnchor="end" fontSize="11" fill="#888784">High</text>
      <text x={padL - 8} y={H - padB} textAnchor="end" fontSize="11" fill="#888784">Low</text>
      <text x="18" y={H / 2} textAnchor="middle" fontSize="12" fill="#555553" transform={`rotate(-90 18 ${H / 2})`}>Financial materiality →</text>
      <text x={W / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="#555553">Impact materiality →</text>
      {placed.map(pp => (
        <g key={pp.code}>
          <circle cx={pp.cx} cy={pp.cy} r={15} fill={color(pp.q)} opacity={0.88} />
          <text x={pp.cx} y={pp.cy + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{pp.code}</text>
        </g>
      ))}
    </svg>
  )
}

function MatrixTable({ topics }: { topics: any[] }) {
  const sorted = [...topics].sort((a, b) => Math.max(b.financial, b.impact) - Math.max(a.financial, a.impact))
  const band = (v: number): 'high' | 'med' | 'low' => v >= 8 ? 'high' : v >= 5 ? 'med' : 'low'
  return (
    <table style={tbl}>
      <thead><tr style={trh}><th style={th}>ESRS topic</th><th style={th}>Financial</th><th style={th}>Impact</th></tr></thead>
      <tbody>
        {sorted.map(t => (
          <tr key={t.code} style={tr}>
            <td style={td}><span style={{ color: '#aaa', fontSize: 11 }}>{t.code}</span> {t.label}</td>
            <td style={td}><Pill band={band(t.financial)} /> <span style={{ fontSize: 11, color: '#888784', marginLeft: 4 }}>{t.financial.toFixed(1)}</span></td>
            <td style={td}><Pill band={band(t.impact)} /> <span style={{ fontSize: 11, color: '#888784', marginLeft: 4 }}>{t.impact.toFixed(1)}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}


// ─── Resilience report (multi-scenario) ───────────────────────────────────────
// Rendered when the saved record has results.analysisType === 'resilience'.
// Reuses the shared styles/components above; adds the six credibility registers.
function ResilienceReport({ a, reportDate }: { a: any; reportDate: string }) {
  const res = (a.results || {}).resilience || {}
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
    <>
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
    <p style={{ ...p, fontSize: 11, color: '#888784', marginTop: -6 }}>
      Bands (High / Moderate / Low) are the primary signal, calibrated separately per driver. The adjacent index is a relative screening score (higher = greater exposure) — comparable for a single item across the three scenarios, but not directly between different drivers{kind === 'transition' ? '; carbon pricing / policy also reflects jurisdiction intensity and is scored on a wider range than the other three drivers' : ''}.
    </p>
    </>
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
            <Row k="Legal entity" v={a.workings?.input?.legalEntity || a.company_name || '—'} />
            <Row k="Reporting period" v={a.workings?.input?.reportingPeriod || 'FY2025'} />
            <Row k="Primary sector" v={SECTOR_LABEL[a.industry_code] || a.industry_code} />
            <Row k="Operating regions (IPCC AR6)" v={(a.region_codes || []).map((c: string) => `${REGION_LABEL[c] || c} (${c})`).join(', ') || '—'} />
            <Row k="Policy jurisdictions" v={(a.jurisdiction_codes || []).map((c: string) => JURISDICTION_LABEL[c] || c).join(', ') || '—'} />
            <Row k="Scenarios tested" v={trio.map((t: any) => `${roleLabel[t.role]} (${t.warming})`).join(', ') || 'Diverse trio'} />
            <Row k="Time horizon" v={`${a.horizon} term`} />
            <Row k="Asset profile" v={a.asset_profile} />
            <Row k="Model version" v={a.model_version || res.modelVersion || '—'} />
            <Row k="Report date" v={reportDate} />
          </div>
        </section>

        {/* RESILIENCE CONCLUSION */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Resilience conclusion</H>
          <p style={p}>{syn.statement}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, margin: '0 0 8px' }}>
            <TextStat label="Two-channel exposure" v={syn.twoChannel === 'both' ? 'Both transition & physical' : syn.twoChannel === 'transition-led' ? 'Transition-led' : syn.twoChannel === 'physical-led' ? 'Physical-led' : 'Limited'} />
            <TextStat label="Profile swing" v={`${syn.profileSwing?.magnitude ?? '—'} (${syn.profileSwing?.parisRiskCount ?? 0}→${syn.profileSwing?.highRiskCount ?? 0})`} />
            <TextStat label="Horizon trend" v={syn.horizonNote === 'worsens' ? 'Worsens toward 2050' : 'Stable over time'} />
          </div>
        </section>

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
          <p style={p}>This satisfies the explicit requirements of both frameworks: IFRS S2 paragraph 22 requires a diverse range of scenarios including one aligned with the latest international agreement (the Paris-aligned pathway above); CSRD/ESRS E1 requires consideration of at least a high-emissions scenario (the high-warming pathway above). Under both, the choice of scenarios and the rationale for that choice are themselves disclosable; this section documents that judgment.</p>
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

        {/* LIMITATIONS REGISTER — credibility register 5 */}
        <section className="page" style={{ marginTop: 48 }}>
          <H>Limitations</H>
          <ul style={ul}>
            <li style={li}>This is a <strong>qualitative</strong> resilience screening. It does not quantify per-scenario financial effects in monetary terms; both IFRS S2 and ESRS permit qualitative resilience assessment, particularly in early reporting years, but a full disclosure may require quantified anticipated financial effects.</li>
            <li style={li}>Scores are <strong>ordinal and relative</strong>, not absolute measures of probability or loss.</li>
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
          ThemisIQ Compliance Inc. · www.themisiq.co · Report ID {String(a.id).slice(0, 8)}… · Generated {reportDate}
        </div>
      </div>

      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .no-print { display: none !important; }
          .report-body { padding: 0 !important; max-width: none !important; }
          body { background: white !important; }
          .page { page-break-inside: avoid; break-inside: avoid; }
          section.page { margin-top: 24px !important; }
          h2 { page-break-after: avoid; }
        }
        @page { size: A4; margin: 1.6cm 1.6cm 2cm; }
      `}</style>
    </div>
  )
}

// join helper for the report's channel summaries
function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
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
