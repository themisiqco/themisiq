import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// RELATIVE imports, as in obligations.test.ts: vitest does not resolve the '@/' alias for page.tsx's graph.
import { computeObligations, questions, answerProfile, selectOption, storedOptionValue, UNANSWERED, EMPTY_ANSWERS, type EuGoodsAnswer } from './page'
import {
  OBLIGATIONS, resolveObligation, modernSlaveryObligation, driverModules, modulesHref, modulesLabel,
} from '../../lib/obligations'
import { COUNTRIES, type Country } from '../../lib/forcedLabour/countries'

const REPO_ROOT = join(__dirname, '..', '..')
const FL = OBLIGATIONS['canada-s211'].modules[0]        // 'forced-labour', read rather than typed
const flHrefPart = modulesHref([FL]).split('modules=')[1]  // its shorthand in a /order or /pricing link

// ─────────────────────────────────────────────────────────────────────────────
// THE QUESTIONS ARRAY: no option value can be mistaken for UNANSWERED, and the new CBAM question is
// in the profile the lead email carries.
// ─────────────────────────────────────────────────────────────────────────────
describe('/assess questions', () => {
  it('no option value on any question equals UNANSWERED', () => {
    const values = questions.flatMap(q => (q.options ?? []).map(o => `${q.id}.${o.value}`))
    expect(values.length).toBeGreaterThan(40)
    expect(values.filter(v => v.endsWith(`.${UNANSWERED}`))).toEqual([])
  })

  it('eu_goods follows sectors, and its options are the four answers its type allows', () => {
    const ids = questions.map(q => q.id)
    expect(ids.indexOf('eu_goods')).toBe(ids.indexOf('sectors') + 1)
    const q = questions.find(x => x.id === 'eu_goods')!
    expect(q.title).toBe('Do you make or ship iron and steel, aluminium, cement, fertilisers, hydrogen or electricity that ends up in the EU?')
    expect(q.options!.map(o => [o.value, o.label])).toEqual([
      ['import', 'We import these goods into the EU'], ['supply', 'We sell them to EU customers who import them'], ['no', 'No'], ['unsure', 'Not sure'],
    ])
    // Subtitles describe the option, never the outcome: none names a duty, a declaration or a threshold.
    for (const o of q.options!) expect(o.sub, o.value).not.toMatch(/declar|threshold|must|appl(y|ies)|CBAM/i)
  })

  it('answerProfile includes the CBAM answer by its label, and skips it when unanswered', () => {
    const title = questions.find(x => x.id === 'eu_goods')!.title
    expect(answerProfile({ ...EMPTY_ANSWERS, eu_goods: 'supply' })).toContainEqual({ q: title, a: 'We sell them to EU customers who import them' })
    expect(answerProfile(EMPTY_ANSWERS).map(r => r.q)).not.toContain(title)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ai_use THROUGH THE WRITE THE CLICK USES. The click calls selectOption(a, q.id, opt.value); these do the
// same, starting from EMPTY_ANSWERS, never from a hand-built answered() value. Before 1 Oct 2026 the click
// stored a bare string, and 'no' fired the AI Act at HIGH PRIORITY.
// ─────────────────────────────────────────────────────────────────────────────
describe('ai_use, written as the click writes it', () => {
  const click = (value: string) => selectOption({ ...EMPTY_ANSWERS, jurisdictions: ['eu'] }, 'ai_use', value)
  const aiEntry = (value: string) => computeObligations(click(value)).find(o => o.obligationId === 'eu-ai-act')
  const HIRING = 'CV screening and hiring AI are Annex III high-risk.'

  it('every ai_use option on the page is covered here', () => {
    expect(questions.find(q => q.id === 'ai_use')!.options!.map(o => o.value)).toEqual(['yes_hr', 'yes_credit', 'yes_other', 'no_planned', 'no'])
  })
  it('no: no AI Act entry', () => {
    expect(aiEntry('no')).toBeUndefined()
  })
  it('yes_hr: critical, with the Annex III hiring sentence', () => {
    expect(aiEntry('yes_hr')).toMatchObject({ urgency: 'critical', urgency_label: 'IMMEDIATE ACTION' })
    expect(aiEntry('yes_hr')!.what).toContain(HIRING)
  })
  it('yes_credit: critical', () => {
    expect(aiEntry('yes_credit')).toMatchObject({ urgency: 'critical' })
    expect(aiEntry('yes_credit')!.what).not.toContain(HIRING)
  })
  it('yes_other and no_planned: high', () => {
    for (const v of ['yes_other', 'no_planned']) expect(aiEntry(v), v).toMatchObject({ urgency: 'high', urgency_label: 'HIGH PRIORITY' })
  })
  it('the selected option still highlights, and the lead email still shows the label', () => {
    const q = questions.find(x => x.id === 'ai_use')!
    for (const o of q.options!) {
      const a = click(o.value)
      expect(storedOptionValue(a.ai_use), o.value).toBe(o.value)
      expect(answerProfile(a), o.value).toContainEqual({ q: q.title, a: o.label })
    }
  })
  it('every other options question still stores the bare value, and a value not on the question is refused', () => {
    expect(selectOption(EMPTY_ANSWERS, 'listing', 'us_listed').listing).toBe('us_listed')
    expect(selectOption(EMPTY_ANSWERS, 'eu_goods', 'import').eu_goods).toBe('import')
    expect(selectOption(EMPTY_ANSWERS, 'ai_use', 'maybe')).toBe(EMPTY_ANSWERS)
    expect(selectOption(EMPTY_ANSWERS, 'listing', UNANSWERED)).toBe(EMPTY_ANSWERS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CBAM
// ─────────────────────────────────────────────────────────────────────────────
describe('/assess CBAM entry', () => {
  const cbam = (eu_goods: EuGoodsAnswer | typeof UNANSWERED) =>
    computeObligations({ ...EMPTY_ANSWERS, eu_goods }).filter(o => o.obligationId === 'cbam')

  it('one regulatory entry for import, supply and unsure; none for no or unanswered', () => {
    for (const v of ['import', 'supply', 'unsure'] as const) {
      const e = cbam(v)
      expect(e, v).toHaveLength(1)
      expect(e[0]).toMatchObject({ group: 'regulatory', name: OBLIGATIONS.cbam.name, module: 'CBAM' })
    }
    expect(cbam('no')).toEqual([])
    expect(cbam(UNANSWERED)).toEqual([])
  })

  it('unsure is a monitor entry, "CHECK YOUR GOODS"', () => {
    expect(cbam('unsure')[0]).toMatchObject({ urgency: 'monitor', urgency_label: 'CHECK YOUR GOODS' })
  })

  it('states no tonnage or de minimis figure: the threshold turns on annual import mass, unquantified', () => {
    for (const v of ['import', 'supply', 'unsure'] as const) {
      const text = JSON.stringify(cbam(v)[0])
      expect(text, v).not.toMatch(/\d[\d,.]*\s*(tonnes?|t\b|kg|kilograms?)/i)
      expect(text, v).not.toMatch(/de minimis/i)
    }
    expect(cbam('import')[0].what).toMatch(/mass you import in a year/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// MODERN SLAVERY → FORCED LABOUR REPORTING, ONLY FOR AN AVAILABLE COUNTRY
// ─────────────────────────────────────────────────────────────────────────────
describe('modern slavery: Forced Labour Reporting appears only for an available country', () => {
  // $50M+ revenue clears both the UK and Australian bars (see obligations.test.ts for the conversion).
  const visitor = (jurisdictions: string[]) =>
    computeObligations({ ...EMPTY_ANSWERS, jurisdictions, revenue: 2 }).find(o => o.obligationId === 'modern-slavery')!
  const withStatus = (key: 'uk' | 'australia', status: Country['status']) => COUNTRIES.map(c => (c.key === key ? { ...c, status } : c))

  it('the entry records which countries it covers', () => {
    expect(visitor(['uk', 'australia']).covered).toEqual(['uk', 'australia'])
    expect(visitor(['uk']).covered).toEqual(['uk'])
    expect(visitor(['australia']).covered).toEqual(['australia'])
  })

  it('with today’s statuses there is NO forced-labour link for the UK or Australia: no visible change', () => {
    expect(COUNTRIES.find(c => c.key === 'uk')!.status).not.toBe('available')
    expect(COUNTRIES.find(c => c.key === 'australia')!.status).not.toBe('available')
    for (const j of [['uk'], ['australia'], ['uk', 'australia']]) {
      const o = resolveObligation('modern-slavery', visitor(j).covered)
      expect(o, j.join('+')).toBe(OBLIGATIONS['modern-slavery'])
      expect(o.modules).not.toContain(FL)
      expect(modulesHref(o.modules)).not.toContain(flHrefPart)
      expect(modulesLabel(o.modules)).not.toMatch(/Forced Labour/)
    }
    const fired = computeObligations({ ...EMPTY_ANSWERS, jurisdictions: ['uk', 'australia'], revenue: 2 })
      .map(o => o.obligationId).filter((x): x is NonNullable<typeof x> => !!x)
    expect(driverModules('regulatory', fired, id => resolveObligation(id, ['uk', 'australia']))).not.toContain(FL)
  })

  it('flipping the UK to available adds it for the UK only, listed before Supply Chain', () => {
    const countries = withStatus('uk', 'available')
    const both = modernSlaveryObligation(['uk', 'australia'], countries)
    expect(both.modules).toEqual([FL, 'supply-chain'])
    expect(both.does[FL]).toMatch(/the United Kingdom/)
    expect(both.does[FL]).not.toMatch(/Australia/)
    expect(modulesHref(both.modules)).toContain(flHrefPart)
    // An Australia-only result is untouched: Australia is still hidden.
    expect(modernSlaveryObligation(['australia'], countries)).toBe(OBLIGATIONS['modern-slavery'])
    // The resolver the page and the email share gives the same answer, and narrows a client-posted value.
    expect(resolveObligation('modern-slavery', ['uk', 'nonsense'], countries).modules).toEqual([FL, 'supply-chain'])
    expect(resolveObligation('modern-slavery', 'uk', countries)).toBe(OBLIGATIONS['modern-slavery'])
  })

  it('the static entry never carries Forced Labour Reporting', () => {
    expect(OBLIGATIONS['modern-slavery'].modules).toEqual(['supply-chain'])
    expect(OBLIGATIONS['modern-slavery'].does[FL]).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// CSRD → THE DOUBLE MATERIALITY ASSESSMENT, WITH THE G1 CAVEAT WHEREVER ITS LINK OR PRICE APPEARS
// ─────────────────────────────────────────────────────────────────────────────
describe('CSRD maps to the Materiality Assessment, with the G1 caveat', () => {
  const csrdVisitor = (employees: '1000_4999' | '5000plus') =>
    computeObligations({ ...EMPTY_ANSWERS, jurisdictions: ['eu'], revenue: 5, employees }).filter(o => o.name === OBLIGATIONS.csrd.name)

  it('both CSRD arms carry obligationId csrd', () => {
    for (const band of ['1000_4999', '5000plus'] as const) {
      const e = csrdVisitor(band)
      expect(e, band).toHaveLength(1)
      expect(e[0].obligationId).toBe('csrd')
    }
    expect(csrdVisitor('1000_4999')[0].urgency_label).toBe('CONFIRM HEADCOUNT')
    expect(csrdVisitor('5000plus')[0].urgency_label).toBe('ACTIVE NOW')
  })

  it('Materiality only, its does line names the impact half, and the caveat naming G1', () => {
    expect(OBLIGATIONS.csrd.modules).toEqual(['double-materiality'])
    expect(Object.keys(OBLIGATIONS.csrd.does)).toEqual(['double-materiality'])
    expect(OBLIGATIONS.csrd.does['double-materiality']).toMatch(/impact half of the double materiality assessment/)
    expect(OBLIGATIONS.csrd.caveat).toBe('The double materiality assessment decides what you report; it does not prepare the ESRS disclosures. ESRS G1 business conduct is not covered by any ThemisIQ module.')
    expect(driverModules('regulatory', ['csrd'])).toEqual(['double-materiality'])
  })

  it('every surface that renders an obligation link or price also renders its caveat', () => {
    // The two surfaces that print an obligation's link and price: the /assess module cell and "Start with"
    // line, and the lead email's module cell. /pricing and /materiality import nothing from lib/obligations.
    const page = readFileSync(join(REPO_ROOT, 'app/assess/page.tsx'), 'utf8')
    const route = readFileSync(join(REPO_ROOT, 'lib/assessmentEmail.ts'), 'utf8')  // the email builders, which the route calls
    expect(page).toMatch(/entryObligation\(ob\)\.caveat/)
    expect(page).toMatch(/caveats\.map\(/)
    expect(route).toMatch(/o\.caveat \?/)
    for (const rel of ['app/pricing/page.tsx', 'app/materiality/page.tsx', 'app/components/HomePricing.tsx']) {
      expect(readFileSync(join(REPO_ROOT, rel), 'utf8'), rel).not.toMatch(/lib\/obligations/)
    }
  })
})
