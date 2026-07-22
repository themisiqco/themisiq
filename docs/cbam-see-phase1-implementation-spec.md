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
create table public.cbam_default_values (
  cn_prefix      text not null,
  country        text not null,                    -- 'other' = the 'Other countries' fallback table
  route_code     text,                             -- nullable: some benchmarks are route-independent
  see_direct     numeric not null,                 -- t CO2e / functional unit, INCLUDING mark-up
  markup_note    text,                             -- e.g. '10% (2026)'
  source_ref     text not null,                    -- 'IR 2025/2621 Annex …'
  primary key (cn_prefix, country, route_code)
);
```

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
2. **`cbam_default_values` schema (empty) + 2621 data-pull.** Create the table; CC pulls IR 2025/2621 default values for iron & steel CN codes into it (parallel data task — lookup, not logic). Include the "Other countries" fallback rows and the mark-up in `see_direct`.
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

**10.2 Country-code + CN-format contract — INPUT-LAYER requirement, fails silently in the costly direction.** The resolver's `isEuOrExempted` and `defaultLookup` both depend on the input matching the reference data's exact string format, and mismatches fail *silently* toward over-charging (a zero-rated or seeded precursor gets a default / wrong row instead). Two specific pins for build step 3 (per-customer input schema), which defines how country-of-origin and CN codes are represented:
- **Greece: RESOLVED → `EL`** (17 Jul 2026). `EU_AND_EXEMPTED` uses `EL` (matches GHG engine + VSME); `isEuOrExempted` now normalizes `(country||'').toUpperCase().trim()` like `engine.ts`. Recon confirmed the `EL`/`GR` divergence is *internal-only* — Greece appears only in the zero-rating set (EU-origin precursors), never as a reported value or in the default table (CBAM goods originate in third countries; EU-origin is zero-rated, not defaulted). Rejection risk minimal. **Residual seam:** `defaultLookup` does a *raw un-normalized* match on `cbam_default_values.country` (correct — that table holds canonical regulation codes). So any country-specific default rows must be seeded with canonical codes; Greece won't appear there (zero-rated), but hold the `EL` convention consistent if it ever does. The rare report-emitter edge (a *listed* Greek precursor origin) follows EU *customs* convention — pin when building the report emitter with a proper CBAM Registry country-code-spec pull.
- **Exempted-territory identifiers** (Ceuta, Melilla, Livigno, Heligoland, Büsingen) — currently invented sentinels in `EU_AND_EXEMPTED`; replace with the app's actual country-of-origin representation.
- **CN code spacing.** Seed stores codes with spaces (`'7202 11'`, `'7202 60 00'`). `defaultLookup` is exact-match, so `p.cnCode` must arrive in that shape — normalize CN format at the input boundary to match the seed, or a valid code silently misses its row and falls to `'other'`.
- **Heading→child resolution.** 4-digit heading codes (7206, 7207, …) are unseeded ("see below" rows) → `defaultLookup` throws (correct-loud). Heading→8-digit-child resolution must happen before lookup. Not needed for MVP (precursors arrive as clean seeded categories: DRI 7203, pig iron 7201).

**Sequencing consequence:** the resolver (`lib/cbam/resolver.ts`) is tsc-clean and architecturally sound (async pre-fetch into a Map, engine interface untouched) but its `defaultLookup` query body and country/CN contracts are **deliberately left un-finalized (query stubbed) until build step 3 defines the real input format.** Finalize + DB-test the resolver *after* the input schema, not before — wiring it against a nonexistent format would hardcode a silent-failure contract.

**10.3 CN-code storage format — CONFIRMED live (17 Jul 2026).** The seed stores codes in *mixed* format: 4-digit headings bare (`7201`, `7203`), but 8-digit codes **with spaces** (`7206 10 00`, `7202 60 00`). Confirmed against the live table. Consequences:
- **Crude steel defaults live at the 8-digit child level, spaced:** `7206 10 00` → 3.75, `7206 90 00` → 3.75. Bare `7206` returns nothing (it's an unseeded "see below" heading). So a *process* producing crude steel must set `cn_code = '7206 10 00'` (the full spaced code), not `'7206'`, or `default_compared` is null.
- **Precursors** DRI/pig iron arrive as bare `7203`/`7201` (headings that ARE seeded) — those resolve fine.
- **The seam:** `defaultLookup`'s DB match is exact + un-normalized. Any cn_code passed to it (process `cn_code`, precursor `cnCode`) must match the stored spacing *exactly*. A future input layer must emit codes in the seed's format. Worked example (fixture B, live-verified): process `cn_code='7206 10 00'`, DRI precursor m_i 1.1 × 1.325 → SEE 3.63758, default 3.75, delta −0.11242 (actuals slightly beat the crude-steel default).

**10.4 GRANT vs RLS are separate layers — this project uses a locked-down grant scheme (learned 3× this session).** Standard Supabase grants `anon`/`authenticated`/`service_role` broad table access by default; **this project does not** — every new table needs *explicit* `GRANT`, separate from its RLS policies. Hit three times: (1) reference tables needed `GRANT SELECT TO anon, authenticated` (captured in `20260717_cbam_reference_grants_rls.sql`); (2) per-customer tables needed `GRANT SELECT/INSERT TO authenticated` for the compute route (applied live, **NOT yet in a migration — pin**); (3) `service_role` has NO access either (blocked the service-role test script). **Standing rule:** any new `cbam_*` table is unreadable until explicitly granted; a route that compiles will still 403/500 at runtime without the grant. Always pair a new table with its grant migration.
- **Pin — RESOLVED 22 Jul 2026.** Captured in `supabase/migrations/20260722_cbam_customer_grants.sql`. The pin's list was verified exactly right against `information_schema.role_table_grants`: those five tables were granted live and absent from every migration file. The other four per-customer tables and the three post-17-Jul reference tables already carried their grants in their own seed migrations — the discipline was working; only the earliest tables predated it. The **standing rule above remains in force** for every new table. See §13.2, which also records a non-CBAM instance of the same trap (`rate_limits` / `service_role`, failing open silently since 2 Jul).

**10.6 Verified-actual precursors are treated as DIRECT-ONLY — known limitation (surfaced 18 Jul 2026, increment 2).** `PrecursorInput.seeValue` is a single number, so `resolveSEE`'s `actual_verified` branch returns `{ direct: p.seeValue, indirect: 0 }`. A customer whose precursor has a *verified actual* figure that includes an indirect component cannot currently express it — the indirect leg is silently dropped to 0. **Not fabricated over**: the limitation is commented in `engine.ts` rather than inventing a field. Correct for the MVP (verified precursors are chapter-72 Annex II goods → genuinely direct-only), but **bites when a verified sintered-ore precursor appears** (non-Annex-II, carries real indirect). Fix when needed: split `seeValue` into `seeValueDirect`/`seeValueIndirect` on `PrecursorInput` + the `cbam_precursor_inputs.see_value` column. Note the defaulted path is unaffected — `defaultLookup` correctly returns both legs from `cbam_default_values.see_direct`/`see_indirect`.

**10.5 Live-persistence test — CLOSED 22 Jul 2026 (see §13.3). The deferral reasoning below is retained for the record; both stated blockers dissolved by using a real account and a test company rather than waiting for the UI.** The engine+resolver+live-default path is proven end-to-end (`scripts/cbam-harness.ts` → 3.63758). What's NOT yet tested against live: the auth-gated INSERT into `cbam_see_records` + RLS admitting the real owner. Both blocked tonight because (a) no test auth user exists, and (b) `companies.user_id` FKs to `auth.users` (can't fabricate). Deliberately deferred — RLS is already proven by the seven production modules using the identical `getAuthedClient` + WITH-CHECK pattern, so this validates persistence plumbing, not novel logic. Do it when building the UI (which brings a real logged-in user naturally). Do NOT add broad `service_role` grants to customer-data tables just to test — larger standing security surface than the test warrants.

**10.7 CN-code resolution: NO automatic heading→child resolution. Require the exact 8-digit code.** (Established 18 Jul 2026 by a full cross-reference of `cbam_cn_map` × 200 defaults × 478 benchmarks.)

*Finding — zero true gaps, but pervasive ambiguity.* All 44 `cn_map` prefixes resolve in both value datasets at *some* granularity; nothing is missing. But only **1 of 44** (`26011200`, sintered ore) resolves exactly in both. Heading→child resolution would be needed for 24 of 44 in defaults (18 of those **ambiguous** — children carry differing values) and 43 of 44 in benchmarks (20 **ambiguous**). The two datasets *disagree* about which headings are safe: `72021`/`72024` are ambiguous in defaults but uniform in benchmarks; `7217`/`7318` are the reverse. **No blanket "pick any child" rule is available in either dataset.**

*The 7224 trap (a sampled regularity that was NOT a rule).* `7224 10 10` and `7224 10 90` are byte-identical, which suggested children agree. They don't: across the 7224 heading there are two distinct value groups in each dataset — benchmarks `0,453 (F)…` vs `0,223 (F)…`, defaults 5.589 vs 5.500. A resolver generalised from that sample would silently return the wrong group: **~2× error on the benchmark, ~1.6% on defaults.**

*Rule (binding):*
- **Prefix matching → CATEGORY only.** `cbam_cn_map.cn_prefix` is digits-only, longest-prefix, and exists to resolve a good to its `goods_category`. Category is uniform across a heading's children by construction, so prefix matching is legitimate here.
- **Exact 8-digit spaced code → VALUE lookups.** `cbam_default_values` and `cbam_benchmarks` are keyed on the specific good. The customer supplies the full 8-digit CN code (it is on their customs paperwork); the app must NOT infer it. A miss fails loud (existing `defaultLookup` behaviour) rather than resolving to a sibling.
- Consistent with §10.3 (a crude-steel process needs `7206 10 00`, not `7206`). The input layer (UI/Concierge) must therefore capture the 8-digit code, not a heading.

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
| 11.12 | **Mixed-charge route fallback — conflicting secondary sources.** Where no feedstock exceeds 50%, one source states the route is assigned by the component with the **highest mass share**; another states all other cases **default to BF-BOF**. Materially different (BF-BOF 1.370 vs scrap-EAF 0.072 on `7208 10 00` Col B). | Route classification for genuinely mixed charges. | Encode the >50% rule only. **Fail loud** when no feedstock exceeds 50% until the fallback is confirmed from IR 2025/2620 §2 verbatim. Do not guess. |
| 11.13 | **CBAM Operators Portal / Third Country Operator Portal.** The Commission operates a portal where non-EU operators upload and share emissions data with EU customers, and where a registered operator may elect to transmit only the summary to the declarant. | Nothing — but it is adjacent to ThemisIQ's hand-off role. | Understand the portal's actual capability before positioning the report export. It may be a distribution channel rather than a competitor. |

---

## 12. CHARGE MIX (production route evidence)

**Why it exists.** The Column A (actual-data) production route is determined by a mass rule: Scrap-EAF where >50% of crude steel input mass is scrap, DRI-EAF where >50% is DRI, BF-BOF where >50% is blast-furnace/smelting-reduction pig iron. But **scrap is not a CBAM precursor** (CN 7204, zero-rated, out of scope), so it never appears in `cbam_precursor_inputs` — making the ratio uncomputable from precursor data alone.

**Market practice confirms the pattern:** CBAM-ready exporter data systems capture "raw material and charge mix data — scrap, pig iron, sponge iron, ferro alloys, returns, alloys, additives and other metallic inputs" as a distinct category from emissions-bearing precursors.

**Design:** the operator **declares** the production route (they know it); the charge mix **evidences** it. Declaration alone is unevidenced; derivation alone is impossible without scrap mass. Both together is the verifier-acceptable posture — and it is exactly what a verifier checks when reviewing route classification against the mass balance.

**Forward-compatibility:** if the pre-consumer-scrap proposal (§11.11) is adopted, the scrap mass is already captured and moves into the precursor path.

**10.10 SEE and SEFA diverge deliberately on EU-origin precursors — DO NOT "fix" the asymmetry.** `resolveSEE` checks EU/exempted origin first and **zero-rates** (the good already bore an ETS price, so its embedded emissions are 0). `resolvePrecursorSefa` checks EU/exempted origin first and **throws**. This is intentional: whether an EU-origin precursor carries *free allocation* is **not established** by anything pulled from IR 2025/2620 or 2547 — zero-rating emissions does not imply zero free allocation, and assuming either value would be fabrication. The two functions therefore give different answers for the same precursor, by design. Commented inline in `lib/cbam/sefa.ts`. **Open question — resolve from primary source before removing the throw.**

**10.11 Verified-actual precursors have no SEFA path (parallel to §10.6).** `cbam_precursor_inputs` carries `see_value` but no `sefa_value`, so a precursor whose SEE was verified cannot express a verified SEFA. `resolvePrecursorSefa` **throws** on `provenance = 'actual_verified'` rather than inventing a field or silently falling back to the Column B default. Fix when needed: add `sefa_value` to `PrecursorInput` and the table. MVP coverage is therefore: own `SFA_Proc` + `default` precursors (Eq 6) + `computed_here` (recursive, throws in MVP) — which covers the scrap-EAF and DRI-fed cases.

**10.12 SEFA persistence — a computed zero is not an absence (builder contract).** `cbam_see_records.sefa_status` ties the three SEFA numerics together as a unit: `'computed'` requires all three non-null; `'not_determinable_cscf_pending'` and null status require all three null. Consequence the builder must honour: **for a precursor-free good, write `sefa_precursor_contrib = 0`, not null.** Σ over zero precursors is a real computed value, and it is what `lib/cbam/sefa.ts` returns (`precursorContribution: 0`). Leaving it null would force the row out of `'computed'` and misrepresent a fully-determined SEFA as undeterminable — the inverse of the error the constraint prevents. Distinct from the forbidden case: never write `0` for a SEFA that could not be computed (CSCF pending); that is `'not_determinable_cscf_pending'` with all three null.

**10.13 Column B precursor lookups use `indicator: null` — this is a KNOWN GAP, not a design choice.** `sefaCompute.ts`'s `defaultBenchmarkB` resolves a defaulted precursor's benchmark with `indicator: null` (bare / period-only rung), throwing if that CN code carries only route-specific rows. That is **correct fail-loud behaviour given what we have**, but it is not what the regulation specifies. IR 2025/2620 §5.1: *"the same production route shall be used as indicated in Annex I to Commission Implementing Regulation (EU) 2025/2621 for the country of origin of that good or precursor."* So a defaulted precursor's route **is** determinable — from the country-of-origin route table, which we have never pulled (watch item §11.4, blocked on the citation inconsistency: §5.1 cites 2621 Annex I, §4(d) cites 2547 Annex I, §3.3(2)(d) cites 2547's Annex unnumbered). **Do NOT "fix" the throw by picking the highest or first matching row** — that is the tie-break rule from §5.1's *default* branch, whose scope is itself two-way readable (§11.4 / the §5 ambiguities), and applying it here would substitute a guess for a lookup we simply haven't built. Resolve by pulling the route table.

Unreachable on the live path while CSCF is unpublished (§11.1), so it bites only once both are resolved.

**10.14 §1.2 (4)(c) indirect actual/default split — basis is the EMISSION FACTOR, not precursor default values.** (4)(c) asks for the shares of indirect emissions determined on actual vs default values *"in accordance with Article 9"*. Article 9's distinction for indirect turns on the **emission factor**: the country grid factor (IR 2025/2621 Annex II) is the default; an actual factor requires a qualifying PPA or direct technical link with documentary evidence. Confirmed by (4)(c)'s own sub-item demanding *"confirmation that the criteria for the use of actual values … are met"* — criteria and evidence attach to the factor, not to metered consumption.

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
