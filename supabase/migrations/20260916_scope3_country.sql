-- 20260916_scope3_country.sql
--
-- ⚠️ RUN. public.scope3_inventories now carries country_iso2.
--
-- VERIFIED LIVE, 16 Sep 2026: country_iso2 is present on public.scope3_inventories as a nullable
-- char(2), and scope3_inventories_country_iso2_format is present with the definition
--   CHECK ((country_iso2 IS NULL) OR (country_iso2 ~ '^[A-Z]{2}$'::text))
-- which is this file's constraint as Postgres normalises it. The column COMMENT was not part of
-- that check.
--
-- ⚠️ RE-RUNNING WRITES NOTHING TO ANY ROW, AND IS INERT IN EFFECT — BUT NOT EVERY STATEMENT IS A
-- NO-OP, SO HERE IS EACH ONE:
--   · ALTER TABLE ... ADD COLUMN IF NOT EXISTS country_iso2: finds the column and skips with a
--     NOTICE. The test is by NAME only; it would not notice a column of the same name with a
--     different type. Live is char(2), so there is nothing to miss. The ALTER still takes its
--     ACCESS EXCLUSIVE lock on scope3_inventories for the moment it runs, even when it skips.
--   · The DO block: skips, because its guard finds scope3_inventories_country_iso2_format on this
--     table. Also by NAME only, not definition; the live definition matches this file's.
--   · COMMENT ON COLUMN: NOT skipped. It is unconditional and REPLACES the live comment with the
--     text in this file every time. Today that text is what the first run wrote, so the result is
--     unchanged. If the COMMENT below is ever edited, re-running this file is how that edit would
--     reach the database, which is the one way a re-run is not inert.
--   · BEGIN / COMMIT: no effect of their own.
--   No INSERT, UPDATE, DELETE, DROP or TRUNCATE appears anywhere in the file.
--
-- WHAT IT DOES: adds one nullable column, public.scope3_inventories.country_iso2, so a Scope 3
-- inventory can record WHERE the spend it reports was produced. Today the table records what the
-- customer bought (sector, currency, revenue_millions, cat_data) and nothing about where it came
-- from, so a spend-based factor has no country to resolve against. This migration adds the
-- storage and nothing else, and no figure changes as a result of running it. The Scope 3 wizard
-- (app/dashboard/scope3/page.tsx, "Primary country of supply") restores and saves the value; no
-- calculation reads it.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   · No backfill, no DEFAULT, no UPDATE — and in this case that is not a judgement call about
--     existing data, because THERE IS NO EXISTING DATA. public.scope3_inventories held 0 rows when
--     checked on 16 Sep 2026. A backfill decision was never made because there was nothing to
--     decide about. If that changes before this file is run, it changes nothing here: the column
--     arrives NULL on every row, and NULL is a meaningful value (see the comment below).
--   · Nothing destructive. No DROP, no TRUNCATE, no DELETE, no ALTER ... DROP. The single ALTER is
--     an ADD COLUMN, which cannot lose data even on a populated table.
--   · No index. Nothing queries by country yet. Add one when something does.
--   · No GRANT block. Grants attach to the table, not the column, and public.scope3_inventories
--     already carries its own. A new TABLE would need one; a new COLUMN on an existing table does
--     not.
--   · No change to RLS. The table's single FOR ALL policy (scope3_owner_all, recorded in
--     20260908_scope3_inventories_definition.sql) is row-level and covers this column as it stands.
--
-- IDEMPOTENT. The column uses ADD COLUMN IF NOT EXISTS; the constraint sits behind a pg_constraint
-- guard, because Postgres has no ADD CONSTRAINT IF NOT EXISTS. See the re-run note at the top for
-- what a second run actually does, including the COMMENT, which is not guarded.
--
-- BEFORE IT RAN, the column was absent from everything git could show: neither
-- 20260908_scope3_inventories_definition.sql nor the then-newest dump
-- (db/dumps/schema_public_20260914_0856.sql, 14 Sep 08:56) had it. That was evidence rather than
-- proof, which is why the statements are guarded. The live check recorded at the top now settles it.
--
--
-- ── NO FOREIGN KEY TO public.country_regions, AND THE REASON IS COVERAGE ──────────────────────
--
-- A foreign key here would be wrong, not merely unnecessary. public.country_regions holds 212
-- rows; ISO 3166-1 currently assigns 249 alpha-2 codes, and one of the 212 (XK, Kosovo) is
-- user-assigned rather than ISO-assigned. So AT LEAST 38 legitimate country codes have no row in
-- country_regions, and an FK would reject every one of them at INSERT — refusing to record a fact
-- the customer knows, because our concordance has no factor for it.
--
-- These are real places, not edge cases invented to win the argument. Verified absent from the
-- 212: Vatican City (VA), St. Martin (MF), St. Barthelemy (BL), St. Pierre and Miquelon (PM),
-- Wallis and Futuna (WF), Faroe Islands (FO), Gibraltar (GI), Jersey (JE), Guernsey (GG), Isle of
-- Man (IM), Aland Islands (AX), Niue (NU), Tokelau (TK), Guam (GU), American Samoa (AS), Northern
-- Mariana Islands (MP), U.S. Virgin Islands (VI), Western Sahara (EH).
--
-- The right shape is: record the country, and let the RESOLUTION fail loudly and separately when
-- there is no region for it. "We know the country and have no factor for it" is a different state
-- from "we do not know the country", and an FK collapses the first into the second by making it
-- unrecordable. That distinction is the whole point of the column, so the constraint is a format
-- CHECK only — the same shape campaign_suppliers.country_iso2 already uses
-- (campaign_suppliers_country_iso2_format, 20260915_portal_supplier_sector.sql).
--   ⚠️ TO BE ACCURATE ABOUT THE PRECEDENT: that file made the same choice — format CHECK, no FK —
-- but never wrote down WHY. The reasoning above is recorded here for the first time. If the two
-- columns are ever reviewed together, this is the file that explains both.
--
--
-- ── ⚠️ THE WF COLLISION ──────────────────────────────────────────────────────────────────────
--
-- WF is an ISO 3166-1 country code meaning Wallis and Futuna. WF is ALSO a region code in
-- public.region_spend_conversions and public.country_regions.region_code, where it means RoW
-- Africa. The two are unrelated and there is no relationship to infer between them.
--
-- NEVER COMPARE THIS COLUMN AGAINST A region_code. A join or an equality test between
-- scope3_inventories.country_iso2 and any region_code column will silently pair a Pacific island
-- with an African regional average, and it will do so without error, without a NULL, and without
-- anything a verifier could see. WA, WL, WE and WM are not ISO codes at all, so WF is the only
-- collision of its kind — which makes it the only one nobody is looking for.
--
-- Two details that make this sharper here than elsewhere:
--   · Wallis and Futuna is NOT one of the 212, so 'WF' in this column resolves to no region at
--     all. Code that "falls back" from a failed country lookup to a region lookup would turn that
--     miss into a wrong answer rather than an error.
--   · Both columns are char(2) of uppercase letters, so no type check, no length check and no
--     format CHECK will ever catch the confusion. Only the column names distinguish them.
--
-- The same warning is recorded on public.country_regions.region_code (20260915_country_regions.sql)
-- and on region_spend_conversions.region_code (20260916_rename_spend_conversions.sql). It is
-- repeated rather than cross-referenced because the person who writes the bad join will be reading
-- THIS table's definition, not that one.

begin;

-- ═══ 1. COLUMN ═══════════════════════════════════════════════════════════════════════════════

alter table public.scope3_inventories add column if not exists country_iso2 char(2);


-- ═══ 2. CONSTRAINT ═══════════════════════════════════════════════════════════════════════════
--
-- Format only. Uppercase, two letters, or NULL. This does NOT assert that the code is a real
-- country, and it deliberately does not assert that country_regions has a row for it — see the
-- coverage note in the header.
--
-- Guarded rather than plain so the file can be re-run after a partial apply.

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'scope3_inventories_country_iso2_format'
       and conrelid = 'public.scope3_inventories'::regclass
  ) then
    alter table public.scope3_inventories
      add constraint scope3_inventories_country_iso2_format
      check (country_iso2 is null or country_iso2 ~ '^[A-Z]{2}$');
  end if;
end $$;


-- ═══ 3. COMMENT ══════════════════════════════════════════════════════════════════════════════

comment on column public.scope3_inventories.country_iso2 is
  'Where the goods and services in this Scope 3 inventory were PRODUCED, as a two-letter uppercase '
  'ISO 3166-1 alpha-2 code such as ''DE'' or ''VN''. '
  '⚠️ THIS IS THE SUPPLIER''S COUNTRY, NOT THE BUYER''S. It is the country whose production a '
  'spend-based emission factor should represent, so it is where the money went, not where the '
  'company reporting sits. A US company buying from a Vietnamese factory records VN here. Getting '
  'this backwards prices foreign production at domestic intensity, which is a wrong figure rather '
  'than a missing one, and nothing downstream can detect it. '
  'NULL means nobody has recorded where the spend was produced - not that it was domestic, and not '
  'that it is unknowable. A NULL leaves a spend-based estimate with no country to price against. '
  'HOW IT RESOLVES: this column is a COUNTRY, not a region. It is looked up in '
  'public.country_regions to obtain an EXIOBASE region_code, and that region is what a factor is '
  'read against. The two are not interchangeable: country_regions covers 212 codes out of the 249 '
  'ISO assigns, so a perfectly valid country may resolve to nothing at all. That is why this column '
  'has no foreign key - a country we cannot price must still be recordable. Treat a failed lookup '
  'as a flagged gap, never as a silent fallback. '
  '⚠️ WF IS A TRAP AND IT IS THE ONLY ONE. Here WF is the ISO country code for Wallis and Futuna. '
  'In country_regions.region_code and region_spend_conversions.region_code, WF is a REGION code '
  'meaning RoW Africa. They are unrelated. Never compare this column against a region_code and '
  'never default one to the other: both are char(2) uppercase, so the confusion passes every '
  'constraint silently and pairs a Pacific island with an African average. Wallis and Futuna is '
  'not among the 212, which means such a join produces a wrong answer where a failed lookup should '
  'have produced an error. WA, WL, WE and WM are not ISO codes, so WF is the only collision.';

commit;


-- ── AFTER RUNNING, VERIFY (read-only except where noted; safe to paste) ──────────────────────
--
-- 1. The column exists, is char(2), and is NULLABLE with no default:
--
--   select column_name, data_type, character_maximum_length, is_nullable, column_default
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name   = 'scope3_inventories'
--      and column_name  = 'country_iso2';
--
--   -- expect exactly one row: country_iso2 | character | 2 | YES | (null)
--
--
-- 2. The constraint is present, and its definition is the one intended:
--
--   select conname, pg_get_constraintdef(oid) as definition
--     from pg_constraint
--    where conrelid = 'public.scope3_inventories'::regclass
--      and conname  = 'scope3_inventories_country_iso2_format';
--
--   -- expect: CHECK (country_iso2 IS NULL OR country_iso2 ~ '^[A-Z]{2}$'::text)
--
--
-- 3. There is no foreign key on the column (the coverage decision, confirmed rather than assumed):
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'public.scope3_inventories'::regclass
--      and contype  = 'f';
--
--   -- expect the two pre-existing FKs (user_id, inventory_id) and NOTHING naming country_iso2.
--
--
-- 4. The constraint actually rejects a lowercase value. ROLLED BACK — writes nothing.
--
--    ⚠️ THIS BLOCK IS THE ONLY ONE HERE THAT WRITES, AND IT UNDOES ITSELF. Run it as a whole.
--    The ROLLBACK is not optional tidying: without it the failed statement leaves the session in
--    an aborted transaction and every later statement errors until you end it.
--
--    Why the NOT NULL columns can be filled with throwaway uuids: a CHECK constraint is evaluated
--    while the row is being formed, whereas a FOREIGN KEY is an AFTER ROW trigger. The check fires
--    first and the transaction aborts, so the FK trigger never runs and the fake uuids are never
--    tested against auth.users or ghg_inventories. That is why this needs no real inventory.
--
--   begin;
--     insert into public.scope3_inventories (user_id, inventory_id, country_iso2)
--     values (gen_random_uuid(), gen_random_uuid(), 'de');
--     -- EXPECTED: ERROR ... new row ... violates check constraint
--     --           "scope3_inventories_country_iso2_format"   (SQLSTATE 23514)
--     -- If this INSERT SUCCEEDS, the constraint is missing or wrong. Roll back either way.
--   rollback;
--
--   -- confirm nothing survived, and that the row count is what it was:
--   select count(*) as rows_now from public.scope3_inventories;   -- expect 0, as on 16 Sep 2026
