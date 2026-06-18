-- GHG location-band enforcement (Option B). Live on production Supabase since 2026-06-18.
-- Re-run this whole file if the database is ever rebuilt.

-- Link 1: allowance column. NULL = uncapped (non-GHG rows, pre-migration customers, sales-managed 20+).
ALTER TABLE entitlements
  ADD COLUMN IF NOT EXISTS location_allowance integer;
COMMENT ON COLUMN entitlements.location_allowance IS
  'GHG location ceiling: Starter 3 / Professional 10 / Advisory 20. NULL = uncapped.';

-- Link 5: server-side enforcement trigger on ghg_inventories.
CREATE OR REPLACE FUNCTION enforce_ghg_location_allowance()
RETURNS TRIGGER AS $$
DECLARE
  allowance integer;
  loc_count integer;
BEGIN
  BEGIN
    loc_count := jsonb_array_length(NEW.locations_data);
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  SELECT e.location_allowance INTO allowance
  FROM entitlements e
  WHERE e.user_id = NEW.user_id AND e.module_key = 'ghg'
  LIMIT 1;
  IF allowance IS NOT NULL AND loc_count > allowance THEN
    RAISE EXCEPTION 'Location limit reached for your plan (% of % allowed). Upgrade to add more locations.', loc_count, allowance;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_ghg_location_allowance ON ghg_inventories;
CREATE TRIGGER trg_enforce_ghg_location_allowance
  BEFORE INSERT OR UPDATE ON ghg_inventories
  FOR EACH ROW EXECUTE FUNCTION enforce_ghg_location_allowance();
