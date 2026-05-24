'use client'

import { useState } from 'react'

interface Answers {
  driver?: string 
  revenue?: number
  employees?: string
  jurisdictions?: string[]
  sectors?: string[]
  listed?: string
  ai_use?: string
  supply_chain?: string
}

interface Obligation {
  name: string
  jurisdiction: string
  urgency: 'critical' | 'high' | 'medium' | 'monitor'
  urgency_label: string
  deadline: string
  module: string
  what: string
  action: string
}

const REVENUE_LABELS = ['Under $50M','$50M','$100M','$250M','$500M','$750M','$1B','$2B','$5B','$10B','$10B+']
const REVENUE_VALUES = [25, 50, 100, 250, 500, 750, 1000, 2000, 5000, 10000, 15000]

function computeObligations(a: Answers): Obligation[] {
  const rev = a.revenue !== undefined ? REVENUE_VALUES[a.revenue] : 0
  const emp = a.employees || ''
  const jur = a.jurisdictions || []
  const sec = a.sectors || []
  const lst = a.listed || ''
  const ai  = a.ai_use || ''
  const hasEU   = jur.includes('eu')
  const hasUK   = jur.includes('uk')
  const hasCA   = jur.includes('california')
  const hasAU   = jur.includes('australia')
  const hasGlobal = jur.includes('global')
  const isFinancial = sec.includes('financial')
  const isEnergy    = sec.includes('energy')
  const isHealth    = sec.includes('health')
  const isTransport = sec.includes('transport')
  const largeCo = ['500_999','1000_4999','5000plus'].includes(emp)
  const midCo   = ['250_499','500_999','1000_4999','5000plus'].includes(emp)
  const isPublicUS = lst === 'us_public'
  const isPE       = lst === 'pe_backed'
  const regs: Obligation[] = []

  if (hasCA && rev >= 1000) regs.push({ name: 'SB 253 — California Climate Corporate Data Accountability Act', jurisdiction: 'California, USA', urgency: 'critical', urgency_label: 'IMMEDIATE ACTION', deadline: 'August 10, 2026 —  83 days', module: 'Climate · GHG Emissions', what: 'Your company has California nexus and global revenue over $1B. SB 253 applies. Scope 1 and 2 GHG disclosure is required by August 10, 2026. Scope 3 follows from 2027.', action: 'Start Scope 1 + 2 GHG inventory immediately using the CARB-approved GHG Protocol methodology.' })
  if (hasCA && rev >= 500) regs.push({ name: 'SB 261 — California Climate-Related Financial Risk Act', jurisdiction: 'California, USA', urgency: 'monitor', urgency_label: 'MONITOR', deadline: 'Paused — Ninth Circuit injunction', module: 'Climate · Risk', what: 'Your company meets the $500M revenue threshold. SB 261 is currently paused by a Ninth Circuit injunction. Prepare TCFD-aligned disclosure now.', action: 'Prepare TCFD disclosure as precaution while monitoring injunction status.' })
  if (hasEU && largeCo) regs.push({ name: 'CSRD / ESRS — Corporate Sustainability Reporting Directive', jurisdiction: 'European Union', urgency: 'critical', urgency_label: 'ACTIVE NOW', deadline: 'FY2024 reporting — active now', module: 'Climate · GHG + Risk + People + Supply Chain', what: 'You meet the EU large entity threshold (500+ employees). Full ESRS suite applies — E1 (climate), S1 (workforce), S2 (value chain), G1 (business conduct).', action: 'Conduct ESRS double materiality assessment and close disclosure gaps across E1, S1, S2, and G1.' })
  else if (hasEU && midCo) regs.push({ name: 'CSRD / ESRS — Mid-size company scope', jurisdiction: 'European Union', urgency: 'high', urgency_label: 'HIGH PRIORITY', deadline: 'FY2025 reporting', module: 'Climate · GHG + Risk + People', what: 'Mid-size companies (250+ employees) enter CSRD scope from FY2025. Same ESRS standards apply as for large companies.', action: 'Begin ESRS gap assessment for FY2025 reporting.' })
  if (hasEU || hasUK || hasAU || jur.includes('canada') || jur.includes('apac')) regs.push({ name: 'IFRS S2 — Climate-related Disclosures', jurisdiction: '30+ jurisdictions globally', urgency: 'high', urgency_label: 'HIGH PRIORITY', deadline: 'Active — jurisdiction dependent', module: 'Climate · Risk', what: 'IFRS S2 has been adopted by 30+ jurisdictions including the EU, UK, Australia, Canada, Singapore, and Japan.', action: 'Run IFRS S2 physical and transition risk assessment.' })
  if (hasEU && ai !== 'no') { const urgency = (ai === 'yes_hr' || ai === 'yes_credit') ? 'critical' : 'high'; regs.push({ name: 'EU AI Act — Artificial Intelligence Regulation', jurisdiction: 'European Union (global scope)', urgency, urgency_label: urgency === 'critical' ? 'IMMEDIATE ACTION' : 'HIGH PRIORITY', deadline: urgency === 'critical' ? 'August 2, 2026 — 77 days' : 'August 2, 2026', module: 'AI Governance', what: ai === 'yes_hr' ? 'CV screening and hiring AI are Annex III high-risk. Full conformity assessment and EU database registration required by August 2, 2026.' : 'Your AI systems require risk classification under EU AI Act.', action: 'Inventory all AI systems and begin Article 11 technical documentation.' }) }
  const nis2Sectors = isEnergy || isFinancial || isHealth || isTransport || sec.includes('tech')
  if (hasEU && (nis2Sectors || largeCo)) regs.push({ name: 'EU NIS2 Directive — Network and Information Security', jurisdiction: 'European Union · 18 sectors', urgency: 'critical', urgency_label: 'ACTIVE NOW', deadline: 'Active since October 2024', module: 'Cyber Governance', what: 'Your sector and size place you in NIS2 scope. Board-level accountability, mandatory security measures, and 24h/72h incident notification are required.', action: 'Conduct NIS2 gap assessment and document board cyber governance immediately.' })
  if (isFinancial && hasEU) regs.push({ name: 'DORA — Digital Operational Resilience Act', jurisdiction: 'EU financial services', urgency: 'critical', urgency_label: 'ACTIVE NOW', deadline: 'Active since January 2025', module: 'Cyber Governance', what: 'As a financial services entity with EU operations, DORA applies in full. ICT risk management framework and third-party ICT risk management are mandatory.', action: 'ICT risk framework and Critical Third-Party Provider register required immediately.' })
  if (isPublicUS) regs.push({ name: 'SEC Cybersecurity Disclosure Rules', jurisdiction: 'United States · public companies', urgency: 'critical', urgency_label: 'ACTIVE NOW', deadline: 'Active since December 2023', module: 'Cyber Governance', what: 'Material cybersecurity incidents must be disclosed on Form 8-K within 4 business days. Annual 10-K must describe your cybersecurity risk management programme.', action: 'Document cyber governance programme for 10-K disclosure.' })
  if (isPublicUS) regs.push({ name: 'SEC Item 101 — Human Capital Disclosure', jurisdiction: 'United States · public companies', urgency: 'high', urgency_label: 'HIGH PRIORITY', deadline: 'Active · annual Form 10-K', module: 'People & Workforce', what: 'US public companies must include material human capital disclosures in Form 10-K — workforce size, turnover, safety, training investment.', action: 'Audit current 10-K human capital disclosure against peer benchmarks.' })
  if (hasEU && (midCo || largeCo)) regs.push({ name: 'EU Pay Transparency Directive (2023/970)', jurisdiction: 'European Union', urgency: 'high', urgency_label: 'HIGH PRIORITY', deadline: 'June 2026 — 13 months', module: 'People & Workforce', what: 'Employers with 100+ EU employees must report gender pay gap. A gap exceeding 5% triggers a mandatory joint pay assessment.', action: 'Calculate gender pay gap by job band now.' })
  if (hasCA) regs.push({ name: 'California Pay Data Reporting Act', jurisdiction: 'California, USA', urgency: 'high', urgency_label: 'HIGH PRIORITY', deadline: 'Annual · second Wednesday in May', module: 'People & Workforce', what: 'Employers with 100+ California employees must submit annual pay data by race/ethnicity, sex, and job category.', action: 'Prepare DFEH pay data submission for next annual deadline.' })
  if (rev >= 500 || hasGlobal) regs.push({ name: 'CDP Climate — Annual Disclosure', jurisdiction: 'Global · investor-driven', urgency: 'medium', urgency_label: 'ANNUAL', deadline: 'Annual · July submission', module: 'Climate · GHG + Risk', what: 'CDP is requested by investors representing over $130 trillion AUM. CDP C6, C7, C11, and Section P all flow from your GHG inventory.', action: 'Complete GHG inventory to feed CDP C6 and run scenario analysis for CDP Section P.' })
  if ((hasUK && rev >= 36) || (hasAU && rev >= 100)) regs.push({ name: 'Modern Slavery Act — UK / Australia', jurisdiction: hasUK && hasAU ? 'UK + Australia' : hasUK ? 'United Kingdom' : 'Australia', urgency: 'medium', urgency_label: 'ANNUAL', deadline: 'Annual · 6 months after financial year end', module: 'Supply Chain', what: 'An annual transparency statement is required covering steps to ensure no modern slavery in your supply chains.', action: 'Conduct supply chain human rights assessment and draft Modern Slavery statement.' })
  if (isPE) regs.push({ name: 'LP & Lender ESG Requirements', jurisdiction: 'Global · capital markets', urgency: 'high', urgency_label: 'HIGH PRIORITY', deadline: 'Varies by LP agreement', module: 'Deals & Investment', what: 'Institutional LPs and lenders are requiring documented ESG diligence as a condition of capital deployment.', action: 'Establish portfolio climate monitoring and LP ESG reporting framework.' })

  const order = { critical: 0, high: 1, medium: 2, monitor: 3 }
  return regs.sort((a, b) => order[a.urgency] - order[b.urgency])
}

const URGENCY_COLOR: Record<string, string> = { critical: '#B91C1C', high: '#ba7517', medium: '#0C447C', monitor: '#888784' }
const URGENCY_BG: Record<string, string> = { critical: '#FCEBEB', high: '#FEF3E2', medium: '#E6F1FB', monitor: '#f8f7f5' }
const URGENCY_TEXT: Record<string, string> = { critical: '#501313', high: '#633806', medium: '#0C447C', monitor: '#888784' }

export default function AssessPage() {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [email, setEmail] = useState({ first: '', last: '', emailAddr: '', company: '', role: '' })

  const goNext = () => setStep(s => s + 1)
  const goBack = () => setStep(s => s - 1)

  const submitToAPI = async () => {
    try {
      await fetch('/api/assessment/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead: { first: email.first, last: email.last, email: email.emailAddr, company: email.company, role: email.role }, obligations }),
      })
    } catch (e) {
      console.error('Email send failed:', e)
    }
  }
  const toggleExpand = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  const obligations = computeObligations(answers)
  const critical = obligations.filter(o => o.urgency === 'critical').length
  const high = obligations.filter(o => o.urgency === 'high').length

  const pct = Math.round((step / 10) * 100)

  const questions = [
    { id: 'driver' as keyof Answers, title: "What's driving your ESG focus right now?", sub: 'This helps us identify the right starting point.', type: 'options', options: [{ value: 'regulatory', label: 'A regulation applies to us', sub: 'SB 253, CSRD, EU AI Act, NIS2 — mandatory compliance' }, { value: 'customer', label: 'A customer is asking us', sub: 'Supplier questionnaire, EcoVadis, procurement requirement' }, { value: 'investor', label: 'Our investor requires it', sub: 'LP ESG reporting, portfolio climate disclosure' }, { value: 'bank', label: 'Our bank or insurer is asking', sub: 'Sustainability-linked loan, climate risk questionnaire' }, { value: 'board', label: 'Our board wants it', sub: 'Governance, talent, reputation, proactive ESG' }, { value: 'ahead', label: 'We want to get ahead', sub: 'Proactive compliance before mandatory deadlines' }] },

    { id: 'revenue' as keyof Answers, title: "What is your company's global annual revenue?", sub: 'Determines eligibility for SB 253 ($1B), SB 261 ($500M), ESRS/CSRD, and Modern Slavery Act thresholds.', type: 'slider' },
    { id: 'employees' as keyof Answers, title: 'How many employees does your company have globally?', sub: 'Determines CSRD/ESRS scope, EU Pay Transparency, and California Pay Data Reporting thresholds.', type: 'options', options: [{ value: 'under50', label: 'Under 50', sub: 'Small organisation' }, { value: '50_249', label: '50–249', sub: 'NIS2 important entity threshold' }, { value: '250_499', label: '250–499', sub: 'ESRS mid-size · EU Pay Transparency (every 3 years)' }, { value: '500_999', label: '500–999', sub: 'ESRS large entity · EU Pay Transparency annual' }, { value: '1000_4999', label: '1,000–4,999', sub: 'Full ESRS scope · EU AI Act · NIS2 essential entity' }, { value: '5000plus', label: '5,000+', sub: 'All obligations apply · SEC human capital disclosure' }] },
    { id: 'jurisdictions' as keyof Answers, title: 'Where does your company operate or have revenue?', sub: 'Select all that apply. Each jurisdiction triggers different mandatory disclosure obligations.', type: 'multiselect', options: [{ value: 'california', label: '🇺🇸 California, USA', sub: 'SB 253, SB 261, CA Pay Data' }, { value: 'us_other', label: '🇺🇸 United States (other)', sub: 'SEC rules, NIST, Model Risk' }, { value: 'eu', label: '🇪🇺 European Union', sub: 'CSRD, ESRS, NIS2, DORA, EU AI Act' }, { value: 'uk', label: '🇬🇧 United Kingdom', sub: 'TCFD mandatory, Modern Slavery Act' }, { value: 'australia', label: '🇦🇺 Australia', sub: 'Modern Slavery Act, AASB S2' }, { value: 'canada', label: '🇨🇦 Canada', sub: 'IFRS S2 adoption, federal modern slavery' }, { value: 'apac', label: '🌏 Asia Pacific (other)', sub: 'Singapore, Japan, Hong Kong TCFD' }, { value: 'global', label: '🌐 Global / multiple regions', sub: 'CDP, GRI, SBTi, UNGP' }] },
    { id: 'sectors' as keyof Answers, title: 'Which sectors best describe your business?', sub: 'Determines NIS2 essential/important entity status, DORA applicability, and EU AI Act high-risk categories.', type: 'multiselect', options: [{ value: 'financial', label: '🏦 Financial services', sub: 'DORA, NIS2 essential, SR 11-7' }, { value: 'energy', label: '⚡ Energy / utilities', sub: 'NIS2 essential, SB 253, ESRS' }, { value: 'health', label: '🏥 Healthcare', sub: 'NIS2 essential, EU AI Act high-risk' }, { value: 'manufacturing', label: '🏭 Manufacturing / industrial', sub: 'SB 253, ESRS E1, NIS2 important' }, { value: 'tech', label: '💻 Technology / digital', sub: 'EU AI Act, NIS2, DORA (if fintech)' }, { value: 'transport', label: '🚚 Transport / logistics', sub: 'NIS2 essential, Scope 3 Cat.4' }, { value: 'retail', label: '🛍️ Retail / consumer', sub: 'Supply chain, SB 253, ESRS' }, { value: 'other', label: '💼 Professional services', sub: 'ESRS, CDP, GRI' }] },
    { id: 'listed' as keyof Answers, title: "What is your company's ownership structure?", sub: 'Public listing status determines SEC disclosure obligations and ESRS reporting timelines.', type: 'options', options: [{ value: 'us_public', label: 'US publicly listed (NYSE / Nasdaq)', sub: 'SEC 10-K · 8-K cyber disclosure · Item 101' }, { value: 'eu_public', label: 'EU publicly listed', sub: 'CSRD large company · ESRS full suite from FY2024' }, { value: 'uk_public', label: 'UK publicly listed (LSE Premium)', sub: 'TCFD mandatory · ESRS if EU nexus' }, { value: 'pe_backed', label: 'Private equity backed', sub: 'LP ESG requirements · portfolio climate disclosure' }, { value: 'family', label: 'Family office / private', sub: 'Direct investment ESG · ESRS if EU thresholds met' }, { value: 'other_private', label: 'Other private company', sub: 'ESRS may apply via EU revenue / employee thresholds' }] },
    { id: 'ai_use' as keyof Answers, title: 'Does your company deploy AI systems that affect people?', sub: 'The EU AI Act applies to any organisation using AI that affects EU residents.', type: 'options', options: [{ value: 'yes_hr', label: 'Yes — in HR / hiring decisions', sub: 'EU AI Act Annex III high-risk · Aug 2, 2026 deadline' }, { value: 'yes_credit', label: 'Yes — in credit or financial decisions', sub: 'EU AI Act Annex III high-risk · DORA model risk' }, { value: 'yes_other', label: 'Yes — in other operational contexts', sub: 'Risk classification needed' }, { value: 'no_planned', label: 'Not yet but planning to deploy AI', sub: 'Governance framework needed before deployment' }, { value: 'no', label: 'No AI systems deployed', sub: 'EU AI Act unlikely to apply at this time' }] },
    { id: 'supply_chain' as keyof Answers, title: 'How complex is your supply chain?', sub: 'Determines ESRS S2, Scope 3 Category 1, and CS3D due diligence obligations.', type: 'options', options: [{ value: 'simple', label: 'Simple — few domestic suppliers', sub: 'Scope 3 Cat.1 likely low · ESRS S2 light touch' }, { value: 'moderate', label: 'Moderate — multiple countries', sub: 'Scope 3 Cat.1 material · ESRS S2 · CDP C12' }, { value: 'complex', label: 'Complex — global supply chain', sub: 'SB 253 Scope 3 2027 · ESRS G1 · CS3D · EcoVadis' }, { value: 'deep', label: 'Deep — multi-tier, high-risk geographies', sub: 'CS3D HRDD · Modern Slavery · UNGP full scope' }] },
  ]

  const renderContent = () => {
    // Results
    if (step === 8) return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, background: '#f8f7f5', border: '0.5px solid #e8e7e4', padding: '4px 14px', borderRadius: 99, marginBottom: 12, color: '#888784' }}>Your Compliance Obligation Map</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, marginBottom: 8, lineHeight: 1.2, color: '#0d0d0d' }}>
            We identified <span style={{ background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontStyle: 'italic' }}>{obligations.length} regulations</span> that apply to your company.
          </h2>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 300 }}>{critical} require immediate action. {high} are high priority. Click each to expand.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: '1.5rem' }}>
          {[{ val: critical, label: 'Immediate action', color: '#B91C1C' }, { val: high, label: 'High priority', color: '#ba7517' }, { val: obligations.length - critical - high, label: 'Monitor / annual', color: '#1fb1ff' }].map(({ val, label, color }) => (
            <div key={label} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px', textAlign: 'center' as const }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', color, marginBottom: 2 }}>{val}</div>
              <div style={{ fontSize: 11, color: '#888784' }}>{label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: '1.5rem' }}>
          {obligations.map((ob, i) => (
            <div key={i} style={{ border: '0.5px solid #e8e7e4', borderRadius: 10, overflow: 'hidden', background: '#fff', borderLeft: `4px solid ${URGENCY_COLOR[ob.urgency]}` }}>
              <div onClick={() => toggleExpand(String(i))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: URGENCY_COLOR[ob.urgency], flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{ob.name}</div>
                    <div style={{ fontSize: 11, color: '#888784', marginTop: 1 }}>{ob.jurisdiction} · {ob.deadline}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: URGENCY_BG[ob.urgency], color: URGENCY_TEXT[ob.urgency] }}>{ob.urgency_label}</span>
                  <span style={{ color: '#888784', fontSize: 12 }}>{expanded[String(i)] ? '▲' : '▼'}</span>
                </div>
              </div>
              {expanded[String(i)] && (
                <div style={{ padding: '0 14px 14px', borderTop: '0.5px solid #e8e7e4' }}>
                  <p style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, margin: '10px 0 8px', fontWeight: 300 }}>{ob.what}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    <a href="/advisory" style={{ fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 7, background: '#0d0d0d', color: '#fff', textDecoration: 'none' }}>ThemisIQ: {ob.module} →</a>
                    <a href="/advisory" style={{ fontSize: 12, padding: '6px 14px', borderRadius: 7, background: 'none', color: '#555553', border: '0.5px solid #e8e7e4', textDecoration: 'none' }}>Talk to an advisor</a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', textAlign: 'center' as const }}>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#fff', marginBottom: 6 }}>Want help navigating all {obligations.length} obligations?</h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: '1.25rem', fontWeight: 300 }}>A ThemisIQ advisor will review your results and tell you exactly what to do first. No charge for the initial call.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <a href="/advisory" style={{ fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none' }}>Book free consultation</a>
            <a href="/" style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', color: 'rgba(255,255,255,0.6)', border: '0.5px solid rgba(255,255,255,0.15)', textDecoration: 'none' }}>See your emissions instantly →</a>
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button onClick={() => { setStep(0); setAnswers({}) }} style={{ fontSize: 12, color: '#888784', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Start over</button>
        </div>
      </div>
    )

    // Email gate
    if (step === 7) return (
      <div>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>Almost there</div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, marginBottom: 8, lineHeight: 1.2, color: '#0d0d0d' }}>Your compliance map is ready.</h2>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.6 }}>Enter your details to see which regulations apply — with deadlines, penalties, and the ThemisIQ module that addresses each one.</p>
        </div>
        <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
          <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#fff', marginBottom: 4 }}>Where should we send your results?</h3>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8, fontWeight: 300 }}>Results display instantly. We'll also email a PDF you can share with your board or legal team.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input value={email.first} onChange={e => setEmail(v => ({...v, first: e.target.value}))} placeholder="First name" style={inputStyle} />
            <input value={email.last} onChange={e => setEmail(v => ({...v, last: e.target.value}))} placeholder="Last name" style={inputStyle} />
          </div>
          <input value={email.emailAddr} onChange={e => setEmail(v => ({...v, emailAddr: e.target.value}))} placeholder="Work email address" type="email" style={inputStyle} />
          <input value={email.company} onChange={e => setEmail(v => ({...v, company: e.target.value}))} placeholder="Company name" style={inputStyle} />
          <input value={email.role} onChange={e => setEmail(v => ({...v, role: e.target.value}))} placeholder="Your role (e.g. CFO, Head of Sustainability)" style={inputStyle} />
          <button onClick={() => { if (email.emailAddr.includes("@")) { submitToAPI(); setStep(8) } }} style={{ fontSize: 14, fontWeight: 500, padding: 12, borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer', marginTop: 4 }}>
            Show my Compliance Obligation Map →
          </button>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center' as const }}>No spam. No sales calls unless you ask.</p>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button onClick={goBack} style={backBtn}>← Back</button>
        </div>
      </div>
    )

    // Questions
    const q = questions[step]
    const val = answers[q.id]
    const multiVal = (answers[q.id] as string[] | undefined) || []
    const canProceed = q.type === 'slider' ? val !== undefined : q.type === 'options' ? !!val : multiVal.length > 0

    return (
      <div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#0d0d0d', color: '#fff', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{step + 1}</div>
            <div style={{ fontSize: 11, color: '#888784' }}>Question {step + 1} of 8</div>
          </div>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, lineHeight: 1.25, marginBottom: 6, color: '#0d0d0d' }}>{q.title}</h2>
          <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.25rem' }}>{q.sub}</p>

          {q.type === 'slider' && (
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', textAlign: 'center' as const, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 10 }}>
                {REVENUE_LABELS[val as number ?? 5]}
              </div>
              <input type="range" min={0} max={10} value={val as number ?? 5} onChange={e => setAnswers(a => ({ ...a, revenue: Number(e.target.value) }))} style={{ width: '100%', accentColor: '#7425e3' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#888784', marginTop: 4 }}>
                <span>Under $50M</span><span>$10B+</span>
              </div>
            </div>
          )}

          {q.type === 'options' && (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
              {q.options?.map(opt => (
                <div key={opt.value} onClick={() => setAnswers(a => ({ ...a, [q.id]: opt.value }))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', border: `0.5px solid ${val === opt.value ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, cursor: 'pointer', background: val === opt.value ? 'rgba(116,37,227,0.04)' : '#fff' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${val === opt.value ? '#7425e3' : '#e8e7e4'}`, background: val === opt.value ? '#7425e3' : 'none', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {val === opt.value && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#888784', marginTop: 1 }}>{opt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {q.type === 'multiselect' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {q.options?.map(opt => {
                const isSel = multiVal.includes(opt.value)
                return (
                  <div key={opt.value} onClick={() => { const cur = (answers[q.id] as string[] | undefined) || []; setAnswers(a => ({ ...a, [q.id]: cur.includes(opt.value) ? cur.filter(v => v !== opt.value) : [...cur, opt.value] })) }} style={{ padding: '12px 14px', border: `0.5px solid ${isSel ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, cursor: 'pointer', background: isSel ? 'rgba(116,37,227,0.04)' : '#fff', position: 'relative' as const }}>
                    <div style={{ position: 'absolute' as const, top: 10, right: 10, width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isSel ? '#7425e3' : '#e8e7e4'}`, background: isSel ? '#7425e3' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isSel && <span style={{ color: '#fff', fontSize: 11 }}>✓</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 3, paddingRight: 24 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#888784' }}>{opt.sub}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={goBack} disabled={step === 0} style={{ ...backBtn, opacity: step === 0 ? 0.3 : 1 }}>← Back</button>
          <button onClick={goNext} disabled={!canProceed} style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: canProceed ? '#0d0d0d' : '#e8e7e4', color: canProceed ? '#fff' : '#888784', border: 'none', cursor: canProceed ? 'pointer' : 'not-allowed' }}>Continue →</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', color: '#0d0d0d' }}>

      {/* Progress bar */}
      {step < 8 && (
        <div style={{ background: '#fff', padding: '0.75rem 2rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '0.5px solid #e8e7e4' }}>
          <div style={{ flex: 1, height: 4, background: '#e8e7e4', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e)', borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 12, color: '#888784', whiteSpace: 'nowrap' as const }}>
            {step < 7 ? `Step ${step + 1} of 7` : 'Almost done'}
          </div>
        </div>
      )}

      {/* Main content */}
      <div style={{ padding: '2.5rem 1.5rem' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          {/* Logo — always visible at top */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <a href="/" style={{ display: "block", textAlign: "center" }}>
              <img src="/logo.png" alt="ThemisIQ" style={{ height: 180, width: "auto", mixBlendMode: "multiply", display: "block", margin: "0 auto" }} />
            </a>
          </div>

          {/* Intro text — only on step 0 */}
          {step === 0 && (
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12 }}>Free · 3 minutes · Instant results</div>
              <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '0.75rem', color: '#0d0d0d' }}>
                Which compliance regulations<br />apply to <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>your company?</span>
              </h1>
              <p style={{ fontSize: 15, color: '#555553', fontWeight: 300, lineHeight: 1.7, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
                Answer 7 questions. Get a personalised Compliance Obligation Map — with specific deadlines, penalties, and the ThemisIQ module that addresses each regulation.
              </p>
            </div>
          )}

          {renderContent()}

        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '11px 14px', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: '#fff', outline: 'none' }
const backBtn: React.CSSProperties = { fontSize: 13, fontWeight: 400, padding: '10px 20px', borderRadius: 8, background: 'none', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }
