'use client'

import { useState, useEffect } from 'react'
import Nav from '../../components/Nav'
import { useEntitlement } from '../../../lib/useEntitlement'

// ─── Types ────────────────────────────────────────────────────────────────────

type Framework = 'nis2' | 'dora' | 'sec' | 'iso27001' | 'nist'
type Maturity = 'none' | 'partial' | 'implemented' | 'optimised'

interface ControlResponse {
  id: string
  maturity: Maturity
}

interface CyberInventory {
  company: string
  reporting_year: number
  sector: string
  frameworks: Framework[]
  employee_count: string
  eu_operations: boolean
  us_listed: boolean
  financial_entity: boolean
  responses: Record<string, Maturity>
}

// ─── Control Library ──────────────────────────────────────────────────────────

const CONTROLS = [
  // Governance
  { id: 'gov1', domain: 'Governance', title: 'Board cyber oversight', desc: 'Board or senior management formally accountable for cyber risk management', nis2: true, dora: true, sec: true, iso: true, nist: true, weight: 3 },
  { id: 'gov2', domain: 'Governance', title: 'Cyber risk policy', desc: 'Documented information security policy approved by management, reviewed annually', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },
  { id: 'gov3', domain: 'Governance', title: 'Roles & responsibilities', desc: 'Defined cyber security roles including CISO or equivalent, with clear accountability', nis2: true, dora: true, sec: true, iso: true, nist: true, weight: 2 },

  // Risk Management
  { id: 'risk1', domain: 'Risk Management', title: 'Cyber risk register', desc: 'Documented cyber risk register with risk owners, likelihood, impact and treatment plans', nis2: true, dora: true, sec: true, iso: true, nist: true, weight: 3 },
  { id: 'risk2', domain: 'Risk Management', title: 'Risk assessment process', desc: 'Regular (at least annual) cyber risk assessment covering assets, threats and vulnerabilities', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },
  { id: 'risk3', domain: 'Risk Management', title: 'Asset inventory', desc: 'Up-to-date inventory of all IT/OT assets, systems and data classifications', nis2: true, dora: false, sec: false, iso: true, nist: true, weight: 2 },

  // Access Control
  { id: 'acc1', domain: 'Access Control', title: 'Multi-factor authentication', desc: 'MFA enforced for all privileged access and remote access to critical systems', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 3 },
  { id: 'acc2', domain: 'Access Control', title: 'Privileged access management', desc: 'Privileged accounts managed with least-privilege principle, reviewed quarterly', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 3 },
  { id: 'acc3', domain: 'Access Control', title: 'Access review process', desc: 'Periodic user access reviews (at least every 6 months) with documented outcomes', nis2: false, dora: true, sec: false, iso: true, nist: true, weight: 2 },

  // Incident Response
  { id: 'ir1', domain: 'Incident Response', title: 'Incident response plan', desc: 'Documented and tested incident response plan covering detection, containment, notification and recovery', nis2: true, dora: true, sec: true, iso: true, nist: true, weight: 3 },
  { id: 'ir2', domain: 'Incident Response', title: 'NIS2 notification procedure', desc: '24h early warning and 72h full report procedure to national authority documented and tested', nis2: true, dora: false, sec: false, iso: false, nist: false, weight: 3 },
  { id: 'ir3', domain: 'Incident Response', title: 'DORA incident classification', desc: 'ICT-related incident classification framework aligned to DORA criteria and reporting thresholds', nis2: false, dora: true, sec: false, iso: false, nist: false, weight: 3 },
  { id: 'ir4', domain: 'Incident Response', title: 'SEC 8-K materiality assessment', desc: 'Process to assess cyber incident materiality and file Form 8-K within 4 business days', nis2: false, dora: false, sec: true, iso: false, nist: false, weight: 3 },

  // Supply Chain
  { id: 'sc1', domain: 'Supply Chain Security', title: 'Vendor risk assessment', desc: 'Cyber security assessments of critical suppliers and third-party ICT providers', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 3 },
  { id: 'sc2', domain: 'Supply Chain Security', title: 'DORA CTPP register', desc: 'Register of Critical Third-Party ICT Providers with concentration risk assessment', nis2: false, dora: true, sec: false, iso: false, nist: false, weight: 3 },
  { id: 'sc3', domain: 'Supply Chain Security', title: 'Contractual cyber requirements', desc: 'Cyber security clauses in supplier contracts covering data protection, incident notification and audit rights', nis2: true, dora: true, sec: false, iso: true, nist: false, weight: 2 },

  // Technical Controls
  { id: 'tech1', domain: 'Technical Controls', title: 'Encryption at rest & in transit', desc: 'Sensitive data encrypted both at rest and in transit using current standards (AES-256, TLS 1.2+)', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },
  { id: 'tech2', domain: 'Technical Controls', title: 'Vulnerability management', desc: 'Regular vulnerability scanning with defined remediation timelines based on severity', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },
  { id: 'tech3', domain: 'Technical Controls', title: 'Security monitoring (SIEM)', desc: 'Continuous security monitoring with alerting for suspicious activity and anomalies', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },
  { id: 'tech4', domain: 'Technical Controls', title: 'Penetration testing', desc: 'Annual penetration testing by qualified third party with findings tracked to remediation', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },

  // Business Continuity
  { id: 'bc1', domain: 'Business Continuity', title: 'Business continuity plan', desc: 'Documented and tested BCP/DR plan covering critical systems with defined RTOs and RPOs', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 3 },
  { id: 'bc2', domain: 'Business Continuity', title: 'DORA resilience testing', desc: 'Digital operational resilience testing programme including TLPT for significant financial entities', nis2: false, dora: true, sec: false, iso: false, nist: false, weight: 3 },
  { id: 'bc3', domain: 'Business Continuity', title: 'Backup & recovery', desc: 'Regular backups of critical data with tested recovery procedures and offline copies', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },

  // Training & Awareness
  { id: 'train1', domain: 'Training & Awareness', title: 'Security awareness training', desc: 'Annual security awareness training for all staff with completion tracking', nis2: true, dora: true, sec: false, iso: true, nist: true, weight: 2 },
  { id: 'train2', domain: 'Training & Awareness', title: 'Phishing simulation', desc: 'Regular phishing simulation exercises with targeted follow-up training', nis2: false, dora: false, sec: false, iso: true, nist: true, weight: 1 },
]

const MATURITY_CONFIG: Record<Maturity, { label: string; score: number; color: string; bg: string }> = {
  none:        { label: 'Not implemented', score: 0, color: '#B91C1C', bg: '#FCEBEB' },
  partial:     { label: 'Partially implemented', score: 1, color: 'var(--color-module-climate)', bg: '#FEF3E2' },
  implemented: { label: 'Fully implemented', score: 2, color: '#0F6E56', bg: '#E1F5EE' },
  optimised:   { label: 'Optimised & tested', score: 3, color: '#0C447C', bg: '#E6F1FB' },
}

const FRAMEWORK_CONFIG: Record<Framework, { label: string; color: string; deadline: string }> = {
  nis2:    { label: 'EU NIS2', color: '#B91C1C', deadline: 'Active Oct 2024' },
  dora:    { label: 'EU DORA', color: '#7425e3', deadline: 'Active Jan 2025' },
  sec:     { label: 'SEC Cyber', color: '#0C447C', deadline: 'Active Dec 2023' },
  iso27001:{ label: 'ISO 27001', color: '#0F6E56', deadline: 'Ongoing' },
  nist:    { label: 'NIST CSF 2.0', color: 'var(--color-module-climate)', deadline: 'Ongoing' },
}

const DOMAINS = [...new Set(CONTROLS.map(c => c.domain))]
const GRAD = 'var(--color-brand)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }
const STEP_NAMES = ['Setup', 'Gap Assessment', 'Results', 'Remediation', 'Export']


// ─── Score Calculator ─────────────────────────────────────────────────────────

const calcScore = (responses: Record<string, Maturity>, frameworks: Framework[]) => {
  const relevantControls = CONTROLS.filter(c => frameworks.some(f => c[f as keyof typeof c]))
  if (relevantControls.length === 0) return { score: 0, maxScore: 0, pct: 0, gaps: [] as typeof CONTROLS }

  let totalScore = 0
  let maxScore = 0
  const gaps: typeof CONTROLS = []

  relevantControls.forEach(control => {
    const maturity = responses[control.id] || 'none'
    const maturityScore = MATURITY_CONFIG[maturity].score * control.weight
    const maxControlScore = 3 * control.weight
    totalScore += maturityScore
    maxScore += maxControlScore
    if (maturity === 'none' || maturity === 'partial') gaps.push(control)
  })

  return { score: totalScore, maxScore, pct: Math.round((totalScore / maxScore) * 100), gaps }
}

const getTop5 = (gaps: typeof CONTROLS, frameworks: Framework[]) => {
  return [...gaps]
    .filter(c => frameworks.some(f => c[f as keyof typeof c]))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5)
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CyberDashboard() {
  const isPaid = useEntitlement('cyber')
  const [step, setStep] = useState(0)
  const [inventory, setInventory] = useState<CyberInventory>({
    company: '', reporting_year: 2025, sector: '',
    frameworks: ['nis2', 'iso27001', 'nist'],
    employee_count: '', eu_operations: true, us_listed: false, financial_entity: false,
    responses: {},
  })
  const [activeDomain, setActiveDomain] = useState(DOMAINS[0])
  const [dataConfirmed, setDataConfirmed] = useState(false)

  const update = (field: keyof CyberInventory, value: any) =>
    setInventory(prev => ({ ...prev, [field]: value }))

  const toggleFramework = (fw: Framework) => {
    setInventory(prev => ({
      ...prev,
      frameworks: prev.frameworks.includes(fw)
        ? prev.frameworks.filter(f => f !== fw)
        : [...prev.frameworks, fw],
    }))
  }

  const setResponse = (id: string, maturity: Maturity) =>
    setInventory(prev => ({ ...prev, responses: { ...prev.responses, [id]: maturity } }))

  const { score, maxScore, pct, gaps } = calcScore(inventory.responses, inventory.frameworks)
  const top5 = getTop5(gaps, inventory.frameworks)

  const scoreColor = pct >= 75 ? '#0F6E56' : pct >= 50 ? 'var(--color-module-climate)' : '#B91C1C'
  const scoreLabel = pct >= 75 ? 'Good' : pct >= 50 ? 'Developing' : pct >= 25 ? 'At Risk' : 'Critical Gaps'

  const domainControls = CONTROLS.filter(c =>
    c.domain === activeDomain && inventory.frameworks.some(f => c[f as keyof typeof c])
  )

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — Cyber Governance Gap Assessment'],
      ['Company', inventory.company],
      ['Reporting Year', inventory.reporting_year],
      ['Frameworks', inventory.frameworks.map(f => FRAMEWORK_CONFIG[f].label).join(', ')],
      ['Overall Score', `${pct}% — ${scoreLabel}`],
      [''],
      ['GAP ASSESSMENT RESULTS'],
      ['Control', 'Domain', 'Maturity', 'Gap', 'Priority'],
      ...CONTROLS.filter(c => inventory.frameworks.some(f => c[f as keyof typeof c])).map(c => {
        const maturity = inventory.responses[c.id] || 'none'
        const isGap = maturity === 'none' || maturity === 'partial'
        return [c.title, c.domain, MATURITY_CONFIG[maturity].label, isGap ? 'YES' : 'No', c.weight === 3 ? 'High' : c.weight === 2 ? 'Medium' : 'Low']
      }),
      [''],
      ['TOP 5 REMEDIATION PRIORITIES'],
      ...top5.map((c, i) => [`${i + 1}. ${c.title}`, c.domain, c.desc]),
      [''],
      ['Generated by ThemisIQ · www.themisiq.co · NIS2 · DORA · SEC Cyber · ISO 27001 · NIST CSF'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inventory.company}_CyberGapAssessment_${inventory.reporting_year}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Tell us about your organisation so we can identify which cyber frameworks apply to you.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={inputStyle} value={inventory.company} onChange={e => update('company', e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={inputStyle} value={inventory.reporting_year} onChange={e => update('reporting_year', Number(e.target.value))}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Employee count</label>
          <select style={inputStyle} value={inventory.employee_count} onChange={e => update('employee_count', e.target.value)}>
            <option value="">Select</option>
            {['1–49', '50–249', '250–999', '1,000–4,999', '5,000+'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Scope questions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {[
          { field: 'eu_operations', label: 'Do you have operations or customers in the EU?', hint: 'Triggers NIS2 for essential/important entities' },
          { field: 'financial_entity', label: 'Are you a financial entity (bank, insurer, investment firm)?', hint: 'Triggers EU DORA obligations' },
          { field: 'us_listed', label: 'Are you listed on a US stock exchange (NYSE/Nasdaq)?', hint: 'Triggers SEC cyber disclosure rules' },
        ].map(({ field, label, hint }) => (
          <div key={field} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 11, color: '#888784' }}>{hint}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                <button key={String(opt.val)} onClick={() => update(field as keyof CyberInventory, opt.val)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: (inventory as any)[field] === opt.val ? 'var(--color-brand-wash)' : '#f8f7f5', color: (inventory as any)[field] === opt.val ? 'var(--color-ink)' : '#555553', border: `0.5px solid ${(inventory as any)[field] === opt.val ? 'var(--color-brand)' : '#e8e7e4'}`, cursor: 'pointer' }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Framework selector */}
      <label style={labelStyle}>Frameworks to assess against</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {(Object.entries(FRAMEWORK_CONFIG) as [Framework, typeof FRAMEWORK_CONFIG[Framework]][]).map(([fw, cfg]) => {
          const selected = inventory.frameworks.includes(fw)
          return (
            <div key={fw} onClick={() => toggleFramework(fw)} style={{ border: `1.5px solid ${selected ? cfg.color : '#e8e7e4'}`, borderRadius: 10, padding: '0.75rem', cursor: 'pointer', background: selected ? '#fff' : '#f8f7f5', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${selected ? cfg.color : '#e8e7e4'}`, background: selected ? cfg.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: selected ? cfg.color : '#888784' }}>{cfg.label}</span>
              </div>
              <div style={{ fontSize: 10, color: '#888784' }}>{cfg.deadline}</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Gap assessment</h2>
      <p style={sectionSub}>Rate your current maturity for each control. Be honest — this is your gap assessment, not an audit.</p>

      {/* Domain tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {DOMAINS.map(domain => {
          const domControls = CONTROLS.filter(c => c.domain === domain && inventory.frameworks.some(f => c[f as keyof typeof c]))
          const answered = domControls.filter(c => inventory.responses[c.id] && inventory.responses[c.id] !== 'none').length
          const isActive = activeDomain === domain
          return (
            <button key={domain} onClick={() => setActiveDomain(domain)} style={{ fontSize: 11, padding: '6px 12px', borderRadius: 8, background: isActive ? 'var(--color-brand-wash)' : '#f8f7f5', color: isActive ? 'var(--color-ink)' : '#555553', border: `0.5px solid ${isActive ? 'var(--color-brand)' : '#e8e7e4'}`, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              {domain}
              {answered > 0 && <span style={{ fontSize: 9, background: isActive ? 'var(--color-paper)' : '#e8e7e4', color: 'var(--color-ink-2)', padding: '1px 5px', borderRadius: 99 }}>{answered}/{domControls.length}</span>}
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {domainControls.length === 0 ? (
          <div style={{ padding: '1.5rem', background: '#f8f7f5', borderRadius: 10, textAlign: 'center', color: '#888784', fontSize: 13 }}>
            No controls in this domain for your selected frameworks.
          </div>
        ) : domainControls.map(control => {
          const current = inventory.responses[control.id] || 'none'
          const cfg = MATURITY_CONFIG[current]
          return (
            <div key={control.id} style={{ border: `1px solid ${current !== 'none' ? `color-mix(in srgb, ${cfg.color} 25%, transparent)` : '#e8e7e4'}`, borderRadius: 12, padding: '1rem', background: current !== 'none' ? `color-mix(in srgb, ${cfg.color} 25%, transparent)` : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{control.title}</span>
                    {control.weight === 3 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#FCEBEB', color: '#B91C1C' }}>HIGH PRIORITY</span>}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(Object.keys(FRAMEWORK_CONFIG) as Framework[]).filter(f => inventory.frameworks.includes(f) && control[f as keyof typeof control]).map(f => (
                        <span key={f} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#888784' }}>{FRAMEWORK_CONFIG[f].label}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>{control.desc}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {(Object.entries(MATURITY_CONFIG) as [Maturity, typeof MATURITY_CONFIG[Maturity]][]).map(([maturity, mcfg]) => (
                  <button key={maturity} onClick={() => setResponse(control.id, maturity)} style={{ padding: '6px 4px', borderRadius: 8, fontSize: 10, fontWeight: current === maturity ? 700 : 400, background: current === maturity ? mcfg.bg : '#f8f7f5', color: current === maturity ? mcfg.color : '#888784', border: `1px solid ${current === maturity ? mcfg.color : '#e8e7e4'}`, cursor: 'pointer', textAlign: 'center', lineHeight: 1.3, transition: 'all 0.1s' }}>
                    {mcfg.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Results</h2>
      <p style={sectionSub}>Your cyber governance gap assessment across {inventory.frameworks.map(f => FRAMEWORK_CONFIG[f].label).join(', ')}.</p>

      {/* Score */}
      <div className="tq-summary" style={{ marginBottom: 20 }}>
        <div className="tq-summary-body" style={{ gap: '2rem' }}>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '3.5rem', fontWeight: 400, color: scoreColor, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: scoreColor, marginTop: 4 }}>{scoreLabel}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ height: 8, background: 'var(--color-sunken)', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: scoreColor, borderRadius: 99, transition: 'width 0.5s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.6 }}>
            {gaps.length} control gap{gaps.length !== 1 ? 's' : ''} identified across {inventory.frameworks.length} framework{inventory.frameworks.length !== 1 ? 's' : ''}. Score: {score}/{maxScore} points.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {inventory.frameworks.map(f => (
              <span key={f} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: `color-mix(in srgb, ${FRAMEWORK_CONFIG[f].color} 13%, transparent)`, color: FRAMEWORK_CONFIG[f].color, border: `0.5px solid color-mix(in srgb, ${FRAMEWORK_CONFIG[f].color} 27%, transparent)` }}>{FRAMEWORK_CONFIG[f].label}</span>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* Domain breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
        {DOMAINS.map(domain => {
          const domControls = CONTROLS.filter(c => c.domain === domain && inventory.frameworks.some(f => c[f as keyof typeof c]))
          const domGaps = domControls.filter(c => !inventory.responses[c.id] || inventory.responses[c.id] === 'none' || inventory.responses[c.id] === 'partial').length
          const domPct = domControls.length > 0 ? Math.round(((domControls.length - domGaps) / domControls.length) * 100) : 100
          const color = domPct >= 75 ? '#0F6E56' : domPct >= 50 ? 'var(--color-module-climate)' : '#B91C1C'
          return (
            <div key={domain} style={{ border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.75rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>{domain}</div>
              <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ height: '100%', width: `${domPct}%`, background: color, borderRadius: 99 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color }}>{domPct}%</span>
                {domGaps > 0 && <span style={{ fontSize: 10, color: '#B91C1C' }}>{domGaps} gap{domGaps > 1 ? 's' : ''}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Regulatory compliance status */}
      <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Regulatory status</div>
        </div>
        {inventory.frameworks.map(fw => {
          const fwControls = CONTROLS.filter(c => c[fw as keyof typeof c] && inventory.frameworks.includes(fw))
          const fwGaps = fwControls.filter(c => !inventory.responses[c.id] || inventory.responses[c.id] === 'none').length
          const status = fwGaps === 0 ? 'Compliant' : fwGaps <= 2 ? 'Near compliant' : 'Gaps identified'
          const statusColor = fwGaps === 0 ? '#0F6E56' : fwGaps <= 2 ? 'var(--color-module-climate)' : '#B91C1C'
          return (
            <div key={fw} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{FRAMEWORK_CONFIG[fw].label}</div>
                <div style={{ fontSize: 11, color: '#888784' }}>{FRAMEWORK_CONFIG[fw].deadline}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: `color-mix(in srgb, ${statusColor} 8%, transparent)`, color: statusColor }}>{status}</span>
                {fwGaps > 0 && <div style={{ fontSize: 10, color: '#888784', marginTop: 3 }}>{fwGaps} control gap{fwGaps > 1 ? 's' : ''}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>Top 5 remediation priorities</h2>
      <p style={sectionSub}>Based on your gap assessment, these are the highest-priority controls to implement first — ranked by regulatory impact and risk weight.</p>

      {top5.length === 0 ? (
        <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 12, padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginBottom: 4 }}>No critical gaps identified</div>
          <div style={{ fontSize: 13, color: '#555553' }}>Your cyber governance programme appears strong. Continue to test and optimise.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {top5.map((control, i) => {
            const current = inventory.responses[control.id] || 'none'
            const fwList = (Object.keys(FRAMEWORK_CONFIG) as Framework[]).filter(f => inventory.frameworks.includes(f) && control[f as keyof typeof control])
            return (
              <div key={control.id} style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ background: '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-band)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--color-ink)', flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>{control.title}</div>
                  <span style={{ fontSize: 10, color: '#888784', background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 99 }}>{control.domain}</span>
                </div>
                <div style={{ padding: '1rem 16px' }}>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 10 }}>{control.desc}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {fwList.map(f => <span key={f} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: `color-mix(in srgb, ${FRAMEWORK_CONFIG[f].color} 8%, transparent)`, color: FRAMEWORK_CONFIG[f].color, border: `0.5px solid color-mix(in srgb, ${FRAMEWORK_CONFIG[f].color} 20%, transparent)` }}>{FRAMEWORK_CONFIG[f].label}</span>)}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: MATURITY_CONFIG[current].bg, color: MATURITY_CONFIG[current].color }}>
                      Current: {MATURITY_CONFIG[current].label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export your assessment</h2>
      <p style={sectionSub}>Download your full gap assessment report including all controls, scores and remediation priorities.</p>
      <div className="tq-summary" style={{ marginBottom: 20, display: 'block' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }} className="tq-summary-label">Assessment summary — {inventory.company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Overall score', val: `${pct}%`, urgent: pct < 50 },
            { label: 'Gaps identified', val: gaps.length, urgent: gaps.length > 0 },
            { label: 'Frameworks', val: inventory.frameworks.length },
            { label: 'Status', val: scoreLabel },
          ].map(({ label, val, urgent }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--color-ink-2)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.6rem' : '1rem', fontFamily: typeof val === 'number' ? 'Georgia, serif' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: urgent ? 'var(--color-module-cyber)' : 'var(--color-ink)', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
      {isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm this assessment reflects our current cyber governance programme to the best of my knowledge. I understand this report is for planning purposes and does not constitute a formal audit or legal advice.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: dataConfirmed ? 'pointer' : 'not-allowed', opacity: dataConfirmed ? 1 : 0.4 }}>
            ⬇ Download Cyber Gap Assessment (CSV)
          </button>
        </div>
      ) : (
        <div className="tq-band" style={{ borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Unlock your full cyber governance programme</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: 20, lineHeight: 1.6 }}>Download your full gap assessment, generate NIS2 and DORA compliance documentation, and track remediation progress over time.</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]
  const answeredCount = Object.keys(inventory.responses).length
  const totalControls = CONTROLS.filter(c => inventory.frameworks.some(f => c[f as keyof typeof c])).length

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: 'var(--color-module-cyber)', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>NIS2 active since Oct 2024 · DORA active since Jan 2025 · SEC cyber active since Dec 2023. Check your compliance now.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Cyber Governance</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>NIS2 · DORA · SEC Cyber Gap Assessment</div>
          </div>
          {pct > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#888784', marginBottom: 2 }}>Overall score</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor }}>{pct}% — {scoreLabel}</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#B91C1C' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
              {step < STEP_NAMES.length - 1 && <button onClick={() => setStep(s => Math.min(STEP_NAMES.length - 1, s + 1))} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>Next →</button>}
            </div>
          </div>
          {step < 4 && (
            <div style={{ position: 'sticky', top: 80 }}>
              <div className="tq-summary" style={{ marginBottom: 12, display: 'block' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }} className="tq-summary-label">Live score</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', fontWeight: 400, color: pct > 0 ? scoreColor : 'var(--color-ink-muted)', lineHeight: 1, marginBottom: 4 }}>{pct > 0 ? `${pct}%` : '—'}</div>
                {pct > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: scoreColor, marginBottom: 12 }}>{scoreLabel}</div>}
                <div style={{ height: 4, background: 'var(--color-sunken)', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: scoreColor, borderRadius: 99, transition: 'width 0.3s' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { label: 'Controls assessed', val: `${answeredCount}/${totalControls}` },
                    { label: 'Gaps identified', val: gaps.length, urgent: gaps.length > 0 },
                    { label: 'Frameworks', val: inventory.frameworks.length },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? 'var(--color-module-cyber)' : 'var(--color-ink)', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {gaps.length > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ {gaps.length} gap{gaps.length > 1 ? 's' : ''} identified</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>Go to Step 4 to see your top 5 remediation priorities</div>
                </div>
              )}
              <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6 }}>NIS2 · DORA · SEC Cyber · ISO 27001 · NIST CSF 2.0</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
