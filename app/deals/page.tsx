import type { Metadata } from 'next'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import { NEAR_BAND_PCT, FX_AS_OF } from '@/lib/deals/assessment'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection,
  ModuleArrivals, ModuleFaq, bodyCopy, moduleEyebrow, type Faq,
} from '@/app/components/modulePage'

const KEY = 'deals' as const

export const metadata: Metadata = {
  title: 'Sustainability Diligence for M&A: Threshold Screening | ThemisIQ',
  description:
    'Test what a target company owes across SB 253, SECR, Canada S-211, CSRD and CS3D. Each limb tested separately, with near-threshold flagging and an investment committee pack.',
  alternates: { canonical: '/deals' },
}

/**
 * The Deals and Investment module page, fifth to the shared ten-section shape.
 *
 * ⚠️ THE THRESHOLD ENGINE DOCUMENTS ITS OWN DIVERGENCES FROM THE STATUTES IT IMPLEMENTS, AND THIS PAGE
 * MUST NOT OUT-CLAIM IT. lib/deals/assessment.ts records, per regime, which limbs it tests, which routes
 * it does not model, and where a single input stands in for a measure the law defines differently. Those
 * are in the near-threshold answer below, as named lines rather than a paragraph, because every one of
 * them can produce a wrong answer in the direction of COMPLACENCY — the dangerous direction in diligence.
 *
 * ⚠️ FIVE REGIMES, COUNTED BY THE PARSER AND NOT BY GREP. THRESHOLD_TESTS holds SB 253, SECR,
 * Canada S-211, CSRD and CS3D, all active. A grep for the keys returned FOUR on 26 Sep 2026 because the
 * character class used to match them excluded the hyphen in "Canada S-211" — the third instance of that
 * blind spot in docs/backlog.md, whose recorded remedy is to assert the parse's own count rather than to
 * write a better class. Object.keys(THRESHOLD_TESTS).length returned 5 immediately.
 *
 * ⚠️ getComplianceCost's `low`/`high` ARE DELIBERATELY NOT ON THIS PAGE. They are a RISK-EXPOSURE figure
 * for the dashboard's "ESG value-at-risk exposure" block, and that function's own comment records that a
 * cost framing was already removed from them once ("the old Math.max(7500/25000) floors were a
 * cost-framing artifact"). The cost claim here rests on CONSULTANT_RANGES and the itemised ranges, which
 * are what the equivalent work costs to BUY ELSEWHERE — not ThemisIQ's fee, and not a quote.
 *
 * ⚠️ DEFAULT_PIPELINE_TARGETS IS NOT ON THIS PAGE EITHER. Its own comment: "DASHBOARD-ONLY … Display-only
 * — never enters any per-deal figure. Not used on the public /deals/[token] page (wrong audience)." It is
 * an ROI illustration, not a limit, and a marketing page would read it as one.
 */
export default function DealsPage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ── */}
      <section style={{ borderTop: '4px solid var(--color-module-deals)', background: 'var(--color-module-deals-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>Deals and Investment module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '28ch' }}>
            Evaluate what a target company owes before you buy it, or arrive at your own sale already prepared.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            For M&amp;A, family offices and companies getting ready to sell. Which rules apply, from what
            year, and what they cost to meet. Run it on a target before you buy, or on yourself before you
            are asked.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>Start the free assessment</a>
            <a href={`/order?modules=${KEY}`} style={{ ...btnSecondary, textDecoration: 'none' }}>Order the module, ${price}/yr</a>
          </div>
        </div>
      </section>

      {/* ── 2. HOW PEOPLE ARRIVE ── */}
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
            bring="Turnover, balance sheet, headcount and where the business operates and sells."
            applies="Each rule's own test, using thresholds kept in one place and updated when the law changes."
            get="A defensible answer on what applies and from when, in a pack you can put in front of a committee."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ── */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every answer shows you why: which part of the test applied, and the figure that decided it."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      Absent: there is no sample IC pack in public/samples/ and no preview route for one. */}

      {/* ── 7. WHAT IT SATISFIES ──
      ⚠️ EXACTLY THE FIVE REGIMES THRESHOLD_TESTS HOLDS. IFRS S2 was in this row and is not a
      threshold-gated regime, so listing it implied a test that does not exist; Canada S-211 and CS3D are
      tested and were missing. Naming what the engine does not do is the more expensive half of the error. */}
      <ModuleSection>
        <h2 style={sectionTitle}>What it satisfies</h2>
        <p style={{ ...bodyCopy, margin: '1rem 0 1.75rem' }}>
          The regimes the threshold engine tests. Each is described, sourced and mapped to a module on the
          regulations page.
        </p>
        <FrameworkChips names={FRAMEWORKS} />
      </ModuleSection>

      {/* ── 8. PRICING ── */}
      <ModuleSection tinted>
        <p style={moduleEyebrow}>Pricing</p>
        <h2 style={sectionTitle}>One flat annual price.</h2>
        <p style={{ ...bodyCopy, marginTop: '1rem' }}>
          Screen as many targets as you like. Add modules and the multi-module discount applies
          automatically: two modules −10%, three or more −20%.
        </p>
        <div style={{ maxWidth: 420, marginTop: '2.5rem' }}>
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-deals)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>Deals and Investment</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${price}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}> / reporting year</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {[
              'Threshold testing across five regimes, each limb separately',
              'Near-threshold flagging where a marginal figure decides the answer',
              'An indicative cost of meeting what applies',
              'An investment committee pack',
              'A pipeline export for a portfolio',
            ].map(f => (
              <div key={f} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ color: 'var(--color-state-ok)', flexShrink: 0 }}>✓</span>
                <span style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.55 }}>{f}</span>
              </div>
            ))}
            <a href={`/order?modules=${KEY}`} style={{ ...btnPrimary, textDecoration: 'none', display: 'block', textAlign: 'center', marginTop: '1.5rem' }}>
              Order the module
            </a>
          </div>
        </div>
      </ModuleSection>

      {/* ── 9. THE QUESTIONS ── */}
      <ModuleSection>
        <ModuleFaq items={FAQ} />
      </ModuleSection>

      {/* ── 10. CLOSING BAND ── */}
      <ClosingBand
        heading="Not sure what a target owes?"
        body="Three questions, no account needed. The free assessment lists the regulations a company is likely to face, country by country."
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
  { title: 'You are buying',
    body: 'Diligence has reached sustainability and nobody can say what the target owes.' },
  { title: 'You are selling',
    body: 'You would rather find the obligations yourself than have a buyer find them.' },
  { title: 'You hold a portfolio',
    body: 'Knowing which companies in it have reporting obligations, under which rules, and from when, is now part of managing it.' },
] as const

/**
 * ⚠️ THE QUALIFIER ON THE FIRST ROW IS SCOPED PER REGIME, NOT APPLIED TO ALL FIVE. An earlier draft said
 * the model states unrun parts of "a test", which reads as all of them. Measured from THRESHOLD_TESTS:
 *   exhaustive: false          CS3D only
 *   lookbackModelled: false    CS3D and Canada S-211
 *   comparison 'gte'           CSRD only; the other four use 'gt'
 * A qualifier that over-applies is its own small over-claim, in the opposite direction, and on a page
 * about defensibility it costs more than it saves.
 *
 * ⚠️ THE COST ROW NAMES WHOSE COST IT IS. CONSULTANT_RANGES holds what the equivalent workstreams cost to
 * buy elsewhere, with its own sourcing note ending "Indicative benchmarks, not quotes — refresh
 * periodically". Beside a pricing section, "a cost estimate" would read as ThemisIQ's fee, which is the
 * opposite of what that constant holds.
 *
 * ⚠️ "CONVERTED AT A DATED RATE THAT IS CITED ON THE ANSWER", NOT "currency conversion". FX_SOURCE names
 * the ECB reference-rate PDF and FX_AS_OF its date, and the report carries both. The dating is the claim.
 */
const COVERS = [
  ['Threshold testing', 'Across SB 253, SECR, Canada S-211, CSRD and CS3D, each limb tested separately. Where a regime has routes the model does not run, or reads one financial year where the law asks for two, the answer says so rather than letting you assume they passed.'],
  ['Borderline companies', `A figure within ${NEAR_BAND_PCT} of a limb is flagged rather than guessed, and currency is converted at a dated rate that is cited on the answer.`],
  ['Indicative cost', 'An indicative cost of meeting what applies, benchmarked against what the equivalent consultant workstreams cost, refreshed rather than quoted.'],
  ['Committee output', 'An investment committee pack, and a pipeline export for a portfolio.'],
] as const

/** Exactly the keys of THRESHOLD_TESTS. Five, all active. */
const FRAMEWORKS = ['SB 253', 'SECR', 'Canada S-211', 'CSRD', 'CS3D'] as const

/**
 * ⚠️ NO ANSWER HERE MAY IMPLY THAT A NOT-MET IS A CLEARANCE. Two places could be misread and both say it
 * outright: the near-threshold extra, for CS3D's unmodelled routes, and the non-EU answer, which says a
 * non-EU target is "neither cleared nor resolved". lib/deals/assessment.ts is explicit that
 * 'not-applicable' is "a false negative, the worse error in diligence", and this page inherits that.
 *
 * ⚠️ NO DURATION IS CLAIMED IN THE FIRST ANSWER. There is no constant for one and none was invented. The
 * list of inputs carries the sense of "short" without asserting a number, the same technique as GHG's
 * "a handful of short questions".
 *
 * ⚠️ THE THIRD ANSWER DESCRIBES A USE, NOT A MODE. There is no self-assessment feature: the form is
 * target-shaped and the engine does not distinguish a target from the entrant. Wording that implied a
 * mode would be promising a screen that does not exist.
 */
const FAQ: readonly Faq[] = [
  { q: 'How long does a screen take?',
    a: 'As long as it takes to enter a handful of figures about the company: turnover, total assets, headcount, sector, primary jurisdiction, deal value, location count and currency. The answer comes back from those, so there is nothing to send away and nothing to wait for. What takes longer is finding the figures, and where one is missing the screen names it rather than proceeding without it.' },
  { q: 'What if the target is close to a threshold?',
    a: `It is flagged rather than answered. A figure within ${NEAR_BAND_PCT} of a limb's own threshold is marked marginal, and the framework is marked near-threshold only where that marginal limb is the one deciding the outcome, so a borderline figure that could not change the answer does not raise a false alarm. The boundary is inclusive: exactly at the band counts as marginal.`,
    extra: [
      'A screen also states the parts of a test it did not run, rather than letting you assume they passed. Four it will tell you about:',
      'CS3D scope. It tests the employee and turnover route only, so a company below those limbs is outside that route rather than outside the Directive. It also does not apply the exclusions that remove funds from scope regardless of size.',
      'Two-year lookback. For CS3D and Canada S-211 it reads one financial year where the law asks for two consecutive years, so a company that crossed once is reported as crossing.',
      'SB 253 measure. California measures gross receipts with no deduction for cost of goods sold. The figure you enter is revenue, which is materially smaller for a distributor.',
      `Currency. Converted at the European Central Bank reference rate for ${FX_AS_OF}, cited on the answer rather than applied silently.`,
    ] },
  { q: 'Can we run this on our own company?',
    a: 'Yes, and it is the same screen. The test does not care whose figures they are, so entering your own gives you the answer a buyer would get before they ask for it. That is the point of running it while you are preparing to sell rather than after somebody else has found something.' },
  { q: 'Does it cover non-EU targets?',
    a: 'Yes, and the useful part of the answer is where it stops. SB 253, SECR and Canada S-211 are tested wherever the company sits, because their tests turn on figures the screen collects. For CSRD and CS3D a non-EU target is neither cleared nor resolved: both measure turnover generated in the European Union, the screen collects worldwide revenue, and no conversion turns one into the other, so the answer abstains and says which figure it would need. In diligence a false negative is the worse error, because a buyer told a statute does not apply stops looking.' },
]
