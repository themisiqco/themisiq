-- verifier_access — baseline capture + verifier-consent columns
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS: verifier_access has always lived ONLY in the live
-- Supabase database — its DDL was never in git (same DB-only class as the
-- ghg location-allowance trigger and audit_log). This migration:
--
--   (1) BASELINE: `create table if not exists` capturing the table's EXACT live
--       shape into the repo so a from-scratch rebuild reproduces it. Against the
--       LIVE database this is a NO-OP (the table already exists) — it will NOT
--       alter, drop, or clobber the live table or its data.
--   (2) GRANTS: reproduces the live table-privilege posture (a hand-run CREATE
--       TABLE does not auto-grant — see the purchase_consents GRANT-GAP lesson).
--   (3) RLS: re-asserts the current owner-only posture idempotently (drop-if-
--       exists + create). Reproduces what's already live — NO change to access.
--   (4) CONSENT COLUMNS: additive/idempotent columns a later step populates when
--       an invited verifier accepts (ToS + Privacy).
--
-- SHAPE IS AUTHORITATIVE: columns, constraints, grants, and the RLS policy below
-- were pulled from the live DB (verified 2026-07-07), not inferred.
--
-- The token-scoped verifier consent WRITE will go through a separate SECURITY
-- DEFINER RPC (next step) — deliberately NO anon/verifier write policy is added
-- here. get_verifier_inventory and the consent RPC are also out of scope here.
--
-- DEPLOY: do NOT auto-run. Lisa hand-runs in the Supabase SQL editor after
-- review. Safe against live as-is: (1) no-op, (2) & (3) reproduce the current
-- grant + RLS posture, (4) additive.

begin;

-- ── (1) BASELINE — exact live shape; NO-OP against the existing live table ──
create table if not exists public.verifier_access (
  id                uuid        not null default gen_random_uuid(),
  token             uuid        not null default gen_random_uuid(),
  inventory_id      uuid        not null,
  customer_user_id  uuid        not null,
  verifier_email    text,
  verifier_name     text,
  status            text        not null default 'active',
  expires_at        timestamptz not null default (now() + interval '90 days'),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz,
  constraint verifier_access_pkey primary key (id),
  constraint verifier_access_token_key unique (token),
  constraint verifier_access_inventory_id_fkey
    foreign key (inventory_id) references public.ghg_inventories(id) on delete cascade
);

-- ── (2) GRANTS — reproduce the live table-privilege posture ──
-- Security-meaningful DML only, stated explicitly:
--   • authenticated: SELECT/INSERT/UPDATE — NO DELETE (owners create/read/revoke
--     their own grants; revoke is an UPDATE to status, never a row delete).
--   • service_role:  ALL (server-side / SECURITY DEFINER paths).
--   • anon:          NOTHING here — no DML. The verifier (unauthenticated) reaches
--     data only through a token-scoped SECURITY DEFINER RPC, never the table.
-- The non-DML privileges Supabase applies broadly to every role (REFERENCES,
-- TRIGGER, TRUNCATE) are Postgres/Supabase role defaults and are intentionally
-- NOT re-emitted per role — they carry no access meaning for this table.
grant select, insert, update on public.verifier_access to authenticated;
grant all on public.verifier_access to service_role;

-- ── (3) RLS — owner-only, idempotent; reproduces the current live posture ──
alter table public.verifier_access enable row level security;

drop policy if exists verifier_access_owner on public.verifier_access;
create policy verifier_access_owner on public.verifier_access
  for all to authenticated
  using (customer_user_id = auth.uid())
  with check (customer_user_id = auth.uid());

-- ── (4) CONSENT COLUMNS — additive, idempotent; populated by a later accept step ──
-- consent_version mirrors the purchase_consents convention: it stamps WHICH ToS/
-- Privacy wording was agreed (e.g. '2026-07-v1'); the timestamptz columns record WHEN.
alter table public.verifier_access
  add column if not exists accepted_at         timestamptz,   -- when the verifier accepted the invite
  add column if not exists tos_accepted_at     timestamptz,   -- when Terms of Service (/terms) were accepted
  add column if not exists privacy_accepted_at timestamptz,   -- when Privacy Policy (/privacy) was accepted
  add column if not exists consent_version     text;          -- which ToS/Privacy wording was agreed

commit;
