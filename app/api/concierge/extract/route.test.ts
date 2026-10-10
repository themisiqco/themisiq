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
  inventories: {} as Record<string, { id: string; bill_review_reading: unknown; bill_review_reading_set_at?: string | null }>,
  invError: null as { message: string } | null,
  // BR4: submission records by file_path, and each stored object's creation time.
  submitted: new Set<string>(),
  subError: null as { message: string } | null,
  created: {} as Record<string, string | undefined>,
  listError: null as { message: string } | null,
  lists: 0,
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
          if (table === 'bill_review_documents') {
            let fp = ''
            const c = {
              select: () => c,
              eq: (_k: string, v: string) => { fp = v; return c },
              limit: async () => ({ data: h.subError ? null : (h.submitted.has(fp) ? [{ id: 'sub-1' }] : []), error: h.subError }),
            }
            return c
          }
          throw new Error(`unexpected table ${table}`)
        },
        storage: { from: (bucket: string) => {
          if (bucket !== 'source-documents') throw new Error(bucket)
          return {
            download: h.download,
            list: async (dir: string, opts: { search: string }) => {
              h.lists++
              if (h.listError) return { data: null, error: h.listError }
              const full = `${dir}/${opts.search}`
              return { data: h.created[full] === undefined ? [] : [{ name: opts.search, created_at: h.created[full] }], error: null }
            },
          }
        } },
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
  h.submitted = new Set(); h.subError = null; h.created = {}; h.listError = null; h.lists = 0
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

describe('BR4: a bill sent to the team never reaches the AI, even after a switch to AI', () => {
  const SWITCHED = '2026-10-20T12:00:00Z'
  it('(a) a bill with a submission record: 409, nothing fetched, the model not called', async () => {
    h.submitted.add(path())
    const res = await call({ filePath: path(), inventoryId: INV })
    expect(res.status).toBe(409)
    expect((await res.json()).reason).toBe('submitted_for_human_reading')
    nothingSent()
  })
  it('(a) after a switch to AI, a submitted bill is still refused', async () => {
    h.inventories[INV].bill_review_reading_set_at = SWITCHED
    h.created[path()] = '2026-10-21T09:00:00Z'   // even one stored after the switch
    h.submitted.add(path())
    expect((await call({ filePath: path(), inventoryId: INV })).status).toBe(409)
    nothingSent()
  })
  it('(b) a bill stored before the switch, with no submission record: 409', async () => {
    h.inventories[INV].bill_review_reading_set_at = SWITCHED
    h.created[path()] = '2026-10-19T09:00:00Z'
    const res = await call({ filePath: path(), inventoryId: INV })
    expect(res.status).toBe(409)
    expect((await res.json()).reason).toBe('uploaded_before_switch')
    nothingSent()
  })
  it('(b) a bill stored after the switch proceeds', async () => {
    h.inventories[INV].bill_review_reading_set_at = SWITCHED
    h.created[path()] = '2026-10-21T09:00:00Z'
    expect((await call({ filePath: path(), inventoryId: INV })).status).toBe(200)
    expect(model).toHaveBeenCalledTimes(1)
  })
  it('(b) the creation time cannot be read: 503, fails closed, nothing fetched, the model not called', async () => {
    h.inventories[INV].bill_review_reading_set_at = SWITCHED
    h.listError = { message: 'storage down' }
    const res = await call({ filePath: path(), inventoryId: INV })
    expect(res.status).toBe(503)
    expect((await res.json()).reason).toBe('upload_time_unknown')
    nothingSent()
    h.listError = null   // and an object storage does not list
    expect((await call({ filePath: path(), inventoryId: INV })).status).toBe(503)
    nothingSent()
  })
  it('(b) is not consulted for an inventory whose reading never changed', async () => {
    await call({ filePath: path(), inventoryId: INV })
    expect(h.lists).toBe(0)
  })
  it('the submission record cannot be read: 503, fails closed', async () => {
    h.subError = { message: 'boom' }
    expect((await call({ filePath: path(), inventoryId: INV })).status).toBe(503)
    nothingSent()
  })
})

// THE PROPERTY, as BR4 leaves it. For every (reading at upload, reading now), and whether the submission landed: a bill
// uploaded while the inventory was human-read is recorded (the page submits it) and stored before any later switch;
// the route refuses it either way. A change of reading after the upload stamps bill_review_reading_set_at after it.
describe('BR4 property: a bill uploaded under human reading is never extracted, whatever the reading now', () => {
  const UPLOADED = '2026-10-19T09:00:00Z', CHANGED = '2026-10-20T12:00:00Z'
  for (const atUpload of ['ai', 'human'] as const) for (const now of ['ai', 'human'] as const) for (const landed of [true, false]) {
    if (atUpload === 'ai' && !landed) continue   // an AI-read upload is never submitted
    it(`uploaded ${atUpload}, now ${now}${atUpload === 'human' ? (landed ? ', submission recorded' : ', submission lost') : ''}`, async () => {
      h.inventories[INV].bill_review_reading = now
      h.inventories[INV].bill_review_reading_set_at = now !== atUpload ? CHANGED : null
      h.created[path()] = UPLOADED
      if (atUpload === 'human' && landed) h.submitted.add(path())
      const res = await call({ filePath: path(), inventoryId: INV })
      const extracted = res.status === 200
      if (atUpload === 'human') { expect(extracted).toBe(false); nothingSent() }
      expect(extracted).toBe(atUpload === 'ai' && now === 'ai')
    })
  }
})
