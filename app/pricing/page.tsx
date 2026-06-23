'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { startCheckout } from '../../lib/checkout'
import { LEGACY_PRICING_PAGE_ID, tierPrice, tierStrikethrough, volumeDiscount, ADDONS, conciergeTierForLocations, NEW_PRICING_ACTIVE, cartQuote, GHG_TIERS, FLAT_MODULE_PRICES, FULL_PLATFORM_PRICE, type Tier, type GhgTier, type ModuleKey, type AddOnKey } from '../../lib/pricing'

// ─── Types ────────────────────────────────────────────────────────────────────

type ModuleId = 'ghg' | 'risk' | 'supply' | 'people' | 'deals' | 'ai' | 'cyber'

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
      { label: 'SB 253 · Aug 10', color: 'orange' },
    ],
    cta: {
      headline: 'Ready to see your emissions?',
      sub: 'Your SB 253 Scope 1, 2 & 3 inventory can be complete in days — not months.',
      btn: 'See your emissions instantly →',
      href: '/dashboard/ghg',
    },
  },
  {
    id: 'risk',
    name: 'Climate Risk',
    description: 'SB 261 · TCFD · IFRS S2 · ESRS E1 · CDP (P-series) · SASB · scenario analysis · physical & transition risk',
    tags: [{ label: 'SB 261 · Jan 2026', color: 'orange' }],
    cta: {
      headline: 'Ready to assess your climate risk?',
      sub: 'Physical and transition risk quantified. TCFD and SB 261 ready.',
      btn: 'Assess your climate risk →',
      href: '/dashboard/ghg',
    },
  },
  {
    id: 'supply',
    name: 'Supply Chain',
    description: 'Supplier portal · EcoVadis (Environment, Labour & Human Rights, Ethics, Procurement) · CDP C12 · EU CS3D · ESRS S2+G1 · Modern Slavery Act · GRI 308/414 · UN Guiding Principles · feeds Scope 3 Cat.1 in the GHG module',
    tags: [
      { label: 'Supplier Portal', color: 'purple' },
      { label: 'CS3D · 2027', color: 'orange' },
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
    description: 'IFRS S2 / TCFD · SB 253 M&A liability · SFDR Art.8/9 · ILPA ESG template · SBTi (portfolio) · IFC Performance Standards',
    tags: [{ label: 'LP / investor', color: 'purple' }],
    cta: {
      headline: 'Ready to quantify your M&A exposure?',
      sub: 'Climate diligence in days. SB 253 liability assessed before you sign.',
      btn: 'Assess your M&A exposure →',
      href: '/deals',
    },
  },
  {
    id: 'ai',
    name: 'AI Governance',
    description: 'EU AI Act · NIST AI RMF · ISO 42001 · GDPR Art.22 · Bill C-27 AIDA · SR 11-7 (Fed Reserve)',
    tags: [{ label: 'EU AI Act · Aug 2', color: 'orange' }],
    cta: {
      headline: 'Do you know which of your AI systems are high-risk?',
      sub: 'EU AI Act deadline is August 2. Start your inventory today.',
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

const GRAD = 'linear-gradient(135deg, #7425e3, #1fb1ff, #64fe3e)'

const TAG_STYLES: Record<string, React.CSSProperties> = {
  blue:   { background: '#E6F1FB', color: '#0C447C', border: '1px solid #bfdbfe' },
  green:  { background: '#E1F5EE', color: '#0F6E56', border: '1px solid #bbf7d0' },
  orange: { background: '#FEF3E2', color: '#92400e', border: '1px solid #fde68a' },
  purple: { background: 'rgba(116,37,227,0.08)', color: '#7425e3', border: '1px solid rgba(116,37,227,0.2)' },
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
  const VALID_MODULE_IDS: ModuleId[] = ['ghg', 'risk', 'supply', 'people', 'deals', 'ai', 'cyber']
  const initialModules = (() => {
    const param = searchParams.get('modules')
    if (!param) return new Set<ModuleId>(['ghg'])
    const ids = param.split(',').map(s => s.trim()).filter((s): s is ModuleId => (VALID_MODULE_IDS as string[]).includes(s))
    return ids.length > 0 ? new Set<ModuleId>(ids) : new Set<ModuleId>(['ghg'])
  })()
  const [tier, setTier] = useState<Tier>('starter')
  const [selected, setSelected] = useState<Set<ModuleId>>(initialModules)
  const [daysLeft, setDaysLeft] = useState(81)
  // Add-on selection state
  const [conciergeOn, setConciergeOn] = useState(false)
  const [conciergeLocations, setConciergeLocations] = useState(1)
  const [verificationOn, setVerificationOn] = useState(false)

  useEffect(() => {
    const deadline = new Date('2026-08-10')
    const today = new Date()
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    setDaysLeft(Math.max(0, diff))
  }, [])

  // Pricing logic
  const unitPrice = tierPrice(tier)
  const count = selected.size
  const gross = count * unitPrice
  const discount = volumeDiscount(count)
  const net = Math.round(gross * (1 - discount))
  // Add-on logic. Concierge tier is resolved from the location count; Verification
  // is only available once Concierge is added (mirrors the server dependency rule).
  const ghgSelected = selected.has('ghg')
  const conciergeResolved = conciergeTierForLocations(conciergeLocations)
  const conciergeActive = ghgSelected && conciergeOn
  const verificationActive = conciergeActive && verificationOn && !conciergeResolved.isCustomQuote
  const selectedAddOns: AddOnKey[] = [
    ...(conciergeActive && !conciergeResolved.isCustomQuote ? [conciergeResolved.key] : []),
    ...(verificationActive ? ['verification' as AddOnKey] : []),
  ]
  const addOnsTotal =
    (conciergeActive && !conciergeResolved.isCustomQuote ? ADDONS[conciergeResolved.key].price : 0) +
    (verificationActive ? ADDONS.verification.price : 0)
  // Grand total shown in the panel/CTA = modules + add-ons (matches Stripe).
  const totalNet = net + addOnsTotal
  const handleBuy = () => {
    const moduleKeys = Array.from(selected).map((id) => LEGACY_PRICING_PAGE_ID[id]).filter(Boolean)
    if (moduleKeys.length === 0) return
    startCheckout({ tier, moduleKeys, ...(selectedAddOns.length > 0 ? { addOns: selectedAddOns } : {}) })
  }

  // ── NEW-MODEL pricing (behind NEW_PRICING_ACTIVE) — DISPLAY ONLY. The module
  // total comes solely from the shared cartQuote(), so the preview equals exactly
  // what the server charges. handleBuy still sends { tier, moduleKeys, addOns }.
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
  const selectAllSeven = () => {
    setSelected(new Set<ModuleId>(MODULES.map((m) => m.id)))
    setTier('professional') // hero advertises $24,900 = all-7 at GHG Professional
  }

  // Consent modal (new-model self-serve B2B checkout) — gates the Buy-now button.
  const [consentOpen, setConsentOpen] = useState(false)
  const [bizName, setBizName] = useState('')
  const [bizReg, setBizReg] = useState('')
  const [purchaserName, setPurchaserName] = useState('')
  const [cBiz, setCBiz] = useState(false)
  const [cAccess, setCAccess] = useState(false)
  const [cData, setCData] = useState(false)
  const consentReady = !!bizName.trim() && !!bizReg.trim() && !!purchaserName.trim() && cBiz && cAccess && cData
  const submitConsentAndPay = () => {
    if (!consentReady) return
    const moduleKeys = Array.from(selected).map((id) => LEGACY_PRICING_PAGE_ID[id]).filter(Boolean)
    if (moduleKeys.length === 0) return
    startCheckout({
      tier,
      moduleKeys,
      ...(selectedAddOns.length > 0 ? { addOns: selectedAddOns } : {}),
      business: { name: bizName.trim(), regNumber: bizReg.trim() },
      purchaser: { name: purchaserName.trim() },
      consent: { businessCapacity: cBiz, digitalAccess: cAccess, dataAuthority: cData, atISO: new Date().toISOString(), version: '2026-06-v2-final' },
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
      sub: 'One inventory. Every framework. Specialists who speak your language.',
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
    heroLabel: { display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#7425e3', border: '1px solid rgba(116,37,227,0.2)', borderRadius: 99, padding: '4px 14px', marginBottom: 14 },
    heroTitle: { fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 400, color: '#0d0d0d', lineHeight: 1.3, marginBottom: 12 },
    heroSub: { fontSize: 13, color: '#555553', fontWeight: 300, maxWidth: 520, margin: '0 auto', lineHeight: 1.8 },
    // Prompt
    promptWrap: { borderRadius: 12, padding: 1, marginBottom: 20, background: GRAD },
    promptInner: { background: '#fff', borderRadius: 11, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 },
    promptDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: GRAD },
    // Credibility bar
    credBar: { background: '#f8f7f5', padding: '1rem 1.5rem', marginBottom: 28, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, border: '1px solid #e8e7e4', borderRadius: '0 0 12px 12px' },
    credItem: { textAlign: 'center' as const },
    credLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 4 },
    credVal: { fontSize: 10, color: '#374151', lineHeight: 1.6 },
    // Tier cards
    tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12, marginBottom: 24 },
    // Module rows
    moduleWrap: { border: '1px solid #e8e7e4', borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
    moduleHeader: { display: 'grid', gridTemplateColumns: '1fr auto', background: '#f8f7f5', padding: '10px 16px', borderBottom: '1px solid #e8e7e4', alignItems: 'center' },
    // Price panel
    pricePanel: { background: '#0d0d0d', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: 16 },
    pricePanelInner: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' },
    // Bundle hints
    hintGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8, marginBottom: 20 },
    // CTA
    ctaWrap: { background: '#fff', border: '1px solid #e8e7e4', borderRadius: 14, padding: '1.75rem', textAlign: 'center' as const },
    ctaPara: { fontSize: 13, color: '#555553', fontWeight: 300, maxWidth: 500, margin: '0 auto 14px', lineHeight: 1.8 },
    ctaHeadline: { fontFamily: 'Georgia, serif', fontSize: 18, fontWeight: 400, color: '#0d0d0d', marginBottom: 4 },
    ctaSub: { fontSize: 11, color: '#888784', marginBottom: 18 },
    ctaBtns: { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' as const },
  }

  const gradText: React.CSSProperties = {
    background: GRAD,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  }

  const tierCard = (t: Tier, active: boolean): React.CSSProperties => ({
    border: active ? '2px solid #7425e3' : '1px solid #e8e7e4',
    borderRadius: 12,
    padding: '1rem',
    textAlign: 'center',
    cursor: 'pointer',
    background: active ? '#fff' : '#f8f7f5',
    transition: 'all 0.15s',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  })

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
    border: `1.5px solid ${active ? '#7425e3' : '#e8e7e4'}`,
    background: active ? '#7425e3' : '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  })

  const hintCard = (activeBundle: string, label: string): React.CSSProperties => {
    const isActive =
      (label === 'Core' && activeBundle === 'core') ||
      (label === 'Growth' && activeBundle === 'growth') ||
      (label === 'Platform' && activeBundle === 'platform')
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
    color: '#0d0d0d',
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
  const consentLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', display: 'block', marginBottom: 4, marginTop: 12 }
  const consentInput: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '1px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }
  const consentCheckRow: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }
  const consentCheckText: React.CSSProperties = { fontSize: 12, color: '#555553', lineHeight: 1.6 }
  const consentLink: React.CSSProperties = { color: '#7425e3', textDecoration: 'underline' }

  return (
    <div style={s.page}>

      {/* Nav */}
      <nav style={s.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/dashboard">
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
          </Link>
          <span style={{ fontSize: 12, color: '#888784' }}>/ Pricing</span>
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
            One platform. Seven compliance domains.<br />
            <span style={gradText}>Expert-grade, priced for every business.</span>
          </div>
          <p style={s.heroSub}>
            Whether your driver is a regulator, a board, an investor, or a customer — ThemisIQ is your sustainability compliance reporting solution.
          </p>
        </div>

        {/* Interactive prompt */}
        <div style={s.promptWrap}>
          <div style={s.promptInner}>
            <div style={{ ...s.promptDot, animation: 'pulse 2s ease-in-out infinite' }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>This pricing tool is interactive — </span>
              <span style={{ fontSize: 12, color: '#555553', fontWeight: 300 }}>explore the tiers below, then select the compliance modules your business needs. Your total updates instantly with bundle discounts applied automatically.</span>
            </div>
          </div>
        </div>

        {/* Credibility bar */}
        <div style={s.credBar}>
          {[
            { label: 'Methodology', val: 'EPA 2024 · IPCC AR4+AR5 · ISO 14064-3 · GHG Protocol' },
            { label: 'Frameworks', val: 'SB 253 · CDP · ESRS E1 · GRI 305 · IFRS S2 · EcoVadis' },
            { label: 'Built by', val: 'Practitioners with Big 4 & climate consulting experience' },
            { label: 'Next Reporting Deadline', val: `SB 253 · Aug 10, 2026 · ${daysLeft} days`, red: true },
          ].map((item, i) => (
            <div key={i} style={{ ...s.credItem, ...(i > 0 ? { borderLeft: '1px solid #e8e7e4', paddingLeft: 12 } : {}) }}>
              <div style={s.credLabel}>{item.label}</div>
              <div style={{ ...s.credVal, ...((item as any).red ? { color: '#B91C1C', fontWeight: 600 } : {}) }}>{item.val}</div>
            </div>
          ))}
        </div>

        {/* Section title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Simple, honest pricing</div>
          <div style={{ fontSize: 12, color: '#555553', fontWeight: 300 }}>Start with one module. Build your compliance platform as you grow.</div>
        </div>

        {/* Full Platform hero (NEW model) */}
        {NEW_PRICING_ACTIVE && (
          <div style={{ background: GRAD, borderRadius: 14, padding: 1, marginBottom: 24 }}>
            <div style={{ background: '#0d0d0d', borderRadius: 13, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64fe3e', marginBottom: 4 }}>Most popular</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#fff' }}>All 7 modules — Full Platform</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>Every compliance domain. Best all-in price (GHG Professional).</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...gradText, fontSize: 30, fontWeight: 700, lineHeight: 1 }}>${FULL_PLATFORM_PRICE.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>/year</div>
                <button onClick={selectAllSeven} style={{ ...primaryBtn, fontSize: 12 }}>Select all 7 →</button>
              </div>
            </div>
          </div>
        )}

        {/* Tier cards (OLD model) */}
        {!NEW_PRICING_ACTIVE && (
        <div style={s.tierGrid}>

          {/* Starter */}
          <div style={tierCard('starter', tier === 'starter')} onClick={() => setTier('starter')}>
            {tier === 'starter' && (
              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)' }}>
                <span style={{ background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</span>
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 6 }}>Starter</div>
            <div style={{ fontSize: 10, color: '#888784', textDecoration: 'line-through' }}>${tierStrikethrough('starter')?.toLocaleString()}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#0d0d0d' }}>${tierPrice('starter').toLocaleString()}<span style={{ fontSize: 10, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#92400e', background: '#FEF3E2', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>Early access</div>
            <div style={{ borderTop: `1px solid ${'#f3f4f6'}`, paddingTop: 12, marginTop: 12, textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>Core reports for each module you select</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#0F6E56', flexShrink: 0 }}>✓</span>Core reporting frameworks</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#0F6E56', flexShrink: 0 }}>✓</span>Assurance-ready workings</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#0F6E56', flexShrink: 0 }}>✓</span>Audit trail — every entry logged</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#0F6E56', flexShrink: 0 }}>✓</span>ThemisIQ Wizard — always on</div>
            </div>
          </div>

          {/* Professional */}
          <div style={{ ...tierCard('professional', tier === 'professional'), background: tier === 'professional' ? '#0d0d0d' : '#f8f7f5' }} onClick={() => setTier('professional')}>
            {tier === 'professional' && (
              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)' }}>
                <span style={{ background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</span>
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: tier === 'professional' ? '#7425e3' : '#7425e3', marginBottom: 6 }}>Professional</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: tier === 'professional' ? '#fff' : '#0d0d0d' }}>${tierPrice('professional').toLocaleString()}<span style={{ fontSize: 10, color: tier === 'professional' ? 'rgba(255,255,255,0.4)' : '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(116,37,227,0.15)', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>All frameworks</div>
            <div style={{ borderTop: `1px solid ${tier === 'professional' ? 'rgba(255,255,255,0.08)' : '#f3f4f6'}`, paddingTop: 12, marginTop: 12, textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: 11, color: tier === 'professional' ? 'rgba(255,255,255,0.45)' : '#888784', marginBottom: 8 }}>All frameworks for your selected modules</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: tier === 'professional' ? '#fff' : '#374151', marginBottom: 5 }}><span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>Everything in Starter</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: tier === 'professional' ? '#fff' : '#374151', marginBottom: 5 }}><span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>All reporting frameworks</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: tier === 'professional' ? '#fff' : '#374151', marginBottom: 5 }}><span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>Multi-organization — up to 5 organizations</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: tier === 'professional' ? '#fff' : '#374151', marginBottom: 5 }}><span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>Verifier & third-party access role</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: tier === 'professional' ? '#fff' : '#374151', marginBottom: 5 }}><span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>Regulatory monitor — weekly alerts</div>
            </div>
          </div>

          {/* Advisory */}
          <div style={{ ...tierCard('advisory', tier === 'advisory'), border: tier === 'advisory' ? '2px solid #1fb1ff' : '1px solid #e8e7e4' }} onClick={() => setTier('advisory')}>
            {tier === 'advisory' && (
              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)' }}>
                <span style={{ background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</span>
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1fb1ff', marginBottom: 6 }}>Advisory</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#0d0d0d' }}>${tierPrice('advisory').toLocaleString()}<span style={{ fontSize: 10, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#0C447C', background: '#E6F1FB', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>+ Expert guidance</div>
            <div style={{ borderTop: `1px solid ${'#f3f4f6'}`, paddingTop: 12, marginTop: 12, textAlign: 'left', flex: 1 }}>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>Platform + dedicated expert guidance</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>Everything in Professional</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>Up to 10 organizations</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>Onboarding session</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>Guided inventory review</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>Sector-specific guidance</div>
              <div style={{ display: 'flex', gap: 7, fontSize: 11, color: '#374151', marginBottom: 5 }}><span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>Board-ready narrative</div>
            </div>
          </div>

        </div>
        )}

        {/* Module selector (OLD model) */}
        {!NEW_PRICING_ACTIVE && (
        <div style={s.moduleWrap}>
          <div style={s.moduleHeader}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784' }}>Select your compliance modules</div>
            <div style={{ fontSize: 10, color: '#888784', fontWeight: 300 }}>Click any row to add or remove</div>
          </div>

          {MODULES.map((mod, i) => {
            const isSelected = selected.has(mod.id)
            const isLast = i === MODULES.length - 1
            return (
              <div
                key={mod.id}
                style={{ ...moduleRow(isSelected), ...(isLast ? { borderBottom: 'none' } : {}) }}
                onClick={() => toggleModule(mod.id)}
              >
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#0d0d0d' : '#888784' }}>
                    ${tierPrice(tier).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: '#888784' }}>/yr</div>
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* Module selector (NEW model) — per-module pricing, GHG inline tier picker */}
        {NEW_PRICING_ACTIVE && (
          <div style={s.moduleWrap}>
            <div style={s.moduleHeader}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784' }}>Select your compliance modules</div>
              <div style={{ fontSize: 10, color: '#888784', fontWeight: 300 }}>Click any row to add or remove</div>
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
                      <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#0d0d0d' : '#888784' }}>
                        {isGhg
                          ? `from $${(GHG_TIERS.starter.priceUSD as number).toLocaleString()}`
                          : `$${(price as number).toLocaleString()}`}
                      </div>
                      <div style={{ fontSize: 10, color: '#888784' }}>/yr</div>
                    </div>
                  </div>
                  {/* GHG inline tier picker — only when GHG is selected */}
                  {isGhg && isSelected && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                      {(['starter', 'professional', 'advisory'] as GhgTier[]).map(t => {
                        const tp = GHG_TIERS[t].priceUSD
                        const label = t === 'starter' ? 'Essentials' : t === 'professional' ? 'Professional' : 'Advisory'
                        const cap = t === 'starter' ? '≤3 locations' : t === 'professional' ? '≤15 locations' : 'unlimited'
                        const active = tier === t
                        return (
                          <button key={t} onClick={(e) => { e.stopPropagation(); setTier(t) }} style={{ flex: 1, minWidth: 130, textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: active ? '#0d0d0d' : '#fff', color: active ? '#fff' : '#0d0d0d', border: active ? '2px solid #7425e3' : '1px solid #e8e7e4' }}>
                            <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
                            <div style={{ fontSize: 12, marginTop: 2 }}>{tp == null ? 'Contact us' : `$${tp.toLocaleString()}/yr`}</div>
                            <div style={{ fontSize: 9, color: active ? 'rgba(255,255,255,0.5)' : '#888784', marginTop: 2 }}>{cap}</div>
                          </button>
                        )
                      })}
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
            <div style={{ fontSize: 11, color: '#888784', marginBottom: 16 }}>Optional add-ons. We do the bill-reading; you confirm the numbers.</div>

            {/* Concierge */}
            <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: conciergeOn ? '2px solid #7425e3' : '1px solid #e8e7e4', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>Concierge — we read your bills</div>
                  <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6, marginTop: 2 }}>Upload utility bills; ThemisIQ extracts the figures with source quotes for you to confirm. Priced by number of locations.</div>
                </div>
                <button onClick={() => setConciergeOn(v => !v)} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: conciergeOn ? '#7425e3' : '#0d0d0d', color: '#fff' }}>{conciergeOn ? 'Added ✓' : 'Add'}</button>
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
                    <a href="mailto:lisa.foster@themisiq.co?subject=Concierge%20Enterprise%20quote" style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', textDecoration: 'none' }}>Request a quote →</a>
                  )}
                </div>
              )}
            </div>

            {/* Verification — locked until Concierge added */}
            <div style={{ padding: 14, background: '#fff', borderRadius: 10, border: verificationActive ? '2px solid #7425e3' : '1px solid #e8e7e4', opacity: conciergeActive && !conciergeResolved.isCustomQuote ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>Verification Readiness · $499/yr</div>
                  <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6, marginTop: 2 }}>Assurance-ready package built on your Concierge-reviewed data.</div>
                </div>
                {conciergeActive && !conciergeResolved.isCustomQuote ? (
                  <button onClick={() => setVerificationOn(v => !v)} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: verificationOn ? '#7425e3' : '#0d0d0d', color: '#fff' }}>{verificationOn ? 'Added ✓' : 'Add'}</button>
                ) : (
                  <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#888784', padding: '6px 10px', background: '#f0efed', borderRadius: 8 }}>🔒 Requires Concierge</span>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Live price panel (OLD model) */}
        {!NEW_PRICING_ACTIVE && (
        <div style={s.pricePanel}>
          <div style={s.pricePanelInner}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                Your platform — live estimate
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: 8 }}>
                {MODULES.filter(m => selected.has(m.id)).map(m => m.name).join('\n').split('\n').map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
              {selectedAddOns.length > 0 && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  {selectedAddOns.map(k => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span>{ADDONS[k].label}</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>+${ADDONS[k].price.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  {count} module{count !== 1 ? 's' : ''} selected
                </div>
                {discount > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(100,254,62,0.15)', color: '#64fe3e', border: '1px solid rgba(100,254,62,0.3)' }}>
                    {discount * 100}% bundle discount applied
                  </div>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {discount > 0 && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>
                  ${(gross + addOnsTotal).toLocaleString()}
                </div>
              )}
              <div style={{ ...gradText, fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
                ${totalNet.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>/year</div>
            </div>
          </div>
        </div>
        )}

        {/* Live price panel (NEW model) */}
        {NEW_PRICING_ACTIVE && (
          <div style={s.pricePanel}>
            <div style={s.pricePanelInner}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Your platform — live estimate</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: 8 }}>
                  {MODULES.filter(m => selected.has(m.id)).map(m => <div key={m.id}>{m.name}</div>)}
                </div>
                {selectedAddOns.length > 0 && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    {selectedAddOns.map(k => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <span>{ADDONS[k].label}</span>
                        <span style={{ color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>+${ADDONS[k].price.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{count} module{count !== 1 ? 's' : ''} selected</div>
                  {volumeDiscount(count) > 0 && !quote.requiresQuote && (
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(100,254,62,0.15)', color: '#64fe3e', border: '1px solid rgba(100,254,62,0.3)' }}>
                      {volumeDiscount(count) * 100}% bundle discount applied
                    </div>
                  )}
                  {quote.requiresInvoice && (
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(31,177,255,0.15)', color: '#1fb1ff', border: '1px solid rgba(31,177,255,0.3)' }}>
                      Over $10k — completed by invoice
                    </div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {quote.requiresQuote ? (
                  <div style={{ ...gradText, fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>Contact us</div>
                ) : (
                  <>
                    <div style={{ ...gradText, fontSize: 36, fontWeight: 700, lineHeight: 1 }}>${newGrandTotal.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>/year</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bundle hints */}
        <div style={s.hintGrid}>
          {[
            { label: 'Core', sub: '1 module · full price' },
            { label: 'Growth', sub: '2 modules · 10% off' },
            { label: 'Platform', sub: '3+ modules · 20% off' },
          ].map(h => {
            const isActive =
              (h.label === 'Core' && activeBundle === 'core') ||
              (h.label === 'Growth' && activeBundle === 'growth') ||
              (h.label === 'Platform' && activeBundle === 'platform')
            return (
              <div key={h.label} style={hintCard(activeBundle, h.label)}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? '#0d0d0d' : '#888784' }}>{h.label}</div>
                <div style={{ fontSize: 10, color: '#888784', marginTop: 2 }}>{h.sub}</div>
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
            {NEW_PRICING_ACTIVE ? (
              quote.requiresQuote ? (
                <Link href={advisoryHref} style={primaryBtn}>Talk to a specialist →</Link>
              ) : quote.requiresInvoice ? (
                <Link href={advisoryHref} style={primaryBtn}>Request an invoice →</Link>
              ) : (
                <button onClick={() => setConsentOpen(true)} style={primaryBtn}>Buy now — ${newGrandTotal.toLocaleString()}/yr →</button>
              )
            ) : (
              tier !== 'advisory' && (
              <button onClick={handleBuy} style={primaryBtn}>
                Buy now — ${totalNet.toLocaleString()}/yr →
              </button>
            )
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
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#0d0d0d', marginBottom: 4 }}>Confirm your purchase</div>
            <div style={{ fontSize: 12, color: '#888784', marginBottom: 8 }}>ThemisIQ sells to businesses only. Please confirm the details below to continue to secure payment.</div>
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
              <button onClick={() => setConsentOpen(false)} style={ghostBtn}>Cancel</button>
              <button onClick={submitConsentAndPay} disabled={!consentReady} style={{ ...primaryBtn, opacity: consentReady ? 1 : 0.4, cursor: consentReady ? 'pointer' : 'not-allowed' }}>Continue to payment →</button>
            </div>
          </div>
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
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: '#888784' }}>Loading…</div>}>
      <PricingPageInner />
    </Suspense>
  )
}