// The S-211 access gate migration (supabase/migrations/20260930_s211_access_gate.sql), read as text.
// These check what the file says; the verification queries at its foot check what the database holds.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raw = readFileSync(join(process.cwd(), 'supabase/migrations/20260930_s211_access_gate.sql'), 'utf8')
// SQL with the -- comments removed, so a verification query or the commented-out insert never counts.
const sql = raw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const statements = sql.split(/;\s*\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
const policies = statements.filter(s => /^create policy /i.test(s))
const tail = (s: string, from: RegExp) => { const i = s.search(from); return i < 0 ? '' : s.slice(i) }

describe('the S-211 access gate migration', () => {
  it('recreates exactly the two policies, each dropped by name first', () => {
    expect(policies.map(p => p.split(' ')[2])).toEqual(['s211_reports_owner', 's211_report_sections_owner'])
    for (const name of ['s211_reports_owner', 's211_report_sections_owner']) {
      const drop = statements.findIndex(s => s.startsWith(`drop policy ${name} `))
      const create = statements.findIndex(s => s.startsWith(`create policy ${name} `))
      expect(drop, name).toBeGreaterThanOrEqual(0)
      expect(drop, name).toBeLessThan(create)
    }
    expect(statements.some(s => /^alter policy/i.test(s))).toBe(false)
  })

  it('every policy calls s211_has_access() in USING and in WITH CHECK, wrapped in a subselect', () => {
    for (const p of policies) {
      const using = p.slice(p.search(/ using /i), p.search(/ with check /i))
      const check = tail(p, / with check /i)
      for (const expr of [using, check]) {
        expect(expr, p.slice(0, 60)).toContain('(select public.s211_has_access())')
        expect(expr.replace(/\(select public\.s211_has_access\(\)\)/g, '')).not.toMatch(/s211_has_access\(\)/)
      }
      expect(p).toMatch(/for all to authenticated/)
    }
  })

  it('keeps the owner conditions, with (select auth.uid()) and never a bare auth.uid()', () => {
    const [reports, sections] = policies
    expect(reports.match(/\(select auth\.uid\(\)\) = user_id/g)).toHaveLength(2)
    expect(sections.match(/r\.user_id = \(select auth\.uid\(\)\)/g)).toHaveLength(2)
    for (const s of statements) expect(s.replace(/\(select auth\.uid\(\)\)/g, '')).not.toMatch(/auth\.uid\(\)/)
  })

  it('s211_access: RLS on, no policies, and no grants to anon, authenticated or public', () => {
    expect(statements).toContain('alter table public.s211_access enable row level security')
    expect(policies.some(p => / on public\.s211_access /.test(p))).toBe(false)
    const grants = statements.filter(s => /^grant .* on table public\.s211_access /i.test(s))
    expect(grants).toEqual(['grant all on table public.s211_access to service_role'])
    for (const role of ['public', 'anon', 'authenticated']) expect(statements).toContain(`revoke all on table public.s211_access from ${role}`)
  })

  it('the function is SECURITY DEFINER, STABLE, with an empty search_path, and names everything by schema', () => {
    const fn = statements.find(s => s.startsWith('create or replace function public.s211_has_access()'))!
    expect(fn).toBeDefined()
    expect(fn).toMatch(/returns boolean/)
    expect(fn).toMatch(/ security definer /)
    expect(fn).toMatch(/ stable /)
    expect(fn).toMatch(/ set search_path = '' /)
    expect(fn).not.toMatch(/security invoker/)
    expect(fn).toContain('from public.s211_access a')
    expect(fn).toContain('(select auth.uid())')
  })

  it('execute is revoked from public and anon and granted to authenticated only', () => {
    const fnGrants = statements.filter(s => /^(grant|revoke) /.test(s) && / on function public\.s211_has_access\(\)/.test(s))
    expect(fnGrants).toEqual([
      'revoke all on function public.s211_has_access() from public',
      'revoke all on function public.s211_has_access() from anon',
      'grant execute on function public.s211_has_access() to authenticated',
    ])
  })

  it('runs in one transaction with a pre-flight and a post-flight check, and the access insert is left commented out', () => {
    expect(statements[0]).toBe('begin')
    expect(statements.indexOf('commit')).toBeGreaterThan(statements.findIndex(s => s.startsWith('create policy s211_report_sections_owner')))
    expect(sql).toMatch(/expected exactly s211_reports_owner and s211_report_sections_owner/)
    expect(sql).toMatch(/policies without the access check/)
    expect(sql).not.toMatch(/insert into public\.s211_access/i)
    expect(raw).toContain("-- insert into public.s211_access (user_id, note) values ('81a8962f-3e5c-40a3-8145-1ac01426df5c', 'Lisa, preview');")
  })
})
