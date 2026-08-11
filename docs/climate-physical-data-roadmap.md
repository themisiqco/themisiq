# Physical hazard data — source, granularity and roadmap

**Decisions recorded 11 August 2026. No code changes follow yet.**

This file records what was decided about the data behind physical-risk scoring, and what
was left open. It is a decision record, not a specification: nothing here has been built,
and the numbers described in "The problem" are what the paid product is running on today.

---

## The problem

`mr_region_hazards` holds **65 rows**. Every one carries provenance `starter`, and every
`source_ref` reads *"pending transcription from IPCC AR6 WGI Ch12 + ThinkHazard/Aqueduct
baseline"*. That sentence has been true for long enough to be worth stating plainly: the
transcription has not happened, and the Climate Risk module is a paid product running on
values that say so about themselves.

**Coverage is 65 of a possible 160** — 20 regions × 8 hazards, 41%.

- No hazard covers more than **17 of 20** regions.
- `cold` covers **2**.

A missing cell is not silent — the 14 July fix made it render as *not assessed* rather than
vanish — so the gaps are disclosed. They are still gaps.

### The geography is coarser than the product implies

Regions are **IPCC AR6 WGI reference-region polygons**, not country borders. `WNA` spans
California to the Rockies plus south-western Canada and north-western Mexico. A hazard score
attributed to it is a statement about that whole area.

**25 of AR6's ~45 land regions are absent entirely**, including **all of South America**. A
target in Brazil, Argentina, Chile, Colombia or Peru cannot be screened at all.

---

## Decisions

### 1 · Source — World Bank Climate Change Knowledge Portal

**Licence: CC BY 4.0.** It explicitly permits commercial use with attribution. The one
binding condition beyond attribution is that the work **must not imply World Bank
endorsement** — so attribution copy names the source and says nothing more.

**What it is:** downscaled CMIP6 at **0.25°**, covering **1950–2100**, drawing on **~30
models** across **5 SSPs**, exposing **70+ precomputed indices** defined per ETCCDI.

**How it is obtained:** available on the **AWS Registry of Open Data** — no account, no
egress charge — and published both as global gridded data and pre-aggregated to national,
subnational, watershed and EEZ boundaries.

That last point is what makes the granularity decision below possible without building an
aggregation pipeline.

### 2 · Granularity — both

**Grid for site-level. Subnational for jurisdiction-level screening.** CCKP publishes both,
so this is a choice about which to read when, not about which to acquire.

### 3 · Index mapping — CCKP covers two of eight hazards cleanly

| Hazard | CCKP index | Status |
|---|---|---|
| **heat** | `hi35` — heat index days above 35 °C | **DIRECT** |
| **drought** | `cdd` — maximum consecutive dry days | **DIRECT** |
| **flood** | `rx1day` / `r50mm` | **PROXY** — pluvial only. River flood needs catchment, topography and defences |
| **water** | — | **GAP** — supply against demand is not a climate index. Candidate: WRI Aqueduct |
| **coastal** | — | **GAP** — needs elevation and defences |
| **wildfire** | — | **GAP** — candidate: Copernicus Fire Weather Index |
| **cyclone** | — | **GAP** |
| **permafrost** | — | **GAP** |

**Two direct, one proxy, five gaps.** A single-source transcription is not available for this
taxonomy, and choosing CCKP does not change that — it closes two hazards properly and puts a
labelled proxy under a third.

### 4 · Provenance must be per-hazard, not per-table

This follows directly from the table above, and it is the decision with the widest reach.

After transcription, `heat` and `drought` would be `primary_source` against a named CCKP
index; `flood` would be `primary_source` against a **proxy** index and must say so; the five
gap hazards would remain `starter` or become `expert_judgment`. A single provenance statement
covering `mr_region_hazards` as a whole could not be true of all eight.

**Consequence for the report.** `summariseProvenance` already counts per row and publishes
distinct `source_ref` values under *Data provenance*, so the mechanism exists. What changes is
that the mix within one table becomes meaningful, and a reader comparing two assessments will
see different provenance profiles depending on which hazards their sector is sensitive to.

---

## Deals module — progressive refinement

Physical screening in Deals sharpens as the buyer learns more about the target. Two levels,
and **the report must distinguish them**.

**Screen level.** Jurisdiction only, as today. Physical risk read at **subnational** scale
and labelled as such.

**Site level.** The buyer adds sites with coordinates as they learn them. The assessment
sharpens, and the report **names which sites drove which hazard**.

> A "high heat" derived from a country average and a "high heat" derived from thirty pinned
> sites are different claims. The report must not present them identically.

### Multiple sites — maximum scores, distribution reports

**The MAXIMUM drives the score.** Never understate in diligence.

**The DISTRIBUTION drives the reporting.** *"4 of 30 sites high, concentrated in Andalusia"*
is actionable where *"high"* is not.

These are two outputs from one calculation, not a choice between them.

### Two different notions of place

**Deals collects `location_count` as a bare integer and knows nothing about where.** It drives
GHG tier pricing and consultant-range scaling; it carries no geography.

**Climate Risk has a full Location model** — AR6 region selection, multi-select, with an asset
profile modifying hazard exposure.

**These would need reconciling.** They are not the same field at different resolutions; they
are two different questions that happen to share a word.

---

## What remains open

1. **Site input mechanism** — whether a map picker or coordinate entry.
2. **Sources for the five gap hazards** — water, coastal, wildfire, cyclone, permafrost.
   Aqueduct and the Copernicus Fire Weather Index are candidates, not decisions.
3. **Calibration of the 0–3 ordinal from a continuous index** — and specifically whether band
   edges are **absolute** or **relative to the global distribution**. An absolute threshold and
   a percentile threshold answer different questions and will disagree most in the regions
   where the data is thinnest.
4. **Whether subnational units replace AR6 regions or sit alongside them.**

---

## Out of scope — the sensitivity table

**`mr_industry_hazards` is unaffected by everything above.** It stays expert judgement.

It is the **intersection** — how a hazard reaches a sector — that no vendor supplies, and that
CCKP by construction cannot: CCKP describes climate, not what a sector does with it. The
rubric in methodology §4.1a governs it, and the disclosure is the control rather than the
sourcing.

**63 of 104 cells are still empty.** That is a separate piece of work with a separate method,
and no amount of hazard data closes it.
