// lib/ghg/br1Sql.test.ts
//
// BR1: supabase/migrations/20261011_bill_review_reading.sql, read as text (no local Postgres; pglast parses it offline,
// reported with the patch). The trigger rule here is the one the BR2 property test mirrors.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/20261011_bill_review_reading.sql'), 'utf8')
const code = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const COLS = ['bill_review_reading', 'bill_review_reading_set_by', 'bill_review_reading_set_at']

describe('BR1 migration: house format', () => {
  it('ASCII, a status line, a run order, a pre-check and a verify that names the new objects', () => {
    expect([...SQL].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    expect(SQL.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for BR1; Lisa runs it in the Supabase SQL editor and records the run here.')
    expect(SQL).toContain('-- RUN ORDER: 1 of 1. Run BEFORE the BR1/BR2 app change is pushed')
    const pre = SQL.slice(SQL.indexOf('-- PRE-CHECK, run first:'), SQL.indexOf('-- VERIFY, after'))
    const verify = SQL.slice(SQL.indexOf('-- VERIFY, after'), SQL.indexOf('-- DEPLOY ORDER'))
    for (const c of COLS) { expect(pre, c).toContain(`'${c}'`); expect(verify, c).toContain(`'${c}'`) }
    expect(verify).toContain("conname = 'ghg_inventories_bill_review_reading_chk'")
    expect(verify).toContain("to_regprocedure('public.ghg_bill_review_reading_stamp()')")
    expect(verify).toContain("tgname = 'trg_ghg_bill_review_reading_stamp'")
    expect(verify).toContain('no count is the proof')
  })
  it('ends with the schema reload, and the header says so (CLAUDE.md)', () => {
    expect(code.trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
    expect(SQL).toContain("-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema';")
  })
})

describe('BR1 migration: the column', () => {
  it('ai by default, not null, and only ai or human', () => {
    expect(code).toContain("add column if not exists bill_review_reading        text not null default 'ai',")
    expect(code).toContain("check (bill_review_reading in ('ai', 'human'));")
    expect(code).toContain('drop constraint if exists ghg_inventories_bill_review_reading_chk;')
  })
  it('who and when are stamped by the trigger from the server, never taken from the client', () => {
    expect(code).toContain('new.bill_review_reading_set_by := (select auth.uid());\n    new.bill_review_reading_set_at := now();')
    expect(code).toContain('new.bill_review_reading_set_by := old.bill_review_reading_set_by;\n    new.bill_review_reading_set_at := old.bill_review_reading_set_at;')
    expect(code).toContain('before insert or update on public.ghg_inventories')
    expect(code).toContain('revoke all on function public.ghg_bill_review_reading_stamp() from public, anon, authenticated;')
  })
  it('decision 1: human to ai is refused until BR4, before anything is stamped', () => {
    const fn = code.slice(code.indexOf('if new.bill_review_reading is distinct from old.bill_review_reading then'))
    const refuse = fn.indexOf("if old.bill_review_reading = 'human' and new.bill_review_reading = 'ai' then")
    expect(refuse).toBeGreaterThan(-1)
    expect(refuse).toBeLessThan(fn.indexOf('new.bill_review_reading_set_at := now();'))
    expect(fn).toContain("Switching it to AI reading is not available yet.'\n        using errcode = '42501';")
  })
  it('grants are column-scoped per privilege; anon gets nothing; no table-level grant', () => {
    expect(code).toContain(`grant select (${COLS.join(', ')}),\n      insert (${COLS.join(', ')}),\n      update (${COLS.join(', ')})\n  on public.ghg_inventories to authenticated;`)
    expect(code).toContain(`grant select (${COLS.join(', ')})\n  on public.ghg_inventories to service_role;`)
    expect(code).not.toMatch(/to\s+anon/i)
    expect(code).not.toMatch(/grant\s+(select|insert|update)\s*,/i)
  })
})

describe('BR1: no price of its own', () => {
  it('human reading stays unsellable, and no human-read onboarding price is written outside lib/pricing.ts', async () => {
    const { BILL_REVIEW_HUMAN_READING_SELLABLE } = await import('../pricing')
    expect(BILL_REVIEW_HUMAN_READING_SELLABLE).toBe(false)
    for (const f of ['app/api/concierge/extract/route.ts', 'lib/ghg/billReviewReading.ts', 'app/dashboard/ghg/page.tsx', 'supabase/migrations/20261011_bill_review_reading.sql']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toMatch(/\$?\b(1,?200|2,?200|4,?200)\b/)
    }
  })
})
