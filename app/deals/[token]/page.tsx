'use client'

// Public, UNAUTHENTICATED target-facing route for a shared Deals ESG assessment.
// Reads a token from the URL, calls the token+share_enabled-gated SECURITY DEFINER RPC
// deal_assessment_get (C2) via the ANON Supabase client (never service role), and renders
// the assessment using the shared pure logic in lib/deals/assessment.ts (C1).
//
// The RPC returns ONLY 7 target-safe fields — deal_value / revenue / notes / deal_type /
// currency are NEVER in the response, so no FO-internal economics can render here.

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase' // anon public client (NEXT_PUBLIC_SUPABASE_ANON_KEY)
import { getObligations, SECTOR_RISKS, type SectorRisk } from '../../../lib/deals/assessment'
import { GHG_TIERS, type Tier } from '../../../lib/pricing'

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  high:     { label: 'HIGH', color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  medium:   { label: 'MEDIUM', color: '#0C447C', bg: '#E6F1FB', border: '#0C447C' },
}

// The exact (and only) fields deal_assessment_get returns — target-safe by construction.
type Assessment = {
  target_name: string | null
  sector: string | null
  jurisdiction: string | null
  location_count: number | null
  frameworks: string[] | null
  has_ghg_data: boolean | null
  has_esg_report: boolean | null
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh', color: '#0d0d0d' }}>
      {/* Branded header — self-contained (this is a shareable deliverable, not the app nav) */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1rem 1.5rem' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <a href="/" style={{ textDecoration: 'none', fontFamily: 'Georgia, serif', fontSize: '1.35rem', fontWeight: 400, background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>ThemisIQ</a>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784' }}>ESG compliance assessment</span>
        </div>
      </div>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '1.5rem 1.5rem 4rem' }}>{children}</div>
      <div style={{ borderTop: '0.5px solid #e8e7e4', padding: '1.5rem', textAlign: 'center', fontSize: 11, color: '#888784' }}>
        Prepared via ThemisIQ · <a href="/" style={{ color: '#7425e3', textDecoration: 'none' }}>themisiq.co</a> · Indicative assessment — requires specialist confirmation.
      </div>
    </div>
  )
}

export default function DealAssessmentPage() {
  const params = useParams()
  const token = params.token as string

  const [data, setData] = useState<Assessment | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    ;(async () => {
      // The RPC RAISES 'invalid token' on a bad / unshared / revoked token → surfaces as `error`.
      const { data: res, error } = await supabase.rpc('deal_assessment_get', { p_token: token })
      if (cancelled) return
      if (error || !res) { setNotFound(true); setLoading(false); return }
      setData(res as Assessment)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [token])

  if (loading) return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '5rem 0', fontFamily: 'Georgia, serif', fontSize: '1.2rem', background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        Loading your assessment…
      </div>
    </Shell>
  )

  if (notFound || !data) return (
    <Shell>
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '2.5rem', textAlign: 'center', marginTop: '2rem' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', fontWeight: 400, marginBottom: 10 }}>This assessment link isn&rsquo;t valid</div>
        <div style={{ fontSize: 14, color: '#555553', lineHeight: 1.7, maxWidth: 460, margin: '0 auto' }}>
          This link isn&rsquo;t valid or is no longer shared. Please contact the sender for an up-to-date link.
        </div>
      </div>
    </Shell>
  )

  // ── Recompute the assessment from the safe fields via the shared C1 lib (no drift) ──
  const frameworks = Array.isArray(data.frameworks) ? data.frameworks : []
  const risks: SectorRisk[] = (data.sector && SECTOR_RISKS[data.sector]) || []
  const obligations = getObligations(data.location_count ?? 0, frameworks, data.sector ?? undefined)

  const fmt = (n: number) => `$${n.toLocaleString()}`
  const themisIqFigure = obligations.locationUnset
    ? 'Custom quote'
    : obligations.themisIqHasCustom
      ? (obligations.themisIqTotal != null ? `~${fmt(obligations.themisIqTotal)} + custom` : 'Custom quote')
      : `~${fmt(obligations.themisIqTotal ?? 0)}`
  const consultantRange = `$${Math.round(obligations.consultantLow / 1000)}k–$${Math.round(obligations.consultantHigh / 1000)}k`
  const includedModulesLabel = obligations.included.map(o => o.short).join(' + ') + ' modules'

  // CTA → the pre-configured /order screen. modules = pricing-page ids (/order converts them);
  // tier = GHG tier from the deal's location_count using the SAME GHG_TIERS allowance thresholds
  // getObligations uses (so /order's price matches this assessment's cost card); ref = deal token.
  const ctaModules = ['ghg', ...(obligations.included.some(o => o.short === 'supply chain') ? ['supply'] : [])].join(',')
  const lc = data.location_count ?? 0
  const ghgTier: Tier =
    lc <= (GHG_TIERS.starter.locationAllowance ?? 3) ? 'starter'
    : lc <= (GHG_TIERS.professional.locationAllowance ?? 15) ? 'professional'
    : 'advisory'
  const ctaHref = `/order?modules=${ctaModules}&tier=${ghgTier}&ref=${encodeURIComponent(token)}`

  const sectorJur = [data.sector, data.jurisdiction].filter(Boolean).join(' · ')

  return (
    <Shell>
      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 6 }}>ESG compliance assessment</div>
        <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.15, margin: '0 0 8px' }}>{data.target_name || 'Target company'}</h1>
        {sectorJur && <div style={{ fontSize: 14, color: '#555553' }}>{sectorJur}</div>}
        <div style={{ fontSize: 12, color: '#888784', marginTop: 6 }}>Prepared via ThemisIQ — the ESG compliance platform for deals.</div>
      </div>

      {/* Applicable frameworks */}
      {frameworks.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, marginBottom: 10 }}>Applicable frameworks</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {frameworks.map(fw => (
              <span key={fw} style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 99, background: '#EDE9FE', color: '#7425e3', border: '0.5px solid rgba(116,37,227,0.2)' }}>{fw}</span>
            ))}
          </div>
        </section>
      )}

      {/* ESG risk findings — computed from SECTOR_RISKS (shared lib) */}
      {risks.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, marginBottom: 4 }}>Material ESG findings</h2>
          <p style={{ fontSize: 13, color: '#555553', marginBottom: 14, lineHeight: 1.6 }}>Sector-specific ESG risks identified for {data.target_name || 'this company'}.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {risks.map((risk, i) => {
              const cfg = SEVERITY_CONFIG[risk.severity]
              return (
                <div key={i} style={{ border: `1px solid ${cfg.border}20`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                  <div style={{ background: risk.severity === 'critical' ? cfg.bg : '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottom: `0.5px solid ${cfg.border}20`, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{risk.risk}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#888784' }}>{risk.framework}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px' }}>
                    <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{risk.detail}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Two-tier cost card — consultant vs ThemisIQ (same structure as the dashboard) */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, marginBottom: 12 }}>Your compliance cost</h2>
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>Estimated ESG compliance cost — {data.target_name || 'Target'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Traditional consultant</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', fontWeight: 400, color: '#fff', lineHeight: 1.1 }}>{consultantRange}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>first-year, billed by the hour</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>With ThemisIQ</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', fontWeight: 400, color: '#64fe3e', lineHeight: 1.1 }}>{themisIqFigure}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{includedModulesLabel}</div>
            </div>
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
            Priced like sustainability software, scoped like a consultant&rsquo;s engagement. The difference is automation, not depth: traditional fees are dominated by manual data-collection and review hours — the platform handles those directly, without cutting the deliverable.
          </div>
        </div>

        {/* Included for this deal */}
        <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Included for this deal</div>
          {obligations.included.map((o, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 13 }}>✓ {o.label}</div>
              {o.scopeNote && (
                <div style={{ fontSize: 11, color: '#888784', marginLeft: 18, marginTop: 1, lineHeight: 1.5 }}>{o.scopeNote}</div>
              )}
            </div>
          ))}
          <div style={{ fontSize: 13, marginBottom: 6 }}>✓ Immutable audit trail</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>✓ SBTi science-based target setting</div>
          <div style={{ fontSize: 13, marginBottom: 0 }}>✓ Assurance-ready verification package</div>
        </div>

        {/* Also recommended — NOT summed into the ThemisIQ total */}
        {obligations.recommended.map((o, i) => (
          <div key={i} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.85rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Also recommended</div>
              <div style={{ fontSize: 13, color: '#555553' }}>{o.label}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{o.themisIqPrice != null ? `+ ${fmt(o.themisIqPrice)}` : '+ Custom'}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>consultant ${Math.round(o.consultantLow / 1000)}k–${Math.round(o.consultantHigh / 1000)}k</div>
            </div>
          </div>
        ))}

        {/* Flagged — honest caveat, summed into NEITHER figure */}
        {obligations.flagged.map((o, i) => (
          <div key={i} style={{ background: '#FBF3E2', border: '0.5px solid rgba(146,102,10,0.25)', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#92660A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Not included — separate specialist</div>
            <div style={{ fontSize: 13, color: '#555553' }}>{o.label}</div>
            {o.scopeNote && <div style={{ fontSize: 11, color: '#888784', marginTop: 3, lineHeight: 1.5 }}>{o.scopeNote}</div>}
          </div>
        ))}
      </section>

      {/* Data-room readiness */}
      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, marginBottom: 12 }}>Data-room readiness</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { label: 'GHG inventory / emissions data', ready: !!data.has_ghg_data },
            { label: 'ESG report or sustainability disclosure', ready: !!data.has_esg_report },
          ].map(({ label, ready }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px' }}>
              <span style={{ fontSize: 13, color: '#0d0d0d' }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99, background: ready ? '#E1F5EE' : '#FEF3E2', color: ready ? '#0F6E56' : '#ba7517' }}>{ready ? 'Available' : 'Not yet available'}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Conversion CTA */}
      <section style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 4vw, 1.8rem)', fontWeight: 400, color: '#fff', marginBottom: 8 }}>Get compliance-ready with ThemisIQ</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 20, maxWidth: 520, margin: '0 auto 20px' }}>
          Build your GHG inventory, map your frameworks, and produce verifier-ready reports — priced like software, scoped to exactly what this deal needs.
        </div>
        <a href={ctaHref} style={{ display: 'inline-block', padding: '13px 30px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>Get started with ThemisIQ →</a>
      </section>
    </Shell>
  )
}
