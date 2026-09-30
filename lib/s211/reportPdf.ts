/**
 * The S-211 report as a PDF, drawn from buildS211ReportModel (lib/s211/reportModel.ts).
 *
 * ⚠️ IT RENDERS; IT DOES NOT DECIDE. Every heading, sentence and row comes from the model. Access and the
 * export gate are decided before this is reached: its one caller is the export route
 * (app/api/s211/reports/[id]/export/route.ts), which runs requireS211 and exportGate first.
 *
 * ⚠️ THE ENTITY'S DOCUMENT. No ThemisIQ wordmark, no cover field in brand colour, no notice of ours. The
 * one ThemisIQ line is the optional footer credit, which the model leaves null unless asked.
 *
 * LETTER, the size the entity files and prints in Canada, through the shared layout (lib/pdf/layout.ts)
 * in Charis. Typed text passes through fallbackText (lib/pdf/drawable.ts), so a character outside the
 * embedded subset prints without its accent, or as "?", and never as nothing. The characters replaced
 * are returned to the caller, which tells the user; nothing about it is printed in the report itself.
 */

import type jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { createLayout, MARGIN, type Layout } from '../pdf/layout'
import { CHARIS_FAMILY } from '../fonts/charis'
import { charisCanDraw, fallbackText } from '../pdf/drawable'
import { INK, SECONDARY, MUTED, TABLE_INK, HAIRLINE } from '../pdf/palette'
import type { Block, S211ReportModel, SignatureBlock } from './reportModel'

type FaceStyle = 'normal' | 'bold' | 'italic'

/** Layout's level-2 and level-3 heading heights (lib/pdf/layout.ts HEADING): above + one line + below. */
const H2 = 20 + 15 * 1.3 + 9
const H3 = 15 + 12 * 1.3 + 7
/** Room for three lines of body text: what a heading must have beneath it on its page. */
const FOLLOW = 3 * 10.5 * 1.65
const REF_LINE = 14
const CELL = 9.5
const CELL_PAD = 5
const HEADER_BASELINE = 34

const stringsOf = (v: unknown): string[] =>
  typeof v === 'string' ? [v]
    : Array.isArray(v) ? v.flatMap(stringsOf)
    : v && typeof v === 'object' ? Object.values(v).flatMap(stringsOf)
    : []

export type S211Pdf = { doc: jsPDF; substituted: string[] }

export function generateS211ReportPDF(m: S211ReportModel): S211Pdf {
  const l: Layout = createLayout({ format: 'letter' })
  const { doc, contentWidth, pageWidth, pageHeight } = l
  const left = MARGIN.left
  const canDraw = charisCanDraw(doc)
  const safe = (s: string) => fallbackText(s, canDraw)
  const substituted = [...new Set(stringsOf(m).flatMap(s => [...s].filter(ch => ch !== '\n' && !canDraw(ch.codePointAt(0)!))))]

  doc.setProperties({ title: safe(m.metadata.title), subject: safe(m.metadata.subject), author: safe(m.metadata.author) })
  doc.setLanguage(m.metadata.language)

  const setType = (size: number, style: FaceStyle, colour: string) => {
    doc.setFont(CHARIS_FAMILY, style)
    doc.setFontSize(size)
    doc.setTextColor(colour)
  }
  const room = (h: number) => l.keepTogether(h, () => {})

  /** Lines of `text` wrapped to `width` in the given face. */
  const lines = (text: string, size: number, style: FaceStyle, width = contentWidth) => {
    setType(size, style, INK)
    return doc.splitTextToSize(safe(text), width) as string[]
  }

  // ── cover ───────────────────────────────────────────────────────────────────────────────────────
  l.moveTo(MARGIN.top + 90)
  for (const line of lines(m.cover.title, 12, 'normal')) { setType(12, 'normal', SECONDARY); doc.text(line, left, l.y()); l.moveTo(l.y() + 17) }
  l.spacer(14)
  for (const line of lines(m.cover.legalName, 26, 'normal')) { setType(26, 'normal', INK); doc.text(line, left, l.y()); l.moveTo(l.y() + 32) }
  if (m.cover.revised) { setType(12, 'bold', INK); doc.text('Revised report', left, l.y() + 4); l.moveTo(l.y() + 22) }
  l.spacer(10)
  doc.setDrawColor(HAIRLINE); doc.setLineWidth(0.75)
  doc.line(left, l.y(), left + contentWidth, l.y())
  l.spacer(26)
  for (const [label, value] of m.cover.rows) {
    setType(8.5, 'normal', MUTED)
    doc.text(safe(label).toUpperCase(), left, l.y())
    l.spacer(14)
    for (const line of lines(value, 11.5, 'normal')) { setType(11.5, 'normal', INK); doc.text(line, left, l.y()); l.spacer(16) }
    l.spacer(10)
  }
  l.newPage()

  // ── blocks ──────────────────────────────────────────────────────────────────────────────────────
  const para = (text: string) => {
    l.body(safe(text))
    l.spacer(6)
  }

  const subheading = (text: string) => {
    room(H3 + FOLLOW)
    l.heading(safe(text), 3)
  }

  const cellStyles = {
    font: CHARIS_FAMILY, fontStyle: 'normal' as const, fontSize: CELL, textColor: TABLE_INK,
    // No left padding: cell text lines up with the body text at the margin.
    cellPadding: { top: CELL_PAD, bottom: CELL_PAD, left: 0, right: 10 }, overflow: 'linebreak' as const, valign: 'top' as const,
    lineColor: HAIRLINE, lineWidth: { top: 0, right: 0, left: 0, bottom: 0.5 },
  }
  const afterTable = () => l.moveTo((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12)

  const facts = (rows: [string, string][]) => {
    room(CELL * 1.15 + 2 * CELL_PAD + 4)
    autoTable(doc, {
      startY: l.y(),
      margin: { top: MARGIN.top, bottom: MARGIN.bottom, left: MARGIN.left, right: MARGIN.right },
      tableWidth: contentWidth,
      theme: 'plain',
      body: rows.map(([k, v]) => [safe(k), safe(v)]),
      rowPageBreak: 'avoid',
      styles: cellStyles,
      columnStyles: { 0: { cellWidth: 190, textColor: SECONDARY }, 1: { cellWidth: contentWidth - 190 } },
    })
    afterTable()
  }

  const table = (b: Extract<Block, { kind: 'table' }>) => {
    // The title and the header and first row stay together.
    room(H3 + 2 * (CELL * 1.15 + 2 * CELL_PAD) + 30)
    l.heading(safe(b.title), 3)
    autoTable(doc, {
      startY: l.y(),
      margin: { top: MARGIN.top, bottom: MARGIN.bottom, left: MARGIN.left, right: MARGIN.right },
      tableWidth: contentWidth,
      theme: 'plain',
      head: [b.columns.map(safe)],
      body: b.rows.map(r => r.map(safe)),
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: cellStyles,
      headStyles: { font: CHARIS_FAMILY, fontStyle: 'bold', textColor: SECONDARY, lineWidth: { top: 0, right: 0, left: 0, bottom: 0.75 } },
    })
    afterTable()
  }

  /**
   * The attestation and the signature blocks. The attestation and the FIRST block are kept on one page,
   * because the attestation is signed beneath it; every further block (one per entity under
   * 11(4)(b)(i)) is kept whole, and may start a new page.
   */
  const signature = (b: Extract<Block, { kind: 'signature' }>) => {
    const rowH = 40
    const several = b.signers.length > 1
    const blockH = (sb: SignatureBlock) =>
      (several ? 22 : 0) + sb.rows.length * rowH + lines(sb.statement, 10.5, 'normal').length * 17 + 10
    const bodyLines = b.attestation.reduce((n, p) => n + lines(p, 10.5, 'normal').length, 0)
    room(H3 + bodyLines * 10.5 * 1.65 + b.attestation.length * 6 + 16 + (b.signers[0] ? blockH(b.signers[0]) : 0))
    l.heading(safe(b.heading), 3)
    b.attestation.forEach(para)
    l.spacer(16)
    b.signers.forEach((sb, i) => {
      if (i > 0) { room(blockH(sb) + 18); l.spacer(18) }
      if (several) {
        setType(10.5, 'bold', INK)
        doc.text(safe(`For ${sb.entity}`), left, l.y() + 10.5)
        l.spacer(22)
      }
      for (const r of sb.rows) {
        const top = l.y()
        setType(8.5, 'normal', MUTED)
        doc.text(safe(r.label).toUpperCase(), left, top + 8.5)
        if (r.value) { setType(11.5, 'normal', INK); doc.text(safe(r.value), left + 90, top + 20) }
        doc.setDrawColor(INK); doc.setLineWidth(0.5)
        doc.line(left + 90, top + 26, left + contentWidth, top + 26)
        l.moveTo(top + rowH)
      }
      setType(10.5, 'normal', INK)
      for (const line of doc.splitTextToSize(safe(sb.statement), contentWidth) as string[]) { doc.text(line, left, l.y() + 10.5); l.spacer(17) }
    })
  }

  const block = (b: Block) => {
    switch (b.kind) {
      case 'para': return para(b.text)
      case 'subheading': return subheading(b.text)
      case 'facts': return facts(b.rows)
      case 'table': return table(b)
      case 'signature': return signature(b)
    }
  }

  // ── parts ───────────────────────────────────────────────────────────────────────────────────────
  m.parts.forEach((part, i) => {
    // The heading, its reference line and the start of its content, together.
    room(H2 + REF_LINE + FOLLOW)
    if (i > 0) l.spacer(6)
    l.heading(safe(part.title), 2)
    if (part.reference) {
      setType(8.5, 'normal', MUTED)
      doc.text(safe(part.reference), left, l.y() + 1)
      l.spacer(REF_LINE + 2)
    }
    part.blocks.forEach(block)
    l.spacer(10)
  })

  // ── running header and footer ───────────────────────────────────────────────────────────────────
  const total = doc.getNumberOfPages()
  const footerBaseline = pageHeight - MARGIN.bottom + 22
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    setType(8, 'normal', MUTED)
    if (p > 1) {
      const header = doc.splitTextToSize(safe(m.runningHeader), contentWidth)[0] as string
      doc.text(header, left, HEADER_BASELINE)
      doc.setDrawColor(HAIRLINE); doc.setLineWidth(0.5)
      doc.line(left, HEADER_BASELINE + 7, left + contentWidth, HEADER_BASELINE + 7)
    }
    const right = `Page ${p} of ${total}`
    doc.text(right, pageWidth - MARGIN.right - doc.getTextWidth(right), footerBaseline)
    if (m.footerCredit) doc.text(safe(m.footerCredit), left, footerBaseline)
  }

  return { doc, substituted }
}
