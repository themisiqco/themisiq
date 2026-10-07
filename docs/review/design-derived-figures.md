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
| T2: proration stamp | A figure with at least one bill prorated by its own days (and no extrapolation) is stamped `entry_method: 'concierge-prorated'`, with the per-bill arithmetic in a separate `proration_note` (e.g. "2024-12-20 to 2025-01-19: 12 of 31 days in FY2024, ×0.387"), not in `extrapolation_note`, which the verifier page labels "Estimated". The verifier page shows the badge "Bill-sourced, prorated" and the line "Prorated by billing days: {note}". With an extrapolation as well, the gross-up drives the stamp (`concierge-extrapolated`) and the basis lists the proration first, then the gross-up. |
| T2: legacy straddle rows | A stored `straddle` resolution gets no audit row in `buildWorkings`: it no longer reaches the figure, and a row must not claim a method the figure did not apply. |
| T2: release | T2 is committed but not pushed to main until T3 (blocking issues for undated, invalid_period, mixed_units) and T8 (strip controls) land with it. |
| T3: no silent zero | Of the not-counted reasons, only `outside_year` and `same_bill_as` may be silent. `undated`, `invalid_period` and `mixed_units` must each raise an export-blocking coverage issue with a plain-language message, so a field can never drop to zero without the customer being told. (`not_confirmed` from `extracted` or `needs_manual_review` already blocks export through the pending-proposal gate, page.tsx:1301. A `rejected` proposal does not block on its own; the all-rejected case is the next ruling.) |
| T3: all documents rejected | When every document for a field is rejected and no manual figure is entered, raise an export-blocking issue offering "Enter the figure manually" or "Confirm this site used none". Confirming records who and when, appears in workings and on the verifier page, and clears the issue. Entering a manual figure clears it the same way (the field then has `entry_method: 'manual'`, per section 3.3). |
| T3: who | A confirmation stores the user id and email (`by: {userId, email}`). The email is what workings and the verifier page show. |
| T3: used_none | A new resolution `{kind: 'used_none', locId, fuelType, field, by, at}`. It writes 0 to the field, gives the audit row "Site used none, confirmed by {email} at {time}", clears the all-rejected issue, and also answers the declarations gate for that stream. |
| T3: meter label | `SourceDoc.meter_label` is the one source of the label. `different_meters` is an audit record whose label must match the document's; it does not set the label. `extrapolate` gains `meterLabel`, and the gross-up is applied per meter. |
| T3: messages | Undated: "{file} has no billing period, so it is not counted. Enter the dates as they appear on the bill." Mixed units: "The {fuel} bills for {site} are in different units ({units}: {files}), so none of them is counted. Correct the units, or enter the figure manually." Overlap: "{fileA} and {fileB} cover the same days ({from} to {to}). Choose Same bill, count it once, or Different meters or accounts." All rejected: "Every {fuel} document for {site} was rejected and no figure has been entered. Enter the figure manually, or confirm this site used none." Invalid period uses `INVALID_PERIOD_MESSAGE` (T1 ruling). |
| T3c: NGA | Confirmed: NGA edition N covers activity from 1 July N to 30 June N+1, and the majority rule counts those activity years. |
| T3c: class (b) year | Class (b) matches the data year to the **majority year** of the reporting window, not the bare `reporting_year`. |
| T3c: unclean datasets | All six recommendations in factor-year-selection.md 8.3 accepted: ECCC grid class (b), re-keyed by data year; EEA grid class (b); MfE grid and T&D class (b), keyed by series year; ECCC combustion class (a); ECCC mobile class (b); IPCC 2006 defaults exempt from selection and disclosed as fixed defaults. |
| T3c: D3, H1, C2 | Accepted as recommended. D3: a September DESNZ year uses the majority fallback (Y). H1: EPA Hub edition N is for activity year N, stated on the methodology page as our reading. C2: ECCC grid re-keyed by NIR data year (T3d). |
| T3c: unpublished edition | A required edition that has not been published blocks, with a message saying the factors for that year have not been published yet. This is distinct from an edition that is published but not loaded. |
| Sequencing | T3b, T3c and T3d move to a separate branch, `factor-years`, created from main after derived-figures merges. In T3d, editions for reporting year 2025 are loaded first, then 2024, then 2026. |
| T4: field with documents but no confirmed proposal | A field with at least one pending proposal (extracted or needs_manual_review) that has a value is document-backed: `deriveLocations` derives it from its confirmed proposals, so 0 when none is confirmed (the pending-proposal gate already blocks export). A field whose proposals are all rejected, or that has none, keeps its stored value as the typed figure (3.3, T3 all-rejected ruling). Mixed units derive to 0 (no mixed contribution is counted, T1), with the T3 issue saying why. Known limit until T7: while the page still writes fields, a stored value on an all-rejected field, or on a location whose last document was removed, may be a stale copy and is read as typed. |
| T5: pctEstimated | `pctEstimated` must (a) apply each accepted gap gross-up only to its own meter's figure, not to the whole fuel, and (b) keep stationary and fleet diesel, and any other fuel shared across document types, as separate groups. It may take the reporting window or read T5's contributions, whichever keeps the page component free of arithmetic. Tests cover both cases. |
| T5: gap estimates name their document type | An `extrapolate` resolution gains `documentType`. The gross-up and the gap check match on (documentType, fuel, meter), so a stationary-diesel estimate never grosses up or clears fleet diesel. A stored estimate without `documentType` is accepted only where the location has one document type for that fuel; where it has two, it is not accepted, the gap stays open, and it must be re-estimated. The page's estimate control writes `documentType` from T5. |
| T5: all-excluded field | A field whose confirmed bills are all silently excluded (`outside_year` or `same_bill_as`) gets a workings row with activity 0 and result 0 carrying its contributions, so a verifier sees which documents were excluded and why. It adds nothing to any total. |
| T5: share cell | `workingsCells.ts` shows a bill's share as "12 of 31 days, ×0.387" when prorated and "31 of 31 days" when wholly inside the year, matching T2's proration note. An excluded bill shows "Not counted" (the reason says why); an undated or invalid-period bill shows "Not applicable". |
| T6: switched-off field with confirmed bills | A field with confirmed bills whose "uses this fuel" switch is off (e.g. `has_natural_gas` false) is never silently dropped. It raises an export-blocking coverage issue, `stream_off`, naming the site, the fuel and the number of confirmed bills in plain language: "Site A is marked as not using natural gas, but 3 natural gas bills are confirmed. Turn natural gas on for this site, or reject the bills." The monthly split skips the field with reason `stream_off`, matching the annual figure, so `reconcile` reports zero. Cleared by turning the switch on or rejecting the bills. The T3 no-silent-zero property test covers it. |
| T7: what the save stores | `locations_data` is saved RAW: a document-backed field keeps only what was typed (usually 0), never its derived figure. Totals, workings, `pct_estimated` and `factor_editions` are saved from derived locations (`figuresForSave`, lib/ghg/savePayload.ts). Every reader of a stored row that reads a figure derives first: the prior-year summary and the trends completeness check through `deriveStoredLocations`; Scope 3 Cat 3, which may not import the engine, reads a stream as quantified when the saved workings carry a priced row for it. |
| T7: step-2 inputs | A field with confirmed or pending bills shows its derived figure read-only, "From N documents" (section 3.3), and its unit control is locked because the unit comes from the documents. Switching to a typed figure with a reason stays in T10. A field with no backing documents is editable as before. |
| T8: choosing again for the same overlap | Re-resolving the same overlap replaces the earlier choice. A `same_bill` resolution is keyed by the SET of documents it names (counted plus excluded, order ignored), so picking "A counts" and then "B counts" leaves one resolution and B counted once, never both bills excluded. The other keys: `different_meters` by its document, `extrapolate` by (document type, fuel, meter), `used_none` by (location, fuel, field) (lib/ghg/coverageActions.ts). |
| T9: what a correction keeps | When the customer changes a proposal's billing dates or unit, the values READ from the bill are kept the first time, in `asRead: { periodStart, periodEnd, unit }`, and every change appends `{ fields, at, by: { userId, email } }` to `corrections`. Both travel with the contribution into workings, so a verifier sees what was read, what was changed, who changed it and when. |
| T9: what correcting the unit changes | Correcting the unit corrects the BILL's unit: `rawUnit` is set to it and `value` and `unit` are recomputed from the unchanged `rawValue` through `convertToCanonical`, the same audited conversion as at extraction. It never relabels the converted unit. A unit the conversion cannot handle leaves the proposal for manual review with no figure. The unit control offers only units the conversion handles (`convertibleUnits`). |
| T9: Reject and Undo | Every proposal in review, pending or confirmed, has "Reject". Rejecting sets status `rejected`, keeps the document and the proposal as evidence (it is simply not counted), and appends `{ action: 'rejected', at, by: { userId, email }, statusBefore }` to `statusLog`; the review shows "Rejected by {email} on {date}." A rejected proposal offers only "Undo", which returns it to the status it had before (recorded as `{ action: 'undone', ... }`), except that a bill confirmed on month-only dates never confirmed goes back to "To confirm" so the R5 confirmation cannot be skipped. `statusLog` travels with the contribution into workings. Every message that asks the customer to reject a bill says "reject the bill" or "reject the bills", matching the button. Before T9 nothing set `rejected`: "Flag for review" sets `needs_manual_review`. |
| T10: switching back | An overridden figure offers "Use the bills instead". It removes the override, the figure is worked out from the documents again, and the removal is kept with who and when in `manual_overrides_removed`. |
| T10: an upload with nothing read from it | A document with no proposals is EVIDENCE, not a blocker, when any field its document type supports already has a figure (typed, from another counted bill, or a used_none confirmation); it shows "Uploaded as evidence. No figure was read from it." If no field it supports has a figure, it raises an export-blocking issue: "{file} is uploaded for {fuel} at {site}, but no figure has been read from it or entered. Enter the figure from the bill, or confirm this site used no {fuel}." with "Enter the figure manually" and "Confirm this site used no {fuel}" (T8's controls); a document type covering several fuels lists them. "Used none" is accepted for every field a document type supports (`DOC_TYPE_FIELDS`), and fuel oil, purchased steam and refrigerants answer their declaration question that way too. The export summary no longer lists bare status codes. |
| T10: a typed figure and "used none" | A typed figure above 0 supersedes an earlier "used none" confirmation for the same field: the figure is the typed one, and the confirmation stays in the record but no longer applies. (Since T7 a stored value can only have been typed.) |
| T10a: a proposal with no figure | A proposal whose value is null (an unreadable number, or a unit with no conversion) can never be confirmed: the guard refuses it on every path, and Confirm is disabled with "No figure could be read from this bill. Edit the unit or the figure, or reject the bill." A confirmed one saved earlier raises an export-blocking issue naming the document. A rejected proposal with no figure still counts as a document for the all-rejected check. Found in the Melbourne run-through (gas bills in MJ, confirmed with no figure, gas figure silently 0). |
| T10a: Australian gas on an energy basis | Gas bills in MJ convert MJ ÷ 1,000 = GJ, then GJ → MMBtu. Australia gains `natural_gas_mmbtu` = 51.53 kg CO2e/GJ (NGA 2025 Table 4) × 1.05505585262 GJ/MMBtu = 54.367 kg CO2e/MMBtu, so no energy content is assumed; MMBtu is offered for Australian gas. |
| Merge set | derived-figures merges to main after, in order: T3a, T4, T5, T6, T7, T8 (widened), T9 (widened), T12, T10. T11 and T13 follow on main. T8 and T9 are widened as described in section 11; T12 moves after T9, and T10 after T12. |
| T3b: label forms | Replaces the proposed "YE" forms. Non-December year ends read "Apr 2024 to Mar 2025" in menus, tiles and headings; "2024–25" on chart axes only; "2024-04_to_2025-03" in filenames. December year ends read "2025" in all three. No "YE" or "FY" abbreviations in customer-facing labels. Running text keeps T3a's "the year ending 31 March 2025". |
| T3b: SB 253 first-report window | From CARB's Final Regulation Order, Title 17 CCR §96076(c) (text in the T3b entry). The first report (due 10 November 2026) covers the fiscal year ending **after 1 February 2025 and on or before 1 February 2026**. A fiscal year ending on or before 1 February in a calendar year reports the year ending in that calendar year; one ending later reports the year ending in the previous calendar year. Optionally, the most recent preceding year may be reported where its data is available. Status: adopted by CARB (Executive Order R-26-006) and resubmitted to OAL on 21 September 2026; OAL approval not yet reached, so it carries the same 'proposed' handling as `SB253_DATE_STATUS`. |
| Factor integrity: no cross-country fallback | A missing factor key never uses another country's or publisher's value. Only exact conversions are applied: US gallon ↔ litre; therm, kWh, MJ, MMBtu ↔ GJ; Mcf, Ccf, ft³ ↔ m³; lb ↔ kg. Any density or energy content must come from the same publisher as the factor, cited; otherwise the line is unpriced with a plain-language export-blocking issue. (FI2) |
| Factor integrity: no silent drop-out | Any input without a factor raises an export-blocking issue. It never excludes the site from the totals and is never priced at zero; the site's other lines are still priced. (FI1) |
| Factor integrity: unit and country change | Changing a unit, or a location's country, either converts the figure exactly, with a visible conversion note, or clears the figure and asks. It never relabels. This includes the open CLAUDE.md defect "Unit switch relabels without converting". (FI5) |
| Factor integrity: propane by mass | Propane in kg or lb is priced with the publisher's own per-mass factor or density, cited, or it blocks. The unverified US density of 4.24 lb/gal is removed. (FI4) |
| Factor integrity: Australian Category 3 | The DEFRA stand-in for Australian gas and electricity is replaced by NGA's Scope 3 factors, by state, cited. (FI6) |
| Factor integrity: steam | Where no steam factor is published, supplier-figure entry stays, with a plain message. (FI7) |
| Factor integrity: EU derived factors (2 Oct 2026) | Applied now: the `EF_EU` per-litre and per-m³ factors built on densities and an energy content that neither cited source publishes are removed, and those EU lines block until the quantity is entered in a unit the publisher's basis supports, or a same-publisher value is found and cited. (FI3) |
| Factor integrity: Category 3 stand-in (2 Oct 2026) | The no-fallback ruling covers Scope 1 and 2 factor keys. The disclosed DEFRA `uk_stand_in` for Category 3 stays for Canada, New Zealand, the EU, and Australian lines other than gas and electricity. |
| Factor integrity: unsupported country (2 Oct 2026) | Unchanged: a location in an unsupported country stays excluded from the totals, stated on every surface, and does not block export. The no-silent-drop-out ruling applies to inputs in supported countries. |
| Factor integrity: calorific basis (2 Oct 2026) | A gas quantity in an energy unit (kWh, GJ, MJ, therms, MMBtu) is priced only with an energy-basis factor whose gross or net basis its publisher states. A gross/net ratio is used only if that publisher publishes it, cited. Otherwise the line is unpriced with a blocking issue. |
| Factor integrity: gas volume reference conditions (7 Oct 2026) | Gas volume in m³ and in ft³ (mcf, ccf) are the same physical quantity. Conversion between them is exact by definition (1 ft³ = 0.028316846592 m³) and is applied without adjusting for differing reference temperature or pressure. The conversion is stated on the row. This is option A of the reference-conditions question. (FI2) |
| Factor integrity: therm (7 Oct 2026, R1) | A therm is 100,000 International Table Btu (0.105505585262 GJ), the 0.1 MMBtu convention US EPA uses. The U.S. (59 °F) therm is not used. (FI2) |
| Factor integrity: density and energy content, order of sources (7 Oct 2026, R2) | A density or energy content comes from, in this order, the first that exists: (1) the factor publisher's own published value; (2) a cited official or standards source (for example the EU JRC or EN 590); (3) the GHG Protocol stationary combustion tool's suggested default, or the IPCC 2006 Guidelines default. A value chosen by ThemisIQ (for example a point inside a standard's range) never qualifies. Another country's emission factor never qualifies. The value and its source (document, table, row) are printed in the row's derivation note. Settles the first ⚑ reading on the density row above. (FI2, FI3) |
| Factor integrity: gross/net calorific ratio (7 Oct 2026, R3) | The publisher's own ratio first; otherwise the GHG Protocol stationary combustion guidance rule of thumb (net = gross × 0.95 for solid and liquid fossil fuels, × 0.90 for gaseous fossil fuels; Calculation Tool for Direct Emissions from Stationary Combustion, v3.0, section 2.2.2.1), cited on the row. Never applied to coal or biomass. Settles the second ⚑ reading on the density row above. (FI2, FI3) |
| Factor integrity: NZ gas calorific basis (7 Oct 2026, R4) | MfE natural gas factors per kWh are treated as gross calorific basis, citing the Measuring Emissions Guide, Appendix A (A.1): "we have used gross calorific values". The citation appears on the row. (FI2) |
| Factor integrity: diff-1 follow-ups (7 Oct 2026, R5) | Canada's CH4 and N2O per Mcf are recomputed exactly; pre-multiplied gallon and Mcf entries are replaced by exact conversions from the publisher's own unit; an unrecognised unit blocks (FI1's unpriced line) and is never priced as litres. (FI2) |
| Factor integrity: EU natural gas by volume (7 Oct 2026, R6) | EU natural gas in m³ is blocked. If the JEC Well-to-Tank report is ever cited for it, the figure is Table 37's 36.4 MJ/Nm³ (LHV, EU mix, current), not 36.07 or "~ 36". A per-Nm³ energy content (0 °C) is never applied to a billed m³, because billing reference conditions differ by country and are not printed on every bill. The wizard asks for kWh, which EU gas bills show. Today's 2.0196 kg CO2/m³ (36 MJ/m³) is printed by no source and is removed. (FI3; docs/review/eu-fuel-properties.md) |
| Factor integrity: gross/net where the publisher gives none (7 Oct 2026, R7) | Natural gas: net = gross × 0.90, cited to IPCC 2006 Vol. 2 Ch. 1 section 1.4.1.2 (p. 1.16) and the notes under Ch. 2 Tables 2.6 to 2.8 (pp. 2.25 to 2.27). Liquid fuels: net = gross × 0.95 on the same citation (section 1.4.1.2: "for coal and oil, the NCV is about 5 percent less than the GCV"). Solids other than coal: citation to confirm. Never coal or biomass. Replaces the GHG Protocol tool citation in R3, which is no longer available. (FI2, FI3) |
| Factor integrity: heating oil (7 Oct 2026, R8) | EU heating oil in kg and tonnes prices through MRR Annex VI Table 1's Gas/Diesel oil row. Litres stay blocked until a source publishes a heating-oil density. The diesel density (832 kg/m³) is not used for heating oil. (FI3) |
| Factor integrity: JEC as a source (7 Oct 2026, R9) | The JEC Well-to-Tank report (JRC, v5) counts as an R2 step 2 source. Its "does not imply a policy position" statement is about policy, not data. (FI3) |
| Factor integrity: one row, several documents (7 Oct 2026, R10) | One factor row may combine documents (for example a JEC density with MRR's NCV and factor). The row's note names every document used. (FI3) |
| Factor integrity: UK natural gas in m³ (7 Oct 2026, R11) | UK natural gas also offers m³, priced through DEFRA's own m³ factor (2.02633 kg CO2e/m³, factor ID 1_100_1004_1_1); kWh stays the default unit. (FI5 follow-up) |
| Factor integrity: Canadian gas in GJ (7 Oct 2026, R12) | A Canadian natural gas quantity in GJ (gross, as billed) is priced as GJ ÷ 0.03859 GJ/m³ × the province's own per-m³ factor (EF_CA_NG_CO2_M3 and EF_CA_NG_CH4_N2O_M3), computed from those constants so a factor update flows through. 0.03859 GJ/m³ is Canada's national gross heat content: ECCC National Inventory Report 1990-2023, Part 2, Table A4-2, row Natural Gas, 38.59 TJ/GL GCV, 2023, page 236. The province is still required. Therms and MMBtu convert to GJ exactly. The row note reads: "Converted to m3 at 38.59 MJ/m3, Canada's national gross heat content for natural gas (ECCC National Inventory Report 1990-2023, Part 2, Table A4-2). ECCC does not publish a provincial value." Basis: The Climate Registry 2025 and the BC 2024 Best Practices Methodology both use one national Statistics Canada heat content across provinces. Lisa has asked ECCC for provincial values (ges-ghg@ec.gc.ca) and will switch if they are published. (FI3) |
| Factor integrity: propane by mass (7 Oct 2026, R13) | Propane prices by mass only on a publisher's own per-mass factor: DEFRA/DESNZ 2026 Propane per tonne (2,997.63233 kg CO2e, factor ID 1_100_1007_15_1, the same Propane row family as the per-litre factor), EU MRR Annex VI Table 1's mass basis for Liquefied petroleum gases (63.1 t CO2/TJ × 47.3 TJ/Gg), and MfE's LPG per kg. No density is used for propane anywhere: a mass is never converted to a volume, nor a volume to a mass. The 4.24 lb/gal figure is removed and returns only if an official source stating it is cited. US, CA and AU propane in kg (or lb, stored as kg exactly) is unpriced: EPA, ECCC and NGA print no per-mass factor and no density. Units offered: UK litres and kg; EU kg and tonnes; NZ kg; US, CA and AU unchanged. (FI4; docs/review/eu-fuel-properties.md section B) |
| Factor integrity: steam and district heat estimate (7 Oct 2026, R14) | Where no publisher prints a steam or district heat factor (CA, AU, NZ, EU), the line prices on an estimate, applied automatically and labelled: steam factor = the country's own published natural gas factor per unit of energy, gross basis, ÷ 0.80, each of CO2, CH4 and N2O. Method: GHG Protocol Scope 2 Guidance, Appendix A, endnote 1 (p. 92): "An emission factor per unit energy for purchased steam or heat is equal to the emission factor per unit energy of the fuel used divided by the thermal efficiency of the generation." Assumption: US EPA GHG Emission Factors Hub 2025, Table 7 note: "These factors assume natural gas fuel is used to generate steam or heat at 80 percent thermal efficiency" (EPA's own 66.33 = 53.06 ÷ 0.80). Only the 0.80 is EPA's; the gas factor is always the site's own country's (R2). Per country: CA, the province's gas per GJ gross at the national heat content (R12); AU, NGA natural gas per GJ; NZ, MfE natural gas per kWh for the use class, converted exactly; EU, EF_EU natural gas per kWh gross (R7), converted exactly. The row carries the flag `estimated: 'steam_gas_boiler_80'` and the note "Estimated: no published factor for purchased steam or district heat in {country}. Calculated as if generated from natural gas at 80% efficiency: {gas factor and its source} / 0.80 (method: GHG Protocol Scope 2 Guidance, Appendix A; 80% assumption: US EPA GHG Emission Factors Hub 2025, Table 7). It excludes distribution losses and may overstate a network that uses low-carbon heat. Enter your provider's emission intensity to replace it." Two disclosed weaknesses: it excludes distribution losses, and it may overstate a network that uses low-carbon heat. A supplier figure replaces it. Where the estimate cannot be computed (a Canadian site with no province), the line is unpriced with the province message. (FI7b) |
| FI3: EU units and properties (2 Oct 2026, second set) | Net-basis gas entry is struck. kg and tonnes are offered for an EU fuel only where the cited factor source publishes on a mass basis. |
| Density and energy content, all countries (2 Oct 2026, second set) | Refines the no-fallback ruling. A density or energy content comes from the factor's own publisher by preference. Otherwise a cited official or standards source (for example the EU JRC or EN 590) is allowed, and is shown in the row's derivation note. Another country's emission factor is never allowed. The two readings flagged here for confirmation are settled by the rulings of 7 Oct 2026 below: (1) a value chosen by us inside a range a standard gives does not qualify (R2); (2) a gross/net calorific ratio has its own order of sources (R3). |
| Canadian gas with no province (2 Oct 2026) | Blocks, and requires the province. The Ontario fallback (`EF_CA.natural_gas_m3` 1.921) is removed. (FI1) |
| Unknown refrigerant (2 Oct 2026) | Confirmed: FI1 makes an unrecognised or blank refrigerant type with kilograms entered an unpriced line with an export-blocking issue, never `?? 0`, with a test. |
| Market-based Scope 2 with no residual mix loaded (UK, CA, NZ): report, 2 Oct 2026 | **What each surface shows today:**<br>• **Workings row** (screen, XLSX, verifier page, from stored workings; engine.ts:3911-3927): the source reads "Electricity (S2 market-based, location-factor fallback)"; the factor is the location grid factor; the citation is the grid publisher's, followed by "No published residual mix for this subregion; market-based falls back to location factor." (1265-1266) and the grid vintage note; the vintage is the grid year.<br>• **XLSX methods block** (page.tsx:3191-3195): "Residual-mix factor applied to uncovered load", then per location "Location-factor fallback" with the same note.<br>• **PDF** (lib/assurancePdf.ts:276-280, rows from page.tsx:3113-3121, ESRS or GRI only): heading "Market-based Scope 2 — Residual Mix" and the sentence "Residual-mix factor applied to uncovered load", with each location's row reading "Location-factor fallback" and the note.<br>• **Methodology page** (app/methodology/page.tsx:71): names AIB and Green-e as the residual sources and the location factor only "for full-disclosure jurisdictions where no residual mix is published (e.g. Austria)"; it does not mention the UK, Canada or New Zealand.<br>• **Totals** (page.tsx:2642, 3000, 3159): no note. ⚑ Only these lines were checked.<br>**Finding:** the grid-average substitution IS disclosed on the row, so no disclosure task is added. The wording has defects: the US word "subregion"; an unchecked claim that no residual mix is "published"; a PDF and XLSX introduction that says a residual mix was applied; and a methodology page that omits these countries. Corrections are proposed in FI8, marked to strike if not wanted. ⚑ The GHG Protocol Scope 2 Guidance text on disclosing grid-average use in the market-based method was not re-read for this report. |
| Fleet fuel (2 Oct 2026) | Mobile combustion is priced with each country's published mobile factors for CO2, CH4 and N2O, cited. Where a country publishes none, the line blocks; stationary factors are never used. (FI9) ⚑ Open: the input that selects the vehicle class or control technology where the publisher's factors vary by them (FI9). |
| NZ use class (2 Oct 2026) | Shown on every NZ combustion row and recorded in `factor_editions`. (FI10) |
| F-06: factor editions in the year-on-year disclosure (2 Oct 2026) | In scope, added to T3c. The comparability disclosure in the export, CSV, verifier page and PDF names every factor edition that changed between the compared years, and its effect (this year's activity at last year's edition, minus at this year's), or says why the effect could not be calculated. ISO 14064-3 cl. 6.3.1.5, as cited in the ruling. |
| T11 and T17 classification (2 Oct 2026) | Core pre-launch work, not post-core. T11 (verifier page: contributions, reasons, estimated dates) and T17 (PDF workings page) supply the data trail (ISO 14064-3 cl. 6.1.3.2) and the documented information that qualitative materiality relies on (cl. 5.1.7). Clause numbers as cited in the ruling; the standard's text was not re-read for this record. |
| Batch "Accept all" (2 Oct 2026) | Added to T13. None exists today. If one is built, it persists a per-bill acceptance record (who, when, which reading), because the customer's approval of each AI reading is the control a verifier will test. |
| Review actions: who and when (report, 2 Oct 2026) | Checked at `3e37755`.<br>**Recorded, and in the saved workings:**<br>• **Reject and Undo** (page.tsx:3608, 3590 → proposalEdits.ts:67-89): `statusLog` with `by` and `at`, carried on the contribution (engine.ts:3410).<br>• **Date correction** (`editPeriod`, proposalEdits.ts:33-44) and **unit correction** (`editUnit`, 51-61): `asRead` and `corrections` with `by` and `at`, carried on the contribution (engine.ts:3408-3409).<br>• **Manual override** (T10): reason, `by` and `at` in `manual_overrides`, written to the row's `manual_override` (engine.ts:3858).<br>• **"Used none"** (coverageActions.ts:92-100): `by` and `at`, in the resolution note and the audit text (engine.ts:3037).<br>The path to the saved record: contributions go onto workings rows (engine.ts:3850-3858), and workings are saved by `figuresForSave` (lib/ghg/savePayload.ts:27).<br>**Not recorded, or not reaching the workings:**<br>• **Confirm** (page.tsx:3598-3600): the patch is `{ status: 'confirmed' }` only. No who, no when, no record of which reading was accepted.<br>• **Edit figure, Save** (page.tsx:3584): `{ value, status: 'confirmed' }`. No who or when. The read value is overwritten: `asRead` holds dates and unit only (engine.ts:1620), and the contribution carries `value` only (3401). `rawValue` (1600) stays on the proposal in `locations_data`, but nothing in the workings shows the figure was edited.<br>• **Flag for review** (page.tsx:3607): `{ status: 'needs_manual_review' }` only.<br>• **Date confirmation without a change:** `periodConfirmedAt` and `periodConfirmedBy` are set (proposalEdits.ts:39-40) but not copied to the contribution (engine.ts:3395-3411). They are shown in the review only (ProposalEdits.tsx:103-104).<br>• **Override removal** ("Use the bills instead", lib/ghg/overrides.ts:36): `removedBy` and `removedAt` in `manual_overrides_removed` on the location, but `buildWorkings` does not read them.<br>• **Coverage resolutions** `same_bill`, `different_meters` and `extrapolate` (coverageActions.ts:44-82): `acknowledgedAt` only, no who. Their workings row has `resolved_at` (engine.ts:4069).<br>• **Not in the list, found alongside:**<br>&nbsp;&nbsp;– Removing a document (`removeDoc`, page.tsx:1176-1190) deletes the stored file and the document with its proposals, and leaves no record.<br>&nbsp;&nbsp;– A typed figure on a field with no documents carries no who or when.<br>Fix: T18, in scope (rulings below). |
| T18: document removal (2 Oct 2026) | A document with any confirmed or rejected reading cannot be deleted from the inventory. "Remove" becomes "Withdraw": the file is kept, its readings stop counting (reason `withdrawn`), and the evidence list, workings, verifier page and PDF show it as withdrawn with who, when and a required reason. A withdrawal can be undone, recorded the same way. A true delete stays available for a file uploaded in error or holding information that must not be kept: it requires a reason, deletes the file and its readings, and leaves a permanent tombstone (file name, SHA-256 if known, who, when, reason) that appears in the saved workings and to verifiers. A document with no reading acted on yet (extraction pending or failed) may be deleted freely, and the deletion is logged. ⚑ Open (T18): `audit_log` keeps earlier snapshots of the inventory, so a privacy delete cannot remove past copies of what was read. |
| T18: edit figure (2 Oct 2026) | Keeps the AI's original reading (`asRead`) and appends a correction with who and when, as date and unit corrections do. |
| T18: confirm (2 Oct 2026) | Records who, when and the exact reading accepted: value, unit, period and source quote. |
| T18: typed figures (2 Oct 2026) | A typed figure on a field with no documents records who and when it was entered or changed. |
| T18: coverage resolutions (2 Oct 2026) | Same bill, different meters and gap-estimate resolutions record who as well as when. |
| T18: flag for review (2 Oct 2026) | Records who and when. Ruled as a move from the T13 list into T18; T13 never listed it, so it is recorded in T18 only. |
| T18 scope (2 Oct 2026) | T18 is in scope, no longer proposed. Core pre-launch work with T11 and T17. |
| FI0: location cap retired (2 Oct 2026) | GHG is priced by employee count with unlimited locations. Part (b) of `enforce_ghg_location_allowance()`, the location cap, is retired. Part (a), the entitlement gate (an active `ghg` pass with `term_end > now()`, else "expired" or "requires the GHG module"), stays, with the em dash in "still on screen — purchase" replaced by a full stop. FI0 runs on its own small branch off main: NOT RUN SQL replacing the function with the gate only; stop writing `location_allowance` for GHG; remove the client wall and the location-limit copy; tests that a 25-location inventory saves with an active pass and is refused without one. |
| Trigger capture (2 Oct 2026) | Write docs/review/patches/capture-triggers.sql (NOT RUN), an idempotent capture of `log_audit()` and `audit_ghg_inventories` exactly as live. **Finding:** of the two triggers reported as missing from the migrations, only `audit_ghg_inventories` is. `log_audit()` is in 20260726_capture_audit_log_infrastructure.sql, and `enforce_ghg_location_allowance()` with its trigger is in 20260618_ghg_location_allowance.sql; both are identical to the 1 Oct 2026 dump. The capture creates the audit trigger only if absent; otherwise it compares the live definition and raises on a difference. docs/review/live-trigger-functions.sql did not exist when this was written; diff against it before running. |
| T10b: diagnosis (run-through, 2 Oct 2026) | Six Melbourne LPG delivery invoices (90 kg each, one delivery date, no billing period) were read as one-day periods, because the extraction prompt has no rule for a delivery date (route.ts:61-66). They were counted in full, but covered six days and no whole month, so coverage reported 0 of 12 months and blocked export. "Estimate the missing months" was offered anyway (CoverageStrip.tsx:128-135). Clicking it stores an `extrapolate` with `monthsCovered: 0` and the note "×12/0", which `validateResolution` refuses (engine.ts:3072). There is no division by zero, Infinity or NaN, and the gross-up is guarded as well (3512), but nothing changes and the customer is not told why. Latent, same root: a one-day period dated the 1st has zero days under `exclusiveEnd` and is reported as "ends before it starts" (engine.ts:1799-1803, 3365). The 177.143 L is the uncited US propane density (FI4). Full diagnosis in T10b. |
| T10b: delivery documents (2 Oct 2026) | A delivery document (identified by document type and/or a single delivery date with no billing period) counts in full if its delivery date is within the reporting window, and zero otherwise. It is not prorated. |
| T10b: completeness, not coverage (2 Oct 2026) | Delivery-based fields are excluded from the monthly gap and coverage check. Instead the customer gives a one-click confirmation, "These are all the deliveries for this year", recording who and when. Until it is given, export is blocked with a plain message. Gap estimation is never offered for delivery-based fields. |
| T10b: monthly split (2 Oct 2026) | Each delivery is assigned to its delivery month, labelled delivery-based. |
| T10b: extraction (2 Oct 2026) | The extraction prompt records a delivery date as a delivery, not as a one-day billing period. |
| T10b: which types (2 Oct 2026) | To be ruled; proposal in T10b. Delivery-based: `fuel_propane`, `fuel_diesel`, `fleet_fuel`, `fuel_oil`. Periodic: gas, electricity, steam. ⚑ Ambiguous, flagged: metered LPG, diesel account statements and fuel-card statements carry billing periods. The proposal is that the reading decides within those types (a single delivery date and no period makes it a delivery). A field holding both kinds also needs a ruling. |
| T10b: stock adjustment (2 Oct 2026) | Post-launch only: an optional opening and closing stock adjustment. |
| T10b: estimate guard (2 Oct 2026) | Independently of delivery handling, the estimate action refuses when 0 months are covered. |
| T10b: the reading decides (2 Oct 2026, ruled) | Within a delivery-capable document type (`fuel_propane`, `fuel_diesel`, `fleet_fuel`, `fuel_oil`), the reading decides: a single delivery date and no billing period make it a delivery; a reading with a billing period is a statement, prorated by its own days and month-checked as today. |
| T10b: mixed field (2 Oct 2026, ruled) | A field holding both deliveries and statements uses the completeness confirmation (no monthly gap check, no estimate). Statements are still prorated by their own days. |
| T10b: confirmation reopens (2 Oct 2026, ruled) | The confirmation records the documents it covered. Adding, removing, rejecting or withdrawing a delivery reopens it. |
| T10b: readings saved before T10b (2 Oct 2026, ruled) | A reading on a delivery-type field with periodStart = periodEnd and no deliveryDate reads as a delivery on that date. No data migration. |
| T10b: one-day periods (2 Oct 2026, ruled) | The CLAUDE.md `exclusiveEnd` wording ("a one-day period (start = end) covers that day, whatever the date; canonicalPeriod is the one place that says so") is included in the T10b patch. |
| T10b: confirmation text (2 Oct 2026, ruled) | The confirmation names the fuel, the site and the window, for example: "These are all the propane deliveries for Melbourne between 1 October 2024 and 30 September 2025." |
| T10b: sequencing (2 Oct 2026) | T10b blocks the derived-figures merge. It joins the merge set after T10 (and the committed T10a). |
| T10c: unsaved work (3 Oct 2026) | The browser warns before leaving or reloading the GHG wizard while there are unsaved changes, including uploads, confirmations, rejections, edits and resolutions. The unsaved-changes nudge with Save draft shows on every step whenever the page is dirty, not only steps 4 and 5. Implemented by deriving "dirty" from the inventory as last loaded or saved (lib/ghg/unsavedChanges.ts), so every change counts and a save clears it. |
| T10c: deliveries confirmation (3 Oct 2026) | The sentence-styled button is replaced by a checkbox whose label is the statement ("These are all the {fuel} deliveries for {site} between {start} and {end}."), plus a primary "Confirm deliveries" button in the standard Confirm style, enabled only when ticked. Warning text, with no count: "Confirm these are all the {fuel} deliveries for {site} between {start} and {end}. Export is blocked until you confirm." |
| T10c: bills with no figure (3 Oct 2026) | A confirmed bill with no figure shows "Needs attention" instead of the green "Confirmed" badge. The message under a disabled Confirm is "We couldn't find a usable figure on this bill. Check the unit or enter the figure yourself, or reject the bill if it shouldn't be included."; where the reading has a quote and an unrecognised unit, "We read "{quote}" from this bill, but we can't use that unit for {fuel} yet. Choose the unit from the list, or enter the figure yourself." |
| T10c: fix before estimating (3 Oct 2026) | Beside "Estimate the missing months", "Fix any bills marked above before estimating." when the field has bills needing attention (to confirm, needs review, or confirmed with no figure). |
| T10c: unsupported unit or country (3 Oct 2026) | The location panel must not imply customer error. "This location is set to {country}, but its {fuel} figure is in {unit}. Check the country on this location, or the unit on the bill." becomes "We can't calculate {fuel} billed in {unit} for {country} yet, so this location isn't included in your totals. Your other locations are unaffected, and nothing you've entered is lost." FI1 and FI2 remove the underlying gap. |
| T10c: month-only dates (3 Oct 2026) | The main Confirm button is hidden while the month-only date confirmation is open. |
| T10c: wording (3 Oct 2026) | Written dates ("14 March 2025") wherever a date is shown to customers, including the review line. Field hint "Sum of all 12 monthly bills" becomes "Sum of the bills covering this year". Unit casing kWh, MWh, Mcf, Ccf, MMBtu, GJ, MJ wherever shown. Totals use "t CO2e", not "mt". The Australian source is named "DCCEEW NGA 2025" consistently. |
| T10c: help entry (3 Oct 2026) | A help/FAQ entry "Why can't I confirm this bill?" with the text supplied by Lisa, on the GHG module page's FAQ, linked from beside a disabled Confirm. This completes the T13 "bills with no figure" items, which are removed from T13. |
| BR: reading choice (3 Oct 2026) | Per inventory, a Bill Review customer chooses how bills are read: "Read by AI, you confirm" (default) or "Read by a ThemisIQ specialist, you confirm". Chosen at Bill Review setup for the inventory; changeable later in that inventory's settings. (BR1, BR6) |
| BR: human-reading guarantee (3 Oct 2026) | For a human-read inventory, no document is ever sent to the AI model, enforced server-side in the extract route (refused for human-read inventories), with a test. A switch in either direction applies to future uploads only; bills already uploaded and read keep their reading. The switch screen says so plainly, and when switching from AI to human it states that bills already read were sent to the AI. (BR2, BR6) |
| BR: price (3 Oct 2026, corrected the same day) | **Superseded:** Bill Review +20%. **Now:** human reading is priced as a fixed onboarding price per GHG tier: Small $1,200, Medium $2,200, Large $4,200, Enterprise quote (AI-read onboarding is Small $900, Medium $1,800, Large $3,500). The per-source fee is $45 a year for both AI-read and human-read. Onboarding includes the first year for 10 / 30 / 80 data sources; each extra source in year 1, and every active source at renewal, is $45 a year. Values from lib/pricing.ts. (BR1, BR11; pricing patch docs/review/patches/pricing-2026-10.patch) |
| BR: turnaround (3 Oct 2026) | Within 2 business days. Each waiting bill shows "With our team, expected by {date}" (business days, Ontario holidays configurable). The customer receives an email when bills are ready to confirm. Export stays blocked until every bill is read and confirmed. There is never an automatic fallback to AI for a human-read inventory. (BR5, BR7) |
| BR: specialist queue (3 Oct 2026) | An internal page, role-restricted to named staff (initially Lisa), lists waiting bills oldest first with customer, inventory, site, fuel and expected date. Opening a bill shows the document and a reading form producing the same proposal shape the AI produces (value, unit, period or delivery date, source quote). Every document view and every reading is logged with staff id and time. The same queue offers a sample of AI readings for specialist spot-checks, with the result recorded with who and when. (BR8) |
| BR: provenance (3 Oct 2026) | Every reading shows, in review, workings, verifier page and PDF, "Read by AI on {date}" or "Read by {specialist name} (ThemisIQ) on {date}", then "Confirmed by {customer} on {date}". Ties into T18. (BR9) |
| BR: staff access (3 Oct 2026) | Role-based (a staff role table), least privilege, all views logged, designed so a hired data analyst can be added without code changes. (BR3) |
| BR: privacy and About (3 Oct 2026) | The privacy policy and About page name the AI provider as a subprocessor, state that human-read inventories are never sent to it, and replace "opt out via hello@themisiq.co" with the in-product choice. (BR10) |
| Launch (2 Oct 2026) | The commercial launch has moved from 1 November 2026 to a date to be set once the GHG module is complete. Order and estimate for the remaining work: section 12. |
| Sequencing (2 Oct 2026) | The `factor-integrity` branch (FI1 to FI10) is created from main after derived-figures merges. `factor-years` (T3b, T3c, T3d) is created from main after `factor-integrity` merges. |
| T3b: optional election and allowlist | Optional-election banner confirmed, for a window ending after 1 February 2026: "If you choose to file this year as your first SB 253 report, Scope 3 isn't required in it." The EU deadline string "FY2024 (large EU companies)" stays on the source-guard allowlist. |

---

## 11. Implementation tasks, in dependency order

Each task is one reviewable diff with its own tests. Run `npx vitest run lib/ghg/engine.test.ts` before and after
every engine task: the passing count only goes up. Run `npm run build` after every task. Tasks T1 to T13 are the
core derived-figures work. T14 to T16 come after it, as ruled. T11, T17 and T18 are core pre-launch work
(ruling of 2 Oct 2026).

**Merge set (ruling, section 10).** derived-figures merges to main after, in order: T3a, T4, T5, T6, T7, T8, T9,
T12, T10, T10a, T10b, T10c. T11 and T13 follow on main. FI1 to FI10 are on the `factor-integrity` branch, created from main after
that merge; T3b, T3c and T3d are on the `factor-years` branch, created from main after `factor-integrity` merges
(sequencing ruling of 2 Oct 2026). The tasks below are listed in that order. T3a has no entry of its own: it is the patch
docs/review/patches/T3a-reporting-year-label.patch (`reportingYearLabel` and the proration note).

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
  ignored, the `concierge-prorated` provenance stamp and `proration_note`, no audit row for a legacy straddle);
  engine.test.ts; app/verify/[token]/page.tsx (accepts and labels `concierge-prorated`; renders `proration_note`
  without the "Estimated" label). See the T2 rulings in section 10.
- **SQL:** none.
- **Tests:** out-of-year bill contributes 0 (F-09); per-bill straddle shares; extrapolation applied after the fold;
  legacy `straddle` ignored; existing figure tests updated only where F-09 or the straddle rule changes them
  (each change listed in the PR).
- **Done:** `applyResolutions` = Σ counted contributions × gross-up; no window-dependent figure comes from
  anywhere else.

### T3. Engine: coverage with full-period overlap, meter key, `same_bill` / `different_meters`
- **Files:** lib/ghg/engine.ts (`analyzeCoverage`, `findUnresolvedCoverage`, resolution validation, the `straddle`
  issue removed); engine.test.ts; app/dashboard/ghg/page.tsx (`findUndeclaredStreams` receives the resolutions, so
  `used_none` answers the declarations gate). Proposed CLAUDE.md wording for the coverage-gate invariant (Lisa
  applies).
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
  document-backed fields; `pctEstimated` per meter and per document-type group, ruling in section 10);
  lib/ghg/workingsCells.ts (share cell); tests.
- **SQL:** none.
- **Tests:** each document-backed row carries its contributions; excluded documents present with reasons;
  `entry_method` is never 'manual' for a field with accepted documents.
  - **`pctEstimated`, gross-up per meter:** two meters on one fuel, only one estimated. The estimated share
    counts only that meter's gross-up, not the whole fuel's.
  - **`pctEstimated`, shared fuels kept apart:** a site with stationary diesel and fleet diesel, where a gap
    estimate on one does not count the other as estimated.
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

### T8. UI: coverage strip (widened)
- **Files:** app/dashboard/ghg/page.tsx:
  - **Straddle disclosure in place of the straddle buttons.** The strip says the bill is prorated by its own
    days and shows the share. No "this year" or "next year" button remains, since the engine ignores those
    choices (T2).
  - **Overlap controls.**
    - "Same bill, count it once" with a choice of which document counts.
    - "Different meters or accounts" with a meter-label input. The label is written to `SourceDoc.meter_label`,
      and the resolution's label must match it (T3 ruling).
  - **"Used none" control** on the all-rejected issue. It writes `{kind: 'used_none', locId, fuelType, field,
    by: {userId, email}, acknowledgedAt}` from the signed-in user, so it records who and when. It sits beside
    "Enter the figure manually", which focuses the field.
  - **Meter label on gap estimates.** The extrapolate control on a meter's gap writes `meterLabel`, so each
    meter is grossed up by its own coverage.
  - **Resolutions keyed by document and meter.** `addCoverageResolution` (page.tsx:1276) today replaces any
    resolution with the same location, fuel and kind, so two overlap choices for one fuel, or estimates for two
    meters, overwrite each other. The new keys:
    - `same_bill`: by `countedDocId` plus `excludedDocIds`;
    - `different_meters`: by `docId`;
    - `extrapolate`: by `(fuelType, meterLabel)`;
    - `used_none`: by `(locId, fuelType, field)`.
  - Component tests.
- **SQL:** none.
- **Tests:**
  - The controls write `same_bill`, `different_meters`, `used_none` and meter-labelled `extrapolate` in the
    shape `validateResolution` accepts.
  - Two overlaps for one fuel, and gaps on two meters, are each kept.
  - `used_none` records the signed-in user's id and email and the time.
  - No "Confirm not a duplicate" control remains, and no this-year or next-year straddle buttons.
  - A straddle shows its prorated share.
- **Done:** every overlap can be resolved only in a way that leaves no double count. Every gap can be estimated
  per meter. An all-rejected field can be answered either way. No resolution overwrites another.

### T9. UI: billing period and unit on any proposal; month-only confirmation (widened)
- **Files:**
  - **app/dashboard/ghg/page.tsx:**
    - **Edit controls on every proposal in review**, beside the value edit at 3643: the billing start, the
      billing end and the unit.
      - This answers the undated, invalid-period and mixed-units messages ("Enter the dates as they appear on
        the bill", "Check the dates and correct them", "Correct the units"), which have no control today.
      - An edit keeps the source document and records that the customer entered or corrected the value.
    - **Month-only confirmation, as before:** `periodOrigin` is mapped from `periodConfidence` at extraction
      (around 1055-1076), and a month-only proposal needs a confirmation step at acceptance.
  - **lib/ghg/engine.ts:**
    - an acceptance validator;
    - the proposal records `periodOrigin` and who corrected the period or unit, and when.
  - Tests.
- **SQL:** none.
- **Tests:**
  - **Month-only:**
    - a `billing_month` proposal cannot reach `confirmed` without date confirmation;
    - confirmation records origin, time and user;
    - legacy medium proposals read `billing_month`.
  - **Undated or invalid period:** entering valid dates turns the contribution from `undated` or
    `invalid_period` into counted (or prorated), and clears the issue.
  - **Mixed units:** correcting a unit clears the mixed-units issue and counts every proposal.
  - **Records:** a corrected period or unit is recorded with who and when, and the workings row shows it was
    entered by the customer.
  - **No silent change:** an edit never changes another proposal.
- **Done:**
  - Every undated, invalid-period and mixed-units issue can be answered on the proposal itself.
  - No new month-only bill is counted on estimated dates without the customer's confirmation.

### T12. Trends: monthly by inventory
- **Order:** after T9, before T10 (merge-set ruling, section 10). It depends on nothing after T6.
- **Files:** lib/ghg/loadMonthly.ts (filter `inventory_id`); app/dashboard/ghg/trends/page.tsx (pass the selected
  inventory id, 112); tests.
- **SQL:** none (`inventory_id` and the `(inventory_id, period_month)` index exist).
- **Tests:** two inventories with slices in the same calendar year are not mixed; a fiscal-year inventory shows its
  own months.
- **Done:** the monthly chart shows exactly the selected inventory's evidenced months.

### T10. UI and engine: manual override with a reason
- **Order:** after T12; the last task in the derived-figures merge set.
- **Files:** lib/ghg/engine.ts (`manual_overrides` honoured in contributions and workings); app/dashboard/ghg/page.tsx
  (control and reason input); tests.
- **SQL:** none.
- **Tests:** empty reason rejected; override uses the typed figure; contributions read `manual_override`; workings
  row carries the reason.
- **Done:** a customer with an unusable document can finish, and the reason travels with the figure.

### T10b. Delivery-based fuels: count by delivery date, confirm completeness, never estimate (blocks the merge)
- **Branch:** `derived-figures`, before merge (run-through finding of 2 Oct 2026; rulings in section 10, "T10b").
- **Estimate:** M to L, 3 diffs, 3 to 4 days:
  1. the extraction rule, the data model and contributions;
  2. coverage, the completeness confirmation, the strip and the estimate guard;
  3. the monthly split and the trends label.

**Diagnosis** (code at `3e37755`; summary in section 10, "T10b: diagnosis"):
- **The extraction prompt has no rule for a delivery date.** It asks for "the billing/service period" and says
  to return nulls when "no billing period is visible" (app/api/concierge/extract/route.ts:61-66). For each
  90 kg invoice the model returned periodStart = periodEnd = the delivery date.
  - Had it returned nulls, each invoice would have been `undated` and blocked with a plain message (T3).
  - Instead each became a valid one-day billing period: `dayCount(start, exclusiveEnd(end)) = 1`
    (engine.ts:3361-3372).
  - Counted in full when inside the year: share 1, reason `counted`. Hence Scope 1 +1.65 t: 6 × 177.143 L ×
    1.557 kg/L (`EF_AU.propane_litre`).
- **Coverage.** `analyzeCoverage` (engine.ts:1805-1925) builds a day map (1858-1869) and counts a month as
  covered only if every day of it is covered (1882-1892). Six one-day periods cover six days and no whole
  month: `monthsCovered` 0, twelve gaps, "0 of 12 months covered". The gap is export-blocking through
  `findUnresolvedCoverage` (engine.ts:4115).
- **"Estimate the missing months" with 0 months covered: no divide by zero, no Infinity, no NaN. The click
  silently does nothing.**
  - The strip offers the button on any gap (CoverageStrip.tsx:128-135), whatever `monthsCovered` is.
  - `estimateResolution` (lib/ghg/coverageActions.ts:69-82) builds `monthsCovered: 0` and stores the note "0 of
    12 months evidenced by bills; remaining 12 months estimated by scaling metered data ×12/0 (100%
    estimated)."
  - `validateResolution` refuses it: `!(r.monthsCovered && r.monthsCovered > 0)` gives "An estimate needs the
    number of months covered by bills." (engine.ts:3072). So it is never accepted (engine paths read accepted
    resolutions only), and no figure, gap or audit row changes.
  - The gross-up has its own guard as well: `r && r.monthsCovered ? 12 / r.monthsCovered : 1` (engine.ts:3512).
    `resolutionMethod` (3034) and `adjustmentBasis` (3043-3046) are reached only for accepted resolutions.
    `pctEstimated` (2983-3001) reads `estimated` from accepted contributions, so it is unchanged.
  - **Net effect:** a refused resolution, with "×12/0" in its note, is stored in `coverage_resolutions` and saved.
    The gap and the export block stay, and the customer sees nothing happen and no reason why.
- **Latent defect, same root.** A one-day period dated the 1st of a month has no days.
  - `exclusiveEnd` treats an end on the 1st as exclusive (engine.ts:1799-1803), so start = end = 2025-03-01
    gives `t = 0` and `periodProblem: 'reversed'` (engine.ts:3365). The bill is then shown as "ends before it
    starts".
  - That contradicts the T1 ruling that a one-day bill (end = start) is valid. A delivery on the 1st would hit
    it today.
- **Not T10b:** the 177.143 L comes from the uncited US propane density (lib/unitConversions.ts:48-52,
  146-150), 90 kg × 1.96826 L/kg. That is FI4.

**Design (rulings, section 10)**
- **Which document types are delivery-based** (proposal, from `DOC_TYPE_FUELS` and `DOC_TYPE_LABELS`,
  lib/ghg/conciergeDocTypes.ts:27-62):

  | Document type | Label | Proposed | Note |
  |---|---|---|---|
  | `fuel_propane` | Propane delivery record | **delivery-based** | ⚑ Ambiguous: metered LPG (a piped network, or a metered tank billed by reading) comes as a periodic bill with a service period. |
  | `fuel_diesel` | Diesel purchase record | **delivery-based** | ⚑ Ambiguous: a supplier's monthly account statement covers a period. |
  | `fleet_fuel` | Fleet fuel record | **delivery-based** | ⚑ Ambiguous, most of all: a fuel-card statement covers a month and lists many purchases, while a single receipt is one purchase. |
  | `fuel_oil` | Fuel oil delivery record | **delivery-based** | Not read by the concierge today (`CONCIERGE_UNREAD_DOC_TYPES`), so it affects only typed figures and any future extraction. |
  | `utility_bill_gas` | Gas bill | periodic | Metered, billed by period. |
  | `utility_electricity` | Electricity bill | periodic | Metered, billed by period. |
  | `purchased_steam` | Steam / district heating bill | periodic | Metered; not read today. |
  | `service_record`, `renewable_cert`, `biogenic` | | not applicable | Not consumption read by date. |

  **Proposed rule for the ambiguous types:** the reading decides, not the type alone.
  - In a delivery-capable type, a reading with a delivery date and no billing period is a **delivery**.
  - A reading with a billing period (a fuel-card or account statement, or metered LPG) stays a **periodic
    reading**: prorated by its own days (R2), and covered by the month check as today.
  - ⚑ For Lisa: a field holding both kinds. The proposal is to treat it as delivery-based for completeness: no
    gap check, and the completeness confirmation covers every document. Each periodic reading is still
    prorated by its own days.
- **The reading.** `ExtractedProposal` gains `deliveryDate: string | null`, and `periodOrigin` gains
  `'delivery'`.
  - The extraction prompt (route.ts:61-66 and the propane, diesel and gasoline lines of `FUEL_GUIDANCE`, 33-38)
    gains a rule: "If the document records a delivery, purchase or dispense on a single date and prints no
    service period, return that date as deliveryDate, with periodStart and periodEnd null. Never return a
    delivery date as a one-day period."
  - **Readings saved before T10b** (pre-launch, section 4): in a delivery-capable type, a reading with
    periodStart = periodEnd and no deliveryDate is read as a delivery on that date. ⚑ Proposed read rule; no
    data migration.
- **Counting** (`billContributions`, engine.ts:3340-3412):
  - A delivery contributes its full value when its delivery date is inside the reporting window (inclusive of
    both ends), with the new reason **`delivered`** (counted, share 1, `totalDays` and `inWindowDays` null,
    `deliveryDate` set).
  - Otherwise it contributes `outside_year`, which the T3 ruling already allows to be silent.
  - It is never prorated.
  - The month-only confirmation (R5) does not apply: a delivery date is a printed date.
  - A delivery reading with neither a delivery date nor a period stays `undated` and blocks, as today.
- **Coverage and completeness:**
  - `findUnresolvedCoverage` and the strip skip the month check for a delivery-based group (document type,
    fuel, meter). Such a group never shows "N of 12 months covered", never shows a gap, and never offers
    "Estimate the missing months".
  - Instead, a new export-blocking issue, **`deliveries_unconfirmed`**: "Confirm that the {n} {fuel}
    deliveries listed for {site} are all the deliveries in {year label}. Export is blocked until you
    confirm."
  - The strip shows the deliveries in date order and one button: **"These are all the deliveries for this
    year"**.
  - It writes a new resolution `{ kind: 'deliveries_complete', locId, fuelType, documentType, docIds, by, at,
    note }`, keyed in `resolutionKey` (lib/ghg/coverageActions.ts:23-36) by (location, document type, fuel). Its
    note reads "{email} confirmed on {date} that these {n} deliveries are all the {fuel} deliveries for
    {site} in {year label}."
  - It appears in the workings as a coverage-resolution row, with who and when (T18 shape).
  - ⚑ **Proposed, not ruled:** the confirmation records the set of documents it covered. If a delivery is
    later added, removed, rejected or withdrawn, the set no longer matches, the confirmation stops applying,
    and the issue reopens with "The deliveries have changed since {email} confirmed them on {date}. Confirm
    again." Without this, a confirmation would silently cover a set it never saw.
  - "Used none" (T3) still answers a field with no deliveries.
- **Estimation is never offered for a delivery-based field:** `validateResolution` refuses an `extrapolate`
  whose group is delivery-based ("Deliveries are counted as delivered, not estimated."), and the strip renders
  no estimate control for one.
- **The 0-months guard** (independent of delivery handling, ruling):
  - the strip offers "Estimate the missing months" only when `monthsCovered >= 1`;
  - at 0 it shows "No month is fully covered by these bills, so the missing months cannot be estimated from
    them. Upload the missing bills, or enter the figure yourself.";
  - `estimateResolution` refuses to build one with `monthsCovered < 1` (it throws, and the strip never calls
    it);
  - `validateResolution`'s refusal (engine.ts:3072) stays as the backstop;
  - a stored resolution the engine refuses is shown in the strip as "An estimate was recorded but cannot be
    used: {reason}.", with "Remove it". It is never invisible.
- **One-day periods:** a period with start = end means that one day.
  - The fix goes in one place: a `canonicalPeriod(start, end)` helper used by both `analyzeCoverage` and
    `billContributions`. It returns `[start, start + 1 day)` when start = end, and `[start, exclusiveEnd(end))`
    otherwise.
  - ⚑ This touches the `exclusiveEnd` invariant in CLAUDE.md. `exclusiveEnd` itself is unchanged, and the
    proposed CLAUDE.md wording (Lisa applies) is: "A one-day period (start = end) covers that day, whatever the
    date; canonicalPeriod is the one place that says so."
- **Monthly split** (lib/ghg/monthlyEmissions.ts):
  - Each delivery goes in full to the calendar month of its delivery date, and only if that date is inside
    the window (Q2 ruling: slices are calendar months tagged with their inventory). The slice is tagged
    `basis: 'delivery'`.
  - Trends (T12) label delivery-based slices "Delivery-based: counted in the month delivered, not the month
    used."
  - `reconcile` stays at zero unexplained delta: the annual figure and the monthly figures are the same sum.
- **Post-launch only, not in T10b:** an optional opening and closing stock adjustment (a stock count at the
  start and end of the year, to turn deliveries into consumption). Recorded as a ruling. No design here.

- **Files:**
  - app/api/concierge/extract/route.ts (prompt and the `deliveryDate` field in the returned shape);
  - lib/ghg/conciergeDocTypes.ts (`DELIVERY_DOC_TYPES`, with its test);
  - lib/ghg/engine.ts (types, `canonicalPeriod`, `billContributions`, `analyzeCoverage` / `findUnresolvedCoverage`
    for delivery groups, `validateResolution`, the `deliveries_complete` resolution, its audit row and its
    method text);
  - lib/ghg/coverageActions.ts (`deliveriesCompleteResolution`, the key, the `estimateResolution` guard);
  - app/dashboard/ghg/_components/CoverageStrip.tsx (the delivery list, the confirmation, the 0-months message,
    refused-estimate display);
  - lib/ghg/monthlyEmissions.ts;
  - the trends page label;
  - app/dashboard/ghg/_components/ProposalEdits.tsx (the review shows "Delivered on {date}" instead of a period);
  - tests.
- **SQL:** none (`locations_data` and `coverage_resolutions` are jsonb).
- **Tests:**
  - **The Melbourne case, as a fixture:** six 90 kg LPG deliveries on six dates in the year.
    - Each contributes `delivered` with share 1.
    - The strip shows no month count and no estimate control, and shows the confirmation.
    - Export is blocked with `deliveries_unconfirmed` until it is given.
    - After confirmation, the issue clears and the workings carry who and when.
  - **A full year of deliveries exports after confirmation:** twelve monthly deliveries, all inside the
    window, confirmed. No coverage issue remains, and export is allowed (with every other gate met).
  - A delivery dated one day before the window opens, and one dated the day after it closes, contribute
    `outside_year` with zero. One dated on the first day and one dated on the last day both count in full.
  - A delivery on the 1st of a month counts. It is not `invalid_period`.
  - A one-day billing period on the 1st (a periodic document) covers that day and is not "reversed".
  - **The 0-months guard:**
    - with a gap and `monthsCovered` 0, the strip renders no "Estimate the missing months" and shows the
      message;
    - `estimateResolution({ monthsCovered: 0, ... })` throws;
    - a stored `extrapolate` with `monthsCovered` 0 is refused by `validateResolution`, changes no figure, and is
      shown as refused in the strip;
    - with `monthsCovered` 1, the estimate is offered and grosses up by 12.
  - An `extrapolate` on a delivery-based group is refused.
  - **Confirmation set** (if the proposed rule is ruled in): after confirmation, a seventh delivery reopens the
    issue with the "changed since" message.
  - **Extraction:** the prompt contains the delivery rule. A route test with a mocked model response carrying
    `deliveryDate` and null period passes it through.
  - **Monthly:** each delivery lands in its delivery month, tagged `delivery`, and `reconcile` is zero.
  - A periodic reading in a delivery-capable type (a fuel-card statement with a period) is prorated and
    month-checked as today.
  - Messages carry no em dash. Engine count only goes up.
- **Done:** a site that buys fuel by delivery can export once the customer confirms its deliveries are
  complete. No delivery is prorated or estimated, and no estimate can be recorded from zero covered months
  without the customer being told why.

### T10c. Run-through UX fixes (derived-figures, before merge)
- **Rulings:** section 10, "T10c". Patch: docs/review/patches/T10c-runthrough-ux.patch.
- **Files:**
  - lib/ghg/unsavedChanges.ts (new);
  - lib/ghg/dateWords.ts (new, the one place dates are put in words);
  - lib/ghg/unitLabels.ts (new, the unit-casing map moved from ProposalEdits.tsx);
  - lib/ghg/engine.ts (`valueProblem`, `proposalNeedsAttention`, the deliveries message, dates in words in the
    proration note, overlap and reversed-period messages and resolution rows, AU citations);
  - lib/ghg/workingsCells.ts;
  - lib/unitConversions.ts (Ccf and Mcf in the conversion note);
  - app/dashboard/ghg/page.tsx;
  - app/dashboard/ghg/_components/CoverageStrip.tsx and ProposalEdits.tsx;
  - app/climate-ghg/faq.ts and page.tsx;
  - app/components/modulePage.tsx (FAQ anchors);
  - tests.
- **Not changed, deliberately:**
  - the CSV export's exclusion sentence (`unpriceableMessage`), which is verifier-facing, not the location panel;
  - stored values (activity units and dates in saved workings are unchanged); only their display changes.
- **Done:** every ruling in section 10 "T10c" is on screen, with tests.

### T11. Verifier page: contributions, reasons, estimated dates
- **Classification:** core pre-launch work (ruling of 2 Oct 2026, section 10). It supplies the data trail a
  verifier follows from each figure back to its documents (ISO 14064-3 cl. 6.1.3.2), and the documented
  information that qualitative materiality depends on (cl. 5.1.7). Clause numbers are as cited in the ruling.
- **Order:** after derived-figures merges, on main; scheduled in section 12 after the work that adds workings
  fields.
- **Also renders** (T18): each action's who and when; the reading accepted at confirmation; an edited figure
  beside the value read; withdrawn documents with who, when and reason; tombstones of deleted documents; typed-figure
  entries.
- **Files:** app/verify/[token]/page.tsx (render from stored `workings`); lib/ghg/verifierWhitelist.test.ts if a new
  field crosses the projection; tests.
- **SQL:** none (fields live inside the `workings` jsonb the RPC already returns).
- **Tests:** a page fixture with excluded documents, a manual override and a month-only bill renders each reason;
  no engine calculation imported into the page.
- **Done:** a verifier can see, per figure, which documents counted, which did not, and why.

### T13. Core close-out
- **Order:** after derived-figures merges, on main.
- **Files:** remove dead paths (legacy straddle and duplicate writers, the stale-field fallback); update
  docs/review/ghg-findings.md statuses for F-09, F-10, F-11 (as fixed, with commit references added by Lisa);
  propose CLAUDE.md invariant wording.
- **SQL:** none.
- **Australian gas in GJ (added 2 Oct 2026, T10a follow-up):** consider pricing Australian gas natively in GJ,
  NGA's published unit (51.53 kg CO2e/GJ), instead of converting MJ and GJ to MMBtu and pricing on a derived
  54.367 kg CO2e/MMBtu. It would remove one conversion and the derived factor; it needs a GJ canonical unit for
  natural gas (or per country) in lib/unitConversions.ts.
- **Batch "Accept all" (ruling of 2 Oct 2026, section 10).** No batch accept exists today; each proposal is
  confirmed one at a time (page.tsx:3598-3600).
  - If one is built later, it must persist a per-bill acceptance record for every proposal it confirms: who,
    when, and which reading was accepted (value, unit and dates as shown at that moment).
  - The record is the same shape as T18's single-bill confirmation record, so a verifier sees no difference
    between a bill accepted alone and one accepted in a batch.
  - It goes through `guardConfirm` per bill, so a month-only bill or one with no figure is never accepted by
    the batch.
  - Reason: the customer's approval of each AI reading is the control a verifier will test.
- **Bills with no figure** (status, message and help entry): done in T10c.
- **Tests:** full suite; engine count not lower than before T1.
- **Done:** F-09, F-10 and F-11 are closed by tests that would fail on the old code.

### FI0. Retire the GHG location cap; keep the entitlement gate (own branch)
- **Branch:** `fi0-location-cap`, a small branch off main, independent of `derived-figures` and the factor
  branches. It touches no engine code.
- **Estimate:** M, 2 diffs, 1.5 to 2 days:
  - the SQL (drafted, NOT RUN: docs/review/patches/FI0-entitlement-gate-only.sql, with
    docs/review/patches/FI0-verify.sql);
  - the code and copy.
- **Rulings (section 10, "FI0"):** part (a) of `enforce_ghg_location_allowance()`, the entitlement gate, stays.
  Part (b), the location cap, is retired, because GHG is priced by employee band with unlimited locations. The
  gate's "still on screen — purchase" message loses its em dash.
- **Where the location limit is enforced, written or described** (checked at `3e37755`, 2 Oct 2026):
  - **Enforced, database:**
    - `enforce_ghg_location_allowance()` part (b) and its trigger `trg_enforce_ghg_location_allowance`:
      supabase/migrations/20260618_ghg_location_allowance.sql:65-130. The body there is identical to the 1 Oct
      2026 dump, db/dumps/schema_public_20261001_1057.sql:570-628; the cap is at 605-626.
    - **Correction to the premise:** this trigger is in the migrations folder. So is `log_audit()`
      (20260726_capture_audit_log_infrastructure.sql). Only the trigger `audit_ghg_inventories` is missing
      (captured in docs/review/patches/capture-triggers.sql, NOT RUN).
  - **Enforced, client:**
    - `useGhgLocationAllowance` (lib/useEntitlement.ts:197-225), read at app/dashboard/ghg/page.tsx:660;
    - the add-location check, outside and inside the updater (page.tsx:1013, 1016);
    - the wall copy, shown twice (page.tsx:2073-2074 and 2114-2115): "You've reached your plan's location limit
      ({n})" / "Your current plan covers up to {n} location(s). Upgrade to add more: your existing data stays
      exactly as it is." with "See plans & upgrade";
    - comments at page.tsx:288, 647, 999-1005, 1572 and 3308.
  - **Written, the column:** `entitlements.location_allowance`. It is created in
    20260618_ghg_location_allowance.sql:47-50 and defined in 20260811_entitlements_definition.sql:71. Its live
    column comment names "Essentials 3 / Professional 15 / Advisory uncapped" (dumps). Writers:
    - **checkout:** app/api/checkout/route.ts:123 (`locationAllowanceForTier`) and :288 (metadata
      `ghg_location_allowance`); it also selects the column at :144;
    - **admin invoice:** app/api/admin/create-invoice/route.ts:157 and :274, selecting it at :212; comments at
      :10-14;
    - **Stripe webhook:** app/api/webhooks/stripe/route.ts:181-182 reads the metadata and :245 upserts the
      column on every purchase, with a comment at :252;
    - **lib/pricing.ts:**
      - `locationAllowanceForTier` (124-132; its legacy branch 3 / 10 / 20 is dead under
        `NEW_PRICING_ACTIVE`);
      - `GHG_TIERS[*].locationAllowance`, all null (170-184);
      - comments at :481 and :587.
  - **Tests that pin it:**
    - lib/entitlementMetadata.test.ts:10-11, 37-39, 58, 110, 121, 125-149;
    - lib/pricing.test.ts:297;
    - lib/ghgTierKeys.test.ts:47;
    - lib/entitlementTerm.test.ts:14.
  - **Described, customer-facing copy:**
    - **app/calculate-emissions/page.tsx:145** (FAQ structured data): "priced by number of locations".
    - **app/calculate-emissions/page.tsx:588 and :692:** "The GHG module is priced by number of locations: from
      ${ghgFrom} for up to {GHG_TIERS.starter.locationAllowance} locations, ${ghgPro} for up to {...}". Both
      allowances are null, so **at `3e37755` this renders as "for up to  locations"**: wrong and broken.
    - **app/climate-ghg/page.tsx:**
      - :162: "{Unlimited locations} on the entry tier. Larger allowances and an uncapped tier are in the
        picker." This contradicts itself;
      - :216: the heading "Priced by locations, not by seats.";
      - :218-219: "because an inventory for three sites is not the same work as one for fifteen";
      - :233: the tier cards' allowance line;
      - comments at :72, 95-97 and 224.
    - **app/pricing/page.tsx:637-638:** the tier button's "unlimited locations" line.
    - **app/pricing/page.tsx:648-652:** "What counts as a location", placed "because the tier the buyer picks is
      a location count".
    - **app/order/page.tsx:115:** "· up to {n} locations" / "· uncapped".
  - **Described, internal:**
    - CLAUDE.md:20-23 (the DB-only list; stale, since both objects are in migrations), :54
      (`useGhgLocationAllowance()`) and :236-237 ("Only GHG scales by location ... Hard enforcement, upgrade
      wall");
    - comments in 20260909_verifier_invite_term_gate.sql:76, 121; 20260913_module_entitlement_triggers.sql:28,
      59, 113; 20260930_s211_read_write_split.sql:25; 20260811_deals_free_tier_cap.sql:31;
      20260928_concierge_source_model.sql; and 20260928_ghg_employee_bands.sql:17 ("until the batch that retires
      the cap");
    - lib/useEntitlement.ts:55, 71, 174; app/api/concierge/extract/route.ts:107; lib/obligations.ts:367, 490;
    - docs/review/ghg-register.md, LOC-01 to LOC-09 (147-178).
- **Files:**
  - **SQL** (NOT RUN, parsed offline with pglast): docs/review/patches/FI0-entitlement-gate-only.sql.
    - It replaces the function body with the gate only, keeping its name and trigger, so there is no moment
      without a gate.
    - The message becomes "Saving a GHG inventory requires the GHG module. Your work is still on screen.
      Purchase to save it."
    - It re-comments the column as retired.
    - Its pre-flight reports how many GHG rows still hold a non-null allowance.
  - **lib/pricing.ts:** remove `locationAllowance` from `GHG_TIERS` and remove `locationAllowanceForTier`.
  - **app/api/checkout/route.ts, app/api/admin/create-invoice/route.ts:** stop deriving and sending
    `ghg_location_allowance`, and stop selecting `location_allowance` (select `module_key` only).
  - **app/api/webhooks/stripe/route.ts:** stop reading the metadata key and stop writing `location_allowance`;
    the key is dropped from the upserted row.
    - A Checkout Session created before deploy may still carry the key; it is ignored.
    - Rows written earlier keep their value, which no trigger reads after the SQL.
  - **lib/useEntitlement.ts:** remove `useGhgLocationAllowance`.
  - **app/dashboard/ghg/page.tsx:** remove the allowance read, both add-location checks, `showLocationWall` and
    both walls. Rewrite the five comments.
  - **Copy, derived from `GHG_TIERS` employee bands, no hard-coded price** (CLAUDE.md pricing rule). Drafts:
    - **calculate-emissions :588 and :692:** "* All prices in USD. The GHG module is priced by number of
      employees, with unlimited locations on every plan: from ${starter} a year for up to {starter.max}
      employees. Larger organisations are quoted."
    - **calculate-emissions :145:** "... starts at ${ghgFrom} USD and is priced by number of employees, with
      unlimited locations; ..."
    - **climate-ghg :162:** "Unlimited locations on every plan. Plans are sized by number of employees."
    - **climate-ghg :216:** the heading becomes "Priced by organisation size, not by sites." The paragraph at
      :218-219 is rewritten to match. ⚑ Lisa to confirm the wording.
    - **climate-ghg :233:** the employee band ("1 to 19 employees") in place of the allowance.
    - **pricing :637-638:** the employee band.
    - **pricing :648-652:** "Every plan covers unlimited locations. Plans are sized by your number of employees."
    - **order :115:** the tier label and employee band.
  - **Tests:**
    - lib/entitlementMetadata.test.ts: `REQUIRED_KEYS` loses `ghg_location_allowance`, and a source test asserts
      the webhook row has no `location_allowance` key;
    - lib/pricing.test.ts:297 is replaced by "no GHG tier carries a location field";
    - lib/ghgTierKeys.test.ts:47 is updated;
    - new source test: no `useGhgLocationAllowance`, no "location limit" and no "priced by number of locations"
      anywhere under app/;
    - new copy test: the calculate-emissions note renders no empty number. The test fails on today's "for up to
      locations".
    - **Database tests** (no local Postgres server): docs/review/patches/FI0-verify.sql, run by Lisa after the
      SQL. It returns rows in the house format, and all its writes are undone. It checks:
      - a 25-location inventory saves with an active pass;
      - the same save is refused once the pass has expired, with the expired message;
      - it is refused with no GHG row, with the new module message;
      - the body no longer reads `location_allowance` and has no em dash.
  - **CLAUDE.md** (Lisa applies):
    - :20-23: remove both objects from the DB-only list (they are in migrations), and add the uncaptured
      `audit_ghg_inventories` trigger until capture-triggers.sql runs;
    - :54: drop `useGhgLocationAllowance()`;
    - :236-237: "GHG is priced by employee band, with unlimited locations on every plan. The only database rule on
      a GHG save is the entitlement gate."
- **Does main's live code work before and after the SQL runs? Yes in both states, provided the pre-flight
  count is 0.**
  - **Before (today):** every self-serve writer sends an empty allowance, which the webhook writes as null, and
    null is "uncapped" to part (b). So the cap is already inert for any row written since 28 Sep 2026.
    20260928_concierge_source_model.sql records that the one GHG row then existing (the developer test account)
    holds null. A row holding a non-null value is the only way a customer is capped today, and only the
    pre-flight count shows whether one exists.
  - **After the SQL, before FI0's code:** main still reads and writes the column, which still exists. The client
    wall reads null and never shows, and the function no longer reads the column. Nothing breaks.
  - **After FI0's code:** works with the new function. With the old function it also works, provided the count
    is 0.
- **Order to run:**
  1. capture-triggers.sql, at any time (independent; it creates nothing on prod).
  2. FI0-entitlement-gate-only.sql, then FI0-verify.sql.
  3. Merge FI0's code to main.
  4. **Later, separately:** a migration dropping `entitlements.location_allowance`, and renaming the function to
     `enforce_ghg_entitlement()` with its trigger. ⚠️ Only after step 3 is live. The webhook upserts the column
     until then; dropped first, the upsert fails and a paying customer receives no entitlement.
- **Done:** a GHG save is refused only for a missing or expired pass. No code reads or writes a location
  allowance. No customer-facing text describes a location limit or prices by locations.

### Factor integrity branch (after derived-figures merges, before factor-years)
Branch `factor-integrity`, created from main after derived-figures merges; `factor-years` is created from main
after this branch merges (sequencing ruling of 2 Oct 2026, section 10). Tasks FI1 to FI10; the recommended order,
which differs from the numbering, is in section 12. Evidence for every gap named below is in
docs/review/au-factor-coverage.md (AU) and docs/review/factor-coverage-all.md (UK, CA, NZ, EU); line numbers are
at `3e37755` and must be re-read before editing.

Rulings applied (section 10, "Factor integrity"):
- no cross-country fallback;
- exact conversions only;
- a density or energy content from the factor's own publisher by preference, otherwise from a cited official or
  standards source shown in the row's derivation note, and never another country's emission factor;
- no silent drop-out;
- unit and country changes convert exactly or clear and ask;
- propane mass by the same density rule, or block;
- Australian Category 3 gas and electricity from NGA Scope 3;
- steam with no published factor keeps supplier entry;
- Canadian gas with no province blocks;
- fleet fuel priced with each country's published mobile factors, or blocks;
- the NZ use class shown on rows.

Decisions of 2 Oct 2026:
- EU factors built on uncited properties are removed now and block;
- the DEFRA Category 3 stand-in stays for every other line;
- an unsupported-country location stays a stated, non-blocking exclusion;
- a gas bill in an energy unit prices only on the same calorific basis;
- no net-basis gas entry for the EU.

**Estimates.** S = up to 1 working day; M = 1 to 2 days; L = 3 to 5 days. Each estimate covers drafting and
verifying the patch, Lisa's review, one revision round, the build and the commit. A "diff" is one reviewable patch.

**Design note for T3c.** FI2 tags every factor value with the table (publisher) that supplied it. T3c later adds
an edition key to the same tables; FI2's shape must leave room for it (`{ publisher, edition?, value }`), so T3c
extends it rather than replacing it.

**Expected consequence (stated before any code).** Once this branch lands, inventories that price today will
block, and some will price differently:
- **Block:**
  - every EU liquid-fuel and gas line, until each density or energy content it needs is replaced by a cited
    value, or until the quantity is entered in kg or tonnes for a fuel whose cited source publishes on a mass
    basis (FI3);
  - every bill whose unit has no cited route to the factor (FI2), for example CA gas in therms, MMBtu, GJ or MJ,
    and NZ gas in m³, unless a cited energy content is found;
  - propane in kg or lb wherever no cited density or per-mass factor exists (FI4);
  - an unknown refrigerant type, and Canadian gas with no province (FI1);
  - fleet fuel in any country whose publisher has no mobile factor for it (FI9).
- **Now price:** AU gas in kWh (exact to GJ, NGA gross basis); AU and NZ diesel, petrol and propane gallons
  (exact to litres, own factor); NZ propane kg bills (MfE per-kg factor); UK gas in therms, MMBtu, GJ and MJ
  (exact to kWh, DEFRA gross basis).
- **Price differently:** every row that today carries a US EPA value under another publisher's citation.

### FI1. Engine: an unpriceable input is a blocking line, never a dropped site
- **Status:** done on `factor-integrity`, commits 58bb697 (diff 1) and 5fb2190 (diff 2).
- **Estimate:** L, 2 diffs:
  - the engine line-level unpriced row, issues, refrigerant and province;
  - consumers: page, monthly and Category 3.
- **Files:**
  - **lib/ghg/engine.ts:**
    - `assertPriceable` / `MissingEmissionFactorError` (2483-2513), `unpriceableReason` kind `'factor'`
      (2811-2815), the exclusion in `calcInventory` (2865) and the single `declaration: 'unpriceable'` workings
      row (3829-3831): a missing factor no longer excludes the location. The line is unpriced: excluded from
      every total (never counted as zero), its workings row carries `result_tco2e: null` and the message, and the
      location's other lines are still priced. This is the same line-level shape as T3c's `edition_missing`;
      the two share one `unpriced` row type.
    - New coverage issue `factor_missing`, export-blocking, keyed (location, field). Message: "{Fuel} at {site}
      is recorded in {unit}, and {publisher} publishes no factor this figure can be converted to exactly, so it
      is not counted. Enter it in {units the publisher supports}, or reject the bill. Export is blocked until
      this is resolved."
    - **Refrigerants** (ruling, section 10): `REFRIGERANT_GWP[...]?.[gwp] ?? 0` (2735, 3896) becomes an
      unpriced line with the issue "The refrigerant type at {site} is not one we hold a GWP for, so it is not
      counted. Choose the refrigerant type. Export is blocked until it is chosen." This covers a blank type with
      kilograms entered as well as an unrecognised one. Ammonia (`uses_ammonia`) is unchanged: it prices
      nothing by design, because ammonia has a GWP of zero.
    - **Canadian gas with no province** (ruling, section 10): the Ontario fallback is removed.
      - The fallback is `EF_CA.natural_gas_m3.co2` 1.921, "Ontario fallback" (242-245), applied when
        `grid_region || province` matches no key in `EF_CA_NG_CO2_M3` (2550-2556).
      - A CA gas line whose province is blank or unrecognised is unpriced, with the issue "The province for
        {site} is not set, so its natural gas is not counted. Choose the province. Export is blocked until it
        is chosen."
      - The province select already exists (page.tsx:2008-2019, 2306-2310). Electricity is already gated by
        `gridReady` (page.tsx:1334-1338), and that gate is unchanged.
      - Both issues clear when the province is chosen.
    - `findUnpriceableLocations` keeps only the country refusals. `country_not_supported` keeps today's stated,
      non-blocking exclusion (decision, section 10); `country_not_listed` keeps blocking.
  - **lib/ghg/monthlyEmissions.ts** (166-179, 258-267): an unpriced line is skipped with reason
    `factor_missing`, so `reconcile` reports zero unexplained delta.
  - **app/dashboard/ghg/page.tsx:** `factorGapLocations` / `pricingReady` (1365-1380) read the new issues; the
    export gate lists each with its message. The unpriceable-location panel becomes a per-line list.
  - **lib/scope3/cat3Inputs.ts** (288-296): `location_excluded` for a factor gap becomes a per-stream skip,
    `scope1_not_priced`, so the location's priced streams still reach Category 3.
  - **CLAUDE.md** (Lisa applies): "No input without a factor is ever dropped silently or takes a site out of the
    totals. It is an unpriced line with an export-blocking issue naming the site, the fuel and the unit. The
    only whole-location exclusion is an unsupported country, which is stated on every surface."
- **SQL:** none.
- **Tests:**
  - **Property test:** for every country in `efRouting`'s supported set × every fuel × every unit in the wizard
    options and `convertibleUnits`, the line is either priced or unpriced with a blocking issue. It is never
    `?? 0`, and the location is never excluded.
  - A location with one unpriceable line still has its other lines priced and in every total.
  - **Refrigerant:**
    - an unrecognised refrigerant type with 50 kg entered, and a blank type with 50 kg entered, each give an
      unpriced line, the blocking issue, and a fugitive total of 0 that is not counted as a priced zero;
    - choosing a held type clears the issue and prices at kg × GWP;
    - a source test finds no `?? 0` on a `REFRIGERANT_GWP` read.
  - **Canada:** a CA location with gas in m³ and no province is unpriced with the province issue, and is not
    priced at 1.921. Choosing ON prices at the Ontario value; choosing AB prices at AB's.
  - Monthly and annual agree: `reconcile` is zero with an unpriced line present.
  - An unsupported country is still excluded, stated and non-blocking; a not-listed country still blocks.
  - Messages carry no em dash.
  - Engine test count only goes up.
- **Done:** no input in a supported country can leave the totals without an export-blocking issue that names it.

### FI2. Engine: no cross-country fallback; exact conversions; provenance from the value
- **Status:** done on `factor-integrity`, commits 796df43, 51a9014 and a4bf4f4 (diffs 1 to 3), with the follow-up bc094eb.
- **Estimate:** L, 3 diffs:
  - the exact conversion table and publisher-tagged factor tables;
  - removal of the fallback and routing by quantity type;
  - the Category 3 publisher sentences.
- **Depends on:** FI1, so a key that stops falling back becomes a blocking line, not a dropped site.
- **Files:**
  - **lib/unitConversions.ts:**
    - **One table of exact conversions**, the only ones the engine applies at pricing:
      - US gallon = 3.785411784 L;
      - ft³ = 0.028316846592 m³ (0.3048³), so mcf = 28.316846592 m³ and ccf = 2.8316846592 m³;
      - therm = 0.105505585262 GJ;
      - MMBtu = 1.05505585262 GJ;
      - kWh = 0.0036 GJ;
      - MJ = 0.001 GJ;
      - lb = 0.45359237 kg.
    - Each constant is cited (NIST SP 811, or the definition) and labelled exact. The "(IEA)" label at 40 is
      corrected.
    - `M3_PER_MCF` (engine.ts:285, 1000/35.3147, rounded) is replaced by the exact value.
    - `PROPANE_LB_PER_GAL` goes in FI4.
  - **lib/ghg/engine.ts:**
    - **No fallback.** Remove `?? (EF as any)[key]` from every branch of `pickEF` (2528, 2531, 2535, 2540,
      2547). A key absent from the location's own table resolves only by an exact conversion to a unit that table
      holds. Otherwise the result is FI1's unpriced line.
    - **Route by quantity type.** Volume ↔ volume, energy ↔ energy and mass ↔ mass use the exact table.
      - **Volume ↔ energy or mass ↔ volume** needs an energy content or density (refined ruling, section 10).
        - **Preference:** a value published by the factor's own publisher. Example: NGA 0.0393 GJ/m³, already the
          basis of `EF_AU.natural_gas_m3`.
        - **Otherwise:** a value from a cited official or standards source, for example the EU JRC or EN 590.
        - **Never:** another country's emission factor.
        - Each property is stored beside the factor with its citation (document, table, row) and printed in the
          row's derivation note: "Density {value} kg/L, from {source, table}."
        - A value we chose inside a range a standard gives is not a value that source publishes, and does not
          qualify (settled by ruling R2, 7 Oct 2026, section 10).
      - **Calorific basis** (decision, section 10): a gas quantity in an energy unit (kWh, GJ, MJ, therms,
        MMBtu) prices only with an energy-basis factor whose gross or net basis its publisher states.
        - A gross/net ratio follows the same rule as any energy content: the publisher's own by preference,
          otherwise a cited official or standards source, shown in the derivation note.
        - The ratio has its own order of sources (ruling R3, 7 Oct 2026, section 10).
        - Otherwise the line is unpriced.
      - **As held today:**
        - DEFRA kWh is gross (engine.ts:327), so UK energy units price.
        - NGA 51.53 kg CO2e/GJ is gross, so AU energy units price. This replaces the derived `natural_gas_mmbtu`
          54.367 and absorbs the T13 note on pricing Australian gas natively in GJ.
        - US EPA MMBtu is HHV, so US energy units price.
        - EU MRR is net (FI3).
        - MfE kWh: basis not recorded (⚑ factor-coverage-all.md 4.2). It prices kWh only once the basis is
          confirmed from the MfE document.
        - ECCC: per m³ only. Energy units block unless an ECCC energy content is transcribed.
    - **Provenance from the value.** Each factor table carries its publisher. `pickEF` returns `{ factor,
      publisher, conversion? }`. `combustionSource` (2645-2649), `factor_vintage` (3787) and the GWP stamp in
      `factorCells` (3722-3733) are taken from the table that supplied the value, never from the location's
      country.
    - **Every converted line** carries a `conversion_note` on its workings row: "1,000 US gallons converted to
      3,785.41 litres (1 US gallon = 3.785411784 litres, exact)."
    - **Canada, blank province:** handled in FI1.
  - **lib/ghg/monthlyEmissions.ts:** uses the same `pickEF`; no separate path.
  - **lib/scope3/cat3Inputs.ts** (377) and **cat3Copy.ts** (148-152, 424, 442): `scope1_publisher` is read from
    the row's recorded publisher. `CAT3_EPA_HHV_SENTENCE` fires only when the row's publisher is US EPA, not on
    the unit.
  - **Stale comments** at engine.ts:2204-2209 (`pickEF` header) and 2533, 2538 ("fall back to US EF") are
    rewritten to the new rule.
- **SQL:** none.
- **Tests:**
  - **Publisher matches value** (the cross-publisher test). For every supported country × fuel × unit the
    wizard or bill path can store, build the inventory and walk every workings row. Either the row is unpriced,
    or the factor value it used is found in the table of the publisher its `ef_source` and `factor_vintage`
    name, under the key the row records (after its recorded exact conversion). The test fails if any row
    cites one publisher while its value comes from another's table.
  - **Every property shown:** every row priced through a density, energy content or gross/net ratio carries a
    derivation note naming that value and its source. No property comes from another country's emission factor
    table.
  - **Source test:** no `?? (EF as any)` and no `?? EF[` in `pickEF` or anything it calls.
  - **Exact table:** each constant equals its definition to full precision. mcf ↔ m³ round-trips.
  - **Calorific basis:**
    - AU gas in kWh prices at 51.53 × 0.0036 per kWh;
    - EU gas in kWh is unpriced with the issue;
    - UK gas in therms prices via exact kWh at the DEFRA gross factor.
  - **Conversion note:** present and plain on every converted row.
  - Category 3 sentences name the publisher that priced the row.
  - Engine count only goes up.
- **Done:** every priced row's value comes from the publisher it cites. Every conversion is either exact or uses
  a property that is cited and shown on the row. Nothing else prices.

### FI3. EU: no factor through an uncited property; mass units only where the source is mass-based
- **Status:** done on `factor-integrity`, commits efe25a7 (research record, rulings R6 to R11) and ff9e961.
- **Estimate:** M, 2 diffs:
  - a research record, a document only: per fuel, what each candidate source publishes;
  - the `EF_EU` restructure and the units offered.
  The research may take longer than the code.
- **Depends on:** FI2.
- **Decisions (section 10):** apply now and block; net-basis gas entry is struck; the density and
  energy-content rule is the refined one.
- **What changes, and why.** Every `EF_EU` per-litre and per-m³ key rests on a value that, the code itself
  records, neither cited source publishes:
  - **gas:** 36 MJ/m³ (engine.ts:569-572);
  - **diesel:** 0.844 kg/L, "conservative upper end" of EN 590;
  - **petrol:** 0.745 kg/L, "near midpoint" of EN 228;
  - **LPG:** 0.510 kg/L, "no European standard bounding it";
  - **residual fuel oil:** 0.990 kg/L, "one-sided bound".
  Sources for these: engine.ts:416-437 and 573-588.
  Under the refined rule, a point chosen inside a standard's range is not a cited value (ruling R2, section 10),
  so none of the five qualifies as it stands.
- **Files:**
  - **lib/ghg/engine.ts** (`EF_EU` 396-588):
    - Each derived key is kept only once its property is replaced by a value from:
      - the factor's publisher (EU MRR Annex VI, IPCC 2006); or
      - failing that, a cited official or standards source that states a single value, for example the EU JRC.
      The value, source and table go in `EU_DERIVATION` and on the row's derivation note.
    - Until then the key is removed and the line is unpriced (FI1). Nothing is assumed.
    - The emission factors per TJ (net calorific value) and the net calorific values stay as published, each
      cited by table and row.
  - **Mass units:**
    - kg and tonnes are offered for an EU fuel **only where the cited factor source publishes on a mass basis**.
      Here that is: a net calorific value per tonne from the same table as the factor per TJ, so mass × NCV ×
      factor uses the cited source alone.
    - ⚑ For each fuel, confirm from MRR Annex VI Table 1 and IPCC 2006 Vol. 2 Table 1.2 that both values are
      published. A fuel without both gets no mass unit.
    - Wizard options: `ngUnitOptions`, `liquidUnitOptions`, `propaneUnitOptions`, engine.ts:2048, 2062, 2104.
  - **Gas in an energy unit:** no net-basis entry is offered (ruling).
    - An EU gas bill in kWh, GJ or MJ is taken as stated on the bill. It prices only if a gross/net ratio is
      cited under FI2's rule, shown in the derivation note.
    - Otherwise it is unpriced.
    - Gas in m³ prices only with a cited volumetric energy content.
  - **Issue message:** "The EU factor for {fuel} is published per unit of energy, and we hold no cited {density
    or energy content} to convert {unit} to it, so this line is not counted. {If a mass unit is offered: Enter
    the quantity in kilograms or tonnes, or reject the bill.} Export is blocked until this is resolved."
  - **app/methodology/page.tsx** and **`EF_SOURCES.combustion_eu`** (798): state the basis, each property's
    source, and the units accepted.
- **Research record** (docs/review/eu-fuel-properties.md, new, alongside, no code):
  - per fuel, whether EU MRR, IPCC 2006, the Commission's MRR guidance or the EU JRC publish a density, a
    volumetric energy content or a gross/net ratio;
  - for each, the document, table, value, and whether the value is single or a range.
- **SQL:** none.
- **Tests:**
  - **Source test:** no `EF_EU` value depends on 36, 0.844, 0.745, 0.510 or 0.990 unless that property carries a
    citation.
  - An EU diesel figure in litres, with no cited density, is unpriced with the message.
  - A fuel with a mass-basis source prices from tonnes at mass × NCV × factor, each value cited. A fuel without
    one is offered no mass unit.
  - EU gas in kWh with no cited ratio is unpriced. With a cited ratio it prices, and the derivation note names
    the ratio and its source.
  - The FI2 cross-publisher and property tests pass for EU.
- **Done:** no EU line is priced through a property that is not cited and shown on its row.

### FI4. Propane by mass: cited density or per-mass factor, or block
- **Status:** done on `factor-integrity` (ruling R13), commit a6dc519.
- **Estimate:** M, 1 diff, plus a research record per publisher.
- **Depends on:** FI2.
- **Files:**
  - **lib/unitConversions.ts:**
    - Remove `PROPANE_LB_PER_GAL` (48-52) and the `propane:lbs` and `propane:kg` rules (142-150).
    - lb → kg is exact (FI2).
    - A propane bill in kg or lb is stored as kg, not converted to a volume. `SELECTOR_UNITS.propane` (30) gains
      `kg`.
  - **lib/ghg/engine.ts:** a propane quantity in kg prices by:
    - the publisher's own per-mass factor, where one is held: `EF_NZ.propane_kg` (706, 721); or
    - a density under FI2's refined rule (the publisher's own by preference, otherwise a cited official or
      standards source), shown in the derivation note, converting to the volume its factor uses.
    - Otherwise the line is unpriced (FI1).
    - **The 4.24 lb/gal value itself.** It is removed as it stands. Its comment cites "EIA / NPGA" and says
      "VERIFY PROVENANCE"; NPGA is a trade association, not an official or standards body. It may return only
      if an official source is found that states that value, cited by document and table.
  - **Per publisher** (⚑ each to be confirmed against the document before a value is entered; none assumed):
    - DEFRA LPG and propane per tonne;
    - NGA LPG energy content per tonne;
    - ECCC propane density;
    - US EPA propane per mass.
  - **Volume to mass** (litres or gallons where the factor is per kg, e.g. NZ): the same rule in reverse.
- **SQL:** none.
- **Tests:**
  - **Source test:** no `PROPANE_LB_PER_GAL`, and no propane density without a citation.
  - An NZ propane kg bill prices at MfE's per-kg factor, not at a US litre factor.
  - A kg bill for a publisher with no per-mass factor and no density is unpriced with the issue.
  - lb converts to kg exactly.
  - FI2's cross-publisher test passes for propane.
- **Done:** no propane figure passes through a density that is not cited and shown on its row.

### FI5. Unit selector and country change: convert exactly or clear and ask
- **Status:** done on `factor-integrity`, commit 198415d.
- **Estimate:** M, 2 diffs:
  - the engine `changeUnit`, `unitsForCountryChange` and the residual-region guard;
  - the page handlers and messages.
- **Depends on:** FI2 (the exact table).
- **Closes:** the CLAUDE.md open defect "Unit switch relabels without converting", and the country-change
  relabel (`unitsForCountryChange`, engine.ts:2173-2186; page.tsx:968).
- **Rule, derived from the ruling:**
  - **Convert** when old and new unit measure the same quantity and an exact conversion joins them (volume ↔
    volume, energy ↔ energy, mass ↔ mass).
  - **Otherwise clear** the figure and ask (volume ↔ energy, volume ↔ mass, or any pair with no exact
    conversion).
  - A field whose figure comes from documents keeps its locked unit (T7). Its unit is corrected on the bill (T9).
- **Files:**
  - **lib/ghg/engine.ts:**
    - `unitsForCountryChange` returns, per stream, `{ unit, value, conversion }` or `{ unit, cleared: true,
      from }`. A new pure `changeUnit(field, value, from, to)` serves the unit selector.
    - Each conversion appends `{ field, from, to, factor, valueBefore, valueAfter, at, by }` to the location's
      `unit_changes`. The workings row for that field carries it as its `conversion_note`.
  - **app/dashboard/ghg/page.tsx:**
    - The unit selector handler and the country handler (960-975) call these.
    - **Converted:** shows, beside the field, "Converted from 1,000 US gallons to 3,785.41 litres (1 US gallon =
      3.785411784 litres)."
    - **Cleared:** shows "The {fuel} figure was in {old unit}, which cannot be converted exactly to {new unit},
      so it has been cleared. Enter it in {new unit}."
    - A cleared field with no figure raises FI1's issue until it is entered or confirmed as none.
  - **Stale residual region** (factor-coverage-all.md 1.3): the country handler also clears `residual_region`,
    and `residualRegionFor` (engine.ts:1192-1193) ignores a `residual_region` that does not belong to the
    location's country.
  - **CLAUDE.md** (Lisa applies): move "Unit switch relabels without converting" out of Known defects. Add the
    invariant: "A unit change never relabels a figure: it converts exactly, with the conversion shown and
    recorded, or it clears the figure and asks."
- **SQL:** none (`unit_changes` lives in `locations_data`).
- **Tests:**
  - **The CLAUDE.md case:** 332 m³ switched to Mcf becomes 11.7245 Mcf (332 ÷ 28.316846592 = 11.72447), never 332 Mcf.
  - US→GB with 1,000 gallons of diesel gives 3,785.41 litres with a note.
  - US→GB steam in MMBtu converts to kWh exactly.
  - US→NZ propane in gallons is cleared (volume to mass), with the message.
  - Gas mcf to kWh is cleared.
  - A document-backed field is not changed by a country change.
  - A US location with a residual subregion switched to GB has no `residual_region`, and its market-based row
    does not cite Green-e.
  - **Property test:** for every country pair and every stream with a figure, the figure is converted exactly
    or cleared. It is never the same number under a different unit.
- **Done:** no unit or country change can relabel a figure.

### FI6. Australia Category 3: NGA Scope 3 for gas and electricity, by state
- **Status:** open. Not on `factor-integrity`; see section 12.2.
- **Estimate:** M, 2 diffs:
  - the transcribed NGA Scope 3 file with spot tests;
  - the Category 3 wiring and copy.
- **Depends on:** FI2 (provenance on rows).
- **Files:**
  - **lib/emissionFactors/ngaScope3_2025.ts (new).**
    - Transcribed from *National Greenhouse Accounts Factors 2025*. Every value is cited by table, row and
      column:
      - the Scope 3 electricity factor for each state and territory (the Scope 3 column of the table that
        gives `GRID_EF.AU_*`, engine.ts:979-981);
      - the Scope 3 natural gas factors for each state, per GJ.
    - ⚑ Before transcribing, confirm from the NGA text: the table numbers; what the electricity Scope 3 factor
      covers (upstream fuel extraction, T&D losses, or both), and whether NGA splits it; whether gas factors
      differ by metro and non-metro; how the ACT is listed. None of this is assumed here.
    - Keyed by edition, ready for T3c.
  - **lib/scope3/cat3Energy.ts** (243-256, 317):
    - For an AU location, the electricity lines are replaced by NGA's Scope 3 electricity line(s) for the
      location's state. The replacement follows NGA's split: one line if NGA gives one combined figure, labelled
      with what it covers; separate 3a and 3c lines if NGA splits them.
    - Gas is priced at NGA's Scope 3 gas factor for the state. The stored unit is converted to GJ under FI2: m³
      by NGA's 0.0393 GJ/m³, energy units exactly.
    - These lines carry no `uk_stand_in` flag.
    - AU liquids, LPG and steam keep the DEFRA stand-in, flagged (decision, section 10).
  - **lib/scope3/cat3Copy.ts** (124-128, 207-211): AU wording names NGA for gas and electricity and the UK
    stand-in for the rest.
  - **lib/ghg/engine.ts:1116:** the "DELIBERATELY NOT SEEDED" comment is replaced by a pointer to the new file.
  - **app/methodology/page.tsx:** the Category 3 paragraph for Australia.
  - **A blank state:** the AU gas and electricity Category 3 lines are withheld with a reason naming the
    missing state. They are not priced at a national figure.
- **SQL:** none.
- **Tests:**
  - At least one spot value per table against the document.
  - An AU electricity line in each state uses that state's NGA factor and cites NGA 2025.
  - AU gas in m³ and in kWh both price at the NGA Scope 3 gas factor, with the conversion stated.
  - AU diesel keeps the DEFRA stand-in and its flag.
  - No AU gas or electricity Cat 3 line carries `uk_stand_in`.
  - FI2's cross-publisher test extended to Category 3 rows.
- **Done:** Australian Category 3 gas and electricity are priced from NGA by state, cited, and nothing else in
  Australian Category 3 changes.

### FI7. Steam with no published factor: plain supplier-figure message
- **Status:** done on `factor-integrity`, commit 18fce56. FI7b (ruling R14, the labelled estimate at own-country gas / 0.80), commit 8b8af7b.
- **Estimate:** S, 1 diff.
- **Files:**
  - **lib/ghg/engine.ts** (`STEAM_EF` CA, AU, NZ, EU guidance, 2364-2396) and **app/dashboard/ghg/page.tsx**
    (2392-2396): one message per kind, plain, no em dash.
    - `unpublished`: "There is no published {country} factor for purchased steam or district heat, so this
      line is not counted. Ask your provider for their emission intensity and enter it below. Export is blocked
      until it is entered."
    - EU `not_searched`: "This platform holds no factor for purchased steam or district heat in {country},
      so this line is not counted. Ask your provider for their emission intensity and enter it below. Export is
      blocked until it is entered."
  - The steam row joins FI1's unpriced line type: it shows `result_tco2e: null`, not a contribution of 0.
  - Supplier entry is unchanged.
  - page.tsx:2359: label the selected steam unit from the unit, so a UK location in kWh no longer shows "MMBtu".
  - Stale comments at engine.ts:193-196, 2093-2095 and 2475-2477.
- **SQL:** none.
- **Tests:**
  - Each kind shows its message.
  - A supplier figure clears the issue and prices.
  - No US steam fallback for any country (existing test kept).
  - The UK kWh label reads kWh.
- **Done:** a customer with no published steam factor is told plainly what to enter and why export waits for it.

### FI8. Close-out
- **Status:** done on `factor-integrity` (7 Oct 2026), patch docs/review/patches/fi8.patch; commit: ____ (Lisa to fill in).
- **Estimate:** S, 1 diff.
- **Files:**
  - **Stale comments** listed in factor-coverage-all.md section 6 and au-factor-coverage.md section 6.
  - **docs/review/ghg-findings.md:** F-01 marked fixed (commit references added by Lisa).
  - **docs/review/factor-year-selection.md:** line references refreshed.
  - **app/methodology/page.tsx:** one disclosure paragraph: "Each emission factor is applied only to quantities
    in the units its publisher uses, or converted to them by an exact conversion such as gallons to litres. If a
    conversion needs a density or energy content, we use the publisher's own figure where it publishes one, and
    otherwise a figure from a named official or standards source, shown beside the calculation. We never use
    another country's emission factor. If no such figure exists, the line is not counted and the inventory
    cannot be exported until it is entered in a unit we can price."
  - **app/methodology/page.tsx, FI3's bases (added 7 Oct 2026):** "EU: litres and kWh bases, densities
    from JEC, m3 and heating-oil litres blocked; Canada gas GJ at the national heat content."
  - **app/methodology/page.tsx, FI4 (added 7 Oct 2026):** "Propane: units accepted per country, and mass priced only
    on per-mass factors."
  - **app/methodology/page.tsx, FI7b (added 7 Oct 2026):** "Steam: estimate method and label for CA, AU, NZ and EU."
  - **Market-based Scope 2 where no residual mix is loaded** (UK, CA, NZ; report in section 10).
    - These are wording corrections, not the disclosure task the ruling provides for: the substitution is
      already disclosed on the row. ⚑ Strike if not wanted.
    - The row note (engine.ts:1265-1266) "No published residual mix for this subregion; market-based falls back
      to location factor." becomes "No residual mix is loaded for {country}, so the market-based figure uses the
      location-based grid average for the electricity not covered by contractual instruments." This removes the
      US word "subregion" and the unchecked claim that none is published.
    - The XLSX methods line (page.tsx:3191) and the PDF sentence (lib/assurancePdf.ts:280) say a residual-mix
      factor was applied to uncovered load. They gain: "or, where no residual mix is loaded, the location-based
      grid average (named per location below)."
    - The methodology Scope 2 paragraph (app/methodology/page.tsx:71) names the countries that use the
      grid-average substitution, alongside the full-disclosure case it already names.
  - **CLAUDE.md** (Lisa applies), proposed: "No factor falls back to another country's or publisher's value.
    Every workings row's value comes from the publisher it cites."
- **Tests:**
  - Full suite.
  - The FI2 cross-publisher test runs over every country fixture.
  - Engine count not lower than before FI1.
- **Done:** F-01 is closed by a test that fails on the old code, and the methodology page states the rule.

### FI9. Fleet fuel: each country's published mobile factors, or block
- **Status:** open. Not on `factor-integrity`; see section 12.2.
- **Estimate:** L, 3 diffs:
  - a research and transcription record per publisher, with a data file of transcribed values;
  - the data model and wizard input that selects the publisher's vehicle class;
  - the engine wiring and tests.
  An open decision comes first (below).
- **Ruling (section 10):** mobile combustion (`diesel_mobile_*`, `gasoline_*`) is priced with the location's
  country's published mobile factors for CO2, CH4 and N2O, cited. Where that publisher publishes none for a
  fuel, the fleet line is unpriced with a blocking issue. A stationary factor is never used for a fleet line.
- **What is there today:**
  - Every table's mobile keys equal its stationary keys: US `EF` (168-169), `EF_CA` (270-271), `EF_NZ` (705,
    720, "deliberate, for consistency"), `EF_EU` (513), `EF_AU` (656) and `EF_UK` (335).
  - `lib/ghg/mobile.ts` holds transcribed ECCC NIR 2026 mobile factors (Annex 6, Table A6.1-15) and IPCC 2006
    Vol. 2 Ch. 3 mobile defaults. Nothing imports it (mobile.ts:3-9).
- **⚑ Decision needed before code (not recorded).** mobile.ts:33-39 records that ECCC publishes mobile CH4 and
  N2O by vehicle class and emission-control technology, with N2O varying up to 94-fold within one class. The
  US EPA Hub publishes CH4 and N2O per mile by vehicle type and model year (⚑ confirm table). No current input
  can choose between these rows. Options for Lisa:
  - (a) one vehicle class, and where the publisher requires it one control tier or model year, per location;
  - (b) a fleet split by class, with fuel per class;
  - (c) either of those, and a customer who cannot characterise the fleet is blocked.
  The ruling's "block where none is published" does not settle what to do where a factor is published but the
  class is unknown.
- **Research (per publisher, recorded before any value is entered; none assumed):**
  - DEFRA: whether its liquid-fuel factors are stated to apply to transport use, or a separate transport table
    applies;
  - NGA: the transport-fuel combustion table;
  - MfE: transport-fuel factors (the engine already uses Transport Regular Petrol for petrol);
  - EPA Hub: mobile CO2 per gallon, and CH4 and N2O per mile;
  - ECCC: NIR Table A6.1-15, already transcribed;
  - EU: IPCC 2006 Vol. 2 Ch. 3, already transcribed, energy basis, so it needs a cited energy content under
    FI2's rule.
- **Files:** lib/ghg/engine.ts (mobile keys per table, edition-keyed for T3c; `calcLocation` mobile path);
  lib/ghg/mobile.ts (wired, or superseded by per-publisher files); app/dashboard/ghg/page.tsx (the class input
  the decision settles); the methodology page; CLAUDE.md (Lisa applies): "A fleet line is priced only with a
  mobile factor; a stationary factor is never used for a vehicle."
- **Issue message:** "{Publisher} publishes no mobile combustion factor for {fuel}, so the {fuel} used in
  vehicles at {site} is not counted. Export is blocked until this is resolved." The remedy depends on the
  decision.
- **SQL:** none.
- **Tests:**
  - every fleet row's CO2, CH4 and N2O are found in the publisher's mobile table under the selected class;
  - **source test:** no `*_mobile_*` key is defined as a copy of a stationary key unless the publisher states,
    cited, that one factor covers both uses;
  - a fleet line for a publisher with no mobile factor is unpriced with the issue;
  - FI2's cross-publisher test covers fleet rows.
- **Done:** no vehicle fuel is priced with a stationary factor.

### FI10. New Zealand use class on every row
- **Status:** done on `factor-integrity`, commit 1b40725.
- **Estimate:** S, 1 diff.
- **Ruling (section 10):** the use class that selected the `EF_NZ` table (`nz_use_class`, commercial or
  industrial, engine.ts:2539) is shown on every NZ combustion row.
- **Files:**
  - **lib/ghg/engine.ts:** `pushFuel` (3760) adds `factor_variant: 'Commercial use class'` or
    `'Industrial use class'` to NZ rows. The comment at 694-699, which records that the use class appears
    nowhere, is replaced.
  - **lib/ghg/factorEditions.ts:** the NZ combustion entry records the use class, so `sameFactorEditions`
    reports a change between years.
  - **Shown on:** the workings table, the XLSX, the verifier page (app/verify/[token]/page.tsx) and the PDF.
    Add to lib/ghg/verifierWhitelist.test.ts if the field crosses the projection.
- **Tests:**
  - an NZ industrial location's rows carry "Industrial use class" and price at the industrial values;
  - two inventories differing only in use class are not reported as the same factor editions;
  - the field renders on every surface.
- **Done:** a verifier can see which MfE table priced each New Zealand row.

**Not covered by these rulings** (found in the audits, left for a later decision):
- the CA and EU fixed end-use CH4 and N2O rows, which are not shown on rows (the `factor_variant` field from
  FI10 could carry them);
- `factor_editions` has no residual-mix entry;
- `s3_td` is not gated on a resolved region.

Edition and year coverage stays with T3c and T3d.

### Factor-years branch: T3b, T3c, T3d
Branch `factor-years`, created from main after the factor integrity branch merges (sequencing ruling of
2 Oct 2026, section 10; previously after derived-figures). Order: T3b, T3c, T3d.

### T3b. Reporting-year labels, Scope 3 year end, SB 253 banner from the window
- **Branch:** `factor-years`. **Depends on:** T3a (`reportingYearLabel`).
- **Scope:** every customer-facing reporting-year label in finding F-12 (docs/review/ghg-findings.md), except:
  - the engine factor notes at engine.ts:1003-1004, 1133-1134 and 1148-1149, which T3c replaces;
  - the stored proration note, which T3a already fixed.

  F-12's line numbers are at de782a6. Re-check each by printing it before editing.
- **Helper** (ruling, section 10). `reportingYearLabel` returns every form, so it stays the one place a label
  is made:
  - `heading`, for menus, tiles and headings. December: "2025". Other year ends: "Apr 2024 to Mar 2025", the
    window's first and last months.
  - `axis`, for chart axes only. December: "2025". Other year ends: "2024–25".
  - `fileTag`, for filenames. December: "2025". Other year ends: "2024-04_to_2025-03".
  - `inText` (from T3a), for running text: "reporting year 2025" or "the year ending 31 March 2025".
  - T3a's `label` is replaced by `heading`.
  - No form uses "YE" or "FY".
- **Files:**
  - **app/dashboard/ghg/page.tsx:**
    - duplicate alert 1666;
    - year dropdown 1802 (`heading` in place of "FY{yr}", keeping the date range);
    - prior-year labels 1853, 1856, 2634, 2638, using the prior window's label;
    - activity-data field labels 2116, 2136, 2151, 2179, 2195, 2206, 2216, 2254, 2332. Their hint "Sum of all
      12 monthly bills" becomes "Sum of the bills covering {window start} to {window end}";
    - review subtitle 2584;
    - export preview tile 2969;
    - **framework CSV** 3115: keep "Reporting year", and add rows "Reporting period" (window start and end)
      and "Year end";
    - CDP CSV prior-year rows 3135-3136;
    - CSV filename 3207 (`fileTag`);
    - inventory list 3246;
    - coverage strip 3530.
  - **app/dashboard/ghg/trends/page.tsx and lib/ghg/series.ts:**
    - load `fiscal_year_end_month` with each year's inventory;
    - labels at trends 283, 329-330, 337, 414, 465, 501 and 514 (`heading` or `inText`), and the chart axes
      at 360 and 449 (`axis`);
    - **the monthly chart's month labels include the year for non-December year ends** (added after T12):
      a year ending in March runs "Apr 2024" to "Mar 2025", so a reader can tell which calendar year each
      month is in. December year ends keep "Jan" to "Dec". The labels come from `buildMonthlyBuckets`
      (lib/ghg/loadMonthly.ts), which needs the inventory's year end passed in;
    - labels at series.ts 345, 348, 371, 373, 389.
  - **app/verify/[token]/page.tsx:** header 747 shows the label and the window dates. The page must receive
    `fiscal_year_end_month`; if it does not cross the RPC today, add it and update
    lib/ghg/verifierWhitelist.test.ts.
  - **lib/assurancePdf.ts:**
    - cover 139 and methods table 259 show the label and a "Reporting period" row;
    - document ref 117 and filename 386 use `fileTag`.
  - **app/dashboard/scope3/page.tsx:**
    - **Scope 3 gets the year end from the linked GHG inventory.** `scope3_inventories` has no year columns;
      it joins `ghg_inventories` on `inventory_id`.
      - The bind query that sets the state at 1515-1521 also selects `fiscal_year_end_month` and keeps it in
        state.
      - The inventory list query at 1576 selects it too, so the picker at 4473 can label each entry.
    - Labels at 2968 (CSV row, plus "Reporting period"), 3041 (filename, `fileTag`), 3126, 3147, 4180 and
      4383.
  - **app/api/scope3/spend-factor/route.ts and lib/emissionFactors/spendResolver.server.ts:**
    - The request carries the window's start and end dates as well as the year. Validate them beside the year
      check at route.ts:320.
    - `price_year_mismatch` (spendResolver.server.ts:259) becomes "the window is not wholly inside the price
      year", replacing "price year ≠ reporting_year".
    - The disclosure at route.ts:708-712 states the window dates. Proposed: "Your reporting year runs from
      {start} to {end}, but this edition's price data ends at {pv}. Spend is treated as being at {pv} prices,
      so price changes after {pv} are not reflected."
  - **SB 253 banner, app/dashboard/ghg/page.tsx:2894.**
    - **Today's test is wrong, not just imprecise.** `sb253FirstYear = sb253Only && year <= 2024` shows the
      banner for 2024 and earlier. Under §96076(c), the first report covers a 2025 inventory, or a January
      2026 one, and for those the banner does not show.
    - **Replacement:** a window is the first-report year when its end date is after 1 February 2025 and on or
      before 1 February 2026.
      - Constants in lib/sb253.ts: `SB253_FIRST_REPORT_WINDOW_END_AFTER = '2025-02-01'` and
        `SB253_FIRST_REPORT_WINDOW_END_ON_OR_BEFORE = '2026-02-01'`.
      - Every window in the app ends on a month end. So this means a January year end in reporting year 2026,
        or any other year end in reporting year 2025.
    - **Status handling, as `SB253_DATE_STATUS`:**
      - The constants carry `SB253_FIRST_REPORT_WINDOW_STATUS = 'proposed'` until OAL approves.
      - The banner names that posture, for example "(proposed regulation, not yet final)".
      - Promoting it to 'final' needs the OAL approval date recorded beside it.
    - ⚑ **Optional election, §96076(c)(2).** An entity whose year ends after 1 February may instead report
      its most recent preceding year where the data is available. A window ending after 1 February 2026 can
      therefore also be a first report, by choice. **Confirmed (section 10):** for those windows, a second
      banner variant reading "If you choose to file this year as your first SB 253 report, Scope 3 isn't
      required in it." It carries the same 'proposed' status. It shows only for a window ending after
      1 February 2026 and on or before the first-report date in `SB253_FIRST_REPORT_DATE`.
    - **Citation for the code comment**, all from CARB's rulemaking page
      (https://ww2.arb.ca.gov/rulemaking/2025/california-corporate-greenhouse-gas-reporting-and-climate-related-financial-risk):

      | Source and section | Quote (verbatim, under 15 words) |
      |---|---|
      | Final Regulation Order, September 2026, §96076(c)(1) [1] | "If the reporting entity’s fiscal year ends on or before February 1" |
      | Same, (c)(1), continued | "the fiscal year ending in the current calendar year" |
      | Same, (c)(2) | "the fiscal year ending in the previous calendar year" |
      | Same, (c)(2), option | "their most recent preceding fiscal year" ... "where that data is available" |
      | Same, §96076(a) | "on or before November 10, 2026" |
      | Same, §96076(a) | "Scope 3 emissions reporting is not required for 2026 reporting." |
      | Board-approved order, February 2026, §96076(b)(1) [2] | "ends on or before February 1 in a calendar year" (same cutoff; deadline "August 10, 2026") |
      | 15-Day Proposed Regulation Text, Appendix A-1, July 2026, §96076(c) [3] | the same cutoff; the deadline struck from August to November 10 |
      | Executive Order R-26-006 [4] | sections 96070 to 96077 "are adopted as set forth in the “Final Regulation Order”" |
      | Same | "Executed this 18th day of September, 2026" (the file is named "signed 9.21.26") |
      | Rulemaking page | "The Final Package was resubmitted to OAL on September 21, 2026." |
      | Rulemaking page, Final Approval / OAL Action | "This stage has not yet been reached." |

      The documents:
      - [1] https://ww2.arb.ca.gov/sites/default/files/barcu/regact/2026/sb%20253-261/Final%20Regulation%20Order_Final.pdf
      - [2] https://ww2.arb.ca.gov/sites/default/files/barcu/regact/2026/sb%20253-261/final%20regulation%20order_draft.pdf
      - [3] https://ww2.arb.ca.gov/sites/default/files/barcu/regact/2026/sb%20253-261/15-Day%20Change%20Reg%20Text%20SB%20253-261.pdf
      - [4] https://ww2.arb.ca.gov/sites/default/files/barcu/regact/2026/sb%20253-261/24.%20Executive%20Order_cs%20signed%209.21.26.pdf

      All fetched 2 Oct 2026. The 1 February cutoff is identical in the 45-day proposed text (December 2025),
      the February order, the 15-day text and the September order. Only the deadline moved.
  - **Tests:** lib/ghg/engine.test.ts (helper forms), page and route tests, and lib/ghg/verifierWhitelist.test.ts
    if the projection changes.
- **Out of scope, with reasons:**
  - Audit-diff labels (page.tsx:3721, verify 300, assurancePdf.ts:70) show stored values verbatim, which is
    what an audit trail should do.
  - "FY" meaning something else (the EU deadline at engine.ts:1536, Australia's "FY basis" at 1206, the bot
    prompt) is not a reporting-year label.
  - Monthly calendar-year stamping is handled by T6 and T12. Factor years are handled by T3c.
- **SQL:** none, unless the verifier projection lacks `fiscal_year_end_month`. Then the RPC change is part of
  this task, and its migration is parsed offline before Lisa runs it.
- **Tests:**
  - **Helper:** `heading`, `axis` and `fileTag` for December, March, June, September and a leap-year
    February end. No form contains "YE" or "FY".
  - **December is unchanged:** every surface reads "2025" or "reporting year 2025" as today.
  - **March year end:** menus, tiles and headings show "Apr 2024 to Mar 2025", chart axes "2024–25",
    filenames "2024-04_to_2025-03", running text "the year ending 31 March 2025". The field hint names
    1 April 2024 to 31 March 2025.
  - **CSVs** (GHG framework, CDP, Scope 3) carry the "Reporting period" and "Year end" rows.
  - **Scope 3:**
    - a bound inventory with a March year end gets that year end;
    - `price_year_mismatch` is true for a 1 Apr 2024 to 31 Mar 2025 window with price year 2024, and false
      for a calendar 2024 window with price year 2024;
    - the disclosure names the window dates.
  - **SB 253:**
    - The banner shows for reporting year 2025 at every year end from February to December, and for a
      January year end in reporting year 2026.
    - It does not show for reporting year 2024, nor for a January 2025 year end.
    - It names the 'proposed' status.
    - The optional-election variant shows for a window ending after 1 February 2026 (for example a March 2026
      year end), with the confirmed wording.
    - A test pins the two constants to the cited §96076(c) dates.
  - **Source guard, extending T3a's:** in each file listed above, no `FY${`, no "YE ", no `reporting year ${`
    and no rendered `${...reporting_year}` interpolation outside the helper. The EU deadline string
    "FY2024 (large EU companies)" (engine.ts:1536) is allowlisted as a regulatory deadline, not a
    reporting-year label. It stays (ruling, section 10). An allowlist covers code uses: filters,
    keys and comparisons.
  - No em dash in any new string.
- **Done:**
  - No customer-facing surface in F-12 prints a bare year or "FY" for a non-December year without the year end.
  - December-year-end surfaces read exactly as before.
  - Scope 3 knows the year end and discloses price years against the window.
  - The SB 253 banner is decided from the window end against the cited §96076(c) dates, with 'proposed' status.
  - The source guard covers every file.
  - `npm run build` passes.

### T3c. Engine: factor edition selection by rule, no year substitution
**Branch:** `factor-years`, created from main after derived-figures merges (sequencing ruling, section 10).
Rulings: docs/review/factor-year-selection.md, section 8. Depends on T3a (`reportingYearLabel`), which
supplies every year label below. Follows T3b on the same branch.

- **Files:**
  - **lib/ghg/factorEditionRegistry.ts (new, pure).** One entry per edition of every year-keyed dataset:
    `{ dataset, edition, class: 'a' | 'b', dataYear?, activityPeriod?, published: { date, source },
    corrections: [{ date, source, note }], held }`.
    - `source` is the URL of the publication's own page or release notes.
    - An entry with no `published.date` is never selected (ruling of 1 Oct 2026, first set).
    - Seeded with the dates recorded in factor-year-selection.md sections 4 and 8: DESNZ 2022 to 2026,
      eGRID2021 to 2023 with eGRID2023 revisions 1 and 2, AIB 2024 and 2025, Green-e by edition. Each date
      not yet verified verbatim is marked as such.
  - **`selectEdition(dataset, window, reportingYear, frozen?)`** in the same file returns either
    `{ edition, rule, basis }` or `{ missing: { dataset, edition, rule, basis } }`. The rules:
    - **Class (a), DESNZ:**
      - calendar year: edition Y;
      - April to March: majority (DESNZ's own approach);
      - July to June: the newest edition first published on or before the window's last day;
      - any other year end: the majority fallback (flag D3).
    - **Class (a), others:** the majority rule, ties to the year the window ends. NGA counts its activity
      years, 1 Jul N to 30 Jun N+1 (section 8.2).
    - **Class (b):**
      - if an edition exists whose data year matches, use it;
      - otherwise, the newest edition published on or before the preparation date;
      - a frozen selection is returned unchanged.
      - "Matches" means the data year equals the window's **majority year** (ruling, section 10).
    - **Values come from the edition's latest correction** (ruling D2). The registry records which
      correction the held values reflect.
  - **lib/ghg/engine.ts:**
    - `getGridFactor` (1120-1135), `getResidualFactor` (1170-1238) and `nzTdLoss` (993-1006) take the
      selected edition, not `year`.
    - **Nearest-year substitution is removed:** the `y <= year` loops at 1128-1130, 1180, 1200, 1214 and 995,
      and the forward move to `years[0]`.
    - `GRID_EF`, `RESIDUAL_*` and `NZ_TD_LOSS` are keyed by edition, per section 8.3. The ECCC re-key waits for
      T3d; until then ECCC keeps its keys, mapped in the registry.
    - Combustion (`EF_UK`, `EF_AU`, `EF_NZ`, `EF`) and steam gain an edition key, holding today's single
      edition. A required edition that is not held is then missing, not silently priced by the held one.
    - `calcLocation`, `calcInventory`, `fuelEmissionsByType`, `pctEstimated`, `publishersForLocation`,
      `findUnpriceableLocations` and `buildWorkings` take the window (or `fiscal_year_end_month`) alongside the
      year. `publishersForLocation` currently calls `buildWorkings` without the fiscal month (2521).
    - **Unpriced line:** a missing edition throws `MissingEditionError`. The line is left unpriced: excluded
      from every total, not counted as zero, and the location's other lines are still priced.
      - Its workings row carries the message and `result_tco2e: null`.
      - A new coverage issue, status `edition_missing`, blocks export.
      - Message when the edition is published but not loaded: "{Publisher} {edition} {family} factors are
        needed for {reportingYearLabel inText} and are not loaded, so this line is not counted. Export is
        blocked until they are loaded."
      - Message when the edition is not published (ruling, section 10): "The {publisher} {family} factors for
        {year} have not been published yet, so this line is not counted. Export is blocked until they are
        published and loaded."
      - IPCC 2006 defaults are exempt: never missing, disclosed as fixed defaults.
      - This is a line-level path. The existing location-level factor-gap path (`MissingEmissionFactorError`,
        GROUP L) is unchanged.
    - **Workings rows** for every factor carry `factor_edition`, `selection_rule`, `selection_basis`,
      `edition_published`, `edition_corrected` and, for class (b), `selected_on`.
      - `factor_vintage` becomes the selected edition's label.
      - The notes at 1003-1004, 1133-1134 and 1148-1149 ("applied to {year} inventory (latest|earliest vintage
        held)") are replaced by the selection basis (wording below). No note can say "vintage held" again,
        because substitution no longer happens.
  - **lib/ghg/factorEditions.ts:** `buildFactorEditions` (223, call at 288) records the selected edition
    label, not `usedYear`. `factorEditionsForSave` keeps its fallback.
  - **lib/ghg/monthlyEmissions.ts:217:** receives the selection from the engine, not its own
    `getGridFactor(region, reportingYear)` call, so the monthly series and the annual figure use one edition.
  - **lib/ghg/loadSeries.ts:133:** passes the inventory's year and window (today it defaults to 2024).
  - **app/dashboard/ghg/page.tsx:**
    - Pass `inventory.fiscal_year_end_month` at the call sites in factor-year-selection.md section 6: 1348,
      1370, 1430, 1634, 1647, 1656, 1676-1679, 2068, 2668, 2676, 3089, 3163, 3195.
    - Replace the hard-coded edition labels at 2271-2278 and the grid display at 2022, 2283-2284 with the
      selection.
    - Write the class (b) selection to the new column on first save, and read it back on every later save.
    - Render the `edition_missing` issue in the export gate list.
  - **app/methodology/page.tsx** 67, 71: the disclosure paragraph below.
  - **app/verify/[token]/page.tsx and lib/assurancePdf.ts:**
    - render the new workings fields: edition, rule, basis, dates;
    - lib/ghg/verifierWhitelist.test.ts, if a new field crosses the RPC;
    - the PDF methods table (assurancePdf.ts:259) gains the window and the factor-year rule.
  - **lib/ghg/engine.test.ts, lib/ghg/factorEditionRegistry.test.ts (new).**
  - **CLAUDE.md:** proposed invariant wording (Lisa applies): "Factor editions are chosen by
    `selectEdition` from the reporting window and the registry. No selector takes a bare year and none
    substitutes a different year. A missing edition is an unpriced line with an export-blocking issue."
- **SQL:** `supabase/migrations/2026MMDD_ghg_factor_selection.sql` adds
  `ghg_inventories.factor_selection jsonb not null default '{}'`.
  - It holds the frozen class (b) selections as `{dataset: {edition, data_year, rule, selected_on}}`.
  - It is a separate column because `factor_editions` is recomputed on every save ("a non-empty recompute
    always wins", factorEditions.ts:340). A frozen selection cannot live in a value that is rewritten.
  - No RLS change. No new GRANT: table privileges cover a new column. The header records a pre-check that
    `information_schema.column_privileges` shows no column-level grants on `ghg_inventories`.
  - Parse offline before Lisa runs it.
  - Pre-launch (section 4): there are no customer inventories, so every inventory's class (b) selection is
    made on its first save after T3c, dated that day.
- **Tests:**
  - **Majority rule:** December, March, June and September year ends for 2024, 2025 and 2026, including a leap
    year. The tie rule is unit-tested on a synthetic window, since no month-end window can tie.
  - **DESNZ:**
    - March 2025 selects 2024;
    - June 2024 selects 2023 (the 2024 edition was first published 8 Jul 2024);
    - June 2025 selects 2025;
    - September uses the fallback;
    - an edition with no recorded date is never selected.
  - **NGA:** each year end maps per section 8.2.
  - **Class (b):**
    - the data-year match uses the majority year: March 2025 matches data year 2024;
    - a data-year match is used when registered;
    - otherwise the newest published on or before the preparation date;
    - a frozen selection survives a re-save after a newer edition is registered;
    - `selected_on` is recorded.
  - **Corrections:** values come from the latest correction, and publication and correction dates appear in
    workings.
  - **No substitution:**
    - Source test: no `<= year` selection loop, and no `years[0]` fallback, in any selector.
    - Property test: for every dataset × window, the edition used is the rule's edition, or the line is
      unpriced. It is never another held edition.
  - **Unpriced line:**
    - excluded, not counted as zero;
    - the location's other lines are still priced;
    - the `edition_missing` issue blocks export;
    - the message names the publisher, the edition, the family and the year label, with no em dash;
    - an unpublished edition gives the "not been published yet" message, not the "not loaded" one;
    - IPCC 2006 defaults are never reported missing.
  - **Single source:** monthly and annual figures use the same edition (both read the selection).
  - **Records:** `factor_editions` records the selected edition label, and `sameFactorEditions` still
    detects a change between years.
  - **Methodology page:** source test for the disclosure paragraph.
  - Engine test count only goes up.
- **F-06: factor editions in the year-on-year disclosure** (ruling of 2 Oct 2026, section 10; finding F-06 in
  docs/review/ghg-findings.md; ISO 14064-3 cl. 6.3.1.5 as cited in the ruling).
  - **Today:**
    - The comparability module has no edition observation (`ObservationKind`, lib/ghg/comparability.ts:103-111).
    - `FACTOR_EDITION_DISCLOSURE` (lib/ghg/factorEditions.ts:444) is read only by the trends page.
    - The CSV and the PDF carry no comparability record. The verifier page shows the record
      (app/verify/[token]/page.tsx:765-843) and this year's editions (859-929), but no comparison.
  - **lib/ghg/comparability.ts:** a new observation kind, `factor_edition`. For every dataset whose selected
    edition differs between the compared years, it records:
    - `{ dataset, publisher, priorEdition, currentEdition, effect_tco2e, effect_basis }`.
    - **Effect:** this year's activity priced at the prior year's edition, minus the same activity at this
      year's edition, per dataset and summed by scope. It isolates the part of the year-on-year change that
      comes from the factors alone.
    - It is computed only from editions T3c's registry marks held. If the prior edition is not held,
      `effect_tco2e` is null and `effect_basis` says so: "The 2024 DESNZ factors are not loaded, so the
      effect of the change could not be calculated." The change itself is still named.
    - A prior year with no recorded `factor_editions` gives one observation saying the comparison could not
      be made, and why.
  - **The disclosure travels with the record** (`comparability_disclosure`) to all four surfaces:
    - the export screen;
    - the CSV / XLSX (`generateExport`, page.tsx:3101-3215): a "Comparability with {prior year label}" block;
    - the verifier page, inside the existing comparability section;
    - the assurance PDF (lib/assurancePdf.ts): a comparability section.
    `FACTOR_EDITION_DISCLOSURE` is printed with it on each surface.
  - **Wording** (plain, no em dash; year labels from `reportingYearLabel`):
    - "Emission factors changed between {prior label} and {current label}: {publisher} {dataset} {prior
      edition} to {current edition}. Pricing this year's activity at last year's factors would give {x}
      tCO2e {more or less} in Scope {n}."
    - Where the effect is null: "... The effect could not be calculated because {reason}."
  - **app/climate-ghg/page.tsx:305:** the FAQ sentence "including which factor editions were applied" becomes
    true. Re-read it against the built disclosure, and correct it if it still claims more.
  - **Tests:**
    - two inventories whose DESNZ grid edition differs give one `factor_edition` observation, with the effect
      equal to activity × (prior factor − current factor);
    - the same edition in both years gives no observation;
    - a prior edition not held gives a null effect with the reason;
    - the observation appears in the CSV, the verifier page and the PDF (fixture tests on each builder);
    - lib/ghg/verifierWhitelist.test.ts covers any new field.
- **Done:**
  - Every year-keyed factor is chosen by `selectEdition` from the window, and no code path substitutes a year.
  - (F-06) Every surface that carries the year-on-year comparison names each factor edition that changed and
    its effect, or says why the effect could not be calculated.
  - Every workings row names its edition, rule, basis, and publication and correction dates, plus the
    selection date for class (b).
  - A required edition that is not held leaves its line unpriced, with the message and an export-blocking issue.
  - The methodology page states the rule.
  - `npm run build` passes.
  - **Expected consequence:** some inventories that price today will block, because of editions not yet held
    (factor-year-selection.md section 8.4). T3d clears those.
- **Disclosure text** (drafts; year labels from `reportingYearLabel`):
  - **Methodology page:**
    > Each emission factor comes from the edition its publisher directs for the reporting year. For UK
    > (DESNZ) factors we follow DESNZ's guidance: a year ending in March uses the factors for the calendar
    > year in which it starts, and a year ending in June uses the newest factors published on or before its
    > last day. For other annual factor sets, we use the edition for the year that contains most of the
    > reporting year. For data published some years after the period it describes (eGRID, Green-e, AIB,
    > EEA, ECCC grid intensities), we use the edition for the reporting year where one exists, and otherwise
    > the newest edition published when the inventory was first prepared; that choice is fixed in the saved
    > inventory with its date. We never substitute another year's factors: if a required edition is not yet
    > available, the affected line is not counted and the inventory cannot be exported until it is.
  - **Workings notes:**
    - Majority: "2024 factors: 2024 contains 275 of the 365 days in the year ending 31 March 2025."
    - DESNZ March: "DESNZ 2024 factors for the year ending 31 March 2025, following DESNZ guidance for April
      to March years."
    - DESNZ June: "DESNZ 2025 factors (published 10 June 2025), the newest published by 30 June 2025,
      following DESNZ guidance for July to June years."
    - Class (b), data-year match: "eGRID2024: data year 2024 matches reporting year 2024."
    - Class (b), newest available: "eGRID2023 (released 15 January 2025, revision 2 of 12 June 2025): the
      newest edition when this inventory was first prepared on 1 October 2026; no 2025 data year was
      published."
    - Correction: "Values as corrected on 31 July 2026."

### T3d. Factors: load the editions the rules require
- **Branch:** `factor-years`.
- **Depends on:** T3c (registry and edition keys).
- **Order:** editions for reporting year 2025 first, then 2024, then 2026 (sequencing ruling). Each year is its
  own reviewable diff.
- **Scope:** every edition marked "to load" in factor-year-selection.md section 8.4, plus the T3c items marked
  for research:
  - EEA's data-year series;
  - ECCC NIR Part 3 Annex 13, for the data-year re-key (flag C2);
  - MfE T&D 2024;
  - identifying which EPA Hub edition the held US combustion values come from (engine.ts:65-71).
- **Files:**
  - **lib/ghg/factors/{publisher}-{edition}.ts (new, one file per edition).** Values transcribed from the
    primary source. Every value carries a citation: document, table, row and column, and the correction
    it reflects.
  - **lib/ghg/engine.ts:** the edition-keyed tables import from these files.
  - **lib/ghg/factorEditionRegistry.ts:** `held: true`, with publication and correction dates.
  - **app/methodology/page.tsx and `EF_SOURCES`:** citations for the new editions.
- **SQL:** none.
- **Tests:**
  - every value carries a citation;
  - spot values per edition against the source, at least one per table;
  - the held DESNZ 2026 values reflect the 31 Jul 2026 correction;
  - each section 8.4 case that blocked under T3c now prices with the required edition and no
    `edition_missing` issue;
  - every edition marked held has a recorded publication date.
- **Done:** every edition the rules require for 2024 to 2026 at the four year ends is held and cited, or is
  recorded as not yet published. No `edition_missing` issue remains except for editions not yet published.
  `npm run build` passes.

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
  - **No bill-backed quantities from `locations_data` (T7 consequence).** Since T7, `locations_data` is saved
    raw: a document-backed field holds only what was typed (usually 0), and the figure lives in `workings`.
    The shared projection (`public.ghg_verifier_projection`, used by `get_verifier_inventory` and by the
    snapshot) must therefore stop returning the document-backed quantity keys from each `locations_data`
    element: `electricity_kwh`, `renewable_electricity_kwh`, `natural_gas_amount`, `propane_amount`,
    `diesel_stationary_amount`, `diesel_mobile_amount` and `gasoline_amount` (the fields `fieldFor` maps
    documents to). For example, rebuild the array with `jsonb_agg(elem - array[...])`. A verifier reads every
    figure from `workings`; the verifier page already does, and uses `locations_data` only for names and
    document paths. Typed-only figures (steam, refrigerants, fuel oil, biogenic) are also in `workings`.
- **Tests:** snapshot reused on an unchanged projection; new `version_no` on change; pinned link keeps the old
  snapshot after a re-save; `newer_version_exists` true after a re-save; whitelist test covers the snapshot keys.
  - **Projection carries no bill-backed quantity:** for an inventory whose figures come from bills, neither the
    live projection nor a snapshot carries any of the seven keys above in any `locations_data` element, while
    `name`, `country` and `source_docs` are still present. The whitelist test (lib/ghg/verifierWhitelist.test.ts)
    asserts the seven keys are excluded, and a page test asserts the verifier page reads no quantity from
    `locations_data`.
- **Done:** a verifier link always shows the version it was issued against, and says when a newer one exists.

### T17. Assurance PDF: workings page, document index status, stored residual table
- **Classification:** core pre-launch work (ruling of 2 Oct 2026, section 10; ISO 14064-3 cl. 6.1.3.2 data
  trail and cl. 5.1.7 documented information, as cited in the ruling). It was listed with T14 to T16 as
  post-core work.
- **Also renders** (T18): in the document index, withdrawn documents (who, when, reason) and tombstones of deleted
  documents (file, SHA-256 if known, who, when, reason); in the workings page, each reading's confirmation and
  corrections.
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

### T18. Who and when on every review action; document withdrawal and deletion
- **Status:** in scope (rulings of 2 Oct 2026, section 10: "T18" rows). Core pre-launch work, with T11 and T17.
- **Estimate:** L, 4 diffs, 5 to 7 days:
  1. proposal records: confirm, edit figure and flag, carried onto contributions;
  2. the document lifecycle: withdraw, restore, delete with tombstone, and free deletion of unused uploads;
  3. typed-figure entries, and who on the coverage resolutions;
  4. page wiring, the evidence list and the on-screen workings.
  The verifier page and PDF rendering of these records is in T11 and T17.
- **Gaps closed** (report in section 10, "Review actions: who and when"): Confirm, Edit figure and Flag for
  review recorded no who or when; Edit figure overwrote the read value; date confirmations and override removals
  did not reach the workings; three coverage resolutions recorded no who; removing a document left no record;
  typed figures recorded no who or when.

**A. Proposal records** (rulings 2, 3, 6)
- **lib/ghg/proposalEdits.ts** (pure, no clock):
  - **`confirmProposal(p, { by, at })`** sets `status: 'confirmed'` and records `confirmation: { at, by,
    reading: { value, unit, rawValue, rawUnit, periodStart, periodEnd, sourceQuote } }`, the exact reading
    shown when accepted. It goes through `guardConfirm`. A later Undo or re-confirmation appends rather than
    overwrites (`confirmations[]`).
  - **`editFigure(p, { value, by, at })`**:
    - keeps the read value the first time, extending `asRead` with `value` and `rawValue` (engine.ts:1620);
    - appends `{ fields: ['value'], at, by }` to `corrections`, as date and unit corrections do;
    - confirms through `confirmProposal`.
  - **`flagProposal(p, { by, at })`** sets `needs_manual_review` and appends `{ action: 'flagged', at, by,
    statusBefore }` to `statusLog`. (Ruling 6 asked for this to move from T13 into T18. Flag was never on T13's
    list: T13's addition was "Accept all". It is recorded here only.)
- **lib/ghg/engine.ts:**
  - `ExtractedProposal` gains `confirmations`. `asRead` gains `value` and `rawValue`. `corrections.fields`
    gains `'value'`. `statusLog.action` gains `'flagged'`, `'withdrawn'` and `'restored'` (part B).
  - `BillContribution` (3230-3256) gains `confirmations`, `periodConfirmedAt` and `periodConfirmedBy`, set in
    `billContributions` (3395-3411) beside `asRead`, `corrections` and `statusLog`.
  - `buildWorkings` adds the field's `manual_overrides_removed` entries (lib/ghg/overrides.ts:36) to its row.
- **app/dashboard/ghg/page.tsx:** Confirm (3598-3600), Edit figure Save (3584) and Flag for review (3607) call
  these builders with `currentUser`, and are disabled without one, as Reject is (3608).
  - The review shows "Confirmed by {email} on {date}."
  - It shows "Read as {value} {unit}; changed by {email} on {date}." beside the date and unit lines from T9
    (ProposalEdits.tsx `ProposalNotes`).
- The T13 "Accept all" record, if ever built, is `confirmProposal` applied per bill.

**B. Documents: withdraw, restore, delete** (ruling 1)
- **Which action a document offers:**
  - **Any reading confirmed or rejected** (status `confirmed` or `rejected`, or a `confirmations` entry): it
    cannot be deleted. "Remove" becomes **"Withdraw"**.
  - **No reading acted on yet** (extraction pending or failed, or every reading still `extracted` or
    `needs_manual_review` with no confirmation): **"Delete"**, free, logged.
    - ⚑ Reading of the ruling: a reading the customer only flagged counts as not acted on. Confirm or correct.
  - **"Delete permanently"** is available on any document, behind a required reason. It is for a file uploaded
    in error, or one holding information that must not be kept.
- **Withdraw:**
  - Requires a reason. The file stays in storage and the document and its readings stay on the location.
  - The SourceDoc gets `withdrawn: { at, by, reason }`, and `document_log` gets `{ kind: 'withdrawn', docId,
    file, at, by, reason }`.
  - Every reading of a withdrawn document contributes with the new reason **`withdrawn`** (not counted), carrying
    the withdrawal record.
  - **No silent zero (T3 ruling).** For the all-rejected check, a withdrawn reading counts as rejected. A field
    whose documents are all withdrawn or rejected, with no figure entered, raises the existing export-blocking
    issue.
- **Restore** (undo a withdrawal):
  - Requires a reason, recorded the same way: `{ kind: 'restored', ... }`.
  - The readings return to the statuses they had. A bill confirmed on month-only dates never confirmed returns
    to "To confirm", as Undo does (T9).
- **Delete permanently:**
  - Requires a reason. It deletes the storage file, the document and its readings.
  - It appends a **tombstone** to `document_log`: `{ kind: 'deleted', file, sha256 (if known, from T15; null
    otherwise), at, by, reason }`.
  - The tombstone carries no readings and no source quote, because the point of the delete may be that they
    must not be kept.
- **Delete (unused):** deletes the file and the document, and appends `{ kind: 'deleted_unused', file, sha256 if
  known, at, by }`.
  - ⚑ Design choice, not ruled: this entry is shown in the evidence list and the saved workings like the other
    entries, so a verifier sees every upload that existed. Strike if not wanted.
- **The log cannot be rewritten by a save.**
  - `document_log` lives on the location in `locations_data`.
  - The save path (lib/ghg/savePayload.ts) refuses a payload whose `document_log` is not a superset of the one
    loaded, and never drops an entry.
  - The audit trigger on `ghg_inventories` records each save. ⚑ Its definition is not in `supabase/migrations/`
    (only the CBAM triggers are, 20260726_cbam_audit_triggers.sql). Confirm it exists before relying on it.
- **⚑ Open, needs a decision: what a privacy delete cannot reach.**
  - `audit_log` stores `to_jsonb(old)` of every changed row (20260910_erasure_log.sql header). Earlier saves of
    the inventory, including the deleted document's readings and source quotes, therefore remain in
    `audit_log`. That table cannot be edited by any signed-in account (lib/auditTrailNotice.ts), and the only
    removal path today is the account-level erasure script.
  - Options:
    - (a) say so in the delete confirmation and in the tombstone, and handle a request to purge history through
      a service-role process outside the app;
    - (b) build a document-level purge of `audit_log` snapshots. That needs SQL and a decision on what an audit
      trail may lose.
  - Until ruled, the confirmation text states what is and is not removed.
- **Where it shows:**
  - the evidence list on each location ("Withdrawn by {email} on {date}: {reason}", "Restored by ...", "{file}
    was deleted by {email} on {date}: {reason}");
  - the saved workings: a document-event row per log entry, beside the coverage-resolution rows (engine.ts
    4055-4070), plus the `withdrawn` contributions on field rows;
  - the verifier page (T11) and the PDF document index (T17).
- **Messages** (plain, no em dash):
  - **Withdraw:** "Withdraw {file}? It stays on file as evidence but is no longer counted. Give a reason."
  - **Delete permanently:** "Delete {file} permanently? The file and what was read from it are removed from
    this inventory. A record that it existed, who deleted it, when and why is kept. Earlier saved versions in
    the audit trail still contain what was read from it. Give a reason."
  - **Delete, unused:** "Delete {file}? Nothing from it has been used."

**C. Typed figures and coverage resolutions** (rulings 4, 5)
- **Typed figures:**
  - Every field the customer types, on a location with no documents for that field, gets an entry in
    `typed_entries: [{ field, value, unit, at, by }]` on the location.
  - Written by the save path for each typed field whose value differs from the last saved record, with the
    saving user and time. It is one entry per change per save, not per keystroke.
  - The workings row for a typed figure carries the latest entry as `entered_by` and `entered_at`, plus the
    history.
  - The same mechanism records the typed figure under a manual override (T10), alongside its reason.
- **lib/ghg/coverageActions.ts** (44-82): `sameBillResolution`, `differentMetersResolution` and
  `estimateResolution` take `by: { userId, email }` as `usedNoneResolution` does (92-100). Their notes end
  "Recorded by {email} on {date}."
  - The coverage-resolution workings row (engine.ts:4069) carries `resolved_by`.
  - A stored resolution without `by` still validates, and shows "Who: not recorded" (pre-launch, section 4).
- `labelMeter` (page.tsx:1282-1291) passes `by` through to the different-meters resolution.

- **Files:**
  - lib/ghg/proposalEdits.ts;
  - lib/ghg/engine.ts (types, contributions, the `withdrawn` reason, document-event and typed-entry rows,
    override removals on rows);
  - lib/ghg/coverageActions.ts;
  - lib/ghg/documentActions.ts (new, pure: `withdrawDocument`, `restoreDocument`, `deleteDocument`,
    `documentActionsFor`);
  - lib/ghg/savePayload.ts (`typed_entries`, the append-only `document_log` guard);
  - app/dashboard/ghg/page.tsx (review buttons, `removeDoc` 1176-1190 split into the three actions, the evidence
    list);
  - app/dashboard/ghg/_components/ProposalEdits.tsx (notes);
  - lib/ghg/verifierWhitelist.test.ts.
  - **CLAUDE.md** (Lisa applies): "Every review action records who and when, and reaches the saved workings. A
    document with a confirmed or rejected reading is withdrawn, never deleted, unless deleted permanently with a
    reason, which leaves a tombstone."
- **SQL:** none (`locations_data`, `coverage_resolutions` and `workings` are jsonb). Option (b) above would need
  SQL.
- **Tests:**
  - **Property test** over every action (confirm, edit figure, edit dates, confirm dates, edit unit, flag,
    reject, undo, withdraw, restore, delete permanently, delete unused, override, remove override, typed entry,
    each coverage resolution): the saved workings carry its who and when.
  - **Confirm** records the exact reading, including `sourceQuote`. A second confirmation after Undo appends.
  - **Edit figure:** `asRead.value` is the read value, the correction has `fields: ['value']`, and the workings
    show both values.
  - **Flag** appends `flagged` with `statusBefore`.
  - **Document actions:**
    - a document with a confirmed reading offers Withdraw and Delete permanently, never Delete;
    - one with only pending readings offers Delete;
    - withdrawing requires a reason and stops its readings counting with reason `withdrawn`;
    - restoring returns their statuses, with the R5 exception;
    - every withdrawn or rejected document on a field with no figure blocks export.
  - **Tombstone:** after Delete permanently, the document and readings are gone and the tombstone (file,
    sha256 or null, who, when, reason) is in the saved workings. It holds no reading or source quote.
  - **Append-only:** a save payload missing a `document_log` entry that the loaded record had is refused.
  - **Typed entries:** changing a typed figure and saving appends one entry. Saving unchanged appends none.
  - **Resolutions:** same bill, different meters and estimate carry `by`. A legacy resolution without `by`
    shows "not recorded".
  - The verifier whitelist covers the new fields.
  - Messages carry no em dash.
  - Engine test count only goes up.
- **Done:**
  - Every action that changes what is counted, or how, is in the saved workings with who and when.
  - No document with an acted-on reading can disappear without a tombstone.
  - The AI's reading is never lost when a figure is edited.

### Bill Review human reading (BR1 to BR11)

**Context** (3 Oct 2026). The Concierge add-on is being renamed Bill Review. The rename belongs to the pricing
change, not to these tasks. Today Bill Review prefills each reading with AI extraction
(app/api/concierge/extract/route.ts) and the customer confirms it. Customers without Bill Review get no AI reading.
These tasks add a second way of reading: a ThemisIQ specialist.

Rulings: section 10, "BR". Code facts below are at `4d7b7fc`.

**What the code does today, and why it matters for the guarantee:**
- **The extract route is told nothing about the inventory.** It receives `filePath`, `mediaType` and
  `locationName` (app/dashboard/ghg/page.tsx:1089).
- **Nothing ties a stored document to an inventory server-side.** Uploads are stored at
  `{userId}/{reporting_year}/{location name}/{timestamp}_{file}` (page.tsx:1062).
- **A document can be uploaded before the inventory is first saved** (`inventoryId` may be null).
- So "never sent to the AI" cannot be enforced by the route as things stand. BR2 changes the upload path so the
  route can establish the inventory itself, from the stored path, instead of trusting the browser.
- **Unused tables built for a reviewer workflow already exist:** `concierge_jobs`, `concierge_job_documents` and
  `concierge_proposals` (supabase/migrations/20260910_concierge_review_schema.sql:97-240), with a `reviewer`
  column. No application code writes them (pricing-addons-audit.md, A.4). Whether to reuse them or start clean is
  open question Q3.

**Dependencies:** T18 (who and when on every action; the confirmation record) and the pricing change that renames
Concierge to Bill Review. BR9 also needs T11 and T17, which render provenance on the verifier page and the PDF.

#### BR1. Reading choice on the inventory, and the human-reading price (data and constants)
- **Estimate:** S to M, 1 diff, 1 day.
- **SQL** (NOT RUN; `supabase/migrations/2026MMDD_bill_review_reading.sql`, parsed offline before Lisa runs it):
  ```sql
  -- NOT RUN
  alter table public.ghg_inventories
    add column if not exists bill_review_reading text not null default 'ai'
      check (bill_review_reading in ('ai', 'human')),
    add column if not exists bill_review_reading_set_by uuid references auth.users(id),
    add column if not exists bill_review_reading_set_at timestamptz;
  comment on column public.ghg_inventories.bill_review_reading is
    'Bill Review: how this inventory''s bills are read. ai = AI reads, customer confirms (default); human = a ThemisIQ specialist reads, customer confirms, and no document is ever sent to the AI. A change applies to later uploads only.';
  ```
  - No new table, so no GRANT. The audit trigger on `ghg_inventories` (`audit_ghg_inventories`) records every change
    of the column, with old and new values.
  - Pre-flight: `information_schema.column_privileges` shows no column-level grants on `ghg_inventories`.
- **lib/pricing.ts** (corrected ruling, section 10 "BR: price"): the prices are defined by the pricing patch
  (docs/review/patches/pricing-2026-10.patch).
  - `BILL_REVIEW_ONBOARDING_USD` holds the onboarding price per GHG tier and reading: AI-read Small $900, Medium
    $1,800, Large $3,500; human-read Small $1,200, Medium $2,200, Large $4,200; Enterprise quote.
  - `BILL_REVIEW_SOURCE_USD = 45` is the per-source fee, the same for both readings.
  - `billReviewQuote` takes `reading: 'ai' | 'human'`. BR1 adds no price of its own; it relies on these constants.
  - The human onboarding line carries its own Stripe line name, e.g. "Bill Review onboarding, human reading". No
    price literal appears anywhere else (CLAUDE.md pricing rule).
- **Tests:**
  - the human onboarding price for each tier comes from `BILL_REVIEW_ONBOARDING_USD.human`, and the per-source fee
    equals the AI-read fee;
  - no human-reading price literal exists outside lib/pricing.ts (source test);
  - the column's CHECK rejects any value other than `ai` or `human` (verify SQL, run by Lisa).

#### BR2. The guarantee: a human-read inventory never reaches the AI (server-side)
- **Estimate:** M, 1 diff, 2 days. **The most important task in the set; it goes first after BR1.**
- **Files:**
  - **app/dashboard/ghg/page.tsx:**
    - With Bill Review held, a document is uploaded only to a saved inventory. The upload saves the inventory
      first if it has no id.
    - New uploads are stored at `{userId}/{inventoryId}/{reporting_year}/{location}/{timestamp}_{file}`.
    - For a human-read inventory the page never calls the extract route. It calls BR4's submit route instead.
  - **app/api/concierge/extract/route.ts:**
    - The request carries `inventoryId`.
    - **The route reads the inventory id from the stored path** (its second segment), and refuses with 403 if it
      differs from `inventoryId` or the first segment is not the caller.
    - It loads the inventory through the caller's own client (RLS: own rows only). If `bill_review_reading` is
      `human`, it refuses with **409 before reading the file or calling the model**: "This inventory's bills are
      read by a ThemisIQ specialist, so they are not sent to the AI."
    - A path in the old format (no inventory segment) is refused with 400: "Save the inventory, then upload the bill
      again." Old-format documents were uploaded, and read, before this change; the route has no re-read flow that
      would need them.
    - Every refusal is logged (console, metadata only, as the route's cost log is).
- **The switch.** The guarantee holds for documents uploaded while the inventory is human-read. A document uploaded
  while it was AI-read was already sent; BR6 says so plainly. A document uploaded while human-read stays with the
  team even if the customer later switches to AI (ruling: a switch applies to future uploads only), so the route
  must also refuse a document that has a BR4 submission record.
- **Tests:**
  - With a mocked Supabase and a spy on the model call:
    - a human-read inventory gets 409, and **the model call is never made and the file is never fetched**;
    - an AI-read inventory proceeds;
    - a path naming a different inventory gets 403;
    - an old-format path gets 400;
    - a document with a submission record gets 409, even after a switch to AI.
  - **Source test:** the page's upload handler cannot reach `fetch('/api/concierge/extract'` without the
    `bill_review_reading !== 'human'` guard.
  - **Property test:** for every combination of (reading mode at upload, mode now), a document uploaded under
    `human` is never extracted.

#### BR3. Staff roles and the access log (least privilege, no code change to add a person)
- **Estimate:** M, 1 diff, 2 days.
- **SQL** (NOT RUN; `2026MMDD_staff_roles.sql`, plus `2026MMDD_staff_roles_grants.sql`):
  ```sql
  -- NOT RUN
  create table public.staff_roles (
    user_id    uuid not null references auth.users(id) on delete cascade,
    role       text not null check (role in ('bill_reader', 'bill_review_lead')),
    granted_by uuid references auth.users(id),
    granted_at timestamptz not null default now(),
    revoked_at timestamptz,
    primary key (user_id, role)
  );
  alter table public.staff_roles enable row level security;   -- no policy: reachable by service_role only

  create table public.staff_access_log (
    id            uuid primary key default gen_random_uuid(),
    staff_user_id uuid not null references auth.users(id),
    action        text not null check (action in ('view_queue', 'view_document', 'save_reading', 'view_ai_reading', 'record_spot_check')),
    document_ref  text,          -- the stored path or bill_review document id
    inventory_id  uuid,
    at            timestamptz not null default now()
  );
  alter table public.staff_access_log enable row level security;   -- no policy: service_role only

  -- staff_access_log is append-only, the way audit_log is: a trigger refuses update and delete.
  ```
  - **Grants** (memory rule: revoke first, then grant):
    `revoke all on public.staff_roles, public.staff_access_log from public, anon, authenticated;`
    `grant select on public.staff_roles to service_role;` `grant select, insert on public.staff_access_log to service_role;`
  - Parse offline. A verify script in the house format checks the grants, the absence of policies, and that update
    and delete on the log are refused.
- **lib/staff/access.ts (new, server-only):** `requireStaffRole(userJwt, role)`. It verifies the session, then
  checks `staff_roles` with the service-role client (`revoked_at is null`), and returns 403 otherwise.
  `logStaffAccess(...)` writes one log row. A route cannot serve a document without writing the log row first; if
  the write fails, the request fails.
- **Roles, least privilege:**
  - **`bill_reader`:** the queue, the documents in it, saving readings, and the spot-check sample. Customer
    identity is limited to company name, inventory label, site and fuel.
  - **`bill_review_lead`:** the above, plus the log.
  - Initially Lisa holds both. Adding a hired analyst is an `insert into staff_roles`, with no code change.
- **Tests:**
  - every staff route returns 403 without the role and 403 for a revoked role;
  - every document view writes a log row before the signed URL is issued;
  - a failed log write fails the view;
  - signed URLs live at most 5 minutes (⚑ Q6).

#### BR4. The human-reading queue: submission, expected date, readings (data)
- **Estimate:** M, 1 to 2 diffs, 2 days.
- **SQL** (NOT RUN). New tables `bill_review_documents` and `bill_review_readings`, or the existing `concierge_*`
  tables widened (⚑ Q3; this design shows new tables):
  - `bill_review_documents`: `id, user_id, inventory_id, source_doc_id, file_path, file_name, document_type,
    location_id, location_name, status ('waiting', 'read', 'unreadable'), submitted_at, expected_by date,
    read_by uuid, read_at`.
  - `bill_review_readings`: `id, bill_review_document_id, fuel_type, raw_value, raw_unit, period_start,
    period_end, delivery_date, source_quote, notes, read_by uuid, read_at`.
  - **RLS**, with `(select auth.uid())` wrapped as the rule requires: a customer may SELECT their own rows. Inserts
    and updates come only through service-role routes.
  - **Grants:** revoke first, then grant SELECT to authenticated and SELECT, INSERT, UPDATE to service_role.
- **app/api/bill-review/submit/route.ts (new):**
  - Called by the page for each upload to a human-read inventory.
  - It checks the caller owns the inventory, that the inventory is human-read, and that the path is inside it (as
    BR2 does).
  - It inserts the document row with `expected_by` from BR5, and returns the expected date.
- **Wizard read-back:** on load, and on a visibility change, the page fetches the inventory's `read` documents and
  their readings. It merges each reading into the document's `extracted` as a proposal with status `extracted`, so
  the customer confirms it exactly as an AI reading.
  - A proposal carries `readBy: { method: 'human', userId, name, at }`, and its value is converted through
    `convertToCanonical`, as at extraction.
  - A merge is idempotent (keyed by reading id). It never overwrites a proposal the customer has acted on.
- **Tests:**
  - a submission for an AI-read inventory is refused;
  - a merged reading becomes a proposal of the same shape as an AI one;
  - a second merge adds nothing;
  - a confirmed proposal is not overwritten;
  - the RLS and grant verify script.

#### BR5. Business days and the expected date
- **Estimate:** S, 1 diff, 0.5 to 1 day.
- **lib/billReview/businessDays.ts (new, pure):** `expectedBy(submittedAt, days = 2, holidays)`.
  - It counts business days in America/Toronto. Weekends and listed holidays are skipped.
  - The submission day is day 0: a bill submitted on Monday is expected by Wednesday. The handling of a submission
    after a cut-off time is ⚑ Q5.
- **lib/billReview/holidays.ts (new):** Ontario holidays as a dated list per year, configurable without code logic,
  with the source cited. ⚑ Q5: which holidays the team observes (Ontario statutory, or also the civic holiday and
  Easter Monday).
- **Tests:**
  - Monday gives Wednesday; Thursday gives Monday; Friday gives Tuesday;
  - a holiday inside the window pushes the date by one day;
  - Christmas and Boxing Day together, and a weekend between them;
  - the year boundary;
  - the date is computed in Toronto time whatever the server's zone.

#### BR6. Choosing and changing the reading, in the product
- **Estimate:** M, 1 diff, 2 days.
- **Where it is chosen:**
  - At Bill Review setup for an inventory: the first time a Bill Review customer opens an inventory's documents
    step, before the first upload.
  - In the inventory's settings afterwards.
- **Choice, with prices from BR1:**
  - "Read by AI, you confirm" (default, pre-selected);
  - "Read by a ThemisIQ specialist, you confirm. Within 2 business days."
- **Saving** writes `bill_review_reading`, `_set_by` and `_set_at`.
- **The switch screen** (plain, no em dash):
  - **AI to specialist:** "From now on, bills you upload to this inventory will be read by a ThemisIQ specialist
    and will not be sent to the AI. Bills already uploaded keep their reading: {n} bills in this inventory were
    already read by the AI."
  - **Specialist to AI:** "From now on, bills you upload to this inventory will be read by the AI, and you will
    confirm each one. Bills already read by our team keep their reading, and bills still with our team stay with
    our team."
  - Both screens show any price difference (⚑ Q1).
- **Who may choose specialist reading** depends on Q1 (whether the uplift is bought per customer or per
  inventory). Until it is ruled, the option is shown only to a customer whose entitlement records specialist
  reading.
- **Tests:**
  - the default is AI;
  - a switch records who and when;
  - the AI-to-specialist screen states the count of bills already read by the AI;
  - a switch changes no existing document or reading.

#### BR7. Waiting bills, the email, and the export gate
- **Estimate:** M, 1 diff, 2 days.
- **On each waiting document:** "With our team, expected by {date}." The date is in words (T10c).
  - Past that date it reads "With our team. This is taking longer than expected, and we are on it." (⚑ Q7).
  - It never falls back to AI.
- **lib/ghg/engine.ts:** a new export-blocking coverage issue, `awaiting_reading`, for each waiting or unreadable
  document of a human-read inventory:
  - "{file} is with our team, expected by {date}. Export is blocked until it is read and you confirm it."
  - It takes the place of T10's "unread upload" issue for these documents, so the customer is not told that no
    figure was read and to type one in.
  - An `unreadable` document says: "Our team could not read a figure from {file}: {note}. Enter the figure from the
    bill, or reject the bill."
- **Email** (Resend, the pattern of app/api/survey-invite/route.ts):
  - Sent when the last waiting document of an inventory is read: "Your bills are ready to confirm." It links to the
    inventory and names the count.
  - At most one email per inventory per batch (⚑ Q8). Delivery failures are logged and retried, never silent.
- **Staff alert:** a document past its expected date appears first in the queue, flagged "overdue".
- **Tests:**
  - a waiting document blocks export with the message;
  - once read and confirmed, it clears;
  - no code path sends a human-read document to the extract route when overdue (source test, and BR2's property
    test);
  - one email per batch, with the right count;
  - an email failure is logged, not swallowed.

#### BR8. The specialist queue page
- **Estimate:** L, 2 diffs, 4 to 5 days.
- **app/staff/bill-review/page.tsx (new), behind `requireStaffRole('bill_reader')`:**
  - It lists waiting bills **oldest first**, showing: customer (company name), inventory (reporting-year label),
    site, fuel or document type, uploaded, expected by, and an overdue flag.
  - Viewing the queue is logged.
- **Opening a bill:**
  - The document opens through a short-lived signed URL, issued only after the view is logged.
  - **The reading form produces the same proposal shape the AI produces:**
    - fuel;
    - value and unit (`convertibleUnits`);
    - either a billing period (start and end) or a delivery date, following T10b's rule;
    - source quote (required: the exact figure and unit as printed);
    - notes.
  - Several readings per document are allowed (a fleet bill with petrol and diesel).
  - "Can't read" records an outcome and a note, and sets the document to `unreadable`.
  - Every save is logged.
- **Spot-checks:**
  - The same page offers a sample of AI readings (⚑ Q4: sample size and rule, e.g. a fixed number per week drawn at
    random from AI-read inventories).
  - The specialist sees the document and the AI's reading, and records "Agrees" or "Disagrees", with a note, who
    and when, in `bill_review_spot_checks (id, inventory_id, source_doc_id, proposal_index, result, note, by, at)`.
    The SQL is NOT RUN and has the same grant pattern.
  - Whether a disagreement is shown to the customer is ⚑ Q4.
  - Every view is logged.
- **Tests:**
  - non-staff are refused;
  - the queue is sorted oldest first;
  - a saved reading has the proposal shape and converts as extraction does;
  - "can't read" sets `unreadable`;
  - every document view and save has its log row;
  - a spot-check records who and when.

#### BR9. Provenance on every reading (depends on T18, T11, T17)
- **Estimate:** M, 1 diff, 2 days.
- **`ExtractedProposal` gains `readBy: { method: 'ai' | 'human', name?: string, userId?: string, at: string }`:**
  - the AI path sets `method: 'ai'` and the time at extraction (page.tsx, beside the existing mapping);
  - BR4 sets `method: 'human'` with the specialist's display name.
- **It travels on the contribution** into the workings (as T9's `asRead` does) and is shown on every surface with
  T18's confirmation:
  - "Read by AI on {date}" or "Read by {specialist name} (ThemisIQ) on {date}";
  - then "Confirmed by {customer} on {date}".
- **Surfaces:** the review line, the workings, the verifier page (T11) and the PDF document index (T17).
- **A reading saved before BR9 has no `readBy`.** It shows "Read by AI (date not recorded)" (⚑ Q9).
- **The specialist's display name** comes from `staff_roles` or the staff profile. Whether a verifier sees a full
  name or "a ThemisIQ specialist" is ⚑ Q10.
- **Tests:**
  - both provenance lines render on all four surfaces;
  - a pre-BR9 reading shows the "not recorded" form;
  - the verifier whitelist test covers `readBy`.

#### BR10. Privacy policy and About page
- **Estimate:** S, 1 diff, 0.5 day.
- **app/privacy/page.tsx:131** already names Anthropic as a subprocessor ("Structured prompts; uploaded source
  documents (Concierge)", "Reading figures off Concierge documents, answering GHG guide questions", USA). The
  purpose is reworded: "Reading figures off Bill Review documents for inventories read by AI. Documents in an
  inventory read by a ThemisIQ specialist are never sent to it."
- **Staff access is disclosed** in the privacy policy:
  - ThemisIQ staff view uploaded documents to read them, for human-read inventories;
  - and for quality spot-checks of AI readings (⚑ Q4: whether spot-checks of AI-read customers' documents need
    their own ruling or consent).
- **app/about/page.tsx:94-95.**
  - **Replaced:** "Prefer a person to handle this step? No problem. Just let us know at {email}, and one of our team
    will do it instead."
  - **With the in-product choice:** "Prefer a person to read your bills? With Bill Review you can choose, for each
    inventory, to have a ThemisIQ specialist read them instead, and then nothing from that inventory is sent to the
    AI."
- **Observed, not ruled:** About says "We use AI in one place: the GHG Emissions module." The GHG guide
  (app/api/ghg-bot) also uses the AI, as the privacy row itself says. ⚑ Q11.
- **Tests:** a source test for each new sentence; the old opt-out sentence is gone; the subprocessor row names the
  exclusion.

#### BR11. Buying specialist reading (checkout, invoice, webhook)
- **Estimate:** M, 1 to 2 diffs, 2 days. **Depends on Q1 and on the pricing change that renames Concierge.**
- **Files:**
  - the /pricing Bill Review block offers the reading choice, with prices from BR1;
  - checkout and the admin invoice route send `bill_review_reading` (and the human source count if Q1 says
    so) in metadata, priced by BR1;
  - the webhook writes the entitlement's reading field (SQL NOT RUN, shape per Q1);
  - lib/entitlementMetadata.test.ts adds the key to both writers' contract.
- **Tests:**
  - both writers send the key;
  - the webhook writes it;
  - a human-read cart prices its onboarding from the human-read column and its sources at $45;
  - the card threshold counts it (pricing-addons-audit.md, A.7a, already reports that it ignores Concierge).

#### Order, estimate and placement
- **Order:**
  1. BR1 and BR2: the guarantee before anything is offered.
  2. BR3, BR5, BR4.
  3. BR6 and BR7.
  4. BR8.
  5. BR9, once T18, T11 and T17 are in.
  6. BR10 and BR11, alongside the pricing rename.
- **Total:** 20 to 22 working days (the items sum to 20 to 21.5).
- **Placement in section 12:** after item 19 (T17) and before the final run-throughs (item 20). BR2 could move
  earlier on its own if specialist reading is promised before the rest ships.

#### Open questions (Lisa)
1. **Q1, how human reading is bought:** the price is now a human-read onboarding fee per GHG tier (section 10, "BR:
   price"), so the question is narrower. Is the reading choice recorded per customer at purchase (an entitlement
   field), with any inventory then free to choose either? And what does a switch from AI-read to human-read cost for a
   customer who paid AI-read onboarding: the difference between the two onboarding prices, nothing until renewal, or
   something else? BR6 and BR11 wait on this.
2. **Q2, rounding:** withdrawn. The +20% ruling was replaced by fixed prices per tier (section 10, "BR: price").
3. **Q3, tables:** reuse the existing, unused `concierge_jobs`, `concierge_job_documents` and `concierge_proposals`
   tables (widened), or create `bill_review_*` tables and drop the unused ones in the rename?
4. **Q4, spot-checks:**
   - Sample size and rule.
   - Whether a disagreement is shown to the customer.
   - Whether staff viewing AI-read customers' documents for quality checks needs consent or a privacy statement
     beyond BR10.
5. **Q5, holidays and cut-off:** which Ontario holidays; whether a bill submitted after a cut-off time (e.g. 17:00
   Toronto) counts from the next business day.
6. **Q6, signed URLs:** their lifetime for staff document views (5 minutes proposed).
7. **Q7, overdue:** the wording for an overdue bill, and whether the customer is emailed when a date is missed.
8. **Q8, emails:** one per batch (when the last waiting bill is read), or one per bill, or a daily digest?
9. **Q9, older readings:** a reading saved before BR9 shows "Read by AI (date not recorded)". Acceptable, or
   backfill from `uploaded_at`?
10. **Q10, naming the specialist:** whether verifiers and PDFs show the specialist's full name or "a ThemisIQ
    specialist".
11. **Q11, About wording:** the "We use AI in one place" sentence omits the GHG guide. Correct it in BR10?
12. **Q12, manual entry:** may a customer type a figure for a bill still with the team, instead of waiting? Nothing
    in the rulings forbids it; it would sit beside the waiting reading as a typed figure, under T10's override rules.

### Launch commercial tasks: enforcement, payment, renewal, leads, promotion (4 Oct 2026)

Design only. Sources: docs/review/free-claims-audit.md (the gates and claims) and the two unapplied patches
`docs/review/patches/free-claims.patch` (copy) and `docs/review/patches/card-any-amount.patch` (card at any
amount, invoice at any amount). Every SQL file named here is NOT RUN; each opens with a NOT RUN header and
Lisa runs it. Per the standing grants rule, any new table or function carries its own GRANT block with
explicit revokes from `anon` and `authenticated` first; every new policy uses `(select auth.uid())`.

#### ENF1. Uploads to `source-documents` require an active GHG plan (server-side)
- **Why:** the upload gate is UI-only (audit S1). The bucket's INSERT policy checks only the uid prefix
  (supabase/migrations/20260804_ghg_source_documents_policies.sql:63-66, rewritten to the wrapped form by
  20260908_storage_rls_initplan.sql), so any signed-in account can write documents through the storage API.
- **Estimate:** S, 1 diff, 1 day.
- **SQL (NOT RUN):** `supabase/migrations/2026MMDD_source_documents_upload_requires_ghg.sql`.
  - **New function** `public.has_active_entitlement(p_module text) returns boolean`: `language sql stable
    security definer set search_path = ''`. Body: `select exists (select 1 from public.entitlements e where
    e.user_id = (select auth.uid()) and e.module_key = p_module and e.term_end > now())`.
    - It takes no user argument, so a caller can ask only about itself.
    - Security definer, so the storage policy does not depend on the caller's grants on `entitlements`.
    - The comparison is the database clock, the same as `enforce_ghg_location_allowance()`.
  - **Grants:** revoke all on the function from `public`, `anon` and `authenticated`, then grant execute to
    `authenticated` only.
  - **Policy:** drop and recreate `"Users can upload own documents"` (insert, to authenticated) with
    `with check (bucket_id = 'source-documents' and ((select auth.uid()))::text = (storage.foldername(name))[1]
    and (select public.has_active_entitlement('ghg')))`.
  - **Not changed:**
    - SELECT and DELETE stay as they are, because reading is not withdrawn by expiry (the entry-gate rule).
    - Bill Review uploads use the same bucket and already require an active GHG plan, so nothing else
      changes.
  - **Before and after:** count the policies on `storage.objects` for this bucket; they must match (3 and 3).
- **Files:**
  - `app/dashboard/ghg/page.tsx`: `handleFileUpload`, at :1063-1070. The storage error for a refused
    insert is mapped to "Uploading documents needs an active GHG plan." This states what was observed, a
    refusal by the policy, not a guess.
  - Expired customers: `isPaid` is true for them (:682), so the upload control renders and is then refused.
    Narrow the upload slots to `ghgAccess === 'active'` in the same diff, and show the expired arm's
    existing renew wording in place of "Paid plan".
- **Tests:**
  - **Static (vitest):** the migration parses (pglast, offline). The insert policy names
    `has_active_entitlement('ghg')`, and the select and delete policies are untouched.
  - **Source test:** the upload slots read `ghgAccess === 'active'`.
  - **Verify SQL (NOT RUN),** `docs/review/patches/ENF1-verify.sql`, run as three seeded users:
    - active: the insert succeeds;
    - expired: refused;
    - none: refused;
    - expired: can still select their own object.

#### ENF2. The guide route checks that the plan is active, not just present
- **Why:** `/api/ghg-bot` reads `select('module_key')` and refuses only when no row exists
  (app/api/ghg-bot/route.ts:205-215). An expired customer keeps the guide, and the model calls are paid for.
- **Estimate:** S, 1 diff, half a day.
- **Files:**
  - `app/api/ghg-bot/route.ts`: select `module_key, term_end` and refuse with the existing
    `entitlement_required` when `term_end <= now`. That is the same comparison `useHasConcierge` and the
    extract route make.
    - An unreadable `term_end` is `entitlement_check_failed` (503, fail closed), not access.
  - `app/dashboard/ghg/page.tsx` `BOT_ERRORS`: a new `entitlement_expired` code with "Your GHG plan has
    ended, so the guide is off until you renew." The route returns it for a present but expired row, so
    the message says which of the two happened.
  - **Optional, same diff:** move the comparison into a shared pure helper `isTermActive(row, now)` in
    `lib/useEntitlement.ts` (beside `accessFromRow`) so the four readers stop restating it.
- **SQL:** none.
- **Tests:** route tests with a mocked Supabase client:
  - no row → 403 `entitlement_required`;
  - expired row → 403 `entitlement_expired`;
  - active row → passes to the model call (mocked);
  - null `term_end` → 503.

#### ENF3. Exports built server-side, for active plans only (post-launch)
- **Why:** the framework CSVs and the assurance PDF are built in the browser
  (app/dashboard/ghg/page.tsx:3107-3254). The paywall is a blur with `pointerEvents: none` (audit S2), so
  anyone who removes it in the browser's developer tools gets the files.
- **Placement:** post-launch, as ruled, unless Lisa moves it.
- **Estimate:** L, 2 to 3 diffs, 4 to 6 days. The assurance PDF comes first; the CSVs follow.
- **Design:**
  - **Route:** `POST /api/ghg/export` with `{ inventoryId, kind: 'assurance_pdf' | 'framework_csv',
    frameworkId? }`.
    - The route authenticates the bearer and requires an active `ghg` row (the ENF2 helper).
    - It reads the SAVED inventory by id under the user's RLS client and re-derives figures with
      `figuresForSave` and `buildWorkings`, never trusting client figures.
    - It runs the same export gate as the page (`dataConfirmed` is recorded with the request, plus
      coverage, declarations, pricing and steam readiness), shared through a pure `exportReady()` taken
      out of the page.
    - It returns the file.
  - **Consequence:** an export is always of the saved inventory, not unsaved edits. The step 5 copy must
    say "Downloads use your last saved version." and the button saves first when the page is dirty.
  - `lib/assurancePdf.ts` must run in Node: jsPDF does, but the font and logo loading (lib/pdf/logo.ts)
    needs checking under the route runtime.
  - Once both kinds are served, the client builders are removed.
- **Files:**
  - `app/api/ghg/export/route.ts` (new) and `lib/ghg/exportReady.ts` (new, pure);
  - `app/dashboard/ghg/page.tsx` (`generateAssurance` and `generateExport` call the route);
  - `lib/assurancePdf.ts`.
- **SQL:** none (it reads `ghg_inventories`, `audit_log` and residual rows that RLS already scopes).
- **Tests:**
  - **Route:**
    - none or expired → 403;
    - another user's inventory → 404 from RLS;
    - an inventory failing `exportReady` → 409 naming the first failing check;
    - the PDF bytes start with `%PDF`.
  - **Gate:** `exportReady` agrees with the page's current gate on the existing run-through fixtures.

#### PAY1. Pay by card or by invoice, at any amount
- **Rulings (4 Oct 2026):** card is allowed at any amount, and paying by invoice is optional at any amount.
  There is no $10,000 rule anywhere in customer text.
- **Already in `card-any-amount.patch` (unapplied):**
  - **Removed:** `CARD_THRESHOLD_USD`, `requiresInvoice()` and `CartQuote.requiresInvoice` (lib/pricing.ts),
    plus the checkout refusal above $10,000.
  - **Invoice drafting:** `createDraftInvoiceForOrder` no longer has its `card_eligible` refusal, and the
    quote route drafts an invoice at any amount.
  - **/order:** card and "Prefer to pay by invoice? Request an invoice" side by side, with `?pay=invoice`.
  - **/pricing:** "Pay by card, or request an invoice. Prefer to pay by invoice? Request an invoice" under
    the button.
  - **Terms §3:** "Orders of any amount may be paid by card or, on request, by invoice."
- **What PAY1 still has to build** (after the patch, an invoice request emails Lisa and creates a DRAFT she
  sends by hand):
  1. **Send without a person,** or keep the review step. ⚑ Q-PAY-1. The draft is `auto_advance: false` by
     design (lib/order/invoice.ts:6-7). Finalising and sending automatically makes the request self-serve;
     keeping the review lets Lisa check the buyer.
  2. **Entitlement on payment:** `invoice.paid` already calls `grantFromMetadata`
     (app/api/webhooks/stripe/route.ts:130). The gaps:
     - invoice metadata carries no `ghg_tier`, so the GHG row is written with no tier, and Bill Review then
       cannot price onboarding (pricing-2026-10 report, item 5);
     - Bill Review is not orderable through /order at all.
     Both are needed: `priceOrder` returns the tier, and the invoice metadata includes `ghg_tier` and the
     `concierge_*` keys from `billReviewOrder`, exactly as checkout sends them.
  3. **/pricing with Bill Review in the cart:** the invoice link carries modules and tier only, so a Bill
     Review selection is dropped silently on the way to /order. Until /order takes a Bill Review source
     count, the link must either carry it or say beside it "Bill Review is added to your invoice by our
     team." ⚑ Q-PAY-2.
  4. **Wire transfer:** the account is Canadian with no Stripe ACH, and `payment_settings` is card only. The
     wire details come from `INVOICE_WIRE_FOOTER`. Confirm the footer is set in Vercel (Lisa: the variable
     NAME is `INVOICE_WIRE_FOOTER`; do not paste its value anywhere).
  5. **Prospect email:** the confirmation still says "prepare a quote" for an invoice request
     (app/api/order/quote-request/route.ts:146, :157-159). Say "invoice" when the request is not GHG
     Enterprise.
  6. **Due date:** 30 days (`days_until_due: 30`). Access starts on payment, per Terms §3.
- **Estimate:** M, 2 diffs, 2 to 3 days (items 2, 3 and 5; item 1 is a flag flip plus a test once ruled).
- **SQL:** none.
- **Tests:**
  - `priceOrder` and invoice metadata carry `ghg_tier`, and the Bill Review keys when ordered (extend
    lib/entitlementMetadata.test.ts, so all three writers keep one contract);
  - `invoice.paid` with that metadata writes `ghg_tier` and `source_allowance`;
  - the prospect email wording branches on quote or invoice.

#### REN1. Twelve months, no auto-renewal, an email 30 days before the end
- **Rulings:**
  - access is 12 months with no automatic renewal or charge;
  - an email goes out 30 days before `term_end` inviting the customer to opt in to another year for the
    same module(s), with a renewal checkout (confirmed 4 Oct 2026).
- **Already promised and not built:**
  - Terms §4 (app/terms/page.tsx:72): "ThemisIQ will send a renewal reminder 30 days before expiry."
  - `free-claims.patch` adds "We email you 30 days before it ends so you can opt in to another year" to
    /calculate-emissions.
  - Nothing sends it: no cron, no `vercel.json`, no reminder code.
  - ⚑ **These sentences are false until REN1 ships.** Either ship REN1 before launch, or hold that sentence
    of the patch back.
- **Estimate:** M to L, 3 diffs, 4 to 5 days.
- **Design:**
  1. **Schedule:** a Vercel Cron (new `vercel.json`, daily at 13:00 UTC) calls `GET /api/cron/renewal-reminders`,
     authenticated by the `CRON_SECRET` header Vercel sends.
     - The route selects active entitlement rows whose `term_end` falls in a window it has not yet emailed,
       grouped per user.
     - It sends one email per user listing every module ending in that window.
  2. **Reminder schedule (proposed):** 30 days before, as ruled. ⚑ Q-REN-1: also 7 days before, and on the
     day it ends?
  3. **Dedup:** a `renewal_reminders` table, one row per (user, term_end, kind), unique, so a re-run or a
     retried cron sends nothing twice.
  4. **Email** (Resend, the existing helper pattern):
     - Subject: "Your ThemisIQ plan ends on {date}". Body: the modules and tiers, the end date, what happens
       at the end (item 6), the renewal price from `cartQuote` at TODAY's list prices, and one button,
       "Renew for another year".
     - It is transactional (about an existing purchase), so no marketing consent is needed. It still names
       the sender and gives the postal address, as CASL requires for a commercial electronic message that
       includes an offer.
  5. **Renewal checkout:**
     - The button opens `/order?modules=…&tier=…&renew=1`, pre-filled from the expiring rows, with the same
       card or invoice choice as any order (PAY1).
     - The webhook already extends the term. ⚠️ `lib/entitlementTerm.ts` sets `term_end` to the LATER of the
       prior end and now + 365, so a customer who renews 30 days early LOSES those 30 days. Renewal must
       extend from the prior end (prior end + 365 when the prior term is still running).
     - That is a change to `computeEntitlementTerm`, with tests. ⚑ Q-REN-2 confirms that is the intent.
  6. **At expiry:** what the product does today, from the audit and the entry gate:
     - the inventories stay readable;
     - saving is refused by the trigger;
     - uploads are still offered to expired customers in the UI (ENF1 closes this);
     - exports are still offered (`isPaid` is true for expired; ENF3, or a narrower client gate, closes
       this);
     - verifier sharing is off (active only);
     - the guide is still on (ENF2 closes this);
     - Bill Review reading is off.
     ⚑ Q-REN-3 asks what it SHOULD be.
- **SQL (NOT RUN):** `2026MMDD_renewal_reminders.sql`:
  - **Columns:** `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on
    delete cascade`, `term_end timestamptz not null`, `kind text not null check (kind in
    ('t_minus_30','t_minus_7','ended'))`, `sent_at timestamptz not null default now()`, `resend_id text`,
    `unique (user_id, term_end, kind)`.
  - **Access:** RLS enabled with no policy (service role only, like `erasure_log`).
  - **Grants:** revoke all from `public`, `anon` and `authenticated`; grant to `service_role`.
- **Files:**
  - `vercel.json` (new) and `app/api/cron/renewal-reminders/route.ts` (new);
  - `lib/renewal.ts` (new, pure: which rows are due, the email model);
  - `lib/renewalEmail.ts` (new, HTML and text);
  - `lib/entitlementTerm.ts`; `app/order/page.tsx` (`renew=1`, and the heading "Renew your plan").
- **Tests:**
  - `lib/renewal.ts`:
    - due-window edges (exactly 30 days, 29, 31, timezone at midnight UTC);
    - grouping per user;
    - skipping rows already reminded;
    - an expired row is never reminded at T-30.
  - `computeEntitlementTerm`: an early renewal extends from the prior end; a late renewal starts now.
  - The cron route rejects a missing or wrong `CRON_SECRET`.
  - The email text names the modules, the date and the price, and carries the sender block.
- **Questions for Lisa:**
  - **Q-REN-1:** reminder schedule: 30 days only, or 30 + 7 + on the day?
  - **Q-REN-2:** an early renewal extends from the current end date (no days lost). Confirm.
  - **Q-REN-3:** at expiry, should exports be blocked (currently offered), and should uploads be blocked
    (currently offered)? Reading stays. Proposed: block both, keep reading and the audit trail.
  - **Q-REN-4:** is the renewal price today's list price or the price they paid? Proposed: today's list
    price, stated in the email.
  - **Q-REN-5:** Bill Review at renewal: every active source at $45. Who counts the sources, the customer on
    /order, or the email pre-filling the count from last year's allowance?
  - **Q-REN-6:** the Terms §4 sentence already promises the reminder. Change it to name the opt-in, or leave
    it as is?

#### LEAD1. "Email me my results" for the free Scope 1 and 2 calculator: ⛔ LAUNCH BLOCKER
- **⛔ Launch blocker (calc-copy, 4 Oct 2026).** The site now says the results are emailed:
  - `GHG_FREE_USE_SENTENCE` in lib/pricingCopy.ts ("… with your results emailed to you directly"), printed on
    /calculate-emissions and in the GHG wizard's banner;
  - the /calculate-emissions footnote ("your results will be emailed to you directly");
  - step 04 of its five steps ("we'll send your results to you directly").

  That wording must not reach a public launch until "Email me my results" works end to end in production:
  the form, the server-computed email delivered through Resend, and the lead row. LEAD1 is built immediately
  after calc-copy and before launch. If launch comes first, revert those three sentences.
- **Ruling (4 Oct 2026):** "Email me my results" is the lead capture; the other options (a free account that
  saves a draft, or both) are not chosen.
- **Estimate:** M, 3 diffs, 3 to 4 days.
- **Placement:**
  - In the wizard, for visitors with no plan (`ghgAccess === 'none'`, signed in or not): a panel on step 4
    under the totals, and a button in the step 4-5 banner beside "See GHG pricing".
  - Not shown to active or expired customers, who can save.
- **The form:**
  - **Email:** required, validated as an address.
  - **Box 1, required to send:** "Email me my Scope 1 and 2 results." Unticked by default.
  - **Box 2, optional:** "Also send me occasional ThemisIQ updates about emissions reporting. You can
    unsubscribe at any time." Unticked by default.
  - **Under the boxes:** "ThemisIQ, a company incorporated in Ontario, Canada, will send this email.
    [postal address]. We keep your email address, your choices and the summary below to send your results
    and, if you ticked the second box, our updates. See our Privacy Policy." ⚑ Q-LEAD-1: the postal address
    to print. CASL requires it, and the repo carries none.
  - **Button:** "Email my results". It is disabled until the address is valid and box 1 is ticked.
  - **Hidden:** the honeypot (`HONEYPOT_FIELD`) and a bot-protection token (see below).
- **Consent design:**
  - **CASL:** express consent, obtained separately for each purpose (box 1 is the requested results, a
    transactional reply; box 2 is the commercial electronic messages). It states the purpose, identifies
    the sender with contact details, and says it can be withdrawn. Nothing is pre-ticked.
  - **GDPR:** box 2 is freely given, specific, informed and unambiguous (Art. 4(11), 7). Box 1's lawful
    basis is performing the request (Art. 6(1)(b)), so it is recorded but not needed as consent; the box
    stays because it makes the request explicit.
  - **Recorded per box:** whether it was ticked, when, and the exact wording version (`consent_text_version`).
- **The email** (Resend, the existing `sendEmail` pattern; subject "Your Scope 1 and 2 results from
  ThemisIQ"):
  - **Content:**
    - totals: Scope 1, Scope 2 location-based, Scope 2 market-based where computed;
    - the main lines: the largest lines from `buildWorkings` (site, fuel, quantity and unit, factor,
      tCO2e), at most 10, then "and N more lines";
    - the factor editions used, from `factorEditions` (the same values a save would write);
    - the reporting year and the number of sites.
  - **Fixed note:** "These figures were calculated in your browser and have not been saved. No documents
    were uploaded or kept. To save your inventory, add Scope 3 and download reports, continue with a GHG
    plan." Then a "See GHG plans" button linking to `/pricing?modules=ghg`.
  - **Footer:** the sender identification, the postal address, and the reason ("You asked for this email on
    themisiq.co.").
  - **Unsubscribe:** a link that withdraws box 2 when it was given, and a `List-Unsubscribe` header. The
    link is a signed token, `HMAC(lead_id)` with a new server secret; Lisa names the variable, never the
    value.
  - **The figures are computed on the server,** not sent as numbers from the client. The client sends the
    inventory inputs (locations, fuels, units, country, year). The route runs
    `figuresForSave(inventory, 'AR6')` and `buildWorkings` and refuses inputs that do not parse. So the email
    states what the engine says, and nobody can mail arbitrary numbers under ThemisIQ's name.
- **Storage:**
  - **SQL (NOT RUN):** `2026MMDD_leads.sql` creates `public.leads`:
    - `id uuid pk default gen_random_uuid()`, `email text not null`, `email_key text not null` (the
      `recipientKey` normalisation);
    - `consent_results boolean not null`, `consent_results_at timestamptz`;
    - `consent_updates boolean not null default false`, `consent_updates_at timestamptz`,
      `updates_withdrawn_at timestamptz`;
    - `consent_text_version text not null`;
    - `country text`, `site_count int not null check (site_count >= 0)`, `scope1_t numeric`,
      `scope2_location_t numeric`, `scope2_market_t numeric`, `reporting_year int`;
    - `source_page text not null` (e.g. `/dashboard/ghg`, with the referrer path when it is ours);
    - `user_id uuid null references auth.users on delete set null` (set when signed in), `created_at
      timestamptz not null default now()`, `resend_id text`.
    - **Index:** on `(email_key, created_at)`.
  - **Access:**
    - RLS enabled. No policy for `anon` or `authenticated`: the route writes with the service role, and
      nobody reads leads from the browser.
    - Grants: revoke all from `public`, `anon` and `authenticated`; grant to `service_role`.
    - ⚑ Q-LEAD-2: should a signed-in user see their own lead rows? Proposed no, and no policy.
  - **Retention:** ⚑ Q-LEAD-3. Proposed: delete a lead with no updates consent after 24 months, and keep a
    consented one until withdrawal plus 24 months (CASL's record-of-consent burden sits with the sender).
    The privacy policy gains a row for this table.
- **Abuse controls:**
  - `lib/rateLimit.ts` buckets `lead-results-ip` and `lead-results-email` (for example 5 per hour per IP and
    3 per day per address, matching the assessment route);
  - the shared honeypot;
  - a bot-protection check.
  - ⚑ Q-LEAD-4: add Cloudflare Turnstile (free, no tracking cookies), or rely on the honeypot plus rate
    limits as /assess does today. Proposed: Turnstile on this form only, because it sends email to an
    address typed by an anonymous visitor, which is a mail-bombing vector the assessment form shares but
    does not need to.
- **Files:**
  - `app/api/ghg/email-results/route.ts` (new); `lib/ghg/resultsEmail.ts` (new, pure: model and HTML/text);
  - `lib/leads.ts` (new: row shape, consent text version, unsubscribe token);
  - `app/unsubscribe/page.tsx` and `app/api/unsubscribe/route.ts` (new);
  - `app/dashboard/ghg/page.tsx` (the panel); `app/privacy/page.tsx` (the leads row and retention).
- **Tests:**
  - **Consent:**
    - the route refuses without `consent_results`;
    - box 2 defaults false and is stored false when absent;
    - timestamps are set only for ticked boxes;
    - the text version is stored.
  - **Figures:** they come from the server (a client-supplied total is ignored); the email model lists at
    most 10 lines plus "and N more"; editions match `figuresForSave`.
  - **Email text:** it contains the not-saved and no-documents sentence, the sender block and the
    unsubscribe link.
  - **Abuse:** the honeypot drops silently; the rate limiter's denial is a 429 with a plain message.
  - **Unsubscribe:** the token round-trips; a tampered token is refused; withdrawal sets
    `updates_withdrawn_at` and never deletes the record of consent.
  - **Database:** a static test that the migration revokes from `anon` and `authenticated` and creates no
    policy.
- **Questions for Lisa:** Q-LEAD-1 (postal address), Q-LEAD-2, Q-LEAD-3 (retention), Q-LEAD-4
  (Turnstile), and Q-LEAD-5: who reads leads, and where? Proposed: a monitor email per lead that ticked
  box 2, and a CSV export from the admin area later.

#### PROMO1. The free Scope 1 and 2 calculator, given premier placement
Proposals only; no copy changes yet. The shared line, from the free-use ruling: "Calculate your Scope 1 and 2
emissions free, no account needed. Email yourself the results." ("Email yourself the results" only once
LEAD1 ships; until then the first sentence stands alone.) The calculator itself is `/dashboard/ghg`.

**What each surface says today:**

| Surface | Today | Calculator link? |
|---|---|---|
| Home hero (app/page.tsx:64-82) | "Sustainability reporting that suits your needs and budget." Buttons: "Start the free assessment", "See how it works". "Free, takes about five minutes." (the assessment) | No |
| Home, later sections (:112, :166, :180, :319) | All four point to /assess or /advisory | No |
| Home pricing block (app/components/HomePricing.tsx:29) | GHG card CTA: "Ready to see your emissions?" / "See your emissions instantly →" to /dashboard/ghg | Yes, only after choosing GHG in the block |
| /climate-ghg hero (app/climate-ghg/page.tsx:85-98) | "Start the free assessment" and "From $550/yr" | **No calculator link anywhere on the GHG module page** |
| /climate-ghg closing (:256-257) | "Start the free assessment", "Talk to us" | No |
| /calculate-emissions (:450, :563, :600, :764) | "See your emissions instantly" (4 times). Copy per the free-claims patch | Yes. ⚠️ **No page, nav or footer links to /calculate-emissions**; it is reachable only from the sitemap and search |
| /pricing nav (app/pricing/page.tsx:493) | "See your emissions instantly →" | Yes, small, in the page's own nav |
| /pricing GHG card CTA (:51-56) | "Ready to see your emissions?" / "Your SB 253 Scope 1, 2 & 3 inventory can be complete in days, not months." / "See your emissions instantly →" | Yes, when GHG is selected |
| /assess results (app/assess/page.tsx:926) | Closing band: "Talk to a specialist" + "Calculate your emissions →" (secondary, outlined) | Yes, last on the page |
| /frameworks (app/frameworks/page.tsx:77-100) | SB 253, ESRS E1, CDP and GRI 305 rows link "covers" to /climate-ghg | No |
| SB 253 page | None exists; SB 253 is a row on /frameworks and a tag on /climate-ghg | — |
| Nav (app/components/Nav.tsx:12, :152) | "GHG Emissions" to /climate-ghg; the one CTA is "Free assessment" | No |
| Footer (app/components/Footer.tsx:22) | "Climate · GHG" to /climate-ghg | No |

**Proposals** (for approval). One primary CTA label everywhere: **"Calculate your emissions free"**, linking to
`/dashboard/ghg`. Under it, where there is room: "Scope 1 and 2, in your browser, no account needed." After
LEAD1: "… Email yourself the results."

| # | Surface | Placement | Proposed |
|---|---|---|---|
| PR1 | Home hero | Above the fold, as a second primary-weight button beside the assessment | Button "Calculate your emissions free". The micro-line under the buttons becomes: "The assessment and the Scope 1 and 2 calculator are both free. No account needed." ⚑ The hero then has two primary actions; alternatively the calculator takes the outlined slot and "See how it works" moves to a text link |
| PR2 | Home, new band directly under the hero | Above the module grid | Heading "Know your Scope 1 and 2 emissions today." Body: "Enter your energy and fuel use for each site and see your emissions as you type, with every factor shown. Free, in your browser, no account needed." Button "Calculate your emissions free" |
| PR3 | /climate-ghg hero | Above the fold, primary | Primary button "Calculate your emissions free"; "Start the free assessment" becomes secondary; "From $550/yr" stays as the third. Line under the buttons: "Scope 1 and 2 are free to calculate in your browser. Saving, Scope 3 and reports need a GHG plan." (from `GHG_FREE_USE_SENTENCE` / `GHG_PLAN_USE_SENTENCE`) |
| PR4 | /climate-ghg closing band | Last band | Primary "Calculate your emissions free", secondary "Talk to us" |
| PR5 | /calculate-emissions | Hero, already primary | Button label "Calculate your emissions free" in place of "See your emissions instantly" (all four), so one label is used site-wide. Link the page from the footer (PR10) so it is not an orphan |
| PR6 | /pricing | The page nav button (:493), and a line above the module grid | Nav button "Calculate your emissions free". New line above the configurator: "Not ready to buy? Calculate your Scope 1 and 2 emissions free, no account needed." with the same link |
| PR7 | /assess results | Move the calculator from the closing band's outlined button to directly under the GHG obligation card, when GHG is among the results | "Your Scope 1 and 2 emissions are the starting point for {frameworks}. Calculate them free now, no account needed." Button "Calculate your emissions free" |
| PR8 | /frameworks | On the SB 253, ESRS E1, CDP and GRI 305 rows | A second link beside the module link: "Calculate your Scope 1 and 2 free →" |
| PR9 | Nav | Signed-out right group | Keep "Free assessment" as the filled button, and add a text link before it, "Free calculator", to /dashboard/ghg. In the GHG Emissions menu item's sub-line, add "Free Scope 1 and 2 calculator" |
| PR10 | Footer | Platform column, under "Climate · GHG" | "Free emissions calculator" to /calculate-emissions (the explainer page, for search, which then links into the wizard) |
| PR11 | A dedicated SB 253 page | Not proposed now | ⚑ Q-PROMO-1: a /sb-253 explainer page with the calculator as its primary CTA would serve search well, but it is a new page with legal-date content (`lib/sb253`) to maintain. Proposed: later, not in PROMO1 |

- **Estimate:** S to M, 1 to 2 diffs, 1.5 days once the wording is approved.
- **Files:** app/page.tsx, app/climate-ghg/page.tsx, app/calculate-emissions/page.tsx, app/pricing/page.tsx,
  app/assess/page.tsx, app/frameworks/page.tsx, app/components/Nav.tsx, app/components/Footer.tsx; a
  `FREE_CALCULATOR_CTA` label and `FREE_CALCULATOR_LINE` constant in lib/pricingCopy.ts beside the free-use
  sentences.
- **Tests:**
  - a source test that each listed surface links `/dashboard/ghg` with `FREE_CALCULATOR_CTA`;
  - no surface says "See your emissions instantly";
  - the footer links /calculate-emissions.
- **Depends on:** `free-claims.patch` (the shared sentences). "Email yourself the results" waits for LEAD1.

#### Order and estimate
- **Order:**
  1. ENF1 and ENF2 (2 days, before launch).
  2. PAY1 (2 to 3 days, before launch: invoice orders need the tier).
  3. REN1 (4 to 5 days; before launch if the Terms §4 and FAQ sentences ship).
  4. LEAD1 (3 to 4 days). ⛔ **Launch blocker** since calc-copy; built immediately after it, before launch.
  5. PROMO1 (1.5 days, after free-claims and with or after LEAD1).
  6. ENF3 post-launch (4 to 6 days).
- **Total:** 13 to 16 days before ENF3, and 17 to 22 with it.

---

## 12. Remaining GHG work: recommended order and estimate (2 Oct 2026)

The commercial launch has moved from 1 November 2026 to a date to be set once the GHG module is complete
(section 10). This section orders all the remaining GHG work. It ranks by dependency first, then by the risk of
a wrong number reaching a customer or a verifier, then by presentation. Sizes use the scale in the factor
integrity heading: S up to 1 working day, M 1 to 2, L 3 to 5. Each includes drafting, verifying, review, one
revision round, build and commit.

### 12.1 Order

| # | Item | Branch | Size, diffs | Days | Why here |
|---|---|---|---|---|---|
| 0 | T10b delivery-based fuels and the 0-months estimate guard | `derived-figures` | M to L, 3 | 3 to 4 | **Blocks the merge** (run-through finding). Today a site that buys fuel by delivery cannot export, and the only action offered silently does nothing. |
| 1 | Derived-figures run-through fixes, then merge | `derived-figures` | M to L, 1 to 3 | 2 to 4 | Everything else is created from main after this merge. The fix list is whatever the run-through produced. The only open item known in this session is the live results panel disappearing, with no cause found in code; it needs a reproduction first. |
| 1a | FI0 retire the location cap (and capture-triggers.sql) | `fi0-location-cap` | M, 2 | 1.5 to 2 | Independent of every other branch. Copy is wrong in the code at `3e37755`, and in production if main carries the same pricing (⚑ not checked: no git was run): the calculate-emissions note renders "for up to  locations", and three pages still say GHG is priced by locations. The SQL is low-risk and can run as soon as it is reviewed. |
| 2 | T13 core close-out | main | S, 1 | 1 | Removes the dead paths (legacy straddle and duplicate writers) before FI1 rewrites the same engine code, and closes F-09 to F-11 with tests. |
| 3 | T15 exact-duplicate check across document types | main | M, 1 | 2 | Wrong-number risk: the same bill uploaded under two document types is counted twice today. Done on main before the factor branch opens, so Lisa does not have to switch branches mid-task. |
| 4 | FI1 blocking line, never a dropped site; CA province; refrigerant | `factor-integrity` | L, 2 | 3 to 4 | Today whole sites leave the totals over one unit, and refrigerants can price at zero. Every later FI task relies on its unpriced line. |
| 5 | FI2 no fallback, exact conversions, provenance | `factor-integrity` | L, 3 | 4 to 5 | F-01: US EPA values under other publishers' citations in every non-US country. The largest wrong-number class found. |
| 6 | FI5 unit and country change | `factor-integrity` | M, 2 | 2 | The open CLAUDE.md defect, live in production, where 332 m³ becomes 332 Mcf, about 28 times too high. Can start as soon as FI2's first diff (the exact table) is in. Also closes the stale residual-region leak. |
| 7 | FI3 EU properties | `factor-integrity` | M, 2 | 2 to 3, plus research | Every EU fuel line rests on an uncited property. The research record can run in parallel with items 4 to 6. |
| 8 | FI4 propane by mass | `factor-integrity` | M, 1 | 1 to 2, plus research | The uncited US density reaches every country. |
| 9 | FI7 steam message | `factor-integrity` | S, 1 | 0.5 | Wording and the unpriced-line shape, after FI1. |
| 10 | FI10 NZ use class on rows | `factor-integrity` | S, 1 | 0.5 to 1 | Disclosure, after FI2 has fixed the row shape. |
| 11 | FI8 close-out, then merge `factor-integrity` | `factor-integrity` | S, 1 | 1 | |
| 12 | T3b reporting-year labels, Scope 3 year end, SB 253 banner | `factor-years` | M, 1 to 2 | 2 | Presentation, but T3c depends on its labels. |
| 13 | T3c edition selection, no year substitution, and F-06 | `factor-years` | L, 4 | 5 to 6 | Wrong-year factors today (the UK grid differs about 26% between the 2025 and 2026 keys). Includes the only SQL in this plan. F-06 (the edition comparison in the year-on-year disclosure, on all four surfaces) adds one diff. |
| 14 | T3d load the required editions | `factor-years` | L, 3 (one per year: 2025, 2024, 2026) | 5 to 8 | Clears the blocks T3c creates. Transcription from primary sources, checked by Lisa, is most of the time. |
| 15 | FI6 Australian Category 3 from NGA | see 12.2 | M, 2 | 2 to 3 | The DEFRA stand-in is disclosed today, so this is a lower risk of a misleading number. |
| 16 | FI9 fleet fuel mobile factors | see 12.2 | L, 3 | 4 to 6, after the decision | CH4 and N2O on fleet lines only; CO2 is barely affected (mobile.ts:24-31). Waits on the open vehicle-class decision. |
| 17 | T18 who and when on every review action; withdraw and delete | main | L, 4 | 5 to 7 | **In scope, core pre-launch** (ruling, section 10). Confirm, edit figure, flag, typed figures and three coverage resolutions record no who; an edited figure loses its reading; removing a document leaves no record. It goes before T11 and T17 because they can only show a trail that is recorded. Could move earlier, to straight after item 3, to protect inventories prepared during testing. |
| 18 | T11 verifier page: contributions, reasons, estimated dates | main | M, 1 | 2 | **Core pre-launch** (ruling, section 10). Renders workings fields. Done once FI2, FI10, T3c and T18 have added theirs (conversion note, publisher, use class, edition, rule, who and when), so it is built once. |
| 19 | T17 assurance PDF workings page | main | M, 1 to 2 | 2 to 3 | **Core pre-launch** (ruling, section 10). Same reason as T11. It also removes the PDF's export-time residual recompute. |
| 19a | BR1 to BR11, Bill Review human reading | main | L, 11 tasks | 20 to 22 | Depends on T18 (provenance), T11 and T17 (BR9) and the pricing rename (BR10, BR11). BR1 and BR2 (the guarantee) go first. ⚑ Whether it is pre-launch is not ruled; the totals below exclude it. |
| 20 | Country run-throughs (US, CA, UK, EU, AU, NZ) | | | 4 to 5 | Once after `factor-integrity` merges and once after item 19, each with one inventory per country and a verifier link. |

### 12.2 Recommendations that need a ruling

- **Move FI6 and FI9 after T3c.** As ruled, they sit on `factor-integrity`, before `factor-years`. Both add new
  factor tables that T3c then re-keys by edition. Both carry a lower risk of a wrong number than wrong-year
  editions, and FI9 is waiting on a decision. Putting them after T3d, on `factor-years` or a short branch of
  their own, means the tables are written edition-keyed once, and the factor-integrity merge is not held up by
  FI9's decision. If not ruled, keep the numbered order and expect `factor-integrity` to take 6 to 9 days longer
  to merge.
- **FI9 vehicle-class input:** options (a), (b) or (c) in FI9. It is needed before item 16 starts.
- **Not in this order:** T14 (`metered_split`) and T16 (verifier links pinned to a saved version, which has SQL)
  were not in the list given. T16 bears on verifier trust: today a verifier link shows the live inventory,
  so a re-save changes what an issued link shows. ⚑ Decide whether T16 is needed before launch.

### 12.3 Overall estimate

**Sum of the items: 55 to 74 working days. Realistic: about 66 working days, roughly 13 weeks, with a range of 60
to 78.** FI0 (1.5 to 2 days) and T10b (3 to 4 days) were added on 2 Oct 2026. This includes F-06 in T3c and T18 at its full scope (withdraw and delete, tombstones, typed-figure
entries), both added on 2 Oct 2026. It excludes the ⚑ option (b) document-level purge of `audit_log`, which
would add SQL and about 2 to 3 days. The realistic figure allows for waiting on decisions and sources, and for findings from the
run-throughs that the plan cannot list in advance.

Assumptions:
- One developer and reviewer (Lisa), with CC drafting and verifying each patch. GHG is close to full-time work.
  At half-time, double the calendar time.
- Each diff takes one revision round, as most T tasks so far have (T6, T7, T8, T9 and T10 each had one).
- Factor values for T3d, FI6, FI9, and the FI3 and FI4 research, are transcribed from primary documents that can
  be obtained, and Lisa checks spot values against the document. If a source cannot be found, the line blocks
  as ruled, and the work finishes with fewer lines priced, not later.
- The only SQL is T3c's `factor_selection` column. T16 is excluded.
- Decisions (FI9's input, the two readings in section 10, the 12.2 move) are made within a day or two of being
  asked. Each week of waiting on FI9 delays only item 16 if the 12.2 move is ruled, or the factor-integrity
  merge if not.
- The run-throughs find no defect larger than one M-sized fix per country. A finding on the scale of the silent
  zeros the T3 property tests found would add a task.
- No production incident takes time away. The unit-switch defect stays live until item 6 lands. If that is too
  long, FI5 could instead be done on main straight after item 1, with its own exact-conversion table, at a cost
  of about 1 extra day to reconcile with FI2 later.
