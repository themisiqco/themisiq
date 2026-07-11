'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

interface AuditEntry {
  id: string; action: string; user_email: string | null; created_at: string
  old_values: Record<string, unknown> | null; new_values: Record<string, unknown> | null
}
interface VerifierDoc { file_name: string; document_type: string; location: string; file_path: string; signed_url: string | null }
interface WorkingRow {
  location: string; source: string; scope: number
  activity_data: number; activity_unit: string
  emission_factor: string; ef_source: string; gwp_basis: string
  result_tco2e: number
  // Concierge provenance (present only for bill-sourced rows). Lets a verifier trace a figure
  // back to the quote read off the bill; 'concierge-extrapolated' rows are grossed-up estimates.
  source_quotes?: string[]
  source_doc_ids?: string[]
  // Index-aligned with source_quotes: the storage path behind quote[i], used to resolve a signed URL.
  source_file_paths?: string[]
  entry_method?: 'manual' | 'concierge' | 'concierge-extrapolated'
  extrapolation_note?: string
}
interface InventoryData {
  company_name: string; reporting_year: number; revenue_millions: number
  boundary_approach: string; selected_frameworks: string[]
  scope1_total: number; scope2_location_total: number; scope2_market_total: number
  scope1_intensity: number; scope2_intensity: number
  locations_data: { name: string }[]
  workings?: WorkingRow[]
}
interface VerifierPayload {
  inventory?: InventoryData
  audit?: AuditEntry[]
  verifier?: { name: string | null; email: string | null }
  expires_at?: string
  accepted_at?: string | null
  error?: string
}

const FRAMEWORK_NAMES: Record<string, string> = {
  sb253: 'California SB 253', cdp: 'CDP', esrs: 'ESRS E1', ifrs_s2: 'IFRS S2', gri: 'GRI 305', ecovadis: 'EcoVadis',
}
const boundaryLabel = (b: string) =>
  ({ operational_control: 'Operational Control', financial_control: 'Financial Control', equity_share: 'Equity Share' } as Record<string, string>)[b] || b

// Consent wording version stamped onto the verifier's ToS/Privacy acceptance.
// Bump this whenever the Terms or Privacy Policy are materially revised.
const CONSENT_VERSION = '2026-07-v1'

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
  const [docs, setDocs] = useState<VerifierDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  // Consent gate: local state for the accept flow (only meaningful before acceptance).
  const [accepted, setAccepted] = useState(false)
  const [email, setEmail] = useState('')
  const [tosChecked, setTosChecked] = useState(false)
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    supabase.rpc('get_verifier_inventory', { p_token: token }).then((res: { data: VerifierPayload | null }) => {
      setData(res.data)
      setLoading(false)
    })
  }, [token])

  // Seed the consent-gate email from the grant's stored verifier email, once,
  // without clobbering anything the verifier has typed. (Does not touch the load effect.)
  useEffect(() => {
    if (data?.verifier?.email) setEmail(prev => prev || data.verifier!.email!)
  }, [data])

  // Documents fetch — gated on verifier access. Only fires once the token is
  // already accepted (accepted_at set on load) or has just been accepted in-session.
  useEffect(() => {
    if (!token) return
    const hasAccess = !!data?.accepted_at || accepted
    if (!hasAccess) return
    setDocsLoading(true)
    fetch('/api/verifier-documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then(r => r.ok ? r.json() : { documents: [] })
      .then((d: { documents?: VerifierDoc[] }) => { setDocs(d.documents || []); setDocsLoading(false) })
      .catch(() => setDocsLoading(false))
  }, [token, data?.accepted_at, accepted])

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

  // ── Consent gate ──────────────────────────────────────────────────────────
  // Already-accepted tokens self-dismiss: fall straight through to the review.
  const alreadyAccepted = !!data.accepted_at

  const handleAccept = async () => {
    setSubmitting(true)
    setGateError(null)
    const { data: res, error } = await supabase.rpc('verifier_accept_invite', {
      p_token: token, p_email: email.trim(), p_consent_version: CONSENT_VERSION,
    })
    if (error || !res) {
      setGateError('Something went wrong, please try again.')
      setSubmitting(false)
      return
    }
    if (res.status === 'accepted' || res.status === 'already_accepted') {
      setAccepted(true)
      return
    }
    // 'invalid' (or anything unexpected): leave the gate up.
    setGateError('This invite is no longer valid. Please contact the company that sent it.')
    setSubmitting(false)
  }

  if (!alreadyAccepted && !accepted) {
    const gateCompany = data.inventory?.company_name
    return (
      <Shell>
        <div style={{ maxWidth: 540, margin: '3.5rem auto', padding: '0 1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Independent Verification Review</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem,3vw,2rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>Confirm your details to continue</h1>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.75rem' }}>
            You&rsquo;ve been invited to review {gateCompany ? <>the GHG inventory for <strong style={{ fontWeight: 500, color: '#0d0d0d' }}>{gateCompany}</strong></> : 'a GHG inventory'} for independent assurance. Please confirm your email and agree to the Terms and Privacy Policy to proceed.
          </p>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#888784', marginBottom: 6 }}>Your email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@firm.com"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4', color: '#0d0d0d', background: '#fff' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#555553', lineHeight: 1.6, marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={tosChecked} onChange={e => setTosChecked(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#7425e3', textDecoration: 'underline' }}>Terms of Service</a></span>
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: '#555553', lineHeight: 1.6, marginBottom: '1.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={privacyChecked} onChange={e => setPrivacyChecked(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
            <span>I agree to the <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#7425e3', textDecoration: 'underline' }}>Privacy Policy</a></span>
          </label>

          <button
            onClick={handleAccept}
            disabled={submitting || !tosChecked || !privacyChecked || !email.trim()}
            style={{
              width: '100%', fontSize: 14, fontWeight: 500, padding: '12px 20px', borderRadius: 8, border: 'none',
              background: '#0d0d0d', color: '#fff',
              cursor: (submitting || !tosChecked || !privacyChecked || !email.trim()) ? 'not-allowed' : 'pointer',
              opacity: (submitting || !tosChecked || !privacyChecked || !email.trim()) ? 0.45 : 1,
            }}
          >
            {submitting ? 'Confirming…' : 'Accept & view inventory'}
          </button>

          {gateError && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#B91C1C', lineHeight: 1.6 }}>{gateError}</div>
          )}
        </div>
      </Shell>
    )
  }

  const inv = data.inventory
  const audit = data.audit || []
  // Correlate a workings row's source_file_paths[i] to a short-lived signed URL from the docs fetch.
  // Skip null signed_urls; a missing key just falls back to plain text (never a broken link).
  const pathToSignedUrl: Record<string, string> = {}
  for (const d of docs) { if (d.file_path && d.signed_url) pathToSignedUrl[d.file_path] = d.signed_url }
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

        <SectionHead>Calculation Workings</SectionHead>
        <p style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>
          Per-source breakdown as calculated at save time. Each line shows the activity data, emission factor, and GWP basis used — enabling independent recalculation under ISO 14064-3.
        </p>
        {(inv.workings && inv.workings.length > 0) ? (
          <div style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0d0d0d' }}>
                  {['Location', 'Source', 'Scope', 'Activity data', 'Emission factor', 'GWP', 'Result (tCO2e)'].map(h => (
                    <th key={h} style={{ color: '#fff', textAlign: 'left', padding: '8px 10px', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inv.workings.map((w, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
                    <td style={{ padding: '8px 10px', color: '#555553' }}>{w.location}</td>
                    <td style={{ padding: '8px 10px', color: '#0d0d0d', fontWeight: 500 }}>
                      <span>{w.source}</span>
                      {w.entry_method === 'concierge' && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, color: '#7425e3', background: 'rgba(116,37,227,0.08)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Bill-sourced</span>
                      )}
                      {w.entry_method === 'concierge-extrapolated' && (
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, color: '#888784', background: '#efeeec', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Estimated</span>
                      )}
                      {w.source_quotes && w.source_quotes.length > 0 && (
                        <div style={{ marginTop: 4, fontSize: 11, fontStyle: 'italic', fontWeight: 400, color: '#888784' }}>From source: {w.source_quotes.map((q, qi) => {
                          const p = w.source_file_paths?.[qi]
                          const url = p ? pathToSignedUrl[p] : undefined
                          return (
                            <span key={qi}>
                              {qi > 0 && '; '}
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#7425e3', textDecoration: 'underline', textDecorationThickness: '0.5px', textUnderlineOffset: 2 }}>{`"${q}"`}</a>
                              ) : `"${q}"`}
                            </span>
                          )
                        })}</div>
                      )}
                      {w.extrapolation_note && (
                        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 400, color: '#888784' }}>Estimated — {w.extrapolation_note}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#555553' }}>{w.scope}</td>
                    <td style={{ padding: '8px 10px', color: '#555553', whiteSpace: 'nowrap' }}>{w.activity_data.toLocaleString()} {w.activity_unit}</td>
                    <td style={{ padding: '8px 10px', color: '#888784', fontSize: 11 }}>{w.emission_factor}</td>
                    <td style={{ padding: '8px 10px', color: '#555553' }}>{w.gwp_basis}</td>
                    <td style={{ padding: '8px 10px', color: '#7425e3', fontWeight: 600, whiteSpace: 'nowrap' }}>{w.result_tco2e.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: '#888784', marginTop: 8 }}>Emission factor sources: US EPA (combustion), US EPA eGRID (electricity), IPCC (GWP). Verifier should confirm each sampled line independently.</div>
          </div>
        ) : (
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.5rem', textAlign: 'center', fontSize: 13, color: '#888784', marginBottom: '2rem' }}>No calculation workings recorded for this inventory yet.</div>
        )}

        <SectionHead>Source Documents</SectionHead>
        <p style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>
          Supporting evidence uploaded for this inventory. View links are secure and expire after 10 minutes — trace each activity-data figure back to its source document.
        </p>
        {docsLoading && <div style={{ fontSize: 13, color: '#888784', marginBottom: '2rem' }}>Loading documents…</div>}
        {!docsLoading && docs.length === 0 && (
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.5rem', textAlign: 'center', fontSize: 13, color: '#888784', marginBottom: '2rem' }}>No source documents have been uploaded for this inventory.</div>
        )}
        {!docsLoading && docs.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            {docs.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{d.file_name}</div>
                  <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{d.location} · {d.document_type}</div>
                </div>
                {d.signed_url ? (
                  <a href={d.signed_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: '6px 16px', borderRadius: 6, background: '#0d0d0d', color: '#fff', textDecoration: 'none' }}>View</a>
                ) : (
                  <span style={{ fontSize: 11, color: '#888784' }}>Unavailable</span>
                )}
              </div>
            ))}
          </div>
        )}

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
