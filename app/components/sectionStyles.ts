import type { CSSProperties } from 'react'

/**
 * The "ruled section" — a light feature section that sits ON the page rather than in a band.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE PREVIOUS ARRANGEMENT WAS FOUR FULL-BLEED DARK SECTIONS.
 * app/cbam, app/deals, app/ai-governance and app/cyber each carried the same
 * `background: '#0d0d0d', padding: '4rem 2.5rem'` block with the same eyebrow + h2 pair, the same
 * three text alphas, and — in three of the four — the same nested rgba(255,255,255,0.05) card.
 * The homepage flagship section was a fifth copy. A treatment change therefore had to be applied
 * four or five times, and a miss was invisible: the section still rendered, just in the old
 * treatment, on one page out of five.
 *
 * ⚠️ A DARK BAND AND A TINTED BAND BOTH READ AS "MARKETING". A 2px ink rule and a heading read as
 * "the next section", which is what these are. The rule is drawn on the inner column, not
 * full-bleed, so it aligns with the content rather than the window.
 *
 * ⚠️ THE NESTED CARD COULD NOT BE RECOLOURED, AND THAT IS WHY listRow EXISTS.
 * rgba(255,255,255,0.05) on #0d0d0d renders #191919 — a 1.11:1 separation from the panel behind
 * it. A fill that faint is not a surface; it reads only because the surround is black, and on a
 * light ground there is no equivalent value to move it to. So the card becomes a ruled list: a
 * hairline between rows and no box at all. The six credibility cards on the homepage hit the same
 * wall in task 22 and took the same answer.
 *
 * The h2 that pairs with these lives in ./headingStyles as `ruledSectionTitle` — display type
 * belongs in one file, which is the whole point of that module.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⚠️ STANDING RULE FOR EVERY SECTION CONVERTED TO THIS PATTERN:
 *    NEVER REBUILD A BLOCK BY RETYPING IT. Copy is only ever moved by surgical replacement of the
 *    styling AROUND it — replace the style attribute, leave the text node untouched.
 *
 * This is not a tidiness preference. Rebuilding app/ai-governance/page.tsx by retyping replaced a
 * 640-character legal paragraph with a shorter paraphrase of my own, carrying an invented constant
 * and rewritten enacted dates and Article references, on a page whose whole subject is what the
 * EU AI Act requires and when. `tsc` caught the constant because it did not exist. It could not
 * have caught the rewritten copy — a fabricated date is a valid string. The original was recovered
 * from the previous build's rendered HTML.
 *
 * On a compliance product the copy IS the deliverable. A styling task must not be able to change
 * what the product asserts about the law. Surgical replacement makes that structurally impossible
 * rather than a thing to be careful about.
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The outer <section>. Full-width padding; the rule is on the inner column. */
export const ruledSection: CSSProperties = {
  padding: '4rem 2.5rem 5rem',
}

/** The content column, opened by the 2px ink rule. */
export const ruledSectionInner: CSSProperties = {
  maxWidth: 1100,
  margin: '0 auto',
  borderTop: '2px solid var(--color-ink)',
  paddingTop: '2.25rem',
}

/**
 * The two-column split — prose left, ruled list right.
 * ⚠️ alignItems IS 'start', NOT 'center'. All four centred a card against the prose; a list has no
 * vertical centre to align to, and centring one leaves it floating away from its own heading.
 */
export const ruledSectionSplit: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '4rem',
  alignItems: 'start',
}

/** Group heading inside a ruled list, with the heavier rule that separates groups from rows. */
export const listGroup: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-ink-muted)',
  marginBottom: 4,
  paddingBottom: 10,
  borderBottom: '1px solid var(--color-line-strong)',
}

/** One row of a ruled list. The hairline is what delimits rows — there is no bullet and no fill. */
export const listRow: CSSProperties = {
  padding: '12px 0',
  borderBottom: '1px solid var(--color-line)',
}
