-- mr_industry_transition_drivers: table + RLS + grants + all 52 values (13 sectors × 4 drivers)
-- Weight scale 0-3; engine maps weight/2. Drivers: policy, technology, market, reputation.
create table if not exists public.mr_industry_transition_drivers (
  industry_code      text     not null,
  transition_driver  text     not null,
  weight             smallint not null default 0,
  sort_order         smallint not null default 0,
  created_at         timestamptz not null default now(),
  primary key (industry_code, transition_driver)
);
alter table public.mr_industry_transition_drivers enable row level security;
drop policy if exists mr_industry_transition_drivers_read on public.mr_industry_transition_drivers;
create policy mr_industry_transition_drivers_read on public.mr_industry_transition_drivers
  for select to anon, authenticated using (true);
grant select on public.mr_industry_transition_drivers to authenticated;
grant select on public.mr_industgr_transition_drivers to anon;
insert into public.mr_indinsert into public.mr_indinsert into public.mr_indinsert into public.mr_indinsert into public.mry'insert into public.mr_indinsert into public.mr_indinsert into public.mr_indinsert into pub3, 3), ('energy',       'reputation', 2, 4),
  ('manuf',        'poli  ('manuf',        'poli  ('manuf',   gy', 3, 2), ('manuf',        'market', 2, 3), ('manuf',        'reputation', 1, 4),
  ('extract',      'policy', 3, 1), ('extract',      'technology', 2, 2), ('extract',      'market', 3, 3), ('extract',      'reputation', 2, 4),
  ('transport',    'policy', 3, 1), ('transport',    'technology', 3, 2), ('transport',    'market', 2, 3), ('transport',    'reputation', 1, 4),
  ('construction', 'policy', 3, 1), ('construction', 'technology', 2, 2), ('construction', 'market', 2, 3), ('construction', 'reputation', 1, 4),
  ('agri',         'policy', 2, 1), ('agri',         'technology', 2, 2), ('agri',         'market', 3, 3), ('agri',         'reputation', 2, 4),
  ('realestate',   'policy', 3, 1), ('realestate',   'technology', 2, 2), ('realestate',   'market', 3, 3), ('realestate',   'reputation', 1, 4),
  ('retail',       'policy', 2, 1), ('retail',       'technology', 1, 2), ('retail',       'market', 3, 3), ('retail',       'reputation', 3, 4),
  ('finance',      'policy', 2, 1), ('finance',      'technology', 1, 2), ('finance',      'market', 2, 3), ('finance',      'reputation', 2, 4),
  ('tech',         'policy', 1, 1), ('tech',         'technology', 1, 2), ('tech',         'market', 2, 3), ('tech',         'reputation', 2, 4),
  ('health',       'policy', 1, 1), ('health',       'technology', 1, 2), ('health',       'market', 1, 3), ('health',       'reputation', 1, 4),
  ('profservices', 'policy', 1, 1), ('profservices', 'technology', 1, 2), ('profservices', 'market', 2, 3), ('profservices', 'reputation', 1, 4),
                                                                                r',        'market', 1, 3), ('other',        'reputation', 1, 4)
on conflict (industry_code, transition_driver) do update
  set weight = excluded.weight, sort_order = excluded.sort_order;
