-- supabase/migrations/20260848_materiality_finalisation.sql
-- The missing finish line: an explicit, versioned finalisation of an impact materiality assessment,
-- which COPIES the disclosure requirements in force at that moment.
--
-- WHY THIS EXISTS. An assessment has no single event meaning "final". The lead submits what they
-- hold (materiality_lead_submit, 20260844); each contributor submits theirs from their own link
-- (impact_submit, 20260840). A FULLY DELEGATED ASSESSMENT CAN BE COMPLETE WITH THE LEAD'S RPC NEVER
-- CALLABLE — it raises 'Every one of the N sub-topics in scope is assigned to a contributor, so
-- none of them is yours to submit.' So "submitted" is a property of rows, not of the assessment,
-- and nothing anywhere marks the whole.
--
-- WHY IT COPIES RATHER THAN POINTS. mr_esrs_disclosure_requirements is reference data that changes:
-- 20260845 rewrote E1-11's title on 21 Aug 2026. The board report resolves requirements at
-- generation, so two downloads of one paper a month apart can carry different requirement text with
-- nothing on the document explaining it. Every OTHER input to that paper is stabilised by its own
-- mechanism — determinations by status='submitted', the threshold by the round's snapshotted
-- top_box_high_min_share (20260843), the round by frozen_at, sub-topic names by standard_version.
-- The requirement rows were the only one without. This is that mechanism.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260848_materiality_finalisation.sql
-- Without it psql continues past a failed statement and still exits 0, so a migration can land
-- half-applied while the transcript reads clean — tables present, trigger absent, grants missing.
-- The Supabase SQL editor stops on error by default. Either way this file is wrapped in
-- begin/commit, so a failure rolls the whole thing back.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS before CREATE, guarded policies, COMMENT ON.
--
-- ⚠️ THESE TABLES ARE INERT UNTIL THE RPC LANDS, AND THAT IS DELIBERATE. authenticated holds SELECT
-- and nothing else, so nothing can write a finalisation yet. Granting INSERT "ready for" the RPC
-- would let a client fabricate a finalisation with arbitrary requirement text — the exact forgery
-- copying the rows is meant to prevent. Same reasoning as 20260838's refusal to pre-grant anon.
--
-- DEPENDS ON 20260838 (materiality_assessments unique (id, user_id)) and 20260817
-- (mr_esrs_disclosure_requirements, the source of the copied rows).

begin;

-- =====================================================================
-- 1. The finalisation event
-- =====================================================================
create table if not exists public.materiality_finalisations (
  assessment_id uuid not null,
  user_id       uuid not null default auth.uid(),

  -- ⚠️ ALLOCATED BY THE DATABASE, NEVER BY THE CALLER. See the trigger below. NOT NULL with no
  -- DEFAULT is what lets the BEFORE trigger fill it: constraints are checked after BEFORE ROW
  -- triggers fire, so an INSERT that omits version reaches the trigger as null and leaves it set.
  version       int  not null,

  finalised_at  timestamptz not null default now(),

  -- The version stated ON THE ASSESSMENT at the moment of finalisation, copied.
  --
  -- ⚠️ NULLABLE, AND A NULL IS A REAL STATE. Art. 2(2) permits an unstated version and
  -- materiality_assessments allows null. A finalisation with a null version copies NO requirement
  -- rows — there is no version to select them for, and there is deliberately no fallback to
  -- DR_FALLBACK_VERSION here: the climate-risk path may fall back only because drResolutionNote
  -- discloses it on the report's face, and an undisclosed fallback would freeze one standard's
  -- requirements under another standard's name. 49 codes exist under both versions with different
  -- titles, so that is not a stale-label problem.
  --
  -- ⚠️ NO CHECK ON THE PERMITTED VALUES, and it is not an omission. This is a copy of a column
  -- materiality_assessments already validates (materiality_assessments_standard_version_check,
  -- 20260816). Restating the list here would be a second copy free to drift from the first — the
  -- position materiality_impact_assignee_determinations states at 20260839:266-269.
  standard_version text,

  constraint materiality_finalisations_pkey primary key (assessment_id, version),

  -- ⚠️ OWNERSHIP AS A DATABASE FACT, NOT A POLICY'S PROMISE. The idiom from
  -- materiality_impact_assignee_determinations (20260839:257-260): the row's user_id must match the
  -- parent assessment's, enforced by the FK. A policy alone would leave a service-role path free to
  -- write a finalisation under the wrong owner.
  constraint materiality_finalisations_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade
);

-- RLS filters every read on user_id; the PK's prefix is assessment_id and does not serve it.
create index if not exists materiality_finalisations_user_idx
  on public.materiality_finalisations (user_id);

-- =====================================================================
-- 2. Version allocation
-- =====================================================================
-- ⚠️ TWO MECHANISMS, AND THE ORDER OF TRUST MATTERS.
--
--   THE PRIMARY KEY IS THE CORRECTNESS. (assessment_id, version) is unique, so two rows can never
--   share a version whatever happens above it. That guarantee does not depend on any future writer
--   remembering to do anything.
--
--   THE ADVISORY LOCK IS THE ERGONOMICS. Without it, two concurrent finalisations both read
--   max(version) = 1, both attempt 2, and the loser receives a unique-violation it did nothing
--   wrong to earn. The lock turns that loser into a waiter. It is TRANSACTION-scoped, so it
--   releases on commit or rollback with nothing to clean up, and it is keyed on the assessment, so
--   two different assessments never block each other.
--
-- ⚠️ NOT A SEQUENCE. A sequence is global; per-assessment versions would come out 1, 7, 12. The
-- version is a count of THIS assessment's finalisations and must read as one.
--
-- ⚠️ IN A TRIGGER, NOT IN THE RPC, so a second writer cannot get it wrong. The RPC is the only
-- writer today; the trigger is what keeps that from being load-bearing.
create or replace function public.materiality_finalisation_allocate_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.version is not null then
    raise exception
      'The finalisation version is allocated by the database, not supplied by the caller. Omit it.'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.assessment_id::text, 0));

  select coalesce(max(f.version), 0) + 1
    into new.version
    from public.materiality_finalisations f
   where f.assessment_id = new.assessment_id;

  return new;
end $$;

drop trigger if exists materiality_finalisations_allocate_version on public.materiality_finalisations;
create trigger materiality_finalisations_allocate_version
  before insert on public.materiality_finalisations
  for each row execute function public.materiality_finalisation_allocate_version();

-- =====================================================================
-- 3. The frozen requirements
-- =====================================================================
create table if not exists public.materiality_finalisation_requirements (
  assessment_id uuid not null,
  version       int  not null,
  user_id       uuid not null default auth.uid(),

  -- ⚠️ COPIED, NOT REFERENCED, AND THERE IS DELIBERATELY NO FK TO
  -- mr_esrs_disclosure_requirements. Such an FK would prove the code existed and would preserve
  -- nothing that matters: title and datapoints are exactly what 20260845 changed. Worse, it would
  -- make a historical record's survival depend on re-seedable reference data, and BOTH delete
  -- behaviours are wrong for an archive — RESTRICT lets a finalised assessment block a legitimate
  -- correction to the reference table, CASCADE deletes the frozen evidence when someone re-seeds.
  -- Copying is the mechanism; an FK would re-couple what copying decoupled. Provenance is carried
  -- by materiality_finalisations.standard_version and .finalised_at.
  dr_code    text     not null,
  topic_code text     not null,
  title      text     not null,
  datapoints text,
  sort_order smallint not null,

  -- ⚠️ NO CHECK CONSTRAINTS ON ANY OF THE ABOVE. This is a copy of rows
  -- mr_esrs_disclosure_requirements already validated, and restating those rules here would be a
  -- second copy free to drift from the first — materiality_impact_assignee_determinations:266-269
  -- states the position and this follows it. NOT NULL is kept where the source has it, because that
  -- is a statement about this table's own shape rather than a restatement of the source's rules.
  --
  -- ⚠️ datapoints STAYS NULLABLE, AND NULL MEANS 'not yet written', NEVER 'nothing to collect'.
  -- Every esrs_2026 row is null today. A consumer rendering it as an empty cell under a
  -- "data to collect" heading has turned an absence into a finding.

  constraint materiality_finalisation_requirements_pkey
    primary key (assessment_id, version, dr_code),

  constraint materiality_finalisation_requirements_parent_fkey
    foreign key (assessment_id, version)
    references public.materiality_finalisations (assessment_id, version) on delete cascade,

  -- The same ownership fact as the parent, enforced independently. The parent's PK does not carry
  -- user_id, so this cannot be inherited through the parent FK and is stated here on its own.
  constraint materiality_finalisation_requirements_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade
);

create index if not exists materiality_finalisation_requirements_user_idx
  on public.materiality_finalisation_requirements (user_id);

-- The read the board report will make: one finalisation's rows, in the order the roadmap prints
-- them. topic_code then sort_order is the exact shape of mr_esrs_disclosure_requirements' own index.
create index if not exists materiality_finalisation_requirements_order_idx
  on public.materiality_finalisation_requirements (assessment_id, version, topic_code, sort_order);

-- =====================================================================
-- 4. RLS
-- =====================================================================
-- One _owner_all policy per table, the newer convention — matching mia/mias/mid (20260838:540-560)
-- and mi1 (20260847), NOT the four per-verb policies on materiality_assessments. Four policies are
-- four places for a verb to be forgotten; one FOR ALL with both USING and WITH CHECK cannot be
-- half-written.
alter table public.materiality_finalisations             enable row level security;
alter table public.materiality_finalisation_requirements enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'materiality_finalisations'
                    and policyname = 'mfin_owner_all') then
    create policy mfin_owner_all on public.materiality_finalisations
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'materiality_finalisation_requirements'
                    and policyname = 'mfreq_owner_all') then
    create policy mfreq_owner_all on public.materiality_finalisation_requirements
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- =====================================================================
-- 5. Grants — RLS is not a grant. A policy on a table nobody holds a
--    privilege for does nothing, and the reverse fails silently on the
--    service-role path.
-- =====================================================================
revoke all on public.materiality_finalisations             from anon, authenticated, service_role;
revoke all on public.materiality_finalisation_requirements from anon, authenticated, service_role;

-- ⚠️ SELECT AND NOTHING ELSE, ON BOTH. A finalisation is an assertion a report prints and a
-- verifier may read. Client INSERT would let a preparer write one with arbitrary requirement text,
-- which is the forgery copying the rows exists to prevent; client UPDATE would let a frozen record
-- be edited after the fact, which is the drift freezing exists to prevent. Same posture, and the
-- same reason, as materiality_impact_assignee_determinations: the only way a row gets in there is a
-- real event.
--
-- NO DELETE ON EITHER. A finalisation is evidence. Rows go when the assessment goes, by cascade.
-- Superseding a finalisation is finalising again — version 2 — not erasing version 1.
--
-- NOTHING TO anon. There is no token path to either table and none is planned.
grant select on public.materiality_finalisations             to authenticated;
grant select on public.materiality_finalisation_requirements to authenticated;

grant all on public.materiality_finalisations             to service_role;
grant all on public.materiality_finalisation_requirements to service_role;

-- =====================================================================
-- 6. Comments
-- =====================================================================
comment on table public.materiality_finalisations is
  'An explicit, versioned finish line for an impact materiality assessment, and the parent of the disclosure requirements frozen at that moment. Exists because nothing else marks an assessment final: the lead submits what they hold and each contributor submits theirs, so "submitted" is a property of rows, and a FULLY DELEGATED assessment can be complete with materiality_lead_submit never callable — it raises when the lead holds nothing. Version starts at 1 per assessment and increments; it is allocated by materiality_finalisation_allocate_version under a per-assessment advisory lock, with the primary key as the guarantee that does not depend on the lock. Finalising again is a new version, never an edit — the board report prints the version and its date and regenerates from the latest.';

comment on column public.materiality_finalisations.version is
  'Allocated by the database, refused if supplied. 1-based, per assessment. See the trigger for why an advisory lock AND the primary key.';
comment on column public.materiality_finalisations.finalised_at is
  'When this version was taken. Printed on the board report cover beside the version, so a reader can tell two copies of the paper apart.';
comment on column public.materiality_finalisations.standard_version is
  'The ESRS version stated on the assessment at this moment, copied. NULL is a real state (Art. 2(2) permits an unstated version) and a finalisation with a null version copies NO requirement rows — there is deliberately no fallback to esrs_2023, because an undisclosed fallback would freeze one standard''s requirements under another standard''s name. No CHECK: materiality_assessments already validates this column and a second copy of the rule would be free to drift.';

comment on table public.materiality_finalisation_requirements is
  'The ESRS disclosure requirements as they stood when a finalisation was taken — COPIED, not referenced. mr_esrs_disclosure_requirements is reference data that changes (20260845 rewrote E1-11''s title on 21 Aug 2026), and an FK to it would prove a code existed while preserving neither title nor datapoints, which are what actually changed. There is deliberately no FK to it for a second reason: it would make a historical record''s survival depend on re-seedable data, and both delete behaviours are wrong for an archive. No CHECK constraints, per materiality_impact_assignee_determinations:266-269 — this is a copy of rows the source already validated.';

comment on column public.materiality_finalisation_requirements.title is
  'The requirement heading as it stood at finalisation. Frozen because the source''s wording changes; this is what the report prints.';
comment on column public.materiality_finalisation_requirements.datapoints is
  'ThemisIQ''s summary of what the requirement obliges a preparer to collect, as it stood at finalisation. NULL = not yet written, which is NOT "nothing to collect". Every esrs_2026 row is null at the time of writing. NULL MUST RENDER AS AN EXPLICIT ABSENCE — an empty cell under a "data to collect" heading reads as a finding this column cannot support.';
comment on column public.materiality_finalisation_requirements.sort_order is
  'The source''s per-topic ordering, copied, so a re-seed cannot reorder a printed roadmap.';

commit;
