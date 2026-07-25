'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

// CBAM verifier portal — PART 1 of 2: skeleton, state machine, consent gate.
// The report render layer is Part 2; the 'valid' branch renders a placeholder.
//
// State is driven entirely by cbam_verifier_validate_token's three-state return
// (see 20260724_cbam_verifier_validate_rpc.sql): status IS the gate signal —
// there is no accepted_at field to read here.
//   • 'invalid'          → invalid/expired screen
//   • 'consent_required' → consent gate
//   • 'valid'            → placeholder (Part 2 = report)
// The validate RPC does NOT return expires_at, so the read-only banner omits the
// "Access expires" clause rather than fabricating a date.

// Shape of cbam_verifier_validate_token's jsonb return. Sensitive scope tuple
// (installation_id, company_id) is present ONLY in the 'valid' state.
interface ValidateResult {
  status: 'invalid' | 'consent_required' | 'valid'
  verifier_name?: string | null
  installation_name?: string | null
  reporting_period?: number | null
  installation_id?: string
  company_id?: string
}
// Shape of cbam_verifier_accept_invite's jsonb return.
interface AcceptResult {
  status: 'accepted' | 'already_accepted' | 'invalid'
}

// Consent wording version stamped onto the verifier's ToS/Privacy acceptance.
// Same value as the GHG verifier page. Bump when Terms or Privacy are materially revised.
const CONSENT_VERSION = '2026-07-v1'

export default function CbamVerifierPage() {
  const params = useParams()
  const token = params.token as string
  const [result, setResult] = useState<ValidateResult | null>(null)
  const [loading, setLoading] = useState(true)
  // Consent gate: local state for the accept flow (only meaningful before acceptance).
  const [accepted, setAccepted] = useState(false)
  const [email, setEmail] = useState('')
  const [tosChecked, setTosChecked] = useState(false)
  const [privacyChecked, setPrivacyChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    supabase.rpc('cbam_verifier_validate_token', { p_token: token }).then((res: { data: ValidateResult | null }) => {
      setResult(res.data)
      setLoading(false)
    })
  }, [token])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <Shell><div style={{ padding: '4rem', textAlign: 'center', color: '#888784' }}>Loading verification review…</div></Shell>

  // ── Invalid / expired ────────────────────────────────────────────────────────
  if (!result || result.status === 'invalid') {
    return (
      <Shell>
        <div style={{ maxWidth: 540, margin: '4rem auto', textAlign: 'center', padding: '0 1.5rem' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>Link invalid or expired</h1>
          <p style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, fontWeight: 300 }}>This link is invalid or has expired. It may have been revoked. Please contact the company that shared it with you to request a new link.</p>
        </div>
        <Footer />
      </Shell>
    )
  }

  const verifierName = result.verifier_name || null
  const installationName = result.installation_name || null
  const reportingPeriod = result.reporting_period ?? null

  // ── Consent gate ─────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    setSubmitting(true)
    setGateError(null)
    const { data: res, error } = await supabase.rpc('cbam_verifier_accept_invite', {
      p_token: token, p_email: email.trim(), p_consent_version: CONSENT_VERSION,
    }) as { data: AcceptResult | null; error: unknown }
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

  const gateReady = !!email.trim() && tosChecked && privacyChecked && !submitting

  if (result.status === 'consent_required' && !accepted) {
    return (
      <Shell>
        <div style={{ maxWidth: 540, margin: '3.5rem auto', padding: '0 1.5rem' }}>
          <ReadOnlyBanner />

          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Independent CBAM Verification</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem,3vw,2rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>
            {verifierName ? `Welcome, ${verifierName}` : 'Confirm your details to continue'}
          </h1>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.75rem' }}>
            You&rsquo;ve been invited to verify {installationName ? <strong style={{ fontWeight: 500, color: '#0d0d0d' }}>{installationName}</strong> : 'an installation'}{reportingPeriod != null ? <> for <strong style={{ fontWeight: 500, color: '#0d0d0d' }}>{reportingPeriod}</strong></> : ''}. Please confirm your email and agree to the Terms and Privacy Policy to proceed.
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
            disabled={!gateReady}
            style={{
              width: '100%', fontSize: 14, fontWeight: 500, padding: '12px 20px', borderRadius: 8, border: 'none',
              background: '#0d0d0d', color: '#fff',
              cursor: gateReady ? 'pointer' : 'not-allowed',
              opacity: gateReady ? 1 : 0.45,
            }}
          >
            {submitting ? 'Confirming…' : 'Accept & view report'}
          </button>

          {gateError && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#B91C1C', lineHeight: 1.6 }}>{gateError}</div>
          )}
        </div>
        <Footer />
      </Shell>
    )
  }

  // ── Placeholder (Part-1 stand-in for the report) ─────────────────────────────
  // Reached when status is 'valid', or consent was just accepted in-session.
  // Do NOT fetch /api/cbam/verifier-documents here — that wiring is Part 2.
  return (
    <Shell>
      <div style={{ maxWidth: 920, minWidth: 0, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        <ReadOnlyBanner />

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Independent CBAM Verification</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>
          {installationName || 'CBAM Installation'}{reportingPeriod != null ? ` · ${reportingPeriod}` : ''}
        </h1>
        <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, marginBottom: '2rem' }}>Specific Embedded Emissions (SEE) summary</p>

        <SectionHead>Report</SectionHead>
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.5rem', marginBottom: '2rem' }}>
          <div style={{ fontSize: 14, color: '#0d0d0d', marginBottom: 8 }}>Report view — Part 2.</div>
          <div style={{ fontSize: 12, color: '#888784' }}>Verifier: {verifierName || '—'}</div>
        </div>
      </div>
      <Footer />
    </Shell>
  )
}

// Read-only banner — CBAM-scoped. The validate RPC returns no expires_at, so the
// "Access expires" clause is deliberately omitted (no date fabricated).
function ReadOnlyBanner() {
  return (
    <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: '1.5rem', fontSize: 12, color: '#7425e3', fontWeight: 500 }}>
      Read-only verifier view · You are reviewing a CBAM Specific Embedded Emissions (SEE) summary shared for independent verification
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', minHeight: '100vh', minWidth: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
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
// Footer — CBAM-correct assurance citation (IR (EU) 2025/2546 + EN ISO/IEC 14065),
// NOT the GHG page's ISO 14064-3 / ISAE 3410 wording.
function Footer() {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '0 1.5rem 4rem' }}>
      <div style={{ marginTop: '2.5rem', padding: '1rem 1.25rem', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, fontSize: 11, color: '#888784', lineHeight: 1.6 }}>
        This review is generated by the ThemisIQ platform to support independent verification under Implementing Regulation (EU) 2025/2546 by a verifier accredited to EN ISO/IEC 14065. Data is read-only. This page does not itself constitute verification, assurance, or a regulatory filing.
      </div>
    </div>
  )
}
