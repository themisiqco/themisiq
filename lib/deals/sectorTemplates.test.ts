// lib/deals/sectorTemplates.test.ts
//
// The Stage 3b templates (29 Sep 2026), wired from scratch/sector-templates-draft.md as reviewed. The
// table below is written out independently of SECTOR_RISKS, so a changed title, severity or label on
// any of the 27 fails here rather than in a customer's report.

import { describe, it, expect } from 'vitest'
import { SECTOR_RISKS, sectorRisks, sectorTemplates, getFrameworkApplicability, CONDITION_SCREEN_NOTE } from './assessment'
import { makeMapFramework } from './reportModel'
import { ETS_SECTORS } from './sectors'

type Row = [risk: string, severity: 'critical' | 'high' | 'medium', framework: string]
const REVIEWED: Record<string, Row[]> = {
  'Oil & Gas': [
    ['High Scope 1 emissions exposure', 'critical', 'SB 253 / CSRD'],
    ['Stranded asset risk', 'critical', 'Investor expectation (IFRS S2 / TCFD)'],
    ['Physical climate risk exposure', 'high', 'Investor expectation (IFRS S2 / TCFD)'],
    ['Methane emissions and import requirements', 'critical', 'EU Methane Regulation'],
  ],
  'Power & Utilities (incl. renewables)': [
    ['Scope 1 emissions from generation and networks', 'critical', 'SB 253 / CSRD'],
    ['Physical climate risk to generation and network assets', 'high', 'Investor expectation (IFRS S2 / TCFD)'],
    ['Transition asset risk across generation, renewables and networks', 'high', 'Investor expectation (IFRS S2 / TCFD)'],
  ],
  'Chemicals': [
    ['Scope 1 process emissions', 'critical', 'SB 253 / CSRD'],
    ['Carbon border adjustment exposure (fertilisers and hydrogen)', 'high', 'EU CBAM'],
    ['REACH registration and substance restrictions', 'high', 'REACH / CSRD'],
  ],
  'Automotive & Transport Equipment': [
    ['EU Battery Regulation duties', 'high', 'EU Battery Regulation'],
    ['Critical minerals supply risk', 'high', 'EU CRMA / CS3D'],
    ['Use-phase emissions', 'critical', 'SB 253 / CSRD'],
    ['EU vehicle CO2 standards', 'critical', 'EU vehicle CO2 standards'],
  ],
  'Retail & E-commerce': [
    ['Scope 3 Cat.1 purchased goods emissions', 'high', 'SB 253 / CSRD'],
    ['Labour rights in supply chain', 'high', 'CS3D / Modern Slavery'],
    ['Packaging and packaging waste', 'medium', 'PPWR / UK pEPR'],
  ],
  'Hospitality, Leisure & Travel': [
    ['Building energy and refrigerant emissions', 'medium', 'SB 253 / CSRD'],
    ['Physical climate risk to destinations and assets', 'high', 'Investor expectation (IFRS S2 / TCFD)'],
    ['Labour rights in outsourced and seasonal workforce', 'high', 'Modern Slavery / CS3D'],
  ],
  'Telecommunications & Media': [
    ['Network and data centre energy intensity', 'medium', 'SB 253 / CSRD'],
    ['EED data centre reporting', 'medium', 'EED data centres'],
    ['AI governance exposure', 'medium', 'EU AI Act'],
    ['Supply chain minerals risk', 'high', 'CS3D / ESRS S2'],
  ],
  'Insurance': [
    ['Insurance-associated and investment emissions', 'critical', 'Investor expectation (PCAF) / CSRD'],
    ['Underwriting and catastrophe exposure to physical climate risk', 'critical', 'Solvency II / Investor expectation (IFRS S2 / TCFD)'],
  ],
  'Waste, Water & Environmental Services': [
    ['Landfill methane', 'critical', 'SB 253 / CSRD'],
    ['EU Landfill Directive obligations', 'high', 'EU Landfill Directive'],
    ['ETS coverage of waste incineration', 'high', 'EU ETS / UK ETS'],
    ['Wastewater process emissions', 'medium', 'SB 253 / CSRD'],
    ['EU wastewater treatment obligations', 'high', 'UWWTD'],
  ],
}
const NEW_SECTORS = Object.keys(REVIEWED)
const NEW_TEMPLATES = NEW_SECTORS.flatMap(s => SECTOR_RISKS[s].map(r => ({ sector: s, ...r })))
const template = (sector: string, risk: string) => SECTOR_RISKS[sector].find(r => r.risk === risk)!

describe('each new sector produces its reviewed templates', () => {
  it('31 templates across the nine sectors (27 reviewed, four of them split in two)', () => {
    expect(NEW_TEMPLATES).toHaveLength(31)
  })

  for (const [sector, rows] of Object.entries(REVIEWED)) {
    it(`${sector}: titles in order, severity and label per template`, () => {
      expect(sectorTemplates(sector).map(r => [r.risk, r.severity, r.framework])).toEqual(rows)
      // And the resolver hands every one of them to the report, in the same order.
      expect(sectorRisks(sector, 'USA').map(r => r.risk)).toEqual(rows.map(r => r[0]))
    })
  }
})

describe('wording', () => {
  // Every printed field of every template, old and new: detail, label, nexus, unresolved, consequence.
  const printed = Object.values(SECTOR_RISKS).flat().flatMap(r => [
    r.detail, ...(r.conditional ? [r.conditional.label, r.conditional.nexus, r.conditional.unresolved, r.conditional.consequence ?? ''] : []),
  ].map(text => ({ risk: r.risk, text })))

  it('no second-person wording', () => {
    for (const { risk, text } of printed) expect(text, risk).not.toMatch(/\b(you|your|yours)\b/i)
  })

  it('no em-dashes in the new templates', () => {
    for (const r of NEW_TEMPLATES) {
      const c = r.conditional
      for (const text of [r.risk, r.detail, r.framework, c?.label, c?.nexus, c?.unresolved, c?.consequence])
        expect(text ?? '', r.risk).not.toContain('\u2014')
    }
  })

  it('no bare IFRS S2, TCFD or PCAF token in any label', () => {
    for (const r of Object.values(SECTOR_RISKS).flat())
      for (const tok of r.framework.split(/ \/ (?![^()]*\))/))
        expect(tok, r.risk).not.toMatch(/^(IFRS S2|TCFD|PCAF)$/)
  })

  it('the reused conditionals match their sources word for word', () => {
    // Chemicals CBAM keeps the Industrials label, nexus and consequence.
    const cbam = template('Chemicals', 'Carbon border adjustment exposure (fertilisers and hydrogen)').conditional!
    const ind = template('Industrials & Manufacturing', 'Carbon border adjustment exposure').conditional!
    expect([cbam.label, cbam.nexus, cbam.consequence]).toEqual([ind.label, ind.nexus, ind.consequence])
    // Telecoms AI Act keeps the Technology conditional unchanged.
    const ai = template('Telecommunications & Media', 'AI governance exposure').conditional!
    expect(ai).toEqual(template('Technology', 'AI governance exposure').conditional)
    // Both labour-rights findings keep the Consumer & Retail conditional.
    const cr = template('Consumer & Retail', 'Labour rights in supply chain').conditional
    expect(template('Retail & E-commerce', 'Labour rights in supply chain').conditional).toEqual(cr)
    expect(template('Hospitality, Leisure & Travel', 'Labour rights in outsourced and seasonal workforce').conditional).toEqual(cr)
  })
})

describe('new labels pass through like EU CBAM and REACH', () => {
  // makeMapFramework resolves only SB 253, CSRD and CS3D against framework rows. Every other token is
  // printed as written and carries no framework identity: no new framework rows were added for these.
  const NEW_LABELS = ['EU Methane Regulation', 'EU Battery Regulation', 'EU CRMA', 'EU vehicle CO2 standards', 'PPWR', 'UK pEPR',
    'EED data centres', 'Solvency II', 'EU Landfill Directive', 'UWWTD', 'UK ETS', 'Investor expectation (PCAF)']

  it('each prints as written, with no framework identity, exactly as EU CBAM and REACH do', () => {
    const map = makeMapFramework(['SB 253', 'CSRD', 'EU ETS', 'PCAF'], undefined)
    for (const label of [...NEW_LABELS, 'EU CBAM', 'REACH']) expect(map(label), label).toEqual([{ text: label }])
  })

  it('every token in a new template is either resolved (SB 253, CSRD, CS3D) or a named pass-through', () => {
    const known = new Set([...NEW_LABELS, 'SB 253', 'CSRD', 'CS3D', 'EU CBAM', 'REACH', 'EU ETS', 'EU AI Act', 'ESRS S2',
      'Modern Slavery', 'Investor expectation (IFRS S2 / TCFD)'])
    for (const r of NEW_TEMPLATES)
      for (const tok of r.framework.split(/ \/ (?![^()]*\))/)) expect(known.has(tok), `${r.risk}: ${tok}`).toBe(true)
  })
})

// ─── Market-aware conditioning ─────────────────────────────────────────────────────────────────────
// Each new conditional goes through the same resolver as the old ones: a primary jurisdiction inside
// establishedIn asserts; otherwise a ticked market settles a 'market' condition, markets recorded
// without it state the absence, and "not sure" or never recorded keep the primary-jurisdiction wording.
describe('market-aware conditioning of the new conditionals', () => {
  const resolve = (sector: string, risk: string, jurisdiction: string, markets?: Parameters<typeof sectorRisks>[2]) =>
    sectorRisks(sector, jurisdiction, markets).find(r => r.risk === risk)!
  const CASES: { sector: string; risk: string; place: string; adjective: string; other: string }[] = [
    { sector: 'Oil & Gas', risk: 'Methane emissions and import requirements', place: 'the EU', adjective: 'EU', other: 'FR' },
    { sector: 'Retail & E-commerce', risk: 'Packaging and packaging waste', place: 'the EU', adjective: 'EU or UK', other: 'DE' },
    { sector: 'Waste, Water & Environmental Services', risk: 'ETS coverage of waste incineration', place: 'the EU', adjective: 'EU or UK', other: 'NL' },
  ]

  for (const c of CASES) {
    describe(`${c.sector}: ${c.risk}`, () => {
      const t = template(c.sector, c.risk)

      it('EU market ticked: established, with the consequence and the market sentence', () => {
        const r = resolve(c.sector, c.risk, 'USA', { sales_markets: ['US', c.other] })
        expect(r.scope).toBe('established')
        expect(r.detail).toBe(`${t.detail} ${t.conditional!.consequence} The target sells into or operates in ${c.place}, so this applies to its EU activity.`)
      })

      it('markets recorded without the EU: conditioned, and the absence is stated', () => {
        const r = resolve(c.sector, c.risk, 'USA', { sales_markets: ['US', 'CA'] })
        expect(r.scope).toBe('conditional')
        expect(r.detail).toBe(t.detail)
        expect(r.scope === 'conditional' && r.condition).toContain(`The target does not report ${c.adjective} sales or operations. Confirm before ruling it out.`)
        expect(r.detail).not.toContain(t.conditional!.consequence!)
      })

      it('markets not sure, or never recorded: the primary-jurisdiction wording', () => {
        for (const m of [{ sales_markets: null, sales_markets_not_sure: true }, { sales_markets: null, sales_markets_not_sure: null }, undefined]) {
          const r = resolve(c.sector, c.risk, 'USA', m)
          expect(r.scope).toBe('conditional')
          expect(r.scope === 'conditional' && r.condition).toContain(CONDITION_SCREEN_NOTE)
          expect(r.detail).not.toContain(t.conditional!.consequence!)
        }
      })

      it('an EU primary jurisdiction asserts without any market', () => {
        const r = resolve(c.sector, c.risk, 'European Union', undefined)
        expect(r.scope).toBe('established')
        expect(r.detail).toBe(`${t.detail} ${t.conditional!.consequence}`)
      })
    })
  }

  it('the UK alone meets the two EU-or-UK conditions, and not the methane one', () => {
    for (const [sector, risk] of [['Retail & E-commerce', 'Packaging and packaging waste'], ['Waste, Water & Environmental Services', 'ETS coverage of waste incineration']]) {
      const r = resolve(sector, risk, 'USA', { sales_markets: ['GB'] })
      expect(r.scope, risk).toBe('established')
      expect(r.detail, risk).toContain('so this applies to its UK activity.')
    }
    expect(resolve('Oil & Gas', 'Methane emissions and import requirements', 'USA', { sales_markets: ['GB'] }).scope).toBe('conditional')
  })

  it('a scope condition with its market ticked stays conditioned (Insurance, Solvency II)', () => {
    const r = resolve('Insurance', 'Underwriting and catastrophe exposure to physical climate risk', 'USA', { sales_markets: ['FR'] })
    expect(r.scope).toBe('conditional')
    expect(r.scope === 'conditional' && r.condition).toContain('which this needs; whether the target is an insurer supervised in the EU or UK is not established here.')
  })
})

describe('waste incineration reaches the ETS only through its finding', () => {
  it('Waste, Water & Environmental Services is not an ETS sector and gets no ETS framework row', () => {
    expect(ETS_SECTORS.has('Waste, Water & Environmental Services')).toBe(false)
    for (const [j, cur] of [['European Union', 'EUR'], ['UK', 'GBP']] as const) {
      const rows = getFrameworkApplicability(j, 60e6, 'Waste, Water & Environmental Services', 'ma', cur, {}).map(r => r.framework)
      expect(rows, j).not.toContain('EU ETS')
      expect(rows, j).not.toContain('UK ETS')
    }
  })
})

// ─── Time-sensitive templates ──────────────────────────────────────────────────────────────────────
// THE LIST TO RE-CHECK. Every template carrying `lastVerified`, with the date. Each states something
// that goes stale on a known kind of event: a proposal adopted, a postponement given a date, a
// phase-in reached. Re-verify the printed consequence against its sources, then move the date.
describe('templates with a lastVerified date', () => {
  it('lists every one of them', () => {
    const dated = Object.entries(SECTOR_RISKS).flatMap(([sector, rs]) =>
      rs.filter(r => r.lastVerified).map(r => `${r.lastVerified} ${sector}: ${r.risk}`))
    expect(dated.sort()).toEqual([
      '2026-09-29 Automotive & Transport Equipment: EU vehicle CO2 standards',
      '2026-09-29 Oil & Gas: Methane emissions and import requirements',
      '2026-09-29 Waste, Water & Environmental Services: ETS coverage of waste incineration',
    ])
    for (const r of Object.values(SECTOR_RISKS).flat()) if (r.lastVerified) expect(r.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('the dated wording is present, so a re-check has something to find', () => {
    expect(template('Automotive & Transport Equipment', 'EU vehicle CO2 standards').conditional!.consequence).toContain('is pending')
    const waste = template('Waste, Water & Environmental Services', 'ETS coverage of waste incineration').conditional!.consequence!
    expect(waste).toContain('is not yet adopted')
    expect(waste).toContain('with no new date')
    expect(waste).toContain('COM(2026) 616')
    expect(waste).toContain('31 July 2029')
    const methane = template('Oil & Gas', 'Methane emissions and import requirements').conditional!.consequence!
    expect(methane).toContain('1 January 2027')
    expect(methane).toContain('5 August 2028')
  })
})

// ─── Universal emissions findings are never conditioned (Stage 3b follow-up, 29 Sep 2026) ────────────
// Each of these used to be conditioned WHOLE on an EU nexus, so a target outside it lost the emissions
// finding from every severity count, which is true of it anywhere. Severity totals on every surface (the
// wizard tiles, the report, the XLSX columns) count `established` findings from sectorRisks() only, so
// counting established findings here is counting what those surfaces count.
describe('split findings: the emissions finding counts everywhere, the EU finding only where its nexus is', () => {
  const SPLITS = [
    { sector: 'Waste, Water & Environmental Services', universal: 'Landfill methane', severity: 'critical', eu: 'EU Landfill Directive obligations' },
    { sector: 'Automotive & Transport Equipment', universal: 'Use-phase emissions', severity: 'critical', eu: 'EU vehicle CO2 standards' },
    { sector: 'Telecommunications & Media', universal: 'Network and data centre energy intensity', severity: 'medium', eu: 'EED data centre reporting' },
    { sector: 'Waste, Water & Environmental Services', universal: 'Wastewater process emissions', severity: 'medium', eu: 'EU wastewater treatment obligations' },
  ] as const
  const established = (sector: string, jurisdiction: string, markets?: Parameters<typeof sectorRisks>[2]) =>
    sectorRisks(sector, jurisdiction, markets).filter(r => r.scope === 'established')

  for (const c of SPLITS) {
    it(`${c.sector}, US operator: the ${c.severity.toUpperCase()} emissions finding counts; the EU finding is shown, conditioned`, () => {
      const all = sectorRisks(c.sector, 'USA', { sales_markets: ['US'] })
      const universal = all.find(r => r.risk === c.universal)!
      expect(universal.scope).toBe('established')
      expect(universal.severity).toBe(c.severity)
      expect(established(c.sector, 'USA', { sales_markets: ['US'] }).filter(r => r.severity === c.severity).map(r => r.risk)).toContain(c.universal)
      const eu = all.find(r => r.risk === c.eu)!
      expect(eu.scope).toBe('conditional')
      expect(eu.scope === 'conditional' && eu.condition).toContain('Confirm before ruling it out.')
      // The universal half never carries the EU legal detail.
      expect(universal.detail).not.toContain(template(c.sector, c.eu).conditional!.consequence!)
    })

    it(`${c.sector}, EU operator: both established`, () => {
      const risks = established(c.sector, 'European Union')
      expect(risks.map(r => r.risk)).toEqual(expect.arrayContaining([c.universal, c.eu]))
      expect(risks.find(r => r.risk === c.eu)!.detail).toContain(template(c.sector, c.eu).conditional!.consequence!)
    })

    it(`${c.sector}: the universal label holds only frameworks that apply anywhere`, () => {
      expect(template(c.sector, c.universal).framework).toBe('SB 253 / CSRD')
      expect(template(c.sector, c.universal).conditional).toBeUndefined()
    })
  }

  it('the US waste operator counts the CRITICAL methane finding and the MEDIUM process-emissions finding', () => {
    const counted = established('Waste, Water & Environmental Services', 'USA', { sales_markets: ['US'] })
    expect(counted.map(r => [r.risk, r.severity])).toEqual([['Landfill methane', 'critical'], ['Wastewater process emissions', 'medium']])
  })

  it('the universal automotive finding names no EU rule: fleet limits and penalties live only in "EU vehicle CO2 standards"', () => {
    expect(template('Automotive & Transport Equipment', 'Use-phase emissions').detail).toBe(
      'For a vehicle manufacturer, emissions from the use of the vehicles it sells (Scope 3 Cat.11) typically far exceed its own operations. The powertrain mix therefore drives both the target\'s reported footprint and its exposure to vehicle emission rules in the markets it sells into.')
    expect(template('Automotive & Transport Equipment', 'Use-phase emissions').detail).not.toMatch(/fleet-average|penalt|per gram/i)
  })

  it('the EU wastewater finding keeps its consequence unchanged', () => {
    expect(template('Waste, Water & Environmental Services', 'EU wastewater treatment obligations').conditional!.consequence).toBe(
      'The recast Urban Wastewater Treatment Directive requires treatment plants of 10,000 population equivalent and above to reach energy neutrality by 2045, and plants of 150,000 population equivalent and above to remove micropollutants by 2045. Producers of medicines and cosmetics must fund at least 80% of that quaternary treatment (Directive (EU) 2024/3019).')
  })
})
