import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { FIELD_REGISTRY } from './fieldRegistry'
import { COUNTRIES } from './countries'

// supabase/migrations/20261001_fl_shared_core.sql, read as text. It cannot be run here (no database); the
// file's own pre-flight and post-flight run in production. These pin what a reviewer would check by eye.

const ROOT = process.cwd()
const sql = readFileSync(join(ROOT, 'supabase/migrations/20261001_fl_shared_core.sql'), 'utf8')
const code = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const verify = readFileSync(join(ROOT, 'supabase/verify/20261001_fl_shared_core_verify.sql'), 'utf8')
const TABLES = ['fl_reports', 'fl_report_entities', 'fl_report_countries', 'fl_answers']

describe('the shared-core migration', () => {
  it('records that it ran and was verified, and is one transaction', () => {
    expect(sql).toMatch(/^-- Run in production on 2026-10-01 \(verified\)\./m)
    expect(sql).not.toMatch(/NOT RUN/)
    expect(code.match(/^begin;$/gm)).toHaveLength(1)
    expect(code.match(/^commit;$/gm)).toHaveLength(1)
  })

  it('never touches an S-211 policy', () => {
    expect(code).not.toMatch(/(create|drop|alter)\s+policy\s+s211_/i)
    expect(code).not.toMatch(/on\s+public\.s211_(reports|report_sections)\s+(for|using)/i)
  })

  it('creates four policies per new table, one per command', () => {
    for (const t of TABLES) {
      const cmds = [...code.matchAll(new RegExp(`create policy ${t}_(\\w+) on public\\.${t}\\s+for (\\w+)`, 'g'))].map(m => `${m[1]}:${m[2]}`)
      expect(cmds.sort(), t).toEqual(['delete:delete', 'insert:insert', 'select:select', 'update:update'])
    }
  })

  it('wraps every auth.uid() as (select auth.uid())', () => {
    // String literals (the post-flight's own error message) are not SQL that runs as a predicate.
    const bare = code.replace(/'(?:[^']|'')*'/g, "''").replace(/\(select auth\.uid\(\)\)/g, '').match(/auth\.uid\(\)/g)
    expect(bare).toBeNull()
  })

  it('revokes from public, anon and authenticated before granting', () => {
    const at = (s: string) => code.indexOf(s)
    const list = TABLES.map(t => `public.${t}`).join(', ')
    for (const role of ['public', 'anon', 'authenticated']) expect(at(`revoke all on table ${list} from ${role};`), role).toBeGreaterThan(0)
    const grant = at(`grant select, insert, update, delete on table ${list} to authenticated;`)
    expect(grant).toBeGreaterThan(at(`revoke all on table ${list} from authenticated;`))
    expect(code).not.toMatch(/grant [^;]* to anon/)
  })

  it('makes s211_can_read/write wrappers for Canada, keeping SECURITY DEFINER and the empty search_path', () => {
    for (const [fn, inner] of [['s211_can_read', 'fl_can_read'], ['s211_can_write', 'fl_can_write']]) {
      const body = new RegExp(`create or replace function public\\.${fn}\\(\\)\\s+returns boolean\\s+language sql\\s+security definer\\s+stable\\s+set search_path = ''\\s+as \\$\\$\\s+select public\\.${inner}\\('canada'\\);\\s+\\$\\$;`)
      expect(code, fn).toMatch(body)
    }
  })

  it('fl_can_read/write keep the S-211 logic: s211_access or the entitlement, write needing a current term', () => {
    const fn = (name: string) => new RegExp(`create function public\\.${name}\\(p_country text\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`).exec(code)![1]
    for (const name of ['fl_can_read', 'fl_can_write']) {
      const body = fn(name)
      expect(body).toContain("p_country is null or p_country = any (array['canada', 'uk', 'australia'])")
      expect(body).toContain('public.s211_access a where a.user_id = (select auth.uid())')
      expect(body).toContain("e.module_key = 'forced-labour'")
    }
    expect(fn('fl_can_read')).not.toContain('term_end')
    expect(fn('fl_can_write')).toContain('e.term_end > now()')
  })

  it('knows the same countries as the module', () => {
    const set = (s: string) => [...s.matchAll(/'(\w+)'/g)].map(m => m[1]).sort()
    const expected = COUNTRIES.map(c => c.key).sort()
    expect(set(/country in \(([^)]*)\)/.exec(code)![1])).toEqual(expected)
    expect(set(/reporting_in <@ array\[([^\]]*)\]/.exec(code)![1])).toEqual(expected)
  })

  it('accepts every field registry key in fl_answers.field_key', () => {
    const pattern = new RegExp(/field_key ~ '([^']+)'/.exec(code)![1])
    expect(FIELD_REGISTRY.map(f => f.key).filter(k => !pattern.test(k))).toEqual([])
  })

  it('ties the Canada report to a parent with the same owner', () => {
    expect(code).toMatch(/foreign key \(fl_report_id, user_id\) references public\.fl_reports \(id, user_id\)/)
    expect(code).toMatch(/constraint fl_reports_id_user_key unique \(id, user_id\)/)
  })

  it('has pre-flight and post-flight checks, including the per-table policy counts', () => {
    expect(code).toContain('create temporary table _fl_policies_before')
    expect(code).toContain('create temporary table _fl_policy_counts_before')
    expect(code).toContain("raise exception 'Post-flight: S-211 policies changed: %'")
    expect(code).toContain("raise exception 'Post-flight: policy counts changed on existing tables: %'")
  })

  it('ships verification queries that run as written, with nothing commented out to run', () => {
    expect(verify).not.toMatch(/^--\s*(select|begin|set|rollback)\b/im)
    expect(verify.match(/^-- expect /gm)!.length).toBeGreaterThanOrEqual(12)
    expect(verify).not.toMatch(/^\s*(insert|update|delete|drop|alter|create)\b/im)
  })
})

describe('the one-query verification scripts', () => {
  const read = (f: string) => readFileSync(join(ROOT, 'supabase/verify', f), 'utf8')
  const stripped = (s: string) => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n').replace(/'(?:[^']|'')*'/g, "''")
  const summary = read('20261001_fl_shared_core_verify_summary.sql')
  const asAccount = read('20261001_fl_shared_core_verify_as_account.sql')

  it('are each one read-only statement, returning check_name, expected, actual, pass', () => {
    for (const f of [summary, asAccount]) {
      const body = stripped(f)
      expect(body.match(/;/g)).toHaveLength(1)
      expect(body.trim()).toMatch(/^with\b/i)
      expect(body).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|begin|commit|rollback)\b/i)
      expect(body).toMatch(/select check_name, expected, coalesce\(actual, ''\) as actual, coalesce\(actual = expected, false\) as pass/)
    }
  })

  it('cover checks 01 to 11, and 01 to 08 as the account', () => {
    const names = (f: string) => [...f.matchAll(/select '(\d\d) /g)].map(m => m[1])
    expect([...new Set(names(summary))]).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'])
    expect([...new Set(names(asAccount))]).toEqual(['01', '02', '03', '04', '05', '06', '07', '08'])
  })

  it('fingerprint the eight S-211 policies as they stand in the 1 Oct dump', () => {
    const dump = readFileSync(join(ROOT, 'db/dumps/schema_public_20261001_1057.sql'), 'utf8')
    const grab = (rest: string, kw: string) => {
      const i = rest.indexOf(`${kw} (`)
      if (i < 0) return ''
      let k = i + kw.length + 2, depth = 1
      const start = k
      while (depth) { depth += rest[k] === '(' ? 1 : rest[k] === ')' ? -1 : 0; k++ }
      // Without "public.": pg_get_expr qualifies by the current search_path, which is empty under pg_dump and
      // includes public in the SQL editor. The summary strips it on its side too.
      return rest.slice(start, k - 1).split('public.').join('')
    }
    const rows = [...dump.matchAll(/CREATE POLICY (\S+) ON public\.(s211_reports|s211_report_sections) FOR (\w+) TO (\w+)([\s\S]*?);\n\n/g)]
      .map(m => ({ key: `${m[2]}\u0000${m[1]}`, line: `${m[1]}|${m[3]}|{${m[4]}}|${grab(m[5], ' USING')}|${grab(m[5], ' WITH CHECK')}` }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    expect(rows).toHaveLength(8)
    const md5 = createHash('md5').update(rows.map(r => r.line).join('\n')).digest('hex')
    expect(md5).toBe('e32cffdfb583aec735919346b37b804f')
    expect(summary).toContain(`'${md5}'`)
    // and the summary removes the prefix on the database side, in both expressions
    expect(summary).toContain("replace(coalesce(qual, ''), 'public.', '')")
    expect(summary).toContain("replace(coalesce(with_check, ''), 'public.', '')")
  })
})

describe('types pglast cannot see', () => {
  // pglast checks grammar only. A "char" catalog column concatenated without a cast is ambiguous
  // (42725: operator is not unique: text || "char"), which Supabase refused in verify_summary.sql on
  // 1 Oct 2026 after the parse had passed. This is a text check for that one known class, no more.
  const CHAR_COLUMNS = 'provolatile|prokind|proparallel|relkind|relpersistence|relreplident|polcmd|contype|confupdtype|confdeltype|confmatchtype|typtype|typcategory|attidentity|attgenerated'
  const files = ['supabase/migrations/20261001_fl_shared_core.sql', 'supabase/verify/20261001_fl_shared_core_verify.sql',
    'supabase/verify/20261001_fl_shared_core_verify_summary.sql', 'supabase/verify/20261001_fl_shared_core_verify_as_account.sql']

  it('no "char" catalog column is concatenated without ::text', () => {
    const bad = files.flatMap(f => {
      const body = readFileSync(join(ROOT, f), 'utf8').split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
      const after = new RegExp(`\\|\\|\\s*(?:\\w+\\.)?(${CHAR_COLUMNS})\\b(?!::text)`, 'g')
      const before = new RegExp(`(?:\\w+\\.)?(${CHAR_COLUMNS})\\s*\\|\\|`, 'g')
      return [...body.matchAll(after), ...body.matchAll(before)].map(m => `${f}: ${m[0].trim()}`)
    })
    expect(bad).toEqual([])
  })

  it('each file says it was type-checked only by running in Supabase', () => {
    for (const f of files) expect(readFileSync(join(ROOT, f), 'utf8'), f).toContain('TYPE-CHECKED ONLY BY RUNNING IN SUPABASE')
  })
})

