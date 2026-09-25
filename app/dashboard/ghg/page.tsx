'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { CONCIERGE_UNREAD_DOC_TYPES, SUPPORTED_FUELS } from '../../../lib/ghg/conciergeDocTypes'
import { WIZARD_STEP_NAMES } from '../../../lib/ghg/wizardSteps'
import { editRows } from '../../../lib/rowList'
import { reportingYearOptions, defaultReportingYear } from '../../../lib/reportingYears'
import { supabase } from '../../../lib/supabase'
import { buildMonthlyEmissions } from '../../../lib/ghg/monthlyEmissions'
import { buildComparabilityDisclosure, buildComparabilityRecord, observationLines } from '../../../lib/ghg/comparability'
import type { PriorYearState, InventorySummary, ComparabilityCapture, ComparabilityAnswer, ComparabilityRecord } from '../../../lib/ghg/comparability'
import { factorEditionsForSave } from '../../../lib/ghg/factorEditions'
import { assessCompleteness } from '../../../lib/ghg/loadSeries'
import { COUNTRY_WORDS, UNIT_WORDS, FUEL_WORDS } from '../../../lib/ghg/series'
import type { YearDataStatus } from '../../../lib/ghg/series'
import { useEntitlementAccess, useHasConcierge, useGhgLocationAllowance, type EntitlementAccess } from '../../../lib/useEntitlement'
import { generateAssurancePDF } from '../../../lib/assurancePdf'
import { SB253_SCOPE3_FROM } from '../../../lib/sb253'
import { EPA_EGRID_POWER_PROFILER_URL } from '../../../lib/sources'
import { useSearchParams, useRouter } from 'next/navigation'
import { ghgStepIndex, scope3LinkState, inventoryNotOpenedGhg } from '../../../lib/moduleLinks'

import {
  EF_SOURCES,
  US_STATES, CA_PROVINCES, US_SUBREGIONS, AU_STATES,
  GRID_REGIONS_CA, GRID_REGIONS_US, FRAMEWORKS, canonicalCountryCode,
  isResolvedGridRegion, getGridFactor, getResidualFactor, residualRegionFor,
  detectGridRegion, gridRegionForCountry, pickEF,
  combustionSourcesFor, gridSourcesFor, sourceAttributionsFor, sourceAttributionsForLocations,
  calcGas, calcLocation, calcInventory, buildWorkings, emptyLocation, pctEstimated,
  applyResolutions, findUnresolvedCoverage, findUndeclaredStreams, findUnpriceableLocations, STREAM_META,
  streamState, DECLARABLE_STREAMS,
  countryRefusal, refusalIsFixable, unitsForCountryChange, publishersForLocation,
  findSteamFactorGaps, steamFactorFor,
  ngUnitOptions, liquidUnitOptions, propaneUnitOptions, steamUnitOptions,
  snapUnitsForCountry,
  validateElectricity, validateNaturalGas, validateCompleteness,
  parseLocalDate, periodFromYearAndEnd, analyzeCoverage,
} from '../../../lib/ghg/engine'
import { countryRefusalText, refusalBannerHeading, refusalBannerTrailer, refusalResultsHeading, storedCountryEchoLabel } from '../../../lib/ghg/countryRefusalCopy'
import { SUPPORTED_COUNTRY_OPTIONS, OTHER_COUNTRY_OPTIONS, NOT_LISTED_OPTION, selectedCountryValue } from '../../../lib/ghg/countryPicker'
import { locationDeleteConfirmation, locationDeleteSaveFailed, locationDeleteStorageFailed, locationDeleteFacts } from '../../../lib/ghg/locationDeleteCopy'
import { disclaimerParas } from '../../../lib/disclaimer'
import { btnPrimary, btnStep, btnStepDisabled, btnStepPrimary, btnStepPrimaryDisabled } from '@/app/components/buttonStyles'
import { sectionHeadFixed as auditSectionHead, sectionHeadFixed as sectionHead } from '@/app/components/headingStyles'
import ThemisIQLogo from '../../components/ThemisIQLogo'
import SourceAttributions from '../../components/SourceAttributions'
import type {
  GwpVersion, Location, Inventory, SourceDoc, ExtractedProposal,
  ConciergeStatus, CoveragePeriod, CoverageResolution, DeclarableStream, UnpriceableLocation,
} from '../../../lib/ghg/engine'


// ── Prior-year lookup for the comparability step ─────────────────────────────────────────────────
//
// The wizard holds ONE inventory — this year's. Tier B of the comparability disclosure, and the
// prior year's state, both need last year's row, so it is fetched on its own.
//
// FIVE OUTCOMES, kept distinct. Four of them end up passing 'not_stored' to the module, but they
// are not the same fact and collapsing them into one boolean is how "we didn't look" becomes
// indistinguishable from "there is nothing there" — the exact confusion this step exists to remove.
// 'error' is the one where 'not_stored' is a GUESS rather than an observation; it is recorded here
// so that persistence can refuse to write a basis built on it.
type PriorYearLookup =
  | { status: 'skipped' }                                     // no company_id — no identity to match on
  | { status: 'none' }                                        // query ran, zero rows
  | { status: 'ambiguous'; count: number }                    // >1 row for the same (company, year)
  | { status: 'error'; message: string }                      // the query itself failed
  | {
      status: 'found'
      state: PriorYearState
      summary: InventorySummary | null                        // null when the row has no readable location detail
      /**
       * The prior row's OWN stored totals. Carried, deliberately NOT used as Tier A's input.
       *
       * Tier A compares the prior_year_s1 / prior_year_s2 the customer typed in — that is the
       * doc's contract and what the customer can see on screen. Silently substituting the stored
       * totals would change what the customer is being asked about without telling them, and the
       * two can legitimately differ (a restated prior year, a different GWP basis). Here so the
       * decision to prefer one is a visible edit rather than an accident.
       */
      storedScope1: number | null
      storedScope2: number | null
    }

// The series layer says 'ok'; the comparability module says 'clean'. Same fact, two vocabularies —
// mapped explicitly so a third name cannot be invented at the call site.
const PRIOR_STATE_FROM_DATA_STATUS: Record<YearDataStatus, PriorYearState> = {
  ok: 'clean',
  excluded: 'excluded',
  unverifiable: 'unverifiable',
}

// Fuel tokens present anywhere in an inventory, in the engine's own names — the shape
// lib/ghg/comparability.ts compares year to year.
const fuelTypesPresent = (locs: Location[]): string[] => {
  const present = new Set<string>()
  for (const l of locs) {
    if (l.has_natural_gas) present.add('natural_gas')
    if (l.has_propane) present.add('propane')
    if (l.has_diesel_stationary) present.add('diesel')
    if (l.has_fuel_oil_distillate) present.add('fuel_oil_distillate')
    if (l.has_fuel_oil_residual) present.add('fuel_oil_residual')
    if (l.has_mobile && l.gasoline_amount > 0) present.add('gasoline')
    if (l.has_mobile && l.diesel_mobile_amount > 0) present.add('diesel_mobile')
    if (l.electricity_kwh > 0) present.add('electricity')
    if (l.has_purchased_steam) present.add('steam')
  }
  return [...present].sort()
}

// The structural summary Tier B compares, from a set of locations.
const summarize = (locs: Location[], boundaryApproach: string | null): InventorySummary => ({
  locationCount: locs.length,
  fuelTypes: fuelTypesPresent(locs),
  jurisdictions: [...new Set(locs.map(l => l.country).filter(Boolean))],
  boundaryApproach,
})

interface BotMessage {
  role: 'user' | 'assistant'
  content: string
  // The answer stopped before it finished. A fact ABOUT the message, kept off `content` so the note
  // can be styled as ours and never becomes part of the text a customer copies out.
  incomplete?: boolean
}

// The one instruction for "this ran long — narrow it". Shared by the error the customer sees when
// NOTHING came back, and by the marker under an answer that came back cut short. Same situation,
// same words: two phrasings would let a customer meet the problem twice and think it was two
// different problems.
const ASK_MORE_NARROWLY =
  'Ask it again more narrowly — one location, one fuel, or one step at a time — and I’ll get there.'

// Sits BENEATH a truncated answer, which stays exactly as it is. Not an error state: the text is
// real and worth reading, it just stopped early. No stop_reason, no token budget — nothing a
// customer would not say themselves.
const BOT_INCOMPLETE_NOTE = `This answer stopped before the end — it ran longer than I can send in one piece. ${ASK_MORE_NARROWLY}`

// What the guide says when the route refuses, keyed by the error code it returns. Written in the
// register of LockedDocUpload — state the position plainly, say what it is for, and where there is
// something the reader can do, say that too. None of these is a failure the customer caused.
//
// The entitlement line is a REAL CHANGE in who can use this: the guide answered anyone in the
// wizard before, backed by the Anthropic key, whether or not they had bought the module.
const BOT_ERRORS: Record<string, string> = {
  unauthenticated:
    'Your session has ended. Refresh the page and sign in again, and the guide will pick straight back up.',
  entitlement_required:
    'The guide is available on paid plans — it answers the boundary and data questions that come up as you build an inventory: what counts as yours, where a figure comes from, what a verifier will look for.',
  entitlement_check_failed:
    'We couldn’t confirm your plan just now. Give it a moment and ask again.',
  rate_limited:
    'That’s a lot of questions in a short stretch. Give it a few minutes and carry on — nothing is lost.',
  conversation_too_long:
    'This conversation has got long. Close the guide and open it again to start a fresh one — your inventory is untouched.',
  message_too_long:
    'That message is too long for me to take in one go. Try asking it in a couple of shorter parts.',
  answer_too_long:
    `That answer ran longer than I can send in one piece. ${ASK_MORE_NARROWLY}`,
  empty_reply:
    'I didn’t get an answer back that time. Ask again — it usually works on the second try.',
  not_configured:
    'The guide isn’t available right now. Everything else in the wizard works as normal.',
  default:
    'Something went wrong reaching the guide. Try again in a moment.',
}

function GHGBot({ currentStep }: { currentStep: number }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<BotMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Shared with /api/ghg-bot, which interpolates the same names into the system prompt. One copy,
  // so a renamed step cannot leave the header and the model describing different things.
  const stepNames = WIZARD_STEP_NAMES

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: `Hi! I'm your GHG inventory guide. You're on step ${currentStep + 1}: ${stepNames[currentStep]}. Ask me anything — "What is an Mcf?", "Where do I find my kWh?", "What's Scope 2?"` }])
    }
  }, [open])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      // The route requires a verified session: it authenticates the bearer token and checks the ghg
      // entitlement before it will spend anything on the API key. Same two lines the upload handler
      // runs before calling /api/concierge/extract.
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMessages(m => [...m, { role: 'assistant', content: BOT_ERRORS.unauthenticated }])
        setLoading(false)
        return
      }
      const res = await fetch('/api/ghg-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${session.access_token}` },
        // ONLY these two fields. The system prompt, the model and max_tokens are the server's now —
        // while they were sent from here, whoever called the route chose them.
        body: JSON.stringify({
          currentStep,
          messages: [...messages, { role: 'user', content: userMsg }].map(m => ({ role: m.role, content: m.content })),
        })
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // Named refusals, so a customer is told what happened and what to do — never a bare
        // "something went wrong" for a state the product understands perfectly well.
        const code = typeof data?.error === 'string' ? data.error : ''
        setMessages(m => [...m, { role: 'assistant', content: BOT_ERRORS[code] ?? BOT_ERRORS.default }])
        setLoading(false)
        return
      }
      setMessages(m => [...m, {
        role: 'assistant',
        content: data?.reply || BOT_ERRORS.default,
        // Only meaningful alongside a real reply — the fallback text above is not a truncated answer.
        incomplete: !!data?.reply && data?.incomplete === true,
      }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: BOT_ERRORS.default }])
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, width: 56, height: 56, borderRadius: '50%', background: 'var(--color-brand)', border: 'none', cursor: 'pointer', boxShadow: 'var(--shadow-sheet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
        {open ? '✕' : '💬'}
      </button>
      {open && (
        <div style={{ position: 'fixed', bottom: 92, right: 24, zIndex: 1000, width: 360, height: 480, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', border: '0.5px solid #e8e7e4', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '0.5px solid #e8e7e4', background: 'var(--color-brand)', borderRadius: '16px 16px 0 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>ThemisIQ Guide</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Step {currentStep + 1}: {stepNames[currentStep]}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              /* Wrapper carries the alignment and width so a note can sit BENEATH the bubble without
                 changing how the message itself looks. The answer is untouched and stays readable. */
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ background: msg.role === 'user' ? 'var(--color-brand)' : '#f8f7f5', color: msg.role === 'user' ? 'var(--color-on-dark)' : '#0d0d0d', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
                  {msg.content}
                </div>
                {msg.incomplete && (
                  /* Amber, matching the wizard's "needs your attention" tone — deliberately NOT the
                     red used for failures. Nothing failed; the answer is real and just stops early. */
                  <div style={{ fontSize: 11, lineHeight: 1.5, color: '#92400e', background: '#FEF3E2', borderRadius: 8, padding: '6px 10px' }}>
                    {BOT_INCOMPLETE_NOTE}
                  </div>
                )}
              </div>
            ))}
            {loading && <div style={{ alignSelf: 'flex-start', background: '#f8f7f5', borderRadius: '12px 12px 12px 2px', padding: '8px 12px', fontSize: 12, color: 'var(--color-ink-muted)' }}>Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ padding: '0.75rem', borderTop: '0.5px solid #e8e7e4', display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask anything about your GHG inventory..." style={{ flex: 1, fontSize: 12, padding: '8px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none' }} />
            <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, background: 'var(--color-brand)', color: '#fff', border: 'none', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}>→</button>
          </div>
        </div>
      )}
    </>
  )
}

// ENTRY WALL — shown INSTEAD OF a new wizard, never over a partly-filled one.
//
// WHY IT EXISTS. Since 11 Aug 2026 enforce_ghg_location_allowance() refuses every
// ghg_inventories write without an active pass, and nothing on this page asked the question
// before the customer typed. The whole wizard — locations, fuels, factors, frameworks — could be
// filled in, and the first notice was `alert('Save failed: …')` at the end. This is the same
// refusal, moved to before the effort.
//
// IT REPLACES, IT DOES NOT OVERLAY. The mid-wizard PaywallOverlay blurs and sets
// pointerEvents:'none', which is survivable over a results panel the customer cannot edit anyway
// and is NOT survivable over inputs — it strands whatever they typed behind a sheet of glass.
// Rendering this in place of a fresh wizard means there is never any typed work to strand.
//
// THE COPY PROMISES NOTHING THE PRODUCT CANNOT HONOUR. It does not say work is preserved: on the
// 'none' path there is nothing saved yet and nothing to preserve, and on the 'expired' path the
// saved inventories are still readable, which is what it says instead. 'unknown' is not
// merged into either — a read that failed is reported as a read that failed, with a retry,
// rather than as a purchase the customer has not made.
function GhgEntryWall({ access }: { access: Extract<EntitlementAccess, 'expired' | 'none' | 'unknown'> }) {
  const copy = {
    expired: {
      title: 'Your GHG access has expired.',
      body: 'Renewing turns saving back on. Your existing inventories are still here and still readable — open any of them from your inventory list.',
      cta: 'Renew GHG →',
      href: '/pricing?modules=ghg',
      secondary: { label: 'View your inventories', href: '/dashboard/ghg?view=list' },
    },
    none: {
      title: 'Saving an inventory needs the GHG module.',
      body: 'You can price it up in a couple of minutes. Once it is on your account, everything you enter here saves as you go — and stays available for the whole of your reporting year.',
      cta: 'See GHG pricing →',
      href: '/pricing?modules=ghg',
      secondary: { label: 'Back to dashboard', href: '/dashboard' },
    },
    unknown: {
      title: 'We could not check your GHG access.',
      // States what was observed, not a guess at why. The read failed; that is all that is known,
      // and naming a cause we cannot verify is how a wrong one ends up on screen for months.
      body: 'The check did not come back, so we have not started a new inventory rather than start one you might not be able to save. This is usually temporary.',
      cta: 'Try again',
      href: '',
      secondary: { label: 'Back to dashboard', href: '/dashboard' },
    },
  }[access]

  return (
    <div style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', gap: '1rem', position: 'sticky', top: 0, zIndex: 100 }}>
        <a href="/dashboard" style={{ textDecoration: 'none' }}><ThemisIQLogo size={19} /></a>
        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>/ GHG Inventory</span>
      </nav>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2.5rem', textAlign: 'center' as const, boxShadow: '0 2px 20px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 10 }}>{copy.title}</div>
          <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.75rem', fontWeight: 400 }}>{copy.body}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            {copy.href ? (
              <a href={copy.href} style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none' }}>{copy.cta}</a>
            ) : (
              <button onClick={() => window.location.reload()} style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>{copy.cta}</button>
            )}
            <a href={copy.secondary.href} style={{ fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', color: '#555553', textDecoration: 'none' }}>{copy.secondary.label}</a>
          </div>
        </div>
      </div>
    </div>
  )
}

function PaywallOverlay({ frameworks }: { frameworks: string[] }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, backdropFilter: 'blur(8px)', background: 'rgba(248,247,245,0.85)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2.5rem', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid #e8e7e4', maxWidth: 480, textAlign: 'center' as const }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>Your GHG inventory is complete.</div>
        <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 400 }}>Your Scope 1 and Scope 2 emissions have been calculated to {frameworks.join(', ')} standards, with full calculation workings ready for third-party assurance. Unlock your submission-ready reports with one click.</div>
        <div style={{ background: '#f8f7f5', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' as const }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>What you unlock</div>
          {[
            'Submission-ready reports for all selected frameworks',
            'Assurance-ready evidence uploads per emission source',
            'Full calculation workings export (ISO 14064-3)',
            'Unlimited updates throughout your reporting year',
            'Priority support through your filing deadline',
          ].map(text => (
            <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--color-brand)', flexShrink: 0, marginTop: 6 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.href = '/signup?upgrade=true'} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 10, background: 'var(--color-brand)', color: 'var(--color-on-dark)' }}>
          Unlock My Reports →
        </button>
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 12 }}>Secure payment · Instant access · Cancel anytime</div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as const, borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
          {['Your data is encrypted', 'Never sold or shared', 'PIPEDA compliant', 'Not used to train AI'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#64fe3e', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 

// CONCIERGE_UNREAD_DOC_TYPES and the doc-type → fuel mapping now live in lib/ghg/conciergeDocTypes.ts
// so a test can hold them against the extractor's own fuel list. See that file for why each
// document type is or is not read.

// File types the reader can actually open. The picker deliberately accepts MORE than this —
// a spreadsheet of meter readings is exactly the evidence a verifier wants, and the non-concierge
// copy has always invited XLSX and CSV — so the answer is to keep taking them and say plainly that
// the figure is typed in, not to narrow the picker and lose the evidence.
// ⚠️ MIRRORS the allow-list in app/api/concierge/extract/route.ts. Both must change together, or an
// upload is either sent and rejected, or skipped when it could have been read.
const CONCIERGE_READABLE_MEDIA = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'])

// ── Wording for a location we cannot price ───────────────────────────────────────────────────────
// The engine refuses in its own vocabulary (fuel token, unit token, ISO country code) because it
// has no business writing customer copy. Turning that into a sentence is presentation, so it lives
// here. Nothing below leaks a field name, an enum value, or the phrase "emission factor" — the
// customer did not choose those words and cannot act on them.
//
// Anything not in these maps falls back to the raw token rather than a blank: an unfamiliar word
// the customer can still search for beats a sentence with a hole in it.
//
// ⚠️ ALL THREE MAPS ARE IMPORTED FROM lib/ghg/series.ts, NOT DECLARED HERE — see the import at the
// top of this file. Until 14 Aug 2026 this file carried its own COUNTRY_WORDS, UNIT_WORDS and
// FUEL_WORDS, each a byte-identical second copy of the one over there (33 / 9 / 7 keys, same values,
// same key order — checked, not assumed, before merging).
//   The cost of the duplication was never a wrong figure, which is why it survived: it was a wrong
// WORD. A unit added to one map and not the other makes this message print 'mmbtu' where the trends
// surface prints 'MMBtu', or 'fuel_oil_residual' where the other says 'heavy fuel oil' — two
// descriptions of one inventory, in front of one verifier, with nothing failing to flag it.
//   lib/ghg/wordMaps.test.ts asserts none of the three has come back as a local declaration, and
// that the import that replaced them is real.
// Mirrors the engine's own locationHasFigures. ⚠️ THE ENGINE'S COPY IS NOT EXPORTED and this one
// gates ONE clause of ONE sentence; if a third caller ever needs it, export the engine's and delete
// this rather than keeping two.
function locationHasEnteredFigures(loc: Location): boolean {
  return loc.electricity_kwh > 0 || loc.natural_gas_amount > 0 || loc.propane_amount > 0
    || loc.diesel_stationary_amount > 0 || loc.fuel_oil_distillate_amount > 0
    || loc.fuel_oil_residual_amount > 0 || loc.gasoline_amount > 0 || loc.diesel_mobile_amount > 0
    || loc.refrigerant_purchased_kg > 0 || loc.purchased_steam_mmbtu > 0
    || loc.renewable_electricity_kwh > 0
}

// The workings row for a location excluded because of its country. Identical in shape to the
// 'unpriceable' row beside it, because the consequence is identical: no figures, and the engine's
// own note in the Result column. The note is composed in the engine from countryRefusalCopy, which
// is what keeps this page, the verifier page and the CSV saying one thing about one row.
function excludedRow(r: { source?: string; note?: string; gwp_basis?: string }, ri: number) {
  const amber = { color: 'var(--color-state-warn)' }
  return <tr key={ri} style={{ background: '#FEF3E2' }}>
    <td style={{ ...wTd, ...amber, fontWeight: 600 }}>{r.source}</td>
    <td style={{ ...wTd, ...amber }}>—</td>
    <td style={{ ...wTd, ...amber }}>—</td>
    <td style={{ ...wTd, ...amber }}>{r.note}</td>
    <td style={{ ...wTd, ...amber }}>—</td>
    <td style={{ ...wTd, ...amber }}>—</td>
    <td style={{ ...wTd, ...amber }}>{r.gwp_basis}</td>
    <td style={{ ...wTd, ...amber, fontWeight: 600 }}>—</td>
  </tr>
}

// The banner shell around whichever message is shown.
//
// ⚠️ THE UNIT-MISMATCH WORDING IS UNCHANGED, DELIBERATELY. That state is always fixable, "yet" is
// true of it, and its trailer does not repeat its sentence. Only the refusal states needed their
// own, and they get them from countryRefusalCopy so the verifier page and the exports cannot end up
// with a different account of the same location.
function exclusionBannerHeading(u: UnpriceableLocation): string {
  return u.kind === 'country'
    ? refusalBannerHeading(u.refusal)
    : "We can't work out this location's emissions yet"
}
function exclusionBannerTrailer(u: UnpriceableLocation, hasFigures: boolean): string {
  return u.kind === 'country'
    ? refusalBannerTrailer(u.refusal, hasFigures)
    : "Until then this location is left out of your totals \u2014 it isn't counted as zero, and nothing else you've entered here is lost."
}

function unpriceableMessage(u: UnpriceableLocation, hasFigures: boolean): string {
  // ⚠️ THE COUNTRY REFUSAL IS A DIFFERENT SENTENCE FROM A DIFFERENT MODULE, NOT A BRANCH OF THIS
  // ONE. Its three states are also rendered by the verifier page, the workings note and the
  // multi-year series, and one of them must not read differently here. countryRefusalCopy is the
  // single source for all four, for the same reason the three word maps above were de-duplicated.
  if (u.kind === 'country') return countryRefusalText(u.refusal, 'review', hasFigures)
  const country = COUNTRY_WORDS[u.country] ?? (u.country === '(unset)' ? '' : u.country)
  const unit = UNIT_WORDS[u.unit] ?? u.unit
  const fuel = FUEL_WORDS[u.fuel] ?? u.fuel.replace(/_/g, ' ')
  // No country picked yet is a different sentence: naming "(unset)" would read as a place.
  if (!country) return `This location has no country set, and its ${fuel} figure is in ${unit}. Choose the country for this location, or check the unit on the bill.`
  return `This location is set to ${country}, but its ${fuel} figure is in ${unit}. Check the country on this location, or the unit on the bill.`
}

function LockedDocUpload({ label }: { label: string }) {
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px dashed #e8e7e4', borderRadius: 8, padding: '10px 14px', opacity: 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>📎 {label}</span>
        <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', color: 'var(--color-ink-muted)' }}>🔒 Paid plan</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 6, fontWeight: 400 }}>Evidence uploads are available on paid plans — keeping your inventory assurance-ready for third-party verification.</div>
    </div>
  )
}
function GHGPage() {
  const [step, setStep] = useState(0)
  /** Why an ?id= in the URL did not open, or null. Set by the load effect, shown above the page. */
  const [loadError, setLoadError] = useState<string | null>(null)
  /**
   * Whether an inventory has a Scope 3 record, KEYED BY THE ID IT ANSWERS FOR.
   *
   * ⚠️ NOT A BARE BOOLEAN. Loading a second inventory would otherwise show the first one's answer until
   * the new read came back. An answer for another id reads as "not known yet", and the control then
   * says "Start", which goes to the same URL as "Open": the Scope 3 page loads whatever record that
   * inventory has. The label settles when the read lands; the destination never changes.
   */
  const [scope3RecordFor, setScope3RecordFor] = useState<{ id: string; has: boolean } | null>(null)
const searchParams = useSearchParams()
  const router = useRouter()
  const pack = searchParams.get('pack')
  const packFrameworks: Record<string, string[]> = {
    supplier: ['gri', 'ecovadis'],
    climate: ['ifrs', 'cdp'],
    foundation: ['gri', 'esrs'],
    investor: ['cdp', 'ifrs'],
  }
  const packNames: Record<string, string> = {
    supplier: 'Supplier Readiness',
    climate: 'Climate Readiness',
    foundation: 'ESG Foundation',
    investor: 'Investor ESG',
  }
  const defaultFrameworks = pack && packFrameworks[pack] ? packFrameworks[pack] : ['sb253']
  const [inventory, setInventory] = useState<Inventory>({
    company_name: '', company_id: null, reporting_year: defaultReportingYear(), revenue_millions: 0, employee_count: 0,
    boundary_approach: 'operational_control', california_nexus: false,
    fiscal_year_end_month: 12,
    coverage_resolutions: [],
    prior_year_s1: 0, prior_year_s2: 0,
    selected_frameworks: defaultFrameworks,
    locations: [emptyLocation('1', 'Location 1')],
  })
  // ⚠️ RAW, THEN CLAMPED. activeLocation is an INDEX into inventory.locations, and addLocation cannot know
  // the new location's index without reading the rendered length — the third stale read in that handler.
  // Instead it asks for "one past the end", and the clamp below turns that into the last location that
  // actually exists. That also makes the index safe against a list that SHRANK under it: the load path
  // replaces locations wholesale, and an index past the end would read undefined on every consumer.
  const [activeLocationRaw, setActiveLocation] = useState(0)
  const activeLocation = Math.min(activeLocationRaw, Math.max(0, inventory.locations.length - 1))
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // ⚠️ WHAT THE LAST SAVE REPORTED, FOR A CALLER THAT NEEDS TO KNOW. handleSave alerts and returns
  // on failure; it does not report back, and threading a return value through its five failure
  // branches would refactor the whole save path to serve one caller. A ref instead: set beside each
  // existing alert, cleared when a save begins, read synchronously by removeLocation after its
  // await. No existing failure behaviour changes, and a caller that does not read it sees nothing.
  const lastSaveError = useRef<string | null>(null)
  const skipSavedReset = useRef(true)
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showWorkings, setShowWorkings] = useState<Record<string, boolean>>({})
  const [activeExport, setActiveExport] = useState('sb253')
  const [dataConfirmed, setDataConfirmed] = useState(false)
  // Keyed `${locIdx}:${docType}`. For the two failures that leave nothing on a document to read: the
  // storage upload, which produced no document at all, and a failed storage DELETE, where the document
  // is still attached and still listed. Everything that happens to a document that DOES exist and stays
  // — how its figures were read, whether the reader abstained — is recorded on the doc instead, so it
  // survives a reload. Both entries here are transient by design: a retry is the remedy.
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const [mode, setMode] = useState<'loading' | 'list' | 'wizard'>('loading')
  const [inventoryList, setInventoryList] = useState<Array<{ id: string; company_name: string; reporting_year: number; updated_at: string }>>([])
  // The customer's answer, CAPTURED AT THE MOMENT THEY GIVE IT — with the observation they were
  // looking at and the basis behind it. Not just the choice: by save time the inventory may have
  // moved, and recomputing the observation then would attribute to them an answer to a question
  // nobody asked. null = unanswered, which is not "nothing changed" and never becomes it.
  const [comparabilityCapture, setComparabilityCapture] = useState<ComparabilityCapture | null>(null)
  // Typed after the radio is chosen and still changing until save, so it is collected at save time
  // rather than captured.
  const [comparabilityNote, setComparabilityNote] = useState('')
  // The lookup result, TAGGED with the (company, year) it was fetched for. The tag is what keeps a
  // result from outliving its question: switch company or reporting year and the stored result no
  // longer matches the key, so it stops being used the same render — rather than describing the
  // previous company's prior year until a new fetch lands.
  const [priorYearLookup, setPriorYearLookup] = useState<{ key: string; result: PriorYearLookup } | null>(null)
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [addingNewCompany, setAddingNewCompany] = useState(false)
  // FOUR-WAY, because the trigger it explains is. enforce_ghg_location_allowance() refuses EVERY
  // ghg_inventories write without an ACTIVE pass since 11 Aug 2026, and it says something
  // different to a lapsed customer than to someone who never bought. This hook is what lets the
  // screen say the same thing BEFORE the work is done rather than after.
  const ghgAccess = useEntitlementAccess('ghg')
  // Steps 4-5 keep the meaning they were written with — "a row exists" — so the existing
  // PaywallOverlay behaviour is unchanged for both active and expired customers. Deliberate: this
  // change adds a gate at entry, it does not re-gate the report and export surfaces.
  const isPaid = ghgAccess === 'active' || ghgAccess === 'expired'
  const CONCIERGE_DEV = useHasConcierge()   // concierge gate: true when the customer holds any concierge tier entitlement
  const { allowance: locationAllowance, loading: allowanceLoading } = useGhgLocationAllowance()
  const [showLocationWall, setShowLocationWall] = useState(false)

  // Decide initial view: ?id -> wizard (loads that one); else if user has inventories -> list; else -> blank wizard
  useEffect(() => {
    const loadId = searchParams.get('id')
    const viewParam = searchParams.get('view')
    if (loadId) { setMode('wizard'); return }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setMode('wizard'); return }
      const { data } = await supabase
        .from('ghg_inventories')
        .select('id, company_name, reporting_year, updated_at')
        .order('updated_at', { ascending: false })
      if (data && data.length > 0) {
        // Trends-first: existing inventories land on trends, UNLESS ?view=list
        // (the explicit "manage inventories" escape hatch — avoids a redirect
        // loop with the trends page's back-to-inventory link).
        if (viewParam === 'list') {
          setInventoryList(data)
          setMode('list')
        } else {
          router.replace('/dashboard/ghg/trends')
          return
        }
      } else {
        setMode('wizard')
      }
    })
  }, [searchParams])

  // Load the user's companies for the select-or-create company field.
  const loadCompanies = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('companies').select('id, name').order('name')
    setCompanies(data ?? [])
  }
  useEffect(() => { loadCompanies() }, [])

  const startNewInventory = () => {
    // Do NOT navigate here. router.replace('/dashboard/ghg') would strip ?view=list, re-firing the
    // [searchParams] mode effect, which redirects existing-inventory users to /trends and clobbers the
    // setMode('wizard') below (the "button does nothing" bug). This button only renders in list mode,
    // where no ?id is present, so there's no stale ?id to clear — switching mode in state is enough.
    setInventoryId(null)
    setSaved(false)
    setDirty(false) // fresh inventory is pristine until the user types
    setStep(0)
    // A capture belongs to the inventory it was answered against. Carried into a new one it would
    // be written to that inventory's column as if the customer had answered a question about it.
    setComparabilityCapture(null)
    setComparabilityNote('')
    setInventory({
      company_name: '', company_id: null, reporting_year: defaultReportingYear(), revenue_millions: 0, employee_count: 0,
      boundary_approach: 'operational_control', california_nexus: false,
      fiscal_year_end_month: 12,
      coverage_resolutions: [],
      prior_year_s1: 0, prior_year_s2: 0,
      selected_frameworks: defaultFrameworks,
      locations: [emptyLocation('1', 'Location 1')],
    })
    setMode('wizard')
  }

  // ── Load last year's inventory for the comparability step ──────────────────────────────────────
  //
  // Scoped on company_id, NOT company_name. The database's unique index is on
  // (user_id, company_name, reporting_year) — a different key from the company_id that series.ts
  // groups on — so company_id + reporting_year is NOT unique by constraint, only by present fact.
  // That is why >1 is a handled outcome below rather than an impossibility.
  //
  // No user_id filter: RLS already scopes the read to the owner, and a redundant client-side filter
  // would be a second, weaker copy of that rule.
  //
  // .limit(2), not .maybeSingle(): maybeSingle ERRORS on a second row, turning "ambiguous" into
  // "broken" and losing the ability to say which happened. Two rows is the least that distinguishes
  // none / one / more-than-one.
  useEffect(() => {
    const companyId = inventory.company_id
    // No stable identity to match on. company_name would match the wrong company after a rename and
    // miss it after a typo fix, so we do not look up at all rather than look up badly. No setState
    // here — 'skipped' is DERIVED below from the absence of a matching key, so nothing has to be
    // written to say a query was never sent.
    if (!companyId) return

    let cancelled = false
    const key = `${companyId}:${inventory.reporting_year}`
    const set = (result: PriorYearLookup) => setPriorYearLookup({ key, result })
    const priorReportingYear = inventory.reporting_year - 1
    supabase
      .from('ghg_inventories')
      .select('workings, locations_data, scope1_total, scope2_location_total, boundary_approach')
      .eq('company_id', companyId)
      .eq('reporting_year', priorReportingYear)
      .limit(2)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { set({ status: 'error', message: error.message }); return }
        const rows = data ?? []
        if (rows.length === 0) { set({ status: 'none' }); return }
        // Ambiguous: do NOT pick one. Whichever we chose, "last year's figures" would name a row the
        // customer never identified, and the other row says something different. Tier A still runs
        // on the typed-in totals, which are unambiguous.
        if (rows.length > 1) { set({ status: 'ambiguous', count: rows.length }); return }

        const row = rows[0] as {
          workings: unknown; locations_data: unknown
          scope1_total: number | null; scope2_location_total: number | null
          boundary_approach: string | null
        }
        // The one verdict on whether a stored total is complete, imported rather than reimplemented.
        const verdict = assessCompleteness(row.workings, row.locations_data)
        // A summary needs readable location detail. Without it there is nothing to compare, and a
        // count of 0 would render as "your inventory went from 0 locations to 6" — a structural
        // claim about a year we cannot read. Null instead: the module then withholds Tier B and
        // records why, which is what assessCompleteness has already called 'unverifiable'.
        const locs = Array.isArray(row.locations_data) ? (row.locations_data as Location[]) : null
        set({
          status: 'found',
          state: PRIOR_STATE_FROM_DATA_STATUS[verdict.dataStatus],
          summary: locs ? summarize(locs, row.boundary_approach) : null,
          storedScope1: row.scope1_total,
          storedScope2: row.scope2_location_total,
        })
      })
    return () => { cancelled = true }
  }, [inventory.company_id, inventory.reporting_year])

  /**
   * Does this inventory already have a Scope 3 record?
   *
   * ⚠️ ONE READ, SCOPED BY RLS, AND IT WRITES NOTHING. scope3_inventories carries `unique
   * (inventory_id)`, so this is a yes or a no, not a count. It decides only what the control on the
   * Review step says; the link itself names this inventory either way.
   */
  useEffect(() => {
    if (!inventoryId) return
    let cancelled = false
    const id = inventoryId
    supabase.from('scope3_inventories').select('id').eq('inventory_id', id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setScope3RecordFor({ id, has: !!data }) })
    return () => { cancelled = true }
  }, [inventoryId])

  useEffect(() => {
    if (skipSavedReset.current) { skipSavedReset.current = false; return }
    setSaved(false)
    setDirty(true)
  }, [inventory])
  useEffect(() => {
    if (mode !== 'wizard' || !dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, mode])
  useEffect(() => {
    const loadId = searchParams.get('id')
    if (!loadId) return  // no id -> start clean (no auto-load of a random inventory)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { return }
      const { data, error } = await supabase
        .from('ghg_inventories')
        .select('*')
        .eq('id', loadId)
        .maybeSingle()
      if (error) { console.error('Load failed:', error); return }
      if (!data) {
        // ⚠️ IT USED TO OPEN A BLANK WIZARD WITH THE DEAD ID STILL IN THE URL, and the next Save draft
        // would then create a NEW inventory: the id in the address bar is not what the save reads, so
        // nothing tied the two together and nothing said the link had failed. The id comes out of the
        // URL, the page says what was observed, and the mode effect re-runs to show whatever this
        // account actually has.
        const { data: list } = await supabase
          .from('ghg_inventories')
          .select('id')
          .limit(1)
        setLoadError(inventoryNotOpenedGhg(!!list && list.length > 0))
        router.replace(list && list.length > 0 ? '/dashboard/ghg?view=list' : '/dashboard/ghg')
        return
      }
      if (data) {
       skipSavedReset.current = true 
        setInventoryId(data.id)
        setInventory(inv => ({
          ...inv,
          company_name: data.company_name || '',
          company_id: data.company_id || null,
          reporting_year: data.reporting_year || inv.reporting_year,
          fiscal_year_end_month: data.fiscal_year_end_month || 12,
          coverage_resolutions: data.coverage_resolutions || [],
          revenue_millions: data.revenue_millions || 0,
          employee_count: data.employee_count || 0,
          boundary_approach: data.boundary_approach || 'operational_control',
          california_nexus: data.california_nexus || false,
          prior_year_s1: data.prior_year_s1 || 0,
          prior_year_s2: data.prior_year_s2 || 0,
          selected_frameworks: data.selected_frameworks || ['sb253'],
          locations: data.locations_data || inv.locations,
          // `?? null`, NOT `|| {}` like the defaults above. NULL means the comparability question
          // was never asked, and that is a fact a verifier reads — substituting an empty disclosure
          // would turn "never asked" into "asked, nothing to report".
          comparability_disclosure: data.comparability_disclosure ?? null,
          // `?? {}`, not `?? null` like the line above — the two absences are genuinely different.
          // A null comparability_disclosure means the customer was never ASKED; nobody is asked
          // about factor editions, so the only absence here is "not recorded", and '{}' is the
          // column's own default for it. This must be threaded through or the next save writes an
          // empty map over a real one: the payload is built key by key from `inventory`.
          factor_editions: data.factor_editions ?? {},
        }))
        // ⚠️ AFTER THE LOAD, NEVER BEFORE IT. A step shown against a blank wizard is a step the
        // customer did not ask for, on data that is not theirs yet. An unknown name opens at the first
        // step rather than at a guess: lib/moduleLinks.ts returns null for anything it does not know.
        const wanted = ghgStepIndex(searchParams.get('step'))
        if (wanted !== null) setStep(wanted)
        // ── Re-hydrate the comparability answer, or clear it ────────────────────────────────────
        //
        // The capture belongs to an inventory, so it is REPLACED on every load, never left behind:
        // hydrated from this inventory's stored record, or cleared when there isn't one. An answer
        // captured against the inventory that was open a moment ago must not follow the customer
        // into this one.
        //
        // observations and basis come from the RECORD, not from a recompute. They are what was in
        // front of the customer when they answered, and keeping them is what lets the next save
        // notice that the observation has moved since. Re-hydrating them as "current" would make
        // every reopened answer look permanently up to date.
        //
        // answeredAt is preserved for the same reason: reopening a page is not answering. The
        // timestamp says when the customer answered against those observations, and only a fresh
        // answer — a click, or an edit to the detail — moves it.
        const storedComparability = data.comparability_disclosure as ComparabilityRecord | null | undefined
        if (storedComparability) {
          setComparabilityCapture({
            observations: storedComparability.observations,
            question: storedComparability.question,
            answer: storedComparability.answer,
            basis: storedComparability.basis,
            answeredAt: storedComparability.answeredAt,
          })
          // null (the field was never shown) and '' (shown, left blank) both restore an empty box;
          // which of the two it was is preserved on the record, and re-derived at the next save
          // from the answer that is being restored here.
          setComparabilityNote(storedComparability.note ?? '')
        } else {
          setComparabilityCapture(null)
          setComparabilityNote('')
        }
        setSaved(true)
        setDirty(false)
      }
    })
    // router is in the deps because a dead ?id= is cleared from the URL above; it is stable across renders.
  }, [searchParams, router])

  const updateLocation = (idx: number, field: keyof Location, value: any) => {
    setInventory(inv => {
      const locs = [...inv.locations]
      // ⚠️ THE COUNTRY IS CANONICALISED ON THE WAY IN, SO SAVED DATA CARRIES ONE SPELLING PER
      // COUNTRY. Greece is why: ISO calls it GR, every factor key here is spelled EL, and a
      // location stored as GR would lose its grid factor outright (gridRegionForCountry returns
      // '' for it, which is unresolved, so the electricity rows are omitted and export blocks).
      // The engine canonicalises again on read, for values that arrive from anywhere but here.
      if (field === 'country') value = canonicalCountryCode(value)
      locs[idx] = { ...locs[idx], [field]: value }
     if (field === 'state') locs[idx].grid_region = detectGridRegion(value, locs[idx].country) // US states → US_<ST>; AU states → AU_<region>
if (field === 'province') locs[idx].grid_region = value // Canadian provinces map directly
      if (field === 'country') {
        // Every unit at once, derived from the same option lists the selectors render, so a fuel
        // cannot be snapped by one rule and offered by another. See UNIT_FIELDS in the engine.
        // unitsForCountryChange, not snapUnitsForCountry: a unit on a stream with no figure is a
        // template default, not the customer's choice, and must follow the new country rather than
        // survive as a United States unit on a site that is not in the United States.
        Object.assign(locs[idx], unitsForCountryChange(value, locs[idx] as never))
        // UK, EU and NZ grids are national — set grid_region directly from the country.
        // (AU returns '' here and resolves on the state pick; US resolves on the state pick.)
        const gr = gridRegionForCountry(value)
        // UK/EU/NZ resolve immediately; US/CA/AU/OTHER need a state/province pick — CLEAR any prior
        // region so a country switch can't leave a stale wrong-country factor (e.g. US_CA on an AU loc).
        if (gr) locs[idx].grid_region = gr
        else locs[idx].grid_region = ''
      }
      return { ...inv, locations: locs }
    })
  }

  /**
   * A LOCATION ID THAT CANNOT COLLIDE, AND CANNOT COLLIDE WITH THE OLD SCHEME EITHER.
   *
   * ⚠️ IDS USED TO BE String(inventory.locations.length + 1), READ FROM THE RENDER. Two adds in one tick
   * both saw the same length and produced the same id. A location id is not decoration: coverage
   * resolutions match on it (`r.locId === loc.id`), unpriceableById is keyed on it, and removeDoc now
   * addresses a location by it — so two locations sharing an id means one location's coverage resolution
   * can apply to the other, and a document removal can land on the wrong one.
   *
   * The `loc_` prefix is what keeps this clear of saved data: every existing inventory carries ids '1',
   * '2', '3' … from the old scheme, and no generated id can now take that form, so a new location can
   * never be mistaken for an old one. 8 base36 characters ~ 2.8e12 values, and the guard inside the
   * updater below rejects a collision with a location already present rather than trusting the odds.
   */
  const newLocationId = () => `loc_${Math.random().toString(36).slice(2, 10)}`

  /**
   * ⚠️ THE ALLOWANCE IS ENFORCED INSIDE THE UPDATER, WHERE THE COUNT IS CURRENT. The check outside it
   * is what the customer SEES — the upgrade wall — and it reads the render, which is right for a single
   * click and stale for two in one tick. The inner check is the one that cannot be raced: the second
   * add of a double click is REFUSED SILENTLY there (the list is returned unchanged), so the customer
   * sees one location appear rather than two, and no wall. That is deliberate: the alternative is a
   * wall raised from inside a state updater, which means a side effect in a function React may call
   * twice. The allowance itself cannot be exceeded this way, and the database trigger
   * enforce_ghg_location_allowance refuses the save if it ever were.
   *
   * The id is generated OUTSIDE the updater, because generating it inside would make the updater impure;
   * generation is collision-proof on its own, and the updater still refuses an id it somehow already
   * holds. Focus is asked for as "one past the end" and clamped where activeLocation is derived, so no
   * step here reads the rendered length.
   */
  const addLocation = () => {
    if (locationAllowance != null && !allowanceLoading && inventory.locations.length >= locationAllowance) { setShowLocationWall(true); return }
    const id = newLocationId()
    setInventory(inv => {
      if (locationAllowance != null && !allowanceLoading && inv.locations.length >= locationAllowance) return inv
      if (inv.locations.some(l => l.id === id)) return inv
      // The NAME counts from the current list, so two adds in one tick are numbered 4 and 5, not 4 and 4.
      return { ...inv, locations: [...inv.locations, emptyLocation(id, `Location ${inv.locations.length + 1}`)] }
    })
    // "The last location", resolved by the clamp on activeLocation. A refused add leaves the list as it
    // was, so this lands on the last existing location rather than on one that was never created.
    setActiveLocation(inventory.locations.length)
  }

  const toggleFramework = (id: string) => {
    setInventory(inv => ({
      ...inv,
      selected_frameworks: inv.selected_frameworks.includes(id)
        ? inv.selected_frameworks.filter(f => f !== id)
        : [...inv.selected_frameworks, id]
    }))
  }

  const handleFileUpload = async (files: FileList, locIdx: number, docType: string) => {
    if (!files.length) return
    setUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUploading(false); return }
    setUploadErrors(prev => { const next = { ...prev }; delete next[`${locIdx}:${docType}`]; return next })
    for (const file of Array.from(files)) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${session.user.id}/${inventory.reporting_year}/${inventory.locations[locIdx].name.replace(/\s+/g, '_')}/${Date.now()}_${safeName}`
      const { error } = await supabase.storage.from('source-documents').upload(path, file)
      if (error) {
        // (d) The file never reached storage. There is no document to attach a note to, so this is
        // the one case that needs a transient message. Silently doing nothing was indistinguishable
        // from a successful upload that produced no figures.
        console.error('[upload] storage failed', error)
        setUploadErrors(prev => ({ ...prev, [`${locIdx}:${docType}`]: `${file.name} didn’t upload — ${error.message}. Please try again.` }))
        continue
      }
      {
        const doc: SourceDoc = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, file_name: file.name, document_type: docType, uploaded_at: new Date().toISOString(), file_path: path }

        // ── Concierge step 5: read bill, convert via lib (single source of truth), attach proposals to the doc. No field write yet. ──
        // Skipped entirely for the document types the concierge cannot read a figure from — see
        // CONCIERGE_UNREAD_DOC_TYPES. The upload still happens; only the extraction call is skipped.
        if (CONCIERGE_DEV && !CONCIERGE_READABLE_MEDIA.has(file.type)) {
          // (a) A file the reader cannot open — a spreadsheet or CSV. Keeping it is the point: it is
          // still the evidence behind whatever figure gets typed in. Say so rather than attempting a
          // call the route would reject and then discarding its explanation.
          doc.read_outcome = 'not_read'
          doc.read_note = 'Kept as evidence. We read PDFs and photos — type this figure into the box above.'
        } else if (CONCIERGE_DEV && !CONCIERGE_UNREAD_DOC_TYPES.has(docType)) {
          try {
  const res = await fetch('/api/concierge/extract', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ filePath: doc.file_path, mediaType: file.type, locationName: inventory.locations[locIdx].name }),
            })
            const json = await res.json()
            if (json?.success && Array.isArray(json.fields)) {
              const { convertToCanonical } = await import('../../../lib/unitConversions')
              doc.extracted = json.fields
                // SUPPORTED_FUELS, not a local copy: this filter and the prompt the route builds must
                // describe the same set, or the model is asked for a fuel whose figure is silently
                // dropped here. This was the third copy of the same five names.
                .filter((f: any) => f && f.value != null && (SUPPORTED_FUELS as readonly string[]).includes(f.fuelType))
                .map((f: any): ExtractedProposal => {
                  const conv = convertToCanonical(f.fuelType, f.value, f.unit)
                  const needsReview = conv.tier === 3 || f.confidence === 'low'
                  return {
                    fuelType: f.fuelType,
                    rawValue: f.value,
                    rawUnit: f.unit ?? null,
                    value: conv.value,
                    unit: conv.unit,
                    conversionNote: conv.conversionNote,
                    periodStart: f.periodStart ?? null,
                    periodEnd: f.periodEnd ?? null,
                    periodConfidence: f.periodConfidence ?? null,
                    confidence: f.confidence,
                    sourceQuote: f.sourceQuote ?? null,
                    notes: f.notes ?? null,
                    status: needsReview ? 'needs_manual_review' : 'extracted',
                  }
                })
              console.log('[concierge step5] proposals on doc:', doc.extracted)
              // OPERATOR TELEMETRY — extraction is a paid add-on, so the per-document cost of a call
              // should be observable rather than discarded. Deliberately console only: this is for
              // whoever is watching the logs, not for the customer, who has no use for a token count.
              //
              // METADATA ONLY. Nothing here comes from the document: not a value, not a unit, not a
              // source quote, not a period. `proposals` is a COUNT, and docType names the slot the
              // upload went into — both describe the call, never its contents.
              console.log('[concierge cost]', {
                docType,
                model: json.model ?? 'unknown',
                inputTokens: json.usage?.input_tokens ?? null,
                outputTokens: json.usage?.output_tokens ?? null,
                proposals: doc.extracted?.length ?? 0,
              })
              if ((doc.extracted?.length ?? 0) === 0) {
                // (c) The document WAS read and no figure could be taken from it with confidence.
                // The extractor is instructed to abstain rather than guess, so this is the system
                // working — the wording must not read as a fault, or a customer will re-upload a
                // file that will abstain again for the same good reason.
                doc.read_outcome = 'abstained'
                doc.read_note = 'We read this one but couldn’t take a figure from it with confidence — type it into the box above.'
              }
            } else {
              // (b) The route answered, but not with usable fields — a rejected file type, a bad
              // request, an upstream error. Its own message is the most specific thing available.
              doc.read_outcome = 'failed'
              doc.read_note = typeof json?.error === 'string'
                ? `We couldn’t read this one — ${json.error} Type the figure into the box above, or try uploading again.`
                : 'We couldn’t read this one. Type the figure into the box above, or try uploading again.'
            }
          } catch (e) {
            // (b) The call itself failed — network, timeout, malformed response.
            console.error('[concierge extract] failed', e)
            doc.read_outcome = 'failed'
            doc.read_note = 'We couldn’t read this one — the connection dropped. Type the figure into the box above, or try uploading again.'
          }
        }

        // Store the doc (with any proposals) in one functional update — avoids stale-closure append bug on multi-file upload.
        setInventory(inv => {
          const locs = [...inv.locations]
          locs[locIdx] = { ...locs[locIdx], source_docs: [...locs[locIdx].source_docs, doc] }
          return { ...inv, locations: locs }
        })
      }
    }
    setUploading(false)
  }

  /**
   * Detach a source document: delete the object, then drop the row.
   *
   * ⚠️ THIS USED TO ERASE A DOCUMENT UPLOADED WHILE IT WAS WORKING. It read
   * `inventory.locations[locIdx].source_docs` AFTER awaiting the storage delete — from the render that
   * produced the click, not from current state — filtered that stale array and wrote the whole thing
   * back through updateLocation. An upload finishing inside that await (its own await chain runs for
   * seconds in concierge mode) appended to current state, and this write replaced it with a list that
   * had never contained it. The file stayed in the bucket with no row pointing at it, the next save
   * persisted the shortened list, and nothing anywhere noticed: no error, no reconciliation against
   * storage, and a reload confirmed the loss rather than revealing it.
   *
   * Both lists are now edited INSIDE the updater, from `inv`, and both are addressed BY id — the
   * location as well as the document, because locIdx is a render-time position with exactly the same
   * staleness if locations are added or removed while this runs.
   *
   * ⚠️ STORAGE FIRST, THEN THE ROW, AND THE RESULT IS CHECKED. The delete's result used to be
   * discarded. Dropping the row first would make a failed delete invisible — the document disappears as
   * the customer asked and the file is orphaned in the bucket with nobody to notice. This way a failure
   * leaves the document exactly where it was, listed and attached, with a message saying it is still
   * there and to try again. Nothing reads source_docs expecting the object to exist (the path is only
   * signed on demand or downloaded for extraction), so no ordering is forced by the data; what decides
   * it is which failure a customer can see. Storage deletes are idempotent, so the retry is safe.
   */
  const removeDoc = async (locId: string, docId: string, filePath: string, errorKey: string) => {
    setUploadErrors(prev => { const next = { ...prev }; delete next[errorKey]; return next })
    const { error } = await supabase.storage.from('source-documents').remove([filePath])
    if (error) {
      console.error('[removeDoc] storage delete failed', error)
      setUploadErrors(prev => ({ ...prev, [errorKey]: `That document couldn’t be deleted — ${error.message}. It is still attached to this location; try Remove again.` }))
      return
    }
    setInventory(inv => ({
      ...inv,
      locations: editRows(inv.locations, {
        kind: 'update',
        id: locId,
        // A function patch, so the document list is the one this location holds NOW.
        patch: loc => ({ source_docs: editRows(loc.source_docs, { kind: 'remove', id: docId }) }),
      }),
    }))
  }

  /**
   * Remove a location, its uploaded files and its coverage resolutions, then save.
   *
   * ⚠️ ADDRESSED BY ID AND EDITED INSIDE THE UPDATER, for the reason removeDoc already carries a
   * paragraph about: a render-time index is stale the moment a location is added or removed while
   * this runs, and this function awaits storage in the middle. Nothing here closes over a position.
   *
   * ⚠️ STORAGE FIRST, AND A FAILURE STOPS EVERYTHING. Dropping the row first and failing the delete
   * leaves files in the bucket with nothing pointing at them and nobody to notice: the jsonb that
   * named them is gone. This way a failure leaves the location exactly as it was, listed with its
   * documents, and says so. Storage deletes are idempotent, so retrying is safe.
   *
   * ⚠️ THEN IT SAVES, BECAUSE THE IRREVERSIBLE HALF HAS ALREADY HAPPENED. Leaving the save to the
   * customer would leave a window in which the files are destroyed and the stored record still
   * lists them. The save can still fail, and locationDeleteSaveFailed says precisely what state the
   * screen, the record and the bucket are each in rather than reporting a generic save error.
   */
  const removeLocation = async (locId: string) => {
    const loc = inventory.locations.find(l => l.id === locId)
    if (!loc) return
    // ⚠️ THE LAST LOCATION HAS NO CONTROL AT ALL, so this is unreachable from the UI. It is here
    // because a guard that exists only in the render is a guard one refactor away from being gone.
    if (inventory.locations.length <= 1) return

    const facts = locationDeleteFacts(loc, inventory.coverage_resolutions ?? [])
    if (!window.confirm(locationDeleteConfirmation(facts))) return

    const paths = (loc.source_docs ?? []).map(d => d.file_path).filter(Boolean)
    if (paths.length > 0) {
      const { error } = await supabase.storage.from('source-documents').remove(paths)
      if (error) {
        console.error('[removeLocation] storage delete failed', error)
        alert(locationDeleteStorageFailed(facts, error.message))
        return
      }
    }

    // ⚠️ activeLocation IS SET EXPLICITLY, NOT LEFT TO THE CLAMP. It is an index, so the clamp keeps
    // it in range while silently pointing it at a different site: delete the second of three and the
    // tab that was Brighton is Manchester, in the same position, with the customer's next figure
    // going to the wrong location. The row before the removed one is the deliberate answer.
    const removedAt = inventory.locations.findIndex(l => l.id === locId)
    setActiveLocation(Math.max(0, removedAt - 1))

    setInventory(inv => ({
      ...inv,
      locations: editRows(inv.locations, { kind: 'remove', id: locId }),
      // The inventory-level array nothing else scopes to a location. Left behind it is invisible on
      // screen, counted by nothing, and carried in every payload from here on.
      coverage_resolutions: (inv.coverage_resolutions ?? []).filter(r => r.locId !== locId),
    }))
    setSaved(false)

    await handleSave()
    // Read synchronously after the await: the ref, not state, because state from this tick is not
    // visible here and the message is needed now.
    if (lastSaveError.current) alert(locationDeleteSaveFailed(facts, lastSaveError.current))
  }

  // Concierge: update one proposal, then recompute mapped inventory fields from ALL confirmed proposals at this location.
  // fuelType + docType -> field(s). Write = SUM of confirmed proposals mapping to that field.
  // Mixed units for one field are NOT summed (would be wrong) -> those proposals flip to needs_manual_review.
  const updateProposal = (locIdx: number, docId: string, propIdx: number, patch: Partial<ExtractedProposal>) => {
    setInventory(inv => {
      const locs = [...inv.locations]

      // 1. Apply the patch to the target proposal.
      let docs = locs[locIdx].source_docs.map(d => {
        if (d.id !== docId || !d.extracted) return d
        return { ...d, extracted: d.extracted.map((p, i) => i === propIdx ? { ...p, ...patch } : p) }
      })

      // 2. applyResolutions is the ONE implementation of what each field's figure is (shared with
      //    buildWorkings). It gathers confirmed proposals, sums, and applies any coverage resolution.
      const loc: any = { ...locs[locIdx], source_docs: docs }
      const win = periodFromYearAndEnd(inv.reporting_year, inv.fiscal_year_end_month)
      const applied = applyResolutions(loc, inv.coverage_resolutions ?? [], win.start, win.end)

      // 3. Write each field. Mixed units -> don't write; flag those proposals for review.
      const flagged: { docId: string; pi: number }[] = []
      Object.values(applied).forEach(a => {
        if (a.mixedUnits) { flagged.push(...a.refs); return }
        loc[a.field] = a.value
        if (a.unitField && a.unit != null) loc[a.unitField] = a.unit
      })

      // 4. If any field had mixed units, flip those proposals to needs_manual_review.
      if (flagged.length) {
        docs = docs.map(d => {
          if (!d.extracted) return d
          return { ...d, extracted: d.extracted.map((p, pi) => flagged.some(f => f.docId === d.id && f.pi === pi) ? { ...p, status: 'needs_manual_review' as ConciergeStatus } : p) }
        })
      }

      loc.source_docs = docs
      locs[locIdx] = loc
      return { ...inv, locations: locs }
    })
    }
    // Write a coverage resolution (gap/overlap/straddle) onto the inventory. Re-resolving the
  // same fuel+location+kind overwrites the prior one. The extrapolation gross-up is applied
  // in updateProposal's field-write step; here we also nudge a re-derivation by re-confirming
  // an existing confirmed proposal so totals refresh immediately.
  const addCoverageResolution = (res: CoverageResolution) => {
    setInventory(inv => {
      const existing = (inv.coverage_resolutions ?? []).filter(
        r => !(r.locId === res.locId && r.fuelType === res.fuelType && r.kind === res.kind))
      // Re-derive affected fields so an extrapolation applies right away. We recompute the
      // same byField sum used in updateProposal, now that the resolution is present.
      const resolutions = [...existing, res]
      const win = periodFromYearAndEnd(inv.reporting_year, inv.fiscal_year_end_month)
      const locs = inv.locations.map(loc => {
        if (loc.id !== res.locId) return loc
        const next: any = { ...loc }
        // Same single implementation as updateProposal — no copy-pasted gross-up logic.
        Object.values(applyResolutions(loc, resolutions, win.start, win.end)).forEach(a => {
          if (a.mixedUnits) return
          next[a.field] = a.value
          if (a.unitField && a.unit != null) next[a.unitField] = a.unit
        })
        return next
      })
      return { ...inv, coverage_resolutions: resolutions, locations: locs }
    })
  }
  const needsMarketBased = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')
  // Concierge export gate: block export while any proposal is unconfirmed ('extracted') or flagged ('needs_manual_review').
  // No proposals (manual-entry users) -> trivially ready. Coverage-completeness is a separate check (step 9b).
  const conciergePending = inventory.locations.flatMap(l => l.source_docs).flatMap(d => d.extracted ?? []).filter(p => p.status === 'extracted' || p.status === 'needs_manual_review')
  // Coverage gate (step 9b) — pure engine function. Per location × document_type, run analyzeCoverage
  // and flag any gap/overlap/straddle lacking a matching resolution. conciergeReady composes over it.
  const coverageResolutions = inventory.coverage_resolutions ?? []
  const unresolvedCoverage = findUnresolvedCoverage(inventory.locations, inventory.reporting_year, inventory.fiscal_year_end_month, coverageResolutions)
  const conciergeReady = conciergePending.length === 0 && unresolvedCoverage.length === 0
  // Grid-region gate: locations whose grid_region isn't a real GRID_EF key (us_average default, '',
  // or an unmapped country) — these silently fall back to US_AVG in getGridFactor. Consumed by the
  // step-2 advance + export gates and the UI prompt (sub-steps D/E). Pure derivation, no behaviour here.
  //
  // ⚠️ A REFUSED LOCATION IS NEVER ASKED FOR A GRID REGION, AND WITHOUT THIS IT COULD NOT ANSWER.
  // gridRegionForCountry returns '' for every country this platform does not support, and the only
  // controls that set grid_region are the US state, the Canadian province and the country itself.
  // A location set to "Not listed" therefore had an unresolvable grid gate: the step 2 Continue
  // button stayed disabled with no control anywhere that could clear it. Nothing about a grid region
  // matters for a location excluded from every total, so the country refusal is the only reason
  // shown for it, and it is shown once.
  const unresolvedGridLocations = inventory.locations
    .filter(l => !countryRefusal(l))
    .map((l, i) => ({ i, name: l.name || `Location ${i + 1}`, region: l.grid_region }))
    .filter(l => !isResolvedGridRegion(l.region))
  const gridReady = unresolvedGridLocations.length === 0
  // Completeness gate (COMPOSED with, never folded into, the coverage gate). A stream with neither data
  // nor an explicit attestation is UNDECLARED — absence must not export as an attested zero. Remedy is
  // data or attestation, NOT acknowledgement (unlike a coverage gap). Gated at the same four sites as
  // gridReady, with its own amber message; deliberately NOT gating the step-2 Continue.
  const undeclaredStreams = findUndeclaredStreams(inventory.locations)
  const declarationsReady = undeclaredStreams.length === 0
  // SPLIT BY WHY THE STREAM BLOCKS, because the two states need OPPOSITE instructions and one message
  // cannot carry both. "Enter the data or attest absent" is right for a stream nobody was asked about
  // and WRONG for one the site has said it uses: attesting absent would contradict its own answer, and
  // it is the option a customer reaches for first because it needs no figure. The gate treats them the
  // same (both block); only the instruction differs. Both lists render when both are present.
  const streamsNeverAnswered = undeclaredStreams.filter(u => u.state === 'undeclared')
  const streamsWithoutFigure = undeclaredStreams.filter(u => u.state === 'declared_unquantified')
  // Pricing gate. A location whose fuel unit has no published factor for its country cannot be
  // priced at all; it is EXCLUDED from every total (never counted as zero) and named wherever a
  // total that excludes it is shown.
  //
  // PROBED ONCE, AT AR6, AND REUSED FOR AR4/AR5 — deliberately not run per GWP. Whether a factor
  // EXISTS is a property of the country's factor table and the unit, not of the GWP basis: the AR
  // version only scales CH4/N2O once a factor has been found. So the answer is identical for all
  // three, and calcInventory (called three times, one per basis) excludes the same locations each
  // time. Running the probe per basis would triple a pure-arithmetic sweep to reach that same
  // answer, and — worse — would invite a future reader to believe the sets could differ.
  const unpriceableLocations = findUnpriceableLocations(inventory.locations, 'AR6', inventory.reporting_year)
  const refusedLocations = unpriceableLocations.filter(u => u.kind === 'country')
  const factorGapLocations = unpriceableLocations.filter(u => u.kind === 'factor')
  // ⚠️ THE EXPORT GATE BLOCKS ONLY ON WHAT THE CUSTOMER CAN FIX, AND THAT IS NOT A RELAXATION.
  // A blocked export is an instruction: go and do something. For a location whose country is set to
  // "Not listed", or whose country this platform holds no factors for, there is nothing to go and
  // do. Blocking there does not protect the verifier, it withholds the report permanently from a
  // customer whose other locations are complete and correct.
  //   What protects the verifier is that the exclusion is STATED, on every surface the figures reach:
  // the note on each total, the CSV, the workings, the verifier page and Category 3. That is
  // stronger than a gate, because a gate that can never be cleared eventually gets removed.
  //   refusalIsFixable is the same predicate that decides whether the sentence offers a remedy, so
  // the two cannot disagree: we block exactly where we tell the customer what to do.
  const blockingRefusals = refusedLocations.filter(u => u.kind === 'country' && refusalIsFixable(u.refusal))
  const statedRefusals = refusedLocations.filter(u => u.kind === 'country' && !refusalIsFixable(u.refusal))
  // Blocks on factor gaps (always fixable: change the unit or the country) and on fixable refusals.
  // A stated refusal is excluded from the totals and named everywhere, and does not block.
  const pricingReady = factorGapLocations.length === 0 && blockingRefusals.length === 0
  const unpriceableById = new Map(unpriceableLocations.map(u => [u.locId, u]))
  // Every publisher that priced anything in this inventory, in first-appearance order. The union of
  // the per-location lists, so the checklist note and each location's own line cannot disagree.
  const inventoryPublishers = [...new Set(
    inventory.locations.flatMap(l => publishersForLocation(l, 'AR6', inventory.reporting_year)),
  )]
  // One phrasing of "this total leaves something out", used at every site that shows a total.
  // ⚠️ "we can't work out YET" IS TRUE OF A UNIT MISMATCH AND FALSE OF A COUNTRY WE HOLD NO FACTORS
  // FOR. "Yet" promises the customer that something they do will fix it; for country_not_supported,
  // and for the chosen "Not listed", there is nothing they can do, and a promise that quietly never
  // comes true is worse than a plain statement. Two clauses, joined only when both apply.
  //
  // ⚠️ KEYED ON WHAT IS EXCLUDED, NOT ON WHETHER THE EXPORT IS BLOCKED, AND TASK 2a IS WHY.
  // This read `pricingReady ? null : …` when the two meant the same thing. They no longer do: a
  // stated refusal leaves pricingReady TRUE and still excludes a location from every total, so
  // keying on the gate would have silenced the note on exactly the reports that go out with a
  // location missing. The note is the thing that makes not blocking safe.
  const exclusionNote = unpriceableLocations.length === 0 ? null : [
    factorGapLocations.length > 0
      ? `Excludes ${factorGapLocations.length} location${factorGapLocations.length > 1 ? 's' : ''} we can't work out yet (${factorGapLocations.map(u => u.locName).join(', ')}).`
      : null,
    refusedLocations.length > 0
      ? `Excludes ${refusedLocations.length} location${refusedLocations.length > 1 ? 's' : ''} we hold no emission factors for (${refusedLocations.map(u => u.locName).join(', ')}).`
      : null,
  ].filter(Boolean).join(' ')
  // ── STEAM WITH NO FACTOR — its own readiness condition, beside gridReady / pricingReady ─────────
  // A location that declared and quantified purchased steam in a jurisdiction with no published
  // factor (CA/AU/NZ/EU) and supplied no provider figure. Its steam contributes NOTHING to any total,
  // so exporting would hand a verifier an assurance package whose Scope 2 is short by a stream the
  // customer positively declared. The remedy is the supplier-factor field on the Energy & fuel step.
  const steamFactorGaps = findSteamFactorGaps(inventory.locations)
  const steamFactorsReady = steamFactorGaps.length === 0
  const needsPriorYear = inventory.selected_frameworks.includes('cdp')
  const needsEmployees = inventory.selected_frameworks.includes('ecovadis')
  const needsBiogenic = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')

  // ── Year-over-year comparability (ISO 14064-3:2019 cl. 6.3.1.5) ────────────────────────────────
  // The observation and its basis come from lib/ghg/comparability.ts. NOTHING here re-derives a
  // line — same rule as buildWorkings: one renderer, one source of the words.
  //
  // 0 IS THIS WIZARD'S "not entered". Both inputs render `value={... || ''}`, so a stored 0 already
  // shows the customer a blank field; mapping it to null keeps the module's absent-figure contract
  // agreeing with what is on screen. Stated cost: a company whose prior Scope 1 was genuinely zero
  // reads as absent and gets no Scope 1 line.
  //
  // 'skipped' until a result tagged with THIS (company, year) has arrived — which covers both "no
  // company identity, so no query was sent" and "the query is still in flight". Neither has looked
  // at a prior year, and neither may claim to have.
  const priorYearKey = inventory.company_id ? `${inventory.company_id}:${inventory.reporting_year}` : null
  const priorYear: PriorYearLookup =
    priorYearKey && priorYearLookup?.key === priorYearKey ? priorYearLookup.result : { status: 'skipped' }

  // 'not_stored' is what four of the five lookup outcomes resolve to, and it is honest for three of
  // them — no company identity to match on, no row, or two rows that cannot be called "last year's".
  // ⚠️ On 'error' it is a GUESS: the query failed, so whether a prior year exists is unknown, and
  // basis.statement will still say it isn't held on the platform. Nothing renders or persists that
  // sentence today, and a write path must refuse this case rather than record it.
  // ⚠️ AR6 ONLY. Until 17 Sep 2026 this computed the inventory three times, on AR4, AR5 and AR6, and
  // looked each framework's totals up by FRAMEWORKS[].gwp. That was built on 20 May 2026, when SB 253, CDP,
  // EcoVadis and IFRS S2 were AR4 and ESRS E1 and GRI 305 were AR5. Every framework has been AR6 since
  // f83326a (20 Jun 2026), so the AR4 and AR5 totals were computed on every render and never shown.
  // Every surface below reads totals_ar6 directly; lib/ghg/gwpBasis.test.ts fails if a framework's gwp
  // ever stops being AR6, because then these surfaces would label AR6 figures with another basis.
  // The engine still computes on AR4 and AR5 (its GWP table and tests use them); only this page stopped.
  const totals_ar6 = calcInventory(inventory.locations, 'AR6', inventory.reporting_year)

  // Everything the comparability step hands forward. Assembled here rather than read out of
  // scattered state at save time, so the write path takes FACTS and infers nothing.
  const comparabilityDraft = {
    // AR6 is the basis the inventory is saved on (see the save payload), so the comparison is
    // stated on the same basis the figures are stored on.
    disclosure: buildComparabilityDisclosure({
      priorScope1: inventory.prior_year_s1 > 0 ? inventory.prior_year_s1 : null,
      priorScope2: inventory.prior_year_s2 > 0 ? inventory.prior_year_s2 : null,
      thisScope1: totals_ar6.s1_total,
      thisScope2: totals_ar6.s2_location,
      priorYearState: priorYear.status === 'found' ? priorYear.state : 'not_stored',
      priorSummary: priorYear.status === 'found' ? priorYear.summary : null,
      thisSummary: summarize(inventory.locations, inventory.boundary_approach),
    }),
    /** The answer as captured when given, with the observation and basis of that moment. */
    capture: comparabilityCapture,
    note: comparabilityNote,

    /**
     * TRUE when the prior-year lookup ITSELF FAILED — the query errored, so whether a prior year
     * exists is unknown.
     *
     * NOT the same as a lookup that succeeded and found nothing. That one is an answer: there is no
     * prior inventory, and 'not_stored' describes it correctly. This one is the absence of an
     * answer, and the disclosure above nonetheless carries 'not_stored' because the module's
     * PriorYearState has no fourth value for "we could not look" — so its basis says the prior
     * period is not held on the platform, which here is a guess we cannot stand behind.
     *
     * A WRITE PATH MUST REFUSE ON THIS FLAG. It is a plain boolean, and false does not mean the
     * lookup succeeded in some partial way — the four other outcomes are all real observations.
     * Nothing about the failure is recoverable by reading the disclosure: a basis built on a failed
     * lookup is indistinguishable from one built on a genuine absence, which is why the fact has to
     * travel as its own field rather than be re-derived downstream.
     */
    priorYearLookupFailed: priorYear.status === 'error',
    /** The error as reported, for the refusal to say what was observed rather than guess a cause. */
    priorYearLookupErrorMessage: priorYear.status === 'error' ? priorYear.message : null,
  }

  // A RADIO CLICK IS THE EVENT. Takes the observation and the basis as they are on screen at that
  // instant, with a new timestamp — choosing an option is answering, and the record belongs to the
  // moment of the click.
  //
  // Editing the note is NOT this. That is elaboration on an answer already given: it changes the
  // note and nothing else. Calling this from the textarea would let a typo fix rewrite answeredAt
  // and re-take the observations, quietly erasing drift the save is supposed to record.
  //
  // Nothing to capture against means nothing to record: with no disclosure there was no question,
  // and the radios are not rendered, so this cannot be reached with a null disclosure.
  const captureComparabilityAnswer = (answer: ComparabilityAnswer) => {
    const d = comparabilityDraft.disclosure
    if (!d) return
    setComparabilityCapture({
      observations: observationLines(d),
      question: d.question,
      answer,
      basis: d.basis,
      answeredAt: new Date().toISOString(),
    })
  }

  // What the step renders. Unchanged — the customer still sees whatever Tier A can say from the
  // typed-in figures, on a failed lookup exactly as on a successful one.
  const comparability = comparabilityDraft.disclosure

  const STEPS = ['Reporting frameworks', 'Company setup', 'Energy & fuel data', 'Additional data', 'Review & workings', 'Export reports', 'Audit trail']
  const activeFrameworks = FRAMEWORKS.filter(f => inventory.selected_frameworks.includes(f.id))
  // Lock the company field once an inventory is saved AND linked to a company.
  const companyLocked = !!inventoryId && !!inventory.company_id

  const handleSave = async () => {
    if (isSaving) return
    lastSaveError.current = null
    setIsSaving(true)
    try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    // Resolve the company_id for this inventory's company_name.
    let resolvedCompanyId = inventory.company_id || null
    const trimmedName = (inventory.company_name || '').trim()
    if (!resolvedCompanyId && trimmedName) {
      // look up an existing company by (user_id, name); reuse if present
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('name', trimmedName)
        .maybeSingle()
      if (existing) {
        resolvedCompanyId = existing.id
      } else {
        const { data: created, error: cErr } = await supabase
          .from('companies')
          .insert({ user_id: session.user.id, name: trimmedName })
          .select('id')
          .single()
        if (cErr) { lastSaveError.current = cErr.message; alert('Could not save company: ' + cErr.message); return }
        resolvedCompanyId = created.id
      }
    }

    // ── Comparability: drift check, then the record ────────────────────────────────────────────
    //
    // `comparabilityDraft.disclosure` is the CURRENT recompute — the observation the module would
    // make from state as it stands now. The capture inside the draft is what the customer actually
    // answered. buildComparabilityRecord compares the two and records a difference as a fact
    // alongside the original; it never rewrites what was shown.
    //
    // No re-ask, no clearing the answer, no blocking the save. Drift is information for a verifier,
    // not an error for the customer: an answer given honestly against last week's figures does not
    // stop being an honest answer because a location was added since.
    const comparabilityRecord = buildComparabilityRecord({
      capture: comparabilityDraft.capture,
      note: comparabilityDraft.note,
      priorYearLookupFailed: comparabilityDraft.priorYearLookupFailed,
      current: comparabilityDraft.disclosure,
      checkedAt: new Date().toISOString(),
    })

    const payload = {
      user_id: session.user.id,
      reporting_year: inventory.reporting_year,
      fiscal_year_end_month: inventory.fiscal_year_end_month,
      company_name: inventory.company_name,
      company_id: resolvedCompanyId,
      revenue_millions: inventory.revenue_millions,
      employee_count: inventory.employee_count,
      boundary_approach: inventory.boundary_approach,
      california_nexus: inventory.california_nexus,
      prior_year_s1: inventory.prior_year_s1,
      prior_year_s2: inventory.prior_year_s2,
      // The comparability record, or what is already stored if this save has nothing to write.
      //
      // THE FALLBACK IS NOT COSMETIC. buildComparabilityRecord returns null for two different
      // reasons — the question was not answered THIS session, or the prior-year lookup failed —
      // and neither is a reason to destroy an answer given on an earlier visit. Writing a bare
      // null here would erase a real disclosure because the customer reopened the inventory and
      // saved without touching the question. "Do not write" means leave it as it is, which for a
      // fresh inventory is null anyway.
      comparability_disclosure: comparabilityRecord ?? inventory.comparability_disclosure ?? null,
      selected_frameworks: inventory.selected_frameworks,
      locations_data: inventory.locations,
      coverage_resolutions: coverageResolutions,
      pct_estimated: pctEstimated(inventory.locations, coverageResolutions, 'AR6', inventory.reporting_year),
      scope1_total: totals_ar6.s1_total,
      scope2_location_total: totals_ar6.s2_location,
      scope2_market_total: totals_ar6.s2_market,
      scope1_intensity: inventory.revenue_millions > 0 ? totals_ar6.s1_total / inventory.revenue_millions : 0,
      scope2_intensity: inventory.revenue_millions > 0 ? totals_ar6.s2_location / inventory.revenue_millions : 0,
      gwp_version: 'AR6',
      // Which factor editions priced the totals above. The electricity edition comes from
      // getGridFactor().usedYear, NOT from the citation — EF_SOURCES.electricity_uk is deliberately
      // year-neutral because GRID_EF.UK holds two editions, so the citation records both years
      // identically and usedYear is the only thing that tells the earlier inventory from the later.
      // The stored map is passed as the fallback so a save that computes nothing (an inventory with
      // no priced location yet) leaves an earlier record intact rather than erasing it to '{}'.
      factor_editions: factorEditionsForSave(inventory.locations, inventory.reporting_year, inventory.factor_editions),
      status: 'draft',
// ⚠️ THIS IS ALSO THE RECORD OF WHAT THE SAVED TOTALS LEFT OUT. scope1_total / scope2_* above are
// computed with unpriceable locations EXCLUDED, and buildWorkings emits one `declaration:
// 'unpriceable'` row per excluded location (result_tco2e null, with the reason in `note`). So the
// omission travels with the figures, in the same column a verifier reads, and no schema change was
// needed to record it. If that row is ever dropped from buildWorkings, these saved totals become
// silently short — the stored inventory would assert a company-wide figure that omits a site with
// nothing on the record saying so.
workings: buildWorkings(inventory.locations, 'AR6', inventory.reporting_year, coverageResolutions, inventory.fiscal_year_end_month),
      updated_at: new Date().toISOString(),
    }
    let savedId: string | null = inventoryId
    if (inventoryId) {
      const { error } = await supabase.from('ghg_inventories').update(payload).eq('id', inventoryId)
      if (error) { lastSaveError.current = error.message; alert('Save failed: ' + error.message); console.error(error); return }
    } else {
      const dupQuery = supabase.from('ghg_inventories').select('id').eq('reporting_year', inventory.reporting_year)
      const { data: dup } = await (resolvedCompanyId ? dupQuery.eq('company_id', resolvedCompanyId) : dupQuery.eq('company_name', inventory.company_name)).maybeSingle()
      if (dup) { lastSaveError.current = 'An inventory for that company and year already exists.'; alert(`You already have a ${inventory.reporting_year} inventory for "${inventory.company_name}". Open it from "Your inventories" instead of creating a duplicate.`); return }
      const { data, error } = await supabase.from('ghg_inventories').insert(payload).select().single()
      if (error) { lastSaveError.current = error.message; alert('Save failed: ' + error.message); console.error(error); return }
      if (data) { savedId = data.id; setInventoryId(data.id) }
      loadCompanies() // refresh dropdown in case resolve-or-create added a new company
    }
    // Additive monthly-emissions write. Annual save above is already committed and
    // authoritative; a monthly failure here must NOT escape or skip setSaved(true).
    try {
      if (savedId) {
        const { slices } = buildMonthlyEmissions(
          inventory.locations as any,   // source_docs[].extracted[] live on these
          inventory.reporting_year,
          { calcGas, pickEF, getGridFactor, isResolvedGridRegion },
          'AR6'
        )
        // idempotent: replace this inventory's monthly rows
        const del = await supabase.from('ghg_monthly_emissions').delete().eq('inventory_id', savedId)
        if (del.error) throw del.error
        if (slices.length > 0) {
          const rows = slices.map(s => ({
            user_id: session.user.id,
            inventory_id: savedId,
            company_id: resolvedCompanyId,
            reporting_year: s.reporting_year,
            period_month: s.period_month,
            scope: s.scope,
            location_name: s.location_name,
            fuel_type: s.fuel_type,
            activity_value: s.activity_value,
            activity_unit: s.activity_unit,
            tco2e: s.tco2e,
            gwp_version: s.gwp_version,
            ef_source: s.ef_source,
            source_doc_id: null,
            period_start: s.period_start,
            period_end: s.period_end,
            pct_in_month: s.pct_in_month,
          }))
          const ins = await supabase.from('ghg_monthly_emissions').insert(rows)
          if (ins.error) throw ins.error
        }
      }
    } catch (e) {
      console.error('Monthly emissions write failed (annual save committed, unaffected):', e)
    }
    setSaved(true)
    setDirty(false)
    } finally { setIsSaving(false) }
  }

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Which reporting frameworks do you need?</h2>
      {pack && packNames[pack] ? (
        <p style={sectionSub}>Based on your <strong style={{ color: '#0F6E56', fontWeight: 600 }}>{packNames[pack]}</strong> selection, these are the reports you need — the highlighted frameworks below are included in your package. You can add others any time.</p>
      ) : (
        <p style={sectionSub}>Select all that apply. ThemisIQ collects your data once and generates each report automatically — no duplicate entry required.</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: '2rem' }}>
        {FRAMEWORKS.map(fw => {
          const selected = inventory.selected_frameworks.includes(fw.id)
          return (
            <div key={fw.id} onClick={() => toggleFramework(fw.id)} style={{ background: selected ? fw.bg : '#fff', border: selected ? '3px solid #0F6E56' : '1.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', cursor: 'pointer', transition: 'all 0.15s', opacity: selected ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: fw.color, background: fw.bg, border: `0.5px solid color-mix(in srgb, ${fw.color} 20%, transparent)`, borderRadius: 6, padding: '2px 8px', marginBottom: 6 }}>{fw.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{fw.full}</div>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${selected ? '#0F6E56' : '#e8e7e4'}`, background: selected ? '#0F6E56' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5, fontWeight: 400, marginBottom: 8 }}>{fw.desc}</div>
              <div style={{ fontSize: 11, color: fw.color, fontWeight: 500 }}>Deadline: {fw.deadline} · GWP: {fw.gwp}</div>
            </div>
          )
        })}
      </div>
      {inventory.selected_frameworks.length > 0 && (
        <div className="tq-summary" style={{ display: 'block', padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Selected: {activeFrameworks.map(f => f.name).join(' · ')}</div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-2)', fontWeight: 400, lineHeight: 1.6 }}>
            ThemisIQ will collect your data once and produce {inventory.selected_frameworks.length} report{inventory.selected_frameworks.length > 1 ? 's' : ''}.
            {needsMarketBased && ' ESRS/GRI requires market-based Scope 2 — we\'ll ask about renewable energy contracts.'}
            {needsPriorYear && ' CDP requires prior year comparison figures.'}
            {needsBiogenic && ' ESRS/GRI requires biogenic CO₂ to be reported separately.'}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Company & inventory setup</h2>
      <p style={sectionSub}>This information appears across all your selected reports. Enter it once here.</p>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 560 }}>
        <Field label="Company legal name" hint="Appears on all report submissions">
          {companyLocked ? (
            <>
              <input value={inventory.company_name} readOnly style={{ ...inputStyle, background: '#f8f7f5', color: 'var(--color-ink-muted)', cursor: 'not-allowed' }} />
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 6 }}>Linked company — set when this inventory was created.</div>
            </>
          ) : (addingNewCompany || companies.length === 0) ? (
            <>
              <input value={inventory.company_name} onChange={e => setInventory(i => ({...i, company_name: e.target.value, company_id: null}))} placeholder="e.g. Acme Industries Inc." style={inputStyle} />
              {companies.length > 0 && (
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  <button
            type="button"
            onClick={() => setAddingNewCompany(false)}
            style={{ background: 'none', border: 'none', padding: 0, color: '#0F6E56', cursor: 'pointer', fontSize: 11, font: 'inherit' }}
          >← choose an existing company</button>
                </div>
              )}
            </>
          ) : (
            <select
              value={inventory.company_id ?? ''}
              onChange={e => {
                const v = e.target.value
                if (v === '__new__') { setAddingNewCompany(true); setInventory(i => ({...i, company_id: null, company_name: ''})) }
                else if (v) { const c = companies.find(c => c.id === v); if (c) setInventory(i => ({...i, company_id: c.id, company_name: c.name})) }
              }}
              style={inputStyle}
            >
              <option value="">Select a company…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ Add a new company</option>
            </select>
          )}
        </Field>
        <Field label="Reporting year">
          <select value={inventory.reporting_year} onChange={e => setInventory(i => ({...i, reporting_year: Number(e.target.value)}))} style={inputStyle}>
            {reportingYearOptions().map(yr => (
              <option key={yr} value={yr}>{`FY${yr} · ${periodFromYearAndEnd(yr, inventory.fiscal_year_end_month).label}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Fiscal year-end" hint="Most organizations report on the calendar year. Change this only if your reporting year ends in a month other than December.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555553', cursor: 'pointer' }}>
              <input type="checkbox" checked={inventory.fiscal_year_end_month === 12} onChange={e => setInventory(i => ({...i, fiscal_year_end_month: e.target.checked ? 12 : 3}))} />
              Calendar year (Jan–Dec)
            </label>
            {inventory.fiscal_year_end_month !== 12 && (
              <select value={inventory.fiscal_year_end_month} onChange={e => setInventory(i => ({...i, fiscal_year_end_month: Number(e.target.value)}))} style={{ ...inputStyle, maxWidth: 260 }}>
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((mn, idx) => (
                  <option key={idx + 1} value={idx + 1}>{`Fiscal year ends in ${mn}`}</option>
                ))}
              </select>
            )}
          </div>
        </Field>
        <Field label="Global annual revenue (USD)" hint="Required by CARB SB 253, CDP, ESRS E1, EcoVadis, and IFRS S2 for emission intensity calculations">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#555553' }}>$</span>
            {/* User types RAW dollars; we store millions (revenue_millions stays millions for all consumers). Round the display to kill float artifacts on sub-million values (e.g. 0.4 * 1e6). */}
            <input type="number" value={inventory.revenue_millions ? Math.round(inventory.revenue_millions * 1_000_000) : ''} onChange={e => { const raw = Number(e.target.value); setInventory(i => ({...i, revenue_millions: isNaN(raw) ? 0 : raw / 1_000_000})) }} placeholder="1000000" style={{ ...inputStyle, flex: 1 }} />
            <span style={{ fontSize: 13, color: '#555553', whiteSpace: 'nowrap' }}>USD</span>
          </div>
        </Field>
        {needsEmployees && (
          <Field label="Total number of employees (FTE)" hint="Required by EcoVadis for per-employee intensity calculation">
            <input type="number" value={inventory.employee_count || ''} onChange={e => setInventory(i => ({...i, employee_count: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
          </Field>
        )}
        <Field label="Organizational boundary approach">
          <select value={inventory.boundary_approach} onChange={e => setInventory(i => ({...i, boundary_approach: e.target.value}))} style={inputStyle}>
            <option value="operational_control">Operational Control (most common)</option>
            <option value="financial_control">Financial Control</option>
            <option value="equity_share">Equity Share</option>
          </select>
        </Field>
        {inventory.selected_frameworks.includes('sb253') && (
          <Field label="Does your company have California nexus?" hint="California operations, employees, or sales — determines SB 253 applicability">
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setInventory(i => ({...i, california_nexus: true}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: inventory.california_nexus ? '#B91C1C' : '#f8f7f5', color: inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${inventory.california_nexus ? '#B91C1C' : '#e8e7e4'}`, }}>Yes</button>
              <button onClick={() => setInventory(i => ({...i, california_nexus: false}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: !inventory.california_nexus ? '#0d0d0d' : '#f8f7f5', color: !inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${!inventory.california_nexus ? '#0d0d0d' : '#e8e7e4'}`, }}>No</button>
            </div>
          </Field>
        )}
        {needsPriorYear && (
          <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0C447C', marginBottom: 10 }}>CDP requires prior year comparison figures</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label={`Prior year Scope 1 (${inventory.reporting_year - 1}) tCO₂e`}>
                <input type="number" value={inventory.prior_year_s1 || ''} onChange={e => setInventory(i => ({...i, prior_year_s1: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
              </Field>
              <Field label={`Prior year Scope 2 (${inventory.reporting_year - 1}) tCO₂e`}>
                <input type="number" value={inventory.prior_year_s2 || ''} onChange={e => setInventory(i => ({...i, prior_year_s2: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
              </Field>
            </div>
          </div>
        )}
        {/*
          Year-over-year comparability — ISO 14064-3:2019 clause 6.3.1.5.

          Rendered ONLY when buildComparabilityDisclosure returns a disclosure. No heading and no
          empty state otherwise: on a first inventory the question is noise, and an empty section
          asking nothing is worse than no section.

          Zero observations still renders the heading and the question. The question does not
          depend on whether anything could be put in front of it — that difference is the basis's
          job to record, not the question's to gate on.

          Every string below is the module's or the doc's. Nothing is composed here.
        */}
        {comparability && (
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: '#0d0d0d', marginBottom: 10 }}>
              Comparing this year with last year
            </div>
            {comparability.observations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 12 }}>
                {comparability.observations.map(o => (
                  <div key={o.kind} style={{ fontSize: 13, color: '#555553', lineHeight: 1.5 }}>{o.text}</div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 13, color: '#0d0d0d', marginBottom: 8 }}>{comparability.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555553', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="comparability_answer"
                  checked={comparabilityCapture?.answer === 'nothing_changed'}
                  // Clears the note as well as hiding it: text left in state behind a hidden field
                  // is text that reappears, or gets persisted against an answer that contradicts it.
                  onChange={() => { captureComparabilityAnswer('nothing_changed'); setComparabilityNote('') }}
                />
                {/* The second clause is load-bearing: without it a customer whose figures moved on
                    volume alone reads "Nothing changed" as false and picks the other option. */}
                Nothing changed — the difference is normal business activity
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555553', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="comparability_answer"
                  checked={comparabilityCapture?.answer === 'something_changed'}
                  onChange={() => captureComparabilityAnswer('something_changed')}
                />
                Something changed
              </label>
            </div>
            {comparabilityCapture?.answer === 'something_changed' && (
              <div style={{ marginTop: 10 }}>
                {/* The FIELD'S LABEL — the one place "What changed?" belongs. As the question above
                    the radios it presupposed a change, which left "Nothing changed" denying the
                    premise of the question it was answering. Here the premise is already true: the
                    customer has just said something did. */}
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>
                  What changed?
                </div>
                <textarea
                  value={comparabilityNote}
                  // The note updates ON ITS OWN. Typing here is elaborating on an answer already
                  // given, not giving a new one, so the capture is left exactly as it stands —
                  // same answeredAt, same captured observations.
                  //
                  // ⚠️ DO NOT re-capture from this handler. It looks harmless and it makes drift
                  // ERASABLE: an untouched re-hydrated answer drifts at save, but one where the
                  // customer fixed a typo would silently become current. Same customer, same
                  // figures, two different records, decided by whether they touched the box.
                  onChange={e => setComparabilityNote(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' as const, fontFamily: 'inherit' }}
                />
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 6 }}>
                  For example: you bought or sold part of the business, opened or closed a site,
                  changed how you collect or measure your data, or corrected an error in last
                  year&apos;s figures.
                </div>
              </div>
            )}
          </div>
        )}
        {/* "Locations", not "facilities": the plan sells a location allowance and the wizard counts
            locations_data entries, so a third word for the same thing left the customer to guess
            what they were being metered on. The hint carries the short form of the definition used
            on /climate-ghg and /pricing. */}
        <Field label="List your locations" hint="One location = one site with its own electricity supply; all of that site's energy goes in together. Enter name and state — we'll collect energy data for each one.">
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {inventory.locations.map((loc, i) => (
              <div key={loc.id} style={{ display: 'flex', gap: 8 }}>
               <input value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} placeholder="e.g. Chicago Warehouse" style={{ ...inputStyle, flex: 1 }} />
{/* ⚠️ THE VALUE IS THE CANONICAL FORM, AND NOTHING IS WRITTEN TO GET IT. A location saved as
    'UK' or 'GR' before canonicalCountryCode existed holds a value no option carries, and a
    select that cannot match its value does not show it. selectedCountryValue matches on the
    canonical form so both display correctly, and returns null when even that matches nothing,
    which is what the echo entry below is for. The record is unchanged until the customer
    picks something. */}
<select value={selectedCountryValue(loc.country) ?? '__stored__'} onChange={e => updateLocation(i, 'country', e.target.value)} style={{ ...inputStyle, width: 190 }}>
  <option value="">Country…</option>
  {selectedCountryValue(loc.country) === null && (
    <option value="__stored__" disabled>{storedCountryEchoLabel(loc.country)}</option>
  )}
  <optgroup label="Factors held">
    {SUPPORTED_COUNTRY_OPTIONS.map(o => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </optgroup>
  <optgroup label="Other countries">
    {OTHER_COUNTRY_OPTIONS.map(o => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </optgroup>
  <option value={NOT_LISTED_OPTION.value}>{NOT_LISTED_OPTION.label}</option>
</select>
{loc.country === 'US' && (
  <select value={loc.state || ''} onChange={e => updateLocation(i, 'state', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">State…</option>
    {US_STATES.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
)}
{loc.country === 'CA' && (
  <select value={loc.province || ''} onChange={e => updateLocation(i, 'province', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">Province…</option>
    {/* CA_PROVINCES, not a literal. The literal here held the same thirteen codes in a DIFFERENT
        ORDER, so the wizard offered the same list twice — this dropdown ON-first, and step 2's
        grid-region dropdown (GRID_REGIONS_CA, derived from CA_PROVINCES) BC-first — with nothing
        saying why. detectGridRegion() also validates against CA_PROVINCES, so a province typed here
        and not there would have selected fine and then resolved to no grid region at all. */}
    {CA_PROVINCES.map(p => (
      <option key={p} value={p}>{p}</option>
    ))}
  </select>
)}
{loc.country === 'AU' && (
  <select value={loc.state || ''} onChange={e => updateLocation(i, 'state', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">State…</option>
    {AU_STATES.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
)}
{/* ── ONE GRID LABEL, FOR EVERY COUNTRY ─────────────────────────────────────────────────────────
    This read `loc.country !== 'US' && !== 'CA' && !== 'AU' && gridRegionForCountry(loc.country)`,
    and the three exclusions were REDUNDANT: gridRegionForCountry only answers for countries whose
    grid is NATIONAL (UK, NZ, EU-27) and returns '' for exactly those three. So the condition said
    twice, in two vocabularies, "only country-level grids" — and the effect was that a US, Canadian
    or Australian customer who had just picked their state or province saw nothing, while the
    customer beside them picking France saw their factor immediately. Nothing recorded that as
    deliberate, and step 2 shows all six jurisdictions a factor from the same lookup.
      Gated on isResolvedGridRegion(loc.grid_region) — THE SAME GATE STEP 2 USES, deliberately, so
    the two steps cannot disagree about whether a location's grid is resolved. updateLocation has
    already stored the region by the time this renders: from the country for UK/EU/NZ, from
    detectGridRegion for a US or AU state, and directly for a CA province.
      ⚠️ getGridFactor(region, inventory.reporting_year), never a year-blind constant — see
    lib/ghg/gridDisplay.test.ts, where a dropdown reading GRID_REGIONS_CA's `.ef` offered Ontario at
    0.059 while the engine priced it at 0.03. */}
{isResolvedGridRegion(loc.grid_region) && (
  <span style={{ fontSize: 12, color: '#0F6E56', alignSelf: 'center', whiteSpace: 'nowrap' }}>
    Grid: {loc.grid_region} ({getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg/kWh)
  </span>
)}
{loc.country && loc.country !== 'US' && loc.country !== 'CA' && loc.country !== 'AU' && !gridRegionForCountry(loc.country) && (
  <input value={loc.region || ''} onChange={e => updateLocation(i, 'region', e.target.value)} placeholder="State/Region" style={{ ...inputStyle, width: 120 }} />
)}
{/* ⚠️ NO CONTROL AT ALL WHEN ONE LOCATION REMAINS, RATHER THAN A DISABLED ONE.
    A disabled button with its reason in a title attribute has no reason on a touch device, and a
    control that refuses without saying why is the thing the copy rules exist to prevent. The other
    option was to render it enabled and refuse in the confirmation, which is worse: it promises an
    action and then takes it back after the click. An absent control promises nothing, and with a
    single location there is nothing a customer could be trying to compare it against.
      It is addressed by id, never by i. i is a render-time position and removeLocation awaits
    storage in the middle; see the paragraph on removeDoc. */}
{inventory.locations.length > 1 && (
  <button
    onClick={() => removeLocation(loc.id)}
    aria-label={`Remove ${loc.name?.trim() || 'this unnamed location'}`}
    style={{ fontSize: 16, lineHeight: 1, padding: '0 10px', background: 'none', border: '0.5px solid #e8e7e4', borderRadius: 8, color: 'var(--color-ink-muted)', cursor: 'pointer', flexShrink: 0 }}
  >&times;</button>
)}
              </div>
            ))}
            <button onClick={addLocation} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add location</button>
            {showLocationWall && (
              <div style={{ marginTop: 12, background: 'var(--color-brand-wash)', border: '0.5px solid var(--color-brand-line)', borderRadius: 10, padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand)', marginBottom: 3 }}>You&apos;ve reached your plan&apos;s location limit ({locationAllowance})</div>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>Your current plan covers up to {locationAllowance} location{locationAllowance === 1 ? '' : 's'}. Upgrade to add more — your existing data stays exactly as it is.</div>
                  <a href="/pricing" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none' }}>See plans &amp; upgrade →</a>
                </div>
                <button onClick={() => setShowLocationWall(false)} style={{ background: 'none', border: 'none', color: 'var(--color-ink-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            )}
          </div>
        </Field>
      </div>
    </div>
  )

  const renderStep2 = () => {
    const loc = inventory.locations[activeLocation]
    // SEAM: calcLocation refuses an unpriceable location, and this is the step the customer is sent
    // to in order to FIX one — so an unguarded call here takes down the only screen that can undo
    // the problem. The blocking panel below replaces the live-results figures entirely.
    const blockedHere = unpriceableById.get(loc.id)
    const calc = blockedHere ? null : calcLocation(loc, 'AR6', inventory.reporting_year)
    const detectedRegion = [...GRID_REGIONS_CA, ...GRID_REGIONS_US].find(r => r.value === loc.grid_region)
    // The question a user is asked and the absence they later attest MUST be the same words (STEP 3):
    // both derive from STREAM_META. See the attestation block below and the workings declaration rows.
    const streamQuestion = (s: DeclarableStream) => `Does this location ${STREAM_META[s].verb} ${STREAM_META[s].name}?`
    return (
      <div>
        <h2 style={sectionHead}>Energy & fuel data</h2>
        <p style={sectionSub}>Enter what appears on your utility bills and fuel records. All calculations happen automatically — you never need to look up emission factors.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
          {inventory.locations.map((l, i) => (
            <button key={l.id} onClick={() => setActiveLocation(i)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeLocation === i ? 'var(--color-brand-wash)' : '#f8f7f5', color: activeLocation === i ? 'var(--color-ink)' : '#555553', border: `0.5px solid ${activeLocation === i ? 'var(--color-brand)' : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeLocation === i ? 500 : 400 }}>
              {l.name || `Location ${i+1}`}
            </button>
          ))}
          <button onClick={addLocation} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', }}>+ Add location</button>
          {showLocationWall && (
            <div style={{ width: '100%', marginTop: 8, background: 'var(--color-brand-wash)', border: '0.5px solid var(--color-brand-line)', borderRadius: 10, padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand)', marginBottom: 3 }}>You&apos;ve reached your plan&apos;s location limit ({locationAllowance})</div>
                <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>Your current plan covers up to {locationAllowance} location{locationAllowance === 1 ? '' : 's'}. Upgrade to add more — your existing data stays exactly as it is.</div>
                <a href="/pricing" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none' }}>See plans &amp; upgrade →</a>
              </div>
              <button onClick={() => setShowLocationWall(false)} style={{ background: 'none', border: 'none', color: 'var(--color-ink-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          )}
        </div>
        {/* The blocking state for the location being edited, at the top of its own step — this is
            where the two things named in the message (the country, and the unit on the bill) are
            actually changed, so the customer is told next to the controls that fix it. */}
        {unpriceableById.get(loc.id) && (
          <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>⚠ {exclusionBannerHeading(unpriceableById.get(loc.id)!)}</div>
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{unpriceableMessage(unpriceableById.get(loc.id)!, locationHasEnteredFigures(loc))}</div>
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, marginTop: 4 }}>{exclusionBannerTrailer(unpriceableById.get(loc.id)!, locationHasEnteredFigures(loc))}</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>
            <QuestionCard question={streamQuestion('natural_gas')} hint="For heating, boilers, furnaces — check your gas utility bills" checked={loc.has_natural_gas} onToggle={v => updateLocation(activeLocation, 'has_natural_gas', v)}>
              {loc.has_natural_gas && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <p style={qHint}>What unit does your gas supplier show on bills?</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {ngUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'natural_gas_unit', val)} style={unitBtn(loc.natural_gas_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total natural gas — ${inventory.reporting_year} (${loc.natural_gas_unit})`} hint="Sum of all 12 monthly bills for this location">
                    <input type="number" value={loc.natural_gas_amount || ''} onChange={e => updateLocation(activeLocation, 'natural_gas_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                    {validateNaturalGas(loc.natural_gas_amount, loc.natural_gas_unit) && (
                      <div style={{ background: "#FEF3E2", border: "0.5px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginTop: 6 }}>
                        {validateNaturalGas(loc.natural_gas_amount, loc.natural_gas_unit)}
                      </div>
                    )}
                  </Field>
                  {isPaid ? <DocUpload label="Upload gas bills" locIdx={activeLocation} docType="utility_bill_gas" docs={loc.source_docs.filter(d => d.document_type === 'utility_bill_gas')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${activeLocation}:utility_bill_gas`]} /> : <LockedDocUpload label="Upload gas bills" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question={streamQuestion('propane')} hint="For forklifts and heating — check delivery records" checked={loc.has_propane} onToggle={v => updateLocation(activeLocation, 'has_propane', v)}>
              {loc.has_propane && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {propaneUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'propane_unit', val as any)} style={unitBtn(loc.propane_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total propane purchased — ${inventory.reporting_year} (${loc.propane_unit})`}>
                    <input type="number" value={loc.propane_amount || ''} onChange={e => updateLocation(activeLocation, 'propane_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload propane delivery records" locIdx={activeLocation} docType="fuel_propane" docs={loc.source_docs.filter(d => d.document_type === 'fuel_propane')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${activeLocation}:fuel_propane`]} /> : <LockedDocUpload label="Upload propane delivery records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question={streamQuestion('diesel_stationary')} hint="Backup generators, boilers — not vehicles" checked={loc.has_diesel_stationary} onToggle={v => updateLocation(activeLocation, 'has_diesel_stationary', v)}>
              {loc.has_diesel_stationary && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {liquidUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'diesel_stationary_unit', val as any)} style={unitBtn(loc.diesel_stationary_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total diesel in stationary equipment — ${inventory.reporting_year}`}>
                    <input type="number" value={loc.diesel_stationary_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_stationary_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload diesel purchase records" locIdx={activeLocation} docType="fuel_diesel" docs={loc.source_docs.filter(d => d.document_type === 'fuel_diesel')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${activeLocation}:fuel_diesel`]} /> : <LockedDocUpload label="Upload diesel purchase records" />}
                </div>
              )}
            </QuestionCard>
            {/* TWO CARDS, NOT ONE WITH A SUB-CHOICE. These are two declarable streams: a site can burn
                both, each needs its own attestation, and each prices from a different published factor.
                The nz_use_class <details> pattern models a sub-choice within ONE stream and is the
                wrong shape here.
                Titles come from streamQuestion(), exactly like the other six. An earlier draft passed
                STREAM_META[token].name directly because the supplied copy was title-cased; that made
                these two cards the only ones not phrased as a question, and a title-cased name reads
                wrong in the two OTHER places the same string appears (the absence attestation and the
                declaration row). Storing the noun phrase and letting the existing mechanism frame it
                gives the same card titles with no special case.
                ONE UPLOAD SLOT PER CARD, both pointing at docType="fuel_oil": docType is a DOCUMENT
                type, not a stream, a delivery docket can carry either grade, and fuel_oil sits in
                CONCIERGE_UNREAD_DOC_TYPES so nothing is extracted from it either way. */}
            <QuestionCard question={streamQuestion('fuel_oil_distillate')} hint="The oil most commonly burned in building boilers and furnaces. Known as heating oil, light fuel oil, gas oil or No. 2 distillate depending on where you buy it. If your site is an office, warehouse, school or similar, this is what you use." checked={loc.has_fuel_oil_distillate} onToggle={v => updateLocation(activeLocation, 'has_fuel_oil_distillate', v)}>
              {loc.has_fuel_oil_distillate && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {liquidUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'fuel_oil_distillate_unit', val as 'gallons' | 'litres')} style={unitBtn((loc.fuel_oil_distillate_unit ?? 'gallons') === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total heating oil purchased — ${inventory.reporting_year} (${(loc.fuel_oil_distillate_unit ?? 'gallons') === 'gallons' ? 'US gallons' : 'litres'})`}>
                    <input type="number" value={loc.fuel_oil_distillate_amount || ''} onChange={e => updateLocation(activeLocation, 'fuel_oil_distillate_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload fuel oil delivery records" locIdx={activeLocation} docType="fuel_oil" docs={loc.source_docs.filter(d => d.document_type === 'fuel_oil')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} uploadError={uploadErrors[`${activeLocation}:fuel_oil`]} /> : <LockedDocUpload label="Upload fuel oil delivery records" />}
                </div>
              )}
            </QuestionCard>

            <QuestionCard question={streamQuestion('fuel_oil_residual')} hint="A thicker oil used in large industrial boilers, kilns and ships. It has to be heated before it will flow. Known as residual fuel oil, heavy fuel oil, bunker fuel or No. 6. If you&apos;re not sure whether you use this, you almost certainly don&apos;t." checked={loc.has_fuel_oil_residual} onToggle={v => updateLocation(activeLocation, 'has_fuel_oil_residual', v)}>
              {loc.has_fuel_oil_residual && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {liquidUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'fuel_oil_residual_unit', val as 'gallons' | 'litres')} style={unitBtn((loc.fuel_oil_residual_unit ?? 'gallons') === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total heavy fuel oil purchased — ${inventory.reporting_year} (${(loc.fuel_oil_residual_unit ?? 'gallons') === 'gallons' ? 'US gallons' : 'litres'})`}>
                    <input type="number" value={loc.fuel_oil_residual_amount || ''} onChange={e => updateLocation(activeLocation, 'fuel_oil_residual_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload fuel oil delivery records" locIdx={activeLocation} docType="fuel_oil" docs={loc.source_docs.filter(d => d.document_type === 'fuel_oil')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} uploadError={uploadErrors[`${activeLocation}:fuel_oil`]} /> : <LockedDocUpload label="Upload fuel oil delivery records" />}
                </div>
              )}
            </QuestionCard>

            <QuestionCard question={streamQuestion('mobile')} hint="Delivery trucks, forklifts, company cars — check fleet fuel cards" checked={loc.has_mobile} onToggle={v => updateLocation(activeLocation, 'has_mobile', v)}>
              {loc.has_mobile && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <Field label={`Gasoline for company vehicles — ${inventory.reporting_year}`} hint="Cars, light trucks, vans">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.gasoline_amount || ''} onChange={e => updateLocation(activeLocation, 'gasoline_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.gasoline_unit} onChange={e => updateLocation(activeLocation, 'gasoline_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        {liquidUnitOptions(loc.country).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  <Field label={`Diesel for company vehicles — ${inventory.reporting_year}`} hint="Trucks, heavy equipment, forklifts">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.diesel_mobile_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_mobile_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.diesel_mobile_unit} onChange={e => updateLocation(activeLocation, 'diesel_mobile_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        {liquidUnitOptions(loc.country).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  {isPaid ? <DocUpload label="Upload fleet fuel records" locIdx={activeLocation} docType="fleet_fuel" docs={loc.source_docs.filter(d => d.document_type === 'fleet_fuel')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${activeLocation}:fleet_fuel`]} /> : <LockedDocUpload label="Upload fleet fuel records" />}
                </div>
              )}
            </QuestionCard>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>{streamQuestion('refrigerants')}</div>
              <p style={qHint}>Large commercial refrigeration systems are common emission sources.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', true); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.uses_ammonia ? '#0F6E56' : '#f8f7f5', color: loc.uses_ammonia ? '#fff' : '#555553', border: `0.5px solid ${loc.uses_ammonia ? '#0F6E56' : '#e8e7e4'}`, }}>Ammonia (NH₃)</button>
                <button onClick={() => { updateLocation(activeLocation, 'has_hfc_refrigerants', true); updateLocation(activeLocation, 'uses_ammonia', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.has_hfc_refrigerants ? 'var(--color-brand)' : '#f8f7f5', color: loc.has_hfc_refrigerants ? 'var(--color-on-dark)' : '#555553', border: `0.5px solid ${loc.has_hfc_refrigerants ? 'var(--color-brand)' : '#e8e7e4'}`, }}>HFC refrigerants</button>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', false); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#555553' : '#f8f7f5', color: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#fff' : '#555553', border: '0.5px solid #e8e7e4', }}>None</button>
              </div>
              {loc.uses_ammonia && <div style={{ background: '#E1F5EE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0F6E56', fontWeight: 500 }}>✓ Ammonia has zero global warming potential — no further data needed</div>}
              {loc.has_hfc_refrigerants && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ background: '#FEF3E2', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#633806' }}>Check refrigeration service records — refrigerant purchased for top-up = refrigerant leaked (GHG Protocol methodology)</div>
                  <Field label="Refrigerant type"><select value={loc.refrigerant_type} onChange={e => updateLocation(activeLocation, 'refrigerant_type', e.target.value)} style={inputStyle}><option value="r410a">R-410A</option><option value="r22">R-22</option><option value="r134a">R-134a</option><option value="r404a">R-404A</option><option value="r507">R-507</option></select></Field>
                  <Field label="Refrigerant purchased for top-up this year (kg)" hint="From service records or supplier invoices">
                    <input type="number" value={loc.refrigerant_purchased_kg || ''} onChange={e => updateLocation(activeLocation, 'refrigerant_purchased_kg', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload service records" locIdx={activeLocation} docType="service_record" docs={loc.source_docs.filter(d => d.document_type === 'service_record')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${activeLocation}:service_record`]} /> : <LockedDocUpload label="Upload service records" />}
                </div>
              )}
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Purchased electricity</div>
              <p style={qHint}>Check your electricity utility bills — kWh is always shown.</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <Field label={`Total electricity — ${inventory.reporting_year} (kWh)`} hint="Sum of all 12 monthly bills for this location">
                  <input type="number" value={loc.electricity_kwh || ''} onChange={e => updateLocation(activeLocation, 'electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                {validateElectricity(loc.electricity_kwh) && (
                  <div style={{ background: "#FEF3E2", border: "0.5px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginTop: 6 }}>
                    {validateElectricity(loc.electricity_kwh)}
                  </div>
                )}
                {/* ⚠️ NO GRID BANNER ON A REFUSED LOCATION, FOR THE SAME REASON THE GRID GATE SKIPS IT.
                    The country refusal is the single reason this location is not priced, and it is
                    already stated at the top of this panel. A second amber box saying the grid
                    factor is unavailable names a different problem, invites the customer to go and
                    fix something, and there is nothing to fix: no control sets a grid region for a
                    country the platform does not support. It still renders for a SUPPORTED country
                    whose region is unresolved, which is a real and fixable state. */}
                {countryRefusal(loc) ? null : loc.country === 'AU'
                  ? (loc.grid_region.startsWith('AU_')
                      ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region: <strong>{loc.grid_region}</strong> — {getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg CO₂e/kWh (DCCEEW NGA 2025)</div>
                      : <div style={{ background: '#FEF3E2', border: '0.5px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>Select your state above to resolve the grid emission factor.</div>)
                  : loc.state
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region auto-detected: <strong>{detectedRegion?.label}</strong> — {detectedRegion ? getGridFactor(detectedRegion.value, inventory.reporting_year).ef : "—"} kg CO₂e/kWh (eGRID 2023)</div>
                  : (loc.grid_region.startsWith('EU_') || loc.grid_region === 'UK' || loc.grid_region === 'NZ')
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region: <strong>{loc.grid_region}</strong> — {getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg CO₂e/kWh ({loc.grid_region === 'UK' ? `DEFRA ${getGridFactor(loc.grid_region, inventory.reporting_year).usedYear}` : loc.grid_region === 'NZ' ? 'NZ MfE 2026' : 'EEA 2023'})</div>
                  : isResolvedGridRegion(loc.grid_region)
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region: <strong>{loc.grid_region}</strong> — {getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg CO₂e/kWh ({loc.country === 'CA' ? 'ECCC v3.0' : loc.country === 'US' ? 'US EPA eGRID2023' : loc.country === 'AU' ? 'DCCEEW NGA 2025' : 'grid factor'})</div>
                  : (loc.country === 'CA' || loc.country === 'US')
                  ? <div style={{ background: '#FEF3E2', border: '0.5px solid #fde68a', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                      <div style={{ fontSize: 12, color: '#92400e' }}>Select your {loc.country === 'CA' ? 'province' : 'state'}/region to resolve the grid emission factor.</div>
                      {loc.country === 'CA'
                        ? <select value="" onChange={e => updateLocation(activeLocation, 'province', e.target.value)} style={inputStyle}><option value="" disabled>Select province…</option>{GRID_REGIONS_CA.map(r => <option key={r.value} value={r.value}>{r.label} — {getGridFactor(r.value, inventory.reporting_year).ef} kg CO₂e/kWh</option>)}</select>
                        : <select value="" onChange={e => updateLocation(activeLocation, 'state', e.target.value)} style={inputStyle}><option value="" disabled>Select state…</option>{US_STATES.map(s => <option key={s} value={s}>{s} — {getGridFactor('US_' + s, inventory.reporting_year).ef} kg CO₂e/kWh</option>)}</select>}
                    </div>
                  : <div style={{ background: '#FEF3E2', border: '0.5px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>Grid factor not available for this jurisdiction — <a href="mailto:hello@themisiq.co" style={{ color: 'var(--color-brand)', textDecoration: 'underline' }}>contact us</a>.</div>
                }
                {loc.country === 'NZ' && (
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>Combustion use-class</div>
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 8 }}>MfE publishes stationary-combustion factors by use-class. Most sites are Commercial (default).</div>
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-brand)' }}>{(loc.nz_use_class ?? 'commercial') === 'industrial' ? 'Industrial selected — change use-class' : 'Advanced: change use-class (using Commercial)'}</summary>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          {(['commercial', 'industrial'] as const).map(uc => (
                            <button key={uc} onClick={() => updateLocation(activeLocation, 'nz_use_class', uc)} style={unitBtn((loc.nz_use_class ?? 'commercial') === uc)}>{uc === 'commercial' ? 'Commercial' : 'Industrial'}</button>
                          ))}
                        </div>
                      </details>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#555553', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!loc.nz_td_losses} onChange={e => updateLocation(activeLocation, 'nz_td_losses', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>Include electricity <strong>transmission &amp; distribution (T&amp;D) losses</strong> — reported as a separate <strong>Scope 3 Category 3</strong> line, not added to Scope 2. <span style={{ color: 'var(--color-ink-muted)' }}>Off by default.</span></span>
                    </label>
                  </div>
                )}
                {loc.country === 'US' && (
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '12px 14px' }}>
                    <Field label="eGRID subregion (for market-based Scope 2)" hint="Required only for ESRS E1 / GRI 305 market-based reporting. Leave blank if not reporting those — market-based will use the grid-average factor as a conservative fallback.">
                      <select value={loc.residual_region || ''} onChange={e => updateLocation(activeLocation, 'residual_region', e.target.value)} style={inputStyle}>
                        <option value="">Select your eGRID subregion…</option>
                        {US_SUBREGIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </Field>
                    <a href={EPA_EGRID_POWER_PROFILER_URL} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0C447C', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>🔎 Find your subregion with EPA Power Profiler (enter your ZIP) →</a>
                  </div>
                )}
                {isPaid ? <DocUpload label="Upload electricity bills" locIdx={activeLocation} docType="utility_electricity" docs={loc.source_docs.filter(d => d.document_type === 'utility_electricity')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${activeLocation}:utility_electricity`]} /> : <LockedDocUpload label="Upload electricity bills" />}
              </div>
            </div>
            <QuestionCard question={streamQuestion('purchased_steam')} hint="Purchased steam or hot water from a district energy system — Scope 2" checked={loc.has_purchased_steam} onToggle={v => updateLocation(activeLocation, 'has_purchased_steam', v)}>
              {loc.has_purchased_steam && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {/* Country-filtered like every other fuel — MMBtu is not a billing unit outside
                        the US, so a metric inventory should never show it. */}
                    {steamUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'purchased_steam_unit', val as 'mmbtu' | 'gj')} style={unitBtn((loc.purchased_steam_unit ?? 'mmbtu') === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total purchased steam — ${inventory.reporting_year} (${(loc.purchased_steam_unit ?? 'mmbtu') === 'gj' ? 'GJ' : 'MMBtu'})`}>
                    <input type="number" value={loc.purchased_steam_mmbtu || ''} onChange={e => updateLocation(activeLocation, 'purchased_steam_mmbtu', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {/* ── WHAT WE CAN AND CANNOT PRICE HERE, PER JURISDICTION ────────────────────
                      Replaces a blanket "we apply one published factor whatever network supplies it",
                      which stopped being true once steam started routing per country. The two states
                      say different things and must not be merged: where a national factor exists we
                      apply it and a supplier figure is an OPTIONAL improvement; where none exists the
                      supplier figure is the ONLY way the stream can be priced at all, and export is
                      blocked until it arrives. */}
                  {(() => {
                    const entry = steamFactorFor(loc)
                    const hasSupplier = typeof loc.purchased_steam_supplier_ef === 'number' && loc.purchased_steam_supplier_ef > 0
                    const basisLabel = (b: string) => b === 'kwh' ? 'kWh' : b === 'mmbtu' ? 'MMBtu' : 'GJ'
                    // Default the supplier factor's basis to the unit this location is entered in, so
                    // the customer types the number their provider gave them without converting. It is
                    // STORED alongside the value, never re-read from purchased_steam_unit later —
                    // changing the activity unit afterwards must not silently redefine the factor.
                    const supBasis = loc.purchased_steam_supplier_ef_basis
                      ?? ((loc.purchased_steam_unit ?? 'mmbtu') === 'gj' ? 'kwh' : (loc.purchased_steam_unit ?? 'mmbtu'))
                    return <>
                      {/* ⚠️ A NULL ENTRY IS NOT AN ABSENT FACTOR, IT IS AN ABSENT JURISDICTION, and
                          the two need different sentences. The steam panel asks for a supplier
                          figure to unblock the stream; that remedy cannot work for a location whose
                          country is refused, because the location is excluded whole. The country
                          refusal states the reason on its own, so this panel says nothing here. */}
                      {entry === null ? null : entry.kind === 'published' ? (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>
                          We apply the published factor for this jurisdiction ({entry.source}).
                          District-heating networks vary, so if your supplier publishes its own factor, that figure
                          is more accurate than ours and will be used instead — worth giving your verifier where
                          steam is a material part of your footprint.
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--color-state-warn)', lineHeight: 1.5, background: '#FEF3E2', border: '1px solid #f0d9b5', borderRadius: 6, padding: '10px 12px' }}>
                          <strong>No published factor for this jurisdiction.</strong> {entry.guidance}
                          {' '}Until you enter one, this stream is reported as unquantified and export stays locked —
                          we will not price it with another country&rsquo;s factor.
                        </div>
                      )}
                      <Field label={`Supplier emission factor — kg CO₂e per ${basisLabel(supBasis)}${entry?.kind === 'published' ? ' (optional)' : ' (required)'}`}>
                        <input type="number" step="any" value={loc.purchased_steam_supplier_ef ?? ''} placeholder={entry?.kind === 'published' ? 'Leave blank to use the published factor' : 'e.g. 0.198'}
                          onChange={e => {
                            const v = e.target.value === '' ? undefined : Number(e.target.value)
                            updateLocation(activeLocation, 'purchased_steam_supplier_ef', v as never)
                            // Basis is stamped WITH the value, not inferred at read time.
                            updateLocation(activeLocation, 'purchased_steam_supplier_ef_basis', supBasis as never)
                          }} style={inputStyle} />
                      </Field>
                      {hasSupplier && (
                        <Field label="Where this factor came from — provider and document (printed on your workings for the verifier)">
                          <input type="text" value={loc.purchased_steam_supplier_source ?? ''} placeholder="e.g. Vattenfall Bristol Heat Network, 2025 emissions statement"
                            onChange={e => updateLocation(activeLocation, 'purchased_steam_supplier_source', e.target.value as never)} style={inputStyle} />
                        </Field>
                      )}
                    </>
                  })()}
                  {isPaid ? <DocUpload label="Upload steam / district heating bills" locIdx={activeLocation} docType="purchased_steam" docs={loc.source_docs.filter(d => d.document_type === 'purchased_steam')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${activeLocation}:purchased_steam`]} /> : <LockedDocUpload label="Upload steam / district heating bills" />}
                </div>
              )}
            </QuestionCard>
            {(() => {
              // Completeness attestation — mirror of the grid-region prompt, but for streams the location
              // has neither entered nor attested. Attesting writes a StreamAttestation (stream + timestamp);
              // the stream then declares and drops off the list. Does NOT block step-2 Continue — this is
              // an export-time gate, surfaced here so it can be cleared where the fuel data lives.
              // ⚠️ streamsNeverAnswered, NOT undeclaredStreams. This block offers ONE action — attest
              // absent — and that action is only ever correct for a stream nobody has answered on. Once
              // findUndeclaredStreams began returning declared-with-no-figure streams too, this list
              // would have offered "This location has no diesel in stationary equipment" for a site
              // whose diesel box is ticked: a checkbox that contradicts the answer above it, writes a
              // conflicting attestation, and then appears to do nothing, because the declared state
              // still wins and the stream stays on the list. A dead control that silently records a
              // contradiction. Those streams are cleared by entering a figure in the fields above; the
              // export banner names them with that instruction.
              const activeUndeclared = streamsNeverAnswered.filter(u => u.locId === loc.id)
              if (activeUndeclared.length === 0) return null
              const attest = (streams: DeclarableStream[]) => {
                const at = new Date().toISOString()
                const existing = loc.stream_attestations ?? []
                updateLocation(activeLocation, 'stream_attestations', [...existing, ...streams.map(stream => ({ stream, attested_at: at }))])
              }
              return (
                <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 12, padding: '1.15rem 1.25rem' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>Confirm what this location does NOT have</div>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 12 }}>An undeclared stream is not the same as zero — completeness can&apos;t be asserted until each is either entered above or attested absent. Required before export.</div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {activeUndeclared.map(u => (
                      <label key={u.stream} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={false} onChange={() => attest([u.stream])} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>This location has no {STREAM_META[u.stream].name}.</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => attest(activeUndeclared.map(u => u.stream))} style={{ marginTop: 14, fontSize: 12, fontWeight: 600, ...btnPrimary, padding: '9px 20px' }}>Attest all remaining as absent</button>
                </div>
              )
            })()}
          </div>
          <div style={{ position: 'sticky', top: 80 }}>
            <div className="tq-summary" style={{ display: 'block', padding: '1.5rem', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 12 }} className="tq-summary-label">{loc.name} — live results</div>
              {/* NOT five dashes. A "—" beside "Scope 1 total" sits in the same column, in the same
                  row, as a figure — it reads as a measured zero rather than as an absent result.
                  The rows are removed and the reason takes their place. */}
              {blockedHere ? (
                <div style={{ padding: '2px 0 6px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 6 }}>⚠ {blockedHere.kind === 'country' ? refusalResultsHeading(blockedHere.refusal) : 'No results for this location yet'}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.6 }}>{unpriceableMessage(blockedHere, locationHasEnteredFigures(loc))}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.6, marginTop: 6 }}>
                    Your other locations are unaffected, and nothing you&apos;ve entered here is lost.
                  </div>
                </div>
              ) : [
                { label: 'Heating & fuel', val: calc!.s1_stationary, color: 'var(--color-module-deals)' },
                { label: 'Vehicles', val: calc!.s1_mobile, color: 'var(--color-module-cbam)' },
                { label: 'Refrigerants', val: calc!.s1_fugitive, color: 'var(--color-state-warn)' },
                { label: 'Scope 1 total', val: calc!.s1_total, color: 'var(--color-ink)', bold: true },
                { label: 'Scope 2 (electricity)', val: calc!.s2_location, color: 'var(--color-module-ai)', bold: true },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '0.5px solid var(--color-line)' }}>
                  <span style={{ fontSize: 12, color: bold ? 'var(--color-ink)' : 'var(--color-ink-2)', fontWeight: bold ? 600 : 400 }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: bold ? 700 : 400 }}>{val.toFixed(2)} tCO₂e</span>
                </div>
              ))}
              {/* ⚠️ THE PUBLISHERS THAT PRICED THIS LOCATION, NOT THE CATALOGUE OF ALL OF THEM.
                  This line was the fixed string "EPA 2024 (US) · ECCC v3.0 (CA) · DEFRA 2026 (UK) ·
                  IPCC AR6 GWP · eGRID 2023", rendered under every location whatever its country. A
                  UK site cited the EPA and eGRID, which priced nothing there, and a refused site
                  cited five publishers when nothing had priced it at all. publishersForLocation
                  derives from the location's own priced workings rows, so it is empty for a refused
                  location and for one with no figures, by construction rather than by a guard. */}
              {(() => {
                const pubs = publishersForLocation(loc, 'AR6', inventory.reporting_year)
                return pubs.length === 0 ? null : (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--color-ink-2)', lineHeight: 1.6 }}>{pubs.join(' · ')}</div>
                )
              })()}
              {validateCompleteness(loc).map((w, i) => (
                <div key={i} style={{ marginTop: 8, background: "#FEF3E2", border: "0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "var(--color-state-warn)", lineHeight: 1.5 }}>{w}</div>
              ))}
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>All locations</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-brand)' }}>{totals_ar6.s1_total.toFixed(2)} mt Scope 1</div>
              {gridReady
                ? <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginTop: 4 }}>{totals_ar6.s2_location.toFixed(2)} mt Scope 2</div>
                : <div style={{ marginTop: 4 }}><div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink-muted)' }}>— mt Scope 2</div><div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 1 }}>Resolve grid regions to preview Scope 2</div></div>}
              {/* Directly under the figure, not in a banner elsewhere on the page: a total that
                  leaves a location out has to say so where it is read, or the omission is silent
                  to anyone who does not scroll. */}
              {exclusionNote && (
                <div style={{ fontSize: 10, color: 'var(--color-state-warn)', marginTop: 6, lineHeight: 1.5 }}>⚠ {exclusionNote}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStep3 = () => {
    const needsExtra = needsMarketBased || needsBiogenic
    if (!needsExtra) return (
      <div>
        <h2 style={sectionHead}>Additional data</h2>
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '1.5rem' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0F6E56', marginBottom: 4 }}>✓ No additional data required for your selected frameworks</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 400 }}>CARB SB 253, CDP, EcoVadis, and IFRS S2 only require the energy data you've already entered. Click Continue to review your results.</div>
        </div>
      </div>
    )
    return (
      <div>
        <h2 style={sectionHead}>Additional data</h2>
        <p style={sectionSub}>Your selected frameworks require some additional information beyond standard energy data.</p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 700 }}>
          {/* brand-line, not brand: this is a container, not a focus or selected state. */}
          {needsMarketBased && (
            <div style={{ background: '#fff', border: '0.5px solid var(--color-brand-line)', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-brand)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ESRS E1 / GRI 305 — Market-based Scope 2</div>
              <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1rem' }}>ESRS E1 and GRI 305 require you to report Scope 2 on both a location-based AND market-based basis. Market-based Scope 2 subtracts electricity from renewable energy contracts (PPAs, RECs, green tariffs).</p>
              {inventory.locations.map((loc, i) => (
                <div key={loc.id} style={{ marginBottom: 14 }}>
                  <Field label={`${loc.name} — Renewable electricity (kWh)`} hint="Enter kWh covered by PPAs, RECs, or green tariffs. Leave 0 if none.">
                    <input type="number" value={loc.renewable_electricity_kwh || ''} onChange={e => updateLocation(i, 'renewable_electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label={`Upload RECs / PPAs — ${loc.name}`} locIdx={i} docType="renewable_cert" docs={loc.source_docs.filter(d => d.document_type === 'renewable_cert')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []}  uploadError={uploadErrors[`${i}:renewable_cert`]} /> : <LockedDocUpload label={`Upload RECs / PPAs — ${loc.name}`} />}
                </div>
              ))}
            </div>
          )}
          {needsBiogenic && (
            <div style={{ background: '#fff', border: '0.5px solid #0F6E56', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ESRS E1 / GRI 305 — Biogenic CO₂</div>
              <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1rem' }}>ESRS E1 and GRI 305 require biogenic CO₂ emissions to be reported separately from fossil fuel emissions. Biogenic CO₂ comes from burning biomass, wood waste, or agricultural residues.</p>
              {inventory.locations.map((loc, i) => (
                <div key={loc.id} style={{ marginBottom: 14 }}>
                  <Field label={`${loc.name} — Biogenic CO₂ (mtCO₂)`} hint="From burning biomass, wood waste, or agricultural residues — 0 if none">
                    <input type="number" value={loc.biogenic_co2_mt || ''} onChange={e => updateLocation(i, 'biogenic_co2_mt', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {/* Biogenic was the only figure in the wizard with no evidence path — every other
                      number a verifier reads can be traced to a document. Nothing else needed wiring:
                      docs live in the locations_data jsonb with no DB constraint on document_type,
                      and /api/verifier-documents iterates source_docs generically, so this slot
                      reaches the verifier surface on its own. */}
                  {isPaid ? <DocUpload label={`Upload biomass records — ${loc.name}`} locIdx={i} docType="biogenic" docs={loc.source_docs.filter(d => d.document_type === 'biogenic')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} uploadError={uploadErrors[`${i}:biogenic`]} /> : <LockedDocUpload label={`Upload biomass records — ${loc.name}`} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

    /**
   * "Scope 3 for this inventory": open the record attached to it, or start one bound to it.
   *
   * ⚠️ EVERY WORD AND THE URL COME FROM lib/moduleLinks.ts, so the Review step, the Export banners and
   * any future caller say the same thing. ⚠️ AND IT IS AN <a>, NOT next/link: the Scope 3 page's
   * unsaved-changes prompt is a beforeunload handler, which a client-side route change does not fire.
   */
  const Scope3Control = ({ compact = false }: { compact?: boolean }) => {
    const state = scope3LinkState(
      inventoryId,
      scope3RecordFor !== null && scope3RecordFor.id === inventoryId && scope3RecordFor.has,
    )
    if (compact) {
      return state.href
        ? <a href={state.href} style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>{state.label} →</a>
        : <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', maxWidth: 320, lineHeight: 1.5 }}>{state.note}</span>
    }
    return (
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const }}>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 2 }}>Scope 3 for this inventory</div>
          {state.note}
        </div>
        {state.href
          ? <a href={state.href} style={{ fontSize: 12, fontWeight: 600, padding: '9px 18px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>{state.label} →</a>
          : <span style={{ fontSize: 12, fontWeight: 600, padding: '9px 18px', borderRadius: 8, background: '#f8f7f5', color: 'var(--color-ink-muted)', whiteSpace: 'nowrap' as const }}>{state.label}</span>}
      </div>
    )
  }

  const renderStep4 = () => {
    const rev = inventory.revenue_millions
    const emp = inventory.employee_count
    return (
      <div>
        <h2 style={sectionHead}>Review, results & calculation workings</h2>
        <p style={sectionSub}>{inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri') ? `Your Scope 1 & 2 inventory for ${inventory.company_name || 'your company'}, ${inventory.reporting_year}. Scope 3 required — complete it after export.` : `Your complete GHG inventory for ${inventory.company_name || 'your company'}, ${inventory.reporting_year}.`}</p>
        {/* Scope 3 is calculated from THIS inventory's energy, so the way to it belongs where the
            customer is reading those figures. One control, one rule: lib/moduleLinks.ts. */}
        <Scope3Control />
        <div style={{ position: 'relative' }}>
          {!isPaid && <PaywallOverlay frameworks={activeFrameworks.map(f => f.name)} />}
          <div style={{ filter: isPaid ? 'none' : 'blur(4px)', pointerEvents: isPaid ? 'auto' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: '2rem' }}>
              {activeFrameworks.map(fw => {
                const totals = totals_ar6
                return (
                  <div key={fw.id} style={{ background: fw.bg, border: `0.5px solid color-mix(in srgb, ${fw.color} 20%, transparent)`, borderRadius: 10, padding: '1.25rem' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: fw.color, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>{fw.name} — GWP {fw.gwp}</div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Scope 1</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: fw.color }}>{totals.s1_total.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Scope 2 (location)</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: fw.color }}>{totals.s2_location.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                    </div>
                    {(fw.id === 'esrs' || fw.id === 'gri') && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Scope 2 (market)</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: fw.color }}>{totals.s2_market.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                      </div>
                    )}
                    {(fw.id === 'esrs' || fw.id === 'gri') && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Biogenic CO₂ (reported separately)</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: fw.color }}>{totals.biogenic.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                      </div>
                    )}
                    {totals.s3_td > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        {/* Distinct Scope 3 (Cat 3) line — NZ electricity T&D losses. Never folded into S1/S2. */}
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Scope 3 (Cat 3 — electricity T&amp;D)</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: fw.color }}>{totals.s3_td.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                      </div>
                    )}
                    {fw.id === 'cdp' && (
                      <>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Prior year Scope 1 ({inventory.reporting_year - 1})</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: fw.color }}>{inventory.prior_year_s1.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Prior year Scope 2 ({inventory.reporting_year - 1})</div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: fw.color }}>{inventory.prior_year_s2.toFixed(2)}<span style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                        </div>
                      </>
                    )}
                    {/* ⚠️ "S1 intensity", THE EXPORT'S OWN WORDING. This read "Intensity:", and the CSV
                        row for the identical figure reads "S1 intensity (tCO2e/$M revenue)", so one
                        number had two names across two documents a verifier reads side by side.
                        ⚠️ NO EXCLUSION NOTE OF ITS OWN, AND ONE WAS ADDED HERE BY MISTAKE. The card's
                        note sits a few lines below and already covers every figure on the card,
                        intensity included, exactly as the comment beside it says. The two rendered
                        as two identical lines one under the other. An intensity needs its own note
                        only where it appears WITHOUT the totals, which is the CSV RESULTS block and
                        the assurance package's summary table; both carry one. */}
                    {rev > 0 && <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 4 }}>S1 intensity: {(totals.s1_total / rev).toFixed(4)} mt/$M</div>}
                    {emp > 0 && fw.id === 'ecovadis' && <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Per employee: {(totals.s1_total / emp * 1000).toFixed(2)} kgCO₂e</div>}
                    {/* Every figure in this card — both scopes, biogenic, the intensities — is built
                        from the same excluded set, so the note belongs to the card, not to one line. */}
                    {exclusionNote && (
                      <div style={{ fontSize: 10, color: 'var(--color-state-warn)', marginTop: 8, lineHeight: 1.5 }}>⚠ {exclusionNote}</div>
                    )}
                  </div>
                )
              })}
            </div>
            {(() => {
            const wGwp: GwpVersion = (FRAMEWORKS.find(f => f.id === activeExport)?.gwp as GwpVersion) || (activeFrameworks[0]?.gwp as GwpVersion) || 'AR6'
            // ONE derivation. The tested engine builds every workings row (including Phase-3b declaration
            // rows and the always-emitted market-based row); the screen just filters by location. The
            // second, hand-rolled table derivation that used to live here is gone (Phase 4).
            const allRows = buildWorkings(inventory.locations, wGwp, inventory.reporting_year, coverageResolutions, inventory.fiscal_year_end_month)
            // The licence attributions the cited sources require, from the SAME rows the tables render.
            const attributions = sourceAttributionsFor(allRows.map(r => r.ef_source))
            return <>{inventory.locations.map((loc, i) => {
              // calcLocation is the SAME call that refuses an unpriceable location, so it must not
              // run for one — this line is a second unguarded render-path crash site, not just the
              // totals at the top of the component.
              const blocked = unpriceableById.get(loc.id)
              const c = blocked ? null : calcLocation(loc, wGwp, inventory.reporting_year)
              const key = `loc_${i}`
              const locRows = allRows.filter(r => r.location === (loc.name || 'Location'))
              return (
                <div key={loc.id} style={{ background: '#fff', border: blocked ? '0.5px solid color-mix(in srgb, var(--color-state-warn) 40%, transparent)' : '0.5px solid #e8e7e4', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                  <div onClick={() => setShowWorkings(w => ({...w, [key]: !w[key]}))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{loc.name}{loc.state && ` — ${loc.state}`}</div>
                      {/* No numbers for a blocked location — not even a dash beside "S1:", which
                          still reads as a measured scope. The reason takes the figures' place. */}
                      {blocked
                        ? <div style={{ fontSize: 12, color: 'var(--color-state-warn)', marginTop: 2, lineHeight: 1.5, maxWidth: 620 }}>⚠ {blocked.kind === 'country' ? '' : 'Not included in any total. '}{unpriceableMessage(blocked, locationHasEnteredFigures(loc))}</div>
                        : <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 2 }}>S1: {c!.s1_total.toFixed(2)} mt · S2: {c!.s2_location.toFixed(2)} mt · Total: {(c!.s1_total + c!.s2_location).toFixed(2)} mt</div>}
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{showWorkings[key] ? '▲ Hide' : '▼ Show workings'}</span>
                  </div>
                  {showWorkings[key] && (
                    <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', margin: '1rem 0 0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>Calculation workings — ISO 14064-3 / ISAE 3410 transparency</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr>{['Source', 'Activity data', 'Emission factor', 'Factor source', 'Factor vintage', 'Scope 2 method', 'GWP basis', 'Result (tCO₂e)'].map(h => <th key={h} style={{ background: '#f8f7f5', padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: 'var(--color-ink-muted)', borderBottom: '0.5px solid #e8e7e4' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {locRows.map((r, ri) => {
                            // Declaration rows (Phase 3b) are now VISIBLE (the point of Phase 4). result_tco2e
                            // null must never render as 0 — "0" is a claim of zero, "—" is an absence.
                            if (r.declaration === 'attested_absent') {
                              return <tr key={ri} style={{ background: '#f4f4f2' }}>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)' }}>{r.source}</td>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)' }}>{r.note}</td>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)' }}>{r.gwp_basis}</td>
                                <td style={{ ...wTd, color: 'var(--color-ink-muted)', fontWeight: 600 }}>0.0000</td>
                              </tr>
                            }
                            // Same treatment as 'undeclared', and for the same reason: the location
                            // contributes nothing to any total, so a number here would be a claim.
                            // ⚠️ THREE `if`s FOR ONE ROW SHAPE, FOR THE SAME REASON THE VERIFIER
                            // PAGE HAS THREE BRANCHES: declarationStates.test.ts matches
                            // `declaration === 'x'` followed by `&&` or `) {`, so a single
                            // condition chaining the three with `||` names only the last of them
                            // and leaves the other two provably unrendered. The row itself is one
                            // helper, so the three cannot drift.
                            if (r.declaration === 'country_not_set') { return excludedRow(r, ri) }
                            if (r.declaration === 'country_not_listed') { return excludedRow(r, ri) }
                            if (r.declaration === 'country_not_supported') { return excludedRow(r, ri) }
                            if (r.declaration === 'unpriceable') {
                              return <tr key={ri} style={{ background: '#FEF3E2' }}>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>{r.source}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.note}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.gwp_basis}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>—</td>
                              </tr>
                            }
                            // The operator confirmed the stream is here and gave no figure. Same amber as
                            // 'undeclared' below, because it blocks export for the same reason and is the
                            // more concerning of the two. Without this branch it fell through to the
                            // normal fuel row: the note rendered, but unhighlighted and among priced
                            // rows — the least visible of the four states, and the worst one to lose.
                            // This surface has no badges, so r.note does that work; it opens
                            // "DECLARED, NOT QUANTIFIED —" and comes from the engine, which is what keeps
                            // this page and the verifier page saying the same thing about the same row.
                            if (r.declaration === 'declared_unquantified') {
                              return <tr key={ri} style={{ background: '#FEF3E2' }}>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>{r.source}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.note}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.gwp_basis}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>—</td>
                              </tr>
                            }
                            // ── NO PUBLISHED FACTOR ──────────────────────────────────────────────
                            // Its own branch rather than folding into declared_unquantified above,
                            // for ONE reason: this row HAS an activity figure and that one prints it.
                            // "You told us 4,000 GJ and we could not price it" is a materially
                            // different finding from "no figure was given", and the entered quantity
                            // is the part a verifier needs in order to judge how much is missing.
                            if (r.declaration === 'no_published_factor') {
                              return <tr key={ri} style={{ background: '#FEF3E2' }}>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>{r.source}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.activity_data == null ? '—' : `${r.activity_data.toLocaleString()} ${r.activity_unit}`}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>
                                  {r.note}
                                  {/* What was actually checked, where a search was done. Absent for
                                      the EU entry, which never claims one. */}
                                  {r.quantification_method && <div style={{ fontSize: 10, marginTop: 3, lineHeight: 1.4, whiteSpace: 'normal' }}>{r.quantification_method}</div>}
                                </td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.gwp_basis}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>—</td>
                              </tr>
                            }
                            if (r.declaration === 'undeclared') {
                              return <tr key={ri} style={{ background: '#FEF3E2' }}>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>{r.source}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.note}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>—</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)' }}>{r.gwp_basis}</td>
                                <td style={{ ...wTd, color: 'var(--color-state-warn)', fontWeight: 600 }}>—</td>
                              </tr>
                            }
                            const s2 = r.scope === 2
                            return <tr key={ri} style={s2 ? { background: '#f8f7f5' } : r.scope === 3 ? { background: 'var(--color-sunken)' } : undefined}>
                              <td style={wTd}>{r.source}</td>
                              <td style={wTd}>
                                {/* toLocaleString, matching the verifier surface's own rendering of the
                                    same field (app/verify/[token]) — same function, same result, so the
                                    two surfaces cannot show a verifier different figures. It caps at 3
                                    decimals and adds thousands separators; the stored and computed value
                                    stays full precision, this is display only. */}
                                {r.activity_data == null ? '—' : `${r.activity_data.toLocaleString()} ${r.activity_unit}`}
                                {/* The convert-then-apply step, where there was one. Without it a
                                    verifier reads a gallons figure against a form that says litres with
                                    nothing joining them — the divergence the note exists to prevent.
                                    Only the two declaration branches rendered r.note before; the normal
                                    fuel row had no cell for it. */}
                                {r.note && <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 3, lineHeight: 1.4, whiteSpace: 'normal' }}>{r.note}</div>}
                              </td>
                              <td style={wTd}>{r.emission_factor_display}</td>
                              <td style={wTd}>{r.ef_source}</td>
                              <td style={wTd}>{r.factor_vintage || '—'}</td>
                              <td style={wTd}>{r.scope2_method || '—'}</td>
                              <td style={wTd}>
                                {r.gwp_basis}
                                {r.quantification_method && <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 3, lineHeight: 1.4, whiteSpace: 'normal' }}>{r.quantification_method}</div>}
                              </td>
                              {/* ⚠️ THE SCOPE IS LABELLED, NOT ONLY COLOURED. Until 5 Sep 2026 Scope 1
                                  and Scope 2 differed by hue alone — teal against green — which is no
                                  difference at all to a red-green colourblind reader, and none at all in
                                  a printed or photocopied workings table. The colour stays as emphasis;
                                  the label is what carries the fact. */}
                              <td style={{ ...wTd, fontWeight: 600, color: s2 ? '#0F6E56' : 'var(--color-brand)' }}>
                                {r.result_tco2e == null ? '—' : r.result_tco2e.toFixed(4)}
                                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-ink-muted)', marginLeft: 6 }}>S{r.scope}</span>
                              </td>
                            </tr>
                          })}
                          {/* The per-location TOTAL row. A blocked location has no total to state —
                              printing 0.0000 here would be the exact claim the exclusion exists to
                              avoid, and it would contradict the row above it. */}
                          <tr style={{ background: '#0d0d0d' }}><td colSpan={5} style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>TOTAL — {loc.name} {c ? '(Scope 1 + Scope 2 location-based)' : '— excluded from all totals'}</td><td style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>{c ? (c.s1_total + c.s2_location).toFixed(4) : '—'}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
            <SourceAttributions attributions={attributions} style={{ marginTop: 4 }} />
            </>
            })()}
            <div className="tq-summary" style={{ display: 'block', padding: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Assurance readiness — ISO 14064-3 / ISAE 3410</div>
              {[
                // ⚠️ THE SECOND COPY OF THE SAME CATALOGUE, AND A CLAIM ABOUT THIS INVENTORY.
                // This checklist tells the customer their package is assurance-ready; a note listing
                // five publishers, four of which priced nothing here, is not evidence of that. Built
                // from the same per-location derivation the live panel uses, unioned across the
                // inventory, so it names what actually priced these figures and nothing else.
                // ⚠️ AND `done` IS DERIVED, NOT HARDCODED true. It was `done: true` beside a fixed
                // catalogue, so the tick was a statement about the PRODUCT (it does cite sources)
                // rendered as a statement about THIS INVENTORY. On an inventory where nothing is
                // priced yet, a green tick would sit directly beside "No figures are priced yet",
                // which is the two halves of one line contradicting each other. A checklist item
                // whose tick cannot be false is not a checklist item.
                { label: 'Emission factors cited with source and year', done: inventoryPublishers.length > 0, note: inventoryPublishers.length > 0 ? inventoryPublishers.join(' · ') : 'No figures are priced yet' },
                { label: 'Calculation workings documented per source', done: true, note: 'Full formula shown for every emission source' },
                { label: 'Organizational boundary documented', done: !!inventory.boundary_approach, note: inventory.boundary_approach.replace(/_/g, ' ') },
                { label: 'Source documents uploaded', done: isPaid && inventory.locations.some(l => l.source_docs.length > 0), note: isPaid ? `${inventory.locations.reduce((a, l) => a + l.source_docs.length, 0)} documents` : 'Available on paid plan' },
                { label: 'All locations included in boundary', done: inventory.locations.length > 0, note: `${inventory.locations.length} location(s)` },
              ].map(({ label, done, note }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '0.5px solid var(--color-line)' }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{done ? '✅' : '⬜'}</span>
                  <div>
                    <div style={{ fontSize: 12, color: done ? 'var(--color-ink)' : 'var(--color-ink-2)', fontWeight: done ? 500 : 400 }}>{label}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-ink-2)' }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
 const renderStep5 = () => {
    return (
      <div>
        <h2 style={sectionHead}>Export your reports</h2>
        {(() => {
          const fw = inventory.selected_frameworks
          const year = inventory.reporting_year
          const needsScope3Now = fw.includes('esrs') || fw.includes('csrd') || fw.includes('gri')
          const scope3Encouraged = fw.includes('cdp') || fw.includes('ecovadis')
          const sb253Only = fw.includes('sb253') && fw.length === 1
          const sb253FirstYear = sb253Only && year <= 2024

          if (needsScope3Now) return (
            <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ Scope 3 required for your selected frameworks</div>
                <div style={{ fontSize: 12, color: '#555553' }}>CSRD ESRS E1-6 and GRI 305-3 require Scope 3 disclosure. Complete your Scope 3 inventory before finalising your report.</div>
              </div>
              <Scope3Control compact />
            </div>
          )

          if (sb253FirstYear) return (
            <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 4 }}>SB 253 — Scope 3 not required for your first reporting year</div>
                <div style={{ fontSize: 12, color: '#555553' }}>Scope 3 is expected from {SB253_SCOPE3_FROM}, under a separate CARB rulemaking that is still in workshops — the final regulation is expected by the end of 2026, so the requirement is not settled. Starting now puts the data in place either way.</div>
              </div>
              <Scope3Control compact />
            </div>
          )

          if (scope3Encouraged) return (
            <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 20%, transparent)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>Scope 3 will improve your CDP/EcoVadis score</div>
                <div style={{ fontSize: 12, color: '#555553' }}>CDP and EcoVadis score Scope 3 disclosure. Cat.1 (purchased goods) and Cat.6 (business travel) are the highest-impact categories to start with.</div>
              </div>
              <Scope3Control compact />
            </div>
          )

          return (
            <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E56', marginBottom: 4 }}>Ready to calculate your Scope 3 emissions?</div>
                {/* ⚠️ "all 15 categories" STAYS HERE ON PURPOSE. DO NOT "FIX" IT FOR CONSISTENCY WITH THE
                    MARKETING PAGES. This is a pointer to the Scope 3 calculator, and that calculator does
                    cover all fifteen: it asks about each one, records a relevance decision, and reports
                    every one in the export. The claim is the scope of enquiry, not a count of calculations.
                    On a pricing page or a feature list the same words are read as fifteen CALCULATED
                    categories, which is why those sites derive their claim from METHOD_BY_CATEGORY instead.
                    The sibling that also stays is the in-product banner in app/dashboard/scope3/page.tsx. */}
                <div style={{ fontSize: 12, color: '#555553' }}>This wizard covers Scope 1 & 2. Use the Scope 3 Complete Calculator for all 15 categories — GHG Protocol aligned.</div>
              </div>
              <Scope3Control compact />
            </div>
          )
        })()}
        <p style={sectionSub}>One inventory — {activeFrameworks.length} report{activeFrameworks.length > 1 ? 's' : ''}. Unlock your paid plan to download.</p>
        <div style={{ position: 'relative' }}>
          {!isPaid && <PaywallOverlay frameworks={activeFrameworks.map(f => f.name)} />}
          <div style={{ filter: isPaid ? 'none' : 'blur(4px)', pointerEvents: isPaid ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
              {activeFrameworks.map(fw => (
                <button key={fw.id} onClick={() => setActiveExport(fw.id)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeExport === fw.id ? fw.color : '#f8f7f5', color: activeExport === fw.id ? '#fff' : '#555553', border: `0.5px solid ${activeExport === fw.id ? fw.color : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeExport === fw.id ? 500 : 400 }}>
                  {fw.name}
                </button>
              ))}
            </div>
            {activeFrameworks.map(fw => {
              if (fw.id !== activeExport) return null
              const totals = totals_ar6
              const rev = inventory.revenue_millions
              const emp = inventory.employee_count
              return (
                <div key={fw.id}>
                  <div className="tq-summary" style={{ display: 'block', padding: '2rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: fw.color, background: fw.bg, borderRadius: 6, padding: '3px 10px', marginBottom: 12 }}>{fw.name} — {fw.full}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1.5rem' }}>
                      {[
                        ['Company', inventory.company_name || '—'],
                        ['Reporting year', String(inventory.reporting_year)],
                        ['GWP basis', `IPCC ${fw.gwp}`],
                        ['Scope 1 total', `${totals.s1_total.toFixed(4)} tCO₂e`],
                        ['Scope 2 (location)', `${totals.s2_location.toFixed(4)} tCO₂e`],
                        ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Scope 2 (market)', `${totals.s2_market.toFixed(4)} tCO₂e`]] : []),
                        ...(rev > 0 ? [['S1 intensity', `${(totals.s1_total/rev).toFixed(6)} tCO₂e/$M`]] : []),
                        ...(emp > 0 && fw.id === 'ecovadis' ? [['S1 per employee', `${(totals.s1_total/emp*1000).toFixed(2)} kgCO₂e`]] : []),
                        ['Deadline', fw.deadline],
                      ].map(([label, val]) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, color: 'var(--color-ink-2)', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {/* The export preview restates the totals, so it restates the omission. */}
                    {exclusionNote && (
                      <div style={{ fontSize: 11, color: 'var(--color-state-warn)', marginBottom: 16, lineHeight: 1.5 }}>⚠ {exclusionNote}</div>
                    )}
                    {(!conciergeReady || !gridReady || !declarationsReady || !pricingReady || !steamFactorsReady) && (
                      <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                        {unpriceableLocations.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 2 }}>⚠ {unpriceableLocations.length} location{unpriceableLocations.length > 1 ? 's' : ''} can&apos;t be worked out and would be left out of this report: {unpriceableLocations.map(u => u.locName).join(', ')} — fix the country or the unit on the Energy &amp; fuel step</div>
                        )}
                      {conciergePending.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 2 }}>⚠ {conciergePending.length} uploaded figure{conciergePending.length > 1 ? 's' : ''} still need{conciergePending.length > 1 ? '' : 's'} your confirmation</div>
                        )}
                        {unresolvedCoverage.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 2 }}>⚠ {unresolvedCoverage.length} coverage issue{unresolvedCoverage.length > 1 ? 's' : ''} need{unresolvedCoverage.length > 1 ? '' : 's'} resolving ({unresolvedCoverage.map(u => u.status).join(', ')})</div>
                        )}
                        {unresolvedGridLocations.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 2 }}>⚠ {unresolvedGridLocations.length} location{unresolvedGridLocations.length > 1 ? 's' : ''} need{unresolvedGridLocations.length > 1 ? '' : 's'} a grid region: {unresolvedGridLocations.map(l => l.name).join(', ')}</div>
                        )}
                        {streamsNeverAnswered.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 2 }}>⚠ {streamsNeverAnswered.length} undeclared stream{streamsNeverAnswered.length > 1 ? 's' : ''} — enter the data or attest absent on the Energy &amp; fuel step: {streamsNeverAnswered.map(u => `${u.locName}: ${STREAM_META[u.stream].name}`).join('; ')}</div>
                        )}
                        {streamsWithoutFigure.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 2 }}>⚠ {streamsWithoutFigure.length} stream{streamsWithoutFigure.length > 1 ? 's' : ''} declared with no figure — enter the amount on the Energy &amp; fuel step. You have said {streamsWithoutFigure.length > 1 ? 'these streams are' : 'this stream is'} present here, so attesting absent is not the fix: {streamsWithoutFigure.map(u => `${u.locName}: ${STREAM_META[u.stream].name}`).join('; ')}</div>
                        )}
                        {/* Names the ACTION, not just the problem. Unlike every other gate here the
                            remedy is not "enter a number you already have" — the customer has to go
                            and ask their provider for one, so the message has to say that plainly or
                            it reads as an unexplained lock. */}
                        {steamFactorGaps.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 2 }}>⚠ {steamFactorGaps.length} location{steamFactorGaps.length > 1 ? 's' : ''} report{steamFactorGaps.length > 1 ? '' : 's'} purchased steam with no published factor for {steamFactorGaps.length > 1 ? 'their jurisdictions' : 'that jurisdiction'} — ask your district energy provider for their emission intensity and enter it on the Energy &amp; fuel step: {steamFactorGaps.map(g => `${g.locName} (${g.jurisdiction})`).join('; ')}</div>
                        )}
                        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>Export is locked until every figure read from your bills is confirmed, every coverage gap, overlap, or boundary-straddle is resolved, and every emission stream is either entered or attested absent. Check the Energy &amp; fuel data step.</div>
                      </div>
                    )}
                    <div style={{ background: "#fff", border: "1px solid #e8e7e4", borderRadius: 8, padding: "14px 16px", marginTop: 16, marginBottom: 16 }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#555553", lineHeight: 1.6 }}>I confirm that the data entered is accurate to the best of my knowledge and has been sourced from actual utility bills and operational records. I understand that ThemisIQ applies the correct methodology to the data I provide, and that accuracy of the underlying data is my responsibility.</span>
                      </label>
                    </div>
                    <button onClick={() => dataConfirmed && conciergeReady && gridReady && declarationsReady && pricingReady && steamFactorsReady && generateExport(fw.id)} style={(dataConfirmed && conciergeReady && gridReady && declarationsReady && pricingReady && steamFactorsReady) ? btnStepPrimary : btnStepPrimaryDisabled}>
                      ⬇ Download {fw.name} Report (CSV)
                    </button>
                    <button onClick={() => dataConfirmed && conciergeReady && gridReady && declarationsReady && pricingReady && steamFactorsReady && generateAssurance()} style={(dataConfirmed && conciergeReady && gridReady && declarationsReady && pricingReady && steamFactorsReady) ? btnStepPrimary : btnStepPrimaryDisabled}>Download Full Assurance Package (PDF)</button>
                  </div>
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
                    <strong>Disclaimer:</strong>
                    {/* ⚠️ WIRED 22 Aug 2026, and the purpose is NOT 'screening'. This is a computed
                        inventory against published emission factors, destined for SB 253 / CSRD
                        submission — see the note on DisclaimerPurpose in lib/disclaimer.ts. The margin
                        ternary reproduces the styling the six inline paragraphs carried: '0' on the last,
                        '0 0 8px' on the rest. */}
                    {disclaimerParas('disclosure_preparation').map((para, i, all) => (
                      <p key={'disc' + i} style={{ margin: i === all.length - 1 ? '0' : '0 0 8px' }}>{para}</p>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <VerifierInvite inventoryId={inventoryId} />
          {/* SBTi nudge — shown once the inventory is saved AND its figures confirmed (a settled
              baseline). Affirmative next-step, not a warning. Always shows when gated (no sbti_targets
              read); copy reads fine whether or not targets already exist. GHG-gated page ⇒ no entitlement check. */}
          {inventoryId && dataConfirmed && conciergeReady && gridReady && declarationsReady && pricingReady && steamFactorsReady && (
            <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderRadius: 10, padding: '1.25rem', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' as const }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Your inventory is the baseline for science-based targets.</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6 }}>Set near-term and net-zero targets under the SBTi Corporate Net-Zero Standard V2.0 — built directly on the figures you just confirmed.</div>
              </div>
              {/* Carry THIS inventory's company so SBTi binds to it directly (highest-precedence
                  selection), not the alphabetical-first. Falls back to the bare link if unsaved. */}
              <a href={inventory.company_id ? `/dashboard/sbti?companyId=${inventory.company_id}` : '/dashboard/sbti'} style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Set science-based targets →</a>
            </div>
          )}
        </div>
      </div>
    )
  }

  const generateAssurance = async () => {
    // ⚠️ THE ERROR IS READ, NOT DISCARDED. This previously destructured `data` only and passed
    // `auditRows || []` onward, so a REFUSED READ became an empty trail and the package printed
    // "0 change(s) logged" for an inventory with live verifier links against it. The read was
    // failing in production because `authenticated` holds no SELECT grant on audit_log, so
    // PostgREST refused it before RLS was ever consulted — a failure the client never saw.
    const { data: auditRows, error: auditErr } = await supabase
      .from('audit_log').select('*')
      .eq('table_name', 'ghg_inventories').eq('record_id', inventoryId)
      .order('created_at', { ascending: false })
    if (auditErr) {
      // State what was observed. Do not guess at a cause — see the empty-result rule in CLAUDE.md.
      alert(
        'The assurance package was not generated.\n\n' +
        `The audit trail could not be read: ${auditErr.message}\n\n` +
        'The package is not produced without it, because it would otherwise state that this ' +
        'inventory has no recorded history. Nothing has been downloaded.'
      )
      return
    }
    // Per-location residual-mix citation for the PDF (only when a market-based framework is in scope).
    const needsMkt = activeFrameworks.some(f => f.id === 'esrs' || f.id === 'gri')
    const residualRows: string[][] = needsMkt
      ? inventory.locations.filter(l => l.electricity_kwh > 0).map(l => {
          const resRegion = residualRegionFor(l)
          const res = getResidualFactor(resRegion, inventory.reporting_year, 'AR6')
          return [
            l.name || 'Location',
            res.applicable ? res.source : 'Location-factor fallback',
            res.applicable ? `${res.vintage}${res.note ? ` — ${res.note}` : ''}` : (res.note || '—'),
          ]
        })
      : []
    // ⚠️ NOT `as any`. Every other argument here is cast, and that is why changing the audit
    // parameter's TYPE did not break this call site on its own — `as any` defeats the check that
    // would have caught it. This one argument is passed typed so the union actually binds.
    generateAssurancePDF(inventory as any, totals_ar6 as any, activeFrameworks as any, { ok: true, rows: auditRows ?? [] }, EF_SOURCES, residualRows)
  }

  const generateExport = async (frameworkId: string) => {
    const fw = FRAMEWORKS.find(f => f.id === frameworkId)!
    const totals = totals_ar6
    const rev = inventory.revenue_millions
    const emp = inventory.employee_count
    const header = [
      [`${fw.full} — GHG Emissions Report`],
      [`Generated by ThemisIQ · www.themisiq.co · ${new Date().toLocaleDateString()}`],
      ['GWP basis', `IPCC ${fw.gwp}`],
      [''],
      ['ORGANIZATION'],
      ['Company', inventory.company_name],
      ['Reporting year', inventory.reporting_year],
      ['Revenue (USD millions)', rev],
      ...(emp > 0 ? [['Employees (FTE)', emp]] : []),
      ['Boundary', inventory.boundary_approach.replace(/_/g, ' ')],
      ['Locations', inventory.locations.length],
      [''],
      ['RESULTS'],
      ['Scope 1 total (tCO₂e)', totals.s1_total.toFixed(4)],
      ['Scope 2 location-based (tCO₂e)', totals.s2_location.toFixed(4)],
      ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Scope 2 market-based (tCO₂e)', totals.s2_market.toFixed(4)]] : []),
      ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Biogenic CO₂ (mtCO₂) — reported separately', totals.biogenic.toFixed(4)]] : []),
      // Distinct Scope 3 (Cat 3) line — NZ electricity T&D losses. Only when present; never in S1/S2.
      ...(totals.s3_td > 0 ? [['Scope 3 Cat 3 — electricity T&D (tCO₂e)', totals.s3_td.toFixed(4)]] : []),
      ...(fw.id === 'cdp' ? [
        [`Prior year Scope 1 (${inventory.reporting_year - 1}) tCO₂e`, inventory.prior_year_s1],
        [`Prior year Scope 2 (${inventory.reporting_year - 1}) tCO₂e`, inventory.prior_year_s2],
      ] : []),
      ...(rev > 0 ? [['S1 intensity (tCO₂e/$M revenue)', (totals.s1_total / rev).toFixed(6)]] : []),
      // ⚠️ DIRECTLY UNDER THE FIGURES, AND IN EVERY FRAMEWORK'S FILE. The refusal appeared only in
      // the LOCATION BREAKDOWN, far below: a reader who took the RESULTS block at face value, which
      // is what a results block is for, saw a Scope 1, a Scope 2 and an intensity with nothing
      // saying a site was missing from all three. This is one line in a fixed position, and it is
      // the same sentence the wizard and the assurance package use, so the three cannot disagree.
      //   It sits INSIDE the shared rows array, so it is emitted for cdp, esrs, gri, ecovadis and
      // ifrs alike. The per-framework branches above add rows; none of them replaces this block.
      ...(exclusionNote ? [['Excluded from the figures above', exclusionNote]] : []),
      [''],
      ['METHODS'],
      ...combustionSourcesFor(inventory.locations).map(src => ['Combustion factors', src]),
      ...gridSourcesFor(inventory.locations).map(src => ['Electricity factors', src]),
      // The attribution each cited source's licence requires, verbatim, then the licence and its link.
      ...sourceAttributionsForLocations(inventory.locations).flatMap(a => [
        [`Licence attribution — ${a.publisher}`, a.attribution],
        [`Licence — ${a.publisher}`, `${a.licence}, ${a.licence_url}`],
      ]),
      // The same dead branch the PDF had: it chose gwp_ar4 or gwp_ar5 for a framework on AR4 or AR5, and none is.
      ['GWP values', EF_SOURCES.gwp_ar6],
      ...((fw.id === 'esrs' || fw.id === 'gri')
        ? [
            ['Market-based Scope 2', 'Residual-mix factor applied to uncovered load; covered (contractual) kWh counted at zero'],
            ...inventory.locations.filter(l => l.electricity_kwh > 0).map(l => {
              const resRegion = residualRegionFor(l)
              const res = getResidualFactor(resRegion, inventory.reporting_year, fw.gwp as GwpVersion)
              return [`Residual factor — ${l.name}`, res.applicable ? `${res.source} · vintage: ${res.vintage}${res.note ? ` · ${res.note}` : ''}` : `Location-factor fallback${res.note ? ` · ${res.note}` : ''}`]
            }),
          ]
        : []),
      [''],
      ['LOCATION BREAKDOWN'],
      // Grid region, not State: loc.state is empty for CA (province), UK, EU, NZ — every non-US location
      // exported a blank jurisdiction. grid_region (US_PA / ON / NZ) is the key the factor was looked up
      // under, which is exactly what a verifier needs to reconcile the number.
      // SEAM: calcLocation refuses an unpriceable location here too, across ALL locations rather
      // than the one on screen — so one bad location would abort the whole CSV mid-generation.
      // The export gate (pricingReady) currently makes this unreachable, but A GATE IS NOT A GUARD:
      // it protects this call only for as long as nobody loosens it or adds a second caller. The
      // 'Note' column carries the same claim as the `declaration: 'unpriceable'` row buildWorkings
      // writes, so the breakdown and the workings in the same export cannot disagree.
      ['Location', 'Grid region', 'S1 Total', 'S2 Location', 'Note'],
      ...inventory.locations.map(loc => {
        const blocked = unpriceableById.get(loc.id)
        if (blocked) {
          return [loc.name, loc.grid_region, '—', '—',
            blocked.kind === 'country'
              // ⚠️ NO "EXCLUDED FROM TOTALS" PREFIX ON A REFUSAL ROW. The sentence already ends
              // "Nothing from this location is included in any total on this report", and the GWP
              // basis cell beside it reads "excluded". Three statements of one fact in one row.
              ? countryRefusalText(blocked.refusal, 'verifier', locationHasEnteredFigures(loc))
              : `EXCLUDED FROM TOTALS — ${unpriceableMessage(blocked, locationHasEnteredFigures(loc))} No figure for this location is included in any total on this report.`]
        }
        const c = calcLocation(loc, fw.gwp as 'AR4' | 'AR5', inventory.reporting_year)
        return [loc.name, loc.grid_region, c.s1_total.toFixed(4), c.s2_location.toFixed(4), '']
      }),
      [''],
      ['DISCLAIMER'],
      ['This report was generated by the ThemisIQ platform for informational purposes only.'],
      ['All emissions require third-party verification before formal submission.'],
    ]
    const csv = header.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ThemisIQ_${fw.id.toUpperCase()}_${inventory.company_name.replace(/\s+/g,'_')}_${inventory.reporting_year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (mode === 'loading') {
    return <div style={{ background: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ink-muted)', fontSize: 14 }}>Loading…</div>
  }
  if (mode === 'list') {
    return (
      <div style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a href="/dashboard" style={{ textDecoration: 'none' }}><ThemisIQLogo size={19} /></a>
            <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>/ GHG Inventory</span>
          </div>
        </nav>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 400, color: '#0d0d0d', margin: 0 }}>Your inventories</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <a href="/dashboard/ghg/trends" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none', whiteSpace: 'nowrap' }}>View trends →</a>
              <button onClick={startNewInventory} style={{ fontSize: 13, fontWeight: 500, ...btnPrimary, padding: '10px 20px' }}>+ New inventory</button>
            </div>
          </div>
          {/* An ?id= that did not open. The sentence ends by naming what is on this page: the list. */}
          {loadError && (
            <div role="alert" style={{ background: '#FEF3C7', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.75rem', marginBottom: 16, fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
              {loadError}
            </div>
          )}
          {inventoryList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-ink-muted)', fontSize: 14 }}>No inventories yet. Click &ldquo;New inventory&rdquo; to begin.</div>
          ) : (
            inventoryList.map(inv => (
              <a key={inv.id} href={`/dashboard/ghg?id=${inv.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '16px 20px', marginBottom: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d' }}>{inv.company_name || 'Untitled inventory'}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 3 }}>Reporting year {inv.reporting_year} · Updated {new Date(inv.updated_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-brand)' }}>Open →</span>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    )
  }

  // ── ENTRY GATE ────────────────────────────────────────────────────────────────────────────
  // A NEW inventory (no id yet) requires an ACTIVE pass, because nothing entered into it can be
  // saved without one — the trigger refuses the insert outright. Better to say so on an empty
  // screen than after six steps of data entry.
  //
  // AN EXISTING INVENTORY IS DELIBERATELY NOT GATED HERE. Reading is untouched by the trigger,
  // which fires only on INSERT/UPDATE, so a lapsed customer keeps full sight of the numbers they
  // filed — and of the workings a verifier may still be reading. Expiry withdraws the right to
  // write, not the record. The banner further down tells them saving is off; nothing is hidden.
  //
  // The loading arm renders the same "Loading…" this page already shows for `mode`, rather than
  // the wizard: showing the form and then replacing it with a wall is the flash useEntitlement.ts
  // documents, and it reads as access being taken away mid-session.
  // Nested rather than two sibling ifs so the narrowing survives: after the outer test rules out
  // 'active' and the inner one rules out 'loading', `ghgAccess` is exactly the three states the
  // wall accepts, and a sixth state added later fails to compile here instead of rendering blank.
  if (mode === 'wizard' && !inventoryId && ghgAccess !== 'active') {
    if (ghgAccess === 'loading') {
      return <div style={{ background: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-ink-muted)', fontSize: 14 }}>Loading…</div>
    }
    return <GhgEntryWall access={ghgAccess} />
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/dashboard" style={{ textDecoration: 'none' }}>
            <ThemisIQLogo size={19} />
          </a>
          <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>/ GHG Inventory</span>
          {activeFrameworks.length > 0 && <span style={{ fontSize: 11, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 99, padding: '2px 10px', color: '#555553' }}>{activeFrameworks.map(f => f.name).join(' · ')}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <a href="/dashboard/ghg/trends" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none', marginRight: 16, whiteSpace: 'nowrap' }}>View trends →</a>
          <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, background: saved ? '#E1F5EE' : 'var(--color-brand)', border: saved ? '1px solid #0F6E56' : 'none', cursor: 'pointer', color: saved ? '#0F6E56' : 'var(--color-on-dark)', fontWeight: saved ? 500 : 700 }}>
            {isSaving ? 'Saving…' : saved ? '✓ Saved' : 'Save draft'}
          </button>
        </div>
      </nav>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', display: 'flex', overflowX: 'auto' as const }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ fontSize: 12, padding: '14px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? 'var(--color-brand)' : 'transparent'}`, color: step === i ? 'var(--color-brand)' : 'var(--color-ink-muted)', cursor: 'pointer', fontWeight: step === i ? 500 : 400, whiteSpace: 'nowrap' as const }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem 120px' }}>
        {/* READ-ON, SAVE-OFF. Only reachable with an existing inventory open — a new one hits the
            entry wall above. It is a NOTICE, not a gate: nothing below is blurred or disabled,
            because the customer can legitimately read, navigate and export from here, and the one
            thing they cannot do is already refused by the trigger with its own message. Saying it
            up front is the difference between a known limit and a lost afternoon. */}
        {ghgAccess !== 'active' && ghgAccess !== 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const, background: '#FEF3E2', border: '0.5px solid var(--color-state-warn)33', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: 13, color: '#0d0d0d', lineHeight: 1.6 }}>
              {ghgAccess === 'expired'
                ? <><strong style={{ fontWeight: 600 }}>Your GHG access has expired.</strong> You can read this inventory and everything in it. Saving changes is off until you renew.</>
                : ghgAccess === 'unknown'
                ? <><strong style={{ fontWeight: 600 }}>We could not check your GHG access.</strong> Reading is unaffected. Saving may not work until this clears.</>
                : <><strong style={{ fontWeight: 600 }}>Saving needs the GHG module.</strong> You can read this inventory, but changes will not be kept.</>}
            </span>
            {ghgAccess !== 'unknown' && (
              <a href="/pricing?modules=ghg" style={{ fontSize: 13, fontWeight: 600, padding: '9px 22px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>{ghgAccess === 'expired' ? 'Renew GHG →' : 'See pricing →'}</a>
            )}
          </div>
        )}
        {/* An ?id= that did not open, on an account with no saved inventory to list: the redirect
            lands here, in a blank wizard, and the sentence says so rather than leaving a customer to
            wonder why their link opened a new inventory. */}
        {loadError && (
          <div role="alert" style={{ background: '#FEF3C7', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.75rem', marginBottom: 16, fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
            {loadError}
          </div>
        )}
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {(step === 4 || step === 5) && dirty && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const, background: '#FEF3E2', border: '0.5px solid var(--color-state-warn)33', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: 13, color: '#0d0d0d', fontWeight: 500 }}>You have unsaved changes — save your draft before {step === 5 ? 'exporting' : 'continuing'}.</span>
            <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 13, fontWeight: 600, padding: '9px 22px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' as const }}>{isSaving ? 'Saving…' : 'Save draft'}</button>
          </div>
        )}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {/* ACTIVE ONLY, and it must not read isPaid — that is true for 'expired' by contract.
            Minting a grant is a WRITE the term should withdraw: verifier_access RLS checks only
            customer_user_id = auth.uid(), there is no trigger on the table, and a minted token then
            reads the inventory for its own 90 days with no entitlement check anywhere downstream.
            The audit trail stays: reading is not withdrawn by expiry (see the ENTRY GATE note). */}
        {step === 6 && <><AuditTrail inventoryId={inventoryId} step={step} />{ghgAccess === 'active' && <VerifierInvite inventoryId={inventoryId} />}</>}

        {step === 2 && !gridReady && (
          <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 8, padding: '12px 16px', marginTop: '1.5rem', fontSize: 12, fontWeight: 600, color: 'var(--color-state-warn)' }}>⚠ {unresolvedGridLocations.length} location{unresolvedGridLocations.length > 1 ? 's' : ''} need{unresolvedGridLocations.length > 1 ? '' : 's'} a grid region before you can continue: {unresolvedGridLocations.map(l => l.name).join(', ')}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
          <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0} style={{ ...(step === 0 ? btnStepDisabled : btnStep) }}>← Back</button>
          {step < STEPS.length - 1 && (
            <button onClick={() => { if (step === 2 && !gridReady) return; setStep(s => s+1) }} disabled={step === 2 && !gridReady} style={(step === 2 && !gridReady) ? btnStepPrimaryDisabled : btnStepPrimary}>Continue →</button>
          )}
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: '#fff', borderTop: '0.5px solid #e8e7e4', boxShadow: '0 -2px 12px rgba(0,0,0,0.06)', padding: '14px 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: saved ? '#0F6E56' : '#0d0d0d' }}>
          {saved ? '✓ All changes saved' : 'You have unsaved changes'}
        </div>
        <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 16, fontWeight: saved ? 500 : 700, padding: '14px 40px', borderRadius: 8, background: saved ? '#E1F5EE' : 'var(--color-brand)', border: saved ? '1px solid #0F6E56' : 'none', cursor: 'pointer', color: saved ? '#0F6E56' : 'var(--color-on-dark)' }}>
          {isSaving ? 'Saving…' : saved ? '✓ Saved' : 'Save draft'}
        </button>
      </div>
      <GHGBot currentStep={step} />
    </div>
  )
}

// Badge label, from STATUS ALONE. It used to fall through to `p.confidence`, so a CONFIRMED
// low-confidence figure rendered a green "LOW": the colour said settled, the word said doubtful,
// and the two were describing different things. `confidence` is the model's read-certainty and is
// already spent — it decides `needsReview` at the extraction site and has no meaning to a customer
// once they have acted on the row. The badge answers "what state is this in", which is `status`.
//
// Record<ConciergeStatus, string> is EXHAUSTIVE BY TYPE: a member added to the union fails the
// build here rather than rendering `undefined` in a pill.
const PROPOSAL_BADGE: Record<ConciergeStatus, string> = {
  confirmed:           'Confirmed',
  extracted:           'To confirm',
  needs_manual_review: 'Needs review',
  rejected:            'Rejected',   // never set today — mapped only to keep the union exhaustive
}

// And the colour, from status too — same Record shape so the two cannot answer differently.
// Shape `{ bg, color }` matches the confidenceConfig pill in app/dashboard/scope3/page.tsx.
//
// NEUTRAL IS THE TOKEN FILE'S OWN INACTIVE PALETTE, not a new pair. themisiq-tokens.css states it
// under A DISABLED CONTROL TAKES AN EXPLICIT PALETTE — fill var(--color-sunken), label
// var(--color-ink-muted), 5.00:1 on sunken — and app/components/buttonStyles.ts already uses that
// exact pair for btnStepDisabled. 'extracted' means nobody has acted on the row yet, which is the
// same register: present, legible, not asserting anything. Green would claim it was settled.
//
// Green and amber are UNCHANGED, kept as the literals that were already here rather than
// re-derived — this change is about which states get which colour, not about repricing them.
const PROPOSAL_BADGE_COLOUR: Record<ConciergeStatus, { bg: string; color: string }> = {
  confirmed:           { bg: '#E1F5EE',              color: '#0F6E56' },
  needs_manual_review: { bg: '#FEF3E2',              color: 'var(--color-state-warn)' },
  extracted:           { bg: 'var(--color-sunken)',  color: 'var(--color-ink-muted)' },
  rejected:            { bg: 'var(--color-sunken)',  color: 'var(--color-ink-muted)' },
}

function DocUpload({ label, locIdx, docType, docs, onUpload, onRemove, onUpdateProposal, onAddCoverageResolution, uploading, reportingYear, fiscalYearEndMonth, locId, coverageResolutions, uploadError }: { label: string; locIdx: number; docType: string; uploadError?: string; docs: SourceDoc[]; onUpload: (f: FileList, i: number, t: string) => void; onRemove: (locId: string, docId: string, path: string, errorKey: string) => void; onUpdateProposal: (locIdx: number, docId: string, propIdx: number, patch: Partial<ExtractedProposal>) => void; onAddCoverageResolution: (res: CoverageResolution) => void; uploading: boolean; reportingYear: number; fiscalYearEndMonth: number; locId: string; coverageResolutions: CoverageResolution[] }) {
  const ref = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)   // `${docId}:${propIdx}` being edited
  const [editVal, setEditVal] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const hasConcierge = useHasConcierge()   // concierge tier held → auto-extraction; else manual entry
  // Reads the SAME set the upload handler skips on, so the drop zone can never promise a reading
  // that will not happen. Three states, not two: no concierge; concierge on a type it reads;
  // concierge on a type it does not.
  const conciergeReads = hasConcierge && !CONCIERGE_UNREAD_DOC_TYPES.has(docType)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragActive(true) }}
      onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
      onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) onUpload(e.dataTransfer.files, locIdx, docType) }}
      style={{ background: dragActive ? 'var(--color-brand-wash)' : '#f8f7f5', border: dragActive ? '1px solid var(--color-brand)' : '0.5px dashed #e8e7e4', borderRadius: 12, padding: '10px 14px', transition: 'background 0.12s ease, border-color 0.12s ease' }}
    >
      {/* Click-to-pick region (drop works anywhere on the card above). Same picker as before. */}
      <div onClick={() => !uploading && ref.current?.click()} style={{ cursor: uploading ? 'default' : 'pointer', marginBottom: docs.length > 0 ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>📎 {label}</span>
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', color: '#555553' }}>{uploading ? 'Uploading…' : '+ Upload'}</span>
        </div>
        <div style={{ fontSize: 13, color: '#0d0d0d', fontWeight: 500 }}>
          {conciergeReads ? 'Drag & drop your bill here, or click to upload' : 'Drag & drop your documents here, or click to upload'}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginTop: 4, lineHeight: 1.5 }}>
          {conciergeReads
            ? 'We’ll read the consumption figures automatically — you confirm before anything’s saved. PDF or photo (JPG, PNG) — large phone photos are fine.'
            : hasConcierge
              /* Leads with why the upload is worth making. The limitation comes last and is stated
                 plainly — not as a downgrade, because the evidence is the point of the upload. */
              ? 'Upload it so your figure is evidenced — this is the document a verifier traces your number back to. Type the figure into the box above; we don’t read these ones automatically. PDF, image, XLSX or CSV.'
              : 'PDF, image, XLSX or CSV. Enter figures manually after uploading — large files are fine.'}
        </div>
      </div>
      <input ref={ref} type="file" multiple accept=".pdf,.xlsx,.csv,.jpg,.png" style={{ display: 'none' }} onChange={e => e.target.files && onUpload(e.target.files, locIdx, docType)} />
      {(() => {
        // Coverage strip — ONE per (fuelType) at this location. A fleet_fuel upload carries gasoline AND
        // diesel from the same bills; each fuel gets its OWN strip, status and resolution (the C1 fix), so a
        // gap on diesel can't be cleared by acknowledging gasoline. Within a strip, a control is rendered
        // for EACH unresolved issue in cov.issues — a gap+overlap fuel shows BOTH (the D1 fix).
        const win = periodFromYearAndEnd(reportingYear, fiscalYearEndMonth)
        const groups = new Map<string, CoveragePeriod[]>()
        docs.forEach(d => (d.extracted ?? []).forEach((p, pi) => {
          if (p.status !== 'confirmed' || !p.periodStart || !p.periodEnd) return
          const arr = groups.get(p.fuelType) ?? []
          arr.push({ docId: d.id, pi, start: parseLocalDate(p.periodStart as string), end: parseLocalDate(p.periodEnd as string) })
          groups.set(p.fuelType, arr)
        }))
        if (groups.size === 0) return null
        const KIND_FOR = { gap: 'extrapolate', overlap: 'duplicate', straddle: 'straddle' } as const
        return [...groups.entries()].map(([fuelOfStrip, periods]) => {
          const cov = analyzeCoverage(periods, win.start, win.end)
          const resFor = (kind: CoverageResolution['kind']) =>
            coverageResolutions.find(r => r.kind === kind && r.locId === locId && r.fuelType === fuelOfStrip)
          const gapRes = resFor('extrapolate')
          const dupRes = resFor('duplicate')
          const strdRes = resFor('straddle')
          // Resolved only when EVERY issue present has its matching resolution on file.
          const unresolvedIssues = cov.issues.filter(iss => !resFor(KIND_FOR[iss]))
          const resolved = unresolvedIssues.length === 0
          const tone =
            resolved ? { bg: '#E1F5EE', fg: '#0F6E56', icon: '✓' }
            : { bg: '#FEF3E2', fg: 'var(--color-state-warn)', icon: '⚠' }
          const fuelPrefix = groups.size > 1 && fuelOfStrip ? `${fuelOfStrip}: ` : ''
          return (
          <div key={fuelOfStrip} style={{ marginTop: 8, background: tone.bg, borderRadius: 6, padding: '8px 10px', fontSize: 11, color: tone.fg, fontWeight: 600 }}>
            <div>{tone.icon} {fuelPrefix}{resolved && cov.issues.length > 0 ? `${cov.monthsCovered}/12 months from bills; remaining estimated (${cov.pctEstimated}% estimated).` : cov.summary}</div>
            {cov.outOfWindow.length > 0 && (
              <div style={{ marginTop: 4, fontWeight: 400, color: '#555553' }}>
                ℹ️ {cov.outOfWindow.length} bill{cov.outOfWindow.length > 1 ? 's' : ''} outside reporting year {reportingYear}, not counted: {cov.outOfWindow.map(o => o.label).join(', ')}.
              </div>
            )}
            {cov.issues.includes('gap') && !gapRes && (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 400, color: '#7c5a16' }}>Upload the missing bill above, or:</span>
                <button
                  onClick={() => onAddCoverageResolution({
                    locId,
                    fuelType: fuelOfStrip,
                    kind: 'extrapolate',
                    monthsCovered: cov.monthsCovered,
                    pctEstimated: cov.pctEstimated,
                    note: `${cov.monthsCovered} of 12 months evidenced by bills; remaining ${12 - cov.monthsCovered} month(s) estimated by scaling metered data ×12/${cov.monthsCovered} (${cov.pctEstimated}% estimated).`,
                    acknowledgedAt: new Date().toISOString(),
                  })}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--color-state-warn)', color: '#fff', border: 'none', cursor: 'pointer' }}
                >Acknowledge &amp; estimate</button>
              </div>
            )}
            {cov.issues.includes('overlap') && !dupRes && (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 400, color: '#7c5a16' }}>Two bills cover the same period — remove the duplicate above, or:</span>
                <button
                  onClick={() => onAddCoverageResolution({
                    locId,
                    fuelType: fuelOfStrip,
                    kind: 'duplicate',
                    note: `Overlapping bills detected for ${fuelOfStrip || 'this fuel'}; user confirmed the overlap is intentional (e.g. corrected re-issue) and accepted the figures as-is. No double-count adjustment applied.`,
                    acknowledgedAt: new Date().toISOString(),
                  })}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--color-state-warn)', color: '#fff', border: 'none', cursor: 'pointer' }}
                >Confirm not a duplicate</button>
              </div>
            )}
            {cov.issues.includes('straddle') && !strdRes && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontWeight: 400, color: '#7c5a16', marginBottom: 6 }}>A bill crosses the reporting-year boundary. How should the overlapping portion be counted?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    { choice: 'prorate' as const, label: 'Prorate by days', note: 'day-level proration: only the in-window portion is counted, split by day count across the boundary' },
                    { choice: 'this_year' as const, label: 'Count in this year', note: 'the full straddling bill is attributed to this reporting year' },
                    { choice: 'next_year' as const, label: 'Count in next year', note: 'the full straddling bill is attributed to the next reporting year (excluded here)' },
                  ]).map(opt => (
                    <button
                      key={opt.choice}
                      onClick={() => onAddCoverageResolution({
                        locId,
                        fuelType: fuelOfStrip,
                        kind: 'straddle',
                        straddleChoice: opt.choice,
                        daysInYear: cov.straddles[0]?.daysInYear,
                        totalDays: cov.straddles[0]?.totalDays,
                        note: `Boundary-straddling bill for ${fuelOfStrip || 'this fuel'} resolved by "${opt.label}" — ${opt.note}.`,
                        acknowledgedAt: new Date().toISOString(),
                      })}
                      style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: opt.choice === 'prorate' ? '#0F6E56' : '#fff', color: opt.choice === 'prorate' ? '#fff' : '#555553', border: opt.choice === 'prorate' ? 'none' : '0.5px solid #e8e7e4', cursor: 'pointer' }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )
        })
      })()}
      {uploadError && (
        <div style={{ marginTop: 6, background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#B91C1C', lineHeight: 1.5 }}>
          {uploadError}
        </div>
      )}
      {docs.map(doc => (
        <div key={doc.id} style={{ padding: '3px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#0d0d0d' }}>✓ {doc.file_name}</span>
            <button onClick={() => onRemove(locId, doc.id, doc.file_path, `${locIdx}:${docType}`)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none' }}>Remove</button>
          </div>
          {/* Why this document carries no figures. Abstention is NEUTRAL, not amber: the reader
              declining to guess is the system working, and colouring it as a fault would push a
              customer to re-upload a file that will rightly abstain again. */}
          {doc.read_note && (
            <div style={{
              marginTop: 4, marginLeft: 14, fontSize: 11, lineHeight: 1.5,
              color: doc.read_outcome === 'failed' ? 'var(--color-state-warn)' : '#555553',
            }}>
              {doc.read_outcome === 'failed' ? '⚠ ' : ''}{doc.read_note}
            </div>
          )}
          {doc.extracted && doc.extracted.length > 0 && (
            <div style={{ marginTop: 4, marginLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {doc.extracted.map((p, pi) => (
                <div key={pi} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-brand)' }}>ThemisIQ read</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{p.value != null ? `${p.value.toLocaleString()} ${p.unit ?? ''}` : '—'}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{p.fuelType.replace('_', ' ')}</span>
                    {(p.periodStart || p.periodEnd) && <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>· {p.periodStart ?? '?'} → {p.periodEnd ?? '?'}</span>}
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: PROPOSAL_BADGE_COLOUR[p.status].bg, color: PROPOSAL_BADGE_COLOUR[p.status].color }}>
                      {PROPOSAL_BADGE[p.status]}
                    </span>
                  </div>
                  {p.sourceQuote && <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontStyle: 'italic', marginTop: 2 }}>“{p.sourceQuote}”</div>}
                  {p.conversionNote && <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{p.conversionNote}</div>}
                  {editing === `${doc.id}:${pi}` ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <input type="number" value={editVal} onChange={e => setEditVal(e.target.value)} placeholder="corrected value" style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid #e8e7e4', borderRadius: 6, width: 130 }} />
                      <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{p.unit ?? ''}</span>
                      <button onClick={() => { const v = Number(editVal); if (Number.isFinite(v)) { onUpdateProposal(locIdx, doc.id, pi, { value: v, status: 'confirmed' }); setEditing(null) } }} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditing(null)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#f8f7f5', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      {p.status === 'confirmed' ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56' }}>✓ Confirmed</span>
                      ) : (
                        <button onClick={() => onUpdateProposal(locIdx, doc.id, pi, { status: 'confirmed' })} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
                      )}
                      <button onClick={() => { setEditing(`${doc.id}:${pi}`); setEditVal(p.value != null ? String(p.value) : '') }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => onUpdateProposal(locIdx, doc.id, pi, { status: 'needs_manual_review' })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: 'var(--color-state-warn)', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Flag for review</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function QuestionCard({ question, hint, checked, onToggle, children }: { question: string; hint: string; checked: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  /* brand-line, not brand: the checkbox inside already carries the selected state at full
     strength, so the container only needs to agree with it, not compete. */
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${checked ? 'var(--color-brand-line)' : '#e8e7e4'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }} onClick={() => onToggle(!checked)}>
        <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${checked ? 'var(--color-brand)' : '#e8e7e4'}`, background: checked ? 'var(--color-brand)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {checked && <span style={{ color: 'var(--color-on-dark)', fontSize: 12, fontWeight: 700 }}>✓</span>}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{question}</div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.5 }}>{hint}</div>
        </div>
      </div>
      {checked && children && <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}><div style={{ paddingTop: '1rem' }}>{children}</div></div>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: hint ? 4 : 6 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}

const unitBtn = (active: boolean): React.CSSProperties => ({ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: active ? 'var(--color-brand)' : '#f8f7f5', color: active ? 'var(--color-on-dark)' : '#555553', border: `0.5px solid ${active ? 'var(--color-brand)' : '#e8e7e4'}`, cursor: 'pointer' })
const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '2rem' }
const wTd: React.CSSProperties = { padding: '6px 10px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', fontSize: 11, verticalAlign: 'top' }
const qHint: React.CSSProperties = { fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6, marginBottom: '0.75rem' }
export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>Loading…</div>}>
      <GHGPage />
    </Suspense>
  )
}

interface AuditRow {
  id: string
  action: string
  old_values: any
  new_values: any
  user_email: string | null
  created_at: string
}

// Fields worth surfacing in the diff (skip noisy/internal ones)
const TRACKED_FIELDS: Record<string, string> = {
  company_name: 'Company name',
  reporting_year: 'Reporting year',
  scope1_total: 'Scope 1 total (tCO₂e)',
  scope2_location_total: 'Scope 2 location-based (tCO₂e)',
  scope2_market_total: 'Scope 2 market-based (tCO₂e)',
  revenue_millions: 'Revenue (USD M)',
  employee_count: 'Employees',
  boundary_approach: 'Boundary approach',
  selected_frameworks: 'Frameworks',
  status: 'Status',
}

function fmt(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ') || '—'
  if (typeof v === 'number') return String(v)
  return String(v)
}

function diffRow(oldV: any, newV: any): { label: string; from: string; to: string }[] {
  const changes: { label: string; from: string; to: string }[] = []
  const o = oldV || {}
  const n = newV || {}
  for (const key of Object.keys(TRACKED_FIELDS)) {
    const before = fmt(o[key])
    const after = fmt(n[key])
    if (before !== after) changes.push({ label: TRACKED_FIELDS[key], from: before, to: after })
  }
  return changes
}

function AuditTrail({ inventoryId, step }: { inventoryId: string | null; step: number }) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)
  // ⚠️ THREE STATES, NOT TWO. Loading / failed / loaded — and "loaded with nothing" is a FOURTH
  // fact that only exists once the read succeeded. This component previously had two states and
  // coerced `res.data || []`, so a refused read rendered as "0 changes logged" and "No entries
  // recorded yet" beneath an ISO 14064-3 / ISAE 3410 heading. That is an assertion about the
  // customer's record, not a placeholder, and it was false in production.
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!inventoryId) return
    setLoading(true)
    setError(null)
    supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', 'ghg_inventories')
      .eq('record_id', inventoryId)
      .order('created_at', { ascending: false })
      .then((res: { data: AuditRow[] | null; error: { message: string } | null }) => {
        if (res.error) {
          // Report what was observed. Naming a probable cause here is how the last four of these
          // hid real defects for months — see the empty-result rule in CLAUDE.md.
          setError(res.error.message)
          setRows([])
        } else {
          setRows(res.data || [])
        }
        setLoading(false)
      })
  }, [inventoryId, step])

  if (!inventoryId) {
    return (
      <div>
        <h2 style={auditSectionHead}>Audit trail</h2>
        <p style={auditSectionSub}>Every change to this inventory is recorded automatically — who, what, and when — in a tamper-evident log. This is the record your verifier reviews.</p>
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>No history yet</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6 }}>Your audit trail will appear here once you save your inventory. Use the &ldquo;Save draft&rdquo; button at the top right to create the first entry.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={auditSectionHead}>Audit trail</h2>
      <p style={auditSectionSub}>Every change to this inventory is recorded automatically — who, what, and when — in a tamper-evident log. This is the record your verifier reviews.</p>

      {/* ⚠️ THE ISO STRIP RENDERS ONLY ON A SUCCESSFUL READ. "N changes logged · entries cannot be
          edited or deleted · ISO 14064-3 / ISAE 3410 traceability" is a claim about the record. It
          must not appear when we do not know what the record contains — the count would be zero
          because the read failed, not because nothing happened. */}
      {!error && (
        <div className="tq-summary" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }} className="tq-summary-label">Append-only record</div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-2)', fontWeight: 400 }}>{loading ? 'Reading the record…' : `${rows.length} change${rows.length !== 1 ? 's' : ''} logged · entries cannot be edited or deleted`}</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>ISO 14064-3 / ISAE 3410 traceability</div>
        </div>
      )}

      {error && (
        <div className="tq-callout tq-callout-note" style={{ '--tq-state': '#B91C1C', '--tq-state-wash': '#FCEBEB', marginBottom: '1.5rem' } as React.CSSProperties}>
          <div className="tq-callout-heading">The audit trail could not be read</div>
          <div className="tq-callout-text">
            This is a display failure, not a statement about your record — the entries are held in the
            database and are unaffected. Until it loads, this screen cannot show you what it contains,
            and the assurance package will not be generated. Reported by the database as:{' '}
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{error}</span>
            {' '}Please send that message to <a href="mailto:security@themisiq.co" style={{ color: 'var(--color-brand)' }}>security@themisiq.co</a>.
          </div>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-ink-muted)', fontSize: 13 }}>Loading history…</div>}

      {/* `!error` is what makes this a placeholder rather than an assertion: it can now only be
          reached when the read SUCCEEDED and genuinely returned nothing. */}
      {!loading && !error && rows.length === 0 && (
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center', fontSize: 13, color: '#555553' }}>No entries recorded yet.</div>
      )}

      {!loading && rows.map((row, i) => {
        const isCreate = row.action === 'INSERT'
        const isDelete = row.action === 'DELETE'
        const changes = row.action === 'UPDATE' ? diffRow(row.old_values, row.new_values) : []
        // ⚠️ UPDATE IS NEUTRAL, NOT BRANDED. Create is green and delete is red because both are
        // outcomes; update is simply the third case, and giving it the brand colour made the most
        // common row in the log read as the most emphasised.
        const color = isCreate ? '#0F6E56' : isDelete ? '#B91C1C' : 'var(--color-ink-2)'
        const bg = isCreate ? '#E1F5EE' : isDelete ? '#FCEBEB' : 'var(--color-sunken)'
        const actionLabel = isCreate ? 'Created' : isDelete ? 'Deleted' : 'Updated'
        return (
          <div key={row.id} style={{ position: 'relative', paddingLeft: 28, paddingBottom: i < rows.length - 1 ? 18 : 0 }}>
            {i < rows.length - 1 && <div style={{ position: 'absolute', left: 7, top: 18, bottom: 0, width: 2, background: '#e8e7e4' }} />}
            <div style={{ position: 'absolute', left: 0, top: 4, width: 16, height: 16, borderRadius: '50%', background: color, border: '3px solid #fff', boxShadow: '0 0 0 1px #e8e7e4' }} />
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: changes.length ? 10 : 0, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color, background: bg, padding: '3px 10px', borderRadius: 99 }}>{actionLabel}</span>
                  <span style={{ fontSize: 12, color: '#555553' }}>{row.user_email || 'System'}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              {changes.length > 0 && (
                <div style={{ borderTop: '0.5px solid #f0efed', paddingTop: 10 }}>
                  {changes.map((c, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: '#555553' }}>{c.label}</span>
                      <span style={{ color: 'var(--color-ink-muted)', textDecoration: 'line-through' }}>{c.from}</span>
                      <span style={{ color: 'var(--color-ink-muted)' }}>→</span>
                      <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{c.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const auditSectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '2rem' }


interface VerifierGrant {
  id: string
  token: string
  verifier_name: string | null
  verifier_email: string | null
  status: string
  expires_at: string
  created_at: string
}

function VerifierInvite({ inventoryId }: { inventoryId: string | null }) {
  const [grants, setGrants] = useState<VerifierGrant[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  // ⚠️ DEFAULTS TO FALSE, AND THE DEFAULT IS THE DECISION. Scope 3 Category 1 discloses SUPPLIER NAMES
  // and their reported figures, which is third-party commercial data rather than the customer's own.
  // The column behind it is `not null default false` for the same reason: get_verifier_scope3 is
  // granted to anon like every verifier RPC, so its existence would otherwise have widened all nine
  // grants that were live on 24 Sep 2026. Opting in is a deliberate act per link, never a remembered
  // preference.
  const [includeScope3, setIncludeScope3] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = () => {
    if (!inventoryId) return
    supabase
      .from('verifier_access')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('created_at', { ascending: false })
      .then((res: { data: VerifierGrant[] | null }) => setGrants(res.data || []))
  }

  useEffect(() => { load() }, [inventoryId])

  const createInvite = async () => {
    if (!inventoryId) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { alert('Please sign in to invite a verifier.'); setCreating(false); return }
    const { error } = await supabase.from('verifier_access').insert({
      inventory_id: inventoryId,
      customer_user_id: session.user.id,
      verifier_name: name || null,
      verifier_email: email || null,
      scope3_included: includeScope3,
    })
    setCreating(false)
    if (error) { alert('Could not create invitation: ' + error.message); return }
    // Reset the opt-in with the rest of the form: the next link should not inherit it silently.
    setName(''); setEmail(''); setIncludeScope3(false); load()
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.from('verifier_access')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('Could not revoke: ' + error.message); return }
    load()
  }

  const linkFor = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://www.themisiq.co'}/verify/${token}`

  const copy = (token: string, id: string) => {
    navigator.clipboard.writeText(linkFor(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!inventoryId) return null

  const active = grants.filter(g => g.status === 'active')

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '0.5px solid #e8e7e4', paddingTop: '2rem' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Invite a verifier</h3>
      {/* WHY THE SECOND PARAGRAPH. This block used to promise a "secure" link you could "revoke
          access" to at any time. Both overstated. A verifier link is a bearer credential — whoever
          holds it can open it — and revoking closes the PAGE, not anything the verifier has already
          downloaded. A customer reading the old sentence would reasonably conclude otherwise.
          The limit is stated together with the reason it is correct: an assurance provider keeping
          the evidence behind their opinion is a working-paper obligation, not a leak in this
          product. "Revoke one" rather than "revoke access", because access is the thing that does
          not fully revoke. */}
      <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '0.75rem' }}>
        Generate a read-only link for your independent assurance provider. They&apos;ll see this inventory&apos;s summary, methodology, and full audit trail &mdash; with no ability to edit. Links expire in 90 days, and you can revoke one at any time.
      </p>
      <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '1.25rem' }}>
        Revoking closes the link: the page stops loading and no further documents can be opened. It does not reach anything already downloaded. That is normal and expected &mdash; an assurance provider is required to keep the evidence behind their opinion in their own working papers.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Verifier name (optional)" style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4' }} />
        <input value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="Verifier email (optional)" style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4' }} />
        <button onClick={createInvite} disabled={creating} style={{ fontSize: 13, fontWeight: 500, ...btnPrimary, padding: '10px 20px', cursor: creating ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{creating ? 'Generating…' : 'Generate verifier link'}</button>
      </div>

      {/* ⚠️ THE ONE THING ON THIS FORM THAT DISCLOSES SOMEBODY ELSE'S DATA, so it is stated as that
          rather than as a feature. Everything else the link shows is the customer's own inventory. The
          sentence names what travels (supplier names and the figures they reported) and what does not
          (the questionnaire responses themselves), because a customer cannot consent to a disclosure
          described only as "include Scope 3". Unticked by default on every new link. */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: '1rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={includeScope3} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIncludeScope3(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: '#555553', lineHeight: 1.6 }}>
          <strong style={{ color: '#0d0d0d', fontWeight: 500 }}>Also share the Scope 3 record.</strong>{' '}
          The verifier sees each accepted category figure and what it is a total of, which for Category 1
          means your suppliers by name and the emissions figures they reported to you. It does not include
          their questionnaire responses. Leave this unticked if your supplier list is commercially
          sensitive: everything else on the link is your own inventory.
        </span>
      </label>

      {active.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontStyle: 'italic' }}>No active verifier links yet.</div>
      )}

      {active.map(g => (
        <div key={g.id} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{g.verifier_name || 'Verifier'}{g.verifier_email ? ` · ${g.verifier_email}` : ''}</div>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>Expires {new Date(g.expires_at).toLocaleDateString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => copy(g.token, g.id)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>{copiedId === g.id ? '✓ Copied' : 'Copy link'}</button>
              <button onClick={() => revoke(g.id)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'none', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#B91C1C' }}>Revoke</button>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--color-ink-muted)', wordBreak: 'break-all', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 6, padding: '6px 10px' }}>{linkFor(g.token)}</div>
        </div>
      ))}
    </div>
  )
}
