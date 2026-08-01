'use client'
import HomePricing from './components/HomePricing'
import { useState, useEffect } from 'react'
import { PACKS, NEW_PRICING_ACTIVE } from '../lib/pricing'
import { PACK_SLUG_MODULES } from '../lib/packEntryPoints'
import Nav from './components/Nav'
import Footer from './components/Footer'

export default function Home() {
  const [daysLeft, setDaysLeft] = useState(81)
  useEffect(() => {
    const deadline = new Date('2026-11-10')
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
            Countless compliance requirements.<br />
            <em style={gradText}>One Intelligent Platform.</em>
          </h1>
          <p style={{ fontSize: 17, color: '#555553', maxWidth: 580, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.75 }}>
            From GHG emissions and climate risk to supply chain, M&A diligence, AI governance, workforce, and cybersecurity — ThemisIQ turns complex compliance into competitive clarity.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>See where you stand — free assessment →</a>
            <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to a specialist</a>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555553', background: '#f8f7f5', border: '0.5px solid #e8e7e4', padding: '8px 16px', borderRadius: 99 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#B91C1C', display: 'inline-block', animation: 'pulse 1.8s infinite' }} />
            SB 253 first-year deadline: November 10, 2026 — {daysLeft} days away
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderBottom: '0.5px solid #e8e7e4', background: '#f8f7f5' }}>
        {[
          ['7', 'Compliance modules'],
          ['30+', 'Frameworks covered'],
          ['Practitioner-built', 'Big 4 & consulting experience'],
          ['Audit-ready', 'Verifier-ready by design'],
          ['deadlines', 'Do you have upcoming compliance deadlines?'],
        ].map(([val, label], i) => (
          <div key={i} style={{ padding: '1.75rem 1rem', textAlign: 'center', borderRight: i < 4 ? '0.5px solid #e8e7e4' : 'none' }}>
            {val === 'deadlines' ? (
              <a href="/assess" style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ fontSize: 12, color: '#7425e3', fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>Check your compliance deadlines →</div>
                <div style={{ fontSize: 11, color: '#888784' }}>{label}</div>
              </a>
            ) : (
              <>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 4 }}>{val}</div>
                <div style={{ fontSize: 12, color: '#888784' }}>{label}</div>
              </>
            )}
          </div>
        ))}
      </div>

     {/* ── TRUST BAR ── */}
      <div style={{ background: '#0d0d0d', padding: '1.5rem 2.5rem', textAlign: 'center' as const }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1rem, 2vw, 1.3rem)', fontWeight: 400, color: '#fff', marginBottom: '1rem', lineHeight: 1.5 }}>
            We know trust is everything. At ThemisIQ, you can trust our methodologies and how we handle your data.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <a href="/methodology" style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.3)', color: '#fff', textDecoration: 'none', background: 'none' }}>Our methodologies →</a>
            <a href="/trust" style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.3)', color: '#fff', textDecoration: 'none', background: 'none' }}>How we handle your data →</a>
          </div>
        </div>
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
        <h2 style={sectionTitle}>Purpose-built modules. One source of truth.</h2>
        <p style={sectionSub}>Purpose-built for each obligation. Mapped to the frameworks that apply.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden', marginTop: '3rem' }}>
          {modules.filter(m => m.family !== 'Advisory').map((mod, i) => (
            <a key={i} href={mod.href} style={{ background: '#fff', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', textDecoration: 'none', transition: 'background 0.15s', cursor: 'pointer', borderRight: i % 4 < 3 ? '0.5px solid #e8e7e4' : 'none', borderBottom: i < 4 ? '0.5px solid #e8e7e4' : 'none' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8f7f5' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#0d0d0d', lineHeight: 1.2 }}>{mod.name === 'Supply Chain & Scope 3' ? <>Supply Chain &amp; <span style={{ whiteSpace: 'nowrap' }}>Scope 3</span></> : mod.name}</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{mod.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto', paddingTop: 8 }}>
                {mod.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#888784' }}>{t}</span>)}
              </div>
            </a>
          ))}
        </div>

        {/* Advisory — full-width closing band below the 4×2 module grid (moved out of the grid) */}
        <a href="/advisory" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem', flexWrap: 'wrap', marginTop: '1.25rem', background: '#0d0d0d', borderRadius: 16, padding: '2.5rem', textDecoration: 'none', transition: 'opacity 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.9' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 8 }}>Advisory Services</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: 8 }}>Available across all modules</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, fontWeight: 300 }}>Expert advisory services — sector-specific guidance, assurance prep, and board-ready narratives from practitioners who speak your language.</div>
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', padding: '12px 24px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>Talk to a specialist →</span>
        </a>
      </section>

      {/* ── MATERIALITY CAPABILITY STRIP ── */}
      <section style={{ padding: '0 2.5rem', marginTop: '-1rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <a href="/materiality" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '1.5rem 2rem', textDecoration: 'none', transition: 'background 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8f7f5' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#fff' }}>
            <div style={{ flex: '1 1 420px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 6 }}>Built into climate reporting · not a separate module</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', lineHeight: 1.2, marginBottom: 6 }}>The Materiality Assessment</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>Single materiality for IFRS S2, double materiality for CSRD — one engine, the methodology your auditor expects. See two sample reports for the same entity.</div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', padding: '11px 22px', borderRadius: 8, whiteSpace: 'nowrap' }}>See sample reports →</span>
          </a>
        </div>
      </section>

      {/* ── FLAGSHIP: CLIMATE RESILIENCE REPORT SHOWCASE ── */}
      <section style={{ background: '#0d0d0d', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ maxWidth: 640, marginBottom: '2.5rem' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Flagship output · Climate Risk &amp; Materiality</p>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              A climate resilience report that holds up under scrutiny.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, fontWeight: 300 }}>
              IFRS S2 and CSRD/ESRS don&apos;t just ask you to run a scenario — they ask you to show resilience across a <em>diverse range</em> of climate futures, and to document the judgment behind it. ThemisIQ produces exactly that: a multi-scenario resilience report, generated from your assessment, with every figure traceable to its basis.
            </p>
          </div>

          {/* The diverse trio */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Tested across a diverse trio of scenarios</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2rem' }}>
            {[
              { role: 'Paris-aligned', warming: '~1.8°C', src: 'IPCC SSP1-2.6', color: '#64fe3e' },
              { role: 'Current trajectory', warming: '~2.7°C', src: 'IPCC SSP2-4.5', color: '#1fb1ff' },
              { role: 'High warming', warming: '~4.4°C', src: 'IPCC SSP5-8.5', color: '#ba7517' },
            ].map(s => (
              <div key={s.role} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.25rem' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: s.color, lineHeight: 1 }}>{s.warming}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 8 }}>{s.role}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{s.src}</div>
              </div>
            ))}
          </div>

          {/* What the report documents — the credibility registers */}
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Documented for assurance, not just generated</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2.5rem' }}>
            {[
              ['Resilience conclusion', 'A rules-based read of how exposure shifts across the trio — persistent, warming-driven, or policy-driven.'],
              ['Scenario rationale', 'Why these pathways, including a Paris-aligned scenario as IFRS S2 requires — the choice itself is disclosable.'],
              ['Methodology & basis', 'IPCC AR6 regions and impact-drivers, TCFD transition categories, SSP scenarios — public frameworks throughout.'],
              ['Assumptions register', 'Every weighting and threshold stated as a disclosed methodological choice, not a black box.'],
              ['Data lineage', 'A clear boundary between your inputs and platform reference defaults — what assurance needs to see.'],
              ['Limitations & notice', 'Where the screening ends and formal assessment begins, with a formal Important Notice on every report.'],
            ].map(([title, desc]) => (
              <div key={title} style={{ background: 'rgba(255,255,255,0.03)', borderLeft: '2px solid rgba(116,37,227,0.6)', borderRadius: '0 10px 10px 0', padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, fontWeight: 300 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <a href="/dashboard/climate-risk" style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none' }}>Assess your climate risk →</a>
            <a href="/climate-risk" style={{ fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, border: '0.5px solid rgba(255,255,255,0.3)', color: '#fff', textDecoration: 'none' }}>See how it works</a>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Also produces the CSRD double-materiality matrix across all ten ESRS topics.</span>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <div style={{ padding: '5rem 2.5rem', background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={eyebrow}>How it works</p>
          <h2 style={sectionTitle}>Collect once. Comply everywhere.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2.5rem', marginTop: '3rem' }}>
            {[
              ['01', 'Tell us about your business', "Answer a few guided questions about your operations, locations, and obligations. ThemisIQ's Wizard does the heavy lifting — no compliance expertise required to get started."],
              ['02', 'We apply the right methodology', 'ThemisIQ automatically applies the correct frameworks, factors, and calculations for your selected modules — versioned, auditable, and traceable to source.'],
              ['03', 'Generate the reports you need', 'One data set. Numerous reports. Whether it\'s a regulator, an investor, a customer, or a board asking — ThemisIQ generates the right output automatically.'],
              ['04', 'Stand behind your numbers', 'Every calculation and data point is logged with a full audit trail. Your verifiers, auditors, and regulators get everything they need — without the scramble.'],
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

      {/* ── Starter Packs ── */}
      <section style={{ padding: '5rem 2.5rem', background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>Not sure where to start?</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Built for who's asking.</h2>
            <p style={{ fontSize: 15, color: '#555553', maxWidth: 520, margin: '0 auto', fontWeight: 300 }}>Whether it's a customer, your bank, your board or your investor — we've bundled exactly what you need.</p>
          </div>
          {/* Use-case pack cards (OLD model) */}
          {!NEW_PRICING_ACTIVE && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { name: 'Supplier Readiness', driver: 'A customer is asking', price: '$' + PACKS['supplier-readiness'].price.toLocaleString(), color: '#0F6E56', bg: '#E1F5EE', href: '/get-started/supplier', items: ['GHG Inventory', 'Supply Chain risk register', 'Supplier questionnaire'] },
              { name: 'Climate Readiness', driver: 'Your bank is asking', price: '$' + PACKS['climate-readiness'].price.toLocaleString(), color: '#0C447C', bg: '#E6F1FB', href: '/get-started/climate', items: ['GHG Inventory', 'Climate Risk assessment', 'TCFD / IFRS S2 output'] },
              { name: 'ESG Foundation', driver: 'Your board wants it', price: '$' + PACKS['esg-foundation'].price.toLocaleString(), color: '#7425e3', bg: '#EDE9FE', href: '/get-started/foundation', items: ['GHG Inventory', 'People & Workforce', 'Climate Risk'] },
              { name: 'Investor ESG', driver: 'Your investor requires it', price: '$' + PACKS['investor-esg'].price.toLocaleString(), color: '#B91C1C', bg: '#FCEBEB', href: '/get-started/investor', items: ['GHG Inventory', 'Climate Risk', 'Supply Chain', 'Deals & Investment'] },
            ].map(pack => (
              <a key={pack.name} href={pack.href} style={{ background: '#fff', border: `1.5px solid ${pack.color}25`, borderRadius: 14, padding: '1.5rem', textDecoration: 'none', display: 'block', transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = pack.color}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = pack.color + '25'}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: pack.color, marginBottom: 6 }}>{pack.driver}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 4 }}>{pack.name}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: pack.color, marginBottom: 12 }}>{pack.price}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'inherit' }}>/yr</span></div>
                {pack.items.map(item => (
                  <div key={item} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <span style={{ color: pack.color, flexShrink: 0, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 12, color: '#555553' }}>{item}</span>
                  </div>
                ))}
                <div style={{ marginTop: 16, fontSize: 12, fontWeight: 600, color: pack.color }}>See details →</div>
              </a>
            ))}
          </div>
          )}

          {/* Use-case pack cards (NEW model) — configurator entry points, no price */}
          {NEW_PRICING_ACTIVE && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { slug: 'supplier', name: 'Supplier Readiness', driver: 'A customer is asking', color: '#0F6E56', items: ['GHG Inventory', 'Supply Chain risk register', 'Supplier questionnaire'] },
              { slug: 'climate', name: 'Climate Readiness', driver: 'Your bank is asking', color: '#0C447C', items: ['GHG Inventory', 'Climate Risk assessment', 'TCFD / IFRS S2 output'] },
              { slug: 'foundation', name: 'ESG Foundation', driver: 'Your board wants it', color: '#7425e3', items: ['GHG Inventory', 'People & Workforce', 'Climate Risk'] },
              { slug: 'investor', name: 'Investor ESG', driver: 'Your investor requires it', color: '#B91C1C', items: ['GHG Inventory', 'Climate Risk', 'Supply Chain', 'Deals & Investment'] },
            ].map(pack => (
              <a key={pack.name} href={`/pricing?modules=${PACK_SLUG_MODULES[pack.slug]}`} style={{ background: '#fff', border: `1.5px solid ${pack.color}25`, borderRadius: 14, padding: '1.5rem', textDecoration: 'none', display: 'block', transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = pack.color}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = pack.color + '25'}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: pack.color, marginBottom: 6 }}>{pack.driver}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>{pack.name}</div>
                {pack.items.map(item => (
                  <div key={item} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <span style={{ color: pack.color, flexShrink: 0, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 12, color: '#555553' }}>{item}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: '#888784', marginTop: 12 }}>Multi-module — priced in the configurator</div>
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: pack.color }}>Configure →</div>
              </a>
            ))}
          </div>
          )}
        </div>
      </section>
      <HomePricing />
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
      <Footer />

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
  { family: 'ThemisIQ Climate', name: 'Climate Risk', desc: 'TCFD-aligned physical and transition risk disclosures. Scenario analysis under IPCC 1.5°C, 2°C, and 3°C pathways.', tags: ['SB 261', 'IFRS S2', 'TCFD', 'CDP-P'], href: '/dashboard/climate-risk', dark: false },
  { family: 'ThemisIQ', name: 'Supply Chain & Scope 3', desc: 'Supplier emissions mapping. Scope 3 Cat. 1 primary data collection portal. Labour compliance. Human rights risk.', tags: ['Scope 3 Cat.1', 'EcoVadis', 'ESRS S2', 'CS3D'], href: '/supply-chain', dark: false },
  { family: 'ThemisIQ', name: 'Deals & Investment', desc: 'M&A climate diligence. Transition risk quantification. Portfolio benchmarking. Investment committee reporting.', tags: ['M&A diligence', 'PE / family office', 'IFRS S2', 'TCFD'], href: '/deals', dark: false },
  { family: 'ThemisIQ', name: 'AI Governance', desc: 'AI risk register. Model inventory. Policy management. EU AI Act readiness. Board-level AI oversight documentation.', tags: ['EU AI Act', 'NIST AI RMF', 'ISO 42001', 'Model risk'], href: '/ai-governance', dark: false },
  { family: 'ThemisIQ', name: 'People & Workforce', desc: 'Human capital reporting. DEI metrics. Pay equity and gender pay gap. Health & safety. Training management.', tags: ['ESRS S1', 'GRI 401-410', 'Pay Transparency', 'CA Pay Data'], href: '/people', dark: false },
  { family: 'ThemisIQ', name: 'Cyber Governance', desc: 'Cyber risk registers. Policy management. Vendor cybersecurity reviews. Incident workflows. CISO dashboards.', tags: ['NIS2', 'DORA', 'ISO 27001', 'NIST CSF'], href: '/cyber', dark: false },
  { family: 'ThemisIQ', name: 'CBAM', desc: 'Carbon Border Adjustment Mechanism. Specific embedded emissions for goods entering the EU — installation-level actuals, direct and indirect, with an Annex IV §1.2 summary you can hand to a verifier.', tags: ['Non-EU exporters', '(EU) 2023/956', 'Annex IV §1.2 summary'], href: '/cbam', dark: false },
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
