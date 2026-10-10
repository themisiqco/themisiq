// lib/billReview/staffNotices.test.ts
//
// Staff notifications (ruled 10 Oct 2026): the new-batch email and the morning digest, through BR7's outbox. The
// database's rules (20261019_bill_review_staff_notices.sql, pinned below) are mirrored in the in-memory rpc; the
// sender and the email builders are real, with fetch as a spy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeAdmin, type FakeAdmin } from '../testing/fakeAdmin'
import { notifyStaffNewBatch, runDailyNotices, sendNotice } from './notices'
import { buildStaffNewBatchEmail, buildStaffDigestEmail } from './noticeEmails'

type Row = Record<string, unknown>
const READERS = ['staff-1', 'staff-2']
let db: FakeAdmin, seq = 0, sent: { to: string[]; subject: string; text: string; html: string }[] = [], fail = 0

const onInventory = (d: Row) => {
  const inv = db.tables.ghg_inventories.find(i => i.id === d.inventory_id) as { locations_data: { source_docs: Row[] }[] } | undefined
  return !!inv?.locations_data.some(l => l.source_docs.some(s => s.id === d.source_doc_id && !s.withdrawn))
}
// The rules of the two enqueue functions, as the migration writes them.
function rpc(fn: string, args: Row) {
  const notices = db.tables.bill_review_notices
  const insert = (kind: string, inventory_id: string | null, user_id: string, dedupe_key: string) => {
    if (notices.some(n => n.dedupe_key === dedupe_key)) return null
    const id = `n${++seq}`
    notices.push({ id, kind, inventory_id, user_id, status: 'pending', attempts: 0, last_error: null, dedupe_key })
    return id
  }
  if (fn === 'bill_review_enqueue_staff_new_batch') {
    const d = db.tables.bill_review_documents.find(x => x.id === args.p_document_id && x.status === 'waiting')
    if (!d) return { data: [], error: null }
    if (db.tables.bill_review_documents.some(x => x.inventory_id === d.inventory_id && x.id !== d.id && x.status === 'waiting' && onInventory(x))) return { data: [], error: null }
    return { data: READERS.map(r => insert('staff_new_batch', d.inventory_id as string, r, `staff_new_batch:${d.id}:${r}`)).filter(Boolean), error: null }
  }
  if (fn === 'bill_review_enqueue_staff_digest') {
    if (!db.tables.bill_review_documents.some(x => x.status === 'waiting' && onInventory(x))) return { data: [], error: null }
    return { data: READERS.map(r => insert('staff_digest', null, r, `staff_digest:${args.p_today}:${r}`)).filter(Boolean), error: null }
  }
  return { data: fn === 'bill_review_enqueue_overdue' ? 0 : null, error: null }
}
const bill = (id: string, o: Row = {}) => ({ id, inventory_id: 'inv-1', user_id: 'cust-1', source_doc_id: `doc-${id}`, status: 'waiting', location_name: 'Leeds',
  document_type: 'utility_electricity', submitted_at: '2026-10-19T14:00:00Z', expected_by: '2026-10-21', file_name: `${id}-jan.pdf`, file_path: `cust-1/inv-1/2026/Leeds/1_${id}.pdf`, ...o })
function seed(bills: Row[], savedDocIds: string[] = bills.map(b => b.source_doc_id as string)) {
  db = fakeAdmin({
    bill_review_documents: bills,
    bill_review_notices: [],
    ghg_inventories: [{ id: 'inv-1', user_id: 'cust-1', company_name: 'Acme Ltd', reporting_year: 2025, fiscal_year_end_month: 9, location_log: [],
      locations_data: [{ id: 'L1', name: 'Leeds', source_docs: savedDocIds.map(id => ({ id })) }] }],
  }, { rpc, emails: { 'staff-1': 'reader.one@themisiq.example', 'staff-2': 'reader.two@themisiq.example', 'cust-1': 'jo@acme.example' } })
}
const fetchSpy = vi.fn(async (_u: string, init: { body: string }) => {
  if (fail > 0) { fail--; return new Response(JSON.stringify({ error: 'down' }), { status: 500 }) }
  sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 })
}) as unknown as typeof fetch

beforeEach(() => { seq = 0; sent = []; fail = 0; vi.stubEnv('RESEND_API_KEY', 'test-key-not-real'); vi.spyOn(console, 'error').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('New batch: once per batch, never per bill', () => {
  it('the first waiting bill emails every bill_reader once; a second bill of the batch and a repeat send nothing', async () => {
    seed([bill('a')], [])   // the first bill is not saved onto the inventory yet when it is submitted
    await notifyStaffNewBatch(db as never, 'a', fetchSpy)
    expect(sent.map(s => [s.to[0], s.subject])).toEqual([['reader.one@themisiq.example', 'New bills for Bill Review: Acme Ltd'], ['reader.two@themisiq.example', 'New bills for Bill Review: Acme Ltd']])
    db.tables.ghg_inventories[0].locations_data = [{ id: 'L1', name: 'Leeds', source_docs: [{ id: 'doc-a' }] }]
    db.tables.bill_review_documents.push(bill('b', { location_name: 'York', expected_by: '2026-10-22' }))
    await notifyStaffNewBatch(db as never, 'b', fetchSpy)
    await notifyStaffNewBatch(db as never, 'a', fetchSpy)
    expect(sent).toHaveLength(2)
  })
  it('a new batch after the last one was read is its own email', async () => {
    seed([bill('a', { status: 'read' }), bill('c')])
    await notifyStaffNewBatch(db as never, 'c', fetchSpy)
    expect(sent).toHaveLength(2)
  })
  it('it names the company, the year, the sites, the count so far and the first expected date', () => {
    const e = buildStaffNewBatchEmail({ companyName: 'Acme Ltd', yearText: 'the year ending 30 September 2025', sites: ['Leeds', 'York'], count: 2, expectedBy: '2026-10-21', link: 'https://www.themisiq.co/staff/bill-review' })
    expect(e.text).toContain('Acme Ltd, the year ending 30 September 2025, has sent bills for a ThemisIQ specialist to read.')
    expect(e.text).toContain('Sites: Leeds and York. 2 bills so far; the first is expected by 21 October 2026.')
    expect(e.text).toContain('Open the queue: https://www.themisiq.co/staff/bill-review')
  })
})

describe('Morning digest: only when something is waiting, once per day', () => {
  it('nothing waiting: no digest', async () => {
    seed([bill('a', { status: 'read' })])
    const r = await runDailyNotices(db as never, '2026-10-22', fetchSpy)
    expect(r.digestEnqueued).toBe(0)
    expect(sent).toEqual([])
  })
  it('a waiting bill: one digest per bill_reader; the same day again sends nothing; the next day sends again', async () => {
    seed([bill('a'), bill('b', { submitted_at: '2026-10-01T09:00:00Z', expected_by: '2026-10-05', location_name: 'York' })])
    await runDailyNotices(db as never, '2026-10-22', fetchSpy)
    await runDailyNotices(db as never, '2026-10-22', fetchSpy)
    expect(sent.map(s => s.subject)).toEqual(['Bill Review: 2 bills waiting', 'Bill Review: 2 bills waiting'])
    await runDailyNotices(db as never, '2026-10-23', fetchSpy)
    expect(sent).toHaveLength(4)
  })
  it('overdue first, then oldest; each line the company, year, site, document type and expected date', () => {
    const e = buildStaffDigestEmail({ link: 'https://www.themisiq.co/staff/bill-review', items: [
      { companyName: 'Acme Ltd', yearText: 'the year ending 30 September 2025', site: 'York', documentType: 'Electricity bill', expectedBy: '2026-10-05', overdue: true },
      { companyName: 'Acme Ltd', yearText: 'the year ending 30 September 2025', site: 'Leeds', documentType: 'Electricity bill', expectedBy: '2026-10-21', overdue: false },
    ] })
    expect(e.text.split('\n\n').slice(0, 3)).toEqual([
      '2 bills are waiting for a ThemisIQ specialist, 1 of them overdue. Overdue first, then oldest:',
      'Overdue. Acme Ltd, the year ending 30 September 2025, York: Electricity bill. Expected by 5 October 2026.',
      'Acme Ltd, the year ending 30 September 2025, Leeds: Electricity bill. Expected by 21 October 2026.',
    ])
  })
})

describe('Neither email carries a figure, a bill’s contents, a file name or link, or a customer’s email', () => {
  it('as sent', async () => {
    seed([bill('a')])
    await notifyStaffNewBatch(db as never, 'a', fetchSpy)
    await runDailyNotices(db as never, '2026-10-22', fetchSpy)
    expect(sent.length).toBeGreaterThanOrEqual(4)
    for (const s of sent) {
      const all = s.subject + s.text + s.html
      expect(all).not.toContain('jo@acme.example')
      expect(all).not.toMatch(/a-jan\.pdf|1_a\.pdf|cust-1\/|signed|storage/)
      expect(all).not.toMatch(/kwh|\d[\d,]* ?(kWh|m3|litres|gallons)/i)
      expect(all).not.toContain(String.fromCharCode(0x2014))
      expect(all).not.toMatch(/\bchase\b/i)
      expect(s.to[0]).toMatch(/@themisiq\.example$/)
    }
  })
})

describe('Failures: retried, and listed for staff', () => {
  it('a failed send is recorded, then retried by the daily run until sent', async () => {
    seed([bill('a')])
    fail = 1
    const out = await notifyStaffNewBatch(db as never, 'a', fetchSpy)
    expect(out).toEqual(['failed', 'sent'])
    const failed = db.tables.bill_review_notices.find(n => n.status === 'failed')!
    expect(failed).toMatchObject({ kind: 'staff_new_batch', attempts: 1, last_error: 'resend_500' })
    await runDailyNotices(db as never, '2026-10-22', fetchSpy)
    expect(db.tables.bill_review_notices.find(n => n.id === failed.id)).toMatchObject({ status: 'sent', attempts: 2 })
  })
  it('the staff page lists every failed email, staff kinds included, in words', () => {
    expect(readFileSync(join(process.cwd(), 'lib/staff/billReviewQueue.ts'), 'utf8')).toContain(".from('bill_review_notices').select('id, kind, inventory_id, attempts, last_error, last_attempt_at').eq('status', 'failed')")
    const page = readFileSync(join(process.cwd(), 'app/staff/bill-review/page.tsx'), 'utf8')
    expect(page).toContain("staff_new_batch: 'New bills, to a specialist', staff_digest: 'Morning digest, to a specialist'")
  })
  it('sendNotice skips a sent one', async () => {
    seed([bill('a')])
    await notifyStaffNewBatch(db as never, 'a', fetchSpy)
    expect(await sendNotice(db as never, db.tables.bill_review_notices[0].id as string, fetchSpy)).toBe('skipped')
  })
})

describe('20261019 and its verify: house format', () => {
  const M = readFileSync(join(process.cwd(), 'supabase/migrations/20261019_bill_review_staff_notices.sql'), 'utf8')
  const V = readFileSync(join(process.cwd(), 'supabase/verify/20261019_staff_notices_verify.sql'), 'utf8')
  it('ASCII; status line; pre-check names the constraint and the new objects; the verify names each and proves the rules', () => {
    for (const s of [M, V]) expect([...s].filter(c => c.charCodeAt(0) > 127)).toEqual([])
    expect(M.split('\n')[0]).toBe('-- NOT YET RUN. Written 10 Oct 2026 for the Bill Review staff notifications; Lisa runs it in the Supabase SQL editor and')
    for (const o of ['bill_review_notices_kind_check', "column_name = 'dedupe_key'", "to_regprocedure('public.bill_review_enqueue_staff_new_batch(uuid)')", "to_regprocedure('public.bill_review_enqueue_staff_digest(date)')"]) expect(M, o).toContain(o)
    for (const o of ["conname = 'bill_review_notices_kind_check'", "conname = 'bill_review_notices_inventory_named'", "to_regclass('public.bill_review_notices_dedupe')",
      "('public.bill_review_enqueue_staff_new_batch(uuid)')", "('public.bill_review_enqueue_staff_digest(date)')", 'new.dedupe_key is distinct from old.dedupe_key',
      "'digest with nothing waiting 0, first bill one per reader, same bill again 0, second bill 0, digest one per reader, same day again 0, next day one per reader'"]) expect(V, o).toContain(o)
  })
})

describe('The SQL these mirror', () => {
  const m = readFileSync(join(process.cwd(), 'supabase/migrations/20261019_bill_review_staff_notices.sql'), 'utf8').split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  it('once per reader per batch and per day, by dedupe_key; a second waiting bill on the saved inventory means the batch has begun', () => {
    expect(m).toContain("'staff_new_batch:' || p_document_id::text || ':' || r.user_id::text")
    expect(m).toContain("'staff_digest:' || p_today::text || ':' || r.user_id::text")
    expect(m).toContain('on conflict (dedupe_key) where dedupe_key is not null do nothing')
    expect(m).toContain("where d.inventory_id = v_inv and d.id <> p_document_id and d.status = 'waiting'")
    expect(m).toContain("for r in select distinct s.user_id from public.staff_roles s where s.role = 'bill_reader' and s.revoked_at is null loop")
    expect(m.trim().split('\n').pop()).toBe("notify pgrst, 'reload schema';")
  })
})
