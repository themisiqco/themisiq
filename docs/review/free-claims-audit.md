# Free use and payment claims: audit (4 Oct 2026)

Read-only audit on `copy-pricing-fixes` at `cb5aaf7`. Line numbers are at that commit.
The patch `docs/review/patches/free-claims.patch` changes prices only; every wording change below is a
proposal awaiting approval.

## 1. What a visitor can do in the GHG module

Two readers: **V** = logged out, **F** = signed in with no `ghg` entitlement row (`ghgAccess === 'none'`).
There is no middleware: `/dashboard/ghg` renders for both (no `middleware.ts` or `proxy.ts`).
`useEntitlementAccess` returns `'none'` for both (lib/useEntitlement.ts:89-93, :61), so V and F get
the same screens except where noted.

| # | Action | V | F | Gate | Where | Message at the gate |
|---|---|---|---|---|---|---|
| 1 | Open and run the wizard | Yes | Yes | None | app/dashboard/ghg/page.tsx:689-746 (V: blank wizard at :727; F with no saved inventory: wizard at :744). The entry wall at :3335 shows only for `expired` / `unknown` | Neutral banner, :3397: "Your results are calculated as you enter your data. Saving your inventory and downloading reports need the GHG module." Button "See pricing →" |
| 2 | Live Scope 1 and 2 results, with workings (step 4) | Yes | Yes | None | Calculated in the browser by lib/ghg/engine.ts; the wizard makes no server call for figures (only `/api/ghg-bot` :217 and `/api/concierge/extract` :1086). Step 4 is deliberately unpaywalled, :2633-2640 | None |
| 3 | Scope 3, including spend pricing | No | No | **Paid GHG plan**, in effect | Scope 3 binds to a *saved* GHG inventory; with none, app/dashboard/scope3/page.tsx:4441-4495 shows the picker. Saving needs the plan (#7), so neither reader can reach the Scope 3 steps. The spend-factor route itself needs only a session (app/api/scope3/spend-factor/route.ts:250-282, no entitlement read). In the wizard, the Scope 3 control says lib/moduleLinks.ts:104 | V: "You need a saved GHG inventory first. …" (:4479) + "Scope 3 builds on a saved GHG inventory, so it needs a free account." (:4492). F: :4479 only. Wizard: "Save this inventory first. A Scope 3 record is attached to a saved inventory, so there is nothing to attach one to yet." |
| 4 | Upload documents | No | No | Paid GHG plan (active **or expired**: `isPaid`, :682) | Every upload slot renders `LockedDocUpload` (:2164 … :2581); `handleFileUpload` also returns silently with no session (:1058) | "🔒 Paid plan" / "Evidence uploads are available on paid plans, keeping your inventory assurance-ready for third-party verification." (:572-574). Step 4 checklist: "Available on paid plan" (:2910) |
| 5 | Get bills read | No | No | Bill Review (active `concierge` row), on top of #4 | Client: `useHasConcierge` (:686, :1078-1084). Server: app/api/concierge/extract/route.ts:113-125 | Unreachable for V and F (no upload). Server 403: "Reading figures off a document is part of Bill Review. Your upload is still kept as evidence: type the figure into the box above." |
| 6 | GHG guide (chat) | No | No | Paid GHG plan (row exists; the route is **not** term-aware) | Client :211-215; server app/api/ghg-bot/route.ts:196, :205-215 | V: "Your session has ended. Refresh the page and sign in again, and the guide will pick straight back up." (:162). F: "The guide is available on paid plans. It answers the boundary and data questions …" (:164) |
| 7 | Save a draft | No | No | **Active** GHG plan | Client refuses before any write (:1610-1612); the DB trigger `enforce_ghg_location_allowance()` refuses any `ghg_inventories` write without an active pass | `alert`: "Saving needs the GHG module. Your figures will be kept while you choose a plan." then go to /pricing?modules=ghg. Steps 4-5 banner: same sentence + "See GHG pricing →" (:3428-3430) |
| 8 | Reload or come back later | Partly | Partly | n/a | Nothing is stored as you type. A dirty wizard gets the browser's leave-page prompt (:874-879). A draft is written to localStorage **only** when the visitor goes to pricing from Save, the export overlay or the banner (:1565-1569); it is restored once on the next visit (:706-724). Lifetime: 2 hours if written signed out, no expiry if signed in (lib/drafts.ts:34, :69-81). Same browser only | Browser's own leave-page dialog; no ThemisIQ message. A reload without the pricing detour loses the work |
| 9 | Export: framework CSVs, assurance PDF | No | No | Paid GHG plan (active or expired) | Step 5 `PaywallOverlay` blurs and disables the buttons (:2989-2992); the files are generated in the browser (:3107-3254), so the gate is client-only | :2989 "Downloading them needs the GHG module." Overlay :376-413: "Download your reports with the GHG module." / "Your Scope 1 and Scope 2 figures for {frameworks} are calculated and on screen, and the workings behind them are yours to read. The module adds the downloads, the assurance package and saving. Your figures are kept while you choose a plan." / "See GHG pricing →" |
| 10 | Audit trail | No (nothing saved) | No | Saved inventory, so active plan | :3447 | — |
| 11 | Share with a verifier | No | No | **Active** GHG plan + saved inventory | `VerifierInvite` renders only for `active` (:3447); trigger `trg_enforce_verifier_invite_term` on insert | No message: the control is simply absent |
| 12 | Trends | No | No | Paid GHG plan (active or expired) | app/dashboard/ghg/trends/page.tsx:155-160 | "This view requires the GHG module. Visit Pricing to unlock it." |
| 13 | SBTi | No | No | Signed in, then paid GHG | app/dashboard/sbti/page.tsx:812-836 | V: "… It works from an inventory you have already built, so it needs a free account before there is anything to show." F: "Unlock SBTi target-setting" / "SBTi target-setting and monitoring is part of the GHG module. Unlock GHG to …" |

**In one line:** without a plan, a visitor can enter data and read Scope 1 and 2 results with workings,
in this browser session. Everything else needs a paid GHG plan, including Scope 3, saving, uploads,
the guide and exports. Reading bills also needs Bill Review.

Side findings (not copy, not in the patch):
- **S1.** The `source-documents` storage policies have no entitlement check
  (supabase/migrations/20260804_ghg_source_documents_policies.sql:55-72). The upload gate is UI-only.
- **S2.** The export gate is UI-only (blur + `pointerEvents: none`); the CSV and PDF are built client-side.
- **S3.** `/api/ghg-bot` checks only that a `ghg` row exists (route.ts:205-215), not `term_end`, so an expired customer keeps the guide.
- **S4.** A logged-out visitor opening the guide is told "Your session has ended", but they never had one.

## 2. Customer-facing claims about free use or payment timing

**A** = accurate against section 1, **X** = inaccurate, **n/a** = other module, outside this audit and not checked.

### /calculate-emissions (app/calculate-emissions/page.tsx)

| Line | Rendered sentence | Verdict |
|---|---|---|
| 63 | "… From $4,900 USD." (meta description) | X, stale price: fixed in the patch |
| 68 | "See your Scope 1 & 2 emissions instantly, free. … From $4,900 USD." | Free part A; price X, fixed in the patch |
| 154 | "Calculating and previewing your Scope 1 and 2 emissions is free. The GHG module starts at $550 USD …" | A |
| 162 / 708 | "No, this is not a subscription, and your credit card will not be charged again. ThemisIQ is a one-time purchase: you select and pay for the modules you need, once." | X, misleading. Nothing auto-renews, which is true. But every price on the page is "a year" and the licence is 12 months (terms §4). "Once" reads as lifetime access |
| 170 / 715 | "At Stripe checkout, just choose 'Invoice me' instead of paying by card. …" | X. The checkout session (app/api/checkout/route.ts:207-219) has no invoice option. Orders over $10,000 are refused before Stripe and sent to request an invoice (:94-95) |
| 175-178 / 720-722 | "Yes. Calculating your emissions is free: no account required. Payment (securely via Stripe) only happens when you choose to unlock and download the finished report." | X. Calculating Scope 1 and 2 is free (A), but payment is also needed to save, upload, use Scope 3, the guide and trends, not only to download |
| 453 | "Explore the calculator free*: you only pay when you're ready to download your report." | X, same reason |
| 454 | "*GHG emissions calculated from your totals via our platform, instantly and at no cost. For $4,900 USD, unlock platform access to download your report …" | Free part A (Scope 1 and 2); price X, fixed in the patch |
| 501 | "Start calculating in seconds. No account needed to see your emissions; you only create one when you're ready to download." | X. Saving also needs an account, and a paid plan |
| 525 | "$4,900 USD unlocks platform access: download your report under any framework you need" | Price X, fixed in the patch |
| 556 | "Our Scope 1 & Scope 2 GHG module is priced at $4,900 USD: simply create an account and pay securely by credit card, or on invoice, via Stripe." | Price X, fixed in the patch. "Or on invoice, via Stripe" is X (see 715). "Scope 1 & Scope 2 module" is X (the module includes Scope 3, line 557) |
| 693 | "Seeing your emissions is free: you only pay when you're ready to download a report or add support:" | X, same as 453 |
| 695 | "Calculate & preview your Scope 1 & 2 emissions: Free" | A |

### In the product

| Where | Rendered sentence | Verdict |
|---|---|---|
| app/dashboard/ghg/page.tsx:3397 | "Your results are calculated as you enter your data. Saving your inventory and downloading reports need the GHG module." | A (incomplete but true) |
| app/dashboard/ghg/page.tsx:379, :1611, :3428 | "… Your figures are kept while you choose a plan." | X for a logged-out visitor: kept 2 hours, in this browser only (lib/drafts.ts:34). A for a signed-in visitor |
| app/dashboard/ghg/page.tsx:382-401 | "What you unlock": save and update for 12 months; a downloadable report per framework; assurance package and verifier links; evidence uploads | A |
| app/dashboard/ghg/page.tsx:574 | "Evidence uploads are available on paid plans, …" | A |
| app/dashboard/ghg/page.tsx:162 | (guide, logged out) "Your session has ended. Refresh the page and sign in again …" | X for a visitor who never signed in (S4) |
| app/dashboard/scope3/page.tsx:4492 | "Scope 3 builds on a saved GHG inventory, so it needs a free account." | X. Saving needs a paid plan |
| app/dashboard/scope3/page.tsx:4318 | "The calculator stays free. You only pay to unlock results & export." | X. Scope 3 cannot be used without a saved inventory. Reachable only by a no-plan account that already holds a saved inventory |
| app/dashboard/scope3/page.tsx:4315-4317, 4430-4433 | "Unlock your full Scope 3 results … Unlock the GHG module to view and download it." | A |
| app/dashboard/sbti/page.tsx:814-816 | "It works from an inventory you have already built, so it needs a free account before there is anything to show." | X. It needs a saved inventory and the GHG module |
| app/dashboard/page.tsx:81 (`previewable: true`) → :476 | Scope 3 card: "Preview free" | X. There is no Scope 3 preview without a saved inventory |
| app/dashboard/page.tsx:68 → :476 | GHG card: "Preview free" | A |
| app/dashboard/page.tsx:401 | "Click any module to preview · unlock to export" | X for GHG: saving also needs the module; SBTi, CBAM and others are "Locked" with no preview |
| app/dashboard/page.tsx:494-498 | "Each module is an annual license." | A |
| app/dashboard/ghg/trends/page.tsx:159 | "This view requires the GHG module. Visit Pricing to unlock it." | A |
| lib/pricingCopy.ts:26 | "… you pay only for the modules it calls for." | A (about the assessment) |
| app/terms/page.tsx:68, :72; app/refund-policy/page.tsx:58 | "Payment is due in advance …" / "Subscriptions do not renew automatically …" | A |
| app/api/webhooks/stripe/route.ts:80 | "Your payment is confirmed and your modules are unlocked." | A |

### Other modules (n/a, listed for completeness, not checked)

Deals "first deal free" (app/deals/page.tsx:70, 77, 145, 254; app/dashboard/deals/page.tsx:697, 715,
1470, 1535-1581; report/page.tsx:254, 786; list/page.tsx:198, 201); app/cyber/page.tsx:170; CBAM readiness
"Free · No account needed" (app/cbam/readiness/page.tsx:63); forced-labour free checks
(app/forced-labour/page.tsx:58, 152; canada/page.tsx:60, 116, 163; canada/check/layout.tsx:6-8;
canada/check/page.tsx:80); "needs a free account" in climate-risk (app/dashboard/climate-risk/page.tsx:608)
and CBAM (setup:1336, report:262, disclosures:282); "free assessment" CTAs across the site; "complimentary
call" (app/advisory/page.tsx:49-163, app/assess/page.tsx:923, lib/assessmentEmail.ts:225-234). One
inconsistency spotted: app/api/ghg-bot/route.ts:137 calls the assessment "2-minute"; the pages say about
five minutes.

## 3. In the patch (prices only)

All five `$4,900` on /calculate-emissions now read `ghgFrom` (`GHG_TIERS.starter.priceUSD`, already
defined at :48), rendering "$550":

| Line | Now reads |
|---|---|
| 63 | "… IFRS S2 and more. From $550 USD." |
| 68 | "See your Scope 1 & 2 emissions instantly, free. … From $550 USD." |
| 454 | "… instantly and at no cost. From $550 USD, unlock platform access to download your report under any GHG framework you need: …" |
| 525 | "From $550 USD, the GHG module unlocks platform access: download your report under any framework you need" |
| 556 | "Our Scope 1 & Scope 2 GHG module is priced from **$550 USD**: …" (rest unchanged; see proposal P7) |

New test `app/calculate-emissions/prices.test.ts`: CP1 no dollar literal in the page source other than
SB 253's "$1 billion"; CP2 no "4,900". No other customer-facing file has a stale GHG price. Every other
$4,900 on the site is Climate Risk, Deals or Materiality, read from `FLAT_MODULE_PRICES`.

## 4. Proposed wording for the inaccurate claims (not applied)

| # | Where | Proposed |
|---|---|---|
| P1 | calculate-emissions:453 | "See your Scope 1 and 2 results free, with no account*. Saving your work and downloading a report need the GHG module." |
| P2 | calculate-emissions:501 | "Start calculating in seconds. You can see your Scope 1 and 2 results with no account. To save your work or download a report, you create an account and buy the GHG module." |
| P3 | calculate-emissions:693 | "Seeing your Scope 1 and 2 results is free. Saving, downloading reports, uploading evidence, Scope 3 and the in-app guide need the GHG module:" |
| P4 | calculate-emissions:175-178 and 720-722 ("Can I try it before I pay?") | "Yes. You can enter your data and see your Scope 1 and 2 results, with the workings, free and with no account. Nothing is saved until you buy the GHG module, which also adds report downloads, evidence uploads and Scope 3. Payment is handled securely by Stripe." |
| P5 | calculate-emissions:162 and 708 ("Is this a subscription?") | "No. Nothing renews or charges you automatically. Each module is a 12-month licence that you pay for once. To keep using it after 12 months, you place a new order. Buying more than one module? The multi-module discount is applied automatically at checkout." |
| P6 | calculate-emissions:170 and 715 (card limit) | "Orders up to $10,000 are paid by card through Stripe. Orders over $10,000 are completed by invoice: request one from the order page and we'll send an invoice you can forward to your accounts team. When it's paid, we'll email you to confirm your modules are unlocked." ⚑ Confirm whether you also invoice orders under $10,000 on request; if so, add "If you need an invoice for a smaller order, contact us." |
| P7 | calculate-emissions:556 | "Our GHG module is priced from **$550 USD**: create an account and pay securely by card through **Stripe** (orders over $10,000 are invoiced). Then download your selected report, …" |
| P8 | ghg/page.tsx:379, :1611, :3428 ("Your figures are kept while you choose a plan.") | Signed in: unchanged. Signed out: "Your figures are kept in this browser for two hours while you choose a plan." (needs the session state at each site; :1611 and the overlay already resolve it through `stashDraftAndGoToPricing`) |
| P9 | ghg/page.tsx:212-214 (guide, no session) | Use the paid-plan message instead of `unauthenticated` when there is no session at all: "The guide is part of the GHG module. Sign in to a plan that includes GHG to use it." The server 401 keeps "Your session has ended…" |
| P10 | scope3/page.tsx:4492 | "Scope 3 builds on a saved GHG inventory, and saving an inventory needs the GHG module." |
| P11 | scope3/page.tsx:4318 | Remove the line, or: "Scope 3 is part of the GHG module." |
| P12 | sbti/page.tsx:814-816 | "This module sets and tracks emissions reduction targets under the SBTi Corporate Net-Zero Standard. It works from a saved GHG inventory and is part of the GHG module." |
| P13 | dashboard/page.tsx:81 | `previewable: false`, so the Scope 3 card reads "Locked" instead of "Preview free". |
| P14 | dashboard/page.tsx:401 | "Click any module to see what it does. Some let you try them first; saving and downloading need the module." |
