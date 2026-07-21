-- 20260721_cbam_see_records_default_share.sql
--
-- Adds the default-value share to cbam_see_records: "the share of embedded emissions for which
-- default values were used." This implements IR (EU) 2025/2547 Annex IV reporting item §1.2 (4)(b),
-- which is WORD-FOR-WORD identical to §1.1 item 15(d). The value is computed by
-- lib/cbam/defaultShare.ts (computeDefaultShare) from computeSEE's per-precursor resolutions map —
-- the SAME resolution results the SEE figures were built from, so the share and the SEE cannot
-- diverge.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- THE METHODOLOGY IS A DOCUMENTED ThemisIQ CHOICE, NOT REGULATORY TEXT.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- All four parts of Annex IV were extracted verbatim (§1.1, §1.1.1, §1.2, §2). NONE of them states a
-- denominator, a unit, or a leg-scope (direct / indirect / both) for "the share". Every such choice
-- below is ours. See lib/cbam/defaultShare.ts's header for the full reasoning.
--
--   • Stored as a FRACTION in [0,1], NOT a percentage. A percentage invites a stray ×100 and
--     double-scaling at a boundary; the presentation layer multiplies by 100 to render.
--   • Two legs are stored. Item (4)(b) maps to the DIRECT figure (default_share_direct); the indirect
--     figure is carried alongside. That (4)(b)→direct mapping is INFERENCE, not text — see the
--     defaultShare.ts header for why ((4)(a) says "direct", (4)(c) says "share of indirect", so the
--     drafter qualifies a leg when they mean one; (4)(b) omits it, a contrast we read as "direct").
--
-- NULLABLE, and DELIBERATELY WITHOUT A STATUS COLUMN — unlike sefa_status. The two nulls are not the
-- same kind of thing. A null SEFA means "undeterminable, CSCF pending": a blocked computation
-- awaiting an external regulatory input, which sefa_status records. A null share means only "zero
-- denominator" — the leg had no embedded emissions to take a ratio against. That is arithmetic, not a
-- pending dependency: nothing is being awaited, nothing will later unblock it. A status column here
-- would be ceremony without content, so there is none.
--
-- The [0,1] CHECK is a TRIPWIRE, not validation. By construction the numerator (the default-resolved
-- precursors' contribution) is a strict subset of the denominator (the leg's embedded emissions), so
-- the ratio is always in [0,1]. A value outside that range does not mean "bad input" — it means an
-- engine invariant has broken upstream, and we would rather fail loud on write than persist a figure
-- that a verifier could not reconcile.
--
-- This migration makes no claim about deployment state; it is the schema change only.

alter table public.cbam_see_records
  add column if not exists default_share_direct numeric
    check (default_share_direct is null or (default_share_direct >= 0 and default_share_direct <= 1)),
  add column if not exists default_share_indirect numeric
    check (default_share_indirect is null or (default_share_indirect >= 0 and default_share_indirect <= 1));
