import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  sectorRisks, SECTOR_RISKS, CONDITION_SCREEN_NOTE, canadaS211CaveatText,
  CANADA_S211_JURISDICTION_CAVEAT,
} from './assessment'
import { buildDealReportModel, compactMoneyRange, NO_PRICED_OBLIGATION, GLOBAL_FIGURES_NOTE, type DealReportModel } from './reportModel'
import { NOT_ASSESSED_DEAL, FX_DEAL, FIXTURE_GENERATED_AT } from './reportModel.fixtures'
import { EU_ECGT_FRAMEWORK, EU_MEMBER_CODES, homeMarkets, startingMarkets, marketsOnJurisdictionChange, draftMarkets } from './markets'
import { parseDealDraft } from './draft'

// Pre-ship fixes from the sample review (29 Sep 2026): market-aware conditions, third-person wording,
// the nothing-included headline, the GHG floor, the ECGT name and the value-at-risk rounding.

const find = (sector: string, jurisdiction: string, label: string, markets?: Parameters<typeof sectorRisks>[2]) => {
  const template = SECTOR_RISKS[sector].find(r => r.conditional?.label === label)!
  return sectorRisks(sector, jurisdiction, markets).find(r => r.risk === template.risk)!
}
const EU_MARKET = 'Conditioned on EU market access.'

describe('a market-access condition follows the sales markets', () => {
  it('an EU market ticked establishes it, and says so', () => {
    const r = find('Industrials & Manufacturing', 'USA', EU_MARKET, { sales_markets: ['DE'] })
    expect(r.scope).toBe('established')
    expect(r.detail).toContain('The target sells into or operates in the EU, so this applies to its EU activity.')
  })

  it('markets recorded without the EU: still conditioned, and the absence is stated', () => {
    const r = find('Industrials & Manufacturing', 'USA', EU_MARKET, { sales_markets: ['US', 'CA'] })
    expect(r.scope).toBe('conditional')
    expect(r.scope === 'conditional' && r.condition).toContain('The target does not report EU sales or operations. Confirm before ruling it out.')
  })

  it('markets not sure, or never recorded, keep the primary-jurisdiction wording', () => {
    for (const m of [{ sales_markets: null, sales_markets_not_sure: true }, { sales_markets: null, sales_markets_not_sure: null }, undefined]) {
      const r = find('Industrials & Manufacturing', 'USA', EU_MARKET, m)
      expect(r.scope === 'conditional' && r.condition).toContain(CONDITION_SCREEN_NOTE)
    }
  })

  it('EU ETS routes are the EEA: Norway alone meets it', () => {
    const r = find('Transport & Logistics', 'USA', 'Conditioned on EEA routes.', { sales_markets: ['NO'] })
    expect(r.scope).toBe('established')
    expect(r.detail).toContain('so this applies to its EEA activity.')
  })

  it('EU or UK property: the UK alone meets it, and neither names both', () => {
    const label = 'Conditioned on EU or UK property holdings.'
    expect(find('Real Estate', 'USA', label, { sales_markets: ['GB'] }).detail).toContain('so this applies to its UK activity.')
    const r = find('Real Estate', 'USA', label, { sales_markets: ['US'] })
    expect(r.scope === 'conditional' && r.condition).toContain('The target does not report EU or UK sales or operations.')
  })
})

describe('a scope condition states the market and stays conditioned', () => {
  it('ESRS S2 with an EU market: the market is stated, CSRD reach is not settled', () => {
    const r = find('Technology', 'USA', 'Conditioned on EU reporting scope.', { sales_markets: ['FR'] })
    expect(r.scope).toBe('conditional')
    expect(r.scope === 'conditional' && r.condition).toContain(
      'The target sells into or operates in the EU, which this needs; whether CSRD reaches the target is not established here.')
  })

  it('Modern Slavery with Australia ticked: turnover still decides', () => {
    const r = find('Consumer & Retail', 'USA', 'Conditioned on UK or Australian turnover.', { sales_markets: ['AU'] })
    expect(r.scope).toBe('conditional')
    expect(r.scope === 'conditional' && r.condition).toContain('sells into or operates in Australia, which this needs')
  })
})

describe('no second person in any condition', () => {
  it('across every sector and every markets state', () => {
    for (const sector of Object.keys(SECTOR_RISKS))
      for (const m of [undefined, { sales_markets: ['FR', 'GB', 'AU'] }, { sales_markets: ['US'] }, { sales_markets: null, sales_markets_not_sure: true }])
        for (const r of sectorRisks(sector, 'USA', m)) {
          const text = `${r.detail} ${r.scope === 'conditional' ? r.condition : ''}`
          expect(text, r.risk).not.toMatch(/\b(you|your|yours)\b/i)
        }
  })
})

describe('the Canada S-211 caveat text', () => {
  it('is today’s sentence, capitalised; it is shown only for markets "not sure" (see canadaCaveatForMarkets)', () => {
    const t = canadaS211CaveatText()
    expect(t.body.slice(1)).toBe(CANADA_S211_JURISDICTION_CAVEAT.slice(CANADA_S211_JURISDICTION_CAVEAT.indexOf(':') + 3))
    expect(t.body.charAt(0)).toBe('T')
  })
})

describe('cost section wording', () => {
  it('nothing included: the headline alone, and the one note', () => {
    const m = buildDealReportModel(NOT_ASSESSED_DEAL, FIXTURE_GENERATED_AT)
    expect(m.cost.themisIq.figure).toBe(NO_PRICED_OBLIGATION)
    expect(NO_PRICED_OBLIGATION).toBe('No priced obligation')
    expect(m.cost.themisIq.note).toBe('Recommended modules are priced individually below.')
  })

  it('a GHG row with neither headcount nor locations shows the floor, its note unchanged', () => {
    const m = buildDealReportModel(NOT_ASSESSED_DEAL, FIXTURE_GENERATED_AT)
    const ghg = m.cost.recommended.rows.find(r => r.label === 'GHG inventory & Scope 3')!
    expect(ghg.themisIq).toBe('From USD 475')
    expect(ghg.scopeNote).toContain('Not priced: neither headcount nor location count was provided.')
  })
})

describe('the ECGT row name', () => {
  it('is spelled out, with its short form and its citation', () => {
    expect(EU_ECGT_FRAMEWORK).toBe('EU Empowering Consumers Directive (ECGT)')
    const row = buildDealReportModel(FX_DEAL, FIXTURE_GENERATED_AT).applicable.rows.find(r => r.framework === EU_ECGT_FRAMEWORK)
    expect(row?.citation).toBe('Directive (EU) 2024/825')
  })
})

describe('value-at-risk rounding', () => {
  it('two significant figures, in the unit of the higher end', () => {
    expect(compactMoneyRange('USD', 600_000, 1_200_000)).toBe('USD 0.6M–1.2M')
    expect(compactMoneyRange('GBP', 240_000, 480_000)).toBe('GBP 240k–480k')
    expect(compactMoneyRange('USD', 4_812_345, 12_034_567)).toBe('USD 4.8M–12M')
    expect(compactMoneyRange('EUR', 450, 900)).toBe('EUR 450–900')
  })

  it('the report prints it that way', () => {
    const m = buildDealReportModel(FX_DEAL, FIXTURE_GENERATED_AT)
    const text = m.cost.exposure!.map(p => (typeof p === 'string' ? p : p.strong)).join('')
    expect(text).toMatch(/\(USD \d+(\.\d)?M–\d+(\.\d)?M\)/)
    expect(text).not.toMatch(/\d{1,3},\d{3},\d{3}/)
  })
})

// ── Home market pre-tick, and Canada S-211 through the sales markets (29 Sep 2026) ────────────────
describe('the picker starts with the home market', () => {
  it('each jurisdiction’s home market; Global and Other none', () => {
    expect(homeMarkets('USA')).toEqual(['US'])
    expect(homeMarkets('UK')).toEqual(['GB'])
    expect(homeMarkets('Canada')).toEqual(['CA'])
    expect(homeMarkets('Australia')).toEqual(['AU'])
    expect(homeMarkets('European Union')).toEqual([...EU_MEMBER_CODES])   // the EU group, ticked whole
    expect(homeMarkets('Global')).toBeNull()
    expect(homeMarkets('Other')).toBeNull()
  })

  it('a new USA deal starts with US ticked, as a pre-tick that may follow the jurisdiction', () => {
    expect(startingMarkets({ sales_markets: null, sales_markets_not_sure: null }, 'USA')).toEqual({ sales_markets: ['US'], auto: true })
  })

  it('a saved answer is never altered, "not sure" included', () => {
    expect(startingMarkets({ sales_markets: ['CA', 'FR'], sales_markets_not_sure: null }, 'USA')).toEqual({ sales_markets: ['CA', 'FR'], auto: false })
    expect(startingMarkets({ sales_markets: null, sales_markets_not_sure: true }, 'USA')).toEqual({ sales_markets: null, auto: false })
    expect(startingMarkets({ sales_markets: null, sales_markets_not_sure: null }, 'Global')).toEqual({ sales_markets: null, auto: false })
  })

  it('the wizard wires it: new deal, load, draft, jurisdiction change, and the first edit', () => {
    const src = readFileSync(join(process.cwd(), 'app/dashboard/deals/page.tsx'), 'utf8')
    expect(src).toContain("sales_markets: homeMarkets('USA') as string[] | null")
    expect(src).toContain('const loadedMarkets = startingMarkets({')
    expect(src).toContain('marketsOnJurisdictionChange({ sales_markets: deal.sales_markets, auto: marketsAuto }, e.target.value)')
    expect(src).toContain('sales_markets: draftMarkets({ sales_markets: deal.sales_markets, auto: marketsAuto })')
    expect(src).toContain("setMarketsAuto(false); update('sales_markets', markets)")
  })
})

describe('Canada S-211 for a non-Canadian target selling into Canada', () => {
  const usTarget = (over: Record<string, unknown>) => buildDealReportModel({
    ...FX_DEAL, jurisdiction: 'USA', currency: 'USD', listed_ca_exchange: null,
    sales_markets: ['US', 'CA'], sales_markets_not_sure: null, ...over,
  } as typeof FX_DEAL, FIXTURE_GENERATED_AT)
  const s211 = (m: DealReportModel) => m.sizeTests.rows.filter(r => r.framework === 'Canada S-211')

  it('figures above the thresholds: the size test runs and S-211 APPLIES', () => {
    const m = usTarget({ revenue: 100_000_000, employee_count: 300, total_assets: 50_000_000 })
    expect(m.applicable.rows.find(r => r.framework === 'Canada S-211')?.chip).toBe('applies')
    expect(s211(m).length).toBe(3)
    for (const r of s211(m)) {
      expect(r.isProxy).toBe(true)
      expect(r.basisOfValue).toContain(GLOBAL_FIGURES_NOTE)
    }
  })

  it('figures below: every limb NOT MET, and S-211 does not apply', () => {
    const m = usTarget({ revenue: 5_000_000, employee_count: 20, total_assets: 1_000_000 })
    expect(m.applicable.rows.some(r => r.framework === 'Canada S-211')).toBe(false)
    expect(s211(m).map(r => r.result)).toEqual(['NOT MET', 'NOT MET', 'NOT MET'])
  })

  it('markets "not sure": no size test, the caveat instead, in today’s wording', () => {
    const m = usTarget({ sales_markets: null, sales_markets_not_sure: true, revenue: 100_000_000, employee_count: 300, total_assets: 50_000_000 })
    expect(s211(m)).toEqual([])
    const caveat = m.sizeTests.panels.find(p => p.title === 'CANADA S-211 NOT FULLY ASSESSED')
    expect(caveat?.body[0]).toBe(canadaS211CaveatText().body)
  })

  it('markets without Canada: no size test and no caveat', () => {
    const m = usTarget({ sales_markets: ['US', 'MX'], revenue: 100_000_000, employee_count: 300, total_assets: 50_000_000 })
    expect(s211(m)).toEqual([])
    expect(m.sizeTests.panels.some(p => p.title === 'CANADA S-211 NOT FULLY ASSESSED')).toBe(false)
  })

  it('a listing Yes still takes the listing route first', () => {
    const m = usTarget({ listed_ca_exchange: true, revenue: 5_000_000, employee_count: 20, total_assets: 1_000_000 })
    expect(m.applicable.rows.find(r => r.framework === 'Canada S-211')?.chip).toBe('verify')
    expect(s211(m)).toEqual([])
  })

  it('a Canadian target’s own limbs carry no global-figures note', () => {
    const m = usTarget({ jurisdiction: 'Canada', currency: 'CAD', revenue: 100_000_000, employee_count: 300, total_assets: 50_000_000 })
    for (const r of s211(m)) expect(r.basisOfValue).not.toContain(GLOBAL_FIGURES_NOTE)
  })
})

describe('the pre-tick follows the jurisdiction until the user edits the markets', () => {
  it('new deal, USA, then UK: markets are [GB]', () => {
    const start = startingMarkets({ sales_markets: null, sales_markets_not_sure: null }, 'USA')
    expect(start).toEqual({ sales_markets: ['US'], auto: true })
    expect(marketsOnJurisdictionChange(start, 'UK')).toEqual({ sales_markets: ['GB'], auto: true })
  })

  it('the same sequence through the sign-in draft: USA, sign in, then UK gives [GB]', () => {
    // THE BUG FOUND ON LOCALHOST. The draft stored the pre-tick ['US'] as a list, so the restore read it
    // as an answer and UK left United States ticked. It stores NULL for a pre-tick now.
    const start = startingMarkets({ sales_markets: null, sales_markets_not_sure: null }, 'USA')
    const draft = parseDealDraft(JSON.stringify({ target_name: 'X', jurisdiction: 'USA', sales_markets: draftMarkets(start) }))!
    const restored = startingMarkets({ sales_markets: draft.sales_markets ?? null, sales_markets_not_sure: draft.sales_markets_not_sure ?? null }, draft.jurisdiction)
    expect(restored).toEqual({ sales_markets: ['US'], auto: true })
    expect(marketsOnJurisdictionChange(restored, 'UK').sales_markets).toEqual(['GB'])
  })

  it('what the old draft did, for the record: a stored US list reads as an answer and does not move', () => {
    const restored = startingMarkets({ sales_markets: ['US'], sales_markets_not_sure: null }, 'USA')
    expect(marketsOnJurisdictionChange(restored, 'UK').sales_markets).toEqual(['US'])
  })

  it('once the user ticks or unticks, the markets are theirs and stay put', () => {
    const edited = { sales_markets: ['US', 'CA'], auto: false }
    expect(marketsOnJurisdictionChange(edited, 'UK')).toBe(edited)
    expect(draftMarkets(edited)).toEqual(['US', 'CA'])
  })

  it('Global names no home market, and the pre-tick clears rather than lingering', () => {
    const start = startingMarkets({ sales_markets: null, sales_markets_not_sure: null }, 'USA')
    expect(marketsOnJurisdictionChange(start, 'Global')).toEqual({ sales_markets: null, auto: true })
  })
})
