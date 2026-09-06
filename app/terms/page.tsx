'use client'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />
      <div style={{ background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4', padding: '3.5rem 2.5rem 3rem' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}>
          <div style={eyebrow}>ThemisIQ Compliance Inc.</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 4vw, 3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }}>
            Terms of <span style={{ fontStyle: 'italic', color: 'var(--color-brand)' }}>Service</span>
          </h1>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
            {['Effective: June 22, 2026', 'Governed by: Ontario, Canada law', 'legal@themisiq.co'].map(item => (
              <span key={item} style={{ fontSize: 12, color: '#888784' }}>{item}</span>
            ))}
          </div>
          <div className="tq-callout tq-callout-note" style={{ '--tq-state': 'var(--color-module-climate)', '--tq-state-wash': '#FEF3E2' } as React.CSSProperties}>
            <div className="tq-callout-heading">Master Subscription Agreement</div>
            <div className="tq-callout-text">{`These Terms of Service (the "Agreement") govern access to and use of the ThemisIQ platform and related services provided by ThemisIQ Compliance Inc. ("ThemisIQ", "we", "us", or "our"). By purchasing or using the Service, you agree to be bound by this Agreement.`}</div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 2.5rem', display: 'grid', gridTemplateColumns: '200px 1fr', gap: '3.5rem', alignItems: 'start' }}>

        {/* TOC */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12 }}>Contents</div>
          {[
            'Business-only eligibility',
            "What you're buying",
            'Fees and payment',
            'Term, renewal and cancellation',
            'Immediate access and commencement of performance',
            'Acceptable use',
            'Customer data, privacy and security',
            'Confidentiality',
            'Intellectual property',
            'Accuracy, methodology and AI-assisted outputs',
            'Suspension and termination',
            'Service failure',
            'Warranties and limitation of liability',
            'Force majeure',
            'Export controls and prohibited use',
            'Survival',
            'Governing law',
          ].map((title, i) => (
            <a key={i} href={`#t${i+1}`} style={{ display: 'block', fontSize: 12, color: '#555553', padding: '5px 0 5px 10px', borderLeft: '2px solid transparent', textDecoration: 'none', marginBottom: 2 }}>{title}</a>
          ))}
        </div>

        {/* CONTENT */}
        <div>

          <Section id="t1" num="Section 1" title="Business-only eligibility">
            <p style={body}>{`ThemisIQ is offered solely to businesses and organizations acting in a commercial or professional capacity. By purchasing, you represent and warrant that you are entering into this agreement for purposes related to your trade, business, or profession, and not as a consumer. Consumer rights applicable to consumer transactions may not apply to purchases made for business purposes. You further represent that you have authority to enter into this Agreement on behalf of the organization you represent.`}</p>
          </Section>

          <Section id="t2" num="Section 2" title="What you're buying">
            <p style={body}>{`Each module purchase grants a non-exclusive, non-transferable 12-month license to access the applicable module and generate unlimited reports during the subscription term. Access is enabled only after payment has been received in full. Bundles grant the same rights for all included modules.`}</p>
          </Section>

          <Section id="t3" num="Section 3" title="Fees and payment">
            <p style={body}>{`Fees are the annual list prices in effect at the time of purchase. Payment is due in advance and access begins once payment has been successfully processed. Orders up to US$10,000 may be paid by card. Orders above US$10,000 are invoiced and payable by card or wire transfer. Fees exclude applicable taxes, duties, VAT, GST, HST, or similar charges, which remain the responsibility of the customer.`}</p>
          </Section>

          <Section id="t4" num="Section 4" title="Term, renewal and cancellation">
            <p style={body}>{`The license term begins when access is first provisioned and continues for twelve (12) months. Subscriptions do not renew automatically and no recurring charges are made. ThemisIQ will send a renewal reminder 30 days before expiry. Customers may renew by placing a new order. If the subscription is not renewed, access ends upon expiration of the current term. Non-renewal does not entitle the customer to a refund of fees already paid. Future auto-renewing subscriptions may be introduced. Any such subscriptions will be implemented only in accordance with applicable law and with appropriate advance notice and cancellation mechanisms.`}</p>
          </Section>

          <Section id="t5" num="Section 5" title="Immediate access and commencement of performance">
            <p style={body}>{`Customers request that access to the Service begin immediately following payment. For purposes of this Agreement, performance is deemed to begin upon first login to the platform or the generation of any report. To the extent permitted by applicable law, any statutory cancellation or withdrawal rights that may otherwise apply may cease once performance begins. See Part C (Checkout Consent).`}</p>
          </Section>

          <Section id="t6" num="Section 6" title="Acceptable use">
            <p style={body}>{`Customers may use the Service solely for their internal business purposes. Customers may not:`}</p>
            {[
              'resell, sublicense, lease, or distribute the Service to third parties;',
              'reverse engineer, decompile, or attempt to derive source code;',
              'interfere with platform security or operations;',
              'use the Service unlawfully;',
              'circumvent technical limitations or access controls; or',
              'permit unauthorized users to access the Service.',
            ].map((item, i) => <BulletItem key={i} text={item} />)}
            <p style={body}>{`Unless otherwise agreed, each license is limited to a single organization.`}</p>
          </Section>

          <Section id="t7" num="Section 7" title="Customer data, privacy and security">
            <p style={body}>{`Customers retain ownership of all information and data they submit to the Service. ThemisIQ processes customer data in accordance with its Privacy Policy and applicable privacy laws. Customers are responsible for ensuring they have appropriate authority to provide any information uploaded to the Service.`}</p>
          </Section>

          <Section id="t8" num="Section 8" title="Confidentiality">
            <p style={body}>{`Each party agrees to maintain the confidentiality of non-public information received from the other party and to use such information solely for purposes related to the Service. Confidential information does not include information that:`}</p>
            {[
              'is publicly available;',
              'was independently developed;',
              'was lawfully obtained from a third party; or',
              'is required to be disclosed by law.',
            ].map((item, i) => <BulletItem key={i} text={item} />)}
          </Section>

          <Section id="t9" num="Section 9" title="Intellectual property">
            <p style={body}>{`The Service, including software, methodologies, algorithms, frameworks, taxonomies, prompts, templates, workflows, documentation, trademarks, and all associated intellectual property rights, remain the exclusive property of ThemisIQ. Customers retain ownership of their underlying data and reports generated using their own information. Nothing in this Agreement transfers ownership of ThemisIQ intellectual property to the customer.`}</p>
          </Section>

          <Section id="t10" num="Section 10" title="Accuracy, methodology and AI-assisted outputs">
            <p style={body}>{`Outputs provided through the Service are intended as decision-support tools only. Reports may incorporate automated methodologies, calculations, rules-based processing, and artificial intelligence technologies. Customers remain solely responsible for reviewing, validating, approving, and determining the suitability of all outputs before using them in regulatory filings, disclosures, certifications, or business decisions.`}</p>
            {/* TODO: insert six-paragraph methodology disclaimer */}
          </Section>

          <Section id="t11" num="Section 11" title="Suspension and termination">
            <p style={body}>{`ThemisIQ may suspend or terminate access immediately where:`}</p>
            {[
              'fees remain unpaid;',
              'customers materially breach this Agreement;',
              'unlawful activity is suspected;',
              'platform security is threatened;',
              'misuse or attempted reverse engineering occurs; or',
              'continued access could expose ThemisIQ or other users to risk.',
            ].map((item, i) => <BulletItem key={i} text={item} />)}
            <p style={body}>{`Termination does not relieve customers of obligations accrued before termination.`}</p>
          </Section>

          <Section id="t12" num="Section 12" title="Service failure">
            <p style={body}>{`If ThemisIQ fails to provide material access to the Service purchased by the customer, ThemisIQ's sole obligation will be to restore service or provide a pro-rata refund for the portion of the subscription that could not reasonably be delivered. Nothing in this Agreement limits any rights that cannot legally be excluded.`}</p>
          </Section>

          <Section id="t13" num="Section 13" title="Warranties and limitation of liability">
            <p style={body}>{`Except as expressly stated, the Service is provided "as is" and "as available." To the maximum extent permitted by law, ThemisIQ disclaims all implied warranties. In no event shall ThemisIQ be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages. The aggregate liability of ThemisIQ shall not exceed the greater of:`}</p>
            {[
              'fees paid by the customer during the preceding twelve months; or',
              'US$10,000.',
            ].map((item, i) => <BulletItem key={i} text={item} />)}
          </Section>

          <Section id="t14" num="Section 14" title="Force majeure">
            <p style={body}>{`Neither party shall be liable for delays or failures caused by events beyond its reasonable control, including natural disasters, internet outages, cyberattacks, cloud provider failures, labor disruptions, governmental actions, or other force majeure events.`}</p>
          </Section>

          <Section id="t15" num="Section 15" title="Export controls and prohibited use">
            <p style={body}>{`Customers represent that they are not subject to sanctions or trade restrictions and will not use the Service in violation of applicable export control laws or for unlawful purposes.`}</p>
          </Section>

          <Section id="t16" num="Section 16" title="Survival">
            <p style={body}>{`The following provisions survive termination or expiration:`}</p>
            {[
              'payment obligations;',
              'confidentiality;',
              'intellectual property rights;',
              'disclaimers;',
              'limitations of liability; and',
              'dispute resolution provisions.',
            ].map((item, i) => <BulletItem key={i} text={item} />)}
          </Section>

          <Section id="t17" num="Section 17" title="Governing law">
            <p style={body}>{`This Agreement is governed by the laws of the Province of Ontario and the laws of Canada applicable therein, without regard to conflict-of-law principles.`}</p>
            <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '1.25rem 1.5rem', margin: '1rem 0' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 400, color: '#fff', marginBottom: 8 }}>Legal enquiries — ThemisIQ Compliance Inc.</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Email: <a href="mailto:legal@themisiq.co" style={{ color: '#64fe3e' }}>legal@themisiq.co</a></div>
            </div>
          </Section>

        </div>
      </div>

      {/* FOOTER */}
      <Footer />

    </div>
  )
}

function Section({ id, num, title, children }: { id: string, num: string, title: string, children: React.ReactNode }) {
  return (
    <>
      <div id={id} style={{ marginBottom: '2.5rem', scrollMarginTop: 80 }}>
        <div style={eyebrow}>{num}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '0.9rem', lineHeight: 1.2 }}>{title}</h2>
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
      <span style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.65 }}>
        {parts.length > 1 ? <><strong style={{ color: '#0d0d0d', fontWeight: 500 }}>{parts[0]}:</strong>{parts.slice(1).join(':')}</> : text}
      </span>
    </div>
  )
}

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 5 }
const body: React.CSSProperties = { fontSize: 13.5, color: '#555553', lineHeight: 1.8, fontWeight: 400, marginBottom: '0.9rem' }
