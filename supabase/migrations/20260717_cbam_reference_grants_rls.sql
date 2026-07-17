-- 20260717_cbam_reference_grants_rls.sql
-- Captures the anon-read access for the CBAM reference tables — GRANT + RLS + read policies —
-- that were applied live but were missing from the repo, so a fresh rebuild produces a readable
-- database (the resolver's pre-fetch reads these via an anon client, matching the mr_* convention).
-- Idempotent and safe to re-run: GRANT and ENABLE ROW LEVEL SECURITY are replay-safe; each
-- CREATE POLICY is guarded on pg_policies because CREATE POLICY itself is not idempotent.

-- 1. Read privilege for the PostgREST roles.
grant select on
  public.cbam_goods_categories,
  public.cbam_cn_map,
  public.cbam_precursor_edges,
  public.cbam_production_routes,
  public.cbam_default_values
to anon, authenticated;

-- 2. Enable RLS (idempotent — re-running is a no-op once enabled).
alter table public.cbam_goods_categories  enable row level security;
alter table public.cbam_cn_map             enable row level security;
alter table public.cbam_precursor_edges    enable row level security;
alter table public.cbam_production_routes  enable row level security;
alter table public.cbam_default_values     enable row level security;

-- 3. Read policies: select to anon, authenticated using (true). CREATE POLICY errors if the policy
--    already exists, so guard each on pg_policies for safe replay.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_goods_categories'
      and policyname = 'cbam_goods_categories_read'
  ) then
    create policy cbam_goods_categories_read on public.cbam_goods_categories
      for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_cn_map'
      and policyname = 'cbam_cn_map_read'
  ) then
    create policy cbam_cn_map_read on public.cbam_cn_map
      for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_precursor_edges'
      and policyname = 'cbam_precursor_edges_read'
  ) then
    create policy cbam_precursor_edges_read on public.cbam_precursor_edges
      for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_production_routes'
      and policyname = 'cbam_production_routes_read'
  ) then
    create policy cbam_production_routes_read on public.cbam_production_routes
      for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_default_values'
      and policyname = 'cbam_default_values_read'
  ) then
    create policy cbam_default_values_read on public.cbam_default_values
      for select to anon, authenticated using (true);
  end if;
end $$;
