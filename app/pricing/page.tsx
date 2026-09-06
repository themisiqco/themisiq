'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { startCheckout } from '../../lib/checkout'
import ConsentForm, { type ConsentPayload } from '../components/ConsentForm'
// tierPrice and tierStrikethrough dropped with the old-model blocks — both priced the retired
// per-module-per-tier model and had no reader left. `Tier` STAYS — see the note on the tier state
// below. NEW_PRICING_ACTIVE STAYS TOO, but only just: every `!NEW_PRICING_ACTIVE` branch is gone, and
// the four that remain are `NEW_PRICING_ACTIVE && (…)` wrappers around live content — always-true
// no-ops. They can be unwrapped whenever someone is in here; the flag is not doing work.
import { LEGACY_PRICING_PAGE_ID, volumeDiscount, ADDONS, conciergeTierForLocations, NEW_PRICING_ACTIVE, cartQuote, GHG_TIERS, FLAT_MODULE_PRICES, type Tier, type GhgTier, type ModuleKey, type AddOnKey } from '../../lib/pricing'
import { AI_ACT_HIGH_RISK_STANDALONE } from '../../lib/aiAct'
import { CS3D_APPLIES_FROM } from '../../lib/cs3d'
import { SB253_SHORT } from '../../lib/sb253'
import { SB261_SHORT } from '../../lib/sb261'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleId = 'ghg' | 'cbam' | 'risk' | 'impact' | 'supply' | 'people' | 'deals' | 'ai' | 'cyber'

interface Module {
  id: ModuleId
  name: string
  description: string
  tags: { label: string; color: 'blue' | 'green' | 'orange' | 'purple' }[]
  cta: { headline: string; sub: string; btn: string; href: string }
}

// ─── Data ─────────────────────────────────────────────────────────────────────



const MODULES: Module[] = [
  {
    id: 'ghg',
    name: 'Climate — GHG Inventory · Scope 1, 2 & 3',
    description: 'Scope 1, 2 & 3 · SB 253 · CDP · ESRS E1 · GRI 305 · IFRS S2 · EcoVadis · GHG Protocol · SBTi · RE100',
    tags: [
      { label: 'Scope 1, 2 & 3', color: 'blue' },
      { label: 'Live now', color: 'green' },
      { label: SB253_SHORT, color: 'orange' },
    ],
    cta: {
      headline: 'Ready to see your emissions?',
      sub: 'Your SB 253 Scope 1, 2 & 3 inventory can be complete in days — not months.',
      btn: 'See your emissions instantly →',
      href: '/dashboard/ghg',
    },
  },
  {
    id: 'cbam',
    name: 'CBAM — Carbon Border Adjustment Mechanism',
    description: 'Regulation (EU) 2023/956 · specific embedded emissions (SEE) · direct & indirect split · precursor tracing · installation-level actuals · Annex IV §1.2 summary for your EU customer',
    tags: [
      { label: 'Non-EU exporters', color: 'purple' },
      { label: 'Iron & Steel, and Aluminium live', color: 'orange' },
    ],
    cta: {
      headline: 'Is your EU customer asking for your actual emissions?',
      sub: 'Defaults carry a mark-up on top of the figure published for your country — 10% for 2026, rising to 30% by 2028. Your own verified emissions give your EU customer the choice.',
      btn: 'Calculate your embedded emissions →',
      href: '/dashboard/cbam',
    },
  },
  {
    id: 'risk',
    name: 'Climate Risk',
    description: 'SB 261 · TCFD · IFRS S2 · ESRS E1 · CDP (P-series) · SASB · scenario analysis · physical & transition risk',
    // NOT 'SB 261 · Jan 2026' — naming a date nobody is enforcing on the page where a customer
    // decides to buy asserts a deadline that does not exist.
    // Ninth Circuit injunction pending appeal, 18 November 2025 — Chamber of Commerce v. Sanchez,
    // No. 25-5327. Not a preliminary injunction; the district court denied that. SB 261 enforcement
    // is barred, SB 253 is not. Argued 9 January 2026, no ruling as of 12 August 2026.
    // Canonical account lives at the SB 261 entry in app/assess/page.tsx.
    tags: [{ label: SB261_SHORT, color: 'orange' }],
    cta: {
      headline: 'Ready to assess your climate risk?',
      sub: 'Physical and transition risk quantified. TCFD and SB 261 ready.',
      btn: 'Assess your climate risk →',
      href: '/dashboard/climate-risk',
    },
  },
  {
    // Sits next to Climate Risk deliberately — the two halves of double materiality.
    id: 'impact',
    name: 'Materiality Assessment',
    description: 'CSRD · ESRS 1 §6.2 · ESRS 2 IRO-1 / IRO-2 / SBM-3 · stakeholder engagement · ten ESRS topics assessed in both directions · divergence register · disclosure roadmap',
    // PURPLE, NOT ORANGE, AND NOT A DATE. The orange slots on this page are enforcement
    // deadlines; a 'CSRD · FY2027' tag would be a regulatory-timing claim standing on a page
    // with nothing to qualify it. The footnotes that carry that qualification live on
    // /materiality, not here — they moved there with the module page on 26 Aug 2026, when
    // /impact-materiality merged into it and was deleted. Audience-style tag instead, as 'deals' uses.
    tags: [{ label: 'CSRD · double materiality', color: 'purple' }],
    cta: {
      headline: 'Ready to run your materiality assessment?',
      sub: 'Stakeholder engagement, determinations made by named people, and a board report that shows how you got there.',
      // "Assessment" is correct here and is NOT the word retired from the climate-risk wizard on
      // 23 Aug 2026. That module produces a screening; this one produces determinations, and
      // lib/pricing.ts:53 names it 'Materiality Assessment'.
      btn: 'Start your assessment →',
      // ⚠️ NOT /dashboard/materiality — that path is a server redirect INTO the climate-risk
      // wizard (app/dashboard/materiality/page.tsx:20). The worksheet index is this module's own
      // entry point and the one gated on useEntitlement('double-materiality').
      href: '/dashboard/materiality/worksheet',
    },
  },
  {
    id: 'supply',
    name: 'Supply Chain',
    description: 'Supplier portal · EcoVadis (Environment, Labour & Human Rights, Ethics, Sustainable Procurement) · CDP supplier engagement · EU CS3D · ESRS S2+G1 · Modern Slavery Act · GRI 308/414 · UN Guiding Principles · pulls supplier data into Scope 3 Cat.1',
    tags: [
      { label: 'Supplier Portal', color: 'purple' },
      { label: `CS3D · ${CS3D_APPLIES_FROM}`, color: 'orange' },
    ],
    cta: {
      headline: 'Ready to map your supply chain?',
      sub: 'Scope 3, EcoVadis, CS3D and supplier engagement — one platform.',
      btn: 'Map your supply chain →',
      href: '/supply-chain',
    },
  },
  {
    id: 'people',
    name: 'People & Workforce',
    description: 'EU Pay Transparency · ESRS S1 · CA Pay Data · SEC Item 101 · GRI 401–410 · EcoVadis (Labour & Human Rights) · SASB · ISO 45001',
    tags: [{ label: 'EU Pay · Jun 2026', color: 'orange' }],
    cta: {
      headline: 'Do you know your gender pay gap?',
      sub: "Most companies don't. Find out in minutes — EU Pay Transparency ready.",
      btn: 'Calculate your pay gap →',
      href: '/people',
    },
  },
  {
    id: 'deals',
    name: 'Deals & Investment',
    description: 'SB 253 M&A liability · CSRD / ESRS E1 · SECR · CS3D · Canada S-211 · SFDR Art.8/9',
    tags: [{ label: 'LP / investor', color: 'purple' }],
    cta: {
      headline: 'Ready to screen your next target?',
      sub: 'Climate diligence in days. SB 253 liability assessed before you sign.',
      btn: 'Screen a target →',
      href: '/deals',
    },
  },
  {
    id: 'ai',
    name: 'AI Governance',
    description: 'EU AI Act · NIST AI RMF · ISO 42001 · GDPR Art.22 · Bill C-27 AIDA · SR 11-7 (Fed Reserve)',
    // Was 'EU AI Act · Aug 2' / 'deadline is August 2' — a bare day and month with NO YEAR, on the
    // page where a customer decides to buy. Both named the pre-deferral date; neither could be checked
    // against anything. The tag now names the regime, and the sub names the obligation.
    tags: [{ label: 'EU AI Act · high-risk', color: 'orange' }],
    cta: {
      headline: 'Do you know which of your AI systems are high-risk?',
      sub: `Annex III classification, Article 11 documentation and registration — high-risk obligations apply from ${AI_ACT_HIGH_RISK_STANDALONE}.`,
      btn: 'Start your AI inventory →',
      href: '/ai-governance',
    },
  },
  {
    id: 'cyber',
    name: 'Cyber Governance',
    description: 'NIS2 · DORA · SEC Cyber Rules · ISO 27001 · NIST CSF 2.0 · SOC 2 · UK Cyber Essentials',
    tags: [{ label: 'NIS2 + DORA active', color: 'purple' }],
    cta: {
      headline: 'Are you NIS2 and DORA compliant?',
      sub: 'Both are active and enforced. Find your gaps in minutes.',
      btn: 'Check your cyber readiness →',
      href: '/cyber',
    },
  },
]

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRAD = 'var(--color-brand)'

const TAG_STYLES: Record<string, React.CSSProperties> = {
  blue:   { background: '#E6F1FB', color: '#0C447C', border: '1px solid #bfdbfe' },
  green:  { background: '#E1F5EE', color: '#0F6E56', border: '1px solid #bbf7d0' },
  orange: { background: '#FEF3E2', color: '#92400e', border: '1px solid #fde68a' },
  purple: { background: 'var(--color-module-deals-wash)', color: 'var(--color-module-deals)', border: '1px solid var(--color-module-deals)' },
}

const tag = (label: string, color: string): React.CSSProperties => ({
  ...TAG_STYLES[color],
  display: 'inline-block',
  fontSize: 9,
  fontWeight: 700,
  padding: '1px 6px',
  borderRadius: 4,
  marginRight: 4,
  marginTop: 2,
  lineHeight: 1.6,
  whiteSpace: 'nowrap' as const,
})

// ─── Component ────────────────────────────────────────────────────────────────

function PricingPageInner() {
  const searchParams = useSearchParams()
  const VALID_MODULE_IDS: ModuleId[] = ['ghg', 'cbam', 'risk', 'supply', 'people', 'deals', 'ai', 'cyber']
  const initialModules = (() => {
    const param = searchParams.get('modules')
    if (!param) return new Set<ModuleId>(['ghg'])
    const ids = param.split(',').map(s => s.trim()).filter((s): s is ModuleId => (VALID_MODULE_IDS as string[]).includes(s))
    return ids.length > 0 ? new Set<ModuleId>(ids) : new Set<ModuleId>(['ghg'])
  })()
  // ⚠️ NAMED FOR A MODEL THAT NO LONGER EXISTS, AND NOT DELETABLE. `tier` was the per-module-per-tier
  // selector — Starter / Professional / Advisory applied to every module — and those cards are gone.
  // What it is NOW is the GHG TIER AND NOTHING ELSE: GHG is the only tiered module, and the picker
  // that writes it lives inside the GHG module row, appearing only when GHG is selected.
  //
  // It feeds BOTH the figure shown and the figure charged — cartQuote({ ghgTier: tier }) for the
  // panel, startCheckout({ tier, … }) in submitConsentAndPay for the payment, plus newModulePrice's
  // GHG branch and advisoryHref. So a reader clearing out "old tier stuff" would break the price and
  // the checkout together. Rename it ghgTier if you want the name to match the job; do not remove it.
  const [tier, setTier] = useState<Tier>('starter')
  const [selected, setSelected] = useState<Set<ModuleId>>(initialModules)
  // Add-on selection state
  const [conciergeOn, setConciergeOn] = useState(false)
  const [conciergeLocations, setConciergeLocations] = useState(1)


  // Pricing logic. unitPrice / gross / discount / net / totalNet were deleted with the old-model
  // blocks: they computed `count × tierPrice(tier)`, the retired per-module-per-tier price, and had
  // no reader left once those blocks went. Everything shown or charged now derives from cartQuote
  // below. `count` survives because the live panel reads it for volumeDiscount().
  const count = selected.size
  // Add-on logic. Concierge tier is resolved from the location count. Verification Readiness was
  // retired 10 Aug 2026 — see docs/ghg-verifier-grade-roadmap.md.
  // is only available once Concierge is added (mirrors the server dependency rule).
  const ghgSelected = selected.has('ghg')
  const conciergeResolved = conciergeTierForLocations(conciergeLocations)
  const conciergeActive = ghgSelected && conciergeOn
  const selectedAddOns: AddOnKey[] = [
    ...(conciergeActive && !conciergeResolved.isCustomQuote ? [conciergeResolved.key] : []),
  ]
  const addOnsTotal =
    (conciergeActive && !conciergeResolved.isCustomQuote ? ADDONS[conciergeResolved.key].price : 0)
  // ── PRICING — DISPLAY ONLY. The module total comes solely from the shared cartQuote(), so the
  // preview equals exactly what the server charges. submitConsentAndPay sends
  // { tier, moduleKeys, addOns } through startCheckout, which prices from the same function.
  // (Was "NEW-MODEL pricing (behind NEW_PRICING_ACTIVE)" — there is no other model left to be
  // behind a flag, and handleBuy, which the old note named, is gone with the old-model CTA arm.)
  const canonicalKeys = Array.from(selected).map((id) => LEGACY_PRICING_PAGE_ID[id]).filter(Boolean) as ModuleKey[]
  // TODO(checkout-consent sub-step): quote.requiresInvoice gates on the MODULE total
  // only (cartQuote), NOT module + add-ons. Add a grand-total card-threshold guard there.
  const quote = cartQuote({ modules: canonicalKeys, ghgTier: tier as GhgTier })
  const newGrandTotal = quote.totalUSD + addOnsTotal
  const advisoryHref = `/advisory?modules=${Array.from(selected).join(',')}&tier=${tier}`
  const newModulePrice = (id: ModuleId): number | null => {
    const key = LEGACY_PRICING_PAGE_ID[id]
    return key === 'ghg'
      ? GHG_TIERS[tier as GhgTier].priceUSD
      : FLAT_MODULE_PRICES[key as Exclude<ModuleKey, 'ghg'>]
  }
  // Consent modal (new-model self-serve B2B checkout) — gates the Buy-now button.
  const [consentOpen, setConsentOpen] = useState(false)
  // ConsentForm assembles + validates { business, purchaser, consent }; we attach the cart and pay.
  const submitConsentAndPay = (payload: ConsentPayload) => {
    const moduleKeys = Array.from(selected).map((id) => LEGACY_PRICING_PAGE_ID[id]).filter(Boolean)
    if (moduleKeys.length === 0) return
    startCheckout({
      tier,
      moduleKeys,
      ...(selectedAddOns.length > 0 ? { addOns: selectedAddOns } : {}),
      ...payload,
    })
  }

  const toggleModule = (id: ModuleId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev // keep at least one
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Dynamic CTA logic
  const getCta = () => {
    if (tier === 'advisory') return {
      headline: 'Ready to meet your compliance team?',
      sub: 'Specialists with deep sector experience. Technology that speaks your language.',
      buttons: [{ label: 'Talk to a specialist →', href: '/advisory', primary: true }],
    }
    if (count >= 4) return {
      headline: 'Ready to build your compliance platform?',
      sub: 'One platform, one obligation at a time — powered by expert advisors.',
      buttons: [
        { label: 'Start your free assessment →', href: '/assess', primary: true },
        { label: 'Talk to a specialist', href: '/advisory', primary: false },
      ],
    }
    if (count === 1) {
      const mod = MODULES.find(m => selected.has(m.id))!
      return {
        headline: mod.cta.headline,
        sub: mod.cta.sub,
        buttons: [
          { label: mod.cta.btn, href: mod.cta.href, primary: true },
          { label: 'Talk to a specialist', href: '/advisory', primary: false },
        ],
      }
    }
    // 2–3 modules
    const mods = MODULES.filter(m => selected.has(m.id))
    return {
      headline: 'Ready to get started?',
      sub: "Pick where you'd like to begin — or talk to a specialist who can guide you across all your needs.",
      buttons: [
        ...mods.map((m, i) => ({ label: m.cta.btn, href: m.cta.href, primary: i === 0 })),
        { label: 'Talk to a specialist', href: '/advisory', primary: false },
      ],
    }
  }

  const cta = getCta()

  const s: Record<string, React.CSSProperties> = {
    page: { fontFamily: 'system-ui, sans-serif', background: '#f8f7f5', minHeight: '100vh' },
    nav: { background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky' as const, top: 0, zIndex: 100 },
    wrap: { maxWidth: 860, margin: '0 auto', padding: '3rem 2rem' },
    // Hero
    heroLabel: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-brand)', border: '1px solid var(--color-band-line)', borderRadius: 99, padding: '4px 14px', marginBottom: 14 },
    heroTitle: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 400, color: '#0d0d0d', lineHeight: 1.3, marginBottom: 12 },
    heroSub: { fontSize: 13, color: '#555553', fontWeight: 400, maxWidth: 520, margin: '0 auto', lineHeight: 1.8 },
    // Prompt
    promptWrap: { borderRadius: 12, padding: 1, marginBottom: 20, background: GRAD },
    promptInner: { background: '#fff', borderRadius: 11, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 },
    promptDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: GRAD },
    // Credibility bar
    credBar: { background: '#f8f7f5', padding: '1rem 1.5rem', marginBottom: 28, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, border: '1px solid #e8e7e4', borderRadius: '0 0 12px 12px' },
    credItem: { textAlign: 'center' as const },
    credLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--color-ink-muted)', marginBottom: 4 },
    credVal: { fontSize: 10, color: '#374151', lineHeight: 1.6 },
    // Module rows
    moduleWrap: { border: '1px solid #e8e7e4', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
    moduleHeader: { display: 'grid', gridTemplateColumns: '1fr auto', background: '#f8f7f5', padding: '10px 16px', borderBottom: '1px solid #e8e7e4', alignItems: 'center' },
    // Price panel
    pricePanel: { marginBottom: 16 },
    // Bundle hints
    hintGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 20 },
    // CTA
    ctaWrap: { background: '#fff', border: '1px solid #e8e7e4', borderRadius: 14, padding: '1.75rem', textAlign: 'center' as const },
    ctaPara: { fontSize: 13, color: '#555553', fontWeight: 400, maxWidth: 500, margin: '0 auto 14px', lineHeight: 1.8 },
    ctaHeadline: { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, color: '#0d0d0d', marginBottom: 4 },
    ctaSub: { fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 18 },
    ctaBtns: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const },
  }

  const gradText: React.CSSProperties = {
    background: GRAD,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  }

  const moduleRow = (active: boolean): React.CSSProperties => ({
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    gap: 12,
    alignItems: 'start',
    padding: '14px 16px',
    borderBottom: '1px solid #e8e7e4',
    cursor: 'pointer',
    background: active ? '#fff' : '#f8f7f5',
    opacity: active ? 1 : 0.7,
    transition: 'all 0.15s',
  })

  const checkbox = (active: boolean): React.CSSProperties => ({
    width: 20,
    height: 20,
    borderRadius: 5,
    border: `1.5px solid ${active ? 'var(--color-brand)' : '#e8e7e4'}`,
    background: active ? 'var(--color-brand)' : '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  })

  // Matches on the BAND, not on the rendered label. It used to compare the label against 'Core' /
  // 'Growth' / 'Platform', which welded the active-state highlight to customer-facing copy: editing
  // the wording silently stopped the current band lighting up, with nothing to catch it. The band
  // values are internal and unchanged, so the copy above is now free to say whatever is true.
  const hintCard = (activeBundle: string, band: string): React.CSSProperties => {
    const isActive = band === activeBundle
    return {
      background: isActive ? '#fff' : '#f8f7f5',
      border: isActive ? '1.5px solid #0d0d0d' : '1px solid #e8e7e4',
      borderRadius: 10,
      padding: 10,
      textAlign: 'center',
      transition: 'all 0.2s',
    }
  }

  const activeBundle = count === 1 ? 'core' : count === 2 ? 'growth' : 'platform'

  const primaryBtn: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-on-dark)',
    background: GRAD,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    display: 'inline-block',
  }

  const ghostBtn: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    color: '#0d0d0d',
    background: '#fff',
    border: '1px solid #e8e7e4',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    display: 'inline-block',
  }

  // Consent-modal styles

  return (
    <div style={s.page}>

      {/* Nav */}
      <nav style={s.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/dashboard">
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
          </Link>
          <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>/ Pricing</span>
        </div>
        <Link href="/dashboard/ghg" style={{ ...primaryBtn, fontSize: 12, padding: '7px 16px' }}>
          See your emissions instantly →
        </Link>
      </nav>

      <div style={s.wrap}>

        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={s.heroLabel}>Your Trusted Climate & Sustainability Compliance Partner</div>
          <div style={s.heroTitle}>
            One platform. Purpose-built for each obligation.<br />
            <span style={gradText}>Expert-grade, priced for every business.</span>
          </div>
          <p style={s.heroSub}>
            Whether your driver is a regulator, a board, an investor, or a customer — ThemisIQ is your sustainability compliance reporting solution.
          </p>
        </div>

        {/* Interactive prompt — the page's first instruction, so it must describe the first action
            that EXISTS. It used to open "explore the tiers below", pointing at the tier cards under
            !NEW_PRICING_ACTIVE further down; those have not rendered since the June 2026 rescope,
            so a visitor was told to begin with a step that was not on the page and then to select
            modules second — the one thing they can actually do first.
            Tiers are not mentioned at all now, deliberately. GHG is the only tiered module and its
            picker appears INSIDE the module row once GHG is selected, so any mention here would
            either name a step that comes second or imply tiering applies to modules priced flat.
            "Bundle discounts" went the same way: the Full Platform bundle was removed on 23 Jul
            2026 and what the cart applies is the multi-module discount. The figures are stated in
            the hero's own words a few elements below (see the pick-and-pace panel), so the two
            agree rather than describing the same discount two ways.
            ONE NAME EVERYWHERE, and it is the checkout's: order/page.tsx calls this line item the
            multi-module discount, so every other surface says that too. It had five names — volume
            discount, bundle discount, bundle to save, multi-module discount, and unnamed — for one
            mechanism a buyer meets once, at the moment they pay. */}
        <div style={s.promptWrap}>
          <div style={s.promptInner}>
            <div style={{ ...s.promptDot, animation: 'pulse 2s ease-in-out infinite' }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>This pricing tool is interactive — </span>
              <span style={{ fontSize: 12, color: '#555553', fontWeight: 400 }}>select the compliance modules your business needs. Your total updates instantly, with the multi-module discount applied automatically — two modules −10%, three or more −20%.</span>
            </div>
          </div>
        </div>

        {/* Credibility bar */}
        <div style={s.credBar}>
          {[
            { label: 'Methodology', val: 'EPA 2024 · IPCC AR4+AR5 · ISO 14064-3 · GHG Protocol' },
            { label: 'Frameworks', val: 'SB 253 · CDP · ESRS E1 · GRI 305 · IFRS S2 · EcoVadis' },
            { label: 'Built by', val: 'Practitioners with Big 4 & climate consulting experience' },
            { label: 'Next reporting date', val: SB253_SHORT, red: true },
          ].map((item, i) => (
            <div key={i} style={{ ...s.credItem, ...(i > 0 ? { borderLeft: '1px solid #e8e7e4', paddingLeft: 12 } : {}) }}>
              <div style={s.credLabel}>{item.label}</div>
              <div style={{ ...s.credVal, ...((item as any).red ? { color: '#B91C1C', fontWeight: 600 } : {}) }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Section title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Simple, honest pricing</div>
          <div style={{ fontSize: 12, color: '#555553', fontWeight: 400 }}>Start with one module. Build your compliance platform as you grow.</div>
        </div>

        {/* Pick-and-pace hero (NEW model) — surfaces the volume discount, not a bundle price */}
        {NEW_PRICING_ACTIVE && (
          <div style={{ background: GRAD, borderRadius: 14, padding: 1, marginBottom: 24 }}>
            <div className="tq-band" style={{ borderRadius: 13, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, marginBottom: 6 }}>Pick and pace.</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.6, maxWidth: 520 }}>Start with the module your next deadline demands. Add others as your obligations grow — each one is a complete, standalone deliverable, not a partial view that only works when you buy the set.</div>
                <div style={{ fontSize: 11, color: 'var(--color-ink-2)', marginTop: 10 }}>Two modules −10% · Three or more −20%</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <button onClick={() => document.getElementById('build-your-stack')?.scrollIntoView({ behavior: 'smooth' })} style={{ ...primaryBtn, fontSize: 12 }}>Build your stack ↓</button>
              </div>
            </div>
          </div>
        )}

        {/* THREE OLD-MODEL BLOCKS STOOD BETWEEN HERE AND THE PRICE PANEL BELOW, ~155 lines, all
            behind !NEW_PRICING_ACTIVE and none of them renderable since the June 2026 rescope:
              · the TIER CARDS — Starter / Professional / Advisory, priced per module per year, with
                feature claims (5 organizations, 10 organizations, weekly regulatory alerts) that no
                surface makes today;
              · the OLD MODULE SELECTOR, pricing every row at tierPrice(tier);
              · the OLD PRICE PANEL, showing gross/net and labelling the discount "bundle discount" —
                a name retired on 23 Jul 2026 with the Full Platform bundle itself.
            Deleted rather than left behind the flag, for the reason the homepage cards were: a dead
            branch holding an obsolete price model reads as a rollback that is still available, and
            reverting NEW_PRICING_ACTIVE would not restore a working page — it would restore three
            different prices for one cart.
            THE LIVE EQUIVALENTS, in order: the Pick-and-pace panel above (which states the
            multi-module discount), the #build-your-stack module selector below (per-module prices
            from FLAT_MODULE_PRICES, with the GHG tier picker inline), and the cartQuote price panel
            after it. Nothing pointed into the deleted blocks — the prompt at the top of the page had
            already stopped naming tiers. */}

        {/* Module selector (NEW model) — per-module pricing, GHG inline tier picker */}
        {NEW_PRICING_ACTIVE && (
          <div id="build-your-stack" style={s.moduleWrap}>
            <div style={s.moduleHeader}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Select your compliance modules</div>
              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Click any row to add or remove</div>
            </div>
            {MODULES.map((mod, i) => {
              const isSelected = selected.has(mod.id)
              const isLast = i === MODULES.length - 1
              const isGhg = mod.id === 'ghg'
              const price = newModulePrice(mod.id)
              return (
                <div key={mod.id} style={{ ...moduleRow(isSelected), display: 'block', ...(isLast ? { borderBottom: 'none' } : {}) }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'start' }} onClick={() => toggleModule(mod.id)}>
                    <div style={checkbox(isSelected)}>
                      {isSelected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{mod.name}</span>
                        {mod.tags.map(t => (
                          <span key={t.label} style={tag(t.label, t.color)}>{t.label}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6 }}>{mod.description}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#0d0d0d' : 'var(--color-ink-muted)' }}>
                        {isGhg
                          ? `from $${(GHG_TIERS.starter.priceUSD as number).toLocaleString()}`
                          : `$${(price as number).toLocaleString()}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>/yr</div>
                    </div>
                  </div>
                  {/* GHG inline tier picker — only when GHG is selected */}
                  {isGhg && isSelected && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {(['starter', 'professional', 'advisory'] as GhgTier[]).map(t => {
                        const tp = GHG_TIERS[t].priceUSD
                        const label = t === 'starter' ? 'Essentials' : t === 'professional' ? 'Professional' : 'Advisory'
                        // Derived, not three literals. null = uncapped (Advisory), which the copy must
                        // say rather than leaving the reader to infer from a missing number.
                        const alw = GHG_TIERS[t].locationAllowance
                        const cap = alw == null ? 'unlimited locations' : `≤${alw} locations`
                        const active = tier === t
                        return (
                          <button key={t} onClick={(e) => { e.stopPropagation(); setTier(t) }} style={{ flex: 1, minWidth: 130, textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: active ? 'var(--color-brand-wash)' : '#fff', color: 'var(--color-ink)', border: active ? '2px solid var(--color-brand)' : '1px solid #e8e7e4' }}>
                            <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
                            <div style={{ fontSize: 12, marginTop: 2 }}>{tp == null ? 'Contact us' : `$${tp.toLocaleString()}/yr`}</div>
                            <div style={{ fontSize: 9, color: 'var(--color-ink-2)', marginTop: 2 }}>{cap}</div>
                          </button>
                        )
                      })}
                      {/* What counts as a location — placed at the point of CHOICE, because the tier
                          the buyer picks is a location count and nothing else on this page defines it. */}
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginTop: 10, flexBasis: '100%' }}>
                        One location = one site with its own electricity supply. All of that site’s energy goes in together — electricity, gas, vehicle fuel, refrigerants — so a site with separate gas and electricity accounts is still one location.
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {/* Add-ons — appear once GHG is selected */}
        {ghgSelected && (
          <div style={{ marginTop: 24, padding: 20, background: '#f8f7f5', borderRadius: 12, border: '1px solid #e8e7e4' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 4 }}>Enhance your GHG inventory</div>
            <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: 16 }}>Optional add-ons. We do the bill-reading; you confirm the numbers.</div>

            {/* Concierge */}
            <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: conciergeOn ? '2px solid var(--color-brand)' : '1px solid #e8e7e4', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>Concierge — we read your bills</div>
                  <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6, marginTop: 2 }}>Upload utility bills; ThemisIQ extracts the figures with source quotes for you to confirm. Priced by number of locations.</div>
                </div>
                <button onClick={() => setConciergeOn(v => !v)} style={{ ...(conciergeOn ? btnSecondary : btnPrimary), flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '6px 14px' }}>{conciergeOn ? 'Added ✓' : 'Add'}</button>
              </div>
              {conciergeOn && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0efed', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 12, color: '#555553' }}>Locations:</label>
                  <input type="number" min={1} value={conciergeLocations} onChange={e => setConciergeLocations(Math.max(1, Number(e.target.value) || 1))} style={{ width: 70, fontSize: 13, padding: '6px 8px', border: '1px solid #e8e7e4', borderRadius: 6 }} />
                  <span style={{ fontSize: 12, color: '#0d0d0d', fontWeight: 600 }}>
                    {conciergeResolved.isCustomQuote
                      ? 'Enterprise (16+) — custom quote'
                      : `${ADDONS[conciergeResolved.key].label.replace('Concierge — ', '')} · $${ADDONS[conciergeResolved.key].price.toLocaleString()}/yr`}
                  </span>
                  {conciergeResolved.isCustomQuote && (
                    <a href="mailto:lisa.foster@themisiq.co?subject=Concierge%20Enterprise%20quote" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none' }}>Request a quote →</a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live price panel (NEW model) */}
        {NEW_PRICING_ACTIVE && (
          <div className="tq-summary" style={s.pricePanel}>
            <div className="tq-summary-body">
              <div>
                <div style={{ letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }} className="tq-summary-label">Your platform — live estimate</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.8, marginBottom: 8 }}>
                  {MODULES.filter(m => selected.has(m.id)).map(m => <div key={m.id}>{m.name}</div>)}
                </div>
                {selectedAddOns.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--color-ink-2)', lineHeight: 1.8, marginBottom: 8, paddingTop: 8, borderTop: '1px solid var(--color-line)' }}>
                    {selectedAddOns.map(k => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span>{ADDONS[k].label}</span>
                        <span style={{ color: 'var(--color-ink-2)', whiteSpace: 'nowrap' }}>+${ADDONS[k].price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{count} module{count !== 1 ? 's' : ''} selected</div>
                  {volumeDiscount(count) > 0 && !quote.requiresQuote && (
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56', border: '1px solid #0F6E56' }}>
                      {volumeDiscount(count) * 100}% multi-module discount applied
                    </div>
                  )}
                  {quote.requiresInvoice && (
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--color-module-cbam-wash)', color: 'var(--color-module-cbam)', border: '1px solid var(--color-module-cbam)' }}>
                      Over $10k — completed by invoice
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {quote.requiresQuote ? (
                  <div className="tq-summary-figure" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>Contact us</div>
                ) : (
                  <>
                    <div className="tq-summary-figure" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>${newGrandTotal.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-ink-2)', marginTop: 4 }}>/year</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Discount bands. These are BANDS, not products: the cards used to read Core / Growth /
            Platform, which named three tiers a buyer cannot purchase — and "Platform" in particular
            read as the Full Platform bundle removed on 23 Jul 2026. The discount now leads each
            card and the condition sits under it, so the card states the rule rather than christening
            a package. Figures use the same − (U+2212) as both heroes. */}
        <div style={s.hintGrid}>
          {[
            { band: 'core', label: 'Full price', sub: '1 module' },
            { band: 'growth', label: '−10%', sub: '2 modules' },
            { band: 'platform', label: '−20%', sub: '3 or more modules' },
          ].map(h => {
            const isActive = h.band === activeBundle
            return (
              <div key={h.band} style={hintCard(activeBundle, h.band)}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#0d0d0d' : 'var(--color-ink-muted)' }}>{h.label}</div>
                <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 2 }}>{h.sub}</div>
              </div>
            )
          })}
        </div>

        {/* Dynamic closing CTA */}
        <div style={s.ctaWrap}>
          <p style={s.ctaPara}>
            For many companies, we understand that emerging reporting requirements — and the pricing from other platforms and traditional consulting firms — are overwhelming. ThemisIQ offers a better way.
          </p>
          <div style={s.ctaHeadline}>{cta.headline}</div>
          <div style={s.ctaSub}>{cta.sub}</div>
          <div style={s.ctaBtns}>
            {/* The old-model arm — `tier !== 'advisory' && <button onClick={handleBuy}>` priced from
                totalNet — went with the three dead blocks above. It was the last reader of handleBuy
                and of the net/gross figures, both of which computed the retired per-module-per-tier
                price. The live path is quote-driven: requiresQuote → specialist, requiresInvoice →
                invoice, otherwise the consent modal and startCheckout. */}
            {quote.requiresQuote ? (
              <Link href={advisoryHref} style={primaryBtn}>Talk to a specialist →</Link>
            ) : quote.requiresInvoice ? (
              <Link href={advisoryHref} style={primaryBtn}>Request an invoice →</Link>
            ) : (
              <button onClick={() => setConsentOpen(true)} style={primaryBtn}>Buy now — ${newGrandTotal.toLocaleString()}/yr →</button>
            )}
            {cta.buttons.map((btn, i) => (
              <Link key={i} href={btn.href} style={btn.primary ? primaryBtn : ghostBtn}>
                {btn.label}
              </Link>
            ))}
          </div>
        </div>

      </div>

      {/* Consent modal (NEW model) — B2B capacity + digital-content + data-authority */}
      {NEW_PRICING_ACTIVE && consentOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setConsentOpen(false)}>
          <ConsentForm onCancel={() => setConsentOpen(false)} onSubmit={submitConsentAndPay} />
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

    </div>
  )
}

export default function PricingPage() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>Loading…</div>}>
      <PricingPageInner />
    </Suspense>
  )
}