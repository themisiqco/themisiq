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
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }}>
            Refund <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Policy</span>
          </h1>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
            {['Governed by: Ontario, Canada law', 'hello@themisiq.co'].map(item => (
              <span key={item} style={{ fontSize: 12, color: '#888784' }}>{item}</span>
            ))}
          </div>
          <div style={boxAmber}>
            <div style={boxTitle}>All sales are final once performance begins</div>
            <div style={boxBody}>The Service is sold to businesses as a twelve-month license with immediate access and unlimited report generation. Please read this policy in full before purchasing.</div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '3rem 2.5rem', display: 'grid', gridTemplateColumns: '200px 1fr', gap: '3.5rem', alignItems: 'start' }}>

        {/* TOC */}
        <div style={{ position: 'sticky', top: 80 }}>
          <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12 }}>Contents</div>
          {['All sales are final', 'Why', 'Pre-access goodwill cancellation', 'Genuine service failure', 'Renewal', 'Contact'].map((title, i) => (
            <a key={i} href={`#r${i+1}`} style={{ display: 'block', fontSize: 12, color: '#555553', padding: '5px 0 5px 10px', borderLeft: '2px solid transparent', textDecoration: 'none', marginBottom: 2 }}>{title}</a>
          ))}
        </div>

        {/* CONTENT */}
        <div>

          <Section id="r1" num="Section 1" title="All sales are final">
            <p style={body}>The Service is sold to businesses as a twelve-month license with immediate access and unlimited report generation. Except as described below, fees are non-refundable once performance has begun.</p>
          </Section>

          <Section id="r2" num="Section 2" title="Why">
            <p style={body}>Value is delivered immediately through platform access, data processing, calculations, and downloadable reports. Clear disclosure of the refund policy is provided before purchase.</p>
          </Section>

          <Section id="r3" num="Section 3" title="Pre-access goodwill cancellation">
            <p style={body}>If no user has logged into the platform and no report has been generated, customers may contact ThemisIQ within 14 days of purchase to request cancellation and a refund as a goodwill accommodation.</p>
          </Section>

          <Section id="r4" num="Section 4" title="Genuine service failure">
            <p style={body}>If the Service is never provisioned, is materially defective, or fails to deliver what was purchased, ThemisIQ will remedy the issue or provide an appropriate pro-rata refund. Nothing in this policy affects rights that cannot legally be excluded.</p>
          </Section>

          <Section id="r5" num="Section 5" title="Renewal">
            <p style={body}>Subscriptions do not automatically renew or automatically charge. Customers who wish to continue after the current term expires may do so by placing a new order following the renewal reminder.</p>
          </Section>

          <Section id="r6" num="Section 6" title="Contact">
            <div style={{ background: '#0d0d0d', borderRadius: 10, padding: '1.25rem 1.5rem', margin: '1rem 0' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', fontWeight: 400, color: '#fff', marginBottom: 8 }}>Refund enquiries — ThemisIQ Compliance Inc.</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Email: <a href="mailto:hello@themisiq.co" style={{ color: '#64fe3e' }}>hello@themisiq.co</a></div>
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
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: '1.45rem', fontWeight: 400, color: '#0d0d0d', marginBottom: '0.9rem', lineHeight: 1.2 }}>{title}</h2>
        {children}
      </div>
      <div style={{ height: '0.5px', background: '#e8e7e4', margin: '2rem 0' }} />
    </>
  )
}

const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 5 }
const body: React.CSSProperties = { fontSize: 13.5, color: '#555553', lineHeight: 1.8, fontWeight: 400, marginBottom: '0.9rem' }
const boxAmber: React.CSSProperties = { background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 25%, transparent)', borderLeft: '3px solid var(--color-module-climate)', borderRadius: 8, padding: '13px 15px', margin: '1rem 0' }
const boxTitle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }
const boxBody: React.CSSProperties = { fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 400 }
