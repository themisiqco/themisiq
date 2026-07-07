-- get_verifier_inventory — capture into git + add accepted_at to the payload
-- ---------------------------------------------------------------------------
-- ⚠️ ALREADY APPLIED TO LIVE via the Supabase SQL editor on 2026-07-07. This
-- file is the GIT RECORD ONLY, so a from-scratch rebuild reproduces it.
--
-- FIRST GIT CAPTURE: get_verifier_inventory is a DB-only SECURITY DEFINER
-- function that was never in a migration (same DB-only class as verifier_access,
-- audit_log, and the supplier_documents policies). This file is its first
-- capture into the repo — the definition below is the authoritative current live
-- definition, reproduced verbatim.
--
-- WHAT THIS FUNCTION DOES: it is the token-scoped read path for the public
-- /verify/[token] verifier review page. Given an invite token it validates the
-- grant (active + unexpired), loads the linked ghg_inventories row, aggregates
-- the ghg_inventories audit_log trail, and returns it all as one jsonb. It runs
-- SECURITY DEFINER because the verifier is unauthenticated (anon) and has no
-- direct table access; search_path is pinned to 'public'.
--
-- THE ONE CHANGE vs. the prior live definition: a single new field is added to
-- the returned jsonb —
--     'accepted_at', v_access.accepted_at
-- — so the /verify/[token] consent gate can self-dismiss for a token that has
-- already accepted (accepted_at is non-null), rather than re-prompting. Nothing
-- else changed: the token-validity check, inventory lookup, audit aggregation,
-- SECURITY DEFINER, and search_path='public' are all identical to before.
--
-- DEPLOY: do NOT auto-run; already live. Kept here for repo fidelity.

begin;

CREATE OR REPLACE FUNCTION public.get_verifier_inventory(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access verifier_access%rowtype;
  v_inventory jsonb;
  v_audit jsonb;
begin
  select * into v_access from verifier_access
    where token = p_token and status = 'active' and expires_at > now();
  if not found then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;
  select to_jsonb(i) into v_inventory
    from ghg_inventories i where i.id = v_access.inventory_id;
  if v_inventory is null then
    return jsonb_build_object('error', 'inventory_not_found');
  end if;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb)
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
end; $function$;

commit;
