'use client'

import { useState } from 'react'
import Nav from '../../components/Nav'

// ─── Scope 3 Category Definitions ────────────────────────────────────────────

const CATEGORIES = [
  // Upstream
  { id: 'cat1', num: 1, name: 'Purchased goods & services', stream: 'Upstream', desc: 'Emissions from producing goods and services you purchase', method: 'spend', unit: 'spend', materialSectors: ['all'], typicalShare: 0.60 },
  { id: 'cat2', num: 2, name: 'Capital goods', stream: 'Upstream', desc: 'Emissions from producing capital equipment and assets you buy', method: 'spend', unit: 'spend', materialSectors: ['Industrials & Manufacturing', 'Energy & Utilities', 'Mining & Metals'], typicalShare: 0.05 },
  { id: 'cat3', num: 3, name: 'Fuel & energy related', stream: 'Upstream', desc: 'Upstream emissions from extraction and production of fuels and energy you use', method: 'activity', unit: 'kwh', materialSectors: ['all'], typicalShare: 0.03 },
  { id: 'cat4', num: 4, name: 'Upstream transportation', stream: 'Upstream', desc: 'Emissions from transporting purchased goods to your facilities', method: 'activity', unit: 'tonne_km', materialSectors: ['Consumer & Retail', 'Agriculture & Food', 'Industrials & Manufacturing'], typicalShare: 0.04 },
  { id: 'cat5', num: 5, name: 'Waste generated in operations', stream: 'Upstream', desc: 'Emissions from disposal and treatment of waste generated', method: 'activity', unit: 'tonnes', materialSectors: ['all'], typicalShare: 0.01 },
  { id: 'cat6', num: 6, name: 'Business travel', stream: 'Upstream', desc: 'Emissions from employee travel for business purposes', method: 'activity', unit: 'mixed', materialSectors: ['Professional Services', 'Financial Services', 'Technology'], typicalShare: 0.05 },
  { id: 'cat7', num: 7, name: 'Employee commuting', stream: 'Upstream', desc: 'Emissions from employees travelling to and from work', method: 'activity', unit: 'mixed', materialSectors: ['all'], typicalShare: 0.03 },
  { id: 'cat8', num: 8, name: 'Upstream leased assets', stream: 'Upstream', desc: 'Emissions from assets leased by your organisation', method: 'activity', unit: 'kwh', materialSectors: ['Real Estate', 'Transport & Logistics'], typicalShare: 0.02 },
  // Downstream
  { id: 'cat9', num: 9, name: 'Downstream transportation', stream: 'Downstream', desc: 'Emissions from transporting and distributing sold products', method: 'activity', unit: 'tonne_km', materialSectors: ['Consumer & Retail', 'Agriculture & Food', 'Industrials & Manufacturing'], typicalShare: 0.03 },
  { id: 'cat10', num: 10, name: 'Processing of sold products', stream: 'Downstream', desc: 'Emissions from processing your intermediate products by third parties', method: 'activity', unit: 'tonnes', materialSectors: ['Industrials & Manufacturing', 'Agriculture & Food'], typicalShare: 0.02 },
  { id: 'cat11', num: 11, name: 'Use of sold products', stream: 'Downstream', desc: 'Emissions from end-users using your sold products', method: 'activity', unit: 'units', materialSectors: ['Technology', 'Energy & Utilities', 'Consumer & Retail', 'Industrials & Manufacturing'], typicalShare: 0.15 },
  { id: 'cat12', num: 12, name: 'End-of-life treatment', stream: 'Downstream', desc: 'Emissions from disposal of your sold products at end of life', method: 'activity', unit: 'tonnes', materialSectors: ['Consumer & Retail', 'Industrials & Manufacturing', 'Technology'], typicalShare: 0.02 },
  { id: 'cat13', num: 13, name: 'Downstream leased assets', stream: 'Downstream', desc: 'Emissions from assets owned and leased to others', method: 'activity', unit: 'kwh', materialSectors: ['Real Estate', 'Financial Services'], typicalShare: 0.01 },
  { id: 'cat14', num: 14, name: 'Franchises', stream: 'Downstream', desc: 'Emissions from franchise operations', method: 'activity', unit: 'spend', materialSectors: ['Consumer & Retail'], typicalShare: 0.01 },
  { id: 'cat15', num: 15, name: 'Investments', stream: 'Downstream', desc: 'Emissions associated with investments and lending (financed emissions)', method: 'pcaf', unit: 'spend', materialSectors: ['Financial Services'], typicalShare: 0.90 },
]

// Sector-based materiality
const SECTOR_MATERIAL: Record<string, number[]> = {
  'Energy & Utilities': [1, 2, 3, 4, 6, 7, 11],
  'Financial Services': [1, 3, 6, 7, 13, 15],
  'Real Estate': [1, 2, 3, 7, 8, 13],
  'Technology': [1, 3, 6, 7, 11, 12],
  'Healthcare & Pharma': [1, 3, 4, 5, 6, 7],
  'Industrials & Manufacturing': [1, 2, 3, 4, 5, 7, 9, 10, 12],
  'Consumer & Retail': [1, 3, 4, 6, 7, 9, 11, 12, 14],
  'Agriculture & Food': [1, 3, 4, 5, 7, 9, 10],
  'Transport & Logistics': [1, 3, 4, 6, 7, 8, 9],
  'Mining & Metals': [1, 2, 3, 4, 5, 7],
  'Construction & Materials': [1, 2, 3, 4, 5, 7, 9],
  'Professional Services': [1, 3, 6, 7],
  'Other': [1, 3, 6, 7],
}

// Emission factors (kg CO2e per unit)
const EMISSION_FACTORS = {
  // Spend-based (kg CO2e per USD spent) by sector
  spend: {
    'Energy & Utilities': 0.85,
    'Financial Services': 0.12,
    'Real Estate': 0.45,
    'Technology': 0.18,
    'Healthcare & Pharma': 0.32,
    'Industrials & Manufacturing': 1.10,
    'Consumer & Retail': 0.42,
    'Agriculture & Food': 2.80,
    'Transport & Logistics': 0.90,
    'Mining & Metals': 4.20,
    'Construction & Materials': 3.10,
    'Professional Services': 0.10,
    'Other': 0.50,
  } as Record<string, number>,
  // Activity-based
  flight_short: 0.255,    // kg CO2e per km per passenger (< 3hrs)
  flight_long: 0.195,     // kg CO2e per km per passenger (> 3hrs)
  hotel: 31.0,            // kg CO2e per night
  rail: 0.041,            // kg CO2e per km
  car_petrol: 0.170,      // kg CO2e per km
  car_electric: 0.053,    // kg CO2e per km
  bus: 0.089,             // kg CO2e per km
  waste_landfill: 0.467,  // kg CO2e per tonne
  waste_recycled: 0.021,  // kg CO2e per tonne
  electricity: 0.000233,  // kg CO2e per kWh (UK average)
}

const SECTORS = [
  'Energy & Utilities', 'Financial Services', 'Real Estate', 'Technology',
  'Healthcare & Pharma', 'Industrials & Manufacturing', 'Consumer & Retail',
  'Agriculture & Food', 'Transport & Logistics', 'Mining & Metals',
  'Construction & Materials', 'Professional Services', 'Other',
]

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }

const STEP_NAMES = ['Setup', 'Materiality', 'Calculate', 'Results', 'Export']
const isPaid = false

interface CategoryData {
  included: boolean
  excluded_reason: string
  // Cat 1
  total_spend?: number
  supplier_sector?: string
  has_supplier_data?: boolean
  supplier_emissions?: number
  // Cat 6
  short_haul_flights?: number
  long_haul_flights?: number
  avg_flight_km?: number
  hotel_nights?: number
  rail_km?: number
  // Cat 7
  employee_count?: number
  avg_commute_km?: number
  commute_mode?: string
  wfh_days?: number
  // Cat 5
  waste_landfill_tonnes?: number
  waste_recycled_tonnes?: number
  // Cat 11
  units_sold?: number
  energy_per_unit?: number
  // Cat 15
  portfolio_value?: number
  portfolio_sector?: string
  // Generic spend
  annual_spend?: number
  // Generic activity
  activity_value?: number
  emissions_override?: number
}

export default function Scope3Dashboard() {
  const [step, setStep] = useState(0)
  const [company, setCompany] = useState('')
  const [sector, setSector] = useState('')
  const [reportingYear, setReportingYear] = useState(2024)
  const [currency, setCurrency] = useState('USD')
  const [revenue, setRevenue] = useState(0)
  const [materialCats, setMaterialCats] = useState<number[]>([])
  const [catData, setCatData] = useState<Record<string, CategoryData>>({})
  const [dataConfirmed, setDataConfirmed] = useState(false)

  // Auto-detect material categories
  const autoDetect = () => {
    const suggested = SECTOR_MATERIAL[sector] || SECTOR_MATERIAL['Other']
    setMaterialCats(suggested)
    // Initialise category data
    const init: Record<string, CategoryData> = {}
    CATEGORIES.forEach(c => {
      init[c.id] = { included: suggested.includes(c.num), excluded_reason: '' }
    })
    setCatData(init)
  }

  const toggleCat = (num: number) => {
    setMaterialCats(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    )
    const cat = CATEGORIES.find(c => c.num === num)
    if (!cat) return
    setCatData(prev => ({
      ...prev,
      [cat.id]: { ...prev[cat.id], included: !prev[cat.id]?.included }
    }))
  }

  const updateCat = (id: string, field: string, value: any) => {
    setCatData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  // ─── Calculations ────────────────────────────────────────────────────────────

  const calcCat1 = (): number => {
    const d = catData['cat1']
    if (!d?.included) return 0
    if (d.has_supplier_data && d.supplier_emissions) return d.supplier_emissions
    const spend = d.total_spend || 0
    const ef = EMISSION_FACTORS.spend[d.supplier_sector || sector] || 0.5
    return (spend * ef) / 1000 // convert kg to mt
  }

  const calcCat6 = (): number => {
    const d = catData['cat6']
    if (!d?.included) return 0
    const shortHaul = (d.short_haul_flights || 0) * (d.avg_flight_km || 800) * EMISSION_FACTORS.flight_short
    const longHaul = (d.long_haul_flights || 0) * (d.avg_flight_km || 5000) * EMISSION_FACTORS.flight_long
    const hotels = (d.hotel_nights || 0) * EMISSION_FACTORS.hotel
    const rail = (d.rail_km || 0) * EMISSION_FACTORS.rail
    return (shortHaul + longHaul + hotels + rail) / 1000
  }

  const calcCat7 = (): number => {
    const d = catData['cat7']
    if (!d?.included) return 0
    const employees = d.employee_count || 0
    const commuteKm = d.avg_commute_km || 15
    const wfhDays = d.wfh_days || 0
    const workingDays = 235 - wfhDays
    const ef = d.commute_mode === 'car_electric' ? EMISSION_FACTORS.car_electric
      : d.commute_mode === 'bus' ? EMISSION_FACTORS.bus
      : d.commute_mode === 'rail' ? EMISSION_FACTORS.rail
      : EMISSION_FACTORS.car_petrol
    return (employees * commuteKm * 2 * workingDays * ef) / 1000
  }

  const calcCat5 = (): number => {
    const d = catData['cat5']
    if (!d?.included) return 0
    const landfill = (d.waste_landfill_tonnes || 0) * EMISSION_FACTORS.waste_landfill
    const recycled = (d.waste_recycled_tonnes || 0) * EMISSION_FACTORS.waste_recycled
    return (landfill + recycled) / 1000
  }

  const calcGenericSpend = (id: string): number => {
    const d = catData[id]
    if (!d?.included) return 0
    if (d.emissions_override) return d.emissions_override
    const spend = d.annual_spend || 0
    return (spend * 0.5) / 1000
  }

  const calcCat15 = (): number => {
    const d = catData['cat15']
    if (!d?.included) return 0
    if (d.emissions_override) return d.emissions_override
    const portfolio = d.portfolio_value || 0
    const ef = EMISSION_FACTORS.spend[d.portfolio_sector || 'Financial Services'] || 0.12
    return (portfolio * ef) / 1000
  }

  const getCatEmissions = (id: string): number => {
    switch (id) {
      case 'cat1': return calcCat1()
      case 'cat5': return calcCat5()
      case 'cat6': return calcCat6()
      case 'cat7': return calcCat7()
      case 'cat15': return calcCat15()
      default: return calcGenericSpend(id)
    }
  }

  const totalScope3 = CATEGORIES.filter(c => catData[c.id]?.included)
    .reduce((sum, c) => sum + getCatEmissions(c.id), 0)

  const getConfidence = (id: string): 'high' | 'medium' | 'low' => {
    const d = catData[id]
    if (!d?.included) return 'low'
    if (d.emissions_override || d.has_supplier_data) return 'high'
    if (id === 'cat6' && (d.short_haul_flights || d.long_haul_flights)) return 'medium'
    if (id === 'cat7' && d.employee_count) return 'medium'
    if (id === 'cat5' && (d.waste_landfill_tonnes || d.waste_recycled_tonnes)) return 'medium'
    if (d.annual_spend || d.total_spend) return 'low'
    return 'low'
  }

  const confidenceConfig = {
    high: { label: 'Primary data', color: '#0F6E56', bg: '#E1F5EE' },
    medium: { label: 'Activity data', color: '#0C447C', bg: '#E6F1FB' },
    low: { label: 'Spend-based', color: '#ba7517', bg: '#FEF3E2' },
  }

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — Scope 3 GHG Inventory'],
      ['Company', company],
      ['Sector', sector],
      ['Reporting year', reportingYear],
      ['Total Scope 3', `${totalScope3.toFixed(2)} mt CO2e`],
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['SCOPE 3 BY CATEGORY'],
      ['Category', 'Name', 'mt CO2e', 'Method', 'Confidence', 'Included'],
      ...CATEGORIES.map(c => [
        `Cat ${c.num}`,
        c.name,
        catData[c.id]?.included ? getCatEmissions(c.id).toFixed(2) : '—',
        catData[c.id]?.included ? confidenceConfig[getConfidence(c.id)].label : 'Excluded',
        catData[c.id]?.included ? confidenceConfig[getConfidence(c.id)].label : '—',
        catData[c.id]?.included ? 'Yes' : `No — ${catData[c.id]?.excluded_reason || 'not material'}`,
      ]),
      [],
      ['METHODOLOGY NOTE'],
      ['Spend-based estimates use DEFRA/Exiobase emission factors. Activity-based calculations use GHG Protocol Category-specific methodologies. Primary data supersedes all estimates where available.'],
      [],
      ['Generated by ThemisIQ · www.themisiq.co · GHG Protocol Scope 3 Standard'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${company}_Scope3_${reportingYear}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Tell us about your organisation so we can identify which Scope 3 categories are material to you.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Primary sector</label>
          <select style={inputStyle} value={sector} onChange={e => setSector(e.target.value)}>
            <option value="">Select sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={inputStyle} value={reportingYear} onChange={e => setReportingYear(Number(e.target.value))}>
            {[2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={currency} onChange={e => setCurrency(e.target.value)}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Annual revenue ({currency})</label>
          <input style={inputStyle} type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))} placeholder="0" />
        </div>
      </div>
      <div style={{ marginTop: 20, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '1rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>GHG Protocol Scope 3 Standard</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>ThemisIQ follows the GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard. You must report all material categories and explain exclusions.</div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Materiality screening</h2>
      <p style={sectionSub}>ThemisIQ has identified the Scope 3 categories likely to be material for a {sector || 'company'} based on GHG Protocol guidance. Review and confirm.</p>

      {!sector ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>Select your sector in Step 1 first.</div>
      ) : (
        <>
          <button onClick={autoDetect} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer', marginBottom: 20 }}>
            ⚡ Auto-detect material categories for {sector}
          </button>

          {['Upstream', 'Downstream'].map(stream => (
            <div key={stream} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 10 }}>{stream}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CATEGORIES.filter(c => c.stream === stream).map(cat => {
                  const included = catData[cat.id]?.included ?? materialCats.includes(cat.num)
                  const isMaterial = (SECTOR_MATERIAL[sector] || []).includes(cat.num)
                  return (
                    <div key={cat.id} onClick={() => toggleCat(cat.num)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `1.5px solid ${included ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, cursor: 'pointer', background: included ? '#EDE9FE' : '#f8f7f5', transition: 'all 0.15s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${included ? '#7425e3' : '#e8e7e4'}`, background: included ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {included && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#888784', minWidth: 40 }}>Cat {cat.num}</span>
                          <span style={{ fontSize: 13, fontWeight: included ? 600 : 400, color: included ? '#7425e3' : '#0d0d0d' }}>{cat.name}</span>
                          {isMaterial && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56' }}>LIKELY MATERIAL</span>}
                          {cat.num === 15 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#FCEBEB', color: '#B91C1C' }}>PCAF METHOD</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{cat.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  const renderStep2 = () => {
    const activeCats = CATEGORIES.filter(c => catData[c.id]?.included)
    return (
      <div>
        <h2 style={sectionHead}>Data entry</h2>
        <p style={sectionSub}>Enter data for each material category. ThemisIQ will calculate emissions using the best available method.</p>

        {activeCats.length === 0 ? (
          <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>No categories selected — go back to Step 2 to select material categories.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeCats.map(cat => (
              <div key={cat.id} style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ background: '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginRight: 10 }}>Cat {cat.num}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{cat.name}</span>
                  </div>
                  {getCatEmissions(cat.id) > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64fe3e' }}>{getCatEmissions(cat.id).toFixed(2)} mt CO₂e</span>
                  )}
                </div>
                <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                  {/* Cat 1 — Purchased goods */}
                  {cat.id === 'cat1' && <>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Do you have supplier-specific emissions data?</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[{ label: 'Yes — I have actual data', val: true }, { label: 'No — use spend-based estimate', val: false }].map(opt => (
                          <button key={String(opt.val)} onClick={() => updateCat('cat1', 'has_supplier_data', opt.val)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: catData['cat1']?.has_supplier_data === opt.val ? '#0d0d0d' : '#f8f7f5', color: catData['cat1']?.has_supplier_data === opt.val ? '#fff' : '#555553', border: `0.5px solid ${catData['cat1']?.has_supplier_data === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    {catData['cat1']?.has_supplier_data ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Total supplier emissions (mt CO₂e)</label>
                        <input style={inputStyle} type="number" value={catData['cat1']?.supplier_emissions || ''} onChange={e => updateCat('cat1', 'supplier_emissions', Number(e.target.value))} placeholder="0" />
                      </div>
                    ) : <>
                      <div>
                        <label style={labelStyle}>Total annual spend ({currency})</label>
                        <input style={inputStyle} type="number" value={catData['cat1']?.total_spend || ''} onChange={e => updateCat('cat1', 'total_spend', Number(e.target.value))} placeholder="0" />
                      </div>
                      <div>
                        <label style={labelStyle}>Primary supplier sector</label>
                        <select style={inputStyle} value={catData['cat1']?.supplier_sector || sector} onChange={e => updateCat('cat1', 'supplier_sector', e.target.value)}>
                          {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </>}
                    <div style={{ gridColumn: '1 / -1', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#888784' }}>
                      💡 For more accurate Cat 1 data, use the ThemisIQ Supplier Portal to collect primary emissions data from your suppliers directly.
                    </div>
                  </>}

                  {/* Cat 6 — Business travel */}
                  {cat.id === 'cat6' && <>
                    <div>
                      <label style={labelStyle}>Short-haul flights (under 3hrs)</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.short_haul_flights || ''} onChange={e => updateCat('cat6', 'short_haul_flights', Number(e.target.value))} placeholder="Number of flights" />
                    </div>
                    <div>
                      <label style={labelStyle}>Long-haul flights (over 3hrs)</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.long_haul_flights || ''} onChange={e => updateCat('cat6', 'long_haul_flights', Number(e.target.value))} placeholder="Number of flights" />
                    </div>
                    <div>
                      <label style={labelStyle}>Hotel nights</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.hotel_nights || ''} onChange={e => updateCat('cat6', 'hotel_nights', Number(e.target.value))} placeholder="Total nights" />
                    </div>
                    <div>
                      <label style={labelStyle}>Rail travel (km)</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.rail_km || ''} onChange={e => updateCat('cat6', 'rail_km', Number(e.target.value))} placeholder="Total km" />
                    </div>
                  </>}

                  {/* Cat 7 — Employee commuting */}
                  {cat.id === 'cat7' && <>
                    <div>
                      <label style={labelStyle}>Number of employees</label>
                      <input style={inputStyle} type="number" value={catData['cat7']?.employee_count || ''} onChange={e => updateCat('cat7', 'employee_count', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Average commute distance (km one way)</label>
                      <input style={inputStyle} type="number" value={catData['cat7']?.avg_commute_km || ''} onChange={e => updateCat('cat7', 'avg_commute_km', Number(e.target.value))} placeholder="15" />
                    </div>
                    <div>
                      <label style={labelStyle}>Primary commute mode</label>
                      <select style={inputStyle} value={catData['cat7']?.commute_mode || 'car_petrol'} onChange={e => updateCat('cat7', 'commute_mode', e.target.value)}>
                        <option value="car_petrol">Car (petrol/diesel)</option>
                        <option value="car_electric">Car (electric)</option>
                        <option value="bus">Bus</option>
                        <option value="rail">Rail / metro</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Average WFH days per week</label>
                      <select style={inputStyle} value={catData['cat7']?.wfh_days || 0} onChange={e => updateCat('cat7', 'wfh_days', Number(e.target.value))}>
                        {[0, 1, 2, 3, 4, 5].map(d => <option key={d} value={d * 47}>{d} days/week</option>)}
                      </select>
                    </div>
                  </>}

                  {/* Cat 5 — Waste */}
                  {cat.id === 'cat5' && <>
                    <div>
                      <label style={labelStyle}>Waste to landfill (tonnes)</label>
                      <input style={inputStyle} type="number" value={catData['cat5']?.waste_landfill_tonnes || ''} onChange={e => updateCat('cat5', 'waste_landfill_tonnes', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Waste recycled (tonnes)</label>
                      <input style={inputStyle} type="number" value={catData['cat5']?.waste_recycled_tonnes || ''} onChange={e => updateCat('cat5', 'waste_recycled_tonnes', Number(e.target.value))} placeholder="0" />
                    </div>
                  </>}

                  {/* Cat 15 — Investments */}
                  {cat.id === 'cat15' && <>
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', marginBottom: 8 }}>
                      Cat 15 uses the PCAF (Partnership for Carbon Accounting Financials) methodology. Enter your total investment/loan portfolio value and primary sector exposure.
                    </div>
                    <div>
                      <label style={labelStyle}>Total portfolio value ({currency})</label>
                      <input style={inputStyle} type="number" value={catData['cat15']?.portfolio_value || ''} onChange={e => updateCat('cat15', 'portfolio_value', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Primary portfolio sector</label>
                      <select style={inputStyle} value={catData['cat15']?.portfolio_sector || 'Financial Services'} onChange={e => updateCat('cat15', 'portfolio_sector', e.target.value)}>
                        {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Or enter known financed emissions directly (mt CO₂e)</label>
                      <input style={inputStyle} type="number" value={catData['cat15']?.emissions_override || ''} onChange={e => updateCat('cat15', 'emissions_override', Number(e.target.value))} placeholder="Override with primary data" />
                    </div>
                  </>}

                  {/* Generic spend-based for other categories */}
                  {!['cat1', 'cat6', 'cat7', 'cat5', 'cat15'].includes(cat.id) && <>
                    <div>
                      <label style={labelStyle}>Annual spend / value ({currency})</label>
                      <input style={inputStyle} type="number" value={catData[cat.id]?.annual_spend || ''} onChange={e => updateCat(cat.id, 'annual_spend', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Known emissions (mt CO₂e) — optional override</label>
                      <input style={inputStyle} type="number" value={catData[cat.id]?.emissions_override || ''} onChange={e => updateCat(cat.id, 'emissions_override', Number(e.target.value))} placeholder="Leave blank to use spend-based" />
                    </div>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderStep3 = () => {
    const activeCats = CATEGORIES.filter(c => catData[c.id]?.included && getCatEmissions(c.id) > 0)
      .sort((a, b) => getCatEmissions(b.id) - getCatEmissions(a.id))
    const highCount = activeCats.filter(c => getConfidence(c.id) === 'high').length
    const medCount = activeCats.filter(c => getConfidence(c.id) === 'medium').length
    const lowCount = activeCats.filter(c => getConfidence(c.id) === 'low').length

    return (
      <div>
        <h2 style={sectionHead}>Scope 3 results</h2>
        <p style={sectionSub}>Your total Scope 3 inventory across all material categories — GHG Protocol aligned.</p>

        {/* Total */}
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '3rem', fontWeight: 400, color: '#64fe3e', lineHeight: 1 }}>{totalScope3.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>mt CO₂e total Scope 3</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Data quality</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {highCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56', fontWeight: 600 }}>{highCount} primary data</span>}
              {medCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#E6F1FB', color: '#0C447C', fontWeight: 600 }}>{medCount} activity data</span>}
              {lowCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#FEF3E2', color: '#ba7517', fontWeight: 600 }}>{lowCount} spend-based</span>}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>{company} · {reportingYear} · GHG Protocol Scope 3 Standard</div>
          </div>
        </div>

        {/* Category breakdown */}
        <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 80px', background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
            {['#', 'Category', 'mt CO₂e', '% of total', 'Method'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
            ))}
          </div>
          {activeCats.map((cat, i) => {
            const emissions = getCatEmissions(cat.id)
            const pct = totalScope3 > 0 ? ((emissions / totalScope3) * 100).toFixed(1) : '0'
            const conf = getConfidence(cat.id)
            const ccfg = confidenceConfig[conf]
            return (
              <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 80px', padding: '12px 16px', borderBottom: i < activeCats.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'center', background: i === 0 ? '#fafafa' : '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888784' }}>{cat.num}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{cat.name}</div>
                  <div style={{ fontSize: 10, color: '#888784' }}>{cat.stream}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{emissions.toFixed(2)}</div>
                <div>
                  <div style={{ fontSize: 12, color: '#555553' }}>{pct}%</div>
                  <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: GRAD, borderRadius: 99 }} />
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: ccfg.bg, color: ccfg.color }}>{ccfg.label}</span>
                </div>
              </div>
            )
          })}
          {activeCats.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888784', fontSize: 13 }}>No data entered yet — go back to Step 3 to enter your data.</div>
          )}
        </div>

        {/* Excluded categories */}
        {CATEGORIES.filter(c => !catData[c.id]?.included).length > 0 && (
          <div style={{ marginTop: 16, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 6 }}>EXCLUDED CATEGORIES (not material)</div>
            <div style={{ fontSize: 12, color: '#888784' }}>
              {CATEGORIES.filter(c => !catData[c.id]?.included).map(c => `Cat ${c.num} (${c.name})`).join(' · ')}
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export Scope 3 inventory</h2>
      <p style={sectionSub}>Download your GHG Protocol-aligned Scope 3 inventory for CSRD, CDP, SBTi and SB 253 reporting.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Inventory summary — {company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Scope 3', val: `${totalScope3.toFixed(1)} mt` },
            { label: 'Categories', val: CATEGORIES.filter(c => catData[c.id]?.included).length },
            { label: 'Reporting year', val: reportingYear },
            { label: 'Standard', val: 'GHG Protocol' },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.4rem' : '0.9rem', fontFamily: typeof val === 'number' ? 'Georgia, serif' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: '#fff', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm that the data entered is accurate to the best of my knowledge. I understand that spend-based estimates carry inherent uncertainty and should be disclosed as such in external reports.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: dataConfirmed ? 'pointer' : 'not-allowed', opacity: dataConfirmed ? 1 : 0.4 }}>
            ⬇ Download Scope 3 Inventory (CSV)
          </button>
        </div>
      ) : (
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Unlock your full Scope 3 programme</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8, lineHeight: 1.6 }}>Download your GHG Protocol Scope 3 inventory, generate CSRD ESRS E1-6 disclosure tables, and access year-on-year tracking.</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>Included in the Climate GHG module · from $999/yr</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]
  const activeCatCount = CATEGORIES.filter(c => catData[c.id]?.included).length

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: '#0F6E56', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>GHG Protocol Scope 3 Standard · All 15 categories · CSRD ESRS E1-6 · CDP · SBTi · SB 253</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Climate — GHG Inventory</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Scope 3 Complete Calculator</div>
          </div>
          {totalScope3 > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#888784', marginBottom: 2 }}>Total Scope 3</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0F6E56' }}>{totalScope3.toFixed(1)} mt CO₂e</div>
            </div>
          )}
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
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Live summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Company', val: company || '—' },
                    { label: 'Sector', val: sector || '—' },
                    { label: 'Categories', val: activeCatCount },
                    { label: 'Total Scope 3', val: totalScope3 > 0 ? `${totalScope3.toFixed(1)} mt` : '—' },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '0.75rem', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6 }}><strong>GHG Protocol Scope 3 Standard</strong><br />All 15 categories · Spend-based + activity-based + primary data</div>
              </div>
              <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6 }}>Need supplier emissions data? <a href="/dashboard/supply-chain/portal" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 600 }}>Use the Supplier Portal →</a></div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
