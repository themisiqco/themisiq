import { describe, it, expect } from 'vitest'
import { missingRequired, markComplete, statusAfterEdit, isEmptyContent, completeCount, NOTHING_TO_REPORT_KEY } from './sectionStatus'
import { SECTIONS, sectionDef } from './builderContent'

describe('section status rules', () => {
  it('a conditional requirement applies only when its condition holds', () => {
    expect(missingRequired('report_details', { report_type: 'single' })).not.toContain('Legal name of each entity covered')
    expect(missingRequired('report_details', { report_type: 'joint' })).toContain('Legal name of each entity covered')
    expect(missingRequired('report_details', { is_revised: 'Yes' })).toEqual(expect.arrayContaining(['Date of the revision', 'What changed from the original report']))
    expect(missingRequired('report_details', { is_revised: 'No' })).not.toContain('Date of the revision')
  })

  it('a "nothing to report" sentence stands in for the narrative field, and only that field', () => {
    const before = missingRequired('policies_due_diligence', { has_policy: 'No' })
    expect(before).toContain('What the entity did in the year')
    const after = missingRequired('policies_due_diligence', { has_policy: 'No', [NOTHING_TO_REPORT_KEY]: sectionDef('policies_due_diligence').nothingToReport })
    expect(after).not.toContain('What the entity did in the year')
    expect(missingRequired('policies_due_diligence', { [NOTHING_TO_REPORT_KEY]: 'x' })).toContain('A written policy covering forced labour and child labour')
  })

  it('refusal names every empty required field, in the order the section shows them', () => {
    const r = markComplete('approval_attestation', { governing_body: 'Board of Directors' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toEqual(['Basis of approval', 'Date the governing body approved the report', 'Full name of the member who signs', 'Their title', 'Attestation', 'The signer has the authority to bind the entity'])
  })

  it('section 10: answering No is enough to complete it', () => {
    expect(markComplete('other_information', { has_other_information: 'No' })).toEqual({ ok: true, status: 'complete' })
    expect(markComplete('other_information', { has_other_information: 'Yes' }).ok).toBe(false)
  })

  it('an edit never marks a section complete', () => {
    expect(statusAfterEdit('other_information', 'in_progress', { has_other_information: 'No' })).toBe('in_progress')
    expect(statusAfterEdit('other_information', 'complete', { has_other_information: 'No' })).toBe('complete')
    expect(statusAfterEdit('other_information', 'complete', {})).toBe('not_started')
  })

  it('what counts as empty', () => {
    expect(isEmptyContent({ a: '', b: [], c: null, d: false, e: [{ x: '' }], _built_from: 'x' })).toBe(true)
    expect(isEmptyContent({ a: 0 })).toBe(false)
    expect(isEmptyContent({ a: ['x'] })).toBe(false)
  })

  it('every section can reach complete, and the count counts complete only', () => {
    for (const d of SECTIONS) expect(d.fields.length, d.key).toBeGreaterThan(0)
    expect(completeCount({ risks: 'complete', training: 'in_progress', remediation: 'complete' })).toBe(2)
  })
})
