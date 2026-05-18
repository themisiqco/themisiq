'use client'

export default function AdvisoryPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2.5rem', height: 64, background: 'rgba(255,255,255,0.97)', borderBottom: '0.5px solid #e8e7e4', backdropFilter: 'blur(8px)' }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 36, width: 'auto', mixBlendMode: 'multiply' }} />
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/climate-ghg" style={navLink}>Climate · GHG</a>
          <a href="/supply-chain" style={navLink}>Supply Chain</a>
          <a href="/deals" style={navLink}>Deals</a>
          <a href="/people" style={navLink}>People</a>
          <a href="/ai-governance" style={navLink}>AI Governance</a>
          <a href="/cyber" style={navLink}>Cyber</a>
          <a href="/advisory" style={navLink}>Advisory</a>
          <a href="/assess" style={navLink}>Free Assessment</a>
        </div>
        <a href="/assess" style={btnGrad}>Start free trial</a>
      </nav>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4', background: '#f8f7f5' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={eyebrow}>ThemisIQ Advisory</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d', maxWidth: 700 }}>
            Expert guidance.<br />
            <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Fixed fees.</span><br />
            Named advisors.
          </h1>
          <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2.5rem', maxWidth: 560 }}>
            ThemisIQ Advisory connects you with named sustainability, governance, and regulatory specialists — former regulators, Big 4 practitioners, and sector experts — at transparent fixed fees.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '3rem' }}>
            <a href="mailto:advisory@themisiq.co" style={{ ...btnPrimary, textDecoration: 'none' }}>Book free 30-min consultation</a>
            <a href="/assess" style={{ ...btnSecondary, textDecoration: 'none' }}>Start with the free assessment</a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, maxWidth: 600 }}>
            {[['30 min', 'Free initial consultation'], ['Fixed fees', 'No billable hours surprises'], ['Named advisor', 'Same person throughout']].map(([val, label]) => (
              <div key={label} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem', textAlign: 'center' as const }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 4 }}>{val}</div>
                <div style={{ fontSize: 11, color: '#888784' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VS BIG 4 */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Why ThemisIQ Advisory</div>
          <h2 style={sectionTitle}>Not a Big 4 engagement. Better.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ background: '#fff', padding: '2.5rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888784', marginBottom: '1.5rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Traditional consultants</div>
            {['Junior associates do the work, partner signs off', 'Billable hours — costs grow unpredictably', 'Generalist teams learning your sector on your budget', 'Months to mobilise, weeks to deliver', 'Deliverable is a report. Implementation is extra.', 'No platform — findings live in a PDF'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <span style={{ color: '#B91C1C', flexShrink: 0 }}>✗</span>
                <span style={{ fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: '#0d0d0d', padding: '2.5rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.4)', marginBottom: '1.5rem', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ThemisIQ Advisory</div>
            {['Named senior advisor — you know who is doing the work', 'Fixed fees — scope and cost agreed before engagement starts', 'Specialists with direct sector and regulatory experience', 'Available within days, not months', 'Findings implemented directly in your ThemisIQ platform', 'Platform + advisory — your programme is live, not just documented'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <span style={{ color: '#64fe3e', flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={eyebrow}>Service areas</div>
            <h2 style={sectionTitle}>Eight advisory specialisms.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {[
              { icon: '📋', title: 'Regulatory Filing', price: 'From $4,000', desc: 'SB 253 submission preparation, CARB template completion, CDP response, ESRS disclosure drafting. Filing-ready outputs with your named advisor sign-off.', tags: ['SB 253', 'CDP', 'ESRS'] },
              { icon: '🔬', title: 'Verifier Preparation', price: 'From $6,000', desc: 'Pre-assurance data room preparation, methodology documentation, verifier selection support, and issue resolution during the assurance process.', tags: ['Limited assurance', 'Reasonable assurance', 'ISAE 3410'] },
              { icon: '🤝', title: 'M&A Climate Diligence', price: 'From $8,000', desc: 'Scope 3 inherited emissions assessment, TCFD risk evaluation, SBTi target compatibility, and climate risk quantification for investment committee reporting.', tags: ['M&A', 'PE', 'IFRS S2'] },
              { icon: '📊', title: 'Board Reporting', price: 'From $3,500', desc: 'Climate and ESG board pack design, director briefing preparation, TCFD governance narrative, and board-level training on climate disclosure obligations.', tags: ['Board', 'TCFD', 'Governance'] },
              { icon: '🗺️', title: 'Framework Eligibility', price: 'From $2,500', desc: 'Determine which regulations apply to your company across all jurisdictions. Prioritised compliance roadmap with effort and cost estimates per obligation.', tags: ['Multi-framework', 'Roadmap', 'Prioritisation'] },
              { icon: '🎯', title: 'SBTi Guidance', price: 'From $5,000', desc: 'Science-based target setting, near-term and net-zero pathway design, SBTi submission preparation, and target validation support.', tags: ['SBTi', 'Net zero', '1.5°C'] },
              { icon: '🔗', title: 'Supply Chain Strategy', price: 'From $6,000', desc: 'Supplier engagement programme design, Scope 3 Category 1 primary data collection strategy, EcoVadis programme management, and CS3D due diligence framework.', tags: ['Scope 3', 'EcoVadis', 'CS3D'] },
              { icon: '🏆', title: 'Retained Advisory', price: '$4,500–$12,000/month', desc: 'Ongoing strategic sustainability advisory. Monthly calls, regulatory monitoring, document review, and priority access to the full ThemisIQ advisor network.', tags: ['Ongoing', 'Strategic', 'Priority access'] },
            ].map(({ icon, title, price, desc, tags }) => (
              <div key={title} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
                <div style={{ fontSize: 24 }}>{icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, background: 'linear-gradient(135deg,#7425e3,#1fb1ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{price}</div>
                </div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 300, flex: 1 }}>{desc}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5 }}>
                  {tags.map(tag => <span key={tag} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>)}
                </div>
                <a href="mailto:advisory@themisiq.co" style={{ fontSize: 12, fontWeight: 500, color: '#7425e3', textDecoration: 'none' }}>Enquire →</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ADVISORS */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>The advisory team</div>
          <h2 style={sectionTitle}>Named advisors. Real experience.</h2>
          <p style={sectionSub}>Former regulators, Big 4 practitioners, and sector specialists — not generalists.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { name: 'Sarah Redmond', title: 'CDP & Climate Disclosure', bg: '#EDE9FE', color: '#7425e3', initials: 'SR', exp: 'Former CDP scoring analyst. 12 years CDP response advisory across FTSE 350. SB 253 and ESRS E1 specialist.' },
            { name: 'Marcus Klein', title: 'M&A Climate Diligence', bg: '#E6F1FB', color: '#0C447C', initials: 'MK', exp: 'Former KPMG Deal Advisory. 200+ M&A climate due diligence engagements. TCFD and IFRS S2 transaction risk expert.' },
            { name: 'Adaeze Nwosu', title: 'EU Regulatory (CSRD · AI Act)', bg: '#E1F5EE', color: '#0F6E56', initials: 'AN', exp: 'Former EU Commission policy advisor. CSRD implementation specialist. EU AI Act high-risk system compliance.' },
            { name: 'James Park', title: 'Cyber Governance (NIS2 · DORA)', bg: '#FEF3E2', color: '#633806', initials: 'JP', exp: 'Former NCSC cyber resilience lead. NIS2 gap assessments across 40+ organisations. DORA implementation specialist.' },
            { name: 'Leila Tahir', title: 'People & Workforce (ESRS S1)', bg: '#FCEBEB', color: '#501313', initials: 'LT', exp: 'Former CHRO, FTSE 100. ESRS S1 disclosure design. EU Pay Transparency implementation across 20 member states.' },
            { name: 'Rafael Carvalho', title: 'Supply Chain & EcoVadis', bg: '#f8f7f5', color: '#555553', initials: 'RC', exp: 'Former Bureau Veritas supply chain auditor. EcoVadis programme management. CS3D due diligence framework design.' },
          ].map(({ name, title, bg, color, initials, exp }) => (
            <div key={name} style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 600, color, flexShrink: 0 }}>{initials}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{name}</div>
                  <div style={{ fontSize: 11, color, fontWeight: 500 }}>{title}</div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{exp}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#0d0d0d', padding: '5rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: '#fff', maxWidth: 680, margin: '0 auto 1rem', lineHeight: 1.2 }}>
          Book your free 30-minute<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Advisory consultation.</span>
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          We'll review your compliance obligations, prioritise by risk and effort, and tell you exactly what to do first. No charge. No obligation.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="mailto:advisory@themisiq.co" style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none', display: 'inline-block' }}>Book free consultation</a>
          <a href="/assess" style={{ fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: 'rgba(255,255,255,0.6)', border: '0.5px solid rgba(255,255,255,0.15)', textDecoration: 'none', display: 'inline-block' }}>Take the free assessment first</a>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: '1.5rem' }}>advisory@themisiq.co · hello@themisiq.co</div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '2rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co</div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="/privacy" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Terms of Service</a>
            <a href="/assess" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Free Assessment →</a>
          </div>
        </div>
      </footer>

    </div>
  )
}

const navLink: React.CSSProperties = { fontSize: 13, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 300 }
 
