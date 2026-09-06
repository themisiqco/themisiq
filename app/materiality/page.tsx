'use client'

// app/materiality/page.tsx
// ThemisIQ — the Materiality Assessment module page.
//
// ⚠️ THIS PAGE SELLS, AND IT OWNS A TERM WIDER THAN WHAT IT SELLS. That tension is the reason
// section 4 exists, and it is the one thing about this page that must not be lost.
// Until 26 Aug 2026 this URL was a neutral router carrying no price, under a header reading
// "THIS PAGE SELLS NOTHING, AND THAT IS THE DESIGN" — because "a page named after a concept that
// TWO priced modules deliver cannot name one price without misleading whoever came for the other,
// and a buyer can act on that with a card."
// THE MERGE ANSWERS THAT ARGUMENT RATHER THAN DELETING IT. The page now sells one module and
// prices it. What has not changed is who arrives: this URL owns the generic search term
// "materiality assessment", which neither module name is, so a large share of its visitors need
// Climate Risk and not this. Section 4 is the guardrail — two cards, this one marked "you are
// here", the other a link — and it is deliberately SHORT. It is not an education section; the
// long single-versus-double explainer that used to sit here was written when routing was the
// page's whole job. If section 4 is ever trimmed away as redundant, the wrong-module purchase it
// prevents comes back.
//
// ⚠️ EVERY CSRD DATE AND THRESHOLD IS IMPORTED FROM lib/csrd.ts. NEVER TYPE ONE INTO THIS JSX.
// Both merged pages carried these figures in prose and they had already contradicted each other:
// this page's old §3 said "Wave 2 · 2026 … first ESRS reports starting in 2026 for FY2025 data",
// the pre-Omnibus position, while /impact-materiality — then a separate page, now merged into this
// one and deleted — said FY2027. Importing was the fix, and the merge preserves it: section 5 keeps
// the other page's prose voice and reads every figure from a constant. lib/csrd.ts:7 records the
// same collision from the other side.
// ONE EXCEPTION, NAMED: the roadmap footnote's "1 January 2027" is a statement about what this
// PRODUCT supports, not about CSRD scope, and lib/csrd.ts holds no constant for it.
//
// ⚠️ NO SAMPLE IS PROMISED, AND THAT IS DELIBERATE — carried from the merged page. The two PDFs in
// public/samples are BOTH climate-risk outputs, emitted by a screen gated on
// useEntitlement('climate-risk'), so pointing this page at them would show the buyer the OTHER
// module's deliverable. This module's artefact is the board report built by
// lib/materiality/boardReportPdf.ts. Until a sample of THAT exists, section 7 states that none is
// published and promises nothing. The hero button that used to say "See the sample reports" went
// with the merge for exactly this reason.
//
// ⚠️ THE ROUTE, THE KEY AND THE LABEL NO LONGER READ THE SAME WORD, and that is now permanent.
// The route is /materiality, the ModuleKey is 'double-materiality' (lib/pricing.ts), and the
// display name is 'Materiality Assessment' (lib/pricing.ts MODULES), renamed from 'Impact
// Materiality Assessment' on 26 Aug 2026. The merged
// page's header used to prize their alignment; three renames in one week ended it. Read each from
// its own source and do not "restore" a symmetry the product no longer has.
//
// TEMPLATE. Section rhythm, Nav, Footer and the style consts at the foot of this file come from
// app/deals/page.tsx by way of the merged page. The s{} style object, ghostBtn and gradText that
// this file used as a router are gone: five of its seven sections now come from the other page's
// per-section pattern, and two style systems in one file is one too many.

import Nav from '@/app/components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import {
  CSRD_AS_OF, CSRD_REVISION_NOTE, CSRD_EU_SCOPE_SENTENCE, CSRD_FIRST_REPORT_SENTENCE,
  CSRD_LISTED_SME_SENTENCE, CSRD_NON_EU_SENTENCE,
  CSRD_FIRST_REPORT_FY, CSRD_FIRST_REPORT_PUBLISHED, CSRD_ASSESSMENT_YEAR,
  ESRS_TEN_TOPICS_SENTENCE, ESRS_SET1_CITATION,
} from '@/lib/csrd'


// ─── Diagram palette ──────────────────────────────────────────────────────────
// The supplied SVGs used c-teal / c-purple / c-coral / c-gray, which do not exist in this
// codebase. Both diagrams sit in ONE brand-purple family — a luminance ladder from the
// near-white tint to the darkest ink. The Venn lens and the topic map's summary box share a
// single treatment (PURPLE_TINT ground, PURPLE 2px edge) deliberately, so the two diagrams
// read as one system rather than as two separately-coloured pictures.
const PURPLE_TINT  = '#FAF9FE'  // lens + summary-box ground — SOLID, never an opacity
const PURPLE       = '#7425e3'  // brand purple (CLAUDE.md)
const PURPLE_MID   = '#534AB7'  // mid indigo — left/lens body copy, heavier container strokes
const PURPLE_SLATE = '#3C3489'  // right-circle body copy and its divider only
const PURPLE_INK   = '#26215C'  // darkest — every title in both diagrams

// ⚠️ THE HEADLINE USES THE BRAND GRADIENT; THE DIAGRAMS USE FLAT PURPLE. THE SPLIT IS
// DELIBERATE — DO NOT "ALIGN" THEM. The headline is brand furniture: /climate-risk sets
// "Intelligence" in this gradient and /deals sets "A valuation question." in it, and matching
// that is what puts this page in the family. The diagrams are information design, where colour
// carries meaning — container weight, lens against ground, a five-step luminance ladder — and
// a three-stop gradient would destroy the very thing that makes them readable. Two different
// jobs, two different treatments; consistency between them would be the mistake.
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'

// ⚠️ #7425e3 DECOMPOSED, because a fill-opacity ground needs channels, not a hex string.
// Diagram 2 gets this free from SVG fillOpacity; CSS has no equivalent that tints a box without
// also fading the text inside it, so the same ladder is written as rgba() here. Keep the
// channels in step with PURPLE — they are the same colour by intent, and the evidence cards
// exist to read as the same system as the figures.
const purpleGround = (a: number) => `rgba(116, 37, 227, ${a})`
const INK = '#0d0d0d'; const BODY = '#555553'; const MUTED = '#888784'; const HAIR = '#e8e7e4'
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export default function Page() {
  // Price from the single source of truth. NEVER retype the figure (CLAUDE.md).
  const impactPrice = FLAT_MODULE_PRICES['double-materiality'].toLocaleString('en-US')



  return (
    <div style={{ fontFamily: FONT, background: '#fff', color: INK }}>
      <Nav />

      {/* ═══ 1 · HERO ═══════════════════════════════════════════════════════════ */}
      <section style={{ padding: '5rem 2.5rem 3rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ maxWidth: 760 }}>
            <div style={eyebrow}>ThemisIQ module</div>
            {/* Two-tone, same construction as /climate-risk's "Climate Risk / Intelligence"
                and /deals' "Not a values question. / A valuation question." — see the GRAD note. */}
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.5rem', color: INK }}>
              Materiality<br />
              <span style={{ fontStyle: 'italic', background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Assessment</span>
            </h1>
            <p style={{ fontSize: 17, color: BODY, lineHeight: 1.75, fontWeight: 400, marginBottom: '2rem' }}>
              The impact half of a double materiality assessment, run by your own team: stakeholder engagement, all ten ESRS topics determined in both directions, and a record of who decided what. For companies reporting under CSRD &mdash; and for the suppliers their reporting puts questions to.
            </p>
            {/* ⚠️ THE PRICE LIVES HERE NOW. The merged page carried a standalone pricing card
                (its §6); the hero already had the reader's attention and a second full-width card
                two screens later was a third statement of one number. The figure is READ, never
                typed — see impactPrice above and CLAUDE.md. The card's substance comes with it:
                what the price includes is the part a buyer weighs, not the digits. */}
            <div style={{ fontSize: 15, color: BODY, fontWeight: 400, lineHeight: 1.7, marginBottom: '2rem' }}>
              <span style={{ fontFamily: 'Georgia, serif', fontSize: '1.7rem', color: INK }}>${impactPrice}</span>
              {' '}USD per year &mdash; 365 days of platform access. No per-seat charges, no separate fee for the survey, no extra cost when you bring colleagues in to help. Add Climate Risk and the multi-module discount applies automatically.
            </div>
            {/* Deliberately the SAME two CTAs as section 10. A visitor who reads the whole page
                should not have to scroll back up to act on it. */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/pricing" style={{ ...btnPrimary, textDecoration: 'none' }}>Ready to buy &rarr;</a>
              <a href="mailto:hello@themisiq.co" style={{ ...btnSecondary, textDecoration: 'none' }}>Speak to a specialist &rarr;</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['CSRD', 'ESRS 1', 'ESRS 2', 'Double materiality', 'Stakeholder engagement', 'Value chain'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: BODY }}>{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2 · EVIDENCE CARDS ════════════════════════════════════════════════
          A FULL-WIDTH BAND, NOT A COLUMN BESIDE THE HERO, and that is a layout decision
          rather than a styling one. /climate-risk stacks four cards in the right half of a
          1fr/1fr hero; three do not fill that column, and more importantly a right-hand column
          would put a second vertical axis at ~590px on a page whose every other element is
          left-aligned at 760. The band is the 1100 measure the hairline grids already use.
          ⚠️ "2 · HALVES", NOT "2 · MODULES". CLAUDE.md forbids stating a module COUNT because
          it goes stale — and this one already did, going from one to two on 22 Aug 2026. A
          DOUBLE materiality assessment has exactly two halves by definition, however many
          modules deliver them, so the figure cannot rot. */}
      <section style={{ padding: '0 2.5rem 4rem', maxWidth: 1100, margin: '0 auto', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            // Ground and edge match diagram 2's Environment / Social / Governance containers
            // exactly — same alphas, same strokes. The deepest is the linked card: weight is how
            // "clickable" reads before anyone hovers.
            { val: 'CSRD', unit: 'mandatory',   label: 'double materiality is where reporting starts', alpha: 0.08, edge: PURPLE,     href: null },
            { val: '10',   unit: 'ESRS topics', label: 'each assessed in both directions',             alpha: 0.17, edge: PURPLE,     href: null },
            { val: '2',    unit: 'halves',      label: 'impact here, financial in Climate Risk',       alpha: 0.28, edge: PURPLE_MID, href: '/climate-risk' },
          ].map(({ val, unit, label, alpha, edge, href }) => {
            const box: React.CSSProperties = { background: purpleGround(alpha), borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${edge}`, display: 'block', textDecoration: 'none' }
            const inner = (
              <>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, color: PURPLE, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: PURPLE_INK, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                {/* ⚠️ PURPLE_SLATE, NOT PURPLE_MID, AND THE DEEPEST CARD IS WHY. PURPLE_MID on
                    the 0.28 ground is 4.28:1 — under WCAG AA's 4.5 for 12px/300 normal text.
                    SLATE is 6.35:1 there and clears every lighter ground, so one colour serves
                    all three with no per-card variation. Neither figure hits this pairing:
                    diagram 2's 0.28 container carries only a 14px/500 title and its chips sit on
                    white, so the ladder alone was never a guide for body copy this deep.
                    ⚠️ Grey (#555553) was NOT the failing colour here — it measures 4.62 and
                    passes. Do not "restore" it thinking this was a contrast fix for grey. */}
                <div style={{ fontSize: 12, color: PURPLE_SLATE, marginTop: 6, fontWeight: 400, lineHeight: 1.4 }}>{label}</div>
              </>
            )
            return href
              ? <a key={unit} href={href} style={box}>{inner}</a>
              : <div key={unit} style={box}>{inner}</div>
          })}
        </div>
      </section>

      {/* ═══ 3 · DIAGRAM 1 — THE VENN ═══════════════════════════════════════════
          Supplied SVG. Coordinates, viewBox, title, desc and every text string are unchanged.
          Converted: class attributes → inline fill/stroke/font attributes; hyphenated SVG
          attributes → JSX camelCase; currentColor → literal (the class that defined it is gone);
          the marker's context-stroke → the literal arrow colour, for the same reason. */}
      <section style={{ padding: '3.5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        {/* Moved down from the hero, verbatim, restyled 17px → bodyPara: it is a definition,
            which is body copy, and it sits here because the Venn below illustrates it. */}
        <div style={{ maxWidth: 760, marginBottom: '2.5rem' }}>
          <p style={bodyPara}>
            A double materiality assessment is how a company works out which sustainability topics actually matter to it &mdash; looked at from two directions. Your impact on the world: where your operations and supply chain cause harm or do good. The world&rsquo;s impact on you: where sustainability issues create financial risk or opportunity. A topic is material if it&rsquo;s significant either way. Both halves together are what makes it double.
          </p>
          {/* The /climate-risk link is carried by the module name inside the sentence rather
              than by an appended call to action — the copy already names the other half.
              ⚠️ THIS SENTENCE IS WHERE THE NAMING RULE BITES, AND IT GOVERNS EVERY FUTURE EDIT TO
              THIS PAGE. "Materiality Assessment" is the PRODUCT; "impact materiality" is the AXIS.
              The old name carried the axis inside the product name and explained itself — "the
              Impact Materiality Assessment covers the first half" could not be misread. The new one
              cannot do that work, and the paragraph above defines a double materiality assessment
              as having two halves. So this page must always say the product does the impact SIDE.
              IT MUST NEVER SAY THE PRODUCT IS HALF AN ASSESSMENT: "the Materiality Assessment
              covers the first half" reads as the product being half of itself, which is the exact
              collision the rule forbids. Same line for anything written here later. */}
          <p style={{ ...bodyPara, marginBottom: 0 }}>
            The ThemisIQ Materiality Assessment is the impact side of that, end to end. The financial side is{' '}
            <a href="/climate-risk" style={{ color: INK, fontWeight: 400, textDecoration: 'underline' }}>ThemisIQ Climate Risk</a>
            , and the two are designed to work together.
          </p>
        </div>
        <div style={{ maxWidth: 760 }}>
          <svg width="100%" viewBox="0 0 680 400" role="img" style={{ height: 'auto', display: 'block' }} fontFamily={FONT}>
            <title>The two halves of double materiality</title>
            <desc>Impact materiality and climate risk and materiality overlap as double materiality.</desc>
            <defs><clipPath id="mlens"><circle cx="250" cy="195" r="155" /></clipPath></defs>
            <circle cx="250" cy="195" r="155" fill={PURPLE} fillOpacity="0.10" stroke={PURPLE} strokeWidth="1.5" />
            <circle cx="430" cy="195" r="155" fill={PURPLE} fillOpacity="0.28" stroke={PURPLE_MID} strokeWidth="1.5" />
            <circle cx="430" cy="195" r="155" clipPath="url(#mlens)" fill={PURPLE_TINT} stroke={PURPLE} strokeWidth="2" />
            <text x="165" y="140" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE_INK}>Impact</text>
            <text x="165" y="158" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE_INK}>materiality</text>
            <text x="165" y="184" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_MID}>What you do to</text>
            <text x="165" y="200" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_MID}>the world</text>
            <line x1="128" y1="220" x2="202" y2="220" stroke={PURPLE} strokeWidth="0.5" opacity="0.3" />
            <text x="165" y="240" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_MID}>Value-chain and</text>
            <text x="165" y="256" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_MID}>investor requests</text>
            <text x="515" y="140" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE_INK}>Climate risk &amp;</text>
            <text x="515" y="158" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE_INK}>materiality</text>
            <text x="515" y="184" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_SLATE}>What the world</text>
            <text x="515" y="200" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_SLATE}>does to you</text>
            <line x1="478" y1="220" x2="552" y2="220" stroke={PURPLE_SLATE} strokeWidth="0.5" opacity="0.4" />
            <text x="515" y="240" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_SLATE}>IFRS S2 · ISSB</text>
            {/* ⚠️ NOT reversed out. The lens was a dark coral fill and this text was white; the
                lens is now the near-white PURPLE_TINT ground, so white would be invisible and
                the type goes dark instead. Inverting the fill inverts the type with it. */}
            <g>
              <text x="340" y="158" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE}>Double</text>
              <text x="340" y="176" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE}>materiality</text>
              <line x1="304" y1="196" x2="376" y2="196" stroke={PURPLE} strokeWidth="0.5" opacity="0.4" />
              <text x="340" y="216" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_MID}>CSRD · ESRS</text>
              <text x="340" y="234" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_MID}>Both modules</text>
            </g>
            <text x="340" y="378" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={MUTED}>Each circle is a ThemisIQ module. Buy either on its own — CSRD reporting needs both.</text>
          </svg>
        </div>
      </section>


      {/* ═══ 4 · WHICH MODULE DO I NEED ═════════════════════════════════════════
          ⚠️ A GUARDRAIL, NOT AN EDUCATION SECTION, AND SHORT ON PURPOSE. This URL owns the generic
          term "materiality assessment", which neither module name is, so a large share of the
          people reading this need the OTHER module. Two cards and one paragraph is enough to stop
          a wrong purchase. The long single-versus-double explainer that used to live at this URL
          belonged to a page whose only job was routing; it ran to 58 lines and it is not coming
          back. If this section is ever trimmed away as redundant, the wrong-module purchase it
          prevents comes back with it. */}
      <section style={{ padding: '3.5rem 2.5rem', maxWidth: 1100, margin: '0 auto', borderTop: `0.5px solid ${HAIR}` }}>
        <div style={{ maxWidth: 760, marginBottom: '2rem' }}>
          <h2 style={sectionTitle}>Which module do I need?</h2>
          <p style={{ ...bodyPara, marginBottom: 0 }}>
            Double materiality has two halves, and ThemisIQ sells them separately because they are
            different exercises. This page is the impact half &mdash; how your organisation affects
            people and the environment. The financial half, how sustainability issues affect your
            organisation, is Climate Risk. Reporting under CSRD, you need both. Reporting under
            IFRS S2 alone, you need Climate Risk and not this.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {/* ⚠️ NOT A LINK, AND THE MARKER IS THE POINT. A card linking to the page it sits on is a
              dead click; "you are here" is what tells a reader they have already arrived, which is
              the whole job of a guardrail. */}
          <div style={{ background: PURPLE_TINT, border: `2px solid ${PURPLE}`, borderRadius: 14, padding: '1.5rem 1.75rem' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: PURPLE, marginBottom: 6 }}>The impact half &middot; you are here</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 8 }}>Materiality Assessment</div>
            <p style={{ fontSize: 13, color: BODY, lineHeight: 1.7, margin: 0 }}>
              How your organisation affects people and the environment. Stakeholder engagement, all ten ESRS topics determined by named people, a divergence register and a disclosure roadmap.
            </p>
          </div>
          <a href="/climate-risk" style={{ display: 'block', background: '#fff', border: `0.5px solid ${HAIR}`, borderRadius: 14, padding: '1.5rem 1.75rem', textDecoration: 'none' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#0C447C', marginBottom: 6 }}>The financial half</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: INK, marginBottom: 8 }}>Climate Risk</div>
            <p style={{ fontSize: 13, color: BODY, lineHeight: 1.7, margin: '0 0 12px' }}>
              How sustainability issues affect your organisation. IFRS S2 single materiality, physical and transition risk, multi-scenario resilience, and a ten-topic screening.
            </p>
            <span style={{ fontSize: 13, fontWeight: 600, color: PURPLE }}>Climate Risk &rarr;</span>
          </a>
        </div>
      </section>


      {/* ═══ 5 · DOES THIS APPLY TO YOU, AND WHEN? ══════════════════════════════
          ⚠️ THE PROSE IS THE MERGED PAGE'S; EVERY FIGURE IN IT IS NOW AN IMPORT. This section read
          well and was entirely hand-typed — "more than 1,000 employees", "€450 million",
          "financial year 2027, published in 2028" — while the page it merged into had already
          been through exactly that and fixed it. The old §3 there carried the pre-Omnibus position
          in JSX and contradicted THIS page on the same site; importing was the fix, and its
          comment ended "Do not retype a figure into this JSX; add it to lib/csrd.ts."
          Keeping the voice and importing the numbers is what stops the drift restarting inside one
          file. ⚠️ THE FOURTH PARAGRAPH NAMES THREE YEARS AND TYPES NONE OF THEM. Its urgency IS the
          years — a reader made to carry a date down from the paragraph above has already stopped
          reading — so lib/csrd.ts gained CSRD_FIRST_REPORT_FY, CSRD_FIRST_REPORT_PUBLISHED and
          CSRD_ASSESSMENT_YEAR, and CSRD_FIRST_REPORT_SENTENCE is now derived from the first two.
          The sentence and the single years cannot drift apart, because they are the same numbers.
          ⚠️ CSRD_ASSESSMENT_YEAR IS NOT THE CURRENT YEAR. It is the reporting year minus one — the
          year before collection opens. See its comment: a current-year version would tell a reader
          in 2028 that 2028 is the year to get it done. */}
      <section style={{ padding: '1.5rem 2.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ maxWidth: 760 }}>
          <h2 style={sectionTitle}>Does this apply to you, and when?</h2>
          <p style={bodyPara}>
            If you&rsquo;re in scope for CSRD, it&rsquo;s mandatory and it comes first. CSRD is the EU law setting out who must publish a sustainability report and when; ESRS are the standards defining what goes in it. The law says you must report; the standards say how. Your materiality assessment determines which parts of those standards apply &mdash; so nothing else can be scoped until it&rsquo;s done.
          </p>
          <p style={bodyPara}>
            {CSRD_EU_SCOPE_SENTENCE} {CSRD_FIRST_REPORT_SENTENCE} {CSRD_LISTED_SME_SENTENCE}
          </p>
          <p style={bodyPara}>
            {CSRD_NON_EU_SENTENCE} If you&rsquo;re a US or UK group with EU operations, establish which entity holds the obligation before anyone starts work.
          </p>
          <p style={bodyPara}>
            {CSRD_FIRST_REPORT_PUBLISHED} isn&rsquo;t far away. Your first report covers all of financial year {CSRD_FIRST_REPORT_FY}, so data collection starts in January {CSRD_FIRST_REPORT_FY} &mdash; and the assessment comes first, because it determines what you collect. That makes {CSRD_ASSESSMENT_YEAR} the year it gets done.
          </p>
          <p style={bodyPara}>
            And if you&rsquo;re not in scope, the questions still come &mdash; just from customers, banks and investors rather than a regulator. In-scope companies must report on their value chain, so their suppliers get asked. One assessment, on your schedule, answers every version of that question you&rsquo;ll get this year. The regulation sets the standard; the customers set the timeline.
          </p>
          <p style={{ ...bodyPara, marginBottom: 0 }}>
            Not sure where you sit?{' '}
            <a href="/assess" style={{ color: INK, fontWeight: 400, textDecoration: 'underline' }}>Take the free assessment</a>
            {' '}&mdash; no purchase required.
          </p>
        </div>
      </section>

      {/* ═══ 6 · WHY THEMISIQ ═══════════════════════════════════════════════════ */}
      <section style={{ background: '#f8f7f5', padding: '5rem 2.5rem', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ maxWidth: 760, marginBottom: '2.5rem' }}>
            <h2 style={sectionTitle}>Why ThemisIQ for your Materiality Assessment</h2>
            <p style={{ ...bodyPara, marginBottom: 0 }}>
              This is serious work and it deserves to be done well &mdash; which usually means an expensive engagement, repeated each year. ThemisIQ makes the same methodology something your own team can run.
            </p>
          </div>

          <div style={hairlineGrid2}>
            <div style={hairlineCell}>
              <div style={cellTitle}>The reasoning is captured as you go.</div>
              <p style={cellBody}>
                What separates a strong assessment from a weak one isn&rsquo;t effort &mdash; it&rsquo;s whether you can show how you got there. Every judgement is attributed to the person who made it, with their role. Every threshold and rule is printed in the report. Where your conclusion differs from what stakeholders told you, the difference is recorded and explained, because that&rsquo;s the first thing an assurer asks about.
              </p>
            </div>
            <div style={hairlineCell}>
              <div style={cellTitle}>Stakeholder engagement, handled.</div>
              <p style={cellBody}>
                You decide who to ask; ThemisIQ distributes the questionnaire, chases non-responders and analyses the results. It tells you when your invitation list has a gap &mdash; if no group you invited can speak to a topic, that shows with the reason stated rather than as silence you discover at assurance. Responses stay anonymous by a printed rule. Where stakeholders split sharply, it&rsquo;s flagged rather than averaged away, and where your own workforce describes their conditions differently from workers in your supply chain, the two are shown side by side.
              </p>
            </div>
          </div>

          <p style={{ ...bodyPara, maxWidth: 760, margin: '2.5rem 0 0' }}>
            Ten topics, each assessed twice &mdash; once for harm, once for benefit.
          </p>

          {/* ═══ 6b · DIAGRAM 2 — THE TEN TOPICS ═══════════════════════════════
              Supplied SVG, same conversion rules as diagram 1. Coordinates, viewBox and every
              text string unchanged. Placed mid-section by instruction. */}
          <div style={{ maxWidth: 760, margin: '2.5rem 0 3rem' }}>
            <svg width="100%" viewBox="0 0 680 420" role="img" style={{ height: 'auto', display: 'block' }} fontFamily={FONT}>
              <title>The ten ESRS topics</title>
              <desc>Ten topics in three groups, each assessed twice.</desc>
              <defs>
                <marker id="marr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>
              <g>
                <rect x="40" y="20" width="186" height="252" rx="12" fill={PURPLE} fillOpacity="0.08" stroke={PURPLE} strokeWidth="0.5" />
                <text x="133" y="44" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE_INK}>Environment</text>
              </g>
              <rect x="52" y="66" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="133" y="82" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Climate change</text>
              <rect x="52" y="106" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="133" y="122" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Pollution</text>
              <rect x="52" y="146" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="133" y="162" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Water</text>
              <rect x="52" y="186" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="133" y="202" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Biodiversity</text>
              <rect x="52" y="226" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="133" y="242" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Circular economy</text>
              <g>
                <rect x="247" y="20" width="186" height="252" rx="12" fill={PURPLE} fillOpacity="0.17" stroke={PURPLE} strokeWidth="0.5" />
                <text x="340" y="44" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE_INK}>Social</text>
              </g>
              <rect x="259" y="66" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="340" y="82" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Your workforce</text>
              <rect x="259" y="106" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="340" y="122" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Supply chain workers</text>
              <rect x="259" y="146" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="340" y="162" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Communities</text>
              <rect x="259" y="186" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="340" y="202" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Customers</text>
              <g>
                <rect x="454" y="20" width="186" height="252" rx="12" fill={PURPLE} fillOpacity="0.28" stroke={PURPLE_MID} strokeWidth="0.5" />
                <text x="547" y="44" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE_INK}>Governance</text>
              </g>
              <rect x="466" y="66" width="162" height="32" rx="6" fill="#fff" stroke={HAIR} strokeWidth="0.5" />
              <text x="547" y="82" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={BODY}>Business conduct</text>
              <line x1="340" y1="282" x2="340" y2="308" stroke={MUTED} strokeWidth="1.5" markerEnd="url(#marr)" />
              <g>
                <rect x="110" y="316" width="460" height="70" rx="8" fill={PURPLE_TINT} stroke={PURPLE} strokeWidth="2" />
                <text x="340" y="340" textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="500" fill={PURPLE}>Every topic is assessed twice</text>
                <text x="340" y="362" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="400" fill={PURPLE_MID}>Once for your impact on it · once for its financial effect on you</text>
              </g>
            </svg>
            {/* ⚠️ ATTRIBUTION, NOT ARGUMENT, AND NOT A HOVER. The only thing naming the source of
                these ten boxes was the SVG's <title> — "The ten ESRS topics" — which is a tooltip:
                invisible on touch, invisible in a screenshot, invisible to anyone who does not
                pause the cursor. A visitor saw ten coloured boxes and nothing saying whose
                categories they are.
                INSIDE the diagram's own container, not after it, so the container's 3rem bottom
                margin separates the pair from what follows rather than stranding the caption
                between the picture and the next block.
                ⚠️ THE STRUCTURE IS THE CONSTANT'S, NEVER TYPED HERE. lib/csrd.ts:98 splits the
                Directive from the standards on purpose — "ESRS_TEN_TOPICS_SENTENCE below carries
                the structural half" — because the two rot on different schedules and ESRS's
                topical structure is exactly what a revision touches. Re-typing E1–E5 / S1–S4 / G1
                into this JSX would put the half that moves in the place nobody would check.
                ⚠️ THE LEAD-IN IS LOAD-BEARING, NOT DECORATION, AND IT IS WHY THE CAPTION IS TWO
                SENTENCES. The constant opens "ESRS Set 1 organises THOSE TOPICS into ten topical
                standards" — it was written to sit after CSRD_DOUBLE_MATERIALITY_SENTENCE, which
                named the topics and supplied the antecedent. Standing first under a diagram it
                would open the caption with a pronoun pointing at nothing, so a sentence has to
                precede it. Delete the lead-in and that is the sentence you get.
                ⚠️ AND THE ANTECEDENT IS IMPLIED HERE RATHER THAN SUPPLIED — recorded as a known
                weakness, not as a claim that it is solved. This lead-in names the STANDARDS; the
                constant's "those topics" refers to TOPICS, which only the diagram above states.
                A reader takes it from the picture. It also puts "topical standards" in two
                consecutive sentences. Both were accepted deliberately on 26 Aug 2026 in favour of
                the positive framing — the previous lead-in read "These ten are not ThemisIQ's
                categories", which resolved the pronoun cleanly and opened on a negation. If this
                is ever revisited, the fix is a constant whose first clause names the topics, not
                a third sentence bolted onto the caption. */}
            <p style={{ ...footnote, marginTop: '1rem', marginBottom: 0 }}>
              ThemisIQ follows the ESRS topical standards published by the European Commission. {ESRS_TEN_TOPICS_SENTENCE} {ESRS_SET1_CITATION}.
            </p>
          </div>

          <div style={hairlineGrid2}>
            <div style={hairlineCell}>
              <div style={cellTitle}>The right people make the calls.</div>
              <p style={cellBody}>
                For each topic you decide whether your business is causing harm and whether it&rsquo;s creating benefit, with the stakeholder results on the same screen. You don&rsquo;t have to do it all yourself: assign workforce topics to HR and supply chain topics to procurement, each with a link to their part only. Their name and role appear in the report beside their judgement &mdash; which is what makes a determination defensible. You keep the final say, and any override is recorded with its reason.
              </p>
            </div>
            <div style={hairlineCell}>
              <div style={cellTitle}>You finish with something you can hand over.</div>
              <p style={cellBody}>
                A board report written for directors or senior leadership rather than specialists. Its contents, and the two things that come with it, are set out under <em>What you get</em> below.
              </p>
            </div>
          </div>

          <p style={{ ...bodyPara, maxWidth: 760, margin: '2.5rem 0 0' }}>
            Year two is an update, not a fresh engagement. The process and the reasoning stay in your platform.
          </p>
        </div>
      </section>
      {/* ═══ 7 · WHAT YOU GET ══════════════════════════════════════════════════
          ⚠️ HEADINGS READ FROM lib/materiality/boardReport.ts AND LISTED IN THE ORDER
          boardReportPdf.ts PRINTS THEM — which is NOT their declaration order, and not the
          order a reader would guess: FINDINGS prints SECOND, not ninth, because
          boardReportPdf.ts:561 makes it the most spacious page in the document on purpose
          ("These three numbers are what a director carries out of the room"). ASSESSMENT falls
          behind POLARISATION and CONTRAST; DIFFERENCES falls behind ROADMAP.
          This is a SECOND COPY of those strings and will drift if they change; it is prose
          rather than an import because a marketing page should not pull the PDF builder into
          its bundle. If you touch a *_HEADING constant, touch this list.
          ⚠️ NO SECTION HERE IS CONDITIONAL — verified: every l.heading(…, 1) in the renderer
          sits at the top level of the function, none inside a guard. A section with nothing to
          report prints its own empty-state note (CONTRAST_NONE, the roadmap none_note, the
          polarisation zero-row branch) rather than vanishing. Do not add anything to this list
          that is not in that render path: a contents list promising a section a customer may
          not receive is the defect class this page exists to avoid.
          ⚠️ NO SAMPLE IS PROMISED. Same constraint as the rest of the page. */}
      {/* ⚠️ id="what-you-get" IS LOAD-BEARING AND KEPT ACROSS THE MERGE. It was the target of a
          deliverables card on /materiality — the page this one merged INTO — which linked here
          rather than restating the twelve section names. That card is gone and its one sentence
          that was not a duplicate, "No sample is published", is in the intro below.
          ⚠️ NOTHING IN THIS REPO LINKS TO THIS ANCHOR ANY MORE — verified, and it stays anyway.
          An earlier version of this note claimed HomePricing.tsx and the old /impact-materiality
          route pointed at it; neither ever did. HomePricing's href carried no fragment, and the old
          route was a different page with its own copy of this section. The real reason to keep the
          id is that it is PUBLISHED: /impact-materiality#what-you-get was live for four days and is
          redirected here by next.config.ts, so an external link or a bookmark still lands on it. An
          anchor costs nothing; a stranger's link breaking costs a visit. */}
      <section id="what-you-get" style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto', borderTop: '0.5px solid #e8e7e4', scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 760 }}>
          <h2 style={sectionTitle}>What you get</h2>
          <p style={bodyPara}>
            The deliverable is the <strong>Materiality assessment report</strong> &mdash; a board paper written for directors or senior leadership rather than specialists. <strong>No sample is published.</strong> It prints twelve sections, in this order:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '0 0 1.75rem' }}>
            {([
              ['Purpose and method', null],
              ['Findings', null],
              ['Stakeholder engagement', null],
              ['Stakeholder responses', null],
              ['Divided responses', null],
              // ⚠️ THE GLOSS SHRANK BECAUSE THE HEADING GREW. It read "your own workforce beside
              // workers in your supply chain" — the explanation a two-word heading needed. The
              // heading now says that itself, so the gloss keeps only what it still adds.
              ['Own workforce and value chain', 'the two set beside each other'],
              ['Severity determinations', null],
              ['Disclosure requirements', null],
              ['Divergence register', null],
              ['Method and standards applied', null],
              ['Scope and limitations', null],
              ['Implications', null],
            ] as [string, string | null][]).map(([h, gloss], i) => (
              <div key={h} style={{ display: 'flex', gap: 14, alignItems: 'baseline', fontSize: 15, lineHeight: 1.6 }}>
                <span style={{ color: MUTED, fontWeight: 400, fontVariantNumeric: 'tabular-nums', minWidth: 18, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ color: INK, fontWeight: 400 }}>
                  {h}{gloss && <span style={{ color: MUTED, fontWeight: 400 }}> &mdash; {gloss}</span>}
                </span>
              </div>
            ))}
          </div>
          {/* ⚠️ THIS QUOTES A SECTION NAME AND IS THE THIRTEENTH COPY OF ONE. It missed the
              27 Aug 2026 heading rename by a single paragraph — the list above was updated and this
              sentence still named "What this tells you, beyond compliance" while the list said
              "Implications". If a *_HEADING constant moves, this sentence moves with the list.
              ⚠️ AND THE SENTENCE NOW CARRIES WHAT THE OLD TITLE CARRIED. "What this tells you,
              beyond compliance" explained itself — the words "beyond compliance" were in it. The
              new title does not, so "what the exercise is worth when nobody is making you do it" is
              doing that work alone. It always did it better than the title; do not trim it. */}
          <p style={bodyPara}>
            The last of those, <em>Implications</em>, is the section to read if you want to know what the exercise is worth when nobody is making you do it: where attention is, and where it is not; what the organisation cannot yet see; where the inside and the outside disagree; and what follows from a material topic.
          </p>
          <p style={bodyPara}>Two more things come out of the same work:</p>
          <p style={bodyPara}>
            A disclosure roadmap listing which requirements your conclusions have triggered, so you know the reporting workload before you start it.
          </p>
          <p style={{ ...bodyPara, marginBottom: 0 }}>
            A versioned record that freezes what you decided, under which version of the standards, and when.
          </p>
        </div>
      </section>
      {/* ═══ 8 · IF YOU ALREADY HAVE CLIMATE RISK ════════════════════════════════
          Copy implies neither a migration nor a stranded customer, per lib/pricing.ts:30-41:
          nobody held 'climate-risk' when the split happened, so neither occurred. */}
      <section style={{ background: '#f8f7f5', padding: '5rem 2.5rem', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ maxWidth: 760 }}>
            <h2 style={sectionTitle}>If you already have Climate Risk</h2>
            <p style={bodyPara}>
              That module screens all ten topics on both axes, so you already have a first-pass view of where your impacts sit. What it can&rsquo;t do is meet the ESRS requirement that your impact conclusions be informed by the people affected by them &mdash; its own report says so, on the cover.
            </p>
            <p style={{ ...bodyPara, marginBottom: 0 }}>
              This module is what closes that gap: real stakeholder engagement, determinations made by named people, and a record that holds up when someone asks how you got there.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 9 · DECISION BLOCK — PLAIN ARROW LINES, NOT BULLETS ════════════════
          Deliberately not a <ul>. No markers, no cells, no card. The arrow inside each line is
          the copy's own separator and the only ornament — five seconds to scan. */}
      <section style={{ padding: '4.5rem 2.5rem 3rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.5rem', fontWeight: 400, color: INK, marginBottom: '1.5rem' }}>Not sure which to buy?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              ['Reporting under CSRD', 'both.'],
              ['Reporting under IFRS S2', 'Climate Risk on its own.'],
              ['Answering customer questionnaires', 'this one.'],
            ].map(([cond, ans]) => (
              <div key={cond} style={{ fontSize: 17, color: INK, fontWeight: 400, lineHeight: 1.5 }}>
                {cond}
                <span aria-hidden style={{ color: PURPLE, margin: '0 12px' }}>&rarr;</span>
                <span style={{ fontWeight: 400 }}>{ans}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 15, color: BODY, fontWeight: 400, lineHeight: 1.7, margin: '1.75rem 0 0' }}>
            Buy both and the multi-module discount applies automatically.
          </p>
        </div>
      </section>

      {/* ═══ 10 · TWO CTAs ══════════════════════════════════════════════════════ */}
      <section style={{ padding: '2rem 2.5rem 4rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ maxWidth: 760, display: 'flex', gap: 12, flexWrap: 'wrap' as const }}>
          <a href="/pricing" style={{ ...btnPrimary, textDecoration: 'none' }}>Ready to buy &rarr;</a>
          <a href="mailto:hello@themisiq.co" style={{ ...btnSecondary, textDecoration: 'none' }}>Speak to a specialist &rarr;</a>
        </div>
      </section>

      {/* ═══ 11 · FOOTNOTES ════════════════════════════════════════════════════ */}
      <section style={{ padding: '0 2.5rem 4rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ maxWidth: 760 }}>
          <p style={footnote}>
            Scope thresholds and reporting dates {CSRD_AS_OF}. {CSRD_REVISION_NOTE} If you&rsquo;re close to a threshold, check your position rather than relying on a summary.
          </p>
          <p style={{ ...footnote, marginBottom: 0 }}>
            The ThemisIQ Materiality Assessment currently supports the revised ESRS standards, required for financial years beginning on or after 1 January 2027. The 2023 standards and transitional reliefs are on the roadmap.
          </p>
        </div>
      </section>

      <Footer />

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

// ─── Styles — same set as app/deals/page.tsx, plus bodyPara / footnote / 2-col grid ──────
const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const bodyPara: React.CSSProperties = { fontSize: 15, color: '#555553', fontWeight: 400, lineHeight: 1.8, marginBottom: '1.25rem' }
const footnote: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 400, lineHeight: 1.7, marginBottom: '1rem' }
const cellTitle: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: '#0d0d0d', marginBottom: 10 }
const cellBody: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.75, margin: 0 }
// Two-column variant of the hairline grid used on /deals and /climate-risk — 1px gaps over a
// #e8e7e4 ground so the cell backgrounds draw the rules.
const hairlineGrid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }
const hairlineCell: React.CSSProperties = { background: '#fff', padding: '2rem' }