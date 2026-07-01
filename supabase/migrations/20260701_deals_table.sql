-- supabase/migrations/20260701_deals_table.sql
-- Deals module persistence (Build A of 3). Creates public.deals + owner-scoped RLS.
--
-- Owner model: user_id (the FO user who created the deal). Deals are TARGET-facing —
-- they describe a target company being diligenced, NOT the user's own company — so the
-- RLS anchor is the creating user, not a company_id.
--
-- RLS pattern copied verbatim from 20260625_sbti_core_tables.sql (authenticated-owner,
-- four explicit policies, using + with check, plus the mandatory GRANT).
--
-- ⚠️ token / share_enabled are for the Build-C shareable public link and are UNUSED until
-- then: the app never writes them (DB defaults own them), and there is no public route/RPC
-- reading them yet. They live here now only to avoid a later ALTER.
--
-- Re-runnable: create-if-not-exists, drop-then-create policies, idempotent grant.

create extension if not exists pgcrypto; -- gen_random_uuid() / gen_random_bytes()

create table if not exists public.deals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade, -- RLS owner anchor
  target_name    text,
  sector         text,
  revenue        numeric,
  jurisdiction   text,
  deal_type      text,
  deal_value     numeric,
  currency       text,
  has_ghg_data   boolean,
  has_esg_report boolean,
  notes          text,
  frameworks     jsonb,   -- derived framework list, persisted so the Build-C shared view need not recompute
  -- ── Build-C (shareable link) columns — UNUSED this build; DB defaults only, no client writes ──
  token          text not null default encode(gen_random_bytes(32), 'hex'), -- unguessable public-link token
  share_enabled  boolean not null default false,                            -- sharing is opt-in
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists deals_user_id_idx on public.deals (user_id);

-- ── RLS: authenticated-owner, four explicit policies (house pattern, copied from sbti) ──
alter table public.deals enable row level security;

drop policy if exists deals_select on public.deals;
drop policy if exists deals_insert on public.deals;
drop policy if exists deals_update on public.deals;
drop policy if exists deals_delete on public.deals;
create policy deals_select on public.deals
  for select to authenticated using (auth.uid() = user_id);
create policy deals_insert on public.deals
  for insert to authenticated with check (auth.uid() = user_id);
create policy deals_update on public.deals
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy deals_delete on public.deals
  for delete to authenticated using (auth.uid() = user_id);

-- ── GRANT (MANDATORY — hand-run CREATE TABLE does NOT auto-grant; the 42501 trap) ──
grant select, insert, update, delete on table public.deals to authenticated;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the GRANT line) ──
-- 1) RLS on?   select relname, relrowsecurity from pg_class where relname = 'deals';
-- 2) Policies? select polrelid::regclass as tbl, polname from pg_policy
--              where polrelid = 'public.deals'::regclass;   -- expect 4
-- 3) Grants?   select privilege_type from information_schema.role_table_grants
--              where table_name = 'deals' and grantee = 'authenticated';
