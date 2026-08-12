-- GHG location-band enforcement (Option B). Live on production Supabase since 2026-06-18.
-- Trigger body rewritten 11 Aug 2026 — see BEHAVIOUR CHANGE below. Re-run this whole file if the
-- database is ever rebuilt.
--
-- ⚠️ BEHAVIOUR CHANGE, 11 Aug 2026: AN ACTIVE GHG PASS IS NOW REQUIRED TO WRITE
-- `ghg_inventories` AT ALL. The trigger used to ask one question — is this payload's location
-- count over the customer's ceiling — and it asked it of everyone. It now asks two, in order:
--   1. Is there a `ghg` entitlement with `term_end > now()`? No → RAISE, whatever the payload is.
--   2. Only then: is the location count over that pass's allowance?
-- So the cap is no longer a rule in its own right. It applies ON TOP OF an active pass.
--
-- ABSENCE IS NOW THE RESTRICTIVE ANSWER, AND THAT IS A DELIBERATE INVERSION. Before this change a
-- missing entitlements row produced `allowance = NULL`, NULL short-circuited the `IS NOT NULL`
-- guard, and nothing was raised — so any signed-in user with no GHG purchase could save
-- inventories with UNLIMITED locations. Not a loophole in the cap; the cap was never reached.
-- That is the same polarity trap recorded in 20260811_deals_free_tier_cap.sql, which took the
-- restrictive reading from the start. GHG now matches it: no row means not entitled means
-- refused, and an elapsed term means no longer entitled means refused. NULL still means uncapped
-- where it should — for an ACTIVE Advisory pass, read by the second query only.
--
-- THE GATE SITS ABOVE THE FAIL-OPEN BLOCK, AND THE ORDER IS LOAD-BEARING. `loc_count` is computed
-- inside `BEGIN … EXCEPTION WHEN OTHERS THEN RETURN NEW; END`, which permits the write whenever
-- `locations_data` cannot be parsed as a jsonb array. While the entitlement lookup sat below that
-- block, an unparseable payload returned early and SKIPPED THE LICENCE QUESTION ENTIRELY. Now the
-- pass is checked first, so a malformed payload can only bypass the CAP — which is a data
-- question — and never the ENTITLEMENT, which is not. Do not move the fail-open block upward.
--
-- The function also now carries `SET search_path = public, pg_catalog`, which the pre-Aug version
-- did not: a SECURITY DEFINER function without a pinned search_path resolves unqualified names
-- against the caller's path. Every table reference inside is schema-qualified as well. Both match
-- the hardening already applied to enforce_deals_free_tier_cap().

-- Link 1: allowance column. NULL = uncapped (non-GHG rows, pre-migration customers, sales-managed
-- Advisory accounts).
--
-- ⚠️ THE COMMENT BELOW WAS WRONG FOR SEVEN WEEKS AND A REBUILD WOULD HAVE PUT IT BACK. It read
-- "Starter 3 / Professional 10 / Advisory 20", which the June 2026 rescope superseded: the tier
-- is labelled Essentials in the UI, Professional moved 10 → 15, and Advisory stopped being a
-- number at all. Corrected by hand on the live database on 11 Aug 2026; corrected here so the
-- file stops being a way to reintroduce it.
--
-- VALUES DERIVED FROM lib/pricing.ts GHG_TIERS, which is the authority (CLAUDE.md: all
-- allowances derive from there). At the time of writing: starter 3, professional 15, advisory
-- null. The UI label for `starter` is "Essentials" — see the tier picker in app/pricing/page.tsx.
-- A SQL comment cannot import a constant, so this text is a COPY and copies go stale: if
-- GHG_TIERS changes, this line has to be changed too, by hand, and re-run.
ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS location_allowance integer;
COMMENT ON COLUMN entitlements.location_allowance IS
  'GHG location ceiling: Essentials 3 / Professional 15 / Advisory uncapped. NULL = uncapped.';

-- Link 5: server-side enforcement trigger on ghg_inventories.
--
-- ⚠️ VERBATIM FROM LIVE, COMMENTS INCLUDED. Read with pg_get_functiondef on 11 Aug 2026 and
-- normalised ONLY at the wrapper: `$function$` → `$$`, and the attribute clause folded onto the
-- closing line as `$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;`
-- (live spells the same setting `SET search_path TO 'public', 'pg_catalog'` — pg_get_functiondef
-- quotes it; the two are identical). The signature is left unqualified to match the trigger's own
-- `EXECUTE FUNCTION enforce_ghg_location_allowance()` below.
--
-- The comments INSIDE the body are the live function's own, not this repo's annotations — unlike
-- 20260811_deals_free_tier_cap.sql, where the live body carries none. Everything this file has to
-- add is in the header above and the KNOWN LIMITS below, so the block between $$ and $$ stays a
-- clean copy and a future pg_get_functiondef diff should come back empty.
CREATE OR REPLACE FUNCTION enforce_ghg_location_allowance()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- INSERT **OR UPDATE**, unchanged, and now doing more work than it used to. The deals cap is
-- BEFORE INSERT only because it caps the NUMBER of rows; this one caps the CONTENTS of a row, so
-- it has always had to see UPDATEs. Post-change that means an expired customer cannot edit an
-- existing inventory either, not merely create a new one — the refusal is total, by design.
DROP TRIGGER IF EXISTS trg_enforce_ghg_location_allowance ON ghg_inventories;
CREATE TRIGGER trg_enforce_ghg_location_allowance
  BEFORE INSERT OR UPDATE ON ghg_inventories
  FOR EACH ROW EXECUTE FUNCTION enforce_ghg_location_allowance();

-- ── KNOWN LIMITS OF THIS RULE (recorded, not fixed) ──
-- 1) NO CLIENT WALL EXISTS. saveInventory in app/dashboard/ghg/page.tsx is NOT gated on isPaid —
--    the only uses of `isPaid` on that page are the two PaywallOverlay blocks over steps 4-5, the
--    LockedDocUpload swaps, and one checklist label. Nothing guards the write at :1076/:1082. So
--    an unpaid or lapsed user completes the whole wizard, presses save, and meets this trigger's
--    RAISE through `alert('Save failed: ' + error.message)` — the first and only notice they get.
--    THE MESSAGES ARE WRITTEN FOR THAT, which is why the unentitled one says "Your work is still
--    on screen — purchase to save it": at the moment it is read, the browser still holds
--    everything they typed, and the sentence has to be worth reading rather than name a
--    constraint. It stops being true if they navigate away. A wall on step 1 would be better
--    than a good message at step 5; it is not built.
-- 2) THIS TRIGGER COVERS ONE TABLE. `ghg_monthly_emissions` is written directly after a
--    successful annual save (ghg/page.tsx ~:1094, delete-then-insert per inventory),
--    source-document rows and Supabase Storage uploads are separate writes, and none of the
--    three has an equivalent gate. They are reachable only after `ghg_inventories` accepts a
--    write, so today the gate above happens to shield them — but that is sequencing, not
--    enforcement, and any future path that writes them independently would be ungated.
-- 3) READS ARE UNAFFECTED, INCLUDING THE VERIFIER'S. get_verifier_inventory() is token-scoped
--    SECURITY DEFINER with no entitlement check at all, as are /api/verifier-documents and its
--    /sign sibling. An assurance provider mid-review keeps full access after the customer's term
--    ends. That may well be right — a verifier locked out by someone else's renewal is worse —
--    but it is currently unconsidered rather than decided.
