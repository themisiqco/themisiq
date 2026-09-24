-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  RUN.  Executed against the live database on 24 Sep 2026, before the application code was
-- applied, and verified from outside the database by eleven catalog queries rather than by the
-- absence of an error. What they returned:
--   two policies, scope3_category_snapshots_owner_select (SELECT, USING) and
--     scope3_category_snapshots_owner_insert (INSERT, WITH CHECK), both to authenticated, both
--     wrapping the call as ( SELECT auth.uid() AS uid);
--   no policy for UPDATE, DELETE or ALL, so a rewrite has no policy to permit it;
--   authenticated holds SELECT and INSERT and nothing else, and anon holds nothing;
--   user_id is not null with default auth.uid();
--   four foreign keys, none of them to campaign_suppliers, supplier_campaigns or supplier_responses;
--   the CHECK reads ((restatement_reason IS NULL) OR (supersedes_id IS NOT NULL));
--   scope3_inventories.cat_snapshot_ids is jsonb, not null, default '{}'::jsonb;
--   RLS enabled with a policy count of 2;
--   the bare auth.uid() count across every schema unchanged at public 1, which is
--     audit_log.audit_select_own, bare by design;
--   and scope3_inventories' own policies list identical before and after the add column, compared
--     row by row rather than counted, because a partial recreate also satisfies a non-zero count.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- 20260924_scope3_category_snapshots.sql
--
-- WHAT A SCOPE 3 CATEGORY FIGURE IS A TOTAL OF, FIXED AT THE MOMENT THE BUYER ACCEPTED IT.
--
-- Today accepting a supplier figure into Category 1 keeps one scalar. app/api/campaigns/[id]/
-- scope3-cat1/route.ts computes a line per supplier, with the method, the supplier's stated basis,
-- the allocation method, the suppliers it could not cover and why, and any non-USD spend it refused
-- to convert. useCatOneFigure in app/dashboard/scope3/page.tsx writes cat_data.cat1.supplier_emissions
-- and discards all of it. The route persists nothing, so the workings exist only in React state for
-- as long as the page is open, and are gone on reload.
--   Limited assurance asks what the figure is made of. This table answers that, per acceptance.
--
-- ⚠️ IMMUTABLE, AND THE GRANTS ARE WHAT ENFORCE IT. `authenticated` is granted SELECT and INSERT and
-- nothing else: no UPDATE, no DELETE. A correction is a NEW row carrying supersedes_id, so history is
-- the chain of superseded rows rather than a separate history table, and nothing that was reported
-- can be quietly rewritten afterwards. Cascade deletes are not grants and still work.
--
-- ⚠️ RLS IS ENABLED AND CARRIES A POLICY IN THIS SAME FILE. Six tables in this database have RLS on
-- and no policy, reachable only through SECURITY DEFINER functions and the service role, which puts
-- their access rule in code review rather than anywhere a linter can see. This table does not join
-- that list. Its reader is the row's own owner, which is exactly what RLS expresses.
--
-- ⚠️ ONE FOREIGN KEY, AND THE ABSENT ONES ARE THE DESIGN. See the comment on `lines`.

create table if not exists public.scope3_category_snapshots (
  id                   uuid primary key default gen_random_uuid(),

  -- The only FK to a parent, and it cascades: a snapshot describing a deleted Scope 3 record
  -- describes nothing. scope3_inventories already cascades from ghg_inventories, so the chain holds.
  scope3_inventory_id  uuid not null references public.scope3_inventories(id) on delete cascade,

  -- ⚠️ CARRIED LOCALLY SO THE POLICY BELOW IS ONE COMPARISON PER QUERY, not a subquery against the
  -- parent per row. It MUST equal scope3_inventories.user_id for the same record; the policy keys on
  -- it, so a row written with somebody else's id would be invisible to its own owner rather than
  -- exposed.
  --
  -- ⚠️ THE DEFAULT IS A BARE auth.uid() AND THAT IS CORRECT HERE. The initplan rule is about POLICY
  -- PREDICATES, where a STABLE function may be re-evaluated once per row and the scalar subselect is
  -- what gets it hoisted. A column DEFAULT is evaluated once per inserted row by definition: there is
  -- nothing to hoist and nothing to gain. A grep over this file for `auth.uid()` outside
  -- `(select auth.uid())` will find this line; it is not the auth_rls_initplan defect.
  --   It exists so the column cannot be wrong on a hand-written insert: omit it and the session's own
  -- id is used. ⚠️ A service-role insert has no session, so auth.uid() is NULL there and the NOT NULL
  -- refuses it. That is deliberate: a server-side writer must name the owner explicitly.
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,

  category             text not null,

  -- The click, not the save. A figure is accepted at a moment; this is that moment.
  accepted_at          timestamptz not null,
  accepted_by          uuid references auth.users(id) on delete set null,

  -- Exactly what went into the total, in the unit it went in as. Not recomputed, not rounded again.
  figure_as_used       numeric not null,
  unit                 text not null,

  -- 'supplier-specific', 'spend-based', or 'mixed' where an inventory's lines are both.
  method               text not null,

  lines                jsonb not null default '[]'::jsonb,
  uncovered            jsonb not null default '[]'::jsonb,
  currency_flags       jsonb not null default '[]'::jsonb,

  -- A restatement points at what it replaces. Null on a first acceptance.
  supersedes_id        uuid references public.scope3_category_snapshots(id) on delete set null,
  restatement_reason   text,

  created_at           timestamptz not null default now(),

  -- ⚠️ A REASON WITH NOTHING TO RESTATE IS MEANINGLESS, AND THAT IS THE ONLY DIRECTION CHECKED HERE.
  -- The other direction, a restatement with NO reason, is deliberately NOT constrained: a NOT NULL on
  -- customer prose produces a full stop, and a reason that exists because the insert refused without
  -- one looks like a justification and is read as one. The absence is gated at the report instead,
  -- beside unjustifiedExclusions in app/dashboard/scope3/page.tsx, which is how this platform already
  -- handles a missing exclusion justification.
  constraint scope3_category_snapshots_reason_needs_supersedes
    check (restatement_reason is null or supersedes_id is not null)
);

create index if not exists scope3_category_snapshots_record_category_idx
  on public.scope3_category_snapshots (scope3_inventory_id, category, accepted_at desc);

alter table public.scope3_category_snapshots enable row level security;

-- ⚠️ (select auth.uid()), NEVER A BARE auth.uid() IN A POLICY. auth.uid() is STABLE, so inside a
-- policy predicate Postgres may re-evaluate it once per row; the scalar subselect has no outer
-- reference, so the planner hoists it to an InitPlan and evaluates it once per query. Supabase's
-- linter reports the bare form as auth_rls_initplan, and a sweep of 84 policies on 21 Sep 2026
-- existed to remove it. (The column DEFAULT above is a different thing: see its comment.)
--
-- ⚠️ TWO POLICIES, SELECT AND INSERT, RATHER THAN ONE `for all`. Immutability is then expressed in the
-- policy as well as in the grants, so it survives a later migration widening a grant. `for all` plus
-- SELECT-and-INSERT grants leaves the table one `grant update` away from being mutable, with nothing
-- in the policy to stop it; two named policies mean an UPDATE or DELETE has no policy at all and is
-- refused whatever the grants say. Belt and braces, deliberately, because the whole value of this
-- table is that what was reported cannot be quietly rewritten.
--
-- ⚠️ AND THE CLAUSES DIFFER BY COMMAND, WHICH IS NOT A STYLE CHOICE. A `for select` policy takes only
-- USING; a `for insert` policy takes only WITH CHECK. Postgres refuses the other combination.
do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename  = 'scope3_category_snapshots'
                    and policyname = 'scope3_category_snapshots_owner_select') then
    create policy scope3_category_snapshots_owner_select on public.scope3_category_snapshots
      for select to authenticated
      using (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename  = 'scope3_category_snapshots'
                    and policyname = 'scope3_category_snapshots_owner_insert') then
    create policy scope3_category_snapshots_owner_insert on public.scope3_category_snapshots
      for insert to authenticated
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- SELECT and INSERT only. With the two policies above, an UPDATE or DELETE is refused twice: once for
-- having no grant, and once for having no policy.
revoke all on public.scope3_category_snapshots from anon;
grant select, insert on public.scope3_category_snapshots to authenticated;

comment on table public.scope3_category_snapshots is
  'What a Scope 3 category figure was a total of, fixed when the buyer accepted it. Immutable: '
  'authenticated holds SELECT and INSERT only, there is no UPDATE or DELETE policy, and a correction '
  'is a new row carrying supersedes_id. '
  'One FK, to scope3_inventories, ON DELETE CASCADE.';

comment on column public.scope3_category_snapshots.lines is
  'The per-supplier lines as /api/campaigns/[id]/scope3-cat1 returned them: supplier_id, '
  'supplier_name, method, data_quality, value_mt, allocation_method, and basis. '
  'THE FIELDS ARE THE DATA AND `basis` IS A RENDERING: it is the sentence that was DISPLAYED at '
  'acceptance, kept verbatim so the record can reproduce what the buyer saw, and it is not the '
  'authority for anything. Rewording the route changes later sentences and must not change these. '
  '⚠️ supplier_name AND supplier_id ARE A FROZEN COPY, NOT A FOREIGN KEY, ON PURPOSE. '
  'campaign_suppliers cascades from supplier_campaigns and supplier_responses cascades from '
  'campaign_suppliers, so an FK here would inherit that and deleting a finished campaign would erase '
  'the evidence for a figure still sitting in a filed report. Do not "fix" this into a foreign key. '
  'The id is kept beside the name for tracing while the campaign exists; the name is what keeps the '
  'row readable after it does not.';

comment on column public.scope3_category_snapshots.restatement_reason is
  'Why this snapshot replaces the one in supersedes_id. Nullable with no default, by design: see the '
  'CHECK constraint comment. An unreasoned restatement is gated at the report, not at the insert.';

comment on column public.scope3_category_snapshots.figure_as_used is
  'Exactly the number that went into the category total at acceptance, in `unit`. Not recomputed.';

-- ── THE POINTER, ON THE RECORD ────────────────────────────────────────────────────────────────
--
-- category -> the id of the snapshot currently in use. History is in the table; this says which row
-- the report currently stands on. Defaulted to '{}' and NOT NULL for the same reason
-- scope3_coverage is: a null would be indistinguishable from a record saved before the column.
alter table public.scope3_inventories
  add column if not exists cat_snapshot_ids jsonb not null default '{}'::jsonb;

comment on column public.scope3_inventories.cat_snapshot_ids is
  'Category id -> scope3_category_snapshots.id currently in use for it. Absent key means no figure '
  'has been accepted from supplier data for that category. The snapshots themselves are immutable, '
  'so this pointer is the only mutable part: a restatement moves it to a new row and the old row '
  'stays readable.';
