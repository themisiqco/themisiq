// lib/s211/testing/fakeSupabase.ts
// A small in-memory stand-in for the Supabase query builder, enough for the S-211 route tests. It keeps
// rows per table and records every call, so a test can assert that a refused request touched nothing.
// Since Stage C step 4 (1 Oct 2026) it also does what the Canada adapter asks of PostgREST: delete, `in`,
// `is` (where an absent column reads as null, as a column the row was created without would), and an
// array of rows to insert or upsert.

import { fakeSaveSection, type FailInSave } from './fakeSaveSection'

type Row = Record<string, unknown>
// rpc: what each database function answers. 'throw' makes the call itself throw. A function with no
// entry answers { data: null, error } as PostgREST does for an unknown function.
export type RpcReply = { data: unknown; error: { message: string } | null } | 'throw'
// failInSave: see lib/s211/testing/fakeSaveSection.ts. fl_save_canada_section is imitated unless rpc names it.
export type FakeDb = { tables: Record<string, Row[]>; calls: string[]; rpc?: Record<string, RpcReply>; failInSave?: FailInSave }

export function fakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    db.calls.push(`from:${table}`)
    const rows = () => (db.tables[table] ??= [])
    let filters: ((r: Row) => boolean)[] = []
    let mode: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select'
    let payload: Row | Row[] = {}
    let conflict: string[] = []
    const matching = () => rows().filter(r => filters.every(f => f(r)))
    const api = {
      select: () => api,
      order: () => api,
      eq: (k: string, v: unknown) => { filters = [...filters, r => r[k] === v]; return api },
      in: (k: string, vs: unknown[]) => { filters = [...filters, r => vs.includes(r[k])]; return api },
      is: (k: string, v: null) => { filters = [...filters, r => (r[k] ?? null) === v]; return api },
      insert: (p: Row | Row[]) => { mode = 'insert'; payload = p; return api },
      update: (p: Row) => { mode = 'update'; payload = p; return api },
      upsert: (p: Row | Row[], o?: { onConflict?: string }) => { mode = 'upsert'; payload = p; conflict = (o?.onConflict ?? '').split(','); return api },
      delete: () => { mode = 'delete'; return api },
      run(): Row[] {
        const list = Array.isArray(payload) ? payload : [payload]
        if (mode === 'insert') return list.map(p => { const r = { id: `id-${rows().length + 1}`, ...p }; rows().push(r); return r })
        if (mode === 'update') { const m = matching(); m.forEach(r => Object.assign(r, payload)); return m }
        if (mode === 'upsert') return list.map(p => {
          const hit = rows().find(r => conflict.every(k => r[k] === p[k]))
          if (hit) { Object.assign(hit, p); return hit }
          const r = { ...p }; rows().push(r); return r
        })
        if (mode === 'delete') { const m = matching(); db.tables[table] = rows().filter(r => !m.includes(r)); return m }
        return matching()
      },
      maybeSingle: async () => ({ data: api.run()[0] ?? null, error: null }),
      single: async () => { const r = api.run()[0]; return r ? { data: r, error: null } : { data: null, error: { message: 'no row' } } },
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: api.run(), error: null }).then(res),
    }
    return api
  }
  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    db.calls.push(`rpc:${fn}`)
    const reply = db.rpc?.[fn]
    if (reply === 'throw') throw new Error('network')
    if (reply === undefined && fn === 'fl_save_canada_section') return fakeSaveSection(db, args, db.failInSave ?? null)
    return reply ?? { data: null, error: { message: `Could not find the function public.${fn}` } }
  }
  return { from, rpc }
}
