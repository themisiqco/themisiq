-- docs/review/patches/L1-M1-ghg-free-tier.sql
--
-- ⚠️ NOT RUN. Drafted 4 Oct 2026 (LEAD1 task L1, migration M1; design in docs/review/design-lead1.md sections 3 and 4).
-- To become supabase/migrations/2026MMDD_ghg_free_tier.sql.
--
-- RUN ORDER (L1): this file (M1), then L1-M3-scope3-sbti-entitlement.sql (M3), then
-- L1-M2-ghg-entitlement-gate-free-tier.sql (M2), then LEAD1-verify.sql. M2 is LAST on purpose: it is the change that
-- lets an account without a plan save one free calculation, and it must not open before Scope 3 and SBTi are gated
-- by M3. M2's pre-flight refuses to run if M1 or M3 is missing.
--
-- WHAT IT DOES
--   1. Pre-flight (Q-L4): counts ghg_inventories rows whose owner has NO ghg entitlement row at all (or no owner), and
--      STOPS, listing them, unless the count is 0. Lisa's check on 4 Oct 2026 found 0. A non-zero count means rows
--      exist that the free-tier rules were not designed for; nothing is changed until they are looked at.
--   2. Adds ghg_inventories.free_tier boolean not null default false. Every existing row becomes false, which is
--      correct: each was saved under an active GHG plan (the entitlement gate has refused every other write since
--      11 Aug 2026, and the pre-flight has just shown no row belongs to an account that never had one).
--   3. Adds the partial unique index ghg_inventories_one_free_per_user on (user_id) where free_tier: one free
--      calculation per account, enforced by the index itself, so two concurrent inserts cannot both win.
--   4. Grants UPDATE (free_tier) to service_role. The Stripe webhook converts a free calculation into the first
--      inventory on purchase (design section 3, task L8) with the service role, which today holds no UPDATE on this
--      table at all (dump: GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ... TO service_role). BYPASSRLS does
--      not bypass grants, so without this the conversion would be refused. Column-level: the service role may flip
--      this one column and nothing else.
--
-- WHAT IT DOES NOT DO
--   - No trigger or function changes (that is M2). After M1 alone, behaviour is identical: the live FI0 gate still
--     refuses every write without an active plan, free_tier or not.
--   - authenticated needs no new grant: it holds table-level SELECT, INSERT, UPDATE, DELETE, which covers a new column.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 4 Oct 2026 (see the L1 report). Re-parse after any edit.
-- ROLLBACK: L1-M1-rollback.sql (refuses while any free_tier row exists).

begin;

-- ── Pre-flight ──────────────────────────────────────────────────────────────────────────────────────────────────
do $pre$
declare
  v_n int;
  v_list text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'ghg_inventories' and column_name = 'free_tier') then
    raise exception 'Pre-flight: ghg_inventories.free_tier already exists. Already run? Nothing was changed.';
  end if;

  select count(*),
         string_agg(i.id::text || ' (owner ' || coalesce(i.user_id::text, 'none') || ')', ', ' order by i.created_at)
    into v_n, v_list
    from public.ghg_inventories i
   where i.user_id is null
      or not exists (select 1 from public.entitlements e where e.user_id = i.user_id and e.module_key = 'ghg');
  if v_n <> 0 then
    raise exception 'Pre-flight: % ghg_inventories row(s) belong to no account or to an account with no GHG entitlement: %. Expected 0 (Q-L4). Nothing was changed.', v_n, v_list;
  end if;
  raise notice 'Pre-flight passed: every ghg_inventories row belongs to an account with a GHG entitlement.';
end
$pre$;

-- ── 1. The column ───────────────────────────────────────────────────────────────────────────────────────────────
alter table public.ghg_inventories add column free_tier boolean not null default false;

comment on column public.ghg_inventories.free_tier is
  'True for a free account''s one free Scope 1 and Scope 2 calculation (LEAD1). Without an active GHG plan only a free_tier row may be written (enforce_ghg_location_allowance), and only one per account exists (ghg_inventories_one_free_per_user). Set to false by the Stripe webhook on purchase, which makes it the first inventory.';

-- ── 2. One free calculation per account ─────────────────────────────────────────────────────────────────────────
create unique index ghg_inventories_one_free_per_user on public.ghg_inventories (user_id) where free_tier;

-- ── 3. The conversion grant ─────────────────────────────────────────────────────────────────────────────────────
grant update (free_tier) on public.ghg_inventories to service_role;

-- ── Post-flight ─────────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare
  v_def text;
  v_n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ghg_inventories' and column_name = 'free_tier'
                    and is_nullable = 'NO' and column_default = 'false') then
    raise exception 'Post-flight: free_tier is not a not-null column defaulting to false. Nothing committed.';
  end if;
  select indexdef into v_def from pg_indexes
   where schemaname = 'public' and tablename = 'ghg_inventories' and indexname = 'ghg_inventories_one_free_per_user';
  if v_def is null or v_def not like 'CREATE UNIQUE INDEX%' or v_def not like '%WHERE free_tier%' then
    raise exception 'Post-flight: the one-free index is not as intended: %. Nothing committed.', v_def;
  end if;
  select count(*) into v_n from public.ghg_inventories where free_tier;
  if v_n <> 0 then
    raise exception 'Post-flight: % row(s) have free_tier = true straight after the column was added. Nothing committed.', v_n;
  end if;
  if not has_column_privilege('service_role', 'public.ghg_inventories', 'free_tier', 'UPDATE') then
    raise exception 'Post-flight: service_role cannot update free_tier. Nothing committed.';
  end if;
  raise notice 'M1 applied. Next: L1-M3-scope3-sbti-entitlement.sql.';
end
$post$;

commit;
