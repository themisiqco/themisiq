import type { Metadata } from 'next'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection,
  ModuleArrivals, ModuleFaq, bodyCopy, moduleEyebrow, type Faq,
} from '@/app/components/modulePage'

const KEY = 'people' as const

export const metadata: Metadata = {
  title: 'Workforce Disclosure: Pay Gaps, Safety and Training | ThemisIQ',
  description:
    'Turn the data your HR system already holds into the workforce disclosures ESRS S1, EU Pay Transparency and the GRI 400 series ask for, with a record of what was excluded and why.',
  alternates: { canonical: '/people' },
}

/**
 * The People and Workforce module page, seventh and last to the shared ten-section shape.
 *
 * ⚠️ FOUR LINES ARE HELD. See HELD_LINES below. They are the only thing waiting on this page, and one of
 * them is the module's central argument, so the version that ships is written to be strong rather than to
 * be a placeholder.
 *
 * ⚠️ "DFEH" DOES NOT APPEAR ON THIS PAGE ANY MORE, AND IT USED TO APPEAR EIGHT TIMES. The Department of
 * Fair Employment and Housing became the CALIFORNIA CIVIL RIGHTS DEPARTMENT in 2022. lib/sources.ts had
 * it right all along; this page and the People dashboard's framework picker did not. The picker was fixed
 * in the same commit as this rebuild, because it was the one occurrence a rebuild would not have removed.
 *
 * ⚠️ SEC ITEM 101 AND SASB ARE NOT IN THE FRAMEWORKS ROW, AND THAT IS DELIBERATE. SEC Item 101 is a real
 * OBLIGATIONS entry mapped to this module, but its `does` line records that the module supplies THREE OF
 * THE FOUR figures the 10-K human capital section reports: "Turnover is not collected and has to come
 * from your HR system", and what it records is training HOURS, not spend. Naming it in a chips row
 * without that sentence invites a buyer to infer the module fills the whole section. If it goes in, the
 * sentence goes with it. `UN SDG 8` and `ISO 45001` were on the old page and have no backing in lib/ or
 * the module at all, so they are simply gone.
 *
 * ⚠️ --color-module-people IS IDENTITY_ONLY AND #FFDE59 IS THE WORST VALUE IN THE SET: 1.33:1 on paper,
 * below even the 3:1 non-text threshold. The hue is used here as a 4px rule and a wash only, which is
 * fill-only and inside that decision. The rule is built as specced so it can be judged on screen — if it
 * is invisible at that ratio, no rule is more honest than a rule nobody can see, and that is a decision
 * to take with it rendered rather than from the ratio. Note also there is no incoming People wash in
 * docs/colourway-2026.md, so --color-module-people-wash stays today's value until the swap derives one.
 */
export default function PeoplePage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ── */}
      <section style={{ borderTop: '4px solid var(--color-module-people)', background: 'var(--color-module-people-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>People and Workforce module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '26ch' }}>
            Pay gaps, headcount, safety and training, from the data your HR system already holds.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          {/* HELD LINE 1 of 4 — see HELD_LINES. Was "counted their way rather than yours". */}
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            Your HR system tracks your people. This turns that data into the workforce disclosures
            sustainability frameworks and customer questionnaires ask for, in the form each one asks for
            it.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>Start the free assessment</a>
            <a href={`/order?modules=${KEY}`} style={{ ...btnSecondary, textDecoration: 'none' }}>Order the module, ${price}/yr</a>
          </div>
        </div>
      </section>

      {/* ── NOT AN HR PLATFORM ──
      The argument the module rests on, above the covers rows as specced. It sits on the 4px TOP rule
      that the EDGE VOCABULARY reserves for semantic state, not the 6px left bar that means module
      identity: this is a statement about what the product is, not about which product you are in.
      HELD LINE 2 of 4 — the "same headcount counted two ways" sentence is not here. See HELD_LINES. */}
      <ModuleSection>
        <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-state-info)', borderRadius: 6, padding: '1.75rem 2rem', maxWidth: '72ch' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-state-info)', marginBottom: '0.75rem' }}>
            Not an HR platform
          </p>
          <p style={{ ...bodyCopy, margin: 0 }}>
            Keep your HR system. This takes what it holds and answers the questions that come from
            sustainability frameworks and customer questionnaires. An HR system reports your workforce to
            you. This reports it to a framework&rsquo;s requirements, which is a different job and the one
            nobody has done for you.
          </p>
        </div>
      </ModuleSection>

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

      {/* ── 4. HOW IT WORKS ──
      HELD LINE 4 of 4 is the `applies` value. See HELD_LINES. */}
      <ModuleSection>
        <h2 style={sectionTitle}>How it works</h2>
        <div style={{ marginTop: '2rem' }}>
          <ModuleSpine
            bring="HR exports, payroll bands, incident logs and training records."
            applies="What each framework asks for, in the form it asks for it, with a record of what was excluded and why."
            get="Disclosure-ready tables for each framework, a gap analysis, and a record of what was excluded and why."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ── */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every figure keeps the export it came from and the basis it was assembled on, so a number in a disclosure can be traced back to the record behind it rather than to a spreadsheet somebody rebuilt."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      Absent: no sample workforce disclosure in public/samples/, and no preview route. */}

      {/* ── 7. WHAT IT SATISFIES ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>What it satisfies</h2>
        <p style={{ ...bodyCopy, margin: '1rem 0 1.75rem' }}>
          Each of these is described, sourced and mapped to a module on the regulations page.
        </p>
        <FrameworkChips names={FRAMEWORKS} />
      </ModuleSection>

      {/* ── 8. PRICING ── */}
      <ModuleSection tinted>
        <p style={moduleEyebrow}>Pricing</p>
        <h2 style={sectionTitle}>One flat annual price.</h2>
        <p style={{ ...bodyCopy, marginTop: '1rem' }}>
          Add modules and the multi-module discount applies automatically: two modules −10%, three or
          more −20%.
        </p>
        <div style={{ maxWidth: 420, marginTop: '2.5rem' }}>
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-people)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>People and Workforce</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${price}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}> / reporting year</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {[
              'Headcount and workforce composition',
              'Pay gap analysis, with the basis for every figure kept',
              'Health and safety incidents and rates',
              'Training and development',
              'A record of what was excluded and why',
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
        heading="Not sure which workforce rules apply to you?"
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
/**
 * ⚠️ FOUR HELD LINES, AND THEY ARE THE ONLY THING WAITING ON THIS PAGE. All four assert that the module
 * counts a measure to each framework's OWN DEFINITION, which is the module's central argument and the most
 * checkable claim on the page. As written they were:
 *
 *   1. hero paragraph   "...ask for, counted their way rather than yours."
 *   2. Not an HR platform  "The same headcount counted two ways gives two answers, and only one of them
 *                           is the one the framework asked for."
 *   3. covers row       "Headcount and workforce composition, counted to each framework's own definition."
 *   4. spine `applies`  "Each framework's own definitions and boundaries, and a record of which was used
 *                           for every figure."
 *
 * THE MEASUREMENT BEHIND THE HOLD, taken in app/dashboard/people/page.tsx on 26 Sep 2026: ZERO
 * occurrences of `definition`, `boundary`, `headcount_basis` or `counted`. What the module does have is a
 * six-framework picker whose own copy reads "ThemisIQ will tailor your data collection and outputs to
 * cover every requirement" — which is a claim about WHAT IS COLLECTED AND EXPORTED, not about how a
 * measure is defined. Selecting ESRS S1 changes the fields and the output; nothing visible gives ESRS S1
 * a headcount basis distinct from GRI's.
 *
 * ⚠️ THIS IS PRODUCT KNOWLEDGE, NOT A CODE GAP NECESSARILY. The definitions may live in the collection
 * fields without the word ever appearing. If Lisa can point at where they live, ALL FOUR GO BACK IN ONE
 * EDIT and this comment goes with them.
 *
 * WHAT SHIPPED INSTEAD IS NOT A PLACEHOLDER. "In the form each one asks for it", "an HR system reports
 * your workforce to you, this reports it to a framework's requirements", and "a record of what was
 * excluded and why" are all supportable and are a real argument: one data set, several frameworks'
 * questions, each export shaped to the asker. The exclusion record is the strongest of the three, because
 * it is the part an auditor asks about and the part a spreadsheet never has.
 */
const ARRIVALS = [
  { title: 'A pay transparency requirement applies',
    body: 'And the first report needs numbers nobody has assembled in that form before.' },
  { title: 'A customer questionnaire asked about your workforce',
    body: 'And the answers have to match what you would disclose elsewhere.' },
  { title: 'You report under CSRD',
    body: 'And ESRS S1 asks for workforce data on its own terms rather than yours.' },
] as const

/** HELD LINE 3 of 4 is the first row's body. See the block above. */
const COVERS = [
  ['Headcount and composition', 'Assembled for each framework you report under, from the exports your HR system already produces.'],
  ['Pay gap analysis', 'With the basis for every figure kept, so a number in a filing can be explained a year later.'],
  ['Health and safety', 'Incidents and rates, including the ones a questionnaire asks for by name.'],
  ['Training and development', 'Recorded as hours, which is the measure the disclosures ask for.'],
] as const

const FRAMEWORKS = ['ESRS S1', 'EU Pay Transparency', 'GRI 400 series', 'CSRD'] as const

/**
 * ⚠️ DRAFTED FROM THE CODE, AWAITING REVIEW, like the AI Governance four.
 *
 * ⚠️ THE FOURTH ANSWER IS THE OLD PAGE'S ARGUMENT, KEPT. It named Workday, SAP and SuccessFactors and
 * said none of them generates an EU Pay Transparency disclosure or an ESRS S1 workforce report. That is
 * the true and useful form of the comparison, and it survives the rebuild in this answer rather than in a
 * competitor table.
 *
 * ⚠️ THE SECOND ANSWER DOES NOT SAY WHETHER YOU MUST PUBLISH. Whether a pay gap is published, and where,
 * differs by regime and by employer size, and nothing in lib/ resolves it for a given reader. So the
 * answer says what the module does and sends the question to /assess, which is what /assess is for.
 *
 * ⚠️ THE THIRD ANSWER IS THE ONE TO REVISIT IF THE HELD LINES GO BACK IN. "Which employees count" is
 * exactly the per-framework-definition question, and the answer below is deliberately about the module's
 * exclusion record rather than about differing definitions.
 */
const FAQ: readonly Faq[] = [
  { q: 'Our HR data is messy. Is that a problem?',
    a: 'It is the normal starting point. You bring the exports you already have, and where a figure is missing or a record does not reconcile it is flagged rather than filled in, so what you publish is what your data supports. Cleaning it up is usually a by-product of the first report rather than a prerequisite for starting.' },
  { q: 'Do we have to publish our pay gap?',
    a: 'That depends on which requirement reaches you and how large you are, and it is the sort of question the free assessment answers for your company rather than in general. What the module does either way is produce the analysis with the basis for every figure kept, so you are ready to publish if you must and able to explain the number if you are asked.' },
  { q: 'Which employees count?',
    a: 'Whoever the framework you are reporting under includes, which is rarely the same as the headcount on your payroll run. The module keeps a record of what was excluded and why, so the figure you disclose can be reconciled against your HR system rather than quietly differing from it.' },
  { q: 'We already use Workday. Do we need this?',
    a: 'Keep Workday. It manages your people, and it is not built to produce an EU Pay Transparency disclosure or an ESRS S1 workforce report. This takes its exports and assembles them into what those frameworks ask for, with the working kept. The same is true of SAP and SuccessFactors.' },
]
