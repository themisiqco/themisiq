-- Precursor declaration status on production processes.
--
-- An empty precursor list means two different things today: the process
-- genuinely consumes no CBAM precursors, or the operator has not yet reached
-- that step. Those are different states and nothing distinguishes them.
--
-- 'declared' is deliberately NOT a stored value. Rows in cbam_precursor_inputs
-- are themselves the evidence that precursors were declared; a stored flag
-- saying so could outlive the rows it claims (enter three, delete three, flag
-- still reads 'declared'). Only the states the rows cannot express live here.
--
-- Who declared is not stored. This table carries company_id and no user_id,
-- matching every other CBAM table; audit_log is where per-action actor
-- identity belongs if it is wanted later.

alter table public.cbam_production_processes
  add column if not exists precursor_declaration        text not null default 'unknown',
  add column if not exists precursor_declaration_reason text,
  add column if not exists precursor_declaration_note   text,
  add column if not exists precursor_declared_at        timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cbam_pp_precursor_declaration_values') then
    alter table public.cbam_production_processes
      add constraint cbam_pp_precursor_declaration_values
      check (precursor_declaration in ('unknown','none'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cbam_pp_precursor_reason_values') then
    alter table public.cbam_production_processes
      add constraint cbam_pp_precursor_reason_values
      check (precursor_declaration_reason is null
             or precursor_declaration_reason in
                ('joint_production','scrap_only_charge','no_cbam_precursors','other'));
  end if;

  -- 'none' is a positive statement and must carry a reason and a timestamp.
  -- 'unknown' is the absence of a statement and must carry neither.
  if not exists (select 1 from pg_constraint where conname = 'cbam_pp_precursor_declaration_coherent') then
    alter table public.cbam_production_processes
      add constraint cbam_pp_precursor_declaration_coherent
      check (
        (precursor_declaration = 'none'
           and precursor_declaration_reason is not null
           and precursor_declared_at is not null)
        or
        (precursor_declaration = 'unknown'
           and precursor_declaration_reason is null
           and precursor_declaration_note is null
           and precursor_declared_at is null)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'cbam_pp_precursor_other_needs_note') then
    alter table public.cbam_production_processes
      add constraint cbam_pp_precursor_other_needs_note
      check (precursor_declaration_reason <> 'other'
             or (precursor_declaration_note is not null
                 and length(trim(precursor_declaration_note)) > 0));
  end if;
end $$;
