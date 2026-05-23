'use client'

import { useState, useEffect } from 'react'
import Nav from '../../components/Nav'

// ─── AI System Library ────────────────────────────────────────────────────────

const AI_SYSTEM_LIBRARY = [
  { category: 'HR & Recruitment', name: 'CV / Resume Screening Tool', purpose: 'Automatically screens and ranks job applicants based on CV analysis', decision_type: 'Hiring decisions — shortlisting candidates for interview', eu_deployment: true, affects_individuals: true },
  { category: 'HR & Recruitment', name: 'Candidate Ranking System', purpose: 'Ranks job candidates based on assessment scores and profile matching', decision_type: 'Hiring decisions — candidate prioritisation', eu_deployment: true, affects_individuals: true },
  { category: 'HR & Recruitment', name: 'Performance Management System', purpose: 'Evaluates and scores employee performance using automated metrics', decision_type: 'Performance reviews, promotion and termination decisions', eu_deployment: true, affects_individuals: true },
  { category: 'HR & Recruitment', name: 'Task Allocation System', purpose: 'Automatically assigns tasks and workload to employees', decision_type: 'Work allocation and scheduling decisions', eu_deployment: true, affects_individuals: true },
  { category: 'HR & Recruitment', name: 'Employee Monitoring System', purpose: 'Monitors employee productivity, activity and behaviour', decision_type: 'Performance assessment and management decisions', eu_deployment: true, affects_individuals: true },
  { category: 'HR & Recruitment', name: 'Workforce Planning Model', purpose: 'Predicts hiring needs and workforce composition', decision_type: 'Internal planning — no individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Finance & Credit', name: 'Credit Scoring Model', purpose: 'Assesses creditworthiness of individuals or businesses', decision_type: 'Credit approval, loan decisions, interest rate setting', eu_deployment: true, affects_individuals: true },
  { category: 'Finance & Credit', name: 'Loan Approval System', purpose: 'Automates loan application assessment and approval', decision_type: 'Lending decisions affecting individuals', eu_deployment: true, affects_individuals: true },
  { category: 'Finance & Credit', name: 'Insurance Risk Assessment', purpose: 'Calculates insurance premiums and coverage eligibility', decision_type: 'Insurance pricing and coverage decisions', eu_deployment: true, affects_individuals: true },
  { category: 'Finance & Credit', name: 'Fraud Detection System', purpose: 'Detects potentially fraudulent transactions in real time', decision_type: 'Transaction blocking and account restriction decisions', eu_deployment: true, affects_individuals: true },
  { category: 'Finance & Credit', name: 'AML / KYC System', purpose: 'Screens customers for anti-money laundering and KYC compliance', decision_type: 'Customer onboarding and transaction monitoring decisions', eu_deployment: true, affects_individuals: true },
  { category: 'Finance & Credit', name: 'Sales Forecasting Model', purpose: 'Predicts quarterly revenue based on pipeline and historical data', decision_type: 'Internal business planning — no individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Finance & Credit', name: 'Algorithmic Trading System', purpose: 'Automatically executes trades based on market signals', decision_type: 'Investment and trading decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Customer & Marketing', name: 'Customer Support Chatbot', purpose: 'Answers customer queries and resolves issues automatically', decision_type: 'Recommends solutions to customer service queries', eu_deployment: true, affects_individuals: true },
  { category: 'Customer & Marketing', name: 'Product Recommendation Engine', purpose: 'Recommends products or content based on user behaviour', decision_type: 'Product and content recommendations to individuals', eu_deployment: true, affects_individuals: true },
  { category: 'Customer & Marketing', name: 'Sentiment Analysis Tool', purpose: 'Analyses customer sentiment from reviews and feedback', decision_type: 'Internal analytics — no direct individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Customer & Marketing', name: 'Lead Scoring Model', purpose: 'Scores sales leads by likelihood to convert', decision_type: 'Sales prioritisation — internal use only', eu_deployment: true, affects_individuals: false },
  { category: 'Customer & Marketing', name: 'Ad Targeting System', purpose: 'Targets advertising to individuals based on behavioural data', decision_type: 'Advertising decisions affecting individuals', eu_deployment: true, affects_individuals: true },
  { category: 'Customer & Marketing', name: 'Churn Prediction Model', purpose: 'Predicts which customers are likely to cancel or leave', decision_type: 'Internal retention planning — no direct individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Customer & Marketing', name: 'Dynamic Pricing System', purpose: 'Adjusts prices in real time based on demand and user data', decision_type: 'Pricing decisions affecting individuals', eu_deployment: true, affects_individuals: true },
  { category: 'Operations', name: 'Demand Forecasting Model', purpose: 'Predicts product demand for inventory and supply chain planning', decision_type: 'Internal supply chain planning — no individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Operations', name: 'Predictive Maintenance System', purpose: 'Predicts equipment failures before they occur', decision_type: 'Maintenance scheduling — no individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Operations', name: 'Quality Control System', purpose: 'Automatically detects product defects using computer vision', decision_type: 'Production quality decisions — no individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Operations', name: 'Route Optimisation System', purpose: 'Optimises delivery and logistics routes automatically', decision_type: 'Logistics planning — no individual decisions', eu_deployment: true, affects_individuals: false },
  { category: 'Healthcare & Education', name: 'Clinical Decision Support', purpose: 'Assists clinicians with diagnosis and treatment recommendations', decision_type: 'Clinical decisions affecting patients', eu_deployment: true, affects_individuals: true },
  { category: 'Healthcare & Education', name: 'Student Assessment System', purpose: 'Automatically grades or scores student work', decision_type: 'Educational assessment decisions affecting students', eu_deployment: true, affects_individuals: true },
  { category: 'Healthcare & Education', name: 'Admissions Screening Tool', purpose: 'Screens and ranks student applications for admission', decision_type: 'Educational admission decisions', eu_deployment: true, affects_individuals: true },
  { category: 'Healthcare & Education', name: 'Exam Monitoring System', purpose: 'Monitors students during online exams for suspicious behaviour', decision_type: 'Examination integrity decisions affecting students', eu_deployment: true, affects_individuals: true },
  { category: 'Cybersecurity & IT', name: 'Intrusion Detection System', purpose: 'Detects and responds to cybersecurity threats automatically', decision_type: 'Security response — blocks access or isolates systems', eu_deployment: true, affects_individuals: false },
  { category: 'Cybersecurity & IT', name: 'Email Filtering System', purpose: 'Automatically filters spam and phishing emails', decision_type: 'Email delivery decisions', eu_deployment: true, affects_individuals: true },
  { category: 'Cybersecurity & IT', name: 'Access Control System', purpose: 'Grants or denies system access based on behaviour patterns', decision_type: 'Access decisions affecting individuals', eu_deployment: true, affects_individuals: true },
  { category: 'General Purpose AI', name: 'Large Language Model (LLM)', purpose: 'General purpose AI for text generation, summarisation and analysis', decision_type: 'Varies — depends on use case and deployment context', eu_deployment: true, affects_individuals: false },
  { category: 'General Purpose AI', name: 'Image Recognition System', purpose: 'Identifies objects, faces or content in images', decision_type: 'Content moderation or identification decisions', eu_deployment: true, affects_individuals: true },
  { category: 'General Purpose AI', name: 'Document Processing System', purpose: 'Automatically extracts and processes data from documents', decision_type: 'Data extraction — internal use only', eu_deployment: true, affects_individuals: false },
]

const LIBRARY_CATEGORIES = [...new Set(AI_SYSTEM_LIBRARY.map(s => s.category))]

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = 'prohibited' | 'high_risk' | 'limited_risk' | 'minimal_risk' | 'unclassified'

interface AISystem {
  id: string
  name: string
  purpose: string
  sector: string
  affects_individuals: boolean
  decision_type: string
  eu_deployment: boolean
  risk_level: RiskLevel
  annex_category: string
  requirements: string[]
  from_library: boolean
}

interface AIInventory {
  company: string
  reporting_year: number
  jurisdiction: string
  sector: string
  systems: AISystem[]
}

// ─── Classification Engine ────────────────────────────────────────────────────

const PROHIBITED_KEYWORDS = ['social scoring', 'social credit', 'real-time biometric', 'subliminal manipulation', 'emotion recognition workplace', 'predictive policing']

const HIGH_RISK_CATEGORIES: { keywords: string[]; category: string; requirements: string[] }[] = [
  {
    keywords: ['cv', 'resume', 'hiring', 'recruitment', 'job application', 'candidate ranking', 'performance management', 'task allocation', 'promotion', 'termination', 'hr decision', 'employee monitoring', 'work allocation'],
    category: 'Employment & HR (Annex III §4)',
    requirements: ['Article 11 technical documentation', 'Conformity assessment before deployment', 'EU AI database registration', 'Human oversight measures', 'Transparency notice to affected individuals', 'Accuracy, robustness & cybersecurity requirements'],
  },
  {
    keywords: ['credit scoring', 'creditworthiness', 'loan approval', 'lending', 'insurance risk', 'credit decision', 'insurance pricing', 'aml', 'kyc', 'fraud detection', 'transaction blocking'],
    category: 'Credit & Finance (Annex III §5b)',
    requirements: ['Article 11 technical documentation', 'Conformity assessment before deployment', 'EU AI database registration', 'Right to explanation for adverse decisions', 'Human review mechanism', 'Robustness and accuracy metrics'],
  },
  {
    keywords: ['student assessment', 'exam monitoring', 'admissions', 'educational assessment', 'academic evaluation', 'student scoring', 'grading'],
    category: 'Education (Annex III §3)',
    requirements: ['Article 11 technical documentation', 'Conformity assessment before deployment', 'EU AI database registration', 'Transparency to students and parents', 'Human oversight of outcomes'],
  },
  {
    keywords: ['benefits', 'welfare', 'social assistance', 'public service', 'essential service', 'emergency dispatch', 'clinical decision', 'patient', 'medical diagnosis', 'triage'],
    category: 'Essential Services / Healthcare (Annex III §2, §5a)',
    requirements: ['Article 11 technical documentation', 'Third-party conformity assessment', 'EU AI database registration', 'CE marking integration (medical devices)', 'Post-market monitoring'],
  },
  {
    keywords: ['access control', 'access decision', 'email delivery', 'advertising decisions'],
    category: 'Limited automated decisions affecting individuals',
    requirements: ['Transparency obligations', 'Consider conformity assessment if high impact', 'Document decision logic', 'Provide opt-out mechanism'],
  },
]

const LIMITED_RISK_KEYWORDS = ['chatbot', 'virtual assistant', 'deepfake', 'synthetic media', 'recommendation', 'sentiment']

const classifySystem = (system: AISystem): { risk: RiskLevel; category: string; requirements: string[] } => {
  if (!system.eu_deployment) return { risk: 'minimal_risk', category: 'Not in EU scope', requirements: ['Monitor regulatory developments in your jurisdiction'] }

  const text = `${system.name} ${system.purpose} ${system.decision_type}`.toLowerCase()

  if (PROHIBITED_KEYWORDS.some(k => text.includes(k))) {
    return { risk: 'prohibited', category: 'Prohibited AI Practice (Article 5)', requirements: ['IMMEDIATE: Discontinue or fundamentally redesign this system', 'Fines up to €35M or 7% global revenue', 'No grace period — prohibited since February 2, 2025'] }
  }

  for (const cat of HIGH_RISK_CATEGORIES) {
    if (cat.keywords.some(k => text.includes(k))) {
      return { risk: 'high_risk', category: cat.category, requirements: cat.requirements }
    }
  }

  if (LIMITED_RISK_KEYWORDS.some(k => text.includes(k))) {
    return { risk: 'limited_risk', category: 'Limited Risk (Transparency obligations)', requirements: ['Inform users they are interacting with AI', 'Label AI-generated content', 'No conformity assessment required'] }
  }

  return { risk: 'minimal_risk', category: 'Minimal Risk', requirements: ['No mandatory EU AI Act obligations', 'Voluntary code of conduct recommended', 'Monitor for regulatory changes'] }
}

const newSystem = (): AISystem => ({
  id: Math.random().toString(36).slice(2),
  name: '', purpose: '', sector: '', affects_individuals: true,
  decision_type: '', eu_deployment: true,
  risk_level: 'unclassified', annex_category: '', requirements: [],
  from_library: false,
})

const fromLibrary = (lib: typeof AI_SYSTEM_LIBRARY[0]): AISystem => {
  const base: AISystem = {
    id: Math.random().toString(36).slice(2),
    name: lib.name, purpose: lib.purpose, sector: lib.category,
    affects_individuals: lib.affects_individuals, decision_type: lib.decision_type,
    eu_deployment: lib.eu_deployment,
    risk_level: 'unclassified', annex_category: '', requirements: [],
    from_library: true,
  }
  const result = classifySystem(base)
  return { ...base, risk_level: result.risk, annex_category: result.category, requirements: result.requirements }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  prohibited:   { label: 'PROHIBITED', color: '#fff', bg: '#B91C1C', border: '#B91C1C' },
  high_risk:    { label: 'HIGH RISK', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  limited_risk: { label: 'LIMITED RISK', color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  minimal_risk: { label: 'MINIMAL RISK', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' },
  unclassified: { label: 'NOT CLASSIFIED', color: '#888784', bg: '#f8f7f5', border: '#e8e7e4' },
}

const STEP_NAMES = ['Setup', 'AI Systems', 'Classification', 'Requirements', 'Export']
const SECTORS = ['Financial services', 'Healthcare', 'Technology', 'Retail & e-commerce', 'Manufacturing', 'Energy & utilities', 'Transport & logistics', 'Education', 'Public sector', 'Professional services', 'Other']
const isPaid = true

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIGovernanceDashboard() {
  const [step, setStep] = useState(0)
  const [inventory, setInventory] = useState<AIInventory>({ company: '', reporting_year: 2025, jurisdiction: 'EU', sector: '', systems: [] })
  const [activeSystem, setActiveSystem] = useState(0)
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [daysLeft, setDaysLeft] = useState(71)
  const [showLibrary, setShowLibrary] = useState(false)
  const [libraryCategory, setLibraryCategory] = useState('HR & Recruitment')
  const [librarySearch, setLibrarySearch] = useState('')
  const [addMode, setAddMode] = useState<'library' | 'manual' | null>(null)

  useEffect(() => {
    const deadline = new Date('2026-08-02')
    const today = new Date()
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    setDaysLeft(Math.max(0, diff))
  }, [])

  const update = (field: keyof AIInventory, value: any) => setInventory(prev => ({ ...prev, [field]: value }))

  const updateSystem = (idx: number, field: keyof AISystem, value: any) => {
    setInventory(prev => {
      const systems = [...prev.systems]
      systems[idx] = { ...systems[idx], [field]: value }
      const s = systems[idx]
      if (s.name && s.purpose && s.decision_type) {
        const result = classifySystem(s)
        systems[idx] = { ...systems[idx], risk_level: result.risk, annex_category: result.category, requirements: result.requirements }
      }
      return { ...prev, systems }
    })
  }

  const addFromLibrary = (lib: typeof AI_SYSTEM_LIBRARY[0]) => {
    const system = fromLibrary(lib)
    setInventory(prev => ({ ...prev, systems: [...prev.systems, system] }))
    setActiveSystem(inventory.systems.length)
    setAddMode(null)
    setShowLibrary(false)
  }

  const addManual = () => {
    setInventory(prev => ({ ...prev, systems: [...prev.systems, newSystem()] }))
    setActiveSystem(inventory.systems.length)
    setAddMode(null)
  }

  const removeSystem = (idx: number) => {
    setInventory(prev => ({ ...prev, systems: prev.systems.filter((_, i) => i !== idx) }))
    setActiveSystem(Math.max(0, idx - 1))
  }

  const prohibited = inventory.systems.filter(s => s.risk_level === 'prohibited').length
  const highRisk = inventory.systems.filter(s => s.risk_level === 'high_risk').length
  const limitedRisk = inventory.systems.filter(s => s.risk_level === 'limited_risk').length
  const minimalRisk = inventory.systems.filter(s => s.risk_level === 'minimal_risk').length

  const filteredLibrary = AI_SYSTEM_LIBRARY.filter(s =>
    s.category === libraryCategory &&
    (librarySearch === '' || s.name.toLowerCase().includes(librarySearch.toLowerCase()) || s.purpose.toLowerCase().includes(librarySearch.toLowerCase()))
  )

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — EU AI Act Inventory & Gap Assessment'],
      ['Company', inventory.company],
      ['Reporting Year', inventory.reporting_year],
      ['Generated', new Date().toLocaleDateString()],
      [''],
      ['SUMMARY'],
      ['Total AI systems', inventory.systems.length],
      ['Prohibited', prohibited],
      ['High-risk (Annex III)', highRisk],
      ['Limited risk', limitedRisk],
      ['Minimal risk', minimalRisk],
      [''],
      ['AI SYSTEM INVENTORY'],
      ['System Name', 'Purpose', 'Risk Level', 'EU AI Act Category', 'Key Requirements', 'Deadline'],
      ...inventory.systems.map(s => [s.name, s.purpose, RISK_CONFIG[s.risk_level].label, s.annex_category, s.requirements.join(' | '), s.risk_level === 'prohibited' ? 'IMMEDIATE' : s.risk_level === 'high_risk' ? 'August 2 2026' : 'Ongoing']),
      [''],
      ['Generated by ThemisIQ · www.themisiq.co · EU AI Act Regulation (EU) 2024/1689'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inventory.company}_AIInventory_${inventory.reporting_year}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Tell us about your organisation so we can tailor your EU AI Act assessment.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={inputStyle} value={inventory.company} onChange={e => update('company', e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div>
          <label style={labelStyle}>Primary jurisdiction</label>
          <select style={inputStyle} value={inventory.jurisdiction} onChange={e => update('jurisdiction', e.target.value)}>
            {['EU', 'UK', 'USA', 'Canada', 'Global'].map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={inputStyle} value={inventory.reporting_year} onChange={e => update('reporting_year', Number(e.target.value))}>
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Primary sector</label>
          <select style={inputStyle} value={inventory.sector} onChange={e => update('sector', e.target.value)}>
            <option value="">Select your sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 20, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '1rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>EU AI Act — global scope</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>The EU AI Act applies to any organisation whose AI systems affect EU residents — regardless of where the company is based. A US company using CV screening for EU job applicants is in scope.</div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>AI system inventory</h2>
      <p style={sectionSub}>Add each AI system your organisation uses. Choose from our library of common systems or add a custom one.</p>

      {/* System tabs */}
      {inventory.systems.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {inventory.systems.map((s, i) => {
            const cfg = RISK_CONFIG[s.risk_level]
            return (
              <button key={s.id} onClick={() => setActiveSystem(i)} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: activeSystem === i ? '#0d0d0d' : '#f8f7f5', color: activeSystem === i ? '#fff' : '#555553', border: `0.5px solid ${activeSystem === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.name || `System ${i + 1}`}
                {s.risk_level !== 'unclassified' && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Add system buttons */}
      {addMode === null && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.5rem' }}>
          <button onClick={() => setAddMode('library')} style={{ padding: '1rem', borderRadius: 12, background: 'linear-gradient(135deg,rgba(116,37,227,0.05),rgba(31,177,255,0.05))', border: '1.5px solid #7425e3', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>Choose from library →</div>
            <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.5 }}>34 common AI systems with auto-classification. Pick yours in seconds.</div>
          </button>
          <button onClick={addManual} style={{ padding: '1rem', borderRadius: 12, background: '#f8f7f5', border: '1px solid #e8e7e4', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>Add custom system →</div>
            <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.5 }}>Describe your own AI system and we'll classify it automatically.</div>
          </button>
        </div>
      )}

      {/* Library picker */}
      {addMode === 'library' && (
        <div style={{ border: '1.5px solid #7425e3', borderRadius: 14, overflow: 'hidden', marginBottom: '1.5rem' }}>
          <div style={{ background: 'linear-gradient(135deg,#7425e3,#1fb1ff)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>AI System Library</div>
            <button onClick={() => setAddMode(null)} style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Close</button>
          </div>
          {/* Search */}
          <div style={{ padding: '12px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
            <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Search systems..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LIBRARY_CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setLibraryCategory(cat)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, background: libraryCategory === cat ? '#0d0d0d' : '#f8f7f5', color: libraryCategory === cat ? '#fff' : '#555553', border: `0.5px solid ${libraryCategory === cat ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          {/* Library items */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filteredLibrary.map((lib, i) => {
              const preview = fromLibrary(lib)
              const cfg = RISK_CONFIG[preview.risk_level]
              return (
                <div key={i} onClick={() => addFromLibrary(lib)} style={{ padding: '12px 16px', borderBottom: '0.5px solid #f3f4f6', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#f8f7f5'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = '#fff'}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 2 }}>{lib.name}</div>
                    <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.4 }}>{lib.purpose}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}`, whiteSpace: 'nowrap' }}>{cfg.label}</span>
                    <span style={{ fontSize: 12, color: '#888784' }}>+ Add</span>
                  </div>
                </div>
              )
            })}
            {filteredLibrary.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#888784', fontSize: 13 }}>No systems found — try a different search or category</div>
            )}
          </div>
          <div style={{ padding: '10px 16px', background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4' }}>
            <button onClick={addManual} style={{ fontSize: 12, color: '#7425e3', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>Can't find yours? Add a custom system →</button>
          </div>
        </div>
      )}

      {/* Selected system editor */}
      {inventory.systems.length > 0 && inventory.systems[activeSystem] && (
        <div style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{inventory.systems[activeSystem].name || `System ${activeSystem + 1}`}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {inventory.systems[activeSystem].risk_level !== 'unclassified' && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: RISK_CONFIG[inventory.systems[activeSystem].risk_level].bg, color: RISK_CONFIG[inventory.systems[activeSystem].risk_level].color }}>
                  {RISK_CONFIG[inventory.systems[activeSystem].risk_level].label}
                </span>
              )}
              {inventory.systems[activeSystem].from_library && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>From library</span>}
            </div>
          </div>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>System name</label>
              <input style={inputStyle} value={inventory.systems[activeSystem].name} onChange={e => updateSystem(activeSystem, 'name', e.target.value)} placeholder="e.g. CV Screening Tool" />
            </div>
            <div>
              <label style={labelStyle}>What does this system do?</label>
              <input style={inputStyle} value={inventory.systems[activeSystem].purpose} onChange={e => updateSystem(activeSystem, 'purpose', e.target.value)} placeholder="e.g. Ranks job applicants based on CV analysis" />
            </div>
            <div>
              <label style={labelStyle}>What decisions does it influence or make?</label>
              <input style={inputStyle} value={inventory.systems[activeSystem].decision_type} onChange={e => updateSystem(activeSystem, 'decision_type', e.target.value)} placeholder="e.g. Hiring decisions, credit approvals" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Deployed or used in the EU?</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                    <button key={String(opt.val)} onClick={() => updateSystem(activeSystem, 'eu_deployment', opt.val)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: inventory.systems[activeSystem].eu_deployment === opt.val ? '#0d0d0d' : '#f8f7f5', color: inventory.systems[activeSystem].eu_deployment === opt.val ? '#fff' : '#555553', border: `0.5px solid ${inventory.systems[activeSystem].eu_deployment === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Affects individuals directly?</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                    <button key={String(opt.val)} onClick={() => updateSystem(activeSystem, 'affects_individuals', opt.val)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: inventory.systems[activeSystem].affects_individuals === opt.val ? '#0d0d0d' : '#f8f7f5', color: inventory.systems[activeSystem].affects_individuals === opt.val ? '#fff' : '#555553', border: `0.5px solid ${inventory.systems[activeSystem].affects_individuals === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {inventory.systems[activeSystem].risk_level !== 'unclassified' && (
              <div style={{ background: RISK_CONFIG[inventory.systems[activeSystem].risk_level].bg, border: `1px solid ${RISK_CONFIG[inventory.systems[activeSystem].risk_level].border}`, borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: RISK_CONFIG[inventory.systems[activeSystem].risk_level].color, marginBottom: 4 }}>
                  ⚡ Classified: {RISK_CONFIG[inventory.systems[activeSystem].risk_level].label}
                </div>
                <div style={{ fontSize: 12, color: '#555553' }}>{inventory.systems[activeSystem].annex_category}</div>
                {inventory.systems[activeSystem].risk_level === 'high_risk' && (
                  <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 6, fontWeight: 600 }}>Conformity assessment required by August 2, 2026 — {daysLeft} days</div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {inventory.systems.length > 0 && (
                <button onClick={() => removeSystem(activeSystem)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove this system</button>
              )}
              <button onClick={() => setAddMode('library')} style={{ fontSize: 11, color: '#7425e3', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>+ Add another system from library</button>
            </div>
          </div>
        </div>
      )}

      {inventory.systems.length === 0 && addMode === null && (
        <div style={{ background: '#f8f7f5', border: '1px dashed #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: '#888784', marginBottom: 8 }}>No AI systems added yet</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>Use the buttons above to add your first AI system</div>
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Risk classification</h2>
      <p style={sectionSub}>ThemisIQ has automatically classified each system under the EU AI Act. Review and confirm.</p>
      {inventory.systems.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>No systems added yet — go back to Step 2 to add your AI systems.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {inventory.systems.map((s, i) => {
              const cfg = RISK_CONFIG[s.risk_level]
              return (
                <div key={s.id} style={{ border: `1.5px solid ${cfg.border}`, borderRadius: 14, overflow: 'hidden' }}>
                  <div style={{ background: s.risk_level === 'prohibited' ? '#B91C1C' : cfg.bg, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: s.risk_level === 'prohibited' ? '#fff' : '#0d0d0d' }}>{s.name || `System ${i + 1}`}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: s.risk_level === 'prohibited' ? 'rgba(255,255,255,0.2)' : cfg.border, color: '#fff' }}>{cfg.label}</span>
                  </div>
                  <div style={{ padding: '1rem 16px' }}>
                    <div style={{ fontSize: 11, color: '#888784', marginBottom: 2 }}>{s.annex_category}</div>
                    <div style={{ fontSize: 12, color: '#555553', marginTop: 4 }}>{s.purpose}</div>
                    {s.risk_level === 'high_risk' && <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginTop: 6 }}>⚠ Conformity assessment required by August 2, 2026 — {daysLeft} days</div>}
                    {s.risk_level === 'prohibited' && <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginTop: 6 }}>🚨 Must be discontinued or redesigned immediately</div>}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Prohibited', count: prohibited, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risk', count: highRisk, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'Limited risk', count: limitedRisk, color: '#ba7517', bg: '#FEF3E2' },
              { label: 'Minimal risk', count: minimalRisk, color: '#0F6E56', bg: '#E1F5EE' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>Conformity requirements</h2>
      <p style={sectionSub}>For each high-risk or prohibited system, here's exactly what you need to do and by when.</p>
      {inventory.systems.filter(s => s.risk_level === 'prohibited' || s.risk_level === 'high_risk').length === 0 ? (
        <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 12, padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginBottom: 4 }}>No high-risk systems identified</div>
          <div style={{ fontSize: 13, color: '#555553' }}>Your AI systems appear to fall under limited or minimal risk. Continue to maintain good governance practices.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {inventory.systems.filter(s => s.risk_level === 'prohibited' || s.risk_level === 'high_risk').map(s => (
            <div key={s.id} style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ background: s.risk_level === 'prohibited' ? '#B91C1C' : '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{s.name}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', background: '#FCEBEB', padding: '2px 8px', borderRadius: 99 }}>
                  {s.risk_level === 'prohibited' ? 'IMMEDIATE ACTION' : `Deadline: Aug 2, 2026 · ${daysLeft} days`}
                </span>
              </div>
              <div style={{ padding: '1.25rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Required actions</div>
                {s.requirements.map((req, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid #e8e7e4', background: '#fff', flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{req}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export & next steps</h2>
      <p style={sectionSub}>Your EU AI Act inventory and gap assessment is ready.</p>
      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Inventory summary — {inventory.company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total systems', val: inventory.systems.length },
            { label: 'Action required', val: prohibited + highRisk, urgent: true },
            { label: 'Days to deadline', val: daysLeft, urgent: true },
            { label: 'Framework', val: 'EU AI Act 2024/1689' },
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
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm that the AI systems listed are accurate to the best of my knowledge. I understand this report is for planning purposes and does not constitute legal advice.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: dataConfirmed ? 'pointer' : 'not-allowed', opacity: dataConfirmed ? 1 : 0.4 }}>
            ⬇ Download AI Inventory & Gap Assessment (CSV)
          </button>
        </div>
      ) : (
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Unlock your full AI governance programme</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 8, lineHeight: 1.6 }}>Download your EU AI Act gap assessment, generate Article 11 technical documentation, and track conformity assessment progress.</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>August 2, 2026 — {daysLeft} days away</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: '#7425e3', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#64fe3e', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>EU AI Act high-risk AI deadline: August 2, 2026 — {daysLeft} days. Start your inventory now.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>AI Governance</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>EU AI Act Inventory & Gap Assessment</div>
          </div>
          <div style={{ fontSize: 12, color: '#888784' }}>{inventory.company && <span style={{ fontWeight: 500, color: '#0d0d0d' }}>{inventory.company} · </span>}Regulation (EU) 2024/1689</div>
        </div>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
                    { label: 'Company', val: inventory.company || '—' },
                    { label: 'Systems', val: inventory.systems.length },
                    { label: 'High-risk', val: highRisk, urgent: highRisk > 0 },
                    { label: 'Prohibited', val: prohibited, urgent: prohibited > 0 },
                    { label: 'Days to deadline', val: daysLeft, urgent: true },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? '#64fe3e' : '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {highRisk > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ Action required</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>{highRisk} high-risk system{highRisk > 1 ? 's' : ''} require conformity assessment by August 2, 2026</div>
                </div>
              )}
              <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.15)', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#7425e3', lineHeight: 1.6 }}><strong>EU AI Act · Regulation (EU) 2024/1689</strong><br />High-risk AI deadline: August 2, 2026</div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
