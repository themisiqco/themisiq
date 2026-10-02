// app/dashboard/ghg/_components/CoverageStrip.tsx
//
// THE COVERAGE STRIP UNDER EACH DOCUMENT UPLOAD (T8). It renders the ENGINE's issues for this document type,
// never a second analysis of its own: findUnresolvedCoverage decides what is wrong, and this component only
// shows it and offers the controls that answer it. Every control writes a resolution built in
// lib/ghg/coverageActions.ts, in the shape validateResolution accepts.
//
// One block per coverage group, (fuel, meter), the same key the engine uses (T3). A straddling bill is not
// an issue: it is prorated by its own days, and the strip says so with the share (T2). The old "this year",
// "next year" and "Confirm not a duplicate" buttons are gone; the engine ignored what they wrote.
//
// All text here is shown to the customer: plain language, no em dash.

import { useState } from 'react'
import {
  findUnresolvedCoverage, billContributions, acceptedResolutions, analyzeCoverage, periodFromYearAndEnd,
  parseLocalDate, reportingYearLabel, fieldFor, FIELD_NAME,
  type Location, type SourceDoc, type CoverageResolution, type CoveragePeriod,
} from '../../../../lib/ghg/engine'
import {
  sameBillResolution, differentMetersResolution, estimateResolution, usedNoneResolution,
} from '../../../../lib/ghg/coverageActions'

export type CurrentUser = { userId: string; email: string }

export type CoverageStripProps = {
  location: Location               // the stored location, all document types (the engine needs them all)
  docType: string                  // the upload this strip sits under
  reportingYear: number
  fiscalYearEndMonth: number
  resolutions: CoverageResolution[]
  currentUser: CurrentUser | null  // who confirms "used none"; the control is disabled without one
  onAdd: (res: CoverageResolution) => void
  // Writes the document's meter label and its different_meters resolution in ONE update, so the
  // resolution never exists without the label it must match.
  onLabelMeter: (docId: string, label: string, res: CoverageResolution) => void
  onEnterManually: (field: string) => void
}

const fuelName = (f: string) => f.replace(/_/g, ' ')
const now = () => new Date().toISOString()
const warnButton = { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--color-state-warn)', color: '#fff', border: 'none', cursor: 'pointer' } as const
const plainButton = { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' } as const
const prompt = { fontWeight: 400, color: '#7c5a16' } as const
const row = { marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as const

/** The meter-name input for one overlap. Its own component so each overlap keeps its own text. */
function DifferentMeters({ fileB, onSave }: { fileB: string; onSave: (label: string) => void }) {
  const [label, setLabel] = useState('')
  return (
    <div style={row}>
      <span style={prompt}>If they&apos;re for different meters or accounts, name the second one:</span>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder={`Meter or account for ${fileB}`}
        style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: '0.5px solid #e8e7e4', minWidth: 180 }} />
      <button disabled={!label.trim()} onClick={() => onSave(label.trim())} style={{ ...plainButton, opacity: label.trim() ? 1 : 0.5 }}>Save</button>
    </div>
  )
}

export function CoverageStrip(p: CoverageStripProps) {
  const { location, docType } = p
  const win = periodFromYearAndEnd(p.reportingYear, p.fiscalYearEndMonth)
  const docs = location.source_docs.filter(d => d.document_type === docType)
  const docIdsHere = new Set(docs.map(d => d.id))
  const fileOf = (id: string) => location.source_docs.find(d => d.id === id)?.file_name ?? id
  const issues = findUnresolvedCoverage([location], p.reportingYear, p.fiscalYearEndMonth, p.resolutions)
  const contributions = billContributions(location, acceptedResolutions(location, p.resolutions), win)
    .filter(c => docIdsHere.has(c.docId))

  // Coverage groups for this document type, as the engine forms them: counted or outside-the-year bills
  // with a usable period, keyed by fuel and meter.
  const groups = new Map<string, { fuelType: string; meterLabel: string | null; periods: CoveragePeriod[] }>()
  for (const c of contributions) {
    if (!(c.counted || c.reason === 'outside_year') || !c.periodStart || !c.periodEndExclusive) continue
    const d = docs.find(x => x.id === c.docId) as SourceDoc
    const prop = d.extracted![c.proposalIndex]
    const key = `${c.fuelType}|${c.meterLabel ?? ''}`
    const g = groups.get(key) ?? { fuelType: c.fuelType, meterLabel: c.meterLabel, periods: [] }
    g.periods.push({ docId: c.docId, pi: c.proposalIndex, start: parseLocalDate(prop.periodStart as string), end: parseLocalDate(prop.periodEnd as string) })
    groups.set(key, g)
  }
  const inGroup = (i: { fuelType: string; meterLabel?: string | null; documentType?: string }, fuelType: string, meterLabel: string | null) =>
    i.documentType === docType && i.fuelType === fuelType && (i.meterLabel ?? null) === meterLabel

  // Issues that belong to this upload but not to a coverage group: the all-rejected question, and the
  // plain-language messages for bills that are not counted (their controls arrive in T9).
  const fieldsHere = new Set(docs.flatMap(d => (d.extracted ?? []).map(x => fieldFor(docType, x.fuelType)?.amount)).filter(Boolean).map(String))
  const allRejected = issues.filter(i => i.status === 'all_rejected' && i.field && fieldsHere.has(i.field))
  const notices = issues.filter(i => ['undated', 'invalid_period', 'mixed_units', 'stream_off'].includes(i.status)
    && (i.docIds ?? []).some(id => docIdsHere.has(id)) && i.message)

  // Uploads with nothing read from them and no figure for any field they support (T10 ruling).
  const unread = issues.filter(i => i.status === 'none' && i.message && (i.docIds ?? []).some(id => docIdsHere.has(id)))

  if (groups.size === 0 && allRejected.length === 0 && notices.length === 0 && unread.length === 0) return null
  const yearText = reportingYearLabel(win).inText
  const many = groups.size > 1

  return (
    <>
      {[...groups.values()].map(g => {
        const cov = analyzeCoverage(g.periods, win.start, win.end)
        const gap = issues.find(i => i.status === 'gap' && inGroup(i, g.fuelType, g.meterLabel))
        const overlaps = issues.filter(i => i.status === 'overlap' && inGroup(i, g.fuelType, g.meterLabel))
        const resolved = !gap && overlaps.length === 0
        const tone = resolved ? { bg: '#E1F5EE', fg: '#0F6E56', icon: '✓' } : { bg: '#FEF3E2', fg: 'var(--color-state-warn)', icon: '⚠' }
        const prefix = many || g.meterLabel ? `${fuelName(g.fuelType)}${g.meterLabel ? `, meter ${g.meterLabel}` : ''}: ` : ''
        const missing = cov.gaps.map(x => x.label).join(', ')
        const headline = cov.status === 'full'
          ? 'All 12 months covered by bills.'
          : resolved && cov.issues.includes('gap')
            ? `${cov.monthsCovered} of 12 months from bills; the other ${12 - cov.monthsCovered} are estimated (${cov.pctEstimated}% of the total).`
            : `${cov.monthsCovered} of 12 months covered by bills.${missing ? ` Missing: ${missing}.` : ''}`
        const prorated = contributions.filter(c => c.reason === 'prorated' && c.fuelType === g.fuelType && (c.meterLabel ?? null) === g.meterLabel)
        return (
          <div key={`${g.fuelType}|${g.meterLabel ?? ''}`} style={{ marginTop: 8, background: tone.bg, borderRadius: 6, padding: '8px 10px', fontSize: 11, color: tone.fg, fontWeight: 600 }}>
            <div>{tone.icon} {prefix}{headline}</div>
            {cov.outOfWindow.length > 0 && (
              <div style={{ marginTop: 4, fontWeight: 400, color: '#555553' }}>
                {cov.outOfWindow.length === 1 ? '1 bill falls' : `${cov.outOfWindow.length} bills fall`} outside {yearText} and {cov.outOfWindow.length === 1 ? 'is' : 'are'} not counted: {cov.outOfWindow.map(o => o.label).join(', ')}.
              </div>
            )}
            {prorated.map(c => (
              <div key={`${c.docId}:${c.proposalIndex}`} style={{ marginTop: 4, fontWeight: 400, color: '#555553' }}>
                {fileOf(c.docId)} crosses into another year: {c.inWindowDays} of its {c.totalDays} days are in {yearText}, so {((c.share ?? 0) * 100).toFixed(1)}% of the bill is counted.
              </div>
            ))}
            {gap && (
              <div style={row}>
                <span style={prompt}>Upload the missing bill above, or:</span>
                <button style={warnButton} onClick={() => p.onAdd(estimateResolution({
                  locId: location.id, fuelType: g.fuelType, documentType: docType, meterLabel: g.meterLabel,
                  monthsCovered: cov.monthsCovered, pctEstimated: cov.pctEstimated, at: now(),
                }))}>Estimate the missing months</button>
              </div>
            )}
            {overlaps.map(o => {
              const [a, b] = o.docIds as [string, string]
              return (
                <div key={`${a}|${b}`} style={{ marginTop: 6 }}>
                  <div style={prompt}>{o.message}</div>
                  <div style={row}>
                    <span style={prompt}>If these are the same bill, count it once:</span>
                    {[[a, b], [b, a]].map(([counted, excluded]) => (
                      <button key={counted} style={plainButton} onClick={() => p.onAdd(sameBillResolution({
                        locId: location.id, fuelType: g.fuelType, at: now(),
                        counted: { id: counted, file: fileOf(counted) }, excluded: { id: excluded, file: fileOf(excluded) },
                      }))}>Count {fileOf(counted)}</button>
                    ))}
                  </div>
                  <DifferentMeters fileB={fileOf(b)} onSave={label => p.onLabelMeter(b, label, differentMetersResolution({
                    locId: location.id, fuelType: g.fuelType, doc: { id: b, file: fileOf(b) }, meterLabel: label, at: now(),
                  }))} />
                </div>
              )
            })}
          </div>
        )
      })}
      {allRejected.map(i => (
        <div key={`rejected|${i.field}`} style={{ marginTop: 8, background: '#FEF3E2', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--color-state-warn)', fontWeight: 600 }}>
          <div>⚠ {i.message}</div>
          <div style={row}>
            <button style={warnButton} onClick={() => p.onEnterManually(i.field as string)}>Enter the figure manually</button>
            <button style={{ ...plainButton, opacity: p.currentUser ? 1 : 0.5 }} disabled={!p.currentUser}
              onClick={() => p.currentUser && p.onAdd(usedNoneResolution({
                locId: location.id, fuelType: i.fuelType, field: i.field as string, fuelName: fuelName(i.fuelType), by: p.currentUser, at: now(),
              }))}>Confirm this site used no {fuelName(i.fuelType)}</button>
          </div>
        </div>
      ))}
      {unread.map(i => (
        <div key={`unread|${(i.docIds ?? []).join(',')}`} style={{ marginTop: 8, background: '#FEF3E2', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--color-state-warn)', fontWeight: 600 }}>
          <div>⚠ {i.message}</div>
          <div style={row}>
            <button style={warnButton} onClick={() => p.onEnterManually((i.fields ?? [])[0])}>Enter the figure manually</button>
            {(i.fields ?? []).map(f => (
              <button key={f} style={{ ...plainButton, opacity: p.currentUser ? 1 : 0.5 }} disabled={!p.currentUser}
                onClick={() => p.currentUser && p.onAdd(usedNoneResolution({
                  locId: location.id, fuelType: i.fuelType || f, field: f, fuelName: FIELD_NAME[f] ?? f, by: p.currentUser, at: now(),
                }))}>Confirm this site used no {FIELD_NAME[f] ?? f}</button>
            ))}
          </div>
        </div>
      ))}
      {notices.map((i, k) => (
        <div key={`notice|${k}`} style={{ marginTop: 8, background: '#FEF3E2', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--color-state-warn)', fontWeight: 600 }}>
          ⚠ {i.message}
        </div>
      ))}
    </>
  )
}
