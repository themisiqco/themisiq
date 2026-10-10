// app/api/cron/bill-review-notices/route.test.ts
//
// BR7: the daily job runs only for Vercel Cron's bearer, and passes Toronto's date.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const h = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('../../../../lib/supabase', () => ({ createServerClient: () => ({}) }))
vi.mock('../../../../lib/billReview/notices', () => ({
  runDailyNotices: async (_a: unknown, today: string) => { h.calls.push(today); return { overdueEnqueued: 0, readyEnqueued: 0, sent: 0, failed: 0, skipped: 0, errors: [] } },
}))
import { GET } from './route'

const req = (auth?: string) => new Request('http://x/api/cron/bill-review-notices', { headers: auth ? { authorization: auth } : {} }) as never

beforeEach(() => { h.calls = []; vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}) })
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('BR7 daily job', () => {
  it('no CRON_SECRET set: refused, nothing runs', async () => {
    expect((await GET(req('Bearer anything'))).status).toBe(503)
    expect(h.calls).toEqual([])
  })
  it('a wrong or missing bearer: 401, nothing runs', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret-not-real')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
    expect(h.calls).toEqual([])
  })
  it('the right bearer runs it, with Toronto’s date (13:00 UTC is 08:00 or 09:00 there)', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret-not-real')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T13:00:00Z'))
    expect((await GET(req('Bearer test-secret-not-real'))).status).toBe(200)
    vi.setSystemTime(new Date('2026-12-01T03:00:00Z'))   // still 30 November in Toronto
    await GET(req('Bearer test-secret-not-real'))
    expect(h.calls).toEqual(['2026-10-22', '2026-11-30'])
  })
  it('vercel.json schedules it daily at 13:00 UTC', () => {
    expect(JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'))).toEqual({ crons: [{ path: '/api/cron/bill-review-notices', schedule: '0 13 * * *' }] })
  })
})
