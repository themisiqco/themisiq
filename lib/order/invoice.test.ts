import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// card-any-amount (Oct 2026): an invoice may be requested at any amount, and card is allowed at any
// amount. Until then createDraftInvoiceForOrder refused every order of $10,000 or less as 'card_eligible'
// and checkout refused every order over it.

vi.mock('../supabaseAdmin', () => ({ getSupabaseAdmin: vi.fn() }))
vi.mock('./provision', async () => {
  const actual = await vi.importActual<typeof import('./provision')>('./provision')
  return { ...actual, resolveOrCreateUser: vi.fn(async () => 'user-1') }
})
const invoicesCreate = vi.fn(async () => ({ id: 'in_1' }))
const itemsCreate = vi.fn(async () => ({ id: 'ii_1' }))
vi.mock('../stripe', () => ({
  getStripe: () => ({
    customers: { list: vi.fn(async () => ({ data: [{ id: 'cus_1' }] })), create: vi.fn() },
    invoices: { create: invoicesCreate },
    invoiceItems: { create: itemsCreate },
  }),
}))

import { createDraftInvoiceForOrder } from './invoice'
import { GHG_TIERS } from '../pricing'

const ROOT = join(__dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('card-any-amount', () => {
  beforeEach(() => { invoicesCreate.mockClear(); itemsCreate.mockClear() })

  it('CA2: a small order can be invoiced', async () => {
    const r = await createDraftInvoiceForOrder({ email: 'a@b.co', modules: ['ghg'], tier: 'starter' })
    expect(r).toMatchObject({ ok: true, invoiceId: 'in_1', amount: GHG_TIERS.starter.priceUSD })
    expect(itemsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: (GHG_TIERS.starter.priceUSD as number) * 100 }),
      expect.anything(),
    )
  })

  it('CA3: GHG Enterprise is still a manual quote, not an invoice', async () => {
    const r = await createDraftInvoiceForOrder({ email: 'a@b.co', modules: ['ghg'], tier: 'enterprise' })
    expect(r).toMatchObject({ ok: false, reason: 'requires_quote' })
    expect(invoicesCreate).not.toHaveBeenCalled()
  })

  it('CA4: no route or page refuses card by amount, and no customer text states a $10,000 rule', () => {
    expect(read('app/api/checkout/route.ts')).not.toMatch(/requiresInvoice|10,000/)
    expect(read('lib/order/invoice.ts')).not.toContain("'card_eligible'")
    expect(read('app/api/order/quote-request/route.ts')).not.toContain('card_eligible')
    for (const f of ['app/pricing/page.tsx', 'app/order/page.tsx']) {
      const src = read(f)
      expect(src, f).not.toMatch(/requiresInvoice|\$10k|\$10,000/)
      expect(src, f).toContain('Request an invoice')
    }
    // §3 states no threshold; §13's US$10,000 is the liability cap.
    const terms = read('app/terms/page.tsx')
    expect(terms).not.toContain('Orders up to US$10,000')
    expect(terms).toContain('Orders of any amount may be paid by card')
  })

  it('CA5: /order offers the invoice request beside card, and /pricing links to it', () => {
    expect(read('app/order/page.tsx')).toContain("searchParams.get('pay') === 'invoice'")
    expect(read('app/pricing/page.tsx')).toContain('&pay=invoice')
  })
})
