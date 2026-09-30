import { describe, it, expect } from 'vitest'
import { stateFromAccessReply, canRead, canWrite, ORDER_HREF, ORDER_LABEL, signInHref, READ_ONLY_MESSAGE, BUILDER_ROOT } from './builderAccess'
import { LEGACY_PRICING_PAGE_ID, FLAT_MODULE_PRICES, MODULES } from '../pricing'

describe('the builder state from /api/s211/access', () => {
  it('each reply', () => {
    expect(stateFromAccessReply(200, { state: 'full' })).toBe('full')
    expect(stateFromAccessReply(200, { state: 'read-only' })).toBe('read-only')
    expect(stateFromAccessReply(200, { state: 'preview' })).toBe('preview')
    expect(stateFromAccessReply(403, { state: 'read-only' })).toBe('read-only')
    expect(stateFromAccessReply(401, null)).toBe('signed-out')
    expect(stateFromAccessReply(0, null)).toBe('unreachable')
  })
  it('anything unrecognized fails closed as unknown, never as full', () => {
    for (const [s, b] of [[503, { state: 'unknown' }], [200, { state: 'admin' }], [200, null], [403, { state: 'full' }], [500, null]] as const)
      expect(stateFromAccessReply(s, b), `${s} ${JSON.stringify(b)}`).toBe('unknown')
  })
  it('what each state may do', () => {
    expect(['full', 'read-only', 'preview', 'signed-out', 'unknown'].map(s => [canRead(s as never), canWrite(s as never)]))
      .toEqual([[true, true], [true, false], [false, false], [false, false], [false, false]])
  })
})

describe('the module as sold', () => {
  it('is in MODULES as Forced Labour Reporting at USD 1,499, and the order link resolves to it', () => {
    expect(MODULES.find(m => m.key === 'forced-labour')).toEqual({ key: 'forced-labour', name: 'Forced Labour Reporting' })
    expect(FLAT_MODULE_PRICES['forced-labour']).toBe(1499)
    expect(ORDER_LABEL).toBe('Order the module, $1,499/yr')
    const id = new URLSearchParams(ORDER_HREF.split('?')[1]).get('modules')!
    expect(ORDER_HREF.startsWith('/order?')).toBe(true)
    expect(LEGACY_PRICING_PAGE_ID[id]).toBe('forced-labour')
  })
  it('sign-in returns to the page, and the expired message matches materiality\'s tone', () => {
    expect(signInHref(`${BUILDER_ROOT}/r1/risks`)).toBe('/login?next=%2Fdashboard%2Fforced-labour%2Fr1%2Frisks')
    expect(READ_ONLY_MESSAGE).toContain('Your existing reports are still here and still readable.')
  })
})
