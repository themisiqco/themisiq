import { describe, it, expect } from 'vitest'
import * as UK from './uk/requirements'
import * as AU from './au/requirements'
import * as CA from '../s211/requirements'
import * as SOURCES from '../sources'
import { UK_MAP, AU_MAP, MAP_TOPICS, CROSSWALK, OUTSIDE_THE_AREAS, OPEN_QUESTIONS, type Cell } from './requirementsMap'
import { PENDING_REFORMS } from './pendingReforms'

// The map's job is to say where each rule lives. These tests hold it to that: every reference resolves to
// a verbatim constant (and, with '#x', to a lettered paragraph that exists), every cell with a source
// names one, and the pending reforms stay out of the requirements.

const MODULES: Record<string, Record<string, unknown>> = { uk: UK, au: AU, ca: CA }

function resolve(ref: string): string | null {
  const m = /^(uk|au|ca):([A-Z0-9_]+)(?:#([a-z]+))?$/.exec(ref)
  if (!m) return `${ref}: not in the form country:NAME or country:NAME#letter`
  const v = MODULES[m[1]][m[2]]
  if (v === undefined) return `${ref}: no such constant`
  if (m[3]) {
    const paras = (v as { paragraphs?: { letter: string }[] }).paragraphs
    if (!paras?.some(p => p.letter === m[3])) return `${ref}: no paragraph (${m[3]})`
  }
  return null
}

const cells = (map: Record<string, readonly Cell[]>) => Object.values(map).flat()
const allRefs = [
  ...cells(UK_MAP).flatMap(c => c.refs), ...cells(AU_MAP).flatMap(c => c.refs),
  ...CROSSWALK.flatMap(r => [...r.canada.refs, ...r.uk.refs, ...r.au.refs]),
  ...OUTSIDE_THE_AREAS.flatMap(o => o.refs),
  ...OPEN_QUESTIONS.flatMap(q => q.refs),
]

describe('the requirements map', () => {
  it('covers every topic for both countries', () => {
    for (const map of [UK_MAP, AU_MAP]) {
      expect(Object.keys(map).sort()).toEqual([...MAP_TOPICS].sort())
      for (const t of MAP_TOPICS) expect(map[t].length).toBeGreaterThan(0)
    }
  })

  it('every reference resolves to a verbatim constant', () => {
    expect(allRefs.map(resolve).filter(Boolean)).toEqual([])
  })

  it('a cell names a source unless it says none was found, and then names none', () => {
    for (const c of [...cells(UK_MAP), ...cells(AU_MAP)]) {
      if (c.basis === 'none found') expect(c.refs).toEqual([])
      else expect(c.refs.length, c.finding).toBeGreaterThan(0)
    }
  })

  it('a UK cell cites UK constants only, and an Australian cell Australian ones', () => {
    expect(cells(UK_MAP).flatMap(c => c.refs).filter(r => !r.startsWith('uk:'))).toEqual([])
    expect(cells(AU_MAP).flatMap(c => c.refs).filter(r => !r.startsWith('au:'))).toEqual([])
  })

  it('a cell marked statute alone cites no guidance, and guidance alone cites no statute', () => {
    const statute = /^(uk:UK_(MSA|REGS)_|au:AU_MSA_)/
    for (const c of [...cells(UK_MAP), ...cells(AU_MAP)]) {
      if (c.basis === 'statute') expect(c.refs.filter(r => !statute.test(r)), c.finding).toEqual([])
      if (c.basis === 'guidance') expect(c.refs.filter(r => statute.test(r)), c.finding).toEqual([])
    }
  })

  it('keeps the approved-form question open, and maps the register guidance as guidance', () => {
    expect(OPEN_QUESTIONS.some(q => q.country === 'au' && q.question.includes('form approved by the Minister'))).toBe(true)
    const register = cells(AU_MAP).filter(c => c.refs.some(r => /^au:AU_(REGISTER_|SUBMISSION_)/.test(r)))
    expect(register.every(c => c.basis !== 'statute')).toBe(true)
    expect(cells(AU_MAP).some(c => c.refs.includes('au:AU_REGISTER_ANNEX_NOTE_F'))).toBe(true)
  })

  it('records the UK six-month timing as guidance and the Australian one as statute', () => {
    expect(UK_MAP.timing.find(c => c.finding.includes('six months'))?.basis).toBe('guidance')
    expect(AU_MAP.timing[0].basis).toBe('statute and guidance')
    expect(AU_MAP.timing[0].refs).toContain('au:AU_MSA_S13_2#e')
  })

  it('our own words carry no em-dash', () => {
    const text = [...cells(UK_MAP), ...cells(AU_MAP)].map(c => c.finding)
      .concat(CROSSWALK.map(r => r.note), OUTSIDE_THE_AREAS.map(o => o.note))
    expect(text.filter(s => s.includes('—'))).toEqual([])
  })
})

describe('the crosswalk', () => {
  it('has one row per template area, in order', () => {
    expect(CROSSWALK.map(r => r.area)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(CA.S211_TEMPLATE_AREAS).toHaveLength(7)
  })

  it('names Canada builder sections that exist', async () => {
    const { SECTION_KEYS } = await import('../s211/builderContent')
    const keys = new Set<string>(SECTION_KEYS)
    expect(CROSSWALK.flatMap(r => r.canada.sections).filter(s => !keys.has(s))).toEqual([])
  })

  it('marks the UK column as recommended throughout, and the Canada-only s.11(3)(e) as such', () => {
    expect(CROSSWALK.every(r => r.uk.required === false)).toBe(true)
    const area4 = CROSSWALK.find(r => r.area === 4)!
    expect(area4.canada.refs).toContain('ca:S211_ACT_SECTION_11_3#e')
    expect(area4.note).toContain('Canada-only')
  })
})

describe('the pending reforms', () => {
  it('are dated, and cite sources that exist in lib/sources.ts', () => {
    for (const r of PENDING_REFORMS) {
      expect(r.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const s of r.sources) expect((SOURCES as Record<string, unknown>)[s], s).toBeTypeOf('string')
    }
  })

  it('name only topics the map has', () => {
    const topics = new Set<string>(MAP_TOPICS)
    expect(PENDING_REFORMS.flatMap(r => r.wouldChange.map(w => w.topic)).filter(t => !topics.has(t))).toEqual([])
  })

  it('record the Australian announcement as unverified, with no changes guessed', () => {
    const au = PENDING_REFORMS.find(r => r.country === 'au')!
    expect(au.status).toMatch(/^UNVERIFIED\./)
    expect(au.quoted).toEqual([])
    expect(au.wouldChange).toEqual([])
  })

  it('pin the impact assessment’s wording for the UK measures', () => {
    const uk = PENDING_REFORMS.find(r => r.country === 'uk')!
    expect(uk.quoted).toEqual([
      'bring public bodies with a budget of £36 million and over in scope',
      'mandate reporting on certain topics',
      'mandate publication of statements to a central online repository, currently the Modern Slavery Statement Registry',
      'bring greater clarity on approval for statements',
      'make express provision for group statements',
      'introduce a reporting deadline',
      'introduce civil penalties for non-compliance',
      'Topics are: 1. Organisation structure, operations and supply chains; 2. Policies in relation to slavery and trafficking; 3. Assessing and mitigating risks; 4. Due diligence; 5. Training; and 6. Monitoring effectiveness.',
    ])
  })
})
