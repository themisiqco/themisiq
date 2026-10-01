import { describe, it, expect } from 'vitest'
import { FIELD_REGISTRY, PER_COUNTRY, UK_PER_COUNTRY_FIELDS, storage } from './fieldRegistry'
import { UK_SECTIONS } from './uk/builderContent'

// Stage D1b: which fields moved from shared to per-country, and why. Pinned: moving another field, or moving one
// back, is a decision to make here, on purpose.

describe('the fields that moved from shared to per-country', () => {
  it('are exactly these, each with its reason', () => {
    expect(PER_COUNTRY.map(p => p.key)).toEqual([
      'policies_due_diligence.has_policy',
      'risks.risk_assessment_done', 'risks.risk_areas', 'risks.own_operations_risk', 'risks.management_steps',
      'policies_due_diligence.due_diligence_description', 'policies_due_diligence.purchasing_practices',
      'remediation.instances_identified', 'remediation.remediation_taken', 'remediation.remediation_description',
      'training.training_provided', 'training.covers', 'training.training_description',
      'effectiveness.assesses_effectiveness', 'effectiveness.effectiveness_description', 'effectiveness.goals_short_term',
      'effectiveness.goals_medium_term', 'effectiveness.goals_long_term', 'effectiveness.progress_since_last_report',
      'effectiveness.findings_changed_practice',
      'steps_taken.steps_summary',
      'report_details.legal_name', 'report_details.joint_entities',
    ])
    for (const p of PER_COUNTRY) expect(p.why.length, p.key).toBeGreaterThan(10)
  })

  it('each is now Canada’s alone, linked to the UK’s own by concept (the entities have no UK field: they are fl_report_entities)', () => {
    for (const p of PER_COUNTRY) {
      const ca = FIELD_REGISTRY.find(f => f.key === p.key)!
      expect(ca.countries, p.key).toEqual(['canada'])
      expect(storage(ca)).toBe('country')
      if (!p.ukSection) { expect(ca.concept).toBeUndefined(); continue }
      expect(ca.concept).toBe(p.key)
      const uk = UK_PER_COUNTRY_FIELDS.find(f => f.concept === p.key)!
      expect(uk.key).toBe(`uk_${p.ukSection}.${p.key.split('.')[1]}`)
      expect(uk.countries).toEqual(['uk'])
      expect(UK_SECTIONS.find(s => s.key === p.ukSection)!.fields.some(f => f.registryKey === uk.key), uk.key).toBe(true)
    }
  })

  it('the factual and structural answers stay shared', () => {
    const stillShared = ['structure_activities_supply_chains.structure_description', 'structure_activities_supply_chains.supply_chain_description',
      'policies_due_diligence.policy_list', 'policies_due_diligence.due_diligence_steps', 'risks.assessment_methods', 'remediation.grievance_mechanism',
      'training.employees_trained', 'effectiveness.indicators', 'steps_taken.governance', 'report_details.year_end_month']
    for (const k of stillShared) expect(storage(FIELD_REGISTRY.find(f => f.key === k)!), k).toBe('shared')
  })

  it('the UK sections no longer ask for the legal name or the entity list (they are the entity picker)', () => {
    const keys = UK_SECTIONS.flatMap(s => s.fields.map(f => f.registryKey))
    expect(keys).not.toContain('report_details.legal_name')
    expect(keys).not.toContain('report_details.joint_entities')
  })
})
