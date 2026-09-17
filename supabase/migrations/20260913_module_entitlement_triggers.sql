-- 20260913_module_entitlement_triggers.sql
--
-- ⚠️ RUN. Verified live on 16 Sep 2026: both triggers this file attaches are present —
-- trg_enforce_materiality_entitlement and trg_enforce_cbam_entitlement.
--
-- ⚠️ TWO TRIGGERS, NOT THREE. The supply-chain gate, trg_enforce_supply_chain_entitlement, is
-- attached by 20260913_supply_chain_registers.sql, not by this file — it is created alongside the
-- table it guards. All three entitlement gates are live, but they come from two migrations, and
-- this file's own post-flight asserts exactly 2. Counting three here would make that assertion
-- look broken.
--
-- ⚠️ RE-RUNNING IS INERT — and this file is the only one of the five corrected today that is.
-- Reading the statements rather than the IF EXISTS clauses: the pre-flight checks only that four
-- dependency tables exist, which they do; both functions are CREATE OR REPLACE FUNCTION, which
-- rewrites the same body; both triggers are `drop trigger if exists` immediately followed by
-- `create trigger`, which lands the same definition; and the post-flight asserts 2 triggers,
-- INSERT-only, which holds. Nothing is inserted, updated or deleted.
--   The one thing to know: the drop-and-recreate means each gate is momentarily absent DURING the
-- transaction. That window is inside begin/commit and invisible to other sessions, so no insert
-- can slip past unguarded — but it is why the pair is a pair and not an ALTER.
--
-- Binary entitlement enforcement on materiality_assessments and cbam_installations: may this
-- user create one at all. Modelled on enforce_deals_free_tier_cap(), which is the closest
-- existing shape.
--
-- ── WHY THIS IS NEEDED ───────────────────────────────────────────────────────────────────────
-- Before this file, exactly two functions in the whole schema read public.entitlements:
-- enforce_ghg_location_allowance() and enforce_deals_free_tier_cap(). No RLS policy reads it at
-- all — every policy is ownership-only. So materiality and CBAM were gated in the client and
-- nowhere else, and a signed-in user with an expired term (or none) could insert directly with
-- the anon key and RLS would allow it, because RLS asks who owns the row, not who paid for it.
--
-- ── SCOPE: THE ROOT TABLE OF EACH MODULE, AND NOTHING BELOW IT ───────────────────────────────
-- This is a deliberate, bounded decision, not an oversight, and the boundary is worth stating
-- precisely so the next reader finds a decision rather than a gap.
--
-- Thirty-four tables hold per-account work with no entitlement enforcement. This file gates two
-- of them. Left unenforced, by module:
--
--   materiality (8): materiality_survey_rounds, materiality_survey_questions,
--     materiality_survey_respondents, materiality_assessment_survey_rounds,
--     materiality_impact_assignments, materiality_impact_assignment_subtopics,
--     materiality_impact_determinations, materiality_impact_assignee_determinations
--
--   cbam (10): cbam_operator_profile, cbam_production_processes, cbam_process_parameters,
--     cbam_precursor_inputs, cbam_charge_mix, cbam_see_records, cbam_source_streams,
--     cbam_source_documents, cbam_installation_disclosures, cbam_verifier_access
--
-- What that means concretely: an expired CBAM customer cannot add a NEW installation, but can
-- still insert production processes against an installation they already own. Gating the root
-- closes the normal path — every child is created through a parent the UI made first — and does
-- not close a crafted insert. That was judged the right trade for now: the children are numerous,
-- several are written by RPCs, and a trigger on each is a larger change with more ways to break a
-- paying customer than an unpaid one.
--
-- ── BEFORE INSERT ONLY, ON BOTH ──────────────────────────────────────────────────────────────
-- An expired customer must keep being able to edit and delete what they already own. That is the
-- rule 20260909_verifier_invite_term_gate.sql states outright and enforce_deals_free_tier_cap()
-- implements by not firing on UPDATE. enforce_ghg_location_allowance() is the exception that
-- proves it: it fires on UPDATE too because it caps a row's CONTENTS, not whether the row may
-- exist. These two cap existence, so INSERT is the whole question.
--
-- ── errcode PT402, NOT THE DEFAULT P0001 ─────────────────────────────────────────────────────
-- The two API routes that insert assessments have to tell this refusal apart from every other
-- error, because this message is customer-facing copy and theirs is not. Matching on the default
-- P0001 would also catch any future raise from any other trigger on the table; matching on the
-- message text would break on a wording change. PT402 follows the repo's existing PT4xx
-- convention (PT409, PT410, PT412, PT413, PT414), mapped to HTTP semantics — 402 is payment
-- required, which is exactly what this is.
--
-- ⚠️ DO NOT RUN THIS BEFORE THE ROUTE CHANGE THAT READS PT402.
-- app/api/materiality/route.ts and app/api/materiality/resilience/route.ts both swallowed a save
-- error into a generic 500 ('Failed to save assessment' / 'Failed to save analysis'). Run this
-- first and a lapsed customer gets generic failure text where a licence decision belongs, which
-- is worse than no trigger at all. The CBAM writer needs no change: cbam/setup/page.tsx already
-- surfaces error.message verbatim, deliberately.

begin;

-- ── PRE-FLIGHT ───────────────────────────────────────────────────────────────────────────────
-- Aborts the whole transaction rather than attaching one trigger and skipping the other, which
-- would leave one module gated and one open with nothing saying so.
do $$
begin
  if to_regclass('public.materiality_assessments') is null then
    raise exception 'Pre-flight: public.materiality_assessments does not exist. Nothing attached.';
  end if;
  if to_regclass('public.cbam_installations') is null then
    raise exception 'Pre-flight: public.cbam_installations does not exist. Nothing attached.';
  end if;
  if to_regclass('public.entitlements') is null then
    raise exception 'Pre-flight: public.entitlements does not exist. Both triggers below read it.';
  end if;
  if to_regclass('public.companies') is null then
    raise exception 'Pre-flight: public.companies does not exist. The CBAM owner hop reads it.';
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. materiality_assessments
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.enforce_materiality_entitlement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  has_active      boolean;
  had_entitlement boolean;
begin
  -- An ACTIVE pass is required to create an assessment. Strictly greater, matching
  -- enforce_deals_free_tier_cap() and enforce_ghg_location_allowance(): a term ending exactly
  -- now is over.
  --
  -- ⚠️ THE KEY IS 'double-materiality', NOT 'climate-risk'. They were split on 22 Aug 2026 and
  -- are different products — climate-risk SCREENS (a wizard scoring ten ESRS topics), this
  -- ASSESSES (stakeholder survey, delegation, divergence register). See the note above the
  -- ModuleKey union in lib/pricing.ts. Keying this on 'climate-risk' would gate the wrong
  -- product and let every materiality customer through, or block them.
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.user_id
      and e.module_key = 'double-materiality'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    -- The SAME query WITHOUT the term clause. The difference between the two is the whole point:
    -- it separates "expired" from "never bought", which is the only distinction the customer can
    -- act on. Told the wrong one, a lapsed customer is invited to buy something they already own.
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.user_id
        and e.module_key = 'double-materiality'
    ) into had_entitlement;

    if had_entitlement then
      raise exception 'Your Materiality Assessment access has expired. Renew to start a new assessment. Your existing assessments are still here and still readable.'
        using errcode = 'PT402';
    else
      raise exception 'Starting an assessment requires the Materiality Assessment module. Your answers are still on screen — purchase to save them.'
        using errcode = 'PT402';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_materiality_entitlement on public.materiality_assessments;
create trigger trg_enforce_materiality_entitlement
  before insert on public.materiality_assessments
  for each row execute function public.enforce_materiality_entitlement();

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. cbam_installations
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.enforce_cbam_entitlement()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_user_id       uuid;
  has_active      boolean;
  had_entitlement boolean;
begin
  -- ── THE OWNER HOP ──────────────────────────────────────────────────────────────────────────
  -- cbam_installations is keyed by company_id, not user_id, so the owner is resolved through
  -- companies. This is the one structural difference from the materiality trigger above.
  --
  -- SECURITY DEFINER is what makes this read work: an invoker-rights lookup would be subject to
  -- the caller's own RLS on companies. Same posture materiality_assessment_survey_round_link_guard()
  -- documents for its own cross-table read.
  select c.user_id into v_user_id
    from public.companies c
   where c.id = new.company_id;

  -- ABSENCE IS RESTRICTIVE. `select ... into` leaves v_user_id null both when no row matches and
  -- when the row's user_id is null, so one test covers both. Answering "allow" here would make a
  -- missing company row the way past the gate.
  --
  -- Unreachable in practice and written anyway: cbam_installations.company_id is NOT NULL, its FK
  -- to companies(id) is ON DELETE CASCADE so it cannot dangle, and companies.user_id is NOT NULL.
  -- The branch exists so this function has no path that falls through silently.
  if v_user_id is null then
    raise exception 'Could not establish who owns this installation, so it was not saved. Reload the page and try again.'
      using errcode = 'PT402';
  end if;

  select exists (
    select 1 from public.entitlements e
    where e.user_id = v_user_id
      and e.module_key = 'cbam'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    select exists (
      select 1 from public.entitlements e
      where e.user_id = v_user_id
        and e.module_key = 'cbam'
    ) into had_entitlement;

    if had_entitlement then
      raise exception 'Your CBAM access has expired. Renew to add another installation. Your existing installations are still here and still readable.'
        using errcode = 'PT402';
    else
      raise exception 'Adding an installation requires the CBAM module. Your entries are still on screen — purchase to save them.'
        using errcode = 'PT402';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_cbam_entitlement on public.cbam_installations;
create trigger trg_enforce_cbam_entitlement
  before insert on public.cbam_installations
  for each row execute function public.enforce_cbam_entitlement();

-- ── POST-FLIGHT ──────────────────────────────────────────────────────────────────────────────
-- Asserting is cheaper than assuming, and a half-applied gate is worse than none: it reads as
-- covered while one module stays open.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not t.tgisinternal
     and t.tgname in ('trg_enforce_materiality_entitlement', 'trg_enforce_cbam_entitlement');
  if v_n <> 2 then
    raise exception 'Post-flight: expected 2 entitlement triggers, found %.', v_n;
  end if;

  -- tgtype bit 2 (value 4) = INSERT, bit 4 (value 16) = UPDATE. UPDATE must be OFF on both, or an
  -- expired customer loses the ability to edit work they already own.
  select count(*) into v_n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and not t.tgisinternal
     and t.tgname in ('trg_enforce_materiality_entitlement', 'trg_enforce_cbam_entitlement')
     and (t.tgtype & 4) = 4
     and (t.tgtype & 16) = 0;
  if v_n <> 2 then
    raise exception 'Post-flight: both triggers must be INSERT-only; % of 2 are.', v_n;
  end if;

  raise notice 'Entitlement gates attached to materiality_assessments and cbam_installations (BEFORE INSERT, errcode PT402).';
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- 1) Both triggers, INSERT-only?
--    select c.relname, t.tgname, t.tgtype from pg_trigger t
--      join pg_class c on c.oid = t.tgrelid
--     where t.tgname in ('trg_enforce_materiality_entitlement','trg_enforce_cbam_entitlement')
--       and not t.tgisinternal;
-- 2) A PAYING customer can still insert. Test as an entitled user before trusting this.
-- 3) An EXPIRED customer can still UPDATE and DELETE their own rows — this is the behaviour the
--    INSERT-only choice exists to preserve, and it is the one worth checking by hand.
-- 4) The refusal reaches the customer, not a generic 500: run an insert as an unentitled user
--    through /api/materiality and confirm the response body carries the trigger's sentence.
