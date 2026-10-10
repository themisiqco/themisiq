// lib/billReview/br6.test.ts
//
// BR6 (Q1, ruled 10 Oct 2026): the reading is shown, never chosen, by the customer. The staff-only trigger, the manual
// script and the verify are read as text (pglast parses them offline, reported with the patch); the wording and the
// line are rendered.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { readingLine, sinceLine, specialistMailto, ASK_SPECIALIST, BILL_REVIEW_CONTACT_EMAIL } from './readingWords'

const textOf = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'")
import { BillReviewReadingLine } from '../../app/dashboard/ghg/_components/BillReviewReadingLine'
import { BILL_REVIEW_HUMAN_READING_SELLABLE } from '../pricing'

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
const code = (s: string) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const MIG = read('supabase/migrations/20261015_bill_review_reading_staff_only.sql')
const MANUAL = read('supabase/manual/20261015_set_bill_review_reading.sql')
const VERIFY = read('supabase/verify/20261015_br6_verify.sql')

describe('BR6 SQL: the reading is changed by ThemisIQ staff only', () => {
  const m = code(MIG)
  it('house format: ASCII, status line, pre-check, verify reference; ends with the schema reload', () => {
    for (const s of [MIG, MANUAL, VERIFY]) expect([...s].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    expect(MIG.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for BR6; Lisa runs it in the Supabase SQL editor and records the run here.')
    expect(MIG).toContain("to_regprocedure('public.ghg_bill_review_reading_stamp()')")
    expect(MIG).toContain('-- VERIFY, after: supabase/verify/20261015_br6_verify.sql.')
    expect(m.trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
  })
  it('an insert as ai works for anyone, leaving who and when null; an unchanged reading keeps them', () => {
    expect(m).toContain("if tg_op = 'INSERT' then\n    if new.bill_review_reading = 'ai' then\n      new.bill_review_reading_set_by := null;\n      new.bill_review_reading_set_at := null;\n      return new;")
    expect(m).toContain('elsif new.bill_review_reading is not distinct from old.bill_review_reading then\n    new.bill_review_reading_set_by := old.bill_review_reading_set_by;')
  })
  it('a change, or an insert as human, needs an active bill_review_lead, stamped as set_by; else 42501 with the ruled words', () => {
    expect(m).toContain("where s.user_id = v_uid and s.role = 'bill_review_lead' and s.revoked_at is null")
    expect(m).toContain("if v_uid is null or not v_lead then\n    raise exception 'The reading of an inventory''s bills is changed by ThemisIQ on request.' using errcode = '42501';")
    expect(m).toContain('new.bill_review_reading_set_by := v_uid;\n  new.bill_review_reading_set_at := now();')
    expect(m).toMatch(/security definer\s+set search_path = ''/)
  })
  it('the verify proves it in a rolled-back block on a temporary copy, as a customer and as a lead', () => {
    const v = code(VERIFY)
    expect(v).toContain('create temp table br6_t on commit drop as select * from public.ghg_inventories limit 0;')
    expect(v).toContain('execute function public.ghg_bill_review_reading_stamp();')
    expect(v).toContain("perform set_config('request.jwt.claims', json_build_object('sub', v_customer, 'role', 'authenticated')::text, true);")
    expect(v).toContain("raise exception 'br6 verify: roll back' using errcode = 'P0001';")
    expect(VERIFY).toContain("rule 'customer insert ai allowed, customer insert human refused, customer update refused, lead update allowed'")
    expect(v).toContain("tgname = 'trg_ghg_bill_review_reading_stamp'")
    expect(v).not.toMatch(/update public\.ghg_inventories|insert into public\.ghg_inventories/)
  })
  it('the manual script: kept out of migrations, placeholders only, a lead’s id for one transaction, refuses otherwise', () => {
    expect(MANUAL).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/)
    for (const ph of ['<your sign-in email>', '<inventory id>', '<ai or human>']) expect(MANUAL).toContain(ph)
    const c = code(MANUAL)
    expect(c).toContain("and exists (select 1 from public.staff_roles s where s.user_id = u.id and s.role = 'bill_review_lead' and s.revoked_at is null);")
    expect(c).toContain("perform set_config('request.jwt.claims', json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);")
    expect(c).toContain('update public.ghg_inventories set bill_review_reading = v_reading where id = v_inv;')
    expect(c).toContain("raise exception 'The reading must be ai or human. Nothing was changed.';")
  })
})

describe('BR6: the customer cannot write the reading from the app', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out) }
      else if (/\.(ts|tsx)$/.test(e) && !/\.test\.(ts|tsx)$/.test(e)) out.push(p)
    }
    return out
  }
  it('no app or lib code names bill_review_reading in a write', () => {
    const writes: string[] = []
    for (const f of [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]) {
      const src = readFileSync(f, 'utf8')
      // An object key (a payload naming the column), or a write call naming it. A ternary that reads it is not a write.
      if (/(?:^|[{,])\s*['"]?bill_review_reading(?:_set_by|_set_at)?['"]?\s*:/m.test(src) || /\.(update|insert|upsert)\([^)]*bill_review_reading/.test(src)) writes.push(relative(ROOT, f))
    }
    expect(writes).toEqual([])
  })
  it('the check bites: a payload key is a write, a ternary is not', () => {
    const KEY = /(?:^|[{,])\s*['"]?bill_review_reading(?:_set_by|_set_at)?['"]?\s*:/m
    expect(KEY.test("supabase.from('ghg_inventories').update({ bill_review_reading: 'human' })")).toBe(true)
    expect(KEY.test("const payload = {\n  user_id,\n  bill_review_reading: 'ai',")).toBe(true)
    expect(KEY.test("x = typeof data.bill_review_reading_set_at === 'string' ? data.bill_review_reading_set_at : null")).toBe(false)
  })
  it('human reading is still not sold', () => {
    expect(BILL_REVIEW_HUMAN_READING_SELLABLE).toBe(false)
  })
})

describe('BR6: what the customer reads', () => {
  it('the reading, read-only, with the request link for AI reading', () => {
    expect(readingLine('ai')).toBe('Your bills are read by AI, and you confirm each one.')
    expect(readingLine('human')).toBe('Your bills are read by a ThemisIQ specialist, and you confirm each one. Within 2 business days.')
    expect(BILL_REVIEW_CONTACT_EMAIL).toBe('hello@themisiq.co')
    expect(specialistMailto('Acme Ltd', 'the year ending 30 September 2025'))
      .toBe('mailto:hello@themisiq.co?subject=Specialist%20reading%20for%20Acme%20Ltd%2C%20the%20year%20ending%2030%20September%202025')
  })
  it('"Since {date}" in place of a switch screen, in Toronto’s date', () => {
    expect(sinceLine('human', '2026-10-15T03:30:00Z')).toBe('Since 14 October 2026, bills you upload here are read by a ThemisIQ specialist and are not sent to the AI. Bills uploaded before then keep their reading.')
    expect(sinceLine('ai', '2026-10-15T16:00:00Z')).toBe('Since 15 October 2026, bills you upload here are read by the AI, and you confirm each one. Bills already with our team stay with our team.')
    expect(sinceLine('ai', null)).toBeNull()
  })
  it('the line renders with no control that changes the reading', () => {
    const ai = renderToStaticMarkup(createElement(BillReviewReadingLine, { reading: 'ai', since: null, companyName: 'Acme Ltd', yearText: 'reporting year 2026' }))
    expect(textOf(ai)).toBe('Your bills are read by AI, and you confirm each one. Prefer a ThemisIQ specialist to read them instead? Ask us to switch. We\u2019ll send you a quote before anything changes.')
    expect(ai).toContain('style="color:var(--color-brand);text-decoration:underline">Ask us to switch</a>')
    expect(ASK_SPECIALIST).toBe('Ask us to switch')
    expect(ai).toContain('href="mailto:hello@themisiq.co?subject=Specialist%20reading%20for%20Acme%20Ltd%2C%20reporting%20year%202026"')
    expect(ai).not.toContain(String.fromCharCode(0x2014))
    expect(ai).not.toMatch(/<(input|select|button)/)
    const human = renderToStaticMarkup(createElement(BillReviewReadingLine, { reading: 'human', since: '2026-10-15T16:00:00Z', companyName: 'Acme Ltd', yearText: 'reporting year 2026' }))
    expect(human).not.toContain(ASK_SPECIALIST)
    expect(human).not.toContain('quote')
    expect(human).toContain('Since 15 October 2026')
  })
  it('shown on the Energy & fuel data step to a Bill Review holder, with the year from the helper', () => {
    const page = read('app/dashboard/ghg/page.tsx')
    expect(page).toContain('{CONCIERGE_DEV && billReviewReading && (\n          <BillReviewReadingLine reading={billReviewReading} since={billReviewReadingSince} companyName={inventory.company_name} yearText={yl.inText} />')
  })
})
