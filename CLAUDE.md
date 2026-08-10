@AGENTS.md

# CLAUDE.md — ThemisIQ

Project conventions and guardrails for Claude Code. Read this in full at the start of every session and follow it.

ThemisIQ (themisiq.co) is a B2B compliance SaaS platform. Solo founder/developer: Lisa. Guiding principle: **"accuracy forms trust."** This is a compliance product whose outputs are read by auditors and verifiers, so methodology correctness and verifier-facing fidelity are non-negotiable. When in doubt, prefer the more defensible, more transparent option.

---

## ⚠️ Critical guardrails — read first

- **`main` auto-deploys to LIVE production on every push, with live Stripe keys active.** Treat every push to `main` as a live deployment touching real customer payments.
  - **Never push to `main` autonomously.** Propose the commit, show the diff, and stop. Lisa pushes manually after reviewing.
  - Prefer working on a branch and opening a PR over committing directly to `main`.
- **`npm run build` is the authority. It must pass before any push.** Run it and report the result; do not suggest pushing on a failing or unrun build.
- **No secrets in code or commits.** Never hardcode or echo Stripe keys, Supabase service keys, or any credential. They live in environment variables / Vercel project settings only.
- **Some DB schema is NOT in git.** The GHG location-band enforcement lives in Supabase, not the repo:
  - `entitlements.location_allowance` (integer, nullable; `NULL` = uncapped)
  - the `enforce_ghg_location_allowance()` Postgres trigger (BEFORE INSERT/UPDATE on `ghg_inventories`)
  If the database is ever rebuilt, these two SQL statements must be re-run by hand. Do not assume the repo is the full source of truth for DB state.
  - **No longer on this list:** the `source-documents` storage bucket. Its config and its three RLS policies were DB-only until 4 Aug 2026 and are now captured in `supabase/migrations/20260804_ghg_source_documents_bucket_hardening.sql` and `..._policies.sql` (run the hardening one first — it creates the bucket row the policies reference).

---

## Stack & environment

- **Framework:** Next.js 16 (Turbopack)
- **Backend:** Supabase (auth + Postgres + Storage)
- **Hosting:** Vercel (auto-deploy on push to `main`)
- **Repo:** `themisiqco/themisiq`
- **Dev machine:** macOS, local user `maj`
- **App-side AI model strings — there is no longer ONE standard.** Each route names its own, and the choice is recorded with it. Do not "align" them without an explicit reason.
  - **`/api/concierge/extract` uses `claude-opus-5`, with thinking ON** (`thinking: { type: 'adaptive' }`, `output_config: { effort: 'medium' }`). The thinking is deliberate: the prompt asks the model to tell a billed consumption figure apart from a cost, a rate, a tax line and a meter reading, and to return `value: null` when it cannot tell. **That abstention judgement is the route's safety property** — a flagged blank is recoverable, a confident wrong number reaches a verifier — and reasoning is what makes it reliable. Do not disable it to save tokens.
    - **A fixed thinking budget is not available.** `thinking: { type: 'enabled', budget_tokens: N }` returns 400 on the whole Opus family — verified live against `claude-opus-5` AND `claude-opus-4-8` on 5 Aug 2026 — with the API naming its own replacement: *use `thinking.type.adaptive` and `output_config.effort`*. `effort` is a depth dial, NOT a token cap. The worst case is bounded by `max_tokens` (8192, shared by thinking and response text) and by the route's `stop_reason === 'max_tokens'` guard.
    - **Thinking changes the response shape, and the parse depends on it.** With thinking on, `content` is `['thinking', 'text']`, and a thinking block has **no `.text` key** (its field is `.thinking`, empty by default — `display` defaults to `"omitted"`). The route's `b.type === 'text'` filter is what keeps this working; reading `b.text` unconditionally would prepend `"undefined"` to the JSON. That is exactly the ghg-bot defect below, one model generation later.
  - **`/api/ghg-bot` uses `claude-sonnet-5`.** Not a mistake, and not to be "corrected" back to opus. It answers from a fixed ~7 KB prompt rather than reasoning over an uploaded document, its rate limit admits 30 calls per user per 10 minutes, and the string it replaced was itself a Sonnet — so this keeps the tier the original author chose at a price that suits a glossary-and-boundary Q&A box.
  - **A retired model string fails as an upstream 404, not as a build error.** `tsc`, eslint, the tests and `npm run build` all pass with a model that no longer exists, because it is only a string; the customer just sees the feature fail. `/api/ghg-bot` carried a dead `claude-sonnet-4-20250514` undetected this way. **Before changing any model string, send one live call and check for 200** — do not trust a model list in place of a response. The exact curl is in the comment above `MODEL` in `app/api/ghg-bot/route.ts`. All three strings — `claude-opus-5`, `claude-sonnet-5`, `claude-opus-4-8` — were last verified live on 5 Aug 2026.
- **Jurisdictions served:** primarily California (SB 253 / SB 261), UK, and EU; company incorporated in Ontario, Canada.

Lisa is a non-expert in terminal/git workflows. When a manual step is genuinely required of her, give it as a clear, copy-pasteable, one-step-at-a-time instruction.

---

## Single sources of truth — do not duplicate these

| Concern | Authority file | Rule |
|---|---|---|
| Pricing | `lib/pricing.ts` | All prices/tiers/allowances derive from here. Never hardcode a price elsewhere. |
| Emission factors | `lib/emissionFactors.ts` | Shared across modules. |
| Unit conversions | `lib/unitConversions.ts` | 3-tier cascade (exact match → documented factor → flag `needs_manual_review`). |
| Entitlement reads | `lib/useEntitlement.ts` | e.g. `useGhgLocationAllowance()`, user-scoped, fails open to null. |
| Checkout intent | `lib/checkout.ts` | Stores intent in `sessionStorage`, resumes after login. |
| Add-on prerequisites | `addOnRequirementsMet` | Single authority enforcing the `ghg → concierge` dependency chain, and the quote-only guard that keeps Concierge Enterprise unsellable through checkout. Both `/api/checkout` and `/api/admin/create-invoice` defer to it. (Was `ghg → concierge → verification` until 10 Aug 2026 — see the retirement note under **Pricing model**.) |

---

## Architecture notes

- **Modular platform**, positioning "collect once, comply everywhere" across 30+ frameworks: GHG Emissions, CBAM, Climate Risk, Supply Chain, People, Deals, AI Governance, Cyber.
- **GHG engine** is multi-jurisdiction (US / Canada / UK / EU) with AR4/AR5/AR6 GWP routing, and framework-to-GWP mappings for CDP / ESRS / GRI / IFRS / SB 253. Scope 2 supports residual-mix / market-based calculation; grid-factor display is year-aware (propagates `inventory.reporting_year`).
- **Concierge is a *mode* of the existing GHG wizard, not a separate system.** It adds bill extraction (Supabase Storage → server-side fetch), a coverage-check system (gap / overlap / straddle resolution), and an export gate.
- **Export gating** generally follows: `canExport = dataConfirmed && coverage fully resolved && (concierge ⇒ customer_approved)`. Don't loosen a gate without understanding why it exists — they protect verifier-facing correctness.
- **Scope 3 Category 1** uses the GHG Protocol hybrid method (supplier-specific primary data first, spend-based gap-fill, honest flagging of uncovered suppliers and non-USD currency).

---

## GHG engine invariants (`lib/ghg/engine.ts`)

The engine is pure calc (no React/Supabase): all factor tables, coverage analysis, and `buildWorkings` live here. These invariants are load-bearing — don't break them:

- **`app/dashboard/ghg/page.tsx` RENDERS `buildWorkings()` output; never re-derive workings rows in the component.** There is ONE renderer. A second, hand-rolled derivation in `renderStep4` once drifted from the engine and was removed — reintroducing any per-row calc in the component is the regression.
- **`applyResolutions()` is the single source of truth for what a figure IS.** Both the write path and the audit trail derive from it, so the number and the method claimed for it cannot disagree.
- **`exclusiveEnd()` — ONE definition.** End date on the 1st = exclusive (first-of-next-month billing); every other end date = inclusive last covered day. `monthlyEmissions.ts` imports it — do not fork it.
- **`daysBetween` (engine) is INCLUSIVE; `monthlyEmissions.ts` uses a LOCAL half-open count. Two contracts, deliberate — do NOT unify them.** The half-open count is what makes monthly proration reconcile; the inclusive one serves coverage's inclusive ranges.
- **Monthly = evidenced only. Annual = evidenced + estimated. They are SUPPOSED to diverge on extrapolated inventories.** Never gross up monthly slices — a dated slice must not assert consumption no bill supports. `reconcile()` models the expected gap; a non-zero `unexplained_delta` is a real defect. (`reconcile` is exported + tested but not yet surfaced in the UI — separate design.)
- **Coverage gate is keyed per `(document_type, fuelType)` and iterates `cov.issues` (all conditions present), not the scalar `status`.** A fleet_fuel doc's gasoline and diesel are separate groups; a gap masked by an overlap must still block.
- **`s3_td` (NZ electricity T&D, Scope 3 Cat 3) is a DISTINCT total — never folded into S1/S2.** `calcInventory` surfaces it separately.
- **Run `npx vitest run lib/ghg/engine.test.ts` (50 green) before and after any engine change.** If a previously-green test breaks, stop.

---

## Methodology integrity rules

- Preserve **verbatim source values** where a verifier may cross-check against the source document (e.g. bill period end dates — do not silently normalize "May 01" to "Apr 30").
- When a value can't be confidently derived, **flag it for manual review** rather than guessing.
- **An empty result is a result, and must be reported as one.** This is the API-surface counterpart to the rule above and to the engine's *"a dated slice must not assert consumption no bill supports"*: the engine must not invent a figure it has no evidence for, and a route must not pass off "nothing came back" as either an answer or ordinary trouble. A route that returns `''`, `null`, or `[]` where a value was expected must say **which** of those happened and **why**. It must never hand the client something that renders as generic failure text.
  - **The corollary is the part that gets lost: an error message that guesses at a cause it cannot verify will eventually name the wrong one, and hide the real defect for months.** State what was observed, not what probably caused it. "Didn't open" is checkable; "your browser blocked it" is a guess wearing the clothes of a diagnosis.
  - Four instances in three days, 2–4 Aug 2026, each invisible until someone looked directly at it:
    1. **The concierge returned nothing, silently, for three document types its extractor cannot read** (fuel oil, purchased steam, RECs). The upload burned a model call, the client discarded every figure, and the customer saw an upload that appeared to do nothing. Now structurally prevented by `lib/ghg/conciergeDocTypes.ts` + its test, not by a comment.
    2. **`window.open(url, '_blank', 'noopener')` returns `null` UNCONDITIONALLY** — `noopener` severs the handle by definition, and `noreferrer` sets `noopener` too. Both verifier pages therefore showed *"Your browser blocked the pop-up"* on every successful click, naming a cause that had never once occurred, while the real blank tab was orphaned. The code could not distinguish blocked from severed and guessed.
    3. **`/api/ghg-bot` carried a retired model string**, and the 404 error body was `.map`ped for `.text` into `''` — surfacing as *"Sorry, try again."* for an unknown stretch. The feature was dead and looked flaky. See the model-string rule under **Stack & environment** for the check that catches this class.
    4. **Same route, `max_tokens` exhausted during adaptive thinking** — thinking tokens draw on the same budget — producing the same empty string by a different path. Caught before shipping only because (3) had just made `stop_reason` the first thing to read.
- **`mr_jurisdictions.active` is a DORMANT column — no route reads it.** All three queries (`api/materiality/reference`, `api/materiality`, `api/materiality/resilience`) omit `active` from both the filter and the select, so setting `active = false` is a silent no-op: the row is still fetched and still scored. Retiring a jurisdiction today requires a hard delete, not deactivation. If jurisdictions are ever wired to the DB the way `mr_regions` was, `active` must be added to the filter in all three routes IN THE SAME PASS, or deactivation will keep doing nothing. (Contrast: `mr_regions` DOES filter on `active`.)
- The six-paragraph legal disclaimer is propagated across all Category-A surfaces (assurance PDF, climate-risk report, materiality report, assessment API, public methodology page, GHG inline report, climate-risk page disclaimers) and the per-module methodology Word docs. Keep these in sync; don't edit one in isolation.
- Citations/attributions for GWP and emission factors must stay accurate (AR4/AR5/AR6 sourcing in `EF_SOURCES`).

---

## Known defects (OPEN)

### Unit switch relabels without converting (OPEN — live in production)

Changing the unit selector on a location that already holds a figure
relabels the number rather than converting it. 332 m3 becomes 332 Mcf —
roughly 28x the actual gas — with a confirmed source document underneath
still reading "332m3". No error, no flag, no review state.

Worse than an ordinary defect for three reasons: the customer performs
the action believing they are fixing something (the unpriceable-location
message tells them to check the unit); it presents as clean and
high-confidence; and the provenance chain actively contradicts the
stored figure.

Decision needed before fixing: does the figure convert, or clear and
ask? unitConversions.ts already converts as an audited step, and m3 to
Mcf is fixed geometry rather than an estimate — but it silently changes
a number the customer typed. Clearing invents nothing but destroys
entered data.

Found 5 Aug 2026 while testing the unpriceable-location isolation.

---

## Pricing model — LIVE (NEW_PRICING_ACTIVE = true since the June 2026 rescope)

- **Source of truth is `lib/pricing.ts`, not this file.** `cartQuote()` is
  consumed by BOTH the configurator (display) and the checkout/admin-invoice
  routes (charge), so displayed price == charged price by construction.
- **GHG is the only tiered module** (`GHG_TIERS`). Every other module is a
  flat annual price (`FLAT_MODULE_PRICES`): climate-risk $4,900, deals
  $4,900, cbam $1,499, supply-chain $2,900, cyber $2,900, ai-governance
  $2,900, people $1,499.
- **Volume discount** on multi-module carts: 2 modules −10%, 3+ −20%
  (`volumeDiscount`).
- **No Full Platform bundle.** `FULL_PLATFORM_PRICE` and the all-modules cap
  were removed on 23 Jul 2026: the headline figure caused sticker shock and
  few buyers need every module. The pricing hero now leads with pick-and-pace
  copy and the volume discount instead.
- **Never state a module COUNT** in copy or docs. It changes as modules are
  added and every number goes stale. Say "modules", not "seven modules".
- **`LEGACY_PRICING_PAGE_ID`** maps the pricing pages' shorthand ids to
  canonical `ModuleKey`s. Its consumers `.filter(Boolean)`, so an unmapped id
  is SILENTLY DROPPED from the cart — a customer could select a module, pay,
  and not receive it. A derived test guards this; adding a module to `MODULES`
  fails that test until it is mapped.
- **Only GHG scales by location.** Allowances come from `GHG_TIERS`. Hard
  enforcement, upgrade wall, no auto-downgrade.
- **Concierge add-on** (requires GHG) is a separate axis priced on actual
  location count: Basic ≤5 $799, Standard 6–15 $1,499, Enterprise 16+ custom
  quote. It is now the ONLY add-on.
- **Verification Readiness ($1,499/yr) was RETIRED 10 Aug 2026** — `ADDONS.verification`,
  its `AddOnKey` member, the `requiresAddOnAnyOf` type field and the
  `addOnRequirementsMet` branch reading it are all removed, along with
  `app/verification-readiness/page.tsx` and its nav/footer entries. Two reasons: its
  entitlement was **written by the webhook and never read** — no
  `useEntitlement('verification')` existed or could (that hook takes `ModuleKey`), so
  no surface rendered differently for a holder; and half its claims duplicated what GHG
  Essentials already lists (`'Audit trail + assurance package'`), with `assurancePdf.ts`
  and `/verify/[token]` already citing the same ISO 14064-3 / ISAE 3410. The six claims
  that were genuinely its own are in `docs/ghg-verifier-grade-roadmap.md` — read that
  before reviving any of it. Do not re-add the add-on to restore the page.
- **`CARD_THRESHOLD_USD` = $10,000.** Above that, self-serve card is off and
  the order routes to request-an-invoice.
- `allow_promotion_codes: true` is permanent.
- **Dead rollback path:** the `!NEW_PRICING_ACTIVE` branches in
  `app/pricing/page.tsx` and `app/components/HomePricing.tsx` (six guards,
  plus the else-arm of the ternary at `app/pricing/page.tsx:825`) can no
  longer render, and the 23 Jul bundle removal only touched the active
  branches — so reverting the flag would restore a page advertising a bundle
  `cartQuote` no longer prices. Treat the rollback as gone.
- **`docs/pricing-and-concierge-spec-v4.md` is HISTORICAL, not current.** It
  describes the pre-rescope model (uniform $999 / $2,499 / $4,999 tiers).
  Read it for background only; never price from it.

---

## Brand constants

- **Headings:** Georgia serif.
- **Brand gradient:** `linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)`.
- **Neutrals:** `#0d0d0d` / `#555553` / `#888784` / `#f8f7f5` / `#e8e7e4`.
- **Green accent:** `#0F6E56` on `#E1F5EE`.

---

## Working style for this repo

1. For non-trivial changes, **plan first** and show the plan before editing.
2. Make focused diffs; show them for review before applying.
3. Run `npm run build`; report pass/fail.
4. Propose a descriptive commit. **Stop before pushing `main`** — leave the push to Lisa.
5. Call out anything that touches payments, entitlements, export gates, disclaimers, or DB schema as higher-risk and worth a closer look.