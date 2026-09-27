import type { Metadata } from 'next'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import { NIS2_DORA_CARVE_OUT, NIS2_SURVIVING_DUTY } from '@/lib/nis2'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection,
  ModuleArrivals, ModuleFaq, ModuleOutputs, bodyCopy, moduleEyebrow,
  type Faq, type ModuleOutput,
} from '@/app/components/modulePage'

const KEY = 'cyber' as const

export const metadata: Metadata = {
  title: 'Cyber Governance: NIS2, DORA and SEC Gap Assessment | ThemisIQ',
  description:
    'One set of cyber governance controls scored against the frameworks that reach you, with your gaps ranked by priority and the working kept.',
  alternates: { canonical: '/cyber' },
}

/**
 * The Cyber Governance module page, eighth and last of the marketing pages to the shared ten-section
 * shape. It replaces a hand-rolled page that shared no components with the other seven.
 *
 * ⚠️ FIVE FRAMEWORKS, NOT EIGHT, AND THAT IS THE BIGGEST CHANGE ON THIS PAGE. The old page's coverage
 * table listed NIST 800-53 Rev.5, SOC 2 Type II and UK Cyber Essentials with "✓ Partial" verdicts.
 * app/dashboard/cyber/page.tsx TAGS EACH CONTROL AGAINST FIVE FRAMEWORKS AND ONLY FIVE — nis2, dora, sec,
 * iso, nist — so those three had NO MAPPING OF ANY KIND behind them. Not a thin one: none. A grep for
 * `800-53`, `SOC 2`, `TSC` and `Cyber Essentials` in that file returns zero. They are gone from here and
 * must not come back without controls tagged to them.
 *
 * ⚠️ AND "FULL" IS GONE FROM EVERY ROW, replaced by the control counts. There is no notion of full
 * framework coverage anywhere in the module; what exists is a per-framework boolean on each of 25
 * controls. The counts (DORA 21, ISO 20, NIS2 19, NIST 19, SEC 5) are checkable, and they are a better
 * argument than a verdict nobody can audit. lib/obligations.ts:148-153 reached the same conclusion for
 * the same reason and says so.
 *
 * ⚠️ THREE MORE OLD CLAIMS DID NOT SURVIVE, each measured in the module and absent:
 *   "Annex A control mapping"  — zero occurrences of `Annex A`. The ISO tag is a boolean, not a mapping
 *                                to Annex A clauses, and a Statement of Applicability is not produced.
 *   "10-K disclosure workflow" — zero occurrences of `10-K`. The one SEC-specific control is ir4, the
 *                                8-K materiality assessment.
 *   "all six CSF functions"    — the eight domains are Governance, Risk Management, Access Control,
 *                                Incident Response, Supply Chain Security, Technical Controls, Business
 *                                Continuity, and Training & Awareness. That is not the six CSF functions,
 *                                and nothing maps a control to one.
 * ⚠️ app/frameworks/page.tsx:179-181 CARRIES A COMMENT CITING THE OLD STRING at `app/cyber/page.tsx:191`.
 * That line no longer exists. The comment's POINT still stands (CSF 2.0 has six functions and the card's
 * body once listed five), so it is left alone rather than half-corrected, but the citation is stale.
 *
 * ⚠️ FOUR FEATURE CLAIMS ARE OFF THE PAGE PENDING AN ANSWER FROM LISA: a policy library, vendor
 * questionnaires, board report generation, and TIBER-EU alignment. All four were on the old page; none is
 * in this module (`policy librar` and `TIBER` both return zero in app/dashboard/cyber/page.tsx). They may
 * be planned, or live in another module. IF THEY EXIST, THEY GO BACK IN ONE EDIT and this note goes with
 * them. Until then the page describes a gap assessment, which is what the module is.
 *
 * ⚠️ THE FRAMEWORKS CHIP ROW NAMES FOUR, AND SEC CYBER IS DELIBERATELY NOT ONE. FrameworkChips links
 * every chip to /frameworks, and the section intro promises each is "described, sourced and mapped to a
 * module" there. app/frameworks/page.tsx has NO SEC Cybersecurity Rules entry — its cyber group holds
 * NIST CSF, ISO/IEC 27001, NIS2 and DORA only. So a fifth chip would send a reader to a page that does
 * not list it and make the intro false. SEC is named instead where it is backed: the arrivals, the covers
 * rows and FAQ 2, all from lib/obligations.ts. Adding it to /frameworks is the fix; this page should not
 * pre-empt it.
 *
 * ⚠️ --color-module-cyber #AB81D6 IS A FILL AT 3.07:1 AND IS NEVER TEXT HERE. The hero rule and wash are
 * fill-only, which is inside that decision. --color-module-cyber-ink #8A4FC6 is the text companion at
 * 5.23:1 on paper, and is what [data-module="cyber"] points --tq-mod at. Neither appears as a literal.
 */
export default function CyberPage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ── */}
      <section style={{ borderTop: '4px solid var(--color-module-cyber)', background: 'var(--color-module-cyber-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>Cyber Governance module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '26ch' }}>
            Answer the controls once, and see where you stand against every cyber regime that reaches you.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            NIS2, DORA, the SEC cybersecurity rules, ISO 27001 and NIST CSF 2.0 share one set of 25
            controls and differ in how much of it they reach. You pick the frameworks that apply to you,
            answer once, and only those controls are scored.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>Start the free assessment</a>
            <a href={`/order?modules=${KEY}`} style={{ ...btnSecondary, textDecoration: 'none' }}>Order the module, ${price}/yr</a>
          </div>
        </div>
      </section>

      {/* ── DORA DOES NOT SWITCH NIS2 OFF ──
      The argument the module rests on, above the covers rows, in the slot the People page uses for
      "Not an HR platform". It sits on the 4px TOP rule the EDGE VOCABULARY reserves for semantic state
      rather than the 6px left bar that means module identity: this is a correction about the regimes,
      not a statement about which product you are in.
      ⚠️ THE TWO CLAIMS COME FROM lib/nis2.ts AND ARE NOT RESTATED HERE. NIS2_DORA_CARVE_OUT and
      NIS2_SURVIVING_DUTY are rendered as imported. That file's header records that a secondary source
      put the surviving duty under art. 27 instead of art. 3(4) and that it was nearly shipped, which is
      exactly why this page must not paraphrase either sentence. */}
      <ModuleSection>
        <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-state-info)', borderRadius: 6, padding: '1.75rem 2rem', maxWidth: '72ch' }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-state-info)', marginBottom: '0.75rem' }}>
            DORA does not switch NIS2 off
          </p>
          <p style={{ ...bodyCopy, margin: '0 0 1rem' }}>{NIS2_DORA_CARVE_OUT}</p>
          <p style={{ ...bodyCopy, margin: 0 }}>{NIS2_SURVIVING_DUTY}</p>
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

      {/* ── 4. HOW IT WORKS ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>How it works</h2>
        <div style={{ marginTop: '2rem' }}>
          <ModuleSpine
            bring="Answers about the controls you already have, one screen at a time."
            applies="The controls each framework reaches, so answering once scores you against all of them at the same time."
            get="A score by domain, your gaps ranked by priority, and a spreadsheet showing how every score was reached."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ──
      `cyber: 'workings'` in lib/modulePages.ts, so no verifier sentence follows and none can be asked
      for. Correct here: a gap assessment is a planning document, and the module's own export carries a
      line saying it "does not constitute a formal audit". */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every control keeps the maturity you recorded, the frameworks that reach it and the priority weight behind its ranking, so a score can be traced to the answers that produced it rather than to a judgement nobody wrote down."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      ⚠️ A LIVE PAGE, NOT A DOCUMENT. public/samples/ holds two files and neither is cyber, so `kind:
      'page'` as CBAM uses it.
      ⚠️ THE FREE / PAID LINE IS LOAD-BEARING AND MEASURED. Steps 0 to 3 (setup, the controls, results,
      remediation) render with no entitlement check at all. Only step 4 is gated: renderStep4 reads
      useEntitlementState('cyber') and shows a /pricing panel when isPaid is false. So working through
      the assessment and seeing your score IS free; the download is not. Saying "download it free" would
      be the kind of claim a visitor discovers is untrue at the last step. */}
      <ModuleSection>
        <ModuleOutputs
          intro="You can work through the whole assessment and see your results before buying anything."
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
        <h2 style={sectionTitle}>One flat annual price.</h2>
        <p style={{ ...bodyCopy, marginTop: '1rem' }}>
          Add modules and the multi-module discount applies automatically: two modules −10%, three or
          more −20%.
        </p>
        <div style={{ maxWidth: 420, marginTop: '2.5rem' }}>
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-cyber)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>Cyber Governance</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${price}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}> / reporting year</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {[
              '25 controls across eight domains',
              'Scored against the frameworks that reach you',
              'A score by domain, and your gaps ranked by priority',
              'The five gaps to fix first',
              'A spreadsheet of every control, maturity and priority',
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
      <ModuleSection tinted>
        <ModuleFaq items={FAQ} />
      </ModuleSection>

      {/* ── 10. CLOSING BAND ── */}
      <ClosingBand
        heading="Not sure which cyber rules apply to you?"
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
  { title: 'NIS2 reaches your sector',
    body: 'Your national law is what actually applies, and the first question is which controls are yours.' },
  { title: 'You are a financial entity, so DORA applies',
    body: 'It covers more of the controls than any other cyber regime here, including the third-party provider register.' },
  { title: 'You report to the SEC',
    body: 'The SEC rules reach fewer controls than the others, and the one they add is deciding whether an incident is disclosable.' },
] as const

/**
 * ⚠️ EVERY COUNT HERE IS FROM THE CONTROL SET, NOT FROM A ROUND NUMBER. app/dashboard/cyber/page.tsx
 * holds 25 controls across eight domains, each tagged per framework; `calcScore` filters to the tagged
 * ones. The per-framework counts and the unique-control counts are the same ones lib/obligations.ts
 * publishes for the three cyber obligations, and the two must not drift.
 */
const COVERS: readonly [string, string][] = [
  ['The control set', '25 controls across eight domains: governance, risk management, access control, incident response, supply chain security, technical controls, business continuity, and training and awareness.'],
  ['NIS2', 'Scores you against the 19 controls it reaches, including the two it alone requires: a maintained asset inventory, and a documented notification procedure for the 24-hour early warning and 72-hour full report.'],
  ['DORA', 'Scores you against the 21 controls it reaches, the widest of the three regimes, including its four unique ones: incident classification, resilience testing, an access review process, and the critical third-party provider register.'],
  ['SEC cybersecurity rules', 'Scores you against the 5 controls they reach, the narrowest of the three, four of which are shared with NIS2 and DORA. The one they alone require is the 8-K materiality assessment.'],
  ['ISO 27001 and NIST CSF 2.0', 'Scored as well, against 20 and 19 of the controls. Both are voluntary, and both are commonly asked for by customers rather than by a regulator.'],
  ['Maturity, not yes or no', 'Each control is recorded as not implemented, partially implemented, fully implemented, or optimised and tested, so partial progress counts as partial rather than as nothing.'],
  ['What to fix first', 'Gaps are ranked by the priority weight on the control, and the top five are listed on their own so a remediation plan has somewhere to start.'],
]

/**
 * ⚠️ `kind: 'page'`, AND THE INTRO SAYS WHAT IS FREE. See the note at section 6: only the export is
 * gated, and the body below is worded so a visitor knows that before they start rather than at step 5.
 */
const OUTPUTS: readonly ModuleOutput[] = [
  { kind: 'page', title: 'The gap assessment itself', href: '/dashboard/cyber',
    body: 'Work through the controls your frameworks reach and see your score by domain, your gaps and the five to fix first. Downloading the spreadsheet needs the module.' },
]

/**
 * ⚠️ FOUR, NOT FIVE, AND SEC CYBER IS THE ONE MISSING. See the note at the head of this file: these link
 * to /frameworks, which has no SEC entry, and the section intro promises each is described there.
 */
const FRAMEWORKS = ['NIS2', 'DORA', 'ISO/IEC 27001', 'NIST CSF'] as const

const FAQ: readonly Faq[] = [
  { q: 'Does DORA mean NIS2 no longer applies to us?',
    a: 'No. Where a sector-specific EU law imposes at least equivalent requirements, article 4(1) sets aside the NIS2 provisions that law replaces, including supervision and enforcement. The Directive itself does not stop applying. A financial entity still has to be identified as essential or important, and still has to keep its own registration details up to date with its Member State. That duty is not a cybersecurity provision, so the carve-out does not reach it.' },
  { q: 'Which frameworks does this actually score us against?',
    a: 'Five: NIS2, DORA, the SEC cybersecurity rules, ISO 27001 and NIST CSF 2.0. They share one set of 25 controls and differ in how much of it they reach. DORA reaches 21, ISO 27001 reaches 20, NIS2 and NIST CSF reach 19 each, and the SEC rules reach 5. You pick the ones that apply to you and only those are scored, so the number you get is about your obligations rather than about a generic maturity model.' },
  { q: 'We already have a security team and an ISO audit. What does this add?',
    a: 'A different job from the one your security team does. This does not test your controls or replace an audit. It records what you have against what each regime asks for, ranks what is missing by how much weight the control carries, and gives you the working as a spreadsheet you can hand to a board or a customer. If your ISO audit already covers a control, you mark it and move on.' },
  { q: 'How long does it take?',
    a: 'Twenty-five controls, and fewer if only some frameworks apply to you. It is five steps: set up, answer the controls, see the results, look at what to fix first, and export. Your answers are saved in this browser as you go, so you can stop and come back. Signed out they are kept for two hours; sign in and they stay.' },
]
