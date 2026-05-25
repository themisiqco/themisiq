'use client'

import { useState } from 'react'

// ─────────────────────────────────────────────────────────────
// Design tokens — lifted directly from HomePricing.tsx so these
// pages are visually identical to the rest of the platform.
// ─────────────────────────────────────────────────────────────
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const INK = '#0d0d0d'
const PAPER = '#f8f7f5'
const LINE = '#e8e7e4'
const MUTE = '#888784'
const BODY = '#555553'

export type StepState = 'complete' | 'in-progress' | 'locked'

export interface PackStep {
  title: string
  description: string
  // href the "Start →" CTA links to. Per the build summary, the GHG
  // wizard already reads ?pack=, so step 1 carries the pack slug.
  href: string
  cta: string
  // initial visual state. Real completion state should later be driven
  // by user_subscriptions / wizard progress; static for the funnel now.
  state?: StepState
}

export interface PackConfig {
  slug: string
  name: string
  price: string
  priceNote: string
  driver: string          // the "who's asking" line
  includes: string[]      // modules bundled in the pack
  frameworks: string      // framework mapping (from build summary)
  questionnaire: string    // template label
  steps: PackStep[]
  // accent used for the pack — kept inside the brand gradient family
  accent: string
  // Stripe Payment Link for this pack's "Pay now" button.
  // PLACEHOLDER until the real links exist — see CHECKOUT SETUP below.
  checkoutUrl: string
}

// ─────────────────────────────────────────────────────────────
// CHECKOUT SETUP — read me when your Stripe links are ready
// ─────────────────────────────────────────────────────────────
// Each pack's "Pay now" button points at `checkoutUrl`. Right now those
// are PLACEHOLDERS (CHECKOUT_PLACEHOLDER) so beta testers see the real
// flow without being charged — clicking shows a clearly-marked notice.
//
// To go live, do TWO things:
//   1. In Stripe, create one Payment Link per pack at the matching price
//      (Supplier $1,999 · Climate $1,999 · Foundation $2,999 · Investor $3,999).
//   2. Paste each https://buy.stripe.com/... URL into the matching pack's
//      `checkoutUrl` below, replacing CHECKOUT_PLACEHOLDER.
//
// That's the only change needed — the button auto-detects a real URL and
// stops showing the placeholder notice. Stripe SECRET keys never go here;
// only the public buy.stripe.com links do.
// ─────────────────────────────────────────────────────────────
const CHECKOUT_PLACEHOLDER = '#checkout-coming-soon'

// ─────────────────────────────────────────────────────────────
// THE FOUR PACKS
// Prices use the pack pricing from the build summary (consistent
// across both docs). Framework mapping is the GHG-wizard auto-select
// mapping documented in the summary.
// ─────────────────────────────────────────────────────────────
export const PACKS: Record<string, PackConfig> = {
  supplier: {
    slug: 'supplier',
    name: 'Supplier Readiness Pack',
    price: '$1,999',
    priceNote: '/year · all modules included',
    driver: 'A customer is asking you to report.',
    includes: ['GHG Inventory (Scope 1 & 2)', 'Supply Chain & Scope 3', 'Supplier Portal'],
    frameworks: 'GRI 305 · EcoVadis',
    questionnaire: 'EcoVadis-style questionnaire (38 questions)',
    accent: '#64fe3e',
    checkoutUrl: CHECKOUT_PLACEHOLDER, // → paste Supplier Readiness $1,999 Stripe link
    steps: [
      {
        title: 'Build your GHG inventory',
        description: 'Calculate your Scope 1 & 2 emissions. We pre-select the GRI 305 and EcoVadis frameworks your customer expects.',
        href: '/dashboard/ghg?pack=supplier',
        cta: 'Start your inventory →',
        state: 'in-progress',
      },
      {
        title: 'Map your supply chain',
        description: 'Add your suppliers and identify your Scope 3 hotspots across all 15 categories.',
        href: '/dashboard/supply-chain?pack=supplier',
        cta: 'Map suppliers →',
        state: 'locked',
      },
      {
        title: 'Send supplier questionnaires',
        description: 'Launch an EcoVadis-style campaign — 38 questions — and collect responses in one place.',
        href: '/dashboard/supply-chain/portal?pack=supplier',
        cta: 'Open the portal →',
        state: 'locked',
      },
      {
        title: 'Export your customer-ready report',
        description: 'Generate the assurance-ready report your customer asked for. This is where your plan unlocks export.',
        href: '/dashboard/ghg?pack=supplier&step=export',
        cta: 'Review & export →',
        state: 'locked',
      },
    ],
  },

  climate: {
    slug: 'climate',
    name: 'Climate Readiness Pack',
    price: '$1,999',
    priceNote: '/year · all modules included',
    driver: 'A bank or insurer is asking.',
    includes: ['GHG Inventory (Scope 1 & 2)', 'Climate Risk'],
    frameworks: 'IFRS S2 · CDP',
    questionnaire: 'CDP-aligned template',
    accent: '#1fb1ff',
    checkoutUrl: CHECKOUT_PLACEHOLDER, // → paste Climate Readiness $1,999 Stripe link
    steps: [
      {
        title: 'Build your GHG inventory',
        description: 'Calculate your Scope 1 & 2 emissions, pre-mapped to IFRS S2 and CDP disclosure requirements.',
        href: '/dashboard/ghg?pack=climate',
        cta: 'Start your inventory →',
        state: 'in-progress',
      },
      {
        title: 'Assess your climate risk',
        description: 'Run scenario analysis and document physical and transition risks the way your lender expects to see them.',
        href: '/dashboard/climate-risk?pack=climate',
        cta: 'Assess climate risk →',
        state: 'locked',
      },
      {
        title: 'Export your CDP-aligned disclosure',
        description: 'Generate the IFRS S2 / CDP report your bank or insurer requested. Export unlocks here.',
        href: '/dashboard/ghg?pack=climate&step=export',
        cta: 'Review & export →',
        state: 'locked',
      },
    ],
  },

  foundation: {
    slug: 'foundation',
    name: 'ESG Foundation Pack',
    price: '$2,999',
    priceNote: '/year · all modules included',
    driver: 'Your board wants ESG in place.',
    includes: ['GHG Inventory (Scope 1 & 2)', 'People & Workforce', 'Climate Risk'],
    frameworks: 'GRI 305 · ESRS E1',
    questionnaire: 'EcoVadis-style questionnaire',
    accent: '#7425e3',
    checkoutUrl: CHECKOUT_PLACEHOLDER, // → paste ESG Foundation $2,999 Stripe link
    steps: [
      {
        title: 'Build your GHG inventory',
        description: 'Calculate Scope 1 & 2 emissions, pre-mapped to GRI 305 and ESRS E1 for a board-ready baseline.',
        href: '/dashboard/ghg?pack=foundation',
        cta: 'Start your inventory →',
        state: 'in-progress',
      },
      {
        title: 'Complete your People & Workforce profile',
        description: 'Capture workforce metrics and your gender pay gap across ESRS S1 and GRI 401–410.',
        href: '/dashboard/people?pack=foundation',
        cta: 'Start workforce →',
        state: 'locked',
      },
      {
        title: 'Assess your climate risk',
        description: 'Document physical and transition risk so the board sees the full ESG picture, not just emissions.',
        href: '/dashboard/climate-risk?pack=foundation',
        cta: 'Assess climate risk →',
        state: 'locked',
      },
      {
        title: 'Export your board-ready ESG report',
        description: 'Generate a consolidated ESG report for your board. Export unlocks here.',
        href: '/dashboard/ghg?pack=foundation&step=export',
        cta: 'Review & export →',
        state: 'locked',
      },
    ],
  },

  investor: {
    slug: 'investor',
    name: 'Investor ESG Pack',
    price: '$3,999',
    priceNote: '/year · all modules included',
    driver: 'An investor requires it.',
    includes: ['GHG Inventory (Scope 1 & 2)', 'Climate Risk', 'Supply Chain & Scope 3', 'Deals & Investment'],
    frameworks: 'CDP · IFRS S2',
    questionnaire: 'CDP-aligned template',
    accent: '#1fb1ff',
    checkoutUrl: CHECKOUT_PLACEHOLDER, // → paste Investor ESG $3,999 Stripe link
    steps: [
      {
        title: 'Build your GHG inventory',
        description: 'Calculate Scope 1 & 2 emissions, pre-mapped to CDP and IFRS S2 — the disclosures investors screen on.',
        href: '/dashboard/ghg?pack=investor',
        cta: 'Start your inventory →',
        state: 'in-progress',
      },
      {
        title: 'Assess your climate risk',
        description: 'Run scenario analysis and document transition risk to satisfy investor diligence.',
        href: '/dashboard/climate-risk?pack=investor',
        cta: 'Assess climate risk →',
        state: 'locked',
      },
      {
        title: 'Map your supply chain',
        description: 'Identify Scope 3 exposure across all 15 categories — increasingly required in investor reporting.',
        href: '/dashboard/supply-chain?pack=investor',
        cta: 'Map supply chain →',
        state: 'locked',
      },
      {
        title: 'Complete your Deals & Investment profile',
        description: 'Quantify portfolio and M&A exposure against TCFD, SFDR and ILPA expectations.',
        href: '/dashboard/deals?pack=investor',
        cta: 'Start deals →',
        state: 'locked',
      },
      {
        title: 'Export your investor-ready report',
        description: 'Generate the CDP / IFRS S2 package your investor requires. Export unlocks here.',
        href: '/dashboard/ghg?pack=investor&step=export',
        cta: 'Review & export →',
        state: 'locked',
      },
    ],
  },
}

// ─────────────────────────────────────────────────────────────
// Reusable layout. Each route page just calls <PackFlow slug="..." />
// ─────────────────────────────────────────────────────────────
function StepBadge({ state }: { state: StepState }) {
  if (state === 'complete') {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0F6E56', background: '#E7F4EF', borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap' }}>Complete</span>
    )
  }
  if (state === 'in-progress') {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#92400e', background: '#FEF3E2', borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap' }}>Start here</span>
    )
  }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTE, background: '#f0efed', borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap' }}>Locked</span>
  )
}

export default function PackFlow({ slug }: { slug: string }) {
  const pack = PACKS[slug]
  const [steps] = useState<PackStep[]>(pack.steps)
  const [showBetaNotice, setShowBetaNotice] = useState(false)
  // A real Stripe link starts with http(s); the placeholder does not.
  const isLive = !!pack?.checkoutUrl?.startsWith('http')

  if (!pack) {
    return (
      <div style={{ minHeight: '100vh', background: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 24, color: INK }}>Pack not found</h1>
          <a href="/pricing" style={{ color: '#7425e3', fontSize: 13, textDecoration: 'none' }}>See all packs →</a>
        </div>
      </div>
    )
  }

  const completed = steps.filter(s => s.state === 'complete').length
  const total = steps.length
  const pct = Math.round((completed / total) * 100)

  return (
    <div style={{ minHeight: '100vh', background: PAPER, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Dark focused header — no nav distractions ── */}
      <header style={{ background: INK, padding: '2.75rem 2.5rem 2.5rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* tiny brand mark only — deliberately minimal, no full nav */}
          <a href="/" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>ThemisIQ</a>

          <div style={{ marginTop: 22 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: pack.accent }}>Guided setup</span>
          </div>

          <h1 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 'clamp(1.9rem, 4vw, 2.7rem)', lineHeight: 1.15, color: '#fff', margin: '8px 0 6px' }}>
            {pack.name}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', fontWeight: 300, margin: 0 }}>{pack.driver}</p>

          {/* price + includes */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 22, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{pack.price}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', paddingBottom: 3 }}>{pack.priceNote}</div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>What's included</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pack.includes.map(m => (
                <span key={m} style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 99, padding: '5px 12px' }}>{m}</span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>
              Frameworks: {pack.frameworks} &nbsp;·&nbsp; {pack.questionnaire}
            </div>
          </div>
        </div>
      </header>

      {/* ── Progress bar ── */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${LINE}`, padding: '14px 2.5rem' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 99, background: '#f0efed', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: GRAD, borderRadius: 99, transition: 'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: MUTE, whiteSpace: 'nowrap' }}>{completed} of {total} complete</div>
        </div>
      </div>

      {/* ── Steps ── */}
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTE, marginBottom: 6 }}>Your steps</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 22, color: INK, margin: '0 0 4px' }}>Everything you need, in order.</h2>
        <p style={{ fontSize: 13, color: BODY, fontWeight: 300, lineHeight: 1.7, margin: '0 0 24px', maxWidth: 540 }}>
          Work through these in sequence. Each one feeds the next, and you only pay when you export your finished report.
        </p>

        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {steps.map((step, i) => {
            const state = step.state ?? 'locked'
            const isLast = i === steps.length - 1
            const interactive = state !== 'locked'
            return (
              <li key={i} style={{ position: 'relative', paddingLeft: 52, paddingBottom: isLast ? 0 : 22 }}>
                {/* connector line */}
                {!isLast && (
                  <div style={{ position: 'absolute', left: 17, top: 36, bottom: 0, width: 2, background: LINE }} />
                )}
                {/* number node */}
                <div style={{
                  position: 'absolute', left: 0, top: 0, width: 36, height: 36, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700,
                  background: state === 'complete' ? GRAD : '#fff',
                  border: state === 'complete' ? 'none' : `2px solid ${state === 'in-progress' ? '#7425e3' : LINE}`,
                  color: state === 'complete' ? '#0d0d0d' : state === 'in-progress' ? '#7425e3' : MUTE,
                }}>
                  {state === 'complete' ? '✓' : i + 1}
                </div>

                {/* card */}
                <div style={{
                  background: interactive ? '#fff' : '#fcfcfb',
                  border: `1px solid ${LINE}`,
                  borderRadius: 14,
                  padding: '16px 18px',
                  opacity: state === 'locked' ? 0.72 : 1,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{step.title}</div>
                    <StepBadge state={state} />
                  </div>
                  <p style={{ fontSize: 13, color: BODY, fontWeight: 300, lineHeight: 1.65, margin: '0 0 14px' }}>{step.description}</p>

                  {interactive ? (
                    <a href={step.href} style={{
                      display: 'inline-block', padding: '9px 18px', borderRadius: 8,
                      fontSize: 12, fontWeight: 600, color: '#0d0d0d',
                      background: GRAD, textDecoration: 'none', whiteSpace: 'nowrap',
                    }}>{step.cta}</a>
                  ) : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 500, color: MUTE,
                    }}>
                      <span style={{ fontSize: 11 }}>◯</span> Complete the previous step to unlock
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {/* ── Focused buy panel — stays on page, this pack only ── */}
        <div style={{ marginTop: 28, background: INK, borderRadius: 16, padding: '1.75rem' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Your plan</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, fontWeight: 400, color: '#fff', marginBottom: 4 }}>{pack.name}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 300, lineHeight: 1.6, marginBottom: 14 }}>
                Free to build — see your full results at no cost. Your plan unlocks the final, assurance-ready export.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pack.includes.map(m => (
                  <div key={m} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                    <span style={{ color: pack.accent, flexShrink: 0 }}>✓</span>{m}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1, background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{pack.price}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, marginBottom: 16 }}>per year · all modules included</div>

              {isLive ? (
                <a href={pack.checkoutUrl} style={{
                  display: 'inline-block', padding: '12px 28px', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, color: '#0d0d0d',
                  background: GRAD, textDecoration: 'none', whiteSpace: 'nowrap',
                }}>Pay now →</a>
              ) : (
                <button onClick={() => setShowBetaNotice(true)} style={{
                  display: 'inline-block', padding: '12px 28px', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, color: '#0d0d0d',
                  background: GRAD, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>Pay now →</button>
              )}

              {!isLive && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 8, maxWidth: 200 }}>
                  Checkout activates at launch
                </div>
              )}
            </div>
          </div>

          {/* Beta notice — only shows when a tester clicks the placeholder button */}
          {showBetaNotice && !isLive && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              <strong style={{ color: '#fff', fontWeight: 600 }}>Beta — payments not live yet.</strong> This is exactly how checkout will work. No card is charged. Secure payment via Stripe goes live shortly.
            </div>
          )}
        </div>

        {/* quiet escape hatch */}
        <div style={{ textAlign: 'center', marginTop: 22 }}>
          <a href="/pricing" style={{ fontSize: 12, color: MUTE, textDecoration: 'none' }}>Not the right pack? Compare all options →</a>
        </div>
      </main>
    </div>
  )
}
