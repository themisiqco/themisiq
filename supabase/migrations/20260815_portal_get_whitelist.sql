-- 20260815_portal_get_whitelist.sql
--
-- Closes a live data leak in public.portal_get: it returned to_jsonb(s) and
-- to_jsonb(c), handing EVERY column of campaign_suppliers and supplier_campaigns
-- to an unauthenticated caller. Replaced with explicit jsonb_build_object
-- whitelists.
--
-- ADD A FIELD TO EITHER WHITELIST ONLY AFTER A PRIVACY REVIEW. Do NOT reintroduce
-- to_jsonb(s) / to_jsonb(c) — that is the defect this file exists to remove, and
-- it re-leaks every column added to either table from that day forward, silently.
-- Same rule, same wording, as deal_assessment_get (20260702_deal_assessment_rpc.sql).
--
--
-- WHY THIS WENT UNNOTICED FOR NEARLY TWO MONTHS  ← the part a future reader needs
--
-- The June review DID reason about scope. Its own comment, still sitting above the
-- function in 20260619_supplier_portal_rpcs.sql and repeated in
-- docs/supplier-portal-rls-remediation.md, reads:
--
--     "Definer = bypasses RLS, but only ever returns the single row whose token
--      was supplied."
--
-- That claim is TRUE. It was true when written, it is still true, and it was never
-- the problem. The review asked which ROWS the definer function could reach and
-- answered it correctly. Nobody asked which COLUMNS of that row it handed back.
--
-- A SECURITY DEFINER function has two independent scopes. Row scope is the WHERE
-- clause; column scope is the projection. Getting the first one right says nothing
-- about the second, and a correct-sounding sentence about the first is exactly what
-- stops a reviewer looking at the second. Two weeks later deal_assessment_get was
-- written with the column half stated explicitly ("Do NOT to_jsonb(d) — that would
-- leak every column") — but nobody went back to the function that pattern was
-- copied FROM.
--
-- So: when reviewing any token-scoped definer function in this repo, answer both
-- questions out loud. Which rows, AND which columns. A whitelist is the answer to
-- the second, and it is only an answer while it stays a whitelist.
--
--
-- WHAT WAS BEING RETURNED AND IS NOT ANY MORE
--
-- From campaign_suppliers (8 of 12 columns dropped):
--   annual_spend      THE ONE THAT MATTERS. This is the BUYER'S PRIVATE COMMERCIAL
--                     FIGURE FOR THAT SUPPLIER — what the buyer believes they spend
--                     with them annually — typed into an inline field on the buyer's
--                     own campaign screen (app/dashboard/supply-chain/portal/[id]),
--                     a field the supplier was never meant to see. It feeds the
--                     spend-based gap-fill in the Scope 3 Cat 1 bridge. It went to
--                     the supplier's browser on every single portal load.
--   spend_currency    Denomination of that same private figure. Leaks the basis even
--                     on rows where the amount itself is null.
--   id                Internal PK; also the buyer-side route key
--                     (/portal/[id]/supplier/[supplierId]). The respondent's only
--                     legitimate handle is their token.
--   campaign_id       Internal FK. No reason to hand an anon caller a live campaign
--                     UUID.
--   token             The caller already holds it — it is in their URL. Echoing it
--                     back only copies a credential into a second place.
--   invited_at        Buyer-side operational timestamp.
--   completed_at      Unused; the page derives submitted-ness from status alone.
--   reminder_sent_at  The buyer's chasing cadence — tells the supplier how many
--                     times they have been nagged.
--
-- From supplier_campaigns (7 of 10 columns dropped):
--   buyer_id          A raw auth.users UUID. Directly identifies a ThemisIQ account
--                     to an unauthenticated caller.
--   description       The buyer's internal campaign notes. Free text, never written
--                     for supplier eyes.
--   reporting_year    The buyer's own inventory year. The questionnaire asks the
--                     supplier for THEIR year as a separate question.
--   status            Campaign lifecycle. Unused, and would collide conceptually
--                     with supplier.status, which the page DOES branch on.
--   created_at        Buyer-side operational timestamp.
--   id                Internal PK / buyer-side route key.
--   buyer_company     Deliberately OUT. The portal never reads it — its only
--                     consumer is app/api/supplier-invite/route.ts:213, a bearer-
--                     authenticated server route that does not call this function.
--                     The supplier sees the buyer's name in the INVITE EMAIL, not on
--                     the page; the portal header renders campaign.name only. If a
--                     "Requested by <buyer>" header line is wanted later, that is a
--                     UX change and the column gets added alongside it — not
--                     pre-emptively here, because "return a field nothing reads" is
--                     the habit that produced to_jsonb in the first place.
--
--
-- ⚠️ THE SCHEMA FILE IS INCOMPLETE — DO NOT TRUST IT AS THE COLUMN LIST
--
-- supabase/migrations/20260618_supplier_portal_schema.sql says so itself
-- ("Reconstructed from application code (not a live DB dump)"), and it is missing
-- two columns confirmed present live via information_schema on 15 Aug 2026:
--
--   campaign_suppliers.invited_at      (read by the buyer dashboard: .order('invited_at')
--                                       and the Invited column — so it is load-bearing,
--                                       not vestigial)
--   supplier_campaigns.buyer_company   (read by app/api/supplier-invite/route.ts:213)
--
-- The full LIVE column lists, for anyone auditing this whitelist:
--   campaign_suppliers: id, campaign_id, supplier_name, supplier_email, contact_name,
--                       token, status, invited_at, completed_at, reminder_sent_at,
--                       annual_spend, spend_currency
--   supplier_campaigns: id, buyer_id, name, description, reporting_year, status,
--                       deadline, created_at, questionnaire_template, buyer_company
--
-- Reconcile against information_schema, not against the schema migration, before
-- concluding anything about what this function does or does not expose.
--
--
-- CONSUMER AUDIT (why this whitelist is safe to apply)
--
-- Exactly ONE caller in the repo: app/supplier/[token]/page.tsx:30. No API route, no
-- server component, no test. It reads seven fields in total, all of which are kept:
--   supplier.status                  :43   gates the submitted screen
--   supplier.supplier_name           :105, :140
--   supplier.supplier_email          :105
--   supplier.contact_name            :141
--   campaign.questionnaire_template  :40    selects the question set
--   campaign.name                    :103, :123
--   campaign.deadline                :142
-- Line 58 guards on the supplier object's truthiness, not on any column;
-- jsonb_build_object always returns an object, so that guard is unaffected. The write
-- path re-sends p_token from the URL and never needs supplier.id.
--
--
-- SCOPE — ONE CONCERN. Everything else is byte-identical to the June definition:
-- the 'invited' -> 'in_progress' side effect, the "invalid token" RAISE and its
-- no_data_found errcode, the responses array (already whitelisted to question_id +
-- response), SECURITY DEFINER, SET search_path = public, and the signature.
--
-- GRANTS ARE NOT RE-EMITTED, AND THAT IS DELIBERATE. CREATE OR REPLACE FUNCTION
-- preserves the existing ownership and privileges when the signature is unchanged,
-- so the anon/authenticated EXECUTE grants from 20260619_supplier_portal_rpcs.sql
-- survive this file untouched. Re-emitting them would be a second concern and would
-- risk restating them wrongly. Verify step 2 below confirms they are still in place.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable (CREATE OR
-- REPLACE). It is a pure narrowing of the response — no client change is needed and
-- none is shipped with it, so it can be applied to live independently of a deploy.
--
-- KNOWN FOLLOW-UPS, NOT DONE HERE (each its own change):
--   • docs/supplier-portal-rls-remediation.md:98-127 still carries a verbatim copy of
--     the OLD to_jsonb body. After this lands, that doc shows the pre-fix version as
--     though current. Anyone copying from it reintroduces the leak.
--   • There is no test guarding this whitelist. lib/ghg/verifierWhitelist.test.ts
--     exists for exactly this reason on the verifier surface; the supplier portal has
--     no test file at all.

CREATE OR REPLACE FUNCTION public.portal_get(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) Still SECURITY DEFINER:
--    select proname, prosecdef from pg_proc where proname = 'portal_get';  -- prosecdef = t
-- 2) Grants survived CREATE OR REPLACE (nothing above re-emits them):
--    select has_function_privilege('anon', 'public.portal_get(text)', 'execute');           -- t
--    select has_function_privilege('authenticated', 'public.portal_get(text)', 'execute');  -- t
-- 3) The leak is gone. Against a real token, on a supplier row that HAS a spend
--    recorded (pick one from the buyer dashboard, or set one first):
--    select public.portal_get('<real token>');
--    -- expect exactly 3 supplier keys, exactly 3 campaign keys, and:
--    select public.portal_get('<real token>') -> 'supplier'  ? 'annual_spend';  -- f
--    select public.portal_get('<real token>') -> 'supplier'  ? 'token';         -- f
--    select public.portal_get('<real token>') -> 'campaign'  ? 'buyer_id';      -- f
-- 4) The portal still works — the seven fields it reads are all present:
--    select public.portal_get('<real token>') -> 'supplier' ? 'supplier_name'          -- t
--       and public.portal_get('<real token>') -> 'campaign' ? 'questionnaire_template';-- t
-- 5) Unchanged behaviour: a bad token still raises, it does not return null:
--    select public.portal_get('garbage');  -- ERROR: invalid token
-- 6) End-to-end, in the browser: open a real /supplier/<token> link. Expect the
--    campaign name in the dark header, "Completing as: <name> · <contact> · Deadline:
--    <date>", the correct question set for the campaign's template, and any previously
--    saved answers still filled in. Then change one answer and reload to confirm the
--    save path is unaffected.
