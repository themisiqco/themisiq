// app/api/bill-review/submit/route.test.ts
//
// BR4: a bill of a human-read inventory is recorded as waiting, with its expected date, through the same path checks
// as the extract route (lib/ghg/billReviewGuard.ts). Supabase is mocked; the route, the guard and expectedBy are real.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const INV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const INV2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type Rec = Record<string, unknown>
const h = vi.hoisted(() => ({
  reading: 'human' as unknown,
  entitled: true,
  records: [] as Record<string, unknown>[],
  upserts: 0,
  upsertError: null as { message: string } | null,
}))

vi.mock('../../../../lib/supabaseAuthed', () => {
  class AuthError extends Error {}
  return {
    AuthError,
    bearerFrom: () => 'token',
    getAuthedClient: async () => ({
      userId: '11111111-1111-4111-8111-111111111111', email: 'a@b.co',
      supabase: {
        from: (table: string) => {
          if (table === 'entitlements') {
            const c = { select: () => c, in: () => c, gt: () => c, limit: async () => ({ data: h.entitled ? [{ module_key: 'concierge' }] : [], error: null }) }
            return c
          }
          if (table === 'ghg_inventories') {
            let id = ''
            const c = { select: () => c, eq: (_k: string, v: string) => { id = v; return c },
              maybeSingle: async () => ({ data: id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' || id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
                ? { id, bill_review_reading: h.reading, bill_review_reading_set_at: null } : null, error: null }) }
            return c
          }
          throw new Error(`unexpected table ${table}`)
        },
      },
    }),
  }
})
vi.mock('../../../../lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table !== 'bill_review_documents') throw new Error(table)
      let fp = ''
      const q = {
        upsert: async (row: Rec, opts: { onConflict: string; ignoreDuplicates: boolean }) => {
          h.upserts++
          if (h.upsertError) return { error: h.upsertError }
          expect(opts).toEqual({ onConflict: 'file_path', ignoreDuplicates: true })
          if (!h.records.some(r => r.file_path === row.file_path)) h.records.push({ ...row, status: 'waiting' })
          return { error: null }
        },
        select: () => q,
        eq: (_k: string, v: string) => { fp = v; return q },
        maybeSingle: async () => ({ data: h.records.find(r => r.file_path === fp) ?? null, error: null }),
      }
      return q
    },
  }),
}))

import { POST } from './route'
import { buildUploadPath } from '../../../../lib/ghg/uploadPath'

const path = (user = USER, inv = INV) => buildUploadPath(user, inv, 2026, 'Leeds', 1760000000000, 'jan.pdf')
const body = (o: Rec = {}) => ({ filePath: path(), inventoryId: INV, sourceDocId: 'doc-1', fileName: 'jan.pdf', documentType: 'utility_bill_electric', locationId: 'loc-1', locationName: 'Leeds', ...o })
const call = (o: Rec = {}) => POST(new Request('http://x/api/bill-review/submit', { method: 'POST', body: JSON.stringify(body(o)) }) as never)

beforeEach(() => {
  h.reading = 'human'; h.entitled = true; h.records = []; h.upserts = 0; h.upsertError = null
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-19T14:00:00Z'))   // Monday 10:00 Toronto
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('BR4 submit: a human-read inventory’s bill is recorded as waiting', () => {
  it('recorded, with the expected date computed on the server (Monday before 15:00 gives Wednesday)', async () => {
    const res = await call({ expectedBy: '2030-01-01' })   // a date sent by the browser is ignored
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'waiting', expectedBy: '2026-10-21', expectedByRefusal: null })
    expect(h.records[0]).toMatchObject({ user_id: USER, inventory_id: INV, source_doc_id: 'doc-1', file_path: path(), expected_by: '2026-10-21', expected_by_refusal: null })
  })
  it('a submission for an AI-read inventory is refused: 409, nothing recorded', async () => {
    h.reading = 'ai'
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).reason).toBe('ai_read')
    expect(h.upserts).toBe(0)
  })
  it('expectedBy refusing (a year with no holiday list) still records the bill as waiting, with no date and the reason', async () => {
    vi.setSystemTime(new Date('2029-03-01T15:00:00Z'))
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'waiting', expectedBy: null, expectedByRefusal: 'no_holiday_list:2029' })
    expect(h.records[0]).toMatchObject({ expected_by: null, expected_by_refusal: 'no_holiday_list:2029' })
  })
  it('idempotent: a second call returns the first record and records nothing more', async () => {
    await call()
    vi.setSystemTime(new Date('2026-10-23T14:00:00Z'))
    expect(await (await call()).json()).toMatchObject({ expectedBy: '2026-10-21' })
    expect(h.records).toHaveLength(1)
  })
  it('a stored bill already recorded for another document is refused', async () => {
    await call()
    expect((await call({ sourceDocId: 'doc-2' })).status).toBe(409)
  })
  it('the record cannot be written: 503', async () => {
    h.upsertError = { message: 'boom' }
    expect((await call()).status).toBe(503)
  })
  it('Bill Review not held: 403, nothing recorded', async () => {
    h.entitled = false
    expect((await call()).status).toBe(403)
    expect(h.upserts).toBe(0)
  })
})

describe('BR4 submit reuses BR2’s path checks', () => {
  it('another user: 403; another inventory: 403; an inventory the caller cannot read: 403; an old path: 400', async () => {
    expect((await call({ filePath: path(OTHER, INV) })).status).toBe(403)
    expect((await call({ filePath: path(USER, INV2) })).status).toBe(403)
    const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    expect((await call({ filePath: path(USER, STRANGER), inventoryId: STRANGER })).status).toBe(403)
    expect((await call({ filePath: `${USER}/2026/Leeds/1_jan.pdf` })).status).toBe(400)
    expect(h.upserts).toBe(0)
  })
  it('both routes call the one guard; neither parses a path itself', () => {
    for (const f of ['app/api/bill-review/submit/route.ts', 'app/api/concierge/extract/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8')
      expect(src, f).toMatch(/checkStoredBill\(supabase, userId, \{ filePath, inventoryId \}, '(ai|human)'\)/)
      expect(src, f).not.toContain('parseUploadPath')
      expect(src, f).toContain('billReviewEntitlement(supabase)')
    }
  })
  it('the refusals are logged with metadata only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await call({ filePath: path(OTHER, INV) })
    expect(JSON.stringify(warn.mock.calls)).not.toContain('jan.pdf')
  })
})
