// lib/staff/access.test.ts
//
// BR3: the staff role check and the access log. Supabase is mocked; the helpers are real.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = { user_id: string; role: string; revoked_at: string | null }
const h = vi.hoisted(() => ({
  roles: [] as Row[],
  roleError: null as { message: string } | null,
  logError: null as { message: string } | null,
  calls: [] as string[],
  logged: [] as Record<string, unknown>[],
  ttl: [] as number[],
  sessionUser: 'staff-1' as string | null,
}))

vi.mock('../supabaseAuthed', () => {
  class AuthError extends Error {}
  return {
    AuthError,
    getAuthedClient: async (token: string | null) => {
      if (!token || !h.sessionUser) throw new AuthError('Invalid or expired session')
      return { userId: h.sessionUser, supabase: {}, email: undefined }
    },
  }
})
vi.mock('../supabase', () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === 'staff_roles') {
        const f: Record<string, unknown> = {}
        const q = {
          select: () => q,
          eq: (k: string, v: unknown) => { f[k] = v; return q },
          is: (k: string, v: unknown) => { f[`${k}:is`] = v; return q },
          limit: async () => {
            h.calls.push('read_role')
            if (h.roleError) return { data: null, error: h.roleError }
            const rows = h.roles.filter(r => r.user_id === f.user_id && r.role === f.role && (f['revoked_at:is'] === null ? r.revoked_at === null : true))
            return { data: rows, error: null }
          },
        }
        return q
      }
      if (table === 'staff_access_log') {
        return { insert: async (row: Record<string, unknown>) => { h.calls.push('log'); if (h.logError) return { error: h.logError }; h.logged.push(row); return { error: null } } }
      }
      throw new Error(`unexpected table ${table}`)
    },
    storage: { from: () => ({ createSignedUrl: async (path: string, ttl: number) => { h.calls.push('sign'); h.ttl.push(ttl); return { data: { signedUrl: `https://signed/${path}` }, error: null } } }) },
  }),
}))

import { requireStaffRole, logStaffAccess, signStaffDocument, STAFF_ONLY, STAFF_SIGNED_URL_TTL_SECONDS, StaffLogError } from './access'

beforeEach(() => {
  h.roles = [{ user_id: 'staff-1', role: 'bill_reader', revoked_at: null }]
  h.roleError = null; h.logError = null; h.calls = []; h.logged = []; h.ttl = []; h.sessionUser = 'staff-1'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('requireStaffRole', () => {
  it('the role held and not revoked: allowed, as that user and role', async () => {
    const r = await requireStaffRole('token', 'bill_reader')
    expect(r.ok).toBe(true)
    if (r.ok) expect([r.userId, r.role]).toEqual(['staff-1', 'bill_reader'])
  })
  it('403 without the role', async () => {
    expect(await requireStaffRole('token', 'bill_review_lead')).toEqual({ ok: false, status: 403, body: { error: 'staff_only', message: STAFF_ONLY } })
  })
  it('403 with a revoked role, in the same words as never granted', async () => {
    h.roles = [{ user_id: 'staff-1', role: 'bill_reader', revoked_at: '2026-10-09T10:00:00Z' }]
    expect(await requireStaffRole('token', 'bill_reader')).toEqual({ ok: false, status: 403, body: { error: 'staff_only', message: STAFF_ONLY } })
  })
  it('another user’s role does not count', async () => {
    h.sessionUser = 'customer-9'
    expect((await requireStaffRole('token', 'bill_reader')).ok).toBe(false)
  })
  it('401 with no session or an invalid one, before any role is read', async () => {
    expect((await requireStaffRole(null, 'bill_reader')) as unknown).toMatchObject({ ok: false, status: 401 })
    h.sessionUser = null
    expect((await requireStaffRole('token', 'bill_reader')) as unknown).toMatchObject({ ok: false, status: 401 })
    expect(h.calls).toEqual([])
  })
  it('503 when the role cannot be read: fails closed', async () => {
    h.roleError = { message: 'boom' }
    expect((await requireStaffRole('token', 'bill_reader')) as unknown).toMatchObject({ ok: false, status: 503 })
  })
})

describe('the access log, and a document only after its row is written', () => {
  const staff = async () => { const r = await requireStaffRole('token', 'bill_reader'); if (!r.ok) throw new Error('no staff'); return r }
  it('a document view writes its log row first, then signs a 5-minute URL', async () => {
    const s = await staff()
    h.calls = []
    const url = await signStaffDocument(s, { path: 'u/inv/2025/Leeds/1_jan.pdf', inventoryId: 'inv' })
    expect(url).toBe('https://signed/u/inv/2025/Leeds/1_jan.pdf')
    expect(h.calls).toEqual(['log', 'sign'])
    expect(h.logged).toEqual([{ staff_user_id: 'staff-1', role: 'bill_reader', action: 'view_document', document_ref: 'u/inv/2025/Leeds/1_jan.pdf', inventory_id: 'inv' }])
    expect(h.ttl).toEqual([300])
    expect(STAFF_SIGNED_URL_TTL_SECONDS).toBe(300)
  })
  it('a failed log write fails the view: nothing is signed', async () => {
    const s = await staff()
    h.logError = { message: 'insert refused' }
    h.calls = []
    await expect(signStaffDocument(s, { path: 'u/inv/2025/Leeds/1_jan.pdf', inventoryId: 'inv' })).rejects.toBeInstanceOf(StaffLogError)
    expect(h.calls).toEqual(['log'])
  })
  it('logStaffAccess throws on a failed write, and logs metadata only', async () => {
    const s = await staff()
    h.logError = { message: 'insert refused' }
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(logStaffAccess(s, { action: 'view_document', documentRef: 'u/inv/secret.pdf', inventoryId: 'inv' })).rejects.toBeInstanceOf(StaffLogError)
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret.pdf')
  })
})
