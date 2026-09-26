import type { CSSProperties, ReactNode } from 'react'
import type { ModuleKey } from '@/lib/pricing'
import { evidenceClaim } from '@/lib/modulePages'
import { btnOnBand, btnOnBandOutline } from './buttonStyles'
import { sectionTitle } from './headingStyles'

/**
 * The sections every module marketing page shares, built once.
 *
 * ⚠️ FOUR PIECES, AND ONLY FOUR, DELIBERATELY. The nine-section module shape has more in common than
 * this, but three of its sections — the arrivals, what it covers, and the questions — are shared in
 * SHAPE and not yet proven in CONTENT: they were designed against Climate Risk alone, and a component
 * built on one instance gets reshaped by the second. Those stay longhand until two real pages exist.
 * What is here is either pure data-in (the spine, the chips) or a correctness gate (the evidence
 * section), plus the closing band, which must be shared because the homepage already demonstrated the
 * failure: two gradation bands drifting apart is why btnOnBand exists at all.
 */

/* ── 1. The three-step spine ─────────────────────────────────────────────────────────────────────── */

/**
 * You bring / ThemisIQ applies / You get. A definition list, not cards.
 *
 * ⚠️ THE ORDER IS THE ARGUMENT AND IS FIXED BY THE TYPE, not by the caller's array order. A caller
 * that could pass these in any order could put "You get" first, which reverses the claim from "here is
 * what little we need" into "here is what we promise".
 */
export function ModuleSpine({ bring, applies, get }: { bring: string; applies: string; get: string }) {
  return (
    <dl style={{ margin: 0, borderTop: '1px solid var(--color-line-strong)' }}>
      {([['You bring', bring], ['ThemisIQ applies', applies], ['You get', get]] as const).map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(9rem, 12rem) 1fr', gap: '1.5rem', padding: '1.1rem 0', borderBottom: '1px solid var(--color-line)' }}>
          <dt style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', paddingTop: 2 }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 14, color: 'var(--color-ink-2)', lineHeight: 1.7 }}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ── 2. Framework chips ──────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ EVERY CHIP LINKS TO /frameworks, WITHOUT EXCEPTION, which is why the href is not a parameter.
 * A chip naming a regulation and going nowhere is a dead end on the page whose job is to say which
 * rules reach the reader. /frameworks is where each one is described, sourced and mapped to a module.
 */
export function FrameworkChips({ names }: { names: readonly string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {names.map(n => (
        <a key={n} href="/frameworks"
          style={{ fontSize: 12, padding: '6px 14px', borderRadius: 99, background: 'var(--color-ground)', border: '0.5px solid var(--color-line)', color: 'var(--color-ink-2)', textDecoration: 'none' }}>
          {n}
        </a>
      ))}
    </div>
  )
}

/* ── 3. The evidence section — THE CORRECTNESS GATE ──────────────────────────────────────────────── */

/**
 * ⚠️ THE PAGE CANNOT CHOOSE ITS OWN EVIDENCE CLAIM, AND THAT IS THE POINT OF THIS COMPONENT. It passes
 * its moduleKey and its own one-line workings claim; lib/modulePages.ts decides whether a verifier
 * sentence follows. There is no prop for the second paragraph, so a page cannot assert a verifier
 * surface it does not have.
 *
 * Verifier claims are true for GHG and CBAM only, plus Scope 3 Category 1 behind a per-grant opt-in.
 * The remaining five modules have no verifier surface AND no audit_log trigger — see the long note in
 * lib/modulePages.ts, which records that "the audit-trail paragraph, true everywhere" was not true.
 */
export function EvidenceSection({ moduleKey, workings, heading = 'How you stand behind it' }: {
  moduleKey: ModuleKey
  workings: string
  heading?: string
}) {
  return (
    <>
      <h2 style={sectionTitle}>{heading}</h2>
      <p style={bodyCopy}>{workings}</p>
      <p style={{ ...bodyCopy, marginTop: '1rem' }}>{evidenceClaim(moduleKey)}</p>
    </>
  )
}

/* ── 4. The closing band ─────────────────────────────────────────────────────────────────────────── */

/**
 * ⚠️ SHARED BECAUSE TWO BANDS ALREADY DRIFTED ONCE. app/page.tsx's hero and closing band are both
 * --gradation-band from the same token for exactly this reason, and btnOnBand exists so neither reaches
 * for a one-off style.
 *
 * ⚠️ COPY LEFT, INSIDE --gradation-ink-safe. The band runs light to dark, left to right, and
 * --color-ink clears AA body to 72% of its width. The 60% cap is the margin. If a layout ever wants
 * copy on the right, FLIP THE BAND rather than changing the text colour — see the GRADATION block in
 * app/styles/themisiq-tokens.css. Buttons sit right and are ink-filled and ink-outlined, so they do
 * not depend on the ground behind them.
 */
export function ClosingBand({ heading, body, primary, secondary }: {
  heading: string
  body?: string
  primary: { href: string; label: string }
  secondary?: { href: string; label: string }
}) {
  return (
    <section style={{ background: 'var(--gradation-band)', padding: '2.75rem 2.5rem' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', gap: '2.5rem', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 'var(--gradation-ink-safe)', minWidth: 'min(100%, 28rem)' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 2.8vw, 2.1rem)', fontWeight: 400, color: 'var(--color-ink)', lineHeight: 1.2 }}>{heading}</h2>
          {body && <p style={{ fontSize: 14, color: 'var(--color-ink)', lineHeight: 1.65, margin: '0.6rem 0 0', maxWidth: '54ch' }}>{body}</p>}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
          <a href={primary.href} style={{ ...btnOnBand, textDecoration: 'none' }}>{primary.label}</a>
          {secondary && <a href={secondary.href} style={{ ...btnOnBandOutline, textDecoration: 'none' }}>{secondary.label}</a>}
        </div>
      </div>
    </section>
  )
}

/* ── Shared type scale for module pages ──────────────────────────────────────────────────────────── */

export const bodyCopy: CSSProperties = { fontSize: 15, color: 'var(--color-ink-2)', lineHeight: 1.75, maxWidth: '62ch' }
export const moduleEyebrow: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 10 }

/** A page section with the standard rhythm. `tinted` puts it on --color-ground with hairlines. */
export function ModuleSection({ children, tinted = false, id }: { children: ReactNode; tinted?: boolean; id?: string }) {
  return (
    <section id={id} style={{
      padding: '4.5rem 2.5rem',
      ...(tinted ? { background: 'var(--color-ground)', borderTop: '0.5px solid var(--color-line)', borderBottom: '0.5px solid var(--color-line)' } : {}),
      ...(id ? { scrollMarginTop: 80 } : {}),
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
    </section>
  )
}
