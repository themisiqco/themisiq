import type { CSSProperties } from 'react'

/**
 * The shared display-type styles, defined once.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE PREVIOUS ARRANGEMENT WAS THIRTY COPIES.
 * `sectionTitle` was declared byte-for-byte identically in twelve marketing pages and
 * `sectionHead` in twelve dashboards, plus itemHead, groupHeading and a page-level h1 —
 * around 150 call sites reading roughly thirty local constants. A type change therefore
 * had to be applied thirty times, and a miss was invisible: the heading still rendered,
 * just in the old face, on one page out of twelve. Same shape as the btnPrimary problem
 * that app/components/buttonStyles.ts fixed, one axis over.
 *
 * ⚠️ THE FACE IS var(--font-display), NOT A LITERAL. It resolves through
 * app/styles/themisiq-tokens.css, whose own declaration is
 * `var(--font-literata), Georgia, serif` — so Georgia remains the fallback and nothing
 * here loses its tail if Literata fails to load. Do not inline 'Georgia, serif' to "make
 * it explicit"; that is precisely the drift this file removes.
 *
 * ⚠️ TWO CONTEXTS DELIBERATELY DO NOT USE THIS FILE, and both are commented at the site:
 *   - the ThemisIQ wordmark, which is a logotype rather than a heading, and
 *   - email HTML, which cannot resolve a custom property and cannot rely on a web font.
 * The three print-rendered verifier reports also still declare their own; they are
 * documents an auditor receives, and changing their face is a separate decision.
 *
 * ⚠️ COLOUR IS STILL THE LITERAL '#0d0d0d', carried over unchanged so this consolidation
 * is type-only and cannot move a rendered colour. It wants to become var(--color-ink)
 * (#151A1D) in the colour pass, not here.
 */

/** Marketing-page section title. 12 files, fluid. */
export const sectionTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(1.9rem, 3.5vw, 2.6rem)',
  fontWeight: 400,
  lineHeight: 1.2,
  marginBottom: '1rem',
  color: '#0d0d0d',
}

/** Dashboard step heading, fluid. 7 module dashboards. */
export const sectionHead: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)',
  fontWeight: 400,
  color: '#0d0d0d',
  marginBottom: 8,
}

/**
 * Dashboard step heading at a fixed size. dashboard/ghg and the three CBAM pages.
 * Kept as its own export rather than folded into sectionHead: those four render inside
 * a narrower column where the clamp's upper bound overshoots.
 */
export const sectionHeadFixed: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.6rem',
  fontWeight: 400,
  color: '#0d0d0d',
  marginBottom: 8,
}

/** Sub-heading within a CBAM step, spaced away from the block above it. */
export const itemHead: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.15rem',
  fontWeight: 400,
  color: '#0d0d0d',
  marginBottom: 10,
  marginTop: '2rem',
}

/** Same size, no top gap — used where the heading opens a block. */
export const itemHeadTight: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.15rem',
  fontWeight: 400,
  color: '#0d0d0d',
  marginBottom: 4,
}

/** Page-level title. Currently only /frameworks. */
export const pageTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(2.2rem, 5vw, 3.4rem)',
  fontWeight: 400,
  lineHeight: 1.15,
  color: '#0d0d0d',
  marginBottom: '1.25rem',
}

/** Group heading within a long reference page. Currently only /frameworks. */
export const groupHeading: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.7rem',
  fontWeight: 400,
  color: '#0d0d0d',
  marginBottom: 6,
}
