-- Supplier-Portal hardening — FILE 2 of 2. DEPLOY ORDER: RUN THIS LAST.
-- WARNING: running this BEFORE the new code is deployed WILL BREAK the public
-- supplier portal (/supplier/[token]) and the campaigns/supplier-invite API
-- routes, because it removes anon's direct access to these tables. Run only
-- after 20260619_supplier_portal_rpcs.sql AND the app code (RPC calls +
-- bearer-authenticated API routes) are live.
-- Re-runnable: enable-RLS is a no-op if already on, indexes use IF NOT EXISTS,
-- and every policy is DROP-then-CREATE so the file is safe to re-run.
--
-- Source of truth for intent: docs/supplier-portal-rls-remediation.md (Part A).

-- ── Enable RLS on all three tables ────────────────────────────────────
ALTER TABLE supplier_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_suppliers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_responses  ENABLE ROW LEVEL SECURITY;
-- service_role (BYPASSRLS) still bypasses these — intended for any service-role
-- server route. The browser anon/authenticated clients do not.

-- Helpful index for the EXISTS checks below (campaign_id may be unindexed).
-- supplier_responses(campaign_supplier_id, question_id) unique index already
-- exists from the schema migration and covers the responses checks.
CREATE INDEX IF NOT EXISTS campaign_suppliers_campaign_id_idx
  ON campaign_suppliers (campaign_id);

-- ── supplier_campaigns: buyer owns the row ────────────────────────────
DROP POLICY IF EXISTS campaigns_select_own ON supplier_campaigns;
CREATE POLICY campaigns_select_own ON supplier_campaigns
  FOR SELECT TO authenticated USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS campaigns_insert_own ON supplier_campaigns;
CREATE POLICY campaigns_insert_own ON supplier_campaigns
  FOR INSERT TO authenticated WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS campaigns_update_own ON supplier_campaigns;
CREATE POLICY campaigns_update_own ON supplier_campaigns
  FOR UPDATE TO authenticated USING (buyer_id = auth.uid())
                              WITH CHECK (buyer_id = auth.uid());

DROP POLICY IF EXISTS campaigns_delete_own ON supplier_campaigns;
CREATE POLICY campaigns_delete_own ON supplier_campaigns
  FOR DELETE TO authenticated USING (buyer_id = auth.uid());

-- ── campaign_suppliers: scoped through the owning campaign ─────────────
DROP POLICY IF EXISTS suppliers_select_own ON campaign_suppliers;
CREATE POLICY suppliers_select_own ON campaign_suppliers
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM supplier_campaigns c
            WHERE c.id = campaign_suppliers.campaign_id
              AND c.buyer_id = auth.uid()));

DROP POLICY IF EXISTS suppliers_insert_own ON campaign_suppliers;
CREATE POLICY suppliers_insert_own ON campaign_suppliers
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM supplier_campaigns c
            WHERE c.id = campaign_id            -- the row being inserted
              AND c.buyer_id = auth.uid()));

DROP POLICY IF EXISTS suppliers_update_own ON campaign_suppliers;
CREATE POLICY suppliers_update_own ON campaign_suppliers
  FOR UPDATE TO authenticated
    USING      (EXISTS (SELECT 1 FROM supplier_campaigns c
                        WHERE c.id = campaign_suppliers.campaign_id
                          AND c.buyer_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM supplier_campaigns c
                        WHERE c.id = campaign_suppliers.campaign_id
                          AND c.buyer_id = auth.uid()));

DROP POLICY IF EXISTS suppliers_delete_own ON campaign_suppliers;
CREATE POLICY suppliers_delete_own ON campaign_suppliers
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM supplier_campaigns c
            WHERE c.id = campaign_suppliers.campaign_id
              AND c.buyer_id = auth.uid()));

-- ── supplier_responses: scoped through supplier -> campaign ───────────
-- Buyers only READ responses (export). All response WRITES happen via the
-- SECURITY DEFINER RPCs in file 1, so no authenticated insert/update here.
DROP POLICY IF EXISTS responses_select_own ON supplier_responses;
CREATE POLICY responses_select_own ON supplier_responses
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM campaign_suppliers s
            JOIN supplier_campaigns c ON c.id = s.campaign_id
            WHERE s.id = supplier_responses.campaign_supplier_id
              AND c.buyer_id = auth.uid()));

-- No policy mentions `anon`: after this runs, the anon role can read/write
-- NOTHING on these tables directly. The public portal goes exclusively through
-- the token-scoped functions created in 20260619_supplier_portal_rpcs.sql.
