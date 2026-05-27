'use client'

import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
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
  { code: 'eu_ets', label: 'EU (EU ETS)' }, { code: 'cbam', label: 'EU CBAM exposure' },
  { code: 'uk_ets', label: 'UK (UK ETS)' }, { code: 'ca', label: 'Canada (federal pricing)' },
  { code: 'us_fed', label: 'US (federal)' }, { code: 'us_ca', label: 'US — California cap-and-trade' },
  { code: 'cn', label: 'China (national ETS)' }, { code: 'kr', label: 'South Korea (K-ETS)' },
  { code: 'jp', label: 'Japan' }, { code: 'au', label: 'Australia (Safeguard)' },
  { code: 'nz', label: 'New Zealand (NZ ETS)' }, { code: 'ch', label: 'Switzerland (CH ETS)' },
]

const SCENARIOS = [
  { code: 'ssp245', label: 'IPCC SSP2-4.5', descriptor: '~2.7°C' },
  { code: 'ssp126', label: 'IPCC SSP1-2.6', descriptor: '~1.8°C' },
  { code: 'ssp585', label: 'IPCC SSP5-8.5', descriptor: '~4.4°C' },
  { code: 'ngfs_orderly', label: 'NGFS Orderly', descriptor: 'Early policy' },
  { code: 'ngfs_disorderly', label: 'NGFS Disorderly', descriptor: 'Late, abrupt' },
  { code: 'ngfs_hothouse', label: 'NGFS Hot House', descriptor: 'Limited action' },
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

type Mode = 's2' | 'csrd'
type Band = 'high' | 'med' | 'low'

export default function MaterialityWizard() {
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

  const SCENARIO_RATIONALE = "We've set a middle pathway (SSP2-4.5, ~2.7°C) — the most common choice for a first assessment and a reasonable central case. Change it if you have a specific reason to test a higher- or lower-warming scenario."
  const HORIZON_RATIONALE = "Medium term (to 2040) is the default lens for a first screening. Companies with long-lived physical assets may prefer the long-term view."

  const stepNames = mode === 'csrd'
    ? ['Industry', 'Regions', 'Jurisdictions', 'Scenario', 'Impact', 'Results']
    : ['Industry', 'Regions', 'Jurisdictions', 'Scenario', 'Results']
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
      setResult(data.result); setSavedId(data.id); setStep(resultsStep)
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
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Materiality Assessment</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Which assessment do you need?</h1>
          <p style={{ ...sectionSub, marginBottom: 24 }}>Double materiality is single (financial) materiality plus impact materiality. Choose the standard you report under.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              { m: 's2' as Mode, t: 'IFRS S2', sub: 'Single (financial) materiality', d: 'How climate-related risks affect your enterprise value. Produces a physical & transition risk register with scenario analysis.', feat: false },
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
      <h2 style={sectionHead}>Policy jurisdictions</h2>
      <p style={sectionSub}>Where you face carbon pricing or climate regulation — this drives transition risk, and is distinct from your physical regions.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {JURISDICTIONS.map(j => {
          const sel = jurisdictionCodes.includes(j.code)
          return <div key={j.code} onClick={() => toggle(jurisdictionCodes, j.code, setJurisdictionCodes)} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', background: sel ? '#EDE9FE' : '#f8f7f5', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, background: sel ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{sel && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}</div>
            <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: sel ? '#7425e3' : '#555553' }}>{j.label}</span>
          </div>
        })}
      </div>
    </div>
  )

  const renderScenario = () => (
    <div>
      <h2 style={sectionHead}>Scenario & time horizon</h2>
      <p style={sectionSub}>We've pre-selected sensible defaults. Higher-warming pathways raise physical risk; faster-policy pathways raise transition risk.</p>
      <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>Why this default?</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{SCENARIO_RATIONALE}</div>
      </div>
      <label style={labelStyle}>Scenario</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {SCENARIOS.map(s => {
          const sel = scenarioCode === s.code
          return <div key={s.code} onClick={() => setScenarioCode(s.code)} style={{ border: `1.5px solid ${sel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '10px 12px', cursor: 'pointer', background: sel ? '#EDE9FE' : '#f8f7f5' }}>
            <div style={{ fontSize: 13, fontWeight: sel ? 600 : 500, color: sel ? '#7425e3' : '#0d0d0d' }}>{s.label}</div>
            <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{s.descriptor}</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: mode === 'csrd' ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
          <div style={{ background: '#FCEBEB', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}><div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#B91C1C' }}>{s.physicalHigh ?? 0}</div><div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>High physical risks</div></div>
          <div style={{ background: '#FEF3E2', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}><div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#ba7517' }}>{s.transitionHigh ?? 0}</div><div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>High transition risks</div></div>
          {mode === 'csrd' && <div style={{ background: '#EDE9FE', borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}><div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color: '#7425e3' }}>{s.topicsBothAxes ?? 0}</div><div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>Topics material on both axes</div></div>}
        </div>

        {mode === 'csrd' && renderMatrix()}
        {mode === 'csrd' && renderMatrixTable()}
        {renderRegister()}

        {/* honesty footnote */}
        <div style={{ background: '#E6F1FB', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: '#0C447C', lineHeight: 1.6, marginBottom: 12 }}>
          Screening output, built on IPCC AR6 climatic impact-drivers, TCFD risk categories{mode === 'csrd' ? ', and the ten ESRS topics' : ''} — all public frameworks. This is a structured first pass to scope a formal assessment, not a disclosure. Refine weightings with your own materiality assessment.
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

  const renderStep = () => {
    if (step === resultsStep) return renderResults()
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
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Materiality Assessment</div>
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
                <button onClick={submit} disabled={submitting || !canAdvance()} style={{ fontSize: 13, fontWeight: 500, padding: '9px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: submitting ? 'wait' : 'pointer', opacity: (submitting || !canAdvance()) ? 0.5 : 1 }}>{submitting ? 'Running…' : 'Run assessment →'}</button>
              ) : (
                <button onClick={() => canAdvance() && setStep(s => s + 1)} disabled={!canAdvance()} style={{ fontSize: 13, fontWeight: 500, padding: '9px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: canAdvance() ? 'pointer' : 'not-allowed', opacity: canAdvance() ? 1 : 0.5 }}>Next →</button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button onClick={() => { setStep(0); setResult(null) }} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: 'pointer' }}>↺ Start over</button>
              <button onClick={() => { setMode(null); setStep(0); setResult(null) }} style={{ fontSize: 13, fontWeight: 500, padding: '9px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>New assessment →</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
