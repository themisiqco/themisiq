'use client'
import Nav from '../components/Nav'
import Footer from '@/app/components/Footer'
import { FLAT_MODULE_PRICES } from '../../lib/pricing'
import { IFRS_S2_ADOPTION_COUNT, IFRS_S2_ADOPTION_SOURCE } from '../../lib/ifrsS2'
import { SB253_STATUTE } from '../../lib/sb253'
import { THRESHOLD_TESTS } from '../../lib/deals/assessment'

export default function Page() {
  // Price from the single source of truth, formatted as app/cbam/page.tsx does.
  const dealsPrice = FLAT_MODULE_PRICES['deals'].toLocaleString('en-US')

  // The SB 253 revenue trigger is READ FROM THE TEST THE ENGINE RUNS, never retyped. The card and
  // the screen therefore cannot disagree: if the limb is ever amended, both move together.
  const sb253Bn = THRESHOLD_TESTS['SB 253'].limbs[0].amount / 1_000_000_000

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#0d0d0d' }}>
      <Nav />

      {/* HERO */}
      <section style={{ padding: '5rem 2.5rem 4rem', borderBottom: '0.5px solid #e8e7e4' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={eyebrow}>Deals & Investment</div>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2.2rem, 4vw, 3.2rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1.25rem', color: '#0d0d0d' }}>
              Not a values question.<br />
              <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>A valuation question.</span>
            </h1>
            <p style={{ fontSize: 16, color: '#555553', lineHeight: 1.75, fontWeight: 300, marginBottom: '2rem', maxWidth: 480 }}>
              Enter a target&rsquo;s turnover, balance sheet, headcount and jurisdiction, and see which climate and sustainability regimes it already falls under &mdash; each threshold tested limb by limb, with the figure applied and the provision it comes from. Under five minutes. Create an account and your first target is free.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' as const, marginBottom: '1rem' }}>
              <a href="/dashboard/deals" style={{ ...btnPrimary, textDecoration: 'none' }}>Screen a target →</a>
              <a href="/order?modules=deals" style={{ ...btnSecondary, textDecoration: 'none' }}>${dealsPrice} USD/yr</a>
            </div>
            <div style={{ marginBottom: '2rem' }}>
              <a href="/assess" style={{ fontSize: 14, fontWeight: 400, color: '#555553', textDecoration: 'underline', display: 'inline-block' }}>Screening your own obligations instead? Take the free assessment →</a>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
              {['SB 253', 'CSRD', 'SECR', 'CS3D', 'Canada S-211', 'IFRS S2', 'TCFD', 'M&A diligence', 'PE / family office'].map(tag => (
                <span key={tag} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553' }}>{tag}</span>
              ))}
            </div>
          </div>

          {/* STAT CARDS — three, stacked. Every figure carries its source in the card body. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            {[
              {
                val: `$${sb253Bn} billion`, unit: 'revenue trigger',
                label: `SB 253 catches any US company over $${sb253Bn}bn total annual revenue doing business in California — privately held or public.`,
                source: SB253_STATUTE, color: '#B91C1C', bg: '#FCEBEB',
              },
              {
                val: 'IFRS S2', unit: 'per jurisdiction',
                label: IFRS_S2_ADOPTION_COUNT,
                source: IFRS_S2_ADOPTION_SOURCE, color: '#7425e3', bg: '#EDE9FE',
              },
              {
                val: 'Four outcomes', unit: 'every threshold test',
                label: 'Applies, near-threshold, not applicable, or not assessed. A test we could not complete never comes back clean.',
                source: null, color: '#0F6E56', bg: '#E1F5EE',
              },
            ].map(({ val, unit, label, source, color, bg }) => (
              <div key={val} style={{ background: bg, borderRadius: 12, padding: '1.5rem', border: `0.5px solid ${color}22` }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{unit}</div>
                <div style={{ fontSize: 12, color: '#555553', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{label}</div>
                {source && <div style={{ fontSize: 11, color: '#888784', marginTop: 6, fontWeight: 300, lineHeight: 1.4 }}>{source}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT A SCREEN RETURNS */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>What a screen returns</div>
          <h2 style={sectionTitle}>Six figures in. A defensible answer out.</h2>
        </div>
        <div style={hairlineGrid3}>
          {[
            { title: 'Which rules bite, and on which limb.', desc: 'SB 253, CSRD, SECR, CS3D, Canada’s S-211 and the rest, tested against the target’s turnover, balance sheet total and headcount. Every limb is printed with the figure applied, the threshold it met or missed, and the provision it comes from.' },
            { title: 'What is close, as well as what applies.', desc: 'Targets sitting just under a threshold come back in their own table — the ones that cross it on the growth you are underwriting.' },
            { title: 'What compliance will cost them.', desc: 'A build cost derived from the target’s own size and number of sites, shown alongside cited consultant benchmarks for the same scope of work.' },
            { title: 'What the exposure is worth against your price.', desc: 'A band expressed as a percentage of deal value, weighted by sector and by how many regimes bite. Presented as exposure, never as a quote.' },
            { title: 'What is missing from the data room.', desc: 'Whether the target holds a verified GHG inventory and a current ESG report — the first two things you will ask for, and the basis of the mandate.' },
            { title: 'Where the sector risk usually sits.', desc: 'The ESG risks typical of the target’s sector, each tied to the regime that governs it and conditioned to the jurisdictions the target is actually established in. Flagged for your attention, not measured.' },
          ].map(({ title, desc }) => (
            <div key={title} style={hairlineCell}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY THE ANSWER HOLDS UP */}
      <section style={{ padding: '0 2.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Why the answer holds up</div>
          <h2 style={sectionTitle}>Built to survive the other side&rsquo;s advisor.</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { title: 'Size tests are run the way the statute writes them.', desc: 'SECR is a two-of-three test over turnover, balance sheet and headcount — not turnover alone. Each limb is reported separately, so a disagreement is about a figure rather than about an opinion.' },
            { title: 'Currency never quietly changes the answer.', desc: 'Revenue is converted at a dated ECB reference fixing; the statutory threshold is never restated. The figure on your report still matches the legislation word for word, and the report prints which fixing a borderline call relied on.' },
            { title: 'A blank never becomes a pass.', desc: 'Where a figure was not supplied, the report says so and names the figure that would settle it. Nothing comes back clean because the question was never asked.' },
            { title: 'Where a test is incomplete, it says that too.', desc: 'CS3D’s route tests are not exhaustive, and the engine treats a failed size test as unresolved rather than as a clean negative.' },
          ].map(({ title, desc }) => (
            <div key={title} style={hairlineCell}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ACROSS THE DEAL — Screen / Mandate / Inherit */}
      <section style={{ padding: '0 2.5rem 5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Across the deal</div>
          <h2 style={sectionTitle}>Who pays, and who does the work.</h2>
        </div>
        <div style={hairlineGrid3}>
          {[
            {
              stage: 'Before you engage', title: 'Screen',
              desc: 'Enter revenue, balance sheet, headcount, sites, jurisdiction and sector. Obligations resolve against current thresholds — with what compliance will cost the target and what the exposure means for your price. Anything the screen cannot settle comes back as not assessed, naming the figure it needs.',
              pays: 'You', effort: 'Under five minutes. Unlimited targets.',
            },
            {
              stage: 'Once you are engaged', title: 'Mandate',
              desc: 'Hand the target a link to their own results — the thresholds they cross, alongside the risks typical of their sector — and make it a condition of proceeding. They build the inventory on their budget, because they owe it to the regulator whether your deal closes or not.',
              pays: 'The target', effort: 'Theirs. Independently verifiable.',
            },
            {
              stage: 'After close', title: 'Inherit',
              desc: 'The baseline built during diligence stays where it was built and becomes the company’s reporting record. The same inventory carries forward — nothing re-collected, nothing rebuilt from scratch.',
              pays: 'The portfolio company', effort: 'Theirs, as it would be anyway.',
            },
          ].map(({ stage, title, desc, pays, effort }) => (
            <div key={title} style={hairlineCell}>
              <div style={eyebrow}>{stage}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 10 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300, marginBottom: 16 }}>{desc}</div>
              <div style={{ borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
                <div style={{ fontSize: 12, color: '#555553', fontWeight: 300, marginBottom: 4 }}>
                  <span style={{ color: '#888784' }}>Who pays:</span> {pays}
                </div>
                <div style={{ fontSize: 12, color: '#555553', fontWeight: 300 }}>
                  <span style={{ color: '#888784' }}>Effort:</span> {effort}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SB 253 M&A CALLOUT */}
      <section style={{ background: '#0d0d0d', padding: '4rem 2.5rem' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>SB 253 — M&A liability</div>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 400, color: '#fff', lineHeight: 1.2, marginBottom: '1rem' }}>
              Acquiring a California company?<br />You inherit their SB 253 obligations.
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, fontWeight: 300, marginBottom: '1.5rem' }}>
              A target with California nexus and revenue over ${sb253Bn}bn is a reporting entity in its own right, and stays one after you buy it. The screen tests that threshold against the figures you enter and prints the limb, the figure and the provision — so the obligation is priced into your deal rather than discovered after it.
            </p>
            {[
              'SB 253 tested against the target’s own revenue, with the provision cited',
              'What the inventory will cost them to build, from their size and site count',
              'The gap list you hand the target as a condition of proceeding',
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <span style={{ color: '#64fe3e', flexShrink: 0, marginTop: 2 }}>✓</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 300, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '2rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Climate diligence frameworks</div>
            {/* Every row here is a regime the threshold engine actually tests. No urgency ranking:
                the copy supplies none, and inventing one would rank regimes we have not ranked. */}
            {[
              { fw: 'SB 253', scope: `Tested on revenue over $${sb253Bn}bn with California nexus` },
              { fw: 'CSRD / ESRS E1', scope: 'EU disclosure obligations, tested limb by limb' },
              { fw: 'SECR', scope: 'UK two-of-three test on turnover, balance sheet and headcount' },
              { fw: 'CS3D', scope: 'Post-Omnibus size test, reported as unresolved where the route is not met' },
              { fw: 'Canada S-211', scope: 'Two-of-three test on assets, revenue and employees' },
            ].map(({ fw, scope }) => (
              <div key={fw} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.35)', flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#fff', marginBottom: 2 }}>{fw}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{scope}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* USE CASES */}
      <section style={{ padding: '5rem 2.5rem', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={eyebrow}>Use cases</div>
          <h2 style={sectionTitle}>Built for every deal structure.</h2>
        </div>
        <div style={hairlineGrid3}>
          {[
            { title: 'Private Equity', desc: 'Screen every target in a competitive process, not just the ones that reach exclusivity. Obligations and their cost land before you commit, and the target carries the work.' },
            { title: 'Family Office', desc: 'One screen per target, unlimited targets, no advisor engagement to open. Walking away costs you the five minutes it took to look.' },
            { title: 'Corporate M&A', desc: 'Find out whether a target already falls under SB 253, CSRD or SECR before the integration plan assumes it does not.' },
            { title: 'Investment Banking', desc: 'Give a credit committee a threshold test with its provision cited, rather than an adjective about ESG risk.' },
            { title: 'Venture Capital', desc: 'Know which of your growth-stage targets is about to cross a reporting threshold, and how much the crossing costs them.' },
          ].map(({ title, desc }) => (
            <div key={title} style={hairlineCell}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.65, fontWeight: 300 }}>{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '6rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2 }}>
          Your first target is <span style={{ fontStyle: 'italic', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>free.</span>
        </h2>
        <p style={{ fontSize: 15, color: '#555553', maxWidth: 520, margin: '0 auto 2.5rem', fontWeight: 300, lineHeight: 1.7 }}>
          Create an account and screen one — the complete report, every limb tested, nothing held back and no card. The subscription is for when you have a pipeline rather than a deal.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/dashboard/deals" style={{ ...btnPrimary, textDecoration: 'none' }}>Screen your first target →</a>
        </div>
        <div style={{ marginTop: '1.5rem' }}>
          <a href="/advisory" style={{ fontSize: 13, fontWeight: 400, color: '#888784', textDecoration: 'underline', display: 'inline-block' }}>Talk to a specialist</a>
        </div>
      </section>

      {/* FOOTER */}
      <Footer />

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

const btnPrimary: React.CSSProperties = { fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: '#0d0d0d', color: '#fff', display: 'inline-block' }
const btnSecondary: React.CSSProperties = { fontSize: 14, fontWeight: 400, padding: '13px 32px', borderRadius: 8, background: 'none', color: '#0d0d0d', border: '0.5px solid #e8e7e4', display: 'inline-block' }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }
const sectionTitle: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)', fontWeight: 400, lineHeight: 1.2, marginBottom: '1rem', color: '#0d0d0d' }
// The three-column hairline grid used on /cyber and /climate-risk — 1px gaps over a #e8e7e4 ground
// so the cell backgrounds draw the rules. Cells are plain white with 2rem padding.
const hairlineGrid3: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: '#e8e7e4', border: '0.5px solid #e8e7e4', borderRadius: 16, overflow: 'hidden' }
const hairlineCell: React.CSSProperties = { background: '#fff', padding: '2rem' }
