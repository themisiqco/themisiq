// lib/billReview/br7Sql.test.ts
//
// BR7: the outbox migration and its verify, read as text (pglast parses them offline, reported with the patch).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const code = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const M = read('supabase/migrations/20261016_bill_review_notices.sql')
const V = read('supabase/verify/20261016_br7_verify.sql')
const m = code(M), v = code(V)
const fn = (name: string) => m.slice(m.indexOf(`create or replace function public.${name}(`), m.indexOf('$$;', m.indexOf(`function public.${name}(`)))

describe('BR7 SQL: house format', () => {
  it('ASCII, status line, pre-check naming each object, verify reference; ends with the schema reload', () => {
    for (const s of [M, V]) expect([...s].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    expect(M.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for BR7; Lisa runs it in the Supabase SQL editor and records the run here.')
    const pre = M.slice(M.indexOf('-- PRE-CHECK, run first:'), M.indexOf('-- VERIFY, after'))
    for (const o of ["to_regclass('public.bill_review_notices')", "to_regclass('public.bill_review_notice_documents')", "to_regprocedure('public.bill_review_notices_guard()')",
      "to_regprocedure('public.bill_review_enqueue_ready(uuid)')", "to_regprocedure('public.bill_review_enqueue_overdue(date)')"]) expect(pre, o).toContain(o)
    expect(m.trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
  })
})

describe('BR7 SQL: once only', () => {
  it('a bill is in at most one email of each kind: the key is (document_id, kind)', () => {
    expect(m).toContain('  primary key (document_id, kind)\n);')
  })
  it('ready: none while a bill is still waiting on the saved inventory and not withdrawn; the bills read since the last one', () => {
    const f = fn('bill_review_enqueue_ready')
    expect(f).toContain("select i.user_id into v_user from public.ghg_inventories i where i.id = p_inventory_id for update;")
    expect(f).toContain("where d.inventory_id = p_inventory_id and d.status = 'waiting'")
    expect(f).toContain("'$[*].source_docs[*] ? (@.id == $id && !exists(@.withdrawn))'")
    expect(f).toContain("and d.status in ('read', 'unreadable')")
    expect(f).toContain("and not exists (select 1 from public.bill_review_notice_documents n where n.document_id = d.id and n.kind = 'ready');")
  })
  it('overdue: waiting, before the Toronto date passed in, on the saved inventory, not yet emailed; serialised', () => {
    const f = fn('bill_review_enqueue_overdue')
    expect(f).toContain("perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('bill_review_enqueue_overdue'));")
    expect(f).toContain("where d.status = 'waiting' and d.expected_by < p_today")
    expect(f).toContain("and not exists (select 1 from public.bill_review_notice_documents n where n.document_id = d.id and n.kind = 'overdue')")
  })
})

describe('BR7 SQL: each attempt recorded; sent is final; up to 5', () => {
  const g = fn('bill_review_notices_guard')
  it('pending on insert; each update is one attempt, sent or failed with its error; sent never changes again', () => {
    expect(g).toContain("new.status := 'pending';\n    new.attempts := 0;")
    expect(g).toContain("if old.status = 'sent' then")
    expect(g).toContain("if new.attempts is distinct from old.attempts + 1 or new.status not in ('sent', 'failed') then")
    expect(g).toContain("if new.status = 'failed' and new.last_error is null then")
    expect(m).toContain('attempts         integer     not null default 0 check (attempts between 0 and 5),')
  })
})

describe('BR7 SQL: RLS and grants', () => {
  it('RLS on, no policy; service_role reads and records attempts; no role inserts or deletes; functions for service_role only', () => {
    expect(m).toContain('alter table public.bill_review_notices enable row level security;')
    expect(m).toContain('alter table public.bill_review_notice_documents enable row level security;')
    expect(m).not.toMatch(/create policy/i)
    expect(m).toContain('revoke all on public.bill_review_notices, public.bill_review_notice_documents from public, anon, authenticated, service_role;')
    expect(m).toContain('grant select, update on public.bill_review_notices to service_role;')
    expect(m).toContain('grant select on public.bill_review_notice_documents to service_role;')
    expect(m).not.toMatch(/grant[^;]*(insert|delete)[^;]*bill_review_notice/i)
    for (const f of ['bill_review_enqueue_ready(uuid)', 'bill_review_enqueue_overdue(date)']) {
      expect(m).toContain(`revoke all on function public.${f} from public, anon, authenticated;`)
      expect(m).toContain(`grant execute on function public.${f} to service_role;`)
    }
  })
})

describe('BR7 SQL: the verify', () => {
  it('names each object and proves once only and the attempt rule in a rolled-back block', () => {
    for (const o of ["to_regclass('public.bill_review_notices')", "to_regclass('public.bill_review_notice_documents')", "('public.bill_review_notices_guard()')",
      "('public.bill_review_enqueue_ready(uuid)')", "('public.bill_review_enqueue_overdue(date)')", "tgname = 'trg_bill_review_notices_guard'", "('MAINTAIN')"]) expect(v, o).toContain(o)
    expect(v).toContain("'ready while waiting none, overdue 2 then 0, ready after one none, ready after both 1 email of 2 bills, ready again none, sent allowed, after sent refused'")
    expect(v).toContain("raise exception 'br7 verify: roll back' using errcode = 'P0001';")
  })
})
