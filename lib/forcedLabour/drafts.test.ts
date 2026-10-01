import { describe, it, expect } from 'vitest'
import { LAW_SCOPE, draftSources, withDrafts, clearDraft, draftsOf, offeredOf, settleOffered, savedDrafts, draftBadge, draftConfirmLabel, DRAFT_KEY, OFFERED_KEY } from './drafts'
import { S211_ACT_SECTION_11_3 } from '../s211/requirements'
import { UK_MSA_S54_4 } from './uk/requirements'
import { AU_MSA_S16_1 } from './au/requirements'
import { ukSectionDef } from './uk/builderContent'
import { canadaFieldsOf } from './canadaAdapter'
import type { SectionContent } from '../s211/builderContent'

describe('each law’s scope, from its constant', () => {
  it('Canada s.11(3)(b), UK s.54(4), Australia s.16(1)(c)', () => {
    expect(S211_ACT_SECTION_11_3.paragraphs[1].text).toContain(LAW_SCOPE.canada)
    expect(UK_MSA_S54_4.paragraphs[0].text).toContain(LAW_SCOPE.uk)
    expect(AU_MSA_S16_1.paragraphs[2].text).toContain(LAW_SCOPE.australia)
  })
})

const training = ukSectionDef('training')
const sources = draftSources([
  { country: 'canada', registryKey: 'training.training_description', value: 'Canada’s course.' },
  { country: 'canada', registryKey: 'training.employees_trained', value: 14 },       // shared, never a draft
  { country: 'canada', registryKey: 'training.covers', value: [] },                  // empty, never a draft
])

describe('drafts', () => {
  it('a per-country field with no answer starts from another country’s, marked with where it came from', () => {
    const c = withDrafts('uk', training.fields, {} as SectionContent, sources)
    expect(c.training_description).toBe('Canada’s course.')
    expect(offeredOf(c)).toEqual({ training_description: 'canada' })
    expect(draftsOf(c)).toEqual({})   // offered, not saved
    expect(c.employees_trained).toBeUndefined()
    expect(c.covers).toBeUndefined()
  })
  it('never over an answer the country has, and never from itself', () => {
    expect(withDrafts('uk', training.fields, { training_description: 'Mine.' } as SectionContent, sources)).toEqual({ training_description: 'Mine.' })
    expect(withDrafts('canada', canadaFieldsOf('training'), {} as SectionContent, sources)).toEqual({})
  })
  it('a field that drafts itself is skipped (Canada’s steps summary)', () => {
    const s = draftSources([{ country: 'uk', registryKey: 'uk_steps_taken.steps_summary', value: 'UK steps.' }])
    expect(withDrafts('canada', canadaFieldsOf('steps_taken'), {} as SectionContent, s, new Set(['steps_summary']))).toEqual({})
    expect(withDrafts('canada', canadaFieldsOf('steps_taken'), {} as SectionContent, s).steps_summary).toBe('UK steps.')
  })
  it('editing or confirming clears the mark, and the bookkeeping key goes when none is left', () => {
    const c = withDrafts('uk', training.fields, {} as SectionContent, sources)
    expect(OFFERED_KEY in clearDraft(c, 'training_description')).toBe(false)
    expect(DRAFT_KEY in clearDraft({ x: 'v', [DRAFT_KEY]: { x: 'uk' } } as SectionContent, 'x')).toBe(false)
    expect(clearDraft({ a: 1 } as SectionContent, 'a')).toEqual({ a: 1 })
  })
  it('the badge names the source and this law’s scope', () => {
    expect(draftBadge('canada', 'uk')).toBe('Started from your Canada answer: check it covers slavery and human trafficking')
    expect(draftBadge('uk', 'canada')).toBe('Started from your United Kingdom answer: check it covers forced labour and child labour')
    expect(draftConfirmLabel('uk')).toBe('It covers slavery and human trafficking')
  })
})

describe('offered, then saved', () => {
  it('a save turns kept offered drafts into saved drafts, drops emptied ones, and never stores the offered mark', () => {
    const offered = { a: 'kept', b: '', c: 'mine', [OFFERED_KEY]: { a: 'canada', b: 'canada' }, [DRAFT_KEY]: { d: 'uk' }, d: 'old draft' } as unknown as SectionContent
    expect(settleOffered(offered)).toEqual({ a: 'kept', b: '', c: 'mine', d: 'old draft', [DRAFT_KEY]: { d: 'uk', a: 'canada' } })
    expect(settleOffered({ a: 1 } as SectionContent)).toEqual({ a: 1 })
  })
  it('only saved drafts are listed for the export gate', () => {
    expect(savedDrafts({ training: { [DRAFT_KEY]: { x: 'canada' }, [OFFERED_KEY]: { y: 'canada' } } as SectionContent, risk: undefined }))
      .toEqual([{ section: 'training', field: 'x', from: 'canada' }])
  })
})

