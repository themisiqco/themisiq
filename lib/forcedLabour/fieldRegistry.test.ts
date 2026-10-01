import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { SECTIONS, SECTION_KEYS } from '../s211/builderContent'
import { FIELD_REGISTRY, CANADA_UI_ONLY, storage, sharedFields, type RegistryField } from './fieldRegistry'
import { CROSSWALK, OUTSIDE_THE_AREAS } from './requirementsMap'
import { COUNTRIES } from './countries'

const ROOT = process.cwd()
const canadaSection = (f: RegistryField) => (f.canada?.kind === 'section' ? f.canada : null)

/** The s211_reports columns, read from the migration that creates the table. */
function reportColumns(): string[] {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/20260930_s211_reports.sql'), 'utf8')
  const body = /create table public\.s211_reports \(([\s\S]*?)\n\);/.exec(sql)![1]
  return body.split('\n').map(l => l.replace(/--.*$/, '').trim()).filter(Boolean).map(l => l.split(/\s+/)[0])
}
/** Identity and bookkeeping columns: the row's, not an answer. */
const SYSTEM_COLUMNS = ['id', 'user_id', 'created_at', 'updated_at']

describe('the field registry covers every Canadian field, and only those', () => {
  it('keys are unique', () => {
    const keys = FIELD_REGISTRY.map(f => f.key)
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })

  it('every visible builder field has exactly one entry', () => {
    const builder = SECTIONS.flatMap(s => s.fields.map(f => `${s.key}.${f.key}`))
    const mapped = FIELD_REGISTRY.flatMap(f => { const c = canadaSection(f); return c && !c.hidden ? [`${c.section}.${c.field}`] : [] })
    expect(builder.filter(k => !mapped.includes(k))).toEqual([])
    expect(mapped.filter(k => !builder.includes(k))).toEqual([])
    expect(mapped.length).toBe(builder.length)
  })

  it('every hidden key the registry names is written by the builder code', () => {
    const files = ['lib/s211/stepsSummary.ts', 'lib/s211/attestation.ts', 'lib/s211/applicability.ts', 'app/dashboard/forced-labour/page.tsx']
    const code = files.map(f => readFileSync(join(ROOT, f), 'utf8')).join('\n')
    const hiddenKeys = FIELD_REGISTRY.flatMap(f => { const c = canadaSection(f); return c?.hidden ? [c.field] : [] })
    expect(hiddenKeys.length).toBeGreaterThan(0)
    expect(hiddenKeys.filter(k => !code.includes(k))).toEqual([])
  })

  it('no hidden key in the builder code is left out', () => {
    // Any `_name` content key written in lib/s211 or the builder routes must be in the registry or be a
    // known non-content name.
    const dirs = ['lib/s211', 'app/dashboard/forced-labour', 'app/dashboard/forced-labour/_components', 'app/dashboard/forced-labour/[id]']
    const code = dirs.flatMap(d => readdirSync(join(ROOT, d)).filter(f => /\.tsx?$/.test(f) && !f.includes('.test.')).map(f => readFileSync(join(ROOT, d, f), 'utf8'))).join('\n')
    const written = new Set([...code.matchAll(/\b(_(?:built|attestation|applicability)[a-z_]*)\b/g)].map(m => m[1]))
    const hiddenKeys = new Set(FIELD_REGISTRY.flatMap(f => { const c = canadaSection(f); return c?.hidden ? [c.field] : [] }))
    expect([...written].filter(k => !hiddenKeys.has(k)).sort()).toEqual([])
  })

  it('every s211_reports column is mapped, except the row’s own identity and timestamps', () => {
    const cols = reportColumns().filter(c => !SYSTEM_COLUMNS.includes(c))
    const mapped = FIELD_REGISTRY.flatMap(f => (f.canada?.kind === 'column' ? [f.canada.column] : []))
    expect(cols.filter(c => !mapped.includes(c))).toEqual([])
    expect(mapped.filter(c => !cols.includes(c))).toEqual([])
  })

  it('names sections that exist, and UI-only state that is never stored', () => {
    const sections = new Set<string>(SECTION_KEYS)
    expect(FIELD_REGISTRY.flatMap(f => { const c = canadaSection(f); return c ? [c.section] : [] }).filter(s => !sections.has(s))).toEqual([])
    expect(CANADA_UI_ONLY).toEqual(['fy_override'])
    expect(FIELD_REGISTRY.some(f => f.key.endsWith('.fy_override'))).toBe(false)
  })
})

describe('nothing is orphaned', () => {
  it('every entry has a country, and only countries the module knows', () => {
    const known = new Set(COUNTRIES.map(c => c.key))
    for (const f of FIELD_REGISTRY) {
      expect(f.countries.length, f.key).toBeGreaterThan(0)
      expect(f.countries.filter(c => !known.has(c)), f.key).toEqual([])
    }
  })

  it('a field with a Canadian home is used by Canada, and one without names no Canadian home', () => {
    for (const f of FIELD_REGISTRY) expect(f.countries.includes('canada'), f.key).toBe(f.canada !== null)
  })

  it('shared means used by more than one country', () => {
    for (const f of FIELD_REGISTRY) expect(storage(f) === 'shared', f.key).toBe(f.countries.length > 1)
    expect(sharedFields().length).toBeGreaterThan(0)
  })
})

describe('countries follow the Stage A crosswalk', () => {
  it('a field in a template area sits in a Canada section the crosswalk row names', () => {
    for (const f of FIELD_REGISTRY) {
      if (typeof f.area !== 'number') continue
      const row = CROSSWALK.find(r => r.area === f.area)!
      const c = canadaSection(f)
      if (c) expect(row.canada.sections, f.key).toContain(c.section)
    }
  })

  it('a field lists the UK or Australia only where the crosswalk row cites that country', () => {
    for (const f of FIELD_REGISTRY) {
      if (typeof f.area !== 'number') continue
      const row = CROSSWALK.find(r => r.area === f.area)!
      if (f.countries.includes('uk')) expect(row.uk.refs.length, f.key).toBeGreaterThan(0)
      if (f.countries.includes('australia')) expect(row.au.refs.length, f.key).toBeGreaterThan(0)
    }
  })

  it('steps taken is Canada and the UK, as the crosswalk records', () => {
    const steps = OUTSIDE_THE_AREAS.find(o => o.topic === 'Steps taken during the year')!
    expect(steps.refs.map(r => r.split(':')[0]).sort()).toEqual(['ca', 'uk'])
    for (const f of FIELD_REGISTRY.filter(f => f.area === 'steps')) expect(f.countries.filter(c => c !== 'canada' && c !== 'uk'), f.key).toEqual([])
  })

  it('Canada s.11(3)(e), applicability and report bookkeeping stay Canada-only; approval is never shared (each country its own)', () => {
    for (const f of FIELD_REGISTRY) {
      if (canadaSection(f)?.section === 'remediation_income_loss' || ['applicability', 'report'].includes(f.area as string)) {
        expect(f.countries, f.key).toEqual(['canada'])
      }
      if (f.area === 'approval') {
        expect(f.countries, f.key).toEqual([f.canada ? 'canada' : 'uk'])
      }
    }
  })

  it('area 7 never lists the UK, which has nothing there', () => {
    expect(FIELD_REGISTRY.filter(f => f.area === 7 && f.countries.includes('uk')).map(f => f.key)).toEqual([])
  })
})
