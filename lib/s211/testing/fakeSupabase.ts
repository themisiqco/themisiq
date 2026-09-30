// lib/s211/testing/fakeSupabase.ts
// A small in-memory stand-in for the Supabase query builder, enough for the S-211 route tests. It keeps
// rows per table and records every call, so a test can assert that a refused request touched nothing.

type Row = Record<string, unknown>
// rpc: what each database function answers. 'throw' makes the call itself throw. A function with no
// entry answers { data: null, error } as PostgREST does for an unknown function.
export type RpcReply = { data: unknown; error: { message: string } | null } | 'throw'
export type FakeDb = { tables: Record<string, Row[]>; calls: string[]; rpc?: Record<string, RpcReply> }

export function fakeSupabase(db: FakeDb) {
  const from = (table: string) => {
    db.calls.push(`from:${table}`)
    const rows = () => (db.tables[table] ??= [])
    let filters: [string, unknown][] = []
    let mode: 'select' | 'update' | 'upsert' | 'insert' = 'select'
    let payload: Row = {}
    let conflict: string[] = []
    const matching = () => rows().filter(r => filters.every(([k, v]) => r[k] === v))
    const api = {
      select: () => api,
      order: () => api,
      eq: (k: string, v: unknown) => { filters = [...filters, [k, v]]; return api },
      insert: (p: Row) => { mode = 'insert'; payload = p; return api },
      update: (p: Row) => { mode = 'update'; payload = p; return api },
      upsert: (p: Row, o?: { onConflict?: string }) => { mode = 'upsert'; payload = p; conflict = (o?.onConflict ?? '').split(','); return api },
      run(): Row[] {
        if (mode === 'insert') { const r = { id: `id-${rows().length + 1}`, ...payload }; rows().push(r); return [r] }
        if (mode === 'update') { const m = matching(); m.forEach(r => Object.assign(r, payload)); return m }
        if (mode === 'upsert') {
          const hit = rows().find(r => conflict.every(k => r[k] === payload[k]))
          if (hit) { Object.assign(hit, payload); return [hit] }
          const r = { ...payload }; rows().push(r); return [r]
        }
        return matching()
      },
      maybeSingle: async () => ({ data: api.run()[0] ?? null, error: null }),
      single: async () => { const r = api.run()[0]; return r ? { data: r, error: null } : { data: null, error: { message: 'no row' } } },
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: api.run(), error: null }).then(res),
    }
    return api
  }
  const rpc = async (fn: string) => {
    db.calls.push(`rpc:${fn}`)
    const reply = db.rpc?.[fn]
    if (reply === 'throw') throw new Error('network')
    return reply ?? { data: null, error: { message: `Could not find the function public.${fn}` } }
  }
  return { from, rpc }
}
