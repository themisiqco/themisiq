# CBAM Exporter-Side SEE Module — Phase 1 Implementation Spec (Iron & Steel, EAF-first)

**Companion to:** `cbam-see-recon-iron-steel.md` (the verified methodology). This doc turns that into a buildable module.
**Scope:** exporter/supplier-side, iron & steel, **EAF single-process MVP**. Precursors in; indirect out **for the scrap-EAF MVP** (all chapter-72 goods are Annex II direct-only) — but **not universally**: sintered ore (2601 12 00) is NOT in Annex II and carries indirect, so the DRI/pig-iron chains gain an indirect term at their base (see §5 note + invariant 11). Integrated-plant complexity (waste-gas/heat/cogeneration corrections) deferred to Phase 2.
**All arithmetic references equations verified from IR 2025/2547 in the recon §6a.** Do not re-derive; cite by name, never by equation number (the source reuses number 52).
**Conventions:** mirrors `lib/ghg/` (pure engine + test suite) and `lib/sbti/` (params/engine/test split). CC implements; Lisa runs git (stage by filename, never `-A`; Vercel green is the ship gate). Terse numbered steps, one at a time.
**Migration/DB discipline (learned the hard way on the reference tables):** one source of truth per change, single transcription, one direction. Either CC writes the migration file → Lisa applies *that file's* contents verbatim; or Lisa applies SQL → CC writes *exactly what was run*. **Never both transcribing the same paste independently** — that's what caused repeated file/DB drift. For the seed migration especially: CC writes the seed file from verified values → Lisa applies that file → verify counts. After any hand-edit to a live table, read the live rows back and diff against the file before moving on. Prefer `create table if not exists` + idempotent seeds so a replay is a no-op, never a destructive `drop`.

---

## 0. Product model (decided 17 Jul 2026 — the module's shape)

**CBAM is a standalone module, sibling to GHG, not a child of it.** A customer may already own a GHG inventory, but CBAM SEE is a different calculation (product-level per-tonne, recursive precursor roll-up — not corporate inventory). Own engine (`lib/cbam/`), own tables (`cbam_*`), own surface, sold separately. Shares only the reference layer (emission factors, the eventual canonical country list).

**The offering reuses three things already built — it is the verification offering with a CBAM engine underneath:**
1. **Intake = the Concierge pattern.** Customer uploads statements/invoices → extraction → value + source quote + confidence → **confirm-to-accept**. For CBAM the "bill" is installation energy/materials data feeding the mass-balance `SourceStream` inputs; the machinery (upload, extract, provenance, confirm) is proven on production.
2. **Calculation = the SEE engine** (this spec).
3. **Assurance = the existing verifier invite-consent gate** (`/verify/[token]`, affirmative consent, `verifier_accept_invite` RPC, hard-gate on source docs until `accepted_at`). Repointed at a CBAM report.

**The trust chain (why the module is shaped this way):**
`exporter installation → accredited verifier (checks the SEE calc) → verified figure → importer (receives 1.2 summary) → EU declaration → national competent authority (audits that verification happened)`.
The EU does **not** recalculate; it audits that a valid accredited-verifier report backs the number. ThemisIQ produces the data and gets it verification-ready; it **never** produces the certificate (importer's registry action) and **never** issues assurance (the accredited verifier does).

**ASSURANCE LEVEL = REASONABLE, not limited** (confirmed from IR 2025/2546 + the Commission verification page, 17 Jul 2026). Verification is risk-based to a reasonable-assurance standard that the operator's emissions report is free from material misstatement; **materiality is 5%, set at goods level**; first verification requires a physical site visit. Reasonable assurance is the *higher* bar — which makes ThemisIQ's evidence discipline (per-statement drill-down, provenance-per-precursor, fail-loud) a moat, not a burden: it's exactly what makes reasonable assurance cheap for the verifier. Anywhere earlier drafts say "limited assurance," read **reasonable**.

**Verifier requirements (regulation-confirmed):** must be accredited under **EN ISO/IEC 14065 by a National Accreditation Body in the European Accreditation (EA) network** (DR 2025/2551 + IR 2025/2546). The verifier is explicitly NOT accredited/selected by an importer, supplier, consultant, **or software provider** — *software provider names ThemisIQ*. Therefore ThemisIQ is a **signpost, not a directory**: provide a public link to the authoritative accredited-verifier register (convenience, ISO-14064-3-compatible), never select/rank/profit from the choice. Timing: verifiers register in the CBAM Registry from **1 Sep 2026**; the Commission's consolidated accreditation-and-verification guidance publishes **summer 2026** — so the "which register to link" recon must check current/imminent Commission material. Verifier fees €5k–€50k per installation → the value prop: a clean data package makes that expensive verification faster/cheaper.

**Two-face report (same computation, two audiences — the Annex IV split made concrete):**
- **1.1 full operator's emissions report → the VERIFIER.** 35 items, evidence-linked, with per-`SourceStream` drill-down (the July verifier-surface mechanism: click a figure → open its source PDF via signed URL, hard-gated behind consent). This is the "prove the calc" artifact. **In scope — it's what makes the number declarable, not a Phase-2 nicety.**
- **1.2 summary emissions report → the IMPORTER**, post-verification. 16 items, disclosure-bounded (operator may withhold 1.1 fields). This is the "like-for-like" hand-off the importer lifts into their EU declaration. **Target 1.2 for the importer hand-off — never 1.1, or you leak fields the operator is entitled to withhold.**
- **Comparison-to-default → the EXPORTER only** (decision/business-case artifact — computed SEE vs country-specific default). Never in either regulatory template; keep it out of importer-facing artifacts (reads as sales, corrodes trust).
- Format: no external Commission Excel exists (definitive regime routes through the CBAM Registry, not a spreadsheet), so "like-for-like" means the 1.2 field set cleanly structured — a readable report (trust/provenance) + copy-friendly structured data (machine transfer). Both faces built on 1.2's fields; the readable report elaborates 1.2 for trust but **never adds a 1.1 field** (withhold-rights line).

**Report field-mapping notes (from Annex IV recon, 17 Jul 2026):**
- Annex IV is a flat enumerated list, not columnar. 1.1 = items 1–35; 1.2 = 16 items. Governing article: **Article 10** (Operator's emissions report).
- **`m_i` has no verbatim Annex IV slot** — Annex III Eq 61 says it's communicated, but Annex IV collects absolute precursor quantities (items 18–21) + activity level (item 30) instead. Decision: formal hand-off emits the Annex-IV-named fields (quantities + activity level, importer derives `m_i`); surface `m_i` in the *readable* version as a computed convenience.
- **Indirect SEE is reported only for non-Annex-II goods** (item 15(e)) — matches invariant 11: emit indirect for sintered ore, suppress for the five chapter-72 goods.
- **Provenance is richer than a boolean:** item 15(d) wants the *share* of emissions using defaults (a %); items 22/23 split precursors into two lists (default-used vs actual-used), not one flagged list. Report layer needs a small aggregation over `computeSEE` output.
- **No verification fields in Annex IV** (it's the input to verification, not the output) — but it carries confirmations that evidence was submitted to the verifier. The verifier's report is a separate artifact ThemisIQ does not produce.

**Country-specific defaults (decided 17 Jul 2026):** the importer applies the **country-specific** default; "other" is the genuine fallback only when a country×good value is unpublished (confirmed from 2621 + the Turkey-cement case). Comparing against "other" when a country value exists overstates the customer's advantage — an accuracy violation. **Seed targeted country defaults** for 13 exporters — CN, TR, IN, KR, UA, GB, ID, EG, TW, JP, US, VN, CA (Eurostat EU-import ranking + Canada) — **crude steel + precursor CN codes only** (~15–20 codes × 13 countries, not all 200). Version-stamp the seed (2621 is revised periodically; Dec 2027 latest). Resolver's `country → 'other'` fallback already handles gaps.

---


---

## 1. Module layout

```
lib/cbam/
  params.ts        constants + the steel category tree (types, not DB)
  types.ts         domain types (SourceStream, PrecursorInput, SEEResult…)
  engine.ts        PURE functions — no DB, no I/O, fully testable
  engine.test.ts   unit + golden-fixture suite (mirror the GHG 27-test pattern)
supabase/migrations/
  <ts>_cbam_reference.sql     reference tables + steel seed
  <ts>_cbam_customer.sql      per-customer tables + RLS + RPCs
app/dashboard/cbam/           UI (scoping → calc → compare → hand-off) — later steps
app/api/cbam/                 SECURITY DEFINER RPCs, column-whitelisted
```

Engine stays pure exactly like `lib/ghg/engine.ts`: it takes plain data in, returns plain data out. All DB access is in the API/route layer, never the engine. This is what makes the 27-test discipline possible.

---

## 2. Reference-data seed — the steel category tree (seedable NOW from 2547 Annex I)

Six categories, functional unit = tonne, complete primary-source data (no pull). **Five are Annex II (direct-only); `sintered_ore` is NOT** (chapter 26 ore, not in Annex II → carries both direct and indirect). The `annex_ii_direct_only` flag is `true` for the five chapter-72 categories, `false` for `sintered_ore`.

| category code | label | CN codes (Annex I) | routes | precursors |
|---|---|---|---|---|
| `sintered_ore` | Sintered Ore | 2601 12 00 | — | none (chain root) |
| `pig_iron` | Pig Iron | 7201 (+ some 7205) | `blast_furnace`, `smelting_reduction` | `sintered_ore` |
| `dri` | DRI | 7203 | `direct_reduction` | `sintered_ore` |
| `ferroalloy` | FeMn/FeCr/FeNi | 7202 1, 7202 4, 7202 6 | `submerged_arc` | `sintered_ore` |
| `crude_steel` | Crude steel | 7206, 7207, 7218, 7224 | `bof`, `eaf` | `pig_iron` (bof), `dri` (eaf), `ferroalloy` (alloy/stainless) |
| `iron_steel_products` | Iron or steel products | 7205, 7208–7229, 7301–7311, 7318, 7326 | (rolling/forging/coating) | `crude_steel` |

**Precursor edges (the tree):**
```
iron_steel_products → crude_steel → {pig_iron→sintered_ore, dri→sintered_ore, ferroalloy→sintered_ore}
```
Scrap is a **non-CBAM good** → not a precursor, contributes zero (only enters via mass-balance carbon accounting).

**Two CN-mapping rules that must be in the lookup, not left to chance:**
1. **Prefix match, not exact.** Annex I lists some entries as 4-digit HS headings (e.g. `7201`, `7202 1`). A listed heading covers *all* CN codes beneath it. Scoping lookup matches by longest listed prefix, not equality.
2. **Crude-steel vs products split.** Only `7206/7207/7218/7224` are `crude_steel`, and only *primary* hot-rolling/rough-forging to semi-finished sits in that category. **All other rolling/forging → `iron_steel_products`.** Same physical plant, two categories — the CN code decides.

---

## 3. DB schema — reference tables (`cbam_*`, versioned like `mr_*`)

```sql
create table public.cbam_goods_categories (
  code               text primary key,           -- 'crude_steel', 'dri', …
  label              text not null,
  greenhouse_gases   text[] not null default '{CO2}',
  annex_ii_direct_only boolean not null,          -- true for ch.72 steel; FALSE for sintered_ore (ch.26 ore, not in Annex II)
  functional_unit    text not null,               -- 'tonne' (steel); 'tonne_clinker'/'kg_N' later
  provenance         text not null default 'primary',
  source_ref         text                          -- 'IR 2025/2547 Annex I Table 1'
);

create table public.cbam_cn_map (
  cn_prefix          text primary key,             -- '7201', '2601 12 00' — match by longest prefix
  category_code      text not null references public.cbam_goods_categories(code),
  description        text
);

create table public.cbam_precursor_edges (
  category_code           text not null references public.cbam_goods_categories(code),
  precursor_category_code text not null references public.cbam_goods_categories(code),
  primary key (category_code, precursor_category_code)
);

create table public.cbam_production_routes (
  category_code text not null references public.cbam_goods_categories(code),
  route_code    text not null,                     -- 'eaf', 'bof', 'blast_furnace'…
  boundary_note text,
  primary key (category_code, route_code)
);

-- 2621 default values — SCHEMA now, DATA pulled by CC (step 2). Lookup, not logic.
-- cbam_default_values — schema deliberately NOT reproduced here (sketch struck 28 Jul 2026).
--   AUTHORITY: supabase/migrations/20260716_cbam_default_values.sql
--   Rationale and design lineage in the note immediately below this fence.
```

**`cbam_default_values` — why there is no sketch above.** A `create table` sketch sat at that position from the original design until 28 July 2026, when it was struck. It had drifted from the shipped schema on every field, and because it was executable DDL rather than prose, it was one copy-paste away from creating a table that disagreed with the seed.

The consequential divergence: the sketch annotated `see_direct` as *including mark-up*. The built table does not — `see_direct` holds the annex's raw direct-emissions figure, and the three mark-up-inclusive values are separate numeric columns (`markup_2026`, `markup_2027`, `markup_2028_plus`), transcribed rather than derived, applying to **total** not direct. A table built from the sketch would have been misread by the compute route by the full mark-up: 10 % in 2026 rising to 30 % from 2028. Other divergences: `cn_prefix` (shipped as `cn_code`), `route_code` in the key (shipped without), `markup_note text` (shipped as three `numeric` columns), and `description` / `see_indirect` / `see_total` / `cbam_bm_route` all absent.

**Design lineage worth keeping.** The model was originally conceived as prefix-keyed *and* route-keyed — `primary key (cn_prefix, country, route_code)`. Both ideas proved wrong for value lookup, and knowing that is why two later rules exist. Prefix matching survives for **category resolution only** (§10.7, first binding rule); `cbam_cn_map.cn_prefix` is genuinely prefix-keyed and is not affected by this correction. Route was found not to key default values at all (§10.15, route-independence confirmed correct) and survives only as a trailing benchmark attribute. The shipped PK is `(cn_code, country)`.

**Rule going forward: the migration is the schema.** This spec explains *why* the schema looks as it does; it does not restate *what* it is. A second copy of a schema has nothing keeping it honest — no test, no build, no lint — and this one drifted onto the single column that most mattered. Where a reader needs the columns, the migration is one file away and correct by definition.

Reference tables are world-readable (no RLS) — they're published law, like `mr_*`. `active` column deliberately omitted (learned from the `mr_jurisdictions.active` dormant-column trap — don't add a column no query reads).

---

## 4. DB schema — per-customer tables (+ RLS done right from the start)

**Bake in the standing `company_id` ownership gap fix here** — every table carries `company_id` and enforces `WITH CHECK`, so this module never inherits the write-side hole the GHG/SBTi tables have.

```sql
create table public.cbam_installations (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  country       text not null,
  created_at    timestamptz not null default now()
);

create table public.cbam_production_processes (
  id             uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.cbam_installations(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  category_code  text not null references public.cbam_goods_categories(code),
  route_code     text,
  activity_level numeric not null,                 -- AL_g, tonnes produced in the reporting period
  reporting_period int not null,                   -- calendar year (>= 2026)
  calc_mode      text not null default 'actual'    -- 'actual' | 'default' | 'combined'
);

create table public.cbam_source_streams (
  id            uuid primary key default gen_random_uuid(),
  process_id    uuid not null references public.cbam_production_processes(id) on delete cascade,
  company_id    uuid not null references public.companies(id) on delete cascade,
  name          text not null,
  stream_kind   text not null,                     -- 'fuel' | 'process_material' | 'output'
  activity_data numeric not null,                  -- AD_k [t]. OUTPUTS ARE NEGATIVE. (Eq 12 sign convention)
  cc_mode       text not null,                     -- how CC_k is derived: 'direct'|'ef_per_t'|'ef_per_tj'
  carbon_content numeric,                          -- CC_k, if cc_mode='direct'
  emission_factor numeric,                         -- EF_k, if cc_mode='ef_*'
  ncv           numeric,                            -- if cc_mode='ef_per_tj'
  biomass_fraction numeric not null default 0      -- BF_k, conservative default 0
);

create table public.cbam_precursor_inputs (
  id             uuid primary key default gen_random_uuid(),
  process_id     uuid not null references public.cbam_production_processes(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  precursor_cn_prefix text not null,
  precursor_category_code text not null references public.cbam_goods_categories(code),
  mass_consumed  numeric not null,                 -- M_i: TOTAL mass consumed to make AL_g, NOT mass embodied
  boundary       text not null,                    -- 'joint' | 'separate_internal' | 'external'
  provenance     text not null,                    -- 'computed_here' | 'actual_verified' | 'default'
  origin_country text not null,                    -- for EU/exempted zero-rating
  see_value      numeric,                          -- populated for actual_verified / computed_here
  verifier_report_id text,                         -- REQUIRED when provenance='actual_verified'
  reporting_period int not null
);

create table public.cbam_see_records (               -- computed output + audit
  id             uuid primary key default gen_random_uuid(),
  process_id     uuid not null references public.cbam_production_processes(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  cn_prefix      text not null,
  see_total      numeric not null,                 -- SEE_g [t CO2e / t]
  ae_g           numeric not null,                 -- specific attributed (own process, no precursors)
  precursor_contribution numeric not null,         -- Σ m_i · SEE_i
  default_compared numeric,                         -- 2621 default for this cn/country
  delta_vs_default numeric,                          -- see_total − default_compared (negative = beats default)
  workings       jsonb not null,                   -- buildWorkings-style audit trail
  unresolved     jsonb not null default '[]',      -- LOUD failures (missing verifier reports etc.)
  computed_at    timestamptz not null default now()
);
```

**RLS on all five per-customer tables** (SELECT/INSERT/UPDATE/DELETE), authenticated-owner, with the WITH CHECK the other modules are missing:
```sql
alter table public.cbam_production_processes enable row level security;
create policy cbam_pp_owner on public.cbam_production_processes
  using      (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));
-- same pattern for installations, source_streams, precursor_inputs, see_records
```
Anon has **no** direct table access; all reads via SECURITY DEFINER RPCs with explicit column whitelists (the pattern proven in the supplier-portal IDOR fix — never `to_jsonb(row)`).

---

## 5. Engine module (`lib/cbam/engine.ts`) — pure functions

```ts
// params.ts
export const CO2_C_RATIO = 3.664;   // f — molar mass CO2/C. Eq 12. Hard constant.

// types.ts (abbreviated)
type SourceStream   = { kind:'fuel'|'process_material'|'output'; ad:number; /* neg for output */
                        cc?:number; ef?:number; ncv?:number; bf:number; ccMode:'direct'|'ef_per_t'|'ef_per_tj' };
type PrecursorInput = { cnPrefix:string; category:string; massConsumed:number;
                        boundary:'joint'|'separate_internal'|'external';
                        provenance:'computed_here'|'actual_verified'|'default';
                        originCountry:string; seeValue?:number; verifierReportId?:string; period:number };
type SEEResult      = { see:number; aeG:number; precursorContribution:number;
                        workings:WorkingRow[]; unresolved:UnresolvedFlag[] };
```

**Carbon content (Eq 13/14/15):**
```ts
carbonContent(s: SourceStream): number {
  let ccPre: number;
  switch (s.ccMode) {
    case 'direct':    ccPre = s.cc!; break;
    case 'ef_per_t':  ccPre = s.ef! / CO2_C_RATIO; break;            // Eq 14
    case 'ef_per_tj': ccPre = (s.ef! * s.ncv!) / CO2_C_RATIO; break; // Eq 13
  }
  return ccPre * (1 - s.bf);                                          // Eq 15; bf defaults 0
}
```

**Stream emission + mass balance (Eq 12) — the netting is the sign convention:**
```ts
streamEmissions(s): number { return CO2_C_RATIO * s.ad * carbonContent(s); }  // outputs: ad<0 → negative
massBalance(streams): number { return streams.reduce((t,s)=>t+streamEmissions(s), 0); }  // DirEm*
```

**Attribution (Eq 55, EAF Phase 1) — floor at zero:**
```ts
attributeDirect(streams): number {
  const dirEm = massBalance(streams);
  // Phase 1 EAF: Em_H,*, WG_corr,*, Em_el,prod all = 0. Phase-2 hook below.
  return Math.max(0, dirEm);                        // "negative value shall be set to zero"
}
// Phase 2: attributeDirect = max(0, dirEm + emHimp − emHexp + wgCorrImp − wgCorrExp − emElProd)
```

**Recursive roll-up (Eq 62/63/61) + provenance resolution:**
```ts
computeSEE(process, precursors, ctx): SEEResult {
  const aeG = attributeDirect(process.streams) / process.activityLevel;   // Eq 57/63
  let precSum = 0; const workings=[], unresolved=[];
  for (const p of precursors) {
    if (p.boundary === 'joint') continue;            // folded into aeG already — never double-count
    const m_i = p.massConsumed / process.activityLevel;                    // Eq 61
    const r = resolveSEE(p, ctx);
    if (r.unresolved) unresolved.push(r.unresolved);
    precSum += m_i * r.value;                          // Eq 62 term
    workings.push({ precursor:p.cnPrefix, m_i, see_i:r.value, provenance:r.usedProvenance });
  }
  return { see: aeG + precSum, aeG, precursorContribution: precSum, workings, unresolved };
}

resolveSEE(p, ctx): { value:number; usedProvenance:string; unresolved?:UnresolvedFlag } {
  if (isEuOrExempted(p.originCountry)) return { value:0, usedProvenance:'eu_zero_rated' };  // Eq 60 rule
  switch (p.provenance) {
    case 'computed_here':                              // separate internal process — recurse
      return { value: computeSEE(ctx.process(p), ctx.precursors(p), ctx).see, usedProvenance:'computed' };
    case 'actual_verified':
      if (!hasValidVerifierReport(p, ctx))             // report must cover p.period, accredited scope
        return { value: defaultLookup(p, ctx), usedProvenance:'default_fallback',
                 unresolved:{ precursor:p.cnPrefix, reason:'missing_or_invalid_verifier_report' } };  // LOUD
      return { value: p.seeValue!, usedProvenance:'actual_verified' };
    case 'default':
      return { value: defaultLookup(p, ctx), usedProvenance:'default' };
  }
}
```

**Comparison hero:**
```ts
compareToDefault(see, cnPrefix, country, ctx) {
  const def = defaultLookup({cnPrefix,country}, ctx);
  return { computed: see, default: def, delta: see - def };   // delta<0 = actual beats default → the pitch
}
```

---

## 6. Engine invariants (→ CLAUDE.md, and as header comments in engine.ts)

Pin these — each is a real trap already identified from primary source:

1. **`CO2_C_RATIO = 3.664`** (molar CO₂/C). One definition, `params.ts`, never inlined.
2. **Mass-balance netting is the sign convention** — outputs carry negative `ad`; a single `reduce` nets carbon-in minus carbon-out. Never compute two totals and subtract.
3. **`AttrEm` floored at zero** — `max(0, …)`. Heavy heat/power export can drive it negative; the reg forbids negative attributed emissions.
4. **EU/exempted-origin precursor → SEE_i = 0** (Eq 60). This is a *legitimate* zero — the only one. Distinguish from a missing value.
5. **Missing data is not zero.** A precursor claiming `actual_verified` without a valid verifier report for the exact period → **fall to default AND emit an `unresolved` flag.** Never a silent zero, never a silent accept. ("Absence of data is not a value.")
6. **Boundary-membership decides double-counting** — `joint` precursor is inside `AttrEm`, skip it in the precursor sum; `external`/`separate_internal` are added via Σ m_i·SEE_i. Getting this wrong = double-count or omit.
7. **`M_i` is total mass *consumed*, not embodied** — includes spilt/cut/combusted/scrap. Never derive it from the product BOM.
8. **`m_i` is the hand-off value** (Eq 61) — the specific mass consumption reported in the Annex IV package, activity-independent.
9. **Reference equations by name, never by number** — the source reuses number 52 (CHP split in A.2.2 vs heat-import in A.3).
10. **The dangling A.4 ref** in Annex III means **Annex II point A.4** (process division), not anything in Annex III.
11. **Indirect is PER-NODE, not a blanket steel constant.** Read `annex_ii_direct_only` off each category: `true` for the five chapter-72 categories (indirect term = 0), **`false` for `sintered_ore`** (2601 12 00 — chapter-26 ore, NOT in Annex II, carries direct AND indirect; 2621 shows its populated indirect default while ch.72 goods show N/A). **Scrap-EAF MVP stays purely direct** (no sintered ore in chain). **DRI/pig-iron chains inherit indirect at their sintered-ore base** → those phases need Annex II §D and cannot assume indirect = 0. A blanket "steel = direct-only" is an *under-reporting* bug (understates a verifier-facing figure). Tripwire: Annex II membership also splits *within* heading 7202 — the per-category boolean is safe only because `cbam_cn_map` maps exactly the three in-scope ferroalloys (7202 11/19/41/49/60); ferro-silicon/moly/tungsten/etc. and 7204 scrap are excepted, outside CBAM scope. Extending the ferroalloy mapping requires per-CN Annex II treatment.
12. **Recursion terminates** at EU-origin (0), no-CBAM-precursor root (e.g. sintered_ore), or a default resolution. Guard against cycles (the tree is acyclic by construction, but assert it).

---

## 7. Test strategy (mirror the GHG 27-test suite)

Per-equation known-answer tests + golden end-to-end fixtures. **Fixture numbers below are synthetic — they verify arithmetic, they are NOT real emission factors or defaults.**

**Unit tests:** `carbonContent` for all three `ccMode`s; `streamEmissions` sign on an output stream; `massBalance` nets a mixed input/output list; `attributeDirect` floors a contrived-negative case to 0; `resolveSEE` for each of {eu_zero, computed, actual_valid, actual_missing_report→default+unresolved, default}; `computeSEE` skips a `joint` precursor.

**Golden fixture A — scrap-only EAF crude steel (the "beats default" case):**
```
streams: fuel (ad=100, cc=0.5) → 3.664·100·0.5 = 183.20
         electrode (ad=10, cc=1.0) → 3.664·10·1.0 = 36.64
         product output (ad=−50, cc=0.01) → 3.664·(−50)·0.01 = −1.83
DirEm* = 218.01 ; AttrEm = max(0,218.01) = 218.01 ; AL_g = 100
ae_g = 2.1801 ; no CBAM precursors (scrap non-CBAM) → SEE_g = 2.1801
compareToDefault(2.1801, default=2.50[synthetic]) → delta −0.32  ✓ beats default
```

**Golden fixture B — DRI-fed EAF + one EU-origin precursor (roll-up + zero-rating):**
```
ae_g = 2.1801 (same process)
precursor DRI: external, m_i = 1.10, SEE_DRI = 1.40[synthetic] → 1.54
precursor ferroalloy: EU origin → SEE_i = 0 (zero-rated), m_i=0.05 → 0.00
SEE_g = 2.1801 + 1.54 + 0.00 = 3.7201
```

**Golden fixture C — provenance failure (loud):**
```
precursor DRI: actual_verified but verifierReportId missing
→ value = defaultLookup(DRI) ; unresolved = [{precursor:'7203', reason:'missing_or_invalid_verifier_report'}]
assert unresolved.length === 1 AND result still computes (default used, flagged)
```

---

## 8. Build sequence (numbered, one increment, Vercel-green before next)

1. **Reference schema + steel seed.** Create `cbam_goods_categories`, `cbam_cn_map`, `cbam_precursor_edges`, `cbam_production_routes`; seed the six steel categories, CN prefixes, edges, routes from §2. World-readable, no RLS. *(Data is complete — no pull.)*
2. **`cbam_default_values` schema (empty) + 2621 data-pull.** Create the table; CC pulls IR 2025/2621 default values for iron & steel CN codes into it (parallel data task — lookup, not logic). Include the "Other countries" fallback rows. **CORRECTED 28 Jul 2026:** the original instruction here said to include the mark-up in `see_direct`. That is not what shipped, and would be wrong — `see_direct` holds the raw direct-emissions figure; the mark-up-inclusive values are three separate transcribed columns (`markup_2026`/`markup_2027`/`markup_2028_plus`) applying to total, not direct. See the §3 note.
3. **Per-customer schema + RLS + RPCs.** Five tables from §4, RLS with WITH CHECK, SECURITY DEFINER read RPCs with column whitelists. Verify cross-tenant isolation with a direct-POST curl (the supplier-portal method).
4. **Engine: mass balance.** `params.ts` + `types.ts` + `carbonContent`/`streamEmissions`/`massBalance`. Unit tests (Eq 12–15). No DB.
5. **Engine: attribution (EAF).** `attributeDirect` with the zero-floor + Phase-2 hook comment. Tests incl. the contrived-negative floor case.
6. **Engine: roll-up + resolution.** `computeSEE`/`resolveSEE`/`compareToDefault`. Tests for the boundary skip, EU-zero, provenance gate + loud unresolved. Then wire golden fixtures A/B/C.
7. **Scoping + calc surface.** UI: CN-prefix lookup → category/route → process + streams + precursors input → run engine → persist `cbam_see_records`. `buildWorkings`-style audit into `workings`.
8. **Comparison hero.** The computed-vs-default card (Deals value-at-risk pattern). Surface `unresolved` prominently — loud, not buried.
9. **Precursor collection.** Re-home the supplier-portal questionnaire for upstream precursor SEE, **verifier-report gated** (payload is a verification report, not a form field). Threads `verifier_report_id`.
10. **Hand-off package.** Annex IV operator's-emissions-report format — `m_i` per precursor, SEE_g, provenance chain, workings. *(Format needs a quick recon pull of 2547 Annex IV template 1.1/1.2 before this step.)*

Steps 1–6 are the engine and are fully specced here. 7–10 layer UI/collection/output on top and each has one small dependency noted.

---

## 9. Explicitly deferred to Phase 2 (do NOT build now)

- Integrated BF-BOF plants: the full Eq 55 correction terms — `WG_corr,imp/exp` (Annex II A.2.3), heat `Em_H,imp/exp` + cogeneration `EF_heat` (A.2.2). Requires pulling those sub-equations.
- Multi-installation / multi-period precursor weighted averaging at scale (Arts 9/14 — schema supports it; engine averaging deferred).
- Accredited-verifier integration workflow (beyond storing `verifier_report_id`).
- Benchmark / free-allocation (SEFA) adjustment (IR 2025/2620) — importer-side certificate math, out of exporter scope.
- Other sectors (aluminium adds PFCs + Annex II direct-only like steel; cement/fertiliser add indirect + clinker/nitrogen functional units + Eq 64–66).

---

## 10. OPEN QUESTIONS surfaced during the resolver build (resolve before the relevant step)

**10.1 Mark-up on defaulted precursors — METHODOLOGY GAP, not yet decided.** `defaultLookup` returns `see_direct` (un-marked-up), which is correct for the direct-only roll-up (adding `see_total`-based marked-up values into a direct-only `aeG` sum is dimensionally wrong — the mark-up in 2621 is applied to TOTAL, not direct). **But** the 2621 mark-up (10/20/30%) is the punitive mechanism that exists *because* a default is being used in place of verified actuals — and nothing in the engine currently applies it when any part of a SEE_g resolves to a default. **Does not arise for the scrap-EAF MVP** (exporter's own emissions are actual via mass balance; no precursors). **Bites the moment a DRI/pig-iron precursor falls to default.** Decision needed before the DRI/pig-iron phase: is the mark-up (a) applied to the final declared SEE_g when any input used a default, (b) out of scope because we only produce the *actual* figure and the importer/declarant applies mark-ups downstream, or (c) something else? This is an exporter-side-scope question as much as a math one — likely (b), since we're producing the data the importer declares, not the declaration itself. Confirm against 2621/2547 before building the precursor-default path.

**10.2 Country-code + CN-format contract — INPUT-LAYER requirement, fails silently in the costly direction.** (**Two bullets amended 28 Jul 2026** — the CN normalisation directive and the heading→child requirement were both superseded by §10.7 and by what shipped on 27 Jul; corrected in place below. The country-code half of this section is unchanged and remains current.) The resolver's `isEuOrExempted` and `defaultLookup` both depend on the input matching the reference data's exact string format, and mismatches fail *silently* toward over-charging (a zero-rated or seeded precursor gets a default / wrong row instead). Two specific pins for build step 3 (per-customer input schema), which defines how country-of-origin and CN codes are represented:
- **Greece: RESOLVED → `EL`** (17 Jul 2026). `EU_AND_EXEMPTED` uses `EL` (matches GHG engine + VSME); `isEuOrExempted` now normalizes `(country||'').toUpperCase().trim()` like `engine.ts`. Recon confirmed the `EL`/`GR` divergence is *internal-only* — Greece appears only in the zero-rating set (EU-origin precursors), never as a reported value or in the default table (CBAM goods originate in third countries; EU-origin is zero-rated, not defaulted). Rejection risk minimal. **Residual seam:** `defaultLookup` does a *raw un-normalized* match on `cbam_default_values.country` (correct — that table holds canonical regulation codes). So any country-specific default rows must be seeded with canonical codes; Greece won't appear there (zero-rated), but hold the `EL` convention consistent if it ever does. The rare report-emitter edge (a *listed* Greek precursor origin) follows EU *customs* convention — pin when building the report emitter with a proper CBAM Registry country-code-spec pull.
- **Exempted-territory identifiers** (Ceuta, Melilla, Livigno, Heligoland, Büsingen) — currently invented sentinels in `EU_AND_EXEMPTED`; replace with the app's actual country-of-origin representation.
- **CN code spacing.** Seed stores codes with spaces (`'7202 11'`, `'7202 60 00'`). `defaultLookup` is exact-match and un-normalised, so `p.cnCode` must match the seeded string exactly. **AMENDED 28 Jul 2026:** the original directive here — *normalise CN format at the input boundary* — is NOT what shipped, and is not what §10.7 requires. The implemented answer is **reject-if-not-a-member**, not normalise-then-accept: the setup form builds an accept-set from `cbam_default_values` and refuses anything absent from it (trimmed exact membership, no regex, no length rule, no normalisation). Stricter and safer, but the opposite instruction. Note also that a cn_code miss does **not** fall back to `'other'` — `'other'` is the *country* fallback; a cn_code miss has no fallback and throws.
- **Heading→child resolution — SUPERSEDED 28 Jul 2026 by §10.7.** The original text required heading→8-digit-child resolution before lookup. **§10.7 forbids it** (children carry differing values; the 7224 trap is the evidence), and no code performs it. Two further errors in the original: *"4-digit heading codes are unseeded"* is false as a class statement — 7201 and 7203 are seeded 4-digit headings, and 7202 11 is a seeded 6-digit code; only some headings (7206, 7207, 7211) are unseeded "see below" rows. Correct rule: exact match at the seed's own granularity, fail loud on a miss, never infer in either direction.

**Sequencing consequence — STALE, CLOSED 22 Jul 2026 (see §10.5 / §13.3).** The note below described `defaultLookup` as a stub awaiting the input schema. It is not: the query is live, finalised and DB-tested, and the CN contract shipped 27 Jul. Retained for history only. ~~its `defaultLookup` query body and country/CN contracts are deliberately left un-finalized (query stubbed) until build step 3 defines the real input format.~~ The resolver (`lib/cbam/resolver.ts`) is tsc-clean and architecturally sound (async pre-fetch into a Map, engine interface untouched). Finalize + DB-test the resolver *after* the input schema, not before — wiring it against a nonexistent format would hardcode a silent-failure contract.

**10.3 CN-code storage format — CONFIRMED live (17 Jul 2026).** The seed stores codes in *mixed* format: 4-digit headings bare (`7201`, `7203`), but 8-digit codes **with spaces** (`7206 10 00`, `7202 60 00`). Confirmed against the live table. Consequences:
- **Crude steel defaults live at the 8-digit child level, spaced:** `7206 10 00` → 3.75, `7206 90 00` → 3.75. Bare `7206` returns nothing (it's an unseeded "see below" heading). So a *process* producing crude steel must set `cn_code = '7206 10 00'` (the full spaced code), not `'7206'`, or `default_compared` is null.
- **Precursors** DRI/pig iron arrive as bare `7203`/`7201` (headings that ARE seeded) — those resolve fine.
- **The seam:** `defaultLookup`'s DB match is exact + un-normalized. Any cn_code passed to it (process `cn_code`, precursor `cnCode`) must match the stored spacing *exactly*. A future input layer must emit codes in the seed's format. Worked example (fixture B, live-verified): process `cn_code='7206 10 00'`, DRI precursor m_i 1.1 × 1.325 → SEE 3.63758, default 3.75, delta −0.11242 (actuals slightly beat the crude-steel default).

**10.4 GRANT vs RLS are separate layers — this project uses a locked-down grant scheme (learned 3× this session).** Standard Supabase grants `anon`/`authenticated`/`service_role` broad table access by default; **this project does not** — every new table needs *explicit* `GRANT`, separate from its RLS policies. Hit three times: (1) reference tables needed `GRANT SELECT TO anon, authenticated` (captured in `20260717_cbam_reference_grants_rls.sql`); (2) per-customer tables needed `GRANT SELECT/INSERT TO authenticated` for the compute route (applied live, **NOT yet in a migration — pin**); (3) `service_role` has NO access either (blocked the service-role test script). **Standing rule:** any new `cbam_*` table is unreadable until explicitly granted; a route that compiles will still 403/500 at runtime without the grant. Always pair a new table with its grant migration.
- **Pin — RESOLVED 22 Jul 2026.** Captured in `supabase/migrations/20260722_cbam_customer_grants.sql`. The pin's list was verified exactly right against `information_schema.role_table_grants`: those five tables were granted live and absent from every migration file. The other four per-customer tables and the three post-17-Jul reference tables already carried their grants in their own seed migrations — the discipline was working; only the earliest tables predated it. The **standing rule above remains in force** for every new table. See §13.2, which also records a non-CBAM instance of the same trap (`rate_limits` / `service_role`, failing open silently since 2 Jul).

**10.6 Verified-actual precursors are treated as DIRECT-ONLY — known limitation (surfaced 18 Jul 2026, increment 2).** `PrecursorInput.seeValue` is a single number, so `resolveSEE`'s `actual_verified` branch returns `{ direct: p.seeValue, indirect: 0 }`. A customer whose precursor has a *verified actual* figure that includes an indirect component cannot currently express it — the indirect leg is silently dropped to 0. **Not fabricated over**: the limitation is commented in `engine.ts` rather than inventing a field. Correct for the MVP (verified precursors are chapter-72 Annex II goods → genuinely direct-only), but **bites when a verified sintered-ore precursor appears** (non-Annex-II, carries real indirect). Fix when needed: split `seeValue` into `seeValueDirect`/`seeValueIndirect` on `PrecursorInput` + the `cbam_precursor_inputs.see_value` column. Note the defaulted path is unaffected — `defaultLookup` correctly returns both legs from `cbam_default_values.see_direct`/`see_indirect`.

**10.5 Live-persistence test — CLOSED 22 Jul 2026 (see §13.3). The deferral reasoning below is retained for the record; both stated blockers dissolved by using a real account and a test company rather than waiting for the UI.** The engine+resolver+live-default path is proven end-to-end (`scripts/cbam-harness.ts` → 3.63758). What's NOT yet tested against live: the auth-gated INSERT into `cbam_see_records` + RLS admitting the real owner. Both blocked tonight because (a) no test auth user exists, and (b) `companies.user_id` FKs to `auth.users` (can't fabricate). Deliberately deferred — RLS is already proven by the seven production modules using the identical `getAuthedClient` + WITH-CHECK pattern, so this validates persistence plumbing, not novel logic. Do it when building the UI (which brings a real logged-in user naturally). Do NOT add broad `service_role` grants to customer-data tables just to test — larger standing security surface than the test warrants.

**10.7 CN-code resolution: NO automatic heading→child resolution. Require the exact seeded code, at whatever granularity the seed holds it.** (Established 18 Jul 2026 by a full cross-reference of `cbam_cn_map` × 200 defaults × 478 benchmarks. **Framing amended 28 Jul 2026** — the finding below is unchanged and remains binding; the original heading and rules said "exact 8-digit code", which was a proxy that held for crude steel and is contradicted by §10.8's own distribution table (19 four-digit, 62 six-digit, 119 eight-digit seeded codes). The real invariant is exact match at the seed's own granularity, no inference in either direction.)

*Finding — zero true gaps, but pervasive ambiguity.* All 44 `cn_map` prefixes resolve in both value datasets at *some* granularity; nothing is missing. But only **1 of 44** (`26011200`, sintered ore) resolves exactly in both. Heading→child resolution would be needed for 24 of 44 in defaults (18 of those **ambiguous** — children carry differing values) and 43 of 44 in benchmarks (20 **ambiguous**). The two datasets *disagree* about which headings are safe: `72021`/`72024` are ambiguous in defaults but uniform in benchmarks; `7217`/`7318` are the reverse. **No blanket "pick any child" rule is available in either dataset.**

*The 7224 trap (a sampled regularity that was NOT a rule).* `7224 10 10` and `7224 10 90` are byte-identical, which suggested children agree. They don't: across the 7224 heading there are two distinct value groups in each dataset — benchmarks `0,453 (F)…` vs `0,223 (F)…`, defaults 5.589 vs 5.500. A resolver generalised from that sample would silently return the wrong group: **~2× error on the benchmark, ~1.6% on defaults.**

*Rule (binding):*
- **Prefix matching → CATEGORY only.** `cbam_cn_map.cn_prefix` is digits-only, longest-prefix, and exists to resolve a good to its `goods_category`. Category is uniform across a heading's children by construction, so prefix matching is legitimate here.
- **Exact seeded code → VALUE lookups.** `cbam_default_values` and `cbam_benchmarks` are keyed on the specific good, at the granularity the annex publishes: 4-digit heading (`7201`, `7203`), 6-digit (`7202 11`), or 8-digit spaced (`7206 10 00`). The customer supplies the code exactly as it appears on their customs paperwork; the app must NOT infer it, lengthen it, or shorten it. A miss fails loud (existing `defaultLookup` behaviour) rather than resolving to a sibling. Note that `cbam_benchmarks` is always 8-digit while `cbam_default_values` is mixed-width (§10.8) — the two datasets are keyed differently and neither may be normalised toward the other.
- Consistent with §10.3 (a crude-steel process needs `7206 10 00`, not `7206` — because `7206` is an unseeded "see below" row, not because 8 digits are required in general). The input layer (UI/Concierge) must therefore capture the code at the granularity the seed holds it. **Implemented 27 Jul 2026** as a seed-membership check: the setup form builds an accept-set from `cbam_default_values` filtered to `country='other'` (~224 distinct codes, one row per code, under the PostgREST 1000-row cap) and accepts exact trimmed membership only — no regex, no length rule, no normalisation. The accept-set is the same table and the same exact keying `defaultLookup` resolves against, so a code that passes the form cannot miss at lookup for format reasons.

**10.8 Three incompatible CN key formats — normalise at every cross-dataset boundary.**
| Dataset | Format | Distribution |
|---|---|---|
| `cbam_cn_map.cn_prefix` | digits only, **no spaces** | 40× 4-digit, 3× 5-digit, 1× 8-digit |
| `cbam_default_values.cn_code` | spaced, mixed width | 19× 4-digit, 62× 6-digit, 119× 8-digit |
| `cbam_benchmarks` (IR 2025/2620) | spaced, **always 8-digit** | 570 rows |

Literal string equality between any two is wrong in the general case — `'26011200'` never equals `'2601 12 00'`; `'7203'` == `'7203'` is a coincidental match on the bare-4-digit subset only. Every cross-dataset lookup must normalise whitespace. Note the defaults' mixed width is **deliberate**: 21 "see below" heading rows (incl. 7206, 7207, 7218, 7224, 7318, 7326) are excluded because they carry navigation pointers, not values — so a defaults miss on those headings is intended, matching the fail-loud path.

**10.9 Tooling hazard — do NOT split these migrations on `;`.** The `cbam_cn_map` INSERT contains a semicolon *inside a SQL comment* (`-- 7205 dual-listed; pig-iron-granule…`). A naive `;`-split parser silently captures 11 of 44 rows. Detected only by asserting the documented row count (44). Any tooling reading these migration files must parse comment-aware, and should assert expected row counts. Worth adding to CLAUDE.md.

---

## 11. REGS & RULES WATCH (standing protocol)

External dependencies that are unpublished, provisional, or expected to change. Each entry: what we're waiting for, what it blocks, and how the system behaves until then. **Review periodically; never substitute an assumed value for a pending one.**

| # | Watch item | Blocks | Behaviour until published |
|---|---|---|---|
| 11.1 | **`CSCF_y` (cross-sectoral correction factor), 2026–2030.** Confirmed *not yet published* as of Dec 2025. Was 100% for 2021–2025; conditional (applies only "if necessary"), and the Art. 10a(5a) 3% buffer exists to avoid triggering it. Source: Commission under Del. Reg. 2019/331 Art. 14(6). | SEFA (Eq 2) cannot produce a final figure — `SFA_Proc = CBAM_y × CSCF_y × BM*_g`. | Year-keyed reference row, **nullable, no default**. SEFA calc **fails loud**; report marks free-allocation items *"not yet determinable — CSCF pending Commission publication."* **DO NOT hardcode 1.0.** |
| 11.2 | **Benchmark period bands stop at 2030.** §5.3 indicators cover only `(1)` 2026–27 and `(2)` 2028–30. | Benchmark lookup for reporting years 2031+. | Lookup fails loud on a year with no matching band. Do not extrapolate. |
| 11.3 | **`CBAM_y` schedule conditionality.** The 97.5%→0% schedule is "subject to the application of provisions referred to in Article 36(2), point (b)" of the ETS Directive. | Nothing today; the nine values are verified and seedable. | Seed the values, record the conditionality note on the reference table. Re-check if Art. 36(2)(b) is triggered. |
| 11.4 | **Route-table citation inconsistency in IR 2025/2620.** §5.1 cites *Annex I to 2025/2621*; §4(d) cites *Annex I to 2025/2547*; §3.3(2)(d) cites *the Annex to 2547* (no number). Footnote (1) records 2621 as unpublished at 2620's publication date. | The Column B (default-path) country→route lookup. | Column B lookup deferred. Resolve by pulling both candidate annexes and comparing, or await a corrigendum. |
| 11.5 | **Stainless steel has no benchmark indicator.** §5.2.3 defines 'Stainless steel', but the §5.3 legend covers only `(C)`–`(H)`, `(J)` = carbon / low alloy / high alloy. | Benchmark lookup for a stainless producer. | **Unresolved — do not assume stainless ⊆ high alloy.** Plausible (stainless ≥10.5% Cr vs high alloy ≥8% alloying elements) but *not stated*. Fail loud until confirmed. |
| 11.6 | **'Alloy steel' is undefined in 2620.** 'Low alloy' = "alloy steel other than high-alloy"; 'alloy steel' itself never defined; 'Carbon' defined by exclusion. | Grade classification at the input layer. | **Lead to check (not yet verified):** CN Chapter 72 Note 1(f) defines "alloy steel" in the nomenclature — a CN-keyed table would naturally borrow it. Verify before relying on it. |
| 11.7 | **"Production year" vs "reporting period."** §5.3 and the §5.1 tie-break use "production year"; §1(2) and §4 define "reporting period." "Production year" is not a defined term. | Precise band selection at year boundaries. | Treat as the same until contradicted; flag in workings. |
| 11.8 | **Indirect-emissions scope may expand.** Commission study addressed extending indirect coverage beyond current sectors, and the conditions for claiming actual indirect values. | Nothing today. | Our per-node `annex_ii_direct_only` flag is **data, not hardcoded logic** — an expansion is a data update, not a rebuild. Verify the flag source if Annex II is amended. |
| 11.9 | **Implementing act in consultation (closed 10 Jun 2026).** Referenced during recon; contents unreviewed. | Unknown. | Check what was adopted and whether it touches 2547/2620/2621. |
| 11.10 | **Commission CBAM guidance expected 2026; verifier registration in CBAM Registry from 1 Sep 2026.** | Verifier-flow design assumptions. | Re-check before building the verifier invite/registry integration. |
| 11.11 | **Pre-consumer scrap proposed as a CBAM precursor.** Commission proposal (Dec 2025) would include pre-consumer aluminium and steel scrap as a precursor, so its emissions would count toward embedded emissions. Currently scrap (CN 7204) is out of scope / zero-rated. Also proposed: authorities may require evidence that goods were produced in the declared installation and period, and may require additional documentation before actual values are accepted where abuse risk is evidenced. | Nothing today. If adopted, scrap becomes an emissions-bearing precursor. | **Capture scrap mass NOW** in the charge mix (§12) even though it is zero-rated — forward-compatibility. If adopted, scrap moves from charge-mix-only to a `cbam_precursor_inputs` row with a real SEE. |
| 11.12 | **Mixed-charge route fallback — conflicting secondary sources.** Where no feedstock exceeds 50%, one source states the route is assigned by the component with the **highest mass share**; another states all other cases **default to BF-BOF**. Materially different (BF-BOF 1.370 vs scrap-EAF 0.072 on `7208 10 00` Col B). | Route classification for genuinely mixed charges. | Encode the >50% rule only. **Fail loud** when no feedstock exceeds 50% until the fallback is confirmed from IR 2025/2620 §2 verbatim. Do not guess. **See §11.18:** the Art 4(6) one-process rule (DB-enforced 29 Jul 2026) makes a combined charge mix more likely to fall below the 50 % threshold than a single-route mix would, so this unresolved case will arise more often than its own frequency suggests. Do NOT resolve it by splitting the process per route. |
| 11.13 | **CBAM Operators Portal / Third Country Operator Portal.** The Commission operates a portal where non-EU operators upload and share emissions data with EU customers, and where a registered operator may elect to transmit only the summary to the declarant. | Nothing — but it is adjacent to ThemisIQ's hand-off role. | Understand the portal's actual capability before positioning the report export. It may be a distribution channel rather than a competitor. |
| 11.14 | **Default values and mark-ups will be revised — timing uncertain.** IR 2025/2621 Art. 2 states the Regulation is to be revised in 2027 at the latest; recital (11) records that the Commission will make all necessary efforts, with the Member States and on a systematic and holistic review, to carry out a revision of the default values already in 2026. Any revision is to be preceded by a public consultation (recital (10)). Both seeded value sets — `cbam_default_values` (6,423 steel + 1,628 aluminium rows) and the `markup_2026`/`markup_2027`/`markup_2028` columns — are snapshots of the 31 Dec 2025 adopted publication and have an **unknown shelf life**. Note the mark-up *steps* themselves (10 % 2026 → 20 % 2027 → 30 % 2028; fertilisers 1 % flat) are published and already seeded — they are not what is pending here. | Nothing today; seeded values are current and correct. On publication of a revision: every default value and mark-up in `cbam_default_values` is potentially superseded, and any `default_compared` figure already persisted was computed against the old values. | Values are stored exactly as seeded from the official adopted file, with source file name and date in the migration header. **Do not refresh piecemeal, and never from secondary reporting.** On a revision signal, re-seed in full from the newly adopted file as a new migration; never patch individual rows. Detection: asset-hash watch on the CBAM legislation-and-guidance page — see `docs/regulatory-source-monitoring-design.md` Tier 2, source key `EU_IR_2025_2621`. |
| 11.15 | **System boundaries: NOT IMPLEMENTED (elevated from alignment-verification to methodology gap).** *Status: Open. Elevated 29 Jul 2026 following boundary recon.* **Regulatory position (unchanged):** Regulation (EU) 2025/2083 amended Art. 7(7)(a) to require that the system boundaries of production processes **shall be aligned with those covered by the EU ETS**. Recital (16) explains the effect: for some aluminium and steel goods whose embedded emissions are dominated by precursors, the finishing production steps are carried out by separate installations not covered by the EU ETS, and those steps are **excluded from the system boundary**. IR 2025/2547 was adopted 10 Dec 2025, after the amendment. **Finding (corrected):** the previous wording of this item — *"boundaries are as built from IR 2025/2547 §-by-§"* and *"the aggregated-goods-category boundaries in `lib/cbam/`"* — presumed an implementation that does not exist. Recon of 29 Jul 2026 found **NO code in `lib/cbam/` or `app/` that determines whether a process, stream or activity falls inside or outside an Annex I §3 system boundary.** Nothing implements §3.1, §3.15.1, §3.16.2, §3.17.2 or §3.18.2. The engine's determination of process scope is entirely operational: whatever `cbam_source_streams` rows a user attached to a `process_id`, summed by `attributeDirect`. There is no rule, no check, no list of in-scope activities. Every apparent "boundary" reference in the CBAM code is one of three unrelated concepts: (a) the precursor `boundary` enum (`'joint'` / `'separate_internal'` / `'external'`), which is a double-counting discriminant per Art 4(9), not a system boundary; (b) architectural comments about the DB/pure-function seam; (c) installation-boundary copy in `readiness.ts` and `exportXlsx.ts`, referring to §1.2 items (7) and (11)(d) — heat and electricity crossing the INSTALLATION boundary, a different concept from the §3 PROCESS boundary. `cbam_goods_categories` carries no boundary text of any kind (no `boundary_note`, no `description`). `cbam_production_routes.boundary_note` is populated on exactly four rows, all aluminium; the seven steel routes are NULL; and the column is read by nothing (zero hits for `boundary_note`/`boundaryNote` across `app/` and `lib/`) — a dormant column, same pattern as `functional_unit`. None of the four populated notes states an inclusion or exclusion list. The setup form gives the user no scope guidance: all seven source-stream field hints are arithmetic or provenance, and the category `<select>` shows labels only, no description or inclusion list, offering all eight categories regardless of CN code entered. **Consequence: the boundary is currently defined by user behaviour, not by rule, and the system has no basis on which to disagree.** | **§11.15 can no longer be closed by verification. There is nothing to verify. It is now a build item.** Correctness of SEE for downstream steel and aluminium goods — exactly the two live sectors. | Unchanged in code — the system computes whatever streams are attached. **Do NOT write §3 inclusion/exclusion lists from memory, secondary sources, or inference.** Any boundary rule must be transcribed §-by-§ from IR 2025/2547 primary text with the § cited inline. **Split into three tracks. (A) guidance** — per-category in-scope/out-of-scope text surfaced at the category selection and source-stream steps. Blocked on IR 2025/2547 §3 primary text. **(B) validation** — `category_code` vs `cn_code` consistency using `cbam_cn_map`, with the CN normalisation described in §10.8. `cbam_cn_map` already encodes the relationship and is queried by nothing. Not blocked. **(C) structural** — §3.17.2 *"treated like a precursor"* for added unwrought aluminium in secondary melting requires a `cbam_precursor_inputs` row. Precursor intake is unbuilt, so an aluminium re-melter has no way to record it today. Blocked on precursor intake. **Known specifics to carry into track A when the primary text is in hand:** §3.1 excludes infrastructure and maintenance — a plausible over-inclusion. §3.16.2 places plating, cutting, welding and finishing outside the boundary for steel products; §3.18.2's aluminium list is asymmetric and omits plating — the steel and aluminium answers genuinely differ. §3.15.1: the CN-code side is correctly encoded in `cbam_cn_map` (7207/7218/7224 → crude_steel, deliberate, with comments); what is NOT captured is that the rolling ACTIVITY splits between two categories depending on output CN code — hot-rolling is inside the crude-steel boundary when it produces 7207/7218/7224 and inside the products boundary otherwise. **Also tracked here:** Reg. (EU) 2025/2083 is still absent from this spec's own §0/§1 regulatory-basis citation list. The `/cbam` marketing citation table half of this item was resolved 28 Jul 2026. |
| 11.16 | **IR 2025/2621 Annex IV is not seeded — unknown-origin precursors resolve to the wrong table.** Art. 1(5) of IR 2025/2621: where the country of production of a **precursor** cannot be identified, the default values in **Annex IV** apply. Recital (9) gives the reason — Annex IV values are set at the third country with the **highest** emission intensity for that precursor, specifically so an operator cannot claim unknown origin to escape a high country default. ThemisIQ has seeded **Annex I only** (`source_ref` audit: 8,252 rows `'IR 2025/2621 Annex I'`, 14 rows `'IR 2025/2621 Annex II'` for grid factors — no Annex III, no Annex IV). `defaultLookup` (`lib/cbam/resolver.ts:96-108`) therefore resolves an unrecognised origin to Annex I's *"Other countries and territories"* row — a country-agnostic **average**, which is **less conservative** than the Annex IV value the regulation requires. NAMING TRAP: every other "Annex IV" reference in this repo means **IR 2025/2547** Annex IV (the operator's report template) — a different instrument with the same annex number. Grepping "Annex IV" returns 20 hits and none of them are this. | **Nothing today** — `cbam_precursor_inputs.origin_country` is `text not null` with no "unidentified" state, and precursor intake is unbuilt, so no customer can create such a row. **Becomes live the moment precursor intake ships.** | The engine has no concept of "origin unknown" and must not acquire one until Annex IV is seeded. **Do not add an `'unknown'` sentinel to `origin_country` before then** — it would resolve via the `'other'` fallback and silently understate. Correct sequence: seed Annex IV as its own table (or a distinguishable `source_ref` in `cbam_default_values`), THEN give intake an explicit "origin cannot be identified" option that routes to it. Until both exist, intake must require a real ISO alpha-2 country (§10.17). |
| 11.17 | **Two §1.2 report gaps are unresolvable from the instrument, not from our data.** (a) **Item (12)/(13) list classification for EU/zero-rated precursors** — §1.2 does not state whether a precursor sourced in the EU or otherwise zero-rated belongs in the default-values list (12) or the actual-values list (13). `buildItem12and13` (`build.ts:635`) records a gap rather than silently dropping it. (b) **Item (13)(e) specific indirect for verified-actual precursors** — a verified actual precursor carries no indirect value (`PrecursorInput` has no `seeValueIndirect`; spec §10.6), so the field cannot be populated from any input the operator could supply. Neither is a customer gap; both are currently rendered to customers as if they were. | Nothing today — both require precursors and intake is unbuilt. **Both arm the moment precursor intake ships, and (a) and (b) fire PER PRECURSOR.** | Both remain recorded as gaps — do **not** suppress them, and do **not** fabricate a classification or an indirect value. Tag them `responsibility: 'regulator'` and `'platform'` respectively so they are excluded from the customer's completeness denominator and rendered as scope limitations. Watch for Commission guidance or an FAQ resolving (a); (b) closes only if a future instrument gives verified precursors an indirect leg. |
| 11.18 | **Art 4(6) one-process rule collides with the §12 >50 % charge-mix rule — and raises the odds of the §11.12 unresolved case.** IR 2025/2547 Art 4(6) requires a **single** production process encompassing **all** production routes for goods sharing a functional unit; recital (7) makes the emissions the weighted average across routes. §12 assigns a route by a **>50 % metallic-charge mass rule**. The two are individually sound and interact badly: an installation running BOF and EAF, or DRI-EAF and scrap-EAF, must now report **one** process whose charge mix is the COMBINED mass of both — which is materially **more likely to sit near 50/50** than either route's mix would alone. §11.12 already records that the fallback where no feedstock exceeds 50 % is **unresolved between two conflicting secondary sources**, with the instruction to fail loud rather than guess. **The Art 4(6) constraint shipped 29 Jul 2026 therefore increases the frequency of a case ThemisIQ has already declared unresolved.** Neither §11.12 nor §12 currently mentions the other. | Route assignment — and therefore the IR 2025/2620 §5.3 benchmark indicator, since `deriveIndicator` keys on (steel_grade, route_code). Dormant while CSCF is unpublished; live the moment it publishes. | The DB now enforces one process per (installation_id, cn_code, reporting_period) — migration `20260729_cbam_art4_6_process_uniqueness.sql`. **Do NOT resolve a sub-50 % charge mix by splitting the process back into one row per route.** That would restore the shape Art 4(6) forbids and produce two intensities for one CN code. Fail loud on the route instead, per §11.12. Watch for Commission guidance on route assignment where no feedstock exceeds 50 %, and specifically for whether a multi-route process is assigned by combined mass or by some other rule. |

---

## 12. CHARGE MIX (production route evidence)

**Why it exists.** The Column A (actual-data) production route is determined by a mass rule: Scrap-EAF where >50% of crude steel input mass is scrap, DRI-EAF where >50% is DRI, BF-BOF where >50% is blast-furnace/smelting-reduction pig iron. But **scrap is not a CBAM precursor** (CN 7204, zero-rated, out of scope), so it never appears in `cbam_precursor_inputs` — making the ratio uncomputable from precursor data alone.

**Market practice confirms the pattern:** CBAM-ready exporter data systems capture "raw material and charge mix data — scrap, pig iron, sponge iron, ferro alloys, returns, alloys, additives and other metallic inputs" as a distinct category from emissions-bearing precursors.

**Design:** the operator **declares** the production route (they know it); the charge mix **evidences** it. Declaration alone is unevidenced; derivation alone is impossible without scrap mass. Both together is the verifier-acceptable posture — and it is exactly what a verifier checks when reviewing route classification against the mass balance.

**Forward-compatibility:** if the pre-consumer-scrap proposal (§11.11) is adopted, the scrap mass is already captured and moves into the precursor path.

**Interaction with Art 4(6) — added 29 Jul 2026.** The >50 % rule above is written as though it selects which single route a process ran. It does not address an installation running **two** routes for the same good, which IR 2025/2547 Art 4(6) requires to be reported as **one** process encompassing both. In that case the mass balance is the COMBINED metallic charge of every route — and a combined mix sits nearer 50/50 than either route's mix alone. See **§11.18** for the full interaction and **§11.12** for the unresolved sub-50 % fallback. The database enforces one process per (installation, CN code, reporting period) as of migration `20260729_cbam_art4_6_process_uniqueness.sql`; splitting a process back out per route to make the mass rule resolvable is **not** an available answer.

**10.10 SEE and SEFA diverge deliberately on EU-origin precursors — DO NOT "fix" the asymmetry.** `resolveSEE` checks EU/exempted origin first and **zero-rates** (the good already bore an ETS price, so its embedded emissions are 0). `resolvePrecursorSefa` checks EU/exempted origin first and **throws**. This is intentional: whether an EU-origin precursor carries *free allocation* is **not established** by anything pulled from IR 2025/2620 or 2547 — zero-rating emissions does not imply zero free allocation, and assuming either value would be fabrication. The two functions therefore give different answers for the same precursor, by design. Commented inline in `lib/cbam/sefa.ts`. **Open question — resolve from primary source before removing the throw.**

**10.11 Verified-actual precursors have no SEFA path (parallel to §10.6).** `cbam_precursor_inputs` carries `see_value` but no `sefa_value`, so a precursor whose SEE was verified cannot express a verified SEFA. `resolvePrecursorSefa` **throws** on `provenance = 'actual_verified'` rather than inventing a field or silently falling back to the Column B default. Fix when needed: add `sefa_value` to `PrecursorInput` and the table. MVP coverage is therefore: own `SFA_Proc` + `default` precursors (Eq 6) + `computed_here` (recursive, throws in MVP) — which covers the scrap-EAF and DRI-fed cases.

**10.12 SEFA persistence — a computed zero is not an absence (builder contract).** `cbam_see_records.sefa_status` ties the three SEFA numerics together as a unit: `'computed'` requires all three non-null; `'not_determinable_cscf_pending'` and null status require all three null. Consequence the builder must honour: **for a precursor-free good, write `sefa_precursor_contrib = 0`, not null.** Σ over zero precursors is a real computed value, and it is what `lib/cbam/sefa.ts` returns (`precursorContribution: 0`). Leaving it null would force the row out of `'computed'` and misrepresent a fully-determined SEFA as undeterminable — the inverse of the error the constraint prevents. Distinct from the forbidden case: never write `0` for a SEFA that could not be computed (CSCF pending); that is `'not_determinable_cscf_pending'` with all three null.

**10.13 Column B precursor lookups use `indicator: null` — this is a KNOWN GAP, not a design choice.** `sefaCompute.ts`'s `defaultBenchmarkB` resolves a defaulted precursor's benchmark with `indicator: null` (bare / period-only rung), throwing if that CN code carries only route-specific rows. That is **correct fail-loud behaviour given what we have**, but it is not what the regulation specifies. IR 2025/2620 §5.1: *"the same production route shall be used as indicated in Annex I to Commission Implementing Regulation (EU) 2025/2621 for the country of origin of that good or precursor."* So a defaulted precursor's route **is** determinable — from the country-of-origin route table, which we have never pulled (watch item §11.4, blocked on the citation inconsistency: §5.1 cites 2621 Annex I, §4(d) cites 2547 Annex I, §3.3(2)(d) cites 2547's Annex unnumbered). **Do NOT "fix" the throw by picking the highest or first matching row** — that is the tie-break rule from §5.1's *default* branch, whose scope is itself two-way readable (§11.4 / the §5 ambiguities), and applying it here would substitute a guess for a lookup we simply haven't built. Resolve by pulling the route table.

Unreachable on the live path while CSCF is unpublished (§11.1), so it bites only once both are resolved.

**10.14 §1.2 (4)(c) indirect actual/default split — basis is the EMISSION FACTOR, not precursor default values.** (4)(c) asks for the shares of indirect emissions determined on actual vs default values *"in accordance with Article 9"*. Article 9's distinction for indirect turns on the **emission factor**: the country grid factor (IR 2025/2621 Annex II) is the default; an actual factor requires a qualifying PPA or direct technical link with documentary evidence. Confirmed by (4)(c)'s own sub-item demanding *"confirmation that the criteria for the use of actual values … are met"* — criteria and evidence attach to the factor, not to metered consumption.

**10.15 `cbam_default_values` route-independence — CONFIRMED CORRECT.** cbam_default_values is keyed on (cn_code, country) only, with no production-route column. Confirmed correct against IR (EU) 2025/2621: default emission values are established per good × country (average exporting-country emission intensity + mark-up), NOT per production route. Per 2621's operative text, *"where default values are used… the specific embedded free allocation shall be based on the corresponding underlying production route determining the CBAM benchmark as defined in IR 2025/2620"* — i.e. production route enters only via the free-allocation BENCHMARK (cbam_benchmarks, 2620, D/E indicators), not via the default emission value. The ~16× eaf_dri vs eaf_scrap spread (0.424 vs 0.027 for 7206 10 00) lives in cbam_benchmarks and resolves correctly there. Do NOT add route to cbam_default_values' key/seed/resolver. Verified 25 Jul 2026 against EUR-Lex 2621 operative text + 2620 cross-reference. Residual: the 2621 Annex I value spreadsheet (XLS, released Feb 2026) was not line-checked for a route column; operative text is unambiguous, but the XLS is the final word if belt-and-suspenders is wanted later.

**10.16 §1.2 item (2)(b) CBAM Registry installation ID — CONFIRMED CORRECT for non-EU operators.** The §1.2 report renders a (2)(b) "CBAM Registry installation ID" for the installation, sourced from cbam_installations.cbam_registry_id. Confirmed correct for non-EU (third-country) operators: under the CBAM definitive regime, a non-EU installation operator registers via the O3CI portal (Operators of Third Countries Installations, a section of the CBAM Registry, live since 31 Dec 2024) and thereby obtains a CBAM Registry installation identity. This is DISTINCT from the EU importer's authorised-CBAM-declarant registration — the operator does NOT have a declarant number, but a registered operator's installation DOES have a CBAM Registry installation ID. O3CI registration is voluntary, so the field is populated only for operators who have registered; an unregistered operator's report would render (2)(b) as not_provided. The field label uses "installation" ("CBAM Registry installation ID") to disambiguate from the importer's declarant registration. Do NOT remove (2)(b) or treat it as inapplicable to non-EU operators. Verified against European Commission O3CI portal guidance 26 Jul 2026.

**10.17 Precursor `origin_country` intake — MUST store ISO 3166 alpha-2 uppercase.** cbam_default_values is now seeded per-country (aluminium: 1,628 rows across 67 ISO countries + 'other' fallback) keyed on ISO 3166 alpha-2 uppercase codes (CA, CN, IN, …) matching cbam_grid_factors.country_code and the engine's test-contract convention. The default lookup (resolver.ts) is a case-sensitive exact Map-key match with NO normalization: keyOf(cn_code, originCountry). Therefore the precursor-input UI (Step 4, currently unbuilt) MUST store cbam_precursor_inputs.origin_country as the ISO 3166 alpha-2 uppercase code from the cbam_grid_factors / EU_AND_EXEMPTED code set — via a country picker whose stored value is the code, never free text, never a full country name, never lowercase. If intake stores full names ('Canada') or lowercase, every per-country default row silently dead-falls to the 'other' fallback (wrong figure, in the costly direction) or throws. Until precursor intake exists, only the 'other' fallback rows are reachable at runtime — correct interim behaviour, mirroring the steel seed which shipped 'other'-only. Also note: aluminium seeded with annex_ii_direct_only = true and greenhouse_gases = '{CO2,PFC}' (aluminium is the only CBAM sector covering PFCs — CF4, C2F6). The deriveIndicator K/L generalization (benchmarks.ts) remains deferred to CSCF publication, same as steel's SEFA path — dormant, does not affect aluminium SEE. Aluminium seed applied and verified 27 Jul 2026: 1,628 default rows (24 CN × 67 ISO countries + 'other' fallback), 68 distinct country keys, 24 distinct CN codes, zero duplicates. Row-count reconciliation: 24 CN × 67 ISO countries + 24 'other' = 1,632 nominal; actual 1,628 because the source annex assigns no 7616 values for Tunisia (TN) — the four 7616 subheadings (7616 10 00 / 91 00 / 99 10 / 99 90) are legitimately absent for TN, not dropped. This ragged cell is fail-safe: a TN-origin 7616 precursor resolves to the seeded 7616 'other' fallback (3.891, route K), never zero or error. Benchmark rows with K/L route indicators loaded; both goods categories (primary_aluminium, aluminium_products) seeded with greenhouse_gases containing the CO2 and PFC tokens and annex_ii_direct_only = true. Spot-checks matched the annex exactly (7601: CA 1.960, CN 3.000, US 1.700, 'other' 2.203, all route (K)). Source: IR 2025/2621 Annex I (DVs_as_adopted_v20260204) and IR 2025/2620 (CBAM_Benchmarks_20260206).

**Do not derive (4)(c) from `default_share_indirect`** — that field measures defaulted *precursor* contributions over total indirect, a different quantity, and serves (4)(b) only. An early implementation used it with the actual share as the arithmetic complement; that reported **100% actual** for a good whose indirect was entirely own-consumption at the grid default — the exact inverse of the truth.

**Current documented interpretation:** ThemisIQ implements only the grid-default factor path (PPA/direct-line deferred — decision D2). Every indirect figure the engine can produce is therefore default-factor-derived: own-indirect via `gridFactor()`, defaulted-precursor indirect via `see_indirect`, and verified-actual precursors carry no indirect at all (§10.6). So **actual share = 0** (a real computed zero, not missing — we know it is zero and why) and **default share = 1**, for any non-Annex-II good with non-zero indirect. Zero total indirect → both `not_applicable`.

The regulation states neither the denominator nor the arithmetic, so the 0/1 result is an interpretation following from our implementation scope, not from text. **Revisit if the PPA/direct-line path is ever built** — the actual share becomes non-zero and the split becomes a real calculation. Applies to non-Annex-II goods only, so it does not touch the chapter-72 MVP.

---

## 13. SESSION LOG — 22 Jul 2026

Recorded because several entries below close open items in §10 and add new
ones. Where this section and an earlier one conflict, this section is later.

### 13.1 What was built

- **`lib/cbam/loadProcess.ts`** — the load→adapt→computeSEE spine, extracted
  from the compute route so the report route runs the IDENTICAL path.
  Returns `{ process, activityLevel, installationCountry, annexIiDirectOnly,
  electricityConsumed, streams, precursors, precursorRows, ctx, attrEm,
  result }`. Throws `ProcessLoadError` with codes `not_found` /
  `invalid_input` / `load_failed`; callers map to HTTP. Mirrors the
  `AuthError` pattern in `lib/supabaseAuthed.ts` (typed error, no embedded
  status).
- **`app/api/cbam/report/route.ts`** — GET, keyed on
  `installation_id` + `reporting_period`, NOT on a see_record id. Serves the
  §1.2 summary only. Verified live 22 Jul against two fixtures.
- **`processes_complete` attestation** — column + trigger on
  `cbam_installation_disclosures`. See 13.4.

### 13.2 §10.4 pin CLOSED

The five per-customer tables missing grants (`cbam_installations`,
`cbam_production_processes`, `cbam_source_streams`, `cbam_precursor_inputs`,
`cbam_see_records`) are captured in
`supabase/migrations/20260722_cbam_customer_grants.sql`. Verified against
`information_schema.role_table_grants`: the pin's list was exactly right.
The other four per-customer tables and the three post-17-Jul reference
tables already carried their grants in their own seed migrations — the
discipline was working; only the earliest tables predated it.

**Also found (unrelated to CBAM):** `rate_limits` had RLS deliberately
policy-free but NO grant to `service_role`, so `lib/rateLimit.ts` had been
failing open silently since 2 Jul. Fixed in
`20260722_rate_limits_grants.sql`. Generalised rule added to CC memory:
GRANT and RLS are separate layers, and BYPASSRLS does not bypass GRANT.

### 13.3 §10.5 live-persistence test CLOSED

Done without a UI, using Lisa's real account and a test company. Two
fixtures seeded and computed through the authenticated route:

| Fixture | Route | see_direct | default | delta | share |
|---|---|---|---|---|---|
| A | eaf_scrap, no precursors | 2.1800800000000002 | 3.75 | −1.5699199999999998 | 0 |
| B | eaf_dri, DRI 7203 external + pig iron 7201 joint | 3.6375800000000003 | 3.75 | −0.11241999999999974 | 0.4006784730507645 |

Fixture B reproduces the §10.3 harness figure (3.63758) through RLS, grants,
adapters and persistence — previously proven only as owner via a script.

**Proven by this:** the customer grants are sufficient; the RLS policies
admit the real owner on read AND insert; `adapt.ts` handles live row shapes;
numerics round-trip as JSON numbers, not strings.

### 13.4 `processes_complete` — operator attestation (NEW)

`buildSummaryReport` gates §1.2 items 5 and 6 (installation-level totals) on
`installationProcessesComplete`, because a partial sum must never be
presented as an installation total. Three options were considered:

- (a) hardcode false — honest, ships today, items 5/6 permanently missing
- (b) infer from row counts — REJECTED. The DB sees only rows that exist; an
  operator who has not yet entered a process would get a confident
  "complete" over a partial set. Wrong direction under reasonable assurance.
- (c) explicit operator attestation — CHOSEN.

Implemented as `processes_complete boolean` +
`processes_complete_declared_at timestamptz` on
`cbam_installation_disclosures` (already installation+period keyed).
Nullable by design: null = not declared, false = declared incomplete,
true = declared complete.

**Enforced by DB trigger**, not by a route: the table already grants full
CRUD to `authenticated`, so a route alone is bypassable. The trigger
(`cbam_stamp_processes_complete`) stamps `declared_at` with server time on
any change, clears it on retraction to null, and rejects `true` when the
installation has no processes for that period. That guard rejects only the
degenerate zero-process case — it does NOT verify completeness. Nothing can;
the attestation is the operator's assertion.

**Still owed:** a UI surface where the operator can actually make the
declaration. Until then the flag must never be seeded, including in test.

### 13.5 Stale-record tripwire and the numeric comparison rule

The report route recomputes via the shared spine and compares against the
stored `cbam_see_records` row before building. Mismatch on either leg throws
`ReportError('stale_record')` → HTTP 409, carrying record id, process id,
both stored legs, both recomputed legs, and `computed_at`. It NEVER serves a
figure that disagrees with the stored record.

**Comparison is strict equality — no tolerance, no rounding.** Established
empirically 22 Jul: `see_direct::float8 = 3.6375800000000003` is `true`,
and Postgres prints `3.63758` as the shortest round-tripping form of the
same IEEE 754 double. Unconstrained `numeric` stores the exact decimal it is
given; the shared spine guarantees both paths run the same code in the same
summation order. A tolerance would mask genuine reference-data drift, which
is the only thing this tripwire exists to catch.

**Consequence for any future refactor:** reordering a `reduce` in the engine
would change the last bit and fire this tripwire on every report. That is
the intended behaviour — the fix is to re-run compute, not to add an epsilon.

**Deliberately NOT built:** a workings-diff naming which precursor moved.
The path is unexercised and would ship untested; both `workings` blobs are
already persisted, so the diagnosis is recoverable after the fact. Add it
the first time this fires for real, designed against an actual case.

### 13.6 Workings block defect — FIXED

The compute route's workings block called `resolveSEE` a second time for
every precursor, including `joint` ones — a re-resolution the same file's
step-6b comment forbids, and which fabricated a `see_i` for precursors
`computeSEE` deliberately never resolved. Now reads
`result.resolutions.get(p)`; joint precursors carry
`see_i_direct: null`, `see_i_indirect: null`, `source: null`. The
`PrecursorSource` discriminant was added to the persisted workings.

Verified live on fixture B: DRI (`external`) carries `1.325` / `0` /
`"default"`; pig iron (`joint`) carries three nulls with `counted: false`.
The artifact now distinguishes "resolved to zero" from "never resolved".

### 13.7 Positional precursor alignment (NEW CONSTRAINT)

`PrecursorReportInput` pairs a `PrecursorInput` with a
`PrecursorOriginRow` (the four `origin_*` columns). `PrecursorInput` carries
no row id — it is an engine type, deliberately DB-free — so there is no key
to join on. `loadProcess` therefore returns `precursorRows` alongside
`precursors`, and the two are POSITIONALLY aligned because `precursors` is
literally `precursorRows.map(adaptPrecursor)` over that same array.

**Any caller pairing them must index, never re-sort or re-fetch.** Doing
either breaks the object-identity keying of `result.resolutions`
(invariant 10). Zip in a single pass at the point of construction.

### 13.8 §1.2 item 5 confirmed correct

Item 5 reports `attrEm` (the process's own attributed direct emissions), NOT
`see_direct`. Both test fixtures report the same 218.008 despite differing
`see_direct`, because precursors raise SEE without touching `attrEm`.
Confirmed against `docs/cbam-annex-iv-verbatim.md`: item (5) is *"the total
direct emissions of the installation during the reporting period and total
direct emissions per production process."* Precursor emissions are embedded
in the good and reported via items 4 and 12/13; folding them into item 5
would double-count.

### 13.9 Country-specific defaults NOT seeded (OPEN)

§0 decided to seed country-specific defaults for 13 exporters. Live,
`cbam_default_values` holds only `country = 'other'` rows for the crude-steel
CN codes (`7206 10 00`, `7206 90 00` — both 3.750). The resolver's `'other'`
fallback handles it correctly, so nothing is wrong — but the accuracy
argument in §0 (comparing against `'other'` when a country value exists
overstates the customer's advantage) is currently unrealised. Confirm
whether the seed was deferred or lost.

### 13.10 Reporting-period seam noted, not yet resolved

`cbam_see_records` has no reporting-period column of its own; the period
lives on `cbam_production_processes` and the report route joins for it.
Correct today. Note it if the record ever needs to stand alone.

### 13.11 Test coverage gap

The suite stayed at 500 tests / 15 files across every change today. Nothing
added covers the route layer: not the tripwire, not the
`processesWithoutRecord` path, not the 404s, not the workings block. All
were verified by live runs against production fixtures instead. A
route-level test stubbing the Supabase client would close this and is the
cheapest remaining hardening.

---

## 14. SESSION LOG — 23 Jul 2026

Second working session. Where this conflicts with §13 or earlier, this is
later.

### 14.1 What shipped

- **Disclosures form** (`app/dashboard/cbam/page.tsx`) — §1.2 items 7-11 plus
  the attestation. Three-state control, elec-gate clearing, composite-PK
  upsert. Verified live.
- **Report view** (`app/dashboard/cbam/report/page.tsx`) — three visually
  distinct field statuses, `missing` checklist near the top, 409 stale-record
  panel. Verified live including a deliberately tampered record.
- **xlsx export** (`app/dashboard/cbam/report/exportXlsx.ts`) — six sheets in
  Annex IV order, numbers as numeric cells, absence never rendered as blank
  or zero.
- **Setup wizard** (`app/dashboard/cbam/setup/page.tsx`) — steps 1-3
  (operator, installations, processes + source streams + evidence documents).
  Step 4 (precursors) still a placeholder.
- **Evidence document storage** — `cbam-source-documents` bucket,
  `cbam_source_documents` table, composite FK from `cbam_source_streams`.

### 14.2 Three-state disclosure control — the load-bearing UI decision

The GHG module's `QuestionCard` is a two-state checkbox. Mirroring it would
have written `false` for every untouched question — eleven fabricated
declarations on a verifier-facing artifact, undoing exactly what invariant 8
and the nullable columns exist to prevent.

`DisclosureQuestion` is three-state: unanswered / yes / no, with unanswered
visually distinct from a declared negative, and clicking a selected option
retracting to null. Verified live: nine untouched questions saved as null.

**DB constraint `cbam_disclosures_elec_gate`** (`electricity_produced_onsite
IS NOT FALSE OR all five sub-flags IS NULL`) means setting the gate to No
while sub-flags are populated is REJECTED. The form clears them in the same
state update and says so in an amber note. Silent clearing would be its own
fabrication in reverse.

### 14.3 The Commission's communication template is a transitional artifact

Checked the Commission's legislation-and-guidance page 23 Jul 2026. The only
communication template published is dated 18 Dec 2024 (filename
`..._20241213.xlsx`), built against IR 2023/1773 Annex IV — the TRANSITIONAL
act. Every definitive-period regulation postdates it (2025/2546, 2025/2547,
2025/2620, 2025/2621).

The page IS actively maintained: definitive-period default values and
benchmarks were published there in Excel on 13 Feb 2026. So the template's
absence is not neglect.

**Conclusion:** the §1.2 report this module produces IS the definitive-period
successor to that template's content. The xlsx export therefore carries
current Annex IV §1.2 content in Annex IV item order and deliberately does
NOT mimic the superseded template. The Cover sheet says so, so anyone asking
"why doesn't this match the template I know" has the answer in the file.

### 14.4 Intake write path — direct DML, and a CN format CHECK

The write-path decision deferred in `20260722_cbam_customer_grants.sql` is
settled: direct DML, not RPC. Every validity rule on those tables is already
a CHECK or FK, so it is enforced on every write path; an RPC layer would add
indirection without adding enforcement.

Added `cbam_pp_cn_code_8digit_spaced`: `cn_code ~ '^[0-9]{4} [0-9]{2}
[0-9]{2}$'`. §10.7 required the exact 8-digit code but nothing enforced it.
Verified 23 Jul: all 119 eight-digit codes in `cbam_default_values` match;
the 4- and 6-digit codes deliberately do not. Precursor CN codes are NOT
constrained this way — they legitimately use narrower seeded codes.

> **SUPERSEDED 27 Jul 2026** (migration `20260727_cbam_drop_8digit_cn_check.sql`).
> This CHECK was dropped. The constraint was wrong in the same way §10.7's
> framing was wrong: it enforced a width rule the seed does not follow, and it
> rejected legitimate 4- and 6-digit steel codes (`7201`, `7203`, `7202 11`) —
> a latent defect that became operative when the aluminium seed landed. The
> note above already contains the contradiction ("the 4- and 6-digit codes
> deliberately do not" match), which should have been the tell. Replaced by
> client-side seed-membership validation (§10.7). **Residual risk: there is
> currently no server-side CN validation of any kind** — the client check is
> the sole enforcement point, which deviates from the house pattern
> (cf. GHG location bands: client wall + Postgres trigger). Open item.

### 14.5 Evidence documents — deliberately NOT parsed

CBAM source documents (weighbridge tickets, fuel delivery notes, laboratory
analyses, production logs) have no standardised genre, unlike GHG utility
bills. Often company-internal formats, often not in English, often
aggregated.

**No extraction.** The operator tallies their own records and enters the
figure; the document is the provenance link a verifier follows. An extracted
figure would flow into a financial obligation and be tested against the
operator's own records on a mandatory site visit — inserting a third artifact
nobody asked for.

Separate bucket and separate metadata table from GHG, by decision: a CBAM
verifier and a GHG verifier are different accredited people, and a signed URL
issued to one must never resolve to the other's evidence. Unlike the GHG
bucket, this one carries a 25 MB cap and a MIME allowlist.

`ON DELETE SET NULL` on the stream FK: deleting evidence must never silently
delete the activity data that cited it.

### 14.6 Fixtures rescaled — the old ones were not survivable

The original fixtures were arithmetically convenient and physically
impossible: 100 t of natural gas to make 100 t of steel (~100x real
consumption), and a gas carbon content of 0.500 t C/t (methane is 75% carbon
by mass; real pipeline gas is ~0.734). Two carbon-bearing streams were
missing entirely.

Rescaled to a 100,000 t/yr scrap-EAF specialty mill, calendar-year period:

| Stream | Mass | kg/t | CC |
|---|---|---|---|
| Natural gas | 1 500 t | 15.0 | 0.7340 |
| Graphite electrodes | 220 t | 2.2 | 0.9990 |
| Injected anthracite | 2 000 t | 20.0 | 0.8500 |
| Limestone flux | 3 000 t | 30.0 | 0.1200 |
| Crude steel out | -100 000 t | — | 0.0018 |

DirEm* = 11 727.658 t CO2 ; **ae_g = 0.1172766 t CO2/t**

| Fixture | see_direct | vs 3.75 default |
|---|---|---|
| A scrap-EAF | 0.1172765792 | −96.9 % |
| B DRI-EAF | 1.5747765792 | −58.0 %; default_share_direct 0.9255 |

The 96.9% advantage is real and explicable: crude steel is an Annex II good,
so own indirect is suppressed and the mill's 46 500 MWh grid draw does not
enter the figure. Scrap feedstock plus suppressed indirect, measured against
a default calibrated for blast-furnace routes.

Fixture B's `default_share_direct` of 0.9255 is the more useful demo number:
92.6% of embedded emissions come from a defaulted precursor, which is the
argument for getting upstream suppliers verified.

### 14.7 Article 9 carbon price — deliberately NOT built

Ontario's Emissions Performance Standards is output-based: free allocation
against a production benchmark, payment only above it. Under the Article 9
rules, free allocation received under a foreign ETS reduces the qualifying
amount — only emissions actually priced count.

A low-carbon Ontario EAF therefore has almost no Article 9 claim *because*
it is low-carbon: far below benchmark, paying nothing, possibly earning
credits.

Scale, at 100 000 t/yr, 2026 CBAM factor 2.5%, ~EUR 75 certificates:

| | per t | per year |
|---|---|---|
| Actuals (0.1173) | EUR 0.22 | EUR 22 100 |
| Default (3.75) | EUR 7.06 | EUR 705 800 |
| **Saving from actuals** | EUR 6.84 | **EUR 683 700** |

Article 9 would apply to the EUR 22 100 and yield near zero of it. Not worth
building. Also: the implementing act was published 13 May 2026 for
consultation to 10 June and adoption is unconfirmed, and from 2027 the
Commission will publish default carbon prices in the CBAM Registry, so
installation-level evidence becomes largely unnecessary.

**Worth doing eventually:** a disclosure field stating whether a carbon price
was paid, so an importer is not left guessing. A disclosure, not a
calculation.

### 14.8 Verifier report — the model, corrected

Initial design work drifted toward ThemisIQ holding and validating verifier
reports. That is wrong. Per IR 2025/2546 the verification report is prepared
by the verifier on a Commission electronic template, via the CBAM Registry.
ThemisIQ neither creates it nor sits in its path.

The correct chain: the customer builds the inventory in ThemisIQ, the engine
computes SEE, and that one set of workings feeds TWO independent outputs —
the verifier portal (where an accredited verifier examines the workings and
then issues their assurance report independently via the Registry), and the
§1.2 report plus xlsx that goes to the EU importer. Neither passes through
the other.

Consequences:
- `hasValidVerifierReport` is a misleading name. ThemisIQ cannot confirm a
  verifier is accredited — that is the National Accreditation Body's role
  under EN ISO/IEC 14065. What it CAN check is whether the operator has
  ASSERTED a report covering this precursor. Rename accordingly when built.
- `computed_here` must NOT be offered in the precursor UI: `computeChildSEE`
  throws unconditionally (Phase 2). A saved row would fail at compute time.
- `actual_verified` currently ALWAYS falls back to default with an unresolved
  flag, because `hasValidVerifierReport` returns false unconditionally. The
  UI must say so, or a customer's paid-for verified value is silently
  discarded.

### 14.9 Aluminium gap (NEW, commercial)

`cbam_goods_categories` holds six categories, all steel. The largest North
American CBAM flow into the EU is **Canadian aluminium** (~US$1.65bn in 2025,
of which unwrought $1.58bn) against ~US$1.1bn of US iron and steel.

Quebec smelters run on hydro and are among the lowest-carbon aluminium
producers globally — the ideal CBAM customer, because their actuals would
crush the default. A Canadian CBAM product cannot currently serve them.
Worth a deliberate decision, not just a backlog line.

### 14.10 §11 additions

- **Definitive-period communication template** — not published as of
  23 Jul 2026 (latest is 13 Dec 2024, transitional). Watch for reissue; map
  the xlsx export onto it if it lands.
- **Accreditation and verification guidance** — the Commission indicated
  publication in summer 2026. May specify verifier-report metadata.
- **Article 9 implementing act** — published 13 May 2026 for consultation to
  10 June; confirm adoption. Commission default carbon prices expected in the
  Registry from 2027.

### 14.11 Demo document set

Seven watermarked PDFs for a fictional Ontario scrap-EAF mill (Laurentian
Steel Inc., Welland; installation CA-ON-LSI-01), figures matching the
rescaled fixture A. Kept outside the repo. Includes an emissions calculation
worksheet, because a verifier's first request is the operator's own working
before they test it.

---

