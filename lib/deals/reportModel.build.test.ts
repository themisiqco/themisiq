import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildDealReportModel, buildFxBasisRows, fxSameCurrencyNote, fxNoConversionSentence,
  makeMapFramework, type DealReportModel, type Rich,
} from './reportModel'
import {
  getFrameworkApplicability, CANADA_S211_JURISDICTION_CAVEAT, GHG_RECOMMENDED_REASON, withoutMarketExpectations, SECTOR_RISKS,
  SFDR_VERIFY, FCA_CLIMATE_VERIFY, UK_SDR_VERIFY, ANTI_GREENWASHING_VERIFY, ETS_VERIFY, EU_TAXONOMY_RULE, UK_SRS_NOTE,
} from './assessment'
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
    // Nothing applies (SECR unresolved), so nothing is included: the card says so rather than
    // prompting for a headcount that would price nothing.
    expect(m.cost.themisIq.figure).toBe('No priced obligation')
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

// ── Framework statuses (29 Sep 2026) ───────────────────────────────────────────────────────────
describe('framework statuses: applies, applies-verify and market', () => {
  const applying = (m: DealReportModel) => m.applicable.rows.map(r => r.framework)
  const marketNames = (m: DealReportModel) => m.market.rows.map(r => r.framework)

  it.each(REPORT_FIXTURES)('$name lists IFRS S2 and TCFD as market expectations, never as applying', ({ deal }) => {
    const m = build(deal)
    expect(m.market.title).toBe('Investor and market expectations')
    expect(m.market.intro).toBe('Not legal requirements for this target on the information provided. Investors, lenders and customers increasingly expect them.')
    expect(marketNames(m)).toEqual(expect.arrayContaining(['IFRS S2', 'TCFD']))
    expect(m.market.rows.every(r => r.chip === 'market')).toBe(true)
    expect(applying(m)).not.toContain('IFRS S2')
    expect(applying(m)).not.toContain('TCFD')
  })

  it('DEALS TEST USA: USD 100M, 250 staff, Energy & Utilities, SB 253 not met', () => {
    const m = build({
      ...FX_DEAL, target_name: 'Deals Test USA', jurisdiction: 'USA', currency: 'USD', sector: 'Energy & Utilities',
      revenue: 100_000_000, employee_count: 250, total_assets: 80_000_000, location_count: 2, deal_value: 300_000_000,
      sales_markets: ['US'], sales_markets_not_sure: null, env_claims: 'no',
    })
    expect(m.applicable.rows).toEqual([])                      // no APPLIES rows at all
    expect(m.applicable.kind).toBe('none')
    expect(m.sizeTests.rows.find(r => r.framework === 'SB 253')?.state).toBe('not-met')
    expect(marketNames(m)).toEqual(['IFRS S2', 'TCFD'])
    // GHG is recommended, not included, and says why.
    expect(m.cost.included.rows).toEqual([])
    const ghg = m.cost.recommended.rows.find(r => r.label === 'GHG inventory & Scope 3')!
    expect(ghg.scopeNote!.startsWith(GHG_RECOMMENDED_REASON)).toBe(true)
    // Nothing included: the cards say so rather than printing zeros.
    expect(m.cost.themisIq.figure).toBe('No priced obligation')
    expect(m.cost.consultant.figure).toBe('No included obligation')
    expect(m.cost.intro).toContain('carries a priced obligation, so there is no compliance cost to estimate')
  })

  it('UK financial services: SECR applies, the FCA rules are APPLIES: VERIFY, UK SRS and PCAF are market', () => {
    const m = build({
      ...NEAR_THRESHOLD_DEAL, sector: 'Financial Services', revenue: 60_000_000, employee_count: 300, total_assets: 25_000_000,
    })
    const row = (f: string) => m.applicable.rows.find(r => r.framework === f)
    expect(row('SECR')).toMatchObject({ chip: 'applies', verify: null })
    expect(row('FCA climate disclosure (TCFD)')).toMatchObject({ chip: 'verify', verify: FCA_CLIMATE_VERIFY })
    expect(row('UK SDR')).toMatchObject({ chip: 'verify', verify: UK_SDR_VERIFY })
    expect(row('Anti-greenwashing rule')).toMatchObject({ chip: 'verify', verify: ANTI_GREENWASHING_VERIFY })
    expect(m.market.rows.find(r => r.framework === 'UK SRS (S1/S2)')?.note).toBe(UK_SRS_NOTE)
    expect(marketNames(m)).toEqual(expect.arrayContaining(['IFRS S2', 'TCFD', 'PCAF']))
    // SECR requires a GHG inventory, so GHG is included; financed emissions is not an obligation.
    expect(m.cost.included.rows.map(r => r.label)).toEqual(['GHG inventory & Scope 3'])
  })

  it('EU heavy industry: CSRD and EU Taxonomy apply, EU ETS is APPLIES: VERIFY, GHG and supply chain included', () => {
    const m = build({
      ...FX_DEAL, currency: 'EUR', sector: 'Energy & Utilities', revenue: 900_000_000, employee_count: 3_000, total_assets: 1_000_000_000,
    })
    const row = (f: string) => m.applicable.rows.find(r => r.framework === f)
    expect(row('CSRD')?.chip).toBe('applies')
    expect(row('EU Taxonomy')).toMatchObject({ chip: 'applies', basis: EU_TAXONOMY_RULE })
    expect(row('EU ETS')).toMatchObject({ chip: 'verify', verify: ETS_VERIFY })
    expect(m.cost.included.rows.map(r => r.label)).toEqual(['GHG inventory & Scope 3', 'Supply chain / Scope 3'])
  })

  it('EU financial services: SFDR is APPLIES: VERIFY with its condition', () => {
    const m = build({ ...FX_DEAL, sector: 'Financial Services' })
    expect(m.applicable.rows.find(r => r.framework === 'SFDR')).toMatchObject({ chip: 'verify', verify: SFDR_VERIFY })
  })
})

// ── Final fixes before shipping (29 Sep 2026) ────────────────────────────────────────────────────
describe('the share page leaves market expectations out of a stored frameworks list', () => {
  it('a deal saved with IFRS S2 and TCFD shows neither, and keeps everything else in order', () => {
    expect(withoutMarketExpectations(['SB 253', 'IFRS S2', 'TCFD', 'EU Taxonomy', 'PCAF', 'UK SRS (S1/S2)']))
      .toEqual(['SB 253', 'EU Taxonomy'])
    expect(withoutMarketExpectations(null)).toEqual([])
    expect(withoutMarketExpectations(['IFRS S2', 42])).toEqual([])
  })

  it('the share page applies it to what it draws', () => {
    const src = readFileSync(join(process.cwd(), 'app/deals/[token]/page.tsx'), 'utf8')
    expect(src).toContain('const frameworks = withoutMarketExpectations(data.frameworks)')
  })
})

describe('risk findings name IFRS S2 / TCFD / PCAF as an investor expectation', () => {
  const LABEL = 'Investor expectation (IFRS S2 / TCFD)'
  it('the templates carry the label, and no template names IFRS S2 or TCFD bare', () => {
    const labelled = Object.entries(SECTOR_RISKS).flatMap(([sector, rs]) => rs.filter(r => r.framework === LABEL).map(r => `${sector}: ${r.risk}`))
    expect(labelled.sort()).toEqual([
      // The four from before 29 Sep 2026.
      'Energy & Utilities: Physical climate risk exposure', 'Energy & Utilities: Stranded asset risk',
      'Real Estate: Physical flood and heat risk', 'Transport & Logistics: Infrastructure physical risk',
      // Stage 3b.
      'Hospitality, Leisure & Travel: Physical climate risk to destinations and assets',
      'Oil & Gas: Physical climate risk exposure', 'Oil & Gas: Stranded asset risk',
      'Power & Utilities (incl. renewables): Physical climate risk to generation and network assets',
      'Power & Utilities (incl. renewables): Transition asset risk across generation, renewables and networks',
    ].sort())
    for (const r of Object.values(SECTOR_RISKS).flat()) expect(r.framework, r.risk).not.toMatch(/^(IFRS S2|TCFD)( \/ (IFRS S2|TCFD))?$/)
  })

  // PCAF joined the rule on 29 Sep 2026: it is in MARKET_FRAMEWORKS beside IFRS S2 and TCFD. The legacy
  // Financial Services 'Financed emissions' template was relabelled from 'PCAF / CSRD' the same day.
  it('the PCAF findings carry "Investor expectation (PCAF)", and nothing names PCAF bare', () => {
    const pcaf = Object.entries(SECTOR_RISKS).flatMap(([sector, rs]) => rs.filter(r => r.framework.includes('PCAF')).map(r => `${sector}: ${r.risk}: ${r.framework}`))
    expect(pcaf.sort()).toEqual([
      'Financial Services: Financed emissions (Scope 3 Cat.15): Investor expectation (PCAF) / CSRD',
      'Insurance: Insurance-associated and investment emissions: Investor expectation (PCAF) / CSRD',
    ])
    expect(makeMapFramework([], undefined)('Investor expectation (PCAF) / CSRD').map(t => t.text)[0]).toBe('Investor expectation (PCAF)')
  })

  it('the loan-book finding pairs the ECB with TCFD as an investor expectation', () => {
    const loanBook = Object.values(SECTOR_RISKS).flat().find(r => r.risk === 'Physical risk in loan book')!
    expect(loanBook.framework).toBe('ECB / Investor expectation (TCFD)')
    // Two tokens: the ECB, and the expectation, each printed whole.
    expect(makeMapFramework([], undefined)(loanBook.framework).map(t => t.text)).toEqual(['ECB', 'Investor expectation (TCFD)'])
    // And no template names TCFD, IFRS S2 or PCAF outside an investor-expectation label.
    for (const r of Object.values(SECTOR_RISKS).flat())
      for (const tok of r.framework.split(/ \/ (?![^()]*\))/))
        expect(tok, r.risk).not.toMatch(/^(IFRS S2|TCFD|PCAF)$/)
  })

  it('the label prints whole: the bracketed " / " is not a token separator', () => {
    expect(makeMapFramework([], undefined)(LABEL)).toEqual([{ text: LABEL }])
    // A real separator still splits.
    expect(makeMapFramework(['SECR'], undefined)('EU Taxonomy / SECR').map(t => t.text)).toEqual(['EU Taxonomy', 'SECR'])
  })
})

describe('no identifier reaches customer-facing copy', () => {
  // Fields holding keys a renderer switches on, not text it prints.
  const KEY_FIELDS = new Set(['chip', 'severity', 'kind', 'state', 'key'])
  const copyOf = (v: unknown): string[] =>
    typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(copyOf)
      : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => (KEY_FIELDS.has(k) ? [] : copyOf(x))) : []
  const LEAKS = /\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b|\b[a-z]+[A-Z][A-Za-z]+\b|\$\{|\bundefined\b|\bNaN\b|\bnull\b|\[object/
  // Real words the camelCase arm matches, each named. 'pEPR' is the UK government's own short form for
  // packaging extended producer responsibility, printed in the reviewed label 'PPWR / UK pEPR'.
  const NOT_IDENTIFIERS = /\bpEPR\b/g

  it('across jurisdictions, sectors, sizes and claims answers (URLs excepted)', () => {
    const found = new Set<string>()
    for (const jurisdiction of ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other'])
      for (const sector of [...Object.keys(SECTOR_RISKS), 'Other'])
        for (const claims of [{}, { sales_markets: ['FR', 'US-CA', 'BR', 'GB', 'CA', 'AU'], env_claims: 'yes' }, { sales_markets: null, sales_markets_not_sure: true, env_claims: 'not_sure' }])
          for (const sized of [true, false]) {
            const m = build({ ...FX_DEAL, jurisdiction, sector, ...claims,
              employee_count: sized ? 3000 : null, total_assets: sized ? 1e9 : null, listed_ca_exchange: sized ? true : null })
            for (const s of copyOf(m)) {
              const text = s.replace(/https?:\/\/\S+/g, '').replace(NOT_IDENTIFIERS, '')
              const hit = text.match(LEAKS)
              if (hit) found.add(`${hit[0]} in "${text.slice(0, 80)}"`)
            }
          }
    expect([...found]).toEqual([])
  })
})
