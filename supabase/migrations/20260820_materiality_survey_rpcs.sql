-- 20260820_materiality_survey_rpcs.sql
--
-- SCREENING SURVEY — THE RESPONDENT PATH. Three token-scoped SECURITY DEFINER functions, plus two
-- internal helpers. RUN 20260818_… AND 20260819_… FIRST; every function here reads tables those
-- two create, and the routing predicate below reads mr_esrs_subtopics.topic_code.
--
--   survey_get(uuid)            what a respondent needs to fill the form in, and nothing else
--   survey_save_response(...)   one autosaved answer, refused if the question was never asked
--   survey_submit(uuid)         one-way; resolves S1.x/S2.x and closes the invitation
--
-- Design authority: docs/materiality-questionnaire-spec-v8.md — §3.0.1 (routing, five counters),
-- §5.1 (the 1-3 maturity scale), §6.1 (abstention is a recorded answer, never a zero).
--
-- No application code calls these yet: nothing in app/ or lib/ mentions materiality_survey_* or any
-- of these three names. This file can therefore be applied to live independently of a deploy, and
-- there is no consumer to break. It is also why the whitelists below are cheap to get right NOW and
-- expensive to narrow later — see the next section.
--
--
-- =====================================================================
-- ⚠️ BOTH QUESTIONS, OUT LOUD, FOR EVERY FUNCTION — WHICH ROWS, AND WHICH COLUMNS
-- =====================================================================
-- 20260815_portal_get_whitelist.sql exists because portal_get leaked campaign_suppliers.annual_spend
-- — the buyer's private commercial figure — to every unauthenticated supplier for nearly two months.
-- The June review had reasoned about scope and got it RIGHT: "only ever returns the single row whose
-- token was supplied." True then, true now, and never the problem. Row scope is the WHERE clause;
-- column scope is the projection; a correct-sounding sentence about the first is exactly what stops
-- anyone looking at the second.
--
-- So, answered here rather than assumed:
--
-- survey_get
--   ROWS    the one materiality_survey_respondents row whose token was supplied, and only while it
--           is live (not revoked, not expired, not completed); its round; the question rows of that
--           round at its current questionnaire_version that are `included` AND routed to this
--           respondent; that respondent's own response rows. No other respondent's anything.
--   COLUMNS an explicit jsonb_build_object whitelist, three of them. NOT to_jsonb() of any table.
--           Deliberately OUT, and why:
--             round.user_id            a raw auth.users UUID identifying a ThemisIQ account.
--             round.standard_version   internal; and the ESRS version is the customer's disclosure
--                                      to make on the report cover (Art. 2(2)), not a fact for a
--                                      respondent's form.
--             round.anonymity_floor    tells a respondent how few answers make a cell suppressible.
--                                      That is a hint about how identifiable they are, published to
--                                      the one person it can affect.
--             round.id / respondent.id internal keys. The respondent's only legitimate handle is
--                                      their token, and question_id is the only id the form posts.
--             round.status,
--             round.frozen_at,
--             round.questionnaire_version,
--             round.created_at/updated_at   operational, unread by any form.
--             respondent.invite_email  §4: the response record captures no name or email. Echoing
--                                      the email to the browser would put it back in a payload the
--                                      whole design exists to keep it out of.
--             respondent.token         the caller already holds it — it is in their URL. Echoing a
--                                      credential only copies it into a second place (the same
--                                      reason campaign_suppliers.token was dropped in August).
--             respondent.status        carries no information a caller can act on: 'completed' is a
--                                      refusal, and every value that reaches the projection has just
--                                      been flipped to 'in_progress'.
--             respondent.expires_at,
--             respondent.reminder_sent_at   the customer's chasing cadence, and the invite clock.
--             respondent.track / stakeholder_category / function_department / seniority_band /
--             site_region / value_chain_position   the customer's classification OF this person.
--                                      It drives the routing, and the routing has already been
--                                      applied by the time the questions are projected. Handing it
--                                      back invites a client to re-implement the routing, which is
--                                      the one thing §3.0.1 requires happen in exactly one place.
--             question.subtopic_code / standard_version / shared_with_subtopic_code / status /
--             round_id / user_id / questionnaire_version / sort_order / created_at
--                                      ESRS plumbing. The form renders short_name, framing, wording
--                                      and context, and posts question_id. sort_order is out because
--                                      the array is already returned in sort_order and a jsonb array
--                                      preserves its order — returning a field nothing reads is the
--                                      habit that produced to_jsonb in the first place.
--
--           ADD A FIELD TO ANY OF THE THREE WHITELISTS ONLY AFTER A PRIVACY REVIEW, and never by
--           reintroducing to_jsonb — that re-leaks every column added to those tables from that day
--           forward, silently.
--
-- survey_save_response
--   ROWS    writes exactly one materiality_survey_responses row, keyed (respondent_id, question_id)
--           for the token's respondent and a question of that respondent's own round, at that
--           round's current questionnaire_version, `included`, and routed to them. Also stamps
--           frozen_at on the round (see below). Reads no other respondent's rows.
--   COLUMNS returns void. It projects NOTHING. The one thing a caller learns is whether it raised.
--
-- survey_submit
--   ROWS    the token's respondent, and that respondent's own response rows. Nothing else.
--   COLUMNS returns void.
--
-- AND THE TWO HELPERS, WHICH ARE THE COLUMN-SCOPE RISK IN THIS FILE:
--   materiality_survey_resolve_token() is the shared token gate. It deliberately does NOT return
--   the respondent row type. `returns public.materiality_survey_respondents` would have been the
--   obvious way to write it, and it would hand back invite_email, token, expires_at and the whole
--   classification to anything that could call it. It returns eight named OUT parameters instead,
--   none of them a credential. It is ALSO revoked from PUBLIC, and it is SECURITY INVOKER: three
--   independent reasons an anon caller gets nothing from it, so that forgetting any one of them is
--   not a leak. (Invoker is safe here precisely because it is only ever called from inside a definer
--   function, where the current user is already the owner. If it were somehow granted to anon, anon
--   would run it under RLS, find no row, and get the same 'invalid token' as a bad token.)
--
--
-- =====================================================================
-- ⚠️ THE ROUTING, MADE REAL — AND WHY IT IS ONE FUNCTION AND NOT THREE COPIES
-- =====================================================================
-- §3.0.1: the twelve labour rows (S1.1-6 / S2.1-6) are routed by stakeholder CATEGORY, three
-- outcomes. Every other sub-topic is asked of every respondent.
--
--   labour_routing = 's1'         25 + the six S1.x = 31 questions   (own_workforce,
--                                                                     workers_rep_own)
--   labour_routing = 's2'         25 + the six S2.x = 31 questions   (value_chain_worker,
--                                                                     workers_rep_value_chain,
--                                                                     supplier)
--   labour_routing = 'not_asked'  25 questions, NEITHER side        (customer, investor_lender,
--                                                                     regulator,
--                                                                     affected_community,
--                                                                     consumer_end_user,
--                                                                     civil_society)
--
-- ⚠️ NOBODY EVER SEES 37. The round holds 37 question rows because §11.2's duplication gives the
-- six labour sub-topics twelve matrix rows — S1.1-6 AND S2.1-6 — and a respondent is shown one side
-- of each pair or neither. 37 is the matrix's row count, not any form's length. Appendix A's own
-- count of distinct sub-topics is 31 (spec §11), which is exactly what an s1 or s2 respondent
-- receives, and the coincidence of those two numbers is worth naming before it misleads someone:
-- the 31 an S1 respondent sees is 25 shared + 6 own-workforce, NOT Appendix A's 31.
--
-- The predicate lives in ONE function, materiality_survey_routes_to(), called by all three RPCs.
-- Two copies of a routing rule is the failure lib/supply-chain/templates.ts already paid for, with
-- 68 of 75 labels disagreeing across two copies of the same question set — and here the two copies
-- would be the read path and the write path, so a drift between them means a respondent is shown a
-- question the save path then refuses, or worse, not shown one the save path accepts.
--
-- ⚠️ HOW IT DECIDES WHICH SIDE OF THE PAIR A QUESTION IS ON — NOT BY STRING SURGERY.
-- 20260818's header is explicit that deriving the pairing as `'S2' || substring(code from 3)` is
-- "correct for a one-off check against a seed you can read, and a latent defect the moment it
-- becomes the routing rule for a live response." So this does not touch the code string. It reads
-- mr_esrs_subtopics.topic_code — a real relational column, 'S1' or 'S2' — and maps it to
-- labour_routing with a CASE that names both enumerations and the correspondence between them:
--
--     when 's1' then topic_code = 'S1'
--     when 's2' then topic_code = 'S2'
--     when 'not_asked' then false
--     else RAISE
--
-- Not lower(topic_code) = labour_routing, which would work today by coincidence of casing and would
-- silently start hiding questions the day either enumeration gains a value the other lacks. The
-- ELSE raises rather than returning false, because false here means A QUESTION DISAPPEARS FROM A
-- RESPONDENT'S FORM, and an unrecognised routing value must not be able to do that quietly.
--
-- THE JOIN TO mr_esrs_subtopics IS DELIBERATE AND IS NOT A SNAPSHOT VIOLATION. The question row
-- snapshots its display copy (short_name, framing, wording) precisely so a re-seed of
-- mr_esrs_subtopic_display cannot restate a past question. topic_code is not display copy: it is
-- which ESRS standard a sub-topic sits under, it is transcribed law, and mr_esrs_subtopics is the
-- transcription of record that is never corrected in place. A sub-topic cannot change standards
-- without becoming a different sub-topic.
--
-- ⚠️ LEFT JOIN, NOT INNER. A question with subtopic_code NULL is an entity-specific matter (§3.2 —
-- ESRS 1 Appendix A explicitly contemplates disclosures outside its list). It has no row in
-- mr_esrs_subtopics, an inner join would drop it, and it would vanish from the form with no error.
-- Its shared_with_subtopic_code is NULL by CHECK constraint, so the predicate's first branch returns
-- true and it is asked of everyone, which is correct. The generator writes no such rows today; the
-- schema permits them, and this path is what stops the first one being silently invisible.
--
--
-- =====================================================================
-- ⚠️ 25 QUESTIONS IS A CORRECT RESULT. ZERO IS NOT, AND NEITHER IS A SHORT 31.
-- =====================================================================
-- A respondent whose category routes to 'not_asked' gets 25 questions, and nothing anywhere should
-- read that as an error. It is the whole point of the third routing outcome: a customer who cannot
-- observe health and safety in your suppliers' operations must not be shown the question, because
-- their non-answer would otherwise be counted as an abstention and §6.1 makes the abstention count a
-- finding about the COMPANY's blindness, not the respondent's.
--
-- But that makes a short form ambiguous in exactly the way this codebase keeps paying for: 25 is
-- correct for one reason and a symptom for another. If the topic_code <-> labour_routing mapping
-- ever stops resolving, an S1 respondent silently receives the same 25 questions — an absence
-- rendered as a result, and one nobody would query, because 25 is a number this system legitimately
-- produces. So survey_get COUNTS the labour rows both ways and refuses rather than serving a form it
-- cannot vouch for:
--
--   routing 'not_asked'  ->  labour rows routed to them must be 0
--   routing 's1' / 's2'  ->  routed must be exactly half the labour rows in the round
--
-- Half, not "6". The pairing is 1:1 by construction (every labour row carries exactly one
-- shared_with_subtopic_code), so the symmetry check catches a total mapping failure AND a partial
-- one, without hardcoding a count that the taxonomy could legitimately change. The count is taken
-- BEFORE the `included` filter, because deselecting a labour question is a legitimate customer
-- decision (§3.2) and must not trip a defect check.
--
-- And a form with ZERO questions is refused outright, whatever the reason. That is the empty-form
-- failure the gate in 20260819 exists to prevent, arriving by a third door: not a missing taxonomy,
-- not a missing display row, but a customer who deselected everything.
--
--
-- =====================================================================
-- ⚠️ WHAT survey_save_response REFUSES, AND WHY EACH REFUSAL IS THE SHAPE IT IS
-- =====================================================================
-- 1. TOKEN REFUSALS ARE INDISTINGUISHABLE. Unknown token, revoked, expired, already completed: one
--    message, one errcode (no_data_found), from one helper. A caller cannot tell which, so a token
--    cannot be probed for "exists but revoked". This is the ONE place in the file where a vague
--    message is correct, and it is vague about which of four *refusals* applied — never about
--    whether something happened. Everything else says what was observed.
--
-- 2. A QUESTION THE RESPONDENT WAS NEVER ROUTED TO IS REFUSED, LOUDLY AND DISTINGUISHABLY. A
--    customer POSTing an answer to an S2 labour question is either a routing bug or a crafted
--    request, and in both cases the row must not exist: n_asked is DERIVED from the question set and
--    the routing, so a stored answer to a never-asked question makes n_answered exceed n_asked for
--    that sub-topic and n_skipped go negative. The counters would not merely be wrong, they would be
--    incoherent. This refusal is deliberately NOT folded into the opaque token refusal — it reveals
--    nothing (mr_stakeholder_categories is anon-readable reference data by design), and a routing bug
--    that presents as "invalid token" would be diagnosed as an auth problem for weeks.
--
-- 3. A QUESTION FROM AN EARLIER questionnaire_version IS REFUSED. §3.3's wording-drift rule: the
--    Bay State file's first two responses answer a long-form maturity scale and every response after
--    answers Low/Medium/High, and the two are not comparable. A respondent holding a stale form
--    after a copy-on-write bump must be told to reload, not quietly recorded against retired wording.
--
-- 4. THE XOR IS CHECKED HERE TOO, EVEN THOUGH THE TABLE ENFORCES IT. The constraint is the
--    guarantee; this is the message. `abstained = false, value = null` — a row asserting an answer
--    it does not have — and `abstained = true, value = 2` get different sentences naming which
--    happened, rather than one constraint violation the client renders as generic failure text.
--
-- ⚠️ NOT A PARAMETER, THEREFORE NOT WRITABLE: free_text — AND THE SIGNATURE WILL HAVE TO CHANGE.
-- §5.1 specifies BOTH an optional free-text field per question AND one at the end of the survey
-- ("Is there anything affecting people, the environment or the business that we have not asked
-- about?"), the latter being an ESRS 2 IRO-1 emerging-topic expectation and the cheapest place to
-- catch one. The column exists on materiality_survey_responses and nothing in this file can populate
-- it, so the screening survey is NOT complete until survey_save_response takes a fifth parameter
-- (p_free_text text) — and the closing question needs a home of its own, since it belongs to no
-- question row.
--
-- Left out here deliberately rather than added quietly: the four-parameter signature was specified,
-- and widening it is a change to a live contract once a client calls it. Do it before the survey
-- ships, not after — a fifth parameter added later must be added with a DEFAULT or the existing
-- call sites break, and a defaulted free_text silently overwrites a saved note with NULL on every
-- autosave that omits it. That is the trap; it is cheap now and awkward later.
--
--
-- =====================================================================
-- ⚠️ frozen_at IS SET HERE. THIS IS THE ONE THING BEYOND THE THREE SIGNATURES.
-- =====================================================================
-- materiality_survey_rounds.frozen_at is documented as "Set when the FIRST response arrives", and
-- until this file nothing set it — the column existed and was permanently NULL. A permanently-NULL
-- frozen_at means the question set never stops being editable, so the copy-on-write bump to
-- questionnaire_version N+1 never triggers, and a customer edits wording underneath respondents who
-- have already answered it. That is the exact defect §3.3's rule exists to prevent.
--
-- The write path is the only place that can observe "the first response", so it is the only place
-- this can live. One statement, guarded on `frozen_at is null`, so it stamps once and never moves.
-- Nothing reads the column yet; the customer-side question editor that must respect it is a later
-- task, and it will find the timestamp already there rather than needing a backfill it cannot do.
--
--
-- =====================================================================
-- ⚠️ WHAT survey_submit RESOLVES — AND THE CASE WHERE IT REFUSES INSTEAD
-- =====================================================================
-- Under this routing, resolved_subtopic_code EQUALS asked_subtopic_code: a respondent is shown one
-- side of each labour pair, so the code they answered is already S1.3 or S2.3. The resolution looks
-- like an identity, and both columns still earn their place — the schema's own argument, unchanged:
-- asked is the evidence record (what this person was shown), resolved is what the matrix consumes,
-- and storing only the asked code would force every later consumer to re-derive the routing against
-- whatever the rule is THEN, silently restating historical answers when it changes.
--
-- resolution_basis is written on EVERY response row, not only the labour ones, and it means exactly
-- one thing: the stakeholder category in force when the resolution was written. On a labour row that
-- is the category that chose the side; on a non-labour row it is the category that was recorded
-- while asking a question no routing applied to. Which of the two a given row is remains recoverable
-- — its question's shared_with_subtopic_code says so — and no reader should infer from a non-null
-- basis that a routing decision was made.
--
-- ⚠️ AND IT REFUSES IF THE CATEGORY MOVED UNDER THE ANSWERS. The customer can UPDATE a respondent's
-- stakeholder_category (they own the row). If someone answered the S1 labour questions and is then
-- reclassified as a supplier, submit would write resolution_basis = 'supplier' against answers about
-- their own workplace — an audit trail claiming a rule that was not the one applied, which is the
-- precise failure 20260818's header forbids for labour_routing edits. So submit compares every
-- answered row's asked side against the CURRENT category's routing, and refuses the whole submit if
-- any disagrees. It refuses rather than resolving by asked-side, because the disagreement means the
-- evidence record and the classification now tell different stories about who this person is, and
-- that is a question for a human, not a default.
--
-- ONE-WAY, exactly as portal_submit is: the token gate refuses status='completed', so a second
-- submit gets the same 'invalid token' as a bad token. THERE IS NO UNLOCK PATH AND NONE IS BUILT
-- HERE. A three-week survey will need one; what it would cost and where it would have to live is
-- recorded in the report accompanying this file, deliberately as a decision rather than a discovery.
--
-- PARTIAL SUBMISSION IS PERMITTED and a submit with zero responses succeeds. §3.0.1 requires it:
-- n_skipped ("I saw this and didn't engage") is a distinct finding from n_abstained ("I saw this and
-- cannot say"), and it exists only because a respondent can submit having left questions untouched.
-- Refusing an empty submit would push those people to abandon instead, which records nothing at all.
--
--
-- =====================================================================
-- ⚠️ THE REOPEN PROBLEM — NOT BUILT HERE, AND RECORDED SO IT IS A DECISION AND NOT A DISCOVERY
-- =====================================================================
-- A three-week survey will produce the request: "I submitted by accident / my colleague answered
-- for the wrong site / the CFO wants to change one answer." portal_submit has the same one-way
-- shape and the same absence of an answer. Nothing below is built. It is written down so the choice
-- is made deliberately rather than at the moment a customer is on the phone.
--
-- ⚠️ FIRST, THE PART THAT IS NOT HYPOTHETICAL: A REOPEN IS ALREADY POSSIBLE, AND IT IS UNAUDITED.
-- materiality_survey_respondents grants SELECT/INSERT/UPDATE to authenticated under an owner RLS
-- policy (20260819). So the CUSTOMER can already run, from any client holding their own JWT:
--     update materiality_survey_respondents set status = 'in_progress' where id = ...;
-- and the token starts working again. There is no feature, no button and no audit record — but
-- there is also nothing stopping it. Whatever is decided about reopening, that fact is the starting
-- point, and the honest options are to build the path properly or to close it.
--
-- WHAT IT WOULD COST, IN THE ORDER THE COST RISES:
--
--  1. THE RESOLUTION RESET — small, and the reason a bare status flip is not enough. Reopening
--     leaves resolved_subtopic_code and resolution_basis written on the rows the first submit
--     resolved. Any answer added or changed afterwards is unresolved until the next submit, so one
--     respondent can hold a mix of resolved and unresolved rows, and an aggregation reading
--     resolved_subtopic_code silently under-counts them. A reopen must NULL both columns for that
--     respondent so the next submit re-resolves the whole set coherently. This is why it has to be
--     an RPC — survey_reopen(p_respondent_id uuid), authenticated and owner-scoped, checking
--     user_id = auth.uid() on the round — and not a dashboard UPDATE. Roughly the size of one of
--     the three functions in this file.
--
--  2. THE AUDIT RECORD — small, and non-optional for the same reason exclusion_reason is. ESRS 2
--     SBM-2 has the engagement disclosure state field dates and response counts; a response that
--     was submitted, reopened and changed is a change to the evidence base, and "reopened" with no
--     actor, no timestamp and no reason is indistinguishable from an answer that was always that
--     way. Either a materiality_survey_respondent_events table, or the capture_audit_log
--     infrastructure from 20260726_capture_audit_log_infrastructure.sql. completed_at must become
--     history rather than being overwritten with NULL.
--
--  3. THE REFUSE-IF-CONSUMED RULE — NOT small, and it is the one that decides the shape. A reopen
--     must be refused once the round has fed an assessment, or a figure changes underneath a report
--     that has already printed it, which is the defect the whole module exists to avoid. That rule
--     needs the round -> materiality_assessments link, and that write-back is not designed yet
--     (20260819's header names it as its own task). Until it exists, a reopen cannot know whether it
--     is editing evidence a customer has already published.
--
--  4. THE ANONYMITY INTERACTION — cheap to state, easy to miss. Once an aggregate has been shown at
--     or above anonymity_floor, reopening lets a customer who has SEEN the aggregate influence which
--     individual answers change. That is not a schema problem and no RPC fixes it; it is a reason
--     the audit record in (2) must capture whether the round's aggregate had been read.
--
-- ⚠️ DECIDED 16 AUGUST 2026, AND BOTH HALVES ARE NOW REAL — DO NOT RE-OPEN EITHER FROM THIS FILE:
--   • survey_reopen is NOT built, and must not be until (3) has a home. It cannot know whether it is
--     editing evidence a customer has already published.
--   • THE ACCIDENTAL UNLOCK IS CLOSED. 20260821_materiality_survey_respondent_completed_lock.sql
--     adds a BEFORE UPDATE trigger refusing any transition out of 'completed', which converts
--     "silently possible, unaudited" into "refused until designed" — the posture the rest of this
--     schema takes. Leaving it open was defensible only if written down that the customer can
--     silently reopen and re-answer with no trace, and a survey with that property is not evidence.
-- The full four-part design brief for survey_reopen lives in 20260821's header, expanded, because
-- that is the file whoever builds it will be looking at. This section is the summary; that one is
-- the record.
--
--
-- TWO OTHER THINGS DELIBERATELY NOT BUILT, SO THEY ARE NOT MISTAKEN FOR OVERSIGHTS:
--   • ROUND STATUS IS NOT A REFUSAL. materiality_survey_rounds.status ('draft' | 'open' | 'closed')
--     is not read by any function here — a token admits a respondent whatever the round's status
--     says. So a 'closed' round still collects answers, and a 'draft' round would too if an invite
--     escaped. That is a real gap and it is not filled here because turning round status into a
--     refusal locks respondents out the moment a customer clicks Close, which needs a UI that warns
--     them first. Decide it with that screen, not silently in an RPC.
--   • free_text is not writable — see the save_response section above.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE OR REPLACE
-- throughout, idempotent revoke/grant. No client change ships with it and none is needed.

begin;

-- =====================================================================
-- Helper 1 — the routing predicate. ONE definition, called by all three RPCs.
-- =====================================================================
create or replace function public.materiality_survey_routes_to(
  p_shared_with_subtopic_code text,
  p_topic_code                text,
  p_labour_routing            text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
begin
  -- Not one of the twelve labour rows. §3.0.1: every other sub-topic is asked of every respondent,
  -- and so is an entity-specific matter (subtopic_code null, hence topic_code null).
  if p_shared_with_subtopic_code is null then
    return true;
  end if;

  -- A paired row with no topic is impossible by construction (shared_with_subtopic_code requires
  -- subtopic_code, which foreign-keys into mr_esrs_subtopics). If it ever happens, the routing
  -- cannot be decided — and deciding it wrongly hides a question, so refuse instead.
  if p_topic_code is null then
    raise exception
      'materiality_survey_routes_to: a paired labour question resolved to no ESRS topic. The '
      'routing cannot be decided, and defaulting it either way would silently add or remove a '
      'question from a respondent''s form.';
  end if;

  -- The correspondence between the two enumerations, named. NOT lower(p_topic_code) =
  -- p_labour_routing: that works today by coincidence of casing and starts hiding questions
  -- silently the day either enumeration gains a value the other lacks.
  case p_labour_routing
    when 's1'        then return p_topic_code = 'S1';
    when 's2'        then return p_topic_code = 'S2';
    when 'not_asked' then return false;
    else
      raise exception
        'materiality_survey_routes_to: unknown labour_routing %. Refusing rather than returning '
        'false, because false here means a question disappears from a respondent''s form.',
        p_labour_routing;
  end case;
end $$;

comment on function public.materiality_survey_routes_to(text, text, text) is
  'THE S1/S2 ROUTING PREDICATE (spec v8 §3.0.1), in one place. True when a question should be shown to a respondent whose category has the given labour_routing. Non-paired questions (shared_with_subtopic_code null) are asked of everyone, including entity-specific matters. Paired questions are decided from mr_esrs_subtopics.topic_code, NEVER by string surgery on the sub-topic code — 20260818''s header names that derivation as a latent defect the moment it becomes a live routing rule. Called by survey_get, survey_save_response and survey_submit; two copies of this rule would mean the read path and the write path could disagree about what was asked.';

-- =====================================================================
-- Helper 2 — the shared token gate. NOT a row type, and NOT granted.
-- =====================================================================
-- Every refusal a token can produce, in one place, with one message and one errcode, so a caller
-- cannot distinguish unknown from revoked from expired from already-submitted.
--
-- ⚠️ IT RETURNS NAMED OUT PARAMETERS, NOT public.materiality_survey_respondents. The row type would
-- have been the obvious way to write it and would carry invite_email, token, expires_at and the
-- customer's whole classification of this person. Nothing below needs any of those.
create or replace function public.materiality_survey_resolve_token(
  p_token                  uuid,
  out o_respondent_id      uuid,
  out o_round_id           uuid,
  out o_track              text,
  out o_stakeholder_category text,
  out o_function_department  text,
  out o_invite_name        text,
  out o_questionnaire_version int,
  out o_labour_routing     text)
returns record
language plpgsql
-- SECURITY INVOKER, deliberately. It is only ever called from inside a SECURITY DEFINER function,
-- where the current user is already the owner, so it needs no privilege of its own. If it were ever
-- granted to anon by mistake, anon would run it under RLS, match no row, and receive the same
-- 'invalid token' as a bad token — a leak that fails closed rather than open.
set search_path = public
as $$
begin
  select r.id, r.round_id, r.track, r.stakeholder_category, r.function_department, r.invite_name,
         rd.questionnaire_version, c.labour_routing
    into o_respondent_id, o_round_id, o_track, o_stakeholder_category, o_function_department,
         o_invite_name, o_questionnaire_version, o_labour_routing
    from public.materiality_survey_respondents r
    join public.materiality_survey_rounds rd
      on rd.id = r.round_id
    join public.mr_stakeholder_categories c
      on c.code = r.stakeholder_category
   where r.token = p_token
     and r.revoked_at is null
     and r.expires_at > now()
     and r.status not in ('completed', 'revoked', 'expired');

  -- ONE message for all four refusals. Unknown token, revoked, expired, already submitted — a caller
  -- learns only that this token does not currently admit them.
  if o_respondent_id is null then
    raise exception 'invalid token' using errcode = 'no_data_found';
  end if;
end $$;

comment on function public.materiality_survey_resolve_token(uuid) is
  'The shared token gate for survey_get / survey_save_response / survey_submit. Refuses an unknown, revoked, expired or already-completed token with ONE message and ONE errcode (no_data_found), so a caller cannot distinguish them. Returns eight named OUT parameters and deliberately NOT the respondent row type, which would carry invite_email and the token itself. Revoked from PUBLIC and SECURITY INVOKER: three independent reasons an anon caller gets nothing, so forgetting one is not a leak.';

-- =====================================================================
-- survey_get
-- =====================================================================
create or replace function public.survey_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respondent_id   uuid;
  v_round_id        uuid;
  v_name            text;
  v_version         int;
  v_routing         text;
  v_track           text;   -- unused in the projection, and that is the point (see the header)
  v_category        text;
  v_department      text;
  v_labour_total    int;
  v_labour_routed   int;
  v_question_count  int;
  v jsonb;
begin
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  -- ── The short-form guard (see the header). 25 is a correct result for a not_asked respondent and
  -- a defect for anyone else, and the two are indistinguishable from the outside without this.
  select count(*),
         count(*) filter (
           where public.materiality_survey_routes_to(
                   q.shared_with_subtopic_code, s.topic_code, v_routing))
    into v_labour_total, v_labour_routed
    from public.materiality_survey_questions q
    join public.mr_esrs_subtopics s
      on s.code = q.subtopic_code
     and s.standard_version = q.standard_version
   where q.round_id = v_round_id
     and q.questionnaire_version = v_version
     -- Counted BEFORE the `included` filter: deselecting a labour question is a legitimate customer
     -- decision (§3.2) and must not read as a routing failure.
     and q.shared_with_subtopic_code is not null;

  if v_labour_total > 0 then
    if v_routing = 'not_asked' then
      if v_labour_routed <> 0 then
        raise exception
          'Survey routing failed: stakeholder category % routes the labour sub-topics to not_asked, '
          'but % of the round''s % paired questions matched. Refusing to serve a form that asks a '
          'respondent questions the routing excluded them from — those answers would be counted '
          'against the company as its own blind spot (spec v8 §3.0.1).',
          v_category, v_labour_routed, v_labour_total;
      end if;
    elsif v_labour_routed * 2 <> v_labour_total then
      -- Half, not 6: the S1.x <-> S2.x pairing is 1:1 by construction, so this catches a total
      -- mapping failure AND a partial one without hardcoding a count the taxonomy could change.
      raise exception
        'Survey routing failed: stakeholder category % routes to %, but % of the round''s % paired '
        'questions matched (expected exactly half). Refusing to serve a short form — it would be '
        'indistinguishable from the 25 questions a not_asked respondent correctly receives.',
        v_category, v_routing, v_labour_routed, v_labour_total;
    end if;
  end if;

  -- ── Respondent-safe WHITELISTS only. Do NOT to_jsonb() any of these three tables — that is the
  -- defect 20260815_portal_get_whitelist.sql exists to remove, and it re-leaks every column added to
  -- those tables from that day forward, silently. Add a field only after a privacy review.
  select jsonb_build_object(
           'round', jsonb_build_object(
                      'name',         rd.name,
                      'company_name', rd.company_name,
                      'deadline',     rd.deadline),
           -- The respondent's own display name and nothing else. No email, no token, no
           -- classification, and no sight of any other respondent.
           'respondent', jsonb_build_object(
                      'display_name', v_name),
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id',      q.id,
                      'short_name',       q.short_name,
                      'question_framing', q.question_framing,
                      'wording',          q.wording,
                      'context',          q.context)
                    order by q.sort_order)
               from public.materiality_survey_questions q
               -- LEFT: an entity-specific matter (subtopic_code null) has no row in
               -- mr_esrs_subtopics, and an inner join would drop it from the form with no error.
               left join public.mr_esrs_subtopics s
                 on s.code = q.subtopic_code
                and s.standard_version = q.standard_version
              where q.round_id = v_round_id
                and q.questionnaire_version = v_version
                and q.status = 'included'
                and public.materiality_survey_routes_to(
                      q.shared_with_subtopic_code, s.topic_code, v_routing)),
             '[]'::jsonb),
           -- Save-and-return. This respondent's own answers, four fields, nothing else.
           'responses', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id', rs.question_id,
                      'value',       rs.value,
                      'abstained',   rs.abstained,
                      'free_text',   rs.free_text))
               from public.materiality_survey_responses rs
              where rs.respondent_id = v_respondent_id),
             '[]'::jsonb))
    into v
    from public.materiality_survey_rounds rd
   where rd.id = v_round_id;

  -- Unreachable: resolve_token already joined the round, so it exists. Kept because returning NULL
  -- from here would reach the client as a successful empty response — an absence rendered as a
  -- result, which is the failure class this codebase has paid for four times.
  if v is null then
    raise exception
      'Survey round % vanished between the token check and the projection.', v_round_id;
  end if;

  -- A form with no questions renders as an empty page, which reads to a respondent as "this is
  -- broken" and to the customer as "nobody answered". Both are wrong, and neither is recoverable
  -- after the fact. Refuse and name the reason instead.
  v_question_count := jsonb_array_length(v -> 'questions');
  if v_question_count = 0 then
    raise exception
      'This survey round has no questions to show you. Every question in the set is either '
      'deselected or excluded by routing, so there is nothing to answer — reporting that rather '
      'than presenting an empty form.';
  end if;

  -- Same side effect as portal_get, on first touch only.
  update public.materiality_survey_respondents
     set status = 'in_progress'
   where id = v_respondent_id
     and status = 'invited';

  return v;
end $$;

comment on function public.survey_get(uuid) is
  'What a survey respondent needs to fill the form in, and nothing else. THREE EXPLICIT WHITELISTS — no to_jsonb of any table; see the migration header for every column deliberately withheld and why. Applies the §3.0.1 labour routing: an s1 or s2 respondent receives 31 questions (25 shared + their side of the six labour pairs) and a not_asked respondent correctly receives 25. NOBODY receives 37 — that is the matrix row count, not a form length. Guards that a SHORT form is never served in place of a correct one. Flips invited -> in_progress on first touch. Refuses an unknown, revoked, expired or completed token with one indistinguishable message.';

-- =====================================================================
-- survey_save_response
-- =====================================================================
create or replace function public.survey_save_response(
  p_token       uuid,
  p_question_id uuid,
  p_value       smallint,
  p_abstained   boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respondent_id uuid;
  v_round_id      uuid;
  v_track         text;
  v_category      text;
  v_department    text;
  v_name          text;
  v_version       int;
  v_routing       text;
  v_q             record;
begin
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  -- ── §6.1's XOR, checked here for the MESSAGE. The table constraint is the guarantee; a constraint
  -- violation reaches the client as generic failure text, and these two states mean opposite things.
  if p_abstained is null then
    raise exception
      'abstained must be true or false. A null abstention flag cannot be distinguished from an '
      'unanswered question, and the two are separate findings (spec v8 §3.0.1).';
  end if;
  if p_abstained and p_value is not null then
    raise exception
      'An abstention cannot also carry a value (got %). "Not enough visibility to assess" is a '
      'recorded answer with no score, never a low score (spec v8 §6.1).', p_value;
  end if;
  if not p_abstained and p_value is null then
    raise exception
      'A response must carry a value on the 1-3 scale or be recorded as an abstention. A row with '
      'neither asserts an answer it does not have; leave the question unanswered instead, which is '
      'a skip and is counted separately (spec v8 §3.0.1).';
  end if;
  if p_value is not null and p_value not between 1 and 3 then
    raise exception
      'value % is outside the 1-3 strategic-priority scale (spec v8 §5.1).', p_value;
  end if;

  -- ── The question must belong to this respondent's round, at its CURRENT questionnaire_version,
  -- and be selected.
  select q.id, q.subtopic_code, q.standard_version, q.questionnaire_version,
         q.shared_with_subtopic_code, s.topic_code
    into v_q
    from public.materiality_survey_questions q
    left join public.mr_esrs_subtopics s
      on s.code = q.subtopic_code
     and s.standard_version = q.standard_version
   where q.id = p_question_id
     and q.round_id = v_round_id
     and q.questionnaire_version = v_version
     and q.status = 'included';

  -- FOUND, not `v_q.id is null`: a record variable that SELECT INTO left unmatched is assigned all
  -- nulls, so both work today, but FOUND says what is meant and cannot be confused with a question
  -- row that legitimately holds a null in the field being tested.
  if not found then
    raise exception
      'Question % is not part of the current question set for this invitation. It belongs to '
      'another round, to an earlier questionnaire version (§3.3: answers to different wordings are '
      'not comparable and are never pooled), or it has been deselected. Reload the survey.',
      p_question_id;
  end if;

  -- ⚠️ THE ROUTING REFUSAL. A respondent answering a question they were never shown is a routing bug
  -- or a crafted request; either way the row must not exist. n_asked is DERIVED from the question
  -- set and the routing, so this row would make n_answered exceed n_asked for that sub-topic and
  -- n_skipped go negative — not merely wrong, incoherent.
  if not public.materiality_survey_routes_to(
           v_q.shared_with_subtopic_code, v_q.topic_code, v_routing) then
    raise exception
      'Question % (%) was never shown to this respondent: stakeholder category % routes the labour '
      'sub-topics to %. Refusing to store an answer to a question that was not asked — n_asked is '
      'derived from the routing, and this row would corrupt every counter for that sub-topic '
      '(spec v8 §3.0.1).',
      p_question_id, coalesce(v_q.subtopic_code, 'entity-specific'), v_category, v_routing;
  end if;

  -- ── The question set stops being editable at the first response (§3.3). Stamps once, never moves.
  -- This is the only place that can observe "the first response".
  update public.materiality_survey_rounds
     set frozen_at = now()
   where id = v_round_id
     and frozen_at is null;

  insert into public.materiality_survey_responses (
    round_id, respondent_id, question_id, questionnaire_version, standard_version,
    -- The EVIDENCE RECORD: the sub-topic this person was actually shown. resolved_subtopic_code and
    -- resolution_basis stay NULL until submit, deliberately — an in-flight answer has not been
    -- resolved to anything yet, and writing a resolution here would claim one before it was made.
    asked_subtopic_code,
    value, abstained,
    track, stakeholder_category, function_department)
  values (
    v_round_id, v_respondent_id, v_q.id, v_q.questionnaire_version, v_q.standard_version,
    v_q.subtopic_code,
    p_value, p_abstained,
    v_track, v_category, v_department)
  on conflict (respondent_id, question_id) do update
    set value                = excluded.value,
        abstained            = excluded.abstained,
        -- Refreshed on every save so all of one respondent's rows carry the SAME classification —
        -- the one submit will then stamp into resolution_basis. Letting them differ by save time
        -- would make the audit trail depend on the order someone happened to answer in.
        track                = excluded.track,
        stakeholder_category = excluded.stakeholder_category,
        function_department  = excluded.function_department,
        updated_at           = now();
end $$;

comment on function public.survey_save_response(uuid, uuid, smallint, boolean) is
  'Autosaves one screening answer, upserting on (respondent_id, question_id). Stamps questionnaire_version, standard_version, asked_subtopic_code and the respondent''s non-identifying attributes at write. REFUSES a question the respondent was never routed to (spec v8 §3.0.1) — that row would make n_answered exceed the derived n_asked and n_skipped go negative. Also refuses a stale questionnaire_version, a deselected question, and any value/abstained combination the §6.1 XOR forbids, each with a message naming which happened. Sets materiality_survey_rounds.frozen_at on the first response; this is the only code path that can observe it. Returns void: it projects nothing.';

-- =====================================================================
-- survey_submit
-- =====================================================================
create or replace function public.survey_submit(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respondent_id uuid;
  v_round_id      uuid;
  v_track         text;
  v_category      text;
  v_department    text;
  v_name          text;
  v_version       int;
  v_routing       text;
  v_mismatch      int;
begin
  -- One-way, as portal_submit is: the gate refuses status = 'completed', so a second submit gets
  -- the same 'invalid token' as a bad one. There is no unlock path here.
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  -- ⚠️ REFUSE IF THE CLASSIFICATION MOVED UNDER THE ANSWERS. The customer owns the respondent row
  -- and can change stakeholder_category. Resolving anyway would write a resolution_basis naming a
  -- category that did not produce the answers — an audit trail claiming a rule that was not applied,
  -- which is exactly what 20260818's header forbids for labour_routing edits.
  select count(*)
    into v_mismatch
    from public.materiality_survey_responses rs
    join public.materiality_survey_questions q
      on q.id = rs.question_id
    left join public.mr_esrs_subtopics s
      on s.code = rs.asked_subtopic_code
     and s.standard_version = rs.standard_version
   where rs.respondent_id = v_respondent_id
     and not public.materiality_survey_routes_to(
               q.shared_with_subtopic_code, s.topic_code, v_routing);

  if v_mismatch > 0 then
    raise exception
      'Cannot submit: % answered question(s) were shown under a different routing than stakeholder '
      'category % (%) now gives. The evidence record and the current classification disagree about '
      'who this respondent is, and resolving anyway would stamp a resolution_basis that did not '
      'produce these answers. Restore the category this respondent answered under, or re-invite '
      'them under the new one.',
      v_mismatch, v_category, v_routing;
  end if;

  -- The resolution. Under this routing it is the identity — the respondent was shown one side of
  -- each labour pair, so the code they answered is already S1.x or S2.x — and it is STORED rather
  -- than re-derived so a later change to the routing rule cannot restate historical answers.
  -- resolution_basis is the category in force at resolution; see the header for what it does and
  -- does not claim on a non-labour row.
  update public.materiality_survey_responses
     set resolved_subtopic_code = asked_subtopic_code,
         resolution_basis       = v_category,
         updated_at             = now()
   where respondent_id = v_respondent_id;

  -- Partial submission is permitted and zero responses is a valid submit: n_skipped exists only
  -- because a respondent can submit having left questions untouched (§3.0.1).
  update public.materiality_survey_respondents
     set status       = 'completed',
         completed_at = now()
   where id = v_respondent_id;
end $$;

comment on function public.survey_submit(uuid) is
  'Closes an invitation, one-way. Writes resolved_subtopic_code and resolution_basis on every one of the respondent''s response rows, then sets status = completed. REFUSES if the respondent''s stakeholder category has changed since they answered, rather than stamping a resolution_basis that did not produce the answers. Partial submission is permitted — a submit with untouched questions is what makes n_skipped a real finding. There is NO unlock path: a second submit receives the same indistinguishable ''invalid token'' as a bad token.';

-- =====================================================================
-- Grants — the RPCs are the sole path; the tables stay ungranted to both roles
-- =====================================================================
-- materiality_survey_responses has NO grant to anon or authenticated (20260819) and RLS with no
-- policy for either, and the other three are owner-scoped. That posture is unchanged by this file:
-- anon reaches all four ONLY through these definer functions.
revoke all on function public.survey_get(uuid)                                    from public;
revoke all on function public.survey_save_response(uuid, uuid, smallint, boolean) from public;
revoke all on function public.survey_submit(uuid)                                 from public;

grant execute on function public.survey_get(uuid)                                    to anon, authenticated;
grant execute on function public.survey_save_response(uuid, uuid, smallint, boolean) to anon, authenticated;
grant execute on function public.survey_submit(uuid)                                 to anon, authenticated;

-- ⚠️ THE HELPERS ARE REVOKED AND NOT GRANTED TO ANYONE. PUBLIC holds EXECUTE on a new function by
-- default, so this revoke is not decoration: without it, any anon caller could invoke
-- materiality_survey_resolve_token directly. It returns no credential by construction (see its
-- header), but "no grant" and "no credential in the projection" are two independent defences and
-- this file keeps both. They need no grant to work: a nested function inside a SECURITY DEFINER
-- body runs as the definer's owner.
revoke all on function public.materiality_survey_resolve_token(uuid)             from public;
revoke all on function public.materiality_survey_routes_to(text, text, text)     from public;

-- service_role is deliberately NOT granted EXECUTE on any of the five. Compare
-- 20260724_cbam_verifier_rpc_service_role_grants.sql, which exists because a server route called a
-- verifier RPC through the service-role client and failed at its first step: if a future server
-- route ever calls survey_get server-side, it needs its own grant, and that grant is a deliberate
-- act rather than something inherited here. The respondent page calls these with the anon key.

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--
-- ⚠️ TWO THINGS THAT WILL OTHERWISE MAKE A PASSING MIGRATION LOOK BROKEN:
--
-- (a) EVERY CHECK THAT EXPECTS AN ERROR IS WRAPPED IN A SAVEPOINT. In Postgres an error aborts the
--     whole transaction, so without them the first expected ERROR makes every later statement fail
--     with "current transaction is aborted" — and a verify block that reports twelve failures after
--     the first intentional one tells you nothing about the eleven.
--
-- (b) user_id IS SUPPLIED EXPLICITLY, NOT LEFT TO ITS DEFAULT. The default is auth.uid(), and the
--     Supabase SQL editor has no JWT, so auth.uid() is NULL there and the insert would fail its NOT
--     NULL. Pick a real account id once and reuse it.
--
-- Setup — a throwaway round and three respondents, one per routing outcome:
--    begin;
--      select id from auth.users order by created_at limit 1 \gset u_
--      insert into public.materiality_survey_rounds
--        (user_id, name, company_name, standard_version, deadline)
--      values (:'u_id', 'verify rpcs', 'Verify Co', 'esrs_2026', current_date + 21)
--      returning id \gset round_
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, invite_name, invite_email)
--      values (:'round_id', :'u_id', 'internal', 'own_workforce', 'Internal Person', 'i@x.test')
--      returning token \gset s1_
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, invite_name, invite_email)
--      values (:'round_id', :'u_id', 'external', 'supplier', 'Supplier Person', 's@x.test')
--      returning token \gset s2_
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, invite_name, invite_email)
--      values (:'round_id', :'u_id', 'external', 'customer', 'Customer Person', 'c@x.test')
--      returning token \gset na_
--    -- (leave the transaction open for the checks below, then ROLLBACK at the end)
--
-- 1) ⚠️ THE ROUTING, WHICH IS THE POINT OF THE FILE. 31 / 31 / 25 — and note that 37 appears
--    NOWHERE: the round holds 37 question rows, and no respondent is shown more than 31 of them:
--    select count(*) from public.materiality_survey_questions where round_id = :'round_id';
--    -- expect 37   (25 non-labour + 12 paired)
--    select jsonb_array_length(public.survey_get(:'s1_token') -> 'questions');   -- expect 31
--    select jsonb_array_length(public.survey_get(:'s2_token') -> 'questions');   -- expect 31
--    select jsonb_array_length(public.survey_get(:'na_token') -> 'questions');   -- expect 25
--    -- 25 is CORRECT, not an error. Confirm it is the six labour pairs that are missing and
--    -- nothing else, by counting the framings (only the twelve labour rows carry one):
--    select count(*) filter (where q ->> 'question_framing' is not null)
--      from jsonb_array_elements(public.survey_get(:'s1_token') -> 'questions') q;  -- expect 6
--    select count(*) filter (where q ->> 'question_framing' is not null)
--      from jsonb_array_elements(public.survey_get(:'na_token') -> 'questions') q;  -- expect 0
--    -- and that s1 and s2 got OPPOSITE sides — the framings must not match:
--    select distinct q ->> 'question_framing'
--      from jsonb_array_elements(public.survey_get(:'s1_token') -> 'questions') q
--     where q ->> 'question_framing' is not null;   -- expect 'in your own workforce'
--    select distinct q ->> 'question_framing'
--      from jsonb_array_elements(public.survey_get(:'s2_token') -> 'questions') q
--     where q ->> 'question_framing' is not null;   -- expect 'for workers in your suppliers'...'
--
-- 2) ⚠️ THE WHITELIST. Read this one rather than trusting it — it is the check portal_get did not
--    have for two months. Exactly three top-level keys, and the withheld ones are absent:
--    select jsonb_object_keys(public.survey_get(:'s1_token'));
--    -- expect exactly: round, respondent, questions, responses
--    select public.survey_get(:'s1_token') -> 'round'      ? 'user_id';           -- f
--    select public.survey_get(:'s1_token') -> 'round'      ? 'standard_version';  -- f
--    select public.survey_get(:'s1_token') -> 'round'      ? 'anonymity_floor';   -- f
--    select public.survey_get(:'s1_token') -> 'round'      ? 'id';                -- f
--    select public.survey_get(:'s1_token') -> 'respondent' ? 'invite_email';      -- f
--    select public.survey_get(:'s1_token') -> 'respondent' ? 'token';             -- f
--    select public.survey_get(:'s1_token') -> 'respondent' ? 'stakeholder_category'; -- f
--    select jsonb_object_keys(public.survey_get(:'s1_token') -> 'round');
--    -- expect exactly: name, company_name, deadline
--    select jsonb_object_keys(public.survey_get(:'s1_token') -> 'respondent');
--    -- expect exactly: display_name
--    select jsonb_object_keys(public.survey_get(:'s1_token') -> 'questions' -> 0);
--    -- expect exactly: question_id, short_name, question_framing, wording, context
--
-- 3) The first-touch side effect, and that it only fires once:
--    select status from public.materiality_survey_respondents where token = :'s1_token';
--    -- expect 'in_progress' (it was 'invited' before the call in step 1)
--
-- 4) Every token refusal is the SAME refusal — a caller cannot tell them apart:
--    savepoint v4; select public.survey_get(gen_random_uuid());  -- ERROR: invalid token
--    rollback to savepoint v4;
--    update public.materiality_survey_respondents set revoked_at = now() where token = :'na_token';
--    savepoint v4; select public.survey_get(:'na_token');        -- ERROR: invalid token (same)
--    rollback to savepoint v4;
--    update public.materiality_survey_respondents
--       set revoked_at = null, expires_at = now() - interval '1 day' where token = :'na_token';
--    savepoint v4; select public.survey_get(:'na_token');        -- ERROR: invalid token (same)
--    rollback to savepoint v4;
--    update public.materiality_survey_respondents
--       set expires_at = now() + interval '90 days', status = 'completed' where token = :'na_token';
--    savepoint v4; select public.survey_get(:'na_token');        -- ERROR: invalid token (same)
--    rollback to savepoint v4;
--    update public.materiality_survey_respondents set status = 'in_progress' where token = :'na_token';
--
-- 5) ⚠️ THE ROUTING REFUSAL ON THE WRITE PATH — the check the counters depend on. Take an S2 labour
--    question and offer it to the internal respondent and to the customer:
--    select id from public.materiality_survey_questions
--     where round_id = :'round_id' and subtopic_code = 'S2.3' \gset q_s2_
--    savepoint v5;
--      select public.survey_save_response(:'s1_token', :'q_s2_id', 2::smallint, false);
--      -- ERROR: ... was never shown to this respondent: stakeholder category own_workforce ...
--    rollback to savepoint v5;
--    savepoint v5;
--      select public.survey_save_response(:'na_token', :'q_s2_id', 2::smallint, false);
--      -- ERROR: ... routes the labour sub-topics to not_asked ...
--    rollback to savepoint v5;
--    -- and the correct respondent succeeds:
--    select public.survey_save_response(:'s2_token', :'q_s2_id', 2::smallint, false);   -- ok
--    -- ⚠️ AND THE ROW REALLY IS ABSENT for the refused ones. A refusal that still wrote would be
--    -- the whole defect:
--    select count(*) from public.materiality_survey_responses
--     where question_id = :'q_s2_id';                                             -- expect 1
--
-- 6) The XOR, all four cases, each with its OWN message rather than a constraint violation:
--    select id from public.materiality_survey_questions
--     where round_id = :'round_id' and subtopic_code = 'E1.1' \gset q_e1_
--    select public.survey_save_response(:'s1_token', :'q_e1_id', 2::smallint, false);      -- ok
--    select public.survey_save_response(:'s1_token', :'q_e1_id', null, true);              -- ok
--    savepoint v6;
--      select public.survey_save_response(:'s1_token', :'q_e1_id', null, false);
--      -- ERROR: A response must carry a value on the 1-3 scale or be recorded as an abstention...
--    rollback to savepoint v6;
--    savepoint v6;
--      select public.survey_save_response(:'s1_token', :'q_e1_id', 2::smallint, true);
--      -- ERROR: An abstention cannot also carry a value (got 2)...
--    rollback to savepoint v6;
--    savepoint v6;
--      select public.survey_save_response(:'s1_token', :'q_e1_id', 0::smallint, false);
--      -- ERROR: value 0 is outside the 1-3 strategic-priority scale...
--    rollback to savepoint v6;
--    -- The upsert kept ONE row and the last good write won (the abstention):
--    select count(*), bool_and(abstained), count(value)
--      from public.materiality_survey_responses
--     where respondent_id = (select id from public.materiality_survey_respondents
--                             where token = :'s1_token')
--       and question_id = :'q_e1_id';                                    -- expect 1 | t | 0
--
-- 7) frozen_at was stamped by the first save and has NOT moved since:
--    select frozen_at is not null as frozen from public.materiality_survey_rounds
--     where id = :'round_id';                                            -- expect t
--    select frozen_at from public.materiality_survey_rounds where id = :'round_id' \gset f_
--    select public.survey_save_response(:'s1_token', :'q_e1_id', 3::smallint, false);
--    select frozen_at = :'f_frozen_at'::timestamptz as unmoved
--      from public.materiality_survey_rounds where id = :'round_id';     -- expect t
--
-- 8) A deselected question is refused:
--    update public.materiality_survey_questions
--       set status = 'excluded', exclusion_reason = 'verify' where id = :'q_e1_id';
--    savepoint v8;
--      select public.survey_save_response(:'s1_token', :'q_e1_id', 1::smallint, false);
--      -- ERROR: Question ... is not part of the current question set for this invitation...
--    rollback to savepoint v8;
--    update public.materiality_survey_questions
--       set status = 'included', exclusion_reason = null where id = :'q_e1_id';
--
-- 9) Submit resolves, and is one-way:
--    select public.survey_submit(:'s2_token');
--    select asked_subtopic_code, resolved_subtopic_code, resolution_basis
--      from public.materiality_survey_responses
--     where respondent_id = (select id from public.materiality_survey_respondents
--                             where token = :'s2_token');
--    -- expect S2.3 | S2.3 | supplier   — resolved is never left null on a submitted row
--    select status, completed_at is not null from public.materiality_survey_respondents
--     where token = :'s2_token';                                         -- expect completed | t
--    savepoint v9;
--      select public.survey_submit(:'s2_token');   -- ERROR: invalid token (one-way, no unlock)
--    rollback to savepoint v9;
--    savepoint v9;
--      select public.survey_get(:'s2_token');      -- ERROR: invalid token (same message)
--    rollback to savepoint v9;
--    savepoint v9;
--      select public.survey_save_response(:'s2_token', :'q_s2_id', 1::smallint, false);
--      -- ERROR: invalid token  (a completed respondent cannot edit)
--    rollback to savepoint v9;
--
-- 10) ⚠️ SUBMIT REFUSES WHEN THE CLASSIFICATION MOVED UNDER THE ANSWERS. Answer as internal, then
--     be reclassified, then try to submit:
--     select id from public.materiality_survey_questions
--      where round_id = :'round_id' and subtopic_code = 'S1.3' \gset q_s1_
--     select public.survey_save_response(:'s1_token', :'q_s1_id', 3::smallint, false);   -- ok
--     update public.materiality_survey_respondents
--        set track = 'external', stakeholder_category = 'supplier' where token = :'s1_token';
--     savepoint v10;
--       select public.survey_submit(:'s1_token');
--       -- ERROR: Cannot submit: 1 answered question(s) were shown under a different routing...
--     rollback to savepoint v10;
--     update public.materiality_survey_respondents
--        set track = 'internal', stakeholder_category = 'own_workforce' where token = :'s1_token';
--     select public.survey_submit(:'s1_token');                                          -- ok
--
-- 11) An empty form is refused rather than served. Deselect everything:
--     update public.materiality_survey_questions
--        set status = 'excluded', exclusion_reason = 'verify' where round_id = :'round_id';
--     savepoint v11;
--       select public.survey_get(:'na_token');
--       -- ERROR: This survey round has no questions to show you...
--     rollback to savepoint v11;
--
--    rollback;   -- ends the setup transaction from the top; nothing above survives
--
-- 12) GRANTS — the RPCs are the sole path, and the helpers are not a second one:
--    select p.proname, p.prosecdef,
--           has_function_privilege('anon',          p.oid, 'execute') as anon,
--           has_function_privilege('authenticated', p.oid, 'execute') as auth,
--           has_function_privilege('service_role',  p.oid, 'execute') as svc
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('survey_get', 'survey_save_response', 'survey_submit',
--                         'materiality_survey_resolve_token', 'materiality_survey_routes_to')
--     order by p.proname;
--    -- expect the three survey_* rows:  prosecdef = t, anon = t, auth = t, svc = f
--    -- expect the two helpers:          anon = f, auth = f, svc = f
--    -- ⚠️ if either helper shows anon = t, the revoke did not take. Re-run it before going further.
--
-- 13) The tables are still unreachable directly — this file must not have widened anything:
--    select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema = 'public' and table_name like 'materiality\_survey\_%'
--       and grantee in ('anon', 'authenticated')
--     group by table_name, grantee order by table_name, grantee;
--    -- expect NO row for anon at all, and NO row for materiality_survey_responses at all
--
-- 14) End-to-end, once a page exists: open a real invitation link as an internal respondent and as
--     a customer. Expect 31 questions and 25 respectively, the S1 framing ("in your own workforce")
--     on the six labour questions of the first and none on the second, the round name and company in
--     the header, "Completing as: <display name>", no email anywhere in the network response, and a
--     saved answer still filled in after a reload.
