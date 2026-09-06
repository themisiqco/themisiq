// app/cbam/readiness/page.tsx
// Public, no-auth CBAM readiness checklist — the "what to gather, and who has it"
// list, rendered straight from lib/cbam/readiness.ts. Static server component:
// no fetch, no auth, no entitlement gate.
//
// CONTENT LIVES IN readiness.ts, NOT HERE. This file chooses layout and nothing
// else — every label, whereToFind, goodEnough, whyAsked and sourceRef comes from
// the module, so the page cannot drift from the report builder's own requirement
// set (readiness.test.ts pins that join).
//
// THREE FIELDS ARE DELIBERATELY NOT RENDERED. `field` is the internal join key to
// the completeness accumulator — it reads like prose ('measurable heat imported')
// and would look like copy, which is exactly why it must never reach the page.
// `kind`, `item` and `id` are equally internal. Do not add them.
import Nav from '../../components/Nav'
import Footer from '@/app/components/Footer'
import { groupedEntries, type HolderGroup } from '../../../lib/cbam/readiness'
import { FLAT_MODULE_PRICES } from '../../../lib/pricing'
import { btnPrimary, btnSecondary } from '@/app/components/buttonStyles'

// ── Palette (matches app/cbam/preview/page.tsx) ──
const ink = '#0d0d0d'
const muted = '#555553'
const faint = '#888784'
const canvas = '#f8f7f5'
const hair = '#e8e7e4'
const violet = '#7425e3'

const cardStyle: React.CSSProperties = { background: '#fff', border: `0.5px solid ${hair}`, borderRadius: 10, padding: '14px 18px', marginBottom: 12 }

// Per-group accent, PRESENTATION ONLY — deliberately not a field on readiness.ts.
// That module is content: what to gather and who holds it. Which colour a group
// wears is this page's decision, and a second surface could choose differently.
//
// Used in exactly two places per group: the dot beside the heading and the 2px
// bar on its cards. Never on body text, card borders, or the common-practice pill
// — an accent, not a theme.
//
// company_records and suppliers intentionally share #0C447C; they sit at positions
// 1 and 5, three groups apart, so the repeat does not read as an error.
const GROUP_ACCENT: Record<HolderGroup, string> = {
  company_records:     '#0C447C',
  customs:             '#7425e3',
  plant_operations:    '#0F6E56',
  finance_procurement: '#92400e',
  suppliers:           '#0C447C',
  external_registry:   '#555553',
}

export default function Page() {
  // Sorted by HOLDER_GROUPS meta.order inside groupedEntries(), not by the order
  // the groups happen to be declared in.
  const groups = groupedEntries()
  const cbamPrice = FLAT_MODULE_PRICES.cbam.toLocaleString('en-US')

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: ink }}>
      <Nav />

      {/* HERO */}
      <section style={{ padding: '4rem 2.5rem 2.5rem', borderBottom: `0.5px solid ${hair}`, background: canvas }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: violet, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.25)', borderRadius: 99, padding: '4px 12px', marginBottom: 16 }}>Free · No account needed</span>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 400, lineHeight: 1.15, marginBottom: '1rem', color: ink }}>
            What you&rsquo;ll need before you can file
          </h1>
          <p style={{ fontSize: 15, color: muted, lineHeight: 1.75, fontWeight: 400, maxWidth: 620 }}>
            The hard part of a CBAM declaration isn&rsquo;t the calculation — it&rsquo;s gathering twenty-seven pieces of information from six different parts of your organisation, several of which have long lead times. This is the full list, grouped by who holds it. Nothing here requires an account. Before you start collecting them, it&rsquo;s worth understanding why this matters.
          </p>
        </div>
      </section>

      {/* WHY — a pull-quote, not another section: white ground, violet rule, text inset.
          Every figure here is verified against IR (EU) 2025/2621 Annex I. Do not adjust a
          number or add a sector. */}
      <section style={{ padding: '3rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ borderLeft: `3px solid ${violet}`, paddingLeft: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, color: ink, marginBottom: '1rem' }}>Why this is worth the effort</h2>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.75, fontWeight: 400, maxWidth: 620, marginBottom: '1rem' }}>
              Your EU customer must declare the embedded emissions for your goods whether you supply verified emissions data or not. If you do not provide actual emissions, they can use the European Commission&rsquo;s published default values for your country and product.
            </p>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.75, fontWeight: 400, maxWidth: 620, marginBottom: '1rem' }}>
              Those default values are intentionally conservative to reduce the risk of understating embedded emissions. For most CBAM goods, they are increased by a mark-up of 10% in 2026, 20% in 2027, and 30% from 2028 onwards. Fertilisers are the exception, with a 1% mark-up throughout.
            </p>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.75, fontWeight: 400, maxWidth: 620 }}>
              The resulting embedded emissions determine the number of CBAM certificates your EU customer must surrender. If your installation&rsquo;s verified emissions are lower than the applicable default value, providing verified emissions data can reduce the number of certificates they need to purchase, lowering the carbon cost of importing your goods.
            </p>
          </div>

          {/* Lead times. A quiet callout, not an alert — nothing here is going wrong;
              it is scheduling advice. Canvas ground and a hairline, no accent colour. */}
          <div style={{ marginTop: '2.5rem', background: canvas, border: `0.5px solid ${hair}`, borderRadius: 10, padding: '1.25rem 1.5rem' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: ink, marginBottom: 6 }}>Plan ahead</div>
            <p style={{ fontSize: 15, color: muted, lineHeight: 1.75, fontWeight: 400, maxWidth: 620 }}>
              Most information inside your own organisation can usually be gathered within a few days. Verified reports from suppliers often take weeks or months, particularly where a supplier has not reported under CBAM before. Request those first.
            </p>
          </div>
        </div>
      </section>

      {/* THE LIST */}
      <section style={{ padding: '3rem 2.5rem 4rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* How to read the citations and the common-practice marker. */}
          <p style={{ fontSize: 13, color: faint, fontWeight: 400, lineHeight: 1.7, maxWidth: 620, marginBottom: '2.5rem' }}>
            Most items below point to the provision that requires them. A few — marked common practice — describe where this information usually sits in an organisation rather than something the regulation specifies, so confirm those against your own site.
          </p>

          {groups.map(group => {
            const accent = GROUP_ACCENT[group.group]
            return (
            <div key={group.group} style={{ marginBottom: '3.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: accent, flexShrink: 0 }} />
                <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 400, color: ink }}>{group.meta.label}</h2>
              </div>
              <p style={{ fontSize: 14, color: faint, fontWeight: 400, marginBottom: '1.75rem', maxWidth: 560, lineHeight: 1.6 }}>{group.meta.blurb}</p>

              {/* MULTI-COLUMN, NOT GRID. A grid sizes every row to its tallest card, so a
                  one-line entry beside a paragraph-length one leaves visible dead space.
                  Columns pack instead. The trade is reading order: cards flow DOWN each
                  column then across, newspaper-style, rather than across-then-down. DOM
                  order is unchanged, so screen readers and the derived-then-declared
                  sequence are unaffected.
                  No JS, and it degrades to a single column wherever column-width cannot
                  fit two — same breakpoint behaviour as the 300px grid minimum it replaces.

                  On each card: inline-block + width:100% is the multicol fragmentation
                  workaround, pageBreakInside is the legacy alias older engines honour, and
                  marginBottom overrides cardStyle's 12px so the vertical rhythm matches the
                  1.25rem column gap — as the grid's symmetric gap did. */}
              <div style={{ columnWidth: 300, columnGap: '1.25rem' }}>
                {group.entries.map(entry => (
                  <div key={entry.id} style={{ ...cardStyle, position: 'relative', overflow: 'hidden', breakInside: 'avoid', pageBreakInside: 'avoid', display: 'inline-block', width: '100%', marginBottom: '1.25rem' }}>
                    {/* Top-edge accent — same treatment as the unlocked module tiles on
                        /dashboard: absolutely positioned, radius matching the card's. */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent, borderRadius: '10px 10px 0 0' }} />
                    {/* The pill sits on its OWN LINE, always. Inline-with-wrap put it beside
                        a short label and below a long one, so its position read as meaningful
                        when it is not. */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: ink }}>{entry.label}</div>
                      {entry.inferred && (
                        <div style={{ marginTop: 6 }}>
                          <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: faint, background: canvas, border: `0.5px solid ${hair}`, borderRadius: 99, padding: '2px 8px' }}>common practice</span>
                        </div>
                      )}
                    </div>

                    <div style={{ fontSize: 13, color: muted, fontWeight: 400, lineHeight: 1.65, marginBottom: 8 }}>{entry.whereToFind}</div>
                    <div style={{ fontSize: 13, color: ink, fontWeight: 400, lineHeight: 1.65 }}>{entry.goodEnough}</div>

                    {entry.whyAsked && (
                      <div style={{ fontSize: 13, color: muted, fontWeight: 400, lineHeight: 1.65, marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${hair}` }}>{entry.whyAsked}</div>
                    )}

                    {entry.sourceRef && (
                      <div style={{ fontSize: 11, color: faint, fontWeight: 400, lineHeight: 1.5, marginTop: 8 }}>{entry.sourceRef}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            )
          })}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: canvas, borderTop: `0.5px solid ${hair}`, padding: '5rem 2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 400, maxWidth: 680, margin: '0 auto 1.25rem', lineHeight: 1.2, color: ink }}>
          Ready when you are.
        </h2>
        <p style={{ fontSize: 15, color: muted, maxWidth: 480, margin: '0 auto 2.5rem', fontWeight: 400, lineHeight: 1.7 }}>
          Gather the information once, then keep it with the figures it supports. The module calculates your specific embedded emissions and prepares the summary your EU customer needs.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' as const }}>
          <a href="/order?modules=cbam" style={{ ...btnPrimary, textDecoration: 'none' }}>Get CBAM — ${cbamPrice}/yr</a>
          <a href="/cbam/preview" style={{ ...btnSecondary, textDecoration: 'none' }}>See a sample report</a>
        </div>
      </section>

      <Footer />

      <style>{`* { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
    </div>
  )
}

