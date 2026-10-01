import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The "every table ... is schema-qualified" check in each summary verification script, run here in JavaScript on
// the function bodies its migration creates, with the check's OWN patterns taken from the script. On 1 Oct 2026
// the entities summary reported "unqualified 1" for fl_create_report: the error message 'a Canada report starts
// from s211_reports' matched, because the check did not skip string literals. This would have caught it before
// it reached Supabase; it also proves the check still catches a real unqualified table.

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const PAIRS = [
  ['supabase/migrations/20261001_fl_save_canada_section.sql', 'supabase/verify/20261001_fl_save_canada_section_verify_summary.sql'],
  ['supabase/migrations/20261001_fl_save_country_section.sql', 'supabase/verify/20261001_fl_save_country_section_verify_summary.sql'],
  ['supabase/migrations/20261001_fl_entities_and_create.sql', 'supabase/verify/20261001_fl_entities_and_create_verify_summary.sql'],
] as const

/** A SQL string literal's value: '' is one quote. */
const unquote = (lit: string) => lit.slice(1, -1).replace(/''/g, "'")
const LIT = "'(?:[^']|'')*'"

/** The check's two patterns, as the script writes them: the literal-stripping one and the table one. */
function checkPatterns(summary: string): { strip: RegExp; replacement: string; table: RegExp } {
  const m = new RegExp(`regexp_matches\\(regexp_replace\\(def, (${LIT}), (${LIT}), 'g'\\), (${LIT}), 'gi'\\)`).exec(summary)
  if (!m) throw new Error('the check does not strip string literals before matching')
  return { strip: new RegExp(unquote(m[1]), 'g'), replacement: unquote(m[2]), table: new RegExp(unquote(m[3]), 'gi') }
}
/** Each function as the migration writes it (pg_get_functiondef returns the same text, dollar-quoted). */
const functions = (migration: string) => [...migration.matchAll(/create function public\.\w+\([\s\S]*?\$\$;/g)].map(m => m[0])
const count = (re: RegExp, text: string) => [...text.matchAll(re)].length

describe('the schema-qualified check, run on the functions it checks', () => {
  for (const [migration, summary] of PAIRS) {
    it(`${summary.split('/').pop()}: 0 unqualified in every function`, () => {
      const p = checkPatterns(read(summary))
      const fns = functions(read(migration))
      expect(fns.length).toBeGreaterThan(0)
      for (const f of fns) expect(count(p.table, f.replace(p.strip, p.replacement)), f.slice(0, 60)).toBe(0)
    })
  }

  it('without stripping string literals it reports the false positive seen on 1 Oct 2026', () => {
    const p = checkPatterns(read(PAIRS[2][1]))
    const create = functions(read(PAIRS[2][0])).find(f => f.includes('fl_create_report('))!
    expect(count(p.table, create)).toBe(1)
    expect(create).toContain("'fl_create_report: a Canada report starts from s211_reports'")
  })

  it('and it still catches a real unqualified table', () => {
    const p = checkPatterns(read(PAIRS[2][1]))
    const bad = "create function public.f() returns void language plpgsql as $$ begin insert into fl_reports (id) values (null); raise exception 'from public.x'; end; $$;"
    expect(count(p.table, bad.replace(p.strip, p.replacement))).toBe(1)
  })
})
