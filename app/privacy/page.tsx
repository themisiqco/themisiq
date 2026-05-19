'use client'
import Nav from '../components/Nav'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />
        <a href="/" style={{ textDecoration: 'none' }}>
          <img src="/logo.png" alt="ThemisIQ" style={{ height: 36, width: 'auto', mixBlendMode: 'multiply' }} />
        </a>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <a href="/climate-ghg" style={navLink}>Climate · GHG</a>
          <a href="/supply-chain" style={navLink}>Supply Chain</a>
          <a href="/deals" style={navLink}>Deals</a>
          <a href="/people" style={navLink}>People</a>
          <a href="/ai-governance" style={navLink}>AI Governance</a>
          <a href="/cyber" style={navLink}>Cyber</a>
          <a href="/advisory" style={navLink}>Advisory</a>
          <a href="/assess" style={navLink}>Free Assessment</a>
        </div>
        </div>
        <a href="/assess" style={btnGrad}>Start free trial</a>
      </nav>

      {/* HERO */}
      <div style={{ background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4', padding: '3.5rem 2.5rem 3rem' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }}>
            Privacy <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Policy</span>
          </h1>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
            {['Effective: May 17, 2026', 'TIQ-PRV-001 · v2.0', 'ThemisIQ Compliance Inc. · Canada', 'privacy@themisiq.co'].map(item => (
              <span key={item} style={{ fontSize: 12, color: '#888784' }}>{item}</span>
            ))}
          </div>
          <div style={{ background: 'rgba(116,37,227,0.05)', border: '0.5px solid rgba(116,37,227,0.2)', borderLeft: '3px solid #7425e3', borderRadius: 8, padding: '13px 15px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>Governing law: Canada (PIPEDA · Law 25 · CASL) + US state privacy laws + GDPR / UK GDPR for EU/UK customers</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>ThemisIQ Compliance Inc. is a Canadian company. This Privacy Policy complies with Canadian federal and provincial privacy law as the primary framework. Additional rights for US residents (CCPA/CPRA, state laws, CAN-SPAM, COPPA) are set out in Section 9.</div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 2.5rem', display: 'grid', gridTemplateColumns: '200px 1fr', gap: '3.5rem', alignItems: 'start' }}>

        {/* TOC */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12 }}>Contents</div>
          {sections.map(s => (
            <a key={s.id} href={`#${s.id}`} onClick={() => setActive(s.id)} style={{ display: 'block', fontSize: 12, color: s.highlight ? '#7425e3' : active === s.id ? '#7425e3' : '#555553', padding: '5px 0 5px 10px', borderLeft: `2px solid ${active === s.id || s.highlight ? '#7425e3' : 'transparent'}`, textDecoration: 'none', fontWeight: s.highlight ? 500 : 400, marginBottom: 2 }}>
              {s.title} {s.highlight && <span style={{ fontSize: 9, fontWeight: 600, color: '#7425e3', background: 'rgba(116,37,227,0.1)', borderRadius: 4, padding: '1px 5px', marginLeft: 4 }}>NEW</span>}
            </a>
          ))}
        </div>

        {/* CONTENT */}
        <div>

          {/* S1 */}
          <div id="s1" style={sectionStyle}>
            <div style={eyebrow}>Section 1</div>
            <h2 style={sectionHead}>Who we are</h2>
            <p style={body}><strong>ThemisIQ Compliance Inc.</strong> ("ThemisIQ", "we", "us") is a compliance intelligence and SaaS platform company incorporated in Canada, operating app.themisiq.co and www.themisiq.co.</p>
            <p style={body}>Our designated <strong>Privacy Officer</strong> is the Chief Executive Officer — <a href="mailto:privacy@themisiq.co" style={link}>privacy@themisiq.co</a>. All privacy requests should be directed to this address.</p>
          </div>

          <div style={divider} />

          {/* S2 */}
          <div id="s2" style={sectionStyle}>
            <div style={eyebrow}>Section 2</div>
            <h2 style={sectionHead}>What we collect</h2>
            <table style={tableStyle}>
              <thead><tr>{['Category', 'Examples', 'Our role'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Account data', 'Name, work email, job title, company, billing address', 'Controller'],
                  ['Platform data', 'GHG data, workforce metrics, supply chain data, AI inventories, cyber risk data entered into ThemisIQ modules', 'Processor — you are the controller'],
                  ['Assessment data', 'Compliance Assessment answers, email, company, role', 'Controller'],
                  ['Usage data', 'Log data, IP addresses, browser type, pages visited, feature usage', 'Controller'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
            <div style={boxGreen}>
              <div style={boxTitle}>What we never collect</div>
              <div style={boxBody}>Payment card numbers (Stripe handles these — PCI DSS Level 1). Special category personal data (health, biometric, political opinion) unless specifically agreed in writing. We never sell personal data. We use no advertising cookies or tracking pixels.</div>
            </div>
          </div>

          <div style={divider} />

          {/* S3 */}
          <div id="s3" style={sectionStyle}>
            <div style={eyebrow}>Section 3</div>
            <h2 style={sectionHead}>How we use your data</h2>
            <table style={tableStyle}>
              <thead><tr>{['Purpose', 'Data used', 'Legal basis'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Delivering the ThemisIQ platform', 'Account data, platform data', 'Contract performance'],
                  ['Sending assessment results and PDF', 'Assessment data, email', 'Express consent (CASL)'],
                  ['Marketing emails', 'Account data, email', 'Express consent (CASL) — unsubscribe anytime'],
                  ['Billing and invoicing', 'Account data', 'Contract / legal obligation (CRA)'],
                  ['Platform security', 'Usage data, log data', 'Legitimate interests'],
                  ['Platform improvement', 'Anonymised usage data', 'Legitimate interests (data anonymised first)'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
            <p style={body}><strong>We do not use your platform data</strong> (GHG figures, workforce data, supply chain data) to train AI models, benchmark against other customers, or derive insights for our own commercial benefit without your explicit written consent.</p>
          </div>

          <div style={divider} />

          {/* S4 */}
          <div id="s4" style={sectionStyle}>
            <div style={eyebrow}>Section 4</div>
            <h2 style={sectionHead}>Legal basis</h2>
            <p style={body}>For Canadian residents, our basis is the <strong>PIPEDA fair information principles</strong> — primarily consent and legitimate business purposes.</p>
            <p style={body}>For EU/EEA/UK residents, our bases under GDPR / UK GDPR are: contract performance (Art. 6(1)(b)), consent (Art. 6(1)(a)), legal obligation (Art. 6(1)(c)), and legitimate interests (Art. 6(1)(f)).</p>
            <p style={body}>For Québec residents, <strong>Law 25</strong> applies additional requirements — Privacy Impact Assessments, 72-hour breach reporting to the CAI, named Privacy Officer, and data portability rights.</p>
            <p style={body}>For US residents, see Section 9 for applicable federal and state law bases.</p>
          </div>

          <div style={divider} />

          {/* S5 */}
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
                  ['Resend', 'Name, email', 'Transactional and marketing email', 'USA'],
                  ['Anthropic', 'Structured prompts only — no raw personal data', 'AI-assisted platform features', 'USA'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
            <div style={boxGreen}>
              <div style={boxTitle}>We do not sell, share, or trade personal data</div>
              <div style={boxBody}>ThemisIQ does not sell personal information as defined under CCPA §1798.140(ad). We do not share personal information for cross-context behavioural advertising. ThemisIQ products are entirely ad-free.</div>
            </div>
          </div>

          <div style={divider} />

          {/* S6 */}
          <div id="s6" style={sectionStyle}>
            <div style={eyebrow}>Section 6</div>
            <h2 style={sectionHead}>International transfers</h2>
            <p style={body}>ThemisIQ is Canadian. Data is processed in Canada and transferred to sub-processors in the United States.</p>
            <div style={boxPurple}>
              <div style={boxTitle}>EU/UK customers — GDPR transfer mechanism</div>
              <div style={boxBody}>For EU/UK customers transferring personal data to ThemisIQ, we rely on Standard Contractual Clauses (SCCs) under GDPR Article 46(2)(c) and the UK International Data Transfer Agreement (IDTA). Our DPA incorporating SCCs is available at legal@themisiq.co. Canada has received EU adequacy recognition for PIPEDA-regulated data.</div>
            </div>
          </div>

          <div style={divider} />

          {/* S7 */}
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

          {/* S8 */}
          <div id="s8" style={sectionStyle}>
            <div style={eyebrow}>Section 8</div>
            <h2 style={sectionHead}>Your rights (all jurisdictions)</h2>
            <table style={tableStyle}>
              <thead><tr>{['Right', 'Canada (PIPEDA)', 'Québec (Law 25)', 'EU/UK (GDPR)', 'US (see §9)'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {[
                  ['Access your data', '✓ 30 days', '✓ 30 days', '✓ 30 days', '✓ 45 days'],
                  ['Correct inaccurate data', '✓', '✓', '✓', '✓ (most states)'],
                  ['Delete your data', 'Limited', '✓', '✓', '✓ (most states)'],
                  ['Data portability', 'Proposed (C-27)', '✓', '✓', '✓ (most states)'],
                  ['Withdraw consent', '✓', '✓', '✓', '✓'],
                  ['Opt out of sale / sharing', 'N/A', 'N/A', 'N/A', '✓ (N/A — we don\'t sell)'],
                ].map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ ...tdStyle, background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: cell.startsWith('✓') ? '#0F6E56' : '#555553', fontWeight: cell.startsWith('✓') ? 500 : 400 }}>{cell}</td>)}</tr>)}
              </tbody>
            </table>
            <p style={body}>To exercise any right, email <a href="mailto:privacy@themisiq.co" style={link}>privacy@themisiq.co</a>. We respond within 30 days (Canada/EU) or 45 days (US). No charge for the first request in any 12-month period.</p>
          </div>

          <div style={divider} />

          {/* S9 — US SECTION */}
          <div id="s9" style={{ ...sectionStyle, background: 'linear-gradient(135deg,rgba(116,37,227,0.03),rgba(31,177,255,0.02))', border: '0.5px solid rgba(116,37,227,0.15)', borderRadius: 12, padding: '1.5rem' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, background: 'rgba(116,37,227,0.1)', color: '#7425e3', padding: '3px 10px', borderRadius: 99, marginBottom: 10 }}>🇺🇸 US residents — additional rights</div>
            <div style={eyebrow}>Section 9 — New</div>
            <h2 style={sectionHead}>Additional rights for US residents</h2>
            <p style={body}>If you are a resident of the United States, the following additional disclosures and rights apply.</p>

            <h3 style={subHead}>9a. Federal law — FTC, CAN-SPAM, COPPA</h3>
            <p style={body}><strong>FTC Act Section 5.</strong> Our privacy practices are consistent with our published disclosures. We do not make material changes to our data practices without advance notice.</p>
            <p style={body}><strong>CAN-SPAM Act.</strong> All ThemisIQ commercial emails to US recipients comply with CAN-SPAM (15 U.S.C. §7701 et seq.):</p>
            {['From, To, and Reply-To fields are accurate and not deceptive', 'Subject lines accurately reflect email content', 'Our registered Canadian postal address appears in every commercial email footer', 'Every commercial email contains a functioning one-click unsubscribe link', 'Unsubscribe requests are honoured within 10 business days (we target 48 hours)', 'We do not transfer your email address to third parties for marketing after you opt out'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={{ color: '#0F6E56', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6 }}>{item}</span>
              </div>
            ))}
            <p style={{ ...body, marginTop: '0.75rem' }}><strong>COPPA.</strong> The ThemisIQ platform is directed exclusively at business professionals. We do not knowingly collect personal information from persons under 13. Our Terms of Service require users to be 18 or older.</p>

            <h3 style={{ ...subHead, marginTop: '1.5rem' }}>9b. California residents — CCPA / CPRA</h3>
            <div style={boxAmber}>
              <div style={boxTitle}>CCPA/CPRA threshold disclosure</div>
              <div style={boxBody}>ThemisIQ does not currently meet CCPA/CPRA mandatory thresholds ($26.625M revenue, 100K+ consumers, or 50%+ revenue from selling data). We provide the following rights voluntarily as best practice.</div>
            </div>
            <div style={{ ...boxGreen, marginTop: '0.75rem' }}>
              <div style={boxTitle}>We do not sell or share your personal information — no opt-out action needed</div>
              <div style={boxBody}>ThemisIQ does not sell personal information as defined under CCPA §1798.140(ad). You do not need to submit a "Do Not Sell or Share" request because we do not engage in these activities.</div>
            </div>

            <h3 style={{ ...subHead, marginTop: '1.5rem' }}>9c. All US state privacy laws</h3>
            <p style={body}>As of May 2026, residents of the following states have privacy rights similar to those described above — access, deletion, correction, portability, and opt-out of sale (which we do not engage in):</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, margin: '0.8rem 0' }}>
              {[['California', 'CCPA/CPRA', 'Jan 2020/2023'], ['Virginia', 'VCDPA', 'Jan 2023'], ['Colorado', 'CPA', 'Jul 2023'], ['Connecticut', 'CTDPA', 'Jul 2023'], ['Texas', 'TDPSA', 'Jul 2024'], ['Montana', 'MCDPA', 'Oct 2024'], ['Oregon', 'OCPA', 'Jul 2024'], ['Delaware', 'DPDPA', 'Jan 2025'], ['New Hampshire', 'NHPA', 'Jan 2025'], ['New Jersey', 'NJDPA', 'Jan 2025'], ['Nebraska', 'NDPA', 'Jan 2025'], ['Maryland', 'MODPA', 'Oct 2025']].map(([state, law, date]) => (
                <div key={state} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 2 }}>{state}</div>
                  <div style={{ fontSize: 10, color: '#7425e3', fontWeight: 500, marginBottom: 2 }}>{law}</div>
                  <div style={{ fontSize: 10, color: '#888784' }}>{date}</div>
                </div>
              ))}
            </div>
            <p style={body}>To exercise any right under any US state privacy law, email <a href="mailto:privacy@themisiq.co" style={link}>privacy@themisiq.co</a>. We will respond within 45 days.</p>
          </div>

          <div style={divider} />

          {/* S10 */}
          <div id="s10" style={sectionStyle}>
            <div style={eyebrow}>Section 10</div>
            <h2 style={sectionHead}>Cookies</h2>
            {['Essential cookies — session management, authentication, CSRF protection. Cannot be disabled.', 'Analytics cookies — anonymised usage analytics (page views, feature usage). Can be declined via cookie banner.'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: '#7425e3', flexShrink: 0, marginTop: 2 }}>•</span>
                <span style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.65 }}><strong>{item.split(' — ')[0]}</strong> — {item.split(' — ')[1]}</span>
              </div>
            ))}
            <p style={body}>We do not use advertising cookies, tracking pixels, or third-party behavioural targeting. ThemisIQ products are entirely ad-free.</p>
          </div>

          <div style={divider} />

          {/* S11 */}
          <div id="s11" style={sectionStyle}>
            <div style={eyebrow}>Section 11</div>
            <h2 style={sectionHead}>Contact & complaints</h2>
            <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '1.25rem 1.5rem', margin: '1rem 0' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', fontWeight: 400, color: '#fff', marginBottom: 8 }}>Privacy Officer — ThemisIQ Compliance Inc.</div>
              {['Email: privacy@themisiq.co', 'Response time: 30 days (Canada/EU) · 45 days (US) · 72 hours for breach notifications', 'Subject line for California requests: "CA Privacy Request"'].map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{item}</div>
              ))}
            </div>
            <p style={body}>If you are not satisfied with our response, you may escalate to:</p>
            {[['Canada', 'Office of the Privacy Commissioner — priv.gc.ca'], ['Québec', 'Commission d\'accès à l\'information — cai.gouv.qc.ca'], ['California', 'California Privacy Protection Agency — cppa.ca.gov'], ['EU', 'Your national data protection supervisory authority'], ['UK', 'Information Commissioner\'s Office — ico.org.uk']].map(([jurisdiction, body_]) => (
              <div key={jurisdiction} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', minWidth: 80 }}>{jurisdiction}:</span>
                <span style={{ fontSize: 13, color: '#555553', fontWeight: 300 }}>{body_}</span>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co · TIQ-PRV-001 v2.0</div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="/terms" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Terms of Service</a>
            <a href="/security" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Security</a>
          </div>
        </div>
      </footer>

    </div>
  )
}

// ── STYLES ──────────────────────────────────────────────────────────
const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const sectionStyle: React.CSSProperties = { marginBottom: '2.5rem', scrollMarginTop: 80 }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 5 }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.45rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '0.9rem', lineHeight: 1.2 }
const subHead: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#0d0d0d', margin: '1.2rem 0 0.6rem' }
const body: React.CSSProperties = { fontSize: 13.5, color: '#555553', lineHeight: 1.8, fontWeight: 300, marginBottom: '0.9rem' }
const divider: React.CSSProperties = { height: '0.5px', background: '#e8e7e4', margin: '2rem 0' }
const link: React.CSSProperties = { color: '#7425e3', textDecoration: 'none' }
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', margin: '0.8rem 0', fontSize: 12 }
const thStyle: React.CSSProperties = { background: '#0d0d0d', color: '#fff', padding: '8px 12px', textAlign: 'left', fontWeight: 500, fontSize: 11 }
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', verticalAlign: 'top', lineHeight: 1.5 }
const boxGreen: React.CSSProperties = { background: '#E1F5EE', border: '0.5px solid rgba(29,158,117,0.25)', borderLeft: '3px solid #1D9E75', borderRadius: 8, padding: '13px 15px', margin: '1rem 0' }
const boxPurple: React.CSSProperties = { background: 'rgba(116,37,227,0.05)', border: '0.5px solid rgba(116,37,227,0.2)', borderLeft: '3px solid #7425e3', borderRadius: 8, padding: '13px 15px', margin: '1rem 0' }
const boxAmber: React.CSSProperties = { background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.25)', borderLeft: '3px solid #ba7517', borderRadius: 8, padding: '13px 15px', margin: '1rem 0' }
const boxTitle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }
const boxBody: React.CSSProperties = { fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }
