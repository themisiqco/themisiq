# Factor year selection for non-calendar reporting years

Research for finding F-12 (docs/review/ghg-findings.md, "Related but distinct", item 2). Read-only: no code changed.
Written 1 Oct 2026 against HEAD de782a6 (T3 committed; T3a not applied). If T3a is applied, engine.ts line numbers
after about line 1665 move down by 16.

## 1. The problem

`reporting_year` is the calendar year in which the reporting window ends (lib/ghg/engine.ts:1659,
`new Date(reportingYear, m, 0)`). Every year-keyed factor is chosen from the bare `reporting_year`, never from
the window. The fiscal year-end month reaches only the coverage window (`buildWorkings` and
`findUnresolvedCoverage`), never a factor selector. So reporting year 2025 with a March year end
(1 Apr 2024 to 31 Mar 2025) is priced with 2025 factors, although 275 of its 365 days are in 2024.

All three year-keyed selectors pick the newest key at or below the reporting year. Below every key they move
forward to the earliest key and say so in a note:

| Selector | Location |
|---|---|
| `getGridFactor` | engine.ts:1120-1135 (rule at 1128-1130) |
| `getResidualFactor` | engine.ts:1170-1238 (rule at 1180, 1200, 1214) |
| `nzTdLoss` | engine.ts:993-1006 (rule at 995) |

## 2. Ruling recorded (1 Oct 2026)

> For DESNZ, "newest set of available factors" means the newest edition published on or before the last day of
> the reporting window. Each edition's publication date must be recorded with its source (the publication's own
> page or release notes), and an edition with no recorded date is never selected. The same interpretation
> applies to any other publisher whose guidance uses "available", "latest" or "most recent" wording; each such
> application is flagged below for confirmation.

**Superseded in part by the second set of rulings (section 8).** The DESNZ reading above stands. Its application
to eGRID (flag E1) is replaced by class (b). The flags in sections 4 and 5 are answered in section 8.

## 3. The fallback rule, and what it gives

**The rule.** Where a publisher gives no guidance, use the factor year that contains the majority of the
reporting window. A tie goes to the year in which the window ends.

For reporting year Y with year-end month m, the window runs from the 1st of month m+1 in Y-1 to the last day of
month m in Y. Days falling in Y run from 1 Jan to the end of month m:

| Year end | Days in Y | Days in Y-1 | Majority factor year |
|---|---|---|---|
| December | 365 or 366 | 0 | **Y** (no change from today) |
| March | 90 or 91 | 275 | **Y-1** |
| June | 181 or 182 | 184 | **Y-1** (narrowly) |
| September | 273 or 274 | 92 | **Y** |

**A tie cannot occur for a window that ends on a month end.** A tie needs exactly 183 days on each side. The
day count from 1 Jan to a month end is never 183: June ends on day 181 or 182, July on 212 or 213. The tie
rule is therefore never exercised, but it is kept so the rule is complete.

**The rule picks a calendar year, not an edition.** For each publisher, section 4 states what "factor year"
means. Some publishers name editions by data year, some by publication year, and NGA by a July to June
reporting cycle. Where that mapping is not stated by the publisher, it is flagged.

## 4. Per publisher

Quotes are verbatim and under 15 words. Every quote below was checked against the downloaded text of the
source, not a search snippet, except where marked.

### 4.1 DESNZ (UK): grid electricity, combustion, steam

**Guidance exists.** Source: *Greenhouse gas reporting: conversion factors 2025*, full set (xlsx),
"Introduction" tab.
URL: https://assets.publishing.service.gov.uk/media/6846a4f55e92539572806125/ghg-conversion-factors-2025-full-set.xlsx

| What it says | Quote |
|---|---|
| Calendar years | "factors labelled as 2024 should be used for data from calendar year 2024" |
| April to March years | "If you are reporting on an April to March year" |
| Its example for that case | "the 2024 factors should be applied to data in reporting year 01/04/24 – 31/03/25" |
| July to June years | "should apply the newest set of available factors" |
| Alternative: blending | "uses the specific number of days that fall within each conversion factor period" |
| Whichever is chosen | "The approach utilised should be clearly stated and consistently applied" |

**Data year.** The methodology paper (§3.10) says the reporting year "is two years ahead of the data year".
URL: https://assets.publishing.service.gov.uk/media/6846b0870392ed9b784c0187/2025-GHG-CF-methodology-paper.pdf

**Publication dates (needed for the July to June case under the ruling).** Each date is the
`first_published_at` of the edition's own GOV.UK page, read from the GOV.UK content API
(https://www.gov.uk/api/content/government/publications/greenhouse-gas-reporting-conversion-factors-{year}).
Human-readable page: https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-{year}.

| Edition | First published | Later corrections (page change history) |
|---|---|---|
| 2022 | 22 Jun 2022 | 20 Sep 2022: flat file heading corrected |
| 2023 | 7 Jun 2023 | 28 Jun 2023: a small number of factors updated |
| 2024 | **8 Jul 2024** | 30 Oct 2024: rounding error corrected |
| 2025 | 10 Jun 2025 | none |
| 2026 | 11 Jun 2026 | 31 Jul 2026: flat-file values first reported as 0 corrected |

⚑ **FLAG D1: conflicting 2024 date.** The 2024 page's first-published date is 8 Jul 2024, but its own
30 Oct 2024 change note refers to "the conversion factors 2024 tables published in June". Under the ruling,
this decides whether a year ending 30 Jun 2024 gets the 2024 or the 2023 edition. The table below uses 8 Jul,
the recorded first-published date. Confirm which date to record.

⚑ **FLAG D2: corrections.** The ruling keys on publication. It does not say whether a correction published
after the window ends (2024, 2026) changes anything. The table below uses first publication only.

**Proposed rule (DESNZ):**

| Year end | Rule | Factor edition for reporting year Y | Example: Y = 2025 | Example: Y = 2024 |
|---|---|---|---|---|
| December | DESNZ calendar rule | Y | 2025 | 2024 |
| March | DESNZ majority approach (its own example) | Y-1 | 2024 | 2023 |
| June | Ruling: newest edition first published on or before 30 Jun Y | Y if published by 30 Jun Y, else Y-1 | **2025** (published 10 Jun 2025) | **2023** (2024 published 8 Jul 2024; see D1) |
| September | Not covered by DESNZ; majority fallback | Y | 2025 | 2024 |

⚑ **FLAG D3: September.** DESNZ's text names only calendar, April to March and July to June years. The
majority approach is phrased generally ("the calendar year in which the greatest portion of your data falls")
but introduced for April to March. September uses the fallback, which gives Y either way.

**Note on June.** DESNZ's own rule for July to June (newest available, normally Y) differs from the majority
fallback (Y-1, by 184 to 181 days). DESNZ guidance is followed, as the task specifies.

**What changes against today.**
- UK grid keys held: 2025 and 2026 (engine.ts:934; meaning stated at 926-931: the key is the workbook edition).
  - Today, every UK reporting year 2025 gets the 2025 key, whatever the year end.
  - Under the proposal, a March 2025 year end needs the 2024 edition, which is **not held**.
  - Today's forward fill would give 2025, an edition first published on 10 Jun 2025, after that window had ended.
- UK combustion (`EF_UK`, engine.ts:324) and steam have **no year dimension**: one 2026 edition prices every
  reporting year (engine.ts:298-299). DESNZ's guidance applies to all its factors, so for any year other than
  2026 the edition used is already not the one DESNZ directs, whatever the year end. Listed here; not part of
  the non-calendar question.

### 4.2 US EPA eGRID: US grid electricity

**Guidance exists, but not on non-calendar periods.** Source: "Frequent Questions about eGRID", question 11,
"What eGRID data year should be used?". URL: https://www.epa.gov/egrid/frequent-questions-about-egrid

| What it says | Quote |
|---|---|
| Ongoing work | "the best practice is to apply the most recent factors available at the time" |
| Several historical years at once | "aligning the data year with the reporting period is recommended" |
| No matching data year | "use the eGRID version preceding the inventory year" |
| Naming | "reflects the data year rather than the release year" (question 16) |

The word "fiscal" does not appear on the FAQ page, nor in the eGRID2023 Technical Guide
(https://www.epa.gov/system/files/documents/2025-01/egrid2023_technical_guide.pdf).
For non-calendar periods: **no guidance found.**

**Release dates.**
- From https://www.epa.gov/egrid/historical-egrid-data: eGRID2021 released 1/30/2023; eGRID2022 released 1/30/2024.
- From https://www.epa.gov/egrid/download-data (eGRID2023):
  - "Released: 1/15/2025"
  - "Revision 1 Released: 1/17/2025"
  - "Revision 2 Released: 6/12/2025"
- No release date was recorded for eGRID2024. Under the ruling it is never selected.

⚑ **FLAG E1: the ruling applied to "most recent factors available".** For ongoing work, the factor is the newest
eGRID edition released on or before the last day of the window. Confirm.

⚑ **FLAG E2: which eGRID mode applies.** eGRID gives two answers:
- **"ongoing work"**: the newest released by the window end (ruling).
- **"historical years"**: match the data year to the reporting period.

These differ sharply, because eGRID data year N is released about 13 months after year N ends. A customer
completing past years would get different factors from one reporting the current year. Confirm which mode
ThemisIQ applies, or whether it depends on when the inventory is prepared. The table shows both. In historical
mode, the data year is chosen by the majority fallback.

⚑ **FLAG E3: which revision date counts.** The code cites Revision 2 (engine.ts:1232). If availability is the
Revision 2 date (12 Jun 2025), a window ending before that date may not select eGRID2023 Rev2.

| Year end (Y = 2025) | Window end | Ongoing (ruling, first-release dates) | Historical (majority data year) |
|---|---|---|---|
| December | 31 Dec 2025 | eGRID2023 (eGRID2024 date not recorded) | 2025 (not published) → preceding: eGRID2024 if dated, else eGRID2023 |
| March | 31 Mar 2025 | eGRID2023 (released 15 Jan 2025) | 2024 → eGRID2024 (no date recorded) |
| June | 30 Jun 2025 | eGRID2023 | 2024 → eGRID2024 (no date recorded) |
| September | 30 Sep 2025 | eGRID2023 | 2025 → as December |

For Y = 2024 in ongoing mode, a December 2024 window ends before eGRID2023 was released, so the rule selects
**eGRID2022**, which is not held. Only eGRID2023 is held (`GRID_EF` US keys 2023 only, engine.ts:909-923).

### 4.3 US EPA GHG Emission Factors Hub: US combustion and steam

**No guidance found.** Searched for "fiscal", "inventory year", "reporting year", "calendar", "most recent" and
"data year". Checked:
- https://www.epa.gov/climateleadership/ghg-emission-factors-hub
- https://www.epa.gov/system/files/documents/2025-01/ghg-emission-factors-hub-2025.pdf
- https://www.epa.gov/climateleadership/scopes-1-and-2-emissions-inventorying-and-guidance

The Hub states no data year in words. Its 2025 edition cites "EPA eGRID2023, January 2025".

**Proposed rule:** majority fallback on the Hub's edition year. ⚑ **FLAG H1:** the Hub labels editions by
publication year. Whether the majority calendar year should map to the edition year is not stated by EPA.
Confirm.

**What changes:** nothing today. US combustion (`EF`) has no year key; one edition prices every year
(engine.ts:755, edition flagged unverified at 65-71). The rule takes effect only if more than one Hub edition is
held.

### 4.4 ECCC (Canada): provincial grid electricity, combustion

**Guidance found, but it is for the offset system, not corporate reporting.** Source: *Emission factors and
reference values*, Version 4.0, September 2026.
URL: https://www.canada.ca/en/environment-climate-change/services/climate-change/pricing-pollution-how-it-will-work/output-based-pricing-system/federal-greenhouse-gas-offset-system/emission-factors-reference-values.html

| Section | Quote |
|---|---|
| §3.2, timing | NIR factors "apply to the quantification of GHG reductions that occur in the subsequent calendar year" |
| §3.2, scope | "only applicable for projects in Canada" (the offset credit system) |
| §1.0, version | "proponents must use the latest version of this document" |

Every table names the calendar years it applies to. "Fiscal" does not appear on the page. For corporate
non-calendar reporting: **no guidance found.**

NIR Part 3, Annex 13 (electricity intensity tables) was **not checked**: the publications.gc.ca link returned a
landing page, not the PDF.

**Proposed rule:** majority fallback on the applicability year each table states.

⚑ **FLAG C1: "latest version".** This uses "latest" wording, but it is addressed to offset-system proponents
and governs which version of the document to use, not which year's table. Applying the ruling would mean the
newest version published on or before the window end. I have **not** applied it, because the publisher limits
the guidance to the offset system. Confirm.

⚑ **FLAG C2: what the keys mean.** The code holds keys 2024, 2025 and 2026 (engine.ts:896-908). Its comments
name ECCC "applicability sets (2023/24, 2025, 2026)" (engine.ts:226, 276), so key 2024 probably stands for
the 2023/24 set. The code never states this.

| Year end (Y = 2025) | Factor year | Held? | Today |
|---|---|---|---|
| December | 2025 | yes | 2025 |
| March | 2024 | yes (if key 2024 = the 2023/24 set) | 2025 |
| June | 2024 | yes | 2025 |
| September | 2025 | yes | 2025 |

ECCC combustion (`EF_CA`, engine.ts:241) holds factors that are the same across the three applicability sets
(engine.ts:226-228), so it is unaffected.

### 4.5 AIB European Residual Mixes: EU market-based (EEA for location-based)

**No guidance found.** Checked:
- The 2024 results PDF, searched for fiscal, financial year, reporting year, latest and most recent:
  https://www.aib-net.org/sites/default/files/assets/eecs/Residual%20Mix/2024_Final%20_Residual%20mix%20calculation%20results_11082025.pdf
- https://www.aib-net.org/facts/european-residual-mix (read through a summarising fetcher)

What the edition describes:
- PDF title page: "Results of the calculation of Residual Mixes for the calendar year 2024".
- The PDF names a transaction window "(1.4.2024 – 31.3.2025)" for guarantee-of-origin disclosure of 2024
  consumption. That is AIB's own accounting window, not advice to reporters.

Publication dates (summarising fetcher only, not verified verbatim): 2024 edition 30 May 2025; 2025 edition
28 May 2026. They are not needed under the ruling, because AIB uses no "available" wording.

**EEA (EU location-based grid):** EEA's own pages were not searched separately. **No guidance found** is
recorded on that basis, with the gap stated. The code key (2023, engine.ts:935) is not stated to be a data or
an edition year.

**Proposed rule:** majority fallback on the calendar year the edition describes.

| Year end (Y = 2025) | AIB factor year | Held? (`RESIDUAL_EU` 2024 only, engine.ts:1028-1039) | Today |
|---|---|---|---|
| December | 2025 | no | 2024, "latest vintage held" |
| March | 2024 | yes | 2024, "latest vintage held" |
| June | 2024 | yes | 2024, "latest vintage held" |
| September | 2025 | no | 2024, "latest vintage held" |

EEA grid: only 2023 is held, so every case resolves to 2023 today and under the proposal. Only the note would
change.

### 4.6 Green-e Residual Mix (US market-based)

**No guidance found.** Checked:
- https://resource-solutions.org/2021-residual-mix/, /2023-residual-mix/, /2024-residual-mix/, /2025-residual-mix/
- The 2023 and 2025 release news posts (summarising fetcher)

| What it says | Quote |
|---|---|
| Data basis | "from two calendar years prior and the most recent U.S. generation and emissions rate" |
| The only use instruction | "Users reporting their GHG data should cite the use of these residual mix rates" |

Pages are titled, for example, "2025 Residual Mix Emissions Rates (2023 Data)". CRS never says which reporting
year an edition is for. A search result claiming users are "not expected to update accounting each time" was
**not** found on any fetched page and is not relied on.

⚑ **FLAG G1: "most recent" in the data-basis sentence.** It describes what CRS built the rates from, not what
users should select, so the ruling is **not** applied. Confirm.

⚑ **FLAG G2: what "factor year" means for Green-e.** It could be the edition year (2025) or the data year
(2023). The code keys by data year (`RESIDUAL_US` 2023 only, engine.ts:1045-1073; engine.ts:1221 "2023 is the
DATA year, and the edition is 2025") and builds the label with a hard-coded +2 (engine.ts:1231). Under the
majority rule, a March 2025 year end gives 2024, which means either edition 2024 (2022 data) or data year 2024
(edition 2026). These are different tables. Decide before implementing.

Only one key is held, so today and under either reading every case resolves to the 2023-data table; only the
note changes.

### 4.7 DCCEEW National Greenhouse Accounts (Australia): grid, residual mix, combustion

**No edition-selection guidance found.** Source: *National Greenhouse Accounts Factors 2025*, read from the
Wayback snapshot of 16 Nov 2025 (dcceew.gov.au timed out):
https://web.archive.org/web/20251116140703/https://www.dcceew.gov.au/sites/default/files/documents/national-greenhouse-account-factors-2025.pdf

| Section | Quote |
|---|---|
| §1, emission factor timing | "issued for the 2025-26 NGER reporting cycle" |
| §1, data basis | "which make use of NGER reporting data for the 2023-24 cycle." |
| Table 1 notes | "Data are for financial years ending in June." |
| Appendix 4 | "RMF is the residual mix factor for the financial year" |

Not verified, not relied on: a search result saying factors "from the year before should be applied to the
following year's emissions". It is not in the 2025 PDF.

⚑ **FLAG A1: factor year is a July to June cycle, not a calendar year.** The majority rule as written counts
calendar years. For NGA it would have to count NGER financial years. For a June year end, the window is exactly
one cycle. But the PDF does not say whether "issued for the 2025-26 NGER reporting cycle" means activity in
2025-26 or reports lodged in 2025-26, so which edition matches a given window is **not established**. Decide
how to map before implementing.

⚑ **FLAG A2: "This issue supersedes previous issues"** (landing page, summarising fetcher). This is not
"available", "latest" or "most recent" wording, so the ruling is not applied.

Only 2025 is held for grid (engine.ts:950-952), for the residual mix factor (`RESIDUAL_AU`, engine.ts:1094,
keyed by edition per 1092) and for combustion. So nothing resolves differently today; only the note changes.

### 4.8 MfE (New Zealand): grid electricity, T&D losses, combustion

**No edition-selection guidance found.** Source: *Measuring emissions: a guide for organisations*, 2026 catalogue,
https://measuringemissionsguide.environment.govt.nz/ (pages 1_about and 2_how_to), and the 2025 catalogue PDF:
https://measuringemissionsguide.environment.govt.nz/files/Measuring-Emissions-Catalogue-2025-v3.pdf

| Source | Quote |
|---|---|
| 2025 PDF §2.1 | "measurement period (ie, calendar or financial year)" |
| 2026 site, how-to | "Emission factors will be updated annually, when more recent data is available." |
| 2026 site, about | data for "these emission factors is from 2024, unless otherwise mentioned" |

Electricity factors are published as a dated annual series (Table 5.2) and by calendar quarter (Table 5.3).
Quarters would allow an exact match to a year ending 31 March or 30 June, but MfE does not say to use them.

⚑ **FLAG M1: "when more recent data is available".** This describes MfE's update schedule, not user selection,
so the ruling is **not** applied. Confirm.

**Proposed rule:** majority fallback on the year of the annual series.

| Year end (Y = 2025) | Factor year | Held? (`NZ` 2023, 2024, 2025, engine.ts:955) | Today |
|---|---|---|---|
| December | 2025 | yes | 2025 |
| March | 2024 | yes | 2025 |
| June | 2024 | yes | 2025 |
| September | 2025 | yes | 2025 |

**T&D losses:** `NZ_TD_LOSS` holds 2025 only (engine.ts:961, keyed by applicability year per 999). A March or
June 2025 year end would need 2024, which is not held.

## 5. Decisions this research cannot settle

*Answered by the rulings in section 8; kept as written for the record.*

1. **The selected edition is not held.** This happens to UK March 2025, eGRID 2024 in ongoing mode, AIB
   Dec/Sep 2025 and NZ T&D March/June 2025. Today the code moves to the nearest held key, forward if
   necessary. A forward move can select an edition published after the window ended. For DESNZ June, that is
   exactly what the ruling forbids. Options: block and flag for manual review; fall back only backward; or keep
   today's behaviour with a disclosure. Not chosen here.
2. Flags D1, D2, D3, E1, E2, E3, H1, C1, C2, G1, G2, A1, A2 and M1 above.
3. **DESNZ's blended approach** (days-weighted across two editions) is permitted by DESNZ. It is not proposed,
   because the task's rule is majority. It would be the more exact choice for June (184 against 181 days) and is
   recorded as an option.

## 6. Code locations involved

Line numbers are at HEAD de782a6.

**Selectors (need the window, or a factor year derived from it, in place of `year`):**
- engine.ts:1120-1135 `getGridFactor`; the unknown-region fallback at 1126 has no year.
- engine.ts:1170-1238 `getResidualFactor` (EU 1176-1194, AU 1198-1209, US 1211-1237).
- engine.ts:993-1006 `nzTdLoss`.

**Tables whose key meaning must be stated per publisher:**
- `GRID_EF` engine.ts:894-956: ECCC 896-908, eGRID 909-923, UK 934, EEA 937-944, AU 950-952, NZ 955.
- `RESIDUAL_EU` 1028-1039, `RESIDUAL_US` 1045-1073, `RESIDUAL_AU` 1094; `NZ_TD_LOSS` 961.
- **New:** a table of edition publication dates with source URLs, needed by the ruling for DESNZ and, if E1 is
  confirmed, eGRID.

**Callers that pass `reporting_year` today and would pass the window:**
- engine.ts:
  - `calcLocation` 2603 (calls at 2652, 2667, 2676)
  - `calcInventory` 2769
  - `fuelEmissionsByType` 2796 (call at 2822)
  - `pctEstimated` 2836
  - `publishersForLocation` 2515 (call at 2526; it calls `buildWorkings` at 2521 with no fiscal month)
  - `findUnpriceableLocations` 2756
  - `buildWorkings` 3320 (window already built at 3322; selector calls at 3537, 3544, 3566)
- lib/ghg/factorEditions.ts: `buildFactorEditions` 223 (call at 288).
- lib/ghg/monthlyEmissions.ts:217: `deps.getGridFactor(..., reportingYear)`, no fiscal month.
- lib/ghg/loadSeries.ts:133: `findUnpriceableLocations(locationsData)` with no year, so it defaults to 2024.
- app/dashboard/ghg/page.tsx call sites: 1348, 1370, 1430, 1634, 1647, 1656, 1676-1679, 2068, 2668, 2676, 3089,
  3163, 3195. `inventory.fiscal_year_end_month` is in scope at all of them.

**Display strings that would state the wrong year:**
- page.tsx:2022, 2283-2284: grid factor shown in the wizard.
- page.tsx:2271-2278: hard-coded edition labels. "NZ MfE 2026" never matches the NZ key actually used.

**Notes and disclosures:**
- engine.ts:1003-1004, 1133-1134, 1148-1149: the "applied to {year} inventory" notes.
- app/methodology/page.tsx:67, 71.
- lib/ghg/factorEditions.ts:444-465 `FACTOR_EDITION_DISCLOSURE`.
- lib/assurancePdf.ts:278, 283.
- page.tsx:3164 (XLSX).

## 7. Disclosure text needed

These are drafts. They would use `reportingYearLabel` from T3a, so a December year reads "reporting year 2025"
and any other year reads "the year ending 31 March 2025".

**Methodology page** (app/methodology/page.tsx, new paragraph after 67 and a sentence in 71):

> Where a reporting year does not follow the calendar year, each factor comes from the year its publisher
> directs. For UK (DESNZ) factors: a year ending in March uses the factors for the calendar year in which it
> starts, as DESNZ directs; a year ending in June uses the newest DESNZ factors published on or before its last
> day. Where a publisher gives no direction, we use the factor year that contains most of the reporting year:
> the earlier calendar year for a year ending in March or June, and the later one for a year ending in
> September or December. Each workings row states the factor year used and why.

**Workings and verifier notes** (replacing engine.ts:1133-1134, 1148-1149 and 1003-1004 where the rule
applies):
- Majority: "Grid factor for 2024 applied to the year ending 31 March 2025: 2024 contains 275 of its 365 days."
- DESNZ March: "DESNZ 2024 factors applied to the year ending 31 March 2025, following DESNZ guidance for April
  to March years."
- DESNZ June: "DESNZ 2025 factors (published 10 June 2025) applied to the year ending 30 June 2025: the newest
  published on or before its last day, following DESNZ guidance for July to June years."
- eGRID, ongoing (if E1 is confirmed): "eGRID2023 (released 15 January 2025) applied to the year ending
  31 March 2025: the newest released on or before its last day, following EPA guidance."
- Not held (wording depends on decision 1): the note must name the factor year the rule selected, the year
  actually used, and why.

**Assurance PDF:** the methods table (lib/assurancePdf.ts:259) would need the window and the factor-year rule,
not only "Reporting year 2025" (F-12).

## 8. Rulings, second set (1 Oct 2026)

### 8.1 Rulings as given

1. **Two dataset classes.**
   - **(a) Annual editions intended for the reporting year** (DESNZ, EPA Hub, NGA, MfE combustion).
     - Use the publisher's own rule where one exists (DESNZ only).
     - Otherwise use the majority rule, with ties going to the year in which the window ends.
   - **(b) Lagging data-year datasets** (eGRID, Green-e, AIB/EEA residual mix, ECCC grid intensities).
     - If an edition exists whose data year equals the reporting year, use it.
     - Otherwise use the newest edition available when the inventory is first prepared. That choice is frozen
       in the saved inventory with its selection date.
2. **D1:** accept 8 Jul 2024, the first-published date, for DESNZ 2024. **D2:** the rule selects the edition;
   the values come from its latest correction; publication and correction dates are recorded. The same applies
   to eGRID revisions.
3. **E1/E2:** eGRID follows class (b). This replaces the earlier "published by window end" ruling for eGRID.
4. **C1, G1, M1, A2:** none of these is "available" guidance, so the fallback applies.
5. **NGA:** check the NGA document's own introduction for which financial year it applies to, and quote it. If
   that is unclear, use the majority rule on the activity year.
6. **Green-e:** keyed by data year, class (b).
7. **Decision 1:** never substitute a different year, and remove nearest-year substitution. A missing required
   edition leaves the line unpriced, with a plain-language message and an export-blocking issue.

### 8.2 NGA (ruling 5)

Source: *National Greenhouse Accounts Factors 2025*, Wayback copy of the PDF (section 4.7 has the URL). This is
the NGA document; its §1.2 calls the previous issue "the 2024 NGA Factors Workbook". The xlsx workbook itself
was not read.

| Section | Quote |
|---|---|
| §1, "Emission factor timing" | "issued for the 2025-26 NGER reporting cycle" |
| §1, same paragraph | data used "are the latest available at the time of estimation" |
| Appendix 7 | "took effect on 1 July 2025" |
| Appendix 7, same sentence | "affect reports due by 31 October 2026 for the 2025–26 reporting year" |

**Reading.** The introduction does not state directly which financial year the factors apply to. It says the
issue "coincides with" a Determination issued for the 2025-26 cycle. Appendix 7 shows that the 2025-26
reporting year runs from 1 Jul 2025 to 30 Jun 2026. So the introduction is **unclear on the factors
themselves**, and ruling 5's fallback applies: the majority rule on the activity year.

I take the 2025 edition's activity year to be the cycle it is issued alongside, 1 Jul 2025 to 30 Jun 2026.
⚑ This mapping is my reading of §1 together with Appendix 7. **Confirm.**

The "latest available" in the second quote describes the data NGA used, not what users should select (as for
M1).

**Majority over NGA activity years.** Edition N covers 1 Jul N to 30 Jun N+1. For reporting year Y:

| Year end | Days in edition Y-2 / Y-1 / Y | NGA edition |
|---|---|---|
| December (Jan to Dec Y) | 0 / 181 or 182 / 184 | **Y** |
| March (Apr Y-1 to Mar Y) | 91 / 274 or 275 / 0 | **Y-1** |
| June (Jul Y-1 to Jun Y) | 0 / 365 or 366 / 0 | **Y-1** |
| September (Oct Y-1 to Sep Y) | 0 / 273 or 274 / 92 | **Y-1** |

### 8.3 Every dataset the engine uses, classified

| Dataset | Code | Class | Fits cleanly? |
|---|---|---|---|
| DESNZ grid electricity | `GRID_EF.UK` engine.ts:934 | (a), DESNZ rule | Yes |
| DESNZ combustion | `EF_UK` engine.ts:324 | (a), DESNZ rule | Yes |
| DESNZ steam | `STEAM_EDITION` UK, engine.ts:877-880 | (a), DESNZ rule | Yes |
| EPA Hub combustion | `EF` (engine.ts:755) | (a), majority | Yes. Held edition uncertain: label "US EPA 2024", values read from the 2025 workbook (engine.ts:65-71). |
| EPA Hub steam (Table 7) | `STEAM_EDITION` US | (a), majority | Yes |
| NGA grid electricity | `GRID_EF.AU_*` engine.ts:950-952 | (a), majority on activity year (8.2) | Yes, with the 8.2 mapping |
| NGA residual mix factor | `RESIDUAL_AU` engine.ts:1094 | (a), as NGA grid | Yes |
| NGA combustion | `EF_AU` engine.ts:622 | (a), as NGA grid | Yes |
| MfE combustion | `EF_NZ` engine.ts:672 | (a), majority | Yes |
| eGRID grid electricity | `GRID_EF` US states, engine.ts:909-923 | (b) | Yes |
| Green-e residual mix | `RESIDUAL_US` engine.ts:1045-1073 | (b), data year | Yes |
| AIB residual mix | `RESIDUAL_EU` engine.ts:1028-1039 | (b) | Yes |
| ECCC grid intensities | `GRID_EF` CA provinces, engine.ts:896-908 | (b) | **No.** See below. |
| EEA grid electricity (EU, location-based) | `GRID_EF.EU_*` engine.ts:937-944 | (b) by analogy | **No.** See below. |
| MfE grid electricity | `GRID_EF.NZ` engine.ts:955 | not named in the ruling | **No.** See below. |
| MfE T&D losses | `NZ_TD_LOSS` engine.ts:961 | not named in the ruling | **No.** See below. |
| ECCC combustion | `EF_CA` engine.ts:241, `EF_CA_NG_CO2_M3` 281 | not named in the ruling | **No.** See below. |
| ECCC mobile | lib/ghg/mobile.ts:72 `EDITION = 'NIR 2026 (1990-2024)'` | not named in the ruling | **No.** See below. |
| IPCC 2006 defaults (EU combustion) | `EF_EU` engine.ts:503 | neither | **No.** See below. |

**The ones that do not fit cleanly, with a recommendation each:**
- **ECCC grid intensities.**
  - The code keys them by applicability set (2024, 2025, 2026), not by data year (flag C2).
  - Class (b) needs the NIR consumption-intensity series by data year (NIR Part 3, Annex 13), which was not
    fetched.
  - *Recommend:* re-key by data year from Annex 13, recording the NIR edition. This is T3d work.
- **EEA grid.**
  - The ruling names "AIB/EEA residual mix", but EEA supplies our location-based EU grid factor, not a residual mix.
  - It is a lagging data-year series, and EEA's own pages were not researched.
  - *Recommend:* class (b).
- **MfE grid and T&D losses.**
  - Both are published inside MfE's annual edition, which is class (a) in form.
  - The values are a dated series by year (Table 5.2; T&D keyed by applicability year at engine.ts:999), which
    is class (b) in substance.
  - *Recommend:* class (b), keyed by the year of the series row, with the edition recorded. Each year's row is
    then used for that year.
- **ECCC combustion.**
  - The seeded values are identical across the three applicability sets (engine.ts:226-228), so either class
    gives the same numbers.
  - *Recommend:* class (a), majority on applicability year, so the edition recorded is right.
- **ECCC mobile.**
  - The NIR is a lagging inventory (edition N has data to N-2) but is held as one fixed edition.
  - *Recommend:* class (b).
- **IPCC 2006 defaults.**
  - These are methodological defaults with no annual edition.
  - *Recommend:* exempt from both classes, disclosed as a fixed default, never "missing".

### 8.4 Editions the rules require: reporting years 2024 to 2026

Class (b) is shown as it would resolve for an inventory first prepared on 1 Oct 2026, using editions whose
publication is recorded. "Load" means the edition exists but is not held. "Not published" means no publication is
recorded, so the line stays unpriced until it is.

⚑ **Class (b) reads "reporting year" as the bare `reporting_year`.** That is how the ruling reads. The year end
then does not affect class (b). For a March year end, a data-year match therefore picks the year holding only 25%
of the window. The alternative is the majority year, as in class (a). *Recommend:* use the majority year, for
consistency with class (a). **Confirm.** The tables show the literal reading, with the majority reading noted
where it differs.

**Class (a)**

| Dataset | Y | Dec | Mar | Jun | Sep | Held today | To load |
|---|---|---|---|---|---|---|---|
| DESNZ (grid, combustion, steam) | 2024 | 2024 | 2023 | 2023 (2024 published 8 Jul 2024) | 2024 | grid 2025, 2026; combustion and steam 2026 | grid 2023, 2024; combustion and steam 2023, 2024, 2025 |
| | 2025 | 2025 | 2024 | 2025 (published 10 Jun 2025) | 2025 | | |
| | 2026 | 2026 | 2025 | 2026 (published 11 Jun 2026) | 2026 | | Check that held 2026 values reflect the 31 Jul 2026 correction (ruling 2) |
| EPA Hub (combustion, steam) | 2024 | 2024 | 2023 | 2023 | 2024 | one combustion edition (2024 or 2025, unverified); steam 2025 | 2023, 2024, 2025 for both, once the held edition is identified |
| | 2025 | 2025 | 2024 | 2024 | 2025 | | |
| | 2026 | **2026: not published** | 2025 | 2025 | **2026: not published** | | 2026 when published (newest listed on the Hub page when checked: 2025) |
| NGA (grid, residual mix, combustion) | 2024 | 2024 | 2023 | 2023 | 2023 | 2025 | 2023, 2024 |
| | 2025 | 2025 | 2024 | 2024 | 2024 | | |
| | 2026 | **2026: not checked** | 2025 | 2025 | 2025 | | 2026 if published |
| MfE combustion | 2024 | 2024 | 2023 | 2023 | 2024 | 2026 v2 | 2023, 2024, 2025 |
| | 2025 | 2025 | 2024 | 2024 | 2025 | | |
| | 2026 | 2026 | 2025 | 2025 | 2026 | | |

**Class (b)** (the same for every year end under the literal reading)

| Dataset | Y = 2024 | Y = 2025 | Y = 2026 | Held today | To load |
|---|---|---|---|---|---|
| eGRID | eGRID2023 (no 2024 data year recorded) | eGRID2023 | eGRID2023 | eGRID2023 Rev2 | none |
| Green-e | 2025 edition (2023 data) | same | same | 2023 data | none (a 2026 edition was not checked) |
| AIB | 2024 | 2025 (published 28 May 2026, date not verified) | 2025 (no 2026 data year) | 2024 | 2025 |
| | *majority reading: Mar/Jun 2023* | *Mar/Jun 2024* | *Mar/Jun 2025* | | *majority reading adds 2023* |
| EEA grid | not researched | not researched | not researched | 2023 | research in T3d |
| ECCC grid | data year 2024 (NIR 2026, ECCC v4.0) | newest: data year 2024 | newest: data year 2024 | v3.0 applicability sets (data to 2023) | NIR 2026 series, re-keyed by data year |
| MfE grid (recommended (b)) | 2024 | 2025 | 2025 (newest row) | 2023, 2024, 2025 | none |
| | *majority reading: Mar/Jun 2023* | *Mar/Jun 2024* | *Mar/Jun 2025* | | |
| MfE T&D (recommended (b)) | 2024 if in the series (not checked) | 2025 | 2025 | 2025 | 2024, if published |

### 8.5 Flags D3, H1, C2

- **D3 (DESNZ, September year end):** use the majority fallback, which gives Y. DESNZ is silent on September,
  and ruling 1(a) already covers it. No further decision needed.
- **H1 (EPA Hub edition year):** treat Hub edition N as intended for activity year N, as ruling 1(a) does. Say
  so on the methodology page as our reading, since EPA does not state it.
- **C2 (ECCC key meaning):** answered by ruling 1(b). Re-key ECCC grid by NIR data year from Annex 13, and drop
  the applicability-set keys. The existing keys were never labelled, which is why this was a question.

### 8.6 Rulings, third set (1 Oct 2026)

- **NGA reading confirmed:** edition N covers activity from 1 July N to 30 June N+1 (section 8.2).
- **Class (b) uses the majority year.** The section 8.4 flag is answered. In the class (b) table, the rows
  marked "majority reading" are the rule for March and June year ends; the literal reading no longer applies.
- **All six section 8.3 recommendations accepted.** IPCC 2006 defaults are exempt from selection and are
  disclosed as fixed defaults.
- **D3, H1, C2 accepted as recommended** (section 8.5).
- **An unpublished edition blocks**, with a message saying the factors for that year have not been published
  yet.
- **Sequencing:**
  - T3b, T3c and T3d move to a separate branch, `factor-years`, created from main after derived-figures
    merges.
  - In T3d, editions for reporting year 2025 are loaded first, then 2024, then 2026.
