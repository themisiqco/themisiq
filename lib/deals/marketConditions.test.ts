import { describe, it, expect } from 'vitest'
import {
  sectorRisks, SECTOR_RISKS, CONDITION_SCREEN_NOTE, canadaS211CaveatText, CANADA_S211_MARKET_SENTENCE,
  CANADA_S211_JURISDICTION_CAVEAT,
} from './assessment'
import { buildDealReportModel, compactMoneyRange, NO_PRICED_OBLIGATION } from './reportModel'
import { NOT_ASSESSED_DEAL, FX_DEAL, FIXTURE_GENERATED_AT } from './reportModel.fixtures'
import { EU_ECGT_FRAMEWORK } from './markets'

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

describe('the Canada S-211 caveat, with Canada ticked', () => {
  it('states the market and what is not run', () => {
    const t = canadaS211CaveatText({ sales_markets: ['CA'] })
    expect(t.body).toContain(CANADA_S211_MARKET_SENTENCE)
    expect(t.body).not.toContain('records one primary jurisdiction')
  })

  it('keeps today’s sentence when markets are not sure', () => {
    const t = canadaS211CaveatText({ sales_markets: null, sales_markets_not_sure: true })
    expect(t.body.slice(1)).toBe(CANADA_S211_JURISDICTION_CAVEAT.slice(CANADA_S211_JURISDICTION_CAVEAT.indexOf(':') + 3))
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
