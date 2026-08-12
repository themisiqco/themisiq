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

// ── SB 253: the strict > boundary ────────────────────────────────────────────────────────────────
//
// PINS: page.tsx:129, `hasCA && revUSD > 1_000_000_000`. The statute is "in excess of" $1bn, so the
// comparison is STRICT — a company at exactly $1,000,000,000 is out of scope. THRESHOLD_TESTS['SB
// 253'] in lib/deals/assessment.ts encodes the same limb with `comparison: 'gt'`, and
// lib/deals/assessment.test.ts already pins that side ('SB 253 is strict — exactly at the figure does
// NOT apply'). This asserts /assess AGREES WITH THE ENGINE. The two evaluate the same statute from
// different code, and a page that emails a prospect "SB 253 applies to you" while the Deals engine
// says it does not is the disagreement worth catching — neither file imports the figure from the
// other, so nothing but a test holds them together.
//
// Index 6 is exactly $1bn, which is the boundary case; index 7 is the next band up.
describe('computeObligations — SB 253 fires on strict >, matching THRESHOLD_TESTS gt', () => {
  const ca = (revenue: number) => computeObligations({ jurisdictions: ['california'], revenue })
  const sb253 = (revenue: number) => ca(revenue).find(o => o.obligationId === 'sb253')

  it('EXACTLY $1,000,000,000 does NOT produce an SB 253 entry', () => {
    expect(sb253(6)).toBeUndefined()
    // Not vacuous: a Californian company at $1bn still clears the SB 261 $500m limb, so the fixture
    // demonstrably produces obligations — the SB 253 absence is a decision, not an empty result.
    expect(ca(6).length).toBeGreaterThan(0)
  })

  it('the next band up ($2bn) does', () => {
    expect(sb253(7)).toBeDefined()
    expect(sb253(7)!.urgency).toBe('critical')
  })
})

// ── Modern Slavery: the currency conversion ──────────────────────────────────────────────────────
//
// PINS: page.tsx:254-255. Before 41eb198 both limbs compared the RAW USD slider figure against
// thresholds denominated in GBP and AUD — "firing from $36m where the real bar is £36m". They now
// convert through revIn(), which routes to lib/deals/assessment.ts's convertCurrency, so there is one
// dated rate table rather than two.
//
// ⚠️ COVERAGE LIMIT, STATED RATHER THAN PAPERED OVER. The requested assertion — a USD figure that
// clears $36m but NOT £36m — CANNOT BE WRITTEN, because no REVENUE_VALUES band lands in that window.
// At the ECB rate in lib/deals/assessment.ts the over-call windows are:
//
//   UK:  $36,000,001 – $47,664,732   (£36m breakeven is $47,664,732)
//   AU:  $68,912,701 – $99,999,999   (AUD 100m breakeven is $68,912,701)
//
// and the slider steps $25M → $50M → $100M, skipping both. Every one of the eleven bands produces
// the SAME answer converted or unconverted, for both limbs. SO THE CONVERSION FIX IS CORRECT BUT
// CURRENTLY UNOBSERVABLE THROUGH THIS FORM, and no test driving computeObligations can distinguish
// it. It would become observable the moment the slider gains a finer band or revenue is collected as
// a free figure — which is exactly when a regression would ship unnoticed.
//
// What IS assertable is the gate itself: the jurisdiction wiring and the threshold direction. That is
// what these two pin. THEY DO NOT PIN THE CONVERSION. Do not read a green run here as covering it.
describe('computeObligations — UK Modern Slavery gate (NOT the conversion — see comment)', () => {
  const uk = (revenue: number) => computeObligations({ jurisdictions: ['uk'], revenue })
  const ms = (revenue: number) => uk(revenue).find(o => o.obligationId === 'modern-slavery')

  it('$25M — below the bar in either currency — produces no entry', () => {
    expect(ms(0)).toBeUndefined()
    // Not vacuous: a UK company still picks up IFRS S2 at any size.
    expect(uk(0).length).toBeGreaterThan(0)
  })

  it('$50M — GBP 37,763,771, above the GBP 36m bar — produces one', () => {
    expect(ms(1)).toBeDefined()
    expect(ms(1)!.jurisdiction).toBe('United Kingdom')
  })
})

// ── NIS2 / DORA: lex specialis, mutually exclusive ───────────────────────────────────────────────
//
// PINS: page.tsx:206 and :213-214. Before 41eb198 both fired for an EU financial entity, telling a
// bank it had two overlapping cyber regimes. NIS2 art. 4(2) disapplies its risk-management and
// incident provisions where a sector-specific act imposes at least equivalent requirements, and the
// ESAs and the Commission have confirmed DORA meets that test — so a financial entity gets DORA
// ALONE. The exclusion is the `!doraApplies` conjunct on the NIS2 gate; delete it and both return.
//
// The second test guards the other direction: the exclusion must not swallow NIS2 for the
// non-financial Annex I/II sectors it correctly reaches. Energy is Annex I.
describe('computeObligations — DORA is lex specialis over NIS2', () => {
  const eu = (sectors: string[]) =>
    computeObligations({ jurisdictions: ['eu'], sectors, revenue: REVENUE_INDEX_750M, employees: '1000_4999' })
  const ids = (sectors: string[]) => eu(sectors).map(o => o.obligationId)

  it('an EU FINANCIAL entity gets DORA and NOT NIS2', () => {
    expect(ids(['financial'])).toContain('dora')
    expect(ids(['financial'])).not.toContain('nis2')
    // Not vacuous: DORA's presence is itself the companion, but assert the array is real.
    expect(eu(['financial']).length).toBeGreaterThan(0)
  })

  it('an EU entity in an Annex I/II sector that is NOT financial gets NIS2 and not DORA', () => {
    expect(ids(['energy'])).toContain('nis2')
    expect(ids(['energy'])).not.toContain('dora')
  })
})
