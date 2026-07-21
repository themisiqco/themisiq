-- 20260718_cbam_process_route_fk.sql
-- Adds a composite foreign key so a process's route_code must be a route that actually exists
-- FOR ITS OWN category_code.
--
-- Closes the integrity gap noted while writing 20260718_cbam_route_split_eaf.sql:
-- cbam_production_processes.route_code was bare `text` with no referential integrity at all, so
-- two distinct classes of bad row were accepted silently.
--   * A DELETED route. The eaf split removed 'eaf' from cbam_production_routes, but nothing
--     stopped a process from continuing to carry 'eaf' — it would survive as an orphan pointing
--     at a route that no longer exists, and no query would reject it.
--   * A NONSENSICAL PAIRING. Because the old column constrained nothing, crude_steel +
--     'direct_reduction' (a DRI route) was as acceptable to the database as crude_steel + 'bof'.
--     This is why the FK must be COMPOSITE: a single-column FK on route_code alone would accept
--     any route that exists anywhere in the table, and would let exactly this pairing through.
--     The target (category_code, route_code) is already the primary key of cbam_production_routes,
--     so no additional unique constraint is needed.
--
-- MATCH SIMPLE is the default and is what this constraint uses: when route_code IS NULL the
-- constraint is NOT enforced and the row is accepted. That is INTENTIONAL — route_code is
-- nullable because non-steel CBAM goods may carry no declared production route, and forcing a
-- route on them would be wrong. The FK therefore constrains only rows that actually declare one.
-- Do not "tighten" this to MATCH FULL without first deciding what a routeless good should do.
--
-- Adding the constraint VALIDATES EXISTING ROWS: if any current cbam_production_processes row
-- carries a (category_code, route_code) pair not present in cbam_production_routes, this
-- statement fails and the offending rows must be corrected first. Note also that
-- ALTER TABLE ... ADD CONSTRAINT has no IF NOT EXISTS, so the statement is guarded on
-- pg_constraint below — matching 20260717_cbam_customer_leaves.sql — making this file re-runnable.
--
-- No claim is made here about deployment state.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_pp_category_route_fk'
  ) then
    alter table public.cbam_production_processes
      add constraint cbam_pp_category_route_fk
      foreign key (category_code, route_code)
      references public.cbam_production_routes (category_code, route_code);
  end if;
end $$;
