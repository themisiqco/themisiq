/**
 * A small layout layer over jsPDF, so a long document can be written as content rather than as
 * coordinate arithmetic.
 *
 * lib/assurancePdf.ts positions everything inline — every `doc.text(x, y)` computed by hand at the
 * call site. That is workable for one document of a known length. A nine-section board paper is
 * not: page breaks fall wherever the prose lands, a heading can orphan from its first paragraph,
 * and every insertion re-flows every number after it. This module owns the cursor instead.
 *
 * ⚠️ A4, NOT LETTER, AND THAT DIVERGENCE FROM assurancePdf.ts IS DELIBERATE.
 * The GHG assurance pack is letter because it is read chiefly in North America. This document is
 * the CSRD board paper: its readers are European boards, European assurance providers and European
 * regulators, and a letter-sized page in that setting prints short and reads as an import. Do not
 * "align" the two — they are different documents for different audiences, and the format is a
 * property of the audience, not of the codebase.
 *
 * ⚠️ NOTHING ON A DARK FIELD. There is no reversed-out type anywhere in this module and none may be
 * added. Reversed type on a laser printer fills in, and this is a document people print, hole-punch
 * and take into a meeting. The cover is paper-coloured for the same reason.
 *
 * ⚠️ THE GRADIENT IS A HAIRLINE, NEVER A FIELD. See rule() below.
 */

import jsPDF from 'jspdf'
import { registerCharis, CHARIS_FAMILY } from '../fonts/charis'
import { THEMISIQ_WORDMARK_DATA_URI, WORDMARK_ASPECT } from './logo'

// ── page ─────────────────────────────────────────────────────────────────────────────────────────

/** Points, as assurancePdf.ts uses. A4 portrait is 595.28 × 841.89pt. */
export const MARGIN = {
  left: 56,
  right: 56,
  top: 56,
  /** Deeper than the top: the footer sits inside this band. */
  bottom: 64,
} as const

/** Space reserved above the bottom margin for the footer baseline. */
const FOOTER_BASELINE_UP = 22

// ── colour ───────────────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ EVERY GREY HERE WAS MEASURED, NOT INHERITED. The site's muted grey #888784 reaches only
 * 3.36:1 against the paper colour — it fails WCAG AA for body and supporting text (4.5:1) and
 * passes only the 3:1 large-text bar. It is NOT used in this module at any size. A board paper is
 * read by directors, in meeting rooms, on printouts, and often by people over fifty; a grey that
 * fails on a backlit screen fails worse on a laser print of a laser print.
 *
 * Ratios below are computed against PAPER (#f8f7f5), which is the background of the cover and the
 * assumed background of every page. Against pure white each is very slightly higher, so a page that
 * is left white rather than tinted stays compliant.
 */
export const PAPER = '#f8f7f5'

/** 18.15:1 on PAPER. Body text, headings, anything that carries meaning. */
export const INK = '#0d0d0d'

/** 6.98:1 on PAPER. Secondary body — captions that are still prose. */
export const SECONDARY = '#555553'

/**
 * 4.83:1 on PAPER. The lightest grey this module permits for small text: footers, labels, the
 * cover's supporting lines. Chosen over #888784 (3.36:1, fails) and over #767572 (4.30:1, still
 * fails) — this clears 4.5:1 with enough margin that a slightly darker paper stock cannot push it
 * under.
 */
export const MUTED = '#6e6d6a'

/**
 * The brand gradient's three stops. ⚠️ FOR THE HAIRLINE ONLY — NEVER FOR TEXT.
 * On PAPER: #7425e3 is 6.29:1 and would be legible, but #1fb1ff is 2.23:1 and #64fe3e is 1.24:1,
 * both far below any threshold. Keeping all three out of type removes the question of which stop a
 * given word landed on.
 */
export const GRADIENT_STOPS = ['#7425e3', '#1fb1ff', '#64fe3e'] as const

// ── type scale ───────────────────────────────────────────────────────────────────────────────────

export type HeadingLevel = 1 | 2 | 3

/**
 * ⚠️ LEVEL 1 IS REGULAR, NOT BOLD, AND THAT IS NOT AN OVERSIGHT. At 20pt a bold serif closes its
 * counters — the enclosed white inside a, e, o — and the line reads heavier and muddier than the
 * same words set regular. Charis has a strong regular weight that holds a page opener on its own.
 * Bold earns its place at the smaller levels, where it is doing the work of distinguishing a
 * heading from the body around it.
 */
const HEADING: Record<HeadingLevel, { size: number; style: 'normal' | 'bold'; above: number; below: number }> = {
  1: { size: 20, style: 'normal', above: 26, below: 12 },
  2: { size: 15, style: 'bold', above: 20, below: 9 },
  3: { size: 12, style: 'bold', above: 15, below: 7 },
}

const BODY_SIZE = 10.5
/** 1.65 — generous, because this is continuous prose read at length rather than scanned. */
const BODY_LEADING = 1.65
const BODY_LINE = BODY_SIZE * BODY_LEADING

const LEAD_SIZE = 12.5
const LEAD_LEADING = 1.6
const LEAD_LINE = LEAD_SIZE * LEAD_LEADING

const FOOTER_SIZE = 8

/** ≤ 3pt, per the note on rule(). */
const RULE_HEIGHT = 2

// ── colour helpers ───────────────────────────────────────────────────────────────────────────────

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const mix = (a: string, b: string, t: number): [number, number, number] => {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return [
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  ]
}

// ── the layout ───────────────────────────────────────────────────────────────────────────────────

export type CoverFields = {
  company: string | null
  assessmentName: string | null
  period: string | null
  /** Already resolved to its customer wording. null renders as not stated — never as a default. */
  standardVersionLabel: string | null
  roundName: string | null
  closedOn: string | null
}

export type Layout = {
  doc: jsPDF
  /** Current baseline cursor. Every operation returns the new value as well as moving it. */
  y(): number
  page(): number
  contentWidth: number
  pageWidth: number
  pageHeight: number

  heading(text: string, level: HeadingLevel): number
  body(text: string): number
  lead(text: string): number
  rule(): number
  spacer(pt: number): number
  keepTogether(estimatedHeight: number, fn: () => void): number
  footer(pageNumber: number, total: number): void
  newPage(): number
  coverPage(fields: CoverFields): number
}

/**
 * Create an A4 document with Charis registered and the cursor at the top margin.
 *
 * ⚠️ registerCharis IS CALLED HERE, ONCE, BEFORE ANY setFont. It writes into THIS document's
 * virtual file system, so a second document needs its own createLayout — see the note in
 * lib/fonts/charis.ts.
 */
export function createLayout(): Layout {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  registerCharis(doc)

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const contentWidth = pageWidth - MARGIN.left - MARGIN.right
  const bottomLimit = pageHeight - MARGIN.bottom

  let y = MARGIN.top
  let page = 1

  const newPage = (): number => {
    doc.addPage()
    page += 1
    y = MARGIN.top
    return y
  }

  /** Start a new page if `height` would not fit under the bottom margin. */
  const ensure = (height: number): void => {
    if (y + height > bottomLimit) newPage()
  }

  const setType = (size: number, style: 'normal' | 'bold' | 'italic', colour: string) => {
    doc.setFont(CHARIS_FAMILY, style)
    doc.setFontSize(size)
    doc.setTextColor(colour)
  }

  /**
   * Draw wrapped lines one at a time, breaking the page between lines rather than before the block.
   * A paragraph that does not fit is split; a paragraph is not moved wholesale to the next page,
   * because that leaves a hole a reader reads as the end of a section.
   */
  const flow = (text: string, size: number, lineHeight: number,
                style: 'normal' | 'bold' | 'italic', colour: string): number => {
    setType(size, style, colour)
    const lines = doc.splitTextToSize(text, contentWidth) as string[]
    for (const line of lines) {
      ensure(lineHeight)
      // ⚠️ setType again after a page break: addPage does not carry font state in every jsPDF
      // version, and a paragraph that changed weight mid-break would be a silent regression.
      setType(size, style, colour)
      doc.text(line, MARGIN.left, y + size)
      y += lineHeight
    }
    return y
  }

  const heading = (text: string, level: HeadingLevel): number => {
    const h = HEADING[level]
    const lines = (() => {
      setType(h.size, h.style, INK)
      return doc.splitTextToSize(text, contentWidth) as string[]
    })()
    const blockHeight = h.above + lines.length * h.size * 1.3 + h.below
    // A heading alone at the foot of a page is an orphan by definition — move the whole thing.
    ensure(blockHeight)
    y += h.above
    setType(h.size, h.style, INK)
    for (const line of lines) {
      doc.text(line, MARGIN.left, y + h.size)
      y += h.size * 1.3
    }
    y += h.below
    return y
  }

  const body = (text: string): number => flow(text, BODY_SIZE, BODY_LINE, 'normal', INK)

  const lead = (text: string): number => {
    y += 4
    const out = flow(text, LEAD_SIZE, LEAD_LINE, 'normal', SECONDARY)
    y += 6
    return out
  }

  /**
   * The brand gradient, as a HAIRLINE.
   *
   * ⚠️ NEVER AS A FIELD OR A BACKGROUND, AND THE REASON IS THE OUTPUT DEVICE. Office laser printers
   * dither large areas of continuous tone; a gradient panel that looks smooth on screen prints as
   * visible banding, and the purple-to-blue half muddies to grey. Kept to a 2pt band of stepped
   * rectangles it reads as a coloured rule, which is what it is for.
   *
   * The rectangles overlap by half a point so no hairline gaps open between them at print
   * resolution.
   */
  const rule = (): number => {
    const height = Math.min(RULE_HEIGHT, 3)
    ensure(height + 14)
    y += 6
    const steps = 120
    const segment = contentWidth / steps
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const [r, g, b] = t < 0.5
        ? mix(GRADIENT_STOPS[0], GRADIENT_STOPS[1], t * 2)
        : mix(GRADIENT_STOPS[1], GRADIENT_STOPS[2], (t - 0.5) * 2)
      doc.setFillColor(r, g, b)
      doc.rect(MARGIN.left + i * segment, y, segment + 0.5, height, 'F')
    }
    y += height + 8
    return y
  }

  const spacer = (pt: number): number => {
    y += pt
    return y
  }

  /**
   * Run `fn` without letting it straddle a page break, when it would not fit in what is left.
   *
   * `estimatedHeight` is the caller's estimate and is used ONLY to decide whether to break first.
   * It is never used to position anything, so an estimate that is somewhat wrong costs a page
   * break in the wrong place and never overlapping text.
   */
  const keepTogether = (estimatedHeight: number, fn: () => void): number => {
    ensure(estimatedHeight)
    fn()
    return y
  }

  /**
   * The footer for ONE page, drawn at the current page. Call it per page after the content is
   * laid out — the total is not knowable until then:
   *
   *   const total = doc.getNumberOfPages()
   *   for (let p = 1; p <= total; p++) { doc.setPage(p); layout.footer(p, total) }
   *
   * ⚠️ The cover is page 1 and normally takes no footer; start the loop at 2.
   */
  const footer = (pageNumber: number, total: number): void => {
    setType(FOOTER_SIZE, 'normal', MUTED)
    const baseline = pageHeight - MARGIN.bottom + FOOTER_BASELINE_UP
    doc.text('ThemisIQ', MARGIN.left, baseline)
    const right = `${pageNumber} of ${total}`
    doc.text(right, pageWidth - MARGIN.right - doc.getTextWidth(right), baseline)
  }

  /**
   * The cover: wordmark, who this is for, what it covers, and the rule. Nothing else — the content
   * starts on page two, and a cover that carries a summary invites being read instead of the paper.
   */
  const coverPage = (fields: CoverFields): number => {
    doc.setFillColor(PAPER)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')

    // ⚠️ ONE dimension set, the other derived — never a stretched mark. See lib/pdf/logo.ts.
    const logoWidth = 148
    doc.addImage(THEMISIQ_WORDMARK_DATA_URI, 'PNG',
                 MARGIN.left, MARGIN.top, logoWidth, logoWidth / WORDMARK_ASPECT)

    y = MARGIN.top + logoWidth / WORDMARK_ASPECT + 96

    if (fields.company) {
      setType(28, 'normal', INK)
      for (const line of doc.splitTextToSize(fields.company, contentWidth) as string[]) {
        doc.text(line, MARGIN.left, y)
        y += 34
      }
      y += 6
    }

    if (fields.assessmentName) {
      setType(13, 'normal', SECONDARY)
      doc.text(fields.assessmentName, MARGIN.left, y)
      y += 22
    }

    rule()
    y += 10

    // ⚠️ A null standard version is STATED, never omitted and never defaulted. Article 2(2) of Del.
    // Reg. C(2026) 5010 requires the undertaking to state which version it applied; a cover that
    // silently drops the line reads as though the question was never asked.
    const rows: [string, string][] = [
      ['Reporting period', fields.period ?? 'Not stated'],
      ['ESRS version', fields.standardVersionLabel ?? 'Not stated'],
      ['Stakeholder survey', fields.roundName ?? 'None linked'],
      ['Survey closed', fields.closedOn ?? '—'],
    ]

    for (const [label, value] of rows) {
      setType(8.5, 'normal', MUTED)
      doc.text(label.toUpperCase(), MARGIN.left, y)
      y += 13
      setType(11, 'normal', INK)
      for (const line of doc.splitTextToSize(value, contentWidth) as string[]) {
        doc.text(line, MARGIN.left, y)
        y += 15
      }
      y += 9
    }

    newPage()
    return y
  }

  return {
    doc,
    y: () => y,
    page: () => page,
    contentWidth,
    pageWidth,
    pageHeight,
    heading,
    body,
    lead,
    rule,
    spacer,
    keepTogether,
    footer,
    newPage,
    coverPage,
  }
}
