'use client'

import { useState } from 'react'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'

const sections = [
  { id: 's1', num: '01', title: 'Who we are' },
  { id: 's2', num: '02', title: 'What we collect' },
  { id: 's3', num: '03', title: 'How we use your data' },
  { id: 's4', num: '04', title: 'Legal basis' },
  { id: 's5', num: '05', title: 'Data sharing' },
  { id: 's6', num: '06', title: 'International transfers' },
  { id: 's7', num: '07', title: 'Data retention' },
  { id: 's8', num: '08', title: 'Your rights' },
  { id: 's9', num: '09', title: 'US residents', highlight: true },
  { id: 's10', num: '10', title: 'Cookies' },
  { id: 's11', num: '11', title: 'Contact & complaints' },
]

export default function PrivacyPage() {
  const [active, setActive] = useState('s1')

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>

      <Nav />

      {/* HERO */}
      <div style={{ background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4', padding: '3.5rem 2.5rem 3rem' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-ink-muted)', marginBottom: 8 }}>ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 4vw, 3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }}>
            Privacy <span style={{ fontStyle: 'italic', color: 'var(--color-brand)' }}>Policy</span>
          </h1>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
            {['Effective: May 17, 2026', 'TIQ-PRV-001 · v2.0', 'ThemisIQ Compliance Inc. · Canada', 'privacy@themisiq.co'].map(item => (
              <span key={item} style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>{item}</span>
            ))}
          </div>
          <div className="tq-callout tq-callout-note" style={{ '--tq-state': 'var(--color-brand)', '--tq-state-wash': 'color-mix(in srgb, var(--color-brand) 5%, transparent)' } as React.CSSProperties}>
            <div className="tq-callout-heading">Governing law: Canada (PIPEDA · Law 25 · CASL) + US state privacy laws + GDPR / UK GDPR for EU/UK customers</div>
            <div className="tq-callout-text">ThemisIQ Compliance Inc. is a Canadian company. This Privacy Policy complies with Canadian federal and provincial privacy law as the primary framework. Additional rights for US residents (CCPA/CPRA, state laws, CAN-SPAM, COPPA) are set out in Section 9.</div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 2.5rem', display: 'grid', gridTemplateColumns: '200px 1fr', gap: '3.5rem', alignItems: 'start' }}>

        {/* TOC */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: 'var(--color-ink-muted)', marginBottom: 12 }}>Contents</div>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} onClick={() => setActive(s.id)} style={{ display: 'block', fontSize: 12, color: s.highlight ? 'var(--color-brand)' : active === s.id ? 'var(--color-brand)' : '#555553', padding: '5px 0 5px 10px', borderLeft: `2px solid ${active === s.id || s.highlight ? 'var(--color-brand)' : 'transparent'}`, textDecoration: 'none', fontWeight: s.highlight ? 500 : 400, marginBottom: 2 }}>
              {s.title} {s.highlight && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-brand)', background: 'color-mix(in srgb, var(--color-brand) 10%, transparent)', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>NEW</span>}
            </a>
          ))}
        </div>

        {/* CONTENT */}
        <div>

          <div id="s1" style={sectionStyle}>
            <div style={eyebrow}>Section 1</div>
            <h2 style={sectionHead}>Who we are</h2>
            <p style={body}><strong>ThemisIQ Compliance Inc.</strong> ("ThemisIQ", "we", "us") is a compliance intelligence and SaaS platform company incorporated in Canada, operating www.themisiq.co.</p>
            <p style={body}>Our designated <strong>Privacy Officer</strong> is the Chief Executive Officer — <a href="mailto:privacy@themisiq.co" style={link}>privacy@themisiq.co</a>. All privacy requests should be directed to this address.</p>
          </div>
          <div style={divider} />

          <div id="s2" style={sectionStyle}>
            <div style={eyebrow}>Section 2</div>
            <h2 style={sectionHead}>What we collect</h2>
            <table style={tableStyle}>
              <thead><tr>{['Category', 'Examples', 'Our role'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Account data', 'Name, work email, job title, company, billing address', 'Controller'],
                  ['Platform data', 'GHG data, workforce metrics, supply chain data, AI inventories entered into ThemisIQ modules', 'Processor — you are the controller'],
                  ['Assessment data', 'Compliance Assessment answers, email, company, role', 'Controller'],
                  ['Usage data', 'Log data, IP addresses, browser type, pages visited, feature usage', 'Controller'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
            <div className="tq-callout tq-callout-note" style={{ '--tq-state': '#1D9E75', '--tq-state-wash': '#E1F5EE' } as React.CSSProperties}>
              <div className="tq-callout-heading">What we never collect</div>
              <div className="tq-callout-text">Payment card numbers (Stripe handles these). Special category personal data unless specifically agreed in writing. We never sell personal data. We use no advertising cookies or tracking pixels.</div>
            </div>
          </div>
          <div style={divider} />

          <div id="s3" style={sectionStyle}>
            <div style={eyebrow}>Section 3</div>
            <h2 style={sectionHead}>How we use your data</h2>
            <table style={tableStyle}>
              <thead><tr>{['Purpose', 'Data used', 'Legal basis'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Delivering the ThemisIQ platform', 'Account data, platform data', 'Contract performance'],
                  ['Sending assessment results', 'Assessment data, email', 'Express consent (CASL)'],
                  ['Marketing emails', 'Account data, email', 'Express consent (CASL) — unsubscribe anytime'],
                  ['Billing and invoicing', 'Account data', 'Contract / legal obligation (CRA)'],
                  ['Platform security', 'Usage data, log data', 'Legitimate interests'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <div style={divider} />

          <div id="s4" style={sectionStyle}>
            <div style={eyebrow}>Section 4</div>
            <h2 style={sectionHead}>Legal basis</h2>
            <p style={body}>For Canadian residents, our basis is the <strong>PIPEDA fair information principles</strong> — primarily consent and legitimate business purposes.</p>
            <p style={body}>For EU/EEA/UK residents, our bases under GDPR / UK GDPR are: contract performance (Art. 6(1)(b)), consent (Art. 6(1)(a)), legal obligation (Art. 6(1)(c)), and legitimate interests (Art. 6(1)(f)).</p>
            <p style={body}>For Québec residents, <strong>Law 25</strong> applies additional requirements — Privacy Impact Assessments, 72-hour breach reporting to the CAI, named Privacy Officer, and data portability rights.</p>
          </div>
          <div style={divider} />

          <div id="s5" style={sectionStyle}>
            <div style={eyebrow}>Section 5</div>
            <h2 style={sectionHead}>Data sharing</h2>
            <table style={tableStyle}>
              <thead><tr>{['Recipient', 'Data shared', 'Purpose', 'Location'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Supabase (AWS)', 'All platform data', 'Database, auth, storage', 'USA'],
                  ['Vercel', 'Application traffic', 'Hosting and CDN', 'Global'],
                  ['Stripe', 'Billing data', 'Payment processing', 'USA'],
                  ['Resend', 'Name, email', 'Transactional email', 'USA'],
                  ['Anthropic', 'Structured prompts only', 'AI-assisted features', 'USA'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
            <div className="tq-callout tq-callout-note" style={{ '--tq-state': '#1D9E75', '--tq-state-wash': '#E1F5EE' } as React.CSSProperties}>
              <div className="tq-callout-heading">We do not sell, share, or trade personal data</div>
              <div className="tq-callout-text">ThemisIQ does not sell personal information as defined under CCPA. We do not share personal information for cross-context behavioural advertising. ThemisIQ products are entirely ad-free.</div>
            </div>
          </div>
          <div style={divider} />

          <div id="s6" style={sectionStyle}>
            <div style={eyebrow}>Section 6</div>
            <h2 style={sectionHead}>International transfers</h2>
            <p style={body}>ThemisIQ is Canadian. Data is processed in Canada and transferred to sub-processors in the United States.</p>
            <div className="tq-callout tq-callout-note" style={{ '--tq-state': 'var(--color-brand)', '--tq-state-wash': 'color-mix(in srgb, var(--color-brand) 5%, transparent)' } as React.CSSProperties}>
              <div className="tq-callout-heading">EU/UK customers — GDPR transfer mechanism</div>
              <div className="tq-callout-text">For EU/UK customers, we rely on Standard Contractual Clauses (SCCs) under GDPR Article 46(2)(c) and the UK International Data Transfer Agreement (IDTA). Our DPA incorporating SCCs is available at legal@themisiq.co.</div>
            </div>
          </div>
          <div style={divider} />

          <div id="s7" style={sectionStyle}>
            <div style={eyebrow}>Section 7</div>
            <h2 style={sectionHead}>Data retention</h2>
            <table style={tableStyle}>
              <thead><tr>{['Data type', 'Retention period', 'Basis'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Customer platform data', 'Subscription duration + 90 days', 'Contract'],
                  ['Account and contact data', '7 years from last activity', 'Canada Revenue Agency'],
                  ['Marketing consent records', '3 years from last interaction', 'CASL'],
                  ['Assessment / lead data', '3 years from collection', 'PIPEDA / CASL'],
                  ['Security and audit logs', '5 years', 'ISO 27001 / SOC 2'],
                  ['Billing records', '7 years', 'Canada Revenue Agency'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          <div style={divider} />

          <div id="s8" style={sectionStyle}>
            <div style={eyebrow}>Section 8</div>
            <h2 style={sectionHead}>Your rights (all jurisdictions)</h2>
            <p style={body}>To exercise any right, email <a href="mailto:privacy@themisiq.co" style={link}>privacy@themisiq.co</a>. We respond within 30 days (Canada/EU) or 45 days (US). No charge for the first request in any 12-month period.</p>
          </div>
          <div style={divider} />

          <div id="s9" style={{ ...sectionStyle, background: 'var(--color-brand-wash)', border: '0.5px solid color-mix(in srgb, var(--color-brand) 15%, transparent)', borderRadius: 12, padding: '1.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, background: 'color-mix(in srgb, var(--color-brand) 10%, transparent)', color: 'var(--color-brand)', padding: '3px 10px', borderRadius: 99, marginBottom: 10 }}>🇺🇸 US residents — additional rights</div>
            <div style={eyebrow}>Section 9</div>
            <h2 style={sectionHead}>Additional rights for US residents</h2>
            <p style={body}>ThemisIQ does not sell personal information as defined under CCPA §1798.140(ad). You do not need to submit a "Do Not Sell or Share" request because we do not engage in these activities.</p>
            <p style={body}>Residents of California, Virginia, Colorado, Connecticut, Texas, Montana, Oregon, Delaware, New Hampshire, New Jersey, Nebraska, and Maryland have rights to access, delete, correct, and port their personal data. To exercise any right, email <a href="mailto:privacy@themisiq.co" style={link}>privacy@themisiq.co</a>.</p>
            <p style={body}><strong>CAN-SPAM:</strong> All ThemisIQ commercial emails to US recipients comply with CAN-SPAM. Every commercial email contains a functioning one-click unsubscribe link honoured within 48 hours.</p>
            <p style={body}><strong>COPPA:</strong> The ThemisIQ platform is directed exclusively at business professionals. We do not knowingly collect personal information from persons under 13.</p>
          </div>
          <div style={divider} />

          <div id="s10" style={sectionStyle}>
            <div style={eyebrow}>Section 10</div>
            <h2 style={sectionHead}>Cookies</h2>
            <p style={body}>We use essential cookies (session management, authentication) and optional analytics cookies (anonymised usage). We do not use advertising cookies, tracking pixels, or third-party behavioural targeting. ThemisIQ products are entirely ad-free.</p>
          </div>
          <div style={divider} />

          <div id="s11" style={sectionStyle}>
            <div style={eyebrow}>Section 11</div>
            <h2 style={sectionHead}>Contact & complaints</h2>
            <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '1.25rem 1.5rem', margin: '1rem 0' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 400, color: '#fff', marginBottom: 8 }}>Privacy Officer — ThemisIQ Compliance Inc.</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Email: privacy@themisiq.co · Response: 30 days (Canada/EU) · 45 days (US)</div>
            </div>
          </div>

        </div>
      </div>

      {/* FOOTER */}
      <Footer />

    </div>
  )
}

const sectionStyle: React.CSSProperties = { marginBottom: '2.5rem', scrollMarginTop: 80 }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-brand)', marginBottom: 5 }
const sectionHead: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '0.9rem', lineHeight: 1.2 }
const body: React.CSSProperties = { fontSize: 13.5, color: '#555553', lineHeight: 1.8, fontWeight: 400, marginBottom: '0.9rem' }
const divider: React.CSSProperties = { height: '0.5px', background: '#e8e7e4', margin: '2rem 0' }
const link: React.CSSProperties = { color: 'var(--color-brand)', textDecoration: 'none' }
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', margin: '0.8rem 0', fontSize: 12 }
const thStyle: React.CSSProperties = { background: '#0d0d0d', color: '#fff', padding: '8px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11 }
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', verticalAlign: 'top', lineHeight: 1.5 }
