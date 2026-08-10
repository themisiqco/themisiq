'use client'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '../../lib/pricing'

export default function Page() {
  // Price from the single source of truth, formatted as app/cbam/page.tsx does.
  const dealsPrice = FLAT_MODULE_PRICES['deals'].toLocaleString('en-US')
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>Deals & Investment</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              M&A Climate<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Diligence</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              Climate risk is now a material transaction risk. ThemisIQ quantifies inherited emissions, transition risk exposure, and SB 253 liability for every deal — in days, not weeks.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/dashboard/deals" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your M&A exposure →</a>
              <a href="/order?modules=deals" style={{ ...btnSecondary, textDecoration: 'none' }}>${dealsPrice}/yr</a>
              <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 4px', color: '#555553', textDecoration: 'underline', display: 'inline-block' }}>Talk to a specialist</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['M&A diligence', 'PE / family office', 'IFRS S2', 'TCFD', 'SB 253', 'LP ESG', 'IC reporting', 'Portfolio monitoring'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '$M+', unit: 'liability', label: 'SB 253 compliance costs can be inherited in M&A transactions', color: '#B91C1C', bg: '#FCEBEB' },
              { val: 'IFRS S2', unit: 'mandatory', label: 'climate risk disclosure now required in 30+ jurisdictions', color: '#7425e3', bg: '#EDE9FE' },
              { val: '72%', unit: 'of LPs', label: 'now require ESG data from portfolio companies at investment', color: '#0F6E56', bg: '#E1F5EE' },
              { val: 'Days', unit: 'not weeks', label: 'ThemisIQ climate diligence turnaround vs traditional advisors', color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${color}22` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SB 253 M&A CALLOUT */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>SB 253 — M&A liability</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              Acquiring a California company?<br />You inherit their SB 253 obligations.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              SB 253 applies at the group level based on global consolidated revenue. When you acquire a company with California nexus, you may inherit their Scope 1, 2, and 3 disclosure obligations — and their compliance gaps. ThemisIQ quantifies this exposure before you sign.
            </p>
            {[
              'Inherited SB 253 liability assessment',
              'Scope 1 + 2 gap analysis for target company',
              'Scope 3 exposure quantification',
              'CARB compliance timeline and cost estimate',
              'Post-acquisition integration roadmap',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Climate diligence frameworks</div>
            {[
              { fw: 'SB 253 liability', scope: 'Inherited California GHG obligations', urgency: 'critical' },
              { fw: 'IFRS S2 / TCFD', scope: 'Physical + transition risk quantification', urgency: 'critical' },
              { fw: 'LP ESG requirements', scope: 'Portfolio climate data for institutional LPs', urgency: 'high' },
              { fw: 'ESRS E1', scope: 'EU target climate disclosure obligations', urgency: 'high' },
              { fw: 'SBTi compatibility', scope: 'Target alignment with science-based pathways', urgency: 'medium' },
              { fw: 'Stranded asset risk', scope: 'Carbon-intensive asset transition exposure', urgency: 'medium' },
            ].map(({ fw, scope, urgency }) => {
              const color = urgency === 'critical' ? '#B91C1C' : urgency === 'high' ? '#ba7517' : '#888784'
              return (
                <div key={fw} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>{fw}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{scope}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Use cases</div>
          <h2 style={sectionTitle}>Built for every deal structure.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { title: 'Private Equity', desc: 'Portfolio company climate baseline, LP ESG reporting, SBTi target setting, value creation through ESG improvement, and exit readiness preparation.' },
            { title: 'Family Office', desc: 'Direct investment climate risk screening, IFRS S2 physical risk assessment across portfolio, and legacy asset transition planning.' },
            { title: 'Corporate M&A', desc: 'Target company GHG inventory assessment, SB 253 inherited liability quantification, TCFD risk evaluation, and post-merger ESG integration planning.' },
            { title: 'Investment Banking', desc: 'Climate diligence for leveraged finance approvals, ESG data for deal marketing materials, and IFRS S2 risk disclosure for listing documents.' },
            { title: 'Venture Capital', desc: 'Portfolio-level Scope 1 + 2 carbon footprint reporting for LPs, climate risk screening for new investments, and ESG readiness for Series B+ rounds.' },
            { title: 'IC Reporting', desc: 'Investment committee climate risk memo generation, scenario analysis outputs (1.5°C / 2°C / 3°C), and portfolio benchmark comparison.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* LP ESG */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>LP ESG requirements</div>
            <h2 style={sectionTitle}>ESG is now a condition of capital.</h2>
            <p style={{ fontSize: 15, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              Institutional LPs — pension funds, endowments, and sovereign wealth funds — are requiring documented ESG diligence and portfolio monitoring as a condition of capital deployment. This is not a nice-to-have. It is a gate.
            </p>
            {[
              'Portfolio-level Scope 1 + 2 carbon footprint reporting',
              'Annual LP ESG questionnaire response support',
              'ILPA ESG reporting template completion',
              'Climate risk assessment for new investments',
              'Science-based target progress tracking',
              'ESG data room for fund due diligence',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <span style={{ color: '#0F6E56', flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {[
              { pct: '72%', label: 'of institutional LPs now require ESG data at investment', color: '#7425e3' },
              { pct: '58%', label: 'of PE firms report losing LP commitments due to ESG gaps', color: '#B91C1C' },
              { pct: '89%', label: 'of sovereign wealth funds have formal climate investment policies', color: '#0F6E56' },
            ].map(({ pct, label, color }) => (
              <div key={pct} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.4rem', fontWeight: 400, color, flexShrink: 0 }}>{pct}</div>
                <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          Climate risk is transaction risk.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Quantify it before you sign.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          ThemisIQ M&A climate diligence can be completed in days. Start with our free assessment to understand your exposure, or talk to our M&A advisory team directly.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/deals" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your M&A exposure →</a>
          <a href="/order?modules=deals" style={{ ...btnSecondary, textDecoration: 'none' }}>${dealsPrice}/yr</a>
          <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 4px', color: '#555553', textDecoration: 'underline', display: 'inline-block' }}>Talk to a specialist</a>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const btnOutline: React.CSSProperties = { fontSize: 13, fontWeight: 400, padding: '8px 18px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', textDecoration: 'none', display: 'inline-block' }
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
