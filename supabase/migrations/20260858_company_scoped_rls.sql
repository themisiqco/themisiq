-- supabase/migrations/20260858_company_scoped_rls.sql
-- Seven tables carry company_id and check it on neither insert nor update. Every INSERT and UPDATE
-- policy on them gains the company clause, in WITH CHECK.
--
-- THE GAP. User isolation is already sound on all seven: no user can read or write another user's
-- rows. What none of them checks is the COMPANY TAG. A user can insert a row carrying a company_id
-- belonging to somebody else's company — their own row, their own user_id, pointing at a company
-- they do not own. Nothing refuses it, and every figure aggregated by company_id then includes it.
--
-- =====================================================================
-- ⚠️ THIS FILE MAKES A THIRD RLS PATTERN IN THIS SCHEMA. READ ALL THREE BEFORE COPYING ANY.
-- =====================================================================
--   1. COMPANY ONLY — the ten CBAM tables (cbam_installations, cbam_production_processes,
--      cbam_source_streams, cbam_see_records and siblings). One FOR ALL policy per table:
--          company_id in (select id from public.companies where user_id = auth.uid())
--      No user column is consulted. Any user owning the company may write any row.
--
--   2. COMPANY *AND* USER — the six tables amended here. Both clauses, ANDed.
--
--   3. COMPANY AND A DIFFERENTLY-NAMED USER — cbam_verifier_access, whose user column is
--      customer_user_id, not user_id. Same shape as (2); the column name is the whole difference,
--      and it is the reason this file checks each table's column rather than assuming one name.
--
-- ⚠️ WHY (2) IS TIGHTER THAN (1), AND WHY THAT IS THE POINT RATHER THAN AN INCONSISTENCY TO TIDY.
-- Dropping the user clause and keeping only the company one would WIDEN write access: today only
-- the owning user may write these rows, and company-only would let anyone owning the company write
-- them. That may well be right one day — a company with several users is the obvious next feature —
-- but it is a product decision about who may edit whose work, and it must not arrive as a side
-- effect of copying a predicate from the CBAM tables. Checking both preserves exactly today's
-- behaviour and closes exactly today's gap. Widening later is then a deliberate act with a
-- migration of its own, not something that already happened while nobody was looking.
--
-- =====================================================================
-- ⚠️ WITH CHECK ONLY. THE READ PATH IS NOT TOUCHED, AND THAT IS DELIBERATE.
-- =====================================================================
-- The gap is a WRITE gap: a row can be TAGGED with a company the writer does not own. So the
-- company clause goes into WITH CHECK on INSERT and UPDATE — the predicate that governs what a row
-- may BECOME — and nowhere else.
--
-- It is NOT added to any USING qual, which governs which rows may be SELECTed, UPDATEd or DELETEd:
--   * On SELECT it would HIDE rows a user owns whose company_id they no longer own. A user who can
--     no longer see their own data has lost it, from their side, with no error and nothing to
--     click. That is a worse outcome than the mis-tagging it would prevent, and it prevents none of
--     it — the row is already written by then.
--   * On UPDATE's USING it would make such a row uneditable, so a customer could not correct the
--     very tag that was wrong.
--   * On DELETE it would make it undeletable, stranding it permanently.
-- A mis-tagged row that already exists must stay visible, editable and deletable. This file stops
-- the next one being written; it does not seal the previous ones away from their owner.
--
-- =====================================================================
-- ⚠️ ghg_monthly_emissions.company_id IS NULLABLE, AND A BARE COPY OF THE CBAM CLAUSE WOULD LOCK
-- ITS ROWS OUT. THIS IS THE ONE PLACE THE OBVIOUS PREDICATE IS WRONG.
-- =====================================================================
-- 20260621 declares it `company_id uuid references public.companies(id) on delete set null` — no
-- NOT NULL, and ON DELETE SET NULL, so a null is not merely permitted, it is what the schema
-- PRODUCES when a company is deleted. `null in (select ...)` evaluates to NULL, which is not TRUE,
-- so a policy carrying the bare clause REFUSES every row whose company_id is null: no insert, and
-- no update of an existing one. Those rows do not disappear — they become unwritable, silently,
-- for the user who owns them.
-- So that table alone gets `(company_id is null or company_id in (...))`. The other five declare
-- company_id NOT NULL or PRIMARY KEY, where the null branch is unreachable and is left out rather
-- than written in as decoration.
--
-- ⚠️ ghg_inventories IS NOT IN THIS REPO AND ITS POLICY IS DISCOVERED, NOT ASSUMED.
-- It has no CREATE TABLE and no CREATE POLICY under supabase/migrations — it predates the
-- directory, like the tables CLAUDE.md records as DB-only. Its policy name, its shape and its role
-- membership cannot be read from source, so §7 reads them out of pg_policies, refuses anything it
-- does not recognise, and rebuilds under a known name. Nothing about it is taken on trust.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql. This file is wrapped in begin/commit.
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable.
--
-- DEPENDS ON 20260621 (ghg_monthly_emissions), 20260625 (the four sbti tables), 20260724
-- (cbam_verifier_access), and on public.companies existing with a user_id column.

begin;

-- =====================================================================
-- 1. PRE-FLIGHT — refuse a schema that is not the one this file was written against
-- =====================================================================
do $$
declare
  v_missing text;
  v_pol     text;
  v_roles   text;
begin
  -- 1.1 public.companies is the table every clause below resolves through.
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='companies' and column_name='user_id') then
    raise exception
      'public.companies has no user_id column. Every policy in this file resolves company ownership '
      'through it; without it the clause would be a syntax error at first evaluation rather than at '
      'install, and the policies would already be live.';
  end if;

  -- 1.2 every table, its company column, and its USER column BY NAME. Checked rather than assumed:
  -- cbam_verifier_access uses customer_user_id and the other six use user_id, and a file that
  -- assumed one name would install a policy on the wrong column for exactly one table.
  select string_agg(x.t || '.' || x.c, ', ' order by x.t)
    into v_missing
    from (values
      ('ghg_monthly_emissions','company_id'), ('ghg_monthly_emissions','user_id'),
      ('sbti_company_profile','company_id'),  ('sbti_company_profile','user_id'),
      ('sbti_cycle','company_id'),            ('sbti_cycle','user_id'),
      ('sbti_scope3_coverage','company_id'),  ('sbti_scope3_coverage','user_id'),
      ('sbti_targets','company_id'),          ('sbti_targets','user_id'),
      ('ghg_inventories','company_id'),       ('ghg_inventories','user_id'),
      ('cbam_verifier_access','company_id'),  ('cbam_verifier_access','customer_user_id')
    ) as x(t,c)
   where not exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name=x.t and column_name=x.c);
  if v_missing is not null then
    raise exception
      'These table.column pairs do not exist: %. This file names each table''s user column '
      'explicitly because they are not all the same — cbam_verifier_access uses customer_user_id.',
      v_missing;
  end if;

  -- 1.3 ghg_monthly_emissions.company_id IS STILL NULLABLE. If it has since been made NOT NULL the
  -- null branch in §2 is dead weight and should be removed deliberately rather than left to rot.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='ghg_monthly_emissions'
                and column_name='company_id' and is_nullable='NO') then
    raise exception
      'ghg_monthly_emissions.company_id is now NOT NULL. §2 carries a `company_id is null or` '
      'branch written for a nullable column with ON DELETE SET NULL. Decide whether that branch '
      'should go before applying this file; it is not wrong, but it is no longer load-bearing.';
  end if;

  -- 1.4 THE FIVE FOUR-POLICY TABLES STILL HAVE FOUR POLICIES EACH, BY NAME. This file amends two of
  -- each in place. If a table has been collapsed to a FOR ALL policy since, dropping the two named
  -- ones would silently leave the collapsed policy — and its unamended predicate — in charge.
  select string_agg(x.p, ', ' order by x.p) into v_missing
    from (values
      ('ghg_monthly_emissions_insert'), ('ghg_monthly_emissions_update'),
      ('sbti_company_profile_insert'),  ('sbti_company_profile_update'),
      ('sbti_cycle_insert'),            ('sbti_cycle_update'),
      ('sbti_scope3_coverage_insert'),  ('sbti_scope3_coverage_update'),
      ('sbti_targets_insert'),          ('sbti_targets_update'),
      ('cbam_verifier_access_owner')
    ) as x(p)
   where not exists (select 1 from pg_policies where schemaname='public' and policyname=x.p);
  if v_missing is not null then
    raise exception 'These policies do not exist and cannot be amended: %', v_missing;
  end if;

  -- 1.5 ghg_inventories: EXACTLY ONE policy, and it is FOR ALL. Discovered, because this table is
  -- not in the repo. Anything else and this file does not know what it is replacing.
  select count(*)::text, string_agg(policyname || ' (' || cmd || ')', ', ')
    into v_pol, v_roles
    from pg_policies where schemaname='public' and tablename='ghg_inventories';
  if v_pol <> '1' then
    raise exception
      'ghg_inventories has % policies, not the single FOR ALL policy this file expects: %. That '
      'table is not defined in supabase/migrations — its policy was read from pg_policies, not '
      'from source — so anything unexpected stops here rather than being guessed at.',
      v_pol, coalesce(v_roles, '(none)');
  end if;
  if v_roles not like '%(ALL)%' then
    raise exception 'ghg_inventories'' single policy is not FOR ALL: %. See the note above.', v_roles;
  end if;
end $$;


-- =====================================================================
-- 2. ghg_monthly_emissions — user_id, and the ONE table with a nullable company_id
-- =====================================================================
-- ⚠️ THE NULL BRANCH IS THE WHOLE REASON THIS TABLE IS NOT A COPY OF THE FOUR BELOW. See the header.
-- SELECT and DELETE are untouched: their USING quals stay `auth.uid() = user_id`.
drop policy if exists ghg_monthly_emissions_insert on public.ghg_monthly_emissions;
create policy ghg_monthly_emissions_insert on public.ghg_monthly_emissions
  for insert to authenticated
  with check (auth.uid() = user_id
              and (company_id is null
                   or company_id in (select id from public.companies where user_id = auth.uid())));

drop policy if exists ghg_monthly_emissions_update on public.ghg_monthly_emissions;
create policy ghg_monthly_emissions_update on public.ghg_monthly_emissions
  for update to authenticated
  -- ⚠️ USING UNCHANGED. Which rows may be updated is still decided by the user column alone, so a
  -- row already carrying somebody else's company_id stays editable by its owner — which is how the
  -- tag gets CORRECTED. WITH CHECK is what stops it being set wrong again.
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
              and (company_id is null
                   or company_id in (select id from public.companies where user_id = auth.uid())));


-- =====================================================================
-- 3. sbti_company_profile — company_id is the PRIMARY KEY, so never null
-- =====================================================================
drop policy if exists sbti_company_profile_insert on public.sbti_company_profile;
create policy sbti_company_profile_insert on public.sbti_company_profile
  for insert to authenticated
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));

drop policy if exists sbti_company_profile_update on public.sbti_company_profile;
create policy sbti_company_profile_update on public.sbti_company_profile
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));


-- =====================================================================
-- 4. sbti_cycle — company_id is the PRIMARY KEY
-- =====================================================================
drop policy if exists sbti_cycle_insert on public.sbti_cycle;
create policy sbti_cycle_insert on public.sbti_cycle
  for insert to authenticated
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));

drop policy if exists sbti_cycle_update on public.sbti_cycle;
create policy sbti_cycle_update on public.sbti_cycle
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));


-- =====================================================================
-- 5. sbti_scope3_coverage — company_id NOT NULL, part of the composite PK
-- =====================================================================
drop policy if exists sbti_scope3_coverage_insert on public.sbti_scope3_coverage;
create policy sbti_scope3_coverage_insert on public.sbti_scope3_coverage
  for insert to authenticated
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));

drop policy if exists sbti_scope3_coverage_update on public.sbti_scope3_coverage;
create policy sbti_scope3_coverage_update on public.sbti_scope3_coverage
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));


-- =====================================================================
-- 6. sbti_targets — company_id NOT NULL
-- =====================================================================
drop policy if exists sbti_targets_insert on public.sbti_targets;
create policy sbti_targets_insert on public.sbti_targets
  for insert to authenticated
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));

drop policy if exists sbti_targets_update on public.sbti_targets;
create policy sbti_targets_update on public.sbti_targets
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));


-- =====================================================================
-- 7. ghg_inventories — the single FOR ALL policy, rebuilt under a known name
-- =====================================================================
-- ⚠️ ITS NAME IS DISCOVERED AND DROPPED DYNAMICALLY. This table is not in supabase/migrations, so
-- the policy's name is whatever the hand-run CREATE gave it. §1.5 has already refused anything but
-- exactly one FOR ALL policy; this drops that one by its real name and creates ghg_inventories_owner
-- in its place, so the next reader finds it in source.
--
-- ⚠️ AND IT BECOMES `to authenticated`, WHICH IS A CHANGE OF ROLE MEMBERSHIP, NOT ONLY OF PREDICATE.
-- It was TO PUBLIC. That was SAFE — auth.uid() is null for an anonymous request, so the predicate
-- was false and anon reached nothing — but it was safe by arithmetic rather than by declaration.
-- The six tables above are all `to authenticated`, and this joins them.
-- ⚠️ IT IS NOT THE ONLY PUBLIC POLICY IN THE SCHEMA, AND THAT CORRECTS A PREMISE. The ten CBAM
-- owner policies carry no `to` clause either, so they are TO PUBLIC as well. Those are out of scope
-- here and stay as they are: this file amends the tables whose WRITE path is being closed, and a
-- role sweep across the CBAM ten is a separate migration with its own reasoning.
do $$
declare v_old text;
begin
  select policyname into v_old
    from pg_policies where schemaname='public' and tablename='ghg_inventories';
  execute format('drop policy %I on public.ghg_inventories', v_old);
end $$;

create policy ghg_inventories_owner on public.ghg_inventories
  for all to authenticated
  -- USING on the user column alone, for the reason in the header: a row already mis-tagged must
  -- stay readable, editable and deletable by the user who owns it.
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id
              and company_id in (select id from public.companies where user_id = auth.uid()));


-- =====================================================================
-- 8. cbam_verifier_access — customer_user_id, NOT user_id
-- =====================================================================
-- ⚠️ THE COLUMN NAME IS THE WHOLE DIFFERENCE, and it is why §1.2 names every user column rather
-- than checking for one. A file that assumed user_id would have created a policy referencing a
-- column this table does not have — which fails at CREATE, loudly, and only for this one table.
drop policy if exists cbam_verifier_access_owner on public.cbam_verifier_access;
create policy cbam_verifier_access_owner on public.cbam_verifier_access
  for all to authenticated
  using (customer_user_id = auth.uid())
  with check (customer_user_id = auth.uid()
              and company_id in (select id from public.companies where user_id = auth.uid()));


-- =====================================================================
-- 9. Verification — read every amended policy back out of the catalogue
-- =====================================================================
-- ⚠️ A POLICY PREDICATE IS NOT VALIDATED AGAINST BEHAVIOUR AT CREATE TIME. A clause naming the
-- wrong column fails loudly; a clause that is merely WEAKER THAN INTENDED installs in silence and
-- looks exactly like a correct one. So each WITH CHECK is read back and required to name both
-- halves — the company subquery AND the table's own user column.
do $$
declare
  v_bad text;
begin
  -- 9.1 every INSERT and UPDATE policy names public.companies in its WITH CHECK.
  select string_agg(p.tablename || '.' || p.policyname, ', ' order by p.policyname)
    into v_bad
    from pg_policies p
   where p.schemaname = 'public'
     and p.policyname in (
       'ghg_monthly_emissions_insert','ghg_monthly_emissions_update',
       'sbti_company_profile_insert','sbti_company_profile_update',
       'sbti_cycle_insert','sbti_cycle_update',
       'sbti_scope3_coverage_insert','sbti_scope3_coverage_update',
       'sbti_targets_insert','sbti_targets_update',
       'ghg_inventories_owner','cbam_verifier_access_owner')
     and (p.with_check is null or position('companies' in p.with_check) = 0);
  if v_bad is not null then
    raise exception
      'These policies have no company clause in WITH CHECK after this migration: %. The write gap '
      'they exist to close is still open.', v_bad;
  end if;

  -- 9.2 AND THE USER CLAUSE SURVIVED. Losing it would WIDEN write access to anyone owning the
  -- company — the exact outcome the header says must not arrive as a side effect.
  select string_agg(p.tablename || '.' || p.policyname, ', ' order by p.policyname)
    into v_bad
    from pg_policies p
   where p.schemaname = 'public'
     and p.policyname in (
       'ghg_monthly_emissions_insert','ghg_monthly_emissions_update',
       'sbti_company_profile_insert','sbti_company_profile_update',
       'sbti_cycle_insert','sbti_cycle_update',
       'sbti_scope3_coverage_insert','sbti_scope3_coverage_update',
       'sbti_targets_insert','sbti_targets_update',
       'ghg_inventories_owner')
     and position('user_id' in coalesce(p.with_check, '')) = 0;
  if v_bad is not null then
    raise exception 'These policies lost their user clause: %. That WIDENS write access.', v_bad;
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname='public' and policyname='cbam_verifier_access_owner'
                    and position('customer_user_id' in coalesce(with_check,'')) > 0) then
    raise exception 'cbam_verifier_access_owner lost its customer_user_id clause.';
  end if;

  -- 9.3 THE NULL BRANCH IS PRESENT ON THE ONE TABLE THAT NEEDS IT. Without it every row whose
  -- company was deleted (ON DELETE SET NULL) becomes unwritable by its owner, silently.
  if not exists (select 1 from pg_policies
                  where schemaname='public' and policyname='ghg_monthly_emissions_insert'
                    and position('IS NULL' in upper(coalesce(with_check,''))) > 0) then
    raise exception
      'ghg_monthly_emissions_insert has no `company_id is null` branch. That column is nullable '
      'with ON DELETE SET NULL, so a bare IN clause refuses every row whose company was deleted.';
  end if;

  -- 9.4 THE READ PATH WAS NOT TOUCHED. The SELECT quals must still be the user column alone; a
  -- company clause there would hide a user's own rows from them.
  if exists (select 1 from pg_policies
              where schemaname='public'
                and policyname in ('ghg_monthly_emissions_select','sbti_company_profile_select',
                                   'sbti_cycle_select','sbti_scope3_coverage_select',
                                   'sbti_targets_select')
                and position('companies' in coalesce(qual,'')) > 0) then
    raise exception
      'A SELECT policy has gained a company clause. This file amends the WRITE path only: on the '
      'read path that clause hides rows a user owns whose company_id they do not, which loses a '
      'customer their own data with no error and prevents nothing.';
  end if;

  raise notice 'Verified: 12 policies carry both clauses, the read path is unchanged, and the nullable-company branch is in place.';
end $$;

commit;


-- =====================================================================
-- HOW TO EXERCISE THIS BY HAND — run separately, AFTER this migration
-- =====================================================================
-- ⚠️ ALL OF THESE NEED THE JWT PREAMBLE. Every predicate calls auth.uid(), which is NULL in the
-- SQL editor, so without it each test refuses for the wrong reason and looks like a pass.
--
--   begin;
--     select set_config('request.jwt.claims',
--                       json_build_object('sub', '<your-user-uuid>', 'role','authenticated')::text, true);
--     select auth.uid();          -- must be non-null and must be the user you meant
--   ... test ...
--   rollback;
--
-- (a) THE GAP, CLOSED. Insert a row of your own tagged with a company you do NOT own.
--     Find one first:  select id from public.companies where user_id <> auth.uid() limit 1;
--     begin;
--       insert into public.sbti_targets (company_id, user_id, scope, target_type)
--       values ('<a-company-you-do-not-own>', auth.uid(), 'scope_1', 'near_term');
--     rollback;
--   EXPECT: ERROR 42501, "new row violates row-level security policy". A SUCCESS HERE MEANS THE
--   MIGRATION DID NOT TAKE — that insert is exactly the gap this file exists to close.
--
-- (b) YOUR OWN COMPANY STILL WORKS. The same insert with a company you own must succeed.
--   EXPECT: INSERT 0 1. A failure here means the policy is too tight and customers cannot write.
--
-- (c) ⚠️ THE NULL CASE, AND IT IS THE ONE MOST LIKELY TO BE SKIPPED. On ghg_monthly_emissions only:
--     begin;
--       insert into public.ghg_monthly_emissions (user_id, company_id, inventory_id, period_month)
--       values (auth.uid(), null, '<an-inventory-you-own>', '2026-01-01');
--     rollback;
--   EXPECT: INSERT 0 1. A REFUSAL HERE IS THE LOCKOUT the header warns about: that column is
--   nullable with ON DELETE SET NULL, so every row whose company was deleted takes this path.
--
-- (d) A MIS-TAGGED ROW THAT ALREADY EXISTS STAYS READABLE AND FIXABLE. If any exist:
--       select id, company_id from public.sbti_targets
--        where user_id = auth.uid()
--          and company_id not in (select id from public.companies where user_id = auth.uid());
--   EXPECT: they are still SELECTable — the read path was not touched — and an UPDATE setting
--   company_id to one you own must succeed. If either fails, a company clause reached a USING qual.
--
-- (e) ghg_inventories STILL WORKS FOR ITS OWNER, and anon still reaches nothing.
--     begin;
--       select count(*) from public.ghg_inventories;         -- with the preamble: your own rows
--     rollback;
--     -- then WITHOUT the preamble, as anon would be:
--     begin;
--       select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
--       select count(*) from public.ghg_inventories;         -- EXPECT 0
--     rollback;
