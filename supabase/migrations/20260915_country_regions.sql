-- 20260915_country_regions.sql
--
-- ⚠️ RUN. public.country_regions exists and is seeded.
--
-- VERIFIED THIS SESSION: 212 rows - 197 basis 'published', 15 'manual-resolution' - with bucket
-- sizes WA 45, WE 14, WF 52, WL 42, WM 15, matching this file's own seed counts exactly. The
-- reference_data_fingerprints row for 'country_regions' is present alongside the 'exiobase_sectors'
-- row seeded by 20260914.
--
-- ⚠️ RE-RUNNING IS INERT. CREATE TABLE IF NOT EXISTS, a guarded policy block, and an INSERT with
-- ON CONFLICT (iso2) DO NOTHING against a full table. The fingerprint row is the one exception and
-- it is deliberate: its ON CONFLICT DO UPDATE rewrites the same digest and bumps seeded_at.
-- ⚠️ WHICH ALSO MEANS A RE-RUN CANNOT CORRECT A ROW - see the note on that further down. If a
-- country's region is found wrong, that is a new migration, not a re-run of this one.
--
-- WHAT IT DOES: creates public.country_regions and seeds it with 212 rows saying which of
-- EXIOBASE 3's 49 regions a country's spend is priced against, then records the seed's fingerprint
-- in reference_data_fingerprints. It creates ONE new table and touches no existing one. No other
-- table is backfilled, altered or read.
--
-- WHY THE TABLE EXISTS: EXIOBASE resolves 44 countries individually and sweeps the rest into five
-- buckets - WA, WL, WE, WF, WM. A supplier in Vietnam has no EXIOBASE region of its own, so without
-- this table a spend factor cannot be looked up for them at all. lib/emissionFactors/spend.ts has
-- been returning null for exactly that reason, deliberately, rather than inventing the geography.
-- This is the published geography it was waiting for.
--
-- ⚠️ THE ROWS BELOW WERE NOT PRODUCED BY RUNNING scripts/generate-country-regions.py.
-- That script was written in the same pass as this file and has not been run either. The rows here
-- were computed from the same workbook by the same rules, which is not the same thing as being its
-- output. BEFORE RUNNING THIS MIGRATION, run the generator and compare:
--
--     /tmp/exio-venv/bin/python scripts/generate-country-regions.py
--
-- and check that the mapping sha256 it prints equals the fingerprint seeded at the bottom of this
-- file. If the two differ, this file is stale and the generator is right - regenerate the INSERT
-- from lib/emissionFactors/countryRegions.json rather than running what is here.
--
-- WHAT IT DELIBERATELY DOES NOT DO:
--   * No destructive statement. No TRUNCATE, no DROP, no DELETE, no ALTER ... DROP. Safe against a
--     database holding real customer rows.
--   * No backfill of any other table. campaign_suppliers is not read or written.
--   * NO FOREIGN KEY FROM campaign_suppliers.country_iso2 TO THIS TABLE, AND THAT IS THE POINT
--     WORTH READING TWICE. Coverage is 212 of the 249 codes in ISO 3166-1 - 38 have no entry,
--     mostly uninhabited territories, overseas dependencies and small islands the source does not
--     resolve. An FK would reject a supplier in Gibraltar, Guadeloupe or the Faroe Islands at
--     write time: a real supplier in a real country, refused because our reference data is
--     incomplete. The gap belongs in the read path, where it can be reported as unpriceable, not
--     in a constraint that blocks data entry.
--     The generator prints the 38 in full on every run; they are not enumerated here because a
--     copy of a generated list is a copy that goes stale.
--     ⚠️ ONE OF THE 38 IS WF, AND WF IS ALSO A REGION CODE IN THIS VERY TABLE. As an iso2 it is
--     Wallis and Futuna, which has NO row here; as a region_code it is RoW Africa, which 52 rows
--     point at. Same two letters, two unrelated meanings, two adjacent columns. So a lookup that
--     "finds WF" has found nothing about Wallis and Futuna, and code that falls back from an
--     unmatched country code to a region code would silently price a Wallis and Futuna supplier
--     as African. Never compare iso2 against region_code, and never default one to the other.
--     WA, WL, WE and WM are not ISO codes at all, so WF is the only collision of its kind.
--
-- IDEMPOTENT. CREATE TABLE IF NOT EXISTS, guarded policy and constraint blocks, INSERT ... ON
-- CONFLICT DO NOTHING. Re-running changes nothing.
--
-- ⚠️ ON CONFLICT (iso2) DO NOTHING MEANS THIS FILE CANNOT CORRECT A ROW. That is intentional for a
-- first seed - it makes a re-run harmless - but it also means that if a country's region is ever
-- found to be wrong, re-running this migration will NOT fix it. Correcting a row is a new migration
-- that says what it is changing and why.
--
-- SOURCE: Bjelle, E.L., Wiebe, K.S., Tobben, J., Tisserant, A., Ivanova, D., Vita, G., Wood, R.
-- (2020). "Adding country resolution to EXIOBASE: impacts on land use embodied in trade", Journal
-- of Economic Structures, Additional file 2. DOI 10.6084/m9.figshare.11854137.
-- The country-to-region assignment is the paper's, not ours. Attribution is required wherever a
-- figure derived from it is shown.
--
-- SEEDED COUNTS (from the workbook): 212 countries; buckets WA 45, WL 42, WE 14, WF 52, WM 15;
-- 44 countries resolved individually; basis published 197, manual-resolution 15.

begin;

-- ═══ 1. THE TABLE ════════════════════════════════════════════════════════════════════════════

create table if not exists public.country_regions (
  iso2         char(2)     primary key check (iso2 ~ '^[A-Z]{2}$'),
  country_name text        not null,
  region_code  text        not null,
  basis        text        not null check (basis in ('published', 'manual-resolution')),
  created_at   timestamptz not null default now()
);

comment on table public.country_regions is
  'Which of EXIOBASE 3''s 49 regions a country''s spend is priced against. CLASSIFICATION ONLY - '
  'this table holds NO emission factors; it says which region to look a factor up under, not what '
  'the factor is. The assignment is published by Bjelle et al. (2020), DOI '
  '10.6084/m9.figshare.11854137, Additional file 2, and is theirs rather than ours. Coverage is '
  '212 of the 249 ISO 3166-1 alpha-2 codes; a country absent from this table has no region and '
  'must be treated as unpriceable rather than defaulted into a bucket.';

comment on column public.country_regions.iso2 is
  'The country, as a two-letter uppercase ISO 3166-1 alpha-2 code such as ''VN'' or ''DE''. One row '
  'per country. XK (Kosovo) is the single exception: ISO 3166-1 assigns it no code, XK is '
  'user-assigned and in wide de facto use, and it is recorded here so Kosovo is not simply absent.';

comment on column public.country_regions.country_name is
  'The country''s name exactly as the published source spells it, kept verbatim so a reader can '
  'find the row in the original workbook. It is NOT the current or official name in every case: '
  'the names ''Swaziland'', ''Macedonia'' and ''Turkey'' all appear under their pre-rename '
  'spellings, because that is what the source says. Display a current name from elsewhere if you '
  'need one; do not correct this column.';

comment on column public.country_regions.region_code is
  'The EXIOBASE 3 region this country''s spend is priced against - either its own two-letter code, '
  'for the 44 countries EXIOBASE resolves individually, or one of the five rest-of-world buckets: '
  'WA, WL, WE, WF, WM. A factor read through a bucket is an average across dozens of economies, '
  'not a national figure, and must be described that way wherever it is shown. '
  '⚠️ WF IS BOTH THINGS AND THEY ARE UNRELATED: as a region_code it means RoW Africa, as an iso2 it '
  'means Wallis and Futuna. Never compare this column against iso2, and never default one to the '
  'other. WA, WL, WE and WM are not ISO codes at all, so WF is the only collision.';

comment on column public.country_regions.basis is
  'How this row''s country code was arrived at. ''published'' means the source''s own name resolved '
  'directly to an ISO 3166-1 code with no judgement involved. ''manual-resolution'' means someone '
  'decided: a renamed country, an abbreviation, a spelling variant, or a territory ISO does not '
  'list. The reasons are recorded one per entry in COUNTRY_OVERRIDE in '
  'scripts/generate-country-regions.py. The region is the source''s in BOTH cases - this column is '
  'about the country code only, never about the region assignment.';

comment on column public.country_regions.created_at is
  'When this row was seeded. Bookkeeping only; nothing reads it.';

grant select on public.country_regions to authenticated, anon;
grant all    on public.country_regions to service_role;

-- Reference data, world-readable by design: it is a published classification with no customer data
-- in it, and the resolver needs it before a session exists. Read-only to everyone but service_role.
alter table public.country_regions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'country_regions'
                   and policyname = 'country_regions_read') then
    create policy country_regions_read on public.country_regions
      for select to authenticated, anon using (true);
  end if;
end $$;

create index if not exists country_regions_region_idx on public.country_regions (region_code);


-- ═══ 2. SEED - 212 ROWS ═════════════════════════════════════════════════════════════════════
--
-- Do not hand-edit these values. They are a transcription of the published workbook; the authority
-- is lib/emissionFactors/countryRegions.json and the generator that writes it.

insert into public.country_regions (iso2, country_name, region_code, basis) values
  ('AD', 'Andorra', 'WE', 'published'),
  ('AE', 'United Arab Emirates', 'WM', 'published'),
  ('AF', 'Afghanistan', 'WA', 'published'),
  ('AG', 'Antigua and Barbuda', 'WL', 'published'),
  ('AI', 'Anguilla', 'WL', 'published'),
  ('AL', 'Albania', 'WE', 'published'),
  ('AM', 'Armenia', 'WA', 'published'),
  ('AO', 'Angola', 'WF', 'published'),
  ('AR', 'Argentina', 'WL', 'published'),
  ('AT', 'Austria', 'AT', 'published'),
  ('AU', 'Australia', 'AU', 'published'),
  ('AW', 'Aruba', 'WL', 'published'),
  ('AZ', 'Azerbaijan', 'WA', 'published'),
  ('BA', 'Bosnia and Herzegovina', 'WE', 'published'),
  ('BB', 'Barbados', 'WL', 'published'),
  ('BD', 'Bangladesh', 'WA', 'published'),
  ('BE', 'Belgium', 'BE', 'published'),
  ('BF', 'Burkina Faso', 'WF', 'published'),
  ('BG', 'Bulgaria', 'BG', 'published'),
  ('BH', 'Bahrain', 'WM', 'published'),
  ('BI', 'Burundi', 'WF', 'published'),
  ('BJ', 'Benin', 'WF', 'published'),
  ('BM', 'Bermuda', 'WL', 'published'),
  ('BN', 'Brunei Darussalam', 'WA', 'published'),
  ('BO', 'Bolivia', 'WL', 'published'),
  ('BR', 'Brazil', 'BR', 'published'),
  ('BS', 'Bahamas', 'WL', 'published'),
  ('BT', 'Bhutan', 'WA', 'published'),
  ('BW', 'Botswana', 'WF', 'published'),
  ('BY', 'Belarus', 'WE', 'published'),
  ('BZ', 'Belize', 'WL', 'published'),
  ('CA', 'Canada', 'CA', 'published'),
  ('CD', 'DR Congo', 'WF', 'manual-resolution'),
  ('CF', 'Central African Republic', 'WF', 'published'),
  ('CG', 'Congo Republic', 'WF', 'manual-resolution'),
  ('CH', 'Switzerland', 'CH', 'published'),
  ('CI', 'Cote d''Ivoire', 'WF', 'manual-resolution'),
  ('CK', 'Cook Islands', 'WA', 'published'),
  ('CL', 'Chile', 'WL', 'published'),
  ('CM', 'Cameroon', 'WF', 'published'),
  ('CN', 'China', 'CN', 'published'),
  ('CO', 'Colombia', 'WL', 'published'),
  ('CR', 'Costa Rica', 'WL', 'published'),
  ('CU', 'Cuba', 'WL', 'published'),
  ('CV', 'Cabo Verde', 'WF', 'published'),
  ('CW', 'Curacao', 'WL', 'manual-resolution'),
  ('CY', 'Cyprus', 'CY', 'published'),
  ('CZ', 'Czech Republic', 'CZ', 'published'),
  ('DE', 'Germany', 'DE', 'published'),
  ('DJ', 'Djibouti', 'WF', 'published'),
  ('DK', 'Denmark', 'DK', 'published'),
  ('DM', 'Dominica', 'WL', 'published'),
  ('DO', 'Dominican Republic', 'WL', 'published'),
  ('DZ', 'Algeria', 'WF', 'published'),
  ('EC', 'Ecuador', 'WL', 'published'),
  ('EE', 'Estonia', 'EE', 'published'),
  ('EG', 'Egypt', 'WM', 'published'),
  ('ER', 'Eritrea', 'WF', 'published'),
  ('ES', 'Spain', 'ES', 'published'),
  ('ET', 'Ethiopia', 'WF', 'published'),
  ('FI', 'Finland', 'FI', 'published'),
  ('FJ', 'Fiji', 'WA', 'published'),
  ('FM', 'Micronesia, Fed. Sts.', 'WA', 'manual-resolution'),
  ('FR', 'France', 'FR', 'published'),
  ('GA', 'Gabon', 'WF', 'published'),
  ('GB', 'United Kingdom', 'GB', 'published'),
  ('GD', 'Grenada', 'WL', 'published'),
  ('GE', 'Georgia', 'WA', 'published'),
  ('GH', 'Ghana', 'WF', 'published'),
  ('GL', 'Greenland', 'WL', 'published'),
  ('GM', 'Gambia', 'WF', 'published'),
  ('GN', 'Guinea', 'WF', 'published'),
  ('GQ', 'Equatorial Guinea', 'WF', 'published'),
  ('GR', 'Greece', 'GR', 'published'),
  ('GT', 'Guatemala', 'WL', 'published'),
  ('GW', 'Guinea-Bissau', 'WF', 'published'),
  ('GY', 'Guyana', 'WL', 'published'),
  ('HK', 'Hong Kong', 'WA', 'published'),
  ('HN', 'Honduras', 'WL', 'published'),
  ('HR', 'Croatia', 'HR', 'published'),
  ('HT', 'Haiti', 'WL', 'published'),
  ('HU', 'Hungary', 'HU', 'published'),
  ('ID', 'Indonesia', 'ID', 'published'),
  ('IE', 'Ireland', 'IE', 'published'),
  ('IL', 'Israel', 'WM', 'published'),
  ('IN', 'India', 'IN', 'published'),
  ('IQ', 'Iraq', 'WM', 'published'),
  ('IR', 'Iran', 'WM', 'published'),
  ('IS', 'Iceland', 'WE', 'published'),
  ('IT', 'Italy', 'IT', 'published'),
  ('JM', 'Jamaica', 'WL', 'published'),
  ('JO', 'Jordan', 'WM', 'published'),
  ('JP', 'Japan', 'JP', 'published'),
  ('KE', 'Kenya', 'WF', 'published'),
  ('KG', 'Kyrgyz Republic', 'WA', 'published'),
  ('KH', 'Cambodia', 'WA', 'published'),
  ('KI', 'Kiribati', 'WA', 'published'),
  ('KM', 'Comoros', 'WF', 'published'),
  ('KN', 'St. Kitts and Nevis', 'WL', 'manual-resolution'),
  ('KP', 'North Korea', 'WA', 'published'),
  ('KR', 'South Korea', 'KR', 'published'),
  ('KW', 'Kuwait', 'WM', 'published'),
  ('KY', 'Cayman Islands', 'WL', 'published'),
  ('KZ', 'Kazakhstan', 'WA', 'published'),
  ('LA', 'Laos', 'WA', 'published'),
  ('LB', 'Lebanon', 'WM', 'published'),
  ('LC', 'St. Lucia', 'WL', 'manual-resolution'),
  ('LI', 'Liechtenstein', 'WE', 'published'),
  ('LK', 'Sri Lanka', 'WA', 'published'),
  ('LR', 'Liberia', 'WF', 'published'),
  ('LS', 'Lesotho', 'WF', 'published'),
  ('LT', 'Lithuania', 'LT', 'published'),
  ('LU', 'Luxembourg', 'LU', 'published'),
  ('LV', 'Latvia', 'LV', 'published'),
  ('LY', 'Libya', 'WF', 'published'),
  ('MA', 'Morocco', 'WF', 'published'),
  ('MC', 'Monaco', 'WE', 'published'),
  ('MD', 'Moldova', 'WE', 'published'),
  ('ME', 'Montenegro', 'WE', 'published'),
  ('MG', 'Madagascar', 'WF', 'published'),
  ('MH', 'Marshall Islands', 'WA', 'published'),
  ('MK', 'Macedonia', 'WE', 'manual-resolution'),
  ('ML', 'Mali', 'WF', 'published'),
  ('MM', 'Myanmar', 'WA', 'published'),
  ('MN', 'Mongolia', 'WA', 'published'),
  ('MO', 'Macao', 'WA', 'published'),
  ('MR', 'Mauritania', 'WF', 'published'),
  ('MS', 'Montserrat', 'WL', 'published'),
  ('MT', 'Malta', 'MT', 'published'),
  ('MU', 'Mauritius', 'WF', 'published'),
  ('MV', 'Maldives', 'WA', 'published'),
  ('MW', 'Malawi', 'WF', 'published'),
  ('MX', 'Mexico', 'MX', 'published'),
  ('MY', 'Malaysia', 'WA', 'published'),
  ('MZ', 'Mozambique', 'WF', 'published'),
  ('NA', 'Namibia', 'WF', 'published'),
  ('NC', 'New Caledonia', 'WA', 'published'),
  ('NE', 'Niger', 'WF', 'published'),
  ('NG', 'Nigeria', 'WF', 'published'),
  ('NI', 'Nicaragua', 'WL', 'published'),
  ('NL', 'Netherlands', 'NL', 'published'),
  ('NO', 'Norway', 'NO', 'published'),
  ('NP', 'Nepal', 'WA', 'published'),
  ('NR', 'Nauru', 'WA', 'published'),
  ('NZ', 'New Zealand', 'WA', 'published'),
  ('OM', 'Oman', 'WM', 'published'),
  ('PA', 'Panama', 'WL', 'published'),
  ('PE', 'Peru', 'WL', 'published'),
  ('PF', 'French Polynesia', 'WA', 'published'),
  ('PG', 'Papua New Guinea', 'WA', 'published'),
  ('PH', 'Philippines', 'WA', 'published'),
  ('PK', 'Pakistan', 'WA', 'published'),
  ('PL', 'Poland', 'PL', 'published'),
  ('PR', 'Puerto Rico', 'WL', 'published'),
  ('PS', 'Palestine', 'WM', 'manual-resolution'),
  ('PT', 'Portugal', 'PT', 'published'),
  ('PW', 'Palau', 'WA', 'published'),
  ('PY', 'Paraguay', 'WL', 'published'),
  ('QA', 'Qatar', 'WM', 'published'),
  ('RO', 'Romania', 'RO', 'published'),
  ('RS', 'Serbia', 'WE', 'published'),
  ('RU', 'Russia', 'RU', 'manual-resolution'),
  ('RW', 'Rwanda', 'WF', 'published'),
  ('SA', 'Saudi Arabia', 'WM', 'published'),
  ('SB', 'Solomon Islands', 'WA', 'published'),
  ('SC', 'Seychelles', 'WF', 'published'),
  ('SD', 'Sudan', 'WF', 'published'),
  ('SE', 'Sweden', 'SE', 'published'),
  ('SG', 'Singapore', 'WA', 'published'),
  ('SI', 'Slovenia', 'SI', 'published'),
  ('SK', 'Slovakia', 'SK', 'published'),
  ('SL', 'Sierra Leone', 'WF', 'published'),
  ('SM', 'San Marino', 'WE', 'published'),
  ('SN', 'Senegal', 'WF', 'published'),
  ('SO', 'Somalia', 'WF', 'published'),
  ('SR', 'Suriname', 'WL', 'published'),
  ('SS', 'South Sudan', 'WF', 'published'),
  ('ST', 'Sao Tome and Principe', 'WF', 'published'),
  ('SV', 'El Salvador', 'WL', 'published'),
  ('SX', 'Sint Maarten', 'WL', 'manual-resolution'),
  ('SY', 'Syria', 'WM', 'published'),
  ('SZ', 'Swaziland', 'WF', 'manual-resolution'),
  ('TC', 'Turks and Caicos Islands', 'WL', 'published'),
  ('TD', 'Chad', 'WF', 'published'),
  ('TG', 'Togo', 'WF', 'published'),
  ('TH', 'Thailand', 'WA', 'published'),
  ('TJ', 'Tajikistan', 'WA', 'published'),
  ('TL', 'Timor-Leste', 'WA', 'published'),
  ('TM', 'Turkmenistan', 'WA', 'published'),
  ('TN', 'Tunisia', 'WF', 'published'),
  ('TO', 'Tonga', 'WA', 'published'),
  ('TR', 'Turkey', 'TR', 'manual-resolution'),
  ('TT', 'Trinidad and Tobago', 'WL', 'published'),
  ('TV', 'Tuvalu', 'WA', 'published'),
  ('TW', 'Taiwan', 'TW', 'published'),
  ('TZ', 'Tanzania', 'WF', 'published'),
  ('UA', 'Ukraine', 'WE', 'published'),
  ('UG', 'Uganda', 'WF', 'published'),
  ('US', 'United States', 'US', 'published'),
  ('UY', 'Uruguay', 'WL', 'published'),
  ('UZ', 'Uzbekistan', 'WA', 'published'),
  ('VC', 'St. Vincent and the Grenadines', 'WL', 'manual-resolution'),
  ('VE', 'Venezuela', 'WL', 'published'),
  ('VG', 'British Virgin Islands', 'WL', 'published'),
  ('VN', 'Vietnam', 'WA', 'published'),
  ('VU', 'Vanuatu', 'WA', 'published'),
  ('WS', 'Samoa', 'WA', 'published'),
  ('XK', 'Kosovo', 'WE', 'manual-resolution'),
  ('YE', 'Yemen', 'WM', 'published'),
  ('ZA', 'South Africa', 'ZA', 'published'),
  ('ZM', 'Zambia', 'WF', 'published'),
  ('ZW', 'Zimbabwe', 'WF', 'published')
on conflict (iso2) do nothing;


-- ═══ 3. FINGERPRINT ══════════════════════════════════════════════════════════════════════════
--
-- Same pattern as the exiobase_sectors row seeded by 20260914: the sha256 the repo test pins, so a
-- divergence between the checked-in file and the seeded rows is detectable by comparing two
-- strings. Computed over the mapping rows only, sorted and compactly separated, metadata excluded.

insert into public.reference_data_fingerprints (dataset, fingerprint, source_file) values
  ('country_regions',
   'e83c3d0388474c36e160572e8db608094d8529e6c3bffaab3444c5229075c9a8',
   'lib/emissionFactors/countryRegions.json')
on conflict (dataset) do update
  set fingerprint = excluded.fingerprint,
      source_file = excluded.source_file,
      seeded_at   = now();

commit;


-- ── AFTER RUNNING, VERIFY (read-only, safe to paste) ─────────────────────────────────────────
--
--   -- 212 rows seeded:
--   select count(*) from public.country_regions;   -- expect 212
--
--   -- bucket sizes match the source:
--   select region_code, count(*) from public.country_regions
--    where region_code in ('WA','WL','WE','WF','WM') group by 1 order by 1;
--   -- expect WA 45, WE 14, WF 52, WL 42, WM 15
--
--   -- the 44 individually-resolved countries each have exactly one row:
--   select count(*) from (select region_code from public.country_regions
--                          group by region_code having count(*) = 1) t;   -- expect 44
--
--   -- every region_code is one the factor files actually hold:
--   select distinct region_code from public.country_regions order by 1;   -- expect 49 rows
--
--   -- the fingerprint landed:
--   select * from public.reference_data_fingerprints where dataset = 'country_regions';
