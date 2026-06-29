'use client'

import Nav from '../../components/Nav'
import { useEntitlement } from '../../../lib/useEntitlement'
import PaywallCard from '../../components/PaywallCard'

// ─── Design tokens (mirroring the climate-risk dashboard) ─────────────────────
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }

export default function SbtiDashboard() {
  // Gated on the GHG entitlement — SBTi is part of the GHG module (same precedent
  // as the Scope 3 Calculator, which is also unlocked by 'ghg').
  const isPaid = useEntitlement('ghg')
  if (!isPaid) {
    return (
      <PaywallCard
        title="Unlock SBTi target-setting"
        body="SBTi target-setting and monitoring is part of the GHG module. Unlock GHG to set science-based targets under the Corporate Net-Zero Standard V2.0, track your trajectory, and monitor progress."
      />
    )
  }

  // Placeholder shell only — no wizard logic, no engine imports, no sbti_* reads yet.
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', minHeight: '100vh', color: '#0d0d0d' }}>
      <Nav />
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '2.5rem 2rem 6rem' }}>
        <div style={{ width: 40, height: 3, background: GRAD, borderRadius: 2, marginBottom: 18 }} />
        <h1 style={sectionHead}>SBTi Targets</h1>
        <p style={sectionSub}>Set and monitor your science-based targets under the Corporate Net-Zero Standard V2.0.</p>

        <div style={{ background: '#f8f7f5', border: '1px solid #e8e7e4', borderRadius: 14, padding: '2.5rem 2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 10 }}>Coming soon</div>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>The target-setting wizard is on its way</div>
          <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, maxWidth: 460, margin: '0 auto' }}>
            You&rsquo;ll categorise your company, set near-term Scope&nbsp;1 / 2 / 3 targets, and track progress against your trajectory — built on the data already in your GHG inventory.
          </p>
        </div>
      </div>
    </div>
  )
}
