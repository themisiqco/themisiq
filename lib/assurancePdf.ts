import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Types (mirror the wizard's shapes) ──
export interface PdfSourceDoc { id: string; file_name: string; document_type: string; uploaded_at: string; file_path: string }
export interface PdfLocation {
  name: string; state?: string; country?: string
  source_docs: PdfSourceDoc[]
  [k: string]: any
}
export interface PdfInventory {
  company_name: string; reporting_year: number; revenue_millions: number
  employee_count: number; boundary_approach: string
  selected_frameworks: string[]
  locations: PdfLocation[]
}
export interface PdfTotals { s1_total: number; s2_location: number; s2_market: number; co2: number; ch4: number; n2o: number; biogenic: number }
export interface PdfFramework { id: string; name: string; full: string; gwp: string; deadline: string }
export interface PdfAuditRow { action: string; old_values: any; new_values: any; user_email: string | null; created_at: string }

const INK = '#0d0d0d'
const MUTE = '#888784'
const PURPLE = '#7425e3'

// Formal Important Notice — five paragraphs, matching the language used across
// ThemisIQ generated reports. Rendered as a dedicated final page; this is in
// addition to the assurance-specific (ISO 14064-3 / ISAE 3410) disclaimer on
// the cover page, which is retained.
const DISCLAIMER_PARAS: string[] = [
  'This report has been generated automatically by the ThemisIQ platform using information provided by the user and publicly available regulatory guidance. The report is provided solely for informational, planning, and compliance-support purposes and does not constitute legal advice, accounting advice, investment advice, assurance services, engineering advice, or any other professional opinion.',
  'ThemisIQ Compliance Inc. makes no representation or warranty, express or implied, regarding the completeness, accuracy, suitability, or regulatory sufficiency of the information contained in this report. Regulatory requirements may change and may vary by jurisdiction.',
  'Users remain solely responsible for reviewing, validating, and approving all information prior to submission to regulators, investors, customers, lenders, assurance providers, or other third parties.',
  'ThemisIQ Compliance Inc. is not an accredited assurance provider and does not provide verification, validation, certification, attestation, or assurance services under the GHG Protocol, ISO 14064, CARB regulations, CDP, ESRS, IFRS Sustainability Disclosure Standards, or any other reporting framework unless explicitly engaged under a separate written agreement.',
  'To the fullest extent permitted by law, ThemisIQ Compliance Inc. disclaims liability for any loss, damage, penalty, claim, enforcement action, regulatory finding, or other consequence arising from the use of or reliance upon this report.',
]

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
  totalsAR4: PdfTotals,
  totalsAR5: PdfTotals,
  totalsAR6: PdfTotals,
  frameworks: PdfFramework[],
  auditRows: PdfAuditRow[],
  efSources: { combustion: string; electricity: string; gwp_ar4: string; gwp_ar5: string; gwp_ar6?: string },
  residualRows: string[][] = []
) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const M = 48
  const refId = `TIQ-GHG-${inventory.reporting_year}-${Date.now().toString().slice(-6)}`
  const today = new Date().toLocaleDateString('en-CA')

  // ── PAGE 1 — COVER ──
  doc.setFillColor(INK); doc.rect(0, 0, W, 200, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text('THEMISIQ', M, 60)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor('#9ca3af')
  doc.text('Compliance Intelligence for Sustainable Business', M, 76)
  doc.setTextColor('#ffffff'); doc.setFont('helvetica', 'bold'); doc.setFontSize(24)
  doc.text('GHG Emissions', M, 130)
  doc.text('Assurance Package', M, 162)

  let y = 248
  doc.setTextColor(INK); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  const meta: [string, string][] = [
    ['Company', inventory.company_name || '—'],
    ['Reporting year', String(inventory.reporting_year)],
    ['Frameworks', frameworks.map(f => f.name).join(', ') || '—'],
    ['Boundary approach', boundaryLabel(inventory.boundary_approach)],
    ['Locations', String(inventory.locations.length)],
    ['Generated', today],
    ['Document ref', refId],
  ]
  meta.forEach(([k, v]) => {
    doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal')
    doc.text(k.toUpperCase(), M, y)
    doc.setTextColor(INK); doc.setFont('helvetica', 'bold')
    doc.text(v, M + 150, y)
    y += 26
  })

  y += 16
  doc.setDrawColor('#e8e7e4'); doc.line(M, y, W - M, y); y += 24
  doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
  const disclaimer = 'This package was generated by the ThemisIQ platform to support third-party verification under ISO 14064-3 / ISAE 3410. It documents the reporting entity, methodology, calculation workings, source-document index, and a tamper-evident audit trail. All emissions data requires independent third-party verification before formal submission. This document does not constitute assurance, legal advice, or a regulatory filing.'
  doc.text(doc.splitTextToSize(disclaimer, W - 2 * M), M, y)

  // ── PAGE 2 — EMISSIONS SUMMARY ──
  doc.addPage()
  sectionTitle(doc, 'Emissions Summary', M)
  const summaryRows = frameworks.map(f => {
    const t = f.gwp === 'AR6' ? totalsAR6 : f.gwp === 'AR5' ? totalsAR5 : totalsAR4
    const rev = inventory.revenue_millions
    return [
      f.name,
      `IPCC ${f.gwp}`,
      t.s1_total.toFixed(3),
      t.s2_location.toFixed(3),
      (f.id === 'esrs' || f.id === 'gri') ? t.s2_market.toFixed(3) : '—',
      rev > 0 ? (t.s1_total / rev).toFixed(4) : '—',
    ]
  })
  autoTable(doc, {
    startY: 92,
    head: [['Framework', 'GWP', 'Scope 1 (tCO2e)', 'Scope 2 loc. (tCO2e)', 'Scope 2 mkt. (tCO2e)', 'S1 intensity /\$M']],
    body: summaryRows,
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: '#ffffff', fontSize: 8 },
    bodyStyles: { fontSize: 9, textColor: '#333333' },
    margin: { left: M, right: M },
  })

  // ── PAGE 3 — METHODOLOGY ──
  doc.addPage()
  sectionTitle(doc, 'Methodology & Emission Factors', M)
  autoTable(doc, {
    startY: 92,
    head: [['Element', 'Basis']],
    body: [
      ['Organizational boundary', boundaryLabel(inventory.boundary_approach)],
      ['Combustion factors', efSources.combustion],
      ['Electricity factors', efSources.electricity],
      ['GWP values (AR4)', efSources.gwp_ar4],
      ['GWP values (AR5)', efSources.gwp_ar5],
      ...(efSources.gwp_ar6 ? [['GWP values (AR6)', efSources.gwp_ar6]] : []),
      ['Reporting year', String(inventory.reporting_year)],
      ['Standard', 'GHG Protocol Corporate Standard'],
    ],
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: '#ffffff', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: '#333333' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 160 } },
    margin: { left: M, right: M },
  })

  // Market-based Scope 2 residual-mix citation (only when ESRS/GRI is in scope).
  if (residualRows.length > 0) {
    const afterMethods = (doc as any).lastAutoTable?.finalY ?? 92
    doc.setTextColor(PURPLE); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
    doc.text('Market-based Scope 2 — Residual Mix', M, afterMethods + 30)
    doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal'); doc.setFontSize(8)
    doc.text(
      doc.splitTextToSize('Residual-mix factor applied to uncovered load; contractual (covered) kWh counted at zero. Per-location source and vintage below.', W - 2 * M),
      M, afterMethods + 44
    )
    autoTable(doc, {
      startY: afterMethods + 64,
      head: [['Location', 'Residual factor source', 'Vintage / note']],
      body: residualRows.map(r => r.map(cell =>
        (cell || '').replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4')
      )),
      theme: 'grid',
      headStyles: { fillColor: INK, textColor: '#ffffff', fontSize: 8 },
      bodyStyles: { fontSize: 7, textColor: '#333333' },
      columnStyles: { 0: { cellWidth: 90 }, 2: { cellWidth: 'auto' } },
      margin: { left: M, right: M },
    })
  }

  // ── PAGE 4 — SOURCE DOCUMENT INDEX ──
  doc.addPage()
  sectionTitle(doc, 'Source Document Index', M)
  const docRows: string[][] = []
  inventory.locations.forEach(loc => {
    (loc.source_docs || []).forEach(d => {
      docRows.push([loc.name || '—', d.document_type, d.file_name, (d.uploaded_at || '').slice(0, 10)])
    })
  })
  if (docRows.length === 0) docRows.push(['—', 'No documents uploaded', '—', '—'])
  autoTable(doc, {
    startY: 92,
    head: [['Location', 'Document type', 'File name', 'Uploaded']],
    body: docRows,
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: '#ffffff', fontSize: 9 },
    bodyStyles: { fontSize: 8, textColor: '#333333' },
    margin: { left: M, right: M },
  })

  // ── PAGE 5 — AUDIT TRAIL ──
  doc.addPage()
  sectionTitle(doc, 'Audit Trail', M)
  doc.setFontSize(8); doc.setTextColor(MUTE); doc.setFont('helvetica', 'normal')
  doc.text(`${auditRows.length} change(s) logged - append-only, tamper-evident record`, M, 86)
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
  if (auditBody.length === 0) auditBody.push(['—', 'No entries', '—', '—'])
  autoTable(doc, {
    startY: 98,
    head: [['Timestamp', 'Action', 'User', 'Change']],
    body: auditBody,
    theme: 'grid',
    headStyles: { fillColor: INK, textColor: '#ffffff', fontSize: 8 },
    bodyStyles: { fontSize: 7, textColor: '#333333' },
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
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor('#333333')
    DISCLAIMER_PARAS.forEach(par => {
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

  doc.save(`ThemisIQ_Assurance_${(inventory.company_name || 'Company').replace(/\s+/g, '_')}_${inventory.reporting_year}.pdf`)
}

function sectionTitle(doc: jsPDF, text: string, m: number) {
  doc.setTextColor('#7425e3'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text('THEMISIQ ASSURANCE PACKAGE', m, 48)
  doc.setTextColor('#0d0d0d'); doc.setFontSize(18)
  doc.text(text, m, 72)
}
