'use client'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { sectionTitle } from '@/app/components/headingStyles'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />
      {/* ⚠️ A LIGHT PAGE HEADER, AND DELIBERATELY NOT A ruledSection. The other four converted
          sections open with a 2px ink top rule, which says "the next section". This is the <h1>
          header directly under <Nav> — there is nothing above it to be ruled off from, and a rule
          here would read as a divider under the nav. It takes the homepage hero treatment instead:
          light ground, a hairline below, no rule above. */}
      <div style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid var(--color-line)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-ink-muted)', marginBottom: 8 }}>ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: 'var(--color-ink)', maxWidth: 700 }}>
            Security at{' '}
            {/* ⚠️ NOT A WORDMARK, AND THE HOLD ON IT WAS WITHDRAWN ON EVIDENCE.
                This was held in tasks 15b and 16b as a logotype that had to match the mark in
                email. Both halves were wrong. The real wordmark is <img src="/logo.png"> in
                app/components/Nav.tsx and Footer.tsx; the email mark is plain
                `font-family: Georgia, serif; color: #fff` and has NEVER carried a gradient. This is
                an italic emphasis span inside an <h1> — the same construct as the homepage's
                <em style={gradText}>One Intelligent Platform.</em>, flattened in task 16b.
                It was also failing in production: violet-to-lime measures 2.88:1 on the old black
                ground at the violet end and 1.33:1 on white at the lime end, so the word was
                illegible in one third of its own letters whichever ground it sat on. No ramp of
                that kind is legible as type — the same finding lib/pdf/layout.ts recorded when it
                banned this ramp from PDFs. Flat brand is 7.62:1, and matches gradText exactly. */}
            <span style={{ fontStyle: 'italic', color: 'var(--color-brand)' }}>ThemisIQ</span>
          </h1>
          <p style={{ fontSize: 16, color: 'var(--color-ink-2)', lineHeight: 1.75, fontWeight: 400, marginBottom: '2.5rem', maxWidth: 560 }}>
            ThemisIQ processes your most sensitive compliance data — GHG inventories, workforce metrics, supply chain records, and cyber risk registers. We take security seriously, not as a checkbox, but as a foundational design requirement.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const }}>
            {/* ⚠️ A CHIP SET, NOT A RULED LIST. The nested card on the other four sections became
                listRow because it held rows of prose. These three are key/value pairs sat in a row
                — a chip is what that is, so the rgba(255,255,255,0.05) fill becomes a real sunken
                fill with a real 1px border rather than a hairline between rows. */}
            {[['TIQ-SEC-001', 'Policy ID'], ['v2.0', 'Version'], ['security@themisiq.co', 'Report issues']].map(([val, label]) => (
              <div key={label} style={{ background: 'var(--color-sunken)', border: '1px solid var(--color-line)', borderRadius: 8, padding: '8px 16px' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink)' }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 1 }}>{label}</div>
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
            { name: 'SOC 2 Type I', status: 'In progress', badge: 'amber', detail: 'Target: Q4 2026 — gap assessment in progress' },
            { name: 'SOC 2 Type II', status: 'In progress', badge: 'amber', detail: 'Target: Q2 2027 — dependent on Type I completion' },
            { name: 'ISO 27001:2022', status: 'In progress', badge: 'amber', detail: 'Target: Q2 2027 — controls mapped, ISMS design phase' },
            { name: 'PIPEDA & Law 25 (Québec)', status: 'Compliant', badge: 'green', detail: 'DPA templates complete · privacy breach procedures in place' },
            { name: 'GDPR / UK GDPR — data processor', status: 'Compliant', badge: 'green', detail: 'Standard Contractual Clauses (SCCs) in place · DPA available on request' },
            { name: 'PCI DSS', status: 'Via Stripe', badge: 'green', detail: 'Payment processing via Stripe (PCI DSS Level 1) — ThemisIQ never stores card data' },
          ].map(({ name, status, badge, detail }, i) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', background: i % 2 === 0 ? '#fff' : '#f8f7f5', borderBottom: '0.5px solid #e8e7e4' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 2 }}>{name}</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>{detail}</div>
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
              { title: 'Database — Supabase (AWS)', via: 'Supabase', status: null, body: 'All customer platform data stored in Supabase on AWS infrastructure. Supabase holds SOC 2 Type II and ISO 27001 certifications. US-East region by default.' },
              { title: 'Application — Vercel', via: 'Vercel', status: null, body: 'ThemisIQ application hosted on Vercel with global CDN. Vercel holds SOC 2 Type II certification. HTTPS enforced on all endpoints; HSTS enabled.' },
              { title: 'Payments — Stripe', via: 'Stripe', status: null, body: 'All payment processing handled by Stripe, PCI DSS Level 1 certified. ThemisIQ never stores, processes, or transmits card numbers.' },
              { title: 'Backups — manual snapshots today', via: null, status: 'In progress', body: 'Supabase Free provides no point-in-time recovery. Backups today are manual pg_dump snapshots, held in two locations and verified by SHA-256 checksum. Continuous PITR arrives with the Supabase Pro upgrade — target September 2026. Retention window, cross-region replication and RTO/RPO figures will be stated here once Pro is live and a restore has been tested.' },
            ].map(({ title, via, status, body }) => (
              <div key={title} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', position: 'relative' as const, overflow: 'hidden' }}>
                <div style={{ position: 'absolute' as const, top: 0, left: 0, right: 0, height: 3, background: 'var(--color-brand)' }} />
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{title}</div>
                  {/* ⚠️ THE SAME BADGE THE PCI DSS ROW USES, FOR THE SAME REASON. These cards name
                      certifications that belong to a SUBPROCESSOR, not to ThemisIQ. The prose
                      already attributes them correctly — "Supabase holds…", "Vercel holds…" — but a
                      reader scanning the page meets a green "SOC 2 Type II" here about thirty lines
                      below the amber "In progress" row for ThemisIQ's OWN SOC 2. The words were
                      right and the adjacency was doing the damage; the badge makes the holder
                      visible at a glance rather than only on a careful read.
                      Backups carries via: null — it describes ThemisIQ's own configuration and
                      names no third-party certification, so there is nothing to attribute. */}
                  {via && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#E1F5EE', color: '#085041', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>Via {via}</span>
                  )}
                  {/* ⚠️ A STATUS BADGE, NOT AN ATTRIBUTION BADGE, AND THE COLOUR CARRIES THE
                      DIFFERENCE. "Via {vendor}" is green and answers WHO HOLDS a certification.
                      This is amber and answers WHETHER A CONTROL IS IN PLACE YET — the same amber,
                      the same words and the same values as the "In progress" rows in the
                      certifications table above, because the reader has already been taught to
                      read that. Backups keeps via: null: it describes ThemisIQ's own configuration
                      and there is no third party to attribute it to. What it needed was not an
                      attribution but an honest status. */}
                  {status && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 99, background: '#FEF3E2', color: '#633806', whiteSpace: 'nowrap' as const, flexShrink: 0 }}>{status}</span>
                  )}
                </div>
                <div className="tq-callout-text">{body}</div>
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
              ['Account isolation', 'Your data is isolated at the database level. Row-Level Security is enabled on every table and scoped to the authenticated user, so one account cannot read another account\u2019s rows. A small number of server-side operations run with elevated database privileges; these are limited to named API routes and are not reachable from the browser.'],
              ['Audit trail \u2014 GHG and CBAM', 'Every change to your GHG inventory and CBAM disclosure data is written to an audit log by a database trigger, not by the application, so the entry is recorded even if the application is bypassed. The log is append-only: no update or delete permission on it is granted to any signed-in account. Other modules are not yet covered.'],
            ].map(([title, body], i) => (
              <div key={i} style={{ borderBottom: '0.5px solid #e8e7e4', padding: '14px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 400 }}>{body}</div>
              </div>
            ))}
          </div>

          <div>
            <div style={eyebrow}>Access control</div>
            <h2 style={sectionTitle}>Who can access your data.</h2>
            {[
              ['Account-level access', 'Your data belongs to the account that created it, and access is per account \u2014 signing in with your own credentials is what reaches your data, and no other account can. ThemisIQ does not offer shared team accounts or per-user permissions within an organisation.'],
              ['Who operates ThemisIQ', 'ThemisIQ is operated by its founder, with one named deputy for continuity. Production access is held by those two accounts and no others. There is no support organisation with standing access to customer data, and no third party administers the platform on our behalf.'],
              ['Multi-factor authentication', 'Every account with production access \u2014 Supabase, Vercel and GitHub \u2014 has multi-factor authentication enrolled via authenticator app. We recommend enabling MFA on your own ThemisIQ account as well.'],
            ].map(([title, body], i) => (
              <div key={i} style={{ borderBottom: '0.5px solid #e8e7e4', padding: '14px 0' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 400 }}>{body}</div>
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
              { step: '01', title: 'Detect', body: 'Detection is by notification from the providers that run our infrastructure \u2014 Supabase, Vercel, GitHub and Stripe \u2014 and by reports to security@themisiq.co, which is monitored with push notification. Automated alerting on our own systems is not configured.' },
              { step: '02', title: 'Contain', body: 'P1 incidents are contained within 1 hour of detection. Affected systems are isolated immediately.' },
              { step: '03', title: 'Notify', body: 'You are notified within 24 hours of a confirmed data breach affecting your data. Regulatory notifications within 72 hours.' },
              { step: '04', title: 'Review', body: 'Every P1 and P2 incident has a mandatory post-incident review within 14 days. Findings shared with affected customers on request.' },
            ].map(({ step, title, body }) => (
              <div key={step} style={{ background: '#fff', padding: '2rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: 'var(--color-brand)', marginBottom: 8, opacity: 0.6 }}>{step}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 400 }}>{body}</div>
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
              ['Dependency monitoring', 'Third-party dependencies are monitored continuously by GitHub Dependabot, which raises an alert and opens a pull request with the patched version when a known vulnerability is published. The infrastructure beneath the application is operated by Vercel and Supabase, whose certifications cover it.'],
              ['Patching', 'Dependabot opens a pull request for each patched version automatically. Merging is a manual review step gated on the full test suite passing, so a fix reaches production once it has been reviewed and the build is green. A fixed remediation window is not published.'],
              ['Build gate', 'Every deploy runs the full test suite and a strict TypeScript check before the application is built \u2014 a failing test or type error stops the deploy.'],
              ['Secrets management', 'API keys and credentials are held in environment variables and are never committed to source code. GitHub secret scanning is enabled on the repository and covers the full commit history, not only the files currently checked in.'],
            ].map(([title, body], i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '0.5px solid #e8e7e4' }}>
                <span style={{ color: '#0F6E56', flexShrink: 0, fontWeight: 600, marginTop: 1 }}>✓</span>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{title} — </span>
                  <span style={{ fontSize: 13, color: '#555553', fontWeight: 400 }}>{body}</span>
                </div>
              </div>
            ))}
          </div>

          <div>
            <div style={eyebrow}>Report a security issue</div>
            <h2 style={sectionTitle}>Responsible disclosure.</h2>
            <p style={{ fontSize: 14, color: '#555553', lineHeight: 1.75, fontWeight: 400, marginBottom: '1.5rem' }}>
              If you discover a security vulnerability or believe you have seen suspicious activity in your ThemisIQ account, please contact us immediately. We take all security reports seriously and will respond within 24 hours.
            </p>
            {/* A contact panel closing a policy section — the same shape as the three legal
                contact blocks converted in task 26, so it takes the same brand note state. The
                green callout below it is a different register: an assurance kept, not a contact. */}
            <div className="tq-callout tq-callout-note" style={{ '--tq-state': 'var(--color-brand)', '--tq-state-wash': 'color-mix(in srgb, var(--color-brand) 5%, transparent)', marginBottom: '1rem' } as React.CSSProperties}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Security team — ThemisIQ Compliance Inc.</div>
              <div className="tq-callout-text" style={{ marginBottom: 4 }}>Email: <a href="mailto:security@themisiq.co" style={{ color: 'var(--color-brand)' }}>security@themisiq.co</a></div>
              <div className="tq-callout-text" style={{ marginBottom: 4 }}>Response time: 24 hours for all security reports</div>
              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 8, fontStyle: 'italic' }}>We do not pursue legal action against researchers acting in good faith.</div>
            </div>
            <div className="tq-callout tq-callout-note" style={{ '--tq-state': '#1D9E75', '--tq-state-wash': '#E1F5EE' } as React.CSSProperties}>
              <div className="tq-callout-heading">Enterprise security reviews</div>
              <div className="tq-callout-text">If you are conducting security due diligence, send your questionnaire to security@themisiq.co and we will complete it. ThemisIQ does not yet hold a SOC 2 report or an independent penetration test report, so those artefacts are not available; the certification table above gives the current position and target dates.</div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

    </div>
  )
}

const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }
