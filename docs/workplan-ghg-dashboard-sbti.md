# Workplan — Multi-year GHG Dashboard + SBTi

**Created:** 2026-06-20 (end of session). **Save to:** `docs/`.
**Purpose:** Tomorrow's build plan. Finish the company-identity refactor, then build the multi-year trend + SBTi dashboard on that foundation.

**Working discipline (unchanged):** `main` auto-deploys to live production. Edits are CC proposals only — CC never runs git. `npm run build` is the go/no-go gate. `git add <specific file>` (never `-a`), commit, push by hand. DB migrations are hand-run in the Supabase SQL editor, then the `.sql` is `cp`'d into `supabase/migrations/` as documentation. One step at a time; verify before moving on.

---

## State at end of 2026-06-20 (what's already done)

The company-identity refactor is **steps 1–4 complete and verified on production**:
- `companies` table live (RLS, owner-scoped, grants fixed).
- `ghg_inventories.company_id` column added (nullable, FK `ON DELETE SET NULL`, indexed).
- Backfill done — every existing inventory linked to a company (verified: 0 unlinked).
- Save path resolves-or-creates `company_id` (4a); dup guard keyed on `company_id + reporting_year`.
- Company field is now select-or-create, locked once `inventoryId && company_id` (4b). Drift fix proven: same company name reused → same id, no duplicate.

Scope 3 persistence is **fully closed** (prior in session): `scope3_inventories` table bound to inventories by `inventory_id`, save + restore + signpost all live. `series.ts` is **built but not yet placed in the repo** (sitting in outputs) — it already assembles S1/S2/S3 per year, baseline, YoY, vs-baseline, intensities, and a `gwpConsistent` flag, S3-forward-compatible.

---

## PART A — Finish the company-identity refactor

### Step 5 — point Scope 3 + series grouping at `company_id`
Move the multi-year grouping and the `scope3_inventories` relationship from free-text `company_name` to the stable `company_id`. This is the payoff of steps 1–4 — grouping stops depending on identical typing.
- Series load groups inventories by `company_id`, not `company_name`.
- Confirm the Scope 3 join (already on `inventory_id`, which rolls up to a company via the inventory) reads cleanly per company.
- Mostly query/logic; build-gated. Recon first (how the eventual series load assembles rows).

### Step 6 — optional `NOT NULL` on `company_id`
Tighten once everything writes it (all existing rows backfilled; new saves write it via 4a). Low-risk hardening; safe to defer indefinitely. Only do it after confirming no write path can produce a null.

*Closing Part A makes the foundation solid enough to build visuals on.*

---

## PART B — Build the multi-year GHG dashboard (trends + SBTi)

### Phase 1 — Series foundation in the repo
- Place `series.ts` into `lib/ghg/` (matches the `lib/vsme/` namespacing precedent; SBTi pathway logic will live nearby).
- Build the data load: one PostgREST nested-embed call —
  `ghg_inventories.select('id, company_id, reporting_year, scope1_total, scope2_location_total, scope2_market_total, scope3_inventories(total_scope3_tco2e)')` — grouped by `company_id` in JS. (Embed is to-one because `scope3_inventories.inventory_id` is unique; FK is live so PostgREST resolves it. Two-query JS-merge fallback if PGRST200.)
- New route `app/dashboard/ghg/trends/page.tsx` → `/dashboard/ghg/trends`, gated on `useEntitlement('ghg')` (Scope 3 has no separate entitlement; `ghg` unlocks both).

### Phase 2 — Trend visuals on real data
Rebuild the *good* parts of the prototype (`ThemisIQGhgDashboard.jsx`) against real data:
- Emissions over time by scope (S1 / S2 / S3).
- Intensity views (per-$M revenue, per-FTE).
- YoY and vs-baseline deltas; baseline = earliest reporting year (overridable later).
- Data-quality view (the activity-vs-spend split — which is also the ESRS E1 primary/secondary concept).
- Company selector at the top, driven by the now-stable company list.
- **DO NOT carry the prototype's flat 4.2%/yr pathway forward — it is wrong and stays out.**

### Phase 3 — SBTi target persistence
Build the `sbti_target` table from §5 of `docs/sbti-target-spec.md` (rebuilt today), plus the target-setting UI.
- Target is a **set of rows** (per scope, per method), not one number.
- Stores the customer's validated rate / base year / target year / method **as inputs**.
- V1.3.1/V2.0-aware (`standard_version`); status `indicative` / `committed` / `validated`.
- Scope 3 coverage %, long-term residual %, land-sector flag, `gwp_version` on the row.
- **Hand-run table → remember the grant-gap lesson** (see flagged items); verify `authenticated` grants after creating it.

### Phase 4 — SBTi pathway view
- Render `base_year_emissions × (1 − rate)^(year − base_year)` against the actuals series on a shared axis.
- Per target: measured actuals, gap-to-pathway (tCO₂e and %), status badge, Scope 3 coverage %, long-term/net-zero marker.
- **Suppress the pathway line for non-rate methods** (e.g. Scope 2 low-carbon-electricity alignment, supplier engagement) — show the method + status instead, never a fabricated curve.
- Land-sector (food/agri, e.g. Bay State Milling): separate land-sector pathway rows, no-deforestation; don't fold into the standard curve.

### Phase 5 — polish & framing
- ESRS E1 / VSME scope qualifiers in copy.
- Trend-view company-selector edge cases.
- Anything surfaced during the build.

---

## Design boundaries (non-negotiable — lead the SBTi work with these)

1. **Store, never derive.** The dashboard records the customer's validated SBTi rate, base year, and target year as inputs. It does **not** recompute them — the real ACA rate math depends on base year + net-zero year and lives in SBTi's **Methods & Pathways** doc (still in draft; final due Q4 2026). We are not re-deriving SBTi math we might get wrong.
2. **Same GWP basis.** The target's base-year emissions and the actuals series must both be **AR6** (the basis shipped today), or the gap-to-pathway is apples-to-oranges. `sbti_target` carries `gwp_version`; assert it matches the inventory series.
3. **`indicative` until validated.** Anything not validated through the SBTi portal renders as `indicative`. The app does not validate targets.
4. **V2.0 target-year rules (confirmed against the current standard):** near-term = 5–10 years from submission year (H1 2026 → 2030–2035; H2 2026 → 2031–2036); 2030-target holders set next cycle 2030–2035 under V2.0 from 2028; net-zero by 2050 at latest, now **optional**; base year aligns to financial reporting, no exclusions; V2.0 mandatory for new submissions from 1 Feb 2028, V1.3.1 open until then. Scope 2 primary method is now low-carbon-electricity alignment (<0.048 → 0.024 kgCO₂/kWh in 2035); Scope 3 required for all Category A.

---

## Flagged items (don't lose; not blocking the above)

**Pre-launch (now confirmed, not optional):**
- **Hand-run-grant audit.** Confirmed a real, repeatable gap — hit on BOTH `scope3_inventories` and `companies` today (hand-run `CREATE TABLE` in the SQL editor skips the `authenticated` row grants). Run the all-tables grant query and fix any customer-writable table that's short:
  ```sql
  select table_name, string_agg(privilege_type, ',' order by privilege_type) as authenticated_grants
  from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
  group by table_name order by table_name;
  ```
  Any customer-writable table missing SELECT/INSERT/UPDATE/DELETE needs:
  `grant select, insert, update, delete on table <t> to authenticated;`
- Append the `grant` lines into the `companies` and `scope3_inventories` migration files.
- `cp` the new `.sql` files into `supabase/migrations/`: `20260620_companies.sql`, `20260620_ghg_inventories_company_id.sql`, `20260620_scope3_inventories.sql` (and note the backfill was run directly, not filed).

**Smaller carries:**
- ESRS E1 wizard-card copy: stale "FY2024" deadline; add the post-Omnibus scope qualifier (mandatory for 1,000+ employees AND €450M+ turnover; smaller companies report Scope 3 voluntarily, typically via VSME). Wizard copy only, contained.
- Scope 3 factor-vintage note in `lib/emissionFactors.ts` — the DEFRA/Exiobase factors carry no publication year; add a vintage header for auditor rigor (one-line, plus the `factor_basis` string on save).
- 12-month / multi-report marketing copy (in memory): make explicit that a module purchase = 12 months access + multiple reports, not one report. Apply at next repricing / marketing revision.

---

## Suggested order for tomorrow
A-5 → A-6 (optional) → B-1 (place `series.ts` + data load + route) → B-2 (trend visuals) → B-3 (`sbti_target` table) → B-4 (pathway view) → B-5 (polish). Pre-launch grant audit can slot in any time as a focused pass; it's independent of the dashboard build.
