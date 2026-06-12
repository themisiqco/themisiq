'use client'

import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useEntitlement } from '../../../lib/useEntitlement'
import Nav from '../../components/Nav'

// ─── Design tokens (matching the live climate page) ───────────────────────────
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }

// severity palette (matches live climate page)
const SEV = {
  high: { label: 'HIGH', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  med:  { label: 'MED', color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  low:  { label: 'LOW', color: '#888784', bg: '#f8f7f5', border: '#e8e7e4' },
}

// opportunity palette — green to read as upside, distinct from the risk reds/ambers
const OPP = {
  high: { label: 'STRONG', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' },
  med:  { label: 'MODERATE', color: '#0C7C59', bg: '#E1F5EE', border: '#7FCBB4' },
  low:  { label: 'LIMITED', color: '#888784', bg: '#f8f7f5', border: '#e8e7e4' },
}

// ─── Static option data (mirrors the seeded DB) ───────────────────────────────
const SECTORS = [
  { code: 'energy', label: 'Energy & Utilities' }, { code: 'finance', label: 'Financial Services' },
  { code: 'realestate', label: 'Real Estate' }, { code: 'tech', label: 'Technology' },
  { code: 'health', label: 'Healthcare & Pharma' }, { code: 'manuf', label: 'Industrials & Manufacturing' },
  { code: 'retail', label: 'Consumer & Retail' }, { code: 'agri', label: 'Agriculture & Food' },
  { code: 'transport', label: 'Transport & Logistics' }, { code: 'extract', label: 'Mining & Metals' },
  { code: 'construction', label: 'Construction & Materials' }, { code: 'profservices', label: 'Professional Services' },
  { code: 'other', label: 'Other' },
]

const REGION_GROUPS: { group: string; regions: { code: string; label: string }[] }[] = [
  { group: 'North America', regions: [
    { code: 'NWN', label: 'North-Western North America' }, { code: 'NEN', label: 'North-Eastern North America' },
    { code: 'WNA', label: 'Western North America' }, { code: 'CNA', label: 'Central North America' },
    { code: 'ENA', label: 'Eastern North America' }, { code: 'CAR', label: 'Caribbean' },
  ]},
  { group: 'Europe', regions: [
    { code: 'NEU', label: 'Northern Europe' }, { code: 'WCE', label: 'Western & Central Europe' },
    { code: 'MED', label: 'Mediterranean' }, { code: 'EEU', label: 'Eastern Europe' },
  ]},
  { group: 'Asia & Middle East', regions: [
    { code: 'SAS', label: 'South Asia' }, { code: 'SEA', label: 'South-East Asia' },
    { code: 'EAS', label: 'East Asia' }, { code: 'ARP', label: 'Arabian Peninsula' }, { code: 'WCA', label: 'West Central Asia' },
  ]},
  { group: 'Africa', regions: [
    { code: 'WAF', label: 'Western Africa' }, { code: 'ESAF', label: 'East Southern Africa' },
  ]},
  { group: 'Australasia & Pacific', regions: [
    { code: 'EAU', label: 'Eastern Australia' }, { code: 'NAU', label: 'Northern Australia' }, { code: 'PAC', label: 'Pacific Small Islands' },
  ]},
]

// AR6 region coverage — "includes, broadly" (AR6 uses polygon boundaries, not country borders)
const REGION_COVERAGE: Record<string, string> = {
  NWN: 'Alaska, Yukon, north-western Canada, northern British Columbia',
  NEN: 'Eastern & Arctic Canada, Labrador, Greenland fringe',
  WNA: 'US West (California to the Rockies), south-western Canada, north-western Mexico',
  CNA: 'US Great Plains & Midwest, south-central Canada',
  ENA: 'US East Coast & Southeast, eastern Canada (southern Ontario/Quebec)',
  CAR: 'Caribbean islands, Cuba, Hispaniola, Puerto Rico, coastal Central America',
  NEU: 'UK, Ireland, Scandinavia, Baltics, northern Germany, Benelux, northern Poland',
  WCE: 'France, Germany, the Alps, Austria, Switzerland, Czechia, Hungary, northern Italy',
  MED: 'Spain, Italy, Greece, southern France, Portugal, coastal North Africa, Turkey, the Levant',
  EEU: 'Ukraine, Belarus, western Russia, Romania, Bulgaria, Baltic interior',
  SAS: 'India, Pakistan, Bangladesh, Nepal, Sri Lanka',
  SEA: 'Indonesia, Malaysia, Vietnam, Thailand, Philippines, Singapore',
  EAS: 'Eastern China, Japan, Korea, Taiwan',
  ARP: 'Saudi Arabia, UAE, Oman, Yemen and the Gulf states',
  WCA: 'Iran, Iraq, the Central Asian states, Afghanistan, the Caucasus',
  WAF: 'Nigeria, Ghana, Senegal, Ivory Coast — Sahel to Gulf of Guinea',
  ESAF: 'Kenya, Tanzania, Mozambique, Zambia, Zimbabwe, eastern South Africa',
  EAU: 'Eastern Australia (Queensland, NSW, Victoria coast)',
  NAU: 'Northern Australia (Northern Territory, north Queensland, the Kimberley)',
  PAC: 'Pacific island nations (Fiji, Samoa, Vanuatu, Micronesia and others)',
}

const JURISDICTIONS = [
  { code: 'eu_ets', label: 'EU (EU ETS)', desc: 'Operate facilities in, or import energy-intensive goods into, the EU.' },
  { code: 'cbam', label: 'EU CBAM exposure', desc: 'Sell steel, aluminium, cement, fertiliser, hydrogen, or electricity into the EU.' },
  { code: 'uk_ets', label: 'UK (UK ETS)', desc: 'Operate energy-intensive installations, power, or aviation in the UK.' },
  { code: 'ca', label: 'Canada (federal pricing)', desc: 'Operations in Canadian provinces under the federal carbon-pricing backstop.' },
  { code: 'us_fed', label: 'US (federal)', desc: 'US operations exposed to federal climate rules and SEC climate disclosure.' },
  { code: 'us_ca', label: 'US — California cap-and-trade', desc: 'Operations or large emissions sources located in California.' },
  { code: 'cn', label: 'China (national ETS)', desc: "Power or industrial operations covered by China's national emissions trading." },
  { code: 'kr', label: 'South Korea (K-ETS)', desc: "Operations covered by Korea's emissions trading scheme." },
  { code: 'jp', label: 'Japan', desc: "Operations exposed to Japan's GX carbon-pricing and disclosure regime." },
  { code: 'au', label: 'Australia (Safeguard)', desc: 'Run a facility above the Safeguard Mechanism emissions threshold.' },
  { code: 'nz', label: 'New Zealand (NZ ETS)', desc: "Operations covered by New Zealand's emissions trading scheme." },
  { code: 'ch', label: 'Switzerland (CH ETS)', desc: "Operations covered by the Swiss emissions trading scheme." },
  { code: 'in', label: 'India (CCTS)', desc: "Energy-intensive industrial facilities covered by India's mandatory Carbon Credit Trading Scheme." },
  { code: 'id', label: 'Indonesia (ETS)', desc: "Power-sector facilities covered by Indonesia's emissions trading scheme." },
  { code: 'sg', label: 'Singapore (carbon tax)', desc: 'Large emitters above 25,000 tCO₂e/yr liable under Singapore\u2019s carbon tax.' },
  { code: 'za', label: 'South Africa (carbon tax)', desc: "Operations liable under South Africa's carbon tax." },
  { code: 'mx', label: 'Mexico (carbon tax)', desc: "Operations liable under Mexico's federal or state carbon taxes." },
  { code: 'cl', label: 'Chile (carbon tax)', desc: "Large stationary sources liable under Chile's carbon tax." },
  { code: 'tw', label: 'Taiwan (carbon fee)', desc: "Large emitters liable under Taiwan's carbon fee." },
  { code: 'kz', label: 'Kazakhstan (ETS)', desc: "Facilities covered by Kazakhstan's emissions trading scheme." },
]

const SCENARIOS = [
  { code: 'ssp245', label: 'IPCC SSP2-4.5', descriptor: '~2.7°C', desc: "Middle-of-the-road: emissions stay near today's track and the world warms about 2.7°C by 2100. The common central case." },
  { code: 'ssp126', label: 'IPCC SSP1-2.6', descriptor: '~1.8°C', desc: 'A sustainable, cooperative, low-emissions world that keeps warming close to the Paris goal. The optimistic case.' },
  { code: 'ssp585', label: 'IPCC SSP5-8.5', descriptor: '~4.4°C', desc: 'Fossil-fuelled development where emissions keep rising, producing about 4.4°C of warming. The severe-physical-risk case.' },
  { code: 'ngfs_orderly', label: 'NGFS Orderly', descriptor: 'Early policy', desc: 'Early, gradual policy action — moderate transition risk and the lowest physical-risk path.' },
  { code: 'ngfs_disorderly', label: 'NGFS Disorderly', descriptor: 'Late, abrupt', desc: 'Late, sudden policy action — high transition risk from abrupt regulatory and market shifts.' },
  { code: 'ngfs_hothouse', label: 'NGFS Hot House', descriptor: 'Limited action', desc: 'Little further climate action — minimal transition risk but the most severe physical damage.' },
]

// ESRS topics with one-line plain-English descriptions (UX fix #2)
const ESRS_TOPICS = [
  { code: 'E1', label: 'Climate change', desc: 'Your greenhouse gas emissions and exposure to a changing climate.' },
  { code: 'E2', label: 'Pollution', desc: 'Air, water, and soil pollution your operations release.' },
  { code: 'E3', label: 'Water & marine resources', desc: 'Your water use and effect on water and marine ecosystems.' },
  { code: 'E4', label: 'Biodiversity & ecosystems', desc: 'Your impact on species, habitats, and land use.' },
  { code: 'E5', label: 'Resource use & circular economy', desc: 'Raw-material consumption, waste, and recyclability.' },
  { code: 'S1', label: 'Own workforce', desc: 'Working conditions, safety, and rights of your employees.' },
  { code: 'S2', label: 'Workers in the value chain', desc: 'Labour conditions among your suppliers and contractors.' },
  { code: 'S3', label: 'Affected communities', desc: 'Effect of your operations on local and indigenous communities.' },
  { code: 'S4', label: 'Consumers & end-users', desc: 'Health, safety, and rights of the people who use your products.' },
  { code: 'G1', label: 'Business conduct', desc: 'Ethics, anti-corruption, and responsible governance practices.' },
]

// Asset-profile descriptions (UX fix #1)
const ASSET_PROFILES = [
  { code: 'coastal', label: 'Coastal / low-lying', desc: 'Facilities near the sea or in flood plains. Raises coastal-flood and storm exposure.' },
  { code: 'inland', label: 'Inland / mixed', desc: 'Most operations away from the coast. Heat, drought, and wildfire matter more. Pick this if unsure.' },
  { code: 'water', label: 'Water-dependent operations', desc: 'You rely heavily on water (e.g. agriculture, manufacturing, power). Raises drought and water-stress sensitivity.' },
  { code: 'distributed', label: 'Distributed / asset-light', desc: 'Few physical assets (e.g. services, software). Your exposure is mainly indirect, via the supply chain.' },
]

// TCFD opportunity category descriptions (static — same for all industries)
const OPPORTUNITY_DESC: Record<string, string> = {
  'Resource efficiency': 'Lower operating costs through more efficient production, materials, transport, and energy use.',
  'Energy source': 'Shifting to low-carbon energy (renewables, PPAs, electrified process heat) and the savings that follow.',
  'Products & services': 'Developing low-emission products or services that meet rising demand for sustainable options.',
  'Markets': 'Accessing new markets and customer segments opened up by the low-carbon transition.',
  'Resilience': 'Strengthening adaptive capacity so the business withstands physical and transition climate pressures.',
}

type Mode = 's2' | 'csrd'
type Band = 'high' | 'med' | 'low'

// ─── Resilience map (scenario-response scatter) — kept identical to the PDF report ──
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

export default function MaterialityWizard() {
  const isPaid = useEntitlement('climate-risk')
  const [mode, setMode] = useState<Mode | null>(null)
  const [step, setStep] = useState(0)
  const [companyName, setCompanyName] = useState('')
  const [legalEntity, setLegalEntity] = useState('')
  const [reportingPeriod, setReportingPeriod] = useState('FY2025')
  const [openCoverage, setOpenCoverage] = useState<string | null>(null)
  const [industryCode, setIndustryCode] = useState('')
  const [regionCodes, setRegionCodes] = useState<string[]>([])
  const [jurisdictionCodes, setJurisdictionCodes] = useState<string[]>([])
  const [assetProfile, setAssetProfile] = useState('inland')
  const [scenarioCode, setScenarioCode] = useState('ssp245')
  const [horizon, setHorizon] = useState('medium')
  const [impactOverrides, setImpactOverrides] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [acknowledgedReport, setAcknowledgedReport] = useState(false)
  const [resilienceResult, setResilienceResult] = useState<any>(null)

  const SCENARIO_RATIONALE = "Yes — SSP2-4.5 (~2.7°C) is the most common starting choice and a reasonable middle case, so it's fine to leave it as-is. Change it only if you have a specific reason to test a more optimistic or more severe future. You can always re-run with a different scenario later."
  const HORIZON_RATIONALE = "Medium term (to 2040) is the default lens for a first screening. Companies with long-lived physical assets may prefer the long-term view."

  const stepNames = mode === 'csrd'
    ? ['Industry', 'Operating regions', 'Regulatory exposure', 'Scenario', 'Impact', 'Results']
    : ['Industry', 'Operating regions', 'Regulatory exposure', 'Scenario', 'Results']
  const resultsStep = stepNames.length - 1
  const isLastInputStep = step === resultsStep - 1

  const toggle = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])

  const canAdvance = () => {
    if (step === 0) return !!industryCode
    if (step === 1) return regionCodes.length > 0
    return true
  }

  async function submit() {
    setSubmitting(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('Please sign in to run an assessment.'); setSubmitting(false); return }
      const res = await fetch('/api/materiality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode, companyName, legalEntity, reportingPeriod, industryCode, regionCodes, jurisdictionCodes,
          assetProfile, scenarioCode, horizon, impactOverrides,
          rationale: {
            scenario: scenarioCode === 'ssp245' ? SCENARIO_RATIONALE : 'User-selected scenario.',
            horizon: horizon === 'medium' ? HORIZON_RATIONALE : 'User-selected horizon.',
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Assessment failed.'); setSubmitting(false); return }
      setResult(data.result); setResilienceResult(null); setSavedId(data.id); setStep(resultsStep)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.')
    } finally { setSubmitting(false) }
  }

  async function submitResilience() {
    setSubmitting(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('Please sign in to run an assessment.'); setSubmitting(false); return }
      const res = await fetch('/api/materiality/resilience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode, companyName, legalEntity, reportingPeriod, industryCode, regionCodes, jurisdictionCodes,
          assetProfile, horizon,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Resilience analysis failed.'); setSubmitting(false); return }
      setResilienceResult(data.resilience); setResult(null); setSavedId(data.id); setStep(resultsStep)
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.')
    } finally { setSubmitting(false) }
  }

  // ─── Mode gate ────────────────────────────────────────────────────────────
  if (!mode) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
        <Nav />
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 2.5rem' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Climate Risk &amp; Materiality</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Which assessment do you need?</h1>
          <p style={{ ...sectionSub, marginBottom: 24 }}>Assess your climate-related physical and transition risk, and determine what's material under your reporting standard. Double materiality adds impact materiality to single (financial) materiality. Choose the standard you report under.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { m: 's2' as Mode, t: 'IFRS S2', sub: 'Single (financial) materiality · resilience', d: 'How climate-related risks affect your enterprise value. Produces the multi-scenario climate resilience report — the resilience analysis IFRS S2 (and CSRD) call for.', feat: false },
              { m: 'csrd' as Mode, t: 'CSRD / ESRS', sub: 'Double materiality', d: 'Financial materiality plus impact materiality across all ten ESRS topics, plotted on the double-materiality matrix.', feat: true },
            ].map(o => (
              <div key={o.m} style={{ background: '#fff', border: o.feat ? '2px solid #7425e3' : '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#0d0d0d', marginBottom: 2 }}>{o.t}</div>
                <div style={{ fontSize: 13, color: '#7425e3', marginBottom: 10 }}>{o.sub}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, flex: 1, marginBottom: 16 }}>{o.d}</div>
                <button onClick={() => { setMode(o.m); setStep(0) }} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>Start {o.t} assessment</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ─── Input step renderers ───────────────────────────────────────────────────
  const renderIndustry = () => (
    <div>
      <h2 style={sectionHead}>Your industry</h2>
      <p style={sectionSub}>Determines your sensitivity to each climate hazard and your baseline relevance across sustainability topics.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name (optional)</label>
          <input style={inputStyle} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div>
          <label style={labelStyle}>Legal entity name</label>
          <input style={inputStyle} value={legalEntity} onChange={e => setLegalEntity(e.target.value)} placeholder="Acme Corporation Ltd." />
        </div>
        <div>
          <label style={labelStyle}>Reporting period</label>
          <select style={inputStyle} value={reportingPeriod} onChange={e => setReportingPeriod(e.target.value)}>
            <option value="FY2024">FY2024</option>
            <option value="FY2025">FY2025</option>
            <option value="FY2026">FY2026</option>
          </select>
        </div>
      </div>
      <label style={labelStyle}>Primary sector</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {SECTORS.map(s => {
          const sel = industryCode === s.code
          return <div key={s.code} onClick={() => setIndustryCode(s.code)} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', background: sel ? '#EDE9FE' : '#f8f7f5', fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? '#7425e3' : '#555553' }}>{s.label}</div>
        })}
      </div>
    </div>
  )

  const renderRegions = () => (
    <div>
      <h2 style={sectionHead}>Where do you operate?</h2>
      <p style={{ fontSize: 12, color: '#888784', lineHeight: 1.6, marginTop: -4, marginBottom: 12 }}>This step is about <strong style={{ color: '#555553' }}>physical location</strong> — where your assets sit, which drives weather and climate hazards. Whose climate laws apply comes in the next step.</p>
      <p style={sectionSub}><strong style={{ color: '#7425e3', fontWeight: 600 }}>Click the ⓘ on any region to see the countries it covers and confirm your operations fall within it.</strong> These follow the IPCC AR6 climate reference regions — each carries a distinct hazard profile that drives your physical-risk results.</p>
      {REGION_GROUPS.map(g => (
        <div key={g.group} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#555553', marginBottom: 8 }}>{g.group}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {g.regions.map(r => {
              const sel = regionCodes.includes(r.code)
              const open = openCoverage === r.code
              return (
                <div key={r.code} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, background: sel ? '#EDE9FE' : '#f8f7f5', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>
                    <div onClick={() => toggle(regionCodes, r.code, setRegionCodes)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, background: sel ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{sel && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}</div>
                      <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: sel ? '#7425e3' : '#555553' }}>{r.label} <span style={{ color: '#aaa', fontSize: 11 }}>{r.code}</span></span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setOpenCoverage(open ? null : r.code) }} title="What does this region cover?" style={{ width: 18, height: 18, borderRadius: '50%', border: `1px solid ${open ? '#7425e3' : '#c9c8c4'}`, background: open ? '#7425e3' : 'transparent', color: open ? '#fff' : '#888784', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, lineHeight: 1, padding: 0 }}>i</button>
                  </div>
                  {open && (
                    <div style={{ padding: '0 12px 10px 36px', fontSize: 11, color: '#888784', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 600, color: '#555553' }}>Includes, broadly:</span> {REGION_COVERAGE[r.code]}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Asset profile</label>
        {/* UX fix #1: prompt line explaining what asset profile is for */}
        <p style={{ fontSize: 12, color: '#888784', lineHeight: 1.6, marginTop: -2, marginBottom: 10 }}>Where most of your physical assets sit. This refines how the hazards above apply to you. If you're unsure, choose "Inland / mixed".</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {ASSET_PROFILES.map(a => {
            const sel = assetProfile === a.code
            return <div key={a.code} onClick={() => setAssetProfile(a.code)} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: sel ? '#EDE9FE' : '#f8f7f5' }}>
              <div style={{ fontSize: 13, fontWeight: sel ? 600 : 500, color: sel ? '#7425e3' : '#0d0d0d' }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 2, lineHeight: 1.5 }}>{a.desc}</div>
            </div>
          })}
        </div>
      </div>
    </div>
  )

  const renderJurisdictions = () => (
    <div>
      <h2 style={sectionHead}>Regulatory exposure</h2>
      {/* Contrast callback: distinguishes this step from Operating regions */}
      <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>Different from the last step</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}><em>Operating regions</em> was about where your assets physically sit — that drives weather and climate hazards. This step is about whose climate <em>laws</em> reach you — carbon costs and disclosure rules — which can include places you don't operate at all, like selling into the EU.</div>
      </div>
      <p style={sectionSub}>Tick every place where your company has operations, legal entities, or significant sales — those are where carbon-pricing and climate rules can reach you, even if you're not headquartered there. Not sure? Tick where you're based and where you earn most of your revenue. This drives transition risk, separately from your physical regions.</p>
      <p style={{ ...sectionSub, marginTop: -8 }}>Not every country prices carbon. Many economies still have no mandatory scheme — much of the Gulf and Middle East, most of Africa outside South Africa, and several South and Southeast Asian economies such as Pakistan, Bangladesh, Thailand, and Vietnam — so you may operate somewhere with nothing to tick here. That's expected: those operations still carry physical climate risk, captured in the previous step. Coverage is expanding quickly, so this list will grow.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {JURISDICTIONS.map(j => {
          const sel = jurisdictionCodes.includes(j.code)
          return <div key={j.code} onClick={() => toggle(jurisdictionCodes, j.code, setJurisdictionCodes)} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: sel ? '#EDE9FE' : '#f8f7f5', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, background: sel ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>{sel && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: sel ? 600 : 500, color: sel ? '#7425e3' : '#0d0d0d' }}>{j.label}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 2, lineHeight: 1.5 }}>{j.desc}</div>
            </div>
          </div>
        })}
      </div>
      <p style={{ fontSize: 11, color: '#888784', lineHeight: 1.6, marginTop: 12 }}>These are simplified guides — each scheme has its own thresholds and exceptions, so check the specific rules if you're near a threshold.</p>
    </div>
  )

  const renderScenario = () => (
    <div>
      <h2 style={sectionHead}>Scenario & time horizon</h2>
      <p style={sectionSub}>We've pre-selected sensible defaults. Higher-warming pathways raise physical risk; faster-policy pathways raise transition risk.</p>
      {/* UX: plain-English "what is a scenario?" explainer */}
      <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>What's a climate scenario?</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>A scenario is a plausible future used to stress-test your business — not a prediction. Each one describes how far the world warms and how fast climate policy tightens. Higher-warming futures raise physical risk (floods, heat, storms); faster-policy futures raise transition risk (carbon costs, market shifts). Good practice is to test more than one. We've picked a sensible default below — you can keep it.</div>
      </div>
      <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>Why this default — and can I just keep it?</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{SCENARIO_RATIONALE}</div>
      </div>
      <label style={labelStyle}>Scenario</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {SCENARIOS.map(s => {
          const sel = scenarioCode === s.code
          return <div key={s.code} onClick={() => setScenarioCode(s.code)} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: sel ? '#EDE9FE' : '#f8f7f5' }}>
            <div style={{ fontSize: 13, fontWeight: sel ? 600 : 500, color: sel ? '#7425e3' : '#0d0d0d' }}>{s.label}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginTop: 2 }}>{s.descriptor}</div>
            <div style={{ fontSize: 11, color: '#888784', marginTop: 4, lineHeight: 1.45 }}>{s.desc}</div>
          </div>
        })}
      </div>
      <label style={labelStyle}>Time horizon</label>
      <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{HORIZON_RATIONALE}</div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[{ v: 'short', l: 'To 2030' }, { v: 'medium', l: 'To 2040' }, { v: 'long', l: 'To 2050+' }].map(h => {
          const sel = horizon === h.v
          return <div key={h.v} onClick={() => setHorizon(h.v)} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '9px 16px', cursor: 'pointer', background: sel ? '#EDE9FE' : '#f8f7f5', fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? '#7425e3' : '#555553' }}>{h.l}</div>
        })}
      </div>
    </div>
  )

  const renderImpact = () => (
    <div>
      <h2 style={sectionHead}>Impact materiality</h2>
      <p style={sectionSub}>The inside-out view: how much does your business affect each ESRS topic? Pre-filled from your industry — adjust to your reality. This axis is what makes the assessment "double".</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ESRS_TOPICS.map(t => {
          const cur = impactOverrides[t.code]
          return (
            <div key={t.code} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8f7f5', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#0d0d0d' }}><span style={{ color: '#aaa', fontSize: 11 }}>{t.code}</span> {t.label}</div>
                {/* UX fix #2: one-line description per topic */}
                <div style={{ fontSize: 11, color: '#888784', marginTop: 2, lineHeight: 1.5 }}>{t.desc}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {[{ l: 'low', v: 2 }, { l: 'med', v: 5 }, { l: 'high', v: 8 }].map(o => {
                  const sel = cur === o.v
                  return <button key={o.l} onClick={() => setImpactOverrides(prev => ({ ...prev, [t.code]: o.v }))} style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${sel ? '#7425e3' : '#e8e7e4'}`, background: sel ? '#7425e3' : '#fff', color: sel ? '#fff' : '#555553', fontWeight: sel ? 600 : 400 }}>{o.l}</button>
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 11, color: '#888784', marginTop: 12, lineHeight: 1.6 }}>Topics you don't adjust use the industry-baseline impact score.</p>
    </div>
  )

  // ─── Results rendering (stage two) ────────────────────────────────────────
  const pill = (label: string, band: Band, sub?: string) => {
    const c = SEV[band]
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: c.bg, color: c.color, fontSize: 12, padding: '4px 10px', borderRadius: 99, margin: '0 6px 6px 0', border: `0.5px solid ${c.border}` }}>
        {label}{sub && <span style={{ fontSize: 10, opacity: 0.75 }}>{sub}</span>}<span style={{ fontSize: 10, fontWeight: 700 }}>{c.label}</span>
      </span>
    )
  }

  // opportunity pill — green palette, reads as upside
  const oppPill = (label: string, band: Band) => {
    const c = OPP[band]
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: c.bg, color: c.color, fontSize: 12, padding: '4px 10px', borderRadius: 99, margin: '0 6px 6px 0', border: `0.5px solid ${c.border}` }}>
        {label}<span style={{ fontSize: 10, fontWeight: 700 }}>{c.label}</span>
      </span>
    )
  }

  const renderMatrix = () => {
    const topics: any[] = result?.matrix || []
    const W = 500, H = 360, padL = 48, padR = 16, padT = 16, padB = 40
    const midX = padL + 0.5 * (W - padL - padR)
    const midY = padT + 0.5 * (H - padT - padB)
    const dotColor = (q: string) => q === 'both' ? '#A32D2D' : (q === 'financial' || q === 'impact') ? '#ba7517' : '#888784'

    // Offset overlapping dots so labels remain readable when topics share coordinates
    const OFFSET = 14
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
      for (const p of placed) {
        const dx = bx - p.cx, dy = by - p.cy
        if (dx * dx + dy * dy < 18 * 18) collisions++
      }
      const [ox, oy] = OFFSETS[Math.min(collisions, OFFSETS.length - 1)]
      placed.push({ code: t.code, cx: bx + ox, cy: by + oy, q: t.quadrant })
    }

    return (
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1rem', marginBottom: 12 }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Double materiality matrix">
          {/* quadrant midlines */}
          <line x1={padL} y1={midY} x2={W - padR} y2={midY} stroke="#e8e7e4" strokeDasharray="4 4" />
          <line x1={midX} y1={padT} x2={midX} y2={H - padB} stroke="#e8e7e4" strokeDasharray="4 4" />
          {/* axes */}
          <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#888784" />
          <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="#888784" />
          {/* axis labels */}
          <text x={padL - 8} y={padT + 8} textAnchor="end" fontSize="11" fill="#888784">High</text>
          <text x={padL - 8} y={H - padB} textAnchor="end" fontSize="11" fill="#888784">Low</text>
          <text x="14" y={H / 2} textAnchor="middle" fontSize="12" fill="#555553" transform={`rotate(-90 14 ${H / 2})`}>Financial materiality →</text>
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="#555553">Impact materiality →</text>
          {/* dots */}
          {placed.map(p => (
            <g key={p.code}>
              <circle cx={p.cx} cy={p.cy} r={13} fill={dotColor(p.q)} opacity={0.85} />
              <text x={p.cx} y={p.cy + 4} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">{p.code}</text>
            </g>
          ))}
        </svg>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#555553' }}>
          {[['#A32D2D', 'Material on both'], ['#ba7517', 'Material on one axis'], ['#888784', 'Lower priority']].map(([c, l]) => (
            <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' }} />{l}</span>
          ))}
        </div>
      </div>
    )
  }

  const renderMatrixTable = () => {
    const topics: any[] = [...(result?.matrix || [])].sort((a, b) => Math.max(b.financial, b.impact) - Math.max(a.financial, a.impact))
    const bandOf = (v: number): Band => v >= 8 ? 'high' : v >= 5 ? 'med' : 'low'
    const mini = (band: Band, val: number) => {
      const c = SEV[band]
      return <span style={{ background: c.bg, color: c.color, fontSize: 12, padding: '3px 9px', borderRadius: 6, border: `0.5px solid ${c.border}` }}>{c.label} · {val.toFixed(1)}</span>
    }
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1rem 1.25rem', marginBottom: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#888784' }}>
              <th style={{ padding: '6px 4px', fontWeight: 600, width: '46%' }}>ESRS topic</th>
              <th style={{ padding: '6px 4px', fontWeight: 600 }}>Financial</th>
              <th style={{ padding: '6px 4px', fontWeight: 600 }}>Impact</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t: any) => (
              <tr key={t.code} style={{ borderTop: '0.5px solid #e8e7e4' }}>
                <td style={{ padding: '8px 4px', color: '#0d0d0d' }}><span style={{ color: '#aaa', fontSize: 11 }}>{t.code}</span> {t.label}</td>
                <td style={{ padding: '8px 4px' }}>{mini(bandOf(t.financial), t.financial)}</td>
                <td style={{ padding: '8px 4px' }}>{mini(bandOf(t.impact), t.impact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderRegister = () => {
    const phys: any[] = result?.physical || []
    const trans: any[] = result?.transition || []
    return (
      <>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '3px solid #ba7517', borderRadius: '0 14px 14px 0', padding: '1rem', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 2 }}>Physical risks <span style={{ fontWeight: 400, color: '#aaa', fontSize: 12 }}>industry × geography × scenario</span></div>
          <p style={{ fontSize: 12, color: '#888784', margin: '0 0 12px' }}>Flagged only where your industry sensitivity meets real regional hazard exposure.</p>
          <div>{phys.length ? phys.map((p: any, i: number) => <span key={'p'+i}>{pill(p.hazard, p.band, 'in ' + p.drivingRegion)}</span>) : <span style={{ fontSize: 13, color: '#888784' }}>No material physical risks at this intersection.</span>}</div>
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '3px solid #534AB7', borderRadius: '0 14px 14px 0', padding: '1rem', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 12 }}>Transition risks <span style={{ fontWeight: 400, color: '#aaa', fontSize: 12 }}>industry carbon × jurisdiction × scenario</span></div>
          <div>{trans.length ? trans.map((t: any, i: number) => <span key={'t'+i}>{pill(t.driver, t.band)}</span>) : <span style={{ fontSize: 13, color: '#888784' }}>None flagged.</span>}</div>
        </div>
      </>
    )
  }

  // climate opportunities — TCFD five categories, green to read as upside
  const renderOpportunities = () => {
    const opps: any[] = result?.opportunities || []
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '3px solid #0F6E56', borderRadius: '0 14px 14px 0', padding: '1rem', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 2 }}>Climate opportunities <span style={{ fontWeight: 400, color: '#aaa', fontSize: 12 }}>TCFD categories · industry × scenario</span></div>
        <p style={{ fontSize: 12, color: '#888784', margin: '0 0 12px' }}>The upside view IFRS S2 and TCFD ask for alongside risk — where the transition creates opportunity for your industry.</p>
        {opps.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {opps.map((o: any, i: number) => (
              <div key={'o'+i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#0d0d0d', fontWeight: 500 }}>{o.label}</div>
                  <div style={{ fontSize: 11, color: '#888784', marginTop: 1, lineHeight: 1.5 }}>{OPPORTUNITY_DESC[o.label] || ''}</div>
                </div>
                <div style={{ flexShrink: 0 }}>{oppPill('', o.band)}</div>
              </div>
            ))}
          </div>
        ) : <span style={{ fontSize: 13, color: '#888784' }}>No opportunity profile available for this industry yet.</span>}
      </div>
    )
  }

  const renderResults = () => {
    const ind = SECTORS.find(s => s.code === industryCode)?.label || industryCode
    const sc = SCENARIOS.find(s => s.code === scenarioCode)
    const s = result?.summary || {}
    return (
      <div>
        <h2 style={sectionHead}>{mode === 'csrd' ? 'Double materiality results' : 'Climate risk results'}</h2>
        <p style={sectionSub}>{mode === 'csrd' ? 'Each ESRS topic plotted on both axes. Top-right (material on both) is your highest reporting priority.' : 'Your physical and transition climate risk profile under the selected scenario.'}</p>

        {/* summary header */}
        <div style={{ background: '#f8f7f5', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Summary</div>
          <div style={{ fontSize: 15, color: '#0d0d0d', marginBottom: 4 }}><strong>{companyName || ind}</strong> · {regionCodes.length} region(s) · {jurisdictionCodes.length} jurisdiction(s)</div>
          <div style={{ fontSize: 13, color: '#888784' }}>{ind} · {sc?.label} ({sc?.descriptor}) · {horizon} term</div>
        </div>

        {/* count cards */}
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'csrd' ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#FCEBEB', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}><div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#B91C1C' }}>{s.physicalHigh ?? 0}</div><div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>High physical risks</div></div>
          <div style={{ background: '#FEF3E2', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}><div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#ba7517' }}>{s.transitionHigh ?? 0}</div><div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>High transition risks</div></div>
          <div style={{ background: '#E1F5EE', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}><div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#0F6E56' }}>{s.opportunitiesStrong ?? 0}</div><div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>Strong opportunities</div></div>
          {mode === 'csrd' && <div style={{ background: '#EDE9FE', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}><div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#7425e3' }}>{s.topicsBothAxes ?? 0}</div><div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>Topics material on both axes</div></div>}
        </div>

        {isPaid ? (
          <>
            {mode === 'csrd' && renderMatrix()}
            {mode === 'csrd' && renderMatrixTable()}
            {renderRegister()}
            {renderOpportunities()}
          </>
        ) : (
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <div style={{ filter: 'blur(6px)', pointerEvents: 'none', userSelect: 'none' }} aria-hidden="true">
              {mode === 'csrd' && renderMatrix()}
              {mode === 'csrd' && renderMatrixTable()}
              {renderRegister()}
              {renderOpportunities()}
            </div>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div style={{ background: '#0d0d0d', borderRadius: 16, padding: '2rem 1.75rem', maxWidth: 420, textAlign: 'center', boxShadow: '0 12px 40px rgba(13,13,13,0.28)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>Preview</div>
                <h3 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: '1.4rem', color: '#fff', margin: '0 0 10px', lineHeight: 1.3 }}>Unlock your full assessment</h3>
                <p style={{ fontSize: 13, fontWeight: 300, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 20px' }}>You can see your headline results above. Unlock the Climate Risk module to view the full materiality matrix, topic-by-topic scores, risk register, and download the report.</p>
                <a href="/pricing" style={{ display: 'inline-block', padding: '11px 26px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>See pricing &amp; unlock &rarr;</a>
              </div>
            </div>
          </div>
        )}

        {/* honesty footnote */}
        <div style={{ background: '#E6F1FB', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#0C447C', lineHeight: 1.6, marginBottom: 12 }}>
          Screening output, built on IPCC AR6 climatic impact-drivers, TCFD risk{mode === 'csrd' ? ' and opportunity categories, and the ten ESRS topics' : ' and opportunity categories'} — all public frameworks. This is a structured first pass to scope a formal assessment, not a disclosure. Refine weightings with your own materiality assessment.
        </div>

        {/* acknowledgment block — required before download */}
        {savedId && (
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555553', marginBottom: 10 }}>Before you download — limitations and disclaimer</div>

            <p style={{ fontSize: 12, color: '#555553', lineHeight: 1.7, margin: '0 0 10px' }}>
              <strong>This is a screening, not a formal {mode === 'csrd' ? 'CSRD / ESRS double materiality assessment' : 'IFRS S2 disclosure'}.</strong> Before publication, the following are required:
            </p>
            <ul style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, paddingLeft: 20, margin: '0 0 12px' }}>
              {mode === 'csrd' && <li style={{ marginBottom: 4 }}>A defined materiality threshold agreed and documented by your governance body.</li>}
              {mode === 'csrd' && <li style={{ marginBottom: 4 }}>Stakeholder engagement informing the impact-materiality axis, as ESRS requires.</li>}
              <li style={{ marginBottom: 4 }}>Validation of starter scoring values against your entity's own operations and supplementary data.</li>
              <li style={{ marginBottom: 4 }}>Resilience testing across a range of climate scenarios, not the central case alone.</li>
              <li style={{ marginBottom: 4 }}>Independent professional review of the determined material topics prior to publication.</li>
            </ul>

            <p style={{ fontSize: 11, color: '#888784', lineHeight: 1.7, margin: '12px 0', paddingTop: 12, borderTop: '0.5px solid #e8e7e4' }}>
              This report is generated by the ThemisIQ platform and is provided for informational and planning purposes only. It does not constitute legal advice, regulatory assurance, or a professional opinion. The accuracy of this output depends on the accuracy of data provided. ThemisIQ Compliance Inc. does not accept responsibility for regulatory filings made on the basis of platform outputs without independent professional review. ThemisIQ is not an accredited assurance provider under any GHG Protocol, CARB, ESRS, or CDP framework.
            </p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #e8e7e4' }}>
              <input type="checkbox" checked={acknowledgedReport} onChange={e => setAcknowledgedReport(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#0d0d0d', lineHeight: 1.6 }}>
                I acknowledge that this report is a screening intended to scope a formal assessment, and I accept the limitations and disclaimer above. I am responsible for the steps listed before any regulatory submission.
              </span>
            </label>
          </div>
        )}

        {/* download report — disabled until acknowledgment */}
        {savedId && (
          acknowledgedReport ? (
            <a href={`/dashboard/materiality/report?id=${savedId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', textDecoration: 'none', marginBottom: 8 }}>
              ⬇ Download {mode === 'csrd' ? 'CSRD' : 'IFRS S2'} report (PDF)
            </a>
          ) : (
            <button disabled style={{ fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, background: '#e8e7e4', color: '#888784', border: 'none', cursor: 'not-allowed', marginBottom: 8 }}>
              ⬇ Download {mode === 'csrd' ? 'CSRD' : 'IFRS S2'} report (PDF)
            </button>
          )
        )}
      </div>
    )
  }

  // ─── Resilience analysis results (multi-scenario) ─────────────────────────
  const renderResilience = () => {
    const r = resilienceResult
    if (!r) return null
    const ind = SECTORS.find(s => s.code === industryCode)?.label || industryCode
    const syn = r.synthesis || {}
    const trio: any[] = r.trio || []
    const items: any[] = r.items || []
    const physical = items.filter(i => i.kind === 'physical')
    const transition = items.filter(i => i.kind === 'transition')
    const opportunity = items.filter(i => i.kind === 'opportunity')

    const roleLabel: Record<string, string> = { paris: 'Paris-aligned', middle: 'Current trajectory', high: 'High warming' }
    const clsLabel: Record<string, string> = {
      'persistent': 'Persistent', 'warming-contingent': 'Warming-driven',
      'policy-path-contingent': 'Policy-driven', 'low-across-futures': 'Low across futures',
    }
    const clsColor: Record<string, { bg: string; color: string; border: string }> = {
      'persistent': { bg: '#FCEBEB', color: '#B91C1C', border: '#B91C1C' },
      'warming-contingent': { bg: '#FEF3E2', color: '#ba7517', border: '#ba7517' },
      'policy-path-contingent': { bg: '#EDE9FE', color: '#7425e3', border: '#7425e3' },
      'low-across-futures': { bg: '#f8f7f5', color: '#888784', border: '#e8e7e4' },
    }
    const cellBox = (band: Band, score: number, kind: string) => {
      const c = kind === 'opportunity' ? OPP[band] : SEV[band]
      return (
        <div style={{ background: c.bg, color: c.color, border: `0.5px solid ${c.border}`, borderRadius: 6, padding: '4px 8px', fontSize: 11, textAlign: 'center', minWidth: 64 }}>
          <div style={{ fontWeight: 700 }}>{c.label}</div>
          <div style={{ fontSize: 10, opacity: 0.8 }}>{score}</div>
        </div>
      )
    }
    const clsTag = (cls: string) => {
      const c = clsColor[cls] || clsColor['low-across-futures']
      return <span style={{ background: c.bg, color: c.color, border: `0.5px solid ${c.border}`, borderRadius: 99, padding: '2px 9px', fontSize: 10, fontWeight: 600 }}>{clsLabel[cls] || cls}</span>
    }

    const itemRows = (list: any[], kind: string) => (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#888784' }}>
              <th style={{ padding: '6px 8px', fontWeight: 600, minWidth: 150 }}>Item</th>
              {trio.map((t: any) => (
                <th key={t.role} style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'center' }}>{roleLabel[t.role]}<div style={{ fontSize: 10, fontWeight: 400, color: '#aaa' }}>{t.warming}</div></th>
              ))}
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Pattern</th>
            </tr>
          </thead>
          <tbody>
            {list.map((it: any, i: number) => {
              const cellByRole = (role: string) => it.cells.find((c: any) => c.role === role)
              return (
                <tr key={kind + i} style={{ borderTop: '0.5px solid #e8e7e4' }}>
                  <td style={{ padding: '8px', color: '#0d0d0d', verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 500 }}>{it.label}</div>
                    <div style={{ fontSize: 10, color: '#aaa', marginTop: 1 }}>{kind === 'physical' ? 'in ' + it.driver : kind === 'transition' ? it.driver : ''}</div>
                  </td>
                  {trio.map((t: any) => {
                    const c = cellByRole(t.role)
                    return <td key={t.role} style={{ padding: '8px', textAlign: 'center', verticalAlign: 'top' }}>{c ? cellBox(c.band, c.score, kind) : '—'}</td>
                  })}
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>{clsTag(it.classification)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 8 }}>
          {list.map((it: any, i: number) => (
            <div key={'int' + kind + i} style={{ fontSize: 11, color: '#888784', lineHeight: 1.55, marginBottom: 3 }}>{it.interpretation}</div>
          ))}
        </div>
      </div>
    )

    return (
      <div>
        <h2 style={sectionHead}>Climate resilience analysis</h2>
        <p style={sectionSub}>Your risk and opportunity profile tested across a diverse range of climate futures — the multi-scenario resilience assessment IFRS S2 and CSRD/ESRS ask for.</p>

        {/* trio header — provenance inline */}
        <div style={{ background: '#f8f7f5', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Scenarios tested</div>
          <div style={{ fontSize: 15, color: '#0d0d0d', marginBottom: 8 }}><strong>{companyName || ind}</strong> · {ind} · {horizon} term</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {trio.map((t: any) => (
              <div key={t.role} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>{roleLabel[t.role]}</div>
                <div style={{ fontSize: 11, color: '#888784' }}>{t.warming} · {t.source}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.6, marginTop: 10 }}>
            These three pathways span a low-warming Paris-aligned future, a current-trajectory middle case, and a high-warming case — a diverse range that stresses both transition and physical risk, and includes a Paris-aligned scenario as IFRS S2 requires.
          </div>
        </div>

        {/* resilience synthesis statement — the "so what" */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '3px solid #7425e3', borderRadius: '0 14px 14px 0', padding: '1.25rem', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 8 }}>Resilience read</div>
          <p style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, margin: 0 }}>{syn.statement}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 14 }}>
            <div style={{ background: '#f8f7f5', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#888784' }}>Two-channel exposure</div>
              <div style={{ fontSize: 12, color: '#0d0d0d', marginTop: 2 }}>{syn.twoChannel === 'both' ? 'Both transition & physical' : syn.twoChannel === 'transition-led' ? 'Transition-led' : syn.twoChannel === 'physical-led' ? 'Physical-led' : 'Limited'}</div>
            </div>
            <div style={{ background: '#f8f7f5', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#888784' }}>Scenario profile</div>
              <div style={{ fontSize: 12, color: '#0d0d0d', marginTop: 2 }}>{syn.inverts ? 'Channels invert' : `${syn.profileSwing?.magnitude ?? '—'} shift`}</div>
            </div>
            <div style={{ background: '#f8f7f5', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#888784' }}>Horizon trend</div>
              <div style={{ fontSize: 12, color: '#0d0d0d', marginTop: 2 }}>{syn.horizonNote === 'worsens' ? 'Worsens toward 2050' : 'Stable over time'}</div>
            </div>
          </div>
        </div>

        {/* resilience map — hero visual, matches the PDF report */}
        {(physical.length > 0 || transition.length > 0) && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>Resilience map</div>
            <p style={{ fontSize: 12, color: '#888784', lineHeight: 1.6, margin: '0 0 12px' }}>Each risk is positioned by its exposure under a rapid-policy (Paris-aligned) future and under a high-warming future. Risks toward the top-right are material whichever way the future unfolds; the spread between the physical group (toward the top) and the transition group (toward the right) is the two-channel exposure. Axes use the calibrated bands (Low / Moderate / High).</p>
            <ResilienceMap items={items} />
          </div>
        )}

        {/* comparison grids */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '3px solid #ba7517', borderRadius: '0 14px 14px 0', padding: '1rem', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 10 }}>Physical risks across scenarios</div>
          {physical.length ? itemRows(physical, 'physical') : <span style={{ fontSize: 13, color: '#888784' }}>No material physical risks at this intersection.</span>}
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '3px solid #534AB7', borderRadius: '0 14px 14px 0', padding: '1rem', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 10 }}>Transition risks across scenarios</div>
          {transition.length ? itemRows(transition, 'transition') : <span style={{ fontSize: 13, color: '#888784' }}>None flagged.</span>}
        </div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '3px solid #0F6E56', borderRadius: '0 14px 14px 0', padding: '1rem', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 10 }}>Opportunities across scenarios</div>
          {opportunity.length ? itemRows(opportunity, 'opportunity') : <span style={{ fontSize: 13, color: '#888784' }}>No opportunity profile available for this industry yet.</span>}
        </div>

        {/* honesty footnote */}
        <div style={{ background: '#E6F1FB', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#0C447C', lineHeight: 1.6, marginBottom: 12 }}>
          Screening-level resilience analysis across IPCC AR6 scenarios (SSP1-2.6, SSP2-4.5, SSP5-8.5). Qualitative classifications are rules-derived from the scored profile; final resilience determination is a matter for management judgement informed by entity-specific data. Not a formal disclosure.
        </div>

        {/* acknowledgment + download, reusing the same gate */}
        {savedId && (
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555553', marginBottom: 10 }}>Before you download — limitations and disclaimer</div>
            <p style={{ fontSize: 12, color: '#555553', lineHeight: 1.7, margin: '0 0 10px' }}>
              <strong>This is a screening-level resilience analysis, not a formal {mode === 'csrd' ? 'CSRD / ESRS' : 'IFRS S2'} disclosure.</strong> Scenario classifications are derived from starter scoring values and require validation against your entity's own data and circumstances before publication.
            </p>
            <p style={{ fontSize: 11, color: '#888784', lineHeight: 1.7, margin: '12px 0', paddingTop: 12, borderTop: '0.5px solid #e8e7e4' }}>
              This report is generated by the ThemisIQ platform for informational and planning purposes only. It does not constitute legal advice, regulatory assurance, or a professional opinion. ThemisIQ Compliance Inc. does not accept responsibility for regulatory filings made on the basis of platform outputs without independent professional review.
            </p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginTop: 12, paddingTop: 12, borderTop: '0.5px solid #e8e7e4' }}>
              <input type="checkbox" checked={acknowledgedReport} onChange={e => setAcknowledgedReport(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#0d0d0d', lineHeight: 1.6 }}>I acknowledge that this resilience analysis is a screening intended to scope a formal assessment, and I accept the limitations and disclaimer above.</span>
            </label>
          </div>
        )}
        {savedId && (
          acknowledgedReport ? (
            <a href={`/dashboard/climate-risk/report?id=${savedId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', textDecoration: 'none', marginBottom: 8 }}>
              ⬇ Download resilience report (PDF)
            </a>
          ) : (
            <button disabled style={{ fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, background: '#e8e7e4', color: '#888784', border: 'none', cursor: 'not-allowed', marginBottom: 8 }}>
              ⬇ Download resilience report (PDF)
            </button>
          )
        )}
      </div>
    )
  }

  const renderStep = () => {
    if (step === resultsStep) return resilienceResult ? renderResilience() : renderResults()
    if (step === 0) return renderIndustry()
    if (step === 1) return renderRegions()
    if (step === 2) return renderJurisdictions()
    if (step === 3) return renderScenario()
    if (mode === 'csrd' && step === 4) return renderImpact()
    return null
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Climate Risk &amp; Materiality</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>{mode === 'csrd' ? 'CSRD double materiality' : 'IFRS S2 single materiality'}</div>
          </div>
          <button onClick={() => { setMode(null); setStep(0); setResult(null) }} style={{ fontSize: 12, color: '#888784', background: 'none', border: '1px solid #e8e7e4', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Switch mode</button>
        </div>
      </div>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {stepNames.map((name, i) => (
            <div key={i} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, whiteSpace: 'nowrap' }}>{i + 1}. {name}</div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
          {renderStep()}
          {error && <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '12px 14px', marginTop: 16, fontSize: 13, color: '#B91C1C' }}>{error}</div>}

          {step !== resultsStep ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
              {isLastInputStep ? (
                mode === 'csrd' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button onClick={submitResilience} disabled={submitting || !canAdvance()} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: '#fff', color: '#0d0d0d', border: '1px solid #e8e7e4', cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !canAdvance()) ? 0.5 : 1 }}>{submitting ? 'Running…' : 'Run resilience analysis →'}</button>
                      <button onClick={submit} disabled={submitting || !canAdvance()} style={{ fontSize: 13, fontWeight: 600, padding: '9px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !canAdvance()) ? 0.5 : 1 }}>{submitting ? 'Running…' : 'Run double materiality assessment →'}</button>
                    </div>
                    <div style={{ fontSize: 11, color: '#888784', textAlign: 'right', maxWidth: 400, lineHeight: 1.5 }}>Double materiality plots all ten ESRS topics on the financial × impact matrix using your inputs above. Resilience tests three diverse climate futures (Paris-aligned, current trajectory, high warming). Both are disclosable under CSRD/ESRS — each is saved as its own report.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <button onClick={submitResilience} disabled={submitting || !canAdvance()} style={{ fontSize: 13, fontWeight: 600, padding: '9px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !canAdvance()) ? 0.5 : 1 }}>{submitting ? 'Running…' : 'Run resilience analysis →'}</button>
                    <div style={{ fontSize: 11, color: '#888784', textAlign: 'right', maxWidth: 320, lineHeight: 1.5 }}>Recommended. Tests three diverse climate futures (Paris-aligned, current trajectory, high warming) — what IFRS S2 and CSRD ask for.</div>
                  </div>
                )
              ) : (
                <button onClick={() => canAdvance() && setStep(s => s + 1)} disabled={!canAdvance()} style={{ fontSize: 13, fontWeight: 500, padding: '9px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: canAdvance() ? 'pointer' : 'not-allowed', opacity: canAdvance() ? 1 : 0.5 }}>Next →</button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button onClick={() => { setStep(0); setResult(null); setResilienceResult(null); setAcknowledgedReport(false) }} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: 'pointer' }}>↺ Start over</button>
              <button onClick={() => { setMode(null); setStep(0); setResult(null); setResilienceResult(null); setAcknowledgedReport(false) }} style={{ fontSize: 13, fontWeight: 500, padding: '9px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>New assessment →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
