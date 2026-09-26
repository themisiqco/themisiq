import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { SB261_STATUS_SENTENCE } from '@/lib/sb261'
import { IFRS_S2_ADOPTION_COUNT, IFRS_S2_ADOPTION_SOURCE } from '@/lib/ifrsS2'
import { MODULE_SUBLINE, CSRD_BOTH_HALVES } from '@/lib/modulePages'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection, ModuleOutputs,
  ModuleArrivals, ModuleFaq, bodyCopy, moduleEyebrow, type ModuleOutput, type Faq,
} from '@/app/components/modulePage'

const KEY = 'climate-risk' as const

/**
 * The Climate Risk module page, and the FIRST page built to the shared ten-section module shape.
 * The four shared pieces live in app/components/modulePage.tsx; the claims that must not vary across
 * seven pages live in lib/modulePages.ts.
 *
 * ⚠️ NO FIGURE HERE IS TYPED. The previous version carried four: stat cards reading '4' stakeholders,
 * '3' scenarios and '2' risk types, none of which had a constant, plus "six questions" in the copy —
 * which was also WRONG. The wizard's steps are ['Industry', 'Operating regions', 'Regulatory exposure',
 * 'Scenario', 'Results'], with an 'Impact' step added in CSRD mode, so the count is four or five
 * depending on mode. A number cannot express that; the FAQ lists what is asked instead. This is the
 * same defect docs/backlog.md records on the questionnaire picker, which stated 38 questions where
 * TEMPLATES held 35.
 *
 * ⚠️ PHYSICAL RISK IS BY REGION AND ASSET PROFILE, NOT BY SITE. The module asks for IPCC AR6 climate
 * reference regions and an asset profile category; it accepts no site list. app/dashboard/climate-risk
 * says so itself: "These follow the IPCC AR6 climate reference regions — each carries a distinct hazard
 * profile that drives your physical-risk results." Copy promising site-level mapping sends a reader
 * looking for a field that does not exist.
 *
 * ⚠️ THIS MODULE HAS NO VERIFIER SURFACE AND NO AUDIT LOG. EvidenceSection enforces that from
 * lib/modulePages.ts rather than trusting this page's copy. Checked against the migrations 25 Sep 2026:
 * audit_log triggers exist on ghg_inventories, cbam_production_processes and
 * cbam_installation_disclosures, and nowhere else.
 */
export default function ClimateRiskPage() {
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ──
      The module hue is a 4px top RULE and a wash, never text: the colourway is a fill value. Under the
      2026 colourway --color-module-climate becomes #004AAD, one of only two values that still clears
      3:1 — but the rule is followed here regardless of which value is live. docs/colourway-2026.md. */}
      <section style={{ borderTop: '4px solid var(--color-module-climate)', background: 'var(--color-module-climate-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>Climate Risk module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '26ch' }}>
            At last, climate risk reporting that holds up with a lender in the room.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '1.5rem' }}>
            Physical and transition risk, and the opportunities alongside them, across a range of climate
            futures. You do not need a risk register to start: the module builds one from a handful of
            short questions about your business. Built for SB 261, IFRS S2 and TCFD.
          </p>
          {/* ⚠️ IFRS_S2_ADOPTION_COUNT IS CARRIED WHOLE AND NEVER DECOMPOSED. lib/ifrsS2.ts exists
              because two ThemisIQ pages once said "30+" and "36+" for this, which were two different
              questions neither of them asked. Its comment: "a surface that wants '28' alone is asking
              for the figure that started this." If a layout cannot fit the string, the fitted
              alternative is IFRS_S2_SHORT, which names no number at all. Do not reach for the digits. */}
          <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, marginBottom: '2rem', maxWidth: '62ch' }}>
            {IFRS_S2_ADOPTION_COUNT}{' '}
            <span style={{ color: 'var(--color-ink-muted)' }}>{IFRS_S2_ADOPTION_SOURCE}</span>
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>Start the free assessment</a>
            <a href="/pricing" style={{ ...btnSecondary, textDecoration: 'none' }}>See pricing</a>
          </div>
        </div>
      </section>

      {/* ── 2. THREE WAYS PEOPLE ARRIVE ── */}
      <ModuleSection>
        <ModuleArrivals items={ARRIVALS} />
      </ModuleSection>

      {/* ── 3. WHAT IT COVERS ── */}
      <ModuleSection tinted>
        <h2 style={sectionTitle}>What the module covers</h2>
        <dl style={{ margin: '2rem 0 0', borderTop: '1px solid var(--color-line-strong)' }}>
          {COVERS.map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 16rem) 1fr', gap: '1.5rem', padding: '1.1rem 0', borderBottom: '1px solid var(--color-line)' }}>
              <dt style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.7 }}>{v}</dd>
            </div>
          ))}
        </dl>
      </ModuleSection>

      {/* ── 4. HOW IT WORKS ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>How it works</h2>
        <div style={{ marginTop: '2rem' }}>
          <ModuleSpine
            bring="Your industry, where you operate, your asset profile, the scenario and the horizon you report on. No existing risk register needed."
            applies="Recognised climate pathways, sector transition drivers and a consistent scoring method."
            get="A physical and transition risk register, a materiality matrix, topic-by-topic scores and a multi-scenario report, with every conclusion traceable to its basis."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ──
      ⚠️ The second paragraph is NOT a prop. EvidenceSection reads lib/modulePages.ts, so this page
      cannot assert a verifier surface it does not have. See the note at the top of the file. */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every risk score keeps the inputs and the method behind it, so a reviewer can see why a region scored as it did rather than taking the number on trust."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      Shared with app/cbam/page.tsx via ModuleOutputs. Both files here are in public/samples/; CBAM's
      output is a live page instead, which is why `kind` exists. */}
      <ModuleSection>
        <ModuleOutputs
          intro="Two reports from one assessment, both generated from your own answers. These are real outputs for a fictional company, not mock-ups."
          outputs={OUTPUTS}
        />
      </ModuleSection>

      {/* ── 7. WHAT IT SATISFIES ── */}
      <ModuleSection tinted>
        <h2 style={sectionTitle}>What it satisfies</h2>
        <p style={{ ...bodyCopy, margin: '1rem 0 1.75rem' }}>
          Each of these is described, sourced and mapped to a module on the regulations page.
        </p>
        <FrameworkChips names={FRAMEWORKS} />
      </ModuleSection>

      {/* ── 8. PRICING ── */}
      <ModuleSection>
        <p style={moduleEyebrow}>Pricing</p>
        <h2 style={sectionTitle}>Start with Climate Risk.</h2>
        {/* The multi-module discount is named here exactly as the checkout names it, and the figures
            are worded exactly as the pricing and homepage heroes word them. This page is the only
            module marketing page that quotes the discount at all, so it had drifted furthest:
            "bundle to save" described a bundle the product removed on 23 Jul 2026. */}
        <p style={{ ...bodyCopy, marginTop: '1rem' }}>
          A complete TCFD-aligned climate risk assessment, at one flat annual price. Add modules and the
          multi-module discount applies automatically: two modules −10%, three or more −20%.
        </p>
        {/* ⚠️ "screening", NOT "materiality". The feature read "Single + double materiality
            (IFRS S2 · CSRD/ESRS)" — a claim of full coverage in a priced feature list, which is the
            one place a buyer reads as a promise about what they are paying for. What this module does
            is score the ten topics from industry baselines; what it does not do is the stakeholder
            engagement ESRS requires on the impact side. One word carries that, and it is the module's
            own word: the sample is titled "Double Materiality SCREENING Report" and /methodology calls
            it "a structured screening intended to scope and support".
            ⚠️ THE CARD IS NO LONGER A FILLED DARK PANEL, and that is two fixes rather than a restyle.
            The token layer's opening line says there are no filled dark panels in this system. And its
            call-to-action was #0d0d0d text on var(--color-brand), measuring 2.55:1 — below AA, on the
            one button a buyer presses to pay. Its ticks were #64fe3e, the retired gradient lime. */}
        <div style={{ maxWidth: 420, marginTop: '2.5rem' }}>
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-climate)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>Climate Risk</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${FLAT_MODULE_PRICES[KEY].toLocaleString()}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}> / reporting year</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {[
              'Physical and transition risk assessment',
              'Materiality screening, both axes, ten ESRS topics (IFRS S2 · CSRD/ESRS)',
              'Several IPCC scenario pathways',
              'TCFD-aligned report structure',
              'IFRS S2 · CSRD ESRS E1 · SB 261 mapping',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'var(--color-state-ok)', flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>{f}</span>
              </div>
            ))}
            <a href="/pricing" style={{ ...btnPrimary, textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: '1.5rem' }}>
              See pricing
            </a>
          </div>
        </div>
      </ModuleSection>

      {/* ── 9. FOUR QUESTIONS ── */}
      <ModuleSection tinted>
        <ModuleFaq items={FAQ} />
      </ModuleSection>

      {/* ── 10. CLOSING BAND ── */}
      <ClosingBand
        heading="Not sure whether climate risk reporting applies to you yet?"
        body="Three questions, no account needed. The free assessment lists the regulations your company is likely to face, country by country."
        primary={{ href: '/assess', label: 'Start the free assessment' }}
        secondary={{ href: '/advisory', label: 'Talk to us' }}
      />
      <div style={{ height: 4, background: 'var(--gradation-band)' }} />

      <Footer />
    </div>
  )
}

// ── DATA ──────────────────────────────────────────────────────────────────────────────────────────
const ARRIVALS = [
  { title: 'You have never done this before',
    body: 'There is no risk register, no scenario work, and no obvious place to start. This module begins with a few questions about your business and produces the register for you.' },
  { title: 'A regulation applies',
    body: 'California SB 261, CSRD or national regulations apply and you need to submit your first report.' },
  { title: 'An investor, lender or board asked',
    body: 'Someone wants to know how resilient the business is under different climate futures. Now is the right time to identify your material risks and opportunities.' },
] as const

/**
 * ⚠️ "BY IPCC AR6 REGION AND ASSET PROFILE", NOT "mapped to your sites and assets". The module takes
 * IPCC AR6 climate reference regions and an asset profile category. It accepts no site list, so the
 * earlier wording sent a reader looking for a field that does not exist.
 */
const COVERS = [
  ['Physical risk', 'Acute and chronic hazards by IPCC AR6 region and asset profile.'],
  ['Transition risk and resilience', 'Policy, market, technology and reputation, by sector, and what the business would do about them.'],
  ['Climate opportunities', 'The TCFD five categories, scored for your industry and weighted by scenario.'],
  ['Scenario analysis', 'Several futures rather than one, with the assumptions recorded.'],
] as const

/** Both files are in public/samples/. A module with no output omits the section entirely. */
const OUTPUTS: readonly ModuleOutput[] = [
  { kind: 'document', title: 'Climate resilience report', href: '/samples/magnetic-industrial-s2-climate-resilience.pdf',
    body: 'Physical and transition risk across the scenario range, with the resilience conclusion and the basis for each classification.' },
  { kind: 'document', title: 'Double materiality screening report', href: '/samples/magnetic-industrial-csrd-double-materiality.pdf',
    body: 'The ten ESRS topics scored on both axes, with the matrix and the per-topic reasoning.' },
]

const FRAMEWORKS = ['SB 261', 'IFRS S2', 'TCFD', 'ESRS E1'] as const

/**
 * ⚠️ THE SB 261 ANSWER SAYS NO, AND IT HAS TO. The module's own output footer reads: "Screening output,
 * built on IPCC AR6 climatic impact-drivers, TCFD risk and opportunity categories … This is a
 * structured first pass to scope a formal assessment, not a disclosure." A marketing page answering
 * "yes" would contradict the product's own disclaimer to the same customer.
 *
 * ⚠️ THE POSTURE IS SB261_STATUS_SENTENCE, VERBATIM, AND IS NOT COMPOSED HERE. lib/sb261.ts says a
 * surface needing more than the short forms "does not invent a third form" — four spellings of this
 * posture is what that file was created to end. It carries em-dashes; quoting a constant verbatim is
 * not writing copy, and trimming them would make this a fifth spelling.
 *
 * ⚠️ "Advisors are available" — a person. Never "human-led", which is a product claim wearing a
 * person's clothes.
 */
const FAQ: readonly Faq[] = [
  { q: 'We do not have a risk register. Can we still use this?',
    a: 'Yes. There is nothing to import. You start from your industry, your operating regions and your asset profile, and the module produces the register. Most companies using it have never done a climate risk assessment before.' },
  { q: 'Does this cover opportunities as well as risks?',
    a: 'Yes, across the five TCFD categories: resource efficiency, energy source, products and services, markets, and resilience. They are scored for your industry and weighted by scenario, and they render separately from risks so the two are never confused.' },
  { q: 'Does this satisfy SB 261 on its own?',
    a: 'No, and the module says so in its own output. What it produces is a structured first pass built on IPCC AR6 climatic impact-drivers and the TCFD categories, to scope a formal assessment rather than to file. Advisors are available if you want the assessment taken further.',
    extra: SB261_STATUS_SENTENCE },
  { q: 'Can we pair it with the Materiality Assessment for CSRD?',
    a: `${CSRD_BOTH_HALVES} This module has a CSRD mode that adds an impact step and the ESRS topics.` },
]
