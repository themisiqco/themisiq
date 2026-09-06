'use client'

// Reusable B2B consent + business-details capture for self-serve checkout.
// Presentation + validation ONLY — it assembles the { business, purchaser, consent }
// payload and hands it to onSubmit; it never calls startCheckout. Callers (pricing, /order)
// decide what to do with the payload. Extracted verbatim from app/pricing/page.tsx so the
// money-touching consent logic lives in one place.

import { useState } from 'react'

const GRAD = 'var(--color-brand)'

// Counsel-final consent wording version (Terms / Refund Policy / Consent Part C).
// Must match what the checkout API records — do NOT change without legal sign-off.
export const CONSENT_VERSION = '2026-06-v2-final'

export interface ConsentPayload {
  business: { name: string; regNumber: string }
  purchaser: { name: string }
  consent: { businessCapacity: boolean; digitalAccess: boolean; dataAuthority: boolean; atISO: string; version: string }
}

interface ConsentFormProps {
  onSubmit: (payload: ConsentPayload) => void
  onCancel?: () => void            // when provided, renders a Cancel button (modal usage)
  submitting?: boolean             // disable + relabel while the caller is starting checkout
  submitLabel?: string
  title?: string
  subtitle?: string
}

export default function ConsentForm({
  onSubmit,
  onCancel,
  submitting = false,
  submitLabel = 'Continue to payment →',
  title = 'Confirm your purchase',
  subtitle = 'ThemisIQ sells to businesses only. Please confirm the details below to continue to secure payment.',
}: ConsentFormProps) {
  const [bizName, setBizName] = useState('')
  const [bizReg, setBizReg] = useState('')
  const [purchaserName, setPurchaserName] = useState('')
  const [cBiz, setCBiz] = useState(false)
  const [cAccess, setCAccess] = useState(false)
  const [cData, setCData] = useState(false)
  const consentReady = !!bizName.trim() && !!bizReg.trim() && !!purchaserName.trim() && cBiz && cAccess && cData
  const canSubmit = consentReady && !submitting

  const submit = () => {
    if (!canSubmit) return
    onSubmit({
      business: { name: bizName.trim(), regNumber: bizReg.trim() },
      purchaser: { name: purchaserName.trim() },
      consent: { businessCapacity: cBiz, digitalAccess: cAccess, dataAuthority: cData, atISO: new Date().toISOString(), version: CONSENT_VERSION },
    })
  }

  // stopPropagation so a click inside doesn't close a wrapping modal overlay (harmless inline).
  return (
    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#888784', marginBottom: 8 }}>{subtitle}</div>
      <label style={consentLabel}>Business legal name</label>
      <input value={bizName} onChange={e => setBizName(e.target.value)} placeholder="Acme Industries Inc." style={consentInput} />
      <label style={consentLabel}>Registration / VAT / Tax ID</label>
      <input value={bizReg} onChange={e => setBizReg(e.target.value)} placeholder="e.g. 12-3456789" style={consentInput} />
      <label style={consentLabel}>Your name</label>
      <input value={purchaserName} onChange={e => setPurchaserName(e.target.value)} placeholder="Full name" style={consentInput} />
      {/* Consent wording — Terms/Refund/Consent Part C; counsel-final (2026-06-v2-final) */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label style={consentCheckRow}>
          <input type="checkbox" checked={cBiz} onChange={e => setCBiz(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
          <span style={consentCheckText}>I confirm that I am purchasing on behalf of a business or organization, and not as a consumer. I represent that I have authority to bind the organization to these <a href="/terms" target="_blank" rel="noopener noreferrer" style={consentLink}>Terms of Service</a>.</span>
        </label>
        <label style={consentCheckRow}>
          <input type="checkbox" checked={cAccess} onChange={e => setCAccess(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
          <span style={consentCheckText}>I request immediate access to the Service. I understand that performance begins upon first login or the generation of any report and that, to the extent permitted by applicable law, applicable cancellation or withdrawal rights may cease once performance begins. I acknowledge that I have read and agree to the <a href="/refund-policy" target="_blank" rel="noopener noreferrer" style={consentLink}>Refund Policy</a>.</span>
        </label>
        <label style={consentCheckRow}>
          <input type="checkbox" checked={cData} onChange={e => setCData(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
          <span style={consentCheckText}>I represent that I have authority to provide any information uploaded to the Service and that my use of the Service complies with applicable laws and my organization&apos;s internal policies.</span>
        </label>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        {onCancel && <button onClick={onCancel} style={ghostBtn}>Cancel</button>}
        <button onClick={submit} disabled={!canSubmit} style={{ ...primaryBtn, opacity: canSubmit ? 1 : 0.4, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>{submitting ? 'Starting…' : submitLabel}</button>
      </div>
    </div>
  )
}

// ── Styles (moved verbatim from the pricing consent modal) ──────────────────────
const consentLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', display: 'block', marginBottom: 4, marginTop: 12 }
const consentInput: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }
const consentCheckRow: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }
const consentCheckText: React.CSSProperties = { fontSize: 12, color: '#555553', lineHeight: 1.6 }
const consentLink: React.CSSProperties = { color: '#7425e3', textDecoration: 'underline' }
const primaryBtn: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--color-on-dark)', background: GRAD, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block' }
const ghostBtn: React.CSSProperties = { padding: '10px 20px', borderRadius: 8, fontSize: 12, fontWeight: 500, color: '#0d0d0d', background: '#fff', border: '1px solid #e8e7e4', cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block' }
