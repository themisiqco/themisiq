'use client'
import Nav from '../components/Nav'
import { useState, useEffect } from 'react'
import Footer from '@/app/components/Footer'
export default function Page() {
  // Countdown to the first importer CBAM declaration (30 Sep 2027). Mirrors the
  // climate-ghg deadline pattern; recomputed on mount so the initial value is just a paint placeholder.
  const [daysLeft, setDaysLeft] = useState(430)
  useEffect(() => {
    const deadline = new Date('2027-09-30')
    const today = new Date()
    const diff = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    setDaysLeft(Math.max(0, diff))
  }, [])
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* URGENCY BANNER */}
      <div style={{ background: '#B91C1C', padding: '10px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, position: 'sticky', top: 64, zIndex: 99 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>CBAM definitive regime is live. First importer declaration due 30 September 2027 —  {daysLeft} days away.</span>
        <a href="/pricing?modules=cbam" style={{ fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'underline' }}>See CBAM pricing →</a>
      </div>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>CBAM · Carbon Border Adjustment Mechanism</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              The CBAM definitive regime is live.<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Don’t let default values price you out.</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              When you can’t show verified emissions, importers fall back to worst-case default values — a higher border charge that makes your goods less competitive than suppliers who can. ThemisIQ computes installation-level actuals, independently verifiable and ready to share with your EU customers.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/cbam/preview" style={{ ...btnPrimary, textDecoration: 'none' }}>See a sample report →</a>
              <a href="/pricing?modules=cbam" style={{ ...btnSecondary, textDecoration: 'none' }}>See pricing</a>
              <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to a specialist</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['Non-EU exporters', 'Regulation (EU) 2023/956', 'Verifier-ready'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: '30 Sep', unit: '2027', label: 'first importer CBAM declaration due', color: '#B91C1C', bg: '#FCEBEB' },
              { val: '2026', unit: 'definitive period', label: 'CBAM definitive regime now live', color: '#7425e3', bg: '#EDE9FE' },
              { val: 'Actuals', unit: 'not defaults', label: 'installation-level, verifier-ready figures', color: '#0F6E56', bg: '#E1F5EE' },
              { val: 'Steel + Al', unit: 'available now', label: 'iron, steel & aluminium live; more sectors coming', color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${color}22` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Why actuals</div>
          <h2 style={sectionTitle}>Verified emissions your EU customers can trust.</h2>
          <p style={sectionSub}>Built for non-EU exporters. Designed for the accredited verifier who reviews the numbers.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { title: 'Actuals beat defaults', desc: 'Default values are set to the worst-case country average plus a mark-up that rises every year. Verified, installation-level actual emissions almost always come in lower — and the gap widens annually.' },
            { title: 'Specific embedded emissions, done properly', desc: 'Direct and indirect emissions split, precursor tracing through the supply chain, installation-level data rather than estimates. Computed under the CBAM implementing regulations, not approximated.' },
            { title: 'Verifier-ready by design', desc: 'Every figure is sourced and traceable, so the accredited verifier reviewing your emissions can follow each number to its evidence — the independent verification the definitive regime requires for actual values.' },
            { title: 'Built for your EU customer’s declaration', desc: 'Output maps to what the importer needs for their annual CBAM declaration (first due 30 September 2027), so your verified actuals flow into their filing instead of a costly default.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTOR COVERAGE — the one honest scope block */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Sector coverage</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              What computes today.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              Available now: iron and steel (CN 72–73) and aluminium (CN 76). More CBAM sectors — cement, fertilisers, and hydrogen — are in active development. We show you what is live so you always know exactly what the module computes.
            </p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Available now</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#64fe3e', flexShrink: 0, marginTop: 5 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>Iron & steel</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>CN 72–73 · computing now</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#64fe3e', flexShrink: 0, marginTop: 5 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>Aluminium</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>CN 76 · computing now</div>
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', margin: '16px 0 4px' }}>In active development</div>
            {['Cement', 'Fertilisers', 'Hydrogen'].map(sector => (
              <div key={sector} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#888784', flexShrink: 0, marginTop: 5 }} />
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 300 }}>{sector}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REGULATORY BASIS */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={eyebrow}>Regulatory basis</div>
          <h2 style={sectionTitle}>Computed under the CBAM implementing regulations.</h2>
          <p style={sectionSub}>Not a single-article interpretation — the calculation follows the full stack of Commission instruments, cited below.</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Instrument', 'Reference', 'Role'].map(h => (
                <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['CBAM Regulation', 'Regulation (EU) 2023/956', 'The regime itself'],
              ['Embedded-emissions calculation', 'IR (EU) 2025/2547', 'How specific embedded emissions are computed'],
              ['Free-allocation adjustment', 'IR (EU) 2025/2620', 'Benchmarks'],
              ['Default values', 'IR (EU) 2025/2621', 'The fallback verified actuals avoid'],
              ['Verification & accreditation', 'IR (EU) 2025/2546 · DR (EU) 2025/2551', 'Verifier accreditation (EN ISO/IEC 14065)'],
            ].map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 2 ? '#0F6E56' : '#555553', fontWeight: j === 2 ? 500 : 400 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <a href="/methodology" style={{ fontSize: 13, fontWeight: 500, color: '#7425e3', textDecoration: 'none' }}>Full methodology →</a>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          Stop losing margin to default values.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Compute your actuals.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          ThemisIQ produces installation-level, verifier-ready specific embedded emissions your EU customer can carry into their CBAM declaration — instead of the worst-case default.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/cbam/preview" style={{ ...btnPrimary, textDecoration: 'none' }}>See a sample report →</a>
          <a href="/pricing?modules=cbam" style={{ ...btnSecondary, textDecoration: 'none' }}>See pricing</a>
          <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to a specialist</a>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 300 }
