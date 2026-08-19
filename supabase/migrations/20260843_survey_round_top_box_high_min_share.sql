alter table public.materiality_survey_rounds
  add column top_box_high_min_share numeric not null default 0.50;

alter table public.materiality_survey_rounds
  add constraint materiality_survey_rounds_top_box_high_min_share_range
  check (top_box_high_min_share >= 0::numeric and top_box_high_min_share <= 1::numeric);

create or replace function public.materiality_survey_round_snapshot_thresholds()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_missing text;
begin
  select string_agg(k, ', ' order by k) into v_missing
    from unnest(array['polarised_extreme_min_n', 'polarised_middle_max_share',
                      'top_box_gap_margin', 'free_text_group_floor',
                      'top_box_high_min_share']) k
   where not exists (select 1 from public.mr_survey_thresholds t where t.key = k);

  if v_missing is not null then
    raise exception
      'Cannot create a survey round: mr_survey_thresholds is missing %. The round snapshots its '
      'disclosed constants at creation, and a round with no snapshot would silently take whatever '
      'the table held on the day someone next opened its register (spec v9 §6.2.6, §10). The keys '
      'are seeded by the migrations in supabase/migrations/ that insert into mr_survey_thresholds.',
      v_missing;
  end if;

  new.polarised_extreme_min_n := coalesce(new.polarised_extreme_min_n,
    (select t.value::smallint from public.mr_survey_thresholds t where t.key = 'polarised_extreme_min_n'));
  new.polarised_middle_max_share := coalesce(new.polarised_middle_max_share,
    (select t.value from public.mr_survey_thresholds t where t.key = 'polarised_middle_max_share'));
  new.top_box_gap_margin := coalesce(new.top_box_gap_margin,
    (select t.value from public.mr_survey_thresholds t where t.key = 'top_box_gap_margin'));
  new.free_text_group_floor := coalesce(new.free_text_group_floor,
    (select t.value::smallint from public.mr_survey_thresholds t where t.key = 'free_text_group_floor'));
  new.top_box_high_min_share := coalesce(new.top_box_high_min_share,
    (select t.value from public.mr_survey_thresholds t where t.key = 'top_box_high_min_share'));

  return new;
end $function$;

alter table public.materiality_survey_rounds
  alter column top_box_high_min_share drop default;

update public.mr_survey_thresholds
set definition = definition || ' This row is the current value. Each survey round snapshots it at creation into materiality_survey_rounds.top_box_high_min_share, and the round''s snapshotted column is what produces that round''s figures, so a later change here does not alter a round already run.'
where key = 'top_box_high_min_share';
