// app/api/concierge/extract/route.test.ts
//
// BR2: THE GUARANTEE. A human-read inventory's bills never reach the AI. Supabase is mocked; the storage download and
// the model call are spies, so every refusal can be shown to have fetched no file and called no model.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const INV = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const INV2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const h = vi.hoisted(() => ({
  inventories: {} as Record<string, { id: string; bill_review_reading: unknown }>,
  invError: null as { message: string } | null,
  download: vi.fn(async () => ({ data: new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }), error: null })),
}))

vi.mock('../../../../lib/supabaseAuthed', () => {
  class AuthError extends Error {}
  return {
    AuthError,
    bearerFrom: () => 'token',
    getAuthedClient: async () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      email: 'a@b.co',
      supabase: {
        from: (table: string) => {
          if (table === 'entitlements') {
            const c = { select: () => c, in: () => c, gt: () => c, limit: async () => ({ data: [{ module_key: 'concierge' }], error: null }) }
            return c
          }
          if (table === 'ghg_inventories') {
            let id = ''
            const c = {
              select: () => c,
              eq: (_k: string, v: string) => { id = v; return c },
              // RLS: the caller's own rows only. The fixture holds only the caller's inventories.
              maybeSingle: async () => ({ data: h.invError ? null : h.inventories[id] ?? null, error: h.invError }),
            }
            return c
          }
          throw new Error(`unexpected table ${table}`)
        },
        storage: { from: (bucket: string) => { if (bucket !== 'source-documents') throw new Error(bucket); return { download: h.download } } },
      },
    }),
  }
})

import { POST } from './route'
import { HUMAN_READ_REFUSAL, OLD_PATH_REFUSAL } from '../../../../lib/ghg/billReviewReading'
import { buildUploadPath } from '../../../../lib/ghg/uploadPath'

const model = vi.fn(async () => new Response(JSON.stringify({
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '[{"fuelType":"electricity","value":4210,"unit":"kWh","periodStart":"2025-01-01","periodEnd":"2025-01-31","periodConfidence":"high","sourceQuote":"Total usage 4,210 kWh","confidence":"high","notes":null}]' }],
  stop_reason: 'end_turn', model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1 },
}), { status: 200 }))

const path = (user = USER, inv = INV) => buildUploadPath(user, inv, 2025, 'Leeds', 1760000000000, 'jan.pdf')
const req = (body: Record<string, unknown>) => new Request('http://x/api/concierge/extract', {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer token' }, body: JSON.stringify(body),
}) as never
const call = (body: Record<string, unknown>) => POST(req({ mediaType: 'application/pdf', locationName: 'Leeds', ...body }))
const nothingSent = () => { expect(h.download).not.toHaveBeenCalled(); expect(model).not.toHaveBeenCalled() }

beforeEach(() => {
  h.inventories = { [INV]: { id: INV, bill_review_reading: 'ai' }, [INV2]: { id: INV2, bill_review_reading: 'ai' } }
  h.invError = null
  h.download.mockClear()
  model.mockClear()
  vi.stubGlobal('fetch', model)
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-not-real')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('BR2: refusals come before the file is fetched or the model is called', () => {
  it('a human-read inventory: 409, the file is never fetched and the model never called', async () => {
    h.inventories[INV].bill_review_reading = 'human'
    const res = await call({ filePath: path(), inventoryId: INV })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(HUMAN_READ_REFUSAL)
    nothingSent()
  })
  it('an AI-read inventory proceeds: the file is fetched and the model called, once each', async () => {
    const res = await call({ filePath: path(), inventoryId: INV })
    expect(res.status).toBe(200)
    expect(h.download).toHaveBeenCalledTimes(1)
    expect(model).toHaveBeenCalledTimes(1)
  })
  it('a path naming a different inventory: 403', async () => {
    const res = await call({ filePath: path(USER, INV2), inventoryId: INV })
    expect(res.status).toBe(403)
    nothingSent()
  })
  it('a path naming another user: 403', async () => {
    const res = await call({ filePath: path(OTHER, INV), inventoryId: INV })
    expect(res.status).toBe(403)
    nothingSent()
  })
  it('an inventory the caller cannot read (RLS returns none): 403', async () => {
    const STRANGER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const res = await call({ filePath: path(USER, STRANGER), inventoryId: STRANGER })
    expect(res.status).toBe(403)
    nothingSent()
  })
  it('an old-format path (no inventory in it): 400, with the save-then-upload message', async () => {
    const res = await call({ filePath: `${USER}/2025/Leeds/1760000000000_jan.pdf`, inventoryId: INV })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(OLD_PATH_REFUSAL)
    nothingSent()
  })
  it('the base64 fallback is gone: a document in the body is refused, with or without a path', async () => {
    for (const body of [{ document: 'JVBERi0=' }, { document: 'JVBERi0=', filePath: path(), inventoryId: INV }]) {
      expect((await call(body)).status).toBe(400)
    }
    nothingSent()
  })
  it('no path, or no inventory id: 400', async () => {
    expect((await call({ inventoryId: INV })).status).toBe(400)
    expect((await call({ filePath: path() })).status).toBe(400)
    nothingSent()
  })
  it('the reading cannot be read: 503, fails closed', async () => {
    h.invError = { message: 'column "bill_review_reading" does not exist' }
    expect((await call({ filePath: path(), inventoryId: INV })).status).toBe(503)
    nothingSent()
  })
  it('a reading that is neither ai nor human is refused as not ai: 409', async () => {
    for (const v of [null, undefined, 'AI', 'robot']) {
      h.inventories[INV].bill_review_reading = v
      expect((await call({ filePath: path(), inventoryId: INV })).status).toBe(409)
    }
    nothingSent()
  })
  it('every refusal is logged with metadata only: never the path or the file name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    h.inventories[INV].bill_review_reading = 'human'
    await call({ filePath: path(), inventoryId: INV })
    await call({ filePath: path(OTHER, INV), inventoryId: INV })
    await call({ filePath: `${USER}/2025/Leeds/1_jan.pdf`, inventoryId: INV })
    expect(warn).toHaveBeenCalledTimes(3)
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).not.toContain('jan.pdf')
    expect(logged).not.toContain('Leeds')
    expect(warn.mock.calls.map(c => (c[1] as { reason: string }).reason)).toEqual(['human_read', 'path_other_user', 'old_format_path'])
  })
})

describe('BR2: a parse failure logs and returns metadata only', () => {
  it('no model text in the log or the response', async () => {
    model.mockImplementationOnce(async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'Total usage 4,210 kWh, not JSON' }], stop_reason: 'end_turn',
    }), { status: 200 }))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call({ filePath: path(), inventoryId: INV })
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({ error: 'Could not parse extraction result' })
    expect(JSON.stringify(err.mock.calls)).not.toContain('4,210')
  })
})

// THE PROPERTY. For every (reading at upload, reading asked for now), mirror what the database allows (the trigger in
// 20261011_bill_review_reading.sql refuses human to ai, so the inventory stays human), then ask the route. A bill
// uploaded while the inventory was human-read is never extracted. lib/ghg/br1Sql.test.ts pins the trigger rule this mirrors.
const stored = (atUpload: 'ai' | 'human', now: 'ai' | 'human') => (atUpload === 'human' && now === 'ai' ? 'human' : now)
describe('BR2 property: a bill uploaded under human reading is never extracted', () => {
  for (const atUpload of ['ai', 'human'] as const) for (const now of ['ai', 'human'] as const) {
    it(`uploaded ${atUpload}, now ${now}`, async () => {
      h.inventories[INV].bill_review_reading = stored(atUpload, now)
      const res = await call({ filePath: path(), inventoryId: INV })
      const extracted = res.status === 200
      if (atUpload === 'human') { expect(extracted).toBe(false); nothingSent() }
      expect(extracted).toBe(stored(atUpload, now) === 'ai')
    })
  }
})
