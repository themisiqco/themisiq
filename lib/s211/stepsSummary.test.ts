import { describe, it, expect } from 'vitest'
import {
  assembleSteps, summaryText, buildStepsContent, stepsDraftState, summaryEdited, stepsFingerprint, type StepSentence,
} from './stepsSummary'
import type { SectionContent, SectionKey } from './builderContent'

type Answers = Partial<Record<SectionKey, SectionContent>>
const FULL: Answers = {
  policies_due_diligence: {
    has_policy: 'Yes', policy_list: [{ name: 'Supplier Code of Conduct', year: '2024', approved_by: 'Board' }, { name: 'Responsible Sourcing Policy', year: '', approved_by: '' }],
    supplier_terms: 'Yes',
    due_diligence_steps: [{ step: 'Tracking implementation and results', status: 'Yes' }, { step: 'Communicating how impacts are addressed', status: 'In progress' }],
  },
  risks: { risk_assessment_done: 'Yes', assessment_methods: ['Audits', 'Supplier questionnaires', 'Other'], risk_areas: [{ area: 'Sewn goods, Vietnam', why: 'agency labour' }, { area: 'Cotton fabric', why: '' }] },
  remediation: { remediation_taken: 'Yes', grievance_mechanism: 'Yes' },
  remediation_income_loss: { income_remediation_taken: 'Yes' },
  training: { training_provided: 'Yes', employees_trained: 14 },
  effectiveness: { assesses_effectiveness: 'Yes', methods: ['Other'] },
}

// Every value a sentence carries must be found in the field it names. Fixed words are the template's.
const valuesIn = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : typeof v === 'number' ? [String(v)] : Array.isArray(v) ? v.flatMap(valuesIn)
    : v && typeof v === 'object' ? Object.values(v).flatMap(valuesIn) : []
const traceable = (s: StepSentence, a: Answers) => {
  const sourceText = s.sources.flatMap(t => valuesIn(a[t.section]?.[t.field])).join(' | ').toLowerCase()
  const fixed = /^(We had a policy covering forced labour and child labour in place|Our contracts or purchase terms required suppliers to follow the policy|We carried out due diligence, covering these steps|We assessed the risk of forced labour and child labour|We identified \d+ risk areas?|We took measures to remediate forced labour or child labour|A channel was available for workers or others to report concerns|We took measures to remediate the loss of income to vulnerable families|We provided training on forced labour and child labour|We checked the effectiveness of our actions)/
  expect(s.text, s.text).toMatch(fixed)
  // What follows the fixed opening, split on the list joiners, must each be in the sources.
  const tail = s.text.replace(fixed, '').replace(/^(: |, using: |, completed by | by: | to employees)/, '').replace(/\.$/, '').replace(/ employees?$/, '')
  for (const part of tail.split(/, | and /).map(p => p.trim()).filter(Boolean)) expect(sourceText, `"${part}" in ${s.text}`).toContain(part.toLowerCase())
  expect(s.sources.length).toBeGreaterThan(0)
}

describe('section 9: assembled from fixed sentences and the user\'s own answers', () => {
  it('every sentence is traceable to the answers it names, and names at least one', () => {
    const a = assembleSteps(FULL)
    expect(a.sentences.length).toBeGreaterThan(5)
    for (const s of a.sentences) traceable(s, FULL)
  })

  it('the draft, in report order', () => {
    expect(summaryText(assembleSteps(FULL))).toBe([
      'We had a policy covering forced labour and child labour in place: Supplier Code of Conduct and Responsible Sourcing Policy.',
      'Our contracts or purchase terms required suppliers to follow the policy.',
      'We carried out due diligence, covering these steps: tracking implementation and results.',
      'We assessed the risk of forced labour and child labour, using: audits and supplier questionnaires.',
      'We identified 2 risk areas: Sewn goods, Vietnam and Cotton fabric.',
      'We took measures to remediate forced labour or child labour.',
      'A channel was available for workers or others to report concerns.',
      'We took measures to remediate the loss of income to vulnerable families.',
      'We provided training on forced labour and child labour, completed by 14 employees.',
      'We checked the effectiveness of our actions.',
    ].join(' '))
  })

  it('"In progress" is kept out of the summary and offered separately', () => {
    const a = assembleSteps({ ...FULL, training: { training_provided: 'In progress' } })
    expect(a.sentences.map(s => s.item)).not.toContain('training')
    expect(a.inProgress.map(w => w.item)).toContain('training')
    expect(a.inProgress.find(w => w.item === 'training')!.text).toBe('Work under way at the end of the financial year, not yet complete: training.')
    expect(summaryText(a)).not.toMatch(/training/i)
  })

  it('nothing answered: no sentence at all, so nothing is asserted', () => {
    const a = assembleSteps({})
    expect(a.sentences).toEqual([])
    expect(summaryText(a)).toBe('')
  })

  it('unticking an item removes its sentence', () => {
    const a = assembleSteps(FULL)
    expect(summaryText(a, a.checklist.filter(i => i !== 'grievance'))).not.toContain('A channel was available')
  })
})

describe('section 9: staleness, and never overwriting edits without asking', () => {
  it('a fresh build is current; a changed answer makes it stale', () => {
    const s9 = buildStepsContent({}, FULL)
    expect(stepsDraftState(s9, FULL)).toBe('current')
    const changed = { ...FULL, training: { training_provided: 'Yes', employees_trained: 15 } }
    expect(stepsDraftState(s9, changed)).toBe('stale')
    expect(stepsDraftState({}, FULL)).toBe('not_built')
  })

  it('an answer section 9 does not read does not make it stale', () => {
    const s9 = buildStepsContent({}, FULL)
    expect(stepsDraftState(s9, { ...FULL, training: { ...FULL.training, frequency_and_length: '45 minutes' } })).toBe('current')
  })

  it('an edited summary is detected, so the page asks before rebuilding', () => {
    const s9 = buildStepsContent({}, FULL)
    expect(summaryEdited(s9)).toBe(false)
    expect(summaryEdited({ ...s9, steps_summary: `${s9.steps_summary} We also joined an industry group.` })).toBe(true)
  })

  it('a rebuild keeps the user\'s other fields in the section', () => {
    const s9 = buildStepsContent({ governance: 'The audit committee.' }, FULL)
    expect(s9.governance).toBe('The audit committee.')
    expect(s9._built_from).toBe(stepsFingerprint(FULL))
  })
})
