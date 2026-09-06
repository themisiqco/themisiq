// app/components/Footer.tsx
// Shared site footer for ThemisIQ.
// Self-contained: import and drop in as <Footer /> on any page.

function Logo({ size = 130 }: { size?: number }) {
  const height = Math.round(size * 0.29)
  return (
    <img
      src="/logo.png"
      alt="ThemisIQ"
      width={size}
      height={height}
      style={{ display: 'block' }}
    />
  )
}

export default function Footer() {
  return (
    <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '3.5rem 2.5rem 2rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '2.2fr 1fr 1fr 1fr', gap: '3rem' }}>
        <div>
          <Logo size={130} />
          <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', lineHeight: 1.65, fontWeight: 400, marginTop: '1rem', maxWidth: 270 }}>
            Compliance Intelligence for Sustainable Business. GHG emissions, climate risk, supply chain, M&A diligence, AI governance, people & workforce, and cybersecurity — one platform.
          </p>
        </div>
        {[
          { heading: 'Products', links: [
            { label: 'Climate · GHG', href: '/climate-ghg' },
            { label: 'Climate · Risk', href: '/climate-risk' },
            { label: 'Supply Chain', href: '/supply-chain' },
            { label: 'Deals & Investment', href: '/deals' },
            { label: 'AI Governance', href: '/ai-governance' },
            { label: 'People & Workforce', href: '/people' },
            { label: 'Cyber Governance', href: '/cyber' },
            { label: 'Advisory', href: '/advisory' },
          ] },
          { heading: 'Frameworks', links: [
            { label: 'Frameworks we support', href: '/frameworks' },
          ] },
          { heading: 'Company', links: [
            { label: 'Pricing', href: '/pricing' },
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Security', href: '/security' },
            { label: 'Contact', href: 'mailto:hello@themisiq.co' },
          ] },
        ].map(col => (
          <div key={col.heading}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>{col.heading}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {col.links.map(l => <a key={l.label} href={l.href} style={{ fontSize: 13, color: '#555553', textDecoration: 'none' }}>{l.label}</a>)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 1100, margin: '2.5rem auto 0', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co · All rights reserved</div>
        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Compliance Intelligence for Sustainable Business</div>
      </div>
    </footer>
  )
}