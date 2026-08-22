import { describe, it, expect } from 'vitest'
import {
  stepBlockers, canAdvanceStep, outstandingText,
  periodHalfFilled, periodOutOfOrder, periodInvalid,
  type WizardStepInput,
} from './wizardSteps'

// ------------------------------------------------------------------------------------------------
// The wizard's Next button could not explain itself. Two of these tests earn the extraction:
//
//   TEST 1  the equivalence. A requirement added to canAdvanceStep and not to stepBlockers puts the
//           silence back, and this is what catches it. Nothing else can — the JSX is untestable in
//           this repo (no jsdom, no testing-library, no app/** tests), so whether the amber line
//           RENDERS is a manual check. What is mechanised is that the content is right and that it
//           stays in step with the rule.
//
//   TEST 10 the copy constraint. The reporting period is OPTIONAL; both dates blank is a complete
//           answer. Copy that implies otherwise would be a false statement about a legal
//           disclosure, so "required" is asserted absent rather than trusted to stay absent.
// ------------------------------------------------------------------------------------------------

const S = (o: Partial<WizardStepInput> = {}): WizardStepInput => ({
  industryCode: '', regionCodes: [], periodStart: '', periodEnd: '', ...o,
})

describe('THE INVARIANT -- blockers are empty exactly when the step can advance', () => {
  it('1 stepBlockers().length === 0 <=> canAdvanceStep(), across every step and input', () => {
    const inputs: WizardStepInput[] = [
      S(),
      S({ industryCode: 'manufacturing' }),
      S({ regionCodes: ['NEU'] }),
      S({ industryCode: 'manufacturing', regionCodes: ['NEU'] }),
      S({ industryCode: 'manufacturing', periodStart: '2026-01-01' }),                        // half
      S({ industryCode: 'manufacturing', periodEnd: '2026-12-31' }),                          // half
      S({ industryCode: 'manufacturing', periodStart: '2026-12-31', periodEnd: '2026-01-01' }), // order
      S({ industryCode: 'manufacturing', periodStart: '2026-01-01', periodEnd: '2026-12-31' }), // ok
      S({ periodStart: '2026-04-01', periodEnd: '2027-03-31' }),        // valid dates, no sector
      S({ industryCode: 'manufacturing', regionCodes: ['NEU', 'WCE'],
          periodStart: '2026-01-01', periodEnd: '2026-12-31' }),
    ]
    for (const step of [0, 1, 2, 3, 4]) {
      for (const s of inputs) {
        expect(stepBlockers(step, s).length === 0).toBe(canAdvanceStep(step, s))
      }
    }
  })
})

describe('step 0 -- sector and reporting period', () => {
  it('2 no sector, blank dates -> exactly one blocker, at the sector', () => {
    const b = stepBlockers(0, S())
    expect(b).toHaveLength(1)
    expect(b[0].field).toBe('sector')
  })

  it('3 sector set, one date entered -> exactly one blocker, at the period', () => {
    const b = stepBlockers(0, S({ industryCode: 'manufacturing', periodStart: '2026-01-01' }))
    expect(b).toHaveLength(1)
    expect(b[0].field).toBe('period')
  })

  it('4 neither met -> TWO blockers, sector first, matching the order of the fields on the page', () => {
    // The button sentence reads in this order, so a user scanning down finds the first problem
    // first. Reversing it would name the lower field before the higher one.
    const b = stepBlockers(0, S({ periodStart: '2026-01-01' }))
    expect(b.map(x => x.field)).toEqual(['sector', 'period'])
  })

  it('5 out-of-order dates yield the ORDER blocker, not the half-filled one', () => {
    // They are else-if: a reversed pair is not a half-filled pair, and reporting both would be two
    // messages about one mistake.
    const s = S({ industryCode: 'manufacturing', periodStart: '2026-12-31', periodEnd: '2026-01-01' })
    expect(periodHalfFilled(s.periodStart, s.periodEnd)).toBe(false)
    expect(periodOutOfOrder(s.periodStart, s.periodEnd)).toBe(true)
    const b = stepBlockers(0, s)
    expect(b).toHaveLength(1)
    expect(b[0].short).toBe('the reporting period in date order')
  })

  it('6 blank dates are NOT a blocker -- the period is optional', () => {
    expect(stepBlockers(0, S({ industryCode: 'manufacturing' }))).toEqual([])
    expect(canAdvanceStep(0, S({ industryCode: 'manufacturing' }))).toBe(true)
  })
})

describe('step 1 -- regions', () => {
  it('7 no regions -> one blocker at the regions', () => {
    const b = stepBlockers(1, S())
    expect(b).toHaveLength(1)
    expect(b[0].field).toBe('regions')
  })

  it('8 one region is enough', () => {
    expect(stepBlockers(1, S({ regionCodes: ['NEU'] }))).toEqual([])
  })
})

describe('steps 2, 3 and 4 require nothing', () => {
  it('9 always empty, whatever the input', () => {
    for (const step of [2, 3, 4]) {
      expect(stepBlockers(step, S())).toEqual([])
      expect(canAdvanceStep(step, S())).toBe(true)
    }
  })
})

describe('outstandingText', () => {
  it('10 joins two with "and", passes one through, and returns NULL for none', () => {
    // Null, never '' — an empty string would render an empty line under the button.
    expect(outstandingText(stepBlockers(0, S({ periodStart: '2026-01-01' }))))
      .toBe('your primary sector and the reporting period completed or cleared')
    expect(outstandingText(stepBlockers(0, S()))).toBe('your primary sector')
    expect(outstandingText([])).toBeNull()
  })

  it('11 THE COPY CONSTRAINT -- no period string implies the dates are required', () => {
    const periodStrings = [
      ...stepBlockers(0, S({ industryCode: 'x', periodStart: '2026-01-01' })),
      ...stepBlockers(0, S({ industryCode: 'x', periodStart: '2026-12-31', periodEnd: '2026-01-01' })),
    ].flatMap(b => [b.atField, b.short])

    expect(periodStrings.length).toBeGreaterThan(0)
    for (const s of periodStrings) {
      expect(s.toLowerCase()).not.toContain('required')
      expect(s.toLowerCase()).not.toContain('must enter')
    }
    // And the half-filled case must offer clearing as a way forward, not only completion.
    const half = stepBlockers(0, S({ industryCode: 'x', periodStart: '2026-01-01' }))[0]
    expect(half.atField.toLowerCase()).toContain('clear')
    expect(half.short.toLowerCase()).toContain('cleared')
  })
})

describe('the contract the conflict banner relies on', () => {
  it('12 a period blocker exists exactly when the period is invalid, and is tagged "period"', () => {
    // ⚠️ THE CONTRACT THE CONFLICT BANNER RELIES ON. app/dashboard/climate-risk/page.tsx suppresses
    // the period/ESRS-version banner on `blockers.some(b => b.field === 'period')`. Test 1 pins the
    // COUNT of blockers against canAdvanceStep and would stay green if a period problem were
    // re-tagged, or if the two step-0 problems were merged into one — either of which would put the
    // banner back beside the incompleteness warning it was suppressed to avoid. The reverse is
    // worse: a blocker tagged 'period' for some non-period reason would suppress a real conflict.
    const cases: [WizardStepInput, boolean][] = [
      [S({ industryCode: 'x' }), false],                                                    // both blank
      [S({ industryCode: 'x', periodStart: '2026-01-01', periodEnd: '2026-12-31' }), false],
      [S({ industryCode: 'x', periodStart: '2026-01-01' }), true],                          // half
      [S({ industryCode: 'x', periodEnd: '2026-12-31' }), true],                            // half
      [S({ industryCode: 'x', periodStart: '2026-12-31', periodEnd: '2026-01-01' }), true], // order
      // ⚠️ EQUAL DATES ARE INVALID, matching the DB's ..._order CHECK (end > start, not >=). Correct
      // but not obvious, and asserted nowhere else: a same-day period suppresses the banner too.
      [S({ industryCode: 'x', periodStart: '2026-01-01', periodEnd: '2026-01-01' }), true],
      [S({ periodStart: '2026-01-01' }), true],       // tagged independently of the sector blocker
    ]
    for (const [s, expected] of cases) {
      const hasPeriod = stepBlockers(0, s).some(b => b.field === 'period')
      expect(hasPeriod).toBe(expected)
      // The assertion that matters: the TAG is tied to periodInvalid directly, so the render
      // site's guard and the routes' 400 condition are provably the same condition.
      expect(hasPeriod).toBe(periodInvalid(s.periodStart, s.periodEnd))
    }
  })
})
