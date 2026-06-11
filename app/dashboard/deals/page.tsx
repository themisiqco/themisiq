'use client'

import { useState, useEffect } from 'react'
import Nav from '../../components/Nav'
import { useEntitlement } from '../../../lib/useEntitlement'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SECTORS = [
  'Energy & Utilities', 'Financial Services', 'Real Estate', 'Technology',
  'Healthcare & Pharma', 'Industrials & Manufacturing', 'Consumer & Retail',
  'Agriculture & Food', 'Transport & Logistics', 'Mining & Metals',
  'Construction & Materials', 'Professional Services', 'Other',
]

const DEAL_TYPES = [
  { id: 'ma', label: 'M&A — Acquisition', desc: 'Full acquisition of target company' },
  { id: 'pe', label: 'PE / Growth Equity', desc: 'Majority or minority stake investment' },
  { id: 'vc', label: 'Venture Capital', desc: 'Early or growth stage investment' },
  { id: 'lending', label: 'Lending / Credit', desc: 'Debt financing or credit facility' },
  { id: 'lp', label: 'LP / Fund Investment', desc: 'Investment into a fund or GP' },
]

const JURISDICTIONS = ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other']

// Sector-based ESG risk flags
const SECTOR_RISKS: Record<string, { risk: string; severity: 'critical' | 'high' | 'medium'; framework: string; detail: string }[]> = {
  'Energy & Utilities': [
    { risk: 'High Scope 1 emissions exposure', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Energy companies typically carry 60-80% of portfolio Scope 1 emissions, requiring full consolidation into the buyer\'s GHG inventory under prevailing emissions-accounting standards.' },
    { risk: 'Stranded asset risk', severity: 'critical', framework: 'IFRS S2 / TCFD', detail: 'Fossil fuel assets face material impairment risk under 1.5°C transition scenarios. Requires IFRS S2 climate scenario analysis.' },
    { risk: 'Physical climate risk exposure', severity: 'high', framework: 'TCFD / IFRS S2', detail: 'Energy infrastructure faces acute and chronic physical climate risk. Requires asset-level climate risk assessment.' },
  ],
  'Financial Services': [
    { risk: 'Financed emissions (Scope 3 Cat.15)', severity: 'critical', framework: 'PCAF / CSRD', detail: 'Financed emissions typically represent 95%+ of a financial institution\'s carbon footprint. PCAF methodology required.' },
    { risk: 'SFDR portfolio alignment', severity: 'high', framework: 'SFDR / EU Taxonomy', detail: 'EU financial products must disclose sustainability characteristics. Article 8/9 classification impacts fund marketability.' },
    { risk: 'Physical risk in loan book', severity: 'high', framework: 'ECB / TCFD', detail: 'Mortgage and commercial real estate portfolios face material physical climate risk under ECB guidelines.' },
  ],
  'Real Estate': [
    { risk: 'Embodied carbon in portfolio', severity: 'high', framework: 'CSRD / CRREM', detail: 'Building portfolios face stranding risk under EU carbon reduction pathways. CRREM analysis required.' },
    { risk: 'Energy efficiency compliance', severity: 'high', framework: 'EU EPC / MEES', detail: 'EU Energy Performance of Buildings Directive and UK MEES require minimum EPC ratings. Non-compliant assets face rental prohibition.' },
    { risk: 'Physical flood and heat risk', severity: 'critical', framework: 'TCFD / IFRS S2', detail: 'Real estate assets face material physical climate risk. Asset-level flood mapping and heat stress analysis required.' },
  ],
  'Technology': [
    { risk: 'Data centre energy intensity', severity: 'medium', framework: 'SB 253 / CSRD', detail: 'Data centre operations carry significant Scope 2 exposure. PPA and renewable energy coverage assessment needed.' },
    { risk: 'AI governance exposure', severity: 'medium', framework: 'EU AI Act', detail: 'Technology products may contain high-risk AI systems requiring EU AI Act conformity assessment by August 2026.' },
    { risk: 'Supply chain minerals risk', severity: 'high', framework: 'CS3D / ESRS S2', detail: 'Hardware products may rely on conflict minerals. CS3D HRDD obligations apply from 2027.' },
  ],
  'Healthcare & Pharma': [
    { risk: 'Cold chain emissions', severity: 'medium', framework: 'SB 253 / GHG Protocol', detail: 'Pharmaceutical cold chain carries significant Scope 3 Cat.4 emissions from refrigerant leakage and transport.' },
    { risk: 'Pharmaceutical waste', severity: 'medium', framework: 'CSRD / GRI', detail: 'Pharmaceutical manufacturing generates hazardous waste requiring environmental liability assessment.' },
    { risk: 'Clinical trial supply chain', severity: 'medium', framework: 'CS3D / ESRS S2', detail: 'Clinical trial operations in emerging markets carry human rights and labour standards risk.' },
  ],
  'Industrials & Manufacturing': [
    { risk: 'Scope 1 process emissions', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Industrial manufacturing typically carries significant Scope 1 process emissions requiring full GHG inventory.' },
    { risk: 'Carbon border adjustment exposure', severity: 'high', framework: 'EU CBAM', detail: 'EU Carbon Border Adjustment Mechanism applies to steel, cement, aluminium, fertilisers and electricity imports from 2026.' },
    { risk: 'Chemical and hazardous materials', severity: 'high', framework: 'REACH / CSRD', detail: 'Industrial operations may carry significant environmental liability from chemical usage and historical contamination.' },
  ],
  'Consumer & Retail': [
    { risk: 'Scope 3 Cat.1 supplier emissions', severity: 'high', framework: 'SB 253 / CSRD', detail: 'Consumer goods companies typically carry 70-90% of emissions in Scope 3 Cat.1. Supplier engagement programme needed.' },
    { risk: 'Deforestation exposure', severity: 'high', framework: 'EU EUDR', detail: 'Consumer goods with exposure to cattle, soy, palm oil, cocoa, coffee, wood or rubber face EU Deforestation Regulation from 2025.' },
    { risk: 'Labour rights in supply chain', severity: 'high', framework: 'CS3D / Modern Slavery', detail: 'Consumer goods supply chains carry significant forced labour and child labour risk in sourcing countries.' },
  ],
  'Agriculture & Food': [
    { risk: 'Land use change emissions', severity: 'critical', framework: 'GHG Protocol / SB 253', detail: 'Agricultural operations may carry significant land use change (LUC) emissions requiring scope 3 Cat.11 assessment.' },
    { risk: 'Deforestation and biodiversity', severity: 'critical', framework: 'EU EUDR / TNFD', detail: 'Agricultural supply chains face EU Deforestation Regulation and emerging TNFD nature-related disclosure requirements.' },
    { risk: 'Water risk', severity: 'high', framework: 'CSRD / CDP Water', detail: 'Agricultural operations in water-stressed regions face material operational and regulatory risk.' },
  ],
  'Transport & Logistics': [
    { risk: 'Fleet decarbonisation liability', severity: 'high', framework: 'SB 253 / CSRD', detail: 'Transport fleet carries significant Scope 1 emissions. EU FuelEU Maritime and ETS expansion add compliance cost.' },
    { risk: 'Aviation and shipping ETS exposure', severity: 'high', framework: 'EU ETS', detail: 'EU ETS now covers aviation and maritime. Carbon cost exposure requires detailed fleet assessment.' },
    { risk: 'Infrastructure physical risk', severity: 'medium', framework: 'TCFD / IFRS S2', detail: 'Transport infrastructure faces physical climate risk from flooding, extreme heat and storm events.' },
  ],
  'Mining & Metals': [
    { risk: 'Scope 1 extraction emissions', severity: 'critical', framework: 'SB 253 / CSRD', detail: 'Mining operations carry significant Scope 1 methane and process emissions requiring full GHG inventory.' },
    { risk: 'Tailings and environmental liability', severity: 'critical', framework: 'CSRD / GRI', detail: 'Mining operations carry material environmental liability from tailings management and historical contamination.' },
    { risk: 'Conflict minerals and HRDD', severity: 'high', framework: 'CS3D / OECD DDG', detail: 'Mining operations in conflict-affected areas require OECD Due Diligence Guidance compliance.' },
  ],
  'Construction & Materials': [
    { risk: 'Embodied carbon in products', severity: 'high', framework: 'CSRD / EU Taxonomy', detail: 'Cement and steel production carry significant process emissions. EU Taxonomy alignment assessment required.' },
    { risk: 'EU CBAM exposure', severity: 'high', framework: 'EU CBAM', detail: 'Construction materials (cement, steel, aluminium) face EU Carbon Border Adjustment Mechanism from 2026.' },
    { risk: 'Site biodiversity and land use', severity: 'medium', framework: 'CSRD / TNFD', detail: 'Construction projects face emerging biodiversity disclosure requirements under TNFD and CSRD ESRS E4.' },
  ],
  'Professional Services': [
    { risk: 'Scope 2 and business travel emissions', severity: 'medium', framework: 'SB 253 / CSRD', detail: 'Professional services firms carry Scope 2 and Scope 3 Cat.6 business travel emissions.' },
    { risk: 'Client portfolio ESG exposure', severity: 'medium', framework: 'CSRD / SFDR', detail: 'Advisory and consulting firms may carry reputational and legal exposure from ESG advice provided to clients.' },
  ],
}

// Compliance cost estimates by deal size and sector complexity
const getComplianceCost = (dealValue: number, sector: string, frameworks: string[]): { low: number; high: number; pctLow: number; pctHigh: number; items: { item: string; cost: string }[] } => {
  const isHighEmissions = ['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals', 'Transport & Logistics', 'Agriculture & Food'].includes(sector)
  const isFinancial = sector === 'Financial Services'
  const fwCount = frameworks.length

  // ESG due diligence is a slice of all-in DD (~0.2–4% of deal value). Focused ESG scope lands low in that band.
  // High-emissions / financial sectors and more applicable frameworks push toward the upper end.
  const pctLow = isHighEmissions ? 0.0020 : isFinancial ? 0.0015 : 0.0010
  const pctHigh = (isHighEmissions ? 0.0040 : isFinancial ? 0.0035 : 0.0025) + (fwCount > 2 ? 0.0010 : 0)
  const low = Math.max(7500, dealValue * pctLow)
  const high = Math.max(25000, dealValue * pctHigh)

  const items = [
    { item: 'GHG inventory & Scope 3 assessment', cost: isHighEmissions ? '$40,000–80,000' : '$15,000–35,000' },
    { item: 'Climate scenario analysis (IFRS S2/TCFD)', cost: fwCount > 2 ? '$30,000–60,000' : '$15,000–30,000' },
    { item: 'ESG data room preparation', cost: '$10,000–25,000' },
    ...(frameworks.includes('CSRD') ? [{ item: 'CSRD double materiality assessment', cost: '$25,000–50,000' }] : []),
    ...(frameworks.includes('SB 253') ? [{ item: 'SB 253 first-year reporting', cost: '$20,000–45,000' }] : []),
    ...(frameworks.includes('CS3D') ? [{ item: 'CS3D HRDD programme setup', cost: '$30,000–60,000' }] : []),
    ...(isFinancial ? [{ item: 'PCAF financed emissions calculation', cost: '$20,000–40,000' }] : []),
    { item: 'Ongoing annual compliance (Year 1)', cost: isHighEmissions ? '$60,000–120,000' : '$30,000–60,000' },
  ]

  return { low, high, pctLow, pctHigh, items }
}

// Framework applicability
const getApplicableFrameworks = (jurisdiction: string, revenue: number, sector: string, dealType: string): string[] => {
  const fw: string[] = []

  // US — California SB 253 (statutory trigger is >$1B total annual revenue, doing business in CA)
  if (jurisdiction === 'USA' && revenue > 1000000000) fw.push('SB 253')

  // EU
  if (['European Union', 'Global'].includes(jurisdiction)) fw.push('CSRD')
  if (jurisdiction === 'European Union' && sector === 'Financial Services') fw.push('SFDR')
  if (['European Union', 'Global'].includes(jurisdiction)) fw.push('EU Taxonomy')
  if (['European Union', 'Global'].includes(jurisdiction)) fw.push('CS3D')

  // UK — distinct regime, NOT CSRD
  if (jurisdiction === 'UK') {
    if (revenue > 36000000) fw.push('SECR')               // large UK cos: Scope 1+2 mandatory (DEFRA factors)
    fw.push('UK SRS (S1/S2)')                              // IFRS S1/S2 endorsement — voluntary now, proposed mandatory for listed FY2027+
    if (sector === 'Financial Services') {
      fw.push('FCA climate disclosure (TCFD)')            // FCA-regulated managers / insurers / pensions
      fw.push('UK SDR')                                    // sustainability disclosure + investment labels
      fw.push('Anti-greenwashing rule')                    // applies to all FCA-authorised firms making ESG claims
    }
  }

  // Investor baseline (expected regardless of jurisdiction)
  fw.push('IFRS S2')
  fw.push('TCFD')
  if (sector === 'Financial Services') fw.push('PCAF')
  if (['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals'].includes(sector)) {
    if (jurisdiction === 'UK') fw.push('UK ETS')
    else if (['European Union', 'Global'].includes(jurisdiction)) fw.push('EU ETS')
  }

  return fw
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  high:     { label: 'HIGH', color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  medium:   { label: 'MEDIUM', color: '#0C447C', bg: '#E6F1FB', border: '#0C447C' },
}

const STEP_NAMES = ['Deal Setup', 'ESG Screening', 'Risk Findings', 'Cost Estimate', 'Export']


// ─── Component ────────────────────────────────────────────────────────────────

export default function DealsDashboard() {
  const isPaid = useEntitlement('deals')
  const [step, setStep] = useState(0)
  const [deal, setDeal] = useState({
    target_name: '',
    sector: '',
    revenue: 0,
    jurisdiction: 'USA',
    deal_type: 'ma',
    deal_value: 0,
    currency: 'USD',
    has_ghg_data: false,
    has_esg_report: false,
    notes: '',
  })
  const [frameworks, setFrameworks] = useState<string[]>([])
  const [dataConfirmed, setDataConfirmed] = useState(false)

  // Auto-detect frameworks when deal changes
  useEffect(() => {
    if (deal.sector && deal.jurisdiction && deal.revenue) {
      const detected = getApplicableFrameworks(deal.jurisdiction, deal.revenue, deal.sector, deal.deal_type)
      setFrameworks(detected)
    } else {
      setFrameworks([])
    }
  }, [deal.sector, deal.jurisdiction, deal.revenue, deal.deal_type])

  const update = (field: string, value: any) => setDeal(prev => ({ ...prev, [field]: value }))

  const risks = SECTOR_RISKS[deal.sector] || []
  // Rewrite generic disclosure-regime labels (SB 253, bare CSRD) to the jurisdiction's actual regime.
  // Activity-triggered EU instruments (CBAM, EUDR, AI Act, SFDR, etc.) are left intact — they apply to
  // UK/non-EU companies through EU-facing activity and have no domestic equivalent.
  const mapFramework = (fw: string): string => {
    const j = deal.jurisdiction
    const regime =
      j === 'UK' ? 'UK SRS S2 / SECR'
      : j === 'European Union' ? 'CSRD / ESRS E1'
      : j === 'USA' ? 'SB 253'
      : 'GHG Protocol / IFRS S2'
    return fw
      .split(' / ')
      .map(tok => (tok === 'SB 253' || tok === 'SB253' || tok === 'CSRD') ? regime : tok)
      .filter((tok, i, arr) => arr.indexOf(tok) === i)   // dedupe if remap collides
      .join(' / ')
  }
  const criticalRisks = risks.filter(r => r.severity === 'critical')
  const highRisks = risks.filter(r => r.severity === 'high')
  const mediumRisks = risks.filter(r => r.severity === 'medium')
  const complianceCost = deal.deal_value > 0 ? getComplianceCost(deal.deal_value, deal.sector, frameworks) : null

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — ESG Deal Due Diligence Report'],
      ['Target company', deal.target_name],
      ['Sector', deal.sector],
      ['Revenue', `${deal.currency} ${deal.revenue.toLocaleString()}`],
      ['Deal type', DEAL_TYPES.find(d => d.id === deal.deal_type)?.label || ''],
      ['Jurisdiction', deal.jurisdiction],
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['APPLICABLE FRAMEWORKS'],
      ...frameworks.map(f => [f]),
      [],
      ['ESG RISK FINDINGS'],
      ['Risk', 'Severity', 'Framework', 'Detail'],
      ...risks.map(r => [r.risk, r.severity.toUpperCase(), mapFramework(r.framework), r.detail]),
      [],
      ['COMPLIANCE COST ESTIMATE'],
      complianceCost ? [`Estimated range: ${deal.currency} ${Math.round(complianceCost.low / 1000)}k – ${Math.round(complianceCost.high / 1000)}k`] : ['Insufficient data'],
      [],
      ['Cost breakdown', 'Typical consultant project costs (reference, USD)'],
      ...(complianceCost?.items.map(i => [i.item, i.cost]) || []),
      [],
      ['DATA ROOM GAPS'],
      ['Item', 'Status'],
      ['GHG inventory / emissions data', deal.has_ghg_data ? 'Available' : 'MISSING — request from target'],
      ['ESG report or sustainability disclosure', deal.has_esg_report ? 'Available' : 'MISSING — request from target'],
      [],
      ['Generated by ThemisIQ · www.themisiq.co · ESG Deal Diligence Platform'],
    ]
    const esc = (v: string) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = rows.map(r => r.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deal.target_name || 'Target'}_ESGDiligence_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Deal setup</h2>
      <p style={sectionSub}>Tell us about the target company and deal structure so we can identify ESG risks and applicable frameworks.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Target company name</label>
          <input style={inputStyle} value={deal.target_name} onChange={e => update('target_name', e.target.value)} placeholder="Acme Corp" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Sector</label>
          <select style={inputStyle} value={deal.sector} onChange={e => update('sector', e.target.value)}>
            <option value="">Select sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Target annual revenue ({deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.revenue || ''} onChange={e => update('revenue', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={deal.currency} onChange={e => update('currency', e.target.value)}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Deal / investment value ({deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.deal_value || ''} onChange={e => update('deal_value', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Primary jurisdiction</label>
          <select style={inputStyle} value={deal.jurisdiction} onChange={e => update('jurisdiction', e.target.value)}>
            {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Deal type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {DEAL_TYPES.map(dt => (
              <div key={dt.id} onClick={() => update('deal_type', dt.id)} style={{ border: `1.5px solid ${deal.deal_type === dt.id ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '0.75rem', cursor: 'pointer', background: deal.deal_type === dt.id ? '#EDE9FE' : '#f8f7f5' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: deal.deal_type === dt.id ? '#7425e3' : '#0d0d0d', marginBottom: 3 }}>{dt.label}</div>
                <div style={{ fontSize: 11, color: '#888784' }}>{dt.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>ESG framework screening</h2>
      <p style={sectionSub}>ThemisIQ has identified the frameworks that apply to this deal based on sector, jurisdiction and deal size. Review and confirm.</p>

      {frameworks.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>
          Complete deal setup first to see applicable frameworks.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {frameworks.map(fw => (
            <div key={fw} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{fw}</div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56' }}>APPLIES</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ border: '1px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 12 }}>Data room status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { field: 'has_ghg_data', label: 'GHG inventory / emissions data available from target?' },
            { field: 'has_esg_report', label: 'ESG report or sustainability disclosure available from target?' },
          ].map(({ field, label }) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ fontSize: 13, color: '#555553' }}>{label}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                  <button key={String(opt.val)} onClick={() => update(field, opt.val)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: (deal as any)[field] === opt.val ? '#0d0d0d' : '#f8f7f5', color: (deal as any)[field] === opt.val ? '#fff' : '#555553', border: `0.5px solid ${(deal as any)[field] === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {(!deal.has_ghg_data || !deal.has_esg_report) && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>⚠ Data room gaps identified</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            {!deal.has_ghg_data && '· Request verified GHG inventory (Scope 1, 2, 3) from target before closing\n'}
            {!deal.has_esg_report && '· Request latest ESG report or sustainability disclosure from target'}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Material ESG findings</h2>
      <p style={sectionSub}>Based on {deal.target_name || 'the target company'}'s sector and jurisdiction, ThemisIQ has identified the following material ESG risks for your deal memo.</p>

      {risks.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>
          Select a sector in Step 1 to see ESG risk findings.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Critical risks', count: criticalRisks.length, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risks', count: highRisks.length, color: '#ba7517', bg: '#FEF3E2' },
              { label: 'Medium risks', count: mediumRisks.length, color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {risks.map((risk, i) => {
              const cfg = SEVERITY_CONFIG[risk.severity]
              return (
                <div key={i} style={{ border: `1px solid ${cfg.border}20`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: risk.severity === 'critical' ? cfg.bg : '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `0.5px solid ${cfg.border}20` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{risk.risk}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#888784' }}>{mapFramework(risk.framework)}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{risk.detail}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>Compliance cost estimate</h2>
      <p style={sectionSub}>Estimated cost to bring {deal.target_name || 'the target'} into ESG compliance — for your IC memo and deal valuation adjustment.</p>

      {!complianceCost ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>
          Enter deal value in Step 1 to generate a compliance cost estimate.
        </div>
      ) : (
        <>
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Estimated ESG compliance cost — {deal.target_name || 'Target'}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color: '#64fe3e' }}>
                {(complianceCost.pctLow * 100).toFixed(2)}% – {(complianceCost.pctHigh * 100).toFixed(2)}% of deal value
              </div>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 8 }}>
              ≈ {deal.currency} {Math.round(complianceCost.low / 1000)}k – {Math.round(complianceCost.high / 1000)}k consultant-led first-year cost
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
              ESG due diligence — a focused slice of all-in transaction DD ({deal.sector} sector, {deal.jurisdiction}, {frameworks.length} applicable frameworks) · Indicative only — requires specialist confirmation
            </div>
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Platform-led ESG screening with ThemisIQ</div>
              <div style={{ fontSize: 13, color: '#64fe3e', fontWeight: 600 }}>from ~{deal.currency} 5k</div>
            </div>
          </div>

          <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cost breakdown</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: '#888784' }}>Typical consultant project costs (USD)</div>
              </div>
            </div>
            {complianceCost.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < complianceCost.items.length - 1 ? '0.5px solid #f3f4f6' : 'none' }}>
                <div style={{ fontSize: 13, color: '#555553' }}>{item.item}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', flexShrink: 0, marginLeft: 16 }}>{item.cost}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>Deal structuring note</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
              Consider including ESG compliance costs in purchase price adjustment mechanics, or structuring an escrow/holdback for regulatory compliance. ThemisIQ Advisory can provide a detailed compliance roadmap for IC approval.
            </div>
          </div>
        </>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export ESG diligence report</h2>
      <p style={sectionSub}>Download your ESG due diligence summary for the deal memo, IC pack, or LP reporting.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Report summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Target', val: deal.target_name || '—' },
            { label: 'ESG risks', val: risks.length, urgent: criticalRisks.length > 0 },
            { label: 'Frameworks', val: frameworks.length },
            { label: 'Compliance est.', val: complianceCost ? `${deal.currency}${Math.round(complianceCost.low / 1000)}k+` : '—' },
          ].map(({ label, val, urgent }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.6rem' : '1rem', fontFamily: typeof val === 'number' ? 'Georgia, serif' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: urgent ? '#64fe3e' : '#fff', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm this assessment is for planning purposes only and does not constitute legal, financial, or regulatory advice. Compliance costs are indicative estimates only.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: dataConfirmed ? 'pointer' : 'not-allowed', opacity: dataConfirmed ? 1 : 0.4 }}>
            ⬇ Download ESG Diligence Report (CSV)
          </button>
        </div>
      ) : (
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Unlock your full ESG diligence programme</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6 }}>Download your ESG diligence report, generate IC-ready compliance cost analysis, and access ThemisIQ's deal-specific ESG advisory.</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: '#0C447C', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>UK SECR in force now · UK SRS (ISSB-aligned) proposed mandatory from 2027 · IFRS S2 effective · SB 253 first report 2026 · CSRD for large EU companies. ESG is a material deal risk.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Deals & Investment</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>ESG Deal Due Diligence</div>
          </div>
          {deal.target_name && <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{deal.target_name}</div>}
        </div>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#0C447C' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {i + 1}. {name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: step === 4 ? '1fr' : '1fr 260px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
            {steps[step]()}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
              {step < STEP_NAMES.length - 1 && <button onClick={() => setStep(s => Math.min(STEP_NAMES.length - 1, s + 1))} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>Next →</button>}
            </div>
          </div>
          {step < 4 && (
            <div style={{ position: 'sticky', top: 80 }}>
              <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Deal summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Target', val: deal.target_name || '—' },
                    { label: 'Sector', val: deal.sector || '—' },
                    { label: 'Deal type', val: DEAL_TYPES.find(d => d.id === deal.deal_type)?.label.split(' —')[0] || '—' },
                    { label: 'Critical risks', val: criticalRisks.length, urgent: criticalRisks.length > 0 },
                    { label: 'Frameworks', val: frameworks.length },
                    { label: 'Compliance est.', val: complianceCost ? `${deal.currency}${Math.round(complianceCost.low / 1000)}k+` : '—' },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? '#64fe3e' : '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {criticalRisks.length > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ {criticalRisks.length} critical ESG risk{criticalRisks.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>Material findings require specialist ESG diligence before IC approval</div>
                </div>
              )}
              <div style={{ marginTop: 10, background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '0.75rem' }}>
                {frameworks.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}><strong>{frameworks.join(' · ')}</strong><br />ESG is now a material deal risk</div>
                ) : (
                  <div style={{ fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>Enter sector, jurisdiction & target revenue in Step 1 to detect applicable frameworks</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
