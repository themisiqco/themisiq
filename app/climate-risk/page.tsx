'use client'
import Nav from '../components/Nav'
import { FLAT_MODULE_PRICES } from '@/lib/pricing'
import { SB261_TABLE_STATUS } from '@/lib/sb261'
import { IFRS_S2_ADOPTION_COUNT, IFRS_S2_ADOPTION_SOURCE } from '@/lib/ifrsS2'
import Footer from '@/app/components/Footer'
export default function Page() {
  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* DEMAND BANNER — climate risk is demand-driven, not just regulation-driven */}
      <div style={{ background: '#0C447C', padding: '10px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' as const }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>Investors, lenders, boards, and regulators are all asking for climate risk disclosure. One assessment answers them all.</span>
        <a href="/dashboard/climate-risk" style={{ fontSize: 12, fontWeight: 600, color: '#fff', textDecoration: 'underline' }}>Assess your climate risk →</a>
      </div>

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 8 }}>ThemisIQ Climate</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              Climate Risk<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Intelligence</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              Whether the request comes from an investor, a lender, your board, or a regulator — produce a defensible, TCFD-aligned climate risk assessment. Physical and transition risk across three IPCC scenarios. IFRS S2, CSRD ESRS E1, and SB 261 ready, from one assessment.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
              <a href="/dashboard/climate-risk" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your climate risk →</a>
              <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Book a demo</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['TCFD', 'IFRS S2', 'CSRD ESRS E1', 'SB 261', 'UK SRS', 'Physical risk', 'Transition risk', 'Scenario analysis'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS — stacked, not 2x2. The IFRS S2 card carries IFRS_S2_ADOPTION_COUNT WHOLE
              (lib/ifrsS2.ts forbids decomposing it: '28' alone is the figure that started this), and
              the whole string needs the full column width to read. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {[
              { val: '4', unit: 'stakeholders', label: 'investors · lenders · boards · regulators', source: null, color: '#0C447C', bg: '#E6F1FB' },
              { val: 'IFRS S2', unit: 'per jurisdiction', label: IFRS_S2_ADOPTION_COUNT, source: IFRS_S2_ADOPTION_SOURCE, color: '#7425e3', bg: '#EDE9FE' },
              { val: '3', unit: 'scenarios', label: 'IPCC pathways modelled', source: null, color: '#ba7517', bg: '#FEF3E2' },
              { val: '2', unit: 'risk types', label: 'physical & transition', source: null, color: '#0F6E56', bg: '#E1F5EE' },
            ].map(({ val, unit, label, source, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${color}22` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{label}</div>
                {source && <div style={{ fontSize: 11, color: '#888784', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{source}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHO'S ASKING — demand drivers */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ marginBottom: '2.5rem', maxWidth: 620 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Why companies do this</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              Regulation is only part of the story.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300 }}>
              Most climate risk reporting isn&apos;t triggered by a law at all — it&apos;s triggered by someone you answer to. Climate risk has become a standard part of how capital, credit, and commercial relationships are evaluated.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {[
              { who: 'Investors', desc: 'Institutional investors and PE/VC backers increasingly require TCFD- or IFRS S2-aligned climate risk disclosure as part of diligence and ongoing portfolio monitoring. PRI signatories ask portfolio companies directly.', color: '#7425e3' },
              { who: 'Banks & lenders', desc: 'Climate risk assessment is now routine in credit decisions and loan covenants. Lenders need to understand the physical and transition risk on their books — and they push that requirement down to borrowers.', color: '#1fb1ff' },
              { who: 'Boards & audit committees', desc: 'Directors carry oversight duty for material climate risk. A structured assessment gives the board the documented risk picture they need — and protects them if exposure is later questioned.', color: '#64fe3e' },
              { who: 'Customers & supply chain', desc: 'Large buyers cascade their own climate commitments down to suppliers. A credible risk assessment is increasingly a condition of winning or keeping enterprise contracts.', color: '#ba7517' },
            ].map(({ who, desc, color }) => (
              <div key={who} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '1.5rem' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color, marginBottom: 8 }}>{who}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 300, lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Platform capabilities</div>
          <h2 style={sectionTitle}>Everything your risk report needs.</h2>
          <p style={sectionSub}>Built for sustainability and finance teams. Aligned to what regulators, lenders, and investors expect.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { title: 'Guided risk assessment', desc: 'Step-by-step through governance, strategy, risk management, and metrics — the four TCFD pillars that IFRS S2, CSRD, and SB 261 all build on. No blank framework documents.' },
            { title: 'Physical risk screening', desc: 'Acute and chronic physical hazards — flood, heat, wildfire, water stress — screened against your facility locations across IPCC scenarios.' },
            { title: 'Transition risk analysis', desc: 'Policy, legal, technology, market and reputation risks modelled across three IPCC pathways, each scored and compared against the other two.' },
            { title: 'Scenario modelling', desc: 'Three IPCC scenarios so your disclosure shows resilience under multiple climate futures — the scenario analysis investors and IFRS S2 expect.' },
            { title: 'Immutable audit trail', desc: 'Every entry, edit, and deletion is logged with user, timestamp, and previous value — written by the database, not the application.' },
            { title: 'Multi-framework export', desc: 'One assessment maps to TCFD, IFRS S2, CSRD ESRS E1, and SB 261 — a publishable, board-ready climate-related financial risk report in your branding.' },
          ].map(({ title, desc }) => (
            <div key={title} style={{ background: '#fff', padding: '2rem' }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FLAGSHIP — RESILIENCE REPORT DEPTH */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto', borderTop: '0.5px solid #e8e7e4' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Flagship output</div>
          <h2 style={sectionTitle}>The resilience report, in depth.</h2>
          <p style={sectionSub}>IFRS S2 and CSRD/ESRS ask for resilience across a diverse range of climate futures — and for the judgment behind it to be documented. ThemisIQ produces exactly that, with every figure traceable to its basis.</p>
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12, textAlign: 'center' }}>Tested across a diverse trio of scenarios</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2.5rem' }}>
          {[
            { role: 'Paris-aligned', warming: '~1.8°C', src: 'IPCC SSP1-2.6', color: '#0F6E56', bg: '#E1F5EE' },
            { role: 'Current trajectory', warming: '~2.7°C', src: 'IPCC SSP2-4.5', color: '#0C447C', bg: '#E6F1FB' },
            { role: 'High warming', warming: '~4.4°C', src: 'IPCC SSP5-8.5', color: '#ba7517', bg: '#FEF3E2' },
          ].map(scn => (
            <div key={scn.role} style={{ background: scn.bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${scn.color}22` }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color: scn.color, lineHeight: 1 }}>{scn.warming}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginTop: 8 }}>{scn.role}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>{scn.src}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', marginBottom: 12, textAlign: 'center' }}>Documented for assurance, not just generated</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '2.5rem' }}>
          {[
            ['Resilience conclusion', 'A rules-based read of how exposure shifts across the trio — persistent, warming-driven, or policy-driven.'],
            ['Scenario rationale', 'Why these pathways, including a Paris-aligned scenario as IFRS S2 requires — the choice itself is disclosable.'],
            ['Methodology & basis', 'IPCC AR6 regions and impact-drivers, TCFD transition categories, IPCC SSP scenarios — public frameworks throughout.'],
            ['Assumptions register', 'Every weighting and threshold stated as a disclosed methodological choice, not a black box.'],
            ['Data lineage', 'A clear boundary between your inputs and platform reference defaults — what assurance needs to see.'],
            ['Limitations & notice', 'Where screening ends and formal assessment begins, with a formal Important Notice on every report.'],
          ].map(([title, desc]) => (
            <div key={title} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderLeft: '2px solid #7425e3', borderRadius: '0 10px 10px 0', padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center' }}>
          <a href="/dashboard/climate-risk" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your climate risk →</a>
          {/* ⚠️ THE QUALIFIER BELONGS HERE MOST OF ALL, AND IT WAS ONLY ON THE SAMPLE CARD.
              This sits directly under the primary CTA — the highest-attention spot on the page and
              the point a buyer decides. It said the assessment "also produces the double-materiality
              matrix across all ten ESRS topics", which is true and, unqualified, reads as CSRD
              coverage. The card in the samples section already carries the honest version of this
              sentence and its comment says why it must not be trimmed; the same boundary now stands
              where it is acted on, not only where it is downloaded. The second sentence below is
              that card's, near-verbatim, so the two read as one voice rather than two hedges.
              ⚠️ AND THE LINK LABEL PROMISED SAMPLES THAT ARE ON THIS PAGE. Both sample PDFs moved
              from /materiality to here on 26 Aug 2026, so "See the materiality samples →" sent a
              reader looking for downloads to the one page that no longer has any. /materiality is
              now the Materiality Assessment module page, and the label says that. */}
          <p style={{ fontSize: 13, color: '#555553', maxWidth: 460, margin: '14px auto 0', fontWeight: 300, lineHeight: 1.6 }}>Reporting under CSRD/ESRS? The same assessment scores all ten ESRS topics on both axes from industry baselines &mdash; a first pass that scopes the work rather than doing it. It does not include the stakeholder engagement ESRS requires on the impact side.</p>
          <a href="/materiality" style={{ display: 'inline-block', marginTop: 12, fontSize: 14, fontWeight: 600, color: '#7425e3', borderBottom: '2px solid #7425e3', paddingBottom: 3, textDecoration: 'none' }}>The Materiality Assessment module →</a>
        </div>
      </section>

      {/* GLOBAL REGULATORY MAP */}
      <section style={{ padding: '0 2.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={eyebrow}>Global regulatory coverage</div>
          <h2 style={sectionTitle}>One assessment. Every regime.</h2>
          {/* DEFERS TO THE STATUS COLUMN, DOES NOT RESTATE IT — a lede summarising those positions
              would be a second copy to keep in step, and this one points at them instead, so the two
              cannot drift. It carries NO COUNT and NO DIRECTION OF TRAVEL; the previous version had
              both, reading 'going mandatory across dozens of jurisdictions' — a trend no source here
              establishes, and a third spelling of a figure the repo states as 28 and as 36. The
              qualified count lives in lib/ifrsS2.ts, in a slot able to carry its as-of date. */}
          <p style={sectionSub}>These regimes differ in kind, not only in timing — the table below states where each one stands. Most build on the same TCFD foundation, so ThemisIQ maps a single assessment across all of them.</p>
        </div>
        {/* THE STATUS COLUMN STATES A POSITION, NEVER A TREND. IFRS S2 read 'Live & expanding',
            which asserted a DIRECTION OF TRAVEL no source here establishes — the verified figure is
            a snapshot (28 adopted, a further 12 planning to, April 2026), and a plan to adopt is not
            a demonstrated trajectory. Worse, it sat directly beside that dated count, so a reader
            meeting the row today was invited to assume the number had grown since. Every other cell
            in this column names a position and nothing more — 'In force (scope simplified by
            Omnibus)', 'Rules expected from FY2027', 'Enforcement paused — appeal pending, no new
            date'. A trend claim among them reads as the same kind of fact when it is not. */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Framework', 'Jurisdiction', 'Who it applies to', 'Status', 'ThemisIQ coverage'].map(h => (
                <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              // ⚠️ "(E1 only)" IS THE WHOLE POINT OF THIS CELL. The text was accurate before it —
              // it named ESRS E1, and E1 coverage genuinely is full — but "✓ Full" in a column
              // headed "ThemisIQ coverage", one cell from "In force", beside a row labelled CSRD,
              // is read as CSRD coverage by anyone scanning the table. E1 is one of ten topical
              // standards, and the impact side of the other nine is a separate module. The scope
              // qualifier now survives the scan, not only the sentence.
              ['CSRD · ESRS E1', 'European Union', 'Large EU & EU-active companies', 'In force (scope simplified by Omnibus)', '✓ Full — ESRS E1 climate risk (E1 only)'],
              ['IFRS S2 (ISSB)', 'Multiple', 'Adopted jurisdiction by jurisdiction', 'Live where adopted — voluntary or mandatory', '✓ Full — TCFD + scenario analysis'],
              ['UK SRS (S1 & S2)', 'United Kingdom', 'Listed & large companies', 'Rules expected from FY2027', '✓ Full — ISSB-aligned'],
              ['Australia · AASB S2', 'Australia', 'Large entities, phased', 'Phasing in from Jan 2025', '✓ Full — IFRS S2 basis'],
              ['Canada · CSDS', 'Canada', 'ISSB-aligned, voluntary→mandatory', 'Adoption underway', '✓ Full — IFRS S2 basis'],
              ['SB 261', 'California, USA', '$500M+ revenue, doing business in CA', SB261_TABLE_STATUS, '✓ Full — TCFD-aligned report'],
              ['TCFD', 'Global', 'Investor / lender / board requested', 'De facto standard', '✓ Full — all four pillars'],
            ].map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '10px 14px', borderBottom: '0.5px solid #e8e7e4', background: i % 2 === 0 ? '#fff' : '#f8f7f5', color: j === 4 ? '#0F6E56' : '#555553', fontWeight: j === 4 ? 500 : 400 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: '#888784', marginTop: 14, lineHeight: 1.6, fontWeight: 300 }}>
          Regulatory timing and scope are evolving: the EU Omnibus reform is in force with its scope simplified, UK SRS rules are expected, and enforcement of California&apos;s SB 261 is barred pending appeal. Confirm your specific obligations with qualified counsel. ThemisIQ keeps framework mappings current as rules are finalised.
        </div>
      </section>

      {/* ═══ SAMPLE REPORTS ══════════════════════════════════════════════════
          ⚠️ MOVED HERE FROM /materiality ON 26 Aug 2026, WITH THE ANCHOR. Both documents are this
          module's own output and always were; they sat on the router page because that page was
          written first, and its header had already recorded the mismatch — "THE TWO SAMPLES ARE
          BOTH CLIMATE-RISK OUTPUTS".
          BEFORE PRICING, DELIBERATELY: a reader who has just seen what the module covers and which
          regimes it answers asks what they actually get, and a sample answers that better than a
          price does. After pricing it reads as a footnote.
          ⚠️ STYLES CARRIED VERBATIM, including the ghostBtn spread the two download links depend
          on. Nothing was restyled in the move — a card that changed how it looks in the same edit
          that changed where it lives is a card nobody can review. */}
      <section id="samples" style={{ padding: '0 2.5rem 5rem', maxWidth: 1100, margin: '0 auto', scrollMarginTop: 80 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={eyebrow}>See the deliverables</div>
          <h2 style={sectionTitle}>What the assessment produces.</h2>
          <p style={sectionSub}>Two documents come out of the same assessment, one for each standard. Both were generated by the live tool for a fictional industrial-manufacturing entity operating in Eastern North America and Northern Europe. Between them, the difference is the standard, not the engine.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginTop: 8 }}>
          <div style={{ background: '#fff', border: '2px solid #0C447C', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: '#E6F1FB', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(12,68,124,0.2)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0C447C', marginBottom: 4 }}>IFRS S2 / ISSB sample</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: '#0d0d0d' }}>Climate Resilience Analysis Report</div>
              <div style={{ fontSize: 12, color: '#555553', marginTop: 4 }}>Multi-scenario resilience · IFRS S2 · 8 pages</div>
              <div style={{ fontSize: 11, color: '#0C447C', fontWeight: 600, marginTop: 6 }}>From Climate Risk &amp; Materiality</div>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 14 }}>
                Cover · executive summary · methodology · scenario rationale · physical &amp; transition risk register.
              </div>
              <a href="/samples/magnetic-industrial-s2-climate-resilience.pdf" target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, background: '#0C447C', color: '#fff', border: 'none' }}>
                &darr; Download IFRS S2 sample (PDF)
              </a>
            </div>
          </div>
          <div style={{ background: '#fff', border: '2px solid #1e1b4b', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ background: '#eef2ff', padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(30,27,75,0.2)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1e1b4b', marginBottom: 4 }}>CSRD / ESRS sample</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', color: '#0d0d0d' }}>Double Materiality Screening Report</div>
              <div style={{ fontSize: 12, color: '#555553', marginTop: 4 }}>Double materiality · 15 pages · with matrix</div>
              <div style={{ fontSize: 11, color: '#1e1b4b', fontWeight: 600, marginTop: 6 }}>From Climate Risk &amp; Materiality</div>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, marginBottom: 14 }}>
                {/* ⚠️ THE SECOND SENTENCE IS THE POINT OF THIS CARD. Without it, a card titled
                    "Double Materiality Screening Report" on a site that sells a separate Impact
                    Materiality module invites the reader to conclude the screening already
                    covers CSRD — which the report's own cover denies. Do not trim it for
                    length. */}
                Everything in the S2 report, plus the double materiality matrix and a first-pass score for all ten ESRS topics on both axes. It does not include the stakeholder engagement ESRS requires on the impact side &mdash; its own cover says so.
              </div>
              <a href="/samples/magnetic-industrial-csrd-double-materiality.pdf" target="_blank" rel="noopener noreferrer" style={{ ...ghostBtn, background: '#1e1b4b', color: '#fff', border: 'none' }}>
                &darr; Download CSRD sample (PDF)
              </a>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#888784', lineHeight: 1.7, marginTop: 16, fontStyle: 'italic' }}>
          Samples are illustrative outputs from the live tool, generated for a fictional entity. Your own report would be specific to your inputs and saved to your private account.
        </p>
      </section>

      {/* ═══ IF YOU HAVE ALREADY COMPLETED YOUR CLIMATE RISK ASSESSMENT ══════════
          THE RETURN PATH. /materiality carries "If you already have Climate Risk" pointing here;
          this is the same handoff from the other side, and the two must not drift into describing
          the boundary differently.
          AFTER THE SAMPLES, BEFORE THE PRICE, DELIBERATELY. A reader arrives having just read the
          sample card's own sentence — that the screening "does not include the stakeholder
          engagement ESRS requires on the impact side" — so this section answers a question they
          are already holding rather than raising one.
          ⚠️ NOT TINTED, THOUGH ITS MIRROR ON /materiality IS. That page sets this section on
          #f8f7f5 between two white ones. Here the PRICING section immediately below is ALREADY
          #f8f7f5 with the same borders, so a tinted block would merge with it into one band and
          the reader would lose the boundary between an argument and a price. Plain, at the page's
          standard section measure. */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ maxWidth: 760 }}>
          <h2 style={sectionTitle}>If you have already completed your Climate Risk assessment</h2>
          <p style={bodyPara}>
            The screening tells you which of the ten ESRS topics are likely to matter. The Materiality Assessment is where you establish that they do.
          </p>
          <p style={bodyPara}>
            You run a stakeholder survey &mdash; your own workforce, workers in your value chain, communities, customers &mdash; and see what each group says about each topic. You delegate sub-topics to the people in your organisation who know them, and each records a severity determination against the ESRS criteria, for harm and for benefit separately. Where you and your stakeholders see a topic differently, the report sets the two side by side, because that difference is the first thing an assurance provider asks about.
          </p>
          <p style={bodyPara}>
            The deliverable is a board paper that records the assessment and the reasoning behind it &mdash; the findings, the stakeholders engaged, the determinations reached, and the disclosure requirements each material topic carries. It is written to be read by directors or senior leadership and handed to an auditor.
          </p>
          {/* ⚠️ THE FIGURE IS READ, NEVER TYPED — FLAT_MODULE_PRICES is the single source of truth
              (lib/pricing.ts, CLAUDE.md). The pricing block below reads climate-risk's the same
              way. A hardcoded price on this page would be the fourth to drift in two days.
              ⚠️ AND THE DISCOUNT IS DELIBERATELY NOT RESTATED HERE. It was, in draft: two prices
              sitting near each other invite a reader to add them. But the PRICING lede three
              sections down already states the rule more completely than this line could — "two
              modules −10%, three or more −20%" — and a reader weighing two figures reaches it
              within seconds. One rule, stated once, in the place that states it best. */}
          <p style={{ ...bodyPara, marginBottom: '2rem' }}>
            ${FLAT_MODULE_PRICES['double-materiality'].toLocaleString()} per year.
          </p>
          <a href="/materiality" style={{ ...btnPrimary, textDecoration: 'none' }}>The Materiality Assessment module &rarr;</a>
        </div>
      </section>

      {/* PRICING */}
      <section style={{ background: '#f8f7f5', borderTop: '0.5px solid #e8e7e4', borderBottom: '0.5px solid #e8e7e4', padding: '5rem 2.5rem' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div style={eyebrow}>Pricing</div>
          <h2 style={sectionTitle}>Start with Climate Risk.</h2>
          {/* The multi-module discount is named here exactly as the checkout names it, and the
              figures are worded exactly as the pricing and homepage heroes word them. This page is
              the only module marketing page that quotes the discount at all, so it had drifted
              furthest: "bundle to save" described a bundle the product removed on 23 Jul 2026. */}
          <p style={sectionSub}>A complete TCFD-aligned climate risk assessment — one flat annual price. Add modules and the multi-module discount applies automatically: two modules −10%, three or more −20%.</p>
          {/* ⚠️ "screening", NOT "materiality". The feature read "Single + double materiality
              (IFRS S2 · CSRD/ESRS)" — a claim of full coverage in a priced feature list, which is
              the one place a buyer reads as a promise about what they are paying for. What this
              module does is score the ten topics from industry baselines; what it does not do is
              the stakeholder engagement ESRS requires on the impact side. One word carries that,
              and it is the module's own word: the sample is titled "Double Materiality SCREENING
              Report" and /methodology calls it "a structured screening intended to scope and
              support". */}
          <div style={{ maxWidth: 400, margin: '2.5rem auto 0', textAlign: 'left' }}>
            {[
              { plan: 'Climate Risk', price: '$' + FLAT_MODULE_PRICES['climate-risk'].toLocaleString(), cadence: '/ reporting year', features: ['Physical & transition risk assessment', 'Materiality screening — both axes, ten ESRS topics (IFRS S2 · CSRD/ESRS)', '3 IPCC scenario pathways', 'TCFD-aligned report structure', 'IFRS S2 · CSRD ESRS E1 · SB 261 mapping'], featured: true },
            ].map(({ plan, price, cadence, features, featured }) => (
              <div key={plan} style={{ background: featured ? '#0d0d0d' : '#fff', borderRadius: 12, padding: '2rem', border: featured ? 'none' : '0.5px solid #e8e7e4' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: featured ? 'rgba(255,255,255,0.4)' : '#888784', marginBottom: 8 }}>{plan}</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2.4rem', fontWeight: 400, color: featured ? '#fff' : '#0d0d0d' }}>{price}<span style={{ fontSize: 14, fontWeight: 400, color: featured ? 'rgba(255,255,255,0.4)' : '#888784' }}>{cadence}</span></div>
                <div style={{ height: '0.5px', background: featured ? 'rgba(255,255,255,0.1)' : '#e8e7e4', margin: '1.25rem 0' }} />
                {features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span style={{ color: featured ? '#64fe3e' : '#0F6E56', flexShrink: 0 }}>✓</span>
                    <span style={{ fontSize: 13, color: featured ? 'rgba(255,255,255,0.65)' : '#555553', fontWeight: 300 }}>{f}</span>
                  </div>
                ))}
                <a href="/dashboard/climate-risk" style={{ display: 'block', textAlign: 'center', padding: '11px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', background: featured ? 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)' : '#0d0d0d', color: featured ? '#0d0d0d' : '#fff', marginTop: '1.5rem' }}>
                  Assess your climate risk →
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          Someone&apos;s going to ask.<br />
          <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Be ready.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          ThemisIQ guides you through a complete, TCFD-aligned climate risk assessment and produces a publishable report — for whoever is asking. Build it free; unlock the export on a paid plan.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/climate-risk" style={{ ...btnPrimary, textDecoration: 'none' }}>Assess your climate risk →</a>
          <a href="/advisory" style={{ ...btnSecondary, textDecoration: 'none' }}>Talk to an advisor</a>
          <a href="/assess" style={{ ...btnSecondary, textDecoration: 'none' }}>Check which rules apply to you →</a>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} } * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
// Copied verbatim from app/materiality/page.tsx:52-56 with the sample cards on 26 Aug 2026 —
// both download links spread it. NOT re-derived from btnSecondary below, which is a different
// shape: moving a card and restyling it in one edit hides which of the two changed how it looks.
const ghostBtn: React.CSSProperties = {
  padding: '11px 22px', borderRadius: 8, fontSize: 13, fontWeight: 500,
  color: '#0d0d0d', background: '#fff', border: '1px solid #e8e7e4',
  cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'none', display: 'inline-block',
}
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
const sectionSub: React.CSSProperties = { fontSize: 15, color: '#555553', maxWidth: 540, margin: '0 auto', lineHeight: 1.75, fontWeight: 300 }
// ⚠️ COPIED VERBATIM FROM app/materiality/page.tsx WITH THE CROSS-SELL SECTION ON 27 Aug 2026 —
// the same move ghostBtn made with the sample cards on 26 Aug, and for the same reason. This page
// had no LEFT-ALIGNED body-paragraph style: sectionSub is centred (margin: '0 auto', maxWidth 540)
// and serves section ledes, which is not what a four-paragraph argument at maxWidth 760 needs.
// NOT re-derived from sectionSub with the centring stripped: the cross-sell mirrors /materiality's
// and must read as the same voice, so it takes that page's measurements rather than an
// approximation of them.
const bodyPara: React.CSSProperties = { fontSize: 15, color: '#555553', fontWeight: 300, lineHeight: 1.8, marginBottom: '1.25rem' }
