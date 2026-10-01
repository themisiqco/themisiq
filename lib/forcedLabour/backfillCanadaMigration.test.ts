import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// supabase/migrations/20261001_fl_backfill_canada.sql and its summary verification, read as text. They
// cannot run here (no database); the migration's own pre-flight and post-flight run in production.

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const MIGRATION = 'supabase/migrations/20261001_fl_backfill_canada.sql'
const VERIFY = 'supabase/verify/20261001_fl_backfill_canada_verify_summary.sql'
const sql = read(MIGRATION)
const code = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const noStrings = (s: string) => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n').replace(/'(?:[^']|'')*'/g, "''")
const verify = read(VERIFY)

describe('the Canada backfill', () => {
  it('records that it ran and was verified, follows the shared core, and is one transaction', () => {
    expect(sql).toMatch(/^-- Run in production on 2026-10-01 \(verified\)\./m)
    expect(sql).not.toMatch(/NOT RUN/)
    expect(sql).toMatch(/RUN AFTER 20261001_fl_shared_core\.sql/)
    expect(code.match(/^begin;$/gm)).toHaveLength(1)
    expect(code.match(/^commit;$/gm)).toHaveLength(1)
  })

  it('writes only parents, canada rows and the link, and changes no schema', () => {
    const body = noStrings(code)
    const inserts = [...body.matchAll(/insert into (public\.\w+)/g)].map(m => m[1])
    expect(inserts.sort()).toEqual(['public.fl_report_countries', 'public.fl_reports'])
    const updates = [...body.matchAll(/update (public\.\w+)/g)].map(m => m[1])
    expect(updates).toEqual(['public.s211_reports'])
    expect(body).toMatch(/update public\.s211_reports r\s+set fl_report_id = m\.fl_id\s+from _fl_bf_map m\s+where r\.id = m\.s211_id and r\.fl_report_id is null;/)
    expect(body).not.toMatch(/\bdelete\s+from\b/i)
    expect(body).not.toMatch(/\b(alter|grant|revoke)\b/i)
    // `on commit drop` on the temporary snapshots is the only drop allowed
    expect(body).not.toMatch(/\bdrop\s+(table|policy|function|index|column|constraint|trigger|view)\b/i)
    expect(body).not.toMatch(/create\s+(table|policy|function|index)\s+public\./i)
  })

  it('does not touch s211_reports.updated_at, and does not compute a period start', () => {
    const update = /update public\.s211_reports[\s\S]*?;/.exec(code)![0]
    expect(update).not.toContain('updated_at')
    expect(code).toMatch(/select m\.fl_id, r\.user_id, r\.company_name, null, r\.financial_year_end, r\.created_at, now\(\)/)
  })

  it('only fills reports that have no parent, so a re-run changes nothing', () => {
    expect(code).toMatch(/from public\.s211_reports r\s+where r\.fl_report_id is null;/)
  })

  it('refuses a blank company_name rather than inventing one', () => {
    expect(code).toMatch(/btrim\(company_name\) = ''/)
    expect(code).toContain('raise exception \'Pre-flight: % unlinked S-211 report(s) have a blank company_name')
  })

  it('checks counts before and after, and fingerprints the S-211 rows it must not change', () => {
    for (const s of ['_fl_bf_counts', '_fl_bf_reports', '_fl_bf_sections']) expect(code).toContain(`create temporary table ${s} on commit drop`)
    expect(code).toContain("md5((to_jsonb(r) - 'fl_report_id')::text)")
    for (const m of ['still have no parent', 'S-211 report count changed', 'fl_reports % rows, expected', 'canada rows %, expected',
      'backfilled values wrong', 'changed beyond fl_report_id', 's211_report_sections row(s) changed']) {
      expect(code, m).toContain(m)
    }
  })
})

describe('its summary verification', () => {
  it('is one read-only statement, returning check_name, expected, actual, pass', () => {
    const body = noStrings(verify)
    expect(body.match(/;/g)).toHaveLength(1)
    expect(body.trim()).toMatch(/^with\b/i)
    expect(body).not.toMatch(/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|begin|commit|rollback|set_config)\b/i)
    expect(body).toMatch(/select check_name, expected, coalesce\(actual, ''\) as actual, coalesce\(actual = expected, false\) as pass/)
  })

  it('covers checks 01 to 12, the last being the S-211 policy fingerprint', () => {
    expect([...verify.matchAll(/select '(\d\d) /g)].map(m => m[1])).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])
    expect(verify).toContain("'e32cffdfb583aec735919346b37b804f'")
  })
})

describe('types pglast cannot see', () => {
  const CHAR_COLUMNS = 'provolatile|prokind|proparallel|relkind|relpersistence|relreplident|polcmd|contype|confupdtype|confdeltype|confmatchtype|typtype|typcategory|attidentity|attgenerated'
  it('no "char" catalog column is concatenated without ::text, and both files carry the note', () => {
    for (const f of [MIGRATION, VERIFY]) {
      const body = read(f).split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
      expect(body.match(new RegExp(`\\|\\|\\s*(?:\\w+\\.)?(${CHAR_COLUMNS})\\b(?!::text)`)), f).toBeNull()
      expect(body.match(new RegExp(`(?:\\w+\\.)?(${CHAR_COLUMNS})\\s*\\|\\|`)), f).toBeNull()
      expect(read(f), f).toContain('TYPE-CHECKED ONLY BY RUNNING IN SUPABASE')
    }
  })
})
