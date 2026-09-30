/**
 * The Deals diligence report as a generated PDF, drawn from the same model the screen renders.
 *
 * ⚠️ ACCESS IS DECIDED BEFORE THIS FILE IS REACHED, NEVER IN IT. This function draws whatever model
 * it is handed. Its one caller, DealReport in app/dashboard/deals/report/page.tsx, mounts only after
 * resolveReportGate (lib/deals/gates.ts) has returned 'open' for that deal. ANY FUTURE CALLER, such as
 * a download button in the wizard or on the targets list, must apply resolveReportGate, or the
 * wizard's free-deal identity check, FIRST. Calling this from anywhere else hands out the report of
 * a deal the free tier does not cover, and nothing here would notice.
 *
 * ⚠️ IT RENDERS; IT DOES NOT DECIDE. Every figure, sentence, heading, column and chip label comes
 * from buildDealReportModel (lib/deals/reportModel.ts). No engine import belongs here: a value
 * computed in this file is one the screen cannot show, and the two documents would disagree.
 *
 * ⚠️ IT RETURNS THE DOCUMENT; IT DOES NOT SAVE IT. Same division as generateBoardReportPDF: the caller
 * names the file and saves, and tests can inspect the document without a download.
 *
 * LETTER, NOT A4. The readers are deal teams and investment committees, chiefly North American, the
 * same reason the GHG assurance pack is Letter. lib/pdf/layout.ts is A4 by default for the European
 * board paper; this passes 'letter'.
 *
 * NOTHING ON A DARK FIELD, per lib/pdf/layout.ts: the cover is paper-coloured, the brand appears as
 * a 2pt bar, and every colour set as text comes from lib/pdf/palette.ts, which lib/pdf/palette.test.ts
 * holds to AA on the surface it is drawn on.
 *
 * TYPED TEXT AND THE FONT. Charis is embedded as a subset, and a character outside it prints as
 * NOTHING (lib/fonts/charis.ts). The model's own prose is tested to stay inside the subset; what a
 * user typed, such as a target name, cannot be. So every string drawn passes through fallbackText:
 * a character the font cannot draw loses its accent if that makes it drawable, and becomes "?" if
 * not. Nothing is dropped, and where anything was replaced the cover says so.
 */

import type jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createLayout, MARGIN, type Layout } from '../pdf/layout'
import { CHARIS_FAMILY } from '../fonts/charis'
import { charisCanDraw, fallbackText } from '../pdf/drawable'
import { THEMISIQ_WORDMARK_DATA_URI, WORDMARK_ASPECT } from '../pdf/logo'
import { BRAND } from '../brand'
import {
  PAPER, INK, SECONDARY, MUTED, TABLE_INK, HAIRLINE,
  WARN, WARN_WASH, OK, OK_WASH, ERROR, ERROR_WASH,
} from '../pdf/palette'
import {
  CHIP_LABELS, guidanceParagraph,
  type DealReportModel, type Rich, type ReportPanel, type StatusChip, type SeverityChip,
} from './reportModel'
import type { ClaimsLine } from './claimsRules'

// ── typed text the font cannot draw ──────────────────────────────────────────────────────────────

type FaceStyle = 'normal' | 'bold' | 'italic'

// charisCanDraw and fallbackText moved to lib/pdf/drawable.ts (30 Sep 2026), shared with the S-211
// report. Re-exported so this module's callers and tests are unchanged.
export { charisCanDraw, fallbackText }

/** Every string in the model, for the one pass that decides whether the cover owes a note. */
const stringsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v]
    : Array.isArray(v) ? v.flatMap(stringsOf)
    : v && typeof v === 'object' ? Object.values(v).flatMap(stringsOf)
    : []

/** Printed on the cover only when fallbackText changed something. */
export const SUBSTITUTION_NOTE =
  'Some characters entered for this deal are outside this document’s typeface. They are shown without their accents, or as "?" where no plain form exists.'

// ── type and measure ─────────────────────────────────────────────────────────────────────────────

const BODY = 9.5
const NOTE = 8.5
const CELL = 8.5
const LEADING = 1.45
/** jspdf-autotable's own line height factor (jsPDF's default), so pre-wrapped cells measure alike. */
const CELL_LEADING = 1.15
const CELL_PAD = 5
const PANEL_PAD = 9
const SECTION_GAP = 14
/** A heading must have at least this much room beneath it on its page, or it moves with its content. */
const HEADING_ROOM = 64
const HEADING_H = 20 + 15 * 1.3 + 9   // layout.ts HEADING[2]: above + one line + below

/** A run of text in one weight, as laid out on a line. */
type Tok = { text: string; bold: boolean }

type ChipStyle = { label: string; text: string; fill: string | null }
const CHIP: Record<StatusChip | SeverityChip, ChipStyle> = {
  applies: { label: CHIP_LABELS.applies, text: OK, fill: OK_WASH },
  verify: { label: CHIP_LABELS.verify, text: WARN, fill: WARN_WASH },
  nearBelow: { label: CHIP_LABELS.nearBelow, text: WARN, fill: WARN_WASH },
  // Outlined and neutral: an expectation, not a finding about the law.
  market: { label: CHIP_LABELS.market, text: SECONDARY, fill: null },
  critical: { label: CHIP_LABELS.critical, text: ERROR, fill: ERROR_WASH },
  high: { label: CHIP_LABELS.high, text: WARN, fill: WARN_WASH },
  // No wash of its own in the print palette: outlined, and the word carries it.
  medium: { label: CHIP_LABELS.medium, text: SECONDARY, fill: null },
}

/** One paragraph inside a table cell: its runs, the face it is set in, and its colour. */
type CellPara = { parts: Rich; style?: FaceStyle; colour?: string }
/** A table cell: paragraphs stacked, or a single chip. */
type Cell = { paras: CellPara[] } | { chip: StatusChip | SeverityChip }
/** A column: its header, and a fixed width, or none for the one column that takes what is left. */
type Col = { header: string; width?: number }

const plain = (text: string, style?: FaceStyle, colour?: string): CellPara => ({ parts: [text], style, colour })

// ── the document ─────────────────────────────────────────────────────────────────────────────────

export function generateDealReportPDF(m: DealReportModel): jsPDF {
  const l: Layout = createLayout({ format: 'letter' })
  const { doc, contentWidth, pageWidth, pageHeight } = l
  const left = MARGIN.left
  const canDraw = charisCanDraw(doc)
  const safe = (s: string) => fallbackText(s, canDraw)
  const substituted = stringsOf(m).some(s => safe(s) !== s)

  const setType = (size: number, style: FaceStyle, colour: string) => {
    doc.setFont(CHARIS_FAMILY, style)
    doc.setFontSize(size)
    doc.setTextColor(colour)
  }
  const width = (text: string, size: number, style: FaceStyle) => {
    doc.setFont(CHARIS_FAMILY, style)
    doc.setFontSize(size)
    return doc.getTextWidth(text)
  }

  /**
   * Wrap runs of mixed weight to `max` points. Words move whole; a single word wider than the line
   * (a URL) is split by character rather than allowed to run off the page.
   */
  const wrap = (parts: Rich, max: number, size: number, base: FaceStyle): Tok[][] => {
    const lines: Tok[][] = [[]]
    let used = 0
    const newLine = () => {
      const cur = lines[lines.length - 1]
      while (cur.length && cur[cur.length - 1].text === ' ') cur.pop()
      lines.push([])
      used = 0
    }
    for (const part of parts) {
      const bold = typeof part !== 'string'
      const face: FaceStyle = bold ? 'bold' : base
      for (const piece of safe(typeof part === 'string' ? part : part.strong).split(/(\s+)/)) {
        if (!piece) continue
        if (/^\s+$/.test(piece)) {
          if (piece.includes('\n')) { newLine(); continue }
          if (lines[lines.length - 1].length === 0) continue
          lines[lines.length - 1].push({ text: ' ', bold })
          used += width(' ', size, face)
          continue
        }
        let rest = piece
        while (rest) {
          const w = width(rest, size, face)
          if (used + w <= max) { lines[lines.length - 1].push({ text: rest, bold }); used += w; break }
          if (lines[lines.length - 1].length && w <= max) { newLine(); continue }
          // Wider than a whole line: take as many characters as fit.
          let n = rest.length
          while (n > 1 && used + width(rest.slice(0, n), size, face) > max) n--
          lines[lines.length - 1].push({ text: rest.slice(0, n), bold })
          rest = rest.slice(n)
          newLine()
        }
      }
    }
    const last = lines[lines.length - 1]
    while (last.length && last[last.length - 1].text === ' ') last.pop()
    return lines.filter((line, i) => line.length || i === 0)
  }

  /**
   * Draw one wrapped line with its top at `top`. Adjacent tokens of one weight are drawn as a single
   * string, so a line of plain prose is one text run: it copies out of the PDF as a sentence rather
   * than as words.
   */
  const drawLine = (line: Tok[], x: number, top: number, size: number, base: FaceStyle, colour: string) => {
    const runs: Tok[] = []
    for (const t of line) {
      const last = runs[runs.length - 1]
      if (last && last.bold === t.bold) last.text += t.text
      else runs.push({ ...t })
    }
    for (const t of runs) {
      const face: FaceStyle = t.bold ? 'bold' : base
      setType(size, face, colour)
      doc.text(t.text, x, top, { baseline: 'top' })
      x += doc.getTextWidth(t.text)
    }
  }

  const room = (h: number) => l.keepTogether(h, () => {})

  /** A paragraph in the flow, split between lines at a page break, never moved whole. */
  const para = (parts: Rich, o: { size?: number; colour?: string; style?: FaceStyle; after?: number } = {}) => {
    const size = o.size ?? BODY
    const lh = size * LEADING
    for (const line of wrap(parts, contentWidth, size, o.style ?? 'normal')) {
      room(lh)
      drawLine(line, left, l.y(), size, o.style ?? 'normal', o.colour ?? INK)
      l.moveTo(l.y() + lh)
    }
    l.spacer(o.after ?? 6)
  }

  /** A section heading, moved to the next page with its content rather than left at the foot. */
  const heading = (title: string) => {
    room(HEADING_H + HEADING_ROOM)
    l.heading(safe(title), 2)
  }

  /** An amber panel, whole on one page. */
  const panel = (p: ReportPanel) => {
    const inner = contentWidth - 2 * PANEL_PAD
    const titleLines = wrap([{ strong: p.title }], inner, 8, 'normal')
    const bodyLines = p.body.length ? wrap(p.body, inner, NOTE, 'normal') : []
    const titleLh = 8 * 1.35
    const bodyLh = NOTE * LEADING
    const h = PANEL_PAD + titleLines.length * titleLh + (bodyLines.length ? 3 + bodyLines.length * bodyLh : 0) + PANEL_PAD
    room(h + 8)
    const top = l.y()
    doc.setFillColor(WARN_WASH)
    doc.roundedRect(left, top, contentWidth, h, 4, 4, 'F')
    let y = top + PANEL_PAD
    for (const line of titleLines) { drawLine(line, left + PANEL_PAD, y, 8, 'normal', WARN); y += titleLh }
    if (bodyLines.length) y += 3
    for (const line of bodyLines) { drawLine(line, left + PANEL_PAD, y, NOTE, 'normal', TABLE_INK); y += bodyLh }
    l.moveTo(top + h + 8)
  }

  /** A chip: its label on its wash, or outlined where it has none. Returns nothing; draws at (x, top). */
  const chip = (key: StatusChip | SeverityChip, x: number, top: number) => {
    const c = CHIP[key]
    const label = safe(c.label)
    const w = width(label, 6.5, 'bold') + 8
    const h = 10
    if (c.fill) { doc.setFillColor(c.fill); doc.roundedRect(x, top, w, h, 3, 3, 'F') }
    else { doc.setDrawColor(HAIRLINE); doc.setLineWidth(0.6); doc.roundedRect(x, top, w, h, 3, 3, 'S') }
    setType(6.5, 'bold', c.text)
    doc.text(label, x + 4, top + 2.2, { baseline: 'top' })
  }

  /**
   * A table through jspdf-autotable, set in Charis. Each cell is wrapped here, in the face it will be
   * drawn in, and handed to autotable as pre-broken lines so it measures the row; autotable's own text
   * is then blanked and the lines drawn here, so one cell can carry a bold name, an italic citation
   * and an amber caveat. Rows never split across a page; the header repeats on every page.
   */
  const table = (cols: Col[], rows: Cell[][], o: { head?: boolean } = {}) => {
    const fixed = cols.reduce((s, c) => s + (c.width ?? 0), 0)
    const widths = cols.map(c => c.width ?? contentWidth - fixed)
    type Line = { toks: Tok[]; style: FaceStyle; colour: string } | { chip: StatusChip | SeverityChip }
    const laid: Line[][][] = rows.map(row => row.map((cell, i) => {
      if ('chip' in cell) return [{ chip: cell.chip }]
      const inner = widths[i] - 2 * CELL_PAD - 1
      return cell.paras.flatMap(p =>
        wrap(p.parts, inner, CELL, p.style ?? 'normal').map(toks => ({ toks, style: p.style ?? 'normal', colour: p.colour ?? TABLE_INK })))
    }))
    const lineText = (ln: Line) => ('chip' in ln ? safe(CHIP[ln.chip].label) : ln.toks.map(t => t.text).join(''))
    const lh = CELL * CELL_LEADING

    // Keep the heading's promise: a table starts with its header and at least its first row.
    const firstRow = laid[0] ? Math.max(...laid[0].map(c => c.length)) * lh + 2 * CELL_PAD : 0
    room((o.head === false ? 0 : 22) + firstRow)

    autoTable(doc, {
      startY: l.y(),
      margin: { top: MARGIN.top, bottom: MARGIN.bottom, left: MARGIN.left, right: MARGIN.right },
      tableWidth: contentWidth,
      theme: 'plain',
      head: o.head === false ? undefined : [cols.map(c => safe(c.header))],
      body: laid.map(row => row.map(cell => cell.map(lineText).join('\n'))),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: {
        font: CHARIS_FAMILY, fontStyle: 'normal', fontSize: CELL, textColor: TABLE_INK,
        // 'visible': the body lines arrive already broken, in the face each is drawn in. Letting
        // autotable break them again, in regular, over-measured italic and bold lines and left rows
        // taller than their text.
        cellPadding: CELL_PAD, overflow: 'visible', valign: 'top',
        lineColor: HAIRLINE, lineWidth: { bottom: 0.5 },
      },
      headStyles: { font: CHARIS_FAMILY, fontStyle: 'bold', textColor: SECONDARY, fillColor: PAPER, overflow: 'linebreak', lineWidth: { bottom: 0.75 } },
      columnStyles: Object.fromEntries(widths.map((w, i) => [i, { cellWidth: w }])),
      willDrawCell: d => { if (d.section === 'body') d.cell.text = [] },
      didDrawCell: d => {
        if (d.section !== 'body') return
        let y = d.cell.y + CELL_PAD
        for (const ln of laid[d.row.index]?.[d.column.index] ?? []) {
          if ('chip' in ln) chip(ln.chip, d.cell.x + CELL_PAD, y)
          else drawLine(ln.toks, d.cell.x + CELL_PAD, y, CELL, ln.style, ln.colour)
          y += lh
        }
      },
    })
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    l.moveTo(finalY + 10)
  }

  /**
   * The environmental-claims finding. Its header (severity chip, title, status chip) stays with the
   * first market's block, and each market's block is kept whole, so the finding may break BETWEEN
   * markets but never inside one. Source URLs print as plain text: a PDF is read on paper as often
   * as on screen, and a printed link must still say where it goes.
   */
  const claimsFinding = (cf: NonNullable<DealReportModel['risks']['claims']>) => {
    const lh = NOTE * LEADING
    const blockOf = (ln: ClaimsLine): Rich[] => [
      [{ strong: `${ln.market}: ${ln.law}` }],
      ...(ln.regulator ? [[`Regulator: ${ln.regulator}`]] : []),
      ...(ln.status ? [[`Status: ${ln.status}`]] : []),
      ...(ln.scope ? [[`Scope: ${ln.scope}`]] : []),
      [`Maximum penalty: ${ln.maxPenalty}`],
      [`Source: ${ln.source} (verified ${ln.lastVerified})`],
    ]
    const height = (paras: Rich[]) => paras.reduce((h, p) => h + wrap(p, contentWidth, NOTE, 'normal').length * lh + 1, 0) + 8
    const blocks = cf.lines.map(blockOf)
    const headH = 18 + (cf.notConfirmed ? height([[cf.notConfirmed]]) : 0)
    room(headH + (blocks[0] ? height(blocks[0]) : 0))
    let x = left
    const top = l.y()
    chip(cf.severity, x, top)
    x += width(safe(CHIP[cf.severity].label), 6.5, 'bold') + 14
    setType(9.5, 'bold', INK)
    doc.text(safe(cf.title), x, top, { baseline: 'top' })
    x += doc.getTextWidth(safe(cf.title)) + 8
    chip(cf.chip, x, top)
    l.moveTo(top + 18)
    if (cf.notConfirmed) para([cf.notConfirmed], { size: NOTE, colour: WARN, after: 4 })
    blocks.forEach((b, i) => {
      if (i > 0) room(height(b))
      b.forEach((p, j) => para(p, { size: NOTE, colour: j === 0 ? INK : SECONDARY, after: 1 }))
      l.spacer(7)
    })
    if (cf.fallback) para([cf.fallback], { size: NOTE, colour: SECONDARY })
  }

  // ── 1. cover ───────────────────────────────────────────────────────────────────────────────────
  doc.setFillColor(PAPER)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')
  const logoWidth = 132
  const logoHeight = logoWidth / WORDMARK_ASPECT
  doc.addImage(THEMISIQ_WORDMARK_DATA_URI, 'PNG', left, MARGIN.top, logoWidth, logoHeight)
  // The brand as a 2pt bar, never a field: see rule() in lib/pdf/layout.ts.
  doc.setFillColor(BRAND)
  doc.rect(left, MARGIN.top + logoHeight + 18, contentWidth, 2, 'F')
  l.moveTo(MARGIN.top + logoHeight + 64)

  para([m.cover.eyebrow.toUpperCase()], { size: 8.5, style: 'bold', colour: MUTED, after: 10 })
  para([m.cover.title], { size: 24, colour: INK, after: 10 })
  para([m.cover.intro], { size: 11, colour: SECONDARY, after: 22 })

  doc.setDrawColor(HAIRLINE); doc.setLineWidth(0.75)
  doc.line(left, l.y(), left + contentWidth, l.y())
  l.spacer(12)
  const labelWidth = 150
  for (const [k, v] of m.cover.rows) {
    const lines = wrap([v], contentWidth - labelWidth, 10, 'normal')
    const rowH = lines.length * 10 * LEADING + 4
    room(rowH)
    const top = l.y()
    setType(8.5, 'normal', MUTED)
    doc.text(safe(k), left, top + 1.5, { baseline: 'top' })
    lines.forEach((line, i) => drawLine(line, left + labelWidth, top + i * 10 * LEADING, 10, 'normal', INK))
    l.moveTo(top + rowH)
  }
  l.spacer(8)
  doc.setDrawColor(HAIRLINE); doc.setLineWidth(0.75)
  doc.line(left, l.y(), left + contentWidth, l.y())
  l.spacer(14)
  para(m.cover.derivedNote, { size: NOTE, colour: SECONDARY, after: 8 })
  if (substituted) para([SUBSTITUTION_NOTE], { size: NOTE, colour: MUTED })
  l.newPage()

  // ── 2. applicable frameworks ───────────────────────────────────────────────────────────────────
  const a = m.applicable
  heading(a.title)
  if (a.s211Panel) panel(a.s211Panel)
  if (a.kind === 'not-evaluated') panel(a.notEvaluatedPanel)
  else if (a.kind === 'none') para([a.noneSentence])
  else {
    para([a.intro], { size: NOTE, colour: SECONDARY })
    table(
      [{ header: a.columns[0] }, { header: a.columns[1], width: 130 }],
      a.rows.map(r => [
        { paras: [
          plain(r.framework, 'bold', INK),
          ...(r.citation ? [plain(r.citation, 'italic', SECONDARY)] : []),
          ...(r.basis ? [plain(r.basis, 'normal', SECONDARY)] : []),
          ...(r.near ? [plain(r.near, 'normal', WARN)] : []),
          ...(r.verify ? [plain(r.verify, 'normal', WARN)] : []),
          // The guidance the note rests on: its own paragraph, cited, in the ordinary secondary colour.
          ...(r.guidance ? [plain(guidanceParagraph(r.guidance), 'normal', SECONDARY)] : []),
        ] },
        { chip: r.chip },
      ]),
    )
    if (a.partialPanel) panel(a.partialPanel)
  }
  l.spacer(SECTION_GAP)

  // ── 2b. investor and market expectations ───────────────────────────────────────────────────────
  // Its own section, never mixed into the one above: a market row applies to nobody by law.
  const mk = m.market
  if (mk.rows.length) {
    heading(mk.title)
    para([mk.intro], { size: NOTE, colour: SECONDARY })
    table(
      [{ header: a.columns[0] }, { header: a.columns[1], width: 130 }],
      mk.rows.map(r => [
        { paras: [plain(r.framework, 'bold', INK), ...(r.note ? [plain(r.note, 'italic', SECONDARY)] : [])] },
        { chip: r.chip },
      ]),
    )
    l.spacer(SECTION_GAP)
  }

  // ── 3. near-threshold frameworks ───────────────────────────────────────────────────────────────
  const n = m.nearThreshold
  heading(n.title)
  para(n.intro, { size: NOTE, colour: SECONDARY })
  if (n.kind === 'not-assessed') panel(n.notAssessedPanel)
  else if (n.kind === 'none') para([n.noneSentence])
  else {
    table(
      [{ header: n.columns[0], width: 110 }, { header: n.columns[1], width: 50 }, { header: n.columns[2] },
       { header: n.columns[3], width: 95 }, { header: n.columns[4], width: 95 }, { header: n.columns[5], width: 42 }],
      n.rows.map(r => [
        { paras: [plain(r.framework, 'bold', INK), plain(CHIP_LABELS[r.chip], 'bold', WARN)] },
        { paras: [plain(r.testsMet)] },
        { paras: [plain(r.decidingFigure)] },
        { paras: [plain(r.valueApplied)] },
        { paras: [plain(r.threshold)] },
        { paras: [plain(r.side)] },
      ]),
    )
  }
  for (const b of n.belowNotes) para([{ strong: `${b.framework}:` }, ` ${b.sentence}`], { size: NOTE, colour: WARN })
  l.spacer(SECTION_GAP)

  // ── 4. size tests applied ──────────────────────────────────────────────────────────────────────
  const s = m.sizeTests
  heading(s.title)
  if (s.kind === 'none') para([s.noneSentence])
  else {
    para(s.intro, { size: NOTE, colour: SECONDARY })
    table(
      [{ header: s.columns[0], width: 62 }, { header: s.columns[1], width: 62 }, { header: s.columns[2] },
       { header: s.columns[3], width: 88 }, { header: s.columns[4], width: 80 }, { header: s.columns[5], width: 66 }],
      s.rows.map(r => [
        { paras: [plain(r.framework)] },
        { paras: [plain(r.measure)] },
        { paras: [plain(r.basis), plain(r.basisOfValue, 'italic', SECONDARY)] },
        { paras: [plain(r.valueApplied)] },
        { paras: [plain(r.threshold)] },
        { paras: [plain(r.result, 'bold', r.state === 'met' ? OK : r.state === 'not-assessed' ? WARN : SECONDARY)] },
      ]),
    )
    for (const p of s.panels) panel(p)
  }
  if (s.marketsNote) para([s.marketsNote], { size: NOTE, colour: SECONDARY })
  l.spacer(SECTION_GAP)

  // ── 5. ESG risk findings ───────────────────────────────────────────────────────────────────────
  const r5 = m.risks
  heading(r5.title)
  if (r5.kind === 'none') para([r5.noneSentence])
  else {
    para([r5.intro], { size: NOTE, colour: SECONDARY })
    if (r5.unresolvedPanel) panel(r5.unresolvedPanel)
    table(
      [{ header: r5.columns[0], width: 72 }, { header: r5.columns[1] }, { header: r5.columns[2], width: 120 }],
      r5.rows.map(r => [
        { chip: r.severity },
        { paras: [
          plain(r.risk, 'bold', INK),
          plain(r.detail, 'normal', SECONDARY),
          ...(r.condition !== null ? [plain(r.condition, 'normal', WARN)] : []),
          ...(r.cs3dLine ? [{ parts: r.cs3dLine, colour: WARN }] : []),
        ] },
        { paras: [plain(r.framework)] },
      ]),
    )
  }
  if (r5.claims) claimsFinding(r5.claims)
  if (r5.claimsNote) para([r5.claimsNote], { size: NOTE, colour: SECONDARY })
  l.spacer(SECTION_GAP)

  // ── 6. compliance cost estimate ────────────────────────────────────────────────────────────────
  const c = m.cost
  heading(c.title)
  para([c.intro], { size: NOTE, colour: SECONDARY })
  {
    // Two cards side by side, consultant first and larger, as on screen. Whole on one page, and both
    // drawn at the taller card's height so the pair reads as one row.
    type CardSpec = { x: number; w: number; d: typeof c.consultant; size: number; colour: string; border: string }
    const gap = 10
    const w1 = Math.round((contentWidth - gap) * 0.6)
    const cards: CardSpec[] = [
      { x: left, w: w1, d: c.consultant, size: 18, colour: INK, border: INK },
      { x: left + w1 + gap, w: contentWidth - gap - w1, d: c.themisIq, size: 13, colour: SECONDARY, border: HAIRLINE },
    ]
    const layoutCard = (k: CardSpec) => {
      const inner = k.w - 24
      const fig = wrap([k.d.figure], inner, k.size, 'normal')
      const note = wrap([k.d.note], inner, 8, 'normal')
      return { fig, note, h: 12 + 8 * 1.4 + 4 + fig.length * k.size * 1.2 + 4 + note.length * 8 * 1.4 + 12 }
    }
    const laidCards = cards.map(layoutCard)
    const h = Math.max(...laidCards.map(k => k.h))
    room(h + 10)
    const top = l.y()
    cards.forEach((k, i) => {
      doc.setDrawColor(k.border); doc.setLineWidth(0.75)
      doc.roundedRect(k.x, top, k.w, h, 5, 5, 'S')
      let y = top + 12
      setType(8, 'normal', MUTED); doc.text(safe(k.d.label), k.x + 12, y, { baseline: 'top' }); y += 8 * 1.4 + 4
      for (const line of laidCards[i].fig) { drawLine(line, k.x + 12, y, k.size, 'normal', k.colour); y += k.size * 1.2 }
      y += 4
      for (const line of laidCards[i].note) { drawLine(line, k.x + 12, y, 8, 'normal', SECONDARY); y += 8 * 1.4 }
    })
    l.moveTo(top + h + 10)
  }
  para(c.disclosure, { size: 8, colour: MUTED, after: 8 })
  const obligationCols = (cols: [string, string, string]): Col[] =>
    [{ header: cols[0] }, { header: cols[1], width: 150 }, { header: cols[2], width: 110 }]
  // Nothing included: the introduction and both cards already say so; no empty table beneath them.
  if (c.included.rows.length) {
    table(obligationCols(c.included.columns), c.included.rows.map(o => [
      { paras: [plain(o.label, 'bold', INK), ...(o.scopeNote ? [plain(o.scopeNote, 'italic', SECONDARY)] : [])] },
      { paras: [plain(o.themisIq)] },
      { paras: [plain(o.consultant)] },
    ]))
  }
  table(obligationCols(c.recommended.columns), c.recommended.rows.map(o => [
    { paras: [plain(o.label), ...(o.scopeNote ? [plain(o.scopeNote, 'italic', SECONDARY)] : [])] },
    { paras: [plain(o.themisIq)] },
    { paras: [plain(o.consultant)] },
  ]))
  if (c.flagged.rows.length) {
    table(obligationCols(c.flagged.columns), c.flagged.rows.map(o => [
      { paras: [plain(o.label, 'bold', INK), ...(o.scopeNote ? [plain(o.scopeNote, 'italic', SECONDARY)] : [])] },
      { paras: [plain(o.themisIq)] },
      { paras: [plain(o.consultant)] },
    ]))
  }
  para([c.scopeNote], { size: NOTE, colour: SECONDARY })
  if (c.exposure) para(c.exposure, { size: NOTE, colour: SECONDARY })
  l.spacer(SECTION_GAP)

  // ── 7. data-room gaps ──────────────────────────────────────────────────────────────────────────
  const d7 = m.dataRoom
  heading(d7.title)
  table(
    [{ header: d7.columns[0] }, { header: d7.columns[1], width: 220 }],
    d7.rows.map(r => [{ paras: [plain(r.item)] }, { paras: [plain(r.status, 'bold', r.available ? OK : ERROR)] }]),
  )
  l.spacer(SECTION_GAP)

  // ── 8. FX basis ────────────────────────────────────────────────────────────────────────────────
  const f = m.fx
  heading(f.title)
  for (const p of f.paras) para(p, { size: NOTE, colour: SECONDARY })
  table(
    [{ header: '', width: 150 }, { header: '' }],
    f.rows.map(([k, v]) => [{ paras: [plain(k, 'normal', MUTED)] }, { paras: [plain(v)] }]),
    { head: false },
  )
  if (f.sameCurrencyNote) para([f.sameCurrencyNote], { size: NOTE, colour: SECONDARY })
  l.spacer(SECTION_GAP)

  // ── 9. important notice ────────────────────────────────────────────────────────────────────────
  heading(m.notice.title)
  // THE CLOSING NOTE STAYS WITH THE NOTICE. para() checks room one line at a time, so when the
  // notice ended near the foot of a page the note alone went over, and the document's last page was
  // one sentence. So the last notice paragraph and the note reserve their combined height first:
  // if they do not both fit, they move together and the notice's earlier paragraphs stay put.
  const noticeLh = 8 * LEADING
  const lastPara = m.notice.paras[m.notice.paras.length - 1]
  m.notice.paras.forEach((p, i) => {
    if (i === m.notice.paras.length - 1) {
      const lines = (s: string) => wrap([s], contentWidth, 8, 'normal').length
      room(lines(lastPara) * noticeLh + 6 + 10 + lines(m.footer.note) * noticeLh)
    }
    para([p], { size: 8, colour: MUTED })
  })
  l.spacer(10)
  para([m.footer.note], { size: 8, colour: MUTED })

  // ── footer, every page, cover included ─────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  const baseline = pageHeight - MARGIN.bottom + 22
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setDrawColor(HAIRLINE); doc.setLineWidth(0.5)
    doc.line(left, baseline - 12, left + contentWidth, baseline - 12)
    const right = `Page ${p} of ${total}`
    setType(7.5, 'normal', MUTED)
    const rightWidth = doc.getTextWidth(right)
    doc.text(right, left + contentWidth - rightWidth, baseline)
    const lines = doc.splitTextToSize(safe(m.footer.line), contentWidth - rightWidth - 16) as string[]
    lines.forEach((line, i) => doc.text(line, left, baseline + i * 9))
  }
  return doc
}
