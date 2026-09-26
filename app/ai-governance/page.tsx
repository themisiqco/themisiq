import type { Metadata } from 'next'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import { AI_ACT_HIGH_RISK_SENTENCE, AI_ACT_ALREADY_APPLIES_SENTENCE, AI_ACT_CITATION } from '@/lib/aiAct'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection,
  ModuleArrivals, ModuleFaq, bodyCopy, moduleEyebrow, type Faq,
} from '@/app/components/modulePage'

const KEY = 'ai-governance' as const

export const metadata: Metadata = {
  title: 'AI Governance: Model Inventory and EU AI Act Classification | ThemisIQ',
  description:
    'A model inventory and risk classification against the EU AI Act Annex III categories, with the basis for every classification recorded and recomputed against current guidance.',
  alternates: { canonical: '/ai-governance' },
}

/**
 * The AI Governance module page, sixth to the shared ten-section shape.
 *
 * ⚠️ NO AI ACT DATE IS TYPED ON THIS PAGE, AND THIS FILE IS WHY THE RULE EXISTS. lib/aiAct.ts holds the
 * dates because they once lived as "SEVEN INDEPENDENT LITERALS IN FOUR SPELLINGS across four files", so
 * a deferral enacted SIX DAYS before the deadline changed none of them. Its rule: "ANY SURFACE NAMING AN
 * AI ACT HIGH-RISK DATE IMPORTS FROM HERE. A literal in copy is the defect."
 *   AND THE SPLIT-DATE TRAP WAS THIS PAGE. lib/aiAct.test.ts's KNOWN LIMIT note records that the stat
 * tile here held `{ val: '2 Dec', unit: '2027' }`, which contains no forbidden substring while rendering
 * as a hardcoded date, and that it was caught by the sibling guard in lib/cs3d.test.ts on 10 Aug 2026.
 * "THE DEFENCE IS DERIVATION, NOT A LONGER PATTERN LIST." So this page renders
 * AI_ACT_HIGH_RISK_SENTENCE whole and slices nothing.
 *
 * ⚠️ THE DATES ARE HIGH-RISK ONLY, AND SAYING SO IS NOT A CAVEAT BUT THE POINT. lib/aiAct.ts warns: "do
 * not let this file's existence imply the whole Regulation shifted." A page carrying only the high-risk
 * dates tells a reader they have years when parts of the Regulation already bind them, so this page
 * renders AI_ACT_ALREADY_APPLIES_SENTENCE beneath AI_ACT_HIGH_RISK_SENTENCE. BOTH ARE IMPORTED WHOLE.
 *   The four dates that did not move were LITERALS HERE until 26 Sep 2026, in a local constant. They are
 * now AI_ACT_PROHIBITIONS_FROM, AI_ACT_NEW_PROHIBITIONS_FROM, AI_ACT_GPAI_FROM and
 * AI_ACT_ARTICLE_50_POSTURE, and lib/aiAct.test.ts's FORBIDDEN list now names the three dates so this
 * cannot come back. The Article 50 one is a POSTURE, not a date, because that date is nowhere in the repo
 * and a guessed one would look sourced.
 *
 * ⚠️ TWO COVERS ROWS ARE HELD, AND THEY ARE THE ONLY THING WAITING ON THIS PAGE. See HELD_ROWS below.
 *
 * ⚠️ "RECOMPUTED, NOT FROZEN" IS THE MODULE'S REAL EVIDENCE CLAIM. parseAIDraft in
 * app/dashboard/ai-governance/page.tsx recomputes risk_level, annex_category and requirements from
 * classifySystem() rather than reading them, because "the classifier tracks EU AI Act guidance and its
 * output changes, so a stored classification can be one this build would not make." What persists is the
 * inputs and the basis, not a verdict, and that is a stronger claim than a recorded classification.
 *
 * ⚠️ NO CATALOGUE COUNT. The dashboard says "34 common AI systems with auto-classification"; that figure
 * is not restated here, because a seeded-catalogue size is exactly the number that goes stale quietly.
 */
export default function AiGovernancePage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ──
      Module hue as a 4px rule and a wash only. ⚠️ --color-module-ai IS IDENTITY_ONLY in
      lib/modulePages.ts: it gets no -ink companion, because its AA-passing companion measures 1.28:1
      against --color-state-error and a module accent that reads as an error is worse than none. Fill
      use is inside that decision; text use would not be. */}
      <section style={{ borderTop: '4px solid var(--color-module-ai)', background: 'var(--color-module-ai-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>AI Governance module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '28ch' }}>
            Know what AI is in your business, who is accountable for it, and what you would tell a customer, an auditor or a regulator.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            A model inventory, a risk register and the policy set behind them, mapped to the EU AI Act,
            NIST AI RMF and ISO 42001.
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
            bring="A list of the systems you use or build, and who owns each."
            applies="The classification each framework uses, so what you enter once serves the AI Act inventory, the risk register and your policy set."
            get="An inventory, a risk register and a policy set you can send to a customer."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ── */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every classification records the basis it was made on, and is recomputed against current guidance rather than left frozen."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      Absent: no sample inventory or policy set in public/samples/, and no preview route. */}

      {/* ── 7. WHAT IT SATISFIES ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>What it satisfies</h2>
        <p style={{ ...bodyCopy, margin: '1rem 0 1.75rem' }}>
          Each of these is described, sourced and mapped to a module on the regulations page.
        </p>
        <FrameworkChips names={FRAMEWORKS} />
        {/* ⚠️ THE SENTENCE IS RENDERED WHOLE, NOT SLICED. It carries BOTH dates because, as lib/aiAct.ts
            puts it, "a surface that states one date for high-risk is wrong for half its readers". The
            paragraph beneath it is the other half of the honesty: those dates are high-risk only. */}
        <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.7, marginTop: '1.75rem', maxWidth: '68ch' }}>
          {AI_ACT_HIGH_RISK_SENTENCE}
        </p>
        <p style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.7, marginTop: '0.75rem', maxWidth: '68ch' }}>
          {AI_ACT_ALREADY_APPLIES_SENTENCE}
        </p>
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
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-ai)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>AI Governance</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${price}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}> / reporting year</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {[
              'Model inventory: what is in use, by whom, for what',
              'Risk classification against the AI Act Annex III categories',
              'Requirements for each system, from its classification',
              'An inventory export you can send to a customer',
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
        heading="Not sure whether the AI Act reaches you?"
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
  { title: 'Enterprise procurement asked',
    body: 'A customer wants to understand how you govern AI before they sign, and a clear answer moves the deal along.' },
  { title: 'The EU AI Act applies to you',
    body: 'You use or provide a system within its scope, and the obligations are workable once you know which ones are yours.' },
  { title: 'Your board asked',
    body: 'What AI is in use, who owns it, and what happens if it goes wrong.' },
] as const

/**
 * ⚠️ TWO ROWS ARE HELD AND ARE THE ONLY THING WAITING ON THIS PAGE:
 *
 *   'A risk register structured to NIST AI RMF'
 *   'Policies and controls organised to ISO 42001'
 *
 * WHY THEY ARE NOT HERE. Measured in app/dashboard/ai-governance/page.tsx on 26 Sep 2026:
 *   EU AI Act      strongly supported — Annex III categories with section citations (§2, §3, §4, §5a,
 *                  §5b), four risk tiers on the export (Prohibited / High-risk (Annex III) / Limited /
 *                  Minimal), a Requirements step, and recomputed classification.
 *   NIST AI RMF    partial — Govern appears 4 times, Map once, Manage once, and MEASURE NOT AT ALL.
 *                  One of the framework's four functions is absent, so "structured to NIST AI RMF"
 *                  claims a structure a reader could check and not find.
 *   ISO 42001      ZERO occurrences in the module. It is on /frameworks and in Nav, but nothing in the
 *                  module names a clause, a control or an Annex A reference.
 *
 * ⚠️ THIS IS A QUESTION FOR LISA, NOT A GREP. The policy set may map to ISO 42001 in content that is not
 * in this repo, and the register may follow the RMF functions without naming them. Both rows go in as
 * written the moment that is confirmed. What must not happen is either row shipping on the assumption
 * that a chip on /frameworks is evidence: that chip's own justification is "AI management-system controls
 * and documentation", which is a description of intent rather than of a mapping.
 *
 * The frameworks CHIPS below still name all three, and that is deliberate and consistent: /frameworks
 * lists ISO 42001 for this module, so removing it here would make two surfaces disagree. A chip says
 * "this is the standard we work to". A covers row says "here is the structure you will find", and only
 * the second is a checkable claim about the product's shape.
 */
const COVERS = [
  ['Model inventory', 'What AI is in use, by whom, and for what, with an owner recorded against each system.'],
  ['Risk classification', 'Against the AI Act categories, with the Annex III section cited on each classification rather than a tier asserted on its own.'],
  // ⚠️ SAYS WHAT THE REGISTER HOLDS, AND DOES NOT NAME NIST AI RMF. Measured in the module on
  // 26 Sep 2026: Govern appears 4 times, Map once, Manage once, and MEASURE NOT AT ALL. Claiming a
  // structure "to NIST AI RMF" invites a reader to look for four functions and find three, which is a
  // checkable claim that fails. The row describes the register instead. It becomes the framework claim
  // the moment the fourth function is there, or if Lisa confirms the mapping exists outside this repo.
  ['Risk register', 'Each system carries the risks identified for it, who owns them, and what is in place, so the register answers a question about a named system rather than describing the estate in general.'],
] as const

const FRAMEWORKS = ['EU AI Act', 'NIST AI RMF', 'ISO 42001'] as const

/**
 * ⚠️ DRAFTED FROM THE CODE, AWAITING REVIEW. These four answers were written from what the module does
 * rather than supplied, so they are the place to check first if a claim here reads too strongly.
 *
 * ⚠️ THE THIRD ANSWER SAYS CERTIFICATION IS NOT REQUIRED, AND THAT IS A STATEMENT ABOUT THE STANDARD
 * RATHER THAN ABOUT THIS MODULE. It is safe to make while the ISO 42001 covers row is held, because it
 * claims nothing about what ThemisIQ produces.
 *
 * ⚠️ NO ANSWER NAMES A CATALOGUE SIZE OR A DURATION. The fourth question asks how long an inventory
 * takes and there is no constant for that, so it answers in terms of what is asked for, the same
 * technique as the Deals and GHG pages.
 */
const FAQ: readonly Faq[] = [
  { q: 'We only use third-party AI tools. Does this still apply?',
    a: 'Usually yes, and it is the commonest case. The Act places duties on deployers as well as providers, so using a system someone else built can still bring obligations, and a customer asking how you govern AI will not distinguish between the two. The inventory records what you use alongside anything you build, with the owner named either way.' },
  { q: 'How do we know if a system is high-risk?',
    a: 'High-risk under the Act is not a judgement about how advanced a system is, it is whether its use falls in one of the Annex III categories, such as employment and HR, credit and finance, education, or essential services and healthcare. The module classifies against those categories and cites the section it matched, so the answer is checkable rather than asserted.' },
  { q: 'Is ISO 42001 certification required?',
    a: 'No. ISO 42001 is a voluntary management-system standard and no regulation requires certification to it. What a customer or an auditor usually wants is evidence that you know what AI you have, who is accountable for it and what you do when something goes wrong, which is the same evidence the standard is built around.' },
  { q: 'How long does an inventory take to build?',
    a: 'As long as it takes to list the systems you use or build and name an owner for each. Classification and requirements follow from that rather than needing separate work. What takes longest is finding the systems nobody has written down, which is also the part with the most value in it.',
    extra: `Citation for the dates above: ${AI_ACT_CITATION}.` },
]
