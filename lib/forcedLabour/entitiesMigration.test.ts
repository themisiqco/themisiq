import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// supabase/migrations/20261001_fl_entities_and_create.sql and its two verification scripts, read as text (Stage D1b).

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const MIGRATION = 'supabase/migrations/20261001_fl_entities_and_create.sql'
const SUMMARY = 'supabase/verify/20261001_fl_entities_and_create_verify_summary.sql'
const BEHAVIOUR = 'supabase/verify/20261001_fl_entities_and_create_verify_behaviour.sql'
const noComments = (s: string) => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const noStrings = (s: string) => noComments(s).replace(/'(?:[^']|'')*'/g, "''")
const sql = read(MIGRATION)
const code = noComments(sql)
const body = (fn: string) => new RegExp(`create function public\\.${fn}\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`).exec(code)![1]

describe('the entities-and-create migration', () => {
  it('records that it ran and was verified, and is one transaction', () => {
    expect(sql).toMatch(/^-- Run in production on 2026-10-01 \(verified\)\./m)
    expect(sql).not.toMatch(/NOT RUN/)
    expect(code.match(/^begin;$/gm)).toHaveLength(1)
    expect(code.match(/^commit;$/gm)).toHaveLength(1)
  })
  it('both functions: security invoker, volatile, plpgsql, empty search_path, no exception handler, qualified', () => {
    for (const fn of ['fl_set_country_entities', 'fl_create_report']) {
      expect(code).toMatch(new RegExp(`create function public\\.${fn}\\([\\s\\S]*?\\)\\s+returns \\w+\\s+language plpgsql\\s+security invoker\\s+volatile\\s+set search_path = ''`))
      expect(body(fn)).not.toMatch(/\bexception\s+when\b/i)
      expect([...noStrings(body(fn)).matchAll(/\b(?:from|into|update|join)\s+(?!public\.)((?:fl_|s211_)\w+)/gi)].map(m => m[1])).toEqual([])
    }
    expect(code).not.toMatch(/security definer/i)
  })
  it('refuses Canada, blank and repeated names, and a country not on the report, before writing', () => {
    const b = body('fl_set_country_entities')
    const first = b.indexOf('update public.fl_report_entities')
    for (const s of ["p_country = 'canada'", "v_giving = ''", 'having count(*) > 1', 'not exists (select 1 from public.fl_report_countries']) {
      expect(b.indexOf(s), s).toBeGreaterThan(0)
      expect(b.indexOf(s), s).toBeLessThan(first)
    }
  })
  it('creates a report owned by the caller, with its first country, and not Canada', () => {
    const b = body('fl_create_report')
    expect(b).toContain('insert into public.fl_reports (user_id, organization_name) values ((select auth.uid())')
    expect(b.indexOf('insert into public.fl_report_countries')).toBeGreaterThan(b.indexOf('insert into public.fl_reports'))
    expect(b.indexOf("p_country = 'canada'")).toBeLessThan(b.indexOf('insert into public.fl_reports'))
  })
  it('giving_in is checked against the countries and the entity’s own reporting_in', () => {
    expect(code).toContain("check (giving_in <@ array['canada', 'uk', 'australia']::text[] and giving_in <@ reporting_in)")
  })
  it('grants execute to authenticated only, and changes no policy', () => {
    for (const sig of ['public.fl_set_country_entities(uuid, text, text, text[])', 'public.fl_create_report(text, text)']) {
      for (const role of ['public', 'anon', 'service_role']) expect(code, `${sig} ${role}`).toContain(`revoke all on function ${sig} from ${role};`)
      expect(code).toContain(`grant execute on function ${sig} to authenticated;`)
    }
    expect(code.match(/\bgrant\b/gi)).toHaveLength(2)
    expect(code).not.toMatch(/(create|drop|alter)\s+policy/i)
    expect(code).toContain("raise exception 'Post-flight: policies changed: %'")
  })
})

describe('its verification scripts', () => {
  it('the summary is one read-only statement, checks 01 to 08', () => {
    const s = noStrings(read(SUMMARY))
    expect(s.match(/;/g)).toHaveLength(1)
    expect(s).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|begin|commit|rollback)\b/i)
    expect([...read(SUMMARY).matchAll(/select '(\d\d) /g)].map(m => m[1])).toEqual(['01', '02', '03', '04', '05', '06', '07', '08'])
  })
  it('the behaviour script rolls back every successful call, and writes only its own table and the test uk row', () => {
    const b = read(BEHAVIOUR)
    expect(b.match(/raise exception 'roll back' using errcode = 'P0001';/g)).toHaveLength(2)
    expect(b.match(/raise exception 'unexpected success' using errcode = 'P0001';/g)).toHaveLength(7)
    const writes = [...noStrings(b).matchAll(/\b(insert into|update|delete from)\s+([\w.]+)/gi)].map(m => m[2])
    expect([...new Set(writes)].sort()).toEqual(['_fl_ent_behaviour', 'public.fl_report_countries'])
  })
  it('report the number of rows they return, as stated in their headers', () => {
    // A row is an insert of a check name ('00 ...', 'A1 ...'); the summary has one select per check.
    const names = [...read(BEHAVIOUR).matchAll(/\('([0-9A-Z]\d) [^']*'/g)].map(m => m[1])
    expect(names).toEqual(['00', '00', 'A1', 'A2', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4', 'E1', 'E2'])   // '00' twice: found or not found
    expect(new Set(names).size).toBe(13)
    expect(read(BEHAVIOUR)).toContain('13 rows, every one pass = true')
    expect([...read(SUMMARY).matchAll(/select '(\d\d) /g)]).toHaveLength(8)
  })
  it('no "char" column concatenated without ::text, and every file carries the note', () => {
    const CHAR = 'provolatile|prokind|proparallel|relkind|relpersistence|relreplident|polcmd|contype|typtype|attidentity|attgenerated'
    for (const f of [MIGRATION, SUMMARY, BEHAVIOUR]) {
      const t = noComments(read(f))
      expect(t.match(new RegExp(`\\|\\|\\s*(?:\\w+\\.)?(${CHAR})\\b(?!::text)`)), f).toBeNull()
      expect(t.match(new RegExp(`(?:\\w+\\.)?(${CHAR})\\s*\\|\\|`)), f).toBeNull()
      expect(read(f), f).toContain('TYPE-CHECKED ONLY BY RUNNING IN SUPABASE')
    }
  })
})
