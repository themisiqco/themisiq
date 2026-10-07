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
// T10b: a DELIVERY-BASED fuel (propane, diesel or fleet fuel bought by delivery) is not checked month by month.
// Its deliveries are listed with their dates, and the one control is the completeness confirmation, which names
// the fuel, the site and the window. It is never estimated. "Estimate the missing months" is offered only when
// at least one month is covered, and an estimate the engine refuses is shown with its reason, never hidden.
//
// T15 (rule R6): the same document uploaded as two kinds of document (the same file, or the same figure, unit
// and dates) is shown under both uploads, with "Same document, count once" and "Not the same". Each records who
// chose it and when; export waits until one is chosen. Once chosen, the choice is shown. Each copy is named by its
// document type (T15-fix1): "Count the Diesel purchase record", never a file name both copies may share.
//
// All text here is shown to the customer: plain language, no em dash.

import { useState } from 'react'
import {
  findUnresolvedCoverage, billContributions, acceptedResolutions, analyzeCoverage, periodFromYearAndEnd,
  parseLocalDate, reportingYearLabel, fieldFor, FIELD_NAME, fleetTypeOfField, validateResolution, deliveriesStatement, dateInWords, proposalNeedsAttention,
  findExactDuplicates,
  type Location, type SourceDoc, type CoverageResolution, type CoveragePeriod,
} from '../../../../lib/ghg/engine'
import type { FleetType } from '@/lib/emissionFactors/mobile/types'
/** FI9 diff 4: the vehicle type in a coverage line ("Diesel in light vehicles: ..."). */
const FLEET_GROUP_WORDS: Record<FleetType, string> = { light: 'light vehicles', heavy: 'heavy vehicles', non_road: 'non-road equipment' }
import {
  sameBillResolution, differentMetersResolution, estimateResolution, usedNoneResolution,
  deliveriesCompleteResolution, resolutionKey, NO_MONTHS_TO_ESTIMATE, exactDuplicateCountOnce, exactDuplicateNotSame,
} from '../../../../lib/ghg/coverageActions'
import { unitLabel } from '../../../../lib/ghg/unitLabels'
import { docTypeLabel } from '../../../../lib/ghg/conciergeDocTypes'
import { formatActivity } from '../../../../lib/ghg/workingsCells'

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
  // T10b: removes a stored resolution the engine refuses (shown with its reason). Optional: without it the
  // refused estimate is still shown, with no control.
  onRemove?: (res: CoverageResolution) => void
}

const fuelName = (f: string) => f.replace(/_/g, ' ')
const now = () => new Date().toISOString()
const warnButton = { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: 'var(--color-state-warn)', color: '#fff', border: 'none', cursor: 'pointer' } as const
const plainButton = { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' } as const
const prompt = { fontWeight: 400, color: '#7c5a16' } as const
const row = { marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } as const

// The proposal Confirm button's style (page.tsx), so the deliveries confirmation reads as the same action.
const confirmButton = { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' } as const

/**
 * T10c: the deliveries confirmation. The statement is a checkbox the customer ticks, and "Confirm deliveries"
 * records it, enabled only once ticked. Its own component so each fuel keeps its own tick.
 */
function DeliveriesConfirm({ statement, enabled, onConfirm }: { statement: string; enabled: boolean; onConfirm: () => void }) {
  const [ticked, setTicked] = useState(false)
  const ready = enabled && ticked
  return (
    <div style={{ ...row, alignItems: 'flex-start' }}>
      <label style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontWeight: 400, color: '#0d0d0d', cursor: enabled ? 'pointer' : 'default', flex: '1 1 260px' }}>
        <input type="checkbox" checked={ticked} disabled={!enabled} onChange={e => setTicked(e.target.checked)} style={{ marginTop: 1 }} />
        <span>{statement}</span>
      </label>
      <button disabled={!ready} onClick={() => ready && onConfirm()} style={{ ...confirmButton, opacity: ready ? 1 : 0.5, cursor: ready ? 'pointer' : 'not-allowed' }}>Confirm deliveries</button>
    </div>
  )
}

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
  // FI9 diff 4: fleet-fuel bills are checked per vehicle type, as the engine's gate checks them.
  const groups = new Map<string, { fuelType: string; meterLabel: string | null; fleetType: FleetType | null; periods: CoveragePeriod[] }>()
  for (const c of contributions) {
    if (!(c.counted || c.reason === 'outside_year') || !c.periodStart || !c.periodEndExclusive) continue
    const d = docs.find(x => x.id === c.docId) as SourceDoc
    const prop = d.extracted![c.proposalIndex]
    const ft = fleetTypeOfField(c.field)
    const key = `${c.fuelType}|${c.meterLabel ?? ''}|${ft ?? ''}`
    const g = groups.get(key) ?? { fuelType: c.fuelType, meterLabel: c.meterLabel, fleetType: ft, periods: [] }
    g.periods.push({ docId: c.docId, pi: c.proposalIndex, start: parseLocalDate(prop.periodStart as string), end: parseLocalDate(prop.periodEnd as string) })
    groups.set(key, g)
  }
  // T10b: the delivery-based fuels of this upload, and their deliveries in date order.
  const deliveries = contributions
    .filter(c => c.deliveryDate && (c.counted || c.reason === 'outside_year'))
    .sort((a, b) => (a.deliveryDate as string).localeCompare(b.deliveryDate as string))
  const deliveryFuels = [...new Set(deliveries.map(c => c.fuelType))]
  const site = location.name || 'Location'
  // T10c: a fuel on this upload with bills still needing attention (to confirm, needs review, or confirmed
  // with no figure), so the estimate control can say to fix them first.
  const unsettled = (fuel: string) => docs.some(d => (d.extracted ?? []).some(x => x.fuelType === fuel
    && (x.status === 'extracted' || x.status === 'needs_manual_review' || proposalNeedsAttention(x))))
  // Estimates on this upload that the engine refuses: shown with the reason, so a click never vanishes.
  const refused = p.resolutions
    .filter(r => r.locId === location.id && r.kind === 'extrapolate' && (r.documentType ?? docType) === docType)
    .map(r => ({ r, reason: validateResolution(r, location) }))
    .filter((x): x is { r: CoverageResolution; reason: string } => x.reason !== null)

  const inGroup = (i: { fuelType: string; meterLabel?: string | null; documentType?: string; fleetType?: FleetType }, fuelType: string, meterLabel: string | null, fleetType: FleetType | null = null) =>
    i.documentType === docType && i.fuelType === fuelType && (i.meterLabel ?? null) === meterLabel && (i.fleetType ?? null) === fleetType

  // Issues that belong to this upload but not to a coverage group: the all-rejected question, and the
  // plain-language messages for bills that are not counted (their controls arrive in T9).
  const fieldsHere = new Set(docs.flatMap(d => (d.extracted ?? []).map(x => fieldFor(docType, x.fuelType, x.fleetType)?.amount)).filter(Boolean).map(String))
  const allRejected = issues.filter(i => i.status === 'all_rejected' && i.field && fieldsHere.has(i.field))
  const notices = issues.filter(i => ['undated', 'invalid_period', 'mixed_units', 'stream_off', 'no_value'].includes(i.status)
    && (i.docIds ?? []).some(id => docIdsHere.has(id)) && i.message)

  // Uploads with nothing read from them and no figure for any field they support (T10 ruling).
  const unread = issues.filter(i => i.status === 'none' && i.message && (i.docIds ?? []).some(id => docIdsHere.has(id)))
  // T15: exact duplicates with a document on this upload, answered or not. The message is the engine's issue.
  const duplicates = findExactDuplicates(location, p.resolutions).filter(x => x.docIds.some(id => docIdsHere.has(id)))
    .map(x => ({ x, issue: issues.find(i => i.status === 'exact_duplicate' && i.fuelType === x.fuelType
      && (i.docIds ?? []).length === 2 && x.docIds.every(id => (i.docIds ?? []).includes(id))) }))

  if (groups.size === 0 && allRejected.length === 0 && notices.length === 0 && unread.length === 0
    && deliveryFuels.length === 0 && refused.length === 0 && duplicates.length === 0) return null
  const yearText = reportingYearLabel(win).inText
  const many = groups.size > 1

  return (
    <>
      {[...groups.values()].map(g => {
        const cov = analyzeCoverage(g.periods, win.start, win.end)
        const gap = issues.find(i => i.status === 'gap' && inGroup(i, g.fuelType, g.meterLabel, g.fleetType))
        const overlaps = issues.filter(i => i.status === 'overlap' && inGroup(i, g.fuelType, g.meterLabel, g.fleetType))
        const resolved = !gap && overlaps.length === 0
        const tone = resolved ? { bg: '#E1F5EE', fg: '#0F6E56', icon: '✓' } : { bg: '#FEF3E2', fg: 'var(--color-state-warn)', icon: '⚠' }
        const prefix = many || g.meterLabel || g.fleetType ? `${fuelName(g.fuelType)}${g.fleetType ? ` in ${FLEET_GROUP_WORDS[g.fleetType]}` : ''}${g.meterLabel ? `, meter ${g.meterLabel}` : ''}: ` : ''
        const missing = cov.gaps.map(x => x.label).join(', ')
        // T10b: statements in a delivery-based field are counted for the days they cover; the field's
        // completeness is the deliveries confirmation below, not a count of months.
        const headline = deliveryFuels.includes(g.fuelType)
          ? 'Statements are counted for the days they cover.'
          : cov.status === 'full'
          ? 'All 12 months covered by bills.'
          : resolved && cov.issues.includes('gap')
            ? `${cov.monthsCovered} of 12 months from bills; the other ${12 - cov.monthsCovered} are estimated (${cov.pctEstimated}% of the total).`
            : `${cov.monthsCovered} of 12 months covered by bills.${missing ? ` Missing: ${missing}.` : ''}`
        const prorated = contributions.filter(c => c.reason === 'prorated' && c.fuelType === g.fuelType && (c.meterLabel ?? null) === g.meterLabel
          && fleetTypeOfField(c.field) === g.fleetType)
        return (
          <div key={`${g.fuelType}|${g.meterLabel ?? ''}|${g.fleetType ?? ''}`} style={{ marginTop: 8, background: tone.bg, borderRadius: 6, padding: '8px 10px', fontSize: 11, color: tone.fg, fontWeight: 600 }}>
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
            {gap && cov.monthsCovered >= 1 && (
              <div style={row}>
                <span style={prompt}>Upload the missing bill above, or:</span>
                <button style={warnButton} onClick={() => p.onAdd(estimateResolution({
                  locId: location.id, fuelType: g.fuelType, documentType: docType, meterLabel: g.meterLabel,
                  ...(g.fleetType ? { fleetType: g.fleetType } : {}),
                  monthsCovered: cov.monthsCovered, pctEstimated: cov.pctEstimated, at: now(),
                }))}>Estimate the missing months</button>
                {unsettled(g.fuelType) && <span style={prompt}>Fix any bills marked above before estimating.</span>}
              </div>
            )}
            {gap && cov.monthsCovered < 1 && (
              <div style={{ ...prompt, marginTop: 6 }}>{NO_MONTHS_TO_ESTIMATE}</div>
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
      {deliveryFuels.map(fuel => {
        const list = deliveries.filter(c => c.fuelType === fuel)
        const issue = issues.find(i => i.status === 'deliveries_unconfirmed' && i.documentType === docType && i.fuelType === fuel)
        const conf = p.resolutions.filter(r => r.locId === location.id && r.kind === 'deliveries_complete' && r.documentType === docType && r.fuelType === fuel).at(-1)
        const tone = issue ? { bg: '#FEF3E2', fg: 'var(--color-state-warn)', icon: '⚠' } : { bg: '#E1F5EE', fg: '#0F6E56', icon: '✓' }
        const statement = deliveriesStatement(fuelName(fuel), site, win)
        return (
          <div key={`deliveries|${fuel}`} style={{ marginTop: 8, background: tone.bg, borderRadius: 6, padding: '8px 10px', fontSize: 11, color: tone.fg, fontWeight: 600 }}>
            <div>{tone.icon} {issue ? issue.message : conf?.note}</div>
            <div style={{ marginTop: 4, fontWeight: 400, color: '#555553' }}>
              Deliveries are counted in full in the year they were delivered, not spread over months.
            </div>
            {list.map(c => (
              <div key={`${c.docId}:${c.proposalIndex}`} style={{ marginTop: 2, fontWeight: 400, color: '#555553' }}>
                {fileOf(c.docId)}: {formatActivity(c.value)} {unitLabel(c.unit, '')}, delivered {dateInWords(parseLocalDate(c.deliveryDate as string))}{c.counted ? '' : `, outside ${yearText} and not counted`}.
              </div>
            ))}
            {issue && (
              <DeliveriesConfirm statement={statement} enabled={!!p.currentUser}
                onConfirm={() => p.currentUser && p.onAdd(deliveriesCompleteResolution({
                  locId: location.id, fuelType: fuel, documentType: docType, docIds: issue.docIds ?? [], statement,
                  by: p.currentUser, at: now(),
                }))} />
            )}
          </div>
        )
      })}
      {refused.map(({ r, reason }) => (
        <div key={`refused|${resolutionKey(r)}`} style={{ marginTop: 8, background: '#FEF3E2', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--color-state-warn)', fontWeight: 600 }}>
          <div>⚠ An estimate was recorded but cannot be used: {reason}</div>
          {p.onRemove && (
            <div style={row}>
              <button style={plainButton} onClick={() => p.onRemove?.(r)}>Remove it</button>
            </div>
          )}
        </div>
      ))}
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
      {duplicates.map(({ x, issue }) => {
        const [a, b] = x.docIds
        const key = `duplicate|${x.fuelType}|${a}|${b}`
        if (!issue) return (
          <div key={key} style={{ marginTop: 8, background: '#E1F5EE', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>
            ✓ {x.resolution?.note}
          </div>
        )
        const by = p.currentUser
        const off = { opacity: by ? 1 : 0.5 }
        // T15-fix1: a copy is named by its document type. The commonest duplicate is one file uploaded twice,
        // so a file name cannot tell the two copies apart; the buttons always say which kind of record counts.
        const copy = (id: string) => ({ id, file: fileOf(id), documentType: location.source_docs.find(d => d.id === id)?.document_type ?? '' })
        return (
          <div key={key} style={{ marginTop: 8, background: '#FEF3E2', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--color-state-warn)', fontWeight: 600 }}>
            <div>⚠ {issue.message}</div>
            <div style={row}>
              <span style={prompt}>Same document, count once:</span>
              {[[a, b], [b, a]].map(([counted, excluded]) => (
                <button key={counted} style={{ ...plainButton, ...off }} disabled={!by} onClick={() => by && p.onAdd(exactDuplicateCountOnce({
                  locId: location.id, fuelType: x.fuelType, by, at: now(),
                  counted: copy(counted), excluded: copy(excluded),
                }))}>Count the {docTypeLabel(copy(counted).documentType)}</button>
              ))}
              <button style={{ ...plainButton, ...off }} disabled={!by} onClick={() => by && p.onAdd(exactDuplicateNotSame({
                locId: location.id, fuelType: x.fuelType, by, at: now(),
                docs: [copy(a), copy(b)],
              }))}>Not the same</button>
            </div>
          </div>
        )
      })}
      {notices.map((i, k) => (
        <div key={`notice|${k}`} style={{ marginTop: 8, background: '#FEF3E2', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: 'var(--color-state-warn)', fontWeight: 600 }}>
          ⚠ {i.message}
        </div>
      ))}
    </>
  )
}
