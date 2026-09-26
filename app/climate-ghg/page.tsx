import type { Metadata } from 'next'
import { scope3ScopeClaim, scope3MethodFamilies } from '../../lib/scope3/methodSummary'
import { AUDIT_TRAIL_NOTE } from '../../lib/auditTrailNotice'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { GHG_TIERS } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import { SB253_FIRST_REPORT_DATE, SB253_DATE_STATUS, SB253_STATUS_SENTENCE, SB253_SCOPE3_FROM } from '../../lib/sb253'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection,
  ModuleArrivals, ModuleFaq, bodyCopy, moduleEyebrow, type Faq,
} from '@/app/components/modulePage'

const KEY = 'ghg' as const

// ⚠️ THE TITLE'S EM-DASH WENT ON 26 SEP 2026. A page title is customer-facing — it is what a search
// result and a browser tab show — so the no-em-dash rule reaches it, and it had been carried over
// unexamined through the rebuild. A colon costs nothing in a title and reads the same.
export const metadata: Metadata = {
  title: 'GHG Inventory Software: Scope 1, 2 and 3 | ThemisIQ',
  description:
    'Build a full GHG inventory under the GHG Protocol, with an audit trail your verifier can follow. Pre-filled CARB SB 253 export, plus CDP, ESRS E1 and EcoVadis from one inventory.',
  alternates: { canonical: '/climate-ghg' },
  openGraph: {
    title: 'GHG Inventory Software: Scope 1, 2 and 3 | ThemisIQ',
    description:
      'Build a full GHG inventory under the GHG Protocol, with an audit trail your verifier can follow. Pre-filled CARB SB 253 export, plus CDP, ESRS E1 and EcoVadis from one inventory.',
    url: '/climate-ghg',
    type: 'website',
  },
}

/**
 * The GHG Emissions module page, third to the shared ten-section shape, and the module carrying the most
 * corrected copy on the site. Almost nothing here is free text.
 *
 * ⚠️ EVERY SCOPE 3 CLAIM IS DERIVED AND READ AT RENDER, NEVER ITS CURRENT OUTPUT. scope3ScopeClaim() and
 * scope3MethodFamilies() come from a Record over Scope3Method, so a family no method has is untypable and
 * a count that is not counted cannot be stated. Two over-claims lived here until 25 Sep 2026: the note
 * said "hybrid and supplier-specific methods" (no method has ever been hybrid; supplier-specific is
 * Category 1's entered figure, not a method run on fifteen categories), and the feature-card TITLE
 * carried the count as "Scope 3 — all 15 categories". Fixing only the description left the number in the
 * heading, where a reader of a feature grid meets it first. scope3CategoryCount.test.ts SCC-1 found it.
 * Do not inline what these return, at any width.
 *
 * ⚠️ AUDIT_TRAIL_NOTE IS NOW IMPORTED, NOT DECLARED HERE. It was a local const, deduplicated within this
 * file because the spec row and a feature card each carried a copy — while a differently-worded twin sat
 * in app/page.tsx's trust section. Both comments said they must be corrected together, which no comment
 * can enforce across a file boundary. lib/auditTrailNotice.ts now holds three widths of the one claim and
 * the rule that a slot needing more does not invent a fourth.
 *
 * ⚠️ NO URGENCY BANNER, AND THAT IS A FIX RATHER THAN A DELETION. It was #fff on var(--color-module-ghg),
 * which under the 2026 colourway becomes white on #0097B2 at 3.46:1 — below AA for 13px text. It was one
 * of the eleven bars logged in docs/colourway-2026.md. The SB 253 date it carried is on the page still,
 * in the deadline row and the closing band.
 *
 * ⚠️ THE DATE IS DERIVED FROM SB253_FIRST_REPORT_DATE BY SPLITTING IT, and that carries a known risk worth
 * repeating: a date split across two fields is invisible to a whole-string guard (see the KNOWN LIMIT note
 * in lib/aiAct.test.ts). Kept because the deadline row wants a short form; never retyped.
 *
 * ⚠️ THE #build-your-stack ANCHOR IS LOAD-BEARING. /pricing?modules=ghg alone lands five sections above
 * the tier picker. Verified 26 Sep 2026: the id is still on app/pricing/page.tsx's module selector, which
 * now also carries scrollMarginTop so the heading does not land under the sticky nav.
 */
export default function Page() {
  const [sbDay, sbMonth, sbYear] = SB253_FIRST_REPORT_DATE.split(' ')
  const sbShortDate = `${sbDay} ${sbMonth.slice(0, 3)} ${sbYear}`
  const ghgFrom = GHG_TIERS.starter.priceUSD?.toLocaleString('en-US')
  const allowanceLabel = (a: number | null) => (a == null ? 'Unlimited locations' : `Up to ${a} locations`)
  const TIER_PICKER = '/pricing?modules=ghg#build-your-stack'

  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ── */}
      <section style={{ borderTop: '4px solid var(--color-module-ghg)', background: 'var(--color-module-ghg-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>GHG Emissions module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '26ch' }}>
            Not sure which emissions reporting applies to you? ThemisIQ is your guide.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            Scope 1, 2 and 3 under the GHG Protocol, built from your own bills and records, with the
            method, the factor edition and the source document kept behind every figure.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>Start the free assessment</a>
            {/* ⚠️ "From", AND THE ANCHOR. GHG is the only tiered module: starter is 3 locations,
                professional 15, advisory uncapped with priceUSD null. A single price would mislead
                anyone above three locations, so this names the floor and links to the picker. */}
            <a href={TIER_PICKER} style={{ ...btnSecondary, textDecoration: 'none' }}>From ${ghgFrom}/yr</a>
          </div>
        </div>
      </section>

      {/* ── 2. HOW PEOPLE ARRIVE ── */}
      <ModuleSection>
        <ModuleArrivals items={ARRIVALS} />
      </ModuleSection>

      {/* ── 3. WHAT IT COVERS, plus the specification table ── */}
      <ModuleSection tinted>
        <h2 style={sectionTitle}>What the module covers</h2>
        <dl style={{ margin: '2rem 0 0', borderTop: '1px solid var(--color-line-strong)' }}>
          {[
            ['Scope 1', 'Stationary and mobile combustion, fugitive and process emissions, with fuel-level factors per jurisdiction.'],
            ['Scope 2', 'Location-based and market-based in parallel, with grid region selection and residual mix citation where the market method applies.'],
            // ⚠️ scope3ScopeClaim() VERBATIM AS THE BODY OF THIS ROW. Not paraphrased, not trimmed. It
            // states the total, the calculated count and the reported count, all derived from the method
            // map, so the row cannot disagree with the calculator.
            ['Scope 3', scope3ScopeClaim()],
            ['Monthly and annual', 'Monthly from evidenced data only, annual from evidenced plus estimated, with billing periods prorated rather than rounded.'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 16rem) 1fr', gap: '1.5rem', padding: '1.1rem 0', borderBottom: '1px solid var(--color-line)' }}>
              <dt style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.7 }}>{v}</dd>
            </div>
          ))}
        </dl>

        {/* ── THE SPECIFICATION TABLE ──
        ⚠️ KEPT BECAUSE FOUR SUMMARY ROWS WOULD HAVE LOST ITS CORRECTION HISTORY. Every `note` below is
        either derived or was rewritten after being found false, and the reasons are inline. */}
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 400, color: 'var(--color-ink)', margin: '3rem 0 0' }}>
          One inventory, collected once
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1.25rem' }}>
          <tbody>
            {[
              { label: 'Scope coverage', big: 'Scope 1, 2 and 3',
                note: `${scope3ScopeClaim()} Methods: ${scope3MethodFamilies().join(', ')}.` },
              // ⚠️ "Every data entry, edit, and deletion is logged" was corrected on 17 Sep 2026. Seven
              // audit triggers exist (verified LIVE that day) covering ghg_inventories, ghg_entries, two
              // cbam_* tables and three concierge_* tables — NOT scope3_inventories, the supply chain
              // registers, the campaign tables or any materiality table. The granularity is one row per
              // SAVE, not per edit. "Written by the database" was and is true. The wording now lives in
              // lib/auditTrailNotice.ts so the homepage's twin cannot drift from it.
              { label: 'Audit trail', big: 'Every saved change logged', note: AUDIT_TRAIL_NOTE },
              // ⚠️ THE STRONGEST SENTENCE ON THE PAGE: one inventory, six destinations, simultaneously.
              { label: 'Frameworks', fw: 'SB 253 · CDP C6 · ESRS E1 · GHG Protocol · IFRS S2 · EcoVadis · CARB template · SBTi',
                note: 'One inventory exports to CARB SB 253 template, CDP C6 and C7, ESRS E1-6, EcoVadis, GRI 305, and IFRS S2 simultaneously.' },
              // ⚠️ THIS NOTE READ, UNTIL 17 SEP 2026: "IPCC AR6 GWP values throughout. IEA 2024 grid
              // electricity factors. DEFRA 2024 travel and freight factors. Auto-converts to AR4 on CARB
              // export." All four claims were false: no IEA factor exists; no DEFRA travel or freight
              // factor exists (travel is unsourced, freight is the flat spend factor); DEFRA, DCCEEW and
              // MfE factors are applied at their published GWP basis, not AR6; and every framework, SB 253
              // included, uses AR6. The replacement names only the publishers EF_SOURCES cites, and
              // lib/publisherClaims.test.ts now fails on a publisher-year or publisher-activity claim that
              // no factor record supports.
              { label: 'Emission factors', big: 'IPCC AR6',
                note: "Scope 1 and 2 factors matched to each location's country: US EPA and eGRID (US), ECCC (Canada), DEFRA/DESNZ (UK), EU MRR/IPCC defaults and EEA (EU), DCCEEW (Australia) and MfE (New Zealand), with US EPA combustion factors elsewhere. IPCC AR6 GWPs by default; a factor published with its own GWP basis is applied as published. Every factor is cited on its workings row." },
              { label: 'First SB 253 report', big: sbShortDate,
                note: `${SB253_DATE_STATUS}, for Scope 1 and 2 on the prior fiscal year. Scope 3 follows from ${SB253_SCOPE3_FROM}.` },
              { label: 'Price', big: `From $${ghgFrom}/yr`,
                note: `${allowanceLabel(GHG_TIERS.starter.locationAllowance)} on the entry tier. Larger allowances and an uncapped tier are in the picker.` },
            ].map(({ label, big, fw, note }) => (
              <tr key={label}>
                <th style={{ textAlign: 'left', fontSize: 14, fontWeight: 600, color: 'var(--color-ink-muted)', padding: '16px 20px 16px 0', verticalAlign: 'top', width: 210, borderBottom: '1px solid var(--color-line)' }}>{label}</th>
                <td style={{ padding: '16px 0', borderBottom: '1px solid var(--color-line)', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums lining-nums' }}>
                  {big && <div style={{ fontFamily: 'var(--font-display)', fontSize: 23, fontWeight: 600, lineHeight: 1.15, letterSpacing: '-0.012em' }}>{big}</div>}
                  {fw && <div style={{ fontSize: 16, lineHeight: 1.75, maxWidth: '56ch' }}>{fw}</div>}
                  <div style={{ fontSize: 15, color: 'var(--color-ink-2)', marginTop: 4, maxWidth: '52ch' }}>{note}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ModuleSection>

      {/* ── 4. HOW IT WORKS ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>How it works</h2>
        <div style={{ marginTop: '2rem' }}>
          <ModuleSpine
            bring="Utility bills, fuel and refrigerant records, travel and supplier data. Upload what you have; gaps are flagged rather than filled silently."
            applies="The correct factor edition for each jurisdiction and year, the GWP set each framework requires, and proration across periods that straddle a year end."
            get="A complete inventory, framework-ready exports, an assurance pack and a verifier view you control access to."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ── */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every figure keeps the method, the factor edition and the source document behind it, so a reviewer can follow a total back to the bill it came from."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      ⚠️ ABSENT, AND DELIBERATELY. public/samples/ holds two Climate Risk reports and no GHG artefact,
      and there is no /climate-ghg/preview route. The assurance package is generated per inventory by
      lib/assurancePdf.ts, so there is nothing a prospect can open. ModuleOutputs exists so a module with
      nothing to show omits the section rather than rendering a "coming soon" tile. docs/backlog.md
      carries the fix: generate the pack for the same fictional company as the Climate Risk samples. */}

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
        <h2 style={sectionTitle}>Priced by locations, not by seats.</h2>
        <p style={{ ...bodyCopy, marginTop: '1rem' }}>
          GHG is the one tiered module, because an inventory for three sites is not the same work as one
          for fifteen. Add modules and the multi-module discount applies automatically: two modules −10%,
          three or more −20%.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '2.5rem' }}>
          {/* ⚠️ TIERS AND ALLOWANCES ARE READ FROM GHG_TIERS, INCLUDING THE NULLS. advisory has
              priceUSD null and locationAllowance null, which mean "contact us" and "uncapped" — not
              zero and not missing. allowanceLabel is the only place that decides how a null reads. */}
          {(['starter', 'professional', 'advisory'] as const).map(t => (
            <div key={t} style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-ghg)', borderRadius: 6, padding: '1.5rem' }}>
              <div style={{ ...moduleEyebrow, marginBottom: 8 }}>{TIER_LABELS[t]}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', fontWeight: 400, color: 'var(--color-ink)' }}>
                {GHG_TIERS[t].priceUSD == null ? 'Contact us' : `$${GHG_TIERS[t].priceUSD!.toLocaleString('en-US')}`}
                {GHG_TIERS[t].priceUSD != null && <span style={{ fontSize: 13, color: 'var(--color-ink-muted)' }}> / yr</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginTop: 8 }}>{allowanceLabel(GHG_TIERS[t].locationAllowance)}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 13, marginTop: '1.5rem' }}>
          <a href={TIER_PICKER} style={{ color: 'var(--color-brand)', fontWeight: 600, textDecoration: 'none' }}>
            Choose your tier →
          </a>
        </p>
      </ModuleSection>

      {/* ── 9. THE QUESTIONS ── */}
      <ModuleSection>
        <ModuleFaq items={FAQ} />
      </ModuleSection>

      {/* ── 10. CLOSING BAND ── */}
      <ClosingBand
        heading="Not sure whether emissions reporting applies to you yet?"
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
/** UI labels for the tier keys. GHG_TIERS.starter's label is "Essentials", per lib/pricing.ts. */
const TIER_LABELS = { starter: 'Essentials', professional: 'Professional', advisory: 'Advisory' } as const

const ARRIVALS = [
  { title: 'A customer asked',
    body: 'A buyer wants Scope 1 and 2 figures, often on a questionnaire with a deadline and no explanation of what is being asked for.' },
  { title: 'A regulation applies',
    body: 'California SB 253, CSRD or a national scheme applies to your company, and the first reporting year is closer than it looks.' },
  { title: 'A lender or investor asked',
    body: 'Financing terms or an investment process now require emissions data that can survive a third-party check.' },
] as const

const FRAMEWORKS = [
  'GHG Protocol', 'GHG Protocol Scope 3 Standard', 'SB 253', 'IFRS S2', 'ESRS E1-6', 'ISO 14064-3',
] as const

/**
 * ⚠️ THE FACTOR ANSWER NAMES SIX JURISDICTIONS AND ONE DECLARED GAP, and both halves are checkable:
 * FactorJurisdiction in lib/ghg/factorEditions.ts is 'US' | 'CA' | 'UK' | 'EU' | 'AU' | 'NZ', and
 * FAMILIES_NOT_COVERED is ['refrigerants']. "Flagged for review instead of estimated" is the Tier 3
 * branch of lib/unitConversions.ts, which queues needs_manual_review rather than guessing.
 *
 * ⚠️ THE COMPARISON ANSWER CITES THE BEHAVIOUR, NOT A MIGRATION. ghg_inventories.comparability_disclosure
 * holds a ComparabilityRecord from lib/ghg/comparability.ts and reaches the verifier through
 * get_verifier_inventory. Do NOT cite 20260806_get_verifier_inventory_comparability.sql: its own header
 * says it is superseded and that running it would revert factor_editions out of the projection.
 *
 * ⚠️ THE FIRST ANSWER'S REFUSALS ARE THE POINT OF IT. CONCIERGE_UNREAD_DOC_TYPES and JUDGEMENT_EXCLUDED
 * in lib/ghg/conciergeDocTypes.ts are why: "A confident-looking number here would be worse than a blank."
 * That wording is the platform's position and this answer is its customer-facing form.
 */
const FAQ: readonly Faq[] = [
  { q: 'We have never done this before. Where do we start?',
    a: 'With a utility bill. Upload what you have and the extractor reads electricity, natural gas, diesel, propane and gasoline automatically. Some documents it deliberately will not read: a refrigerant service record is a judgement call rather than a figure to lift off a page, and a renewable certificate states kWh certificated rather than kWh consumed. Those are kept as evidence and you enter the number yourself, because a confident-looking wrong number is worse than a blank.' },
  { q: 'Will this survive third-party assurance?',
    a: "It is built for it. Every figure carries its method, its factor edition and the document it came from, the assurance package is assembled for ISO 14064-3 and ISAE 3410 engagements, and your verifier sees the same view you do through access you grant and can revoke. ThemisIQ produces an assurance-ready package; the assurance itself is your verifier's to give." },
  { q: 'What if you do not hold factors for one of our countries?',
    a: 'Six jurisdictions have their own published factor editions: the US, Canada, the UK, the EU, Australia and New Zealand. Everywhere else uses US EPA combustion factors, and the workings row says so rather than hiding it. Anything that cannot be converted confidently is flagged for review instead of being estimated, and refrigerants are a declared gap rather than a silent one.' },
  { q: 'Can we compare this year against last year?',
    a: 'Yes, and the comparison carries its own disclosure of what changed between the years, including which factor editions were applied. A year-on-year movement can come from your emissions or from a factor revision, and a verifier needs to know which.' },
  { q: 'When is the first California SB 253 report due?',
    a: `${sbDateAnswer()} The status word is not decoration: this date has already moved once.`,
    extra: SB253_STATUS_SENTENCE },
]

/** Derived, never retyped — the whole string, with its status word. */
function sbDateAnswer(): string {
  return `The first report is ${SB253_FIRST_REPORT_DATE}, ${SB253_DATE_STATUS}, covering Scope 1 and 2 for the prior fiscal year, with Scope 3 from ${SB253_SCOPE3_FROM}.`
}
