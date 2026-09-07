# Phase 2 recon — splitting Climate Risk from Materiality Assessment

Read-only recon, 25 Aug 2026. Nothing in this file has been changed in the codebase.

**Phase 2 as briefed:** rename ModuleKey `impact-materiality` → `double-materiality`, price
it at $8,900, and change the existing `climate-risk` module's display name to drop
"& Materiality" (priced $4,900, climate risk analysis only).

**Installed base:** confirmed from the database — one entitlement holder for each key, both
Lisa's, neither via Stripe. No customer data to preserve, so the rename needs no backfill
and no grant-and-revoke.

---

## 1. Where `ModuleKey` is defined, and every file naming either key

Defined once, in `lib/pricing.ts:26` — a nine-member string union. Everything else derives
from it: `MODULES` (:49), `ALL_MODULE_KEYS` (:63), `FLAT_MODULE_PRICES` (:158),
`LEGACY_PRICING_PAGE_ID` (:68), `ADDONS[].requires` (:356).

**34 files name either key.**

| Area | Files |
|---|---|
| `lib/` | `pricing.ts`, `pricing.test.ts`, `checkout.ts`, `csrd.ts`, `obligations.ts`, `deals/assessment.ts` |
| `app/api/` | `materiality/[id]/route.ts` |
| Public pages | `climate-risk/`, `materiality/`, `impact-materiality/`, `pricing/`, `order/`, `methodology/` |
| Components | `components/HomePricing.tsx`, `components/Nav.tsx` |
| Dashboard | `dashboard/page.tsx`, `dashboard/climate-risk/{page,report}`, `dashboard/stakeholder/[id]/report`, `dashboard/materiality/report`, `dashboard/materiality/assessment/{AssessmentForm,new,[id]/edit}`, `dashboard/materiality/survey/{page,[id]/page,scope,results,respondents,respondents/import}`, `dashboard/materiality/worksheet/{page,[id]/page,determine,determinations,register,iro-1}` |
| Docs | `docs/backlog.md` |

## 2. What `climate-risk` currently unlocks

**Not climate risk analysis only. It also gates a materiality screen, on both the client and
the server — so this is not a pure rename.**

Four gates:

| Gate | What it unlocks |
|---|---|
| `dashboard/climate-risk/page.tsx:270` | the wizard |
| `dashboard/climate-risk/report/page.tsx:69` | the resilience report |
| **`dashboard/materiality/report/page.tsx:427`** | **the CSRD double-materiality matrix report** |
| **`api/materiality/[id]/route.ts:26`** | **`.eq("module_key", "climate-risk")` — gates the report DATA server-side** |

The last two are the screening-mode matrix report — the one whose disclosure-roadmap heading
was corrected on 25 Aug. If "climate risk analysis only" means those move to
`double-materiality`, that is a genuine removal from the module plus a server-side gate
change, not a display-name edit.

**This is the decision to settle before any code is written.**

## 3. What `impact-materiality` currently unlocks

15 gates, all client-side `useEntitlement(...)` → `PaywallCard`. No API route checks this
key — unlike `climate-risk`, it has no server-side gate.

- `worksheet/` — `page`, `[id]/page`, `determine`, `determinations`, `register`, `iro-1`
- `survey/` — `page`, `[id]/page`, `scope`, `results`, `respondents`, `respondents/import`
- `assessment/` — `new`, `[id]/edit`
- `stakeholder/[id]/report`

## 4. Display names, prices, Stripe

- **Display names:** `MODULES` in `lib/pricing.ts:49`. Already reads `{ key: 'climate-risk',
  name: 'Climate Risk' }` — the "& Materiality" wording survives only in page copy
  (e.g. `dashboard/climate-risk/page.tsx`), not in the module registry.
- **Prices:** `FLAT_MODULE_PRICES` at `lib/pricing.ts:158`. Both keys are currently `4900`.
- **Stripe: no product or price IDs anywhere in the repo, and none configured externally.**
  `priceLine()` (`:435`) mints `price_data` / `product_data` inline per request from the
  dollar figure. A reprice is a one-line edit with no Stripe dashboard work.

## 5. Seed / catalogue file, and validation of a stored `module_key`

**No seed or catalogue file. Nothing validates that a stored `module_key` exists.**

- `entitlements.module_key` is `text NOT NULL` — no CHECK, no FK, no enum
  (`20260811_entitlements_definition.sql:57`).
- The Stripe webhook writes it verbatim: `metadata.entitlements.split(',')`
  (`api/webhooks/stripe/route.ts:186`), never checked against `ALL_MODULE_KEYS`.
- `/api/checkout` and `/api/admin/create-invoice` DO validate on the way in
  (`checkout/route.ts:101`), so the unvalidated path is the webhook only.
- `LEGACY_PRICING_PAGE_ID` (`:68`) is `Record<string, ModuleKey>` — an unmapped shorthand is
  silently dropped from the cart. `pricing.test.ts` derives both sides from `MODULES`, so a
  missing entry fails a test rather than a customer.

An orphaned entitlement row therefore resolves to `'none'` — indistinguishable on screen from
never having bought. Not a risk here, given no installed base.

---

## Notes for whoever does the work

**The rename is largely compiler-driven.** `FLAT_MODULE_PRICES` is
`Record<Exclude<ModuleKey,'ghg'>, number>`, so a renamed key fails to build until it is
priced; `pricing.test.ts` catches a missing `LEGACY_PRICING_PAGE_ID` entry.

**Four things sit outside the type system and will not fail to compile:**

1. `api/materiality/[id]/route.ts:26` — the string literal `"climate-risk"`
2. the `app/impact-materiality/` route directory — the URL is the key; renaming it 404s the
   marketing page unless `app/materiality/page.tsx` and `HomePricing.tsx` links move too
3. `PACK_CONFIG` in `dashboard/page.tsx:206` — uses a third spelling with underscores
   (`climate_risk`, `supply_chain`), which are pack-display strings, not `ModuleKey`s
4. `docs/backlog.md`

**$8,900 crosses a threshold the current price was chosen to stay under.**
`CARD_THRESHOLD_USD` is 10000. Today `4900 + 4900 = 9800`, less the 10% two-module discount
= **$8,820, self-serve**. At $8,900: `4900 + 8900 = 13800`, less 10% = **$12,420 — over the
threshold**, so buying both routes to request-an-invoice. Materiality alone stays under.

`lib/pricing.ts:160-180` argues the parity case at length and explicitly anticipates this
reprice: *"A LATER PRICE RISE IS DEFENSIBLE ON EXACTLY THAT BASIS, and this paragraph is the
record of the argument for whoever makes it."* It also records the self-serve property as a
reason for the current number. Both should be updated in the same pass, or the file will
argue against the price it states.
