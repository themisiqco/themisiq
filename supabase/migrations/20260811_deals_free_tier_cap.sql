-- supabase/migrations/20260811_deals_free_tier_cap.sql
-- Deals free-tier cap. Live on production Supabase since 2026-08-11.
-- Re-run this whole file if the database is ever rebuilt.
--
-- ⚠️ DEPENDS ON `entitlements`, WHICH HAS NO MIGRATION IN THIS REPO. This trigger reads
-- entitlements.user_id, entitlements.module_key and entitlements.term_end; if the database is
-- rebuilt from git alone, that table does not exist and this file fails to create the function.
-- Rebuild order matters. (20260811_entitlements_definition.sql describes the table but sorts
-- alongside this file rather than before it — run that one first, by hand.)
--
-- Companion client gate: app/dashboard/deals/page.tsx. The trigger is the ENFORCEMENT; the
-- client wall only explains it earlier. If they disagree, the trigger wins and the user sees
-- the RAISE EXCEPTION message through handleSave's alert.
--
-- ⚠️ THE CLIENT GATE IS NOT YET TERM-AWARE. useEntitlementState('deals') asks only whether a row
-- EXISTS, so an expired customer still sees the unlocked screen and only meets the cap when the
-- save fails. Until that hook reads term_end, the message below is the ONLY place the expiry is
-- explained — which is why it says what happened rather than naming a constraint.

-- Deals free-tier cap. One saved deal without an ACTIVE entitlement; unlimited with one.
--
-- AN ACTIVE PASS, NOT A PRESENT ROW. The gate is `term_end > now()`, so holding a `deals` row is
-- no longer sufficient — the term behind it must not have run out. Three populations, and the
-- middle one is new:
--   active entitlement  → unlimited, returns immediately
--   EXPIRED entitlement → falls back to the SAME one-deal cap as a free user, and KEEPS every
--                         deal already saved. Nothing is deleted, hidden or downgraded; the only
--                         thing withdrawn is the right to insert more.
--   never purchased     → the original free-tier cap, unchanged
--
-- POLARITY IS THE OPPOSITE OF enforce_ghg_location_allowance(). There, a NULL allowance means
-- UNCAPPED — absence reads as permission, which is how every manually-invoiced GHG customer
-- silently received unlimited locations. Here BOTH kinds of absence are the RESTRICTIVE answer:
-- no row means never entitled means capped, and now an elapsed term means no longer entitled
-- means capped too. A user who cannot be read is capped, never freed. Note that `term_end` is
-- NOT NULL, so there is no third state to reason about — a row always has a term to compare.

-- ⚠️ THE SQL BELOW IS THE LIVE DEFINITION, VERBATIM; THE COMMENTS INSIDE IT ARE NOT. Read from
-- the running function with pg_get_functiondef on 11 Aug 2026 and normalised only to this file's
-- $$ … $$ style. The live body carries no comments, so a future pg_get_functiondef diff will
-- show the annotations below as additions — that is expected. Compare the STATEMENTS, not the
-- prose, and treat any difference in the statements as this file being stale.
CREATE OR REPLACE FUNCTION enforce_deals_free_tier_cap()
RETURNS TRIGGER AS $$
DECLARE
  has_entitlement boolean;
  had_entitlement boolean;
  existing_count  integer;
BEGIN
  -- ACTIVE entitlement → unlimited. Checked FIRST so a paying customer never pays for the two
  -- queries below. `term_end > now()` is strict: a term ending exactly now is over.
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'deals'
      AND e.term_end > now()
  ) INTO has_entitlement;
  IF has_entitlement THEN
    RETURN NEW;
  END IF;
  -- The SAME query WITHOUT the term clause, and the difference between the two is the whole
  -- point: it separates "expired" from "never bought", which is a distinction only the customer
  -- can act on. Told the wrong one, a lapsed customer is invited to buy something they already
  -- own, and a free user is told to renew a term they never had.
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'deals'
  ) INTO had_entitlement;
  -- Counts every row this user owns — SECURITY DEFINER means the count is not filtered by the
  -- caller's RLS, so it cannot under-count and hand out a second free deal.
  SELECT count(*) INTO existing_count
  FROM public.deals d
  WHERE d.user_id = NEW.user_id;
  IF existing_count >= 1 THEN
    -- BOTH SENTENCES SURFACE VERBATIM: handleSave does alert('Save failed: ' + error.message),
    -- so each is read as-is by the person who hit the cap. They must say what happened and what
    -- to do, not name a constraint.
    IF had_entitlement THEN
      -- SAYS ONLY WHAT STAYS TRUE. This sentence used to close with "— your saved deals are still
      -- here", which was accurate when read and then routed the customer at the one action that
      -- falsifies it: deleting a saved deal is their only way to screen another (KNOWN LIMITS 4),
      -- and nothing soft-deletes or warns. A reassurance whose most likely next click destroys the
      -- thing it names is worse than no reassurance, so it was dropped rather than reworded.
      RAISE EXCEPTION 'Your Deals access has expired. Renew to screen more targets.';
    ELSE
      RAISE EXCEPTION 'You have already saved your free deal. Unlock the Deals module to screen more targets.';
    END IF;
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
-- 4) AN EXPIRED CUSTOMER CAN DELETE A SAVED DEAL AND INSERT A FRESH ONE, INDEFINITELY. Read off
--    the body rather than assumed: nothing in the expired branch counts differently. Both
--    populations reach the same `SELECT count(*) FROM public.deals WHERE user_id = NEW.user_id`,
--    and `IF existing_count >= 1` is the only thing standing between them and an insert — so a
--    customer who deletes down to zero passes it. `had_entitlement` chooses the WORDING of the
--    refusal; it never changes WHETHER one happens. Limit 1 applied to free users; it applies
--    identically to expired ones, which makes an expired term a rolling one-deal-at-a-time
--    licence rather than a stop.
--    THE COPY HAS BEEN TRIMMED BECAUSE OF THIS LIMIT. The expired message used to close with
--    "— your saved deals are still here". Accurate at the moment it was read, and immediately
--    undone by the only action it left the customer: deleting a saved deal to make room. The
--    clause was removed rather than reworded, because no wording survives pointing someone at
--    the one click that falsifies it. The message now promises nothing about retention.
--    RESTORING THE REASSURANCE NEEDS A SOFT-DELETE COLUMN OR A DELETE-TIME CONFIRMATION FIRST,
--    and it is NOT a change to this function either way: this trigger fires on INSERT and never
--    sees the DELETE that preceded it. Put the promise back only once something makes it hold.

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- 1) Trigger?  select tgname, tgenabled from pg_trigger
--              where tgrelid = 'public.deals'::regclass and not tgisinternal;
-- 2) Timing?   select action_timing, event_manipulation from information_schema.triggers
--              where event_object_table = 'deals';        -- expect BEFORE / INSERT only
-- 3) Definer?  select proname, prosecdef, proconfig from pg_proc
--              where proname = 'enforce_deals_free_tier_cap';   -- prosecdef = true
