-- 20260928_concierge_source_model.sql
--
-- Concierge moves from location bands to data sources. This file adds the columns the new
-- model writes, re-keys the single existing Concierge row, and narrows concierge_jobs.
--
-- ⚠️ RUN THIS BEFORE DEPLOYING THE BATCH 3 CODE. The webhook writes entitlements.ghg_tier and
-- entitlements.source_allowance. Deployed against a database without them, every grant fails, and
-- the failure is a 500 to Stripe, which retries: a customer pays and waits for access that cannot
-- be written. The reverse order is safe. The columns sit unused until the code arrives.
--
-- ⚠️ IT IS NOT RE-RUNNABLE AND THAT IS DELIBERATE. Every assertion below raises rather than
-- skipping. A second run would find zero rows to re-key, which is indistinguishable from a first
-- run against the wrong database, so it stops instead of guessing which one happened.
--
-- Counted before this was written, 28 Sep 2026: entitlements rows under the three concierge-* keys
-- = 1 (a developer test grant), concierge_jobs = 0, concierge_job_documents = 0,
-- concierge_proposals = 0. There are no customer rows to map, which is why the re-key below is a
-- single targeted update and not a migration strategy.

begin;

-- ── 1. entitlements.ghg_tier ────────────────────────────────────────────────
-- The GHG tier, recorded directly. location_allowance cannot identify it: null means Advisory
-- under the current model and uncapped under the pre-rescope one, and that ambiguity is what
-- forces the Concierge onboarding fee to reject rather than guess a price.
-- Nullable, because every row written before this column existed has no value to put in it.
--
-- ⚠️ THE THREE VALUES ARE MIRRORED IN lib/pricing.ts AS GHG_TIER_KEYS. A fourth tier added there
-- without altering this constraint fails AFTER payment, on the webhook write. lib/pricing.test.ts
-- pins the two together.
alter table public.entitlements
  add column ghg_tier text
  constraint entitlements_ghg_tier_check
  check (ghg_tier is null or ghg_tier in ('starter', 'professional', 'advisory'));

comment on column public.entitlements.ghg_tier is
  'GHG tier key, written by checkout/create-invoice from the cart. Null on rows predating the column and on non-GHG rows. Sets the Concierge onboarding fee.';

-- ── 2. entitlements.source_allowance ────────────────────────────────────────
-- Concierge data sources purchased. The counterpart of location_allowance, following the same
-- convention: written only onto the row it describes, null everywhere else.
--
-- ⚠️ NULL HERE DOES NOT MEAN UNCAPPED. location_allowance's null is uncapped because
-- enforce_ghg_location_allowance() reads it that way. Nothing enforces source_allowance yet, so
-- its null means "not recorded". Whatever enforces it later has to decide which of the two it is,
-- and say so in this comment.
alter table public.entitlements
  add column source_allowance integer
  constraint entitlements_source_allowance_check
  check (source_allowance is null or source_allowance >= 0);

comment on column public.entitlements.source_allowance is
  'Concierge data sources purchased, written onto the concierge row. Null means not recorded, NOT uncapped. Nothing enforces it yet.';

-- ── 3. Backfill ghg_tier on the one GHG row ─────────────────────────────────
-- One GHG row exists and it is the developer test account. location_allowance is null on it, so
-- the fallback derivation cannot identify a tier. Advisory is the correct answer and is set here
-- explicitly. location_allowance stays null: Advisory is uncapped and the trigger reads it so.
do $$
declare
  affected integer;
begin
  update public.entitlements
     set ghg_tier = 'advisory'
   where user_id = '81a8962f-3e5c-40a3-8145-1ac01426df5c'
     and module_key = 'ghg';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception
      'ghg_tier backfill: expected exactly 1 row, updated %. Nothing has been committed. Inspect public.entitlements for that user before running this file again.',
      affected;
  end if;
end $$;

-- ── 4. Re-key the one Concierge row ─────────────────────────────────────────
-- The band keys are replaced by a single 'concierge' key. This row is a developer test grant, so
-- it is re-keyed rather than deleted: the account keeps Concierge access for testing, with its
-- source and term untouched. 60 sources matches CONCIERGE_MAX_SELF_SERVE_SOURCES in lib/pricing.ts.
-- Selected on module_key AND source together, because module_key alone would match a customer row
-- if this file were ever run against a database that has one.
do $$
declare
  affected integer;
begin
  update public.entitlements
     set module_key = 'concierge',
         source_allowance = 60
   where module_key = 'concierge-basic'
     and source = 'manual-test';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception
      're-key: expected exactly 1 concierge-basic row with source manual-test, updated %. Nothing has been committed. Count the concierge-* rows before running this file again.',
      affected;
  end if;
end $$;

-- Nothing may remain on the old keys. If a row appeared between the count and this run, it is a
-- customer row and it needs a decision, not a migration.
do $$
declare
  leftovers integer;
begin
  select count(*) into leftovers
    from public.entitlements
   where module_key in ('concierge-basic', 'concierge-standard', 'concierge-enterprise');
  if leftovers <> 0 then
    raise exception
      're-key: % row(s) still hold an old concierge-* key. Nothing has been committed. Those are unmapped purchases and need a decision before this file runs.',
      leftovers;
  end if;
end $$;

-- ── 5. concierge_jobs ───────────────────────────────────────────────────────
-- The table encodes the old model in two columns. Its tier CHECK would reject every row the new
-- code writes, and location_count is the wrong axis. The table is empty, so this is a definition
-- change with no data to migrate. location_count is KEPT: it is still a fact worth recording about
-- a job, it is simply no longer what the job is priced on.
do $$
declare
  jobs integer;
begin
  select count(*) into jobs from public.concierge_jobs;
  if jobs <> 0 then
    raise exception
      'concierge_jobs holds % row(s). Nothing has been committed. The tier CHECK below would reject them; map them before running this file.',
      jobs;
  end if;
end $$;

alter table public.concierge_jobs drop constraint concierge_jobs_tier_check;

alter table public.concierge_jobs
  add constraint concierge_jobs_tier_check check (tier = 'concierge');

alter table public.concierge_jobs
  add column source_count integer
  constraint concierge_jobs_source_count_check
  check (source_count is null or source_count >= 0);

comment on column public.concierge_jobs.source_count is
  'Data sources in scope for this job. Nullable: jobs predating the source model have none. location_count is kept alongside as a fact about the customer, not a price input.';

commit;
