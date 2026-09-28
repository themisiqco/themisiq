-- 20260928_ghg_employee_bands.sql
--
-- GHG plans move from location bands to employee bands. This file widens the ghg_tier CHECK to the
-- five new keys and adds the employee count the customer states at checkout.
--
-- ⚠️ APPLY THIS BEFORE PUSHING THE BATCH 3 TO 6 CODE. Batch 3 adds two tier keys and batch 4 writes
-- employee_count. Deployed against a database without them, a purchase on a new tier fails the
-- CHECK after payment, and that failure is a 500 to Stripe, which retries a grant that can never
-- succeed. The constraint and the column are inert until the code arrives, so this order is safe
-- and the reverse is not.
--
-- ⚠️ IT WIDENS AND ADDS. IT REMOVES NOTHING. location_allowance stays and keeps its meaning until
-- the batch that retires the cap. Every existing row keeps its tier except the one named below.

begin;

-- ── 1. The tier keys ────────────────────────────────────────────────────────
-- ⚠️ FIVE VALUES, MIRRORED IN lib/pricing.ts AS GHG_TIER_KEYS. M22 and M23 in
-- lib/entitlementMetadata.test.ts tie the two together, so a key added on one side without the
-- other fails a test rather than a customer's purchase. M23 asserts a SUBSET, not equality, because
-- this file runs BEFORE the code that uses the new keys deploys: between the two there are values
-- the database permits and TypeScript does not, and that window is the safe ordering.
--
-- 'business' and 'enterprise' are new. 'advisory' is kept and CHANGES MEANING: it was the
-- quote-only tier and becomes the 250 to 499 band at a published price. 'enterprise' is the quote
-- path now, reached through the admin invoice route, which writes ghg_tier like any other purchase.
alter table public.entitlements drop constraint entitlements_ghg_tier_check;

alter table public.entitlements
  add constraint entitlements_ghg_tier_check
  check (ghg_tier is null or ghg_tier in ('starter', 'professional', 'business', 'advisory', 'enterprise'));

-- ── 2. The stated employee count ────────────────────────────────────────────
-- ⚠️ THE NUMBER THE CUSTOMER ASSERTED, NOT A DERIVED BAND. ghg_tier records the band that was
-- priced; this records what they told us it was based on and confirmed in the consent step. The two
-- are kept apart because a band derived from a count would move if the bands ever move, and a
-- purchase must not re-band itself retroactively. If they ever disagree, ghg_tier is what was sold
-- and this is what was claimed, which is exactly the pair a billing question needs.
--
-- Nullable: rows written before this column existed have no value to put in it, and non-GHG rows
-- never will. The CHECK starts at 1 because a company with no employees is not a customer, and 0
-- would be the kind of value that reads as "not stated" while pricing as a real band.
alter table public.entitlements
  add column employee_count integer
  constraint entitlements_employee_count_check
  check (employee_count is null or employee_count >= 1);

comment on column public.entitlements.employee_count is
  'Employee count stated by the customer at checkout and confirmed in the consent step, written onto the ghg row. Null on non-GHG rows and on rows predating the column. The band that was priced is ghg_tier, never derived from this.';

-- ── 3. The one existing GHG row ─────────────────────────────────────────────
-- One GHG row exists and it is the developer test account, carrying ghg_tier 'advisory' set by
-- 20260928_concierge_source_model.sql to mean the quote-only, uncapped tier. That key now names a
-- priced 250 to 499 band, so leaving it would give the row a meaning nobody chose. 'enterprise' is
-- what it actually is. Decided 28 Sep 2026 rather than left implied by omission.
do $$
declare
  affected integer;
begin
  update public.entitlements
     set ghg_tier = 'enterprise'
   where user_id = '81a8962f-3e5c-40a3-8145-1ac01426df5c'
     and module_key = 'ghg'
     and ghg_tier = 'advisory';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception
      'ghg_tier re-key: expected exactly 1 advisory ghg row for the test account, updated %. Nothing has been committed. Read the ghg rows before running this file again.',
      affected;
  end if;
end $$;

-- No row may hold a tier the new constraint would reject. The CHECK enforces this on write; this
-- reads it back, so a row written by something outside these routes is caught here rather than on
-- its next update, which could be months later and somebody else's problem.
do $$
declare
  strays integer;
begin
  select count(*) into strays
    from public.entitlements
   where ghg_tier is not null
     and ghg_tier not in ('starter', 'professional', 'business', 'advisory', 'enterprise');
  if strays <> 0 then
    raise exception
      '% row(s) hold a ghg_tier outside the five permitted keys. Nothing has been committed.', strays;
  end if;
end $$;

commit;
