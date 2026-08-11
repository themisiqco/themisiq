-- supabase/migrations/20260811_deals_free_tier_cap.sql
-- Deals free-tier cap. Live on production Supabase since 2026-08-11.
-- Re-run this whole file if the database is ever rebuilt.
--
-- ⚠️ DEPENDS ON `entitlements`, WHICH HAS NO MIGRATION IN THIS REPO. This trigger reads
-- entitlements.user_id and entitlements.module_key; if the database is rebuilt from git alone,
-- that table does not exist and this file fails to create the function. Rebuild order matters.
--
-- Companion client gate: app/dashboard/deals/page.tsx. The trigger is the ENFORCEMENT; the
-- client wall only explains it earlier. If they disagree, the trigger wins and the user sees
-- the RAISE EXCEPTION message through handleSave's alert.

-- Deals free-tier cap. One saved deal without an entitlement; unlimited with one.
--
-- POLARITY IS THE OPPOSITE OF enforce_ghg_location_allowance(). There, a NULL allowance means
-- UNCAPPED — absence reads as permission, which is how every manually-invoiced GHG customer
-- silently received unlimited locations. Here the absence of an entitlements row is the
-- RESTRICTIVE answer: no row means not entitled means capped. A user who cannot be read is
-- capped, never freed.

CREATE OR REPLACE FUNCTION enforce_deals_free_tier_cap()
RETURNS TRIGGER AS $$
DECLARE
  has_entitlement boolean;
  existing_count  integer;
BEGIN
  -- Entitled → unlimited. Checked FIRST so an entitled user never pays for the count.
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'deals'
  ) INTO has_entitlement;

  IF has_entitlement THEN
    RETURN NEW;
  END IF;

  -- Unentitled: one saved deal. Counts every row this user owns — SECURITY DEFINER means the
  -- count is not filtered by the caller's RLS, so it cannot under-count and hand out a second
  -- free deal.
  SELECT count(*) INTO existing_count
  FROM public.deals d
  WHERE d.user_id = NEW.user_id;

  IF existing_count >= 1 THEN
    -- Surfaces VERBATIM to the user: handleSave does alert('Save failed: ' + error.message),
    -- so this sentence is read as-is by the person who hit the cap. It must say what happened
    -- and what to do, not name a constraint.
    RAISE EXCEPTION 'You have already saved your free deal. Unlock the Deals module to screen more targets.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- BEFORE INSERT ONLY — see the UPDATE note. This is the deliberate divergence from the GHG
-- trigger, which fires on INSERT OR UPDATE.
--
-- Firing on UPDATE would break editing outright: the unentitled user's one row already exists,
-- so existing_count = 1 at UPDATE time and every save of their own deal would be refused. The
-- GHG trigger caps the CONTENTS of a row, which an UPDATE can change; this caps the NUMBER of
-- rows, which only an INSERT can change.
DROP TRIGGER IF EXISTS trg_enforce_deals_free_tier_cap ON public.deals;
CREATE TRIGGER trg_enforce_deals_free_tier_cap
  BEFORE INSERT ON public.deals
  FOR EACH ROW EXECUTE FUNCTION enforce_deals_free_tier_cap();

-- ── KNOWN LIMITS OF THIS RULE (recorded, not fixed) ──
-- 1) DELETE is unrestricted and there is no soft-delete column, so the cap is "one saved deal
--    AT A TIME", not "one deal ever". A user can delete and screen another, indefinitely.
-- 2) A BEFORE INSERT trigger takes no lock, so two concurrent inserts from one unentitled user
--    can both read count = 0 and both succeed. A partial unique index would be airtight but
--    CANNOT express this rule — index predicates may not contain subqueries.
-- 3) The cap depends on deals_insert RLS (with check auth.uid() = user_id) remaining in place:
--    without it a client could insert under another user_id and dodge the count.

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- 1) Trigger?  select tgname, tgenabled from pg_trigger
--              where tgrelid = 'public.deals'::regclass and not tgisinternal;
-- 2) Timing?   select action_timing, event_manipulation from information_schema.triggers
--              where event_object_table = 'deals';        -- expect BEFORE / INSERT only
-- 3) Definer?  select proname, prosecdef, proconfig from pg_proc
--              where proname = 'enforce_deals_free_tier_cap';   -- prosecdef = true
