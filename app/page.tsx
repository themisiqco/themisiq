'use client'
import HomePricing from './components/HomePricing'
import { SB253_FIRST_REPORT_DATE, SB253_DATE_STATUS } from '../lib/sb253'
// PACKS dropped from this import with the old-model cards below — it is retired (see the note above
// its declaration in lib/pricing.ts). NEW_PRICING_ACTIVE STAYS: the live cards still gate on it.
import { NEW_PRICING_ACTIVE } from '../lib/pricing'
import { PACK_SLUG_MODULES } from '../lib/packEntryPoints'
import Nav from './components/Nav'
import Footer from './components/Footer'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'

export default function Home() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d', margin: 0, padding: 0 }}>
      <Nav />

      {/* ── HERO ── */}
      <section style={{ padding: '7rem 2.5rem 5rem', borderBottom: '0.5px solid #e8e7e4', textAlign: 'center' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '3.5rem' }}>
            <Logo size={320} />
            <p style={{ fontSize: 15, color: 'var(--color-ink-muted)', letterSpacing: '0.02em', fontWeight: 400 }}>
              Compliance Intelligence for Sustainable Business
            </p>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.6rem, 5vw, 4rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
            Countless compliance requirements.<br />
            <em style={gradText}>One Intelligent Platform.</em>
          </h1>
          <p style={{ fontSize: 17, color: '#555553', maxWidth: 580, margin: '0 auto 2.5rem', fontWeight: 400, lineHeight: 1.75 }}>
            From GHG emissions and climate risk to supply chain, M&A diligence, AI governance, workforce, and cybersecurity — ThemisIQ turns complex compliance into competitive clarity.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>See where you stand — free assessment →</a>
            <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to a specialist</a>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#555553', background: '#f8f7f5', border: '0.5px solid #e8e7e4', padding: '8px 16px', borderRadius: 99 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#B91C1C', display: 'inline-block', animation: 'pulse 1.8s infinite' }} />
            SB 253 first report: {SB253_FIRST_REPORT_DATE} ({SB253_DATE_STATUS}) — Scope 1 + 2
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
                <div style={{ fontSize: 12, color: 'var(--color-brand)', fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>Check your compliance deadlines →</div>
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{label}</div>
              </a>
            ) : (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 400, color: 'var(--color-brand)', marginBottom: 4 }}>{val}</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{label}</div>
              </>
            )}
          </div>
        ))}
      </div>

     {/* ── TRUST BAR ── */}
      <div className="tq-band-bleed" style={{ padding: '1.5rem 2.5rem', textAlign: 'center' as const }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1rem, 2vw, 1.3rem)', fontWeight: 400, marginBottom: '1rem', lineHeight: 1.5 }}>
            We know trust is everything. At ThemisIQ, you can trust our methodologies and how we handle your data.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <a href="/methodology" style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', textDecoration: 'none', background: 'none' }}>Our methodologies →</a>
            <a href="/trust" style={{ fontSize: 13, fontWeight: 500, padding: '8px 20px', borderRadius: 8, border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', textDecoration: 'none', background: 'none' }}>How we handle your data →</a>
          </div>
        </div>
      </div>
      {/* ── FRAMEWORKS ── */}
      <div style={{ padding: '4rem 2.5rem', background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }}>Framework coverage</p>
          <p style={{ fontSize: 14, color: '#555553', fontWeight: 400, marginBottom: '1.5rem' }}>Every major regulatory and voluntary framework. Pre-mapped. Export-ready.</p>
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
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, color: '#0d0d0d', lineHeight: 1.2 }}>{mod.name === 'Supply Chain & Scope 3' ? <>Supply Chain &amp; <span style={{ whiteSpace: 'nowrap' }}>Scope 3</span></> : mod.name}</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 400 }}>{mod.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto', paddingTop: 8 }}>
                {mod.tags.map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: 'var(--color-ink-muted)' }}>{t}</span>)}
              </div>
            </a>
          ))}
        </div>

        {/* Advisory — full-width closing band below the 4×2 module grid (moved out of the grid) */}
        <CrossLinkBand
          href="/advisory"
          label="Advisory Services"
          title="Available across all modules"
          body="Expert advisory services — sector-specific guidance, assurance prep, and board-ready narratives from practitioners who speak your language."
          cta="Talk to a specialist"
          style={{ marginTop: '1.25rem' }}
        />
      </section>

      {/* ── MATERIALITY CAPABILITY STRIP ── */}
      <section style={{ padding: '0 2.5rem', marginTop: '-1rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <CrossLinkBand
            href="/materiality"
            label="Single or double · which one applies to you"
            title="The Materiality Assessment"
            body="Single materiality for IFRS S2, double materiality for CSRD — the methodology your auditor expects. See two sample reports for the same entity."
            cta="See sample reports"
          />
        </div>
      </section>

      {/* ── FLAGSHIP: CLIMATE RESILIENCE REPORT SHOWCASE ──
      ⚠️ A SECTION ON THE PAGE, NOT A BAND. It was a full-bleed '#0d0d0d' block. A dark band and a
      tinted band both read as "marketing"; a 2px ink rule and a heading read as "next section",
      which is what this is. The change is also forced, not stylistic: the scenario ramp below needs
      white beneath it — var(--color-module-climate) measures 4.29:1 on the teal band, under AA. */}
      <section style={{ padding: '4rem 2.5rem 5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', borderTop: '2px solid var(--color-ink)', paddingTop: '2.25rem' }}>
          <div style={{ maxWidth: 640, marginBottom: '2.5rem' }}>
            <p style={{ ...eyebrow, marginBottom: 8 }}>Flagship output · Climate Risk &amp; Materiality</p>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: '1rem' }}>
              A climate resilience report that holds up under scrutiny.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.75, fontWeight: 400 }}>
              IFRS S2 and CSRD/ESRS don&apos;t just ask you to run a scenario — they ask you to show resilience across a <em>diverse range</em> of climate futures, and to document the judgment behind it. ThemisIQ produces exactly that: a multi-scenario resilience report, generated from your assessment, with every figure traceable to its basis.
            </p>
          </div>

          {/* The diverse trio — the ONE tier that stays cards: three parallel, comparable things
          with figures. Colour is on the 4px TOP rule and the figure, never the fill, per the EDGE
          VOCABULARY in app/styles/themisiq-tokens.css. Cool to warm across the module hues, which
          measure 6.50 / 5.55 / 7.53 on white; on the retired dark band their predecessors were
          lime, sky and amber, which fall to 1.33 / 2.39 / 3.72 the moment the ground goes light. */}
          <div style={subHead}>Tested across a diverse trio of scenarios</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: '2.5rem' }}>
            {[
              { role: 'Paris-aligned', warming: '~1.8°C', src: 'IPCC SSP1-2.6', tone: 'var(--color-module-cbam)' },
              { role: 'Current trajectory', warming: '~2.7°C', src: 'IPCC SSP2-4.5', tone: 'var(--color-module-climate)' },
              { role: 'High warming', warming: '~4.4°C', src: 'IPCC SSP5-8.5', tone: 'var(--color-module-cyber)' },
            ].map(s => (
              <div key={s.role} style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: `4px solid ${s.tone}`, borderRadius: 6, padding: '1.25rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 400, color: s.tone, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.warming}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginTop: 8 }}>{s.role}</div>
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>{s.src}</div>
              </div>
            ))}
          </div>

          {/* What the report documents — the credibility registers.
          ⚠️ NOT CARDS ANY MORE, AND THE REASON IS MEASURED. These were six panels with their own
          fill, i.e. a second light tier on top of the section's own light ground — but paper reads
          1.07:1 against that ground and sunken 1.08:1, so no light fill can announce itself as a
          separate surface. A tier that cannot be seen is not a tier. Six unlike statements are a
          definition list, so that is what they are now: a hairline rule between rows, label left,
          text right. The 2px left border went with the card — by then it was brand teal, not the
          old violet (task 21 converted it), so it was removed on the edge vocabulary, not colour. */}
          <div style={subHead}>Documented for assurance, not just generated</div>
          <dl style={{ margin: '0 0 2.5rem', borderTop: '1px solid var(--color-line-strong)' }}>
            {[
              ['Resilience conclusion', 'A rules-based read of how exposure shifts across the trio — persistent, warming-driven, or policy-driven.'],
              ['Scenario rationale', 'Why these pathways, including a Paris-aligned scenario as IFRS S2 requires — the choice itself is disclosable.'],
              ['Methodology & basis', 'IPCC AR6 regions and impact-drivers, TCFD transition categories, SSP scenarios — public frameworks throughout.'],
              ['Assumptions register', 'Every weighting and threshold stated as a disclosed methodological choice, not a black box.'],
              ['Data lineage', 'A clear boundary between your inputs and platform reference defaults — what assurance needs to see.'],
              ['Limitations & notice', 'Where the screening ends and formal assessment begins, with a formal Important Notice on every report.'],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 230px) 1fr', gap: '1.5rem', padding: '15px 0', borderBottom: '1px solid var(--color-line)' }}>
                <dt style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', margin: 0 }}>{title}</dt>
                <dd style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, fontWeight: 400, margin: 0, maxWidth: '62ch' }}>{desc}</dd>
              </div>
            ))}
          </dl>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const }}>
            <a href="/dashboard/climate-risk" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your climate risk</a>
            <a href="/climate-risk" style={{ ...btnSecondary, textDecoration: 'none' }}>See how it works</a>
            <span style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Also produces the CSRD double-materiality matrix across all ten ESRS topics.</span>
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
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 400, color: 'var(--color-brand)', opacity: 0.5, marginBottom: '0.75rem' }}>{num}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 400 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Starter Packs ── */}
      <section style={{ padding: '5rem 2.5rem', background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-ink-muted)', marginBottom: 8 }}>Not sure where to start?</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>Built for who's asking.</h2>
            <p style={{ fontSize: 15, color: '#555553', maxWidth: 520, margin: '0 auto', fontWeight: 400 }}>Whether it's a customer, your bank, your board or your investor — here's where to start for each.</p>
          </div>
          {/* The OLD-model cards stood here — four priced pack tiles reading PACKS and routing to
              /get-started/*. Deleted, not left behind a flag: NEW_PRICING_ACTIVE has been true since
              the June 2026 rescope so they could not render, and every price they carried is 43-78%
              under what cartQuote charges for the same modules (see the retirement note on PACKS in
              lib/pricing.ts). A dead branch holding under-priced money is worth less than nothing —
              it reads as a rollback that is still available, and it is not.
              The cards below are the live ones: same four use cases, no price, straight into the
              configurator. */}

          {/* Use-case pack cards (NEW model) — configurator entry points, no price */}
          {NEW_PRICING_ACTIVE && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {[
              { slug: 'supplier', name: 'Supplier Readiness', driver: 'A customer is asking', color: '#0F6E56', items: ['GHG Inventory', 'Supply Chain risk register', 'Supplier questionnaire'] },
              { slug: 'climate', name: 'Climate Readiness', driver: 'Your bank is asking', color: '#0C447C', items: ['GHG Inventory', 'Climate Risk assessment', 'TCFD / IFRS S2 output'] },
              { slug: 'foundation', name: 'ESG Foundation', driver: 'Your board wants it', color: '#7425e3', items: ['GHG Inventory', 'People & Workforce', 'Climate Risk'] },
              { slug: 'investor', name: 'Investor ESG', driver: 'Your investor requires it', color: '#B91C1C', items: ['GHG Inventory', 'Climate Risk', 'Supply Chain', 'Deals & Investment'] },
            ].map(pack => (
              <a key={pack.name} href={`/pricing?modules=${PACK_SLUG_MODULES[pack.slug]}`} style={{ background: '#fff', border: `1.5px solid color-mix(in srgb, ${pack.color} 15%, transparent)`, borderRadius: 14, padding: '1.5rem', textDecoration: 'none', display: 'block', transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = pack.color}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = `color-mix(in srgb, ${pack.color} 15%, transparent)`}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: pack.color, marginBottom: 6 }}>{pack.driver}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 12 }}>{pack.name}</div>
                {pack.items.map(item => (
                  <div key={item} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <span style={{ color: pack.color, flexShrink: 0, fontSize: 12 }}>✓</span>
                    <span style={{ fontSize: 12, color: '#555553' }}>{item}</span>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 12 }}>Multi-module — priced in the configurator</div>
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
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          The first SB 253 report is <em style={gradText}> {SB253_FIRST_REPORT_DATE}, {SB253_DATE_STATUS}.</em>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 400, lineHeight: 1.7 }}>
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
  { family: 'ThemisIQ Climate', name: 'Climate Risk', desc: 'TCFD-aligned physical and transition risk disclosures. Scenario analysis under IPCC pathways to ~1.8°C, ~2.7°C and ~4.4°C.', tags: ['SB 261', 'IFRS S2', 'TCFD', 'CDP-P'], href: '/dashboard/climate-risk', dark: false },
  { family: 'ThemisIQ', name: 'Supply Chain & Scope 3', desc: 'Supplier emissions mapping. Scope 3 Cat. 1 primary data collection portal. Labour compliance. Human rights risk.', tags: ['Scope 3 Cat.1', 'EcoVadis', 'ESRS S2', 'CS3D'], href: '/supply-chain', dark: false },
  { family: 'ThemisIQ', name: 'Deals & Investment', desc: 'M&A climate diligence. Investment committee reporting.', tags: ['M&A diligence', 'PE / family office', 'IFRS S2', 'TCFD'], href: '/deals', dark: false },
  { family: 'ThemisIQ', name: 'AI Governance', desc: 'AI risk register. Model inventory. Policy management. EU AI Act readiness. Board-level AI oversight documentation.', tags: ['EU AI Act', 'NIST AI RMF', 'ISO 42001', 'Model risk'], href: '/ai-governance', dark: false },
  { family: 'ThemisIQ', name: 'People & Workforce', desc: 'Human capital reporting. DEI metrics. Pay equity and gender pay gap. Health & safety. Training management.', tags: ['ESRS S1', 'GRI 401-410', 'Pay Transparency', 'CA Pay Data'], href: '/people', dark: false },
  { family: 'ThemisIQ', name: 'Cyber Governance', desc: 'Cyber risk registers. Policy management. Vendor cybersecurity reviews. Incident workflows. CISO dashboards.', tags: ['NIS2', 'DORA', 'ISO 27001', 'NIST CSF'], href: '/cyber', dark: false },
  { family: 'ThemisIQ', name: 'CBAM', desc: 'Carbon Border Adjustment Mechanism. Specific embedded emissions for goods entering the EU — installation-level actuals, direct and indirect, with an Annex IV §1.2 summary you can hand to a verifier.', tags: ['Non-EU exporters', '(EU) 2023/956', 'Annex IV §1.2 summary'], href: '/cbam', dark: false },
]

/**
 * The two cross-link bands — Advisory and The Materiality Assessment — as ONE component.
 *
 * ⚠️ THEY WERE ALWAYS THE SAME COMPONENT IN TWO COLOURS. Identical shape: a flex row with an
 * eyebrow, a display heading, a supporting line, and a button held right. One was '#0d0d0d' with
 * white text, the other '#fff' with ink. That is why converting either one alone would have made
 * them disagree — the shape said "these are a pair" while the colour said "these are unrelated".
 * They are one treatment now, so a change lands on both by construction rather than by memory.
 *
 * ⚠️ PLAIN 1px BORDER, DEFINITELY NOT A LEFT BAR. The EDGE VOCABULARY in
 * app/styles/themisiq-tokens.css reserves a 6px left edge for module identity and a 4px top edge
 * for semantic state; everything else takes a 1px border. A cross-link to Advisory is neither, and
 * the two bands share this component, so a module-identity edge here would assert that Advisory is
 * a module. The mockup drew a 6px brand left edge; the instruction overrides it, and this comment
 * is the record of why.
 *
 * ⚠️ HOVER CHANGES BACKGROUND, NEVER opacity. The dark band used `opacity: 0.9`, which composites
 * the whole element — label included — toward the page. See the DISABLED AND INACTIVE STATE block
 * in the token file: opacity is never applied to anything containing text.
 */
function CrossLinkBand({ href, label, title, body, cta, style }: {
  href: string; label: string; title: string; body: string; cta: string; style?: React.CSSProperties
}) {
  return (
    <a href={href} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap', background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 6, padding: '1.5rem 2rem', textDecoration: 'none', transition: 'background 0.15s', ...style }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-ground)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-paper)' }}>
      <div style={{ flex: '1 1 420px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-brand)', marginBottom: 6 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, fontWeight: 400, maxWidth: '60ch' }}>{body}</div>
      </div>
      <span style={{ ...btnPrimary, flexShrink: 0, whiteSpace: 'nowrap' }}>{cta}</span>
    </a>
  )
}

// ── STYLES ──────────────────────────────────────────────────────────
/** Sub-heading inside the flagship section, ruled off from the rows beneath it. */
const subHead: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--color-line-strong)' }
const navLink: React.CSSProperties = { fontSize: 13, color: '#555553', textDecoration: 'none' }
const btnOutline: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', cursor: 'pointer' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'var(--color-brand)', color: '#fff', border: 'none', cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }
const gradText: React.CSSProperties = { fontStyle: 'italic', color: 'var(--color-brand)' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, lineHeight: 1.75, fontWeight: 400 }
