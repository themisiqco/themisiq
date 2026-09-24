-- ==============================================================================================
-- RUN. Executed against the live database on 24 Sep 2026, and verified from outside the database by
-- catalog queries rather than by the absence of an error. The checks below read
-- pg_get_functiondef, not this file: the whitelist test asserts that the three coupled sites agree
-- in git, and only the database settles what is live. This is the migration where that distinction
-- matters most, because what it governs is a disclosure boundary.
--
-- WHAT WAS VERIFIED, 24 Sep 2026:
--   scope3_included is boolean, not null, default false;
--   all 11 grants read false and none reads true, so NO EXISTING LINK WIDENED. That was the whole
--     purpose of the default: 9 active grants were live when this was written, and creating a
--     function granted to anon would otherwise have handed all nine the buyer's supplier list;
--   four verdicts in the live body, and exactly four: consent_required, invalid_or_expired,
--     scope3_not_found, scope3_not_granted;
--   revenue_millions, cat_data, user_id, accepted_by and supplier_id are all emitted false;
--   inventory_id reads true and emits false, as designed: it is how the record is FOUND, never
--     disclosed. cat_snapshot_ids is the same shape, read true and emitted false, and for the same
--     reason. A checker who sees a withheld column named in the body has to tell reading from
--     emitting, and these two are why;
--   gates_consent, tests_revoked, gates_opt_in and preserves_absent_assurance are all true;
--   grants are anon EXECUTE, authenticated EXECUTE and postgres EXECUTE as owner, with no PUBLIC row;
--   the verifier_access policy row is identical before and after the add column, compared row for row
--     rather than counted, because a partial recreate also satisfies a non-zero count.
--
-- A NOTE ON WORDING, CARRIED FROM 20260924_scope3_category_snapshots.sql: this header contains no
-- negated status phrase. CLAUDE.md records two files whose status was mis-read because the words
-- appeared inside an instruction not to re-run the file and inside a warning about what it must not
-- be run against. Prose about a status reads as a status to anything matching substrings, so an audit
-- has to read the leading sentence, and a header should not make that harder than it already is.
-- ==============================================================================================
--
-- 20260924_get_verifier_scope3.sql
--
-- A VERIFIER'S VIEW OF THE SCOPE 3 RECORD, AND THE PER-GRANT OPT-IN THAT GOVERNS IT.
--
-- ASCII ONLY, DELIBERATELY. lib/ghg/verifierWhitelist.test.ts W-6 requires it of verifier-RPC
-- migrations because the 13 Aug 2026 factor_editions paste landed in pieces: only its `alter table`
-- ran, and the comment and grants had to be run separately, with non-ASCII in the header the suspected
-- cause. A migration that cannot be pasted whole is a migration that lands in pieces, and that is how
-- a live function drifts from the file claiming to define it. Two migrations on 24 Sep 2026 carrying
-- 286 and 204 non-ASCII characters pasted cleanly, so the premise may be broader than the evidence;
-- that is not a reason to spend the variable here, on a hand-paste into live production.
--
--
-- PART 1 OF 2: THE OPT-IN. WHY A SEPARATE FUNCTION IS NOT AN ACCESS DECISION.
--
-- WARNING: RPCs ARE GRANTED TO anon. The moment get_verifier_scope3 exists, the holder of ANY valid
-- token can call it. Putting Scope 3 behind its own function is code organisation, not an access
-- boundary: without the flag below, every token already minted would silently gain the buyer's
-- supplier list and every supplier's reported figure, for the remainder of its own 90 days, with no
-- error and no record anywhere.
--   That is not hypothetical. A live count on 24 Sep 2026 returned 9 active grants and 2 revoked. Nine
-- verifiers would have gained third-party commercial data the customer never agreed to disclose under
-- the grant they minted.
--   So the opt-in is DATA, not code. `default false` means no existing grant widens; the customer
-- chooses per grant whether their supplier list travels. This is the same lesson as
-- 20260815_portal_get_whitelist.sql: the June review asked which ROWS a definer function could reach
-- and answered correctly, and nobody asked which COLUMNS. Ask both, out loud, every time.

alter table public.verifier_access
  add column if not exists scope3_included boolean not null default false;

comment on column public.verifier_access.scope3_included is
  'Whether this grant also discloses the Scope 3 record and its category snapshots. FALSE BY DEFAULT, '
  'AND THE DEFAULT IS THE POINT: get_verifier_scope3 is granted to anon like every other verifier RPC, '
  'so without this flag its creation would have widened every grant already minted. Scope 3 Category 1 '
  'discloses SUPPLIER NAMES and their reported figures, which is third-party commercial data rather '
  'than the customer''s own, so it is a separate decision from disclosing the GHG inventory and is '
  'taken per grant by the customer when minting. Never default this to true, and never backfill it.';


-- ==============================================================================================
-- PART 2 OF 2: THE FUNCTION.
--
-- FOUR VERDICTS, EACH DISTINCT, AND THE REASON IS A RULE THIS PLATFORM LEARNED THE HARD WAY.
--   invalid_or_expired  - no such token, revoked, expired, or not active.
--   consent_required    - valid token, terms not yet accepted.
--   scope3_not_granted  - valid token, consented, but this grant does not include Scope 3.
--   scope3_not_found    - all of the above satisfied, and the inventory has no Scope 3 record.
-- Collapsing any of these into "invalid" tells a verifier their link is broken when it is valid and
-- merely narrower, which sends them to the customer for a replacement link that fails identically.
-- app/verify/[token]/page.tsx already carries the scar: its load handler distinguishes an RPC error
-- from an empty result from the RPC's own verdict, because discarding the error once made a revoked
-- grant and a database outage indistinguishable to everyone involved.
--
-- CONSENT IS ENFORCED HERE, IN THE FUNCTION, AND THAT IS A DEPARTURE FROM get_verifier_inventory.
-- WARNING: get_verifier_inventory validates on status and expires_at ONLY. It does not test
-- accepted_at, tos_accepted_at or privacy_accepted_at anywhere in its body; accepted_at appears once,
-- as an output key. Confirmed by pg_get_functiondef on 24 Sep 2026, and its own newest defining
-- migration, 20260814_get_verifier_inventory_factor_editions.sql line 95, says the same. So the GHG
-- consent gate is client-side only and a direct RPC call with a valid token bypasses it. That gap is
-- recorded in docs/backlog.md and is NOT closed here.
--   This function does not inherit it. The gate mirrors lib/ghg/verifierGrant.ts, which is already the
-- single source of truth for "may this GHG verifier token see evidence right now?" and which hard-gates
-- document metadata and signed URLs on accepted_at. Its two denial strings, invalid_or_expired and
-- consent_required, are reused verbatim rather than invented: the vocabulary already exists.
--   Gated on accepted_at, not on tos_accepted_at and privacy_accepted_at, for two reasons. First,
-- verifier_accept_invite sets all four in one UPDATE, so they cannot disagree. Second, matching the
-- document gate exactly is the coherent choice: evidence documents are at least as sensitive as a
-- supplier list, and a stricter bar here than on the documents beside it would be arbitrary.
--   revoked_at is tested too, again mirroring verifierGrant.ts rather than get_verifier_inventory.
--
-- WHAT IS WITHHELD, AND WHY EACH.
--   scope3_inventories: id, user_id, inventory_id  - internal identifiers, useless to a verifier and a
--     join key into everything else. Same exclusions get_verifier_inventory names.
--   revenue_millions - the GHG whitelist excludes revenue_millions BY NAME. Two verifier surfaces
--     disagreeing about the same field would be indefensible.
--   cat_data - the working state. The snapshot is the filed record. Sending both invites a verifier to
--     reconcile two versions of one figure, and the one they should rely on is the frozen one.
--   cat_snapshot_ids - the pointer is how THIS function finds the snapshots; a verifier has no
--     endpoint to resolve an id against and no use for one.
--   created_at, updated_at - when a draft was touched is not an assurance fact.
--   snapshots: id, user_id, accepted_by, scope3_inventory_id, created_at. accepted_by is a uuid,
--     useless as given and PII as an email. get_verifier_inventory does disclose user_email in audit
--     entries, so there is a precedent for identity, but adding a second identity channel is its own
--     decision and is not taken here.
--   lines[].supplier_id, uncovered[].supplier_id, currency_flags[].supplier_id - internal uuids, and
--     join keys into the campaign tables. The supplier NAME is what a verifier samples against.
--
-- WHAT IS DISCLOSED THAT SOMEONE MIGHT NOT EXPECT: the buyer's own annual spend per supplier, inside
-- the spend-based `basis` string and in currency_flags.spend. That is the customer's own commercial
-- data going to the customer's own verifier, and the arithmetic cannot be checked without it. Stated
-- here so nobody discovers it by accident later.
--
-- WARNING: THE lines REBUILD MUST PRESERVE AN ABSENT assurance KEY AS ABSENT.
-- A line with no `assurance` key is a snapshot accepted before that field existed. It does NOT mean
-- "not assured", and the table is immutable so those rows are never backfilled. Writing
-- 'assurance', l->'assurance' turns absent into null and destroys the distinction, because null then
-- reads as one of the recorded absences rather than as a row that predates the field.
--   supplier_assurance_raw is conditional on the SAME key, as a pair, and that is not tidiness: a
-- pre-field line handed supplier_assurance_raw = null would read as a supplier who was asked and did
-- not answer, which is a claim about a supplier nobody ever put the question to.
-- See lib/scope3/supplierAssurance.ts and the column comment on scope3_category_snapshots.lines.
-- ==============================================================================================

create or replace function public.get_verifier_scope3(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access    verifier_access%rowtype;
  v_record    jsonb;
  v_record_id uuid;
  v_pointers  jsonb;
  v_snapshots jsonb;
begin
  -- Mirrors lib/ghg/verifierGrant.ts, including revoked_at, which get_verifier_inventory omits.
  select * into v_access from verifier_access
    where token = p_token
      and status = 'active'
      and expires_at > now()
      and revoked_at is null;
  if not found then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  -- Consent hard-gate. Authoritative, server-side, token-only.
  if v_access.accepted_at is null then
    return jsonb_build_object('error', 'consent_required');
  end if;

  if not coalesce(v_access.scope3_included, false) then
    return jsonb_build_object('error', 'scope3_not_granted');
  end if;

  -- EXPLICIT COLUMN WHITELIST. A column added to scope3_inventories is NOT disclosed until it is
  -- named here. The four scope3_categories_* / scope3_exclusions_unjustified counts are included
  -- because a figure that omits part of the inventory must say so, and exclusions_unjustified is the
  -- honest disclosure a verifier is entitled to rather than something to hide.
  select s.id,
         jsonb_build_object(
           'sector',                        s.sector,
           'currency',                      s.currency,
           'country_iso2',                  s.country_iso2,
           'factor_basis',                  s.factor_basis,
           'status',                        s.status,
           'total_scope3_tco2e',            s.total_scope3_tco2e,
           'scope3_coverage',               s.scope3_coverage,
           'categories_relevant',           s.scope3_categories_relevant,
           'categories_in_total',           s.scope3_categories_in_total,
           'categories_unpriced',           s.scope3_categories_unpriced,
           'exclusions_unjustified',        s.scope3_exclusions_unjustified
         ),
         s.cat_snapshot_ids
    into v_record_id, v_record, v_pointers
    from scope3_inventories s
   where s.inventory_id = v_access.inventory_id;

  if v_record is null then
    return jsonb_build_object('error', 'scope3_not_found');
  end if;

  -- The snapshots this record currently stands on. Keyed by cat_snapshot_ids rather than by "every
  -- snapshot for this record": superseded rows stay readable in the table on purpose, but the filed
  -- figure is the one the pointer names, and handing a verifier the whole chain unlabelled would
  -- invite them to reconcile figures that were never both current.
  -- WARNING: ORDERED BY THE CATEGORY NUMBER, NOT THE CATEGORY STRING. Lexical order on 'cat1'..'cat15'
  -- puts cat10 immediately after cat1 and cat2 after cat15, so a verifier reads the categories of a
  -- GHG Protocol inventory out of their standard order, in a document whose whole purpose is to be
  -- checked against that standard. The numeric suffix is extracted for sorting only.
  select coalesce(jsonb_agg(snap order by cat_num, cat_txt), '[]'::jsonb)
    into v_snapshots
    from (
      select coalesce(nullif(regexp_replace(cs.category, '[^0-9]', '', 'g'), '')::int, 9999) as cat_num,
             cs.category as cat_txt,
             jsonb_build_object(
               'category',           cs.category,
               'accepted_at',        cs.accepted_at,
               'figure_as_used',     cs.figure_as_used,
               'unit',               cs.unit,
               'method',             cs.method,
               -- The FACT of a restatement and its stated reason, not the internal id. The prior
               -- figure itself is a further disclosure and a separate decision; see the header.
               'is_restatement',     cs.supersedes_id is not null,
               'restatement_reason', cs.restatement_reason,

               'lines', (
                 select coalesce(jsonb_agg(
                          jsonb_build_object(
                            'supplier_name',     l ->> 'supplier_name',
                            'method',            l ->> 'method',
                            'data_quality',      l ->> 'data_quality',
                            'value_mt',          l -> 'value_mt',
                            'basis',             l ->> 'basis',
                            'allocation_method', l ->> 'allocation_method'
                          )
                          -- Conditional, as a PAIR. Absent stays absent: see the header warning.
                          || case when l ? 'assurance'
                                  then jsonb_build_object(
                                         'assurance',              l -> 'assurance',
                                         'supplier_assurance_raw', l -> 'supplier_assurance_raw')
                                  else '{}'::jsonb end
                          order by ord), '[]'::jsonb)
                   from jsonb_array_elements(cs.lines) with ordinality as t(l, ord)
               ),

               'uncovered', (
                 select coalesce(jsonb_agg(
                          jsonb_build_object(
                            'supplier_name', u ->> 'supplier_name',
                            'reason',        u ->> 'reason')
                          order by ord), '[]'::jsonb)
                   from jsonb_array_elements(cs.uncovered) with ordinality as t(u, ord)
               ),

               'currency_flags', (
                 select coalesce(jsonb_agg(
                          jsonb_build_object(
                            'supplier_name', c ->> 'supplier_name',
                            'spend',         c -> 'spend',
                            'currency',      c ->> 'currency',
                            'note',          c ->> 'note')
                          order by ord), '[]'::jsonb)
                   from jsonb_array_elements(cs.currency_flags) with ordinality as t(c, ord)
               )
             ) as snap
        from scope3_category_snapshots cs
       where cs.scope3_inventory_id = v_record_id
         -- The pointer, captured above. No join back to scope3_inventories is needed for it, and one
         -- fewer join is one fewer thing to get wrong in a file pasted by hand into production.
         and cs.id::text in (select value from jsonb_each_text(v_pointers))
    ) ordered;

  return jsonb_build_object(
    'scope3',    v_record,
    'snapshots', v_snapshots,
    -- WARNING: NO AUDIT TRAIL, AND THE PAGE MUST SAY SO RATHER THAN LEAVE IT BLANK.
    -- scope3_inventories appears in no audit trigger, so there is no revision history for it the way
    -- there is for ghg_inventories. The snapshot chain is the substitute and is arguably the better
    -- record: it holds what was FILED at each acceptance rather than what was edited. A verifier who
    -- finds an audit trail beside the GHG figures and none beside these must be told why.
    'has_audit_trail', false
  );
end; $$;

revoke all on function public.get_verifier_scope3(uuid) from public;
grant execute on function public.get_verifier_scope3(uuid) to anon, authenticated;

comment on function public.get_verifier_scope3(uuid) is
  'A verifier token''s view of the Scope 3 record and the category snapshots it currently stands on. '
  'EXPLICIT COLUMN WHITELIST: a column added to scope3_inventories or to scope3_category_snapshots is '
  'NOT disclosed until it is named in this function. Gated on verifier_access.scope3_included, which '
  'defaults to false so that creating this function widened no grant already minted. Enforces consent '
  'in the body, mirroring lib/ghg/verifierGrant.ts, which get_verifier_inventory does not. Four '
  'distinct verdicts: invalid_or_expired, consent_required, scope3_not_granted, scope3_not_found.';
