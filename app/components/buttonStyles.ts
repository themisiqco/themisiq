import type { CSSProperties } from 'react'

/**
 * The two marketing-page button styles, defined once.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE PREVIOUS ARRANGEMENT WAS THIRTEEN COPIES.
 * app/page.tsx, advisory, ai-governance, cbam (×3), climate-ghg, climate-risk, cyber,
 * deals, materiality, people and supply-chain each declared their own `btnPrimary` and
 * `btnSecondary` at the bottom of the file, character-for-character identical apart from
 * the padding on the three CBAM pages. A palette change therefore had to be applied
 * thirteen times, and a miss was invisible — the button still rendered, just in the old
 * brand, on one page out of thirteen. No sweep over dark panels or JSX elements finds
 * these, because the colour lives in a style object below the component, not on a tag.
 *
 * ⚠️ COLOURS ARE CSS CUSTOM PROPERTIES, NOT HEX. They resolve against
 * app/styles/themisiq-tokens.css, which is the authority. Do not inline a hex here to
 * "make it explicit" — that reintroduces exactly the drift this file removes. The one
 * context that genuinely cannot read a custom property is email HTML and jsPDF, and that
 * case is served by lib/brand.ts, whose sync with the token file is enforced by
 * lib/brand.test.ts.
 *
 * Every current call site is an `<a>`. `border: 'none'` and `cursor: 'pointer'` are
 * carried anyway (they came from app/page.tsx's copy) so the styles are also correct on a
 * `<button>`, where the UA default border would otherwise show through.
 */

/** Filled: brand ground, reversed text. */
export const btnPrimary: CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  padding: '13px 32px',
  borderRadius: 8,
  background: 'var(--color-brand)',
  color: 'var(--color-on-dark)',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-block',
}

/** Outlined: no fill, brand text and edge. */
export const btnSecondary: CSSProperties = {
  fontSize: 14,
  fontWeight: 400,
  padding: '13px 32px',
  borderRadius: 8,
  background: 'none',
  color: 'var(--color-brand)',
  border: '0.5px solid var(--color-brand)',
  cursor: 'pointer',
  display: 'inline-block',
}
