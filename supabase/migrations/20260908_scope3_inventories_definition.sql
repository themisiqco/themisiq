-- scope3_inventories: retroactive definition.
-- The table was created directly in the live database and never had a
-- migration. This file records the live definition as introspected on
-- 8 Sep 2026 so the schema is reproducible from git. It is written to be
-- safe to run against the existing database: nothing here drops or alters
-- live objects.

create table if not exists public.scope3_inventories (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id),
  inventory_id        uuid not null references public.ghg_inventories(id) on delete cascade,
  sector              text,
  currency            text,
  revenue_millions    numeric,
  cat_data            jsonb not null default '{}'::jsonb,
  total_scope3_tco2e  numeric,
  factor_basis        text,
  status              text not null default 'draft'
                        check (status in ('draft', 'confirmed')),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint scope3_inventories_inventory_unique unique (inventory_id)
);

create index if not exists idx_scope3_inventories_user
  on public.scope3_inventories using btree (user_id);

alter table public.scope3_inventories enable row level security;

-- One FOR ALL policy covers select/insert/update/delete. The with check
-- half is what prevents a user writing a row under another user_id.
--
-- Deliberate divergence from live state: the live policy holds a bare
-- auth.uid(), because the Sep 2026 RLS initplan sweep has not been run.
-- This file emits the wrapped (select auth.uid()) form required by
-- CLAUDE.md, so a rebuilt database lands post-sweep rather than needing
-- the sweep re-run. The sweep itself is catalog-driven and unaffected:
-- against the live database it still finds and wraps the bare policy.
-- On a rebuilt database the sweep is unnecessary and must not be run:
-- its pre-flight raises on an already-wrapped predicate and aborts the
-- whole batch, including the other five GHG tables in its scope.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'scope3_inventories'
      and policyname = 'scope3_owner_all'
  ) then
    create policy scope3_owner_all on public.scope3_inventories
      for all
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- Notes for future work, not applied here:
--   * on delete cascade on inventory_id means deleting a GHG inventory
--     destroys the customer's whole 15-category Scope 3 record.
--   * user_id has no on delete clause (defaults to no action).
--   * updated_at defaults to now() but no trigger maintains it; the app
--     sets it explicitly on upsert.
