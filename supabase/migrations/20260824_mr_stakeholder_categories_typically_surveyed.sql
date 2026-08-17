-- 20260824_mr_stakeholder_categories_typically_surveyed.sql
--
-- Adds ONE column to mr_stakeholder_categories: typically_surveyed boolean not null default false,
-- true on nine of the eleven seeded categories. Column and seed only.
--
-- NO UI. The round-creation screen that will consume this — the one that offers a default set of
-- categories to invite — does not exist yet. Nothing in app/ or lib/ reads mr_stakeholder_categories
-- at all today, and none of the three survey RPCs reads any column of it beyond `code` and
-- `labour_routing`. So this file changes no behaviour anywhere; it records a decision ahead of the
-- screen that needs it.
--
-- NO GRANT CHANGE. A table-level GRANT SELECT covers columns added later, and mr_stakeholder_
-- categories already grants SELECT to anon, authenticated and service_role with a read policy naming
-- those roles (20260818). The new column is survey-design metadata — a default for a picker — and
-- carries nothing that anon should not read.
--
--
-- =====================================================================
-- ⚠️ THE ALTER IS NOT BELT-AND-BRACES. IT IS THE ONLY THING THAT REPAIRS AN EXISTING DATABASE.
-- =====================================================================
-- Same reasoning as can_proxy_for_affected in 20260818, and it is worth repeating rather than
-- cross-referencing, because the failure is silent in both directions.
--
-- 20260818 creates this table with CREATE TABLE IF NOT EXISTS. On any database that already received
-- an earlier copy of that file, the CREATE is a NO-OP — it does not add columns, it does not error,
-- and it reports success. So a column introduced by editing the CREATE alone would exist on a fresh
-- rebuild and be absent everywhere else, while every consumer read a flag that is not there. The
-- ALTER ... ADD COLUMN IF NOT EXISTS is what makes the two paths converge.
--
-- NOT NULL WITH A DEFAULT IS SAFE ON A POPULATED TABLE HERE because `false` is the correct value for
-- a category nobody has assessed: the flag is opt-in, and a category added later gets `false` and has
-- to be decided explicitly rather than inheriting a recommendation nobody made. The seed below then
-- sets the nine that are true.
--
--
-- =====================================================================
-- ⚠️ WHY THESE NINE — THIS FLAG WILL LOOK ARBITRARY IN SIX MONTHS
-- =====================================================================
-- It is not a popularity list and it is not a guess. The nine are ESRS 1 **AR 23**'s four typical
-- categories of AFFECTED STAKEHOLDERS, decomposed into the granularity this seed happens to use:
--
--   AR 23 category                      seeded codes
--   ─────────────────────────────────────────────────────────────────────────────────────────
--   workers / workers' representatives  own_workforce, workers_rep_own
--     in the own workforce
--   workers / workers' representatives  value_chain_worker, workers_rep_value_chain, supplier
--     in the value chain
--   communities affected by operations  affected_community, civil_society
--     or value-chain activities
--   consumers and end-users             consumer_end_user, customer
--
-- ⚠️ AR 23 GIVES THE **TYPICAL** CATEGORIES, NOT A CLOSED SET — the same caveat 20260818's header
-- records for is_affected, and it governs this column just as hard. So:
--
--     typically_surveyed IS A DEFAULT FOR A UI TO LEAD WITH. IT IS NEVER A RESTRICTION ON WHO MAY
--     BE INVITED.
--
-- A screen may pre-tick these nine. It must not hide the other two, must not refuse an invite to
-- them, and no RPC may ever filter on this column. If a check constraint or a WHERE clause is ever
-- written against it, that is the defect: absence from AR 23's examples excludes nothing and proves
-- nothing, and a company with a specific reason to survey its lenders is not doing anything the
-- standard forbids.
--
-- ⚠️ WHY THESE NINE AND NOT SOME OTHER NINE — ESRS 2 SBM-2 ¶22(a). The engagement disclosure must
-- describe who was engaged WITH REFERENCE TO AR 23's categories. That is the whole selection rule:
-- these are the categories the disclosure has to account for, so these are the ones a round should
-- open with already considered. A default built from anything else — most-used, easiest-to-reach —
-- would produce a survey whose engagement section has gaps it cannot explain.
--
--
-- =====================================================================
-- ⚠️ THE TWO THAT ARE FALSE ARE EXCLUDED FOR BEING USERS, NOT FOR BEING UNIMPORTANT
-- =====================================================================
-- investor_lender and regulator are both legitimate ESRS stakeholder categories and both stay in the
-- table, both is_user = true. The adopted Annex I glossary names investors, lenders and creditors in
-- the definition of USERS of the sustainability statement, explicitly. They are false here because
-- neither is an AFFECTED stakeholder under AR 23, and neither is surveyed in practice.
--
-- That is a statement about the default, not about their value. A PE-backed company may well want
-- investor views, and a company in a heavily-regulated sector may want its regulator's — both are
-- one tick away, and the column must never make them two.
--
--
-- =====================================================================
-- ⚠️ IT IS A FOURTH FACT, AND THAT IS PROVABLE RATHER THAN ASSERTED
-- =====================================================================
-- The obvious objection is that this duplicates is_affected. It does not, and the counter-example is
-- exact: `customer` carries (is_affected, is_user, can_proxy_for_affected) = (false, true, false) and
-- is typically_surveyed = TRUE, while `investor_lender` and `regulator` carry the IDENTICAL triple
-- (false, true, false) and are FALSE.
--
-- Three rows, one boolean triple, two different answers. So typically_surveyed cannot be derived
-- from the existing flags by any combination of them — it is genuinely new information, and the
-- reason is a mapping the booleans do not carry: `customer` maps onto AR 23's consumers-and-end-users
-- category and the other two map onto no AR 23 affected category at all.
--
-- Two of the nine are worth naming because they are the ones that look wrong at a glance:
--   customer        is_affected = false, yet surveyed. A business customer is an end-user of the
--                   products and services, which is AR 23's fourth category. The is_affected flag
--                   answers a different question — whether the undertaking's activities affect their
--                   interests — and 20260818 answers it false for them. Both are correct.
--   civil_society   is_affected = false, is_user = true, can_proxy_for_affected = TRUE, and surveyed
--                   on exactly that basis. ESRS 1 ¶42 names civil society, NGOs and trade unions as
--                   users who can be PROXIES for affected stakeholders — which, for affected
--                   communities, is often the only route there is. Surveying them is how the
--                   communities category gets reached when the community itself cannot be.
--
-- Verify step 4 runs the derivability check as a query rather than leaving it as a claim, the same
-- way 20260818's step 5a does for can_proxy_for_affected. If it ever returns nothing, this column has
-- collapsed into is_affected and is carrying no information.
--
--
-- =====================================================================
-- THIS FILE IS THE RECORD FOR THIS COLUMN, AND 20260818 IS NOT
-- =====================================================================
-- 20260818's seed lists its columns explicitly in both the INSERT and the ON CONFLICT DO UPDATE, and
-- typically_surveyed is in neither. So replaying 20260818 after this file PRESERVES these values on
-- existing rows, and gives any newly-seeded category `false` from the column default — the opt-in
-- posture above. The two files do not fight.
--
-- The corollary, stated the way 20260818 states it: a row hand-edited in the SQL editor is silently
-- reverted by the next run of THIS file, because the UPDATE below reconciles in BOTH directions —
-- it sets false as deliberately as it sets true. Change the flag by editing the array below and
-- re-running, never by editing a row.
--
-- ⚠️ AND IF A TWELFTH CATEGORY IS EVER SEEDED: it gets `false`, silently and correctly, and the
-- decision about it belongs in the array below in the same pass that adds it. The guard raises only
-- when a NAMED code is missing — a rename or a deletion, which would otherwise leave a category that
-- should be surveyed sitting quietly at false.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — ADD COLUMN IF NOT EXISTS and
-- a reconciling UPDATE. No client change ships with it and none is needed.

begin;

alter table public.mr_stakeholder_categories
  add column if not exists typically_surveyed boolean not null default false;

comment on column public.mr_stakeholder_categories.typically_surveyed is
  'Whether a round-creation screen should offer this category BY DEFAULT. True on the nine codes that map to ESRS 1 AR 23''s four typical categories of affected stakeholders (own workforce; value chain workers; affected communities; consumers and end-users), decomposed into this seed''s granularity. The selection rule is ESRS 2 SBM-2 ¶22(a): the engagement disclosure must describe who was engaged with reference to AR 23''s categories, so these are the ones a round has to be able to account for. ⚠️ A DEFAULT, NEVER A RESTRICTION — AR 23 gives TYPICAL categories and not a closed set, so no RPC may filter on this column and no screen may hide the other two. investor_lender and regulator are false for being USERS rather than affected parties (the glossary names investors, lenders and creditors among users), not for being unimportant; a PE-backed company may well want investor views. NOT derivable from the other flags: `customer` is (is_affected, is_user, can_proxy_for_affected) = (f,t,f) and TRUE, while investor_lender and regulator carry the identical triple and are FALSE.';

-- ── The seed, reconciling in both directions ──────────────────────────────────
-- The nine codes appear ONCE, in the array. The guard, the UPDATE and the count all read it, so
-- there is no second list to drift from the first.
do $$
declare
  v_surveyed constant text[] := array[
    -- AR 23: workers and workers' representatives in the own workforce
    'own_workforce', 'workers_rep_own',
    -- AR 23: workers and workers' representatives in the value chain
    'value_chain_worker', 'workers_rep_value_chain', 'supplier',
    -- AR 23: communities affected by operations or value-chain activities.
    -- civil_society is here on its ¶42 proxy capability — often the only route to a community that
    -- cannot be reached directly.
    'affected_community', 'civil_society',
    -- AR 23: consumers and end-users. `customer` is a business end-user of the products and
    -- services; its is_affected = false answers a different question and is also correct.
    'consumer_end_user', 'customer'];
  v_expected int := array_length(v_surveyed, 1);
  v_found    int;
  v_missing  text;
  v_true     int;
begin
  select count(*) into v_found
    from public.mr_stakeholder_categories
   where code = any (v_surveyed);

  if v_found <> v_expected then
    -- Name what was observed, not what probably caused it.
    select string_agg(c, ', ' order by c) into v_missing
      from unnest(v_surveyed) c
     where not exists (select 1 from public.mr_stakeholder_categories where code = c);

    raise exception
      'Cannot seed typically_surveyed: % of the % named categories are missing from '
      'mr_stakeholder_categories (%). A renamed or deleted code would leave a category that should '
      'be surveyed by default sitting silently at false, which presents as a category nobody thought '
      'to invite rather than as an error. Reconcile the array in '
      '20260824_mr_stakeholder_categories_typically_surveyed.sql against the seed in 20260818 first.',
      v_expected - v_found, v_expected, coalesce(v_missing, '(none named)');
  end if;

  -- Sets false as deliberately as it sets true, so a replay reconciles a hand-edited row in either
  -- direction. This file is the record for this column; 20260818 touches it in neither its INSERT
  -- nor its ON CONFLICT DO UPDATE, so the two do not fight.
  update public.mr_stakeholder_categories
     set typically_surveyed = (code = any (v_surveyed));

  select count(*) into v_true
    from public.mr_stakeholder_categories
   where typically_surveyed;

  if v_true <> v_expected then
    raise exception
      'typically_surveyed is true on % rows, expected %. The UPDATE and the array disagree, which '
      'should be impossible — do not proceed on the assumption that the extra rows are harmless.',
      v_true, v_expected;
  end if;
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--
-- 1) The column exists — run this FIRST on any database that may have received an earlier copy of
--    20260818, because CREATE TABLE IF NOT EXISTS would have been a no-op there and the ALTER is
--    what repairs it:
--    select column_name, data_type, is_nullable, column_default
--      from information_schema.columns
--     where table_schema = 'public' and table_name = 'mr_stakeholder_categories'
--       and column_name = 'typically_surveyed';
--    -- expect 1 row: boolean | NO | false
--
-- 2) Nine true, two false, and the two false are the right two:
--    select count(*) filter (where typically_surveyed) as surveyed,
--           count(*) filter (where not typically_surveyed) as not_surveyed,
--           count(*) as total
--      from public.mr_stakeholder_categories;                          -- expect 9 | 2 | 11
--    select code from public.mr_stakeholder_categories
--     where not typically_surveyed order by code;
--    -- expect exactly: investor_lender, regulator
--
-- 3) The nine map onto AR 23's four categories, checked against the routing rather than by eye —
--    every s1 and s2 category is surveyed, and the not_asked ones split:
--    select labour_routing,
--           count(*) filter (where typically_surveyed) as surveyed,
--           string_agg(code, ', ' order by sort_order) filter (where typically_surveyed) as which
--      from public.mr_stakeholder_categories group by 1 order by 1;
--    -- expect  not_asked | 4 | affected_community, consumer_end_user, customer, civil_society
--    --         s1        | 2 | own_workforce, workers_rep_own
--    --         s2        | 3 | value_chain_worker, workers_rep_value_chain, supplier
--    -- ⚠️ Every s1 and s2 category MUST be surveyed by default: those five are AR 23's two worker
--    -- categories, and they are also the only respondents who can answer the twelve labour
--    -- sub-topics at all. A round that does not invite them yields unknown S1 or unknown S2
--    -- (spec v8 §6.3) — so this is a check on the survey being answerable, not only on the
--    -- disclosure being complete.
--
-- 4) ⚠️ IT IS A FOURTH FACT, NOT A RESTATEMENT. Three rows share the boolean triple
--    (is_affected, is_user, can_proxy_for_affected) = (false, true, false) and do NOT share
--    typically_surveyed. If this returns fewer than 3 rows, or all three now agree, the column has
--    collapsed into the others and is carrying no information:
--    select code, is_affected, is_user, can_proxy_for_affected, typically_surveyed
--      from public.mr_stakeholder_categories
--     where not is_affected and is_user and not can_proxy_for_affected
--     order by code;
--    -- expect exactly 3 rows: customer (t), investor_lender (f), regulator (f)
--
--    -- and the blunter form of the same check — it must not be derivable from is_affected:
--    select code, is_affected, typically_surveyed from public.mr_stakeholder_categories
--     where is_affected <> typically_surveyed order by code;
--    -- expect customer and civil_society, both is_affected = f and typically_surveyed = t
--
-- 5) NOTHING FILTERS ON IT, AND NOTHING MAY. AR 23 is a list of examples, not a closed set, so this
--    column is a UI default and never a gate. Re-run this after any survey work:
--    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.prosrc ilike '%typically_surveyed%';
--    -- expect ZERO rows. A hit means an RPC is filtering on a default, and a company with a reason
--    -- to survey its lenders has been silently prevented from doing so.
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.mr_stakeholder_categories'::regclass
--       and pg_get_constraintdef(oid) ilike '%typically_surveyed%';
--    -- expect ZERO rows
--
-- 6) A replay reconciles a hand-edited row in BOTH directions — this file is the record:
--    begin;
--      update public.mr_stakeholder_categories set typically_surveyed = true  where code = 'regulator';
--      update public.mr_stakeholder_categories set typically_surveyed = false where code = 'supplier';
--      -- now re-run the do $$ ... $$ block above, then:
--      select code, typically_surveyed from public.mr_stakeholder_categories
--       where code in ('regulator', 'supplier') order by code;
--      -- expect regulator | f   and   supplier | t   (both put back)
--    rollback;
--
-- 7) The guard fires on a missing named code rather than seeding nine minus one, silently:
--    begin;
--      update public.mr_stakeholder_categories set code = 'customer_renamed' where code = 'customer';
--      -- re-run the do $$ ... $$ block above
--      -- expect ERROR: Cannot seed typically_surveyed: 1 of the 9 named categories are missing ...
--      --               (customer)
--    rollback;
--
-- 8) Existing columns are untouched — this file adds, it does not restate:
--    select code, track, labour_routing, is_affected, is_user, can_proxy_for_affected,
--           typically_surveyed
--      from public.mr_stakeholder_categories order by sort_order;
--    -- expect the 20260818 seed unchanged in the first six columns, plus the new flag
