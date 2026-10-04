-- docs/review/patches/L3-M6-profiles-on-signup.sql
--
-- ⚠️ NOT RUN. Drafted 4 Oct 2026 (LEAD1 task L3, migration M6; design in docs/review/design-lead1.md section 4, "M6").
-- To become supabase/migrations/2026MMDD_profiles_on_signup.sql.
--
-- RUN ORDER (L3, after the L3 code is live): L3-M4-free-calc-pending.sql (M4), then THIS FILE (M6), then
-- L3-M4-verify.sql and L3-M6-verify.sql. M4 and M6 do not depend on each other.
--
-- WHY. public.profiles exists, with owner policies and RLS on, but nothing fills it: Lisa confirmed on 4 Oct 2026 that
-- there is no trigger on auth.users and the table has 0 rows. And nobody can read or write it except its owner: the
-- dump shows no grant to authenticated, and service_role holds only REFERENCES, TRIGGER, TRUNCATE and MAINTAIN
-- (BYPASSRLS does not bypass grants). The free-account claim (/api/ghg/free-calc/claim) and Lisa's leads view (L9)
-- both need it.
--
-- WHAT IT DOES
--   1. Adds profiles.full_name, profiles.signup_source and profiles.country (all nullable).
--   2. public.handle_new_user(): AFTER INSERT ON auth.users, creates the profile from the new user's
--      raw_user_meta_data: first_name, last_name, company and role (what /signup sends), full_name and signup_source
--      (what the free-account form sends, L4). SECURITY DEFINER with an empty search_path and every name qualified.
--      ⚠️ IT NEVER BLOCKS A SIGN-UP. The insert is wrapped: any error becomes a WARNING in the logs and the user row is
--      kept. A user without a profile is repaired by the claim route or a re-run of the backfill below.
--   3. Trigger on_auth_user_created on auth.users.
--   4. ONE-OFF BACKFILL: a profile for every existing auth.users row that has none, from the same metadata. Reported.
--   5. Grants: revoke all on profiles from anon; grant SELECT to authenticated (the existing owner policies then decide:
--      "Users can view own profile"); grant SELECT, INSERT, UPDATE to service_role (the claim route and the leads
--      view). authenticated gets no INSERT or UPDATE: nothing in the app writes profiles from a browser, and the
--      owner INSERT/UPDATE policies stay in place, unused, for if that ever changes.
--
-- WHAT IT DOES NOT DO
--   - No existing profile row is changed (there are none today; the backfill only inserts where none exists).
--   - signup_source is not guessed for existing users: it stays null unless the sign-up said where it came from.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 4 Oct 2026 (see the L3 report). Re-parse after any edit.
-- ROLLBACK: L3-M6-rollback.sql.

begin;

-- ── Pre-flight ──────────────────────────────────────────────────────────────────────────────────────────────────
do $pre$
declare
  v_n int;
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    raise exception 'Pre-flight: public.handle_new_user() already exists. Inspect it before running this file. Nothing was changed.';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal) then
    raise exception 'Pre-flight: auth.users already has a trigger. Expected none (Lisa, 4 Oct 2026). Inspect it first. Nothing was changed.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
              and column_name in ('full_name', 'signup_source', 'country')) then
    raise exception 'Pre-flight: profiles already has full_name, signup_source or country. Already run? Nothing was changed.';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'Pre-flight: RLS is not on for public.profiles, so a SELECT grant would expose every profile. Nothing was changed.';
  end if;
  select count(*) into v_n from public.profiles;
  raise notice 'Pre-flight passed. profiles rows before: % (expected 0, 4 Oct 2026).', v_n;
end
$pre$;

-- ── 1. Columns ──────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column full_name text,
  add column signup_source text,
  add column country text;

comment on column public.profiles.signup_source is
  'Where the account was created, when the sign-up said: ''free_calc'' (the free calculator''s Keep my results, LEAD1). Null when not stated.';

-- ── 2. The function ─────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first text;
  v_last  text;
begin
  begin
    v_first := nullif(btrim(meta ->> 'first_name'), '');
    v_last  := nullif(btrim(meta ->> 'last_name'), '');
    insert into public.profiles (id, email, first_name, last_name, full_name, company, role, signup_source)
    values (
      new.id,
      coalesce(new.email, ''),
      v_first,
      v_last,
      coalesce(nullif(btrim(meta ->> 'full_name'), ''), nullif(btrim(concat_ws(' ', v_first, v_last)), '')),
      nullif(btrim(meta ->> 'company'), ''),
      nullif(btrim(meta ->> 'role'), ''),
      nullif(btrim(meta ->> 'signup_source'), '')
    )
    on conflict (id) do nothing;
  exception when others then
    -- Never block the sign-up. The account is created; the profile is repaired by the claim route or the backfill.
    raise warning 'handle_new_user: no profile for user % (%: %)', new.id, sqlstate, sqlerrm;
  end;
  return new;
end;
$fn$;

comment on function public.handle_new_user() is
  'AFTER INSERT ON auth.users: creates public.profiles from raw_user_meta_data (LEAD1 M6). Never raises: an error is a warning and the user row is kept.';

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ── 3. The trigger ──────────────────────────────────────────────────────────────────────────────────────────────
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 4. One-off backfill ─────────────────────────────────────────────────────────────────────────────────────────
do $backfill$
declare
  v_n int;
begin
  insert into public.profiles (id, email, first_name, last_name, full_name, company, role, signup_source)
  select u.id,
         coalesce(u.email, ''),
         nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'last_name'), ''),
         coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                  nullif(btrim(concat_ws(' ', nullif(btrim(u.raw_user_meta_data ->> 'first_name'), ''),
                                              nullif(btrim(u.raw_user_meta_data ->> 'last_name'), ''))), '')),
         nullif(btrim(u.raw_user_meta_data ->> 'company'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'role'), ''),
         nullif(btrim(u.raw_user_meta_data ->> 'signup_source'), '')
    from auth.users u
   where not exists (select 1 from public.profiles p where p.id = u.id)
  on conflict (id) do nothing;
  get diagnostics v_n = row_count;
  raise notice 'Backfill: % profile(s) created for existing users.', v_n;
end
$backfill$;

-- ── 5. Grants ───────────────────────────────────────────────────────────────────────────────────────────────────
revoke all on table public.profiles from anon;
grant select on table public.profiles to authenticated;
grant select, insert, update on table public.profiles to service_role;

-- ── Post-flight ─────────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare
  v_missing int;
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal) then
    raise exception 'Post-flight: on_auth_user_created is not on auth.users. Nothing committed.';
  end if;
  select count(*) into v_missing from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id);
  if v_missing <> 0 then
    raise exception 'Post-flight: % user(s) still have no profile after the backfill. Nothing committed.', v_missing;
  end if;
  if has_table_privilege('anon', 'public.profiles', 'select,insert,update,delete') then
    raise exception 'Post-flight: anon holds a privilege on profiles. Nothing committed.';
  end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'select')
     or has_table_privilege('authenticated', 'public.profiles', 'insert,update,delete') then
    raise exception 'Post-flight: authenticated must hold SELECT only on profiles. Nothing committed.';
  end if;
  if not (has_table_privilege('service_role', 'public.profiles', 'select')
          and has_table_privilege('service_role', 'public.profiles', 'insert')
          and has_table_privilege('service_role', 'public.profiles', 'update')) then
    raise exception 'Post-flight: service_role lacks select, insert or update on profiles. Nothing committed.';
  end if;
  raise notice 'M6 applied. Every user has a profile. Next: L3-M4-verify.sql and L3-M6-verify.sql.';
end
$post$;

commit;
