'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { VERIFIER_DOC_LINK_NOTICE, VERIFIER_DOC_TAB_DID_NOT_OPEN } from '../../../lib/verifierDocNotice'
// Types imported (type-only → erased at runtime) so the render can never drift from
// the builder's contract. Do not re-declare these shapes locally.
import type {
  Report12, CompletenessResult, CompletenessItem, ReportField, Coordinates, ProcessSummary,
  Item4Good, Item12DefaultPrecursor, Item13ActualPrecursor, Item16PrecursorOrigin,
} from '../../../lib/cbam/report/types'
import type { SefaBenchmarkWorkings } from '../../../lib/cbam/sefaCompute'

// CBAM verifier portal — skeleton + state machine + consent gate (Part 1) and the
// §1.2 report render (Part 2).
//
// State is driven entirely by cbam_verifier_validate_token's three-state return
// (see 20260724_cbam_verifier_validate_rpc.sql): status IS the gate signal —
// there is no accepted_at field to read here.
//   • 'invalid'          → invalid/expired screen
//   • 'consent_required' → consent gate
//   • 'valid'            → report (fetched from /api/cbam/verifier-documents)
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
// Success body of POST /api/cbam/verifier-documents (200 only). Non-ok responses
// are { error: string } with NO report — see the fetch effect.
interface VerifierReportResponse {
  report: Report12
  // Replaces the former flat `missing`. completeness.items is a strict superset and
  // carries WHO can clear each item — the distinction that matters most here: a gap
  // the operator can close is a finding about the client, while an item ThemisIQ never
  // produced is a limit on what this evidence can support at all.
  completeness: CompletenessResult
  documents: { id: string; file_name: string; document_type: string }[]
  coverage: { processes_total: number; processes_without_record: number }
  verifier: { verifier_name: string | null; installation_name: string | null; reporting_period: number }
}
// One row from cbam_verifier_audit_history — the whole snapshot pair plus who/when.
// The field-label whitelist (CBAM_AUDIT_FIELD_LABELS) governs what actually renders.
interface AuditHistoryEntry {
  table_name: string
  action: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  user_email: string | null
  created_at: string
}
// cbam_verifier_audit_history's jsonb return. Only 'valid' carries history.
interface AuditHistoryResult {
  status: 'valid' | 'consent_required' | 'invalid'
  history?: AuditHistoryEntry[]
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
  // Report fetch (Part 2). Only fires once access is granted.
  const [report, setReport] = useState<VerifierReportResponse | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  // Change history (Part 2) — same access gate as the report.
  const [history, setHistory] = useState<AuditHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    supabase.rpc('cbam_verifier_validate_token', { p_token: token }).then((res: { data: ValidateResult | null }) => {
      setResult(res.data)
      setLoading(false)
    })
  }, [token])

  // Report fetch — gated on verifier access. Fires when the token is already
  // 'valid' on load, or has just been accepted in-session. Branches on res.ok
  // FIRST: a non-ok body is { error } with no report.
  useEffect(() => {
    const hasAccess = result?.status === 'valid' || accepted
    if (!token || !hasAccess) return
    setReportLoading(true)
    setReportError(null)
    fetch('/api/cbam/verifier-documents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    })
      .then(async r => {
        if (!r.ok) {
          let code = 'unknown'
          try { const b = await r.json(); code = (b && b.error) || 'unknown' } catch { /* non-JSON body */ }
          setReportError(code)
          setReportLoading(false)
          return
        }
        const body = (await r.json()) as VerifierReportResponse
        setReport(body)
        setReportLoading(false)
      })
      .catch(() => { setReportError('unknown'); setReportLoading(false) })
  }, [token, result?.status, accepted])

  // Change-history fetch — same access gate as the report. Anon-client RPC,
  // matching validate/accept (NOT routed through the documents API). Only a
  // 'valid' status carries history; we're already past consent here, so treat
  // consent_required/invalid/absent as an empty trail rather than an error.
  useEffect(() => {
    const hasAccess = result?.status === 'valid' || accepted
    if (!token || !hasAccess) return
    setHistoryLoading(true)
    supabase.rpc('cbam_verifier_audit_history', { p_token: token }).then((res: { data: AuditHistoryResult | null }) => {
      const d = res.data
      setHistory(d && d.status === 'valid' ? (d.history ?? []) : [])
      setHistoryLoading(false)
    }, () => { setHistory([]); setHistoryLoading(false) })
  }, [token, result?.status, accepted])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return <Shell><div style={{ padding: '4rem', textAlign: 'center', color: '#888784' }}>Loading verification review…</div></Shell>

  // ── Invalid / expired ────────────────────────────────────────────────────────
  if (!result || result.status === 'invalid') return <InvalidScreen />

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
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '1.75rem' }}>
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

  // ── Valid / accepted → the real §1.2 report ──────────────────────────────────
  // Report-fetch error states. consent_required/invalid → the invalid screen;
  // stale_record → its own message; anything else → generic.
  if (reportError === 'invalid' || reportError === 'consent_required') return <InvalidScreen />
  if (reportError === 'stale_record') {
    return <ErrorScreen title="Report could not be verified" body="This report could not be verified — a stored figure no longer matches recomputation. Contact the company that shared it." />
  }
  if (reportError) return <ErrorScreen title="Report unavailable" body="The report could not be loaded." />

  if (reportLoading || !report) {
    return (
      <Shell>
        <div style={{ maxWidth: 920, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
          <ReadOnlyBanner />
          <div style={{ padding: '3rem', textAlign: 'center', color: '#888784' }}>Loading the verification report…</div>
        </div>
        <Footer />
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ maxWidth: 920, minWidth: 0, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        <ReadOnlyBanner />

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Independent CBAM Verification</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>
          {installationName || 'CBAM Installation'}{reportingPeriod != null ? ` · ${reportingPeriod}` : ''}
        </h1>
        <p style={{ fontSize: 14, color: '#555553', fontWeight: 400, marginBottom: '2rem' }}>
          Specific Embedded Emissions (SEE) summary — IR (EU) 2025/2547 Annex IV §1.2{verifierName ? ` · Prepared for ${verifierName}` : ''}
        </p>

        {/* Signed-URL expiry notice. URLs are minted fresh per-document on click (short TTL),
            not pre-baked — so this warns about the on-click flow, shown whenever documents exist. */}
        {report.documents.length > 0 && (
          <div style={{ background: '#fef3c7', border: '0.5px solid #fde68a', borderRadius: 10, padding: '10px 16px', marginBottom: '2rem', fontSize: 13, color: '#92400e', fontWeight: 500 }}>
            {VERIFIER_DOC_LINK_NOTICE}
          </div>
        )}

        <ReportBody data={report} token={token} history={history} historyLoading={historyLoading} />
      </div>
      <Footer />
    </Shell>
  )
}

// ── Report render spine ──────────────────────────────────────────────────────

// Value formatters, keyed by T.
const fmtNum = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 4 })
const fmtBool = (v: boolean) => (v ? 'Yes' : 'No')
const fmtCoords = (c: Coordinates) => `${c.latitude}, ${c.longitude}`
const fmtBenchmark = (b: SefaBenchmarkWorkings): React.ReactNode => (
  <>
    {fmtNum(b.value)}{' '}
    <span style={{ color: '#888784', fontSize: 11 }}>(Column {b.column} · indicator {b.indicator ?? '—'} · CSCF {fmtNum(b.cscf)})</span>
  </>
)

const shortId = (id: string) => (id.length > 10 ? id.slice(0, 8) + '…' : id)

const cardStyle: React.CSSProperties = { background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 10 }

// The absence-is-not-a-value invariant, made visual: a missing field must never look
// like a blank or a zero.
function MissingMarker() {
  return <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 8px', borderRadius: 4 }}>Not provided</span>
}

// The single ReportField<T> renderer. Narrows on status BEFORE reading value/reason.
function Field<T>({ f, format }: { f: ReportField<T>; format?: (v: T) => React.ReactNode }) {
  if (f.status === 'missing') return <MissingMarker />
  if (f.status === 'not_applicable') return <span style={{ color: '#888784', fontStyle: 'italic' }}>{f.reason}</span>
  return <span style={{ color: '#0d0d0d' }}>{format ? format(f.value) : String(f.value)}</span>
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 12, padding: '7px 0', borderBottom: '0.5px solid #e8e7e4', fontSize: 13, alignItems: 'baseline' }}>
      <div style={{ color: '#888784' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <SectionHead>{n} · {title}</SectionHead>
      {children}
    </div>
  )
}

const NoneNote = () => <div style={{ fontSize: 13, color: '#888784' }}>None.</div>

// (3) — ReportField<ProcessSummary[]> rendered as a small table on 'value'.
function ProcessesField({ f }: { f: ReportField<ProcessSummary[]> }) {
  if (f.status === 'missing') return <MissingMarker />
  if (f.status === 'not_applicable') return <span style={{ color: '#888784', fontStyle: 'italic' }}>{f.reason}</span>
  if (f.value.length === 0) return <NoneNote />
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#0d0d0d' }}>
            {['Process', 'Route', 'Goods (CN)'].map(h => (
              <th key={h} style={{ color: '#fff', textAlign: 'left', padding: '8px 10px', fontWeight: 500, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {f.value.map((p, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
              <td style={{ padding: '8px 10px', color: '#555553', whiteSpace: 'nowrap' }}>{shortId(p.processId)}</td>
              <td style={{ padding: '8px 10px', color: '#555553' }}>{p.route ?? <span style={{ color: '#888784' }}>—</span>}</td>
              <td style={{ padding: '8px 10px', color: '#0d0d0d' }}>{p.goods.length ? p.goods.join(', ') : <span style={{ color: '#888784' }}>—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// (4) — one good. The core numbers block.
function GoodCard({ g }: { g: Item4Good }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>
        Good {g.cnCode ?? '—'} <span style={{ fontWeight: 400, color: '#888784' }}>· process {shortId(g.processId)}</span>
      </div>
      <Row label="Specific direct (4)(a)"><Field f={g.specificDirect} format={fmtNum} /></Row>
      <Row label="Default share, direct (4)(b)"><Field f={g.defaultShareDirect} format={fmtNum} /></Row>
      <Row label="Indirect · actual share (4)(c)"><Field f={g.indirect.actualShare} format={fmtNum} /></Row>
      <Row label="Indirect · default share (4)(c)"><Field f={g.indirect.defaultShare} format={fmtNum} /></Row>
      <Row label="Indirect · criteria confirmed (4)(c)"><Field f={g.indirect.criteriaConfirmation} format={fmtBool} /></Row>
      <Row label="Indirect · specific (4)(c)"><Field f={g.indirect.specificIndirect} format={fmtNum} /></Row>
      <Row label="Imported electricity (4)(d)"><Field f={g.importedElectricity} /></Row>
      <Row label="SEFA — free allocation (4)(e)"><Field f={g.sefa} format={fmtNum} /></Row>
      <Row label="Benchmark used (4)(f)"><Field f={g.benchmarkConfirmation} format={fmtBenchmark} /></Row>
    </div>
  )
}

// One source-document row. The signed URL is NOT pre-baked — on click it POSTs
// { token, docId } to /api/cbam/verifier-documents/sign, which re-validates
// token + consent + scope and mints a fresh short-TTL URL, then opens it in a
// new tab. Per-row loading/error state lives here so each row is independent.
function DocRow({ doc, token }: { doc: { id: string; file_name: string; document_type: string }; token: string }) {
  const [signing, setSigning] = useState(false)
  const [failed, setFailed] = useState(false)
  // Set only when the tab did not open but signing SUCCEEDED — we surface the URL as a
  // real anchor the verifier clicks themselves (a fresh user gesture a blocker won't
  // suppress). A post-await window.open would be eaten by the same blocker.
  const [manualUrl, setManualUrl] = useState<string | null>(null)

  const openDoc = async () => {
    // Open the tab SYNCHRONOUSLY inside the click gesture, before any await — a strict
    // popup blocker (locked-down corporate browsers) suppresses tabs opened after an
    // async hop. We navigate this blank tab once the signed URL returns.
    //
    // NO WINDOW FEATURES, DELIBERATELY. This call used to pass 'noopener,noreferrer', which cannot
    // work here: noopener severs the handle BY DEFINITION and makes window.open return null, so
    // `tab` was always null, the navigate-the-blank-tab path never once ran, and every successful
    // click fell through to the manual link while orphaning an about:blank tab nobody could close.
    // Dropping only noopener would not have fixed it either — per the HTML spec noreferrer sets
    // noopener too, so both had to go.
    //
    // The opener is then severed the other way, immediately, while the tab is still about:blank and
    // therefore same-origin. Per the WHATWG opener setter, assigning null sets the BROWSING
    // CONTEXT's opener to null, so the disown survives the navigation below, closing reverse
    // tabnabbing (opener.location stays permitted cross-origin). This bucket's MIME allowlist —
    // pdf/png/jpeg/csv/xlsx, none of which run script — already makes that unreachable here; the
    // GHG bucket has no allowlist and genuinely needs it. Kept identical on both surfaces so the
    // protection does not depend on a bucket policy staying as it is today.
    //
    // noreferrer is not needed for privacy: the browser default (strict-origin-when-cross-origin)
    // sends only the bare origin cross-origin, so the access token in this page's PATH is not sent.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    setSigning(true)
    setFailed(false)
    setManualUrl(null)
    try {
      const res = await fetch('/api/cbam/verifier-documents/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, docId: doc.id }),
      })
      const body = res.ok ? ((await res.json()) as { url?: string }) : null
      if (!body?.url) {
        if (tab) tab.close()
        setFailed(true)
        return
      }
      if (tab) {
        tab.location = body.url
      } else {
        // Synchronous tab was blocked — surface the link instead of a post-await
        // window.open the same blocker would also eat.
        setManualUrl(body.url)
      }
    } catch {
      if (tab) tab.close()
      setFailed(true)
    } finally {
      setSigning(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{doc.file_name}</div>
        <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{doc.document_type}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {failed && <span style={{ fontSize: 11, color: '#B91C1C' }}>Unavailable — try again</span>}
        {manualUrl && (
          <span style={{ fontSize: 11, color: '#92400e' }}>
            {VERIFIER_DOC_TAB_DID_NOT_OPEN}{' '}
            <a href={manualUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7425e3', textDecoration: 'underline' }}>Open document</a>
          </span>
        )}
        <button
          onClick={openDoc}
          disabled={signing}
          style={{ fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#0d0d0d', color: '#fff', cursor: signing ? 'wait' : 'pointer', opacity: signing ? 0.6 : 1 }}
        >
          {signing ? 'Opening…' : 'View'}
        </button>
      </div>
    </div>
  )
}

// Field-label WHITELIST for the verifier change history. Only columns present here
// render — the RPC forwards the full snapshot, so any column NOT listed (company_id,
// id, installation_id, created_at, updated_at, the attestation timestamp) is
// structurally unrenderable. Keyed by table_name; the two audited tables share no
// column names. Verifier-appropriate operator declarations only.
const CBAM_AUDIT_FIELD_LABELS: Record<string, Record<string, string>> = {
  cbam_installation_disclosures: {
    reporting_period: 'Reporting period',
    heat_imported: 'Heat imported',
    heat_exported: 'Heat exported',
    zero_rated_fuels_used: 'Zero-rated fuels used',
    zero_rated_fuels_demonstration: 'Zero-rated fuels demonstration',
    waste_gases_produced_used: 'Waste gases produced & used',
    waste_gases_imported: 'Waste gases imported',
    waste_gases_exported: 'Waste gases exported',
    co2_capture_used: 'CO₂ capture used',
    co2_capture_transferred_to: 'CO₂ capture transferred to',
    electricity_produced_onsite: 'Electricity produced on-site',
    elec_cogeneration: 'Electricity — co-generation',
    elec_separate_generation: 'Electricity — separate generation',
    elec_source_fossil: 'Electricity — fossil source',
    elec_source_renewable: 'Electricity — renewable source',
    elec_exported_from_process: 'Electricity — exported from process',
    processes_complete: 'Process set declared complete',
  },
  cbam_production_processes: {
    cn_code: 'CN code',
    category_code: 'Goods category',
    route_code: 'Production route',
    steel_grade: 'Steel grade',
    activity_level: 'Activity level',
    electricity_consumed: 'Electricity consumed (MWh)',
    calc_mode: 'Calculation mode',
  },
}
const AUDIT_ACTION_LABEL: Record<string, string> = { INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Removed' }
const AUDIT_TABLE_TAG: Record<string, string> = {
  cbam_installation_disclosures: 'Disclosures',
  cbam_production_processes: 'Process',
}

// Value formatter for audit diffs: booleans → Yes/No, null/empty → —.
function fmtAudit(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.join(', ') || '—'
  return String(v)
}

// Reduce one audit entry to its renderable, whitelisted field changes.
// UPDATE → only fields whose value changed (from → to). INSERT → mapped fields set
// in new_values (to only). DELETE → mapped fields that were set in old_values (from
// only). Fields absent from the map are never emitted; INSERT/DELETE skip '—' (a
// null/unset field carries no signal), but a real `false` (→ 'No') is kept.
function auditChanges(entry: AuditHistoryEntry): { label: string; from: string | null; to: string | null }[] {
  const labels = CBAM_AUDIT_FIELD_LABELS[entry.table_name]
  if (!labels) return []
  const o = entry.old_values || {}
  const n = entry.new_values || {}
  const rows: { label: string; from: string | null; to: string | null }[] = []
  for (const key of Object.keys(labels)) {
    const label = labels[key]
    if (entry.action === 'UPDATE') {
      const from = fmtAudit(o[key]); const to = fmtAudit(n[key])
      if (from !== to) rows.push({ label, from, to })
    } else if (entry.action === 'INSERT') {
      const to = fmtAudit(n[key])
      if (to !== '—') rows.push({ label, from: null, to })
    } else if (entry.action === 'DELETE') {
      const from = fmtAudit(o[key])
      if (from !== '—') rows.push({ label, from, to: null })
    }
  }
  return rows
}

function ReportBody({ data, token, history, historyLoading }: { data: VerifierReportResponse; token: string; history: AuditHistoryEntry[]; historyLoading: boolean }) {
  const { report: r, completeness, documents, coverage } = data
  return (
    <>
      {/* Coverage callout — the "with summary" completeness signal, near the top. */}
      {coverage.processes_without_record > 0 ? (
        <div style={{ background: '#fef3c7', border: '0.5px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: '2rem', fontSize: 13, color: '#92400e', fontWeight: 500 }}>
          {coverage.processes_without_record} of {coverage.processes_total} processes are not yet backed by a computed record.
        </div>
      ) : (
        <div style={{ marginBottom: '2rem', fontSize: 12, color: '#888784' }}>
          All {coverage.processes_total} processes backed by computed records.
        </div>
      )}

      {/* (1) Operator */}
      <Section n="1" title="Operator">
        <Row label="Name (1)(a)"><Field f={r.item1_operator.name} /></Row>
        <Row label="Registration no. (1)(b)"><Field f={r.item1_operator.registrationNo} /></Row>
        <Row label="Address (1)(c)"><Field f={r.item1_operator.address} /></Row>
      </Section>

      {/* (2) Installation */}
      <Section n="2" title="Installation">
        <Row label="Name (2)(a)"><Field f={r.item2_installation.name} /></Row>
        <Row label="CBAM Registry ID (2)(b)"><Field f={r.item2_installation.cbamRegistryId} /></Row>
        <Row label="UN/LOCODE (2)(c)"><Field f={r.item2_installation.unLocode} /></Row>
        <Row label="Address (2)(d)"><Field f={r.item2_installation.address} /></Row>
        <Row label="Coordinates (2)(e)"><Field f={r.item2_installation.coordinates} format={fmtCoords} /></Row>
      </Section>

      {/* (3) Processes */}
      <Section n="3" title="Production processes & routes">
        <ProcessesField f={r.item3_processes} />
      </Section>

      {/* (4) Per-good emissions — optional */}
      {r.item4_perGood !== undefined && (
        <Section n="4" title="Per-good embedded emissions">
          {r.item4_perGood.length === 0 ? <NoneNote /> : r.item4_perGood.map((g, i) => <GoodCard key={i} g={g} />)}
        </Section>
      )}

      {/* (5) Total direct — optional */}
      {r.item5_totalDirect !== undefined && (
        <Section n="5" title="Total direct emissions">
          {r.item5_totalDirect.perProcess.map((pp, i) => (
            <Row key={i} label={`Process ${shortId(pp.processId)}`}><Field f={pp.totalDirect} format={fmtNum} /></Row>
          ))}
          <Row label="Installation total"><Field f={r.item5_totalDirect.installationTotal} format={fmtNum} /></Row>
        </Section>
      )}

      {/* (6) Indirect — optional, bare ReportField<number> */}
      {r.item6_indirect !== undefined && (
        <Section n="6" title="Installation indirect emissions">
          <Row label="Indirect (tCO2e)"><Field f={r.item6_indirect} format={fmtNum} /></Row>
        </Section>
      )}

      {/* (7) Heat */}
      <Section n="7" title="Measurable heat">
        <Row label="Imported"><Field f={r.item7_heat.imported} format={fmtBool} /></Row>
        <Row label="Exported"><Field f={r.item7_heat.exported} format={fmtBool} /></Row>
      </Section>

      {/* (8) Zero-rated fuels */}
      <Section n="8" title="Zero-rated fuels">
        <Row label="Used"><Field f={r.item8_zeroRatedFuels.used} format={fmtBool} /></Row>
        <Row label="Demonstration"><Field f={r.item8_zeroRatedFuels.demonstration} /></Row>
      </Section>

      {/* (9) Waste gases */}
      <Section n="9" title="Waste gases">
        <Row label="Produced & used"><Field f={r.item9_wasteGases.producedUsed} format={fmtBool} /></Row>
        <Row label="Imported"><Field f={r.item9_wasteGases.imported} format={fmtBool} /></Row>
        <Row label="Exported"><Field f={r.item9_wasteGases.exported} format={fmtBool} /></Row>
      </Section>

      {/* (10) CO2 capture */}
      <Section n="10" title="CO₂ capture">
        <Row label="Used"><Field f={r.item10_co2Capture.used} format={fmtBool} /></Row>
        <Row label="Transferred to"><Field f={r.item10_co2Capture.transferredTo} /></Row>
      </Section>

      {/* (11) On-site electricity */}
      <Section n="11" title="On-site electricity">
        <Row label="Produced on-site (gate)"><Field f={r.item11_onsiteElectricity.producedOnsite} format={fmtBool} /></Row>
        <Row label="Co-generation (11)(a)"><Field f={r.item11_onsiteElectricity.cogeneration} format={fmtBool} /></Row>
        <Row label="Separate generation (11)(b)"><Field f={r.item11_onsiteElectricity.separateGeneration} format={fmtBool} /></Row>
        <Row label="Fossil source (11)(c)"><Field f={r.item11_onsiteElectricity.sourceFossil} format={fmtBool} /></Row>
        <Row label="Renewable source (11)(c)"><Field f={r.item11_onsiteElectricity.sourceRenewable} format={fmtBool} /></Row>
        <Row label="Exported from process (11)(d)"><Field f={r.item11_onsiteElectricity.exportedFromProcess} format={fmtBool} /></Row>
      </Section>

      {/* (12) Default-value precursors — optional */}
      {r.item12_defaultPrecursors !== undefined && (
        <Section n="12" title="Precursors — default values">
          {r.item12_defaultPrecursors.length === 0 ? <NoneNote /> : r.item12_defaultPrecursors.map((p: Item12DefaultPrecursor, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>{p.cnCode}</div>
              <Row label="Name (12)(b)"><Field f={p.name} /></Row>
              <Row label="Country of origin (12)(c)"><Field f={p.originCountry} /></Row>
              <Row label="Default value (12)(d)"><Field f={p.defaultValue} format={fmtNum} /></Row>
            </div>
          ))}
        </Section>
      )}

      {/* (13) Actual-value precursors — optional */}
      {r.item13_actualPrecursors !== undefined && (
        <Section n="13" title="Precursors — actual values">
          {r.item13_actualPrecursors.length === 0 ? <NoneNote /> : r.item13_actualPrecursors.map((p: Item13ActualPrecursor, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>{p.cnCode}</div>
              <Row label="Name (13)(b)"><Field f={p.name} /></Row>
              <Row label="Country of origin (13)(c)"><Field f={p.originCountry} /></Row>
              <Row label="Reporting period (13)(d)"><Field f={p.reportingPeriod} format={fmtNum} /></Row>
              <Row label="Specific direct (13)(e)"><Field f={p.specificDirect} format={fmtNum} /></Row>
              <Row label="Specific indirect (13)(e)"><Field f={p.specificIndirect} format={fmtNum} /></Row>
            </div>
          ))}
        </Section>
      )}

      {/* (14) / (15) — Article 14 averaging. ReportField<never>: status only. Optional. */}
      {r.item14_multiPeriodPrecursor !== undefined && (
        <Section n="14" title="Multi-period precursor averaging">
          <div style={{ fontSize: 13 }}><Field f={r.item14_multiPeriodPrecursor} /></div>
        </Section>
      )}
      {r.item15_multiInstallationPrecursor !== undefined && (
        <Section n="15" title="Multi-installation precursor averaging">
          <div style={{ fontSize: 13 }}><Field f={r.item15_multiInstallationPrecursor} /></div>
        </Section>
      )}

      {/* (16) Precursor origin — optional */}
      {r.item16_precursorOrigin !== undefined && (
        <Section n="16" title="Precursor origin (traceability)">
          {r.item16_precursorOrigin.length === 0 ? <NoneNote /> : r.item16_precursorOrigin.map((p: Item16PrecursorOrigin, i) => (
            <div key={i} style={cardStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>{p.cnCode}</div>
              <Row label="Operator of origin"><Field f={p.operatorName} /></Row>
              <Row label="Installation of origin"><Field f={p.installationName} /></Row>
              <Row label="CBAM Registry ID of origin"><Field f={p.cbamRegistryId} /></Row>
              <Row label="Reporting period"><Field f={p.reportingPeriod} format={fmtNum} /></Row>
            </div>
          ))}
        </Section>
      )}

      {/* Source documents */}
      <div style={{ marginBottom: '2rem' }}>
        <SectionHead>Source documents</SectionHead>
        <p style={{ fontSize: 12, color: '#888784', fontWeight: 400, lineHeight: 1.6, marginBottom: '1rem' }}>{VERIFIER_DOC_LINK_NOTICE}</p>
        {documents.length === 0 ? (
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.5rem', textAlign: 'center', fontSize: 13, color: '#888784' }}>No source documents attached.</div>
        ) : documents.map((d) => (
          <DocRow key={d.id} doc={d} token={token} />
        ))}
      </div>

      {/* Completeness — scope limitations first, then operator gaps. */}
      <div style={{ marginBottom: '2rem' }}>
        <SectionHead>Completeness</SectionHead>

        {completeness.limitations.length > 0 && (
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555553', marginBottom: 4 }}>Scope limitations of the producing tool</div>
            <p style={{ fontSize: 12, color: '#888784', fontWeight: 400, lineHeight: 1.6, marginBottom: '0.75rem' }}>These §1.2 items were not produced by ThemisIQ. Each is recorded rather than omitted or estimated. They are not operator gaps — no action by the operator clears them, and they are excluded from the supplied count below.</p>
            {completeness.limitations.map((m: CompletenessItem, i: number) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 0', borderBottom: '0.5px solid #e8e7e4', fontSize: 13 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#555553', background: '#e8e7e4', padding: '1px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{m.item}</span>
                <span style={{ color: '#555553' }}>{m.field}</span>
                <span style={{ color: '#888784', fontStyle: 'italic' }}>— {m.responsibility === 'platform' ? 'input not built' : 'unresolved in the regulation'}</span>
                {m.hint ? <span style={{ color: '#888784' }}>— {m.hint}</span> : null}
              </div>
            ))}
          </div>
        )}

        <div style={{ fontSize: 12, color: '#888784', marginBottom: completeness.outstandingCount > 0 ? '0.75rem' : 0 }}>
          {completeness.suppliedCount} of {completeness.requiredCount} operator-supplied fields provided.
        </div>

        {completeness.outstandingCount === 0 ? (
          <div style={{ fontSize: 13, color: '#0F6E56' }}>No operator gaps — every required field is supplied or accounted for.</div>
        ) : (
          <div>
            {completeness.items
              .filter((i: CompletenessItem) => i.responsibility === 'operator' && i.state === 'outstanding')
              .map((m: CompletenessItem, i: number) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '6px 0', borderBottom: '0.5px solid #e8e7e4', fontSize: 13 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e', background: '#fef3c7', padding: '1px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{m.item}</span>
                  <span style={{ color: '#0d0d0d' }}>{m.field}</span>
                  {m.hint ? <span style={{ color: '#888784' }}>— {m.hint}</span> : null}
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Change history — operator edits to this tuple's disclosures & processes. */}
      <div style={{ marginTop: '2rem' }}>
        <SectionHead>Change history</SectionHead>
        {historyLoading ? (
          <div style={{ fontSize: 13, color: '#888784' }}>Loading change history…</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 13, color: '#888784' }}>No changes recorded.</div>
        ) : (
          history.map((entry, i) => {
            const changes = auditChanges(entry)
            const actionLabel = AUDIT_ACTION_LABEL[entry.action] ?? entry.action
            const tag = AUDIT_TABLE_TAG[entry.table_name] ?? entry.table_name
            return (
              <div key={i} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: changes.length ? 8 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#555553', background: '#f0efed', padding: '2px 8px', borderRadius: 4 }}>{tag}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{actionLabel}</span>
                    <span style={{ fontSize: 12, color: '#888784' }}>{entry.user_email || 'System'}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#888784' }}>{new Date(entry.created_at).toLocaleString()}</span>
                </div>
                {changes.length > 0 && (
                  <div style={{ borderTop: '0.5px solid #f0efed', paddingTop: 8 }}>
                    {changes.map((c, j) => (
                      <div key={j} style={{ fontSize: 12, color: '#555553', padding: '2px 0' }}>
                        <span style={{ color: '#888784' }}>{c.label}:</span>{' '}
                        {c.from != null && c.to != null ? (
                          <><span style={{ textDecoration: 'line-through', color: '#888784' }}>{c.from}</span> <span style={{ color: '#888784' }}>→</span> <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{c.to}</span></>
                        ) : c.to != null ? (
                          <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{c.to}</span>
                        ) : (
                          <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{c.from}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </>
  )
}

// ── Chrome (unchanged from Part 1) ───────────────────────────────────────────

// Read-only banner — CBAM-scoped. The validate RPC returns no expires_at, so the
// "Access expires" clause is deliberately omitted (no date fabricated).
function ReadOnlyBanner() {
  return (
    <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: '1.5rem', fontSize: 12, color: '#7425e3', fontWeight: 500 }}>
      Read-only verifier view · You are reviewing a CBAM Specific Embedded Emissions (SEE) summary shared for independent verification
    </div>
  )
}

// The invalid/expired screen — used for a bad token AND for a report fetch that
// returns invalid / consent_required (access lost between validate and fetch).
function InvalidScreen() {
  return (
    <Shell>
      <div style={{ maxWidth: 540, margin: '4rem auto', textAlign: 'center', padding: '0 1.5rem' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>Link invalid or expired</h1>
        <p style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, fontWeight: 400 }}>This link is invalid or has expired. It may have been revoked. Please contact the company that shared it with you to request a new link.</p>
      </div>
      <Footer />
    </Shell>
  )
}

// Generic centred error screen (stale_record, unexpected report failures).
function ErrorScreen({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div style={{ maxWidth: 540, margin: '4rem auto', textAlign: 'center', padding: '0 1.5rem' }}>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>{title}</h1>
        <p style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, fontWeight: 400 }}>{body}</p>
      </div>
      <Footer />
    </Shell>
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
