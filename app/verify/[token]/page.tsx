'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

interface AuditEntry {
  id: string; action: string; user_email: string | null; created_at: string
  old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null
}
interface InventoryData {
  company_name: string; reporting_year: number; revenue_millions: number
  boundary_approach: string; selected_frameworks: string[]
  scope1_total: number; scope2_location_total: number; scope2_market_total: number
  scope1_intensity: number; scope2_intensity: number
  locations_data: { name: string }[]
}
interface VerifierPayload {
  inventory?: InventoryData
  audit?: AuditEntry[]
  verifier?: { name: string | null; email: string | null }
  expires_at?: string
  error?: string
}

const FRAMEWORK_NAMES: Record<string, string> = {
  sb253: 'California SB 253', cdp: 'CDP', esrs: 'ESRS E1', ifrs_s2: 'IFRS S2', gri: 'GRI 305', ecovadis: 'EcoVadis',
}
const boundaryLabel = (b: string) =>
  ({ operational_control: 'Operational Control', financial_control: 'Financial Control', equity_share: 'Equity Share' } as Record<string, string>)[b] || b

const AUDIT_FIELDS: Record<string, string> = {
  company_name: 'Company name', reporting_year: 'Reporting year',
  scope1_total: 'Scope 1 total', scope2_location_total: 'Scope 2 (location)',
  scope2_market_total: 'Scope 2 (market)', revenue_millions: 'Revenue (USD M)',
  employee_count: 'Employees', boundary_approach: 'Boundary approach',
  selected_frameworks: 'Frameworks', status: 'Status',
}
function fmt(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ') || '—'
  return String(v)
}
function diffRow(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null) {
  const out: { label: string; from: string; to: string }[] = []
  const o = oldV || {}, n = newV || {}
  for (const key of Object.keys(AUDIT_FIELDS)) {
    const before = fmt(o[key]), after = fmt(n[key])
    if (before !== after) out.push({ label: AUDIT_FIELDS[key], from: before, to: after })
  }
  return out
}

export default function VerifierPage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<VerifierPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    supabase.rpc('get_verifier_inventory', { p_token: token }).then((res: { data: VerifierPayload | null }) => {
      setData(res.data)
      setLoading(false)
    })
  }, [token])

  if (loading) return <Shell><div style={{ padding: '4rem', textAlign: 'center', color: '#888784' }}>Loading verification review…</div></Shell>

  if (!data || data.error || !data.inventory) {
    return (
      <Shell>
        <div style={{ maxWidth: 540, margin: '4rem auto', textAlign: 'center', padding: '0 1.5rem' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>Link invalid or expired</h1>
          <p style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, fontWeight: 300 }}>This verification link is no longer valid. It may have expired or been revoked. Please contact the company that shared it with you to request a new link.</p>
        </div>
      </Shell>
    )
  }

  const inv = data.inventory
  const audit = data.audit || []
  const frameworks = (inv.selected_frameworks || []).map(f => FRAMEWORK_NAMES[f] || f)

  return (
    <Shell>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: '1.5rem', fontSize: 12, color: '#7425e3', fontWeight: 500 }}>
          Read-only verifier view · You are reviewing a GHG inventory shared for independent assurance{data.expires_at ? ` · Access expires ${new Date(data.expires_at).toLocaleDateString()}` : ''}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Independent Verification Review</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{inv.company_name || 'GHG Inventory'}</h1>
        <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, marginBottom: '2rem' }}>Reporting year {inv.reporting_year} · {frameworks.join(', ') || 'No framework selected'} · {boundaryLabel(inv.boundary_approach)}</p>

        <SectionHead>Emissions Summary</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: '2rem' }}>
          <Stat label="Scope 1 (tCO2e)" value={(inv.scope1_total ?? 0).toFixed(3)} color="#B91C1C" />
          <Stat label="Scope 2 location (tCO2e)" value={(inv.scope2_location_total ?? 0).toFixed(3)} color="#0F6E56" />
          <Stat label="Scope 2 market (tCO2e)" value={(inv.scope2_market_total ?? 0).toFixed(3)} color="#0C447C" />
          <Stat label="S1 intensity /$M" value={(inv.scope1_intensity ?? 0).toFixed(4)} color="#7425e3" />
        </div>

        <SectionHead>Locations</SectionHead>
        <div style={{ marginBottom: '2rem', fontSize: 13, color: '#555553' }}>
          {(inv.locations_data || []).map((l, i) => (
            <div key={i} style={{ padding: '8px 0', borderBottom: '0.5px solid #e8e7e4' }}>{l.name || `Location ${i + 1}`}</div>
          ))}
        </div>

        <SectionHead>Audit Trail</SectionHead>
        <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          {audit.length} change{audit.length !== 1 ? 's' : ''} logged · append-only, tamper-evident record
        </div>
        {audit.map((row, i) => {
          const isCreate = row.action === 'INSERT', isDelete = row.action === 'DELETE'
          const changes = row.action === 'UPDATE' ? diffRow(row.old_values, row.new_values) : []
          const color = isCreate ? '#0F6E56' : isDelete ? '#B91C1C' : '#7425e3'
          const label = isCreate ? 'Created' : isDelete ? 'Deleted' : 'Updated'
          return (
            <div key={row.id || i} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: changes.length ? 10 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color, background: color + '18', padding: '3px 10px', borderRadius: 99 }}>{label}</span>
                  <span style={{ fontSize: 12, color: '#555553' }}>{row.user_email || 'System'}</span>
                </div>
                <span style={{ fontSize: 11, color: '#888784' }}>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              {changes.length > 0 && (
                <div style={{ borderTop: '0.5px solid #f0efed', paddingTop: 10 }}>
                  {changes.map((c, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: '#555553' }}>{c.label}</span>
                      <span style={{ color: '#888784', textDecoration: 'line-through' }}>{c.from}</span>
                      <span style={{ color: '#888784' }}>→</span>
                      <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{c.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ marginTop: '2.5rem', padding: '1rem 1.25rem', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, fontSize: 11, color: '#888784', lineHeight: 1.6 }}>
          This review is generated by the ThemisIQ platform to support independent verification under ISO 14064-3 / ISAE 3410. Data is read-only. This page does not itself constitute assurance, legal advice, or a regulatory filing.
        </div>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <div style={{ borderBottom: '0.5px solid #e8e7e4', padding: '1rem 1.5rem' }}>
        <span style={{ fontWeight: 700, fontSize: 18, color: '#0d0d0d' }}>Themis<span style={{ color: '#7425e3' }}>IQ</span></span>
      </div>
      {children}
    </div>
  )
}
function SectionHead({ children }: { children: React.ReactNode }) {
  return <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '1rem' }}>{children}</h2>
}
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#888784' }}>{label}</div>
    </div>
  )
}
