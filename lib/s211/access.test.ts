import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { s211Access, S211_READ_FUNCTION, S211_WRITE_FUNCTION } from './access'

type Reply = { data: unknown; error: unknown } | 'throw'
const client = (replies: Record<string, Reply>) => ({
  rpc: async (fn: string) => {
    const r = replies[fn]
    if (r === 'throw' || r === undefined) throw new Error('network')
    return r
  },
}) as unknown as Parameters<typeof s211Access>[0]
const ok = (data: unknown) => ({ data, error: null })

describe('s211Access: the two database checks become one state', () => {
  it('write (active term or s211_access): full', async () => {
    expect(await s211Access(client({ s211_can_read: ok(true), s211_can_write: ok(true) }))).toEqual({ read: true, write: true, state: 'full' })
  })
  it('read without write (expired term): read-only', async () => {
    expect(await s211Access(client({ s211_can_read: ok(true), s211_can_write: ok(false) }))).toEqual({ read: true, write: false, state: 'read-only' })
  })
  it('neither (never bought): preview', async () => {
    expect(await s211Access(client({ s211_can_read: ok(false), s211_can_write: ok(false) }))).toEqual({ read: false, write: false, state: 'preview' })
  })
  it('write without read cannot come from the functions; if it did, it is not full access', async () => {
    expect(await s211Access(client({ s211_can_read: ok(false), s211_can_write: ok(true) }))).toEqual({ read: false, write: false, state: 'preview' })
  })
  it('only an exact true counts: null, "true", 1 and objects are no', async () => {
    for (const v of [null, undefined, 'true', 1, [true], { ok: true }]) {
      expect(await s211Access(client({ s211_can_read: ok(v), s211_can_write: ok(v) })), JSON.stringify(v)).toEqual({ read: false, write: false, state: 'preview' })
    }
  })
  it('an error or a thrown call is unknown, never read as no access', async () => {
    expect(await s211Access(client({ s211_can_read: { data: true, error: { message: 'x' } }, s211_can_write: ok(true) }))).toEqual({ state: 'unknown' })
    expect(await s211Access(client({ s211_can_read: ok(true), s211_can_write: 'throw' }))).toEqual({ state: 'unknown' })
  })
  it('asks the two functions the migration creates', () => {
    expect([S211_READ_FUNCTION, S211_WRITE_FUNCTION]).toEqual(['s211_can_read', 's211_can_write'])
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20260930_s211_read_write_split.sql'), 'utf8')
    for (const f of [S211_READ_FUNCTION, S211_WRITE_FUNCTION]) expect(sql).toContain(`create or replace function public.${f}()`)
  })
})

describe('the environment allow-list is still gone', () => {
  it('no S-211 source file reads it', () => {
    const name = ['S211', 'PREVIEW', 'USER', 'IDS'].join('_')
    for (const f of ['lib/s211/access.ts', 'lib/s211/server.ts', 'app/api/s211/gate.test.ts', 'app/api/s211/sections.test.ts']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toContain(name)
    }
  })
})
