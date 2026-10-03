# Pricing audit: GHG add-ons and GHG tier structure

Read-only audit, 3 Oct 2026. No code changed, no git run beyond reading the checkout.

**Commit audited:** `4d7b7fc`. The request named branch `copy-pricing-fixes`; the checked-out branch reports as
`main` at that same commit.

Every file:line is at that commit. Items marked ⚑ were not verified beyond the read described.

---

## Part A. Add-ons

### A.0 Which add-ons exist

- **Concierge is the only GHG add-on defined or sold.**
- **Verification Readiness** has no working code left (A.8).
- **No other GHG add-on exists.** `AddOnKey` holds only three Concierge keys (lib/pricing.ts:352).
  - `ADVISORY_HOURLY_USD = 175` (lib/pricing.ts:268) is commented "NOT A PLAN INCLUSION AND NOT A CHECKOUT PATH"
    (:264-267). It is a quoted rate with no purchase flow.
  - GHG Advisory and Enterprise are GHG tiers, not add-ons.

**Concierge exists in two generations, both still in code:**

| Generation | Keys | Price | Where |
|---|---|---|---|
| **Band model (v4)** | `concierge-basic`, `concierge-standard`, `concierge-enterprise` (`AddOnKey`, lib/pricing.ts:352) | `ADDONS`: "Concierge · Basic (up to 5 locations)" $799; "Concierge · Standard (6–15 locations)" $1,499; "Concierge · Enterprise (16+ locations)" price 0, `isCustomQuote: true`; each `requires: ['ghg']` | lib/pricing.ts:354-395; `conciergeTierForLocations` :399-406 |
| **Source model (28 Sep 2026)** | `CONCIERGE_KEY = 'concierge'` (:524); `LEGACY_CONCIERGE_KEYS` (:525); `CONCIERGE_ENTITLEMENT_KEYS` = both (:526) | $90 per uploaded source a year, $60 per connected source a year (not sellable), $1,395 one-time onboarding on the first purchase | `conciergeQuote` (:594-633) |

The code calls the band-model constants "SUPERSEDED … kept only until their callers move … Nothing new may read
them" (lib/pricing.ts:442-446). They are still reachable from both purchase routes (A.7, gap 4).

---

### A.1 How a customer buys Concierge today

| Surface | Offers Concierge? | Detail |
|---|---|---|
| **/pricing** (app/pricing/page.tsx) | **Yes, only with GHG in the cart.** | The block renders under `{ghgSelected && (` (:658); `conciergeActive = ghgSelected && conciergeOn` (:256). Copy: "Concierge: we read your bills" (:667); "Upload utility bills; ThemisIQ extracts the figures with source quotes for you to confirm. Priced per data source." (:668). A "Data sources:" number input (:675-677). Sends `concierge: { uploadedSources }` with `tier` and `moduleKeys` (:302-307). |
| /order (app/order/page.tsx) | No | Sends `{ tier, moduleKeys: keys, ...payload }` only (:127); no Concierge reference. |
| Homepage pricing (app/components/HomePricing.tsx) | No | No Concierge reference. |
| /checkout page (app/checkout/page.tsx) | Resume only | Resumes a stored intent (`resumePendingCheckout`, :13). A stored `concierge` field passes through (lib/checkout.ts:30, 48, 115). |
| GHG wizard (app/dashboard/ghg/page.tsx) | No | No purchase prompt. Its pricing links are GHG-only: `/pricing?modules=ghg` (:316, :1569, :3400). |
| /climate-ghg | No | FAQ text only (`CONCIERGE_FAQ`, app/climate-ghg/page.tsx:247). |
| /calculate-emissions | No | A marketing card and price text (:575-577, :688). |
| Automated invoice (`/api/order/quote-request` → lib/order/invoice.ts → lib/order/provision.ts) | No | `priceOrder({ modules, tier })`; metadata is `user_id, entitlements, source, ref` only (lib/order/invoice.ts:77-82). |
| Admin invoice (app/api/admin/create-invoice/route.ts) | Yes | Via the `concierge` body field (:183-248). ⚑ No UI that calls this route was found. |

**Buying GHG and Concierge in one cart.** Supported, through /pricing only. Checkout accepts Concierge when
`modulesInCart.has('ghg')` (app/api/checkout/route.ts:203).

**Adding Concierge later to an active GHG plan.**
- **The API allows it, with a gap.** A body with `concierge` and no GHG module is accepted if the customer owns a
  `ghg` row (route.ts:204).
  - The ownership read is `select('module_key')` with no `term_end` filter (:138-140), so **an expired GHG holder
    passes the check**.
  - The read fails closed with a 503, "We could not confirm what you already own. Please try again in a moment."
    (:143-146).
- **No UI sends that body.** /pricing renders Concierge only with GHG selected, so buying it there re-buys GHG.

**`addOnRequirementsMet`** (lib/pricing.ts:414-435):
- It refuses a quote-only add-on: "`${label} is quote-only and cannot be purchased through checkout. Contact
  sales.`" (:424-426).
- It requires each module in `requires` ("`${label} requires ghg. Add it to your cart or purchase it first.`",
  :427-433).
- Its parameter `addOnsOwnedOrInCart` is unused (:417).
- **It is called only on the legacy `addOns` path** (checkout route.ts:167; create-invoice :168). The source-model
  `concierge` path re-implements the GHG check inline (checkout :202-209; create-invoice :212-218). CLAUDE.md calls
  `addOnRequirementsMet` the single authority for add-on prerequisites; that is no longer true for the path in use.

---

### A.2 Stripe

**No stored Stripe Product or Price IDs.** Every line is inline `price_data`:
- `priceLine` builds `{ quantity: 1, price_data: { currency: 'usd', product_data: { name }, unit_amount } }` and
  throws on a price ≤ 0 (lib/pricing.ts:648-660).
- `priceLineQty` adds a quantity and throws unless it is a whole number ≥ 1 (:666-672).

**Checkout line items** (app/api/checkout/route.ts), session `mode: 'payment'` (:294):
- Modules: one line, "ThemisIQ: N module(s)" (:102-103).
- Concierge, from `conciergeQuote().lines` (:227-229):
  - "GHG Concierge onboarding" × 1 at $1,395, first purchase only (lib/pricing.ts:622-625);
  - "GHG Concierge data source, uploaded (1 year)" × n at $90 (:626-628);
  - "GHG Concierge data source, connected (1 year)" × n at $60 (:629-631), unreachable while
    `UTILITY_CONNECT_ENABLED` is false.
- Legacy `addOns`: `priceLine(addOn.label, addOn.price)` (:171).

**Checkout metadata** (route.ts:280-291), mirrored to `payment_intent_data.metadata` (:302):

| Key | Value |
|---|---|
| `user_id` | |
| `entitlements` | comma-joined keys, `concierge` included (:230, :279) |
| `source` | e.g. `concierge:${u}u+${c}c+onboarding` (:239) |
| `ghg_tier` | via `ghgTierMetaValue` |
| `concierge_uploaded_sources`, `concierge_connected_sources` | the two counts, separately (:232-233) |
| `concierge_source_allowance` | uploaded + connected (:231-238) |
| `concierge_onboarding_usd` | recorded only (:231-238) |
| consent keys | (:264-275) |

**Admin invoice** (app/api/admin/create-invoice/route.ts):
- The same metadata keys (:259-268), on a DRAFT invoice (`auto_advance: false`, :279).
- Lines are `invoiceItems.create({ amount, description })`, with the quantity folded into the amount and the label
  as "`${label} x ${quantity}`" (:233-239, :287-294).
- Legacy add-on line: `{ label: addOn.label, amount: addOn.price }` (:172).

**Webhook `grantFromMetadata`** (app/api/webhooks/stripe/route.ts:174-270):
- **Triggers:** `checkout.session.completed` with `payment_status === 'paid'` (:119-127), or `invoice.paid`
  (:130-132).
- **Reads prior rows** (`module_key, term_start, term_end, ghg_tier, source_allowance`); throws on a read error
  (:216-225).
- **Upserts one row per key in `entitlements`**, on `user_id,module_key` (:241-263):
  - `source`: overwritten on every order;
  - `ghg_tier`: GHG row only; the order's value, else the prior value;
  - `source_allowance`: **only when `module_key === CONCIERGE_KEY`**; the order's value, else the prior value, else
    null (:253-255). A legacy `concierge-*` key gets null;
  - `term_start`, `term_end`: from `entitlementTerm` (:258).
- **Not stored:** `concierge_onboarding_usd` is read by nothing and never becomes a row (:190-194). There is no
  quantity column; quantity exists only on Stripe lines.
- **The term:** `term_start` = the earlier of prior and now; `term_end` = the later of prior and now + 365 days
  (lib/entitlementTerm.ts:48-57; 365 at :19). It never shortens and never adds up (:41-47).

---

### A.3 Entitlement record and term

- **Table** `public.entitlements` (supabase/migrations/20260811_entitlements_definition.sql:54-87):
  - columns `id, user_id, module_key, source, created_at, location_allowance, term_start NOT NULL, term_end NOT
    NULL`, with `UNIQUE (user_id, module_key)`;
  - RLS: SELECT own rows only (:93-125).
- **Added by 20260928_concierge_source_model.sql:**
  - `ghg_tier` (:35-38), widened from 3 to 5 keys by 20260928_ghg_employee_bands.sql:32-36;
  - `source_allowance integer CHECK >= 0`, commented "Null means not recorded, NOT uncapped. Nothing enforces it
    yet." (:51-57);
  - the one legacy row (`concierge-basic`, the test account) re-keyed to `concierge` with `source_allowance = 60`
    (:85-100), with an assertion that no legacy rows remain (:104-116);
  - `concierge_jobs.tier` narrowed to `CHECK (tier = 'concierge')`, plus `source_count` (:135-146; dump
    db/dumps/schema_public_20261001_1057.sql:5727).
- **What says a customer holds Concierge:** a row with `module_key` `concierge` (or a legacy Concierge key) and
  `term_end > now()`.
- **The term:** 365 days per row, **independent of the GHG term**. Bought together, the two share one `now`
  (webhook :239); otherwise they are unrelated.
- **The onboarding fee leaves no entitlement record**, only Stripe metadata and the `source` string.
- **No database trigger enforces Concierge.** 20260913_module_entitlement_triggers.sql covers `double-materiality`
  (:102-152) and `cbam` (:159-221) only.

---

### A.4 Enforcement

| Check | Behaviour |
|---|---|
| **`useHasConcierge`** (lib/useEntitlement.ts:157-193) | Term-aware: `.in('module_key', CONCIERGE_ENTITLEMENT_KEYS).gt('term_end', …)` (:169, :178), on the client clock. No loading state (starts false, :158); a read error resolves to false (:181-184). Does not check GHG. Its comment at :154-156 ("sold as three tier-specific add-on entitlements") is stale. |
| **`/api/concierge/extract`** (app/api/concierge/extract/route.ts:101-127) | The same term-aware query, server clock. Fails closed with 503 "We couldn’t confirm your plan just now. Please try again in a moment." (:118). Not entitled: 403 "Reading figures off a document is part of the concierge add-on. Your upload is still kept as evidence — type the figure into the box above." (:124). No GHG check, no `source_allowance` check. Comment at :89-92 ("sold in three tiers") is stale. |
| **GHG wizard** | `const CONCIERGE_DEV = useHasConcierge()` (app/dashboard/ghg/page.tsx:686) gates the extract call (:1078, :1084-1086) and the upload copy (:3517, :3521, :3539-3547). The export gate (`conciergeReady`, :1344, :1350, :3067-3070) depends on readings, not on the entitlement. |
| Verifier portal | Shows provenance only (`entry_method` concierge variants, app/verify/[token]/page.tsx:72, :1021-1027). No entitlement check. |
| Assurance PDF | A comment only (lib/assurancePdf.ts:52). No entitlement check. |
| Database | None for the purchase. `enforce_concierge_job_open()` (20260910_concierge_review_schema.sql:337-445) guards the `concierge_jobs` workflow. ⚑ No application code writes `concierge_jobs` or `concierge_proposals`; only scripts/erase-account.mjs and scripts/rls-verify.mjs reference them. |
| Dashboard | `KEY_TO_CARD_IDS` has no Concierge entry (app/dashboard/page.tsx:268-280), so Concierge shows no tile. |

**What an unpaid or expired user sees** in the wizard:
- "Drag & drop your documents here, or click to upload" (:3539);
- "PDF, image, XLSX or CSV. Enter figures manually after uploading. Large files are fine." (:3546).

There is no upsell, and an expired holder is not told apart from someone who never bought.

---

### A.5 Source-model specifics (28 Sep 2026)

| Question | Finding |
|---|---|
| **Data-source count captured at checkout?** | Yes. /pricing clamps the input to 1..`CONCIERGE_MAX_SELF_SERVE_SOURCES` (app/pricing/page.tsx:676-677). `conciergeQuote` throws on a non-integer, NaN, negative, a total < 1, a total > 60, or connected > 0 while the flag is off (lib/pricing.ts:597-617). `CONCIERGE_MAX_SELF_SERVE_SOURCES = 60` (:479). |
| **Is `source_allowance` enforced?** | No, anywhere. It is written by the webhook and read by tests; the migration says "Nothing enforces it yet" (:57), as does spec v5 (:102-104). No code counts a customer's sources or meters. |
| **True-up, mid-term proration, renewal on active sources, "uploads for unpaid sources prompted, not blocked"?** | None found. Searches for true-up, proration and "not blocked" return nothing related to Concierge. |
| **What a second order does** | It **replaces** the count. The new order's `source_allowance` overwrites the old (webhook :253-254), and `term_end` moves to now + 365. Example: a holder of 10 sources who buys 5 more ends with an allowance of 5. |
| **Connected vs uploaded** | Distinguished in pricing and metadata. `UTILITY_CONNECT_ENABLED = false` (lib/pricing.ts:452). Checkout returns 400 "Connected utility sources are not available yet. Please order uploaded sources only." (route.ts:195-200); the admin invoice route "…Invoice uploaded sources only." (:195-200); `conciergeQuote` also throws (:612-617). /pricing shows "Connected source: $60 each a year. Coming soon." (:690). `sourceKindSellable` (:482-484) is used only in tests (lib/pricing.test.ts:177-178). |
| **Onboarding fee** | `CONCIERGE_ONBOARDING_USD = 1395`, flat (:463). Charged when `isFirstPurchase` (:618), as its own line. `isFirstConciergePurchase` is true when no row carries any Concierge key, deliberately term-blind (:535-537); the server decides it (checkout :217; create-invoice :224). /pricing previews it with `isFirstPurchase: true` (:272), labelled "One-time onboarding, charged on your first Concierge order" (:701). ⚑ Two simultaneous first checkouts could each be charged onboarding: nothing locks the read. |

---

### A.6 Prices, everywhere they appear

**In code:**
- `CONCIERGE_SOURCE_USD`: uploaded 90, connected 60 (lib/pricing.ts:469-472);
- `CONCIERGE_ONBOARDING_USD`: 1395 (:463);
- legacy `ADDONS`: basic 799, standard 1499, enterprise 0 / quote (:374, :381, :391).

| Where | What it says | Source of the figure |
|---|---|---|
| /pricing | "$90 each a year"; "Connected source: $60 each a year. Coming soon."; quote lines (:688-690, :694-703, :724-731) | constants |
| /pricing summary and button | total "/year" (:753-754); "Buy now, ${newGrandTotal}/yr →" (:799). `newGrandTotal` = module total + `conciergeQ.quote.totalUSD` (:278, :288), which includes the one-time onboarding in the preview | constants |
| /climate-ghg FAQ | prices from the constants (faq.ts:48, :64); "Onboarding is a one-time fee based on your GHG tier." (faq.ts:38, :56; the rendered set is `FAQ_UPLOAD_ONLY`, :68) | constants, plus a literal claim |
| /calculate-emissions | "from $90 per data source a year, plus a one-time onboarding fee" (:576, :688) | constants |
| /calculate-emissions FAQPage JSON-LD | "**Concierge from $799**; Advisory is custom" (:145) | **hard-coded** |
| GHG bot prompt | no Concierge prices; "concierge mode" (app/api/ghg-bot/route.ts:128), "no concierge tier" (:167) | n/a |
| docs/pricing-and-concierge-spec-v5.md | onboarding by tier: Essentials $1,250 / Professional $1,750 / Advisory $2,500 (:28-35); $90 / $60 per source (:40-43); 60-source ceiling (:45) | spec |
| CLAUDE.md:238-240 | "priced on actual location count: Basic ≤5 $799, Standard 6–15 $1,499, Enterprise 16+ custom quote. It is now the ONLY add-on." | prose |
| lib/pricing.ts:343-345 | header comment repeating the location bands | comment |

**Conflicts:**
1. **Onboarding:** the code charges a flat $1,395 (lib/pricing.ts:463). Spec v5 says $1,250 / $1,750 / $2,500 by
   tier (:28-35), and the live FAQ says "based on your GHG tier" (faq.ts:38, :56).
2. **Pricing basis:** CLAUDE.md:238-240 and lib/pricing.ts:343-345 describe location bands at $799 / $1,499. The live
   model is $90 per source plus onboarding.
3. **/calculate-emissions contradicts itself:** "Concierge from $799" in its JSON-LD (:145), against "from $90 per
   data source" on the visible page (:576, :688).
4. **The band-model prices are still sellable by direct API call.** `addOns: ['concierge-basic']` or
   `['concierge-standard']` passes `addOnRequirementsMet`, is charged $799 or $1,499 (checkout :152-175;
   create-invoice :154-176), and is granted as a legacy key with `source_allowance` null. Test N2 pins basic as
   sellable (lib/pricing.test.ts:125-127).
5. **Spec v5 is stale:** it lists three GHG tiers and an "Advisory location ceiling" (:31-35, :45-46), against five
   employee bands today.
6. **A one-time fee is shown as yearly:** the /pricing total and the buy button label the onboarding fee "/year" and
   "/yr" (:754, :799).

---

### A.7 Gaps

**(a) To buy GHG plus an add-on in one checkout:**
- This works from /pricing only. /order, homepage pricing and the automated invoice path cannot sell Concierge.
- **The card threshold ignores Concierge.** Checkout tests `requiresInvoice` on the module total only (route.ts:99-101),
  as the page's TODO notes (pricing/page.tsx:285-286). Example, computed from the constants and not run: GHG Advisory
  $4,550 + 60 sources $5,400 + onboarding $1,395 = $11,345, payable by card above the $10,000 threshold.

**(b) To add an add-on later to an existing GHG plan:**
- There is no UI path. /pricing puts GHG in the cart, so it charges GHG again.
- The API path exists, but its owned-GHG check is term-blind (route.ts:138-140, 204).
- There is no flow to add sources, true up or upgrade, and a second order replaces the allowance rather than adding
  to it (A.5).

**(c) To have the app grant and enforce it:**
- **Granting** works for the `concierge` key.
- **Enforcement is binary:** any live Concierge row unlocks extraction, whatever `source_allowance` says and whether
  or not GHG is held.
- **Missing:**
  - a loading state in `useHasConcierge`;
  - any expired or unpaid message, or upsell, in the wizard;
  - a dashboard tile;
  - any reader of `source_allowance`.
- The legacy keys are still sellable with no allowance (A.6, conflict 4).
- `concierge_jobs` exists, but nothing writes it.

---

### A.8 Verification Readiness

**Status:** cannot be bought, granted or enforced anywhere.
- A direct API call with `addOns: ['verification']` gets "Unknown add-on." (checkout route.ts:155-157).
- There is no entitlement and no enforcement.

**Remaining traces:**
- **Code comments:**
  - app/api/checkout/route.ts:127 ("2c) Add-ons (Verification Readiness + the Concierge tiers)");
  - app/api/checkout/route.ts:282 (`// e.g. "ghg,supply-chain,verification"`);
  - lib/checkout.ts:73 ('e.g. "Verification requires ghg"');
  - app/components/Nav.tsx:70 ("GHG Emissions + GHG Verification paired at the top", beside the retirement note at
    :72-73);
  - retirement notes at lib/pricing.ts:347-351, :411-413 and app/pricing/page.tsx:253.
- **Docs:**
  - docs/verification-billing-spec.md (the whole file: $499 at :20, `/verification-readiness` at :11 and :98);
  - docs/ghg-verifier-grade-roadmap.md:3-8, :64;
  - docs/workplan-sbti-targets-v2_1.md:44, :143, :179;
  - docs/review/ghg-register.md:375-389;
  - CLAUDE.md:241-251.

**Checked and clean:**
- no `ADDONS.verification` (`AddOnKey`, lib/pricing.ts:352);
- no `'verification'` entitlement string in app/ or lib/;
- no app/verification-readiness directory;
- no sitemap entry (robots.ts:29-30 disallows only /verify/ and /verify-cbam/ token paths);
- no Nav entry, no /pricing or /order offer, no webhook branch;
- no mention in the bot prompt or the FAQ;
- no `'verification'` row or constraint in the 1 Oct schema dump.

**Last price, conflicting:** $1,499 a year (CLAUDE.md:241) against $499 (docs/verification-billing-spec.md:20).

---

## Part B. GHG tier structure

### B.0 The current model (lib/pricing.ts)

| Internal key | Display label | Employees | priceUSD |
|---|---|---|---|
| `starter` | Essentials | 1 to 19 | 475 |
| `professional` | Professional | 20 to 99 | 1,425 |
| `business` | Business | 100 to 249 | 2,850 |
| `advisory` | Advisory | 250 to 499 | 4,550 |
| `enterprise` | Enterprise | 500 or more | null (quote) |

**The live pages derive from these definitions:** /pricing, homepage pricing, /order, /climate-ghg, the
/calculate-emissions footnotes and the deals report. Changing them in lib/pricing.ts moves those pages. The places
that would not follow are in B.4 and B.5.

### B.1 Definitions

| file:line | What |
|---|---|
| lib/pricing.ts:97 | `type Tier = 'starter' \| 'professional' \| 'business' \| 'advisory' \| 'enterprise'` |
| lib/pricing.ts:150 | `type GhgTier = Tier` |
| lib/pricing.ts:164-173 | `GHG_TIERS`: `priceUSD`, `employees {min, max}` |
| lib/pricing.ts:176-179 | `ghgEmployeeBandLabel()` ("1 to 19 employees", "500 employees or more") |
| lib/pricing.ts:189-200 | `ghgTierForEmployees()`; its only caller is lib/deals/assessment.ts:626 |
| lib/pricing.ts:205-211 | `GHG_TIER_LABELS` (`starter` → "Essentials") |
| lib/pricing.ts:550 | `GHG_TIER_KEYS` (in band order) |
| lib/pricing.ts:575-577, 590-592 | `isGhgTier`, `ghgTierMetaValue` |
| lib/pricing.ts:318, 320 | `cartQuote` defaults to `starter`; a null price means `requiresQuote` |
| lib/pricing.ts:101, 147 | `FOUNDING_OFFER_ACTIVE = true`, `NEW_PRICING_ACTIVE = true` |
| lib/pricing.ts:115-133, 286-292, 571-573 | Legacy: `LegacyTier`, `TIER_PRICING` (starter 1,499 / 999, professional 2,499, advisory 4,999), `tierPrice`, `tierStrikethrough`, `configuratorPrice`, `isLegacyTier` |
| supabase/migrations/20260928_ghg_employee_bands.sql:32-36, 44-47, 63-70, 86-88 | CHECK `entitlements_ghg_tier_check` on the five keys; `employee_count` column; the test row re-keyed advisory → enterprise; a stray-row check |
| supabase/migrations/20260928_ghg_employee_bands_rollback.sql:23, 39-42, 58-61 | Narrows the CHECK back to three keys; refuses if business or enterprise rows exist |
| supabase/migrations/20260928_concierge_source_model.sql:36-41, 68 | The original `ghg_tier` column, its three-key CHECK and comment |
| db/dumps/schema_public_20261001_1057.sql:5945, 5948-5949 | The columns and the five-key CHECK, matching the migration |
| lib/deals/assessment.ts:539, 616-617, 633, 652 | A **separate** site-count ladder: ≤3 → `starter`, ≤15 → `professional`, else a quote; `ghgOrderTier` (none → `starter`, null → `enterprise`). Not derived from `GHG_TIERS`. |

### B.2 Display labels (customer-facing, derived from the definitions)

| file:line | Surface |
|---|---|
| app/pricing/page.tsx:623, 632-648, 293 | "from $" + starter price; the tier picker (label, price or "Contact us", band) |
| app/components/HomePricing.tsx:156, 162-170 | Picker with label and price (no band shown) |
| app/order/page.tsx:116-117 | Line item: `${GHG_TIER_LABELS[tier]} · ${ghgEmployeeBandLabel(tier)}` |
| app/climate-ghg/page.tsx:71, 97, 161, 224-231 | "From $" + starter price; "Entry tier: …"; tier cards |
| app/calculate-emissions/page.tsx:47-48, 145, 570, 588, 692 | starter price; footnotes naming the starter, professional and enterprise bands only |
| lib/deals/assessment.ts:640 | "Priced on N employees (${GHG_TIER_LABELS[tier]} band)." Feeds the deals wizard, report, PDF and XLSX (app/dashboard/deals/page.tsx:537; lib/deals/reportModel.ts:909; lib/deals/exportPipelineXlsx.ts:217) |
| lib/deals/reportModel.ts:620-623; app/deals/[token]/page.tsx:153, 158-178 | "From USD …" / "From …" (lowest priced tier) |
| lib/obligations.ts:504-534 | `modulesPrice` / `priceLabel` "from $X" (default `starter`); used by app/assess/page.tsx:830, 893 and lib/assessmentEmail.ts:124 |

**No tier references:** the GHG bot prompt (app/api/ghg-bot/route.ts:128-167), lib/assurancePdf.ts and the
methodology pages.

### B.3 Internal keys

**Stripe metadata:**

| file:line | What |
|---|---|
| app/api/checkout/route.ts:73, 82, 95, 120-123, 287 | `isGhgTier` gate; `ghg_tier: ghgTierMetaValue(ghgTierForMeta)` |
| app/api/checkout/route.ts:97, 108-112 | "GHG Enterprise is quote-only"; legacy arm with the raw key in a label |
| app/api/admin/create-invoice/route.ts:105, 124-150, 266, 129, 138-142 | the same pattern |
| app/api/webhooks/stripe/route.ts:187, 218, 231, 250-252 | reads `metadata.ghg_tier`; writes `entitlements.ghg_tier` on the GHG row, falling back to the prior value |
| lib/order/invoice.ts:77-82, 61, 88 | the automated draft invoice **sends no `ghg_tier`**; "GHG Enterprise is a custom quote…"; the raw key in the idempotency signature |
| lib/order/provision.ts:99-102 | `isGhgTier`, defaulting to `starter` |

**URL parameters, session and email:**

| file:line | What |
|---|---|
| app/order/page.tsx:3, 80-84, 127, 144 | `?tier=` validated by `isGhgTier` (fallback `starter`); the raw key sent to checkout and quote-request |
| app/deals/[token]/page.tsx:190-191 | `/order?…&tier=${ghgOrderTier}` |
| app/pricing/page.tsx:289 | `/advisory?modules=…&tier=${tier}`; app/advisory/page.tsx does not read it |
| lib/checkout.ts:13, 20, 48, 52, 96 | `CheckoutSelection.tier` in sessionStorage `themisiq:pendingCheckout` and in the `?intent=` URL |
| app/api/order/quote-request/route.ts:70-72, 99, 121, 134 | internal email prints the **raw key** under "GHG tier" |

**Database comment:**
- db/dumps/schema_public_20261001_1057.sql:5965: the `ghg_tier` column comment reads "Sets the Concierge
  onboarding fee". This has been stale since onboarding became flat.

**Tests that pin keys, labels, bands or prices:**

| file:line | What it pins |
|---|---|
| lib/pricing.test.ts:52-89, 253-304, 313-342 | carts by tier; enterprise is the quote; band boundaries 1/19/20/99/100/249/250/499/500; band-label strings |
| lib/ghgTierKeys.test.ts:56-110 | no inlined key lists outside lib/pricing.ts; a label for every key |
| lib/entitlementMetadata.test.ts:34, 97-100, 133-135, 222-315 | metadata keys; `GHG_TIERS` shape `['employees', 'priceUSD']`; keys tied to the CHECK (M22, M23); M23b requires `starter`, `professional` and `advisory` to stay (:277) |
| lib/deals/ghgPriceBasis.test.ts:19-21, 37-96 | labels Essentials / Professional / Business; keys and prices via `GHG_TIERS` |
| lib/deals/assessment.test.ts:1011, 1020 | the site ladder 3 / 15 |
| lib/deals/marketConditions.test.ts:101 | the literal "From USD 475" |
| app/locationCapRetired.test.ts:37-40 | page sentences, including "Priced by company size, not by number of sites." |

### B.4 Hard-coded copy (typed, not derived)

| file:line | Literal | Note |
|---|---|---|
| app/order/page.tsx:201 | "GHG Advisory (uncapped locations) is tailored to your footprint, so it’s priced individually." | Shown on `requiresQuote`, which is now **Enterprise** |
| app/components/HomePricing.tsx:67 | `if (tier === 'advisory')` → "Ready to meet your compliance team?" / "Talk to a specialist →" | Treats the priced Advisory tier as the specialist path |
| app/pricing/page.tsx:325-329 | the same `tier === 'advisory'` CTA | as above |
| app/calculate-emissions/page.tsx:145 | "Concierge from $799; Advisory is custom" | JSON-LD, customer-facing |
| app/calculate-emissions/page.tsx:581-583, 689 | an "Advisory … Custom" support tier | A service, but the same word as the $4,550 GHG tier |
| app/api/order/quote-request/route.ts:100 | total fallback "Custom / Advisory" | internal email |
| app/climate-ghg/faq.ts:38, 56 | "Onboarding is a one-time fee based on your GHG tier." | contradicts the flat fee |
| app/dashboard/page.tsx:233-237 | `TIER_CONFIG` {starter: 'Essentials', professional: 'Professional', advisory: 'Advisory'} | a second label map, three keys only. ⚑ `sub.tier` is never set (:286 builds `{module_id}` only), so the badge never renders |
| docs/pricing-and-concierge-spec-v5.md:4-5, 28-35, 45-46, 91-92 | "GHG software tiers are unchanged"; onboarding by three tiers; the location-allowance era | stale |
| docs/pricing-and-concierge-spec-v4.md:21-33, 62 | Starter / Professional / Advisory with location ceilings | historical |
| CLAUDE.md:237-239, 248 | Concierge location bands; "GHG Essentials" | the first is stale |
| supabase/migrations/20260618_ghg_location_allowance.sql:37-50 (dump :5958) | "Essentials 3 / Professional 15 / Advisory uncapped" | column comment |
| supabase/migrations/20260701_deals_location_count.sql:3 | "(GHG_TIERS: <=3 Essentials, 4-15 Professional, 16+ Advisory)" | comment |
| lib/deals/assessment.ts:539, 591, 615 | the 3 / 15 thresholds; "(Advisory GHG, 16+ locations)" | |
| app/deals/[token]/page.tsx:140-141, 187; lib/pricing.test.ts:48, 83 | tier names and prices in comments | comments only |

### B.5 Inconsistencies

1. **Key and label differ for one tier:** key `starter` displays as "Essentials" (lib/pricing.ts:206). The only
   literal copy of that mapping is app/dashboard/page.tsx:234. The other four keys match their labels.
2. **Advisory is still treated as the quote tier** in places, although it is now the priced 250–499 band and
   Enterprise is the quote:
   - live copy and calls to action: app/order/page.tsx:7, 73, 112, 196, 201; app/components/HomePricing.tsx:67;
     app/pricing/page.tsx:325; app/calculate-emissions/page.tsx:145; app/api/order/quote-request/route.ts:10-11,
     100, 197;
   - comments: lib/order/provision.ts:85; lib/order/invoice.ts:12, 34, 59; lib/obligations.ts:486;
     lib/pricing.ts:300-302, 310, 319; lib/deals/assessment.ts:591.
3. **Key counts in comments are wrong:** lib/pricing.ts:580-581 and app/api/webhooks/stripe/route.ts:185-186 say
   "one of the three keys". There are five. The test name at lib/entitlementMetadata.test.ts:282 says "passes the
   three through".
4. **Location-era comments remain:**
   - lib/pricing.ts:474-477 references `GHG_TIERS.advisory.locationAllowance`, which no longer exists;
   - app/api/admin/create-invoice/route.ts:103-104 calls `ghgTierForMeta` a "GHG location ceiling";
   - the TODO at lib/pricing.ts:107-110 cites Starter 1,499 → 799, while `TIER_PRICING.early` is 999.
5. **The dashboard badge map** (app/dashboard/page.tsx:233-237) has no Business or Enterprise entry, and is never
   reached (B.4).
6. **The automated invoice path omits `ghg_tier`** (lib/order/invoice.ts:77-82). The webhook then keeps the prior
   value or null, unlike checkout and the admin invoice.
7. **`entitlements.employee_count` is never written.** The migration (20260928_ghg_employee_bands.sql:39-55) and the
   column comment (dump :5979) say it is captured at checkout and consent. No code in app/api, lib/order or the
   consent form writes or collects it.
   - The `employee_count` in the GHG wizard (app/dashboard/ghg/page.tsx:608) is the inventory's own field, not this
     column.
   - The pricing and order pickers let the customer choose a tier directly; `ghgTierForEmployees` is used only by
     the deals module.
8. **The `ghg_tier` column comment is stale** ("Sets the Concierge onboarding fee": concierge_source_model.sql:41;
   dump :5965).
9. **The deals fallback ladder** (lib/deals/assessment.ts:616-617, 633) produces only starter, professional or a
   quote, on its own 3 / 15 site thresholds, not on `GHG_TIERS` bands.
10. **The band list is partial** in the /calculate-emissions footnotes (:588, :692): Business and Advisory are
    summarised as "higher tiers".
11. **Overloaded words** (not the GHG tier), to exclude when searching:
    - "Advisory": the /advisory contact page, "Talk to a specialist", `ADVISORY_HOURLY_USD` (lib/pricing.ts:268),
      the calculate-emissions support tier (:581, 689), "ThemisIQ Advisory" (app/dashboard/deals/page.tsx:1328);
    - "Enterprise": the Concierge key `concierge-enterprise` (lib/pricing.ts:352, 384-394) and CLAUDE.md:238;
    - "Professional": "Professional Services" sector labels;
    - "business": a flight cabin class (lib/emissionFactors/defraTravel.ts:27; lib/scope3/businessTravel.ts:57-62);
    - "starter": materiality provenance (lib/materiality.ts:17-24, 948);
    - "Essentials": UK Cyber Essentials (app/pricing/page.tsx:171; app/cyber/page.tsx:29-32).
12. **Older review documents** (docs/review/ghg-register.md:138-386; docs/review/design-derived-figures.md:973-1024)
    quote location-era tiers. They are historical records.

### B.6 Scope of a band or name change

- **Bands or prices:** edit `GHG_TIERS` (lib/pricing.ts:164-173). The surfaces in B.2 follow. Also:
  - the tests in B.3, which pin the boundaries, labels and "From USD 475";
  - the deals site ladder (B.1, B.5 item 9), which does not follow.
- **A display name:** edit `GHG_TIER_LABELS` (lib/pricing.ts:205-211). Also:
  - the literal map at app/dashboard/page.tsx:233-237;
  - the hard-coded copy in B.4;
  - the label tests (lib/deals/ghgPriceBasis.test.ts:19-21).
- **An internal key (add, remove or rename)** touches far more than labels:
  - the `entitlements_ghg_tier_check` CHECK and its rollback migration;
  - stored `entitlements.ghg_tier` values;
  - Stripe metadata already issued, which the webhook still reads;
  - `?tier=` links already sent (app/deals, /order);
  - sessionStorage intents (lib/checkout.ts);
  - the `tier === 'advisory'` branches (B.4);
  - M23b, which requires `starter`, `professional` and `advisory` to remain (lib/entitlementMetadata.test.ts:277).
