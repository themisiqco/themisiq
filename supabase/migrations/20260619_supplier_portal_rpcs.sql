-- Supplier-Portal hardening — FILE 1 of 2. DEPLOY ORDER: RUN THIS FIRST.
-- Safe to run while the OLD code is still live: it only ADDS token-scoped
-- SECURITY DEFINER functions for the public portal; it does not lock anything.
-- (The companion file 20260619_supplier_portal_rls.sql enables RLS and MUST be
--  run LAST, only after the code that calls these functions has shipped.)
-- Re-runnable: every statement is idempotent (CREATE OR REPLACE + revoke/grant).
--
-- Source of truth for intent: docs/supplier-portal-rls-remediation.md (Part B).

-- gen_random_bytes()/gen_random_uuid() etc. live in pgcrypto (no-op if present).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Look up the one supplier row + its campaign + existing responses by token,
-- and flip 'invited' -> 'in_progress' on first touch. Definer = bypasses RLS,
-- but only ever returns the single row whose token was supplied.
CREATE OR REPLACE FUNCTION public.portal_get(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  SELECT jsonb_build_object(
           'supplier',  to_jsonb(s),
           'campaign',  to_jsonb(c),
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

-- Upsert a single answer, scoped by token; refuse once submitted.
CREATE OR REPLACE FUNCTION public.portal_save_response(
  p_token text, p_section text, p_question_id text, p_response text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- Final submit, scoped by token.
CREATE OR REPLACE FUNCTION public.portal_submit(p_token text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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

-- Least privilege on the functions: only the portal roles may execute.
REVOKE ALL ON FUNCTION public.portal_get(text)                          FROM public;
REVOKE ALL ON FUNCTION public.portal_save_response(text,text,text,text) FROM public;
REVOKE ALL ON FUNCTION public.portal_submit(text)                       FROM public;
GRANT EXECUTE ON FUNCTION public.portal_get(text)                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_save_response(text,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_submit(text)                       TO anon, authenticated;
