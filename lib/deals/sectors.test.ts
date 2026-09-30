import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SECTORS, LEGACY_SECTORS, LEGACY_SECTOR_VALUES, SECTOR_TEMPLATE_SOURCE, SECTOR_READY, VISIBLE_SECTORS,
  OTHER_SECTOR, HEAVY_SECTORS, ETS_SECTORS, FINANCIAL_SECTORS, FINANCIAL_RULE_SECTORS, FLAG_SECTORS, normalizeSector,
} from './sectors'
import { SECTOR_RISKS, sectorTemplates, getFrameworkApplicability, getComplianceCost } from './assessment'
import { buildDealReportModel } from './reportModel'
import { FX_DEAL, FIXTURE_GENERATED_AT } from './reportModel.fixtures'

// The sector model of 29 Sep 2026. The old values are not rewritten in the database, so these tests
// pin that every one of them is treated EXACTLY as before: the same templates, and membership of the
// same rule lists. The lists below are copied from the literals they replaced, on purpose, so that a
// change to the new sets which reaches an old value fails here rather than in a customer's report.
// (Before this change, the report model and the cost figures for all 12 old values, 'Other', '' and
// NULL, across five deal shapes, were recorded and compared after it: all 150 identical. Re-run after
// Construction & Materials joined the heavy and ETS sets: its 10 entries differ, the other 140 do not.
// Re-run again for Stage 3b over all 34 values: the legacy values' only change is the Financial Services
// 'Financed emissions' label, below; Energy & Utilities and the other ten are identical.)

const OLD_VALUES = ['Energy & Utilities', 'Financial Services', 'Real Estate', 'Technology', 'Healthcare & Pharma',
  'Industrials & Manufacturing', 'Consumer & Retail', 'Agriculture & Food', 'Transport & Logistics', 'Mining & Metals',
  'Construction & Materials', 'Professional Services', 'Other']
const OLD_HEAVY = ['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals', 'Transport & Logistics', 'Agriculture & Food']
const OLD_ETS = ['Energy & Utilities', 'Industrials & Manufacturing', 'Mining & Metals']
const OLD_FINANCIAL = ['Financial Services']
const OLD_FLAG = ['Agriculture & Food']
// THE ONE DELIBERATE EXCEPTION. Construction & Materials joined the heavy and ETS sets by decision of
// 29 Sep 2026, knowing it changes that value's cost figures and adds the ETS verify row. No production
// deal carried the value that day. It is the only old value whose rule lists moved.
const CHANGED_ON_PURPOSE = { heavy: ['Construction & Materials'], ets: ['Construction & Materials'] }
// THE SECOND ONE (Stage 3b, 29 Sep 2026). The Financial Services 'Financed emissions' label changed from
// 'PCAF / CSRD' to 'Investor expectation (PCAF) / CSRD': PCAF is a market expectation and is not printed
// bare. Detail, severity and conditionals are unchanged. No production deal carried Financial Services.
// THE THIRD ONE (Stage 3b follow-up, 29 Sep 2026). Transport & Logistics 'Fleet decarbonisation liability'
// was split into the universal Scope 1 finding and 'EU route fuel and carbon costs', which carries the
// EU-route conditional. No production deal carried Transport & Logistics (sector counts of 29 Sep 2026).

describe('every old stored value is treated exactly as before', () => {
  it.each(OLD_VALUES)('%s: same templates, same rule lists', v => {
    expect(sectorTemplates(v)).toEqual(SECTOR_RISKS[v] ?? [])
    expect(HEAVY_SECTORS.has(v), 'heavy').toBe(OLD_HEAVY.includes(v) || CHANGED_ON_PURPOSE.heavy.includes(v))
    expect(ETS_SECTORS.has(v), 'ETS').toBe(OLD_ETS.includes(v) || CHANGED_ON_PURPOSE.ets.includes(v))
    expect(FINANCIAL_SECTORS.has(v), 'financial').toBe(OLD_FINANCIAL.includes(v))
    expect(FLAG_SECTORS.has(v), 'FLAG').toBe(OLD_FLAG.includes(v))
    for (const [rule, set] of Object.entries(FINANCIAL_RULE_SECTORS)) expect(set.has(v), rule).toBe(OLD_FINANCIAL.includes(v))
  })

  it('legacy Financial Services: the one label changed on purpose, nothing else in its templates', () => {
    const [financed, ...rest] = sectorTemplates('Financial Services')
    expect(financed.framework).toBe('Investor expectation (PCAF) / CSRD')
    expect(financed.detail).toBe('Financed emissions typically represent 95%+ of a financial institution\'s carbon footprint. PCAF methodology required.')
    expect(rest.map(r => r.framework)).toEqual(['SFDR / EU Taxonomy', 'ECB / Investor expectation (TCFD)'])
  })

  it('legacy Transport & Logistics: the fleet finding split on purpose, the other two unchanged', () => {
    expect(sectorTemplates('Transport & Logistics').map(r => [r.risk, r.severity, r.framework, !!r.conditional])).toEqual([
      ['Fleet decarbonisation liability', 'high', 'SB 253 / CSRD', false],
      ['EU route fuel and carbon costs', 'high', 'FuelEU Maritime / EU ETS', true],
      ['Aviation and shipping ETS exposure', 'high', 'EU ETS', true],
      ['Infrastructure physical risk', 'medium', 'Investor expectation (IFRS S2 / TCFD)', false],
    ])
  })

  it('legacy Financial Services keeps every financial rule it had, in the EU and the UK', () => {
    const uk = getFrameworkApplicability('UK', 60e6, 'Financial Services', 'ma', 'GBP', { employee_count: 300, total_assets: 25e6 }).map(r => r.framework)
    expect(uk).toEqual(expect.arrayContaining(['FCA climate disclosure (TCFD)', 'UK SDR', 'Anti-greenwashing rule', 'PCAF']))
    const eu = getFrameworkApplicability('European Union', 60e6, 'Financial Services', 'ma', 'EUR', {}).map(r => r.framework)
    expect(eu).toContain('SFDR')
  })
})

describe('a blank sector is no sector', () => {
  it("'' and whitespace-only read exactly like NULL", () => {
    for (const v of ['', '   ', '\t']) expect(normalizeSector(v), JSON.stringify(v)).toBeNull()
    expect(normalizeSector(' Technology ')).toBe('Technology')
    const asNull = buildDealReportModel({ ...FX_DEAL, sector: null }, FIXTURE_GENERATED_AT)
    for (const v of ['', '   ']) {
      expect(buildDealReportModel({ ...FX_DEAL, sector: v }, FIXTURE_GENERATED_AT), JSON.stringify(v)).toEqual(asNull)
      expect(sectorTemplates(v)).toEqual([])
      expect(getComplianceCost(5e8, v, ['CSRD'])).toEqual(getComplianceCost(5e8, '', ['CSRD']))
    }
    expect(asNull.cover.rows).toContainEqual(['Sector', 'Not specified'])
  })
})

describe('the new list', () => {
  it('has the 22 sectors, once each, ending with Other (describe)', () => {
    expect(SECTORS.length).toBe(22)
    expect(new Set(SECTORS).size).toBe(22)
    expect(SECTORS[SECTORS.length - 1]).toBe('Other (describe)')
  })

  it('every template source names real templates', () => {
    for (const [sector, src] of Object.entries(SECTOR_TEMPLATE_SOURCE)) {
      if (!src) continue
      expect(SECTOR_RISKS[src.from], sector).toBeDefined()
      for (const r of src.risks ?? []) expect(SECTOR_RISKS[src.from].map(t => t.risk), `${sector}: ${r}`).toContain(r)
    }
  })

  it('reuses old templates unchanged where they apply, and uses its own where they were written (Stage 3b)', () => {
    expect(sectorTemplates('Technology & Software')).toEqual(SECTOR_RISKS['Technology'])
    expect(sectorTemplates('Banking & Lending').map(r => r.risk)).toEqual(['Financed emissions (Scope 3 Cat.15)', 'Physical risk in loan book'])
    expect(sectorTemplates('Asset Management & Private Capital').map(r => r.risk)).toEqual(['Financed emissions (Scope 3 Cat.15)', 'SFDR portfolio alignment'])
    for (const s of ['Oil & Gas', 'Power & Utilities (incl. renewables)', 'Chemicals', 'Automotive & Transport Equipment', 'Retail & E-commerce',
      'Hospitality, Leisure & Travel', 'Telecommunications & Media', 'Insurance', 'Waste, Water & Environmental Services'])
      expect(sectorTemplates(s), s).toBe(SECTOR_RISKS[s])
    expect(sectorTemplates('Other (describe)')).toEqual([])
  })

  it('Oil & Gas and Power & Utilities no longer print the old Energy wording; legacy Energy & Utilities still does', () => {
    for (const s of ['Oil & Gas', 'Power & Utilities (incl. renewables)'])
      for (const r of sectorTemplates(s)) expect(r.detail, `${s}: ${r.risk}`).not.toMatch(/^Energy (companies|infrastructure)|^Fossil fuel assets/)
    expect(sectorTemplates('Energy & Utilities')).toBe(SECTOR_RISKS['Energy & Utilities'])
    expect(sectorTemplates('Energy & Utilities')[0].detail).toMatch(/^Energy companies typically carry 60-80%/)
  })

  it('a sector with no template prints the "no template" sentence', () => {
    const m = buildDealReportModel({ ...FX_DEAL, sector: 'Other (describe)' }, FIXTURE_GENERATED_AT)
    expect(m.risks.kind).toBe('none')
    expect(m.risks.noneSentence).toBe('No sector-specific ESG risk template is held for this sector.')
  })

  it('legacy values resolve into the new list, and none of them is in it', () => {
    for (const [v, { resolvesTo, candidates }] of Object.entries(LEGACY_SECTORS)) {
      expect((SECTORS as readonly string[]).includes(v), v).toBe(false)
      if (resolvesTo) expect(SECTORS).toContain(resolvesTo)
      for (const c of candidates) expect(SECTORS).toContain(c)
    }
    expect(LEGACY_SECTORS['Energy & Utilities'].resolvesTo).toBeNull()
  })
})

describe('the financial-services rules attach as decided', () => {
  const ukRules = (sector: string) =>
    getFrameworkApplicability('UK', 60e6, sector, 'ma', 'GBP', { employee_count: 300, total_assets: 25e6 }).map(r => r.framework)
  const euRules = (sector: string) => getFrameworkApplicability('European Union', 60e6, sector, 'ma', 'EUR', {}).map(r => r.framework)

  it('Banking & Lending: anti-greenwashing, SFDR and PCAF; not the FCA climate rule or UK SDR', () => {
    expect(ukRules('Banking & Lending')).toEqual(expect.arrayContaining(['Anti-greenwashing rule', 'PCAF']))
    expect(ukRules('Banking & Lending')).not.toContain('FCA climate disclosure (TCFD)')
    expect(ukRules('Banking & Lending')).not.toContain('UK SDR')
    expect(euRules('Banking & Lending')).toContain('SFDR')
  })

  it('Insurance: FCA climate, anti-greenwashing, SFDR and PCAF; not UK SDR', () => {
    expect(ukRules('Insurance')).toEqual(expect.arrayContaining(['FCA climate disclosure (TCFD)', 'Anti-greenwashing rule', 'PCAF']))
    expect(ukRules('Insurance')).not.toContain('UK SDR')
    expect(euRules('Insurance')).toContain('SFDR')
  })

  it('Asset Management & Private Capital: all five', () => {
    expect(ukRules('Asset Management & Private Capital')).toEqual(expect.arrayContaining(
      ['FCA climate disclosure (TCFD)', 'UK SDR', 'Anti-greenwashing rule', 'PCAF']))
    expect(euRules('Asset Management & Private Capital')).toContain('SFDR')
  })

  it('a non-financial sector gets none of them', () => {
    const rules = [...ukRules('Technology & Software'), ...euRules('Technology & Software')]
    for (const f of ['SFDR', 'PCAF', 'FCA climate disclosure (TCFD)', 'UK SDR', 'Anti-greenwashing rule']) expect(rules).not.toContain(f)
  })
})

describe('the heavy and ETS sets', () => {
  it('Waste, Water & Environmental Services is heavy for cost, and not yet in the ETS verify set', () => {
    expect(getComplianceCost(5e8, 'Waste, Water & Environmental Services', [])).toEqual(getComplianceCost(5e8, 'Mining & Metals', []))
    expect(ETS_SECTORS.has('Waste, Water & Environmental Services')).toBe(false)
  })

  it('Construction & Materials is heavy for cost and in the ETS verify set (decision of 29 Sep 2026)', () => {
    expect(getComplianceCost(5e8, 'Construction & Materials', [])).toEqual(getComplianceCost(5e8, 'Mining & Metals', []))
    expect(getFrameworkApplicability('European Union', 60e6, 'Construction & Materials', 'ma', 'EUR', {}).map(r => r.framework)).toContain('EU ETS')
  })

  it('the new ETS sectors get the ETS verify row', () => {
    for (const s of ['Oil & Gas', 'Power & Utilities (incl. renewables)', 'Chemicals', 'Construction & Materials'])
      expect(getFrameworkApplicability('UK', 60e6, s, 'ma', 'GBP', {}).map(r => r.framework), s).toContain('UK ETS')
  })
})

describe('which sectors the wizard offers', () => {
  it('every offered sector has at least one template, Other (describe) excepted', () => {
    for (const s of VISIBLE_SECTORS) if (s !== OTHER_SECTOR) expect(sectorTemplates(s).length, s).toBeGreaterThan(0)
  })

  it('offers every sector since Stage 3b, Other (describe) included', () => {
    expect(SECTORS.filter(s => !SECTOR_READY[s])).toEqual([])
    expect(VISIBLE_SECTORS).toEqual(SECTORS)
    expect(VISIBLE_SECTORS).toContain(OTHER_SECTOR)
  })

  it('a chemicals target entered as Industrials & Manufacturing gets today\'s Industrials findings', () => {
    const m = buildDealReportModel({ ...FX_DEAL, sector: 'Industrials & Manufacturing' }, FIXTURE_GENERATED_AT)
    expect(m.risks.kind).toBe('table')
    expect(m.risks.rows.map(r => r.risk)).toEqual(expect.arrayContaining(SECTOR_RISKS['Industrials & Manufacturing'].map(t => t.risk)))
    expect(SECTOR_RISKS['Industrials & Manufacturing'].map(t => t.risk)).toEqual(
      ['Scope 1 process emissions', 'Carbon border adjustment exposure', 'Chemical and hazardous materials'])
    expect(sectorTemplates('Industrials & Manufacturing')).toEqual(SECTOR_RISKS['Industrials & Manufacturing'])
    expect(HEAVY_SECTORS.has('Industrials & Manufacturing')).toBe(true)
    expect(getFrameworkApplicability('UK', 60e6, 'Industrials & Manufacturing', 'ma', 'GBP', {}).map(r => r.framework)).toContain('UK ETS')
    expect(getFrameworkApplicability('European Union', 60e6, 'Industrials & Manufacturing', 'ma', 'EUR', {}).map(r => r.framework)).toContain('EU ETS')
  })
})

describe('the wizard', () => {
  const src = readFileSync(join(process.cwd(), 'app/dashboard/deals/page.tsx'), 'utf8')
  it('offers the ready sectors, shows a stored value it does not offer as itself, and lets legacy deals be shared', () => {
    expect(src).toContain("import { SECTORS, VISIBLE_SECTORS, LEGACY_SECTOR_VALUES, normalizeSector } from '../../../lib/deals/sectors'")
    expect(src).toContain('{VISIBLE_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}')
    expect(src).not.toContain('{SECTORS.map(')
    expect(src).toContain('(earlier list)')
    expect(src).toContain(".in('sector', SHAREABLE_SECTORS)")
    expect(LEGACY_SECTOR_VALUES).toContain('Technology')
  })
})
