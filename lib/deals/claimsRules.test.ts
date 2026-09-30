import { describe, it, expect } from 'vitest'
import {
  CLAIMS_RULES, CLAIMS_FALLBACK, NO_CLAIMS_NOTE, CLAIMS_UNRECORDED_LINE, MARKETS_NOT_CONFIRMED,
  CLAIMS_DATA_ROOM_ITEM, CLAIMS_FINDING_TITLE, assessClaims, rulesForMarkets, isMarketCode,
} from './claimsRules'
import {
  MARKETS_UNRECORDED_LINE, EU_MEMBER_CODES, EU_ECGT_FRAMEWORK, CA_AB1305_FRAMEWORK,
  EU_ECGT_RULE, EU_ECGT_VERIFY, CA_AB1305_RULE, CA_AB1305_VERIFY, canadaCaveatForMarkets,
} from './markets'
import { getFrameworkApplicability } from './assessment'
import { buildDealReportModel, REGIME_FALLBACK, makeMapFramework, type DealReportModel } from './reportModel'
import { FX_DEAL, NEAR_THRESHOLD_DEAL, FIXTURE_GENERATED_AT } from './reportModel.fixtures'
import { parseDealDraft } from './draft'

// Environmental claims, sales markets, and the S-211 caveat they now gate (29 Sep 2026).

const finding = (sales_markets: string[] | null, env_claims: string | null, sales_markets_not_sure: boolean | null = null) =>
  assessClaims({ sales_markets, sales_markets_not_sure, env_claims })

const CANADA_CAVEAT = 'CANADA S-211 NOT FULLY ASSESSED'
const build = (over: Partial<typeof FX_DEAL>): DealReportModel => buildDealReportModel({ ...FX_DEAL, ...over }, FIXTURE_GENERATED_AT)
// A UK deal is the plain case for the caveat: not Canadian, not listed, so markets decide.
const ukDeal = (over: Partial<typeof FX_DEAL>) => buildDealReportModel({ ...NEAR_THRESHOLD_DEAL, ...over }, FIXTURE_GENERATED_AT)

describe('the rules table', () => {
  it('holds exactly the researched jurisdictions, each sourced and dated', () => {
    expect(CLAIMS_RULES.map(r => r.key)).toEqual(['EU', 'GB', 'CA', 'US', 'US-CA', 'AU', 'NZ', 'IN', 'TR', 'KR', 'SG'])
    for (const r of CLAIMS_RULES) {
      expect(r.researchRef, r.key).toMatch(/^https:\/\//)
      expect(r.lastVerified, r.key).toBe('2026-09-29')
      expect(r.law.length, r.key).toBeGreaterThan(0)
      expect(r.maxPenalty.length, r.key).toBeGreaterThan(0)
    }
  })

  it('prints a primary citation for every market that has one, and no law-firm link there', () => {
    const withPrimary = CLAIMS_RULES.filter(r => r.citation).map(r => r.key)
    expect(withPrimary).toEqual(['EU', 'GB', 'CA', 'US', 'US-CA', 'AU', 'NZ', 'IN'])
    expect(CLAIMS_RULES.find(r => r.key === 'EU')!.citation).toBe('Directive (EU) 2024/825, eur-lex.europa.eu/eli/dir/2024/825/oj')
    for (const key of withPrimary) {
      const f = assessClaims({ sales_markets: [key === 'EU' ? 'FR' : key], env_claims: 'yes' })
      if (f.kind !== 'finding') throw new Error('expected a finding')
      for (const l of f.lines) expect(l.source, key).not.toMatch(/lw\.com|reedsmith|mltaikins|natlawreview|velaw|allens|lawrbit/)
    }
  })

  it('marks turnover-based penalties exactly where the research gives one', () => {
    expect(CLAIMS_RULES.filter(r => r.turnoverBased).map(r => r.key)).toEqual(['EU', 'GB', 'CA', 'AU'])
  })
})

describe('each researched market, with yes / not sure / no', () => {
  // One member state stands in for the EU; California is its own market.
  const MARKET_FOR: Record<string, string> = { EU: 'FR', 'US-CA': 'US-CA' }
  for (const rule of CLAIMS_RULES) {
    const code = MARKET_FOR[rule.key] ?? rule.key

    it(`${rule.key}: yes is APPLIES, with its law and penalty, and the right severity`, () => {
      const f = finding([code], 'yes')
      if (f.kind !== 'finding') throw new Error('expected a finding')
      expect(f.title).toBe(CLAIMS_FINDING_TITLE)
      expect(f.status).toBe('applies')
      const line = f.lines.find(l => l.law === rule.law)!
      expect(line.maxPenalty).toBe(rule.maxPenalty)
      // The primary citation prints where there is one; the research reference only where there is not.
      expect(line.source).toBe(rule.citation ?? rule.researchRef)
      expect(line.sourceUrl).toBe(rule.citation ? rule.citationUrl : rule.researchRef)
      // California also brings in the federal rule, which is not turnover-based either.
      expect(f.severity).toBe(rule.turnoverBased ? 'high' : 'medium')
      expect(f.fallback).toBeNull()
      expect(f.notConfirmed).toBeNull()
    })

    it(`${rule.key}: not sure is APPLIES: VERIFY`, () => {
      const f = finding([code], 'not_sure')
      expect(f.kind === 'finding' && f.status).toBe('verify')
    })

    it(`${rule.key}: no is the note, not a finding`, () => {
      expect(finding([code], 'no')).toEqual({ kind: 'note', text: NO_CLAIMS_NOTE })
    })
  }
})

describe('markets roll up and fall back', () => {
  it('any EU member state brings in the one EU rule, once', () => {
    const { rules, other } = rulesForMarkets(['FR', 'DE', 'IT'])
    expect(rules.map(r => r.key)).toEqual(['EU'])
    expect(other).toEqual([])
    for (const c of EU_MEMBER_CODES) expect(rulesForMarkets([c]).rules.map(r => r.key)).toEqual(['EU'])
  })

  it('California gets both the US rule and AB 1305', () => {
    const f = finding(['US-CA'], 'yes')
    expect(f.kind === 'finding' && f.lines.map(l => l.market)).toEqual(['United States', 'California'])
  })

  it('an unresearched country gets the fallback, in one combined line', () => {
    const f = finding(['BR', 'JP'], 'yes')
    if (f.kind !== 'finding') throw new Error('expected a finding')
    expect(f.lines).toEqual([])
    expect(f.fallback).toBe(`Brazil, Japan: ${CLAIMS_FALLBACK}`)
    expect(f.severity).toBe('medium')
  })

  it('researched and unresearched together: a line each, plus one fallback', () => {
    const f = finding(['GB', 'BR'], 'yes')
    if (f.kind !== 'finding') throw new Error('expected a finding')
    expect(f.lines.map(l => l.market)).toEqual(['United Kingdom'])
    expect(f.fallback).toBe(`Brazil: ${CLAIMS_FALLBACK}`)
    expect(f.severity).toBe('high')
  })
})

describe('markets not sure, and markets or claims never recorded', () => {
  it('markets "not sure" is APPLIES: VERIFY with the not-confirmed sentence', () => {
    const f = finding(null, 'yes', true)
    if (f.kind !== 'finding') throw new Error('expected a finding')
    expect(f.status).toBe('verify')
    expect(f.notConfirmed).toBe(MARKETS_NOT_CONFIRMED)
    expect(f.lines).toEqual([])
    expect(f.severity).toBe('medium')
  })

  it('markets "not sure" alongside some markets keeps their lines, still VERIFY', () => {
    const f = finding(['GB'], 'yes', true)
    expect(f.kind === 'finding' && [f.status, f.lines.length, f.notConfirmed]).toEqual(['verify', 1, MARKETS_NOT_CONFIRMED])
  })

  it('an old deal, both columns NULL, gets the quiet line and no finding', () => {
    expect(finding(null, null)).toEqual({ kind: 'note', text: MARKETS_UNRECORDED_LINE })
    expect(finding(null, 'yes')).toEqual({ kind: 'note', text: MARKETS_UNRECORDED_LINE })
  })

  it('markets recorded but claims never asked says so, rather than falling silent', () => {
    expect(finding(['GB'], null)).toEqual({ kind: 'note', text: CLAIMS_UNRECORDED_LINE })
  })
})

describe('the two framework rows', () => {
  const rows = (sales_markets: string[] | null, env_claims: string | null, not_sure: boolean | null = null) =>
    getFrameworkApplicability('USA', 50_000_000, 'Technology', 'ma', 'USD', { sales_markets, sales_markets_not_sure: not_sure, env_claims })
      .filter(r => r.framework === EU_ECGT_FRAMEWORK || r.framework === CA_AB1305_FRAMEWORK)

  it('EU ECGT with an EU market: APPLIES on yes, APPLIES: VERIFY on not sure', () => {
    expect(rows(['DE'], 'yes')).toEqual([{ framework: EU_ECGT_FRAMEWORK, applies: true, status: 'applies', rule: EU_ECGT_RULE }])
    expect(rows(['DE'], 'not_sure')).toEqual([{ framework: EU_ECGT_FRAMEWORK, applies: true, status: 'applies', verify: EU_ECGT_VERIFY }])
  })

  it('California AB 1305 with California: APPLIES on yes, APPLIES: VERIFY on not sure', () => {
    expect(rows(['US-CA'], 'yes')).toEqual([{ framework: CA_AB1305_FRAMEWORK, applies: true, status: 'applies', rule: CA_AB1305_RULE }])
    expect(rows(['US-CA'], 'not_sure')).toEqual([{ framework: CA_AB1305_FRAMEWORK, applies: true, status: 'applies', verify: CA_AB1305_VERIFY }])
  })

  it('neither on "no", on claims never asked, on the US without California, or on markets "not sure"', () => {
    expect(rows(['DE', 'US-CA'], 'no')).toEqual([])
    expect(rows(['DE', 'US-CA'], null)).toEqual([])
    expect(rows(['US'], 'yes')).toEqual([])
    expect(rows(null, 'yes', true)).toEqual([])
  })
})

describe('in the report model', () => {
  it('the finding, the framework rows and the data-room row appear together, and nothing is priced', () => {
    const withClaims = build({ sales_markets: ['FR', 'US-CA'], env_claims: 'yes' })
    const without = build({ sales_markets: ['FR', 'US-CA'], env_claims: 'no' })
    expect(withClaims.risks.claims).toMatchObject({ chip: 'applies', severity: 'high' })
    expect(withClaims.risks.claimsNote).toBeNull()
    expect(withClaims.applicable.rows.map(r => r.framework)).toEqual(expect.arrayContaining([EU_ECGT_FRAMEWORK, CA_AB1305_FRAMEWORK]))
    expect(withClaims.dataRoom.rows.find(r => r.item === CLAIMS_DATA_ROOM_ITEM)).toMatchObject({ available: false })
    // No priced obligation: the cost section is the same with and without the claims.
    expect(withClaims.cost.included).toEqual(without.cost.included)
    expect(withClaims.cost.recommended).toEqual(without.cost.recommended)
    expect(withClaims.cost.themisIq.figure).toBe(without.cost.themisIq.figure)
  })

  it('claims "no": the note in the risk section, no finding, no data-room row', () => {
    const m = build({ sales_markets: ['FR'], env_claims: 'no' })
    expect(m.risks.claims).toBeNull()
    expect(m.risks.claimsNote).toBe(NO_CLAIMS_NOTE)
    expect(m.dataRoom.rows.some(r => r.item === CLAIMS_DATA_ROOM_ITEM)).toBe(false)
  })

  it('an old deal (NULL): the quiet line in both places, and no caveat, finding, rows or data-room row', () => {
    const m = ukDeal({ sales_markets: null, sales_markets_not_sure: null, env_claims: null })
    expect(m.risks.claims).toBeNull()
    expect(m.risks.claimsNote).toBe(MARKETS_UNRECORDED_LINE)
    expect(m.sizeTests.marketsNote).toBe(MARKETS_UNRECORDED_LINE)
    expect(m.sizeTests.panels.map(p => p.title)).not.toContain(CANADA_CAVEAT)
    expect(m.applicable.rows.some(r => r.framework === EU_ECGT_FRAMEWORK || r.framework === CA_AB1305_FRAMEWORK)).toBe(false)
    expect(m.dataRoom.rows.some(r => r.item === CLAIMS_DATA_ROOM_ITEM)).toBe(false)
  })

  it('the listing answer reaches the report: listed on a Canadian exchange gives S-211 APPLIES: VERIFY', () => {
    // It was not passed to the engine by the report model before 29 Sep 2026, so the wizard showed
    // the row and the report did not.
    const m = ukDeal({ listed_ca_exchange: true })
    expect(m.applicable.rows.find(r => r.framework === 'Canada S-211')?.chip).toBe('verify')
  })
})

describe('the Canada S-211 jurisdiction caveat follows the markets', () => {
  const titles = (m: DealReportModel) => m.sizeTests.panels.map(p => p.title)

  it('is gone when Canada is a market: the size test runs instead', () => {
    expect(canadaCaveatForMarkets({ sales_markets: ['GB', 'CA'] })).toBe('hide')
    const m = ukDeal({ sales_markets: ['CA'], sales_markets_not_sure: null })
    expect(titles(m)).not.toContain(CANADA_CAVEAT)
    expect(m.sizeTests.rows.some(r => r.framework === 'Canada S-211')).toBe(true)
  })

  it('shows when markets are "not sure"', () => {
    expect(canadaCaveatForMarkets({ sales_markets: null, sales_markets_not_sure: true })).toBe('show')
    expect(titles(ukDeal({ sales_markets: null, sales_markets_not_sure: true }))).toContain(CANADA_CAVEAT)
  })

  it('is gone, with no quiet line, when markets are recorded without Canada', () => {
    const m = ukDeal({ sales_markets: ['GB', 'FR'], sales_markets_not_sure: null })
    expect(titles(m)).not.toContain(CANADA_CAVEAT)
    expect(m.sizeTests.marketsNote).toBeNull()
  })

  it('gives way to the quiet line when markets were never recorded', () => {
    expect(canadaCaveatForMarkets({ sales_markets: null, sales_markets_not_sure: null })).toBe('quiet')
  })

  it('never shows for a Canadian target or a listed Yes, whatever the markets', () => {
    for (const over of [{ jurisdiction: 'Canada', currency: 'CAD' }, { listed_ca_exchange: true }]) {
      const m = ukDeal({ ...over, sales_markets: ['CA'] })
      expect(titles(m)).not.toContain(CANADA_CAVEAT)
      expect(m.sizeTests.marketsNote).toBeNull()
    }
  })
})

describe('the fallback label on a risk finding', () => {
  it('names the methodology alone, never IFRS S2', () => {
    expect(REGIME_FALLBACK).toEqual([{ text: 'GHG Protocol' }])
    // Nothing licensed: a template's 'SB 253 / CSRD' falls back.
    expect(makeMapFramework([], undefined)('SB 253 / CSRD')).toEqual([{ text: 'GHG Protocol' }])
  })
})

describe('the sign-in draft carries the new answers', () => {
  it('keeps valid answers, including NULL, and drops what it does not recognise', () => {
    const d = parseDealDraft(JSON.stringify({
      target_name: 'X', sales_markets: ['FR', 'US-CA', 'ZZ', 42], sales_markets_not_sure: true, env_claims: 'yes',
    }))
    expect(d).toMatchObject({ sales_markets: ['FR', 'US-CA'], sales_markets_not_sure: true, env_claims: 'yes' })
    expect(parseDealDraft(JSON.stringify({ target_name: 'X', sales_markets: null, env_claims: null })))
      .toMatchObject({ sales_markets: null, env_claims: null })
    const bad = parseDealDraft(JSON.stringify({ target_name: 'X', sales_markets: ['ZZ'], env_claims: 'maybe' }))
    expect(bad).toEqual({ target_name: 'X', sales_markets: null })
  })

  it('carries the Canadian-listing answer, all three states, through the round trip', () => {
    // Dropped by the parse until 29 Sep 2026: a user who answered and then signed in came back to
    // "not sure", whatever they had chosen.
    for (const v of [true, false, null])
      expect(parseDealDraft(JSON.stringify({ target_name: 'X', listed_ca_exchange: v }))).toMatchObject({ listed_ca_exchange: v })
    expect(parseDealDraft(JSON.stringify({ target_name: 'X', listed_ca_exchange: 'yes' }))).toEqual({ target_name: 'X' })
  })

  it('accepts every EU member and California as market codes', () => {
    for (const c of [...EU_MEMBER_CODES, 'US-CA', 'US', 'GB', 'CA']) expect(isMarketCode(c), c).toBe(true)
    expect(isMarketCode('EU')).toBe(false)
  })
})
