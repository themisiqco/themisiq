/**
 * ESRS 2 IRO-1 ¶35 — the five limbs, their on-screen wording, and what is outstanding before a
 * preparer can submit.
 *
 * ⚠️ THE DATABASE IS THE AUTHORITY, NOT THIS FILE. materiality_iro1_submitted_is_complete
 * (migration 20260847) is what actually refuses an incomplete submit. This module exists so the
 * screen can say WHAT is outstanding before Postgres says THAT something is — a constraint
 * violation names a constraint, not a missing answer.
 *
 * ⚠️ AND THE TWO CAN DRIFT. No test here can reach that CHECK: vitest has no database and this repo
 * has no schema-derived types. If a sixth limb is ever added to the migration it must be added to
 * IRO1_FIELDS in the same pass, or this screen will report "ready to submit" on a row the database
 * will reject. That is the one failure mode extraction does NOT fix, and it is stated rather than
 * hidden. Everything downstream of IRO1_FIELDS — render, state, gate, outstanding line — derives
 * from the array, so within TypeScript the four cannot disagree.
 *
 * ⚠️ THE ¶35 WORDING IS HERE BECAUSE TWO SURFACES NEED IT. This capture screen quotes it so a
 * preparer sees what the standard asks rather than a bare label, and the prose surface — separate
 * work, not yet built — will need the same text. It is kept in step with the column comments in
 * 20260847 by hand; they are the same sentences.
 */

export type Iro1FieldKey =
  | 'value_chain_approach'
  | 'heightened_risk_areas'
  | 'remediation_consideration'
  | 'due_diligence_link'
  | 'external_experts'

export type Iro1Field = {
  key: Iro1FieldKey
  /** The DB column holding the boolean. Derived, not stored, so the two cannot fall out of step. */
  declinedKey: `${Iro1FieldKey}_declined`
  /** Short heading for the card. */
  label: string
  /** Which limb of ¶35, printed on screen. */
  limb: string
  /** What the standard asks, in the standard's terms. Quoted on screen above the controls. */
  asks: string
  /** Plain-language help under the question. ThemisIQ's words, not the standard's. */
  help: string
  /** Lower-case fragment, joined into the outstanding line at the submit button. */
  short: string
}

export const IRO1_FIELDS: readonly Iro1Field[] = [
  {
    key: 'value_chain_approach',
    declinedKey: 'value_chain_approach_declined',
    label: 'How the assessment covered your value chain',
    limb: 'ESRS 2 IRO-1 ¶35(a)',
    asks: 'A description of the methodologies and assumptions applied in the process, across own '
        + 'operations and the upstream and downstream value chain.',
    help: 'How you actually went about it — who was involved, what you looked at, and how far up '
        + 'and down the value chain the exercise reached.',
    short: 'how the assessment covered your value chain',
  },
  {
    key: 'heightened_risk_areas',
    declinedKey: 'heightened_risk_areas_declined',
    label: 'Where negative-impact risk is concentrated',
    limb: 'ESRS 2 IRO-1 ¶35(b)',
    asks: 'The activities, business relationships, geographies or other factors that give rise to a '
        + 'heightened risk of adverse impacts.',
    help: 'Not a list of every risk — the places where risk clusters. A single supplier region, a '
        + 'particular contract type, one production step.',
    short: 'where negative-impact risk is concentrated',
  },
  {
    key: 'remediation_consideration',
    declinedKey: 'remediation_consideration_declined',
    label: 'How prevention, mitigation and remediation entered the judgement',
    limb: 'ESRS 2 IRO-1 ¶35(b)',
    asks: 'How the process considers the prevention, mitigation and remediation of actual and '
        + 'potential adverse impacts.',
    help: 'How these shaped the ASSESSMENT — whether a topic was judged less severe because it can '
        + 'be put right, for instance. This is not what you intend to do about a topic; that is a '
        + 'different disclosure and does not belong here.',
    short: 'how remediation entered the judgement',
  },
  {
    key: 'due_diligence_link',
    declinedKey: 'due_diligence_link_declined',
    label: 'Link to a due diligence process',
    limb: 'ESRS 2 IRO-1 ¶35(c)',
    asks: 'Whether and how the process was informed by a sustainability due diligence process.',
    help: 'If you run a due diligence process — supplier screening, human-rights work, a CS3D '
        + 'programme — say whether it fed this assessment and how. "We have one but it did not '
        + 'feed this" is an answer.',
    short: 'the link to a due diligence process',
  },
  {
    key: 'external_experts',
    declinedKey: 'external_experts_declined',
    label: 'Consultation with external experts',
    limb: 'ESRS 2 IRO-1 ¶35(c)',
    asks: 'Whether and how the undertaking consulted external experts.',
    help: 'Experts consulted on METHOD — a consultancy, a scientific body, a legal adviser. '
        + 'Deliberately not your stakeholder survey: that records affected parties giving their own '
        + 'view, which ¶35 names separately and which this platform already holds.',
    short: 'consultation with external experts',
  },
] as const

/** The three states a limb can be in. The DDL makes all three reachable; this names them. */
export type Iro1FieldState = 'not_addressed' | 'answered' | 'declined'

/**
 * ⚠️ THE THIRD STATE IS THE POINT. A blank field and a declined field are different disclosures —
 * "we did not describe this" and "we were asked and chose not to" — and 20260847's per-limb CHECK
 * exists so both can be recorded. `text present` wins over `declined` only because the CHECK makes
 * the pair impossible; this reads it in the order the constraint guarantees.
 */
export function iro1FieldState(
  text: string | null | undefined,
  declined: boolean | null | undefined,
): Iro1FieldState {
  if (typeof text === 'string' && text.trim() !== '') return 'answered'
  if (declined === true) return 'declined'
  return 'not_addressed'
}

/** The row shape this module reads. A subset of public.materiality_iro1. */
export type Iro1Row = Partial<Record<Iro1FieldKey, string | null>>
                    & Partial<Record<`${Iro1FieldKey}_declined`, boolean | null>>

export type Iro1Blocker = { key: Iro1FieldKey; short: string }

/**
 * The limbs still to be dealt with, in the order they appear on screen.
 *
 * Mirrors materiality_iro1_submitted_is_complete: a limb is dealt with when it has text OR is
 * declined. Empty when the row could be submitted.
 */
export function iro1Blockers(row: Iro1Row | null): Iro1Blocker[] {
  if (!row) return IRO1_FIELDS.map(f => ({ key: f.key, short: f.short }))
  return IRO1_FIELDS
    .filter(f => iro1FieldState(row[f.key], row[f.declinedKey]) === 'not_addressed')
    .map(f => ({ key: f.key, short: f.short }))
}

/**
 * The outstanding limbs as ONE fragment. Null when nothing is outstanding; never ''.
 *
 * ⚠️ NAMES EVERY OUTSTANDING ITEM, not the first. A message that reports one at a time sends the
 * preparer round the loop once per limb — the same reasoning as lib/climate/wizardSteps.ts.
 */
export function iro1OutstandingText(blockers: Iro1Blocker[]): string | null {
  const parts = blockers.map(b => b.short)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
