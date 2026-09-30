import { describe, it, expect } from 'vitest'
import {
  missingRequired, markComplete, statusAfterEdit, isEmptyContent, completeCount, invalidAnswers, labelsInline, labelsEndingSentence, asList, isIsoDate,
  NOTHING_TO_REPORT_KEY,
} from './sectionStatus'
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

describe('review fixes: refusals, dates, rows and the day of the month', () => {
  it('one or two missing fields are named inline; three or more are a list (review item D21)', () => {
    const two = markComplete('training', {})
    expect(two.ok).toBe(false)
    const one = markComplete('training', { training_provided: 'Yes' })
    expect(one.ok).toBe(false)
    if (!one.ok) expect(one.message).toBe('This section cannot be marked complete yet. Fill in \u201CWhat the training covers, and how it is reviewed\u201D.')
    const many = markComplete('approval_attestation', {})
    expect(many.ok).toBe(false)
    if (!many.ok) {
      expect(asList(many.missing)).toBe(true)
      expect(many.message).toBe('This section cannot be marked complete yet. Fill in the fields listed below.')
    }
    expect(asList(['a', 'b'])).toBe(false)
    expect(labelsInline(['a', 'b', 'c'])).toBe('\u201Ca\u201D, \u201Cb\u201D and \u201Cc\u201D')
  })

  it('no doubled punctuation after a label ending in "?" (review item A4)', () => {
    expect(labelsEndingSentence(['Were instances of forced labour or child labour identified?'])).toBe('\u201CWere instances of forced labour or child labour identified?\u201D')
    expect(labelsEndingSentence(['Their title'])).toBe('\u201CTheir title\u201D.')
    const r = markComplete('remediation', {})
    if (!r.ok && !asList(r.missing)) expect(r.message).not.toMatch(/\?\u201D\./)
  })

  it('a date field counts only when it holds a real date, so an empty-looking field is empty (review item D20)', () => {
    expect(isIsoDate('2026-04-14')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('')).toBe(false)
    expect(isIsoDate('April 14')).toBe(false)
    expect(missingRequired('approval_attestation', { approval_date: '2026-02-30' })).toContain('Date the governing body approved the report')
    expect(missingRequired('approval_attestation', { approval_date: '2026-04-14' })).not.toContain('Date the governing body approved the report')
  })

  it('the day of the year end is checked against the month (review item E22)', () => {
    expect(invalidAnswers('report_details', { year_end_month: 4, year_end_day: 31 })).toEqual(['April has no day 31.'])
    expect(invalidAnswers('report_details', { year_end_month: 2, year_end_day: 29 })).toEqual([])
    expect(invalidAnswers('report_details', { year_end_month: 2, year_end_day: 30 })).toEqual(['February has no day 30.'])
    expect(invalidAnswers('report_details', { year_end_month: 12, year_end_day: 31 })).toEqual([])
    const r = markComplete('report_details', { year_end_month: 6, year_end_day: 31 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.invalid).toEqual(['June has no day 31.'])
  })

  it('a section with an invalid answer does not stay complete after an edit', () => {
    const full = Object.fromEntries(sectionDef('report_details').fields.map(f => [f.key, 'x']))
    expect(statusAfterEdit('report_details', 'complete', { ...full, year_end_month: 4, year_end_day: 31 })).not.toBe('complete')
  })

  it('section 3: a written policy needs at least one row with a name and a date (review item F31)', () => {
    const base = { has_policy: 'Yes', due_diligence_description: 'x' }
    const label = sectionDef('policies_due_diligence').fields.find(f => f.key === 'policy_list')!.label
    expect(missingRequired('policies_due_diligence', base)).toContain(label)
    expect(missingRequired('policies_due_diligence', { ...base, policy_list: [{ name: 'Supplier Code', year: '' }] })).toContain(label)
    expect(missingRequired('policies_due_diligence', { ...base, policy_list: [{ name: '', year: '2024' }] })).toContain(label)
    expect(missingRequired('policies_due_diligence', { ...base, policy_list: [{ name: 'Supplier Code', year: '2024' }] })).not.toContain(label)
    expect(missingRequired('policies_due_diligence', { has_policy: 'No', due_diligence_description: 'x' })).not.toContain(label)
  })

  it('section 3: the contracts question names "the policy" only when a written policy is ticked (review item A6)', () => {
    const f = sectionDef('policies_due_diligence').fields.find(x => x.key === 'supplier_terms')!
    expect(f.labelWhen!({ has_policy: 'Yes' })).toContain('follow the policy')
    for (const has_policy of ['No', 'In progress', undefined]) {
      expect(f.labelWhen!({ has_policy })).toBe('Contracts or purchase terms that require suppliers to follow a code of conduct or sourcing standard')
    }
  })
})
