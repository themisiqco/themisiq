'use client'
import Nav from '../components/Nav'

export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>Supply Chain & Sustainable Procurement</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              Supply Chain &
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Scope 3</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              Scope 3 Category 1 primary data collection. Supplier sustainability portal. Human rights due diligence. CS3D value chain mapping. EcoVadis programme management. One platform.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/dashboard/supply-chain" style={{ ...btnPrimary, textDecoration: 'none' }}>Map your supply chain →</a>
              <a href="/dashboard/scope3" style={{ ...btnSecondary, textDecoration: 'none' }}>Calculate Scope 3 →</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['Scope 3 Cat.1', 'ESRS S2', 'CS3D', 'EcoVadis', 'CDP C12', 'Modern Slavery', 'UNGP', 'GRI 414'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '70%', unit: 'of emissions', label: 'typically in Scope 3 Cat.1 for manufacturers', color: '#7425e3', bg: '#EDE9FE' },
              { val: 'CS3D', unit: '2027', label: 'EU supply chain due diligence — civil liability for failures', color: '#B91C1C', bg: '#FCEBEB' },
              { val: 'Tier 1+', unit: 'visibility', label: 'primary data collection beyond tier 1 suppliers', color: '#0F6E56', bg: '#E1F5EE' },
              { val: '1', unit: 'portal', label: 'supplier sustainability data collection — no spreadsheets', color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${color}22` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{label}</div>
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
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              CS3D introduces civil liability for harm caused by inadequate human rights and environmental due diligence across your value chain — not just tier 1. Large companies must comply from 2027. Preparation starts now.
            </p>
            {['Human rights due diligence (HRDD) across full value chain', 'Accessible grievance mechanisms for value chain workers', 'Risk-based supplier prioritisation and monitoring', 'Civil liability for failures — not just regulatory fines', 'ESRS G1 and S2 disclosure integration'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Key supply chain frameworks</div>
            {[
              { fw: 'EU CS3D', scope: 'Human rights + environmental HRDD', deadline: '2027 (large companies)', urgency: 'critical' },
              { fw: 'ESRS S2 + G1', scope: 'Value chain workers + business conduct', deadline: 'FY2024 (large EU)', urgency: 'critical' },
              { fw: 'SB 253 Scope 3', scope: 'Category 1 purchased goods', deadline: '2027 (California)', urgency: 'high' },
              { fw: 'CDP C12', scope: 'Supplier engagement programme', deadline: 'Annual · July', urgency: 'medium' },
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
            { icon: '', title: 'Supplier portal', desc: 'Branded supplier sustainability data collection portal. Suppliers complete structured questionnaires on emissions, labour practices, and environmental performance — no spreadsheets.' },
            { icon: '', title: 'Scope 3 Cat.1 primary data', desc: 'Collect spend data, activity data, and supplier-specific emission factors directly from your supply base. Supports all GHG Protocol Scope 3 Category 1 calculation methods.' },
            { icon: '', title: 'Human rights risk mapping', desc: 'Risk-based HRDD across your value chain. Country and sector risk scoring. Supplier prioritisation for deeper assessment. Grievance mechanism management.' },
            { icon: '🏆', title: 'EcoVadis integration', desc: 'EcoVadis scorecard tracking, improvement plan management, and CDP C12 supplier engagement programme documentation — all in one platform.' },
            { icon: '🔍', title: 'Modern Slavery Act', desc: 'UK and Australia Modern Slavery Act statement preparation. Supply chain mapping, risk identification, and director sign-off workflow. Published to government registry.' },
            { icon: '📋', title: 'ESRS S2 + G1 disclosure', desc: 'ESRS S2 (value chain workers) and G1 (business conduct) disclosure preparation. Supplier due diligence policy documentation and outcomes reporting.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{icon}</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={eyebrow}>How it works</div>
            <h2 style={sectionTitle}>From supplier list to disclosure.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
            {[
              ['01', 'Map your supply base', 'Upload your supplier list. ThemisIQ risk-scores each supplier by country, sector, and spend — prioritising who needs deep assessment first.'],
              ['02', 'Collect supplier data', 'Send branded data collection requests via the ThemisIQ supplier portal. Track completion status and chase non-responders automatically.'],
              ['03', 'Calculate Scope 3 Cat.1', 'Primary data from suppliers flows directly into your Scope 3 Category 1 calculation. Spend-based estimates for non-respondents fill gaps.'],
              ['04', 'Generate disclosures', 'ESRS S2, CDP C12, Modern Slavery Act statement, and CS3D due diligence documentation — all generated from your supplier programme data.'],
            ].map(([num, title, desc]) => (
              <div key={num}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.5rem', fontWeight: 400, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', opacity: 0.5, marginBottom: '0.75rem' }}>{num}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          CS3D applies from 2027.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Start building now.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          Supply chain due diligence programmes take 12–18 months to establish properly. The companies starting now will be ready. The ones starting in 2026 won't be.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/supply-chain" style={{ ...btnPrimary, textDecoration: 'none' }}>Map your supply chain →</a>
          <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to a ssedialist</a>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', padding: '2rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: 8 }}>
          <div style={{ fontSize: 12, color: '#888784' }}>© 2026 ThemisIQ Compliance Inc. · www.themisiq.co</div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <a href="/privacy" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Privacy Policy</a>
            <a href="/terms" style={{ fontSize: 12, color: '#555553', textDecoration: 'none' }}>Terms of Service</a>
            <a href="/dashboard/supply-chain" style={{ fontSize: 12, color: '#7425e3', textDecoration: 'none', fontWeight: 500 }}>Free Assessment →</a>
          </div>
        </div>
      </footer>

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const btnOutline: React.CSSProperties = { fontSize: 13, fontWeight: 400, padding: '8px 18px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', textDecoration: 'none', display: 'inline-block' }
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 300 }
