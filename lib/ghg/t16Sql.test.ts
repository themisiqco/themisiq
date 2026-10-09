// lib/ghg/t16Sql.test.ts
//
// T16: the four migrations and the verify script, read as text. There is no local Postgres (memory note), so this
// pins what each statement does; pglast parses them offline (reported with the patch), and
// supabase/verify/20261010_t16_verify.sql checks the database after they run.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8')
const code = (sql: string) => sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
const PROJECTION = read('supabase/migrations/20261010_ghg_verifier_projection.sql')
const VERSIONS = read('supabase/migrations/20261010_ghg_inventory_versions.sql')
const PIN = read('supabase/migrations/20261010_verifier_access_inventory_version.sql')
const RPC = read('supabase/migrations/20261010_get_verifier_inventory_pinned.sql')
const VERIFY = read('supabase/verify/20261010_t16_verify.sql')
const ALL = { PROJECTION, VERSIONS, PIN, RPC, VERIFY }
const fnBody = (sql: string, name: string) => {
  const c = code(sql)
  const i = c.indexOf(`create or replace function public.${name}(`)
  expect(i, name).toBeGreaterThan(-1)
  return c.slice(i, c.indexOf('$$;', c.indexOf('$$', i) + 2) + 3)
}

describe('T16 SQL: house format', () => {
  it('every file is ASCII, with a status line, a run order, a pre-check and a verify reference', () => {
    for (const [k, sql] of Object.entries(ALL)) {
      expect([...sql].filter(ch => ch.charCodeAt(0) > 127), k).toEqual([])
      if (k === 'VERIFY') continue
      expect(sql.split('\n')[0], k).toBe('-- NOT YET RUN. Written 9 Oct 2026 for T16; Lisa runs it in the Supabase SQL editor and records the run here.')
      expect(sql, k).toMatch(/-- RUN ORDER: \d of 4/)
      expect(sql, k).toContain('-- PRE-CHECK, run first:')
      expect(sql, k).toContain('-- VERIFY, after: supabase/verify/20261010_t16_verify.sql')
      expect(sql, k).toMatch(/NO RLS CHANGE|RLS ADDED/)
    }
  })
  it('the verify script is one read-only statement: check_name, expected, actual, pass, twenty checks', () => {
    const c = code(VERIFY)
    expect(c).toContain('select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;')
    // Outside string literals (check names and privilege names quote these words), no statement writes.
    expect(c.replace(/'[^']*'/g, "''")).not.toMatch(/\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i)
    expect(c.trim().startsWith('with')).toBe(true)
    expect([...c.matchAll(/'t16_(\d\d) /g)].map(m => m[1])).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')))
  })
})

describe('T16 SQL: the projection is defined once', () => {
  it('internal, stable, empty search path; execute revoked from every role', () => {
    const c = code(PROJECTION)
    expect(c).toContain('create or replace function public.ghg_verifier_projection(i public.ghg_inventories)')
    expect(c).toMatch(/language sql\s+stable\s+set search_path = ''/)
    expect(c).toContain('revoke all on function public.ghg_verifier_projection(public.ghg_inventories) from public, anon, authenticated;')
  })
  it('the snapshot stores it and the RPC compares with it, so the two return identical keys', () => {
    expect(fnBody(VERSIONS, 'ghg_snapshot_inventory_version_internal')).toContain('v_snap := public.ghg_verifier_projection(v_row);')
    expect(code(RPC)).toContain('ghg_verifier_projection(i)')
    expect(code(RPC)).toContain('v_inventory := v_version.snapshot;')
    expect(code(RPC), 'no inventory object is built inside the RPC any more').not.toContain("'company_name',              i.company_name")
  })
})

describe('T16 SQL: versions', () => {
  const internal = fnBody(VERSIONS, 'ghg_snapshot_inventory_version_internal')
  const owner = fnBody(VERSIONS, 'ghg_snapshot_inventory_version')
  it('an unchanged projection reuses the latest version; a changed one writes the next number', () => {
    expect(internal).toContain('if v_last_id is not null and v_last_hash = v_hash then\n    return v_last_id;')
    expect(internal).toContain('values (p_inventory_id, coalesce(v_last_no, 0) + 1, v_row.user_id, v_snap, v_hash)')
    expect(internal).toContain("pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_snap::text, 'UTF8')), 'hex')")
  })
  it('two snapshots of one inventory are serialised by locking the inventory row, even with no version yet', () => {
    const lock = internal.indexOf('from public.ghg_inventories where id = p_inventory_id for update')
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(internal.indexOf('from public.ghg_inventory_versions v'))
  })
  it('the snapshot writes only the versions table, never ghg_inventories (its entitlement and audit triggers)', () => {
    expect(internal + owner).not.toMatch(/update\s+public\.ghg_inventories/i)
    expect(code(VERSIONS)).not.toContain('current_version_id')
  })
  it('only the owner may snapshot; the internal function is no role\'s to call', () => {
    expect(owner).toContain('if v_uid is null or v_owner is null or v_owner <> v_uid then')
    expect(code(VERSIONS)).toContain('revoke all on function public.ghg_snapshot_inventory_version_internal(uuid) from public, anon, authenticated;')
    expect(code(VERSIONS)).toContain('grant execute on function public.ghg_snapshot_inventory_version(uuid) to authenticated;')
  })
  it('row level security on; the owner reads their own versions; anon nothing; no write policy', () => {
    const c = code(VERSIONS)
    expect(c).toContain('alter table public.ghg_inventory_versions enable row level security;')
    expect(c).toContain('using (user_id = (select auth.uid()));')
    expect(c).toContain('revoke all on public.ghg_inventory_versions from public, anon, authenticated;')
    expect(c).toContain('grant select on public.ghg_inventory_versions to authenticated;')
    expect(c).toContain('grant select on public.ghg_inventory_versions to service_role;')
    expect(c).not.toMatch(/grant [^;]*(insert|update|delete)[^;]* on public\.ghg_inventory_versions/i)
    expect([...c.matchAll(/create policy/g)]).toHaveLength(1)
  })
})

describe('T16 SQL: every link is pinned, and only to its own inventory', () => {
  const trig = code(PIN)
  it('a link issued without a version is snapshotted first, by the owner-checked function', () => {
    expect(trig).toContain("if tg_op = 'INSERT' then\n    if new.inventory_version_id is null then")
    expect(trig).toContain('new.inventory_version_id := public.ghg_snapshot_inventory_version(new.inventory_id);')
    expect(trig).toContain('before insert or update on public.verifier_access')
  })
  it('a version given, or changed later, must belong to the same inventory and owner: no token reaches another version', () => {
    expect(trig).toContain('where v.id = new.inventory_version_id\n         and v.inventory_id = new.inventory_id\n         and v.user_id = new.customer_user_id')
    expect(trig).toContain("raise exception 'That version does not belong to this inventory.'")
    expect(code(RPC)).toContain('where id = v_access.inventory_version_id\n      and inventory_id = v_access.inventory_id;')
  })
  it('a link cannot be moved to another inventory: any change of inventory_id is refused on update, whatever the version', () => {
    const upd = trig.slice(trig.indexOf("if tg_op = 'INSERT' then"), trig.indexOf('if v_pinning then'))
    const elseBranch = upd.slice(upd.indexOf('  else\n'))
    expect(elseBranch).toContain("if new.inventory_id is distinct from old.inventory_id then\n      raise exception 'A verifier link cannot be moved to another inventory.' using errcode = '42501';\n    end if;")
    // Refused before the version is looked at, so naming a version of the other inventory does not get it through.
    expect(elseBranch.indexOf('cannot be moved')).toBeLessThan(elseBranch.indexOf('v_pinning :='))
    expect(elseBranch).toContain('v_pinning := new.inventory_version_id is distinct from old.inventory_version_id;')
    expect(trig).not.toContain('or new.inventory_id is distinct from old.inventory_id')
    expect(code(VERIFY)).toContain("'t16_20 the pin trigger refuses moving a link to another inventory, whatever the version'")
  })
  it('the deploy order is written into the headers: files 1 to 3 before the push, file 4 after the deploy', () => {
    for (const f of [PROJECTION, VERSIONS, PIN]) expect(f).toMatch(/BEFORE the T16 app change is pushed/)
    expect(RPC.split('\n')[1]).toBe('-- RUN ORDER: 4 of 4, after 20261010_verifier_access_inventory_version.sql AND AFTER the T16 app change is deployed')
  })
  it('who shared it and when are set by the trigger, never the client, and kept on any other update', () => {
    expect(trig).toContain('new.version_shared_at := now();\n    new.version_shared_by := (select auth.uid());')
    expect(trig).toContain('new.version_shared_at := old.version_shared_at;\n    new.version_shared_by := old.version_shared_by;')
  })
  it('every existing link is pinned in the migration, then the column is NOT NULL (ruling A)', () => {
    expect(trig).toContain('v_version := public.ghg_snapshot_inventory_version_internal(r.inventory_id);')
    expect(trig.indexOf('alter table public.verifier_access alter column inventory_version_id set not null;'))
      .toBeGreaterThan(trig.indexOf('ghg_snapshot_inventory_version_internal(r.inventory_id)'))
    expect(trig).toContain('revoke all on function public.verifier_access_pin_version() from public, anon, authenticated;')
  })
})

describe('T16 SQL: get_verifier_inventory', () => {
  const c = code(RPC)
  it('active, unexpired, not revoked; consent before any figure (ruling E)', () => {
    expect(c).toContain("and status = 'active'\n      and expires_at > now()\n      and revoked_at is null;")
    const consent = c.indexOf('if v_access.accepted_at is null then')
    expect(consent).toBeGreaterThan(-1)
    expect(consent).toBeLessThan(c.indexOf('v_inventory := v_version.snapshot;'))
    const consentBranch = c.slice(consent, c.indexOf('end if;', consent))
    expect(consentBranch).toContain("'error', 'consent_required'")
    expect(consentBranch, 'no figures before consent').not.toMatch(/workings|scope1_total|locations_data|'inventory'/)
  })
  it('the pinned snapshot only; a grant with no version is refused, never served live (ruling A)', () => {
    expect(c).toContain("return jsonb_build_object('error', 'version_missing');")
    expect(c).not.toMatch(/from ghg_inventories i where i\.id = v_access\.inventory_id;\s*if v_inventory is null/)
  })
  it('version, newer_version_exists, and an audit trail that stops at the pinned version (ruling D)', () => {
    expect(c).toContain("'version_no', v_version.version_no,")
    expect(c).toContain("'shared_by_customer', v_access.version_shared_by is not null")
    expect(c).toContain("'newer_version_exists', coalesce(v_newer, false)")
    expect(c).toContain('is distinct from v_version.snapshot_sha256')
    expect(c).toContain('and a.created_at <= v_version.saved_at;')
  })
})
