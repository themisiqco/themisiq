import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasS211Access, S211_ACCESS_FUNCTION } from './access'

const client = (reply: () => Promise<{ data: unknown; error: unknown }>) => ({ rpc: reply }) as unknown as Parameters<typeof hasS211Access>[0]

describe('hasS211Access: only an exact true lets a user in', () => {
  it('true is allowed', async () => {
    expect(await hasS211Access(client(async () => ({ data: true, error: null })))).toBe(true)
  })

  it('false, null, undefined and look-alikes are refused', async () => {
    for (const data of [false, null, undefined, 'true', 1, [true], { s211_has_access: true }]) {
      expect(await hasS211Access(client(async () => ({ data, error: null }))), JSON.stringify(data)).toBe(false)
    }
  })

  it('an error is refused, even with data true beside it', async () => {
    expect(await hasS211Access(client(async () => ({ data: true, error: { message: 'x' } })))).toBe(false)
  })

  it('a call that throws is refused, not thrown', async () => {
    expect(await hasS211Access(client(async () => { throw new Error('network') }))).toBe(false)
  })

  it('asks the function the migration creates', () => {
    expect(S211_ACCESS_FUNCTION).toBe('s211_has_access')
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260930_s211_access_gate.sql'), 'utf8')
    expect(sql).toContain(`create or replace function public.${S211_ACCESS_FUNCTION}()`)
  })
})

describe('the environment allow-list is gone', () => {
  it('no S-211 source file reads it any more', () => {
    // The name is assembled so this file does not itself contain it.
    const name = ['S211', 'PREVIEW', 'USER', 'IDS'].join('_')
    for (const f of ['lib/s211/access.ts', 'lib/s211/server.ts', 'app/api/s211/gate.test.ts', 'app/api/s211/sections.test.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toContain(name)
    }
  })
})
