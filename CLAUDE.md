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

---

## Stack & environment

- **Framework:** Next.js 16 (Turbopack)
- **Backend:** Supabase (auth + Postgres + Storage)
- **Hosting:** Vercel (auto-deploy on push to `main`)
- **Repo:** `themisiqco/themisiq`
- **Dev machine:** macOS, local user `maj`
- **App-side AI model string:** `claude-opus-4-8` (e.g. the bill-extract route). Do not change this without an explicit reason.
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
| Add-on prerequisites | `addOnRequirementsMet` | Single authority enforcing the `ghg → concierge → verification` dependency chain. Both `/api/checkout` and `/api/admin/create-invoice` defer to it. |

---

## Architecture notes

- **Seven modules**, positioning "collect once, comply everywhere" across 30+ frameworks: GHG Emissions, Climate Risk, Supply Chain, Deals, AI Governance, People, Cyber.
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
- **Run `npx vitest run lib/ghg/engine.test.ts` (27 green) before and after any engine change.** If a previously-green test breaks, stop.

---

## Methodology integrity rules

- Preserve **verbatim source values** where a verifier may cross-check against the source document (e.g. bill period end dates — do not silently normalize "May 01" to "Apr 30").
- When a value can't be confidently derived, **flag it for manual review** rather than guessing.
- **`mr_jurisdictions.active` is a DORMANT column — no route reads it.** All three queries (`api/materiality/reference`, `api/materiality`, `api/materiality/resilience`) omit `active` from both the filter and the select, so setting `active = false` is a silent no-op: the row is still fetched and still scored. Retiring a jurisdiction today requires a hard delete, not deactivation. If jurisdictions are ever wired to the DB the way `mr_regions` was, `active` must be added to the filter in all three routes IN THE SAME PASS, or deactivation will keep doing nothing. (Contrast: `mr_regions` DOES filter on `active`.)
- The six-paragraph legal disclaimer is propagated across all Category-A surfaces (assurance PDF, climate-risk report, materiality report, assessment API, public methodology page, GHG inline report, climate-risk page disclaimers) and the per-module methodology Word docs. Keep these in sync; don't edit one in isolation.
- Citations/attributions for GWP and emission factors must stay accurate (AR4/AR5/AR6 sourcing in `EF_SOURCES`).

---

## Pricing model (locked — see `docs/pricing-and-concierge-spec-v4.md`)

- All seven modules: uniform **$999 / $2,499 / $4,999** (Starter / Professional / Advisory).
- **Only GHG scales by location.** GHG location allowances: Starter ≤3, Professional ≤10, Advisory ≤20, 20+ → contact us. Hard enforcement, upgrade wall, no auto-downgrade.
- **Concierge add-on** (requires GHG) is a *separate* axis priced on actual location count: Basic ≤5 $799, Standard 6–15 $1,499, Enterprise 16+ custom quote.
- `allow_promotion_codes: true` is permanent.

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