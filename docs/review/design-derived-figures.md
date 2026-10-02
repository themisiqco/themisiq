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
| Merge set | derived-figures merges to main after, in order: T3a, T4, T5, T6, T7, T8 (widened), T9 (widened), T12, T10. T11 and T13 follow on main. T8 and T9 are widened as described in section 11; T12 moves after T9, and T10 after T12. |
| T3b: label forms | Replaces the proposed "YE" forms. Non-December year ends read "Apr 2024 to Mar 2025" in menus, tiles and headings; "2024–25" on chart axes only; "2024-04_to_2025-03" in filenames. December year ends read "2025" in all three. No "YE" or "FY" abbreviations in customer-facing labels. Running text keeps T3a's "the year ending 31 March 2025". |
| T3b: SB 253 first-report window | From CARB's Final Regulation Order, Title 17 CCR §96076(c) (text in the T3b entry). The first report (due 10 November 2026) covers the fiscal year ending **after 1 February 2025 and on or before 1 February 2026**. A fiscal year ending on or before 1 February in a calendar year reports the year ending in that calendar year; one ending later reports the year ending in the previous calendar year. Optionally, the most recent preceding year may be reported where its data is available. Status: adopted by CARB (Executive Order R-26-006) and resubmitted to OAL on 21 September 2026; OAL approval not yet reached, so it carries the same 'proposed' handling as `SB253_DATE_STATUS`. |
| T3b: optional election and allowlist | Optional-election banner confirmed, for a window ending after 1 February 2026: "If you choose to file this year as your first SB 253 report, Scope 3 isn't required in it." The EU deadline string "FY2024 (large EU companies)" stays on the source-guard allowlist. |

---

## 11. Implementation tasks, in dependency order

Each task is one reviewable diff with its own tests. Run `npx vitest run lib/ghg/engine.test.ts` before and after
every engine task: the passing count only goes up. Run `npm run build` after every task. Tasks T1 to T13 are the
core derived-figures work. T14 to T17 come after it, as ruled.

**Merge set (ruling, section 10).** derived-figures merges to main after, in order: T3a, T4, T5, T6, T7, T8, T9,
T12, T10. T11 and T13 follow on main. T3b, T3c and T3d are on the `factor-years` branch, created from main after
that merge. The tasks below are listed in that order. T3a has no entry of its own: it is the patch
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

### T11. Verifier page: contributions, reasons, estimated dates
- **Order:** after derived-figures merges, on main.
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
- **Tests:** full suite; engine count not lower than before T1.
- **Done:** F-09, F-10 and F-11 are closed by tests that would fail on the old code.

### Factor-years branch: T3b, T3c, T3d
Branch `factor-years`, created from main after derived-figures merges (sequencing ruling, section 10). Order:
T3b, T3c, T3d.

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
- **Done:**
  - Every year-keyed factor is chosen by `selectEdition` from the window, and no code path substitutes a year.
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
