'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '../../../components/Nav'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import PaywallCard from '../../../components/PaywallCard'

interface Campaign {
  id: string
  name: string
  description: string
  reporting_year: number
  status: 'draft' | 'active' | 'closed'
  deadline: string | null
  created_at: string
  questionnaire_template?: string
  supplier_count?: number
  completed_count?: number
}

const TEMPLATES = [
  { id: 'ecovadis', label: 'EcoVadis-style', desc: 'Full 38-question assessment — Environment, Labour, Ethics, Sustainable Procurement', color: '#7425e3' },
  { id: 'scope3', label: 'Scope 3 Cat.1', desc: '8 questions on GHG emissions, energy use and reduction targets', color: '#0F6E56' },
  { id: 'modern_slavery', label: 'Modern Slavery Act', desc: '12 questions on forced labour, child labour and working conditions', color: '#B91C1C' },
  { id: 'cs3d', label: 'CS3D HRDD', desc: '15 questions on human rights due diligence across the value chain', color: '#0C447C' },
  { id: 'custom', label: 'Custom questionnaire', desc: 'Define your own questions after creating the campaign', color: 'var(--color-module-climate)' },
]

const GRAD = 'var(--color-brand)'

export default function SupplierPortalDashboard() {
  const isPaid = useEntitlement('supply-chain')
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newCampaign, setNewCampaign] = useState({ name: '', description: '', reporting_year: 2024, deadline: '', questionnaire_template: 'ecovadis' })
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)
      loadCampaigns()
    })
  }, [])

  const loadCampaigns = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/campaigns', {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    const { data: camps } = await res.json()
    if (camps) {
      const enriched = await Promise.all(camps.map(async (c: any) => {
        const { count: total } = await supabase.from('campaign_suppliers').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id)
        const { count: completed } = await supabase.from('campaign_suppliers').select('*', { count: 'exact', head: true }).eq('campaign_id', c.id).eq('status', 'completed')
        return { ...c, supplier_count: total || 0, completed_count: completed || 0 }
      }))
      setCampaigns(enriched)
    }
    setLoading(false)
  }

  const createCampaign = async () => {
    if (!newCampaign.name || !user) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({
        name: newCampaign.name,
        description: newCampaign.description,
        reporting_year: newCampaign.reporting_year,
        deadline: newCampaign.deadline || null,
        questionnaire_template: newCampaign.questionnaire_template,
      }),
    })
    const { data } = await res.json()
    if (data) {
      setShowNew(false)
      setNewCampaign({ name: '', description: '', reporting_year: 2024, deadline: '', questionnaire_template: 'ecovadis' })
      router.push(`/dashboard/supply-chain/portal/${data.id}`)
    }
    setSaving(false)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }

  const statusColor = (s: string) => s === 'active' ? '#0F6E56' : s === 'closed' ? 'var(--color-ink-muted)' : 'var(--color-module-climate)'
  const statusBg = (s: string) => s === 'active' ? '#E1F5EE' : s === 'closed' ? '#f8f7f5' : '#FEF3E2'

  if (!isPaid) return <PaywallCard title="Unlock the Supply Chain module" body="The Supplier Portal is part of the Supply Chain module. Unlock it to create campaigns, invite suppliers, and review responses." href="/pricing?modules=supply" />
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 4 }}>Supply Chain & Scope 3</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d' }}>Supplier Portal</div>
          </div>
          <button onClick={() => setShowNew(true)} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>
            + New campaign
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* New campaign modal */}
        {showNew && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 480 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '1.5rem' }}>New supplier campaign</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Campaign name</label>
                  <input style={inputStyle} value={newCampaign.name} onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))} placeholder="e.g. FY2024 Supplier Sustainability Assessment" />
                </div>
                <div>
                  <label style={labelStyle}>Description (optional)</label>
                  <input style={inputStyle} value={newCampaign.description} onChange={e => setNewCampaign(p => ({ ...p, description: e.target.value }))} placeholder="Brief description for suppliers" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Reporting year</label>
                    <select style={inputStyle} value={newCampaign.reporting_year} onChange={e => setNewCampaign(p => ({ ...p, reporting_year: Number(e.target.value) }))}>
                      {[2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Response deadline</label>
                    <input style={inputStyle} type="date" value={newCampaign.deadline} onChange={e => setNewCampaign(p => ({ ...p, deadline: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Questionnaire template</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {TEMPLATES.map(t => (
                      <div key={t.id} onClick={() => setNewCampaign(p => ({ ...p, questionnaire_template: t.id }))} style={{ border: `1.5px solid ${newCampaign.questionnaire_template === t.id ? t.color : '#e8e7e4'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', background: newCampaign.questionnaire_template === t.id ? `color-mix(in srgb, ${t.color} 6%, transparent)` : '#f8f7f5', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${newCampaign.questionnaire_template === t.id ? t.color : '#e8e7e4'}`, background: newCampaign.questionnaire_template === t.id ? t.color : '#fff', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: newCampaign.questionnaire_template === t.id ? t.color : '#0d0d0d' }}>{t.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.4 }}>{t.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowNew(false)} style={{ fontSize: 13, padding: '9px 18px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: 'pointer' }}>Cancel</button>
                <button onClick={createCampaign} disabled={saving || !newCampaign.name} style={{ fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer', opacity: saving || !newCampaign.name ? 0.5 : 1 }}>
                  {saving ? 'Creating...' : 'Create campaign →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Campaigns list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-ink-muted)' }}>Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '4rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>No campaigns yet</div>
            <div style={{ fontSize: 14, color: 'var(--color-ink-muted)', marginBottom: 24, lineHeight: 1.6 }}>Create your first supplier campaign to start collecting sustainability data from your supply chain.</div>
            <button onClick={() => setShowNew(true)} style={{ fontSize: 13, fontWeight: 500, padding: '11px 22px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>
              + Create your first campaign
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {campaigns.map(c => {
              const pct = c.supplier_count ? Math.round(((c.completed_count || 0) / c.supplier_count) * 100) : 0
              return (
                <div key={c.id} onClick={() => router.push(`/dashboard/supply-chain/portal/${c.id}`)} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#7425e3'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e8e7e4'}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#0d0d0d' }}>{c.name}</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: statusBg(c.status), color: statusColor(c.status), textTransform: 'uppercase' }}>{c.status}</span>
                        {c.questionnaire_template && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>
                            {TEMPLATES.find(t => t.id === c.questionnaire_template)?.label || c.questionnaire_template}
                          </span>
                        )}
                      </div>
                      {c.description && <div style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}>{c.description}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Reporting year</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d' }}>{c.reporting_year}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 12 }}>
                    {[
                      { label: 'Suppliers invited', val: c.supplier_count || 0 },
                      { label: 'Completed', val: c.completed_count || 0 },
                      { label: 'Completion rate', val: `${pct}%` },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: '#0d0d0d' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#0F6E56' : GRAD, borderRadius: 99, transition: 'width 0.3s' }} />
                  </div>
                  {c.deadline && (
                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 8 }}>
                      Deadline: {new Date(c.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
