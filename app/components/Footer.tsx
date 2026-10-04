
import ThemisIQLogo from './ThemisIQLogo'
import { FREE_CALC_HREF, FREE_CALC_SHORT_LABEL } from '../../lib/pricingCopy'
// app/components/Footer.tsx
// Shared site footer for ThemisIQ.
// Self-contained: import and drop in as <Footer /> on any page.

export default function Footer() {
  return (
    <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '3.5rem 2.5rem 2rem' }}>
      <div className="tq-footer-grid" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div>
          <ThemisIQLogo size={30} />
          <p style={{ fontSize: 13, color: 'var(--color-ink-muted)', lineHeight: 1.65, fontWeight: 400, marginTop: '1rem', maxWidth: 270 }}>
            Compliance Intelligence for Sustainable Business. GHG emissions, climate risk, materiality, supply chain, CBAM, M&A diligence, AI governance, people & workforce, cybersecurity and forced labour reporting, in one platform.
          </p>
        </div>
        {[
          // ⚠️ THE ORDER IS THE HOMEPAGE MODULE GRID'S ORDER (MODULES_HOME in app/page.tsx), and CBAM
          // was missing from this list entirely while having a card there. Materiality follows the grid's
          // modules because it has no grid card of its own, and Advisory stays last because it is not a module.
          { heading: 'Products', links: [
            { label: 'Climate · GHG', href: '/climate-ghg' },
            // Under its module, as the free part of it (free-calc-cta, Oct 2026).
            { label: FREE_CALC_SHORT_LABEL, href: FREE_CALC_HREF },
            { label: 'Climate · Risk', href: '/climate-risk' },
            { label: 'Supply Chain', href: '/supply-chain' },
            { label: 'CBAM', href: '/cbam' },
            { label: 'Deals & Investment', href: '/deals' },
            { label: 'AI Governance', href: '/ai-governance' },
            { label: 'Cyber Governance', href: '/cyber' },
            { label: 'People & Workforce', href: '/people' },
            { label: 'Forced Labour Reporting', href: '/forced-labour' },
            { label: 'Materiality Assessment', href: '/materiality' },
            { label: 'Advisory', href: '/advisory' },
          ] },
          { heading: 'Frameworks', links: [
            { label: 'Frameworks we support', href: '/frameworks' },
          ] },
          { heading: 'Company', links: [
            { label: 'About Us', href: '/about' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Refund Policy', href: '/refund-policy' },
            { label: 'Privacy Policy', href: '/privacy' },
            { label: 'Terms of Service', href: '/terms' },
            { label: 'Security', href: '/security' },
            { label: 'Trust & Data', href: '/trust' },
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
      <div className="tq-footer-legal" style={{ maxWidth: 1100, margin: '2.5rem auto 0', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co · All rights reserved</div>
        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Compliance Intelligence for Sustainable Business</div>
      </div>
    </footer>
  )
}