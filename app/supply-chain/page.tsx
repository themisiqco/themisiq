import type { Metadata } from 'next'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '../../lib/pricing'
import { SB253_SCOPE3_FROM, SB253_DATE_STATUS } from '../../lib/sb253'
import {
  CS3D_APPLIES_FROM, CS3D_TRANSPOSITION, CS3D_ARTICLE_16_FROM,
  CS3D_EMPLOYEE_THRESHOLD, CS3D_TURNOVER_THRESHOLD, CS3D_NON_EU_TURNOVER_THRESHOLD,
  CS3D_VALUE_CHAIN_CONTACT_LIMIT, CS3D_OTHER_ROUTES_NOTE,
  CS3D_CITATION, CS3D_REGIME_CITATION, CS3D_OMNIBUS_CITATION,
  CS3D_OMNIBUS_PUBLISHED, CS3D_OMNIBUS_IN_FORCE, CS3D_GUIDELINES_DUE,
} from '../../lib/cs3d'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'

// --- SEO ---------------------------------------------------------
// Shape follows app/calculate-emissions/page.tsx. No `revalidate` here: that page
// sets one because it renders a live SB 253 countdown; this page reads only the
// fixed thresholds in lib/cs3d, so there is nothing to go stale between builds.
export const metadata: Metadata = {
  title: 'Supplier Data Collection and Supply Chain Risk | ThemisIQ',
  description:
    'Collect sustainability data from your suppliers, and answer the CS3D, EcoVadis, Modern Slavery and ESRS S2 questionnaires your customers send you. Without spreadsheets or consultants.',
  alternates: { canonical: '/supply-chain' },
  openGraph: {
    title: 'Supplier Data Collection and Supply Chain Risk | ThemisIQ',
    description:
      'Collect sustainability data from your suppliers, and answer the CS3D, EcoVadis, Modern Slavery and ESRS S2 questionnaires your customers send you. Without spreadsheets or consultants.',
    url: '/supply-chain',
    type: 'website',
  },
}

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
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
             Supply Chain & <span style={{ fontStyle: 'italic', color: 'var(--color-brand)' }}>Sustainable Procurement</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 400, marginBottom: '2rem', maxWidth: 480 }}>
             {/* Was "Meet CS3D ... obligations", which told a supplier the directive applied to them.
                 CS3D binds the company asking, not the company answering. Both directions of the
                 module are stated instead: requests you receive, and requests you send. */}
             Know your supply chain risks. Answer the CS3D, EcoVadis, Modern Slavery and ESRS S2 questionnaires your customers send you, and collect the same from your own suppliers. Without spreadsheets or consultants.
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
              { val: '70%', unit: 'of emissions', label: 'typically in Scope 3 Cat.1 for manufacturers', color: 'var(--color-brand)', bg: 'var(--color-brand-wash)' },
              // Was 'civil liability for failures' in critical red. (EU) 2026/470 is understood to have
              // deleted the EU-wide civil liability regime and reverted it to national law, on secondary
              // sources, pending EUR-Lex verification: see docs/backlog.md. The claim went with it, and
              // the red went with the claim, because a 2029 date carried in the same colour as an overdue
              // one is its own small overstatement.
              { val: 'CS3D', unit: CS3D_APPLIES_FROM, label: 'Your in-scope customers must diligence their value chain, and ask you for what they need', color: 'var(--color-state-warn)', bg: '#FEF3E2' },
              { val: '5+', unit: 'frameworks', label: 'CS3D · EcoVadis · Modern Slavery · CDP supplier engagement · ESRS S2, one platform', color: '#0F6E56', bg: '#E1F5EE' },
              { val: '$2,900', unit: 'portal/yr', label: 'vs $15,000–$50,000 for EcoVadis supplier outreach, same outcome', color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ val, unit, label, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid color-mix(in srgb, ${color} 13%, transparent)` }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CS3D CALLOUT */}
      <section className="tq-band-bleed" style={{ padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--color-ink-2)', marginBottom: 8 }}>EU CS3D: Corporate Sustainability Due Diligence</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem' }}>
              Your customer's obligation.<br />Your questionnaire.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.75, fontWeight: 400, marginBottom: '1.5rem' }}>
              {/* ⚠️ REWRITTEN 24 Sep 2026. Four claims were removed rather than softened, because each was
                  false rather than merely strong. (1) Civil liability: (EU) 2026/470 is understood to have
                  deleted the EU-wide regime and reverted it to national law. That rests on secondary
                  sources and is pending EUR-Lex verification (docs/backlog.md), which is why the page
                  neither threatens liability nor states that it is gone. (2) "you must comply": with one tier at 5,000
                  employees, almost no reader of this page is in scope, and the ones who are do not need
                  a marketing page to tell them. (3) "large companies": scoped nothing a reader could
                  check, and means something five times narrower than when it was written. (4) The
                  phase-in: 2026/470 eliminated the two lower tiers, so there is no staged entry left to
                  prepare for.
                  What replaces them is the true and more useful fact: the obligation lands on the
                  customer, and the request lands on the reader. */}
              CS3D obliges large companies to carry out human rights and environmental due diligence across their value chain, not just tier 1. Almost certainly that is not you: since {CS3D_OMNIBUS_CITATION} there is a single scope tier, and an EU company is caught only with {CS3D_EMPLOYEE_THRESHOLD} and {CS3D_TURNOVER_THRESHOLD}. A non-EU company is caught on {CS3D_NON_EU_TURNOVER_THRESHOLD}, with no employee test. {CS3D_OTHER_ROUTES_NOTE}
            </p>
            <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.75, fontWeight: 400, marginBottom: '1.5rem' }}>
              What reaches you is the request. Your in-scope customers cannot diligence a value chain they have no information about, so they will ask, and they will ask before their own deadline rather than on it. {CS3D_VALUE_CHAIN_CONTACT_LIMIT} That limit is worth knowing: it is the basis on which you can ask a customer why they need something.
            </p>
            {/* Was a list of the READER's obligations, one of which ("Civil liability for failures")
                no longer exists in the directive at all. Now a list of what the module does for a
                company on the receiving end of the request. */}
            {['Answer once, reuse across every customer that asks', 'Structured human rights and environmental questionnaires, not a spreadsheet per customer', 'Collect the same from your own suppliers, where you are the one asking', 'Evidence of a grievance mechanism, where you have one', 'Mapping to ESRS S2 and G1, if you report under CSRD yourself'].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ color: 'var(--color-module-ai)', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'var(--color-ink-2)', fontWeight: 400, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'var(--color-paper)', border: '0.5px solid var(--color-line)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--color-ink-2)', marginBottom: 16 }}>Key supply chain frameworks</div>
            {[
              // "(large companies)" removed: the phase-in it referred to was eliminated, and the word
              // now means something five times narrower. Urgency dropped from critical to high: the
              // date is 2029, and the questionnaires arrive earlier than that, which is what 'high'
              // says. 'critical' beside ESRS S2's FY2024 was not a defensible comparison.
              { fw: 'EU CS3D', scope: 'HRDD by your in-scope customers', deadline: CS3D_APPLIES_FROM, urgency: 'high' },
              { fw: 'ESRS S2', scope: 'Value chain workers', deadline: 'FY2024 (large EU)', urgency: 'critical' },
              // ⚠️ IMPORTED AND POSTURED, 24 Sep 2026. Was the literal '2027 (California)', which stated an
              // unapproved Californian regulation as settled, in a table where it now sits beside a firm
              // directive. lib/sb253.ts is the single source and is explicit: SB253_DATE_STATUS is
              // 'proposed', never 'final', until CARB finalises and OAL approves, and the citation
              // records that an earlier date was approved and then WITHDRAWN before it took effect.
              //   The word comes from the library, not from here. SB253_FRAMEWORK_DEADLINE exists for a
              // cell this shape but carries the FIRST-REPORT date (10 Nov 2026, Scope 1 and 2); this row
              // is Scope 3, so the Scope 3 constant is used with the status beside it.
              { fw: 'SB 253 Scope 3', scope: 'Category 1 purchased goods', deadline: `${SB253_SCOPE3_FROM} (California, ${SB253_DATE_STATUS})`, urgency: 'high' },
              { fw: 'CDP supplier engagement', scope: 'Supplier engagement programme', deadline: 'Annual · July', urgency: 'medium' },
              { fw: 'Modern Slavery Act', scope: 'UK + Australia transparency statement', deadline: 'Annual', urgency: 'medium' },
              { fw: 'EcoVadis', scope: 'Supplier sustainability ratings', deadline: 'Customer-requested', urgency: 'medium' },
            ].map(({ fw, scope, deadline, urgency }) => {
              const color = urgency === 'critical' ? '#B91C1C' : urgency === 'high' ? 'var(--color-state-warn)' : 'var(--color-ink-muted)'
              return (
                <div key={fw} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '0.5px solid var(--color-line)' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{fw}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-ink-2)' }}>{scope}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-ink-2)', flexShrink: 0, textAlign: 'right' as const }}>{deadline}</div>
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
            { title: 'Supplier portal', desc: 'Branded supplier sustainability data collection portal. Suppliers complete structured questionnaires on emissions, labour practices, and environmental performance, with no spreadsheets.' },
            { title: 'Scope 3 Cat.1 primary data', desc: 'Collect spend data, activity data, and supplier-specific emission factors directly from your supply base: the primary supplier data that feeds your Scope 3 Category 1 calculation in the GHG module, across all GHG Protocol methods.' },
            { title: 'Human rights risk mapping', desc: 'Risk-based HRDD across your value chain. Country and sector risk scoring. Supplier prioritisation for deeper assessment. Questionnaires cover grievance mechanisms and remediation.' },
            { title: 'EcoVadis-themed questionnaires', desc: 'Supplier questionnaires structured to the four EcoVadis themes (Environment, Labour & Human Rights, Ethics, and Sustainable Procurement), so the evidence you collect maps to the scorecard you\'re rated against.' },
            { title: 'Modern Slavery Act', desc: 'UK and Australia Modern Slavery Act. Structured supplier questionnaires across forced and compulsory labour, child labour, and due diligence and remediation, with supply chain mapping and risk identification.' },
            { title: 'ESRS S2 supplier data', desc: 'Supplier questionnaires aligned to ESRS S2 (value chain workers): the value chain worker data your disclosure needs, collected and evidenced.' },
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
              ['01', 'Map your supply base', 'Upload your supplier list. ThemisIQ risk-scores each supplier by country, sector, and spend, prioritising who needs deep assessment first.'],
              ['02', 'Collect supplier data', 'Send branded data collection requests via the ThemisIQ supplier portal. Track completion status and send reminders to non-responders.'],
              ['03', 'Collect Category 1 data', 'Suppliers report their Category 1 emissions through the portal. Where a supplier hasn\'t responded, spend-based estimates fill the gap.'],
              ['04', 'Feed your Scope 3', 'Pull supplier-reported Category 1 emissions into your GHG inventory, with spend-based gap-fill for non-responders. You review the full breakdown before it\'s applied.'],
            ].map(([num, title, desc]) => (
              <div key={num}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 400, color: 'var(--color-brand)', opacity: 0.5, marginBottom: '0.75rem' }}>{num}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: '0.5rem' }}>{title}</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 400 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CS3D DATES AND SOURCES
          Follows app/cbam/page.tsx: every date named in prose above appears here with the instrument
          it comes from, and the instruments get their own two-row table with a role each. A compliance
          page that states a date without its source asks to be taken on trust, which is the one thing
          this product cannot ask for. */}
      <section style={{ padding: '4rem 2.5rem', borderTop: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={sectionTitle}>CS3D dates, and where they come from</h2>
          <p style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.75, marginBottom: '1.5rem' }}>
            {CS3D_OMNIBUS_CITATION} (Omnibus I) was published on {CS3D_OMNIBUS_PUBLISHED} and entered
            into force on {CS3D_OMNIBUS_IN_FORCE}, amending {CS3D_REGIME_CITATION}. It raised the size
            thresholds, eliminated the two lower phase-in tiers, and moved the dates below.
          </p>
          {/* ⚠️ THE LIABILITY DELETION IS NOT ASSERTED HERE, DELIBERATELY. (EU) 2026/470 is understood to
              have deleted the EU-wide civil liability regime and reverted it to national law, and that
              understanding is why the liability framing was removed from this page on 24 Sep 2026. But it
              rests on secondary sources: nobody here has read the amended article on EUR-Lex.
                REMOVING an over-claim on a secondary source is safe in a way that ADDING one is not. So
              the page no longer threatens the reader with liability, and it also does not tell them the
              liability is gone. Silence is the only position both honest and available. docs/backlog.md
              carries it as pending verification, together with the 3% penalty cap, which is kept off
              this page for the same reason. */}

          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13, marginBottom: '2rem' }}>
            <thead>
              <tr>
                {['What', 'When', 'Source'].map(h => (
                  <th key={h} style={{ background: 'var(--color-sunken)', color: 'var(--color-ink)', borderBottom: '2px solid var(--color-ink)', padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Member States transpose into national law', CS3D_TRANSPOSITION, CS3D_CITATION],
                ['Obligations apply to companies in scope', CS3D_APPLIES_FROM, CS3D_CITATION],
                ['Article 16 public reporting', CS3D_ARTICLE_16_FROM, CS3D_CITATION],
              ].map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 1 ? '#0d0d0d' : '#555553', fontWeight: j === 1 ? 500 : 400 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 }}>
            <thead>
              <tr>
                {['Instrument', 'Reference', 'Role'].map(h => (
                  <th key={h} style={{ background: 'var(--color-sunken)', color: 'var(--color-ink)', borderBottom: '2px solid var(--color-ink)', padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['CSDDD', CS3D_REGIME_CITATION, 'The regime itself'],
                ['Omnibus I', CS3D_OMNIBUS_CITATION, 'Amends the above: scope, dates, reporting'],
              ].map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 2 ? '#0F6E56' : '#555553', fontWeight: j === 2 ? 500 : 400 }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* ⚠️ SAID ON THE PAGE, NOT ONLY IN THE BACKLOG. Two things a reader could otherwise take from
              the table that it does not support: that national law is settled, and that the Commission's
              guidance exists. Neither is true yet, and a supplier planning around this page deserves to
              know which parts are still moving. */}
          <p style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.7, marginTop: '1.5rem' }}>
            Transposition is what turns these dates into national obligations, and it has not happened
            in earnest yet. The Commission is due to publish implementation guidelines before
            {' '}{CS3D_GUIDELINES_DUE}, and they are not published at the time of writing. Both will
            change how the questionnaires you receive are worded, so treat the wording of a request as
            your customer&apos;s reading of the directive rather than as the directive.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          CS3D applies to your customers from {CS3D_APPLIES_FROM}.<br />
          <span style={{ fontStyle: 'italic', color: 'var(--color-brand)' }}>Start building now.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 400, lineHeight: 1.7 }}>
          {/* Was "12-18 months to establish ... the ones starting in 2026 won't be", written against a
              2027 application date that (EU) 2026/470 moved to 2029. The urgency was real when written
              and is not now, and an invented deadline on a compliance page is the one thing a reader
              can check against the directive. What is still true is that the request arrives before
              the deadline does. */}
          Your customers have to gather value chain information before their own deadline, not on it, so the questionnaires arrive first. Answer once and reuse it.
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
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 400 }
