'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import { supabase } from '../../lib/supabase'
import { FLAT_MODULE_PRICES } from '../../lib/pricing'
import { AI_ACT_HIGH_RISK_STANDALONE, AI_ACT_HIGH_RISK_EMBEDDED } from '../../lib/aiAct'

const GRAD = 'var(--color-brand)'

// Locked-card price lookup: dashboard module id → FLAT_MODULE_PRICES key.
// Only the six flat-priced modules appear here; ghg/scope3/sbti/portal have no
// flat price (GHG is tier-banded) and intentionally render "Preview free" only.
const ID_TO_PRICE_KEY: Record<string, keyof typeof FLAT_MODULE_PRICES> = {
  cbam: 'cbam',
  climate_risk: 'climate-risk',
  double_materiality: 'double-materiality',
  supply_chain: 'supply-chain',
  ai: 'ai-governance',
  cyber: 'cyber',
  deals: 'deals',
  people: 'people',
}

// `previewable` records whether the module's page renders anything to a customer with
// no entitlement. TRUE = the page loads and the tool works, with the OUTPUT gated
// (blurred results, or an unlock panel replacing the report section). FALSE = the page
// early-returns a paywall and nothing renders at all.
//
// It exists because the locked-card footer said "Preview free" for every module, which is
// a promise three of them cannot keep. Verified page by page, not inferred from the module
// name — read the page's own !isPaid handling before changing a value here.
type DashboardModule = {
  id: string
  name: string
  sub: string
  desc: string
  href: string
  color: string
  bg: string
  frameworks: string[]
  urgency: string | null
  previewable: boolean
}

const MODULES: DashboardModule[] = [
  {
    id: 'ghg',
    name: 'GHG Inventory',
    sub: 'Scope 1, 2 & 3',
    desc: 'Calculate your full GHG inventory — Scope 1, 2 and 3 — across all locations and frameworks.',
    href: '/dashboard/ghg',
    color: 'var(--color-module-ghg)',
    bg: 'var(--color-module-ghg-wash)',
    frameworks: ['SB 253', 'CSRD', 'CDP', 'GRI 305', 'IFRS S2'],
    urgency: null,
    previewable: true,
  },
  {
    id: 'scope3',
    name: 'Scope 3 Calculator',
    sub: 'All 15 categories',
    desc: 'Calculate your full Scope 3 footprint across all 15 GHG Protocol categories.',
    href: '/dashboard/scope3',
    color: 'var(--color-module-ghg)',
    bg: 'var(--color-module-ghg-wash)',
    frameworks: ['GHG Protocol', 'CSRD', 'CDP', 'SBTi'],
    urgency: null,
    previewable: true,
  },
  {
    id: 'sbti',
    name: 'SBTi Targets',
    sub: 'Corporate Net-Zero V2.0',
    desc: 'Set and monitor science-based targets under the SBTi Corporate Net-Zero Standard V2.0.',
    href: '/dashboard/sbti',
    color: 'var(--color-module-ghg)',
    bg: 'var(--color-module-ghg-wash)',
    frameworks: ['SBTi', 'Net-Zero V2.0', 'ACA'],
    urgency: null,
    previewable: false,
  },
  {
    id: 'cbam',
    name: 'CBAM',
    sub: 'Embedded emissions · Exporters',
    desc: 'Specific embedded emissions for goods entering the EU, and the Annex IV §1.2 summary your customer needs.',
    href: '/dashboard/cbam/setup',
    color: 'var(--color-module-cbam)',
    bg: 'var(--color-module-cbam-wash)',
    frameworks: ['(EU) 2023/956', 'IR (EU) 2025/2547', 'Annex IV §1.2'],
    urgency: null,
    previewable: false,
  },
  {
    id: 'climate_risk',
    name: 'Climate Risk',
    sub: 'Physical & transition',
    desc: 'Assess physical and transition climate risks across 3 IPCC scenarios.',
    href: '/dashboard/climate-risk',
    color: 'var(--color-module-climate)',
    bg: 'var(--color-module-climate-wash)',
    frameworks: ['TCFD', 'IFRS S2', 'CSRD ESRS E1'],
    urgency: null,
    previewable: true,
  },
  {
    id: 'double_materiality',
    name: 'Materiality Assessment',
    sub: 'ESRS 1 §6.2 · stakeholder survey',
    desc: 'Survey affected stakeholders, delegate sub-topics to named contributors, and record a defensible impact materiality determination.',
    href: '/dashboard/materiality/worksheet',
    color: '#0F6E56',
    bg: '#E1F5EE',
    frameworks: ['CSRD ESRS', 'ESRS 1 §6.2', 'ESRS 2 IRO-1'],
    urgency: null,
    // FALSE: every worksheet and survey route early-returns a PaywallCard. Nothing renders unpaid,
    // so "Preview free" on the locked card would be a promise the routes do not keep.
    previewable: false,
  },
  {
    id: 'supply_chain',
    name: 'Supply Chain',
    sub: 'Supplier Portal · CS3D',
    desc: 'Survey your suppliers, collect primary data, and risk-score your supply chain.',
    href: '/dashboard/supply-chain',
    color: 'var(--color-module-supply)',
    bg: 'var(--color-module-supply-wash)',
    frameworks: ['CS3D', 'EcoVadis', 'ESRS S2', 'Modern Slavery'],
    urgency: null,
    previewable: true,
  },
  {
    id: 'portal',
    name: 'Supplier Portal',
    sub: 'Data collection',
    desc: 'Send sustainability questionnaires to suppliers and track responses.',
    href: '/dashboard/supply-chain/portal',
    color: 'var(--color-module-supply)',
    bg: 'var(--color-module-supply-wash)',
    frameworks: ['EcoVadis', 'CS3D', 'Modern Slavery', 'CDP supplier engagement'],
    urgency: null,
    previewable: false,
  },
  {
    id: 'people',
    name: 'People & Workforce',
    sub: 'Pay gap · Safety',
    desc: 'Gender pay gap analysis, workforce metrics and EU Pay Transparency compliance.',
    href: '/dashboard/people',
    color: 'var(--color-module-people)',
    bg: 'var(--color-module-people-wash)',
    frameworks: ['EU Pay Transparency', 'ESRS S1', 'CA Pay Data', 'GRI'],
    urgency: null,
    previewable: true,
  },
  {
    id: 'ai',
    name: 'AI Governance',
    sub: 'EU AI Act',
    // Not 'Annex III': the module covers BOTH high-risk limbs, and has no field distinguishing a
    // stand-alone system from one embedded in a regulated product — so the card names both dates.
    desc: `Classify every AI system under the EU AI Act. High-risk duties from ${AI_ACT_HIGH_RISK_STANDALONE}, or ${AI_ACT_HIGH_RISK_EMBEDDED} in regulated products.`,
    href: '/dashboard/ai-governance',
    color: 'var(--color-module-ai)',
    bg: 'var(--color-module-ai-wash)',
    frameworks: ['EU AI Act', 'NIST AI RMF', 'ISO 42001'],
    urgency: AI_ACT_HIGH_RISK_STANDALONE,
    previewable: true,
  },
  {
    id: 'cyber',
    name: 'Cyber Governance',
    sub: 'NIS2 · DORA · SEC',
    desc: 'Gap assessment against NIS2, DORA and SEC cyber disclosure requirements.',
    href: '/dashboard/cyber',
    color: 'var(--color-module-cyber)',
    bg: 'var(--color-module-cyber-wash)',
    frameworks: ['NIS2', 'DORA', 'SEC Cyber', 'ISO 27001'],
    urgency: null,
    previewable: true,
  },
  {
    id: 'deals',
    name: 'Deals & Investment',
    sub: 'ESG due diligence',
    desc: 'ESG risk screening and compliance cost estimation for M&A and investments.',
    // Lands on the list of saved targets, not a blank form: a firm screening several targets
    // needs to pick one, and a bare /dashboard/deals now starts a NEW deal.
    href: '/dashboard/deals/list',
    color: 'var(--color-module-deals)',
    bg: 'var(--color-module-deals-wash)',
    frameworks: ['IFRS S2', 'TCFD', 'SB 253', 'SFDR'],
    urgency: null,
    previewable: true,
  },
]

const TIER_CONFIG = {
  starter:      { label: 'Essentials', color: '#0F6E56', bg: '#E1F5EE' },
  professional: { label: 'Professional', color: '#7425e3', bg: '#EDE9FE' },
  advisory:     { label: 'Advisory', color: '#0C447C', bg: '#E6F1FB' },
}

const PACK_CONFIG: Record<string, { label: string; modules: string[] }> = {
  supplier:   { label: 'Supplier Readiness Pack', modules: ['ghg', 'supply_chain', 'portal'] },
  climate:    { label: 'Climate Readiness Pack', modules: ['ghg', 'climate_risk'] },
  foundation: { label: 'ESG Foundation Pack', modules: ['ghg', 'people', 'climate_risk'] },
  investor:   { label: 'Investor ESG Pack', modules: ['ghg', 'climate_risk', 'supply_chain', 'deals'] },
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [subscriptions, setSubscriptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      setUser(session.user)

      // Load entitlements (written by the Stripe webhook). RLS scopes to this user.
      const { data: ents } = await supabase
        .from('entitlements')
        .select('module_key')

      // Map canonical module_key (entitlements) -> this dashboard's card id(s).
      // Note: Scope 3 now lives under GHG -- the 'ghg' entitlement unlocks the Scope 3 card,
      // while 'supply-chain' unlocks the Supply Chain + Supplier Portal cards.
      const KEY_TO_CARD_IDS: Record<string, string[]> = {
        'ghg': ['ghg', 'scope3', 'sbti'],
        'cbam': ['cbam'],
        'climate-risk': ['climate_risk'],
        // ⚠️ WITHOUT THIS A PAYING CUSTOMER SEES NO TILE. This map is not type-checked against
        // ModuleKey, so a module added to pricing.ts and forgotten here is bought and invisible.
        'double-materiality': ['double_materiality'],
        'supply-chain': ['supply_chain', 'portal'],
        'people': ['people'],
        'deals': ['deals'],
        'ai-governance': ['ai'],
        'cyber': ['cyber'],
      }
      const cardIds = new Set<string>()
      ;(ents || []).forEach((e: any) => {
        (KEY_TO_CARD_IDS[e.module_key] || []).forEach((cid) => cardIds.add(cid))
      })
      const subs = Array.from(cardIds).map((id) => ({ module_id: id }))

      setSubscriptions(subs || [])

      // Show welcome if new user (no subscriptions and account < 1 hour old)
      const createdAt = new Date(session.user.created_at)
      const isNew = (Date.now() - createdAt.getTime()) < 3600000
      if (isNew && (!subs || subs.length === 0)) setShowWelcome(true)

      setLoading(false)
    })
  }, [])

  const getModuleSub = (moduleId: string) =>
    subscriptions.find(s => s.module_id === moduleId)

  const isUnlocked = (moduleId: string) => !!getModuleSub(moduleId)

  const activePack = subscriptions.find(s => s.pack)?.pack
  const activeModuleCount = subscriptions.length
  const unlockedModuleIds = subscriptions.map(s => s.module_id)

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-ink-muted)' }}>Loading your dashboard...</div>
    </div>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Welcome banner for new users */}
      {showWelcome && (
        <div className="tq-band-bleed" style={{ padding: '1.5rem 2.5rem' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, marginBottom: 4 }}>
                Welcome to ThemisIQ!
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>
                Start by checking which compliance requirements apply to your company — it takes 2 minutes.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <a href="/assess" style={{ fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none' }}>
                Check my compliance obligations →
              </a>
              <button onClick={() => setShowWelcome(false)} style={{ fontSize: 12, color: 'var(--color-ink-2)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 4 }}>Dashboard</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>
              {user?.email?.split('@')[0] ? `Welcome back` : 'Your ThemisIQ platform'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {activePack && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#EDE9FE', color: '#7425e3', border: '0.5px solid rgba(116,37,227,0.2)' }}>
                {PACK_CONFIG[activePack]?.label}
              </span>
            )}
            <a href="/pricing" style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', textDecoration: 'none' }}>
              {activeModuleCount === 0 ? 'Unlock modules →' : 'Add modules →'}
            </a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Modules active', val: activeModuleCount, color: activeModuleCount > 0 ? '#0F6E56' : 'var(--color-ink-muted)', bg: activeModuleCount > 0 ? '#E1F5EE' : '#f8f7f5' },
            { label: 'Modules available', val: MODULES.length - activeModuleCount, color: 'var(--color-ink-muted)', bg: '#f8f7f5' },
            { label: 'Frameworks covered', val: activeModuleCount > 0 ? unlockedModuleIds.flatMap(id => MODULES.find(m => m.id === id)?.frameworks || []).length : 0, color: '#7425e3', bg: '#EDE9FE' },
            { label: 'AI Act high-risk from', val: AI_ACT_HIGH_RISK_STANDALONE, color: '#B91C1C', bg: '#FCEBEB' },
          ].map(({ label, val, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: 12, padding: '1rem', textAlign: 'center', border: '0.5px solid #e8e7e4' }}>
              <div style={{ fontFamily: typeof val === 'number' ? 'var(--font-display)' : 'inherit', fontSize: typeof val === 'number' ? '1.8rem' : '1rem', fontWeight: typeof val === 'number' ? 400 : 600, color, lineHeight: 1.2, marginBottom: 4 }}>{val}</div>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Module grid */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, color: '#0d0d0d' }}>Your compliance modules</h2>
            {activeModuleCount === 0 && (
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Click any module to preview · unlock to export</div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {MODULES.map(mod => {
              const sub = getModuleSub(mod.id)
              const unlocked = !!sub
              const tier = sub?.tier as keyof typeof TIER_CONFIG | undefined
              const tierCfg = tier ? TIER_CONFIG[tier] : null

              return (
                <div key={mod.id} style={{ position: 'relative' }}>
                  <a href={mod.href} style={{
                    display: 'block',
                    background: '#fff',
                    border: `1.5px solid ${unlocked ? `color-mix(in srgb, ${mod.color} 25%, transparent)` : '#e8e7e4'}`,
                    borderRadius: 14,
                    padding: '1.25rem',
                    textDecoration: 'none',
                    opacity: unlocked ? 1 : 0.75,
                    transition: 'all 0.15s',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = mod.color; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = unlocked ? `color-mix(in srgb, ${mod.color} 25%, transparent)` : '#e8e7e4'; (e.currentTarget as HTMLElement).style.opacity = unlocked ? '1' : '0.75' }}
                  >
                    {/* Lock overlay for unpurchased */}
                    {!unlocked && (
                      <div style={{ position: 'absolute', top: 12, right: 12, width: 24, height: 24, borderRadius: '50%', background: '#f8f7f5', border: '0.5px solid #e8e7e4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>
                        🔒
                      </div>
                    )}

                    {/* Urgency badge */}
                    {mod.urgency && (
                      <div style={{ position: 'absolute', top: 12, right: unlocked ? 12 : 44, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: '#FCEBEB', color: '#B91C1C', border: '0.5px solid #B91C1C33' }}>
                        {mod.urgency}
                      </div>
                    )}

                    {/* Active indicator */}
                    {unlocked && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: mod.color, borderRadius: '14px 14px 0 0' }} />
                    )}

                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 2 }}>{mod.name}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: mod.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{mod.sub}</div>
                    </div>

                    <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5, marginBottom: 12, fontWeight: 400 }}>{mod.desc}</div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                      {mod.frameworks.slice(0, 3).map(fw => (
                        <span key={fw} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: unlocked ? mod.bg : '#f8f7f5', color: unlocked ? mod.color : 'var(--color-ink-muted)', border: `0.5px solid ${unlocked ? `color-mix(in srgb, ${mod.color} 19%, transparent)` : '#e8e7e4'}` }}>{fw}</span>
                      ))}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {unlocked ? (
                        <>
                          <span style={{ fontSize: 11, fontWeight: 600, color: mod.color }}>Open module →</span>
                          {tierCfg && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: tierCfg.bg, color: tierCfg.color }}>{tierCfg.label}</span>
                          )}
                        </>
                      ) : (
                        (() => {
                          const priceKey = ID_TO_PRICE_KEY[mod.id]
                          const price = priceKey ? FLAT_MODULE_PRICES[priceKey] : null
                          // 'Preview free' only where a preview actually exists. A module that
                          // early-returns a paywall reads 'Locked' — promising a preview the page
                          // does not give is worse than saying nothing.
                          const lead = mod.previewable ? 'Preview free' : 'Locked'
                          return (
                            <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{lead}{price !== null && <> · <span style={{ color: '#7425e3', fontWeight: 500 }}>unlock for ${price.toLocaleString('en-US')}/yr</span></>}</span>
                          )
                        })()
                      )}
                    </div>
                  </a>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upgrade prompt for free users */}
        {activeModuleCount === 0 && (
          <div className="tq-band" style={{ borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 400, marginBottom: 8 }}>
              Ready to unlock your compliance programme?
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: 20, lineHeight: 1.6, maxWidth: 500, margin: '0 auto 20px' }}>
              Each module is an annual license. See current pricing for every module and GHG tier.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/pricing" style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none' }}>See current pricing →</a>
              <a href="/assess" style={{ fontSize: 13, padding: '11px 24px', borderRadius: 8, background: 'none', color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)', textDecoration: 'none' }}>Check my obligations first →</a>
            </div>
          </div>
        )}

        {/* Active modules quick actions */}
        {activeModuleCount > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.5rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Quick actions</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {unlockedModuleIds.map(id => {
                const mod = MODULES.find(m => m.id === id)
                if (!mod) return null
                return (
                  <a key={id} href={mod.href} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: mod.bg, color: mod.color, textDecoration: 'none', border: `0.5px solid color-mix(in srgb, ${mod.color} 19%, transparent)` }}>
                    {mod.name} →
                  </a>
                )
              })}
              <a href="/pricing" style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: '#f8f7f5', color: 'var(--color-ink-muted)', textDecoration: 'none', border: '0.5px solid #e8e7e4' }}>
                + Add module
              </a>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
