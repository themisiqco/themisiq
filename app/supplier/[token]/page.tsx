'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

// ─── Questionnaire Definition ─────────────────────────────────────────────────

const SECTIONS = [
  {
    id: 'environment',
    title: 'Environment',
    desc: 'Energy, emissions, environmental management',
    color: '#0F6E56',
    bg: '#E1F5EE',
    questions: [
      { id: 'env_policy', type: 'radio', label: 'Does your company have a formal environmental policy?', options: ['Yes — board approved', 'Yes — management approved', 'In development', 'No'] },
      { id: 'env_iso14001', type: 'radio', label: 'Is your company certified to ISO 14001?', options: ['Yes — current certificate', 'In progress', 'No'] },
      { id: 'env_ghg_scope1', type: 'number', label: 'Scope 1 emissions (mt CO₂e)', hint: 'Direct emissions from owned/controlled sources. Enter 0 if not measured.' },
      { id: 'env_ghg_scope2', type: 'number', label: 'Scope 2 emissions (mt CO₂e)', hint: 'Indirect emissions from purchased electricity. Enter 0 if not measured.' },
      { id: 'env_ghg_scope3', type: 'number', label: 'Scope 3 emissions (mt CO₂e)', hint: 'Value chain emissions. Enter 0 if not measured.' },
      { id: 'env_ghg_year', type: 'text', label: 'Emissions reporting year', hint: 'e.g. 2024' },
      { id: 'env_renewable', type: 'radio', label: 'Do you use renewable energy?', options: ['Yes — more than 50%', 'Yes — less than 50%', 'In progress', 'No'] },
      { id: 'env_target', type: 'radio', label: 'Has your company set a carbon reduction target?', options: ['Yes — science-based (SBTi)', 'Yes — internal target', 'In development', 'No'] },
      { id: 'env_reporting', type: 'radio', label: 'Do you report to any environmental framework?', options: ['CDP', 'GRI', 'ESRS/CSRD', 'EcoVadis', 'Other', 'None'] },
    ],
  },
  {
    id: 'labour',
    title: 'Labour & Human Rights',
    desc: 'Health & safety, working conditions, human rights',
    color: '#7425e3',
    bg: '#EDE9FE',
    questions: [
      { id: 'lab_policy', type: 'radio', label: 'Does your company have a formal health & safety policy?', options: ['Yes — board approved', 'Yes — management approved', 'In development', 'No'] },
      { id: 'lab_iso45001', type: 'radio', label: 'Is your company certified to ISO 45001?', options: ['Yes — current certificate', 'In progress', 'No'] },
      { id: 'lab_ltifr', type: 'number', label: 'Lost Time Injury Frequency Rate (LTIFR)', hint: 'Injuries per million hours worked. Enter 0 if none.' },
      { id: 'lab_fatalities', type: 'number', label: 'Work-related fatalities in reporting year', hint: 'Enter 0 if none.' },
      { id: 'lab_hours', type: 'radio', label: 'Do all workers comply with maximum working hour regulations?', options: ['Yes — always', 'Mostly — occasional exceptions', 'No', 'Unknown'] },
      { id: 'lab_wages', type: 'radio', label: 'Do all workers receive at least the legal minimum wage?', options: ['Yes — all workers', 'Yes — direct employees only', 'No', 'Unknown'] },
      { id: 'lab_freedom', type: 'radio', label: 'Do workers have freedom of association rights?', options: ['Yes — fully respected', 'Partially', 'No', 'Unknown'] },
      { id: 'lab_forced', type: 'radio', label: 'Has your company conducted a forced labour risk assessment?', options: ['Yes — documented', 'Informal assessment', 'No'] },
      { id: 'lab_child', type: 'radio', label: 'Has your company had any child labour incidents in the past 3 years?', options: ['No incidents', 'Yes — remediated', 'Yes — unresolved', 'Unknown'] },
      { id: 'lab_hrdd', type: 'radio', label: 'Has your company conducted a human rights due diligence (HRDD) assessment?', options: ['Yes — documented', 'In progress', 'No'] },
    ],
  },
  {
    id: 'ethics',
    title: 'Ethics',
    desc: 'Anti-corruption, whistleblowing, data privacy',
    color: '#0C447C',
    bg: '#E6F1FB',
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
    id: 'procurement',
    title: 'Sustainable Procurement',
    desc: 'Your own supply chain sustainability practices',
    color: '#ba7517',
    bg: '#FEF3E2',
    questions: [
      { id: 'proc_code', type: 'radio', label: 'Do you have a supplier code of conduct?', options: ['Yes — signed by suppliers', 'Yes — not yet enforced', 'In development', 'No'] },
      { id: 'proc_assess', type: 'radio', label: 'Do you assess your own suppliers for sustainability risks?', options: ['Yes — all key suppliers', 'Yes — selected suppliers', 'Occasionally', 'No'] },
      { id: 'proc_audit', type: 'radio', label: 'Do you conduct or require third-party audits of suppliers?', options: ['Yes — regular audits', 'Yes — occasional', 'No'] },
      { id: 'proc_traceability', type: 'radio', label: 'Can you trace your key raw materials to source?', options: ['Yes — tier 1 and beyond', 'Yes — tier 1 only', 'Partially', 'No'] },
      { id: 'proc_ecovadis', type: 'radio', label: 'Does your company have an EcoVadis rating?', options: ['Yes — Gold', 'Yes — Silver', 'Yes — Bronze', 'Yes — rated (no medal)', 'No rating'] },
      { id: 'proc_scope3cat1', type: 'radio', label: 'Do you collect primary emissions data from your own suppliers?', options: ['Yes — most suppliers', 'Yes — key suppliers only', 'No — spend-based only', 'No measurement'] },
    ],
  },
]

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

export default function SupplierQuestionnaire() {
  const params = useParams()
  const token = params.token as string

  const [campaignSupplier, setCampaignSupplier] = useState<any>(null)
  const [campaign, setCampaign] = useState<any>(null)
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
    const { data: cs } = await supabase
      .from('campaign_suppliers')
      .select('*, supplier_campaigns(*)')
      .eq('token', token)
      .single()

    if (!cs) { setNotFound(true); setLoading(false); return }

    setCampaignSupplier(cs)
    setCampaign(cs.supplier_campaigns)

    if (cs.status === 'completed') setSubmitted(true)

    // Load existing responses
    const { data: existing } = await supabase
      .from('supplier_responses')
      .select('*')
      .eq('campaign_supplier_id', cs.id)

    if (existing) {
      const resp: Record<string, string> = {}
      existing.forEach((r: any) => { resp[r.question_id] = r.response })
      setResponses(resp)
    }

    // Mark as in_progress if invited
    if (cs.status === 'invited') {
      await supabase.from('campaign_suppliers').update({ status: 'in_progress' }).eq('id', cs.id)
    }

    setLoading(false)
  }

  const saveResponse = async (questionId: string, value: string) => {
    setResponses(prev => ({ ...prev, [questionId]: value }))
    if (!campaignSupplier) return
    await supabase.from('supplier_responses').upsert({
      campaign_supplier_id: campaignSupplier.id,
      section: SECTIONS.find(s => s.questions.some(q => q.id === questionId))?.id || '',
      question_id: questionId,
      response: value,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'campaign_supplier_id,question_id' })
  }

  const submit = async () => {
    setSaving(true)
    await supabase.from('campaign_suppliers').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', campaignSupplier.id)
    setSaving(false)
    setSubmitted(true)
  }

  const totalQuestions = SECTIONS.reduce((s, sec) => s + sec.questions.length, 0)
  const answeredQuestions = Object.keys(responses).length
  const pct = Math.round((answeredQuestions / totalQuestions) * 100)

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }

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
        <div style={{ fontSize: 13, color: '#888784', lineHeight: 1.6 }}>
          {campaignSupplier?.supplier_name} · {campaignSupplier?.supplier_email}
        </div>
        <div style={{ marginTop: 24, padding: '1rem', background: '#f8f7f5', borderRadius: 10, fontSize: 12, color: '#888784', lineHeight: 1.6 }}>
          Powered by ThemisIQ · www.themisiq.co
        </div>
      </div>
    </div>
  )

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
          {SECTIONS.map((sec, i) => {
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
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem', marginBottom: 16 }}>
          <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '0.5px solid #e8e7e4' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: SECTIONS[activeSection].color, marginBottom: 4 }}>Section {activeSection + 1} of {SECTIONS.length}</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{SECTIONS[activeSection].title}</div>
            <div style={{ fontSize: 13, color: '#888784' }}>{SECTIONS[activeSection].desc}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {SECTIONS[activeSection].questions.map((q, qi) => (
              <div key={q.id}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4, lineHeight: 1.5 }}>
                  {qi + 1}. {q.label}
                  {responses[q.id] && <span style={{ marginLeft: 8, fontSize: 10, color: '#0F6E56', fontWeight: 700 }}>✓</span>}
                </div>
                {(q as any).hint && <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>{(q as any).hint}</div>}

                {q.type === 'radio' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(q as any).options.map((opt: string) => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: `1px solid ${responses[q.id] === opt ? SECTIONS[activeSection].color : '#e8e7e4'}`, background: responses[q.id] === opt ? SECTIONS[activeSection].bg : '#fff', transition: 'all 0.1s' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${responses[q.id] === opt ? SECTIONS[activeSection].color : '#e8e7e4'}`, background: responses[q.id] === opt ? SECTIONS[activeSection].color : '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {responses[q.id] === opt && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <input type="radio" name={q.id} value={opt} checked={responses[q.id] === opt} onChange={() => saveResponse(q.id, opt)} style={{ display: 'none' }} />
                        <span style={{ fontSize: 13, color: '#0d0d0d' }}>{opt}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.type === 'number' && (
                  <input style={{ ...inputStyle, maxWidth: 200 }} type="number" value={responses[q.id] || ''} onChange={e => saveResponse(q.id, e.target.value)} placeholder="0" min="0" />
                )}

                {q.type === 'text' && (
                  <input style={{ ...inputStyle, maxWidth: 300 }} type="text" value={responses[q.id] || ''} onChange={e => saveResponse(q.id, e.target.value)} placeholder="Enter value" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={() => setActiveSection(s => Math.max(0, s - 1))} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: activeSection === 0 ? 'not-allowed' : 'pointer', opacity: activeSection === 0 ? 0.4 : 1 }}>← Previous</button>

          {activeSection < SECTIONS.length - 1 ? (
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
