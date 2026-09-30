'use client'
import Image from 'next/image'
import HomePricing from './components/HomePricing'
import Nav from './components/Nav'
import Footer from './components/Footer'
import { btnPrimary, btnSecondary, btnOnDark, btnOnDarkOutline } from '@/app/components/buttonStyles'
import { sectionTitle } from '@/app/components/headingStyles'
import { AURORA_SRC, AURORA_CLOSE_POSITION } from '@/app/components/auroraBand'
import { SB253_SHORT } from '../lib/sb253'
import { AUDIT_TRAIL_NOTE_SHORT } from '../lib/auditTrailNotice'

/**
 * The homepage.
 *
 * ⚠️ THE COLOURWAY IS A FILL VALUE AND NEVER TEXT. docs/colourway-2026.md has the measurements and the
 * two approaches that were rejected to arrive at that rule. On this page the colourway now appears in
 * ONE form: --color-module-* on the 4px card rules. --gradation-band was the hero and closing grounds
 * until 28 Sep 2026; both are the aurora photograph now, the 4px rule above the footer went with them,
 * and the token and .tq-gradation-ground were removed outright once the module pages followed.
 * Nothing on this page sets a colourway value on text, and nothing should.
 *
 * ⚠️ WHY THE 4px CARD RULES ARE PERMITTED AND THE 6px BAR IN THE PRODUCT IS NOT. WCAG 1.4.11 exempts a
 * graphic whose information is available in another form. Each card names its module in 1.2rem display
 * text and links to it, so the rule duplicates an identification already made in words and is
 * decorative. `.tq-summary`'s 6px left bar in the dashboard is the OPPOSITE case: it is the only module
 * identifier on that surface, so it carries meaning and needs 3:1 — which is why
 * lib/tokenContrast.test.ts asserts --tq-mod separately and why six modules will fail it after the swap.
 * Measured on --color-paper, today: ghg 7.62, climate 5.55, supply 5.57, cbam 6.50, deals 6.23, ai 6.48,
 * cyber 7.53, people 5.78. After the swap six of the eight fall below 3:1. They stay on the token rather
 * than the spec's literal hex so they move once, with the swap, from one source of truth.
 *
 * ⚠️ NO FIGURE ON THIS PAGE IS TYPED. The previous version carried three that were: a module count of
 * '7' (CLAUDE.md forbids stating a count at all, and MODULES has nine keys while the grid drew eight),
 * '30+' frameworks (ALL_OBLIGATION_IDS has sixteen and the chip row showed twenty — three unrelated
 * numbers for one claim), and a "See all six results" panel label. Prices come from HomePricing, which
 * derives everything from lib/pricing. If a figure is wanted here, it needs a constant first.
 */

export default function Home() {
  return (
    <div style={{ background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <Nav />

      {/* ── HERO ─────────────────────────────────────────────────────────────────────────────────
      A PHOTOGRAPH, NOT THE GRADATION BAND, and the copy is on-dark because of it. It carries
      .tq-hero-wash at EVERY width, not only narrow ones: measured, the worst case is 1920px, where
      the body paragraph reads 4.16:1 unwashed and 5.08:1 with it. The table is in the token file.
      ⚠️ THE IMAGE IS ANCHORED BOTTOM-RIGHT AND MUST NOT BE FLIPPED, MIRRORED OR ROTATED. The aurora
      has its dark sky top-left, its bright teal curtains on the right and a small warm glow in the
      bottom-right corner. `objectPosition: '100% 100%'` is what keeps that corner in frame as the
      crop tightens; the dark sky staying top-left is what the text column sits on.
      ⚠️ THE maxWidth ON THE TEXT COLUMN IS STILL LOAD-BEARING, and --gradation-ink-safe is still the
      token that sets it. It no longer means "the band's light 60%" here — it is what holds the column
      over the dark part of the photograph. Widening it walks the copy into the curtains.
      ⚠️ AND BELOW 900px IT CANNOT HOLD AT ALL. `min-width: min(100%, 34rem)` beats the max-width, so
      the column spans the full width and crosses the bright right-hand side head-on: 2.31:1 there
      with no wash. That range takes a heavier wash, 0.4 against the 0.15 everywhere else.
      The closing band is the same photograph, cropped to a thin slice — see its own block below. */}
      <section style={{ padding: '6rem 2.5rem 5.5rem', position: 'relative', overflow: 'hidden' }}>
        <Image src={AURORA_SRC} alt="" aria-hidden fill priority sizes="100vw" style={{ objectFit: 'cover', objectPosition: '100% 100%' }} />
        <div className="tq-hero-wash" />
        <div style={{ maxWidth: 1180, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 'var(--gradation-ink-safe)', minWidth: 'min(100%, 34rem)' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.4rem, 4.6vw, 3.7rem)', fontWeight: 400, lineHeight: 1.14, letterSpacing: '-0.015em', color: 'var(--color-on-dark)', marginBottom: '0.9rem' }}>
              Sustainability reporting that suits your needs and budget.
            </h1>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.1rem, 2vw, 1.4rem)', fontWeight: 400, color: 'var(--color-on-dark)', lineHeight: 1.45, marginBottom: '1.5rem' }}>
              Self-guided, or with human advisors standing by to help.
            </p>
            <p style={{ fontSize: 15, color: 'var(--color-on-dark)', lineHeight: 1.7, maxWidth: '58ch', marginBottom: '2.25rem' }}>
              Customers, lenders and regulators are each asking for something different, and the rules change by country and by year. ThemisIQ works out which of them apply to you, tells you what to submit and when, and builds the reports from your own data.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href="/assess" style={{ ...btnOnDark, textDecoration: 'none' }}>Start the free assessment</a>
              <a href="/methodology" style={{ ...btnOnDarkOutline, textDecoration: 'none' }}>See how it works</a>
            </div>
            {/* --color-on-dark-muted, not opacity: the token file's DISABLED AND INACTIVE STATE block
                is explicit that opacity composites the text with whatever is behind it, which over a
                photograph is a different colour in every pixel and unmeasurable. */}
            <p style={{ fontSize: 13, color: 'var(--color-on-dark-muted)', marginTop: '1rem' }}>
              Three questions, no account needed.
            </p>
          </div>
        </div>
      </section>

      {/* ── THE REQUEST ── */}
      <section style={{ padding: '5.5rem 2.5rem', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: '3.5rem', alignItems: 'center' }}>
          {/* Photograph with the sample panel overlapping its lower right. */}
          <div style={{ position: 'relative', paddingBottom: '3.5rem', paddingRight: '1rem' }}>
            <Image src={PHOTOS.stillLife.src} alt={PHOTOS.stillLife.alt} width={PHOTOS.stillLife.w} height={PHOTOS.stillLife.h}
              style={{ width: '100%', height: 'auto', borderRadius: 6, display: 'block' }} />
            {/* ⚠️ A RENDERING, NOT A SCREENSHOT, AND LABELLED SO ON THE FACE OF IT. The assessment does
            not produce this view yet. Replace the whole panel with a real screenshot once it does; do
            not quietly drop the Sample marker in the meantime.
            ⚠️ THE COUNT IS NOT TYPED. The link read "See all six results" in the approved copy. There is
            no constant behind six, the assessment does not exist to be counted, and a number that is
            wrong on a sample panel is the kind of small checkable claim that turns out false. */}
            <div style={{ position: 'absolute', right: 0, bottom: 0, width: 'min(88%, 22rem)', background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderRadius: 6, boxShadow: '0 10px 30px rgb(21 26 29 / 0.12)', padding: '1.1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-ink-muted)' }}>Your assessment</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', border: '0.5px solid var(--color-line)', borderRadius: 99, padding: '2px 7px' }}>Sample</span>
              </div>
              {SAMPLE_RESULTS.map(r => (
                <div key={r.regulation} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 9, marginBottom: 9, borderBottom: '0.5px solid var(--color-line)' }}>
                  <span style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: `var(--color-module-${r.moduleKey})`, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-ink)', flex: 1 }}>{r.regulation}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-ink-muted)', whiteSpace: 'nowrap' }}>{r.module}</span>
                </div>
              ))}
              <a href="/assess" style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none' }}>See all your results →</a>
            </div>
          </div>

          <div>
            <h2 style={sectionTitle}>It usually starts with one email.</h2>
            <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.75, margin: '1rem 0 2rem', maxWidth: '58ch' }}>
              A customer sends a supplier questionnaire. A bank asks about climate risk before renewing a loan. Your board wants to know which regulations apply. ThemisIQ turns the request into a clear list of what you owe, then helps you produce it.
            </p>
            <dl style={{ margin: 0, borderTop: '1px solid var(--color-line-strong)' }}>
              {[
                ['You bring', 'Utility bills, supplier data, finance and HR exports.'],
                ['ThemisIQ applies', 'The right methodology and versioned factors for each framework.'],
                ['You get', 'Framework-ready reports with a trail back to every source document.'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(8rem, 10rem) 1fr', gap: '1.25rem', padding: '0.95rem 0', borderBottom: '1px solid var(--color-line)' }}>
                  <dt style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', paddingTop: 2 }}>{k}</dt>
                  <dd style={{ margin: 0, fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.65 }}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── PHOTO ESSAY ── */}
      <section style={{ padding: '5rem 2.5rem', background: 'var(--color-ground)', borderTop: '0.5px solid var(--color-line)', borderBottom: '0.5px solid var(--color-line)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <h2 style={sectionTitle}>The compliance landscape is expanding.</h2>
          <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.75, margin: '1rem 0 3rem', maxWidth: '62ch' }}>
            It now reaches companies that never thought of themselves as regulated. A few of the situations we see most:
          </p>
          {/* Offset grid: every second card drops, so the row reads as an essay rather than a table. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            {ESSAY.map((e, i) => (
              <figure key={e.who} style={{ margin: 0, marginTop: i % 2 === 1 ? '2.5rem' : 0 }}>
                <Image src={e.src} alt={e.alt} width={e.w} height={e.h}
                  style={{ width: '100%', height: 'auto', borderRadius: 6, display: 'block', marginBottom: '0.85rem' }} />
                <figcaption>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 4 }}>{e.who}</div>
                  <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6 }}>{e.what}</div>
                </figcaption>
              </figure>
            ))}
          </div>
          <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '1px solid var(--color-line-strong)', display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.7, maxWidth: '62ch', margin: 0 }}>
              Every country adds its own rules. Tell us where you operate, where you sell and who is asking, and the free assessment lists the regulations that apply to you.
            </p>
            <a href="/assess" style={{ ...btnPrimary, textDecoration: 'none', flexShrink: 0 }}>Start the free assessment</a>
          </div>
        </div>
      </section>

      {/* ── MODULES ── */}
      <section style={{ padding: '5.5rem 2.5rem', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: '2.75rem' }}>
          <div>
            <h2 style={sectionTitle}>ThemisIQ takes the guesswork out of sustainability reporting</h2>
            <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.75, marginTop: '1rem', maxWidth: '60ch' }}>
              Each one is built for a specific obligation and mapped to the frameworks that apply to it. Enter a figure once and it serves every report that needs it.
            </p>
          </div>
          <a href="/assess" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' }}>Unsure where you need to report? →</a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', gap: '1.25rem' }}>
          {MODULES_HOME.map(m => (
            <a key={m.name} href={m.href}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', background: 'var(--color-paper)', border: '1px solid var(--color-line)', borderTop: `4px solid var(--color-module-${m.key})`, borderRadius: 6, padding: '1.4rem', textDecoration: 'none', transition: 'background 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-ground)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-paper)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2 }}>{m.name}</div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6 }}>{m.desc}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 'auto', paddingTop: '0.6rem' }}>
                {m.chips.map(c => (
                  <span key={c} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'var(--color-ground)', border: '0.5px solid var(--color-line)', color: 'var(--color-ink-muted)' }}>{c}</span>
                ))}
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-brand)', paddingTop: '0.3rem' }}>See the module →</div>
            </a>
          ))}
        </div>

        {/* Three wider cards on a tinted ground. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '1.25rem', marginTop: '1.25rem' }}>
          {WIDER.map(w => (
            <a key={w.title} href={w.href}
              style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', background: 'var(--color-ground)', border: '1px solid var(--color-line)', borderRadius: 6, padding: '1.5rem', textDecoration: 'none', transition: 'background 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-sunken)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-ground)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--color-brand)' }}>{w.eyebrow}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2 }}>{w.title}</div>
              <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.65 }}>{w.desc}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-brand)', marginTop: 'auto', paddingTop: '0.7rem' }}>{w.cta} →</div>
            </a>
          ))}
        </div>
      </section>

      {/* ── FRAMEWORKS ──
      ⚠️ NO COUNT, AND THAT IS A RULE RATHER THAN A STYLE CHOICE. This row previously sat under a stat
      reading "30+ Frameworks covered". Nothing supported the 30: ALL_OBLIGATION_IDS has sixteen entries,
      the row itself has nineteen chips, and the GHG engine maps five frameworks to GWP sets — three
      unrelated numbers for one claim. The heading now says what the row is and the row is the evidence.

      ⚠️ TWO CHIPS WERE REMOVED ON 25 SEP 2026 AND MUST NOT COME BACK WITHOUT SOMETHING BEHIND THEM.
      "SEC Climate Rule" appeared nowhere in lib/ or app/ — nothing mapped, nothing scored, no export —
      and the rule's own status has never been settled. "RE100" appeared in exactly one place, a pricing
      bullet. Both claimed coverage the product does not have. Of the nineteen below, nine are entries in
      OBLIGATIONS (lib/obligations.ts); the other ten are standards the engine or a module cites by name,
      each verified in the tree: ESRS/CSRD 26 files in lib/, GHG Protocol 17, SBTi 12 (lib/sbti.ts), TCFD
      6, GRI 3, and ISO 27001, NIST AI RMF, NIST CSF, ISO 42001 and SASB in the Cyber, AI Governance and
      People module surfaces, which keep their control sets in app/ rather than lib/. Adding a chip means finding its
      evidence first.
      ⚠️ AND EVERY NAME HERE NOW RESOLVES TO AN app/frameworks/page.tsx ENTRY, which is a second test this
      strip applies and the reason four entries were added on 26 Sep 2026. A chip that links to a page not
      describing it is a promise the page breaks. */}
      <section style={{ padding: '4rem 2.5rem', borderTop: '0.5px solid var(--color-line)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 2.6vw, 2rem)', fontWeight: 400, color: 'var(--color-ink)', marginBottom: '0.6rem' }}>
            Frameworks we cover
          </h2>
          <p style={{ fontSize: 14, color: 'var(--color-ink-2)', marginBottom: '1.75rem' }}>
            Pre-mapped and export-ready, so a figure you enter once reaches every report that asks for it.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {FRAMEWORKS.map(f => (
              <span key={f} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 99, background: 'var(--color-ground)', border: '0.5px solid var(--color-line)', color: 'var(--color-ink-2)' }}>{f}</span>
            ))}
          </div>
        </div>
      </section>

      <HomePricing />

      {/* ── TRUST ── */}
      <section style={{ padding: '5rem 2.5rem', background: 'var(--color-ground)', borderTop: '0.5px solid var(--color-line)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <h2 style={sectionTitle}>We know trust is everything.</h2>
          <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.75, marginTop: '1rem' }}>
            We fully disclose all our methodologies so you can see how our reports stand up to review and verification. We handle your privacy and data with care, and encourage you to read how we are protecting your information.
          </p>
          {/* ⚠️ "EMISSIONS", NOT "YOUR DATA", AND THE NARROWNESS IS THE POINT. The verifier portal covers
          GHG Scope 1 and 2, CBAM, and Scope 3 Category 1, each behind a per-grant opt-in. Widening this
          to the platform would claim verifier access to modules that have no verifier surface at all. */}
          <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.75, marginTop: '1rem' }}>
            Your verifier can check your emissions figures back to their source, through access you grant and can revoke.
          </p>
          {/* ⚠️ THIS PARAGRAPH IS SCOPED AND MUST NOT LOOSEN. It moved here from the retired "How it
          works" section on 25 Sep 2026, intact. The platform-wide version — "every calculation and data
          point is logged with a full audit trail" — WAS FALSE: audit_log triggers cover the GHG, CBAM and
          concierge tables only (verified live 17 Sep 2026), and they record a saved change to a row
          rather than every edit. The three module names and the words "each saved change" are what make
          it true. ⚠️ IT IS NO LONGER A LITERAL HERE. This paragraph and the fuller form on
          app/climate-ghg/page.tsx were two strings in two files, each with a comment saying they must be
          corrected together — which no comment can enforce across a file boundary. Both now read from
          lib/auditTrailNotice.ts, which holds three widths of the one claim and the rule that a slot
          needing more does not invent a fourth form. Correct the constant, not this line. */}
          <p style={{ fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.75, marginTop: '1rem' }}>
            {AUDIT_TRAIL_NOTE_SHORT}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: '2rem' }}>
            <a href="/methodology" style={{ ...btnSecondary, textDecoration: 'none' }}>Our methodologies</a>
            <a href="/trust" style={{ ...btnSecondary, textDecoration: 'none' }}>How we handle your data</a>
          </div>
        </div>
      </section>

      {/* ── CLOSING BAND ──
      THE SAME PHOTOGRAPH AS THE HERO, so the page opens and closes on one image rather than on a
      gradient running the brand colourway backwards. Roughly a third the hero's height, which makes it
      a thin horizontal SLICE of the same frame: at 1440 the box is about 7:1, so `cover` scales to the
      width and crops the height to roughly a quarter of the picture. objectPosition therefore chooses
      which quarter, and its X only does anything below about 1100px, where the box stops being wider
      than the scaled image.
      ⚠️ THE OLD "COPY LEFT INSIDE --gradation-ink-safe" REASONING NO LONGER APPLIES. That held the copy
      to the band's light 60% so ink would clear it. There is no light end now, the copy is on-dark, and
      the maxWidth below is doing nothing but setting a measure. The buttons are on-dark for the same
      reason, and they sit over the brighter curtains, so they are measured separately.
      Measurements and the objectPosition reasoning are in the CLOSING BAND block in the token file. */}
      <section style={{ padding: '2.75rem 2.5rem', position: 'relative', overflow: 'hidden' }}>
        <Image src={AURORA_SRC} alt="" aria-hidden fill sizes="100vw" style={{ objectFit: 'cover', objectPosition: AURORA_CLOSE_POSITION }} />
        <div className="tq-close-wash" />
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', gap: '2.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 'var(--gradation-ink-safe)', minWidth: 'min(100%, 28rem)' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 400, color: 'var(--color-on-dark)', lineHeight: 1.2, marginBottom: '0.6rem' }}>
              Face the next request with confidence.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--color-on-dark)', lineHeight: 1.65, margin: 0, maxWidth: '54ch' }}>
              Three questions, no account needed. The free assessment lists the regulations your company is likely to face, country by country.
            </p>
            {/* ⚠️ SB253_SHORT, NOT A SENTENCE WRITTEN HERE. It renders "SB 253 · 10 Nov 2026 proposed",
            and the word "proposed" is the whole reason the constant exists: lib/sb253.ts records that a
            surface printing the date without it "states as settled a date that has already moved once".
            Do not compose a local variant, and do not trim the status word to fit the line. */}
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-on-dark)', marginTop: '1rem', letterSpacing: '0.01em' }}>
              {SB253_SHORT}
            </p>
          </div>
          {/* No flexShrink: 0 — see the note in ClosingBand. It defeated flexWrap and overflowed at 375px. */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="/assess" style={{ ...btnOnDark, textDecoration: 'none' }}>Start the free assessment</a>
            <a href="/advisory" style={{ ...btnOnDarkOutline, textDecoration: 'none' }}>Talk to us</a>
          </div>
        </div>
      </section>

      {/* The 4px gradation rule that sat here is gone, 28 Sep 2026. It separated the closing band from
      the footer, and the band it separated them with was the colourway the photograph replaced; under a
      photograph it read as a stripe of the old brand rather than a divider. The footer's own deep blue
      is the separation now. Nothing else referenced it — it was a bare div, not a class or a token. */}
      <Footer />
    </div>
  )
}

// ── DATA ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * ⚠️ SIX PHOTOGRAPHS, SUPPLIED SEPARATELY, AND NOT ONE OF THEM IS STOCK. The files below do not exist
 * in the repo yet: until they land the page renders with broken images, which is the intended failure —
 * a placeholder would be indistinguishable from a finished page. Required, all in public/home/:
 *   still-life.jpg   1200 x 900   the request section
 *   essay-steel.jpg  800 x 1000   } the five essay photographs, portrait, so the offset grid reads
 *   essay-parts.jpg  800 x 1000   } as a column of unlike scenes rather than a filmstrip
 *   essay-grain.jpg  800 x 1000   }
 *   essay-timber.jpg 800 x 1000   }
 *   essay-software.jpg 800 x 1000 }
 * Alt text describes the SCENE, never the caption: a screen reader user gets the caption from the
 * figcaption immediately after it, so repeating it there says the same thing twice and describes
 * nothing.
 */
const PHOTOS = {
  stillLife: { src: '/home/still-life.jpg', w: 1200, h: 900, alt: 'A printed utility bill, a laptop and a coffee cup on a wooden desk beside a window.' },
} as const

const ESSAY = [
  { who: 'Steel and aluminium exporter', what: 'Shipping into the EU. The embedded emissions in each shipment are declarable under CBAM.',
    src: '/home/essay-steel.jpg', w: 800, h: 1000, alt: 'Coils of rolled steel stacked in a warehouse, lit from a high window.' },
  { who: 'Tier 2 parts supplier', what: 'An automotive customer wants Scope 1 and 2 data before the next contract renewal.',
    src: '/home/essay-parts.jpg', w: 800, h: 1000, alt: 'Machined metal components in a tray on a factory bench.' },
  { who: 'Grain grower or processor', what: 'A food brand wants farm-level emissions data for its Scope 3 target.',
    src: '/home/essay-grain.jpg', w: 800, h: 1000, alt: 'A combine harvester moving through a ripe wheat field.' },
  { who: 'Timber and wood products producer', what: 'Buyers want land use, carbon removals and sourcing evidence on the record.',
    src: '/home/essay-timber.jpg', w: 800, h: 1000, alt: 'Stacked sawn timber in a mill yard with forest behind it.' },
  { who: 'Growing software company', what: 'Enterprise procurement wants AI and cybersecurity governance policies.',
    src: '/home/essay-software.jpg', w: 800, h: 1000, alt: 'Two people at a desk looking at code on a monitor in an open-plan office.' },
] as const

/**
 * The sample assessment panel's three rows. `moduleKey` is a --color-module-* key, so the stripe
 * matches the card for the same module further down the page and follows it through the palette swap.
 */
const SAMPLE_RESULTS = [
  { regulation: 'California SB 253', module: 'GHG Emissions', moduleKey: 'ghg' },
  { regulation: 'EU CBAM', module: 'CBAM', moduleKey: 'cbam' },
  { regulation: 'EU CS3D', module: 'Supply Chain', moduleKey: 'supply' },
] as const

/**
 * ⚠️ `key` IS A --color-module-* TOKEN KEY, NOT A HEX. The approved design named a colourway value per
 * card; using those literals here would put eight colourway values live on one page, outside
 * lib/tokenContrast.test.ts's sight, and leave them to be found again at the swap. The token means the
 * cards move once, with everything else. See the note at the top of this file for why a 4px rule may
 * carry a fill value at all.
 */
const MODULES_HOME = [
  { name: 'GHG Emissions', key: 'ghg', href: '/climate-ghg',
    desc: 'Scope 1, 2 and 3 inventory with an audit trail behind every figure.',
    chips: ['SB 253', 'GHG Protocol', 'ESRS E1'] },
  { name: 'Climate Risk', key: 'climate', href: '/climate-risk',
    desc: 'Physical and transition risk, scenario analysis, resilience reporting.',
    chips: ['SB 261', 'IFRS S2', 'TCFD'] },
  { name: 'Supply Chain', key: 'supply', href: '/supply-chain',
    desc: 'Supplier data collection, human rights risk mapping, and the primary data that feeds Scope 3 Category 1.',
    chips: ['CS3D', 'EcoVadis', 'Modern Slavery Act', 'ESRS S2'] },
  { name: 'CBAM', key: 'cbam', href: '/cbam',
    desc: 'Embedded emissions for goods entering the EU, installation by installation.',
    chips: ['EU CBAM', 'CBAM Annex IV'] },
  { name: 'Deals and Investment', key: 'deals', href: '/deals',
    desc: 'For M&A, family offices and companies getting ready to sell. Which rules apply, from what year, and what they cost to meet. Run it on a target before you buy, or on yourself before you are asked.',
    chips: ['SB 253', 'SECR', 'Canada S-211', 'CSRD', 'CS3D'] },
  { name: 'AI Governance', key: 'ai', href: '/ai-governance',
    desc: 'Model inventory, risk register and policy management.',
    chips: ['EU AI Act', 'NIST AI RMF', 'ISO 42001'] },
  { name: 'Cyber Governance', key: 'cyber', href: '/cyber',
    desc: 'A gap assessment against NIS2, DORA and the SEC rules, scored across 25 controls.',
    chips: ['NIS2', 'DORA', 'ISO 27001'] },
  { name: 'People and Workforce', key: 'people', href: '/people',
    desc: 'Human capital reporting, pay equity, health and safety.',
    chips: ['ESRS S1', 'Pay Transparency', 'CSRD'] },
  { name: 'Forced Labour Reporting', key: 'labour', href: '/forced-labour',
    desc: 'Supply chain reports, country by country. Available now: Canada (S-211). Prepared section by section and downloaded as a PDF for approval and signing.',
    chips: ['Canada S-211'] },
] as const

/**
 * Nineteen, and 'SASB' left and returned within the same day on 26 Sep 2026.
 * ⚠️ IT WAS NEVER UNBACKED, AND THE AUDIT THAT SAID SO WAS WRONG. app/dashboard/people/page.tsx:285 has
 * offered 'SASB Human Capital' as a selectable framework throughout; the audit grepped lib/ and
 * app/frameworks/ and not app/dashboard/, and the section comment above had it right all along. It came
 * off for the narrower reason that it resolved to no app/frameworks/page.tsx entry, which is the test this
 * strip applies, and it is back because that entry now exists. GRI 305, SEC Cybersecurity Rules and the
 * Modern Slavery Act were added in the same pass for the same reason.
 * Not a count to be printed — see the section comment for why the
 * "30+" stat went — and not a
 * hand-typed list forever: it duplicates names that lib/obligations.ts already holds for nine of them.
 * Deriving the nine from OBLIGATIONS and keeping ten literals would be a smaller lie than this, and is
 * logged rather than done here because it changes what a chip IS.
 */
const FRAMEWORKS = [
  'SB 253 (California)', 'SB 261 (California)', 'ESRS E1 / CSRD', 'IFRS S2', 'CDP Climate', 'EcoVadis',
  'TCFD', 'GHG Protocol', 'GRI', 'SBTi', 'NIST AI RMF', 'EU AI Act', 'ISO 42001', 'ISO 27001',
  'NIST CSF', 'SASB', 'EU Pay Transparency', 'NIS2', 'DORA',
] as const

const WIDER = [
  { eyebrow: 'Start here if you report under CSRD', title: 'The Materiality Assessment',
    desc: 'Work out which sustainability topics actually matter to your business, and which of them you have to report on. Add Climate Risk for the full CSRD picture.',
    cta: 'See sample reports', href: '/materiality' },
  { eyebrow: 'Part of the GHG module', title: 'SBTi Targets',
    desc: 'Set and track science-based targets under the Corporate Net-Zero Standard, using the inventory you have already built.',
    cta: 'See how targets are set', href: '/climate-ghg' },
  { eyebrow: 'When you want a person', title: 'Advisory Services',
    desc: 'Assurance preparation, sector guidance and board-ready narratives from practitioners.',
    cta: 'Talk to a specialist', href: '/advisory' },
] as const

// ── STYLES ────────────────────────────────────────────────────────────────────────────────────────
/* eyebrowOnBand is gone with the hero eyebrow it was written for, 28 Sep 2026. The closing band never
   carried one, so nothing else referenced it; it is not held back for a future eyebrow, because an
   eyebrow over the hero photograph would need on-dark colour and would not be this style anyway. */
