// lib/billReview/br4Sql.test.ts
//
// BR4: the two migrations and the verify script, read as text (no local Postgres; pglast parses them offline,
// reported with the patch). supabase/verify/20261013_br4_verify.sql proves the guards in the database.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const code = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const Q = read('supabase/migrations/20261013_bill_review_queue.sql')
const SW = read('supabase/migrations/20261014_bill_review_reading_switch.sql')
const V = read('supabase/verify/20261013_br4_verify.sql')
const q = code(Q), sw = code(SW), v = code(V)
const fn = (src: string, name: string) => src.slice(src.indexOf(`create or replace function public.${name}()`), src.indexOf('$$;', src.indexOf(`function public.${name}()`)))

describe('BR4 SQL: house format', () => {
  it('ASCII, status lines, run order, pre-checks naming each object; both end with the schema reload', () => {
    for (const s of [Q, SW, V]) expect([...s].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    for (const s of [Q, SW]) {
      expect(s.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for BR4; Lisa runs it in the Supabase SQL editor and records the run here.')
      expect(code(s).trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
      expect(s).toContain("-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema';")
    }
    expect(Q).toContain('-- RUN ORDER: 1 of 2. Run BEFORE the BR4 app change (br4b.patch) is pushed')
    expect(SW).toContain('-- RUN ORDER: 2 of 2. Run AFTER 20261013_bill_review_queue.sql AND AFTER the BR4 app change (br4b.patch) is deployed')
    const pre = Q.slice(Q.indexOf('-- PRE-CHECK, run first:'), Q.indexOf('-- VERIFY, after'))
    for (const o of ["to_regclass('public.bill_review_documents')", "to_regclass('public.bill_review_readings')",
      "to_regprocedure('public.bill_review_documents_guard()')", "to_regprocedure('public.bill_review_readings_guard()')", "column_name = 'bill_review_reading'"]) expect(pre, o).toContain(o)
    const swVerify = SW.slice(SW.indexOf('-- VERIFY, after'), SW.indexOf('-- Idempotent'))
    expect(swVerify).toContain("to_regprocedure('public.ghg_bill_review_reading_stamp()')")
    expect(swVerify).toContain("tgname = 'trg_ghg_bill_review_reading_stamp'")
  })
})

describe('BR4 SQL: bill_review_documents', () => {
  it('one record per stored bill and per document of an inventory; the inventory cascades', () => {
    expect(q).toContain('create unique index if not exists bill_review_documents_file_path on public.bill_review_documents (file_path);')
    expect(q).toContain('create unique index if not exists bill_review_documents_inventory_doc on public.bill_review_documents (inventory_id, source_doc_id);')
    expect(q).toContain('inventory_id         uuid        not null references public.ghg_inventories(id) on delete cascade,')
    expect(q).toContain("status               text        not null default 'waiting' check (status in ('waiting', 'read', 'unreadable')),")
  })
  it('an expected date or the reason there is none, never both and never neither', () => {
    expect(q).toContain('check ((expected_by is null) <> (expected_by_refusal is null)),')
  })
  it('the guard: own inventory, human-read, server time on insert; one move, naming the reader; nothing else changes', () => {
    const g = fn(q, 'bill_review_documents_guard')
    expect(g).toContain("if v_reading is distinct from 'human' then")
    expect(g).toContain('if v_owner is null or v_owner <> new.user_id then')
    expect(g).toContain('new.submitted_at := now();')
    expect(g).toContain("if old.status <> 'waiting' or new.status not in ('read', 'unreadable') or new.read_by is null then")
    for (const c of ['id', 'user_id', 'inventory_id', 'source_doc_id', 'file_path', 'file_name', 'document_type', 'location_id', 'location_name', 'submitted_at', 'expected_by', 'expected_by_refusal'])
      expect(g, c).toContain(`new.${c} is distinct from old.${c}`)
    expect(g).not.toMatch(/withdrawn|deleted/)
  })
})

describe('BR4 SQL: bill_review_readings is append-only (ruling 1)', () => {
  const g = fn(q, 'bill_review_readings_guard')
  it('every update is refused; a correction supersedes a reading of the same bill; owner and inventory come from the bill', () => {
    expect(g).toContain("if tg_op <> 'INSERT' then\n    raise exception 'A reading is never changed.")
    expect(g).toContain('where r.id = new.supersedes and r.bill_review_document_id = new.bill_review_document_id')
    expect(g).toContain('new.user_id := v_user;\n  new.inventory_id := v_inv;\n  new.read_at := now();')
    expect(q).toContain('before insert or update on public.bill_review_readings')
    expect(q).toContain('create unique index if not exists bill_review_readings_supersedes on public.bill_review_readings (supersedes) where supersedes is not null;')
  })
  it('no delete trigger and no DELETE grant: delete only through the inventory cascade', () => {
    expect(q).not.toMatch(/before[^;]*delete[^;]*on public\.bill_review_/i)
    expect(q).not.toMatch(/grant[^;]*delete/i)
    expect(q).toContain('bill_review_document_id  uuid        not null references public.bill_review_documents(id) on delete cascade,')
    expect(q).toContain('grant select, insert on public.bill_review_readings to service_role;')
    expect(q).not.toMatch(/grant[^;]*update[^;]*bill_review_readings/i)
  })
})

describe('BR4 SQL: RLS and grants', () => {
  it('one SELECT policy per table, own rows, wrapped auth.uid(); no write policy', () => {
    for (const t of ['bill_review_documents', 'bill_review_readings']) {
      expect(q).toContain(`create policy ${t}_select_own on public.${t}\n  for select to authenticated\n  using (user_id = (select auth.uid()));`)
      expect(q).toContain(`alter table public.${t} enable row level security;`)
    }
    expect([...q.matchAll(/create policy/g)]).toHaveLength(2)
  })
  it('revoke first; authenticated SELECT is column-scoped and never names read_by; anon nothing', () => {
    expect(q).toContain('revoke all on public.bill_review_documents, public.bill_review_readings from public, anon, authenticated, service_role;')
    const authed = [...q.matchAll(/grant select \(([^)]*)\)\s+on public\.(bill_review_\w+) to authenticated;/g)]
    expect(authed.map(m => m[2])).toEqual(['bill_review_documents', 'bill_review_readings'])
    for (const m of authed) { expect(m[1]).not.toContain('read_by'); expect(m[1]).toContain('read_at') }
    expect(q).not.toMatch(/to\s+anon\b/i)
  })
})

describe('BR4 SQL: the switch (20261014)', () => {
  it('the same stamp function, less the human-to-AI refusal', () => {
    const before = fn(code(read('supabase/migrations/20261011_bill_review_reading.sql')), 'ghg_bill_review_reading_stamp')
    const after = fn(sw, 'ghg_bill_review_reading_stamp')
    expect(after).not.toContain('Switching it to AI reading is not available yet.')
    const lock = before.slice(before.indexOf("    if old.bill_review_reading = 'human'"), before.indexOf("    new.bill_review_reading_set_by := (select auth.uid());\n    new.bill_review_reading_set_at := now();\n  else"))
    expect(lock).toContain("raise exception 'This inventory''s bills are read by a ThemisIQ specialist.")
    expect(after).toBe(before.replace(lock, ''))
  })
})

describe('BR4 SQL: the verify script', () => {
  it('names each object, checks every privilege, and proves the guards in a rolled-back block', () => {
    for (const o of ["to_regclass('public.bill_review_documents')", "to_regclass('public.bill_review_readings')", "to_regclass('public.bill_review_documents_file_path')",
      "to_regclass('public.bill_review_documents_inventory_doc')", "to_regclass('public.bill_review_readings_supersedes')",
      "to_regprocedure('public.bill_review_documents_guard()')", "to_regprocedure('public.bill_review_readings_guard()')",
      'bill_review_documents_select_own', 'bill_review_readings_select_own', 'trg_bill_review_documents_guard', 'trg_bill_review_readings_guard', "('MAINTAIN')"]) expect(v, o).toContain(o)
    expect(v).toContain("has_column_privilege('authenticated', 'public.' || table_name, column_name, 'SELECT') <> (column_name <> 'read_by')")
    expect(v).toContain("'ai inventory refused, reading update refused, record change refused, read allowed, second move refused, cascade allowed'")
    expect(v).toContain("raise exception 'br4 verify: roll back' using errcode = 'P0001';")
  })
})
