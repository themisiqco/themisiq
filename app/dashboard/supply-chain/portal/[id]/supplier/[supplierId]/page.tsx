'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Nav from '../../../../../../components/Nav'
import { supabase } from '../../../../../../../lib/supabase'

const SECTIONS = [
  {
    id: 'environment', title: 'Environment', color: '#0F6E56', bg: '#E1F5EE',
    questions: [
      { id: 'env_policy', label: 'Formal environmental policy?' },
      { id: 'env_iso14001', label: 'ISO 14001 certified?' },
      { id: 'env_ghg_scope1', label: 'Scope 1 emissions (mt CO₂e)' },
      { id: 'env_ghg_scope2', label: 'Scope 2 emissions (mt CO₂e)' },
      { id: 'env_ghg_scope3', label: 'Scope 3 emissions (mt CO₂e)' },
      { id: 'env_ghg_year', label: 'Emissions reporting year' },
      { id: 'env_renewable', label: 'Renewable energy use?' },
      { id: 'env_target', label: 'Carbon reduction target?' },
      { id: 'env_reporting', label: 'Environmental framework reporting?' },
    ],
  },
  {
    id: 'labour', title: 'Labour & Human Rights', color: '#7425e3', bg: '#EDE9FE',
    questions: [
      { id: 'lab_policy', label: 'Health & safety policy?' },
      { id: 'lab_iso45001', label: 'ISO 45001 certified?' },
      { id: 'lab_ltifr', label: 'LTIFR (injuries per million hours)' },
      { id: 'lab_fatalities', label: 'Work-related fatalities' },
      { id: 'lab_hours', label: 'Working hours compliance?' },
      { id: 'lab_wages', label: 'Minimum wage compliance?' },
      { id: 'lab_freedom', label: 'Freedom of association?' },
      { id: 'lab_forced', label: 'Forced labour risk assessment?' },
      { id: 'lab_child', label: 'Child labour incidents?' },
      { id: 'lab_hrdd', label: 'Human rights due diligence?' },
    ],
  },
  {
    id: 'ethics', title: 'Ethics', color: '#0C447C', bg: '#E6F1FB',
    questions: [
      { id: 'eth_anticorruption', label: 'Anti-corruption policy?' },
      { id: 'eth_training', label: 'Anti-corruption training?' },
      { id: 'eth_incidents', label: 'Corruption incidents?' },
      { id: 'eth_whistleblower', label: 'Whistleblower mechanism?' },
      { id: 'eth_conflicts', label: 'Conflicts of interest policy?' },
      { id: 'eth_gdpr', label: 'GDPR compliance?' },
      { id: 'eth_sanctions', label: 'Regulatory sanctions?' },
    ],
  },
  {
    id: 'procurement', title: 'Sustainable Procurement', color: '#ba7517', bg: '#FEF3E2',
    questions: [
      { id: 'proc_code', label: 'Supplier code of conduct?' },
      { id: 'proc_assess', label: 'Supplier sustainability assessments?' },
      { id: 'proc_audit', label: 'Third-party supplier audits?' },
      { id: 'proc_traceability', label: 'Raw material traceability?' },
      { id: 'proc_ecovadis', label: 'EcoVadis rating?' },
      { id: 'proc_scope3cat1', label: 'Primary emissions data from suppliers?' },
    ],
  },
]

const POSITIVE_RESPONSES = ['yes', 'yes —', 'no incidents', 'fully', 'always', 'gold', 'silver', 'bronze']
const NEGATIVE_RESPONSES = ['no', 'none', 'unknown', 'yes — unresolved', 'yes — ongoing', 'not applicable']

const getResponseColor = (response: string): string => {
  const lower = response.toLowerCase()
  if (POSITIVE_RESPONSES.some(p => lower.startsWith(p))) return '#0F6E56'
  if (NEGATIVE_RESPONSES.some(n => lower === n || lower.startsWith(n))) return '#B91C1C'
  return '#ba7517'
}

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

export default function SupplierResponseViewer() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params.id as string
  const supplierId = params.supplierId as string

  const [supplier, setSupplier] = useState<any>(null)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState(0)

  useEffect(() => {
    loadData()
  }, [supplierId])

  const loadData = async () => {
    setLoading(true)
    const { data: sup } = await supabase
      .from('campaign_suppliers')
      .select('*')
      .eq('id', supplierId)
      .single()

    const { data: resps } = await supabase
      .from('supplier_responses')
      .select('*')
      .eq('campaign_supplier_id', supplierId)

    if (sup) setSupplier(sup)
    if (resps) {
      const map: Record<string, string> = {}
      resps.forEach((r: any) => { map[r.question_id] = r.response })
      setResponses(map)
    }
    setLoading(false)
  }

  const totalQuestions = SECTIONS.reduce((s, sec) => s + sec.questions.length, 0)
  const answeredQuestions = Object.keys(responses).length
  const pct = Math.round((answeredQuestions / totalQuestions) * 100)

  const exportCSV = () => {
    const rows = [
      ['ThemisIQ — Supplier Sustainability Response'],
      ['Supplier', supplier?.supplier_name],
      ['Email', supplier?.supplier_email],
      ['Status', supplier?.status],
      ['Completed', supplier?.completed_at ? new Date(supplier.completed_at).toLocaleDateString() : '—'],
      ['Completion', `${pct}%`],
      [''],
      ['Section', 'Question', 'Response'],
      ...SECTIONS.flatMap(sec =>
        sec.questions.map(q => [sec.title, q.label, responses[q.id] || 'Not answered'])
      ),
      [''],
      ['Generated by ThemisIQ · www.themisiq.co'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${supplier?.supplier_name}_SustainabilityResponse.csv`
    a.click()
  }

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: '4rem', color: '#888784' }}>Loading responses...</div>
    </div>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <button onClick={() => router.push(`/dashboard/supply-chain/portal/${campaignId}`)} style={{ fontSize: 12, color: '#888784', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Back to campaign</button>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{supplier?.supplier_name}</div>
              <div style={{ fontSize: 13, color: '#888784' }}>{supplier?.supplier_email}</div>
              {supplier?.contact_name && <div style={{ fontSize: 13, color: '#888784' }}>{supplier.contact_name}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: supplier?.status === 'completed' ? '#E1F5EE' : '#FEF3E2', color: supplier?.status === 'completed' ? '#0F6E56' : '#ba7517' }}>
                {supplier?.status === 'completed' ? '✓ Completed' : 'In progress'}
              </span>
              <button onClick={exportCSV} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
                ⬇ Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Completion summary */}
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', fontWeight: 400, color: pct >= 80 ? '#64fe3e' : pct >= 50 ? '#fde68a' : '#f87171', lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>complete</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: GRAD, borderRadius: 99 }} />
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              {answeredQuestions} of {totalQuestions} questions answered
              {supplier?.completed_at && ` · Submitted ${new Date(supplier.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </div>
          </div>
          {/* Section scores */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {SECTIONS.map(sec => {
              const secAnswered = sec.questions.filter(q => responses[q.id]).length
              const secPct = Math.round((secAnswered / sec.questions.length) * 100)
              return (
                <div key={sec.id} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: sec.color }}>{secPct}%</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{sec.title.split(' ')[0]}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Section tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {SECTIONS.map((sec, i) => {
            const secAnswered = sec.questions.filter(q => responses[q.id]).length
            const isActive = activeSection === i
            return (
              <button key={sec.id} onClick={() => setActiveSection(i)} style={{ padding: '0.75rem', borderRadius: 10, border: `1.5px solid ${isActive ? sec.color : '#e8e7e4'}`, background: isActive ? sec.bg : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? sec.color : '#0d0d0d', marginBottom: 3 }}>{sec.title}</div>
                <div style={{ fontSize: 10, color: '#888784' }}>{secAnswered}/{sec.questions.length} answered</div>
              </button>
            )
          })}
        </div>

        {/* Responses */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ background: SECTIONS[activeSection].bg, padding: '12px 20px', borderBottom: `2px solid ${SECTIONS[activeSection].color}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: SECTIONS[activeSection].color }}>{SECTIONS[activeSection].title}</div>
          </div>
          {SECTIONS[activeSection].questions.map((q, i) => {
            const response = responses[q.id]
            const responseColor = response ? getResponseColor(response) : '#888784'
            return (
              <div key={q.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '14px 20px', borderBottom: i < SECTIONS[activeSection].questions.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: '#555553', fontWeight: 400 }}>{q.label}</div>
                <div>
                  {response ? (
                    <span style={{ fontSize: 12, fontWeight: 500, color: responseColor, background: responseColor + '15', padding: '4px 10px', borderRadius: 99, border: `0.5px solid ${responseColor}33` }}>
                      {response}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Not answered</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
