# ThemisIQ — Pricing & Concierge Spec v4
_Reconstructed and decided June 14, 2026. Source of truth for the June 21 launch build._

## Pricing architecture: one principle

Price on the axis that drives **our** cost for that thing.
- Six analysis modules (Climate Risk, Supply Chain, Deals, AI Governance, People, Cyber):
  software scales for free → **uniform per-module pricing, no location bands.**
- GHG is the sole exception: it has two cost drivers the others don't —
  per-location complexity AND optional per-location human review labor (concierge).

Evidence reviewed (June 14): Supply Chain's `scoreSupplier` is a pure function;
suppliers self-serve or bulk CSV-import; zero marginal labor cost to us. It scales
like software, NOT like GHG concierge. GHG genuinely stands alone. We deliberately
do NOT band Supply Chain (or any of the six) — that was the rejected "Path C" trap.

## Module pricing (unchanged, all 7 modules)

| Tier         | Price        | Buys (escalating service) |
|--------------|--------------|---------------------------|
| Starter      | $999/mo·yr   | core reports, 1 user      |
| Professional | $2,499/mo·yr | all frameworks, more orgs |
| Advisory     | $4,999/mo·yr | + expert guidance         |

(Starter confirmed: 1 user.)

## GHG location allowances (Model A — hard enforcement)

| Tier         | Location allowance |
|--------------|--------------------|
| Starter      | up to 3 locations  |
| Professional | up to 10 locations |
| Advisory     | up to 20 locations |
| 20+          | contact us for custom pricing |

Rules:
- Adding a location beyond tier → "upgrade to [next tier]" wall (Claude-style soft wall + upgrade CTA).
- No auto-downgrade. Location count is a CEILING, not a downward driver — Pro/Advisory
  keep their feature value even at 1–2 locations.
- Labor reality basis: 15 min of human review per location per reporting year.

## Concierge add-on (requires `ghg`) — Resolution X

Priced on the customer's ACTUAL location count, independent of their module tier.
The system reads location count and offers the matching concierge tier automatically;
the customer only ever sees their one correct price (no "two ladders" confusion).

| Concierge tier | Locations | Price        |
|----------------|-----------|--------------|
| Basic          | ≤ 5       | $799         |
| Standard       | 6–15      | $1,499       |
| Enterprise     | 16+       | custom quote (admin create-invoice route) |

Why distinct from module bands: concierge is OUR labor (15 min/location). Forcing it
to match module bands (3/10/20) would price labor on the software axis and re-open the
drowning case (20 locations = 5 hrs of review at a flat price — the Blue Sky case).
The 16+ custom-quote band exists specifically to price big jobs to cover a hire.

Concierge service design (locked, prior sessions):
- Per reporting year. 5 fuels: electricity, natural gas, propane, diesel (stationary+mobile), gasoline.
- Pipeline (ALREADY BUILT in app/dashboard/ghg/page.tsx, gated behind `CONCIERGE_DEV`):
  upload → /api/concierge/extract (Anthropic, model now claude-opus-4-8) →
  convertToCanonical (lib/unitConversions.ts, Tier 1/2/3 cascade) →
  proposal w/ status → per-proposal confirm sums into inventory fields (mixed-unit safe) →
  export gate blocks while any proposal 'extracted' or 'needs_manual_review'.
- Liability model: AI extracts → WE review for quality → CUSTOMER accepts each figure
  (with source quote + conversion note visible) in a SINGLE BATCH → acceptance persisted
  (timestamp + user) → totals fill inventory → export unlocks. Customer always owns the number.

## Enforcement

Hard, both layers:
- Client-side: upgrade wall in the GHG wizard when location count exceeds tier.
- Server-side: save/export API rejects over-limit (can't be bypassed). This is the real gate.

## Entitlement / billing plumbing (already exists)

- `useEntitlement(key)` reads `entitlements` table generically by `module_key`.
- `ADDONS` registry in lib/pricing.ts already supports add-ons with `requires: ModuleKey[]`
  (template: `verification` add-on, $499, requires ['ghg']).
- `create-invoice` admin route already grants entitlements incl. add-ons with `requires` check.
- No schema/migration needed for concierge data — it persists as nested JSON on `ghg_inventories`.

## Build sequence (June 21)

PHASE 1 — make concierge work on own account (zero billing risk):
  1a. Add 'concierge' to AddOnKey + ADDONS entries (3 tiers); resolve useEntitlement typing.
  1b. Flip line 878 CONCIERGE_DEV=true → useEntitlement('concierge').
  1c. Manually insert entitlements row, test full pipeline on a real bill end-to-end.
PHASE 2 — batch customer-acceptance UI + acceptance record (liability trail).
PHASE 3 — GHG location bands + hard enforcement (client + server).
PHASE 4 — wire purchasability into pricing/checkout (LIVE STRIPE — done last, deliberately).
PHASE 5 — end-to-end + live smoke test.

Fallback if time-tight: Phases 1–3 + manual invoicing (create-invoice route already grants
entitlements) = launch-viable without self-serve checkout.
