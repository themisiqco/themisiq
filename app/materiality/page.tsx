'use client'

// app/materiality/page.tsx
// ThemisIQ — Materiality Assessment marketing landing page.
//
// Cold-visitor target. Conversion mechanic: download the two sample PDFs
// (Model 3 — see samples, then login or talk to a specialist).
// Tone: restrained-and-credible, matching the existing site voice.
// Audience: anyone holding sustainability-disclosure responsibility —
// compliance, legal, finance, or sustainability — since not every company
// has a dedicated sustainability lead.

import Link from 'next/link'
import { PACKS, NEW_PRICING_ACTIVE, cartQuote, type ModuleKey } from '@/lib/pricing'

const GRAD = 'linear-gradient(135deg, #7425e3, #1fb1ff, #64fe3e)'

// ─── Page-level shared styles ────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'system-ui, sans-serif', background: '#f8f7f5', minHeight: '100vh' },
  nav: { background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky' as const, top: 0, zIndex: 100 },
  wrap: { maxWidth: 860, margin: '0 auto', padding: '0 2rem' },
  section: { padding: '3rem 0', borderBottom: '0.5px solid #e8e7e4' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 10 },
  sectionLead: { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.8, marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#7425e3', marginBottom: 8 },
}

const gradText: React.CSSProperties = {
  background: GRAD,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

const primaryBtn: React.CSSProperties = {
  padding: '11px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  color: '#0d0d0d', background: GRAD, border: 'none', cursor: 'pointer',
  whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block',
}
const ghostBtn: React.CSSProperties = {
  padding: '11px 22px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  color: '#0d0d0d', background: '#fff', border: '1px solid #e8e7e4',
  cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block',
}

export default function MaterialityMarketingPage() {
  return (
    <div style={s.page}>

      {/* Nav */}
      <nav style={s.nav}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href="/">
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
          </Link>
          <span style={{ fontSize: 12, color: '#888784' }}>/ Materiality</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/pricing" style={ghostBtn}>Pricing</Link>
          <Link href="/advisory" style={primaryBtn}>Talk to a specialist →</Link>
        </div>
      </nav>

      <div style={s.wrap}>

        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <section style={{ ...s.section, paddingTop: '4rem', textAlign: 'center', borderBottom: 'none' }}>
          <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7425e3', border: '1px solid rgba(116,37,227,0.2)', borderRadius: 99, padding: '4px 14px', marginBottom: 16 }}>
            IFRS S2 · CSRD ESRS · TCFD-aligned
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 400, color: '#0d0d0d', lineHeight: 1.2, marginBottom: 16 }}>
            The Materiality Assessment<br />
            <span style={gradText}>Knowing what matters for your organization.</span>
          </h1>
          <p style={{ fontSize: 15, color: '#555553', fontWeight: 300, lineHeight: 1.8, maxWidth: 620, margin: '0 auto 28px' }}>
            Materiality determination is now a mandatory part of sustainability disclosure under both IFRS S2 and CSRD ESRS. ThemisIQ's Materiality Assessment delivers single materiality for IFRS S2 and double materiality for CSRD — through one engine, with the methodology your auditor expects.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="#samples" style={primaryBtn}>See a sample report ↓</a>
            <Link href="/advisory" style={ghostBtn}>Talk to a specialist</Link>
          </div>
        </section>

        {/* ── REGULATORY URGENCY ─────────────────────────────────────────── */}
        <section style={s.section}>
          <div style={s.eyebrow}>Why now</div>
          <h2 style={s.sectionTitle}>Materiality determination is no longer optional.</h2>
          <p style={s.sectionLead}>
            Both major global frameworks now require entities to formally determine which sustainability topics are material — and to document the methodology behind that judgment. Auditors and assurance providers expect to see this work, not just its conclusions.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 8 }}>
            <div style={{ background: '#E6F1FB', border: '1px solid rgba(12,68,124,0.15)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 6 }}>IFRS S2 / ISSB</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>Active globally</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                Effective FY2024+ in Canada (CSDS), the UK, Australia, New Zealand, Brazil, Japan and across 30+ ISSB-adopting jurisdictions. S2 requires identifying climate-related risks and opportunities that could reasonably be expected to affect enterprise value — a single (financial) materiality judgment.
              </p>
            </div>
            <div style={{ background: '#FEF3E2', border: '1px solid rgba(186,117,23,0.15)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ba7517', marginBottom: 6 }}>CSRD / ESRS</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>Wave 2 · 2026</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                Large EU companies and EU-listed entities file their first ESRS reports starting in 2026 for FY2025 data; Wave 2 listed SMEs follow for FY2026. CSRD requires <em>double materiality</em> — the topics that affect the entity (financial) and those the entity affects (impact), across all ten ESRS topical standards.
              </p>
            </div>
          </div>
        </section>

        {/* ── WHO IN YOUR ORG ────────────────────────────────────────────── */}
        <section style={s.section}>
          <div style={s.eyebrow}>Who needs this in your organization</div>
          <h2 style={s.sectionTitle}>Compliance, Legal, Finance, or Sustainability — whoever is holding the question.</h2>
          <p style={s.sectionLead}>
            Sustainability disclosure obligations are landing across functions. Many organizations don't yet have a dedicated sustainability lead — the responsibility falls to whoever is closest to the regulatory exposure. The Materiality Assessment is designed to be useful regardless of where you sit.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginTop: 8 }}>
            {[
              { who: 'Compliance', what: 'Documented methodology, audit trail, and defensible scoping for regulatory submissions.' },
              { who: 'Legal', what: 'Framework alignment (IPCC AR6, TCFD, ESRS) — no licensed third-party classification reproduced. Clear limitations stated.' },
              { who: 'Finance', what: 'Financial materiality scoring across topics, with the scenario rationale required by S2 and ESRS.' },
              { who: 'Sustainability', what: 'Double materiality matrix, full ESRS topic coverage, methodology built on public frameworks.' },
            ].map(role => (
              <div key={role.who} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 6 }}>{role.who}</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{role.what}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── WHAT IS MATERIALITY ─────────────────────────────────────────── */}
        <section style={s.section}>
          <div style={s.eyebrow}>What is materiality assessment?</div>
          <h2 style={s.sectionTitle}>Single materiality, double materiality — what's the difference?</h2>
          <p style={s.sectionLead}>
            Both frameworks ask you to identify which sustainability topics are material. They differ on what counts as material — and that distinction is what separates an S2 disclosure from a CSRD disclosure.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 6 }}>Single (financial) materiality</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 8 }}>IFRS S2 / ISSB</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                The <strong>outside-in</strong> view: how do climate-related (and broader sustainability) risks affect the entity's enterprise value? One axis: financial impact.
              </p>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ba7517', marginBottom: 6 }}>Double materiality</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 8 }}>CSRD / ESRS</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                Single materiality <em>plus</em> the <strong>inside-out</strong> view: how does the entity affect people and the environment? Two axes: financial and impact materiality, plotted as a matrix.
              </p>
            </div>
          </div>

          {/* Small visual: the two-axis matrix concept */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888784', marginBottom: 12, textAlign: 'center' }}>The double materiality matrix</div>
            <svg viewBox="0 0 500 280" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Double materiality matrix illustration">
              {/* axes */}
              <line x1={60} y1={20} x2={60} y2={240} stroke="#888784" />
              <line x1={60} y1={240} x2={460} y2={240} stroke="#888784" />
              {/* midlines */}
              <line x1={60} y1={130} x2={460} y2={130} stroke="#e8e7e4" strokeDasharray="4 4" />
              <line x1={260} y1={20} x2={260} y2={240} stroke="#e8e7e4" strokeDasharray="4 4" />
              {/* axis labels */}
              <text x={20} y={130} textAnchor="middle" fontSize={11} fill="#555553" transform="rotate(-90 20 130)">Financial materiality →</text>
              <text x={260} y={268} textAnchor="middle" fontSize={11} fill="#555553">Impact materiality →</text>
              <text x={52} y={26} textAnchor="end" fontSize={10} fill="#888784">High</text>
              <text x={52} y={240} textAnchor="end" fontSize={10} fill="#888784">Low</text>
              {/* quadrant labels (faint) */}
              <text x={160} y={80} textAnchor="middle" fontSize={11} fill="#bbb">Financial only</text>
              <text x={360} y={80} textAnchor="middle" fontSize={11} fontWeight={600} fill="#A32D2D">Material on both</text>
              <text x={160} y={195} textAnchor="middle" fontSize={11} fill="#bbb">Lower priority</text>
              <text x={360} y={195} textAnchor="middle" fontSize={11} fill="#bbb">Impact only</text>
              {/* example dots */}
              <circle cx={350} cy={70} r={14} fill="#A32D2D" opacity={0.88} />
              <text x={350} y={74} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">E1</text>
              <circle cx={390} cy={95} r={14} fill="#A32D2D" opacity={0.88} />
              <text x={390} y={99} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">E2</text>
              <circle cx={310} cy={170} r={14} fill="#ba7517" opacity={0.88} />
              <text x={310} y={174} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">S2</text>
              <circle cx={130} cy={210} r={14} fill="#888784" opacity={0.88} />
              <text x={130} y={214} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">S4</text>
            </svg>
            <p style={{ fontSize: 12, color: '#888784', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.6 }}>
              Each ESRS topic is plotted on both axes. Topics in the top-right are material on both — your highest reporting and management priority.
            </p>
          </div>
        </section>

        {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
        <section style={s.section}>
          <div style={s.eyebrow}>How it works</div>
          <h2 style={s.sectionTitle}>From inputs to defensible output — in less time than you think.</h2>
          <p style={s.sectionLead}>
            A guided wizard captures the entity's profile and produces a complete materiality determination, risk register, and methodology-rich report ready for review.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 8 }}>
            {[
              { n: '1', t: 'Profile', d: 'Entity, sector, IPCC AR6 regions of operation, asset profile, policy jurisdictions, reporting period.' },
              { n: '2', t: 'Scenario', d: 'Sensible defaults pre-selected (SSP2-4.5, medium horizon) with rationale — change them if you have a reason to.' },
              { n: '3', t: 'Impact (CSRD only)', d: 'Self-assessment across the ten ESRS topics, pre-filled from industry baseline — adjust to your reality.' },
              { n: '4', t: 'Determine', d: 'Materiality determination, double materiality matrix, physical and transition risk register, and a downloadable CSRD- or S2-shaped report.' },
            ].map(step => (
              <div key={step.n} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.1rem' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 22, fontWeight: 400, color: '#7425e3', marginBottom: 4 }}>{step.n}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>{step.t}</div>
                <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{step.d}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SAMPLES (THE CONVERSION ANCHOR) ─────────────────────────────── */}
        <section id="samples" style={{ ...s.section, scrollMarginTop: 80 }}>
          <div style={s.eyebrow}>See the deliverable</div>
          <h2 style={s.sectionTitle}>Two sample reports — same entity, two standards.</h2>
          <p style={s.sectionLead}>
            Both samples below were generated by the live ThemisIQ Materiality Assessment for a fictional industrial-manufacturing entity (Magnetic Industrial Components Ltd., FY2025) operating in Eastern North America and Northern Europe. Same entity, two standards — the difference is the standard, not the engine.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 8 }}>
            {/* IFRS S2 sample */}
            <div style={{ background: '#fff', border: '2px solid #0C447C', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ background: '#E6F1FB', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(12,68,124,0.2)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 4 }}>IFRS S2 / ISSB sample</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: '#0d0d0d' }}>Climate Resilience Analysis Report</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 4 }}>Multi-scenario resilience · IFRS S2 · 8 pages</div>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 14 }}>
                  Cover · executive summary · methodology · scenario rationale · physical &amp; transition risk register.
                </div>
                <a href="/samples/magnetic-industrial-s2-climate-resilience.pdf" target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, background: '#0C447C', color: '#fff' }}>
                  ⬇ Download IFRS S2 sample (PDF)
                </a>
              </div>
            </div>
            {/* CSRD sample */}
            <div style={{ background: '#fff', border: '2px solid #1e1b4b', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ background: '#eef2ff', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(30,27,75,0.2)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1e1b4b', marginBottom: 4 }}>CSRD / ESRS sample</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: '#0d0d0d' }}>Double Materiality Screening Report</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 4 }}>Double materiality · 15 pages · with matrix</div>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 14 }}>
                  Everything in the S2 report, plus the double materiality matrix and full materiality determination across all ten ESRS topics.
                </div>
                <a href="/samples/magnetic-industrial-csrd-double-materiality.pdf" target="_blank" rel="noopener noreferrer" style={{ ...primaryBtn, background: '#1e1b4b', color: '#fff' }}>
                  ⬇ Download CSRD sample (PDF)
                </a>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#888784', lineHeight: 1.7, marginTop: 16, fontStyle: 'italic', textAlign: 'center' }}>
            Samples are illustrative outputs from the live tool, generated for a fictional entity. Your own report would be specific to your inputs and saved to your private account.
          </p>
        </section>

        {/* ── WHY THEMISIQ ────────────────────────────────────────────────── */}
        <section style={s.section}>
          <div style={s.eyebrow}>Why ThemisIQ</div>
          <h2 style={s.sectionTitle}>Built on public frameworks. Defensible by design.</h2>
          <p style={s.sectionLead}>
            The Materiality Assessment is grounded in independent, public methodology — no licensed third-party classification is reproduced. Every weighting and topic mapping is traceable to its source framework.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginTop: 8 }}>
            {[
              { t: 'IPCC AR6 reference regions', d: 'The 20 land regions used for physical-risk geography are drawn from the IPCC Sixth Assessment Report Working Group I reference-region set.' },
              { t: 'TCFD risk categories', d: 'Transition risks follow the Task Force on Climate-related Financial Disclosures classification: policy, technology, market, and reputation.' },
              { t: 'ESRS topical standards', d: 'The impact-materiality axis assesses the ten ESRS topical standards (E1–E5 environmental, S1–S4 social, G1 governance).' },
              { t: 'IPCC SSP &amp; NGFS scenarios', d: 'Both IPCC Shared Socioeconomic Pathways (SSP1-2.6, SSP2-4.5, SSP5-8.5) and NGFS scenarios (Orderly, Disorderly, Hot House) are available.' },
            ].map(item => (
              <div key={item.t} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>{item.t}</div>
                <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: item.d }} />
              </div>
            ))}
          </div>

          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem 1.75rem', marginTop: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Intellectual honesty</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.7, margin: 0 }}>
              The ThemisIQ Materiality Assessment is a <strong style={{ color: '#fff' }}>structured screening</strong> intended to scope and support a formal IFRS S2 disclosure or CSRD double materiality assessment. A fully compliant ESRS assessment additionally requires a defined materiality threshold agreed by governance, stakeholder engagement informing the impact axis, and resilience testing across a range of scenarios. We tell you this on the cover of every report, not in fine print.
            </p>
          </div>
        </section>

        {/* ── PRICING TEASER ──────────────────────────────────────────────── */}
        <section style={s.section}>
          <div style={s.eyebrow}>Two paths to the deliverable</div>
          <h2 style={s.sectionTitle}>Choose by reporting obligation — or by who's asking.</h2>
          <p style={s.sectionLead}>
            Materiality assessment is included in our reporting-obligation packs and in three of our driver-based starter packs.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginTop: 8 }}>
            <div style={{ background: '#E6F1FB', border: '1.5px solid #0C447C', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 4 }}>IFRS S2 / ISSB</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 4 }}>IFRS S2 Compliance Pack</div>
              {!NEW_PRICING_ACTIVE && (
                <div style={{ fontSize: 13, color: '#555553', marginBottom: 12 }}>From <strong>${PACKS['ifrs-s2-compliance'].price.toLocaleString()}</strong> /year</div>
              )}
              {NEW_PRICING_ACTIVE && (
                <div style={{ fontSize: 13, color: '#555553', marginBottom: 12 }}>From <strong>${cartQuote({ modules: ['ghg', 'climate-risk'] as ModuleKey[], ghgTier: 'starter' }).totalUSD.toLocaleString()}</strong> /year</div>
              )}
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.7, marginBottom: 12 }}>
                IFRS S2 single materiality · climate risk · scenario analysis · GHG inventory · TCFD-aligned narrative.
              </div>
              <Link href="/pricing?modules=risk,ghg" style={{ ...ghostBtn, padding: '8px 16px', fontSize: 12 }}>See full pricing →</Link>
            </div>
            <div style={{ background: '#eef2ff', border: '1.5px solid #1e1b4b', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1e1b4b', marginBottom: 4 }}>CSRD / ESRS</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 4 }}>CSRD Compliance Pack</div>
              {!NEW_PRICING_ACTIVE && (
                <div style={{ fontSize: 13, color: '#555553', marginBottom: 12 }}>From <strong>${PACKS['csrd-compliance'].price.toLocaleString()}</strong> /year</div>
              )}
              {NEW_PRICING_ACTIVE && (
                <div style={{ fontSize: 13, color: '#555553', marginBottom: 12 }}>From <strong>${cartQuote({ modules: ['ghg', 'climate-risk', 'supply-chain', 'people'] as ModuleKey[], ghgTier: 'starter' }).totalUSD.toLocaleString()}</strong> /year</div>
              )}
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.7, marginBottom: 12 }}>
                CSRD double materiality · climate risk · supply chain · people &amp; workforce · governance · GHG.
              </div>
              <Link href="/pricing?modules=risk,ghg,supply,people" style={{ ...ghostBtn, padding: '8px 16px', fontSize: 12 }}>See full pricing →</Link>
            </div>
          </div>
        </section>

        {/* ── FINAL CTA ───────────────────────────────────────────────────── */}
        <section style={{ ...s.section, borderBottom: 'none', paddingBottom: '5rem' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '2rem 2.25rem', textAlign: 'center' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }}>
              Talk to us about your materiality assessment.
            </h2>
            <p style={{ fontSize: 13, color: '#555553', lineHeight: 1.8, maxWidth: 540, margin: '0 auto 18px' }}>
              Whether you're scoping an IFRS S2 climate disclosure or preparing for CSRD ESRS, we can walk you through the methodology and the deliverable. Most conversations take 30 minutes.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/advisory" style={primaryBtn}>Talk to a specialist →</Link>
              <Link href="/pricing" style={ghostBtn}>See pricing</Link>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
