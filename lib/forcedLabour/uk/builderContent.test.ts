import { describe, it, expect } from 'vitest'
import { UK_SECTIONS, UK_SECTION_KEYS, ukFinancialYear } from './builderContent'
import { FIELD_REGISTRY, storage } from '../fieldRegistry'
import { SECTIONS as CANADA } from '../../s211/builderContent'
import { UK_MSA_S54_4, UK_MSA_S54_5 } from './requirements'

const ukFields = UK_SECTIONS.flatMap(s => s.fields.map(f => ({ section: s.key, f })))

describe('the UK sections and the field registry', () => {
  it('every UK field is a registry key that lists the UK', () => {
    for (const { f } of ukFields) {
      const r = FIELD_REGISTRY.find(x => x.key === f.registryKey)
      expect(r, f.registryKey).toBeDefined()
      expect(r!.countries, f.registryKey).toContain('uk')
    }
  })
  it('every registry section field that lists the UK is used by exactly one UK field, and nothing is orphaned', () => {
    const used = ukFields.map(x => x.f.registryKey)
    expect(used.filter((k, i) => used.indexOf(k) !== i)).toEqual([])
    const listed = FIELD_REGISTRY.filter(r => r.countries.includes('uk') && (r.canada?.kind === 'section' || r.canada === null) && !r.key.startsWith('organization.')).map(r => r.key)
    expect(listed.filter(k => !used.includes(k)).sort()).toEqual([])
  })
  it('a shared field keeps Canada’s type, options and columns, so a value fits both builders', () => {
    for (const { f } of ukFields) {
      const r = FIELD_REGISTRY.find(x => x.key === f.registryKey)!
      if (r.canada?.kind !== 'section') continue
      const home = r.canada
      const c = CANADA.find(s => s.key === home.section)!.fields.find(x => x.key === home.field)!
      expect([f.key, f.type, f.options, f.columns?.map(x => x.key)], f.registryKey).toEqual([c.key, c.type, c.options, c.columns?.map(x => x.key)])
      expect(storage(r)).toBe('shared')
    }
  })
  it('UK-only fields have no Canadian home and are not shared', () => {
    for (const { f } of ukFields.filter(x => x.f.registryKey.startsWith('uk_'))) {
      const r = FIELD_REGISTRY.find(x => x.key === f.registryKey)!
      expect(r.canada).toBeNull()
      expect(r.countries).toEqual(['uk'])
    }
  })
})

describe('law and guidance, marked as the map marks them', () => {
  it('steps taken is the one thing the Act requires; the six topics are what it may include', () => {
    expect(UK_SECTION_KEYS).toEqual(['statement_details', 'steps_taken', 'structure_business_supply_chains', 'policies', 'due_diligence', 'risk', 'effectiveness', 'training', 'approval'])
    const steps = UK_SECTIONS.find(s => s.key === 'steps_taken')!
    expect(steps.actStatus).toBe('requires')
    expect(steps.actQuote.lines[0]).toBe(UK_MSA_S54_4.leadIn)
    const topics = UK_SECTIONS.filter(s => s.actStatus === 'may-include')
    expect(topics.map(s => s.actQuote.ref.slice(-3))).toEqual(['(a)', '(b)', '(c)', '(d)', '(e)', '(f)'])
    for (const t of topics) expect(t.actQuote.lines[0]).toBe(UK_MSA_S54_5.leadIn)
    for (const t of topics) expect(t.mapsTo).toMatch(/may include[^.]*; the statutory guidance recommends covering it/)
  })
  it('the alternative of no steps is offered plainly, in the Act’s words', () => {
    const kind = UK_SECTIONS.find(s => s.key === 'steps_taken')!.fields.find(f => f.key === 'statement_kind')!
    expect(kind.optionLabels!.no_steps).toContain(`“${UK_MSA_S54_4.paragraphs[1].text.replace(/\.$/, '')}”`)
    expect(kind.required).toBe(true)
  })
  it('only the steps and the s.54(6) approval are required; no topic field is', () => {
    const required = ukFields.filter(x => x.f.required === true || typeof x.f.required === 'function').map(x => x.f.registryKey)
    expect(required.sort()).toEqual(['uk_approval.approving_body', 'uk_approval.org_type', 'uk_approval.signer_capacity', 'uk_approval.signer_name',
      'uk_approval.signer_title', 'uk_steps_taken.statement_kind', 'uk_steps_taken.steps_summary'])
  })
  it('the group statement question is shown as an open question when a group statement is chosen', () => {
    const d = UK_SECTIONS.find(s => s.key === 'statement_details')!
    expect(d.openQuestion!.when({ is_group_statement: 'Yes' })).toBe(true)
    expect(d.openQuestion!.when({ is_group_statement: 'No' })).toBe(false)
    expect(d.openQuestion!.text).toContain('s.54(6)')
  })
})

describe('the financial year', () => {
  it('twelve months ending on the day given, or the override dates', () => {
    expect(ukFinancialYear({ year_end_month: 12, year_end_day: 31, financial_year_ending: 2025 })).toEqual({ start: '2025-01-01', end: '2025-12-31', override: false })
    expect(ukFinancialYear({ year_end_month: 3, year_end_day: 31, financial_year_ending: 2026 })).toEqual({ start: '2025-04-01', end: '2026-03-31', override: false })
    expect(ukFinancialYear({ financial_year_start: '2025-01-05', financial_year_end: '2026-01-03' })).toEqual({ start: '2025-01-05', end: '2026-01-03', override: true })
    expect(ukFinancialYear({ year_end_month: 2, year_end_day: 30, financial_year_ending: 2025 })).toBeNull()
  })
})
