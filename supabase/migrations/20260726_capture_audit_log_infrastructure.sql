-- Capture existing audit_log infrastructure into git
-- ---------------------------------------------------------------------------
-- audit_log and log_audit() were created directly in the database (drift) and
-- never captured in a migration, even though GHG's verifier trail depends on
-- them. This migration documents them faithfully so:
--   (a) a fresh environment gets the real objects, and
--   (b) the CBAM audit triggers (added in the following migration) have an
--       in-git foundation to depend on.
--
-- IDEMPOTENT / NO-OP ON PROD: written with `create table if not exists` and
-- `create or replace function`, so applying it to the live DB (where both
-- already exist) changes nothing. It captures reality, it does not mutate it.
--
-- Verbatim sources: table shape from information_schema + pg_constraint
-- (PK on id, FK user_id -> auth.users); function body from
-- pg_get_functiondef('log_audit'). Both retrieved from the live DB 26 Jul 2026.

-- ── Table ──────────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid        not null default uuid_generate_v4(),
  table_name  text        not null,
  record_id   uuid        not null,
  action      text        not null,
  old_values  jsonb,
  new_values  jsonb,
  user_id     uuid,
  user_email  text,
  created_at  timestamptz default now(),
  constraint audit_log_pkey primary key (id),
  constraint audit_log_user_id_fkey foreign key (user_id) references auth.users(id)
);

-- ── Generic audit trigger function ─────────────────────────────────────────
-- Attached to ghg_inventories today (trigger audit_ghg_inventories). Generic
-- via tg_table_name + to_jsonb(old/new); actor resolved from profiles, falling
-- back to auth.users. record_id = new.id / old.id — so this function only fits
-- tables with a single-uuid `id` column (see the CBAM disclosures variant in
-- the next migration for the composite-PK case).
create or replace function public.log_audit()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_email text;
begin
  -- prefer profiles, fall back to auth.users
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), null, auth.uid(), v_email);
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), v_email);
    return new;
  else
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.id, 'INSERT', null, to_jsonb(new), auth.uid(), v_email);
    return new;
  end if;
end; $function$;

-- NOTE: the audit_ghg_inventories trigger itself is intentionally NOT recreated
-- here — it already exists on ghg_inventories in prod, and re-attaching a
-- trigger is not idempotent the way create-or-replace is. This migration
-- captures the table + function only. If reconstructing a fresh DB from
-- migrations, the ghg_inventories trigger would need its own capture; that is
-- pre-existing GHG drift and out of scope for the CBAM audit work.
