'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { TEMPLATES, type Section } from '../../../lib/supply-chain/templates'

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
