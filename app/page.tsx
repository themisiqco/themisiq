'use client'
import { useState, useEffect } from 'react'
import Nav from './components/Nav'

export default function Home() {
  const [daysLeft, setDaysLeft] = useState(81)
  useEffect(() => {
    const deadline = new Date('2026-08-10')
    const today = new Date()
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    setDaysLeft(Math.max(0, diff))
  }, [])
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d', margin: 0, padding: 0 }}>
      <Nav />

      {/* ── HERO ── */}
      <section style={{ padding: '7rem 2.5rem 5rem', borderBottom: '0.5px solid #e8e7e4', textAlign: 'center' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '3.5rem' }}>
            <Logo size={320} />
            <p style={{ fontSize: 15, color: '#888784', letterSpacing: '0.02em', fontWeight: 300 }}>
              Compliance Intelligence for Sustainable Business
            </p>
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.6rem, 5vw, 4rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
            Every framework.<br />
            One <em style={gradText}>intelligent</em> platform.
          </h1>
          <p style={{ fontSize: 17, color: '#555553', maxWidth: 580, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.75 }}>
            From GHG emissions and climate risk to supply chain, M&A diligence, AI governance, workforce, and cybersecurity — ThemisIQ turns complex compliance into competitive clarity.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            <a href="/dashboard/ghg" style={{ ...btnPrimary, textDecoration: 'none' }}>See your emissions instantly →</a>
            <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to an advisor</a>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555553', background: '#f8f7f5', border: '0.5px solid #e8e7e4', padding: '8px 16px', borderRadius: 99 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#B91C1C', display: 'inline-block', animation: 'pulse 1.8s infinite' }} />
            SB 253 first-year deadline: August 10, 2026 — {daysLeft} days away
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '0.5px solid #e8e7e4', background: '#f8f7f5' }}>
        {[
          ['8', 'Intelligence modules'],
          ['15+', 'Frameworks supported'],
          ['GHG Protocol', 'Verifier-ready by design'],
          ['Intelligence-first', 'Precision by design'],
          ['14-day trial', 'No credit card required'],
        ].map(([val, label], i) => (
          <div key={i} style={{ padding: '1.75rem 1rem', textAlign: 'center', borderRight: i < 4 ? '0.5px solid #e8e7e4' : 'none' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 4 }}>{val}</div>
            <div style={{ fontSize: 12, color: '#888784' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── FRAMEWORKS ── */}
      <div style={{ padding: '4rem 2.5rem', background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Framework coverage</p>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 300, marginBottom: '1.5rem' }}>Every major regulatory and voluntary framework. Pre-mapped. Export-ready.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {['SB 253 (California)', 'SB 261 (California)', 'ESRS E1 / CSRD', 'IFRS S2', 'CDP Climate', 'EcoVadis', 'TCFD', 'GHG Protocol', 'SEC Climate Rule', 'GRI', 'SBTi', 'RE100', 'NIST AI RMF', 'EU AI Act', 'ISO 27001', 'NIST CSF', 'SASB', 'EU Pay Transparency', 'NIS2', 'DORA'].map(fw => (
              <span key={fw} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 99, background: '#fff', border: '0.5px solid #e8e7e4', color: '#555553', cursor: 'default' }}>{fw}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── PRODUCTS ── */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <p style={eyebrow}>The ThemisIQ platform</p>
        <h2 style={sectionTitle}>Eight modules. One source of truth.</h2>
        <p style={sectionSub}>Enter your data once. ThemisIQ maps it across every module and framework automatically.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden', marginTop: '3rem' }}>
          {modules.map((mod, i) => (
            <a key={i} href={mod.href} style={{ background: mod.dark ? '#0d0d0d' : '#fff', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', textDecoration: 'none', transition: 'background 0.15s', cursor: 'pointer' }}
              onMouseEnter={e => { if (!mod.dark) (e.currentTarget as HTMLElement).style.background = '#f8f7f5' }}
              onMouseLeave={e => { if (!mod.dark) (e.currentTarget as HTMLElement).style.background = '#fff' }}>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: mod.dark ? 'rgba(255,255,255,0.4)' : '#888784' }}>{mod.family}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: mod.dark ? '#fff' : '#0d0d0d', lineHeight: 1.2 }}>{mod.name}</div>
              <div style={{ fontSize: 12, color: mod.dark ? 'rgba(255,255,255,0.5)' : '#555553', lineHeight: 1.6, fontWeight: 300 }}>{mod.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto', paddingTop: 8 }}>
                {mod.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: mod.dark ? 'rgba(255,255,255,0.08)' : '#f8f7f5', border: `0.5px solid ${mod.dark ? 'rgba(255,255,255,0.1)' : '#e8e7e4'}`, color: mod.dark ? 'rgba(255,255,255,0.5)' : '#888784' }}>{t}</span>)}
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <div style={{ padding: '5rem 2.5rem', background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={eyebrow}>How it works</p>
          <h2 style={sectionTitle}>One inventory. Every output.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2.5rem', marginTop: '3rem' }}>
            {[
              ['01', 'Connect your data', 'Manual entry, CSV import, or guided wizard — ThemisIQ collects activity data and maps it to the right scope automatically.'],
              ['02', 'Calculate with real factors', 'IPCC AR5, IEA 2024 grid factors, DEFRA 2024 — all versioned and auditable. Every result traces back to its source.'],
              ['03', 'Report to every framework', 'CARB SB 253, CDP, ESRS E1, EcoVadis — generated automatically from your single inventory.'],
              ['04', 'Get assured', "ThemisIQ's audit trail and assurance package give your verifier everything they need for limited or reasonable assurance."],
            ].map(([num, title, desc]) => (
              <div key={num}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', fontWeight: 400, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', opacity: 0.5, marginBottom: '0.75rem' }}>{num}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── PRICING ── */}
      <section style={{ padding: '5rem 2.5rem', background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={eyebrow}>Pricing</p>
          <h2 style={sectionTitle}>Simple, honest pricing.</h2>
          <p style={{ ...sectionSub, marginBottom: '0.5rem' }}>
            Whether your driver is a regulator, a board, an investor, or a customer — ThemisIQ is your sustainability compliance reporting solution.
          </p>
          <p style={{ fontSize: 12, color: '#9ca3af', fontWeight: 300, marginBottom: '2.5rem' }}>All prices in USD</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>

            {/* Starter */}
            <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }}>Starter</div>
              <div style={{ fontSize: 11, color: '#888784', textDecoration: 'line-through', marginBottom: 2 }}>$1,499</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>$799<span style={{ fontSize: 11, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
              <div style={{ fontSize: 9, color: '#92400e', background: '#FEF3E2', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginBottom: 16 }}>Early access</div>
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, flex: 1 }}>
                <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>Core reports for each module you select</div>
                {['Core reporting frameworks', 'Assurance-ready workings', 'Audit trail — every entry logged', 'ThemisIQ Wizard — always on'].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 7, fontSize: 12, color: '#374151', marginBottom: 5 }}>
                    <span style={{ color: '#0F6E56', flexShrink: 0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <a href="/pricing" style={{ display: 'block', textAlign: 'center', padding: '9px', borderRadius: 8, background: '#f8f7f5', border: '1px solid #e8e7e4', fontSize: 12, fontWeight: 500, color: '#0d0d0d', textDecoration: 'none', marginTop: 16 }}>Get started</a>
            </div>

            {/* Professional */}
            <div style={{ background: '#0d0d0d', border: '2px solid #7425e3', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#0d0d0d', padding: '2px 10px', borderRadius: 99, whiteSpace: 'nowrap' }}>Most popular</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 8 }}>Professional</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', marginBottom: 4 }}>$2,499<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}> /module/yr</span></div>
              <div style={{ fontSize: 9, color: '#a78bfa', background: 'rgba(116,37,227,0.15)', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginBottom: 16 }}>All frameworks</div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, flex: 1 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>All frameworks for your selected modules</div>
                {['Everything in Starter', 'All reporting frameworks', 'Multi-entity · 10 entities · 10 users', 'Verifier & third-party access role', 'Regulatory monitor — weekly alerts'].map((f, i) => (
                  <div key={f} style={{ display: 'flex', gap: 7, fontSize: 12, color: i === 0 ? 'rgba(255,255,255,0.45)' : '#fff', marginBottom: 5 }}>
                    <span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <a href="/pricing" style={{ display: 'block', textAlign: 'center', padding: '9px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', fontSize: 12, fontWeight: 600, color: '#0d0d0d', textDecoration: 'none', marginTop: 16 }}>Get started</a>
            </div>

            {/* Advisory */}
            <div style={{ background: '#fff', border: '1px solid #1fb1ff', borderRadius: 14, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1fb1ff', marginBottom: 8 }}>Advisory</div>
              <div style={{ fontSize: 28, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>$4,999<span style={{ fontSize: 11, color: '#888784', fontWeight: 400 }}> /module/yr</span></div>
              <div style={{ fontSize: 9, color: '#0C447C', background: '#E6F1FB', borderRadius: 99, padding: '2px 8px', display: 'inline-block', marginBottom: 16 }}>+ Expert guidance</div>
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12, flex: 1 }}>
                <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>Platform + dedicated expert guidance</div>
                {['Everything in Professional', 'Onboarding session', 'Guided inventory review', 'Sector-specific guidance', 'Board-ready narrative'].map(f => (
                  <div key={f} style={{ display: 'flex', gap: 7, fontSize: 12, color: '#374151', marginBottom: 5 }}>
                    <span style={{ color: '#1fb1ff', flexShrink: 0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <a href="/advisory" style={{ display: 'block', textAlign: 'center', padding: '9px', borderRadius: 8, background: '#0d0d0d', fontSize: 12, fontWeight: 500, color: '#fff', textDecoration: 'none', marginTop: 16 }}>Talk to us</a>
            </div>

          </div>

          {/* Module pills */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 10 }}>Available compliance modules</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { label: 'Climate — GHG Inventory · Scope 1 & 2', href: '/climate-ghg' },
                { label: 'Climate Risk', href: '/dashboard/ghg' },
                { label: 'Supply Chain & Scope 3', href: '/supply-chain' },
                { label: 'People & Workforce', href: '/people' },
                { label: 'Deals & Investment', href: '/deals' },
                { label: 'AI Governance', href: '/ai-governance' },
                { label: 'Cyber Governance', href: '/cyber' },
              ].map(m => (
                <a key={m.label} href={m.href} style={{ fontSize: 11, fontWeight: 500, color: '#0d0d0d', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '6px 10px', textDecoration: 'none' }}>{m.label}</a>
              ))}
            </div>
          </div>

          {/* Bundle hint + see full pricing */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#374151' }}>
              <span style={{ fontWeight: 600 }}>Platform Bundle:</span>
              <span style={{ color: '#888784' }}> 2 modules = 10% off · 3+ modules = 20% off · applied automatically</span>
            </div>
            <a href="/pricing" style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', textDecoration: 'none' }}>See full pricing & build your platform →</a>
          </div>

        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center', borderTop: '0.5px solid #e8e7e4' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          The SB 253 deadline is <em style={gradText}> {daysLeft} days away.</em>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          ThemisIQ can have your Scope 1 and 2 inventory complete and the CARB template pre-filled in days — not months.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/dashboard/ghg" style={{ ...btnPrimary, textDecoration: 'none' }}>See your emissions instantly — no credit card needed</a>
          <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Book a 30-min demo</a>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '3.5rem 2.5rem 2rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr', gap: '3rem' }}>
          <div>
            <Logo size={130} />
            <p style={{ fontSize: 13, color: '#888784', lineHeight: 1.65, fontWeight: 300, marginTop: '1rem', maxWidth: 270 }}>
              Compliance Intelligence for Sustainable Business. GHG emissions, climate risk, supply chain, M&A diligence, AI governance, people & workforce, and cybersecurity — one platform.
            </p>
          </div>
          {[
            { heading: 'Products', links: ['Climate · GHG', 'Climate · Risk', 'Supply Chain', 'Deals & Investment', 'AI Governance', 'People & Workforce', 'Cyber Governance', 'Advisory'] },
            { heading: 'Frameworks', links: ['SB 253 · SB 261', 'ESRS / CSRD', 'IFRS S2', 'CDP Climate', 'EcoVadis', 'GHG Protocol', 'TCFD · SBTi', 'NIST CSF · AI RMF'] },
            { heading: 'Company', links: ['Advisory', 'Pricing', 'Privacy Policy', 'Terms of Service', 'Security', 'Contact'] },
          ].map(col => (
            <div key={col.heading}>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#888784', marginBottom: '1rem' }}>{col.heading}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {col.links.map(l => <a key={l} href={l === "Privacy Policy" ? "/privacy" : l === "Terms of Service" ? "/terms" : l === "Security" ? "/security" : l === "Pricing" ? "/pricing" : "#"} style={{ fontSize: 13, color: '#555553', textDecoration: 'none' }}>{l}</a>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 1100, margin: '2.5rem auto 0', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co · All rights reserved</div>
          <div style={{ fontSize: 12, color: '#888784' }}>Compliance Intelligence for Sustainable Business</div>
        </div>
      </footer>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; }
        a { cursor: pointer; }
      `}</style>
    </div>
  )
}

// ── LOGO COMPONENT ──────────────────────────────────────────────────
function Logo({ size = 130 }: { size?: number }) {
  const height = Math.round(size * 0.29)
  return (
    <img
      src="/logo.png"
      alt="ThemisIQ"
      width={size}
      height={height}
      style={{ display: 'block' }}
    />
  )
}

// ── DATA ────────────────────────────────────────────────────────────
const modules = [
  { family: 'ThemisIQ Climate', name: 'GHG Emissions', desc: 'Full Scope 1, 2 and 3 inventory under GHG Protocol. Audit-trail-first, verifier-ready. CARB SB 253 pre-filled export.', tags: ['SB 253', 'CDP C6', 'ESRS E1-6', 'GHG Protocol'], href: '/climate-ghg', dark: false },
  { family: 'ThemisIQ Climate', name: 'Climate Risk', desc: 'TCFD-aligned physical and transition risk disclosures. Scenario analysis under IPCC 1.5°C, 2°C, and 3°C pathways.', tags: ['SB 261', 'IFRS S2', 'TCFD', 'CDP-P'], href: '/dashboard/ghg', dark: false },
  { family: 'ThemisIQ', name: 'Supply Chain & Scope 3', desc: 'Supplier emissions mapping. Scope 3 Cat. 1 primary data collection portal. Labour compliance. Human rights risk.', tags: ['Scope 3 Cat.1', 'EcoVadis', 'ESRS S2', 'CS3D'], href: '/supply-chain', dark: false },
  { family: 'ThemisIQ', name: 'Deals & Investment', desc: 'M&A climate diligence. Transition risk quantification. Portfolio benchmarking. Investment committee reporting.', tags: ['M&A diligence', 'PE / family office', 'IFRS S2', 'TCFD'], href: '/deals', dark: false },
  { family: 'ThemisIQ', name: 'AI Governance', desc: 'AI risk register. Model inventory. Policy management. EU AI Act readiness. Board-level AI oversight documentation.', tags: ['EU AI Act', 'NIST AI RMF', 'ISO 42001', 'Model risk'], href: '/ai-governance', dark: false },
  { family: 'ThemisIQ', name: 'People & Workforce', desc: 'Human capital reporting. DEI metrics. Pay equity and gender pay gap. Health & safety. Training management.', tags: ['ESRS S1', 'GRI 401-410', 'Pay Transparency', 'CA Pay Data'], href: '/people', dark: false },
  { family: 'ThemisIQ', name: 'Cyber Governance', desc: 'Cyber risk registers. Policy management. Vendor cybersecurity reviews. Incident workflows. CISO dashboards.', tags: ['NIS2', 'DORA', 'ISO 27001', 'NIST CSF'], href: '/cyber', dark: false },
  { family: 'ThemisIQ', name: 'Advisory Concierge', desc: 'Expert guidance across any module. Regulatory filing, verifier preparation, board reporting, M&A diligence support.', tags: ['Expert-led', 'Fixed fees', 'Named advisor', 'All modules'], href: '/advisory', dark: true },
]

// ── STYLES ──────────────────────────────────────────────────────────
const navLink: React.CSSProperties = { fontSize: 13, color: '#555553', textDecoration: 'none' }
const btnOutline: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', cursor: 'pointer' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', cursor: 'pointer', display: 'inline-block' }
const gradText: React.CSSProperties = { fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, lineHeight: 1.75, fontWeight: 300 }
