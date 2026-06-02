-- mr_industry_opportunities: table + RLS + grants + manuf seed
create table if not exists public.mr_industry_opportunities (
  industry_code         text     not null,
  opportunity_category  text     not null,
  relevance             smallint not null default 0,
  sort_order            smallint not null default 0,
  created_at            timestamptz not null default now(),
  primary key (industry_code, opportunity_category)
);
alter table public.mr_industry_opportunities enable row level security;
drop policy if exists mr_industry_opportunities_read on public.mr_industry_opportunities;
create policy mr_industry_opportunities_read on public.mr_industry_opportunities
  for select to anon, authenticated using (true);
grant select on public.mr_industry_opportunities to authenticated;
grant select on public.mr_industry_opportunities to anon;
insert into public.mr_industry_opportunities (industry_code, opportunity_category, relevance, sort_order) values
  ('manuf', 'resource_efficiency', 3, 1), ('manuf', 'energy_source', 3, 2),
  ('manuf', 'products_services', 2, 3), ('manuf', 'markets', 2, 4), ('manuf', 'resilience', 2, 5)
on conflict (industry_code, opportunity_category) do update
  set relevance = excluded.relevance, sort_order = excluded.sort_order;
