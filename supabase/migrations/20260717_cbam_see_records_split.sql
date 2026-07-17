-- 20260717_cbam_see_records_split.sql
-- Preserve the direct/indirect SEE split into storage. Annex IV reports direct (item 5) and
-- indirect (item 6) as separate assured quantities, so the persisted record carries them separately.
-- see_direct / see_indirect are the source of truth; see_total remains as a derived convenience
-- (route writes see_total = see_direct + see_indirect). No default on the split columns — the route
-- must write explicit values (fail-loud: a missing computation cannot hide behind a silent zero).
alter table public.cbam_see_records
  add column if not exists see_direct   numeric not null default 0,
  add column if not exists see_indirect numeric not null default 0;

alter table public.cbam_see_records
  alter column see_direct   drop default,
  alter column see_indirect drop default;
