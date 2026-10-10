// lib/billReview/br8bSql.test.ts
//
// BR8b: 20261018 (spot-checks) and its verify, read as text (pglast parses them offline, reported with the patch); and
// Q10 across the Bill Review tables: no staff id is a column a customer can read.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const code = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const M = read('supabase/migrations/20261018_bill_review_spot_checks.sql')
const V = read('supabase/verify/20261018_br8b_verify.sql')
const m = code(M)

describe('BR8b SQL: 20261018', () => {
  it('house format; pre-check names each object; ends with the schema reload', () => {
    for (const s of [M, V]) expect([...s].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    expect(M.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for BR8b; Lisa runs it in the Supabase SQL editor and records the run here.')
    for (const o of ["to_regclass('public.bill_review_spot_checks')", "to_regprocedure('public.bill_review_spot_checks_guard()')", "conname = 'staff_access_log_action_check'"]) expect(M, o).toContain(o)
    expect(m.trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
  })
  it('once per reading; a difference needs a note; the inventory cascades', () => {
    expect(m).toContain('on public.bill_review_spot_checks (inventory_id, source_doc_id, fuel_type, proposal_index);')
    expect(m).toContain("check (result <> 'disagrees' or (note is not null and pg_catalog.btrim(note) <> ''))")
    expect(m).toContain('inventory_id    uuid        not null references public.ghg_inventories(id) on delete cascade,')
  })
  it('append-only; the customer from the inventory; the server’s time; an active bill_reader only', () => {
    const g = m.slice(m.indexOf('create or replace function public.bill_review_spot_checks_guard()'), m.indexOf('$$;', m.indexOf('bill_review_spot_checks_guard()')))
    expect(g).toContain("if tg_op <> 'INSERT' then\n    raise exception 'A spot-check is never changed.'")
    expect(g).toContain('new.user_id := v_owner;\n  new.checked_at := now();')
    expect(g).toContain("where s.user_id = new.checked_by and s.role = 'bill_reader' and s.revoked_at is null) then")
    expect(m).toContain('grant select, insert on public.bill_review_spot_checks to service_role;')
    expect(m).not.toMatch(/grant[^;]*(update|delete)[^;]*bill_review_spot_checks/i)
    expect(m).not.toMatch(/before[^;]*delete[^;]*bill_review_spot_checks/i)
  })
  it('RLS: own rows, wrapped; the verify proves the rules in a rolled-back block', () => {
    expect(m).toContain('create policy bill_review_spot_checks_select_own on public.bill_review_spot_checks\n  for select to authenticated\n  using (user_id = (select auth.uid()));')
    expect(code(V)).toContain("'check allowed, customer the owner, same reading again refused, update refused, non-staff refused'")
    expect(code(V)).toContain("raise exception 'br8b verify: roll back' using errcode = 'P0001';")
  })
})

describe('Q10: no staff id is a column a customer can read, on any Bill Review table', () => {
  const grants: [string, string, string][] = [
    ['supabase/migrations/20261013_bill_review_queue.sql', 'bill_review_documents', 'read_by'],
    ['supabase/migrations/20261013_bill_review_queue.sql', 'bill_review_readings', 'read_by'],
    ['supabase/migrations/20261018_bill_review_spot_checks.sql', 'bill_review_spot_checks', 'checked_by'],
  ]
  for (const [file, table, staffCol] of grants) {
    it(`${table}: authenticated reads columns, never ${staffCol}`, () => {
      const g = [...code(read(file)).matchAll(new RegExp(`grant select \\(([^)]*)\\)\\s+on public\\.${table} to authenticated;`, 'g'))]
      expect(g).toHaveLength(1)
      expect(g[0][1]).not.toContain(staffCol)
      expect(code(read(file))).not.toMatch(new RegExp(`grant select on public\\.${table} to authenticated`))
    })
  }
})
