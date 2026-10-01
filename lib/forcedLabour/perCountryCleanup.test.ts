import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PER_COUNTRY, FIELD_REGISTRY, storage } from './fieldRegistry'

// The leftover-rows count and delete (Stage D1b follow-up) touch exactly the keys that became per-country: no more,
// no fewer, and none that is still shared.

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const COUNT = read('supabase/verify/20261001_fl_answers_per_country_count.sql')
const DELETE = read('supabase/migrations/20261001_fl_answers_per_country_cleanup.sql')
const keysIn = (s: string) => [...s.matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map(m => m[1])

describe('the leftover fl_answers cleanup', () => {
  const expected = PER_COUNTRY.map(p => p.key)
  it('both scripts name exactly the per-country keys', () => {
    expect(keysIn(COUNT)).toEqual(expected)
    expect(keysIn(DELETE.slice(DELETE.indexOf('insert into _fl_cleanup_keys'), DELETE.indexOf('create temporary table _fl_cleanup_before')))).toEqual(expected)
  })
  it('none of them is still shared', () => {
    for (const k of expected) expect(storage(FIELD_REGISTRY.find(f => f.key === k)!), k).toBe('country')
  })
  it('the count only reads; the delete deletes only those keys, once, and checks the rest', () => {
    const code = (s: string) => s.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
    expect(code(COUNT)).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate)\b/i)
    const d = code(DELETE)
    expect(d.match(/\bdelete from\b/gi)).toHaveLength(1)
    expect(d).toContain('delete from public.fl_answers a where a.field_key in (select field_key from _fl_cleanup_keys);')
    expect(d).toContain("raise exception 'Post-flight: rows for other keys changed'")
    expect(DELETE).toMatch(/^-- Run in production on 2026-10-01 \(verified\)\./m)
    expect(DELETE).not.toMatch(/NOT RUN/)
  })
})
