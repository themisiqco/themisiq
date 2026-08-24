-- 20260840_impact_token_rpcs.sql
--
-- The contributor's token path: three RPCs and one shared gate. This is what makes the worksheet's
-- contributor form possible, and it is where the evidence firewall lives.
--
-- ⚠️ RUN AFTER 20260839.
--
-- ⚠️ impact_save_determination (THE 10-ARGUMENT OVERLOAD) IS SUPERSEDED BY 20260854.
-- What is installed in the database is 20260854's copy, not the body below. The two differ by ONE
-- LINE: the ON CONFLICT target names four columns, because 20260854 added `axis` to
-- materiality_impact_determinations and made the primary key
-- (assessment_id, subtopic_code, axis, direction).
-- EDITING THE BODY BELOW CHANGES NOTHING. A CREATE OR REPLACE from this file would in fact
-- REGRESS the database — reinstalling the three-column target, which PL/pgSQL accepts at CREATE
-- time and which then raises SQLSTATE 42P10 at the first call. Edit 20260854, or supersede it in
-- turn and record that here.
-- (This overload has no caller: the client sends p_abstained_dimensions and p_rationale and so
-- resolves to 20260841's 12-argument version. It is kept current anyway — an installed, callable
-- function that raises 42P10 is a trap for the next caller, not dead weight.)
--
--
-- =====================================================================
-- ⚠️ THE PROJECTION IS THE FIREWALL, NOT THE PAGE
-- =====================================================================
-- "Contributors do not see the survey evidence" is a decision that has to be enforced somewhere.
-- Enforcing it in the page — by that page simply not rendering survey data — is one prop, one
-- refactor or one helpful colleague away from failing, and the failure is silent: nothing goes red
-- when a component starts receiving a field it should never have had.
--
-- So impact_get RETURNS NOTHING DERIVED FROM SURVEY RESPONSES. Not a counter, not a distribution,
-- not a top-box, not free text, not an aggregate, not a respondent count, and nothing at all from
-- materiality_survey_responses / _respondents / _rounds / survey_aggregate. A page cannot leak a
-- field that is not in the payload.
--
-- ⚠️ EVERY KEY IS WHITELISTED BY HAND. There is no to_jsonb() of any table anywhere in this file,
-- and there must never be. to_jsonb(t) returns whatever the table happens to hold TODAY, so it is
-- not a projection at all — it is a promise to leak the next column anyone adds. The next column
-- added to materiality_impact_assignments could be an internal note about the contributor; the next
-- added to an assignment_subtopics row could carry the round's own findings. A hand-written
-- jsonb_build_object breaks visibly when the shape changes, which is the behaviour worth having.
--
-- ONE APPARENT EXCEPTION, WHICH IS NOT ONE. short_name on an assignment_subtopics row was SNAPSHOTTED
-- from materiality_survey_questions at assignment time (20260838). It is display copy — the plain
-- name of a sub-topic — and carries no response data. It is read from the SNAPSHOT and the survey
-- tables are never joined, which serves the firewall and the snapshot discipline at once: a later
-- re-scope must not change what this contributor was asked to determine.
--
-- ⚠️ question_framing IS DELIBERATELY WITHHELD, and this is a finding rather than an omission.
-- mr_esrs_subtopic_display.question_framing holds the survey's second-person framing — "in your own
-- workforce" / "in your organisation's workforce" (20260828) — written to tell a RESPONDENT whose
-- workplace is meant. A worksheet contributor is not answering about their own workplace; they are
-- determining the undertaking's impact on other people. The same words would be addressed to a
-- different speaker about a different thing. The worksheet will need its own framing for the S1/S2
-- pair, and inheriting the survey's would have quietly put the wrong question in front of an HR
-- director. Recorded here so the gap is designed rather than discovered.
--
--
-- =====================================================================
-- ⚠️ NO override_reason PARAMETER. ANYWHERE. NOT EVER.
-- =====================================================================
-- 20260839's lock makes a submitted delegated determination immutable except through an audited
-- override that REQUIRES a written reason. Its header says the rule deliberately keys on WHAT
-- CHANGED rather than on who is updating, because both the lead and a contributor reach these rows
-- as the row's owner and auth.role() inside a definer function is a fragile thing to hang a
-- compliance rule on.
--
-- THE THING THAT MAKES THAT WORK IS THE ABSENCE OF THIS PARAMETER. A contributor RPC that cannot
-- supply an override reason cannot satisfy the lock, so a post-submit contributor write fails
-- closed — automatically, with no role check and no extra rule to keep in sync.
--
-- ⚠️ SO DO NOT ADD ONE, and do not add a p_status, a p_force, or any parameter that would let this
-- path write a submitted row. It will look like a convenience — "let them fix a typo after
-- submitting" — and it would silently convert the lock from an enforced rule into a naming
-- convention. If contributors need to amend after submitting, that is a REOPEN decision for the
-- lead to take on the assignment, with its own audit trail, not a parameter here.
--
--
-- =====================================================================
-- ⚠️ ONE REFUSAL FOR FOUR STATES, AND A FIFTH THAT IS DIFFERENT IN KIND
-- =====================================================================
-- Unknown token, revoked, expired, and an assignment whose access was withdrawn all share ONE
-- message and ONE errcode (no_data_found), so a caller holding a guessed uuid learns only that it
-- does not admit them. That is 20260820's property and it is preserved exactly.
--
-- 'Your part is already submitted' is distinguishable, on 20260836's argument unchanged:
--   * it is reachable ONLY by someone already holding a live token — the lookup runs first and
--     returns the opaque refusal before submission is ever considered, so a guessed uuid still
--     learns nothing;
--   * it tells the holder nothing they could not observe by other means. They were invited, they had
--     a working link, and they pressed Submit;
--   * and it is the thing they most need to hear. Someone returning to check their work otherwise
--     sees "this link is not valid", which reads as "your link was never any good", is false, and
--     leaves them believing their twelve determinations went nowhere.
--
-- ⚠️ ORDER IS LOAD-BEARING, exactly as in 20260836. Token conditions first, submission second.
-- Reverse them and a guessed uuid on a submitted assignment would reveal that the assignment exists.
--
--
-- =====================================================================
-- ⚠️ ¶41's RULES REFUSE. THEY DO NOT SILENTLY DISCARD.
-- =====================================================================
-- A positive impact cannot carry irremediability; an actual impact cannot carry likelihood.
-- 20260838's CHECK constraints make both unstorable, and impact_save_determination does NOT strip
-- the offending value to make the insert succeed.
--
-- Dropping it would be the worse failure by some distance: the contributor supplied a judgement, the
-- form appeared to accept it, and the value is gone with nothing anywhere recording that it was
-- discarded. That is the concierge's silent-empty-result defect wearing different clothes.
--
-- The checks are written out here FOR THE MESSAGE, on 20260820's precedent — the constraint remains
-- the guarantee, but a raw check_violation reaches the client as generic failure text, and these
-- two states have specific, teachable causes. The constraint is what makes the rule true; this is
-- what makes it legible.
--
--
-- =====================================================================
-- user_id IS SET EXPLICITLY ON EVERY WRITE, AND THAT IS NOT DEFENSIVE STYLE
-- =====================================================================
-- materiality_impact_determinations.user_id defaults to auth.uid(). A contributor calls these
-- functions as `anon` with no JWT subject, so auth.uid() is NULL and the default would violate NOT
-- NULL — the insert would fail on the wrong thing, naming a column instead of a cause. Every write
-- below takes user_id from the ASSESSMENT, which the token already resolved.
--
--
-- DEPLOY: Lisa hand-runs this after 20260839. Re-runnable (CREATE OR REPLACE throughout). The
-- tables stay ungranted to anon; these functions are the only path.

begin;

-- =====================================================================
-- The shared gate
-- =====================================================================
create or replace function public.materiality_impact_resolve_token(
  p_token              uuid,
  out o_assignment_id  uuid,
  out o_assessment_id  uuid,
  out o_user_id        uuid,
  out o_company_name   text,
  out o_standard_version text,
  out o_contributor_name text,
  out o_contributor_role text,
  out o_expires_at     timestamptz)
returns record
language plpgsql
-- SECURITY INVOKER, deliberately, and for the same three-fold reason as
-- materiality_survey_resolve_token: it is only ever called from inside a DEFINER function where the
-- current user is already the owner, it is revoked from PUBLIC, and if it were somehow granted to
-- anon it would run under RLS, match no row, and return the same opaque refusal as a bad token.
-- Three independent reasons, so forgetting one is not a leak.
--
-- ⚠️ IT RETURNS NAMED OUT PARAMETERS AND NOT THE ROW TYPE. `returns
-- public.materiality_impact_assignments` would have been the obvious way to write it and would hand
-- back the token itself, contributor_email, revoked_at and every column added later.
set search_path = public
as $$
declare
  v_status text;
begin
  -- ⚠️ THE FOUR OPAQUE CONDITIONS, IN ONE CLAUSE. Submission is NOT among them — it is checked
  -- after, so that a guessed uuid never reaches the distinguishable refusal.
  select g.id, g.assessment_id, g.user_id, a.company_name, a.standard_version,
         g.contributor_name, g.contributor_role, g.expires_at, g.status
    into o_assignment_id, o_assessment_id, o_user_id, o_company_name, o_standard_version,
         o_contributor_name, o_contributor_role, o_expires_at, v_status
    from public.materiality_impact_assignments g
    join public.materiality_assessments a
      on a.id = g.assessment_id
   where g.token = p_token
     and g.revoked_at is null
     and g.expires_at > now()
     and g.status not in ('revoked', 'expired');

  if o_assignment_id is null then
    raise exception 'invalid token' using errcode = 'no_data_found';
  end if;

  -- ⚠️ REACHABLE ONLY BY A LIVE TOKEN HOLDER. See the header.
  if v_status = 'submitted' then
    raise exception
      'Your part of this assessment has been submitted. Your determinations were received and are '
      'recorded against your name.'
      using errcode = 'PT410';
  end if;
end $$;

comment on function public.materiality_impact_resolve_token(uuid) is
  'The shared token gate for impact_get / impact_save_determination / impact_submit. Refuses an unknown, revoked or expired token with ONE message and ONE errcode (no_data_found) so a caller cannot distinguish them, and refuses an ALREADY SUBMITTED assignment with a distinguishable PT410 that is reachable only by someone already holding a live token. Order is load-bearing: token conditions first, submission second — reversed, a guessed uuid would reveal that the assignment exists. Returns named OUT parameters and deliberately NOT the row type, which would carry the token itself and contributor_email. Revoked from PUBLIC and SECURITY INVOKER.';


-- The per-determination projection, factored out so the two directions cannot drift apart. Returns
-- null where nothing has been saved — an absence, distinguishable from a row of nulls, which under
-- §6.1 would mean something quite different.
create or replace function public.impact_determination_json(
  p_assessment_id uuid, p_subtopic_code text, p_direction text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nature',               d.nature,
           'scale',                d.scale,
           'scope',                d.scope,
           'irremediability',      d.irremediability,
           'likelihood',           d.likelihood,
           -- ⚠️ to_jsonb ON A text[] COLUMN, not on a table row. The header forbids
           -- to_jsonb(t) because it projects whatever columns exist today; converting
           -- one named array column to a jsonb array is the opposite — the field is
           -- chosen by hand and only its element type is inferred.
           'value_chain_position', to_jsonb(d.value_chain_position),
           'time_horizon',         d.time_horizon,
           'rationale',            d.rationale,
           'status',               d.status)
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction;
$$;

-- =====================================================================
-- impact_get
-- =====================================================================
create or replace function public.impact_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_assessment_id uuid;
  v_user_id       uuid;
  v_company       text;
  v_version       text;
  v_name          text;
  v_role          text;
  v_expires       timestamptz;
  v jsonb;
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  select jsonb_build_object(
    -- ⚠️ WHITELISTED, KEY BY KEY. No to_jsonb of any table — see the header.
    'contributor', jsonb_build_object(
      'name',       v_name,
      'role',       v_role,
      'expires_at', v_expires),

    'assessment', jsonb_build_object(
      'company_name',     v_company,
      'standard_version', v_version),

    -- ⚠️ NOTHING BELOW COMES FROM materiality_survey_*. short_name is the snapshot taken at
    -- assignment time; context is reference copy from mr_esrs_subtopic_display; topic_label is the
    -- versioned overlay. None of them is derived from a single response.
    'subtopics', coalesce((
      select jsonb_agg(x.payload order by x.topic_sort, x.subtopic_code)
        from (
          select s.subtopic_code,
                 st.topic_code,
                 t.sort_order as topic_sort,
                 jsonb_build_object(
                   'subtopic_code', s.subtopic_code,
                   'topic_code',    st.topic_code,
                   -- ⚠️ NEVER mr_esrs_topics.label DIRECTLY (CLAUDE.md): it is the pre-versioning
                   -- default. The versioned name overlays it, per topic, falling back only where a
                   -- version has no row.
                   --
                   -- ⚠️ AND UNDER ESRS (2026) S1 AND S2 RESOLVE TO THE SAME LABEL, byte-identical by
                   -- design. Disambiguating is the CALLER's job and must be done generically — if a
                   -- later version splits the title the collision disappears on its own. Doing it
                   -- here would bake a 2026 quirk into the payload.
                   'topic_label',   coalesce(tl.label, t.label),
                   -- The snapshot first; the standard's own label only where the snapshot is null.
                   'short_name',    coalesce(s.short_name, d.short_name, st.label),
                   'context',       d.context,
                   'determinations', jsonb_build_object(
                     'negative', public.impact_determination_json(
                                   v_assessment_id, s.subtopic_code, 'negative'),
                     'positive', public.impact_determination_json(
                                   v_assessment_id, s.subtopic_code, 'positive'))
                 ) as payload
            from public.materiality_impact_assignment_subtopics s
            join public.mr_esrs_subtopics st
              on st.code = s.subtopic_code
             and st.standard_version = s.standard_version
            join public.mr_esrs_topics t
              on t.code = st.topic_code
            left join public.mr_esrs_topic_labels tl
              on tl.topic_code = st.topic_code
             and tl.standard_version = s.standard_version
            left join public.mr_esrs_subtopic_display d
              on d.subtopic_code = s.subtopic_code
             and d.standard_version = s.standard_version
           -- ⚠️ THE CONTRIBUTOR'S OWN SUB-TOPICS AND NO OTHERS. Scoped by assignment_id, not by
           -- assessment: an assessment's other sub-topics are somebody else's work.
           where s.assignment_id = v_assignment_id
        ) x), '[]'::jsonb)
  ) into v;

  return v;
end $$;

comment on function public.impact_get(uuid) is
  'What one contributor sees: their assignment, the sub-topics assigned to THEM, and their own saved values. ⚠️ THE PROJECTION IS THE EVIDENCE FIREWALL — it contains nothing derived from survey responses, and every key is whitelisted by hand rather than produced by to_jsonb(), which would leak whatever column is added next. short_name is the snapshot taken at assignment time and the survey tables are never joined. question_framing is deliberately withheld: it is the survey''s second-person framing addressed to a respondent about their own workplace, and a worksheet contributor is a different speaker determining a different thing.';
comment on function public.impact_determination_json(uuid, text, text) is
  'The per-determination projection used by impact_get, factored out so the negative and positive branches cannot drift. Returns NULL where nothing has been saved, which is distinguishable from a saved row of nulls — under spec §6.1 those mean different things. Internal: revoked from PUBLIC.';


-- =====================================================================
-- impact_save_determination
-- =====================================================================
-- ⚠️ NO p_override_reason. NO p_status. NO p_force. See the header — their absence is what makes
-- 20260839's lock fail closed on this path.
create or replace function public.impact_save_determination(
  p_token                uuid,
  p_subtopic_code        text,
  p_direction            text,
  p_nature               text,
  p_scale                smallint,
  p_scope                smallint,
  p_irremediability      smallint,
  p_likelihood           smallint,
  p_value_chain_position text[],
  p_time_horizon         text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_assessment_id uuid;
  v_user_id       uuid;
  v_company       text;
  v_version       text;
  v_name          text;
  v_role          text;
  v_expires       timestamptz;
  v_existing      text;
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  if p_direction is null or p_direction not in ('negative', 'positive') then
    raise exception
      'direction must be negative or positive. Every sub-topic is determined both ways and the two '
      'are never netted against each other (ESRS 1 para 44).';
  end if;

  if p_nature is not null and p_nature not in ('actual', 'potential') then
    raise exception 'nature must be actual or potential, or null while the answer is unfinished.';
  end if;

  -- §5.3: four points on every dimension. Null is "not enough visibility" (§6.1) and is allowed;
  -- anything outside 1-4 is a bug, and clamping it would fabricate a compliance figure.
  if p_scale           is not null and p_scale           not between 1 and 4
  or p_scope           is not null and p_scope           not between 1 and 4
  or p_irremediability is not null and p_irremediability not between 1 and 4
  or p_likelihood      is not null and p_likelihood      not between 1 and 4 then
    raise exception
      'Severity dimensions are scored 1-4 (spec §5.3), or left null for "not enough visibility to '
      'assess" (§6.1). A value outside that range cannot be stored.';
  end if;

  -- ⚠️ ¶41, REFUSED RATHER THAN SILENTLY DROPPED. The constraints are the guarantee; these two
  -- raises exist so the refusal arrives as a sentence instead of a check_violation. See the header.
  if p_direction = 'positive' and p_irremediability is not null then
    raise exception
      'A positive impact carries no irremediability — there is nothing to remediate (ESRS 1 para '
      '41). Your answer was not saved rather than being quietly dropped; remove it and save again.';
  end if;

  if p_nature = 'actual' and p_likelihood is not null then
    raise exception
      'An impact that is already happening carries no likelihood (ESRS 1 para 41). Applying one to '
      'an actual impact understates its severity. Your answer was not saved rather than being '
      'quietly dropped; remove it and save again.';
  end if;

  -- The sub-topic must be assigned to THIS contributor. Not to this assessment — to this assignment.
  if not exists (
    select 1 from public.materiality_impact_assignment_subtopics s
     where s.assignment_id = v_assignment_id
       and s.subtopic_code = p_subtopic_code) then
    raise exception
      'That sub-topic is not part of your assignment. Reload the page — it may have been reassigned.'
      using errcode = 'no_data_found';
  end if;

  -- A submitted determination is not writable from here at all. resolve_token already refuses a
  -- submitted ASSIGNMENT, so this covers the narrower case of a single row left submitted by some
  -- other path, and it refuses with a sentence rather than leaving 20260839's lock to raise.
  select d.status into v_existing
    from public.materiality_impact_determinations d
   where d.assessment_id = v_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction;

  if v_existing = 'submitted' then
    raise exception
      'This determination has already been submitted and cannot be changed here.'
      using errcode = 'PT410';
  end if;

  insert into public.materiality_impact_determinations (
    assessment_id, user_id, subtopic_code, standard_version, direction,
    nature, scale, scope, irremediability, likelihood,
    value_chain_position, time_horizon,
    -- ⚠️ ALWAYS FALSE ON THIS PATH, AND THE CONSTRAINT AGREES. Contributors do not see the survey
    -- evidence, so a determination made here cannot claim it was in view.
    evidence_in_view, assignment_id, status)
  values (
    v_assessment_id, v_user_id, p_subtopic_code, v_version, p_direction,
    p_nature, p_scale, p_scope, p_irremediability, p_likelihood,
    coalesce(p_value_chain_position, '{}'::text[]), p_time_horizon,
    false, v_assignment_id, 'draft')
  on conflict (assessment_id, subtopic_code, direction) do update
     set nature               = excluded.nature,
         scale                = excluded.scale,
         scope                = excluded.scope,
         irremediability      = excluded.irremediability,
         likelihood           = excluded.likelihood,
         value_chain_position = excluded.value_chain_position,
         time_horizon         = excluded.time_horizon,
         assignment_id        = excluded.assignment_id,
         evidence_in_view     = false;
end $$;

comment on function public.impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text) is
  'Saves ONE sub-topic in ONE direction as a draft. ⚠️ HAS NO override_reason PARAMETER, AND MUST NEVER GAIN ONE — its absence is what makes 20260839''s lock fail closed on a post-submit contributor write, with no role introspection anywhere. Refuses rather than silently dropping a value the ESRS 1 para 41 constraints forbid: an irremediability on a positive impact and a likelihood on an actual one are both rejected with a sentence, because a form that appears to accept a judgement and discards it is worse than one that says no. evidence_in_view is written false unconditionally.';


-- =====================================================================
-- impact_submit
-- =====================================================================
create or replace function public.impact_submit(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_assessment_id uuid;
  v_user_id       uuid;
  v_company       text;
  v_version       text;
  v_name          text;
  v_role          text;
  v_expires       timestamptz;
  v_missing       text;
  v_rows          int;
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  -- ⚠️ INCOMPLETE MEANS INCOMPLETE, AND IT IS NAMED. A determination is only coherent once its
  -- direction and nature are stated: "this is an actual negative impact and I cannot judge its
  -- scale" is a §6.1 abstention and is a real answer, but "I have no view on whether this is
  -- happening or might happen" is not a determination at all.
  --
  -- So every assigned sub-topic must carry BOTH directions with a nature. The dimensions may all be
  -- null. Refusing here rather than at the constraint means the contributor is told WHICH ones,
  -- instead of receiving a check_violation naming a column.
  select string_agg(m.subtopic_code || ' (' || m.direction || ')', ', ' order by m.subtopic_code, m.direction)
    into v_missing
    from (
      select s.subtopic_code, dir.direction
        from public.materiality_impact_assignment_subtopics s
        cross join (values ('negative'), ('positive')) as dir(direction)
        left join public.materiality_impact_determinations d
          on d.assessment_id = v_assessment_id
         and d.subtopic_code = s.subtopic_code
         and d.direction     = dir.direction
       where s.assignment_id = v_assignment_id
         and (d.assessment_id is null or d.nature is null)
    ) m;

  if v_missing is not null then
    raise exception
      'These are not finished yet: %. Each sub-topic is determined twice — once for harm and once '
      'for benefit — and each needs to say whether it is already happening or might happen. The '
      'severity questions themselves can be left as "not enough visibility to assess".', v_missing;
  end if;

  -- ⚠️ THE DETERMINATIONS FIRST, THE ASSIGNMENT SECOND. Reversed, the assignment's own status would
  -- make resolve_token refuse before the rows were flipped, stranding submitted work under a
  -- submitted assignment with every determination still draft.
  update public.materiality_impact_determinations d
     set status        = 'submitted',
         determined_at = now()
   where d.assessment_id = v_assessment_id
     and d.assignment_id = v_assignment_id
     and d.status = 'draft';

  get diagnostics v_rows = row_count;

  update public.materiality_impact_assignments g
     set status = 'submitted', submitted_at = now()
   where g.id = v_assignment_id;

  -- Checked, not assumed: an UPDATE matching no row raises nothing and returns nothing.
  if not found then
    raise exception
      'Your determinations were saved but the submission could not be recorded. Nothing is lost — '
      'try again, and tell us if it keeps happening.';
  end if;

  return jsonb_build_object('submitted', v_rows);
end $$;

comment on function public.impact_submit(uuid) is
  'One-way. Flips every one of this contributor''s determinations to submitted, then the assignment itself — in that order, because reversing it would make resolve_token refuse before the rows were flipped and strand submitted work under a submitted assignment. Refuses while any assigned sub-topic lacks a direction-and-nature in either direction, NAMING which: the dimensions may be null (a §6.1 abstention is a real answer) but a determination with no stated nature is not a determination. After this the token no longer admits the holder — resolve_token returns PT410 with the sentence that their work was received.';


-- =====================================================================
-- Grants — the RPCs are the sole path; the tables stay ungranted to anon
-- =====================================================================
-- ⚠️ NO GRANT ON ANY TABLE IS ISSUED BY THIS FILE. 20260838 and 20260839 give anon nothing on
-- materiality_impact_assignments, _assignment_subtopics, _determinations or
-- _assignee_determinations, and that stays true. A contributor reaches exactly three functions and
-- through them exactly the rows their own token resolves to.
revoke all on function public.materiality_impact_resolve_token(uuid) from public;
revoke all on function public.impact_determination_json(uuid, text, text) from public;

revoke all on function public.impact_get(uuid) from public;
revoke all on function public.impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text) from public;
revoke all on function public.impact_submit(uuid) from public;

grant execute on function public.impact_get(uuid) to anon, authenticated;
grant execute on function public.impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text) to anon, authenticated;
grant execute on function public.impact_submit(uuid) to anon, authenticated;

commit;


-- =====================================================================
-- VERIFY — run after, separately. Substitute a real token.
-- =====================================================================
--
--  1) ⚠️ THE FIREWALL, TESTED AS A STRING SEARCH RATHER THAN BY READING THE CODE. Nothing from the
--     survey may appear anywhere in the payload:
--       select public.impact_get('<token>')::text ~* 'respond|top_box|distribution|abstain|n_asked|survey'
--       as leaks;
--       -- expect false
--
--  2) The payload's top-level shape is exactly three keys:
--       select jsonb_object_keys(public.impact_get('<token>')) order by 1;
--       -- expect assessment, contributor, subtopics — and nothing else
--
--  3) ONLY this contributor's sub-topics:
--       select jsonb_array_length(public.impact_get('<token>') -> 'subtopics');
--       -- expect the count of rows in materiality_impact_assignment_subtopics for THIS assignment,
--       -- not the assessment's total
--
--  4) The four opaque refusals are indistinguishable. All four expected to return the SAME
--     'invalid token' / no_data_found:
--       select public.impact_get(gen_random_uuid());                    -- unknown
--       update ... set revoked_at = now() where id = '<a>'; then impact_get('<token>');
--       update ... set expires_at = now() - interval '1 day' ...;       -- expired
--       update ... set status = 'revoked' ...;                          -- revoked
--
--  5) ⚠️ ¶41 REFUSES INSTEAD OF DISCARDING. Both expected to RAISE, and afterwards the row must be
--     unchanged rather than saved-without-the-field:
--       select public.impact_save_determination('<token>', 'E2.1', 'positive', 'actual',
--              2::smallint, 2::smallint, 3::smallint, null, '{own_operations}', 'short');
--       -- expect: A positive impact carries no irremediability...
--       select public.impact_save_determination('<token>', 'E2.1', 'negative', 'actual',
--              2::smallint, 2::smallint, 2::smallint, 3::smallint, '{own_operations}', 'short');
--       -- expect: An impact that is already happening carries no likelihood...
--
--  6) evidence_in_view is false on everything this path wrote:
--       select count(*) from public.materiality_impact_determinations
--        where assignment_id = '<assignment>' and evidence_in_view;
--       -- expect 0
--
--  7) Submit refuses while anything is unfinished, and NAMES it:
--       select public.impact_submit('<token>');
--       -- expect: These are not finished yet: E2.1 (positive), ...
--
--  8) After a complete submit, the token stops admitting the holder with the DISTINGUISHABLE
--     refusal — not the opaque one:
--       select public.impact_get('<token>');
--       -- expect SQLSTATE PT410, 'Your part of this assessment has been submitted...'
--
--  9) ⚠️ THE LOCK FAILS CLOSED ON THIS PATH. Force the assignment back to in_progress so the token
--     admits again, leaving one determination submitted, then try to save it:
--       update public.materiality_impact_assignments set status = 'in_progress' where id = '<a>';
--       select public.impact_save_determination('<token>', 'E2.1', 'negative', 'potential',
--              4::smallint, 4::smallint, 4::smallint, 2::smallint, '{}', 'long');
--       -- expect a refusal, NOT a silent write — either this function's PT410 or, if that check
--       -- were ever removed, 20260839's "requires a reason". Both are correct; a success is not.
--
-- 10) anon holds no table privileges at all:
--       select table_name, grantee, privilege_type from information_schema.role_table_grants
--        where table_name like 'materiality_impact%' and grantee = 'anon';
--       -- expect zero rows
