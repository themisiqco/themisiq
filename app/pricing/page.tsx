'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tier = 'starter' | 'professional' | 'advisory'
type ModuleId = 'ghg' | 'risk' | 'supply' | 'people' | 'deals' | 'ai' | 'cyber'

interface Module {
  id: ModuleId
  name: string
  description: string
  tags: { label: string; color: 'blue' | 'green' | 'orange' | 'purple' }[]
  cta: { headline: string; sub: string; btn: string; href: string }
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const PRICES: Record<Tier, number> = {
  starter: 999,
  professional: 2499,
  advisory: 4999,
}

const FULL_PRICE = 1499 // Starter full price before early access

const TIER_FEATURES: Record<Tier, { title: string; sub: string; features: string[] }> = {
  starter: {
    title: 'Starter',
    sub: 'Core reports for each module you select',
    features: [
      'Core reporting frameworks for your selected modules',
      'Assurance-ready calculation workings',
      'Audit trail — every entry logged',
      'Data export (CSV)',
      '1 entity · 3 users',
      'ThemisIQ Wizard — always on',
    ],
  },
  professional: {
    title: 'Professional',
    sub: 'All frameworks — one inventory, every report',
    features: [
      'Everything in Starter',
      'All reporting frameworks for your selected modules',
      'Multi-entity support (10 entities · 10 users)',
      'Verifier & third-party access role',
      'Advanced disclosure outputs',
      'Regulatory monitor — weekly deadline alerts',
      'Priority support',
    ],
  },
  advisory: {
    title: 'Advisory',
    sub: 'Platform + dedicated expert guidance',
    features: [
      'Everything in Professional',
      'Onboarding session',
      'Guided inventory review',
      'Sector-specific guidance',
      'Assurance prep support',
      'Board-ready narrative',
      'Dedicated consultant',
    ],
  },
}

const MODULES: Module[] = [
  {
    id: 'ghg',
    name: 'Climate — GHG Inventory · Scope 1 & 2',
    description: 'Scope 1 & 2 · SB 253 · CDP · ESRS E1 · GRI 305 · IFRS S2 · EcoVadis · GHG Protocol · SBTi · RE100',
    tags: [
      { label: 'Scope 1 & 2', color: 'blue' },
      { label: 'Live now', color: 'green' },
      { label: 'SB 253 · Aug 10', color: 'orange' },
    ],
    cta: {
      headline: 'Ready to see your emissions?',
      sub: 'Your SB 253 Scope 1 & 2 inventory can be complete in days — not months.',
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
    name: 'Supply Chain & Scope 3',
    description: 'Scope 3 · EcoVadis (Environment, Labour & Human Rights, Ethics, Procurement) · CDP C12 · EU CS3D · ESRS S2+G1 · Modern Slavery Act · GRI 308/414 · UN Guiding Principles · supplier portal',
    tags: [
      { label: 'Scope 3', color: 'purple' },
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

export default function PricingPage() {
  const [tier, setTier] = useState<Tier>('starter')
  const [selected, setSelected] = useState<Set<ModuleId>>(new Set(['ghg']))
  const [daysLeft, setDaysLeft] = useState(81)

  useEffect(() => {
    const deadline = new Date('2026-08-10')
    const today = new Date()
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    setDaysLeft(Math.max(0, diff))
  }, [])

  // Pricing logic
  const unitPrice = PRICES[tier]
  const count = selected.size
  const gross = count * unitPrice
  const discount = count >= 3 ? 0.15 : count >= 2 ? 0.10 : 0
  const net = Math.round(gross * (1 - discount))

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
      sub: 'Countless compliance requirements. One Intelligent Platform — built by specialists who speak your language.',
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

        {/* Credibility bar */}
        <div style={s.credBar}>
          <div style={s.credItem}>
            <div style={s.credLabel}>Platform</div>
            <div style={s.credVal}>7 compliance domains · one platform · one inventory</div>
          </div>
          <div style={{ ...s.credItem, borderLeft: '1px solid #e8e7e4', paddingLeft: 12 }}>
            <div style={s.credLabel}>Frameworks</div>
            <div style={s.credVal}>30+ frameworks · mandatory & voluntary · global coverage</div>
          </div>
          <div style={{ ...s.credItem, borderLeft: '1px solid #e8e7e4', paddingLeft: 12 }}>
            <div style={s.credLabel}>Built by</div>
            <div style={s.credVal}>Practitioners with Big 4 & sustainability consulting experience</div>
          </div>
          <div style={{ ...s.credItem, borderLeft: '1px solid #e8e7e4', paddingLeft: 12 }}>
            <div style={s.credLabel}>Upcoming Deadlines</div>
            <div style={{ fontSize: 10, lineHeight: 1.7 }}>
              <span style={{ color: '#B91C1C', fontWeight: 600 }}>SB 253 · Aug 10</span>
              <span style={{ color: '#888784' }}> · </span>
              <span style={{ color: '#B91C1C', fontWeight: 600 }}>EU AI Act · Aug 2</span>
              <span style={{ color: '#888784' }}> · </span>
              <span style={{ color: '#B91C1C', fontWeight: 600 }}>EU Pay · Jun 2026</span>
            </div>
          </div>
        </div>

        {/* Section title */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Simple, honest pricing</div>
          <div style={{ fontSize: 12, color: '#555553', fontWeight: 300 }}>Start with one module. Build your compliance platform as you grow.</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, fontWeight: 300 }}>All prices in USD</div>
        </div>

        {/* Interactive prompt — sits above tier cards */}
        <div style={s.promptWrap}>
          <div style={s.promptInner}>
            <div style={{ ...s.promptDot, animation: 'pulse 2s ease-in-out infinite' }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>This pricing tool is interactive — </span>
              <span style={{ fontSize: 12, color: '#555553', fontWeight: 300 }}>click a tier card to select your level, then click any module below to add it to your platform. Your total updates instantly with bundle discounts applied automatically.</span>
            </div>
          </div>
        </div>

        {/* Tier cards */}
        <div style={s.tierGrid}>

          {/* Starter */}
          <div style={tierCard('starter', tier === 'starter')} onClick={() => setTier('starter')}>
            {tier === 'starter' && (
              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)' }}>
                <span style={{ background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</span>
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 6 }}>Starter</div>
            <div style={{ fontSize: 10, color: '#888784', textDecoration: 'line-through' }}>${FULL_PRICE.toLocaleString()}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#0d0d0d' }}>$999<span style={{ fontSize: 10, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#92400e', background: '#FEF3E2', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginTop: 4, marginBottom: 14 }}>Early access</div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: '#888784', marginBottom: 8 }}>{TIER_FEATURES.starter.sub}</div>
              {TIER_FEATURES.starter.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 11, color: '#374151', marginBottom: 5 }}>
                  <span style={{ color: '#0F6E56', flexShrink: 0, fontSize: 10, marginTop: 1 }}>✓</span>{f}
                </div>
              ))}
            </div>
          </div>

          {/* Professional */}
          <div style={{ ...tierCard('professional', tier === 'professional'), background: tier === 'professional' ? '#0d0d0d' : '#f8f7f5' }} onClick={() => setTier('professional')}>
            {tier === 'professional' && (
              <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)' }}>
                <span style={{ background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</span>
              </div>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 6 }}>Professional</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: tier === 'professional' ? '#fff' : '#0d0d0d' }}>$2,999<span style={{ fontSize: 10, color: tier === 'professional' ? 'rgba(255,255,255,0.4)' : '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(116,37,227,0.15)', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginTop: 4, marginBottom: 14 }}>All frameworks</div>
            <div style={{ borderTop: `1px solid ${tier === 'professional' ? 'rgba(255,255,255,0.08)' : '#f3f4f6'}`, paddingTop: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: tier === 'professional' ? 'rgba(255,255,255,0.4)' : '#888784', marginBottom: 8 }}>{TIER_FEATURES.professional.sub}</div>
              {TIER_FEATURES.professional.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 11, color: tier === 'professional' ? (i === 0 ? 'rgba(255,255,255,0.45)' : '#fff') : '#374151', marginBottom: 5 }}>
                  <span style={{ color: '#64fe3e', flexShrink: 0, fontSize: 10, marginTop: 1 }}>✓</span>{f}
                </div>
              ))}
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
            <div style={{ fontSize: 22, fontWeight: 600, color: '#0d0d0d' }}>$7,999<span style={{ fontSize: 10, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#0C447C', background: '#E6F1FB', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginTop: 4, marginBottom: 14 }}>+ Expert guidance</div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, textAlign: 'left' }}>
              <div style={{ fontSize: 10, color: '#888784', marginBottom: 8 }}>{TIER_FEATURES.advisory.sub}</div>
              {TIER_FEATURES.advisory.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 11, color: '#374151', marginBottom: 5 }}>
                  <span style={{ color: '#1fb1ff', flexShrink: 0, fontSize: 10, marginTop: 1 }}>✓</span>{f}
                </div>
              ))}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f3f4f6' }}>
                <div style={{ fontSize: 10, color: '#888784', lineHeight: 1.6 }}>
                  Advisory clients are invoiced directly. Prefer to pay by card? We accept all major credit cards and ACH bank transfer.
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Module selector */}
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
                    <Link href={mod.cta.href} style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>
                      {mod.name} ↗
                    </Link>
                    {mod.tags.map(t => (
                      <span key={t.label} style={tag(t.label, t.color)}>{t.label}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6 }}>{mod.description}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#0d0d0d' : '#888784' }}>
                    ${PRICES[tier].toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: '#888784' }}>/yr</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Live price panel */}
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
                  ${gross.toLocaleString()}
                </div>
              )}
              <div style={{ ...gradText, fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
                ${net.toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>/year</div>
            </div>
          </div>
        </div>

        {/* Bundle hints */}
        <div style={s.hintGrid}>
          {[
            { label: 'Core', sub: '1 module · full price' },
            { label: 'Growth', sub: '2 modules · 10% off' },
            { label: 'Platform', sub: '3+ modules · 15% off' },
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
        {/* Starter Packs */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>Not sure where to start?</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Starter packs — built for who's asking</div>
            <div style={{ fontSize: 14, color: '#888784', maxWidth: 540, margin: '0 auto' }}>Whether it's a customer, your bank, your board or your investor — we've bundled exactly what you need to respond with confidence.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[
              {
                name: 'Supplier Readiness Pack',
                driver: 'A customer is asking you',
                price: '$1,999',
                color: '#0F6E56',
                bg: '#E1F5EE',
                modules: ['GHG Inventory — Scope 1 & 2', 'Supply Chain risk register', 'Supplier questionnaire template'],
                pitch: 'Your customer sent you a sustainability questionnaire. This gets you ready to respond — and keeps you ready for the next one.',
                cta: '/dashboard/ghg',
                ctaLabel: 'Start now →',
              },
              {
                name: 'Climate Readiness Pack',
                driver: 'Your bank or insurer is asking',
                price: '$1,999',
                color: '#0C447C',
                bg: '#E6F1FB',
                modules: ['GHG Inventory — Scope 1 & 2', 'Climate Risk — physical & transition', 'TCFD / IFRS S2 aligned output'],
                pitch: 'Your bank wants your climate data. This gives you your emissions baseline and climate risk exposure — the two things they always ask for.',
                cta: '/dashboard/ghg',
                ctaLabel: 'Start now →',
              },
              {
                name: 'ESG Foundation Pack',
                driver: 'Your board wants it',
                price: '$2,999',
                color: '#7425e3',
                bg: '#EDE9FE',
                modules: ['GHG Inventory — Scope 1 & 2', 'People & Workforce — pay gap & safety', 'Climate Risk — physical & transition'],
                pitch: 'The three things every board asks about — emissions, people, and climate risk. One platform, one annual price.',
                cta: '/pricing',
                ctaLabel: 'Build your pack →',
              },
              {
                name: 'Investor ESG Pack',
                driver: 'Your investor or PE firm requires it',
                price: '$3,999',
                color: '#B91C1C',
                bg: '#FCEBEB',
                modules: ['GHG Inventory — Scope 1 & 2', 'Climate Risk — scenario analysis', 'Supply Chain risk register', 'Deals & Investment — ESG diligence'],
                pitch: 'Everything your PE firm or LP will ask for in their annual ESG questionnaire — in one platform.',
                cta: '/pricing',
                ctaLabel: 'Build your pack →',
              },
            ].map(pack => (
              <div key={pack.name} style={{ border: `1.5px solid ${pack.color}30`, borderRadius: 16, overflow: 'hidden', background: '#fff' }}>
                <div style={{ background: pack.bg, padding: '1.25rem 1.5rem', borderBottom: `1px solid ${pack.color}20` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: pack.color, marginBottom: 4 }}>{pack.driver}</div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 2 }}>{pack.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color: pack.color }}>{pack.price}</span>
                    <span style={{ fontSize: 12, color: '#888784' }}>/yr · USD</span>
                  </div>
                </div>
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, marginBottom: 16 }}>{pack.pitch}</div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 16 }}>
                    {pack.modules.map(m => (
                      <div key={m} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span style={{ color: pack.color, flexShrink: 0, marginTop: 1 }}>✓</span>
                        <span style={{ fontSize: 13, color: '#374151' }}>{m}</span>
                      </div>
                    ))}
                  </div>
                  <a href={pack.cta} style={{ display: 'inline-block', padding: '9px 20px', borderRadius: 8, background: pack.color, color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>{pack.ctaLabel}</a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Dynamic closing CTA */}
        <div style={s.ctaWrap}>
          <p style={s.ctaPara}>
            For many companies, we understand that emerging reporting requirements — and the pricing from other platforms and traditional consulting firms — are overwhelming. ThemisIQ offers a better way.
          </p>
          <div style={s.ctaHeadline}>{cta.headline}</div>
          <div style={s.ctaSub}>{cta.sub}</div>
          <div style={s.ctaBtns}>
            {cta.buttons.map((btn, i) => (
              <Link key={i} href={btn.href} style={btn.primary ? primaryBtn : ghostBtn}>
                {btn.label}
              </Link>
            ))}
          </div>
        </div>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

    </div>
  )
}
