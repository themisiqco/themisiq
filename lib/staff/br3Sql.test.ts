// lib/staff/br3Sql.test.ts
//
// BR3: the migration, the verify script and the manual grant, read as text (no local Postgres; pglast parses them
// offline, reported with the patch). supabase/verify/20261012_br3_verify.sql proves the refusals fire in the database.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const code = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const MIG = read('supabase/migrations/20261012_staff_roles_and_access_log.sql')
const VERIFY = read('supabase/verify/20261012_br3_verify.sql')
const GRANT = read('supabase/manual/20261012_staff_initial_grant.sql')
const m = code(MIG)

describe('BR3 SQL: house format', () => {
  it('ASCII; status line, run order, pre-check naming each object, verify reference; ends with the schema reload', () => {
    for (const s of [MIG, VERIFY, GRANT]) expect([...s].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    expect(MIG.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for BR3; Lisa runs it in the Supabase SQL editor and records the run here.')
    expect(MIG).toContain('-- RUN ORDER: 1 of 1.')
    const pre = MIG.slice(MIG.indexOf('-- PRE-CHECK, run first:'), MIG.indexOf('-- VERIFY, after'))
    for (const o of ["to_regclass('public.staff_roles')", "to_regclass('public.staff_access_log')", "to_regprocedure('public.staff_roles_guard()')",
      "to_regprocedure('public.staff_access_log_append_only()')", "to_regprocedure('public.log_audit()')"]) expect(pre, o).toContain(o)
    expect(m.trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
    expect(MIG).toContain("-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema';")
  })
})

describe('BR3 SQL: staff_roles', () => {
  it('id key; one active row per user and role; revocation needs both who and when', () => {
    expect(m).toContain('id          uuid        primary key default gen_random_uuid(),')
    expect(m).toContain('on public.staff_roles (user_id, role) where revoked_at is null;')
    expect(m).toContain('check ((revoked_at is null) = (revoked_by is null))')
    expect(m).toContain("role        text        not null check (role in ('bill_reader', 'bill_review_lead')),")
  })
  it('never deleted; only one revocation, of revoked_by, with the server’s time; nothing else changes', () => {
    const fn = m.slice(m.indexOf('create or replace function public.staff_roles_guard()'), m.indexOf('$$;', m.indexOf('staff_roles_guard()')))
    expect(fn).toContain("if tg_op = 'DELETE' then\n    raise exception 'A staff role is revoked, never deleted.' using errcode = '42501';")
    expect(fn).toContain("if old.revoked_at is not null then\n    raise exception 'This staff role is already revoked. Grant it again as a new row.'")
    for (const c of ['new.id', 'new.user_id', 'new.role', 'new.granted_by', 'new.granted_at']) expect(fn, c).toContain(`${c} is distinct from old.`)
    expect(fn).toContain('new.revoked_at := now();')
    expect(fn).toContain('new.granted_at := now();')
    expect(m).toContain('before insert or update or delete on public.staff_roles')
  })
  it('log_audit() is attached, so every grant and revocation is in audit_log', () => {
    expect(m).toContain('create trigger audit_staff_roles\n  after insert or delete or update on public.staff_roles\n  for each row execute function public.log_audit();')
  })
})

describe('BR3 SQL: staff_access_log is append-only, three layers', () => {
  it('(a) service_role holds SELECT and INSERT only; nothing for anon or authenticated', () => {
    expect(m).toContain('revoke all on public.staff_roles, public.staff_access_log from public, anon, authenticated, service_role;')
    expect(m).toContain('grant select on public.staff_roles to service_role;')
    expect(m).toContain('grant select, insert on public.staff_access_log to service_role;')
    expect(m).not.toMatch(/grant[^;]*(update|delete|truncate)[^;]*staff_access_log/i)
    expect(m).not.toMatch(/to\s+(anon|authenticated)\b/i)
  })
  it('(b) a row trigger refuses update and delete, and stamps the time on insert; (c) a statement trigger refuses truncate', () => {
    const fn = m.slice(m.indexOf('create or replace function public.staff_access_log_append_only()'))
    expect(fn).toContain("if tg_op = 'INSERT' then\n    new.at := now();\n    return new;\n  end if;\n  raise exception 'The staff access log is append-only: % is refused.'")
    expect(m).toContain('before insert or update or delete on public.staff_access_log\n  for each row execute function public.staff_access_log_append_only();')
    expect(m).toContain('before truncate on public.staff_access_log\n  for each statement execute function public.staff_access_log_append_only();')
  })
  it('row level security on both, no policy; erasure is refused, not silent (ON DELETE RESTRICT)', () => {
    expect(m).toContain('alter table public.staff_roles enable row level security;')
    expect(m).toContain('alter table public.staff_access_log enable row level security;')
    expect(m).not.toMatch(/create policy/i)
    expect(m).not.toMatch(/on delete cascade/i)
    expect([...m.matchAll(/on delete restrict/g)]).toHaveLength(4)
  })
})

describe('BR3 SQL: the verify script', () => {
  const v = code(VERIFY)
  it('names each table, function and trigger, and proves anon and authenticated hold nothing, MAINTAIN included', () => {
    for (const o of ["to_regclass('public.staff_roles')", "to_regclass('public.staff_access_log')", "to_regprocedure('public.staff_roles_guard()')",
      "to_regprocedure('public.staff_access_log_append_only()')", 'audit_staff_roles', 'trg_staff_access_log_append_only', 'trg_staff_access_log_no_truncate',
      'trg_staff_roles_guard', "to_regclass('public.staff_roles_one_active')", "('MAINTAIN')"]) expect(v, o).toContain(o)
  })
  it('the refusals fire, inside blocks that roll back; the functions are temporary', () => {
    expect(v).toContain("'update refused, delete refused, truncate refused'")
    expect(v).toContain("'delete refused, change refused, revoke allowed, unrevoke refused, regrant allowed'")
    expect([...v.matchAll(/raise exception 'br3 verify: roll back' using errcode = 'P0001';/g)]).toHaveLength(2)
    expect([...v.matchAll(/create or replace function (\S+)\(/g)].map(x => x[1])).toEqual(['pg_temp.br3_log_refusals', 'pg_temp.br3_role_refusals'])
    expect(v.trim().endsWith('select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;')).toBe(true)
  })
})

describe('BR3: the manual grant', () => {
  it('kept out of supabase/migrations, holds no email, refuses unless exactly one user matches, and is a no-op re-run', () => {
    expect(GRANT).toContain("lower('<your sign-in email>')")
    expect(GRANT).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/)
    expect(GRANT).toContain("raise exception 'Expected exactly one user with that email, found %. Nothing was granted.', v_n;")
    expect(GRANT).toContain('on conflict (user_id, role) where revoked_at is null do nothing;')
    expect(GRANT).toContain("unnest(array['bill_reader', 'bill_review_lead'])")
  })
})
