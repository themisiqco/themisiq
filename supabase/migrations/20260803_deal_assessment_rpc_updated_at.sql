-- supabase/migrations/20260803_deal_assessment_rpc_updated_at.sql
-- Adds `updated_at` to deal_assessment_get — the EIGHTH field on the target-facing whitelist.
--
-- WHY THE WHITELIST GROWS. The share page prices a target's obligations from the `frameworks`
-- jsonb column, which is a SNAPSHOT written at the deal's last save, not a live calculation. A
-- reader had no way to tell how old that snapshot was, so a figure worked out months ago and one
-- worked out this morning were presented identically. Dating it is the whole fix: the page can now
-- say the assessment reflects the figures held on a stated date, and that a fresher one may differ.
--
-- The alternative — recomputing on read — is deliberately NOT taken. revenue, currency,
-- employee_count and total_assets are all excluded from this whitelist, so a recompute could only
-- redo the jurisdiction- and sector-derived rules and would have to keep the snapshot for SB 253,
-- SECR and every multi-limb test. That produces a hybrid, half live and half stored, with nothing
-- on the page able to tell the reader which half is which. A dated snapshot is honest; a hybrid
-- that cannot explain itself is not.
--
-- PRIVACY REVIEW (the header of 20260702 requires one before any field is added):
--   • Adds no fact about the DEAL. Not revenue, deal_value, deal_type, currency or notes — every
--     FO-internal economic field stays excluded, and this migration does not touch that list.
--   • The date describes the DOCUMENT the reader is already holding, and the reader is the party
--     that document is about. It tells them when it was authored, which is what they need to judge
--     whether to rely on it.
--   • Timing signal: a reader refreshing the page could observe that the assessment was re-saved.
--     That is information about their own assessment changing, which they are entitled to see —
--     and is the point of showing it.
--   • Returned as the raw timestamptz, NOT cast to ::date here. A ::date cast runs in the server's
--     timezone, so a deal saved at 21:00 EDT would date as the NEXT DAY on an outward-facing
--     document — the same UTC-vs-local defect lib/filename.ts documents. The page renders it
--     date-only in the reader's own locale instead.
--
-- WHY updated_at IS THE RIGHT COLUMN. It is exactly when `frameworks` was written:
-- handleSave writes both in one row payload, toggleShare updates share_enabled ALONE and never
-- touches it, and public.deals has no moddatetime trigger (updated_at is a column DEFAULT). So the
-- timestamp cannot drift away from the snapshot it dates.
--
-- SECURITY BOUNDARY IS OTHERWISE UNCHANGED: same token + share_enabled gate, same explicit
-- jsonb_build_object whitelist, same RAISE on an invalid/unshared/revoked token, and the deals
-- TABLE is still never granted to anon.
--
-- DEPENDS ON 20260702_deal_assessment_rpc.sql (the function this replaces).
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

-- Least privilege: unchanged from 20260702 — only the public read roles may execute.
REVOKE ALL ON FUNCTION public.deal_assessment_get(text) FROM public;
GRANT EXECUTE ON FUNCTION public.deal_assessment_get(text) TO anon, authenticated;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) Still SECURITY DEFINER:
--    select proname, prosecdef from pg_proc where proname = 'deal_assessment_get';  -- prosecdef = t
-- 2) anon can still execute:
--    select has_function_privilege('anon', 'public.deal_assessment_get(text)', 'execute');  -- t
-- 3) anon still has NO direct privilege on the deals table:
--    select privilege_type from information_schema.role_table_grants
--    where table_name = 'deals' and grantee = 'anon';   -- expect ZERO rows
-- 4) The response carries exactly 8 keys, and none of them is an economic field:
--    select jsonb_object_keys(public.deal_assessment_get(
--             (select token from public.deals where share_enabled limit 1)));
--    -- expect: target_name, sector, jurisdiction, location_count, frameworks,
--    --         has_ghg_data, has_esg_report, updated_at
