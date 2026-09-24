// lib/scope3/supplierAssurance.ts
//
// WHETHER A SUPPLIER'S OWN EMISSIONS REPORTING CARRIES THIRD-PARTY ASSURANCE, as a value a
// Category 1 line can hold and a snapshot can freeze.
//
// The questionnaire has asked this since the scope3 template existed and nothing has ever read it:
// s3_assurance was collected, stored, displayed to the buyer as one row among 35, and dropped on the
// floor everywhere a figure was computed. For a limited assurance engagement it is the first thing
// asked about a supplier-reported number, so a snapshot that records the basis of a figure and not
// this is missing the more important of the two.
//
// ⚠️ THE FIELD DESCRIBES THE SUPPLIER'S REPORTING, NOT THIS LINE'S FIGURE, AND NO STRING IN THIS FILE
// SAYS OTHERWISE. The question is "Are your emissions figures independently assured?". A supplier may
// hold limited assurance over their group Scope 1 and 2 while the slice they attributed to this buyer
// is an unassured internal allocation. So the answer supports "the supplier states their emissions
// figures carry limited assurance" and NEVER "this line is assured". Every sentence below attributes
// to the supplier for that reason, and ASSURANCE_SCOPE_NOTE is the caveat a surface prints once.

import type { SnapshotLine } from './categorySnapshot'

// ⚠️ EIGHT MEMBERS, AND NOT ONE OF THEM MEANS "WE DID NOT RECORD THIS". That absence is carried by the
// KEY being missing from a line, which is how a snapshot written before this field existed stays
// readable as exactly that. Adding a member here that means "unknown whether recorded" would make the
// presence of the key ambiguous again and break the inference. A test asserts it.
export type AssuranceState =
  | 'limited'          // supplier selected 'Yes — limited assurance'
  | 'reasonable'       // supplier selected 'Yes — reasonable assurance'
  | 'internal_only'    // supplier selected 'No — internal only'
  | 'no_measurement'   // supplier selected 'No measurement'
  | 'not_answered'     // the questionnaire asked; the supplier left it blank
  | 'not_asked'        // the campaign's template has no assurance question, and no answer exists
  | 'unrecognised'     // a value outside the option list reached the database
  | 'not_applicable'   // a spend-based line: the figure did not come from the supplier's reporting

// ⚠️ EXACT STRINGS FROM lib/supply-chain/templates.ts, EM-DASHES INCLUDED, AND NO FUZZY MATCHING.
// The option list is enforced nowhere: supplier_responses.response is text and portal_save_response
// validates nothing, so any string can arrive from anyone holding the token. An off-list value
// therefore becomes 'unrecognised' and is reported as given rather than mapped to its nearest
// neighbour. Same rule as the unit conversion cascade, which flags needs_manual_review rather than
// guessing, and the same reason: a near-match here would silently bracket 'reasonable assurance' with
// 'limited assurance', and the difference between those two is the entire point of the field.
const STATE_BY_ANSWER: Record<string, AssuranceState> = {
  'Yes — limited assurance':    'limited',
  'Yes — reasonable assurance': 'reasonable',
  'No — internal only':         'internal_only',
  'No measurement':             'no_measurement',
}

export const ASSURANCE_QUESTION_ID = 's3_assurance'

export interface LineAssurance {
  // Exactly what the supplier selected, or null. ⚠️ NULL WHEN UNANSWERED, NEVER A FALLBACK STRING.
  // data_quality on the same line mixes the supplier's words with ours ('Supplier-reported (basis
  // unspecified)' is substituted when blank), so a reader cannot tell which it is holding without
  // comparing against the option list. That ambiguity is now frozen into snapshots. Not repeated here.
  supplier_assurance_raw: string | null
  assurance: AssuranceState
}

/**
 * The assurance state of THIS LINE'S figure.
 *
 * ⚠️ A SPEND-BASED LINE IS ALWAYS 'not_applicable', whatever the supplier answered. Its figure is the
 * buyer's spend times an emission factor; the supplier's own assurance status does not bear on that
 * number, and recording 'limited' against it would be a false claim about it. The raw answer is still
 * kept, because it is true information about the supplier even where it does not describe the line.
 *
 * ⚠️ AN ANSWER THAT EXISTS WINS OVER `asked`. If a response row is present for a template that no
 * longer carries the question, the supplier did answer it at some point and discarding that to report
 * 'not_asked' would throw away evidence. 'not_asked' therefore means "not asked AND no answer", which
 * is what makes it distinct from 'not_answered' rather than overlapping with it.
 */
export function assuranceForLine(opts: {
  raw: string | null | undefined
  asked: boolean
  method: SnapshotLine['method']
}): LineAssurance {
  const trimmed = (opts.raw ?? '').trim()
  const raw = trimmed === '' ? null : trimmed

  if (opts.method === 'spend-based') return { supplier_assurance_raw: raw, assurance: 'not_applicable' }
  if (raw !== null) return { supplier_assurance_raw: raw, assurance: STATE_BY_ANSWER[raw] ?? 'unrecognised' }
  return { supplier_assurance_raw: null, assurance: opts.asked ? 'not_answered' : 'not_asked' }
}

/**
 * ⚠️ THE ONE DEFINITION OF WHAT COUNTS AS ASSURED, so a share cannot be computed two ways.
 *
 * FALSE FOR 'not_applicable', WHICH IS THE POINT OF HAVING THIS FUNCTION. A rollup written as
 * "lines where the supplier said yes" would count spend-based lines whose supplier happens to hold
 * assurance, and report a spend-based estimate as assured. That is the specific untrue sentence this
 * exists to prevent, so filter on the state and never on the raw answer.
 */
export function carriesThirdPartyAssurance(state: AssuranceState): boolean {
  return state === 'limited' || state === 'reasonable'
}

/**
 * A supplier who gave a figure while stating they measure nothing. Producible today: s3cat1_allocated
 * is a number input and s3_assurance is a separate radio, with no cross-check between them.
 *
 * It is a question for the supplier, not an error in the data, so surfaces report it and never block
 * on it. The figure stands as the supplier reported it; what is wrong is the pair.
 */
export function assuranceContradictsFigure(line: Pick<SnapshotLine, 'method' | 'value_mt' | 'assurance'>): boolean {
  return line.method === 'supplier-specific' && line.value_mt > 0 && line.assurance === 'no_measurement'
}

// Short, for a chip beside a line. No em-dashes, no arrows.
const LABELS: Record<AssuranceState, string> = {
  limited:         'Limited assurance',
  reasonable:      'Reasonable assurance',
  internal_only:   'Internal only',
  no_measurement:  'No measurement stated',
  not_answered:    'Not answered',
  not_asked:       'Not asked',
  unrecognised:    'Unrecognised answer',
  not_applicable:  'Not applicable',
}

export function assuranceLabel(state: AssuranceState): string {
  return LABELS[state]
}

// ⚠️ EVERY SENTENCE ATTRIBUTES TO THE SUPPLIER AND NONE CALLS A FIGURE ASSURED. These are written to
// be safe read alone, because one of them will end up on a verifier surface separated from its
// caveat. A test asserts that none of them contains a phrase asserting assurance of the figure.
const STATEMENTS: Record<AssuranceState, string> = {
  limited:
    'The supplier states that their emissions figures carry limited assurance.',
  reasonable:
    'The supplier states that their emissions figures carry reasonable assurance.',
  internal_only:
    'The supplier states that their emissions figures are internal only, with no independent assurance.',
  no_measurement:
    'The supplier states that they do not measure their emissions.',
  not_answered:
    'The supplier was asked whether their emissions figures are independently assured and did not answer.',
  not_asked:
    'The questionnaire sent for this campaign does not ask whether the supplier\'s emissions figures are independently assured, so nothing is recorded either way.',
  unrecognised:
    'The recorded answer is not one of the questionnaire\'s options, so it is reported as given and not interpreted.',
  not_applicable:
    'This figure is a spend-based estimate, so the supplier\'s own assurance status does not bear on it.',
}

export function assuranceStatement(state: AssuranceState): string {
  return STATEMENTS[state]
}

// The caveat a surface prints ONCE, beside a share or a set of lines rather than on every row.
export const ASSURANCE_SCOPE_NOTE =
  'The questionnaire asks whether the supplier\'s own emissions figures are independently assured. ' +
  'It does not establish whether the portion they attributed to your purchases falls within that ' +
  'assurance scope. Read it as a statement about the supplier\'s reporting, not about this number.'

// What a reader says about a line with NO assurance key at all: a snapshot accepted before the field
// existed. ⚠️ NOT 'not assured'. The snapshot table is immutable and these rows are not backfilled,
// because a snapshot records what was known at acceptance and this was not known.
export const ASSURANCE_NOT_RECORDED_NOTE =
  'Supplier assurance status was not recorded when this figure was accepted.'

// A line predates the field if and only if the key is absent. Presence is the test, not the value.
export function assuranceWasRecorded(line: Partial<Pick<SnapshotLine, 'assurance'>>): boolean {
  return 'assurance' in line && line.assurance !== undefined
}

// ── WHAT THE BUYER READS ────────────────────────────────────────────────────────────────────────
//
// Built here rather than in JSX for the reason every other copy module in this repo exists: a sentence
// assembled inline is a sentence nothing tests, and these make claims about what a supplier did and
// did not say. Same shape as lib/ghg/locationDeleteCopy.ts and lib/scope3/cat15.ts.

/** Which states earn a chip on a line. */
export type AssuranceTone = 'good' | 'warn' | 'alert' | 'muted'

const TONES: Record<AssuranceState, AssuranceTone> = {
  limited: 'good', reasonable: 'good',
  internal_only: 'warn', no_measurement: 'warn',
  unrecognised: 'alert',
  not_answered: 'muted', not_asked: 'muted', not_applicable: 'muted',
}

export function assuranceTone(state: AssuranceState): AssuranceTone {
  return TONES[state]
}

/**
 * ⚠️ TWO STATES GET NO CHIP, AND BOTH FOR THE SAME REASON: THE LABEL WOULD BE THE SAME ON EVERY ROW.
 *
 *  - 'not_applicable' is every spend-based line without exception, so the chip would carry no
 *    information at all. What that line is already says it: it is labelled spend-based.
 *  - 'not_asked' is every line of a campaign whose questionnaire has no assurance question, which is
 *    four of the five templates including the default. Forty rows reading "Not asked" states a fact
 *    about the QUESTIONNAIRE forty times, and states it in the place a reader looks for a fact about
 *    the supplier. It belongs in one campaign-level sentence, which assuranceSummarySentence returns.
 *
 * Everything else varies per supplier and earns its row.
 */
export function showsAssuranceChip(line: Pick<SnapshotLine, 'method' | 'assurance'>): boolean {
  return line.method === 'supplier-specific'
    && line.assurance !== 'not_asked'
    && line.assurance !== 'not_applicable'
}

/**
 * The one sentence beside the method split.
 *
 * ⚠️ TAKES THE ROUTE'S ROLLUP AND DOES NO ARITHMETIC ON EMISSIONS. assuredMt and supplierSpecificMt
 * arrive already summed by /api/campaigns/[id]/scope3-cat1, which filters through
 * carriesThirdPartyAssurance so a spend-based line is never counted. A second summation here could
 * disagree with the first, which is the defect the GHG engine's one-renderer rule exists to prevent.
 *
 * Returns null when there are no supplier-reported figures at all: there is then nothing to say about
 * the assurance of supplier-reported figures, and "0 of 0" is noise rather than a finding.
 */
export function assuranceSummarySentence(o: {
  asked: boolean
  supplierSpecificCount: number
  supplierSpecificMt: number
  assuredCount: number
  assuredMt: number
  answeredCount: number
}): string | null {
  if (o.supplierSpecificCount < 1) return null

  const suppliers = `${o.supplierSpecificCount} ${o.supplierSpecificCount === 1 ? 'supplier' : 'suppliers'}`

  // ⚠️ BRANCHED ON WHETHER ANYONE ANSWERED, NOT ON `asked` ALONE. A response can exist for a question
  // the current template no longer carries, and saying the question was never put to them while
  // holding their answer would be false. `asked` decides the wording only where nothing was answered.
  if (o.answeredCount < 1) {
    return o.asked
      ? `None of the ${suppliers} who reported a figure answered whether their emissions figures are independently assured.`
      : `The questionnaire sent for this campaign does not ask whether suppliers have their emissions figures independently assured, so no assurance status is recorded against these figures.`
  }

  if (o.assuredCount < 1) {
    return `Of the ${suppliers} who reported a figure, none states that their emissions reporting carries third-party assurance.`
  }

  // 'of the 1 supplier' does not read, so the sole-supplier case gets its own opening rather than a
  // count of one out of one.
  const opening = o.supplierSpecificCount === 1
    ? 'The one supplier who reported a figure states'
    : `${o.assuredCount} of the ${suppliers} who reported a figure ${o.assuredCount === 1 ? 'states' : 'state'}`
  return `${opening} that their emissions reporting carries third-party assurance, ` +
    `covering ${o.assuredMt.toFixed(2)} mt of the ${o.supplierSpecificMt.toFixed(2)} mt taken from supplier figures.`
}

/**
 * A supplier who reported a figure while stating they measure nothing.
 *
 * ⚠️ A QUESTION FOR THE SUPPLIER, NOT AN ERROR IN THE DATA, so this names it and nothing gates on it.
 * The figure stands exactly as the supplier reported it; what is wrong is the pair, and only the
 * supplier can say which half they meant. Returns null when there is none, so the caller renders
 * nothing rather than asserting there are none.
 */
export function assuranceContradictionSentence(
  lines: readonly Pick<SnapshotLine, 'supplier_name' | 'method' | 'value_mt' | 'assurance'>[],
): string | null {
  const hits = lines.filter(assuranceContradictsFigure)
  if (hits.length < 1) return null
  const names = hits.map(l => l.supplier_name).join(', ')
  const subject = hits.length === 1
    ? 'One supplier reported a figure'
    : `${hits.length} suppliers reported a figure`
  return `${subject} while stating that they do not measure their emissions: ${names}. ` +
    `The figures are included exactly as reported. Ask them which of the two answers they meant.`
}
