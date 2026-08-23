-- 20260852_impact_assignment_added_state.sql
--
-- materiality_impact_assignments: two columns that assert a colleague was INVITED when all the
-- product did was ADD them to a list.
--
--     invited_at  timestamptz not null default now()
--     status      text        not null default 'invited'
--
-- ⚠️ THIRD OCCURRENCE OF ONE DEFECT, AND THE FIRST TWO ARE ALREADY WRITTEN DOWN.
-- app/api/survey-invite/route.ts's header records it twice: campaign_suppliers.invited_at is a
-- column DEFAULT, so the supplier portal shows when a supplier was ADDED and calls it "Invited";
-- materiality_survey_respondents.invited_at carries the same default, and that route overwrites it
-- after a confirmed send, which is the fix. 20260838:313 copied the column out of
-- materiality_survey_respondents and copied the defect with it. That header now names all three.
--
-- ⚠️ IT IS WORSE HERE THAN IN EITHER PREDECESSOR, because until this commit there was no send at
-- all. No impact-invite route existed; the worksheet inserted the row straight from the client. So
-- no row in any database has ever been emailed by the product, every invited_at in this table is
-- the moment somebody typed a name into a form, and every status says a colleague was invited who
-- was not. ESRS 2 SBM-2 asks for field dates, and "when I typed their name in" is not one.
--
-- ⚠️ WHY THE CHECK GAINS A STATE RATHER THAN THE ROUTE OWNING THE TRANSITION. Those are not
-- alternatives. A route cannot own a transition OUT of a state the table never lets the row occupy:
-- with `default 'invited'`, the row is already 'invited' at INSERT, and a route that later sets it
-- to 'invited' changes nothing. The row has to be able to start somewhere true first. Once 'added'
-- exists, the route owns exactly one transition — 'added' -> 'invited', stamping invited_at in the
-- same UPDATE, only after a confirmed send.
--
-- The considered alternative, recorded because it is a reasonable reading and was rejected on a
-- specific ground rather than by preference: DERIVE IT — leave the CHECK alone and treat
-- `invited_at is null` as "added but not invited". One fact in one column, no redundant encoding to
-- drift. Rejected because `status` would still STORE the string 'invited' about a colleague nobody
-- emailed, and a stored value that is a claim which is not true is the defect this module keeps
-- closing. The sibling table is the demonstration: the same "nothing reads the literal" argument
-- was available for materiality_survey_respondents once, and today
-- app/dashboard/materiality/survey/[id]/page.tsx reads `status === 'invited'` in five places, one
-- of which decides who a bulk send targets. Redundancy is not the risk when ONE update writes both
-- columns, which is what the route does.
--
-- Also rejected: make add-and-send a single action, so 'invited' at INSERT is true. That
-- contradicts a documented product decision — app/dashboard/materiality/worksheet/[id]/page.tsx
-- deliberately lets a preparer add colleagues and divide the sub-topics BEFORE any invitation
-- exists, "the part worth doing first, and what the invitation will carry".
--
-- ⚠️ NOTHING READS WHAT THIS CHANGES, WHICH IS ALSO WHY IT COULD LIE UNDETECTED. Every reader of
-- this column tests 'revoked', 'expired' or 'submitted'; not one distinguishes 'invited', so
-- 'added' passes all of them unchanged:
--     worksheet/page.tsx:90-91                    status !== 'revoked' / === 'revoked'
--     worksheet/[id]/page.tsx:314-315             status !== 'revoked' / === 'revoked'
--     worksheet/[id]/determinations/page.tsx:672  status === 'revoked'
--     20260840:158  impact_get gate              status not in ('revoked','expired')
--     20260840:165  impact_get read-only         status = 'submitted'
--     20260840:491  impact_submit writes          status := 'submitted'
--     20260839:390, 20260841:270                  existence only; status not read
-- invited_at has exactly one reader: worksheet/[id]/page.tsx:244 uses it as `.order('invited_at')`.
-- It is not rendered anywhere, so the untruth is latent rather than on screen. That ordering moves
-- to created_at in the same commit — which is what it always meant.
--
-- ⚠️ WHY NOW AND NOT WITH A LATER INVITE ROUTE. The backfill below needs no judgement TODAY: with
-- no send path, every existing row is provably un-invited. The day sends start, telling a sent row
-- from an unsent one becomes guesswork, because the only evidence is the column that says now() for
-- both. This migration is cheap exactly once.
--
-- ⚠️ IF NO INVITE ROUTE EVER SHIPPED, 'added' would become the permanent state and 'invited' would
-- join 'in_progress' as a state nothing writes (20260840:581 is a hand-run test comment, not a
-- code path). That is still strictly better: permanently coarse and true beats permanently precise
-- and false.
--
-- No GRANT is issued here. This alters an existing table; 20260838:576 already grants
-- authenticated select/insert/update and :596 grants service_role all.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The CHECK must admit 'added' before any row can hold it or any default name it
-- ─────────────────────────────────────────────────────────────────────────────
-- The constraint name is Postgres's own, generated for the inline column CHECK in 20260838:305.
-- `if exists` rather than a bare drop so a database where it was recreated by hand under another
-- name does not abort the whole migration — the ADD below is what actually has to succeed.
alter table public.materiality_impact_assignments
  drop constraint if exists materiality_impact_assignments_status_check;

alter table public.materiality_impact_assignments
  add constraint materiality_impact_assignments_status_check
  check (status in ('added', 'invited', 'in_progress', 'submitted', 'revoked', 'expired'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ASSERTED, NOT ASSUMED, before anything is discarded
-- ─────────────────────────────────────────────────────────────────────────────
-- now() is transaction-start, so invited_at and created_at were set from the SAME value on every
-- INSERT and step 4 discards nothing. If any row disagrees, it carries a timestamp from somewhere
-- this migration does not know about — roll the whole thing back rather than destroy it.
do $$
declare n int;
begin
  select count(*) into n
    from public.materiality_impact_assignments
   where invited_at is distinct from created_at;
  if n > 0 then
    raise exception
      'ROLLING BACK: % row(s) have invited_at <> created_at, so invited_at is not simply a copy of '
      'the creation time on this database. Establish where those stamps came from before nulling '
      'the column. Nothing has been changed.', n;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill, then re-point the default
-- ─────────────────────────────────────────────────────────────────────────────
-- Provably safe only because no send path existed: a row reading 'invited' cannot have been
-- emailed. Rows already at 'in_progress', 'submitted', 'revoked' or 'expired' are left alone —
-- their status is about the token's lifecycle and was written by something that meant it.
update public.materiality_impact_assignments
   set status = 'added'
 where status = 'invited';

alter table public.materiality_impact_assignments
  alter column status set default 'added';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. invited_at stops being a row-creation timestamp
-- ─────────────────────────────────────────────────────────────────────────────
-- NULL until a confirmed send stamps it. created_at is the creation timestamp and always was, so
-- ordering and "when was this person added" lose nothing.
alter table public.materiality_impact_assignments
  alter column invited_at drop default,
  alter column invited_at drop not null;

update public.materiality_impact_assignments
   set invited_at = null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. The two columns cannot come to disagree
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ONE DIRECTION ONLY, DELIBERATELY. It says an 'added' row has no invitation date; it does NOT
-- say every row with a date is 'invited', because a row that WAS invited and is now 'submitted',
-- 'revoked' or 'expired' keeps its stamp and must. The one thing forbidden is the contradiction
-- this migration exists to remove — and, as a side effect it is right to have, moving a row back to
-- 'added' after a real send, which would destroy the record of that send.
alter table public.materiality_impact_assignments
  add constraint materiality_impact_assignments_added_has_no_invite
  check (status <> 'added' or invited_at is null);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Say it on the columns, where the next reader is
-- ─────────────────────────────────────────────────────────────────────────────
comment on column public.materiality_impact_assignments.invited_at is
  'When the invitation was actually emailed, or NULL if it has not been. NOT a row-creation '
  'timestamp — created_at is that. A DEFAULT now() here is the campaign_suppliers defect recorded '
  'in app/api/survey-invite/route.ts''s header; this table was its third occurrence and 20260852 '
  'removed it. Only app/api/impact-invite/route.ts writes this, and only after Resend has confirmed '
  'the send.';

comment on column public.materiality_impact_assignments.status is
  '''added'' is the truthful initial state: the colleague is on the list and has not been emailed. '
  'Only a route that has confirmed a send may move a row to ''invited'', and it stamps invited_at in '
  'the same UPDATE — materiality_impact_assignments_added_has_no_invite holds the two together. '
  '''in_progress'' is still written by nothing (20260840:581 is a hand-run test, not a code path).';

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand verification. Run after applying.
-- ─────────────────────────────────────────────────────────────────────────────
-- 1) No row still claims an invitation it never received:
--      select status, count(*), count(invited_at) as with_stamp
--        from public.materiality_impact_assignments group by status order by status;
--      -- expect: every 'added' row has with_stamp = 0
--
-- 2) The defaults are the new ones:
--      select column_name, column_default, is_nullable
--        from information_schema.columns
--       where table_name = 'materiality_impact_assignments'
--         and column_name in ('status', 'invited_at', 'created_at');
--      -- expect: status -> 'added'::text, invited_at -> null / YES, created_at -> now() / NO
--
-- 3) Both CHECKs are present and 'added' is admitted:
--      select conname, pg_get_constraintdef(oid)
--        from pg_constraint
--       where conrelid = 'public.materiality_impact_assignments'::regclass and contype = 'c';
--
-- 4) The contradiction is refused (expect ERROR, then roll back):
--      begin;
--      update public.materiality_impact_assignments set status = 'added', invited_at = now()
--       where id = (select id from public.materiality_impact_assignments limit 1);
--      rollback;
--
-- 5) A new row starts truthful:
--      -- add a colleague through the worksheet, then:
--      select status, invited_at, created_at from public.materiality_impact_assignments
--       order by created_at desc limit 1;
--      -- expect: added | null | <now>
