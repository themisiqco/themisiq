'use client'
import Nav from '../components/Nav'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />
      <div style={{ background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4', padding: '3.5rem 2.5rem 3rem' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={eyebrow}>ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }}>
            Terms of <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Service</span>
          </h1>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
            {['Effective: May 17, 2026', 'Governed by: Ontario, Canada law', 'legal@themisiq.co'].map(item => (
              <span key={item} style={{ fontSize: 12, color: '#888784' }}>{item}</span>
            ))}
          </div>
          <div style={boxAmber}>
            <div style={boxTitle}>Important — please read Section 7 (Disclaimers)</div>
            <div style={boxBody}>ThemisIQ is a compliance enablement platform. It does not provide legal advice, regulatory assurance, or certified GHG verification. Customers remain responsible for the accuracy of their regulatory filings.</div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 2.5rem', display: 'grid', gridTemplateColumns: '200px 1fr', gap: '3.5rem', alignItems: 'start' }}>

        {/* TOC */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12 }}>Contents</div>
          {['The service', 'Your account', 'Acceptable use', 'Subscription & billing', 'Data & privacy', 'Intellectual property', 'Disclaimers', 'Liability', 'Indemnification', 'Governing law'].map((title, i) => (
            <a key={i} href={`#t${i+1}`} style={{ display: 'block', fontSize: 12, color: '#555553', padding: '5px 0 5px 10px', borderLeft: '2px solid transparent', textDecoration: 'none', marginBottom: 2 }}>{title}</a>
          ))}
        </div>

        {/* CONTENT */}
        <div>

          <Section id="t1" num="Section 1" title="The service">
            <p style={body}>These Terms of Service govern your access to and use of the ThemisIQ platform and related services provided by <strong>ThemisIQ Compliance Inc.</strong>, a company incorporated in Canada ("ThemisIQ", "we", "us", "our").</p>
            <p style={body}>ThemisIQ provides a compliance intelligence and SaaS platform covering GHG emissions management, climate risk disclosure, supply chain sustainability, M&A climate due diligence, AI governance, workforce disclosure, cybersecurity governance, and related advisory services. By accessing or using ThemisIQ, you agree to these terms.</p>
          </Section>

          <Section id="t2" num="Section 2" title="Your account">
            {['You must be 18 years of age or older and authorised to enter into contracts on behalf of your organisation', 'You are responsible for maintaining the confidentiality of your login credentials and all activity under your account', 'You must notify us immediately at security@themisiq.co of any suspected unauthorised access', 'One person per user account — credentials must not be shared between individuals', 'ThemisIQ may suspend or terminate accounts for breach of these terms, fraudulent activity, or non-payment'].map((item, i) => <BulletItem key={i} text={item} />)}
          </Section>

          <Section id="t3" num="Section 3" title="Acceptable use">
            <p style={body}>You may use ThemisIQ only for lawful purposes consistent with its intended use as a compliance management platform. You must not:</p>
            {['Upload or submit data that is knowingly false, misleading, or fabricated', 'Attempt to circumvent, disable, or probe the security controls of the platform', 'Access or attempt to access data belonging to other ThemisIQ customers', 'Use ThemisIQ outputs as the sole basis for regulatory filings without independent professional review', 'Represent ThemisIQ outputs as the opinion of an accredited assurance provider or legal advisor', 'Share platform access credentials with unauthorised third parties', 'Reverse engineer, decompile, or attempt to extract the source code of the ThemisIQ platform', 'Use the platform to store or transmit unlawful, harmful, or offensive content'].map((item, i) => <BulletItem key={i} text={item} />)}
          </Section>

          <Section id="t4" num="Section 4" title="Subscription & billing">
            {[
              ['Plans:', 'Starter ($299/month), Professional ($799/month), Platform (custom). Annual plans are priced at 10 months\' equivalent (2 months free). All prices in USD unless otherwise stated.'],
              ['Free trial:', 'Reports unlocked on paid plan. No credit card required. Automatic cancellation at end of trial period unless you subscribe.'],
              ['Billing:', 'Monthly or annual in advance. Invoices issued via Stripe. Card charges recur automatically on subscription renewal date.'],
              ['Taxes:', 'Prices exclude applicable taxes (GST/HST in Canada, VAT in EU/UK). Tax is added at checkout based on billing address.'],
              ['Refunds:', 'Pro-rata refunds issued for cancellations within 14 days of annual plan purchase. Monthly plans are non-refundable for the current billing period.'],
              ['Suspension:', 'Service may be suspended for non-payment after 7 days\' notice. Data is retained for 90 days after suspension before deletion.'],
            ].map(([label, text], i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', minWidth: 100, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.65 }}>{text}</span>
              </div>
            ))}
          </Section>

          <Section id="t5" num="Section 5" title="Data & privacy">
            {[
              ['Your data:', 'You retain all ownership of the data you upload or generate in ThemisIQ. We do not claim any rights over your compliance data.'],
              ['Our role:', 'ThemisIQ is a data processor for your platform data. You are the data controller. Our Data Processing Agreement (DPA) is available at legal@themisiq.co.'],
              ['Data export:', 'You can export all your data in standard formats (CSV, PDF, XLSX) at any time during your subscription.'],
              ['Data deletion:', 'On cancellation, your platform data is deleted within 90 days.'],
              ['No data resale:', 'We will never sell, rent, or trade your data to third parties.'],
              ['AI data use:', 'We will not use your compliance data to train AI models without your explicit written consent.'],
            ].map(([label, text], i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', minWidth: 110, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.65 }}>{text}</span>
              </div>
            ))}
          </Section>

          <Section id="t6" num="Section 6" title="Intellectual property">
            {[
              ['ThemisIQ IP:', 'The ThemisIQ platform, including its calculation methodologies, framework mappings, regulatory databases, software code, and visual design, is owned by ThemisIQ Compliance Inc. and protected by applicable intellectual property law.'],
              ['Your IP:', 'You own all data, reports, and outputs generated from your data using the ThemisIQ platform. ThemisIQ makes no claim over your compliance reports or disclosures.'],
              ['Feedback:', 'If you provide feedback, suggestions, or feature requests, ThemisIQ may use these to improve the platform without obligation to you.'],
              ['Licence to you:', 'ThemisIQ grants you a non-exclusive, non-transferable, revocable licence to access and use the platform during your subscription term.'],
            ].map(([label, text], i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', minWidth: 130, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.65 }}>{text}</span>
              </div>
            ))}
          </Section>

          <Section id="t7" num="Section 7" title="Disclaimers — please read carefully">
            <div style={boxRed}>
              <div style={boxTitle}>ThemisIQ is a compliance enablement platform — not an assurance provider or legal advisor</div>
              <div style={boxBody}>ThemisIQ platform outputs are for informational and planning purposes only. They do not constitute: legal advice; regulatory assurance; GHG verification opinions; certified compliance determinations; or professional opinions of any kind. ThemisIQ is not an accredited verification or certification body under any GHG Protocol, CARB, ESRS, CDP, or other regulatory framework.</div>
            </div>
            {['Your responsibility: You are responsible for the accuracy of data you submit to ThemisIQ. Regulatory filings made using ThemisIQ outputs remain your legal responsibility.', 'Professional review required: All ThemisIQ-generated disclosures, calculations, and narratives must be reviewed by qualified sustainability professionals before use in regulatory submissions.', 'Third-party assurance: SB 253, ESRS, and CDP assurance requirements must be fulfilled by independently accredited third-party verifiers — not by ThemisIQ.', 'Regulatory changes: ThemisIQ works to keep the platform current, but cannot guarantee that platform content reflects the most recent regulatory changes at all times.', '"As is" service: The platform is provided "as is". We do not warrant that the platform will be error-free, uninterrupted, or meet every specific regulatory requirement in every jurisdiction.'].map((item, i) => <BulletItem key={i} text={item} />)}
          </Section>

          <Section id="t8" num="Section 8" title="Limitation of liability">
            <p style={body}>To the maximum extent permitted by applicable law (including the Ontario Consumer Protection Act 2002 where applicable):</p>
            {['ThemisIQ\'s total liability to you for any claim arising from these Terms or your use of the platform shall not exceed the fees paid by you in the 12 months immediately preceding the claim', 'ThemisIQ shall not be liable for indirect, incidental, special, consequential, or punitive damages, including loss of profit, revenue, data, regulatory penalties, or reputational harm', 'Nothing in these Terms limits ThemisIQ\'s liability for fraud, gross negligence, or death or personal injury caused by ThemisIQ\'s negligence'].map((item, i) => <BulletItem key={i} text={item} />)}
            <p style={body}>ThemisIQ shall not be liable for regulatory penalties, fines, or enforcement actions against you arising from your use of the platform, including where ThemisIQ platform outputs contributed to an inaccurate regulatory filing.</p>
          </Section>

          <Section id="t9" num="Section 9" title="Indemnification">
            <p style={body}>You agree to indemnify, defend, and hold harmless ThemisIQ Compliance Inc. and its officers, directors, employees, and advisors from and against any claims, damages, losses, and expenses (including legal fees) arising from:</p>
            {['Your use of the platform in violation of these Terms', 'Your submission of false, misleading, or inaccurate data to the platform', 'Your regulatory filings made using ThemisIQ outputs without independent professional review', 'Your infringement of any third-party intellectual property, privacy, or other rights'].map((item, i) => <BulletItem key={i} text={item} />)}
          </Section>

          <Section id="t10" num="Section 10" title="Governing law & dispute resolution">
            {['Governing law: These Terms are governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein, without regard to conflict of law principles.', 'Jurisdiction: Any disputes shall be subject to the exclusive jurisdiction of the courts of Ontario, Canada.', 'Disputes: Before commencing formal proceedings, both parties agree to attempt to resolve disputes informally by contacting legal@themisiq.co. ThemisIQ will respond within 30 days.', 'Changes to Terms: We may update these Terms. Material changes will be notified to you by email at least 30 days before taking effect. Continued use of the platform after the effective date constitutes acceptance.'].map((item, i) => <BulletItem key={i} text={item} />)}
            <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '1.25rem 1.5rem', margin: '1rem 0' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', fontWeight: 400, color: '#fff', marginBottom: 8 }}>Legal enquiries — ThemisIQ Compliance Inc.</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Email: <a href="mailto:legal@themisiq.co" style={{ color: '#64fe3e' }}>legal@themisiq.co</a></div>
            </div>
          </Section>

        </div>
      </div>

      {/* FOOTER */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co · Governed by Ontario, Canada law</div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="/privacy" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/security" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Security</a>
          </div>
        </div>
      </footer>

    </div>
  )
}

function Section({ id, num, title, children }: { id: string, num: string, title: string, children: React.ReactNode }) {
  return (
    <>
      <div id={id} style={{ marginBottom: '2.5rem', scrollMarginTop: 80 }}>
        <div style={eyebrow}>{num}</div>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.45rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '0.9rem', lineHeight: 1.2 }}>{title}</h2>
        {children}
      </div>
      <div style={{ height: '0.5px', background: '#e8e7e4', margin: '2rem 0' }} />
    </>
  )
}

function BulletItem({ text }: { text: string }) {
  const parts = text.split(':')
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      <span style={{ color: '#7425e3', flexShrink: 0, marginTop: 2 }}>•</span>
      <span style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.65 }}>
        {parts.length > 1 ? <><strong style={{ color: '#0d0d0d', fontWeight: 500 }}>{parts[0]}:</strong>{parts.slice(1).join(':')}</> : text}
      </span>
    </div>
  )
}

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 5 }
const body: React.CSSProperties = { fontSize: 13.5, color: '#555553', lineHeight: 1.8, fontWeight: 300, marginBottom: '0.9rem' }
const boxRed: React.CSSProperties = { background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderLeft: '3px solid #B91C1C', borderRadius: 8, padding: '13px 15px', margin: '1rem 0' }
const boxAmber: React.CSSProperties = { background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.25)', borderLeft: '3px solid #ba7517', borderRadius: 8, padding: '13px 15px', margin: '1rem 0' }
const boxTitle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }
const boxBody: React.CSSProperties = { fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }
