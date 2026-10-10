// lib/testing/fakeAdmin.ts
//
// A small in-memory stand-in for the service-role Supabase client, for the staff route tests (BR8). Tables are arrays
// of rows; a query chains eq / in / is / neq / order / limit and resolves to { data, error }. Every write and signing is
// recorded in `calls`, in order, so a test can show what happened before what. Not a database: it checks nothing the
// real one checks (guards, grants); the SQL tests and verify scripts do that.

type Row = Record<string, unknown>
export type FakeAdmin = ReturnType<typeof fakeAdmin>

export function fakeAdmin(tables: Record<string, Row[]>, opts: { failInsertInto?: Set<string>; rpc?: (fn: string, args: Row) => { data: unknown; error: unknown }; emails?: Record<string, string> } = {}) {
  const calls: string[] = []
  const query = (table: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let mode: 'select' | 'update' | 'insert' = 'select'
    let patch: Row = {}, rows: Row[] = [], single = false, limitN = Infinity
    let orderBy: { col: string; asc: boolean } | null = null
    const run = () => {
      const t = tables[table] ?? (tables[table] = [])
      if (mode === 'insert') {
        calls.push(`insert:${table}`)
        if (opts.failInsertInto?.has(table)) return { data: null, error: { message: 'insert refused' } }
        t.push(...rows)
        return { data: rows, error: null }
      }
      let hit = t.filter(r => filters.every(f => f(r)))
      if (mode === 'update') { calls.push(`update:${table}`); hit.forEach(r => Object.assign(r, patch)); return { data: hit, error: null } }
      if (orderBy) { const { col, asc } = orderBy; hit = [...hit].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1)) }
      hit = hit.slice(0, limitN)
      return single ? { data: hit[0] ?? null, error: null } : { data: hit, error: null }
    }
    const q: Record<string, unknown> = {
      select: () => q,
      insert: (r: Row | Row[]) => { mode = 'insert'; rows = Array.isArray(r) ? r : [r]; return q },
      update: (p: Row) => { mode = 'update'; patch = p; return q },
      eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q },
      neq: (k: string, v: unknown) => { filters.push(r => r[k] !== v); return q },
      lt: (k: string, v: number) => { filters.push(r => Number(r[k]) < v); return q },
      in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return q },
      is: (k: string, v: unknown) => { filters.push(r => (r[k] ?? null) === v); return q },
      order: (col: string, o?: { ascending?: boolean }) => { orderBy = { col, asc: o?.ascending !== false }; return q },
      limit: (n: number) => { limitN = n; return q },
      maybeSingle: () => { single = true; return Promise.resolve(run()) },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    }
    return q
  }
  return {
    calls,
    tables,
    from: (table: string) => query(table),
    rpc: async (fn: string, args: Row) => { calls.push(`rpc:${fn}`); return opts.rpc ? opts.rpc(fn, args) : { data: null, error: null } },
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: opts.emails?.[id] ? { email: opts.emails[id] } : null }, error: null }) } },
    storage: { from: () => ({ createSignedUrl: async (path: string, ttl: number) => { calls.push(`sign:${path}:${ttl}`); return { data: { signedUrl: `https://signed/${path}` }, error: null } } }) },
  }
}
