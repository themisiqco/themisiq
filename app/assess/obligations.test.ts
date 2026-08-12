import { describe, it, expect } from 'vitest'
import { computeObligations, canAdvance } from './page'

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
    // AND THE TIMING NAMES NO BAND. It read 'your 1,000–4,999 band spans that line' — true of the
    // only selectable band reaching this arm, false for an UNSET answer, which returns null too.
    expect(csrd!.timing).not.toContain('1,000–4,999')
    // The boundary still has to be named, or the row says a check exists without saying what to check.
    expect(csrd!.timing).toContain('1,000 employees')
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
  // ⚠️ MATCH NIS2 ON NAME, NEVER ON obligationId. BOTH NIS2 entries carry `obligationId: 'nis2'` —
  // correctly, since both route to Cyber Governance at the same price — so `ids()` cannot tell them
  // apart, and an `ids(...).toContain('nis2')` assertion passes for either. The two entries differ by
  // NAME, which is also what the results list keys its React children and its expand state on.
  const NIS2_MAIN = 'EU NIS2 Directive — Network and Information Security'
  const NIS2_SURVIVING = 'EU NIS2 Directive — duties surviving DORA'
  const names = (sectors: string[]) => eu(sectors).map(o => o.name)

  it('an EU FINANCIAL entity gets DORA and NOT the main NIS2 entry', () => {
    expect(ids(['financial'])).toContain('dora')
    expect(names(['financial'])).not.toContain(NIS2_MAIN)
    // Not vacuous: DORA's presence is itself the companion, but assert the array is real.
    expect(eu(['financial']).length).toBeGreaterThan(0)
  })

  it('an EU entity in an Annex I/II sector that is NOT financial gets NIS2 and not DORA', () => {
    expect(names(['energy'])).toContain(NIS2_MAIN)
    expect(ids(['energy'])).not.toContain('dora')
    // Not vacuous — the same fixture produces other obligations, so an empty result cannot pass the
    // DORA-absence half.
    expect(eu(['energy']).length).toBeGreaterThan(0)
  })

  // ── THE CARVE-OUT IS PER SECTOR, NOT PER COMPANY ───────────────────────────────────────────────
  //
  // Sectors are a MULTI-SELECT, and the gate read `!doraApplies` — so a company ticking Financial AND
  // Energy was `isFinancial` and lost its NIS2 entry outright, including the ENERGY-side scoping that
  // DORA does not touch. NIS2 art. 4(1) is express: where sector-specific Union acts do not cover all
  // entities in a sector within scope, the relevant provisions continue to apply to those not
  // covered. DORA covers a company's FINANCIAL activities, not the company entire.
  //
  // The gate now suppresses only where financial is the ONLY NIS2-relevant sector ticked
  // (`doraDisplacesNis2 = doraApplies && !nis2NonFinancialSectors`). These three pin both directions:
  // the fix must not stop suppressing for a pure financial entity, and must stop suppressing the
  // moment a non-financial Annex sector is present.
  it('financial AND energy gets BOTH — DORA for the financial half, NIS2 for the rest', () => {
    expect(ids(['financial', 'energy'])).toContain('dora')
    expect(names(['financial', 'energy'])).toContain(NIS2_MAIN)
  })

  it('adding ANY non-financial Annex sector to financial restores the main NIS2 entry', () => {
    // Every non-financial sector the form can detect as NIS2-relevant, so a future edit that drops
    // one from nis2NonFinancialSectors fails here rather than silently suppressing again.
    for (const s of ['energy', 'health', 'transport', 'tech']) {
      expect(names(['financial', s]), `financial + ${s} should keep NIS2`).toContain(NIS2_MAIN)
      expect(ids(['financial', s]), `financial + ${s} should keep DORA`).toContain('dora')
    }
    // And a NON-Annex sector must NOT restore it — otherwise the test above would pass for the wrong
    // reason and the suppression would be effectively dead.
    expect(names(['financial', 'retail'])).not.toContain(NIS2_MAIN)
    expect(ids(['financial', 'retail'])).toContain('dora')
  })

  // ── THE SURVIVING-DUTIES ENTRY ─────────────────────────────────────────────────────────────────
  //
  // The two gates are exact complements (`… && !doraDisplacesNis2` / `… && doraDisplacesNis2`), so
  // exactly one may ever appear; the last test below pins that they can never both.
  it('financial only: the surviving-duties entry appears, the main NIS2 entry does not', () => {
    const n = names(['financial'])
    expect(n).toContain(NIS2_SURVIVING)
    expect(n).not.toContain(NIS2_MAIN)
    // And it does not arrive alone or unqualified.
    expect(ids(['financial'])).toContain('dora')
    const surviving = eu(['financial']).find(o => o.name === NIS2_SURVIVING)!
    expect(surviving.urgency).toBe('medium')
    expect(surviving.urgency_label).toBe('STILL APPLIES')
    // The three things it must land, asserted on the customer-visible string rather than described.
    expect(surviving.what).toContain('you remain in scope')
    expect(surviving.what).toContain('does not cease to apply')
    expect(surviving.what).toContain('art. 3(4)')
    // NOT art. 27 — the mislabelled article lib/nis2.ts was written to keep out of this entry.
    expect(surviving.what).not.toContain('art. 27')
    // The displaced work must not be handed back to the reader as an action.
    expect(surviving.action).not.toMatch(/gap assessment/i)
  })

  it('financial + energy: the MAIN entry returns and the surviving-duties entry steps aside', () => {
    const n = names(['financial', 'energy'])
    expect(n).toContain(NIS2_MAIN)
    expect(n).not.toContain(NIS2_SURVIVING)
    // Not vacuous — DORA is still there, so this is a swap and not an empty result.
    expect(ids(['financial', 'energy'])).toContain('dora')
  })

  it('energy only: the main entry, and neither DORA nor the surviving-duties entry', () => {
    const n = names(['energy'])
    expect(n).toContain(NIS2_MAIN)
    expect(n).not.toContain(NIS2_SURVIVING)
    expect(ids(['energy'])).not.toContain('dora')
    expect(eu(['energy']).length).toBeGreaterThan(0)
  })

  it('the two NIS2 entries are mutually exclusive across every sector combination', () => {
    const sectors = ['financial', 'energy', 'health', 'transport', 'tech', 'retail']
    // Every single and every pair — the gates differ only in the sign of one conjunct, so a pair is
    // enough to expose any combination where both or neither could fire while NIS2 is in scope.
    const combos = [...sectors.map(s => [s]), ...sectors.flatMap((a, i) => sectors.slice(i + 1).map(b => [a, b]))]
    for (const c of combos) {
      const n = names(c)
      const both = n.includes(NIS2_MAIN) && n.includes(NIS2_SURVIVING)
      expect(both, `${c.join(' + ')} produced BOTH NIS2 entries`).toBe(false)
    }
    // Not vacuous: at least one combination produces each entry, so the loop is testing something.
    expect(names(['financial'])).toContain(NIS2_SURVIVING)
    expect(names(['energy'])).toContain(NIS2_MAIN)
  })
})

// ── EU Pay Transparency: one entry became three ──────────────────────────────────────────────────
//
// PINS: page.tsx:222, :227 and :228. Before 41eb198 this was ONE entry gated at 250+, so a 40-person
// EU employer was told nothing applied — when the Directive's day-one obligations (salary ranges in
// postings, no salary-history questions, a pay-information request route) bind EVERY EU employer at
// ANY size. It is now three gates: day-one on `hasEU` alone, the 250+ annual duty on
// `pt250 === true`, and an abstention arm on `pt250 === null`.
//
// THE ABSTENTION ARM WAS DEAD CODE, and these guard the repair. It was gated on `pt250 === null`,
// and empAtLeast(250) returns FALSE for '50_249' — the band tops out at 249, so it answers "at least
// 250?" definitively — leaving null reachable only from an UNANSWERED employees question. A 50-249
// EU employer therefore received the day-one entry and NO reporting-band entry at all, silently,
// which is the exact abstention 41eb198 set out to add. The gate now takes TWO probes,
// `pt250 !== true && pt100 !== false`, so it fires where the band settles neither boundary.
//
// ⚠️ ON PARTIAL ANSWERS. computeObligations is a pure function and these tests call it directly, so a
// fixture may omit fields a real visitor could never omit. THE UNANSWERED-EMPLOYEES PATH IS
// UNREACHABLE THROUGH THE WIZARD: `canProceed` at page.tsx:582 is `!!val` for an options question and
// the Continue button is `disabled={!canProceed}` at :641, so the employees step cannot be advanced
// past unanswered — and there is no deep link, no progress-bar click, no skip affordance and no
// setStep write that jumps it (the only writes are goNext/goBack, 'Start over' → 0, and the email
// submit → RESULTS_STEP). So a test driving a partial `answers` is UNIT-TESTING THE FUNCTION, not
// describing a user journey, and nothing here should be read as a claim about what a customer sees.
// Every fixture below supplies a band for that reason.
describe('computeObligations — EU Pay Transparency, three arms', () => {
  const eu = (employees: string) => computeObligations({ jurisdictions: ['eu'], employees })
  const named = (employees: string, fragment: string) =>
    eu(employees).find(o => o.name.includes(fragment))

  it('day-one obligations bind at ANY size — the 40-person employer the old gate silenced', () => {
    const dayOne = named('under50', 'day-one obligations')
    expect(dayOne).toBeDefined()
    expect(dayOne!.urgency_label).toBe('ALL EMPLOYERS')
    // And they are not size-gated at the top either.
    expect(named('5000plus', 'day-one obligations')).toBeDefined()
  })

  it('the 250+ annual reporting duty fires only where the band clears 250', () => {
    const reporting = named('250_499', 'gender pay gap reporting')
    expect(reporting).toBeDefined()
    expect(reporting!.timing).toBe('7 June 2027, then annually')
    // Below 250 it must not: the band tops out at 249.
    expect(named('50_249', 'gender pay gap reporting')).toBeUndefined()
    // Not vacuous — the day-one entry is still there for that same 50-249 employer.
    expect(named('50_249', 'day-one obligations')).toBeDefined()
  })

  it('the 50-249 band gets the abstention arm — it settles neither the 100 nor the 250 boundary', () => {
    const undetermined = named('50_249', 'reporting band undetermined')
    expect(undetermined).toBeDefined()
    expect(undetermined!.urgency_label).toBe('CONFIRM HEADCOUNT')
    expect(undetermined!.timing).toBe('Depends on exact headcount')
    // THE COPY MUST NAME NO BAND. It used to open 'Your headcount band (50–249) SPANS THREE
    // DIFFERENT DUTIES', justified as the only SELECTABLE band reaching this arm — true, and false
    // for the other case that reaches it: an UNSET employees answer, where both probes return null
    // and the reader has chosen no band at all. Asserted as an ABSENCE so that re-adding any band
    // name fails here, and paired with the positive assertion below so the arm still has to make its
    // point.
    // Asserted on the POSSESSIVE PHRASE, not on the digits: the copy legitimately contains '150–249'
    // and '100–149' as statutory bands in the enumeration below. What must not appear is a claim
    // about which one the reader is in.
    expect(undetermined!.what).not.toContain('Your headcount band')
    expect(undetermined!.what).not.toContain('Your band')
    expect(undetermined!.what).toContain('SPANS THREE DIFFERENT DUTIES')
    // The three duties are still enumerated — the uncertainty is described, not just announced.
    expect(undetermined!.what).toContain('7 June 2027')
    expect(undetermined!.what).toContain('7 June 2031')
    // A 50-249 employer now gets BOTH Pay Transparency entries: day-one, plus the abstention. Under
    // the dead gate it got only the first, which is the regression this length assertion catches.
    expect(eu('50_249').filter(o => o.name.includes('Pay Transparency'))).toHaveLength(2)
  })

  it('the arms are mutually exclusive — no band gets both the 250+ duty and the abstention', () => {
    for (const band of ['under50', '50_249', '250_499', '500_999', '1000_4999', '5000plus']) {
      const reporting = named(band, 'gender pay gap reporting')
      const undetermined = named(band, 'reporting band undetermined')
      expect(reporting && undetermined).toBeFalsy()
      // And a band definitively under 100 gets neither: the Directive imposes no reporting there.
      if (band === 'under50') expect(reporting || undetermined).toBeFalsy()
      // Not vacuous — day-one is present for every band, so an empty result cannot pass this.
      expect(named(band, 'day-one obligations')).toBeDefined()
    }
  })
})

// ── California pay data: a size test where there was none ────────────────────────────────────────
//
// PINS: page.tsx:235-236. Before 41eb198 this fired on `hasCA` ALONE — any Californian company, at
// any size — while its own copy asserted a 100+ threshold. It now carries `caStaff = empAtLeast(100)`
// and gates on `caStaff !== false`, so the tri-state reaches it: a definite no suppresses the entry,
// a definite yes gives HIGH PRIORITY, and a straddling band gives CONFIRM HEADCOUNT.
//
// ⚠️ WHAT THESE TESTS DO NOT COVER, stated rather than implied. The substantive correction in 41eb198
// was the POPULATION: Gov. Code §12999 counts 100+ payroll employees ANYWHERE IN THE UNITED STATES
// with at least one working in California — not 100 Californian employees. THAT DISTINCTION IS NOT
// OBSERVABLE THROUGH THIS FORM AND NO TEST HERE CAN PIN IT: the form collects a single GLOBAL
// headcount band and a jurisdiction multi-select, and holds neither a US-payroll figure nor a
// Californian one. The gate uses global headcount as a proxy and the entry's copy says so outright
// ("Note this form collects GLOBAL headcount, so confirm the US figure"). So the correction survives
// as COPY, guarded by nothing. What follows pins the size gate and the tri-state branching — the
// half that is mechanised. Treat the population definition as untested.
describe('computeObligations — California pay data size gate (NOT the population — see comment)', () => {
  // $500M so SB 261 fires alongside, giving every absence assertion a live companion.
  const ca = (employees: string) =>
    computeObligations({ jurisdictions: ['california'], revenue: 4, employees })
  const payData = (employees: string) => ca(employees).find(o => o.obligationId === 'ca-pay-data')

  it('a band entirely BELOW 100 produces no entry — the old hasCA-alone gate is gone', () => {
    expect(payData('under50')).toBeUndefined()
    // Not vacuous: the same Californian company at $500M still picks up SB 261.
    expect(ca('under50').length).toBeGreaterThan(0)
  })

  it('a band entirely ABOVE 100 produces an unqualified entry', () => {
    const entry = payData('250_499')
    expect(entry).toBeDefined()
    expect(entry!.urgency_label).toBe('HIGH PRIORITY')
    expect(entry!.urgency).toBe('high')
  })

  it('a band STRADDLING 100 produces the abstention arm, not a guess in either direction', () => {
    const entry = payData('50_249')
    expect(entry).toBeDefined()
    expect(entry!.urgency_label).toBe('CONFIRM HEADCOUNT')
    expect(entry!.urgency).toBe('monitor')
    // The copy must name the US-payroll population even though the form cannot measure it.
    expect(entry!.what).toContain('ANYWHERE IN THE UNITED STATES')
    // AND IT MUST NAME NO BAND. It read 'Your band (50–249) cannot settle whether you cross 100' —
    // true of the one selectable band reaching this arm, a fabricated fact for an UNSET answer.
    // Possessive phrase, not digits — same reasoning as the Pay Transparency arm.
    expect(entry!.what).not.toContain('Your band')
    expect(entry!.what).not.toContain('Your headcount band')
    // The unsettled limb still has to be stated, or the abstention says nothing.
    expect(entry!.what).toContain('cannot settle whether you cross 100')
  })
})

// ── canAdvance: the one guarantee that no unset answer reaches computeObligations ────────────────
//
// WHAT THIS PROTECTS, and why it is the most load-bearing expression on the page. FIVE GATES IN
// computeObligations READ AN UNSET ANSWER AS AN AFFIRMATIVE ONE. `Answers` declares every field
// optional, and the normalisation at page.tsx:79-86 collapses undefined into '' / 0 / [] — legal
// values that nothing downstream can distinguish from a real answer. The five:
//
//   page.tsx:146  `csrdStaff !== false`                  unset employees → CSRD fires, and its
//                                                        timing reads "your 1,000–4,999 band spans
//                                                        that line" — a band never selected
//   page.tsx:340  `caStaff !== false`                    unset employees → CA pay data fires,
//                                                        "Your band (50–249) cannot settle…"
//   page.tsx:332  `pt250 !== true && pt100 !== false`    unset employees → the abstention arm fires,
//                                                        "Your headcount band (50–249)…"
//   page.tsx:209  `hasEU && ai !== 'no'`                 unset ai_use → the AI Act fires at 'high',
//                                                        the same branch as an affirmative answer
//   page.tsx:79   `revenue` defaults to 0                benign today — 0 fails every threshold —
//                                                        but silently rather than by check
//
// THREE OF THE FIVE PUT A HEADCOUNT BAND IN FRONT OF A READER WHO NEVER SELECTED ONE, on a page that
// emails its determination to a named lead. None is reachable today, and THIS EXPRESSION IS THE
// ENTIRE REASON: the Continue button is `disabled={!canProceed}`, and there is no skip affordance,
// no optional question, no deep link and no setStep write that jumps a step.
//
// So the risk is not that canAdvance is wrong. It is that someone loosens it — a skip button, an
// optional question, a URL prefill — and all five go live at once, silently, in copy rather than in
// a crash. That is the same shape as the setStep(8) defect recorded at page.tsx:399, which type-
// checked, passed every test and passed the build, and was found by a person completing the form.
describe('canAdvance — no unset answer may reach computeObligations', () => {
  describe('slider', () => {
    it('undefined blocks — the revenue slider DISPLAYS $750M before it is touched, but holds nothing', () => {
      // page.tsx renders `val ?? 5` for display while `answers.revenue` stays undefined. If this
      // arm ever softened to a truthiness test, index 0 ("Under $50M") would also block.
      expect(canAdvance('slider', undefined)).toBe(false)
    })

    it('any set index proceeds, INCLUDING 0', () => {
      expect(canAdvance('slider', 0)).toBe(true)
      expect(canAdvance('slider', 5)).toBe(true)
      expect(canAdvance('slider', 10)).toBe(true)
    })
  })

  describe('options', () => {
    it('undefined and empty string both block', () => {
      expect(canAdvance('options', undefined)).toBe(false)
      // '' is what the normalisation produces for an unset answer, so it must block too — this is
      // the value the five gates above would actually receive.
      expect(canAdvance('options', '')).toBe(false)
    })

    it('a chosen value proceeds', () => {
      for (const v of ['under50', '5000plus', 'no', 'yes_hr', 'us_listed', 'pe_vc', 'regulatory']) {
        expect(canAdvance('options', v), `${v} should proceed`).toBe(true)
      }
    })
  })

  describe('multiselect', () => {
    it('an empty array blocks, and so does undefined', () => {
      expect(canAdvance('multiselect', [])).toBe(false)
      // undefined reaches the `|| []` default at the call site; assert the function agrees.
      expect(canAdvance('multiselect', undefined)).toBe(false)
    })

    it('one or more entries proceed', () => {
      expect(canAdvance('multiselect', ['eu'])).toBe(true)
      expect(canAdvance('multiselect', ['eu', 'uk', 'california'])).toBe(true)
    })
  })

  // The end-to-end statement, asserted rather than described: every question type refuses the value
  // its own unset state produces. If a future edit makes any of these pass, the five gates above are
  // live and three of them will name a band at a reader who chose none.
  it('EVERY question type refuses its own unset value', () => {
    const unsetByType: [Parameters<typeof canAdvance>[0], unknown][] = [
      ['slider', undefined],
      ['options', undefined],
      ['options', ''],
      ['multiselect', undefined],
      ['multiselect', []],
    ]
    for (const [type, val] of unsetByType) {
      expect(canAdvance(type, val), `${type} must block ${JSON.stringify(val)}`).toBe(false)
    }
    // Not vacuous — each type has at least one value that DOES proceed, so a canAdvance that always
    // returned false could not pass this block.
    expect(canAdvance('slider', 0)).toBe(true)
    expect(canAdvance('options', 'no')).toBe(true)
    expect(canAdvance('multiselect', ['eu'])).toBe(true)
  })
})
