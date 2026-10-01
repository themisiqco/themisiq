import { describe, it, expect } from 'vitest'
import { sharedFieldsOf, sharedAnswersFrom, overlaySection, overlayReport, parentPatchFrom, withoutLink } from './canadaAdapter'
import { FIELD_REGISTRY, storage } from './fieldRegistry'
import { SECTION_KEYS, type SectionContent, type SectionKey } from '../s211/builderContent'
import { buildS211ReportModel } from '../s211/reportModel'
import { SINGLE_REPORT, JOINT_REPORT, JOINT_EACH_REPORT, NOTHING_REPORT, type FixtureReport } from '../s211/reportModel.fixtures'

const FIXTURES = { SINGLE_REPORT, JOINT_REPORT, JOINT_EACH_REPORT, NOTHING_REPORT }
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

/** Stores a fixture as the adapter does and reads it back, optionally with the shared fields removed from the sections. */
function roundTrip(r: FixtureReport, sharedOnly: boolean, drop?: string): FixtureReport {
  const answers = new Map<string, unknown>()
  const stored: Partial<Record<SectionKey, SectionContent>> = {}
  for (const [k, content] of Object.entries(r.sections) as [SectionKey, SectionContent][]) {
    const c = json(content) as Record<string, unknown>
    for (const a of sharedAnswersFrom(k, c).upsert) answers.set(a.field_key, json(a.value))
    if (sharedOnly) for (const { field } of sharedFieldsOf(k)) delete c[field]
    stored[k] = c as SectionContent
  }
  if (drop) answers.delete(drop)
  return { reportingYear: r.reportingYear, sections: Object.fromEntries(Object.entries(stored).map(([k, c]) => [k, overlaySection(k as SectionKey, c!, answers)])) }
}

describe('the shared fields per section', () => {
  it('are exactly the registry’s shared, visible Canadian section fields', () => {
    const expected = FIELD_REGISTRY.filter(f => storage(f) === 'shared' && f.canada?.kind === 'section' && !f.canada.hidden).map(f => f.key).sort()
    expect(SECTION_KEYS.flatMap(k => sharedFieldsOf(k).map(f => f.fieldKey)).sort()).toEqual(expected)
  })
  it('never include a Canada-only field, a hidden key, or section 6 (s.11(3)(e)) and 11 (approval)', () => {
    expect(sharedFieldsOf('remediation_income_loss')).toEqual([])
    expect(sharedFieldsOf('approval_attestation')).toEqual([])
    expect(sharedFieldsOf('steps_taken').map(f => f.field)).not.toContain('_built_summary')
    expect(sharedFieldsOf('structure_activities_supply_chains').map(f => f.field)).not.toContain('employees_canada')
  })
})

describe('every report-model fixture comes back identical', () => {
  for (const [name, r] of Object.entries(FIXTURES)) {
    it(`${name}: dual write, and shared store alone`, () => {
      const before = JSON.stringify(buildS211ReportModel(r))
      expect(JSON.stringify(buildS211ReportModel(roundTrip(r, false)))).toBe(before)
      expect(JSON.stringify(buildS211ReportModel(roundTrip(r, true)))).toBe(before)
      for (const [k, c] of Object.entries(roundTrip(r, true).sections)) expect(c, k).toEqual(json(r.sections[k as SectionKey]))
    })
  }

  it('and the comparison would catch a lost answer (negative control)', () => {
    const after = buildS211ReportModel(roundTrip(SINGLE_REPORT, true, 'training.training_description'))
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(buildS211ReportModel(SINGLE_REPORT)))
  })
})

describe('writing and reading', () => {
  it('a field held is upserted, null included; a field absent is removed', () => {
    const { upsert, remove } = sharedAnswersFrom('training', { training_provided: 'Yes', employees_trained: null } as unknown as SectionContent)
    expect(upsert).toEqual([{ field_key: 'training.training_provided', value: 'Yes' }, { field_key: 'training.employees_trained', value: null }])
    expect(remove).toContain('training.training_description')
    // Shared with Australia (s.16(1)(d)), so absent here means removed from the shared store too.
    expect(remove).toContain('training.controlled_entities')
  })
  it('the shared store wins; with no row the section’s own value stands', () => {
    const out = overlaySection('training', { training_provided: 'Yes', training_description: 'old' } as unknown as SectionContent,
      new Map([['training.training_description', 'new']]))
    expect(out).toEqual({ training_provided: 'Yes', training_description: 'new' })
    expect(overlaySection('training', { training_provided: 'Yes' } as unknown as SectionContent, new Map())).toEqual({ training_provided: 'Yes' })
  })
  it('a cleared answer (JSON null) overrides the section’s stale copy', () => {
    expect(overlaySection('training', { training_description: 'stale' } as unknown as SectionContent, new Map([['training.training_description', null]])))
      .toEqual({ training_description: null })
  })
  it('a Canada-only field is never overlaid', () => {
    const out = overlaySection('remediation_income_loss', { measures_caused_loss: 'No' } as unknown as SectionContent,
      new Map([['remediation_income_loss.measures_caused_loss', 'Yes']]))
    expect(out).toEqual({ measures_caused_loss: 'No' })
  })
  it('the two shared report columns come from the parent, and the link column is never returned', () => {
    const r = { id: 'r1', company_name: 'Old', financial_year_end: '2025-12-31', fl_report_id: 'p1', reporting_year: 2026 }
    expect(overlayReport(r, { id: 'p1', organization_name: 'New', period_end: '2026-03-31' }))
      .toEqual({ ...r, company_name: 'New', financial_year_end: '2026-03-31' })
    expect(overlayReport(r, null)).toBe(r)
    expect(withoutLink(r)).toEqual({ id: 'r1', company_name: 'Old', financial_year_end: '2025-12-31', reporting_year: 2026 })
    expect(parentPatchFrom({ company_name: 'X', listed_in_canada: true })).toEqual({ organization_name: 'X' })
  })
})
