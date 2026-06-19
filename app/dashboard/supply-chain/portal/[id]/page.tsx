'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Nav from '../../../../components/Nav'
import { supabase } from '../../../../../lib/supabase'
import { useEntitlement } from '../../../../../lib/useEntitlement'
import PaywallCard from '../../../../components/PaywallCard'
import Papa from 'papaparse'

interface CampaignSupplier {
  id: string
  supplier_name: string
  supplier_email: string
  contact_name: string | null
  token: string
  status: 'invited' | 'in_progress' | 'completed' | 'expired'
  invited_at: string
  completed_at: string | null
  reminder_sent_at: string | null
  annual_spend: number | null
  spend_currency: string | null
}

interface Campaign {
  id: string
  name: string
  description: string
  reporting_year: number
  status: string
  deadline: string | null
}

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF']
const GRID_COLS = '2fr 1fr 1fr 1fr 1fr auto'

const STATUS_CONFIG = {
  invited:     { label: 'Invited', color: '#0C447C', bg: '#E6F1FB' },
  in_progress: { label: 'In progress', color: '#ba7517', bg: '#FEF3E2' },
  completed:   { label: 'Completed', color: '#0F6E56', bg: '#E1F5EE' },
  expired:     { label: 'Expired', color: '#888784', bg: '#f8f7f5' },
}

export default function CampaignDetail() {
  const isPaid = useEntitlement('supply-chain')
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const fileRef = useRef<HTMLInputElement>(null)

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [suppliers, setSuppliers] = useState<CampaignSupplier[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ supplier_name: '', supplier_email: '', contact_name: '' })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  // Campaign-level currency for spend entry. Initialised from the first supplier
  // that already has a currency saved; otherwise defaults to USD.
  const [spendCurrency, setSpendCurrency] = useState('USD')

  const exportAllResponses = async () => {
    setExporting(true)
    const completedSuppliers = suppliers.filter(s => s.status === 'completed')
    if (completedSuppliers.length === 0) { setExporting(false); return }

    // Fetch all responses for all completed suppliers
    const allResponses: Record<string, Record<string, string>> = {}
    for (const s of completedSuppliers) {
      const { data: resps } = await supabase
        .from('supplier_responses')
        .select('*')
        .eq('campaign_supplier_id', s.id)
      if (resps) {
        allResponses[s.id] = {}
        resps.forEach((r: any) => { allResponses[s.id][r.question_id] = r.response })
      }
    }

    // Build CSV — one row per supplier, one column per question
    const allQuestionIds = [...new Set(Object.values(allResponses).flatMap(r => Object.keys(r)))]
    const header = ['Supplier', 'Email', 'Contact', 'Status', 'Completed', 'Annual spend', 'Spend currency', ...allQuestionIds]
    const rows = [
      [`ThemisIQ — Bulk Supplier Response Export`],
      [`Campaign: ${campaign?.name}`],
      [`Exported: ${new Date().toLocaleDateString()}`],
      [`Completed suppliers: ${completedSuppliers.length}`],
      [],
      header,
      ...completedSuppliers.map(s => [
        s.supplier_name,
        s.supplier_email,
        s.contact_name || '',
        s.status,
        s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '',
        s.annual_spend != null ? String(s.annual_spend) : '',
        s.spend_currency || '',
        ...allQuestionIds.map(qid => allResponses[s.id]?.[qid] || ''),
      ]),
    ]

    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${campaign?.name}_AllResponses_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setExporting(false)
  }
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    loadCampaign()
  }, [id])

  const loadCampaign = async () => {
    setLoading(true)
    const { data: camp } = await supabase.from('supplier_campaigns').select('*').eq('id', id).single()
    const { data: sups } = await supabase.from('campaign_suppliers').select('*').eq('campaign_id', id).order('invited_at', { ascending: false })
    if (camp) setCampaign(camp)
    if (sups) {
      setSuppliers(sups)
      // Adopt an already-saved currency if one exists, so the selector reflects reality.
      const existing = sups.find((s: CampaignSupplier) => s.spend_currency)?.spend_currency
      if (existing) setSpendCurrency(existing)
    }
    setLoading(false)
  }

  // Save a supplier's annual spend (on blur) without a full reload, so the input
  // keeps focus and the rest of the list doesn't flicker. Writes the current
  // campaign-level currency alongside the figure.
  const updateSpend = async (supplierId: string, raw: string) => {
    const trimmed = raw.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (value != null && (isNaN(value) || value < 0)) return
    setSuppliers(prev => prev.map(s => s.id === supplierId ? { ...s, annual_spend: value, spend_currency: spendCurrency } : s))
    await supabase.from('campaign_suppliers').update({ annual_spend: value, spend_currency: spendCurrency }).eq('id', supplierId)
  }

  // When the campaign currency changes, persist it across all suppliers that
  // already have a spend recorded (keeps the basis consistent for the aggregate).
  const changeCurrency = async (cur: string) => {
    setSpendCurrency(cur)
    const withSpend = suppliers.filter(s => s.annual_spend != null)
    setSuppliers(prev => prev.map(s => s.annual_spend != null ? { ...s, spend_currency: cur } : s))
    for (const s of withSpend) {
      await supabase.from('campaign_suppliers').update({ spend_currency: cur }).eq('id', s.id)
    }
  }

  const addSupplier = async () => {
    if (!newSupplier.supplier_name || !newSupplier.supplier_email) return
    setSaving(true)
    await supabase.from('campaign_suppliers').insert({
      campaign_id: id,
      supplier_name: newSupplier.supplier_name,
      supplier_email: newSupplier.supplier_email,
      contact_name: newSupplier.contact_name || null,
      status: 'invited',
    })
    setNewSupplier({ supplier_name: '', supplier_email: '', contact_name: '' })
    setShowAdd(false)
    setSaving(false)
    loadCampaign()
  }

  const handleCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[]
        for (const row of rows) {
          const name = row['Supplier'] || row['supplier'] || row['Name'] || row['name'] || ''
          const email = row['Email'] || row['email'] || ''
          const contact = row['Contact'] || row['contact'] || ''
          const spendRaw = row['Spend'] || row['spend'] || row['Annual spend'] || row['annual_spend'] || ''
          const spend = spendRaw !== '' && !isNaN(Number(spendRaw)) ? Number(spendRaw) : null
          if (name && email) {
            await supabase.from('campaign_suppliers').insert({ campaign_id: id, supplier_name: name, supplier_email: email, contact_name: contact || null, status: 'invited', annual_spend: spend, spend_currency: spend != null ? spendCurrency : null })
          }
        }
        loadCampaign()
      },
    })
  }

  const [sending, setSending] = useState<string | null>(null)
  const [sentStatus, setSentStatus] = useState<Record<string, string>>({})

  const sendInvite = async (s: CampaignSupplier, type: 'invite' | 'reminder') => {
    setSending(s.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/supplier-invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ supplier_id: s.id, type, buyer_company: campaign?.name?.split(' ')[0] || 'ThemisIQ' }),
    })
    const data = await res.json()
    setSending(null)
    setSentStatus(prev => ({ ...prev, [s.id]: data.success ? (type === 'invite' ? 'invited' : 'reminded') : 'error' }))
    setTimeout(() => setSentStatus(prev => { const n = { ...prev }; delete n[s.id]; return n }), 3000)
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/supplier/${token}`
    navigator.clipboard.writeText(url)
    setCopied(token)
    setTimeout(() => setCopied(null), 2000)
  }

  const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
  const spendInputStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '0.5px solid #e8e7e4', fontSize: 12, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }

  const completed = suppliers.filter(s => s.status === 'completed').length
  const inProgress = suppliers.filter(s => s.status === 'in_progress').length
  const invited = suppliers.filter(s => s.status === 'invited').length
  const pct = suppliers.length ? Math.round((completed / suppliers.length) * 100) : 0

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: '4rem', color: '#888784' }}>Loading...</div>
    </div>
  )

  if (!isPaid) return <PaywallCard title="Unlock the Supply Chain module" body="The Supplier Portal is part of the Supply Chain module. Unlock it to create campaigns, invite suppliers, and review responses." />
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <button onClick={() => router.push('/dashboard/supply-chain/portal')} style={{ fontSize: 12, color: '#888784', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← All campaigns</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{campaign?.name}</div>
              {campaign?.description && <div style={{ fontSize: 13, color: '#888784' }}>{campaign.description}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: '#888784' }}>Spend currency</span>
                <select value={spendCurrency} onChange={e => changeCurrency(e.target.value)} style={{ fontSize: 12, padding: '7px 10px', borderRadius: 8, background: '#f8f7f5', border: '1px solid #e8e7e4', color: '#555553', cursor: 'pointer' }}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleCSVImport} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, background: '#f8f7f5', border: '1px solid #e8e7e4', color: '#555553', cursor: 'pointer' }}>Import CSV</button>
              {suppliers.filter(s => s.status === 'completed').length > 0 && (
                <button onClick={exportAllResponses} disabled={exporting} style={{ fontSize: 12, fontWeight: 500, padding: '8px 14px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer', opacity: exporting ? 0.6 : 1 }}>
                  {exporting ? 'Exporting...' : `⬇ Export all (${suppliers.filter(s => s.status === 'completed').length})`}
                </button>
              )}
              <button onClick={() => setShowAdd(true)} style={{ fontSize: 12, fontWeight: 500, padding: '8px 14px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>+ Add supplier</button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total invited', val: suppliers.length, color: '#0d0d0d', bg: '#fff' },
            { label: 'Completed', val: completed, color: '#0F6E56', bg: '#E1F5EE' },
            { label: 'In progress', val: inProgress, color: '#ba7517', bg: '#FEF3E2' },
            { label: 'Awaiting response', val: invited, color: '#0C447C', bg: '#E6F1FB' },
          ].map(({ label, val, color, bg }) => (
            <div key={label} style={{ background: bg, border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem', textAlign: 'center' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color }}>{val}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>Completion rate</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: pct === 100 ? '#0F6E56' : '#0d0d0d' }}>{pct}%</div>
          </div>
          <div style={{ height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#0F6E56' : GRAD, borderRadius: 99, transition: 'width 0.3s' }} />
          </div>
          {campaign?.deadline && (
            <div style={{ fontSize: 11, color: '#888784', marginTop: 8 }}>Deadline: {new Date(campaign.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          )}
        </div>

        {/* Add supplier modal */}
        {showAdd && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '2rem', width: '100%', maxWidth: 420 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '1.25rem' }}>Add supplier</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Company name</label>
                  <input style={inputStyle} value={newSupplier.supplier_name} onChange={e => setNewSupplier(p => ({ ...p, supplier_name: e.target.value }))} placeholder="Supplier company name" />
                </div>
                <div>
                  <label style={labelStyle}>Email address</label>
                  <input style={inputStyle} type="email" value={newSupplier.supplier_email} onChange={e => setNewSupplier(p => ({ ...p, supplier_email: e.target.value }))} placeholder="contact@supplier.com" />
                </div>
                <div>
                  <label style={labelStyle}>Contact name (optional)</label>
                  <input style={inputStyle} value={newSupplier.contact_name} onChange={e => setNewSupplier(p => ({ ...p, contact_name: e.target.value }))} placeholder="First and last name" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: '1.25rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAdd(false)} style={{ fontSize: 13, padding: '9px 18px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: 'pointer' }}>Cancel</button>
                <button onClick={addSupplier} disabled={saving || !newSupplier.supplier_name || !newSupplier.supplier_email} style={{ fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer', opacity: saving || !newSupplier.supplier_name || !newSupplier.supplier_email ? 0.5 : 1 }}>
                  {saving ? 'Adding...' : 'Add supplier'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Supplier list */}
        {suppliers.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '3rem', textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: '#888784', marginBottom: 16 }}>No suppliers added yet</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => fileRef.current?.click()} style={{ fontSize: 12, padding: '9px 18px', borderRadius: 8, background: '#f8f7f5', border: '1px solid #e8e7e4', color: '#555553', cursor: 'pointer' }}>Import from CSV</button>
              <button onClick={() => setShowAdd(true)} style={{ fontSize: 12, fontWeight: 500, padding: '9px 18px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>+ Add manually</button>
            </div>
          </div>
        ) : (
          <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
              {['Supplier', 'Status', 'Invited', 'Annual spend', 'Completed', 'Actions'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {suppliers.map((s, i) => {
              const cfg = STATUS_CONFIG[s.status]
              const isSending = sending === s.id
              const sent = sentStatus[s.id]
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: GRID_COLS, padding: '12px 16px', borderBottom: i < suppliers.length - 1 ? '0.5px solid #e8e7e4' : 'none', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{s.supplier_name}</div>
                    <div style={{ fontSize: 11, color: '#888784' }}>{s.supplier_email}</div>
                    {s.contact_name && <div style={{ fontSize: 11, color: '#888784' }}>{s.contact_name}</div>}
                  </div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#888784' }}>{new Date(s.invited_at).toLocaleDateString()}</div>
                  <div style={{ paddingRight: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: '#888784', flexShrink: 0 }}>{spendCurrency}</span>
                      <input
                        type="number"
                        min="0"
                        defaultValue={s.annual_spend ?? ''}
                        onBlur={e => updateSpend(s.id, e.target.value)}
                        placeholder="—"
                        style={spendInputStyle}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: s.completed_at ? '#0F6E56' : '#888784' }}>
                    {s.completed_at ? new Date(s.completed_at).toLocaleDateString() : '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                    {sent ? (
                      <span style={{ fontSize: 10, fontWeight: 600, color: sent === 'error' ? '#B91C1C' : '#0F6E56' }}>
                        {sent === 'error' ? '✗ Failed' : sent === 'invited' ? '✓ Invite sent!' : '✓ Reminder sent!'}
                      </span>
                    ) : (
                      <>
                        {s.status !== 'completed' && (
                          <button onClick={() => sendInvite(s, 'invite')} disabled={isSending} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', opacity: isSending ? 0.5 : 1 }}>
                            {isSending ? '...' : '✉ Send invite'}
                          </button>
                        )}
                        {s.status === 'in_progress' && (
                          <button onClick={() => sendInvite(s, 'reminder')} disabled={isSending} style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 6, background: '#f8f7f5', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ↩ Remind
                          </button>
                        )}
                        <button onClick={() => copyLink(s.token)} style={{ fontSize: 10, fontWeight: 500, padding: '4px 10px', borderRadius: 6, background: copied === s.token ? '#E1F5EE' : '#f8f7f5', color: copied === s.token ? '#0F6E56' : '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          {copied === s.token ? '✓ Copied!' : 'Copy link'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* CSV template */}
        <div style={{ marginTop: 16, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 12, color: '#888784' }}>
          CSV import format: <code style={{ background: '#fff', padding: '1px 6px', borderRadius: 4 }}>Supplier, Email, Contact, Spend</code> &mdash; Spend is optional; you can also enter it inline after import. Spend is recorded in the campaign currency selected above.
        </div>
      </div>
    </div>
  )
}
