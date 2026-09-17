-- 20260916_edition_supersession_columns.sql
--
-- ⚠️ RUN. This file HAS been executed, so public.factor_editions now carries both columns.
--
-- HOW THAT IS KNOWN, since a migration leaves no mark of its own: 20260916_edition_spendconv.sql
-- inserted a row naming fingerprint_spend_conversions in its column list and setting superseded_by
-- in its UPDATE, and that insert succeeded. Postgres rejects an INSERT naming a column that does
-- not exist, so the columns must have been in place before it ran. The evidence is the success of
-- the later file, not anything recorded by this one.
--
-- ⚠️ RE-RUNNING IS SAFE AND INERT, which makes this file the exception among the 20260916 set.
-- Every statement is conditional or idempotent by construction: two ADD COLUMN IF NOT EXISTS, a
-- guarded do-block that checks pg_constraint before adding either constraint, and two COMMENT ON
-- statements that simply rewrite the same text. Nothing here inserts, deletes or alters a value, so
-- a second run finds everything already in place and changes nothing.
--   Contrast the neighbours, where re-running is NOT safe: 20260916_factor_editions.sql would
--   insert a SECOND edition row, because its id changed after it ran and `on conflict (id) do
--   nothing` keys on the id; 20260916_edition_spendconv.sql would silently leave its now-stale
--   notes in place for the same reason; and 20260916_rename_spend_conversions.sql opens with a DROP.
--
-- Not staged, not committed.
--
-- WHAT IT DOES: adds two columns to public.factor_editions, with their constraints and comments.
--
--     fingerprint_spend_conversions  text  -- sha256 of the DERIVED scalars artefact
--     superseded_by                  text  -- the edition that replaces this one, null if current
--
-- ⚠️ WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT A DUPLICATE.
-- 20260916_factor_editions.sql HAS ALREADY BEEN RUN. It created public.factor_editions without
-- these two columns. It was AMENDED afterwards to include them, so that a database built from
-- scratch gets the full table - but an amendment to an already-executed file changes nothing in a
-- database that ran the earlier version. This file is the other half of that amendment: it brings
-- the LIVE table into line with what that file now says.
--
-- So the two are not alternatives and neither is redundant:
--     20260916_factor_editions.sql   defines the table, for a rebuild from nothing
--     THIS FILE                      adds what the live table is missing, for the database we have
-- Re-running the older file is NOT the path - its seed would insert a second edition row under a
-- changed id. See the warning at the top of it.
--
-- ⚠️⚠️ RUN ORDER.
--
--     1. THIS FILE                                adds the two columns
--     2. 20260916_edition_spendconv.sql           inserts -spendconv, links supersession
--     3. 20260916_rename_spend_conversions.sql    drops old table, loads 245 rows
--
-- Step 2 WRITES both columns this file adds - fingerprint_spend_conversions on the row it inserts,
-- superseded_by on the older rows - so running it first fails on columns that do not exist. Step 3
-- depends on step 2 for its foreign-key parent.
--
-- ⚠️ ONE PREREQUISITE SITS OUTSIDE THAT LIST AND IS STILL OUTSTANDING. The live edition row was
-- seeded as 'exiobase-3.8.2-2019-cpi2024' and still carries that id and the pre-renormalisation
-- price-index fingerprint; the reconciling UPDATE reported alongside 20260916_factor_editions.sql
-- renames it to '...-fxnorm' and corrects the fingerprint. That statement is independent of this
-- file - the columns here are added regardless - but step 2's supersession links look for the
-- renamed id. IF THE RECONCILING UPDATE IS NEVER RUN, step 2 sets NO supersession link at all and
-- the old row is left with superseded_by NULL, which reads as "this edition is current". It is not.
-- Run the reconciliation before step 2, or set that row's superseded_by by hand afterwards.
--
-- ═══ WHAT IT DOES NOT DO ═════════════════════════════════════════════════════════════════════
--   * NOTHING DESTRUCTIVE. No TRUNCATE, no DROP, no DELETE, no column dropped or retyped.
--   * NO BACKFILL AND NO VALUE CHANGED. Both columns arrive NULL on every existing row, which is
--     the correct state for them: the earlier editions have no valid derived-artefact fingerprint,
--     and nothing is marked superseded until step 2 says so.
--   * NO ROW INSERTED OR DELETED. It alters a shape, not any content.
--   * TOUCHES NO OTHER TABLE.
--
-- IDEMPOTENT. ADD COLUMN IF NOT EXISTS for both columns; both constraints guarded on pg_constraint;
-- COMMENT ON is unconditionally safe once the columns exist. Re-running changes nothing.
--
-- ⚠️ THE TWO COLUMN COMMENTS BELOW WERE EXTRACTED PROGRAMMATICALLY from
-- 20260916_factor_editions.sql rather than retyped, so the live table's comments and the rebuild
-- file's comments cannot drift apart. Only the header differs between the two.
--
-- ON UPDATE CASCADE on the self-referencing foreign key is deliberate: an edition id has already
-- been changed once in this workstream, and without the cascade a rename would orphan every
-- pointer to it. ON DELETE is left at NO ACTION - deleting an edition something points at must
-- fail, because the supersession chain is the record.

begin;

alter table public.factor_editions
  add column if not exists fingerprint_spend_conversions text;

alter table public.factor_editions
  add column if not exists superseded_by text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'factor_editions_superseded_by_fkey'
                   and conrelid = 'public.factor_editions'::regclass) then
    alter table public.factor_editions
      add constraint factor_editions_superseded_by_fkey
      foreign key (superseded_by) references public.factor_editions (id) on update cascade;
  end if;
  if not exists (select 1 from pg_constraint
                 where conname = 'factor_editions_not_self_superseding'
                   and conrelid = 'public.factor_editions'::regclass) then
    alter table public.factor_editions
      add constraint factor_editions_not_self_superseding
      check (superseded_by is null or superseded_by <> id);
  end if;
end $$;

comment on column public.factor_editions.fingerprint_spend_conversions is
  'sha256 of the DERIVED scalars artefact, lib/emissionFactors/spendConversions.json. '
  '⚠️ THIS IS NOT ONE OF THE FIVE INPUT FINGERPRINTS AND IT IS THE ONLY PLACE A DOWNSTREAM '
  'ARITHMETIC CORRECTION IS VISIBLE. The other five identify the published artefacts an edition '
  'reads FROM - factors, sectors, concordance, price indices. This one identifies what was COMPUTED '
  'from them. Those are different failure surfaces: an edition can carry five unchanged input '
  'digests and still produce different numbers, because the fault was in the derivation rather than '
  'in the data. That is exactly what happened between the -fxnorm and -spendconv editions, whose '
  'five input fingerprints are identical to one another and whose scalars are reciprocals. Without '
  'this column those two rows are distinguishable only by their id and their notes. '
  'NULLABLE, because the two earlier editions have no valid value: the artefact one of them '
  'described held inverted scalars and has been deleted, and the other predates the artefact '
  'entirely. NULL here means "no derived artefact is validly identified for this edition", never '
  '"not applicable" and never "unchanged from the previous edition".';

comment on column public.factor_editions.superseded_by is
  'The edition that replaces this one, or NULL if this edition is current. Self-referencing foreign '
  'key with ON UPDATE CASCADE, so renaming an edition carries the pointers to it. '
  '⚠️ A SUPERSEDED EDITION MUST NEVER PRICE A FIGURE. Once this column is non-null the row is a '
  'RECORD ONLY: it exists so that the history of what was computed, and when it was corrected, '
  'survives - and so that a figure stored under it long ago can still be traced. It is not a '
  'fallback, not a legacy option and not something to read from when the current edition lacks a '
  'row. A calculation that finds superseded_by non-null on the edition it was about to use must '
  'stop, not continue. '
  'Superseding is also why a wrong edition is never edited in place: correcting a row would destroy '
  'the record this column exists to keep. The chain is append-only - each edition points forward to '
  'its replacement, and the current edition is the one with NULL here.';

commit;


-- ── AFTER RUNNING, VERIFY (read-only, safe to paste) ─────────────────────────────────────────
--
--   -- both columns exist and are nullable:
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'factor_editions'
--      and column_name in ('fingerprint_spend_conversions', 'superseded_by')
--    order by column_name;
--
--   -- both constraints landed:
--   select conname from pg_constraint
--    where conrelid = 'public.factor_editions'::regclass
--      and conname in ('factor_editions_superseded_by_fkey',
--                      'factor_editions_not_self_superseding')
--    order by conname;
--
--   -- existing rows untouched: both new columns NULL, nothing else moved:
--   select id, is_active, fingerprint_spend_conversions, superseded_by
--     from public.factor_editions order by id;
--
--   -- the self-supersession check bites (must ERROR, then roll back):
--   --   begin;
--   --     update public.factor_editions set superseded_by = id where id = (select min(id) from public.factor_editions);
--   --   rollback;
