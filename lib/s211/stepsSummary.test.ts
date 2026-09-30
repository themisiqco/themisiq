import { describe, it, expect } from 'vitest'
import {
  assembleSteps, summaryText, buildStepsContent, stepsDraftState, summaryEdited, stepsFingerprint, describeStepsChanges, SCOPE_PHRASE, type StepSentence,
} from './stepsSummary'
import type { SectionContent, SectionKey } from './builderContent'

type Answers = Partial<Record<SectionKey, SectionContent>>
const FULL: Answers = {
  policies_due_diligence: {
    has_policy: 'Yes', policy_applies_to: ['Own operations', 'Direct suppliers'], policy_list: [{ name: 'Supplier Code of Conduct', year: '2024', approved_by: 'Board' }, { name: 'Responsible Sourcing Policy', year: '', approved_by: '' }],
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
  // A scope option is carried as its fixed phrase (SCOPE_PHRASE), and a bracketed abbreviation such as
  // "(RBC)" is dropped from a step; both are allowed for here and nowhere else.
  const sourceText = s.sources.flatMap(t => valuesIn(a[t.section]?.[t.field]).flatMap(v => [v, SCOPE_PHRASE[v] ?? ''])).join(' | ').toLowerCase().replace(/\s*\([a-z]{2,}\)/g, '')
  const fixed = /^(We had a policy covering forced labour and child labour in place|Our contracts or purchase terms required suppliers to follow (the policy|a code of conduct or sourcing standard)|We carried out due diligence, covering (this step|these steps)|We assessed the risk of forced labour and child labour|We identified \d+ risk areas?|We took measures to remediate forced labour or child labour|We had a channel for workers or others to report concerns|We took measures to remediate the loss of income to vulnerable families|We provided training on forced labour and child labour|We checked the effectiveness of our actions)/
  expect(s.text, s.text).toMatch(fixed)
  // What follows the fixed opening, split on the list joiners, must each be in the sources.
  const tail = s.text.replace(fixed, '').replace(/^(: |, using: |, completed by | by: | to employees|, applying to )/, '').replace(/: /g, ', ').replace(/\.$/, '').replace(/ employees?$/, '')
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
      'We had a policy covering forced labour and child labour in place, applying to our own operations and direct suppliers: Supplier Code of Conduct and Responsible Sourcing Policy.',
      'Our contracts or purchase terms required suppliers to follow the policy.',
      'We carried out due diligence, covering this step: tracking implementation and results.',
      'We assessed the risk of forced labour and child labour, using: audits and supplier questionnaires.',
      'We identified 2 risk areas: Sewn goods, Vietnam and Cotton fabric.',
      'We took measures to remediate forced labour or child labour.',
      'We had a channel for workers or others to report concerns.',
      'We took measures to remediate the loss of income to vulnerable families.',
      'We provided training on forced labour and child labour, completed by 14 employees.',
      'We checked the effectiveness of our actions.',
    ].join(' '))
  })

  it('"In progress" is kept out of the summary and offered separately', () => {
    const a = assembleSteps({ ...FULL, training: { training_provided: 'In progress' } })
    expect(a.sentences.map(s => s.item)).not.toContain('training')
    expect(a.inProgress.map(w => w.item)).toContain('training')
    expect(a.inProgress.find(w => w.item === 'training')!.text).toBe('At the end of the financial year we still had work under way on: training.')
    expect(summaryText(a)).not.toMatch(/training/i)
  })

  it('nothing answered: no sentence at all, so nothing is asserted', () => {
    const a = assembleSteps({})
    expect(a.sentences).toEqual([])
    expect(summaryText(a)).toBe('')
  })

  it('unticking an item removes its sentence', () => {
    const a = assembleSteps(FULL)
    expect(summaryText(a, a.checklist.filter(i => i !== 'grievance'))).not.toContain('We had a channel')
  })
})

describe('section 9: wording (review items A6, G34 to G37)', () => {
  const s3 = (over: SectionContent): Answers => ({ policies_due_diligence: { ...FULL.policies_due_diligence, ...over } })

  it('never mentions "the policy" unless a written policy is ticked', () => {
    for (const has_policy of ['No', 'In progress', undefined]) {
      const text = summaryText(assembleSteps(s3({ has_policy, supplier_terms: 'Yes' })))
      expect(text, String(has_policy)).not.toMatch(/the policy/i)
      expect(text).toContain('Our contracts or purchase terms required suppliers to follow a code of conduct or sourcing standard.')
    }
    expect(summaryText(assembleSteps(s3({ has_policy: 'Yes', supplier_terms: 'Yes' })))).toContain('required suppliers to follow the policy.')
  })

  it('the policy sentence carries its scope, in the order ticked', () => {
    const one = assembleSteps(s3({ policy_applies_to: ['Controlled entities'] })).sentences.find(x => x.item === 'policy')!
    expect(one.text).toBe('We had a policy covering forced labour and child labour in place, applying to entities we control: Supplier Code of Conduct and Responsible Sourcing Policy.')
    expect(one.sources).toContainEqual({ section: 'policies_due_diligence', field: 'policy_applies_to' })
    const none = assembleSteps(s3({ policy_applies_to: [] })).sentences.find(x => x.item === 'policy')!
    expect(none.text).toBe('We had a policy covering forced labour and child labour in place: Supplier Code of Conduct and Responsible Sourcing Policy.')
  })

  it('"this step" for one, "these steps" for more, and no bracketed abbreviation', () => {
    const steps = [{ step: 'Embedding responsible business conduct (RBC) into policies and management systems', status: 'Yes' }, { step: 'Tracking implementation and results', status: 'Yes' }]
    const text = assembleSteps(s3({ due_diligence_steps: steps })).sentences.find(x => x.item === 'due_diligence')!.text
    expect(text).toBe('We carried out due diligence, covering these steps: embedding responsible business conduct into policies and management systems and tracking implementation and results.')
    expect(text).not.toContain('RBC')
  })

  it('the in-progress sentence for supplier terms does not mention "the policy" either', () => {
    const a = assembleSteps(s3({ has_policy: 'No', supplier_terms: 'In progress' }))
    expect(a.inProgress.find(w => w.item === 'supplier_terms')!.text).toBe('At the end of the financial year we still had work under way on: contracts or purchase terms.')
  })

  it('first person throughout: no generated sentence speaks of "the entity" or in the passive "was available"', () => {
    const everything: Answers = { ...FULL, training: { training_provided: 'In progress' } }
    const a = assembleSteps(everything)
    for (const t of [...a.sentences.map(x => x.text), ...a.inProgress.map(x => x.text)]) {
      expect(t).toMatch(/^(We |Our |At the end of the financial year we )/)
      expect(t).not.toMatch(/the entity|was available/i)
    }
  })
})

describe('section 9: what changed since the summary was built (review item G38)', () => {
  it('a newly ticked written policy is named, with what to do', () => {
    const s9 = buildStepsContent({}, { ...FULL, policies_due_diligence: { ...FULL.policies_due_diligence, has_policy: 'No' } })
    // The supplier-terms sentence changes with it: it now refers to the policy, not a code or standard.
    expect(describeStepsChanges(s9, FULL)).toEqual([
      'Section 3 now says a written policy was in place. Rebuild to include it.',
      'Section 3 has new details for \u201CContracts or purchase terms\u201D. Rebuild to update the summary.',
    ])
  })

  it('an item that no longer applies is explained as taken off the checklist, waiting for a rebuild', () => {
    const s9 = buildStepsContent({}, FULL)
    const changes = describeStepsChanges(s9, { ...FULL, training: { training_provided: 'No' } })
    expect(changes).toEqual(['Section 7 no longer says training was provided, so it has been taken off the checklist. Rebuild to take it out of the summary.'])
  })

  it('changed details are named by item', () => {
    const s9 = buildStepsContent({}, FULL)
    expect(describeStepsChanges(s9, { ...FULL, training: { training_provided: 'Yes', employees_trained: 15 } }))
      .toEqual(['Section 7 has new details for \u201CTraining\u201D. Rebuild to update the summary.'])
  })

  it('nothing changed: nothing listed', () => {
    expect(describeStepsChanges(buildStepsContent({}, FULL), FULL)).toEqual([])
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
