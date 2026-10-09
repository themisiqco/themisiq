// app/api/verifier-documents/route.test.ts
//
// T16: the GHG verifier document routes apply exactly the RPC's checks (token, active, not expired, not revoked,
// consent accepted, pinned) and read documents from the pinned version only. /sign refuses any document that is not
// in the pinned version, and one deleted since. Supabase is mocked; the routes, the grant check and the pinned
// document logic are real.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>
const h = vi.hoisted(() => ({
  grant: null as Row | null,
  versions: [] as Row[],
  inventory: null as Row | null,
  signed: [] as string[],
  reads: [] as string[],
}))

vi.mock('../../../lib/supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const q = {
        select: (cols: string) => { h.reads.push(`${table}:${cols}`); return q },
        eq: (col: string, val: unknown) => { filters[col] = val; return q },
        single: async () => {
          if (table === 'verifier_access') {
            const g = h.grant
            const ok = g && g.token === filters.token && g.status === filters.status
            return ok ? { data: g, error: null } : { data: null, error: { message: 'no rows' } }
          }
          if (table === 'ghg_inventory_versions') {
            const v = h.versions.find(r => r.id === filters.id && r.inventory_id === filters.inventory_id)
            return v ? { data: v, error: null } : { data: null, error: { message: 'no rows' } }
          }
          if (table === 'ghg_inventories') {
            const i = h.inventory
            return i && i.id === filters.id ? { data: i, error: null } : { data: null, error: { message: 'no rows' } }
          }
          throw new Error(`unexpected table ${table}`)
        },
      }
      return q
    },
    storage: { from: () => ({ createSignedUrl: async (path: string) => { h.signed.push(path); return { data: { signedUrl: `https://signed/${path}` }, error: null } } }) },
  }),
}))

import { POST as list } from './route'
import { POST as sign } from './sign/route'

const doc = (id: string, file: string) => ({ id, file_name: file, file_path: `u/inv-1/${file}`, document_type: 'electricity_bill' })
const req = (body: unknown) => new Request('http://x/api', { method: 'POST', body: JSON.stringify(body) }) as never
const future = new Date(Date.now() + 86_400_000).toISOString()

beforeEach(() => {
  h.grant = { token: 'tok', inventory_id: 'inv-1', inventory_version_id: 'ver-1', status: 'active', expires_at: future, revoked_at: null, accepted_at: '2026-10-01T00:00:00Z' }
  h.versions = [
    { id: 'ver-1', inventory_id: 'inv-1', snapshot: { locations_data: [{ name: 'Leeds', source_docs: [doc('d1', 'jan.pdf'), doc('d2', 'feb.pdf')] }] } },
    // Another inventory's version: no token for inv-1 may reach it.
    { id: 'ver-x', inventory_id: 'inv-2', snapshot: { locations_data: [{ name: 'Other', source_docs: [doc('dx', 'secret.pdf')] }] } },
  ]
  // Live: feb.pdf deleted since, new.pdf uploaded since.
  h.inventory = {
    id: 'inv-1',
    locations_data: [{ name: 'Leeds', source_docs: [doc('d1', 'jan.pdf'), doc('d9', 'new.pdf')],
      document_log: [{ kind: 'deleted', docId: 'd2', file: 'feb.pdf', at: '2026-10-05T09:00:00Z', by: { email: 'jo@acme.example' }, reason: 'Wrong site' }] }],
    location_log: [],
  }
  h.signed = []
  h.reads = []
})

describe('the same checks as get_verifier_inventory, on both routes', () => {
  const cases: [string, () => void, string][] = [
    ['inactive', () => { h.grant!.status = 'revoked' }, 'invalid_or_expired'],
    ['expired', () => { h.grant!.expires_at = '2020-01-01T00:00:00Z' }, 'invalid_or_expired'],
    ['revoked', () => { h.grant!.revoked_at = '2026-10-02T00:00:00Z' }, 'invalid_or_expired'],
    ['before consent', () => { h.grant!.accepted_at = null }, 'consent_required'],
    ['unpinned', () => { h.grant!.inventory_version_id = null }, 'version_missing'],
  ]
  for (const [name, set, error] of cases) {
    it(`${name}: refused with ${error}, nothing listed and nothing signed`, async () => {
      set()
      for (const res of [await list(req({ token: 'tok' })), await sign(req({ token: 'tok', docId: 'd1' }))]) {
        expect(res.status).toBe(403)
        expect(await res.json()).toEqual({ error })
      }
      expect(h.signed).toEqual([])
      expect(h.reads.filter(r => !r.startsWith('verifier_access'))).toEqual([])
    })
  }
  it('a grant pinned to another inventory\'s version reaches nothing (version_missing)', async () => {
    h.grant!.inventory_version_id = 'ver-x'
    const res = await sign(req({ token: 'tok', docId: 'dx' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'version_missing' })
    expect(h.signed).toEqual([])
  })
})

describe('/api/verifier-documents lists the pinned version\'s documents', () => {
  it('the version\'s documents, the deleted one with its note, nothing added since, and no file_path', async () => {
    const res = await list(req({ token: 'tok' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toEqual([
      { id: 'd1', file_name: 'jan.pdf', document_type: 'electricity_bill', location: 'Leeds', status: 'available' },
      { id: 'd2', file_name: 'feb.pdf', document_type: 'electricity_bill', location: 'Leeds', status: 'deleted',
        deleted_note: 'feb.pdf was deleted from the inventory by jo@acme.example on 5 October 2026, after this version was saved. Reason: Wrong site. The file is no longer held, so it cannot be opened.' },
    ])
    expect(JSON.stringify(body)).not.toContain('file_path')
    expect(h.reads).toContain('ghg_inventory_versions:snapshot')
  })
})

describe('/api/verifier-documents/sign signs only a document of the pinned version', () => {
  it('a document in the version and still held: signed by the version\'s path', async () => {
    const res = await sign(req({ token: 'tok', docId: 'd1' }))
    expect(res.status).toBe(200)
    expect(h.signed).toEqual(['u/inv-1/jan.pdf'])
  })
  it('a document uploaded after the version was shared is not in it: refused, 404', async () => {
    const res = await sign(req({ token: 'tok', docId: 'd9' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(h.signed).toEqual([])
  })
  it('another inventory\'s document: refused, 404', async () => {
    const res = await sign(req({ token: 'tok', docId: 'dx' }))
    expect(res.status).toBe(404)
    expect(h.signed).toEqual([])
  })
  it('a document deleted since the version was saved: refused, 410, with the note', async () => {
    const res = await sign(req({ token: 'tok', docId: 'd2' }))
    expect(res.status).toBe(410)
    const body = await res.json()
    expect(body.error).toBe('deleted')
    expect(body.message).toContain('feb.pdf was deleted from the inventory by jo@acme.example on 5 October 2026')
    expect(h.signed).toEqual([])
  })
})
