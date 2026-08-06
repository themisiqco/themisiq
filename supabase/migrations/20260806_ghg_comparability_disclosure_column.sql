-- ghg_inventories.comparability_disclosure — year-over-year comparability disclosure
-- ---------------------------------------------------------------------------
-- Captures a column already hand-run in the Supabase SQL editor (2026-08-06).
--
-- WHY THIS COLUMN EXISTS:
-- ISO 14064-3:2019 clause 6.3.1.5 requires the VERIFIER to determine whether changes from prior
-- periods that make the periods incomparable have been disclosed by the reporting organisation.
-- The obligation sits on the verifier; the platform's job is to make that determination possible,
-- which means the disclosure has to exist, travel with the figures, and carry enough context to be
-- weighed. Scoped in docs/item-3-comparability-disclosure.md.
--
-- Inventory-level, not a workings row: the disclosure is an attribute of the whole reporting
-- period, not of any one location, fuel or document.
--
-- NULL IS A DISTINCT AND LOAD-BEARING STATE. It means the question was never put to the customer.
-- It does NOT mean nothing changed, and it must never be defaulted to an empty object — "nobody
-- put an observation in front of them" and "they were asked and had nothing to add" are precisely
-- the two states this disclosure exists to let a verifier tell apart, and an '{}' written at save
-- collapses them. Nullable with no default for that reason (contrast coverage_resolutions, which
-- is `not null default '[]'` because an empty resolution list IS a complete answer).
--
-- The stored object carries the observation as shown to the customer, the customer's answer, and
-- the basis — which tier of evidence applied, and why the weaker one applied if it did. The
-- observation and basis are built by lib/ghg/comparability.ts (pure; no DB, no component imports).
--
-- STATUS AT TIME OF FILING: nothing writes this column yet. It is wired through the wizard's save
-- payload and load mapping (app/dashboard/ghg/page.tsx) as a pass-through, because a column absent
-- from the payload object is dropped on every save — an unwired field would erase the first real
-- disclosure on the next save, with no error. It is NOT yet in get_verifier_inventory's field
-- whitelist, so it does not reach a verifier until that RPC is changed.

alter table public.ghg_inventories
  add column if not exists comparability_disclosure jsonb;

comment on column public.ghg_inventories.comparability_disclosure is
  'Year-over-year comparability disclosure (ISO 14064-3:2019 cl. 6.3.1.5). NULL means the question was never put to the customer - not that nothing changed. Holds the observation as shown to the customer, their answer, and the detection basis at the time of answering.';
