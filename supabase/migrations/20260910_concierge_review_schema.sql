-- supabase/migrations/20260910_concierge_review_schema.sql
--
-- ⚠️ NOT RUN. Drafted 10 Sep 2026, revised 12 Sep 2026 for HUMAN review. Still unrun.
--
-- Concierge review: the three tables a reviewer works from. A person — Lisa or Dima — opens each
-- uploaded document and types the figures. The Anthropic extractor is no longer the source of a
-- proposal.
--
-- ⚠️ NOTHING DOWNSTREAM OF EXTRACTION CHANGES, AND THAT IS THE POINT OF THE SHAPE BELOW. The
-- proposal cards, accept/edit, the export gate, coverage, applyResolutions(), buildWorkings(),
-- monthly emissions and the verifier page all keep working on the same data. The customer still
-- confirms every figure in their own inventory and THEIR OWN SAVE writes locations_data, exactly
-- as today. These tables are the reviewer's side of the desk, not a new authority: the inventory
-- remains what a figure IS (lib/ghg/engine.ts applyResolutions), and a proposal here is a
-- candidate no customer has yet accepted.
--
-- Before this, extraction was CLIENT-SIDE AND IN-SESSION — app/api/concierge/extract/route.ts
-- writes nothing, and its proposals lived in browser memory until the customer saved. Workable for
-- one customer confirming their own figures; unusable for a reviewer, who needs a row to pick up,
-- a status to move, a record that a document was read, and something that survives a closed tab.
-- app/api/concierge/extract/route.ts still exists on disk and is NOT touched by this migration;
-- retiring or repurposing it is a separate change.
--
-- ── TWO CONFLICTS WITH THE SURROUNDING SCHEMA, NEITHER WORKED AROUND ──────────────────────────
--
-- 1. ghg_inventories HAS TWO CANDIDATE POLICIES AND THE REPO CANNOT SAY WHICH IS LIVE.
--    db/dumps/schema_public_20260819_0800.sql (19 Aug) carries:
--        "Users can manage own inventories"  TO PUBLIC  using/with check (auth.uid() = user_id)
--    while 20260858_company_scoped_rls.sql §7 drops that by discovered name and creates:
--        ghg_inventories_owner  TO authenticated
--        using (auth.uid() = user_id)
--        with check (auth.uid() = user_id and company_id in (select id from companies where …))
--    20260858 carries no run-status banner, and the dump predates it, so which one is in the
--    database is not determinable from this repo. THIS FILE DOES NOT NEED TO KNOW: the two agree
--    exactly on USING, and the policies below are SELECT-only, so only USING is consulted. The
--    company_id divergence lives entirely in WITH CHECK, which no policy here has.
--    If authenticated writes are ever added, that question has to be answered first.
--
-- 2. Location.id IS POSITIONAL, NOT A STABLE IDENTIFIER.
--    app/dashboard/ghg/page.tsx:735 mints it as `String(inventory.locations.length + 1)` — "1",
--    "2", "3" — and lib/ghg/engine.ts already treats it as a key (coverage resolutions match on
--    `r.locId === loc.id`). It is unique today only because THE UI HAS NO REMOVE-LOCATION PATH:
--    grep finds no removeLocation, so ids are never freed and never collide. Add one and the next
--    location created reuses a live id.
--    So `location_id` below is recorded as text ALONGSIDE `location_name`, and neither is a
--    foreign key, because there is no locations table to point at. A reviewer matching a document
--    to a location should read both. If locations ever gain uuids, this is the column to migrate.

begin;

-- ── PRE-FLIGHT ───────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.ghg_inventories') is null then
    raise exception 'Pre-flight: public.ghg_inventories does not exist. Nothing created.';
  end if;
  if to_regclass('public.entitlements') is null then
    raise exception 'Pre-flight: public.entitlements does not exist. Nothing created.';
  end if;
  if to_regproc('public.log_audit') is null then
    raise exception 'Pre-flight: public.log_audit() does not exist. The audit triggers below would fail.';
  end if;

  -- ⚠️ REFUSE IF ANY OF THE THREE ALREADY EXISTS, matching 20260910_erasure_log.sql.
  -- The CREATE statements below say `if not exists`, which on a second run SILENTLY SKIPS the
  -- table — and after the 12 Sep revisions that would leave a table without status_note or the
  -- updated_by/updated_at pair, with no error at the point of failure. The post-flight column
  -- assertion would eventually catch it, but it would report a missing column rather than the
  -- reason, sending the reader looking for a typo in a CREATE that never ran.
  if to_regclass('public.concierge_jobs') is not null
     or to_regclass('public.concierge_job_documents') is not null
     or to_regclass('public.concierge_proposals') is not null then
    raise exception 'Pre-flight: one or more concierge_* tables already exist. An earlier version of this file has been run; its tables predate the 12 Sep revisions (status_note, updated_by/updated_at, the ready gate on the child policies). Inspect and migrate them by hand. Nothing was changed.';
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 1. concierge_jobs
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ user_id IS ON DELETE CASCADE, WHICH DIVERGES FROM ghg_inventories.user_id (no clause, so
-- NO ACTION — it BLOCKS a user delete, and is one of four such blockers today). Mirroring the
-- column is not the same as mirroring its delete rule: adding a fifth blocker to an erasure path
-- that already cannot complete makes a deletion request harder to honour, not safer. Deliberate,
-- and flagged rather than matched.
create table if not exists public.concierge_jobs (
  id                 uuid primary key default gen_random_uuid(),
  -- OWNER. The RLS test below reads this column and only this column, matching the USING half of
  -- both candidate ghg_inventories policies.
  user_id            uuid not null references auth.users(id) on delete cascade,
  -- Denormalised snapshot, NOT part of the ownership test. ghg_inventories carries company_id too;
  -- it is here so a reviewer can group work without joining, and it is nullable because
  -- ghg_inventories.company_id is.
  company_id         uuid,
  inventory_id       uuid not null references public.ghg_inventories(id) on delete cascade,
  -- ON DELETE SET NULL, not RESTRICT: entitlements cascades from auth.users, so RESTRICT here
  -- would make this table a new blocker on account deletion. The job record outliving its
  -- entitlement row is the lesser loss, and `tier` below preserves what was bought.
  entitlement_id     uuid references public.entitlements(id) on delete set null,
  -- Add-on keys as they are written to entitlements.module_key by the checkout and invoice routes.
  -- Kept as a snapshot so a job still says which tier paid for it after the entitlement is gone.
  tier               text not null check (tier in ('concierge-basic', 'concierge-standard', 'concierge-enterprise')),
  round              smallint not null default 1 check (round >= 1),   -- 1 = initial, 2 = follow-up for missing months
  location_count     integer not null check (location_count >= 0),     -- snapshot at submission
  status             text not null default 'submitted'
                       check (status in ('submitted', 'in_review', 'waiting_on_documents', 'ready')),
  -- CUSTOMER-FACING, ONE PLAIN SENTENCE. Shown when status is 'waiting_on_documents' to say what
  -- is missing: "We still need your December gas bill for the Leeds site." The jobs policy below
  -- is readable at EVERY status precisely so this reaches the customer without a reviewer having
  -- to send an email.
  --
  -- ⚠️ NO INTERNAL VOCABULARY. Not a status code, not a table name, not 'needs_manual_review', not
  -- a document id. A customer reading this has no map of our schema, and a line they cannot act on
  -- is worse than silence — it tells them something is wrong without telling them what to do.
  -- Unconstrained by CHECK on purpose: which statuses may carry a note is a product decision that
  -- will change, and a CHECK here would have to be migrated every time it did.
  status_note        text,
  submitted_at       timestamptz not null default now(),
  review_started_at  timestamptz,
  ready_at           timestamptz,
  -- ⚠️ STAFF ID, NEVER A CUSTOMER'S — and deliberately FK-FREE. `reviewer` holds the ThemisIQ
  -- person who did the review. It carries no foreign key to auth.users so that deleting a STAFF
  -- account cannot reach customer rows: a CASCADE would delete other customers' jobs, and a
  -- RESTRICT or NO ACTION would make every job that person touched a blocker on their own account
  -- deletion. Neither is acceptable, and an id with no FK is the only shape that is.
  -- The same rule governs concierge_proposals.extracted_by and the updated_by columns below.
  -- See the note on scripts/erase-account.mjs at the foot of this file.
  reviewer           uuid
);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 2. concierge_job_documents
-- ═════════════════════════════════════════════════════════════════════════════════════════════
create table if not exists public.concierge_job_documents (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.concierge_jobs(id) on delete cascade,
  -- TEXT, NOT UUID, AND THAT IS NOT A SHORTCUT. SourceDoc.id is client-generated at upload
  -- (app/dashboard/ghg/page.tsx:768) as `${Date.now()}_${random}`, and older inventories hold a
  -- bare Date.now(). app/api/verifier-documents/sign/route.ts refuses on ambiguous_document
  -- precisely because those legacy ids can collide. Storing them as uuid would reject every
  -- existing document.
  source_doc_id  text not null,
  -- See conflict (2) in the header: positional id plus name, neither a foreign key.
  location_id    text,
  location_name  text,
  file_path      text not null,
  file_name      text not null,
  document_type  text not null,
  -- Mirrors SourceDoc.read_outcome / read_note: 'abstained' | 'failed' | 'not_read', or null when
  -- the question does not arise. Not constrained by CHECK — the set is defined in TypeScript and a
  -- CHECK here would be a second copy that can disagree.
  read_outcome   text,
  read_note      text,
  created_at     timestamptz not null default now(),
  -- ⚠️ STAFF ID, NEVER A CUSTOMER'S, AND FK-FREE — same rule and same reason as
  -- concierge_jobs.reviewer above. Set by the operator route on every write.
  updated_by     uuid,
  -- SET BY THE OPERATOR ROUTE, NOT BY A TRIGGER. The default covers the insert; every UPDATE must
  -- set it explicitly. The repo has public.sbti_set_updated_at() doing this with a BEFORE UPDATE
  -- trigger on ten tables, and it would make this column impossible to get wrong — it is NOT used
  -- here because the route owns the pair (updated_by, updated_at) and a trigger that maintained
  -- only half of it would let the two disagree, which is worse than one route forgetting both.
  updated_at     timestamptz not null default now(),
  unique (job_id, source_doc_id)
);

-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- 3. concierge_proposals
-- ═════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ NO confidence AND NO period_confidence COLUMN. Dropped entirely, and under human review the
-- reason is stronger than it was.
-- `confidence` was the MODEL's read-certainty, spent at the extraction site deciding needsReview
-- (app/dashboard/ghg/page.tsx:796) and, since 7756c61 made the badge read `status`, read by nothing
-- else. `periodConfidence` never had a reader at all. With a person doing the reading there is no
-- self-assessment to record: the reviewer decides, and writes that decision into `status` directly.
-- A numeric confidence typed by a human would be a number with no method behind it, which is
-- exactly the kind of figure this product must not put in front of a verifier.
-- An estimated read, a partial period, a smudged meter — all of that goes in `notes`, in words,
-- where it can say what was actually uncertain instead of scoring it.
create table if not exists public.concierge_proposals (
  id               uuid primary key default gen_random_uuid(),
  job_document_id  uuid not null references public.concierge_job_documents(id) on delete cascade,
  fuel_type        text not null,
  -- RAW is what the document printed; VALUE is after lib/unitConversions.ts. Both kept: the raw
  -- pair is what a verifier cross-checks against the bill, and normalising it away would lose the
  -- verbatim source value the methodology rules require be preserved.
  raw_value        numeric,
  raw_unit         text,
  value            numeric,
  unit             text,
  conversion_note  text,
  period_start     date,
  period_end       date,
  source_quote     text,
  notes            text,
  -- Only the two states a job can produce. 'confirmed' and 'rejected' are customer acts on the
  -- inventory, not reviewer output, so they are deliberately not in this union.
  status           text not null check (status in ('extracted', 'needs_manual_review')),
  -- ⚠️ STAFF ID, NEVER A CUSTOMER'S, AND FK-FREE — same rule and reason as concierge_jobs.reviewer.
  -- The name predates human review and is kept because the meaning is unchanged: whoever produced
  -- this figure. It is now always a person.
  extracted_by     uuid,
  extracted_at     timestamptz not null default now(),
  -- ⚠️ STAFF ID, NEVER A CUSTOMER'S, AND FK-FREE. Set by the operator route on every write, with
  -- updated_at; see the note on concierge_job_documents.updated_at for why no trigger maintains it.
  updated_by       uuid,
  updated_at       timestamptz not null default now()
);

-- ── INDEXES: every foreign key, plus the reviewer's queue ────────────────────────────────────
-- Postgres indexes a PRIMARY KEY and a UNIQUE constraint automatically; it does NOT index the
-- referencing side of a foreign key. Each one below is a cascade path as well as a join path.
create index if not exists idx_concierge_jobs_user            on public.concierge_jobs (user_id);
create index if not exists idx_concierge_jobs_inventory       on public.concierge_jobs (inventory_id);
create index if not exists idx_concierge_jobs_entitlement     on public.concierge_jobs (entitlement_id);
create index if not exists idx_concierge_jobs_status          on public.concierge_jobs (status);
create index if not exists idx_concierge_job_documents_job    on public.concierge_job_documents (job_id);
create index if not exists idx_concierge_proposals_job_doc    on public.concierge_proposals (job_document_id);

-- ── RLS: SELECT ONLY, OWNER ONLY ─────────────────────────────────────────────────────────────
-- NO INSERT, UPDATE OR DELETE POLICY FOR authenticated, AND THAT IS THE WHOLE DESIGN. Every write
-- is a server route on the service-role client, which bypasses RLS. A customer may watch their own
-- job; they may not create one, move its status, or edit a reviewer's proposal.
--
-- `(select auth.uid())` NOT `auth.uid()` — CLAUDE.md's RLS rule. auth.uid() is STABLE, so inside a
-- predicate the planner may re-evaluate it per row; the scalar subselect has no outer reference and
-- is hoisted to an InitPlan. Identical result set, one evaluation per query. These are NEW policies
-- on NEW tables, which is exactly where that rule is easiest to forget.
alter table public.concierge_jobs           enable row level security;
alter table public.concierge_job_documents  enable row level security;
alter table public.concierge_proposals      enable row level security;

drop policy if exists concierge_jobs_owner_select on public.concierge_jobs;
create policy concierge_jobs_owner_select on public.concierge_jobs
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- The child tables reach the owner THROUGH the job rather than carrying their own user column.
-- One place decides who owns a job, so the three cannot drift apart.
--
-- ⚠️ AND THEY ADD A SECOND CONDITION: j.status = 'ready'. A customer sees their job at every
-- status — that is how they watch progress and read status_note — but they see its DOCUMENTS and
-- FIGURES only once the reviewer has finished.
--
-- This is not tidiness. Mid-review, a proposal is a half-typed number: a reviewer three bills into
-- a twelve-bill job has a row saying 4,200 kWh that is about to become 42,000 when they spot the
-- decimal. Shown live, the customer reads a figure that was never a claim, and may act on it or
-- query it; worse, a figure they saw and remember can differ from the one they are finally asked
-- to confirm, with nothing on screen explaining why it moved. The freeze trigger below protects
-- the record AFTER delivery; this protects the customer BEFORE it.
--
-- It also pairs with the freeze: rows are mutable exactly while they are invisible, and visible
-- exactly once they are frozen. There is no window in which a customer can watch a figure change.
drop policy if exists concierge_job_documents_owner_select on public.concierge_job_documents;
create policy concierge_job_documents_owner_select on public.concierge_job_documents
  for select to authenticated
  using (exists (
    select 1 from public.concierge_jobs j
     where j.id = concierge_job_documents.job_id
       and j.user_id = (select auth.uid())
       and j.status = 'ready'
  ));

drop policy if exists concierge_proposals_owner_select on public.concierge_proposals;
create policy concierge_proposals_owner_select on public.concierge_proposals
  for select to authenticated
  using (exists (
    select 1
      from public.concierge_job_documents d
      join public.concierge_jobs j on j.id = d.job_id
     where d.id = concierge_proposals.job_document_id
       and j.user_id = (select auth.uid())
       and j.status = 'ready'
  ));

-- ── GRANTS — MANDATORY, AND AN INCLUDED LINE IS NOT PROOF IT RAN ─────────────────────────────
-- A hand-run CREATE TABLE does NOT auto-grant to `authenticated`. Confirmed gaps exist on
-- scope3_inventories, companies and ghg_monthly_emissions; purchase_consents records the lesson,
-- including a live 42501 that silently dropped consent rows. RLS without a GRANT is a table nobody
-- can read; a GRANT without RLS is a table everybody can. Both are needed, in that order.
-- SELECT ONLY for authenticated, matching the policies above.
grant select on table public.concierge_jobs          to authenticated;
grant select on table public.concierge_job_documents to authenticated;
grant select on table public.concierge_proposals     to authenticated;

grant all on table public.concierge_jobs          to service_role;
grant all on table public.concierge_job_documents to service_role;
grant all on table public.concierge_proposals     to service_role;

-- ── AUDIT TRIGGERS — same attachment as ghg_inventories ──────────────────────────────────────
-- AFTER INSERT OR DELETE OR UPDATE FOR EACH ROW EXECUTE FUNCTION public.log_audit(), named
-- audit_<table>, matching audit_ghg_inventories and audit_ghg_entries. log_audit() is SECURITY
-- DEFINER, resolves the actor from profiles then auth.users, and writes public.audit_log with
-- to_jsonb(old)/to_jsonb(new).
--
-- ⚠️ IT RECORDS THE ACTOR AS auth.uid(), WHICH IS NULL ON A SERVICE-ROLE WRITE. Every write to
-- these tables is a server route, so audit_log.user_id and user_email will be NULL for all of them.
-- That is not a defect in this file, but it means the audit trail here answers WHAT CHANGED and
-- WHEN, never WHO — and `reviewer` on the job is the only record of that. If who-did-it matters,
-- it needs a separate mechanism; do not read a NULL actor as anonymous.
drop trigger if exists audit_concierge_jobs on public.concierge_jobs;
create trigger audit_concierge_jobs
  after insert or delete or update on public.concierge_jobs
  for each row execute function public.log_audit();

drop trigger if exists audit_concierge_job_documents on public.concierge_job_documents;
create trigger audit_concierge_job_documents
  after insert or delete or update on public.concierge_job_documents
  for each row execute function public.log_audit();

drop trigger if exists audit_concierge_proposals on public.concierge_proposals;
create trigger audit_concierge_proposals
  after insert or delete or update on public.concierge_proposals
  for each row execute function public.log_audit();

-- ── THE 'ready' FREEZE ───────────────────────────────────────────────────────────────────────
-- Once a job is ready, its documents and proposals are what the customer was handed. Changing them
-- afterwards would alter the record behind figures already reviewed, with nothing on screen saying
-- so. INSERT and UPDATE are refused; DELETE is NOT, so an account deletion can still cascade
-- through — the freeze protects the record's integrity, it must not become a fifth thing standing
-- between a customer and erasure.
--
-- ONE FUNCTION, TWO TABLES: the parent lookup is the only difference, so it is derived from
-- TG_TABLE_NAME. The ELSE arm raises rather than defaulting — attached to a third table, a default
-- would either wave every write through or refuse every one, and both fail quietly.
create or replace function public.enforce_concierge_job_open()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_job_id      uuid;
  v_status      text;
  -- The staff-id columns on THIS table, mirroring STAFF_ID_COLUMNS in
  -- scripts/erase-account.mjs. Two copies of one fact, and the only two there are:
  -- the script cannot read this function and this function cannot read the script.
  -- If either list changes, change both in the same commit.
  v_staff_cols  text[];
  v_old         jsonb;
  v_new         jsonb;
  v_col         text;
  v_changed     boolean := false;
  v_only_blanks boolean := true;
begin
  case tg_table_name
    when 'concierge_job_documents' then
      v_job_id := new.job_id;
      v_staff_cols := array['updated_by'];
    when 'concierge_proposals' then
      select d.job_id into v_job_id
        from public.concierge_job_documents d
       where d.id = new.job_document_id;
      v_staff_cols := array['extracted_by', 'updated_by'];
    else
      raise exception 'enforce_concierge_job_open() is attached to an unexpected table (%). Attach it only to concierge_job_documents or concierge_proposals.', tg_table_name;
  end case;

  -- A row whose parent cannot be found is refused rather than allowed. The foreign keys make this
  -- unreachable for INSERT; it is here so the function has no branch that falls through silently.
  if v_job_id is null then
    raise exception 'Could not resolve the concierge job for this row. Nothing was written.';
  end if;

  select j.status into v_status from public.concierge_jobs j where j.id = v_job_id;

  if v_status = 'ready' then
    -- ── THE ONE EXEMPTION: A STAFF-ID BLANKING, AND NOTHING ELSE ─────────────────────────────
    --
    -- The freeze protects THE DELIVERED FIGURES — the numbers, periods, units and quotes the
    -- customer was handed and may already have confirmed. Setting a staff id to null changes no
    -- figure. It removes the record of WHICH THEMISIQ PERSON typed one, which is not part of what
    -- the customer was delivered and not something a verifier reads.
    --
    -- This is the same line the freeze already draws for DELETE, one operation over: erasure must
    -- not be blocked by a rule about editing. Without this branch, scripts/erase-account.mjs
    -- cannot blank a departing reviewer's id on a delivered job, its residual check then finds
    -- that id still present, and the whole erasure rolls back — leaving a staff account that can
    -- never be erased once any job they touched has shipped.
    --
    -- ⚠️ THE THREE CONDITIONS ARE ALL LOAD-BEARING, AND THE THIRD IS THE ONE THAT MAKES IT SAFE.
    --   (1) every staff-id column is unchanged, or changing from non-null to NULL — so this can
    --       never REASSIGN a figure to a different person, only forget who it was;
    --   (2) at least one is actually changing — so a no-op UPDATE cannot be used to wave through
    --       an otherwise-identical row and quietly refresh nothing;
    --   (3) EVERY other column, updated_at included, is identical — so a figure edit cannot ride
    --       along with a blanking in the same statement. updated_at is in that set deliberately:
    --       the blanking is an erasure obligation, not a review action, and must not present as
    --       one in the audit trail.
    --
    -- The comparison is jsonb, so it is value-identity rather than literally byte-identity: a
    -- numeric rewritten from 1.0 to 1.00 would compare equal. That is the same number, so it is
    -- not a figure change — but the distinction is stated rather than glossed.
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);

      -- (3) first, because it is the cheapest way to reject the common case.
      if (v_new - v_staff_cols) = (v_old - v_staff_cols) then
        foreach v_col in array v_staff_cols loop
          if v_new -> v_col is distinct from v_old -> v_col then
            v_changed := true;
            -- (1) a change is only ever TO NULL. `->>` is deliberate: to_jsonb renders a SQL NULL
            -- column as jsonb 'null', which `->` returns as a non-NULL jsonb value, so `->` would
            -- never look null here. `->>` returns SQL NULL for it, which is the test wanted.
            if v_new ->> v_col is not null then
              v_only_blanks := false;
            end if;
          end if;
        end loop;

        -- (2) at least one, or this is a no-op dressed as a blanking.
        if v_changed and v_only_blanks then
          return new;
        end if;
      end if;
    end if;

    raise exception 'This concierge job is marked ready and its documents and figures are frozen. Open a follow-up round instead of editing a delivered one.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_concierge_job_documents_open on public.concierge_job_documents;
create trigger trg_concierge_job_documents_open
  before insert or update on public.concierge_job_documents
  for each row execute function public.enforce_concierge_job_open();

drop trigger if exists trg_concierge_proposals_open on public.concierge_proposals;
create trigger trg_concierge_proposals_open
  before insert or update on public.concierge_proposals
  for each row execute function public.enforce_concierge_job_open();

-- ── POST-FLIGHT ──────────────────────────────────────────────────────────────────────────────
do $$
declare v_n int;
begin
  select count(*) into v_n from pg_tables
   where schemaname = 'public'
     and tablename in ('concierge_jobs', 'concierge_job_documents', 'concierge_proposals');
  if v_n <> 3 then raise exception 'Post-flight: expected 3 tables, found %.', v_n; end if;

  select count(*) into v_n from pg_tables
   where schemaname = 'public'
     and tablename in ('concierge_jobs', 'concierge_job_documents', 'concierge_proposals')
     and rowsecurity;
  if v_n <> 3 then raise exception 'Post-flight: RLS is enabled on only % of 3 tables.', v_n; end if;

  -- Exactly three policies, all SELECT. A stray write policy is the failure this whole design
  -- rests on not having.
  select count(*) into v_n from pg_policies
   where schemaname = 'public'
     and tablename in ('concierge_jobs', 'concierge_job_documents', 'concierge_proposals');
  if v_n <> 3 then raise exception 'Post-flight: expected 3 policies, found %.', v_n; end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'public'
     and tablename in ('concierge_jobs', 'concierge_job_documents', 'concierge_proposals')
     and cmd = 'SELECT';
  if v_n <> 3 then raise exception 'Post-flight: % of 3 policies are SELECT-only.', v_n; end if;

  -- Three audit triggers, two freeze triggers.
  select count(*) into v_n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
                      join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
     and t.tgname in ('audit_concierge_jobs', 'audit_concierge_job_documents', 'audit_concierge_proposals');
  if v_n <> 3 then raise exception 'Post-flight: expected 3 audit triggers, found %.', v_n; end if;

  select count(*) into v_n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
                      join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
     and t.tgname in ('trg_concierge_job_documents_open', 'trg_concierge_proposals_open')
     and (t.tgtype & 4) = 4 and (t.tgtype & 16) = 16 and (t.tgtype & 8) = 0;
  if v_n <> 2 then
    raise exception 'Post-flight: the freeze triggers must be INSERT OR UPDATE and NOT DELETE; % of 2 are.', v_n;
  end if;

  -- ── The 12 Sep revisions, asserted rather than assumed ─────────────────────────────────────
  -- Each of these is a column or a clause that a hand-edit could drop without any other check
  -- noticing: the table would still exist, RLS would still be on, the policy would still be SELECT.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'concierge_jobs'          and column_name = 'status_note')
       or (table_name = 'concierge_job_documents' and column_name in ('updated_by', 'updated_at'))
       or (table_name = 'concierge_proposals'     and column_name in ('updated_by', 'updated_at')));
  if v_n <> 5 then
    raise exception 'Post-flight: expected 5 revision columns (status_note, and updated_by/updated_at on both child tables), found %.', v_n;
  end if;

  -- confidence and period_confidence must not exist anywhere in these three tables.
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public'
     and table_name in ('concierge_jobs', 'concierge_job_documents', 'concierge_proposals')
     and column_name in ('confidence', 'period_confidence');
  if v_n <> 0 then
    raise exception 'Post-flight: % confidence column(s) present. They were dropped by design — a reviewer sets status directly.', v_n;
  end if;

  -- Both CHILD policies must gate on the job being ready; the JOBS policy must NOT.
  -- ⚠️ A TEXT MATCH ON THE STORED PREDICATE, and stated as such. pg_policies.qual is the
  -- re-rendered expression, so this proves the clause survived into the catalogue, not that it
  -- means what it should. It is here because dropping the gate is a silent, one-line regression
  -- that exposes half-typed figures, and no structural check can see it.
  select count(*) into v_n from pg_policies
   where schemaname = 'public'
     and tablename in ('concierge_job_documents', 'concierge_proposals')
     and qual like '%ready%';
  if v_n <> 2 then
    raise exception 'Post-flight: both child SELECT policies must gate on the job status being ready; % of 2 do.', v_n;
  end if;

  select count(*) into v_n from pg_policies
   where schemaname = 'public' and tablename = 'concierge_jobs' and qual like '%ready%';
  if v_n <> 0 then
    raise exception 'Post-flight: the concierge_jobs policy must NOT gate on status — a customer watches progress and reads status_note at every status.';
  end if;

  -- Grants. A hand-run CREATE TABLE grants nothing; an included GRANT line is not proof it ran.
  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('concierge_jobs', 'concierge_job_documents', 'concierge_proposals')
     and grantee = 'authenticated' and privilege_type = 'SELECT';
  if v_n <> 3 then raise exception 'Post-flight: authenticated holds SELECT on only % of 3 tables.', v_n; end if;

  select count(*) into v_n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('concierge_jobs', 'concierge_job_documents', 'concierge_proposals')
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_n <> 0 then
    raise exception 'Post-flight: authenticated holds % write grant(s) on these tables. Every write is server-side; RLS has no write policy to refuse them with.', v_n;
  end if;

  -- ── The freeze exemption, asserted in the catalogue ────────────────────────────────────────
  -- ⚠️ A TEXT MATCH ON prosrc, in the same spirit as the policy-gate check above, and with the
  -- same honesty about it.
  --
  -- WHAT IT PROVES: the function body in the database is THIS version. A partial run, a hand-edit
  -- in the SQL editor, or an older copy of this file replayed afterwards would leave a function
  -- that still looks right by name, arity and attachment, and every structural check above would
  -- pass. Both halves are checked, because the two failure modes are opposite and both silent:
  -- lose the exemption and a departing reviewer's account becomes un-erasable; lose the raise and
  -- the freeze is gone entirely, with delivered figures editable and nothing saying so.
  --
  -- WHAT IT DOES NOT PROVE: that the branch is correct, that it is reachable, or that it permits
  -- exactly the three conditions written above it. A body containing the right tokens in the wrong
  -- order passes this. Only executing the four cases proves behaviour — a normal edit raises, a
  -- staff id set to another non-null value raises, a figure edit riding along with a blanking
  -- raises, and a pure blanking is allowed. Those belong in the VERIFY block at the foot of this
  -- file, run by hand, and this assertion is not a substitute for them.
  select count(*) into v_n from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'enforce_concierge_job_open'
     and p.prosrc like '%v_staff_cols%'
     and p.prosrc like '%frozen%';
  if v_n <> 1 then
    raise exception 'Post-flight: enforce_concierge_job_open() does not carry both the staff-id blanking exemption (v_staff_cols) and the freeze exception (frozen). Found % matching function(s). The deployed body is not this version.', v_n;
  end if;

  raise notice 'Concierge review schema created: 3 tables, 3 SELECT policies (2 gated on ready), 5 triggers, freeze exemption present.';
end $$;

commit;

-- ── ERASURE COMPATIBILITY (scripts/erase-account.mjs) ────────────────────────────────────────
-- That script classifies EVERY table in public and refuses to run if one is unclassified, so a new
-- table is a change to the erasure path whether or not anyone intended it to be.
--
-- All three land in category (a), the computed cascade closure, by these paths:
--   concierge_jobs           user_id -> auth.users ON DELETE CASCADE
--                            (also inventory_id -> ghg_inventories, itself an explicit root)
--   concierge_job_documents  job_id -> concierge_jobs ON DELETE CASCADE
--   concierge_proposals      job_document_id -> concierge_job_documents ON DELETE CASCADE
-- No entry in ROOT_PREDICATE, EXPLICIT_OUTSIDE or NEVER_TOUCH is needed or wanted: adding one
-- would put a table in two categories and the classification gate would refuse it as a conflict.
--
-- The owner-column scan passes because it flags only tables OUTSIDE the closure, and all three are
-- inside it. It sees user_id and reviewer here, updated_by on the documents, extracted_by and
-- updated_by on the proposals.
--
-- ── THE STAFF COLUMNS, AND HOW THE SCRIPT HANDLES THEM ───────────────────────────────────────
-- reviewer, extracted_by and updated_by hold STAFF ids, so erasing a DEPARTING REVIEWER'S account
-- meets a case the owner-column model inverts: the id is the subject of the erasure, and the row
-- around it belongs to a different customer entirely.
--
-- THIS IS RESOLVED, IN THE SCRIPT. erase-account.mjs declares all four columns in
-- STAFF_ID_COLUMNS and, inside the erasure transaction and immediately before its residual check,
-- sets each to null WHERE it equals the subject AND the row is not one the closure deletes. The
-- customer's job survives; the departing person's id does not. Counts are reported per column and
-- written to erasure_log.table_counts under `staff-id-blanked:<table>.<column>` keys, distinct
-- from the delete counts. The residual check still counts these columns afterwards, so anything
-- left is a real failure and not a tolerated exception.
--
-- A future staff column cannot be missed: the script's coverage check reads every column in public
-- named `reviewer` or ending `_by` from pg_catalog and refuses to run if one is not declared. Name
-- any new staff-id column `<verb>_by`, or add it to STAFF_ID_COLUMNS by hand.
--
-- THE FREEZE TRIGGER USED TO BLOCK THAT BLANKING, AND NO LONGER DOES (13 Sep 2026).
-- trg_concierge_job_documents_open and trg_concierge_proposals_open fire BEFORE INSERT OR UPDATE
-- and raise when the parent job is 'ready'; three of the four blanking statements are UPDATEs on
-- those tables, and a delivered job is exactly the case that is 'ready'. As first drafted, a staff
-- erasure therefore raised and rolled back — the outcome the blanking pass exists to prevent.
-- enforce_concierge_job_open() now carries a narrow exemption for a staff-id blanking and nothing
-- else; see the three conditions written at the trigger. concierge_jobs.reviewer has no freeze
-- trigger and was never affected.

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- 1) Grants actually landed?
--    select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'concierge_jobs' order by grantee;
-- 2) A customer can read their own job and write nothing? Test as an authenticated user.
-- 3) DELETE still works against a 'ready' job's children — this is what keeps erasure possible.
-- 4) THE FREEZE EXEMPTION, BEHAVIOURALLY. The post-flight only proves the text is present. Against
--    a 'ready' job, as service_role, all four must hold:
--      a. update concierge_proposals set value = 42000 where id = '…';            -- must RAISE
--      b. update concierge_proposals set updated_by = '<other uuid>' where id='…';-- must RAISE
--      c. update concierge_proposals set value = 42000, updated_by = null …;      -- must RAISE
--      d. update concierge_proposals set updated_by = null where id = '…';        -- must SUCCEED
--    (d) is the one scripts/erase-account.mjs depends on; (a)-(c) are what the freeze still means.
