/**
 * The PDF palette, shared by lib/pdf/layout.ts and lib/assurancePdf.ts.
 *
 * ⚠️ NO HEAVY IMPORTS. layout.ts statically imports ../fonts/charis (167 KB) and ./logo (70 KB) —
 * around 232 KB of base64 before jsPDF itself, which is why
 * app/dashboard/stakeholder/[id]/report/page.tsx dynamic-imports the generator. If assurancePdf.ts
 * took its colours from layout.ts it would drag that whole graph in for four strings.
 * The ONE import below is ../brand: 76 lines of colour constants with no imports of its own, and
 * already in both PDF modules' graphs (layout.ts:27 and assurancePdf.ts:5 both take BRAND from it).
 * It adds nothing. Anything with a dependency of its own does not belong here.
 *
 * ⚠️ IT EXISTS BECAUSE THE TWO GENERATORS DISAGREED. Each kept its own palette, and
 * assurancePdf.ts's muted grey was '#888784' — 3.36:1, below AA — for as long as layout.ts's
 * comment had been recording that it had measured and rejected that exact value. A rejection
 * written in one module does not reach another. lib/pdf/palette.test.ts now asserts the agreement
 * rather than leaving it to be noticed.
 *
 * ⚠️ EVERY GREY HERE WAS MEASURED, NOT INHERITED. The site's muted grey #888784 reaches only
 * 3.36:1 against the paper colour — it fails WCAG AA for body and supporting text (4.5:1) and
 * passes only the 3:1 large-text bar. It is NOT used at any size. A board paper is read by
 * directors, in meeting rooms, on printouts, and often by people over fifty; a grey that fails on
 * a backlit screen fails worse on a laser print of a laser print.
 *
 * Ratios are computed against PAPER (#f8f7f5), the background of the cover and the assumed
 * background of every page — EXCEPT the three values under "reversed" below, which are drawn on
 * the INK cover block and are measured against that instead.
 *
 * BRAND is not here either. It lives in lib/brand.ts with the rest of the brand literals, where
 * lib/brand.test.ts checks it against app/styles/themisiq-tokens.css.
 */

import { INK_MUTED } from '../brand'

/** The cover and page stock. Every ratio below is against this unless stated. */
export const PAPER = '#f8f7f5'

/** 18.15:1 on PAPER. Body text, headings, anything that carries meaning. */
export const INK = '#0d0d0d'

/** 6.98:1 on PAPER. Secondary body — captions that are still prose. */
export const SECONDARY = '#555553'

/**
 * 5.39:1 on PAPER. The lightest grey permitted for small text: footers, labels, the cover's
 * supporting lines.
 *
 * ⚠️ WAS '#6e6d6a' (4.83:1). Both values pass; this one is the same grey the screens and the email
 * templates use, so one role now has one value across all three output formats instead of a
 * screen grey and a print grey that happened to agree on nothing but their intent. It also buys
 * +0.56 of ratio on the cover stock, which matters more in print than on a backlit screen.
 *
 * The rejections still stand and are worth keeping: #888784 (3.36:1) and #767572 (4.30:1) were
 * both measured against this same stock and both fail. #6e6d6a passed and was only displaced for
 * consistency, not because it was wrong.
 *
 * IMPORTED, NOT RETYPED — the literal lives in lib/brand.ts, where lib/brand.test.ts asserts it
 * against app/styles/themisiq-tokens.css (--color-ink-muted). Declaring the hex again here would
 * put it outside that check.
 */
export const MUTED = INK_MUTED

/**
 * 11.80:1 on PAPER. Table body text only, at 7–9pt.
 * A deliberate step lighter than INK so dense tabular matter reads below its headings. Named here
 * because it was six unnamed copies of '#333333' in assurancePdf.ts, which is how MUTED drifted.
 */
export const TABLE_INK = '#333333'

/** 1.16:1 on PAPER — a hairline, never type. Section dividers drawn with doc.line(). */
export const HAIRLINE = '#e8e7e4'

// ── reversed: drawn on the INK cover block, NOT on PAPER ─────────────────────────────────────────
// The cover fills its top 200pt with INK (doc.setFillColor(INK); doc.rect(0, 0, W, 200)). These two
// are light-on-dark and must be measured against #0d0d0d. Against PAPER they scan as failures —
// 2.37:1 and 1.07:1 — and a contrast check that does not know the surface will report them as such.

/** 7.66:1 on INK. Cover supporting line. ⚠️ 2.37:1 on PAPER — never use it on the stock. */
export const ON_COVER_MUTED = '#9ca3af'

/** 19.44:1 on INK. Cover title and table header text. ⚠️ 1.07:1 on PAPER. */
export const ON_COVER = '#ffffff'
