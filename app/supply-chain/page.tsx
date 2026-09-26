import type { Metadata } from 'next'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import {
  CS3D_APPLIES_FROM, CS3D_TRANSPOSITION, CS3D_GUIDELINES_DUE,
  CS3D_EMPLOYEE_THRESHOLD, CS3D_TURNOVER_THRESHOLD, CS3D_NON_EU_TURNOVER_THRESHOLD,
  CS3D_OMNIBUS_CITATION, CS3D_OTHER_ROUTES_NOTE, CS3D_VALUE_CHAIN_CONTACT_LIMIT,
} from '@/lib/cs3d'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection,
  ModuleArrivals, ModuleFaq, bodyCopy, moduleEyebrow, type Faq,
} from '@/app/components/modulePage'

const KEY = 'supply-chain' as const

export const metadata: Metadata = {
  title: 'Supplier Data Collection: Scope 3, CS3D and EcoVadis | ThemisIQ',
  description:
    'A supplier portal your suppliers can use without an account. Questionnaire templates for EcoVadis, CS3D, Modern Slavery and Scope 3, with primary data feeding Scope 3 Category 1.',
  alternates: { canonical: '/supply-chain' },
}

/**
 * The Supply Chain module page, fourth to the shared ten-section shape.
 *
 * ⚠️ THE PAGE MAY SAY A SUPPLIER TOLD YOU THEIR FIGURE IS ASSURED. IT MAY NEVER SAY YOUR FIGURE IS
 * ASSURED. That is the rule from lib/scope3/supplierAssurance.ts, whose own header reads: "THE FIELD
 * DESCRIBES THE SUPPLIER'S REPORTING, NOT THIS LINE'S FIGURE, AND NO STRING IN THIS FILE SAYS
 * OTHERWISE." Every assurance claim on this page is written to that constraint, and an editor
 * shortening one will meet this note first. "Their own reporting is third-party assured" is inside the
 * rule; "assured Scope 3 figures" is outside it and would be a claim to an auditor that nothing
 * supports.
 *   The second half matters as much: AssuranceState has eight members and NOT ONE means "we did not
 * record this" — absence is carried separately. So "the basis recorded per supplier" is right, and
 * "we know every supplier's assurance status" would not be.
 *
 * ⚠️ NO COUNT OF TEMPLATES, DELIBERATELY. There are five — ecovadis (35 questions), cs3d (15), scope3
 * (12), modern_slavery (12) and custom (7), counted by importing TEMPLATES rather than by eye. They are
 * NAMED here and never counted, because docs/backlog.md already records the portal's own picker stating
 * two wrong counts: "Full 38-question assessment" where ecovadis has 35, and "8 questions" where scope3
 * has 12. A marketing page adding a third number to keep true is the defect three other pages have
 * already had removed.
 *
 * ⚠️ THE CS3D FRAMING IS INHERITED, NOT REWRITTEN. Four claims were removed from this page on
 * 24 Sep 2026 because each was false rather than merely strong: civil liability, "you must comply",
 * "large companies", and the phase-in that (EU) 2026/470 eliminated. What replaced them is the true and
 * more useful fact — the obligation lands on the customer and the request lands on the reader — and that
 * is now the page's whole CS3D position. THE PAGE IS SILENT ON CIVIL LIABILITY: it neither threatens it
 * nor says it is gone, because the deletion rests on secondary sources pending EUR-Lex verification.
 */
export default function SupplyChainPage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ── */}
      <section style={{ borderTop: '4px solid var(--color-module-supply)', background: 'var(--color-module-supply-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>Supply Chain module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '26ch' }}>
            Make it easy for your suppliers to give you their data.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            Your suppliers are not sustainability experts, so the portal explains what each question
            means and why you are asking. What comes back is evidence, human rights risk mapping, and the
            primary data that feeds Scope 3 Category 1.
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
            bring="Your supplier list and what you spend with each one."
            applies="Asks your suppliers the right questions, follows up with anyone who has not replied, and maps every answer to the framework that asked for it."
            get="Answers from your suppliers, kept with the proof behind them, and Scope 3 Category 1 figures you can explain."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ──
      ⚠️ 'workings', NOT 'verifier'. There is no supplier verifier surface: get_verifier_inventory and
      get_verifier_scope3 are the only two RPCs and neither reaches the supplier registers, and
      scope3_inventories carries no audit_log trigger. EvidenceSection enforces it from
      lib/modulePages.ts, so this page cannot assert one by wording. */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every supplier answer is kept with the evidence attached to it and the date it arrived, so a figure traces back to the response that produced it rather than to a spreadsheet nobody can find."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      Absent: there is no supplier-portal sample or preview route, and public/samples/ holds only the two
      Climate Risk reports. ModuleOutputs exists so a module with nothing to show omits the section. */}

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
          Unlimited suppliers on the portal. Add modules and the multi-module discount applies
          automatically: two modules −10%, three or more −20%.
        </p>
        <div style={{ maxWidth: 420, marginTop: '2.5rem' }}>
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-supply)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>Supply Chain</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${price}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}> / reporting year</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {[
              'Supplier portal, no account needed for your suppliers',
              'EcoVadis, CS3D, Modern Slavery and Scope 3 templates',
              'A custom questionnaire for anything they do not cover',
              'Human rights and supply chain risk mapping',
              'Primary data into Scope 3 Category 1, with its basis',
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
        heading="Good supplier data makes everything downstream easier."
        body="ThemisIQ helps you gather it once and use it wherever it is asked for."
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
 * ⚠️ THE CS3D ARRIVAL IS "YOUR CUSTOMER IS IN SCOPE", NEVER "YOU ARE". With a single tier at more than
 * 5,000 employees and EUR 1.5bn, almost no reader of this page is caught, and the ones who are do not
 * need a marketing page to tell them. That sentence replaced "you must comply" on 24 Sep 2026.
 */
const ARRIVALS = [
  { title: 'A customer sent you a questionnaire',
    body: 'One you cannot answer without asking your own suppliers first.' },
  { title: 'Your largest customer is in scope for CS3D',
    body: 'Their obligation becomes your questionnaire.' },
  { title: 'You need primary supplier data for Scope 3',
    body: 'And you have been estimating from spend.' },
] as const

/**
 * ⚠️ THE FIFTH TEMPLATE IS NAMED, NOT COUNTED. `custom` exists alongside ecovadis, cs3d, scope3 and
 * modern_slavery in lib/supply-chain/templates.ts. Listing four and stopping told a buyer the product
 * cannot ask anything the four do not cover.
 *
 * ⚠️ "WHETHER THEIR OWN FIGURE WAS THIRD-PARTY ASSURED" IS THE EXACT LIMIT OF THE CLAIM. It describes
 * the SUPPLIER'S reporting. It does not say your Category 1 total is assured, and no wording on this
 * page may. See the note at the top of the file and lib/scope3/supplierAssurance.ts.
 */
const COVERS = [
  ['A supplier portal', 'Your suppliers can use it without an account, and each question explains what it means and why you are asking.'],
  ['Questionnaire templates', 'EcoVadis, CS3D, Modern Slavery and Scope 3, plus a custom questionnaire for anything the four do not cover.'],
  ['Risk mapping', 'Human rights and supply chain risk, mapped from the answers rather than assumed from the sector.'],
  ['Primary data for Scope 3', 'Feeds Category 1 with the basis recorded per supplier, including whether their own figure was third-party assured.'],
] as const

const FRAMEWORKS = ['CS3D', 'EcoVadis', 'Modern Slavery Act', 'ESRS S2'] as const

/**
 * ⚠️ THE CS3D ANSWER CARRIES THE TRANSPOSITION PARAGRAPH, WHICH WAS PREVIOUSLY REACHABLE ONLY FROM A
 * SECTION THIS SHAPE HAS NO SLOT FOR. Its original comment read "SAID ON THE PAGE, NOT ONLY IN THE
 * BACKLOG": two things a reader could otherwise assume are that national law is settled and that the
 * Commission's guidance exists, and neither is true. It is the most useful thing on this page for the
 * reader it is written for, so it became an answer rather than being dropped.
 *
 * ⚠️ THE SPEND GAP-FILL IN THE SECOND ANSWER IS TRUE AND WAS CHECKED. lib/scope3/categorySnapshot.ts's
 * snapshotMethod comment: "a supplier who reported an allocated figure is priced supplier-specific, and
 * one who did not is gap-filled from spend, in the same total" — which is why the method is recorded as
 * 'mixed' rather than either single value. Worth re-checking if the Scope 3 method map changes again:
 * the flat rate was removed from six categories on 25 Sep 2026 and Category 1 was not one of them.
 *
 * ⚠️ THE FOURTH ANSWER'S CONTRADICTION CHECK IS assuranceContradictsFigure, and it is a real function,
 * not a manner of speaking. It exists so a supplier's stated assurance and the figure they gave cannot
 * be reconciled silently.
 */
const FAQ: readonly Faq[] = [
  { q: 'Our suppliers are small. Is this too much to ask of them?',
    a: 'The portal is built for someone who has never been asked this before. No account, no login, and each question explains what it means and why you are asking. Most answers come from a utility bill and a headcount. Where a supplier genuinely cannot answer, that is recorded as an absence rather than left as a gap you discover later.' },
  { q: 'What if a supplier does not respond?',
    a: 'You see who has not replied and the platform follows up. Where no figure arrives, the category is estimated from the spend you recorded and marked as an estimate, so the split between reported and estimated is visible to you and to anyone checking your inventory.' },
  { q: 'Does CS3D apply to us?',
    a: `Almost certainly not. Since ${CS3D_OMNIBUS_CITATION} there is a single scope tier, and an EU company is caught only with ${CS3D_EMPLOYEE_THRESHOLD} and ${CS3D_TURNOVER_THRESHOLD}. A non-EU company is caught on ${CS3D_NON_EU_TURNOVER_THRESHOLD}, with no employee test. ${CS3D_OTHER_ROUTES_NOTE} What reaches you instead is the request: your in-scope customers cannot diligence a value chain they have no information about, so they will ask, and they will ask before their own deadline of ${CS3D_APPLIES_FROM} rather than on it. ${CS3D_VALUE_CHAIN_CONTACT_LIMIT}`,
    extra: `Transposition is what turns these dates into national obligations, and it has not happened in earnest yet. Member States transpose by ${CS3D_TRANSPOSITION}. The Commission is due to publish implementation guidelines before ${CS3D_GUIDELINES_DUE}, and they are not published at the time of writing. Both will change how the questionnaires you receive are worded, so treat the wording of a request as your customer's reading of the directive rather than as the directive.` },
  { q: 'How does this connect to our Scope 3 inventory?',
    a: 'Supplier figures feed Category 1 directly, each carrying the basis it came in on and whether the supplier told you their own reporting is third-party assured. Where a supplier’s stated assurance disagrees with the figure they gave, that is flagged rather than reconciled silently.' },
]
