'use client'
import Nav from '../components/Nav'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* URGENCY BANNER */}
      <div style={{ background: '#B91C1C', padding: '10px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>NIS2 active since Oct 2024 · DORA active since Jan 2025 · SEC cyber disclosure active since Dec 2023. Are you compliant?</span>
        <a href="/assess" style={{ fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'underline' }}>Check your obligations →</a>
      </div>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>ThemisIQ Cyber Governance</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              Cyber Governance &<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Resilience</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              NIS2, DORA, SEC cyber disclosure, ISO 27001, and NIST CSF — all in one platform. Cyber risk registers, policy management, incident workflows, vendor reviews, and board-level reporting.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>See your emissions instantly →</a>
              <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Book a demo</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['NIS2', 'DORA', 'SEC cyber', 'ISO 27001', 'NIST CSF', 'ISO 27001', 'SOC 2', 'NIST 800-53'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '72h', unit: 'NIS2 report', label: 'full incident report to national authority after significant cyber incident', color: '#B91C1C', bg: '#FCEBEB' },
              { val: '€10M', unit: 'or 2%', label: 'maximum NIS2 fine for essential entity non-compliance', color: '#7425e3', bg: '#EDE9FE' },
              { val: '4 days', unit: 'SEC 8-K', label: 'to disclose material cybersecurity incidents as a US public company', color: '#ba7517', bg: '#FEF3E2' },
              { val: 'Art. 20', unit: 'NIS2', label: 'board members personally accountable for cyber risk management', color: '#0F6E56', bg: '#E1F5EE' },
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

      {/* THREE FRAMEWORKS */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Three active frameworks</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2 }}>NIS2. DORA. SEC cyber. All active. All enforced.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: 'rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden' }}>
            {[
              {
                name: 'EU NIS2 Directive',
                active: 'Active since October 2024',
                who: 'Essential and important entities across 18 sectors in the EU — energy, financial, health, transport, technology, manufacturing, and more',
                key: ['Article 20: Board personal accountability for cyber risk', 'Article 21: MFA, supply chain security, incident handling, encryption', 'Article 23: 24h early warning · 72h full report · 1-month final report', 'Fines: up to €10M or 2% global turnover (essential entities)'],
                color: '#B91C1C',
              },
              {
                name: 'EU DORA',
                active: 'Active since January 2025',
                who: 'Financial entities with EU operations — banks, insurers, investment firms, crypto-asset service providers, and their critical ICT third-party providers',
                key: ['ICT risk management framework — policies, procedures, controls', 'Digital operational resilience testing — including TLPT', 'ICT-related incident classification and reporting', 'Third-party ICT risk management and CTPP oversight'],
                color: '#7425e3',
              },
              {
                name: 'SEC Cyber Rules',
                active: 'Active since December 2023',
                who: 'US publicly listed companies — NYSE, Nasdaq, and other SEC-registered issuers',
                key: ['Form 8-K: material cyber incident disclosure within 4 business days', 'Form 10-K: annual cyber risk management programme description', 'Board oversight and CISO governance disclosure required', 'SEC enforcement already underway — no grace period'],
                color: '#0C447C',
              },
            ].map(({ name, active, who, key, color }) => (
              <div key={name} style={{ background: 'rgba(255,255,255,0.04)', padding: '2rem', borderTop: `3px solid ${color}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>{name}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 12, background: `${color}22`, padding: '2px 8px', borderRadius: 99, display: 'inline-block' }}>{active}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, marginBottom: 16, fontWeight: 300 }}>{who}</div>
                {key.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ color, flexShrink: 0, marginTop: 1 }}>→</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Platform capabilities</div>
          <h2 style={sectionTitle}>Everything your cyber governance programme needs.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { icon: '🔍', title: 'Cyber risk register', desc: 'Structured cyber risk identification, assessment, and treatment. NIST CSF and ISO 27001 Annex A control mapping. Risk heat maps and board-ready risk summaries.' },
            { icon: '📋', title: 'Policy management', desc: 'Information security policy library aligned to ISO 27001:2022 and NIS2 Article 21. Version control, review workflows, and staff acknowledgement tracking.' },
            { icon: '🚨', title: 'Incident response', desc: 'NIS2-compliant incident classification and notification workflow. 24h early warning, 72h full report, and 1-month final report templates. SEC 8-K materiality assessment.' },
            { icon: '🏢', title: 'Vendor cyber reviews', desc: 'Supplier ICT risk assessment questionnaires, DORA Critical Third-Party Provider (CTPP) register, and ongoing vendor cyber monitoring. NIS2 supply chain security compliance.' },
            { icon: '🏛️', title: 'Board reporting', desc: 'Cyber risk dashboard for board and audit committee. NIS2 Article 20 personal accountability documentation. SEC 10-K governance disclosure preparation. CISO briefing packs.' },
            { icon: '🧪', title: 'Resilience testing', desc: 'DORA digital operational resilience testing programme management. TLPT coordination, penetration test tracking, and finding remediation. TIBER-EU framework alignment.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* INCIDENT CLOCK */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={eyebrow}>Incident notification timelines</div>
            <h2 style={sectionTitle}>The clock starts the moment you detect it.</h2>
            <p style={{ fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 300 }}>ThemisIQ's incident response workflow triggers the right notification at the right time — so you never miss a regulatory deadline under pressure.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
            {[
              { time: 'Hour 1', title: 'Contain & assess', desc: 'Isolate affected systems. Assign incident commander. Open ThemisIQ incident record. Determine severity classification.', color: '#7425e3' },
              { time: 'Hour 24', title: 'NIS2 early warning', desc: 'Submit early warning to national competent authority. Indicate whether incident is suspected to be malicious. Customer notification if data breach confirmed.', color: '#ba7517' },
              { time: 'Hour 72', title: 'Full report + SEC 8-K', desc: 'NIS2 full incident notification. DORA ICT incident report. US public companies: assess 8-K materiality and file if material. GDPR Article 33 if personal data involved.', color: '#B91C1C' },
              { time: 'Day 30', title: 'Final report', desc: 'NIS2 final report with root cause, impact assessment, cross-border effects, and measures taken. Post-incident review completion. Corrective action verification.', color: '#0F6E56' },
            ].map(({ time, title, desc, color }) => (
              <div key={time} style={{ background: '#fff', padding: '2rem', borderTop: `4px solid ${color}` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color, marginBottom: 4 }}>{time}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FRAMEWORK TABLE */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={eyebrow}>Full framework coverage</div>
          <h2 style={sectionTitle}>Every cyber framework. One platform.</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Framework', 'Jurisdiction', 'Applies to', 'Status', 'ThemisIQ coverage'].map(h => (
                <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['EU NIS2 Directive', 'European Union', 'Essential + important entities · 18 sectors', 'Active Oct 2024', '✓ Full — gap assessment + incident workflow'],
              ['EU DORA', 'EU financial services', 'Banks, insurers, investment firms, crypto', 'Active Jan 2025', '✓ Full — ICT risk + CTPP register + testing'],
              ['SEC Cybersecurity Rules', 'USA · public companies', 'NYSE / Nasdaq listed companies', 'Active Dec 2023', '✓ Full — 8-K + 10-K disclosure workflow'],
              ['ISO 27001:2022', 'Global', 'Any organisation seeking ISMS certification', 'Voluntary / customer-required', '✓ Full — Annex A control mapping'],
              ['NIST CSF 2.0', 'USA (global adoption)', 'US federal + voluntary for all sectors', 'Active 2024', '✓ Full — Govern, Identify, Protect, Detect, Respond, Recover'],
              ['NIST 800-53 Rev.5', 'USA federal', 'Federal agencies + contractors', 'Mandatory for federal', '✓ Partial — control mapping'],
              ['SOC 2 Type II', 'USA (industry standard)', 'SaaS and technology companies', 'Customer-required', '✓ Partial — TSC alignment'],
              ['UK Cyber Essentials', 'United Kingdom', 'UK government suppliers + voluntary', 'Active', '✓ Partial — basic controls mapping'],
            ].map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 4 ? '#0F6E56' : '#555553', fontWeight: j === 4 ? 500 : 400 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* CTA */}
      <section style={{ background: '#0d0d0d', padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2, color: '#fff' }}>
          NIS2 is active. DORA is active.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Are you compliant?</span>
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          ThemisIQ's cyber governance gap assessment identifies where you stand against NIS2, DORA, and SEC cyber rules — and tells you exactly what to fix first.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/assess" style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none', display: 'inline-block' }}>See your emissions instantly →</a>
          <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: 'rgba(255,255,255,0.7)', border: '0.5px solid rgba(255,255,255,0.2)', textDecoration: 'none', display: 'inline-block' }}>Talk to a cyber governance advisor</a>
        </div>
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

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
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
