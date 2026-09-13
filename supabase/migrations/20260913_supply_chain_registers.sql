-- 20260913_supply_chain_registers.sql
--
-- NOT RUN. Propose only.
--
-- Server-side persistence for the supply chain risk register, plus the binary entitlement gate
-- that goes with it. Follows the ghg_inventories shape — identity and summary scalars as columns,
-- the variable-length supplier array as jsonb — and the trigger shape from
-- 20260913_module_entitlement_triggers.sql.
--
-- Until now the register persisted nowhere. app/dashboard/supply-chain/page.tsx is a pure
-- client-side calculator: no Supabase call, no fetch, no load effect. Everything a buyer typed
-- lived in React state until the tab closed, for paying customers as much as for visitors. A
-- two-hour localStorage draft was added in lib/drafts.ts to survive a signup round trip; this is
-- the actual storage.
--
-- ── FOUR DESIGN DECISIONS WORTH FINDING HERE RATHER THAN INFERRING ───────────────────────────
--
--   · user_id CASCADES, where ghg_inventories does not. ghg_inventories.user_id carries no
--     ON DELETE clause, which makes it NO ACTION, and it is one of four foreign keys that block
--     DELETE FROM auth.users outright. An account erasure has to delete those rows explicitly
--     before it can remove the user. Copying that here would add a fifth blocker to a path that
--     already needs hand-written handling. The shape of ghg_inventories is worth copying; that
--     part of it is not.
--
--   · There is no total_scope3 column, and the omission is the point. supplier_count and
--     total_spend are sums of inputs — array length, and annual_spend — so they cannot disagree
--     with what a reload computes. A Scope 3 total is a sum of scoreSupplier() output, and that
--     function's country table and thresholds change. Storing it would mean a register saved in
--     2026 and listed in 2027 shows a figure this build would not produce, sitting next to inputs
--     that say otherwise. Compute it on load. If a list view ever needs it stored, store it beside
--     a scoring-version stamp, the way ghg_inventories.factor_editions records which factor
--     editions priced its totals.
--
--   · campaign_supplier_id inside suppliers carries no referential integrity, and a dangling id
--     is deliberate. Postgres cannot place a foreign key on a value inside a jsonb document, so
--     when a linked campaign_suppliers row is deleted — it cascades from supplier_campaigns, which
--     cascades from auth.users — the id in the jsonb is left pointing at nothing and nothing
--     notices. That is tolerable here for one specific reason: the link carries no data. Name,
--     country, sector, spend and tier all live in the jsonb entry, so a broken link costs the
--     connection to the questionnaire response, not the supplier. Resolve it on load with a left
--     join and render three states: linked, not linked, and link broken. Never let an unresolvable
--     id fail a load, and never read the supplier's details through the join.
--
--   · Several registers per reporting year is intentional, so there is no unique constraint and
--     no duplicate check on save. ghg_inventories dedupes on company and year because a company
--     has one inventory per year; a buyer may reasonably run one register for direct materials and
--     another for logistics in the same year. The name column is what distinguishes them, which is
--     why it is not null — with no uniqueness and no name, a list of registers is unusable.
--
-- ── THE suppliers JSONB SHAPE ────────────────────────────────────────────────────────────────
-- Inputs only. One object per supplier:
--
--   { "id", "name", "country", "sector", "annual_spend", "currency", "tier",
--     "has_assessment", "campaign_supplier_id" }
--
-- risk_level, risk_score, risk_factors and scope3_emissions are absent by design — they are
-- scoreSupplier() output and are recomputed on load, the same rule parseSupplyChainDraft() already
-- applies to the localStorage draft. campaign_supplier_id is optional and usually absent: most
-- suppliers are scored before anyone is invited to a questionnaire.
--
-- At five hundred suppliers this column is roughly 125 KB, far inside the 1 GB field limit, and
-- past about 2 KB Postgres compresses and stores it out of line automatically.

begin;

-- ── PRE-FLIGHT ───────────────────────────────────────────────────────────────────────────────
-- Refuse rather than silently redefine, and refuse before anything is created rather than half
-- way through.
do $$
begin
  if to_regclass('public.supply_chain_registers') is not null then
    raise exception 'Pre-flight: public.supply_chain_registers already exists. Inspect it before running this file; nothing was changed.';
  end if;
  if to_regclass('public.companies') is null then
    raise exception 'Pre-flight: public.companies does not exist. company_id references it.';
  end if;
  if to_regclass('public.entitlements') is null then
    raise exception 'Pre-flight: public.entitlements does not exist. The trigger below reads it.';
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. The table
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table public.supply_chain_registers (
  id              uuid primary key default gen_random_uuid(),

  -- See the header: cascades deliberately, unlike ghg_inventories.user_id.
  user_id         uuid not null references auth.users(id) on delete cascade,

  -- Nullable and set null on delete, matching ghg_inventories.company_id. A register outliving
  -- its company row loses the grouping, not the data; company_name below keeps it readable.
  company_id      uuid references public.companies(id) on delete set null,

  -- The buyer's own name for this register. Not null because it is the only thing distinguishing
  -- two registers for the same company and year.
  name            text not null,

  -- Denormalised, as ghg_inventories.company_name is. Kept so a register still reads correctly
  -- after its company row is deleted.
  company_name    text,

  reporting_year  integer not null,
  currency        text not null default 'USD',
  frameworks      text[] not null default '{}',

  -- Inputs only. See the header for the field list and why the derived four are absent.
  suppliers       jsonb not null default '[]'::jsonb,

  -- Sums of inputs, so they cannot drift from a reload. Kept as columns so a list view does not
  -- have to parse the jsonb.
  supplier_count  integer not null default 0,
  total_spend     numeric not null default 0,

  -- A closed set, checked. Adding a state needs a migration, which is the intended friction:
  -- a status the application writes and the database has never heard of is how a filter quietly
  -- stops matching rows.
  status          text not null default 'draft'
                    check (status in ('draft', 'final')),

  created_at      timestamptz not null default now(),

  -- The save path sets this explicitly on every update, as app/dashboard/ghg/page.tsx does for
  -- ghg_inventories. There is no trigger maintaining it: the repo has sbti_set_updated_at() for
  -- that job, and attaching it here would be a second mechanism for a column one writer owns.
  updated_at      timestamptz not null default now()
);

-- Postgres indexes a primary key automatically; it does not index the referencing side of a
-- foreign key. Both of these are cascade paths as well as query paths — user_id carries the RLS
-- predicate and the register list, company_id carries the set-null on company deletion.
create index idx_supply_chain_registers_user    on public.supply_chain_registers (user_id);
create index idx_supply_chain_registers_company on public.supply_chain_registers (company_id);
create index idx_supply_chain_registers_year    on public.supply_chain_registers (user_id, reporting_year);

comment on table public.supply_chain_registers is
  'Saved supply chain risk registers. suppliers holds inputs only; risk scores and Scope 3 figures are recomputed on load by scoreSupplier(). Several registers per reporting year are allowed by design, distinguished by name.';
comment on column public.supply_chain_registers.suppliers is
  'Array of supplier input objects: id, name, country, sector, annual_spend, currency, tier, has_assessment, and an optional campaign_supplier_id. That last one has no referential integrity and may dangle; resolve it with a left join and render a broken-link state rather than failing the load.';
comment on column public.supply_chain_registers.total_spend is
  'Sum of annual_spend across suppliers. A sum of inputs, so it cannot disagree with a reload. There is deliberately no stored Scope 3 total: that is scoring output and would go stale.';

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. RLS and grants
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Matches ghg_inventories in shape, with three departures from its live policy, all deliberate:
--   · to authenticated, not the implicit PUBLIC. The live ghg_inventories policy has no role
--     clause, so it also applies to anon. Harmless there because auth.uid() is null, but this is
--     the tighter form and 20260858_company_scoped_rls.sql already moves in that direction.
--   · (select auth.uid()), not a bare auth.uid(). auth.uid() is STABLE, so inside a predicate the
--     planner may re-evaluate it per row; the scalar subselect has no outer reference and is
--     hoisted to an InitPlan. Same result set, one evaluation per query. This is a new policy on
--     a new table, which is exactly where that rule gets forgotten.
--   · Explicit grants. A hand-run CREATE TABLE grants nothing, and service_role is not a member
--     of authenticated. Without the grants below the table is unreachable by anyone.
alter table public.supply_chain_registers enable row level security;

drop policy if exists supply_chain_registers_owner on public.supply_chain_registers;
create policy supply_chain_registers_owner on public.supply_chain_registers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.supply_chain_registers from public;
revoke all on table public.supply_chain_registers from anon;
grant select, insert, update, delete on table public.supply_chain_registers to authenticated;
grant all on table public.supply_chain_registers to service_role;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3. Entitlement gate
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- Same shape as enforce_materiality_entitlement() and enforce_cbam_entitlement() in
-- 20260913_module_entitlement_triggers.sql, and for the same reason: RLS asks who owns a row, not
-- who paid for it, so without this a signed-in user with an expired term or none could insert
-- directly and be allowed.
--
-- The key is 'supply-chain', matching FLAT_MODULE_PRICES in lib/pricing.ts and the four
-- useEntitlementState('supply-chain') call sites in the dashboard.
--
-- Before insert only. An expired customer must keep being able to edit and delete registers they
-- already own; that is the rule 20260909_verifier_invite_term_gate.sql states and
-- enforce_deals_free_tier_cap() implements by not firing on update.
create or replace function public.enforce_supply_chain_entitlement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  has_active      boolean;
  had_entitlement boolean;
begin
  -- Strictly greater, matching every other entitlement check in this schema: a term ending
  -- exactly now is over.
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.user_id
      and e.module_key = 'supply-chain'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    -- The same query without the term clause. The difference between the two separates expired
    -- from never bought, which is the only distinction the customer can act on. Told the wrong
    -- one, a lapsed customer is invited to buy something they already own.
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.user_id
        and e.module_key = 'supply-chain'
    ) into had_entitlement;

    if had_entitlement then
      raise exception 'Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.'
        using errcode = 'PT402';
    else
      raise exception 'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.'
        using errcode = 'PT402';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_supply_chain_entitlement on public.supply_chain_registers;
create trigger trg_enforce_supply_chain_entitlement
  before insert on public.supply_chain_registers
  for each row execute function public.enforce_supply_chain_entitlement();

-- ── POST-FLIGHT ──────────────────────────────────────────────────────────────────────────────
-- Asserting is cheaper than assuming. The failures this catches are a table that exists but is
-- readable by the wrong people, and a gate that exists but fires on update as well as insert.
do $$
declare v_n int; v_rls boolean;
begin
  select c.relrowsecurity into v_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'supply_chain_registers';
  if not coalesce(v_rls, false) then
    raise exception 'Post-flight: RLS is not enabled on public.supply_chain_registers.';
  end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'supply_chain_registers';
  if v_n <> 1 then
    raise exception 'Post-flight: expected exactly 1 policy on supply_chain_registers, found %.', v_n;
  end if;

  select count(*) into v_n
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'supply_chain_registers'
     and grantee in ('anon', 'PUBLIC');
  if v_n <> 0 then
    raise exception 'Post-flight: supply_chain_registers carries % grant(s) to anon or PUBLIC.', v_n;
  end if;

  select count(*) into v_n
    from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'supply_chain_registers'
     and grantee = 'authenticated' and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  if v_n <> 4 then
    raise exception 'Post-flight: authenticated should hold 4 privileges on supply_chain_registers, found %.', v_n;
  end if;

  -- The gate exists, and tgtype bit 2 (value 4) is INSERT while bit 4 (value 16) is UPDATE.
  -- UPDATE must be off, or an expired customer loses the ability to edit a register they own.
  select count(*) into v_n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'supply_chain_registers'
     and not t.tgisinternal
     and t.tgname = 'trg_enforce_supply_chain_entitlement'
     and (t.tgtype & 4) = 4
     and (t.tgtype & 16) = 0;
  if v_n <> 1 then
    raise exception 'Post-flight: the entitlement trigger must exist and be INSERT-only; found % matching.', v_n;
  end if;

  raise notice 'public.supply_chain_registers created: RLS on, 1 owner policy, entitlement gate attached (BEFORE INSERT, errcode PT402).';
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- 1) Grants actually landed?
--    select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'supply_chain_registers' order by grantee, privilege_type;
-- 2) Trigger present and INSERT-only?
--    select t.tgname, t.tgtype from pg_trigger t join pg_class c on c.oid = t.tgrelid
--     where c.relname = 'supply_chain_registers' and not t.tgisinternal;
-- 3) An entitled customer can insert, and an unentitled one gets the PT402 sentence rather than a
--    generic failure. Test both before trusting this.
-- 4) An expired customer can still UPDATE and DELETE their own registers. This is the behaviour
--    the INSERT-only choice exists to preserve and it is the one worth checking by hand.
