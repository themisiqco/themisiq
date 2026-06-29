# Work Plan — SBTi Target-Setting & Monitoring (GHG Module)

**Owner:** Lisa Foster / ThemisIQ
**Standard:** SBTi Corporate Net-Zero Standard — version-aware (V1.3.1 *and* V2.0)
**Status:** Draft for review · prepared as strategist/reviewer spec for Claude Code build-out
**Guiding principle:** Accuracy forms trust. The platform *prepares submission-ready targets and monitors progress*; it is **not** the validator (SBTi Services validates).

---

## 0. Standing constraints (build inside these)

- Claude (web) = strategist/reviewer. Claude Code proposes diffs; **Lisa** runs `npm run build`, stages named files only, and pushes after Vercel turns green.
- `main` auto-deploys to live production with active Stripe keys. **Vercel green is the only ship gate.**
- DB schema changes (tables/columns/triggers/RLS) live in Supabase and are **not** auto-tracked in git — every SQL statement in this plan must be saved as a re-runnable migration file in the repo and documented, the same way the GHG location-band column + trigger were.
- `lib/pricing.ts` is single source of truth for pricing; introduce `lib/sbti.ts` as the single source of truth for SBTi logic and wire all surfaces through it.
- Quit VS Code before terminal `cp`; single-quote perl/grep containing `!`; never `git add -a`; never stage `docs/workplan-ghg-dashboard-sbti.md`.

---

## 1. What V2.0 changes (build-relevant facts)

| Area | V1.3.1 (use through 2027) | V2.0 (validation opens Q1 2027, mandatory 1 Feb 2028) |
|---|---|---|
| Company tiering | SME route + uniform | **Category A** (large: revenue / employees / emissions thresholds) vs **Category B** (smaller, lighter obligations) |
| Scope 1 & 2 | Combined target allowed | **Separate** S1 and S2 targets; **S2 target = location-based** inventory; RECs/PPAs tracked separately |
| Scope 3 coverage | Categories totalling ≥67% of S3 | **Any category 1–14 that is ≥5% of total S3** must carry a target |
| Electricity high-growth | — | Demand growth **>20%/yr → absolute targets required** (not intensity) |
| Validation model | One-time validation + annual report | **Continuous accountability**: end-of-cycle assessment by VVBs; **ratchet** — underperformers get tighter renewal targets |
| Miss-target consequence | Risk of removal | **Best-efforts**: stay in if all levers used + transparent on barriers |
| Transition plan | Not required | **Category A: publish Climate Transition Plan within 12 months of validation** |
| Assurance | Not mandatory | **Category A: limited assurance on GHG inventory + target metrics** |
| Beyond-value-chain | BVCM | **OER** (Ongoing Emissions Responsibility): declare intent at validation; Category A mandatory removals from 2035 (1% → 100% by net-zero year) |
| Credits vs inventory | — | Credits **never** reduce reported S1/2/3; accounted separately |

**Timeline anchors:** V1.3.1 valid for new submissions through end-2027 · V2.0 effective 1 Feb 2027, validation opens Q1 2027 · both versions accepted Q1 2027 → 31 Jan 2028 · V2.0 mandatory 1 Feb 2028.

> **Design consequence:** every target record carries a `standard_version`. The engine branches on it. MVP customers set V1.3.1 targets *and* see a V2.0-readiness view, so they migrate without re-platforming.

---

## 2. Key design decisions (recommendations — Lisa decides)

- **DECISION D1 — Version scope for MVP.** *Recommend:* build the engine V2.0-first but version-aware, ship V1.3.1 + V2.0 target-setting together. Reason: a 2026 customer must submit on V1.3.1 today, but the whole selling point is V2.0-readiness. Splitting them doubles wizard rework later.
- **DECISION D2 — Pricing placement.** *Options:* (a) bundle SBTi target-setting + monitoring into the **GHG Professional tier** as a flagship differentiator (sits naturally beside the 10 advisory hrs + roundtables you just finalised); (b) standalone add-on like Verification Readiness ($499/yr) requiring GHG; (c) both — Essentials gets *monitoring against a target*, Professional gets *guided target-setting + V2.0 accountability layer*. *Recommend (c)* — it gives Professional a concrete reason-to-upgrade without walling off the monitoring that makes the GHG dashboard sticky. Final call is yours; this only affects entitlement gating in §10.
- **DECISION D3 — Scope coverage for MVP wizard.** *Recommend:* S1 (absolute), S2 (location-based absolute), and S3 near-term targets for ≥5% categories. Net-zero long-term target + OER intent in Phase 4, not MVP.
- **DECISION D4 — ACA parameters.** Do **not** hardcode the 1.5°C linear reduction rate. The Absolute Contraction Approach was revised 29 Apr 2026; pull the rate + base-year rules into a parameter block (`lib/sbti/params.ts`) sourced from the current SBTi criteria, so a criteria update is a one-line change, not a refactor. (See §11 verification items.)

---

## 3. Data model (Supabase)

All new tables get **RLS on, authenticated-owner policies** from the first migration (no repeat of the supplier-portal RLS-off incident). Save each statement as a numbered migration file in the repo.

**`sbti_company_profile`** (one row per org/account)
- `user_id`, `annual_revenue`, `employee_count`, `total_emissions_tco2e`, `elec_demand_growth_pct`
- `category` (`A` | `B`, derived but stored for audit), `category_basis` (which threshold triggered A)
- `oer_intent` (`participate` | `decline` | `undeclared`), `net_zero_target_year`

**`sbti_targets`** (one row per target)
- `id`, `user_id`, `standard_version` (`v1_3_1` | `v2_0`)
- `target_type` (`near_term` | `net_zero` | `renewal`)
- `scope` (`s1` | `s2_location` | `s3` | `s1s2_combined` *(v1 only)*)
- `s3_category` (1–14, null unless scope=s3)
- `method` (`absolute_aca` | `intensity`)
- `base_year`, `base_year_emissions_tco2e`, `target_year`, `reduction_pct`, `ambition` (`1.5C`)
- `status` (`draft` | `committed` | `submitted` | `validated` | `expired` | `renewing`)
- `coverage_pct`, `notes`, `created_at`, `updated_at`

**`sbti_scope3_coverage`** (derived snapshot, refreshed from Scope 3 module)
- `user_id`, `s3_category`, `category_emissions_tco2e`, `pct_of_total_s3`, `target_required` (≥5%), `has_target`

**`sbti_cycle`** (V2.0 accountability)
- `user_id`, `cycle_start`, `cycle_end`, `last_assessment_date`, `renewal_due`, `performance_status` (`on_track` | `off_track` | `best_efforts`), `transition_plan_due`, `transition_plan_published` (bool)

**Progress is derived, not stored.** Build a `sbti_progress` view/RPC over the existing annual inventory + `ghg_monthly_emissions` rows: actual emissions per scope per year vs the trajectory line. No duplicate source of truth.

---

## 4. Engine — `lib/sbti.ts` (single source of truth)

Pure functions, fully unit-tested (target the unitConversions bar: ≥15 passing tests before any UI). All UI and export surfaces call these; nothing recomputes inline.

- `categorize(profile) → { category, basis }` — A if revenue / employees / emissions exceed thresholds (params in `lib/sbti/params.ts`).
- `requiresAbsoluteScope2(profile) → bool` — true if `elec_demand_growth_pct > 20`.
- `computeTrajectory({ baseYear, baseEmissions, targetYear, reductionPct, method }) → Point[]` — linear ACA path, year-by-year. Used to draw the ReferenceLine and to compute gap-to-target.
- `requiredScope3Categories(scope3Breakdown) → { category, pct, required }[]` — flags every category ≥5%.
- `validateTargetConfig(target, profile) → { ok, reasons[] }` — version-aware rule check (e.g. v2 rejects `s1s2_combined`; v2 S2 must be `s2_location`; absolute required when high-growth; S3 coverage gaps).
- `progressStatus(actual, trajectory, effortEvidence) → on_track | off_track | best_efforts` — drives the dashboard status chip.
- `renewalTightening(prevTarget, performance) → reductionPct` — the ratchet for V2.0 renewal targets.
- `cycleState(cycle, today) → { phase, renewalDue, transitionPlanDue }`.

Mirror `addOnRequirementsMet`'s `{ ok, reason }` contract so callers get a single authority with a usable reason string.

---

## 5. Target-setting wizard (UI)

Reuse the GHG wizard scaffolding (stepper, sticky save bar, dirty-state/`beforeunload` guard, the prominent contextual save nudge you just shipped in be1056b).

1. **Standard version** — V1.3.1 vs V2.0 (default V2.0; show the timeline so they understand "submit on V1.3.1 today, V2.0-ready").
2. **Company profile** — revenue, employees, electricity-growth → live Category A/B chip via `categorize()`; surfaces the absolute-S2 requirement when high-growth.
3. **Base year** — pre-filled from the existing inventory; per-scope base-year emissions.
4. **Near-term targets** — separate S1, S2 (location-based), S3 cards; ACA-suggested reduction with an editable field; intensity locked off when absolute is required.
5. **Scope 3 coverage check** — pulls the ≥5% category list from `requiredScope3Categories()`; same gap/coverage UX language as the concierge coverage check; export-gated on no unresolved required categories.
6. **Review & commit** — `validateTargetConfig()` blocks commit on hard failures; shows reasons. "Committed" ≠ "Validated" — explicit copy.

---

## 6. Dashboard monitoring surfaces

Extend the existing multi-year GHG trends dashboard rather than building a parallel screen.

- **Trajectory overlay** — add the SBTi target line as a second ReferenceLine alongside the existing baseline ReferenceLine, per scope.
- **Gap-to-target metric card** — current-year actual vs trajectory point, in tCO2e and %.
- **Per-scope progress strip** — S1 / S2 / S3 mini status (mirrors the intensity strip pattern).
- **Scope 3 coverage panel** — categories ≥5%, which have targets, which are gaps.
- **Cycle & renewal card** (V2.0) — cycle phase, renewal due, `on_track / off_track / best_efforts` chip from `progressStatus()`.
- **Category A checklist** (V2.0) — transition-plan-due countdown, assurance-readiness, OER intent declared y/n.

---

## 7. V2.0 accountability layer (Phase 4)

- **Best-efforts status** — when off-track, prompt for barrier/effort evidence; status becomes `best_efforts` only with evidence captured (audit row), never silently.
- **Renewal ratchet** — at cycle end, `renewalTightening()` proposes the tightened reduction; confirm-before-commit, with an audit trail row (same pattern as concierge `coverage_resolution`).
- **Climate Transition Plan** — Category A: a checklist/scaffold (decarbonisation pathway, milestones, board accountability, annual reporting) with the 12-month-from-validation due date tracked in `sbti_cycle`. MVP = checklist + due-date tracking; full plan authoring can follow.
- **OER intent** — capture participate/decline at commit; store the decline rationale (it becomes public on the SBTi dashboard within 6 months of validation — flag that to the user).

---

## 8. Export / methodology / disclaimers

- SBTi target summary block in GHG reports: per-scope targets, base year, trajectory, current progress, `standard_version` stamped on every figure.
- Add an SBTi methodology section to the per-module methodology doc set (same programmatic-update path as the eight existing methodology docs): standard version, ACA method + parameter source, location-based S2 basis, 5% S3 rule, what the tool does/does not do.
- **Disclaimer (propagate to all SBTi surfaces):** ThemisIQ supports target preparation and ongoing monitoring; it does not validate targets, and figures shown are management estimates, not assured unless independently verified. Route through counsel like the GHG Category-A disclaimer.

---

## 9. Synergies — why this is mostly assembly, not greenfield

- **Location-based S2 requirement** ↔ your year-aware grid factors + location/market/residual-mix split. Already built.
- **5% Scope 3 rule** ↔ Supply Chain & Scope 3 module category data.
- **Mandatory assurance (Cat A)** ↔ Verification Readiness add-on + verifier portal + methodology docs.
- **Continuous monitoring** ↔ `ghg_monthly_emissions` persistence + trends dashboard.
- **Supplier engagement under V2.0** ↔ your supplier portal + the planned GHG supplier cross-sell (V2.0 makes Tier-1 suppliers of Category A firms expected to set their own targets — a real cross-sell hook).

---

## 10. Pricing / entitlement / checkout (last)

- Encode the D2 outcome in `lib/pricing.ts` and gate via the `addOnRequirementsMet` chain (SBTi requires GHG, like concierge/verification).
- If Professional-tier differentiator: gate the target-setting wizard + V2.0 accountability layer; leave basic target-monitoring at Essentials.
- Wire checkout **last**, against live Stripe, after the feature is production-proven (your concierge Phase 4/5 order). Apply the "12 months access, multiple reports" copy fix here.

---

## 11. Phasing & ship gates

| Phase | Scope | Gate |
|---|---|---|
| **0** | Lock D1–D4; confirm thresholds/ACA against primary standard (§ verification) | Decisions recorded |
| **1** | Migrations (tables + RLS) saved as files; `lib/sbti.ts` + params; **≥15 unit tests** | Tests green, build green |
| **2** | Target-setting wizard (S1, S2-location, S3 ≥5%) | Vercel green; manual e2e |
| **3** | Dashboard monitoring (trajectory overlay, gap card, S3 coverage panel) | Vercel green; real inventory test |
| **4** | V2.0 accountability (cycle, best-efforts, renewal ratchet, Cat A checklist, OER intent) | Vercel green |
| **5** | Export + methodology doc + disclaimers (counsel review) | Counsel sign-off |
| **6** | Pricing + checkout wiring (live Stripe) | Live smoke test |

Per phase: CC proposes diff → Lisa runs `npm run build` → stage named files → push → **wait for Vercel green**. DB migrations applied in Supabase **and** committed as files.

---

## 12. Open verification items (confirm against the final standard PDF, not blogs)

1. **Exact Category A thresholds** — sources vary (≈$1B revenue / 500 employees vs ~$450M / 1,000 employees for medium firms in high-income markets). Pull the precise revenue/employee/emissions figures and any geography conditions from the final V2.0 text → `lib/sbti/params.ts`.
2. **ACA reduction rate + base-year rules** post the 29 Apr 2026 ACA update.
3. **Net-zero long-term target requirements** (residual emissions %, neutralisation rules) — needed before Phase 4 net-zero target support.
4. **Effective vs mandatory dates** — secondary sources blur "effective 1 Feb 2027" with "mandatory 1 Feb 2028"; the wizard timeline copy must use the SBTi's own dates.
5. **Limited-assurance scope** wording for Category A, to align the Verification Readiness cross-sell.

---

*Source: SBTi Corporate Net-Zero Standard V2.0, published 11 June 2026. Verify all numeric criteria against the primary standard document before they are hardcoded — accuracy forms trust.*
