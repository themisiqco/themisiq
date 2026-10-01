import type { Metadata } from 'next'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, EvidenceSection, ClosingBand, ModuleSection, ModuleFaq, bodyCopy, moduleEyebrow, type Faq,
} from '@/app/components/modulePage'
import { availableCountries, STATUS_LABEL, PRICE_INCLUDES, CANADA_CHECK } from '@/lib/forcedLabour/countries'

const KEY = 'forced-labour' as const

export const metadata: Metadata = {
  title: 'Forced Labour Reporting: Supply Chain Reports, Country by Country | ThemisIQ',
  description:
    'Prepare the report on forced labour and child labour in your supply chains that each country’s law asks for, country by country. Available now for Canada (S-211).',
  alternates: { canonical: '/forced-labour' },
}

/**
 * The Forced Labour Reporting module page: the module as a whole. Since Stage 5c (30 Sep 2026) it is one
 * module that prepares reports country by country, and everything specific to a country lives on that
 * country's page (/forced-labour/canada). This page names Canada only where it says what exists today.
 *
 * ⚠️ THE COUNTRY LIST IS DATA. "Choose your country" renders the AVAILABLE countries in
 * lib/forcedLabour/countries.ts, and only those (Stage D1b): a country in preview or hidden is not named here
 * at all, and there is no "Not yet available" line. A country appears when its status becomes 'available',
 * made with the builder that prepares its report, not by an edit here.
 *
 * ⚠️ SECTIONS 2, 3, 6 AND 7 OF THE TEN-SECTION SHAPE (arrivals, covers, outputs, framework chips) ARE ON
 * THE COUNTRY PAGE, because each of them is about one country's law. What stays here is what is true of
 * the module whichever country is chosen.
 */
export default function ForcedLabourPage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ── */}
      <section style={{ borderTop: '4px solid var(--color-module-labour)', background: 'var(--color-module-labour-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>Forced Labour Reporting module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '26ch' }}>
            Your supply chain report on forced labour and child labour, prepared country by country.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            A growing number of countries require companies to report on the risk of forced labour and child
            labour in their supply chains. This module prepares that report country by country, with the
            country&rsquo;s law and its official guidance beside every question. Canada is available now.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href={CANADA_CHECK} style={{ ...btnPrimary, textDecoration: 'none' }}>Check if Canada&rsquo;s Act applies (free)</a>
            <a href={`/order?modules=${KEY}`} style={{ ...btnSecondary, textDecoration: 'none' }}>Order the module, ${price}/yr</a>
          </div>
        </div>
      </section>

      {/* ── CHOOSE YOUR COUNTRY ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>Choose your country</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: '2rem 0 0', borderTop: '1px solid var(--color-line-strong)', maxWidth: '72ch' }}>
          {availableCountries().map(c => {
            const status = 'available' as const
            const inner = (
              <>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--color-ink)' }}>{c.name}</span>
                <span style={{ display: 'block', fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.6 }}>{c.law}{c.shortName ? ` (${c.shortName})` : ''}</span>
              </>
            )
            const pill = (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap', flexShrink: 0,
                background: status === 'available' ? 'var(--color-state-ok-wash)' : 'var(--color-ground)',
                color: status === 'available' ? 'var(--color-state-ok)' : 'var(--color-ink-muted)' }}>
                {STATUS_LABEL[status]}
              </span>
            )
            const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '1.1rem 0', borderBottom: '1px solid var(--color-line)' } as const
            return (
              <li key={c.key} data-country={c.key} data-status={status}>
                {status === 'available' && c.href
                  ? <a href={c.href} style={{ ...row, textDecoration: 'none' }}><span>{inner}</span>{pill}</a>
                  : <div style={row}><span>{inner}</span>{pill}</div>}
              </li>
            )
          })}
        </ul>
      </ModuleSection>

      {/* ── 4. HOW IT WORKS ── */}
      <ModuleSection tinted>
        <h2 style={sectionTitle}>How it works</h2>
        <div style={{ marginTop: '2rem' }}>
          <ModuleSpine
            bring="Your policies, supplier information, risk assessments, training records and your governing body's approval."
            applies="The reporting law of the country you choose and its official guidance, requirement by requirement, in their own words."
            get="The report as a PDF, ready for your governing body to approve and sign."
          />
        </div>
      </ModuleSection>

      {/* ── 5. EVIDENCE ── */}
      <ModuleSection>
        <EvidenceSection
          moduleKey={KEY}
          workings="The report prints your answers under plain section headings, and nothing of the builder's guidance. The one draft the builder writes, the summary of steps taken, is built from your own answers and printed only as you edited it."
        />
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
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-labour)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>Forced Labour Reporting</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${price}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}>/yr, {PRICE_INCLUDES}</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {INCLUDED.map(f => (
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
        heading={'Not sure whether Canada\u2019s Act applies to you?'}
        body="Answer the questions the Act turns on and see the result, with the Act and the guidance quoted. Free, and no account needed."
        primary={{ href: CANADA_CHECK, label: 'Check if Canada’s Act applies (free)' }}
        secondary={{ href: '/advisory', label: 'Talk to us' }}
      />

      <Footer />
    </div>
  )
}

// ── DATA ──────────────────────────────────────────────────────────────────────────────────────────
const INCLUDED = [
  'The Canada report: the applicability check and every section of the report',
  'The law and its guidance beside every question',
  'Single and joint reports',
  'Checks for missing answers and personal information',
  'The report as a PDF, ready to approve and sign',
] as const

const FAQ: readonly Faq[] = [
  { q: 'What does the module do?',
    a: 'It prepares the report a country’s law asks for on forced labour and child labour in your supply chains. It works out whether the law applies to you, takes you through each requirement with the law’s words and its official guidance beside it, checks the report for missing answers and personal information, and produces it as a PDF for your governing body to approve and sign.' },
  { q: 'Which countries does it cover, and how are more added?',
    a: 'Canada is available now. Each country’s report follows its own law, so a country is added when its report is built: its own questions, its law and guidance quoted, and its own checks.' },
  { q: 'What happens when our term ends?',
    a: 'Your reports stay. You can still open and read them, and download the PDF of any report that is complete. Starting or changing a report needs an active term.' },
  { q: 'Is the applicability result legal advice?',
    a: 'No. It is a screening from the answers you give, with the law and its guidance quoted so you can see what it rests on. If you are unsure whether a law applies to you, ask your legal counsel.' },
]
