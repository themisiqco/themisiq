-- 20260717_cbam_grid_factors.sql
-- IR 2025/2621 Annex II — default electricity emission factors (tCO2e/MWh),
-- electricity CONSUMED in production (NOT Annex III imported-electricity). All-sources 5yr IEA average.
-- No mark-up (unlike goods defaults). Keyed by ISO code (matches origin_country); verbatim reg name in source_label.
create table if not exists public.cbam_grid_factors (
  country_code  text primary key,
  source_label  text not null,
  ef_co2e_mwh   numeric not null,
  basis_note    text,
  source_ref    text not null
);

insert into public.cbam_grid_factors (country_code, source_label, ef_co2e_mwh, basis_note, source_ref) values
  ('CN',    'China',                    0.605, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('TR',    'Türkiye',                  0.420, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('IN',    'India',                    0.726, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('KR',    'Korea, Republic of',       0.475, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('UA',    'Ukraine',                  0.310, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('GB',    'United Kingdom',           0.193, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('ID',    'Indonesia',                0.791, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('EG',    'Egypt',                    0.387, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('TW',    'Taiwan',                   0.561, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('JP',    'Japan',                    0.469, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('US',    'United States',            0.358, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('VN',    'Viet Nam',                 0.581, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('CA',    'Canada',                   0.119, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II'),
  ('other', 'Other countries and territories', 0.465, '5yr avg, IEA, all-sources', 'IR 2025/2621 Annex II')
on conflict (country_code) do nothing;

grant select on public.cbam_grid_factors to anon, authenticated;
alter table public.cbam_grid_factors enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cbam_grid_factors' and policyname='cbam_grid_factors_read') then
    create policy cbam_grid_factors_read on public.cbam_grid_factors for select to anon, authenticated using (true);
  end if;
end $$;
