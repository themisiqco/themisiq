'use client'

import { useState } from 'react'
import Nav from '../../components/Nav'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SECTORS = [
  'Energy & Utilities', 'Financial Services', 'Real Estate', 'Technology',
  'Healthcare & Pharma', 'Industrials & Manufacturing', 'Consumer & Retail',
  'Agriculture & Food', 'Transport & Logistics', 'Mining & Metals',
  'Construction & Materials', 'Professional Services', 'Other',
]

const REGIONS = [
  'Northern Europe', 'Southern Europe', 'Eastern Europe',
  'North America — East Coast', 'North America — West Coast', 'North America — Central',
  'Latin America', 'Middle East & North Africa', 'Sub-Saharan Africa',
  'South Asia', 'Southeast Asia', 'East Asia', 'Australia & Pacific',
  'Global / Multiple',
]

const SCENARIOS = [
  { id: '1_5c', label: '1.5°C', desc: 'Paris Agreement target — rapid, deep decarbonisation', color: '#0F6E56', bg: '#E1F5EE' },
  { id: '2c', label: '2°C', desc: 'Orderly transition — significant but gradual policy shift', color: '#ba7517', bg: '#FEF3E2' },
  { id: '3c', label: '3°C+', desc: 'Disorderly / delayed transition — high physical risk', color: '#B91C1C', bg: '#FCEBEB' },
]

// Physical risk by region
const PHYSICAL_RISKS: Record<string, { risk: string; hazard: string; severity_3c: 'critical' | 'high' | 'medium'; trend: string }[]> = {
  'Southern Europe': [
    { risk: 'Extreme heat & drought', hazard: 'Chronic', severity_3c: 'critical', trend: 'Mediterranean temperatures rising 20% faster than global average. 60+ day heatwave events projected by 2050.' },
    { risk: 'Wildfire risk', hazard: 'Acute', severity_3c: 'critical', trend: 'Wildfire-prone area expanding northward. Insurance withdrawal already underway in parts of Spain and Greece.' },
    { risk: 'Water scarcity', hazard: 'Chronic', severity_3c: 'high', trend: 'Southern European rivers projected to lose 30-40% flow by 2050. Operational and supply chain disruption risk.' },
  ],
  'North America — East Coast': [
    { risk: 'Hurricane intensification', hazard: 'Acute', severity_3c: 'critical', trend: 'Category 4-5 hurricane frequency increasing. Coastal asset exposure growing with sea level rise.' },
    { risk: 'Coastal flooding', hazard: 'Chronic', severity_3c: 'critical', trend: 'Sea level rise of 0.3-1m by 2100 threatens major East Coast cities including Miami, New York, Boston.' },
    { risk: 'Extreme precipitation', hazard: 'Acute', severity_3c: 'high', trend: 'Atmospheric rivers and compound flood events intensifying. Supply chain and infrastructure disruption.' },
  ],
  'North America — West Coast': [
    { risk: 'Wildfire and smoke', hazard: 'Acute', severity_3c: 'critical', trend: 'Western wildfire season now year-round. Air quality impacts on operations and workforce health.' },
    { risk: 'Drought and water stress', hazard: 'Chronic', severity_3c: 'critical', trend: 'Colorado River basin facing structural water deficit. Agricultural and industrial water access at risk.' },
    { risk: 'Extreme heat events', hazard: 'Acute', severity_3c: 'high', trend: 'Pacific Northwest heat dome events increasing. Outdoor worker health and productivity impacts.' },
  ],
  'South Asia': [
    { risk: 'Extreme heat and wet bulb temperatures', hazard: 'Chronic', severity_3c: 'critical', trend: 'Parts of South Asia approaching human survivability limits under 3°C+. Outdoor labour productivity loss up to 30%.' },
    { risk: 'Monsoon intensification and flooding', hazard: 'Acute', severity_3c: 'critical', trend: 'Extreme monsoon events increasing in frequency. Supply chain disruption and asset damage risk.' },
    { risk: 'Glacial retreat and water stress', hazard: 'Chronic', severity_3c: 'high', trend: 'Himalayan glaciers supplying 800M people retreating rapidly. Long-term freshwater security at risk.' },
  ],
  'Southeast Asia': [
    { risk: 'Tropical cyclone intensification', hazard: 'Acute', severity_3c: 'critical', trend: 'Super-typhoon frequency increasing. Manufacturing hub exposure in Vietnam, Philippines, Thailand.' },
    { risk: 'Sea level rise and coastal flooding', hazard: 'Chronic', severity_3c: 'critical', trend: 'Low-lying coastal cities (Bangkok, Jakarta, Ho Chi Minh) facing severe inundation risk.' },
    { risk: 'Extreme heat', hazard: 'Chronic', severity_3c: 'high', trend: 'Outdoor and light-manufacturing productivity losses projected at 15-20% under 3°C scenario.' },
  ],
  'Middle East & North Africa': [
    { risk: 'Extreme heat — near-uninhabitable conditions', hazard: 'Chronic', severity_3c: 'critical', trend: 'Gulf cities projected to exceed human survivability thresholds without cooling. Outdoor work bans expanding.' },
    { risk: 'Water scarcity', hazard: 'Chronic', severity_3c: 'critical', trend: 'MENA is already the world\'s most water-stressed region. Desalination dependency and energy cost risk.' },
    { risk: 'Dust storms and air quality', hazard: 'Acute', severity_3c: 'high', trend: 'Desertification expanding. Dust storm frequency and intensity increasing across the Sahel and Gulf.' },
  ],
  'Sub-Saharan Africa': [
    { risk: 'Drought and food insecurity', hazard: 'Chronic', severity_3c: 'critical', trend: 'Crop yield losses of 20-40% projected under 3°C. Supply chain and social stability risk for regional operations.' },
    { risk: 'Extreme flooding', hazard: 'Acute', severity_3c: 'high', trend: 'East and West Africa experiencing unprecedented flooding. Infrastructure and supply chain damage.' },
    { risk: 'Vector-borne disease spread', hazard: 'Chronic', severity_3c: 'high', trend: 'Malaria and other vector-borne diseases expanding into new areas. Workforce health and productivity risk.' },
  ],
  'Northern Europe': [
    { risk: 'Flooding and storm surge', hazard: 'Acute', severity_3c: 'high', trend: 'North Sea storm intensity increasing. Netherlands, UK, Denmark coastal infrastructure at risk.' },
    { risk: 'Permafrost thaw (Arctic operations)', hazard: 'Chronic', severity_3c: 'high', trend: 'Infrastructure in Arctic/sub-Arctic regions facing ground instability from permafrost degradation.' },
    { risk: 'Extreme precipitation', hazard: 'Acute', severity_3c: 'medium', trend: 'Atmospheric river events bringing intense rainfall. Urban flooding and transport disruption.' },
  ],
  'Australia & Pacific': [
    { risk: 'Extreme heat and bushfire', hazard: 'Acute', severity_3c: 'critical', trend: 'Black Summer 2019-20 conditions becoming the norm. Insurance withdrawal underway in high-risk zones.' },
    { risk: 'Great Barrier Reef bleaching', hazard: 'Chronic', severity_3c: 'critical', trend: 'Coral bleaching events now annual. Tourism and fisheries-dependent sectors facing structural decline.' },
    { risk: 'Sea level rise — Pacific islands', hazard: 'Chronic', severity_3c: 'critical', trend: 'Low-lying Pacific nations facing existential threat. Supply chain and sovereign risk.' },
  ],
  'East Asia': [
    { risk: 'Typhoon intensification', hazard: 'Acute', severity_3c: 'high', trend: 'Super-typhoon frequency increasing across Japan, Korea, Taiwan. Manufacturing and logistics disruption.' },
    { risk: 'Flooding — major river systems', hazard: 'Acute', severity_3c: 'high', trend: 'Yangtze, Yellow River, Mekong flooding increasing. Industrial zone and supply chain risk.' },
    { risk: 'Air quality and haze', hazard: 'Chronic', severity_3c: 'medium', trend: 'Combined climate-pollution effects on air quality intensifying. Workforce health and outdoor operations.' },
  ],
  'Latin America': [
    { risk: 'Amazon dieback and drought', hazard: 'Chronic', severity_3c: 'critical', trend: 'Amazon tipping point risk under 3°C+. Agricultural, water and biodiversity system collapse risk.' },
    { risk: 'Extreme flooding', hazard: 'Acute', severity_3c: 'high', trend: 'Atmospheric rivers intensifying across South America. Infrastructure and supply chain damage.' },
    { risk: 'Glacier retreat — Andes', hazard: 'Chronic', severity_3c: 'high', trend: 'Andean glaciers retreating rapidly. Water supply to major cities and agricultural regions at risk.' },
  ],
  'North America — Central': [
    { risk: 'Extreme heat and drought', hazard: 'Chronic', severity_3c: 'high', trend: 'Great Plains facing increasing drought frequency. Agricultural supply chain risk.' },
    { risk: 'Severe convective storms', hazard: 'Acute', severity_3c: 'high', trend: 'Tornado alley expanding. Hail and wind damage to industrial and agricultural assets.' },
    { risk: 'Flooding — Mississippi basin', hazard: 'Acute', severity_3c: 'medium', trend: 'Compound flood events increasing. Transport and logistics infrastructure disruption.' },
  ],
  'Eastern Europe': [
    { risk: 'Heatwaves and drought', hazard: 'Chronic', severity_3c: 'high', trend: 'Eastern European summer temperatures rising rapidly. Agricultural and energy demand impacts.' },
    { risk: 'River flooding', hazard: 'Acute', severity_3c: 'medium', trend: 'Danube and other major rivers experiencing more frequent extreme flood events.' },
  ],
  'Global / Multiple': [
    { risk: 'Supply chain disruption', hazard: 'Acute', severity_3c: 'critical', trend: 'Physical climate risks across multiple regions simultaneously disrupting global supply chains.' },
    { risk: 'Regulatory divergence', hazard: 'Chronic', severity_3c: 'high', trend: 'Different jurisdictions moving at different speeds on climate regulation creates compliance complexity.' },
    { risk: 'Transition cost escalation', hazard: 'Chronic', severity_3c: 'high', trend: 'Carbon pricing and technology transition costs materialising faster than anticipated.' },
  ],
}

// Transition risk by sector
const TRANSITION_RISKS: Record<string, { risk: string; type: string; severity_1_5c: 'critical' | 'high' | 'medium'; detail: string }[]> = {
  'Energy & Utilities': [
    { risk: 'Stranded fossil fuel assets', type: 'Asset', severity_1_5c: 'critical', detail: 'Coal, oil and gas assets face significant impairment under 1.5°C. IEA Net Zero requires no new fossil fuel development post-2021.' },
    { risk: 'Carbon price exposure', type: 'Policy', severity_1_5c: 'critical', detail: 'EU ETS carbon price trajectory to €150-250/tonne by 2030. Direct cost impact on fossil-fuel generation.' },
    { risk: 'Technology disruption — renewables', type: 'Technology', severity_1_5c: 'high', detail: 'Solar and wind LCOE now below fossil fuels in most markets. Utility business model disruption accelerating.' },
  ],
  'Financial Services': [
    { risk: 'Portfolio transition risk', type: 'Market', severity_1_5c: 'critical', detail: 'Financed emissions in high-carbon sectors face significant devaluation under rapid transition. PCAF and TCFD disclosure required.' },
    { risk: 'Green taxonomy reclassification', type: 'Policy', severity_1_5c: 'high', detail: 'EU and UK taxonomy frameworks reclassifying assets. Green vs brown financing cost differential widening.' },
    { risk: 'SFDR greenwashing enforcement', type: 'Reputation', severity_1_5c: 'high', detail: 'EU SFDR enforcement increasing. Greenwashing claims trigger regulatory fines and reputational damage.' },
    { risk: 'Canadian greenwashing enforcement', type: 'Reputation', severity_1_5c: 'high', detail: 'Competition Act (Bill C-59, 2024; amended by C-15, 2026) requires environmental claims to be adequately and properly substantiated. Penalties up to $10M or 3% of global revenue.' },
  ],
  'Real Estate': [
    { risk: 'Energy efficiency regulations', type: 'Policy', severity_1_5c: 'critical', detail: 'EU Energy Performance of Buildings Directive requires EPC B+ by 2030. Non-compliant assets face rental prohibition.' },
    { risk: 'Carbon stranding risk', type: 'Asset', severity_1_5c: 'high', detail: 'CRREM carbon reduction pathways show high % of existing building stock will be stranded under 1.5°C without retrofitting.' },
    { risk: 'Green building premium / brown discount', type: 'Market', severity_1_5c: 'high', detail: 'Green certified buildings commanding 5-15% rental premium. Non-green assets facing increasing vacancy and value discount.' },
  ],
  'Technology': [
    { risk: 'Data centre energy costs', type: 'Policy', severity_1_5c: 'medium', detail: 'Rising carbon prices and electricity costs increasing data centre OpEx. PPA and renewable energy procurement critical.' },
    { risk: 'Supply chain minerals regulation', type: 'Policy', severity_1_5c: 'high', detail: 'Critical minerals for technology (lithium, cobalt, rare earths) face supply constraints and regulatory requirements under CS3D.' },
    { risk: 'EU AI Act and sustainability AI', type: 'Policy', severity_1_5c: 'medium', detail: 'EU AI Act energy transparency requirements for GPAI models. AI energy consumption disclosure becoming mandatory.' },
  ],
  'Healthcare & Pharma': [
    { risk: 'Pharmaceutical cold chain regulation', type: 'Policy', severity_1_5c: 'medium', detail: 'HFC refrigerant phase-out under Kigali Amendment increasing cold chain costs. Low-GWP alternatives required.' },
    { risk: 'Procurement sustainability requirements', type: 'Market', severity_1_5c: 'medium', detail: 'NHS and major healthcare systems requiring supplier net zero commitments. Carbon disclosure becoming procurement requirement.' },
  ],
  'Industrials & Manufacturing': [
    { risk: 'EU Carbon Border Adjustment Mechanism', type: 'Policy', severity_1_5c: 'critical', detail: 'CBAM applies to steel, cement, aluminium, fertilisers and electricity. Carbon cost embedded in imports from 2026.' },
    { risk: 'Industrial decarbonisation costs', type: 'Technology', severity_1_5c: 'high', detail: 'Green hydrogen, electrification and CCS required for hard-to-abate sectors. Capital expenditure significant.' },
    { risk: 'Carbon price on production', type: 'Policy', severity_1_5c: 'high', detail: 'EU ETS free allowance phase-out accelerating. Full carbon cost on industrial production by 2034.' },
  ],
  'Consumer & Retail': [
    { risk: 'Product sustainability regulation', type: 'Policy', severity_1_5c: 'high', detail: 'EU Ecodesign Regulation, Digital Product Passport and Green Claims Directive requiring product-level sustainability data.' },
    { risk: 'Deforestation regulation', type: 'Policy', severity_1_5c: 'high', detail: 'EU Deforestation Regulation (EUDR) requires deforestation-free supply chains for key commodities from 2025.' },
    { risk: 'Consumer sentiment shift', type: 'Market', severity_1_5c: 'medium', detail: 'Consumer preference shifting to sustainable products. Greenwashing claims creating reputational and legal risk.' },
  ],
  'Agriculture & Food': [
    { risk: 'Carbon pricing on agriculture', type: 'Policy', severity_1_5c: 'high', detail: 'Agricultural methane and N2O emissions increasingly subject to carbon pricing in NZ, EU and potentially US.' },
    { risk: 'Deforestation supply chain bans', type: 'Policy', severity_1_5c: 'critical', detail: 'EUDR, UK Forest Risk Commodities and US FOREST Act banning deforestation-linked commodities.' },
    { risk: 'Nature and biodiversity disclosure', type: 'Policy', severity_1_5c: 'high', detail: 'TNFD framework and CSRD ESRS E4 requiring nature-related disclosure. Biodiversity credit markets emerging.' },
  ],
  'Transport & Logistics': [
    { risk: 'Fleet electrification mandates', type: 'Policy', severity_1_5c: 'critical', detail: 'EU ICE vehicle ban from 2035. Zero-emission vehicle transition requires significant fleet and infrastructure capex.' },
    { risk: 'Aviation and maritime ETS', type: 'Policy', severity_1_5c: 'high', detail: 'EU ETS extended to aviation and maritime from 2024-2026. Carbon cost adds 5-15% to transport OpEx.' },
    { risk: 'Sustainable fuel mandates', type: 'Policy', severity_1_5c: 'high', detail: 'FuelEU Maritime and ReFuelEU Aviation requiring increasing SAF and green fuel blends. Supply and cost risk.' },
  ],
  'Mining & Metals': [
    { risk: 'Carbon price on smelting', type: 'Policy', severity_1_5c: 'critical', detail: 'EU ETS and CBAM applying to steel and aluminium production. Carbon cost competitiveness risk for EU operations.' },
    { risk: 'Critical minerals demand surge', type: 'Market', severity_1_5c: 'high', detail: 'Energy transition driving copper, lithium, cobalt, nickel demand surge. Price volatility and supply concentration risk.' },
    { risk: 'Nature and land use regulation', type: 'Policy', severity_1_5c: 'high', detail: 'Biodiversity net gain requirements and TNFD disclosure increasing for mining operations near sensitive ecosystems.' },
  ],
  'Construction & Materials': [
    { risk: 'EU CBAM on cement and steel', type: 'Policy', severity_1_5c: 'critical', detail: 'Carbon Border Adjustment Mechanism applies to cement and steel from 2026. Import carbon cost embedded.' },
    { risk: 'Whole-life carbon regulation', type: 'Policy', severity_1_5c: 'high', detail: 'Embodied carbon limits emerging in UK, France and Netherlands. Low-carbon construction materials commanding premium.' },
    { risk: 'Green building standards', type: 'Market', severity_1_5c: 'high', detail: 'BREEAM, LEED and DGNB certification increasingly required by developers and tenants. Materials sustainability data needed.' },
  ],
  'Professional Services': [
    { risk: 'Client net zero requirements', type: 'Market', severity_1_5c: 'medium', detail: 'Major clients requiring supply chain Scope 3 Cat.1 reporting. Net zero commitments becoming procurement criteria.' },
    { risk: 'Business travel carbon costs', type: 'Policy', severity_1_5c: 'medium', detail: 'EU aviation ETS and potential frequent flyer levies increasing business travel carbon cost.' },
  ],
  'Other': [
    { risk: 'General transition risk', type: 'Policy', severity_1_5c: 'medium', detail: 'Carbon pricing, disclosure requirements and customer expectations driving transition costs across all sectors.' },
  ],
}

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

const STEP_NAMES = ['Setup', 'Physical Risk', 'Transition Risk', 'Scenario Summary', 'Export']
const isPaid = true

export default function ClimateRiskDashboard() {
  const [step, setStep] = useState(0)
  const [setup, setSetup] = useState({
    company: '',
    sector: '',
    regions: [] as string[],
    revenue: 0,
    currency: 'USD',
    reporting_year: 2024,
    has_tcfd: false,
    has_scenario_analysis: false,
  })
  const [activeScenario, setActiveScenario] = useState('3c')
  const [dataConfirmed, setDataConfirmed] = useState(false)

  const updateSetup = (field: string, value: any) => setSetup(prev => ({ ...prev, [field]: value }))

  const toggleRegion = (region: string) => {
    setSetup(prev => ({
      ...prev,
      regions: prev.regions.includes(region)
        ? prev.regions.filter(r => r !== region)
        : [...prev.regions, region],
    }))
  }

  // Aggregate physical risks across all selected regions
  const physicalRisks = setup.regions.flatMap(r => PHYSICAL_RISKS[r] || [])
  const uniquePhysicalRisks = physicalRisks.filter((r, i, arr) => arr.findIndex(x => x.risk === r.risk) === i)
  const criticalPhysical = uniquePhysicalRisks.filter(r => r.severity_3c === 'critical')
  const highPhysical = uniquePhysicalRisks.filter(r => r.severity_3c === 'high')
  const mediumPhysical = uniquePhysicalRisks.filter(r => r.severity_3c === 'medium')

  // Transition risks for sector
  const transitionRisks = TRANSITION_RISKS[setup.sector] || TRANSITION_RISKS['Other'] || []
  const criticalTransition = transitionRisks.filter(r => r.severity_1_5c === 'critical')
  const highTransition = transitionRisks.filter(r => r.severity_1_5c === 'high')

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — Climate Risk Assessment'],
      ['Company', setup.company],
      ['Sector', setup.sector],
      ['Regions', setup.regions.join(', ')],
      ['Reporting year', setup.reporting_year],
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['PHYSICAL RISKS (3°C+ scenario)'],
      ['Risk', 'Hazard type', 'Severity', 'Detail'],
      ...uniquePhysicalRisks.map(r => [r.risk, r.hazard, r.severity_3c.toUpperCase(), r.trend]),
      [],
      ['TRANSITION RISKS (1.5°C scenario)'],
      ['Risk', 'Type', 'Severity', 'Detail'],
      ...transitionRisks.map(r => [r.risk, r.type, r.severity_1_5c.toUpperCase(), r.detail]),
      [],
      ['DISCLOSURE STATUS'],
      ['TCFD report published', setup.has_tcfd ? 'Yes' : 'No'],
      ['Climate scenario analysis conducted', setup.has_scenario_analysis ? 'Yes' : 'No'],
      [],
      ['Generated by ThemisIQ · www.themisiq.co · TCFD · IFRS S2 · CSRD ESRS E1'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${setup.company || 'Company'}_ClimateRisk_${setup.reporting_year}.csv`
    a.click()
  }

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Tell us about your company and where you operate so we can assess your physical and transition climate risk exposure.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={inputStyle} value={setup.company} onChange={e => updateSetup('company', e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Primary sector</label>
          <select style={inputStyle} value={setup.sector} onChange={e => updateSetup('sector', e.target.value)}>
            <option value="">Select sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Annual revenue ({setup.currency})</label>
          <input style={inputStyle} type="number" value={setup.revenue || ''} onChange={e => updateSetup('revenue', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={inputStyle} value={setup.reporting_year} onChange={e => updateSetup('reporting_year', Number(e.target.value))}>
            {[2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <label style={labelStyle}>Regions of operation (select all that apply)</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
        {REGIONS.map(region => {
          const selected = setup.regions.includes(region)
          return (
            <div key={region} onClick={() => toggleRegion(region)} style={{ border: `1.5px solid ${selected ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', background: selected ? '#EDE9FE' : '#f8f7f5', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s' }}>
              <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${selected ? '#7425e3' : '#e8e7e4'}`, background: selected ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {selected && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? '#7425e3' : '#555553' }}>{region}</span>
            </div>
          )
        })}
      </div>

      <label style={labelStyle}>Current disclosure status</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[
          { field: 'has_tcfd', label: 'Has your company published a TCFD or IFRS S2 climate report?' },
          { field: 'has_scenario_analysis', label: 'Has your company conducted climate scenario analysis (1.5°C, 2°C, 3°C+)?' },
        ].map(({ field, label }) => (
          <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '10px 14px', border: '1px solid #e8e7e4', borderRadius: 10 }}>
            <div style={{ fontSize: 13, color: '#555553' }}>{label}</div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                <button key={String(opt.val)} onClick={() => updateSetup(field, opt.val)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: (setup as any)[field] === opt.val ? '#0d0d0d' : '#f8f7f5', color: (setup as any)[field] === opt.val ? '#fff' : '#555553', border: `0.5px solid ${(setup as any)[field] === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Physical climate risk</h2>
      <p style={sectionSub}>Acute and chronic physical risks across your operating regions under the 3°C+ scenario — the highest physical risk pathway.</p>

      {setup.regions.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>Select operating regions in Step 1 to see physical risk assessment.</div>
      ) : (
        <>
          {/* Scenario selector */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
            {SCENARIOS.map(s => (
              <div key={s.id} onClick={() => setActiveScenario(s.id)} style={{ border: `1.5px solid ${activeScenario === s.id ? s.color : '#e8e7e4'}`, borderRadius: 10, padding: '0.75rem', cursor: 'pointer', background: activeScenario === s.id ? s.bg : '#f8f7f5', transition: 'all 0.15s' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: activeScenario === s.id ? s.color : '#888784', marginBottom: 2 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.4 }}>{s.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Critical risks', count: criticalPhysical.length, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risks', count: highPhysical.length, color: '#ba7517', bg: '#FEF3E2' },
              { label: 'Medium risks', count: mediumPhysical.length, color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {uniquePhysicalRisks.map((risk, i) => {
              const cfg = SEVERITY_CONFIG[risk.severity_3c]
              return (
                <div key={i} style={{ border: `1px solid ${cfg.border}20`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: risk.severity_3c === 'critical' ? cfg.bg : '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: `0.5px solid ${cfg.border}20` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{risk.risk}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#888784' }}>{risk.hazard}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{risk.trend}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Transition climate risk</h2>
      <p style={sectionSub}>Policy, market, technology and reputational transition risks for your sector under the 1.5°C scenario — the highest transition risk pathway.</p>

      {!setup.sector ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>Select a sector in Step 1 to see transition risk assessment.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Critical risks', count: criticalTransition.length, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risks', count: highTransition.length, color: '#ba7517', bg: '#FEF3E2' },
              { label: 'Total risks', count: transitionRisks.length, color: '#0d0d0d', bg: '#f8f7f5' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {transitionRisks.map((risk, i) => {
              const cfg = SEVERITY_CONFIG[risk.severity_1_5c]
              return (
                <div key={i} style={{ border: `1px solid ${cfg.border}20`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: risk.severity_1_5c === 'critical' ? cfg.bg : '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: `0.5px solid ${cfg.border}20` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{risk.risk}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#888784' }}>{risk.type}</span>
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
      <h2 style={sectionHead}>Scenario summary</h2>
      <p style={sectionSub}>Your overall climate risk profile across the three IPCC scenarios — for TCFD, IFRS S2 and CSRD ESRS E1 disclosure.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {SCENARIOS.map(scenario => {
          const physRisks = scenario.id === '3c' ? uniquePhysicalRisks.length : scenario.id === '2c' ? Math.round(uniquePhysicalRisks.length * 0.65) : Math.round(uniquePhysicalRisks.length * 0.35)
          const transRisks = scenario.id === '1_5c' ? transitionRisks.length : scenario.id === '2c' ? Math.round(transitionRisks.length * 0.7) : Math.round(transitionRisks.length * 0.4)
          return (
            <div key={scenario.id} style={{ border: `1.5px solid ${scenario.color}30`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ background: scenario.bg, padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${scenario.color}20` }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: scenario.color }}>{scenario.label} Scenario</div>
                  <div style={{ fontSize: 12, color: '#555553', marginTop: 2 }}>{scenario.desc}</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: scenario.color, color: '#fff' }}>
                  {scenario.id === '1_5c' ? 'Highest transition risk' : scenario.id === '2c' ? 'Balanced risk' : 'Highest physical risk'}
                </div>
              </div>
              <div style={{ padding: '1rem 20px', background: '#fff', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#888784', marginBottom: 4 }}>Physical risks</div>
                  <div style={{ fontSize: 20, fontFamily: 'Georgia, serif', fontWeight: 400, color: scenario.id === '3c' ? '#B91C1C' : '#0d0d0d' }}>{physRisks}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#888784', marginBottom: 4 }}>Transition risks</div>
                  <div style={{ fontSize: 20, fontFamily: 'Georgia, serif', fontWeight: 400, color: scenario.id === '1_5c' ? '#B91C1C' : '#0d0d0d' }}>{transRisks}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#888784', marginBottom: 4 }}>Overall rating</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: scenario.color }}>
                    {scenario.id === '3c' ? (physRisks > 3 ? 'HIGH PHYSICAL' : 'MODERATE') : scenario.id === '1_5c' ? (transRisks > 2 ? 'HIGH TRANSITION' : 'MODERATE') : 'MODERATE'}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Disclosure gaps */}
      {(!setup.has_tcfd || !setup.has_scenario_analysis) && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 12, padding: '1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#ba7517', marginBottom: 8 }}>⚠ Disclosure gaps</div>
          {!setup.has_tcfd && <div style={{ fontSize: 12, color: '#555553', marginBottom: 4 }}>· No TCFD/IFRS S2 report published — required for large companies under CSRD and IFRS S2</div>}
          {!setup.has_scenario_analysis && <div style={{ fontSize: 12, color: '#555553' }}>· No climate scenario analysis conducted — mandatory under TCFD, IFRS S2 and CSRD ESRS E1</div>}
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export climate risk report</h2>
      <p style={sectionSub}>Download your climate risk assessment for TCFD, IFRS S2 or CSRD ESRS E1 disclosure.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Risk summary — {setup.company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Regions assessed', val: setup.regions.length },
            { label: 'Physical risks', val: uniquePhysicalRisks.length, urgent: criticalPhysical.length > 0 },
            { label: 'Transition risks', val: transitionRisks.length, urgent: criticalTransition.length > 0 },
            { label: 'Frameworks', val: 'TCFD · IFRS S2 · CSRD' },
          ].map(({ label, val, urgent }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.6rem' : '0.85rem', fontFamily: typeof val === 'number' ? 'Georgia, serif' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 500, color: urgent ? '#64fe3e' : '#fff', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm this assessment is for planning and disclosure purposes. Climate risk assessments should be reviewed by a qualified climate risk specialist before publication.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: dataConfirmed ? 'pointer' : 'not-allowed', opacity: dataConfirmed ? 1 : 0.4 }}>
            ⬇ Download Climate Risk Report (CSV)
          </button>
        </div>
      ) : (
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Unlock your full climate risk programme</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6 }}>Download your climate risk report, generate TCFD-aligned scenario narratives, and access ThemisIQ's climate risk advisory for IFRS S2 and CSRD ESRS E1 compliance.</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]
  const totalRisks = uniquePhysicalRisks.length + transitionRisks.length

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: '#0F6E56', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>IFRS S2 effective FY2024 · CSRD ESRS E1 climate disclosure active · TCFD mandatory for UK listed companies. Climate risk is now a reporting obligation.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Climate Risk</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Physical & Transition Risk Assessment</div>
          </div>
          {setup.company && <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{setup.company}</div>}
        </div>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#0F6E56' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Risk summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Company', val: setup.company || '—' },
                    { label: 'Regions', val: setup.regions.length },
                    { label: 'Physical risks', val: uniquePhysicalRisks.length, urgent: criticalPhysical.length > 0 },
                    { label: 'Transition risks', val: transitionRisks.length, urgent: criticalTransition.length > 0 },
                    { label: 'Total risks', val: totalRisks, urgent: totalRisks > 3 },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? '#64fe3e' : '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {criticalPhysical.length > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ {criticalPhysical.length} critical physical risk{criticalPhysical.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>Material physical risks requiring TCFD/IFRS S2 quantification</div>
                </div>
              )}
              <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6 }}><strong>TCFD · IFRS S2 · CSRD ESRS E1</strong><br />1.5°C · 2°C · 3°C+ scenarios</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
