import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  convertFreeInventoryOnPurchase, checkoutSuccessPath, purchaseLine, PURCHASE_COPY, initialPurchaseState, startConversionPoll,
  POLL_INTERVAL_MS, POLL_TIMEOUT_MS,
} from './convertOnPurchase'

// LEAD1 L8 (Oct 2026): the free calculation becomes the customer's first inventory on purchase. The webhook is driven
// for real (app/api/webhooks/stripe/route.ts POST), with Stripe's signature check and the service-role client
// replaced by in-memory fakes, so these tests exercise the actual order of writes.

type Row = Record<string, unknown>
const db = vi.hoisted(() => ({
  tables: { entitlements: [] as Row[], ghg_inventories: [] as Row[], purchase_consents: [] as Row[] } as Record<string, Row[]>,
  failUpdate: null as null | 'error' | 'throw',
}))

vi.mock('../stripe', () => ({ getStripe: () => ({ webhooks: { constructEvent: (raw: string) => JSON.parse(raw) } }) }))
vi.mock('../supabaseAdmin', () => {
  class Q {
    filters: Array<[string, unknown, 'eq' | 'in']> = []
    op: 'select' | 'update' | 'upsert' = 'select'
    payload: unknown
    orderCol: string | null = null
    asc = true
    lim: number | null = null
    constructor(public table: string) {}
    select() { return this }
    eq(c: string, v: unknown) { this.filters.push([c, v, 'eq']); return this }
    in(c: string, v: unknown) { this.filters.push([c, v, 'in']); return this }
    order(c: string, o?: { ascending?: boolean }) { this.orderCol = c; this.asc = o?.ascending !== false; return this }
    limit(n: number) { this.lim = n; return this }
    update(p: unknown) { this.op = 'update'; this.payload = p; return this }
    upsert(p: unknown) { this.op = 'upsert'; this.payload = p; return this }
    match(r: Row) { return this.filters.every(([c, v, k]) => (k === 'in' ? (v as unknown[]).includes(r[c]) : r[c] === v)) }
    run() {
      const rows = db.tables[this.table] ?? (db.tables[this.table] = [])
      if (this.op === 'upsert') {
        for (const n of ([] as Row[]).concat(this.payload as Row[])) {
          const i = this.table === 'entitlements' ? rows.findIndex(r => r.user_id === n.user_id && r.module_key === n.module_key) : -1
          if (i >= 0) rows[i] = { ...rows[i], ...n }; else rows.push({ ...n })
        }
        return { data: null, error: null }
      }
      if (this.op === 'update') {
        if (this.table === 'ghg_inventories' && db.failUpdate === 'throw') throw new Error('connection reset')
        if (this.table === 'ghg_inventories' && db.failUpdate === 'error') return { data: null, error: { message: 'permission denied for column free_tier' } }
        const hit = rows.filter(r => this.match(r))
        hit.forEach(r => Object.assign(r, this.payload as Row))
        return { data: hit.map(r => ({ id: r.id })), error: null }
      }
      let out = rows.filter(r => this.match(r))
      if (this.orderCol) { const c = this.orderCol; out = [...out].sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (this.asc ? 1 : -1)) }
      if (this.lim !== null) out = out.slice(0, this.lim)
      return { data: out.map(r => ({ ...r })), error: null }
    }
    then(res: (v: unknown) => unknown, rej: (e: unknown) => unknown) { try { return Promise.resolve(res(this.run())) } catch (e) { return Promise.resolve(rej(e)) } }
  }
  return { getSupabaseAdmin: () => ({ from: (t: string) => new Q(t) }) }
})

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
let POST: (req: never) => Promise<Response>

beforeAll(async () => {
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_not_real')
  POST = (await import('../../app/api/webhooks/stripe/route')).POST as never
})
afterAll(() => { vi.unstubAllEnvs() })

const inv = (id: string, user: string, free: boolean, created = '2026-10-01T00:00:00Z'): Row => ({
  id, user_id: user, free_tier: free, created_at: created, company_name: 'Acme', reporting_year: 2025,
  scope1_total: 6.374, scope2_location_total: 19.812, scope2_market_total: 19.812,
  locations_data: [{ id: '1', name: 'Chicago plant', country: 'US', grid_region: 'US_IL', electricity_kwh: 85000 }],
  workings: [{ location: 'Chicago plant', scope: 2, result_tco2e: 18.292 }],
})
const deliver = async (user: string, entitlements = 'ghg') => {
  const event = { type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', payment_intent: 'pi_1', metadata: { user_id: user, entitlements, ghg_tier: 'starter' } } } }
  const res = await POST(new Request('https://www.themisiq.co/api/webhooks/stripe', { method: 'POST', body: JSON.stringify(event), headers: { 'stripe-signature': 't=1,v1=x' } }) as never)
  return { status: res.status, body: await res.json() }
}
const rowsOf = (t: string) => db.tables[t]
const entitlementFor = (user: string) => rowsOf('entitlements').find(r => r.user_id === user && r.module_key === 'ghg')

beforeEach(() => {
  db.tables = { entitlements: [], ghg_inventories: [], purchase_consents: [] }
  db.failUpdate = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the webhook converts the free calculation', () => {
  it('C1: the buying user’s free row, and only theirs, becomes a paid inventory', async () => {
    db.tables.ghg_inventories = [inv('f1', 'u1', true), inv('f2', 'u2', true)]
    expect(await deliver('u1')).toEqual({ status: 200, body: { received: true } })
    expect(rowsOf('ghg_inventories').find(r => r.id === 'f1')!.free_tier).toBe(false)
    expect(rowsOf('ghg_inventories').find(r => r.id === 'f2')!.free_tier).toBe(true)
    expect(entitlementFor('u1')).toBeTruthy()
  })

  it('C2: a second delivery changes nothing and does not fail', async () => {
    db.tables.ghg_inventories = [inv('f1', 'u1', true)]
    await deliver('u1')
    const after = JSON.parse(JSON.stringify(rowsOf('ghg_inventories')))
    expect(await deliver('u1')).toEqual({ status: 200, body: { received: true } })
    expect(rowsOf('ghg_inventories')).toEqual(after)
  })

  it('C3: a user with no free row is unaffected, and the entitlement still lands', async () => {
    db.tables.ghg_inventories = [inv('f2', 'u2', true)]
    expect(await deliver('u1')).toEqual({ status: 200, body: { received: true } })
    expect(entitlementFor('u1')).toMatchObject({ module_key: 'ghg', ghg_tier: 'starter' })
    expect(rowsOf('ghg_inventories')).toEqual([inv('f2', 'u2', true)])
  })

  it('C4: a user with a paid row and no free row: the paid row is untouched', async () => {
    db.tables.ghg_inventories = [inv('p1', 'u1', false)]
    await deliver('u1')
    expect(rowsOf('ghg_inventories')).toEqual([inv('p1', 'u1', false)])
  })

  it('C5: a failure to convert does not fail the webhook or lose the entitlement; the row stays free', async () => {
    for (const mode of ['error', 'throw'] as const) {
      db.tables = { entitlements: [], ghg_inventories: [inv('f1', 'u1', true)], purchase_consents: [] }
      db.failUpdate = mode
      expect(await deliver('u1'), mode).toEqual({ status: 200, body: { received: true } })
      expect(entitlementFor('u1'), mode).toBeTruthy()
      expect(rowsOf('ghg_inventories')[0].free_tier, mode).toBe(true)
    }
  })

  it('C6: the figures and site data on the row are unchanged by the conversion', async () => {
    db.tables.ghg_inventories = [inv('f1', 'u1', true)]
    await deliver('u1')
    expect(rowsOf('ghg_inventories')[0]).toEqual({ ...inv('f1', 'u1', true), free_tier: false })
  })

  it('C7: exactly one row, the oldest, even if the data somehow holds two free rows', async () => {
    db.tables.ghg_inventories = [inv('newer', 'u1', true, '2026-10-03T00:00:00Z'), inv('older', 'u1', true, '2026-10-01T00:00:00Z')]
    await deliver('u1')
    expect(rowsOf('ghg_inventories').find(r => r.id === 'older')!.free_tier).toBe(false)
    expect(rowsOf('ghg_inventories').find(r => r.id === 'newer')!.free_tier).toBe(true)
  })

  it('C8: a purchase without GHG does not touch the free calculation', async () => {
    db.tables.ghg_inventories = [inv('f1', 'u1', true)]
    await deliver('u1', 'supply-chain')
    expect(rowsOf('ghg_inventories')[0].free_tier).toBe(true)
  })

  it('C9: the conversion runs after the entitlement is written (the gate allows the flip only with an active plan)', () => {
    const src = read('app/api/webhooks/stripe/route.ts')
    const upsert = src.indexOf(".upsert(rows, { onConflict: 'user_id,module_key' })")
    const convert = src.indexOf('await convertFreeInventoryOnPurchase(userId, keys, {')
    expect(upsert).toBeGreaterThan(0)
    expect(convert).toBeGreaterThan(upsert)
    // Only free_tier is written, which is the one column the service role may update (L1-M1).
    expect(src).toContain(".update({ free_tier: false })\n        .eq('id', id).eq('user_id', uid).eq('free_tier', true).select('id')")
  })

  it('C10: the service reports each outcome and never throws', async () => {
    expect(await convertFreeInventoryOnPurchase('u1', ['supply-chain'], { findFreeInventory: async () => { throw new Error('no') }, markPaid: async () => ({ updated: 1 }) })).toEqual({ status: 'not_ghg' })
    expect(await convertFreeInventoryOnPurchase('u1', ['ghg'], { findFreeInventory: async () => null, markPaid: async () => ({ updated: 1 }) })).toEqual({ status: 'none' })
    expect(await convertFreeInventoryOnPurchase('u1', ['ghg'], { findFreeInventory: async () => ({ id: 'f1' }), markPaid: async () => ({ updated: 0 }) })).toEqual({ status: 'already', id: 'f1' })
    expect(await convertFreeInventoryOnPurchase('u1', ['ghg'], { findFreeInventory: async () => ({ error: 'x' }), markPaid: async () => ({ updated: 1 }) })).toMatchObject({ status: 'failed' })
    expect(await convertFreeInventoryOnPurchase('u1', ['ghg'], { findFreeInventory: async () => { throw new Error('boom') }, markPaid: async () => ({ updated: 1 }) })).toMatchObject({ status: 'failed', reason: 'boom' })
  })
})

describe('where the buyer lands', () => {
  it('C11: with a free calculation, on that inventory; without one, /dashboard as before', () => {
    expect(checkoutSuccessPath({ ghgInCart: true, freeInventoryId: 'f1' })).toBe('/dashboard/ghg?id=f1&purchase=success&session_id={CHECKOUT_SESSION_ID}')
    expect(checkoutSuccessPath({ ghgInCart: true, freeInventoryId: null })).toBe('/dashboard?purchase=success&session_id={CHECKOUT_SESSION_ID}')
    expect(checkoutSuccessPath({ ghgInCart: false, freeInventoryId: 'f1' })).toBe('/dashboard?purchase=success&session_id={CHECKOUT_SESSION_ID}')
    const src = read('app/api/checkout/route.ts')
    expect(src).toContain("success_url: `${origin}${checkoutSuccessPath({ ghgInCart: entitlementsToGrant.has('ghg'), freeInventoryId })}`,")
    expect(src).toContain(".from('ghg_inventories').select('id').eq('free_tier', true).limit(1)")
  })

  it('C12: the landing starts from the row as loaded: converted, or waiting while it is still free; nothing without purchase=success', () => {
    expect(initialPurchaseState('success', false)).toBe('converted')
    expect(initialPurchaseState('success', true)).toBe('waiting')
    expect(initialPurchaseState(null, true)).toBe('none')
    expect(purchaseLine('converted')).toBe(PURCHASE_COPY.converted)
    expect(purchaseLine('waiting')).toBe(PURCHASE_COPY.waiting)
    expect(purchaseLine('slow')).toBe(PURCHASE_COPY.slow)
    expect(purchaseLine('none')).toBeNull()
    expect(read('app/dashboard/ghg/page.tsx')).toContain("setPurchaseState(initialPurchaseState(searchParams.get('purchase'), data.free_tier === true))")
  })
})

// L8-fix1: the purchase landing re-checks by itself, read only, every 2 s for up to 20 s.
describe('the purchase landing re-check', () => {
  afterEach(() => { vi.useRealTimers() })
  const poll = (results: boolean[]) => {
    vi.useFakeTimers()
    const calls = { checks: 0, converted: 0, timeout: 0 }
    const handle = startConversionPoll({
      check: async () => { const c = results[calls.checks] ?? false; calls.checks++; return { converted: c } },
      onConverted: () => { calls.converted++ },
      onTimeout: () => { calls.timeout++ },
    })
    return { calls, handle }
  }

  it('C13: converts during polling: the page swaps to the converted state and polling stops', async () => {
    const { calls } = poll([false, false, true])
    await vi.advanceTimersByTimeAsync(3 * POLL_INTERVAL_MS)
    expect(calls).toEqual({ checks: 3, converted: 1, timeout: 0 })
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS)
    expect(calls).toEqual({ checks: 3, converted: 1, timeout: 0 })
    // What the page does on conversion: the plan as re-read, the free banner off, Save as paid, the success line.
    const page = read('app/dashboard/ghg/page.tsx')
    const on = page.slice(page.indexOf('onConverted: ({ access }) => {'), page.indexOf("onTimeout: () => setPurchaseState('slow'),"))
    for (const s of ['setAccessAfterPurchase(access)', 'setEditingFree(false)', 'setHasFreeCalc(false)', "setPurchaseState('converted')"]) expect(on).toContain(s)
    expect(page).toContain('const ghgAccess: EntitlementAccess = accessAfterPurchase ?? ghgAccessRead')
  })

  it('C14: never converts: polling stops at 20 seconds and the fallback line shows', async () => {
    const { calls } = poll([])
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS - 1)
    expect(calls.timeout).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toEqual({ checks: POLL_TIMEOUT_MS / POLL_INTERVAL_MS, converted: 0, timeout: 1 })
    await vi.advanceTimersByTimeAsync(10 * POLL_INTERVAL_MS)
    expect(calls.checks).toBe(POLL_TIMEOUT_MS / POLL_INTERVAL_MS)
    expect(read('app/dashboard/ghg/page.tsx')).toContain("onTimeout: () => setPurchaseState('slow'),")
    expect(purchaseLine('slow')).toBe(PURCHASE_COPY.slow)
  })

  it('C15: polling makes no writes: the re-check only selects, and calls no route', () => {
    const page = read('app/dashboard/ghg/page.tsx')
    const effect = page.slice(page.indexOf("if (purchaseState !== 'waiting' || !inventoryId) return"), page.indexOf('return () => poll.stop()'))
    expect(effect).toContain(".from('ghg_inventories').select('free_tier').eq('id', id).maybeSingle()")
    expect(effect).toContain(".from('entitlements').select('module_key, term_end').eq('module_key', 'ghg').maybeSingle()")
    expect(effect).not.toMatch(/\.(update|insert|upsert|delete|rpc)\(|fetch\(/)
    expect(read('lib/ghg/convertOnPurchase.ts').slice(read('lib/ghg/convertOnPurchase.ts').indexOf('export function startConversionPoll'))).not.toMatch(/supabase|fetch\(/)
  })

  it('C16: no purchase=success: no polling; leaving the page stops it', async () => {
    expect(initialPurchaseState(null, true)).toBe('none')
    const page = read('app/dashboard/ghg/page.tsx')
    expect(page).toContain("if (purchaseState !== 'waiting' || !inventoryId) return")
    expect(page).toContain('return () => poll.stop()')
    const { calls, handle } = poll([])
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    handle.stop()
    await vi.advanceTimersByTimeAsync(POLL_TIMEOUT_MS)
    expect(calls).toEqual({ checks: 1, converted: 0, timeout: 0 })
  })

  it('C17: a check that fails counts as not yet, and polling carries on', async () => {
    vi.useFakeTimers()
    let n = 0
    let converted = 0
    startConversionPoll({ check: async () => { n++; if (n === 1) throw new Error('network'); return { converted: n === 2 } }, onConverted: () => { converted++ }, onTimeout: () => {} })
    await vi.advanceTimersByTimeAsync(2 * POLL_INTERVAL_MS)
    expect(converted).toBe(1)
  })

  it('C18: the three strings, word for word', () => {
    expect(PURCHASE_COPY.converted).toBe('Your GHG plan is active. This is now your first inventory, and everything you entered has been kept.')
    expect(PURCHASE_COPY.waiting).toBe("Payment received. We're applying your plan to this calculation now.")
    expect(PURCHASE_COPY.slow).toBe("Your plan is taking a little longer than usual to apply. Refresh this page in a minute, or email hello@themisiq.co if it still hasn't updated.")
    for (const s of Object.values(PURCHASE_COPY)) expect(s).not.toContain('\u2014')
  })
})
