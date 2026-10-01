import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// supabase/migrations/20261001_fl_save_canada_section.sql and its two verification scripts, read as text.
// They cannot run here (no database); the migration's pre-flight and post-flight run in production.

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const MIGRATION = 'supabase/migrations/20261001_fl_save_canada_section.sql'
const SUMMARY = 'supabase/verify/20261001_fl_save_canada_section_verify_summary.sql'
const ATOMIC = 'supabase/verify/20261001_fl_save_canada_section_verify_atomic.sql'
const noComments = (s: string) => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const noStrings = (s: string) => noComments(s).replace(/'(?:[^']|'')*'/g, "''")
const sql = read(MIGRATION)
const code = noComments(sql)
const body = /create function public\.fl_save_canada_section\([\s\S]*?\$\$([\s\S]*?)\$\$;/.exec(code)![1]

describe('the fl_save_canada_section migration', () => {
  it('records that it ran and was verified, and is one transaction', () => {
    expect(sql).toMatch(/^-- Run in production on 2026-10-01 \(verified\)\./m)
    expect(sql).not.toMatch(/NOT RUN/)
    expect(code.match(/^begin;$/gm)).toHaveLength(1)
    expect(code.match(/^commit;$/gm)).toHaveLength(1)
  })

  it('is security invoker, volatile, plpgsql, with an empty search_path', () => {
    expect(code).toMatch(/returns jsonb\s+language plpgsql\s+security invoker\s+volatile\s+set search_path = ''\s+as \$\$/)
    expect(code).not.toMatch(/security definer/i)
  })

  it('names every table schema-qualified', () => {
    const unqualified = [...noStrings(body).matchAll(/\b(?:from|into|update|join)\s+(?!public\.)((?:fl_|s211_)\w+)/gi)].map(m => m[1])
    expect(unqualified).toEqual([])
    for (const t of ['public.fl_answers', 'public.s211_report_sections', 'public.s211_reports']) expect(body).toContain(t)
  })

  it('writes the answers, then the removals, then the section, then the report, in one body', () => {
    const at = (s: string) => body.indexOf(s)
    expect(at('insert into public.fl_answers')).toBeGreaterThan(0)
    expect(at('delete from public.fl_answers')).toBeGreaterThan(at('insert into public.fl_answers'))
    expect(at('insert into public.s211_report_sections')).toBeGreaterThan(at('delete from public.fl_answers'))
    expect(at('update public.s211_reports')).toBeGreaterThan(at('insert into public.s211_report_sections'))
    // No exception handler: an error must abort the whole call, not be swallowed inside it.
    expect(body).not.toMatch(/\bexception\s+when\b/i)
  })

  it('grants execute to authenticated only, after revoking from public, anon and service_role', () => {
    const sig = 'public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[])'
    const at = (s: string) => code.indexOf(s)
    for (const role of ['public', 'anon', 'service_role']) expect(at(`revoke all on function ${sig} from ${role};`), role).toBeGreaterThan(0)
    expect(at(`grant execute on function ${sig} to authenticated;`)).toBeGreaterThan(at(`revoke all on function ${sig} from service_role;`))
    expect(code.match(/\bgrant\b/gi)).toHaveLength(1)
  })

  it('changes no policy, and checks that it did not', () => {
    expect(code).not.toMatch(/(create|drop|alter)\s+policy/i)
    expect(code).toContain('create temporary table _fl_save_policies_before on commit drop')
    expect(code).toContain("raise exception 'Post-flight: policies changed: %'")
  })

  it('takes the parameters the route sends, by the same names', () => {
    const params = [.../create function public\.fl_save_canada_section\(([\s\S]*?)\)\s*returns/.exec(code)![1].matchAll(/(p_\w+)\s+\w+/g)].map(m => m[1])
    const store = read('lib/forcedLabour/canadaStore.ts')
    const sent = [.../rpc\('fl_save_canada_section', \{([\s\S]*?)\}\)/.exec(store)![1].matchAll(/(p_\w+):/g)].map(m => m[1])
    expect(sent.sort()).toEqual([...params].sort())
    expect(params).toEqual(['p_report_id', 'p_section_key', 'p_content', 'p_status', 'p_answers', 'p_remove'])
  })
})

describe('its verification scripts', () => {
  it('the summary is one read-only statement, checks 01 to 07', () => {
    const s = noStrings(read(SUMMARY))
    expect(s.match(/;/g)).toHaveLength(1)
    expect(s).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|begin|commit|rollback)\b/i)
    expect([...read(SUMMARY).matchAll(/select '(\d\d) /g)].map(m => m[1])).toEqual(['01', '02', '03', '04', '05', '06', '07'])
  })

  it('the atomic script rolls back every call it makes, and ends with the results', () => {
    const a = read(ATOMIC)
    // three calls, each followed in the same block by an error raised on purpose
    expect(a.match(/perform public\.fl_save_canada_section\(/g)).toHaveLength(3)
    expect(a.match(/raise exception '[^']*' using errcode = 'P0001';/g)).toHaveLength(3)
    // it writes to nothing but its own temporary table
    const writes = [...noStrings(a).matchAll(/\b(insert into|update|delete from)\s+([\w.]+)/gi)].map(m => m[2])
    expect([...new Set(writes)]).toEqual(['_fl_atomic'])
    expect(noComments(a).trim().split(';').filter(x => x.trim()).at(-1)!.trim()).toMatch(/^select check_name, expected, actual, pass from _fl_atomic/)
  })
})

describe('types pglast cannot see', () => {
  const CHAR_COLUMNS = 'provolatile|prokind|proparallel|relkind|relpersistence|relreplident|polcmd|contype|confupdtype|confdeltype|confmatchtype|typtype|typcategory|attidentity|attgenerated'
  it('no "char" catalog column is concatenated without ::text, and every file carries the note', () => {
    for (const f of [MIGRATION, SUMMARY, ATOMIC]) {
      const b = noComments(read(f))
      expect(b.match(new RegExp(`\\|\\|\\s*(?:\\w+\\.)?(${CHAR_COLUMNS})\\b(?!::text)`)), f).toBeNull()
      expect(b.match(new RegExp(`(?:\\w+\\.)?(${CHAR_COLUMNS})\\s*\\|\\|`)), f).toBeNull()
      expect(read(f), f).toContain('TYPE-CHECKED ONLY BY RUNNING IN SUPABASE')
    }
  })
})
