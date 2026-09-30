import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SECTIONS, SECTION_KEYS, KEY_TERMS, letteredLines, ATTESTATION_DEFAULT, MONTHS, OECD_STEPS, OECD_STEPS_SOURCE_NOTE, quotedExample, sectionDef } from './builderContent'
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
    // Sections 2 to 8: the s.11(3) lead-in, from the verified constant, above the lettered paragraph.
    expect(SECTIONS.slice(1, 8).map(s => s.actQuote!.lines)).toEqual(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(l => [R.S211_ACT_SECTION_11_3.leadIn, `(${l}) ${para(l)}`]))
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
      expect(read(f), f).not.toContain('/dashboard/forced-labour')
    expect(read('app/dashboard/forced-labour/layout.tsx')).toContain('robots: { index: false, follow: false }')
  })
})

describe('review fixes: builder text', () => {
  const field = (k: Parameters<typeof sectionDef>[0], f: string) => sectionDef(k).fields.find(x => x.key === f)!

  it('an example that quotes text gets single marks inside, never a doubled opening mark (review item A2)', () => {
    expect(quotedExample('"Harrowgate Group", 2025.')).toBe('\u201C\u2018Harrowgate Group\u2019, 2025.\u201D')
    expect(quotedExample('No quotation inside.')).toBe('\u201CNo quotation inside.\u201D')
    for (const d of SECTIONS) expect(quotedExample(d.weakExample), d.key).not.toMatch(/\u201C\u201C|\u201C"|""/)
  })

  it('section 1: month names, the plain-terms sentence, the radio labels, and the override behind a link (items E22 to E28)', () => {
    expect(MONTHS).toHaveLength(12)
    expect(field('report_details', 'year_end_month').type).toBe('month')
    expect(sectionDef('report_details').plainTerms).toContain('The report due by May 31 covers the entity\u2019s most recent completed financial year.'.replace('\u2019', "'"))
    expect(field('report_details', 'report_type').optionLabels).toEqual({ single: 'Single report', joint: 'Joint report' })
    expect(sectionDef('report_details').fields.filter(f => f.revealedBy === 'fy_override').map(f => f.key)).toEqual(['financial_year_start', 'financial_year_end'])
    expect(field('report_details', 'other_jurisdictions').exclusiveOption).toBe('None')
  })

  it('section 3: the new hint, and the OECD steps come from the constant with one source note (items F32, F33)', () => {
    expect(SECTIONS.flatMap(d => d.fields).map(f => f.hint)).toContain('Name the process, which role or team runs it (a job title, not a person\'s name) and how often.')
    expect(OECD_STEPS).toBe(R.S211_GUIDANCE_B_OECD_STEPS)
    expect(OECD_STEPS_SOURCE_NOTE).toBe('The six steps in the OECD Due Diligence Guidance for Responsible Business Conduct, as listed in Public Safety Canada\'s guidance.')
    expect(field('policies_due_diligence', 'due_diligence_steps').hint).toContain('The Act does not require an entity to follow it.')
  })

  it('section 11: authority to bind is a tick box, and the length note (items H40, H41)', () => {
    expect(field('approval_attestation', 'authority_to_bind').type).toBe('confirm')
    expect(sectionDef('approval_attestation').characterGuidance).toBe('Keep edits close to the length of the example.')
  })
})

describe('review fixes: the builder pages (source checks)', () => {
  // The section page moved into a shared component in Stage 5a, used by the report and preview routes.
  const page = read('app/dashboard/forced-labour/_components/SectionPage.tsx')
  const route = read('app/dashboard/forced-labour/[id]/[section]/page.tsx')
  const ui = read('app/dashboard/forced-labour/_components/ui.tsx')
  const check = read('app/dashboard/forced-labour/[id]/check/page.tsx')
  const home = read('app/dashboard/forced-labour/[id]/page.tsx')
  const list = read('app/dashboard/forced-labour/page.tsx')

  it('the panels open on the first visit, read once before the visit is recorded (item A1)', () => {
    expect(page).toMatch(/useState\(\(\) => isFirstVisit\(/)
    expect(page).toContain('open={firstVisit}')
    expect(route).toMatch(/<SectionPage key=\{section\}/)
  })

  it('every section page has the section list, the jump menu and the way back (item B7)', () => {
    expect(page).toContain('className="s211-nav-side"')
    expect(page).toContain('Jump to section')
    expect(page).toContain('Back to report overview')
    expect(ui).toMatch(/\.s211-nav-side \{[^}]*position: sticky/)
  })

  it('no browser confirm: an in-page panel with the two named choices (item G39)', () => {
    const code = (src: string) => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    for (const src of [page, ui]) expect(code(src)).not.toMatch(/window\.confirm|\bconfirm\(/)
    expect(page).toContain('<ReplaceDraftPanel')
    expect(page).toContain('keepLabel={KEEP_MINE} replaceLabel={REPLACE_WITH_NEW}')
  })

  it('the check page links every section, lists section 10 apart, and shows the placeholder warning (items B8, B9, A5)', () => {
    expect(check).toContain('checkReport(')
    expect(check).toContain('Optional sections not used')
    expect(check).toContain('c.warnings.map')
    expect(check).not.toMatch(/\.join\('; '\)/)
  })

  it('the check page downloads the PDF through the gated export route, and lists what blocks it (Stage 4)', () => {
    expect(check).toContain('Download PDF')
    expect(check).toContain('s211Download(`/reports/${id}/export`)')
    expect(check).toContain('exportGate(sections)')
    expect(check).toContain('scanPersonalInformation(')
    expect(check).not.toContain('window.open')
  })

  it('the home page labels the Act s.9(a) and shows notes after the quotations; the list page offers the next report due (items C14, C15, C17)', () => {
    expect(home).toContain("'The Act, s.9(a)'")
    expect(home.indexOf('obligation.guidanceQuoted.map')).toBeLessThan(home.indexOf('obligation.notes.map'))
    expect(list).toContain('defaultReportingYear(new Date())')
  })
})
