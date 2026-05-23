'use client'

import { useState, useRef } from 'react'
import Nav from '../../components/Nav'
import Papa from 'papaparse'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobBand {
  id: string
  name: string
  male_count: number
  female_count: number
  other_count: number
  male_avg_salary: number
  female_avg_salary: number
  other_avg_salary: number
}

interface WorkforceMetrics {
  ltifr: number
  trir: number
  training_hours_male: number
  training_hours_female: number
  collective_bargaining_pct: number
  parental_leave_male: number
  parental_leave_female: number
}

interface PeopleInventory {
  company: string
  reporting_year: number
  jurisdictions: string[]
  total_employees: number
  currency: string
  bands: JobBand[]
  metrics: WorkforceMetrics
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const newBand = (): JobBand => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  male_count: 0, female_count: 0, other_count: 0,
  male_avg_salary: 0, female_avg_salary: 0, other_avg_salary: 0,
})

const calcGap = (maleSalary: number, femaleSalary: number): number => {
  if (maleSalary === 0) return 0
  return ((maleSalary - femaleSalary) / maleSalary) * 100
}

const calcMedianGap = (bands: JobBand[]): number => {
  const gaps = bands.filter(b => b.male_avg_salary > 0 && b.female_avg_salary > 0)
    .map(b => calcGap(b.male_avg_salary, b.female_avg_salary))
  if (gaps.length === 0) return 0
  const sorted = [...gaps].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const calcMeanGap = (bands: JobBand[]): number => {
  const totalMalePay = bands.reduce((s, b) => s + b.male_count * b.male_avg_salary, 0)
  const totalFemalePay = bands.reduce((s, b) => s + b.female_count * b.female_avg_salary, 0)
  const totalMale = bands.reduce((s, b) => s + b.male_count, 0)
  const totalFemale = bands.reduce((s, b) => s + b.female_count, 0)
  const maleMean = totalMale > 0 ? totalMalePay / totalMale : 0
  const femaleMean = totalFemale > 0 ? totalFemalePay / totalFemale : 0
  return calcGap(maleMean, femaleMean)
}

const STEP_NAMES = ['Frameworks', 'Company setup', 'Job bands', 'Pay data', 'Workforce metrics', 'Results & export']
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD']

const DEFAULT_INVENTORY: PeopleInventory = {
  company: '', reporting_year: 2024,
  jurisdictions: [], total_employees: 0, currency: 'USD',
  bands: [newBand()],
  metrics: { ltifr: 0, trir: 0, training_hours_male: 0, training_hours_female: 0, collective_bargaining_pct: 0, parental_leave_male: 0, parental_leave_female: 0 },
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4',
  fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em',
  textTransform: 'uppercase', marginBottom: 6, display: 'block',
}

const sectionHead: React.CSSProperties = {
  fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)',
  fontWeight: 400, color: '#0d0d0d', marginBottom: 8,
}

const sectionSub: React.CSSProperties = {
  fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '2rem',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PeopleDashboard() {
  const [step, setStep] = useState(0)
  const [inventory, setInventory] = useState<PeopleInventory>(DEFAULT_INVENTORY)
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [activeBand, setActiveBand] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const isPaid = false // TODO: wire to Stripe

  const update = (field: keyof PeopleInventory, value: any) =>
    setInventory(prev => ({ ...prev, [field]: value }))

  const updateBand = (idx: number, field: keyof JobBand, value: any) =>
    setInventory(prev => {
      const bands = [...prev.bands]
      bands[idx] = { ...bands[idx], [field]: value }
      return { ...prev, bands }
    })

  const updateMetric = (field: keyof WorkforceMetrics, value: number) =>
    setInventory(prev => ({ ...prev, metrics: { ...prev.metrics, [field]: value } }))

  const addBand = () => {
    setInventory(prev => ({ ...prev, bands: [...prev.bands, newBand()] }))
    setActiveBand(inventory.bands.length)
  }

  const removeBand = (idx: number) => {
    if (inventory.bands.length === 1) return
    setInventory(prev => ({ ...prev, bands: prev.bands.filter((_, i) => i !== idx) }))
    setActiveBand(Math.max(0, idx - 1))
  }

  const toggleJurisdiction = (j: string) => {
    setInventory(prev => ({
      ...prev,
      jurisdictions: prev.jurisdictions.includes(j)
        ? prev.jurisdictions.filter(x => x !== j)
        : [...prev.jurisdictions, j],
    }))
  }

  // CSV Import
  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[]
        const bands: JobBand[] = rows.map(row => ({
          id: Math.random().toString(36).slice(2),
          name: row['Job Band'] || row['job_band'] || row['Band'] || '',
          male_count: Number(row['Male Count'] || row['male_count'] || 0),
          female_count: Number(row['Female Count'] || row['female_count'] || 0),
          other_count: Number(row['Other Count'] || row['other_count'] || 0),
          male_avg_salary: Number(row['Male Avg Salary'] || row['male_avg_salary'] || 0),
          female_avg_salary: Number(row['Female Avg Salary'] || row['female_avg_salary'] || 0),
          other_avg_salary: Number(row['Other Avg Salary'] || row['other_avg_salary'] || 0),
        }))
        if (bands.length > 0) {
          setInventory(prev => ({ ...prev, bands }))
          setActiveBand(0)
        }
      },
    })
  }

  // Export
  const generateExport = () => {
    const meanGap = calcMeanGap(inventory.bands)
    const medianGap = calcMedianGap(inventory.bands)
    const rows = [
      ['ThemisIQ — Gender Pay Gap Report'],
      ['Company', inventory.company],
      ['Reporting Year', inventory.reporting_year],
      ['Currency', inventory.currency],
      [''],
      ['SUMMARY'],
      ['Mean Gender Pay Gap', `${meanGap.toFixed(2)}%`],
      ['Median Gender Pay Gap', `${medianGap.toFixed(2)}%`],
      ['Total Employees', inventory.bands.reduce((s, b) => s + b.male_count + b.female_count + b.other_count, 0)],
      [''],
      ['BY JOB BAND'],
      ['Job Band', 'Male Count', 'Female Count', 'Other Count', 'Male Avg Salary', 'Female Avg Salary', 'Pay Gap %', 'Above 5% Threshold'],
      ...inventory.bands.map(b => {
        const gap = calcGap(b.male_avg_salary, b.female_avg_salary)
        return [b.name, b.male_count, b.female_count, b.other_count, b.male_avg_salary, b.female_avg_salary, `${gap.toFixed(2)}%`, Math.abs(gap) >= 5 ? 'YES — Joint Assessment Required' : 'No']
      }),
      [''],
      ['WORKFORCE METRICS'],
      ['LTIFR', inventory.metrics.ltifr],
      ['TRIR', inventory.metrics.trir],
      ['Training Hours (Male avg)', inventory.metrics.training_hours_male],
      ['Training Hours (Female avg)', inventory.metrics.training_hours_female],
      ['Collective Bargaining Coverage %', inventory.metrics.collective_bargaining_pct],
      [''],
      ['Generated by ThemisIQ · www.themisiq.co · EU Pay Transparency Dir. 2023/970 · ESRS S1 · CA Pay Data'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inventory.company}_GenderPayGap_${inventory.reporting_year}.csv`
    a.click()
  }

  // ─── Steps ────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Select your reporting frameworks</h2>
      <p style={sectionSub}>Select all that apply. ThemisIQ will tailor your data collection and outputs to cover every requirement.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {[
          { id: 'eu_pay', name: 'EU Pay Transparency Directive', desc: 'Gender pay gap reporting by job band · 100+ EU employees · Jun 2026', urgency: 'critical' },
          { id: 'esrs_s1', name: 'ESRS S1 — Own Workforce', desc: 'Full workforce disclosure · large EU companies · FY2024 active', urgency: 'critical' },
          { id: 'ca_pay', name: 'California Pay Data Reporting', desc: 'Annual DFEH submission · 100+ CA employees · May deadline', urgency: 'high' },
          { id: 'gri', name: 'GRI 401–410', desc: 'Employment, H&S, training, diversity · voluntary · annual', urgency: 'medium' },
          { id: 'sec', name: 'SEC Item 101', desc: 'Human capital disclosure · US public companies · annual 10-K', urgency: 'medium' },
          { id: 'sasb', name: 'SASB Human Capital', desc: 'Sector-specific workforce metrics · investor-grade', urgency: 'medium' },
        ].map(fw => {
          const selected = inventory.jurisdictions.includes(fw.id)
          const urgencyColor = fw.urgency === 'critical' ? '#B91C1C' : fw.urgency === 'high' ? '#ba7517' : '#888784'
          const urgencyBg = fw.urgency === 'critical' ? '#FCEBEB' : fw.urgency === 'high' ? '#FEF3E2' : '#f8f7f5'
          return (
            <div key={fw.id} onClick={() => toggleJurisdiction(fw.id)} style={{ border: `2px solid ${selected ? '#7425e3' : '#e8e7e4'}`, borderRadius: 12, padding: '1.25rem', cursor: 'pointer', background: selected ? '#fff' : '#f8f7f5', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${selected ? '#7425e3' : '#e8e7e4'}`, background: selected ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  {selected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>{fw.name}</div>
                  <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.5, marginBottom: 8 }}>{fw.desc}</div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: urgencyBg, color: urgencyColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{fw.urgency}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Basic information about your organisation and reporting scope.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={inputStyle} value={inventory.company} onChange={e => update('company', e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={inputStyle} value={inventory.reporting_year} onChange={e => update('reporting_year', Number(e.target.value))}>
            {[2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={inventory.currency} onChange={e => update('currency', e.target.value)}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Total employees (global headcount)</label>
          <input style={inputStyle} type="number" value={inventory.total_employees || ''} onChange={e => update('total_employees', Number(e.target.value))} placeholder="0" />
          {inventory.total_employees >= 100 && (
            <div style={{ marginTop: 8, background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#0C447C' }}>
              ✓ 100+ employees — EU Pay Transparency and CA Pay Data thresholds triggered
            </div>
          )}
          {inventory.total_employees >= 250 && (
            <div style={{ marginTop: 6, background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#B91C1C' }}>
              ⚠ 250+ employees — annual gender pay gap reporting required under EU Pay Transparency (not every 3 years)
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Define your job bands</h2>
      <p style={sectionSub}>Add each job level or pay band in your organisation. You'll enter headcount and salary data for each in the next step.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {inventory.bands.map((b, i) => (
          <button key={b.id} onClick={() => setActiveBand(i)} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: activeBand === i ? '#0d0d0d' : '#f8f7f5', color: activeBand === i ? '#fff' : '#555553', border: `0.5px solid ${activeBand === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
            {b.name || `Band ${i + 1}`}
          </button>
        ))}
        <button onClick={addBand} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer' }}>+ Add band</button>
      </div>
      <div style={{ border: '1px solid #e8e7e4', borderRadius: 12, padding: '1.5rem' }}>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Band name</label>
          <input style={inputStyle} value={inventory.bands[activeBand]?.name || ''} onChange={e => updateBand(activeBand, 'name', e.target.value)} placeholder="e.g. Junior, Mid-level, Senior, Manager, Director, Executive" />
        </div>
        <div style={{ fontSize: 12, color: '#888784', lineHeight: 1.6 }}>
          Typical job bands: Junior · Associate · Mid-level · Senior · Lead · Manager · Director · VP · C-Suite
        </div>
        {inventory.bands.length > 1 && (
          <button onClick={() => removeBand(activeBand)} style={{ marginTop: 12, fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Remove this band
          </button>
        )}
      </div>
      <div style={{ marginTop: 16, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>💡 Tip</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>The EU Pay Transparency Directive requires pay gap analysis by "job band" — groups of workers doing the same work or work of equal value. Use your existing job levels or pay grades.</div>
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>Pay data</h2>
      <p style={sectionSub}>Enter headcount and average salary by gender for each job band. Or import directly from your HR system.</p>

      {/* CSV Import */}
      <div style={{ background: '#f8f7f5', border: '1px dashed #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>Import from HR system</div>
          <div style={{ fontSize: 12, color: '#888784', lineHeight: 1.5 }}>CSV with columns: Job Band, Male Count, Female Count, Other Count, Male Avg Salary, Female Avg Salary, Other Avg Salary</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Upload CSV →
          </button>
        </div>
      </div>

      {/* Band selector */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
        {inventory.bands.map((b, i) => (
          <button key={b.id} onClick={() => setActiveBand(i)} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: activeBand === i ? '#0d0d0d' : '#f8f7f5', color: activeBand === i ? '#fff' : '#555553', border: `0.5px solid ${activeBand === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
            {b.name || `Band ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Pay data entry */}
      {inventory.bands[activeBand] && (
        <div style={{ border: '1px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: '#0d0d0d', padding: '12px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{inventory.bands[activeBand].name || `Band ${activeBand + 1}`}</div>
          </div>
          <div style={{ padding: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Male employees', countField: 'male_count' as keyof JobBand, salaryField: 'male_avg_salary' as keyof JobBand },
                { label: 'Female employees', countField: 'female_count' as keyof JobBand, salaryField: 'female_avg_salary' as keyof JobBand },
                { label: 'Other / prefer not to say', countField: 'other_count' as keyof JobBand, salaryField: 'other_avg_salary' as keyof JobBand },
              ].map(({ label, countField, salaryField }) => (
                <div key={label} style={{ background: '#f8f7f5', borderRadius: 10, padding: '1rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Headcount</label>
                    <input style={inputStyle} type="number" value={(inventory.bands[activeBand][countField] as number) || ''} onChange={e => updateBand(activeBand, countField, Number(e.target.value))} placeholder="0" />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, fontSize: 10 }}>Avg salary ({inventory.currency})</label>
                    <input style={inputStyle} type="number" value={(inventory.bands[activeBand][salaryField] as number) || ''} onChange={e => updateBand(activeBand, salaryField, Number(e.target.value))} placeholder="0" />
                  </div>
                </div>
              ))}
            </div>

            {/* Live gap preview */}
            {inventory.bands[activeBand].male_avg_salary > 0 && inventory.bands[activeBand].female_avg_salary > 0 && (() => {
              const gap = calcGap(inventory.bands[activeBand].male_avg_salary, inventory.bands[activeBand].female_avg_salary)
              const isAboveThreshold = Math.abs(gap) >= 5
              return (
                <div style={{ background: isAboveThreshold ? '#FCEBEB' : '#E1F5EE', border: `0.5px solid ${isAboveThreshold ? 'rgba(185,28,24,0.2)' : 'rgba(15,110,86,0.2)'}`, borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  <span style={{ fontWeight: 600, color: isAboveThreshold ? '#B91C1C' : '#0F6E56' }}>
                    {isAboveThreshold ? '⚠ ' : '✓ '}
                    Gender pay gap: {gap.toFixed(1)}%
                  </span>
                  {isAboveThreshold && <span style={{ color: '#B91C1C', marginLeft: 8 }}>— above 5% threshold · joint pay assessment required</span>}
                  {!isAboveThreshold && <span style={{ color: '#0F6E56', marginLeft: 8 }}>— below 5% threshold</span>}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Workforce metrics</h2>
      <p style={sectionSub}>Additional data for ESRS S1 and GRI 401–410 disclosure. Leave 0 if not applicable.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>LTIFR (Lost Time Injury Frequency Rate)</label>
          <input style={inputStyle} type="number" step="0.01" value={inventory.metrics.ltifr || ''} onChange={e => updateMetric('ltifr', Number(e.target.value))} placeholder="0.00" />
          <div style={{ fontSize: 11, color: '#888784', marginTop: 4 }}>Injuries per million hours worked</div>
        </div>
        <div>
          <label style={labelStyle}>TRIR (Total Recordable Incident Rate)</label>
          <input style={inputStyle} type="number" step="0.01" value={inventory.metrics.trir || ''} onChange={e => updateMetric('trir', Number(e.target.value))} placeholder="0.00" />
          <div style={{ fontSize: 11, color: '#888784', marginTop: 4 }}>Recordable incidents per 200,000 hours</div>
        </div>
        <div>
          <label style={labelStyle}>Avg training hours — male employees</label>
          <input style={inputStyle} type="number" step="0.1" value={inventory.metrics.training_hours_male || ''} onChange={e => updateMetric('training_hours_male', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Avg training hours — female employees</label>
          <input style={inputStyle} type="number" step="0.1" value={inventory.metrics.training_hours_female || ''} onChange={e => updateMetric('training_hours_female', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Collective bargaining coverage (%)</label>
          <input style={inputStyle} type="number" min="0" max="100" value={inventory.metrics.collective_bargaining_pct || ''} onChange={e => updateMetric('collective_bargaining_pct', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Parental leave return rate — male (%)</label>
          <input style={inputStyle} type="number" min="0" max="100" value={inventory.metrics.parental_leave_male || ''} onChange={e => updateMetric('parental_leave_male', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Parental leave return rate — female (%)</label>
          <input style={inputStyle} type="number" min="0" max="100" value={inventory.metrics.parental_leave_female || ''} onChange={e => updateMetric('parental_leave_female', Number(e.target.value))} placeholder="0" />
        </div>
      </div>
    </div>
  )

  const renderStep5 = () => {
    const meanGap = calcMeanGap(inventory.bands)
    const medianGap = calcMedianGap(inventory.bands)
    const bandsAboveThreshold = inventory.bands.filter(b => Math.abs(calcGap(b.male_avg_salary, b.female_avg_salary)) >= 5)
    const totalEmployees = inventory.bands.reduce((s, b) => s + b.male_count + b.female_count + b.other_count, 0)

    return (
      <div>
        <h2 style={sectionHead}>Results & export</h2>
        <p style={sectionSub}>Your gender pay gap analysis for {inventory.reporting_year}. Review your results and download your report.</p>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Mean pay gap', val: `${meanGap.toFixed(1)}%`, color: Math.abs(meanGap) >= 5 ? '#B91C1C' : '#0F6E56', bg: Math.abs(meanGap) >= 5 ? '#FCEBEB' : '#E1F5EE' },
            { label: 'Median pay gap', val: `${medianGap.toFixed(1)}%`, color: Math.abs(medianGap) >= 5 ? '#B91C1C' : '#0F6E56', bg: Math.abs(medianGap) >= 5 ? '#FCEBEB' : '#E1F5EE' },
            { label: 'Bands above 5%', val: `${bandsAboveThreshold.length}`, color: bandsAboveThreshold.length > 0 ? '#B91C1C' : '#0F6E56', bg: bandsAboveThreshold.length > 0 ? '#FCEBEB' : '#E1F5EE' },
            { label: 'Total employees', val: totalEmployees.toLocaleString(), color: '#0d0d0d', bg: '#f8f7f5' },
          ].map(({ label, val, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.25rem', border: `0.5px solid ${color}22` }}>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Band breakdown */}
        <div style={{ border: '1px solid #e8e7e4', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ background: '#f8f7f5', padding: '10px 16px', borderBottom: '1px solid #e8e7e4', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8 }}>
            {['Job Band', 'Male', 'Female', 'Pay Gap', 'Status'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
            ))}
          </div>
          {inventory.bands.map((b, i) => {
            const gap = calcGap(b.male_avg_salary, b.female_avg_salary)
            const isAbove = Math.abs(gap) >= 5
            return (
              <div key={b.id} style={{ padding: '12px 16px', borderBottom: i < inventory.bands.length - 1 ? '1px solid #e8e7e4' : 'none', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{b.name || `Band ${i + 1}`}</div>
                <div style={{ fontSize: 12, color: '#555553' }}>{b.male_count} · {inventory.currency}{(b.male_avg_salary / 1000).toFixed(0)}k</div>
                <div style={{ fontSize: 12, color: '#555553' }}>{b.female_count} · {inventory.currency}{(b.female_avg_salary / 1000).toFixed(0)}k</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isAbove ? '#B91C1C' : '#0F6E56' }}>{gap.toFixed(1)}%</div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: isAbove ? '#FCEBEB' : '#E1F5EE', color: isAbove ? '#B91C1C' : '#0F6E56' }}>
                    {isAbove ? '⚠ Assessment req.' : '✓ Below threshold'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {bandsAboveThreshold.length > 0 && (
          <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ Joint pay assessment required</div>
            <div style={{ fontSize: 12, color: '#B91C1C', lineHeight: 1.6 }}>
              {bandsAboveThreshold.map(b => b.name).join(', ')} — gaps exceed the 5% EU Pay Transparency threshold. You are required to conduct a joint pay assessment with worker representatives and implement remediation measures within 6 months.
            </div>
          </div>
        )}

        {/* Confirmation + export */}
        {isPaid ? (
          <div>
            <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm that the data entered is accurate to the best of my knowledge and has been sourced from actual HR and payroll records. I understand that ThemisIQ applies the correct methodology to the data I provide, and that accuracy of the underlying data is my responsibility.</span>
              </label>
            </div>
            <button onClick={() => dataConfirmed && generateExport()} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: dataConfirmed ? 'pointer' : 'not-allowed', opacity: dataConfirmed ? 1 : 0.4 }}>
              ⬇ Download Gender Pay Gap Report (CSV)
            </button>
          </div>
        ) : (
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Unlock your report</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16, lineHeight: 1.6 }}>Your pay gap has been calculated. Upgrade to download your EU Pay Transparency report, ESRS S1 disclosure, and CA Pay Data submission.</div>
            <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              See pricing & unlock reports →
            </a>
          </div>
        )}
      </div>
    )
  }

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>People & Workforce</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Gender Pay Gap & Workforce Compliance</div>
          </div>
          <div style={{ fontSize: 12, color: '#888784' }}>
            {inventory.company && <span style={{ fontWeight: 500, color: '#0d0d0d' }}>{inventory.company} · </span>}
            {inventory.reporting_year}
          </div>
        </div>
      </div>

      {/* Step tabs */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
              {i + 1}. {name}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: step === 5 ? '1fr' : '1fr 280px', gap: '2rem', alignItems: 'start' }}>

          {/* Step content */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
            {steps[step]()}

            {/* Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.4 : 1 }}>
                ← Back
              </button>
              {step < STEP_NAMES.length - 1 && (
                <button onClick={() => setStep(s => Math.min(STEP_NAMES.length - 1, s + 1))} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
                  Next →
                </button>
              )}
            </div>
          </div>

          {/* Right panel — live summary */}
          {step < 5 && (
            <div style={{ position: 'sticky', top: 80 }}>
              <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Live summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Company', val: inventory.company || '—' },
                    { label: 'Year', val: inventory.reporting_year },
                    { label: 'Employees', val: inventory.total_employees > 0 ? inventory.total_employees.toLocaleString() : '—' },
                    { label: 'Job bands', val: inventory.bands.length },
                    { label: 'Frameworks', val: inventory.jurisdictions.length > 0 ? inventory.jurisdictions.length : '—' },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live gap preview if data entered */}
              {inventory.bands.some(b => b.male_avg_salary > 0 && b.female_avg_salary > 0) && (
                <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 10 }}>Pay gap preview</div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color: Math.abs(calcMeanGap(inventory.bands)) >= 5 ? '#B91C1C' : '#0F6E56', marginBottom: 4 }}>
                    {calcMeanGap(inventory.bands).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#888784' }}>mean gender pay gap</div>
                  {inventory.bands.filter(b => Math.abs(calcGap(b.male_avg_salary, b.female_avg_salary)) >= 5).length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#B91C1C', fontWeight: 500 }}>
                      ⚠ {inventory.bands.filter(b => Math.abs(calcGap(b.male_avg_salary, b.female_avg_salary)) >= 5).length} band(s) above 5% threshold
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 12, background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>
                  <strong>EU Pay Transparency · Jun 2026</strong><br />
                  Methodology: Directive 2023/970 · mean & median gap by job band
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
