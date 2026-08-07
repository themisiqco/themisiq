'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

// ─── Template Definitions ─────────────────────────────────────────────────────

const TEMPLATES: Record<string, { sections: Section[] }> = {

  // ── EcoVadis-style (full 38 questions) ──────────────────────────────────────
  ecovadis: {
    sections: [
      {
        id: 'environment', title: 'Environment', color: '#0F6E56', bg: '#E1F5EE',
        desc: 'Energy, emissions, environmental management',
        questions: [
          { id: 'env_policy', type: 'radio', label: 'Does your company have a formal environmental policy?', options: ['Yes — board approved', 'Yes — management approved', 'In development', 'No'] },
          { id: 'env_iso14001', type: 'radio', label: 'Is your company certified to ISO 14001?', options: ['Yes — current certificate', 'In progress', 'No'] },
          { id: 'env_ghg_scope1', type: 'number', label: 'Scope 1 emissions (mt CO₂e)', hint: 'Direct emissions from owned/controlled sources. Enter 0 if not measured.' },
          { id: 'env_ghg_scope2', type: 'number', label: 'Scope 2 emissions (mt CO₂e)', hint: 'Indirect emissions from purchased electricity. Enter 0 if not measured.' },
          { id: 'env_ghg_scope3', type: 'number', label: 'Scope 3 emissions (mt CO₂e)', hint: 'Value chain emissions. Enter 0 if not measured.' },
          { id: 's3cat1_allocated', type: 'number', label: 'Emissions attributable to purchases by your customer (mt CO₂e)', hint: 'Of your total footprint above, the share attributable to the goods/services THIS customer purchased from you this reporting year. This is what feeds their Scope 3 Category 1. Leave blank if you cannot allocate it.' },
          { id: 's3cat1_method', type: 'text', label: 'How did you allocate that figure?', hint: 'e.g. by share of revenue, by units shipped, or by mass. Helps your customer document the method for their auditor.' },
          { id: 's3cat1_quality', type: 'radio', label: 'Basis of the attributable figure', options: ['Measured / supplier-specific', 'Estimated', 'Not provided'] },
          { id: 'env_ghg_year', type: 'text', label: 'Emissions reporting year', hint: 'e.g. 2024' },
          { id: 'env_renewable', type: 'radio', label: 'Do you use renewable energy?', options: ['Yes — more than 50%', 'Yes — less than 50%', 'In progress', 'No'] },
          { id: 'env_target', type: 'radio', label: 'Has your company set a carbon reduction target?', options: ['Yes — science-based (SBTi)', 'Yes — internal target', 'In development', 'No'] },
          { id: 'env_reporting', type: 'checkbox', label: 'Do you report to any environmental framework?', options: ['CDP', 'GRI', 'ESRS/CSRD', 'EcoVadis', 'Other', 'None'] },
        ],
      },
      {
        id: 'labour', title: 'Labour & Human Rights', color: '#7425e3', bg: '#EDE9FE',
        desc: 'Health & safety, working conditions, human rights',
        questions: [
          { id: 'lab_policy', type: 'radio', label: 'Does your company have a formal health & safety policy?', options: ['Yes — board approved', 'Yes — management approved', 'In development', 'No'] },
          { id: 'lab_iso45001', type: 'radio', label: 'Is your company certified to ISO 45001?', options: ['Yes — current certificate', 'In progress', 'No'] },
          { id: 'lab_ltifr', type: 'number', label: 'Lost Time Injury Frequency Rate (LTIFR)', hint: 'Injuries per million hours worked. Enter 0 if none.' },
          { id: 'lab_fatalities', type: 'number', label: 'Work-related fatalities in reporting year', hint: 'Enter 0 if none.' },
          { id: 'lab_hours', type: 'radio', label: 'Do all workers comply with maximum working hour regulations?', options: ['Yes — always', 'Mostly — occasional exceptions', 'No', 'Unknown'] },
          { id: 'lab_wages', type: 'radio', label: 'Do all workers receive at least the legal minimum wage?', options: ['Yes — all workers', 'Yes — direct employees only', 'No', 'Unknown'] },
          { id: 'lab_freedom', type: 'radio', label: 'Do workers have freedom of association rights?', options: ['Yes — fully respected', 'Partially', 'No', 'Unknown'] },
          { id: 'lab_forced', type: 'radio', label: 'Has your company conducted a forced labour risk assessment?', options: ['Yes — documented', 'Informal assessment', 'No'] },
          { id: 'lab_child', type: 'radio', label: 'Have there been any child labour incidents in the past 3 years?', options: ['No incidents', 'Yes — remediated', 'Yes — unresolved', 'Unknown'] },
          { id: 'lab_hrdd', type: 'radio', label: 'Has your company conducted a human rights due diligence (HRDD) assessment?', options: ['Yes — documented', 'In progress', 'No'] },
        ],
      },
      {
        id: 'ethics', title: 'Ethics', color: '#0C447C', bg: '#E6F1FB',
        desc: 'Anti-corruption, whistleblowing, data privacy',
        questions: [
          { id: 'eth_anticorruption', type: 'radio', label: 'Does your company have a formal anti-corruption policy?', options: ['Yes — board approved', 'Yes — management approved', 'In development', 'No'] },
          { id: 'eth_training', type: 'radio', label: 'Do employees receive anti-corruption training?', options: ['Yes — mandatory annual', 'Yes — on joining', 'Ad hoc', 'No'] },
          { id: 'eth_incidents', type: 'radio', label: 'Have there been any corruption or bribery incidents in the past 3 years?', options: ['No incidents', 'Yes — investigated and resolved', 'Yes — unresolved', 'Unknown'] },
          { id: 'eth_whistleblower', type: 'radio', label: 'Does your company have a whistleblower/grievance mechanism?', options: ['Yes — anonymous channel available', 'Yes — named reporting only', 'No'] },
          { id: 'eth_conflicts', type: 'radio', label: 'Does your company have a conflicts of interest policy?', options: ['Yes — documented', 'Informal', 'No'] },
          { id: 'eth_gdpr', type: 'radio', label: 'Is your company GDPR compliant (if processing EU personal data)?', options: ['Yes — fully compliant', 'Partially compliant', 'Not applicable', 'No'] },
          { id: 'eth_sanctions', type: 'radio', label: 'Has your company been subject to regulatory sanctions in the past 3 years?', options: ['No', 'Yes — resolved', 'Yes — ongoing'] },
        ],
      },
      {
        id: 'procurement', title: 'Sustainable Procurement', color: '#ba7517', bg: '#FEF3E2',
        desc: 'Your own supply chain sustainability practices',
        questions: [
          { id: 'proc_code', type: 'radio', label: 'Do you have a supplier code of conduct?', options: ['Yes — signed by suppliers', 'Yes — not yet enforced', 'In development', 'No'] },
          { id: 'proc_assess', type: 'radio', label: 'Do you assess your own suppliers for sustainability risks?', options: ['Yes — all key suppliers', 'Yes — selected suppliers', 'Occasionally', 'No'] },
          { id: 'proc_audit', type: 'radio', label: 'Do you conduct or require third-party audits of suppliers?', options: ['Yes — regular audits', 'Yes — occasional', 'No'] },
          { id: 'proc_traceability', type: 'radio', label: 'Can you trace your key raw materials to source?', options: ['Yes — tier 1 and beyond', 'Yes — tier 1 only', 'Partially', 'No'] },
          { id: 'proc_ecovadis', type: 'radio', label: 'Does your company have an EcoVadis rating?', options: ['Yes — Gold', 'Yes — Silver', 'Yes — Bronze', 'Yes — rated (no medal)', 'No rating'] },
          { id: 'proc_scope3cat1', type: 'radio', label: 'Do you collect primary emissions data from your own suppliers?', options: ['Yes — most suppliers', 'Yes — key suppliers only', 'No — spend-based only', 'No measurement'] },
        ],
      },
    ],
  },

  // ── Scope 3 Cat.1 (8 questions) ─────────────────────────────────────────────
  scope3: {
    sections: [
      {
        id: 'emissions', title: 'GHG Emissions Data', color: '#0F6E56', bg: '#E1F5EE',
        desc: 'Greenhouse gas emissions, energy use and reduction targets',
        questions: [
          { id: 's3_scope1', type: 'number', label: 'Scope 1 emissions (mt CO₂e)', hint: 'Direct emissions from owned/controlled sources. Enter 0 if not yet measured.' },
          { id: 's3_scope2_lb', type: 'number', label: 'Scope 2 emissions — location-based (mt CO₂e)', hint: 'Based on grid average emission factors.' },
          { id: 's3_scope2_mb', type: 'number', label: 'Scope 2 emissions — market-based (mt CO₂e)', hint: 'Based on contractual instruments. Enter 0 if not available.' },
          { id: 's3_scope3', type: 'number', label: 'Scope 3 emissions — total (mt CO₂e)', hint: 'All value chain emissions combined. Enter 0 if not yet measured.' },
          { id: 's3cat1_allocated', type: 'number', label: 'Emissions attributable to purchases by your customer (mt CO₂e)', hint: 'Of your total footprint above, the share attributable to the goods/services THIS customer purchased from you this reporting year. This is what feeds their Scope 3 Category 1. Leave blank if you cannot allocate it.' },
          { id: 's3cat1_method', type: 'text', label: 'How did you allocate that figure?', hint: 'e.g. by share of revenue, by units shipped, or by mass. Helps your customer document the method for their auditor.' },
          { id: 's3cat1_quality', type: 'radio', label: 'Basis of the attributable figure', options: ['Measured / supplier-specific', 'Estimated', 'Not provided'] },
          { id: 's3_year', type: 'text', label: 'Reporting year', hint: 'e.g. 2024' },
          { id: 's3_boundary', type: 'radio', label: 'What organisational boundary do you use?', options: ['Operational control', 'Financial control', 'Equity share', 'Not defined'] },
          { id: 's3_renewable', type: 'radio', label: 'What percentage of your electricity comes from renewable sources?', options: ['100%', '75–99%', '50–74%', '25–49%', 'Less than 25%', 'None', 'Unknown'] },
          { id: 's3_target', type: 'radio', label: 'Has your company set a carbon reduction target?', options: ['Yes — science-based (SBTi committed)', 'Yes — SBTi approved', 'Yes — net zero target', 'Yes — internal reduction target', 'In development', 'No target'] },
          { id: 's3_assurance', type: 'radio', label: 'Are your emissions figures independently assured?', options: ['Yes — limited assurance', 'Yes — reasonable assurance', 'No — internal only', 'No measurement'] },
        ],
      },
    ],
  },

  // ── Modern Slavery Act (12 questions) ───────────────────────────────────────
  modern_slavery: {
    sections: [
      {
        id: 'forced_labour', title: 'Forced & Compulsory Labour', color: '#B91C1C', bg: '#FCEBEB',
        desc: 'Forced labour, debt bondage and worker freedom',
        questions: [
          { id: 'ms_policy', type: 'radio', label: 'Does your company have a formal modern slavery or human trafficking policy?', options: ['Yes — publicly available', 'Yes — internal only', 'In development', 'No'] },
          { id: 'ms_risk_assess', type: 'radio', label: 'Has your company conducted a modern slavery risk assessment?', options: ['Yes — documented and reviewed annually', 'Yes — conducted once', 'In progress', 'No'] },
          { id: 'ms_forced', type: 'radio', label: 'Has your company identified any forced labour in its operations or supply chain in the past 3 years?', options: ['No — confirmed through assessment', 'No — not assessed', 'Yes — remediated', 'Yes — unresolved'] },
          { id: 'ms_recruitment', type: 'radio', label: 'Does your company prohibit the use of recruitment fees charged to workers?', options: ['Yes — policy in place and enforced', 'Yes — policy in place', 'No explicit prohibition', 'No'] },
        ],
      },
      {
        id: 'child_labour', title: 'Child Labour', color: '#ba7517', bg: '#FEF3E2',
        desc: 'Child labour prevention and minimum age compliance',
        questions: [
          { id: 'ms_child_policy', type: 'radio', label: 'Does your company have a minimum age policy aligned to ILO Convention 138?', options: ['Yes — documented and enforced', 'Yes — informal', 'No'] },
          { id: 'ms_child_incidents', type: 'radio', label: 'Have there been any child labour incidents in your operations or supply chain in the past 3 years?', options: ['No incidents', 'Yes — investigated and remediated', 'Yes — unresolved', 'Unknown'] },
        ],
      },
      {
        id: 'due_diligence', title: 'Due Diligence & Remediation', color: '#0C447C', bg: '#E6F1FB',
        desc: 'Supply chain due diligence and grievance mechanisms',
        questions: [
          { id: 'ms_dd_suppliers', type: 'radio', label: 'Do you conduct modern slavery due diligence on your suppliers?', options: ['Yes — all tier 1 suppliers', 'Yes — high-risk suppliers only', 'Occasionally', 'No'] },
          { id: 'ms_grievance', type: 'radio', label: 'Does your company have a grievance mechanism accessible to workers in your supply chain?', options: ['Yes — anonymous and accessible', 'Yes — limited access', 'No'] },
          { id: 'ms_training', type: 'radio', label: 'Do relevant employees receive training on modern slavery recognition?', options: ['Yes — mandatory annual', 'Yes — on induction', 'Ad hoc', 'No'] },
          { id: 'ms_statement', type: 'radio', label: 'Does your company publish a Modern Slavery Act transparency statement?', options: ['Yes — annual, board approved', 'Yes — published but not annual', 'No — below threshold', 'No'] },
          { id: 'ms_kpis', type: 'radio', label: 'Does your company track KPIs to measure effectiveness of modern slavery actions?', options: ['Yes — reported publicly', 'Yes — internal only', 'In development', 'No'] },
          { id: 'ms_incidents_reported', type: 'number', label: 'Number of modern slavery concerns reported via grievance mechanism in past year', hint: 'Enter 0 if none reported.' },
        ],
      },
    ],
  },

  // ── CS3D HRDD (15 questions) ─────────────────────────────────────────────────
  cs3d: {
    sections: [
      {
        id: 'hrdd_governance', title: 'HRDD Governance', color: '#0C447C', bg: '#E6F1FB',
        desc: 'Human rights due diligence governance and policy',
        questions: [
          { id: 'cs_policy', type: 'radio', label: 'Does your company have a human rights policy aligned to the UN Guiding Principles (UNGPs)?', options: ['Yes — publicly available, board approved', 'Yes — internal policy', 'In development', 'No'] },
          { id: 'cs_governance', type: 'radio', label: 'Is board or senior management accountable for human rights due diligence?', options: ['Yes — board level', 'Yes — senior management', 'Delegated to sustainability team', 'No formal accountability'] },
          { id: 'cs_scope', type: 'radio', label: 'Does your HRDD programme cover your full value chain (upstream and downstream)?', options: ['Yes — full value chain', 'Yes — direct suppliers only', 'Operations only', 'No HRDD programme'] },
        ],
      },
      {
        id: 'hrdd_identification', title: 'Risk Identification', color: '#7425e3', bg: '#EDE9FE',
        desc: 'Identification and assessment of human rights risks',
        questions: [
          { id: 'cs_risk_assess', type: 'radio', label: 'Does your company conduct human rights risk assessments?', options: ['Yes — annual, documented', 'Yes — ad hoc', 'In progress', 'No'] },
          { id: 'cs_risk_method', type: 'radio', label: 'What methodology do you use for human rights risk assessment?', options: ['UNGP-aligned framework', 'Industry sector standard', 'Internal methodology', 'Third-party assessment', 'None'] },
          { id: 'cs_salient', type: 'radio', label: 'Has your company identified its salient human rights issues?', options: ['Yes — publicly disclosed', 'Yes — internal only', 'In progress', 'No'] },
          { id: 'cs_high_risk', type: 'radio', label: 'Have you identified high-risk geographies or sectors in your supply chain?', options: ['Yes — documented and monitored', 'Yes — identified informally', 'No'] },
        ],
      },
      {
        id: 'hrdd_action', title: 'Prevention & Remediation', color: '#0F6E56', bg: '#E1F5EE',
        desc: 'Actions taken to prevent and remediate human rights harms',
        questions: [
          { id: 'cs_prevention', type: 'radio', label: 'Does your company have action plans to prevent or mitigate identified human rights risks?', options: ['Yes — documented with timelines', 'Yes — informal plans', 'In development', 'No'] },
          { id: 'cs_supplier_code', type: 'radio', label: 'Does your supplier code of conduct include human rights requirements aligned to ILO core conventions?', options: ['Yes — fully aligned', 'Partially aligned', 'Code exists but not HRDD-focused', 'No code'] },
          { id: 'cs_grievance', type: 'radio', label: 'Does your company operate a grievance mechanism accessible to affected stakeholders?', options: ['Yes — operational, anonymous', 'Yes — limited access', 'In development', 'No'] },
          { id: 'cs_remediation', type: 'radio', label: 'Has your company provided or facilitated remediation for any human rights harm in the past 3 years?', options: ['Yes — documented', 'Yes — informal', 'No harm identified', 'No — harm identified but not remediated'] },
        ],
      },
      {
        id: 'hrdd_monitoring', title: 'Monitoring & Disclosure', color: '#ba7517', bg: '#FEF3E2',
        desc: 'Monitoring effectiveness and public disclosure',
        questions: [
          { id: 'cs_monitoring', type: 'radio', label: 'Does your company monitor the effectiveness of its HRDD measures?', options: ['Yes — KPIs tracked and reported', 'Yes — internal monitoring', 'Ad hoc', 'No'] },
          { id: 'cs_disclosure', type: 'radio', label: 'Does your company publicly disclose its HRDD approach and findings?', options: ['Yes — annual report or dedicated statement', 'Yes — on request', 'No'] },
          { id: 'cs_stakeholder', type: 'radio', label: 'Does your company engage with affected stakeholders (workers, communities) in its HRDD process?', options: ['Yes — formal engagement process', 'Yes — ad hoc', 'No'] },
          { id: 'cs_incidents', type: 'number', label: 'Number of human rights incidents identified in your value chain in the past year', hint: 'Enter 0 if none identified.' },
        ],
      },
    ],
  },

  // ── Custom (buyer-defined) ───────────────────────────────────────────────────
  custom: {
    sections: [
      {
        id: 'custom', title: 'Sustainability Questionnaire', color: '#7425e3', bg: '#EDE9FE',
        desc: 'Questions defined by the requesting organisation',
        questions: [
          { id: 'custom_overview', type: 'textarea', label: 'Please provide an overview of your company\'s sustainability approach and key initiatives', hint: 'Include any certifications, frameworks followed, or notable achievements.' },
          { id: 'custom_env', type: 'textarea', label: 'Describe your environmental management practices and targets', hint: 'Include GHG emissions data if available, energy use, waste management and any environmental certifications.' },
          { id: 'custom_social', type: 'textarea', label: 'Describe your approach to labour rights, worker welfare and human rights', hint: 'Include health & safety performance, working conditions, freedom of association and any relevant policies.' },
          { id: 'custom_ethics', type: 'textarea', label: 'Describe your ethics and governance practices', hint: 'Include anti-corruption, whistleblower mechanisms, conflicts of interest and any regulatory compliance.' },
          { id: 'custom_supply', type: 'textarea', label: 'Describe how you manage sustainability in your own supply chain', hint: 'Include supplier assessments, codes of conduct, audits and traceability.' },
          { id: 'custom_certifications', type: 'text', label: 'List any relevant sustainability certifications your company holds', hint: 'e.g. ISO 14001, ISO 45001, B Corp, EcoVadis, FSC, etc.' },
          { id: 'custom_contact', type: 'text', label: 'Name and email of your sustainability contact for follow-up questions', hint: 'e.g. Jane Smith, jane@company.com' },
        ],
      },
    ],
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string
  type: string
  label: string
  hint?: string
  options?: string[]
}

interface Section {
  id: string
  title: string
  color: string
  bg: string
  desc: string
  questions: Question[]
}

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

export default function SupplierQuestionnaire() {
  const params = useParams()
  const token = params.token as string

  const [campaignSupplier, setCampaignSupplier] = useState<any>(null)
  const [campaign, setCampaign] = useState<any>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeSection, setActiveSection] = useState(0)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    loadSupplier()
  }, [token])

  const loadSupplier = async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('portal_get', { p_token: token })

    if (error || !data) { setNotFound(true); setLoading(false); return }

    const cs = data.supplier
    const camp = data.campaign
    setCampaignSupplier(cs)
    setCampaign(camp)

    // Load template
    const template = camp.questionnaire_template || 'ecovadis'
    setSections(TEMPLATES[template]?.sections || TEMPLATES.ecovadis.sections)

    if (cs.status === 'completed') setSubmitted(true)

    // Existing responses (portal_get also bumps 'invited' -> 'in_progress' server-side)
    const existing = data.responses as { question_id: string; response: string }[] | null
    if (existing) {
      const resp: Record<string, string> = {}
      existing.forEach((r) => { resp[r.question_id] = r.response })
      setResponses(resp)
    }

    setLoading(false)
  }

  const saveResponse = async (questionId: string, value: string) => {
    setResponses(prev => ({ ...prev, [questionId]: value }))
    if (!campaignSupplier) return
    const sectionId = sections.find(s => s.questions.some(q => q.id === questionId))?.id || ''
    await supabase.rpc('portal_save_response', {
      p_token: token,
      p_section: sectionId,
      p_question_id: questionId,
      p_response: value,
    })
  }

  const submit = async () => {
    setSaving(true)
    await supabase.rpc('portal_submit', { p_token: token })
    setSaving(false)
    setSubmitted(true)
  }

  const totalQuestions = sections.reduce((s, sec) => s + sec.questions.length, 0)
  const answeredQuestions = Object.keys(responses).length
  const pct = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 100, resize: 'vertical' as const, fontFamily: 'inherit', lineHeight: 1.6 }

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: '#888784' }}>Loading your questionnaire...</div>
    </div>
  )

  if (notFound) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '3rem', textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>Link not found</div>
        <div style={{ fontSize: 14, color: '#888784', lineHeight: 1.6 }}>This questionnaire link is invalid or has expired. Please contact the company who sent you this link.</div>
      </div>
    </div>
  )

  if (submitted) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '3rem', textAlign: 'center', maxWidth: 480 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E1F5EE', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: 28 }}>✓</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', color: '#0d0d0d', marginBottom: 8 }}>Thank you!</div>
        <div style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, marginBottom: 8 }}>
          Your sustainability questionnaire for <strong>{campaign?.name}</strong> has been submitted successfully.
        </div>
        <div style={{ fontSize: 13, color: '#888784' }}>{campaignSupplier?.supplier_name} · {campaignSupplier?.supplier_email}</div>
        <div style={{ marginTop: 24, padding: '1rem', background: '#f8f7f5', borderRadius: 10, fontSize: 12, color: '#888784' }}>
          Powered by <a href="https://www.themisiq.co" style={{ color: '#7425e3', textDecoration: 'none' }}>ThemisIQ</a> · www.themisiq.co
        </div>
      </div>
    </div>
  )

  const currentSection = sections[activeSection]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ background: '#0d0d0d', padding: '1.25rem 2rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>Supplier Sustainability Questionnaire</div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{campaign?.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>Progress</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#64fe3e' }}>{pct}%</div>
          </div>
        </div>
        <div style={{ maxWidth: 760, margin: '8px auto 0' }}>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: GRAD, borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
        </div>
      </div>

      {/* Supplier info */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0.75rem 2rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', fontSize: 13, color: '#888784' }}>
          Completing as: <strong style={{ color: '#0d0d0d' }}>{campaignSupplier?.supplier_name}</strong>
          {campaignSupplier?.contact_name && ` · ${campaignSupplier.contact_name}`}
          {campaign?.deadline && ` · Deadline: ${new Date(campaign.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem' }}>

        {/* Section tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${sections.length}, 1fr)`, gap: 8, marginBottom: 24 }}>
          {sections.map((sec, i) => {
            const secAnswered = sec.questions.filter(q => responses[q.id]).length
            const isActive = activeSection === i
            return (
              <button key={sec.id} onClick={() => setActiveSection(i)} style={{ padding: '0.75rem', borderRadius: 10, border: `1.5px solid ${isActive ? sec.color : '#e8e7e4'}`, background: isActive ? sec.bg : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? sec.color : '#0d0d0d', marginBottom: 3 }}>{sec.title}</div>
                <div style={{ fontSize: 10, color: '#888784' }}>{secAnswered}/{sec.questions.length} answered</div>
              </button>
            )
          })}
        </div>

        {/* Questions */}
        {currentSection && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem', marginBottom: 16 }}>
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '0.5px solid #e8e7e4' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: currentSection.color, marginBottom: 4 }}>Section {activeSection + 1} of {sections.length}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{currentSection.title}</div>
              <div style={{ fontSize: 13, color: '#888784' }}>{currentSection.desc}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {currentSection.questions.map((q, qi) => (
                <div key={q.id}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4, lineHeight: 1.5 }}>
                    {qi + 1}. {q.label}
                    {responses[q.id] && <span style={{ marginLeft: 8, fontSize: 10, color: '#0F6E56', fontWeight: 700 }}>✓</span>}
                  </div>
                  {q.hint && <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>{q.hint}</div>}

                  {q.type === 'radio' && q.options && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {q.options.map((opt: string) => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: `1px solid ${responses[q.id] === opt ? currentSection.color : '#e8e7e4'}`, background: responses[q.id] === opt ? currentSection.bg : '#fff', transition: 'all 0.1s' }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${responses[q.id] === opt ? currentSection.color : '#e8e7e4'}`, background: responses[q.id] === opt ? currentSection.color : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {responses[q.id] === opt && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                          </div>
                          <input type="radio" name={q.id} value={opt} checked={responses[q.id] === opt} onChange={() => saveResponse(q.id, opt)} style={{ display: 'none' }} />
                          <span style={{ fontSize: 13, color: '#0d0d0d' }}>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Multi-select. Stored as one comma-space-joined string in q.options order,
                      so a single tick is byte-identical to the old scalar answer and existing
                      rows keep reading correctly without a migration. */}
                  {q.type === 'checkbox' && q.options && (() => {
                    const opts = q.options
                    const selected = (responses[q.id] || '').split(',').map(s => s.trim()).filter(Boolean)
                    const toggle = (opt: string) => {
                      // 'None' is exclusive: it clears the rest, and any other tick clears it.
                      const next = selected.includes(opt)
                        ? selected.filter(s => s !== opt)
                        : opt === 'None'
                          ? ['None']
                          : [...selected.filter(s => s !== 'None'), opt]
                      // Filter q.options rather than join `next` — order is the question's, not the click order.
                      saveResponse(q.id, opts.filter(o => next.includes(o)).join(', '))
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {opts.map((opt: string) => (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: `1px solid ${selected.includes(opt) ? currentSection.color : '#e8e7e4'}`, background: selected.includes(opt) ? currentSection.bg : '#fff', transition: 'all 0.1s' }}>
                            <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selected.includes(opt) ? currentSection.color : '#e8e7e4'}`, background: selected.includes(opt) ? currentSection.color : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {selected.includes(opt) && <span style={{ fontSize: 10, lineHeight: 1, color: '#fff', fontWeight: 700 }}>✓</span>}
                            </div>
                            <input type="checkbox" name={q.id} value={opt} checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ display: 'none' }} />
                            <span style={{ fontSize: 13, color: '#0d0d0d' }}>{opt}</span>
                          </label>
                        ))}
                      </div>
                    )
                  })()}

                  {q.type === 'number' && (
                    <input style={{ ...inputStyle, maxWidth: 200 }} type="number" value={responses[q.id] || ''} onChange={e => saveResponse(q.id, e.target.value)} placeholder="0" min="0" />
                  )}

                  {q.type === 'text' && (
                    <input style={{ ...inputStyle, maxWidth: 400 }} type="text" value={responses[q.id] || ''} onChange={e => saveResponse(q.id, e.target.value)} placeholder="Enter value" />
                  )}

                  {q.type === 'textarea' && (
                    <textarea style={textareaStyle} value={responses[q.id] || ''} onChange={e => saveResponse(q.id, e.target.value)} placeholder="Enter your response here..." />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => setActiveSection(s => Math.max(0, s - 1))} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: activeSection === 0 ? 'not-allowed' : 'pointer', opacity: activeSection === 0 ? 0.4 : 1 }}>← Previous</button>

          {activeSection < sections.length - 1 ? (
            <button onClick={() => setActiveSection(s => s + 1)} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
              Next section →
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              {pct < 100 && <div style={{ fontSize: 11, color: '#888784' }}>{totalQuestions - answeredQuestions} questions remaining — you can submit with partial responses</div>}
              <button onClick={submit} disabled={saving} style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Submitting...' : `Submit questionnaire (${pct}% complete)`}
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
          Your responses are saved automatically as you go. You can return to this link to continue or update your responses.
          <br />Powered by <a href="https://www.themisiq.co" style={{ color: '#7425e3', textDecoration: 'none' }}>ThemisIQ</a>
        </div>
      </div>
    </div>
  )
}
