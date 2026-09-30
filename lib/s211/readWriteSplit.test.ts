// The read/write split migration (supabase/migrations/20260930_s211_read_write_split.sql), read as text.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const raw = readFileSync(join(process.cwd(), 'supabase/migrations/20260930_s211_read_write_split.sql'), 'utf8')
const sql = raw.split('\n').map(l => l.replace(/--.*$/, '')).join('\n')
const statements = sql.split(/;\s*\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
const policies = statements.filter(s => /^create policy /i.test(s))
const policy = (name: string) => policies.find(p => p.startsWith(`create policy ${name} `))!
const fn = (name: string) => statements.find(s => s.startsWith(`create or replace function public.${name}()`))!

describe('the S-211 read/write split migration', () => {
  it('replaces the two FOR ALL policies with four per table, dropping each by name first', () => {
    for (const old of ['s211_reports_owner', 's211_report_sections_owner']) expect(statements).toContain(`drop policy ${old} on public.${old.replace('_owner', '')}`)
    expect(policies.map(p => p.split(' ').slice(2, 7).join(' '))).toEqual([
      's211_reports_select on public.s211_reports for select', 's211_reports_insert on public.s211_reports for insert',
      's211_reports_update on public.s211_reports for update', 's211_reports_delete on public.s211_reports for delete',
      's211_report_sections_select on public.s211_report_sections for select', 's211_report_sections_insert on public.s211_report_sections for insert',
      's211_report_sections_update on public.s211_report_sections for update', 's211_report_sections_delete on public.s211_report_sections for delete',
    ])
    expect(policies.every(p => / to authenticated /.test(p))).toBe(true)
  })

  it('SELECT asks s211_can_read(); INSERT, UPDATE and DELETE ask s211_can_write(), in the right expressions', () => {
    for (const t of ['s211_reports', 's211_report_sections']) {
      expect(policy(`${t}_select`)).toMatch(/using \(\(select public\.s211_can_read\(\)\) and /)
      expect(policy(`${t}_select`)).not.toMatch(/s211_can_write|with check/)
      expect(policy(`${t}_insert`)).toMatch(/with check \(\(select public\.s211_can_write\(\)\) and /)
      expect(policy(`${t}_insert`)).not.toMatch(/ using /)
      expect(policy(`${t}_update`)).toMatch(/using \(\(select public\.s211_can_write\(\)\) and .* with check \(\(select public\.s211_can_write\(\)\) and /)
      expect(policy(`${t}_delete`)).toMatch(/using \(\(select public\.s211_can_write\(\)\) and /)
      expect(policy(`${t}_delete`)).not.toMatch(/with check/)
    }
    for (const p of policies) expect(p).not.toMatch(/s211_has_access/)
  })

  it('keeps the owner conditions, with (select auth.uid()) and never a bare auth.uid()', () => {
    expect(policies.filter(p => p.includes('on public.s211_reports ')).every(p => p.includes('(select auth.uid()) = user_id'))).toBe(true)
    expect(policies.filter(p => p.includes('on public.s211_report_sections ')).every(p => p.includes('r.user_id = (select auth.uid())'))).toBe(true)
    for (const s of statements) expect(s.replace(/\(select auth\.uid\(\)\)/g, '')).not.toMatch(/auth\.uid\(\)/)
  })

  it('read: s211_access, or ANY forced-labour entitlement; write: s211_access, or one whose term has not ended', () => {
    const read = fn('s211_can_read'), write = fn('s211_can_write')
    for (const f of [read, write]) {
      expect(f).toMatch(/ security definer /)
      expect(f).toMatch(/ stable /)
      expect(f).toMatch(/ set search_path = '' /)
      expect(f).toContain('from public.s211_access a where a.user_id = (select auth.uid())')
      expect(f).toContain("from public.entitlements e where e.user_id = (select auth.uid()) and e.module_key = 'forced-labour'")
    }
    expect(read).not.toMatch(/term_end/)
    expect(write).toMatch(/e\.term_end > now\(\)/)
  })

  it('execute revoked from public and anon, granted to authenticated only', () => {
    for (const f of ['s211_can_read', 's211_can_write']) {
      expect(statements.filter(s => /^(grant|revoke) /.test(s) && s.includes(`public.${f}()`))).toEqual([
        `revoke all on function public.${f}() from public`, `revoke all on function public.${f}() from anon`, `grant execute on function public.${f}() to authenticated`,
      ])
    }
  })

  it('one transaction with pre-flight and post-flight checks, s211_has_access() kept, and the expired-term test left commented', () => {
    expect(statements[0]).toBe('begin')
    expect(sql).toContain('expected exactly s211_reports_owner and s211_report_sections_owner, both FOR ALL')
    expect(sql).toContain('expected 8 policies on the two tables')
    expect(sql).toContain('policies still calling s211_has_access()')
    expect(sql).not.toMatch(/drop function/i)
    expect(raw).toContain('--   6. An EXPIRED entitlement can read but not write.')
    expect(sql).not.toMatch(/insert into public\.entitlements/i)
  })
})
