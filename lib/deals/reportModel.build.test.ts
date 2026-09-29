import { describe, it, expect } from 'vitest'
import {
  buildDealReportModel, buildFxBasisRows, fxSameCurrencyNote, fxNoConversionSentence,
  type DealReportModel, type Rich,
} from './reportModel'
import { getFrameworkApplicability, CANADA_S211_JURISDICTION_CAVEAT } from './assessment'
import {
  REPORT_FIXTURES, FIXTURE_GENERATED_AT,
  NEAR_THRESHOLD_DEAL, NOT_ASSESSED_DEAL, FX_DEAL,
} from './reportModel.fixtures'

// buildDealReportModel is the one derivation behind both renderings of the Deals report: the page at
// app/dashboard/deals/report/page.tsx and the generated PDF. These tests pin that each fixture still
// lands in the case it was chosen for, and that the model is plain data a renderer can walk.
//
// WHY NOT A SCREEN SNAPSHOT HERE. The page cannot export DealReport (a Next page file may only export
// its default and route config), so no test can import it. The screen was proved unchanged once, when
// the derivation moved: the pre-move and post-move DealReport rendered byte-identical static HTML for
// these three fixtures and five more branch-covering deals, each with and without the upsell. From here
// the page only reads fields of this model, so a change to what it says is a change to the model, and
// the tests below catch that.

const build = (deal: typeof FX_DEAL) => buildDealReportModel(deal, FIXTURE_GENERATED_AT)
const text = (r: Rich) => r.map(p => (typeof p === 'string' ? p : p.strong)).join('')

describe('buildDealReportModel: each fixture reaches its case', () => {
  it('near-threshold: SECR sits just below, in the near table and in a below note', () => {
    const m = build(NEAR_THRESHOLD_DEAL)
    expect(m.nearThreshold.kind).toBe('table')
    const secr = m.nearThreshold.rows.find(r => r.framework === 'SECR')
    expect(secr).toMatchObject({ chip: 'nearBelow', side: 'Below' })
    expect(m.nearThreshold.belowNotes.map(n => n.framework)).toEqual(['SECR'])
    // Near-but-below does not apply, so it must not reach the applicable list.
    expect(m.applicable.rows.map(r => r.framework)).not.toContain('SECR')
  })

  it('not-assessed: every amber panel a UK deal can raise prints, the S-211 caveat included', () => {
    const m = build(NOT_ASSESSED_DEAL)
    expect(m.applicable.partialPanel?.title).toBe('PARTIAL: SECR NOT ASSESSED')
    expect(m.nearThreshold.kind).toBe('not-assessed')
    // SECR is the only size test a UK deal runs, and its lookback is modelled, so no two-year panel.
    expect(m.sizeTests.panels.map(p => p.title)).toEqual(['CANADA S-211 NOT FULLY ASSESSED'])
    expect(m.risks.unresolvedPanel?.title).toBe('FRAMEWORK COLUMN PARTIALLY RESOLVED')
    // No deal value and no locations: the cost section takes both "not provided" branches.
    expect(m.cost.exposure).toBeNull()
    expect(m.cost.themisIq.figure).toBe('Custom quote: headcount and location count not provided')
    expect(m.cover.rows).toContainEqual(['Deal / investment value', 'Not provided'])
  })

  it('fx-conversion: a USD deal tested against EUR limbs carries the published rate and the conversion', () => {
    const m = build(FX_DEAL)
    const labels = m.fx.rows.map(r => r[0])
    expect(labels).toContain('Published rate: USD')
    expect(labels).toContain('Conversion USD → EUR (CSRD, CS3D)')
    expect(m.fx.rows[2]).toEqual(['Deal currency', 'USD'])
    expect(m.applicable.rows.find(r => r.framework === 'CSRD')?.chip).toBe('applies')
  })
})

describe('buildDealReportModel: shape', () => {
  it.each(REPORT_FIXTURES)('$name is plain data: a JSON round trip changes nothing', ({ deal }) => {
    const m = build(deal)
    expect(JSON.parse(JSON.stringify(m))).toEqual(m)
  })

  it.each(REPORT_FIXTURES)('$name is deterministic for one deal and one instant', ({ deal }) => {
    expect(build(deal)).toEqual(build(deal))
  })

  it.each(REPORT_FIXTURES)('$name: the reference, the cover date and the footer come from one instant', ({ deal }) => {
    const m: DealReportModel = build(deal)
    expect(m.reference).toBe(`${deal.id.slice(0, 8)}-2026-09-29`)
    expect(m.cover.rows.at(-1)).toEqual(['Report generated', m.reportDate])
    expect(m.footer.line).toContain(`Reference ${m.reference}`)
    expect(m.footer.line).toContain(`Generated ${m.reportDate}`)
    expect(text(m.cover.derivedNote)).toContain(m.reportDate)
  })

  it.each(REPORT_FIXTURES)('$name names the target on the cover and in the cost introduction', ({ deal }) => {
    const m = build(deal)
    expect(m.cover.rows[0]).toEqual(['Target company', deal.target_name])
    expect(m.cover.intro).toContain(deal.target_name!)
    expect(m.cost.intro).toContain(deal.target_name!)
  })

  it('a deal with no sector and no jurisdiction evaluates nothing and says so', () => {
    const m = build({ ...FX_DEAL, sector: null, jurisdiction: null })
    expect(m.applicable.kind).toBe('not-evaluated')
    expect(text(m.applicable.notEvaluatedPanel.body)).toContain('not a finding that no framework applies')
    expect(m.risks.kind).toBe('none')
    expect(m.risks.noneSentence).toBe('No sector is set on this deal, so no sector risk findings were produced.')
  })

  it('every section keeps its heading, in report order', () => {
    const m = build(FX_DEAL)
    expect([
      m.applicable.title, m.nearThreshold.title, m.sizeTests.title, m.risks.title,
      m.cost.title, m.dataRoom.title, m.fx.title, m.notice.title,
    ]).toEqual([
      'Applicable frameworks', 'Near-threshold frameworks', 'Size tests applied', 'ESG risk findings',
      'Compliance cost estimate', 'Data-room gaps', 'FX basis for threshold tests', 'Important Notice',
    ])
  })
})

describe('FX basis: rows describe conversions that ran, and nothing else', () => {
  it('a GBP deal tested only against GBP thresholds gets no conversion row', () => {
    const m = build(NEAR_THRESHOLD_DEAL)
    expect(m.fx.rows.map(r => r[0]).filter(l => l.startsWith('Conversion'))).toEqual([])
    // At the source too, not only in the model's assembly.
    const applicability = getFrameworkApplicability('UK', 34_500_000, 'Transport & Logistics', 'ma', 'GBP',
      { total_assets: 17_200_000, employee_count: 240 })
    expect(buildFxBasisRows('GBP', applicability)).toEqual([])
  })

  it('says plainly that nothing was converted, and cites no rate source for a rate nothing used', () => {
    const m = build(NEAR_THRESHOLD_DEAL)
    expect(m.fx.paras).toEqual([['No currency conversion was needed: all figures were tested in GBP, the currency they were entered in.']])
    expect(m.fx.rows.map(r => r[0])).toEqual(['Deal currency', 'Size tests available'])
  })

  it('a deal with no money threshold in scope gets the same plain treatment, with its own reason', () => {
    const m = build({ ...NEAR_THRESHOLD_DEAL, jurisdiction: 'Australia', currency: 'AUD' })
    expect(m.fx.paras).toEqual([['No currency conversion was needed: no size-gated framework with a money figure is in scope for this jurisdiction.']])
    expect(m.fx.rows.map(r => r[0])).toEqual(['Deal currency', 'Size tests available'])
  })

  it('the USD deal against EUR thresholds still gets its published rate and its USD → EUR row', () => {
    const m = build(FX_DEAL)
    expect(m.fx.rows.map(r => r[0])).toEqual([
      'Rate source', 'Rates as of', 'Deal currency',
      'Published rate: USD', 'Conversion USD → EUR (CSRD, CS3D)',
      'Size tests available',
    ])
    expect(m.fx.paras).toHaveLength(2)
  })

  it('a currency with no published rate still reports UNAVAILABLE, not "no conversion needed"', () => {
    const m = build({ ...FX_DEAL, currency: 'JPY' })
    expect(m.fx.rows.find(r => r[0] === 'Rate applied')?.[1]).toMatch(/^UNAVAILABLE/)
    expect(m.fx.paras).toHaveLength(2)
  })
})

describe('FX basis: a mixed deal names what was compared as entered', () => {
  // ⚠️ NO JURISDICTION PRODUCES THIS TODAY: every jurisdiction's money limbs share one currency. So
  // the mixed case is built by joining the engine's own UK and EU rows for one GBP deal: SECR is tested
  // in GBP as entered, CSRD and CS3D in EUR after conversion. The day a jurisdiction tests two
  // currencies, this is the deal it produces.
  const size = { total_assets: 700_000_000, employee_count: 6_000 }
  const mixed = [
    ...getFrameworkApplicability('UK', 1_600_000_000, 'Technology', 'ma', 'GBP', size),
    ...getFrameworkApplicability('European Union', 1_600_000_000, 'Technology', 'ma', 'GBP', size),
  ]

  it('names each same-currency framework with its currency, in one line', () => {
    expect(fxSameCurrencyNote('GBP', mixed)).toBe('Compared as entered, no conversion: SECR (GBP)')
  })

  it('still lists the conversions that ran, and no same-currency row', () => {
    const labels = buildFxBasisRows('GBP', mixed).map(r => r[0])
    expect(labels).toContain('Conversion GBP → EUR (CSRD, CS3D)')
    expect(labels.some(l => l.startsWith('Conversion GBP → GBP'))).toBe(false)
    expect(fxNoConversionSentence('GBP', mixed)).toBeNull()
  })

  it('a deal where nothing was converted keeps its plain sentence and gets no such line', () => {
    const m = build(NEAR_THRESHOLD_DEAL)
    expect(m.fx.paras[0][0]).toMatch(/^No currency conversion was needed/)
    expect(m.fx.sameCurrencyNote).toBeNull()
  })

  it('a deal where everything was converted gets no such line either', () => {
    expect(build(FX_DEAL).fx.sameCurrencyNote).toBeNull()
  })
})

describe('the S-211 jurisdiction caveat', () => {
  it('opens its panel with a capital, and is otherwise the constant verbatim', () => {
    const panel = build(NOT_ASSESSED_DEAL).sizeTests.panels.find(p => p.title === 'CANADA S-211 NOT FULLY ASSESSED')
    const body = panel!.body[0] as string
    expect(body.startsWith('The Act can also apply')).toBe(true)
    const cut = CANADA_S211_JURISDICTION_CAVEAT.slice(CANADA_S211_JURISDICTION_CAVEAT.indexOf(':') + 2)
    expect(body.slice(1)).toBe(cut.slice(1))
  })
})

describe('two-year panels: only for size tests this deal ran', () => {
  const twoYear = (m: DealReportModel) => m.sizeTests.panels.map(p => p.title).filter(t => t.startsWith('TWO-YEAR'))

  it('a UK deal runs no S-211 or CS3D test and gets neither panel', () => {
    expect(twoYear(build(NEAR_THRESHOLD_DEAL))).toEqual([])
    expect(twoYear(build(NOT_ASSESSED_DEAL))).toEqual([])
  })

  it('an EU deal whose CS3D test ran, without the lookback modelled, keeps its CS3D panel', () => {
    const m = build(FX_DEAL)
    expect(m.sizeTests.rows.some(r => r.framework === 'CS3D')).toBe(true)
    expect(twoYear(m)).toEqual(['TWO-YEAR CHECK NOT RUN: CS3D'])
  })

  it('a Canadian deal whose S-211 test ran keeps its S-211 panel, and says "either of the two"', () => {
    const m = build({ ...NEAR_THRESHOLD_DEAL, jurisdiction: 'Canada', currency: 'CAD' })
    expect(twoYear(m)).toEqual(['TWO-YEAR CHECK NOT RUN: Canada S-211'])
    const body = m.sizeTests.panels.find(p => p.title.endsWith('Canada S-211'))!.body[0] as string
    expect(body).toContain('either of the two most recent financial years')
  })

  it('a US deal, which runs SB 253 with its lookback modelled, gets no two-year panel', () => {
    expect(twoYear(build({ ...FX_DEAL, jurisdiction: 'USA' }))).toEqual([])
  })
})
