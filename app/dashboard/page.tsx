'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '../components/Nav'
import { supabase } from '../../lib/supabase'
import { FLAT_MODULE_PRICES } from '../../lib/pricing'
import { AI_ACT_HIGH_RISK_STANDALONE, AI_ACT_HIGH_RISK_EMBEDDED } from '../../lib/aiAct'

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

// Locked-card price lookup: dashboard module id → FLAT_MODULE_PRICES key.
// Only the six flat-priced modules appear here; ghg/scope3/sbti/portal have no
// flat price (GHG is tier-banded) and intentionally render "Preview free" only.
const ID_TO_PRICE_KEY: Record<string, keyof typeof FLAT_MODULE_PRICES> = {
  cbam: 'cbam',
  climate_risk: 'climate-risk',
  supply_chain: 'supply-chain',
  ai: 'ai-governance',
  cyber: 'cyber',
  deals: 'deals',
  people: 'people',
}

// Auto-expiring "New" badge on the SBTi card — no DB / per-user state, just a date compare.
const SBTI_NEW_UNTIL = new Date('2026-08-01')

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
    color: '#0F6E56',
    bg: '#E1F5EE',
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
    color: '#0F6E56',
    bg: '#E1F5EE',
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
    color: '#0F6E56',
    bg: '#E1F5EE',
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
    color: '#0C447C',
    bg: '#E6F1FB',
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
    color: '#ba7517',
    bg: '#FEF3E2',
    frameworks: ['TCFD', 'IFRS S2', 'CSRD ESRS E1'],
    urgency: null,
    previewable: true,
  },
  {
    id: 'supply_chain',
    name: 'Supply Chain',
    sub: 'Supplier Portal · CS3D',
    desc: 'Survey your suppliers, collect primary data, and risk-score your supply chain.',
    href: '/dashboard/supply-chain',
    color: '#7425e3',
    bg: '#EDE9FE',
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
    color: '#7425e3',
    bg: '#EDE9FE',
    frameworks: ['EcoVadis', 'CS3D', 'Modern Slavery', 'CDP C12'],
    urgency: null,
    previewable: false,
  },
  {
    id: 'people',
    name: 'People & Workforce',
    sub: 'Pay gap · Safety',
    desc: 'Gender pay gap analysis, workforce metrics and EU Pay Transparency compliance.',
    href: '/dashboard/people',
    color: '#0C447C',
    bg: '#E6F1FB',
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
    color: '#B91C1C',
    bg: '#FCEBEB',
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
    color: '#B91C1C',
    bg: '#FCEBEB',
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
    color: '#0C447C',
    bg: '#E6F1FB',
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
  const sbtiIsNew = new Date() < SBTI_NEW_UNTIL // true until the cutoff; gates the SBTi "New" badge

  if (loading) return (
    <div style={{ fontFamily: '-apple-system, sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ textAlign: 'center', padding: '4rem', color: '#888784' }}>Loading your dashboard...</div>
    </div>
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Welcome banner for new users */}
      {showWelcome && (
        <div style={{ background: '#0d0d0d', padding: '1.5rem 2.5rem' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#fff', marginBottom: 4 }}>
                Welcome to ThemisIQ! 👋
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                Start by checking which compliance requirements apply to your company — it takes 2 minutes.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <a href="/assess" style={{ fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', textDecoration: 'none' }}>
                Check my compliance obligations →
              </a>
              <button onClick={() => setShowWelcome(false)} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}>
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
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Dashboard</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>
              {user?.email?.split('@')[0] ? `Welcome back` : 'Your ThemisIQ platform'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {activePack && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#EDE9FE', color: '#7425e3', border: '0.5px solid rgba(116,37,227,0.2)' }}>
                {PACK_CONFIG[activePack]?.label}
              </span>
            )}
            <a href="/pricing" style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: GRAD, color: '#0d0d0d', textDecoration: 'none' }}>
              {activeModuleCount === 0 ? 'Unlock modules →' : 'Add modules →'}
            </a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Modules active', val: activeModuleCount, color: activeModuleCount > 0 ? '#0F6E56' : '#888784', bg: activeModuleCount > 0 ? '#E1F5EE' : '#f8f7f5' },
            { label: 'Modules available', val: MODULES.length - activeModuleCount, color: '#888784', bg: '#f8f7f5' },
            { label: 'Frameworks covered', val: activeModuleCount > 0 ? unlockedModuleIds.flatMap(id => MODULES.find(m => m.id === id)?.frameworks || []).length : 0, color: '#7425e3', bg: '#EDE9FE' },
            { label: 'AI Act high-risk from', val: AI_ACT_HIGH_RISK_STANDALONE, color: '#B91C1C', bg: '#FCEBEB' },
          ].map(({ label, val, color, bg }) => (
            <div key={label} style={{ background: bg, borderRadius: 12, padding: '1rem', textAlign: 'center', border: '0.5px solid #e8e7e4' }}>
              <div style={{ fontFamily: typeof val === 'number' ? 'Georgia, serif' : 'inherit', fontSize: typeof val === 'number' ? '1.8rem' : '1rem', fontWeight: typeof val === 'number' ? 400 : 600, color, lineHeight: 1.2, marginBottom: 4 }}>{val}</div>
              <div style={{ fontSize: 11, color: '#888784' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Module grid */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#0d0d0d' }}>Your compliance modules</h2>
            {activeModuleCount === 0 && (
              <div style={{ fontSize: 12, color: '#888784' }}>Click any module to preview · unlock to export</div>
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
                    border: `1.5px solid ${unlocked ? mod.color + '40' : '#e8e7e4'}`,
                    borderRadius: 14,
                    padding: '1.25rem',
                    textDecoration: 'none',
                    opacity: unlocked ? 1 : 0.75,
                    transition: 'all 0.15s',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = mod.color; (e.currentTarget as HTMLElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = unlocked ? mod.color + '40' : '#e8e7e4'; (e.currentTarget as HTMLElement).style.opacity = unlocked ? '1' : '0.75' }}
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

                    {/* Auto-expiring "New" badge — SBTi card only, before the cutoff AND only when unlocked
                        (never surface "New" on a feature a non-GHG user can't access). Affirmative green. */}
                    {mod.id === 'sbti' && sbtiIsNew && unlocked && (
                      <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56', border: '0.5px solid #0F6E5633' }}>
                        New
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

                    <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5, marginBottom: 12, fontWeight: 300 }}>{mod.desc}</div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                      {mod.frameworks.slice(0, 3).map(fw => (
                        <span key={fw} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 99, background: unlocked ? mod.bg : '#f8f7f5', color: unlocked ? mod.color : '#888784', border: `0.5px solid ${unlocked ? mod.color + '30' : '#e8e7e4'}` }}>{fw}</span>
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
                            <span style={{ fontSize: 11, color: '#888784' }}>{lead}{price !== null && <> · <span style={{ color: '#7425e3', fontWeight: 500 }}>unlock for ${price.toLocaleString('en-US')}/yr</span></>}</span>
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
          <div style={{ background: '#0d0d0d', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#fff', marginBottom: 8 }}>
              Ready to unlock your compliance programme?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6, maxWidth: 500, margin: '0 auto 20px' }}>
              Each module is an annual license. See current pricing for every module and GHG tier.
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="/pricing" style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', textDecoration: 'none' }}>See current pricing →</a>
              <a href="/assess" style={{ fontSize: 13, padding: '11px 24px', borderRadius: 8, background: 'none', color: 'rgba(255,255,255,0.6)', border: '0.5px solid rgba(255,255,255,0.2)', textDecoration: 'none' }}>Check my obligations first →</a>
            </div>
          </div>
        )}

        {/* Active modules quick actions */}
        {activeModuleCount > 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.5rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Quick actions</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {unlockedModuleIds.map(id => {
                const mod = MODULES.find(m => m.id === id)
                if (!mod) return null
                return (
                  <a key={id} href={mod.href} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: mod.bg, color: mod.color, textDecoration: 'none', border: `0.5px solid ${mod.color}30` }}>
                    {mod.name} →
                  </a>
                )
              })}
              <a href="/pricing" style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: '#f8f7f5', color: '#888784', textDecoration: 'none', border: '0.5px solid #e8e7e4' }}>
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
