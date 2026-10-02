# Recalculation scenarios: additions

Two scenarios for the recalc agent's brief. Each gives the input as printed on the bill, then what the current
code does with it, step by step, with file:line evidence from the working tree on 1 Oct 2026. These describe
current behaviour; they do not state what the correct outcome should be.

**Assumptions for both scenarios.**
- One location, one fuel stream (electricity), both bills confirmed, each with a value and a unit.
- Calendar fiscal year: `fiscal_year_end_month = 12`. `periodFromYearAndEnd(Y, 12)` gives the window Jan 1 Y
  to Dec 31 Y (lib/ghg/engine.ts:1654-1661). Coverage and `applyResolutions` treat that as the half-open window
  `[Jan 1 Y, Jan 1 Y+1)` (engine.ts:1736-1737, 2935).

**Shared code paths.**
- **Extraction (Concierge).** Printed dates are kept as printed: "use those exact dates VERBATIM, including the
  printed end date even when it falls on the 1st of the next month. Do NOT round, clamp, or normalize the end
  date" (app/api/concierge/extract/route.ts:63). A month-only bill takes the first and last calendar day of
  the month with `periodConfidence: "medium"` (route.ts:65).
- **`periodConfidence`.** Stored on the proposal (app/dashboard/ghg/page.tsx:1073; type at
  lib/ghg/engine.ts:1578). No other read of it was found in lib/ghg or the GHG page.
- **`exclusiveEnd`.** An end date on the 1st of a month is already the first uncovered day. Any other end date
  gets +1 day (engine.ts:1711-1715).
- **Coverage.**
  - A bill with no days in the window goes to `outOfWindow`.
  - A bill partly inside is a straddle.
  - A bill fully inside is neither (engine.ts:1749-1764).
  - Overlap means two bills share at least one in-window day (engine.ts:1784-1790).
  - A month counts as covered only if every in-window day of it is covered (engine.ts:1794-1803).
- **Annual figure.** `applyResolutions` adds every confirmed proposal for the field, with no date-window filter
  (engine.ts:2952-2968). Only straddling bills are scaled (engine.ts:2979-2989). A bill wholly outside the
  window is added in full. Meanwhile the coverage strip shows it as "outside reporting year …, not counted"
  (app/dashboard/ghg/page.tsx:3528).
- **Monthly figure.** Each bill is split over `[start, exclusiveEnd(end))` by calendar month. Each slice is
  stamped `reporting_year` = the calendar year of its month (lib/ghg/monthlyEmissions.ts:120-133, 236-253).

---

## Scenario A. Two adjacent bills with first-of-month end dates

**Input.**
- Bill 1, printed "Dec 1, 2025 – Jan 1, 2026".
- Bill 2, printed "Jan 1, 2026 – Feb 1, 2026".

**Stored periods** (verbatim rule, route.ts:63):
- Bill 1: `periodStart 2025-12-01`, `periodEnd 2026-01-01`, `periodConfidence "high"`.
- Bill 2: `periodStart 2026-01-01`, `periodEnd 2026-02-01`, `periodConfidence "high"`.

**Canonical intervals** (`exclusiveEnd`, engine.ts:1711-1715):
- Bill 1: `[2025-12-01, 2026-01-01)`. 31 days, all December 2025.
- Bill 2: `[2026-01-01, 2026-02-01)`. 31 days, all January 2026.
- They share no day: Jan 1 is excluded from Bill 1 and included in Bill 2. No overlap is raised
  (engine.ts:1784-1790).

**Reporting year 2025 inventory** (window `[2025-01-01, 2026-01-01)`):

| Step | Bill 1 | Bill 2 |
|---|---|---|
| Coverage classification (engine.ts:1749-1764) | Fully in window: neither straddle nor out of window | 0 in-window days: `outOfWindow` |
| Month coverage | December 2025 covered | none |
| Strip text | n/a | "1 bill outside reporting year 2025, not counted: Jan 2026." (page.tsx:3528) |
| `applyResolutions` (engine.ts:2952-2989) | Added in full | **Added in full**: no window filter, and not a straddle, so not scaled |
| Annual figure | Bill 1 + Bill 2 (both bills' full quantities) | |

**Reporting year 2026 inventory** (window `[2026-01-01, 2027-01-01)`):

| Step | Bill 1 | Bill 2 |
|---|---|---|
| Coverage classification | 0 in-window days: `outOfWindow` | Fully in window |
| Month coverage | none | January 2026 covered |
| Strip text | "1 bill outside reporting year 2026, not counted: Dec 2025." | n/a |
| `applyResolutions` | **Added in full** | Added in full |
| Annual figure | Bill 1 + Bill 2 | |

**Monthly records** (monthlyEmissions.ts:236-253). These are the same whichever inventory the bills are
attached to:
- Bill 1 gives one slice: `period_month 2025-12-01`, `reporting_year 2025`, `pct_in_month 1`.
- Bill 2 gives one slice: `period_month 2026-01-01`, `reporting_year 2026`, `pct_in_month 1`.

**Points for the brief.**
- If both bills sit in one inventory, the annual figure includes the out-of-window bill in full, while the
  strip says it is "not counted".
- If only one of them is uploaded to the matching year, the annual and monthly figures agree for that bill.
- The shared Jan 1 boundary produces no overlap and no straddle.

---

## Scenario B. One month-only bill, "Jan 2026"

**Input.** One bill printed with the month only: "Jan 2026".

**Stored period** (month-only rule, route.ts:65): `periodStart 2026-01-01`, `periodEnd 2026-01-31`,
`periodConfidence "medium"`.

**Canonical interval.** `exclusiveEnd(2026-01-31)` is 2026-02-01, because the 31st is not the 1st, so +1 day
(engine.ts:1711-1715). The interval is `[2026-01-01, 2026-02-01)`, 31 days, all January 2026. This is the
same interval as Bill 2 in Scenario A.

**`periodConfidence "medium"`.** Stored (page.tsx:1073). No calculation, coverage, gate or display read of it
was found, so a month-only bill is treated exactly like a bill with printed dates.

**Reporting year 2026 inventory:**
- **Coverage:** fully in window; January 2026 covered; no straddle, no overlap.
- **`applyResolutions`:** added in full.
- **Annual figure:** the bill's quantity, plus extrapolation × 12/monthsCovered if the customer acknowledges
  the 11-month gap (engine.ts:2990-2991).

**Reporting year 2025 inventory:**
- **Coverage:** 0 in-window days, so `outOfWindow`. The strip reads "… not counted: Jan 2026."
- **`applyResolutions`:** **added in full** (no window filter).

**Monthly record:** one slice, `period_month 2026-01-01`, `reporting_year 2026`, `pct_in_month 1`.

**If this bill and Scenario A's Bill 2 are both confirmed for the same fuel at the same location:**
- They cover identical days, so an overlap pair is raised (engine.ts:1784-1790), and coverage shows
  "month(s) covered by more than one bill".
- The duplicate resolution applies no adjustment ("overlapping bills accepted as-is; no double-count
  adjustment applied", engine.ts:2888, 2903).
- Both quantities are therefore summed in the annual figure, and each produces its own January slice in the
  monthly records.
