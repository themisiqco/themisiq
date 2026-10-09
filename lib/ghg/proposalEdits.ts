// lib/ghg/proposalEdits.ts
//
// WHAT A CUSTOMER'S EDIT TO A PROPOSAL WRITES (T9). Pure: no React, no clock (the caller passes the time),
// no Supabase. Each function returns the PATCH the page merges into one proposal, so an edit can never
// touch another proposal.
//
// Rulings (docs/review/design-derived-figures.md section 10, T9):
//   - The first change to the dates or the unit keeps what was READ from the bill in `asRead`, and every
//     change appends `{ fields, at, by }` to `corrections`. Verbatim source values are never lost.
//   - Correcting the unit corrects the BILL's unit (rawUnit) and re-converts the unchanged rawValue through
//     convertToCanonical, the same audited conversion as at extraction. It never relabels the converted unit.
//   - Rule R5: a month-only proposal cannot be confirmed until the customer confirms or corrects its dates.
//
// T18 (design section 10, "T18" rows): Confirm, Edit figure and Flag for review record who and when too.
//   - Every confirmation appends to `confirmations` the reading exactly as it was shown when accepted, both as
//     printed on the bill (rawValue, rawUnit) and as converted (value, unit), with its dates and source quote.
//   - Edit figure keeps the value as read in `asRead` and appends a correction `{ fields: ['value'] }`.
//   - Flag for review appends `{ action: 'flagged' }` to `statusLog`.
//   - Edit unit on a reading whose figure the customer typed clears that figure and asks for it in the new unit.

import { acceptanceProblem, valueProblem, fleetTypeProblem, type ExtractedProposal, type Confirmation } from './engine'
import type { FleetType } from '../emissionFactors/mobile/types'
import { convertToCanonical, normalizeUnit, type FuelType } from '../unitConversions'

export type Editor = { userId: string; email: string }
type Patch = Partial<ExtractedProposal>

/**
 * What was read from the bill, kept the first time anything is changed. T18 adds the value as read, both as
 * printed (rawValue) and as converted (value). An asRead kept before T18 has the dates and unit only; it gains
 * them on its next change. rawValue is never edited, so it is still the value as read. The converted value is
 * the current one unless the unit was corrected, in which case it is recomputed from the unit as read, through
 * the same conversion as at extraction.
 */
const asReadOf = (p: ExtractedProposal): NonNullable<ExtractedProposal['asRead']> => {
  const r = p.asRead ?? { periodStart: p.periodStart, periodEnd: p.periodEnd, unit: p.rawUnit }
  if (r.value !== undefined) return r
  const unitCorrected = (p.corrections ?? []).some(c => c.fields.includes('unit'))
  const value = unitCorrected ? convertToCanonical(p.fuelType as FuelType, p.rawValue, r.unit).value : p.value
  return { ...r, value, rawValue: p.rawValue }
}

const withCorrection = (p: ExtractedProposal, fields: ('period' | 'unit' | 'value')[], by: Editor, at: string): Patch => ({
  asRead: asReadOf(p),
  corrections: [...(p.corrections ?? []), { fields, at, by }],
})

/**
 * The customer enters, corrects or confirms the billing dates. Always records who confirmed them and when
 * (periodOrigin customer_confirmed). A change of either date is also a correction, with the original kept.
 * `confirm` also accepts the proposal: this is the month-only confirmation step at acceptance (R5).
 */
export function editPeriod(p: ExtractedProposal, a: { start: string; end: string; by: Editor; at: string; confirm?: boolean }): Patch {
  const changed = a.start !== p.periodStart || a.end !== p.periodEnd
  const patch: Patch = {
    periodStart: a.start,
    periodEnd: a.end,
    periodOrigin: 'customer_confirmed',
    periodConfirmedAt: a.at,
    periodConfirmedBy: a.by,
    ...(changed ? withCorrection(p, ['period'], a.by, a.at) : {}),
  }
  // T18: confirming here is a confirmation like any other, recorded with the dates just confirmed.
  return a.confirm ? { ...patch, ...confirmProposal({ ...p, ...patch }, { by: a.by, at: a.at }) } : patch
}

/**
 * T18: "Confirm". Sets the status and appends to `confirmations` the reading exactly as shown when accepted.
 * The page passes the patch through guardConfirm, which drops the confirmation with the status when the
 * proposal cannot be confirmed (R5, T10a, FI9), so no confirmation is recorded that did not happen. Undo and a
 * later confirmation append; nothing is overwritten. A delivery records its delivery date as well, since that is
 * the date shown for it.
 */
export function confirmProposal(p: ExtractedProposal, a: { by: Editor; at: string }): Patch {
  const reading: Confirmation['reading'] = {
    value: p.value, unit: p.unit, rawValue: p.rawValue, rawUnit: p.rawUnit,
    periodStart: p.periodStart, periodEnd: p.periodEnd, sourceQuote: p.sourceQuote,
    ...(p.deliveryDate ? { deliveryDate: p.deliveryDate } : {}),
  }
  return { status: 'confirmed', confirmations: [...(p.confirmations ?? []), { at: a.at, by: a.by, reading }] }
}

/**
 * T18: "Edit figure". The customer's figure replaces the converted value, in the unit shown beside it. The value
 * as read is kept in `asRead` the first time, a correction `{ fields: ['value'] }` is appended, and the proposal is
 * confirmed with the edited reading, as the Save button always did.
 */
export function editFigure(p: ExtractedProposal, a: { value: number; by: Editor; at: string }): Patch {
  const patch: Patch = { value: a.value, ...withCorrection(p, ['value'], a.by, a.at) }
  return { ...patch, ...confirmProposal({ ...p, ...patch }, { by: a.by, at: a.at }) }
}

/** T18: "Flag for review". The reading needs a second look; who flagged it, when and its status before are kept. */
export function flagProposal(p: ExtractedProposal, a: { by: Editor; at: string }): Patch {
  return {
    status: 'needs_manual_review',
    statusLog: [...(p.statusLog ?? []), { action: 'flagged', at: a.at, by: a.by, statusBefore: p.status }],
  }
}

/**
 * The customer says what unit the bill is really in. rawUnit becomes that unit and the canonical value and
 * unit are recomputed from the unchanged rawValue. A unit the conversion cannot handle leaves the proposal
 * needing manual review, as at extraction, with no figure guessed.
 */
export function editUnit(p: ExtractedProposal, a: { unit: string; by: Editor; at: string }): Patch {
  const conv = convertToCanonical(p.fuelType as FuelType, p.rawValue ?? p.value, a.unit)
  // T18: the figure was typed by the customer (a value correction), so recomputing from the printed figure would
  // replace it, and keeping it would relabel it. As for any unit change (CLAUDE.md), the figure is cleared and
  // asked for again in the new unit: the reading goes back to "To confirm" with no figure, and is an unpriced line
  // naming the document until the figure is entered or the bill is rejected.
  if ((p.corrections ?? []).some(c => c.fields.includes('value'))) {
    const figureCleared = { value: p.value, unit: p.unit, toUnit: conv.unit ?? normalizeUnit(a.unit) ?? a.unit }
    return {
      rawUnit: a.unit,
      value: null,
      unit: figureCleared.toUnit,
      conversionNote: undefined,
      status: 'extracted',
      asRead: asReadOf(p),
      corrections: [...(p.corrections ?? []), { fields: ['unit'], at: a.at, by: a.by, figureCleared }],
    }
  }
  return {
    rawUnit: a.unit,
    value: conv.value,
    unit: conv.unit,
    conversionNote: conv.conversionNote,
    ...(conv.tier === 3 ? { status: 'needs_manual_review' as const } : {}),
    ...withCorrection(p, ['unit'], a.by, a.at),
  }
}

/**
 * "Reject": the bill is not counted, and stays on its document as evidence. Records who, when and the status
 * it had, so Undo can put it back. Allowed from any status in review, pending or confirmed.
 */
export function rejectProposal(p: ExtractedProposal, a: { by: Editor; at: string }): Patch {
  return {
    status: 'rejected',
    statusLog: [...(p.statusLog ?? []), { action: 'rejected', at: a.at, by: a.by, statusBefore: p.status }],
  }
}

/**
 * "Undo": the bill returns to the status it had before it was rejected, and the undo is recorded too. A bill
 * confirmed on month-only dates that were never confirmed (saved before T9) goes back to "To confirm"
 * instead, so Undo can never get round the month-only confirmation (R5).
 */
export function undoRejection(p: ExtractedProposal, a: { by: Editor; at: string }): Patch {
  const last = [...(p.statusLog ?? [])].reverse().find(e => e.action === 'rejected')
  const before = last?.statusBefore ?? 'extracted'
  // T10a: a bill with no figure goes back to "Needs review", since it cannot be confirmed.
  const status = before === 'confirmed' && valueProblem(p) !== null ? 'needs_manual_review'
    : before === 'confirmed' && acceptanceProblem(p) !== null ? 'extracted' : before
  return {
    status,
    statusLog: [...(p.statusLog ?? []), { action: 'undone', at: a.at, by: a.by, statusBefore: 'rejected' }],
  }
}

/**
 * Every patch the page applies passes through here (R5). A patch that would confirm a proposal the
 * acceptance validator refuses has its status change dropped; everything else in it is kept.
 */
export function guardConfirm(p: ExtractedProposal, patch: Patch, docType = ''): Patch {
  if (patch.status !== 'confirmed') return patch
  // T10a: nor a proposal with no figure. "Edit figure" passes, because its patch carries the figure.
  // FI9 diff 4: nor a fleet-fuel reading with no vehicle type.
  if (acceptanceProblem({ ...p, ...patch }) === null && valueProblem({ ...p, ...patch }) === null
    && fleetTypeProblem(docType, { ...p, ...patch }) === null) return patch
  // T18: the confirmation record goes with the status, so a refused confirmation is never recorded as made.
  const rest = { ...patch }
  delete rest.status
  delete rest.confirmations
  return rest
}

/**
 * FI9 diff 4 (ruling R16): the review chooser, "Vehicles: Light / Heavy / Non-road". Sets the reading's vehicle type and
 * records who chose it and when. A first choice on a reading made before FI9 moves it (and its figure) from the legacy
 * field to the type's field and keeps its status. Changing a type already chosen on a confirmed reading un-confirms it,
 * as a date edit does, because the figure now lands on another field.
 */
export function chooseFleetType(p: ExtractedProposal, to: FleetType, a: { by: Editor; at: string }): Patch {
  if (p.fleetType === to) return {}
  const from = p.fleetType ?? null
  return {
    fleetType: to,
    fleetTypeLog: [...(p.fleetTypeLog ?? []), { from, to, at: a.at, by: a.by }],
    ...(from !== null && p.status === 'confirmed' ? { status: 'extracted' as const } : {}),
  }
}
