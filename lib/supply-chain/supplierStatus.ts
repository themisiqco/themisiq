// lib/supply-chain/supplierStatus.ts
//
// ONE AUTHORITY FOR WHAT A SUPPLIER'S QUESTIONNAIRE STATUS IS CALLED, in the two registers it is
// needed in: a badge label for the buyer's campaign screen, and a sentence for the uncovered list that
// a verifier reads.
//
// ⚠️ WHY THIS EXISTS RATHER THAN A SECOND MAP. app/api/campaigns/[id]/scope3-cat1/route.ts interpolated
// the RAW ENUM into verifier-facing prose: `Questionnaire ${s.status} - no allocated figure submitted
// yet` produced "Questionnaire in_progress", underscore and all, in the reason a verifier is given for
// a supplier being absent from a Category 1 total. The labels already existed, as STATUS_CONFIG in
// app/dashboard/supply-chain/portal/[id]/page.tsx, so the defect was not a missing translation but a
// translation the route could not reach. Adding a second copy beside the route would have fixed the
// symptom and created the next drift, which is what happened to the questionnaire definition itself
// (68 of 75 labels disagreed before it was collapsed into one file).
//
// ⚠️ THE SENTENCE IS NOT THE LABEL, AND BOTH LIVE HERE ON PURPOSE. "In progress" is right on a badge
// and wrong mid-sentence: "Questionnaire In progress" reads as broken English, and lower-casing a
// display label to force it into prose is how a label that later gains a proper noun breaks a sentence
// somewhere nobody is looking. So each status carries both forms, and there is still exactly one place
// to change either.
//
// ⚠️ THESE SENTENCES ARE FROZEN INTO scope3_category_snapshots.uncovered AT ACCEPTANCE. Rewording them
// changes what LATER snapshots say and must never change an earlier one: the table is immutable by
// design and a correction is a new snapshot superseding the old, which means restating a filed figure.
// See the note at the call site in the route.
//
// The colours travel with the labels because STATUS_CONFIG already coupled them and splitting the two
// would recreate the problem this file solves. They are presentation and only the badge reads them.

export type SupplierStatus = 'invited' | 'in_progress' | 'completed' | 'expired'

interface SupplierStatusCopy {
  /** Badge label. Title case, for a chip and never for the middle of a sentence. */
  label: string
  color: string
  bg: string
  /**
   * Why this supplier contributes nothing to a Category 1 total, as a whole sentence.
   *
   * Reached only when the supplier reported no allocated figure AND the buyer recorded no spend, so
   * every one of the four says that much; the status supplies why no figure arrived.
   *
   * "yet" appears only where the buyer can change the outcome by the same route: a reminder can still
   * produce a figure from an invited or an in-progress supplier. A supplier who submitted without one,
   * or whose invitation expired, will not answer differently for being asked again the same way.
   */
  noFigureReason: string
}

export const SUPPLIER_STATUS: Record<SupplierStatus, SupplierStatusCopy> = {
  invited: {
    label: 'Invited', color: '#0C447C', bg: '#E6F1FB',
    noFigureReason:
      'The questionnaire was sent and has not been opened. No allocated figure and no spend are recorded for this supplier yet.',
  },
  in_progress: {
    label: 'In progress', color: 'var(--color-state-warn)', bg: '#FEF3E2',
    noFigureReason:
      'The questionnaire has been opened but not submitted. No allocated figure and no spend are recorded for this supplier yet.',
  },
  completed: {
    label: 'Completed', color: '#0F6E56', bg: '#E1F5EE',
    noFigureReason:
      'The questionnaire was submitted without an allocated emissions figure, and no spend is recorded for this supplier.',
  },
  expired: {
    label: 'Expired', color: 'var(--color-ink-muted)', bg: '#f8f7f5',
    noFigureReason:
      'The questionnaire invitation expired before it was submitted. No allocated figure and no spend are recorded for this supplier.',
  },
}

const isKnown = (s: string): s is SupplierStatus => s in SUPPLIER_STATUS

/**
 * ⚠️ AN UNRECOGNISED STATUS IS REPORTED AS GIVEN AND NOT INTERPRETED, which is the same treatment an
 * off-list supplier answer gets in lib/scope3/supplierAssurance.ts. campaign_suppliers.status carries a
 * CHECK constraint naming exactly these four, so today this is unreachable; it is written anyway
 * because the fallback is the one branch nobody tests by using the product, and because the constraint
 * is one migration away from admitting a fifth value. Quoting the raw value is deliberate: it is the
 * only honest thing to say about a status we cannot describe, and it is visibly not a description.
 */
export function noFigureReasonForStatus(status: string): string {
  if (isKnown(status)) return SUPPLIER_STATUS[status].noFigureReason
  return `The questionnaire status is recorded as "${status}", which is not a status this platform recognises. ` +
    'No allocated figure and no spend are recorded for this supplier.'
}

/** Badge label, falling back to the raw value rather than crashing or rendering nothing. */
export function supplierStatusLabel(status: string): string {
  return isKnown(status) ? SUPPLIER_STATUS[status].label : status
}

/** Badge colours, muted for a status we cannot describe so it does not read as a normal state. */
export function supplierStatusTone(status: string): { color: string; bg: string } {
  return isKnown(status)
    ? { color: SUPPLIER_STATUS[status].color, bg: SUPPLIER_STATUS[status].bg }
    : { color: 'var(--color-ink-muted)', bg: '#f8f7f5' }
}
