-- supabase/migrations/20260702_deal_assessment_rpc.sql
-- Build C2 — public target-facing read path for the Deals shareable link.
--
-- Mirrors the AUDITED supplier-portal RPC pattern (20260619_supplier_portal_rpcs.sql):
-- a token-scoped SECURITY DEFINER function is the ONLY way an unauthenticated (anon) party
-- reaches a deal row. RLS on public.deals (from 20260701_deals_table.sql) stays ON, and the
-- deals TABLE is NEVER granted to anon — access is exclusively through this function.
--
-- SECURITY BOUNDARY (non-negotiable — this is the public boundary):
--   • Gated on token = p_token AND share_enabled = true. Sharing is opt-in and revocable
--     (owner flips share_enabled back to false → the token immediately reads as invalid).
--   • Returns ONLY target-safe columns: target_name, sector, jurisdiction, location_count,
--     frameworks, has_ghg_data, has_esg_report.
--     It NEVER returns deal_value, revenue, notes, deal_type, currency, user_id, id, token,
--     or share_enabled. FO-internal deal economics must never reach the response — the
--     whitelist below is explicit; we deliberately do NOT to_jsonb(d).
--   • Invalid / unshared / revoked token → RAISE EXCEPTION (no row, no leak) — same shape
--     as portal_get, so callers can't distinguish "bad token" from "sharing disabled".
--
-- DEPENDS ON 20260701_deals_table.sql + 20260701_deals_location_count.sql (table + columns).
-- Re-runnable: CREATE OR REPLACE + REVOKE/GRANT are idempotent.

CREATE OR REPLACE FUNCTION public.deal_assessment_get(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
           'has_esg_report', d.has_esg_report)
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

-- Least privilege: only the public read roles may execute; the deals TABLE is never
-- granted to anon, so this function is the sole anon access path (mirrors portal_get).
REVOKE ALL ON FUNCTION public.deal_assessment_get(text) FROM public;
GRANT EXECUTE ON FUNCTION public.deal_assessment_get(text) TO anon, authenticated;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) Function is SECURITY DEFINER:
--    select proname, prosecdef from pg_proc where proname = 'deal_assessment_get';  -- prosecdef = t
-- 2) anon can execute the function:
--    select has_function_privilege('anon', 'public.deal_assessment_get(text)', 'execute');  -- t
-- 3) anon has NO direct privilege on the deals table (the whole point):
--    select privilege_type from information_schema.role_table_grants
--    where table_name = 'deals' and grantee = 'anon';   -- expect ZERO rows
