'use client'
import Nav from '../components/Nav'
import { tierPrice } from '@/lib/pricing'
import Footer from '@/app/components/Footer'
export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* DEMAND BANNER — climate risk is demand-driven, not just regulation-driven */}
      <div style={{ background: '#0C447C', padding: '10px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' as const }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>Investors, lenders, boards, and regulators are all asking for climate risk disclosure. One assessment answers them all.</span>
        <a href="/dashboard/climate-risk" style={{ fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'underline' }}>Assess your climate risk →</a>
      </div>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>ThemisIQ Climate</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              Climate Risk<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Intelligence</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              Whether the request comes from an investor, a lender, your board, or a regulator — produce a defensible, TCFD-aligned climate risk assessment. Physical and transition risk across three IPCC scenarios. IFRS S2, CSRD ESRS E1, and SB 261 ready, from one assessment.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/dashboard/climate-risk" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your climate risk →</a>
              <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Book a demo</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['TCFD', 'IFRS S2', 'CSRD ESRS E1', 'SB 261', 'UK SRS', 'Physical risk', 'Transition risk', 'Scenario analysis'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '4', unit: 'stakeholders', label: 'investors · lenders · boards · regulators', color: '#0C447C', bg: '#E6F1FB' },
              { val: '36+', unit: 'jurisdictions', label: 'adopting ISSB / IFRS S2 globally', color: '#7425e3', bg: '#EDE9FE' },
              { val: '3', unit: 'scenarios', label: 'IPCC pathways modelled', color: '#ba7517', bg: '#FEF3E2' },
              { val: '2', unit: 'risk types', label: 'physical & transition', color: '#0F6E56', bg: '#E1F5EE' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${color}22` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO'S ASKING — demand drivers */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: '2.5rem', maxWidth: 620 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Why companies do this</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              Regulation is only part of the story.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300 }}>
              Most climate risk reporting isn&apos;t triggered by a law at all — it&apos;s triggered by someone you answer to. Climate risk has become a standard part of how capital, credit, and commercial relationships are evaluated.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[
              { who: 'Investors', desc: 'Institutional investors and PE/VC backers increasingly require TCFD- or IFRS S2-aligned climate risk disclosure as part of diligence and ongoing portfolio monitoring. PRI signatories ask portfolio companies directly.', color: '#7425e3' },
              { who: 'Banks & lenders', desc: 'Climate risk assessment is now routine in credit decisions and loan covenants. Lenders need to understand the physical and transition risk on their books — and they push that requirement down to borrowers.', color: '#1fb1ff' },
              { who: 'Boards & audit committees', desc: 'Directors carry oversight duty for material climate risk. A structured assessment gives the board the documented risk picture they need — and protects them if exposure is later questioned.', color: '#64fe3e' },
              { who: 'Customers & supply chain', desc: 'Large buyers cascade their own climate commitments down to suppliers. A credible risk assessment is increasingly a condition of winning or keeping enterprise contracts.', color: '#ba7517' },
            ].map(({ who, desc, color }) => (
              <div key={who} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.5rem' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 8 }}>{who}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 300, lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Platform capabilities</div>
          <h2 style={sectionTitle}>Everything your risk report needs.</h2>
          <p style={sectionSub}>Built for sustainability and finance teams. Aligned to what regulators, lenders, and investors expect.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { title: 'Guided risk assessment', desc: 'Step-by-step through governance, strategy, risk management, and metrics — the four TCFD pillars that IFRS S2, CSRD, and SB 261 all build on. No blank framework documents.' },
            { title: 'Physical risk screening', desc: 'Acute and chronic physical hazards — flood, heat, wildfire, water stress — screened against your facility locations across IPCC scenarios.' },
            { title: 'Transition risk analysis', desc: 'Policy, legal, technology, market, and reputation risks modelled under orderly, disorderly, and hot-house pathways.' },
            { title: 'Scenario modelling', desc: 'Three IPCC scenarios so your disclosure shows resilience under multiple climate futures — the scenario analysis investors and IFRS S2 expect.' },
            { title: 'Immutable audit trail', desc: 'Every entry, edit, and deletion is logged with user, timestamp, and previous value — written by the database, not the application.' },
            { title: 'Multi-framework export', desc: 'One assessment maps to TCFD, IFRS S2, CSRD ESRS E1, and SB 261 — a publishable, board-ready climate-related financial risk report in your branding.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FLAGSHIP — RESILIENCE REPORT DEPTH */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto', borderTop: '0.5px solid #e8e7e4' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Flagship output</div>
          <h2 style={sectionTitle}>The resilience report, in depth.</h2>
          <p style={sectionSub}>IFRS S2 and CSRD/ESRS ask for resilience across a diverse range of climate futures — and for the judgment behind it to be documented. ThemisIQ produces exactly that, with every figure traceable to its basis.</p>
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12, textAlign: 'center' }}>Tested across a diverse trio of scenarios</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2.5rem' }}>
          {[
            { role: 'Paris-aligned', warming: '~1.8°C', src: 'IPCC SSP1-2.6', color: '#0F6E56', bg: '#E1F5EE' },
            { role: 'Current trajectory', warming: '~2.7°C', src: 'IPCC SSP2-4.5', color: '#0C447C', bg: '#E6F1FB' },
            { role: 'High warming', warming: '~4.4°C', src: 'IPCC SSP5-8.5', color: '#ba7517', bg: '#FEF3E2' },
          ].map(scn => (
            <div key={scn.role} style={{ background: scn.bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${scn.color}22` }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color: scn.color, lineHeight: 1 }}>{scn.warming}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginTop: 8 }}>{scn.role}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{scn.src}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12, textAlign: 'center' }}>Documented for assurance, not just generated</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2.5rem' }}>
          {[
            ['Resilience conclusion', 'A rules-based read of how exposure shifts across the trio — persistent, warming-driven, or policy-driven.'],
            ['Scenario rationale', 'Why these pathways, including a Paris-aligned scenario as IFRS S2 requires — the choice itself is disclosable.'],
            ['Methodology & basis', 'IPCC AR6 regions and impact-drivers, TCFD transition categories, IPCC SSP scenarios — public frameworks throughout.'],
            ['Assumptions register', 'Every weighting and threshold stated as a disclosed methodological choice, not a black box.'],
            ['Data lineage', 'A clear boundary between your inputs and platform reference defaults — what assurance needs to see.'],
            ['Limitations & notice', 'Where screening ends and formal assessment begins, with a formal Important Notice on every report.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '2px solid #7425e3', borderRadius: '0 10px 10px 0', padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <a href="/dashboard/climate-risk" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your climate risk →</a>
          <p style={{ fontSize: 12, color: '#888784', marginTop: 14, fontWeight: 300 }}>Reporting under CSRD/ESRS? The same assessment also produces the double-materiality matrix across all ten ESRS topics.</p>
        </div>
      </section>

      {/* GLOBAL REGULATORY MAP */}
      <section style={{ padding: '0 2.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={eyebrow}>Global regulatory coverage</div>
          <h2 style={sectionTitle}>One assessment. Every regime.</h2>
          <p style={sectionSub}>Climate risk disclosure is going mandatory across dozens of jurisdictions — most building on the same TCFD foundation. ThemisIQ maps your single assessment to all of them.</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Framework', 'Jurisdiction', 'Who it applies to', 'Status', 'ThemisIQ coverage'].map(h => (
                <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['CSRD · ESRS E1', 'European Union', 'Large EU & EU-active companies', 'In force (scope simplified by Omnibus)', '✓ Full — ESRS E1 climate risk'],
              ['IFRS S2 (ISSB)', '36+ jurisdictions', 'Adopted jurisdiction by jurisdiction', 'Live & expanding', '✓ Full — TCFD + scenario analysis'],
              ['UK SRS (S1 & S2)', 'United Kingdom', 'Listed & large companies', 'Rules expected from FY2027', '✓ Full — ISSB-aligned'],
              ['Australia · AASB S2', 'Australia', 'Large entities, phased', 'Phasing in from Jan 2025', '✓ Full — IFRS S2 basis'],
              ['Canada · CSDS', 'Canada', 'ISSB-aligned, voluntary→mandatory', 'Adoption underway', '✓ Full — IFRS S2 basis'],
              ['SB 261', 'California, USA', '$500M+ revenue, doing business in CA', 'Enforcement paused (appeal pending)', '✓ Full — TCFD-aligned report'],
              ['TCFD', 'Global', 'Investor / lender / board requested', 'De facto standard', '✓ Full — all four pillars'],
            ].map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 4 ? '#0F6E56' : '#555553', fontWeight: j === 4 ? 500 : 400 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#888784', marginTop: 14, lineHeight: 1.6, fontWeight: 300 }}>
          Regulatory timing and scope are evolving — the EU Omnibus reform, UK SRS rules, and California&apos;s SB 261 appeal are all in motion. Confirm your specific obligations with qualified counsel. ThemisIQ keeps framework mappings current as rules are finalised.
        </div>
      </section>

      {/* PRICING */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={eyebrow}>Pricing</div>
          <h2 style={sectionTitle}>Start with Climate Risk.</h2>
          <p style={sectionSub}>The Starter plan covers a complete TCFD-aligned risk assessment. Add modules and bundle to save — 10% off two, 15% off three or more.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: '2.5rem', textAlign: 'left' }}>
            {[
              { plan: 'Starter', price: '$' + tierPrice('starter').toLocaleString(), cadence: '/yr · Climate Risk', features: ['Physical & transition risk assessment', '3 IPCC scenario pathways', 'TCFD-aligned report structure', 'IFRS S2 · CSRD ESRS E1 · SB 261 mapping', 'Audit trail — every entry logged', 'Report unlocked on paid plan'], featured: false },
              { plan: 'Professional', price: '$' + tierPrice('professional').toLocaleString(), cadence: '/yr · Climate Risk', features: ['Everything in Starter', 'Multi-entity · 10 entities · 10 users', 'Verifier & third-party access role', 'Regulatory Monitor — weekly alerts', 'Priority framework updates', 'All reporting frameworks'], featured: true },
            ].map(({ plan, price, cadence, features, featured }) => (
              <div key={plan} style={{ background: featured ? '#0d0d0d' : '#fff', borderRadius: 12, padding: '2rem', border: featured ? 'none' : '0.5px solid #e8e7e4' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: featured ? 'rgba(255,255,255,0.4)' : '#888784', marginBottom: 8 }}>{plan}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.4rem', fontWeight: 400, color: featured ? '#fff' : '#0d0d0d' }}>{price}<span style={{ fontSize: 14, fontWeight: 400, color: featured ? 'rgba(255,255,255,0.4)' : '#888784' }}>{cadence}</span></div>
                <div style={{ height: '0.5px', background: featured ? 'rgba(255,255,255,0.1)' : '#e8e7e4', margin: '1.25rem 0' }} />
                {features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: featured ? '#64fe3e' : '#0F6E56', flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: featured ? 'rgba(255,255,255,0.65)' : '#555553', fontWeight: 300 }}>{f}</span>
                  </div>
                ))}
                <a href="/dashboard/climate-risk" style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', background: featured ? 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)' : '#0d0d0d', color: featured ? '#0d0d0d' : '#fff', marginTop: '1.5rem' }}>
                  Assess your climate risk →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          Someone&apos;s going to ask.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Be ready.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          ThemisIQ guides you through a complete, TCFD-aligned climate risk assessment and produces a publishable report — for whoever is asking. Build it free; unlock the export on a paid plan.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/climate-risk" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your climate risk →</a>
          <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to an advisor</a>
          <a href="/assess" style={{ ...btnSecondary, textDecoration: 'none' }}>Check which rules apply to you →</a>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 300 }
