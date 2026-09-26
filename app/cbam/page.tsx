import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { MODULE_SUBLINE } from '@/lib/modulePages'
import { CBAM_REGULATION_URL } from '@/lib/sources'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import {
  ModuleSpine, FrameworkChips, EvidenceSection, ClosingBand, ModuleSection, ModuleOutputs,
  bodyCopy, moduleEyebrow, type ModuleOutput,
} from '@/app/components/modulePage'

const KEY = 'cbam' as const

/**
 * The CBAM module page, second to the shared ten-section module shape.
 *
 * ⚠️ THE ONLY OTHER VERIFIER MODULE, which is why it was built second: it exercises
 * EVIDENCE_BY_MODULE in the direction Climate Risk could not. CBAM and GHG are the two modules with a
 * verifier surface AND an audit_log trigger — cbam_production_processes and
 * cbam_installation_disclosures, from supabase/migrations/20260726_cbam_audit_triggers.sql.
 *
 * ⚠️ IRON AND STEEL, AND ALUMINIUM. NOT FOUR SECTORS, EVER. cbam_cn_map and cbam_goods_categories are
 * seeded by 20260716_cbam_reference.sql (CN chapters 72 and 73) and 20260727_cbam_aluminium_seed.sql
 * (Ch.76 excluding 7602 scrap and 7615 household). Cement, fertilisers and hydrogen appear in the
 * migrations only in comments naming sectors a column does NOT apply to. The "available now / in active
 * development" split below predates this rebuild and is kept verbatim in substance, because it is the
 * honest form and because app/frameworks/page.tsx was found on 25 Sep 2026 claiming four sectors while
 * this page and /methodology had it right all along.
 *
 * ⚠️ ANNEX II: THE CERTIFICATE OBLIGATION IS ON DIRECT EMISSIONS FOR THESE GOODS. Both seeds record it
 * — "Steel is Annex II (direct-only certificate); see_indirect null" and "Aluminium = Annex II
 * (direct-only certificate) + PFCs". The module computes and reports indirect emissions too, so
 * "direct and indirect" is true, and a buyer reading it unqualified may expect indirect to be
 * chargeable. That inference is most expensive at the moment they are deciding, so the qualifier is in
 * the hero rather than the FAQ.
 */
export default function CbamPage() {
  const price = FLAT_MODULE_PRICES[KEY].toLocaleString()
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── 1. HERO ──
      Module hue as a 4px top rule and a wash. Never text: the colourway is a fill value, and
      --color-module-cbam becomes #A9D2D7 under it, which measures 1.63:1 on paper. */}
      <section style={{ borderTop: '4px solid var(--color-module-cbam)', background: 'var(--color-module-cbam-wash)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={moduleEyebrow}>CBAM module</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.1rem, 4vw, 3.1rem)', fontWeight: 400, lineHeight: 1.15, letterSpacing: '-0.015em', color: 'var(--color-ink)', marginBottom: '0.75rem', maxWidth: '28ch' }}>
            Provide your embedded emissions to your EU customer to demonstrate they are better than the default values.
          </h1>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.05rem, 1.9vw, 1.3rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.45, marginBottom: '1.4rem' }}>
            {MODULE_SUBLINE}
          </p>
          <p style={{ ...bodyCopy, marginBottom: '2rem' }}>
            Installation-level direct and indirect emissions for goods entering the EU, with an Annex IV
            summary and a verifier portal built in. For iron and steel and for aluminium the certificate
            obligation falls on direct emissions, so indirect is computed and reported without being
            chargeable.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none' }}>Start the free assessment</a>
            {/* The order path is kept rather than sent to /pricing: this module has a direct route with
                its own price, and FLAT_MODULE_PRICES drives the figure so it cannot drift from checkout. */}
            <a href={`/order?modules=${KEY}`} style={{ ...btnSecondary, textDecoration: 'none' }}>Order the module, ${price}/yr</a>
          </div>
        </div>
      </section>

      {/* ── 2. THREE WAYS PEOPLE ARRIVE ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>Three ways people arrive here</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginTop: '2rem' }}>
          {ARRIVALS.map(a => (
            <div key={a.title} style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 6, padding: '1.4rem' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.25, marginBottom: '0.6rem' }}>{a.title}</div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.65 }}>{a.body}</div>
            </div>
          ))}
        </div>
      </ModuleSection>

      {/* ── 3. WHAT IT COVERS, plus the sector split ── */}
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

        {/* ⚠️ NO STATUS DOTS. Carried over from the previous version of this page, whose comment reads:
            live rows were a #64fe3e dot and development rows a #888784 dot, so status was carried by
            hue alone — unavailable to a colourblind reader, invisible to a screen reader, and
            1.33:1 / 3.59:1 once the ground goes light. The status is in the text instead. Nothing was
            invented to replace a dot.
            ⚠️ AND THE LAST SENTENCE IS THE POINT OF THE WHOLE BLOCK: "We show you what is live so you
            always know what you are buying." Do not drop it to save a line. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem', marginTop: '2.5rem' }}>
          <div>
            <p style={{ ...bodyCopy, margin: 0 }}>
              Available now: iron and steel (CN 72 to 73) and aluminium (CN 76). More CBAM sectors,
              cement, fertilisers and hydrogen, are in active development. We show you what is live so
              you always know what you are buying.
            </p>
          </div>
          <div>
            <div style={listGroup}>Available now</div>
            {[['Iron & steel', 'CN 72 to 73 · computing now'], ['Aluminium', 'CN 76 · computing now']].map(([name, meta]) => (
              <div key={name} style={listRow}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-ink)', marginBottom: 2 }}>{name}</div>
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{meta}</div>
              </div>
            ))}
            <div style={{ ...listGroup, marginTop: 24 }}>In active development</div>
            {['Cement', 'Fertilisers', 'Hydrogen'].map(sector => (
              <div key={sector} style={listRow}>
                <div style={{ fontSize: 13, color: 'var(--color-ink-2)' }}>{sector}</div>
              </div>
            ))}
          </div>
        </div>
      </ModuleSection>

      {/* ── 4. HOW IT WORKS ── */}
      <ModuleSection>
        <h2 style={sectionTitle}>How it works</h2>
        <div style={{ marginTop: '2rem' }}>
          <ModuleSpine
            bring="Installation data, production volumes, fuel and electricity use."
            applies="The method in the CBAM regulation and its implementing acts, including precursors and indirect emissions."
            get="Specific embedded emissions per good, plus the Annex IV summary and a verifier view."
          />
        </div>
        {/* /cbam/readiness is the page that lists what "installation data" actually means, field by
            field. It had two links on the previous version of this page and would otherwise be
            orphaned by the rebuild. */}
        <p style={{ fontSize: 13, marginTop: '1.25rem' }}>
          <a href="/cbam/readiness" style={{ color: 'var(--color-brand)', fontWeight: 600, textDecoration: 'none' }}>
            See exactly what you will need to bring →
          </a>
        </p>
      </ModuleSection>

      {/* ── 5. EVIDENCE ──
      ⚠️ The second paragraph is NOT a prop. EvidenceSection reads EVIDENCE_BY_MODULE, which marks cbam
      'verifier'. This is the direction Climate Risk could not exercise. */}
      <ModuleSection tinted>
        <EvidenceSection
          moduleKey={KEY}
          workings="Every figure keeps the source streams, the method and the provenance behind it, so a verifier can follow an embedded-emissions number back to the fuel and material inputs it came from."
        />
      </ModuleSection>

      {/* ── 6. WHAT THE MODULE PRODUCES ──
      ⚠️ A LIVE PAGE, NOT A DOCUMENT, and there is no CBAM sample PDF. This is why ModuleOutputs takes a
      `kind`: built for Climate Risk's two PDFs alone it would have forced a document to exist here. */}
      <ModuleSection>
        <ModuleOutputs
          intro="A worked example you can walk through before you enter anything of your own."
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
        <p style={{ fontSize: 13, marginTop: '1.25rem' }}>
          <a href={CBAM_REGULATION_URL} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-brand)', fontWeight: 600, textDecoration: 'none' }}>
            Read the regulation ↗
          </a>
        </p>
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
          <div style={{ background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: '4px solid var(--color-module-cbam)', borderRadius: 6, padding: '2rem' }}>
            <div style={{ ...moduleEyebrow, marginBottom: 8 }}>CBAM</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 400, color: 'var(--color-ink)' }}>
              ${price}
              <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--color-ink-muted)' }}> / reporting year</span>
            </div>
            <div style={{ height: 1, background: 'var(--color-line)', margin: '1.25rem 0' }} />
            {[
              'Installation-level direct and indirect emissions',
              'Precursors carried through, with their origin recorded',
              'Per-country default values where you hold no actuals',
              'Annex IV §1.2 summary, exportable',
              'Customer and verifier grants, each revocable',
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

      {/* ── 9. FOUR QUESTIONS ── */}
      <ModuleSection tinted>
        <h2 style={sectionTitle}>Four questions people ask first</h2>
        <div style={{ marginTop: '2rem', borderTop: '1px solid var(--color-line-strong)' }}>
          {FAQ.map(q => (
            <div key={q.q} style={{ padding: '1.4rem 0', borderBottom: '1px solid var(--color-line)' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ink)', marginBottom: '0.5rem' }}>{q.q}</div>
              <div style={{ fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.75, maxWidth: '68ch' }}>{q.a}</div>
            </div>
          ))}
        </div>
      </ModuleSection>

      {/* ── 10. CLOSING BAND ── */}
      <ClosingBand
        heading="Not sure whether CBAM reaches your goods?"
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
  { title: 'Your EU customer asked',
    body: 'They have to declare embedded emissions for the goods you ship them, and without your figures they need to use default values, which are likely higher than your own data.' },
  { title: 'You are losing on default values',
    body: 'Without your own figures, your goods carry a default that costs your customer more than a competitor with real data.' },
  { title: 'Your embedded emissions need verifying',
    body: 'A verifier cannot sign what they cannot follow. Every figure here keeps its method and its source.' },
] as const

/**
 * ⚠️ "Sector defaults per country" IS TRUE AND NARROWER THAN IT SOUNDS. Per-country defaults exist for
 * both live sectors — 20260727_cbam_steel_percountry_defaults.sql says it "brings steel to parity with
 * aluminium: per-country defaults, chapters 72/73" — and there are no other sectors for "per country" to
 * reach. The sector split rendered below this list is what keeps the scope honest.
 */
const COVERS = [
  ['Direct and indirect emissions', 'At installation level, per production process.'],
  ['Precursors', 'Upstream inputs are carried through rather than assumed, with their origin recorded.'],
  ['Sector defaults per country', 'Used where you do not hold actuals, and replaceable as you get them.'],
  ['The Annex IV summary', 'Exportable and ready to hand over to your EU customer.'],
] as const

/**
 * ⚠️ A PAGE, NOT A DOCUMENT. There is no CBAM sample PDF in public/samples/ — only the two Climate Risk
 * reports — and /cbam/preview is a live worked example, which is a better artefact than a PDF would be.
 * `kind: 'page'` exists for exactly this.
 */
const OUTPUTS: readonly ModuleOutput[] = [
  { kind: 'page', title: 'A worked CBAM report', href: '/cbam/preview',
    body: 'Specific embedded emissions per CN code with the Annex IV §1.2 summary, built from a sample installation.' },
]

const FRAMEWORKS = ['(EU) 2023/956', 'Annex IV', 'Implementing regulations'] as const

/**
 * ⚠️ THE SECTORS ANSWER NAMES TWO, AND MUST. See the note at the top of this file: the seeds cover CN
 * chapters 72, 73 and 76 and nothing else. "Built to take more sectors as they arrive" is supportable —
 * lib/cbam/cn.ts says the ferroalloy rows show "how a future sector is likely to arrive" — but naming
 * cement as covered is not.
 *
 * ⚠️ THE ACCESS ANSWER IS THE ONLY ONE ON ANY MODULE PAGE THAT MAY PROMISE AN OUTSIDE READER. It rests
 * on a real chain: 20260722_cbam_customer_grants.sql, 20260724_cbam_verifier_access.sql, the consent and
 * validate RPCs, 20260726_cbam_verifier_audit_history_rpc.sql, and app/verify-cbam/[token]. "Every
 * access is recorded" is true because those tables carry audit_log triggers; do not copy this answer to
 * a module that has neither.
 */
const FAQ = [
  { q: 'We export to the EU but we are not the importer. Does this apply to us?',
    a: "The obligation is your customer's. The data request is yours. Your EU importer has to declare the embedded emissions of the goods you ship them, and they cannot do it without your figures. ThemisIQ is built around that: you produce the figures and grant them to named customers." },
  { q: 'What if we do not have installation-level data?',
    a: 'You start on default values and replace them as you get actuals. Every figure declares which it is, so you and your verifier can see the split at any point. Nothing is hidden and nothing is assumed.' },
  { q: 'Which sectors are covered?',
    a: 'Iron and steel, and aluminium, with per-country default values and route-level benchmarks for steel. The module is built to take more sectors as they arrive.' },
  { q: 'Can our EU customer see the figures directly?',
    a: 'Yes. You grant access to a named customer, and you can revoke it. The same applies to a verifier, who sees the installation data and the calculation behind every figure. Every access is recorded.' },
] as const

// ── STYLES ────────────────────────────────────────────────────────────────────────────────────────
/** Carried from the previous version of this page, where they lived in app/components/sectionStyles. */
const listGroup: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', paddingBottom: 8, borderBottom: '1px solid var(--color-line-strong)', marginBottom: 4 }
const listRow: React.CSSProperties = { padding: '9px 0', borderBottom: '1px solid var(--color-line)' }
