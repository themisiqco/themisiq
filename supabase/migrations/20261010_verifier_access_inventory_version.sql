-- RUN 9 Oct 2026 (evening, Ontario; 10 Oct UTC) in the Supabase SQL editor, in the order in the header; verified.
-- RUN ORDER: 3 of 4, after 20261010_ghg_inventory_versions.sql. Files 1 to 3 run BEFORE the T16 app change is pushed.
--
-- verifier_access.inventory_version_id: every verifier link is pinned to a saved version (T16)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Adds three columns to public.verifier_access:
--      inventory_version_id  uuid, references ghg_inventory_versions(id): the version this link shows;
--      version_shared_at     timestamptz: when that version was put on this link;
--      version_shared_by     uuid: who put it there (the signed-in customer), or null when the one-off pinning in step 3
--                            put it there.
-- 2. Creates public.verifier_access_pin_version() and its BEFORE INSERT OR UPDATE trigger on verifier_access:
--      on insert: with no version given, snapshots the inventory first (ghg_snapshot_inventory_version, which checks the
--        caller owns it) and pins the link to that version. A version given must belong to the same inventory and owner.
--      on update: a change of inventory_id is refused, whatever the version ("A verifier link cannot be moved to
--        another inventory.", 42501; T16 review, 9 Oct 2026). A change of version must name a version of the same
--        inventory and owner ("Share the latest saved version", ruling B). Any other update keeps the version and who
--        shared it, as they were.
--    The new version, who shared it and when are always set here, never taken from the client.
-- 3. Pins every existing link, ruling A: one snapshot per inventory that has links, put on each of its links.
-- 4. Makes inventory_version_id NOT NULL. No live mode remains.
--
-- WHY
-- Ruled 8 and 9 Oct 2026 (T16). Without the trigger, the customer's own policy (verifier_access_owner, FOR ALL) would
-- let them set inventory_version_id to any version id at all, another account's included, and the RPC would serve it.
--
-- NOTE: STEP 3 PINS LINKS TO THE INVENTORY AS SAVED WHEN THIS FILE RUNS, not as it was when each link was issued: no
-- earlier version was kept. Pre-launch (design section 4), so no customer link predates this. version_shared_by is
-- null on those links, which the wizard and the verifier page word as pinned when versions began.
--
-- GRANTS: none issued. The three columns inherit verifier_access's table-level grants (authenticated SELECT, INSERT,
-- UPDATE; service_role ALL; anon nothing, 20260707_verifier_access_baseline_and_consent.sql). The pre-check confirms
-- they are table-level. Execute on the trigger function: revoked from public, anon and authenticated (a trigger
-- function is called by the trigger, as its owner, not by any role).
--
-- NO RLS CHANGE. verifier_access_owner still governs the rows.
--
-- PRE-CHECK, run first:
--   select grantee, privilege_type, count(*) as columns
--   from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'verifier_access'
--     and grantee in ('authenticated', 'service_role', 'anon')
--   group by grantee, privilege_type order by grantee, privilege_type;
--   select count(*) as columns from information_schema.columns where table_schema = 'public' and table_name = 'verifier_access';
-- PROCEED if, for each grantee listed, each privilege covers every column (the count equals the column count): the
-- grants are table-level, so the new columns inherit them. authenticated should show INSERT, SELECT and UPDATE; anon
-- nothing. STOP and report if any privilege covers fewer columns: a column-level grant would not reach the new ones.
--   And: select count(*) from public.verifier_access where inventory_id not in (select id from public.ghg_inventories);
-- PROCEED if 0 (the foreign key already guarantees it; a non-zero count means the table is not as the repo records).
-- RESULT, 9 Oct 2026 (Lisa): verifier_access grants table-level, on all 15 columns: authenticated INSERT, SELECT,
--   UPDATE; service_role INSERT, REFERENCES, SELECT, UPDATE; anon none. 0 orphan links. Also checked: 0 links whose
--   owner (customer_user_id) differs from the inventory's owner.
-- AFTER RUNNING, 9 Oct 2026 (Lisa): 13 links pinned to 7 versions; 0 unpinned.
--
-- VERIFY, after: supabase/verify/20261010_t16_verify.sql, checks t16_11 to t16_15 and t16_20.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS before CREATE TRIGGER; the
-- pinning touches only links still unpinned, and SET NOT NULL is a no-op once set. ASCII only.

alter table public.verifier_access
  add column if not exists inventory_version_id uuid references public.ghg_inventory_versions(id),
  add column if not exists version_shared_at    timestamptz,
  add column if not exists version_shared_by    uuid;

comment on column public.verifier_access.inventory_version_id is
  'T16: the saved version this verifier link shows (ghg_inventory_versions). Set by the trigger '
  'trg_verifier_access_pin_version, never trusted from the client; NOT NULL once every link was pinned. '
  'See supabase/migrations/20261010_verifier_access_inventory_version.sql.';
comment on column public.verifier_access.version_shared_at is
  'T16: when inventory_version_id was put on this link, at issue or at "Share the latest saved version". Set by the trigger.';
comment on column public.verifier_access.version_shared_by is
  'T16: the customer who put inventory_version_id on this link; null when the T16 migration pinned it. Set by the trigger.';

create or replace function public.verifier_access_pin_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok      boolean;
  v_pinning boolean;
begin
  if tg_op = 'INSERT' then
    if new.inventory_version_id is null then
      -- Snapshot first. ghg_snapshot_inventory_version refuses anyone but the inventory's owner.
      new.inventory_version_id := public.ghg_snapshot_inventory_version(new.inventory_id);
    end if;
    v_pinning := true;
  else
    -- A link belongs to the inventory it was issued for. Moving it would hand the verifier's consent to another one.
    if new.inventory_id is distinct from old.inventory_id then
      raise exception 'A verifier link cannot be moved to another inventory.' using errcode = '42501';
    end if;
    v_pinning := new.inventory_version_id is distinct from old.inventory_version_id;
  end if;
  if v_pinning then
    if new.inventory_version_id is null then
      raise exception 'A verifier link must show a saved version of the inventory.' using errcode = '23502';
    end if;
    select exists (
      select 1 from public.ghg_inventory_versions v
       where v.id = new.inventory_version_id
         and v.inventory_id = new.inventory_id
         and v.user_id = new.customer_user_id
    ) into v_ok;
    if not v_ok then
      raise exception 'That version does not belong to this inventory.' using errcode = '42501';
    end if;
    new.version_shared_at := now();
    new.version_shared_by := (select auth.uid());
  else
    -- Any other update (revoke, a name): the version and who shared it stay as they were.
    new.version_shared_at := old.version_shared_at;
    new.version_shared_by := old.version_shared_by;
  end if;
  return new;
end;
$$;

comment on function public.verifier_access_pin_version() is
  'T16: pins a verifier link to a saved version on insert (snapshotting first), refuses moving a link to another '
  'inventory, checks any change of version belongs to the same inventory and owner, and records who shared it and when. See 20261010_verifier_access_inventory_version.sql.';

revoke all on function public.verifier_access_pin_version() from public, anon, authenticated;

drop trigger if exists trg_verifier_access_pin_version on public.verifier_access;
create trigger trg_verifier_access_pin_version
  before insert or update on public.verifier_access
  for each row execute function public.verifier_access_pin_version();

-- Step 3 (ruling A): pin every link still unpinned, one snapshot per inventory. Run as the editor's role, so
-- auth.uid() is null and version_shared_by is null on these links.
do $$
declare
  r record;
  v_version uuid;
begin
  for r in select distinct a.inventory_id from public.verifier_access a where a.inventory_version_id is null loop
    v_version := public.ghg_snapshot_inventory_version_internal(r.inventory_id);
    update public.verifier_access
       set inventory_version_id = v_version
     where inventory_id = r.inventory_id and inventory_version_id is null;
  end loop;
end $$;

-- Step 4: no live mode remains. Fails, changing nothing, if step 3 left any link unpinned.
alter table public.verifier_access alter column inventory_version_id set not null;
