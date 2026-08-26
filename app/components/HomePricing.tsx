'use client'

import { useState } from 'react'
import { tierPrice, tierStrikethrough, volumeDiscount, NEW_PRICING_ACTIVE, cartQuote, GHG_TIERS, FLAT_MODULE_PRICES, LEGACY_PRICING_PAGE_ID, type Tier, type GhgTier, type ModuleKey } from '@/lib/pricing'

type ModuleId = 'ghg' | 'cbam' | 'risk' | 'impact' | 'supply' | 'people' | 'deals' | 'ai' | 'cyber'

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

const MODULES: { id: ModuleId; name: string; frameworks: string; href: string }[] = [
  { id: 'ghg', name: 'Climate — GHG Inventory · Scope 1, 2 & 3', frameworks: 'SB 253 · CDP · ESRS E1 · GRI 305 · IFRS S2', href: '/climate-ghg' },
  { id: 'cbam', name: 'CBAM — Carbon Border Adjustment Mechanism', frameworks: 'Regulation (EU) 2023/956 · specific embedded emissions (SEE) · direct & indirect split · precursor tracing · installation-level actuals · verification-ready summary for your EU importer', href: '/pricing?modules=cbam' },
  { id: 'risk', name: 'Climate Risk', frameworks: 'SB 261 · TCFD · IFRS S2 · scenario analysis', href: '/climate-risk' },
  // ⚠️ id 'impact', NOT the ModuleKey 'double-materiality' — this id IS the LEGACY_PRICING_PAGE_ID shorthand
  // (lib/pricing.ts:77) and is what the cart resolves through. The ModuleKey itself is not a key
  // in that map, so it would be dropped by the .filter(Boolean) at order/page.tsx:75 and the
  // customer would reach an empty order.
  { id: 'impact', name: 'Impact Materiality Assessment', frameworks: 'CSRD · ESRS 1 · ESRS 2 · stakeholder engagement · double materiality', href: '/materiality' },
  { id: 'supply', name: 'Supply Chain', frameworks: 'CS3D · EcoVadis · CDP supplier engagement · Modern Slavery Act', href: '/supply-chain' },
  { id: 'people', name: 'People & Workforce', frameworks: 'EU Pay Transparency · ESRS S1 · GRI 401–410', href: '/people' },
  { id: 'deals', name: 'Deals & Investment', frameworks: 'TCFD · SFDR · ILPA · IFC Performance Standards', href: '/deals' },
  { id: 'ai', name: 'AI Governance', frameworks: 'EU AI Act · NIST AI RMF · ISO 42001', href: '/ai-governance' },
  { id: 'cyber', name: 'Cyber Governance', frameworks: 'NIS2 · DORA · SEC Cyber · ISO 27001 · NIST CSF', href: '/cyber' },
]

const MODULE_CTA: Record<ModuleId, { headline: string; btn: string; href: string }> = {
  ghg:    { headline: 'Ready to see your emissions?', btn: 'See your emissions instantly →', href: '/dashboard/ghg' },
  cbam:   { headline: 'Is your EU customer asking for your actual emissions?', btn: 'Calculate your embedded emissions →', href: '/dashboard/cbam' },
  risk:   { headline: 'Ready to assess your climate risk?', btn: 'Assess your climate risk →', href: '/dashboard/climate-risk' },
  // ⚠️ NOT /dashboard/materiality — that path is a server redirect INTO the climate-risk wizard
  // (app/dashboard/materiality/page.tsx:20). The worksheet index is this module's own entry
  // point and the one gated on useEntitlement('double-materiality').
  impact: { headline: 'Ready to run your impact materiality assessment?', btn: 'Start your assessment →', href: '/dashboard/materiality/worksheet' },
  supply: { headline: 'Ready to map your supply chain?', btn: 'Map your supply chain →', href: '/supply-chain' },
  people: { headline: 'Do you know your gender pay gap?', btn: 'Calculate your pay gap →', href: '/people' },
  deals:  { headline: 'Ready to screen your next target?', btn: 'Screen a target →', href: '/deals' },
  ai:     { headline: 'Do you know which AI systems are high-risk?', btn: 'Start your AI inventory →', href: '/ai-governance' },
  cyber:  { headline: 'Are you NIS2 and DORA compliant?', btn: 'Check your cyber readiness →', href: '/cyber' },
}

const TIER_FEATURES: Record<Tier, { sub: string; features: string[]; color: string }> = {
  starter: {
    sub: 'Core reports for each module you select',
    features: ['Core reporting frameworks', 'Assurance-ready workings', 'Audit trail — every entry logged', 'ThemisIQ Wizard — always on'],
    color: '#0F6E56',
  },
  professional: {
    sub: 'All frameworks for your selected modules',
    features: ['Everything in Starter', 'All reporting frameworks', 'Multi-organization — up to 5 organizations', 'Verifier & third-party access role', 'Regulatory monitor — weekly alerts'],
    color: '#64fe3e',
  },
  advisory: {
    sub: 'Platform + dedicated expert guidance',
    features: ['Everything in Professional', 'Up to 10 organizations', 'Onboarding session', 'Guided inventory review', 'Sector-specific guidance', 'Board-ready narrative'],
    color: '#1fb1ff',
  },
}

export default function HomePricing() {
  const [tier, setTier] = useState<Tier>('starter')
  const [selected, setSelected] = useState<Set<ModuleId>>(new Set(['ghg']))

  const count = selected.size
  const gross = count * tierPrice(tier)
  const discount = volumeDiscount(count)
  const net = Math.round(gross * (1 - discount))

  // NEW-MODEL preview (behind NEW_PRICING_ACTIVE) — total from the shared cartQuote().
  const canonicalKeys = Array.from(selected).map(id => LEGACY_PRICING_PAGE_ID[id]).filter(Boolean) as ModuleKey[]
  const quote = cartQuote({ modules: canonicalKeys, ghgTier: tier as GhgTier })
  const newModulePrice = (id: ModuleId): number | null => {
    const key = LEGACY_PRICING_PAGE_ID[id]
    return key === 'ghg' ? GHG_TIERS[tier as GhgTier].priceUSD : FLAT_MODULE_PRICES[key as Exclude<ModuleKey, 'ghg'>]
  }
  const toggleModule = (id: ModuleId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { if (next.size === 1) return prev; next.delete(id) }
      else next.add(id)
      return next
    })
  }

  const getCta = () => {
    if (tier === 'advisory') return { headline: 'Ready to meet your compliance team?', buttons: [{ label: 'Talk to a specialist →', href: '/advisory', primary: true }] }
    if (count >= 4) return { headline: 'Ready to build your compliance platform?', buttons: [{ label: 'Build your platform →', href: '/pricing', primary: true }, { label: 'Talk to a specialist', href: '/advisory', primary: false }] }
    if (count === 1) {
      const mod = [...selected][0] as ModuleId
      const cta = MODULE_CTA[mod]
      return { headline: cta.headline, buttons: [{ label: cta.btn, href: cta.href, primary: true }, { label: 'Talk to a specialist', href: '/advisory', primary: false }] }
    }
    const mods = MODULES.filter(m => selected.has(m.id))
    return {
      headline: 'Ready to get started?',
      buttons: [
        ...mods.map((m, i) => ({ label: MODULE_CTA[m.id].btn, href: MODULE_CTA[m.id].href, primary: i === 0 })),
        { label: 'Talk to a specialist', href: '/advisory', primary: false },
      ],
    }
  }

  const cta = getCta()
  const features = TIER_FEATURES[tier]

  return (
    <section style={{ padding: '5rem 2.5rem', background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Pricing</p>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }}>Simple, honest pricing.</h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 540, lineHeight: 1.75, fontWeight: 300, marginBottom: '0.5rem' }}>
          Whether your driver is a regulator, a board, an investor, or a customer — ThemisIQ is your sustainability compliance reporting solution.
        </p>
        <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 300, marginBottom: '2rem' }}>All prices in USD</p>

        {/* Interactive prompt */}
        <div style={{ background: GRAD, borderRadius: 12, padding: 1, marginBottom: 20 }}>
          <div style={{ background: '#fff', borderRadius: 11, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: GRAD, animation: 'pulse 2s ease-in-out infinite' }} />
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>This pricing section is interactive — </span>
              <span style={{ fontSize: 13, color: '#555553', fontWeight: 300 }}>click a tier card to select your level, then click any module row to add it. Your total updates instantly.</span>
            </div>
          </div>
        </div>

        {/* Pick-and-pace hero (NEW model) — surfaces the volume discount, not a bundle price */}
        {NEW_PRICING_ACTIVE && (
          <div style={{ background: GRAD, borderRadius: 14, padding: 1, marginBottom: 16 }}>
            <div style={{ background: '#0d0d0d', borderRadius: 13, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 20, color: '#fff', marginBottom: 6 }}>Pick and pace.</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, maxWidth: 520 }}>Start with the module your next deadline demands. Add others as your obligations grow — each one is a complete, standalone deliverable, not a partial view that only works when you buy the set.</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 10 }}>Two modules −10% · Three or more −20%</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <button onClick={() => document.getElementById('build-your-stack')?.scrollIntoView({ behavior: 'smooth' })} style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: GRAD, color: '#0d0d0d' }}>Build your stack ↓</button>
              </div>
            </div>
          </div>
        )}

        {/* Tier cards (OLD model) */}
        {!NEW_PRICING_ACTIVE && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>

          {/* Starter */}
          <div onClick={() => setTier('starter')} style={{ background: '#fff', border: tier === 'starter' ? '2px solid #7425e3' : '1px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', cursor: 'pointer', position: 'relative', transition: 'all 0.15s' }}>
            {tier === 'starter' && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</div>}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Starter</div>
            <div style={{ fontSize: 11, color: '#888784', textDecoration: 'line-through', marginBottom: 2 }}>${tierStrikethrough('starter')?.toLocaleString()}</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>${tierPrice('starter').toLocaleString()}<span style={{ fontSize: 11, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#92400e', background: '#FEF3E2', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginBottom: 14 }}>Early access</div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, flex: 1 }}>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>Core reports for each module you select</div>
              {TIER_FEATURES.starter.features.map(f => (
                <div key={f} style={{ display: 'flex', gap: 7, fontSize: 12, color: '#374151', marginBottom: 5 }}>
                  <span style={{ color: '#0F6E56', flexShrink: 0 }}>✓</span>{f}
                </div>
              ))}
            </div>
          </div>

          {/* Professional */}
          <div onClick={() => setTier('professional')} style={{ background: tier === 'professional' ? '#0d0d0d' : '#f8f7f5', border: tier === 'professional' ? '2px solid #7425e3' : '1px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', cursor: 'pointer', position: 'relative', transition: 'all 0.15s' }}>
            {tier === 'professional' && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</div>}
            <div style={{ position: 'absolute', top: tier === 'professional' ? 10 : -10, right: tier === 'professional' ? 10 : 'auto', left: tier === 'professional' ? 'auto' : '50%', transform: tier === 'professional' ? 'none' : 'translateX(-50%)' }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 8 }}>Professional</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: tier === 'professional' ? '#fff' : '#0d0d0d', marginBottom: 4 }}>${tierPrice('professional').toLocaleString()}<span style={{ fontSize: 11, color: tier === 'professional' ? 'rgba(255,255,255,0.4)' : '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(116,37,227,0.15)', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginBottom: 14 }}>All frameworks</div>
            <div style={{ borderTop: `1px solid ${tier === 'professional' ? 'rgba(255,255,255,0.08)' : '#f3f4f6'}`, paddingTop: 12, flex: 1 }}>
              <div style={{ fontSize: 11, color: tier === 'professional' ? 'rgba(255,255,255,0.4)' : '#888784', marginBottom: 8 }}>All frameworks for your selected modules</div>
              {TIER_FEATURES.professional.features.map((f, i) => (
                <div key={f} style={{ display: 'flex', gap: 7, fontSize: 12, color: tier === 'professional' ? (i === 0 ? 'rgba(255,255,255,0.45)' : '#fff') : '#374151', marginBottom: 5 }}>
                  <span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>{f}
                </div>
              ))}
            </div>
          </div>

          {/* Advisory */}
          <div onClick={() => setTier('advisory')} style={{ background: '#fff', border: tier === 'advisory' ? '2px solid #1fb1ff' : '1px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', cursor: 'pointer', position: 'relative', transition: 'all 0.15s' }}>
            {tier === 'advisory' && <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', background: GRAD, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Selected</div>}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1fb1ff', marginBottom: 8 }}>Advisory</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>${tierPrice('advisory').toLocaleString()}<span style={{ fontSize: 11, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
            <div style={{ fontSize: 9, color: '#0C447C', background: '#E6F1FB', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginBottom: 14 }}>+ Expert guidance</div>
            <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, flex: 1 }}>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>Platform + dedicated expert guidance</div>
              {TIER_FEATURES.advisory.features.map(f => (
                <div key={f} style={{ display: 'flex', gap: 7, fontSize: 12, color: '#374151', marginBottom: 5 }}>
                  <span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>{f}
                </div>
              ))}
            </div>
          </div>

        </div>
        )}

        {/* Custom / more organizations note */}
        <div style={{ textAlign: 'center', fontSize: 11, color: '#888784', lineHeight: 1.6, marginBottom: 16, maxWidth: 600, marginLeft: 'auto', marginRight: 'auto' }}>
          * Need more than 10 organizations or have additional subsidiaries? <a href="/advisory" style={{ color: '#1fb1ff', textDecoration: 'none' }}>Contact us for custom pricing.</a>
        </div>

        {/* Module rows (OLD model) */}
        {!NEW_PRICING_ACTIVE && (
        <div style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', background: '#f8f7f5', padding: '10px 16px', borderBottom: '1px solid #e8e7e4', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784' }}>Select your compliance modules</div>
            <div style={{ fontSize: 10, color: '#888784', fontWeight: 300 }}>Click any row to add or remove</div>
          </div>
          {MODULES.map((mod, i) => {
            const isSelected = selected.has(mod.id)
            return (
              <div key={mod.id} onClick={() => toggleModule(mod.id)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderBottom: i < MODULES.length - 1 ? '1px solid #e8e7e4' : 'none', cursor: 'pointer', background: isSelected ? '#fff' : '#f8f7f5', opacity: isSelected ? 1 : 0.7, transition: 'all 0.15s' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isSelected ? '#7425e3' : '#e8e7e4'}`, background: isSelected ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSelected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                </div>
                <div>
                  <a href={mod.href} onClick={e => e.stopPropagation()} style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', textDecoration: 'none' }}>{mod.name} ↗</a>
                  <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{mod.frameworks}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#0d0d0d' : '#888784' }}>${tierPrice(tier).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: '#888784' }}>/yr</div>
                </div>
              </div>
            )
          })}
        </div>
        )}

        {/* Module rows (NEW model) — per-module pricing, GHG inline tier picker */}
        {NEW_PRICING_ACTIVE && (
          <div id="build-your-stack" style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', background: '#f8f7f5', padding: '10px 16px', borderBottom: '1px solid #e8e7e4', alignItems: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784' }}>Select your compliance modules</div>
              <div style={{ fontSize: 10, color: '#888784', fontWeight: 300 }}>Click any row to add or remove</div>
            </div>
            {MODULES.map((mod, i) => {
              const isSelected = selected.has(mod.id)
              const isGhg = mod.id === 'ghg'
              const price = newModulePrice(mod.id)
              return (
                <div key={mod.id} style={{ borderBottom: i < MODULES.length - 1 ? '1px solid #e8e7e4' : 'none', background: isSelected ? '#fff' : '#f8f7f5', opacity: isSelected ? 1 : 0.7, transition: 'all 0.15s' }}>
                  <div onClick={() => toggleModule(mod.id)} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}>
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isSelected ? '#7425e3' : '#e8e7e4'}`, background: isSelected ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isSelected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                    </div>
                    <div>
                      <a href={mod.href} onClick={e => e.stopPropagation()} style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', textDecoration: 'none' }}>{mod.name} ↗</a>
                      <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{mod.frameworks}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#0d0d0d' : '#888784' }}>{isGhg ? `from $${(GHG_TIERS.starter.priceUSD as number).toLocaleString()}` : `$${(price as number).toLocaleString()}`}</div>
                      <div style={{ fontSize: 10, color: '#888784' }}>/yr</div>
                    </div>
                  </div>
                  {isGhg && isSelected && (
                    <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', flexWrap: 'wrap' }}>
                      {(['starter', 'professional', 'advisory'] as GhgTier[]).map(t => {
                        const tp = GHG_TIERS[t].priceUSD
                        const label = t === 'starter' ? 'Essentials' : t === 'professional' ? 'Professional' : 'Advisory'
                        const active = tier === t
                        return (
                          <button key={t} onClick={(e) => { e.stopPropagation(); setTier(t) }} style={{ flex: 1, minWidth: 130, textAlign: 'left', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: active ? '#0d0d0d' : '#fff', color: active ? '#fff' : '#0d0d0d', border: active ? '2px solid #7425e3' : '1px solid #e8e7e4' }}>
                            <div style={{ fontSize: 11, fontWeight: 700 }}>{label}</div>
                            <div style={{ fontSize: 12, marginTop: 2 }}>{tp == null ? 'Contact us' : `$${tp.toLocaleString()}/yr`}</div>
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

        {/* Live price panel (OLD model) */}
        {!NEW_PRICING_ACTIVE && (
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Your platform — live estimate</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: 8 }}>
                {MODULES.filter(m => selected.has(m.id)).map(m => <div key={m.id}>{m.name}</div>)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{count} module{count !== 1 ? 's' : ''} selected</div>
                {discount > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(100,254,62,0.15)', color: '#64fe3e', border: '1px solid rgba(100,254,62,0.3)' }}>
                    {discount * 100}% bundle discount applied
                  </div>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {discount > 0 && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>${gross.toLocaleString()}</div>}
              <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>${net.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>/year</div>
            </div>
          </div>
        </div>
        )}

        {/* Live price panel (NEW model) */}
        {NEW_PRICING_ACTIVE && (
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem 1.5rem', marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>Your platform — live estimate</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8, marginBottom: 8 }}>
                  {MODULES.filter(m => selected.has(m.id)).map(m => <div key={m.id}>{m.name}</div>)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{count} module{count !== 1 ? 's' : ''} selected</div>
                  {volumeDiscount(count) > 0 && !quote.requiresQuote && (
                    <div style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'rgba(100,254,62,0.15)', color: '#64fe3e', border: '1px solid rgba(100,254,62,0.3)' }}>{volumeDiscount(count) * 100}% multi-module discount applied</div>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {quote.requiresQuote ? (
                  <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Contact us</div>
                ) : (
                  <>
                    <div style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>${quote.totalUSD.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>/year</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Discount bands — same cards, same wording, as /pricing. Not products: Core / Growth /
            Platform named three tiers nobody can buy, and "Platform" read as the Full Platform
            bundle removed on 23 Jul 2026. Figures use the same − (U+2212) as the hero above. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          {[
            { label: 'Full price', sub: '1 module', active: count === 1 },
            { label: '−10%', sub: '2 modules', active: count === 2 },
            { label: '−20%', sub: '3 or more modules', active: count >= 3 },
          ].map(h => (
            <div key={h.label} style={{ background: h.active ? '#fff' : '#f8f7f5', border: h.active ? '1.5px solid #0d0d0d' : '1px solid #e8e7e4', borderRadius: 10, padding: 10, textAlign: 'center', transition: 'all 0.2s' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: h.active ? '#0d0d0d' : '#888784' }}>{h.label}</div>
              <div style={{ fontSize: 10, color: '#888784', marginTop: 2 }}>{h.sub}</div>
            </div>
          ))}
        </div>

        {/* Dynamic CTA */}
        <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, maxWidth: 500, margin: '0 auto 12px', lineHeight: 1.8 }}>
            For many companies, we understand that emerging reporting requirements — and the pricing from other platforms and traditional consulting firms — are overwhelming. ThemisIQ offers a better way.
          </div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{cta.headline}</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
            {cta.buttons.map((btn, i) => (
              <a key={i} href={btn.href} style={{ padding: '10px 20px', borderRadius: 8, fontSize: 12, fontWeight: btn.primary ? 600 : 500, color: btn.primary ? '#0d0d0d' : '#0d0d0d', background: btn.primary ? GRAD : '#fff', border: btn.primary ? 'none' : '1px solid #e8e7e4', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                {btn.label}
              </a>
            ))}
          </div>
          <div style={{ marginTop: 14 }}>
            <a href="/pricing" style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', textDecoration: 'none' }}>See full pricing & build your platform →</a>
          </div>
        </div>

      </div>
    </section>
  )
}
