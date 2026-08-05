'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { VERIFIER_DOC_LINK_NOTICE, VERIFIER_DOC_TAB_DID_NOT_OPEN } from '../../../lib/verifierDocNotice'

// METADATA ONLY — no old_values / new_values. The RPC used to return full before/after row
// snapshots of ghg_inventories, which put every column back within reach of a verifier regardless of
// what the inventory projection withheld: revenue, headcount, prior-year figures, internal ids. The
// page filtered them for DISPLAY, which did nothing about the payload itself.
//
// `changed_fields` carries the NAMES of the fields that changed, already intersected server-side
// with the inventory whitelist — so a field the verifier cannot see is not named as having changed
// either. Optional because it only arrives once the RPC change lands; until then an entry renders as
// metadata alone rather than claiming nothing changed.
interface AuditEntry {
  id: string; action: string; user_email: string | null; created_at: string
  changed_fields?: string[] | null
}
// METADATA ONLY. No signed_url and no file_path: URLs are minted per-document on click (see
// openVerifierDoc below), so nothing on this page carries a clock the verifier cannot see. `id` is
// null for a legacy document uploaded before ids existed — it cannot be signed, so its row says so.
interface VerifierDoc { id: string | null; file_name: string; document_type: string; location: string }
interface WorkingRow {
  location: string; source: string; scope: number
  // NULLABLE, because the engine emits null and always has. These were declared `number`, the RPC
  // response is asserted rather than validated, and so tsc had nothing to check — the first thing to
  // notice was a TypeError on the page an assurance provider reads. Coverage-resolution rows carry
  // activity_data: null; undeclared-stream rows carry result_tco2e: null.
  activity_data: number | null; activity_unit: string
  emission_factor: string; ef_source: string; gwp_basis: string
  result_tco2e: number | null
  // Concierge provenance (present only for bill-sourced rows). Lets a verifier trace a figure
  // back to the quote read off the bill; 'concierge-extrapolated' rows are grossed-up estimates.
  source_quotes?: string[]
  source_doc_ids?: string[]
  // Index-aligned with source_quotes: the storage path behind quote[i]. Used ONLY as a lookup key
  // into pathToDocId below — the path is never sent anywhere; the document id it resolves to is.
  // (source_doc_ids cannot serve here: the engine DEDUPES it while pushing filePaths once per quote,
  // so source_doc_ids[i] is not "the document behind quote i".)
  source_file_paths?: string[]
  entry_method?: 'manual' | 'concierge' | 'concierge-extrapolated'
  extrapolation_note?: string
  // A convert-then-apply step, where one was needed: fuel oil entered in litres and steam entered
  // in GJ are converted to the unit their published factor is per, and this records the arithmetic.
  // Distinct from extrapolation_note, which is about PROVENANCE (a grossed-up estimate) and renders
  // beside the source quotes; this is about the ACTIVITY FIGURE and renders beside it.
  note?: string
  // Rows that record ABSENCE rather than a calculation. A verifier needs these more than the
  // operator does: 'attested_absent' is evidence (someone confirmed there is none, and when),
  // 'undeclared' is the absence of evidence (nobody answered). Filtering them off this page would
  // hide the incomplete parts of an inventory from the surface used to assess completeness.
  declaration?: 'attested_absent' | 'undeclared'
}
// ⚠️ THIS INTERFACE IS A SHAPE, NOT A FILTER. The RPC decides what a verifier receives; declaring a
// field here does not request it, and omitting one does not withhold it. Fields are listed only when
// the page renders them — revenue_millions, scope1_intensity and scope2_intensity were declared here
// but never rendered, which made the payload look narrower than it was.
interface InventoryData {
  company_name: string; reporting_year: number
  boundary_approach: string; selected_frameworks: string[]
  scope1_total: number; scope2_location_total: number; scope2_market_total: number
  // ISO 14064-3 7.1.4.9(b): the verifier must be able to confirm which GWP set the figures use.
  // Optional because a row saved before the RPC carried it will not have one — see the header render.
  gwp_version?: string | null
  // get_verifier_inventory returns to_jsonb(i) — the whole inventory row — so source_docs come down
  // with it. Declared here because the inline quote links need the path→id correlation, and taking
  // it from data already in the payload avoids asking the documents route for paths as well.
  locations_data: { name: string; source_docs?: { id?: string; file_path?: string }[] }[]
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

// ── Plain-language names for the fields an audit entry can report as changed ─────────────────────
// A verifier reading "scope2_location_total" is reading our schema, not our inventory. Every value
// the RPC can emit in changed_fields is named here in the words the standard and the customer use.
//
// ⚠️ THIS MAP MUST MIRROR THE `k in (…)` WHITELIST IN get_verifier_inventory. That list is what
// bounds the possible values; this one is what makes them readable. A column added there without a
// label here renders as "Another field" — informative enough not to break the trail, vague enough
// that someone notices. It should never appear.
const AUDIT_FIELD_LABELS: Record<string, string> = {
  company_name:          'Company name',
  reporting_year:        'Reporting year',
  fiscal_year_end_month: 'Financial year end',
  boundary_approach:     'Organisational boundary',
  selected_frameworks:   'Reporting frameworks',
  scope1_total:          'Scope 1 total',
  scope2_location_total: 'Scope 2 total (location-based)',
  scope2_market_total:   'Scope 2 total (market-based)',
  locations_data:        'Location data',
  workings:              'Calculation workings',
  coverage_resolutions:  'Coverage resolutions',
  gwp_version:           'GWP basis',
  pct_estimated:         'Share of estimated data',
}
const auditFieldLabel = (key: string): string => AUDIT_FIELD_LABELS[key] ?? 'Another field'

// ── Opening a source document ───────────────────────────────────────────────────────────────────
// Shared by the Source Documents list and the inline quote links inside the workings table. Both
// mint their own URL at the moment of the click, so neither can go stale while the page is read —
// which is what the pre-baked batch could not offer, since its clock started at page load.
function useDocOpener(token: string) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Set only when the tab did not open but signing SUCCEEDED — we surface the URL as a real anchor
  // the verifier clicks themselves (a fresh user gesture a blocker won't suppress). A post-await
  // window.open would be eaten by the same blocker.
  const [manualUrl, setManualUrl] = useState<string | null>(null)

  const open = async (docId: string) => {
    // Open the tab SYNCHRONOUSLY inside the click gesture, before any await — a strict popup
    // blocker (the locked-down browsers an assurance firm tends to run) suppresses tabs opened
    // after an async hop. We navigate this blank tab once the signed URL returns.
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
    // CONTEXT's opener to null, so the disown survives the navigation below. That closes reverse
    // tabnabbing — an opened page calling opener.location, which stays permitted cross-origin — and
    // it matters more here than it looks: the GHG bucket has no MIME allowlist, so a customer can
    // upload an HTML "bill" that Supabase serves as text/html and that runs script in the verifier's
    // browser. The party who would benefit from redirecting a verifier is the party being verified.
    //
    // noreferrer is not needed for privacy: the browser default (strict-origin-when-cross-origin)
    // sends only the bare origin cross-origin, so the access token in this page's PATH is not sent,
    // and the recipient is Supabase, which stores the documents anyway.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    setBusy(true); setFailed(false); setManualUrl(null)
    try {
      const res = await fetch('/api/verifier-documents/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, docId }),
      })
      const body = res.ok ? ((await res.json()) as { url?: string }) : null
      if (!body?.url) { if (tab) tab.close(); setFailed(true); return }
      if (tab) tab.location = body.url
      else setManualUrl(body.url)
    } catch {
      if (tab) tab.close()
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return { busy, failed, manualUrl, open }
}

// One source-document row. Per-row state, so a failure on one document says nothing about another.
function SourceDocRow({ doc, token }: { doc: VerifierDoc; token: string }) {
  const { busy, failed, manualUrl, open } = useDocOpener(token)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{doc.file_name}</div>
        <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{doc.location} · {doc.document_type}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {failed && <span style={{ fontSize: 11, color: '#B91C1C' }}>Couldn&rsquo;t open — try again</span>}
        {manualUrl && (
          <span style={{ fontSize: 11, color: '#92400e' }}>
            {VERIFIER_DOC_TAB_DID_NOT_OPEN}{' '}
            <a href={manualUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#7425e3', textDecoration: 'underline' }}>Open document</a>
          </span>
        )}
        {doc.id ? (
          <button onClick={() => open(doc.id!)} disabled={busy} style={{ fontSize: 12, padding: '6px 16px', borderRadius: 6, border: 'none', background: '#0d0d0d', color: '#fff', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Opening…' : 'View'}
          </button>
        ) : (
          // A document stored before uploads carried an id. It cannot be resolved to a file, so we
          // say that rather than offer a button certain to fail. The document is still listed: a
          // verifier needs to know the evidence exists even when this page cannot serve it.
          <span style={{ fontSize: 11, color: '#888784' }}>Not available here — ask the company for a copy</span>
        )}
      </div>
    </div>
  )
}

// One quoted line lifted off a bill, inside the workings table. Rendered as a button rather than an
// anchor because there is no URL until the click; styled as a link because that is what it is.
function SourceQuoteLink({ quote, docId, token }: { quote: string; docId: string; token: string }) {
  const { busy, failed, manualUrl, open } = useDocOpener(token)
  const linkStyle: React.CSSProperties = {
    color: '#7425e3', textDecoration: 'underline', textDecorationThickness: '0.5px', textUnderlineOffset: 2,
    background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: busy ? 'wait' : 'pointer',
  }
  // Same state as the document list's fallback, and it must SAY so. This used to swap the button
  // for an anchor silently: the quote simply stopped responding to the first click and needed a
  // second, with nothing on screen explaining why. A verifier tracing a figure would reasonably
  // conclude the link was broken. The quote itself is the link here, so the note points at it
  // rather than offering a separate one.
  if (manualUrl) {
    return (
      <>
        <a href={manualUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>{`"${quote}"`}</a>
        <span style={{ color: '#92400e', fontStyle: 'normal' }}> ({VERIFIER_DOC_TAB_DID_NOT_OPEN.replace(/\.$/, '')} — click the quote to open it)</span>
      </>
    )
  }
  return (
    <>
      <button onClick={() => open(docId)} disabled={busy} style={linkStyle}>{`"${quote}"`}</button>
      {failed && <span style={{ color: '#B91C1C', fontStyle: 'normal' }}> (couldn&rsquo;t open — try again)</span>}
    </>
  )
}

export default function VerifierPage() {
  const params = useParams()
  const token = params.token as string
  const [data, setData] = useState<VerifierPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [docs, setDocs] = useState<VerifierDoc[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  // Workings table is min-width:720 inside an overflow-x:auto wrapper; show a scroll hint
  // only when it actually overflows (narrow screens), never when the whole table fits.
  const workingsScrollRef = useRef<HTMLDivElement | null>(null)
  const [isScrollable, setIsScrollable] = useState(false)
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
  //
  // METADATA ONLY. This used to batch-sign every document here, which started a ten-minute clock at
  // PAGE LOAD: a verifier who read the workings for eleven minutes found every link on the page
  // dead at once. URLs are now minted per-document on click, so this response holds nothing
  // perishable and the page can sit open as long as the reading takes.
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

  // Measure whether the workings table overflows its wrapper; re-measure on resize.
  useEffect(() => {
    const measure = () => {
      const el = workingsScrollRef.current
      setIsScrollable(!!el && el.scrollWidth > el.clientWidth)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [data, accepted, docs])

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
  // Correlate a workings row's source_file_paths[i] to the DOCUMENT ID that quote came from, so an
  // inline quote link can mint its own URL on click like any other document.
  //
  // Built from locations_data rather than from the documents fetch: the RPC already returns the
  // whole inventory row, so the correlation is free here and the documents route need not hand out
  // paths as well. An unmatched path falls back to plain text — a quote a verifier can still read,
  // never a link that fails.
  const pathToDocId: Record<string, string> = {}
  for (const loc of inv.locations_data || []) {
    for (const d of loc.source_docs || []) {
      if (d.file_path && d.id) pathToDocId[d.file_path] = d.id
    }
  }
  const frameworks = (inv.selected_frameworks || []).map(f => FRAMEWORK_NAMES[f] || f)

  return (
    <Shell>
      <div style={{ maxWidth: 920, minWidth: 0, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.25)', borderRadius: 10, padding: '10px 16px', marginBottom: '1.5rem', fontSize: 12, color: '#7425e3', fontWeight: 500 }}>
          Read-only verifier view · You are reviewing a GHG inventory shared for independent assurance{data.expires_at ? ` · Access expires ${new Date(data.expires_at).toLocaleDateString()}` : ''}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Independent Verification Review</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem,3vw,2.4rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{inv.company_name || 'GHG Inventory'}</h1>
        {/* GWP basis sits with the other inventory-level qualifiers, above the figures it qualifies.
            ISO 14064-3 7.1.4.9(b) requires the verifier to confirm the GWP set used, so its ABSENCE
            has to be visible too — a missing basis reads as "not stated", never as a silent omission.
            The workings table carries a per-row gwp_basis as well, so the two can be cross-checked. */}
        <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, marginBottom: '2rem' }}>
          Reporting year {inv.reporting_year} · {frameworks.join(', ') || 'No framework selected'} · {boundaryLabel(inv.boundary_approach)}
          {' · '}
          {inv.gwp_version
            ? <>GWP basis: {inv.gwp_version}</>
            : <span style={{ color: '#ba7517', fontWeight: 600 }}>GWP basis not stated</span>}
        </p>

        <SectionHead>Emissions Summary</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: '2rem' }}>
          <Stat label="Scope 1 (tCO2e)" value={(inv.scope1_total ?? 0).toFixed(3)} color="#B91C1C" />
          <Stat label="Scope 2 location (tCO2e)" value={(inv.scope2_location_total ?? 0).toFixed(3)} color="#0F6E56" />
          <Stat label="Scope 2 market (tCO2e)" value={(inv.scope2_market_total ?? 0).toFixed(3)} color="#0C447C" />
          {/* The S1-intensity tile was removed deliberately: intensity is derived from
              revenue_millions, and revenue is no longer disclosed to a verifier. A tile reading
              0.0000 because its numerator stopped arriving would be worse than no tile. */}
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
          <>
          {isScrollable && (
            <div style={{ fontSize: 11, color: '#7425e3', fontWeight: 500, marginBottom: 6 }}>Scroll horizontally to see all columns →</div>
          )}
          <div ref={workingsScrollRef} style={{ overflowX: 'auto', marginBottom: '2rem' }}>
            <div style={{ minWidth: 720 }}>
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
                  <tr key={i} style={{
                    background: w.declaration === 'undeclared' ? '#FEF3E2'
                      : w.declaration === 'attested_absent' ? '#f4f4f2'
                      : i % 2 === 0 ? '#fff' : '#f8f7f5',
                    borderBottom: '0.5px solid #e8e7e4',
                  }}>
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
                          const docId = p ? pathToDocId[p] : undefined
                          return (
                            <span key={qi}>
                              {qi > 0 && '; '}
                              {docId ? <SourceQuoteLink quote={q} docId={docId} token={token} /> : `"${q}"`}
                            </span>
                          )
                        })}</div>
                      )}
                      {w.extrapolation_note && (
                        <div style={{ marginTop: 2, fontSize: 11, fontWeight: 400, color: '#888784' }}>Estimated — {w.extrapolation_note}</div>
                      )}
                      {/* Written for a verifier, not reused from the operator's wizard. The operator
                          is being told what to do next; a verifier is deciding what they can rely on,
                          so each line says what the row IS as evidence. The engine's own note (which
                          carries the attestation timestamp) renders beneath. */}
                      {w.declaration === 'attested_absent' && (
                        <>
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 500, color: '#555553', background: '#e8e7e4', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Confirmed absent</span>
                          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 400, color: '#888784' }}>
                            The operator has confirmed this location has none of this. Nothing is omitted here.
                          </div>
                        </>
                      )}
                      {w.declaration === 'undeclared' && (
                        <>
                          <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#ba7517', background: 'rgba(186,117,23,0.12)', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>Not declared</span>
                          <div style={{ marginTop: 2, fontSize: 11, fontWeight: 400, color: '#ba7517' }}>
                            Nobody has said whether this location has this or not, so the inventory cannot be shown
                            to be complete without it. This is not a figure of zero.
                          </div>
                        </>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#555553' }}>{w.scope}</td>
                    <td style={{ padding: '8px 10px', color: '#555553' }}>
                      {/* '—' for null, as the wizard's own workings table renders it. Coverage
                          resolution rows carry no activity figure — they record a decision, not a
                          measurement. */}
                      <span style={{ whiteSpace: 'nowrap' }}>{w.activity_data == null ? '—' : `${w.activity_data.toLocaleString()} ${w.activity_unit}`}</span>
                      {/* Without this a verifier reads a gallons figure against an inventory the
                          operator entered in litres, with nothing joining them — and unlike the
                          wizard's reader, a verifier has no input form to reconcile it against.
                          This page is the whole of what they see. */}
                      {w.note && (
                        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 400, color: '#888784', lineHeight: 1.4 }}>{w.note}</div>
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#888784', fontSize: 11 }}>{w.emission_factor}</td>
                    <td style={{ padding: '8px 10px', color: '#555553' }}>{w.gwp_basis}</td>
                    <td style={{ padding: '8px 10px', color: '#7425e3', fontWeight: 600, whiteSpace: 'nowrap' }}>{w.result_tco2e == null ? '—' : w.result_tco2e.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div style={{ fontSize: 11, color: '#888784', marginTop: 8 }}>Emission factor sources: US EPA (combustion), US EPA eGRID (electricity), IPCC (GWP). Verifier should confirm each sampled line independently.</div>
          </div>
          </>
        ) : (
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.5rem', textAlign: 'center', fontSize: 13, color: '#888784', marginBottom: '2rem' }}>No calculation workings recorded for this inventory yet.</div>
        )}

        <SectionHead>Source Documents</SectionHead>
        <p style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>
          Supporting evidence uploaded for this inventory — trace each activity-data figure back to its source document. {VERIFIER_DOC_LINK_NOTICE}
        </p>
        {docsLoading && <div style={{ fontSize: 13, color: '#888784', marginBottom: '2rem' }}>Loading documents…</div>}
        {!docsLoading && docs.length === 0 && (
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.5rem', textAlign: 'center', fontSize: 13, color: '#888784', marginBottom: '2rem' }}>No source documents have been uploaded for this inventory.</div>
        )}
        {!docsLoading && docs.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            {docs.map((d, i) => (
              <SourceDocRow key={d.id ?? `no-id-${i}`} doc={d} token={token} />
            ))}
          </div>
        )}

        <SectionHead>Audit Trail</SectionHead>
        <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '12px 16px', marginBottom: '1.25rem', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
          {audit.length} change{audit.length !== 1 ? 's' : ''} logged · append-only, tamper-evident record
        </div>
        {audit.map((row, i) => {
          const isCreate = row.action === 'INSERT', isDelete = row.action === 'DELETE'
          // WHICH fields changed, not what they changed to. The before/after values are no longer
          // sent, so this reports the shape of a revision without disclosing the figures behind it.
          const changed = row.action === 'UPDATE' ? (row.changed_fields ?? []) : []
          const color = isCreate ? '#0F6E56' : isDelete ? '#B91C1C' : '#7425e3'
          const label = isCreate ? 'Created' : isDelete ? 'Deleted' : 'Updated'
          return (
            <div key={row.id || i} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: changed.length ? 10 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color, background: color + '18', padding: '3px 10px', borderRadius: 99 }}>{label}</span>
                  <span style={{ fontSize: 12, color: '#555553' }}>{row.user_email || 'System'}</span>
                </div>
                <span style={{ fontSize: 11, color: '#888784' }}>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              {changed.length > 0 && (
                <div style={{ borderTop: '0.5px solid #f0efed', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#888784', marginBottom: 4 }}>Fields changed in this revision</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {changed.map((key, j) => (
                      <span key={j} style={{ fontSize: 12, color: '#555553', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 99, padding: '3px 10px' }}>
                        {auditFieldLabel(key)}
                      </span>
                    ))}
                  </div>
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
function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '14px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: '#888784' }}>{label}</div>
    </div>
  )
}
