import { describe, it, expect, vi, beforeEach } from 'vitest'

// ENF2 (L0, Oct 2026): the guide checks that the GHG plan is ACTIVE (term_end after now), not merely that a ghg row
// exists. Until then an expired customer kept the guide, and its paid model calls, indefinitely.

let entRow: { module_key: string; term_end: string | null } | null = null
let entError: { message: string } | null = null
let signedIn = true

vi.mock('../../../lib/supabaseAuthed', () => {
  class AuthError extends Error {}
  return {
    AuthError,
    bearerFrom: () => (signedIn ? 'token' : null),
    getAuthedClient: async () => {
      if (!signedIn) throw new AuthError('Missing access token')
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: entRow, error: entError }),
      }
      return { supabase: { from: () => chain }, userId: 'user-1', email: 'a@b.co' }
    },
  }
})
vi.mock('../../../lib/rateLimit', () => ({
  checkAndRecordRateLimit: async () => ({ ok: true }),
  ipFromHeaders: () => '127.0.0.1',
}))

import { POST } from './route'

const DAY = 86_400_000
const req = () => new Request('http://localhost/api/ghg-bot', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
  body: JSON.stringify({ currentStep: 0, messages: [{ role: 'user', content: 'What is Scope 2?' }] }),
}) as never

const fetchMock = vi.fn(async () => new Response(JSON.stringify({
  content: [{ type: 'text', text: 'Scope 2 is purchased energy.' }],
  stop_reason: 'end_turn',
}), { status: 200, headers: { 'content-type': 'application/json' } }))

describe('/api/ghg-bot entitlement (ENF2)', () => {
  beforeEach(() => {
    signedIn = true
    entRow = null
    entError = null
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real'
  })

  it('B1: signed out → 401 unauthenticated, no model call', async () => {
    signedIn = false
    const res = await POST(req())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('B2: never bought (no ghg row) → 403 entitlement_required, no model call', async () => {
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'entitlement_required' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('B3: expired plan → 403 entitlement_expired, no model call', async () => {
    entRow = { module_key: 'ghg', term_end: new Date(Date.now() - DAY).toISOString() }
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'entitlement_expired' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('B4: active plan → the model is called and the reply comes back', async () => {
    entRow = { module_key: 'ghg', term_end: new Date(Date.now() + 30 * DAY).toISOString() }
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((await res.json()).reply).toBe('Scope 2 is purchased energy.')
  })

  it('B5: a failed read, or a term_end that cannot be read, fails closed with 503', async () => {
    entError = { message: 'boom' }
    expect((await POST(req())).status).toBe(503)
    entError = null
    entRow = { module_key: 'ghg', term_end: null }
    const res = await POST(req())
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'entitlement_check_failed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('B6: the wizard has a plain message for the expired code', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const page = readFileSync(join(__dirname, '..', '..', 'dashboard', 'ghg', 'page.tsx'), 'utf8')
    expect(page).toContain("entitlement_expired:\n    'Your GHG access has expired, so the guide is off until you renew.',")
  })
})
