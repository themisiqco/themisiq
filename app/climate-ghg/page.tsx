'use client'
import Nav from '../components/Nav'
import { GHG_TIERS } from '@/lib/pricing'
import Footer from '@/app/components/Footer'
import { SB253_FIRST_REPORT_DATE, SB253_DATE_STATUS, SB253_STATUS_SENTENCE, SB253_SCOPE3_FROM } from '../../lib/sb253'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
export default function Page() {
  // The stat card takes a large `val` and small `unit`, and the tables want a short date. DERIVED,
  // never retyped — a date split across two fields is invisible to a whole-string guard (see the
  // KNOWN LIMIT note in lib/aiAct.test.ts). '10 November 2026' → '10 Nov' + '2026'.
  const [sbDay, sbMonth, sbYear] = SB253_FIRST_REPORT_DATE.split(' ')
  // Price and allowances from the single source of truth. The ANCHOR on the buy links is
  // load-bearing: /pricing?modules=ghg alone lands five sections above the tier picker.
  const ghgFrom = GHG_TIERS.starter.priceUSD?.toLocaleString('en-US')
  const allowanceLabel = (a: number | null) => (a == null ? 'Unlimited locations' : `Up to ${a} locations`)
  const sbStatVal = `${sbDay} ${sbMonth.slice(0, 3)}`
  const sbStatUnit = sbYear
  const sbShortDate = `${sbStatVal} ${sbYear}`
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* URGENCY BANNER */}
      <div style={{ background: 'var(--color-module-ghg)', padding: '10px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, position: 'sticky', top: 64, zIndex: 99 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>SB 253 first report: {SB253_FIRST_REPORT_DATE}, {SB253_DATE_STATUS} — Scope 1 + 2 for the prior fiscal year.</span>
        <a href="/dashboard/ghg" style={{ fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'underline' }}>Check if SB 253 applies to you →</a>
      </div>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>ThemisIQ Climate</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              GHG Emissions<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Intelligence</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 400, marginBottom: '2rem', maxWidth: 480 }}>
              Full Scope 1, 2, and 3 GHG inventory under the GHG Protocol. Audit-trail-first, verifier-ready. Pre-filled CARB SB 253 template export. CDP, ESRS E1, and EcoVadis in one inventory.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/dashboard/ghg" style={{ ...btnPrimary, textDecoration: 'none' }}>See your emissions instantly →</a>
              <a href="/pricing?modules=ghg#build-your-stack" style={{ ...btnSecondary, textDecoration: 'none' }}>From ${ghgFrom}/yr</a>
              <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 4px', color: '#555553', textDecoration: 'underline', display: 'inline-block' }}>Book a demo</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['SB 253', 'CDP C6', 'ESRS E1', 'GHG Protocol', 'IFRS S2', 'EcoVadis', 'CARB template', 'SBTi'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { val: sbStatVal, unit: sbStatUnit, label: `SB 253 first report — ${SB253_DATE_STATUS}, not final`, color: '#B91C1C', bg: '#FCEBEB' },
              { val: '15', unit: 'Scope 3', label: 'categories covered', color: '#7425e3', bg: '#EDE9FE' },
              { val: '100%', unit: 'audit', label: 'trail — every edit logged', color: '#0F6E56', bg: '#E1F5EE' },
              { val: '5+', unit: 'frameworks', label: 'from one inventory', color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid color-mix(in srgb, ${color} 13%, transparent)` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WALKTHROUGH BAND — links to /calculate-emissions */}
      <section style={{ background: '#f8f7f5', borderBottom: '0.5px solid #e8e7e4', padding: '2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#7425e3', marginBottom: 6 }}>Just been asked for your carbon footprint?</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d', lineHeight: 1.3 }}>See exactly how it works — from your bills to a submittable report.</div>
            <p style={{ fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginTop: 8 }}>A step-by-step walkthrough, transparent pricing, and answers to every question — whether the request comes from a customer, an investor, your board, or a regulator.</p>
          </div>
          <a href="/calculate-emissions" style={{ ...btnPrimary, textDecoration: 'none', whiteSpace: 'nowrap' as const }}>How it works →</a>
        </div>
      </section>

      {/* SB 253 CALLOUT */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>SB 253 — California</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              {SB253_FIRST_REPORT_DATE} is {SB253_DATE_STATUS}.<br />Are you ready?
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 400, marginBottom: '1.5rem' }}>
              SB 253 requires California-nexus companies with global revenue over $1B to disclose Scope 1 and 2 emissions. {SB253_STATUS_SENTENCE} ThemisIQ can have your inventory complete and the CARB template pre-filled in days — not months.
            </p>
            {['Guided inventory wizard — no spreadsheets', 'IPCC AR6 emission factors (AR4 on CARB export)', 'Pre-filled CARB SB 253 official template', 'Good-faith enforcement confirmed by CARB for year one', `Scope 3 preparation for ${SB253_SCOPE3_FROM}`].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 400, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>SB 253 timeline</div>
            {[
              { date: sbShortDate, event: 'Scope 1 + 2 first disclosure', status: 'critical', days: SB253_DATE_STATUS },
              { date: SB253_SCOPE3_FROM, event: 'Scope 3 disclosure begins', status: 'upcoming', days: 'Plan now' },
              { date: '2027+', event: 'Limited assurance required (Scope 1 + 2)', status: 'upcoming', days: 'Plan now' },
              { date: '2030+', event: 'Reasonable assurance (Scope 1 + 2)', status: 'future', days: 'Build toward' },
            ].map(({ date, event, status, days }) => (
              <div key={date} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: status === 'critical' ? '#B91C1C' : status === 'upcoming' ? '#ba7517' : '#888784', flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>{event}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{date}</div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: status === 'critical' ? '#B91C1C' : 'rgba(255,255,255,0.4)', background: status === 'critical' ? '#FCEBEB' : 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 99 }}>{days}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Platform capabilities</div>
          <h2 style={sectionTitle}>Everything your inventory needs.</h2>
          <p style={sectionSub}>Built for sustainability professionals. Designed for third-party verifiers.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { icon: '', title: 'Guided inventory wizard', desc: 'Step-by-step data collection across all Scope 1, 2, and 3 categories. No blank spreadsheets. No guessing which sources to include.' },
            { icon: '', title: 'Real emission factors', desc: 'IPCC AR6 GWP values throughout. IEA 2024 grid electricity factors. DEFRA 2024 travel and freight factors. Auto-converts to AR4 on CARB export.' },
            { icon: '', title: 'Immutable audit trail', desc: 'Every data entry, edit, and deletion is logged with user, timestamp, and previous value. Written by the database — not the application. Cannot be altered.' },
            { icon: '', title: 'Multi-framework export', desc: 'One inventory exports to: CARB SB 253 template, CDP C6 and C7, ESRS E1-6, EcoVadis, GRI 305, and IFRS S2 simultaneously.' },
            { icon: '', title: 'Scope 3 — all 15 categories', desc: 'Primary data collection, spend-based, hybrid, and supplier-specific methods. CDP supplier engagement. CS3D value chain mapping.' },
            { icon: '', title: 'Assurance-ready package', desc: 'Pre-formatted data room for your verifier: methodology documentation, emission factor citations, uncertainty assessment, and boundary justification.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
   
              <div style={{ fontSize: 16, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 400 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* GREENWASHING CALLOUT — Canada Competition Act */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Greenwashing risk — Canada</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              Every carbon claim now needs proof behind it.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 400, marginBottom: '1.5rem' }}>
              Canada&apos;s Competition Act now targets unsubstantiated environmental claims. If you state &ldquo;net zero,&rdquo; &ldquo;carbon neutral,&rdquo; or &ldquo;emissions reduced by X%,&rdquo; the burden is on you to prove it — under a reverse-onus standard, the company making the claim must show it is adequately and properly substantiated, not the regulator. An audit-trailed GHG inventory is that proof.
            </p>
            {['Reverse onus — you must substantiate the claim', 'Penalties up to $10M or 3% of global revenue', 'Applies to marketing, websites, and reports', 'ThemisIQ gives every figure a documented, defensible basis'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 400, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Claim vs. proof</div>
            {[
              { claim: '"We are carbon neutral"', proof: 'Scope 1 + 2 inventory with cited emission factors' },
              { claim: '"Emissions down 30%"', proof: 'Prior-year baseline + current inventory, same methodology' },
              { claim: '"Science-based target"', proof: 'Verified baseline inventory - the foundation for any target' },
              { claim: '"Low-carbon operations"', proof: 'Intensity figures benchmarked and source-documented' },
            ].map(({ claim, proof }) => (
              <div key={claim} style={{ padding: '12px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 3 }}>{claim}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>Needs: {proof}</div>
              </div>
            ))}
            <div style={{ marginTop: 12, fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>Competition Act (Bill C-59, 2024; amended by C-15, 2026). Requirements are evolving and subject to a constitutional challenge — confirm your obligations with counsel.</div>
          </div>
        </div>
      </section>{/* FRAMEWORK TABLE */}
      <section style={{ padding: '0 2.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={eyebrow}>Framework coverage</div>
          <h2 style={sectionTitle}>One inventory. Multiple frameworks.</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Framework', 'Jurisdiction', 'Threshold', 'Deadline', 'ThemisIQ coverage'].map(h => (
                <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['SB 253 · CARB template', 'California, USA', '$1B+ global revenue', `${sbShortDate} (${SB253_DATE_STATUS})`, '✓ Full — pre-filled export'],
              ['CDP Climate (C6, C7, C11)', 'Global', 'Investor-requested', 'Annual · July', '✓ Full — direct mapping'],
              ['ESRS E1 · CSRD', 'European Union', '500+ employees (large)', 'FY2024 reporting', '✓ Full — ESRS E1-6'],
              ['IFRS S2', 'Multiple', 'Adopted by jurisdiction', 'Jurisdiction-dependent', '✓ Full — scenario analysis'],
              ['GHG Protocol Corporate', 'Global', 'Voluntary + mandatory base', 'Ongoing', '✓ Full — methodology base'],
              ['EcoVadis', 'Global', 'Customer-requested', 'Annual', '✓ Full — E1 module maps directly'],
              ['GRI 305', 'Global', 'Voluntary', 'Annual', '✓ Full — GRI 305-1, 305-2, 305-3'],
              ['SBTi', 'Global', 'Voluntary commitment', 'Ongoing', '✓ Full — near-term & net-zero target setting'],
            ].map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 4 ? '#0F6E56' : '#555553', fontWeight: j === 4 ? 500 : 400 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* PRICING */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={eyebrow}>Pricing</div>
          <h2 style={sectionTitle}>Start with Climate · GHG Emissions.</h2>
          <p style={sectionSub}>Essentials covers your full GHG inventory — Scope 1, 2 &amp; 3 across all frameworks — everything you need for SB 253. Step up to Professional for more locations and hands-on advisory.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: '2.5rem', textAlign: 'left' }}>
            {[
              { plan: 'Essentials', price: '$' + GHG_TIERS.starter.priceUSD?.toLocaleString(), cadence: '/ reporting year', features: ['Scope 1 + 2 · CARB SB 253 ready', 'Scope 3 · all 15 categories', 'IPCC AR6 · IEA 2024 factors', 'Audit trail + assurance package', 'All reporting frameworks included', 'Multi-year trends dashboard', allowanceLabel(GHG_TIERS.starter.locationAllowance)], featured: false },
              { plan: 'Professional', price: '$' + GHG_TIERS.professional.priceUSD?.toLocaleString(), cadence: '/ reporting year', features: ['Everything in Essentials', allowanceLabel(GHG_TIERS.professional.locationAllowance), '10 hours of expert advisory / year', 'Quarterly sector roundtables', 'Regulatory Monitor — weekly alerts'], featured: true },
            ].map(({ plan, price, cadence, features, featured }) => (
              <div key={plan} style={{ background: featured ? '#0d0d0d' : '#fff', borderRadius: 12, padding: '2rem', border: featured ? 'none' : '0.5px solid #e8e7e4' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: featured ? 'rgba(255,255,255,0.4)' : '#888784', marginBottom: 8 }}>{plan}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.4rem', fontWeight: 400, color: featured ? '#fff' : '#0d0d0d' }}>{price}<span style={{ fontSize: 14, fontWeight: 400, color: featured ? 'rgba(255,255,255,0.4)' : '#888784' }}>{cadence}</span></div>
                <div style={{ height: '0.5px', background: featured ? 'rgba(255,255,255,0.1)' : '#e8e7e4', margin: '1.25rem 0' }} />
                {features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: featured ? '#64fe3e' : '#0F6E56', flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: featured ? 'rgba(255,255,255,0.65)' : '#555553', fontWeight: 400 }}>{f}</span>
                  </div>
                ))}
                <a href="/pricing?modules=ghg#build-your-stack" style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', background: featured ? 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)' : '#0d0d0d', color: featured ? '#0d0d0d' : '#fff', marginTop: '1.5rem' }}>
                  Choose your plan →
                </a>
              </div>
            ))}
          </div>
          {/* What counts as a location — directly beneath the two plan cards, because the only
              difference between them a buyer must self-assess against is the location count. */}
          <p style={{ fontSize: 12, color: '#888784', lineHeight: 1.7, marginTop: '1.25rem', maxWidth: 620 }}>
            One location = one site with its own electricity supply. All of that site’s energy goes in together — electricity, gas, vehicle fuel, refrigerants — so a site with separate gas and electricity accounts is still one location.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          {/* A LABEL, not a claim. This slot was "{daysLeft} days to SB 253." — a countdown to a date
              CARB has moved twice — and neither the date nor "proposed" fits at clamp(2rem, 4vw, 3rem)
              beside the gradient line. It names the subject; the paragraph below carries the posture. */}
          SB 253 Scope 1 + 2.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Start today.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 400, lineHeight: 1.7 }}>
          ThemisIQ can have your Scope 1 and 2 inventory complete and the CARB template pre-filled in days. Reports unlocked on paid plan. No credit card required.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/ghg" style={{ ...btnPrimary, textDecoration: 'none' }}>See your emissions instantly →</a>
          <a href="/pricing?modules=ghg#build-your-stack" style={{ ...btnSecondary, textDecoration: 'none' }}>From ${ghgFrom}/yr</a>
          <a href="/advisory" style={{ fontSize: 14, fontWeight: 400, padding: '13px 4px', color: '#555553', textDecoration: 'underline', display: 'inline-block' }}>Talk to an advisor</a>
          <a href="/dashboard/ghg" style={{ ...btnSecondary, textDecoration: 'none' }}>Check if SB 253 applies to you →</a>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'var(--color-brand)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const btnOutline: React.CSSProperties = { fontSize: 13, fontWeight: 400, padding: '8px 18px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', textDecoration: 'none', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 400 }
