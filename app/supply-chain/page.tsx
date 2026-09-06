'use client'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '../../lib/pricing'
import { CS3D_APPLIES_FROM, CS3D_EMPLOYEE_THRESHOLD, CS3D_TURNOVER_THRESHOLD } from '../../lib/cs3d'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'

export default function Page() {
  // Price from the single source of truth, formatted as app/cbam/page.tsx does.
  const supplyPrice = FLAT_MODULE_PRICES['supply-chain'].toLocaleString('en-US')
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>Supply Chain & Sustainable Procurement</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
             Supply Chain & <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Sustainable Procurement</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 400, marginBottom: '2rem', maxWidth: 480 }}>
             Know your supply chain risks. Collect sustainability data from suppliers. Meet CS3D, EcoVadis, Modern Slavery and ESRS S2 obligations — without spreadsheets or consultants.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/dashboard/supply-chain" style={{ ...btnPrimary, textDecoration: 'none' }}>Map your supply chain →</a>
              <a href="/dashboard/supply-chain" style={{ ...btnSecondary, textDecoration: 'none' }}>See how supplier data reaches Scope 3 →</a>
              <a href="/order?modules=supply" style={{ ...btnSecondary, textDecoration: 'none' }}>${supplyPrice}/yr</a>
              <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 4px', color: '#555553', textDecoration: 'underline', display: 'inline-block' }}>Talk to a specialist</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['Scope 3 Cat.1', 'ESRS S2', 'CS3D', 'EcoVadis', 'CDP supplier engagement', 'Modern Slavery', 'UNGP', 'GRI 414'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '70%', unit: 'of emissions', label: 'typically in Scope 3 Cat.1 for manufacturers', color: '#7425e3', bg: '#EDE9FE' },
              { val: 'CS3D', unit: CS3D_APPLIES_FROM, label: 'EU supply chain due diligence — civil liability for failures', color: '#B91C1C', bg: '#FCEBEB' },
              { val: '5+', unit: 'frameworks', label: 'CS3D · EcoVadis · Modern Slavery · CDP supplier engagement · ESRS S2 — one platform', color: '#0F6E56', bg: '#E1F5EE' },
              { val: '$2,900', unit: 'portal/yr', label: 'vs $15,000–$50,000 for EcoVadis supplier outreach — same outcome', color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid color-mix(in srgb, ${color} 13%, transparent)` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CS3D CALLOUT */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>EU CS3D — Corporate Sustainability Due Diligence</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              Civil liability for supply chain failures.<br />Start preparing now.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 400, marginBottom: '1.5rem' }}>
              {/* "Large companies" scoped nothing a reader could check, and (EU) 2026/470 raised the
                  limbs fivefold on headcount — so the word now means something far narrower than when
                  this copy was written. Both limbs, and the AND, stated so a non-lawyer can self-assess. */}
              CS3D introduces civil liability for harm caused by inadequate human rights and environmental due diligence across your value chain — not just tier 1. If your company has {CS3D_EMPLOYEE_THRESHOLD} and {CS3D_TURNOVER_THRESHOLD}, you must comply from {CS3D_APPLIES_FROM}. Preparation starts now.
            </p>
            {['Human rights due diligence (HRDD) across full value chain', 'Accessible grievance mechanisms for value chain workers', 'Risk-based supplier prioritisation and monitoring', 'Civil liability for failures — not just regulatory fines', 'ESRS G1 and S2 disclosure integration'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 400, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Key supply chain frameworks</div>
            {[
              { fw: 'EU CS3D', scope: 'Human rights + environmental HRDD', deadline: `${CS3D_APPLIES_FROM} (large companies)`, urgency: 'critical' },
              { fw: 'ESRS S2', scope: 'Value chain workers', deadline: 'FY2024 (large EU)', urgency: 'critical' },
              { fw: 'SB 253 Scope 3', scope: 'Category 1 purchased goods', deadline: '2027 (California)', urgency: 'high' },
              { fw: 'CDP supplier engagement', scope: 'Supplier engagement programme', deadline: 'Annual · July', urgency: 'medium' },
              { fw: 'Modern Slavery Act', scope: 'UK + Australia transparency statement', deadline: 'Annual', urgency: 'medium' },
              { fw: 'EcoVadis', scope: 'Supplier sustainability ratings', deadline: 'Customer-requested', urgency: 'medium' },
            ].map(({ fw, scope, deadline, urgency }) => {
              const color = urgency === 'critical' ? '#B91C1C' : urgency === 'high' ? '#ba7517' : '#888784'
              return (
                <div key={fw} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>{fw}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{scope}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0, textAlign: 'right' as const }}>{deadline}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Platform capabilities</div>
          <h2 style={sectionTitle}>Everything your supply chain programme needs.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { title: 'Supplier portal', desc: 'Branded supplier sustainability data collection portal. Suppliers complete structured questionnaires on emissions, labour practices, and environmental performance — no spreadsheets.' },
            { title: 'Scope 3 Cat.1 primary data', desc: 'Collect spend data, activity data, and supplier-specific emission factors directly from your supply base — the primary supplier data that feeds your Scope 3 Category 1 calculation in the GHG module, across all GHG Protocol methods.' },
            { title: 'Human rights risk mapping', desc: 'Risk-based HRDD across your value chain. Country and sector risk scoring. Supplier prioritisation for deeper assessment. Questionnaires cover grievance mechanisms and remediation.' },
            { title: 'EcoVadis-themed questionnaires', desc: 'Supplier questionnaires structured to the four EcoVadis themes — Environment, Labour & Human Rights, Ethics, and Sustainable Procurement — so the evidence you collect maps to the scorecard you\'re rated against.' },
            { title: 'Modern Slavery Act', desc: 'UK and Australia Modern Slavery Act. Structured supplier questionnaires across forced and compulsory labour, child labour, and due diligence and remediation — with supply chain mapping and risk identification.' },
            { title: 'ESRS S2 supplier data', desc: 'Supplier questionnaires aligned to ESRS S2 (value chain workers) — the value chain worker data your disclosure needs, collected and evidenced.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 400 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={eyebrow}>How it works</div>
            <h2 style={sectionTitle}>From supplier list to Scope 3 data.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
            {[
              ['01', 'Map your supply base', 'Upload your supplier list. ThemisIQ risk-scores each supplier by country, sector, and spend — prioritising who needs deep assessment first.'],
              ['02', 'Collect supplier data', 'Send branded data collection requests via the ThemisIQ supplier portal. Track completion status and send reminders to non-responders.'],
              ['03', 'Collect Category 1 data', 'Suppliers report their Category 1 emissions through the portal. Where a supplier hasn\'t responded, spend-based estimates fill the gap.'],
              ['04', 'Feed your Scope 3', 'Pull supplier-reported Category 1 emissions into your GHG inventory, with spend-based gap-fill for non-responders. You review the full breakdown before it\'s applied.'],
            ].map(([num, title, desc]) => (
              <div key={num}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', fontWeight: 400, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', opacity: 0.5, marginBottom: '0.75rem' }}>{num}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 400 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          CS3D applies from {CS3D_APPLIES_FROM}.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Start building now.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 400, lineHeight: 1.7 }}>
          Supply chain due diligence programmes take 12–18 months to establish properly. The companies starting now will be ready. The ones starting in 2026 won't be.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/supply-chain" style={{ ...btnPrimary, textDecoration: 'none' }}>Map your supply chain →</a>
          <a href="/order?modules=supply" style={{ ...btnSecondary, textDecoration: 'none' }}>${supplyPrice}/yr</a>
          <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 4px', color: '#555553', textDecoration: 'underline', display: 'inline-block' }}>Talk to a specialist</a>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'var(--color-brand)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const btnOutline: React.CSSProperties = { fontSize: 13, fontWeight: 400, padding: '8px 18px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', textDecoration: 'none', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 400 }
