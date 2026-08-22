/**
 * What each climate-risk wizard step still needs, in plain language.
 *
 * ⚠️ THIS EXISTS BECAUSE A DISABLED CONTROL CANNOT EXPLAIN ITSELF. On 21 Aug 2026 a user fixed the
 * reporting dates, watched the amber warnings clear, and sat in front of a grey Next button with
 * nothing on the page saying that no sector had been chosen. The dates explained themselves; the
 * sector did not; and the asymmetry cost real diagnosis time. Step 1 had the identical silence and
 * nobody had hit it yet — its requirement (at least one region) is followed on the page by the
 * asset-profile block, which is always satisfied, so the step LOOKS complete when it is not.
 *
 * ⚠️ THE INVARIANT, AND THE WHOLE POINT OF PUTTING THIS IN lib/: for any step and any input,
 *
 *     stepBlockers(step, s).length === 0   ⟺   canAdvanceStep(step, s)
 *
 * The two are written side by side below and wizardSteps.test.ts pins the equivalence across every
 * step. A requirement added to one and not the other reintroduces the exact defect this file was
 * written to end, and it fails a test instead of a customer.
 *
 * ⚠️ THE REPORTING PERIOD IS OPTIONAL AND NO STRING HERE MAY SUGGEST OTHERWISE. Both dates blank is
 * a valid, complete answer — Art. 2(2) permits an unstated period and an assumed one would be
 * false. The period can only ever block on an INCONSISTENT entry (one date, or end before start),
 * never on an absent one, so every string below offers clearing as a way forward. The test asserts
 * that no period string contains the word "required".
 */

export type WizardStepInput = {
  industryCode: string
  regionCodes: string[]
  periodStart: string
  periodEnd: string
}

export type BlockerField = 'sector' | 'regions' | 'period'

export type Blocker = {
  /** Which block on the page the message belongs beside. */
  field: BlockerField
  /** A full sentence, shown at the field in the amber warning idiom. */
  atField: string
  /** A lower-case fragment, joined into one sentence beside the button. */
  short: string
}

/** String comparison is safe: ISO dates sort lexicographically and both come from type="date". */
export const periodHalfFilled = (start: string, end: string) => (!!start) !== (!!end)
export const periodOutOfOrder = (start: string, end: string) =>
  !!start && !!end && end <= start
export const periodInvalid = (start: string, end: string) =>
  periodHalfFilled(start, end) || periodOutOfOrder(start, end)

/**
 * ⚠️ ORDER MATTERS AND IT IS PAGE ORDER, NOT IMPORTANCE. The button sentence reads in the order the
 * fields appear, so a user scanning down for the first problem finds it first.
 */
export function stepBlockers(step: number, s: WizardStepInput): Blocker[] {
  const out: Blocker[] = []

  if (step === 0) {
    if (!s.industryCode) {
      out.push({
        field: 'sector',
        atField: 'Choose your primary sector to continue.',
        short: 'your primary sector',
      })
    }
    if (periodHalfFilled(s.periodStart, s.periodEnd)) {
      out.push({
        field: 'period',
        // ⚠️ WHAT HAPPENS TO THEIR DATA FIRST, WHAT BLOCKS THEM SECOND. "A period with only one end
        // is not recorded" is the more useful fact and is stated before the consequence for Next —
        // a user who abandons the field should still know the half-entry will not be kept.
        atField: 'Enter both dates, or clear the one you have entered. A period with only one end '
               + 'is not recorded, and Next cannot continue until it is one or the other.',
        short: 'the reporting period completed or cleared',
      })
    } else if (periodOutOfOrder(s.periodStart, s.periodEnd)) {
      out.push({
        field: 'period',
        atField: 'The last day must fall after the first day.',
        short: 'the reporting period in date order',
      })
    }
    return out
  }

  if (step === 1) {
    if (s.regionCodes.length === 0) {
      out.push({
        field: 'regions',
        atField: 'Select at least one region to continue.',
        short: 'at least one region',
      })
    }
    return out
  }

  // Steps 2, 3 and 4 require nothing. No blocker, so nothing renders — the messages appear when a
  // requirement exists, rather than each step having to opt out.
  return out
}

/** Identical rule to the component's canAdvance(), in one place so the invariant can be tested. */
export function canAdvanceStep(step: number, s: WizardStepInput): boolean {
  if (step === 0) return !!s.industryCode && !periodInvalid(s.periodStart, s.periodEnd)
  if (step === 1) return s.regionCodes.length > 0
  return true
}

/**
 * The outstanding items as ONE fragment — "your primary sector and the reporting period completed
 * or cleared". Null when nothing is outstanding; never ''.
 *
 * ⚠️ ONE LINE, NOT A STACK, AND IT NAMES EVERY OUTSTANDING ITEM. A message that reports only the
 * first problem sends the user round the loop once per requirement, which is a slower version of
 * the silence this replaces.
 */
export function outstandingText(blockers: Blocker[]): string | null {
  const parts = blockers.map(b => b.short)
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
