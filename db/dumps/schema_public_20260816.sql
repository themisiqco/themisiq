--
-- PostgreSQL database dump
--

\restrict Wbek6ypKBpgEseOhAslrbazrWj8CDl9eGO8dAONLq0LxqqDcAKt8qOzlqfqa3Zq

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: cbam_stamp_processes_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cbam_stamp_processes_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- Stamp the attestation's own timestamp whenever the flag changes value.
  -- Server time, never client-supplied. Distinct from updated_at, which
  -- tracks any change to the row.
  if tg_op = 'INSERT' then
    if new.processes_complete is not null then
      new.processes_complete_declared_at := now();
    end if;
  elsif new.processes_complete is distinct from old.processes_complete then
    new.processes_complete_declared_at :=
      case when new.processes_complete is null then null else now() end;
  end if;

  -- An attestation that the process set is complete is incoherent when there
  -- are no processes. This does NOT verify completeness — nothing can; the
  -- attestation is the operator's assertion. It only rejects the degenerate case.
  if new.processes_complete is true
     and not exists (
       select 1 from public.cbam_production_processes p
       where p.installation_id = new.installation_id
         and p.company_id      = new.company_id
         and p.reporting_period = new.reporting_period
     )
  then
    raise exception
      'processes_complete cannot be true: no processes exist for installation % in reporting period %',
      new.installation_id, new.reporting_period
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


--
-- Name: cbam_verifier_accept_invite(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cbam_verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_updated integer;
  v_valid   boolean;
begin
  -- First acceptance: scoped single-row write, guarded so a previously-accepted
  -- row is never overwritten (accepted_at is null) and only valid rows are hit.
  update public.cbam_verifier_access
     set accepted_at         = now(),
         tos_accepted_at     = now(),
         privacy_accepted_at = now(),
         consent_version     = p_consent_version,
         verifier_email      = coalesce(public.cbam_verifier_access.verifier_email, p_email)
   where token       = p_token
     and status      = 'active'
     and expires_at  > now()
     and revoked_at is null
     and accepted_at is null;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    return jsonb_build_object('status', 'accepted');
  end if;

  -- No write happened. Distinguish an already-accepted (still-valid) row from a
  -- genuinely invalid one (not found / revoked / expired) without leaking which.
  select exists (
    select 1
      from public.cbam_verifier_access
     where token       = p_token
       and status      = 'active'
       and expires_at  > now()
       and revoked_at is null
       and accepted_at is not null
  ) into v_valid;

  if v_valid then
    return jsonb_build_object('status', 'already_accepted');
  end if;

  return jsonb_build_object('status', 'invalid');
end;
$$;


--
-- Name: cbam_verifier_audit_history(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cbam_verifier_audit_history(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_grant   public.cbam_verifier_access%rowtype;
  v_history jsonb;
begin
  -- Load a currently-valid grant (active, unexpired, not revoked).
  select *
    into v_grant
    from public.cbam_verifier_access
   where token       = p_token
     and status      = 'active'
     and expires_at  > now()
     and revoked_at is null
   limit 1;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Consent gate: no history before the verifier has accepted.
  if v_grant.accepted_at is null then
    return jsonb_build_object('status', 'consent_required');
  end if;

  -- Union the two audited tables, each scoped to the grant's tuple via the
  -- tuple carried in the snapshot (coalesce(new,old) => DELETE-safe). Only the
  -- fields the verify page renders are returned.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'table_name', a.table_name,
               'action',     a.action,
               'old_values', a.old_values,
               'new_values', a.new_values,
               'user_email', a.user_email,
               'created_at', a.created_at
             )
             order by a.created_at desc
           ),
           '[]'::jsonb
         )
    into v_history
    from public.audit_log a
   where (
           a.table_name = 'cbam_installation_disclosures'
           and a.record_id = v_grant.installation_id
           and coalesce(a.new_values->>'reporting_period', a.old_values->>'reporting_period')
               = v_grant.reporting_period::text
         )
      or (
           a.table_name = 'cbam_production_processes'
           and coalesce(a.new_values->>'installation_id', a.old_values->>'installation_id')
               = v_grant.installation_id::text
           and coalesce(a.new_values->>'reporting_period', a.old_values->>'reporting_period')
               = v_grant.reporting_period::text
         );

  return jsonb_build_object('status', 'valid', 'history', v_history);
end;
$$;


--
-- Name: cbam_verifier_validate_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cbam_verifier_validate_token(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_grant   public.cbam_verifier_access%rowtype;
  v_inst_name text;
begin
  -- Load the grant only if it is currently valid (active, unexpired, not revoked).
  select *
    into v_grant
    from public.cbam_verifier_access
   where token       = p_token
     and status      = 'active'
     and expires_at  > now()
     and revoked_at is null
   limit 1;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Display context — installation name. Non-sensitive; safe in both
  -- consent_required and valid states. Scoped to the grant's own installation.
  select i.name
    into v_inst_name
    from public.cbam_installations i
   where i.id = v_grant.installation_id
     and i.company_id = v_grant.company_id
   limit 1;

  -- Not yet consented → return display context only, withhold the scope tuple.
  if v_grant.accepted_at is null then
    return jsonb_build_object(
      'status',            'consent_required',
      'verifier_name',     v_grant.verifier_name,
      'installation_name', v_inst_name,
      'reporting_period',  v_grant.reporting_period
    );
  end if;

  -- Consented → return display context PLUS the scope tuple for the route.
  return jsonb_build_object(
    'status',            'valid',
    'verifier_name',     v_grant.verifier_name,
    'installation_name', v_inst_name,
    'reporting_period',  v_grant.reporting_period,
    'installation_id',   v_grant.installation_id,
    'company_id',        v_grant.company_id
  );
end;
$$;


--
-- Name: deal_assessment_get(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deal_assessment_get(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v jsonb;
BEGIN
  -- Target-safe WHITELIST only. Do NOT to_jsonb(d) — that would leak every column
  -- (deal_value, revenue, notes, …). Add a field here only after a privacy review.
  SELECT jsonb_build_object(
           'target_name',    d.target_name,
           'sector',         d.sector,
           'jurisdiction',   d.jurisdiction,
           'location_count', d.location_count,
           'frameworks',     coalesce(d.frameworks, '[]'::jsonb),
           'has_ghg_data',   d.has_ghg_data,
           'has_esg_report', d.has_esg_report,
           'updated_at',     d.updated_at)   -- 8th field: dates the frameworks snapshot (see header)
    INTO v
    FROM deals d
   WHERE d.token = p_token
     AND d.share_enabled = true;   -- opt-in gate: unshared / revoked deals are invisible

  IF v IS NULL THEN
    RAISE EXCEPTION 'invalid token' USING errcode = 'no_data_found';
  END IF;

  RETURN v;
END;
$$;


--
-- Name: enforce_deals_free_tier_cap(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_deals_free_tier_cap() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  has_entitlement boolean;
  had_entitlement boolean;
  existing_count  integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'deals'
      AND e.term_end > now()
  ) INTO has_entitlement;
  IF has_entitlement THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'deals'
  ) INTO had_entitlement;
  SELECT count(*) INTO existing_count
  FROM public.deals d
  WHERE d.user_id = NEW.user_id;
  IF existing_count >= 1 THEN
    IF had_entitlement THEN
      RAISE EXCEPTION 'Your Deals access has expired. Renew to screen more targets.';
    ELSE
      RAISE EXCEPTION 'You have already saved your free deal. Unlock the Deals module to screen more targets.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: enforce_ghg_location_allowance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_ghg_location_allowance() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
DECLARE
  has_active   boolean;
  had_entitlement boolean;
  allowance    integer;
  loc_count    integer;
BEGIN
  -- An ACTIVE GHG pass is required to write an inventory at all.
  -- Absence is the RESTRICTIVE answer here. This is deliberate and is
  -- the opposite of the pre-Aug-2026 behaviour, where a missing row
  -- read as uncapped and let unpaid users save unlimited locations.
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'ghg'
      AND e.term_end > now()
  ) INTO has_active;

  IF NOT has_active THEN
    SELECT EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.user_id = NEW.user_id
        AND e.module_key = 'ghg'
    ) INTO had_entitlement;

    IF had_entitlement THEN
      RAISE EXCEPTION 'Your GHG access has expired. Renew to save changes to your inventory.';
    ELSE
      RAISE EXCEPTION 'Saving a GHG inventory requires the GHG module. Your work is still on screen — purchase to save it.';
    END IF;
  END IF;

  -- Location cap, applied only to customers whose pass is active.
  -- Counted from the payload; an unparseable array is not a licence
  -- question, so it fails open HERE, after the gate above.
  BEGIN
    loc_count := jsonb_array_length(NEW.locations_data);
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  SELECT e.location_allowance INTO allowance
  FROM public.entitlements e
  WHERE e.user_id = NEW.user_id
    AND e.module_key = 'ghg'
    AND e.term_end > now()
  LIMIT 1;

  -- NULL allowance still means uncapped, for Advisory.
  IF allowance IS NOT NULL AND loc_count > allowance THEN
    RAISE EXCEPTION 'Location limit reached for your plan (% of % allowed). Upgrade to add more locations.', loc_count, allowance;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: get_verifier_inventory(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_verifier_inventory(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_access verifier_access%rowtype;
  v_inventory jsonb;
  v_audit jsonb;
begin
  -- validate the token: must exist, be active, and not expired
  select * into v_access from verifier_access
    where token = p_token and status = 'active' and expires_at > now();
  if not found then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  -- the one inventory this token grants - EXPLICIT COLUMN WHITELIST.
  -- A column added to ghg_inventories is NOT disclosed until it is named here. Internal UUIDs
  -- (organization_id / user_id / company_id), status, timestamps, prior-year figures,
  -- employee_count, california_nexus, revenue_millions and both intensities are excluded.
  select jsonb_build_object(
    'company_name',              i.company_name,
    'reporting_year',            i.reporting_year,
    'fiscal_year_end_month',     i.fiscal_year_end_month,
    'boundary_approach',         i.boundary_approach,
    'selected_frameworks',       i.selected_frameworks,
    'scope1_total',              i.scope1_total,
    'scope2_location_total',     i.scope2_location_total,
    'scope2_market_total',       i.scope2_market_total,
    'locations_data',            i.locations_data,
    'workings',                  i.workings,
    'coverage_resolutions',      i.coverage_resolutions,
    'gwp_version',               i.gwp_version,
    'pct_estimated',             i.pct_estimated,
    'comparability_disclosure',  i.comparability_disclosure,
    'factor_editions',           i.factor_editions
  ) into v_inventory
    from ghg_inventories i where i.id = v_access.inventory_id;

  if v_inventory is null then
    return jsonb_build_object('error', 'inventory_not_found');
  end if;

  -- its audit trail (append-only history) - METADATA ONLY, no old_values / new_values.
  -- changed_fields iterates the inventory whitelist and reports only those that actually differ,
  -- so a field the verifier cannot see is never named as having changed.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id',         a.id,
             'action',     a.action,
             'created_at', a.created_at,
             'user_email', a.user_email,
             'changed_fields',
               case when a.action = 'UPDATE' then (
                 select coalesce(jsonb_agg(fld order by fld), '[]'::jsonb)
                 from unnest(array[
                   'company_name', 'reporting_year', 'fiscal_year_end_month',
                   'boundary_approach', 'selected_frameworks',
                   'scope1_total', 'scope2_location_total', 'scope2_market_total',
                   'locations_data', 'workings', 'coverage_resolutions',
                   'gwp_version', 'pct_estimated', 'comparability_disclosure',
                   'factor_editions'
                 ]) as fld
                 -- coalesce both sides to jsonb 'null' so "key absent" and "key present but null"
                 -- compare equal; without it, a column added between two revisions reads as changed.
                 where coalesce(a.old_values -> fld, 'null'::jsonb)
                       is distinct from coalesce(a.new_values -> fld, 'null'::jsonb)
               ) else '[]'::jsonb end
           ) order by a.created_at desc
         ), '[]'::jsonb)
    into v_audit
    from audit_log a
    where a.table_name = 'ghg_inventories' and a.record_id = v_access.inventory_id;

  return jsonb_build_object(
    'inventory', v_inventory,
    'audit', v_audit,
    'verifier', jsonb_build_object('name', v_access.verifier_name, 'email', v_access.verifier_email),
    'expires_at', v_access.expires_at,
    'accepted_at', v_access.accepted_at
  );
end; $$;


--
-- Name: log_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text;
begin
  -- prefer profiles, fall back to auth.users
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, old.id, 'DELETE', to_jsonb(old), null, auth.uid(), v_email);
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), v_email);
    return new;
  else
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.id, 'INSERT', null, to_jsonb(new), auth.uid(), v_email);
    return new;
  end if;
end; $$;


--
-- Name: log_audit_cbam_disclosures(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_audit_cbam_disclosures() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_email text;
begin
  -- actor resolution identical to log_audit(): profiles first, then auth.users
  select email into v_email from public.profiles where id = auth.uid();
  if v_email is null then
    select email into v_email from auth.users where id = auth.uid();
  end if;
  if (tg_op = 'DELETE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, old.installation_id, 'DELETE', to_jsonb(old), null, auth.uid(), v_email);
    return old;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.installation_id, 'UPDATE', to_jsonb(old), to_jsonb(new), auth.uid(), v_email);
    return new;
  else
    insert into public.audit_log(table_name, record_id, action, old_values, new_values, user_id, user_email)
    values (tg_table_name, new.installation_id, 'INSERT', null, to_jsonb(new), auth.uid(), v_email);
    return new;
  end if;
end; $$;


--
-- Name: materiality_survey_generate_questions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_generate_questions() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_missing  int;
  v_inserted int;
begin
  -- ⚠️ FAIL LOUDLY AT CREATION, NOT SILENTLY AT SURVEY TIME. A sub-topic with no display row would
  -- otherwise produce a question with no name — an empty form, which is the failure the gate in the
  -- header exists to prevent, arriving by a different door.
  select count(*) into v_missing
    from public.mr_esrs_subtopics s
    left join public.mr_esrs_subtopic_display d
      on d.subtopic_code = s.code
     and d.standard_version = s.standard_version
   where s.standard_version = new.standard_version
     and d.subtopic_code is null;

  if v_missing > 0 then
    raise exception
      'Cannot generate a question set for %: % sub-topic(s) have no row in '
      'mr_esrs_subtopic_display. Seed the short names first '
      '(20260818_mr_subtopic_display_and_stakeholder_categories.sql).',
      new.standard_version, v_missing;
  end if;

  insert into public.materiality_survey_questions (
    round_id, user_id, questionnaire_version,
    subtopic_code, standard_version, shared_with_subtopic_code,
    status, short_name, question_framing, wording, sort_order
  )
  select
    new.id,
    new.user_id,
    new.questionnaire_version,
    s.code,
    s.standard_version,
    d.shared_with_subtopic_code,
    'included',
    d.short_name,
    d.question_framing,
    -- The default wording the customer then edits freely (§3.1's third layer of authorship). Built
    -- from the house short name and its framing — NEVER from s.label, which is the annex text this
    -- whole layer exists to keep out of a respondent's question.
    d.short_name || coalesce(' ' || d.question_framing, ''),
    -- Global question order. The outer key is the TOPIC's sort_order, because sub-topic sort_order
    -- restarts at 1 within each topic — ordering on it alone would interleave E1.1, E2.1, E3.1.
    row_number() over (order by t.sort_order, s.sort_order)
  from public.mr_esrs_subtopics s
  join public.mr_esrs_subtopic_display d
    on d.subtopic_code = s.code
   and d.standard_version = s.standard_version
  join public.mr_esrs_topics t
    on t.code = s.topic_code
  where s.standard_version = new.standard_version;

  get diagnostics v_inserted = row_count;

  -- A round with no questions is precisely the empty-form failure. It cannot be reached from here
  -- (the CHECK admits only esrs_2026 and the missing-display guard above has already passed), which
  -- is why this is worth keeping: it catches the case where those two assumptions stop holding.
  if v_inserted = 0 then
    raise exception
      'Generated ZERO questions for round % under %. A survey round with no questions renders to a '
      'respondent as an empty form rather than as a refusal; refusing the round instead.',
      new.id, new.standard_version;
  end if;

  return null;   -- AFTER trigger; the return value is ignored
end $$;


--
-- Name: materiality_survey_round_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_round_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.standard_version is distinct from old.standard_version then
    raise exception
      'materiality_survey_rounds.standard_version is fixed at creation (spec v8 §3.3): % -> %. '
      'Changing it would re-point every question in this round at a different sub-topic set. '
      'Create a new round instead.',
      old.standard_version, new.standard_version;
  end if;
  if new.questionnaire_version < old.questionnaire_version then
    raise exception
      'materiality_survey_rounds.questionnaire_version cannot go backwards: % -> %. '
      'Every response records the version it answered; moving the pointer back would make those '
      'records point at wording that is no longer the current wording for that number.',
      old.questionnaire_version, new.questionnaire_version;
  end if;
  return new;
end $$;


--
-- Name: portal_get(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.portal_get(p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v jsonb;
BEGIN
  -- Respondent-safe WHITELISTS only. Do NOT to_jsonb(s) / to_jsonb(c) — that is the
  -- defect this migration removed. Add a field here only after a privacy review.
  SELECT jsonb_build_object(
           'supplier',  jsonb_build_object(
                          'supplier_name',  s.supplier_name,
                          'supplier_email', s.supplier_email,
                          'contact_name',   s.contact_name,
                          'status',         s.status),
           'campaign',  jsonb_build_object(
                          'name',                   c.name,
                          'deadline',               c.deadline,
                          'questionnaire_template', c.questionnaire_template),
           'responses', coalesce(
             (SELECT jsonb_agg(jsonb_build_object(
                       'question_id', r.question_id, 'response', r.response))
                FROM supplier_responses r WHERE r.campaign_supplier_id = s.id),
             '[]'::jsonb))
    INTO v
    FROM campaign_suppliers s
    JOIN supplier_campaigns c ON c.id = s.campaign_id
   WHERE s.token = p_token;

  IF v IS NULL THEN
    RAISE EXCEPTION 'invalid token' USING errcode = 'no_data_found';
  END IF;

  UPDATE campaign_suppliers
     SET status = 'in_progress'
   WHERE token = p_token AND status = 'invited';

  RETURN v;
END;
$$;


--
-- Name: portal_save_response(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.portal_save_response(p_token text, p_section text, p_question_id text, p_response text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  SELECT id, status INTO v_id, v_status
    FROM campaign_suppliers WHERE token = p_token;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'invalid token' USING errcode = 'no_data_found';
  END IF;
  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'questionnaire already submitted';
  END IF;
  INSERT INTO supplier_responses
        (campaign_supplier_id, section, question_id, response, updated_at)
  VALUES (v_id, p_section, p_question_id, p_response, now())
  ON CONFLICT (campaign_supplier_id, question_id)
  DO UPDATE SET response = excluded.response,
                section  = excluded.section,
                updated_at = now();
END;
$$;


--
-- Name: portal_submit(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.portal_submit(p_token text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE campaign_suppliers
     SET status = 'completed', completed_at = now()
   WHERE token = p_token AND status <> 'completed';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid or already-submitted token'
      USING errcode = 'no_data_found';
  END IF;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: sbti_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sbti_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end $$;


--
-- Name: verifier_accept_invite(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_updated integer;
  v_valid   boolean;
begin
  -- First acceptance: scoped single-row write, guarded so a previously-accepted
  -- row is never overwritten (accepted_at is null) and only valid rows are hit.
  update public.verifier_access
     set accepted_at         = now(),
         tos_accepted_at     = now(),
         privacy_accepted_at = now(),
         consent_version     = p_consent_version,
         verifier_email      = coalesce(public.verifier_access.verifier_email, p_email)
   where token       = p_token
     and status      = 'active'
     and expires_at  > now()
     and revoked_at is null
     and accepted_at is null;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    return jsonb_build_object('status', 'accepted');
  end if;

  -- No write happened. Distinguish an already-accepted (still-valid) row from a
  -- genuinely invalid one (not found / revoked / expired) without leaking which.
  select exists (
    select 1
      from public.verifier_access
     where token       = p_token
       and status      = 'active'
       and expires_at  > now()
       and revoked_at is null
       and accepted_at is not null
  ) into v_valid;

  if v_valid then
    return jsonb_build_object('status', 'already_accepted');
  end if;

  return jsonb_build_object('status', 'invalid');
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL,
    old_values jsonb,
    new_values jsonb,
    user_id uuid,
    user_email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaign_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid,
    supplier_name text NOT NULL,
    supplier_email text NOT NULL,
    contact_name text,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    status text DEFAULT 'invited'::text NOT NULL,
    invited_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    reminder_sent_at timestamp with time zone,
    annual_spend numeric,
    spend_currency text DEFAULT 'USD'::text,
    CONSTRAINT campaign_suppliers_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'in_progress'::text, 'completed'::text, 'expired'::text])))
);


--
-- Name: cbam_benchmarks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_benchmarks (
    id bigint NOT NULL,
    cn_code text NOT NULL,
    bm_column text NOT NULL,
    route_indicator text,
    period_band integer,
    value numeric NOT NULL,
    source_cell text NOT NULL,
    CONSTRAINT cbam_benchmarks_bm_column_check CHECK ((bm_column = ANY (ARRAY['A'::text, 'B'::text]))),
    CONSTRAINT cbam_benchmarks_period_band_check CHECK ((period_band = ANY (ARRAY[1, 2]))),
    CONSTRAINT cbam_benchmarks_route_indicator_check CHECK ((route_indicator = ANY (ARRAY['C'::text, 'D'::text, 'E'::text, 'F'::text, 'G'::text, 'H'::text, 'J'::text, 'K'::text, 'L'::text])))
);


--
-- Name: cbam_benchmarks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.cbam_benchmarks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.cbam_benchmarks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cbam_charge_mix; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_charge_mix (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    company_id uuid NOT NULL,
    material_type text NOT NULL,
    mass numeric NOT NULL,
    note text,
    source_doc_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cbam_charge_mix_mass_check CHECK ((mass >= (0)::numeric)),
    CONSTRAINT cbam_charge_mix_material_type_check CHECK ((material_type = ANY (ARRAY['scrap_pre_consumer'::text, 'scrap_post_consumer'::text, 'dri'::text, 'pig_iron_bf'::text, 'pig_iron_smelting_reduction'::text, 'hot_metal'::text, 'ferroalloy'::text, 'other_metallic'::text])))
);


--
-- Name: cbam_cn_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_cn_codes (
    cn_code text NOT NULL
);


--
-- Name: TABLE cbam_cn_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cbam_cn_codes IS 'Distinct CBAM CN codes, derived from cbam_default_values. FK target for cbam_production_processes.cn_code and cbam_precursor_inputs.precursor_cn_code. Populate from each sector seed migration before its commit. Never hand-edit.';


--
-- Name: cbam_cn_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_cn_map (
    cn_prefix text NOT NULL,
    category_code text NOT NULL,
    description text
);


--
-- Name: cbam_default_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_default_values (
    cn_code text NOT NULL,
    country text NOT NULL,
    description text,
    see_direct numeric NOT NULL,
    see_indirect numeric,
    see_total numeric NOT NULL,
    markup_2026 numeric NOT NULL,
    markup_2027 numeric NOT NULL,
    markup_2028_plus numeric NOT NULL,
    cbam_bm_route text,
    source_ref text NOT NULL
);


--
-- Name: cbam_goods_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_goods_categories (
    code text NOT NULL,
    label text NOT NULL,
    greenhouse_gases text[] DEFAULT '{CO2}'::text[] NOT NULL,
    annex_ii_direct_only boolean NOT NULL,
    functional_unit text NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text
);


--
-- Name: cbam_grid_factors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_grid_factors (
    country_code text NOT NULL,
    source_label text NOT NULL,
    ef_co2e_mwh numeric NOT NULL,
    basis_note text,
    source_ref text NOT NULL
);


--
-- Name: cbam_installation_disclosures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_installation_disclosures (
    installation_id uuid NOT NULL,
    company_id uuid NOT NULL,
    reporting_period integer NOT NULL,
    heat_imported boolean,
    heat_exported boolean,
    zero_rated_fuels_used boolean,
    zero_rated_fuels_demonstration text,
    waste_gases_produced_used boolean,
    waste_gases_imported boolean,
    waste_gases_exported boolean,
    co2_capture_used boolean,
    co2_capture_transferred_to text,
    electricity_produced_onsite boolean,
    elec_cogeneration boolean,
    elec_separate_generation boolean,
    elec_source_fossil boolean,
    elec_source_renewable boolean,
    elec_exported_from_process boolean,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    processes_complete boolean,
    processes_complete_declared_at timestamp with time zone,
    CONSTRAINT cbam_disclosures_elec_gate CHECK (((electricity_produced_onsite IS NOT FALSE) OR ((elec_cogeneration IS NULL) AND (elec_separate_generation IS NULL) AND (elec_source_fossil IS NULL) AND (elec_source_renewable IS NULL) AND (elec_exported_from_process IS NULL))))
);


--
-- Name: COLUMN cbam_installation_disclosures.processes_complete; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cbam_installation_disclosures.processes_complete IS 'Operator ATTESTATION that the cbam_production_processes rows for this installation and reporting period are the COMPLETE set. Gates §1.2 items 5 and 6 (installation-level totals) — buildSummaryReport omits them unless this is true, because a partial sum must never be presented as an installation total. Nullable by design: null = not yet declared, false = declared incomplete, true = declared complete. MUST only ever be written by an explicit operator action in the UI — never inferred from row counts, never seeded, never defaulted.';


--
-- Name: COLUMN cbam_installation_disclosures.processes_complete_declared_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cbam_installation_disclosures.processes_complete_declared_at IS 'When processes_complete was last set by the operator. Separate from updated_at (which tracks any row change) so the attestation carries its own audit timestamp.';


--
-- Name: cbam_installations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_installations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    country text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cbam_registry_id text,
    un_locode text,
    address_line1 text,
    address_line2 text,
    city text,
    postcode text,
    latitude numeric,
    longitude numeric,
    CONSTRAINT cbam_installations_country_iso_alpha2 CHECK ((country ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT cbam_installations_latitude_check CHECK (((latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric)))),
    CONSTRAINT cbam_installations_longitude_check CHECK (((longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))))
);


--
-- Name: cbam_operator_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_operator_profile (
    company_id uuid NOT NULL,
    operator_name text,
    registration_no text,
    address_line1 text,
    address_line2 text,
    city text,
    postcode text,
    country text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cbam_origin_countries; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.cbam_origin_countries WITH (security_invoker='true') AS
 SELECT DISTINCT country
   FROM public.cbam_default_values
  WHERE (country <> 'other'::text);


--
-- Name: cbam_precursor_edges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_precursor_edges (
    category_code text NOT NULL,
    precursor_category_code text NOT NULL
);


--
-- Name: cbam_precursor_inputs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_precursor_inputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    company_id uuid NOT NULL,
    precursor_cn_code text NOT NULL,
    precursor_category_code text NOT NULL,
    mass_consumed numeric NOT NULL,
    boundary text NOT NULL,
    provenance text NOT NULL,
    origin_country text NOT NULL,
    see_value numeric,
    verifier_report_id text,
    reporting_period integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    origin_operator_name text,
    origin_installation_name text,
    origin_cbam_registry_id text,
    origin_reporting_period integer,
    CONSTRAINT cbam_precursor_inputs_boundary_check CHECK ((boundary = ANY (ARRAY['joint'::text, 'separate_internal'::text, 'external'::text]))),
    CONSTRAINT cbam_precursor_inputs_mass_consumed_check CHECK ((mass_consumed >= (0)::numeric)),
    CONSTRAINT cbam_precursor_inputs_provenance_check CHECK ((provenance = ANY (ARRAY['computed_here'::text, 'actual_verified'::text, 'default'::text]))),
    CONSTRAINT cbam_precursor_origin_country_iso_alpha2 CHECK ((origin_country ~ '^[A-Z]{2}$'::text)),
    CONSTRAINT cbam_precursor_verified_needs_report CHECK (((provenance <> 'actual_verified'::text) OR (verifier_report_id IS NOT NULL)))
);


--
-- Name: cbam_process_parameters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_process_parameters (
    process_id uuid NOT NULL,
    company_id uuid NOT NULL,
    reducing_agent text,
    reducing_agent_status text,
    alloy_mn_pct numeric,
    alloy_cr_pct numeric,
    alloy_ni_pct numeric,
    alloy_other_pct numeric,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cbam_params_agent_status_consistent CHECK ((((reducing_agent_status = 'provided'::text) AND (reducing_agent IS NOT NULL)) OR ((reducing_agent_status = 'not_known'::text) AND (reducing_agent IS NULL)) OR ((reducing_agent_status IS NULL) AND (reducing_agent IS NULL)))),
    CONSTRAINT cbam_process_parameters_alloy_cr_pct_check CHECK (((alloy_cr_pct IS NULL) OR ((alloy_cr_pct >= (0)::numeric) AND (alloy_cr_pct <= (100)::numeric)))),
    CONSTRAINT cbam_process_parameters_alloy_mn_pct_check CHECK (((alloy_mn_pct IS NULL) OR ((alloy_mn_pct >= (0)::numeric) AND (alloy_mn_pct <= (100)::numeric)))),
    CONSTRAINT cbam_process_parameters_alloy_ni_pct_check CHECK (((alloy_ni_pct IS NULL) OR ((alloy_ni_pct >= (0)::numeric) AND (alloy_ni_pct <= (100)::numeric)))),
    CONSTRAINT cbam_process_parameters_alloy_other_pct_check CHECK (((alloy_other_pct IS NULL) OR ((alloy_other_pct >= (0)::numeric) AND (alloy_other_pct <= (100)::numeric)))),
    CONSTRAINT cbam_process_parameters_reducing_agent_status_check CHECK ((reducing_agent_status = ANY (ARRAY['provided'::text, 'not_known'::text])))
);


--
-- Name: cbam_production_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_production_processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    installation_id uuid NOT NULL,
    company_id uuid NOT NULL,
    category_code text NOT NULL,
    route_code text,
    activity_level numeric NOT NULL,
    reporting_period integer NOT NULL,
    calc_mode text DEFAULT 'actual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cn_code text NOT NULL,
    electricity_consumed numeric,
    steel_grade text,
    precursor_declaration text DEFAULT 'unknown'::text NOT NULL,
    precursor_declaration_reason text,
    precursor_declaration_note text,
    precursor_declared_at timestamp with time zone,
    CONSTRAINT cbam_pp_precursor_declaration_coherent CHECK ((((precursor_declaration = 'none'::text) AND (precursor_declaration_reason IS NOT NULL) AND (precursor_declared_at IS NOT NULL)) OR ((precursor_declaration = 'unknown'::text) AND (precursor_declaration_reason IS NULL) AND (precursor_declaration_note IS NULL) AND (precursor_declared_at IS NULL)))),
    CONSTRAINT cbam_pp_precursor_declaration_values CHECK ((precursor_declaration = ANY (ARRAY['unknown'::text, 'none'::text]))),
    CONSTRAINT cbam_pp_precursor_other_needs_note CHECK (((precursor_declaration_reason <> 'other'::text) OR ((precursor_declaration_note IS NOT NULL) AND (length(TRIM(BOTH FROM precursor_declaration_note)) > 0)))),
    CONSTRAINT cbam_pp_precursor_reason_values CHECK (((precursor_declaration_reason IS NULL) OR (precursor_declaration_reason = ANY (ARRAY['joint_production'::text, 'scrap_only_charge'::text, 'no_cbam_precursors'::text, 'other'::text])))),
    CONSTRAINT cbam_production_processes_activity_level_check CHECK ((activity_level > (0)::numeric)),
    CONSTRAINT cbam_production_processes_calc_mode_check CHECK ((calc_mode = ANY (ARRAY['actual'::text, 'default'::text, 'combined'::text]))),
    CONSTRAINT cbam_production_processes_electricity_consumed_check CHECK (((electricity_consumed IS NULL) OR (electricity_consumed >= (0)::numeric))),
    CONSTRAINT cbam_production_processes_reporting_period_check CHECK ((reporting_period >= 2026)),
    CONSTRAINT cbam_production_processes_steel_grade_check CHECK (((steel_grade IS NULL) OR (steel_grade = ANY (ARRAY['carbon'::text, 'low_alloy'::text, 'high_alloy'::text]))))
);


--
-- Name: cbam_production_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_production_routes (
    category_code text NOT NULL,
    route_code text NOT NULL,
    boundary_note text
);


--
-- Name: cbam_see_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_see_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    company_id uuid NOT NULL,
    cn_code text NOT NULL,
    see_total numeric NOT NULL,
    ae_g numeric NOT NULL,
    precursor_contribution numeric NOT NULL,
    default_compared numeric,
    delta_vs_default numeric,
    workings jsonb NOT NULL,
    unresolved jsonb DEFAULT '[]'::jsonb NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    see_direct numeric NOT NULL,
    see_indirect numeric NOT NULL,
    sefa numeric,
    sfa_proc numeric,
    sefa_precursor_contrib numeric,
    sefa_status text,
    default_share_direct numeric,
    default_share_indirect numeric,
    CONSTRAINT cbam_see_records_default_share_direct_check CHECK (((default_share_direct IS NULL) OR ((default_share_direct >= (0)::numeric) AND (default_share_direct <= (1)::numeric)))),
    CONSTRAINT cbam_see_records_default_share_indirect_check CHECK (((default_share_indirect IS NULL) OR ((default_share_indirect >= (0)::numeric) AND (default_share_indirect <= (1)::numeric)))),
    CONSTRAINT cbam_see_records_sefa_status_check CHECK (((sefa_status IS NULL) OR (sefa_status = ANY (ARRAY['computed'::text, 'not_determinable_cscf_pending'::text])))),
    CONSTRAINT cbam_see_sefa_status_consistent CHECK ((((sefa_status = 'computed'::text) AND (sefa IS NOT NULL) AND (sfa_proc IS NOT NULL) AND (sefa_precursor_contrib IS NOT NULL)) OR ((sefa_status = 'not_determinable_cscf_pending'::text) AND (sefa IS NULL) AND (sfa_proc IS NULL) AND (sefa_precursor_contrib IS NULL)) OR ((sefa_status IS NULL) AND (sefa IS NULL) AND (sfa_proc IS NULL) AND (sefa_precursor_contrib IS NULL))))
);


--
-- Name: cbam_sefa_params; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_sefa_params (
    year integer NOT NULL,
    cbam_factor numeric NOT NULL,
    cscf numeric,
    cscf_status text DEFAULT 'pending'::text NOT NULL,
    source_ref text NOT NULL,
    note text,
    CONSTRAINT cbam_sefa_params_cbam_factor_check CHECK (((cbam_factor >= (0)::numeric) AND (cbam_factor <= (1)::numeric))),
    CONSTRAINT cbam_sefa_params_cscf_check CHECK (((cscf IS NULL) OR ((cscf > (0)::numeric) AND (cscf <= (1)::numeric)))),
    CONSTRAINT cbam_sefa_params_cscf_status_check CHECK ((cscf_status = ANY (ARRAY['pending'::text, 'published'::text, 'not_applicable'::text])))
);


--
-- Name: cbam_source_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_source_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    file_path text NOT NULL,
    file_name text NOT NULL,
    file_size_kb numeric,
    mime_type text,
    document_type text,
    notes text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cbam_source_streams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_source_streams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    process_id uuid NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    stream_kind text NOT NULL,
    activity_data numeric NOT NULL,
    cc_mode text NOT NULL,
    carbon_content numeric,
    emission_factor numeric,
    ncv numeric,
    biomass_fraction numeric DEFAULT 0 NOT NULL,
    source_doc_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cbam_source_streams_biomass_fraction_check CHECK (((biomass_fraction >= (0)::numeric) AND (biomass_fraction <= (1)::numeric))),
    CONSTRAINT cbam_source_streams_cc_mode_check CHECK ((cc_mode = ANY (ARRAY['direct'::text, 'ef_per_t'::text, 'ef_per_tj'::text]))),
    CONSTRAINT cbam_source_streams_stream_kind_check CHECK ((stream_kind = ANY (ARRAY['fuel'::text, 'process_material'::text, 'output'::text])))
);


--
-- Name: cbam_verifier_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cbam_verifier_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    installation_id uuid NOT NULL,
    company_id uuid NOT NULL,
    reporting_period integer NOT NULL,
    customer_user_id uuid NOT NULL,
    verifier_email text,
    verifier_name text,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    accepted_at timestamp with time zone,
    tos_accepted_at timestamp with time zone,
    privacy_accepted_at timestamp with time zone,
    consent_version text,
    CONSTRAINT cbam_verifier_access_period_chk CHECK ((reporting_period >= 2026))
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_name text,
    sector text,
    revenue numeric,
    jurisdiction text,
    deal_type text,
    deal_value numeric,
    currency text,
    has_ghg_data boolean,
    has_esg_report boolean,
    notes text,
    frameworks jsonb,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    share_enabled boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    location_count integer,
    employee_count integer,
    total_assets numeric,
    CONSTRAINT deals_employee_count_nonneg CHECK (((employee_count IS NULL) OR (employee_count >= 0))),
    CONSTRAINT deals_total_assets_nonneg CHECK (((total_assets IS NULL) OR (total_assets >= (0)::numeric)))
);


--
-- Name: COLUMN deals.employee_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.employee_count IS 'Headcount for the employee limb of multi-limb thresholds (SECR, Canada S-211, and CSRD/CS3D once Omnibus constants are verified). NULL = undeclared (limb not assessed, outcome may be indeterminate); 0 = declared zero (limb definitively not met). Measure basis is per-instrument — see THRESHOLD_TESTS limb.basis in lib/deals/assessment.ts.';


--
-- Name: COLUMN deals.total_assets; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.deals.total_assets IS 'Balance-sheet total for the assets limb. Denominated in deals.currency. NULL = undeclared (limb not assessed); 0 = declared zero. Measure basis is per-instrument — see THRESHOLD_TESTS limb.basis in lib/deals/assessment.ts.';


--
-- Name: entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entitlements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    module_key text NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    location_allowance integer,
    term_start timestamp with time zone NOT NULL,
    term_end timestamp with time zone NOT NULL
);


--
-- Name: COLUMN entitlements.location_allowance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.entitlements.location_allowance IS 'GHG location ceiling, written by checkout/create-invoice from GHG_TIERS via locationAllowanceForTier(). Live model: Essentials 3 / Professional 15 / Advisory NULL (uncapped). NULL = uncapped, enforced by enforce_ghg_location_allowance(). Source of truth is lib/pricing.ts GHG_TIERS — this comment describes it, it does not define it.';


--
-- Name: ghg_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ghg_entries (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    inventory_id uuid,
    scope text NOT NULL,
    category text NOT NULL,
    source_name text NOT NULL,
    fuel_type text,
    activity_data numeric,
    activity_unit text,
    emission_factor numeric,
    emission_factor_source text,
    emission_factor_year integer,
    gwp_source text DEFAULT 'IPCC AR4'::text,
    co2_mt numeric DEFAULT 0,
    ch4_mt numeric DEFAULT 0,
    n2o_mt numeric DEFAULT 0,
    hfc_mt numeric DEFAULT 0,
    pfc_mt numeric DEFAULT 0,
    sf6_mt numeric DEFAULT 0,
    total_co2e numeric DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ghg_inventories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ghg_inventories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    organization_id uuid,
    reporting_year integer NOT NULL,
    period_start date,
    period_end date,
    boundary_approach text DEFAULT 'operational_control'::text,
    status text DEFAULT 'in_progress'::text,
    scope1_total numeric DEFAULT 0,
    scope2_location_total numeric DEFAULT 0,
    scope2_market_total numeric DEFAULT 0,
    revenue_millions numeric,
    scope1_intensity numeric,
    scope2_intensity numeric,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    company_name text,
    selected_frameworks text[],
    california_nexus boolean DEFAULT false,
    prior_year_s1 numeric DEFAULT 0,
    prior_year_s2 numeric DEFAULT 0,
    employee_count numeric DEFAULT 0,
    locations_data jsonb,
    workings jsonb,
    fiscal_year_end_month smallint DEFAULT 12 NOT NULL,
    gwp_version text,
    company_id uuid,
    coverage_resolutions jsonb DEFAULT '[]'::jsonb NOT NULL,
    pct_estimated numeric,
    comparability_disclosure jsonb,
    factor_editions jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT ghg_inventories_gwp_version_chk CHECK (((gwp_version IS NULL) OR (gwp_version = ANY (ARRAY['AR4'::text, 'AR5'::text, 'AR6'::text]))))
);


--
-- Name: COLUMN ghg_inventories.coverage_resolutions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ghg_inventories.coverage_resolutions IS 'Coverage resolutions (extrapolate/duplicate/straddle) elected by the user. Read by applyResolutions() to derive the figure a fuel field holds, and by buildWorkings() to emit the audit row that explains it. Without this, a grossed-up figure persists with no record of why — and silently reverts on the next proposal edit.';


--
-- Name: COLUMN ghg_inventories.pct_estimated; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ghg_inventories.pct_estimated IS 'Share of this inventory''s Scope 1+2 figure that is estimated rather than evidenced, 0-100. Computed at save from coverage_resolutions. NULL = not computed (legacy row) — NULL is an absence, not zero. Read by loadSeries so SBTi can disclose the estimated fraction of a baseline; a target anchored to a 25%-estimated baseline is legitimate under SBTi ONLY if disclosed.';


--
-- Name: COLUMN ghg_inventories.comparability_disclosure; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ghg_inventories.comparability_disclosure IS 'Year-over-year comparability disclosure (ISO 14064-3:2019 cl. 6.3.1.5). NULL means the question was never put to the customer - not that nothing changed. Holds the observation as shown to the customer, their answer, and the detection basis at the time of answering.';


--
-- Name: COLUMN ghg_inventories.factor_editions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ghg_inventories.factor_editions IS 'Emission-factor editions that priced this inventory, keyed by jurisdiction then family (combustion / electricity), each holding {source, edition}. The electricity edition comes from getGridFactor().usedYear, NOT the citation string: EF_SOURCES.electricity_uk is deliberately year-neutral because GRID_EF.UK holds two editions, so the citation cannot distinguish DEFRA 2025 from 2026. An empty object means the inventory predates this column - its editions are NOT recoverable, because the factor tables are code and nothing recorded which revision was live at save. Empty must warn, never block, and never read as consistent.';


--
-- Name: ghg_monthly_emissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ghg_monthly_emissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    company_id uuid,
    reporting_year integer NOT NULL,
    period_month date NOT NULL,
    scope smallint NOT NULL,
    location_name text,
    fuel_type text NOT NULL,
    activity_value numeric,
    activity_unit text,
    tco2e numeric NOT NULL,
    gwp_version text DEFAULT 'AR6'::text NOT NULL,
    ef_source text,
    source_doc_id text,
    period_start date,
    period_end date,
    pct_in_month numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ghg_monthly_emissions_scope_check CHECK ((scope = ANY (ARRAY[1, 2])))
);


--
-- Name: materiality_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    company_name text,
    mode text DEFAULT 'csrd'::text NOT NULL,
    industry_code text,
    region_codes text[] DEFAULT '{}'::text[] NOT NULL,
    jurisdiction_codes text[] DEFAULT '{}'::text[] NOT NULL,
    asset_profile text DEFAULT 'inland'::text,
    scenario_code text,
    horizon text DEFAULT 'medium'::text,
    impact_overrides jsonb DEFAULT '{}'::jsonb NOT NULL,
    results jsonb,
    workings jsonb,
    model_version text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    standard_version text,
    CONSTRAINT materiality_assessments_standard_version_check CHECK ((standard_version = ANY (ARRAY['esrs_2023'::text, 'esrs_2023_reliefs'::text, 'esrs_2026'::text])))
);


--
-- Name: COLUMN materiality_assessments.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_assessments.standard_version IS 'Which ESRS version this assessment was prepared under. NULL means NOT STATED — a real state, never an assumed version (Art. 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state it, and an assumed value would be a false statement about which law was applied). Historical rows were backfilled to esrs_2023 when this column was created; that backfill is one-shot and must never be repeated. Mirrors model_version: also present as workings.input.standardVersion.';


--
-- Name: materiality_survey_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_survey_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    user_id uuid NOT NULL,
    questionnaire_version integer NOT NULL,
    subtopic_code text,
    standard_version text NOT NULL,
    shared_with_subtopic_code text,
    status text DEFAULT 'included'::text NOT NULL,
    exclusion_reason text,
    short_name text NOT NULL,
    question_framing text,
    wording text NOT NULL,
    context text,
    sort_order smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_survey_questions_exclusion_reason_required CHECK (((status = 'included'::text) OR ((exclusion_reason IS NOT NULL) AND (length(btrim(exclusion_reason)) > 0)))),
    CONSTRAINT materiality_survey_questions_shared_needs_subtopic CHECK (((shared_with_subtopic_code IS NULL) OR (subtopic_code IS NOT NULL))),
    CONSTRAINT materiality_survey_questions_shared_not_self CHECK (((shared_with_subtopic_code IS NULL) OR (shared_with_subtopic_code <> subtopic_code))),
    CONSTRAINT materiality_survey_questions_status_check CHECK ((status = ANY (ARRAY['included'::text, 'excluded'::text])))
);


--
-- Name: TABLE materiality_survey_questions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_survey_questions IS 'The frozen question set for one (round, questionnaire_version). A row exists for ALL 37 esrs_2026 sub-topics from round creation — deselection sets status=''excluded'' with a reason and is reported as "considered and excluded" (spec v8 §3.2, ESRS 2 IRO-1). Absence never means deselected. Wording/short_name/framing are SNAPSHOTS: a later re-seed of mr_esrs_subtopic_display changes future rounds and must not restate a past one.';


--
-- Name: COLUMN materiality_survey_questions.subtopic_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_questions.subtopic_code IS 'NULL = an entity-specific matter outside Appendix A''s list, excluded from the matrix roll-up (§3.2). The composite FK is MATCH SIMPLE, so NULL satisfies it without a lookup.';


--
-- Name: COLUMN materiality_survey_questions.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_questions.status IS 'included | excluded. NEVER expressed as row absence. Also an input to the DERIVED n_asked counter (§3.0.1): a respondent was asked Q only if Q is included, so a question deleted rather than excluded would silently shrink the denominator of every historical aggregate.';


--
-- Name: materiality_survey_respondents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_survey_respondents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    track text NOT NULL,
    stakeholder_category text NOT NULL,
    function_department text,
    seniority_band text,
    site_region text,
    value_chain_position text,
    invite_email text,
    invite_name text,
    status text DEFAULT 'invited'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    invited_at timestamp with time zone DEFAULT now() NOT NULL,
    reminder_sent_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_survey_respondents_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'in_progress'::text, 'completed'::text, 'revoked'::text, 'expired'::text]))),
    CONSTRAINT materiality_survey_respondents_value_chain_position_check CHECK (((value_chain_position IS NULL) OR (value_chain_position = ANY (ARRAY['own_operations'::text, 'upstream'::text, 'downstream'::text]))))
);


--
-- Name: TABLE materiality_survey_respondents; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_survey_respondents IS 'Who was invited to a survey round, with the track and stakeholder category that drive S1/S2 routing (spec v8 §3.0.1) and the §4 engagement attributes ESRS 2 SBM-2 requires. Lifecycle is cbam_verifier_access''s (expires_at, revoked_at, status gate), NOT the supplier portal''s never-expiring never-revocable token. invite_email lives here and is never copied onto a response.';


--
-- Name: COLUMN materiality_survey_respondents.stakeholder_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_respondents.stakeholder_category IS 'FK to mr_stakeholder_categories. Drives the labour routing for S1.1-6 / S2.1-6 and nothing else; every other sub-topic is asked of every respondent. The composite FK on (stakeholder_category, track) is what stops an internal respondent carrying an external category and being misrouted with no error.';


--
-- Name: COLUMN materiality_survey_respondents.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_respondents.expires_at IS 'Copied from cbam_verifier_access, including the 90-day default. The supplier portal''s token never expires and cannot be revoked; that is the one part of its pattern this survey deliberately does not reuse.';


--
-- Name: materiality_survey_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_survey_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    respondent_id uuid NOT NULL,
    question_id uuid NOT NULL,
    questionnaire_version integer NOT NULL,
    standard_version text NOT NULL,
    asked_subtopic_code text,
    resolved_subtopic_code text,
    resolution_basis text,
    value smallint,
    abstained boolean DEFAULT false NOT NULL,
    free_text text,
    track text NOT NULL,
    stakeholder_category text NOT NULL,
    function_department text,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_survey_responses_value_check CHECK (((value >= 1) AND (value <= 3))),
    CONSTRAINT materiality_survey_responses_value_xor_abstained CHECK (((abstained AND (value IS NULL)) OR ((NOT abstained) AND (value IS NOT NULL))))
);


--
-- Name: TABLE materiality_survey_responses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_survey_responses IS 'One screening answer per respondent per question. A ROW''S ABSENCE MEANS NO ANSWER WAS RECORDED — it does NOT mean "not asked". n_asked is DERIVED from the frozen question set and the category routing (spec v8 §3.0.1), never counted here, because absence cannot distinguish "never shown" from "shown and skipped" and partial submission is permitted. No grant to anon or authenticated: the customer reaches these rows only through the aggregation RPC, which applies the round''s anonymity_floor.';


--
-- Name: COLUMN materiality_survey_responses.asked_subtopic_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_responses.asked_subtopic_code IS 'What this respondent was SHOWN — the evidence record. Kept alongside resolved_subtopic_code rather than instead of it: storing only the resolution would store an inference as though it were the answer.';


--
-- Name: COLUMN materiality_survey_responses.resolved_subtopic_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_responses.resolved_subtopic_code IS 'S1.x or S2.x, written AT SUBMIT from the respondent''s stakeholder category. Stored rather than re-derived so a later change to the routing rule cannot silently restate historical answers.';


--
-- Name: COLUMN materiality_survey_responses.resolution_basis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_responses.resolution_basis IS 'The mr_stakeholder_categories.code that produced resolved_subtopic_code. The column that makes the S1/S2 resolution auditable instead of magic — and the reason a category''s labour_routing must never be edited in place: the code recorded here would then name a rule that was not the one applied.';


--
-- Name: COLUMN materiality_survey_responses.value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_responses.value IS '1-3 on the §5.1 maturity scale, or NULL when abstained. NEVER 0 and never a defaulted low — the same invariant as the GHG engine''s declared_unquantified and the hazard layer''s band:''unknown''. The XOR constraint with `abstained` is what makes it impossible to store a row that asserts an answer it does not have.';


--
-- Name: COLUMN materiality_survey_responses.abstained; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_responses.abstained IS '"Not enough visibility to assess" — a RECORDED ANSWER, not a missing one, and reported as a count in its own right (§6.1). Distinct from a skipped question (no row) and from a not-asked question (routing; also no row, and derived rather than stored). Folding any of the three together corrupts the abstention finding in the same direction: it makes the company look blinder than the evidence says.';


--
-- Name: materiality_survey_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_survey_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    company_name text,
    standard_version text NOT NULL,
    questionnaire_version integer DEFAULT 1 NOT NULL,
    frozen_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    deadline date,
    anonymity_floor smallint DEFAULT 3 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_survey_rounds_anonymity_floor_check CHECK ((anonymity_floor >= 1)),
    CONSTRAINT materiality_survey_rounds_questionnaire_version_check CHECK ((questionnaire_version >= 1)),
    CONSTRAINT materiality_survey_rounds_standard_version_check CHECK ((standard_version = 'esrs_2026'::text)),
    CONSTRAINT materiality_survey_rounds_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text])))
);


--
-- Name: TABLE materiality_survey_rounds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_survey_rounds IS 'One stakeholder screening survey round. Carries TWO independent versions (spec v8 §3.3): standard_version, fixed at creation by trigger and CHECK-constrained to esrs_2026 only — the GATE, because mr_esrs_subtopics has no 2023 rows and a round built against one would render as an empty form; and questionnaire_version, the customer''s own wording, which freezes on first response.';


--
-- Name: COLUMN materiality_survey_rounds.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_rounds.standard_version IS 'Which ESRS taxonomy the questions hang off. FIXED AT CREATION — enforced by the materiality_survey_rounds_guard trigger, because "can never change" is a constraint and not a convention: changing it would re-point every question at a different sub-topic set. CHECK-constrained to esrs_2026 alone; see the migration header for the three ordered steps required to widen it.';


--
-- Name: COLUMN materiality_survey_rounds.frozen_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_rounds.frozen_at IS 'When the first response arrived and the question set stopped being editable. NULL = still editable. An edit after this is a copy-on-write bump to questionnaire_version N+1, never an UPDATE of a frozen version''s question rows.';


--
-- Name: COLUMN materiality_survey_rounds.anonymity_floor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_rounds.anonymity_floor IS 'Minimum n below which an aggregate cell is suppressed. Per round, not global, so raising it later cannot silently restate a historical round''s published figures. Spec v8 §9 decision 4 proposes 3 and remains open; this column does not prejudge it.';


--
-- Name: mr_asset_modifiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_asset_modifiers (
    asset_profile text NOT NULL,
    hazard text NOT NULL,
    modifier numeric NOT NULL
);


--
-- Name: mr_esrs_disclosure_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_esrs_disclosure_requirements (
    dr_code text NOT NULL,
    standard_version text NOT NULL,
    topic_code text NOT NULL,
    title text NOT NULL,
    datapoints text,
    sort_order smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_esrs_disclosure_requirements_standard_version_check CHECK ((standard_version = ANY (ARRAY['esrs_2023'::text, 'esrs_2023_reliefs'::text, 'esrs_2026'::text])))
);


--
-- Name: TABLE mr_esrs_disclosure_requirements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mr_esrs_disclosure_requirements IS 'Per-standard-version ESRS disclosure requirements. Exists because ESRS (2026) RENUMBERED the DRs — two were inserted into E1 at positions 2 and 3 and everything below shifted, so E1-5 means "Energy consumption and mix" under 2023 and "Actions and resources" under 2026. Codes still resolve either way, so a report printing the wrong vintage does not fail, it sends a preparer to collect the wrong data. esrs_2026 (64 rows) is pattern-extracted from C(2026) 5010 Annex I via docs/reference/drs2026.tsv. esrs_2023 (61 rows) is MIGRATED FROM THE IN-REPO ESRS_DR_MAP CONSTANT — hand-authored, curated (S1 carries 8 of the standard''s 17), and of UNVERIFIED fidelity to Del. Reg. (EU) 2023/2772.';


--
-- Name: COLUMN mr_esrs_disclosure_requirements.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_disclosure_requirements.standard_version IS 'Which ESRS version this requirement belongs to. Three values coexist per Art. 2(1) of the 2026 delegated act; Art. 2(2) requires the undertaking to state which it applied for FY2026.';


--
-- Name: COLUMN mr_esrs_disclosure_requirements.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_disclosure_requirements.title IS 'Requirement heading as printed by the named standard version. esrs_2026 titles are pattern-extracted from the adopted C(2026) 5010 Annex I text, with three wrapped headings repaired against the body and curly apostrophes normalised to straight. esrs_2023 titles come from the ESRS_DR_MAP constant and are ThemisIQ''s wording, not the instrument''s.';


--
-- Name: COLUMN mr_esrs_disclosure_requirements.datapoints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_disclosure_requirements.datapoints IS 'ThemisIQ-authored summary of what the requirement obliges a preparer to collect. NOT annex text. NULL for every esrs_2026 row: the 2026 equivalents must be written against renumbered and rescoped requirements, which is judgement, not transcription. NULL MUST RENDER AS ABSENT — an empty cell under a "data to collect" heading reads as "nothing to collect", which is a finding this column cannot support.';


--
-- Name: COLUMN mr_esrs_disclosure_requirements.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_disclosure_requirements.sort_order IS 'Display order WITHIN a (topic_code, standard_version) group, restarting at 1 for each — same convention as mr_esrs_subtopics. Not a global rank.';


--
-- Name: mr_esrs_subtopic_display; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_esrs_subtopic_display (
    subtopic_code text NOT NULL,
    standard_version text NOT NULL,
    short_name text NOT NULL,
    question_framing text,
    shared_with_subtopic_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_esrs_subtopic_display_shared_not_self CHECK (((shared_with_subtopic_code IS NULL) OR (shared_with_subtopic_code <> subtopic_code))),
    CONSTRAINT mr_esrs_subtopic_display_short_name_check CHECK (((length(btrim(short_name)) >= 1) AND (length(btrim(short_name)) <= 60))),
    CONSTRAINT mr_esrs_subtopic_display_standard_version_check CHECK ((standard_version = ANY (ARRAY['esrs_2023'::text, 'esrs_2023_reliefs'::text, 'esrs_2026'::text])))
);


--
-- Name: TABLE mr_esrs_subtopic_display; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mr_esrs_subtopic_display IS 'ThemisIQ HOUSE COPY for presenting an ESRS sub-topic to a human: a short name, the S1/S2 question framing, and the S1.x<->S2.x pairing. NOT transcribed law — nothing here may be cited as the instrument''s wording, and the verbatim label in mr_esrs_subtopics always travels to the report alongside it. Exists because the annex label is unusable as question wording (S1.5 is 213 characters) and cannot be shortened in place, since 20260815_mr_esrs_subtopics.sql is the transcription of record and a replay would revert any edit.';


--
-- Name: COLUMN mr_esrs_subtopic_display.short_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopic_display.short_name IS 'ThemisIQ-authored display name, <= 60 characters. The length CHECK is the point of the table, not house style: without it the first person to paste the annex text back in undoes the reason for the file with no error.';


--
-- Name: COLUMN mr_esrs_subtopic_display.question_framing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopic_display.question_framing IS 'Whose instance of this sub-topic the question asks about. NULL on the 25 rows needing no framing; set on the twelve S1/S2 rows, where two byte-identical short names are otherwise indistinguishable. Spec v8 §3.0.1: ask once per respondent, AUTHOR TWICE.';


--
-- Name: COLUMN mr_esrs_subtopic_display.shared_with_subtopic_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopic_display.shared_with_subtopic_code IS 'The S1.x<->S2.x pairing, stated as DATA. Appendix A shares one sub-topic set between S1 and S2, but this database holds twelve independent rows (spec §11.2) with no relation between them, so the pairing must be authored. It must NEVER be derived at runtime by string manipulation — 20260815_mr_esrs_subtopics.sql''s verify block does exactly that, which is correct for a one-off check and a defect as a routing rule.';


--
-- Name: COLUMN mr_esrs_subtopic_display.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopic_display.updated_at IS 'Written by the BEFORE UPDATE trigger; the app must NEVER set it. Present here and deliberately ABSENT from mr_esrs_subtopics: this table is house copy corrected in place, that one is a transcription that gets a new standard_version row instead of an edit.';


--
-- Name: mr_esrs_subtopics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_esrs_subtopics (
    code text NOT NULL,
    topic_code text NOT NULL,
    label text NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    standard_version text NOT NULL,
    parent_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_esrs_subtopics_parent_not_self CHECK (((parent_code IS NULL) OR (parent_code <> code))),
    CONSTRAINT mr_esrs_subtopics_standard_version_check CHECK ((standard_version = ANY (ARRAY['esrs_2023'::text, 'esrs_2023_reliefs'::text, 'esrs_2026'::text])))
);


--
-- Name: TABLE mr_esrs_subtopics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mr_esrs_subtopics IS 'ESRS sub-topics beneath the ten topical standards, versioned by standard_version. Seeded for esrs_2026 from Commission Delegated Regulation C(2026) 5010 final, Annex I, ESRS 1 Appendix A (adopted 3 Jul 2026). Appendix A is NON-BINDING GUIDANCE and is not a substitute for the materiality process: a row here is a candidate to assess, never a determination.';


--
-- Name: COLUMN mr_esrs_subtopics.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopics.standard_version IS 'Which ESRS version this row belongs to. Three values coexist per Art. 2(1) of the delegated act; Art. 2(2) requires the undertaking to state which it applied for FY2026. Only esrs_2026 is seeded.';


--
-- Name: COLUMN mr_esrs_subtopics.parent_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopics.parent_code IS 'Nullable self-reference for a third level. Null for every esrs_2026 row (that taxonomy is two levels). Composite FK: a parent must share the child''s standard_version.';


--
-- Name: mr_esrs_topic_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_esrs_topic_labels (
    topic_code text NOT NULL,
    standard_version text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_esrs_topic_labels_standard_version_check CHECK ((standard_version = ANY (ARRAY['esrs_2023'::text, 'esrs_2023_reliefs'::text, 'esrs_2026'::text])))
);


--
-- Name: TABLE mr_esrs_topic_labels; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mr_esrs_topic_labels IS 'Per-standard-version display names for the ten ESRS topical standards. mr_esrs_topics keeps ten rows and a single-column PK; only the names are versioned, because the codes are stable across both standards (spec §11.2). Seeded for esrs_2026 only — esrs_2023 and esrs_2023_reliefs await transcription from Del. Reg. (EU) 2023/2772, ESRS 1 AR 16, and are served meanwhile by the pre-versioning fallback to mr_esrs_topics.label.';


--
-- Name: COLUMN mr_esrs_topic_labels.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_topic_labels.standard_version IS 'Which ESRS version this name belongs to. Three values coexist per Art. 2(1) of the 2026 delegated act; Art. 2(2) requires the undertaking to state which it applied for FY2026.';


--
-- Name: COLUMN mr_esrs_topic_labels.label; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_topic_labels.label IS 'Topic name as printed by the named standard version. esrs_2026 rows are transcribed from Commission Delegated Regulation C(2026) 5010 final, Annex I, ESRS 1 Appendix A. S1 and S2 both carry Appendix A''s joint title.';


--
-- Name: mr_esrs_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_esrs_topics (
    code text NOT NULL,
    label text NOT NULL,
    category text NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mr_industries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_industries (
    code text NOT NULL,
    label text NOT NULL,
    carbon_exposure smallint DEFAULT 1 NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_industries_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_industry_hazards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_industry_hazards (
    industry_code text NOT NULL,
    hazard text NOT NULL,
    sensitivity smallint DEFAULT 0 NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_industry_hazards_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_industry_opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_industry_opportunities (
    industry_code text NOT NULL,
    opportunity_category text NOT NULL,
    relevance smallint DEFAULT 0 NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_industry_opportunities_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_industry_subtopic_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_industry_subtopic_baselines (
    industry_code text NOT NULL,
    subtopic_code text NOT NULL,
    standard_version text NOT NULL,
    financial_base numeric NOT NULL,
    impact_base numeric NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_industry_subtopic_baselines_financial_range CHECK (((financial_base >= (0)::numeric) AND (financial_base <= (10)::numeric))),
    CONSTRAINT mr_industry_subtopic_baselines_impact_range CHECK (((impact_base >= (0)::numeric) AND (impact_base <= (10)::numeric))),
    CONSTRAINT mr_industry_subtopic_baselines_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: TABLE mr_industry_subtopic_baselines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mr_industry_subtopic_baselines IS 'Per-industry double-materiality baselines against ESRS sub-topics. DELIBERATELY UNSEEDED — 13 industries x 37 sub-topics is 481 judgements to be made by hand, not generated. An absent row means NOT ASSESSED and must render as unknown, never as a low score.';


--
-- Name: COLUMN mr_industry_subtopic_baselines.financial_base; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_industry_subtopic_baselines.financial_base IS 'Financial-materiality baseline, 0-10. NOT NULL with NO DEFAULT on purpose: a defaulted 2 would read as an assessed finding of low materiality.';


--
-- Name: COLUMN mr_industry_subtopic_baselines.provenance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_industry_subtopic_baselines.provenance IS 'Calibration state, not citation. ''starter'' until calibrated against worked examples; see 20260715_mr_provenance_columns.sql for why that is the honest default.';


--
-- Name: COLUMN mr_industry_subtopic_baselines.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_industry_subtopic_baselines.created_at IS 'When this baseline was first entered. Never changes — the trigger touches updated_at only. Together the pair separates "assessed once in August" from "revised in October against a better source".';


--
-- Name: COLUMN mr_industry_subtopic_baselines.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_industry_subtopic_baselines.updated_at IS 'Written by the BEFORE UPDATE trigger mr_industry_subtopic_baselines_set_updated_at; the app must NEVER set it. A baseline''s age is part of its evidentiary weight — it dates a correction that provenance alone cannot distinguish from the original value. An application-set timestamp can be wrong or forgotten; a trigger cannot be skipped.';


--
-- Name: mr_industry_topic_baselines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_industry_topic_baselines (
    industry_code text NOT NULL,
    topic_code text NOT NULL,
    financial_base numeric DEFAULT 2 NOT NULL,
    impact_base numeric DEFAULT 2 NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_industry_topic_baselines_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_industry_transition_drivers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_industry_transition_drivers (
    industry_code text NOT NULL,
    transition_driver text NOT NULL,
    weight smallint DEFAULT 0 NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_industry_transition_drivers_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_jurisdictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_jurisdictions (
    code text NOT NULL,
    label text NOT NULL,
    policy_intensity smallint DEFAULT 1 NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_jurisdictions_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_model_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_model_config (
    id smallint DEFAULT 1 NOT NULL,
    model_version text DEFAULT '0.1-draft'::text NOT NULL,
    phys_high numeric DEFAULT 5.5 NOT NULL,
    phys_med numeric DEFAULT 3.0 NOT NULL,
    topic_high numeric DEFAULT 8.0 NOT NULL,
    topic_med numeric DEFAULT 5.0 NOT NULL,
    horizon_short numeric DEFAULT 0.85 NOT NULL,
    horizon_medium numeric DEFAULT 1.0 NOT NULL,
    horizon_long numeric DEFAULT 1.2 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    trans_policy_high numeric DEFAULT 12 NOT NULL,
    trans_policy_med numeric DEFAULT 6 NOT NULL,
    trans_driver_high numeric DEFAULT 4 NOT NULL,
    trans_driver_med numeric DEFAULT 2 NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_model_config_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text]))),
    CONSTRAINT mr_model_config_singleton CHECK ((id = 1))
);


--
-- Name: mr_region_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_region_aliases (
    alias_label text NOT NULL,
    region_code text NOT NULL
);


--
-- Name: mr_region_hazards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_region_hazards (
    region_code text NOT NULL,
    hazard text NOT NULL,
    intensity smallint DEFAULT 0 NOT NULL,
    source_note text,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_region_hazards_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_regions (
    code text NOT NULL,
    label text NOT NULL,
    continent text NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mr_scenarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_scenarios (
    code text NOT NULL,
    label text NOT NULL,
    framework text NOT NULL,
    descriptor text,
    physical_mult numeric DEFAULT 1 NOT NULL,
    transition_mult numeric DEFAULT 1 NOT NULL,
    sort_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provenance text DEFAULT 'starter'::text NOT NULL,
    source_ref text,
    source_date date,
    CONSTRAINT mr_scenarios_provenance_check CHECK ((provenance = ANY (ARRAY['starter'::text, 'primary_source'::text, 'expert_judgment'::text])))
);


--
-- Name: mr_stakeholder_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_stakeholder_categories (
    code text NOT NULL,
    label text NOT NULL,
    track text NOT NULL,
    labour_routing text NOT NULL,
    is_affected boolean NOT NULL,
    is_user boolean NOT NULL,
    can_proxy_for_affected boolean DEFAULT false NOT NULL,
    sort_order smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_stakeholder_categories_at_least_one_group CHECK ((is_affected OR is_user)),
    CONSTRAINT mr_stakeholder_categories_labour_routing_check CHECK ((labour_routing = ANY (ARRAY['s1'::text, 's2'::text, 'not_asked'::text]))),
    CONSTRAINT mr_stakeholder_categories_track_check CHECK ((track = ANY (ARRAY['internal'::text, 'external'::text])))
);


--
-- Name: TABLE mr_stakeholder_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mr_stakeholder_categories IS 'ESRS stakeholder categories, with the S1/S2 labour routing (spec v8 §3.0.1) and THREE independent relationship flags. is_affected and is_user are the adopted Annex I glossary''s two overlapping groups — the glossary states that some, but not all, stakeholders belong to both, so one flag could not express it: a supplier is a business partner (user) AND affected in its own right, which G1-6 discloses as late payment to SMEs. can_proxy_for_affected is ESRS 1 ¶42''s third relationship, a user standing in for affected stakeholders who could not be reached, and is a CAPABILITY OF THE CATEGORY rather than a claim about any response. AR 23 gives TYPICAL categories, not a closed set, so absence from it excludes nothing.';


--
-- Name: COLUMN mr_stakeholder_categories.labour_routing; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_stakeholder_categories.labour_routing IS 'Which determination this category''s answers feed FOR THE SIX LABOUR SUB-TOPICS ONLY (S1.1-6 / S2.1-6). Every other sub-topic is asked of every respondent. ''not_asked'' is a routing outcome, NOT an abstention — a respondent who was never shown the question is not evidence that nobody could answer it. Changing a value here must be a NEW code, never an UPDATE: responses record the category that resolved them, and an in-place edit would make the audit trail claim a rule that was not applied.';


--
-- Name: COLUMN mr_stakeholder_categories.is_affected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_stakeholder_categories.is_affected IS 'Individuals or groups whose interests are affected or could be affected by the undertaking''s activities and its business relationships across the value chain (adopted Annex I glossary; ESRS 1 ¶42). Independent of is_user — both may be true.';


--
-- Name: COLUMN mr_stakeholder_categories.is_user; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_stakeholder_categories.is_user IS 'Users of sustainability information: investors, lenders and creditors, business partners, social partners including trade unions and employer organisations, civil society and NGOs (adopted Annex I glossary). Independent of is_affected — both may be true, and independent of can_proxy_for_affected.';


--
-- Name: COLUMN mr_stakeholder_categories.can_proxy_for_affected; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_stakeholder_categories.can_proxy_for_affected IS 'Whether this category CAN act as a proxy for affected stakeholders who cannot be reached directly — ESRS 1 ¶42 names civil society, NGOs and trade unions as users who can. A CAPABILITY OF THE CATEGORY, NOT A CLAIM ABOUT ANY RESPONSE: whether a given respondent actually spoke for someone else is not knowable from their category, is not asked in the screening survey, and is recorded nowhere. §7 may therefore say "categories engaged that can act as proxies for affected stakeholders" and may NOT say "these responses were given on behalf of affected stakeholders" — the second is an evidentiary claim about who was heard, and nothing here supports it. Adds a capability, never replaces a fact: both workers''-representative rows remain is_affected = true, because a representative is a worker whose own interests are affected whether or not they also speak for colleagues.';


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    ein text,
    naics text,
    website text,
    address text,
    city text,
    state text,
    country text DEFAULT 'USA'::text,
    postal_code text,
    annual_revenue_usd numeric,
    employee_count text,
    industry text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    first_name text,
    last_name text,
    role text,
    company text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: purchase_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_session_id text,
    payment_intent_id text,
    business_name text NOT NULL,
    business_reg_number text NOT NULL,
    purchaser_name text NOT NULL,
    purchaser_email text,
    ip_address text,
    consent_business_capacity boolean NOT NULL,
    consent_digital_access boolean NOT NULL,
    consent_data_authority boolean NOT NULL,
    consent_version text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    id bigint NOT NULL,
    bucket text NOT NULL,
    ip text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rate_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: sbti_company_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sbti_company_profile (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    annual_revenue numeric,
    employee_count integer,
    total_emissions_tco2e numeric,
    elec_demand_growth_pct numeric,
    category text,
    category_basis text,
    oer_intent text DEFAULT 'undeclared'::text NOT NULL,
    net_zero_target_year integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    net_turnover_eur numeric,
    balance_sheet_eur numeric,
    high_income_country boolean,
    CONSTRAINT sbti_company_profile_balance_sheet_eur_check CHECK (((balance_sheet_eur IS NULL) OR (balance_sheet_eur >= (0)::numeric))),
    CONSTRAINT sbti_company_profile_net_turnover_eur_check CHECK (((net_turnover_eur IS NULL) OR (net_turnover_eur >= (0)::numeric))),
    CONSTRAINT sbti_company_profile_net_zero_target_year_check CHECK (((net_zero_target_year IS NULL) OR ((net_zero_target_year >= 1990) AND (net_zero_target_year <= 2100)))),
    CONSTRAINT sbti_company_profile_oer_intent_check CHECK ((oer_intent = ANY (ARRAY['participate'::text, 'decline'::text, 'undeclared'::text])))
);


--
-- Name: COLUMN sbti_company_profile.annual_revenue; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sbti_company_profile.annual_revenue IS 'RETIRED — superseded by net_turnover_eur for SBTi categorisation. Retained (not dropped) for reversibility; do NOT read for categorize().';


--
-- Name: COLUMN sbti_company_profile.net_turnover_eur; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sbti_company_profile.net_turnover_eur IS 'EUR net turnover — categorize() Route 1 (>=450M) and Route 2 two-of-three (>=50M). THE revenue field for SBTi.';


--
-- Name: COLUMN sbti_company_profile.balance_sheet_eur; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sbti_company_profile.balance_sheet_eur IS 'EUR balance-sheet total — categorize() Route 2 two-of-three (>=25M).';


--
-- Name: COLUMN sbti_company_profile.high_income_country; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sbti_company_profile.high_income_country IS 'World Bank high-income class of the ultimate-parent jurisdiction — gates categorize() Route 2. Null = undeclared.';


--
-- Name: sbti_cycle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sbti_cycle (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    cycle_start date,
    cycle_end date,
    last_assessment_date date,
    renewal_due date,
    performance_status text,
    transition_plan_due date,
    transition_plan_published boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sbti_cycle_performance_status_check CHECK (((performance_status IS NULL) OR (performance_status = ANY (ARRAY['on_track'::text, 'off_track'::text, 'best_efforts'::text]))))
);


--
-- Name: sbti_scope3_coverage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sbti_scope3_coverage (
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    s3_category integer NOT NULL,
    category_emissions_tco2e numeric,
    pct_of_total_s3 numeric,
    target_required boolean DEFAULT false NOT NULL,
    has_target boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sbti_scope3_coverage_s3_category_check CHECK (((s3_category >= 1) AND (s3_category <= 14)))
);


--
-- Name: sbti_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sbti_targets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    standard_version text NOT NULL,
    target_type text NOT NULL,
    scope text NOT NULL,
    s3_category integer,
    method text NOT NULL,
    base_year integer,
    base_year_emissions_tco2e numeric,
    target_year integer,
    reduction_pct numeric,
    ambition text DEFAULT '1.5C'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    coverage_pct numeric,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sbti_targets_ambition_check CHECK ((ambition = '1.5C'::text)),
    CONSTRAINT sbti_targets_base_year_check CHECK (((base_year >= 1990) AND (base_year <= 2100))),
    CONSTRAINT sbti_targets_combined_v1_only CHECK (((scope <> 's1s2_combined'::text) OR (standard_version = 'v1_3_1'::text))),
    CONSTRAINT sbti_targets_method_check CHECK ((method = ANY (ARRAY['absolute_aca'::text, 'intensity'::text]))),
    CONSTRAINT sbti_targets_reduction_pct_check CHECK (((reduction_pct IS NULL) OR ((reduction_pct >= (0)::numeric) AND (reduction_pct <= (100)::numeric)))),
    CONSTRAINT sbti_targets_s3_category_check CHECK (((s3_category IS NULL) OR ((s3_category >= 1) AND (s3_category <= 14)))),
    CONSTRAINT sbti_targets_s3_category_scope CHECK (((scope = 's3'::text) OR (s3_category IS NULL))),
    CONSTRAINT sbti_targets_scope_check CHECK ((scope = ANY (ARRAY['s1'::text, 's2_location'::text, 's3'::text, 's1s2_combined'::text]))),
    CONSTRAINT sbti_targets_standard_version_check CHECK ((standard_version = ANY (ARRAY['v1_3_1'::text, 'v2_0'::text]))),
    CONSTRAINT sbti_targets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'committed'::text, 'submitted'::text, 'validated'::text, 'expired'::text, 'renewing'::text]))),
    CONSTRAINT sbti_targets_target_type_check CHECK ((target_type = ANY (ARRAY['near_term'::text, 'net_zero'::text, 'renewal'::text]))),
    CONSTRAINT sbti_targets_target_year_check CHECK (((target_year >= 1990) AND (target_year <= 2100)))
);


--
-- Name: scope3_inventories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scope3_inventories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    inventory_id uuid NOT NULL,
    sector text,
    currency text,
    revenue_millions numeric,
    cat_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    total_scope3_tco2e numeric,
    factor_basis text,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT scope3_inventories_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text])))
);


--
-- Name: source_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.source_documents (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    inventory_id uuid,
    location_name text,
    document_type text,
    file_name text,
    file_path text,
    file_size_kb numeric,
    notes text,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: supplier_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    buyer_id uuid,
    name text NOT NULL,
    description text,
    reporting_year integer DEFAULT 2024 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    deadline date,
    created_at timestamp with time zone DEFAULT now(),
    questionnaire_template text DEFAULT 'ecovadis'::text,
    buyer_company text,
    CONSTRAINT supplier_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'closed'::text])))
);


--
-- Name: COLUMN supplier_campaigns.buyer_company; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supplier_campaigns.buyer_company IS 'Company name the supplier invite is sent on behalf of. Nullable; the invite route falls back to the full campaign name when unset. Read server-side only -- never accepted from the request body.';


--
-- Name: supplier_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_supplier_id uuid,
    doc_type text NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: supplier_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_supplier_id uuid,
    section text NOT NULL,
    question_id text NOT NULL,
    response text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    module_id text NOT NULL,
    tier text DEFAULT 'starter'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    pack text,
    started_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_subscriptions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text, 'expired'::text]))),
    CONSTRAINT user_subscriptions_tier_check CHECK ((tier = ANY (ARRAY['starter'::text, 'professional'::text, 'advisory'::text])))
);


--
-- Name: verifier_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verifier_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    inventory_id uuid NOT NULL,
    customer_user_id uuid NOT NULL,
    verifier_email text,
    verifier_name text,
    status text DEFAULT 'active'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    accepted_at timestamp with time zone,
    tos_accepted_at timestamp with time zone,
    privacy_accepted_at timestamp with time zone,
    consent_version text
);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: campaign_suppliers campaign_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_suppliers
    ADD CONSTRAINT campaign_suppliers_pkey PRIMARY KEY (id);


--
-- Name: campaign_suppliers campaign_suppliers_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_suppliers
    ADD CONSTRAINT campaign_suppliers_token_key UNIQUE (token);


--
-- Name: cbam_benchmarks cbam_benchmarks_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_benchmarks
    ADD CONSTRAINT cbam_benchmarks_key UNIQUE NULLS NOT DISTINCT (cn_code, bm_column, route_indicator, period_band);


--
-- Name: cbam_benchmarks cbam_benchmarks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_benchmarks
    ADD CONSTRAINT cbam_benchmarks_pkey PRIMARY KEY (id);


--
-- Name: cbam_charge_mix cbam_charge_mix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_charge_mix
    ADD CONSTRAINT cbam_charge_mix_pkey PRIMARY KEY (id);


--
-- Name: cbam_cn_codes cbam_cn_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_cn_codes
    ADD CONSTRAINT cbam_cn_codes_pkey PRIMARY KEY (cn_code);


--
-- Name: cbam_cn_map cbam_cn_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_cn_map
    ADD CONSTRAINT cbam_cn_map_pkey PRIMARY KEY (cn_prefix);


--
-- Name: cbam_default_values cbam_default_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_default_values
    ADD CONSTRAINT cbam_default_values_pkey PRIMARY KEY (cn_code, country);


--
-- Name: cbam_goods_categories cbam_goods_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_goods_categories
    ADD CONSTRAINT cbam_goods_categories_pkey PRIMARY KEY (code);


--
-- Name: cbam_grid_factors cbam_grid_factors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_grid_factors
    ADD CONSTRAINT cbam_grid_factors_pkey PRIMARY KEY (country_code);


--
-- Name: cbam_installations cbam_inst_id_company_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_installations
    ADD CONSTRAINT cbam_inst_id_company_uniq UNIQUE (id, company_id);


--
-- Name: cbam_installation_disclosures cbam_installation_disclosures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_installation_disclosures
    ADD CONSTRAINT cbam_installation_disclosures_pkey PRIMARY KEY (installation_id, reporting_period);


--
-- Name: cbam_installations cbam_installations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_installations
    ADD CONSTRAINT cbam_installations_pkey PRIMARY KEY (id);


--
-- Name: cbam_operator_profile cbam_operator_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_operator_profile
    ADD CONSTRAINT cbam_operator_profile_pkey PRIMARY KEY (company_id);


--
-- Name: cbam_production_processes cbam_pp_id_company_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_pp_id_company_uniq UNIQUE (id, company_id);


--
-- Name: cbam_production_processes cbam_pp_installation_cn_period_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_pp_installation_cn_period_uniq UNIQUE (installation_id, cn_code, reporting_period);


--
-- Name: cbam_precursor_edges cbam_precursor_edges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_edges
    ADD CONSTRAINT cbam_precursor_edges_pkey PRIMARY KEY (category_code, precursor_category_code);


--
-- Name: cbam_precursor_inputs cbam_precursor_inputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_inputs
    ADD CONSTRAINT cbam_precursor_inputs_pkey PRIMARY KEY (id);


--
-- Name: cbam_process_parameters cbam_process_parameters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_process_parameters
    ADD CONSTRAINT cbam_process_parameters_pkey PRIMARY KEY (process_id);


--
-- Name: cbam_production_processes cbam_production_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_production_processes_pkey PRIMARY KEY (id);


--
-- Name: cbam_production_routes cbam_production_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_routes
    ADD CONSTRAINT cbam_production_routes_pkey PRIMARY KEY (category_code, route_code);


--
-- Name: cbam_see_records cbam_see_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_see_records
    ADD CONSTRAINT cbam_see_records_pkey PRIMARY KEY (id);


--
-- Name: cbam_sefa_params cbam_sefa_params_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_sefa_params
    ADD CONSTRAINT cbam_sefa_params_pkey PRIMARY KEY (year);


--
-- Name: cbam_source_documents cbam_source_documents_company_id_file_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_documents
    ADD CONSTRAINT cbam_source_documents_company_id_file_path_key UNIQUE (company_id, file_path);


--
-- Name: cbam_source_documents cbam_source_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_documents
    ADD CONSTRAINT cbam_source_documents_pkey PRIMARY KEY (id);


--
-- Name: cbam_source_streams cbam_source_streams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_streams
    ADD CONSTRAINT cbam_source_streams_pkey PRIMARY KEY (id);


--
-- Name: cbam_verifier_access cbam_verifier_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_verifier_access
    ADD CONSTRAINT cbam_verifier_access_pkey PRIMARY KEY (id);


--
-- Name: cbam_verifier_access cbam_verifier_access_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_verifier_access
    ADD CONSTRAINT cbam_verifier_access_token_key UNIQUE (token);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: entitlements entitlements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_pkey PRIMARY KEY (id);


--
-- Name: entitlements entitlements_user_id_module_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_user_id_module_key_key UNIQUE (user_id, module_key);


--
-- Name: ghg_entries ghg_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_entries
    ADD CONSTRAINT ghg_entries_pkey PRIMARY KEY (id);


--
-- Name: ghg_inventories ghg_inventories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_inventories
    ADD CONSTRAINT ghg_inventories_pkey PRIMARY KEY (id);


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_monthly_emissions
    ADD CONSTRAINT ghg_monthly_emissions_pkey PRIMARY KEY (id);


--
-- Name: materiality_assessments materiality_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessments
    ADD CONSTRAINT materiality_assessments_pkey PRIMARY KEY (id);


--
-- Name: materiality_survey_questions materiality_survey_questions_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_questions
    ADD CONSTRAINT materiality_survey_questions_id_version_key UNIQUE (id, questionnaire_version);


--
-- Name: materiality_survey_questions materiality_survey_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_questions
    ADD CONSTRAINT materiality_survey_questions_pkey PRIMARY KEY (id);


--
-- Name: materiality_survey_respondents materiality_survey_respondents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_respondents
    ADD CONSTRAINT materiality_survey_respondents_pkey PRIMARY KEY (id);


--
-- Name: materiality_survey_respondents materiality_survey_respondents_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_respondents
    ADD CONSTRAINT materiality_survey_respondents_token_key UNIQUE (token);


--
-- Name: materiality_survey_responses materiality_survey_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_responses
    ADD CONSTRAINT materiality_survey_responses_pkey PRIMARY KEY (id);


--
-- Name: materiality_survey_responses materiality_survey_responses_respondent_question_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_responses
    ADD CONSTRAINT materiality_survey_responses_respondent_question_key UNIQUE (respondent_id, question_id);


--
-- Name: materiality_survey_rounds materiality_survey_rounds_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_rounds
    ADD CONSTRAINT materiality_survey_rounds_id_version_key UNIQUE (id, standard_version);


--
-- Name: materiality_survey_rounds materiality_survey_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_rounds
    ADD CONSTRAINT materiality_survey_rounds_pkey PRIMARY KEY (id);


--
-- Name: mr_asset_modifiers mr_asset_modifiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_asset_modifiers
    ADD CONSTRAINT mr_asset_modifiers_pkey PRIMARY KEY (asset_profile, hazard);


--
-- Name: mr_esrs_disclosure_requirements mr_esrs_disclosure_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_disclosure_requirements
    ADD CONSTRAINT mr_esrs_disclosure_requirements_pkey PRIMARY KEY (dr_code, standard_version);


--
-- Name: mr_esrs_subtopic_display mr_esrs_subtopic_display_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_subtopic_display
    ADD CONSTRAINT mr_esrs_subtopic_display_pkey PRIMARY KEY (subtopic_code, standard_version);


--
-- Name: mr_esrs_subtopics mr_esrs_subtopics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_subtopics
    ADD CONSTRAINT mr_esrs_subtopics_pkey PRIMARY KEY (code, standard_version);


--
-- Name: mr_esrs_topic_labels mr_esrs_topic_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_topic_labels
    ADD CONSTRAINT mr_esrs_topic_labels_pkey PRIMARY KEY (topic_code, standard_version);


--
-- Name: mr_esrs_topics mr_esrs_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_topics
    ADD CONSTRAINT mr_esrs_topics_pkey PRIMARY KEY (code);


--
-- Name: mr_industries mr_industries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industries
    ADD CONSTRAINT mr_industries_pkey PRIMARY KEY (code);


--
-- Name: mr_industry_hazards mr_industry_hazards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_hazards
    ADD CONSTRAINT mr_industry_hazards_pkey PRIMARY KEY (industry_code, hazard);


--
-- Name: mr_industry_opportunities mr_industry_opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_opportunities
    ADD CONSTRAINT mr_industry_opportunities_pkey PRIMARY KEY (industry_code, opportunity_category);


--
-- Name: mr_industry_subtopic_baselines mr_industry_subtopic_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_subtopic_baselines
    ADD CONSTRAINT mr_industry_subtopic_baselines_pkey PRIMARY KEY (industry_code, subtopic_code, standard_version);


--
-- Name: mr_industry_topic_baselines mr_industry_topic_baselines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_topic_baselines
    ADD CONSTRAINT mr_industry_topic_baselines_pkey PRIMARY KEY (industry_code, topic_code);


--
-- Name: mr_industry_transition_drivers mr_industry_transition_drivers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_transition_drivers
    ADD CONSTRAINT mr_industry_transition_drivers_pkey PRIMARY KEY (industry_code, transition_driver);


--
-- Name: mr_jurisdictions mr_jurisdictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_jurisdictions
    ADD CONSTRAINT mr_jurisdictions_pkey PRIMARY KEY (code);


--
-- Name: mr_model_config mr_model_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_model_config
    ADD CONSTRAINT mr_model_config_pkey PRIMARY KEY (id);


--
-- Name: mr_region_aliases mr_region_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_region_aliases
    ADD CONSTRAINT mr_region_aliases_pkey PRIMARY KEY (alias_label);


--
-- Name: mr_region_hazards mr_region_hazards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_region_hazards
    ADD CONSTRAINT mr_region_hazards_pkey PRIMARY KEY (region_code, hazard);


--
-- Name: mr_regions mr_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_regions
    ADD CONSTRAINT mr_regions_pkey PRIMARY KEY (code);


--
-- Name: mr_scenarios mr_scenarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_scenarios
    ADD CONSTRAINT mr_scenarios_pkey PRIMARY KEY (code);


--
-- Name: mr_stakeholder_categories mr_stakeholder_categories_code_track_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_stakeholder_categories
    ADD CONSTRAINT mr_stakeholder_categories_code_track_key UNIQUE (code, track);


--
-- Name: mr_stakeholder_categories mr_stakeholder_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_stakeholder_categories
    ADD CONSTRAINT mr_stakeholder_categories_pkey PRIMARY KEY (code);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_consents purchase_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_consents
    ADD CONSTRAINT purchase_consents_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: sbti_company_profile sbti_company_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_company_profile
    ADD CONSTRAINT sbti_company_profile_pkey PRIMARY KEY (company_id);


--
-- Name: sbti_cycle sbti_cycle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_cycle
    ADD CONSTRAINT sbti_cycle_pkey PRIMARY KEY (company_id);


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_scope3_coverage
    ADD CONSTRAINT sbti_scope3_coverage_pkey PRIMARY KEY (company_id, s3_category);


--
-- Name: sbti_targets sbti_targets_company_scope_type_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_targets
    ADD CONSTRAINT sbti_targets_company_scope_type_uniq UNIQUE (company_id, scope, target_type);


--
-- Name: sbti_targets sbti_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_targets
    ADD CONSTRAINT sbti_targets_pkey PRIMARY KEY (id);


--
-- Name: scope3_inventories scope3_inventories_inventory_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_inventories
    ADD CONSTRAINT scope3_inventories_inventory_unique UNIQUE (inventory_id);


--
-- Name: scope3_inventories scope3_inventories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_inventories
    ADD CONSTRAINT scope3_inventories_pkey PRIMARY KEY (id);


--
-- Name: source_documents source_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_documents
    ADD CONSTRAINT source_documents_pkey PRIMARY KEY (id);


--
-- Name: supplier_campaigns supplier_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_campaigns
    ADD CONSTRAINT supplier_campaigns_pkey PRIMARY KEY (id);


--
-- Name: supplier_documents supplier_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_documents
    ADD CONSTRAINT supplier_documents_pkey PRIMARY KEY (id);


--
-- Name: supplier_responses supplier_responses_campaign_supplier_id_question_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_responses
    ADD CONSTRAINT supplier_responses_campaign_supplier_id_question_id_key UNIQUE (campaign_supplier_id, question_id);


--
-- Name: supplier_responses supplier_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_responses
    ADD CONSTRAINT supplier_responses_pkey PRIMARY KEY (id);


--
-- Name: user_subscriptions user_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: verifier_access verifier_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifier_access
    ADD CONSTRAINT verifier_access_pkey PRIMARY KEY (id);


--
-- Name: verifier_access verifier_access_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifier_access
    ADD CONSTRAINT verifier_access_token_key UNIQUE (token);


--
-- Name: campaign_suppliers_campaign_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_suppliers_campaign_id_idx ON public.campaign_suppliers USING btree (campaign_id);


--
-- Name: cbam_benchmarks_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cbam_benchmarks_lookup ON public.cbam_benchmarks USING btree (cn_code, bm_column);


--
-- Name: cbam_source_documents_id_company_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cbam_source_documents_id_company_uniq ON public.cbam_source_documents USING btree (id, company_id);


--
-- Name: cbam_verifier_access_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cbam_verifier_access_token_idx ON public.cbam_verifier_access USING btree (token);


--
-- Name: companies_user_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX companies_user_name_unique ON public.companies USING btree (user_id, name);


--
-- Name: deals_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_user_id_idx ON public.deals USING btree (user_id);


--
-- Name: ghg_inventories_user_company_year_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ghg_inventories_user_company_year_uniq ON public.ghg_inventories USING btree (user_id, company_name, reporting_year);


--
-- Name: ghg_monthly_emissions_company_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ghg_monthly_emissions_company_year_idx ON public.ghg_monthly_emissions USING btree (company_id, reporting_year);


--
-- Name: ghg_monthly_emissions_inventory_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ghg_monthly_emissions_inventory_idx ON public.ghg_monthly_emissions USING btree (inventory_id);


--
-- Name: ghg_monthly_emissions_month_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ghg_monthly_emissions_month_idx ON public.ghg_monthly_emissions USING btree (inventory_id, period_month);


--
-- Name: idx_ghg_inventories_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ghg_inventories_company_id ON public.ghg_inventories USING btree (company_id);


--
-- Name: idx_matassess_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matassess_org ON public.materiality_assessments USING btree (organization_id);


--
-- Name: idx_matassess_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_matassess_user ON public.materiality_assessments USING btree (user_id);


--
-- Name: idx_scope3_inventories_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_scope3_inventories_user ON public.scope3_inventories USING btree (user_id);


--
-- Name: materiality_survey_questions_round_version_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_survey_questions_round_version_order_idx ON public.materiality_survey_questions USING btree (round_id, questionnaire_version, sort_order);


--
-- Name: materiality_survey_questions_round_version_subtopic_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX materiality_survey_questions_round_version_subtopic_key ON public.materiality_survey_questions USING btree (round_id, questionnaire_version, subtopic_code) WHERE (subtopic_code IS NOT NULL);


--
-- Name: materiality_survey_respondents_round_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_survey_respondents_round_status_idx ON public.materiality_survey_respondents USING btree (round_id, status);


--
-- Name: materiality_survey_respondents_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_survey_respondents_token_idx ON public.materiality_survey_respondents USING btree (token);


--
-- Name: materiality_survey_responses_round_question_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_survey_responses_round_question_idx ON public.materiality_survey_responses USING btree (round_id, question_id);


--
-- Name: materiality_survey_responses_round_resolved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_survey_responses_round_resolved_idx ON public.materiality_survey_responses USING btree (round_id, resolved_subtopic_code);


--
-- Name: mr_esrs_disclosure_requirements_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mr_esrs_disclosure_requirements_version_idx ON public.mr_esrs_disclosure_requirements USING btree (standard_version, topic_code, sort_order);


--
-- Name: purchase_consents_session_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX purchase_consents_session_uniq ON public.purchase_consents USING btree (stripe_session_id);


--
-- Name: purchase_consents_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX purchase_consents_user_idx ON public.purchase_consents USING btree (user_id);


--
-- Name: rate_limits_bucket_email_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limits_bucket_email_time_idx ON public.rate_limits USING btree (bucket, email, created_at);


--
-- Name: rate_limits_bucket_ip_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limits_bucket_ip_time_idx ON public.rate_limits USING btree (bucket, ip, created_at);


--
-- Name: sbti_cycle_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sbti_cycle_user_id_idx ON public.sbti_cycle USING btree (user_id);


--
-- Name: sbti_scope3_coverage_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sbti_scope3_coverage_user_id_idx ON public.sbti_scope3_coverage USING btree (user_id);


--
-- Name: sbti_targets_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sbti_targets_company_id_idx ON public.sbti_targets USING btree (company_id);


--
-- Name: sbti_targets_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sbti_targets_user_id_idx ON public.sbti_targets USING btree (user_id);


--
-- Name: cbam_installation_disclosures audit_cbam_installation_disclosures; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_cbam_installation_disclosures AFTER INSERT OR DELETE OR UPDATE ON public.cbam_installation_disclosures FOR EACH ROW EXECUTE FUNCTION public.log_audit_cbam_disclosures();


--
-- Name: cbam_production_processes audit_cbam_production_processes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_cbam_production_processes AFTER INSERT OR DELETE OR UPDATE ON public.cbam_production_processes FOR EACH ROW EXECUTE FUNCTION public.log_audit();


--
-- Name: ghg_entries audit_ghg_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_ghg_entries AFTER INSERT OR DELETE OR UPDATE ON public.ghg_entries FOR EACH ROW EXECUTE FUNCTION public.log_audit();


--
-- Name: ghg_inventories audit_ghg_inventories; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_ghg_inventories AFTER INSERT OR DELETE OR UPDATE ON public.ghg_inventories FOR EACH ROW EXECUTE FUNCTION public.log_audit();


--
-- Name: cbam_installation_disclosures cbam_stamp_processes_complete_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER cbam_stamp_processes_complete_trg BEFORE INSERT OR UPDATE ON public.cbam_installation_disclosures FOR EACH ROW EXECUTE FUNCTION public.cbam_stamp_processes_complete();


--
-- Name: materiality_survey_rounds materiality_survey_rounds_generate_questions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_survey_rounds_generate_questions AFTER INSERT ON public.materiality_survey_rounds FOR EACH ROW EXECUTE FUNCTION public.materiality_survey_generate_questions();


--
-- Name: materiality_survey_rounds materiality_survey_rounds_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_survey_rounds_guard BEFORE UPDATE ON public.materiality_survey_rounds FOR EACH ROW EXECUTE FUNCTION public.materiality_survey_round_guard();


--
-- Name: materiality_survey_rounds materiality_survey_rounds_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_survey_rounds_set_updated_at BEFORE UPDATE ON public.materiality_survey_rounds FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: mr_esrs_subtopic_display mr_esrs_subtopic_display_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mr_esrs_subtopic_display_set_updated_at BEFORE UPDATE ON public.mr_esrs_subtopic_display FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: mr_industry_subtopic_baselines mr_industry_subtopic_baselines_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mr_industry_subtopic_baselines_set_updated_at BEFORE UPDATE ON public.mr_industry_subtopic_baselines FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: sbti_company_profile sbti_company_profile_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sbti_company_profile_set_updated_at BEFORE UPDATE ON public.sbti_company_profile FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: sbti_cycle sbti_cycle_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sbti_cycle_set_updated_at BEFORE UPDATE ON public.sbti_cycle FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sbti_scope3_coverage_set_updated_at BEFORE UPDATE ON public.sbti_scope3_coverage FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: sbti_targets sbti_targets_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sbti_targets_set_updated_at BEFORE UPDATE ON public.sbti_targets FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: deals trg_enforce_deals_free_tier_cap; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_deals_free_tier_cap BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.enforce_deals_free_tier_cap();


--
-- Name: ghg_inventories trg_enforce_ghg_location_allowance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_ghg_location_allowance BEFORE INSERT OR UPDATE ON public.ghg_inventories FOR EACH ROW EXECUTE FUNCTION public.enforce_ghg_location_allowance();


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: campaign_suppliers campaign_suppliers_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_suppliers
    ADD CONSTRAINT campaign_suppliers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.supplier_campaigns(id) ON DELETE CASCADE;


--
-- Name: cbam_charge_mix cbam_charge_mix_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_charge_mix
    ADD CONSTRAINT cbam_charge_mix_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_charge_mix cbam_charge_mix_process_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_charge_mix
    ADD CONSTRAINT cbam_charge_mix_process_company_fk FOREIGN KEY (process_id, company_id) REFERENCES public.cbam_production_processes(id, company_id) ON DELETE CASCADE;


--
-- Name: cbam_cn_map cbam_cn_map_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_cn_map
    ADD CONSTRAINT cbam_cn_map_category_code_fkey FOREIGN KEY (category_code) REFERENCES public.cbam_goods_categories(code);


--
-- Name: cbam_installation_disclosures cbam_disclosures_inst_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_installation_disclosures
    ADD CONSTRAINT cbam_disclosures_inst_company_fk FOREIGN KEY (installation_id, company_id) REFERENCES public.cbam_installations(id, company_id) ON DELETE CASCADE;


--
-- Name: cbam_installation_disclosures cbam_installation_disclosures_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_installation_disclosures
    ADD CONSTRAINT cbam_installation_disclosures_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_installations cbam_installations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_installations
    ADD CONSTRAINT cbam_installations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_operator_profile cbam_operator_profile_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_operator_profile
    ADD CONSTRAINT cbam_operator_profile_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_process_parameters cbam_params_process_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_process_parameters
    ADD CONSTRAINT cbam_params_process_company_fk FOREIGN KEY (process_id, company_id) REFERENCES public.cbam_production_processes(id, company_id) ON DELETE CASCADE;


--
-- Name: cbam_production_processes cbam_pp_category_route_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_pp_category_route_fk FOREIGN KEY (category_code, route_code) REFERENCES public.cbam_production_routes(category_code, route_code);


--
-- Name: cbam_production_processes cbam_pp_cn_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_pp_cn_code_fk FOREIGN KEY (cn_code) REFERENCES public.cbam_cn_codes(cn_code);


--
-- Name: cbam_precursor_edges cbam_precursor_edges_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_edges
    ADD CONSTRAINT cbam_precursor_edges_category_code_fkey FOREIGN KEY (category_code) REFERENCES public.cbam_goods_categories(code);


--
-- Name: cbam_precursor_edges cbam_precursor_edges_precursor_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_edges
    ADD CONSTRAINT cbam_precursor_edges_precursor_category_code_fkey FOREIGN KEY (precursor_category_code) REFERENCES public.cbam_goods_categories(code);


--
-- Name: cbam_precursor_inputs cbam_precursor_inputs_cn_code_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_inputs
    ADD CONSTRAINT cbam_precursor_inputs_cn_code_fk FOREIGN KEY (precursor_cn_code) REFERENCES public.cbam_cn_codes(cn_code);


--
-- Name: cbam_precursor_inputs cbam_precursor_inputs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_inputs
    ADD CONSTRAINT cbam_precursor_inputs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_precursor_inputs cbam_precursor_inputs_precursor_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_inputs
    ADD CONSTRAINT cbam_precursor_inputs_precursor_category_code_fkey FOREIGN KEY (precursor_category_code) REFERENCES public.cbam_goods_categories(code);


--
-- Name: cbam_precursor_inputs cbam_precursor_inputs_process_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_precursor_inputs
    ADD CONSTRAINT cbam_precursor_inputs_process_company_fk FOREIGN KEY (process_id, company_id) REFERENCES public.cbam_production_processes(id, company_id) ON DELETE CASCADE;


--
-- Name: cbam_process_parameters cbam_process_parameters_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_process_parameters
    ADD CONSTRAINT cbam_process_parameters_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_production_processes cbam_production_processes_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_production_processes_category_code_fkey FOREIGN KEY (category_code) REFERENCES public.cbam_goods_categories(code);


--
-- Name: cbam_production_processes cbam_production_processes_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_production_processes_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_production_processes cbam_production_processes_installation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_processes
    ADD CONSTRAINT cbam_production_processes_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.cbam_installations(id) ON DELETE CASCADE;


--
-- Name: cbam_production_routes cbam_production_routes_category_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_production_routes
    ADD CONSTRAINT cbam_production_routes_category_code_fkey FOREIGN KEY (category_code) REFERENCES public.cbam_goods_categories(code);


--
-- Name: cbam_see_records cbam_see_records_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_see_records
    ADD CONSTRAINT cbam_see_records_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_see_records cbam_see_records_process_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_see_records
    ADD CONSTRAINT cbam_see_records_process_company_fk FOREIGN KEY (process_id, company_id) REFERENCES public.cbam_production_processes(id, company_id) ON DELETE CASCADE;


--
-- Name: cbam_source_documents cbam_source_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_documents
    ADD CONSTRAINT cbam_source_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_source_documents cbam_source_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_documents
    ADD CONSTRAINT cbam_source_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: cbam_source_streams cbam_source_streams_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_streams
    ADD CONSTRAINT cbam_source_streams_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: cbam_source_streams cbam_source_streams_doc_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_streams
    ADD CONSTRAINT cbam_source_streams_doc_company_fk FOREIGN KEY (source_doc_id, company_id) REFERENCES public.cbam_source_documents(id, company_id) ON DELETE SET NULL;


--
-- Name: cbam_source_streams cbam_source_streams_process_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_source_streams
    ADD CONSTRAINT cbam_source_streams_process_company_fk FOREIGN KEY (process_id, company_id) REFERENCES public.cbam_production_processes(id, company_id) ON DELETE CASCADE;


--
-- Name: cbam_verifier_access cbam_verifier_access_installation_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cbam_verifier_access
    ADD CONSTRAINT cbam_verifier_access_installation_fk FOREIGN KEY (installation_id, company_id) REFERENCES public.cbam_installations(id, company_id) ON DELETE CASCADE;


--
-- Name: companies companies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: deals deals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: entitlements entitlements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entitlements
    ADD CONSTRAINT entitlements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ghg_entries ghg_entries_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_entries
    ADD CONSTRAINT ghg_entries_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.ghg_inventories(id) ON DELETE CASCADE;


--
-- Name: ghg_inventories ghg_inventories_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_inventories
    ADD CONSTRAINT ghg_inventories_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: ghg_inventories ghg_inventories_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_inventories
    ADD CONSTRAINT ghg_inventories_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: ghg_inventories ghg_inventories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_inventories
    ADD CONSTRAINT ghg_inventories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_monthly_emissions
    ADD CONSTRAINT ghg_monthly_emissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_monthly_emissions
    ADD CONSTRAINT ghg_monthly_emissions_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.ghg_inventories(id) ON DELETE CASCADE;


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ghg_monthly_emissions
    ADD CONSTRAINT ghg_monthly_emissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: materiality_assessments materiality_assessments_industry_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessments
    ADD CONSTRAINT materiality_assessments_industry_code_fkey FOREIGN KEY (industry_code) REFERENCES public.mr_industries(code);


--
-- Name: materiality_assessments materiality_assessments_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessments
    ADD CONSTRAINT materiality_assessments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: materiality_assessments materiality_assessments_scenario_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessments
    ADD CONSTRAINT materiality_assessments_scenario_code_fkey FOREIGN KEY (scenario_code) REFERENCES public.mr_scenarios(code);


--
-- Name: materiality_survey_questions materiality_survey_questions_round_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_questions
    ADD CONSTRAINT materiality_survey_questions_round_fkey FOREIGN KEY (round_id, standard_version) REFERENCES public.materiality_survey_rounds(id, standard_version) ON DELETE CASCADE;


--
-- Name: materiality_survey_questions materiality_survey_questions_shared_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_questions
    ADD CONSTRAINT materiality_survey_questions_shared_fkey FOREIGN KEY (shared_with_subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: materiality_survey_questions materiality_survey_questions_subtopic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_questions
    ADD CONSTRAINT materiality_survey_questions_subtopic_fkey FOREIGN KEY (subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: materiality_survey_respondents materiality_survey_respondents_category_track_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_respondents
    ADD CONSTRAINT materiality_survey_respondents_category_track_fkey FOREIGN KEY (stakeholder_category, track) REFERENCES public.mr_stakeholder_categories(code, track);


--
-- Name: materiality_survey_respondents materiality_survey_respondents_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_respondents
    ADD CONSTRAINT materiality_survey_respondents_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.materiality_survey_rounds(id) ON DELETE CASCADE;


--
-- Name: materiality_survey_responses materiality_survey_responses_asked_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_responses
    ADD CONSTRAINT materiality_survey_responses_asked_fkey FOREIGN KEY (asked_subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: materiality_survey_responses materiality_survey_responses_question_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_responses
    ADD CONSTRAINT materiality_survey_responses_question_fkey FOREIGN KEY (question_id, questionnaire_version) REFERENCES public.materiality_survey_questions(id, questionnaire_version) ON DELETE RESTRICT;


--
-- Name: materiality_survey_responses materiality_survey_responses_resolution_basis_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_responses
    ADD CONSTRAINT materiality_survey_responses_resolution_basis_fkey FOREIGN KEY (resolution_basis) REFERENCES public.mr_stakeholder_categories(code);


--
-- Name: materiality_survey_responses materiality_survey_responses_resolved_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_responses
    ADD CONSTRAINT materiality_survey_responses_resolved_fkey FOREIGN KEY (resolved_subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: materiality_survey_responses materiality_survey_responses_respondent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_responses
    ADD CONSTRAINT materiality_survey_responses_respondent_id_fkey FOREIGN KEY (respondent_id) REFERENCES public.materiality_survey_respondents(id) ON DELETE CASCADE;


--
-- Name: materiality_survey_rounds materiality_survey_rounds_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_rounds
    ADD CONSTRAINT materiality_survey_rounds_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: mr_esrs_disclosure_requirements mr_esrs_disclosure_requirements_topic_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_disclosure_requirements
    ADD CONSTRAINT mr_esrs_disclosure_requirements_topic_code_fkey FOREIGN KEY (topic_code) REFERENCES public.mr_esrs_topics(code) ON DELETE RESTRICT;


--
-- Name: mr_esrs_subtopic_display mr_esrs_subtopic_display_shared_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_subtopic_display
    ADD CONSTRAINT mr_esrs_subtopic_display_shared_fkey FOREIGN KEY (shared_with_subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: mr_esrs_subtopic_display mr_esrs_subtopic_display_subtopic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_subtopic_display
    ADD CONSTRAINT mr_esrs_subtopic_display_subtopic_fkey FOREIGN KEY (subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: mr_esrs_subtopics mr_esrs_subtopics_parent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_subtopics
    ADD CONSTRAINT mr_esrs_subtopics_parent_fkey FOREIGN KEY (parent_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: mr_esrs_subtopics mr_esrs_subtopics_topic_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_subtopics
    ADD CONSTRAINT mr_esrs_subtopics_topic_code_fkey FOREIGN KEY (topic_code) REFERENCES public.mr_esrs_topics(code) ON DELETE RESTRICT;


--
-- Name: mr_esrs_topic_labels mr_esrs_topic_labels_topic_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_esrs_topic_labels
    ADD CONSTRAINT mr_esrs_topic_labels_topic_code_fkey FOREIGN KEY (topic_code) REFERENCES public.mr_esrs_topics(code) ON DELETE RESTRICT;


--
-- Name: mr_industry_hazards mr_industry_hazards_industry_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_hazards
    ADD CONSTRAINT mr_industry_hazards_industry_code_fkey FOREIGN KEY (industry_code) REFERENCES public.mr_industries(code) ON DELETE CASCADE;


--
-- Name: mr_industry_subtopic_baselines mr_industry_subtopic_baselines_industry_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_subtopic_baselines
    ADD CONSTRAINT mr_industry_subtopic_baselines_industry_fkey FOREIGN KEY (industry_code) REFERENCES public.mr_industries(code) ON DELETE CASCADE;


--
-- Name: mr_industry_subtopic_baselines mr_industry_subtopic_baselines_subtopic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_subtopic_baselines
    ADD CONSTRAINT mr_industry_subtopic_baselines_subtopic_fkey FOREIGN KEY (subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: mr_industry_topic_baselines mr_industry_topic_baselines_industry_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_topic_baselines
    ADD CONSTRAINT mr_industry_topic_baselines_industry_code_fkey FOREIGN KEY (industry_code) REFERENCES public.mr_industries(code) ON DELETE CASCADE;


--
-- Name: mr_industry_topic_baselines mr_industry_topic_baselines_topic_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_industry_topic_baselines
    ADD CONSTRAINT mr_industry_topic_baselines_topic_code_fkey FOREIGN KEY (topic_code) REFERENCES public.mr_esrs_topics(code) ON DELETE CASCADE;


--
-- Name: mr_region_aliases mr_region_aliases_region_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_region_aliases
    ADD CONSTRAINT mr_region_aliases_region_code_fkey FOREIGN KEY (region_code) REFERENCES public.mr_regions(code) ON DELETE CASCADE;


--
-- Name: mr_region_hazards mr_region_hazards_region_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_region_hazards
    ADD CONSTRAINT mr_region_hazards_region_code_fkey FOREIGN KEY (region_code) REFERENCES public.mr_regions(code) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_consents purchase_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_consents
    ADD CONSTRAINT purchase_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sbti_company_profile sbti_company_profile_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_company_profile
    ADD CONSTRAINT sbti_company_profile_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sbti_company_profile sbti_company_profile_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_company_profile
    ADD CONSTRAINT sbti_company_profile_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sbti_cycle sbti_cycle_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_cycle
    ADD CONSTRAINT sbti_cycle_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sbti_cycle sbti_cycle_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_cycle
    ADD CONSTRAINT sbti_cycle_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_scope3_coverage
    ADD CONSTRAINT sbti_scope3_coverage_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_scope3_coverage
    ADD CONSTRAINT sbti_scope3_coverage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: sbti_targets sbti_targets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_targets
    ADD CONSTRAINT sbti_targets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sbti_targets sbti_targets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sbti_targets
    ADD CONSTRAINT sbti_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: scope3_inventories scope3_inventories_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_inventories
    ADD CONSTRAINT scope3_inventories_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.ghg_inventories(id) ON DELETE CASCADE;


--
-- Name: scope3_inventories scope3_inventories_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_inventories
    ADD CONSTRAINT scope3_inventories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: source_documents source_documents_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_documents
    ADD CONSTRAINT source_documents_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.ghg_inventories(id) ON DELETE CASCADE;


--
-- Name: source_documents source_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.source_documents
    ADD CONSTRAINT source_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: supplier_campaigns supplier_campaigns_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_campaigns
    ADD CONSTRAINT supplier_campaigns_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: supplier_documents supplier_documents_campaign_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_documents
    ADD CONSTRAINT supplier_documents_campaign_supplier_id_fkey FOREIGN KEY (campaign_supplier_id) REFERENCES public.campaign_suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_responses supplier_responses_campaign_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_responses
    ADD CONSTRAINT supplier_responses_campaign_supplier_id_fkey FOREIGN KEY (campaign_supplier_id) REFERENCES public.campaign_suppliers(id) ON DELETE CASCADE;


--
-- Name: user_subscriptions user_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_subscriptions
    ADD CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: verifier_access verifier_access_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verifier_access
    ADD CONSTRAINT verifier_access_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.ghg_inventories(id) ON DELETE CASCADE;


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));


--
-- Name: source_documents Users can manage own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own documents" ON public.source_documents TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: ghg_inventories Users can manage own inventories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own inventories" ON public.ghg_inventories USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: audit_log audit_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO authenticated, anon, service_role WITH CHECK (true);


--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log audit_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_select_own ON public.audit_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: campaign_suppliers buyers_see_campaign_suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY buyers_see_campaign_suppliers ON public.campaign_suppliers TO authenticated USING ((campaign_id IN ( SELECT supplier_campaigns.id
   FROM public.supplier_campaigns
  WHERE (supplier_campaigns.buyer_id = auth.uid())))) WITH CHECK ((campaign_id IN ( SELECT supplier_campaigns.id
   FROM public.supplier_campaigns
  WHERE (supplier_campaigns.buyer_id = auth.uid()))));


--
-- Name: campaign_suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_campaigns campaigns_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_delete_own ON public.supplier_campaigns FOR DELETE TO authenticated USING ((buyer_id = auth.uid()));


--
-- Name: supplier_campaigns campaigns_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_insert_own ON public.supplier_campaigns FOR INSERT TO authenticated WITH CHECK ((buyer_id = auth.uid()));


--
-- Name: supplier_campaigns campaigns_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_select_own ON public.supplier_campaigns FOR SELECT TO authenticated USING ((buyer_id = auth.uid()));


--
-- Name: supplier_campaigns campaigns_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_update_own ON public.supplier_campaigns FOR UPDATE TO authenticated USING ((buyer_id = auth.uid())) WITH CHECK ((buyer_id = auth.uid()));


--
-- Name: cbam_benchmarks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_benchmarks ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_benchmarks cbam_benchmarks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_benchmarks_read ON public.cbam_benchmarks FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_charge_mix; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_charge_mix ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_charge_mix cbam_charge_mix_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_charge_mix_owner ON public.cbam_charge_mix USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_cn_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_cn_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_cn_codes cbam_cn_codes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_cn_codes_read ON public.cbam_cn_codes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_cn_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_cn_map ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_cn_map cbam_cn_map_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_cn_map_read ON public.cbam_cn_map FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_default_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_default_values ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_default_values cbam_default_values_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_default_values_read ON public.cbam_default_values FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_goods_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_goods_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_goods_categories cbam_goods_categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_goods_categories_read ON public.cbam_goods_categories FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_grid_factors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_grid_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_grid_factors cbam_grid_factors_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_grid_factors_read ON public.cbam_grid_factors FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_installation_disclosures; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_installation_disclosures ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_installation_disclosures cbam_installation_disclosures_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_installation_disclosures_owner ON public.cbam_installation_disclosures USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_installations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_installations ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_installations cbam_installations_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_installations_owner ON public.cbam_installations USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_operator_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_operator_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_operator_profile cbam_operator_profile_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_operator_profile_owner ON public.cbam_operator_profile USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_precursor_edges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_precursor_edges ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_precursor_edges cbam_precursor_edges_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_precursor_edges_read ON public.cbam_precursor_edges FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_precursor_inputs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_precursor_inputs ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_precursor_inputs cbam_precursor_inputs_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_precursor_inputs_owner ON public.cbam_precursor_inputs USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_process_parameters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_process_parameters ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_process_parameters cbam_process_parameters_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_process_parameters_owner ON public.cbam_process_parameters USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_production_processes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_production_processes ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_production_processes cbam_production_processes_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_production_processes_owner ON public.cbam_production_processes USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_production_routes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_production_routes ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_production_routes cbam_production_routes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_production_routes_read ON public.cbam_production_routes FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_see_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_see_records ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_see_records cbam_see_records_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_see_records_owner ON public.cbam_see_records USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_sefa_params; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_sefa_params ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_sefa_params cbam_sefa_params_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_sefa_params_read ON public.cbam_sefa_params FOR SELECT TO authenticated, anon USING (true);


--
-- Name: cbam_source_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_source_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_source_documents cbam_source_documents_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_source_documents_owner ON public.cbam_source_documents USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_source_streams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_source_streams ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_source_streams cbam_source_streams_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_source_streams_owner ON public.cbam_source_streams USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid())))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = auth.uid()))));


--
-- Name: cbam_verifier_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_verifier_access ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_verifier_access cbam_verifier_access_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_verifier_access_owner ON public.cbam_verifier_access TO authenticated USING ((customer_user_id = auth.uid())) WITH CHECK ((customer_user_id = auth.uid()));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_delete_own ON public.companies FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: companies companies_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_insert_own ON public.companies FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: companies companies_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_select_own ON public.companies FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: companies companies_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_update_own ON public.companies FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_delete ON public.deals FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: deals deals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_insert ON public.deals FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: deals deals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_select ON public.deals FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: deals deals_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_update ON public.deals FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: entitlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

--
-- Name: ghg_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ghg_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: ghg_inventories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ghg_inventories ENABLE ROW LEVEL SECURITY;

--
-- Name: ghg_monthly_emissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ghg_monthly_emissions ENABLE ROW LEVEL SECURITY;

--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_delete ON public.ghg_monthly_emissions FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_insert ON public.ghg_monthly_emissions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_select ON public.ghg_monthly_emissions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_update ON public.ghg_monthly_emissions FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: materiality_assessments matassess_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_delete ON public.materiality_assessments FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: materiality_assessments matassess_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_insert ON public.materiality_assessments FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: materiality_assessments matassess_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_select ON public.materiality_assessments FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: materiality_assessments matassess_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_update ON public.materiality_assessments FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: materiality_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_survey_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_questions materiality_survey_questions_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materiality_survey_questions_owner ON public.materiality_survey_questions TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: materiality_survey_respondents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_survey_respondents ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_respondents materiality_survey_respondents_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materiality_survey_respondents_owner ON public.materiality_survey_respondents TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: materiality_survey_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_survey_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_survey_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_rounds materiality_survey_rounds_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materiality_survey_rounds_owner ON public.materiality_survey_rounds TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: mr_asset_modifiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_asset_modifiers ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_asset_modifiers mr_asset_modifiers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_asset_modifiers_select ON public.mr_asset_modifiers FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_esrs_disclosure_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_esrs_disclosure_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_esrs_disclosure_requirements mr_esrs_disclosure_requirements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_esrs_disclosure_requirements_read ON public.mr_esrs_disclosure_requirements FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_esrs_subtopic_display; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_esrs_subtopic_display ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_esrs_subtopic_display mr_esrs_subtopic_display_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_esrs_subtopic_display_read ON public.mr_esrs_subtopic_display FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_esrs_subtopics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_esrs_subtopics ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_esrs_subtopics mr_esrs_subtopics_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_esrs_subtopics_read ON public.mr_esrs_subtopics FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_esrs_topic_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_esrs_topic_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_esrs_topic_labels mr_esrs_topic_labels_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_esrs_topic_labels_read ON public.mr_esrs_topic_labels FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_esrs_topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_esrs_topics ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_esrs_topics mr_esrs_topics_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_esrs_topics_read ON public.mr_esrs_topics FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_industries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_industries ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_industries mr_industries_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_industries_read ON public.mr_industries FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_industry_hazards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_industry_hazards ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_industry_hazards mr_industry_hazards_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_industry_hazards_read ON public.mr_industry_hazards FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_industry_opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_industry_opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_industry_opportunities mr_industry_opportunities_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_industry_opportunities_read ON public.mr_industry_opportunities FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_industry_subtopic_baselines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_industry_subtopic_baselines ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_industry_subtopic_baselines mr_industry_subtopic_baselines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_industry_subtopic_baselines_read ON public.mr_industry_subtopic_baselines FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_industry_topic_baselines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_industry_topic_baselines ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_industry_topic_baselines mr_industry_topic_baselines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_industry_topic_baselines_read ON public.mr_industry_topic_baselines FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_industry_transition_drivers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_industry_transition_drivers ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_industry_transition_drivers mr_industry_transition_drivers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_industry_transition_drivers_read ON public.mr_industry_transition_drivers FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_jurisdictions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_jurisdictions ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_jurisdictions mr_jurisdictions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_jurisdictions_read ON public.mr_jurisdictions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_model_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_model_config ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_model_config mr_model_config_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_model_config_read ON public.mr_model_config FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_region_aliases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_region_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_region_aliases mr_region_aliases_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_region_aliases_read ON public.mr_region_aliases FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_region_hazards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_region_hazards ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_region_hazards mr_region_hazards_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_region_hazards_read ON public.mr_region_hazards FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_regions mr_regions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_regions_read ON public.mr_regions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_scenarios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_scenarios ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_scenarios mr_scenarios_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_scenarios_read ON public.mr_scenarios FOR SELECT TO authenticated, anon USING (true);


--
-- Name: mr_stakeholder_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_stakeholder_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_stakeholder_categories mr_stakeholder_categories_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_stakeholder_categories_read ON public.mr_stakeholder_categories FOR SELECT TO authenticated, anon USING (true);


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_consents purchase_consents_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_consents_delete ON public.purchase_consents FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: purchase_consents purchase_consents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_consents_insert ON public.purchase_consents FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: purchase_consents purchase_consents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_consents_select ON public.purchase_consents FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: purchase_consents purchase_consents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_consents_update ON public.purchase_consents FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: entitlements read own entitlements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own entitlements" ON public.entitlements FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: supplier_responses responses_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY responses_select_own ON public.supplier_responses FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.campaign_suppliers s
     JOIN public.supplier_campaigns c ON ((c.id = s.campaign_id)))
  WHERE ((s.id = supplier_responses.campaign_supplier_id) AND (c.buyer_id = auth.uid())))));


--
-- Name: sbti_company_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_company_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_company_profile sbti_company_profile_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_delete ON public.sbti_company_profile FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_company_profile sbti_company_profile_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_insert ON public.sbti_company_profile FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: sbti_company_profile sbti_company_profile_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_select ON public.sbti_company_profile FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_company_profile sbti_company_profile_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_update ON public.sbti_company_profile FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: sbti_cycle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_cycle ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_cycle sbti_cycle_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_delete ON public.sbti_cycle FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_cycle sbti_cycle_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_insert ON public.sbti_cycle FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: sbti_cycle sbti_cycle_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_select ON public.sbti_cycle FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_cycle sbti_cycle_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_update ON public.sbti_cycle FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: sbti_scope3_coverage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_scope3_coverage ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_delete ON public.sbti_scope3_coverage FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_insert ON public.sbti_scope3_coverage FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_select ON public.sbti_scope3_coverage FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_update ON public.sbti_scope3_coverage FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: sbti_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_targets sbti_targets_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_delete ON public.sbti_targets FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_targets sbti_targets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_insert ON public.sbti_targets FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: sbti_targets sbti_targets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_select ON public.sbti_targets FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: sbti_targets sbti_targets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_update ON public.sbti_targets FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: scope3_inventories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scope3_inventories ENABLE ROW LEVEL SECURITY;

--
-- Name: scope3_inventories scope3_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scope3_owner_all ON public.scope3_inventories USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: source_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.source_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_documents supplier_documents_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_documents_owner ON public.supplier_documents TO authenticated USING ((campaign_supplier_id IN ( SELECT cs.id
   FROM (public.campaign_suppliers cs
     JOIN public.supplier_campaigns sc ON ((sc.id = cs.campaign_id)))
  WHERE (sc.buyer_id = auth.uid())))) WITH CHECK ((campaign_supplier_id IN ( SELECT cs.id
   FROM (public.campaign_suppliers cs
     JOIN public.supplier_campaigns sc ON ((sc.id = cs.campaign_id)))
  WHERE (sc.buyer_id = auth.uid()))));


--
-- Name: supplier_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_suppliers suppliers_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_delete_own ON public.campaign_suppliers FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = auth.uid())))));


--
-- Name: campaign_suppliers suppliers_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_insert_own ON public.campaign_suppliers FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = auth.uid())))));


--
-- Name: campaign_suppliers suppliers_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_select_own ON public.campaign_suppliers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = auth.uid())))));


--
-- Name: campaign_suppliers suppliers_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_update_own ON public.campaign_suppliers FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = auth.uid())))));


--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions users_own_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_own_subscriptions ON public.user_subscriptions USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: verifier_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verifier_access ENABLE ROW LEVEL SECURITY;

--
-- Name: verifier_access verifier_access_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY verifier_access_owner ON public.verifier_access TO authenticated USING ((customer_user_id = auth.uid())) WITH CHECK ((customer_user_id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION cbam_verifier_accept_invite(p_token uuid, p_email text, p_consent_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cbam_verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cbam_verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) TO anon;
GRANT ALL ON FUNCTION public.cbam_verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) TO authenticated;
GRANT ALL ON FUNCTION public.cbam_verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) TO service_role;


--
-- Name: FUNCTION cbam_verifier_audit_history(p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cbam_verifier_audit_history(p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cbam_verifier_audit_history(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.cbam_verifier_audit_history(p_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cbam_verifier_audit_history(p_token uuid) TO service_role;


--
-- Name: FUNCTION cbam_verifier_validate_token(p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cbam_verifier_validate_token(p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cbam_verifier_validate_token(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.cbam_verifier_validate_token(p_token uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cbam_verifier_validate_token(p_token uuid) TO service_role;


--
-- Name: FUNCTION deal_assessment_get(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.deal_assessment_get(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.deal_assessment_get(p_token text) TO anon;
GRANT ALL ON FUNCTION public.deal_assessment_get(p_token text) TO authenticated;


--
-- Name: FUNCTION get_verifier_inventory(p_token uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_verifier_inventory(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.get_verifier_inventory(p_token uuid) TO authenticated;


--
-- Name: FUNCTION portal_get(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.portal_get(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.portal_get(p_token text) TO anon;
GRANT ALL ON FUNCTION public.portal_get(p_token text) TO authenticated;


--
-- Name: FUNCTION portal_save_response(p_token text, p_section text, p_question_id text, p_response text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.portal_save_response(p_token text, p_section text, p_question_id text, p_response text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.portal_save_response(p_token text, p_section text, p_question_id text, p_response text) TO anon;
GRANT ALL ON FUNCTION public.portal_save_response(p_token text, p_section text, p_question_id text, p_response text) TO authenticated;


--
-- Name: FUNCTION portal_submit(p_token text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.portal_submit(p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.portal_submit(p_token text) TO anon;
GRANT ALL ON FUNCTION public.portal_submit(p_token text) TO authenticated;


--
-- Name: FUNCTION verifier_accept_invite(p_token uuid, p_email text, p_consent_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) TO anon;
GRANT ALL ON FUNCTION public.verifier_accept_invite(p_token uuid, p_email text, p_consent_version text) TO authenticated;


--
-- Name: TABLE audit_log; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.audit_log TO anon;
GRANT REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.audit_log TO service_role;


--
-- Name: TABLE campaign_suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.campaign_suppliers TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.campaign_suppliers TO authenticated;
GRANT ALL ON TABLE public.campaign_suppliers TO service_role;


--
-- Name: TABLE cbam_benchmarks; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_benchmarks TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_benchmarks TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_benchmarks TO service_role;


--
-- Name: TABLE cbam_charge_mix; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_charge_mix TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_charge_mix TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_charge_mix TO service_role;


--
-- Name: TABLE cbam_cn_codes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_cn_codes TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_cn_codes TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_cn_codes TO service_role;


--
-- Name: TABLE cbam_cn_map; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_cn_map TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_cn_map TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_cn_map TO service_role;


--
-- Name: TABLE cbam_default_values; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_default_values TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_default_values TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_default_values TO service_role;


--
-- Name: TABLE cbam_goods_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_goods_categories TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_goods_categories TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_goods_categories TO service_role;


--
-- Name: TABLE cbam_grid_factors; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_grid_factors TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_grid_factors TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_grid_factors TO service_role;


--
-- Name: TABLE cbam_installation_disclosures; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_installation_disclosures TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_installation_disclosures TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_installation_disclosures TO service_role;


--
-- Name: TABLE cbam_installations; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_installations TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_installations TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_installations TO service_role;


--
-- Name: TABLE cbam_operator_profile; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_operator_profile TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_operator_profile TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_operator_profile TO service_role;


--
-- Name: TABLE cbam_origin_countries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_origin_countries TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_origin_countries TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_origin_countries TO service_role;


--
-- Name: TABLE cbam_precursor_edges; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_precursor_edges TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_precursor_edges TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_precursor_edges TO service_role;


--
-- Name: TABLE cbam_precursor_inputs; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_precursor_inputs TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_precursor_inputs TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_precursor_inputs TO service_role;


--
-- Name: TABLE cbam_process_parameters; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_process_parameters TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_process_parameters TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_process_parameters TO service_role;


--
-- Name: TABLE cbam_production_processes; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_production_processes TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_production_processes TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_production_processes TO service_role;


--
-- Name: TABLE cbam_production_routes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_production_routes TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_production_routes TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_production_routes TO service_role;


--
-- Name: TABLE cbam_see_records; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_see_records TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_see_records TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_see_records TO service_role;


--
-- Name: TABLE cbam_sefa_params; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.cbam_sefa_params TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.cbam_sefa_params TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_sefa_params TO service_role;


--
-- Name: TABLE cbam_source_documents; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_source_documents TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_source_documents TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_source_documents TO service_role;


--
-- Name: TABLE cbam_source_streams; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_source_streams TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_source_streams TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.cbam_source_streams TO service_role;


--
-- Name: TABLE cbam_verifier_access; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.cbam_verifier_access TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN,UPDATE ON TABLE public.cbam_verifier_access TO authenticated;
GRANT ALL ON TABLE public.cbam_verifier_access TO service_role;


--
-- Name: TABLE companies; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.companies TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.companies TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.companies TO service_role;


--
-- Name: TABLE deals; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.deals TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.deals TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.deals TO service_role;


--
-- Name: TABLE entitlements; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.entitlements TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.entitlements TO authenticated;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.entitlements TO service_role;


--
-- Name: TABLE ghg_entries; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.ghg_entries TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.ghg_entries TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ghg_entries TO service_role;


--
-- Name: TABLE ghg_inventories; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.ghg_inventories TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.ghg_inventories TO authenticated;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ghg_inventories TO service_role;


--
-- Name: COLUMN ghg_inventories.factor_editions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(factor_editions),INSERT(factor_editions),UPDATE(factor_editions) ON TABLE public.ghg_inventories TO authenticated;
GRANT SELECT(factor_editions) ON TABLE public.ghg_inventories TO service_role;


--
-- Name: TABLE ghg_monthly_emissions; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.ghg_monthly_emissions TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.ghg_monthly_emissions TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.ghg_monthly_emissions TO service_role;


--
-- Name: TABLE materiality_assessments; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.materiality_assessments TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN,UPDATE ON TABLE public.materiality_assessments TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.materiality_assessments TO service_role;


--
-- Name: TABLE materiality_survey_questions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.materiality_survey_questions TO authenticated;
GRANT ALL ON TABLE public.materiality_survey_questions TO service_role;


--
-- Name: TABLE materiality_survey_respondents; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.materiality_survey_respondents TO authenticated;
GRANT ALL ON TABLE public.materiality_survey_respondents TO service_role;


--
-- Name: TABLE materiality_survey_responses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.materiality_survey_responses TO service_role;


--
-- Name: TABLE materiality_survey_rounds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.materiality_survey_rounds TO authenticated;
GRANT ALL ON TABLE public.materiality_survey_rounds TO service_role;


--
-- Name: TABLE mr_asset_modifiers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_asset_modifiers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_asset_modifiers TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_asset_modifiers TO service_role;


--
-- Name: TABLE mr_esrs_disclosure_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mr_esrs_disclosure_requirements TO anon;
GRANT SELECT ON TABLE public.mr_esrs_disclosure_requirements TO authenticated;
GRANT SELECT ON TABLE public.mr_esrs_disclosure_requirements TO service_role;


--
-- Name: TABLE mr_esrs_subtopic_display; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mr_esrs_subtopic_display TO anon;
GRANT SELECT ON TABLE public.mr_esrs_subtopic_display TO authenticated;
GRANT SELECT ON TABLE public.mr_esrs_subtopic_display TO service_role;


--
-- Name: TABLE mr_esrs_subtopics; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mr_esrs_subtopics TO anon;
GRANT SELECT ON TABLE public.mr_esrs_subtopics TO authenticated;
GRANT SELECT ON TABLE public.mr_esrs_subtopics TO service_role;


--
-- Name: TABLE mr_esrs_topic_labels; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mr_esrs_topic_labels TO anon;
GRANT SELECT ON TABLE public.mr_esrs_topic_labels TO authenticated;
GRANT SELECT ON TABLE public.mr_esrs_topic_labels TO service_role;


--
-- Name: TABLE mr_esrs_topics; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_esrs_topics TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_esrs_topics TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_esrs_topics TO service_role;


--
-- Name: TABLE mr_industries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_industries TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_industries TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_industries TO service_role;


--
-- Name: TABLE mr_industry_hazards; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_industry_hazards TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_industry_hazards TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_industry_hazards TO service_role;


--
-- Name: TABLE mr_industry_opportunities; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_industry_opportunities TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_industry_opportunities TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_industry_opportunities TO service_role;


--
-- Name: TABLE mr_industry_subtopic_baselines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mr_industry_subtopic_baselines TO anon;
GRANT SELECT ON TABLE public.mr_industry_subtopic_baselines TO authenticated;
GRANT SELECT ON TABLE public.mr_industry_subtopic_baselines TO service_role;


--
-- Name: TABLE mr_industry_topic_baselines; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_industry_topic_baselines TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_industry_topic_baselines TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_industry_topic_baselines TO service_role;


--
-- Name: TABLE mr_industry_transition_drivers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_industry_transition_drivers TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_industry_transition_drivers TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_industry_transition_drivers TO service_role;


--
-- Name: TABLE mr_jurisdictions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_jurisdictions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_jurisdictions TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_jurisdictions TO service_role;


--
-- Name: TABLE mr_model_config; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_model_config TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_model_config TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_model_config TO service_role;


--
-- Name: TABLE mr_region_aliases; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_region_aliases TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_region_aliases TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_region_aliases TO service_role;


--
-- Name: TABLE mr_region_hazards; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_region_hazards TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_region_hazards TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_region_hazards TO service_role;


--
-- Name: TABLE mr_regions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_regions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_regions TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_regions TO service_role;


--
-- Name: TABLE mr_scenarios; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.mr_scenarios TO anon;
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.mr_scenarios TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.mr_scenarios TO service_role;


--
-- Name: TABLE mr_stakeholder_categories; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mr_stakeholder_categories TO anon;
GRANT SELECT ON TABLE public.mr_stakeholder_categories TO authenticated;
GRANT SELECT ON TABLE public.mr_stakeholder_categories TO service_role;


--
-- Name: TABLE organizations; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.organizations TO anon;
GRANT REFERENCES,TRIGGER,MAINTAIN ON TABLE public.organizations TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.organizations TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.profiles TO anon;
GRANT REFERENCES,TRIGGER,MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO service_role;


--
-- Name: TABLE purchase_consents; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.purchase_consents TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.purchase_consents TO authenticated;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE public.purchase_consents TO service_role;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.rate_limits TO anon;
GRANT REFERENCES,TRIGGER,MAINTAIN ON TABLE public.rate_limits TO authenticated;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.rate_limits TO service_role;


--
-- Name: TABLE sbti_company_profile; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.sbti_company_profile TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.sbti_company_profile TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sbti_company_profile TO service_role;


--
-- Name: TABLE sbti_cycle; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.sbti_cycle TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.sbti_cycle TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sbti_cycle TO service_role;


--
-- Name: TABLE sbti_scope3_coverage; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.sbti_scope3_coverage TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.sbti_scope3_coverage TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sbti_scope3_coverage TO service_role;


--
-- Name: TABLE sbti_targets; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.sbti_targets TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.sbti_targets TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sbti_targets TO service_role;


--
-- Name: TABLE scope3_inventories; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.scope3_inventories TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.scope3_inventories TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.scope3_inventories TO service_role;


--
-- Name: TABLE source_documents; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.source_documents TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.source_documents TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.source_documents TO service_role;


--
-- Name: TABLE supplier_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.supplier_campaigns TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.supplier_campaigns TO authenticated;
GRANT ALL ON TABLE public.supplier_campaigns TO service_role;


--
-- Name: TABLE supplier_documents; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supplier_documents TO service_role;


--
-- Name: TABLE supplier_responses; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.supplier_responses TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.supplier_responses TO authenticated;
GRANT ALL ON TABLE public.supplier_responses TO service_role;


--
-- Name: TABLE user_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.user_subscriptions TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.user_subscriptions TO authenticated;
GRANT ALL ON TABLE public.user_subscriptions TO service_role;


--
-- Name: TABLE verifier_access; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.verifier_access TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN,UPDATE ON TABLE public.verifier_access TO authenticated;
GRANT ALL ON TABLE public.verifier_access TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict Wbek6ypKBpgEseOhAslrbazrWj8CDl9eGO8dAONLq0LxqqDcAKt8qOzlqfqa3Zq

