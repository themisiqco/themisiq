'use client'
import Nav from '../components/Nav'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* URGENCY BANNER */}
      <div style={{ background: '#7425e3', padding: '10px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>EU AI Act high-risk AI deadline: August 2, 2026 — 77 days. HR, hiring, and credit AI systems require full conformity assessment.</span>
        <a href="/dashboard/ghg" style={{ fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'underline' }}>Check if EU AI Act applies to you →</a>
      </div>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>ThemisIQ AI Governance</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              AI Governance &<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Risk Management</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              EU AI Act compliance. AI risk register. Model inventory. Board-level AI oversight documentation. NIST AI RMF alignment. ISO 42001 readiness. One platform for your entire AI governance programme.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/ai-governance" style={{ ...btnPrimary, textDecoration: 'none' }}>Start your AI inventory →</a>
              <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Book a demo</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['EU AI Act', 'NIST AI RMF', 'ISO 42001', 'Model risk', 'SR 11-7', 'GDPR Art. 22', 'Bill C-27 AIDA', 'Board AI oversight'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '77', unit: 'days', label: 'to EU AI Act high-risk AI deadline — August 2, 2026', color: '#B91C1C', bg: '#FCEBEB' },
              { val: 'Annex III', unit: 'high-risk', label: 'HR, hiring, credit, education AI — full conformity assessment required', color: '#7425e3', bg: '#EDE9FE' },
              { val: '€35M', unit: 'or 7%', label: 'maximum EU AI Act fine for prohibited AI practices', color: '#ba7517', bg: '#FEF3E2' },
              { val: 'Feb 2025', unit: 'active', label: 'prohibited AI practices already banned — manipulation, social scoring, real-time biometrics', color: '#0F6E56', bg: '#E1F5EE' },
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

      {/* EU AI ACT CALLOUT */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>EU AI Act — Regulation (EU) 2024/1689</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              77 days to the high-risk<br />AI deadline.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              If your company uses AI for HR decisions, hiring, credit scoring, or education in the EU, you are in scope for the EU AI Act Annex III high-risk provisions. Full conformity assessment, Article 11 technical documentation, transparency notices, and EU database registration are required by August 2, 2026.
            </p>
            {[
              'AI system inventory and Annex III risk classification',
              'Article 11 technical documentation generation',
              'Conformity assessment workflow and evidence pack',
              'EU AI database registration preparation',
              'Transparency notice templates for affected individuals',
              'Board AI oversight framework and governance documentation',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* ANNEX III TABLE */}
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>EU AI Act Annex III — High-risk categories</div>
            {[
              { cat: 'Employment & HR', examples: 'CV screening, candidate ranking, performance management, task allocation', deadline: 'Aug 2, 2026' },
              { cat: 'Credit & finance', examples: 'Credit scoring, loan approval, insurance risk assessment', deadline: 'Aug 2, 2026' },
              { cat: 'Education', examples: 'Student assessment, admissions, monitoring during exams', deadline: 'Aug 2, 2026' },
              { cat: 'Essential services', examples: 'Access to public benefits, emergency services dispatch', deadline: 'Aug 2, 2026' },
              { cat: 'Law enforcement', examples: 'Polygraphs, risk assessment, evidence evaluation', deadline: 'Aug 2, 2026' },
              { cat: 'Migration & border', examples: 'Risk assessment, document verification, applications', deadline: 'Aug 2, 2026' },
            ].map(({ cat, examples, deadline }) => (
              <div key={cat} style={{ padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{cat}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#B91C1C', background: '#FCEBEB', padding: '2px 8px', borderRadius: 99, flexShrink: 0, marginLeft: 8 }}>{deadline}</span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{examples}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Platform capabilities</div>
          <h2 style={sectionTitle}>Your complete AI governance programme.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { icon: '🗂️', title: 'AI system inventory', desc: 'Comprehensive register of all AI systems across your organisation. Purpose, data inputs, outputs, affected individuals, and deployment context — all documented and version-controlled.' },
            { icon: '⚖️', title: 'Risk classification', desc: 'Automated EU AI Act risk classification (prohibited, high-risk Annex III, limited risk, minimal risk) with justification documentation. Updated as regulation evolves.' },
            { icon: '📋', title: 'Technical documentation', desc: 'Article 11 technical documentation generation for high-risk AI systems. System description, training data, accuracy metrics, robustness testing, and human oversight measures.' },
            { icon: '🎯', title: 'NIST AI RMF alignment', desc: 'Map, Measure, Manage, Govern — ThemisIQ structures your AI risk management programme around the NIST AI Risk Management Framework and tracks maturity over time.' },
            { icon: '🏛️', title: 'Board AI governance', desc: 'Board-level AI oversight documentation, AI ethics policy management, accountability framework, and executive AI risk reporting — designed for directors, not just technologists.' },
            { icon: '✅', title: 'Conformity assessment', desc: 'Step-by-step conformity assessment workflow for high-risk AI systems. Evidence collection, gap identification, remediation tracking, and EU database registration preparation.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FRAMEWORK COMPARISON */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={eyebrow}>Framework coverage</div>
            <h2 style={sectionTitle}>Every AI governance framework. One platform.</h2>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Framework', 'Jurisdiction', 'Applies to', 'Key requirement', 'ThemisIQ coverage'].map(h => (
                  <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['EU AI Act', 'EU (global scope)', 'Any AI affecting EU residents', 'Risk classification + conformity assessment for high-risk AI', '✓ Full'],
                ['NIST AI RMF', 'USA (voluntary/mandatory)', 'US federal agencies + voluntary', 'Map, Measure, Manage, Govern framework', '✓ Full'],
                ['ISO 42001:2023', 'Global', 'Organisations using or developing AI', 'AI management system — policies, controls, continuous improvement', '✓ Full'],
                ['GDPR Article 22', 'EU/UK', 'Automated decision-making affecting individuals', 'Right to explanation + human review for automated decisions', '✓ Partial'],
                ['Bill C-27 AIDA (proposed)', 'Canada', 'High-impact AI systems', 'Impact assessment + registration when enacted', '✓ Monitored'],
                ['SR 11-7 (Fed Reserve)', 'USA financial services', 'Banks using models for decisions', 'Model risk management — validation and governance', '✓ Partial'],
              ].map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 4 ? '#0F6E56' : '#555553', fontWeight: j === 4 ? 500 : 400 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* TIMELINE */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>EU AI Act timeline</div>
          <h2 style={sectionTitle}>What's already in force. What's coming.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { date: 'Feb 2, 2025', status: 'Active', label: 'Prohibited AI', desc: 'Manipulation, social scoring, real-time biometric surveillance in public spaces, and emotion recognition in workplaces banned. Non-compliance: fines up to €35M or 7% global revenue.', color: '#B91C1C', bg: '#FCEBEB' },
            { date: 'May 2, 2025', status: 'Active', label: 'GPAI obligations', desc: 'General Purpose AI models (GPT-4-class and above) subject to transparency, copyright, and systemic risk provisions. GPAI providers must publish technical documentation.', color: '#ba7517', bg: '#FEF3E2' },
            { date: 'Aug 2, 2026', status: '77 days', label: 'High-risk AI (Annex III)', desc: 'HR, hiring, credit, education, essential services AI — full conformity assessment, Article 11 documentation, EU database registration required. Fines up to €15M or 3% global revenue.', color: '#7425e3', bg: '#EDE9FE' },
            { date: 'Aug 2, 2027', status: 'Prepare now', label: 'High-risk AI (Annex II)', desc: 'AI embedded in regulated products (medical devices, machinery, vehicles) subject to full Annex III obligations. CE marking integration required.', color: '#0C447C', bg: '#E6F1FB' },
          ].map(({ date, status, label, desc, color, bg }) => (
            <div key={date} style={{ background: '#fff', padding: '2rem', borderTop: `4px solid ${color}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color, background: bg, padding: '2px 8px', borderRadius: 99 }}>{status}</span>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', fontWeight: 400, color: '#0d0d0d', margin: '10px 0 4px' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#888784', marginBottom: 10 }}>{date}</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#0d0d0d', padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2, color: '#fff' }}>
          77 days to the EU AI Act deadline.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Start your inventory today.</span>
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          The first step is knowing what AI systems you have and whether they're high-risk. ThemisIQ's AI inventory wizard walks you through every system in days — not months.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/ghg" style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none', display: 'inline-block' }}>Start your AI inventory →</a>
          <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: 'rgba(255,255,255,0.7)', border: '0.5px solid rgba(255,255,255,0.2)', textDecoration: 'none', display: 'inline-block' }}>Talk to an AI governance advisor</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '2rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co</div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="/privacy" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Terms of Service</a>
            <a href="/dashboard/ghg" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Free Assessment →</a>
          </div>
        </div>
      </footer>

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
