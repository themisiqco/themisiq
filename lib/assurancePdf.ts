import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { disclaimerParas } from './disclaimer'
import { auditTrailLine } from './auditTrailNotice'
// T17 (PDF-03, ruled 9 Oct 2026): THE PACKAGE PRINTS THE INVENTORY AS SAVED. Every figure, citation, edition, exclusion,
// residual factor and document status below is read from the stored row (its `workings`, totals, locations_data and its
// logs), through lib/ghg/storedWorkings.ts and the T11 helpers, so the PDF and the verifier page, which read the same
// row, cannot differ. Nothing here prices, selects an edition, derives a location or rebuilds a workings row: no
// engine calculation is imported (lib/assurancePdf.t17.test.ts). Types only from the engine.
import type { CountryRefusal, LocationEvent } from './ghg/engine'
import { yearLabel, periodWords, reportingYearLabel, periodFromYearAndEnd } from './ghg/reportingYear'
import { evidenceRecordRows } from './ghg/evidenceRecord'
import { FACTOR_YEAR_NO_SUBSTITUTION, FACTOR_YEAR_RULE_CLASS_B } from './ghg/factorEditionRegistry'
import {
  workingsActivityCell, workingsVintageCell, workingsEditionLines, workingsScope2MethodCell, workingsResultCell, workingsFactorSourceCell,
  workingsGwpBasisCell, workingsConversionFactorLine, workingsSourceParts, sourcePartsLines, workingsNoteCell, workingsEmissionFactorCell,
  displayStoredText,
} from './ghg/workingsCells'
import {
  storedRows, workingsPageRows, savedAtLine, excludedFromRows, citationsFromRows, derivationsFromRows, editionRowsFromRows,
  residualRowsFromRows, documentIndexRows, WORKINGS_NOT_KEPT, type StoredRow,
} from './ghg/storedWorkings'
import { sourceAttributionsFor } from './ghg/defraPublication'
import { docTypeLabel } from './ghg/conciergeDocTypes'
import { comparabilityHeading, comparabilitySurfaceLines, factorEditionSurfaceLines, type ComparabilityRecord, type FactorEditionComparison } from './ghg/comparability'
import { countryRefusalText } from './ghg/countryRefusalCopy'
// ⚠️ BRAND IS DELIBERATELY NOT IMPORTED HERE ANY MORE (25 Sep 2026). Two calls in this file set it as
// TEXT: a subheading at what was line 258 and the running eyebrow in sectionTitle(). Both are now INK.
//   WHY: lib/pdf/palette.test.ts asserts that every colour in the print palette clears AA against the
// surface it is drawn on, and BRAND is not in that palette — palette.ts says so explicitly, because it
// lives in lib/brand.ts with the rest of the brand literals. So the one brand colour that printed as text
// sat outside the only contrast test in the repo. #095C6B is 7.13:1 on PAPER and passed by luck; the
// incoming colourway's #0097B2 is 3.23:1 and would have failed silently, in a document an auditor reads.
//   The fix is not to widen the contrast test. It is for print text to come from the print palette, which
// is neutral by design and does not move when the brand does. lib/pdf/palette.test.ts now also asserts
// that neither PDF module sets BRAND as text, so this cannot come back unnoticed.
// MUTE is layout.ts's MUTED under this module's existing local name; the alias keeps every
// call site below unchanged. lib/pdf/palette.test.ts asserts the two modules agree.
import { INK, MUTED as MUTE, TABLE_INK, HAIRLINE, ON_COVER_MUTED, ON_COVER } from './pdf/palette'

// ── Types (mirror the wizard's shapes) ──
export interface PdfSourceDoc { id: string; file_name: string; document_type: string; uploaded_at: string; file_path: string }
export interface PdfLocation {
  name: string; state?: string; country?: string
  source_docs: PdfSourceDoc[]
  [k: string]: any
}
export interface PdfInventory {
  company_name: string; reporting_year: number; revenue_millions: number
  // T3b: the year end (1-12); null or absent is December. Labels the year and its window.
  fiscal_year_end_month?: number | null
  employee_count: number; boundary_approach: string
  selected_frameworks: string[]
  locations: PdfLocation[]
  // T17: the stored workings rows, exactly as saved. Absent, null or empty: saved before they were kept (WORKINGS_NOT_KEPT).
  workings?: unknown
  // T17: when the printed inventory was saved (ghg_inventories.updated_at), for the cover. Never the export time.
  updated_at?: string | null
  // T17 (PDF-02): the GWP set the stored figures are on (ghg_inventories.gwp_version).
  gwp_version?: string | null
  // F-06: the year-on-year record, printed in its own section with the factor editions that changed.
  comparability_disclosure?: ComparabilityRecord | null
  // F-06: the platform's factor-edition comparison (the page's live one, else the stored column). Printed whether or
  // not the comparability question was answered.
  factor_edition_comparison?: FactorEditionComparison | null
  // T18 section D: every location deleted from the inventory; each location's own document_log rides on PdfLocation.
  location_log?: LocationEvent[] | null
}
// T17: the three totals the package prints, as stored. Nothing else is passed, so nothing is filled in.
export interface PdfTotals { s1_total: number; s2_location: number; s2_market: number }
export interface PdfFramework { id: string; name: string; full: string; gwp: string; deadline: string }
export interface PdfAuditRow { action: string; old_values: any; new_values: any; user_email: string | null; created_at: string }

/**
 * ⚠️ THE AUDIT TRAIL ARRIVES AS A RESULT, NOT AS AN ARRAY, AND THAT IS THE WHOLE POINT.
 *
 * This package is read by a verifier under ISO 14064-3 / ISAE 3410. It previously took
 * `auditRows: PdfAuditRow[]`, and its only caller passed `(auditRows as any) || []` — so a FAILED
 * READ and a GENUINELY EMPTY TRAIL arrived as the same value, and the document printed
 * "0 change(s) logged" and a table row reading "No entries" for both. For an inventory with live
 * verifier links against it, that is not a missing section: it is a false statement about the
 * customer's record, in the artefact whose entire purpose is to be trusted.
 *
 * A union makes the two facts impossible to conflate. There is no `[]` a caller can pass that
 * means "the read failed" — it must say so, and generateAssurancePDF then REFUSES TO GENERATE
 * rather than emit a document making a claim it cannot support. Same discipline as
 * lib/ghg/conciergeDocTypes.ts: structurally prevented, not asked for in a comment.
 */
export type PdfAuditTrail =
  | { ok: true; rows: PdfAuditRow[] }
  | { ok: false; reason: string }



// The formal Important Notice is rendered as a dedicated final page. This is IN ADDITION to
// the assurance-specific (ISO 14064-3 / ISAE 3410) disclaimer on the cover page, which is
// retained. Text lives in lib/disclaimer.ts — one copy across every surface that carries it.

const boundaryLabel = (b: string) =>
  ({ operational_control: 'Operational Control', financial_control: 'Financial Control', equity_share: 'Equity Share' }[b] || b)

// Audit-trail field labels (no unicode subscripts — jsPDF fonts lack them)
const AUDIT_FIELDS: Record<string, string> = {
  company_name: 'Company name',
  reporting_year: 'Reporting year',
  scope1_total: 'Scope 1 total (tCO2e)',
  scope2_location_total: 'Scope 2 location (tCO2e)',
  scope2_market_total: 'Scope 2 market (tCO2e)',
  revenue_millions: 'Revenue (USD M)',
  employee_count: 'Employees',
  boundary_approach: 'Boundary approach',
  selected_frameworks: 'Frameworks',
  status: 'Status',
}

function fmtVal(v: any): string {
  if (v === null || v === undefined || v === '') return '-'
  if (Array.isArray(v)) return v.join(', ') || '-'
  return String(v)
}

export function generateAssurancePDF(
  inventory: PdfInventory,
  // AR6 totals only. This took totalsAR4, totalsAR5 and totalsAR6 and chose per framework, a branch no
  // framework has reached since 20 Jun 2026. lib/ghg/gwpBasis.test.ts pins every framework to AR6.
  // T17: the STORED totals (ghg_inventories.scope1_total, scope2_location_total, scope2_market_total), never a recompute.
  totalsAR6: PdfTotals,
  frameworks: PdfFramework[],
  audit: PdfAuditTrail,
  // gwp_ar6 is required now: it is the only GWP row, and a package with no GWP row at all would be worse
  // than one that fails to compile.
  efSources: { combustion: string; electricity: string; gwp_ar6: string },
) {
  // ⚠️ REFUSE, DO NOT DEGRADE. A package missing its audit trail is recoverable — the user retries.
  // A package ASSERTING an empty audit trail is not: it goes to a verifier as evidence. Throwing
  // here is what stops the second thing happening, and the caller surfaces the reason.
  if (!audit.ok) {
    throw new Error(
      `Assurance package not generated: the audit trail could not be read (${audit.reason}). ` +
      'The package is not produced without it, because a verifier would otherwise receive a ' +
      'document stating this inventory has no recorded history.'
    )
  }
  const auditRows = audit.rows

  // compress: true deflates the content streams and the embedded Charis subset. This document
  // carries no raster — it draws no wordmark — so the saving is smaller than the board report's,
  // but it is a package a verifier receives by email and the cost is CPU once, at generation.
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  const W = doc.internal.pageSize.getWidth()
  const M = 48
  // T3b: the year's labels and window, from the one helper; the ref and filename use its fileTag.
  const yl = yearLabel(inventory.reporting_year, inventory.fiscal_year_end_month)
  const period = periodWords(inventory.reporting_year, inventory.fiscal_year_end_month).period
  const refId = `TIQ-GHG-${yl.fileTag}-${Date.now().toString().slice(-6)}`
  const today = new Date().toLocaleDateString('en-CA')

  // ── PAGE 1 — COVER ──
  doc.setFillColor(INK); doc.rect(0, 0, W, 200, 'F')
  doc.setTextColor(ON_COVER)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('THEMISIQ', M, 60)
  // ⚠️ NOT A CONTRAST FAILURE, DESPITE HOW IT SCANS. #9ca3af is 2.37:1 on the #f8f7f5 cover
  // stock, but nothing here is drawn on that stock: the block above fills the top 200pt with
  // INK (doc.setFillColor(INK); doc.rect(0, 0, W, 200)), so this is light-on-dark and measures
  // 7.66:1 against #0d0d0d. Do not 'fix' it against PAPER.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(ON_COVER_MUTED)
  doc.text('Compliance Intelligence for Sustainable Business', M, 76)
  doc.setTextColor(ON_COVER); doc.setFont('helvetica', 'bold'); doc.setFontSize(24)
  doc.text('GHG Emissions', M, 130)
  doc.text('Assurance Package', M, 162)

  let y = 248
  doc.setTextColor(INK); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  const meta: [string, string][] = [
    ['Company', inventory.company_name || 'Not recorded'],
    ['Reporting year', yl.heading],
    ['Reporting period', period],
    ['Frameworks', frameworks.map(f => f.name).join(', ') || 'None selected'],
    ['Boundary approach', boundaryLabel(inventory.boundary_approach)],
    ['Locations', String(inventory.locations.length)],
    ['Generated', today],
    ['Document ref', refId],
  ]
  // T17: the save this package prints, from the stored row's own updated_at, in UTC. Never the time of export.
  const savedLine = savedAtLine(inventory.updated_at) ?? 'Prints this inventory as saved; the time of that save was not recorded.'
  meta.forEach(([k, v]) => {
    doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal')
    doc.text(k.toUpperCase(), M, y)
    doc.setTextColor(INK); doc.setFont('helvetica', 'bold')
    doc.text(v, M + 150, y)
    y += 26
  })

  doc.setTextColor(INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text(savedLine, M, y)
  y += 16
  doc.setDrawColor(HAIRLINE); doc.line(M, y, W - M, y); y += 24
  doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const disclaimer = 'This package was generated by the ThemisIQ platform to support third-party verification under ISO 14064-3 / ISAE 3410. It documents the reporting entity, methodology, calculation workings, source-document index, and an append-only audit trail written by a database trigger. All emissions data requires independent third-party verification before formal submission. This document does not constitute assurance, legal advice, or a regulatory filing.'
  doc.text(doc.splitTextToSize(disclaimer, W - 2 * M), M, y)

  // ── PAGE 2 — EMISSIONS SUMMARY ──
  doc.addPage()
  sectionTitle(doc, 'Emissions Summary', M)
  const summaryRows = frameworks.map(f => {
    const t = totalsAR6
    const rev = inventory.revenue_millions
    return [
      f.name,
      // T17 (PDF-02): the GWP set the stored figures are on, from the row; never a constant per framework.
      inventory.gwp_version ? `IPCC ${inventory.gwp_version}` : 'Not recorded',
      // ⚠️ ROUNDED ON PURPOSE, AND THIS DOCUMENT IS THE EXCEPTION. The CSV exports write unrounded
      // figures because a verifier recomputes from a spreadsheet; this is a typeset page a person reads,
      // where 12 significant figures in a table cell are noise. Three decimals for a total is 1 kg and
      // matches the verifier page and the workings table (RESULT_DP); four for an intensity, because
      // tCO₂e per $M can sit below 1. Decided 27 Sep 2026. Do not "align" these with the CSVs.
      t.s1_total.toFixed(3),
      t.s2_location.toFixed(3),
      (f.id === 'esrs' || f.id === 'gri') ? t.s2_market.toFixed(3) : 'Not applicable',
      rev > 0 ? (t.s1_total / rev).toFixed(4) : 'No revenue entered',
    ]
  })
  autoTable(doc, {
    startY: 92,
    head: [['Framework', 'GWP', 'Scope 1 (tCO2e)', 'Scope 2 loc. (tCO2e)', 'Scope 2 mkt. (tCO2e)', 'S1 intensity /\$M']],
    body: summaryRows,
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 8 },
    bodyStyles: { fontSize: 9, textColor: TABLE_INK },
    margin: { left: M, right: M },
  })

  // ── WHAT THESE TOTALS LEAVE OUT ─────────────────────────────────
  //
  // ⚠️ THIS PACKAGE COULD NOT BE PRODUCED WITH A LOCATION MISSING UNTIL 21 SEP 2026, WHICH IS WHY
  // THE TABLE ABOVE HAD NO CAVEAT. pricingReady blocked every export while any location was
  // excluded, so the figures were always whole. Task 2a stopped blocking on a refusal the customer
  // cannot clear (a country set to "Not listed", or one this platform holds no factors for),
  // because a gate nobody can pass withholds the report for ever rather than protecting anyone.
  //   The exclusion being STATED is what makes that safe, and this is the surface where it matters
  // most: a verifier reading a short Scope 1 with nothing to explain it has been misled by omission.
  // Same sentences as the wizard, the CSV and the verifier page, from the one copy module.
  // T17: from the stored rows' country declarations, each with the refusal it recorded; nothing is re-decided here.
  const rows: StoredRow[] = storedRows(inventory.workings)
  const excludedLocs = excludedFromRows(rows).map(x => ({ loc: { name: x.location }, refusal: x.refusal as CountryRefusal }))
  if (excludedLocs.length > 0) {
    let y = (((doc as any).lastAutoTable?.finalY as number) ?? 92) + 16
    doc.setFontSize(9); doc.setTextColor(INK); doc.setFont('helvetica', 'bold')
    doc.text(`Excluded from every figure above: ${excludedLocs.length} location${excludedLocs.length > 1 ? 's' : ''}.`, M, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(MUTE)
    for (const { loc, refusal } of excludedLocs) {
      y += 12
      // ⚠️ A FULL STOP, NOT A COLON OR AN ARROW. A name followed by a colon reads as a label on a
      // machine record; this is a sentence a verifier reads. No arrows, bullets or other symbols
      // appear in any sentence this package prints, for the same reason.
      // ⚠️ THE NAME IS NEVER SENTENCE-INITIAL. "The location X." rather than "X.", so a site called
      // "other" is reproduced exactly as the customer typed it rather than reading as "Other".
      const sentence = `The location ${loc.name || 'Location'}. ${countryRefusalText(refusal!, 'verifier', false)}`
      const lines: string[] = doc.splitTextToSize(sentence, 515 - M)
      doc.text(lines, M, y)
      y += (lines.length - 1) * 9
    }
  }

  // ── PAGE 3 — METHODOLOGY ──
  doc.addPage()
  sectionTitle(doc, 'Methodology & Emission Factors', M)
  // Bound once each. Both are read twice below (length check, then map), and calling them twice would
  // walk the locations twice to build a value that cannot change between the two calls.
  // T17: the citations the stored rows were priced with, not a fresh selection made on the day of export.
  const { combustion: combustionCitations, electricity: gridCitations } = citationsFromRows(rows)
  autoTable(doc, {
    startY: 92,
    head: [['Element', 'Basis']],
    body: [
      ['Organizational boundary', boundaryLabel(inventory.boundary_approach)],
      // ONE ROW PER DISTINCT CITATION, for both factor families. Combustion printed
      // efSources.combustion — the US EPA constant — regardless of jurisdiction; electricity printed
      // efSources.electricity, the six-jurisdiction CATALOGUE, which is correct as a catalogue and
      // wrong as an attribution. 06b6125 removed that same catalogue from the workings table and this
      // page kept it.
      //
      // NO FALLBACK WHEN THE SET IS EMPTY, deliberately, and identically to the XLSX. An earlier draft
      // printed efSources.combustion when nothing resolved, so that a row always appeared. That is the
      // wrong instinct here: a methodology page citing US EPA BECAUSE ZERO SOURCES RESOLVED asserts
      // something the inventory does not support, to a verifier, on the document they read to decide
      // whether the figures are traceable. An absent row is honest; a wrong one is not. The case needs
      // a locations-less inventory and is unreachable today — emptyLocation() is always seeded — so
      // this is about which way to be wrong if it ever happens, and inventing a citation is the worse
      // way. Both exports now behave the same, which is also one less thing to explain.
      ...combustionCitations.map(src => ['Combustion factors', displayStoredText(src)]),
      // T17 (ruling 9 Oct 2026): the distinct conversion notes and conversion factors the stored rows carry, by source.
      ...derivationsFromRows(rows).map(([source, line]) => [`Factor derivation: ${source}`, line]),
      ...gridCitations.map(src => ['Electricity factors', displayStoredText(src)]),
      // The attribution each cited source's licence requires, verbatim, then the licence and its link.
      // From the same locations as the two citation lists above, so it appears exactly when they cite it.
      ...sourceAttributionsFor(rows.map(r => r.ef_source)).flatMap(a => [
        [`Licence attribution: ${a.publisher}`, a.attribution],
        [`Licence: ${a.publisher}`, `${a.licence}, ${a.licence_url}`],
      ]),
      // "GWP values (AR4)" and "(AR5)" rows were removed on 17 Sep 2026. They cited AR4 and AR5 as
      // "selectable alternate", and no inventory has ever been able to select either.
      ['GWP values (AR6)', displayStoredText(efSources.gwp_ar6)],
      ['Reporting year', yl.heading],
      ['Reporting period', period],
      // T3c: the window the editions were chosen for, and the rule, in the methodology page's words.
      ['Factor-year rule', `Each emission factor comes from the edition its publisher's rule assigns to the reporting window, ${period}. ${FACTOR_YEAR_RULE_CLASS_B} ${FACTOR_YEAR_NO_SUBSTITUTION} Where the edition a year needs has not yet been published, the line is priced on the newest published edition and labelled provisional.`],
      ['Standard', 'GHG Protocol Corporate Standard'],
    ],
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: TABLE_INK },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 } },
    margin: { left: M, right: M },
  })

  // Market-based Scope 2 residual-mix citation (only when ESRS/GRI is in scope). T17: the stored market-based rows.
  const residualRows = frameworks.some(f => f.id === 'esrs' || f.id === 'gri') ? residualRowsFromRows(rows) : []
  if (residualRows.length > 0) {
    const afterMethods = (doc as any).lastAutoTable?.finalY ?? 92
    // INK, like every other subheading in this document (see the two at the methods and locations
    // tables). It was BRAND, which made this one heading the only brand-coloured text in the package.
    doc.setTextColor(INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('Market-based Scope 2: Residual Mix', M, afterMethods + 30)
    doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(
      doc.splitTextToSize('Residual-mix factor applied to uncovered load, or, where no residual mix is loaded, the location-based grid average (named per location below); contractual (covered) kWh counted at zero. Per-location source and vintage below.', W - 2 * M),
      M, afterMethods + 44
    )
    autoTable(doc, {
      startY: afterMethods + 64,
      head: [['Location', 'Residual factor source', 'Vintage / note']],
      body: residualRows.map(r => r.map(cell =>
        (cell || '').replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4')
      )),
      theme: 'grid',
      headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 8 },
      bodyStyles: { fontSize: 7, textColor: TABLE_INK },
      columnStyles: { 0: { cellWidth: 90 }, 2: { cellWidth: 'auto' } },
      margin: { left: M, right: M },
    })
  }

  // ── PAGE 3b: FACTOR EDITIONS (T3c) ──
  // One row per edition as the stored workings record it: the edition, the rule that chose it and why, its publication
  // and correction dates, and for class (b) the day it was selected. T17: from the stored rows, never a rebuild.
  {
    const body = editionRowsFromRows(rows).map(row => row.map(cell => cell.replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4')))
    if (body.length > 0) {
      doc.addPage()
      sectionTitle(doc, 'Factor Editions', M)
      autoTable(doc, {
        startY: 92,
        head: [['Edition', 'Rule', 'Basis', 'Published', 'Corrected', 'Selected on']],
        body,
        theme: 'grid',
        headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 8 },
        bodyStyles: { fontSize: 7, textColor: TABLE_INK },
        columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 80 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 60 }, 4: { cellWidth: 55 }, 5: { cellWidth: 55 } },
        margin: { left: M, right: M },
      })
    }
  }

  // ── PAGE 3c: CALCULATION WORKINGS (T17) ──
  // Every stored workings row, worded as the verifier page words it (the T11 helpers): the bills that counted and
  // those that did not and why, estimated and month-only dates, hand entries, who and when, typed entries, the
  // conversion factor, the edition and its rule, and the GWP basis in words. The document and location records print
  // in the document index. On landscape pages, because nine columns do not fit across portrait letter.
  //   PAGE BREAKS: the header row repeats on every page, and a row is never split across a page (rowPageBreak
  // 'avoid'), so one figure's bills stay together; a single row taller than a page is the only one autoTable splits.
  {
    const sub = (cell: string) => cell.replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4')
    const docById = new Map<string, { file_name?: string; extracted?: { sourceQuote?: string | null }[] }>()
    for (const l of inventory.locations) for (const d of (l.source_docs ?? []) as { id: string; file_name?: string; extracted?: { sourceQuote?: string | null }[] }[]) docById.set(d.id, d)
    const fileOf = (id: string) => docById.get(id)?.file_name || 'A document no longer on this inventory'
    const quoteOf = (id: string, pi: number | undefined) => (pi == null ? null : docById.get(id)?.extracted?.[pi]?.sourceQuote?.trim() || null)
    const yearText = reportingYearLabel(periodFromYearAndEnd(inventory.reporting_year, inventory.fiscal_year_end_month ?? 12)).inText
    const pageRows = workingsPageRows(rows)
    doc.addPage('letter', 'landscape')
    sectionTitle(doc, 'Calculation Workings', M)
    if (pageRows.length === 0) {
      doc.setFontSize(10); doc.setTextColor(INK); doc.setFont('helvetica', 'normal')
      doc.text(doc.splitTextToSize(WORKINGS_NOT_KEPT, doc.internal.pageSize.getWidth() - 2 * M), M, 100)
    } else {
      autoTable(doc, {
        startY: 92,
        head: [['Location', 'Source', 'Activity data', 'Emission factor', 'Factor source', 'Factor vintage', 'Scope 2 method', 'GWP basis', 'Result (tCO2e)']],
        body: pageRows.map(r => {
          const w = r as StoredRow & Record<string, never>
          // T17 review: stored engine text (the note, the factor cell, the quantification method) through the shared
          // wording, so the package prints no dash and says what the verifier page says.
          const activity = [workingsActivityCell(w), workingsNoteCell(r), workingsConversionFactorLine(r) ?? '']
          return [
            r.location || 'Location',
            sourcePartsLines(workingsSourceParts(r as Parameters<typeof workingsSourceParts>[0], fileOf, quoteOf, yearText)).join('\n'),
            activity.filter(Boolean).join('\n'),
            workingsEmissionFactorCell(r),
            workingsFactorSourceCell(w),
            [workingsVintageCell(w), ...workingsEditionLines(w)].filter(Boolean).join('\n'),
            workingsScope2MethodCell(w),
            [workingsGwpBasisCell(r), displayStoredText(String(r.quantification_method ?? ''))].filter(Boolean).join('\n'),
            workingsResultCell(w),
          ].map(sub)
        }),
        theme: 'grid',
        showHead: 'everyPage',
        rowPageBreak: 'avoid',
        headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 7 },
        bodyStyles: { fontSize: 6.5, textColor: TABLE_INK, valign: 'top' },
        columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 210 }, 2: { cellWidth: 80 }, 4: { cellWidth: 90 }, 5: { cellWidth: 80 } },
        margin: { left: M, right: M },
      })
    }
  }

  // ── PAGE 3d: COMPARABILITY (F-06) ──
  // The year-on-year record as the verifier page shows it, from the same lines (comparability.ts): the company's
  // answer, what it was shown, the basis, then the factor editions that changed and the effect, and
  // FACTOR_EDITION_DISCLOSURE. The edition change is the platform's finding, not the company's, so it prints even when
  // the question is unanswered (Lisa's ruling, 8 Oct 2026); then the section carries the edition lines alone and no
  // answer is invented. With neither a record nor an edition change there is no section: on a first inventory no
  // question was ever due, and the package says nothing rather than guess which.
  {
    const rec = inventory.comparability_disclosure ?? null
    const cmp = inventory.factor_edition_comparison ?? null
    const lines = rec ? comparabilitySurfaceLines(rec, cmp) : factorEditionSurfaceLines(null, cmp)
    if (lines.length > 0) {
      const prior = cmp?.priorHeading ?? rec?.factorEditions?.priorHeading ?? yearLabel(inventory.reporting_year - 1, inventory.fiscal_year_end_month).heading
      doc.addPage()
      sectionTitle(doc, comparabilityHeading(prior), M)
      autoTable(doc, {
        startY: 92,
        head: [[rec ? 'Year-on-year comparability (ISO 14064-3, 6.3.1.5)' : 'Emission factor editions, compared by the platform (the comparability question was not answered)']],
        body: lines.map(l => [l.replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4')]),
        theme: 'grid',
        headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 9 },
        bodyStyles: { fontSize: 8, textColor: TABLE_INK },
        margin: { left: M, right: M },
      })
    }
  }

  // ── PAGE 4 — SOURCE DOCUMENT INDEX ──
  doc.addPage()
  sectionTitle(doc, 'Source Document Index', M)
  // T17: every document on file, deleted, or on a deleted location, with its Status from the stored record: counted,
  // or not counted and why (each bill's stored contributions), withdrawn (who, when, why), or deleted (the tombstone:
  // file, SHA-256 where known, who, when, why).
  const docRows: string[][] = documentIndexRows(
    inventory.locations as unknown as Parameters<typeof documentIndexRows>[0], rows, (inventory.location_log ?? []) as Parameters<typeof documentIndexRows>[2],
    reportingYearLabel(periodFromYearAndEnd(inventory.reporting_year, inventory.fiscal_year_end_month ?? 12)).inText, docTypeLabel,
  )
  if (docRows.length === 0) docRows.push(['None', 'No documents uploaded', '', '', ''])
  autoTable(doc, {
    startY: 92,
    head: [['Location', 'Document type', 'File name', 'Uploaded', 'Status']],
    body: docRows,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 9 },
    bodyStyles: { fontSize: 8, textColor: TABLE_INK, valign: 'top' },
    columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 75 }, 2: { cellWidth: 90 }, 3: { cellWidth: 55 } },
    margin: { left: M, right: M },
  })

  // T18 (pulled forward from T17, as ruled 9 Oct 2026): every document withdrawn, restored, deleted or deleted unused,
  // and every location deleted from the inventory, with who, when and why: the sentences the verifier page and the
  // saved workings carry. Printed only when there is one; a deletion record holds no reading from the file.
  const record = evidenceRecordRows(inventory)
  if (record.length > 0) {
    autoTable(doc, {
      startY: ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 92) + 14,
      head: [['Location', 'Document and location record']],
      body: record,
      theme: 'grid',
      headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 9 },
      bodyStyles: { fontSize: 8, textColor: TABLE_INK },
      columnStyles: { 0: { cellWidth: 110 } },
      margin: { left: M, right: M },
    })
  }

  // ── PAGE 5 — AUDIT TRAIL ──
  doc.addPage()
  sectionTitle(doc, 'Audit Trail', M)
  doc.setFontSize(8); doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal')
  // One wording, shared with the verifier page; see lib/auditTrailNotice.ts for why "tamper-evident" went.
  doc.text(auditTrailLine(auditRows.length), M, 86)
  const auditBody: string[][] = []
  auditRows.forEach(r => {
    const action = r.action === 'INSERT' ? 'Created' : r.action === 'DELETE' ? 'Deleted' : 'Updated'
    let changeText = ''
    if (r.action === 'UPDATE') {
      const o = r.old_values || {}, n = r.new_values || {}
      const diffs: string[] = []
      Object.keys(AUDIT_FIELDS).forEach(k => {
        const before = fmtVal(o[k]), after = fmtVal(n[k])
        if (before !== after) diffs.push(`${AUDIT_FIELDS[k]}: ${before} -> ${after}`)
      })
      changeText = diffs.join('; ') || 'No tracked fields changed'
    }
    auditBody.push([
      new Date(r.created_at).toLocaleString('en-CA'),
      action,
      r.user_email || 'System',
      changeText,
    ])
  })
  // Reachable only on a SUCCESSFUL read that returned nothing, which is a true statement about
  // a saved-but-never-edited inventory. A failed read cannot reach this line — see the throw above.
  if (auditBody.length === 0) auditBody.push(['None', 'No entries recorded', '', ''])
  autoTable(doc, {
    startY: 98,
    head: [['Timestamp', 'Action', 'User', 'Change']],
    body: auditBody,
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: ON_COVER, fontSize: 8 },
    bodyStyles: { fontSize: 7, textColor: TABLE_INK },
    columnStyles: { 0: { cellWidth: 110 }, 1: { cellWidth: 50 }, 3: { cellWidth: 'auto' } },
    margin: { left: M, right: M },
  })

  // ── PAGE 6 — IMPORTANT NOTICE ──
  // Formal notice in addition to the assurance-specific disclaimer on the cover.
  doc.addPage()
  sectionTitle(doc, 'Important Notice', M)
  {
    const H = doc.internal.pageSize.getHeight()
    const lineH = 13
    const paraGap = 9
    let ny = 100
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(TABLE_INK)
    disclaimerParas('verification_support').forEach(par => {
      const lines = doc.splitTextToSize(par, W - 2 * M) as string[]
      lines.forEach(ln => {
        if (ny > H - 60) { doc.addPage(); ny = 100 }
        doc.text(ln, M, ny)
        ny += lineH
      })
      ny += paraGap
    })
  }

  // ── Footer on every page ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const H = doc.internal.pageSize.getHeight()
    doc.setFontSize(7); doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal')
    doc.text(`ThemisIQ - ${refId} - generated ${today}`, M, H - 24)
    doc.text(`Page ${i} of ${pageCount}`, W - M, H - 24, { align: 'right' })
  }

  doc.save(`ThemisIQ_Assurance_${(inventory.company_name || 'Company').replace(/\s+/g, '_')}_${yl.fileTag}.pdf`)
}

function sectionTitle(doc: jsPDF, text: string, m: number) {
  // ⚠️ THE EYEBROW IS INK, NOT BRAND, AND THIS IS THE ONE WORTH A SECOND THOUGHT. It prints the product
  // name at the head of every section, so brand colour was defensible here in a way it was not on the
  // subheading above. It goes anyway, because the rule this change enforces is that NO brand value is
  // print text: an auditor reads this document in greyscale as often as in colour, the brand hue is about
  // to move to one that would be 3.23:1 on paper, and a running header set in a failing colour is worse
  // than one set in ink. If the eyebrow should carry brand colour after the swap, the deeper companion
  // (--color-brand-ink) is the value to use, and it must be added to lib/pdf/palette.ts so the contrast
  // test covers it rather than being imported from lib/brand.ts and escaping it again.
  doc.setTextColor(INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('THEMISIQ ASSURANCE PACKAGE', m, 48)
  doc.setTextColor(INK); doc.setFontSize(18)
  doc.text(text, m, 72)
}
