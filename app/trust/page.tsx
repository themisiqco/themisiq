'use client'

import Nav from '../components/Nav'

const GRAD = 'var(--color-brand)'

const PRINCIPLES = [
  {
    title: 'Your data belongs to you',
    color: '#0F6E56',
    bg: '#E1F5EE',
    content: 'Everything you enter into ThemisIQ — your emissions data, workforce figures, supplier information, AI systems, financial data — belongs to you. We are custodians of your data, not owners. You can export it, delete it, or correct it at any time.',
  },
  {
    title: 'We never sell or share your data',
    color: '#0C447C',
    bg: '#E6F1FB',
    content: 'ThemisIQ does not sell, rent, share, or license your data to any third party — ever. Your compliance data is not used for benchmarking products sold to others, not shared with industry bodies, and not disclosed to regulators on your behalf without your explicit instruction.',
  },
  {
    title: 'Your data is never used to train AI models',
    color: '#7425e3',
    bg: '#EDE9FE',
    content: 'ThemisIQ uses AI to power certain features (framework classification, risk scoring, guidance). Your data is never used to train, fine-tune, or improve any AI model — including the models that power ThemisIQ features. Each session is processed in isolation.',
  },
  {
    title: 'Encrypted in transit and at rest',
    color: 'var(--color-module-climate)',
    bg: '#FEF3E2',
    content: 'All data transmitted to and from ThemisIQ is encrypted using TLS 1.2+. All data stored in ThemisIQ is encrypted at rest using AES-256. Our infrastructure runs on Supabase (hosted on AWS) with SOC 2 Type II certified data centres.',
  },
  {
    title: 'Access controls — only you can see your data',
    color: '#B91C1C',
    bg: '#FCEBEB',
    content: 'ThemisIQ enforces row-level security — your data is technically isolated from other customers at the database level, not just by application logic. ThemisIQ staff cannot access your inventory data without your explicit request for support purposes.',
  },
]

const DATA_SECTIONS = [
  {
    title: 'What we collect',
    items: [
      { label: 'Account data', detail: 'Name, email address, company name, role — used to create and manage your account.' },
      { label: 'Compliance data', detail: 'GHG emissions figures, workforce data, supplier information, AI system descriptions, and other data you enter into ThemisIQ wizards — used solely to generate your compliance outputs.' },
      { label: 'Usage data', detail: 'Which features you use, when you log in, which modules you access — used to improve the platform and provide support.' },
      { label: 'Payment data', detail: 'Payment is processed by Stripe. ThemisIQ does not store credit card numbers or bank account details.' },
    ],
  },
  {
    title: 'What we never collect',
    items: [
      { label: 'Sensitive personal data', detail: 'ThemisIQ does not collect personal data about your employees beyond aggregate workforce metrics (headcount, pay bands). Individual employee data is never stored.' },
      { label: 'Third-party tracking', detail: 'ThemisIQ does not use advertising trackers, third-party analytics pixels, or behavioural profiling tools.' },
      { label: 'Biometric or health data', detail: 'ThemisIQ does not collect any biometric, health, or special category personal data.' },
    ],
  },
  {
    title: 'How long we keep your data',
    items: [
      { label: 'Active account data', detail: 'Kept for the duration of your subscription plus 12 months, to allow for year-on-year comparison reporting.' },
      { label: 'Deleted account data', detail: 'When you delete your account, all compliance data is permanently deleted within 30 days. Account records are retained for 7 years for legal and tax purposes.' },
      { label: 'Support conversations', detail: 'Support emails and chat logs are retained for 2 years.' },
    ],
  },
  {
    title: 'Your rights',
    items: [
      { label: 'Access', detail: 'You can request a full export of all data ThemisIQ holds about you at any time.' },
      { label: 'Correction', detail: 'You can correct any inaccurate data directly in the platform or by contacting us.' },
      { label: 'Deletion', detail: 'You can delete your account and all associated compliance data at any time from your account settings.' },
      { label: 'Portability', detail: 'All compliance outputs are available as CSV exports — your data is never locked in a proprietary format.' },
      { label: 'Objection', detail: 'You can object to any processing of your data that is not strictly necessary to provide the service.' },
    ],
  },
]

const COMPLIANCE = [
  { law: 'PIPEDA', jurisdiction: 'Canada (federal)', note: 'ThemisIQ Compliance Inc. is a Canadian corporation. PIPEDA is our primary privacy law.' },
  { law: 'Quebec Law 25 (Bill 64)', jurisdiction: 'Quebec, Canada', note: 'ThemisIQ complies with Quebec\'s enhanced privacy requirements including privacy impact assessments and breach notification.' },
  { law: 'GDPR / UK GDPR', jurisdiction: 'European Union · United Kingdom', note: 'For customers in the EU and UK, ThemisIQ acts as a data processor. A Data Processing Agreement (DPA) is available on request.' },
  { law: 'CCPA / CPRA', jurisdiction: 'California, USA', note: 'ThemisIQ does not sell personal information. California residents have the right to know, delete, and opt out of sale (not applicable as we do not sell data).' },
  { law: 'CASL', jurisdiction: 'Canada', note: 'ThemisIQ complies with Canada\'s Anti-Spam Legislation for all commercial electronic messages.' },
]

export default function TrustPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      {/* Hero */}
      <section style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '4rem 2.5rem 3rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12 }}>ThemisIQ · Trust & Data</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1.25rem', color: '#0d0d0d' }}>
            We know trust is everything.<br />
            <em style={{ background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Here is exactly how we earn it.</em>
          </h1>
          <p style={{ fontSize: 16, color: '#555553', maxWidth: 620, lineHeight: 1.75, fontWeight: 400, marginBottom: '1.5rem' }}>
            You are entering sensitive compliance data into ThemisIQ — emissions figures, workforce data, supplier relationships, AI systems. We take that responsibility seriously. This page explains exactly what we do with your data, what we never do, and what rights you have.
          </p>
          <p style={{ fontSize: 13, color: '#888784', fontWeight: 400 }}>
            Questions? Contact us at <a href="mailto:privacy@themisiq.co" style={{ color: '#7425e3', textDecoration: 'none' }}>privacy@themisiq.co</a>
          </p>
        </div>
      </section>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2.5rem' }}>

        {/* Core principles */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: '1.5rem' }}>Our core data principles</div>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {PRINCIPLES.map((p, i) => (
              <div key={p.title} style={{ background: '#fff', border: '1px solid var(--color-line)', borderRadius: 12, padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 16, alignItems: 'flex-start' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', fontWeight: 400, color: p.color, marginTop: 2 }}>{i + 1}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>{p.title}</div>
                  <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 400 }}>{p.content}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Data sections */}
        <div style={{ marginBottom: '3rem' }}>
          {DATA_SECTIONS.map(section => (
            <div key={section.title} style={{ marginBottom: '2rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: '1rem' }}>{section.title}</div>
              <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
                {section.items.map((item, i) => (
                  <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, padding: '1rem 1.5rem', borderBottom: i < section.items.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'flex-start' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{item.label}</div>
                    <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 400 }}>{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Regulatory compliance */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: '1rem' }}>Regulatory compliance</div>
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
            {COMPLIANCE.map((c, i) => (
              <div key={c.law} style={{ display: 'grid', gridTemplateColumns: '120px 180px 1fr', gap: 24, padding: '1rem 1.5rem', borderBottom: i < COMPLIANCE.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'flex-start' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d' }}>{c.law}</div>
                <div style={{ fontSize: 12, color: '#888784' }}>{c.jurisdiction}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 400 }}>{c.note}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Infrastructure */}
        <div style={{ marginBottom: '3rem', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: '1rem' }}>Infrastructure & security</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { label: 'Hosting', val: 'Supabase on AWS (us-east-1) · SOC 2 Type II certified' },
              { label: 'Encryption in transit', val: 'TLS 1.2+ on all connections' },
              { label: 'Encryption at rest', val: 'AES-256 on all stored data' },
              { label: 'Authentication', val: 'Supabase Auth with email verification · MFA available' },
              { label: 'Access control', val: 'Row-level security — data isolated at database level' },
              { label: 'Payment processing', val: 'Stripe · PCI DSS Level 1 certified' },
              { label: 'Email', val: 'Resend · SOC 2 Type II certified' },
              { label: 'Frontend', val: 'Vercel · SOC 2 Type II certified' },
            ].map(({ label, val }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{label}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.5 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="tq-band" style={{ borderRadius: 14, padding: '2rem', textAlign: 'center' as const }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, marginBottom: 8 }}>Questions about your data?</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: 20, lineHeight: 1.6 }}>
            Contact our privacy team at <a href="mailto:privacy@themisiq.co" style={{ color: 'var(--color-brand)', textDecoration: 'none' }}>privacy@themisiq.co</a>. We respond within 2 business days. For data deletion requests, we act within 30 days.
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
            <a href="/methodology" style={{ fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none' }}>Our methodologies →</a>
            <a href="/privacy" style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)', textDecoration: 'none' }}>Full privacy policy →</a>
          </div>
        </div>
      </div>
    </div>
  )
}
