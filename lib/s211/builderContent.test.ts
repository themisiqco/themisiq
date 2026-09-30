import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SECTIONS, SECTION_KEYS, KEY_TERMS, letteredLines, ATTESTATION_DEFAULT } from './builderContent'
import * as R from './requirements'

// The one word the house style bans, assembled so this file does not contain it.
const BANNED_WORD = new RegExp(`\\b${'ch'}${'ase'}\\b`, 'i')
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('the builder content', () => {
  it('eleven sections, numbered in order, with the keys the migration CHECKs', () => {
    expect(SECTIONS.map(s => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(SECTIONS.map(s => s.key)).toEqual([...SECTION_KEYS])
    const sql = read('supabase/migrations/20260930_s211_report_sections.sql')
    const check = sql.slice(sql.indexOf('section_key  text not null check'), sql.indexOf(')),', sql.indexOf('section_key  text not null check')))
    expect([...check.matchAll(/'([a-z_]+)'/g)].map(m => m[1])).toEqual([...SECTION_KEYS])
  })

  it('every Act quotation is built from a verified constant in requirements.ts', () => {
    const para = (l: string) => R.S211_ACT_SECTION_11_3.paragraphs.find(p => p.letter === l)!.text
    expect(SECTIONS[0].actQuote!.lines).toEqual(letteredLines(R.S211_ACT_SECTION_11_2))
    expect(SECTIONS.slice(1, 8).map(s => s.actQuote!.lines[0])).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(para))
    expect(SECTIONS[8].actQuote!.lines).toEqual([R.S211_ACT_SECTION_11_1])
    expect(SECTIONS[9].actQuote).toBeNull()
    expect(SECTIONS[10].actQuote!.lines).toEqual([...letteredLines(R.S211_ACT_SECTION_11_4), '', ...letteredLines(R.S211_ACT_SECTION_11_5)])
    expect(SECTIONS[10].actQuote!.lines).toContain('(i) by the governing body of each entity included in the report, or')
  })

  it('every guidance quotation shown is a recorded constant, word for word', () => {
    const recorded = new Set<string>()
    const walk = (v: unknown) => { if (typeof v === 'string') recorded.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk) }
    Object.values(R).forEach(walk)
    for (const s of SECTIONS) for (const q of s.context) for (const l of q.lines) expect(recorded.has(l), `${s.key}: ${l.slice(0, 60)}`).toBe(true)
    for (const s of SECTIONS) if (s.controlledEntities) expect(recorded.has(s.controlledEntities), s.key).toBe(true)
    for (const t of KEY_TERMS) if (t.quote.ref.startsWith('Public')) expect(recorded.has(t.quote.lines[0]), t.term).toBe(true)
    expect(ATTESTATION_DEFAULT).toBe(R.S211_ATTESTATION_EXAMPLE)
  })

  it('the curated template prompts are there, and labelled [Template, optional]', () => {
    const tmpl = SECTIONS.flatMap(s => s.fields.filter(f => f.source === 'template').map(f => `${s.key}.${f.key}`))
    expect(tmpl).toEqual([
      'structure_activities_supply_chains.unknowns', 'structure_activities_supply_chains.information_gathering', 'structure_activities_supply_chains.changes_since_last_report',
      'policies_due_diligence.policy_topics', 'policies_due_diligence.international_standards', 'policies_due_diligence.policy_communication', 'policies_due_diligence.purchasing_practices',
      'risks.assessment_timing', 'risks.assessment_role', 'risks.stakeholder_engagement',
      'training.developer_name',
      'effectiveness.findings_changed_practice',
      'other_information.other_description', 'other_information.challenges', 'other_information.steps_planned_next',
    ])
    const risks = SECTIONS.find(s => s.key === 'risks')!.fields.find(f => f.key === 'risk_areas')!
    expect(risks.columns!.find(c => c.key === 'worker_groups')!.label).toContain('template, optional')
    for (const s of SECTIONS) for (const f of s.fields) if (f.source === 'template') expect(f.required, `${s.key}.${f.key}`).not.toBe(true)
  })

  it('what was decided NOT to add is not there', () => {
    const text = JSON.stringify(SECTIONS).toLowerCase()
    for (const banned of ['number of incidents', 'total number of incidents', 'results of the effectiveness', 'goods and services', 'goods and/or services', 'name of the person', 'wider community', 'train suppliers'])
      expect(text, banned).not.toContain(banned)
    // Training is about employees: no option for suppliers or the community.
    const audience = SECTIONS.find(s => s.key === 'training')!.fields.find(f => f.key === 'audience')!
    expect(audience.options!.join(' ')).not.toMatch(/supplier|community/i)
  })

  it('our own text: Canadian spelling, no em-dashes, and no banned words', () => {
    const recorded = new Set<string>()
    const walk = (v: unknown) => { if (typeof v === 'string') recorded.add(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk) }
    Object.values(R).forEach(walk)
    const ours: string[] = []
    const collect = (v: unknown) => { if (typeof v === 'string') { if (!recorded.has(v) && ![...recorded].some(r => r.length > 30 && v.includes(r))) ours.push(v) } else if (Array.isArray(v)) v.forEach(collect); else if (v && typeof v === 'object') Object.values(v).forEach(collect) }
    SECTIONS.forEach(s => collect({ ...s, actQuote: null, context: [] }))
    KEY_TERMS.forEach(t => collect(t.explanation))
    for (const t of ours) {
      expect(t, t).not.toMatch(/organis|recognis|programme|judgement|analys(e|ing)\b|prioritis|minimis|summaris|utilis|emphasis(e|ing)\b|\bcenter\b|\bcolor\b/i)
      expect(t, t).not.toContain('\u2014')
      expect(t, t).not.toMatch(BANNED_WORD)
    }
    expect(ours.length).toBeGreaterThan(100)
  })

  it('the builder is linked from nowhere: not the navigation, the dashboard, or the sitemap', () => {
    for (const f of ['app/components/Nav.tsx', 'app/components/Footer.tsx', 'app/dashboard/page.tsx', 'app/sitemap.ts'])
      expect(read(f), f).not.toContain('/dashboard/s211')
    expect(read('app/dashboard/s211/layout.tsx')).toContain('robots: { index: false, follow: false }')
  })
})
