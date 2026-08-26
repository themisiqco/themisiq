'use client'

// app/materiality/page.tsx
// ThemisIQ — Materiality: the EXPLAINER AND ROUTER between /climate-risk and /impact-materiality.
//
// ⚠️ THIS PAGE SELLS NOTHING, AND THAT IS THE DESIGN. It carries no price, no /order link and no
// cart. Until 23 August 2026 it sold Climate Risk at Climate Risk's price under a header comment
// reading "THERE IS NO MATERIALITY MODULE TO BUY" — true when written, false from 22 August, when
// impact-materiality became its own $4,900 module (lib/pricing.ts:193). A page named after a
// concept that TWO priced modules deliver cannot name one price without misleading whoever came
// for the other, and a buyer can act on that with a card.
//
// WHAT ITS JOB IS NOW. It owns the generic search term — "materiality assessment" — which neither
// module name is, and which the homepage capability strip promises ("Single or double · which one
// applies to you" → "See sample reports →"). It answers that question, shows the two samples, and
// hands off. Its success measure is the CORRECT MODULE REACHED, not an order placed.
//
// ⚠️ THE TWO SAMPLES ARE BOTH CLIMATE-RISK OUTPUTS and belong here, not on /impact-materiality.
// The CSRD one is emitted by app/dashboard/materiality/report/page.tsx:528, which gates on
// useEntitlement('climate-risk') and whose own comment records that nothing in it reads a
// determination, a survey response or a finalisation. "The difference is the standard, not the
// engine" is therefore TRUE of these two documents, and it stays. What was removed is the hero's
// broader "through one engine", which claimed the same thing about materiality at ThemisIQ as a
// whole — where it is no longer true. Same words, different scope, different verdict.

import Link from 'next/link'
import Nav from '@/app/components/Nav'
import Footer from '@/app/components/Footer'
import { IFRS_S2_STATUS_SENTENCE, IFRS_S2_SHORT } from '@/lib/ifrsS2'
import {
  CSRD_SHORT, CSRD_EU_SCOPE_SENTENCE, CSRD_FIRST_REPORT_SENTENCE, CSRD_LISTED_SME_SENTENCE,
  CSRD_NON_EU_SENTENCE, CSRD_DOUBLE_MATERIALITY_SENTENCE, ESRS_TEN_TOPICS_SENTENCE,
  CSRD_AS_OF, CSRD_REVISION_NOTE,
} from '@/lib/csrd'

const GRAD = 'linear-gradient(135deg, #7425e3, #1fb1ff, #64fe3e)'

// ─── Page-level shared styles ────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  page: { fontFamily: 'system-ui, sans-serif', background: '#f8f7f5', minHeight: '100vh' },
  wrap: { maxWidth: 860, margin: '0 auto', padding: '0 2rem' },
  section: { padding: '3rem 0', borderBottom: '0.5px solid #e8e7e4' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 10 },
  sectionLead: { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.8, marginBottom: 24 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#7425e3', marginBottom: 8 },
}

const gradText: React.CSSProperties = {
  background: GRAD, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
}

const ghostBtn: React.CSSProperties = {
  padding: '11px 22px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  color: '#0d0d0d', background: '#fff', border: '1px solid #e8e7e4',
  cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block',
}

export default function MaterialityRouterPage() {
  return (
    <div style={s.page}>
      <Nav />

      <div style={s.wrap}>

        {/* ═══ 1 · HERO ═══════════════════════════════════════════════════════
            ONE LINK, and it is the anchor. The homepage capability strip's CTA is literally
            "See sample reports →", so a visitor arriving on that promise reaches them in one
            click. The price button, the /order link and the "Talk to a specialist" button that
            used to sit here are gone — routing happens at §7, not in the hero. */}
        <section style={{ ...s.section, paddingTop: '4rem', textAlign: 'center', borderBottom: 'none' }}>
          <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#7425e3', border: '1px solid rgba(116,37,227,0.2)', borderRadius: 99, padding: '4px 14px', marginBottom: 16 }}>
            IFRS S2 · CSRD · ESRS · single and double materiality
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 400, color: '#0d0d0d', lineHeight: 1.2, marginBottom: 16 }}>
            The Materiality Assessment<br />
            <span style={gradText}>Which one applies to you.</span>
          </h1>
          <p style={{ fontSize: 15, color: '#555553', fontWeight: 300, lineHeight: 1.8, maxWidth: 620, margin: '0 auto 28px' }}>
            A materiality assessment determines which sustainability topics matter enough to report on, and documents how you reached that judgment. IFRS S2 asks one question and CSRD asks two &mdash; and which half you need is what decides which ThemisIQ module you need.
          </p>
          {/* ⚠️ A CROSS-PAGE LINK, NOT AN IN-PAGE JUMP, since 26 Aug 2026. The samples moved to
              /climate-risk with their anchor; this page has none. The label still promises sample
              reports because they still exist — they are just somewhere else. Revisited at the
              merge, when this page has samples of its own again. */}
          <a href="/climate-risk#samples" style={ghostBtn}>See the sample reports &darr;</a>
        </section>

        {/* ═══ 2 · WHAT IS IT — PROMOTED ABOVE THE URGENCY BLOCK ═══════════════
            The homepage strip now asks "Single or double · which one applies to you", so a
            visitor arriving on that promise meets the difference immediately. Urgency-first was
            right when this page was selling — establish the deadline, then the product. A router
            explains first and says when it bites second. */}
        <section style={s.section}>
          <div style={s.eyebrow}>What is a materiality assessment?</div>
          <h2 style={s.sectionTitle}>Single materiality, double materiality &mdash; what&apos;s the difference?</h2>
          <p style={s.sectionLead}>
            Both frameworks ask you to identify which sustainability topics are material. They differ on what counts as material &mdash; and that distinction is what separates an S2 disclosure from a CSRD disclosure.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 6 }}>Single (financial) materiality</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 8 }}>IFRS S2 / ISSB</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                The <strong>outside-in</strong> view: how do climate-related (and broader sustainability) risks affect the entity&apos;s enterprise value? One axis: financial impact.
              </p>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ba7517', marginBottom: 6 }}>Double materiality</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 8 }}>CSRD / ESRS</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                Single materiality <em>plus</em> the <strong>inside-out</strong> view: how does the entity affect people and the environment? Two axes: financial and impact materiality, plotted as a matrix.
              </p>
            </div>
          </div>

          {/* The two-axis matrix concept. Unchanged — it audited as true, it is the only
              illustration of the concept on the site, and it is what the samples show. */}
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#888784', marginBottom: 12, textAlign: 'center' }}>The double materiality matrix</div>
            <svg viewBox="0 0 500 280" style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Double materiality matrix illustration">
              <line x1={60} y1={20} x2={60} y2={240} stroke="#888784" />
              <line x1={60} y1={240} x2={460} y2={240} stroke="#888784" />
              <line x1={60} y1={130} x2={460} y2={130} stroke="#e8e7e4" strokeDasharray="4 4" />
              <line x1={260} y1={20} x2={260} y2={240} stroke="#e8e7e4" strokeDasharray="4 4" />
              <text x={20} y={130} textAnchor="middle" fontSize={11} fill="#555553" transform="rotate(-90 20 130)">Financial materiality →</text>
              <text x={260} y={268} textAnchor="middle" fontSize={11} fill="#555553">Impact materiality →</text>
              <text x={52} y={26} textAnchor="end" fontSize={10} fill="#888784">High</text>
              <text x={52} y={240} textAnchor="end" fontSize={10} fill="#888784">Low</text>
              <text x={160} y={80} textAnchor="middle" fontSize={11} fill="#bbb">Financial only</text>
              <text x={360} y={80} textAnchor="middle" fontSize={11} fontWeight={600} fill="#A32D2D">Material on both</text>
              <text x={160} y={195} textAnchor="middle" fontSize={11} fill="#bbb">Lower priority</text>
              <text x={360} y={195} textAnchor="middle" fontSize={11} fill="#bbb">Impact only</text>
              <circle cx={350} cy={70} r={14} fill="#A32D2D" opacity={0.88} />
              <text x={350} y={74} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">E1</text>
              <circle cx={390} cy={95} r={14} fill="#A32D2D" opacity={0.88} />
              <text x={390} y={99} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">E2</text>
              <circle cx={310} cy={170} r={14} fill="#ba7517" opacity={0.88} />
              <text x={310} y={174} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">S2</text>
              <circle cx={130} cy={210} r={14} fill="#888784" opacity={0.88} />
              <text x={130} y={214} textAnchor="middle" fontSize={11} fontWeight={700} fill="#fff">S4</text>
            </svg>
            <p style={{ fontSize: 12, color: '#888784', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.6 }}>
              Each ESRS topic is plotted on both axes. Topics in the top-right are material on both &mdash; your highest reporting and management priority.
            </p>
          </div>
        </section>

        {/* ═══ 3 · WHY NOW — BOTH SIDES NOW CONSTANT-BACKED ════════════════════
            ⚠️ EVERY DATE AND THRESHOLD BELOW IS IMPORTED. The CSRD card used to be hand-typed
            and said "Wave 2 · 2026 … first ESRS reports starting in 2026 for FY2025 data;
            Wave 2 listed SMEs follow for FY2026" — the pre-Omnibus position, contradicted by
            /impact-materiality on the same site. The IFRS S2 card beside it never drifted,
            because it reads IFRS_S2_STATUS_SENTENCE. Both sides now read from a constant. Do not
            retype a figure into this JSX; add it to lib/csrd.ts. */}
        <section style={s.section}>
          <div style={s.eyebrow}>Why now</div>
          <h2 style={s.sectionTitle}>Both frameworks make you determine it &mdash; and show your working.</h2>
          <p style={s.sectionLead}>
            Both major global frameworks now require entities to formally determine which sustainability topics are material &mdash; and to document the methodology behind that judgment. Auditors and assurance providers expect to see this work, not just its conclusions.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 8 }}>
            <div style={{ background: '#E6F1FB', border: '1px solid rgba(12,68,124,0.15)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 6 }}>IFRS S2 / ISSB</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>{IFRS_S2_SHORT}</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                {IFRS_S2_STATUS_SENTENCE} S2 requires identifying climate-related risks and opportunities that could reasonably be expected to affect enterprise value &mdash; a single (financial) materiality judgment.
              </p>
            </div>
            <div style={{ background: '#FEF3E2', border: '1px solid rgba(186,117,23,0.15)', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#ba7517', marginBottom: 6 }}>CSRD / ESRS</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>{CSRD_SHORT}</div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>
                {CSRD_EU_SCOPE_SENTENCE} {CSRD_FIRST_REPORT_SENTENCE} {CSRD_LISTED_SME_SENTENCE} {CSRD_DOUBLE_MATERIALITY_SENTENCE} {ESRS_TEN_TOPICS_SENTENCE}
              </p>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.7, marginTop: 14 }}>
            {CSRD_NON_EU_SENTENCE} Scope thresholds and reporting dates {CSRD_AS_OF}. {CSRD_REVISION_NOTE} If you are close to a threshold, check your position rather than relying on a summary.
          </p>
        </section>

        {/* ═══ 4 · WHO IN YOUR ORG ═════════════════════════════════════════════
            ⚠️ REWRITTEN TO BE MODULE-NEUTRAL. The four cards used to describe one module's
            OUTPUT — the Sustainability card promised "double materiality matrix, full ESRS topic
            coverage", which is the climate-risk screening. On a page that stands above both
            modules the cards have to describe what the QUESTION means for each role. The
            Sustainability card now names the stakeholder engagement ESRS requires, which is the
            impact half, and is the first place on this page that the handoff is visible. */}
        <section style={s.section}>
          <div style={s.eyebrow}>Who needs this in your organization</div>
          <h2 style={s.sectionTitle}>Compliance, Legal, Finance, or Sustainability &mdash; whoever is holding the question.</h2>
          <p style={s.sectionLead}>
            Sustainability disclosure obligations are landing across functions. Many organizations don&apos;t yet have a dedicated sustainability lead &mdash; the responsibility falls to whoever is closest to the regulatory exposure. This page is written to be useful regardless of where you sit.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginTop: 8 }}>
            {[
              { who: 'Compliance', what: 'A documented methodology and an audit trail — the working, not just the conclusion. It is the working an assurance provider asks for first.' },
              { who: 'Legal', what: 'Framework alignment stated, limitations stated, and no licensed third-party classification reproduced. What is claimed, and what is not.' },
              { who: 'Finance', what: 'The financial-materiality axis, and the scenario rationale IFRS S2 and ESRS both require you to state rather than assume.' },
              { who: 'Sustainability', what: 'Both axes across the ten ESRS topics — including the stakeholder engagement ESRS requires on the impact side, which is a separate exercise from scoring.' },
            ].map(role => (
              <div key={role.who} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem 1.25rem' }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 6 }}>{role.who}</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{role.what}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══ 5 · THE DELIVERABLES ════════════════════════════════════════════
            The destination of the homepage strip's "See sample reports →".
            ⚠️ THE TWO DOWNLOADABLE SAMPLES LEFT THIS PAGE on 26 Aug 2026. Both were climate-risk
            outputs — this page's own header has said so since it was written — and they now live
            on /climate-risk#samples beside the module that generates them.
            THE ANCHOR WENT WITH THEM. This section carries no id: an anchor is a promise about
            content, and #samples now names the section on /climate-risk. There is deliberately no
            stub here — two pages answering to one anchor name is the drift this file's own header
            warns about at :148.
            ⚠️ THE HOMEPAGE STRIP STILL POINTS HERE AND MUST BE REPOINTED. app/page.tsx's
            "See sample reports →" points at /materiality#samples, an anchor this page no longer
            has, so it lands at the top of a page with nothing to download. Named rather than
            fixed, because it is a change to a file this move did not touch.
            ⚠️ THE HEADING CARRIES NO COUNT AND NO DATE, ON PURPOSE. "One document, no sample yet"
            would be accurate today and stale the day a board-report sample ships — the one change
            we know is coming. "What the impact side produces" survives it, and so does the card
            beneath: only its last sentence changes.
            ⚠️ THE CARD PROMISES NOTHING. No "coming soon", no date, no "shortly". It describes the
            document and states that no sample is published. That is the whole of it.
            ⚠️ IT LISTS NO SECTION NAMES. lib/materiality/boardReport.ts is the source, and
            /impact-materiality's contents list is already a second copy of those twelve strings
            and says so in its own comment. A third copy here — on a page that is not even the
            module's own — would drift somewhere nobody would look. "Twelve sections" is a count,
            not one of the strings. The card's title IS TITLE from boardReport.ts: one string, and
            a card naming a document has to name it. The link carries the rest. */}
        <section style={{ ...s.section, scrollMarginTop: 80 }}>
          <div style={s.eyebrow}>See the deliverables</div>
          <h2 style={s.sectionTitle}>What the impact side produces.</h2>
          <p style={s.sectionLead}>
            CSRD asks about your impacts on people and the environment, and the answer is a document of its own: a board paper setting out which topics your organisation concluded were material, what the people affected by them said, and how the two were weighed. It is written to be read by directors and handed to an auditor. Sample reports for the climate side are on the <Link href="/climate-risk#samples" style={{ color: '#7425e3' }}>climate risk page</Link>.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginTop: 8 }}>
            {/* Visually subordinate: hairline border not 2px, neutral header not a tint, a text
                link not a button — because there is nothing to download. It was one of three and
                spanned the row to keep the two downloadable cards at their width; those two left
                on 26 Aug 2026, so the grid is one column and the span is gone. Rendered width is
                unchanged — spanning 1/-1 of a two-column grid was already full width. */}
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ background: '#f8f7f5', padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #e8e7e4' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>CSRD / ESRS &mdash; the impact side</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: '#0d0d0d' }}>Impact materiality report</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 4 }}>Board paper · twelve sections</div>
                <div style={{ fontSize: 11, color: '#555553', fontWeight: 600, marginTop: 6 }}>From Impact Materiality Assessment</div>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 14 }}>
                  Built from stakeholder responses and the determinations recorded against them, written for directors rather than specialists. <strong>No sample is published.</strong>
                </div>
                <Link href="/impact-materiality#what-you-get" style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', textDecoration: 'none' }}>See what is in it &rarr;</Link>
              </div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: '#888784', lineHeight: 1.7, marginTop: 16, fontStyle: 'italic' }}>
            Samples are illustrative outputs from the live tool, generated for a fictional entity. Your own report would be specific to your inputs and saved to your private account.
          </p>
        </section>

        {/* ═══ 6 · THE HONESTY BOX, TURNED INTO THE HANDOFF ════════════════════
            This box is the best thing on the old page and the only survivor of its "Why ThemisIQ"
            section — the four methodology cards that surrounded it (IPCC AR6 regions, TCFD
            categories, ESRS topics, SSP/NGFS scenarios) were climate-risk's methodology argued on
            a page that stands above both modules, and they went with it. So did the
            dangerouslySetInnerHTML they were rendered through, which existed to emit one &amp;.
            WHAT CHANGED IN THE BOX ITSELF: it lists three things a fully compliant ESRS
            assessment additionally requires. When it was written, all three were the reader's
            problem and the box left them at a dead end. One of the three is now a ThemisIQ
            module. Naming which is the difference between honesty and a lost customer — and the
            honesty is unchanged either way, because the requirement was always real.
            ⚠️ THE TWO CLAIMS ARE DELIBERATELY ASYMMETRIC, AND THAT IS NOT AN INCONSISTENCY.
            Climate Risk's resilience analysis SUPPORTS the resilience requirement — it is a
            screening across three scenarios, not the assessment the standards ask for, which is
            why five strings on /climate-risk were changed from "the resilience analysis IFRS S2
            and CSRD call for" to "screening-level support for" it on 23 Aug 2026. The Impact
            Materiality Assessment DOES the stakeholder engagement: it runs the survey, holds the
            responses and records determinations against them. One is a screening standing in for
            an exercise; the other is the exercise. Do not level the two verbs. */}
        <section style={s.section}>
          <div style={s.eyebrow}>What a screening is, and is not</div>
          <h2 style={s.sectionTitle}>What a full ESRS assessment also needs.</h2>
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem 1.75rem' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Intellectual honesty</div>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.7, margin: '0 0 12px' }}>
              The reports above are a <strong style={{ color: '#fff' }}>structured screening</strong>, intended to scope and support a formal IFRS S2 disclosure or CSRD double materiality assessment. Every report says so on its cover, not in fine print.
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.7, margin: 0 }}>
              A fully compliant ESRS assessment additionally requires a materiality threshold agreed and documented by your governance body, resilience testing across a range of scenarios, and stakeholder engagement informing the impact axis. The first is yours to set. Climate Risk&apos;s resilience analysis is screening-level support for the second, not the second itself. The third is what the{' '}
              <Link href="/impact-materiality" style={{ color: '#fff', textDecoration: 'underline' }}>Impact Materiality Assessment</Link>
              {' '}does &mdash; and it is a separate module because it is a separate exercise: a stakeholder survey, named contributors, and determinations recorded against what they told you.
            </p>
          </div>
        </section>

        {/* ═══ 7 · ROUTE ═══════════════════════════════════════════════════════
            ⚠️ THIS IS WHERE THE PRICING TEASER USED TO BE, AND IT IS NOT COMING BACK.
            That section offered two priced combinations. The CSRD one ran
            cartQuote(['ghg','climate-risk','supply-chain','people']) under a card headed "For
            CSRD reporting" — and the fix is NOT to add 'impact-materiality' to that array.
            lib/obligations.ts:78-82 records why CSRD MAPS TO NO MODULE BUNDLE AT ALL: CSRD
            requires ESRS G1 business conduct and NO MODULE COVERS G1, so any "For CSRD
            reporting" bundle sells a partial answer as a whole one on the surface a buyer uses
            to decide what to buy. That entry "lands when G1 ships, not before" — and the same
            rule binds this page. Do not complete this card. Route instead.
            Checked 23 Aug 2026: those two arrays were the ONLY hardcoded module lists passed to
            cartQuote anywhere in the codebase; every other call site passes a user-selected set.
            ⚠️ NO PRICE AND NO /order LINK BELOW, deliberately. Both modules carry their own price
            on their own page and on /pricing. /advisory is a link, not a sale. */}
        <section style={{ ...s.section, borderBottom: 'none', paddingBottom: '5rem' }}>
          <div style={s.eyebrow}>Which one you need</div>
          <h2 style={s.sectionTitle}>Two halves. Two modules. Take the one your obligation asks for.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 8 }}>
            <Link href="/climate-risk" style={{ display: 'block', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.5rem 1.75rem', textDecoration: 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 6 }}>The financial half</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#0d0d0d', marginBottom: 8 }}>Climate Risk &amp; Materiality</div>
              <p style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, margin: '0 0 12px' }}>
                How sustainability issues affect the entity. IFRS S2 single materiality, physical and transition risk, multi-scenario resilience, and the ten-topic screening the samples above came from.
              </p>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#7425e3' }}>Climate Risk &amp; Materiality &rarr;</span>
            </Link>
            <Link href="/impact-materiality" style={{ display: 'block', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1.5rem 1.75rem', textDecoration: 'none' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1e1b4b', marginBottom: 6 }}>The impact half</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#0d0d0d', marginBottom: 8 }}>Impact Materiality Assessment</div>
              <p style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, margin: '0 0 12px' }}>
                How the entity affects people and the environment. Stakeholder engagement, all ten ESRS topics determined by named people, a divergence register and a disclosure roadmap.
              </p>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#7425e3' }}>Impact Materiality Assessment &rarr;</span>
            </Link>
          </div>
          <p style={{ fontSize: 14, color: '#0d0d0d', fontWeight: 400, lineHeight: 1.8, marginTop: 18 }}>
            Reporting under CSRD? You need both. Reporting under IFRS S2? Climate Risk on its own.
          </p>
          <p style={{ fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.8, marginTop: 6 }}>
            Still not sure which half you are being asked for? <Link href="/advisory" style={{ color: '#555553', textDecoration: 'underline' }}>Talk to a specialist</Link>.
          </p>
        </section>

      </div>

      <Footer />
    </div>
  )
}
