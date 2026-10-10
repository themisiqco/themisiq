// lib/ghg/columnGrants.test.ts
//
// BR1 review (10 Oct 2026): A COLUMN GRANT ON ghg_inventories IS SCOPED PER PRIVILEGE. "grant select (c), insert (c),
// update (c)" grants three privileges on column c. "grant select, insert, update (c)" attaches the column list to
// UPDATE alone and grants SELECT and INSERT on the whole table. pglast deparses the second exactly that way. Every
// migration that grants columns on public.ghg_inventories is read here, statement by statement.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'supabase/migrations')
const code = (sql: string) => sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

/** The privilege list of each GRANT ... ON public.ghg_inventories that names any column, split at top-level commas. */
function columnGrantsOnInventories(sql: string): string[][] {
  const out: string[][] = []
  for (const m of code(sql).matchAll(/\bgrant\s+([\s\S]*?)\s+on\s+(?:table\s+)?public\.ghg_inventories\b/gi)) {
    const list = m[1]
    if (!list.includes('(')) continue
    const items: string[] = []
    let depth = 0, cur = ''
    for (const ch of list) {
      if (ch === '(') depth++
      if (ch === ')') depth--
      if (ch === ',' && depth === 0) { items.push(cur.trim()); cur = '' } else cur += ch
    }
    items.push(cur.trim())
    out.push(items)
  }
  return out
}
const perPrivilege = (items: string[]) => items.every(i => /^(select|insert|update|references)\s*\([^)]+\)$/i.test(i))

describe('column grants on ghg_inventories are scoped per privilege', () => {
  const files = readdirSync(DIR).filter(f => f.endsWith('.sql'))
  const granting = files.filter(f => columnGrantsOnInventories(readFileSync(join(DIR, f), 'utf8')).length > 0)

  it('the migrations that grant columns on ghg_inventories are found (not vacuous)', () => {
    for (const f of ['20260813_ghg_factor_editions_column.sql', '20261008_ghg_factor_selection.sql', '20261008_ghg_factor_edition_comparison.sql',
      '20261009_ghg_location_log.sql', '20261011_bill_review_reading.sql']) expect(granting, f).toContain(f)
  })
  for (const f of granting) {
    it(f, () => {
      for (const items of columnGrantsOnInventories(readFileSync(join(DIR, f), 'utf8'))) expect(perPrivilege(items), items.join(', ')).toBe(true)
    })
  }
  it('the check bites: the shared-list form is refused, the per-privilege form passes', () => {
    expect(perPrivilege(columnGrantsOnInventories('grant select, insert, update (a, b) on public.ghg_inventories to authenticated;')[0])).toBe(false)
    expect(perPrivilege(columnGrantsOnInventories('grant select (a, b), insert (a, b), update (a, b) on public.ghg_inventories to authenticated;')[0])).toBe(true)
    expect(perPrivilege(columnGrantsOnInventories('grant update (a), select on public.ghg_inventories to x;')[0])).toBe(false)
  })
})
