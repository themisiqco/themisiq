import { describe, it, expect } from 'vitest'
import { computeObligations } from './page'

// THE FIRST TEST OVER app/assess/. This page determines a visitor's regulatory obligations from its
// own literals and EMAILS THE RESULT TO A NAMED LEAD, and until now nothing guarded it: the comment
// at page.tsx:399 records that a defect here shipped, passed `tsc --noEmit`, passed every test and
// passed `next build`, and was found by a person completing the form.
//
// WHAT THESE THREE PIN: the tri-state `empAtLeast` discipline introduced by commit 41eb198. The form
// collects headcount as a BAND, and a band cannot always answer a statute that tests a number, so
// `empAtLeast` returns true, false OR NULL — null meaning the band straddles the threshold. Every
// consumer must branch on that third state rather than guessing. It is not directly reachable (it is
// a closure over `emp` inside computeObligations), so these drive it through the CSRD entry, whose
// `urgency_label` is the observable proxy: 'CONFIRM HEADCOUNT' is null surviving as a distinct
// answer, 'ACTIVE NOW' is true.
//
// (c) IS THE 500-EMPLOYEE DEFECT ITSELF. Before 41eb198 the CSRD gate fired at 500 employees with no
// turnover limb at all, so a 600-person company was told the full ESRS suite applied to it — E1, S1,
// S2 and G1, on a threshold the amending directive had removed. Post-Omnibus CSRD is a two-limb AND:
// more than 1,000 employees AND more than EUR 450m net turnover (Directive (EU) 2026/470 amending
// the Accounting Directive, arts. 19a/29a). The 250 tier does not exist either. (c) asserts the
// ABSENCE of an entry, which is the only shape that catches a re-widened gate.

// Post-Omnibus CSRD needs the turnover limb met in EUR, so the fixture must clear EUR 450,000,000
// AFTER conversion — the page converts the company's USD figure into the limb's currency rather than
// restating the threshold in dollars. Revenue arrives as an INDEX into REVENUE_VALUES, not a figure.
//
//   index 5 => $750M => EUR 658,877,273 at the ECB rate in lib/deals/assessment.ts (USD 1.1383/EUR)
//
// Index 4 ($500M => EUR 439,251,515) does NOT clear it, so 5 is the lowest band that satisfies the
// turnover limb — chosen over a larger one so the fixture sits near the real boundary rather than far
// above it, and chosen over index 6 ($1bn) so it does not also sit exactly on the SB 253 line.
const REVENUE_INDEX_750M = 5

// Only the headcount band varies across the three. Jurisdiction is EU alone: no California, so no
// SB 253 or SB 261 entry can appear, and no sector, so nothing size-gated in the cyber regimes fires.
const answers = (employees: string) => ({
  jurisdictions: ['eu'],
  revenue: REVENUE_INDEX_750M,
  employees,
})

// The CSRD entry carries NO obligationId — deliberately, because no module covers ESRS G1 (see the
// comment on Obligation.obligationId in page.tsx, and the CSRD absence note in lib/obligations.ts).
// So it is identified by name, which is the only stable handle it has.
const CSRD_NAME = 'CSRD / ESRS — Corporate Sustainability Reporting Directive'
const findCsrd = (employees: string) =>
  computeObligations(answers(employees)).find(o => o.name === CSRD_NAME)

describe('computeObligations — CSRD headcount band, the empAtLeast tri-state', () => {
  it('(a) a band STRADDLING 1,000 cannot settle the limb, and says so rather than guessing', () => {
    const csrd = findCsrd('1000_4999')
    expect(csrd).toBeDefined()
    // empAtLeast(1_001) returns null for exactly one band — this one — so the label is unambiguous.
    expect(csrd!.urgency_label).toBe('CONFIRM HEADCOUNT')
    // The third state must not be silently upgraded to a firm answer.
    expect(csrd!.urgency_label).not.toBe('ACTIVE NOW')
  })

  it('(b) a band ENTIRELY ABOVE 1,000 settles it, and the entry is unqualified', () => {
    const csrd = findCsrd('5000plus')
    expect(csrd).toBeDefined()
    expect(csrd!.urgency_label).toBe('ACTIVE NOW')
  })

  it('(c) a band ENTIRELY BELOW 1,000 produces NO CSRD entry — the 500-employee defect', () => {
    // The regression this guards told a 600-person EU company the full ESRS suite applied. Asserting
    // the absence is the point: a re-widened gate shows up here as a defined entry, whatever label
    // it happens to carry.
    expect(findCsrd('500_999')).toBeUndefined()
    // And not by accident of the fixture — the same answers DO produce other obligations, so an
    // empty result or a broken call cannot pass this vacuously.
    expect(computeObligations(answers('500_999')).length).toBeGreaterThan(0)
  })
})
