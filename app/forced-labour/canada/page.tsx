import type { Metadata } from 'next'
import Nav from '@/app/components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  FrameworkChips, ClosingBand, ModuleSection, ModuleArrivals, ModuleFaq, bodyCopy, moduleEyebrow, type Faq,
} from '@/app/components/modulePage'
import { S211_THRESHOLDS } from '@/lib/s211/entity'
import {
  S211_GUIDANCE_FORMAT, S211_GUIDANCE_SELL_DISTRIBUTE_ONLY, S211_GUIDANCE_JOINT_REPORT, S211_ACT_SECTION_13_1,
  S211_ACT_SECTION_11_3,
} from '@/lib/s211/requirements'
import { COUNTRIES, CANADA_CHECK, PRICE_INCLUDES } from '@/lib/forcedLabour/countries'

const KEY = 'forced-labour' as const
const CANADA = COUNTRIES.find(c => c.key === 'canada')!

export const metadata: Metadata = {
  title: 'Canada S-211 Report: Forced Labour and Child Labour in Supply Chains | ThemisIQ',
  description:
    'Prepare the annual report Canada’s Fighting Against Forced Labour and Child Labour in Supply Chains Act (S-211) requires, due on or before May 31: check whether the Act applies, then build the report section by section and download it as a PDF.',
  alternates: { canonical: '/forced-labour/canada' },
}

/**
 * Canada's page in Forced Labour Reporting: everything specific to the Fighting Against Forced Labour and
 * Child Labour in Supply Chains Act (S-211). The module as a whole is /forced-labour.
 *
 * ⚠️ EVERY LEGAL FACT ON THIS PAGE COMES FROM A VERIFIED CONSTANT: the size conditions are S211_THRESHOLDS,
 * the quotations are lib/s211/requirements.ts strings interpolated rather than retyped, and the Act's name
 * is the country list's. app/forced-labour/forcedLabour.test.tsx asserts it.
 */
export default function ForcedLabourCanadaPage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── HERO ── */}
      <section style={{ borderTop: '4px solid var(--color-module-labour)', background: 'var(--color-module-labour-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>
            <a href="/forced-labour" style={{ color: 'var(--color-ink-muted)' }}>Forced Labour Reporting</a> / Canada
          </nav>
          <p style={moduleEyebrow}>Forced Labour Reporting · Canada</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '26ch' }}>
            Canada&rsquo;s annual report on forced labour and child labour, prepared section by section.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            <a href={CANADA.lawUrl} style={{ color: 'var(--color-ink)' }}>{CANADA.law}</a> ({CANADA.shortName})
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            The Act asks the entities it covers to report each year on the steps they took. The module works out
            whether the Act applies to you, takes you through each requirement with the Act&rsquo;s words and
            Public Safety Canada&rsquo;s guidance beside it, and produces the report as a PDF.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={CANADA_CHECK} style={{ ...btnPrimary, textDecoration: 'none' }}>Check if Canada&rsquo;s Act applies (free)</a>
            <a href={`/order?modules=${KEY}`} style={{ ...btnSecondary, textDecoration: 'none' }}>Order the module, ${price}/yr</a>
          </div>
        </div>
      </section>

      {/* ── HOW PEOPLE ARRIVE ── */}
      <ModuleSection>
        <ModuleArrivals items={ARRIVALS} />
      </ModuleSection>

      {/* ── THE ACT ── */}
      <ModuleSection tinted>
        <h2 style={sectionTitle}>What the Act asks</h2>
        <dl style={{ margin: '2rem 0 0', borderTop: '1px solid var(--color-line-strong)', maxWidth: '72ch' }}>
          {ACT.map(([k, v]) => (
            <div key={k} style={{ padding: '1.1rem 0', borderBottom: '1px solid var(--color-line)' }}>
              <dt style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{k}</dt>
              <dd style={{ margin: '0.25rem 0 0', fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.7 }}>{v}</dd>
            </div>
          ))}
        </dl>
      </ModuleSection>

      {/* ── WHAT THE MODULE COVERS ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>What the module covers for Canada</h2>
        <dl style={{ margin: '2rem 0 0', borderTop: '1px solid var(--color-line-strong)' }}>
          {COVERS.map(([k, v]) => (
            <div key={k} className="tq-covers-row" style={{ padding: '1.1rem 0', borderBottom: '1px solid var(--color-line)' }}>
              <dt style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-ink)' }}>{k}</dt>
              <dd style={{ margin: 0, fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.7 }}>{v}</dd>
            </div>
          ))}
        </dl>
      </ModuleSection>

      {/* ── WHAT IT SATISFIES ── */}
      <ModuleSection tinted>
        <h2 style={sectionTitle}>What it satisfies</h2>
        <p style={{ ...bodyCopy, margin: '1rem 0 1.75rem' }}>
          Described, sourced and mapped to a module on the regulations page.
        </p>
        <FrameworkChips names={FRAMEWORKS} />
        <p style={{ ...bodyCopy, marginTop: '1.75rem' }}>
          The module is ${price}/yr, {PRICE_INCLUDES}. <a href="/forced-labour" style={{ color: 'var(--color-brand)' }}>About the module</a>
        </p>
      </ModuleSection>

      {/* ── THE QUESTIONS ── */}
      <ModuleSection>
        <ModuleFaq items={FAQ} />
      </ModuleSection>

      <ClosingBand
        heading={'Not sure whether Canada’s Act applies to you?'}
        body="Answer the questions the Act turns on and see the result, with the Act and Public Safety Canada's guidance quoted. Free, and no account needed."
        primary={{ href: CANADA_CHECK, label: 'Check if Canada’s Act applies (free)' }}
        secondary={{ href: '/advisory', label: 'Talk to us' }}
      />

      <Footer />
    </div>
  )
}

// ── DATA ──────────────────────────────────────────────────────────────────────────────────────────
const cad = (n: number) => `CAD ${(n / 1e6).toFixed(0)} million`
const SIZE_CONDITIONS =
  `${cad(S211_THRESHOLDS.assetsCad)} in assets, ${cad(S211_THRESHOLDS.revenueCad)} in revenue, and an average of ${S211_THRESHOLDS.averageEmployees} employees`
const WHO =
  `An entity listed on a stock exchange in Canada, at any size, or one with a place of business, business or assets in Canada that meets at least two of three conditions in either of its two most recent financial years: ${SIZE_CONDITIONS}. It must report if it produces, sells or distributes goods in Canada or elsewhere, imports goods into Canada, or controls an entity that does.`
const CONTENTS = S211_ACT_SECTION_11_3.paragraphs.map(p => p.text.replace(/;( and)?$|\.$/, '')).join('; ')

const ARRIVALS = [
  { title: 'Your first report is due',
    body: 'And the Act asks for a report that answers each of its requirements, which nobody in the business has written before.' },
  { title: 'You are near the size conditions',
    body: 'And you need to know whether the Act reaches you before the report is due.' },
  { title: 'A customer or lender asked for your report',
    body: 'And the one you publish has to stand up to being read closely.' },
] as const

const ACT = [
  ['Who must report', WHO],
  ['When', 'On or before May 31 each year, covering the previous financial year (section 11(1)).'],
  ['What the report contains', `The steps taken during the previous financial year to prevent and reduce the risk of forced labour or child labour, and, for each entity it covers: ${CONTENTS}.`],
  ['Format', `Public Safety Canada’s guidance: “${S211_GUIDANCE_FORMAT}”`],
  ['Publishing', `Section 13(1): an entity must “${S211_ACT_SECTION_13_1.replace(/^An entity must, /, '').replace(/\.$/, '')}”.`],
] as const

const COVERS = [
  ['Whether the Act applies', 'The section 2 entity test and the section 9 activities, with the Act’s words and Public Safety Canada’s guidance quoted beside the result.'],
  ['Every requirement of section 11', 'Structure and supply chains, policies and due diligence, risks, remediation, lost income, training and effectiveness, each with the Act’s words, a plain explanation and what readers look for.'],
  ['The steps taken during the year', 'A summary drafted from your answers to the other sections, which you edit before it goes into the report.'],
  ['Approval and attestation', 'The approval statement in the Act’s terms, and a signature block for each governing body that approved the report.'],
  ['Checks before export', 'Missing answers, placeholders left in the attestation, and text that looks like personal information, all shown before the PDF is produced.'],
] as const

const FRAMEWORKS = ['Canada S-211'] as const

const FAQ: readonly Faq[] = [
  { q: 'Who has to report?',
    a: `${WHO} The free check works through it with your own figures.` },
  { q: 'When is the report due?',
    a: 'On or before May 31 each year, covering the entity’s previous financial year. That is section 11(1) of the Act.' },
  { q: 'What does the report contain?',
    a: `The steps taken during the previous financial year to prevent and reduce the risk of forced labour or child labour, and, for each entity it covers: ${CONTENTS}. It ends with a statement of how the governing body approved it, and a signed attestation.` },
  { q: 'Does the module file the report for us?',
    a: `No. The module produces the report as a PDF. Your organization still completes Public Safety Canada’s questionnaire, submits the report, and makes it public: section 13 of the Act says an entity must “${S211_ACT_SECTION_13_1.replace(/^An entity must, /, '').replace(/\.$/, '')}”.` },
  { q: 'We only sell or distribute goods. Do we have to report?',
    a: `Section 9(a) of the Act covers an entity producing, selling or distributing goods. Public Safety Canada’s current guidance says: “${S211_GUIDANCE_SELL_DISTRIBUTE_ONLY}” The check shows both, so you can see the Act’s words and the guidance’s position side by side.` },
  { q: 'Can one report cover several companies?',
    a: `Yes, as a joint report. The guidance says: “${S211_GUIDANCE_JOINT_REPORT[2]}” The module lists each entity by its legal name and gives each governing body that approved the report its own signature block.` },
  { q: 'Is the result of the check legal advice?',
    a: 'No. It is a screening from the answers you give, with the Act and the guidance quoted so you can see what it rests on. Public Safety Canada’s guidance encourages an entity that is unsure whether the Act applies to seek advice from its legal counsel.' },
]
