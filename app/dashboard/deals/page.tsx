'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Nav from '../../components/Nav'
import { SB253_FIRST_REPORT_DATE, SB253_DATE_STATUS } from '../../../lib/sb253'
import { useEntitlementState } from '../../../lib/useEntitlement'
import { supabase } from '../../../lib/supabase'
import {
  getObligations, getApplicableFrameworks, getFrameworkApplicability, getComplianceCost,
  SECTOR_RISKS, DEFAULT_PIPELINE_TARGETS, DEAL_CURRENCIES,
  assessmentView, partiallyAssessedNote, routeNotMetNote, partialHeadingPhrase,
  obligationPriceLabel, resolveFieldsPrompt,
  type FrameworkApplicability,
} from '../../../lib/deals/assessment'
// Presentation model shared with app/dashboard/deals/report/page.tsx. These wizard screens and the
// printed report phrase one assessment the same way — neither re-derives it, so they cannot state
// different figures or cite different regimes for one deal.
import {
  DEAL_TYPES, spellMagnitude, NEAR_PCT, nearSentence,
  resolveCs3d, makeMapFramework, regimeLabel, themisIqFigure as themisIqFigureOf,
} from '../../../lib/deals/reportModel'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SECTORS = [
  'Energy & Utilities', 'Financial Services', 'Real Estate', 'Technology',
  'Healthcare & Pharma', 'Industrials & Manufacturing', 'Consumer & Retail',
  'Agriculture & Food', 'Transport & Logistics', 'Mining & Metals',
  'Construction & Materials', 'Professional Services', 'Other',
]

const JURISDICTIONS = ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other']

// Sector-based ESG risk flags
// Assessment logic (SECTOR_RISKS, getComplianceCost, getObligations, getApplicableFrameworks)
// extracted to lib/deals/assessment.ts — imported above, shared with the public route.

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  high:     { label: 'HIGH', color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  medium:   { label: 'MEDIUM', color: '#0C447C', bg: '#E6F1FB', border: '#0C447C' },
}

const STEP_NAMES = ['Deal Setup', 'ESG Screening', 'Risk Findings', 'Cost Estimate', 'Report']

const verifyChip: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#FEF3E2', color: '#ba7517', border: '0.5px solid rgba(186,117,23,0.35)' }


// ─── Page wrapper ─────────────────────────────────────────────────────────────

// The free-tier gate's view of "does this user already have a saved deal", as a DISCRIMINATED
// UNION rather than a nullable value.
//
// The head count carried the distinction as `number | null` — null not-yet-counted, 0 none — and
// that only worked while nobody had to read the row itself. Now the wall needs the deal's id and
// name, so a nullable row would carry THREE meanings in two states: not loaded, loaded-and-absent,
// loaded-and-present. `undefined` vs `null` would technically separate the first two and would be
// misread by the first person to write `if (!savedDeal)`.
//
// On the union there is no id to read on the arms that have none, so "render a link to their deal
// before we know whether they have one" is not expressible. Same reasoning as ObligationPrice's
// quote arm in lib/obligations.ts.
type FreeTierDeal =
  | { state: 'loading' }                                  // not yet asked, or answer in flight
  | { state: 'none' }                                     // asked: this user has saved nothing
  | { state: 'saved'; id: string; name: string }          // asked: their most recent saved deal

// ONE loading shell, used by the Suspense boundary AND by the free-tier gate below. The gate has
// to render something while it does not yet know whether to wall, and it must not be a different
// something — a reader who sees two distinct "wait" states cannot tell which one they are in.
function DealsShell() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 1.5rem', fontSize: 14, color: '#888784' }}>Loading deal…</div>
    </div>
  )
}

export default function DealsDashboard() {
  // useSearchParams must be inside a Suspense boundary for Next.js to prerender this page.
  return (
    <Suspense fallback={<DealsShell />}>
      <DealsDashboardInner />
    </Suspense>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

function DealsDashboardInner() {
  // Both facts the free-tier gate needs, each with its own "not yet known" state. See the gate
  // itself, below the derivations, for why neither may be read before it resolves.
  const { isPaid, loading: entLoading } = useEntitlementState('deals')
  // Starts on the 'loading' arm, which is NOT 'none'. Reading an unresolved answer as "no saved
  // deals" opens the wizard to someone who should be walled; reading it as "has one" walls someone
  // who should not be. The union above is what keeps those three states from collapsing into two.
  const [savedDeal, setSavedDeal] = useState<FreeTierDeal>({ state: 'loading' })
  const [step, setStep] = useState(0)
  const [deal, setDeal] = useState({
    target_name: '',
    sector: '',
    revenue: 0,
    // NULL, not 0: these sit in nullable columns, so undeclared stays distinct from a declared
    // zero. A holding company with 0 employees definitively fails the employee limb; not knowing
    // the headcount makes the OUTCOME indeterminate. The form must preserve that difference.
    employee_count: null as number | null,
    total_assets: null as number | null,
    jurisdiction: 'USA',
    deal_type: 'ma',
    deal_value: 0,
    location_count: 0,
    currency: 'USD',
    has_ghg_data: false,
    has_esg_report: false,
    notes: '',
  })
  const [frameworks, setFrameworks] = useState<string[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [dealId, setDealId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Has the user actually typed something since the last load or save? Deliberately NOT `saved`:
  // that starts false because it means "the form matches the database", which is untrue of a blank
  // new deal — gating on it would warn someone who has entered nothing. `dirty` starts false and
  // only a real edit sets it, matching GHG's flag of the same name.
  const [dirty, setDirty] = useState(false)
  // Share-link state (C4) — kept SEPARATE from the deal object so they never enter handleSave's
  // row payload; token/share_enabled are DB-owned (token auto-generated, share_enabled toggled here).
  const [dealToken, setDealToken] = useState<string | null>(null)
  // Mirrors the sector as it exists IN THE DATABASE, not in the form. The share link serves the
  // stored row, so the gate has to be judged against the stored row. Set in the two — and only two
  // — places the row's sector can change: the load, and a successful save.
  const [savedSector, setSavedSector] = useState('')
  // The id of a deal this tab just created and wrote into the URL. Writing the id re-fires the load
  // effect (Next 16: history.replaceState syncs useSearchParams — see the effect's own note), and
  // re-fetching would replace `deal` wholesale and discard anything typed since the save. Consumed
  // once, so a later genuine load of the same id is not skipped.
  const justSavedId = useRef<string | null>(null)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareSaving, setShareSaving] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copiedShare, setCopiedShare] = useState(false)

  // Load the deal named by ?id=, or none at all.
  //
  // This USED to load the most recent deal unconditionally, which made a second target impossible:
  // the load set dealId, and dealId is handleSave's insert/update discriminant, so after the first
  // save the INSERT branch was unreachable and every later save UPDATEd the same row — a second
  // target silently overwrote the first. Selecting by id is what makes dealId legitimately null
  // again, and therefore what makes a new deal expressible at all.
  //
  // A bare /dashboard/deals is a NEW BLANK DEAL, not a random existing one (GHG's rule: "no id ->
  // start clean (no auto-load of a random inventory)"). Auto-loading someone's most recent row into
  // a form they opened to start fresh is the same class of error as the overwrite it caused.
  //
  // Owner scoping is belt-and-braces: the explicit user_id filter is kept from the previous query,
  // and RLS on public.deals independently resolves another user's deal to no row rather than to a
  // forbidden error — so a wrong id reads as "nothing loaded", never as a leak.
  const searchParams = useSearchParams()
  const dealIdParam = searchParams.get('id')
  useEffect(() => {
    // This tab just created this deal and put its id in the URL, which re-fires this effect.
    // The form already holds the deal — re-fetching would clobber it. Skip exactly once.
    if (justSavedId.current && justSavedId.current === dealIdParam) {
      justSavedId.current = null
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      // NO SESSION MEANS NO SAVED DEALS — a RESOLVED 'none', not an unknown. Without this the
      // union stays on 'loading' forever for a signed-out visitor and the gate below holds the
      // loading shell up permanently, replacing a usable wizard with a spinner. Signed out,
      // handleSave already says 'Please log in to save your deal.'
      if (cancelled || !session) { setSavedDeal({ state: 'none' }); return }
      setUserId(session.user.id)

      // ── Free-tier lookup ─────────────────────────────────────────────────
      // BEFORE the `!dealIdParam` return, because the gate applies exactly when there is no id —
      // putting it after would mean the one case that needs this never runs it.
      //
      // SELECTS THE ROW, not a count. The wall has to offer a way back into the deal they already
      // own, and that link needs the id to point at and the name to show — a `head: true` count
      // answers "how many" and cannot answer "which", which is why this is a select. Two columns
      // only, and one row: this is still an existence question, just one whose answer is usable.
      //
      // updated_at desc + limit 1: the free tier permits one row, but a user who held an
      // entitlement, saved several and then lapsed has many. Most recently touched is the one
      // they were last working on.
      const { data: recent, error: recentError } = await supabase
        .from('deals')
        .select('id, target_name')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled) return
      // A FAILED LOOKUP MUST NOT WALL. The trigger is the enforcement; this gate only explains it
      // earlier, so when it cannot tell, it says nothing and lets the DB refuse the second insert
      // with its own message. Walling on a network error would lock someone out of a deal they own
      // — and out of the very link that is their only route back to it.
      if (recentError) { console.error('Saved-deal lookup failed:', recentError); setSavedDeal({ state: 'none' }) }
      else if (!recent) setSavedDeal({ state: 'none' })
      // Same naming rule as the deal list, so one deal is not 'Untitled deal' in one place and
      // blank in another.
      else setSavedDeal({ state: 'saved', id: recent.id, name: (recent.target_name || '').trim() || 'Untitled deal' })

      if (!dealIdParam) return          // no id -> start clean; nothing is loaded and dealId stays null
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('id', dealIdParam)
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (cancelled || error || !data) return
      setDealId(data.id)
      setDealToken(data.token ?? null)      // token isn't secret to the owner; drives the share UI
      setSavedSector(data.sector ?? '')     // what the link would serve right now
      setShareEnabled(!!data.share_enabled)
      setDeal({
        target_name: data.target_name ?? '',
        sector: data.sector ?? '',
        revenue: Number(data.revenue) || 0,
        employee_count: data.employee_count == null ? null : Number(data.employee_count),
        total_assets: data.total_assets == null ? null : Number(data.total_assets),
        jurisdiction: data.jurisdiction ?? 'USA',
        deal_type: data.deal_type ?? 'ma',
        deal_value: Number(data.deal_value) || 0,
        location_count: Number(data.location_count) || 0,
        currency: data.currency ?? 'USD',
        has_ghg_data: !!data.has_ghg_data,
        has_esg_report: !!data.has_esg_report,
        notes: data.notes ?? '',
      })
      if (Array.isArray(data.frameworks)) setFrameworks(data.frameworks) // derive effect reconciles anyway
      // A just-loaded deal IS what is stored. `saved` means "the form matches the database", and the
      // share gate below relies on that meaning — without this it reads false on every page load.
      setSaved(true)
      setDirty(false)   // a just-loaded deal is pristine until the user types
    })()
    return () => { cancelled = true }
    // Keyed on the extracted id, not the whole searchParams object: re-running on an unrelated
    // query-param change would re-load and clobber in-progress edits. Same choice as
    // app/dashboard/deals/report/page.tsx, which also deps on [id].
  }, [dealIdParam])

  // Auto-detect frameworks when deal changes
  useEffect(() => {
    // NOT gated on revenue: only SB 253 and SECR consult it. The other thirteen frameworks resolve
    // from jurisdiction and sector alone, and withholding them because revenue is blank made an
    // undeclared field read as "no frameworks apply". The engine marks the two it cannot evaluate.
    if (deal.sector && deal.jurisdiction) {
      // deal.currency is load-bearing here: revenue is entered in it, and the SB 253 / SECR
      // triggers are denominated in USD / GBP respectively. Omitting it treats every deal as USD.
      const detected = getApplicableFrameworks(deal.jurisdiction, deal.revenue, deal.sector, deal.deal_type, deal.currency,
        { total_assets: deal.total_assets, employee_count: deal.employee_count })
      setFrameworks(detected)
    } else {
      setFrameworks([])
    }
  }, [deal.sector, deal.jurisdiction, deal.revenue, deal.deal_type, deal.currency, deal.total_assets, deal.employee_count])

  const update = (field: string, value: any) => { setDeal(prev => ({ ...prev, [field]: value })); setSaved(false); setDirty(true) }

  // Warn before leaving with unsaved work. The links out of this page are plain <a> tags, so they
  // are hard navigations and beforeunload fires; it would NOT fire for a client-side route change.
  // GHG additionally gates on `mode !== 'wizard'` — there are no modes here, so `dirty` alone.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Persist the deal for this user. token/share_enabled are intentionally NOT written —
  // the DB defaults own them (Build-C shareable link; unused this build).
  const handleSave = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { alert('Please log in to save your deal.'); return }
    setSaving(true)
    try {
      const row = {
        user_id: session.user.id,
        target_name: deal.target_name,
        sector: deal.sector,
        revenue: deal.revenue,
        employee_count: deal.employee_count,   // null when undeclared — never coerced to 0
        total_assets: deal.total_assets,
        jurisdiction: deal.jurisdiction,
        deal_type: deal.deal_type,
        deal_value: deal.deal_value,
        location_count: deal.location_count,
        currency: deal.currency,
        has_ghg_data: deal.has_ghg_data,
        has_esg_report: deal.has_esg_report,
        notes: deal.notes,
        frameworks, // derived list persisted as jsonb for the future shared view
        updated_at: new Date().toISOString(),
      }
      if (dealId) {
        const { error } = await supabase.from('deals').update(row).eq('id', dealId)
        if (error) { console.error('Deal save failed:', error); alert('Save failed: ' + error.message); return }
      } else {
        const { data, error } = await supabase.from('deals').insert(row).select('id, token, share_enabled').single()
        if (error) { console.error('Deal save failed:', error); alert('Save failed: ' + error.message); return }
        if (data) {
          setDealId(data.id); setDealToken(data.token ?? null); setShareEnabled(!!data.share_enabled)
          // Put the id in the URL so the address describes what the page is showing. Without this a
          // newly created deal lives only in React state: the row is saved, but any remount — a
          // refresh, or a hot reload in development — sends the load effect down its "no id, start
          // clean" path and every field resets to blank while the row sits complete in the database.
          //
          // replaceState, not pushState: Back should not return to a URL that now renders an empty
          // form. Next 16 syncs this into useSearchParams (docs: linking-and-navigating, "Native
          // History API"), so it DOES re-fire the load effect — justSavedId is what stops that
          // re-fetch clobbering the form.
          justSavedId.current = data.id
          window.history.replaceState(null, '', `/dashboard/deals?id=${data.id}`)
        }
      }
      // OUTSIDE the if/else deliberately. Setting this in the insert branch alone would leave it
      // stale on every subsequent save: a deal loaded without a sector, given one, and saved takes
      // the UPDATE path, which never touches the insert branch. Both paths return early on error,
      // so reaching this line means the row was written. `row.sector` rather than `deal.sector` —
      // record what was actually sent, not what the form holds now.
      setSavedSector(row.sector)
      setSaved(true)
      setDirty(false)   // reached only on a successful write; a failed save leaves the work dirty
    } finally { setSaving(false) }
  }

  const risks = SECTOR_RISKS[deal.sector] || []
  // Rich applicability, computed from the SAME guard as the `frameworks` effect above so the two
  // views of the same deal cannot disagree. `frameworks` stays the persisted legal in/out; this adds
  // the near-threshold detail the flat string[] deliberately does not carry.
  const evaluated = !!(deal.sector && deal.jurisdiction)   // revenue is NOT part of this gate
  const applicability: FrameworkApplicability[] = evaluated
    ? getFrameworkApplicability(deal.jurisdiction, deal.revenue, deal.sector, deal.deal_type, deal.currency,
        { total_assets: deal.total_assets, employee_count: deal.employee_count })
    : []
  const nearThreshold = applicability.filter(f => f.status === 'near-threshold')
  const nearByFramework = new Map(nearThreshold.map(f => [f.framework, f]))
  // Near-but-below never reaches `frameworks` (it does not apply), so Step 1 has to list it
  // separately or the reader never learns the deal sits just under a trigger.
  const nearBelow = nearThreshold.filter(f => !f.applies)
  // Absence of data is not a value. `frameworks` / `nearThreshold` come back empty for TWO
  // different reasons — nothing was found, or nothing was evaluated — and the empty array cannot
  // tell them apart. These states carry that distinction to every surface, so a blank revenue
  // field can never render as "no frameworks apply" or "no threshold is nearby".
  const view = assessmentView(evaluated, applicability)
  const frameworksState = view.frameworks
  const nearState = view.nearThreshold
  // Rewrite generic disclosure-regime labels (SB 253, bare CSRD) on a static sector risk template to
  // the regime the DETECTED frameworks actually support. Resolving against `frameworks` rather than
  // deal.jurisdiction is load-bearing: jurisdiction alone stamped "SB 253" on every USA deal, so a
  // sub-threshold target was cited against a statute the APPLICABLE FRAMEWORKS section of the same
  // report correctly omitted. A token here can now only name a regime that section also asserts.
  // Activity-triggered EU instruments (CBAM, EUDR, AI Act, SFDR, CS3D, ETS) are still left intact —
  // they apply to UK/non-EU companies through EU-facing activity and have no domestic equivalent.
  // CS3D is an activity-triggered instrument: it reaches non-EU companies through EU-facing activity,
  // which this screen cannot determine (no market multi-select yet), so "not in the resolved list" is
  // NOT the same as "does not apply" and the token is never simply suppressed.
  //
  // TWO INPUTS, TWO JOBS. `Cs3dState` is consumed here for ONE thing only — `cs3d.reason`, the
  // sentence printed beneath a finding. The token's display TEXT and its `qualified` flag come from
  // the CS3D ROW, via makeMapFramework. The split is not tidiness: the ROW carries FOUR statuses
  // (applies / near-threshold / not-assessed / not-applicable) where `Cs3dState` carries THREE, so
  // the summary cannot tell an abstention apart from an evaluated row sitting just below its limbs.
  // Deriving the token from the state is what once printed "not assessed" over a row the
  // near-threshold panel on this same screen showed with its limbs, its values and "0 of 2 limbs met".
  const cs3d = resolveCs3d(frameworks, applicability)
  // Narrowed HERE, not in the render gate: only the 'conditional' variant carries a reason, and the
  // gate is now `qualified` on the token. Reading `.reason` at the render site would put the state
  // check back in the gate and imply it decides whether the line prints, which it does not.
  const cs3dReason = cs3d.state === 'conditional' ? cs3d.reason : null
  const cs3dRow = applicability.find(f => f.framework === 'CS3D')
  const mapFramework = makeMapFramework(frameworks, cs3dRow)
  const criticalRisks = risks.filter(r => r.severity === 'critical')
  const highRisks = risks.filter(r => r.severity === 'high')
  const mediumRisks = risks.filter(r => r.severity === 'medium')
  const complianceCost = deal.deal_value > 0 ? getComplianceCost(deal.deal_value, deal.sector, frameworks) : null
  const obligations = getObligations(deal.location_count, frameworks, deal.sector)
  // Compact ThemisIQ summed figure (included tier only) — shared by the Cost Estimate card,
  // the Export "Report summary", and the sticky "Deal summary" so all three stay consistent.
  const themisIqFigure = themisIqFigureOf(obligations)

  // What must be present before a link can be CREATED. Sector only.
  //
  // Jurisdiction was here too and was dead: JURISDICTIONS has no empty option, the state
  // initialises to 'USA' and the load falls back to 'USA', so no path through the UI makes it
  // falsy. Listing it made the gate read as though it checked two things when it checked one.
  //
  // Sector is the one that can genuinely be absent, and it is doubly load-bearing: it is a conjunct
  // of the detection effect (so without it `frameworks` is empty) AND it keys SECTOR_RISKS (so
  // without it the target sees no risk findings either). location_count is deliberately NOT here —
  // unset renders "Custom quote" on the target's page, which is honest rather than broken.
  //
  // Judged on savedSector, NOT deal.sector: the link serves the database, so the gate must too.
  // A sector typed but not saved is correctly still a blocker — the link would serve the row
  // without it — and toggleShare's error message tells those two causes apart.
  const shareBlockers: string[] = [
    ...(savedSector ? [] : ['a sector']),
  ]

  // Absolute public URL for the target-facing route (matches the verifier linkFor pattern).
  const shareUrl = dealToken ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.themisiq.co'}/deals/${dealToken}` : ''

  // Flip share_enabled — a normal owner-gated update (existing RLS covers it); no RPC, no policy change.
  // The WRITE is where the gate has authority. A render-level check only decides what is on screen;
  // it cannot stop a stale render, a second tab, or any future call site. So the condition lives in
  // the UPDATE's own WHERE clause and Postgres decides — against the row as it actually is, at the
  // instant of the write. No read-then-write pair, so nothing can change in between.
  const toggleShare = async (enabled: boolean) => {
    if (!dealId) return
    setShareSaving(true)
    setShareError(null)
    try {
      if (!enabled) {
        // REVOKING IS NEVER GATED. Turning a live link off must work whatever state the deal is in
        // — a deal that fails the create-gate is precisely one whose link most needs revoking.
        const { error } = await supabase.from('deals').update({ share_enabled: false }).eq('id', dealId)
        if (error) { console.error('Share revoke failed:', error); setShareError('Could not turn the link off: ' + error.message); return }
        setShareEnabled(false)
        return
      }

      // CREATING a link is gated on the STORED sector. `.in('sector', SECTORS)` rather than a
      // not-empty test: it is unambiguous about how an empty string encodes, and it additionally
      // rejects anything that is not a real sector.
      const { data, error } = await supabase
        .from('deals')
        .update({ share_enabled: true })
        .eq('id', dealId)
        .in('sector', SECTORS)
        .select('id')
      if (error) { console.error('Share toggle failed:', error); setShareError('Could not create the link: ' + error.message); return }
      if (!data || data.length === 0) {
        // Zero rows means the row did not qualify, so no link was created. Say what to do.
        setShareError(deal.sector
          ? 'This deal has no sector saved yet — the sector you have chosen has not been saved. Use Save deal at the bottom of the page, then try again.'
          : 'This deal has no sector, so the link would open to an empty assessment. Add one in Deal setup, save the deal, then try again.')
        return
      }
      setShareEnabled(true) // only reflect state on a successful write
    } finally { setShareSaving(false) }
  }

  const copyShareLink = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopiedShare(true)
    setTimeout(() => setCopiedShare(false), 2000)
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Deal setup</h2>
      <p style={sectionSub}>Tell us about the target company and deal structure so we can identify ESG risks and applicable frameworks.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Target company name</label>
          <input style={inputStyle} value={deal.target_name} onChange={e => update('target_name', e.target.value)} placeholder="Acme Corp" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Sector</label>
          <select style={inputStyle} value={deal.sector} onChange={e => update('sector', e.target.value)}>
            <option value="">Select sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Target annual revenue ({deal.currency}, whole {deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.revenue || ''} onChange={e => update('revenue', Number(e.target.value))} placeholder="e.g. 2000000" />
          {/* Echo the entered figure back in words. The statutory triggers are USD 1bn / GBP 36m, so a
              1000x entry error changes which statutes are cited — it has to be visible at input time. */}
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: deal.revenue > 0 ? '#0d0d0d' : '#888784' }}>
            {deal.revenue > 0
              ? <>Reading this as <strong style={{ fontWeight: 600 }}>{deal.currency} {deal.revenue.toLocaleString()}</strong> — {spellMagnitude(deal.revenue)}.</>
              : <>Enter the full amount in whole {deal.currency} — 2000000 for two million, not 2 or 2000.</>}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={deal.currency} onChange={e => update('currency', e.target.value)}>
            {DEAL_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Deal / investment value ({deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.deal_value || ''} onChange={e => update('deal_value', Number(e.target.value))} placeholder="0" />
        </div>
        {/* Size limbs. Blank stays NULL — `?? ''` and the '' → null branch below are what keep an
            undeclared headcount distinct from a declared zero, which the N-of-M rule depends on. */}
        <div>
          <label style={labelStyle}>Employees (headcount)</label>
          <input style={inputStyle} type="number" value={deal.employee_count ?? ''} placeholder="Leave blank if unknown"
            onChange={e => update('employee_count', e.target.value === '' ? null : Number(e.target.value))} />
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: '#888784' }}>
            {deal.employee_count == null ? 'Undeclared — limbs needing headcount cannot be assessed.' : `Declared: ${deal.employee_count.toLocaleString()}.`}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Balance-sheet total ({deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.total_assets ?? ''} placeholder="Leave blank if unknown"
            onChange={e => update('total_assets', e.target.value === '' ? null : Number(e.target.value))} />
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: '#888784' }}>
            {deal.total_assets == null ? 'Undeclared — limbs needing total assets cannot be assessed.' : `Declared: ${deal.currency} ${deal.total_assets.toLocaleString()} — ${spellMagnitude(deal.total_assets)}.`}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Number of locations / sites</label>
          <input style={inputStyle} type="number" value={deal.location_count || ''} onChange={e => update('location_count', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Primary jurisdiction</label>
          <select style={inputStyle} value={deal.jurisdiction} onChange={e => update('jurisdiction', e.target.value)}>
            {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Deal type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {DEAL_TYPES.map(dt => (
              <div key={dt.id} onClick={() => update('deal_type', dt.id)} style={{ border: `1.5px solid ${deal.deal_type === dt.id ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '0.75rem', cursor: 'pointer', background: deal.deal_type === dt.id ? '#EDE9FE' : '#f8f7f5' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: deal.deal_type === dt.id ? '#7425e3' : '#0d0d0d', marginBottom: 3 }}>{dt.label}</div>
                <div style={{ fontSize: 11, color: '#888784' }}>{dt.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>ESG framework screening</h2>
      <p style={sectionSub}>ThemisIQ has identified the frameworks that apply to this deal based on sector, jurisdiction and deal size. Review and confirm.</p>

      {/* Same three states the report uses — a blank revenue field must not render as a negative finding.
          The `unevaluated` conjunct is what keeps the copy and the gate describing the same rows:
          `frameworksState` is driven by the UNION, so on a routeNotMet-only deal this branch would
          open and then interpolate an empty name list into "Size test incomplete for  —". */}
      {frameworksState === 'not-assessed' && (!view.evaluated || view.unevaluated.length > 0) ? (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 12, padding: '1.25rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 6 }}>NOT ASSESSED</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            {view.evaluated
              ? <>Size test incomplete for {view.unevaluated.join(', ')} — <strong style={{ fontWeight: 600 }}>not evaluated</strong>, which is not a finding that none apply. {resolveFieldsPrompt(view.fieldsToResolve, view.unevaluated)}</>
              : <>Enter sector and jurisdiction in Deal setup. Nothing has been evaluated yet — an empty list here is not a finding that no frameworks apply.</>}
          </div>
        </div>
      ) : frameworksState === 'assessed-none' ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
          <strong style={{ fontWeight: 600 }}>None.</strong> Assessed against this jurisdiction, sector and revenue — no framework was triggered.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {frameworks.map(fw => {
            const near = nearByFramework.get(fw)
            return (
              <div key={fw} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: '#fff', border: `1px solid ${near ? 'rgba(186,117,23,0.35)' : '#e8e7e4'}`, borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{fw}</div>
                  {near && <div style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 5 }}>{nearSentence(near)}</div>}
                </div>
                {/* APPLIES is retained alongside VERIFY — near-ness annotates the finding, it does not soften it. */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {near && <span style={verifyChip}>VERIFY</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56' }}>APPLIES</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Partial assessment: the list above resolved from jurisdiction and sector, but a revenue
          trigger was withheld. Naming it stops the reader inferring it was considered and excluded. */}
      {frameworksState === 'assessed-findings' && view.notAssessed.length > 0 && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 4 }}>PARTIAL — {view.notAssessed.join(', ')} {partialHeadingPhrase(view)}</div>
          {/* Heading keeps the UNION — it only claims something was withheld, and must name all of it.
              The body explains WHY, which is population-specific and cannot be said of both. */}
          {view.unevaluated.length > 0 && (
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{partiallyAssessedNote(view.unevaluated, view.fieldsToResolve)}</div>
          )}
          {view.routeNotMet.length > 0 && (
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{routeNotMetNote(view.routeNotMet)}</div>
          )}
        </div>
      )}

      {/* Near-threshold, not assessed. Silence here would read as "nothing is nearby" — the same
          false negative the report's own section guards against.
          Names the UNEVALUATED population, matching this panel's gate: `nearState` is raised by an
          unevaluated LIMB, never by a withheld framework, so the union named rows the sentence
          misdescribes — a routeNotMet framework had every limb evaluated. */}
      {nearState === 'not-assessed' && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 4 }}>NEAR-THRESHOLD — NOT ASSESSED</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            {view.evaluated
              ? <>No proximity check was run — the {view.unevaluated.join(' / ')} size test{view.unevaluated.length === 1 ? '' : 's'} could not be completed. {resolveFieldsPrompt(view.fieldsToResolve, view.unevaluated)}</>
              : <>No proximity check was run — sector and jurisdiction are not set.</>}
          </div>
        </div>
      )}

      {/* Near-but-below: these are correctly absent from the list above. Surfaced so the reader
          learns the deal sits just under a trigger, without implying it has crossed it. */}
      {nearBelow.length > 0 && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 6 }}>Approaching a reporting threshold — verify</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 10 }}>
            The following do <strong style={{ fontWeight: 600 }}>not</strong> apply on the figures entered. Each has a limb within {NEAR_PCT} of its statutory trigger, so the answer turns on how that figure is measured and on reporting-entity scope — confirm before ruling them out.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nearBelow.map(f => (
              <div key={f.framework} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '0.5px solid rgba(186,117,23,0.2)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{f.framework}</div>
                  <div style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 5 }}>{nearSentence(f)}</div>
                </div>
                <span style={{ ...verifyChip, flexShrink: 0 }}>NEAR THRESHOLD</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ border: '1px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 12 }}>Data room status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { field: 'has_ghg_data', label: 'GHG inventory / emissions data available from target?' },
            { field: 'has_esg_report', label: 'ESG report or sustainability disclosure available from target?' },
          ].map(({ field, label }) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ fontSize: 13, color: '#555553' }}>{label}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                  <button key={String(opt.val)} onClick={() => update(field, opt.val)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: (deal as any)[field] === opt.val ? '#0d0d0d' : '#f8f7f5', color: (deal as any)[field] === opt.val ? '#fff' : '#555553', border: `0.5px solid ${(deal as any)[field] === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {(!deal.has_ghg_data || !deal.has_esg_report) && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>⚠ Data room gaps identified</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            {!deal.has_ghg_data && '· Request verified GHG inventory (Scope 1, 2, 3) from target before closing\n'}
            {!deal.has_esg_report && '· Request latest ESG report or sustainability disclosure from target'}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Material ESG findings</h2>
      {/* The lead-in lives INSIDE the findings branch. It used to render above the ternary, so the
          page announced "ThemisIQ has identified the following material ESG risks" and then, three
          lines down, said there were none. Three states, not two: no sector chosen; a sector with no
          risk template ("Other"); and findings to show. */}

      {risks.length === 0 ? (
        deal.sector ? (
          /* A sector IS chosen — "Other", or any future sector added to the dropdown without a
             SECTOR_RISKS entry. "Select a sector" would be wrong advice for someone who selected
             one, and silence would read as a clean bill of health. Neither is true: we simply have
             nothing pre-written for this sector. */
          <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '1.75rem 2rem', fontSize: 13, color: '#555553', lineHeight: 1.7 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: '#0d0d0d', marginBottom: 8 }}>No standard findings for this sector</div>
            We keep a set of common ESG risks for each sector, and &ldquo;{deal.sector}&rdquo; isn&rsquo;t one of them, so
            there is nothing pre-written to show here. <strong style={{ fontWeight: 600 }}>That is not a finding that this target has no
            ESG risks.</strong> If one of the listed sectors is close to what it does, choosing it in{' '}
            <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#7425e3', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Deal setup</button>
            {' '}will bring up the risks that usually apply.
          </div>
        ) : (
          <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784', fontSize: 13, lineHeight: 1.7 }}>
            Choose a sector in{' '}
            <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#7425e3', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Deal setup</button>
            {' '}to see the ESG risks that usually come with it.
          </div>
        )
      ) : (
        <>
          <p style={sectionSub}>Based on {deal.target_name || 'the target company'}&rsquo;s sector and jurisdiction, ThemisIQ has identified the following material ESG risks for your deal memo.</p>
          {/* The Framework badge on each finding resolves against the detected list. With nothing
              detected it falls back to a methodology label — say so rather than let it read as a
              resolved regime.
              UNEVALUATED only, the report's twin of this banner: a routeNotMet framework was fully
              evaluated AND still appears in the labels below (its token is emitted, qualified), so both
              claims here would be false of it. Silence on a routeNotMet-only deal is correct — nothing
              vanished from the Framework column. */}
          {view.unevaluated.length > 0 && (
            <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: 14, fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
              <strong style={{ fontWeight: 600, color: '#ba7517' }}>Framework column partially resolved.</strong> The {view.unevaluated.join(' / ')} size test could not be completed, so {view.unevaluated.length === 1 ? 'it does' : 'they do'} not appear in any label below. Labels reflect only the regimes determinable from the figures provided. {resolveFieldsPrompt(view.fieldsToResolve, view.unevaluated)}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Critical risks', count: criticalRisks.length, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risks', count: highRisks.length, color: '#ba7517', bg: '#FEF3E2' },
              { label: 'Medium risks', count: mediumRisks.length, color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {risks.map((risk, i) => {
              const cfg = SEVERITY_CONFIG[risk.severity]
              const tokens = mapFramework(risk.framework)
              // A finding inherits the marker when the regime it cites is itself near-threshold.
              // Looked up by token IDENTITY, not by display text — 'ESRS E1' carries identity 'CSRD'
              // and used to miss the map entirely. DEDUPED BY FRAMEWORK for the same reason: 'CSRD'
              // and 'ESRS E1' both resolve to the CSRD row, so without this the near-sentence would
              // print twice under one finding.
              const citedNear = [...new Map(
                tokens
                  .map(t => (t.framework ? nearByFramework.get(t.framework) : undefined))
                  .filter(Boolean)
                  .map(f => [f!.framework, f!] as const),
              ).values()]
              return (
                <div key={i} style={{ border: `1px solid ${cfg.border}20`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: risk.severity === 'critical' ? cfg.bg : '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `0.5px solid ${cfg.border}20` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{risk.risk}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#888784' }}>{regimeLabel(tokens)}</span>
                      {citedNear.length > 0 && <span style={verifyChip}>VERIFY</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{risk.detail}</div>
                    {tokens.some(t => t.framework === 'CS3D' && t.qualified) && (
                      <div style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 8 }}>
                        <strong style={{ fontWeight: 600 }}>CS3D not assessed:</strong> {cs3dReason}.
                      </div>
                    )}
                    {citedNear.map(f => (
                      <div key={f.framework} style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 8 }}>
                        <strong style={{ fontWeight: 600 }}>{f.framework}:</strong> {nearSentence(f)}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  const renderStep3 = () => {
    const consultantRange = `USD ${Math.round(obligations.consultantLow / 1000)}k–${Math.round(obligations.consultantHigh / 1000)}k`
    const includedModulesLabel = obligations.included.map(o => o.short).join(' + ') + ' modules'
    return (
    <div>
      <h2 style={sectionHead}>Compliance cost estimate</h2>
      <p style={sectionSub}>Estimated cost to bring {deal.target_name || 'the target'} into ESG compliance — for your IC memo and deal valuation adjustment.</p>

      {!complianceCost ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>
          Enter deal value in Step 1 to generate a compliance cost estimate.
        </div>
      ) : (
        <>
          {/* Black hero — consultant vs ThemisIQ, summed over the INCLUDED obligations only */}
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>Estimated ESG compliance cost — {deal.target_name || 'Target'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Traditional consultant</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', fontWeight: 400, color: '#fff', lineHeight: 1.1 }}>{consultantRange}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>first-year, billed by the hour</div>
              </div>
              <div style={{ borderLeft: '0.5px solid rgba(255,255,255,0.12)', paddingLeft: 16 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>With ThemisIQ</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', fontWeight: 400, color: '#64fe3e', lineHeight: 1.1 }}>{themisIqFigure}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{includedModulesLabel}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              Priced like sustainability software, scoped like a consultant&rsquo;s engagement. The difference is automation, not depth: traditional fees are dominated by manual data-collection and review hours — the platform handles those directly, without cutting the deliverable.
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#888784', marginTop: -8, marginBottom: 16, lineHeight: 1.6 }}>Benchmark figures shown in USD. <strong style={{ fontWeight: 600 }}>How we benchmark:</strong> per-obligation market ranges for standalone ESG due-diligence workstreams, scaled by number of locations and sector intensity — indicative, not a quote.</div>

          {/* Pipeline-ROI scenario — DASHBOARD ONLY (not shared into the public /deals/[token] page:
              wrong audience). Reuses the already-computed consultant range × DEFAULT_PIPELINE_TARGETS
              and the annual themisIqFigure — no new numbers. */}
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7425e3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Across your pipeline</div>
            {obligations.locationUnset ? (
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6 }}>Enter a location count to see your annual ThemisIQ price — one subscription covers your whole screening pipeline, not one deal.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#0d0d0d', lineHeight: 1.6 }}>
                  Screen ~{DEFAULT_PIPELINE_TARGETS} targets/year. Traditional ESG due diligence: <strong>~USD {Math.round(obligations.consultantLow * DEFAULT_PIPELINE_TARGETS / 1000)}k–{Math.round(obligations.consultantHigh * DEFAULT_PIPELINE_TARGETS / 1000)}k</strong> in per-engagement fees. ThemisIQ: <strong style={{ color: '#0F6E56' }}>{themisIqFigure}</strong> per year, unlimited targets.
                </div>
                <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.6, marginTop: 6 }}>One subscription covers your whole screening pipeline, not one deal.</div>
              </>
            )}
          </div>

          {/* Included for this deal */}
          <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Included for this deal</div>
            {obligations.included.map((o, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, color: '#0d0d0d' }}>✓ {o.label}</div>
                {o.scopeNote && (
                  <div style={{ fontSize: 11, color: '#888784', marginLeft: 18, marginTop: 1, lineHeight: 1.5 }}>{o.scopeNote}</div>
                )}
              </div>
            ))}
            {frameworks.length > 0 && (
              <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6, borderTop: '0.5px solid rgba(15,110,86,0.15)', paddingTop: 8 }}>
                Frameworks detected for this deal: {frameworks.join(', ')}.
              </div>
            )}
          </div>

          {/* Also recommended — NOT summed into the headline */}
          {obligations.recommended.map((o, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Also recommended</div>
                <div style={{ fontSize: 13, color: '#555553' }}>{o.label}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d' }}>{o.pricing.kind === 'priced' ? `+ ${obligationPriceLabel(o.pricing)}` : obligationPriceLabel(o.pricing)}</div>
                <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>consultant USD {Math.round(o.consultantLow / 1000)}k–{Math.round(o.consultantHigh / 1000)}k</div>
              </div>
            </div>
          ))}

          {/* Flagged — honest caveat, summed into NEITHER figure */}
          {obligations.flagged.map((o, i) => (
            <div key={i} style={{ background: '#FBF3E2', border: '0.5px solid rgba(146,102,10,0.25)', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92660A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Covered via SBTi target-setting</div>
              <div style={{ fontSize: 13, color: '#555553' }}>{o.label}</div>
              {o.scopeNote && <div style={{ fontSize: 11, color: '#888784', marginTop: 3, lineHeight: 1.5 }}>{o.scopeNote}</div>}
            </div>
          ))}

          {/* ESG value-at-risk EXPOSURE — from getComplianceCost. A RISK metric the analyst diligences
              AGAINST, not a cost and NOT compared to the ThemisIQ price. Kept visually + semantically
              separate from the consultant-vs-ThemisIQ cost hero above (different concept). */}
          <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>ESG value-at-risk exposure</div>
            <div style={{ fontSize: 13, color: '#0d0d0d', lineHeight: 1.6 }}>
              ~{(complianceCost.pctLow * 100).toFixed(2)}%–{(complianceCost.pctHigh * 100).toFixed(2)}% of deal value (~{deal.currency} {Math.round(complianceCost.low).toLocaleString()}–{Math.round(complianceCost.high).toLocaleString()}) carries ESG-related risk to assess.
            </div>
            <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.6, marginTop: 4 }}>
              {deal.sector || '—'}, {deal.jurisdiction}, {frameworks.length} applicable frameworks · indicative exposure, not a cost · requires specialist confirmation.
            </div>
          </div>

          <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>Deal structuring note</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
              Consider including ESG compliance costs in purchase price adjustment mechanics, or structuring an escrow/holdback for regulatory compliance. ThemisIQ Advisory can provide a detailed compliance roadmap for IC approval. If the deal proceeds, ThemisIQ can complete the target&rsquo;s compliance work directly — share this assessment with the target from the Export step.
            </div>
          </div>
        </>
      )}
    </div>
    )
  }

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Your diligence report</h2>
      <p style={sectionSub}>The finished write-up of this deal, for your deal memo or IC pack. You can also share the findings with the target company.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Report summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Target', val: deal.target_name || '—' },
            { label: 'ESG risks', val: risks.length, urgent: criticalRisks.length > 0 },
            // A bare "0" in 1.6rem Georgia reads as an assessed count. Only render a number
            // when something was actually assessed.
            { label: 'Frameworks', val: view.evaluated ? frameworks.length : 'Not assessed' },
            { label: 'ThemisIQ est.', val: themisIqFigure },
          ].map(({ label, val, urgent }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.6rem' : '1rem', fontFamily: typeof val === 'number' ? 'Georgia, serif' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: urgent ? '#64fe3e' : '#fff', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Renders whenever view.notAssessed is non-empty — ANY withheld framework, not a blank
          revenue field: an abstention no field can cure (CS3D's pending size test) reaches here
          too. So the heading names the frameworks, as :519 and report/page.tsx:338 do; naming a
          field the condition never checked told a reader who had entered revenue to enter it.
          Export is reachable in this state (the step tabs and Next are ungated, and the confirm
          checkbox is a liability disclaimer, not a completeness check). The report stays
          downloadable — it is still useful — but the reader is told which frameworks it withheld. */}
      {view.notAssessed.length > 0 && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 4 }}>PARTIAL — {view.notAssessed.join(', ')} NOT ASSESSED</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            Frameworks determinable from jurisdiction and sector <strong style={{ fontWeight: 600 }}>have</strong> been assessed and appear in this report. {view.notAssessed.join(' and ')} {view.notAssessed.length === 1 ? 'is' : 'are'} marked <strong style={{ fontWeight: 600 }}>NOT ASSESSED</strong> — that is not a finding that {view.notAssessed.length === 1 ? 'it does' : 'they do'} not apply. {resolveFieldsPrompt(view.fieldsToResolve, view.notAssessed)}
          </div>
        </div>
      )}

      {isPaid ? (
        <div>
          {/* The report is the finished document; this screen is where you go to it. It needs a
              saved deal because it loads by id, so the unsaved state matches the share block
              below rather than offering a link that would open an empty page. */}
          {!dealId ? (
            <div style={{ fontSize: 12, color: '#888784', fontStyle: 'italic' }}>Save the deal to open its report.</div>
          ) : (
            <>
              <a href={`/dashboard/deals/report?id=${dealId}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', textDecoration: 'none' }}>
                Open the full report →
              </a>
              <div style={{ fontSize: 12, color: '#888784', lineHeight: 1.6, marginTop: 10, maxWidth: 520 }}>
                Opens in a new tab. It has the findings, the applicable rules, the cost estimate and the
                important notice, written out in full. Print it or save it as a PDF from there.
              </div>
            </>
          )}

          {/* Share with target — public /deals/[token] link. Gated on a saved deal with a token. */}
          <div style={{ marginTop: 24, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 4 }}>Share with target company</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 14 }}>
              Share this assessment with the target company. They&rsquo;ll see the compliance findings and cost estimate — not your deal economics.
            </div>
            {shareError && (
              <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '0.85rem 1rem', fontSize: 12, color: '#B91C1C', lineHeight: 1.6, marginBottom: 12 }}>
                {shareError}
              </div>
            )}
            {/* ORDER MATTERS. `shareEnabled` is tested BEFORE the blockers so that a live link is
                always manageable. Putting the blockers first stranded the owner in exactly the state
                the gate exists to prevent: a sectorless deal that had already been shared showed
                "Add a sector first" and offered no way to turn the link off, while the link stayed
                live and the target kept reading an empty assessment. Blockers gate CREATING a link.
                They never gate managing one that already exists. */}
            {!dealId || !dealToken ? (
              <div style={{ fontSize: 12, color: '#888784', fontStyle: 'italic' }}>Save the deal to generate a shareable link.</div>
            ) : shareEnabled ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E56', marginBottom: 12 }}>🟢 Link active — anyone with this URL can view this assessment.</div>
                {/* A live link on a deal that fails the create-gate is the urgent case: someone is
                    reading an empty assessment right now, and only the owner can stop it. */}
                {shareBlockers.length > 0 && (
                  <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '0.85rem 1rem', fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>Anyone opening this link right now sees an empty assessment</div>
                    This deal has no sector saved, so there are no reporting rules or risk findings to show.
                    Either turn the link off below, or{' '}
                    <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#7425e3', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>add a sector in Deal setup</button>
                    {' '}and save the deal.
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: 220, fontSize: 12, padding: '9px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4', background: '#fff', color: '#555553' }} />
                  <button onClick={copyShareLink} style={{ fontSize: 12, fontWeight: 500, padding: '9px 16px', borderRadius: 8, background: copiedShare ? '#E1F5EE' : '#fff', border: `0.5px solid ${copiedShare ? '#0F6E56' : '#e8e7e4'}`, color: copiedShare ? '#0F6E56' : '#555553', cursor: 'pointer', whiteSpace: 'nowrap' }}>{copiedShare ? '✓ Copied!' : 'Copy link'}</button>
                </div>
                <button onClick={() => toggleShare(false)} disabled={shareSaving} style={{ fontSize: 13, fontWeight: 600, padding: '10px 22px', borderRadius: 8, background: '#fff', border: '1px solid #B91C1C', color: '#B91C1C', cursor: shareSaving ? 'not-allowed' : 'pointer' }}>{shareSaving ? 'Updating…' : 'Revoke access'}</button>
              </>
            ) : shareBlockers.length > 0 ? (
              /* The target's page is priced from the frameworks list stored on this row, and that
                 list is empty without a sector and a jurisdiction — so sharing before they are
                 filled in sends the target an assessment showing no obligations and a GHG-only
                 price. Name what to fill in and where, rather than reporting a fault. */
              <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '0.85rem 1rem', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>
                  {deal.sector ? 'Save the deal first' : 'Add a sector first'}
                </div>
                {deal.sector ? (
                  <>The link shows the saved version of this deal, and the sector you have chosen has not been saved yet —
                  so the target would open the link to an empty assessment. Use <strong style={{ fontWeight: 600 }}>Save deal</strong> at the bottom of the page.</>
                ) : (
                  <>Without a sector there are no reporting rules or risk findings to show, so the target would open
                  the link to an empty assessment.{' '}
                  <button onClick={() => setStep(0)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: '#7425e3', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>Go to Deal setup</button></>
                )}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#888784', marginBottom: 12 }}>🔒 Not shared — only you can see this assessment.</div>
                <button onClick={() => toggleShare(true)} disabled={shareSaving} style={{ fontSize: 13, fontWeight: 600, padding: '10px 22px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: shareSaving ? 'not-allowed' : 'pointer' }}>{shareSaving ? 'Generating…' : 'Generate share link'}</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div>
          {/* SETS THE EXPECTATION BEFORE THE WALL, not after it. Without this the first a user
              hears of the cap is being refused, and a limit discovered by hitting it reads as a
              fault. Sits above the upgrade panel because it is the fact; the panel is the offer.
              It is true both before and after they save — this deal is the free one either way. */}
          <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 12, fontSize: 12, color: '#0C447C', lineHeight: 1.6 }}>
            <strong style={{ fontWeight: 600 }}>This is your free deal.</strong> Screening this target and saving it needs no subscription. Once it is saved, starting a second target needs the Deals module.
          </div>
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Unlock your full ESG diligence programme</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6 }}>Screen a target&rsquo;s ESG risk, work out which reporting rules apply to it and what compliance would cost, and produce a diligence report for your investment committee.</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
          </div>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

  // ── FREE-TIER GATE — walls before step 0 ────────────────────────────────────
  //
  // DECIDE NOTHING UNTIL BOTH FACTS ARE IN. `isPaid` starts false and `savedDeal` starts on its
  // 'loading' arm, so any render that reads either before it resolves is reading a default, not an
  // answer. Rendering the wizard first and replacing it with the wall is the worse of the two
  // failures — they may have started typing into a form that is about to vanish — and rendering
  // the wall first tells a paying customer they have lost access they have not lost. The shell
  // says neither. It is the SAME shell as the Suspense fallback, so this is not a new wait state.
  if (entLoading || savedDeal.state === 'loading') return <DealsShell />

  // `!dealIdParam` IS THE EDIT EXEMPTION, and it is what keeps the client agreeing with the
  // database. The trigger is BEFORE INSERT only, so an unentitled user's UPDATEs are permitted
  // server-side; walling the edit path would have the client enforce a stricter rule than the
  // thing that actually enforces. They saved it while it was allowed — they can still open it.
  //
  // Keyed on the URL PARAM, not on the loaded `dealId`, so the decision does not wait on a third
  // async fact. The cost is that a bogus `?id=` suppresses the wall and lands on a blank NEW
  // deal — at which point the trigger refuses the insert and handleSave surfaces its message.
  // That is the intended division: the trigger enforces, this only explains it earlier.
  // UNCHANGED IN MEANING from the head-count version: entitlement resolved and false, at least one
  // saved deal, no ?id=. Only the middle term's representation changed — `savedDealCount >= 1`
  // became the 'saved' arm, which additionally carries the id and name the link below needs.
  const walled = !isPaid && savedDeal.state === 'saved' && !dealIdParam
  if (walled) return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>Deals &amp; Investment</div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', fontWeight: 400, color: '#fff', marginBottom: 10 }}>You have used your free deal</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6 }}>
            Screening one target is free. To screen another — and to keep a pipeline of them, with the
            diligence report, the Excel export and the shareable assessment — unlock the Deals module.
          </div>
          {/* ⚠️ THIS LINK IS THE ONLY ROUTE BACK TO THEIR SAVED DEAL. DO NOT REMOVE IT AS
              DECORATION. The deal is reachable at exactly one URL — /dashboard/deals?id=<id> —
              and both surfaces that would otherwise hand over that id, /dashboard/deals/list and
              /dashboard/deals/report, are FULLY WALLED on this same entitlement. There is no nav
              entry, no search, and no other page that lists it. If this anchor is deleted, or its
              href loses the id, an unentitled user's own work becomes unreachable to them while
              still counting against the cap that put this wall in front of them.
              It is also why the lookup above selects the row rather than counting rows. */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href={`/dashboard/deals?id=${savedDeal.id}`} style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: '#fff', color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Open your saved deal — {savedDeal.name} →
            </a>
            <a href="/pricing?modules=deals#build-your-stack" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              See pricing &amp; unlock →
            </a>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: '#0C447C', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>UK SECR in force now · UK SRS (ISSB-aligned) proposed mandatory from 2027 · IFRS S2 effective · SB 253 first report {SB253_FIRST_REPORT_DATE} ({SB253_DATE_STATUS}) · CSRD for large EU companies. ESG is a material deal risk.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            {/* Names the DESTINATION rather than claiming where you came from: the wizard is reached
                from the list, from a bookmark, and bare for a new deal, and only the arrow is true in
                all three. "Your targets" is the list page's own heading, so the link says where it
                lands. Same treatment as GHG trends' "← Back to GHG inventory". */}
            <a href="/dashboard/deals/list" style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', textDecoration: 'none', display: 'inline-block', marginBottom: 8 }}>← Your targets</a>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Deals & Investment</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>ESG Deal Due Diligence</div>
          </div>
          {deal.target_name && <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{deal.target_name}</div>}
        </div>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#0C447C' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {i + 1}. {name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: step === 4 ? '1fr' : '1fr 260px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
            {steps[step]()}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
              <button onClick={handleSave} disabled={saving} style={{ fontSize: 13, fontWeight: saved ? 500 : 600, padding: '9px 20px', borderRadius: 8, background: saved ? '#E1F5EE' : GRAD, border: saved ? '1px solid #0F6E56' : 'none', color: saved ? '#0F6E56' : '#0d0d0d', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save deal'}</button>
              {step < STEP_NAMES.length - 1 && <button onClick={() => setStep(s => Math.min(STEP_NAMES.length - 1, s + 1))} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>Next →</button>}
            </div>
          </div>
          {step < 4 && (
            <div style={{ position: 'sticky', top: 80 }}>
              <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Deal summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Target', val: deal.target_name || '—' },
                    { label: 'Sector', val: deal.sector || '—' },
                    { label: 'Deal type', val: DEAL_TYPES.find(d => d.id === deal.deal_type)?.label.split(' —')[0] || '—' },
                    { label: 'Critical risks', val: criticalRisks.length, urgent: criticalRisks.length > 0 },
                    { label: 'Frameworks', val: view.evaluated ? frameworks.length : 'Not assessed' },
                    { label: 'ThemisIQ est.', val: themisIqFigure },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? '#64fe3e' : '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {criticalRisks.length > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ {criticalRisks.length} critical ESG risk{criticalRisks.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>Material findings require specialist ESG diligence before IC approval</div>
                </div>
              )}
              <div style={{ marginTop: 10, background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '0.75rem' }}>
                {frameworks.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}><strong>{frameworks.join(' · ')}</strong><br />ESG is now a material deal risk</div>
                ) : (
                  <div style={{ fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>Enter sector, jurisdiction & target revenue in Step 1 to detect applicable frameworks</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
