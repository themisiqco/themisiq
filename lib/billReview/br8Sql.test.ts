// lib/billReview/br8Sql.test.ts
//
// BR8: 20261017 (the four new staff actions and the reading switch) and its verify, read as text (pglast parses them
// offline, reported with the patch).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const code = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const M = read('supabase/migrations/20261017_staff_actions_and_reading_switch.sql')
const V = read('supabase/verify/20261017_br8_verify.sql')
const m = code(M)

describe('BR8 SQL: 20261017', () => {
  it('house format: ASCII, status line, pre-check naming the constraint, verify reference; ends with the schema reload', () => {
    for (const s of [M, V]) expect([...s].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    expect(M.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for BR8; Lisa runs it in the Supabase SQL editor and records the run here.')
    expect(M).toContain('-- PROCEED if it returns exactly one row named staff_access_log_action_check')
    expect(M).toContain("to_regprocedure('public.staff_set_bill_review_reading(uuid, text, uuid)')")
    expect(m.trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
  })
  it('the action constraint, dropped and added again by name, with the six old actions and the four new', () => {
    expect(m).toContain('alter table public.staff_access_log drop constraint if exists staff_access_log_action_check;')
    const add = m.slice(m.indexOf('add constraint staff_access_log_action_check'), m.indexOf(';', m.indexOf('add constraint staff_access_log_action_check')))
    for (const a of ['view_queue', 'view_document', 'save_reading', 'view_ai_reading', 'record_spot_check', 'view_access_log', 'mark_unreadable', 'set_reading', 'view_reading_switch', 'view_spot_checks'])
      expect(add, a).toContain(`'${a}'`)
  })
  it('the switch: a lead only, the lead as the transaction’s user, the stamp trigger does the rest; service_role only', () => {
    expect(m).toContain("where s.user_id = p_staff_user_id and s.role = 'bill_review_lead' and s.revoked_at is null) then")
    expect(m).toContain("perform pg_catalog.set_config('request.jwt.claims',\n    pg_catalog.json_build_object('sub', p_staff_user_id, 'role', 'authenticated')::text, true);")
    expect(m).toContain('update public.ghg_inventories set bill_review_reading = p_reading where id = p_inventory_id')
    expect(m).toMatch(/security definer\s+set search_path = ''/)
    expect(m).toContain('revoke all on function public.staff_set_bill_review_reading(uuid, text, uuid) from public, anon, authenticated;')
    expect(m).toContain('grant execute on function public.staff_set_bill_review_reading(uuid, text, uuid) to service_role;')
  })
  it('the TypeScript action list matches the constraint', () => {
    const ts = read('lib/staff/access.ts')
    for (const a of ['mark_unreadable', 'set_reading', 'view_reading_switch', 'view_spot_checks']) expect(ts, a).toContain(`'${a}'`)
  })
  it('the verify names the constraint and the function and proves the rule in a rolled-back block', () => {
    const v = code(V)
    expect(v).toContain("conname = 'staff_access_log_action_check'")
    expect(v).toContain("to_regprocedure('public.staff_set_bill_review_reading(uuid, text, uuid)')")
    expect(v).toContain("'non-lead refused, lead allowed, set_by the lead, set_reading log row accepted'")
    expect(v).toContain("raise exception 'br8 verify: roll back' using errcode = 'P0001';")
  })
})
