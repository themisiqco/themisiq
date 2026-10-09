-- NOT YET RUN. Written 9 Oct 2026 for T16; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 2 of 4, after 20261010_ghg_verifier_projection.sql. Files 1 to 3 run BEFORE the T16 app change is pushed.
--
-- public.ghg_inventory_versions: the saved versions a verifier link is pinned to (T16)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Creates public.ghg_inventory_versions: one row per distinct verifier projection of an inventory, numbered from 1,
--    never changed and never deleted (except with its inventory, by cascade).
-- 2. Creates public.ghg_snapshot_inventory_version_internal(uuid): snapshots the projection of an inventory, reusing
--    the latest version when the projection is unchanged (same SHA-256), else writing the next version. No ownership
--    check: internal, called only by the function below, the verifier_access trigger and the one-off pinning in
--    20261010_verifier_access_inventory_version.sql.
-- 3. Creates public.ghg_snapshot_inventory_version(uuid): the same, for the signed-in owner of the inventory only.
--    The wizard calls it at "Share the latest saved version" and at assurance PDF export; the verifier_access trigger
--    calls it when a link is issued.
--
-- WHY
-- Ruled 8 and 9 Oct 2026 (T16): a verifier link always shows the version it was issued against, and says when a newer
-- one exists. Snapshots are taken at link issue, at "share latest" and at PDF export, not on every save (ruling C).
--
-- NOTE: THE SNAPSHOT WRITES ONLY THIS TABLE. It never updates ghg_inventories: that table carries the entitlement trigger
-- (trg_enforce_ghg_location_allowance, part (a), FI0), which refuses a write without an active GHG pass, and the audit
-- trigger, which would log a no-change entry on every snapshot. So there is no current_version_id column (the design
-- proposed one): the latest version is the highest version_no, and "a newer version exists" compares hashes.
--
-- CONCURRENCY: the internal function locks the inventory row (select ... for update) before reading the latest
-- version, so two snapshots of one inventory are serialised even when no version exists yet. (Locking the latest
-- version row, as the design proposed, locks nothing for the first one; both would write version 1 and one would fail
-- on the unique key.) The lock is a row lock only: it changes nothing and fires no trigger.
--
-- HASH: the built-in sha256(bytea) over the projection's jsonb text, which Postgres writes in one canonical form.
--
-- SIZE: never pruned. About 14 KB of JSON for the T17 fixture, about 760 KB for 20 sites with 480 bills (less once
-- TOAST compresses it). Snapshots only at issue, share and export keep it to tens of versions per inventory.
-- docs/review/ghg-register.md DOC-01 records that a deleted document's reading survives here, as in the audit trail.
--
-- RLS ADDED: row level security on the new table, with one policy: the owner selects their own versions,
-- user_id = (select auth.uid()) (the wrapped form, CLAUDE.md RLS rule). No insert, update or delete policy: rows are
-- written only by the SECURITY DEFINER functions here, as their owner.
--
-- GRANTS (grants are separate from RLS; memory note): all revoked from public, anon and authenticated first, then
--   authenticated: SELECT (the wizard reads its own versions; RLS limits it to them);
--   service_role: SELECT (the verifier document routes read the pinned version's documents).
--   anon: NOTHING. A verifier reaches a version only through get_verifier_inventory (SECURITY DEFINER), which reads
--   the one version named by the token's own grant.
-- Execute on the internal function: revoked from public, anon and authenticated (owner only).
-- Execute on ghg_snapshot_inventory_version: revoked from public and anon, granted to authenticated.
--
-- PRE-CHECK, run first:
--   select to_regclass('public.ghg_inventory_versions') as existing_table,
--          to_regprocedure('public.ghg_verifier_projection(public.ghg_inventories)') as projection;
-- PROCEED if existing_table is null and projection is not null (file 1 ran, this one has not). If existing_table is
-- not null, STOP and report: the table exists and its shape must be compared before anything is re-run.
--
-- VERIFY, after: supabase/verify/20261010_t16_verify.sql, checks t16_04 to t16_10.
--
-- Idempotent: IF NOT EXISTS on the table and index, DROP POLICY IF EXISTS before CREATE POLICY, CREATE OR REPLACE on
-- the functions, grants re-issued. ASCII only.

create table if not exists public.ghg_inventory_versions (
  id               uuid        primary key default gen_random_uuid(),
  inventory_id     uuid        not null references public.ghg_inventories(id) on delete cascade,
  version_no       integer     not null check (version_no > 0),
  user_id          uuid        not null,
  saved_at         timestamptz not null default now(),
  snapshot         jsonb       not null,
  snapshot_sha256  text        not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  unique (inventory_id, version_no)
);

comment on table public.ghg_inventory_versions is
  'T16: the verifier projection of a GHG inventory as it was shared or exported, numbered per inventory from 1. '
  'Written only by ghg_snapshot_inventory_version(_internal); never updated; deleted only with its inventory. '
  'A verifier link (verifier_access.inventory_version_id) shows one of these, never the live row. '
  'See supabase/migrations/20261010_ghg_inventory_versions.sql.';

alter table public.ghg_inventory_versions enable row level security;

drop policy if exists ghg_inventory_versions_select_own on public.ghg_inventory_versions;
create policy ghg_inventory_versions_select_own on public.ghg_inventory_versions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.ghg_inventory_versions from public, anon, authenticated;
grant select on public.ghg_inventory_versions to authenticated;
grant select on public.ghg_inventory_versions to service_role;

create or replace function public.ghg_snapshot_inventory_version_internal(p_inventory_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       public.ghg_inventories%rowtype;
  v_snap      jsonb;
  v_hash      text;
  v_last_id   uuid;
  v_last_no   integer;
  v_last_hash text;
  v_id        uuid;
begin
  -- The inventory row is locked first, so two snapshots of one inventory run one after the other.
  select * into v_row from public.ghg_inventories where id = p_inventory_id for update;
  if not found then
    raise exception 'ghg_snapshot_inventory_version: inventory % not found', p_inventory_id using errcode = 'P0002';
  end if;
  v_snap := public.ghg_verifier_projection(v_row);
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_snap::text, 'UTF8')), 'hex');
  select v.id, v.version_no, v.snapshot_sha256 into v_last_id, v_last_no, v_last_hash
    from public.ghg_inventory_versions v
   where v.inventory_id = p_inventory_id
   order by v.version_no desc
   limit 1;
  if v_last_id is not null and v_last_hash = v_hash then
    return v_last_id;
  end if;
  insert into public.ghg_inventory_versions (inventory_id, version_no, user_id, snapshot, snapshot_sha256)
    values (p_inventory_id, coalesce(v_last_no, 0) + 1, v_row.user_id, v_snap, v_hash)
    returning id into v_id;
  return v_id;
end;
$$;

comment on function public.ghg_snapshot_inventory_version_internal(uuid) is
  'T16: snapshot the verifier projection of an inventory; reuse the latest version when unchanged. No ownership check, '
  'so execute is revoked from every role but the owner. See 20261010_ghg_inventory_versions.sql.';

revoke all on function public.ghg_snapshot_inventory_version_internal(uuid) from public, anon, authenticated;

create or replace function public.ghg_snapshot_inventory_version(p_inventory_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_owner uuid;
begin
  select i.user_id into v_owner from public.ghg_inventories i where i.id = p_inventory_id;
  if v_uid is null or v_owner is null or v_owner <> v_uid then
    raise exception 'ghg_snapshot_inventory_version: not found' using errcode = '42501';
  end if;
  return public.ghg_snapshot_inventory_version_internal(p_inventory_id);
end;
$$;

comment on function public.ghg_snapshot_inventory_version(uuid) is
  'T16: the signed-in owner snapshots their inventory for a verifier link or an assurance PDF; returns the version id, '
  'reusing the latest when nothing a verifier sees has changed. See 20261010_ghg_inventory_versions.sql.';

revoke all on function public.ghg_snapshot_inventory_version(uuid) from public, anon;
grant execute on function public.ghg_snapshot_inventory_version(uuid) to authenticated;
