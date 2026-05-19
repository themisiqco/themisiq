'use client'
import Nav from '../components/Nav'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />
      <div style={{ background: '#0d0d0d', padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #1a1a1a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#fff', maxWidth: 700 }}>
            Security at{' '}
            <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>ThemisIQ</span>
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', lineHeight: 1.75, fontWeight: 300, marginBottom: '2.5rem', maxWidth: 560 }}>
            ThemisIQ processes your most sensitive compliance data — GHG inventories, workforce metrics, supply chain records, and cyber risk registers. We take security seriously, not as a checkbox, but as a foundational design requirement.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const }}>
            {[['TIQ-SEC-001', 'Policy ID'], ['v2.0', 'Version'], ['security@themisiq.co', 'Report issues']].map(([val, label]) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>{val}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CERTIFICATIONS */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={eyebrow}>Certifications & compliance</div>
        <h2 style={sectionTitle}>Our security posture.</h2>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0, border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden', marginTop: '1.5rem' }}>
          {[
            { name: 'SOC 2 Type I', status: 'In progress', badge: 'amber', detail: 'Target: Q4 2026 — gap assessment in progress', icon: '🛡️' },
            { name: 'SOC 2 Type II', status: 'In progress', badge: 'amber', detail: 'Target: Q2 2027 — dependent on Type I completion', icon: '🛡️' },
            { name: 'ISO 27001:2022', status: 'In progress', badge: 'amber', detail: 'Target: Q2 2027 — controls mapped, ISMS design phase', icon: '📋' },
            { name: 'PIPEDA & Law 25 (Québec)', status: 'Compliant', badge: 'green', detail: 'DPA templates complete · privacy breach procedures in place', icon: '🔒' },
            { name: 'GDPR / UK GDPR — data processor', status: 'Compliant', badge: 'green', detail: 'Standard Contractual Clauses (SCCs) in place · DPA available on request', icon: '🌍' },
            { name: 'PCI DSS', status: 'Via Stripe', badge: 'green', detail: 'Payment processing via Stripe (PCI DSS Level 1) — ThemisIQ never stores card data', icon: '💳' },
          ].map(({ name, status, badge, detail, icon }, i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: i % 2 === 0 ? '#fff' : '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
              <div style={{ fontSize: 20, flexShrink: 0 }}>{icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 2 }}>{name}</div>
                <div style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>{detail}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: badge === 'green' ? '#E1F5EE' : '#FEF3E2', color: badge === 'green' ? '#085041' : '#633806', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{status}</span>
            </div>
          ))}
        </div>
      </section>

      {/* INFRASTRUCTURE */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={eyebrow}>Infrastructure</div>
          <h2 style={sectionTitle}>Where your data lives.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginTop: '1.5rem' }}>
            {[
              { icon: '🗄️', title: 'Database — Supabase (AWS)', body: 'All customer platform data stored in Supabase on AWS infrastructure. Supabase holds SOC 2 Type II and ISO 27001 certifications. US-East region by default.' },
              { icon: '☁️', title: 'Application — Vercel', body: 'ThemisIQ application hosted on Vercel with global CDN. Vercel holds SOC 2 Type II certification. HTTPS enforced on all endpoints; HSTS enabled.' },
              { icon: '💳', title: 'Payments — Stripe', body: 'All payment processing handled by Stripe, PCI DSS Level 1 certified. ThemisIQ never stores, processes, or transmits card numbers.' },
              { icon: '💾', title: 'Backups — continuous PITR', body: 'Continuous point-in-time recovery with 30-day retention. Backups replicated to geographically separate AWS region. RTO: 4 hours. RPO: 1 hour.' },
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', position: 'relative' as const, overflow: 'hidden' }}>
                <div style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#7425e3,#1fb1ff,#64fe3e)' }} />
                <div style={{ fontSize: 22, marginBottom: 10 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DATA PROTECTION */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'start' }}>
          <div>
            <div style={eyebrow}>Data protection</div>
            <h2 style={sectionTitle}>How your data is protected.</h2>
            {[
              ['Encryption in transit', 'All data transmitted to and from ThemisIQ is encrypted using TLS 1.2 or higher. TLS 1.0 and 1.1 are disabled.'],
              ['Encryption at rest', 'All data at rest is encrypted using AES-256 at the storage layer via AWS-managed encryption keys.'],
              ['Tenant isolation', 'Your data is logically isolated from all other customers using database-level Row-Level Security (RLS) enforced by tenant_id. Cross-tenant data access is architecturally impossible.'],
              ['Immutable audit trail', 'All changes to your compliance data are logged in an immutable audit trail written by the database — not the application. Cannot be modified by any user or administrator.'],
              ['No AI training on your data', 'Your compliance data is not used to train AI models. Only structured prompts are sent to our AI provider — never raw customer data.'],
            ].map(([title, body], i) => (
              <div key={i} style={{ borderBottom: '0.5px solid #e8e7e4', padding: '14px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{body}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={eyebrow}>Access control</div>
            <h2 style={sectionTitle}>Who can access your data.</h2>
            {[
              ['You control access', 'You manage user access within your organisation via ThemisIQ\'s role-based access control (RBAC). User roles: Administrator, Editor, Viewer.'],
              ['ThemisIQ staff access', 'ThemisIQ employees do not have routine access to customer platform data. Support access requires a documented request, approval, and is logged.'],
              ['MFA mandatory', 'Multi-factor authentication is mandatory for all ThemisIQ staff accessing production systems. We recommend enabling MFA for all customer accounts.'],
              ['Least privilege', 'ThemisIQ staff access follows least-privilege principles. Privileged access is reviewed quarterly.'],
              ['Offboarding', 'All system access is revoked within 1 hour of any staff termination — voluntary or involuntary.'],
            ].map(([title, body], i) => (
              <div key={i} style={{ borderBottom: '0.5px solid #e8e7e4', padding: '14px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* INCIDENT RESPONSE */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={eyebrow}>Incident response</div>
          <h2 style={sectionTitle}>What happens if something goes wrong.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden', marginTop: '1.5rem' }}>
            {[
              { step: '01', title: 'Detect', body: 'We monitor all production systems 24/7 for anomalies, security events, and unauthorised access attempts.' },
              { step: '02', title: 'Contain', body: 'P1 incidents are contained within 1 hour of detection. Affected systems are isolated immediately.' },
              { step: '03', title: 'Notify', body: 'You are notified within 24 hours of a confirmed data breach affecting your data. Regulatory notifications within 72 hours.' },
              { step: '04', title: 'Review', body: 'Every P1 and P2 incident has a mandatory post-incident review within 14 days. Findings shared with affected customers on request.' },
            ].map(({ step, title, body }) => (
              <div key={step} style={{ background: '#fff', padding: '2rem' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 8, opacity: 0.6 }}>{step}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* VULNERABILITY */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem' }}>
          <div>
            <div style={eyebrow}>Vulnerability management</div>
            <h2 style={sectionTitle}>Keeping the platform secure.</h2>
            {[
              ['Weekly scanning', 'Automated vulnerability scanning across all production systems every week'],
              ['Critical patches', 'Applied within 7 days of discovery'],
              ['Annual penetration test', 'By an independent third-party security firm. Findings tracked to closure.'],
              ['Dependency scanning', 'All third-party code dependencies scanned for known vulnerabilities in the CI/CD pipeline on every build'],
              ['Code review', 'All code changes require peer review before merging to production'],
              ['Secrets management', 'API keys and credentials managed via secure environment variable injection — never committed to source code'],
            ].map(([title, body], i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '0.5px solid #e8e7e4' }}>
                <span style={{ color: '#0F6E56', flexShrink: 0, fontWeight: 600, marginTop: 1 }}>✓</span>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{title} — </span>
                  <span style={{ fontSize: 13, color: '#555553', fontWeight: 300 }}>{body}</span>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div style={eyebrow}>Report a security issue</div>
            <h2 style={sectionTitle}>Responsible disclosure.</h2>
            <p style={{ fontSize: 14, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              If you discover a security vulnerability or believe you have seen suspicious activity in your ThemisIQ account, please contact us immediately. We take all security reports seriously and will respond within 24 hours.
            </p>
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 6 }}>Security team — ThemisIQ Compliance Inc.</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Email: <a href="mailto:security@themisiq.co" style={{ color: '#64fe3e' }}>security@themisiq.co</a></div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Response time: 24 hours for all security reports</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8, fontStyle: 'italic' }}>We do not pursue legal action against researchers acting in good faith.</div>
            </div>
            <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(29,158,117,0.25)', borderLeft: '3px solid #1D9E75', borderRadius: 8, padding: '13px 15px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>Enterprise security reviews</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>Penetration test reports, SOC 2 bridge letters, and full security questionnaire responses are available on request for enterprise customers conducting security due diligence.</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '2rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co · TIQ-SEC-001 v2.0</div>
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

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
