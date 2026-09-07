'use client'

import { useState, useRef } from 'react'
import Nav from '../../components/Nav'
import Papa from 'papaparse'
import { useEntitlement } from '../../../lib/useEntitlement'
import { CS3D_APPLIES_FROM } from '../../../lib/cs3d'
import { sectionHead } from '@/app/components/headingStyles'
import { btnStep, btnStepDisabled, btnStepPrimary, btnStepPrimaryDisabled } from '@/app/components/buttonStyles'

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = 'critical' | 'high' | 'medium' | 'low'
type Framework = 'cs3d' | 'ecovadis' | 'modern_slavery' | 'cdp_c12' | 'esrs_s2' | 'scope3'

interface Supplier {
  id: string
  name: string
  country: string
  sector: string
  annual_spend: number
  currency: string
  tier: '1' | '2' | '3'
  has_assessment: boolean
  risk_level: RiskLevel
  risk_score: number
  risk_factors: string[]
  scope3_emissions: number
}

interface SupplyChainInventory {
  company: string
  reporting_year: number
  frameworks: Framework[]
  currency: string
  suppliers: Supplier[]
}

// ─── Risk Engine ──────────────────────────────────────────────────────────────

const COUNTRY_RISK: Record<string, { risk: number; label: string }> = {
  // Critical risk
  'Bangladesh': { risk: 4, label: 'Critical — labour rights, safety' },
  'Myanmar': { risk: 4, label: 'Critical — conflict, forced labour' },
  'North Korea': { risk: 4, label: 'Critical — forced labour' },
  'Eritrea': { risk: 4, label: 'Critical — forced labour' },
  'Uzbekistan': { risk: 3, label: 'High — cotton forced labour risk' },
  'China': { risk: 3, label: 'High — Xinjiang forced labour risk' },
  'Pakistan': { risk: 3, label: 'High — labour rights gaps' },
  'Cambodia': { risk: 3, label: 'High — garment sector risks' },
  'Vietnam': { risk: 2, label: 'Medium — improving but gaps remain' },
  'India': { risk: 2, label: 'Medium — sector-dependent risk' },
  'Brazil': { risk: 2, label: 'Medium — deforestation, labour risk' },
  'Mexico': { risk: 2, label: 'Medium — labour rights, security' },
  'Turkey': { risk: 2, label: 'Medium — labour rights concerns' },
  'Indonesia': { risk: 2, label: 'Medium — palm oil, deforestation' },
  'Thailand': { risk: 2, label: 'Medium — migrant labour risk' },
  // Low risk
  'Germany': { risk: 1, label: 'Low — strong regulatory framework' },
  'France': { risk: 1, label: 'Low — strong regulatory framework' },
  'UK': { risk: 1, label: 'Low — Modern Slavery Act compliance' },
  'Netherlands': { risk: 1, label: 'Low — strong regulatory framework' },
  'Sweden': { risk: 1, label: 'Low — strong regulatory framework' },
  'Denmark': { risk: 1, label: 'Low — strong regulatory framework' },
  'USA': { risk: 1, label: 'Low — regulated market' },
  'Canada': { risk: 1, label: 'Low — regulated market' },
  'Australia': { risk: 1, label: 'Low — Modern Slavery Act' },
  'Japan': { risk: 1, label: 'Low — regulated market' },
  'South Korea': { risk: 1, label: 'Low — regulated market' },
}

const SECTOR_RISK: Record<string, { risk: number; label: string; ef: number }> = {
  'Agriculture & Food': { risk: 3, label: 'High — land use, labour, water', ef: 2.8 },
  'Garments & Textiles': { risk: 4, label: 'Critical — labour, chemicals', ef: 1.2 },
  'Electronics & Technology': { risk: 3, label: 'High — minerals, e-waste', ef: 0.4 },
  'Construction & Materials': { risk: 3, label: 'High — safety, environment', ef: 3.1 },
  'Chemicals': { risk: 3, label: 'High — environmental, safety', ef: 1.8 },
  'Mining & Metals': { risk: 4, label: 'Critical — environment, safety', ef: 4.2 },
  'Transport & Logistics': { risk: 2, label: 'Medium — safety, emissions', ef: 0.9 },
  'Professional Services': { risk: 1, label: 'Low — standard risks only', ef: 0.1 },
  'IT & Software': { risk: 1, label: 'Low — data privacy focus', ef: 0.05 },
  'Financial Services': { risk: 1, label: 'Low — regulated sector', ef: 0.08 },
  'Healthcare & Pharma': { risk: 2, label: 'Medium — quality, safety', ef: 0.3 },
  'Energy & Utilities': { risk: 3, label: 'High — environmental impact', ef: 2.1 },
  'Retail & Distribution': { risk: 2, label: 'Medium — labour, packaging', ef: 0.4 },
  'Other Manufacturing': { risk: 2, label: 'Medium — sector-dependent', ef: 1.1 },
}

const COUNTRIES = Object.keys(COUNTRY_RISK).sort()
const SECTORS = Object.keys(SECTOR_RISK).sort()

const scoreSupplier = (supplier: Supplier): { risk: RiskLevel; score: number; factors: string[]; scope3: number } => {
  const countryData = COUNTRY_RISK[supplier.country] || { risk: 2, label: 'Unknown — assess manually' }
  const sectorData = SECTOR_RISK[supplier.sector] || { risk: 2, label: 'Unknown — assess manually', ef: 0.5 }

  const factors: string[] = []
  let score = 0

  // Country risk (40%)
  score += countryData.risk * 2.5
  if (countryData.risk >= 3) factors.push(`Country risk: ${countryData.label}`)

  // Sector risk (40%)
  score += sectorData.risk * 2.5
  if (sectorData.risk >= 3) factors.push(`Sector risk: ${sectorData.label}`)

  // Spend concentration (10%)
  if (supplier.annual_spend > 1000000) { score += 1; factors.push('High spend concentration — strategic dependency') }
  if (supplier.annual_spend > 5000000) { score += 1; factors.push('Very high spend — enhanced due diligence required') }

  // Tier risk (10%)
  if (supplier.tier === '2') { score += 0.5; factors.push('Tier 2 supplier — limited visibility') }
  if (supplier.tier === '3') { score += 1; factors.push('Tier 3 supplier — very limited visibility') }

  // No assessment
  if (!supplier.has_assessment) { score += 0.5; factors.push('No sustainability assessment on file') }

  const risk: RiskLevel = score >= 7 ? 'critical' : score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low'

  // Scope 3 Cat.1 spend-based estimate (kg CO2e per $ spend × annual spend / 1000 = mt)
  const scope3 = supplier.annual_spend > 0 ? (supplier.annual_spend * sectorData.ef) / 1000000 : 0

  return { risk, score: Math.round(score * 10) / 10, factors, scope3 }
}

const newSupplier = (): Supplier => ({
  id: Math.random().toString(36).slice(2),
  name: '', country: 'Germany', sector: 'Professional Services',
  annual_spend: 0, currency: 'USD', tier: '1',
  has_assessment: false, risk_level: 'low', risk_score: 0, risk_factors: [], scope3_emissions: 0,
})

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRAD = 'var(--color-brand)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionSub: React.CSSProperties = { fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'CRITICAL', color: '#fff', bg: '#B91C1C', border: '#B91C1C' },
  high:     { label: 'HIGH', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  medium:   { label: 'MEDIUM', color: 'var(--color-module-climate)', bg: '#FEF3E2', border: 'var(--color-module-climate)' },
  low:      { label: 'LOW', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' },
}

const FRAMEWORK_CONFIG: Record<Framework, { label: string; desc: string }> = {
  cs3d:          { label: 'EU CS3D', desc: `Human rights & environmental due diligence · ${CS3D_APPLIES_FROM}` },
  ecovadis:      { label: 'EcoVadis', desc: 'Supplier sustainability ratings · customer-requested' },
  modern_slavery:{ label: 'Modern Slavery Act', desc: 'UK & Australia transparency statement · annual' },
  cdp_c12:       { label: 'CDP supplier engagement', desc: 'Supplier engagement programme · annual · July' },
  esrs_s2:       { label: 'ESRS S2', desc: 'Value chain workers disclosure · FY2024 active' },
  scope3:        { label: 'Scope 3 Cat.1', desc: 'GHG Protocol purchased goods & services' },
}

const STEP_NAMES = ['Setup', 'Suppliers', 'Risk Scoring', 'Scope 3', 'Export']

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupplyChainDashboard() {
  const isPaid = useEntitlement('supply-chain')
  const [step, setStep] = useState(0)
  const [inventory, setInventory] = useState<SupplyChainInventory>({
    company: '', reporting_year: 2024,
    frameworks: ['cs3d', 'scope3', 'esrs_s2'],
    currency: 'USD', suppliers: [],
  })
  const [activeSupplier, setActiveSupplier] = useState(0)
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [sortBy, setSortBy] = useState<'risk' | 'spend' | 'name'>('risk')
  const fileRef = useRef<HTMLInputElement>(null)

  const update = (field: keyof SupplyChainInventory, value: any) =>
    setInventory(prev => ({ ...prev, [field]: value }))

  const toggleFramework = (fw: Framework) =>
    setInventory(prev => ({
      ...prev,
      frameworks: prev.frameworks.includes(fw)
        ? prev.frameworks.filter(f => f !== fw)
        : [...prev.frameworks, fw],
    }))

  const addSupplier = () => {
    const s = newSupplier()
    setInventory(prev => ({ ...prev, suppliers: [...prev.suppliers, s] }))
    setActiveSupplier(inventory.suppliers.length)
  }

  const updateSupplier = (idx: number, field: keyof Supplier, value: any) => {
    setInventory(prev => {
      const suppliers = [...prev.suppliers]
      suppliers[idx] = { ...suppliers[idx], [field]: value }
      // Auto score
      const result = scoreSupplier(suppliers[idx])
      suppliers[idx] = { ...suppliers[idx], risk_level: result.risk, risk_score: result.score, risk_factors: result.factors, scope3_emissions: result.scope3 }
      return { ...prev, suppliers }
    })
  }

  const removeSupplier = (idx: number) => {
    setInventory(prev => ({ ...prev, suppliers: prev.suppliers.filter((_, i) => i !== idx) }))
    setActiveSupplier(Math.max(0, idx - 1))
  }

  // CSV Import
  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[]
        const suppliers: Supplier[] = rows.map(row => {
          const base: Supplier = {
            id: Math.random().toString(36).slice(2),
            name: row['Supplier'] || row['supplier'] || row['Name'] || row['name'] || '',
            country: row['Country'] || row['country'] || 'Germany',
            sector: row['Sector'] || row['sector'] || row['Category'] || 'Professional Services',
            annual_spend: Number(row['Annual Spend'] || row['annual_spend'] || row['Spend'] || 0),
            currency: row['Currency'] || row['currency'] || 'USD',
            tier: (row['Tier'] || row['tier'] || '1') as '1' | '2' | '3',
            has_assessment: (row['Has Assessment'] || row['has_assessment'] || 'false').toLowerCase() === 'true',
            risk_level: 'low', risk_score: 0, risk_factors: [], scope3_emissions: 0,
          }
          const result = scoreSupplier(base)
          return { ...base, risk_level: result.risk, risk_score: result.score, risk_factors: result.factors, scope3_emissions: result.scope3 }
        })
        if (suppliers.length > 0) {
          setInventory(prev => ({ ...prev, suppliers }))
          setActiveSupplier(0)
        }
      },
    })
  }

  // Sorted suppliers
  const sortedSuppliers = [...inventory.suppliers].sort((a, b) => {
    if (sortBy === 'risk') return b.risk_score - a.risk_score
    if (sortBy === 'spend') return b.annual_spend - a.annual_spend
    return a.name.localeCompare(b.name)
  })

  // Summary stats
  const critical = inventory.suppliers.filter(s => s.risk_level === 'critical').length
  const high = inventory.suppliers.filter(s => s.risk_level === 'high').length
  const totalScope3 = inventory.suppliers.reduce((sum, s) => sum + s.scope3_emissions, 0)
  const totalSpend = inventory.suppliers.reduce((sum, s) => sum + s.annual_spend, 0)
  const needsAssessment = inventory.suppliers.filter(s => !s.has_assessment && (s.risk_level === 'critical' || s.risk_level === 'high')).length

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — Supply Chain Risk & Scope 3 Assessment'],
      ['Company', inventory.company],
      ['Reporting Year', inventory.reporting_year],
      ['Total Suppliers', inventory.suppliers.length],
      ['Total Annual Spend', `${inventory.currency} ${totalSpend.toLocaleString()}`],
      ['Total Scope 3 Cat.1 (estimated)', `${totalScope3.toFixed(2)} mt CO2e`],
      [''],
      ['SUPPLIER RISK REGISTER'],
      ['Supplier', 'Country', 'Sector', 'Tier', 'Annual Spend', 'Risk Level', 'Risk Score', 'Scope 3 (mt CO2e)', 'Risk Factors', 'Assessment Required'],
      ...inventory.suppliers.map(s => [
        s.name, s.country, s.sector, s.tier,
        `${s.currency} ${s.annual_spend.toLocaleString()}`,
        RISK_CONFIG[s.risk_level].label, s.risk_score,
        s.scope3_emissions.toFixed(2),
        s.risk_factors.join(' | '),
        !s.has_assessment && (s.risk_level === 'critical' || s.risk_level === 'high') ? 'YES' : 'No',
      ]),
      [''],
      ['Generated by ThemisIQ · www.themisiq.co · EU CS3D · ESRS S2 · Scope 3 Cat.1 · EcoVadis · Modern Slavery Act'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inventory.company}_SupplyChainRisk_${inventory.reporting_year}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Tell us about your organisation and which supply chain frameworks you need to comply with.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={inputStyle} value={inventory.company} onChange={e => update('company', e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={inputStyle} value={inventory.reporting_year} onChange={e => update('reporting_year', Number(e.target.value))}>
            {[2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={inventory.currency} onChange={e => update('currency', e.target.value)}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <label style={labelStyle}>Frameworks to assess against</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(Object.entries(FRAMEWORK_CONFIG) as [Framework, typeof FRAMEWORK_CONFIG[Framework]][]).map(([fw, cfg]) => {
          const selected = inventory.frameworks.includes(fw)
          return (
            <div key={fw} onClick={() => toggleFramework(fw)} style={{ border: `1.5px solid ${selected ? 'var(--color-brand)' : '#e8e7e4'}`, borderRadius: 10, padding: '0.75rem', cursor: 'pointer', background: selected ? '#fff' : '#f8f7f5', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${selected ? 'var(--color-brand)' : '#e8e7e4'}`, background: selected ? 'var(--color-brand)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: selected ? 'var(--color-brand)' : 'var(--color-ink-muted)' }}>{cfg.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.4 }}>{cfg.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Supplier list</h2>
      <p style={sectionSub}>Add your suppliers. Upload a CSV from your procurement system or add them manually.</p>

      {/* CSV Import */}
      <div style={{ background: '#f8f7f5', border: '1px dashed #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>Import from procurement system</div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>CSV columns: Supplier, Country, Sector, Annual Spend, Currency, Tier (1/2/3), Has Assessment (true/false)</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Upload CSV →</button>
        </div>
      </div>

      {/* Supplier tabs */}
      {inventory.suppliers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
          {inventory.suppliers.map((s, i) => {
            const cfg = RISK_CONFIG[s.risk_level]
            return (
              <button key={s.id} onClick={() => setActiveSupplier(i)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: activeSupplier === i ? '#0d0d0d' : '#f8f7f5', color: activeSupplier === i ? '#fff' : '#555553', border: `0.5px solid ${activeSupplier === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.name || `Supplier ${i + 1}`}
                {s.risk_level && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>}
              </button>
            )
          })}
          <button onClick={addSupplier} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer' }}>+ Add supplier</button>
        </div>
      )}

      {/* Supplier form */}
      {inventory.suppliers.length === 0 ? (
        <div style={{ background: '#f8f7f5', border: '1px dashed #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--color-ink-muted)', marginBottom: 12 }}>No suppliers added yet</div>
          <button onClick={addSupplier} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>+ Add your first supplier</button>
        </div>
      ) : inventory.suppliers[activeSupplier] && (
        <div style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{inventory.suppliers[activeSupplier].name || `Supplier ${activeSupplier + 1}`}</div>
            {inventory.suppliers[activeSupplier].risk_level && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].bg, color: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].color }}>
                {RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].label} RISK
              </span>
            )}
          </div>
          <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Supplier name</label>
              <input style={inputStyle} value={inventory.suppliers[activeSupplier].name} onChange={e => updateSupplier(activeSupplier, 'name', e.target.value)} placeholder="Supplier name" />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <select style={inputStyle} value={inventory.suppliers[activeSupplier].country} onChange={e => updateSupplier(activeSupplier, 'country', e.target.value)}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sector</label>
              <select style={inputStyle} value={inventory.suppliers[activeSupplier].sector} onChange={e => updateSupplier(activeSupplier, 'sector', e.target.value)}>
                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Annual spend ({inventory.currency})</label>
              <input style={inputStyle} type="number" value={inventory.suppliers[activeSupplier].annual_spend || ''} onChange={e => updateSupplier(activeSupplier, 'annual_spend', Number(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Supplier tier</label>
              <select style={inputStyle} value={inventory.suppliers[activeSupplier].tier} onChange={e => updateSupplier(activeSupplier, 'tier', e.target.value as '1' | '2' | '3')}>
                <option value="1">Tier 1 — direct supplier</option>
                <option value="2">Tier 2 — supplier's supplier</option>
                <option value="3">Tier 3+ — deeper supply chain</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Sustainability assessment on file?</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ label: 'Yes — EcoVadis, audit, or questionnaire', val: true }, { label: 'No assessment', val: false }].map(opt => (
                  <button key={String(opt.val)} onClick={() => updateSupplier(activeSupplier, 'has_assessment', opt.val)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: inventory.suppliers[activeSupplier].has_assessment === opt.val ? '#0d0d0d' : '#f8f7f5', color: inventory.suppliers[activeSupplier].has_assessment === opt.val ? '#fff' : '#555553', border: `0.5px solid ${inventory.suppliers[activeSupplier].has_assessment === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live risk preview */}
            {inventory.suppliers[activeSupplier].risk_factors.length > 0 && (
              <div style={{ gridColumn: '1 / -1', background: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].bg, border: `1px solid ${RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].border}`, borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].color, marginBottom: 6 }}>
                  ⚡ Risk score: {inventory.suppliers[activeSupplier].risk_score}/10 — {RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].label}
                </div>
                {inventory.suppliers[activeSupplier].risk_factors.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#555553', marginBottom: 3 }}>• {f}</div>
                ))}
                {inventory.suppliers[activeSupplier].scope3_emissions > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--color-brand)', marginTop: 6, fontWeight: 500 }}>Estimated Scope 3 Cat.1: {inventory.suppliers[activeSupplier].scope3_emissions.toFixed(2)} mt CO₂e</div>
                )}
              </div>
            )}
          </div>
          {inventory.suppliers.length > 1 && (
            <div style={{ padding: '0 1.5rem 1rem' }}>
              <button onClick={() => removeSupplier(activeSupplier)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove this supplier</button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Risk heat map</h2>
      <p style={sectionSub}>Every supplier risk-scored by country, sector, spend concentration and tier. Sorted by priority.</p>

      {inventory.suppliers.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>No suppliers added — go back to Step 2 to add your suppliers.</div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Critical risk', count: critical, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risk', count: high, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'Need assessment', count: needsAssessment, color: 'var(--color-module-climate)', bg: '#FEF3E2' },
              { label: 'Total suppliers', count: inventory.suppliers.length, color: '#0d0d0d', bg: '#f8f7f5' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Sort by:</span>
            {[{ val: 'risk', label: 'Risk level' }, { val: 'spend', label: 'Spend' }, { val: 'name', label: 'Name' }].map(s => (
              <button key={s.val} onClick={() => setSortBy(s.val as any)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, background: sortBy === s.val ? '#0d0d0d' : '#f8f7f5', color: sortBy === s.val ? '#fff' : '#555553', border: `0.5px solid ${sortBy === s.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>{s.label}</button>
            ))}
          </div>

          {/* Supplier risk table */}
          <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
              {['Supplier', 'Country', 'Sector', 'Risk', 'Spend'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {sortedSuppliers.map((s, i) => {
              const cfg = RISK_CONFIG[s.risk_level]
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: i < sortedSuppliers.length - 1 ? '0.5px solid #e8e7e4' : 'none', alignItems: 'center', background: s.risk_level === 'critical' ? '#fff5f5' : '#fff' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{s.name || `Supplier ${i + 1}`}</div>
                    {s.risk_factors.length > 0 && <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 2 }}>Tier {s.tier} · {s.risk_factors.length} risk factor{s.risk_factors.length > 1 ? 's' : ''}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: '#555553' }}>{s.country}</div>
                  <div style={{ fontSize: 11, color: '#555553' }}>{s.sector}</div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>
                    {!s.has_assessment && (s.risk_level === 'critical' || s.risk_level === 'high') && (
                      <div style={{ fontSize: 9, color: '#B91C1C', marginTop: 3, fontWeight: 600 }}>Assessment needed</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#0d0d0d', fontWeight: 500 }}>{s.annual_spend > 0 ? `${s.currency} ${(s.annual_spend / 1000).toFixed(0)}k` : '—'}</div>
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
      <h2 style={sectionHead}>Scope 3 Cat.1 estimate</h2>
      <p style={sectionSub}>Spend-based Scope 3 Category 1 emissions estimate per supplier using GHG Protocol emission factors by sector.</p>

      {inventory.suppliers.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>No suppliers added yet.</div>
      ) : (
        <>
          {/* Total */}
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Total Scope 3 Category 1 (spend-based estimate)</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                GHG Protocol spend-based method · DEFRA/Exiobase sector emission factors<br />
                This is an estimate only — primary data collection from suppliers is the gold standard
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 400, color: '#64fe3e', lineHeight: 1 }}>{totalScope3.toFixed(1)}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>mt CO₂e</div>
            </div>
          </div>

          {/* Per supplier */}
          <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
              {['Supplier', 'Sector', 'Annual Spend', 'Scope 3 Est.'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {[...inventory.suppliers].sort((a, b) => b.scope3_emissions - a.scope3_emissions).map((s, i) => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: i < inventory.suppliers.length - 1 ? '0.5px solid #e8e7e4' : 'none', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{s.name || `Supplier ${i + 1}`}</div>
                <div style={{ fontSize: 12, color: '#555553' }}>{s.sector}</div>
                <div style={{ fontSize: 12, color: '#555553' }}>{s.annual_spend > 0 ? `${s.currency} ${s.annual_spend.toLocaleString()}` : '—'}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.scope3_emissions > 100 ? '#B91C1C' : s.scope3_emissions > 10 ? 'var(--color-module-climate)' : '#0F6E56' }}>
                  {s.scope3_emissions > 0 ? `${s.scope3_emissions.toFixed(2)} mt` : '—'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 4 }}>Next step: primary data collection</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>For high-emission suppliers, switch from spend-based to primary data — request actual activity data via the ThemisIQ supplier portal. This improves accuracy and satisfies SB 253, CDP supplier engagement and ESRS E1-6 requirements.</div>
          </div>
        </>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export your assessment</h2>
      <p style={sectionSub}>Download your supplier risk register and spend-based Scope 3 Category 1 estimate.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Programme summary — {inventory.company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Suppliers', val: inventory.suppliers.length },
            { label: 'Critical/High', val: critical + high, urgent: (critical + high) > 0 },
            { label: 'Scope 3 Cat.1', val: `${totalScope3.toFixed(1)} mt` },
            { label: 'Need assessment', val: needsAssessment, urgent: needsAssessment > 0 },
          ].map(({ label, val, urgent }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.6rem' : '1rem', fontFamily: typeof val === 'number' ? 'var(--font-display)' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: urgent ? '#64fe3e' : '#fff', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm that the supplier data entered is accurate to the best of my knowledge. I understand that ThemisIQ's Scope 3 estimates are spend-based and should be verified with primary data from suppliers.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ ...(dataConfirmed ? btnStepPrimary : btnStepPrimaryDisabled) }}>
            ⬇ Download Supplier Risk Register (CSV)
          </button>
        </div>
      ) : (
        <div className="tq-band" style={{ borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Unlock your full supply chain programme</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: 20, lineHeight: 1.6 }}>Download your full supplier risk register — every supplier scored by country, sector and spend — and pull supplier-reported data into your Scope 3 Category 1 calculation.</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: 'var(--color-module-supply)', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>EU CS3D applies from {CS3D_APPLIES_FROM} · ESRS S2 active now · SB 253 Scope 3 deadline 2027. Map your supply chain today.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 4 }}>Supply Chain & Scope 3</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Supplier Risk Register & Scope 3 Assessment</div>
          </div>
          {inventory.suppliers.length > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 2 }}>Suppliers assessed</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0d0d0d' }}>{inventory.suppliers.length}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : 'var(--color-ink-muted)', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#0F6E56' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
              <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ ...(step === 0 ? btnStepDisabled : btnStep) }}>← Back</button>
              {step < STEP_NAMES.length - 1 && <button onClick={() => setStep(s => Math.min(STEP_NAMES.length - 1, s + 1))} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>Next →</button>}
            </div>
          </div>
          {step < 4 && (
            <div style={{ position: 'sticky', top: 80 }}>
              <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Live summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Suppliers', val: inventory.suppliers.length },
                    { label: 'Critical/High risk', val: critical + high, urgent: (critical + high) > 0 },
                    { label: 'Need assessment', val: needsAssessment, urgent: needsAssessment > 0 },
                    { label: 'Scope 3 Cat.1', val: `${totalScope3.toFixed(1)} mt` },
                    { label: 'Total spend', val: totalSpend > 0 ? `${inventory.currency} ${(totalSpend / 1000000).toFixed(1)}M` : '—' },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? '#64fe3e' : '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {(critical + high) > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ Priority suppliers</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>{critical + high} supplier{critical + high > 1 ? 's' : ''} require enhanced due diligence under CS3D</div>
                </div>
              )}
              <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6 }}>
                  <strong>EU CS3D · {CS3D_APPLIES_FROM}</strong><br />
                  Risk-based HRDD across your full value chain
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
