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

import { acceptanceProblem, type ExtractedProposal } from './engine'
import { convertToCanonical, type FuelType } from '../unitConversions'

export type Editor = { userId: string; email: string }
type Patch = Partial<ExtractedProposal>

const asReadOf = (p: ExtractedProposal): ExtractedProposal['asRead'] =>
  p.asRead ?? { periodStart: p.periodStart, periodEnd: p.periodEnd, unit: p.rawUnit }

const withCorrection = (p: ExtractedProposal, fields: ('period' | 'unit')[], by: Editor, at: string): Patch => ({
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
  return {
    periodStart: a.start,
    periodEnd: a.end,
    periodOrigin: 'customer_confirmed',
    periodConfirmedAt: a.at,
    periodConfirmedBy: a.by,
    ...(changed ? withCorrection(p, ['period'], a.by, a.at) : {}),
    ...(a.confirm ? { status: 'confirmed' as const } : {}),
  }
}

/**
 * The customer says what unit the bill is really in. rawUnit becomes that unit and the canonical value and
 * unit are recomputed from the unchanged rawValue. A unit the conversion cannot handle leaves the proposal
 * needing manual review, as at extraction, with no figure guessed.
 */
export function editUnit(p: ExtractedProposal, a: { unit: string; by: Editor; at: string }): Patch {
  const conv = convertToCanonical(p.fuelType as FuelType, p.rawValue ?? p.value, a.unit)
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
  const status = before === 'confirmed' && acceptanceProblem(p) !== null ? 'extracted' : before
  return {
    status,
    statusLog: [...(p.statusLog ?? []), { action: 'undone', at: a.at, by: a.by, statusBefore: 'rejected' }],
  }
}

/**
 * Every patch the page applies passes through here (R5). A patch that would confirm a proposal the
 * acceptance validator refuses has its status change dropped; everything else in it is kept.
 */
export function guardConfirm(p: ExtractedProposal, patch: Patch): Patch {
  if (patch.status !== 'confirmed') return patch
  if (acceptanceProblem({ ...p, ...patch }) === null) return patch
  const rest = { ...patch }
  delete rest.status
  return rest
}
