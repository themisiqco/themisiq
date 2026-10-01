import { describe, it, expect } from 'vitest'
import { countryAnswersFrom, overlayCountrySection, sharedProvenance, sharedFieldsIn, countryStatusAfterEdit, countryMarkComplete } from './countryAdapter'
import { ukSectionDef } from './uk/builderContent'
import type { SectionContent } from '../s211/builderContent'

const training = ukSectionDef('training')
const steps = ukSectionDef('steps_taken')

describe('the country adapter (UK)', () => {
  it('shares every shared field and nothing UK-only', () => {
    const keys = sharedFieldsIn(training).map(f => f.registryKey)
    expect(keys).toContain('training.mandatory')
    expect(keys).not.toContain('uk_training.covers_slavery_trafficking')
    expect(keys).not.toContain('uk_training.training_provided')
  })
  it('a save upserts what the section holds (null kept) and removes the rest', () => {
    const { upsert, remove } = countryAnswersFrom(training, { mandatory: 'Optional', employees_trained: null, covers_slavery_trafficking: 'Yes', training_provided: 'Yes' } as SectionContent)
    expect(upsert).toEqual([{ field_key: 'training.mandatory', value: 'Optional' }, { field_key: 'training.employees_trained', value: null }])
    expect(remove).toContain('training.audience')
    expect([...upsert.map(u => u.field_key), ...remove]).not.toContain('uk_training.training_provided')
    expect(remove).not.toContain('uk_training.covers_slavery_trafficking')
  })
  it('a read lays shared answers over the stored section; UK-only answers are untouched', () => {
    const out = overlayCountrySection(training, { mandatory: 'Optional', covers_slavery_trafficking: 'Yes' } as SectionContent,
      new Map<string, unknown>([['training.mandatory', 'Mandatory'], ['uk_training.covers_slavery_trafficking', 'No']]))
    expect(out).toEqual({ mandatory: 'Mandatory', covers_slavery_trafficking: 'Yes' })
  })
  it('provenance: the UK’s own answer is "here"; one given elsewhere names the other countries', () => {
    const answers = new Map<string, unknown>([['training.mandatory', 'Mandatory'], ['training.frequency_and_length', 'x']])
    const p = sharedProvenance(training, { mandatory: 'Mandatory' } as SectionContent, answers, 'uk')
    expect(p.mandatory).toEqual({ from: 'here' })
    expect(p.frequency_and_length).toEqual({ from: 'elsewhere', countries: ['canada', 'australia'] })
  })
  it('the status rules are Canada’s: empty, in progress, complete only when required fields are filled', () => {
    expect(countryStatusAfterEdit(steps, 'not_started', {})).toBe('not_started')
    expect(countryStatusAfterEdit(steps, 'not_started', { governance: 'Board' } as SectionContent)).toBe('in_progress')
    expect(countryMarkComplete(steps, { statement_kind: 'steps' } as SectionContent).ok).toBe(false)
    expect(countryMarkComplete(steps, { statement_kind: 'steps', steps_summary: 'We audited suppliers.' } as SectionContent).ok).toBe(true)
    expect(countryStatusAfterEdit(steps, 'complete', { statement_kind: 'steps' } as SectionContent)).toBe('in_progress')
  })
})
