--
-- PostgreSQL database dump
--

\restrict edMjCt1q85Qc4EiDBg49hp2PwF3ZgC4Y26fZcPJH3VOVl10qa51G56YSC2aIA8M

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
-- Name: materiality_iro_ref; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.materiality_iro_ref AS (
	subtopic_code text,
	iro_key text
);


--
-- Name: TYPE materiality_iro_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TYPE public.materiality_iro_ref IS 'One unit of determination: an ESRS sub-topic, and which IRO under it. iro_key = '''' is the sub-topic taken as a whole. Exists so materiality_lead_submit can hold scope and held-scope in single arrays rather than two indexed in lockstep, which is what makes its one-pass guarantee real rather than claimed.';


--
-- Name: assert_sector_codes_exist(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_sector_codes_exist() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  bad text;
begin
  if tg_table_name = 'supply_chain_registers' then
    -- Every element of the suppliers array must carry a sector that exists and is an industry.
    -- A null or absent sector is rejected too: the CSV import path used to default it silently,
    -- and an absent sector reaching storage is the defect that made this necessary.
    -- ⚠️ coalesce, NOT a bare s.sector. string_agg SKIPS NULLS, so aggregating the raw column
    -- would leave `bad` null when every offending row had a MISSING sector - the exact case this
    -- check exists for - and the trigger would raise nothing at all.
    select string_agg(distinct coalesce(s.sector, '(missing)'), ', ')
      into bad
      from jsonb_to_recordset(new.suppliers) as s(sector text)
     where s.sector is null
        or not exists (select 1 from public.exiobase_sectors e
                        where e.exio_code = s.sector and e.factor_type = 'industry');
    if bad is not null then
      raise exception 'Unknown sector code(s) in suppliers: %', bad using errcode = 'PT422';
    end if;
    return new;
  end if;

  if tg_table_name = 'scope3_inventories' then
    -- Two known paths carry a sector inside cat_data. Both are optional; both must be valid when
    -- present. Listed explicitly rather than scanned, so a new sector-bearing path has to be added
    -- here consciously instead of being silently unvalidated.
    select string_agg(v, ', ')
      into bad
      from (values (new.cat_data #>> '{cat1,supplier_sector}'),
                   (new.cat_data #>> '{cat15,portfolio_sector}')) as t(v)
     where v is not null
       and not exists (select 1 from public.exiobase_sectors e
                        where e.exio_code = v and e.factor_type = 'industry');
    if bad is not null then
      raise exception 'Unknown sector code(s) in cat_data: %', bad using errcode = 'PT422';
    end if;
    return new;
  end if;

  return new;
end $$;


--
-- Name: FUNCTION assert_sector_codes_exist(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.assert_sector_codes_exist() IS 'Validates sector codes held inside jsonb, which no CHECK constraint can do: CHECK forbids subqueries, so membership in exiobase_sectors is unreachable from one. Covers supply_chain_registers.suppliers[].sector and scope3_inventories.cat_data cat1.supplier_sector and cat15.portfolio_sector. Raises SQLSTATE PT422.';


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
-- Name: enforce_cbam_entitlement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_cbam_entitlement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_user_id       uuid;
  has_active      boolean;
  had_entitlement boolean;
begin
  select c.user_id into v_user_id
    from public.companies c
   where c.id = new.company_id;

  if v_user_id is null then
    raise exception using
      errcode = 'PT402',
      message = 'Could not establish who owns this installation, so it was not saved. Reload the page and try again.';
  end if;

  select exists (
    select 1 from public.entitlements e
    where e.user_id = v_user_id
      and e.module_key = 'cbam'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    select exists (
      select 1 from public.entitlements e
      where e.user_id = v_user_id
        and e.module_key = 'cbam'
    ) into had_entitlement;

    if had_entitlement then
      raise exception using
        errcode = 'PT402',
        message = 'Your CBAM access has expired. Renew to add another installation. Your existing installations are still here and still readable.';
    else
      raise exception using
        errcode = 'PT402',
        message = 'Adding an installation requires the CBAM module. Your entries are still on screen — purchase to save them.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: enforce_concierge_job_open(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_concierge_job_open() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_job_id      uuid;
  v_status      text;
  -- The staff-id columns on THIS table, mirroring STAFF_ID_COLUMNS in
  -- scripts/erase-account.mjs. Two copies of one fact, and the only two there are:
  -- the script cannot read this function and this function cannot read the script.
  -- If either list changes, change both in the same commit.
  v_staff_cols  text[];
  v_old         jsonb;
  v_new         jsonb;
  v_col         text;
  v_changed     boolean := false;
  v_only_blanks boolean := true;
begin
  case tg_table_name
    when 'concierge_job_documents' then
      v_job_id := new.job_id;
      v_staff_cols := array['updated_by'];
    when 'concierge_proposals' then
      select d.job_id into v_job_id
        from public.concierge_job_documents d
       where d.id = new.job_document_id;
      v_staff_cols := array['extracted_by', 'updated_by'];
    else
      raise exception 'enforce_concierge_job_open() is attached to an unexpected table (%). Attach it only to concierge_job_documents or concierge_proposals.', tg_table_name;
  end case;

  -- A row whose parent cannot be found is refused rather than allowed. The foreign keys make this
  -- unreachable for INSERT; it is here so the function has no branch that falls through silently.
  if v_job_id is null then
    raise exception 'Could not resolve the concierge job for this row. Nothing was written.';
  end if;

  select j.status into v_status from public.concierge_jobs j where j.id = v_job_id;

  if v_status = 'ready' then
    -- ── THE ONE EXEMPTION: A STAFF-ID BLANKING, AND NOTHING ELSE ─────────────────────────────
    --
    -- The freeze protects THE DELIVERED FIGURES — the numbers, periods, units and quotes the
    -- customer was handed and may already have confirmed. Setting a staff id to null changes no
    -- figure. It removes the record of WHICH THEMISIQ PERSON typed one, which is not part of what
    -- the customer was delivered and not something a verifier reads.
    --
    -- This is the same line the freeze already draws for DELETE, one operation over: erasure must
    -- not be blocked by a rule about editing. Without this branch, scripts/erase-account.mjs
    -- cannot blank a departing reviewer's id on a delivered job, its residual check then finds
    -- that id still present, and the whole erasure rolls back — leaving a staff account that can
    -- never be erased once any job they touched has shipped.
    --
    -- ⚠️ THE THREE CONDITIONS ARE ALL LOAD-BEARING, AND THE THIRD IS THE ONE THAT MAKES IT SAFE.
    --   (1) every staff-id column is unchanged, or changing from non-null to NULL — so this can
    --       never REASSIGN a figure to a different person, only forget who it was;
    --   (2) at least one is actually changing — so a no-op UPDATE cannot be used to wave through
    --       an otherwise-identical row and quietly refresh nothing;
    --   (3) EVERY other column, updated_at included, is identical — so a figure edit cannot ride
    --       along with a blanking in the same statement. updated_at is in that set deliberately:
    --       the blanking is an erasure obligation, not a review action, and must not present as
    --       one in the audit trail.
    --
    -- The comparison is jsonb, so it is value-identity rather than literally byte-identity: a
    -- numeric rewritten from 1.0 to 1.00 would compare equal. That is the same number, so it is
    -- not a figure change — but the distinction is stated rather than glossed.
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);

      -- (3) first, because it is the cheapest way to reject the common case.
      if (v_new - v_staff_cols) = (v_old - v_staff_cols) then
        foreach v_col in array v_staff_cols loop
          if v_new -> v_col is distinct from v_old -> v_col then
            v_changed := true;
            -- (1) a change is only ever TO NULL. `->>` is deliberate: to_jsonb renders a SQL NULL
            -- column as jsonb 'null', which `->` returns as a non-NULL jsonb value, so `->` would
            -- never look null here. `->>` returns SQL NULL for it, which is the test wanted.
            if v_new ->> v_col is not null then
              v_only_blanks := false;
            end if;
          end if;
        end loop;

        -- (2) at least one, or this is a no-op dressed as a blanking.
        if v_changed and v_only_blanks then
          return new;
        end if;
      end if;
    end if;

    raise exception 'This concierge job is marked ready and its documents and figures are frozen. Open a follow-up round instead of editing a delivered one.';
  end if;

  return new;
end;
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
-- Name: enforce_materiality_entitlement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_materiality_entitlement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  has_active      boolean;
  had_entitlement boolean;
begin
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.user_id
      and e.module_key = 'double-materiality'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.user_id
        and e.module_key = 'double-materiality'
    ) into had_entitlement;

    if had_entitlement then
      raise exception using
        errcode = 'PT402',
        message = 'Your Materiality Assessment access has expired. Renew to start a new assessment. Your existing assessments are still here and still readable.';
    else
      raise exception using
        errcode = 'PT402',
        message = 'Starting an assessment requires the Materiality Assessment module. Your answers are still on screen — purchase to save them.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: enforce_supply_chain_entitlement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_supply_chain_entitlement() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  has_active      boolean;
  had_entitlement boolean;
begin
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.user_id
      and e.module_key = 'supply-chain'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.user_id
        and e.module_key = 'supply-chain'
    ) into had_entitlement;

    if had_entitlement then
      raise exception using
        errcode = 'PT402',
        message = 'Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.';
    else
      raise exception using
        errcode = 'PT402',
        message = 'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.';
    end if;
  end if;

  return new;
end;
$$;


--
-- Name: enforce_verifier_invite_term(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_verifier_invite_term() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_catalog'
    AS $$
declare
  v_module     text;
  v_label      text;
  has_active   boolean;
  had_entitlement boolean;
begin
  -- Module key from the table this fired on. Keys are the canonical ModuleKey
  -- values in lib/pricing.ts; the label is what the customer reads.
  case tg_table_name
    when 'verifier_access'      then v_module := 'ghg';  v_label := 'GHG';
    when 'cbam_verifier_access' then v_module := 'cbam'; v_label := 'CBAM';
    else
      raise exception 'enforce_verifier_invite_term() is attached to an unexpected table (%). Attach it only to verifier_access or cbam_verifier_access.', tg_table_name;
  end case;

  -- An ACTIVE pass is required to MINT a grant. Strictly greater, matching
  -- enforce_ghg_location_allowance() and enforce_deals_free_tier_cap(): a term
  -- ending exactly now is over.
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.customer_user_id
      and e.module_key = v_module
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    -- The SAME query WITHOUT the term clause. The difference between the two is
    -- the whole point: it separates "expired" from "never bought", which is a
    -- distinction only the customer can act on. Told the wrong one, a lapsed
    -- customer is invited to buy something they already own.
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.customer_user_id
        and e.module_key = v_module
    ) into had_entitlement;

    if had_entitlement then
      -- READ VERBATIM inside "Could not create invitation: " — createInvite() does
      -- alert('Could not create invitation: ' + error.message) in both dashboards.
      -- SENTENCE TWO IS THE LOAD-BEARING ONE. A customer meeting this has a verifier
      -- mid-engagement, and their first question is whether the links they already
      -- sent have just died. They have not: this trigger is BEFORE INSERT only and
      -- nothing here touches an existing row. Do not remove that sentence, and do
      -- not let it become untrue — if grants are ever revoked at term end, this
      -- message must change in the same commit.
      raise exception 'Your % access has expired, so new verifier invitations are paused. Verifier links you have already sent are unaffected and keep working until they expire. Renew to invite another verifier.', v_label;
    else
      raise exception 'Inviting a verifier requires the % module.', v_label;
    end if;
  end if;

  return new;
end;
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
-- Name: impact_determination_json(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impact_determination_json(p_assessment_id uuid, p_subtopic_code text, p_direction text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
           'nature',               d.nature,
           'scale',                d.scale,
           'scope',                d.scope,
           'irremediability',      d.irremediability,
           'likelihood',           d.likelihood,
           -- to_jsonb on named array COLUMNS, never on a table row. See 20260840's header.
           'abstained_dimensions', to_jsonb(d.abstained_dimensions),
           'value_chain_position', to_jsonb(d.value_chain_position),
           'time_horizon',         d.time_horizon,
           'rationale',            d.rationale,
           'status',               d.status)
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction
     -- The sub-topic taken as a whole. A contributor never determines a named IRO in this phase —
     -- §4 keeps those with the lead — so this is not a filter on what they may see, it is the
     -- restoration of the one-row guarantee the function's return type depends on.
     and d.iro_key       = ''
     and d.axis          = 'impact';
$$;


--
-- Name: FUNCTION impact_determination_json(p_assessment_id uuid, p_subtopic_code text, p_direction text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.impact_determination_json(p_assessment_id uuid, p_subtopic_code text, p_direction text) IS 'One determination as jsonb, for the contributor payload. PINS ALL FIVE KEY COLUMNS: the three arguments plus iro_key = '''''''' and axis = ''''impact''''. Without those two the query can match several rows and a `language sql` function returning a scalar takes THE FIRST AND DISCARDS THE REST silently — so a lead naming an IRO under a delegated sub-topic would change what the contributor sees, with nothing raised. Latent from 20260855 until 20260856 made custom IROs creatable.';


--
-- Name: impact_get(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impact_get(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION impact_get(p_token uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.impact_get(p_token uuid) IS 'What one contributor sees: their assignment, the sub-topics assigned to THEM, and their own saved values. ⚠️ THE PROJECTION IS THE EVIDENCE FIREWALL — it contains nothing derived from survey responses, and every key is whitelisted by hand rather than produced by to_jsonb(), which would leak whatever column is added next. short_name is the snapshot taken at assignment time and the survey tables are never joined. question_framing is deliberately withheld: it is the survey''s second-person framing addressed to a respondent about their own workplace, and a worksheet contributor is a different speaker determining a different thing.';


--
-- Name: impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_value_chain_position text[], p_time_horizon text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  on conflict (assessment_id, subtopic_code, axis, direction, iro_key) do update
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


--
-- Name: FUNCTION impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_value_chain_position text[], p_time_horizon text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_value_chain_position text[], p_time_horizon text) IS 'Saves ONE sub-topic in ONE direction as a draft. ⚠️ HAS NO override_reason PARAMETER, AND MUST NEVER GAIN ONE — its absence is what makes 20260839''s lock fail closed on a post-submit contributor write, with no role introspection anywhere. Refuses rather than silently dropping a value the ESRS 1 para 41 constraints forbid: an irremediability on a positive impact and a likelihood on an actual one are both rejected with a sentence, because a form that appears to accept a judgement and discards it is worse than one that says no. evidence_in_view is written false unconditionally. ⚠️ SUPERSEDED BY 20260854: the installed body is the copy in that migration, whose ON CONFLICT names four columns. Nothing calls this overload today — the client sends p_abstained_dimensions and p_rationale and so resolves to the 12-argument version.';


--
-- Name: impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text[], text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_abstained_dimensions text[], p_value_chain_position text[], p_time_horizon text, p_rationale text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  v_abst          text[];
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

  if p_scale           is not null and p_scale           not between 1 and 4
  or p_scope           is not null and p_scope           not between 1 and 4
  or p_irremediability is not null and p_irremediability not between 1 and 4
  or p_likelihood      is not null and p_likelihood      not between 1 and 4 then
    raise exception
      'Severity dimensions are scored 1-4 (spec §5.3), or recorded as "not enough visibility to '
      'assess" (§6.1). A value outside that range cannot be stored.';
  end if;

  v_abst := coalesce(p_abstained_dimensions, '{}'::text[]);

  if not (v_abst <@ array['scale', 'scope', 'irremediability', 'likelihood']::text[]) then
    raise exception
      'abstained_dimensions may name only scale, scope, irremediability or likelihood.';
  end if;

  -- ⚠️ REFUSED, NOT RECONCILED. If a dimension arrives with both a score and an abstention, the two
  -- contradict and there is no correct one to keep. Dropping either would be this module choosing
  -- what the determiner meant — see the ¶41 refusals below, same principle.
  if ('scale'           = any(v_abst) and p_scale           is not null)
  or ('scope'           = any(v_abst) and p_scope           is not null)
  or ('irremediability' = any(v_abst) and p_irremediability is not null)
  or ('likelihood'      = any(v_abst) and p_likelihood      is not null) then
    raise exception
      'A dimension cannot be both scored and recorded as "not enough visibility to assess". '
      'Nothing was saved — send one or the other.';
  end if;

  -- ⚠️ ¶41, REFUSED RATHER THAN SILENTLY DROPPED — for the abstention as well as for the value. A
  -- dimension that is never asked cannot be abstained on: there is no question to decline.
  if p_direction = 'positive' and (p_irremediability is not null or 'irremediability' = any(v_abst)) then
    raise exception
      'A positive impact carries no irremediability — there is nothing to remediate (ESRS 1 para '
      '41). Your answer was not saved rather than being quietly dropped; remove it and save again.';
  end if;

  if p_nature = 'actual' and (p_likelihood is not null or 'likelihood' = any(v_abst)) then
    raise exception
      'An impact that is already happening carries no likelihood (ESRS 1 para 41). Applying one to '
      'an actual impact understates its severity. Your answer was not saved rather than being '
      'quietly dropped; remove it and save again.';
  end if;

  if not exists (
    select 1 from public.materiality_impact_assignment_subtopics s
     where s.assignment_id = v_assignment_id
       and s.subtopic_code = p_subtopic_code) then
    raise exception
      'That sub-topic is not part of your assignment. Reload the page — it may have been reassigned.'
      using errcode = 'no_data_found';
  end if;

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
    abstained_dimensions, value_chain_position, time_horizon, rationale,
    evidence_in_view, assignment_id, status)
  values (
    v_assessment_id, v_user_id, p_subtopic_code, v_version, p_direction,
    p_nature, p_scale, p_scope, p_irremediability, p_likelihood,
    v_abst, coalesce(p_value_chain_position, '{}'::text[]), p_time_horizon, p_rationale,
    false, v_assignment_id, 'draft')
  on conflict (assessment_id, subtopic_code, axis, direction, iro_key) do update
     set nature               = excluded.nature,
         scale                = excluded.scale,
         scope                = excluded.scope,
         irremediability      = excluded.irremediability,
         likelihood           = excluded.likelihood,
         abstained_dimensions = excluded.abstained_dimensions,
         value_chain_position = excluded.value_chain_position,
         time_horizon         = excluded.time_horizon,
         rationale            = excluded.rationale,
         assignment_id        = excluded.assignment_id,
         evidence_in_view     = false;
end $$;


--
-- Name: FUNCTION impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_abstained_dimensions text[], p_value_chain_position text[], p_time_horizon text, p_rationale text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_abstained_dimensions text[], p_value_chain_position text[], p_time_horizon text, p_rationale text) IS 'Saves ONE sub-topic in ONE direction as a draft, carrying abstained dimensions and a free-text rationale. THIS is the overload app/impact/[token]/page.tsx calls. ⚠️ SUPERSEDED BY 20260854: the installed body is the copy in that migration, whose ON CONFLICT names four columns. Edit it there.';


--
-- Name: impact_submit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.impact_submit(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  v_assigned      int;
  v_rows          int;
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  -- ⚠️ NOTHING ASSIGNED IS NOT THE SAME AS EVERYTHING FINISHED, AND THE GATE BELOW CANNOT TELL
  -- THEM APART. Its subquery walks materiality_impact_assignment_subtopics; with no rows there is
  -- nothing to be missing, string_agg over an empty set returns NULL, and v_missing is null exactly
  -- as it is when the work is complete. So the gate would pass, the UPDATE would match nothing, and
  -- the contributor would be thanked for nothing all over again — through a different door, with
  -- the predicate fix in place. This is checked HERE, before the gate, because it is a different
  -- fact needing a different sentence.
  --
  -- ⚠️ REACHABLE THROUGH THE PRODUCT, not only by hand. materiality_impact_reassign_subtopic
  -- (20260839) moves a sub-topic to another assignment, so a contributor invited holding two can be
  -- left holding none; and materiality_impact_resolve_token checks revoked, expired and submitted
  -- but never scope, so their link still opens.
  select count(*) into v_assigned
    from public.materiality_impact_assignment_subtopics s
   where s.assignment_id = v_assignment_id;

  if v_assigned = 0 then
    -- ⚠️ WHAT IS OBSERVED, NOT WHY. Two things produce this — sub-topics not yet assigned, and
    -- sub-topics moved away after the link was sent — and nothing here can tell which. Naming one
    -- would be a diagnosis this function cannot make, so it names both and points at the person who
    -- can tell them apart.
    raise exception
      'No sub-topics are assigned to you, so there is nothing to submit. They may not have been '
      'assigned yet, or they may have been moved to someone else since this link was sent. Whoever '
      'sent you the link can see which it is and put it right — nothing you have done is lost.';
  end if;

  -- ⚠️ COMPLETE BY WHOM. This gate asks whether every sub-topic assigned to THIS contributor
  -- carries both directions with a nature, DETERMINED BY THIS ASSIGNMENT. Until 20260853 it asked
  -- only whether such a determination existed at all, and a row made by the lead — assignment_id
  -- null, already submitted — satisfied it. The UPDATE below then filters on
  -- `assignment_id = v_assignment_id and status = 'draft'`, matched nothing, and the contributor
  -- was returned {"submitted": 0} and shown a Thank-you page reading "0 determinations recorded
  -- against your name". Reproduced in production 23 Aug 2026: assignment ba169d39, two sub-topics
  -- (E1.1, E1.2) both determined by the lead on 20 Aug, submitted, zero rows flipped.
  --
  -- The gate and the UPDATE have to describe the SAME set. They did not, and everything between
  -- them succeeded.
  --
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
         -- ⚠️ THE FIX (20260853). ON THE JOIN, NOT IN THE WHERE — a predicate on the null side of a
         -- LEFT JOIN belongs in the ON clause; moved to WHERE it would discard the very rows that
         -- signal "nobody has determined this", and the gate would pass on an empty worksheet.
         and d.assignment_id = v_assignment_id
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

  -- ⚠️ v_rows CAN STILL BE 0, BY ONE PATH, AND IT IS NOT FIXED HERE — A DOUBLE SUBMIT.
  -- materiality_lead_submit's comment reasons that its own zero "can only mean the work was already
  -- submitted", because its completeness check has just proved a row exists for every held
  -- sub-topic. After the two changes above that reasoning NEARLY transfers to this function, and
  -- this race is the whole difference:
  --
  --   Under READ COMMITTED two concurrent calls on one token — a double-clicked button — can both
  --   pass resolve_token if neither has committed when the other reads. T2's determinations UPDATE
  --   then blocks on T1's row locks, RE-EVALUATES `status = 'draft'` after T1 commits, and matches
  --   zero. The assignment UPDATE that follows has NO status predicate (`where g.id =
  --   v_assignment_id`), so `found` is true and the guard immediately above does not fire. T2
  --   returns submitted 0 with assigned k > 0.
  --
  -- Left deliberately. It needs either a `for update` on the assignment row or a status predicate
  -- on that second UPDATE, both of which change the locking behaviour of the one function a
  -- contributor's work passes through, and neither is worth doing blind — the observable symptom is
  -- now an honest "already submitted" on the Thank-you page rather than a false confirmation,
  -- because assigned > 0 tells the page which zero this is. A second migration if it ever bites.
  return jsonb_build_object('submitted', v_rows, 'assigned', v_assigned);
end $$;


--
-- Name: FUNCTION impact_submit(p_token uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.impact_submit(p_token uuid) IS 'One-way. Flips every one of this contributor''s determinations to submitted, then the assignment itself — in that order, because reversing it would make resolve_token refuse before the rows were flipped and strand submitted work under a submitted assignment. Refuses an assignment holding NO sub-topics with its own sentence (the completeness gate cannot: string_agg over an empty set is NULL, indistinguishable from finished), and refuses while any assigned sub-topic lacks a direction-and-nature IN A DETERMINATION MADE BY THIS ASSIGNMENT, NAMING which: the dimensions may be null (a §6.1 abstention is a real answer) but a determination with no stated nature is not a determination. ⚠️ THE assignment_id PREDICATE IS LOAD-BEARING AND WAS ADDED BY 20260853 — without it a determination made by the LEAD satisfied the gate, the UPDATE that follows matched nothing, and the contributor was thanked for zero determinations. Returns {submitted, assigned}: the pair, not the scalar, because a bare zero cannot tell nothing-was-assigned from already-submitted and the page must not infer a cause it cannot verify. ⚠️ KNOWN LIMITATION: a contributor assigned a sub-topic the lead has already SUBMITTED is refused and cannot proceed, because impact_save_determination will not overwrite a submitted row and the conflict target (assessment_id, subtopic_code, direction) admits only one determination per direction — so their judgement could only replace the lead''s, never stand beside it. Letting both stand is a schema change (widen the key, then every reader) and is on the backlog; the workflow that avoids it is to assign before determining. ⚠️ KNOWN RACE: a double submit can still return submitted 0 with assigned > 0 — see the comment on the second UPDATE. After this the token no longer admits the holder — resolve_token returns PT410 with the sentence that their work was received.';


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
-- Name: materiality_assessment_standard_version_agrees(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_assessment_standard_version_agrees() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_rows    int;
  v_carried text;
begin
  -- IS NOT DISTINCT FROM: `before update of standard_version` fires whenever the column appears in
  -- the SET list, changed or not, so an UPDATE that rewrites the same value must cost nothing. Not
  -- an optimisation — without it, a save from the edit screen that touches only the company name
  -- would be refused on an assessment that is perfectly consistent.
  if NEW.standard_version is not distinct from OLD.standard_version then
    return NEW;
  end if;

  -- ⚠️ COUNTS THE ROWS THAT WOULD DISAGREE AFTER THIS CHANGE, NOT THE ROWS THAT EXIST. This is the
  -- entire difference between a guard and a dead end. With determinations at esrs_2026:
  --   esrs_2026 -> esrs_2023   every row would disagree  -> refused, which is the cause we guard
  --   esrs_2023 -> esrs_2026   no row would disagree     -> PERMITTED, and it is the repair
  -- A rule keyed on `exists (determinations)` refuses both, and there is then no way back from a
  -- disagreement, because determinations cannot be deleted (20260838:593 grants no DELETE) and
  -- neither can the assessment (20260827:153-157).
  select count(*), string_agg(distinct d.standard_version, ', ' order by d.standard_version)
    into v_rows, v_carried
    from public.materiality_impact_determinations d
   where d.assessment_id = NEW.id
     and d.standard_version is distinct from NEW.standard_version;

  if v_rows > 0 then
    raise exception
      'Assessment % cannot move to %: % of its recorded determinations are keyed to %. Sub-topic '
      'codes differ in name, count and structure between ESRS versions, so those determinations '
      'would survive keyed to a taxonomy this assessment no longer uses and would simply stop '
      'appearing — scope comes from mr_esrs_subtopics for the stated version. Setting the version '
      'to what the determinations already carry is permitted and is the repair. Not saved.',
      NEW.id, coalesce(NEW.standard_version, '(none stated)'), v_rows, v_carried
      using errcode = 'PT412';
  end if;

  return NEW;
end $$;


--
-- Name: FUNCTION materiality_assessment_standard_version_agrees(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_assessment_standard_version_agrees() IS 'Refuses a change to materiality_assessments.standard_version that would leave existing determinations disagreeing, errcode PT412. Guards the CAUSE; materiality_impact_determination_assessment_version() guards the consequence, and both are wanted because the two writers of the invariant fail differently — a preparer sends a stale version, while a contributor sends none at all and is refused over a stored value nobody touched. Deliberately NOT "refuse while determinations exist": that stricter rule was the client''s, and it is what made a disagreement terminal, since neither determinations nor assessments can be deleted. Moving the assessment ONTO the version its determinations already carry is permitted, and is the repair path the edit screen offers.';


--
-- Name: materiality_assessment_survey_round_link_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_assessment_survey_round_link_guard() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_round_status   text;
  v_round_version  text;
  v_assess_version text;
  v_assess_exists  boolean;
begin
  select r.status, r.standard_version
    into v_round_status, v_round_version
    from public.materiality_survey_rounds r
   where r.id = new.round_id;

  if v_round_status is null then
    -- The composite FK will refuse this a moment later; raising here keeps the message useful.
    raise exception
      'Survey round % does not exist, or is not owned by the same user as the assessment.',
      new.round_id;
  end if;

  -- ── RULE 1: closed rounds only. ──────────────────────────────────────────────
  if v_round_status <> 'closed' then
    raise exception
      'Survey round % has status ''%'' and cannot inform an assessment until it is closed. An '
      'assessment must consume a frozen survey: a report saying "9 of 12" on Tuesday and "9 of 19" '
      'on Thursday cannot say which it was, and both were true when printed. Viewing is not '
      'consuming — survey_aggregate keeps working on an open round, and watching responses arrive '
      'is what it is for.',
      new.round_id, v_round_status;
  end if;

  select true, a.standard_version
    into v_assess_exists, v_assess_version
    from public.materiality_assessments a
   where a.id = new.assessment_id;

  if v_assess_exists is null then
    raise exception
      'Materiality assessment % does not exist, or is not owned by the same user as the round.',
      new.assessment_id;
  end if;

  -- ── RULE 2: same standard_version, and NULL is its own refusal. ──────────────
  -- ⚠️ NULL MEANS NOT STATED (20260816), which is a real and permitted state and never an assumed
  -- version. It matches no round, and the customer has to be TOLD that rather than shown an empty
  -- result — the fix is theirs to make and they cannot make it if the failure is silent.
  if v_assess_version is null then
    raise exception
      'Assessment % does not state which ESRS version it was prepared under, so no survey round can '
      'inform it. NULL here means NOT STATED — a real state, never an assumed version, because '
      'Article 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state it and an assumed '
      'value would be a false statement about which law was applied. State the version on the '
      'assessment first; this round is built against %.',
      new.assessment_id, v_round_version;
  end if;

  if v_assess_version <> v_round_version then
    raise exception
      'Standard version mismatch: assessment % is prepared under %, survey round % is built against '
      '%. The taxonomies differ in name, in count and in structure, so the round''s answers are '
      'keyed to sub-topic codes that do not exist in the assessment''s taxonomy. This is a data '
      'error, not a presentation one (spec v9 §3.3).',
      new.assessment_id, v_assess_version, new.round_id, v_round_version;
  end if;

  return new;
end $$;


--
-- Name: FUNCTION materiality_assessment_survey_round_link_guard(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_assessment_survey_round_link_guard() IS 'Enforces the two rules a foreign key cannot carry: a round may be linked only while its status is ''closed'', and only when its standard_version equals the assessment''s. The version check CANNOT be an FK — a composite FK would be MATCH SIMPLE, so a NULL standard_version on the assessment would satisfy it without a lookup and a not-stated assessment would silently match every round. Ownership is NOT checked here; it is settled by composite foreign keys on (id, user_id) against both parents. SECURITY DEFINER because materiality_assessments grants service_role no SELECT, so an invoker version would fail a server-side link on the grant rather than on the rule.';


--
-- Name: materiality_assignment_subtopic_no_iros(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_assignment_subtopic_no_iros() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_names text;
begin
  select string_agg('"' || i.name || '"', ', ' order by i.name)
    into v_names
    from public.materiality_custom_iros i
   where i.assessment_id = NEW.assessment_id
     and i.subtopic_code = NEW.subtopic_code;

  if v_names is null then
    return NEW;
  end if;

  -- ⚠️ NAMES THE IRO, NOT THE RULE. A lead who has just typed "Water scarcity at the Valencia
  -- plant" and then tries to hand E1.3 to procurement must be told WHICH IRO is in the way and what
  -- their two options are. A generic refusal sends them to support to find out.
  raise exception
    'Sub-topic % carries the named IRO(s) %, so it cannot be assigned to a contributor. A named IRO '
    'under a delegated sub-topic would belong to nobody: the contributor''s link cannot show it, and '
    'the lead no longer holds it. Delete the IRO, or keep this sub-topic and delegate another.',
    NEW.subtopic_code, v_names
    using errcode = 'PT414';
end $$;


--
-- Name: FUNCTION materiality_assignment_subtopic_no_iros(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_assignment_subtopic_no_iros() IS 'Door 2 of PT414: refuses delegating a sub-topic that carries a named IRO, naming the IRO. THE ONLY GATE THERE CAN BE in this direction — materiality_impact_assignment_subtopics has no RPC and three client insert sites (worksheet/[id]/page.tsx:500 and :600, api/impact-invite/route.ts:248), so there is no caller that could hold the rule. Its message is therefore the one a customer reads, and it names the IRO and both ways out rather than naming the rule. FIRES ON INSERT **AND UPDATE**: a first delegation is an insert, but a reassignment is an UPDATE of assignment_id by materiality_impact_reassign_subtopic (20260841), which a BEFORE INSERT trigger never sees — and moving a sub-topic between contributors is the commoner act of the two. THE RULE IS CHOSEN, NEVER INHERITED: this fires when someone chooses to delegate this sub-topic, so the lead is refused while they still remember why — not weeks later on an unrelated edit, with no escape but deleting IROs they did not name.';


--
-- Name: materiality_custom_iro_create(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_custom_iro_create(p_assessment_id uuid, p_subtopic_code text, p_name text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id  uuid;
  v_version  text;
  v_name     text := btrim(coalesce(p_name, ''));
  v_base     text;
  v_key      text;
  v_who      text;
  v_n        int := 1;
begin
  -- Ownership, and a missing assessment and someone else's are deliberately NOT told apart —
  -- 20260844's reasoning: saying which would confirm that another account holds work under that id.
  select a.user_id, a.standard_version into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id and a.user_id = auth.uid();
  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart.';
  end if;

  if v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, so an IRO named '
      'under it could not be keyed to a version. State the version on the assessment first.'
      using errcode = 'null_value_not_allowed';
  end if;

  if v_name = '' then
    raise exception 'An IRO needs a name. It is what the board report prints and what identifies it everywhere.'
      using errcode = 'check_violation';
  end if;
  if length(v_name) > 200 then
    raise exception 'That name is % characters. The limit is 200 — long enough for "Water scarcity at the Valencia plant" and short enough to print in a table.', length(v_name)
      using errcode = 'check_violation';
  end if;

  -- ⚠️ FINALISED MEANS ANSWERED. Creating an IRO on a finalised assessment would put a unit into
  -- scope that the finalised report does not mention, and materiality_finalise_scope would then
  -- report the assessment incomplete against a version already given to a board.
  if exists (select 1 from public.materiality_finalisations f where f.assessment_id = p_assessment_id) then
    raise exception
      'This assessment has been finalised. Naming a new IRO now would put something in scope that '
      'the finalised report does not mention. Finalise again to record a new version instead.'
      using errcode = 'PT413';
  end if;

  -- ⚠️ DOOR 1 AT THE CALLER. §4's trigger refuses this too and is the guarantee; this raise is what
  -- makes the refusal a sentence naming the contributor rather than a constraint firing.
  select coalesce(g.contributor_name, g.contributor_email, 'a contributor') into v_who
    from public.materiality_impact_assignment_subtopics a
    join public.materiality_impact_assignments g
      on g.id = a.assignment_id and g.assessment_id = a.assessment_id
   where a.assessment_id = p_assessment_id and a.subtopic_code = p_subtopic_code
   limit 1;
  if v_who is not null then
    raise exception
      'Sub-topic % is assigned to %, so a named IRO cannot be added to it — it would belong to '
      'nobody. Take the sub-topic back first, or name this IRO under one you hold.',
      p_subtopic_code, v_who
      using errcode = 'PT414';
  end if;

  -- The sub-topic must be one this assessment actually covers, and under its own version.
  if not exists (select 1 from public.mr_esrs_subtopics s
                  where s.code = p_subtopic_code and s.standard_version = v_version) then
    raise exception
      'Sub-topic % is not recorded for %. An IRO always sits under an ESRS sub-topic — that is what '
      'makes its disclosure requirements trigger.', p_subtopic_code, v_version
      using errcode = 'foreign_key_violation';
  end if;

  -- ── the slug ────────────────────────────────────────────────────────────────────────────────
  -- ⚠️ NO SEPARATE non-ASCII STRIP, AND ITS ABSENCE IS DELIBERATE. An earlier draft had
  -- regexp_replace(..., '[^\x20-\x7E]', '') between these two lines. It was redundant — the
  -- [^a-z0-9]+ pass below already removes everything that is not a slug character, combining marks
  -- included — and it relied on \xhh escapes in a POSIX bracket expression, which is a construct
  -- this file cannot exercise before Lisa runs it. Two behaviours where one will do, and the extra
  -- one untested.
  --
  -- NFKD is what does the real work: 'Valencià' decomposes to 'Valencia' + a combining grave, the
  -- lower() keeps the letters, and the [^a-z0-9]+ pass turns the mark into a '-' that btrim then
  -- removes. Result 'valencia'. Scripts that do not decompose to ASCII strip to nothing, which is
  -- the generated-key branch below.
  v_base := lower(normalize(v_name, NFKD));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  v_base := left(v_base, 64);
  v_base := btrim(v_base, '-');

  if v_base = '' then
    -- Generated, opaque, and valid against the 20260855 §2 CHECK. Not an error and not a prompt.
    v_base := 'iro-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  -- ⚠️ INSERT-AND-CATCH, NOT `select max(...)`. The primary key is the arbiter, so two browser tabs
  -- naming different IROs that slug alike cannot both win. A read-then-write would let them.
  -- Bounded at 20: past that something is wrong that another attempt will not fix.
  v_key := v_base;
  loop
    begin
      insert into public.materiality_custom_iros
        (assessment_id, user_id, subtopic_code, standard_version, iro_key, name)
      values (p_assessment_id, v_user_id, p_subtopic_code, v_version, v_key, v_name);
      exit;
    exception
      when unique_violation then
        -- Two DIFFERENT constraints can raise this and they mean opposite things.
        -- The NAME index is a refusal the customer must see: 20260855 §3 exists because two
        -- identically-named IROs under one sub-topic are indistinguishable in a board report.
        -- The KEY collision is ours to resolve silently: the names differ, only the slugs collided.
        if exists (select 1 from public.materiality_custom_iros i
                    where i.assessment_id = p_assessment_id
                      and i.subtopic_code = p_subtopic_code
                      and lower(btrim(i.name)) = lower(btrim(v_name))) then
          raise exception
            'An IRO called "%" is already recorded under %. Two with the same name cannot be told '
            'apart in the report — give this one a name that says how it differs.', v_name, p_subtopic_code
            using errcode = 'unique_violation';
        end if;
        v_n := v_n + 1;
        if v_n > 20 then
          raise exception
            'Could not derive a unique key for "%" after 20 attempts. Nothing is wrong with the '
            'name; something is wrong here. Tell us.', v_name;
        end if;
        v_key := left(v_base, 64 - length(v_n::text) - 1) || '-' || v_n::text;
    end;
  end loop;

  return jsonb_build_object('iro_key', v_key, 'name', v_name, 'subtopic_code', p_subtopic_code);
end $$;


--
-- Name: FUNCTION materiality_custom_iro_create(p_assessment_id uuid, p_subtopic_code text, p_name text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_custom_iro_create(p_assessment_id uuid, p_subtopic_code text, p_name text) IS 'Names an IRO under an ESRS sub-topic and returns its derived key. THE CUSTOMER TYPES A NAME; iro_key is derived here and never sent — the collision loop needs the database, standard_version must come from the assessment rather than be asserted by a caller, and a slug rule in TypeScript is one two clients can disagree about. A name that slugs to empty (Greek, Cyrillic, CJK, Arabic, punctuation only) gets a generated iro-xxxxxxxx key rather than a validation error: the key is never shown, so a readable one is a courtesy and an unreadable name is not a customer error. Key collisions between DIFFERENT names take a numeric suffix; a duplicate NAME is refused, because 20260855 §3''s index exists so two identically-named IROs cannot be told apart in a board report. Refuses on a finalised assessment (PT413).';


--
-- Name: materiality_custom_iro_delete(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_custom_iro_delete(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id uuid;
  v_name    text;
  v_who     text;
  v_dets    int;
begin
  select a.user_id into v_user_id
    from public.materiality_assessments a
   where a.id = p_assessment_id and a.user_id = auth.uid();
  if v_user_id is null then
    raise exception 'No assessment with that reference is open to you.';
  end if;

  if p_iro_key is null or p_iro_key = '' then
    raise exception
      'This is the sub-topic itself, not a named IRO under it. ESRS requires the sub-topic to be '
      'assessed regardless, so it cannot be removed.'
      using errcode = 'check_violation';
  end if;

  select i.name into v_name
    from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id
     and i.subtopic_code = p_subtopic_code
     and i.iro_key       = p_iro_key;
  if v_name is null then
    raise exception 'No IRO with that key is recorded under % on this assessment.', p_subtopic_code
      using errcode = 'no_data_found';
  end if;

  -- The caller-facing half of PT413. §2's trigger would refuse this anyway; raising here is what
  -- makes the refusal a sentence about an IRO rather than about a row.
  if exists (select 1 from public.materiality_finalisations f where f.assessment_id = p_assessment_id) then
    raise exception
      'This assessment has been finalised, so "%" cannot be removed. The board report regenerates '
      'from the live worksheet, so deleting it now would change what the paper says without '
      'changing the record of what was decided.', v_name
      using errcode = 'PT413';
  end if;

  -- ⚠️ REFUSES AT EXACTLY THE LINE THE LOCK TRIGGER REFUSES AT, AND THAT IS THE WHOLE ARGUMENT.
  -- materiality_impact_determination_lock() passes through on
  -- `OLD.status <> 'submitted' or OLD.assignment_id is null` — draft contributor work is not
  -- protected there either. Refusing on the same condition means the lock has NO HOLE rather than a
  -- hole with a confirmation dialog in front of it: a contributor's SUBMITTED determination cannot
  -- be erased by any path, and the lead's route is the one that already exists — override it, with
  -- a reason, both preserved in the report.
  select string_agg(distinct coalesce(g.contributor_name, g.contributor_email, 'a contributor'), ', ')
    into v_who
    from public.materiality_impact_determinations d
    join public.materiality_impact_assignments g
      on g.id = d.assignment_id and g.assessment_id = d.assessment_id
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key
     and d.status        = 'submitted'
     and d.assignment_id is not null;

  if v_who is not null then
    raise exception
      '"%" carries a determination submitted by %. A submitted determination is not deleted, it is '
      'overridden — change the values and give a reason, and both their judgement and yours appear '
      'in the report. Deleting it would erase theirs with no record that it existed.', v_name, v_who
      using errcode = 'check_violation';
  end if;

  -- Determinations first. Their snapshots go with them by ON DELETE CASCADE (20260855 §4) — that is
  -- counted separately in the preview because it is not visible here.
  delete from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key;
  get diagnostics v_dets = row_count;

  delete from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id
     and i.subtopic_code = p_subtopic_code
     and i.iro_key       = p_iro_key;

  return jsonb_build_object('deleted', v_name, 'determinations_deleted', v_dets);
end $$;


--
-- Name: FUNCTION materiality_custom_iro_delete(p_assessment_id uuid, p_subtopic_code text, p_iro_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_custom_iro_delete(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) IS 'Deletes a named IRO and the determinations under it, in that order — determinations first, because no foreign key binds them to materiality_custom_iros and the existence trigger is BEFORE INSERT OR UPDATE, so an IRO deleted first leaves orphans nothing complains about. Grants NO new table privilege: authenticated still holds no DELETE on materiality_impact_determinations, and the rule (non-empty iro_key, not finalised, no contributor''s submitted work) is one no RLS policy could express. REFUSES on a contributor''s SUBMITTED determination at exactly the line materiality_impact_determination_lock() refuses at, so that lock has no delete-shaped hole; the lead''s route is to override with a reason, keeping both. Refuses on a finalised assessment (PT413), which the §2 trigger also refuses independently.';


--
-- Name: materiality_custom_iro_delete_preview(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_custom_iro_delete_preview(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id     uuid;
  v_name        text;
  v_dets        int;
  v_submitted   int;
  v_contrib     int;
  v_snapshots   int;
  v_blockers    jsonb;
  v_finalised   int;
begin
  select a.user_id into v_user_id
    from public.materiality_assessments a
   where a.id = p_assessment_id and a.user_id = auth.uid();
  if v_user_id is null then
    raise exception 'No assessment with that reference is open to you.';
  end if;

  if p_iro_key is null or p_iro_key = '' then
    raise exception
      'This is the sub-topic itself, not a named IRO under it. ESRS requires the sub-topic to be '
      'assessed whether or not anything is named beneath it, so it cannot be removed.'
      using errcode = 'check_violation';
  end if;

  select i.name into v_name
    from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id
     and i.subtopic_code = p_subtopic_code
     and i.iro_key       = p_iro_key;
  if v_name is null then
    raise exception 'No IRO with that key is recorded under % on this assessment.', p_subtopic_code
      using errcode = 'no_data_found';
  end if;

  select count(*),
         count(*) filter (where d.status = 'submitted'),
         count(*) filter (where d.assignment_id is not null)
    into v_dets, v_submitted, v_contrib
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key;

  select count(*) into v_snapshots
    from public.materiality_impact_assignee_determinations s
   where s.assessment_id = p_assessment_id
     and s.subtopic_code = p_subtopic_code
     and s.iro_key       = p_iro_key;

  -- ⚠️ WHAT WOULD REFUSE, RETURNED RATHER THAN DISCOVERED AT THE DELETE. A confirmation dialog that
  -- asks "are you sure?" and then fails is worse than one that never opened. §7 raises on exactly
  -- these two conditions, so they are computed here by the same rules and surfaced first.
  select count(*) into v_finalised
    from public.materiality_finalisations f where f.assessment_id = p_assessment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'direction', d.direction,
           'contributor', coalesce(g.contributor_name, g.contributor_email, 'a contributor'),
           'submitted_at', d.determined_at)
           order by d.direction), '[]'::jsonb)
    into v_blockers
    from public.materiality_impact_determinations d
    join public.materiality_impact_assignments g
      on g.id = d.assignment_id and g.assessment_id = d.assessment_id
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key
     and d.status        = 'submitted'
     and d.assignment_id is not null;

  return jsonb_build_object(
    'name',                    v_name,
    'determinations',          v_dets,
    'submitted',               v_submitted,
    -- Named 'at_least' in the payload so a renderer cannot print it as an exact count by accident.
    'by_contributor_at_least', v_contrib,
    'snapshots',               v_snapshots,
    'refuses_finalised',       v_finalised > 0,
    'refuses_submitted_by',    v_blockers);
end $$;


--
-- Name: FUNCTION materiality_custom_iro_delete_preview(p_assessment_id uuid, p_subtopic_code text, p_iro_key text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_custom_iro_delete_preview(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) IS 'What deleting a named IRO would destroy, for the confirmation. by_contributor_at_least is a FLOOR and is named so a renderer cannot print it as exact: a lead''s override rewrites a determination in place, so work that was a contributor''s can now read as the lead''s and any count of contributor work understates. snapshots is counted separately because the parent FK cascades (20260855 §4) and takes the pre-override record of what the contributor originally said — the part that cannot be reconstructed. Also returns the two conditions that would REFUSE, so a confirmation dialog does not open on a delete that was never going to happen.';


--
-- Name: materiality_custom_iro_not_delegated(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_custom_iro_not_delegated() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare v_who text;
begin
  select coalesce(g.contributor_name, g.contributor_email, 'a contributor')
    into v_who
    from public.materiality_impact_assignment_subtopics a
    join public.materiality_impact_assignments g
      on g.id = a.assignment_id and g.assessment_id = a.assessment_id
   where a.assessment_id = NEW.assessment_id
     and a.subtopic_code = NEW.subtopic_code
   limit 1;

  if v_who is null then
    return NEW;
  end if;

  raise exception
    'Sub-topic % is assigned to %, so a named IRO cannot be added to it. An IRO named under a '
    'delegated sub-topic would belong to nobody: the contributor''s link cannot show it, and the '
    'lead no longer holds it. Take the sub-topic back first, or name this IRO under one you hold.',
    NEW.subtopic_code, v_who
    using errcode = 'PT414';
end $$;


--
-- Name: FUNCTION materiality_custom_iro_not_delegated(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_custom_iro_not_delegated() IS 'Door 1 of PT414: refuses a named IRO on a sub-topic assigned to a contributor. Guards the consequence at the row; materiality_custom_iro_create raises the same refusal at the caller so a customer reads a sentence rather than meeting a constraint. Pairs with materiality_assignment_subtopic_no_iros(), which closes the same rule from the other side. Together they make "custom IROs stay with the lead" unreachable to violate, which is what lets materiality_lead_submit keep 20260855''s held-scope unchanged. THE RULE IS CHOSEN, NEVER INHERITED: this fires when someone chooses to name an IRO here, not on some later unrelated edit, so the refusal reaches the person making the choice rather than whoever next touches the row.';


--
-- Name: materiality_finalisation_allocate_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_finalisation_allocate_version() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.version is not null then
    raise exception
      'The finalisation version is allocated by the database, not supplied by the caller. Omit it.'
      using errcode = 'check_violation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.assessment_id::text, 0));

  select coalesce(max(f.version), 0) + 1
    into new.version
    from public.materiality_finalisations f
   where f.assessment_id = new.assessment_id;

  return new;
end $$;


--
-- Name: materiality_finalise(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_finalise(p_assessment_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id     uuid;
  v_version     text;
  v_req_count   int;
  v_scope_n     int;
  v_missing     text;
  v_no          int;
  v_at          timestamptz;
  v_prev        int;
  v_changed     boolean;
  v_rows        int;
begin
  -- ── 1. Ownership ────────────────────────────────────────────────────────────────────────────
  -- Same shape as materiality_lead_submit: a missing assessment and someone else's are deliberately
  -- NOT told apart, because saying which would confirm whose work is stored under that id.
  select a.user_id, a.standard_version
    into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id
     and a.user_id = auth.uid();

  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart, because saying which would '
      'confirm whose work is stored under it.';
  end if;

  -- ── 2. The version must be stated ───────────────────────────────────────────────────────────
  -- ⚠️ NO FALLBACK TO esrs_2023, AND THAT IS THE POINT OF REFUSING RATHER THAN DEFAULTING. Article
  -- 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state which version it applied.
  -- Freezing one standard's requirements under another standard's name would be a false statement
  -- that survives in an archive — and ESRS (2026) renumbered the DRs, so 49 codes exist under both
  -- versions with different titles. That is not a stale-label problem, it is the wrong requirement
  -- under the right code. api/materiality/route.ts may fall back only because drResolutionNote
  -- discloses the fallback on the report's face; nothing here would.
  --
  -- 20260848 permits a null standard_version on the row because a table should not enforce a rule
  -- this function owns. This is where it is owned.
  if v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, so there is no set '
      'of disclosure requirements to freeze. Article 2(2) of Del. Reg. C(2026) 5010 requires the '
      'undertaking to state the version, and assuming one would be a false statement about which '
      'law was applied. State the version on the assessment, then finalise.';
  end if;

  -- ── 3. Requirements must exist for that version ─────────────────────────────────────────────
  -- ⚠️ CHECKED BEFORE READINESS, ON PURPOSE. esrs_2023_reliefs is a permitted value with NO rows in
  -- mr_esrs_disclosure_requirements (20260817's own verification block: "expect exactly:
  -- esrs_2023 | 61 and esrs_2026 | 64"). Without this, such an assessment would finalise, copy
  -- nothing, and leave a record asserting "these were the requirements in force" when none were —
  -- which a later reader cannot tell from a copy that failed. An empty result is a result and must
  -- be reported as one.
  --
  -- Before readiness because a preparer on an unseeded version can NEVER finalise until it is
  -- seeded, and finding that out after determining 37 sub-topics would be the wrong order.
  select count(*) into v_req_count
    from public.mr_esrs_disclosure_requirements r
   where r.standard_version = v_version;

  if v_req_count = 0 then
    raise exception
      'No disclosure requirements are held for %, so finalising would freeze an empty set and '
      'record it as though it were the requirements in force. This is a gap in the platform''s '
      'reference data, not in your assessment, and nothing you can do on this screen will change '
      'it. Tell us and we will seed them.', v_version;
  end if;

  -- ── Refusals 4 and 5 — SAME RULE, NOW FROM THE HELPERS ─────────────────────────────────────
  -- The scope CTE and the both-directions join that stood here are now
  -- materiality_finalise_scope and materiality_finalise_outstanding, so the worksheet's readiness
  -- card and this refusal read the SAME query. A TypeScript copy could not be bound to a SQL one by
  -- any test in this repo — vitest has no database — so one query called by both is the only way
  -- they cannot disagree. The reasoning that stood here (scope-wide not `held`; submitted not
  -- complete; assignment status ignored) moved with the code and lives on those two functions.
  select count(*) into v_scope_n
    from public.materiality_finalise_scope(p_assessment_id, v_version);

  -- Guarded separately, and still necessary: materiality_finalise_outstanding over an empty scope
  -- returns no rows, so string_agg below would be NULL — which would read as "nothing
  -- outstanding" and finalise an assessment with no sub-topics at all.
  if v_scope_n = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to finalise. Either the '
      'linked survey round has no included questions, or no sub-topics are recorded for %.',
      v_version;
  end if;

  select string_agg(o.label || ' (' || o.direction || ')', ', '
                    order by o.subtopic_code, o.iro_key, o.direction)
    into v_missing
    from public.materiality_finalise_outstanding(p_assessment_id, v_version) o;

  -- ⚠️ NAMED, NOT COUNTED. materiality_lead_submit does the same at 20260844:117-136 and for the
  -- same reason: a caller told "3 outstanding" must go and find them, and a caller told which three
  -- can finish. Both directions of every sub-topic are listed, because a sub-topic submitted for
  -- harm and not for benefit is not finished.
  if v_missing is not null then
    raise exception
      'These are not submitted yet: %. Every sub-topic in scope must be submitted — once for harm '
      'and once for benefit — by whoever determined it, before the assessment can be finalised. '
      'Contributors submit theirs from their own link.', v_missing;
  end if;

  -- ── The write ───────────────────────────────────────────────────────────────────────────────
  -- version is omitted: materiality_finalisation_allocate_version assigns it under a per-assessment
  -- advisory lock, and refuses a caller-supplied one.
  --
  -- user_id is passed explicitly rather than left to its default. The default IS auth.uid() and
  -- would be correct — SECURITY DEFINER changes the executing role, not the JWT claim the helper
  -- reads — but this value was already selected under `a.user_id = auth.uid()` above, so passing it
  -- makes the composite FK check a real second assertion rather than a restatement of the default.
  insert into public.materiality_finalisations (assessment_id, user_id, standard_version)
  values (p_assessment_id, v_user_id, v_version)
  returning version, finalised_at into v_no, v_at;

  insert into public.materiality_finalisation_requirements
    (assessment_id, version, user_id, dr_code, topic_code, title, datapoints, sort_order)
  select p_assessment_id, v_no, v_user_id,
         r.dr_code, r.topic_code, r.title, r.datapoints, r.sort_order
    from public.mr_esrs_disclosure_requirements r
   where r.standard_version = v_version;

  get diagnostics v_rows = row_count;

  -- Checked, not assumed. v_req_count proved rows exist a moment ago, so a zero here would mean
  -- something changed underneath this transaction — worth failing on rather than returning a
  -- finalisation with an empty requirement set.
  if v_rows = 0 then
    raise exception
      'The requirements could not be copied, so nothing has been finalised. Nothing is lost — try '
      'again, and tell us if it keeps happening.';
  end if;

  -- ── Was anything different from last time? ──────────────────────────────────────────────────
  -- ⚠️ NULL ON THE FIRST VERSION, NEVER false. "There was nothing to compare against" and "nothing
  -- changed" are different facts, and collapsing them would let a UI print "no change since the
  -- previous version" on a first finalisation that has no previous version.
  select max(f.version) into v_prev
    from public.materiality_finalisations f
   where f.assessment_id = p_assessment_id
     and f.version < v_no;

  if v_prev is null then
    v_changed := null;
  else
    -- Symmetric difference over the copied columns. EXCEPT ALL treats NULL as equal to NULL, which
    -- is what is wanted: datapoints is null on every esrs_2026 row and two nulls are not a change.
    select count(*) > 0 into v_changed
      from (
        (select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_no
         except all
         select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_prev)
        union all
        (select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_prev
         except all
         select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_no)
      ) diff;
  end if;

  return jsonb_build_object(
    'version',              v_no,
    'previous_version',     v_prev,
    'standard_version',     v_version,
    'finalised_at',         v_at,
    'requirements',         v_rows,
    'requirements_changed', v_changed
  );
end $$;


--
-- Name: FUNCTION materiality_finalise(p_assessment_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_finalise(p_assessment_id uuid) IS 'Finalises an impact materiality assessment: writes one materiality_finalisations row (version allocated by trigger) and copies every mr_esrs_disclosure_requirements row for the assessment''s stated standard_version into materiality_finalisation_requirements. Refuses, in order and each naming what to do: not owned or absent (the two deliberately not told apart); no standard_version stated (Art. 2(2) — and NO fallback to esrs_2023, which would freeze one standard''s requirements under another''s name); no requirements held for that version (esrs_2023_reliefs has none, so this is checked BEFORE readiness — a preparer on that version can never finalise until it is seeded); no sub-topics in scope; and any sub-topic in scope not submitted in BOTH directions, NAMING which. Readiness is SCOPE-WIDE, not materiality_lead_submit''s `held` — that one refuses when the lead holds nothing, so a fully delegated assessment could never satisfy it. Submitted, NOT complete: a §6.1 abstention with every dimension null is a real answer the board report renders. Assignment status is ignored: impact_submit writes determinations before the assignment, so submitted work under an in_progress assignment is normal. A SECOND CALL IS A NEW VERSION, never a no-op — returns requirements_changed false when the copied set matches the previous version, and NULL on the first, because "nothing to compare" is not "nothing changed".';


--
-- Name: materiality_finalise_outstanding(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_finalise_outstanding(p_assessment_id uuid, p_standard_version text) RETURNS TABLE(subtopic_code text, iro_key text, label text, direction text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select sc.subtopic_code,
         sc.iro_key,
         -- ONE AUTHORITY FORMATS THE LABEL. materiality_finalise and materiality_finalise_readiness
         -- both print this list, and 20260850's whole argument for these helpers is that "the
         -- screen's readiness card and this refusal read the SAME query". Two callers formatting
         -- their own label is that argument being abandoned one function later.
         case when sc.iro_key = '' then sc.subtopic_code
              else sc.subtopic_code || ' / ' || coalesce(i.name, sc.iro_key) end as label,
         dir.direction
    from public.materiality_finalise_scope(p_assessment_id, p_standard_version) sc
    cross join (values ('negative'), ('positive')) as dir(direction)
    left join public.materiality_custom_iros i
      on i.assessment_id = p_assessment_id
     and i.subtopic_code = sc.subtopic_code
     and i.iro_key       = sc.iro_key
    left join public.materiality_impact_determinations d
      on d.assessment_id = p_assessment_id
     and d.subtopic_code = sc.subtopic_code
     and d.direction     = dir.direction
     and d.iro_key       = sc.iro_key
     -- ⚠️ ADDED HERE, NOT IN 20260854, AND THAT WAS A MISS RATHER THAN A DECISION. 20260854 scoped
     -- materiality_lead_submit to the impact axis and did not reach this function. Without it, the
     -- first financial-axis row would join twice and report a submitted sub-topic as outstanding —
     -- in the function that decides whether an assessment may be frozen. Harmless only for as long
     -- as nothing writes axis = 'financial', which is exactly the kind of "harmless" CLAUDE.md
     -- records about mr_jurisdictions.active.
     and d.axis          = 'impact'
   where d.assessment_id is null
      or d.status <> 'submitted'
   order by sc.subtopic_code, sc.iro_key, dir.direction;
$$;


--
-- Name: FUNCTION materiality_finalise_outstanding(p_assessment_id uuid, p_standard_version text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_finalise_outstanding(p_assessment_id uuid, p_standard_version text) IS 'Every (sub-topic, IRO, direction) in scope that is not yet submitted on the impact axis, with a printable label. Submitted, NOT complete: a §6.1 abstention with every dimension null is a real answer the board report renders. Both directions always. Composes the LABEL ITSELF so materiality_finalise and materiality_finalise_readiness cannot print the same outstanding item differently — a sub-topic with two named IROs would otherwise read as one code repeated three times. Carries the axis predicate 20260854 added to materiality_lead_submit and did not reach here; without it the first financial-axis row would report a submitted sub-topic as outstanding. Has nothing of its own to refuse: a null standard version raises inside materiality_finalise_scope and propagates.';


--
-- Name: materiality_finalise_readiness(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_finalise_readiness(p_assessment_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id     uuid;
  v_version     text;
  v_req_count   int;
  v_scope_n     int;
  v_outstanding jsonb;
  v_count       int;
  v_latest      jsonb;
  v_ready       boolean := false;
  v_reason      text    := null;
  v_message     text    := null;
begin
  -- Ownership, checked exactly as materiality_finalise checks it, with the same sentence and the
  -- same refusal to tell the two cases apart.
  select a.user_id, a.standard_version
    into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id
     and a.user_id = auth.uid();

  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart, because saying which would '
      'confirm whose work is stored under it.';
  end if;

  -- The latest finalisation, if any. Returned whatever the readiness verdict: an assessment that
  -- has been finalised and has since gained outstanding work is a real state, and the card needs
  -- both halves to describe it.
  select jsonb_build_object(
           'version', f.version,
           'finalised_at', f.finalised_at,
           'standard_version', f.standard_version)
    into v_latest
    from public.materiality_finalisations f
   where f.assessment_id = p_assessment_id
   order by f.version desc
   limit 1;

  if v_version is null then
    v_reason  := 'version_not_stated';
    v_message := 'This assessment does not state which ESRS version it was prepared under, so '
               'there is no set of disclosure requirements to freeze. Article 2(2) of Del. Reg. '
               'C(2026) 5010 requires the undertaking to state the version, and assuming one would '
               'be a false statement about which law was applied. State the version on the '
               'assessment, then finalise.';
  else
    select count(*) into v_req_count
      from public.mr_esrs_disclosure_requirements r
     where r.standard_version = v_version;

    select count(*) into v_scope_n
      from public.materiality_finalise_scope(p_assessment_id, v_version);

    select coalesce(jsonb_agg(jsonb_build_object(
             'subtopic_code', o.subtopic_code, 'iro_key', o.iro_key,
             'label', o.label, 'direction', o.direction)
             order by o.subtopic_code, o.iro_key, o.direction), '[]'::jsonb),
           count(*)
      into v_outstanding, v_count
      from public.materiality_finalise_outstanding(p_assessment_id, v_version) o;

    if v_req_count = 0 then
      v_reason  := 'no_requirements_for_version';
      v_message := format(
        'No disclosure requirements are held for %s, so finalising would freeze an empty set and '
        'record it as though it were the requirements in force. This is a gap in the platform''s '
        'reference data, not in your assessment, and nothing you can do on this screen will change '
        'it. Tell us and we will seed them.', v_version);
    elsif v_scope_n = 0 then
      v_reason  := 'no_scope';
      v_message := format(
        'This assessment has no sub-topics in scope, so there is nothing to finalise. Either the '
        'linked survey round has no included questions, or no sub-topics are recorded for %s.',
        v_version);
    elsif v_count > 0 then
      v_reason  := 'outstanding_determinations';
      v_message := format(
        'These are not submitted yet: %s. Every sub-topic in scope must be submitted — once for '
        'harm and once for benefit — by whoever determined it, before the assessment can be '
        'finalised. Contributors submit theirs from their own link.',
        (select string_agg(e->>'subtopic_code' || ' (' || (e->>'direction') || ')', ', ')
           from jsonb_array_elements(v_outstanding) e));
    else
      v_ready := true;
    end if;
  end if;

  return jsonb_build_object(
    'ready',                  v_ready,
    'reason',                 v_reason,
    'message',                v_message,
    'outstanding',            coalesce(v_outstanding, '[]'::jsonb),
    'outstanding_count',      coalesce(v_count, 0),
    'scope_count',            coalesce(v_scope_n, 0),
    'standard_version',       v_version,
    'requirements_available', coalesce(v_req_count, 0),
    'latest',                 v_latest
  );
end $$;


--
-- Name: FUNCTION materiality_finalise_readiness(p_assessment_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_finalise_readiness(p_assessment_id uuid) IS 'READ ONLY. Everything a screen needs to render the finalise card without a second query and without inferring anything: ready, a closed reason discriminant (version_not_stated | no_requirements_for_version | no_scope | outstanding_determinations, null when ready), the refusal''s own message verbatim so a stale click says the same words, the outstanding pairs NAMED, the scope and requirement counts, and the latest finalisation (version and finalised_at) or null when never finalised. Ownership is checked exactly as materiality_finalise checks it, with the two cases deliberately not told apart. Refusal precedence is decided HERE, not by the caller.';


--
-- Name: materiality_finalise_scope(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_finalise_scope(p_assessment_id uuid, p_standard_version text) RETURNS TABLE(subtopic_code text, iro_key text)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
begin
  if p_standard_version is null then
    raise exception
      'materiality_finalise_scope was called with no standard version. Scope for an assessment '
      'with no linked survey round is drawn from mr_esrs_subtopics for a STATED version; with '
      'none, this function would return an empty scope, and a caller reading that would conclude '
      'there is nothing outstanding and therefore that the assessment is ready to finalise. '
      'Refusing rather than answering wrongly. Establish the version first — materiality_finalise '
      'and materiality_finalise_readiness both do.'
      using errcode = 'null_value_not_allowed';
  end if;

  return query
  with linked as (
    select l.round_id
      from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id
     order by l.linked_at
     limit 1
  )
  select q.subtopic_code, ''::text as iro_key
    from public.materiality_survey_questions q
    join linked l on l.round_id = q.round_id
   where q.status = 'included'
     and q.subtopic_code is not null
  union
  select s.code, ''::text
    from public.mr_esrs_subtopics s
   where s.standard_version = p_standard_version
     and not exists (select 1 from linked)
  union
  -- ⚠️ THE ARM WITHOUT WHICH materiality_finalise REPORTS A FALSE ALL-CLEAR. This is the FINAL
  -- gate — the one that freezes the assessment and has nothing after it to catch a miss. A named
  -- IRO appears in neither of the two arms above, so without this a company could name an IRO,
  -- leave it entirely undetermined, and finalise.
  --
  -- No `not exists (select 1 from linked)` guard, unlike the reference arm: a custom IRO is in
  -- scope because the COMPANY named it, not because a round included it, so a linked round neither
  -- adds nor removes it.
  select i.subtopic_code, i.iro_key
    from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id;
end $$;


--
-- Name: FUNCTION materiality_finalise_scope(p_assessment_id uuid, p_standard_version text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_finalise_scope(p_assessment_id uuid, p_standard_version text) IS 'The units of determination in scope for an assessment, as (subtopic_code, iro_key): the earliest linked round''''s included questions, or mr_esrs_subtopics for the given standard version when no round is linked, PLUS every row in materiality_custom_iros for the assessment. iro_key = '''''''' is the sub-topic taken as a whole. ONE DEFINITION, three callers — materiality_finalise, materiality_finalise_outstanding and materiality_finalise_readiness — because the screen''''s readiness and the RPC''''s refusal must not be able to disagree. The custom-IRO arm is what stops the FINAL gate reporting ready while a named IRO sits unscored, and it does not breach 20260844''''s enumerate-never-infer rule: materiality_custom_iros holds a name and a parent and no determination. RAISES on a null standard version rather than returning an empty scope, because an empty scope reads as "nothing outstanding" and therefore "ready to finalise" — a silent failure pointing the wrong way. SECURITY INVOKER: an RLS-hidden custom IRO would shrink scope the same wrong way, which cannot occur because mci_owner_all matches the assessment''''s own user_id and both entry points check ownership first.';


--
-- Name: materiality_impact_determination_assessment_version(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_impact_determination_assessment_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  v_found   boolean;
  v_parent  text;
  v_subject text;
begin
  select true, a.standard_version
    into v_found, v_parent
    from public.materiality_assessments a
   where a.id = NEW.assessment_id;

  -- ⚠️ EXISTENCE IS THE FK'S JOB, NOT THIS TRIGGER'S — and deferring is provably safe, which is why
  -- it is done rather than guessed at. A BEFORE trigger runs ahead of the FK check, so a bogus or an
  -- RLS-invisible assessment_id reaches here first. Refusing it would surface an invisible parent as
  -- a version conflict, naming a cause that had not occurred.
  --
  -- It cannot open a hole. The composite FK is (assessment_id, user_id) -> (id, user_id), and this
  -- table's RLS WITH CHECK pins NEW.user_id to auth.uid(); materiality_assessments is visible under
  -- RLS at exactly user_id = auth.uid(). Any row that could satisfy the FK is a row this SELECT can
  -- see, so not-found implies the FK is about to fail. Nothing passes unchecked.
  if not coalesce(v_found, false) then
    return NEW;
  end if;

  -- SECURITY INVOKER (the default, stated because it was decided rather than defaulted into). The
  -- preparer path runs as authenticated and sees the parent by the argument above. The token path
  -- runs inside a SECURITY DEFINER RPC as the table owner, and no table in this schema uses FORCE
  -- ROW LEVEL SECURITY, so RLS does not apply there. Neither needs DEFINER.
  if NEW.standard_version is distinct from v_parent then
    -- Composed, not concatenated into the format string, so the two branches are visible side by
    -- side rather than hidden inside a % argument.
    if NEW.iro_key = '' then
      v_subject := NEW.subtopic_code;
    else
      select '"' || i.name || '" (under ' || NEW.subtopic_code || ')'
        into v_subject
        from public.materiality_custom_iros i
       where i.assessment_id    = NEW.assessment_id
         and i.subtopic_code    = NEW.subtopic_code
         and i.iro_key          = NEW.iro_key
         and i.standard_version = NEW.standard_version;
      v_subject := coalesce(v_subject, NEW.iro_key || ' (under ' || NEW.subtopic_code || ')');
    end if;

    raise exception
      'Determination % [%/%] carries standard_version %, but assessment % states %. A determination '
      'must be keyed to the version its assessment is prepared under: the two are joined by nothing '
      'but this trigger, and ESRS (2026) renumbered the disclosure requirements, so 49 codes exist '
      'under both versions with different titles. Not saved.',
      v_subject, NEW.axis, NEW.direction, NEW.standard_version,
      NEW.assessment_id, coalesce(v_parent, '(none stated)')
      using errcode = 'PT409';
  end if;

  return NEW;
end $$;


--
-- Name: FUNCTION materiality_impact_determination_assessment_version(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_impact_determination_assessment_version() IS 'Refuses any determination whose standard_version differs from its assessment''''s, errcode PT409. IS DISTINCT FROM, so an assessment stating no version refuses rather than passing. Checks the row''''s STATE, not the delta: impact_save_determination''''s ON CONFLICT DO UPDATE omits standard_version, so an untouched value can go wrong underneath a contributor. Existence of the assessment is deferred to the composite FK, safe because RLS and that FK together make any FK-satisfiable parent visible to its SELECT. Names the IRO by NAME rather than by key when iro_key <> '''''''' — four slash-separated codes is a string a maintainer decodes rather than reads. Fires FIRST of the three row triggers on this table by name ordering, deliberately: a version disagreement outranks a missing IRO, which outranks the lock''''s demand for an override reason.';


--
-- Name: materiality_impact_determination_finalised_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_impact_determination_finalised_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_version int;
  v_at      timestamptz;
begin
  select f.version, f.finalised_at
    into v_version, v_at
    from public.materiality_finalisations f
   where f.assessment_id = OLD.assessment_id
   order by f.version desc
   limit 1;

  if v_version is null then
    return OLD;
  end if;

  raise exception
    'This assessment was finalised (version %, %). Its determinations cannot be deleted. A '
    'finalised assessment is an answer that has been given: the board report regenerates from the '
    'live worksheet, so removing a determination now would change what the paper says without '
    'changing the record of what was decided. Finalise again to record a new version instead.',
    v_version, to_char(v_at, 'FMDD Mon YYYY')
    using errcode = 'PT413';
end $$;


--
-- Name: FUNCTION materiality_impact_determination_finalised_lock(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_impact_determination_finalised_lock() IS 'Refuses DELETE of any determination belonging to an assessment with a materiality_finalisations row; errcode PT413. On the CHILD table, guarding the consequence — 20260851''s split between PT409 (consequence) and PT412 (cause). NOT RLS: an RLS policy on DELETE filters rows rather than refusing, so a delete touching a finalised assessment would remove fewer rows than asked and report success, which is worse than either refusing or deleting. A trigger rather than only the RPC check, because "the RPC is the only path" is a property of today''s grants and not of the schema. BEFORE DELETE is the first such timing on this table: the other three triggers are BEFORE INSERT OR UPDATE, which is why nothing fired on a delete before this.';


--
-- Name: materiality_impact_determination_iro_exists(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_impact_determination_iro_exists() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  -- The sub-topic taken as a whole references nothing and is the overwhelmingly common case, so it
  -- costs one comparison and no lookup.
  if NEW.iro_key = '' then
    return NEW;
  end if;

  if not exists (
    select 1
      from public.materiality_custom_iros i
     where i.assessment_id    = NEW.assessment_id
       and i.subtopic_code    = NEW.subtopic_code
       and i.iro_key          = NEW.iro_key
       and i.standard_version = NEW.standard_version)
  then
    raise exception
      'This determination names IRO "%" under sub-topic % (version %), and no such IRO is recorded '
      'for this assessment. A named IRO must be created before it can be determined — it is the '
      'thing that puts it in scope, and a determination against an unnamed IRO would be invisible '
      'to every completeness check on the assessment. Not saved.',
      NEW.iro_key, NEW.subtopic_code, NEW.standard_version
      using errcode = 'PT410';
  end if;

  return NEW;
end $$;


--
-- Name: FUNCTION materiality_impact_determination_iro_exists(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_impact_determination_iro_exists() IS 'Refuses a determination whose non-empty iro_key names no row in materiality_custom_iros for the same assessment, sub-topic AND standard version; errcode PT410. A TRIGGER RATHER THAN A FOREIGN KEY because the requirement is conditional on the value — '''' must reference nothing — and no FK has a conditional form. Cannot produce a false refusal: the lead path sees the IRO under RLS (same user_id), and the token path runs SECURITY DEFINER where RLS does not apply, so not-found means genuinely absent. Fires between the version trigger and the lock trigger by name ordering, deliberately.';


--
-- Name: materiality_impact_determination_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_impact_determination_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_changed boolean;
begin
  if TG_OP = 'INSERT' then
    if NEW.overridden_at is not null then
      raise exception 'A determination cannot be created as already overridden.'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  if OLD.status <> 'submitted' or OLD.assignment_id is null then
    NEW.overridden_at   := OLD.overridden_at;
    NEW.override_reason := OLD.override_reason;
    return NEW;
  end if;

  if NEW.status <> 'submitted' then
    raise exception
      'This determination was submitted by a contributor and cannot be returned to draft. Change '
      'the values directly, giving a reason — the contributor''s determination is kept and both '
      'appear in the report.'
      using errcode = 'check_violation';
  end if;

  if NEW.assignment_id is distinct from OLD.assignment_id then
    raise exception
      'A submitted determination stays attributed to the contributor who made it. Reassignment '
      'moves sub-topics that are not yet submitted; use materiality_impact_reassign_subtopic().'
      using errcode = 'check_violation';
  end if;

  v_changed :=
       NEW.nature               is distinct from OLD.nature
    or NEW.scale                is distinct from OLD.scale
    or NEW.scope                is distinct from OLD.scope
    or NEW.irremediability      is distinct from OLD.irremediability
    or NEW.likelihood           is distinct from OLD.likelihood
    -- ⚠️ ADDED 20260841, AND ITS ABSENCE WAS A HOLE. Turning an expert's recorded "I could not
    -- judge this" into a lead-supplied null — or clearing the abstention so the blank reads as
    -- unanswered — changes what the report says the contributor concluded. Without this comparison
    -- it required no reason and left no trace.
    or NEW.abstained_dimensions is distinct from OLD.abstained_dimensions
    or NEW.value_chain_position is distinct from OLD.value_chain_position
    or NEW.time_horizon         is distinct from OLD.time_horizon
    or NEW.rationale            is distinct from OLD.rationale;

  if not v_changed then
    NEW.overridden_at := OLD.overridden_at;
    return NEW;
  end if;

  if NEW.override_reason is null or length(btrim(NEW.override_reason)) = 0 then
    raise exception
      'Changing a contributor''s submitted determination requires a reason. It is recorded with '
      'the change and shown in the report beside what the contributor determined.'
      using errcode = 'check_violation';
  end if;

  insert into public.materiality_impact_assignee_determinations (
    assessment_id, subtopic_code, direction, user_id, assignment_id,
    nature, scale, scope, irremediability, likelihood,
    -- ⚠️ WITHOUT THIS, AN OVERRIDDEN ABSTENTION BECOMES A BLANK. The report would then show the
    -- lead's score beside an empty cell, implying the expert had no view — when they had explicitly
    -- recorded that they could not judge it. That is the worst misreading this table can produce.
    abstained_dimensions,
    value_chain_position, time_horizon, rationale, determined_at)
  values (
    OLD.assessment_id, OLD.subtopic_code, OLD.direction, OLD.user_id, OLD.assignment_id,
    OLD.nature, OLD.scale, OLD.scope, OLD.irremediability, OLD.likelihood,
    OLD.abstained_dimensions,
    OLD.value_chain_position, OLD.time_horizon, OLD.rationale, OLD.determined_at)
  on conflict (assessment_id, subtopic_code, axis, direction, iro_key) do nothing;

  NEW.overridden_at := now();
  return NEW;
end $$;


--
-- Name: FUNCTION materiality_impact_determination_lock(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_impact_determination_lock() IS 'Refuses a post-submit write to a delegated determination unless the lead supplies an override reason, and snapshots the contributor''s row into materiality_impact_assignee_determinations before the override lands. ⚠️ SUPERSEDED BY 20260854: the installed body is the copy in that migration, whose snapshot ON CONFLICT names four columns — the snapshot table gained axis in the same file, because its primary key and its parent foreign key both reference the determination key.';


--
-- Name: materiality_impact_reassign_subtopic(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_impact_reassign_subtopic(p_assessment_id uuid, p_subtopic_code text, p_to_assignment_id uuid) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_submitted int;
  v_cleared   int;
begin
  if not exists (select 1 from public.materiality_impact_assignments a
                  where a.id = p_to_assignment_id and a.assessment_id = p_assessment_id) then
    raise exception 'That assignment does not belong to this assessment.'
      using errcode = 'foreign_key_violation';
  end if;

  select count(*) into v_submitted
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.status = 'submitted';

  if v_submitted > 0 then
    raise exception
      'This sub-topic has a submitted determination and stays with the contributor who made it. A '
      'submitted determination can be superseded by you, with a reason, but not reassigned.'
      using errcode = 'check_violation';
  end if;

  update public.materiality_impact_assignment_subtopics s
     set assignment_id = p_to_assignment_id
   where s.assessment_id = p_assessment_id
     and s.subtopic_code = p_subtopic_code;

  if not found then
    raise exception 'That sub-topic is not assigned in this assessment, or it belongs to another account.'
      using errcode = 'no_data_found';
  end if;

  update public.materiality_impact_determinations d
     set assignment_id        = p_to_assignment_id,
         evidence_in_view     = false,
         nature               = null,
         scale                = null,
         scope                = null,
         irremediability      = null,
         likelihood           = null,
         -- ⚠️ ADDED 20260841. Left populated, this would carry "the previous contributor could not
         -- judge this" forward under the NEW contributor's name — the false attribution the whole
         -- clearing exists to prevent, wearing the one shape the clearing did not cover.
         abstained_dimensions = '{}'::text[],
         value_chain_position = '{}'::text[],
         time_horizon         = null,
         rationale            = null,
         determined_at        = null
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code;

  get diagnostics v_cleared = row_count;
  return v_cleared;
end $$;


--
-- Name: FUNCTION materiality_impact_reassign_subtopic(p_assessment_id uuid, p_subtopic_code text, p_to_assignment_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_impact_reassign_subtopic(p_assessment_id uuid, p_subtopic_code text, p_to_assignment_id uuid) IS 'Moves an unsubmitted sub-topic to a different contributor and CLEARS any draft values, returning how many determination rows were cleared so the confirmation can state a number rather than a warning. Refuses when either direction has been submitted: a submitted determination stays attributed to the contributor who made it, and the sub-topic — not the direction — is the unit of assignment. The draft is cleared rather than carried because a carried draft means the next contributor submits figures the previous one typed, which records the wrong author and is undetectable afterwards.';


--
-- Name: materiality_impact_resolve_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_impact_resolve_token(p_token uuid, OUT o_assignment_id uuid, OUT o_assessment_id uuid, OUT o_user_id uuid, OUT o_company_name text, OUT o_standard_version text, OUT o_contributor_name text, OUT o_contributor_role text, OUT o_expires_at timestamp with time zone) RETURNS record
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION materiality_impact_resolve_token(p_token uuid, OUT o_assignment_id uuid, OUT o_assessment_id uuid, OUT o_user_id uuid, OUT o_company_name text, OUT o_standard_version text, OUT o_contributor_name text, OUT o_contributor_role text, OUT o_expires_at timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_impact_resolve_token(p_token uuid, OUT o_assignment_id uuid, OUT o_assessment_id uuid, OUT o_user_id uuid, OUT o_company_name text, OUT o_standard_version text, OUT o_contributor_name text, OUT o_contributor_role text, OUT o_expires_at timestamp with time zone) IS 'The shared token gate for impact_get / impact_save_determination / impact_submit. Refuses an unknown, revoked or expired token with ONE message and ONE errcode (no_data_found) so a caller cannot distinguish them, and refuses an ALREADY SUBMITTED assignment with a distinguishable PT410 that is reachable only by someone already holding a live token. Order is load-bearing: token conditions first, submission second — reversed, a guessed uuid would reveal that the assignment exists. Returns named OUT parameters and deliberately NOT the row type, which would carry the token itself and contributor_email. Revoked from PUBLIC and SECURITY INVOKER.';


--
-- Name: materiality_lead_submit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_lead_submit(p_assessment_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_user_id     uuid;
  v_version     text;
  v_linked      boolean;
  v_scope       public.materiality_iro_ref[];
  v_held        public.materiality_iro_ref[];
  v_missing     text;
  v_rows        int;
begin
  select a.user_id, a.standard_version
    into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id
     and a.user_id = auth.uid();

  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart, because saying which would '
      'confirm whose work is stored under it.';
  end if;

  select exists (
    select 1 from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id)
    into v_linked;

  -- ⚠️ NOT STATED IS A REAL STATE (20260816), never an assumed version. With no round linked there
  -- is nothing else to draw scope from, so this is a refusal rather than a default.
  if not v_linked and v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, and no survey round '
      'is linked to it, so there is no list of sub-topics to check against. Article 2(2) of Del. '
      'Reg. C(2026) 5010 requires the undertaking to state the version, and assuming one would be a '
      'false statement about which law was applied. State the version on the assessment first.';
  end if;

  -- Scope once, and what the lead holds within it. ⚠️ ONE PASS, kept in arrays, because the same
  -- set decides the completeness check AND which rows the UPDATE may touch — computing it twice
  -- would let the two drift apart within a single call.
  with linked as (
    select l.round_id
      from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id
     order by l.linked_at
     limit 1
  ),
  scope as (
    -- The taxonomy side, unchanged. Every sub-topic in scope is determined as a whole, ALWAYS —
    -- naming an IRO under it adds a row, it never replaces this one. ESRS requires the sub-topic
    -- assessed regardless, so the obligation is the standard's and not ours to relax.
    select q.subtopic_code, ''::text as iro_key
      from public.materiality_survey_questions q
      join linked l on l.round_id = q.round_id
     where q.status = 'included'
       and q.subtopic_code is not null
    union
    select s.code, ''::text
      from public.mr_esrs_subtopics s
     where s.standard_version = v_version
       and not exists (select 1 from linked)
    union
    -- ⚠️ THE COMPANY'S OWN DECLARATIONS. Not inference: this table holds a name and a parent and
    -- no determination of any kind. Without this arm a named IRO is invisible here, and the
    -- worksheet reports complete while it sits unscored — silent, and toward a false all-clear.
    --
    -- No `and not exists (select 1 from linked)` guard: a custom IRO is in scope whether or not a
    -- survey round is linked, because the company named it rather than a round including it.
    select i.subtopic_code, i.iro_key
      from public.materiality_custom_iros i
     where i.assessment_id = p_assessment_id
  ),
  held as (
    -- ⚠️ KEYED ON subtopic_code ALONE, AND THAT IS THE WHOLE ANSWER TO DELEGATION. Assignment is
    -- sub-topic granular (materiality_impact_assignment_subtopics, unique on
    -- (assessment_id, subtopic_code)), so a custom IRO under a delegated sub-topic is held by the
    -- contributor automatically, with no schema change and no second rule. Keying this on the pair
    -- would split an IRO from its parent and put two people on overlapping work — precisely what
    -- 20260838:379's one-assignee constraint exists to make impossible.
    select sc.subtopic_code, sc.iro_key
      from scope sc
     where not exists (
       select 1
         from public.materiality_impact_assignment_subtopics a
        where a.assessment_id = p_assessment_id
          and a.subtopic_code = sc.subtopic_code)
  )
  select (select array_agg((sc.subtopic_code, sc.iro_key)::public.materiality_iro_ref
                           order by sc.subtopic_code, sc.iro_key) from scope sc),
         (select array_agg((h.subtopic_code,  h.iro_key)::public.materiality_iro_ref
                           order by h.subtopic_code,  h.iro_key)  from held  h)
    into v_scope, v_held;

  if coalesce(array_length(v_scope, 1), 0) = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to submit. Either the linked '
      'survey round has no included questions, or no sub-topics are recorded for its standard '
      'version.';
  end if;

  if coalesce(array_length(v_held, 1), 0) = 0 then
    raise exception
      'Every one of the % sub-topics in scope is assigned to a contributor, so none of them is '
      'yours to submit. Each is submitted by the person holding it, from their own link.',
      array_length(v_scope, 1);
  end if;

  -- ⚠️ INCOMPLETE MEANS INCOMPLETE, AND IT IS NAMED. A determination is only coherent once its
  -- direction and nature are stated: "this is an actual negative impact and I cannot judge its
  -- scale" is a §6.1 abstention and is a real answer, but "I have no view on whether this is
  -- happening or might happen" is not a determination at all.
  --
  -- So every sub-topic the lead holds must carry BOTH directions with a nature. The dimensions may
  -- all be null. Refusing here rather than at the constraint means the lead is told WHICH ones,
  -- instead of receiving a check_violation naming a column.
  --
  -- ⚠️ NAMED, AND THE NAME HAS TO IDENTIFY ONE ROW. A held sub-topic with two named IROs under it
  -- can be outstanding three times over, and "E3-1 (negative), E3-1 (negative), E3-1 (negative)"
  -- sends a preparer to look for a bug rather than to finish their work. So the label carries the
  -- IRO's name where there is one. Left join, coalesced to the key: an IRO row that has gone
  -- missing must still be NAMED as outstanding rather than dropped from the list, which is the
  -- difference between an incomplete answer and a wrong one.
  select string_agg(m.label || ' (' || m.direction || ')', ', '
                    order by m.subtopic_code, m.iro_key, m.direction)
    into v_missing
    from (
      select c.subtopic_code,
             c.iro_key,
             case when c.iro_key = '' then c.subtopic_code
                  else c.subtopic_code || ' / ' || coalesce(i.name, c.iro_key) end as label,
             dir.direction
        from unnest(v_held) as c(subtopic_code, iro_key)
        cross join (values ('negative'), ('positive')) as dir(direction)
        left join public.materiality_custom_iros i
          on i.assessment_id = p_assessment_id
         and i.subtopic_code = c.subtopic_code
         and i.iro_key       = c.iro_key
        left join public.materiality_impact_determinations d
          on d.assessment_id = p_assessment_id
         and d.subtopic_code = c.subtopic_code
         and d.direction     = dir.direction
         and d.axis          = 'impact'
         and d.iro_key       = c.iro_key
       where d.assessment_id is null or d.nature is null
    ) m;

  if v_missing is not null then
    raise exception
      'These are not finished yet: %. Each sub-topic is determined twice — once for harm and once '
      'for benefit — and each needs to say whether it is already happening or might happen. The '
      'severity questions themselves can be left as "not enough visibility to assess".', v_missing;
  end if;

  -- ⚠️ RESTRICTED TO WHAT THE LEAD HOLDS, not merely to assignment_id is null. THE TWO ARE NOT THE
  -- SAME SET, and the subtopic_code line below is NOT redundant tidying: a sub-topic the lead
  -- started and then DELEGATED leaves a row with assignment_id null on a sub-topic that is now
  -- somebody else's. Such a row sits outside the completeness check above, which walks held
  -- sub-topics only — so without the restriction a half-finished row with no nature would be
  -- flipped to submitted and hit materiality_impact_determinations_submitted_is_complete,
  -- producing exactly the check_violation naming a column that the named-missing list exists to
  -- prevent. Deleting the line puts that back.
  update public.materiality_impact_determinations d
     set status        = 'submitted',
         determined_at = now()
   where d.assessment_id = p_assessment_id
     and d.assignment_id is null
     and (d.subtopic_code, d.iro_key)::public.materiality_iro_ref = any(v_held)
     and d.axis = 'impact'
     and d.status = 'draft';

  get diagnostics v_rows = row_count;

  -- Checked, not assumed: an UPDATE matching no row raises nothing and returns nothing. Here zero
  -- can mean only ONE thing — every held determination was already submitted — because the
  -- completeness check above has just proved a row exists for both directions of every held
  -- sub-topic. The ambiguity is designed out rather than documented, so a caller reading
  -- {"submitted": 0} knows it was a repeat call and not a silent failure.
  return jsonb_build_object('submitted', v_rows);
end $$;


--
-- Name: FUNCTION materiality_lead_submit(p_assessment_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_lead_submit(p_assessment_id uuid) IS 'The lead''''s counterpart to impact_submit: flips every determination the lead holds directly to submitted, on the impact axis. Scope is ENUMERATED from three sources — the earliest linked round''''s included questions, or mr_esrs_subtopics for the assessment''''s standard_version when no round is linked, PLUS every row in materiality_custom_iros for the assessment — minus everything in materiality_impact_assignment_subtopics. Never inferred from the determination rows that happen to exist. The custom-IRO arm does not break 20260844''''s enumerate-never-infer rule: that rule forbids reading the ANSWER table to decide what the QUESTIONS were, and materiality_custom_iros holds a name and a parent and no determination of any kind. Held-scope is keyed on subtopic_code alone, so a custom IRO is delegated with its parent and never apart from it. Refuses while any held unit lacks a direction-and-nature in either direction, NAMING which by the IRO''''s name. Returns {"submitted": n}; n = 0 can only mean the work was already submitted.';


--
-- Name: materiality_survey_counter_rows(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_counter_rows(p_round_id uuid, p_version integer) RETURNS TABLE(question_id uuid, dimension text, dimension_value text, n_asked integer, n_not_asked integer, n_answered integer, n_abstained integer, n_skipped integer, d1 integer, d2 integer, d3 integer, n_answered_off_route integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with respondents as (
    -- ⚠️ REACHED THE FORM, not merely invited. See the migration header for the departure from
    -- §3.0.1's literal wording and why counting unopened invitations as "asked" is a statement about
    -- email deliverability dressed as a finding about the company.
    select r.id, r.track, r.stakeholder_category, c.labour_routing
      from public.materiality_survey_respondents r
      join public.mr_stakeholder_categories c on c.code = r.stakeholder_category
     where r.round_id = p_round_id
       and r.status in ('in_progress', 'completed')
  ),
  questions as (
    select q.id, q.shared_with_subtopic_code, s.topic_code
      from public.materiality_survey_questions q
      -- LEFT: an entity-specific matter has no sub-topic and therefore no topic. It is asked of
      -- everyone (shared_with_subtopic_code is null), and an inner join would drop it from every
      -- counter with no error.
      left join public.mr_esrs_subtopics s
        on s.code = q.subtopic_code
       and s.standard_version = q.standard_version
     where q.round_id = p_round_id
       and q.questionnaire_version = p_version
       -- An excluded question was never put to anyone; it appears in the payload as considered and
       -- excluded (§3.2) and carries no counters.
       and q.status = 'included'
  ),
  universe as (
    select q.id as question_id,
           r.id as respondent_id,
           d.dimension,
           case d.dimension
             when 'overall'      then 'all'
             when 'track'        then r.track
             when 'labour_group' then r.labour_routing
             when 'category'     then r.stakeholder_category
           end as dimension_value,
           -- The SAME predicate the read path and the write path use. Two copies of the routing rule
           -- would let the aggregation count a question the respondent was never shown.
           public.materiality_survey_routes_to(
             q.shared_with_subtopic_code, q.topic_code, r.labour_routing) as is_routed
      from questions q
      cross join respondents r
      cross join (values ('overall'), ('track'), ('labour_group'), ('category')) d(dimension)
  ),
  joined as (
    select u.*, rs.value, rs.abstained
      from universe u
      left join public.materiality_survey_responses rs
        on rs.respondent_id = u.respondent_id
       and rs.question_id   = u.question_id
  )
  select
    j.question_id,
    j.dimension,
    j.dimension_value,
    count(*) filter (where j.is_routed)::int,
    count(*) filter (where not j.is_routed)::int,
    count(*) filter (where j.is_routed and j.value is not null)::int,
    count(*) filter (where j.is_routed and j.abstained)::int,
    -- §3.0.1: n_skipped is the arithmetic remainder, and naming it is the point. "I saw this and
    -- didn't engage" is a different finding from "I saw this and cannot say"; folding the two
    -- together corrupts the abstention finding in the same direction as counting not-asked would.
    (count(*) filter (where j.is_routed)
     - count(*) filter (where j.is_routed and j.value is not null)
     - count(*) filter (where j.is_routed and j.abstained))::int,
    count(*) filter (where j.is_routed and j.value = 1)::int,
    count(*) filter (where j.is_routed and j.value = 2)::int,
    count(*) filter (where j.is_routed and j.value = 3)::int,
    -- INTEGRITY, not a counter. A stored answer to a question the respondent was never routed to is
    -- refused by survey_save_response and by survey_submit, so this should always be zero. It is
    -- excluded from n_answered rather than allowed to inflate it, and surfaced separately so a
    -- non-zero value reads as the defect it would be. Meaningful only on the 'overall' dimension —
    -- it is counted once per dimension, so summing across dimensions quadruples it.
    count(*) filter (where not j.is_routed and (j.value is not null or j.abstained))::int
  from joined j
  group by j.question_id, j.dimension, j.dimension_value
$$;


--
-- Name: FUNCTION materiality_survey_counter_rows(p_round_id uuid, p_version integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_survey_counter_rows(p_round_id uuid, p_version integer) IS 'THE counter derivation for one survey round, one row per (question, dimension, dimension_value) over dimensions overall / track / labour_group / category. n_asked is DERIVED from the frozen question set and the category routing (spec v9 §3.0.1) and never counted from response rows. Counts respondents who REACHED the form (status in_progress or completed), not all invited — a documented departure from §3.0.1''s literal wording; see the header of 20260826_survey_aggregate.sql. Internal: revoked from PUBLIC and called only from inside survey_aggregate, because it returns unsuppressed cells.';


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
-- Name: materiality_survey_intro_variant(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_intro_variant(p_labour_routing text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
begin
  case p_labour_routing
    when 's1'        then return 'internal';
    when 's2'        then return 'value_chain';
    when 'not_asked' then return 'external';
    else
      raise exception
        'materiality_survey_intro_variant: unknown labour_routing %. Refusing rather than returning '
        'null, because a null variant reaches the page as a MISSING opening paragraph — and the one '
        'that goes missing for an s2 respondent is the paragraph telling them their answers go to '
        'the customer and not to their employer.',
        p_labour_routing;
  end case;
end $$;


--
-- Name: FUNCTION materiality_survey_intro_variant(p_labour_routing text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_survey_intro_variant(p_labour_routing text) IS 'Maps mr_stakeholder_categories.labour_routing to the respondent-page intro variant: s1 -> internal, s2 -> value_chain, not_asked -> external (docs/survey-intro-copy.md). DERIVED FROM labour_routing ON PURPOSE, so the eleven stakeholder categories are enumerated once, in the seeded table, and never a second time in a function body that could drift from it — the same argument 20260818''s header makes for the routing itself. A DISPLAY FACT, not a routing key: three values over eleven categories, lossy and non-invertible, naming no sub-topic and no category. Raises on an unrecognised routing rather than returning null, because a null variant is a silently missing paragraph.';


--
-- Name: materiality_survey_median_bounds(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_median_bounds(p_d1 integer, p_d2 integer, p_d3 integer, OUT o_low smallint, OUT o_high smallint) RETURNS record
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
declare
  v_n  int := coalesce(p_d1, 0) + coalesce(p_d2, 0) + coalesce(p_d3, 0);
  v_k1 int;
  v_k2 int;
begin
  if v_n = 0 then
    -- No scored answers. NULL, not 2, and not 0 — an absence, never a measured middle.
    o_low := null; o_high := null; return;
  end if;

  v_k1 := (v_n + 1) / 2;   -- integer division; odd n gives the single centre, even n the lower
  v_k2 := v_n / 2 + 1;     -- the upper centre; equals v_k1 when n is odd

  o_low  := case when v_k1 <= coalesce(p_d1, 0)                        then 1
                 when v_k1 <= coalesce(p_d1, 0) + coalesce(p_d2, 0)    then 2
                 else 3 end;
  o_high := case when v_k2 <= coalesce(p_d1, 0)                        then 1
                 when v_k2 <= coalesce(p_d1, 0) + coalesce(p_d2, 0)    then 2
                 else 3 end;
end $$;


--
-- Name: FUNCTION materiality_survey_median_bounds(p_d1 integer, p_d2 integer, p_d3 integer, OUT o_low smallint, OUT o_high smallint); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_survey_median_bounds(p_d1 integer, p_d2 integer, p_d3 integer, OUT o_low smallint, OUT o_high smallint) IS 'The two central order statistics of an ordinal distribution over categories 1, 2, 3 — returned as an interval and NEVER averaged. On an even n the median of {1,3} is the interval [1,3]; interpolating it to 2 would assert a category nobody chose and would smuggle back the equal-spacing assumption spec v9 §6.2.5 rejects. NULL when nothing was scored: an absence, never a measured middle.';


--
-- Name: materiality_survey_resolve_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_resolve_token(p_token uuid, OUT o_respondent_id uuid, OUT o_round_id uuid, OUT o_track text, OUT o_stakeholder_category text, OUT o_function_department text, OUT o_invite_name text, OUT o_questionnaire_version integer, OUT o_labour_routing text) RETURNS record
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_round_status text;
  v_has_answers  boolean;
begin
  -- The four opaque refusals, unchanged and FIRST. One message, one errcode, so a caller cannot
  -- tell unknown from revoked from expired from already-submitted.
  select r.id, r.round_id, r.track, r.stakeholder_category, r.function_department, r.invite_name,
         rd.questionnaire_version, c.labour_routing, rd.status
    into o_respondent_id, o_round_id, o_track, o_stakeholder_category, o_function_department,
         o_invite_name, o_questionnaire_version, o_labour_routing, v_round_status
    from public.materiality_survey_respondents r
    join public.materiality_survey_rounds rd
      on rd.id = r.round_id
    join public.mr_stakeholder_categories c
      on c.code = r.stakeholder_category
   where r.token = p_token
     and r.revoked_at is null
     and r.expires_at > now()
     and r.status not in ('completed', 'revoked', 'expired');

  if o_respondent_id is null then
    raise exception 'invalid token' using errcode = 'no_data_found';
  end if;

  -- The round-level refusal, SECOND, so it is reachable only with a live token.
  if v_round_status = 'closed' then
    select exists (
      select 1 from public.materiality_survey_responses rs
       where rs.respondent_id = o_respondent_id
    ) into v_has_answers;

    if v_has_answers then
      -- True: a response row is written on every save, and the counters read in_progress rows.
      raise exception
        'This survey has closed. Your answers up to now were received and counted.'
        using errcode = 'PT410';
    else
      -- Never opened it, or opened it and answered nothing. Saying their answers were counted would
      -- be a reassurance about evidence that does not exist.
      raise exception
        'This survey has closed and is no longer accepting responses.'
        using errcode = 'PT410';
    end if;
  end if;
end $$;


--
-- Name: FUNCTION materiality_survey_resolve_token(p_token uuid, OUT o_respondent_id uuid, OUT o_round_id uuid, OUT o_track text, OUT o_stakeholder_category text, OUT o_function_department text, OUT o_invite_name text, OUT o_questionnaire_version integer, OUT o_labour_routing text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_survey_resolve_token(p_token uuid, OUT o_respondent_id uuid, OUT o_round_id uuid, OUT o_track text, OUT o_stakeholder_category text, OUT o_function_department text, OUT o_invite_name text, OUT o_questionnaire_version integer, OUT o_labour_routing text) IS 'The shared token gate for survey_get / survey_save_response / survey_save_free_text / survey_save_closing_comment / survey_submit. FIVE refusals in two groups. The four RESPONDENT-level ones — unknown, revoked, expired, already submitted — share one message and one errcode (no_data_found) so a caller cannot distinguish them, and are checked FIRST so a guessed token never learns whether a round exists. The ROUND-level one is distinguishable on purpose: a closed round raises PT410 with a message saying the survey ended, and saying whether the holder''s answers were counted — true for someone half-way through, and deliberately NOT said to someone who never opened it. Added 20260836, which is what makes 20260827''s premise true: an assessment may consume only a closed round BECAUSE its figures stop moving, and until this function read the round''s status nothing stopped them.';


--
-- Name: materiality_survey_respondent_guard(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_respondent_guard() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_unresolved int;
begin
  -- ── 1. A submitted survey cannot be silently reopened. ──────────────────────
  -- The only re-entry: materiality_survey_resolve_token admits a respondent on revoked_at,
  -- expires_at and status, and of those only status can move the permissive way.
  if old.status = 'completed' and new.status is distinct from 'completed' then
    raise exception
      'materiality_survey_respondents.status cannot leave ''completed'' (% -> %). A survey whose '
      'answers can change after submission with no trace is not evidence, and the ESRS 2 SBM-2 '
      'engagement disclosure would be describing something the data cannot support. Reopening is a '
      'designed feature that does not exist yet (survey_reopen — the brief is in the header of '
      '20260821_materiality_survey_respondent_completed_lock.sql). To collect a further response, '
      'invite the person again with a new token: that adds evidence rather than rewriting it.',
      old.status, new.status;
  end if;

  -- ── 2. completed_at is the field-date evidence §7 discloses. ────────────────
  if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    raise exception
      'materiality_survey_respondents.completed_at is fixed once set (% -> %). It is the field-date '
      'evidence the engagement disclosure states; a timestamp that can be moved or cleared with no '
      'trace is the same defect as a reopenable status, one column over.',
      old.completed_at, new.completed_at;
  end if;

  -- ── 3. Entering 'completed' requires that the answers were actually resolved. ─
  -- Without this, the lock above would make a hand-set completion PERMANENT: status would say
  -- completed while every response row still carried a null resolution, and the roll-up reads
  -- resolved_subtopic_code — so those answers would be silently absent from every count they belong
  -- in, forever. survey_submit resolves the rows one statement before it sets status, so its own
  -- UPDATE passes here; a hand-set completion does not.
  --
  -- Keyed on resolution_basis, not resolved_subtopic_code: the latter is legitimately NULL on an
  -- entity-specific matter (§3.2), which would have made a correct submit look unresolved.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select count(*)
      into v_unresolved
      from public.materiality_survey_responses r
     where r.respondent_id = old.id
       and r.resolution_basis is null;

    if v_unresolved > 0 then
      raise exception
        'Cannot mark this respondent completed: % of their answers have not been resolved to an '
        'ESRS sub-topic. Completion is what survey_submit(token) does, and resolving the answers is '
        'the half that matters — a completed respondent whose rows carry no resolution is silently '
        'absent from every count they belong in (spec v8 §6.3), and this lock would make that '
        'permanent. Call survey_submit rather than setting the status by hand.',
        v_unresolved;
    end if;
    -- A respondent with NO responses passes, and must: partial submission is permitted, and
    -- n_skipped exists only because someone can submit having answered nothing (§3.0.1).
  end if;

  return new;
end $$;


--
-- Name: FUNCTION materiality_survey_respondent_guard(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_survey_respondent_guard() IS 'THE INTERIM LOCK on survey submission, pending survey_reopen. Refuses any status transition OUT of ''completed'' — 20260819 grants authenticated UPDATE on this table under an owner policy, so before this trigger the customer could silently reopen a submitted survey with a plain UPDATE and re-answer it, leaving the ESRS 2 SBM-2 engagement disclosure describing evidence the data could not support. Also holds completed_at immutable once set (the field-date evidence §7 discloses), and refuses entry INTO ''completed'' while any of the respondent''s answers is unresolved — because the first refusal would otherwise turn a hand-set completion into a permanent one, with every answer silently absent from the roll-up. The design brief for survey_reopen is in the header of 20260821_materiality_survey_respondent_completed_lock.sql.';


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

  if old.frozen_at is not null then
    if new.anonymity_floor            is distinct from old.anonymity_floor
    or new.polarised_extreme_min_n    is distinct from old.polarised_extreme_min_n
    or new.polarised_middle_max_share is distinct from old.polarised_middle_max_share
    or new.top_box_gap_margin         is distinct from old.top_box_gap_margin
    or new.free_text_group_floor      is distinct from old.free_text_group_floor then
      raise exception
        'The disclosed constants for this round are fixed from the first response (frozen_at = %). '
        'The aggregation is computed live and nothing is stored, so changing a threshold now would '
        'silently add or remove entries from a register that has already been read — and for '
        'free_text_group_floor it would retroactively attach or withdraw a group label on comments '
        'someone has already read (spec v9 §6.2.6, §10). Create a new round instead.',
        old.frozen_at;
    end if;
  end if;

  if old.status = 'closed' and new.status is distinct from 'closed' then
    if exists (select 1 from public.materiality_assessment_survey_rounds l
                where l.round_id = old.id) then
      raise exception
        'Survey round % has informed % materiality assessment(s) and cannot leave ''closed'' (% -> '
        '%). Reopening it would let further responses change the evidence base of a determination '
        'that has already been made from it, with nothing anywhere recording that the figures '
        'moved. Unlink it from the assessment(s) first — that is the deliberate act that permits '
        'this, and it correctly leaves them no longer citing this round.',
        old.id,
        (select count(*) from public.materiality_assessment_survey_rounds l where l.round_id = old.id),
        old.status, new.status;
    end if;
  end if;

  return new;
end $$;


--
-- Name: materiality_survey_round_snapshot_thresholds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_round_snapshot_thresholds() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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
end $$;


--
-- Name: materiality_survey_routes_to(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materiality_survey_routes_to(p_shared_with_subtopic_code text, p_topic_code text, p_labour_routing text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION materiality_survey_routes_to(p_shared_with_subtopic_code text, p_topic_code text, p_labour_routing text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.materiality_survey_routes_to(p_shared_with_subtopic_code text, p_topic_code text, p_labour_routing text) IS 'THE S1/S2 ROUTING PREDICATE (spec v8 §3.0.1), in one place. True when a question should be shown to a respondent whose category has the given labour_routing. Non-paired questions (shared_with_subtopic_code null) are asked of everyone, including entity-specific matters. Paired questions are decided from mr_esrs_subtopics.topic_code, NEVER by string surgery on the sub-topic code — 20260818''s header names that derivation as a latent defect the moment it becomes a live routing rule. Called by survey_get, survey_save_response and survey_submit; two copies of this rule would mean the read path and the write path could disagree about what was asked.';


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
-- Name: survey_aggregate(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.survey_aggregate(p_round_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_round    record;
  v_floor    int;
  v_ft_floor int;
  v jsonb;
begin
  select r.id, r.name, r.company_name, r.standard_version, r.questionnaire_version,
         r.anonymity_floor, r.polarised_extreme_min_n, r.polarised_middle_max_share,
         r.top_box_gap_margin, r.free_text_group_floor, r.deadline, r.frozen_at, r.status
    into v_round
    from public.materiality_survey_rounds r
   where r.id = p_round_id
     and r.user_id = auth.uid();

  if not found then
    raise exception 'survey round not found' using errcode = 'no_data_found';
  end if;

  v_floor    := v_round.anonymity_floor;
  v_ft_floor := v_round.free_text_group_floor;

  with
  cells as materialized (
    select * from public.materiality_survey_counter_rows(p_round_id, v_round.questionnaire_version)
  ),
  qmeta as (
    select q.id as question_id, q.subtopic_code, q.short_name, q.question_framing,
           q.status, q.exclusion_reason, q.sort_order, q.shared_with_subtopic_code,
           s.topic_code, tl.label as topic_label
      from public.materiality_survey_questions q
      left join public.mr_esrs_subtopics s
        on s.code = q.subtopic_code and s.standard_version = q.standard_version
      left join public.mr_esrs_topic_labels tl
        on tl.topic_code = s.topic_code and tl.standard_version = s.standard_version
     where q.round_id = p_round_id
       and q.questionnaire_version = v_round.questionnaire_version
  ),
  ov as (
    select c.question_id, c.n_asked, c.n_not_asked, c.n_answered, c.n_abstained, c.n_skipped,
           c.d1, c.d2, c.d3, c.n_answered_off_route,
           (c.d1 + c.d2 + c.d3) as n_scored
      from cells c
     where c.dimension = 'overall'
  ),
  ov_stat as (
    select o.*,
           case when o.n_scored > 0 then round(o.d3::numeric / o.n_scored, 4) end as top_box,
           case when o.n_scored > 0
                then round(greatest(o.d1, o.d2, o.d3)::numeric / o.n_scored, 4) end as modal_share,
           (o.n_scored > 0
            and o.d1 >= v_round.polarised_extreme_min_n
            and o.d3 >= v_round.polarised_extreme_min_n
            and (o.d2::numeric / o.n_scored) < v_round.polarised_middle_max_share) as polarised,
           m.o_low  as median_low,
           m.o_high as median_high
      from ov o
      cross join lateral public.materiality_survey_median_bounds(o.d1, o.d2, o.d3) m
  ),
  bd as (
    select c.question_id, c.dimension, c.dimension_value,
           c.n_asked, c.n_not_asked, c.n_answered, c.n_abstained, c.n_skipped,
           c.d1, c.d2, c.d3, (c.d1 + c.d2 + c.d3) as n_scored
      from cells c
     where c.dimension <> 'overall'
       and c.dimension_value is not null
  ),
  bd_live as (select * from bd where n_asked > 0),
  dim_stats as (
    select question_id, dimension,
           count(*)::int as cells_in_dim,
           count(*) filter (where n_scored < v_floor)::int as k0
      from bd_live
     group by question_id, dimension
  ),
  ranked as (
    select b.question_id, b.dimension, b.dimension_value,
           row_number() over w as rn,
           sum(b.n_scored) over w as cum_scored
      from bd_live b
    window w as (partition by b.question_id, b.dimension
                 order by b.n_scored, b.dimension_value
                 rows between unbounded preceding and current row)
  ),
  sup_len as (
    select d.question_id, d.dimension, d.cells_in_dim,
           case when d.k0 = 0 then 0
                else coalesce(
                       (select min(r.rn) from ranked r
                         where r.question_id = d.question_id
                           and r.dimension   = d.dimension
                           and r.rn >= d.k0
                           and r.rn >= 2
                           and r.cum_scored >= v_floor),
                       d.cells_in_dim)
           end as l
      from dim_stats d
  ),
  bd_flagged as (
    select b.*, (r.rn <= s.l) as suppressed, s.cells_in_dim
      from bd_live b
      join ranked  r on r.question_id = b.question_id
                    and r.dimension   = b.dimension
                    and r.dimension_value = b.dimension_value
      join sup_len s on s.question_id = b.question_id
                    and s.dimension   = b.dimension
  ),
  bd_shown as (
    select f.*,
           case when f.n_scored > 0 then round(f.d3::numeric / f.n_scored, 4) end as top_box
      from bd_flagged f
     where not f.suppressed
  ),
  gaps as (
    select a.question_id, a.dimension,
           a.dimension_value as a_value, a.top_box as a_top_box, a.n_scored as a_n,
           b.dimension_value as b_value, b.top_box as b_top_box, b.n_scored as b_n,
           abs(a.top_box - b.top_box) as gap
      from bd_shown a
      join bd_shown b
        on b.question_id = a.question_id
       and b.dimension   = a.dimension
       and b.dimension_value > a.dimension_value
     where a.dimension in ('track', 'labour_group')
       and a.top_box is not null
       and b.top_box is not null
       and abs(a.top_box - b.top_box) > v_round.top_box_gap_margin
  ),
  pairs as (
    select a.subtopic_code as s1_code, b.subtopic_code as s2_code,
           a.short_name, a.question_id as s1_qid, b.question_id as s2_qid,
           (a.status = 'included' and b.status = 'included') as both_included
      from qmeta a
      join qmeta b on b.subtopic_code = a.shared_with_subtopic_code
     where a.shared_with_subtopic_code is not null
       and a.subtopic_code < a.shared_with_subtopic_code
  ),
  participation as (
    select count(*)::int as invited,
           count(*) filter (where status in ('in_progress', 'completed'))::int as reached,
           count(*) filter (where status = 'completed')::int as completed,
           count(*) filter (where status = 'invited')::int as never_opened,
           count(*) filter (where status = 'revoked')::int as revoked,
           count(*) filter (where status = 'expired')::int as expired
      from public.materiality_survey_respondents
     where round_id = p_round_id
  ),

  -- ── FREE TEXT (added 20260831). answers_as comes from mr_stakeholder_categories and decides
  -- whether the floor applies at all; see the header.
  cmt_closing as (
    select c.comment, c.track, c.stakeholder_category, sc.answers_as
      from public.materiality_survey_closing_comments c
      join public.mr_stakeholder_categories sc on sc.code = c.stakeholder_category
     where c.round_id = p_round_id
       and c.questionnaire_version = v_round.questionnaire_version
  ),
  cmt_question as (
    -- No score is selected beside the comment. See the header: the two together would be a
    -- per-respondent record.
    select rs.free_text as comment, rs.track, rs.stakeholder_category, sc.answers_as,
           q.subtopic_code, q.short_name, q.topic_label, q.sort_order
      from public.materiality_survey_responses rs
      join public.mr_stakeholder_categories sc on sc.code = rs.stakeholder_category
      join qmeta q on q.question_id = rs.question_id
     where rs.round_id = p_round_id
       and rs.questionnaire_version = v_round.questionnaire_version
       and rs.free_text is not null
  ),
  cmt_all as (
    select track, stakeholder_category, answers_as from cmt_closing
    union all
    select track, stakeholder_category, answers_as from cmt_question
  ),
  -- The total gate and the two label counts, all over INDIVIDUAL comments only.
  cmt_ind_total as (
    select count(*)::int as n from cmt_all where answers_as = 'individual'
  ),
  cmt_by_track as (
    select track, count(*)::int as n from cmt_all
     where answers_as = 'individual' group by track
  ),
  cmt_by_cat as (
    select stakeholder_category as cat, count(*)::int as n from cmt_all
     where answers_as = 'individual' group by stakeholder_category
  )

  select jsonb_build_object(

    'round', jsonb_build_object(
      'id',                    v_round.id,
      'name',                  v_round.name,
      'company_name',          v_round.company_name,
      'standard_version',      v_round.standard_version,
      'questionnaire_version', v_round.questionnaire_version,
      'status',                v_round.status,
      'deadline',              v_round.deadline,
      'frozen_at',             v_round.frozen_at),

    'method', jsonb_build_object(
      'statistic',        'distribution',
      'mean_computed',    false,
      'mean_note',        'No mean is computed, stored or returned anywhere. The screening scale is '
                       || 'ordinal and a mean assumes equal spacing between its points '
                       || '(spec v9 §6.2.5).',
      'median_convention','Both central order statistics, returned as median_low and median_high. '
                       || 'Never interpolated: the median of {1,3} is the interval [1,3], not 2.',
      'dispersion', jsonb_build_object(
        'method',       'modal_share_and_polarisation',
        'definition',   'Concentration is reported as modal_share, the share of scored answers in '
                     || 'the largest category. A split room is reported as the boolean `polarised`: '
                     || 'at least polarised_extreme_min_n answers at BOTH 1 and 3, and fewer than '
                     || 'polarised_middle_max_share of answers at 2.',
        'agreement_coefficient', null,
        'agreement_coefficient_note',
                        'NOT COMPUTED. Spec v9 §6.2.6 proposes van der Eijk''s coefficient of '
                     || 'agreement (A) and offers the raw split as an acceptable fallback. A is not '
                     || 'implemented here because it was not possible to implement it verifiably: a '
                     || 'coefficient printed in a compliance report under a named published method, '
                     || 'which no reader can recompute, is worse than a raw split that every reader '
                     || 'can. The §6.2.6 trigger "agreement falls below a disclosed threshold" is '
                     || 'therefore NOT active; the other two triggers are.'),
      'thresholds', jsonb_build_object(
        'anonymity_floor',            v_round.anonymity_floor,
        'polarised_extreme_min_n',    v_round.polarised_extreme_min_n,
        'polarised_middle_max_share', v_round.polarised_middle_max_share,
        'top_box_gap_margin',         v_round.top_box_gap_margin,
        'free_text_group_floor',      v_round.free_text_group_floor,
        'source', 'Snapshotted onto this round at creation from mr_survey_thresholds, which carries '
               || 'a printable definition and a stated source for each. Fixed from the first '
               || 'response, so a later change cannot restate this round''s registers.'),
      'suppression', jsonb_build_object(
        'rule', 'A breakdown cell is suppressed when fewer than anonymity_floor respondents scored '
             || 'it. Because cells sum to a published total, further cells are then suppressed — '
             || 'smallest first — until at least two are suppressed and their combined answers '
             || 'reach the floor; otherwise the whole dimension is suppressed.',
        'two_valued_note',
                'On a two-valued dimension (track), ANY suppression suppresses the whole dimension: '
             || 'one shown cell beside a published total publishes the other. This is the rule '
             || 'working, not a defect.',
        'overall_note', 'The overall figure for a sub-topic is never suppressed, at any n. '
             || 'Identification risk lies in the splits, not in the total.',
        'single_group_note',
                'A dimension with only one participating group is omitted with reason '
             || '"single_group": its one cell equals the overall, so it adds nothing, and '
             || 'suppressing it would imply a protection the published overall already defeats. A '
             || 'dimension with NO participating groups is omitted with reason "no_respondents" — a '
             || 'distinct fact, and a temporary one.'),
      'n_asked_basis',
              'Derived from the frozen question set and the stakeholder-category routing, over '
           || 'respondents who REACHED the form (status in_progress or completed). Never counted '
           || 'from response rows. This is a documented departure from spec v9 §3.0.1''s literal '
           || 'wording, which counts all invited: counting an unopened invitation as asked-and-'
           || 'skipped is a fact about email delivery reported as a finding about the company. The '
           || 'invitation funnel is reported separately under `participation`.',
      'not_produced',
              'No topic score, and no divergence register. The screening survey is the stakeholder '
           || 'dialogue layer and not the impact assessment (spec v9 §1.0); a single number per '
           || 'topic is the field most likely to be mistaken for a determination. The divergence '
           || 'register (§6.4) needs the preparer''s band, which lives in a jsonb blob owned by '
           || 'lib/materiality.ts; the round-to-assessment link now exists (20260827) but the '
           || 'comparison has no defensible home in SQL.'),

    'participation', (select jsonb_build_object(
        'invited',      p.invited,
        'reached',      p.reached,
        'completed',    p.completed,
        'never_opened', p.never_opened,
        'revoked',      p.revoked,
        'expired',      p.expired,
        'note', 'Counts of invitations, not of answers, and therefore not subject to the anonymity '
             || 'floor: the customer created this invite list and can already read it. `reached` is '
             || 'the denominator every counter in `subtopics` is built on.')
      from participation p),

    'integrity', jsonb_build_object(
      'responses_off_route',     (select coalesce(sum(o.n_answered_off_route), 0)::int from ov o),
      'responses_other_version', (select count(*)::int
                                    from public.materiality_survey_responses rs
                                   where rs.round_id = p_round_id
                                     and rs.questionnaire_version <> v_round.questionnaire_version),
      'note', 'Both should be zero. responses_off_route counts stored answers to questions the '
           || 'respondent was never routed to — refused by survey_save_response and by '
           || 'survey_submit, excluded from n_answered here rather than allowed to inflate it. '
           || 'responses_other_version counts answers against a superseded questionnaire version, '
           || 'which are outside this aggregation entirely and are never pooled with it (§3.3).'),

    'subtopics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subtopic_code',    q.subtopic_code,
               'topic_code',       q.topic_code,
               'topic_label',      q.topic_label,
               'short_name',       q.short_name,
               'question_framing', q.question_framing,
               'status',           q.status,
               'exclusion_reason', q.exclusion_reason,
               'overall', case when q.status <> 'included' then null else
                 (select jsonb_build_object(
                    'n_asked',      o.n_asked,
                    'n_answered',   o.n_answered,
                    'n_abstained',  o.n_abstained,
                    'n_skipped',    o.n_skipped,
                    'n_not_asked',  o.n_not_asked,
                    'distribution', jsonb_build_object('1', o.d1, '2', o.d2, '3', o.d3),
                    'top_box',      jsonb_build_object(
                                      'share', o.top_box, 'numerator', o.d3,
                                      'denominator', o.n_scored),
                    'median_low',   o.median_low,
                    'median_high',  o.median_high,
                    'modal_share',  o.modal_share,
                    'polarised',    o.polarised)
                    from ov_stat o where o.question_id = q.question_id) end,
               'breakdowns', case when q.status <> 'included' then null else
                 (select coalesce(jsonb_object_agg(x.dimension, x.payload), '{}'::jsonb)
                    from (
                      select d.dimension,
                             -- ⚠️ THE SAME COLLAPSE, ONE LEVEL DOWN. `<= 1` mapped ZERO groups and
                             -- ONE group to the same reason, so on a round nobody has opened every
                             -- dimension claimed "only one participating group, so it adds nothing
                             -- beyond overall" — when there were none at all. Zero is a different
                             -- fact and it is temporary.
                             case when coalesce(s.cells_in_dim, 0) = 0
                                  then jsonb_build_object('omitted', true, 'reason', 'no_respondents')
                                  when s.cells_in_dim = 1
                                  then jsonb_build_object('omitted', true, 'reason', 'single_group')
                                  else jsonb_build_object('omitted', false, 'cells', coalesce((
                                    select jsonb_agg(jsonb_build_object(
                                             'value',       f.dimension_value,
                                             'suppressed',  f.suppressed,
                                             'n_asked',     case when f.suppressed then null else f.n_asked end,
                                             'n_answered',  case when f.suppressed then null else f.n_answered end,
                                             'n_abstained', case when f.suppressed then null else f.n_abstained end,
                                             'n_skipped',   case when f.suppressed then null else f.n_skipped end,
                                             'n_not_asked', case when f.suppressed then null else f.n_not_asked end,
                                             'distribution', case when f.suppressed then null else
                                               jsonb_build_object('1', f.d1, '2', f.d2, '3', f.d3) end,
                                             'top_box', case when f.suppressed or f.n_scored = 0 then null else
                                               round(f.d3::numeric / f.n_scored, 4) end)
                                             order by f.dimension_value)
                                      from bd_flagged f
                                     where f.question_id = q.question_id
                                       and f.dimension = d.dimension), '[]'::jsonb))
                             end as payload
                        from (values ('track'), ('labour_group'), ('category')) d(dimension)
                        left join sup_len s on s.question_id = q.question_id
                                           and s.dimension = d.dimension
                    ) x) end)
             order by q.sort_order)
        from qmeta q
       where q.subtopic_code is not null), '[]'::jsonb),

    'entity_specific', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question_id',  q.question_id,
               'short_name',   q.short_name,
               'status',       q.status,
               'exclusion_reason', q.exclusion_reason,
               'overall', case when q.status <> 'included' then null else
                 (select jsonb_build_object(
                    'n_asked', o.n_asked, 'n_answered', o.n_answered,
                    'n_abstained', o.n_abstained, 'n_skipped', o.n_skipped,
                    'distribution', jsonb_build_object('1', o.d1, '2', o.d2, '3', o.d3),
                    'top_box', jsonb_build_object('share', o.top_box, 'numerator', o.d3,
                                                  'denominator', o.n_scored),
                    'median_low', o.median_low, 'median_high', o.median_high,
                    'modal_share', o.modal_share, 'polarised', o.polarised)
                    from ov_stat o where o.question_id = q.question_id) end)
             order by q.sort_order)
        from qmeta q
       where q.subtopic_code is null), '[]'::jsonb),

    'topics', coalesce((
      select jsonb_agg(t.payload order by t.topic_code)
        from (
          select q.topic_code,
                 jsonb_build_object(
                   'topic_code',  q.topic_code,
                   'topic_label', max(q.topic_label),
                   'subtopics_included', count(*) filter (where q.status = 'included')::int,
                   'subtopics_excluded', count(*) filter (where q.status = 'excluded')::int,
                   'subtopics_resolved', count(*) filter (
                       where q.status = 'included' and coalesce(o.n_answered, 0) > 0)::int,
                   'n_asked',     coalesce(sum(o.n_asked)     filter (where q.status = 'included'), 0)::int,
                   'n_answered',  coalesce(sum(o.n_answered)  filter (where q.status = 'included'), 0)::int,
                   'n_abstained', coalesce(sum(o.n_abstained) filter (where q.status = 'included'), 0)::int,
                   'n_skipped',   coalesce(sum(o.n_skipped)   filter (where q.status = 'included'), 0)::int,
                   'n_not_asked', coalesce(sum(o.n_not_asked) filter (where q.status = 'included'), 0)::int,
                   'unknown', (count(*) filter (
                       where q.status = 'included' and coalesce(o.n_answered, 0) > 0) = 0),
                   -- ⚠️ THREE REASONS, NOT TWO, AND THE FIRST TWO ARE ABOUT DIFFERENT THINGS.
                   -- 'awaiting_first_response' is TIMING: people were invited and none has opened
                   -- the survey yet, so every topic has n_asked = 0 for a reason that will stop
                   -- being true tomorrow. 'no_eligible_respondents' is ENGAGEMENT: respondents DID
                   -- reach the form and none of their categories routes to this topic — invariant 5,
                   -- the finding that a round of forty customers yields unknown S2. Collapsing the
                   -- first into the second told a customer their invite list was wrong when it was
                   -- merely early, which is this module's recurring error: an unopened invitation
                   -- reported as a finding about the company.
                   'unknown_reason', case
                     when count(*) filter (
                            where q.status = 'included' and coalesce(o.n_answered, 0) > 0) > 0
                       then null
                     when (select p.reached from participation p) = 0
                       then 'awaiting_first_response'
                     when coalesce(sum(o.n_asked) filter (where q.status = 'included'), 0) = 0
                       then 'no_eligible_respondents'
                     else 'no_answers' end,
                   'note', 'Counts only. No topic score is produced — the screening survey is not '
                        || 'the impact assessment (§1.0). subtopics_resolved against '
                        || 'subtopics_included is the coverage claim, and the two are never '
                        || 'collapsed into one percentage: that would merge "we asked and nobody '
                        || 'could say" with "we never asked".'
                 ) as payload
            from qmeta q
            left join ov o on o.question_id = q.question_id
           where q.topic_code is not null
           group by q.topic_code
        ) t), '[]'::jsonb),

    'disagreement_register', jsonb_build_object(
      'what_this_is', 'Sub-topics where the respondents disagree with EACH OTHER (§6.2.6). Separate '
                   || 'from the divergence register, which compares stakeholders with the '
                   || 'preparer''s determination and is not built. A sub-topic can appear on both.',
      'triggers_active', jsonb_build_array('polarised', 'between_group_top_box_gap'),
      'triggers_inactive', jsonb_build_array('agreement_below_threshold'),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'subtopic_code', q.subtopic_code,
                 'short_name',    q.short_name,
                 'topic_label',   q.topic_label,
                 'n_answered',    o.n_answered,
                 'distribution',  jsonb_build_object('1', o.d1, '2', o.d2, '3', o.d3),
                 'top_box',       o.top_box,
                 'triggers', (case when o.polarised then jsonb_build_array('polarised')
                                   else '[]'::jsonb end)
                          || (case when exists (select 1 from gaps g where g.question_id = q.question_id)
                                   then jsonb_build_array('between_group_top_box_gap')
                                   else '[]'::jsonb end),
                 'between_group', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'dimension', g.dimension,
                            'a', jsonb_build_object('group', g.a_value, 'top_box', g.a_top_box,
                                                    'n_answered', g.a_n),
                            'b', jsonb_build_object('group', g.b_value, 'top_box', g.b_top_box,
                                                    'n_answered', g.b_n),
                            'gap', g.gap)
                          order by g.dimension, g.a_value, g.b_value)
                     from gaps g where g.question_id = q.question_id), '[]'::jsonb))
               order by q.sort_order)
          from qmeta q
          join ov_stat o on o.question_id = q.question_id
         where q.status = 'included'
           and q.subtopic_code is not null
           and o.n_scored >= v_floor
           and (o.polarised or exists (select 1 from gaps g where g.question_id = q.question_id))
        ), '[]'::jsonb)),

    's1_s2_contrast', jsonb_build_object(
      'what_this_is', 'The paired labour sub-topics: what your own workforce says about their '
                   || 'workplace, beside what value-chain workers say about theirs. This is the '
                   || 'sharpest output the S1/S2 routing produces.',
      'what_this_is_not',
                      'NOT disagreement, and never to be merged into the disagreement register. '
                   || 'S1.x and S2.x are different questions put to different populations about '
                   || 'different workplaces, so a difference between them is not respondents '
                   || 'disagreeing — it is two populations reporting different conditions, which is '
                   || 'a finding about the company.',
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
                 's1_subtopic_code', p.s1_code,
                 's2_subtopic_code', p.s2_code,
                 'short_name',       p.short_name,
                 's1', jsonb_build_object('n_answered', o1.n_scored, 'top_box', o1.top_box,
                                          'distribution', case when o1.question_id is null then null
                                            else jsonb_build_object('1', o1.d1, '2', o1.d2,
                                                                    '3', o1.d3) end),
                 's2', jsonb_build_object('n_answered', o2.n_scored, 'top_box', o2.top_box,
                                          'distribution', case when o2.question_id is null then null
                                            else jsonb_build_object('1', o2.d1, '2', o2.d2,
                                                                    '3', o2.d3) end),
                 'comparable', (p.both_included
                                and coalesce(o1.n_scored, 0) >= v_floor
                                and coalesce(o2.n_scored, 0) >= v_floor),
                 'not_comparable_reason', case
                   when not p.both_included then 'one or both sub-topics were deselected for this '
                                              || 'round, so there is no pair to draw'
                   when coalesce(o1.n_scored, 0) >= v_floor
                    and coalesce(o2.n_scored, 0) >= v_floor then null
                   when coalesce(o1.n_scored, 0) = 0 and coalesce(o2.n_scored, 0) = 0
                     then 'neither side was answered'
                   when coalesce(o2.n_scored, 0) = 0
                     then 'no value-chain respondent answered this sub-topic'
                   when coalesce(o1.n_scored, 0) = 0
                     then 'no own-workforce respondent answered this sub-topic'
                   else 'one or both sides are below the anonymity floor' end,
                 'gap', case when p.both_included
                              and coalesce(o1.n_scored, 0) >= v_floor
                              and coalesce(o2.n_scored, 0) >= v_floor
                             then abs(o1.top_box - o2.top_box) end,
                 'flagged', (p.both_included
                             and coalesce(o1.n_scored, 0) >= v_floor
                             and coalesce(o2.n_scored, 0) >= v_floor
                             and abs(o1.top_box - o2.top_box) > v_round.top_box_gap_margin))
               order by p.s1_code)
          from pairs p
          left join ov_stat o1 on o1.question_id = p.s1_qid
          left join ov_stat o2 on o2.question_id = p.s2_qid
        ), '[]'::jsonb)),

    -- ── FREE TEXT (added 20260831) ──────────────────────────────────────────────
    'free_text', jsonb_build_object(
      'method', jsonb_build_object(
        'verbatim', 'Comments are returned exactly as written. They are NEVER suppressed by the '
                 || 'anonymity floor — the floor withholds a group LABEL, not the text. Suppressing '
                 || 'a closing comment would defeat the only emerging-topic mechanism the module '
                 || 'has: survey scope is fixed at round creation, so that question is the only '
                 || 'route by which an out-of-scope matter reaches the preparer (ESRS 2 IRO-1).',
        'label_rule',
                    'A comment from a respondent who answers AS AN INDIVIDUAL carries its '
                 || 'stakeholder category only if at least free_text_group_floor individual '
                 || 'comments in this round share that category, and its track only if that many '
                 || 'share the track. Below the floor it carries respondent_type alone. A comment '
                 || 'from a respondent who answers FOR AN ORGANISATION always carries both labels: '
                 || 'the customer invited that organisation by name and holds the invite list, so '
                 || 'withholding the label conceals nothing and destroys the only thing that makes '
                 || 'the comment actionable.',
        'total_gate',
                    'No individual comments are returned at all until the round holds '
                 || 'free_text_group_floor of them. ⚠️ This blunts but does not close the attack '
                 || 'where the aggregate is polled as responses arrive and a newly-appearing '
                 || 'comment is attributed to whoever just completed. Once the floor is cleared, '
                 || 'the next comment to appear is still correlatable with the next completion.',
        'what_no_floor_can_do',
                    '⚠️ A comment naming a site, a manager or a role identifies its author whatever '
                 || 'the counts are. No aggregation rule prevents that. The control is telling the '
                 || 'respondent before they type, which the survey page does beside every box.',
        'omitted',  'function_department is never carried on a comment — it is free-form and the '
                 || 'most identifying non-name field in the schema. No score is returned beside a '
                 || 'question comment: the two together would be a per-respondent record.',
        'residual', 'respondent_type is on every comment, so an unlabelled comment is known to come '
                 || 'from one of the six individual categories. That narrowing is disclosed rather '
                 || 'than concealed: omitting the type would leave the pattern of labelled and '
                 || 'unlabelled comments carrying the same information silently.'),

      'individual_comments_withheld', (select c.n < v_ft_floor from cmt_ind_total c),
      'individual_comment_count',     (select c.n from cmt_ind_total c),

      'closing_comments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'respondent_type', c.answers_as,
                 'track', case when c.answers_as = 'organisation' then c.track
                               when coalesce((select t.n from cmt_by_track t
                                               where t.track = c.track), 0) >= v_ft_floor
                                 then c.track end,
                 'stakeholder_category', case when c.answers_as = 'organisation'
                                                then c.stakeholder_category
                               when coalesce((select k.n from cmt_by_cat k
                                               where k.cat = c.stakeholder_category), 0) >= v_ft_floor
                                 then c.stakeholder_category end,
                 'comment', c.comment)
               order by c.answers_as, c.comment)
          from cmt_closing c
         where c.answers_as = 'organisation'
            or (select t.n from cmt_ind_total t) >= v_ft_floor), '[]'::jsonb),

      'question_comments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'subtopic_code',   c.subtopic_code,
                 'short_name',      c.short_name,
                 'topic_label',     c.topic_label,
                 'respondent_type', c.answers_as,
                 'track', case when c.answers_as = 'organisation' then c.track
                               when coalesce((select t.n from cmt_by_track t
                                               where t.track = c.track), 0) >= v_ft_floor
                                 then c.track end,
                 'stakeholder_category', case when c.answers_as = 'organisation'
                                                then c.stakeholder_category
                               when coalesce((select k.n from cmt_by_cat k
                                               where k.cat = c.stakeholder_category), 0) >= v_ft_floor
                                 then c.stakeholder_category end,
                 'comment', c.comment)
               order by c.sort_order, c.answers_as, c.comment)
          from cmt_question c
         where c.answers_as = 'organisation'
            or (select t.n from cmt_ind_total t) >= v_ft_floor), '[]'::jsonb))
  )
  into v;

  if v is null then
    raise exception 'Aggregation produced no document for round %.', p_round_id;
  end if;

  return v;
end $$;


--
-- Name: FUNCTION survey_aggregate(p_round_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.survey_aggregate(p_round_id uuid) IS 'The stakeholder screening aggregation for one round, owner-scoped. THE ONLY PATH from a customer to materiality_survey_responses and materiality_survey_closing_comments — neither grants anon or authenticated anything and neither has a policy for either, so this function''s column scope and its suppression ARE the anonymity guarantee. Per sub-topic: the distribution at 1/2/3, top_box, median as an interval, modal_share, `polarised`, and the five counters of spec v9 §3.0.1, plus breakdowns by track, labour_group and stakeholder category under the round''s anonymity floor with complementary suppression. NO MEAN anywhere (§6.2.5). Returns verbatim free text under a SEPARATE, HIGHER floor: comments are never suppressed, but an individual''s group label is withheld below free_text_group_floor, while an organisational respondent''s label always shows because the customer invited them by name. Produces the disagreement register and the S1/S2 contrast, which are different things and never merged; does NOT produce a topic score or the divergence register.';


--
-- Name: survey_get(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.survey_get(p_token uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_respondent_id   uuid;
  v_round_id        uuid;
  v_name            text;
  v_version         int;
  v_routing         text;
  v_track           text;   -- unused in the projection, and that is the point (see 20260820)
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
      raise exception
        'Survey routing failed: stakeholder category % routes to %, but % of the round''s % paired '
        'questions matched (expected exactly half). Refusing to serve a short form — it would be '
        'indistinguishable from the 25 questions a not_asked respondent correctly receives.',
        v_category, v_routing, v_labour_routed, v_labour_total;
    end if;
  end if;

  select jsonb_build_object(
           'intro_variant', public.materiality_survey_intro_variant(v_routing),
           'round', jsonb_build_object(
                      'name',         rd.name,
                      'company_name', rd.company_name,
                      'deadline',     rd.deadline),
           'respondent', jsonb_build_object(
                      'display_name', v_name),
           'closing_comment', (
             select c.comment
               from public.materiality_survey_closing_comments c
              where c.respondent_id = v_respondent_id),
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id',      q.id,
                      'short_name',       q.short_name,
                      'question_framing', q.question_framing,
                      'wording',          q.wording,
                      -- ⚠️ THE PER-ROUND OVERRIDE FIRST, THE SHARED DEFAULT SECOND. q.context is
                      -- unwritten on every row today, so every round picks up the seeded string at
                      -- once — including rounds created before this migration. The moment a customer
                      -- writes their own, that round stops tracking the default and is thereafter
                      -- frozen against any re-seed. See the header for why context is the one
                      -- display field that is NOT snapshotted at generation, and what that costs.
                      'context',          coalesce(q.context, dsp.context),
                      'topic_label',      tl.label)
                    order by q.sort_order)
               from public.materiality_survey_questions q
               left join public.mr_esrs_subtopics s
                 on s.code = q.subtopic_code
                and s.standard_version = q.standard_version
               left join public.mr_esrs_topic_labels tl
                 on tl.topic_code = s.topic_code
                and tl.standard_version = s.standard_version
               -- LEFT, for the same reason as the other two: an entity-specific matter has no
               -- sub-topic and therefore no display row, and must still reach the respondent. Its
               -- context can only ever come from q.context, which is correct — nobody has authored
               -- a default for a matter that exists only in one customer's round.
               left join public.mr_esrs_subtopic_display dsp
                 on dsp.subtopic_code = q.subtopic_code
                and dsp.standard_version = q.standard_version
              where q.round_id = v_round_id
                and q.questionnaire_version = v_version
                and q.status = 'included'
                and public.materiality_survey_routes_to(
                      q.shared_with_subtopic_code, s.topic_code, v_routing)),
             '[]'::jsonb),
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

  if v is null then
    raise exception
      'Survey round % vanished between the token check and the projection.', v_round_id;
  end if;

  v_question_count := jsonb_array_length(v -> 'questions');
  if v_question_count = 0 then
    raise exception
      'This survey round has no questions to show you. Every question in the set is either '
      'deselected or excluded by routing, so there is nothing to answer — reporting that rather '
      'than presenting an empty form.';
  end if;

  update public.materiality_survey_respondents
     set status = 'in_progress'
   where id = v_respondent_id
     and status = 'invited';

  return v;
end $$;


--
-- Name: FUNCTION survey_get(p_token uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.survey_get(p_token uuid) IS 'What a survey respondent needs to fill the form in, and nothing else. Explicit whitelists — no to_jsonb of any table; see 20260820 for every column withheld, 20260822 for topic_label (never topic_code), 20260823 for intro_variant, 20260830 for the free-text keys. context is returned as coalesce(question.context, mr_esrs_subtopic_display.context): the shared default is joined LIVE rather than snapshotted at generation, so all 37 strings reach every round at once including existing ones, and a customer''s per-round edit overrides and thereafter freezes it. Applies the §3.0.1 labour routing (31 questions for s1/s2, 25 for not_asked) and refuses rather than serving a short form. Flips invited -> in_progress on first touch.';


--
-- Name: survey_respondent_progress(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.survey_respondent_progress(p_round_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_version int;
  v jsonb;
begin
  -- Owner-scoped. One message for "no such round" and "not yours", so a round id cannot be probed.
  select r.questionnaire_version
    into v_version
    from public.materiality_survey_rounds r
   where r.id = p_round_id
     and r.user_id = auth.uid();

  if not found then
    raise exception 'survey round not found' using errcode = 'no_data_found';
  end if;

  with q as (
    select q.id, q.shared_with_subtopic_code, s.topic_code
      from public.materiality_survey_questions q
      left join public.mr_esrs_subtopics s
        on s.code = q.subtopic_code
       and s.standard_version = q.standard_version
     where q.round_id = p_round_id
       and q.questionnaire_version = v_version
       and q.status = 'included'
  ),
  r as (
    select r.id, c.labour_routing
      from public.materiality_survey_respondents r
      join public.mr_stakeholder_categories c on c.code = r.stakeholder_category
     where r.round_id = p_round_id
  ),
  asked as (
    -- DERIVED, never counted. Same predicate the read path, the write path and the aggregation use.
    select r.id as respondent_id,
           count(*) filter (
             where public.materiality_survey_routes_to(
                     q.shared_with_subtopic_code, q.topic_code, r.labour_routing))::int as n_asked
      from r cross join q
     group by r.id
  ),
  ans as (
    select rs.respondent_id,
           count(*) filter (where rs.value is not null)::int as n_answered,
           count(*) filter (where rs.abstained)::int        as n_abstained,
           max(rs.updated_at)                                as last_activity
      from public.materiality_survey_responses rs
     where rs.round_id = p_round_id
       and rs.questionnaire_version = v_version
     group by rs.respondent_id
  )
  select coalesce(jsonb_object_agg(a.respondent_id::text, jsonb_build_object(
           'n_asked',      a.n_asked,
           'n_answered',   coalesce(x.n_answered, 0),
           'n_abstained',  coalesce(x.n_abstained, 0),
           -- n_skipped is the remainder, named rather than left to the caller's arithmetic — the
           -- same reason §3.0.1 names it: "saw it and did not engage" is a different fact from
           -- "saw it and could not say", and a caller subtracting on its own will merge them.
           'n_skipped',    a.n_asked - coalesce(x.n_answered, 0) - coalesce(x.n_abstained, 0),
           'last_activity', x.last_activity)), '{}'::jsonb)
    into v
    from asked a
    left join ans x on x.respondent_id = a.respondent_id;

  return coalesce(v, '{}'::jsonb);
end $$;


--
-- Name: FUNCTION survey_respondent_progress(p_round_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.survey_respondent_progress(p_round_id uuid) IS 'Per-respondent progress for one survey round, owner-scoped: n_asked (DERIVED from the frozen question set and the category routing, never counted from response rows), n_answered, n_abstained, n_skipped, last_activity. COUNTS ONLY — no value, no subtopic, no free text, nothing saying WHICH questions were answered. It refines a fact the customer already holds (respondent.status) from three buckets into a number; it hands over no answer. Exists because materiality_survey_responses is unreadable by authenticated by design, and the buyer''s progress screen cannot otherwise tell "opened and answered nothing" from "opened and answered thirty" — opposite facts for deciding whether to chase. Unlike survey_aggregate it counts EVERY respondent including those who never opened: the aggregate measures the company, this measures the mailing list.';


--
-- Name: survey_save_closing_comment(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.survey_save_closing_comment(p_token uuid, p_comment text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_respondent_id uuid;
  v_round_id      uuid;
  v_track         text;
  v_category      text;
  v_department    text;
  v_name          text;
  v_version       int;
  v_routing       text;
  v_text          text;
begin
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  v_text := nullif(btrim(p_comment), '');

  if v_text is not null and length(v_text) > 4000 then
    raise exception
      'This comment is % characters and the limit is 4000. Nothing was saved — shorten it and try '
      'again rather than reloading, or the text in the box will be lost.', length(v_text);
  end if;

  if v_text is null then
    -- Clearing deletes the row. An empty string in the emerging-topic catch is worse than no row:
    -- a reader expects text there, and a blank reads as a respondent who was asked and had nothing
    -- to say, which is a different finding from one who never filled the box in.
    delete from public.materiality_survey_closing_comments
     where respondent_id = v_respondent_id;
    return;
  end if;

  -- Attributes denormalised at write, as on materiality_survey_responses, so the aggregation never
  -- joins to materiality_survey_respondents — the row that holds the email.
  -- ⚠️ function_department is NOT copied. The table has no such column, on purpose (20260829).
  insert into public.materiality_survey_closing_comments (
    round_id, respondent_id, questionnaire_version, comment, track, stakeholder_category)
  values (
    v_round_id, v_respondent_id, v_version, v_text, v_track, v_category)
  on conflict (respondent_id) do update
    set comment              = excluded.comment,
        -- Refreshed so all of one respondent's records carry the same classification, the same
        -- reason survey_save_response refreshes them.
        track                = excluded.track,
        stakeholder_category = excluded.stakeholder_category,
        updated_at           = now();
end $$;


--
-- Name: FUNCTION survey_save_closing_comment(p_token uuid, p_comment text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.survey_save_closing_comment(p_token uuid, p_comment text) IS 'Saves, replaces or clears the respondent''s answer to the closing question — "Is there anything affecting people, the environment or the business that we have not asked about?" ⚠️ THE MODULE''S ENTIRE EMERGING-TOPIC CATCH (ESRS 2 IRO-1): survey scope is fixed at round creation with no second scoping moment, so this is the only route by which an out-of-scope matter reaches the preparer. Writes to materiality_survey_closing_comments, which no counter reads — the closing question has no value, no abstention and no sub-topic, and is not part of n_asked. Null or whitespace DELETES the row rather than storing a blank.';


--
-- Name: survey_save_free_text(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.survey_save_free_text(p_token uuid, p_question_id uuid, p_free_text text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
  v_text          text;
begin
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  -- Whitespace is not a comment; an emptied box is a clear.
  v_text := nullif(btrim(p_free_text), '');

  if v_text is not null and length(v_text) > 4000 then
    raise exception
      'This comment is % characters and the limit is 4000. Nothing was saved — shorten it and try '
      'again rather than reloading, or the text in the box will be lost.', length(v_text);
  end if;

  -- Same question lookup and same routing check as survey_save_response. A comment on a question the
  -- respondent was never shown is the same defect as an answer to one.
  select q.id, q.subtopic_code, q.shared_with_subtopic_code, s.topic_code
    into v_q
    from public.materiality_survey_questions q
    left join public.mr_esrs_subtopics s
      on s.code = q.subtopic_code
     and s.standard_version = q.standard_version
   where q.id = p_question_id
     and q.round_id = v_round_id
     and q.questionnaire_version = v_version
     and q.status = 'included';

  if not found then
    raise exception
      'Question % is not part of the current question set for this invitation. It belongs to '
      'another round, to an earlier questionnaire version, or it has been deselected. Reload the '
      'survey.', p_question_id;
  end if;

  if not public.materiality_survey_routes_to(
           v_q.shared_with_subtopic_code, v_q.topic_code, v_routing) then
    raise exception
      'Question % (%) was never shown to this respondent: stakeholder category % routes the labour '
      'sub-topics to %. Refusing to store a comment on a question that was not asked.',
      p_question_id, coalesce(v_q.subtopic_code, 'entity-specific'), v_category, v_routing;
  end if;

  -- ⚠️ UPDATE ONLY, NEVER INSERT. The XOR requires a value or an abstention on every response row,
  -- so there is no row shape for a comment with no answer. See the header.
  update public.materiality_survey_responses
     set free_text  = v_text,
         updated_at = now()
   where respondent_id = v_respondent_id
     and question_id   = p_question_id;

  if not found then
    raise exception
      'Choose an answer to this question before adding a comment. A comment is stored alongside an '
      'answer, and there is no answer recorded here yet — if you cannot score it, "Not enough '
      'visibility to assess" is an answer and a comment can go with it.';
  end if;
end $$;


--
-- Name: FUNCTION survey_save_free_text(p_token uuid, p_question_id uuid, p_free_text text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.survey_save_free_text(p_token uuid, p_question_id uuid, p_free_text text) IS 'Saves or clears the respondent''s comment on one question. A SEPARATE FUNCTION rather than a fifth parameter on survey_save_response: a defaulted p_free_text would silently null a saved note on every autosave that omitted it, and the two writes are independent answers to independent prompts. Null or whitespace clears. UPDATES an existing answer row and never inserts — the XOR on materiality_survey_responses requires a value or an abstention, so a comment cannot exist without one, and the refusal says so. Applies the same token gate, version check and §3.0.1 routing check as survey_save_response.';


--
-- Name: survey_save_response(uuid, uuid, smallint, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.survey_save_response(p_token uuid, p_question_id uuid, p_value smallint, p_abstained boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION survey_save_response(p_token uuid, p_question_id uuid, p_value smallint, p_abstained boolean); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.survey_save_response(p_token uuid, p_question_id uuid, p_value smallint, p_abstained boolean) IS 'Autosaves one screening answer, upserting on (respondent_id, question_id). Stamps questionnaire_version, standard_version, asked_subtopic_code and the respondent''s non-identifying attributes at write. REFUSES a question the respondent was never routed to (spec v8 §3.0.1) — that row would make n_answered exceed the derived n_asked and n_skipped go negative. Also refuses a stale questionnaire_version, a deselected question, and any value/abstained combination the §6.1 XOR forbids, each with a message naming which happened. Sets materiality_survey_rounds.frozen_at on the first response; this is the only code path that can observe it. Returns void: it projects nothing.';


--
-- Name: survey_submit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.survey_submit(p_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: FUNCTION survey_submit(p_token uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.survey_submit(p_token uuid) IS 'Closes an invitation, one-way. Writes resolved_subtopic_code and resolution_basis on every one of the respondent''s response rows, then sets status = completed. REFUSES if the respondent''s stakeholder category has changed since they answered, rather than stamping a resolution_basis that did not produce the answers. Partial submission is permitted — a submit with untouched questions is what makes n_skipped a real finding. There is NO unlock path: a second submit receives the same indistinguishable ''invalid token'' as a bad token.';


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
    sector_tier text,
    industry_code text,
    display_group text,
    country_iso2 character(2),
    CONSTRAINT campaign_suppliers_country_iso2_format CHECK (((country_iso2 IS NULL) OR (country_iso2 ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT campaign_suppliers_industry_code_is_industry CHECK (((industry_code IS NULL) OR (industry_code ~~ 'i%'::text))),
    CONSTRAINT campaign_suppliers_sector_tier_coherent CHECK (
CASE sector_tier
    WHEN 'industry'::text THEN ((industry_code IS NOT NULL) AND (display_group IS NULL))
    WHEN 'group'::text THEN ((display_group IS NOT NULL) AND (industry_code IS NULL))
    WHEN 'region'::text THEN ((industry_code IS NULL) AND (display_group IS NULL))
    ELSE ((industry_code IS NULL) AND (display_group IS NULL))
END),
    CONSTRAINT campaign_suppliers_sector_tier_valid CHECK (((sector_tier IS NULL) OR (sector_tier = ANY (ARRAY['industry'::text, 'group'::text, 'region'::text])))),
    CONSTRAINT campaign_suppliers_status_check CHECK ((status = ANY (ARRAY['invited'::text, 'in_progress'::text, 'completed'::text, 'expired'::text])))
);


--
-- Name: COLUMN campaign_suppliers.sector_tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_suppliers.sector_tier IS 'How precisely this supplier''s activity is known, and therefore which of the columns beside it is filled in: ''industry'' means a specific EXIOBASE industry is recorded in industry_code; ''group'' means only the broad heading is known, recorded in display_group; ''region'' means neither is known and only the country is. NULL means nobody has said anything about this supplier''s sector at all. NULL, and ''region'', both resolve to a regional average when a figure is estimated — a country-level factor rather than a sector-specific one.';


--
-- Name: COLUMN campaign_suppliers.industry_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_suppliers.industry_code IS 'The one EXIOBASE industry this supplier''s output belongs to, as an ixi code such as ''i01.a'' (Cultivation of paddy rice). Foreign key to exiobase_sectors.exio_code, restricted to industry codes. Set only when sector_tier is ''industry''. NULL means no specific industry is recorded, and an estimate falls back to a regional average.';


--
-- Name: COLUMN campaign_suppliers.display_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_suppliers.display_group IS 'The broad heading this supplier sits under when the exact industry is not known — one of the twenty ThemisIQ dropdown headings, such as ''Mining & quarrying''. Foreign key to sector_display_groups.heading. PRESENTATION HEADINGS, not a published classification: they are ours, not EXIOBASE''s, ISIC''s or NACE''s. Set only when sector_tier is ''group''. NULL means no group is recorded, and an estimate falls back to a regional average.';


--
-- Name: COLUMN campaign_suppliers.country_iso2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.campaign_suppliers.country_iso2 IS 'Where this supplier operates, as a two-letter uppercase ISO 3166-1 alpha-2 code such as ''DE'' or ''VN''. Independent of sector_tier: a supplier can have a country and no sector, or both. NULL means the country was never recorded, which leaves a regional average with no region to resolve to — such a supplier can only be estimated from a global default or not at all.';


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
-- Name: concierge_job_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concierge_job_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    source_doc_id text NOT NULL,
    location_id text,
    location_name text,
    file_path text NOT NULL,
    file_name text NOT NULL,
    document_type text NOT NULL,
    read_outcome text,
    read_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: concierge_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concierge_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    inventory_id uuid NOT NULL,
    entitlement_id uuid,
    tier text NOT NULL,
    round smallint DEFAULT 1 NOT NULL,
    location_count integer NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    status_note text,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    review_started_at timestamp with time zone,
    ready_at timestamp with time zone,
    reviewer uuid,
    CONSTRAINT concierge_jobs_location_count_check CHECK ((location_count >= 0)),
    CONSTRAINT concierge_jobs_round_check CHECK ((round >= 1)),
    CONSTRAINT concierge_jobs_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'in_review'::text, 'waiting_on_documents'::text, 'ready'::text]))),
    CONSTRAINT concierge_jobs_tier_check CHECK ((tier = ANY (ARRAY['concierge-basic'::text, 'concierge-standard'::text, 'concierge-enterprise'::text])))
);


--
-- Name: concierge_proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concierge_proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_document_id uuid NOT NULL,
    fuel_type text NOT NULL,
    raw_value numeric,
    raw_unit text,
    value numeric,
    unit text,
    conversion_note text,
    period_start date,
    period_end date,
    source_quote text,
    notes text,
    status text NOT NULL,
    extracted_by uuid,
    extracted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT concierge_proposals_status_check CHECK ((status = ANY (ARRAY['extracted'::text, 'needs_manual_review'::text])))
);


--
-- Name: country_regions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.country_regions (
    iso2 character(2) NOT NULL,
    country_name text NOT NULL,
    region_code text NOT NULL,
    basis text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT country_regions_basis_check CHECK ((basis = ANY (ARRAY['published'::text, 'manual-resolution'::text]))),
    CONSTRAINT country_regions_iso2_check CHECK ((iso2 ~ '^[A-Z]{2}$'::text))
);


--
-- Name: TABLE country_regions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.country_regions IS 'Which of EXIOBASE 3''s 49 regions a country''s spend is priced against. CLASSIFICATION ONLY - this table holds NO emission factors; it says which region to look a factor up under, not what the factor is. The assignment is published by Bjelle et al. (2020), DOI 10.6084/m9.figshare.11854137, Additional file 2, and is theirs rather than ours. Coverage is 212 of the 249 ISO 3166-1 alpha-2 codes; a country absent from this table has no region and must be treated as unpriceable rather than defaulted into a bucket.';


--
-- Name: COLUMN country_regions.iso2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.country_regions.iso2 IS 'The country, as a two-letter uppercase ISO 3166-1 alpha-2 code such as ''VN'' or ''DE''. One row per country. XK (Kosovo) is the single exception: ISO 3166-1 assigns it no code, XK is user-assigned and in wide de facto use, and it is recorded here so Kosovo is not simply absent.';


--
-- Name: COLUMN country_regions.country_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.country_regions.country_name IS 'The country''s name exactly as the published source spells it, kept verbatim so a reader can find the row in the original workbook. It is NOT the current or official name in every case: the names ''Swaziland'', ''Macedonia'' and ''Turkey'' all appear under their pre-rename spellings, because that is what the source says. Display a current name from elsewhere if you need one; do not correct this column.';


--
-- Name: COLUMN country_regions.region_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.country_regions.region_code IS 'The EXIOBASE 3 region this country''s spend is priced against - either its own two-letter code, for the 44 countries EXIOBASE resolves individually, or one of the five rest-of-world buckets: WA, WL, WE, WF, WM. A factor read through a bucket is an average across dozens of economies, not a national figure, and must be described that way wherever it is shown. ⚠️ WF IS BOTH THINGS AND THEY ARE UNRELATED: as a region_code it means RoW Africa, as an iso2 it means Wallis and Futuna. Never compare this column against iso2, and never default one to the other. WA, WL, WE and WM are not ISO codes at all, so WF is the only collision.';


--
-- Name: COLUMN country_regions.basis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.country_regions.basis IS 'How this row''s country code was arrived at. ''published'' means the source''s own name resolved directly to an ISO 3166-1 code with no judgement involved. ''manual-resolution'' means someone decided: a renamed country, an abbreviation, a spelling variant, or a territory ISO does not list. The reasons are recorded one per entry in COUNTRY_OVERRIDE in scripts/generate-country-regions.py. The region is the source''s in BOTH cases - this column is about the country code only, never about the region assignment.';


--
-- Name: COLUMN country_regions.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.country_regions.created_at IS 'When this row was seeded. Bookkeeping only; nothing reads it.';


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
-- Name: erasure_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.erasure_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_user_id uuid NOT NULL,
    requested_at timestamp with time zone,
    completed_at timestamp with time zone,
    performed_by text,
    table_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    storage_counts jsonb DEFAULT '{}'::jsonb NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE erasure_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.erasure_log IS 'Proof that an account erasure was performed, holding no customer data. subject_user_id is a uuid that deliberately no longer resolves once auth.users is deleted: it evidences the action without re-identifying the subject. Written by scripts/erase-account.mjs. RLS enabled with no policies; service_role only.';


--
-- Name: COLUMN erasure_log.subject_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erasure_log.subject_user_id IS 'The erased auth.users id. No FK: NO ACTION would block the erasure and CASCADE would delete this record at the moment it becomes the only proof.';


--
-- Name: COLUMN erasure_log.requested_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erasure_log.requested_at IS 'When the customer asked, from --requested-at. Null if not supplied.';


--
-- Name: COLUMN erasure_log.completed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erasure_log.completed_at IS 'Set after storage removal is verified, in a second statement — the database transaction commits before the Storage API calls are made, so this is null between the two.';


--
-- Name: COLUMN erasure_log.performed_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erasure_log.performed_by IS 'Operator name from --performed-by. A ThemisIQ person, never the subject.';


--
-- Name: COLUMN erasure_log.table_counts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erasure_log.table_counts IS 'Rows deleted per table, as {"public.ghg_entries": 12}. Counts only.';


--
-- Name: COLUMN erasure_log.storage_counts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erasure_log.storage_counts IS 'Objects removed per bucket, as {"source-documents": 4}. Counts only.';


--
-- Name: COLUMN erasure_log.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.erasure_log.notes IS 'Operational facts only — deferrals, resumes, privilege fallbacks. MUST NOT carry a name, an email, a company or any figure from the account.';


--
-- Name: exiobase_sectors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exiobase_sectors (
    exio_code text NOT NULL,
    factor_type text NOT NULL,
    exio_number integer NOT NULL,
    exio_name text NOT NULL,
    exio_label text NOT NULL,
    isic_code text,
    isic_name text,
    consumption_category text NOT NULL,
    display_group text,
    product_type text,
    CONSTRAINT exiobase_sectors_code_matches_type CHECK ((((factor_type = 'industry'::text) AND (exio_code ~~ 'i%'::text)) OR ((factor_type = 'product'::text) AND (exio_code ~~ 'p%'::text)))),
    CONSTRAINT exiobase_sectors_factor_type_check CHECK ((factor_type = ANY (ARRAY['industry'::text, 'product'::text]))),
    CONSTRAINT exiobase_sectors_industry_fields CHECK (((factor_type <> 'industry'::text) OR ((isic_code IS NOT NULL) AND (isic_name IS NOT NULL) AND (display_group IS NOT NULL) AND (product_type IS NULL)))),
    CONSTRAINT exiobase_sectors_product_fields CHECK (((factor_type <> 'product'::text) OR ((isic_code IS NULL) AND (isic_name IS NULL) AND (display_group IS NULL) AND (product_type IS NOT NULL))))
);


--
-- Name: TABLE exiobase_sectors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.exiobase_sectors IS 'EXIOBASE 3 v3.8.2 sector classification: 163 industries (ixi) and 200 products (pxp). Seeded from lib/emissionFactors/exiobaseSectors.json, generated by scripts/generate-exiobase-sectors.py from pymrio 0.6.3. DOI 10.5281/zenodo.5589597, CC BY-SA 4.0 - attribution and ShareAlike apply to anything published from it. CLASSIFICATION ONLY: this table holds NO emission factors. The isic_code values are ISIC Rev. 3.1 style SECTION labels (12 distinct across 163 industries, three of them pre-aggregated multi-section buckets), consistent with the v3.8.2 readme stating the database is on NACE Rev. 1.1. They are a grouping, not a crosswalk, and cannot resolve an ISIC code back to an EXIOBASE industry.';


--
-- Name: COLUMN exiobase_sectors.display_group; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.exiobase_sectors.display_group IS 'OUR heading for OUR dropdowns. Presentation only - see sector_display_groups. Null on products, which have no grouped UI today.';


--
-- Name: factor_editions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.factor_editions (
    id text NOT NULL,
    factor_source text NOT NULL,
    factor_data_year integer NOT NULL,
    price_vintage_year integer NOT NULL,
    fingerprint_factors_ixi text NOT NULL,
    fingerprint_factors_pxp text NOT NULL,
    fingerprint_sectors text NOT NULL,
    fingerprint_country_regions text NOT NULL,
    fingerprint_price_indices text NOT NULL,
    licence_factors text NOT NULL,
    licence_concordance text NOT NULL,
    licence_price_indices text NOT NULL,
    notes text,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    fingerprint_spend_conversions text,
    superseded_by text,
    CONSTRAINT factor_editions_not_self_superseding CHECK (((superseded_by IS NULL) OR (superseded_by <> id)))
);


--
-- Name: TABLE factor_editions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.factor_editions IS 'A named, self-consistent set of the reference files that price a spend-based figure. An edition is identified BY ITS FINGERPRINTS: if any of the five files changes, that is a new edition with a new id, never an edit to an existing row. The point is that a figure stored months ago can say which files produced it, and a verifier can check those files still hash to the same values. This table holds no factors and no multipliers - only the identity of the inputs.';


--
-- Name: COLUMN factor_editions.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.id IS 'Human-readable slug naming the edition, e.g. ''exiobase-3.8.2-2019-cpi2024'': the factor source, the year the factors describe, and the price vintage they are paired with. Chosen by a person so it can be quoted in a report; the fingerprints below are what actually establish identity.';


--
-- Name: COLUMN factor_editions.factor_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.factor_source IS 'The published dataset the emission factors come from, in the publisher''s own naming, e.g. ''EXIOBASE 3.8.2''. Note the publisher is inconsistent about this string: the archive''s own metadata.json reads "v3.81" while its folder is exio382_ntnu and the Zenodo record says 3.8.2. The Zenodo label is used. The discrepancy is the publisher''s and is reported, not resolved.';


--
-- Name: COLUMN factor_editions.factor_data_year; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.factor_data_year IS 'The year the emission factors DESCRIBE - the EXIOBASE IOT year, 2019. Not the year the file was downloaded and not the year a customer is reporting on.';


--
-- Name: COLUMN factor_editions.price_vintage_year; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.price_vintage_year IS 'The latest year of price data this edition carries, from priceIndices.json metadata.data_vintage. It is DERIVED there as the latest year with CPI for at least 80% of the 212 countries, so it moves when the World Bank publishes, not when we choose. A customer reporting on a later year is reading factors deflated to this year; see notes.';


--
-- Name: COLUMN factor_editions.fingerprint_factors_ixi; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.fingerprint_factors_ixi IS 'sha256 of lib/emissionFactors/exiobaseFactors2019ixi.json, over the FACTOR ROWS only. The file carries no fingerprint in its own metadata - the digest is pinned as ROWS_SHA256 in its .test.ts. Canonical form is a pipe-joined text rendering with the value as a 12-digit exponential, NOT JSON, because Python and JavaScript render a float zero differently and the file holds 1,108 zeros.';


--
-- Name: COLUMN factor_editions.fingerprint_factors_pxp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.fingerprint_factors_pxp IS 'sha256 of lib/emissionFactors/exiobaseFactors2019pxp.json, over the factor rows only. Same canonicalisation and same absence of a metadata fingerprint as the ixi file; 1,662 zeros here.';


--
-- Name: COLUMN factor_editions.fingerprint_sectors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.fingerprint_sectors IS 'sha256 of lib/emissionFactors/exiobaseSectors.json, over its groups, industries and products with metadata excluded. Also seeded in reference_data_fingerprints by 20260914 under the dataset key ''exiobase_sectors''; the two must agree, and a disagreement means one of them is stale.';


--
-- Name: COLUMN factor_editions.fingerprint_country_regions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.fingerprint_country_regions IS 'sha256 of lib/emissionFactors/countryRegions.json, over its mapping rows with metadata excluded. This file DOES record the digest itself, at metadata.fingerprint_sha256. Also seeded in reference_data_fingerprints by 20260915 under ''country_regions''.';


--
-- Name: COLUMN factor_editions.fingerprint_price_indices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.fingerprint_price_indices IS 'sha256 of lib/emissionFactors/priceIndices.json, over its regions with metadata excluded. The file records it at metadata.fingerprint_sha256. Not yet in reference_data_fingerprints.';


--
-- Name: COLUMN factor_editions.licence_factors; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.licence_factors IS 'The licence of the emission-factor and sector files, as those files record it. CC BY-SA 4.0: the ShareAlike term attaches obligations to anything we PUBLISH that adapts the data, and the attribution term requires crediting EXIOBASE wherever a derived figure is shown. This is an obligation on our output, not a note about the input.';


--
-- Name: COLUMN factor_editions.licence_concordance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.licence_concordance IS 'The licence of the country-to-region concordance, as countryRegions.json records it. CC BY 4.0 - attribution required, no ShareAlike. A DIFFERENT obligation from the factors'' CC BY-SA, on material that ends up in the same figure, which is why it has its own column.';


--
-- Name: COLUMN factor_editions.licence_price_indices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.licence_price_indices IS 'The licence of the price-index sources, as priceIndices.json records them. TWO PUBLISHERS, TWO LICENCES: the World Bank series under its Open Data default CC BY 4.0 plus the Bank''s mandatory dispute-resolution terms, and the Taiwan series under the Open Government Data License, Taiwan 1.0. Both require attribution; neither is share-alike and neither restricts commercial use. The full text of each, including the DGBAS exclusions - which cover copyright only and grant no patent, trademark or logo rights, and do not permit representing DGBAS as endorsing a derivative - is in that file''s metadata.sources rather than duplicated here.';


--
-- Name: COLUMN factor_editions.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.notes IS 'Free text recording what a reader of a figure priced by this edition needs to know and cannot work out from the columns - principally the ways the edition is known to be approximate.';


--
-- Name: COLUMN factor_editions.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.is_active IS 'Whether this edition is the one new calculations should use. At most one row may be true at a time, enforced by factor_editions_one_active below. A seeded edition starts FALSE: activating it is a deliberate UPDATE someone writes after checking the fingerprints still match the files.';


--
-- Name: COLUMN factor_editions.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.created_at IS 'When this row was seeded. Bookkeeping only; nothing reads it. Edition ordering comes from factor_data_year and price_vintage_year, which are facts about the data rather than about us.';


--
-- Name: COLUMN factor_editions.fingerprint_spend_conversions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.fingerprint_spend_conversions IS 'sha256 of the DERIVED scalars artefact, lib/emissionFactors/spendConversions.json. ⚠️ THIS IS NOT ONE OF THE FIVE INPUT FINGERPRINTS AND IT IS THE ONLY PLACE A DOWNSTREAM ARITHMETIC CORRECTION IS VISIBLE. The other five identify the published artefacts an edition reads FROM - factors, sectors, concordance, price indices. This one identifies what was COMPUTED from them. Those are different failure surfaces: an edition can carry five unchanged input digests and still produce different numbers, because the fault was in the derivation rather than in the data. That is exactly what happened between the -fxnorm and -spendconv editions, whose five input fingerprints are identical to one another and whose scalars are reciprocals. Without this column those two rows are distinguishable only by their id and their notes. NULLABLE, because the two earlier editions have no valid value: the artefact one of them described held inverted scalars and has been deleted, and the other predates the artefact entirely. NULL here means "no derived artefact is validly identified for this edition", never "not applicable" and never "unchanged from the previous edition".';


--
-- Name: COLUMN factor_editions.superseded_by; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.factor_editions.superseded_by IS 'The edition that replaces this one, or NULL if this edition is current. Self-referencing foreign key with ON UPDATE CASCADE, so renaming an edition carries the pointers to it. ⚠️ A SUPERSEDED EDITION MUST NEVER PRICE A FIGURE. Once this column is non-null the row is a RECORD ONLY: it exists so that the history of what was computed, and when it was corrected, survives - and so that a figure stored under it long ago can still be traced. It is not a fallback, not a legacy option and not something to read from when the current edition lacks a row. A calculation that finds superseded_by non-null on the edition it was about to use must stop, not continue. Superseding is also why a wrong edition is never edited in place: correcting a row would destroy the record this column exists to keep. The chain is append-only - each edition points forward to its replacement, and the current edition is the one with NULL here.';


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
-- Name: materiality_assessment_survey_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_assessment_survey_rounds (
    assessment_id uuid NOT NULL,
    round_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    linked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE materiality_assessment_survey_rounds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_assessment_survey_rounds IS 'Which stakeholder survey rounds informed which materiality assessment. MANY-TO-ONE by design — employees in March, suppliers in June, communities in September, assessed in October — and many-to-many by construction, since one round may legitimately inform two assessments. A round may be linked only while its status is ''closed'' (the link is the moment of consumption, and an assessment reading a moving survey is where this module''s freeze-at-write discipline would break), and only when its standard_version matches the assessment''s. Ownership is enforced by composite foreign keys on (id, user_id) against BOTH parents, not by the trigger and not by RLS alone.';


--
-- Name: COLUMN materiality_assessment_survey_rounds.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_assessment_survey_rounds.user_id IS 'The owner of BOTH parents, enforced by the two composite foreign keys rather than asserted. Also the RLS predicate. ⚠️ materiality_assessments additionally carries a dormant organization_id — a live FK that nothing writes and no policy reads — and the survey tables have no equivalent; if org-scoping is ever switched on, this column is one of the places two ownership models would meet. See the migration header.';


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
    reporting_period_start date,
    reporting_period_end date,
    CONSTRAINT materiality_assessments_reporting_period_both_or_neither CHECK (((reporting_period_start IS NULL) = (reporting_period_end IS NULL))),
    CONSTRAINT materiality_assessments_reporting_period_order CHECK (((reporting_period_start IS NULL) OR (reporting_period_end > reporting_period_start))),
    CONSTRAINT materiality_assessments_standard_version_check CHECK ((standard_version = ANY (ARRAY['esrs_2023'::text, 'esrs_2023_reliefs'::text, 'esrs_2026'::text])))
);


--
-- Name: TABLE materiality_assessments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_assessments IS 'One double-materiality assessment. Tenancy is user_id = auth.uid() - organization_id exists and is indexed but NO policy reads it. Several assessments may exist for one company and one period: nothing constrains that, and until reporting_period_start/end are populated nothing could. ⚠️ ESRS 2 IRO-1 para 35(e) - "when the undertaking last updated its materiality assessment" - SHOULD BE ANSWERED FROM max(determined_at) ACROSS SUBMITTED DETERMINATIONS, NOT FROM updated_at. Two reasons. First, updated_at advances on ANY update to this row, including one that changes a company name or a scenario code and concludes nothing, so it overstates - it is a row-touched timestamp, not an assessment-updated one. Second, it is only trustworthy at all for rows updated after migration 20260846 attached its trigger; before that it was set once at insert by DEFAULT now() and never advanced, so historical values are creation timestamps wearing the wrong name, and were deliberately not backfilled because the true value was never recorded. determined_at is written when a determination is actually concluded, which is the event the paragraph is asking about.';


--
-- Name: COLUMN materiality_assessments.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_assessments.standard_version IS 'Which ESRS version this assessment was prepared under. NULL means NOT STATED — a real state, never an assumed version (Art. 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state it, and an assumed value would be a false statement about which law was applied). Historical rows were backfilled to esrs_2023 when this column was created; that backfill is one-shot and must never be repeated. Mirrors model_version: also present as workings.input.standardVersion.';


--
-- Name: COLUMN materiality_assessments.reporting_period_start; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_assessments.reporting_period_start IS 'First day of the period this assessment covers. NULL = NOT STATED, a real and common state - not a default, not an error, and never inferred. Report surfaces print "Not stated" when this is null (see lib/pdf/layout.ts and app/dashboard/stakeholder/[id]/report/page.tsx) and MUST NOT substitute created_at, updated_at, or a survey round date: those answer when the record was made or when people answered, not which period was assessed. Set together with reporting_period_end or not at all - materiality_assessments_reporting_period_both_or_neither.';


--
-- Name: COLUMN materiality_assessments.reporting_period_end; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_assessments.reporting_period_end IS 'Last day of the period this assessment covers, strictly after reporting_period_start. NULL = NOT STATED - see reporting_period_start, which carries the full note. Report surfaces print "Not stated" when null and must never substitute created_at.';


--
-- Name: materiality_custom_iros; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_custom_iros (
    assessment_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    subtopic_code text NOT NULL,
    standard_version text NOT NULL,
    iro_key text NOT NULL,
    name text NOT NULL,
    description text,
    created_by_assignment_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_custom_iros_iro_key_check CHECK (((iro_key <> ''::text) AND (length(iro_key) <= 64) AND (iro_key ~ '^[a-z0-9][a-z0-9-]*$'::text))),
    CONSTRAINT materiality_custom_iros_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 200)))
);


--
-- Name: TABLE materiality_custom_iros; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_custom_iros IS 'An IRO the company named specifically, sitting UNDER an ESRS sub-topic — never taxonomy-free. Holds a name and a parent and NOTHING ELSE: no direction, nature, dimension or status. That absence is load-bearing, not an oversight — it is what lets every scope enumeration read this table without breaking 20260844:7''s rule that scope is enumerated and never inferred from the rows that exist. Adding any severity column here would break that rule. The determinations themselves live in materiality_impact_determinations with iro_key set to this row''s key; the sub-topic taken as a whole is iro_key = '''' and has no row here.';


--
-- Name: materiality_finalisation_requirements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_finalisation_requirements (
    assessment_id uuid NOT NULL,
    version integer NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    dr_code text NOT NULL,
    topic_code text NOT NULL,
    title text NOT NULL,
    datapoints text,
    sort_order smallint NOT NULL
);


--
-- Name: TABLE materiality_finalisation_requirements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_finalisation_requirements IS 'The ESRS disclosure requirements as they stood when a finalisation was taken — COPIED, not referenced. mr_esrs_disclosure_requirements is reference data that changes (20260845 rewrote E1-11''s title on 21 Aug 2026), and an FK to it would prove a code existed while preserving neither title nor datapoints, which are what actually changed. There is deliberately no FK to it for a second reason: it would make a historical record''s survival depend on re-seedable data, and both delete behaviours are wrong for an archive. No CHECK constraints, per materiality_impact_assignee_determinations:266-269 — this is a copy of rows the source already validated.';


--
-- Name: COLUMN materiality_finalisation_requirements.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_finalisation_requirements.title IS 'The requirement heading as it stood at finalisation. Frozen because the source''s wording changes; this is what the report prints.';


--
-- Name: COLUMN materiality_finalisation_requirements.datapoints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_finalisation_requirements.datapoints IS 'ThemisIQ''s summary of what the requirement obliges a preparer to collect, as it stood at finalisation. NULL = not yet written, which is NOT "nothing to collect". Every esrs_2026 row is null at the time of writing. NULL MUST RENDER AS AN EXPLICIT ABSENCE — an empty cell under a "data to collect" heading reads as a finding this column cannot support.';


--
-- Name: COLUMN materiality_finalisation_requirements.sort_order; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_finalisation_requirements.sort_order IS 'The source''s per-topic ordering, copied, so a re-seed cannot reorder a printed roadmap.';


--
-- Name: materiality_finalisations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_finalisations (
    assessment_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    version integer NOT NULL,
    finalised_at timestamp with time zone DEFAULT now() NOT NULL,
    standard_version text
);


--
-- Name: TABLE materiality_finalisations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_finalisations IS 'An explicit, versioned finish line for an impact materiality assessment, and the parent of the disclosure requirements frozen at that moment. Exists because nothing else marks an assessment final: the lead submits what they hold and each contributor submits theirs, so "submitted" is a property of rows, and a FULLY DELEGATED assessment can be complete with materiality_lead_submit never callable — it raises when the lead holds nothing. Version starts at 1 per assessment and increments; it is allocated by materiality_finalisation_allocate_version under a per-assessment advisory lock, with the primary key as the guarantee that does not depend on the lock. Finalising again is a new version, never an edit — the board report prints the version and its date and regenerates from the latest.';


--
-- Name: COLUMN materiality_finalisations.version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_finalisations.version IS 'Allocated by the database, refused if supplied. 1-based, per assessment. See the trigger for why an advisory lock AND the primary key.';


--
-- Name: COLUMN materiality_finalisations.finalised_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_finalisations.finalised_at IS 'When this version was taken. Printed on the board report cover beside the version, so a reader can tell two copies of the paper apart.';


--
-- Name: COLUMN materiality_finalisations.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_finalisations.standard_version IS 'The ESRS version stated on the assessment at this moment, copied. NULL is a real state (Art. 2(2) permits an unstated version) and a finalisation with a null version copies NO requirement rows — there is deliberately no fallback to esrs_2023, because an undisclosed fallback would freeze one standard''s requirements under another standard''s name. No CHECK: materiality_assessments already validates this column and a second copy of the rule would be free to drift.';


--
-- Name: materiality_impact_assignee_determinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_impact_assignee_determinations (
    assessment_id uuid NOT NULL,
    subtopic_code text NOT NULL,
    direction text NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    assignment_id uuid NOT NULL,
    nature text,
    scale smallint,
    scope smallint,
    irremediability smallint,
    likelihood smallint,
    value_chain_position text[],
    time_horizon text,
    rationale text,
    determined_at timestamp with time zone,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    abstained_dimensions text[],
    axis text DEFAULT 'impact'::text NOT NULL,
    iro_key text DEFAULT ''::text NOT NULL,
    CONSTRAINT materiality_impact_assignee_determinations_abst_domain CHECK (((abstained_dimensions IS NULL) OR (abstained_dimensions <@ ARRAY['scale'::text, 'scope'::text, 'irremediability'::text, 'likelihood'::text]))),
    CONSTRAINT materiality_impact_assignee_determinations_axis_check CHECK ((axis = ANY (ARRAY['impact'::text, 'financial'::text]))),
    CONSTRAINT materiality_impact_assignee_determinations_iro_key_shape CHECK (((iro_key = ''::text) OR ((length(iro_key) <= 64) AND (iro_key ~ '^[a-z0-9][a-z0-9-]*$'::text))))
);


--
-- Name: TABLE materiality_impact_assignee_determinations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_impact_assignee_determinations IS 'Pre-override snapshot of a contributor''s determination, on either axis and at either granularity. Same misnomer as its parent and for the same reason. Its primary key and its parent foreign key gained axis in 20260854 and iro_key in 20260855; they must stay in step with the parent primary key, which is what forced this table into both migrations.';


--
-- Name: COLUMN materiality_impact_assignee_determinations.abstained_dimensions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_assignee_determinations.abstained_dimensions IS 'The contributor''s abstentions, frozen with the rest of their determination at the first override. Nullable, unlike the parent: rows written before 20260841 have no record either way, and defaulting them to ''{}'' would assert that the expert answered every dimension when nothing knows whether they did.';


--
-- Name: materiality_impact_assignment_subtopics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_impact_assignment_subtopics (
    assignment_id uuid NOT NULL,
    assessment_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    subtopic_code text NOT NULL,
    standard_version text NOT NULL,
    short_name text,
    source_round_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE materiality_impact_assignment_subtopics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_impact_assignment_subtopics IS 'Which sub-topics an assignment covers, snapshotted from the round''s included questions at creation rather than joined live. unique (assessment_id, subtopic_code) is what makes ONE ASSIGNEE PER SUB-TOPIC structural instead of a rule in the assign screen. source_round_id is per row so scope drawn from several linked rounds needs no schema change.';


--
-- Name: materiality_impact_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_impact_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    token uuid DEFAULT gen_random_uuid() NOT NULL,
    contributor_name text,
    contributor_email text,
    contributor_role text,
    status text DEFAULT 'added'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '90 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    invited_at timestamp with time zone,
    reminder_sent_at timestamp with time zone,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_impact_assignments_added_has_no_invite CHECK (((status <> 'added'::text) OR (invited_at IS NULL))),
    CONSTRAINT materiality_impact_assignments_status_check CHECK ((status = ANY (ARRAY['added'::text, 'invited'::text, 'in_progress'::text, 'submitted'::text, 'revoked'::text, 'expired'::text])))
);


--
-- Name: TABLE materiality_impact_assignments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_impact_assignments IS 'One named colleague asked to make the ESRS 1 severity determination for a set of sub-topics — HR for S1, facilities for E2. Token-based, no account creation, so this row names an INVITATION and not a verified person; the report must say "the holder of the assignment sent to [name, email]". Lifecycle is cbam_verifier_access''s (expires_at, revoked_at, status gate), forked a second time via materiality_survey_respondents.';


--
-- Name: COLUMN materiality_impact_assignments.contributor_email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_assignments.contributor_email IS 'Needed to send the invitation. Follows materiality_survey_respondents.invite_email: it lives here and is never denormalised onto a determination row.';


--
-- Name: COLUMN materiality_impact_assignments.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_assignments.status IS '''added'' is the truthful initial state: the colleague is on the list and has not been emailed. Only a route that has confirmed a send may move a row to ''invited'', and it stamps invited_at in the same UPDATE — materiality_impact_assignments_added_has_no_invite holds the two together. ''in_progress'' is still written by nothing (20260840:581 is a hand-run test, not a code path).';


--
-- Name: COLUMN materiality_impact_assignments.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_assignments.expires_at IS 'Copied from cbam_verifier_access via materiality_survey_respondents, including the 90-day default.';


--
-- Name: COLUMN materiality_impact_assignments.invited_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_assignments.invited_at IS 'When the invitation was actually emailed, or NULL if it has not been. NOT a row-creation timestamp — created_at is that. A DEFAULT now() here is the campaign_suppliers defect recorded in app/api/survey-invite/route.ts''s header; this table was its third occurrence and 20260852 removed it. Only app/api/impact-invite/route.ts writes this, and only after Resend has confirmed the send.';


--
-- Name: materiality_impact_determinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_impact_determinations (
    assessment_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    subtopic_code text NOT NULL,
    standard_version text NOT NULL,
    direction text NOT NULL,
    nature text,
    scale smallint,
    scope smallint,
    irremediability smallint,
    likelihood smallint,
    value_chain_position text[] DEFAULT '{}'::text[] NOT NULL,
    time_horizon text,
    evidence_in_view boolean NOT NULL,
    assignment_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    rationale text,
    determined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    override_reason text,
    overridden_at timestamp with time zone,
    abstained_dimensions text[] DEFAULT '{}'::text[] NOT NULL,
    axis text DEFAULT 'impact'::text NOT NULL,
    iro_key text DEFAULT ''::text NOT NULL,
    CONSTRAINT materiality_impact_determinations_abstention_domain CHECK ((abstained_dimensions <@ ARRAY['scale'::text, 'scope'::text, 'irremediability'::text, 'likelihood'::text])),
    CONSTRAINT materiality_impact_determinations_abstention_excludes_value CHECK (((('scale'::text <> ALL (abstained_dimensions)) OR (scale IS NULL)) AND (('scope'::text <> ALL (abstained_dimensions)) OR (scope IS NULL)) AND (('irremediability'::text <> ALL (abstained_dimensions)) OR (irremediability IS NULL)) AND (('likelihood'::text <> ALL (abstained_dimensions)) OR (likelihood IS NULL)))),
    CONSTRAINT materiality_impact_determinations_abstention_respects_p41 CHECK ((((direction = 'negative'::text) OR ('irremediability'::text <> ALL (abstained_dimensions))) AND ((COALESCE(nature, ''::text) = 'potential'::text) OR ('likelihood'::text <> ALL (abstained_dimensions))))),
    CONSTRAINT materiality_impact_determinations_actual_takes_no_likelihood CHECK (((COALESCE(nature, ''::text) = 'potential'::text) OR (likelihood IS NULL))),
    CONSTRAINT materiality_impact_determinations_axis_check CHECK ((axis = ANY (ARRAY['impact'::text, 'financial'::text]))),
    CONSTRAINT materiality_impact_determinations_delegated_saw_no_evidence CHECK (((assignment_id IS NULL) OR (evidence_in_view = false))),
    CONSTRAINT materiality_impact_determinations_direction_check CHECK ((direction = ANY (ARRAY['negative'::text, 'positive'::text]))),
    CONSTRAINT materiality_impact_determinations_iro_key_shape CHECK (((iro_key = ''::text) OR ((length(iro_key) <= 64) AND (iro_key ~ '^[a-z0-9][a-z0-9-]*$'::text)))),
    CONSTRAINT materiality_impact_determinations_irremediability_check CHECK (((irremediability >= 1) AND (irremediability <= 4))),
    CONSTRAINT materiality_impact_determinations_likelihood_check CHECK (((likelihood >= 1) AND (likelihood <= 4))),
    CONSTRAINT materiality_impact_determinations_nature_check CHECK ((nature = ANY (ARRAY['actual'::text, 'potential'::text]))),
    CONSTRAINT materiality_impact_determinations_override_needs_assignment CHECK (((overridden_at IS NULL) OR (assignment_id IS NOT NULL))),
    CONSTRAINT materiality_impact_determinations_override_needs_reason CHECK ((((overridden_at IS NULL) AND (override_reason IS NULL)) OR ((overridden_at IS NOT NULL) AND (override_reason IS NOT NULL) AND (length(btrim(override_reason)) > 0)))),
    CONSTRAINT materiality_impact_determinations_override_only_when_submitted CHECK (((overridden_at IS NULL) OR (status = 'submitted'::text))),
    CONSTRAINT materiality_impact_determinations_positive_no_irremediability CHECK (((direction = 'negative'::text) OR (irremediability IS NULL))),
    CONSTRAINT materiality_impact_determinations_scale_check CHECK (((scale >= 1) AND (scale <= 4))),
    CONSTRAINT materiality_impact_determinations_scope_check CHECK (((scope >= 1) AND (scope <= 4))),
    CONSTRAINT materiality_impact_determinations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text]))),
    CONSTRAINT materiality_impact_determinations_submitted_is_complete CHECK (((status = 'draft'::text) OR ((nature IS NOT NULL) AND (determined_at IS NOT NULL)))),
    CONSTRAINT materiality_impact_determinations_time_horizon_check CHECK ((time_horizon = ANY (ARRAY['short'::text, 'medium'::text, 'long'::text]))),
    CONSTRAINT materiality_impact_determinations_value_chain_position_check CHECK ((value_chain_position <@ ARRAY['own_operations'::text, 'upstream'::text, 'downstream'::text]))
);


--
-- Name: TABLE materiality_impact_determinations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_impact_determinations IS 'Recorded determinations on BOTH materiality axes and at TWO GRANULARITIES, despite the name. The table was created (20260838) when only the impact axis and only the sub-topic existed, and was named after both; 20260854 added axis and 20260855 added iro_key rather than renaming, because a rename would break every foreign key, RPC, policy and client read for a cosmetic gain. READ THE NAME AS HISTORICAL. The primary key is (assessment_id, subtopic_code, axis, direction, iro_key). iro_key = '''' is the sub-topic taken as a whole and is what every pre-20260855 row holds; a non-empty value names a row in materiality_custom_iros. A QUERY THAT DOES NOT FILTER ON iro_key RETURNS BOTH GRANULARITIES AND WILL DOUBLE A COUNT — read materiality_impact_subtopic_determinations instead, which pins the predicate.';


--
-- Name: COLUMN materiality_impact_determinations.value_chain_position; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.value_chain_position IS 'Where the IMPACT occurs (spec v9 §5.2, multi-select) — NOT where a person sits. Deliberately a different cardinality from materiality_survey_respondents.value_chain_position, which is a single value because a supplier contact cannot be upstream and downstream at once. One impact routinely spans own operations and upstream. Do not unify them.';


--
-- Name: COLUMN materiality_impact_determinations.evidence_in_view; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.evidence_in_view IS 'Whether the survey evidence was in view when this determination was made. Contributors do not see it; only the lead does. Constrained, not trusted: a delegated row (assignment_id not null) cannot be true. Without this the report would imply an evidence-informed judgement that for delegated sub-topics did not happen, which is the divergence register quietly telling an auditor something false.';


--
-- Name: COLUMN materiality_impact_determinations.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.status IS 'draft: a null dimension means UNTOUCHED. submitted: a null dimension means ABSTAINED — spec v9 §6.1''s "not enough visibility", a recorded answer and never a zero. One null meaning two different things is the defect 20260837 fixed one layer up in survey_aggregate''s unknown_reason; this column is what stops it recurring here.';


--
-- Name: COLUMN materiality_impact_determinations.override_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.override_reason IS 'REQUIRED when the lead supersedes a contributor''s submitted determination, and forbidden otherwise. The asymmetry is the anti-manipulation mechanism: accepting the subject-matter expert''s judgement is frictionless, departing from it costs a written defence that appears in the report. Deliberately the same shape as materiality_survey_questions_exclusion_reason_required.';


--
-- Name: COLUMN materiality_impact_determinations.overridden_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.overridden_at IS 'Set by materiality_impact_determination_lock(), never by a client — the trigger assigns now() on a real override and restores the prior value on every other path, so it cannot be backdated or set without a corresponding change.';


--
-- Name: COLUMN materiality_impact_determinations.abstained_dimensions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.abstained_dimensions IS 'Which dimensions the determiner recorded as "not enough visibility to assess" — spec §6.1''s fourth answer, a RECORDED ANSWER and never a zero and never a low. Membership is the record. Permitted values are scale / scope / irremediability / likelihood, enforced by _abstention_domain because a typo would otherwise store cleanly and record nothing. A named dimension must be null (_abstention_excludes_value), so an abstention can never also carry a score. ⚠️ THIS COLUMN EXISTS BECAUSE `status` ALONE WAS NOT ENOUGH: on a draft, a null dimension was indistinguishable from one nobody had reached, so a contributor''s saved abstention came back unselected. Third instance of the null-means-two-things defect in this module — see 20260837 and 20260838.';


--
-- Name: COLUMN materiality_impact_determinations.axis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.axis IS 'Which materiality axis this determination is on. With direction, gives the four IRO kinds: impact+negative = an adverse impact, impact+positive = a positive impact, financial+negative = a risk, financial+positive = an opportunity. Those four NAMES are customer-facing display and live in TypeScript, not here — same split 20260838 argues for severity. Defaults to ''impact'': every row written before 20260854 is an impact determination, there having been no other kind, and every existing writer omits this column and so continues to say ''impact'' by omission.';


--
-- Name: COLUMN materiality_impact_determinations.iro_key; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_impact_determinations.iro_key IS 'Which IRO under this sub-topic the row determines. '''' (the empty string) is the sub-topic taken as a whole and is the default, so every writer that does not name this column keeps writing exactly what it wrote before. A non-empty value names a row in materiality_custom_iros for the same assessment, sub-topic and standard version — enforced by materiality_impact_determination_iro_exists(), which is a trigger rather than a foreign key because the requirement is CONDITIONAL on the value and no FK can express that. NOT NULL and never nullable: a primary-key column cannot be null, and the alternatives that would have allowed it all cost either the snapshot table''s foreign key or its MATCH SIMPLE integrity.';


--
-- Name: materiality_impact_subtopic_determinations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.materiality_impact_subtopic_determinations WITH (security_invoker='true') AS
 SELECT assessment_id,
    user_id,
    subtopic_code,
    standard_version,
    axis,
    direction,
    nature,
    scale,
    scope,
    irremediability,
    likelihood,
    value_chain_position,
    time_horizon,
    evidence_in_view,
    assignment_id,
    status,
    rationale,
    determined_at,
    created_at
   FROM public.materiality_impact_determinations d
  WHERE ((iro_key = ''::text) AND (axis = 'impact'::text));


--
-- Name: VIEW materiality_impact_subtopic_determinations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.materiality_impact_subtopic_determinations IS 'Every determination of a sub-topic taken as a whole, ON THE IMPACT AXIS — materiality_impact_determinations with iro_key = '''' AND axis = ''impact'' pinned. ⚠️ "impact" IN THIS NAME NOW CARRIES BOTH SENSES, AND COULD NOT BE INFERRED BEFORE 20260857: the parent table shares the prefix as a HISTORICAL family name while holding both axes (20260854 §5c — "READ THE NAME AS HISTORICAL"), and this view additionally FILTERS to axis = ''impact''. A financial-axis consumer must not use it; it must not be widened to serve one either, because every existing reader depends on the pin. EXISTS SO THE PREDICATES CANNOT BE FORGOTTEN: a bare select on the table returns custom-IRO rows alongside sub-topic rows and doubles a count, silently, which is the mr_jurisdictions.active failure class — and the axis predicate was omitted three times in this repo (20260854, 20260855, fixed in 20260856 §3) for the same reason. security_invoker = true is load-bearing — without it the view runs as its owner and returns every customer''s rows to any authenticated caller. iro_key is deliberately NOT among the columns: a consumer that needs it is not a consumer of this view. NO FINANCIAL SIBLING EXISTS BY DECISION, not by omission — build one with its first consumer, where its column list can be enumerated from something real.';


--
-- Name: materiality_iro1; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_iro1 (
    assessment_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    value_chain_approach text,
    value_chain_approach_declined boolean,
    heightened_risk_areas text,
    heightened_risk_areas_declined boolean,
    remediation_consideration text,
    remediation_consideration_declined boolean,
    due_diligence_link text,
    due_diligence_link_declined boolean,
    external_experts text,
    external_experts_declined boolean,
    supersedes_assessment_id uuid,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_iro1_due_diligence_link_not_both CHECK (((due_diligence_link IS NULL) OR (due_diligence_link_declined IS NOT TRUE))),
    CONSTRAINT materiality_iro1_external_experts_not_both CHECK (((external_experts IS NULL) OR (external_experts_declined IS NOT TRUE))),
    CONSTRAINT materiality_iro1_heightened_risk_areas_not_both CHECK (((heightened_risk_areas IS NULL) OR (heightened_risk_areas_declined IS NOT TRUE))),
    CONSTRAINT materiality_iro1_remediation_consideration_not_both CHECK (((remediation_consideration IS NULL) OR (remediation_consideration_declined IS NOT TRUE))),
    CONSTRAINT materiality_iro1_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text]))),
    CONSTRAINT materiality_iro1_submitted_is_complete CHECK (((status = 'draft'::text) OR (((value_chain_approach IS NOT NULL) OR (value_chain_approach_declined IS TRUE)) AND ((heightened_risk_areas IS NOT NULL) OR (heightened_risk_areas_declined IS TRUE)) AND ((remediation_consideration IS NOT NULL) OR (remediation_consideration_declined IS TRUE)) AND ((due_diligence_link IS NOT NULL) OR (due_diligence_link_declined IS TRUE)) AND ((external_experts IS NOT NULL) OR (external_experts_declined IS TRUE))))),
    CONSTRAINT materiality_iro1_value_chain_approach_not_both CHECK (((value_chain_approach IS NULL) OR (value_chain_approach_declined IS NOT TRUE)))
);


--
-- Name: TABLE materiality_iro1; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_iro1 IS 'ESRS 2 IRO-1 paragraph 35 disclosure preparation — CAPTURE ONLY. Holds the five things ¶35 requires that materiality_assessments does not record and cannot derive: the value-chain process (a), where negative-impact risk concentrates and how remediation entered the judgement (b), whether due diligence and external experts informed it (c), and a pointer to the assessment this cycle supersedes (d). ¶35(e) — when the assessment was last updated — is NOT here: it is answered from materiality_assessments (see the note on that table added by 20260846). THE PROSE SURFACE THAT RENDERS THIS IS A SEPARATE PIECE OF WORK; nothing in this table decides how it reads. Every field is DECLARE-OR-DECLINE: a null text with declined=true is a recorded refusal, a null text with declined null is a question not yet put, and the two are different disclosures.';


--
-- Name: COLUMN materiality_iro1.value_chain_approach; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.value_chain_approach IS '¶35(a). How the materiality assessment process ran across own operations and the upstream and downstream value chain. Prose, the preparer''s own.';


--
-- Name: COLUMN materiality_iro1.value_chain_approach_declined; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.value_chain_approach_declined IS 'TRUE when the preparer was asked and chose not to describe the ¶35(a) process. Distinct from null, which means the question has not been put. Forbidden alongside a non-null value_chain_approach.';


--
-- Name: COLUMN materiality_iro1.heightened_risk_areas; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.heightened_risk_areas IS '¶35(b), first limb. Activities, business relationships or geographies where the risk of negative impact is concentrated.';


--
-- Name: COLUMN materiality_iro1.heightened_risk_areas_declined; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.heightened_risk_areas_declined IS 'TRUE when asked and declined for the ¶35(b) risk-concentration limb. Distinct from null.';


--
-- Name: COLUMN materiality_iro1.remediation_consideration; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.remediation_consideration IS '¶35(b), second limb. How prevention, mitigation and remediation entered the materiality judgement — as distinct from what the undertaking intends to do about a topic, which is not an IRO-1 question.';


--
-- Name: COLUMN materiality_iro1.remediation_consideration_declined; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.remediation_consideration_declined IS 'TRUE when asked and declined for the ¶35(b) remediation limb. Distinct from null.';


--
-- Name: COLUMN materiality_iro1.due_diligence_link; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.due_diligence_link IS '¶35(c), first limb. Whether the assessment was informed by a sustainability due diligence process, and how.';


--
-- Name: COLUMN materiality_iro1.due_diligence_link_declined; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.due_diligence_link_declined IS 'TRUE when asked and declined for the ¶35(c) due diligence limb. Distinct from null.';


--
-- Name: COLUMN materiality_iro1.external_experts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.external_experts IS '¶35(c), second limb. Consultation with EXTERNAL EXPERTS. Deliberately not the stakeholder survey: materiality_survey_* records affected parties giving their own view, and an expert consulted on method is a different input that ¶35(c) names separately. Do not derive this from survey participation.';


--
-- Name: COLUMN materiality_iro1.external_experts_declined; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.external_experts_declined IS 'TRUE when asked and declined for the ¶35(c) external-experts limb. Distinct from null.';


--
-- Name: COLUMN materiality_iro1.supersedes_assessment_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.supersedes_assessment_id IS '¶35(d). The assessment this cycle supersedes, so changes against the prior reporting period can be stated. NULLABLE, and a first-cycle null is not a gap — there is nothing to point at. Composite FK on (id, user_id), so it cannot reference another account''s assessment.';


--
-- Name: COLUMN materiality_iro1.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.status IS 'draft until the preparer submits. On submitted, materiality_iro1_submitted_is_complete requires every one of the five limbs to be answered or explicitly declined — so a null on a submitted row is never "not got to yet".';


--
-- Name: COLUMN materiality_iro1.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_iro1.updated_at IS 'Maintained by materiality_iro1_set_updated_at, attached at creation. See 20260846 for why a trigger and not a DEFAULT: without one this column records insert time and never advances, under a name that says otherwise.';


--
-- Name: materiality_survey_closing_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.materiality_survey_closing_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    respondent_id uuid NOT NULL,
    questionnaire_version integer NOT NULL,
    comment text NOT NULL,
    track text NOT NULL,
    stakeholder_category text NOT NULL,
    answered_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT materiality_survey_closing_comments_comment_check CHECK (((length(btrim(comment)) >= 1) AND (length(btrim(comment)) <= 4000)))
);


--
-- Name: TABLE materiality_survey_closing_comments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.materiality_survey_closing_comments IS 'The closing free-text question — "Is there anything affecting people, the environment or the business that we have not asked about?" ⚠️ THE MODULE''S ENTIRE EMERGING-TOPIC CATCH. Survey scope is fixed at round creation with no second scoping moment, so this is the ONLY route by which a matter outside the chosen scope reaches the preparer, and ESRS 2 IRO-1 expects one. A SEPARATE TABLE so that "never counted" is structural: materiality_survey_counter_rows reads materiality_survey_responses and cannot see this. No value, no abstention, no sub-topic, and no function_department. Same grant posture as materiality_survey_responses — nothing to anon or authenticated, RLS on with no policy for either — so the customer reaches it only through survey_aggregate.';


--
-- Name: COLUMN materiality_survey_closing_comments.comment; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_closing_comments.comment IS 'Verbatim, as the respondent wrote it. NEVER suppressed by the anonymity floor: the floor withholds the GROUP LABEL, because suppressing the text would defeat the only emerging-topic mechanism the module has. Bounded at 4000 characters — the write path is open to an unauthenticated caller and a report has to render this.';


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
    CONSTRAINT materiality_survey_responses_free_text_len CHECK (((free_text IS NULL) OR (length(free_text) <= 4000))),
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
    polarised_extreme_min_n smallint NOT NULL,
    polarised_middle_max_share numeric NOT NULL,
    top_box_gap_margin numeric NOT NULL,
    free_text_group_floor smallint NOT NULL,
    top_box_high_min_share numeric NOT NULL,
    CONSTRAINT materiality_survey_rounds_anonymity_floor_check CHECK ((anonymity_floor >= 1)),
    CONSTRAINT materiality_survey_rounds_free_text_group_floor_check CHECK ((free_text_group_floor >= 1)),
    CONSTRAINT materiality_survey_rounds_polarised_middle_max_share_range CHECK (((polarised_middle_max_share >= (0)::numeric) AND (polarised_middle_max_share <= (1)::numeric))),
    CONSTRAINT materiality_survey_rounds_questionnaire_version_check CHECK ((questionnaire_version >= 1)),
    CONSTRAINT materiality_survey_rounds_standard_version_check CHECK ((standard_version = 'esrs_2026'::text)),
    CONSTRAINT materiality_survey_rounds_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text]))),
    CONSTRAINT materiality_survey_rounds_top_box_gap_margin_range CHECK (((top_box_gap_margin >= (0)::numeric) AND (top_box_gap_margin <= (1)::numeric))),
    CONSTRAINT materiality_survey_rounds_top_box_high_min_share_range CHECK (((top_box_high_min_share >= (0)::numeric) AND (top_box_high_min_share <= (1)::numeric)))
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
-- Name: COLUMN materiality_survey_rounds.polarised_extreme_min_n; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_rounds.polarised_extreme_min_n IS 'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Minimum respondents at each end of the scale before a sub-topic is reported as polarised (§6.2.6). Immutable once frozen_at is set — see materiality_survey_round_guard.';


--
-- Name: COLUMN materiality_survey_rounds.polarised_middle_max_share; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_rounds.polarised_middle_max_share IS 'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Largest share of answers that may sit in the middle category for a sub-topic to be reported as polarised (§6.2.6). Immutable once frozen_at is set.';


--
-- Name: COLUMN materiality_survey_rounds.top_box_gap_margin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_rounds.top_box_gap_margin IS 'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Top-box difference above which two groups are reported as differing materially — used by the disagreement register AND the S1/S2 contrast (§6.2.6). Immutable once frozen_at is set.';


--
-- Name: COLUMN materiality_survey_rounds.free_text_group_floor; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.materiality_survey_rounds.free_text_group_floor IS 'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Governs whether a verbatim comment carries a group label; see that table''s definition. Applies to INDIVIDUAL respondents only. Immutable once frozen_at is set, like the other three constants.';


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

COMMENT ON TABLE public.mr_esrs_disclosure_requirements IS 'Per-standard-version ESRS disclosure requirements. Exists because ESRS (2026) RENUMBERED the DRs - two were inserted into E1 at positions 2 and 3 and everything below shifted, so E1-5 means "Energy consumption and mix" under 2023 and "Actions and resources" under 2026. Codes still resolve either way, so a report printing the wrong vintage does not fail, it sends a preparer to collect the wrong data. esrs_2026 (64 rows) comes from C(2026) 5010 Annex I via docs/reference/drs2026.tsv, and every row was VERIFIED character for character against the annex body headings on 21 Aug 2026: 63 exact, 1 corrected (E1-11, where the act''s contents listing and body heading disagree and the body governs), 0 missing. esrs_2023 (61 rows) is MIGRATED FROM THE IN-REPO ESRS_DR_MAP CONSTANT - hand-authored, curated (S1 carries 8 of the standard''s 17), and of UNVERIFIED fidelity to Del. Reg. (EU) 2023/2772. The two editions are NOT of equal standing and must not be described together.';


--
-- Name: COLUMN mr_esrs_disclosure_requirements.standard_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_disclosure_requirements.standard_version IS 'Which ESRS version this requirement belongs to. Three values coexist per Art. 2(1) of the 2026 delegated act; Art. 2(2) requires the undertaking to state which it applied for FY2026.';


--
-- Name: COLUMN mr_esrs_disclosure_requirements.title; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_disclosure_requirements.title IS 'Requirement heading as printed by the named standard version. esrs_2026 titles were pattern-extracted from the adopted C(2026) 5010 Annex I (curly apostrophes normalised to straight, wrapped headings joined), then VERIFIED character for character against the annex BODY headings on 21 Aug 2026 - not the contents listing, which differs from the body at E1-11 and is navigational apparatus. Extraction pipeline: scripts/extract-annex.sh. esrs_2023 titles come from the ESRS_DR_MAP constant and are ThemisIQ''s wording, not the instrument''s.';


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
    context text,
    CONSTRAINT mr_esrs_subtopic_display_context_check CHECK (((context IS NULL) OR ((length(btrim(context)) >= 1) AND (length(btrim(context)) <= 600)))),
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

COMMENT ON COLUMN public.mr_esrs_subtopic_display.question_framing IS 'Whose workforce the question asks about, written from the RESPONDENT''S OWN POSITION. NULL on the 25 rows needing no framing; set on the twelve S1/S2 rows, where the two sides read DIFFERENTLY on purpose: S1 ''in your own workforce'' (an employee IS their own workforce), S2 ''in your organisation''''s workforce'' (a named representative of a supplier organisation ANSWERS FOR theirs). Corrected 16 Aug 2026 — the S2 rows previously read ''for workers in your suppliers'''' and value-chain operations'', which put to a supplier asks about THEIR suppliers, one tier too far down, and the answer would have landed in S2 as though it described the supplier''s own workforce, with no error and no flag. ⚠️ DO NOT CONVERGE THE TWO WORDINGS. short_name is identical across each pair by design and topic_label is byte-identical for S1 and S2 by design (20260822 depends on that identity), so question_framing is the ONLY human-readable field that tells the twelve rows apart; a preparer surface rendering short_name and framing alone would show six duplicated pairs. subtopic_code and topic_code do reach survey_aggregate''s payload, so a consumer can always disambiguate programmatically — it is survey_get, the respondent''s payload, that withholds subtopic_code. A distinct human label also exists in mr_esrs_topics.label (''Own workforce'' / ''Workers in the value chain''). See 20260828_mr_esrs_subtopic_display_s2_framing_fix.sql.';


--
-- Name: COLUMN mr_esrs_subtopic_display.shared_with_subtopic_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopic_display.shared_with_subtopic_code IS 'The S1.x<->S2.x pairing, stated as DATA. Appendix A shares one sub-topic set between S1 and S2, but this database holds twelve independent rows (spec §11.2) with no relation between them, so the pairing must be authored. It must NEVER be derived at runtime by string manipulation — 20260815_mr_esrs_subtopics.sql''s verify block does exactly that, which is correct for a one-off check and a defect as a routing rule.';


--
-- Name: COLUMN mr_esrs_subtopic_display.updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopic_display.updated_at IS 'Written by the BEFORE UPDATE trigger; the app must NEVER set it. Present here and deliberately ABSENT from mr_esrs_subtopics: this table is house copy corrected in place, that one is a transcription that gets a new standard_version row instead of an edit.';


--
-- Name: COLUMN mr_esrs_subtopic_display.context; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_esrs_subtopic_display.context IS 'ThemisIQ house prose shown beneath the question — one or two sentences saying what the topic means IN TERMS OF THIS COMPANY''S EFFECT ON IT, for a respondent who has never read ESRS. ⚠️ NOT TRANSCRIBED LAW: the verbatim Appendix A label is mr_esrs_subtopics.label and is what travels to the report; nothing here may ever be cited as the instrument''s wording. ⚠️ DESCRIBES STATE, NEVER MANAGEMENT PRACTICE — a line asking whether controls are monitored produces an honest "not enough visibility" from a respondent who can see the dust but not the management system, which manufactures abstentions on a counter §6.1 reads as a finding about the company. ⚠️ S1.x and S2.x carry IDENTICAL context except S1.6/S2.6 (the annex confines water and sanitation to S2); a wording difference between a pair surfaces in the aggregate as a difference in ANSWERS and corrupts the S1/S2 contrast. A DEFAULT: survey_get returns coalesce(question.context, this), so a customer''s per-round edit overrides it and is thereafter frozen against a re-seed. Copy of record: docs/survey-question-context.md.';


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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_esrs_topics_category_check CHECK ((category = ANY (ARRAY['env'::text, 'soc'::text, 'gov'::text])))
);


--
-- Name: CONSTRAINT mr_esrs_topics_category_check ON mr_esrs_topics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT mr_esrs_topics_category_check ON public.mr_esrs_topics IS 'Constrains a domain the severity rule depends on. ESRS 1 para 40 (2026) / para 46 (2023) gives severity precedence over likelihood for SOCIAL topics, and lib/materiality/severity.ts will key that on category = ''soc''. The table predates supabase/migrations and carried only its primary key, so a fourth value could have appeared silently — and the failure direction is the dangerous one: a mis-cased or renamed social category would be treated as non-social, the human-rights precedence would not apply, and a severe potential human rights impact would be scored down for being unlikely. Added by 20260838.';


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
    typically_surveyed boolean DEFAULT false NOT NULL,
    answers_as text DEFAULT 'individual'::text NOT NULL,
    CONSTRAINT mr_stakeholder_categories_answers_as_check CHECK ((answers_as = ANY (ARRAY['individual'::text, 'organisation'::text]))),
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
-- Name: COLUMN mr_stakeholder_categories.typically_surveyed; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_stakeholder_categories.typically_surveyed IS 'Whether a round-creation screen should offer this category BY DEFAULT. True on the nine codes that map to ESRS 1 AR 23''s four typical categories of affected stakeholders (own workforce; value chain workers; affected communities; consumers and end-users), decomposed into this seed''s granularity. The selection rule is ESRS 2 SBM-2 ¶22(a): the engagement disclosure must describe who was engaged with reference to AR 23''s categories, so these are the ones a round has to be able to account for. ⚠️ A DEFAULT, NEVER A RESTRICTION — AR 23 gives TYPICAL categories and not a closed set, so no RPC may filter on this column and no screen may hide the other two. investor_lender and regulator are false for being USERS rather than affected parties (the glossary names investors, lenders and creditors among users), not for being unimportant; a PE-backed company may well want investor views. NOT derivable from the other flags: `customer` is (is_affected, is_user, can_proxy_for_affected) = (f,t,f) and TRUE, while investor_lender and regulator carry the identical triple and are FALSE.';


--
-- Name: COLUMN mr_stakeholder_categories.answers_as; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_stakeholder_categories.answers_as IS 'Whether a respondent in this category answers AS THEMSELVES or ON BEHALF OF AN ORGANISATION. Governs free-text protection only (20260829): an individual''s comment carries a group label only above free_text_group_floor, an organisation''s always does, because the customer invited that organisation by name and the value of the answer depends on knowing which one gave it. ⚠️ NOT derivable from the other flags — `supplier` and `workers_rep_value_chain` share the identical (is_affected, is_user, can_proxy_for_affected, typically_surveyed) = (t,t,t,t) and land on opposite sides. Defaults to ''individual'' so a category added later gets the PROTECTIVE value rather than inheriting an exposure nobody asserted. Changing a value here must be a NEW code, never an UPDATE in place — the same rule as labour_routing — because a comment already returned unlabelled would retroactively acquire a label.';


--
-- Name: mr_survey_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mr_survey_thresholds (
    key text NOT NULL,
    value numeric NOT NULL,
    definition text NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mr_survey_thresholds_definition_check CHECK ((length(btrim(definition)) > 0)),
    CONSTRAINT mr_survey_thresholds_source_check CHECK ((length(btrim(source)) > 0))
);


--
-- Name: TABLE mr_survey_thresholds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mr_survey_thresholds IS 'Disclosed constants for the survey aggregation (spec v9 §6.2.6, §10). Each row carries a printable DEFINITION, because the assumptions register has to print a sentence and not a decimal. THE VALUES HERE ARE DEFAULTS FOR NEW ROUNDS ONLY — materiality_survey_rounds snapshots them at creation, so changing a value here can never restate a historical round''s register. Same discipline, and the same reason, as anonymity_floor being per-round rather than global (20260819).';


--
-- Name: COLUMN mr_survey_thresholds.definition; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_survey_thresholds.definition IS 'The sentence the assumptions register prints. NOT NULL because a threshold with no definition is not a disclosed constant — it is an unexplained number in a compliance report.';


--
-- Name: COLUMN mr_survey_thresholds.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.mr_survey_thresholds.source IS 'Where the value came from. ''judgement'' is honest and is the correct answer for all four seeded rows; silence is not, because it reads as a derivation a reader cannot find.';


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
-- Name: reference_data_fingerprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reference_data_fingerprints (
    dataset text NOT NULL,
    fingerprint text NOT NULL,
    source_file text NOT NULL,
    seeded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE reference_data_fingerprints; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reference_data_fingerprints IS 'What this database was seeded FROM, for reference datasets whose authority is a file in the repo. The fingerprint is the same sha256 the repo test pins, so a divergence between the file and the seeded rows is detectable by comparing two strings. Nothing computes this automatically: the build cannot reach the database. See the note below this table in the migration.';


--
-- Name: region_spend_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.region_spend_conversions (
    edition_id text NOT NULL,
    region_code text NOT NULL,
    currency character(3) NOT NULL,
    to_eur2019_per_unit numeric NOT NULL,
    basis text NOT NULL,
    gdp_coverage_pct numeric,
    CONSTRAINT region_spend_conversions_basis_check CHECK ((basis = ANY (ARRAY['published'::text, 'row_composite'::text]))),
    CONSTRAINT region_spend_conversions_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT region_spend_conversions_to_eur2019_per_unit_check CHECK ((to_eur2019_per_unit > (0)::numeric))
);


--
-- Name: TABLE region_spend_conversions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.region_spend_conversions IS 'How much 2019 EUR one unit of a customer''s currency represents, per EXIOBASE region, at an edition''s price vintage year. Applied to the SPEND to bring it onto the basis the published EXIOBASE factors are denominated in; the factor itself is never touched, so a verifier can open EXIOBASE and find the number used. REPLACES region_currency_multipliers, which stored the RECIPROCAL of this divided by 1e6 and described it as a factor multiplier - inflating every figure where it should have deflated it. That table was dropped rather than renamed because its values were wrong, not merely misnamed.';


--
-- Name: COLUMN region_spend_conversions.edition_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.region_spend_conversions.edition_id IS 'Which factor_editions row these conversions belong to. Scalars are only meaningful beside the fingerprints that produced them, so they are never stored loose. ON UPDATE CASCADE: renaming an edition carries its conversions with it. ON DELETE is NO ACTION on purpose - deleting an edition that still has conversions must fail, because a stored figure citing it would lose its basis.';


--
-- Name: COLUMN region_spend_conversions.region_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.region_spend_conversions.region_code IS 'The EXIOBASE 3 region - one of 49: the 44 individually-resolved countries by ISO alpha-2 code, or one of the five rest-of-world buckets WA, WL, WE, WF, WM. ⚠️ NO FOREIGN KEY, AND NO TABLE TO POINT ONE AT: public.exiobase_sectors is keyed on exio_code, an industry or product code, not a region, and no region table exists in this database. The authoritative list is the distinct region values in exiobaseFactors2019ixi.json. ⚠️ WF IS A REGION CODE HERE MEANING RoW AFRICA, and separately an ISO 3166-1 country code meaning Wallis and Futuna in public.country_regions.iso2. Never join those two columns.';


--
-- Name: COLUMN region_spend_conversions.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.region_spend_conversions.currency IS 'ISO 4217 of the currency the customer''s spend is denominated in, uppercase. One of the five the product offers. Together with region_code it answers: a buyer paying in THIS currency, for output from THIS region.';


--
-- Name: COLUMN region_spend_conversions.to_eur2019_per_unit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.region_spend_conversions.to_eur2019_per_unit IS 'The number of 2019 EUR that ONE unit of this currency represents at the edition''s price vintage year. Multiply a spend by it, then divide by 1e6, then multiply by the published factor. ⚠️ THE 1e6 IS NOT IN THIS NUMBER. The factor files record kg CO2 eq. per MILLION EUR and require every consumer to apply the divisor visibly rather than hide it inside a scalar. A value BELOW 1 means a vintage unit buys less real output than a 2019 unit did - the usual case under positive inflation. A value ABOVE 1 is legitimate and not an error: it means the region''s currency weakened against the customer''s by more than its prices rose, so the same money buys more of that region''s output than it did in 2019. Japan priced in EUR is the clear example.';


--
-- Name: COLUMN region_spend_conversions.basis; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.region_spend_conversions.basis IS 'How the underlying series was arrived at. ''published'' means one of the 44 regions with its own national CPI and FX series. ''row_composite'' means one of the five rest-of-world buckets, where the ratios are GDP-weighted averages across member countries - a multi-economy average, not a national figure, and it must be described that way wherever it is shown.';


--
-- Name: COLUMN region_spend_conversions.gdp_coverage_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.region_spend_conversions.gdp_coverage_pct IS 'For a row_composite row: the share of the bucket''s MEASURABLE GDP held by members that had usable price data. NULL for a ''published'' row, where the concept does not apply - NULL means "not applicable" here, never "unknown" or "100". ⚠️ MEASURABLE, NOT TOTAL: members with no GDP figure at all are absent from both sides of that fraction, so 100.0 can coexist with members missing entirely.';


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
    baseline_scope3_coverage jsonb,
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
-- Name: COLUMN sbti_targets.baseline_scope3_coverage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sbti_targets.baseline_scope3_coverage IS 'What this target''s Scope 3 BASE YEAR covered, frozen at commit beside base_year_emissions_tco2e: {"relevant": <int|null>, "inTotal": <int|null>, "unpriced": <int|null>, "exclusionsUnjustified": <int|null>, "categories": [<category id>, ...]}. Mirrors BaselineScope3Coverage in lib/ghg/series.ts, which derives it from scope3_inventories.scope3_coverage for the baseline year. ⚠️ FROZEN, NOT LIVE: Scope 3 coverage grows as a customer answers more categories, and reading it live would restate a target set against 6 of 12 categories as one set against 12 of 12. ⚠️ NOT coverage_pct: that column means the share of EMISSIONS a target boundary covers, a different quantity from a count of categories, and it is currently written by nothing. NULL here = not recorded, for a target committed before this column existed; the baseline''s coverage at that moment cannot be recovered. A record whose counts are all null with an empty category list is different again: the question was asked at commit and the baseline year had no coverage recorded. Set only for scope = ''s3''.';


--
-- Name: scope3_category_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scope3_category_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scope3_inventory_id uuid NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    category text NOT NULL,
    accepted_at timestamp with time zone NOT NULL,
    accepted_by uuid,
    figure_as_used numeric NOT NULL,
    unit text NOT NULL,
    method text NOT NULL,
    lines jsonb DEFAULT '[]'::jsonb NOT NULL,
    uncovered jsonb DEFAULT '[]'::jsonb NOT NULL,
    currency_flags jsonb DEFAULT '[]'::jsonb NOT NULL,
    supersedes_id uuid,
    restatement_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT scope3_category_snapshots_reason_needs_supersedes CHECK (((restatement_reason IS NULL) OR (supersedes_id IS NOT NULL)))
);


--
-- Name: TABLE scope3_category_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.scope3_category_snapshots IS 'What a Scope 3 category figure was a total of, fixed when the buyer accepted it. Immutable: authenticated holds SELECT and INSERT only, there is no UPDATE or DELETE policy, and a correction is a new row carrying supersedes_id. One FK, to scope3_inventories, ON DELETE CASCADE.';


--
-- Name: COLUMN scope3_category_snapshots.figure_as_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_category_snapshots.figure_as_used IS 'Exactly the number that went into the category total at acceptance, in `unit`. Not recomputed.';


--
-- Name: COLUMN scope3_category_snapshots.lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_category_snapshots.lines IS 'The per-supplier lines as /api/campaigns/[id]/scope3-cat1 returned them: supplier_id, supplier_name, method, data_quality, value_mt, allocation_method, basis, supplier_assurance_raw and assurance. THE FIELDS ARE THE DATA AND `basis` IS A RENDERING: it is the sentence that was DISPLAYED at acceptance, kept verbatim so the record can reproduce what the buyer saw, and it is not the authority for anything. Rewording the route changes later sentences and must not change these. ⚠️ supplier_name AND supplier_id ARE A FROZEN COPY, NOT A FOREIGN KEY, ON PURPOSE. campaign_suppliers cascades from supplier_campaigns and supplier_responses cascades from campaign_suppliers, so an FK here would inherit that and deleting a finished campaign would erase the evidence for a figure still sitting in a filed report. Do not "fix" this into a foreign key. The id is kept beside the name for tracing while the campaign exists; the name is what keeps the row readable after it does not. ⚠️ A LINE WITH NO `assurance` KEY IS A SNAPSHOT ACCEPTED BEFORE THIS FIELD EXISTED. IT DOES NOT MEAN "NOT ASSURED". These rows are deliberately NOT backfilled: a snapshot records what was known at acceptance, and this was not known then. Report the absence as an absence, for example "supplier assurance status was not recorded when this figure was accepted". Every line written after the field was added carries the key with one of eight explicit values, two of which are themselves absences (not_asked, where the campaign questionnaire has no assurance question, and not_answered, where it does and the supplier left it blank), so the KEY BEING PRESENT is what distinguishes a recorded answer from a row that predates the field. ⚠️ assurance DESCRIBES THE LINE''S FIGURE; supplier_assurance_raw DESCRIBES THE SUPPLIER. A spend-based line is always not_applicable however the supplier answered, because its figure is the buyer''s spend times an emission factor and the supplier''s assurance status does not bear on it. So do NOT aggregate assured suppliers across lines by reading supplier_assurance_raw: counting a spend-based line because its supplier holds assurance reports an estimate as assured. Filter on assurance in (''limited'', ''reasonable''), which is what carriesThirdPartyAssurance() does in lib/scope3/supplierAssurance.ts. ⚠️ AND NEITHER FIELD SAYS A FIGURE IS ASSURED. The questionnaire asks whether the SUPPLIER''S emissions figures are independently assured. A supplier may hold limited assurance over their group Scope 1 and 2 while the portion they attributed to this buyer is an unassured internal allocation, so the answer supports "this supplier reports limited assurance over their emissions figures" and never "this figure is assured".';


--
-- Name: COLUMN scope3_category_snapshots.restatement_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_category_snapshots.restatement_reason IS 'Why this snapshot replaces the one in supersedes_id. Nullable with no default, by design: see the CHECK constraint comment. An unreasoned restatement is gated at the report, not at the insert.';


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
    country_iso2 character(2),
    scope3_categories_relevant integer,
    scope3_categories_in_total integer,
    scope3_categories_unpriced integer,
    scope3_exclusions_unjustified integer,
    scope3_coverage jsonb,
    cat_snapshot_ids jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT scope3_inventories_country_iso2_format CHECK (((country_iso2 IS NULL) OR (country_iso2 ~ '^[A-Z]{2}$'::text))),
    CONSTRAINT scope3_inventories_sector_is_industry CHECK (((sector IS NULL) OR (sector ~~ 'i%'::text))),
    CONSTRAINT scope3_inventories_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text])))
);


--
-- Name: COLUMN scope3_inventories.country_iso2; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_inventories.country_iso2 IS 'Where the goods and services in this Scope 3 inventory were PRODUCED, as a two-letter uppercase ISO 3166-1 alpha-2 code such as ''DE'' or ''VN''. ⚠️ THIS IS THE SUPPLIER''S COUNTRY, NOT THE BUYER''S. It is the country whose production a spend-based emission factor should represent, so it is where the money went, not where the company reporting sits. A US company buying from a Vietnamese factory records VN here. Getting this backwards prices foreign production at domestic intensity, which is a wrong figure rather than a missing one, and nothing downstream can detect it. NULL means nobody has recorded where the spend was produced - not that it was domestic, and not that it is unknowable. A NULL leaves a spend-based estimate with no country to price against. HOW IT RESOLVES: this column is a COUNTRY, not a region. It is looked up in public.country_regions to obtain an EXIOBASE region_code, and that region is what a factor is read against. The two are not interchangeable: country_regions covers 212 codes out of the 249 ISO assigns, so a perfectly valid country may resolve to nothing at all. That is why this column has no foreign key - a country we cannot price must still be recordable. Treat a failed lookup as a flagged gap, never as a silent fallback. ⚠️ WF IS A TRAP AND IT IS THE ONLY ONE. Here WF is the ISO country code for Wallis and Futuna. In country_regions.region_code and region_spend_conversions.region_code, WF is a REGION code meaning RoW Africa. They are unrelated. Never compare this column against a region_code and never default one to the other: both are char(2) uppercase, so the confusion passes every constraint silently and pairs a Pacific island with an African average. Wallis and Futuna is not among the 212, which means such a join produces a wrong answer where a failed lookup should have produced an error. WA, WL, WE and WM are not ISO codes, so WF is the only collision.';


--
-- Name: COLUMN scope3_inventories.scope3_categories_relevant; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_inventories.scope3_categories_relevant IS 'How many of the 15 Scope 3 categories the customer answered as RELEVANT — the claim this total is made against. NULL = not recorded (every row saved before 20260917_scope3_coverage.sql); it does NOT mean 15, and it does not mean 0. A row saved after that migration with nothing answered records 0.';


--
-- Name: COLUMN scope3_inventories.scope3_categories_in_total; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_inventories.scope3_categories_in_total IS 'How many categories actually contributed to total_scope3_tco2e: relevant, calculated, priced and non-zero. Read beside scope3_categories_relevant as "N of M". NULL = not recorded.';


--
-- Name: COLUMN scope3_inventories.scope3_categories_unpriced; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_inventories.scope3_categories_unpriced IS 'How many CLAIMED categories produced no figure because the platform could not price them — no active factor edition, or no factor for the selected sector. Distinct from "relevant, not yet calculated", which is a category the customer has not filled in: this one is a platform failure, and a baseline missing a category for this reason is a different defect from one the customer chose to leave empty. NULL = not recorded.';


--
-- Name: COLUMN scope3_inventories.scope3_exclusions_unjustified; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_inventories.scope3_exclusions_unjustified IS 'How many categories answered NOT RELEVANT carry no justification text. The GHG Protocol requires a justification for every excluded category in the report, so this records reporting readiness with the figures rather than only in the exported file. NULL = not recorded.';


--
-- Name: COLUMN scope3_inventories.scope3_coverage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_inventories.scope3_coverage IS 'One entry per category id (cat1..cat15): {"status": <status key>, "mt": <number|null>, "in_total": <bool>, "unpriced": <bool>, "reason": <text|null>, "dq": <number, present only for a method that defines a data-quality scale>}. Status keys are lib/scope3/categoryStatus.ts: relevant_calculated, relevant_not_calculated, not_relevant_calculated, not_relevant_not_calculated, not_evaluated. mt is null wherever nothing was calculated — never 0, which would claim the category emits nothing. ⚠️ not_relevant_calculated carries a figure that is NOT in the total: a category the customer calculated, found immaterial, and excluded on that basis, where the figure is the evidence for the exclusion. ⚠️ unpriced means the customer supplied what the method needs and the platform still produced no figure; it is FALSE for a category simply not filled in yet, whose CDP status is identical — unpriced is a property of the entry, not a status. reason is the wizard''s own sentence for that category, verbatim, and is present only when unpriced. ⚠️ dq is the METHOD''s own data-quality score, not ThemisIQ''s confidence label: PCAF 1-to-5 for cat15 (1 = investee''s verified reported emissions, 5 = spend proxy), fractional because a portfolio''s score is weighted by each holding''s emissions. It is ABSENT, not null, for the fourteen categories whose methods define no such scale, and absent wherever mt is null — a score cannot describe a figure that does not exist. The counts in the sibling columns are all derivable from this map and are stored separately anyway: a consumer reading a trend should not have to parse jsonb to answer "how many", and the relevant-count is a customer judgement that cannot be reconstructed later. The map answers what the counts cannot — WHICH categories — so two years at 6 of 15 can be compared rather than assumed equivalent. NULL = not recorded.';


--
-- Name: COLUMN scope3_inventories.cat_snapshot_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.scope3_inventories.cat_snapshot_ids IS 'Category id -> scope3_category_snapshots.id currently in use for it. Absent key means no figure has been accepted from supplier data for that category. The snapshots themselves are immutable, so this pointer is the only mutable part: a restatement moves it to a new row and the old row stays readable.';


--
-- Name: sector_display_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sector_display_groups (
    id integer NOT NULL,
    heading text NOT NULL,
    member_count integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE sector_display_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sector_display_groups IS 'PRESENTATION ONLY. Headings used to group the EXIOBASE industry list in ThemisIQ dropdowns so a 163-item select is navigable. These are NOT a classification: they are not published by anyone, they are not derived from ISIC or NACE, they carry no methodological claim, and no emission figure is computed from them. Membership was assigned by reading what the EXIOBASE name strings say. The published classification lives in exiobase_sectors.isic_code / isic_name; if the two ever disagree, the published one is right and this one is a UI decision.';


--
-- Name: COLUMN sector_display_groups.member_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sector_display_groups.member_count IS 'Industries in this group at seed time. Denormalised for review only - the authority is the count of exiobase_sectors rows carrying this heading. A disagreement means the seed is stale.';


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
-- Name: supply_chain_registers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supply_chain_registers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    name text NOT NULL,
    company_name text,
    reporting_year integer NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    frameworks text[] DEFAULT '{}'::text[] NOT NULL,
    suppliers jsonb DEFAULT '[]'::jsonb NOT NULL,
    supplier_count integer DEFAULT 0 NOT NULL,
    total_spend numeric DEFAULT 0 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supply_chain_registers_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'final'::text])))
);


--
-- Name: TABLE supply_chain_registers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.supply_chain_registers IS 'Supplier risk registers. Inputs only: risk_level, risk_score, risk_factors and scope3_emissions are recomputed by scoreSupplier() on load, never stored, so a register reopened in a later year shows scores this build produces rather than stale ones.';


--
-- Name: COLUMN supply_chain_registers.suppliers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supply_chain_registers.suppliers IS 'Array of supplier input objects: id, name, country, sector, annual_spend, currency, tier, has_assessment, campaign_supplier_id. The campaign_supplier_id is a hint with no referential integrity, since Postgres cannot place a foreign key inside jsonb. A deleted campaign leaves it dangling by design; resolve it on load with a left join and render a broken-link state rather than failing.';


--
-- Name: COLUMN supply_chain_registers.total_spend; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.supply_chain_registers.total_spend IS 'Sum of annual_spend across suppliers. Safe to store because it sums inputs. There is deliberately no total_scope3 column, because that would sum scoring output and could drift from what a reload computes.';


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
-- Name: concierge_job_documents concierge_job_documents_job_id_source_doc_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_job_documents
    ADD CONSTRAINT concierge_job_documents_job_id_source_doc_id_key UNIQUE (job_id, source_doc_id);


--
-- Name: concierge_job_documents concierge_job_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_job_documents
    ADD CONSTRAINT concierge_job_documents_pkey PRIMARY KEY (id);


--
-- Name: concierge_jobs concierge_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_jobs
    ADD CONSTRAINT concierge_jobs_pkey PRIMARY KEY (id);


--
-- Name: concierge_proposals concierge_proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_proposals
    ADD CONSTRAINT concierge_proposals_pkey PRIMARY KEY (id);


--
-- Name: country_regions country_regions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.country_regions
    ADD CONSTRAINT country_regions_pkey PRIMARY KEY (iso2);


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
-- Name: erasure_log erasure_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.erasure_log
    ADD CONSTRAINT erasure_log_pkey PRIMARY KEY (id);


--
-- Name: exiobase_sectors exiobase_sectors_label_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exiobase_sectors
    ADD CONSTRAINT exiobase_sectors_label_unique UNIQUE (exio_label);


--
-- Name: exiobase_sectors exiobase_sectors_number_per_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exiobase_sectors
    ADD CONSTRAINT exiobase_sectors_number_per_type UNIQUE (factor_type, exio_number);


--
-- Name: exiobase_sectors exiobase_sectors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exiobase_sectors
    ADD CONSTRAINT exiobase_sectors_pkey PRIMARY KEY (exio_code);


--
-- Name: factor_editions factor_editions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factor_editions
    ADD CONSTRAINT factor_editions_pkey PRIMARY KEY (id);


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
-- Name: materiality_assessment_survey_rounds materiality_assessment_survey_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessment_survey_rounds
    ADD CONSTRAINT materiality_assessment_survey_rounds_pkey PRIMARY KEY (assessment_id, round_id);


--
-- Name: materiality_assessments materiality_assessments_id_user_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessments
    ADD CONSTRAINT materiality_assessments_id_user_key UNIQUE (id, user_id);


--
-- Name: CONSTRAINT materiality_assessments_id_user_key ON materiality_assessments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT materiality_assessments_id_user_key ON public.materiality_assessments IS 'FK target for materiality_assessment_survey_rounds, and nothing else. It exists so that a link row cannot point at an assessment owned by a different user — ownership becomes a database fact rather than a rule a trigger is trusted to check, and a trigger can be disabled in one statement. id is already the primary key, so this adds an index and changes no behaviour.';


--
-- Name: materiality_assessments materiality_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessments
    ADD CONSTRAINT materiality_assessments_pkey PRIMARY KEY (id);


--
-- Name: materiality_custom_iros materiality_custom_iros_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_custom_iros
    ADD CONSTRAINT materiality_custom_iros_pkey PRIMARY KEY (assessment_id, subtopic_code, iro_key);


--
-- Name: materiality_finalisation_requirements materiality_finalisation_requirements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_finalisation_requirements
    ADD CONSTRAINT materiality_finalisation_requirements_pkey PRIMARY KEY (assessment_id, version, dr_code);


--
-- Name: materiality_finalisations materiality_finalisations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_finalisations
    ADD CONSTRAINT materiality_finalisations_pkey PRIMARY KEY (assessment_id, version);


--
-- Name: materiality_impact_assignee_determinations materiality_impact_assignee_determinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignee_determinations
    ADD CONSTRAINT materiality_impact_assignee_determinations_pkey PRIMARY KEY (assessment_id, subtopic_code, axis, direction, iro_key);


--
-- Name: materiality_impact_assignment_subtopics materiality_impact_assignment_subtopics_one_assignee; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignment_subtopics
    ADD CONSTRAINT materiality_impact_assignment_subtopics_one_assignee UNIQUE (assessment_id, subtopic_code);


--
-- Name: CONSTRAINT materiality_impact_assignment_subtopics_one_assignee ON materiality_impact_assignment_subtopics; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT materiality_impact_assignment_subtopics_one_assignee ON public.materiality_impact_assignment_subtopics IS 'ONE ASSIGNEE PER SUB-TOPIC. A second assignment covering the same sub-topic in the same assessment fails on insert. The design decision is that there is no expert-vs-expert disagreement and no ownership contest; this is where that decision is actually enforced.';


--
-- Name: materiality_impact_assignment_subtopics materiality_impact_assignment_subtopics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignment_subtopics
    ADD CONSTRAINT materiality_impact_assignment_subtopics_pkey PRIMARY KEY (assignment_id, subtopic_code);


--
-- Name: materiality_impact_assignments materiality_impact_assignments_id_assessment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignments
    ADD CONSTRAINT materiality_impact_assignments_id_assessment_key UNIQUE (id, assessment_id);


--
-- Name: materiality_impact_assignments materiality_impact_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignments
    ADD CONSTRAINT materiality_impact_assignments_pkey PRIMARY KEY (id);


--
-- Name: materiality_impact_assignments materiality_impact_assignments_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignments
    ADD CONSTRAINT materiality_impact_assignments_token_key UNIQUE (token);


--
-- Name: materiality_impact_determinations materiality_impact_determinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_determinations
    ADD CONSTRAINT materiality_impact_determinations_pkey PRIMARY KEY (assessment_id, subtopic_code, axis, direction, iro_key);


--
-- Name: materiality_iro1 materiality_iro1_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_iro1
    ADD CONSTRAINT materiality_iro1_pkey PRIMARY KEY (assessment_id);


--
-- Name: materiality_survey_closing_comments materiality_survey_closing_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_closing_comments
    ADD CONSTRAINT materiality_survey_closing_comments_pkey PRIMARY KEY (id);


--
-- Name: materiality_survey_closing_comments materiality_survey_closing_comments_respondent_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_closing_comments
    ADD CONSTRAINT materiality_survey_closing_comments_respondent_key UNIQUE (respondent_id);


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
-- Name: materiality_survey_rounds materiality_survey_rounds_id_user_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_rounds
    ADD CONSTRAINT materiality_survey_rounds_id_user_key UNIQUE (id, user_id);


--
-- Name: CONSTRAINT materiality_survey_rounds_id_user_key ON materiality_survey_rounds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON CONSTRAINT materiality_survey_rounds_id_user_key ON public.materiality_survey_rounds IS 'FK target for materiality_assessment_survey_rounds. The round-side half of the same argument as materiality_assessments_id_user_key: both parents of a link must be owned by the linker, and a composite FK makes that structural. Distinct from materiality_survey_rounds_id_version_key, which is the FK target for the question set.';


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
-- Name: mr_survey_thresholds mr_survey_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mr_survey_thresholds
    ADD CONSTRAINT mr_survey_thresholds_pkey PRIMARY KEY (key);


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
-- Name: reference_data_fingerprints reference_data_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reference_data_fingerprints
    ADD CONSTRAINT reference_data_fingerprints_pkey PRIMARY KEY (dataset);


--
-- Name: region_spend_conversions region_spend_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_spend_conversions
    ADD CONSTRAINT region_spend_conversions_pkey PRIMARY KEY (edition_id, region_code, currency);


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
-- Name: scope3_category_snapshots scope3_category_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_category_snapshots
    ADD CONSTRAINT scope3_category_snapshots_pkey PRIMARY KEY (id);


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
-- Name: sector_display_groups sector_display_groups_heading_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_display_groups
    ADD CONSTRAINT sector_display_groups_heading_key UNIQUE (heading);


--
-- Name: sector_display_groups sector_display_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sector_display_groups
    ADD CONSTRAINT sector_display_groups_pkey PRIMARY KEY (id);


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
-- Name: supply_chain_registers supply_chain_registers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_chain_registers
    ADD CONSTRAINT supply_chain_registers_pkey PRIMARY KEY (id);


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
-- Name: country_regions_region_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX country_regions_region_idx ON public.country_regions USING btree (region_code);


--
-- Name: deals_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deals_user_id_idx ON public.deals USING btree (user_id);


--
-- Name: erasure_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erasure_log_created_idx ON public.erasure_log USING btree (created_at DESC);


--
-- Name: erasure_log_subject_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX erasure_log_subject_idx ON public.erasure_log USING btree (subject_user_id);


--
-- Name: exiobase_sectors_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exiobase_sectors_group_idx ON public.exiobase_sectors USING btree (display_group);


--
-- Name: exiobase_sectors_isic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exiobase_sectors_isic_idx ON public.exiobase_sectors USING btree (isic_code);


--
-- Name: exiobase_sectors_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exiobase_sectors_type_idx ON public.exiobase_sectors USING btree (factor_type);


--
-- Name: factor_editions_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX factor_editions_one_active ON public.factor_editions USING btree ((true)) WHERE is_active;


--
-- Name: INDEX factor_editions_one_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.factor_editions_one_active IS 'At most one row with is_active = true. Indexed on the constant (true) and filtered to active rows, so every active row collides with every other. Inactive rows are unconstrained.';


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
-- Name: idx_concierge_job_documents_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_job_documents_job ON public.concierge_job_documents USING btree (job_id);


--
-- Name: idx_concierge_jobs_entitlement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_jobs_entitlement ON public.concierge_jobs USING btree (entitlement_id);


--
-- Name: idx_concierge_jobs_inventory; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_jobs_inventory ON public.concierge_jobs USING btree (inventory_id);


--
-- Name: idx_concierge_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_jobs_status ON public.concierge_jobs USING btree (status);


--
-- Name: idx_concierge_jobs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_jobs_user ON public.concierge_jobs USING btree (user_id);


--
-- Name: idx_concierge_proposals_job_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_concierge_proposals_job_doc ON public.concierge_proposals USING btree (job_document_id);


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
-- Name: materiality_assessment_survey_rounds_round_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_assessment_survey_rounds_round_idx ON public.materiality_assessment_survey_rounds USING btree (round_id);


--
-- Name: materiality_custom_iros_assessment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_custom_iros_assessment_idx ON public.materiality_custom_iros USING btree (assessment_id);


--
-- Name: materiality_custom_iros_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX materiality_custom_iros_name_unique ON public.materiality_custom_iros USING btree (assessment_id, subtopic_code, lower(btrim(name)));


--
-- Name: materiality_custom_iros_subtopic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_custom_iros_subtopic_idx ON public.materiality_custom_iros USING btree (assessment_id, subtopic_code);


--
-- Name: materiality_finalisation_requirements_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_finalisation_requirements_order_idx ON public.materiality_finalisation_requirements USING btree (assessment_id, version, topic_code, sort_order);


--
-- Name: materiality_finalisation_requirements_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_finalisation_requirements_user_idx ON public.materiality_finalisation_requirements USING btree (user_id);


--
-- Name: materiality_finalisations_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_finalisations_user_idx ON public.materiality_finalisations USING btree (user_id);


--
-- Name: materiality_impact_assignee_determinations_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_impact_assignee_determinations_assignment_idx ON public.materiality_impact_assignee_determinations USING btree (assignment_id);


--
-- Name: materiality_impact_assignment_subtopics_assessment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_impact_assignment_subtopics_assessment_idx ON public.materiality_impact_assignment_subtopics USING btree (assessment_id);


--
-- Name: materiality_impact_assignments_assessment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_impact_assignments_assessment_idx ON public.materiality_impact_assignments USING btree (assessment_id);


--
-- Name: materiality_impact_assignments_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_impact_assignments_token_idx ON public.materiality_impact_assignments USING btree (token);


--
-- Name: materiality_impact_determinations_assessment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_impact_determinations_assessment_idx ON public.materiality_impact_determinations USING btree (assessment_id);


--
-- Name: materiality_impact_determinations_assignment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_impact_determinations_assignment_idx ON public.materiality_impact_determinations USING btree (assignment_id);


--
-- Name: materiality_iro1_supersedes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_iro1_supersedes_idx ON public.materiality_iro1 USING btree (supersedes_assessment_id);


--
-- Name: materiality_iro1_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_iro1_user_idx ON public.materiality_iro1 USING btree (user_id);


--
-- Name: materiality_survey_closing_comments_round_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX materiality_survey_closing_comments_round_idx ON public.materiality_survey_closing_comments USING btree (round_id);


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
-- Name: region_spend_conversions_edition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX region_spend_conversions_edition_idx ON public.region_spend_conversions USING btree (edition_id);


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
-- Name: scope3_category_snapshots_record_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX scope3_category_snapshots_record_category_idx ON public.scope3_category_snapshots USING btree (scope3_inventory_id, category, accepted_at DESC);


--
-- Name: supply_chain_registers_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supply_chain_registers_company_id_idx ON public.supply_chain_registers USING btree (company_id);


--
-- Name: supply_chain_registers_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supply_chain_registers_user_id_idx ON public.supply_chain_registers USING btree (user_id);


--
-- Name: supply_chain_registers_user_year_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supply_chain_registers_user_year_idx ON public.supply_chain_registers USING btree (user_id, reporting_year);


--
-- Name: cbam_installation_disclosures audit_cbam_installation_disclosures; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_cbam_installation_disclosures AFTER INSERT OR DELETE OR UPDATE ON public.cbam_installation_disclosures FOR EACH ROW EXECUTE FUNCTION public.log_audit_cbam_disclosures();


--
-- Name: cbam_production_processes audit_cbam_production_processes; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_cbam_production_processes AFTER INSERT OR DELETE OR UPDATE ON public.cbam_production_processes FOR EACH ROW EXECUTE FUNCTION public.log_audit();


--
-- Name: concierge_job_documents audit_concierge_job_documents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_concierge_job_documents AFTER INSERT OR DELETE OR UPDATE ON public.concierge_job_documents FOR EACH ROW EXECUTE FUNCTION public.log_audit();


--
-- Name: concierge_jobs audit_concierge_jobs; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_concierge_jobs AFTER INSERT OR DELETE OR UPDATE ON public.concierge_jobs FOR EACH ROW EXECUTE FUNCTION public.log_audit();


--
-- Name: concierge_proposals audit_concierge_proposals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_concierge_proposals AFTER INSERT OR DELETE OR UPDATE ON public.concierge_proposals FOR EACH ROW EXECUTE FUNCTION public.log_audit();


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
-- Name: materiality_assessment_survey_rounds materiality_assessment_survey_rounds_link_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_assessment_survey_rounds_link_guard BEFORE INSERT OR UPDATE ON public.materiality_assessment_survey_rounds FOR EACH ROW EXECUTE FUNCTION public.materiality_assessment_survey_round_link_guard();


--
-- Name: materiality_assessments materiality_assessments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_assessments_set_updated_at BEFORE UPDATE ON public.materiality_assessments FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: materiality_assessments materiality_assessments_version_agrees_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_assessments_version_agrees_trg BEFORE UPDATE OF standard_version ON public.materiality_assessments FOR EACH ROW EXECUTE FUNCTION public.materiality_assessment_standard_version_agrees();


--
-- Name: materiality_impact_assignment_subtopics materiality_assignment_subtopics_no_iros_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_assignment_subtopics_no_iros_trg BEFORE INSERT OR UPDATE ON public.materiality_impact_assignment_subtopics FOR EACH ROW EXECUTE FUNCTION public.materiality_assignment_subtopic_no_iros();


--
-- Name: materiality_custom_iros materiality_custom_iros_not_delegated_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_custom_iros_not_delegated_trg BEFORE INSERT ON public.materiality_custom_iros FOR EACH ROW EXECUTE FUNCTION public.materiality_custom_iro_not_delegated();


--
-- Name: materiality_finalisations materiality_finalisations_allocate_version; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_finalisations_allocate_version BEFORE INSERT ON public.materiality_finalisations FOR EACH ROW EXECUTE FUNCTION public.materiality_finalisation_allocate_version();


--
-- Name: materiality_impact_determinations materiality_impact_determination_assessment_version_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_impact_determination_assessment_version_trg BEFORE INSERT OR UPDATE ON public.materiality_impact_determinations FOR EACH ROW EXECUTE FUNCTION public.materiality_impact_determination_assessment_version();


--
-- Name: materiality_impact_determinations materiality_impact_determination_finalised_lock_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_impact_determination_finalised_lock_trg BEFORE DELETE ON public.materiality_impact_determinations FOR EACH ROW EXECUTE FUNCTION public.materiality_impact_determination_finalised_lock();


--
-- Name: materiality_impact_determinations materiality_impact_determination_iro_exists_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_impact_determination_iro_exists_trg BEFORE INSERT OR UPDATE ON public.materiality_impact_determinations FOR EACH ROW EXECUTE FUNCTION public.materiality_impact_determination_iro_exists();


--
-- Name: materiality_impact_determinations materiality_impact_determination_lock_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_impact_determination_lock_trg BEFORE INSERT OR UPDATE ON public.materiality_impact_determinations FOR EACH ROW EXECUTE FUNCTION public.materiality_impact_determination_lock();


--
-- Name: materiality_iro1 materiality_iro1_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_iro1_set_updated_at BEFORE UPDATE ON public.materiality_iro1 FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: materiality_survey_respondents materiality_survey_respondents_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_survey_respondents_guard BEFORE UPDATE ON public.materiality_survey_respondents FOR EACH ROW EXECUTE FUNCTION public.materiality_survey_respondent_guard();


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
-- Name: materiality_survey_rounds materiality_survey_rounds_snapshot_thresholds; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER materiality_survey_rounds_snapshot_thresholds BEFORE INSERT ON public.materiality_survey_rounds FOR EACH ROW EXECUTE FUNCTION public.materiality_survey_round_snapshot_thresholds();


--
-- Name: mr_esrs_subtopic_display mr_esrs_subtopic_display_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mr_esrs_subtopic_display_set_updated_at BEFORE UPDATE ON public.mr_esrs_subtopic_display FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: mr_industry_subtopic_baselines mr_industry_subtopic_baselines_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mr_industry_subtopic_baselines_set_updated_at BEFORE UPDATE ON public.mr_industry_subtopic_baselines FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


--
-- Name: mr_survey_thresholds mr_survey_thresholds_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER mr_survey_thresholds_set_updated_at BEFORE UPDATE ON public.mr_survey_thresholds FOR EACH ROW EXECUTE FUNCTION public.sbti_set_updated_at();


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
-- Name: concierge_job_documents trg_concierge_job_documents_open; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concierge_job_documents_open BEFORE INSERT OR UPDATE ON public.concierge_job_documents FOR EACH ROW EXECUTE FUNCTION public.enforce_concierge_job_open();


--
-- Name: concierge_proposals trg_concierge_proposals_open; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_concierge_proposals_open BEFORE INSERT OR UPDATE ON public.concierge_proposals FOR EACH ROW EXECUTE FUNCTION public.enforce_concierge_job_open();


--
-- Name: cbam_installations trg_enforce_cbam_entitlement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_cbam_entitlement BEFORE INSERT ON public.cbam_installations FOR EACH ROW EXECUTE FUNCTION public.enforce_cbam_entitlement();


--
-- Name: deals trg_enforce_deals_free_tier_cap; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_deals_free_tier_cap BEFORE INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.enforce_deals_free_tier_cap();


--
-- Name: ghg_inventories trg_enforce_ghg_location_allowance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_ghg_location_allowance BEFORE INSERT OR UPDATE ON public.ghg_inventories FOR EACH ROW EXECUTE FUNCTION public.enforce_ghg_location_allowance();


--
-- Name: materiality_assessments trg_enforce_materiality_entitlement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_materiality_entitlement BEFORE INSERT ON public.materiality_assessments FOR EACH ROW EXECUTE FUNCTION public.enforce_materiality_entitlement();


--
-- Name: supply_chain_registers trg_enforce_supply_chain_entitlement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_supply_chain_entitlement BEFORE INSERT ON public.supply_chain_registers FOR EACH ROW EXECUTE FUNCTION public.enforce_supply_chain_entitlement();


--
-- Name: cbam_verifier_access trg_enforce_verifier_invite_term; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_verifier_invite_term BEFORE INSERT ON public.cbam_verifier_access FOR EACH ROW EXECUTE FUNCTION public.enforce_verifier_invite_term();


--
-- Name: verifier_access trg_enforce_verifier_invite_term; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_verifier_invite_term BEFORE INSERT ON public.verifier_access FOR EACH ROW EXECUTE FUNCTION public.enforce_verifier_invite_term();


--
-- Name: scope3_inventories trg_scope3_inventories_sectors; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_scope3_inventories_sectors BEFORE INSERT OR UPDATE ON public.scope3_inventories FOR EACH ROW EXECUTE FUNCTION public.assert_sector_codes_exist();


--
-- Name: supply_chain_registers trg_supply_chain_registers_sectors; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_supply_chain_registers_sectors BEFORE INSERT OR UPDATE ON public.supply_chain_registers FOR EACH ROW EXECUTE FUNCTION public.assert_sector_codes_exist();


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
-- Name: campaign_suppliers campaign_suppliers_display_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_suppliers
    ADD CONSTRAINT campaign_suppliers_display_group_fkey FOREIGN KEY (display_group) REFERENCES public.sector_display_groups(heading);


--
-- Name: campaign_suppliers campaign_suppliers_industry_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_suppliers
    ADD CONSTRAINT campaign_suppliers_industry_code_fkey FOREIGN KEY (industry_code) REFERENCES public.exiobase_sectors(exio_code);


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
-- Name: concierge_job_documents concierge_job_documents_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_job_documents
    ADD CONSTRAINT concierge_job_documents_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.concierge_jobs(id) ON DELETE CASCADE;


--
-- Name: concierge_jobs concierge_jobs_entitlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_jobs
    ADD CONSTRAINT concierge_jobs_entitlement_id_fkey FOREIGN KEY (entitlement_id) REFERENCES public.entitlements(id) ON DELETE SET NULL;


--
-- Name: concierge_jobs concierge_jobs_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_jobs
    ADD CONSTRAINT concierge_jobs_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.ghg_inventories(id) ON DELETE CASCADE;


--
-- Name: concierge_jobs concierge_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_jobs
    ADD CONSTRAINT concierge_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: concierge_proposals concierge_proposals_job_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concierge_proposals
    ADD CONSTRAINT concierge_proposals_job_document_id_fkey FOREIGN KEY (job_document_id) REFERENCES public.concierge_job_documents(id) ON DELETE CASCADE;


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
-- Name: exiobase_sectors exiobase_sectors_display_group_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exiobase_sectors
    ADD CONSTRAINT exiobase_sectors_display_group_fkey FOREIGN KEY (display_group) REFERENCES public.sector_display_groups(heading);


--
-- Name: factor_editions factor_editions_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.factor_editions
    ADD CONSTRAINT factor_editions_superseded_by_fkey FOREIGN KEY (superseded_by) REFERENCES public.factor_editions(id) ON UPDATE CASCADE;


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
-- Name: materiality_assessment_survey_rounds materiality_assessment_survey_rounds_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessment_survey_rounds
    ADD CONSTRAINT materiality_assessment_survey_rounds_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_assessment_survey_rounds materiality_assessment_survey_rounds_round_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_assessment_survey_rounds
    ADD CONSTRAINT materiality_assessment_survey_rounds_round_fkey FOREIGN KEY (round_id, user_id) REFERENCES public.materiality_survey_rounds(id, user_id) ON DELETE RESTRICT;


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
-- Name: materiality_custom_iros materiality_custom_iros_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_custom_iros
    ADD CONSTRAINT materiality_custom_iros_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_custom_iros materiality_custom_iros_assignment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_custom_iros
    ADD CONSTRAINT materiality_custom_iros_assignment_fkey FOREIGN KEY (created_by_assignment_id, assessment_id) REFERENCES public.materiality_impact_assignments(id, assessment_id) ON DELETE RESTRICT;


--
-- Name: materiality_custom_iros materiality_custom_iros_subtopic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_custom_iros
    ADD CONSTRAINT materiality_custom_iros_subtopic_fkey FOREIGN KEY (subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: materiality_finalisation_requirements materiality_finalisation_requirements_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_finalisation_requirements
    ADD CONSTRAINT materiality_finalisation_requirements_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_finalisation_requirements materiality_finalisation_requirements_parent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_finalisation_requirements
    ADD CONSTRAINT materiality_finalisation_requirements_parent_fkey FOREIGN KEY (assessment_id, version) REFERENCES public.materiality_finalisations(assessment_id, version) ON DELETE CASCADE;


--
-- Name: materiality_finalisations materiality_finalisations_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_finalisations
    ADD CONSTRAINT materiality_finalisations_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_impact_assignee_determinations materiality_impact_assignee_determinations_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignee_determinations
    ADD CONSTRAINT materiality_impact_assignee_determinations_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_impact_assignee_determinations materiality_impact_assignee_determinations_parent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignee_determinations
    ADD CONSTRAINT materiality_impact_assignee_determinations_parent_fkey FOREIGN KEY (assessment_id, subtopic_code, axis, direction, iro_key) REFERENCES public.materiality_impact_determinations(assessment_id, subtopic_code, axis, direction, iro_key) ON DELETE CASCADE;


--
-- Name: materiality_impact_assignment_subtopics materiality_impact_assignment_subtopics_assignment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignment_subtopics
    ADD CONSTRAINT materiality_impact_assignment_subtopics_assignment_fkey FOREIGN KEY (assignment_id, assessment_id) REFERENCES public.materiality_impact_assignments(id, assessment_id) ON DELETE CASCADE;


--
-- Name: materiality_impact_assignment_subtopics materiality_impact_assignment_subtopics_round_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignment_subtopics
    ADD CONSTRAINT materiality_impact_assignment_subtopics_round_fkey FOREIGN KEY (source_round_id, user_id) REFERENCES public.materiality_survey_rounds(id, user_id) ON DELETE RESTRICT;


--
-- Name: materiality_impact_assignment_subtopics materiality_impact_assignment_subtopics_subtopic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignment_subtopics
    ADD CONSTRAINT materiality_impact_assignment_subtopics_subtopic_fkey FOREIGN KEY (subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: materiality_impact_assignments materiality_impact_assignments_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_assignments
    ADD CONSTRAINT materiality_impact_assignments_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_impact_determinations materiality_impact_determinations_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_determinations
    ADD CONSTRAINT materiality_impact_determinations_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_impact_determinations materiality_impact_determinations_assignment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_determinations
    ADD CONSTRAINT materiality_impact_determinations_assignment_fkey FOREIGN KEY (assignment_id, assessment_id) REFERENCES public.materiality_impact_assignments(id, assessment_id) ON DELETE RESTRICT;


--
-- Name: materiality_impact_determinations materiality_impact_determinations_subtopic_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_impact_determinations
    ADD CONSTRAINT materiality_impact_determinations_subtopic_fkey FOREIGN KEY (subtopic_code, standard_version) REFERENCES public.mr_esrs_subtopics(code, standard_version) ON DELETE RESTRICT;


--
-- Name: materiality_iro1 materiality_iro1_assessment_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_iro1
    ADD CONSTRAINT materiality_iro1_assessment_fkey FOREIGN KEY (assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE CASCADE;


--
-- Name: materiality_iro1 materiality_iro1_supersedes_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_iro1
    ADD CONSTRAINT materiality_iro1_supersedes_fkey FOREIGN KEY (supersedes_assessment_id, user_id) REFERENCES public.materiality_assessments(id, user_id) ON DELETE SET NULL (supersedes_assessment_id);


--
-- Name: materiality_survey_closing_comments materiality_survey_closing_comments_respondent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_closing_comments
    ADD CONSTRAINT materiality_survey_closing_comments_respondent_id_fkey FOREIGN KEY (respondent_id) REFERENCES public.materiality_survey_respondents(id) ON DELETE CASCADE;


--
-- Name: materiality_survey_closing_comments materiality_survey_closing_comments_stakeholder_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.materiality_survey_closing_comments
    ADD CONSTRAINT materiality_survey_closing_comments_stakeholder_category_fkey FOREIGN KEY (stakeholder_category) REFERENCES public.mr_stakeholder_categories(code);


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
-- Name: region_spend_conversions region_spend_conversions_edition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.region_spend_conversions
    ADD CONSTRAINT region_spend_conversions_edition_id_fkey FOREIGN KEY (edition_id) REFERENCES public.factor_editions(id) ON UPDATE CASCADE;


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
-- Name: scope3_category_snapshots scope3_category_snapshots_accepted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_category_snapshots
    ADD CONSTRAINT scope3_category_snapshots_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: scope3_category_snapshots scope3_category_snapshots_scope3_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_category_snapshots
    ADD CONSTRAINT scope3_category_snapshots_scope3_inventory_id_fkey FOREIGN KEY (scope3_inventory_id) REFERENCES public.scope3_inventories(id) ON DELETE CASCADE;


--
-- Name: scope3_category_snapshots scope3_category_snapshots_supersedes_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_category_snapshots
    ADD CONSTRAINT scope3_category_snapshots_supersedes_id_fkey FOREIGN KEY (supersedes_id) REFERENCES public.scope3_category_snapshots(id) ON DELETE SET NULL;


--
-- Name: scope3_category_snapshots scope3_category_snapshots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_category_snapshots
    ADD CONSTRAINT scope3_category_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: scope3_inventories scope3_inventories_inventory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_inventories
    ADD CONSTRAINT scope3_inventories_inventory_id_fkey FOREIGN KEY (inventory_id) REFERENCES public.ghg_inventories(id) ON DELETE CASCADE;


--
-- Name: scope3_inventories scope3_inventories_sector_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scope3_inventories
    ADD CONSTRAINT scope3_inventories_sector_fkey FOREIGN KEY (sector) REFERENCES public.exiobase_sectors(exio_code);


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
-- Name: supplier_responses supplier_responses_campaign_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_responses
    ADD CONSTRAINT supplier_responses_campaign_supplier_id_fkey FOREIGN KEY (campaign_supplier_id) REFERENCES public.campaign_suppliers(id) ON DELETE CASCADE;


--
-- Name: supply_chain_registers supply_chain_registers_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_chain_registers
    ADD CONSTRAINT supply_chain_registers_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: supply_chain_registers supply_chain_registers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supply_chain_registers
    ADD CONSTRAINT supply_chain_registers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


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

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: source_documents Users can manage own documents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own documents" ON public.source_documents TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((( SELECT auth.uid() AS uid) = id));


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
  WHERE (supplier_campaigns.buyer_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((campaign_id IN ( SELECT supplier_campaigns.id
   FROM public.supplier_campaigns
  WHERE (supplier_campaigns.buyer_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: campaign_suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_campaigns campaigns_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_delete_own ON public.supplier_campaigns FOR DELETE TO authenticated USING ((buyer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: supplier_campaigns campaigns_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_insert_own ON public.supplier_campaigns FOR INSERT TO authenticated WITH CHECK ((buyer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: supplier_campaigns campaigns_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_select_own ON public.supplier_campaigns FOR SELECT TO authenticated USING ((buyer_id = ( SELECT auth.uid() AS uid)));


--
-- Name: supplier_campaigns campaigns_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_update_own ON public.supplier_campaigns FOR UPDATE TO authenticated USING ((buyer_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((buyer_id = ( SELECT auth.uid() AS uid)));


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
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


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
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: cbam_installations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_installations ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_installations cbam_installations_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_installations_owner ON public.cbam_installations USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: cbam_operator_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_operator_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_operator_profile cbam_operator_profile_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_operator_profile_owner ON public.cbam_operator_profile USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


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
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: cbam_process_parameters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_process_parameters ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_process_parameters cbam_process_parameters_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_process_parameters_owner ON public.cbam_process_parameters USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: cbam_production_processes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_production_processes ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_production_processes cbam_production_processes_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_production_processes_owner ON public.cbam_production_processes USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


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
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


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
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: cbam_source_streams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_source_streams ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_source_streams cbam_source_streams_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_source_streams_owner ON public.cbam_source_streams USING ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))) WITH CHECK ((company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))));


--
-- Name: cbam_verifier_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cbam_verifier_access ENABLE ROW LEVEL SECURITY;

--
-- Name: cbam_verifier_access cbam_verifier_access_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cbam_verifier_access_owner ON public.cbam_verifier_access TO authenticated USING ((customer_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK (((customer_user_id = ( SELECT auth.uid() AS uid)) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_delete_own ON public.companies FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: companies companies_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_insert_own ON public.companies FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: companies companies_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_select_own ON public.companies FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: companies companies_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY companies_update_own ON public.companies FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: concierge_job_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concierge_job_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: concierge_job_documents concierge_job_documents_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY concierge_job_documents_owner_select ON public.concierge_job_documents FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.concierge_jobs j
  WHERE ((j.id = concierge_job_documents.job_id) AND (j.user_id = ( SELECT auth.uid() AS uid)) AND (j.status = 'ready'::text)))));


--
-- Name: concierge_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concierge_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: concierge_jobs concierge_jobs_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY concierge_jobs_owner_select ON public.concierge_jobs FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: concierge_proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.concierge_proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: concierge_proposals concierge_proposals_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY concierge_proposals_owner_select ON public.concierge_proposals FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.concierge_job_documents d
     JOIN public.concierge_jobs j ON ((j.id = d.job_id)))
  WHERE ((d.id = concierge_proposals.job_document_id) AND (j.user_id = ( SELECT auth.uid() AS uid)) AND (j.status = 'ready'::text)))));


--
-- Name: country_regions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.country_regions ENABLE ROW LEVEL SECURITY;

--
-- Name: country_regions country_regions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY country_regions_read ON public.country_regions FOR SELECT TO authenticated, anon USING (true);


--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_delete ON public.deals FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: deals deals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_insert ON public.deals FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: deals deals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_select ON public.deals FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: deals deals_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_update ON public.deals FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: entitlements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

--
-- Name: erasure_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.erasure_log ENABLE ROW LEVEL SECURITY;

--
-- Name: exiobase_sectors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exiobase_sectors ENABLE ROW LEVEL SECURITY;

--
-- Name: exiobase_sectors exiobase_sectors_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY exiobase_sectors_read ON public.exiobase_sectors FOR SELECT TO authenticated, anon USING (true);


--
-- Name: factor_editions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.factor_editions ENABLE ROW LEVEL SECURITY;

--
-- Name: factor_editions factor_editions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY factor_editions_read ON public.factor_editions FOR SELECT TO authenticated USING (true);


--
-- Name: ghg_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ghg_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: ghg_inventories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ghg_inventories ENABLE ROW LEVEL SECURITY;

--
-- Name: ghg_inventories ghg_inventories_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_inventories_owner ON public.ghg_inventories TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: ghg_monthly_emissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ghg_monthly_emissions ENABLE ROW LEVEL SECURITY;

--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_delete ON public.ghg_monthly_emissions FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_insert ON public.ghg_monthly_emissions FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND ((company_id IS NULL) OR (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_select ON public.ghg_monthly_emissions FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: ghg_monthly_emissions ghg_monthly_emissions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ghg_monthly_emissions_update ON public.ghg_monthly_emissions FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND ((company_id IS NULL) OR (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: materiality_assessments matassess_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_delete ON public.materiality_assessments FOR DELETE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_assessments matassess_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_insert ON public.materiality_assessments FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_assessments matassess_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_select ON public.materiality_assessments FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_assessments matassess_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matassess_update ON public.materiality_assessments FOR UPDATE TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_assessment_survey_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_assessment_survey_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_assessment_survey_rounds materiality_assessment_survey_rounds_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materiality_assessment_survey_rounds_owner ON public.materiality_assessment_survey_rounds TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_assessments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_custom_iros; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_custom_iros ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_finalisation_requirements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_finalisation_requirements ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_finalisations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_finalisations ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_impact_assignee_determinations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_impact_assignee_determinations ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_impact_assignment_subtopics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_impact_assignment_subtopics ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_impact_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_impact_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_impact_determinations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_impact_determinations ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_iro1; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_iro1 ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_closing_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_survey_closing_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_survey_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_questions materiality_survey_questions_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materiality_survey_questions_owner ON public.materiality_survey_questions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_survey_respondents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.materiality_survey_respondents ENABLE ROW LEVEL SECURITY;

--
-- Name: materiality_survey_respondents materiality_survey_respondents_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY materiality_survey_respondents_owner ON public.materiality_survey_respondents TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


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

CREATE POLICY materiality_survey_rounds_owner ON public.materiality_survey_rounds TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_custom_iros mci_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mci_owner_all ON public.materiality_custom_iros TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_finalisations mfin_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfin_owner_all ON public.materiality_finalisations TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_finalisation_requirements mfreq_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mfreq_owner_all ON public.materiality_finalisation_requirements TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_iro1 mi1_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mi1_owner_all ON public.materiality_iro1 TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_impact_assignments mia_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mia_owner_all ON public.materiality_impact_assignments TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_impact_assignee_determinations miad_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY miad_owner_all ON public.materiality_impact_assignee_determinations TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_impact_assignment_subtopics mias_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mias_owner_all ON public.materiality_impact_assignment_subtopics TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: materiality_impact_determinations mid_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mid_owner_all ON public.materiality_impact_determinations TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


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
-- Name: mr_survey_thresholds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mr_survey_thresholds ENABLE ROW LEVEL SECURITY;

--
-- Name: mr_survey_thresholds mr_survey_thresholds_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mr_survey_thresholds_read ON public.mr_survey_thresholds FOR SELECT TO authenticated, anon USING (true);


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

CREATE POLICY purchase_consents_delete ON public.purchase_consents FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: purchase_consents purchase_consents_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_consents_insert ON public.purchase_consents FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: purchase_consents purchase_consents_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_consents_select ON public.purchase_consents FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: purchase_consents purchase_consents_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_consents_update ON public.purchase_consents FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: entitlements read own entitlements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own entitlements" ON public.entitlements FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: reference_data_fingerprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reference_data_fingerprints ENABLE ROW LEVEL SECURITY;

--
-- Name: reference_data_fingerprints reference_data_fingerprints_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY reference_data_fingerprints_read ON public.reference_data_fingerprints FOR SELECT TO authenticated USING (true);


--
-- Name: region_spend_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.region_spend_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: region_spend_conversions region_spend_conversions_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY region_spend_conversions_read ON public.region_spend_conversions FOR SELECT TO authenticated USING (true);


--
-- Name: supplier_responses responses_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY responses_select_own ON public.supplier_responses FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.campaign_suppliers s
     JOIN public.supplier_campaigns c ON ((c.id = s.campaign_id)))
  WHERE ((s.id = supplier_responses.campaign_supplier_id) AND (c.buyer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_company_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_company_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_company_profile sbti_company_profile_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_delete ON public.sbti_company_profile FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_company_profile sbti_company_profile_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_insert ON public.sbti_company_profile FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_company_profile sbti_company_profile_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_select ON public.sbti_company_profile FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_company_profile sbti_company_profile_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_company_profile_update ON public.sbti_company_profile FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_cycle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_cycle ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_cycle sbti_cycle_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_delete ON public.sbti_cycle FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_cycle sbti_cycle_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_insert ON public.sbti_cycle FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_cycle sbti_cycle_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_select ON public.sbti_cycle FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_cycle sbti_cycle_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_cycle_update ON public.sbti_cycle FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_scope3_coverage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_scope3_coverage ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_delete ON public.sbti_scope3_coverage FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_insert ON public.sbti_scope3_coverage FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_select ON public.sbti_scope3_coverage FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_scope3_coverage sbti_scope3_coverage_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_scope3_coverage_update ON public.sbti_scope3_coverage FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_targets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sbti_targets ENABLE ROW LEVEL SECURITY;

--
-- Name: sbti_targets sbti_targets_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_delete ON public.sbti_targets FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_targets sbti_targets_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_insert ON public.sbti_targets FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: sbti_targets sbti_targets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_select ON public.sbti_targets FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sbti_targets sbti_targets_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sbti_targets_update ON public.sbti_targets FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND (company_id IN ( SELECT companies.id
   FROM public.companies
  WHERE (companies.user_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: scope3_category_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scope3_category_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: scope3_category_snapshots scope3_category_snapshots_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scope3_category_snapshots_owner_insert ON public.scope3_category_snapshots FOR INSERT TO authenticated WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: scope3_category_snapshots scope3_category_snapshots_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scope3_category_snapshots_owner_select ON public.scope3_category_snapshots FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: scope3_inventories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.scope3_inventories ENABLE ROW LEVEL SECURITY;

--
-- Name: scope3_inventories scope3_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY scope3_owner_all ON public.scope3_inventories USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: sector_display_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sector_display_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: sector_display_groups sector_display_groups_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sector_display_groups_read ON public.sector_display_groups FOR SELECT TO authenticated, anon USING (true);


--
-- Name: source_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.source_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_suppliers suppliers_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_delete_own ON public.campaign_suppliers FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: campaign_suppliers suppliers_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_insert_own ON public.campaign_suppliers FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: campaign_suppliers suppliers_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_select_own ON public.campaign_suppliers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: campaign_suppliers suppliers_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_update_own ON public.campaign_suppliers FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.supplier_campaigns c
  WHERE ((c.id = campaign_suppliers.campaign_id) AND (c.buyer_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: supply_chain_registers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supply_chain_registers ENABLE ROW LEVEL SECURITY;

--
-- Name: supply_chain_registers supply_chain_registers_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supply_chain_registers_owner ON public.supply_chain_registers TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_subscriptions users_own_subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_own_subscriptions ON public.user_subscriptions USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: verifier_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verifier_access ENABLE ROW LEVEL SECURITY;

--
-- Name: verifier_access verifier_access_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY verifier_access_owner ON public.verifier_access TO authenticated USING ((customer_user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((customer_user_id = ( SELECT auth.uid() AS uid)));


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
-- Name: FUNCTION impact_determination_json(p_assessment_id uuid, p_subtopic_code text, p_direction text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.impact_determination_json(p_assessment_id uuid, p_subtopic_code text, p_direction text) FROM PUBLIC;


--
-- Name: FUNCTION impact_get(p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.impact_get(p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.impact_get(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.impact_get(p_token uuid) TO authenticated;


--
-- Name: FUNCTION impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_abstained_dimensions text[], p_value_chain_position text[], p_time_horizon text, p_rationale text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_abstained_dimensions text[], p_value_chain_position text[], p_time_horizon text, p_rationale text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_abstained_dimensions text[], p_value_chain_position text[], p_time_horizon text, p_rationale text) TO anon;
GRANT ALL ON FUNCTION public.impact_save_determination(p_token uuid, p_subtopic_code text, p_direction text, p_nature text, p_scale smallint, p_scope smallint, p_irremediability smallint, p_likelihood smallint, p_abstained_dimensions text[], p_value_chain_position text[], p_time_horizon text, p_rationale text) TO authenticated;


--
-- Name: FUNCTION impact_submit(p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.impact_submit(p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.impact_submit(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.impact_submit(p_token uuid) TO authenticated;


--
-- Name: FUNCTION materiality_custom_iro_create(p_assessment_id uuid, p_subtopic_code text, p_name text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_custom_iro_create(p_assessment_id uuid, p_subtopic_code text, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_custom_iro_create(p_assessment_id uuid, p_subtopic_code text, p_name text) TO authenticated;


--
-- Name: FUNCTION materiality_custom_iro_delete(p_assessment_id uuid, p_subtopic_code text, p_iro_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_custom_iro_delete(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_custom_iro_delete(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) TO authenticated;


--
-- Name: FUNCTION materiality_custom_iro_delete_preview(p_assessment_id uuid, p_subtopic_code text, p_iro_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_custom_iro_delete_preview(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_custom_iro_delete_preview(p_assessment_id uuid, p_subtopic_code text, p_iro_key text) TO authenticated;


--
-- Name: FUNCTION materiality_finalise(p_assessment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_finalise(p_assessment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_finalise(p_assessment_id uuid) TO authenticated;


--
-- Name: FUNCTION materiality_finalise_outstanding(p_assessment_id uuid, p_standard_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_finalise_outstanding(p_assessment_id uuid, p_standard_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_finalise_outstanding(p_assessment_id uuid, p_standard_version text) TO authenticated;


--
-- Name: FUNCTION materiality_finalise_readiness(p_assessment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_finalise_readiness(p_assessment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_finalise_readiness(p_assessment_id uuid) TO authenticated;


--
-- Name: FUNCTION materiality_finalise_scope(p_assessment_id uuid, p_standard_version text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_finalise_scope(p_assessment_id uuid, p_standard_version text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_finalise_scope(p_assessment_id uuid, p_standard_version text) TO authenticated;


--
-- Name: FUNCTION materiality_impact_reassign_subtopic(p_assessment_id uuid, p_subtopic_code text, p_to_assignment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_impact_reassign_subtopic(p_assessment_id uuid, p_subtopic_code text, p_to_assignment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_impact_reassign_subtopic(p_assessment_id uuid, p_subtopic_code text, p_to_assignment_id uuid) TO authenticated;


--
-- Name: FUNCTION materiality_impact_resolve_token(p_token uuid, OUT o_assignment_id uuid, OUT o_assessment_id uuid, OUT o_user_id uuid, OUT o_company_name text, OUT o_standard_version text, OUT o_contributor_name text, OUT o_contributor_role text, OUT o_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_impact_resolve_token(p_token uuid, OUT o_assignment_id uuid, OUT o_assessment_id uuid, OUT o_user_id uuid, OUT o_company_name text, OUT o_standard_version text, OUT o_contributor_name text, OUT o_contributor_role text, OUT o_expires_at timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION materiality_lead_submit(p_assessment_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_lead_submit(p_assessment_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materiality_lead_submit(p_assessment_id uuid) TO authenticated;


--
-- Name: FUNCTION materiality_survey_counter_rows(p_round_id uuid, p_version integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_survey_counter_rows(p_round_id uuid, p_version integer) FROM PUBLIC;


--
-- Name: FUNCTION materiality_survey_intro_variant(p_labour_routing text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_survey_intro_variant(p_labour_routing text) FROM PUBLIC;


--
-- Name: FUNCTION materiality_survey_median_bounds(p_d1 integer, p_d2 integer, p_d3 integer, OUT o_low smallint, OUT o_high smallint); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_survey_median_bounds(p_d1 integer, p_d2 integer, p_d3 integer, OUT o_low smallint, OUT o_high smallint) FROM PUBLIC;


--
-- Name: FUNCTION materiality_survey_resolve_token(p_token uuid, OUT o_respondent_id uuid, OUT o_round_id uuid, OUT o_track text, OUT o_stakeholder_category text, OUT o_function_department text, OUT o_invite_name text, OUT o_questionnaire_version integer, OUT o_labour_routing text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_survey_resolve_token(p_token uuid, OUT o_respondent_id uuid, OUT o_round_id uuid, OUT o_track text, OUT o_stakeholder_category text, OUT o_function_department text, OUT o_invite_name text, OUT o_questionnaire_version integer, OUT o_labour_routing text) FROM PUBLIC;


--
-- Name: FUNCTION materiality_survey_routes_to(p_shared_with_subtopic_code text, p_topic_code text, p_labour_routing text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materiality_survey_routes_to(p_shared_with_subtopic_code text, p_topic_code text, p_labour_routing text) FROM PUBLIC;


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
-- Name: FUNCTION survey_aggregate(p_round_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.survey_aggregate(p_round_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.survey_aggregate(p_round_id uuid) TO authenticated;


--
-- Name: FUNCTION survey_get(p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.survey_get(p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.survey_get(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.survey_get(p_token uuid) TO authenticated;


--
-- Name: FUNCTION survey_respondent_progress(p_round_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.survey_respondent_progress(p_round_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.survey_respondent_progress(p_round_id uuid) TO authenticated;


--
-- Name: FUNCTION survey_save_closing_comment(p_token uuid, p_comment text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.survey_save_closing_comment(p_token uuid, p_comment text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.survey_save_closing_comment(p_token uuid, p_comment text) TO anon;
GRANT ALL ON FUNCTION public.survey_save_closing_comment(p_token uuid, p_comment text) TO authenticated;


--
-- Name: FUNCTION survey_save_free_text(p_token uuid, p_question_id uuid, p_free_text text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.survey_save_free_text(p_token uuid, p_question_id uuid, p_free_text text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.survey_save_free_text(p_token uuid, p_question_id uuid, p_free_text text) TO anon;
GRANT ALL ON FUNCTION public.survey_save_free_text(p_token uuid, p_question_id uuid, p_free_text text) TO authenticated;


--
-- Name: FUNCTION survey_save_response(p_token uuid, p_question_id uuid, p_value smallint, p_abstained boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.survey_save_response(p_token uuid, p_question_id uuid, p_value smallint, p_abstained boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.survey_save_response(p_token uuid, p_question_id uuid, p_value smallint, p_abstained boolean) TO anon;
GRANT ALL ON FUNCTION public.survey_save_response(p_token uuid, p_question_id uuid, p_value smallint, p_abstained boolean) TO authenticated;


--
-- Name: FUNCTION survey_submit(p_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.survey_submit(p_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.survey_submit(p_token uuid) TO anon;
GRANT ALL ON FUNCTION public.survey_submit(p_token uuid) TO authenticated;


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
GRANT SELECT,REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log TO authenticated;
GRANT REFERENCES,TRIGGER,MAINTAIN ON TABLE public.audit_log TO service_role;


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
-- Name: TABLE concierge_job_documents; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.concierge_job_documents TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.concierge_job_documents TO authenticated;
GRANT ALL ON TABLE public.concierge_job_documents TO service_role;


--
-- Name: TABLE concierge_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.concierge_jobs TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.concierge_jobs TO authenticated;
GRANT ALL ON TABLE public.concierge_jobs TO service_role;


--
-- Name: TABLE concierge_proposals; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.concierge_proposals TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.concierge_proposals TO authenticated;
GRANT ALL ON TABLE public.concierge_proposals TO service_role;


--
-- Name: TABLE country_regions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.country_regions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.country_regions TO authenticated;
GRANT ALL ON TABLE public.country_regions TO service_role;


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
-- Name: TABLE erasure_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.erasure_log TO service_role;


--
-- Name: TABLE exiobase_sectors; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.exiobase_sectors TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.exiobase_sectors TO authenticated;
GRANT ALL ON TABLE public.exiobase_sectors TO service_role;


--
-- Name: TABLE factor_editions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.factor_editions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.factor_editions TO authenticated;
GRANT ALL ON TABLE public.factor_editions TO service_role;


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
-- Name: TABLE materiality_assessment_survey_rounds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.materiality_assessment_survey_rounds TO authenticated;
GRANT ALL ON TABLE public.materiality_assessment_survey_rounds TO service_role;


--
-- Name: TABLE materiality_assessments; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.materiality_assessments TO anon;
GRANT SELECT,INSERT,REFERENCES,TRIGGER,MAINTAIN,UPDATE ON TABLE public.materiality_assessments TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.materiality_assessments TO service_role;


--
-- Name: TABLE materiality_custom_iros; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.materiality_custom_iros TO authenticated;
GRANT ALL ON TABLE public.materiality_custom_iros TO service_role;


--
-- Name: COLUMN materiality_custom_iros.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.materiality_custom_iros TO authenticated;


--
-- Name: COLUMN materiality_custom_iros.description; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(description) ON TABLE public.materiality_custom_iros TO authenticated;


--
-- Name: TABLE materiality_finalisation_requirements; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.materiality_finalisation_requirements TO authenticated;
GRANT ALL ON TABLE public.materiality_finalisation_requirements TO service_role;


--
-- Name: TABLE materiality_finalisations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.materiality_finalisations TO authenticated;
GRANT ALL ON TABLE public.materiality_finalisations TO service_role;


--
-- Name: TABLE materiality_impact_assignee_determinations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.materiality_impact_assignee_determinations TO authenticated;
GRANT ALL ON TABLE public.materiality_impact_assignee_determinations TO service_role;


--
-- Name: TABLE materiality_impact_assignment_subtopics; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.materiality_impact_assignment_subtopics TO authenticated;
GRANT ALL ON TABLE public.materiality_impact_assignment_subtopics TO service_role;


--
-- Name: TABLE materiality_impact_assignments; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.materiality_impact_assignments TO authenticated;
GRANT ALL ON TABLE public.materiality_impact_assignments TO service_role;


--
-- Name: TABLE materiality_impact_determinations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.materiality_impact_determinations TO authenticated;
GRANT ALL ON TABLE public.materiality_impact_determinations TO service_role;


--
-- Name: TABLE materiality_impact_subtopic_determinations; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.materiality_impact_subtopic_determinations TO authenticated;
GRANT SELECT ON TABLE public.materiality_impact_subtopic_determinations TO service_role;


--
-- Name: TABLE materiality_iro1; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.materiality_iro1 TO authenticated;
GRANT ALL ON TABLE public.materiality_iro1 TO service_role;


--
-- Name: TABLE materiality_survey_closing_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.materiality_survey_closing_comments TO service_role;


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
-- Name: TABLE mr_survey_thresholds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.mr_survey_thresholds TO anon;
GRANT SELECT ON TABLE public.mr_survey_thresholds TO authenticated;
GRANT SELECT ON TABLE public.mr_survey_thresholds TO service_role;


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
-- Name: TABLE reference_data_fingerprints; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reference_data_fingerprints TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.reference_data_fingerprints TO authenticated;
GRANT ALL ON TABLE public.reference_data_fingerprints TO service_role;


--
-- Name: TABLE region_spend_conversions; Type: ACL; Schema: public; Owner: -
--

GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.region_spend_conversions TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.region_spend_conversions TO authenticated;
GRANT ALL ON TABLE public.region_spend_conversions TO service_role;


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
-- Name: TABLE scope3_category_snapshots; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.scope3_category_snapshots TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.scope3_category_snapshots TO service_role;


--
-- Name: TABLE scope3_inventories; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.scope3_inventories TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.scope3_inventories TO authenticated;
GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.scope3_inventories TO service_role;


--
-- Name: TABLE sector_display_groups; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sector_display_groups TO anon;
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.sector_display_groups TO authenticated;
GRANT ALL ON TABLE public.sector_display_groups TO service_role;


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
-- Name: TABLE supplier_responses; Type: ACL; Schema: public; Owner: -
--

GRANT MAINTAIN ON TABLE public.supplier_responses TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,MAINTAIN,UPDATE ON TABLE public.supplier_responses TO authenticated;
GRANT ALL ON TABLE public.supplier_responses TO service_role;


--
-- Name: TABLE supply_chain_registers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supply_chain_registers TO authenticated;
GRANT ALL ON TABLE public.supply_chain_registers TO service_role;


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

\unrestrict edMjCt1q85Qc4EiDBg49hp2PwF3ZgC4Y26fZcPJH3VOVl10qa51G56YSC2aIA8M

