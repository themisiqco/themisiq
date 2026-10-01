import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A COLLATE clause applied to something that is not text. On 1 Oct 2026 Supabase refused
// 20261001_fl_answers_per_country_count.sql: "order by 1 collate "C"" makes 1 an integer EXPRESSION with a
// collation (42804: collations are not supported by type integer), not a reference to the first column. pglast
// parses it happily: the grammar allows it, the types do not. This catches the forms that can be seen without a
// database: a number, an aggregate, or a cast to a non-text type, directly before COLLATE. It cannot know a column's
// type, so ordering by a column NAME is still checked only by running in Supabase.

const ROOT = process.cwd()
const STAGE = [
  ...readdirSync(join(ROOT, 'supabase/migrations')).filter(f => f.startsWith('20261001_')).map(f => `supabase/migrations/${f}`),
  ...readdirSync(join(ROOT, 'supabase/verify')).filter(f => f.startsWith('20261001_')).map(f => `supabase/verify/${f}`),
]
/** SQL as the database reads it: no comments, string literals emptied (a sentence may say anything). */
const code = (s: string) => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n').replace(/'(?:[^']|'')*'/g, "''")

const NOT_TEXT_BEFORE_COLLATE = [
  /\b\d+\s+collate\b/gi,                                                     // a number: an integer, not a column position
  /\b(count|sum|avg|min|max)\s*\([^()]*\)\s+collate\b/gi,                    // an aggregate that returns a number
  /::\s*(int|integer|bigint|smallint|numeric|boolean|bool|uuid|date|timestamptz|timestamp|jsonb|json)\b\s+collate\b/gi,
]
const offences = (sql: string) => NOT_TEXT_BEFORE_COLLATE.flatMap(re => [...code(sql).matchAll(re)].map(m => m[0]))

describe('COLLATE only on text, in every SQL file from this stage', () => {
  it('covers the files it should', () => {
    expect(STAGE).toEqual(expect.arrayContaining([
      'supabase/verify/20261001_fl_answers_per_country_count.sql', 'supabase/migrations/20261001_fl_answers_per_country_cleanup.sql',
    ]))
    expect(STAGE.length).toBeGreaterThan(10)
  })
  for (const f of STAGE) {
    it(f.split('/').pop()!, () => {
      expect(offences(readFileSync(join(ROOT, f), 'utf8'))).toEqual([])
    })
  }
  it('would have caught the refused query, and its kin', () => {
    expect(offences('select a, b from t order by 1 collate "C";')).toEqual(['1 collate'])
    expect(offences('select count(*) collate "C" from t')).toHaveLength(1)
    expect(offences('select x::bigint collate "C" from t')).toHaveLength(1)
    expect(offences('select f from t order by (f = \'(total)\'), f collate "C"; -- order by 1 collate in a comment')).toEqual([])
  })
})
