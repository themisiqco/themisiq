'use client'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'

// One route to a conversation across the whole page. Every call to action points at the same
// Calendly booking; advisory@themisiq.co appears once at the foot as a contact line, not as a
// link. Keeping that single is deliberate — two booking paths means two things to keep working.
const CALENDLY = 'https://calendly.com/themisiq/30min'

// Module | the question the platform cannot answer alone | the engagement that answers it.
// Ordered to match the module order used elsewhere in the product.
const BY_MODULE: [string, string, string][] = [
  ['GHG Emissions', 'Is my organizational boundary and Scope 3 screening defensible to a verifier?', 'Inventory review, boundary and materiality decisions, and filing preparation across CARB SB 253, CDP, ESRS E1, IFRS S2, GRI 305 and customer questionnaires'],
  ['CBAM', 'Do my installation-level actuals hold up, and what does my EU importer actually need?', 'Precursor tracing review, Annex IV summary walkthrough'],
  ['Climate Risk', 'Are my scenario choices and resilience conclusion disclosable as reasoned judgment?', 'Scenario rationale, assumptions register review, IFRS S2 narrative'],
  ['Materiality Assessment', 'Which IROs survive challenge, and how do I evidence stakeholder engagement?', 'Workshop facilitation, threshold setting, ESRS 2 gap review'],
  ['Supply Chain', 'How do I get primary data out of suppliers who will not respond?', 'Supplier engagement program design, EcoVadis and CS3D strategy'],
  ['Deals & Investment', 'What does inherited Scope 3 do to this deal thesis?', 'Diligence support, IC memo, post-close integration plan'],
  ['AI Governance', 'Which systems are high-risk, and who signs off?', 'Classification review, oversight model, board documentation'],
  ['People & Workforce', 'What do I disclose when the pay gap is real?', 'Disclosure design, EU Pay Transparency readiness'],
  ['Cyber Governance', 'Am I in scope for NIS2 or DORA, and what is the gap?', 'Scoping determination, gap assessment, remediation sequencing'],
]

const CROSS_MODULE: [string, string][] = [
  ['Scoping and eligibility', 'Which regulations apply to you at all, across every jurisdiction you operate in, and in what order they fall due. A prioritized roadmap with effort and cost estimated per obligation. This is the right starting point if you are not yet sure what you are required to report.'],
  ['Assurance readiness', 'Verifier selection, data room preparation, methodology documentation, and issue resolution once the assurance process is underway. Custom to your assurance provider and the standard they are working to.'],
  ['Retained advisory', 'Ongoing support for companies with a continuous reporting obligation. Monthly calls, regulatory monitoring, and document review, with priority turnaround on questions that cannot wait.'],
]

export default function AdvisoryPage() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4', background: '#f8f7f5' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={eyebrow}>ThemisIQ Advisory</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.4rem, 5vw, 3.6rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d', maxWidth: 760 }}>
            Expert judgment, scoped to the{' '}
            <span style={{ fontStyle: 'italic', color: 'var(--color-brand)' }}>module you&rsquo;re working in.</span>
          </h1>
          <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 400, marginBottom: '2.5rem', maxWidth: 620 }}>
            The platform runs the calculation and keeps the audit trail. Custom advisory is for the decisions it can&rsquo;t make for you: whether your boundary holds, which scenarios you can defend, and what your board needs to hear when the number moves.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '3rem' }}>
            <a href={CALENDLY} style={{ ...btnPrimary, textDecoration: 'none' }}>Book a 30-minute complimentary call</a>
            <a href="/assess" style={{ ...btnSecondary, textDecoration: 'none' }}>See where you stand &mdash; free assessment</a>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, maxWidth: 680 }}>
            {[
              ['30 minutes', 'Complimentary first call'],
              ['Fixed scope', 'Fixed fee, agreed before we start'],
              ['Senior practitioner', 'Same person throughout'],
            ].map(([val, label]) => (
              <div key={label} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem', textAlign: 'center' as const }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 400, color: 'var(--color-brand)', marginBottom: 4 }}>{val}</div>
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHERE THE PLATFORM ENDS */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={eyebrow}>Ready-to-go, or custom</div>
          <h2 style={sectionTitle}>Most companies need the modules. Some need judgment on top.</h2>
        </div>
        <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' }}>
          <p style={{ fontSize: 15, color: '#555553', lineHeight: 1.75, fontWeight: 400, margin: 0 }}>
            ThemisIQ&rsquo;s modules are built to run without us. You answer the guided questions, the platform applies the right methodology, and you export a report your verifier can follow. For most reporting obligations that&rsquo;s the whole job, and it&rsquo;s deliberately priced so you never need to call anyone.
          </p>
          <p style={{ fontSize: 15, color: '#555553', lineHeight: 1.75, fontWeight: 400, margin: 0 }}>
            Custom advisory is for the part that isn&rsquo;t mechanical. A methodology choice you&rsquo;ll have to defend. A verifier pushing back on your organizational boundary. A director asking why last year&rsquo;s figure was different. Those are judgment calls, and judgment is what you&rsquo;re buying.
          </p>
        </div>
      </section>

      {/* ADVISORY BY MODULE */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={sectionTitle}>Scoped to what you&rsquo;re actually working on.</h2>
            <p style={sectionSub}>Each engagement is bounded by the module it sits on, which is why the fee can be fixed before we start.</p>
          </div>
          {/* Hairline grid: 1px gaps over a grey ground, the same construction the page already
              uses for two-column comparisons. Header row first, then one row per module. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 0.85fr) minmax(240px, 1.35fr) minmax(240px, 1.5fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
            {['Module', 'The question the platform can’t answer alone', 'Custom advisory engagement'].map((h) => (
              <div key={h} style={{ background: '#fff', padding: '1rem 1.25rem', fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{h}</div>
            ))}
            {BY_MODULE.map(([mod, question, engagement]) => (
              <Row key={mod} mod={mod} question={question} engagement={engagement} />
            ))}
          </div>
        </div>
      </section>

      {/* ACROSS EVERY MODULE */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h2 style={sectionTitle}>Three things that aren&rsquo;t module-specific.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {CROSS_MODULE.map(([title, desc]) => (
            <div key={title} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '0.75rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 400, flex: 1 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* WHO YOU WORK WITH */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={eyebrow}>Who you work with</div>
            <h2 style={sectionTitle}>A global network, matched to your obligation.</h2>
          </div>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: '1.25rem' }}>
            <p style={{ fontSize: 15, color: '#555553', lineHeight: 1.75, fontWeight: 400, margin: 0 }}>
              Custom advisory draws on a network of practitioners across sustainability, regulatory and governance disciplines. We match you to the person whose experience fits the obligation in front of you, rather than assigning whoever is available.
            </p>
            <p style={{ fontSize: 15, color: '#555553', lineHeight: 1.75, fontWeight: 400, margin: 0 }}>
              You&rsquo;ll know who that is before the engagement starts. We name your advisor, and their relevant background, at the point we scope the work. The same person stays with you through to delivery.
            </p>
            <p style={{ fontSize: 15, color: '#555553', lineHeight: 1.75, fontWeight: 400, margin: 0 }}>
              You get a senior practitioner on every engagement. Not a junior associate learning your sector on your budget, with a partner signing off at the end.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="tq-band-bleed" style={{ padding: '5rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1rem', lineHeight: 1.2 }}>
          Start with a <span style={{ fontStyle: 'italic', color: 'var(--color-brand)' }}>conversation.</span>
        </h2>
        <p style={{ fontSize: 15, color: 'var(--color-ink-2)', maxWidth: 520, margin: '0 auto 2.5rem', fontWeight: 400, lineHeight: 1.7 }}>
          Thirty minutes, no charge, no obligation. We&rsquo;ll go through what you&rsquo;re required to report, what&rsquo;s driving the deadline, and whether you need custom advisory at all. Often you don&rsquo;t, and we&rsquo;ll tell you that.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href={CALENDLY} style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', textDecoration: 'none', display: 'inline-block' }}>Book a 30-minute complimentary call</a>
        </div>
        {/* Contact line, deliberately plain text rather than a mailto link: the page has one
            call to action and this is not it. */}
        <div style={{ fontSize: 12, color: 'var(--color-ink-2)', marginTop: '1.5rem' }}>advisory@themisiq.co</div>
      </section>

      {/* FOOTER */}
      <Footer />

    </div>
  )
}

// One row of the module table, three cells sharing the hairline ground.
function Row({ mod, question, engagement }: { mod: string; question: string; engagement: string }) {
  return (
    <>
      <div style={{ background: '#fff', padding: '1.25rem', fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{mod}</div>
      <div style={{ background: '#fff', padding: '1.25rem', fontSize: 13, color: 'var(--color-ink-muted)', lineHeight: 1.6, fontWeight: 400 }}>{question}</div>
      <div style={{ background: '#fff', padding: '1.25rem', fontSize: 13, color: '#555553', lineHeight: 1.6, fontWeight: 400 }}>{engagement}</div>
    </>
  )
}

const navLink: React.CSSProperties = { fontSize: 11, color: '#555553', textDecoration: 'none' }
const btnGrad: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '8px 18px', borderRadius: 8, background: 'var(--color-brand)', color: '#fff', textDecoration: 'none', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 600, margin: '0 auto', lineHeight: 1.75, fontWeight: 400 }
