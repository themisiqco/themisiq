-- supabase/migrations/20260847_materiality_iro1.sql
-- ESRS 2 IRO-1: capture for the paragraph 35 disclosure. CAPTURE ONLY — the prose surface that
-- renders this is a separate piece of work and this migration does not assume its shape.
--
-- WHY A TABLE AND NOT COLUMNS ON materiality_assessments. Paragraph 35 asks for five things the
-- assessment does not record and cannot derive: how the process ran across the value chain, where
-- negative-impact risk concentrates, how remediation entered the judgement, whether a due diligence
-- process informed it, and whether external experts were consulted. None is an engine input, none
-- affects a score, and all five are prose the preparer writes. Putting them on the assessment row
-- would mix inputs that decide numbers with narrative that decides nothing.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260847_materiality_iro1.sql
-- Without it psql continues past a failed statement and still exits 0, so a migration can land
-- half-applied while the transcript reads clean — table present, constraints missing, trigger
-- absent. The Supabase SQL editor stops on error by default and needs no flag. Either way this file
-- is wrapped in begin/commit, so a failure rolls the whole thing back.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE TABLE IF NOT EXISTS,
-- guarded policy creation, DROP TRIGGER IF EXISTS before CREATE, COMMENT ON is idempotent.
--
-- DEPENDS ON 20260838 (materiality_assessments unique (id, user_id)) and 20260625_sbti_core_tables
-- (public.sbti_set_updated_at).
--
-- POSTGRES VERSION: the supersedes FK uses column-list ON DELETE SET NULL, which requires PG15+.
-- Confirmed 22 Aug 2026 against db/dumps/schema_public_20260819_0800.sql, whose pg_dump header
-- reads "Dumped from database version 17.6". If this file is ever replayed against an older server,
-- the fallback is a single-column FK on (id) with plain ON DELETE SET NULL — which loses the
-- tenancy guarantee to the policy, and that loss must be stated in a comment if it is ever taken.

begin;

-- =====================================================================
-- 1. The table
-- =====================================================================
create table if not exists public.materiality_iro1 (
  -- ⚠️ ONE ROW PER ASSESSMENT, and the key says so rather than a trigger enforcing it. IRO-1 is a
  -- statement about how THIS assessment was conducted; a second row would be a second account of
  -- the same exercise with nothing to say which is current.
  assessment_id uuid not null,

  user_id       uuid not null default auth.uid(),

  -- ── ¶35(a) ────────────────────────────────────────────────────────────────────────────────────
  value_chain_approach               text,
  value_chain_approach_declined      boolean,

  -- ── ¶35(b), first limb ────────────────────────────────────────────────────────────────────────
  heightened_risk_areas              text,
  heightened_risk_areas_declined     boolean,

  -- ── ¶35(b), second limb ───────────────────────────────────────────────────────────────────────
  remediation_consideration          text,
  remediation_consideration_declined boolean,

  -- ── ¶35(c), first limb ────────────────────────────────────────────────────────────────────────
  due_diligence_link                 text,
  due_diligence_link_declined        boolean,

  -- ── ¶35(c), second limb ───────────────────────────────────────────────────────────────────────
  external_experts                   text,
  external_experts_declined          boolean,

  -- ── ¶35(d) ────────────────────────────────────────────────────────────────────────────────────
  -- Nullable, and the first cycle's null is NOT A GAP. ¶35(d) asks what changed against the prior
  -- period; an undertaking reporting for the first time has nothing to point at, and a NOT NULL
  -- here would force it to invent one or leave the row unwritable.
  --
  -- ⚠️ COMPOSITE FK, SO A CUSTOMER CANNOT POINT AT SOMEBODY ELSE'S ASSESSMENT. A single-column
  -- reference to (id) would let any valid uuid through and leave tenancy to the policy alone.
  -- ON DELETE SET NULL names the column explicitly because plain SET NULL would try to null
  -- user_id too, which is NOT NULL, and the delete would error instead. PG15+ syntax; see header.
  supersedes_assessment_id uuid,

  -- ── the submit gate ───────────────────────────────────────────────────────────────────────────
  status     text not null default 'draft' check (status in ('draft', 'submitted')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint materiality_iro1_pkey primary key (assessment_id),

  -- ⚠️ OWNERSHIP AS A DATABASE FACT, NOT A POLICY'S PROMISE. Same idiom as
  -- materiality_impact_assignee_determinations (20260839:258) and materiality_impact_determinations
  -- (20260838:494): the row's user_id must match the parent assessment's, enforced by the FK. A
  -- policy alone would leave a service-role path free to write a row under the wrong owner.
  constraint materiality_iro1_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade,

  constraint materiality_iro1_supersedes_fkey
    foreign key (supersedes_assessment_id, user_id)
    references public.materiality_assessments (id, user_id)
    on delete set null (supersedes_assessment_id),

  -- ── THREE STATES, AND THE THIRD MUST BE REACHABLE ─────────────────────────────────────────────
  -- Absence of data is not a value — 20260730_deals_size_limbs.sql states the rule and this is the
  -- same shape. Each limb has three states and the DDL keeps them distinct:
  --
  --     never asked        text null,     declined null
  --     answered           text present,  declined null or false
  --     asked and declined text null,     declined true
  --
  -- A blank field and a declined field are DIFFERENT DISCLOSURES. "We did not describe our value
  -- chain approach" and "we were asked and chose not to" are not the same statement to a reader of
  -- an ESRS filing, and collapsing them into one null is how a report ends up silent about a
  -- deliberate omission.
  --
  -- ⚠️ WHAT EACH CHECK FORBIDS: text AND declined=true together. That row asserts both "here is the
  -- answer" and "no answer was given". `is not true` rather than `= false` on purpose — it admits
  -- null, so an answered field with declined left null is legal, which is the ordinary case.
  constraint materiality_iro1_value_chain_approach_not_both
    check (value_chain_approach is null or value_chain_approach_declined is not true),
  constraint materiality_iro1_heightened_risk_areas_not_both
    check (heightened_risk_areas is null or heightened_risk_areas_declined is not true),
  constraint materiality_iro1_remediation_consideration_not_both
    check (remediation_consideration is null or remediation_consideration_declined is not true),
  constraint materiality_iro1_due_diligence_link_not_both
    check (due_diligence_link is null or due_diligence_link_declined is not true),
  constraint materiality_iro1_external_experts_not_both
    check (external_experts is null or external_experts_declined is not true),

  -- ── SUBMITTED MEANS COMPLETE ──────────────────────────────────────────────────────────────────
  -- Mirrors materiality_impact_determinations_submitted_is_complete (20260838:490):
  --     check (status = 'draft' or (nature is not null and determined_at is not null))
  -- Same reasoning, applied to five limbs instead of two fields: on a SUBMITTED row every limb must
  -- have been dealt with, so that a null there reads as "declined" only when declined says so, and
  -- never as "not got to yet". A draft may be as incomplete as the preparer likes.
  constraint materiality_iro1_submitted_is_complete
    check (status = 'draft' or (
          (value_chain_approach      is not null or value_chain_approach_declined      is true)
      and (heightened_risk_areas     is not null or heightened_risk_areas_declined     is true)
      and (remediation_consideration is not null or remediation_consideration_declined is true)
      and (due_diligence_link        is not null or due_diligence_link_declined        is true)
      and (external_experts          is not null or external_experts_declined          is true)
    ))
);

-- The ¶35(d) lookup: "which cycle superseded assessment X". Without it that is a seq scan.
create index if not exists materiality_iro1_supersedes_idx
  on public.materiality_iro1 (supersedes_assessment_id);

-- RLS filters every read on user_id; the PK does not serve it.
create index if not exists materiality_iro1_user_idx
  on public.materiality_iro1 (user_id);

-- =====================================================================
-- 2. updated_at maintenance
-- =====================================================================
-- ⚠️ THE TRIGGER IS THE POINT, NOT THE COLUMN. 20260846 records the defect this avoids: on
-- materiality_assessments, updated_at was NOT NULL DEFAULT now() with no trigger and no app write,
-- so it was set once at insert and never advanced — a column whose name asserted a fact the
-- mechanism never delivered. Attached here at creation so this table is never in that state.
-- Same function both tables use, so neither is the odd one out.
drop trigger if exists materiality_iro1_set_updated_at on public.materiality_iro1;
create trigger materiality_iro1_set_updated_at
  before update on public.materiality_iro1
  for each row execute function public.sbti_set_updated_at();

-- =====================================================================
-- 3. RLS
-- =====================================================================
-- ⚠️ ONE _owner_all POLICY, the newer convention — matching mia/mias/mid in 20260838:540-560, NOT
-- the four per-verb policies on materiality_assessments. Four policies are four places for a verb
-- to be forgotten; one FOR ALL with both USING and WITH CHECK cannot be half-written.
alter table public.materiality_iro1 enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'materiality_iro1'
                    and policyname = 'mi1_owner_all') then
    create policy mi1_owner_all on public.materiality_iro1
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- =====================================================================
-- 4. Grants — RLS is not a grant. A policy on a table nobody holds a
--    privilege for does nothing, and the reverse fails silently on the
--    service-role path.
-- =====================================================================
revoke all on public.materiality_iro1 from anon, authenticated, service_role;

-- ⚠️ NOTHING TO anon. There is no token path to this table and none is planned: IRO-1 is the
-- preparer's own account of their process, not something a contributor or respondent supplies.
--
-- ⚠️ WRITE IS GRANTED, AND THIS IS NOT THE TAMPER-EVIDENT CASE. Contrast
-- materiality_impact_assignee_determinations, which holds authenticated to SELECT alone because its
-- rows are a frozen snapshot of somebody else's judgement. These five fields are the preparer's own
-- prose about their own process; they are meant to be drafted, revised and submitted by the person
-- holding the account.
--
-- DELETE is NOT granted, matching materiality_impact_determinations. The row goes when its
-- assessment goes, by cascade. "Start over" is clearing the fields, not erasing the record that the
-- questions were put.
grant select, insert, update on public.materiality_iro1 to authenticated;
grant all                    on public.materiality_iro1 to service_role;

-- =====================================================================
-- 5. Comments
-- =====================================================================
comment on table public.materiality_iro1 is
  'ESRS 2 IRO-1 paragraph 35 disclosure preparation — CAPTURE ONLY. Holds the five things ¶35 requires that materiality_assessments does not record and cannot derive: the value-chain process (a), where negative-impact risk concentrates and how remediation entered the judgement (b), whether due diligence and external experts informed it (c), and a pointer to the assessment this cycle supersedes (d). ¶35(e) — when the assessment was last updated — is NOT here: it is answered from materiality_assessments (see the note on that table added by 20260846). THE PROSE SURFACE THAT RENDERS THIS IS A SEPARATE PIECE OF WORK; nothing in this table decides how it reads. Every field is DECLARE-OR-DECLINE: a null text with declined=true is a recorded refusal, a null text with declined null is a question not yet put, and the two are different disclosures.';

comment on column public.materiality_iro1.value_chain_approach is
  '¶35(a). How the materiality assessment process ran across own operations and the upstream and downstream value chain. Prose, the preparer''s own.';
comment on column public.materiality_iro1.value_chain_approach_declined is
  'TRUE when the preparer was asked and chose not to describe the ¶35(a) process. Distinct from null, which means the question has not been put. Forbidden alongside a non-null value_chain_approach.';

comment on column public.materiality_iro1.heightened_risk_areas is
  '¶35(b), first limb. Activities, business relationships or geographies where the risk of negative impact is concentrated.';
comment on column public.materiality_iro1.heightened_risk_areas_declined is
  'TRUE when asked and declined for the ¶35(b) risk-concentration limb. Distinct from null.';

comment on column public.materiality_iro1.remediation_consideration is
  '¶35(b), second limb. How prevention, mitigation and remediation entered the materiality judgement — as distinct from what the undertaking intends to do about a topic, which is not an IRO-1 question.';
comment on column public.materiality_iro1.remediation_consideration_declined is
  'TRUE when asked and declined for the ¶35(b) remediation limb. Distinct from null.';

comment on column public.materiality_iro1.due_diligence_link is
  '¶35(c), first limb. Whether the assessment was informed by a sustainability due diligence process, and how.';
comment on column public.materiality_iro1.due_diligence_link_declined is
  'TRUE when asked and declined for the ¶35(c) due diligence limb. Distinct from null.';

comment on column public.materiality_iro1.external_experts is
  '¶35(c), second limb. Consultation with EXTERNAL EXPERTS. Deliberately not the stakeholder survey: materiality_survey_* records affected parties giving their own view, and an expert consulted on method is a different input that ¶35(c) names separately. Do not derive this from survey participation.';
comment on column public.materiality_iro1.external_experts_declined is
  'TRUE when asked and declined for the ¶35(c) external-experts limb. Distinct from null.';

comment on column public.materiality_iro1.supersedes_assessment_id is
  '¶35(d). The assessment this cycle supersedes, so changes against the prior reporting period can be stated. NULLABLE, and a first-cycle null is not a gap — there is nothing to point at. Composite FK on (id, user_id), so it cannot reference another account''s assessment.';

comment on column public.materiality_iro1.status is
  'draft until the preparer submits. On submitted, materiality_iro1_submitted_is_complete requires every one of the five limbs to be answered or explicitly declined — so a null on a submitted row is never "not got to yet".';

comment on column public.materiality_iro1.updated_at is
  'Maintained by materiality_iro1_set_updated_at, attached at creation. See 20260846 for why a trigger and not a DEFAULT: without one this column records insert time and never advances, under a name that says otherwise.';

commit;
