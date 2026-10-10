// lib/billReview/notices.test.ts
//
// BR7: sending the Bill Review emails through the outbox. The database (an in-memory copy of the rules in
// 20261016_bill_review_notices.sql, pinned by lib/billReview/br7Sql.test.ts) decides what is enqueued; the sender is
// real, with fetch as a spy.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendNotice, notifyIfBatchComplete, runDailyNotices, MAX_ATTEMPTS } from './notices'

type Doc = { id: string; inventory_id: string; user_id: string; status: 'waiting' | 'read' | 'unreadable'; expected_by: string; file_name: string; location_name: string; onInventory: boolean }
type Notice = { id: string; kind: 'ready' | 'overdue'; inventory_id: string; user_id: string; status: 'pending' | 'sent' | 'failed'; attempts: number; last_error: string | null }
let docs: Doc[] = [], notices: Notice[] = [], noticeDocs: { document_id: string; kind: string; notice_id: string }[] = [], seq = 0

// The rules of bill_review_enqueue_ready / _overdue and the notices guard, as the migration writes them.
function enqueueReady(inv: string): string | null {
  if (docs.some(d => d.inventory_id === inv && d.status === 'waiting' && d.onInventory)) return null
  const ids = docs.filter(d => d.inventory_id === inv && d.status !== 'waiting' && d.onInventory && !noticeDocs.some(n => n.document_id === d.id && n.kind === 'ready')).map(d => d.id)
  if (ids.length === 0) return null
  const id = `n${++seq}`
  notices.push({ id, kind: 'ready', inventory_id: inv, user_id: 'cust-1', status: 'pending', attempts: 0, last_error: null })
  for (const d of ids) noticeDocs.push({ document_id: d, kind: 'ready', notice_id: id })
  return id
}
function enqueueOverdue(today: string): number {
  let n = 0
  for (const d of docs.filter(d => d.status === 'waiting' && d.expected_by < today && d.onInventory && !noticeDocs.some(x => x.document_id === d.id && x.kind === 'overdue'))) {
    const id = `n${++seq}`
    notices.push({ id, kind: 'overdue', inventory_id: d.inventory_id, user_id: d.user_id, status: 'pending', attempts: 0, last_error: null })
    noticeDocs.push({ document_id: d.id, kind: 'overdue', notice_id: id }); n++
  }
  return n
}
function update(id: string, patch: Partial<Notice>) {
  const n = notices.find(x => x.id === id)!
  if (n.status === 'sent' || patch.attempts !== n.attempts + 1) throw new Error('guard refused')
  Object.assign(n, patch, patch.status === 'sent' ? { last_error: null } : {})
}

const admin = {
  rpc: async (fn: string, args: Record<string, string>) =>
    fn === 'bill_review_enqueue_ready' ? { data: enqueueReady(args.p_inventory_id), error: null }
      : fn === 'bill_review_enqueue_overdue' ? { data: enqueueOverdue(args.p_today), error: null } : { data: null, error: { message: fn } },
  auth: { admin: { getUserById: async () => ({ data: { user: { email: 'jo@acme.example' } }, error: null }) } },
  from: (table: string) => {
    const f: Record<string, unknown> = {}; let patch: Partial<Notice> | null = null
    const q: Record<string, unknown> = {
      select: () => q,
      update: (p: Partial<Notice>) => { patch = p; return q },
      eq: (k: string, v: unknown) => {
        f[k] = v
        if (patch) { update(String(v), patch); return Promise.resolve({ error: null }) }
        if (table === 'bill_review_notice_documents') {
          const rows = noticeDocs.filter(n => n.notice_id === v).map(n => ({ bill_review_documents: docs.find(d => d.id === n.document_id) }))
          return Promise.resolve({ data: rows, error: null })
        }
        return q
      },
      neq: (k: string, v: unknown) => {
        f[`!${k}`] = v
        if (table === 'bill_review_documents') return Promise.resolve({ data: docs.filter(d => d.status !== v).map(d => ({ inventory_id: d.inventory_id })), error: null })
        return q
      },
      lt: (_k: string, v: number) => Promise.resolve({ data: notices.filter(n => n.status !== f['!status'] && n.attempts < v).map(n => ({ id: n.id })), error: null }),
      maybeSingle: async () => {
        if (table === 'bill_review_notices') return { data: notices.find(n => n.id === f.id) ?? null, error: null }
        if (table === 'ghg_inventories') return { data: { company_name: 'Acme Ltd', reporting_year: 2025, fiscal_year_end_month: 9 }, error: null }
        return { data: null, error: null }
      },
    }
    return q
  },
} as never

const sent: { to: string[]; subject: string; text: string }[] = []
let fail = 0
const fetchSpy = vi.fn(async (_url: string, init: { body: string }) => {
  if (fail > 0) { fail--; return new Response(JSON.stringify({ error: 'down' }), { status: 500 }) }
  sent.push(JSON.parse(init.body))
  return new Response(JSON.stringify({ id: 'resend-1' }), { status: 200 })
}) as unknown as typeof fetch

const bill = (id: string, o: Partial<Doc> = {}): Doc => ({ id, inventory_id: 'inv-1', user_id: 'cust-1', status: 'waiting', expected_by: '2026-10-21', file_name: `${id}.pdf`, location_name: 'Leeds', onInventory: true, ...o })

beforeEach(() => {
  docs = []; notices = []; noticeDocs = []; seq = 0; sent.length = 0; fail = 0
  vi.stubEnv('RESEND_API_KEY', 'test-key-not-real')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('BR7 overdue email: the morning after, once per bill', () => {
  it('a bill past its date gets one email; the next day’s run sends nothing more', async () => {
    docs = [bill('a')]
    await runDailyNotices(admin, '2026-10-22', fetchSpy)
    await runDailyNotices(admin, '2026-10-23', fetchSpy)
    expect(sent.map(s => s.subject)).toEqual(['A bill is running late'])
    expect(sent[0].to).toEqual(['jo@acme.example'])
    expect(sent[0].text).toContain('We expected to finish reading a.pdf for Acme Ltd, Leeds, by 21 October 2026, and we are still reading it.')
  })
  it('not on the expected day itself, not for a bill already read, not for one the customer deleted', async () => {
    docs = [bill('a'), bill('b', { status: 'read' }), bill('c', { onInventory: false })]
    await runDailyNotices(admin, '2026-10-21', fetchSpy)
    expect(sent).toHaveLength(0)
    await runDailyNotices(admin, '2026-10-22', fetchSpy)
    expect(sent.filter(s => s.subject === 'A bill is running late').map(s => s.text.match(/reading (\w+)\.pdf/)![1])).toEqual(['a'])
  })
})

describe('BR7 ready email: once per batch, with the count', () => {
  it('nothing while a bill is waiting; one email naming the count when the last is read; none again', async () => {
    docs = [bill('a', { status: 'read' }), bill('b'), bill('c')]
    expect(await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)).toBe('not_complete')
    docs[1].status = 'read'; docs[2].status = 'unreadable'
    expect(await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)).toBe('sent')
    expect(await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)).toBe('not_complete')
    const ready = sent.filter(s => s.subject === 'Your bills are ready to confirm')
    expect(ready).toHaveLength(1)
    expect(ready[0].text).toContain('Our team has finished reading 3 bills for Acme Ltd, the year ending 30 September 2025.')
  })
  it('a later batch on the same inventory is its own email, with its own count', async () => {
    docs = [bill('a', { status: 'read' })]
    await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)
    docs.push(bill('d', { status: 'read' }))
    await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)
    expect(sent.map(s => s.text.match(/reading (\d+ bills?)/)![1])).toEqual(['1 bill', '1 bill'])
  })
  it('a deleted waiting bill does not hold the batch open', async () => {
    docs = [bill('a', { status: 'read' }), bill('b', { onInventory: false })]
    expect(await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)).toBe('sent')
  })
})

describe('BR7 failures: logged, retried, never silent', () => {
  it('a failed send is recorded and logged with metadata only, then retried by the daily run', async () => {
    docs = [bill('a', { status: 'read' })]
    fail = 1
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)).toBe('failed')
    expect(notices[0]).toMatchObject({ status: 'failed', attempts: 1, last_error: 'resend_500' })
    const logged = JSON.stringify(err.mock.calls)
    expect(logged).toContain('resend_500')
    expect(logged).not.toMatch(/jo@acme|a\.pdf|Acme/)
    const r = await runDailyNotices(admin, '2026-10-19', fetchSpy)
    expect(r.sent).toBe(1)
    expect(notices[0]).toMatchObject({ status: 'sent', attempts: 2, last_error: null })
  })
  it('at most 5 attempts; then it stays failed, for staff to see', async () => {
    docs = [bill('a', { status: 'read' })]
    fail = 99
    await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)
    for (let i = 0; i < 6; i++) await runDailyNotices(admin, '2026-10-19', fetchSpy)
    expect(notices[0]).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS })
    expect(await sendNotice(admin, notices[0].id, fetchSpy)).toBe('skipped')
  })
  it('a sent email is never sent again', async () => {
    docs = [bill('a', { status: 'read' })]
    await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)
    expect(await sendNotice(admin, notices[0].id, fetchSpy)).toBe('skipped')
    expect(sent).toHaveLength(1)
  })
  it('email not configured: no attempt is spent, and it is logged', async () => {
    vi.unstubAllEnvs()
    docs = [bill('a', { status: 'read' })]
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await notifyIfBatchComplete(admin, 'inv-1', fetchSpy)).toBe('skipped')
    expect(notices[0]).toMatchObject({ status: 'pending', attempts: 0 })
    expect(JSON.stringify(err.mock.calls)).toContain('not configured')
  })
})
