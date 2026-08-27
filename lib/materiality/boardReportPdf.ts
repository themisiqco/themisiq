/**
 * The materiality assessment report, rendered.
 *
 * ⚠️ THIS FILE RENDERS. IT DOES NOT DECIDE. Every figure and every sentence below comes from
 * buildBoardReport's output. Nothing here counts a topic, derives a materiality verdict, rewords a
 * definition, shortens a limitation or summarises a threshold. If a number is wanted that this
 * module would have to compute, the computation belongs in boardReport.ts and the answer comes back
 * through the payload — the lib/ghg/engine.ts rule CLAUDE.md carries as an invariant: ONE renderer,
 * and the renderer is not where the methodology lives.
 *
 * ⚠️ NO MEAN, AND NOT EVEN THE MATERIALS FOR ONE. StakeholderRow carries a distribution and a top
 * box and deliberately has no field an average could come from. Do not compute one here from the
 * three band counts: the screening scale is ORDINAL (spec v10/v11 §6.2.5), the distance between
 * band 1 and band 2 is not the same quantity as between 2 and 3, and an average of them would be a
 * number with no meaning that nonetheless looks precise. There is no midpoint marker anywhere in
 * this file and none may be added.
 *
 * ⚠️ IT RETURNS THE DOCUMENT, IT DOES NOT SAVE IT — a deliberate divergence from
 * lib/assurancePdf.ts, which calls doc.save() itself at the end of generateAssurancePDF. That
 * forces a download and makes the function unusable for attaching a paper to an email or opening it
 * in a viewer. The caller decides:
 *
 *   const doc = generateBoardReportPDF(report)
 *   doc.save(`ThemisIQ_MaterialityAssessmentReport_${(report.cover.company_name || 'Company').replace(/\s+/g, '_')}.pdf`)
 *
 * which keeps assurancePdf.ts's naming shape without keeping its side effect.
 *
 * =====================================================================
 * ⚠️ THE PRINTED SECTION NUMBERS ARE AUTHORITATIVE. THE COMMENTS ARE NOT.
 * =====================================================================
 * From 27 Aug 2026 every section prints its number ("3. Who took part") and the contents page on
 * page 2 lists all twelve with the page each starts on. Those numbers come from ONE place — the
 * section() helper in generateBoardReportPDF, counting in render order — so they cannot drift from
 * the document they describe.
 *
 * THE COMMENTS IN THIS FILE AND IN boardReport.ts, register.ts AND THE TESTS USE AN OLDER SCHEME,
 * roughly fifty sites, in which polarisation and contrast are sub-sections 5b and 5c and the
 * roadmap is 6b — so it runs to 10 where the printed numbering runs to 12. It also contradicts
 * itself: :251 below calls the assessment "section 6" and :306, inside that same block, calls it
 * "section 9".
 *
 * WHEN A COMMENT AND A PRINTED NUMBER DISAGREE, THE PRINTED NUMBER IS RIGHT. Renumbering the
 * comments is a separate sweep, deliberately not done here: it would have buried the two
 * customer-facing corrections that shipped with this change — ABSTENTION_NOTE's "section 10" and
 * the roadmap note's "section 3", both wrong under the printed scheme and both read by a board.
 *
 * ⚠️ AND ONE COMMENT IS NOW WRONG ABOUT A PAGE, NOT A SECTION. boardReport.ts:260 says "PAGE 3 IS
 * THE PAGE A BOARD REMEMBERS", written when findings landed on physical page 3. The contents page
 * takes page 2, so findings is page 4 now. The claim is about the first page of argument, which is
 * still findings; only the number moved.
 */

import type jsPDF from 'jspdf'
import {
  createLayout, MARGIN, INK, PAPER, SECONDARY, MUTED,
  type Layout,
} from '../pdf/layout'
import { CHARIS_FAMILY } from '../fonts/charis'
// ⚠️ THE SAME ASSET THE COVER USES. Never recreated, never traced, never set as type — see the
// header of lib/pdf/logo.ts.
import { THEMISIQ_WORDMARK_DATA_URI, WORDMARK_ASPECT } from '../pdf/logo'
/**
 * ⚠️ IMPORTED, NEVER COPIED. lib/disclaimer.ts is the single source of truth for this text and
 * CLAUDE.md requires it to stay in sync across every Category-A surface. It is rendered in full and
 * in order: not summarised, not reordered, not abridged, and never rewritten to fit a page. The
 * array is `readonly` precisely so a consumer cannot splice or reorder shared legal text, and this
 * file only reads it.
 */
import { disclaimerParas } from '../disclaimer'
import { ROADMAP_NO_REQUIREMENTS_NOTE, type RoadmapTopic } from './boardReport'
// ⚠️ THE S1/S2 FRAMING, AND WHY A CODE IS NOT ENOUGH ON ITS OWN. 'Health and safety' appears twice
// in this paper — S1.3 and S2.3 — and topic_label cannot tell them apart, because S1 and S2 share a
// merged label by design. The CODE disambiguates for a verifier; the FRAMING ('on your own
// workforce' / 'on workers in your value chain') says WHY they differ, in words a director reads.
// Neither substitutes for the other, so reader-facing lists carry both. worksheetSubtopicHeading
// returns the bare name for every topic that has no framing, so it is safe everywhere.
import { worksheetSubtopicHeading } from './severityScale'
import type { AssessmentRow, BoardReport, ContrastEntry, StakeholderRow } from './boardReport'
// The register's own entry shape, reached through DifferencesSection.register.entries.
import type { RegisterEntry } from './register'

// ── measuring and placing ────────────────────────────────────────────────────────────────────────

const SIZE = {
  body: 10.5,
  small: 9.5,
  label: 8,
  figure: 44,
  figureLabel: 11,
} as const

const LEAD = {
  body: 10.5 * 1.65,
  small: 9.5 * 1.55,
  label: 8 * 1.4,
} as const

const setType = (doc: jsPDF, size: number, style: 'normal' | 'bold' | 'italic', colour: string) => {
  doc.setFont(CHARIS_FAMILY, style)
  doc.setFontSize(size)
  doc.setTextColor(colour)
}

const wrap = (doc: jsPDF, text: string, width: number, size: number,
              style: 'normal' | 'bold' | 'italic' = 'normal'): string[] => {
  setType(doc, size, style, INK)
  return doc.splitTextToSize(text, width) as string[]
}

/**
 * Reserve a block of known height, breaking the page first if it will not fit, then draw into it.
 *
 * ⚠️ THE RESERVED HEIGHT AND THE DRAWN HEIGHT ARE THE SAME NUMBER. The cursor is advanced by
 * exactly what was reserved, so a block can never draw past what keepTogether checked and overlap
 * whatever follows. Measure first, then reserve, then draw — never the other way round.
 */
const block = (l: Layout, height: number, draw: (top: number) => void): void => {
  l.keepTogether(height, () => {
    draw(l.y())
    l.spacer(height)
  })
}

/** Wrapped text drawn at an arbitrary x and width — layout.body() is always full measure. */
const textAt = (doc: jsPDF, lines: string[], x: number, top: number,
                size: number, lead: number, style: 'normal' | 'bold' | 'italic',
                colour: string): void => {
  setType(doc, size, style, colour)
  lines.forEach((line, i) => doc.text(line, x, top + size + i * lead))
}

/**
 * Start a section on its own page.
 *
 * ⚠️ CONTINUATION IS ALLOWED FOR EXACTLY ONE PAIR. Sections 9 and 10 are the closing argument and
 * read as one thought — what this does not cover, then what it tells you anyway. Everywhere else a
 * section owns its page, because this report is read in fragments and a section that begins
 * halfway down a page is a section somebody misses.
 */
const sectionPage = (l: Layout, opts: { continueIfRoom?: number } = {}): void => {
  const room = l.pageHeight - MARGIN.bottom - l.y()
  if (opts.continueIfRoom && room >= opts.continueIfRoom) {
    l.spacer(18)
    return
  }
  l.newPage()
}

/**
 * ── THE CONTENTS PAGE ───────────────────────────────────────────────────────────────────────────
 * Metrics in ONE place, because the measure and the draw must not disagree: contentsHeightPages
 * decides how many pages to reserve before the body exists, and contentsFill draws into exactly
 * that space afterwards. Two copies of a line height is two answers to "does it fit".
 */
const TOC = {
  size: 11,
  lead: 20,
  /** Left column for the section number, right column for the page number. Fixed, so a wrapped
   *  title cannot push a page number out of alignment. */
  numberColumn: 26,
  pageColumn: 32,
  above: 14,
  /** heading level 1: above + size*1.3 + below, from layout.ts's HEADING table. */
  headingBlock: 26 + 20 * 1.3 + 12,
} as const

/**
 * The twelve section titles, in render order — the contents' input and the reservation's basis.
 *
 * ⚠️ EXPORTED SO A TEST CAN COUNT THEM. This list and the twelve section() calls in
 * generateBoardReportPDF are two statements of the same fact, and nothing but a test holds them
 * together: a section added to the render without an entry here would be measured out of the
 * reservation, and an entry here without a section() call would reserve room for a line nobody
 * draws. generateBoardReportPDF asserts the two agree at render time; boardReport.test.ts asserts
 * the count is twelve.
 */
export const sectionTitles = (report: BoardReport): string[] => [
  report.whatThisIs.heading, report.findings.heading, report.participation.heading,
  report.stakeholderView.heading, report.polarisation.heading, report.contrast.heading,
  report.assessmentView.heading, report.roadmap.heading, report.differences.heading,
  report.methodology.heading, report.limitations.heading, report.whyThisMatters.heading,
]

/**
 * How many pages the contents needs, from the titles alone.
 *
 * ⚠️ MEASURED BEFORE THE BODY EXISTS, WHICH IS WHAT MAKES THE RESERVATION SAFE. It depends on the
 * titles and the page geometry only — never on the page numbers, which sit right-aligned in a fixed
 * column and cannot change a line count. If this were computed after the body, the reservation
 * would already be the wrong size.
 */
const contentsHeightPages = (l: Layout, titles: string[]): number => {
  const usable = l.pageHeight - MARGIN.top - MARGIN.bottom
  const textWidth = l.contentWidth - TOC.numberColumn - TOC.pageColumn
  setType(l.doc, TOC.size, 'normal', INK)
  const lines = titles.reduce(
    (n, tt) => n + (l.doc.splitTextToSize(tt, textWidth) as string[]).length, 0)
  return Math.max(1, Math.ceil((TOC.headingBlock + TOC.above + lines * TOC.lead) / usable))
}

/**
 * Draw the contents into the pages reserved for it.
 *
 * ⚠️ DIRECT doc CALLS WITH setPage, NOT THE LAYOUT CURSOR — the same shape as the footer loop at
 * the foot of this file, and for the same reason: the layout's cursor belongs to the sequential
 * body render, and setPage does not move it.
 *
 * ⚠️ THROWS RATHER THAN SPILL, AND THE ASYMMETRY IS THE POINT. If this needed a page the
 * reservation did not claim, it would run into the body and every page number it had already
 * printed would be one too low — a contents page that looks entirely correct and sends a reader to
 * the wrong page. A throw reaches the caller as "The paper could not be assembled, and nothing was
 * downloaded", which is recoverable. A wrong number is not, because nothing about it looks wrong.
 */
const contentsFill = (
  l: Layout,
  entries: { n: number; title: string; page: number }[],
  firstPage: number,
  pageCount: number,
): void => {
  const doc = l.doc
  const textWidth = l.contentWidth - TOC.numberColumn - TOC.pageColumn
  const bottom = l.pageHeight - MARGIN.bottom
  let page = firstPage
  doc.setPage(page)

  setType(doc, 20, 'normal', INK)
  let y = MARGIN.top + 26 + 20
  doc.text('Contents', MARGIN.left, y)
  y += 12 + TOC.above

  for (const e of entries) {
    const lines = (() => {
      setType(doc, TOC.size, 'normal', INK)
      return doc.splitTextToSize(e.title, textWidth) as string[]
    })()

    if (y + lines.length * TOC.lead > bottom) {
      page += 1
      if (page >= firstPage + pageCount) {
        throw new Error(
          `The contents needs more than the ${pageCount} page(s) reserved for it. The reservation ` +
          `is measured from the same titles before the body is drawn, so this means the measure ` +
          `and the draw have come apart — see TOC in lib/materiality/boardReportPdf.ts. Nothing ` +
          `was produced: a contents page drawn past its reservation would print page numbers that ` +
          `are all one too low, and would look correct.`,
        )
      }
      doc.setPage(page)
      y = MARGIN.top + TOC.size
    }

    setType(doc, TOC.size, 'normal', MUTED)
    doc.text(String(e.n), MARGIN.left, y)

    setType(doc, TOC.size, 'normal', INK)
    doc.text(lines, MARGIN.left + TOC.numberColumn, y)

    const pageLabel = String(e.page)
    setType(doc, TOC.size, 'normal', INK)
    const pageX = l.pageWidth - MARGIN.right - doc.getTextWidth(pageLabel)
    doc.text(pageLabel, pageX, y)

    // ⚠️ LEADERS ON THE LAST LINE OF THE TITLE, so a wrapped title's dots run from where the words
    // actually stop rather than from the width of the column.
    const lastLineWidth = (() => {
      setType(doc, TOC.size, 'normal', INK)
      return doc.getTextWidth(lines[lines.length - 1])
    })()
    const leaderStart = MARGIN.left + TOC.numberColumn + lastLineWidth + 6
    const leaderEnd = pageX - 6
    if (leaderEnd > leaderStart) {
      setType(doc, TOC.size, 'normal', MUTED)
      const dotWidth = doc.getTextWidth('·  ')
      const dots = '·  '.repeat(Math.max(0, Math.floor((leaderEnd - leaderStart) / dotWidth)))
      if (dots) doc.text(dots, leaderStart, y + (lines.length - 1) * TOC.lead)
    }

    y += lines.length * TOC.lead
  }
}

// ── section 5: the distributions ─────────────────────────────────────────────────────────────────

const BAND_ROW_HEIGHT = 15
const BAR_TRACK = 190
const BAR_HEIGHT = 7

/**
 * The three band bars for ONE set of counts, drawn from `top` and returning the height used.
 * Shared by section 5 and the labour contrast so the two cannot draw the same data differently.
 */
const bandBars = (l: Layout, dist: { '1': number; '2': number; '3': number },
                  top: number, x: number, track: number): number => {
  const doc = l.doc
  const counts: [('1' | '2' | '3'), number][] = [['1', dist['1']], ['2', dist['2']], ['3', dist['3']]]
  const total = counts.reduce((a, [, n]) => a + n, 0)
  const scale = total > 0 ? track / total : 0
  let cursor = top
  for (const [band, n] of counts) {
    const baseline = cursor + BAR_HEIGHT
    setType(doc, SIZE.label, 'normal', MUTED)
    doc.text(band, x, baseline)
    const barX = x + 14
    doc.setFillColor(232, 231, 228)
    doc.rect(barX, cursor, track, BAR_HEIGHT, 'F')
    if (n > 0) {
      doc.setFillColor(85, 94, 83)
      doc.rect(barX, cursor, Math.max(n * scale, 1.2), BAR_HEIGHT, 'F')
    }
    setType(doc, SIZE.small, 'normal', INK)
    doc.text(String(n), barX + track + 10, baseline)
    cursor += BAND_ROW_HEIGHT
  }
  return cursor - top
}

/**
 * Three horizontal bars, one per band, sharing a baseline and a scale.
 *
 * ⚠️ NOT A STACKED BAR, AND NOT A GRADIENT ONE. The bands are ordered CATEGORIES and the question a
 * reader has is "how many chose each" — which is a comparison of lengths from a common origin, the
 * one thing a bar chart does well. Stacking them turns three comparable quantities into three
 * segments of one length, which answers a question nobody asked and hides the shape of a split room.
 *
 * ⚠️ ALL THREE BARS ARE THE SAME COLOUR, DELIBERATELY. Colouring band 3 differently would encode a
 * verdict about an answer — that choosing "needs significant strategic focus" is the alarming one —
 * and this paper reports what respondents said without grading it. The band number and the count
 * carry the meaning; the section's own scale note, printed above, says what each number means.
 *
 * ⚠️ THE SCALE IS PER ROW. Bar lengths are comparable between the three bands of ONE sub-topic. They
 * are not comparable between sub-topics, whose denominators differ — which is why every count is
 * printed as a number beside its bar rather than left to be read off a length.
 */
const distributionBlock = (l: Layout, row: StakeholderRow): void => {
  const doc = l.doc
  const nameLines = wrap(doc, `${row.name} · ${row.subtopic_code}`, l.contentWidth, SIZE.body, 'bold')
  const topBoxLine = row.top_box.share === null
    ? `${row.top_box.numerator} of ${row.top_box.denominator} gave a rating`
    // ⚠️ THE DENOMINATOR TRAVELS WITH THE SHARE, always — the module's own strings do the same.
    : `${row.top_box.numerator} of ${row.top_box.denominator} chose band 3`
  const splitLines = row.split_note ? wrap(doc, row.split_note, l.contentWidth, SIZE.small) : []

  const height =
    nameLines.length * (SIZE.body * 1.35) + 6
    + 3 * BAND_ROW_HEIGHT + 8
    + LEAD.small
    + (splitLines.length ? splitLines.length * LEAD.small + 6 : 0)
    + 16

  block(l, height, top => {
    let cursor = top
    textAt(doc, nameLines, MARGIN.left, cursor, SIZE.body, SIZE.body * 1.35, 'bold', INK)
    cursor += nameLines.length * (SIZE.body * 1.35) + 6

    const counts: [('1' | '2' | '3'), number][] = [
      ['1', row.distribution['1']],
      ['2', row.distribution['2']],
      ['3', row.distribution['3']],
    ]
    const total = counts.reduce((a, [, n]) => a + n, 0)
    // A row where nobody scored draws no bars — a zero-length bar and a missing bar look identical,
    // and the counts printed beside them say which this is.
    const scale = total > 0 ? BAR_TRACK / total : 0

    for (const [band, n] of counts) {
      const baseline = cursor + BAR_HEIGHT
      setType(doc, SIZE.label, 'normal', MUTED)
      doc.text(band, MARGIN.left, baseline)

      const x = MARGIN.left + 14
      // The track, so an empty band still shows its place on the shared scale.
      doc.setFillColor(232, 231, 228)
      doc.rect(x, cursor, BAR_TRACK, BAR_HEIGHT, 'F')
      if (n > 0) {
        doc.setFillColor(85, 94, 83)
        doc.rect(x, cursor, Math.max(n * scale, 1.2), BAR_HEIGHT, 'F')
      }

      setType(doc, SIZE.small, 'normal', INK)
      doc.text(String(n), x + BAR_TRACK + 10, baseline)
      cursor += BAND_ROW_HEIGHT
    }

    cursor += 4
    setType(doc, SIZE.small, 'normal', SECONDARY)
    doc.text(
      `${topBoxLine} · ${row.counts.answered} answered · ${row.counts.abstained} did not judge · `
      + `${row.counts.skipped} skipped`,
      MARGIN.left, cursor + SIZE.small)
    cursor += LEAD.small

    if (splitLines.length) {
      cursor += 6
      textAt(doc, splitLines, MARGIN.left, cursor, SIZE.small, LEAD.small, 'italic', SECONDARY)
    }
  })
}

/** A plain comma-separated list of names, indented under whatever introduced it. */
const nameList = (l: Layout, names: string[]): void => {
  const doc = l.doc
  const lines = wrap(doc, names.join(', '), l.contentWidth - 12, SIZE.small)
  block(l, lines.length * LEAD.small + 10, top => {
    textAt(doc, lines, MARGIN.left + 12, top, SIZE.small, LEAD.small, 'normal', SECONDARY)
  })
}

// ── section 6: the assessment ────────────────────────────────────────────────────────────────────

const DIRECTION_WORD: Record<string, string> = { negative: 'Harm', positive: 'Benefit' }

/**
 * ⚠️ DISPLAY ONLY. The mean of 3, 3, 2 is 2.6666666666666665, which is what a float is and not what
 * a reader should be handed. Rounded to one decimal HERE, at the point of printing.
 *
 * ⚠️ AND NOWHERE ELSE. Nothing downstream of this function reads the rounded value, and no
 * comparison anywhere is made against it. Materiality is decided in lib/materiality/severity.ts by
 * an exact integer comparison — deliberately, because the two-dimension positive case lands exactly
 * on the threshold and materiality would otherwise rest on the representation of a division. A
 * severity that displays as 2.5 was tested as the exact value, not as 2.5.
 */
const showSeverity = (v: number): string => v.toFixed(1)

/**
 * The sentence that keeps the rounding honest, printed once in section 6.
 *
 * ⚠️ IT LIVES BESIDE showSeverity, NOT IN boardReport.ts. The module holds exact values and makes
 * no rounding decision, so a note about rounding kept there could drift from the renderer that
 * actually rounds. Here the claim and the code that makes it true are eight lines apart.
 */
const ROUNDING_NOTE =
  'Severity figures below are shown to one decimal place. The materiality test that produced each '
  + 'verdict was made on the exact value, not on the rounded one, so a figure printed as 2.5 was '
  + 'tested as what it actually was.'

const assessmentBlock = (l: Layout, row: AssessmentRow): void => {
  const doc = l.doc
  const nameLines = wrap(doc, `${row.name} · ${row.subtopic_code}`, l.contentWidth, SIZE.body, 'bold')

  const lines: string[] = []

  /**
   * ⚠️ THE ATTRIBUTION GOES FIRST, ABOVE THE ROW'S OWN DIRECTIONS. A reader who meets
   * "material" and then a list of the sub-topic's own undetermined directions has already formed
   * the wrong belief by the time an explanation arrives. Named IROs only — a row carried by its own
   * determinations needs no "via", and printing one would make the ordinary case look qualified.
   */
  const viaIros = row.carriers.filter(c => c.iro_key !== '')
  if (row.material && viaIros.length > 0) {
    const via = viaIros
      .map(c => `${c.name ?? c.iro_key} (${c.carried_by.map(d => DIRECTION_WORD[d] ?? d).join(', ')})`)
      .join('; ')
    lines.push(row.material_on_own_row
      ? `Material on this topic's own determinations, and via ${via}`
      : `Material via ${via} — not on this topic's own determinations`)
  }

  for (const d of row.directions) {
    const label = DIRECTION_WORD[d.direction] ?? d.direction
    if (!d.determined) {
      // ⚠️ NOT AN ABSTENTION, AND THE DISTINCTION IS THE POINT. "Nobody judged this" and "the judge
      // could not see it" are different facts: an abstention is a recorded answer under §6.1, and
      // this is the absence of one. Section 9 renders every sub-topic in scope as of 22 Aug 2026,
      // so most rows on most reports take this branch — a bold name with nothing under it would
      // read as "we concluded nothing is material here", which is a conclusion nobody reached.
      lines.push(`${label}: not yet determined`)
      continue
    }
    if (!d.complete) {
      // ⚠️ TWO CAUSES, TWO SENTENCES, AND ONE ROW MAY CARRY BOTH. An abstention is a recorded
      // answer under §6.1 — never a zero, never a low, never an empty cell that reads like a score
      // of nothing. An unscored dimension is an unfinished worksheet, which is a fact about the
      // work and not about what the organisation can see. One sentence for both told a reader the
      // assessor had declined a question they had simply not reached.
      const parts: string[] = []
      if (d.abstained.length > 0) parts.push(`not enough visibility to judge ${d.abstained.join(', ')}`)
      if (d.unscored.length > 0) parts.push(`${d.unscored.join(', ')} not yet scored`)
      lines.push(`${label}: ${parts.join(' · ')} — no severity`)
      continue
    }
    const drivers = d.drivers.length ? ` · carried by ${d.drivers.join(', ')}` : ''
    lines.push(`${label}: severity ${showSeverity(d.severity as number)}${drivers}`
             + ` · ${d.material === true ? 'material' : 'not material'}`)
  }

  const wrapped = lines.flatMap(x => wrap(doc, x, l.contentWidth - 12, SIZE.small))
  const height = nameLines.length * (SIZE.body * 1.35) + 6 + wrapped.length * LEAD.small + 16

  block(l, height, top => {
    let cursor = top
    textAt(doc, nameLines, MARGIN.left, cursor, SIZE.body, SIZE.body * 1.35, 'bold', INK)
    cursor += nameLines.length * (SIZE.body * 1.35) + 6
    textAt(doc, wrapped, MARGIN.left + 12, cursor, SIZE.small, LEAD.small, 'normal', SECONDARY)
  })
}

// ── section 6b: WHAT BECOMES DISCLOSABLE — BUILT, AND DELIBERATELY NOT RENDERED ──────────────────
//
// ⚠️ generateBoardReportPDF DOES NOT CALL roadmapBlock, AND THAT IS THE COMMIT, NOT AN OVERSIGHT.
// The payload section exists (boardReport.ts buildRoadmap), the prose exists, this renderer exists
// and is tested. Nothing invokes it, so the PDF this file produces is unchanged.
//
// WHY. Nothing freezes the requirement rows for this report. Every OTHER input to this paper is
// stabilised by its own mechanism:
//     determinations      status = 'submitted', and an override leaves a companion row (20260839)
//     the threshold       the round's snapshotted top_box_high_min_share (20260843)
//     the round           frozen_at
//     sub-topic names     resolved per standard_version
// The requirement table is the only one with no such mechanism, and it demonstrably changes:
// migration 20260845 rewrote E1-11's title on 21 Aug 2026. So two downloads of the same paper a
// month apart would carry different requirement text, with nothing on the document explaining it.
//
// RESOLVING AT READ AND DISCLOSING IT IN A NOTE PUTS A SENTENCE WHERE A MECHANISM BELONGS, on a
// document a customer hands a verifier. The climate-risk assessment does not do this - it freezes
// the resolved rows into workings at write (api/materiality/route.ts:337) precisely "so a later
// re-seed cannot change what this report prints". This report has no equivalent, because it has no
// stored artefact at all: buildBoardReport runs in a useMemo and the PDF is saved client-side.
//
// TURNED ON 22 Aug 2026, and the freeze point was NOT materiality_lead_submit as guessed above.
// That RPC refuses when the lead holds nothing, so a fully delegated assessment could never reach
// it — which is why finalisation became its own explicit event: materiality_finalise (20260849),
// writing materiality_finalisations and materiality_finalisation_requirements (20260848). The
// caller reads the frozen rows for the latest version and passes them as
// BoardReportInput.disclosure_requirements. boardReport.ts needed no change, as predicted.
//
// ⚠️ AN UNFINALISED ASSESSMENT STILL GENERATES. Its caller passes NO rows, so every material topic
// prints ROADMAP_NO_REQUIREMENTS_NOTE and the cover carries NOT_FINALISED_NOTE saying why.
// Refusing to generate would withhold a paper that is entirely correct about everything else in it.

const roadmapBlock = (l: Layout, t: RoadmapTopic): void => {
  const doc = l.doc
  const nameLines = wrap(doc, `${t.topic_code} · ${t.topic_label}`, l.contentWidth, SIZE.body, 'bold')

  // ESRS 1 ¶30 — which sub-topics carried the topic decides how far the disclosure may be scoped,
  // so this is stated before the requirements rather than after them.
  const drivenLines = wrap(doc, `Material through: ${t.driven_by.map(d => d.name).join(' · ')}`,
                           l.contentWidth - 12, SIZE.small, 'italic')

  type Line = { text: string; stated: boolean }
  const lines: Line[] = []
  if (t.requirements.length === 0) {
    lines.push({ text: ROADMAP_NO_REQUIREMENTS_NOTE, stated: false })
  } else {
    for (const r of t.requirements) {
      lines.push({ text: `${r.dr_code}  ${r.title}`, stated: true })
      // ⚠️ A NULL datapoints IS SAID, NEVER LEFT BLANK. Every esrs_2026 row is null today. A blank
      // line under a requirement reads as "nothing to collect" - a finding this payload cannot
      // support. The sentence is word-for-word the one the climate-risk roadmap prints: two
      // surfaces, one claim about the same absence.
      lines.push({
        text: r.datapoints ?? 'Not yet summarised — see the standard text for this requirement.',
        stated: r.datapoints != null,
      })
    }
  }

  const wrapped = lines.flatMap(x =>
    wrap(doc, x.text, l.contentWidth - 12, SIZE.small).map(text => ({ text, stated: x.stated })))
  const height = nameLines.length * (SIZE.body * 1.35) + 6
               + drivenLines.length * LEAD.small + 6
               + wrapped.length * LEAD.small + 16

  block(l, height, top => {
    let cursor = top
    textAt(doc, nameLines, MARGIN.left, cursor, SIZE.body, SIZE.body * 1.35, 'bold', INK)
    cursor += nameLines.length * (SIZE.body * 1.35) + 6
    textAt(doc, drivenLines, MARGIN.left + 12, cursor, SIZE.small, LEAD.small, 'italic', SECONDARY)
    cursor += drivenLines.length * LEAD.small + 6
    // Drawn line by line so an unstated datapoint can carry its own colour without a second block.
    wrapped.forEach((ln, i) => {
      textAt(doc, [ln.text], MARGIN.left + 12, cursor + i * LEAD.small,
             SIZE.small, LEAD.small, 'normal', ln.stated ? SECONDARY : MUTED)
    })
  })
}

/**
 * One omission group: the topics, then the reason beneath them.
 *
 * ⚠️ NAMES FIRST, ALWAYS, SINGLETON OR NOT. Until 22 Aug 2026 the singleton branch read
 * "name — detail" and the multi branch read detail, then a count, then the names — two orders, with
 * l.body flowing them together and no separator. So a group's reason sat directly beneath the
 * PREVIOUS group's last name: on the fixture, "Nobody who was asked gave a rating" rendered under
 * Climate change mitigation, which received eight ratings. A reader attaches the wrong cause to a
 * named topic, and nothing on the page says otherwise.
 *
 * One order fixes it structurally rather than typographically: every group now ENDS with its
 * reason, so a reason cannot bleed upward into names that are not its own. The singleton case is
 * the plural's degenerate form rather than a different layout.
 *
 * The count is gone with the second order. "3 topics:" above a list of three is a number to
 * reconcile rather than read; the names are the count.
 */
const omissionBlock = (l: Layout, names: string[], detail: string): void => {
  const doc = l.doc
  const nameLines = wrap(doc, names.join(', '), l.contentWidth, SIZE.body, 'bold')
  const why = wrap(doc, detail, l.contentWidth - 12, SIZE.small)
  const height = nameLines.length * (SIZE.body * 1.35) + 6 + why.length * LEAD.small + 16
  block(l, height, top => {
    let cursor = top
    textAt(doc, nameLines, MARGIN.left, cursor, SIZE.body, SIZE.body * 1.35, 'bold', INK)
    cursor += nameLines.length * (SIZE.body * 1.35) + 6
    textAt(doc, why, MARGIN.left + 12, cursor, SIZE.small, LEAD.small, 'normal', SECONDARY)
  })
}

// ── section 7: the two facts ─────────────────────────────────────────────────────────────────────

const COLUMN_GAP = 22

/**
 * One entry, as TWO COLUMNS OF EQUAL WIDTH AND EQUAL WEIGHT.
 *
 * ⚠️ NEITHER COLUMN IS STYLED AS THE CORRECTION OF THE OTHER. Same width, same size, same weight,
 * same colour, same rule above. No red, no amber, no arrow between them, no ordering that puts the
 * "right" answer second. A difference between what respondents said and what the assessment
 * concluded is not an error either side made, and a layout that shades one of them has made a
 * finding the module explicitly declines to make.
 */
const entryBlock = (l: Layout, entry: RegisterEntry): void => {
  const doc = l.doc
  const colWidth = (l.contentWidth - COLUMN_GAP) / 2
  const rightX = MARGIN.left + colWidth + COLUMN_GAP

  // ⚠️ THE CODE IS NO LONGER A FALLBACK. `short_name ?? subtopic_code` printed the code only when
  // the name was missing — so where a name existed, nothing distinguished S1.3 from S2.3.
  const nameLines = wrap(doc,
    `${entry.short_name ?? entry.subtopic_code} · ${entry.subtopic_code} · ${entry.topic_label}`,
    l.contentWidth, SIZE.body, 'bold')
  const left = wrap(doc, entry.stakeholder.statement, colWidth, SIZE.small)
  const right = wrap(doc, entry.assessment.statement, colWidth, SIZE.small)

  const bodyLines = Math.max(left.length, right.length)
  const height = nameLines.length * (SIZE.body * 1.35) + 8
               + LEAD.label + 4 + bodyLines * LEAD.small + 18

  block(l, height, top => {
    let cursor = top
    textAt(doc, nameLines, MARGIN.left, cursor, SIZE.body, SIZE.body * 1.35, 'bold', INK)
    cursor += nameLines.length * (SIZE.body * 1.35) + 8

    // Column labels. These are the only invented strings in this file: the payload carries the two
    // statements but no headings for them, and a two-column layout needs to say which is which.
    setType(doc, SIZE.label, 'normal', MUTED)
    doc.text('WHAT RESPONDENTS SAID', MARGIN.left, cursor + SIZE.label)
    doc.text('WHAT YOUR ASSESSMENT CONCLUDED', rightX, cursor + SIZE.label)
    cursor += LEAD.label + 4

    textAt(doc, left, MARGIN.left, cursor, SIZE.small, LEAD.small, 'normal', INK)
    textAt(doc, right, rightX, cursor, SIZE.small, LEAD.small, 'normal', INK)
  })
}

// ── the labour contrast ─────────────────────────────────────────────────────────────────────────

/**
 * One labour pair: own workforce above, value-chain workers below, both full measure.
 *
 * ⚠️ ONE ABOVE THE OTHER, BOTH THE SAME WIDTH. Side by side in two columns the two charts end up on
 * different residual widths once the labels differ, and two bar groups that are not on the same
 * scale cannot be compared by eye — which is the only thing this block exists to allow. The results
 * screen made the same choice for the same reason.
 *
 * ⚠️ A PAIR THAT CANNOT BE DRAWN IS PRINTED, NOT DROPPED. not_comparable_reason IS the finding —
 * usually that nobody in the value chain answered — and a blank or a zero in its place would report
 * agreement where there is silence.
 */
const contrastBlock = (l: Layout, e: ContrastEntry): void => {
  const doc = l.doc
  const nameLines = wrap(doc, `${e.short_name} · ${e.s1_subtopic_code} / ${e.s2_subtopic_code}`,
                         l.contentWidth, SIZE.body, 'bold')

  if (!e.comparable || !e.s1.distribution || !e.s2.distribution) {
    const why = wrap(doc, e.not_comparable_reason ?? 'No reason was recorded.',
                     l.contentWidth - 12, SIZE.small)
    const height = nameLines.length * (SIZE.body * 1.35) + 6 + why.length * LEAD.small + 16
    block(l, height, top => {
      textAt(doc, nameLines, MARGIN.left, top, SIZE.body, SIZE.body * 1.35, 'bold', INK)
      textAt(doc, why, MARGIN.left + 12,
             top + nameLines.length * (SIZE.body * 1.35) + 6, SIZE.small, LEAD.small, 'normal', SECONDARY)
    })
    return
  }

  const sides: [string, typeof e.s1][] = [
    ['Your own workforce', e.s1],
    ['Workers in your value chain', e.s2],
  ]
  const height = nameLines.length * (SIZE.body * 1.35) + 8
               + sides.length * (LEAD.small + 3 * BAND_ROW_HEIGHT + 10) + 12

  block(l, height, top => {
    let cursor = top
    textAt(doc, nameLines, MARGIN.left, cursor, SIZE.body, SIZE.body * 1.35, 'bold', INK)
    cursor += nameLines.length * (SIZE.body * 1.35) + 8

    for (const [who, side] of sides) {
      setType(doc, SIZE.small, 'normal', SECONDARY)
      // ⚠️ THE COUNT, NOT A DERIVED SHARE. n_answered is the denominator and it is printed here.
      doc.text(`${who} · ${side.n_answered} answered`, MARGIN.left, cursor + SIZE.small)
      cursor += LEAD.small
      cursor += bandBars(l, side.distribution as { '1': number; '2': number; '3': number },
                         cursor, MARGIN.left, BAR_TRACK) + 10
    }
  })
}

// ── the document ─────────────────────────────────────────────────────────────────────────────────

/**
 * Render the report. Returns the jsPDF instance; the caller saves, opens or attaches it.
 */
export function generateBoardReportPDF(report: BoardReport): jsPDF {
  const l = createLayout()
  const doc = l.doc

  // ── 1 · COVER ────────────────────────────────────────────────────────────────────────────────
  l.coverPage({
    company: report.cover.company_name,
    assessmentName: report.cover.assessment_name,
    period: report.cover.reporting_period,
    standardVersionLabel: report.cover.standard_version_label,
    roundName: report.cover.round_name,
    closedOn: report.cover.round_closed_at,
    finalisedStamp: report.cover.finalised_stamp,
    coverNote: report.cover.cover_note,
  })

  /**
   * ⚠️ PAGE 2 IS CLAIMED HERE AND DRAWN LAST. jsPDF renders sequentially, so the contents cannot
   * know a page number until the body has been laid out. The page is reserved now, the body records
   * where each section landed as it goes, and setPage() fills it at the end — the same machinery
   * the footer loop has always used to stamp "n of total" after the fact.
   *
   * NOT A TWO-PASS RENDER: createLayout() registers Charis into THIS document's virtual filesystem
   * (see layout.ts's note), so rendering the body twice means paying font registration twice and
   * holding two documents open to produce one.
   *
   * ⚠️ THE RESERVATION IS MEASURED, NOT ASSUMED, AND THAT IS THE WHOLE SAFETY ARGUMENT. If the
   * contents ever needed more room than was reserved, drawing it would run into page 3 — which
   * holds the body — and EVERY page number printed on it would be one too low, silently. So the
   * height is computed from the same twelve titles that will be drawn, BEFORE the body exists, and
   * enough pages are claimed for it. contentsFill re-checks and throws rather than spill.
   */
  const TITLES = sectionTitles(report)
  const contentsFirstPage = l.page()
  const contentsPageCount = contentsHeightPages(l, TITLES)
  for (let i = 0; i < contentsPageCount; i++) l.newPage()

  /**
   * Where each section landed, filled by section() as the body renders.
   *
   * ⚠️ RECORDED AFTER l.heading(), NEVER BEFORE. heading() calls ensure(), which breaks to a new
   * page rather than orphan a heading at the foot of one — so the page a section STARTS on is only
   * known once its heading has been drawn. Recording first would put a section on page 12 in the
   * contents while it prints on 13, and only on the documents where a heading happened to fall
   * near a page boundary.
   */
  const contents: { n: number; title: string; page: number }[] = []
  let sectionNo = 0
  const section = (title: string, level: 1 | 2 = 1): void => {
    sectionNo += 1
    l.heading(`${sectionNo}. ${title}`, level)
    contents.push({ n: sectionNo, title, page: l.page() })
  }

  // The cover carries the title and the "for information" line; repeating them here would be the
  // second copy. Printed once, at the head of the paper proper. UNNUMBERED: it is a running head,
  // not a section, and numbering it would make the twelve thirteen.
  l.heading(report.cover.title, 1)
  l.lead(report.cover.kind)
  l.rule()

  // ── 2 · WHAT THIS IS ─────────────────────────────────────────────────────────────────────────
  // ⚠️ LEVEL 2 AND NUMBERED. It shares the running-head page rather than owning one — the only
  // section that does — but it is section 1 of twelve and the contents must point at it.
  section(report.whatThisIs.heading, 2)
  report.whatThisIs.paragraphs.forEach((p, i) => (i === 0 ? l.lead(p) : l.body(p)))

  // ── 3 · FINDINGS ─────────────────────────────────────────────────────────────────────────────
  // ⚠️ THE MOST SPACIOUS PAGE IN THE DOCUMENT, ON PURPOSE. These three numbers are what a director
  // carries out of the room. A dense page of them reads as a table to be checked later; three
  // figures with air around them read as the finding they are.
  sectionPage(l)
  section(report.findings.heading)
  l.spacer(10)

  const figures: [number, string, string][] = [
    [report.findings.topics_assessed, 'Topics assessed', report.findings.definitions.assessed],
    [report.findings.topics_material, 'Topics material', report.findings.definitions.material],
    [report.findings.topics_differing, 'Topics where the two views differ',
     report.findings.definitions.differing],
  ]

  for (const [value, label, definition] of figures) {
    // ⚠️ THE DEFINITION IS PRINTED VERBATIM, BENEATH ITS OWN FIGURE. A number a director remembers
    // has to be a number they can define, and the definition beside it is what stops the figure
    // being repeated later with a different meaning attached.
    const defLines = wrap(doc, definition, l.contentWidth - 8, SIZE.small)
    const height = SIZE.figure + 10 + LEAD.body + 6 + defLines.length * LEAD.small + 34

    block(l, height, top => {
      let cursor = top
      setType(doc, SIZE.figure, 'normal', INK)
      doc.text(String(value), MARGIN.left, cursor + SIZE.figure)
      cursor += SIZE.figure + 10

      setType(doc, SIZE.figureLabel, 'normal', INK)
      doc.text(label, MARGIN.left, cursor + SIZE.figureLabel)
      cursor += LEAD.body + 6

      textAt(doc, defLines, MARGIN.left + 8, cursor, SIZE.small, LEAD.small, 'normal', SECONDARY)
    })
  }

  // ⚠️ COVERAGE, ON THE SAME PAGE AS THE THREE FIGURES. It changes how all three should be read,
  // so it is set beside them rather than eight pages later where a reader has already formed a view.
  {
    const f = report.findings
    const headline =
      `${f.topics_with_ratings} of the ${f.topics_asked} sub-topics put to respondents came back `
      + `with at least one rating.`
    const gap = f.topics_asked - f.topics_with_ratings
    const second = gap > 0
      ? `${gap} received none, so no stakeholder view exists for them and this report cannot set `
        + `one beside your assessment.`
      : `Every sub-topic asked about received at least one rating.`
    const defLines = wrap(doc, f.definitions.coverage, l.contentWidth - 8, SIZE.small)
    const headLines = wrap(doc, `${headline} ${second}`, l.contentWidth, SIZE.body)
    const height = LEAD.body + 4 + headLines.length * LEAD.body + 6
                 + defLines.length * LEAD.small + 26

    block(l, height, top => {
      let cursor = top
      setType(doc, SIZE.figureLabel, 'normal', INK)
      doc.text('Coverage', MARGIN.left, cursor + SIZE.figureLabel)
      cursor += LEAD.body + 4
      textAt(doc, headLines, MARGIN.left, cursor, SIZE.body, LEAD.body, 'normal', INK)
      cursor += headLines.length * LEAD.body + 6
      textAt(doc, defLines, MARGIN.left + 8, cursor, SIZE.small, LEAD.small, 'normal', SECONDARY)
    })
  }

  if (report.findings.material_topics.length > 0) {
    l.rule()
    l.heading('The material topics', 3)
    for (const t of report.findings.material_topics) {
      // carried_by is printed as the module holds it — both directions where both carried, because
      // ¶44 forbids netting them into one finding.
      l.body(`${worksheetSubtopicHeading(t.name, t.topic_code)} · ${t.subtopic_code}`
           + ` · ${t.topic_label} — ${t.carried_by.join(' and ')}`)
    }
  }

  // ── 4 · PARTICIPATION ────────────────────────────────────────────────────────────────────────
  sectionPage(l)
  section(report.participation.heading)
  l.spacer(6)

  const rows: [string, number, number, number][] = [
    ['All respondents', report.participation.totals.invited,
     report.participation.totals.opened, report.participation.totals.answered],
    ...report.participation.by_category.map(c =>
      [c.category, c.invited, c.opened, c.answered] as [string, number, number, number]),
  ]

  block(l, LEAD.label + 6, top => {
    setType(doc, SIZE.label, 'normal', MUTED)
    // ⚠️ THE COLUMNS NAME WHAT THEY COUNT. "Answered" was a lie of omission: the column counts
    // respondents who FINISHED, and a reader comparing a zero here against the ratings later in the
    // document has to decide which one is wrong. "Completed" makes the two reconcilable, and the
    // note beneath the table finishes the job.
    doc.text('GROUP', MARGIN.left, top + SIZE.label)
    doc.text('INVITED', MARGIN.left + 290, top + SIZE.label)
    doc.text('OPENED IT', MARGIN.left + 360, top + SIZE.label)
    doc.text('COMPLETED', MARGIN.left + 440, top + SIZE.label)
  })

  for (const [name, invited, opened, answered] of rows) {
    block(l, LEAD.body, top => {
      setType(doc, SIZE.body, 'normal', INK)
      doc.text(name, MARGIN.left, top + SIZE.body)
      setType(doc, SIZE.body, 'normal', SECONDARY)
      doc.text(String(invited), MARGIN.left + 290, top + SIZE.body)
      doc.text(String(opened), MARGIN.left + 360, top + SIZE.body)
      doc.text(String(answered), MARGIN.left + 440, top + SIZE.body)
    })
  }

  // The counts first; what they mean and why they matter beneath them.
  l.spacer(8)
  l.body(report.participation.completion_note)
  l.rule()
  l.body(report.participation.note)

  // ── 5 · WHAT STAKEHOLDERS SAID ───────────────────────────────────────────────────────────────
  sectionPage(l)
  section(report.stakeholderView.heading)
  // ⚠️ THE LEGEND STAYS ABOVE; THE JUSTIFICATION MOVES BELOW. scale_note says what bands 1, 2 and 3
  // MEAN — without it the first chart is unreadable, so it is not method, it is the key. The
  // no-average explanation is an argument for a choice already made, and it now sits in section 8
  // where a verifier looks for exactly that. It is moved, never cut.
  l.body(report.stakeholderView.scale_note)
  l.rule()

  // ⚠️ A CHART OF NOTHING IS WORSE THAN NO CHART. Three bars of zero beside a line saying nobody
  // rated the topic occupies the full height of a finding and carries none of one — and repeated
  // across twenty-odd sub-topics it buries the rows that DO have answers. The absence is still
  // reported, once, as the single fact it is.
  const scored = (r: StakeholderRow) =>
    r.distribution['1'] + r.distribution['2'] + r.distribution['3'] > 0
  const rated = report.stakeholderView.rows.filter(scored)
  const unrated = report.stakeholderView.rows.filter(r => !scored(r))

  for (const row of rated) distributionBlock(l, row)

  if (unrated.length > 0) {
    l.heading('Topics nobody rated', 3)
    l.body(`${unrated.length} sub-topics were put to respondents and received no ratings at all. `
         + `An absence of answers is not a low score: it means nobody who was asked judged the `
         + `topic, which is a finding about what can currently be seen rather than about the topic.`)
    nameList(l, unrated.map(r => `${worksheetSubtopicHeading(r.name, r.topic_code)} · ${r.subtopic_code}`))
  }

  // ── 5b · WHERE YOUR OWN PEOPLE DISAGREE ──────────────────────────────────────────────────────
  sectionPage(l)
  section(report.polarisation.heading)
  if (report.polarisation.rows.length === 0) {
    // A result, not an empty state.
    l.body(report.polarisation.none_note)
  } else {
    for (const row of report.polarisation.rows) distributionBlock(l, row)
  }
  l.rule()
  l.body(report.polarisation.what_this_is)
  if (report.polarisation.method_note) l.body(report.polarisation.method_note)

  // ── 5c · INSIDE AND OUTSIDE ──────────────────────────────────────────────────────────────────
  sectionPage(l)
  section(report.contrast.heading)

  if (report.contrast.unavailable_note) {
    l.body(report.contrast.unavailable_note)
  } else {
    // ⚠️ what_this_is_not IS PRINTED AT FULL WEIGHT, ABOVE THE ENTRIES, NOT AS A FOOTNOTE.
    // This is the one page in the document where a reader is most likely to draw a wrong
    // conclusion — that own workforce and value-chain workers answering differently means one of
    // them is wrong. They answer different questions about different workplaces. The aggregate's
    // own sentence says so and is used as given; a reader who meets it after the charts has
    // already drawn the inference it exists to prevent.
    if (report.contrast.what_this_is) l.body(report.contrast.what_this_is)
    if (report.contrast.what_this_is_not) l.body(report.contrast.what_this_is_not)
    l.rule()

    // ⚠️ A PAIR NOBODY ANSWERED IS NOT A COMPARISON. Five entries reading "neither side was
    // answered" after the one real finding is the empty-distribution problem again: each occupies
    // the height of a finding and carries none, and together they bury the pair that does. The
    // absence is still reported, once, with the pairs named — it is a coverage fact, not a
    // difference between two populations.
    const answered = (e: typeof report.contrast.entries[number]) =>
      e.s1.n_answered > 0 || e.s2.n_answered > 0
    const drawable = report.contrast.entries.filter(answered)
    const silent = report.contrast.entries.filter(e => !answered(e))

    if (report.contrast.entries.length === 0) {
      l.body(report.contrast.none_note)
    } else {
      for (const e of drawable) contrastBlock(l, e)

      if (silent.length > 0) {
        l.heading('Pairs nobody answered', 3)
        l.body(`${silent.length} labour ${silent.length === 1 ? 'pair' : 'pairs'} had no answers on `
             + `either side, so there is nothing to set beside anything. That is a fact about who `
             + `responded, not a finding that the two populations agree.`)
        // No framing here: a labour PAIR is the S1/S2 contrast, so 'on your own workforce' would
        // name one half of the thing being listed. Both codes instead.
        nameList(l, silent.map(e => `${e.short_name} · ${e.s1_subtopic_code} / ${e.s2_subtopic_code}`))
      }
    }
  }

  // ── 6 · WHAT THE ASSESSMENT CONCLUDED ────────────────────────────────────────────────────────
  sectionPage(l)
  section(report.assessmentView.heading)
  // Above the rows, so it is read before the first marked one rather than after the last.
  if (report.assessmentView.attribution_note) l.body(report.assessmentView.attribution_note)
  for (const row of report.assessmentView.rows) assessmentBlock(l, row)
  // The two notes are about how the figures above were made and printed. Beneath them, where a
  // reader who wants the finding meets it first and a reader who wants the method still finds it.
  l.rule()
  l.body(report.assessmentView.abstention_note)
  l.body(ROUNDING_NOTE)

  // ── 6b · WHAT BECOMES DISCLOSABLE ────────────────────────────────────────────────────────────
  sectionPage(l)
  section(report.roadmap.heading)
  l.body(report.roadmap.what_this_is)
  l.body(report.roadmap.what_this_is_not)
  if (report.roadmap.resolved_note) l.body(report.roadmap.resolved_note)
  if (report.roadmap.topics.length === 0) l.body(report.roadmap.none_note)
  else for (const t of report.roadmap.topics) roadmapBlock(l, t)

  // ── 7 · WHERE THE TWO VIEWS DIFFER ───────────────────────────────────────────────────────────
  sectionPage(l)
  section(report.differences.heading)

  // ⚠️ what_this_is_not IS NOT RENDERED. It is written for a developer deciding what to merge and
  // it uses the word "divergence", which reads to a customer as a finding against them. The same
  // decision the worksheet register screen makes.
  if (report.differences.register.entries.length === 0) {
    l.body('Everywhere both sides could be judged, they pointed the same way.')
  } else {
    for (const entry of report.differences.register.entries) entryBlock(l, entry)
  }

  if (report.differences.register.omitted.length > 0) {
    l.heading('Topics not compared', 3)

    // ⚠️ ABOVE THE GROUPS, NOT INSIDE ONE. The grouping below collapses rows that share a sentence,
    // so a note attached to a group would print beside some items and not others. This is a
    // statement about the section, and it is placed where the contrast section places its own.
    if (report.differences.never_asked_note) l.body(report.differences.never_asked_note)

    /**
     * ⚠️ GROUPED BY THE SENTENCE, NOT LISTED BY TOPIC. Thirty sub-topics awaiting a determination
     * share one reason, and printing that reason thirty times turns ONE finding into two pages that
     * read like thirty. The same sentence repeated is not more information.
     *
     * ⚠️ GROUPED ON THE DETAIL ITSELF, NOT ON THE REASON CODE, and that distinction is what keeps
     * the per-topic ones intact. "negative: scale, scope, irremediability not yet scored" is genuinely
     * about ONE topic and differs from every other incomplete row, so it forms a group of one and
     * keeps its own line. An exclusion reason recorded per topic behaves the same way. Only rows
     * whose sentence is word-for-word identical collapse — which is exactly the rows for which the
     * sentence carries nothing topic-specific.
     *
     * The reason code itself is never printed: it is an enum, and a system value has no place in
     * front of a reader.
     */
    const groups = new Map<string, { detail: string; names: string[] }>()
    for (const o of report.differences.register.omitted) {
      const detail = o.detail ?? 'No further detail was recorded.'
      const key = `${o.reason}\u0000${detail}`
      const g = groups.get(key) ?? { detail, names: [] }
      // Same fix as entryBlock: the code was a fallback, so a named topic carried no code at all.
      g.names.push(o.short_name ? `${o.short_name} · ${o.subtopic_code}` : o.subtopic_code)
      groups.set(key, g)
    }

    for (const g of groups.values()) omissionBlock(l, g.names, g.detail)
  }

  // The framing and the inactive trigger, beneath the entries they describe.
  l.rule()
  l.body(report.differences.register.what_this_is)
  for (const t of report.differences.register.triggers_inactive) l.body(t.reason)

  // ── 8 · METHODOLOGY ──────────────────────────────────────────────────────────────────────────
  sectionPage(l)
  section(report.methodology.heading)

  for (const p of report.methodology.provisions) {
    // ⚠️ NOT SUMMARISED. These were written for a verifier, who will look the reference up and
    // compare. A paraphrase that drifts from the provision is worse than no paraphrase.
    l.keepTogether(90, () => {
      l.heading(p.reference, 3)
      l.body(p.requirement)
      l.body(p.how_applied)
    })
  }

  l.rule()
  // ⚠️ MOVED HERE FROM SECTION 5, NOT CUT. The scale is ordinal and no average is computed
  // anywhere; that argument is exactly what a verifier opens the methodology to check, and in
  // section 5 it stood between the reader and the first chart.
  l.heading('Why no average is shown', 2)
  l.body(report.stakeholderView.no_mean_note)

  l.rule()
  l.heading('Thresholds', 2)
  l.body(report.methodology.thresholds_note)

  for (const t of report.methodology.thresholds) {
    l.keepTogether(80, () => {
      l.heading(`${t.key} — ${t.value}`, 3)
      l.body(t.definition)
      l.body(t.source)
    })
  }

  // ── 9 · LIMITATIONS ──────────────────────────────────────────────────────────────────────────
  // ⚠️ FULL WEIGHT, NOT SMALL PRINT, AND THE POSTURE IS THE POINT. The climate-risk report states
  // its limits on the face of the document rather than in an appendix, because a paper that is
  // frank about what it does not cover is the reason a reader can trust what it does. Set at body
  // size in ink — the same size as the findings.
  sectionPage(l)
  section(report.limitations.heading)
  for (const item of report.limitations.items) l.body(item)

  l.rule()
  l.heading('What this paper does not claim', 2)
  for (const item of report.limitations.not_claimed) l.body(item)

  // ── 10 · WHY THIS MATTERS ────────────────────────────────────────────────────────────────────
  sectionPage(l, { continueIfRoom: 320 })
  section(report.whyThisMatters.heading)
  // ⚠️ AHEAD OF THE ITEMS AND OUTSIDE THE keepTogether LOOP — see MATERIAL_VIA_IRO_NOTE. The items
  // are four fixed reflections; this is a statement about THIS paper, and rendering it as a fifth
  // title-and-body would make the two indistinguishable.
  if (report.whyThisMatters.material_via_iro_note) {
    l.body(report.whyThisMatters.material_via_iro_note)
  }
  for (const item of report.whyThisMatters.items) {
    l.keepTogether(96, () => {
      l.heading(item.title, 3)
      l.body(item.body)
    })
  }

  // ── BACK COVER ───────────────────────────────────────────────────────────────────────────────
  // ⚠️ A LIGHT PAGE, LIKE THE FRONT. No reversed type anywhere in this document — see the header of
  // lib/pdf/layout.ts. The notice is the densest block in the report and that is appropriate; the
  // attribution above it is not, and is given room so the two do not read as one paragraph.
  //
  // ⚠️ BUILT FROM THE LAYOUT LAYER'S OWN PRIMITIVES, not from hand-computed coordinates. block()
  // reserves and advances the same cursor everything else uses, and l.rule() is the one place the
  // gradient hairline is defined — reimplementing either here would be a second copy free to drift
  // from the one that was checked.
  l.newPage()
  doc.setFillColor(PAPER)
  doc.rect(0, 0, l.pageWidth, l.pageHeight, 'F')

  {
    // ⚠️ ONE dimension set, the other derived. A stretched wordmark is the most visible way to look
    // careless on a formal document — see lib/pdf/logo.ts.
    const logoWidth = 128
    const logoHeight = logoWidth / WORDMARK_ASPECT
    block(l, logoHeight + 46, top => {
      doc.addImage(THEMISIQ_WORDMARK_DATA_URI, 'PNG', MARGIN.left, top, logoWidth, logoHeight)
    })

    // ── ATTRIBUTION — WHAT THIS PAGE MAY AND MAY NOT CLAIM ─────────────────────────────────
    // Rewritten 22 Aug 2026. Until then this block read:
    //
    //     Prepared by ThemisIQ.                                                       body, normal
    //     Methodology reviewed by Lisa Foster                                         body, BOLD
    //     FSA Credential Holder, IFRS Foundation · Founder, ThemisIQ Compliance Inc.    small
    //
    // Three separate problems, three deliberate fixes. Do not restore any of them piecemeal — the
    // name, the weight and the verb were mutually reinforcing.
    //
    // ⚠️ 1. NO PERSONAL NAME, AND THE CREDENTIAL COMES OFF WITH IT. Counsel advised 22 Aug 2026
    // that the IFRS Foundation's published FSA FAQ expressly permits a holder to display credential
    // status on a resume, digital profile, email signature and other PERSONAL BRAND material — and
    // does not address use on commercial client deliverables. The Foundation's general trade mark
    // guidance separately prohibits unlicensed use of its marks to promote a business, product or
    // service. Those two do not answer the customer-deliverable question between them, so this use
    // is PERMISSION-UNCERTAIN rather than permitted or refused. It stays off until the Foundation
    // confirms it in writing. If that confirmation arrives, it belongs in this comment beside
    // whatever is restored.
    //
    // ⚠️ 2. NO BOLD, AND THE WEIGHT WAS HALF THE PROBLEM. The old second line was the most
    // prominent text on the page — heavier than the corporate line above it, with a professional
    // designation set directly beneath. That is the layout of a signature block, and a reader who
    // knows the convention reads it as a signed opinion whatever the words say. The replacement is
    // SIZE.small and normal: subordinate to 'Prepared by ThemisIQ.', which is the claim this
    // document can actually support.
    //
    // ⚠️ 3. "developed by", NOT "reviewed by". "Reviewed" asserts a discrete act by a named
    // individual, and nothing in this repo can evidence such an act against a report version — no
    // review record, no date, no version pin. "Developed by ThemisIQ Compliance Inc." is a claim
    // about authorship that the repository itself is the evidence for.
    //
    // ⚠️ AND THIS BRINGS THE BOARD REPORT INTO LINE, NOT OUT OF IT. Every VERIFIER-facing surface
    // already carries no personal attribution at all — lib/assurancePdf.ts, app/verify/[token],
    // app/verify-cbam/[token] and app/methodology/page.tsx contain no name and no credential
    // between them. The board report was the outlier: the one document built for a board rather
    // than an auditor was the only one making a credentialed review claim.
    //
    // The contact line below is untouched. An address is how someone reaches us; it makes no claim
    // about who reviewed anything.
    const attribution: [string, number, 'normal' | 'bold', string][] = [
      ['Prepared by ThemisIQ.', SIZE.body, 'normal', INK],
      ['Methodology developed by ThemisIQ Compliance Inc. This report is not an assurance '
       + 'engagement, audit, certification, professional opinion, or endorsement of the '
       + "customer's disclosure.",
       SIZE.small, 'normal', SECONDARY],
    ]
    for (const [text, size, style, colour] of attribution) {
      const lines = wrap(doc, text, l.contentWidth, size, style)
      block(l, lines.length * size * 1.55 + 6, top => {
        textAt(doc, lines, MARGIN.left, top, size, size * 1.55, style, colour)
      })
    }

    l.spacer(12)
    block(l, LEAD.small + 8, top => {
      setType(doc, SIZE.small, 'normal', SECONDARY)
      doc.text('lisa.foster@themisiq.co · themisiq.co', MARGIN.left, top + SIZE.small)
    })

    l.spacer(14)
    l.rule()
    l.spacer(10)

    l.heading('Important notice', 2)

    // ⚠️ ALL SIX, IN ORDER, WHOLE. Dense is correct for this block; illegible is not — SECONDARY is
    // 6.98:1 on paper and the text is set at 9.5pt, not at the smallest size available and not in
    // the lightest grey. Legal text a reader cannot read is legal text that was not given.
    for (const para of disclaimerParas('disclosure_preparation')) {
      const lines = wrap(doc, para, l.contentWidth, SIZE.small)
      block(l, lines.length * LEAD.small + 7, top => {
        textAt(doc, lines, MARGIN.left, top, SIZE.small, LEAD.small, 'normal', SECONDARY)
      })
    }
  }

  // ── FOOTERS ──────────────────────────────────────────────────────────────────────────────────
  // ⚠️ NOT layout.footer(): that helper prints "ThemisIQ" on the left, and this document needs the
  // company and the assessment on every page — this report circulates detached from its cover,
  // and a page found on its own has to say what it belongs to. Same position, same muted grey
  // (4.83:1 on paper), same size.
  /**
   * ⚠️ THE TWO STATEMENTS OF THE SAME FACT, CHECKED AGAINST EACH OTHER BEFORE ANYTHING IS DRAWN.
   * sectionTitles() is what the reservation was measured from; `contents` is what the body actually
   * rendered. They are twelve and twelve today, and nothing in the type system holds them together
   * — a section added to the render without an entry in that list, or the reverse, is exactly the
   * drift that produced the two numbering schemes this change had to choose between.
   */
  if (contents.length !== TITLES.length) {
    throw new Error(
      `The contents lists ${TITLES.length} sections and the document rendered ${contents.length}. ` +
      `sectionTitles() in lib/materiality/boardReportPdf.ts and the section() calls in this ` +
      `function are two statements of one fact and have come apart. Nothing was produced: a ` +
      `contents page missing a section, or reserving room for one that does not exist, is a paper ` +
      `whose numbering cannot be trusted.`,
    )
  }
  contentsFill(l, contents, contentsFirstPage, contentsPageCount)

  const total = doc.getNumberOfPages()
  const stamp = [report.cover.company_name, report.cover.assessment_name]
    .filter(Boolean).join(' · ')

  for (let p = 2; p <= total; p++) {
    doc.setPage(p)
    setType(doc, 8, 'normal', MUTED)
    const baseline = l.pageHeight - MARGIN.bottom + 22
    if (stamp) doc.text(stamp, MARGIN.left, baseline)
    const n = `${p} of ${total}`
    doc.text(n, l.pageWidth - MARGIN.right - doc.getTextWidth(n), baseline)
  }

  return doc
}
