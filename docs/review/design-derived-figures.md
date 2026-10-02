# Design: location figures derived from accepted documents

**Status.** Design with rulings applied, 1 Oct 2026. No code, no diffs and no migrations have been written or
run. Line numbers refer to the working tree on 1 Oct 2026.

**Related.** [ghg-findings.md](ghg-findings.md) F-09, F-10 and F-11; scenarios A and B in
[recalc/scenarios-additions.md](recalc/scenarios-additions.md).

**Rulings applied** (section 10 records them):
- **C4:** half-open day count.
- **C5:** approved.
- **C6(a):** meter in the coverage key.
- **C6(b):** an exact-duplicate check across document types.
- **Q1:** manual override with a required reason.
- **Q2:** monthly slices tagged by inventory.
- **Q3:** verifier links pinned to a saved version.
- **Q4:** a PDF workings page rendered from stored workings.
- **R2 `metered_split`:** in scope now.
- **Section 4:** replaced for pre-launch.

---

## 0. The problem, restated against the code

**What is true.**
- **Figures are stored, not derived.** Each document-backed fuel field (`natural_gas_amount`, `electricity_kwh`,
  …) is a stored value on the location in `ghg_inventories.locations_data`.
- **Two handlers write them, both through `applyResolutions`.** Proposal confirmation
  (app/dashboard/ghg/page.tsx:1249-1255) and adding a coverage resolution (page.tsx:1285-1289).
- **Totals read the stored fields.** `calcInventory` (page.tsx:1428; engine.ts:2585 onward).
- **Workings call `applyResolutions` themselves.** `buildWorkings` uses its value for any field it covers
  (engine.ts:3191-3195).

**What is not quite true.** "Resolutions cannot change totals" is not accurate: adding a resolution re-derives
the stored field (page.tsx:1285-1289). F-09 and F-10 come from inside `applyResolutions`:
- **No reporting-year filter:** a bill wholly outside the year is summed at factor 1 (engine.ts:2952-2968, 2991).
- **The duplicate resolution changes no value** (engine.ts:2991, 3006-3009).

**What the stored-figure pattern breaks.** The stored field is a cache of `applyResolutions` that only two
handlers refresh:

| Change | Re-derives the stored field? | Evidence | Effect |
|---|---|---|---|
| Remove a document | No | `removeDoc` patches `source_docs` only (page.tsx:1154-1170) | The removed bill's quantity stays in totals, while `buildWorkings` derives a smaller figure from the remaining documents, so **saved totals and saved workings disagree**. If the last document is removed, the workings fall back to the stale field, labelled `entry_method: 'manual'` (engine.ts:3193-3203). |
| Un-confirm or reject the last confirmed proposal for a field | No | Only fields present in `applied` are written (page.tsx:1251-1255) | The old figure remains, with no document behind it. |
| Change `reporting_year` or `fiscal_year_end_month` | No | Plain state updates (page.tsx:1798, 1807, 1811) | Window-dependent results go stale; stored resolutions keep the old `daysInYear`, `totalDays` and `monthsCovered`. |
| Add or remove a resolution | Yes | page.tsx:1276-1293 | Correct. |

CLAUDE.md invariant 2 ("`applyResolutions()` is the single source of truth for what a figure IS") is broken in
two ways today: the function is wrong for out-of-year and duplicate bills, and its output is cached in a field
that other edits do not refresh.

---

## 1. Design in one paragraph

Stop storing document-backed figures. One pure engine function computes, per location and fuel field, the set
of **bill contributions** from accepted documents. There is one row per accepted proposal, with:
- its canonical period;
- its in-window days and share;
- whether it counts, and why.

`applyResolutions` becomes the fold of those contributions plus the gap gross-up, and is the only producer of a
document-backed figure. Every consumer receives an inventory derived from it: totals, workings, `pct_estimated`,
factor editions, the monthly split, the coverage gate and the save payload. A typed figure remains a stored
value, but only for a field with no accepted documents, or for one the customer has switched to manual entry
with a reason (section 3.3).

---

## 2. Rules, as engine behaviour

All periods use the canonical form `[start, exclusiveEnd(end))` (engine.ts:1711-1715): one definition, no fork.

### Day counting (C4, ruled)

In-year and total days are counted on the canonical **half-open** interval, with the same `dayCount` coverage
already uses (engine.ts:1738). "Inclusive" in the brief means inclusive of the last covered day, which is
`exclusiveEnd(end) − 1`. So:
- "Dec 1 – Jan 1" is 31 days.
- "Dec 20 – Jan 19" is 31 days, 12 of them in December.

The engine's inclusive `daysBetween` and the monthly module's local half-open count stay separate, as CLAUDE.md
requires. Neither is changed.

### R1. A bill wholly outside the reporting year contributes zero

`inWindowDays = 0` gives `counted: false` with reason `outside_year`. The document stays as evidence, and the
strip's "…not counted" becomes true.

### R2. A straddling bill is prorated automatically by its own in-year days

- **Share.** `share = inWindowDays / totalDays`, per bill. This replaces the single stored ratio applied to every
  straddling bill of a fuel (page.tsx:3579-3580; engine.ts:2981-2988).
- **No resolution.** A straddle is no longer a blocking issue. Its arithmetic is disclosed on the workings, e.g.
  "Dec 15 2025 – Jan 14 2026: 17 of 31 days in FY2025; ×0.548".
- **`metered_split` override (in scope).** The customer may replace the day split with a metered split, but only
  by attaching a document. It is recorded as a resolution:
  `{ kind: 'metered_split', locId, fuelType, docId, proposalIndex, evidenceDocId, inYearValue, unit, note, acknowledgedAt }`.
  - **Engine validation:** `evidenceDocId` must name a document on the same location, other than the bill being
    split. `inYearValue` must lie between 0 and the bill's value, in the bill's unit.
  - **Effect:** the contribution uses `inYearValue` in place of `value × share`, and records `meteredSplit` on
    the contribution.
  - **Without an evidence document** the control is unavailable.
- **Removed.** "Count in this year" and "Count in next year" assert an attribution no document supports.

### R3. Overlap detection compares full periods

- **Full periods.** Two bills overlap when their full canonical periods intersect, whether or not the
  intersection is in the reporting year. Today both bills are clipped to the window first (engine.ts:1786-1787).
- **Group key.** Overlap is tested within one coverage group, keyed `(document_type, fuelType, meter_label)`
  (C6(a), ruled). `meter_label` defaults to a single meter, so a location with one meter per fuel behaves as
  today.
- **Gaps.** Measured on in-window days only.

### R4. An overlap must be resolved, and no resolution may leave a known double count

| Resolution | Recorded | Effect on the figure |
|---|---|---|
| **Same bill, count it once** | `kind: 'same_bill'`, `countedDocId`, `excludedDocIds[]` | Only the counted document contributes. Excluded documents get `counted: false`, reason `same_bill_as:<docId>`. They stay in `source_docs` as evidence, marked "retained, not counted" in the document index. |
| **Different meters or accounts** | `kind: 'different_meters'`, and the customer names the second document's meter (`meter_label`, required, non-empty) | Both count. The two documents fall into different coverage groups, so each meter gets its own gap check. |

"Confirm not a duplicate" is removed; `duplicate` is never written. A `same_bill` resolution must name exactly
one counted document per overlapping set, validated in the engine.

### R5. A month-only period needs the customer to confirm the dates at acceptance

A new proposal field records where the dates came from:

```
periodOrigin: 'printed' | 'billing_month' | 'customer_confirmed'
```

- **At extraction:** `periodConfidence` "high" gives `printed`, "medium" gives `billing_month`, and "low" leaves
  null dates (as today, route.ts:63-66).
- **At acceptance:** a `billing_month` proposal cannot be confirmed until the customer confirms or corrects the
  dates. That sets `periodOrigin: 'customer_confirmed'`, `periodConfirmedAt` and `periodConfirmedBy`.
- **Display:** any confirmed proposal still reading `billing_month` is shown as "Dates estimated from the
  billing month".

### R6. Exact-duplicate check across document types (C6(b), ruled)

The overlap key stays as above. Separately, within one location, the engine flags an **exact duplicate** between
two accepted proposals from **different** document types when either:
- **(a)** their source documents have the same `sha256`; or
- **(b)** they have the same canonical `value`, the same canonical `unit` and the same `periodStart` and
  `periodEnd`.

**It is a warning, not an overlap issue.** It is not in `cov.issues`. It must still be acknowledged before export,
as either:
- **"Same document, count once":** `{ kind: 'exact_duplicate', choice: 'count_once', countedDocId, excludedDocIds[] }`.
  The excluded contribution reads `counted: false`, reason `exact_duplicate_of:<docId>`.
- **"Not the same":** `{ kind: 'exact_duplicate', choice: 'not_same', docIds[] }`. Both count.

**Where the hash comes from.** Uploads go from the browser straight to storage
(`supabase.storage.from('source-documents').upload(path, file)`, page.tsx:1025).
- **Computed at upload.** `handleFileUpload` computes the hash in the browser before uploading:
  `crypto.subtle.digest('SHA-256', await file.arrayBuffer())`, hex-encoded.
- **Stored** on the source doc as `sha256` in `locations_data`.
- **Purpose.** The hash is for duplicate detection only. It is client-supplied and is not an integrity guarantee.

**Source docs without a hash.** These are documents uploaded before the change.
- `sha256` stays absent. Criterion (a) cannot fire for them; criterion (b) still applies.
- The engine never treats a missing hash as a match.
- No backfill is run pre-launch. A later backfill would need a server-side script that downloads each file from
  the `source-documents` bucket and writes the hash. It is out of scope.

---

## 3. Data model

Documents, proposals and resolutions are JSON inside `ghg_inventories`: `locations_data` and
`coverage_resolutions`. Most changes are JSON shape and TypeScript types.

### 3.1 JSON and type changes (lib/ghg/engine.ts)

| Type | Change |
|---|---|
| `ExtractedProposal` (engine.ts:1569) | Add `periodOrigin`, `periodConfirmedAt`, `periodConfirmedBy`. Keep `periodConfidence`. |
| `SourceDoc` | Add `sha256?: string` (R6) and `meter_label?: string` (R3, R4). |
| `Location` | Add `manual_overrides?: { field, reason, at, by }[]` (section 3.3). |
| `CoverageResolution` | Written kinds: `extrapolate` (unchanged), `same_bill`, `different_meters`, `metered_split`, `exact_duplicate`. Legacy `duplicate` and `straddle` are readable and treated as unresolved (section 4). |
| New, derived only: `BillContribution` | `{ docId, proposalIndex, fuelType, field, meterLabel (null = default meter), periodStart (verbatim), periodEndExclusive, periodOrigin (null = not recorded), totalDays, inWindowDays, share (all three null when undated or invalid_period), value, unit, counted, reason: 'counted' \| 'prorated' \| 'outside_year' \| 'undated' \| 'invalid_period' \| 'same_bill_as' \| 'exact_duplicate_of' \| 'manual_override' \| 'not_confirmed' \| 'mixed_units', periodProblem? ('unparseable' \| 'reversed', set only for invalid_period), reasonRef?, meteredSplit?: { evidenceDocId, inYearValue } }`. The two `periodProblem` kinds each have a plain-language sentence, `INVALID_PERIOD_MESSAGE`, exported from the engine. Never stored on the location. It is carried into `workings`. See the T1 decisions in section 10. |
| Workings row (document-backed) | Add `contributions: BillContribution[]` and `manual_override?: { reason, at, by }`. |

### 3.2 SQL

Two migrations, both proposed and **not run**. Their text is in section 11, tasks T7 and T16.
- **T7** adds `ghg_inventories.derivation_version` (default 2).
- **T16** adds the inventory-version table, `ghg_inventories.current_version_id`,
  `verifier_access.inventory_version_id`, and the version-aware verifier read.

`ghg_monthly_emissions` needs no new column (Q2, section 6): `inventory_id` already exists, `not null`, with a
foreign key to `ghg_inventories` (on delete cascade) and an index on `(inventory_id, period_month)`.

### 3.3 Manual override with a required reason (Q1, ruled)

- **Field with accepted documents:** the figure is derived. The typed input is read-only, "From N documents".
- **Field with no accepted documents:** the typed value is the figure, `entry_method: 'manual'`.
- **Switching to manual:** the customer chooses "Enter this figure manually instead" and must give a reason
  (non-empty). This writes `manual_overrides[{ field, reason, at, by }]`. The documents stay as evidence; their
  contributions read `counted: false`, reason `manual_override`.
- **Where the reason is shown:**
  - on the workings row;
  - **on the verifier page**, beside the uncounted documents;
  - **in the PDF document index**, beside the uncounted documents.

---

## 4. Saved inventories (pre-launch)

There are no customer inventories. Therefore:
- **`derivation_version`.** `ghg_inventories.derivation_version` is added with default **2**, and every save
  writes 2 (T7).
- **Legacy resolutions are unresolved.** A stored `duplicate` resolution does not resolve an overlap, and a stored
  `straddle` resolution is ignored (R2 prorates automatically). Any test or development inventory carrying them
  shows the overlap as unresolved, and export is gated until it is re-resolved.
- **No reconciliation panel**, and no stored-versus-derived comparison.

---

## 5. Files that change

| File | Change |
|---|---|
| lib/ghg/engine.ts | `billContributions` (new). `applyResolutions` (2933-3015) as the fold of contributions plus the gross-up. `analyzeCoverage` (1717-1835): full-period overlap, no straddle issue, meter-keyed groups. `findUnresolvedCoverage` (3399-3445): new kinds and key, exact-duplicate warnings. Types (3.1). `deriveLocations(inventory)` (new). `buildWorkings` (3028-3389): `contributions` and `manual_override` on rows. `pctEstimated` (2818-2851) reads derived figures. Remove the untrue "drops a double-count" comments (1853, 2826). |
| lib/ghg/monthlyEmissions.ts | `buildMonthlyEmissions` (166-260) reads counted contributions and writes in-window days only. `reconcile` (282-342) matches by location and fuel and reads contributions. |
| lib/ghg/loadMonthly.ts | Filter by `inventory_id` instead of `company_id` + `reporting_year` (84-85). |
| app/dashboard/ghg/trends/page.tsx | Pass the selected inventory's id to `loadMonthly` (112). |
| lib/ghg/factorEditions.ts | `buildFactorEditions` (223-326) receives derived locations. |
| app/dashboard/ghg/page.tsx | Remove field writes in `updateProposal` (1249-1264) and `addCoverageResolution` (1285-1289). Memoise `deriveLocations` and pass it to totals (1428), the gate (1301-1306), the save payload (1610-1655) and step 4. Hash at upload (1016-1047). Coverage strip controls (3495-3600). Date confirmation at acceptance. Manual override control. Metered split control. Exact-duplicate acknowledgement. Version snapshot on link issue (T16). |
| app/verify/[token]/page.tsx | Render contributions, excluded documents with reasons, manual-override reasons and estimated dates, from stored `workings` (no recompute). "Newer version exists" notice (T16). |
| lib/assurancePdf.ts | Workings page from stored workings. Document index status and reasons. Residual table from stored workings rows (T17). |
| app/dashboard/ghg/page.tsx (PDF caller, 3080-3096) | Stop recomputing residual rows with `getResidualFactor` at export; pass stored workings (T17). |
| supabase/migrations/ | T7 and T16. |
| CLAUDE.md | The coverage-gate invariant text gains the meter key and the exact-duplicate check (T3, T15). Lisa edits; CC proposes the wording. |
| Tests | Section 8, per task in section 11. |

---

## 6. Monthly split, trends and the coverage gate

**Monthly split** (C5, approved). It reads counted contributions, never the annual figure, which includes the
gap gross-up.
- **Counted bills:** split by calendar month over the **in-window part** of the canonical period. Out-of-window
  days are not written.
- **Uncounted bills:** write nothing.
- **Metered split:** writes `inYearValue` across in-window months by days, with `source_doc_id` set to the
  evidence document.
- **Identity:** Σ slices in the window = Σ counted contributions = the annual figure before the gross-up. So
  `reconcile` holds with `unexplained_delta = 0`, matched by location and fuel.

**Inventory tagging and trends** (Q2, ruled).
- **Slices** remain calendar months. Each slice already carries its source inventory in
  `ghg_monthly_emissions.inventory_id` (not null, foreign key, indexed with `period_month`). **No column change.**
- **The change** is in the reader: `loadMonthly` filters `.eq('inventory_id', inventoryId)` in place of
  `.eq('company_id', …).eq('reporting_year', …)` (lib/ghg/loadMonthly.ts:84-85). The trends page passes the
  selected inventory id (trends/page.tsx:112).
- **`reporting_year` on the slice** keeps the calendar year of the month, and is no longer used for selection.
- **Existing index:** `ghg_monthly_emissions_month_idx (inventory_id, period_month)` serves the new query.

**Coverage gate.**
- **Per group:** iterates `cov.issues` per `(document_type, fuelType, meter_label)`. Issues are `gap` (needs
  `extrapolate`) and `overlap` (needs `same_bill` or `different_meters`). `none` still blocks. `straddle` is not
  an issue.
- **Exact duplicates:** a separate list. An unacknowledged one also blocks export.

---

## 7. Verifier page and assurance PDF

### Verifier page

Rendered from stored `workings` only (invariant 1). Each document-backed row lists its contributions, including:
- excluded documents with their reason (`same_bill_as`, `exact_duplicate_of`, `outside_year`, `manual_override`
  with the customer's reason);
- proration shares;
- metered splits with their evidence document;
- "Dates estimated from the billing month".

### Version pinning (Q3, ruled)

- **How a version is identified.** A saved version is a row in `ghg_inventory_versions`:
  - `id` (uuid) and `(inventory_id, version_no)`, unique;
  - `snapshot` (jsonb): the same projection `get_verifier_inventory` returns today, including `workings`, totals,
    `factor_editions`, `comparability_disclosure`, `coverage_resolutions` and `derivation_version`;
  - `snapshot_sha256`, computed in SQL from the jsonb;
  - `saved_at`, `user_id`.
- **When a version is created.** When a verifier link is issued, the snapshot function hashes the current
  projection.
  - **Unchanged content:** if the latest version has the same hash, that version is reused.
  - **Changed content:** otherwise a new version is inserted with the next `version_no`.
  - **The link:** `verifier_access.inventory_version_id` records the version.
  - **The inventory:** `ghg_inventories.current_version_id` points at the latest snapshot.
- **What the verifier sees.**
  - **The pinned snapshot**, through `get_verifier_inventory`.
  - **`newer_version_exists`**, true when the current projection's hash differs from the pinned snapshot's.
  - **The notice:** "A newer version of this inventory has been saved. Ask the company for a new link."
  - **No transfer:** a new link must be issued; the old one never moves to the new version.
- **Links without a version.** A `verifier_access` row with `inventory_version_id` null (pre-change, development
  only) is read as today, live.
- **The audit trail stays live.** It is append-only and describes the inventory's history, not a version.

### Assurance PDF (Q4, ruled)

A new **Workings** page is rendered from the stored `workings` passed to the generator, with no recompute. One
row per workings row:
- location, stream, scope;
- activity, factor, factor source;
- **factor vintage** (grid year or factor edition, from `factor_vintage`);
- GWP basis, result.

Under each document-backed row are its contributions:
- document, period, in-window days / total, share;
- counted or excluded, with the reason;
- manual-override reason;
- metered-split evidence.

Other PDF changes:
- **Source Document Index** gains a Status column (counted / prorated ×share / outside year / same bill as … /
  exact duplicate of … / manual figure used: "<reason>" / dates estimated from the billing month).
- **Residual-mix table** is read from the stored market-based workings rows (their `ef_source`, `factor_vintage`
  and note). It is no longer recomputed at export with `getResidualFactor` (app/dashboard/ghg/page.tsx:3082-3091).

---

## 8. Tests

The tests are grouped by task in section 11. They include all of these:
- **Scenario A** (two adjacent bills):
  - FY2025: Bill 1 counted, Bill 2 `outside_year`.
  - FY2026: the reverse.
  - No overlap or straddle.
  - Monthly FY2025 writes only Dec 2025.
  - `reconcile` delta 0.
- **Scenario B** (month-only "Jan 2026"):
  - `billing_month` cannot be confirmed without date confirmation.
  - After confirmation it is counted in FY2026.
  - With Scenario A's Bill 2 in FY2026: overlap raised; `same_bill` leaves one counted.
  - With Bill 2 in FY2025: overlap still raised (full periods), and both contribute zero.
  - Legacy `periodConfidence: 'medium'` without `periodOrigin` reads `billing_month`.
- **Straddles:**
  - per-bill shares with two straddling bills;
  - "Dec 1 – Jan 1" = 31 days;
  - `metered_split` validation (no evidence: rejected; value outside 0..value: rejected) and its monthly sum.
- **Overlap:**
  - full-period detection across years;
  - property test: no resolution set leaves two counted contributions over the same days;
  - legacy `duplicate` and `straddle` read as unresolved;
  - `different_meters` without a label rejected;
  - meter-keyed gap check.
- **Exact duplicates:**
  - same `sha256` across `fuel_diesel` and `fleet_fuel` warns;
  - same value + unit + period warns;
  - a missing hash never matches by hash;
  - acknowledgement `count_once` excludes one; `not_same` counts both;
  - an unacknowledged warning blocks export.
- **Staleness regressions:**
  - removing a document changes the derived total;
  - un-confirming the last proposal gives 0;
  - changing `reporting_year` changes which bills count;
  - saved totals equal the sum of saved workings rows.
- **Manual override:**
  - a reason is required;
  - contributions read `manual_override`;
  - the reason appears in workings.
- **Versions:**
  - snapshot reuse on an unchanged hash;
  - a new `version_no` on change;
  - `newer_version_exists`;
  - a pinned link keeps the old snapshot.
- **PDF:**
  - the workings page renders stored rows verbatim (generator fed fixture workings; no engine import in the page
    builder);
  - residual rows come from stored workings;
  - the document index status column.
- **Invariant guards:**
  - `exclusiveEnd` single definition;
  - monthly never grossed up;
  - no contribution arithmetic in app/dashboard/ghg/page.tsx;
  - `npx vitest run lib/ghg/engine.test.ts` count only goes up.

---

## 9. CLAUDE.md invariants, with rulings

| # | Invariant | Status |
|---|---|---|
| C1 | Page renders `buildWorkings()` output; never re-derive rows in the component. | Kept. Strip, verifier and PDF read engine or stored output only. Guard test. |
| C2 | `applyResolutions()` is the single source of truth. | Restored: no stored document-backed figure. |
| C3 | `exclusiveEnd()` has one definition. | Kept. |
| C4 | Inclusive `daysBetween` vs local half-open count; do not unify. | **Ruled:** half-open count on the canonical interval, "inclusive" meaning inclusive of the last covered day. Functions not unified. |
| C5 | Monthly = evidenced only; never gross up. | **Approved:** monthly reads contributions; out-of-window days are not written. |
| C6(a) | Coverage gate keyed per (document_type, fuelType). | **Ruled:** key becomes (document_type, fuelType, meter_label), default single meter. CLAUDE.md text to be updated by Lisa (T3). |
| C6(b) | Same, for cross-document-type duplicates. | **Ruled:** overlap keeps the key; exact-duplicate check (R6) is a separate acknowledged warning. CLAUDE.md text to be updated by Lisa (T15). |
| C7 | `s3_td` distinct. | Unaffected. |

---

## 10. Rulings record

| Item | Ruling |
|---|---|
| C4 | Half-open day count; "inclusive" = inclusive of the last covered day. |
| C5 | Approved. |
| C6(a) | Key (document_type, fuelType, meter_label), default single meter. |
| C6(b) | Keep the overlap key; add an exact-duplicate check across document types within a location (same file hash, or same value + unit + period), as a warning the customer must acknowledge ("Same document, count once" / "Not the same"). |
| Q1 | Manual override allowed with a required reason, shown on the verifier page and in the PDF document index beside the uncounted documents. |
| Q2 | Slices remain calendar months tagged with their source inventory; trends filter by inventory. |
| Q3 | Verifier links pin to the saved version they were issued against; a re-save shows "newer version exists" and needs a new link. |
| Q4 | PDF workings page from stored workings, with contributions, shares, excluded documents and reasons, overrides and reasons, grid year / factor edition per row. Residual table from stored values. |
| R2 | `metered_split` in scope now. |
| Section 4 | Pre-launch: `derivation_version` default 2; legacy `duplicate`/`straddle` unresolved; no reconciliation panel. |
| T1: undated | A confirmed proposal with no dates gets reason `undated`, not counted, with `totalDays`, `inWindowDays` and `share` null. The coverage gate's 'none' still blocks export. |
| T1: invalid_period | A confirmed proposal with both dates present but unusable gets its own reason `invalid_period`, not counted, with `totalDays`, `inWindowDays` and `share` null. Two kinds, recorded in `periodProblem`: `reversed` (both dates real, the end before the start, so the canonical period has no days) and `unparseable` (a date string present but not a real yyyy-mm-dd date, including one such as 2025-02-30 that the Date constructor would roll over). Each has a distinct plain-language message: unparseable, "The billing period on {file} could not be read as dates (\"{start}\" to \"{end}\"). Enter the dates as they appear on the bill."; reversed, "The billing period on {file} ends before it starts ({start} to {end}). Check the dates and correct them." A one-day bill (end = start) is valid. Precedence: not_confirmed, then mixed_units, then invalid_period, then undated. |
| T1: rows | Every proposal with a value that maps to a field gets a row. Unconfirmed statuses (extracted, needs_manual_review, rejected) are `not_confirmed`, not counted. |
| T1: mixed units | When a field's confirmed proposals carry more than one unit, every confirmed row of that field is `mixed_units`, not counted. |
| T1: null value | A proposal with value null produces no row. |
| T1: periodOrigin | high → printed, medium → billing_month; a missing or other periodConfidence → null (not recorded). |
| T1: meterLabel | null means the default single meter. |
| T3: no silent zero | Of the not-counted reasons, only `outside_year` and `same_bill_as` may be silent. `undated`, `invalid_period` and `mixed_units` must each raise an export-blocking coverage issue with a plain-language message, so a field can never drop to zero without the customer being told. (`not_confirmed` from `extracted` or `needs_manual_review` already blocks export through the pending-proposal gate, page.tsx:1301. A `rejected` proposal does not block on its own; the all-rejected case is the next ruling.) |
| T3: all documents rejected | When every document for a field is rejected and no manual figure is entered, raise an export-blocking issue offering "Enter the figure manually" or "Confirm this site used none". Confirming records who and when, appears in workings and on the verifier page, and clears the issue. Entering a manual figure clears it the same way (the field then has `entry_method: 'manual'`, per section 3.3). |

---

## 11. Implementation tasks, in dependency order

Each task is one reviewable diff with its own tests. Run `npx vitest run lib/ghg/engine.test.ts` before and after
every engine task: the passing count only goes up. Run `npm run build` after every task. Tasks T1 to T13 are the
core derived-figures work. T14 to T17 come after it, as ruled.

### T1. Engine: `billContributions` (pure, not yet wired)
- **Files:** lib/ghg/engine.ts (new function, `BillContribution` type); lib/ghg/engine.test.ts.
- **SQL:** none.
- **Tests:** Scenario A per-bill rows for FY2025 and FY2026; "Dec 1 – Jan 1" = 31 days; "Dec 20 – Jan 19" = 31
  with 12 in window; two straddling bills with their own shares; unconfirmed and mixed-unit reasons;
  `exclusiveEnd` single-definition guard extended.
- **Done:** the function returns correct contributions for every fixture; nothing calls it yet; all existing tests
  pass.

### T2. Engine: `applyResolutions` as the fold of contributions (R1, R2 automatic proration)
- **Files:** lib/ghg/engine.ts (`applyResolutions`, the `CoverageResolution` reader treating legacy `straddle` as
  ignored); engine.test.ts.
- **SQL:** none.
- **Tests:** out-of-year bill contributes 0 (F-09); per-bill straddle shares; extrapolation applied after the fold;
  legacy `straddle` ignored; existing figure tests updated only where F-09 or the straddle rule changes them
  (each change listed in the PR).
- **Done:** `applyResolutions` = Σ counted contributions × gross-up; no window-dependent figure comes from
  anywhere else.

### T3. Engine: coverage with full-period overlap, meter key, `same_bill` / `different_meters`
- **Files:** lib/ghg/engine.ts (`analyzeCoverage`, `findUnresolvedCoverage`, resolution validation, the `straddle`
  issue removed); engine.test.ts. Proposed CLAUDE.md wording for the coverage-gate invariant (Lisa applies).
- **SQL:** none.
- **Tests:** Scenario B + Bill 2 in FY2026 and in FY2025 (overlap both times); `same_bill` excludes and retains;
  `different_meters` needs a label and splits groups; legacy `duplicate` unresolved; the no-double-count property
  test; meter-keyed gaps. No silent zero (ruling in section 10): an `undated`, an `invalid_period` and a
  `mixed_units` contribution each raise an export-blocking issue with a plain-language message naming the
  document, and the two `invalid_period` kinds use their distinct `INVALID_PERIOD_MESSAGE` sentences;
  `outside_year` and `same_bill_as` raise none. All documents rejected (ruling in section 10): a field whose every
  document is rejected, with no manual figure, raises an export-blocking issue offering "Enter the figure
  manually" and "Confirm this site used none"; confirming records who and when, appears as a row in workings and
  on the verifier page, and clears the issue; entering a manual figure also clears it; one rejected and one
  confirmed document does not raise it. Property test: every field that has documents and whose figure is zero
  either has an export-blocking issue, or has only `outside_year` / `same_bill_as` rows, or carries a recorded
  "used none" confirmation; this covers the all-rejected case.
- **Done:** the gate's issue list matches R3 and R4; `duplicate` is never produced by any engine path; no field
  can reach zero from confirmed documents without either an export-blocking issue or a silent reason the ruling
  allows.

### T4. Engine: `deriveLocations` and its consumers
- **Files:** lib/ghg/engine.ts (`deriveLocations`; `calcInventory`, `pctEstimated` and `findUnpriceableLocations`
  called on derived locations); lib/ghg/factorEditions.ts; tests.
- **SQL:** none.
- **Tests:** staleness regressions (remove document, un-confirm last proposal, change reporting year); derived
  totals equal the sum of `buildWorkings` rows for every fixture.
- **Done:** every engine consumer can be fed a derived inventory, and totals equal workings by construction.

### T5. Engine: contributions and overrides on workings rows
- **Files:** lib/ghg/engine.ts (`buildWorkings` adds `contributions`, drops the stale-field fallback for
  document-backed fields); lib/ghg/workingsCells.ts (share cell); tests.
- **SQL:** none.
- **Tests:** each document-backed row carries its contributions; excluded documents present with reasons;
  `entry_method` is never 'manual' for a field with accepted documents.
- **Done:** stored workings carry everything the verifier page and the PDF need, with no recompute.

### T6. Monthly: read contributions, in-window only; `reconcile` by location and fuel
- **Files:** lib/ghg/monthlyEmissions.ts; tests.
- **SQL:** none.
- **Tests:** Scenario A monthly FY2025 writes only Dec 2025; Σ slices = annual before gross-up; `reconcile` delta 0
  on Scenario A and two-site fixtures; monthly never grossed up (guard extended).
- **Done:** the monthly ↔ annual identity holds and is tested.

### T7. Save path: derived figures saved, field writes removed, `derivation_version`
- **Files:** app/dashboard/ghg/page.tsx (remove writes at 1249-1264 and 1285-1289; memoised `deriveLocations`
  feeding totals 1428, gate 1301-1306, save payload 1610-1655, step 4, monthly write 1674-1703; payload writes
  `derivation_version: 2`); supabase/migrations/2026MMDD_ghg_derivation_version.sql; a source-guard test.
- **SQL** (proposed, not run):
  ```sql
  -- supabase/migrations/2026MMDD_ghg_derivation_version.sql
  -- NOT RUN.
  alter table public.ghg_inventories
    add column if not exists derivation_version smallint not null default 2;
  comment on column public.ghg_inventories.derivation_version is
    '2 = location figures derived from accepted documents through applyResolutions at every save. '
    'No version 1 inventories exist (column added pre-launch).';
  ```
  No grant or policy change: an added column is covered by the table's existing grants and policies. The audit
  trigger and `enforce_ghg_location_allowance()` fire on update and do not read this column. If the verifier
  projection is to return it, that is part of T16.
- **Tests:** no field assignment from `applyResolutions` output remains in page.tsx (source guard); saved payload
  totals equal saved workings.
- **Done:** document-backed figures are never stored as authoritative values; the build passes.

### T8. UI: coverage strip
- **Files:** app/dashboard/ghg/page.tsx (strip at 3495-3600: straddle disclosure in place of buttons; "Same bill,
  count it once" with document choice; "Different meters or accounts" with meter-label input); component test.
- **SQL:** none.
- **Tests:** controls write `same_bill` and `different_meters` with the validated shape; no "Confirm not a
  duplicate" or this/next-year buttons remain.
- **Done:** every overlap can be resolved only in a way that leaves no double count.

### T9. UI: date confirmation for month-only periods
- **Files:** app/dashboard/ghg/page.tsx (`periodOrigin` mapped from `periodConfidence` at extraction, around
  1055-1076; confirmation step at acceptance); lib/ghg/engine.ts (acceptance validator); tests.
- **SQL:** none.
- **Tests:** a `billing_month` proposal cannot reach `confirmed` without date confirmation; confirmation records
  origin, time and user; legacy medium proposals read `billing_month`.
- **Done:** no new month-only bill is counted on estimated dates without the customer's confirmation.

### T10. UI and engine: manual override with a reason
- **Files:** lib/ghg/engine.ts (`manual_overrides` honoured in contributions and workings); app/dashboard/ghg/page.tsx
  (control and reason input); tests.
- **SQL:** none.
- **Tests:** empty reason rejected; override uses the typed figure; contributions read `manual_override`; workings
  row carries the reason.
- **Done:** a customer with an unusable document can finish, and the reason travels with the figure.

### T11. Verifier page: contributions, reasons, estimated dates
- **Files:** app/verify/[token]/page.tsx (render from stored `workings`); lib/ghg/verifierWhitelist.test.ts if a new
  field crosses the projection; tests.
- **SQL:** none (fields live inside the `workings` jsonb the RPC already returns).
- **Tests:** a page fixture with excluded documents, a manual override and a month-only bill renders each reason;
  no engine calculation imported into the page.
- **Done:** a verifier can see, per figure, which documents counted, which did not, and why.

### T12. Trends: monthly by inventory
- **Files:** lib/ghg/loadMonthly.ts (filter `inventory_id`); app/dashboard/ghg/trends/page.tsx (pass the selected
  inventory id, 112); tests.
- **SQL:** none (`inventory_id` and the `(inventory_id, period_month)` index exist).
- **Tests:** two inventories with slices in the same calendar year are not mixed; a fiscal-year inventory shows its
  own months.
- **Done:** the monthly chart shows exactly the selected inventory's evidenced months.

### T13. Core close-out
- **Files:** remove dead paths (legacy straddle and duplicate writers, the stale-field fallback); update
  docs/review/ghg-findings.md statuses for F-09, F-10, F-11 (as fixed, with commit references added by Lisa);
  propose CLAUDE.md invariant wording.
- **SQL:** none.
- **Tests:** full suite; engine count not lower than before T1.
- **Done:** F-09, F-10 and F-11 are closed by tests that would fail on the old code.

### T14. `metered_split`
- **Files:** lib/ghg/engine.ts (resolution type, validation, contribution override); lib/ghg/monthlyEmissions.ts
  (slices from `inYearValue`); app/dashboard/ghg/page.tsx (control enabled only when an evidence document is
  attached on the location); tests.
- **SQL:** none.
- **Tests:** rejected without evidence; rejected when `inYearValue` is outside 0..value; annual uses
  `inYearValue`; monthly slices sum to it; workings show the evidence document.
- **Done:** a metered split replaces a day split only with a document behind it.

### T15. Exact-duplicate check across document types
- **Files:** app/dashboard/ghg/page.tsx (`handleFileUpload`, 1016-1047: compute SHA-256 with
  `crypto.subtle.digest` before upload, store `sha256` on the source doc; acknowledgement UI); lib/ghg/engine.ts
  (duplicate detection, `exact_duplicate` resolution, gate); tests. Proposed CLAUDE.md wording.
- **SQL:** none (the hash lives in `locations_data`).
- **Tests:** same hash across `fuel_diesel` and `fleet_fuel` warns; same value + unit + period warns; a missing hash
  never matches by hash; `count_once` excludes one; `not_same` counts both; unacknowledged warning blocks export.
- **Done:** the same bill uploaded under two document types cannot be counted twice without the customer saying so.

### T16. Verifier links pinned to a saved version
- **Files:** supabase/migrations/2026MMDD_ghg_inventory_versions.sql, 2026MMDD_ghg_inventory_versions_grants.sql,
  2026MMDD_get_verifier_inventory_versions.sql; lib/ghg/verifierGrant.ts (link issue snapshots first);
  app/verify/[token]/page.tsx (render the snapshot, "newer version exists" notice); lib/ghg/verifierWhitelist.test.ts;
  offline SQL parse (pglast) of each file.
- **SQL** (proposed, not run; to be checked against the current `get_verifier_inventory` in
  20260814_get_verifier_inventory_factor_editions.sql before writing):
  ```sql
  -- 2026MMDD_ghg_inventory_versions.sql  (NOT RUN)
  create table public.ghg_inventory_versions (
    id               uuid primary key default gen_random_uuid(),
    inventory_id     uuid not null references public.ghg_inventories(id) on delete cascade,
    version_no       integer not null check (version_no > 0),
    user_id          uuid not null,
    saved_at         timestamptz not null default now(),
    snapshot         jsonb not null,
    snapshot_sha256  text not null,
    unique (inventory_id, version_no)
  );
  alter table public.ghg_inventory_versions enable row level security;
  create policy ghg_inventory_versions_select_own on public.ghg_inventory_versions
    for select to authenticated using (user_id = (select auth.uid()));
  -- No insert/update/delete policy: rows are written only by the function below, and never changed.

  alter table public.ghg_inventories
    add column if not exists current_version_id uuid references public.ghg_inventory_versions(id);
  alter table public.verifier_access
    add column if not exists inventory_version_id uuid references public.ghg_inventory_versions(id);

  -- Snapshot the verifier projection of an inventory the caller owns; reuse the latest version if unchanged.
  create or replace function public.ghg_snapshot_inventory_version(p_inventory_id uuid)
  returns uuid
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    v_uid  uuid := (select auth.uid());
    v_snap jsonb;
    v_hash text;
    v_last public.ghg_inventory_versions%rowtype;
    v_id   uuid;
  begin
    if not exists (select 1 from public.ghg_inventories i where i.id = p_inventory_id and i.user_id = v_uid) then
      raise exception 'not found';
    end if;
    -- The same column whitelist get_verifier_inventory returns, built by one shared SQL function
    -- (public.ghg_verifier_projection, extracted from the current RPC in this migration).
    select public.ghg_verifier_projection(i) into v_snap from public.ghg_inventories i where i.id = p_inventory_id;
    v_hash := encode(sha256(convert_to(v_snap::text, 'UTF8')), 'hex');
    select * into v_last from public.ghg_inventory_versions
      where inventory_id = p_inventory_id order by version_no desc limit 1 for update;
    if found and v_last.snapshot_sha256 = v_hash then
      return v_last.id;
    end if;
    insert into public.ghg_inventory_versions (inventory_id, version_no, user_id, snapshot, snapshot_sha256)
      values (p_inventory_id, coalesce(v_last.version_no, 0) + 1, v_uid, v_snap, v_hash)
      returning id into v_id;
    update public.ghg_inventories set current_version_id = v_id where id = p_inventory_id;
    return v_id;
  end;
  $$;
  ```
  ```sql
  -- 2026MMDD_ghg_inventory_versions_grants.sql  (NOT RUN)
  revoke all on public.ghg_inventory_versions from public, anon, authenticated;
  grant select on public.ghg_inventory_versions to authenticated;
  grant select, insert on public.ghg_inventory_versions to service_role;
  revoke all on function public.ghg_snapshot_inventory_version(uuid) from public, anon;
  grant execute on function public.ghg_snapshot_inventory_version(uuid) to authenticated;
  ```
  **Notes on this SQL:**
  - **Hashing.** Uses the built-in `sha256(bytea)` (Postgres 17.6 confirmed), not pgcrypto's `digest()`.
  - **`get_verifier_inventory`.** Its new version returns the pinned version's `snapshot` when
    `verifier_access.inventory_version_id` is set, and the live projection when it is null. It adds
    `newer_version_exists` = (the hash of the live projection ≠ the pinned `snapshot_sha256`).
  - **Pre-flight and verify.** The RLS-on-new-table and grants pre-flight from the memory notes applies. Run a
    verify script after, in the house format (check_name, expected, actual, pass).
- **Tests:** snapshot reused on an unchanged projection; new `version_no` on change; pinned link keeps the old
  snapshot after a re-save; `newer_version_exists` true after a re-save; whitelist test covers the snapshot keys.
- **Done:** a verifier link always shows the version it was issued against, and says when a newer one exists.

### T17. Assurance PDF: workings page, document index status, stored residual table
- **Files:** lib/assurancePdf.ts (new Workings page from the stored `workings` argument; document index Status column
  with reasons; residual table from stored market-based rows); app/dashboard/ghg/page.tsx (PDF caller at 3080-3096
  passes stored workings, removes the `getResidualFactor` recompute); tests.
- **SQL:** none.
- **Tests:** PDF builder fed fixture workings renders every row, contribution, reason, override reason and
  `factor_vintage` verbatim; no engine function imported into the page builder; residual rows equal the stored
  rows; document index status for each contribution reason; the PDF cover sentence "calculation workings" is now
  true (PDF-01 in ghg-register.md).
- **Done:** the PDF shows the same workings a verifier sees, from the same stored data, with no figure recomputed
  at export.
